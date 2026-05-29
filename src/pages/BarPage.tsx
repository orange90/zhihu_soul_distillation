import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

type BarSession = {
  user_id: string; user_name: string; user_avatar: string | null
  table_num: number; seat_num: number
  speech: string | null; generated_at: string | null
}

type BarTopic = {
  id: string; topic: string; date_key: string; status: string; ai_summary: string | null
}

function Avatar({ url, name, size = 10 }: { url?: string | null; name: string; size?: number }) {
  const cls = `rounded-full object-cover border-2 border-blue-600 shadow-md`
  const style = { width: `${size * 4}px`, height: `${size * 4}px` }
  if (url) return <img src={url} alt={name} className={cls} style={style} />
  return (
    <div className={`${cls} bg-blue-700 flex items-center justify-center text-white font-bold`} style={style}>
      {name.slice(0, 1)}
    </div>
  )
}

// A single stool seat
function Seat({ session, isActive, currentSpeech, seatPos }: {
  session?: BarSession; isActive: boolean; currentSpeech: string | null; seatPos: 'top' | 'bottom' | 'left' | 'right'
}) {
  if (!session) {
    return (
      <div className="flex flex-col items-center gap-1">
        <div className="w-10 h-10 rounded-full border-2 border-dashed border-blue-700/40 bg-blue-900/20" />
        <div className="w-8 h-1.5 bg-blue-800/30 rounded-full mt-0.5" />
      </div>
    )
  }

  const bubbleStyle = {
    top: 'bottom-full mb-2',
    bottom: 'top-full mt-2',
    left: 'right-full mr-2',
    right: 'left-full ml-2'
  }[seatPos]

  return (
    <div className="flex flex-col items-center gap-1 relative">
      {isActive && currentSpeech && (
        <div className={`absolute ${bubbleStyle} z-20 pointer-events-none`}>
          <div className="w-52 bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl border border-blue-100 p-3">
            <TypewriterText text={currentSpeech} speed={25} />
          </div>
        </div>
      )}
      <div className={`relative transition-transform ${isActive ? 'scale-110' : ''}`}>
        <Avatar url={session.user_avatar} name={session.user_name} size={10} />
        {isActive && (
          <span className="absolute -top-0.5 -right-0.5 text-base">🍺</span>
        )}
      </div>
      <div className="text-center">
        <div className="text-[9px] text-blue-200 truncate max-w-[50px]">{session.user_name}</div>
      </div>
      <div className="w-9 h-1.5 bg-amber-700 rounded-full shadow-inner" />
    </div>
  )
}

function TypewriterText({ text, speed }: { text: string; speed: number }) {
  const [displayed, setDisplayed] = useState('')
  const idx = useRef(0)

  useEffect(() => {
    setDisplayed('')
    idx.current = 0
    const timer = setInterval(() => {
      if (idx.current < text.length) {
        setDisplayed(text.slice(0, idx.current + 1))
        idx.current++
      } else {
        clearInterval(timer)
      }
    }, 1000 / speed)
    return () => clearInterval(timer)
  }, [text, speed])

  return <p className="text-xs text-gray-800 leading-relaxed">{displayed}<span className="animate-pulse">|</span></p>
}

function BarTable({
  tableNum,
  sessions,
  activeUserId,
  currentSpeech
}: {
  tableNum: number;
  sessions: BarSession[];
  activeUserId: string | null;
  currentSpeech: string | null;
}) {
  // 6 seats: top row (1-3) and bottom row (4-6)
  const topSeats = [1, 2, 3]
  const bottomSeats = [4, 5, 6]

  const getSession = (seatNum: number) => sessions.find(s => s.seat_num === seatNum)

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Top seats */}
      <div className="flex gap-4 justify-center">
        {topSeats.map(seatNum => {
          const sess = getSession(seatNum)
          const isActive = !!sess && sess.user_id === activeUserId
          return (
            <Seat
              key={seatNum}
              session={sess}
              isActive={isActive}
              currentSpeech={isActive ? currentSpeech : null}
              seatPos="top"
            />
          )
        })}
      </div>

      {/* Table surface */}
      <div className="relative w-52 md:w-56 h-12 md:h-14 bg-gradient-to-br from-amber-900 via-amber-800 to-amber-900 rounded-xl border-2 border-amber-700 shadow-lg flex items-center justify-center">
        <div className="absolute inset-0 rounded-xl opacity-30"
          style={{ background: 'repeating-linear-gradient(45deg, rgba(0,0,0,0.1) 0px, rgba(0,0,0,0.1) 1px, transparent 1px, transparent 8px)' }}
        />
        <div className="relative text-amber-200 text-xs font-medium">吧台 #{tableNum}</div>
        {/* Beer marks */}
        <div className="absolute top-1 left-2 w-2 h-2 rounded-full border border-amber-600/40" />
        <div className="absolute top-1 right-3 w-1.5 h-1.5 rounded-full border border-amber-600/40" />
      </div>

      {/* Bottom seats */}
      <div className="flex gap-4 justify-center">
        {bottomSeats.map(seatNum => {
          const sess = getSession(seatNum)
          const isActive = !!sess && sess.user_id === activeUserId
          return (
            <Seat
              key={seatNum}
              session={sess}
              isActive={isActive}
              currentSpeech={isActive ? currentSpeech : null}
              seatPos="bottom"
            />
          )
        })}
      </div>
    </div>
  )
}

