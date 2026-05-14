// 知乎社区 API 封装
// 鉴权机制：AK/SK + HMAC-SHA256 签名（参考 https://www.zhihu.com/ring/moltbook 快速开始）
// 待签名串：app_key:{app_key}|ts:{ts}|logid:{log_id}|extra_info:{extra_info}
// 签名：HMAC-SHA256(待签名串, app_secret) -> Base64
// 必填请求头：X-App-Key, X-Timestamp, X-Log-Id, X-Sign, X-Extra-Info
import { createHmac, randomUUID } from 'crypto'

const OAUTH_BASE = process.env.ZHIHU_OAUTH_BASE_URL || 'https://www.zhihu.com'
const OPENAPI_BASE = (process.env.ZHIHU_OPENAPI_BASE_URL || 'https://openapi.zhihu.com').replace(/\/$/, '')

function getAppKey(): string {
  return (process.env.ZHIHU_APP_KEY || '').trim()
}
function getAppSecret(): string {
  return (process.env.ZHIHU_APP_SECRET || '').trim()
}

export type SignedHeaders = {
  'X-App-Key': string
  'X-Timestamp': string
  'X-Log-Id': string
  'X-Sign': string
  'X-Extra-Info': string
}

export function signRequest(extraInfo = ''): SignedHeaders {
  const appKey = getAppKey()
  const appSecret = getAppSecret()
  if (!appKey || !appSecret) {
    throw new Error('ZHIHU_APP_KEY / ZHIHU_APP_SECRET 未配置')
  }
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const logId = `request_${Date.now()}_${randomUUID().replace(/-/g, '').slice(0, 12)}`
  const signStr = `app_key:${appKey}|ts:${timestamp}|logid:${logId}|extra_info:${extraInfo}`
  const sign = createHmac('sha256', appSecret).update(signStr).digest('base64')
  return {
    'X-App-Key': appKey,
    'X-Timestamp': timestamp,
    'X-Log-Id': logId,
    'X-Sign': sign,
    'X-Extra-Info': extraInfo
  }
}

export type ZhihuFetchOptions = {
  method?: string
  query?: Record<string, string | number | undefined>
  body?: any
  extraInfo?: string
  headers?: Record<string, string>
}

export async function zhihuFetch<T = any>(
  path: string,
  opts: ZhihuFetchOptions = {}
): Promise<{ status: number; ok: boolean; data: T | null; raw: string; headers: SignedHeaders }> {
  const { method = 'GET', query, body, extraInfo = '', headers = {} } = opts
  const url = new URL(path.startsWith('http') ? path : OPENAPI_BASE + (path.startsWith('/') ? path : '/' + path))
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
    }
  }
  const signed = signRequest(extraInfo)
  const finalHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...signed,
    ...headers
  }
  let payload: any
  if (body !== undefined && body !== null) {
    if (typeof body === 'string' || body instanceof URLSearchParams) {
      payload = body as any
    } else {
      payload = JSON.stringify(body)
      finalHeaders['Content-Type'] = finalHeaders['Content-Type'] || 'application/json'
    }
  }
  const res = await fetch(url.toString(), { method, headers: finalHeaders, body: payload })
  const raw = await res.text()
  let data: any = null
  try {
    data = raw ? JSON.parse(raw) : null
  } catch {
    data = null
  }
  return { status: res.status, ok: res.ok, data, raw, headers: signed }
}

export type ZhihuRingInfo = {
  ring_id: string
  ring_name: string
  ring_desc?: string
  ring_avatar?: string
  membership_num?: number
  discussion_num?: number
}

export type ZhihuRingPin = {
  pin_id: number | string
  content?: string
  author_name?: string
  publish_time?: number
  upvote_num?: number
  comment_num?: number
  share_num?: number
  fav_num?: number
}

export type ZhihuRingDetail = {
  ring_info: ZhihuRingInfo
  contents: ZhihuRingPin[]
}

