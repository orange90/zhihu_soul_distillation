import type { VercelRequest, VercelResponse } from '@vercel/node'
import { badRequest, json, readBody, serverError, unauthorized } from './_lib/http.js'
import { readSession } from './_lib/session.js'
import { chatCompletion, type ChatTurn } from './_lib/zhihu.js'
import type { ChatMessage, Persona } from './_lib/types.js'

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') return badRequest(res, 'method not allowed')
    const session = readSession(req)
    if (!session) return unauthorized(res)

    const body = await readBody<{ persona: Persona; history: ChatMessage[]; question: string }>(req)
    if (!body.persona || !body.question?.trim()) return badRequest(res, 'missing persona or question')

    const turns: ChatTurn[] = [{ role: 'system', content: buildSystemPrompt(session.user_name, body.persona) }]
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
