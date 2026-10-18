import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { Card, PageTitle } from '../components/ui'
import { formatYen } from '../lib/money'
import { applyTheme, loadTheme } from '../lib/theme'
import { useData } from '../lib/data'
import { ACCOUNT_KIND_LABEL, CATEGORY_GROUP_LABEL, type CategoryGroup, type Template, type Theme } from '../lib/types'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'

const THEMES: { value: Theme; label: string }[] = [
  { value: 'system', label: '端末に合わせる' },
  { value: 'light', label: 'ライト' },
  { value: 'dark', label: 'ダーク' },
]

export function SettingsPage() {
  const { session, signOut } = useAuth()
  const { categories, budgets, accounts, settings: saved, templates, reloadMaster } = useData()
  const toast = useToast()
  const [theme, setTheme] = useState<Theme>(loadTheme)

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

  async function deleteTemplate(t: Template) {
    if (!supabase || !window.confirm(`テンプレート「${t.name}」を削除しますか？`)) return
    const { error: err } = await supabase.from('templates').delete().eq('id', t.id)
    if (err) {
      toast(`削除できませんでした：${err.message}`)
      return
    }
    await reloadMaster()
    toast(`テンプレート「${t.name}」を削除しました`)
  }

  const defaultBudget = new Map(budgets.filter((b) => b.month === null).map((b) => [b.category_id, b.amount]))
  const groups: CategoryGroup[] = ['fixed', 'living', 'income']

  return (
    <>
      <PageTitle>設定</PageTitle>
      <div className="grid gap-x-4 lg:grid-cols-2">
        <div>
          <Card title="カテゴリと月の予算">
            {groups.map((g) => {
              const list = categories.filter((c) => c.grp === g && !c.archived)
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
              {accounts.map((a) => (
                <li key={a.id} className="flex justify-between gap-2 py-1.5">
                  <span>
                    {a.name}
                    {a.is_savings && <span className="ml-2 rounded bg-teal-50 px-1.5 text-xs text-teal-800 dark:bg-teal-950 dark:text-teal-300">貯蓄・投資</span>}
                  </span>
                  {a.name !== ACCOUNT_KIND_LABEL[a.kind] && <span className="text-slate-500 dark:text-slate-400">{ACCOUNT_KIND_LABEL[a.kind]}</span>}
                </li>
              ))}
            </ul>
          </Card>

          <Card title="支払い方法">
            <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
              {(saved?.payment_methods ?? []).map((p) => (
                <li key={p.name} className="flex justify-between py-1.5">
                  <span>{p.name}</span>
                  <span className="text-slate-500 dark:text-slate-400">{accounts.find((a) => a.id === p.account_id)?.name ?? '—'} から</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="テンプレート（よく使う記録）">
            {templates.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">入力シートの「⚡ テンプレートに保存」で追加できます。</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
                {templates.map((t) => {
                  const c = categories.find((x) => x.id === t.category_id)
                  return (
                    <li key={t.id} className="flex items-center justify-between gap-2 py-1.5">
                      <span className="min-w-0 truncate">
                        <span aria-hidden className="mr-2">{c?.icon}</span>
                        {t.name}
                        <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                          {[c?.name, t.payment_method].filter(Boolean).join('・')}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="tabular">{formatYen(t.amount)}</span>
                        <button type="button" onClick={() => deleteTemplate(t)} aria-label={`${t.name}を削除`} className="rounded px-2 py-1 text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950">
                          削除
                        </button>
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
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
