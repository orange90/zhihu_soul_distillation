// 注入到 zhihu.com / zhuanlan.zhihu.com。仅在「回答详情页」和「专栏文章页」上，
// 且内容属于当前登录用户本人时，显示「加入蒸馏」勾选 UI。其他场景静默。

import {
  fetchMe,
  parseAnswerElement,
  parseArticleElement,
  articleAuthorToken,
  fetchFullAnswerContent,
  type CollectedAnswer
} from './lib/zhihu'

// 蒸馏馆每人最多保留的条数
const MAX = 10

const STATE = {
  me: null as Awaited<ReturnType<typeof fetchMe>> | null,
  selected: new Map<string, CollectedAnswer>(),
  // 后端已上传（已入库）的条数，作为「还可选择 x 条」的额度基准
  uploadCount: 0,
  uploadCountLoaded: false
}

async function ensureMe() {
  if (STATE.me) return STATE.me
  try {
    STATE.me = await fetchMe()
  } catch (e) {
    console.warn('[zsd] fetchMe failed', e)
  }
  // 把 url_token 上报给后端，换一份带 linked_url_token 的新 bearer——
  // 这样后端在 upload-answers 校验时能识别 OAuth uid 之外的另一种"本人" id 形态。
  if (STATE.me?.url_token) {
    try {
      const reply = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'ensure_link', url_token: STATE.me!.url_token },
          (r) => resolve(r)
        )
      })
      if (reply?.ok && reply.result?.linked) {
        console.log('[zsd] linked url_token to backend session:', reply.result.note)
      } else if (reply && !reply.ok) {
        console.warn('[zsd] link failed:', reply.error)
      }
    } catch (e) {
      console.warn('[zsd] ensure_link error', e)
    }
  }
  return STATE.me
}

// 向后端拉取当前用户已上传条数（用于计算剩余额度）。未配置 Token 时静默失败，
// 退化为只按本次会话已选条数算额度。
async function ensureUploadCount() {
  if (STATE.uploadCountLoaded) return
  try {
    const reply = await new Promise<any>((resolve) => {
      chrome.runtime.sendMessage({ type: 'ping_backend' }, (r) => resolve(r))
    })
    if (reply?.ok && reply.user && typeof reply.user.upload_count === 'number') {
      STATE.uploadCount = reply.user.upload_count
      STATE.uploadCountLoaded = true
    }
  } catch (e) {
    console.warn('[zsd] ensureUploadCount failed', e)
  }
}

function isAnswerDetailPage(): boolean {
  if (location.hostname !== 'www.zhihu.com') return false
  // https://www.zhihu.com/question/<qid>/answer/<aid> 或 https://www.zhihu.com/answer/<aid>
  return (
    /^\/question\/\d+\/answer\/\d+/.test(location.pathname) ||
    /^\/answer\/\d+/.test(location.pathname)
  )
}

function isArticlePage(): boolean {
  // https://zhuanlan.zhihu.com/p/<id>（少数情况下也会落在 www.zhihu.com/p/<id>）
  if (location.hostname !== 'zhuanlan.zhihu.com' && location.hostname !== 'www.zhihu.com') {
    return false
  }
  return /^\/p\/\d+/.test(location.pathname)
}

function isInjectablePage(): boolean {
  return isAnswerDetailPage() || isArticlePage()
}

function ensureToolbar() {
  if (!isInjectablePage()) return
  if (document.getElementById('zsd-toolbar')) {
    refreshStatus()
    return
  }

  const bar = document.createElement('div')
  bar.id = 'zsd-toolbar'
  bar.className = 'zsd-toolbar'
  bar.innerHTML = `
    <div class="zsd-toolbar-inner">
      <div class="zsd-toolbar-title">
        <span class="zsd-toolbar-logo">🧪</span>
        知识蒸馏馆
      </div>
      <div class="zsd-toolbar-status" id="zsd-status">勾选你想蒸馏的回答 / 文章</div>
      <div class="zsd-toolbar-actions">
        <button id="zsd-btn-upload" class="zsd-btn zsd-btn-primary">上传已选 <span id="zsd-count">0</span> 条</button>
        <button id="zsd-btn-clear" class="zsd-btn zsd-btn-ghost">清空</button>
      </div>
    </div>
  `
  document.body.appendChild(bar)

  bar.querySelector('#zsd-btn-upload')!.addEventListener('click', onUploadSelected)
  bar.querySelector('#zsd-btn-clear')!.addEventListener('click', () => clearSelection())
  refreshStatus()
}

