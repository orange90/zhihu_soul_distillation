import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

export default function HomePage() {
  const navigate = useNavigate()
  const [user, setUser] = useState<{
    id: string
    name: string
    avatar_url?: string
    opted_out?: boolean
    upload_count?: number
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [optOutLoading, setOptOutLoading] = useState(false)
  const [optOutError, setOptOutError] = useState<string | null>(null)
  const [pluginModal, setPluginModal] = useState(false)
  const [pluginToken, setPluginToken] = useState<string | null>(null)
  const [pluginTokenLoading, setPluginTokenLoading] = useState(false)
  const [pluginTokenError, setPluginTokenError] = useState<string | null>(null)
  const [pluginTokenCopied, setPluginTokenCopied] = useState(false)

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
    setOptOutError(null)
    try {
      const action = user.opted_out ? 'remove' : 'add'
      const result = await api.optout(action)
      setUser((u) => u ? { ...u, opted_out: result.opted_out } : u)
    } catch (e: any) {
      setOptOutError(String(e?.message || e))
    } finally {
      setOptOutLoading(false)
    }
  }

  const openPluginModal = async () => {
    setPluginModal(true)
    setPluginTokenCopied(false)
    if (pluginToken) return
    setPluginTokenLoading(true)
    setPluginTokenError(null)
    try {
      const r = await api.pluginToken()
      setPluginToken(r.token)
    } catch (e: any) {
      setPluginTokenError(String(e?.message || e))
    } finally {
      setPluginTokenLoading(false)
    }
  }

  const copyPluginToken = async () => {
    if (!pluginToken) return
    try {
      await navigator.clipboard.writeText(pluginToken)
      setPluginTokenCopied(true)
      setTimeout(() => setPluginTokenCopied(false), 2000)
    } catch {
      // 兜底：选中
      const ta = document.getElementById('plugin-token-textarea') as HTMLTextAreaElement | null
      ta?.select()
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

        <div className="mt-10 flex items-center justify-center gap-3 flex-wrap">
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
        {user && !loading && (
          <div className="mt-4 text-xs text-gray-500">
            {user.opted_out
              ? '当前状态：你已禁止其他用户（包括自己）将你蒸馏为 AI 分身。'
              : '当前状态：允许其他用户将你蒸馏为 AI 分身。'}
          </div>
        )}
        {optOutError && (
          <div className="mt-3 mx-auto max-w-md text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            操作失败：{optOutError}
          </div>
        )}

        {user && (
          <div className="mt-8 mx-auto max-w-2xl rounded-xl border border-zhihu-blue/30 bg-white/70 backdrop-blur p-4 text-left">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-9 h-9 rounded-lg bg-zhihu-blue/10 text-zhihu-blue flex items-center justify-center text-lg">🔌</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-zhihu-ink">
                  浏览器插件：把你自己的知乎沉淀变成个人 AI Skill
                </div>
                <div className="mt-1 text-xs text-gray-600 leading-relaxed">
                  知乎没有"按答主拉全部回答"的公开 API，导致搜索蒸馏出来的画像总是欠缺细节。
                  装上浏览器插件，到你自己的主页一键勾选 / 批量上传，蒸馏直接基于你本人的原始回答，
                  生成只属于你的 Skill 文档。
                  {typeof user.upload_count === 'number' && user.upload_count > 0 && (
                    <span className="ml-1 text-zhihu-blue font-medium">
                      你已通过插件上传 {user.upload_count} 条原始回答。
                    </span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={openPluginModal}
                    className="text-xs px-3 py-1.5 rounded-full bg-zhihu-blue text-white hover:bg-zhihu-blue/90"
                  >
                    获取插件 Token
                  </button>
                  <a
                    href="https://github.com/orange90/zhihu_soul_distillation/releases"
                    target="_blank"
                    rel="noopener"
                    className="text-xs px-3 py-1.5 rounded-full border border-zhihu-blue/40 text-zhihu-blue hover:bg-zhihu-blue/5"
                  >
                    下载插件（GitHub Releases）
                  </a>
                  <a
                    href="https://github.com/orange90/zhihu_soul_distillation#浏览器插件蒸馏自己"
                    target="_blank"
                    rel="noopener"
                    className="text-xs px-3 py-1.5 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50"
                  >
                    安装说明
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {pluginModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setPluginModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-zhihu-ink">浏览器插件 Token</h3>
              <button
                type="button"
                aria-label="关闭"
                onClick={() => setPluginModal(false)}
                className="w-7 h-7 rounded-full hover:bg-gray-100 text-gray-500"
              >
                ×
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-600 leading-relaxed">
              复制下方 Token，粘贴到插件 popup 的"Token"输入框即可。Token 等效于你的登录态，请勿外传。
              当你在网页端登出后请重新获取一次。
            </p>
            {pluginTokenLoading && (
              <div className="mt-4 text-sm text-gray-500">生成中…</div>
            )}
            {pluginTokenError && (
              <div className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                生成失败：{pluginTokenError}
              </div>
            )}
            {pluginToken && (
              <>
                <textarea
                  id="plugin-token-textarea"
                  readOnly
                  value={pluginToken}
                  className="mt-4 w-full h-24 text-xs font-mono rounded-md border border-gray-200 bg-gray-50 p-2 outline-none focus:border-zhihu-blue"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={copyPluginToken}
                    className="text-xs px-3 py-1.5 rounded-full bg-zhihu-blue text-white hover:bg-zhihu-blue/90"
                  >
                    {pluginTokenCopied ? '已复制 ✓' : '复制 Token'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

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
