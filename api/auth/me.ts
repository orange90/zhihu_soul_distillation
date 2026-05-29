import type { VercelRequest, VercelResponse } from '@vercel/node'
import { json } from '../_lib/http.js'
import { readSession } from '../_lib/session.js'
import { getSupabase } from '../_lib/supabase.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const s = readSession(req)
  if (!s) return json(res, 200, { user: null })

  let opted_out = false
  let upload_count = 0
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

    const { count, error: countErr } = await supabase
      .from('user_uploaded_answers')
      .select('answer_id', { count: 'exact', head: true })
      .eq('uploader_id', s.user_id)
    if (countErr) {
      console.error('[auth/me] upload_count lookup failed', countErr)
    }
    upload_count = count ?? 0
  }

  return json(res, 200, {
    user: {
      id: s.user_id,
      name: s.user_name,
      avatar_url: s.avatar_url,
      opted_out,
      upload_count,
      linked_url_token: s.linked_url_token || null
    }
  })
}
