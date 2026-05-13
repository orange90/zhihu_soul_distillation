import type { VercelRequest, VercelResponse } from '@vercel/node'
import { json } from '../_lib/http.js'
import { clearSession } from '../_lib/session.js'

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  clearSession(res)
  return json(res, 200, { ok: true })
}
