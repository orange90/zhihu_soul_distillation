import type { VercelRequest, VercelResponse } from '@vercel/node'
import { json } from '../_lib/http.js'
import { readSession } from '../_lib/session.js'
import { getSupabase } from '../_lib/supabase.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const s = readSession(req)
  if (!s) return json(res, 200, { user: null })

  let opted_out = false
  const supabase = getSupabase()
  if (supabase) {
    const { data, error } = await supabase
      .from('opted_out_authors')
      .select('author_id')
      .eq('author_id', s.user_id)
      .maybeSingle()
    if (error) {
      console.error('[auth/me] opted_out lookup failed', error)
    }
    opted_out = !!data
  }

  return json(res, 200, {
    user: { id: s.user_id, name: s.user_name, avatar_url: s.avatar_url, opted_out }
  })
}
