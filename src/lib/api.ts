import type { Author, AuthorSkills, ChatMessage, Persona } from '../types'

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API ${url} failed: ${res.status} ${text}`)
  }
  return (await res.json()) as T
}

export const api = {
  me: () => jsonFetch<{ user: { id: string; name: string; avatar_url?: string } | null }>('/api/auth/me'),
  loginUrl: () => '/api/auth/login',
  logout: () => jsonFetch('/api/auth/logout', { method: 'POST' }),

  following: () => jsonFetch<{ authors: Author[] }>('/api/following'),

  distill: (authors: Author[]) =>
    jsonFetch<{ skills: AuthorSkills[] }>('/api/distill', {
      method: 'POST',
      body: JSON.stringify({ authors })
    }),

  persona: (skills: AuthorSkills[]) =>
    jsonFetch<{ persona: Persona }>('/api/persona', {
      method: 'POST',
      body: JSON.stringify({ skills })
    }),

  chat: (persona: Persona, history: ChatMessage[], question: string) =>
    jsonFetch<{ message: ChatMessage }>('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ persona, history, question })
    })
}
