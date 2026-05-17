import type { VercelRequest, VercelResponse } from '@vercel/node'
import { json, serverError, unauthorized } from './_lib/http.js'
import { readSession } from './_lib/session.js'
import { fetchFollowing, type ZhihuFollowingItem } from './_lib/zhihu.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const s = readSession(req)
    if (!s) return unauthorized(res)
    const list = await fetchFollowing(s.access_token, { perPage: 50 })

    const authors: ZhihuFollowingItem[] = []
    if (s.user_id) {
      authors.push({
        id: String(s.user_id),
        name: s.user_name || '我',
        avatar_url: s.avatar_url,
        headline: '我自己（蒸馏自己的思考方式）'
      })
    }
    for (const item of list) {
      if (item.id && item.id === s.user_id) continue
      authors.push(item)
    }

    return json(res, 200, { authors })
  } catch (err) {
    return serverError(res, err)
  }
}
