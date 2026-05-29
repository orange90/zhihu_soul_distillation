import { getConfig, setConfig } from './lib/storage'

const $ = (id: string) => document.getElementById(id)!

function setStatus(text: string, kind: 'info' | 'ok' | 'err' = 'info') {
  const el = $('status')
  el.textContent = text
  ;(el as HTMLElement).dataset.kind = kind
}

async function load() {
  const cfg = await getConfig()
  ;($('apiBase') as HTMLInputElement).value = cfg.apiBase
  ;($('token') as HTMLTextAreaElement).value = cfg.token
  if (cfg.token) setStatus('已配置 Token。点击「校验登录态」试试。')
  else setStatus('请先在蒸馏馆首页点「获取插件 Token」并粘贴到上方。')
}

$('save').addEventListener('click', async () => {
  const apiBase = (($('apiBase') as HTMLInputElement).value || '').trim().replace(/\/$/, '')
  const token = (($('token') as HTMLTextAreaElement).value || '').trim()
  if (!apiBase) {
    setStatus('请填写后端地址', 'err')
    return
  }
  if (!token) {
    setStatus('请粘贴 Token', 'err')
    return
  }
  await setConfig({ apiBase, token })
  setStatus('已保存。', 'ok')
})

$('ping').addEventListener('click', () => {
  setStatus('校验中…')
  chrome.runtime.sendMessage({ type: 'ping_backend' }, (r) => {
    if (!r?.ok) {
      setStatus(`校验失败：${r?.error || 'unknown'}`, 'err')
      return
    }
    if (!r.user) {
      setStatus('Token 已收到，但后端未识别登录态。请去蒸馏馆重新登录后再取一次 Token。', 'err')
      return
    }
    const uc = typeof r.user.upload_count === 'number' ? `，累计 ${r.user.upload_count} 条上传` : ''
    setStatus(`登录为 ${r.user.name}（id=${r.user.id}）${uc}`, 'ok')
  })
})

$('open-app').addEventListener('click', async () => {
  const cfg = await getConfig()
  chrome.tabs.create({ url: cfg.apiBase || 'http://localhost:3000' })
})

load()
