import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)

// Hidden console helpers for local testing
const _devPost = (url: string, body: object) =>
  fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => r.json())

;(window as any).test_debate = async () => {
  console.log('[test_debate] 填充路人并启动辩论中...')
  const result = await _devPost('/api/arena', { action: 'test_fill' })
  console.log('[test_debate] 结果:', result)
  return result
}

;(window as any).test_bar = async () => {
  console.log('[test_bar] 填充路人并启动酒吧中...')
  const result = await _devPost('/api/bar', { action: 'test_fill' })
  console.log('[test_bar] 结果:', result)
  return result
}
