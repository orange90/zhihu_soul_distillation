import type { VercelRequest, VercelResponse } from '@vercel/node'
import { exchangeCodeForToken, fetchMe } from '../_lib/zhihu.js'
import { writeSession } from '../_lib/session.js'

function parseCookies(req: VercelRequest): Record<string, string> {
  const header = req.headers.cookie
  if (!header) return {}
  return Object.fromEntries(
    header.split(';').map((c) => {
      const [k, ...v] = c.trim().split('=')
      return [k, decodeURIComponent(v.join('='))]
    })
  )
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const code = String(req.query.code || '')
    const state = String(req.query.state || '')
    const cookies = parseCookies(req)
    if (!code || !state || cookies.zsd_oauth_state !== state) {
      res.status(400).send('invalid oauth state')
      return
    }

    const token = await exchangeCodeForToken(code)
    let user = { id: token.user_id || token.uid || '', name: token.user_name || '', avatar_url: undefined as string | undefined }
    try {
      const me = await fetchMe(token.access_token)
      user = { id: me.id || user.id, name: me.name || user.name || '知乎用户', avatar_url: me.avatar_url }
    } catch (e) {
      console.warn('fetchMe failed, fallback to token user info', e)
    }
    if (!user.id) {
      res.status(500).send('cannot resolve user id from zhihu')
      return
    }

    writeSession(res, {
      user_id: user.id,
      user_name: user.name || '知乎用户',
      avatar_url: user.avatar_url,
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expires_at: token.expires_in ? Date.now() + token.expires_in * 1000 : undefined
    })
    res.writeHead(302, { Location: '/select' })
    res.end()
  } catch (err) {
    console.error('[oauth callback]', err)
    res.status(500).send(`oauth callback failed: ${err instanceof Error ? err.message : err}`)
  }
}
