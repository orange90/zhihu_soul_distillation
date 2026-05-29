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
  const url = `${apiBase}/api/auth/me`
  let res: Response
  try {
    res = await fetch(url, { headers, credentials: 'include' })
  } catch (e: any) {
    throw new Error(`无法连接到 ${url}（${e?.message || e}）`)
  }
  if (!res.ok) throw new Error(`/api/auth/me ${res.status}`)
  const json = await res.json()
  return json.user
}

export async function uploadAnswers(answers: CollectedAnswer[]): Promise<UploadResponse> {
  const { apiBase } = await getConfig()
  const headers = await authHeaders()
  const url = `${apiBase}/api/upload-answers`
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ answers })
    })
  } catch (e: any) {
    // "Failed to fetch" 没有 HTTP 状态——请求根本没到服务器
    throw new Error(
      `无法连接到 ${url}（${e?.message || e}）。请检查：1) popup 里的后端地址是否填对；` +
        `2) 后端服务是否已启动；3) 该后端是否部署了 /api/upload-answers 接口；` +
        `4) chrome://extensions 找到本扩展，点 "service worker" 看 Network 标签查看实际错误。`
    )
  }
  const text = await res.text()
  let json: any = {}
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    throw new Error(json.error || `upload failed: ${res.status} ${text.slice(0, 200)}`)
  }
  return json as UploadResponse
}
