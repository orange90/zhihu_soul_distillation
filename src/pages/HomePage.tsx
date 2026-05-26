import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

export default function HomePage() {
  const navigate = useNavigate()
  const [user, setUser] = useState<{ id: string; name: string; avatar_url?: string; opted_out?: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [optOutLoading, setOptOutLoading] = useState(false)

  useEffect(() => {
    api
      .me()
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const handleOptOutToggle = async () => {
    if (!user) return
    setOptOutLoading(true)
    try {
      const action = user.opted_out ? 'remove' : 'add'
      const result = await api.optout(action)
      setUser((u) => u ? { ...u, opted_out: result.opted_out } : u)
    } catch {
      // silently ignore
    } finally {
      setOptOutLoading(false)
    }
  }

  return (
    <div className="relative max-w-3xl mx-auto px-4 py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 w-[320px] h-[320px] md:w-[520px] md:h-[520px] rounded-full bg-zhihu-blue/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-40 -right-20 w-[200px] h-[200px] md:w-[320px] md:h-[320px] rounded-full bg-zhihu-blue/5 blur-3xl"
      />
      <div className="relative text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zhihu-blue-light text-zhihu-blue text-xs font-medium mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-zhihu-blue" />
          知乎 Hackathon 2026 · 引力场赛道
        </div>
        <h1 className="text-4xl md:text-5xl font-bold leading-tight text-zhihu-ink">
          你关注的人，
          <br />
          是你<span className="text-zhihu-blue">看不见的智库</span>
        </h1>
        <p className="mt-6 text-base text-gray-600 leading-relaxed">
          把你在知乎关注的那些人，蒸馏成一个可以对话的集体智慧体，
          <br />
          也可以让他们就同一个话题<span className="text-zhihu-blue font-medium">互相辩论</span>，呈现共识与分歧。
        </p>

        <div className="mt-10 flex items-center justify-center gap-3">
          {loading ? (
            <div className="h-11 w-40 rounded-full bg-gray-100 animate-pulse" />
          ) : user ? (
            <>
              <button className="btn-primary" onClick={() => navigate('/select')}>
                开始蒸馏
              </button>
              <button
                className={[
                  'px-4 py-2.5 rounded-full border text-sm font-medium transition',
                  user.opted_out
                    ? 'border-green-400 text-green-700 bg-green-50 hover:bg-green-100'
                    : 'border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50'
                ].join(' ')}
                onClick={handleOptOutToggle}
                disabled={optOutLoading}
                title={user.opted_out ? '点击取消，允许其他用户蒸馏你' : '点击后，其他用户将无法蒸馏你'}
              >
                {optOutLoading ? '处理中…' : user.opted_out ? '已禁止被蒸馏 ✓' : '禁止自己被蒸馏'}
              </button>
            </>
          ) : (
            <a className="btn-primary" href={api.loginUrl()}>
              使用知乎账号登录
            </a>
          )}
        </div>
      </div>

      <div className="relative mt-16 grid md:grid-cols-3 gap-4">
        {[
          {
            t: '1. 选择最多 5 位',
            d: '从你的关注列表中挑选最能代表你的知识圈的 5 个人。'
          },
          {
            t: '2. 蒸馏思维 DNA',
            d: '对每个答主提取「价值观 / 思维方式 / 擅长领域 / 代表观点」。'
          },
          {
            t: '3. 对话 or 辩论',
            d: '既能以融合人格的「我们」回答问题，也能让答主们围绕一个话题彼此交锋，自动提炼共识与分歧。'
          }
        ].map((s) => (
          <div key={s.t} className="card p-5">
            <div className="text-zhihu-blue font-semibold">{s.t}</div>
            <div className="mt-2 text-sm text-gray-600 leading-relaxed">{s.d}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
