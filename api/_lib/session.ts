import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHmac, timingSafeEqual } from 'node:crypto'

const COOKIE_NAME = 'zsd_session'
const MAX_AGE = 60 * 60 * 24 * 7

export type SessionData = {
  user_id: string
  user_name: string
  avatar_url?: string
  access_token: string
  refresh_token?: string
  expires_at?: number
}

function getSecret(): string {
  return process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'dev-only-secret-change-me'
}

function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('base64url')
}

export function encodeSession(data: SessionData): string {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url')
  const sig = sign(payload)
  return `${payload}.${sig}`
}

export function decodeSession(value: string | undefined): SessionData | null {
  if (!value) return null
  const [payload, sig] = value.split('.')
  if (!payload || !sig) return null
  const expected = sign(payload)
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  } catch {
    return null
  }
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionData
  } catch {
    return null
  }
}

function parseCookies(req: VercelRequest): Record<string, string> {
  const header = req.headers.cookie
  if (!header) return {}
  return Object.fromEntries(
    header.split(';').map((c) => {
      const [k, ...v] = c.trim().split('=')
      return [k, decodeURIComponent(v.join('='))]
    })
  )
}

export function readSession(req: VercelRequest): SessionData | null {
  const cookies = parseCookies(req)
  return decodeSession(cookies[COOKIE_NAME])
}

export function writeSession(res: VercelResponse, data: SessionData) {
  const value = encodeSession(data)
  const isProd = process.env.VERCEL_ENV === 'production'
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${isProd ? '; Secure' : ''}`
  )
}

export function clearSession(res: VercelResponse) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
}
