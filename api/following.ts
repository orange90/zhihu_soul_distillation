import type { VercelRequest, VercelResponse } from '@vercel/node'
import { json, serverError, unauthorized } from './_lib/http.js'
import { readSession } from './_lib/session.js'
import { fetchFollowing } from './_lib/zhihu.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const s = readSession(req)
    if (!s) return unauthorized(res)
    const list = await fetchFollowing(s.access_token, { limit: 1000, perPage: 50 })
    return json(res, 200, { authors: list })
  } catch (err) {
    return serverError(res, err)
  }
}
