import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { getJSON, setJSON } from '../lib/storage'
import type { Author } from '../types'

export default function LoadingPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<string>('准备中…')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const ranRef = useRef(false)

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true

    const authors = getJSON<Author[]>('selectedAuthors')
    if (!authors || authors.length === 0) {
      navigate('/select', { replace: true })
      return
    }

    ;(async () => {
      try {
        setStep(`正在蒸馏 ${authors.length} 位答主的思维 DNA…`)
        setProgress(20)
        const { skills } = await api.distill(authors)

        setStep('融合集体人格…')
        setProgress(70)
        const { persona } = await api.persona(skills)

        setJSON('persona', persona)
        setProgress(100)
        setStep('完成')
        setTimeout(() => navigate('/result', { replace: true }), 400)
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

      {error && (
        <button className="btn-ghost mt-6" onClick={() => navigate('/select')}>
          返回重新选择
        </button>
      )}
    </div>
  )
}
