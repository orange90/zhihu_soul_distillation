import type { VercelRequest, VercelResponse } from '@vercel/node'
import { badRequest, json, readBody, serverError, unauthorized } from './_lib/http.js'
import { readSession } from './_lib/session.js'
import { getSupabase } from './_lib/supabase.js'
import { applyExtensionCors } from './_lib/cors.js'

const MAX_ANSWERS = 10
const MAX_DAILY = 2

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyExtensionCors(req, res)) return
  try {
    const session = readSession(req)
    if (!session) return unauthorized(res, '请先登录')

    const supabase = getSupabase()
    if (!supabase) return json(res, 503, { error: 'DB 未配置' })

    if (req.method === 'GET') {
      const today = new Date().toISOString().slice(0, 10)

      const [answersResult, distillResult, dailyResult] = await Promise.all([
        supabase
          .from('user_uploaded_answers')
          .select('answer_id, title, excerpt, voteup_count, url, kind, created_at, updated_at')
          .eq('uploader_id', session.user_id)
          .order('voteup_count', { ascending: false }),
        supabase
          .from('user_distillation_results')
          .select('*')
          .eq('user_id', session.user_id)
          .maybeSingle(),
        supabase
          .from('daily_distillation_log')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', session.user_id)
          .eq('date_key', today)
      ])

      return json(res, 200, {
        answers: answersResult.data || [],
        total: answersResult.data?.length || 0,
        max_answers: MAX_ANSWERS,
        distillation_result: distillResult.data || null,
        daily_distill_count: dailyResult.count || 0,
        daily_distill_max: MAX_DAILY
      })
    }

    if (req.method === 'DELETE') {
      const body = await readBody<{ answer_ids: string[] }>(req)
      const ids = Array.isArray(body.answer_ids) ? body.answer_ids : []
      if (ids.length === 0) return badRequest(res, '请提供要删除的 answer_id')

      const { error } = await supabase
        .from('user_uploaded_answers')
        .delete()
        .eq('uploader_id', session.user_id)
        .in('answer_id', ids)
      if (error) return serverError(res, new Error(error.message))

      const { count } = await supabase
        .from('user_uploaded_answers')
        .select('answer_id', { count: 'exact', head: true })
        .eq('uploader_id', session.user_id)

      return json(res, 200, { deleted: ids.length, remaining: count ?? 0 })
    }

    return badRequest(res, 'method not allowed')
  } catch (err) {
    return serverError(res, err)
  }
}
