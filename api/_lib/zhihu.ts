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

export type SearchSource = 'zhihu_search' | 'zhihu_openapi' | 'web_search'

export type ZhihuSearchAnswer = {
  title: string
  excerpt: string
  content: string
  voteup_count: number
  url?: string
  author_name?: string
  source?: SearchSource
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

// ──────────────── Multi-Source Search ────────────────

type ZhihuDevSearchOpts = { count?: number; offset?: number }

async function searchZhihuDev(
  query: string,
  opts: ZhihuDevSearchOpts = {}
): Promise<ZhihuSearchAnswer[]> {
  const DEVELOPER_BASE = 'https://developer.zhihu.com'
  const appSecret = getAppSecret()
  if (!appSecret) return []

  const count = Math.min(opts.count || 10, 10)
  const url = new URL(`${DEVELOPER_BASE}/api/v1/content/zhihu_search`)
  url.searchParams.set('Query', query)
  url.searchParams.set('Count', String(count))
  if (opts.offset) url.searchParams.set('Offset', String(opts.offset))

  try {
    const res = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${appSecret}`,
        'X-Request-Timestamp': Math.floor(Date.now() / 1000).toString(),
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      }
    })
    if (!res.ok) return []
    const j: any = await res.json()
    if (j.Code !== 0) return []
    return (j.Data?.Items || []).map((it: any) => ({
      title: it.Title || '',
      excerpt: stripHtml(String(it.ContentText || '')),
      content: stripHtml(String(it.ContentText || '')),
      voteup_count: Number(it.VoteUpCount || 0),
      url: it.Url,
      author_name: it.AuthorName,
      source: 'zhihu_search' as SearchSource
    }))
  } catch {
    return []
  }
}

async function searchViaOpenAPI(keyword: string): Promise<ZhihuSearchAnswer[]> {
  try {
    const appKey = getAppKey()
    const appSecret = getAppSecret()
    if (!appKey || !appSecret) return []

    const res = await zhihuFetch<any>('/openapi/content/search', {
      query: { keyword, type: 'answer', page_size: 20 }
    })
    if (!res.ok || !res.data) return []
    const items: any[] =
      res.data.data?.list || res.data.data?.items ||
      res.data.list || res.data.items || []
    if (!Array.isArray(items)) return []
    return items.map((it: any) => ({
      title: it.title || it.question_title || '',
      excerpt: stripHtml(it.content || it.excerpt || ''),
      content: stripHtml(it.content || it.excerpt || ''),
      voteup_count: Number(it.voteup_count || it.vote_count || 0),
      url: it.url || it.share_url || '',
      author_name: it.author?.name || it.author_name || '',
      source: 'zhihu_openapi' as SearchSource
    }))
  } catch {
    return []
  }
}

function isZhihuContentUrl(url: string): boolean {
  return /\/question\/\d+\/answer\/\d+/.test(url) || url.includes('zhuanlan.zhihu.com/p/')
}

function isAuthorMatch(authorName: string, title: string, content: string): boolean {
  const escaped = authorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const nameRe = new RegExp(`(?:^|[\\s\\-@|·「])${escaped}(?:的回答|的文章|[\\s\\-,，。、：:！!？?」​]|$)`)
  return nameRe.test(title) || nameRe.test(content)
}

function cleanZhihuTitle(raw: string, authorName: string): string {
  return (raw || '')
    .replace(/\s*-\s*知乎$/, '')
    .replace(new RegExp(`\\s*-\\s*${authorName}的回答\\s*-\\s*知乎$`), '')
    .replace(new RegExp(`\\s*-\\s*${authorName}的回答$`), '')
    .trim()
}

async function tavilySearch(apiKey: string, authorName: string): Promise<ZhihuSearchAnswer[]> {
  const queries = [
    `${authorName}的回答 知乎`,
    `${authorName} 知乎答主`,
    `"${authorName}" site:zhihu.com`,
  ]

  const results = await Promise.allSettled(
    queries.map((q) =>
      fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          query: q,
          search_depth: 'advanced',
          include_domains: ['zhihu.com'],
          max_results: 10
        })
      }).then((r) => r.ok ? r.json() : null)
    )
  )

  const all: ZhihuSearchAnswer[] = []
  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value) continue
    for (const item of (r.value.results || [])) {
      const url: string = item.url || ''
      if (!isZhihuContentUrl(url)) continue
      const title: string = item.title || ''
      const content: string = item.content || ''
      if (!isAuthorMatch(authorName, title, content)) continue

      all.push({
        title: cleanZhihuTitle(title, authorName),
        excerpt: stripHtml(content),
        content: stripHtml(content),
        voteup_count: 0,
        url,
        author_name: authorName,
        source: 'web_search' as SearchSource
      })
    }
  }
  return all
}

async function serpSearch(apiKey: string, authorName: string): Promise<ZhihuSearchAnswer[]> {
  try {
    const url = new URL('https://serpapi.com/search.json')
    url.searchParams.set('q', `site:zhihu.com "${authorName}" 回答`)
    url.searchParams.set('api_key', apiKey)
    url.searchParams.set('num', '20')
    const res = await fetch(url.toString())
    if (!res.ok) return []
    const j: any = await res.json()
    return (j.organic_results || [])
      .filter((r: any) => {
        const link: string = r.link || ''
        if (!isZhihuContentUrl(link)) return false
        return isAuthorMatch(authorName, r.title || '', r.snippet || '')
      })
      .map((r: any) => ({
        title: cleanZhihuTitle(r.title || '', authorName),
        excerpt: stripHtml(r.snippet || ''),
        content: stripHtml(r.snippet || ''),
        voteup_count: 0,
        url: r.link,
        author_name: authorName,
        source: 'web_search' as SearchSource
      }))
  } catch {
    return []
  }
}

async function webSearchZhihuAuthor(authorName: string): Promise<ZhihuSearchAnswer[]> {
  const tavilyKey = (process.env.TAVILY_API_KEY || '').trim()
  if (tavilyKey) return tavilySearch(tavilyKey, authorName)

  const serpKey = (process.env.SERP_API_KEY || '').trim()
  if (serpKey) return serpSearch(serpKey, authorName)

  return []
}

// ──────────────── V4 API Content Enrichment ────────────────

function extractAnswerId(url: string): string | null {
  const m = url.match(/\/answer\/(\d+)/)
  return m ? m[1] : null
}

function extractArticleId(url: string): string | null {
  const m = url.match(/zhuanlan\.zhihu\.com\/p\/(\d+)/)
  return m ? m[1] : null
}

type V4Result = {
  author_name: string
  voteup_count: number
  comment_count: number
  content: string
  question_title: string
}

async function fetchAnswerV4(answerId: string): Promise<V4Result | null> {
  try {
    const res = await fetch(
      `https://www.zhihu.com/api/v4/answers/${answerId}?include=data[*].content,excerpt,voteup_count,comment_count`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', 'Accept': 'application/json' } }
    )
    if (!res.ok) return null
    const j: any = await res.json()
    const raw = j.content || j.excerpt || ''
    return {
      author_name: j.author?.name || '',
      voteup_count: Number(j.voteup_count || 0),
      comment_count: Number(j.comment_count || 0),
      content: stripHtml(raw),
      question_title: j.question?.title || ''
    }
  } catch {
    return null
  }
}

