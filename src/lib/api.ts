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
      '/api/auth/plugin-token',
      { method: 'POST' }
    ),
  optout: (action: 'add' | 'remove') =>
    jsonFetch<{ opted_out: boolean }>('/api/optout', {
      method: 'POST',
      body: JSON.stringify({ action })
    }),
  loginUrl: () => '/api/auth/login',
  logout: () => jsonFetch('/api/auth/logout', { method: 'POST' }),

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
    })
}
