import type { VercelRequest, VercelResponse } from '@vercel/node'
import { json, serverError, unauthorized } from './_lib/http.js'
import { readSession } from './_lib/session.js'
import { getSupabase } from './_lib/supabase.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const session = readSession(req)
    if (!session) return unauthorized(res)

    const supabase = getSupabase()
    if (!supabase) return json(res, 503, { error: 'DB 未配置' })

    if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' })

    const { data, error } = await supabase
      .from('debate_history')
      .select('id, question, author_names, result, created_at')
      .eq('user_id', session.user_id)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) return serverError(res, new Error(error.message))
    return json(res, 200, { records: data || [] })
  } catch (err) {
    return serverError(res, err)
  }
}
