import type { VercelRequest, VercelResponse } from '@vercel/node'
import { json, serverError, unauthorized } from '../_lib/http.js'
import { encodeSession, readSession } from '../_lib/session.js'
import { applyExtensionCors } from '../_lib/cors.js'

// 给浏览器插件签发一份长期 token（HMAC 签名的 SessionData，与 Cookie 同源同 secret）。
// 仅当用户已经在 web 端完成 OAuth 登录时可用——本身就是 Cookie session 的"可携带副本"。
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyExtensionCors(req, res)) return
  try {
    const s = readSession(req)
    if (!s) return unauthorized(res, '请先在网页端完成知乎登录')
    const token = encodeSession(s)
    return json(res, 200, {
      token,
      user: { id: s.user_id, name: s.user_name, avatar_url: s.avatar_url }
    })
  } catch (err) {
    return serverError(res, err)
  }
}
