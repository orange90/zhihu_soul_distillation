import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toPng } from 'html-to-image'
import { api } from '../lib/api'

type ScoreEntry = {
  user_id: string; user_name: string; user_avatar: string | null; score: number; rank: number
}

function Avatar({ url, name, size = 10, crossOrigin }: { url?: string | null; name: string; size?: number; crossOrigin?: 'anonymous' }) {
  const cls = `rounded-full object-cover border-2 border-white shadow`
  const style = { width: `${size * 4}px`, height: `${size * 4}px` }
  if (url) return <img src={url} alt={name} className={cls} style={style} crossOrigin={crossOrigin} />
  return (
    <div className={`${cls} bg-zhihu-blue flex items-center justify-center text-white font-bold text-base`} style={style}>
      {name.slice(0, 1)}
    </div>
  )
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-2xl">🥇</span>
  if (rank === 2) return <span className="text-2xl">🥈</span>
  if (rank === 3) return <span className="text-2xl">🥉</span>
  return <span className="text-sm font-bold text-gray-400 w-8 text-center">#{rank}</span>
}

function SharePoster({ user, rank, weekKey, onClose }: {
  user: ScoreEntry; rank: number; weekKey: string; onClose: () => void
}) {
  const posterRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)

  const rankLabel = rank === 1 ? '第 1 名 🥇' : rank === 2 ? '第 2 名 🥈' : rank === 3 ? '第 3 名 🥉' : `第 ${rank} 名`

  const handleSaveImage = async () => {
    if (!posterRef.current || exporting) return
    setExporting(true)
    try {
      const dataUrl = await toPng(posterRef.current, { cacheBust: true, pixelRatio: 2 })
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `知识蒸馏馆-周积分榜-${user.user_name}.png`
      a.click()
    } catch (e) {
      console.error('poster export failed', e)
      alert('图片生成失败，请重试')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Poster content */}
        <div
          ref={posterRef}
          className="bg-gradient-to-br from-blue-600 to-blue-900 p-8 text-white text-center"
        >
          <div className="text-xs font-medium text-blue-200 mb-4 tracking-wider uppercase">
            知识蒸馏馆 · 竞技场
          </div>
          <div className="flex justify-center mb-4">
            <Avatar url={user.user_avatar} name={user.user_name} size={16} crossOrigin="anonymous" />
          </div>
          <div className="font-bold text-xl mb-1">{user.user_name}</div>
          <div className="text-blue-200 text-sm mb-4">本周积分：{user.score} 分</div>
          <div className="bg-white/10 rounded-2xl py-4 px-6 mb-4">
            <div className="text-4xl font-black mb-1">{rankLabel}</div>
            <div className="text-blue-200 text-sm">{weekKey} 周积分榜</div>
          </div>
          <div className="border-t border-white/20 pt-4 flex items-center justify-between gap-3 text-left">
            <div className="text-blue-200 text-xs">
              <div className="mb-1">用 AI 数字分身参加辩论，赢 +2 / 负 -1</div>
              <div className="font-mono text-blue-300">zhihusoul.cn</div>
            </div>
            <img
              src="/qrcode.png"
              alt="二维码"
              className="w-16 h-16 rounded-lg bg-white p-1 shrink-0"
            />
          </div>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex gap-3">
            <button
              onClick={handleSaveImage}
              disabled={exporting}
              className="flex-1 py-2 rounded-full bg-zhihu-blue text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
            >
              {exporting ? '生成中…' : '保存图片'}
            </button>
            <button
              onClick={() => {
                // Simple copy the text representation
                navigator.clipboard.writeText(
                  `我在知识蒸馏馆竞技场中获得了 ${rankLabel}！本周积分 ${user.score} 分。快来 zhihusoul.cn 挑战我！`
                ).then(() => alert('已复制分享文字！'))
              }}
              className="flex-1 py-2 rounded-full border border-zhihu-blue text-zhihu-blue text-sm font-medium hover:bg-blue-50"
            >
              复制文字
            </button>
          </div>
          <button
            onClick={onClose}
            className="w-full py-2 rounded-full border border-gray-200 text-gray-600 text-sm"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}

