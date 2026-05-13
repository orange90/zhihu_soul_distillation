import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import ws from 'ws'

let cached: SupabaseClient | null = null

export function getSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  if (!cached) {
    cached = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { transport: ws as any }
  }
  return cached
}

export const SKILLS_TTL_MS = 30 * 24 * 60 * 60 * 1000
