import type { VercelRequest, VercelResponse } from '@vercel/node'
import { json } from '../_lib/http.js'
import { readSession } from '../_lib/session.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const s = readSession(req)
  if (!s) return json(res, 200, { user: null })
  return json(res, 200, {
    user: { id: s.user_id, name: s.user_name, avatar_url: s.avatar_url }
  })
}
