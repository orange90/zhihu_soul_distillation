import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { getJSON } from '../lib/storage'
import type { ChatMessage, Persona } from '../types'

const PRESET_QUESTIONS = [
  'AI 会替代程序员吗？',
  '如何看待最近 DeepSeek 引发的讨论？',
  '我应该专精还是广博？'
]

export default function ResultPage() {
  const navigate = useNavigate()
  const [persona, setPersona] = useState<Persona | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const p = getJSON<Persona>('persona')
    if (!p) {
      navigate('/select', { replace: true })
      return
    }
    setPersona(p)
  }, [navigate])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const ask = async (q: string) => {
    if (!persona || !q.trim() || sending) return
    const userMsg: ChatMessage = { role: 'user', content: q.trim() }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput('')
    setSending(true)
    try {
      const { message } = await api.chat(persona, next, q.trim())
      setMessages([...next, message])
    } catch (e: any) {
      setMessages([
        ...next,
        { role: 'assistant', content: `（系统）对话失败：${e?.message || e}` }
      ])
    } finally {
      setSending(false)
    }
  }

  if (!persona) return null

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 grid lg:grid-cols-5 gap-6">
      {/* 人格卡片 */}
      <aside className="lg:col-span-2">
        <div className="card p-6 sticky top-20">
          <div className="text-xs text-zhihu-gray">你的知识圈是一个</div>
          <h2 className="mt-1 text-2xl font-bold text-zhihu-ink leading-snug">
            <span className="text-zhihu-blue">{persona.dominant_style}</span>
            <span className="text-zhihu-ink"> 的人</span>
          </h2>
          {persona.headline && (
            <p className="mt-3 text-sm text-gray-600 leading-relaxed">{persona.headline}</p>
          )}

          <div className="mt-6">
            <div className="text-xs text-zhihu-gray mb-2">代表性集体观点</div>
            <ul className="space-y-2">
              {persona.collective_views.map((v, i) => (
                <li key={i} className="text-sm text-zhihu-ink leading-relaxed flex gap-2">
                  <span className="text-zhihu-blue font-semibold">{i + 1}.</span>
                  <span>{v}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-6">
            <div className="text-xs text-zhihu-gray mb-2">代表人物</div>
            <div className="flex flex-wrap gap-2">
              {persona.highlight_authors.map((h) => (
                <span key={h.name} className="tag" title={h.reason}>
                  {h.name}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-gray-100 flex gap-2">
            <button className="btn-ghost flex-1" onClick={() => navigate('/select')}>
              重新选择
            </button>
            <button
              className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => navigate('/debate')}
              disabled={persona.contributors.length < 2}
              title={
                persona.contributors.length < 2
                  ? '辩论模式至少需要 2 位答主，请回到「重新选择」再加 1 人'
                  : '让这些答主就同一个话题互相辩论'
              }
            >
              开启辩论
            </button>
          </div>
          {persona.contributors.length < 2 && (
            <p className="mt-2 text-[11px] text-zhihu-gray text-right">
              辩论模式需要 ≥ 2 位答主
            </p>
          )}
        </div>
      </aside>

      {/* 对话框 */}
      <section className="lg:col-span-3">
        <div className="card flex flex-col h-[70vh]">
          <div className="px-5 py-3 border-b border-gray-100 text-sm font-medium">
            与你的知识圈集体智慧体对话
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto scroll-thin px-5 py-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-sm text-zhihu-gray">
                向你关注的这些人——作为一个整体——提一个问题吧。
                <div className="mt-3 flex flex-wrap gap-2">
                  {PRESET_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => ask(q)}
                      className="text-xs px-3 py-1.5 rounded-full bg-zhihu-blue-light text-zhihu-blue hover:bg-zhihu-blue/10"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className={[
                    'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap',
                    m.role === 'user'
                      ? 'bg-zhihu-blue text-white rounded-br-sm'
                      : 'bg-gray-50 text-zhihu-ink rounded-bl-sm border border-gray-100'
                  ].join(' ')}
                >
                  {m.content}
                  {m.role === 'assistant' && m.citations && m.citations.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-200/60 text-xs text-zhihu-gray">
                      引用：
                      {m.citations.map((c, j) => (
                        <span key={j} className="ml-1">
                          {c.author_name}
                          {j < m.citations!.length - 1 ? '、' : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex justify-start">
                <div className="bg-gray-50 border border-gray-100 rounded-2xl px-4 py-2.5">
                  <div className="flex gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-zhihu-gray animate-bounce" />
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-zhihu-gray animate-bounce"
                      style={{ animationDelay: '0.15s' }}
                    />
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-zhihu-gray animate-bounce"
                      style={{ animationDelay: '0.3s' }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <form
            className="border-t border-gray-100 p-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              ask(input)
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="向你的知识圈提问…"
              className="flex-1 px-4 py-2 rounded-full bg-gray-50 border border-transparent focus:border-zhihu-blue focus:bg-white outline-none text-sm"
            />
            <button className="btn-primary" disabled={!input.trim() || sending}>
              发送
            </button>
          </form>
        </div>
      </section>
    </div>
  )
}