function showToast(msg: string) {
  const existing = document.getElementById('zsd-toast')
  if (existing) existing.remove()
  const toast = document.createElement('div')
  toast.id = 'zsd-toast'
  toast.className = 'zsd-toast'
  toast.textContent = msg
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), 3000)
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

// 剩余可选额度 = 10 − 后端已上传 − 本次已选
function remaining(): number {
  return Math.max(0, MAX - STATE.uploadCount - STATE.selected.size)
}

// 超额时给用户的提示文案
function limitMessage(): string {
  if (STATE.uploadCount >= MAX) {
    return `蒸馏馆已满 ${MAX} 条，请先到蒸馏馆「管理我的蒸馏」删除部分内容后再加。`
  }
  return `最多蒸馏 ${MAX} 条：你已上传 ${STATE.uploadCount} 条、本次已选 ${STATE.selected.size} 条，无法再加。`
}

// 根据已上传数 + 本次已选，刷新工具栏上的「还可选择 x 条 / 已满十条」状态
function refreshStatus() {
  updateCount()
  if (STATE.uploadCount >= MAX) {
    setStatus(`已满 ${MAX} 条：蒸馏馆每人最多保留 ${MAX} 条，去蒸馏馆删掉一些再来吧。`, 'err')
    return
  }
  const r = remaining()
  const parts = [`还可选择 ${r} 条`]
  if (STATE.uploadCountLoaded) parts.push(`已上传 ${STATE.uploadCount} 条`)
  if (STATE.selected.size > 0) parts.push(`本次已选 ${STATE.selected.size} 条`)
  setStatus(parts.join(' · '), r > 0 ? 'info' : 'err')
}

function clearSelection(opts: { silent?: boolean } = {}) {
  STATE.selected.clear()
  document.querySelectorAll('.zsd-checkbox.zsd-checked').forEach((b) => {
    b.classList.remove('zsd-checked')
  })
  if (opts.silent) {
    updateCount()
  } else {
    refreshStatus()
  }
}

