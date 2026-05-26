import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { getJSON } from '../lib/storage'
import type { Author, DebateResult, Persona } from '../types'
import Markdown from '../components/Markdown'
import Watermark from '../components/Watermark'

function AiBadge({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const cls =
    size === 'lg'
      ? 'px-3 py-1 text-sm'
      : size === 'sm'
      ? 'px-2 py-0.5 text-[11px]'
      : 'px-2.5 py-1 text-xs'
  return (
    <span
      className={`inline-flex items-center gap-1.5 ${cls} rounded-full bg-violet-600 text-white font-bold leading-none whitespace-nowrap shadow-sm`}
      title="AI 生成内容，仅供参考，不代表答主立场"
    >
      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 shrink-0">
        <path d="M8 1a2.5 2.5 0 0 0-2.5 2.5v.382a2 2 0 0 0-1 1.732V7h7V5.614a2 2 0 0 0-1-1.732V3.5A2.5 2.5 0 0 0 8 1ZM5.5 8v1a2.5 2.5 0 0 0 5 0V8h-5ZM3 12.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1H6v1.5a.5.5 0 0 1-1 0V13H3.5a.5.5 0 0 1-.5-.5Z" />
      </svg>
      AI 分身 · 非答主本人立场
    </span>
  )
}

const PRESET_TOPICS = [
  '年轻人该不该 all in AI？',
  '远程办公会成为主流吗？',
  '专精还是广博，哪条路更值得走？'
]

const BUBBLE_STYLE = 'bg-sky-50 border-sky-300 text-sky-900'
const AVATAR_BG = 'bg-sky-500'
const RING_COLOR = 'ring-sky-300'

export default function DebatePage() {
  const navigate = useNavigate()
  const [persona, setPersona] = useState<Persona | null>(null)
  const [topic, setTopic] = useState('')
  const [rounds, setRounds] = useState<2 | 3>(2)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [debate, setDebate] = useState<DebateResult | null>(null)

  useEffect(() => {
    const p = getJSON<Persona>('persona')
    if (!p) {
      navigate('/select', { replace: true })
      return
    }
    setPersona(p)
  }, [navigate])

  const authorMap = useMemo(() => {
    const m = new Map<string, { index: number; avatarUrl?: string }>()
    if (!persona) return m
    const fallbackAvatars = new Map(
      (getJSON<Author[]>('selectedAuthors') || []).map((a) => [a.id, a.avatar_url])
    )
    persona.contributors.forEach((c, i) => {
      m.set(c.author_id, {
        index: i,
        avatarUrl: c.avatar_url || fallbackAvatars.get(c.author_id)
      })
    })
    return m
  }, [persona])

  const startDebate = async (q: string) => {
    if (!persona || !q.trim() || loading) return
    setError(null)
    setDebate(null)
    setLoading(true)
    try {
      const { debate: result } = await api.debate(persona, q.trim(), rounds)
      setDebate(result)
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  if (!persona) return null

  const canDebate = persona.contributors.length >= 2

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs text-zhihu-gray">圆桌辩论</div>
          <h2 className="mt-1 text-2xl font-bold text-zhihu-ink">
            让你关注的<span className="text-zhihu-blue">{persona.contributors.length}</span> 位答主，就同一个话题
            <span className="text-zhihu-blue"> 互相辩论</span>
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            出一道题，他们会先各自亮明立场，再互相回应，最后由主持人提炼共识与分歧。
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => navigate('/result')}>
            返回集体人格
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-lg bg-violet-600 text-white px-4 py-3 text-base leading-relaxed flex items-start gap-3 shadow-md">
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-6 h-6 shrink-0 mt-0.5">
          <path d="M8 1a2.5 2.5 0 0 0-2.5 2.5v.382a2 2 0 0 0-1 1.732V7h7V5.614a2 2 0 0 0-1-1.732V3.5A2.5 2.5 0 0 0 8 1ZM5.5 8v1a2.5 2.5 0 0 0 5 0V8h-5ZM3 12.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1H6v1.5a.5.5 0 0 1-1 0V13H3.5a.5.5 0 0 1-.5-.5Z" />
        </svg>
        <span>
          以下辩论由 <strong className="underline decoration-white/70 underline-offset-2">AI 分身仅模拟生成</strong>，<strong className="underline decoration-white/70 underline-offset-2">并非答主本人真实立场</strong>，仅供参考娱乐。
        </span>
      </div>

      {/* 出题区 */}
      <div className="card mt-4 p-5">
        <div className="text-sm font-medium text-zhihu-ink">出一道辩题</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {PRESET_TOPICS.map((t) => (
            <button
              key={t}
              onClick={() => setTopic(t)}
              className="text-xs px-3 py-1.5 rounded-full bg-zhihu-blue-light text-zhihu-blue hover:bg-zhihu-blue/10"
              disabled={loading}
            >
              {t}
            </button>
          ))}
        </div>
        <form
          className="mt-4 flex gap-2 flex-wrap"
          onSubmit={(e) => {
            e.preventDefault()
            startDebate(topic)
          }}
        >
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="例如：年轻人该不该 all in AI？"
            className="flex-1 min-w-[260px] px-4 py-2 rounded-full bg-gray-50 border border-transparent focus:border-zhihu-blue focus:bg-white outline-none text-sm"
            disabled={loading}
          />
          <select
            value={rounds}
            onChange={(e) => setRounds(Number(e.target.value) as 2 | 3)}
            className="px-3 py-2 rounded-full bg-gray-50 border border-transparent focus:border-zhihu-blue outline-none text-sm"
            disabled={loading}
          >
            <option value={2}>2 轮（立场 + 交锋）</option>
            <option value={3}>3 轮（含追加发言）</option>
          </select>
          <button
            className="btn-primary"
            disabled={!topic.trim() || loading || !canDebate}
            title={!canDebate ? '辩论至少需要 2 位答主' : undefined}
          >
            {loading ? '辩论中…' : '开始辩论'}
          </button>
        </form>
        {!canDebate && (
          <div className="mt-4 flex items-center gap-3 rounded-lg bg-rose-50 border border-rose-100 px-3 py-2 text-xs text-rose-600">
            <span>
              辩论模式至少需要 2 位答主，当前只有 {persona.contributors.length} 位。
            </span>
            <button
              type="button"
              onClick={() => navigate('/select')}
              className="ml-auto px-3 py-1 rounded-full bg-white border border-rose-200 text-rose-600 hover:bg-rose-100 transition"
            >
              去选择页补充
            </button>
          </div>
        )}
        {error && (
          <div className="mt-3 text-xs text-rose-500">辩论失败：{error}</div>
        )}
      </div>

      {/* 加载占位 */}
      {loading && (
        <div className="card mt-6 p-6 text-sm text-zhihu-gray">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-zhihu-blue animate-bounce" />
            <span
              className="w-1.5 h-1.5 rounded-full bg-zhihu-blue animate-bounce"
              style={{ animationDelay: '0.15s' }}
            />
            <span
              className="w-1.5 h-1.5 rounded-full bg-zhihu-blue animate-bounce"
              style={{ animationDelay: '0.3s' }}
            />
            <span className="ml-2">{persona.contributors.length} 位答主正在轮流发言…</span>
          </div>
          <div className="mt-3 text-xs text-zhihu-gray">
            为避免 LLM 限流导致部分答主"沉默"，每轮最多 2 人同时发言，
            {rounds} 轮辩论 {persona.contributors.length} 人通常需要 30–90 秒，请耐心等待。
          </div>
        </div>
      )}

      {/* 辩论结果 */}
      {debate && (
        <div className="mt-8 space-y-8">
          <div className="rounded-lg bg-amber-50 border-2 border-amber-300 px-4 py-3 text-sm text-amber-800 font-medium leading-relaxed flex items-start gap-2">
            <span className="text-lg leading-none mt-0.5">⚠</span>
            <span>
              <strong>免责声明：</strong>本辩论由 <strong>AI</strong> 根据答主蒸馏结果模拟生成，<strong className="underline decoration-amber-500">并非答主本人真实观点</strong>。
            </span>
          </div>
          <div className="card p-5">
            <div className="text-xs text-zhihu-gray">本场辩题</div>
            <div className="mt-1 text-lg font-semibold text-zhihu-ink">{debate.question}</div>
          </div>

          {debate.rounds.map((r) => (
            <section key={r.round}>
              <div className="flex items-center gap-3 mb-4">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-zhihu-blue text-white text-xs font-semibold">
                  {r.round}
                </span>
                <div className="text-sm font-semibold text-zhihu-ink">
                  第 {r.round} 轮 · {r.topic_focus || '发言'}
                </div>
                <div className="flex-1 border-t border-gray-100" />
              </div>

              <div className="space-y-5">
                {r.turns.map((t, i) => {
                  const info = authorMap.get(t.author_id)
                  const idx = info?.index ?? i
                  const isLeft = idx % 2 === 0

                  const avatar = info?.avatarUrl ? (
                    <img
                      src={info.avatarUrl}
                      alt={t.author_name}
                      className={`w-9 h-9 rounded-full object-cover shrink-0 ring-2 ${RING_COLOR}`}
                    />
                  ) : (
                    <span
                      className={`inline-flex items-center justify-center w-9 h-9 rounded-full text-white text-xs font-bold shrink-0 ${AVATAR_BG}`}
                    >
                      {t.author_name.slice(0, 1)}
                    </span>
                  )

                  return (
                    <div
                      key={`${r.round}-${t.author_id}-${i}`}
                      className={`flex items-start gap-3 ${isLeft ? '' : 'flex-row-reverse'}`}
                    >
                      {avatar}
                      <div className={`max-w-[75%] ${isLeft ? '' : 'text-right'}`}>
                        <div className={`flex items-center gap-2 mb-1.5 flex-wrap ${isLeft ? '' : 'justify-end'}`}>
                          <span className="text-sm font-semibold text-zhihu-ink">{t.author_name}</span>
                          <AiBadge />
                        </div>
                        <div
                          className={`relative rounded-2xl border-2 px-4 py-3 text-left overflow-hidden ${BUBBLE_STYLE}`}
                        >
                          <Watermark
                            text="AI 仅模拟"
                            tileWidth={180}
                            tileHeight={90}
                            fontSize={14}
                            color="rgba(124,58,237,0.16)"
                          />
                          <div className="relative text-sm leading-relaxed">
                            <Markdown content={t.content} tone="light" />
                          </div>
                          <div className="relative mt-2 pt-2 border-t border-violet-300/60 text-xs text-violet-700 font-bold flex items-center gap-1.5">
                            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 shrink-0">
                              <path d="M8 1a2.5 2.5 0 0 0-2.5 2.5v.382a2 2 0 0 0-1 1.732V7h7V5.614a2 2 0 0 0-1-1.732V3.5A2.5 2.5 0 0 0 8 1ZM5.5 8v1a2.5 2.5 0 0 0 5 0V8h-5ZM3 12.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1H6v1.5a.5.5 0 0 1-1 0V13H3.5a.5.5 0 0 1-.5-.5Z" />
                            </svg>
                            仅 AI 模拟 · 非答主本人立场
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}

          {/* 主持人总结 */}
          <section className="card p-5 relative overflow-hidden">
            <Watermark
              text="AI 生成 · 仅供参考"
              tileWidth={300}
              tileHeight={140}
              fontSize={18}
              color="rgba(124,58,237,0.10)"
            />
            <div className="relative">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-xs text-zhihu-gray">主持人总结</div>
              <AiBadge size="lg" />
            </div>
            <div className="mt-2 text-sm">
              <Markdown content={debate.summary} tone="light" />
            </div>

            <div className="mt-5 grid md:grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-zhihu-gray mb-2">共识</div>
                {debate.consensus.length === 0 ? (
                  <div className="text-sm text-gray-400">（无明显共识）</div>
                ) : (
                  <ul className="space-y-2">
                    {debate.consensus.map((v, i) => (
                      <li key={i} className="text-sm text-zhihu-ink leading-relaxed flex gap-2">
                        <span className="text-emerald-500 font-semibold">✓</span>
                        <span>{v}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <div className="text-xs text-zhihu-gray mb-2">分歧</div>
                {debate.divergences.length === 0 ? (
                  <div className="text-sm text-gray-400">（无明显分歧）</div>
                ) : (
                  <ul className="space-y-2">
                    {debate.divergences.map((v, i) => (
                      <li key={i} className="text-sm text-zhihu-ink leading-relaxed flex gap-2">
                        <span className="text-rose-500 font-semibold">⚡</span>
                        <span>{v}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
