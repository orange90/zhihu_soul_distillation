import type { VercelRequest, VercelResponse } from '@vercel/node'

// 允许的扩展 origin。开发期默认放行所有 chrome-extension://* 与 moz-extension://*；
// 生产可通过 EXTENSION_ALLOWED_ORIGIN（逗号分隔）显式锁定具体 extension id。
function isAllowedExtensionOrigin(origin: string): boolean {
  if (!origin) return false
  if (!/^(chrome|moz)-extension:\/\//.test(origin)) return false
  const allow = process.env.EXTENSION_ALLOWED_ORIGIN
  if (!allow) return true
  return allow
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(origin)
}

// 给插件可调用的接口加 CORS 头。返回 true 表示已处理完 OPTIONS preflight，调用方应直接 return。
export function applyExtensionCors(req: VercelRequest, res: VercelResponse): boolean {
  const origin = String(req.headers.origin || '')
  if (isAllowedExtensionOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Plugin-Version'
    )
    res.setHeader('Access-Control-Max-Age', '86400')
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return true
  }
  return false
}
