import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { getJSON } from '../lib/storage'
import type { DebateResult, Persona } from '../types'

const PRESET_TOPICS = [
  '年轻人该不该 all in AI？',
  '远程办公会成为主流吗？',
  '专精还是广博，哪条路更值得走？'
]

const PALETTE = [
  'bg-blue-50 border-blue-200 text-blue-900',
  'bg-amber-50 border-amber-200 text-amber-900',
  'bg-emerald-50 border-emerald-200 text-emerald-900',
  'bg-rose-50 border-rose-200 text-rose-900',
  'bg-violet-50 border-violet-200 text-violet-900'
]

const AVATAR_PALETTE = [
  'bg-blue-500',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-rose-500',
  'bg-violet-500'
]

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

  const colorMap = useMemo(() => {
    const m = new Map<string, { bubble: string; avatar: string }>()
    if (!persona) return m
    persona.contributors.forEach((c, i) => {
      m.set(c.author_id, {
        bubble: PALETTE[i % PALETTE.length],
        avatar: AVATAR_PALETTE[i % AVATAR_PALETTE.length]
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

      {/* 出题区 */}
      <div className="card mt-6 p-5">
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
            每轮会并行调用一次 LLM 生成各方观点，2 轮辩论通常需要 10–25 秒。
          </div>
        </div>
      )}

      {/* 辩论结果 */}
      {debate && (
        <div className="mt-8 space-y-8">
          <div className="card p-5">
            <div className="text-xs text-zhihu-gray">本场辩题</div>
            <div className="mt-1 text-lg font-semibold text-zhihu-ink">{debate.question}</div>
          </div>

          {debate.rounds.map((r) => (
            <section key={r.round}>
              <div className="flex items-center gap-3 mb-3">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-zhihu-blue text-white text-xs font-semibold">
                  {r.round}
                </span>
                <div className="text-sm font-semibold text-zhihu-ink">
                  第 {r.round} 轮 · {r.topic_focus || '发言'}
                </div>
                <div className="flex-1 border-t border-gray-100" />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                {r.turns.map((t, i) => {
                  const c = colorMap.get(t.author_id) || {
                    bubble: PALETTE[i % PALETTE.length],
                    avatar: AVATAR_PALETTE[i % AVATAR_PALETTE.length]
                  }
                  return (
                    <div
                      key={`${r.round}-${t.author_id}-${i}`}
                      className={`rounded-2xl border p-4 ${c.bubble}`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-white text-xs font-semibold ${c.avatar}`}
                        >
                          {t.author_name.slice(0, 1)}
                        </span>
                        <span className="text-sm font-semibold">{t.author_name}</span>
                      </div>
                      <div className="mt-2 text-sm leading-relaxed whitespace-pre-wrap">
                        {t.content}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}

          {/* 主持人总结 */}
          <section className="card p-5">
            <div className="text-xs text-zhihu-gray">主持人总结</div>
            <p className="mt-2 text-sm text-zhihu-ink leading-relaxed">{debate.summary}</p>

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
          </section>
        </div>
      )}
    </div>
  )
}