export async function getRingDetail(
  ringId: string,
  opts: { pageNum?: number; pageSize?: number } = {}
): Promise<ZhihuRingDetail> {
  const { pageNum = 1, pageSize = 20 } = opts
  const res = await zhihuFetch<{ status: number; msg: string; data: ZhihuRingDetail }>(
    '/openapi/ring/detail',
    { query: { ring_id: ringId, page_num: pageNum, page_size: pageSize } }
  )
  if (!res.ok || !res.data) {
    throw new Error(`getRingDetail failed: HTTP ${res.status} ${res.raw.slice(0, 200)}`)
  }
  if (res.data.status !== 0) {
    throw new Error(`getRingDetail business error: ${JSON.stringify(res.data).slice(0, 200)}`)
  }
  return res.data.data
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
  const appId = process.env.ZHIHU_APP_ID || ''
  const redirectUri = process.env.ZHIHU_REDIRECT_URI || ''
  const url = new URL('/authorize', OPENAPI_BASE)
  url.searchParams.set('app_id', appId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  if (state) url.searchParams.set('state', state)
  return url.toString()
}

export async function exchangeCodeForToken(code: string): Promise<ZhihuTokenResp> {
  const appId = process.env.ZHIHU_APP_ID || ''
  const appKey = process.env.ZHIHU_OAUTH_APP_KEY || ''
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
  opts: { limit?: number; perPage?: number; maxPages?: number; throttleAfter?: number; throttleMs?: number } = {}
): Promise<ZhihuFollowingItem[]> {
  const perPage = opts.perPage ?? 50
  const maxTotal = opts.limit ?? Infinity
  const maxPages = opts.maxPages ?? 1000
  const throttleAfter = opts.throttleAfter ?? 5000
  const throttleMs = opts.throttleMs ?? 300

  const seen = new Set<string>()
  const out: ZhihuFollowingItem[] = []

  for (let page = 0; page < maxPages; page++) {
    if (page > 0 && out.length >= throttleAfter) {
      await new Promise((r) => setTimeout(r, throttleMs))
    }

    const res = await fetch(
      `${OPENAPI_BASE}/user/followed?page=${page}&per_page=${perPage}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!res.ok) {
      throw new Error(`fetchFollowing failed: ${res.status} ${await res.text()}`)
    }
    const j: any = await res.json()
    const list: any[] = Array.isArray(j) ? j : (j.data || j.users || j.list || [])
    if (!list.length) break

    let added = 0
    for (const u of list) {
      const id = String(u.uid || u.id || u.user_id || '')
      if (!id || seen.has(id)) continue
      seen.add(id)
      out.push({
        id,
        name: u.fullname || u.name || '匿名用户',
        avatar_url: u.avatar_path || u.avatar_url || u.avatar,
        headline: u.headline,
        follower_count: u.follower_count
      })
      added++
      if (out.length >= maxTotal) break
    }

    if (out.length >= maxTotal) break
    // 不足一整页，说明已到末尾；本页全部重复也提前退出，避免接口忽略 page 参数时的死循环
    if (list.length < perPage || added === 0) break
  }

  return out
}

export type ZhihuSearchAnswer = {
  title: string
  excerpt: string
  content: string
  voteup_count: number
  url?: string
  author_name?: string
}

function stripHtml(html: string): string {
  if (!html) return ''
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function searchByAuthor(authorName: string, top = 10): Promise<ZhihuSearchAnswer[]> {
  const DEVELOPER_BASE = 'https://developer.zhihu.com'
  const appSecret = getAppSecret()
  if (!appSecret) throw new Error('ZHIHU_APP_SECRET 未配置')

  const count = Math.min(top, 10)
  const url = new URL(`${DEVELOPER_BASE}/api/v1/content/zhihu_search`)
  url.searchParams.set('Query', authorName)
  url.searchParams.set('Count', String(count))

  const res = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${appSecret}`,
      'X-Request-Timestamp': Math.floor(Date.now() / 1000).toString(),
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }
  })
  if (!res.ok) throw new Error(`search failed for ${authorName}: ${res.status}`)
  const j: any = await res.json()
  if (j.Code !== 0) throw new Error(`search error for ${authorName}: ${j.Message || j.Code}`)
  const items: any[] = j.Data?.Items || []

  const mapped = items.map((it) => {
    const contentText = stripHtml(String(it.ContentText || ''))
    return {
      title: it.Title || '',
      excerpt: contentText,
      content: contentText,
      voteup_count: Number(it.VoteUpCount || 0),
      url: it.Url,
      author_name: it.AuthorName
    } as ZhihuSearchAnswer
  })

  const normalized = authorName.trim()
  const exact = mapped.filter((a) => (a.author_name || '').trim() === normalized)
  const pool = exact.length > 0 ? exact : mapped
  return pool.slice(0, top)
}

export type ChatTurn = { role: 'system' | 'user' | 'assistant'; content: string }

export async function chatCompletion(
  messages: ChatTurn[],
  opts: { temperature?: number; timeoutMs?: number; maxRetries?: number } = {}
) {
  const apiKey = (process.env.LLM_API_KEY || '').trim()
  const baseUrl = (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
  const model = (process.env.LLM_MODEL || 'gpt-3.5-turbo').trim()
  if (!apiKey) {
    throw new Error('LLM_API_KEY 未配置')
  }

  const timeoutMs = opts.timeoutMs ?? 25_000
  const maxRetries = opts.maxRetries ?? 1
  const payload = JSON.stringify({
    model,
    messages,
    temperature: opts.temperature ?? 0.5,
    stream: false
  })

  let lastErr: any = null
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: payload,
        signal: ctrl.signal
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        const retriable = res.status === 429 || res.status >= 500
        const err = new Error(`chat completion failed: ${res.status} ${text.slice(0, 200)}`)
        if (retriable && attempt < maxRetries) {
          lastErr = err
          const wait = 800 * Math.pow(2, attempt) + Math.floor(Math.random() * 400)
          await new Promise((r) => setTimeout(r, wait))
          continue
        }
        throw err
      }
      const j: any = await res.json()
      const content: string =
        j.choices?.[0]?.message?.content ||
        j.message?.content ||
        j.content ||
        ''
      return { content, raw: j }
    } catch (e: any) {
      const isAbort = e?.name === 'AbortError'
      lastErr = isAbort ? new Error(`chat completion timeout after ${timeoutMs}ms`) : e
      if (attempt < maxRetries) {
        const wait = 800 * Math.pow(2, attempt) + Math.floor(Math.random() * 400)
        await new Promise((r) => setTimeout(r, wait))
        continue
      }
      throw lastErr
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastErr || new Error('chat completion failed')
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
