import type { VercelRequest, VercelResponse } from '@vercel/node'
import { badRequest, json, readBody, serverError, unauthorized } from './_lib/http.js'
import { readSession } from './_lib/session.js'
import { chatCompletion, extractFirstJson, searchByAuthor, type ZhihuSearchAnswer } from './_lib/zhihu.js'
import { getSupabase, SKILLS_TTL_MS } from './_lib/supabase.js'
import type { AuthorSkills } from './_lib/types.js'

const MAX_AUTHORS = 5
const SEARCH_TOP = 8
const SEARCH_FETCH = 25
const EXCERPT_LIMIT = 2500
const PROBE_EXCERPT_LIMIT = 800
const PROBE_TOP = 6

type IncomingAuthor = {
  id: string
  name: string
  avatar_url?: string
  headline?: string
}

const HUANGZHE_SKILL_TEMPLATE = `---
name: huangzhe
description: |
  「桔了个仔」的科技评测/AI资讯写稿 Skill。给定一个知乎问题链接、话题关键词、或一段素材，自动抓取背景信息，以 Orange（桔了个仔）的第一人称口吻，产出一篇符合其知乎答题风格的科技类回答文章，包含正文、配图占位与元数据头部。

  触发词包括但不限于：帮桔了个仔写知乎、按我的风格写、出一篇回答、写一篇测评、写一篇评论、写稿子、帮我写这篇、用我的风格写。即使用户只是丢过来一个话题链接或关键词说「帮我回答一下」，只要涉及科技/AI 内容创作输出，都应触发。适用于：产品测评、模型评测、行业事件评论、工具分享、技术解读、个人经历分享。不用于：纯学术论文、商务报告、不涉及第一人称的客观综述。
---

# 桔了个仔 Skill

## 关于这个 Skill

这是（知乎ID：桔了个仔）的个人写作风格 Skill，适用于知乎科技类回答。Orange 是广东/新加坡两地的 AI 算法工程师（前数据科学家，南洋理工读研），超级奶爸，AI 行业从业者。他的文章风格一句话概括：

> 「一个有技术背景的 AI 从业者，用朋友聊天的方式把一件有意思的事讲清楚，顺手给出自己的判断。」

## 核心价值观

- 好奇心优先于焦虑。
- 直说，不绕弯子。
- 真诚比客观更重要。
- 技术平权是好事。

## 第一步：理解素材与选题判断
（此处是范本原文对应章节，略）

## 第二步：确定独特角度
（略）

## 第三步：撰写文章

### 代码块规则（必须遵守）
若文章中出现代码块，必须在代码块第一行写注释 \`// author:orange\`（或根据语言使用对应注释符号）。

\`\`\`python
# author:orange
def embed_lsb_watermark(image_array, secret_bits):
    ...
\`\`\`

### 括号旁白（Orange 的特色）
大量使用（）插入非正式说明、吐槽或自嘲。每篇至少 2-3 处。

### 情绪符号用法
- \`。。。\` 表示语气拖长/无语/遗憾
- \`？？？\` 表示极度惊讶
- \`╮(╯_╰)╭\` Orange 的标志性表情

### 技术类比词库
- MoE → 「分工明确的专案组」
- SVD → 「调整图片的骨架」

## 专属口语化词组库
**开场定位**：「这里讲一下」「先讲两个值得注意的点」「省流版本」
**表达判断**：「我认为」「个人认为」「我有个暴论」
**情绪表达**：「太卷了吧」「╮(╯_╰)╭」「搞得我也心痒痒」
**行业口语**：「屎山」「小钢炮」「抽卡」「调参」「下快棋」`

function pickBody(a: ZhihuSearchAnswer, max: number): string {
  const raw = (a.content && a.content.trim()) ? a.content : (a.excerpt || '')
  const cleaned = raw.replace(/\s+\n/g, '\n').trim()
  return cleaned.slice(0, max)
}

