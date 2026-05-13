import { Link, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'

export default function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex items-center justify-between h-14 px-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-zhihu-blue flex items-center justify-center text-white text-sm font-bold">
              蒸
            </div>
            <span className="font-semibold text-zhihu-ink">知识蒸馏馆</span>
          </Link>
          <nav className="text-sm text-zhihu-gray">
            {pathname !== '/' && (
              <Link to="/" className="hover:text-zhihu-blue">
                首页
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-gray-100 bg-white text-center text-xs text-zhihu-gray py-4">
        知乎 Hackathon 2026 · 引力场赛道 · 知识蒸馏馆
      </footer>
    </div>
  )
}
