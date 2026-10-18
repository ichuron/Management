import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { Card, PageTitle } from '../components/ui'
import { formatYen } from '../lib/money'
import { applyTheme, loadTheme } from '../lib/theme'
import { useTable } from '../lib/useTable'
import { ACCOUNT_KIND_LABEL, CATEGORY_GROUP_LABEL, type Account, type Budget, type Category, type CategoryGroup, type Settings, type Theme } from '../lib/types'
import { supabase } from '../lib/supabase'

const THEMES: { value: Theme; label: string }[] = [
  { value: 'system', label: '端末に合わせる' },
  { value: 'light', label: 'ライト' },
  { value: 'dark', label: 'ダーク' },
]

export function SettingsPage() {
  const { session, signOut } = useAuth()
  const categories = useTable<Category>('categories')
  const budgets = useTable<Budget>('budgets', 'created_at')
  const accounts = useTable<Account>('accounts')
  const settings = useTable<Settings>('settings', 'created_at')
  const [theme, setTheme] = useState<Theme>(loadTheme)

  const saved = settings.rows[0]
  // 別の端末で変えたテーマを反映する
  useEffect(() => {
    if (saved) {
      setTheme(saved.theme)
      applyTheme(saved.theme)
    }
  }, [saved])

  async function changeTheme(t: Theme) {
    setTheme(t)
    applyTheme(t)
    if (saved && supabase) await supabase.from('settings').update({ theme: t }).eq('id', saved.id)
  }

  const defaultBudget = new Map(budgets.rows.filter((b) => b.month === null).map((b) => [b.category_id, b.amount]))
  const groups: CategoryGroup[] = ['fixed', 'living', 'income']
  const error = categories.error ?? budgets.error ?? accounts.error ?? settings.error

  return (
    <>
      <PageTitle>設定</PageTitle>
      {error && (
        <p role="alert" className="mb-4 text-sm text-red-700 dark:text-red-400">
          ⚠ 読み込みに失敗しました：{error}
        </p>
      )}

      <div className="grid gap-x-4 lg:grid-cols-2">
        <div>
          <Card title="カテゴリと月の予算">
            {groups.map((g) => {
              const list = categories.rows.filter((c) => c.grp === g && !c.archived)
              const total = list.reduce((sum, c) => sum + (defaultBudget.get(c.id) ?? 0), 0)
              return (
                <div key={g} className="mb-3 last:mb-0">
                  <div className="mb-1 flex justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
                    <span>{CATEGORY_GROUP_LABEL[g]}</span>
                    {g !== 'income' && <span className="tabular">計 {formatYen(total)}</span>}
                  </div>
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {list.map((c) => (
                      <li key={c.id} className="flex items-center justify-between py-1.5 text-sm">
                        <span>
                          <span aria-hidden className="mr-2">{c.icon}</span>
                          {c.name}
                        </span>
                        <span className="tabular text-slate-600 dark:text-slate-300">
                          {defaultBudget.has(c.id) ? formatYen(defaultBudget.get(c.id)!) : '—'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </Card>
        </div>

        <div>
          <Card title="口座">
            <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
              {accounts.rows.map((a) => (
                <li key={a.id} className="flex justify-between py-1.5">
                  <span>{a.name}</span>
                  <span className="text-slate-500 dark:text-slate-400">{ACCOUNT_KIND_LABEL[a.kind]}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="支払い方法">
            <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
              {(saved?.payment_methods ?? []).map((p) => (
                <li key={p.name} className="flex justify-between py-1.5">
                  <span>{p.name}</span>
                  <span className="text-slate-500 dark:text-slate-400">{accounts.rows.find((a) => a.id === p.account_id)?.name ?? '—'} から</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="テーマ">
            <div role="radiogroup" aria-label="テーマ" className="grid grid-cols-3 gap-2">
              {THEMES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={theme === t.value}
                  onClick={() => changeTheme(t.value)}
                  className={`rounded-lg border px-2 py-2 text-sm ${
                    theme === t.value
                      ? 'border-teal-600 bg-teal-50 font-bold text-teal-800 dark:border-teal-400 dark:bg-teal-950 dark:text-teal-300'
                      : 'border-slate-300 dark:border-slate-700'
                  }`}
                >
                  {theme === t.value && '✓ '}
                  {t.label}
                </button>
              ))}
            </div>
          </Card>

          <Card title="アカウント">
            <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">{session?.user.email} でログイン中</p>
            <button type="button" onClick={signOut} className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">
              ログアウト
            </button>
          </Card>
        </div>
      </div>
    </>
  )
}
