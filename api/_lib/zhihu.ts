// 知乎开放平台 API 封装
// 注意：知乎 OAuth 与 OpenAPI 的精确字段以官方文档为准；这里以 plan.md 描述与常见 OAuth2 流程实现，
// 字段做了健壮性兼容（兼容多种命名），如发现接口字段不一致可在此集中修改。

const OAUTH_BASE = process.env.ZHIHU_OAUTH_BASE_URL || 'https://www.zhihu.com'
const OPENAPI_BASE = process.env.ZHIHU_OPENAPI_BASE_URL || 'https://api.zhihu.com'
const AGENT_BASE = process.env.ZHIHU_AGENT_BASE_URL || 'https://api.zhihu.com'

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
  const clientId = process.env.ZHIHU_CLIENT_ID || ''
  const redirectUri = process.env.ZHIHU_REDIRECT_URI || ''
  const url = new URL('/oauth/authorize', OAUTH_BASE)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'basic')
  url.searchParams.set('state', state)
  return url.toString()
}

export async function exchangeCodeForToken(code: string): Promise<ZhihuTokenResp> {
  const clientId = process.env.ZHIHU_CLIENT_ID || ''
  const clientSecret = process.env.ZHIHU_CLIENT_SECRET || ''
  const redirectUri = process.env.ZHIHU_REDIRECT_URI || ''
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri
  })
  const res = await fetch(`${OAUTH_BASE}/oauth/token`, {
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
  const res = await fetch(`${OPENAPI_BASE}/openapi/user/me`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  if (!res.ok) throw new Error(`fetchMe failed: ${res.status}`)
  const j: any = await res.json()
  return {
    id: String(j.id || j.user_id || j.uid || ''),
    name: j.name || j.user_name || '知乎用户',
    avatar_url: j.avatar_url || j.avatar,
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
  const limit = opts.limit ?? 50
  const res = await fetch(`${OPENAPI_BASE}/openapi/user/following?limit=${limit}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  if (!res.ok) throw new Error(`fetchFollowing failed: ${res.status} ${await res.text()}`)
  const j: any = await res.json()
  const list: any[] = j.data || j.users || j.list || []
  return list.map((u) => ({
    id: String(u.id || u.user_id || u.uid),
    name: u.name || u.user_name || '匿名用户',
    avatar_url: u.avatar_url || u.avatar,
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
  const url = `${OPENAPI_BASE}/api/v1/content/zhihu_search?query=${encodeURIComponent(authorName)}&limit=${top}`
  const token = process.env.ZHIHU_AGENT_TOKEN || ''
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  })
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
  const token = process.env.ZHIHU_AGENT_TOKEN || ''
  const res = await fetch(`${AGENT_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({
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
