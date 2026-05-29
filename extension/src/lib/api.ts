import { getConfig, setConfig } from './storage'
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

// 把插件观察到的 zhihu url_token 上报给后端，换一份"烙进 linked_url_token"的新 bearer，
// 后续上传时后端就能识别 author_id 与 OAuth uid 之外的另一种本人 id。
// 幂等：若已为同一 url_token 链接过，直接返回当前配置。
export async function ensureLinkedUrlToken(urlToken: string): Promise<{
  linked: boolean
  note: string
}> {
  const cfg = await getConfig()
  if (!urlToken) return { linked: false, note: '未提供 url_token' }
  if (!cfg.token) return { linked: false, note: '尚未配置 Token，先到 popup 粘贴后再来' }
  if (cfg.linkedUrlToken === urlToken) return { linked: true, note: 'already linked' }

  const url = `${cfg.apiBase}/api/auth/plugin-token`
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.token}`
      },
      credentials: 'include',
      body: JSON.stringify({ url_token: urlToken })
    })
  } catch (e: any) {
    return { linked: false, note: `link 请求失败：${e?.message || e}` }
  }
  const text = await res.text()
  let json: any = {}
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    /* ignore */
  }
  if (!res.ok || !json.token) {
    return { linked: false, note: json.error || `link ${res.status}：${text.slice(0, 160)}` }
  }
  await setConfig({ token: json.token, linkedUrlToken: urlToken })
  return { linked: true, note: '已把当前知乎账号绑定到 Token' }
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
