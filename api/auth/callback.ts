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
    const code = String(req.query.code || req.query.authorization_code || '')
    const state = String(req.query.state || '')
    const cookies = parseCookies(req)
    if (!code) {
      res.status(400).send('invalid oauth callback: missing code')
      return
    }
    if (state && cookies.zsd_oauth_state && cookies.zsd_oauth_state !== state) {
      res.status(400).send('invalid oauth state')
      return
    }
    if (!cookies.zsd_oauth_state) {
      console.warn('[oauth callback] no zsd_oauth_state cookie; proceeding anyway')
    }

    const token = await exchangeCodeForToken(code)
    console.log('[oauth callback] token resp keys:', Object.keys(token || {}), 'has access_token:', !!token?.access_token)
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

    // 跳回登录发起页（login 时写入的 zsd_oauth_next）；缺省回蒸馏馆 /select。
    // 仅接受同站相对路径，防止 open redirect。
    const rawNext = cookies.zsd_oauth_next || ''
    const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/select'
    // 清掉一次性的 next cookie，且不覆盖 writeSession 写入的 session cookie
    const isProd = process.env.VERCEL_ENV === 'production'
    const existing = res.getHeader('Set-Cookie')
    const prev = Array.isArray(existing) ? existing : existing ? [String(existing)] : []
    res.setHeader('Set-Cookie', [
      ...prev,
      `zsd_oauth_next=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isProd ? '; Secure' : ''}`
    ])
    res.writeHead(302, { Location: next })
    res.end()
  } catch (err) {
    console.error('[oauth callback]', err)
    res.status(500).send(`oauth callback failed: ${err instanceof Error ? err.message : err}`)
  }
}
