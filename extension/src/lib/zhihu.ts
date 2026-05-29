// 解析知乎页面上当前登录用户、抓取当前用户的回答 / 文章。
// 全程使用知乎自身已登录态的 Cookie，浏览器自动带上；插件只负责"协助点选"，
// 抓到的内容仍由后端做 author_id === session.user_id 的强校验，避免代他人上传。

export type ZhihuMe = {
  id: string // url_token 形式不可靠；这里返回 v4 API 返回的 id
  url_token: string
  name: string
  avatar_url?: string
}

export type CollectedAnswer = {
  answer_id: string
  author_id: string
  title: string
  content: string
  excerpt: string
  voteup_count: number
  url: string
  kind: 'answer' | 'article'
}

// 入参：上送给后端的 author_id，对应 me.id（即 v4 API 中当前用户的 id）。
// 知乎 v4 多个返回字段里 author/me 用的是 url_token 而不是 numeric id；
// 我们以 v4 /api/v4/me 返回的 id 字段为准，与之前 OAuth 写入 session 的 user_id 一致。

async function jsonFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) throw new Error(`zhihu fetch ${url} -> ${res.status}`)
  return (await res.json()) as T
}

export async function fetchMe(): Promise<ZhihuMe> {
  // v4 me 接口返回的 id 是 url_token 字符串；老一些的接口返回的是 uid。
  // 我们这里直接使用 url_token 作为 author_id（与现有后端 /api/following 的 id 字段一致）。
  const data = await jsonFetch<any>(
    'https://www.zhihu.com/api/v4/me?include=name,avatar_url,url_token'
  )
  return {
    id: String(data.url_token || data.id || ''),
    url_token: String(data.url_token || ''),
    name: String(data.name || ''),
    avatar_url: data.avatar_url || undefined
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// 批量拉取当前登录用户的所有回答（分页）。
// 知乎 v4 接口：/api/v4/members/<url_token>/answers，分页参数 offset/limit。
export async function fetchAllMyAnswers(
  urlToken: string,
  onProgress?: (current: number, total: number | null) => void
): Promise<CollectedAnswer[]> {
  const collected: CollectedAnswer[] = []
  let offset = 0
  const limit = 20
  let total: number | null = null
  // 防失控保险
  for (let i = 0; i < 100; i++) {
    const url =
      `https://www.zhihu.com/api/v4/members/${encodeURIComponent(urlToken)}/answers` +
      `?offset=${offset}&limit=${limit}` +
      `&include=data%5B*%5D.is_normal%2Cvoteup_count%2Ccontent%2Cexcerpt%2Cquestion.title%2Curl`
    let payload: any
    try {
      payload = await jsonFetch<any>(url)
    } catch (e) {
      console.warn('[zsd] fetchAnswers failed at offset', offset, e)
      break
    }
    const items: any[] = payload?.data || []
    total = payload?.paging?.totals ?? total
    for (const it of items) {
      const content = stripHtml(String(it.content || ''))
      if (!content) continue
      collected.push({
        answer_id: String(it.id || it.answer_id || ''),
        author_id: String(it.author?.url_token || it.author?.id || ''),
        title: String(it.question?.title || ''),
        content,
        excerpt: stripHtml(String(it.excerpt || '')).slice(0, 240) || content.slice(0, 200),
        voteup_count: Number(it.voteup_count) || 0,
        url:
          it.url ||
          (it.question?.id && it.id
            ? `https://www.zhihu.com/question/${it.question.id}/answer/${it.id}`
            : ''),
        kind: 'answer'
      })
    }
    onProgress?.(collected.length, total)
    if (items.length === 0 || payload?.paging?.is_end) break
    offset += limit
  }
  return collected
}

// 通过 Zhihu v4 API 获取回答的完整正文（解决 DOM 截断问题）。
export async function fetchFullAnswerContent(answerId: string): Promise<string> {
  try {
    const data = await jsonFetch<any>(
      `https://www.zhihu.com/api/v4/answers/${answerId}?include=content`
    )
    const raw = data.content || data.excerpt || ''
    return raw ? stripHtml(raw) : ''
  } catch {
    return ''
  }
}

// 从单个回答 DOM 提取（用于手动勾选模式）。answer 容器要带 data-zop / data-za-detail-view-path-module=AnswerItem。
export function parseAnswerElement(el: Element): CollectedAnswer | null {
  const zop = el.getAttribute('data-zop')
  if (!zop) return null
  let meta: any
  try {
    meta = JSON.parse(zop)
  } catch {
    return null
  }
  const answerId = String(meta.itemId || '')
  const authorId = String(meta.authorMemberHash || meta.authorId || '')
  if (!answerId) return null

  const titleEl = el.querySelector(
    '.QuestionItem-title, .ContentItem-title, h2'
  ) as HTMLElement | null
  const contentEl = el.querySelector(
    '.RichContent-inner, .RichText, .content'
  ) as HTMLElement | null
  const voteEl = el.querySelector(
    '.VoteButton--up .Button-label, .VoteButton .Button-label, .VoteButton'
  ) as HTMLElement | null
  const linkEl = el.querySelector('a[href*="/answer/"]') as HTMLAnchorElement | null

  const content = stripHtml(contentEl?.innerHTML || '')
  const voteText = (voteEl?.textContent || '').trim()
  const voteup_count = parseVote(voteText)

  return {
    answer_id: answerId,
    author_id: authorId,
    title: (titleEl?.textContent || '').trim(),
    content,
    excerpt: content.slice(0, 200),
    voteup_count,
    url: linkEl?.href || '',
    kind: 'answer'
  }
}

function parseVote(s: string): number {
  // "赞同 1.2 万"、"赞同 233"
  const m = s.match(/([\d.]+)\s*(万|w|k)?/i)
  if (!m) return 0
  let n = parseFloat(m[1])
  if (!isFinite(n)) return 0
  const unit = (m[2] || '').toLowerCase()
  if (unit === '万' || unit === 'w') n *= 10000
  else if (unit === 'k') n *= 1000
  return Math.round(n)
}
