// 注入到 zhihu.com 全站。仅在"我自己的主页"显示批量抓取按钮，
// 在我自己的回答上显示勾选 UI。其他场景静默。

import { fetchMe, fetchAllMyAnswers, parseAnswerElement, type CollectedAnswer } from './lib/zhihu'

const STATE = {
  me: null as Awaited<ReturnType<typeof fetchMe>> | null,
  selected: new Map<string, CollectedAnswer>()
}

async function ensureMe() {
  if (STATE.me) return STATE.me
  try {
    STATE.me = await fetchMe()
  } catch (e) {
    console.warn('[zsd] fetchMe failed', e)
  }
  return STATE.me
}

function isMyProfilePage(): boolean {
  const me = STATE.me
  if (!me?.url_token) return false
  // 自己的主页：https://www.zhihu.com/people/<url_token> 或 /people/<url_token>/answers
  const m = location.pathname.match(/^\/people\/([^/]+)/)
  if (!m) return false
  return m[1] === me.url_token
}

function ensureToolbar() {
  if (document.getElementById('zsd-toolbar')) return
  if (!isMyProfilePage()) return

  const bar = document.createElement('div')
  bar.id = 'zsd-toolbar'
  bar.className = 'zsd-toolbar'
  bar.innerHTML = `
    <div class="zsd-toolbar-inner">
      <div class="zsd-toolbar-title">
        <span class="zsd-toolbar-logo">🧪</span>
        知识蒸馏馆
      </div>
      <div class="zsd-toolbar-status" id="zsd-status">点选下方回答或一键批量抓取</div>
      <div class="zsd-toolbar-actions">
        <button id="zsd-btn-fetch-all" class="zsd-btn zsd-btn-primary">一键批量抓取我的全部回答</button>
        <button id="zsd-btn-upload" class="zsd-btn">上传已选 <span id="zsd-count">0</span> 条</button>
        <button id="zsd-btn-clear" class="zsd-btn zsd-btn-ghost">清空</button>
      </div>
    </div>
  `
  document.body.appendChild(bar)

  bar.querySelector('#zsd-btn-fetch-all')!.addEventListener('click', onBatchFetch)
  bar.querySelector('#zsd-btn-upload')!.addEventListener('click', onUploadSelected)
  bar.querySelector('#zsd-btn-clear')!.addEventListener('click', () => clearSelection())
}

function setStatus(text: string, kind: 'info' | 'ok' | 'err' = 'info') {
  const el = document.getElementById('zsd-status')
  if (!el) return
  el.textContent = text
  el.dataset.kind = kind
}

function updateCount() {
  const el = document.getElementById('zsd-count')
  if (el) el.textContent = String(STATE.selected.size)
}

function clearSelection(opts: { silent?: boolean } = {}) {
  STATE.selected.clear()
  document.querySelectorAll('.zsd-checkbox.zsd-checked').forEach((b) => {
    b.classList.remove('zsd-checked')
  })
  updateCount()
  if (!opts.silent) setStatus('已清空选择')
}

function injectCheckboxes() {
  if (!isMyProfilePage()) return
  const items = document.querySelectorAll('[data-zop]')
  items.forEach((el) => {
    if ((el as HTMLElement).dataset.zsdInjected === '1') return
    const parsed = parseAnswerElement(el)
    if (!parsed) return
    // 只对"我自己的回答"挂勾选 UI（按 url_token 比对）
    // 注：data-zop 里 authorMemberHash 多为加密 id，并非 url_token；
    // 为保险起见这里不严格按 author_id 过滤，但只在"我自己的主页"才会调到这里。
    ;(el as HTMLElement).dataset.zsdInjected = '1'

    const checkbox = document.createElement('button')
    checkbox.className = 'zsd-checkbox'
    checkbox.type = 'button'
    checkbox.title = '加入蒸馏'
    checkbox.innerHTML = '<span class="zsd-checkbox-tick">✓</span> 加入蒸馏'
    checkbox.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const me = STATE.me
      if (!me) {
        setStatus('未识别到登录态，请先登录知乎', 'err')
        return
      }
      // 用户在自己的主页，强行用 me.id 作为 author_id，后端再次校验
      const ans: CollectedAnswer = { ...parsed, author_id: me.id }
      if (STATE.selected.has(ans.answer_id)) {
        STATE.selected.delete(ans.answer_id)
        checkbox.classList.remove('zsd-checked')
      } else {
        STATE.selected.set(ans.answer_id, ans)
        checkbox.classList.add('zsd-checked')
      }
      updateCount()
    })

    const anchor =
      el.querySelector('.ContentItem-actions') ||
      el.querySelector('.ContentItem-meta') ||
      el
    anchor.appendChild(checkbox)
  })
}

