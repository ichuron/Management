import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useData } from '../lib/data'
import { formatJpDate, shiftDays, todayTokyo, type DateStr } from '../lib/date'
import {
  defaultIncomeAccount,
  defaultTransferAccounts,
  draftToTransaction,
  templateToDraft,
  transactionToDraft,
  validateDraft,
  type EntryDraft,
  type EntryType,
} from '../lib/entry'
import { pressKey, sortByUsage, type KeypadKey } from '../lib/kakeibo'
import { formatYen } from '../lib/money'
import { loadPrefs, rememberEntry, updatePrefs } from '../lib/prefs'
import { supabase } from '../lib/supabase'
import type { Template, Transaction } from '../lib/types'
import { useToast } from './Toast'

interface EntryApi {
  /** 新しい記録を入力する（日付を省くと選択中の日、なければ今日） */
  openNew: (date?: DateStr) => void
  openEdit: (tx: Transaction) => void
  /** 家計簿タブで選んでいる日（＋記録ボタンの初期日付になる） */
  setSelectedDate: (date: DateStr | null) => void
  /** 確認して削除し、数秒間「元に戻す」を出す */
  deleteWithUndo: (tx: Transaction) => Promise<boolean>
}

const EntryContext = createContext<EntryApi | null>(null)

type SheetState = { mode: 'new'; date: DateStr } | { mode: 'edit'; tx: Transaction } | null

export function EntryProvider({ children }: { children: ReactNode }) {
  const [sheet, setSheet] = useState<SheetState>(null)
  const selectedDate = useRef<DateStr | null>(null)
  const { saveTransaction, deleteTransaction } = useData()
  const toast = useToast()

  const deleteWithUndo = useCallback(
    async (tx: Transaction) => {
      if (!window.confirm(`${formatJpDate(tx.date)}の ${formatYen(tx.amount)} の記録を削除しますか？`)) return false
      const removed = await deleteTransaction(tx.id)
      if (!removed) return false
      toast('削除しました', { label: '元に戻す', run: () => void saveTransaction(removed) })
      return true
    },
    [deleteTransaction, saveTransaction, toast],
  )

  const api = useMemo<EntryApi>(
    () => ({
      openNew: (date) => setSheet({ mode: 'new', date: date ?? selectedDate.current ?? todayTokyo() }),
      openEdit: (tx) => setSheet({ mode: 'edit', tx }),
      setSelectedDate: (d) => {
        selectedDate.current = d
      },
      deleteWithUndo,
    }),
    [deleteWithUndo],
  )

  return (
    <EntryContext.Provider value={api}>
      {children}
      {sheet && <EntrySheet key={sheet.mode === 'edit' ? sheet.tx.id : 'new'} state={sheet} onClose={() => setSheet(null)} />}
    </EntryContext.Provider>
  )
}

export function useEntry(): EntryApi {
  const ctx = useContext(EntryContext)
  if (!ctx) throw new Error('useEntry は EntryProvider の中で使ってください')
  return ctx
}

const TYPES: { value: EntryType; label: string }[] = [
  { value: 'expense', label: '支出' },
  { value: 'income', label: '収入' },
  { value: 'transfer', label: '振替' },
]

const KEYS: { key: KeypadKey; label: string }[] = [
  { key: '7', label: '7' },
  { key: '8', label: '8' },
  { key: '9', label: '9' },
  { key: '4', label: '4' },
  { key: '5', label: '5' },
  { key: '6', label: '6' },
  { key: '1', label: '1' },
  { key: '2', label: '2' },
  { key: '3', label: '3' },
  { key: '00', label: '00' },
  { key: '0', label: '0' },
  { key: 'back', label: '⌫' },
]

