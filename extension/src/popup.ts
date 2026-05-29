import { getConfig, setConfig } from './lib/storage'

const $ = (id: string) => document.getElementById(id)!

function setStatus(text: string, kind: 'info' | 'ok' | 'err' = 'info') {
  const el = $('status')
  el.textContent = text
  ;(el as HTMLElement).dataset.kind = kind
}

async function load() {
  const cfg = await getConfig()
  ;($('apiBaseShow') as HTMLElement).textContent = cfg.apiBase || '（未配置）'
  const t = cfg.token
  ;($('tokenShow') as HTMLElement).textContent = t
    ? `${t.slice(0, 16)}…${t.slice(-8)}`
    : '（未配置）'
  if (t) setStatus('Token 已配置。可点「校验登录态」试试。')
  else setStatus('打开 zhihusoul.cn，点「一键写入插件」即可自动配置。')
}

$('openApp').addEventListener('click', async (e) => {
  e.preventDefault()
  const cfg = await getConfig()
  chrome.tabs.create({ url: cfg.apiBase || 'https://zhihusoul.cn' })
})

$('open-app').addEventListener('click', async () => {
  const cfg = await getConfig()
  chrome.tabs.create({ url: cfg.apiBase || 'https://zhihusoul.cn' })
})

$('save').addEventListener('click', async () => {
  const token = (($('token') as HTMLTextAreaElement).value || '').trim()
  if (!token) {
    setStatus('请粘贴 Token', 'err')
    return
  }
  await setConfig({ token, linkedUrlToken: '' })
  ;($('token') as HTMLTextAreaElement).value = ''
  await load()
  setStatus('Token 已手动保存。', 'ok')
})

$('ping').addEventListener('click', () => {
  setStatus('校验中…')
  chrome.runtime.sendMessage({ type: 'ping_backend' }, (r) => {
    if (!r?.ok) {
      setStatus(`校验失败：${r?.error || 'unknown'}`, 'err')
      return
    }
    if (!r.user) {
      setStatus('Token 已收到，但后端未识别登录态。请回到 zhihusoul.cn 重新「一键写入插件」。', 'err')
      return
    }
    const u = r.user
    const uc = typeof u.upload_count === 'number' ? `，累计 ${u.upload_count} 条上传` : ''
    const linked = u.linked_url_token
      ? `\n已绑定 url_token：${u.linked_url_token}`
      : '\n未绑定 url_token（去自己的知乎主页打开一次即可自动绑定）'
    setStatus(`登录为 ${u.name}（OAuth id=${u.id}）${uc}${linked}`, 'ok')
  })
})

load()
