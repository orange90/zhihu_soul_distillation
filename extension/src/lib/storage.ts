export type ExtensionConfig = {
  apiBase: string
  token: string
}

const DEFAULT_API_BASE = 'http://localhost:3000'

export async function getConfig(): Promise<ExtensionConfig> {
  const stored = await chrome.storage.local.get(['apiBase', 'token'])
  return {
    apiBase: (stored.apiBase as string) || DEFAULT_API_BASE,
    token: (stored.token as string) || ''
  }
}

export async function setConfig(patch: Partial<ExtensionConfig>): Promise<void> {
  const updates: Record<string, string> = {}
  if (typeof patch.apiBase === 'string') updates.apiBase = patch.apiBase
  if (typeof patch.token === 'string') updates.token = patch.token
  await chrome.storage.local.set(updates)
}

export async function clearToken(): Promise<void> {
  await chrome.storage.local.remove('token')
}
