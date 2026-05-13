import type { VercelRequest, VercelResponse } from '@vercel/node'
import { buildAuthorizeUrl } from '../_lib/zhihu.js'
import { randomBytes } from 'node:crypto'

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const state = randomBytes(16).toString('hex')
  const isProd = process.env.VERCEL_ENV === 'production'
  res.setHeader(
    'Set-Cookie',
    `zsd_oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${isProd ? '; Secure' : ''}`
  )
  const url = buildAuthorizeUrl(state)
  res.writeHead(302, { Location: url })
  res.end()
}
