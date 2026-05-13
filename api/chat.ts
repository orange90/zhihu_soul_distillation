import type { VercelRequest, VercelResponse } from '@vercel/node'
import { badRequest, json, readBody, serverError, unauthorized } from './_lib/http.js'
import { readSession } from './_lib/session.js'
import { chatCompletion, extractFirstJson, type ChatTurn } from './_lib/zhihu.js'
import type {
  AuthorSkills,
  ChatMessage,
  DebateResult,
  DebateRound,
  DebateTurn,
  Persona
} from './_lib/types.js'

function buildSystemPrompt(userName: string, persona: Persona): string {
  const lines = persona.contributors
    .map(
      (c) =>
        `- ${c.author_name}：${c.thinking_style}，擅长「${c.domain}」，代表观点：${c.signature_view}`
    )
    .join('\n')
  return `你是「${userName}的知识圈集体智慧体」，由以下 ${persona.contributors.length} 位知乎用户的思想融合而成：

${lines}

整体气质：${persona.dominant_style}。

回答用户问题时，请：
1. 以集体的第一人称「我们」作答
2. 在关键判断处引用具体来源，格式：（{用户名} 的观点）
3. 如有分歧，明确呈现不同声音而非强行统一
4. 回答长度 200-300 字`
}

function buildPersonaCard(c: AuthorSkills): string {
  return `你现在扮演知乎答主「${c.author_name}」。
- 价值观：${c.values || '未知'}
- 思维方式：${c.thinking_style || '未知'}
- 擅长领域：${c.domain || '未知'}
- 代表观点：${c.signature_view || '未知'}

发言准则：
1. 严格保持上述人物的观点立场和说话风格
2. 用第一人称「我」作答，不要替别人说话
3. 单次发言控制在 80-140 字，观点鲜明、有锋芒
4. 不需要客套寒暄，直接给出论点和理由`
}

async function generateOpening(
  contributor: AuthorSkills,
  question: string
): Promise<DebateTurn> {
  const turns: ChatTurn[] = [
    { role: 'system', content: buildPersonaCard(contributor) },
    {
      role: 'user',
      content: `辩题：${question}\n\n请就该辩题亮明你的核心立场，并给出 1-2 条最有力的理由。`
    }
  ]
  try {
    const r = await chatCompletion(turns, { temperature: 0.8 })
    return {
      author_id: contributor.author_id,
      author_name: contributor.author_name,
      content: (r.content || '').trim() || `（${contributor.signature_view}）`
    }
  } catch (e) {
    return {
      author_id: contributor.author_id,
      author_name: contributor.author_name,
      content: contributor.signature_view || '（暂无观点）'
    }
  }
}

async function generateRebuttal(
  contributor: AuthorSkills,
  question: string,
  previous: DebateTurn[]
): Promise<DebateTurn> {
  const others = previous
    .filter((t) => t.author_id !== contributor.author_id)
    .map((t) => `【${t.author_name}】${t.content}`)
    .join('\n\n')
  const own = previous.find((t) => t.author_id === contributor.author_id)
  const turns: ChatTurn[] = [
    { role: 'system', content: buildPersonaCard(contributor) },
    {
      role: 'user',
      content: `辩题：${question}

第一轮各方发言：
${others || '（暂无）'}

${own ? `你刚才的发言是：${own.content}\n\n` : ''}现在请你回应他人的观点：可以反驳、补充或部分认同，但务必保持你自己的立场和锋芒，不要被同化。`
    }
  ]
  try {
    const r = await chatCompletion(turns, { temperature: 0.85 })
    return {
      author_id: contributor.author_id,
      author_name: contributor.author_name,
      content: (r.content || '').trim() || (own?.content ?? '（继续保留前述立场）')
    }
  } catch (e) {
    return {
      author_id: contributor.author_id,
      author_name: contributor.author_name,
      content: own?.content || contributor.signature_view || '（继续保留前述立场）'
    }
  }
}

