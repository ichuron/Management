import { NavLink, Outlet } from 'react-router'
import type { ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { CalendarIcon, ChartIcon, GearIcon, WalletIcon } from './Icons'

const TABS: { to: string; label: string; icon: ReactNode }[] = [
  { to: '/', label: '家計簿', icon: <CalendarIcon /> },
  { to: '/report', label: '実績', icon: <ChartIcon /> },
  { to: '/assets', label: '資産', icon: <WalletIcon /> },
  { to: '/settings', label: '設定', icon: <GearIcon /> },
]

export function Layout() {
  const { dataReady, seedError } = useAuth()

  return (
    <div className="flex min-h-full">
      {/* PC（1024px 以上）：左サイドバー */}
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-6 lg:flex dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-6 px-3 text-lg font-bold text-teal-700 dark:text-teal-400">家計簿</div>
        <nav className="flex flex-col gap-1">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
                  isActive
                    ? 'bg-teal-50 text-teal-800 dark:bg-teal-950 dark:text-teal-300'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`
              }
            >
              {t.icon}
              {t.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-4 pb-28 lg:px-8 lg:pt-8 lg:pb-12">
          {seedError && (
            <p role="alert" className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
              ⚠ 初期データの準備に失敗しました：{seedError}
            </p>
          )}
          {dataReady ? <Outlet /> : <p className="py-12 text-center text-slate-500">読み込み中…</p>}
        </main>
      </div>

      {/* 全画面共通：右下の「＋ 記録」ボタン（入力シートは Phase 2 で実装） */}
      <button
        type="button"
        className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 flex items-center gap-1 rounded-full bg-teal-600 px-5 py-3.5 text-base font-bold text-white shadow-lg hover:bg-teal-700 active:scale-95 lg:right-8 lg:bottom-8 dark:bg-teal-500 dark:text-slate-950 dark:hover:bg-teal-400"
        onClick={() => alert('入力シートは Phase 2 で作ります')}
      >
        <span aria-hidden className="text-xl leading-none">＋</span> 記録
      </button>

      {/* スマホ：下部タブ */}
      <nav className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden dark:border-slate-800 dark:bg-slate-900/95">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2 text-xs font-medium ${
                isActive ? 'text-teal-700 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400'
              }`
            }
          >
            {t.icon}
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
