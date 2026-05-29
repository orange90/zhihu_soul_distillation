import type { VercelRequest, VercelResponse } from '@vercel/node'
import { json, serverError } from './_lib/http.js'
import { readSession } from './_lib/session.js'
import { getSupabase } from './_lib/supabase.js'

function getWeekKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const supabase = getSupabase()
    if (!supabase) return json(res, 503, { error: 'DB 未配置' })

    const weekKey = getWeekKey()
    const session = readSession(req)

    const { data: scores } = await supabase
      .from('user_scores')
      .select('user_id, user_name, user_avatar, score, updated_at')
      .eq('week_key', weekKey)
      .order('score', { ascending: false })
      .limit(50)

    const ranked = (scores || []).map((s: any, i: number) => ({
      ...s,
      rank: i + 1
    }))

    let my_rank: number | null = null
    if (session) {
      const idx = ranked.findIndex((r: any) => r.user_id === session.user_id)
      my_rank = idx >= 0 ? idx + 1 : null
    }

    return json(res, 200, { scores: ranked, week_key: weekKey, my_rank })
  } catch (err) {
    return serverError(res, err)
  }
}