async function summarizeDebate(
  question: string,
  rounds: DebateRound[]
): Promise<{ consensus: string[]; divergences: string[]; summary: string }> {
  const transcript = rounds
    .map(
      (r) =>
        `# 第 ${r.round} 轮\n` +
        r.turns.map((t) => `【${t.author_name}】${t.content}`).join('\n')
    )
    .join('\n\n')
  const turns: ChatTurn[] = [
    {
      role: 'system',
      content:
        '你是一位中立的辩论主持人。基于多人辩论实录，准确提炼共识与分歧，禁止编造原文未出现的观点。请仅返回 JSON。'
    },
    {
      role: 'user',
      content: `辩题：${question}

以下是各方完整发言：

${transcript}

请输出 JSON，结构如下：
{
  "consensus": ["共识点1", "共识点2"],
  "divergences": ["分歧点1：A 认为... / B 认为...", "分歧点2：..."],
  "summary": "用 100 字左右收束这场辩论的核心张力"
}
仅输出 JSON，不要任何额外解释。`
    }
  ]
  try {
    const r = await chatCompletion(turns, { temperature: 0.3 })
    const parsed = extractFirstJson<{
      consensus: string[]
      divergences: string[]
      summary: string
    }>(r.content || '')
    if (parsed) {
      return {
        consensus: Array.isArray(parsed.consensus) ? parsed.consensus.filter(Boolean) : [],
        divergences: Array.isArray(parsed.divergences) ? parsed.divergences.filter(Boolean) : [],
        summary: parsed.summary || ''
      }
    }
  } catch (e) {
    console.warn('summarize debate failed', e)
  }
  const allSpeakers = [...new Set(rounds.flatMap((r) => r.turns.map((t) => t.author_name)))]
  return {
    consensus: [],
    divergences: allSpeakers.map((n) => `${n} 保留了各自的初始立场`),
    summary: '（总结服务暂不可用，请直接查看上方各方发言。）'
  }
}

async function handleDebate(
  res: VercelResponse,
  persona: Persona,
  question: string,
  roundsCount: number
) {
  const contributors = persona.contributors.slice(0, 5)
  if (contributors.length < 2) {
    return badRequest(res, 'debate mode requires at least 2 contributors')
  }

  const rounds: DebateRound[] = []

  const openings = await Promise.all(
    contributors.map((c) => generateOpening(c, question))
  )
  rounds.push({ round: 1, topic_focus: '亮明立场', turns: openings })

  if (roundsCount >= 2) {
    const rebuttals = await Promise.all(
      contributors.map((c) => generateRebuttal(c, question, openings))
    )
    rounds.push({ round: 2, topic_focus: '交锋与回应', turns: rebuttals })
  }

  const { consensus, divergences, summary } = await summarizeDebate(question, rounds)

  const result: DebateResult = {
    question,
    rounds,
    consensus,
    divergences,
    summary
  }
  return json(res, 200, { debate: result })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') return badRequest(res, 'method not allowed')
    const session = readSession(req)
    if (!session) return unauthorized(res)

    const body = await readBody<{
      persona: Persona
      history?: ChatMessage[]
      question: string
      mode?: 'collective' | 'debate'
      rounds?: number
    }>(req)
    if (!body.persona || !body.question?.trim()) return badRequest(res, 'missing persona or question')

    const mode = body.mode || 'collective'

    if (mode === 'debate') {
      const roundsCount = Math.min(Math.max(Number(body.rounds) || 2, 1), 3)
      return await handleDebate(res, body.persona, body.question.trim(), roundsCount)
    }

    const turns: ChatTurn[] = [
      { role: 'system', content: buildSystemPrompt(session.user_name, body.persona) }
    ]
    for (const m of body.history || []) {
      turns.push({ role: m.role, content: m.content })
    }
    if (turns[turns.length - 1]?.content !== body.question) {
      turns.push({ role: 'user', content: body.question })
    }

    let content = ''
    try {
      const r = await chatCompletion(turns, { temperature: 0.6 })
      content = r.content
    } catch (e) {
      console.warn('chat fail, using degraded reply', e)
      const lines = body.persona.contributors
        .slice(0, 3)
        .map((c) => `（${c.author_name} 的观点）${c.signature_view}`)
      content = `我们一致认为：\n${lines.join('\n')}\n\n（注：当前对话 API 未配置或调用失败，以上为基于成员代表观点的降级回复。）`
    }

    const citations = body.persona.contributors.map((c) => ({
      author_name: c.author_name,
      text: c.signature_view
    }))

    const message: ChatMessage = { role: 'assistant', content, citations }
    return json(res, 200, { message })
  } catch (err) {
    return serverError(res, err)
  }
}
