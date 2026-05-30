import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api'

type Participant = {
  user_id: string; user_name: string; user_avatar: string | null
  side: string; debater_pos: number
}

type Turn = {
  side: string; position: number; round: number
  user_id: string; user_name: string; user_avatar: string
  content: string
}

type Topic = {
  id: string; category: string; title: string
  affirmative_view: string; negative_view: string
  week_key: string; status: string; winner: string | null; ai_judgement: string | null
  participants: Participant[]; aff_count: number; neg_count: number
  debate_transcript?: Turn[]
}

const CATEGORY_COLORS: Record<string, string> = {
  '人文': 'text-purple-700 bg-purple-50 border-purple-200',
  '科技': 'text-blue-700 bg-blue-50 border-blue-200',
  '教育': 'text-green-700 bg-green-50 border-green-200',
  '生物科学': 'text-teal-700 bg-teal-50 border-teal-200',
  '数码': 'text-indigo-700 bg-indigo-50 border-indigo-200',
}

const POS_LABELS = ['一辩', '二辩', '三辩']

function Avatar({ url, name, size = 10 }: { url?: string | null; name: string; size?: number }) {
  const [errored, setErrored] = useState(false)
  const sizeClass = `w-${size} h-${size}`
  if (url && !errored)
    return (
      <img
        src={url}
        alt={name}
        className={`${sizeClass} rounded-full object-cover`}
        onError={() => setErrored(true)}
      />
    )
  return (
    <div className={`${sizeClass} rounded-full bg-zhihu-blue flex items-center justify-center text-white font-bold text-sm`}>
      {name.slice(0, 1)}
    </div>
  )
}

