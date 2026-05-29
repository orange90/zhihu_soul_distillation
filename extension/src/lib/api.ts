import { getConfig } from './storage'
import type { CollectedAnswer } from './zhihu'

export type UploadResponse = {
  accepted: number
  rejected: Array<{ answer_id: string; reason: string }>
  total_for_user: number | null
}

async function authHeaders(): Promise<Record<string, string>> {
  const { token } = await getConfig()
  if (!token) throw new Error('未配置 Token，请先到 popup 粘贴')
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'X-Plugin-Version': chrome.runtime.getManifest().version
  }
}

export async function pingMe(): Promise<{
  id: string
  name: string
  upload_count?: number
} | null> {
  const { apiBase } = await getConfig()
  const headers = await authHeaders()
  const res = await fetch(`${apiBase}/api/auth/me`, { headers, credentials: 'include' })
  if (!res.ok) throw new Error(`/api/auth/me ${res.status}`)
  const json = await res.json()
  return json.user
}

export async function uploadAnswers(answers: CollectedAnswer[]): Promise<UploadResponse> {
  const { apiBase } = await getConfig()
  const headers = await authHeaders()
  const res = await fetch(`${apiBase}/api/upload-answers`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({ answers })
  })
  const text = await res.text()
  let json: any = {}
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    throw new Error(json.error || `upload failed: ${res.status} ${text}`)
  }
  return json as UploadResponse
}
