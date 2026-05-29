import type { Author, AuthorSkills, ChatMessage, DebateResult, Persona } from '../types'

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let serverMsg = ''
    try {
      const parsed = JSON.parse(text)
      if (parsed && typeof parsed.error === 'string') serverMsg = parsed.error
    } catch {
      // fall through to raw text
    }
    throw new Error(serverMsg || `API ${url} failed: ${res.status} ${text}`)
  }
  return (await res.json()) as T
}

export type DistillStepName =
  | 'cache_hit'
  | 'fetch_answers'
  | 'fetch_answers_done'
  | 'ai_probe'
  | 'ai_probe_done'
  | 'generate_skills'
  | 'generate_skills_done'
  | 'failed'

export type DistillStreamEvent =
  | { type: 'author_start'; author_id: string; index: number; total: number }
  | { type: 'step'; author_id: string; step: DistillStepName; meta?: Record<string, any> }
  | { type: 'author_done'; author_id: string; fromCache: boolean; skills: AuthorSkills }
  | { type: 'author_error'; author_id: string; message: string; code?: string }
  | { type: 'done'; skills: AuthorSkills[]; cacheHits: Record<string, boolean> }
  | { type: 'error'; message: string }

async function distillStream(
  authors: Author[],
  onEvent: (e: DistillStreamEvent) => void
): Promise<{ skills: AuthorSkills[]; cacheHits: Record<string, boolean> }> {
  const res = await fetch('/api/distill?stream=1', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ authors })
  })
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    throw new Error(`API /api/distill stream failed: ${res.status} ${text}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let finalSkills: AuthorSkills[] | null = null
  let finalCacheHits: Record<string, boolean> | null = null
  let finalError: string | null = null
  const collectedSkills: AuthorSkills[] = []
  const collectedCacheHits: Record<string, boolean> = {}

  const dispatch = (eventName: string, dataStr: string) => {
    let payload: any = {}
    try {
      payload = dataStr ? JSON.parse(dataStr) : {}
    } catch {
      return
    }
    const evt = { type: eventName, ...payload } as DistillStreamEvent
    onEvent(evt)
    if (evt.type === 'author_done') {
      if (evt.skills) collectedSkills.push(evt.skills)
      collectedCacheHits[evt.author_id] = !!evt.fromCache
    } else if (evt.type === 'done') {
      finalSkills = evt.skills
      finalCacheHits = evt.cacheHits || {}
    } else if (evt.type === 'error') {
      finalError = evt.message
    }
  }

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const normalized = buffer.replace(/\r\n/g, '\n')
    if (normalized !== buffer) buffer = normalized

    let sepIndex: number
    while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, sepIndex)
      buffer = buffer.slice(sepIndex + 2)
      let eventName = 'message'
      const dataLines: string[] = []
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim()
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
      }
      if (dataLines.length > 0) dispatch(eventName, dataLines.join('\n'))
    }
  }

  // 把残余 buffer 也尝试解析一次（极少数情况：流尾部没有 \n\n）
  if (buffer.trim().length > 0) {
    let eventName = 'message'
    const dataLines: string[] = []
    for (const line of buffer.split('\n')) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim()
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
    }
    if (dataLines.length > 0) dispatch(eventName, dataLines.join('\n'))
  }

  if (finalError) throw new Error(finalError)
  return {
    skills: finalSkills ?? collectedSkills,
    cacheHits: finalCacheHits ?? collectedCacheHits
  }
}

export const api = {
  me: () =>
    jsonFetch<{
      user: {
        id: string
        name: string
        avatar_url?: string
        opted_out?: boolean
        upload_count?: number
      } | null
    }>('/api/auth/me'),

  pluginToken: () =>
    jsonFetch<{ token: string; user: { id: string; name: string; avatar_url?: string } }>(
      '/api/auth/me',
      { method: 'POST', body: JSON.stringify({ action: 'plugin-token' }) }
    ),
  optout: (action: 'add' | 'remove') =>
    jsonFetch<{ opted_out: boolean }>('/api/optout', {
      method: 'POST',
      body: JSON.stringify({ action })
    }),
  loginUrl: () => '/api/auth/login',
  logout: () => jsonFetch('/api/auth/me', { method: 'POST', body: JSON.stringify({ action: 'logout' }) }),

  following: () => jsonFetch<{ authors: Author[] }>('/api/following'),

  distill: (authors: Author[]) =>
    jsonFetch<{ skills: AuthorSkills[]; cacheHits?: Record<string, boolean> }>('/api/distill', {
      method: 'POST',
      body: JSON.stringify({ authors })
    }),

  distillStream,

  persona: (skills: AuthorSkills[]) =>
    jsonFetch<{ persona: Persona }>('/api/persona', {
      method: 'POST',
      body: JSON.stringify({ skills })
    }),

  chat: (persona: Persona, history: ChatMessage[], question: string) =>
    jsonFetch<{ message: ChatMessage }>('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ persona, history, question, mode: 'collective' })
    }),

  debate: (persona: Persona, question: string, rounds = 2) =>
    jsonFetch<{ debate: DebateResult }>('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ persona, question, mode: 'debate', rounds })
    }),

  debateHistory: () =>
    jsonFetch<{
      records: Array<{
        id: string
        question: string
        author_names: string[]
        result: DebateResult
        created_at: string
      }>
    }>('/api/chat'),

  myDistillations: () => jsonFetch<{
    answers: Array<{
      answer_id: string; title: string; excerpt: string
      voteup_count: number; url: string; kind: string; created_at: string
    }>
    total: number; max_answers: number
    distillation_result: {
      rating: string; rating_score: number; skill_desc: string
      skill_markdown: string; answer_count: number; distill_count: number
      last_distilled_at: string
    } | null
    daily_distill_count: number; daily_distill_max: number
  }>('/api/my-distillations'),

  deleteAnswers: (answerIds: string[]) =>
    jsonFetch<{ deleted: number; remaining: number }>('/api/my-distillations', {
      method: 'DELETE',
      body: JSON.stringify({ answer_ids: answerIds })
    }),

  distillSelf: () =>
    jsonFetch<{
      skill_markdown: string; skill_desc: string
      rating: string; rating_score: number; rating_reason: string
      answer_count: number; distill_count: number
    }>('/api/my-distillations', { method: 'POST' }),

  arena: {
    list: async (forceApi = false) => {
      type ArenaListResult = {
        topics: Array<{
          id: string; category: string; title: string
          affirmative_view: string; negative_view: string
          week_key: string; status: string; winner: string | null; ai_judgement: string | null
          participants: Array<{ user_id: string; user_name: string; user_avatar: string; side: string; debater_pos: number }>
          aff_count: number; neg_count: number
        }>
        week_key: string; date?: string
      }
      // CST date (UTC+8)
      // 晚 8 点后辩题可能因冷启动补位而进入辩论/完结状态，静态缓存（10 点快照）已过时，
      // 此时直接走 API 以展示实时状态。
      const cstHour = new Date(Date.now() + 8 * 3600 * 1000).getUTCHours()
      if (!forceApi && cstHour < 20) {
        const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
        try {
          const r = await fetch('/arena-topics.json', { cache: 'no-cache' })
          if (r.ok) {
            const d = await r.json()
            if (d.date === today && Array.isArray(d.topics) && d.topics.length > 0) {
              return d as ArenaListResult & { date: string }
            }
          }
        } catch { /* fall through to API */ }
      }
      return jsonFetch<ArenaListResult>('/api/arena')
    },

    getTopic: (topicId: string) => jsonFetch<{
      topic: any; participants: any[]
    }>(`/api/arena?topicId=${topicId}`),

    join: (topicId: string, side: 'affirmative' | 'negative') =>
      jsonFetch<{ joined: boolean; side: string; debater_pos: number; total_participants: number }>(
        '/api/arena', { method: 'POST', body: JSON.stringify({ action: 'join', topic_id: topicId, side }) }
      )
  },

  bar: {
    get: () => jsonFetch<{
      topic: { id: string; topic: string; date_key: string; status: string; ai_summary: string | null } | null
      sessions: Array<{
        user_id: string; user_name: string; user_avatar: string
        table_num: number; seat_num: number; speech: string | null; generated_at: string | null
      }>
      total_seats: number; is_active: boolean; is_published: boolean
    }>('/api/bar'),

    join: () => jsonFetch<{ joined: boolean; table_num: number; seat_num: number }>(
      '/api/bar', { method: 'POST', body: JSON.stringify({ action: 'join' }) }
    ),

    history: () => jsonFetch<{
      topics: Array<{
        id: string; topic: string; date_key: string; status: string; ai_summary: string | null
      }>
    }>('/api/bar?history=1'),

    getByDate: (date: string) => jsonFetch<{
      topic: { id: string; topic: string; date_key: string; status: string; ai_summary: string | null }
      sessions: Array<{
        user_id: string; user_name: string; user_avatar: string
        table_num: number; seat_num: number; speech: string | null; generated_at: string | null
      }>
      total_seats: number; is_active: boolean; is_published: boolean
    }>(`/api/bar?date=${date}`)
  },

  leaderboard: () => jsonFetch<{
    scores: Array<{
      user_id: string; user_name: string; user_avatar: string | null; score: number; rank: number
    }>
    week_key: string; my_rank: number | null
  }>('/api/arena?action=leaderboard')
}