export default function BarPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [topic, setTopic] = useState<BarTopic | null>(null)
  const [sessions, setSessions] = useState<BarSession[]>([])
  const [isActive, setIsActive] = useState(false)
  const [isPublished, setIsPublished] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [mySession, setMySession] = useState<BarSession | null>(null)

  // Playback state
  const [currentSpeakerIdx, setCurrentSpeakerIdx] = useState(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const playTimerRef = useRef<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const speechSessions = sessions.filter(s => s.speech)

  const load = async () => {
    try {
      const data = await api.bar.get()
      setTopic(data.topic)
      setSessions(data.sessions)
      setIsActive(data.is_active)
      setIsPublished(data.is_published)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    api.me().then(r => setCurrentUserId(r.user?.id || null)).catch(() => {})
    load()
  }, [])

  useEffect(() => {
    if (currentUserId && sessions.length > 0) {
      const s = sessions.find(sess => sess.user_id === currentUserId)
      setMySession(s || null)
    }
  }, [currentUserId, sessions])

  useEffect(() => {
    if (!isPlaying || speechSessions.length === 0) return
    if (currentSpeakerIdx >= speechSessions.length) {
      setIsPlaying(false)
      return
    }
    const speech = speechSessions[currentSpeakerIdx]?.speech || ''
    const duration = Math.max(4000, (speech.length / 25) * 1000 + 2000)
    playTimerRef.current = window.setTimeout(() => {
      setCurrentSpeakerIdx(i => i + 1)
      const el = scrollRef.current?.querySelector(`[data-speech-idx="${currentSpeakerIdx + 1}"]`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, duration)
    return () => { if (playTimerRef.current) clearTimeout(playTimerRef.current) }
  }, [isPlaying, currentSpeakerIdx, speechSessions])

  const activeSession = speechSessions[currentSpeakerIdx] || null
  const activeSpeech = activeSession?.speech || null

  const handleJoin = async () => {
    setJoining(true)
    setJoinError(null)
    try {
      await api.bar.join()
      await load()
    } catch (e: any) {
      setJoinError(e?.message || '加入失败')
    } finally {
      setJoining(false)
    }
  }

  const startPlayback = () => {
    setCurrentSpeakerIdx(0)
    setIsPlaying(true)
  }

  // Group sessions by table
  const tableMap: Record<number, BarSession[]> = {}
  for (const s of sessions) {
    if (!tableMap[s.table_num]) tableMap[s.table_num] = []
    tableMap[s.table_num].push(s)
  }

  return (
    <div className="min-h-screen" style={{
      background: 'linear-gradient(135deg, #0a0a1a 0%, #0d1b3e 40%, #111827 100%)'
    }}>
      {/* Bar ambiance overlay */}
      <div className="fixed inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse at 20% 60%, rgba(59,130,246,0.08) 0%, transparent 60%), radial-gradient(ellipse at 80% 40%, rgba(139,92,246,0.06) 0%, transparent 50%)'
      }} />

      <div className="relative max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/')} className="text-blue-300/70 hover:text-blue-200 text-sm px-3 py-1.5 rounded-lg border border-blue-300/30 hover:border-blue-300/60 hover:bg-blue-300/10 transition-colors">← 返回</button>
          <div>
            <h1 className="text-2xl font-bold text-white">🍺 学术酒吧</h1>
            <div className="text-xs text-blue-300/60 mt-0.5">与你的数字分身一起，品酒论道</div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 text-blue-300/60">加载中…</div>
        ) : !isPublished || !topic ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">🌙</div>
            <div className="text-blue-200 text-lg font-medium mb-2">今日议题尚未发布</div>
            <div className="text-blue-300/60 text-sm">每天上午 10 点，今日议题将正式公布</div>
          </div>
        ) : (
          <>
            {/* Today's Topic */}
            <div className="mb-8 rounded-2xl bg-white/5 backdrop-blur border border-white/10 p-5">
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div className="flex-1">
                  <div className="text-blue-300/80 text-xs font-medium mb-1.5">
                    今日议题 · {topic.date_key}
                    {topic.status === 'active' && <span className="ml-2 text-amber-400">🔴 讨论进行中</span>}
                    {topic.status === 'completed' && <span className="ml-2 text-green-400">✓ 已结束</span>}
                  </div>
                  <h2 className="text-white text-xl font-bold leading-snug">
                    {topic.topic}
                  </h2>
                  <div className="mt-2 text-blue-300/60 text-xs">
                    晚上 8 点开始发言 · {sessions.length}/30 位吧友就坐
                  </div>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  {!mySession && topic.status !== 'completed' && (
                    <>
                      <button
                        onClick={handleJoin}
                        disabled={joining || sessions.length >= 30}
                        className="px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-50 transition-colors"
                      >
                        {joining ? '加入中…' : sessions.length >= 30 ? '已满员' : '加入酒吧 🍺'}
                      </button>
                      {joinError && (
                        <div className="text-xs text-red-400 max-w-[200px]">{joinError}
                          {joinError.includes('数字分身') && (
                            <button onClick={() => navigate('/my-distillations')} className="ml-1 underline">去蒸馏</button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                  {mySession && (
                    <div className="text-xs text-green-400 bg-green-400/10 rounded-full px-3 py-1.5 border border-green-400/30">
                      ✓ 已入座 吧台{mySession.table_num} 第{mySession.seat_num}位
                    </div>
                  )}
                  {speechSessions.length > 0 && !isPlaying && (
                    <button
                      onClick={startPlayback}
                      className="px-4 py-2 rounded-full bg-amber-600/80 hover:bg-amber-500 text-white text-sm"
                    >
                      ▶ 播放发言
                    </button>
                  )}
                  {isPlaying && (
                    <button
                      onClick={() => setIsPlaying(false)}
                      className="px-4 py-2 rounded-full bg-gray-600/80 hover:bg-gray-500 text-white text-sm"
                    >
                      ⏸ 暂停
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Bar layout - Tables */}
            <div className="mb-8">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 justify-items-center">
                {[1, 2, 3, 4, 5].map(tableNum => (
                  <div key={tableNum} className="rounded-2xl bg-white/3 backdrop-blur border border-white/8 p-5">
                    <BarTable
                      tableNum={tableNum}
                      sessions={tableMap[tableNum] || []}
                      activeUserId={activeSession?.user_id || null}
                      currentSpeech={activeSpeech}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Speeches transcript */}
            {speechSessions.length > 0 && (
              <div className="rounded-2xl bg-white/5 backdrop-blur border border-white/10 overflow-hidden mb-6">
                <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
                  <span className="text-white/80 text-sm font-medium">发言记录</span>
                  <span className="text-white/40 text-xs">{speechSessions.length} 条发言</span>
                </div>
                <div ref={scrollRef} className="max-h-96 overflow-y-auto p-4 space-y-4">
                  {speechSessions.map((s, i) => (
                    <div
                      key={s.user_id}
                      data-speech-idx={i}
                      className={[
                        'rounded-xl p-4 transition-colors',
                        i === currentSpeakerIdx
                          ? 'bg-blue-500/20 ring-1 ring-blue-400/40'
                          : 'bg-white/5'
                      ].join(' ')}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Avatar url={s.user_avatar} name={s.user_name} size={6} />
                        <span className="text-white/80 text-sm font-medium">{s.user_name}</span>
                        <span className="text-white/40 text-xs">吧台{s.table_num}</span>
                        <span className="text-white/30 text-lg">🍺</span>
                      </div>
                      <p className="text-white/70 text-sm leading-relaxed pl-8">{s.speech}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI Summary */}
            {topic.ai_summary && (
              <div className="rounded-2xl bg-gradient-to-br from-blue-900/40 to-purple-900/40 border border-blue-400/20 p-5">
                <div className="text-blue-300 text-sm font-medium mb-3 flex items-center gap-2">
                  <span className="text-lg">🤖</span> AI 摘要
                </div>
                <p className="text-white/80 text-sm leading-relaxed">{topic.ai_summary}</p>
              </div>
            )}

            {!isActive && topic.status === 'open' && (
              <div className="mt-6 text-center text-blue-300/60 text-sm">
                今晚 8 点，所有吧友的数字分身将自动开始发言
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
