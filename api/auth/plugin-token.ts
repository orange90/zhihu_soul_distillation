import type { VercelRequest, VercelResponse } from '@vercel/node'
import { json, readBody, serverError, unauthorized } from '../_lib/http.js'
import { encodeSession, readSession } from '../_lib/session.js'
import { applyExtensionCors } from '../_lib/cors.js'

// 给浏览器插件签发一份长期 token（HMAC 签名的 SessionData，与 Cookie 同源同 secret）。
// 仅当用户已经在 web 端完成 OAuth 登录时可用——本身就是 Cookie session 的"可携带副本"。
// POST 时可附带 { url_token } 把插件观察到的 zhihu.com/api/v4/me.url_token 烙进 token，
// 与 OAuth uid 一起作为"本人"的两种 id 形态之一。
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyExtensionCors(req, res)) return
  try {
    const s = readSession(req)
    if (!s) return unauthorized(res, '请先在网页端完成知乎登录')

    let linked_url_token = s.linked_url_token
    if (req.method === 'POST') {
      const body = await readBody<{ url_token?: string }>(req)
      const candidate = String(body?.url_token || '').trim()
      if (candidate) linked_url_token = candidate
    }

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
  } catch (err) {
    return serverError(res, err)
  }
}
