export type ExtensionConfig = {
  apiBase: string
  token: string
  linkedUrlToken: string
}

// 写死生产 origin；本地开发时由 web-bridge 接收 localhost 的 token 时会同步更新到 localhost。
const DEFAULT_API_BASE = 'https://zhihusoul.cn'

export async function getConfig(): Promise<ExtensionConfig> {
  const stored = await chrome.storage.local.get(['apiBase', 'token', 'linkedUrlToken'])
  return {
    apiBase: (stored.apiBase as string) || DEFAULT_API_BASE,
    token: (stored.token as string) || '',
    linkedUrlToken: (stored.linkedUrlToken as string) || ''
  }
}

export async function setConfig(patch: Partial<ExtensionConfig>): Promise<void> {
  const updates: Record<string, string> = {}
  if (typeof patch.apiBase === 'string') updates.apiBase = patch.apiBase
  if (typeof patch.token === 'string') updates.token = patch.token
  if (typeof patch.linkedUrlToken === 'string') updates.linkedUrlToken = patch.linkedUrlToken
  await chrome.storage.local.set(updates)
}

export async function clearToken(): Promise<void> {
  await chrome.storage.local.remove(['token', 'linkedUrlToken'])
}
