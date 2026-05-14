import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { getJSON, setJSON } from '../lib/storage'
import type { Author, AuthorSkills } from '../types'

type AuthorStatus =
  | 'pending'
  | 'fetching_answers'
  | 'ai_analyzing'
  | 'generating_skills'
  | 'cached'
  | 'done'
  | 'failed'

type AuthorProgress = {
  author: Author
  status: AuthorStatus
}

const STATUS_LABEL: Record<AuthorStatus, string> = {
  pending: '排队中',
  fetching_answers: '拉取答主回答ing',
  ai_analyzing: 'AI 分析中',
  generating_skills: '生成 skills 中',
  cached: '答主已被蒸馏过，已为你召唤出来',
  done: '蒸馏完成',
  failed: '蒸馏失败'
}

const STATUS_COLOR: Record<AuthorStatus, string> = {
  pending: 'text-gray-400',
  fetching_answers: 'text-zhihu-blue',
  ai_analyzing: 'text-zhihu-blue',
  generating_skills: 'text-zhihu-blue',
  cached: 'text-emerald-600',
  done: 'text-emerald-600',
  failed: 'text-red-500'
}

const SPINNING_STATUSES: AuthorStatus[] = [
  'fetching_answers',
  'ai_analyzing',
  'generating_skills'
]

export default function LoadingPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<string>('准备中…')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<AuthorProgress[]>([])
  const ranRef = useRef(false)

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true

    const authors = getJSON<Author[]>('selectedAuthors')
    if (!authors || authors.length === 0) {
      navigate('/select', { replace: true })
      return
    }

    setItems(authors.map((a) => ({ author: a, status: 'pending' })))

    const updateStatus = (authorId: string, status: AuthorStatus) =>
      setItems((prev) => prev.map((p) => (p.author.id === authorId ? { ...p, status } : p)))

    ;(async () => {
      try {
        const total = authors.length
        setStep(`正在蒸馏 ${total} 位答主的思维 DNA…`)

        let completed = 0
        const allSkills: AuthorSkills[] = []

        const { skills } = await api.distillStream(authors, (evt) => {
          if (evt.type === 'author_start') {
            // 占位：正式状态在 step 事件里更新
            return
          }
          if (evt.type === 'step') {
            switch (evt.step) {
              case 'cache_hit':
                updateStatus(evt.author_id, 'cached')
                break
              case 'fetch_answers':
                updateStatus(evt.author_id, 'fetching_answers')
                break
              case 'ai_probe':
                updateStatus(evt.author_id, 'ai_analyzing')
                break
              case 'generate_skills':
                updateStatus(evt.author_id, 'generating_skills')
                break
              // *_done 不直接切状态，等下一个 step / author_done 自然推进
            }
            return
          }
          if (evt.type === 'author_done') {
            completed += 1
            // 缓存命中保留 cached 文案；新蒸馏切到 done
            setItems((prev) =>
              prev.map((p) =>
                p.author.id === evt.author_id
                  ? { ...p, status: evt.fromCache ? 'cached' : 'done' }
                  : p
              )
            )
            setProgress(Math.round((completed / total) * 70))
            return
          }
          if (evt.type === 'author_error') {
            updateStatus(evt.author_id, 'failed')
            return
          }
        })

        allSkills.push(...skills)

        // 兜底：流式链路未能拿到 skills 时，回退到一次性 JSON 接口
        if (allSkills.length === 0) {
          const fallback = await api.distill(authors)
          allSkills.push(...(fallback.skills || []))
        }

        if (allSkills.length === 0) {
          throw new Error('蒸馏结果为空，请稍后重试')
        }

        setStep('融合集体人格…')
        setProgress(80)
        const avatarMap = new Map(authors.map((a) => [a.id, a.avatar_url]))
        const skillsWithAvatar = allSkills.map((s) => ({
          ...s,
          avatar_url: s.avatar_url || avatarMap.get(s.author_id)
        }))
        const { persona } = await api.persona(skillsWithAvatar)

        setJSON('persona', persona)
        setProgress(100)
        setStep('完成，你的智库马上出现')
        setTimeout(() => navigate('/result', { replace: true }), 2000)
      } catch (e: any) {
        setError(String(e?.message || e))
      }
    })()
  }, [navigate])

  return (
    <div className="max-w-2xl mx-auto px-4 py-24 text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-zhihu-blue-light mb-6">
        <div className="w-8 h-8 rounded-full border-4 border-zhihu-blue border-t-transparent animate-spin" />
      </div>
      <h2 className="text-xl font-semibold text-zhihu-ink">{error ? '蒸馏失败' : '正在蒸馏你的知识圈'}</h2>
      <p className="mt-2 text-sm text-gray-500">{error ?? step}</p>

      {!error && (
        <div className="mt-8 mx-auto w-full max-w-md h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-zhihu-blue transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {!error && items.length > 0 && (
        <ul className="mt-8 mx-auto w-full max-w-md text-left space-y-2">
          {items.map((item) => (
            <li
              key={item.author.id}
              className="flex items-center justify-between gap-3 px-4 py-2 bg-white border border-gray-100 rounded-xl"
            >
              <div className="flex items-center gap-3 min-w-0">
                {item.author.avatar_url ? (
                  <img
                    src={item.author.avatar_url}
                    alt={item.author.name}
                    className="w-8 h-8 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gray-100 shrink-0" />
                )}
                <span className="truncate text-sm text-zhihu-ink">{item.author.name}</span>
              </div>
              <span className={`text-xs shrink-0 ${STATUS_COLOR[item.status]}`}>
                {SPINNING_STATUSES.includes(item.status) && (
                  <span className="inline-block w-3 h-3 mr-1 align-[-2px] rounded-full border-2 border-zhihu-blue border-t-transparent animate-spin" />
                )}
                {STATUS_LABEL[item.status]}
              </span>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <button className="btn-ghost mt-6" onClick={() => navigate('/select')}>
          返回重新选择
        </button>
      )}

      <div className="mt-10 text-xs text-gray-400 space-y-1">
        <p>数据来源于知乎搜索结果，并非直接来源于答主的回答和文章</p>
        <p>数据存在一定噪声，蒸馏结果仅供参考，请谨慎辨别</p>
      </div>
    </div>
  )
}
