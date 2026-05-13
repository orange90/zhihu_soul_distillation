import type { VercelRequest, VercelResponse } from '@vercel/node'
import { badRequest, json, readBody, serverError, unauthorized } from './_lib/http.js'
import { readSession } from './_lib/session.js'
import { chatCompletion, extractFirstJson, searchByAuthor, type ZhihuSearchAnswer } from './_lib/zhihu.js'
import { getSupabase, SKILLS_TTL_MS } from './_lib/supabase.js'
import type { AuthorSkills } from './_lib/types.js'

const MAX_AUTHORS = 5

type IncomingAuthor = {
  id: string
  name: string
  avatar_url?: string
  headline?: string
}

function buildExtractPrompt(name: string, answers: ZhihuSearchAnswer[]) {
  const lines = answers
    .slice(0, 10)
    .map((a, i) => `${i + 1}. ${a.title}：${(a.excerpt || '').slice(0, 200)}（点赞：${a.voteup_count}）`)
    .join('\n')
  return `以下是知乎用户「${name}」的回答摘要：

${lines || '（暂无可用摘要）'}

请用 JSON 格式输出对这位用户的思维画像，不要解释，只输出 JSON：
{
  "values": "核心价值观，15字以内",
  "thinking_style": "思维方式标签，从以下选1-2个：[理性分析型, 批判反思型, 人文关怀型, 实用主义型, 哲学思辨型, 技术深潜型, 跨界整合型]",
  "domain": "最擅长领域，10字以内",
  "signature_view": "最具代表性的一个观点，20字以内"
}`
}

function fallbackSkills(name: string, answers: ZhihuSearchAnswer[]): AuthorSkills {
  const top = answers[0]
  return {
    author_id: '',
    author_name: name,
    values: '理性思考与诚恳表达',
    thinking_style: '理性分析型',
    domain: top?.title?.slice(0, 10) || '泛知识',
    signature_view: (top?.excerpt || '在复杂世界里寻找清晰').slice(0, 20)
  }
}

async function distillOne(author: IncomingAuthor): Promise<AuthorSkills> {
  const supabase = getSupabase()

  if (supabase) {
    const { data } = await supabase
      .from('author_skills')
      .select('*')
      .eq('author_id', author.id)
      .maybeSingle()

    if (data && data.updated_at) {
      const age = Date.now() - new Date(data.updated_at).getTime()
      if (age < SKILLS_TTL_MS) {
        return data as AuthorSkills
      }
    }
  }

  let answers: ZhihuSearchAnswer[] = []
  try {
    answers = await searchByAuthor(author.name, 10)
  } catch (e) {
    console.warn('search failed for', author.name, e)
  }

  const totalVotes = answers.reduce((s, a) => s + (a.voteup_count || 0), 0)
  const weight = totalVotes

  let skills: AuthorSkills
  try {
    const prompt = buildExtractPrompt(author.name, answers)
    const { content } = await chatCompletion(
      [
        { role: 'system', content: '你是一个擅长提炼知乎答主思维画像的助手，输出严格的 JSON。' },
        { role: 'user', content: prompt }
      ],
      { temperature: 0.3 }
    )
    const parsed = extractFirstJson<{
      values: string
      thinking_style: string
      domain: string
      signature_view: string
    }>(content)
    if (!parsed) throw new Error('no valid JSON in AI response')
    skills = {
      author_id: author.id,
      author_name: author.name,
      values: parsed.values,
      thinking_style: parsed.thinking_style,
      domain: parsed.domain,
      signature_view: parsed.signature_view,
      weight_score: weight,
      raw_answers: answers.slice(0, 5).map((a) => ({
        title: a.title,
        excerpt: (a.excerpt || '').slice(0, 200),
        voteup_count: a.voteup_count,
        url: a.url
      })),
      updated_at: new Date().toISOString()
    }
  } catch (e) {
    console.warn('AI distill failed, using fallback for', author.name, e)
    skills = {
      ...fallbackSkills(author.name, answers),
      author_id: author.id,
      weight_score: weight,
      raw_answers: answers.slice(0, 5).map((a) => ({
        title: a.title,
        excerpt: (a.excerpt || '').slice(0, 200),
        voteup_count: a.voteup_count,
        url: a.url
      })),
      updated_at: new Date().toISOString()
    }
  }

  if (supabase) {
    try {
      await supabase.from('author_skills').upsert(
        {
          author_id: skills.author_id,
          author_name: skills.author_name,
          values: skills.values,
          thinking_style: skills.thinking_style,
          domain: skills.domain,
          signature_view: skills.signature_view,
          weight_score: skills.weight_score ?? 0,
          raw_answers: skills.raw_answers ?? [],
          updated_at: skills.updated_at
        },
        { onConflict: 'author_id' }
      )
    } catch (e) {
      console.warn('supabase upsert failed', e)
    }
  }

  return skills
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') return badRequest(res, 'method not allowed')
    const session = readSession(req)
    if (!session) return unauthorized(res)

    const body = await readBody<{ authors: IncomingAuthor[] }>(req)
    const authors = (body.authors || []).filter((a) => a && a.id && a.name)
    if (authors.length === 0) return badRequest(res, 'no authors provided')
    if (authors.length > MAX_AUTHORS) return badRequest(res, `at most ${MAX_AUTHORS} authors`)

    const skills: AuthorSkills[] = []
    for (const a of authors) {
      const s = await distillOne(a)
      skills.push(s)
    }

    return json(res, 200, { skills })
  } catch (err) {
    return serverError(res, err)
  }
}
