import type { VercelRequest, VercelResponse } from '@vercel/node'
import { json, readBody, serverError, unauthorized } from '../_lib/http.js'
import { clearSession, encodeSession, readSession } from '../_lib/session.js'
import { getSupabase } from '../_lib/supabase.js'
import { applyExtensionCors } from '../_lib/cors.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyExtensionCors(req, res)) return

  try {
    // POST: logout or plugin-token
    if (req.method === 'POST') {
      const body = await readBody<{ action?: string; url_token?: string }>(req)
      const action = body?.action

      // logout
      if (action === 'logout') {
        clearSession(res)
        return json(res, 200, { ok: true })
      }

      // plugin-token (also handles legacy POST /api/auth/plugin-token)
      const s = readSession(req)
      if (!s) return unauthorized(res, '请先在网页端完成知乎登录')
      let linked_url_token = s.linked_url_token
      const candidate = String(body?.url_token || '').trim()
      if (candidate) linked_url_token = candidate
      const next = { ...s, linked_url_token }
      const token = encodeSession(next)
      return json(res, 200, {
        token,
        user: {
          id: s.user_id,
          name: s.user_name,
          avatar_url: s.avatar_url,
          linked_url_token: linked_url_token || null
        }
      })
    }

    // GET: current user info
    const s = readSession(req)
    if (!s) return json(res, 200, { user: null })

    let opted_out = false
    let upload_count = 0
    const supabase = getSupabase()
    if (supabase) {
      const [optedResult, countResult] = await Promise.all([
        supabase.from('opted_out_authors').select('author_id').eq('author_id', s.user_id).maybeSingle(),
        supabase.from('user_uploaded_answers').select('answer_id', { count: 'exact', head: true }).eq('uploader_id', s.user_id)
      ])
      if (optedResult.error) console.error('[auth/me] opted_out lookup failed', optedResult.error)
      if (countResult.error) console.error('[auth/me] upload_count lookup failed', countResult.error)
      opted_out = !!optedResult.data
      upload_count = countResult.count ?? 0
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
  } catch (err) {
    return serverError(res, err)
  }
}
