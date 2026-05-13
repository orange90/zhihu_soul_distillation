export type Author = {
  id: string
  name: string
  headline?: string
  avatar_url?: string
  follower_count?: number
}

export type AuthorSkills = {
  author_id: string
  author_name: string
  values: string
  thinking_style: string
  domain: string
  signature_view: string
  weight_score?: number
  raw_answers?: Array<{ title: string; excerpt: string; voteup_count: number; url?: string }>
  updated_at?: string
}

export type Persona = {
  headline: string
  dominant_style: string
  collective_views: string[]
  highlight_authors: Array<{ name: string; reason: string }>
  contributors: AuthorSkills[]
}

export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  citations?: Array<{ author_name: string; text: string }>
}