function DebaterSeat({
  participant,
  posLabel,
  sideLabel,
  isActive,
  isBlue,
}: {
  participant: Participant | undefined
  posLabel: string
  sideLabel: string
  isActive: boolean
  isBlue: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className={[
          'relative rounded-full transition-all duration-500',
          isActive
            ? isBlue
              ? 'ring-2 ring-blue-400 ring-offset-2 ring-offset-blue-950 shadow-lg shadow-blue-400/40'
              : 'ring-2 ring-orange-400 ring-offset-2 ring-offset-blue-950 shadow-lg shadow-orange-400/40'
            : 'opacity-50',
        ].join(' ')}
      >
        <Avatar url={participant?.user_avatar} name={participant?.user_name || posLabel} size={12} />
        {isActive && (
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-green-400 rounded-full border-2 border-[#0f172a] animate-pulse" />
        )}
      </div>
      <div className="text-center">
        <div className={`text-[10px] font-medium truncate max-w-[56px] ${isBlue ? 'text-blue-200' : 'text-orange-200'}`}>
          {participant?.user_name || posLabel}
        </div>
        <div className={`text-[9px] ${isBlue ? 'text-blue-300/60' : 'text-orange-300/60'}`}>
          {sideLabel}{posLabel}
        </div>
      </div>
    </div>
  )
}

function roundLabel(r: number) {
  return r === 1 ? '开场陈词' : r === 2 ? '交锋反驳' : '总结收尾'
}

export default function ArenaDebateViewPage() {
  const { topicId } = useParams<{ topicId: string }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [topic, setTopic] = useState<Topic | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [currentTurnIdx, setCurrentTurnIdx] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)

  const advancingRef = useRef(false)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!topicId) return
    setLoading(true)
    api.arena
      .getTopic(topicId)
      .then(data => {
        setTopic({ ...data.topic, debate_transcript: data.topic.debate_transcript || [] })
        setParticipants(data.participants || [])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [topicId])

  // Poll to advance debate generation while status is 'debating'
  useEffect(() => {
    if (!topic || topic.status === 'completed') return
    let cancelled = false
    const tick = async () => {
      if (advancingRef.current) return
      advancingRef.current = true
      try {
        const data = await api.arena.getTopic(topic.id)
        if (!cancelled) {
          setTopic({ ...data.topic, debate_transcript: data.topic.debate_transcript || [] })
          setParticipants(data.participants || [])
        }
      } catch { /* ignore, retry next tick */ } finally {
        advancingRef.current = false
      }
    }
    tick()
    const timer = setInterval(tick, 6000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [topic?.id, topic?.status])

  const turns = topic?.debate_transcript || []
  const isGenerating = topic?.status === 'debating'
  const caughtUp = currentTurnIdx >= turns.length
  const currentTurn = turns[currentTurnIdx] ?? null

  // Auto-play: advance to next turn after reading delay
  useEffect(() => {
    if (!isPlaying || currentTurnIdx >= turns.length) return
    const delay = Math.max(3000, (turns[currentTurnIdx]?.content?.length || 0) * 55)
    timerRef.current = window.setTimeout(() => setCurrentTurnIdx(i => i + 1), delay)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [currentTurnIdx, isPlaying, turns])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center text-gray-400">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
          <div className="text-sm">加载辩论中…</div>
        </div>
      </div>
    )
  }

  if (!topic) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        <div className="text-center">
          <div className="text-4xl mb-3">🎭</div>
          <div className="text-sm mb-4">辩题不存在或已删除</div>
          <button
            onClick={() => navigate('/arena')}
            className="text-sm text-zhihu-blue hover:underline"
          >
            ← 返回辩论场
          </button>
        </div>
      </div>
    )
  }

  const catCls = CATEGORY_COLORS[topic.category] || 'text-gray-700 bg-gray-50 border-gray-200'
  const affParts = participants.filter(p => p.side === 'affirmative').sort((a, b) => a.debater_pos - b.debater_pos)
  const negParts = participants.filter(p => p.side === 'negative').sort((a, b) => a.debater_pos - b.debater_pos)
  const aff3 = [1, 2, 3].map(pos => affParts.find(p => p.debater_pos === pos))
  const neg3 = [1, 2, 3].map(pos => negParts.find(p => p.debater_pos === pos))

  const progress = turns.length ? (Math.min(currentTurnIdx, turns.length) / turns.length) * 100 : 0

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-sm border-b shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <button
            onClick={() => navigate('/arena')}
            className="text-gray-500 hover:text-zhihu-blue text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors shrink-0"
          >
            ← 返回辩论场
          </button>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border shrink-0 ${catCls}`}>
            {topic.category}
          </span>
          <h1 className="font-bold text-zhihu-ink text-sm flex-1 min-w-0 truncate">{topic.title}</h1>
          <span
            className={[
              'text-xs px-2.5 py-0.5 rounded-full shrink-0',
              topic.status === 'completed'
                ? 'bg-gray-100 text-gray-500'
                : topic.status === 'debating'
                ? 'bg-amber-50 text-amber-600'
                : 'bg-green-50 text-green-700',
            ].join(' ')}
          >
            {topic.status === 'completed'
              ? '已完结'
              : topic.status === 'debating'
              ? '辩论中…'
              : '招募中'}
          </span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {/* ─── Debate Stage ─── */}
        <div className="relative bg-gradient-to-br from-[#0f172a] to-[#1a3356] rounded-3xl overflow-hidden">
          {/* ambient glow */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage:
                'radial-gradient(ellipse at 18% 60%, rgba(96,165,250,0.14) 0%, transparent 55%), radial-gradient(ellipse at 82% 40%, rgba(251,146,60,0.11) 0%, transparent 55%)',
            }}
          />

          <div className="relative p-5 md:p-8">
            {/* ── Desktop: three columns ── */}
            <div className="hidden md:grid md:grid-cols-[1fr_260px_1fr] gap-6 items-start">

              {/* 正方 */}
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-4 bg-blue-400 rounded-full" />
                  <span className="text-blue-300 text-xs font-semibold tracking-widest">正方</span>
                </div>
                <div className="flex justify-center gap-5">
                  {aff3.map((p, i) => (
                    <DebaterSeat
                      key={i}
                      participant={p}
                      posLabel={POS_LABELS[i]}
                      sideLabel="正"
                      isActive={currentTurn?.side === 'affirmative' && currentTurn.position === i + 1}
                      isBlue
                    />
                  ))}
                </div>
                <div className="bg-blue-900/40 border border-blue-400/20 rounded-xl px-4 py-3">
                  <div className="text-blue-400/60 text-[10px] mb-1">正方主张</div>
                  <div className="text-blue-100 text-xs leading-relaxed">{topic.affirmative_view}</div>
                </div>
              </div>

              {/* Center: debate table */}
              <div className="flex flex-col items-center gap-4">
                <div className="text-center">
                  <div className="text-white/40 text-[10px] tracking-widest mb-1">新知辩论场</div>
                  <div className="text-white font-bold text-sm leading-snug">{topic.title}</div>
                </div>

                {/* Speech panel — the "debate table" */}
                <div className="w-full rounded-2xl border border-white/10 overflow-hidden">
                  <div className="bg-white/5 border-b border-white/10 px-3 py-2 flex items-center justify-center gap-2">
                    {currentTurn ? (
                      <>
                        <div
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            currentTurn.side === 'affirmative' ? 'bg-blue-400' : 'bg-orange-400'
                          }`}
                        />
                        <span
                          className={`text-[10px] font-semibold ${
                            currentTurn.side === 'affirmative' ? 'text-blue-300' : 'text-orange-300'
                          }`}
                        >
                          第 {currentTurn.round} 轮 · {roundLabel(currentTurn.round)}
                        </span>
                      </>
                    ) : (
                      <span className="text-white/30 text-[10px]">辩论桌</span>
                    )}
                  </div>
                  <div className="bg-[#080f1e]/50 p-4 h-[200px] overflow-y-auto scroll-thin flex flex-col justify-start">
                    {currentTurn ? (
                      <div key={currentTurnIdx} className="animate-fade-in">
                        <div className="text-white/50 text-[10px] mb-2">
                          {currentTurn.user_name} ·{' '}
                          {currentTurn.side === 'affirmative' ? '正' : '反'}方{currentTurn.position}辩
                        </div>
                        <p className="text-white/90 text-xs leading-relaxed">{currentTurn.content}</p>
                      </div>
                    ) : (
                      <p className="text-white/25 text-xs text-center m-auto">
                        {isGenerating && caughtUp
                          ? turns.length === 0
                            ? '辩手就位，正在生成开场陈词…'
                            : '正在生成下一条发言…'
                          : '等待辩论开始'}
                      </p>
                    )}
                  </div>
                </div>

                <div className="w-8 h-8 rounded-full bg-white/8 border border-white/15 flex items-center justify-center text-white/40 text-[10px] font-black">
                  VS
                </div>
              </div>

              {/* 反方 */}
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2 justify-end">
                  <span className="text-orange-300 text-xs font-semibold tracking-widest">反方</span>
                  <div className="w-1 h-4 bg-orange-400 rounded-full" />
                </div>
                <div className="flex justify-center gap-5">
                  {neg3.map((p, i) => (
                    <DebaterSeat
                      key={i}
                      participant={p}
                      posLabel={POS_LABELS[i]}
                      sideLabel="反"
                      isActive={currentTurn?.side === 'negative' && currentTurn.position === i + 1}
                      isBlue={false}
                    />
                  ))}
                </div>
                <div className="bg-orange-900/20 border border-orange-400/20 rounded-xl px-4 py-3">
                  <div className="text-orange-400/60 text-[10px] mb-1">反方主张</div>
                  <div className="text-orange-100 text-xs leading-relaxed">{topic.negative_view}</div>
                </div>
              </div>
            </div>

            {/* ── Mobile: stacked ── */}
            <div className="md:hidden flex flex-col gap-5">
              <div className="text-center">
                <div className="text-white/40 text-[10px] mb-1">新知辩论场</div>
                <div className="text-white font-bold text-sm leading-snug">{topic.title}</div>
              </div>

              {/* Current speech card */}
              <div className="rounded-2xl border border-white/10 overflow-hidden">
                <div className="bg-white/5 border-b border-white/10 px-3 py-2 flex items-center justify-center gap-2">
                  {currentTurn ? (
                    <>
                      <div
                        className={`w-1.5 h-1.5 rounded-full ${
                          currentTurn.side === 'affirmative' ? 'bg-blue-400' : 'bg-orange-400'
                        }`}
                      />
                      <span
                        className={`text-[10px] font-semibold ${
                          currentTurn.side === 'affirmative' ? 'text-blue-300' : 'text-orange-300'
                        }`}
                      >
                        第 {currentTurn.round} 轮 · {roundLabel(currentTurn.round)}
                      </span>
                    </>
                  ) : (
                    <span className="text-white/30 text-[10px]">辩论桌</span>
                  )}
                </div>
                <div className="bg-[#080f1e]/50 p-4 h-[180px] overflow-y-auto scroll-thin flex flex-col justify-start">
                  {currentTurn ? (
                    <div key={currentTurnIdx} className="animate-fade-in">
                      <div className="text-white/50 text-[10px] mb-1.5">
                        {currentTurn.user_name} ·{' '}
                        {currentTurn.side === 'affirmative' ? '正' : '反'}方{currentTurn.position}辩
                      </div>
                      <p className="text-white/90 text-xs leading-relaxed">{currentTurn.content}</p>
                    </div>
                  ) : (
                    <p className="text-white/25 text-xs text-center m-auto">
                      {isGenerating && caughtUp
                        ? turns.length === 0
                          ? '辩手就位，正在生成…'
                          : '正在生成下一条…'
                        : '等待辩论开始'}
                    </p>
                  )}
                </div>
              </div>

              {/* Two sides side by side */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1 h-3 bg-blue-400 rounded-full" />
                    <span className="text-blue-300 text-[10px] font-semibold tracking-widest">正方</span>
                  </div>
                  <div className="flex justify-around">
                    {aff3.map((p, i) => (
                      <DebaterSeat
                        key={i}
                        participant={p}
                        posLabel={POS_LABELS[i]}
                        sideLabel="正"
                        isActive={currentTurn?.side === 'affirmative' && currentTurn.position === i + 1}
                        isBlue
                      />
                    ))}
                  </div>
                  <div className="bg-blue-900/40 border border-blue-400/20 rounded-lg px-3 py-2">
                    <div className="text-blue-400/60 text-[9px] mb-0.5">正方主张</div>
                    <div className="text-blue-100 text-[10px] leading-relaxed">{topic.affirmative_view}</div>
                  </div>
                </div>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-1.5 justify-end">
                    <span className="text-orange-300 text-[10px] font-semibold tracking-widest">反方</span>
                    <div className="w-1 h-3 bg-orange-400 rounded-full" />
                  </div>
                  <div className="flex justify-around">
                    {neg3.map((p, i) => (
                      <DebaterSeat
                        key={i}
                        participant={p}
                        posLabel={POS_LABELS[i]}
                        sideLabel="反"
                        isActive={currentTurn?.side === 'negative' && currentTurn.position === i + 1}
                        isBlue={false}
                      />
                    ))}
                  </div>
                  <div className="bg-orange-900/20 border border-orange-400/20 rounded-lg px-3 py-2">
                    <div className="text-orange-400/60 text-[9px] mb-0.5">反方主张</div>
                    <div className="text-orange-100 text-[10px] leading-relaxed">{topic.negative_view}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Winner banner ─── */}
        {topic.winner && (
          <div className="rounded-2xl border-2 border-yellow-300 bg-gradient-to-br from-yellow-50 to-amber-50 p-5">
            <div className="text-center font-black text-yellow-800 text-xl mb-2">
              🏆{' '}
              {topic.winner === 'affirmative'
                ? '正方获胜'
                : topic.winner === 'negative'
                ? '反方获胜'
                : '势均力敌，平局'}
            </div>
            {topic.ai_judgement && (
              <div className="text-sm text-yellow-700 text-center leading-relaxed">{topic.ai_judgement}</div>
            )}
          </div>
        )}

        {/* ─── Playback controls ─── */}
        {turns.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 px-4 py-3 flex items-center gap-3">
            <span className="text-xs text-gray-400 shrink-0 tabular-nums">
              {Math.min(currentTurnIdx, turns.length)}/{turns.length}
            </span>
            <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-zhihu-blue rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentTurnIdx(i => Math.max(0, i - 1))}
                className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 hover:bg-gray-50 text-sm transition-colors"
                title="上一条"
              >
                ←
              </button>
              <button
                onClick={() => setIsPlaying(p => !p)}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-zhihu-blue text-white text-sm font-medium transition-colors hover:bg-zhihu-blue-dark"
                title={isPlaying ? '暂停' : '播放'}
              >
                {isPlaying ? '⏸' : '▶'}
              </button>
              <button
                onClick={() => setCurrentTurnIdx(i => Math.min(turns.length - 1, i + 1))}
                className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 hover:bg-gray-50 text-sm transition-colors"
                title="下一条"
              >
                →
              </button>
            </div>
          </div>
        )}

        {/* ─── Full transcript ─── */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <span className="font-semibold text-sm text-zhihu-ink">完整辩论记录</span>
            <span className="text-xs text-gray-400">
              {turns.length} 条发言
              {isGenerating && (
                <span className="ml-1 text-amber-500 animate-pulse">· 生成中…</span>
              )}
            </span>
          </div>
          <div className="max-h-[480px] overflow-y-auto divide-y divide-gray-50 scroll-thin">
            {turns.length === 0 && (
              <div className="text-center py-14 text-sm text-gray-400">
                {isGenerating ? '辩手正在组织语言，发言将陆续出现…' : '暂无发言记录'}
              </div>
            )}
            {turns.map((t, i) => (
              <div
                key={i}
                data-idx={i}
                className={[
                  'px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors',
                  i === currentTurnIdx ? 'bg-blue-50 border-l-[3px] border-zhihu-blue' : 'border-l-[3px] border-transparent',
                ].join(' ')}
                onClick={() => { setCurrentTurnIdx(i); setIsPlaying(false) }}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <div
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      t.side === 'affirmative' ? 'bg-blue-400' : 'bg-orange-400'
                    }`}
                  />
                  <span className="font-medium text-xs text-zhihu-ink">{t.user_name}</span>
                  <span className="text-[10px] text-gray-400">
                    {t.side === 'affirmative' ? '正方' : '反方'}{t.position}辩 · 第{t.round}轮{' '}
                    {roundLabel(t.round)}
                  </span>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed pl-3.5">{t.content}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