export default function LeaderboardPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [scores, setScores] = useState<ScoreEntry[]>([])
  const [weekKey, setWeekKey] = useState('')
  const [myRank, setMyRank] = useState<number | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [sharingUser, setSharingUser] = useState<ScoreEntry | null>(null)

  useEffect(() => {
    api.me().then(r => setCurrentUserId(r.user?.id || null)).catch(() => {})
    api.leaderboard()
      .then(data => {
        setScores(data.scores)
        setWeekKey(data.week_key)
        setMyRank(data.my_rank)
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => navigate('/arena')} className="text-gray-400 hover:text-zhihu-blue text-sm">← 竞技场</button>
        <div>
          <h1 className="text-2xl font-bold text-zhihu-ink">🏆 周积分榜</h1>
          <div className="text-xs text-gray-500 mt-0.5">{weekKey} · 赢得辩论 +2 分 · 败场 -1 分</div>
        </div>
      </div>

      {myRank && (
        <div className="mb-6 p-4 rounded-xl bg-zhihu-blue-light border border-zhihu-blue/30 flex items-center justify-between">
          <span className="text-zhihu-blue font-medium text-sm">你的排名：第 {myRank} 名</span>
          <button
            onClick={() => {
              const me = scores.find(s => s.user_id === currentUserId)
              if (me) setSharingUser(me)
            }}
            className="text-xs px-3 py-1.5 rounded-full bg-zhihu-blue text-white hover:bg-blue-700"
          >
            分享排名
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">加载中…</div>
      ) : scores.length === 0 ? (
        <div className="text-center py-16 text-gray-400 border-2 border-dashed rounded-2xl">
          <div className="text-4xl mb-3">🏆</div>
          <div>本周还没有积分记录</div>
          <div className="text-sm mt-1 text-gray-300">去竞技场参加辩论赢得积分</div>
          <button onClick={() => navigate('/arena')} className="mt-4 btn-primary">前往竞技场</button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Top 3 podium */}
          {scores.length >= 3 && (
            <div className="mb-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-100 p-5">
              <div className="flex items-end justify-center gap-4">
                {/* 2nd */}
                <div className="flex flex-col items-center gap-2 pb-4">
                  <Avatar url={scores[1]?.user_avatar} name={scores[1]?.user_name} size={10} />
                  <div className="text-center">
                    <div className="text-sm font-medium text-gray-700 truncate max-w-[70px]">{scores[1]?.user_name}</div>
                    <div className="text-xs text-gray-500">{scores[1]?.score} 分</div>
                  </div>
                  <div className="bg-gray-300 w-14 h-8 rounded-t-lg flex items-center justify-center text-white font-bold text-sm">2</div>
                </div>
                {/* 1st */}
                <div className="flex flex-col items-center gap-2">
                  <span className="text-2xl">👑</span>
                  <Avatar url={scores[0]?.user_avatar} name={scores[0]?.user_name} size={14} />
                  <div className="text-center">
                    <div className="text-sm font-bold text-zhihu-ink truncate max-w-[80px]">{scores[0]?.user_name}</div>
                    <div className="text-xs text-zhihu-blue font-medium">{scores[0]?.score} 分</div>
                  </div>
                  <div className="bg-yellow-400 w-16 h-12 rounded-t-lg flex items-center justify-center text-white font-bold text-lg">1</div>
                </div>
                {/* 3rd */}
                <div className="flex flex-col items-center gap-2 pb-2">
                  <Avatar url={scores[2]?.user_avatar} name={scores[2]?.user_name} size={9} />
                  <div className="text-center">
                    <div className="text-sm font-medium text-gray-700 truncate max-w-[70px]">{scores[2]?.user_name}</div>
                    <div className="text-xs text-gray-500">{scores[2]?.score} 分</div>
                  </div>
                  <div className="bg-amber-600 w-12 h-6 rounded-t-lg flex items-center justify-center text-white font-bold text-sm">3</div>
                </div>
              </div>
            </div>
          )}

          {/* Full list */}
          {scores.map((entry) => (
            <div
              key={entry.user_id}
              className={[
                'flex items-center gap-4 p-4 rounded-xl border transition-colors',
                entry.user_id === currentUserId
                  ? 'bg-zhihu-blue-light border-zhihu-blue/40'
                  : 'bg-white border-gray-200 hover:border-gray-300'
              ].join(' ')}
            >
              <div className="w-10 flex items-center justify-center shrink-0">
                <RankBadge rank={entry.rank} />
              </div>
              <Avatar url={entry.user_avatar} name={entry.user_name} size={9} />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-zhihu-ink truncate">{entry.user_name}</div>
                {entry.user_id === currentUserId && (
                  <div className="text-xs text-zhihu-blue">这是你</div>
                )}
              </div>
              <div className="text-right shrink-0">
                <div className="text-lg font-bold text-zhihu-ink">{entry.score}</div>
                <div className="text-xs text-gray-400">积分</div>
              </div>
              {entry.user_id === currentUserId && (
                <button
                  onClick={() => setSharingUser(entry)}
                  className="text-xs px-2 py-1 rounded-full border border-gray-200 hover:bg-gray-50 text-gray-500"
                >
                  分享
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {sharingUser && (
        <SharePoster
          user={sharingUser}
          rank={sharingUser.rank}
          weekKey={weekKey}
          onClose={() => setSharingUser(null)}
        />
      )}
    </div>
  )
}
