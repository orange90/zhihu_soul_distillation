import type { VercelRequest, VercelResponse } from '@vercel/node'
import { buildAuthorizeUrl } from '../_lib/zhihu.js'
import { randomBytes } from 'node:crypto'

// 仅允许同站相对路径，避免 open redirect（必须以单个 / 开头）
function sanitizeNext(raw: unknown): string {
  const s = String(raw || '')
  return s.startsWith('/') && !s.startsWith('//') ? s : ''
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const state = randomBytes(16).toString('hex')
  const isProd = process.env.VERCEL_ENV === 'production'
  const secure = isProd ? '; Secure' : ''
  const next = sanitizeNext(req.query.next)
  const cookies = [
    `zsd_oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${secure}`
  ]
  // 登录成功后要跳回的地址（默认由 callback 兜底为 /select）
  if (next) {
    cookies.push(`zsd_oauth_next=${encodeURIComponent(next)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${secure}`)
  }
  res.setHeader('Set-Cookie', cookies)
  const url = buildAuthorizeUrl(state)
  res.writeHead(302, { Location: url })
  res.end()
}