// 卡片里所有 /people/<token> 链接，看是否至少有一个指向当前登录用户。
// 用于过滤同一问题下他人的回答卡片，只给本人的回答挂"加入蒸馏"按钮。
function cardBelongsToMe(el: Element, myUrlToken: string): boolean {
  const anchors = el.querySelectorAll('a[href*="/people/"]')
  for (const a of Array.from(anchors)) {
    const href = (a as HTMLAnchorElement).getAttribute('href') || ''
    const m = href.match(/\/people\/([^/?#]+)/)
    if (m && m[1] === myUrlToken) return true
  }
  return false
}

// 创建一个「加入蒸馏」勾选按钮，绑定选中 / 取消选中逻辑。
function createCheckbox(parsed: CollectedAnswer): HTMLButtonElement {
  const checkbox = document.createElement('button')
  checkbox.className = 'zsd-checkbox'
  checkbox.type = 'button'
  checkbox.title = '加入蒸馏'
  checkbox.innerHTML = '<span class="zsd-checkbox-tick">✓</span> 加入蒸馏'
  if (STATE.selected.has(parsed.answer_id)) checkbox.classList.add('zsd-checked')
  checkbox.addEventListener('click', async (e) => {
    e.preventDefault()
    e.stopPropagation()
    const me = STATE.me
    if (!me) {
      setStatus('未识别到登录态，请先登录知乎', 'err')
      return
    }
    const ans: CollectedAnswer = { ...parsed, author_id: me.id }
    if (STATE.selected.has(ans.answer_id)) {
      STATE.selected.delete(ans.answer_id)
      checkbox.classList.remove('zsd-checked')
      refreshStatus()
      return
    }
    if (remaining() <= 0) {
      showToast(limitMessage())
      return
    }
    // 先标记选中，再异步补全（回答正文可能被 DOM 截断，需走 API 取全文）
    checkbox.classList.add('zsd-checked')
    STATE.selected.set(ans.answer_id, ans)
    refreshStatus()
    if (ans.kind === 'answer') {
      setStatus('正在获取全文…')
      try {
        const fullContent = await fetchFullAnswerContent(ans.answer_id)
        if (fullContent && fullContent.length > ans.content.length) {
          ans.content = fullContent
          ans.excerpt = fullContent.slice(0, 300)
          STATE.selected.set(ans.answer_id, ans)
        }
      } catch {
        /* ignore，已用 DOM 文本兜底 */
      }
      refreshStatus()
    }
  })
  return checkbox
}

// 回答详情页：给页面里所有「本人」的回答卡片挂按钮。
function injectAnswerCheckboxes() {
  if (!isAnswerDetailPage()) return
  const me = STATE.me
  if (!me?.url_token) return
  const items = document.querySelectorAll('[data-zop]')
  items.forEach((el) => {
    const marker = (el as HTMLElement).dataset.zsdInjected
    if (marker === '1' || marker === 'skip') return
    const parsed = parseAnswerElement(el)
    if (!parsed) {
      ;(el as HTMLElement).dataset.zsdInjected = 'skip'
      return
    }
    // 仅本人内容：卡片里没有指向我的 /people/<token> 链接就跳过（同一问题下的他人回答）
    if (!cardBelongsToMe(el, me.url_token)) {
      ;(el as HTMLElement).dataset.zsdInjected = 'skip'
      return
    }
    ;(el as HTMLElement).dataset.zsdInjected = '1'

    const checkbox = createCheckbox(parsed)
    const anchor =
      el.querySelector('.ContentItem-actions') ||
      el.querySelector('.ContentItem-meta') ||
      el
    anchor.appendChild(checkbox)
  })
}

// 专栏文章页：仅当文章作者是本人时，在文章头部挂一个按钮。
function injectArticleButton() {
  if (!isArticlePage()) return
  const me = STATE.me
  if (!me?.url_token) return
  if (document.getElementById('zsd-article-checkbox')) return
  const author = articleAuthorToken()
  if (!author) return // 作者信息还没渲染出来，等下次 mutation 再试
  if (author !== me.url_token) return // 仅本人文章
  const parsed = parseArticleElement()
  if (!parsed) return

  const checkbox = createCheckbox(parsed)
  checkbox.id = 'zsd-article-checkbox'
  checkbox.classList.add('zsd-checkbox-article')
  const anchor =
    document.querySelector('.Post-Header') ||
    document.querySelector('.Post-Title')?.parentElement ||
    document.querySelector('.ContentItem-actions') ||
    document.body
  anchor.appendChild(checkbox)
}

async function onUploadSelected() {
  const planned = STATE.selected.size
  if (planned === 0) {
    setStatus('还没有勾选任何回答 / 文章', 'err')
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
  // uncheck 已不在 selected 里的按钮（含回答卡片与文章按钮）
  document.querySelectorAll<HTMLElement>('.zsd-checkbox.zsd-checked').forEach((b) => {
    if (b.id === 'zsd-article-checkbox') {
      // 文章按钮：用 URL 里的文章 id 判断
      const m = location.pathname.match(/^\/p\/(\d+)/)
      const id = m ? m[1] : ''
      if (id && !STATE.selected.has(id)) b.classList.remove('zsd-checked')
      return
    }
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

  // 用后端返回的累计数刷新额度基准
  if (typeof total_for_user === 'number') {
    STATE.uploadCount = total_for_user
    STATE.uploadCountLoaded = true
  }
  updateCount()

  const head = accepted > 0 ? `✅ 上传成功 ${accepted} 条` : '⚠️ 没有任何条目入库'
  const tail =
    rejected.length > 0
      ? `；被拒 ${rejected.length} 条（${rejected.slice(0, 3).map((r: any) => r.reason).join('；')}${rejected.length > 3 ? '…' : ''}）`
      : ''
  const total =
    typeof total_for_user === 'number'
      ? STATE.uploadCount >= MAX
        ? `；已满 ${MAX} 条`
        : `；当前累计 ${STATE.uploadCount} 条，还可选择 ${remaining()} 条`
      : ''
  setStatus(`${head}${tail}${total}。可去蒸馏馆点「管理我的蒸馏」重新蒸馏。`, accepted > 0 ? 'ok' : 'err')
}

function tick() {
  if (!isInjectablePage()) {
    document.getElementById('zsd-toolbar')?.remove()
    return
  }
  ensureToolbar()
  injectAnswerCheckboxes()
  injectArticleButton()
}

async function init() {
  await ensureMe()
  if (!isInjectablePage()) return
  await ensureUploadCount()
  tick()
}

// 知乎是 SPA，DOM 不断变化；用 MutationObserver 周期触发注入
const observer = new MutationObserver(() => {
  tick()
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
  // 切换页面时，移除上一篇文章残留的按钮，避免挂到新页面的错误位置
  document.getElementById('zsd-article-checkbox')?.remove()
  void ensureUploadCount()
  tick()
})

init()