function EntrySheet({ state, onClose }: { state: NonNullable<SheetState>; onClose: () => void }) {
  const { categories, accounts, settings, templates, saveTransaction, reloadMaster } = useData()
  const { deleteWithUndo } = useEntry()
  const toast = useToast()
  const methods = useMemo(() => settings?.payment_methods ?? [], [settings])
  const editing = state.mode === 'edit' ? state.tx : null
  // 残高調整は資産タブで作り直すもので、ここでは削除だけできる
  const isAdjustment = editing?.type === 'adjustment'

  const initialDraft = useMemo<EntryDraft>(() => {
    if (editing) return transactionToDraft(editing)
    const prefs = loadPrefs()
    const transfer = defaultTransferAccounts(accounts)
    const expenseCats = sortByUsage(categories.filter((c) => c.grp !== 'income'), prefs.categoryUsage)
    const lastExpense = prefs.lastCategory.expense
    return {
      type: 'expense',
      amount: 0,
      date: state.mode === 'new' ? state.date : todayTokyo(),
      categoryId: categories.some((c) => c.id === lastExpense && !c.archived) ? lastExpense! : (expenseCats[0]?.id ?? null),
      paymentMethod: methods.some((m) => m.name === prefs.lastPayment) ? prefs.lastPayment : (methods[0]?.name ?? null),
      fromAccountId: transfer.from,
      toAccountId: transfer.to,
      memo: '',
    }
    // 開いたときの内容だけを使う
  }, [])

  const [draft, setDraft] = useState<EntryDraft>(initialDraft)
  const [continuous, setContinuous] = useState(() => loadPrefs().continuous)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedCount, setSavedCount] = useState(0)
  const amountRef = useRef<HTMLDivElement>(null)

  const set = (patch: Partial<EntryDraft>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setError(null)
  }

  function changeType(type: EntryType) {
    const prefs = loadPrefs()
    if (type === draft.type) return
    const patch: Partial<EntryDraft> = { type }
    if (type !== 'transfer') {
      const cats = sortByUsage(categories.filter((c) => (type === 'income' ? c.grp === 'income' : c.grp !== 'income')), prefs.categoryUsage)
      const last = prefs.lastCategory[type]
      patch.categoryId = cats.some((c) => c.id === last) ? last! : (cats[0]?.id ?? null)
    }
    if (type === 'income') patch.toAccountId = defaultIncomeAccount(accounts)
    if (type === 'transfer') {
      const t = defaultTransferAccounts(accounts)
      patch.fromAccountId = t.from
      patch.toAccountId = t.to
    }
    set(patch)
  }

  const visibleCategories = useMemo(() => {
    const usage = loadPrefs().categoryUsage
    const list = categories.filter((c) => (draft.type === 'income' ? c.grp === 'income' : c.grp !== 'income'))
    // 編集中の記録のカテゴリが非表示になっていても選べるように残す
    return sortByUsage(list, usage).concat(list.filter((c) => c.archived && c.id === draft.categoryId))
  }, [categories, draft.type, draft.categoryId])

  const activeAccounts = accounts.filter((a) => !a.archived || a.id === draft.fromAccountId || a.id === draft.toAccountId)
  const quickTemplates = templates.filter((t) => t.type !== 'transfer')

  async function submit(d: EntryDraft = draft, label?: string) {
    const problem = validateDraft(d)
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    const id = editing?.id ?? crypto.randomUUID()
    const tx = draftToTransaction(d, id, methods, editing ?? undefined)
    if (!editing) tx.created_at = new Date().toISOString()
    const ok = await saveTransaction(tx)
    setSaving(false)
    if (!ok) {
      setError('保存できませんでした。通信状態を確認してください')
      return
    }
    rememberEntry(d.type, d.type === 'transfer' ? null : d.categoryId, d.paymentMethod)
    const what = label ? `「${label}」を記録しました` : editing ? '更新しました' : '記録しました'
    if (continuous && !editing) {
      setSavedCount((n) => n + 1)
      toast(what)
      setDraft((cur) => ({ ...cur, amount: 0, memo: '' }))
      amountRef.current?.focus()
    } else {
      toast(what, editing ? undefined : { label: '取り消す', run: () => void deleteWithoutConfirm(id) })
      onClose()
    }
  }

  const { deleteTransaction } = useData()
  async function deleteWithoutConfirm(id: string) {
    if (await deleteTransaction(id)) toast('取り消しました')
  }

  function applyTemplate(t: Template) {
    const d = templateToDraft(t, draft.date, accounts, draft.paymentMethod)
    void submit(d, t.name)
  }

  async function saveAsTemplate() {
    if (draft.type === 'transfer') return
    const problem = validateDraft(draft)
    if (problem) {
      setError(problem)
      return
    }
    const cat = categories.find((c) => c.id === draft.categoryId)
    const name = window.prompt('テンプレートの名前', draft.memo.trim() || cat?.name || '')
    if (!name?.trim() || !supabase) return
    const { error: err } = await supabase.from('templates').insert({
      name: name.trim(),
      type: draft.type,
      amount: draft.amount,
      category_id: draft.categoryId,
      payment_method: draft.type === 'expense' ? draft.paymentMethod : null,
      memo: draft.memo.trim(),
      sort: templates.length + 1,
    })
    if (err) {
      setError(`テンプレートを保存できませんでした：${err.message}`)
      return
    }
    await reloadMaster()
    toast(`テンプレート「${name.trim()}」を追加しました`)
  }

  // PC ではキーボードの数字・Backspace・Enter でも入力できる（メモ欄などの入力中は除く）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('input, textarea, select')) return
      if (e.key === 'Escape') onClose()
      else if (/^\d$/.test(e.key)) set({ amount: pressKey(draft.amount, e.key as KeypadKey) })
      else if (e.key === 'Backspace') set({ amount: pressKey(draft.amount, 'back') })
      else if (e.key === 'Enter' && !saving && !isAdjustment) void submit()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // 開いている間は後ろの画面をスクロールさせない
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  const today = todayTokyo()
  const chip = (selected: boolean) =>
    `shrink-0 rounded-full border px-3 py-1.5 text-sm ${
      selected
        ? 'border-teal-600 bg-teal-600 font-bold text-white dark:border-teal-400 dark:bg-teal-400 dark:text-slate-950'
        : 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
    }`
  const select = 'w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-800'

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center lg:items-center" role="dialog" aria-modal="true" aria-label={editing ? '記録の編集' : '記録の入力'}>
      <div aria-hidden className="absolute inset-0 bg-slate-950/50" onClick={onClose} />
      <div className="relative flex max-h-[94dvh] w-full max-w-lg flex-col rounded-t-2xl bg-slate-50 shadow-xl lg:max-h-[94vh] lg:rounded-2xl dark:bg-slate-900">
        {/* 上部：種類と閉じる */}
        <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-800">
          <div role="radiogroup" aria-label="種類" className="grid flex-1 grid-cols-3 gap-1 rounded-lg bg-slate-200 p-1 dark:bg-slate-800">
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={draft.type === t.value}
                disabled={isAdjustment}
                onClick={() => changeType(t.value)}
                className={`rounded-md py-1.5 text-sm font-bold ${
                  draft.type === t.value ? 'bg-white text-teal-800 shadow dark:bg-slate-950 dark:text-teal-300' : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800">
            閉じる
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pt-3">
          {/* テンプレート（ワンタップで記録） */}
          {!editing && quickTemplates.length > 0 && (
            <div className="-mx-3 mb-3 flex gap-2 overflow-x-auto px-3 pb-1" aria-label="テンプレート">
              {quickTemplates.map((t) => (
                <button key={t.id} type="button" disabled={saving} onClick={() => applyTemplate(t)} className="shrink-0 rounded-lg border border-dashed border-teal-600 px-3 py-1.5 text-sm text-teal-800 hover:bg-teal-50 dark:border-teal-400 dark:text-teal-300 dark:hover:bg-teal-950">
                  ⚡ {t.name} <span className="tabular">{formatYen(t.amount)}</span>
                </button>
              ))}
            </div>
          )}

          {isAdjustment && (
            <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">残高調整の記録です。ここでは削除だけできます。</p>
          )}
          {editing?.recurring_rule_id && (
            <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">🔁 定期ルールから自動で作った記録です。金額が違えば直してください。</p>
          )}

          {/* カテゴリ / 口座 */}
          {draft.type !== 'transfer' ? (
            <div role="radiogroup" aria-label="カテゴリ" className="mb-3 grid grid-cols-4 gap-1.5 sm:grid-cols-5">
              {visibleCategories.map((c) => {
                const selected = draft.categoryId === c.id
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => set({ categoryId: c.id })}
                    className={`flex flex-col items-center gap-0.5 rounded-lg border px-1 py-1.5 text-[11px] leading-tight ${
                      selected
                        ? 'border-teal-600 bg-teal-50 font-bold text-teal-900 ring-1 ring-teal-600 dark:border-teal-400 dark:bg-teal-950 dark:text-teal-200 dark:ring-teal-400'
                        : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'
                    }`}
                  >
                    <span aria-hidden className="text-xl">{c.icon}</span>
                    <span className="w-full truncate text-center">{c.name}</span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="mb-3 grid grid-cols-[1fr_auto_1fr] items-end gap-2">
              <label className="text-xs text-slate-500 dark:text-slate-400">
                振替元
                <select className={select} value={draft.fromAccountId ?? ''} onChange={(e) => set({ fromAccountId: e.target.value || null })}>
                  <option value="">選ぶ</option>
                  {activeAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <span aria-hidden className="pb-2 text-slate-400">→</span>
              <label className="text-xs text-slate-500 dark:text-slate-400">
                振替先
                <select className={select} value={draft.toAccountId ?? ''} onChange={(e) => set({ toAccountId: e.target.value || null })}>
                  <option value="">選ぶ</option>
                  {activeAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {/* 支払い方法（支出） / 入金先（収入） */}
          {draft.type === 'expense' && (
            <div role="radiogroup" aria-label="支払い方法" className="-mx-3 mb-3 flex gap-2 overflow-x-auto px-3 pb-1">
              {methods.map((m) => (
                <button key={m.name} type="button" role="radio" aria-checked={draft.paymentMethod === m.name} onClick={() => set({ paymentMethod: m.name })} className={chip(draft.paymentMethod === m.name)}>
                  {m.name}
                </button>
              ))}
              {draft.paymentMethod && !methods.some((m) => m.name === draft.paymentMethod) && <span className={chip(true)}>{draft.paymentMethod}</span>}
            </div>
          )}
          {draft.type === 'income' && (
            <label className="mb-3 block text-xs text-slate-500 dark:text-slate-400">
              入金先
              <select className={select} value={draft.toAccountId ?? ''} onChange={(e) => set({ toAccountId: e.target.value || null })}>
                <option value="">指定しない</option>
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* 日付とメモ */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => set({ date: today })} className={chip(draft.date === today)}>
              今日
            </button>
            <button type="button" onClick={() => set({ date: shiftDays(today, -1) })} className={chip(draft.date === shiftDays(today, -1))}>
              昨日
            </button>
            <input
              type="date"
              aria-label="日付"
              value={draft.date}
              onChange={(e) => e.target.value && set({ date: e.target.value })}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
            <input
              type="text"
              aria-label="メモ"
              placeholder="メモ（任意）例：コンビニ 昼ごはん"
              value={draft.memo}
              onChange={(e) => set({ memo: e.target.value })}
              enterKeyHint="done"
              className="min-w-48 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
        </div>

        {/* 下部：金額とキーパッド（片手で届く位置） */}
        <div className="border-t border-slate-200 px-3 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] dark:border-slate-800">
          <div ref={amountRef} tabIndex={-1} aria-live="polite" className="mb-2 flex items-baseline justify-between outline-none">
            <span className="text-xs text-slate-500 dark:text-slate-400">{formatJpDate(draft.date)}</span>
            <span className={`tabular text-3xl font-bold ${draft.amount === 0 ? 'text-slate-400' : ''}`}>{formatYen(draft.amount)}</span>
          </div>
          {error && (
            <p role="alert" className="mb-2 text-sm text-red-700 dark:text-red-400">
              ⚠ {error}
            </p>
          )}
          <div className="grid grid-cols-[1fr_1fr_1fr_1.1fr] gap-1.5">
            {KEYS.map((k, i) => (
              <button
                key={k.key}
                type="button"
                aria-label={k.key === 'back' ? '一文字消す' : k.label}
                onClick={() => set({ amount: pressKey(draft.amount, k.key) })}
                onContextMenu={(e) => {
                  if (k.key === 'back') {
                    e.preventDefault()
                    set({ amount: 0 })
                  }
                }}
                style={{ gridColumn: (i % 3) + 1, gridRow: Math.floor(i / 3) + 1 }}
                className="rounded-lg bg-white py-3 text-xl font-medium shadow-sm active:bg-slate-200 dark:bg-slate-800 dark:active:bg-slate-700"
              >
                {k.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => void submit()}
              disabled={saving || isAdjustment}
              style={{ gridColumn: 4, gridRow: '1 / span 4' }}
              className="rounded-lg bg-teal-600 text-lg font-bold text-white hover:bg-teal-700 disabled:opacity-60 dark:bg-teal-500 dark:text-slate-950"
            >
              {saving ? '保存中' : editing ? '更新' : '保存'}
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-sm">
            {editing ? (
              <button
                type="button"
                onClick={async () => {
                  if (await deleteWithUndo(editing)) onClose()
                }}
                className="rounded-lg px-2 py-1.5 text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
              >
                🗑 削除
              </button>
            ) : (
              <label className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={continuous}
                  onChange={(e) => {
                    setContinuous(e.target.checked)
                    updatePrefs((p) => ({ ...p, continuous: e.target.checked }))
                  }}
                  className="size-4 accent-teal-600"
                />
                連続入力{savedCount > 0 && `（${savedCount}件保存）`}
              </label>
            )}
            {draft.type !== 'transfer' && !isAdjustment && (
              <button type="button" onClick={saveAsTemplate} className="rounded-lg px-2 py-1.5 text-teal-800 hover:bg-teal-50 dark:text-teal-300 dark:hover:bg-teal-950">
                ⚡ テンプレートに保存
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
