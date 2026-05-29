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

function normalizeApiBase(raw: string): { value: string; note: string } {
  let v = raw.trim().replace(/\/$/, '')
  if (!v) return { value: '', note: '' }
  // 把 http://非 localhost 自动改成 https://，避免 CORS preflight 被 302 跳转打死
  const m = /^http:\/\/([^/]+)(.*)$/.exec(v)
  if (m && !/^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/.test(m[1])) {
    v = `https://${m[1]}${m[2]}`
    return { value: v, note: '已自动改为 https://（http→https 重定向会让 CORS preflight 失败）' }
  }
  return { value: v, note: '' }
}

$('save').addEventListener('click', async () => {
  const { value: apiBase, note } = normalizeApiBase(($('apiBase') as HTMLInputElement).value || '')
  const token = (($('token') as HTMLTextAreaElement).value || '').trim()
  if (!apiBase) {
    setStatus('请填写后端地址', 'err')
    return
  }
  if (!token) {
    setStatus('请粘贴 Token', 'err')
    return
  }
  ;($('apiBase') as HTMLInputElement).value = apiBase
  await setConfig({ apiBase, token })
  setStatus(`已保存${note ? '\n' + note : ''}`, 'ok')
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
    const u = r.user
    const uc = typeof u.upload_count === 'number' ? `，累计 ${u.upload_count} 条上传` : ''
    const linked = u.linked_url_token
      ? `\n已绑定 url_token：${u.linked_url_token}`
      : '\n未绑定 url_token（去自己的知乎主页打开一次即可自动绑定）'
    setStatus(`登录为 ${u.name}（OAuth id=${u.id}）${uc}${linked}`, 'ok')
  })
})

$('open-app').addEventListener('click', async () => {
  const cfg = await getConfig()
  chrome.tabs.create({ url: cfg.apiBase || 'http://localhost:3000' })
})

load()
