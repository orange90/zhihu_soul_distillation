import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
}

const CATEGORY_COLORS: Record<string, string> = {
  '人文': 'text-purple-700 bg-purple-50 border-purple-200',
  '科技': 'text-blue-700 bg-blue-50 border-blue-200',
  '教育': 'text-green-700 bg-green-50 border-green-200',
  '生物科学': 'text-teal-700 bg-teal-50 border-teal-200'
}

function Avatar({ url, name, size = 10 }: { url?: string | null; name: string; size?: number }) {
  const [errored, setErrored] = useState(false)
  const cls = `w-${size} h-${size} rounded-full object-cover border-2 border-white shadow`
  if (url && !errored) return <img src={url} alt={name} className={cls} onError={() => setErrored(true)} />
  return (
    <div className={`w-${size} h-${size} rounded-full bg-zhihu-blue flex items-center justify-center text-white font-bold text-sm border-2 border-white shadow`}>
      {name.slice(0, 1)}
    </div>
  )
}

function DebateTable({
  label,
  side,
  participants,
  currentTurn,
  isTop
}: {
  label: string
  side: 'affirmative' | 'negative'
  participants: Participant[]
  currentTurn: Turn | null
  isTop: boolean
}) {
  const sideParts = participants.filter(p => p.side === side).sort((a, b) => a.debater_pos - b.debater_pos)
  const speakers = [1, 2, 3].map(pos => sideParts.find(p => p.debater_pos === pos))
  const activeSpeaker = currentTurn?.side === side ? currentTurn.position : null

  const bubbleContent = currentTurn?.side === side ? currentTurn.content : null

  const tableStyle = 'bg-gradient-to-br from-blue-700 to-blue-900 rounded-2xl border border-blue-500 shadow-lg'

  return (
    <div className={`flex flex-col items-center ${!isTop ? 'flex-col-reverse' : ''} gap-3`}>
      {/* Avatars */}
      <div className="flex gap-4 md:gap-6 justify-center">
        {speakers.map((p, i) => {
          const isActive = activeSpeaker === (i + 1)
          return (
            <div key={i} className="flex flex-col items-center gap-1 relative">
              {isTop && isActive && bubbleContent && (
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full w-48 md:w-64 z-10">
                  <div className="bg-white rounded-2xl rounded-bl-sm shadow-xl border border-gray-200 p-3 text-xs text-gray-700 leading-relaxed animate-fade-in">
                    {bubbleContent}
                  </div>
                  <div className="absolute bottom-0 left-6 w-3 h-3 bg-white border-b border-r border-gray-200 rotate-45 translate-y-1/2" />
                </div>
              )}
              <div className={`relative transition-transform ${isActive ? 'scale-110' : ''}`}>
                <Avatar url={p?.user_avatar} name={p?.user_name || '?'} size={12} />
                {isActive && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full border-2 border-white animate-pulse" />
                )}
              </div>
              <div className="text-center">
                <div className="text-[10px] font-medium text-gray-700 truncate max-w-[60px]">
                  {p?.user_name || (i === 0 ? '一辩' : i === 1 ? '二辩' : '三辩')}
                </div>
                <div className="text-[9px] text-gray-500">
                  {label}{i === 0 ? '一辩' : i === 1 ? '二辩' : '三辩'}
                </div>
              </div>
              {!isTop && isActive && bubbleContent && (
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 translate-y-full w-48 md:w-64 z-10">
                  <div className="absolute top-0 left-6 w-3 h-3 bg-white border-t border-l border-gray-200 rotate-45 -translate-y-1/2" />
                  <div className="bg-white rounded-2xl rounded-tl-sm shadow-xl border border-gray-200 p-3 text-xs text-gray-700 leading-relaxed animate-fade-in">
                    {bubbleContent}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Table */}
      <div className={`${tableStyle} px-8 py-4 w-64 md:w-80 text-center`}>
        <div className="text-white/60 text-xs mb-1">{side === 'affirmative' ? '正方' : '反方'}</div>
        <div className="text-white font-bold text-sm">{label}</div>
        <div className="text-white/70 text-xs mt-1">
          {side === 'affirmative' ? '支持' : '反对'}
        </div>
      </div>
    </div>
  )
}

function DebateView({ topic, participants }: { topic: Topic; participants: Participant[] }) {
  const turns: Turn[] = (topic as any).debate_transcript || []
  const [currentTurnIdx, setCurrentTurnIdx] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const intervalRef = useRef<number | null>(null)

  useEffect(() => {
    if (!isPlaying) return
    // 已播到当前已生成发言的末尾：若辩论仍在生成，则原地等待新发言（轮询会补齐 turns 后自动续播）；
    // 注意这里不要 setIsPlaying(false)，否则后续到达的发言不会再自动播放。
    if (currentTurnIdx >= turns.length) return
    const delay = Math.max(3000, (turns[currentTurnIdx]?.content.length || 0) * 60)
    intervalRef.current = window.setTimeout(() => {
      setCurrentTurnIdx(i => i + 1)
    }, delay)
    return () => { if (intervalRef.current) clearTimeout(intervalRef.current) }
  }, [currentTurnIdx, isPlaying, turns])

  const isGenerating = topic.status === 'debating'
  const caughtUp = currentTurnIdx >= turns.length

  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current.querySelector(`[data-idx="${currentTurnIdx}"]`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [currentTurnIdx])

  const currentTurn = turns[currentTurnIdx] || null

  const roundLabel = (r: number) => r === 1 ? '开场陈词' : r === 2 ? '交锋反驳' : '总结收尾'

  return (
    <div className="flex flex-col gap-4">
      {/* Arena stage */}
      <div className="relative bg-gradient-to-b from-blue-950 to-blue-900 rounded-3xl p-6 md:p-8 overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: 'radial-gradient(circle at 20% 50%, #60a5fa 0%, transparent 50%), radial-gradient(circle at 80% 50%, #818cf8 0%, transparent 50%)'
        }} />
        <div className="relative">
          {/* Desktop: left-right layout */}
          <div className="hidden md:flex items-center justify-between gap-6">
            <DebateTable label="正方" side="affirmative" participants={participants} currentTurn={currentTurn} isTop={true} />
            <div className="text-center flex-1">
              <div className="text-blue-300 text-xs font-medium mb-1">新知辩论场</div>
              <div className="text-white text-sm font-bold leading-snug">{topic.title}</div>
              {currentTurn && (
                <div className="mt-3 text-blue-200 text-xs animate-pulse">
                  第 {currentTurn.round} 轮 · {roundLabel(currentTurn.round)}
                </div>
              )}
              {isGenerating && caughtUp && (
                <div className="mt-2 text-blue-200 text-xs animate-pulse">
                  {turns.length === 0 ? '辩手就位，正在生成开场陈词…' : '正在生成下一轮发言…'}
                </div>
              )}
            </div>
            <DebateTable label="反方" side="negative" participants={participants} currentTurn={currentTurn} isTop={false} />
          </div>

          {/* Mobile: top-bottom layout */}
          <div className="md:hidden flex flex-col gap-6">
            <div className="text-center">
              <div className="text-blue-300 text-xs font-medium mb-1">新知辩论场</div>
              <div className="text-white text-sm font-bold">{topic.title}</div>
            </div>
            <DebateTable label="正方" side="affirmative" participants={participants} currentTurn={currentTurn} isTop={true} />
            <DebateTable label="反方" side="negative" participants={participants} currentTurn={currentTurn} isTop={false} />
          </div>
        </div>
      </div>

      {/* Playback controls */}
      {turns.length > 0 && (
        <div className="flex items-center justify-between bg-white rounded-xl border p-3">
          <span className="text-xs text-gray-500">
            {currentTurnIdx}/{turns.length} 条发言
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentTurnIdx(i => Math.max(0, i - 1))}
              className="text-xs px-3 py-1 rounded-full border border-gray-200 hover:bg-gray-50"
            >← 上一条</button>
            <button
              onClick={() => setIsPlaying(p => !p)}
              className="text-xs px-3 py-1 rounded-full bg-zhihu-blue text-white"
            >{isPlaying ? '暂停' : '播放'}</button>
            <button
              onClick={() => setCurrentTurnIdx(i => Math.min(turns.length - 1, i + 1))}
              className="text-xs px-3 py-1 rounded-full border border-gray-200 hover:bg-gray-50"
            >下一条 →</button>
          </div>
        </div>
      )}

      {/* Winner announcement */}
      {topic.winner && (
        <div className="rounded-xl border-2 border-yellow-300 bg-yellow-50 p-4">
          <div className="text-center font-bold text-yellow-800 text-lg mb-1">
            🏆 {topic.winner === 'affirmative' ? '正方获胜' : topic.winner === 'negative' ? '反方获胜' : '平局'}
          </div>
          <div className="text-sm text-yellow-700 text-center">{topic.ai_judgement}</div>
        </div>
      )}

      {/* Full transcript */}
      <div className="bg-white rounded-xl border">
        <div className="p-4 border-b flex items-center justify-between">
          <span className="font-medium text-sm text-zhihu-ink">完整辩论记录</span>
          <span className="text-xs text-gray-400">
            {turns.length} 条发言{isGenerating && <span className="ml-1 text-amber-500 animate-pulse">· 生成中…</span>}
          </span>
        </div>
        <div ref={scrollRef} className="max-h-80 overflow-y-auto p-3 space-y-3">
          {turns.length === 0 && (
            <div className="text-center text-xs text-gray-400 py-8">
              {isGenerating ? '辩手正在组织语言，发言将陆续出现…' : '暂无发言'}
            </div>
          )}
          {turns.map((t, i) => (
            <div
              key={i}
              data-idx={i}
              className={[
                'rounded-lg p-3 text-sm transition-colors',
                i === currentTurnIdx ? 'bg-zhihu-blue-light ring-2 ring-zhihu-blue/30' : 'bg-gray-50',
                t.side === 'affirmative' ? '' : 'border-l-2 border-orange-200'
              ].join(' ')}
            >
              <div className="flex items-center gap-2 mb-1">
                <Avatar url={t.user_avatar} name={t.user_name} size={5} />
                <span className="font-medium text-xs text-zhihu-ink">{t.user_name}</span>
                <span className="text-[10px] text-gray-400">
                  {t.side === 'affirmative' ? '正方' : '反方'}{t.position}辩 · 第{t.round}轮
                </span>
              </div>
              <p className="text-xs text-gray-700 leading-relaxed pl-7">{t.content}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function TopicCard({
  topic,
  currentUserId,
  onJoin,
  onView
}: {
  topic: Topic
  currentUserId: string | null
  onJoin: (topicId: string, side: 'affirmative' | 'negative') => void
  onView: (topic: Topic) => void
}) {
  const catCls = CATEGORY_COLORS[topic.category] || 'text-gray-700 bg-gray-50 border-gray-200'
  const myParticipant = topic.participants.find(p => p.user_id === currentUserId)
  const isJoined = !!myParticipant
  const isFull = topic.aff_count >= 3 && topic.neg_count >= 3

  return (
    <div className="relative bg-white rounded-2xl border border-gray-200 p-5 hover:border-blue-300 transition-colors shadow-sm overflow-hidden">
      {topic.winner && (
        <div className="absolute top-3 right-3 z-10 rotate-6 select-none pointer-events-none">
          <div className={[
            'text-xs font-black px-2 py-0.5 rounded border-2 shadow-sm',
            topic.winner === 'affirmative'
              ? 'text-blue-600 border-blue-500 bg-blue-50/90'
              : topic.winner === 'negative'
              ? 'text-orange-600 border-orange-500 bg-orange-50/90'
              : 'text-gray-600 border-gray-400 bg-gray-50/90'
          ].join(' ')}>
            {topic.winner === 'affirmative' ? '正方获胜' : topic.winner === 'negative' ? '反方获胜' : '平局'}
          </div>
        </div>
      )}
      <div className="flex items-start justify-between gap-3 mb-3">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${catCls}`}>
          {topic.category}
        </span>
        <span className={[
          'text-xs px-2 py-0.5 rounded-full',
          topic.status === 'open' ? 'bg-green-50 text-green-700' :
          topic.status === 'debating' ? 'bg-amber-50 text-amber-700' :
          'bg-gray-100 text-gray-500'
        ].join(' ')}>
          {topic.status === 'open' ? '招募中' : topic.status === 'debating' ? '辩论中' : '已完结'}
        </span>
      </div>

      <h3 className="font-bold text-zhihu-ink mb-2">{topic.title}</h3>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="bg-blue-50 rounded-lg p-2.5 text-xs border border-blue-100">
          <div className="text-blue-500 font-medium mb-1">正方 ({topic.aff_count}/3)</div>
          <div className="text-blue-800">{topic.affirmative_view}</div>
        </div>
        <div className="bg-orange-50 rounded-lg p-2.5 text-xs border border-orange-100">
          <div className="text-orange-500 font-medium mb-1">反方 ({topic.neg_count}/3)</div>
          <div className="text-orange-800">{topic.negative_view}</div>
        </div>
      </div>

      {/* Participant avatars */}
      <div className="flex items-center gap-1 mb-4">
        {topic.participants.map((p, i) => (
          <Avatar key={i} url={p.user_avatar} name={p.user_name} size={7} />
        ))}
        {topic.participants.length === 0 && (
          <span className="text-xs text-gray-400">暂无参与者</span>
        )}
      </div>

      <div className="flex gap-2">
        {topic.status === 'completed' && (
          <button onClick={() => onView(topic)} className="flex-1 btn-primary text-sm py-2">
            观看辩论
          </button>
        )}
        {topic.status === 'open' && !isJoined && !isFull && (
          <>
            <button
              onClick={() => onJoin(topic.id, 'affirmative')}
              disabled={topic.aff_count >= 3}
              className="flex-1 text-sm py-2 rounded-full border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              加入正方
            </button>
            <button
              onClick={() => onJoin(topic.id, 'negative')}
              disabled={topic.neg_count >= 3}
              className="flex-1 text-sm py-2 rounded-full border border-orange-300 text-orange-700 hover:bg-orange-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              加入反方
            </button>
          </>
        )}
        {isJoined && (
          <div className="flex-1 text-center text-sm py-2 bg-green-50 text-green-700 rounded-full border border-green-200">
            ✓ 已加入{myParticipant?.side === 'affirmative' ? '正方' : '反方'}{myParticipant?.debater_pos}辩
          </div>
        )}
        {!isJoined && isFull && topic.status === 'open' && (
          <div className="flex-1 text-center text-sm py-2 bg-gray-100 text-gray-500 rounded-full">辩论生成中…</div>
        )}
        {topic.status === 'debating' && (
          <button onClick={() => onView(topic)} className="flex-1 text-sm py-2 rounded-full border border-gray-200 hover:bg-gray-50 text-gray-600">
            进入辩论场
          </button>
        )}
      </div>
    </div>
  )
}

export default function ArenaPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [topics, setTopics] = useState<Topic[]>([])
  const [weekKey, setWeekKey] = useState('')
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; avatar_url?: string } | null>(null)
  const [joiningTopic, setJoiningTopic] = useState<string | null>(null)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [viewingTopic, setViewingTopic] = useState<(Topic & { debate_transcript?: Turn[] }) | null>(null)
  const [viewParticipants, setViewParticipants] = useState<Participant[]>([])

  useEffect(() => {
    api.me().then(r => {
      if (r.user) {
        setCurrentUserId(r.user.id)
        setCurrentUser(r.user)
      }
    }).catch(() => {})
    loadTopics()
  }, [])

  const loadTopics = async (opts?: { silent?: boolean; forceApi?: boolean }) => {
    if (!opts?.silent) setLoading(true)
    try {
      const data = await api.arena.list(opts?.forceApi)
      setTopics(data.topics)
      setWeekKey(data.week_key)
    } catch (e) {
      console.error(e)
    } finally {
      if (!opts?.silent) setLoading(false)
    }
  }

  // 有辩论处于「辩论中」时，轮询推进发言生成并刷新状态。
  // serverless 没有后台任务，发言由对 /api/arena?topicId= 的轮询逐轮生成（advanceDebate）。
  // 单轮生成约需数十秒，用 inFlight 标记避免上一轮还没回来就重复触发（白白多花 LLM 调用）。
  const debatingIds = topics.filter(t => t.status === 'debating').map(t => t.id).join(',')
  const listAdvancing = useRef(false)
  useEffect(() => {
    if (!debatingIds) return
    let cancelled = false
    const tick = async () => {
      if (listAdvancing.current) return
      listAdvancing.current = true
      try {
        const ids = debatingIds.split(',').filter(Boolean)
        // 逐个推进（getTopic 会在服务端生成下一轮），再静默刷新列表状态
        await Promise.all(ids.map(id => api.arena.getTopic(id).catch(() => {})))
        if (!cancelled) await loadTopics({ silent: true, forceApi: true })
      } finally {
        listAdvancing.current = false
      }
    }
    const timer = setInterval(tick, 12000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [debatingIds])

  // 正在观看的辩论若未完结，轮询补齐后续轮次的发言
  const modalAdvancing = useRef(false)
  useEffect(() => {
    if (!viewingTopic || viewingTopic.status === 'completed') return
    let cancelled = false
    const tick = async () => {
      if (modalAdvancing.current) return
      modalAdvancing.current = true
      try {
        const data = await api.arena.getTopic(viewingTopic.id)
        if (cancelled) return
        setViewingTopic({ ...data.topic, debate_transcript: data.topic.debate_transcript || [] })
        setViewParticipants(data.participants)
      } catch { /* 忽略单次失败，下次轮询再试 */ } finally {
        modalAdvancing.current = false
      }
    }
    const timer = setInterval(tick, 10000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [viewingTopic?.id, viewingTopic?.status])

  const handleJoin = async (topicId: string, side: 'affirmative' | 'negative') => {
    setJoiningTopic(topicId)
    setJoinError(null)
    try {
      const result = await api.arena.join(topicId, side)
      // Optimistic update: show avatar immediately without waiting for server refresh
      if (currentUser) {
        setTopics(prev => prev.map(t => {
          if (t.id !== topicId) return t
          const newParticipant: Participant = {
            user_id: currentUser.id,
            user_name: currentUser.name,
            user_avatar: currentUser.avatar_url || null,
            side,
            debater_pos: result.debater_pos
          }
          return {
            ...t,
            participants: [...t.participants, newParticipant],
            aff_count: side === 'affirmative' ? t.aff_count + 1 : t.aff_count,
            neg_count: side === 'negative' ? t.neg_count + 1 : t.neg_count,
          }
        }))
      }
      // Silently sync from API (bypass static cache) to get authoritative state
      loadTopics({ silent: true, forceApi: true })
    } catch (e: any) {
      setJoinError(e?.message || '加入失败')
    } finally {
      setJoiningTopic(null)
    }
  }

  const handleView = async (topic: Topic) => {
    const data = await api.arena.getTopic(topic.id)
    setViewingTopic({ ...data.topic, debate_transcript: data.topic.debate_transcript || [] })
    setViewParticipants(data.participants)
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/')} className="text-gray-500 hover:text-zhihu-blue text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:border-zhihu-blue/40 hover:bg-blue-50 transition-colors">← 返回</button>
        <div>
          <h1 className="text-2xl font-bold text-zhihu-ink">新知辩论场</h1>
          <div className="text-xs text-gray-500 mt-0.5">今日 {weekKey} · 4 场辩论，每日更新，用你的数字分身参战</div>
        </div>
        <button
          onClick={() => navigate('/leaderboard')}
          className="ml-auto text-sm px-4 py-2 rounded-full border border-blue-200 text-blue-700 hover:bg-blue-50"
        >
          🏆 周积分榜
        </button>
      </div>

      {joinError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {joinError}
          {joinError.includes('数字分身') && (
            <button onClick={() => navigate('/my-distillations')} className="ml-2 text-zhihu-blue underline">
              去蒸馏
            </button>
          )}
        </div>
      )}

      {/* Debate View Modal */}
      {viewingTopic && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 overflow-y-auto p-4 md:p-8">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl">
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <div className="text-xs text-gray-500 mb-0.5">{viewingTopic.category}</div>
                <h2 className="font-bold text-zhihu-ink">{viewingTopic.title}</h2>
              </div>
              <button onClick={() => setViewingTopic(null)} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
            </div>
            <div className="p-5">
              <DebateView topic={viewingTopic} participants={viewParticipants} />
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-400">加载辩题中…</div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {topics.map(topic => (
            <TopicCard
              key={topic.id}
              topic={topic}
              currentUserId={currentUserId}
              onJoin={handleJoin}
              onView={handleView}
            />
          ))}
        </div>
      )}

      {joiningTopic && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl p-6 text-center shadow-xl">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
            <div className="text-sm text-gray-700">加入中…</div>
          </div>
        </div>
      )}
    </div>
  )
}
