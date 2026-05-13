import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { getJSON } from '../lib/storage'
import type { AuthorSkills, ChatMessage, Persona } from '../types'
import Markdown from '../components/Markdown'

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
  const [skillPreview, setSkillPreview] = useState<AuthorSkills | null>(null)
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
            <div className="text-xs text-zhihu-gray mb-2">
              成员 Skill
              <span className="ml-1 text-[11px] text-zhihu-gray/70">点击查看蒸馏出的写作风格简介</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {persona.contributors.map((c) => {
                const hasSkill = !!((c.skill_desc && c.skill_desc.trim()) || (c.skill_markdown && c.skill_markdown.trim()))
                return (
                  <button
                    key={c.author_id}
                    type="button"
                    onClick={() => setSkillPreview(c)}
                    className={[
                      'tag flex items-center gap-1 cursor-pointer hover:bg-zhihu-blue/10',
                      hasSkill ? '' : 'opacity-60'
                    ].join(' ')}
                    title={hasSkill ? `查看 ${c.author_name} 的 Skill 简介` : '该答主暂无可用 Skill，点击查看基础画像'}
                  >
                    <span>{c.author_name}</span>
                    {hasSkill && (
                      <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 3h7v7" />
                        <path d="M10 14L21 3" />
                        <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
                      </svg>
                    )}
                  </button>
                )
              })}
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
          <div className="px-5 py-2 bg-amber-50 border-b border-amber-100 text-[11px] text-amber-700 leading-relaxed">
            免责声明：本回答仅根据答主的蒸馏结果模拟答题，并非答主本人真实观点。
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
                    'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                    m.role === 'user'
                      ? 'bg-zhihu-blue text-white rounded-br-sm whitespace-pre-wrap'
                      : 'bg-gray-50 text-zhihu-ink rounded-bl-sm border border-gray-100'
                  ].join(' ')}
                >
                  {m.role === 'assistant' ? (
                    <Markdown content={m.content} tone="light" />
                  ) : (
                    m.content
                  )}
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

      {skillPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4 py-6"
          onClick={() => setSkillPreview(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <div className="text-xs text-zhihu-gray">写作风格 Skill</div>
                <div className="font-semibold text-zhihu-ink">{skillPreview.author_name}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSkillPreview(null)}
                  className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-zhihu-gray"
                  aria-label="关闭"
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="6" y1="6" x2="18" y2="18" />
                    <line x1="18" y1="6" x2="6" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto scroll-thin px-5 py-4">
              {skillPreview.skill_desc && skillPreview.skill_desc.trim() ? (
                <Markdown
                  content={skillPreview.skill_desc}
                  tone="light"
                  className="text-sm"
                />
              ) : (
                <div className="text-sm text-zhihu-gray space-y-3">
                  <p>该答主暂未生成完整的 Skill 简介（可能是 AI 服务暂时不可用，或者素材不足）。下面是基础画像：</p>
                  <ul className="space-y-1.5 text-zhihu-ink">
                    <li>· 价值观：{skillPreview.values || '—'}</li>
                    <li>· 思维方式：{skillPreview.thinking_style || '—'}</li>
                    <li>· 擅长领域：{skillPreview.domain || '—'}</li>
                    <li>· 代表观点：{skillPreview.signature_view || '—'}</li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
