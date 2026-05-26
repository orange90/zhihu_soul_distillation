export type Author = {
  id: string
  name: string
  headline?: string
  avatar_url?: string
  follower_count?: number
  opted_out?: boolean
}

export type AuthorSkills = {
  author_id: string
  author_name: string
  avatar_url?: string
  values: string
  thinking_style: string
  domain: string
  signature_view: string
  skill_markdown?: string
  skill_desc?: string
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
  speaker?: string
  round?: number
}

export type DebateTurn = {
  author_id: string
  author_name: string
  stance?: string
  content: string
}

export type DebateRound = {
  round: number
  topic_focus?: string
  turns: DebateTurn[]
}

export type DebateResult = {
  question: string
  rounds: DebateRound[]
  consensus: string[]
  divergences: string[]
  summary: string
}
