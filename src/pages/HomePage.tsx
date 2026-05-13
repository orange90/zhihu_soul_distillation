import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

export default function HomePage() {
  const navigate = useNavigate()
  const [user, setUser] = useState<{ id: string; name: string; avatar_url?: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .me()
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <div className="text-center">
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
            <button className="btn-primary" onClick={() => navigate('/select')}>
              开始蒸馏，{user.name}
            </button>
          ) : (
            <a className="btn-primary" href={api.loginUrl()}>
              使用知乎账号登录
            </a>
          )}
          <Link to="/select" className="btn-ghost">
            先看看 Demo
          </Link>
        </div>
      </div>

      <div className="mt-16 grid md:grid-cols-3 gap-4">
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
