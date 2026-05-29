import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

type Answer = {
  answer_id: string
  title: string
  excerpt: string
  voteup_count: number
  url: string
  kind: string
  created_at: string
}

type DistillResult = {
  rating: string
  rating_score: number
  skill_desc: string
  skill_markdown: string
  answer_count: number
  distill_count: number
  last_distilled_at: string
}

const RATING_CONFIG: Record<string, { emoji: string; color: string; bg: string; desc: string }> = {
  '夯': { emoji: '🏆', color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-300', desc: '个性鲜明，观点独到' },
  '人上人': { emoji: '✨', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-300', desc: '有独特风格，思维清晰' },
  'NPC': { emoji: '😐', color: 'text-gray-600', bg: 'bg-gray-50 border-gray-300', desc: '个性模糊，素材不足' },
  '拉完了': { emoji: '💀', color: 'text-red-600', bg: 'bg-red-50 border-red-300', desc: '数据极少，难以提炼' }
}

export default function MyDistillationsPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [answers, setAnswers] = useState<Answer[]>([])
  const [result, setResult] = useState<DistillResult | null>(null)
  const [totalAnswers, setTotalAnswers] = useState(0)
  const [maxAnswers, setMaxAnswers] = useState(10)
  const [dailyCount, setDailyCount] = useState(0)
  const [dailyMax, setDailyMax] = useState(2)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [distilling, setDistilling] = useState(false)
  const [distillError, setDistillError] = useState<string | null>(null)
  const [skillModal, setSkillModal] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const data = await api.myDistillations()
      setAnswers(data.answers)
      setTotalAnswers(data.total)
      setMaxAnswers(data.max_answers)
      setResult(data.distillation_result)
      setDailyCount(data.daily_distill_count)
      setDailyMax(data.daily_distill_max)
    } catch (e: any) {
      if (e?.message?.includes('401') || e?.message?.includes('请先登录')) {
        navigate('/')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const deleteSelected = async () => {
    if (selected.size === 0) return
    setDeleting(true)
    try {
      await api.deleteAnswers([...selected])
      setSelected(new Set())
      await load()
    } catch (e: any) {
      alert('删除失败：' + e?.message)
    } finally {
      setDeleting(false)
    }
  }

  const startDistill = async () => {
    if (dailyCount >= dailyMax) {
      setDistillError(`今日蒸馏次数已达上限（${dailyMax} 次），明天再来`)
      return
    }
    if (answers.length === 0) {
      setDistillError('请先通过浏览器插件上传你的知乎回答')
      return
    }
    setDistilling(true)
    setDistillError(null)
    try {
      const r = await api.distillSelf()
      setResult({
        rating: r.rating,
        rating_score: r.rating_score,
        skill_desc: r.skill_desc,
        skill_markdown: r.skill_markdown,
        answer_count: r.answer_count,
        distill_count: r.distill_count,
        last_distilled_at: new Date().toISOString()
      })
      setDailyCount(c => c + 1)
    } catch (e: any) {
      setDistillError(e?.message || '蒸馏失败，请稍后再试')
    } finally {
      setDistilling(false)
    }
  }

  const ratingCfg = result ? (RATING_CONFIG[result.rating] || RATING_CONFIG['人上人']) : null

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <div className="text-gray-400">加载中…</div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => navigate('/')} className="text-gray-400 hover:text-zhihu-blue text-sm">← 返回</button>
        <h1 className="text-2xl font-bold text-zhihu-ink">我的蒸馏管理</h1>
      </div>

      {/* Distillation Result Card */}
      {result && ratingCfg && (
        <div className={`mb-6 rounded-2xl border-2 p-5 ${ratingCfg.bg}`}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">{ratingCfg.emoji}</span>
                <span className={`text-2xl font-bold ${ratingCfg.color}`}>{result.rating}</span>
                <span className="text-gray-500 text-sm ml-1">{ratingCfg.desc}</span>
              </div>
              <p className="mt-2 text-sm text-gray-700 leading-relaxed line-clamp-3">{result.skill_desc}</p>
            </div>
            <div className="text-right text-xs text-gray-400 shrink-0">
              <div>第 {result.distill_count} 次蒸馏</div>
              <div>基于 {result.answer_count} 条回答</div>
              <div>{new Date(result.last_distilled_at).toLocaleDateString('zh-CN')}</div>
              <button
                onClick={() => setSkillModal(true)}
                className="mt-2 text-zhihu-blue hover:underline"
              >
                查看 Skill 文档
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Distill Controls */}
      <div className="mb-6 p-4 rounded-xl bg-white border border-gray-200 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-sm font-medium text-zhihu-ink">开始蒸馏</div>
          <div className="text-xs text-gray-500 mt-0.5">
            今日已蒸馏 {dailyCount}/{dailyMax} 次 · 基于以下 {answers.length} 条回答
          </div>
        </div>
        <div className="flex gap-2 items-center">
          {distillError && (
            <span className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-1">
              {distillError}
            </span>
          )}
          <button
            onClick={startDistill}
            disabled={distilling || dailyCount >= dailyMax || answers.length === 0}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {distilling ? '蒸馏中…' : '开始蒸馏'}
          </button>
        </div>
      </div>

      {distilling && (
        <div className="mb-6 p-4 rounded-xl bg-zhihu-blue-light border border-zhihu-blue/30 text-sm text-zhihu-blue">
          <div className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            正在蒸馏你的知识 DNA，请耐心等待（约 30-60 秒）…
          </div>
        </div>
      )}

      {/* Answers List */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <span className="font-medium text-zhihu-ink">已上传回答</span>
          <span className="ml-2 text-sm text-gray-500">{totalAnswers}/{maxAnswers}</span>
          {totalAnswers >= maxAnswers && (
            <span className="ml-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
              已满，请删除后再上传
            </span>
          )}
        </div>
        {selected.size > 0 && (
          <button
            onClick={deleteSelected}
            disabled={deleting}
            className="text-sm text-red-600 hover:text-red-700 border border-red-200 rounded-full px-3 py-1 hover:bg-red-50"
          >
            {deleting ? '删除中…' : `删除已选 ${selected.size} 条`}
          </button>
        )}
      </div>

      {answers.length === 0 ? (
        <div className="text-center py-12 text-gray-400 border-2 border-dashed rounded-xl">
          <div className="text-3xl mb-3">📭</div>
          <div className="text-sm">你还没有上传任何回答</div>
          <div className="mt-2 text-xs text-gray-400">请安装浏览器插件，到你的知乎主页勾选回答上传</div>
        </div>
      ) : (
        <div className="space-y-2">
          {answers.map(a => (
            <div
              key={a.answer_id}
              onClick={() => toggleSelect(a.answer_id)}
              className={[
                'p-4 rounded-xl border cursor-pointer transition-all select-none',
                selected.has(a.answer_id)
                  ? 'border-red-300 bg-red-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              ].join(' ')}
            >
              <div className="flex items-start gap-3">
                <div className={[
                  'mt-0.5 w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors',
                  selected.has(a.answer_id) ? 'border-red-500 bg-red-500' : 'border-gray-300'
                ].join(' ')}>
                  {selected.has(a.answer_id) && (
                    <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="currentColor">
                      <path d="M1.5 5L4 7.5 8.5 2.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-zhihu-ink truncate">{a.title || '(无标题)'}</div>
                  <div className="mt-1 text-xs text-gray-500 line-clamp-2">{a.excerpt}</div>
                  <div className="mt-1.5 flex items-center gap-3 text-xs text-gray-400">
                    <span>👍 {a.voteup_count}</span>
                    <span>{a.kind === 'article' ? '文章' : '回答'}</span>
                    {a.url && (
                      <a href={a.url} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} className="text-zhihu-blue hover:underline">
                        查看原文
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Skill Modal */}
      {skillModal && result && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSkillModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="font-semibold text-zhihu-ink">我的 Skill 文档</h3>
              <button onClick={() => setSkillModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="overflow-y-auto p-5">
              <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">{result.skill_markdown}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
