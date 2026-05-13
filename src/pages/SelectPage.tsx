import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { setJSON } from '../lib/storage'
import type { Author } from '../types'

const MAX = 5

export default function SelectPage() {
  const navigate = useNavigate()
  const [authors, setAuthors] = useState<Author[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    api
      .following()
      .then((r) => setAuthors(r.authors))
      .catch((e) => setError(String(e.message || e)))
  }, [])

  const selectedList = useMemo(
    () => (authors ?? []).filter((a) => selected.has(a.id)),
    [authors, selected]
  )

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        if (next.size >= MAX) return prev
        next.add(id)
      }
      return next
    })
  }

  const submit = () => {
    if (selectedList.length === 0) return
    setJSON('selectedAuthors', selectedList)
    navigate('/loading')
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zhihu-ink">挑选你的知识圈成员</h1>
          <p className="text-sm text-gray-500 mt-1">
            最多选择 {MAX} 人。选 1 人可生成集体人格，
            <span className="text-zhihu-blue font-medium">≥ 2 人</span>
            还能解锁「互相辩论」模式。
          </p>
        </div>
        <div className="text-sm">
          <span className="text-zhihu-gray">已选</span>
          <span className="mx-1 font-semibold text-zhihu-blue">{selectedList.length}</span>
          <span className="text-zhihu-gray">/ {MAX}</span>
        </div>
      </div>

      {error && (
        <div className="mt-6 card p-4 border-red-200 bg-red-50 text-red-600 text-sm">
          加载关注列表失败：{error}。请确认已登录知乎账号。
        </div>
      )}

      {!authors && !error && (
        <div className="mt-6 grid md:grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card p-4 h-20 animate-pulse bg-gray-50" />
          ))}
        </div>
      )}

      {authors && authors.length === 0 && (
        <div className="mt-10 text-center text-gray-500 text-sm">
          没有获取到关注的人。可以先去知乎关注几位答主再回来体验。
        </div>
      )}

      {authors && authors.length > 0 && (
        <div className="mt-6 grid md:grid-cols-2 gap-3">
          {authors.map((a) => {
            const isOn = selected.has(a.id)
            const disabled = !isOn && selected.size >= MAX
            return (
              <button
                key={a.id}
                disabled={disabled}
                onClick={() => toggle(a.id)}
                className={[
                  'card text-left p-4 flex items-center gap-3 transition-all',
                  isOn ? 'ring-2 ring-zhihu-blue border-zhihu-blue' : 'hover:border-zhihu-blue/50',
                  disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                ].join(' ')}
              >
                <div className="w-10 h-10 rounded-full bg-zhihu-blue-light overflow-hidden flex items-center justify-center text-zhihu-blue font-semibold">
                  {a.avatar_url ? (
                    <img src={a.avatar_url} alt={a.name} className="w-full h-full object-cover" />
                  ) : (
                    a.name.slice(0, 1)
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{a.name}</div>
                  <div className="text-xs text-zhihu-gray truncate">{a.headline || '知乎答主'}</div>
                </div>
                <div
                  className={[
                    'w-5 h-5 rounded-full border flex items-center justify-center',
                    isOn ? 'bg-zhihu-blue border-zhihu-blue text-white' : 'border-gray-300'
                  ].join(' ')}
                >
                  {isOn && (
                    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      <div className="sticky bottom-4 mt-10 flex items-center justify-end gap-3">
        {selectedList.length > 0 && (
          <span className="text-xs text-zhihu-gray">
            {selectedList.length >= 2
              ? '可解锁「集体人格对话」+「互相辩论」'
              : '当前仅可生成集体人格，再选 1 人即可解锁辩论'}
          </span>
        )}
        <button className="btn-primary shadow-lg" disabled={selectedList.length === 0} onClick={submit}>
          开始蒸馏 {selectedList.length > 0 && `（${selectedList.length} 人）`}
        </button>
      </div>
    </div>
  )
}