async function fetchArticleV4(articleId: string): Promise<V4Result | null> {
  try {
    const res = await fetch(
      `https://www.zhihu.com/api/v4/articles/${articleId}`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', 'Accept': 'application/json' } }
    )
    if (!res.ok) return null
    const j: any = await res.json()
    const raw = j.content || j.excerpt || ''
    return {
      author_name: j.author?.name || '',
      voteup_count: Number(j.voteup_count || 0),
      comment_count: Number(j.comment_count || 0),
      content: stripHtml(raw),
      question_title: j.title || ''
    }
  } catch {
    return null
  }
}

async function enrichWithV4(items: ZhihuSearchAnswer[], authorName: string): Promise<ZhihuSearchAnswer[]> {
  const tasks = items.map(async (item) => {
    const url = item.url || ''
    const answerId = extractAnswerId(url)
    const articleId = answerId ? null : extractArticleId(url)
    if (!answerId && !articleId) return item

    const v4 = answerId
      ? await fetchAnswerV4(answerId)
      : await fetchArticleV4(articleId!)
    if (!v4) return item

    // V4 gives us the real author — verify it matches
    if (v4.author_name && v4.author_name.trim() !== authorName.trim()) {
      return null // wrong author, discard
    }

    return {
      ...item,
      author_name: v4.author_name || item.author_name,
      voteup_count: v4.voteup_count || item.voteup_count,
      title: v4.question_title || item.title,
      content: v4.content.length > (item.content?.length || 0) ? v4.content : item.content,
      excerpt: v4.content.length > (item.excerpt?.length || 0) ? v4.content : item.excerpt,
    } as ZhihuSearchAnswer
  })

  const results = await Promise.allSettled(tasks)
  return results
    .filter((r): r is PromiseFulfilledResult<ZhihuSearchAnswer | null> => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter((v): v is ZhihuSearchAnswer => v !== null)
}

// ──────────────── Orchestrator ────────────────

export async function searchByAuthor(authorName: string, top = 10): Promise<ZhihuSearchAnswer[]> {
  const seenKeys = new Set<string>()
  const all: ZhihuSearchAnswer[] = []

  const addUnique = (items: ZhihuSearchAnswer[]) => {
    for (const item of items) {
      const key = item.url || `${item.title}::${(item.author_name || '').trim()}`
      if (!key || seenKeys.has(key)) continue
      seenKeys.add(key)
      all.push(item)
    }
  }

  // Phase 1: Run multiple Zhihu search queries + OpenAPI in parallel
  const searches = await Promise.allSettled([
    searchZhihuDev(authorName, { count: 10 }),
    searchZhihuDev(`${authorName} 回答`, { count: 10 }),
    searchZhihuDev(`${authorName} 文章`, { count: 10 }),
    searchZhihuDev(authorName, { count: 10, offset: 10 }),
    searchViaOpenAPI(authorName),
  ])
  for (const r of searches) {
    if (r.status === 'fulfilled') addUnique(r.value)
  }

  // Phase 2: Filter by author name
  const normalized = authorName.trim()
  const exactMatches = all.filter((a) => (a.author_name || '').trim() === normalized)

  // Phase 3: Web search fallback when exact matches are insufficient
  if (exactMatches.length < 5) {
    try {
      const webResults = await webSearchZhihuAuthor(authorName)
      addUnique(webResults)
    } catch { /* skip */ }
  }

  // Phase 4: Enrich thin results (web search / short content) via Zhihu v4 API
  // Picks items that have a URL but short content — these are web search results
  const needEnrich = all.filter((a) => a.url && (a.content?.length || 0) < 200)
  if (needEnrich.length > 0) {
    try {
      const enriched = await enrichWithV4(needEnrich, normalized)
      // Replace original items with enriched versions
      for (const e of enriched) {
        const idx = all.findIndex((a) => a.url === e.url)
        if (idx >= 0) all[idx] = e
      }
      // Remove items that were discarded (wrong author)
      const discardedUrls = new Set(
        needEnrich
          .filter((orig) => !enriched.some((e) => e.url === orig.url))
          .map((a) => a.url)
      )
      for (let i = all.length - 1; i >= 0; i--) {
        if (all[i].url && discardedUrls.has(all[i].url)) all.splice(i, 1)
      }
    } catch { /* skip enrichment errors */ }
  }

  // Final: prefer exact author matches, sort by votes
  const finalExact = all.filter((a) => (a.author_name || '').trim() === normalized)
  const pool = finalExact.length >= 3 ? finalExact : all
  pool.sort((a, b) => (b.voteup_count || 0) - (a.voteup_count || 0))
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
