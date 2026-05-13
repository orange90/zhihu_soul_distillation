import { createHmac } from 'node:crypto'

const OPENAPI_BASE = process.env.ZHIHU_OPENAPI_BASE_URL || 'https://openapi.zhihu.com'
const AGENT_BASE = process.env.LLM_BASE_URL || process.env.ZHIHU_AGENT_BASE_URL || 'https://api.zhihu.com'

function buildHmacHeaders(): Record<string, string> {
  const appKey = process.env.ZHIHU_APP_KEY || ''
  const appSecret = process.env.ZHIHU_APP_SECRET || ''
  if (!appKey || !appSecret) return {}
  const ts = Math.floor(Date.now() / 1000).toString()
  const logId = `request_${Date.now()}`
  const extraInfo = ''
  const signStr = `app_key:${appKey}|ts:${ts}|logid:${logId}|extra_info:${extraInfo}`
  const signature = createHmac('sha256', appSecret).update(signStr).digest('base64')
  return {
    'X-App-Key': appKey,
    'X-Timestamp': ts,
    'X-Log-Id': logId,
    'X-Sign': signature,
    'X-Extra-Info': extraInfo,
  }
}

export type ZhihuUser = {
  id: string
  name: string
  avatar_url?: string
  headline?: string
}

export type ZhihuTokenResp = {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  user_id?: string
  uid?: string
  user_name?: string
}

export function buildAuthorizeUrl(state: string) {
  const appId = process.env.ZHIHU_APP_ID || process.env.ZHIHU_CLIENT_ID || ''
  const redirectUri = process.env.ZHIHU_REDIRECT_URI || ''
  const url = new URL('/authorize', OPENAPI_BASE)
  url.searchParams.set('app_id', appId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  if (state) url.searchParams.set('state', state)
  return url.toString()
}

export async function exchangeCodeForToken(code: string): Promise<ZhihuTokenResp> {
  const appId = process.env.ZHIHU_APP_ID || process.env.ZHIHU_CLIENT_ID || ''
  const appKey = process.env.ZHIHU_OAUTH_APP_KEY || process.env.ZHIHU_CLIENT_SECRET || ''
  const redirectUri = process.env.ZHIHU_REDIRECT_URI || ''
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    app_id: appId,
    app_key: appKey,
    code,
    redirect_uri: redirectUri
  })
  const res = await fetch(`${OPENAPI_BASE}/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })
  if (!res.ok) {
    throw new Error(`zhihu oauth exchange failed: ${res.status} ${await res.text()}`)
  }
  return (await res.json()) as ZhihuTokenResp
}

export async function fetchMe(accessToken: string): Promise<ZhihuUser> {
  const res = await fetch(`${OPENAPI_BASE}/user`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  if (!res.ok) throw new Error(`fetchMe failed: ${res.status}`)
  const j: any = await res.json()
  return {
    id: String(j.uid || j.id || j.user_id || ''),
    name: j.fullname || j.name || '知乎用户',
    avatar_url: j.avatar_path || j.avatar_url || j.avatar,
    headline: j.headline
  }
}

export type ZhihuFollowingItem = {
  id: string
  name: string
  avatar_url?: string
  headline?: string
  follower_count?: number
}

export async function fetchFollowing(
  accessToken: string,
  opts: { limit?: number } = {}
): Promise<ZhihuFollowingItem[]> {
  const perPage = opts.limit ?? 50
  const res = await fetch(`${OPENAPI_BASE}/user/followed?page=0&per_page=${perPage}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  if (!res.ok) throw new Error(`fetchFollowing failed: ${res.status} ${await res.text()}`)
  const j: any = await res.json()
  const list: any[] = Array.isArray(j) ? j : (j.data || j.users || j.list || [])
  return list.map((u) => ({
    id: String(u.uid || u.id || u.user_id),
    name: u.fullname || u.name || '匿名用户',
    avatar_url: u.avatar_path || u.avatar_url || u.avatar,
    headline: u.headline,
    follower_count: u.follower_count
  }))
}

export type ZhihuSearchAnswer = {
  title: string
  excerpt: string
  voteup_count: number
  url?: string
  author_name?: string
}

export async function searchByAuthor(authorName: string, top = 10): Promise<ZhihuSearchAnswer[]> {
  const path = `/api/v1/content/zhihu_search`
  const url = `${OPENAPI_BASE}${path}?query=${encodeURIComponent(authorName)}&limit=${top}`
  const headers = buildHmacHeaders()
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`search failed for ${authorName}: ${res.status}`)
  const j: any = await res.json()
  const items: any[] = j.data || j.results || j.list || []
  return items.slice(0, top).map((it) => ({
    title: it.title || it.question?.title || '',
    excerpt: it.excerpt || it.content || it.summary || '',
    voteup_count: Number(it.voteup_count || it.vote_up || it.likes || 0),
    url: it.url,
    author_name: it.author?.name || it.author_name
  }))
}

export type ChatTurn = { role: 'system' | 'user' | 'assistant'; content: string }

export async function chatCompletion(messages: ChatTurn[], opts: { temperature?: number } = {}) {
  const token = process.env.LLM_API_KEY || process.env.ZHIHU_AGENT_TOKEN || ''
  const model = process.env.LLM_MODEL || undefined
  const res = await fetch(`${AGENT_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({
      ...(model ? { model } : {}),
      messages,
      temperature: opts.temperature ?? 0.5,
      stream: false
    })
  })
  if (!res.ok) {
    throw new Error(`chat completion failed: ${res.status} ${await res.text()}`)
  }
  const j: any = await res.json()
  const content: string =
    j.choices?.[0]?.message?.content ||
    j.message?.content ||
    j.content ||
    ''
  return { content, raw: j }
}

export function extractFirstJson<T = any>(text: string): T | null {
  if (!text) return null
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fence ? fence[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  const slice = candidate.slice(start, end + 1)
  try {
    return JSON.parse(slice) as T
  } catch {
    return null
  }
}
