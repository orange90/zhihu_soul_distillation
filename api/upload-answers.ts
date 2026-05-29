import type { VercelRequest, VercelResponse } from '@vercel/node'
import { badRequest, json, readBody, serverError, unauthorized } from './_lib/http.js'
import { readSession } from './_lib/session.js'
import { getSupabase } from './_lib/supabase.js'
import { applyExtensionCors } from './_lib/cors.js'

const MAX_BATCH = 200
const MIN_CONTENT_LEN = 80
const MAX_PER_USER = 10

type IncomingAnswer = {
  answer_id: string
  author_id: string
  title?: string
  content?: string
  excerpt?: string
  voteup_count?: number
  url?: string
  kind?: 'answer' | 'article' | 'thought' | 'column'
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyExtensionCors(req, res)) return
  try {
    if (req.method !== 'POST') return badRequest(res, 'method not allowed')
    const session = readSession(req)
    if (!session) return unauthorized(res, '请先登录后再使用插件上传')

    const body = await readBody<{ answers: IncomingAnswer[] }>(req)
    const raw = Array.isArray(body.answers) ? body.answers : []
    if (raw.length === 0) return badRequest(res, '没有提供答案')
    if (raw.length > MAX_BATCH) return badRequest(res, `单批最多 ${MAX_BATCH} 条`)

    // 不再在后端校验 author_id 是否等于登录用户：
    // 插件前端只在「自己主页」且「卡片作者为本人」的回答上才显示「加入蒸馏」按钮，
    // 由前端保证只上传本人内容。后端统一以登录用户的 user_id 作为 uploader_id 落库。
    const accepted: Array<{ uploader_id: string; answer_id: string }> = []
    const rejected: Array<{ answer_id: string; reason: string }> = []
    const rows: Array<Record<string, unknown>> = []

    for (const a of raw) {
      if (!a.answer_id) {
        rejected.push({ answer_id: String(a.answer_id || '<missing>'), reason: '缺少 answer_id' })
        continue
      }
      const content = stripHtml(a.content || '')
      const excerpt = stripHtml(a.excerpt || '').slice(0, 400)
      if (content.length < MIN_CONTENT_LEN) {
        rejected.push({ answer_id: a.answer_id, reason: `正文过短（${content.length} 字）` })
        continue
      }
      rows.push({
        uploader_id: session.user_id,
        answer_id: a.answer_id,
        title: (a.title || '').slice(0, 300),
        content,
        excerpt: excerpt || content.slice(0, 200),
        voteup_count: Math.max(0, Math.floor(Number(a.voteup_count) || 0)),
        url: a.url || null,
        kind: a.kind || 'answer',
        updated_at: new Date().toISOString()
      })
      accepted.push({ uploader_id: session.user_id, answer_id: a.answer_id })
    }

    const supabase = getSupabase()
    if (!supabase) {
      return json(res, 503, { error: 'Supabase 未配置，无法持久化上传' })
    }

    // Enforce per-user 10-answer limit
    const { count: currentCount } = await supabase
      .from('user_uploaded_answers')
      .select('answer_id', { count: 'exact', head: true })
      .eq('uploader_id', session.user_id)

    const available = MAX_PER_USER - (currentCount || 0)
    if (available <= 0) {
      return json(res, 429, {
        error: `你已存满 ${MAX_PER_USER} 条回答，请先去「我的蒸馏」页面删除一些再上传`,
        current: currentCount,
        max: MAX_PER_USER
      })
    }

    // Trim rows to fit within limit
    if (rows.length > available) {
      rows.splice(available)
    }

    if (rows.length > 0) {
      const { error } = await supabase
        .from('user_uploaded_answers')
        .upsert(rows, { onConflict: 'uploader_id,answer_id' })
      if (error) {
        console.error('[upload-answers] supabase upsert failed', error)
        return serverError(res, new Error(error.message))
      }
    }

    // 统计当前用户累计上传数，便于前端显示「已通过插件上传 N 条」
    const { count } = await supabase
      .from('user_uploaded_answers')
      .select('answer_id', { count: 'exact', head: true })
      .eq('uploader_id', session.user_id)

    return json(res, 200, {
      accepted: accepted.length,
      rejected,
      total_for_user: count ?? null
    })
  } catch (err) {
    return serverError(res, err)
  }
}
