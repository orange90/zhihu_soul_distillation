import type { VercelRequest, VercelResponse } from '@vercel/node'
import { badRequest, json, readBody, serverError, unauthorized } from './_lib/http.js'
import { readSession } from './_lib/session.js'
import { getSupabase } from './_lib/supabase.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') return badRequest(res, 'method not allowed')
    const session = readSession(req)
    if (!session) return unauthorized(res)

    const supabase = getSupabase()
    if (!supabase) return json(res, 503, { error: 'database unavailable' })

    const body = await readBody<{ action?: string }>(req)
    const action = body.action
    if (action !== 'add' && action !== 'remove') {
      return badRequest(res, 'action must be "add" or "remove"')
    }

    if (action === 'add') {
      await supabase.from('opted_out_authors').upsert(
        { author_id: session.user_id, author_name: session.user_name },
        { onConflict: 'author_id' }
      )
      // Delete cached distillation data so it's not served to other users
      await supabase.from('author_skills').delete().eq('author_id', session.user_id)
    } else {
      await supabase.from('opted_out_authors').delete().eq('author_id', session.user_id)
    }

    return json(res, 200, { opted_out: action === 'add' })
  } catch (err) {
    return serverError(res, err)
  }
}
