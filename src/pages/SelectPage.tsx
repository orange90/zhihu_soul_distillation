import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { setJSON } from '../lib/storage'
import type { Author } from '../types'

const MAX = 5
const PAGE_SIZE = 20

export default function SelectPage() {
  const navigate = useNavigate()
  const [authors, setAuthors] = useState<Author[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)

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

  const filteredAuthors = useMemo(() => {
    if (!authors) return []
    const q = query.trim().toLowerCase()
    const base = authors.filter((a) => !selected.has(a.id))
    if (!q) return base
    return base.filter((a) => {
      const name = a.name?.toLowerCase() ?? ''
      const headline = a.headline?.toLowerCase() ?? ''
      return name.includes(q) || headline.includes(q)
    })
  }, [authors, query, selected])

  const totalPages = Math.max(1, Math.ceil(filteredAuthors.length / PAGE_SIZE))

  useEffect(() => {
    setPage(1)
  }, [query, authors])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const pagedAuthors = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filteredAuthors.slice(start, start + PAGE_SIZE)
  }, [filteredAuthors, page])

  const pageNumbers = useMemo(() => {
    const maxButtons = 7
    if (totalPages <= maxButtons) {
      return Array.from({ length: totalPages }, (_, i) => i + 1)
    }
    const nums = new Set<number>([1, totalPages, page, page - 1, page + 1])
    return Array.from(nums)
      .filter((n) => n >= 1 && n <= totalPages)
      .sort((a, b) => a - b)
  }, [page, totalPages])

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

      {selectedList.length > 0 && (
        <div className="mt-6 rounded-xl border border-zhihu-blue/30 bg-zhihu-blue-light/40 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium text-zhihu-ink">
              已选答主
              <span className="ml-2 text-xs font-normal text-zhihu-gray">
                点击即可取消
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-xs text-zhihu-gray hover:text-zhihu-blue underline-offset-2 hover:underline"
            >
              清空
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedList.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => toggle(a.id)}
                className="group flex items-center gap-2 pl-1 pr-2 py-1 rounded-full bg-white border border-zhihu-blue/40 text-sm text-zhihu-ink hover:border-zhihu-blue hover:bg-zhihu-blue/5 transition"
                title="点击取消选择"
              >
                <span className="w-6 h-6 rounded-full bg-zhihu-blue-light overflow-hidden flex items-center justify-center text-zhihu-blue text-xs font-semibold shrink-0">
                  {a.avatar_url ? (
                    <img src={a.avatar_url} alt={a.name} className="w-full h-full object-cover" />
                  ) : (
                    a.name.slice(0, 1)
                  )}
                </span>
                <span className="max-w-[8rem] truncate">{a.name}</span>
                <svg
                  viewBox="0 0 24 24"
                  className="w-3.5 h-3.5 text-zhihu-gray group-hover:text-zhihu-blue"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </button>
            ))}
          </div>
        </div>
      )}

      {authors && authors.length > 0 && (
        <div className="mt-6 relative">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zhihu-gray pointer-events-none"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索姓名或签名"
            className="w-full pl-9 pr-9 py-2.5 rounded-lg border border-gray-200 bg-white text-sm outline-none focus:border-zhihu-blue focus:ring-2 focus:ring-zhihu-blue/20 transition"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-zhihu-gray hover:bg-gray-100"
              aria-label="清除搜索"
            >
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </svg>
            </button>
          )}
          <div className="mt-2 text-xs text-zhihu-gray">
            共 {authors.length} 人
            {selectedList.length > 0 && `（已选 ${selectedList.length}）`}
            {query.trim() && `，匹配 ${filteredAuthors.length} 人`}
            {totalPages > 1 && `，第 ${page} / ${totalPages} 页`}
          </div>
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

      {authors && authors.length > 0 && filteredAuthors.length === 0 && (
        <div className="mt-10 text-center text-gray-500 text-sm">
          {query.trim()
            ? `没有匹配「${query}」的答主，换个关键词试试。`
            : selectedList.length >= MAX
              ? `已达到最多 ${MAX} 人的选择上限。`
              : selectedList.length > 0
                ? '所有关注的答主都已选中。'
                : '没有可挑选的答主。'}
        </div>
      )}

      {authors && authors.length > 0 && filteredAuthors.length > 0 && (
        <div className="mt-6 grid md:grid-cols-2 gap-3">
          {pagedAuthors.map((a) => {
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

      {authors && filteredAuthors.length > 0 && totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-1 flex-wrap text-sm">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 rounded-md border border-gray-200 text-zhihu-ink hover:border-zhihu-blue disabled:opacity-40 disabled:cursor-not-allowed"
          >
            上一页
          </button>
          {pageNumbers.map((n, idx) => {
            const prev = pageNumbers[idx - 1]
            const showEllipsis = prev !== undefined && n - prev > 1
            return (
              <span key={n} className="flex items-center gap-1">
                {showEllipsis && <span className="px-1 text-zhihu-gray">…</span>}
                <button
                  type="button"
                  onClick={() => setPage(n)}
                  className={[
                    'min-w-[2rem] px-2 py-1.5 rounded-md border text-center',
                    n === page
                      ? 'bg-zhihu-blue text-white border-zhihu-blue'
                      : 'border-gray-200 text-zhihu-ink hover:border-zhihu-blue'
                  ].join(' ')}
                >
                  {n}
                </button>
              </span>
            )
          })}
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 rounded-md border border-gray-200 text-zhihu-ink hover:border-zhihu-blue disabled:opacity-40 disabled:cursor-not-allowed"
          >
            下一页
          </button>
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
