import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

type Participant = {
  user_id: string; user_name: string; user_avatar: string | null
  side: string; debater_pos: number
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
    tick() // 进入页面立即开始推进，不必等首个轮询间隔
    const timer = setInterval(tick, 12000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [debatingIds])

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

  const handleView = (topic: Topic) => {
    navigate(`/arena/${topic.id}`)
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
