// 注入到 zhihusoul.cn 的 bridge：
// 1) 上线时主动告知页面"插件已安装"
// 2) 收到页面 postMessage 的 {type:'zsd:install-token', token, apiBase} → 写入 chrome.storage
// 3) 收到 {type:'zsd:ping'} → 回 {type:'zsd:pong', version}
// 仅接受同源 message（zhihusoul.cn / localhost 开发期）。

import { setConfig } from './lib/storage'

const ALLOWED_ORIGINS = new Set([
  'https://zhihusoul.cn',
  'https://www.zhihusoul.cn',
  'http://localhost:3000'
])

function post(payload: any) {
  try {
    window.postMessage(payload, window.location.origin)
  } catch (e) {
    console.warn('[zsd-bridge] postMessage failed', e)
  }
}

window.addEventListener('message', async (ev) => {
  if (!ALLOWED_ORIGINS.has(ev.origin)) return
  const data = ev.data
  if (!data || typeof data !== 'object') return

  if (data.type === 'zsd:ping') {
    post({ type: 'zsd:pong', version: chrome.runtime.getManifest().version })
    return
  }

  if (data.type === 'zsd:install-token') {
    const token = String(data.token || '').trim()
    const apiBase = String(data.apiBase || ev.origin || '').replace(/\/$/, '')
    if (!token) {
      post({ type: 'zsd:install-token-ack', ok: false, error: '空 token' })
      return
    }
    try {
      // 重新绑定时把 linkedUrlToken 清空——会在下次访问 zhihu 时自动重新关联当前 zhihu 登录账号
      await setConfig({ token, apiBase, linkedUrlToken: '' })
      post({
        type: 'zsd:install-token-ack',
        ok: true,
        apiBase,
        version: chrome.runtime.getManifest().version
      })
    } catch (e: any) {
      post({ type: 'zsd:install-token-ack', ok: false, error: String(e?.message || e) })
    }
  }
})

// 主动告知页面"插件已安装"
post({ type: 'zsd:installed', version: chrome.runtime.getManifest().version })
