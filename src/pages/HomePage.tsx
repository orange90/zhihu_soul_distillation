import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

export default function HomePage() {
  const navigate = useNavigate()
  const [user, setUser] = useState<{
    id: string
    name: string
    avatar_url?: string
    upload_count?: number
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [pluginModal, setPluginModal] = useState(false)
  const [pluginToken, setPluginToken] = useState<string | null>(null)
  const [pluginTokenLoading, setPluginTokenLoading] = useState(false)
  const [pluginTokenError, setPluginTokenError] = useState<string | null>(null)
  const [pluginTokenCopied, setPluginTokenCopied] = useState(false)
  const [extInstalled, setExtInstalled] = useState<boolean | null>(null)
  const [extVersion, setExtVersion] = useState<string | null>(null)
  const [installStatus, setInstallStatus] = useState<
    null | { kind: 'ok' | 'err' | 'loading'; text: string }
  >(null)

  useEffect(() => {
    api.me()
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  // 检测浏览器插件
  useEffect(() => {
    let timer: number | null = null
    const onMsg = (ev: MessageEvent) => {
      if (ev.source !== window) return
      const d = ev.data
      if (!d || typeof d !== 'object') return
      if (d.type === 'zsd:pong' || d.type === 'zsd:installed') {
        setExtInstalled(true)
        if (typeof d.version === 'string') setExtVersion(d.version)
      }
    }
    window.addEventListener('message', onMsg)
    window.postMessage({ type: 'zsd:ping' }, window.location.origin)
    timer = window.setTimeout(() => {
      setExtInstalled((cur) => (cur === null ? false : cur))
    }, 1500)
    return () => {
      window.removeEventListener('message', onMsg)
      if (timer) window.clearTimeout(timer)
    }
  }, [])

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
      const ta = document.getElementById('plugin-token-textarea') as HTMLTextAreaElement | null
      ta?.select()
    }
  }

  const installTokenToExtension = async () => {
    setInstallStatus({ kind: 'loading', text: '正在写入插件…' })
    try {
      const r = await api.pluginToken()
      const ackPromise = new Promise<{ ok: boolean; error?: string }>((resolve) => {
        const timer = window.setTimeout(
          () => resolve({ ok: false, error: '插件未响应（请确认已安装并启用）' }),
          3000
        )
        const onMsg = (ev: MessageEvent) => {
          if (ev.source !== window) return
          const d = ev.data
          if (!d || d.type !== 'zsd:install-token-ack') return
          window.clearTimeout(timer)
          window.removeEventListener('message', onMsg)
          resolve({ ok: !!d.ok, error: d.error })
        }
        window.addEventListener('message', onMsg)
      })
      window.postMessage(
        { type: 'zsd:install-token', token: r.token, apiBase: window.location.origin },
        window.location.origin
      )
      const ack = await ackPromise
      if (ack.ok) {
        setInstallStatus({ kind: 'ok', text: '已写入插件 ✓ 去自己的知乎主页就能勾选回答了' })
      } else {
        setInstallStatus({ kind: 'err', text: `写入失败：${ack.error || 'unknown'}` })
      }
    } catch (e: any) {
      setInstallStatus({ kind: 'err', text: `获取 Token 失败：${String(e?.message || e)}` })
    }
  }

  return (
    <div className="relative max-w-3xl mx-auto px-4 py-16">
      {/* 背景光晕 */}
      <div aria-hidden className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 w-[320px] h-[320px] md:w-[520px] md:h-[520px] rounded-full bg-zhihu-blue/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute top-40 -right-20 w-[200px] h-[200px] md:w-[320px] md:h-[320px] rounded-full bg-zhihu-blue/5 blur-3xl" />

      <div className="relative text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zhihu-blue-light text-zhihu-blue text-xs font-medium mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-zhihu-blue" />
          知乎 Hackathon 2026 · 引力场赛道
        </div>

        <h1 className="text-4xl md:text-5xl font-bold leading-tight text-zhihu-ink">
          你的知识沉淀，
          <br />
          变成你的<span className="text-zhihu-blue">数字分身</span>
        </h1>

        <p className="mt-6 text-base text-gray-600 leading-relaxed max-w-xl mx-auto">
          上传你在知乎的回答，蒸馏出专属 AI 分身，
          <br />
          然后让它替你参加<span className="text-zhihu-blue font-medium">辩论赛</span>，
          或在<span className="text-amber-600 font-medium">学术酒吧</span>里与其他人的分身畅聊。
        </p>

        {/* 主入口按钮 */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          {loading ? (
            <>
              <div className="h-14 w-56 rounded-2xl bg-gray-100 animate-pulse" />
              <div className="h-14 w-56 rounded-2xl bg-gray-100 animate-pulse" />
            </>
          ) : user ? (
            <>
              <button
                onClick={() => navigate('/arena')}
                className="group w-full sm:w-auto flex items-center justify-center gap-3 px-7 py-4 rounded-2xl bg-zhihu-blue text-white text-base font-semibold shadow-lg shadow-zhihu-blue/20 hover:bg-zhihu-blue-dark transition-all hover:scale-[1.02]"
              >
                <span className="text-2xl">⚔️</span>
                <span>参与数字分身辩论赛</span>
              </button>
              <button
                onClick={() => navigate('/bar')}
                className="group w-full sm:w-auto flex items-center justify-center gap-3 px-7 py-4 rounded-2xl bg-amber-600 text-white text-base font-semibold shadow-lg shadow-amber-600/20 hover:bg-amber-700 transition-all hover:scale-[1.02]"
              >
                <span className="text-2xl">🍺</span>
                <span>参与数字分身学术酒吧</span>
              </button>
            </>
          ) : (
            <a
              className="flex items-center gap-2 px-8 py-4 rounded-2xl bg-zhihu-blue text-white text-base font-semibold shadow-lg shadow-zhihu-blue/20 hover:bg-zhihu-blue-dark transition-all hover:scale-[1.02]"
              href={api.loginUrl()}
            >
              使用知乎账号登录，开始体验
            </a>
          )}
        </div>

        {/* 已登录用户：快捷入口 */}
        {user && !loading && (
          <div className="mt-4 flex items-center justify-center gap-4 text-sm text-gray-500">
            <button
              onClick={() => navigate('/my-distillations')}
              className="hover:text-zhihu-blue hover:underline underline-offset-2"
            >
              🧪 管理我的蒸馏
            </button>
            <span className="text-gray-300">·</span>
            <button
              onClick={() => navigate('/leaderboard')}
              className="hover:text-zhihu-blue hover:underline underline-offset-2"
            >
              🏆 本周积分榜
            </button>
          </div>
        )}
      </div>

      {/* 三步说明 */}
      <div className="relative mt-14 grid md:grid-cols-3 gap-4">
        {[
          {
            icon: '🔌',
            t: '第一步：上传你的回答',
            d: '安装浏览器插件，到你的知乎主页勾选回答上传，最多保存 10 条精华。'
          },
          {
            icon: '🧪',
            t: '第二步：蒸馏数字分身',
            d: '在「我的蒸馏」页面一键开始，AI 提炼你的价值观、思维方式与写作风格，生成专属 Skill。每天可蒸馏 2 次，持续迭代。'
          },
          {
            icon: '⚔️',
            t: '第三步：让分身出战',
            d: '加入辩论场（5大类议题，赢了得积分）或学术酒吧（每晚8点，30人围坐畅聊）。'
          }
        ].map((s) => (
          <div key={s.t} className="card p-5">
            <div className="text-2xl mb-2">{s.icon}</div>
            <div className="text-zhihu-blue font-semibold text-sm">{s.t}</div>
            <div className="mt-2 text-sm text-gray-600 leading-relaxed">{s.d}</div>
          </div>
        ))}
      </div>

      {/* 浏览器插件 */}
      {user && (
        <div className="relative mt-8 rounded-xl border border-zhihu-blue/30 bg-white/70 backdrop-blur p-4 text-left">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-9 h-9 rounded-lg bg-zhihu-blue/10 text-zhihu-blue flex items-center justify-center text-lg">🔌</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-zhihu-ink">
                浏览器插件：把你的知乎回答变成数字分身素材
              </div>
              <div className="mt-1 text-xs text-gray-600 leading-relaxed">
                知乎没有"按答主拉全部回答"的公开 API。装上插件，到你的知乎主页一键勾选批量上传，
                蒸馏直接基于你本人的原始回答，生成只属于你的 Skill 文档。
                {typeof user.upload_count === 'number' && user.upload_count > 0 && (
                  <span className="ml-1 text-zhihu-blue font-medium">
                    你已上传 {user.upload_count} 条回答。
                  </span>
                )}
              </div>
              <div className="mt-2 text-xs rounded-md px-2 py-1.5 bg-blue-50 border border-blue-200 text-blue-700">
                <span className="font-medium">💡 提示：</span>如果你在手机上，将无法使用此浏览器插件来管理你的数字分身素材；请在电脑 Chrome 浏览器上使用此插件。
              </div>
              <div className="mt-3 flex flex-wrap gap-2 items-center">
                {extInstalled === true ? (
                  <>
                    <button
                      type="button"
                      onClick={installTokenToExtension}
                      disabled={installStatus?.kind === 'loading'}
                      className="text-xs px-3 py-1.5 rounded-full bg-zhihu-blue text-white hover:bg-zhihu-blue/90 disabled:opacity-50"
                    >
                      {installStatus?.kind === 'loading' ? '写入中…' : '一键写入 Token 到插件'}
                    </button>
                    <span className="text-[11px] text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                      ✓ 已检测到插件 {extVersion ? `v${extVersion}` : ''}
                    </span>
                  </>
                ) : (
                  <>
                    <a
                      href="https://github.com/orange90/zhihu_soul_distillation/releases"
                      target="_blank"
                      rel="noopener"
                      className="text-xs px-3 py-1.5 rounded-full bg-zhihu-blue text-white hover:bg-zhihu-blue/90"
                    >
                      下载插件
                    </a>
                    {extInstalled === false && (
                      <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                        未检测到插件（请先安装）
                      </span>
                    )}
                  </>
                )}
                <a
                  href="https://github.com/orange90/zhihu_soul_distillation#浏览器插件蒸馏自己"
                  target="_blank"
                  rel="noopener"
                  className="text-xs px-3 py-1.5 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  安装说明
                </a>
                <button
                  type="button"
                  onClick={openPluginModal}
                  className="text-[11px] text-gray-400 hover:text-zhihu-blue underline-offset-2 hover:underline"
                >
                  手动复制 Token
                </button>
              </div>
              {installStatus && (
                <div className={[
                  'mt-2 text-xs rounded-md px-2 py-1 inline-block',
                  installStatus.kind === 'ok'
                    ? 'text-emerald-700 bg-emerald-50 border border-emerald-200'
                    : installStatus.kind === 'err'
                      ? 'text-red-700 bg-red-50 border border-red-200'
                      : 'text-gray-600 bg-gray-50 border border-gray-200'
                ].join(' ')}>
                  {installStatus.text}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Token Modal */}
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
                className="w-7 h-7 rounded-full hover:bg-gray-100 text-gray-500 text-xl"
              >
                ×
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-600 leading-relaxed">
              复制下方 Token，粘贴到插件 popup 的"Token"输入框即可。Token 等效于你的登录态，请勿外传。
            </p>
            {pluginTokenLoading && <div className="mt-4 text-sm text-gray-500">生成中…</div>}
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
                <div className="mt-3 flex items-center justify-end">
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
    </div>
  )
}