function buildExtractPrompt(name: string, answers: ZhihuSearchAnswer[]) {
  const lines = answers
    .slice(0, PROBE_TOP)
    .map((a, i) => `${i + 1}. ${a.title}：${pickBody(a, PROBE_EXCERPT_LIMIT)}（点赞：${a.voteup_count}）`)
    .join('\n')
  return `以下是知乎用户「${name}」的回答摘要：

${lines || '（暂无可用摘要）'}

请用 JSON 格式输出对这位用户的思维画像，不要解释，只输出 JSON：
{
  "values": "核心价值观，15字以内",
  "thinking_style": "思维方式标签，从以下选1-2个：[理性分析型, 批判反思型, 人文关怀型, 实用主义型, 哲学思辨型, 技术深潜型, 跨界整合型, 系统结构型, 数据驱动型, 经验归纳型, 直觉洞察型, 叙事共情型, 逆向思维型, 辩证综合型, 演绎推理型, 创意发散型]",
  "domain": "最擅长领域，10字以内",
  "signature_view": "最具代表性的一个观点，20字以内"
}`
}

function buildSkillPrompt(
  name: string,
  profile: { values: string; thinking_style: string; domain: string; signature_view: string },
  answers: ZhihuSearchAnswer[]
): string {
  const corpus = answers
    .slice(0, SEARCH_TOP)
    .map(
      (a, i) =>
        `【作品 ${i + 1}｜赞${a.voteup_count}】\n标题：${a.title}\n正文：${pickBody(a, EXCERPT_LIMIT)}`
    )
    .join('\n\n')

  return `你现在要为知乎答主「${name}」生成一份个人写作风格 Skill 文档（Markdown 格式）。

# 结构范本（以知乎答主「桔了个仔」的 Skill 为参考，你必须对齐结构，但内容要基于下方目标答主的真实素材重写，禁止照搬范本内容或人物信息）：

${HUANGZHE_SKILL_TEMPLATE}

# 目标答主
- 姓名/ID：${name}
- 基础画像：价值观=${profile.values}；思维方式=${profile.thinking_style}；擅长领域=${profile.domain}；代表观点=${profile.signature_view}

# 目标答主的代表作品语料（按点赞数降序）：
${corpus || '（无可用素材，请尽量依据基础画像合理推断）'}

# 生成要求
1. 严格按范本的章节结构输出：YAML frontmatter（name/description） → 关于这个 Skill → 核心价值观 → 选题/角度 → 撰写规范（含代码注释规则、特色表达、情绪符号、类比词库） → 专属口语词组库。
2. YAML frontmatter 的 name 字段用 \`${name}\`（拼音或原 ID 均可，保持 slug 友好；不确定时就直接用原名）。description 写 3–6 句，说明什么时候触发、适用/不适用的内容类型。
3. 「核心价值观」要从目标答主的真实素材里提炼 3–5 条，每条一句话加一小段解读，禁止照抄范本的 4 条。
4. 「代码块规则」章节：如果目标答主明显是技术类作者，保留该规则并把注释作者名改成目标答主的英文/拼音 ID（如 \`// author:${slugify(name)}\`）；如果目标答主是非技术类作者（人文/情感/商业等），删除该章节，替换为该答主的其他格式偏好（比如是否常用小标题、引用、分点等）。
5. 「特色表达 / 情绪符号 / 类比词库 / 口语词组库」必须从目标答主的真实素材里抽取，至少各给 3 条示例，示例需要能直接引用素材中的原话或高频表达，不得编造明显不属于该答主的口癖。
6. 如果素材里看不出某类信息（比如没有技术类比），该小节可以省略或写「（素材不足，暂略）」，但不能瞎编。
7. 整篇 Markdown 长度 800–1800 字，不要写总结语，不要添加任何代码围栏把整份 Markdown 包裹起来。
8. 只输出 Markdown 正文本身，从 \`---\` 开头，不要任何前言或解释。`
}

