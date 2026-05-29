// Service Worker (MV3)
// 接收来自 content script 的消息：上传 / 批量抓取 / 状态查询。
// 抓取本身在 content script 里跑（因为依赖 zhihu.com cookie），SW 只负责调后端。

import { uploadAnswers, pingMe, ensureLinkedUrlToken, type UploadResponse } from './lib/api'
import type { CollectedAnswer } from './lib/zhihu'

type Msg =
  | { type: 'upload'; answers: CollectedAnswer[] }
  | { type: 'ping_backend' }
  | { type: 'ensure_link'; url_token: string }

chrome.runtime.onMessage.addListener((msg: Msg, _sender, sendResponse) => {
  ;(async () => {
    try {
      if (msg.type === 'upload') {
        const r: UploadResponse = await uploadAnswers(msg.answers)
        sendResponse({ ok: true, result: r })
        return
      }
      if (msg.type === 'ping_backend') {
        const user = await pingMe()
        sendResponse({ ok: true, user })
        return
      }
      if (msg.type === 'ensure_link') {
        const r = await ensureLinkedUrlToken(msg.url_token)
        sendResponse({ ok: true, result: r })
        return
      }
      sendResponse({ ok: false, error: 'unknown message type' })
    } catch (e: any) {
      sendResponse({ ok: false, error: String(e?.message || e) })
    }
  })()
  return true // async response
})