async function onBatchFetch() {
  const me = await ensureMe()
  if (!me?.url_token) {
    setStatus('未识别到知乎登录态，请先登录后刷新', 'err')
    return
  }
  setStatus('正在批量抓取你的回答…')
  try {
    const all = await fetchAllMyAnswers(me.url_token, (cur, total) => {
      setStatus(`已抓取 ${cur}${total ? ` / ${total}` : ''} 条…`)
    })
    all.forEach((a) => {
      // 用 me.id 覆盖（v4 接口里 author.url_token 与 me 一致；保险起见统一一遍）
      STATE.selected.set(a.answer_id, { ...a, author_id: me.id })
    })
    updateCount()
    setStatus(`抓取完成，共 ${all.length} 条。点击「上传」发送到蒸馏馆。`, 'ok')
  } catch (e: any) {
    setStatus(`抓取失败：${e?.message || e}`, 'err')
  }
}

async function onUploadSelected() {
  const planned = STATE.selected.size
  if (planned === 0) {
    setStatus('还没有勾选任何回答', 'err')
    return
  }
  setStatus(`正在上传 ${planned} 条…`)
  const answers = [...STATE.selected.values()]
  const reply = await new Promise<any>((resolve) => {
    chrome.runtime.sendMessage({ type: 'upload', answers }, (r) => resolve(r))
  })
  if (!reply?.ok) {
    setStatus(`上传失败：${reply?.error || 'unknown'}`, 'err')
    return
  }
  const { accepted, rejected = [], total_for_user } = reply.result
  // 仅清空已被服务端成功接收的条目，剩下被拒的留在选择里供用户检查
  const rejectedIds = new Set(rejected.map((r: any) => String(r.answer_id)))
  for (const id of [...STATE.selected.keys()]) {
    if (!rejectedIds.has(id)) STATE.selected.delete(id)
  }
  document.querySelectorAll<HTMLElement>('.zsd-checkbox.zsd-checked').forEach((b) => {
    // 只 uncheck 那些已不在 selected 里的
    const card = b.closest('[data-zop]') as HTMLElement | null
    if (!card) return
    let zop: any = {}
    try {
      zop = JSON.parse(card.getAttribute('data-zop') || '{}')
    } catch {
      /* ignore */
    }
    const id = String(zop.itemId || '')
    if (id && !STATE.selected.has(id)) b.classList.remove('zsd-checked')
  })
  updateCount()

  const head = accepted > 0 ? `✅ 上传成功 ${accepted} 条` : '⚠️ 没有任何条目入库'
  const tail =
    rejected.length > 0
      ? `；被拒 ${rejected.length} 条（${rejected.slice(0, 3).map((r: any) => r.reason).join('；')}${rejected.length > 3 ? '…' : ''}）`
      : ''
  const total = typeof total_for_user === 'number' ? `；当前累计 ${total_for_user} 条` : ''
  setStatus(`${head}${tail}${total}。可去蒸馏馆点「我自己」重新蒸馏。`, accepted > 0 ? 'ok' : 'err')
}

async function init() {
  await ensureMe()
  ensureToolbar()
  injectCheckboxes()
}

// 知乎是 SPA，DOM 不断变化；用 MutationObserver 周期触发注入
const observer = new MutationObserver(() => {
  ensureToolbar()
  injectCheckboxes()
})
observer.observe(document.body, { childList: true, subtree: true })

// 路由变化时重新评估（pushState / replaceState 拦截）
const _pushState = history.pushState
history.pushState = function (...args: any[]) {
  const r = _pushState.apply(this, args as any)
  window.dispatchEvent(new Event('zsd:locationchange'))
  return r
}
window.addEventListener('popstate', () => window.dispatchEvent(new Event('zsd:locationchange')))
window.addEventListener('zsd:locationchange', () => {
  ensureToolbar()
  injectCheckboxes()
})

init()