function slugify(name: string): string {
  // 保守处理：仅用于 prompt 里的提示，实际 LLM 会自行决定 slug 形式
  const ascii = name
    .replace(/[^\w\u4e00-\u9fa5]+/g, '')
    .toLowerCase()
  return ascii || 'author'
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

async function generateSkillMarkdown(
  name: string,
  profile: { values: string; thinking_style: string; domain: string; signature_view: string },
  answers: ZhihuSearchAnswer[]
): Promise<string> {
  try {
    const prompt = buildSkillPrompt(name, profile, answers)
    const { content } = await chatCompletion(
      [
        {
          role: 'system',
          content:
            '你是一个擅长从公开文本中提炼个人写作风格的助手。你会产出一份可直接作为 LLM system prompt 使用的 Skill 文档，严格遵循给定的结构范本，但内容必须忠于目标对象的真实语料，不得张冠李戴。'
        },
        { role: 'user', content: prompt }
      ],
      { temperature: 0.7, timeoutMs: 120_000 }
    )
    const md = (content || '').trim()
    // 兜底：剥掉可能的 ```markdown ... ``` 围栏
    const unfenced = md.replace(/^```(?:markdown|md)?\s*/i, '').replace(/\s*```\s*$/i, '')
    if (!unfenced.startsWith('---')) {
      // 不符合 frontmatter 起始的情况下，仍然返回原始内容，让调用方能看到
      return unfenced
    }
    return unfenced
  } catch (e) {
    console.warn('skill markdown generation failed for', name, e)
    return ''
  }
}

function clampDesc(s: string, max = 240): string {
  const cleaned = (s || '').replace(/\s+/g, '').trim()
  if (!cleaned) return ''
  return cleaned.length > max ? cleaned.slice(0, max) : cleaned
}

function fallbackDescFromProfile(
  name: string,
  profile: { values: string; thinking_style: string; domain: string; signature_view: string }
): string {
  const parts = [
    `${name}是一位${profile.thinking_style || '理性分析型'}的答主`,
    profile.domain ? `擅长${profile.domain}领域` : '',
    profile.values ? `信奉${profile.values}` : '',
    profile.signature_view ? `代表观点是「${profile.signature_view}」` : ''
  ].filter(Boolean)
  return clampDesc(parts.join('，') + '。')
}

async function generateSkillDesc(
  name: string,
  profile: { values: string; thinking_style: string; domain: string; signature_view: string },
  skillMarkdown: string
): Promise<string> {
  const source = (skillMarkdown || '').trim()
  if (!source) return fallbackDescFromProfile(name, profile)
  try {
    const prompt = `下面是知乎答主「${name}」的写作风格 Skill 文档（Markdown）。请基于它写一段约 200 字（180–220 字）的中文简介，用第三人称介绍这位答主的写作风格、价值观、思维方式、擅长领域以及文字上的辨识特征，让读者无需读完整份文档也能快速了解其调性。

要求：
1. 单段纯文本，不使用 Markdown、不使用列表、不使用换行。
2. 控制在 180–220 字之间，不要写标题或前缀（如「简介：」）。
3. 内容必须忠于下方文档，不得编造文档外的事实。

# Skill 文档
${source}`
    const { content } = await chatCompletion(
      [
        {
          role: 'system',
          content: '你是一个擅长写人物风格简介的中文编辑，输出克制、准确、可读性强的一段话。'
        },
        { role: 'user', content: prompt }
      ],
      { temperature: 0.5, timeoutMs: 60_000 }
    )
    const desc = clampDesc(content || '')
    return desc || fallbackDescFromProfile(name, profile)
  } catch (e) {
    console.warn('skill desc generation failed for', name, e)
    return fallbackDescFromProfile(name, profile)
  }
}

type DistillStep =
  | 'cache_hit'
  | 'fetch_answers'
  | 'fetch_answers_done'
  | 'ai_probe'
  | 'ai_probe_done'
  | 'generate_skills'
  | 'generate_skills_done'
  | 'failed'

type StepPayload = { step: DistillStep; meta?: Record<string, any> }

async function distillOne(
  author: IncomingAuthor,
  onStep?: (p: StepPayload) => void,
  opts: { force?: boolean } = {}
): Promise<{ skills: AuthorSkills; fromCache: boolean }> {
  const supabase = getSupabase()

  if (supabase) {
    const { data: blocked } = await supabase
      .from('opted_out_authors')
      .select('author_id')
      .eq('author_id', author.id)
      .maybeSingle()
    if (blocked) {
      onStep?.({ step: 'failed', meta: { reason: 'opted_out' } })
      throw Object.assign(
        new Error(`答主「${author.name}」已申请停止蒸馏`),
        { code: 'OPTED_OUT' }
      )
    }
  }

  if (supabase && !opts.force) {
    const { data } = await supabase
      .from('author_skills')
      .select('*')
      .eq('author_id', author.id)
      .maybeSingle()

    if (data && data.updated_at) {
      const age = Date.now() - new Date(data.updated_at).getTime()
      // 仅当命中缓存且已经有 skill_markdown 时才直接复用；否则穿透到重新蒸馏
      if (age < SKILLS_TTL_MS && data.skill_markdown) {
        const cached = data as AuthorSkills
        // 旧记录可能没有 skill_desc，补一次摘要并写回（不影响主流程，失败也无所谓）
        if (!cached.skill_desc || !cached.skill_desc.trim()) {
          try {
            const desc = await generateSkillDesc(
              cached.author_name,
              {
                values: cached.values,
                thinking_style: cached.thinking_style,
                domain: cached.domain,
                signature_view: cached.signature_view
              },
              cached.skill_markdown || ''
            )
            cached.skill_desc = desc
            try {
              await supabase
                .from('author_skills')
                .update({ skill_desc: desc })
                .eq('author_id', cached.author_id)
            } catch (e) {
              console.warn('supabase update skill_desc failed', e)
            }
          } catch (e) {
            console.warn('backfill skill_desc failed', e)
          }
        }
        onStep?.({ step: 'cache_hit' })
        return { skills: cached, fromCache: true }
      }
    }
  }

  onStep?.({ step: 'fetch_answers' })
  let answers: ZhihuSearchAnswer[] = []
  try {
    answers = await searchByAuthor(author.name, SEARCH_FETCH)
  } catch (e) {
    console.warn('search failed for', author.name, e)
  }
  const usableAnswers = answers.filter(
    (a) => (a.content && a.content.trim().length > 0) || (a.excerpt && a.excerpt.trim().length > 0)
  )
  const totalChars = usableAnswers.reduce(
    (s, a) => s + ((a.content && a.content.length) || (a.excerpt && a.excerpt.length) || 0),
    0
  )
  const sourceCounts: Record<string, number> = {}
  for (const a of usableAnswers) {
    const src = (a as any).source || 'zhihu_search'
    sourceCounts[src] = (sourceCounts[src] || 0) + 1
  }
  onStep?.({
    step: 'fetch_answers_done',
    meta: { count: usableAnswers.length, raw_count: answers.length, chars: totalChars, sources: sourceCounts }
  })

  if (usableAnswers.length === 0 || totalChars < 200) {
    onStep?.({
      step: 'failed',
      meta: { reason: 'no_usable_answers', raw_count: answers.length, chars: totalChars }
    })
    throw new Error(
      `没有抓到「${author.name}」的可用回答素材（命中 ${answers.length} 条，可用 ${usableAnswers.length} 条，总字数 ${totalChars}）。可能原因：同名噪声被过滤、搜索接口限流、或该答主在站内可检索回答太少。`
    )
  }
  answers = usableAnswers

  const totalVotes = answers.reduce((s, a) => s + (a.voteup_count || 0), 0)
  const weight = totalVotes

  let skills: AuthorSkills
  try {
    onStep?.({ step: 'ai_probe' })
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
    onStep?.({ step: 'ai_probe_done' })

    onStep?.({ step: 'generate_skills' })
    const skillMd = await generateSkillMarkdown(author.name, parsed, answers)
    const skillDesc = await generateSkillDesc(author.name, parsed, skillMd)
    onStep?.({ step: 'generate_skills_done' })

    skills = {
      author_id: author.id,
      author_name: author.name,
      values: parsed.values,
      thinking_style: parsed.thinking_style,
      domain: parsed.domain,
      signature_view: parsed.signature_view,
      skill_markdown: skillMd,
      skill_desc: skillDesc,
      weight_score: weight,
      raw_answers: answers.slice(0, 5).map((a) => ({
        title: a.title,
        excerpt: pickBody(a, EXCERPT_LIMIT),
        voteup_count: a.voteup_count,
        url: a.url
      })),
      updated_at: new Date().toISOString()
    }
  } catch (e) {
    console.warn('AI distill failed, using fallback for', author.name, e)
    const fb = fallbackSkills(author.name, answers)
    skills = {
      ...fb,
      author_id: author.id,
      skill_markdown: '',
      skill_desc: fallbackDescFromProfile(author.name, {
        values: fb.values,
        thinking_style: fb.thinking_style,
        domain: fb.domain,
        signature_view: fb.signature_view
      }),
      weight_score: weight,
      raw_answers: answers.slice(0, 5).map((a) => ({
        title: a.title,
        excerpt: pickBody(a, EXCERPT_LIMIT),
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
          skill_markdown: skills.skill_markdown ?? '',
          skill_desc: skills.skill_desc ?? '',
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

  return { skills, fromCache: false }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') return badRequest(res, 'method not allowed')
    const session = readSession(req)
    if (!session) return unauthorized(res)

    const body = await readBody<{ authors: IncomingAuthor[]; force?: boolean }>(req)
    const authors = (body.authors || []).filter((a) => a && a.id && a.name)
    if (authors.length === 0) return badRequest(res, 'no authors provided')
    if (authors.length > MAX_AUTHORS) return badRequest(res, `at most ${MAX_AUTHORS} authors`)

    const force =
      String(req.query?.force || '') === '1' ||
      String(req.query?.force || '').toLowerCase() === 'true' ||
      body.force === true

    const wantStream =
      String(req.query?.stream || '') === '1' ||
      String(req.headers?.accept || '').includes('text/event-stream')

    if (wantStream) {
      res.status(200)
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache, no-transform')
      res.setHeader('Connection', 'keep-alive')
      res.setHeader('X-Accel-Buffering', 'no')
      ;(res as any).flushHeaders?.()

      const send = (event: string, data: any) => {
        res.write(`event: ${event}\n`)
        res.write(`data: ${JSON.stringify(data)}\n\n`)
        ;(res as any).flush?.()
      }

      const skills: AuthorSkills[] = []
      const cacheHits: Record<string, boolean> = {}
      const errors: Array<{ author_id: string; message: string }> = []

      try {
        for (let i = 0; i < authors.length; i++) {
          const a = authors[i]
          send('author_start', { author_id: a.id, index: i, total: authors.length })
          try {
            const { skills: s, fromCache } = await distillOne(
              a,
              (p) => {
                send('step', { author_id: a.id, step: p.step, meta: p.meta || {} })
              },
              { force }
            )
            skills.push(s)
            cacheHits[s.author_id] = fromCache
            send('author_done', { author_id: a.id, fromCache, skills: s })
          } catch (e: any) {
            const message = String(e?.message || e)
            errors.push({ author_id: a.id, message })
            send('author_error', { author_id: a.id, message })
            // 不再 throw：单个答主失败不应中断整个批次，其他答主继续蒸馏并落库
          }
        }
        if (skills.length === 0) {
          send('error', {
            message:
              errors.length > 0
                ? `所有答主蒸馏失败：${errors.map((x) => x.message).join(' ; ')}`
                : '蒸馏结果为空'
          })
        } else {
          send('done', { skills, cacheHits, errors })
        }
      } catch (e: any) {
        send('error', { message: String(e?.message || e) })
      } finally {
        res.end()
      }
      return
    }

    const skills: AuthorSkills[] = []
    const cacheHits: Record<string, boolean> = {}
    const errors: Array<{ author_id: string; message: string }> = []
    for (const a of authors) {
      try {
        const { skills: s, fromCache } = await distillOne(a, undefined, { force })
        skills.push(s)
        cacheHits[s.author_id] = fromCache
      } catch (e: any) {
        errors.push({ author_id: a.id, message: String(e?.message || e) })
      }
    }

    if (skills.length === 0) {
      return serverError(
        res,
        new Error(
          errors.length > 0
            ? `所有答主蒸馏失败：${errors.map((x) => x.message).join(' ; ')}`
            : '蒸馏结果为空'
        )
      )
    }

    return json(res, 200, { skills, cacheHits, errors })
  } catch (err) {
    return serverError(res, err)
  }
}
