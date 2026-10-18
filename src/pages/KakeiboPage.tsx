import { useEffect, useMemo, useRef, useState, type TouchEvent } from 'react'
import { useEntry } from '../components/EntrySheet'
import { Card } from '../components/ui'
import { useData, useTransactions } from '../lib/data'
import { formatJpDate, monthPeriod, periodOf, todayTokyo, type DateStr } from '../lib/date'
import { calendarWeeks, dailyTotals, inPeriod, monthSummary, spendLevel } from '../lib/kakeibo'
import { formatCompact, formatYen } from '../lib/money'
import type { Transaction } from '../lib/types'

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

// 色の濃さ（0〜4）。色だけに頼らず、予算を超えた日は「!」も付ける
const LEVEL_BG = [
  '',
  'bg-teal-50 dark:bg-teal-950/60',
  'bg-amber-50 dark:bg-amber-950/50',
  'bg-orange-100 dark:bg-orange-900/50',
  'bg-red-200 dark:bg-red-900/70',
]

export function KakeiboPage() {
  const { categories, accounts, budgets, rules, settings } = useData()
  const { openNew, openEdit, setSelectedDate } = useEntry()
  const startDay = settings?.month_start_day ?? 1
  const today = todayTokyo()
  const current = periodOf(today, startDay)
  const [ym, setYm] = useState({ year: current.year, month: current.month })
  const period = useMemo(() => monthPeriod(ym.year, ym.month, startDay), [ym.year, ym.month, startDay])
  const [selected, setSelected] = useState<DateStr | null>(inPeriod(today, period) ? today : null)
  const { txs, loaded } = useTransactions(period.start, period.end)

  // 選んだ日を「＋ 記録」ボタンの初期日付にする
  useEffect(() => {
    setSelectedDate(selected)
    return () => setSelectedDate(null)
  }, [selected, setSelectedDate])

  const totals = useMemo(() => dailyTotals(txs, categories), [txs, categories])
  const summary = useMemo(
    () => monthSummary({ txs, categories, accounts, budgets, rules, period, today }),
    [txs, categories, accounts, budgets, rules, period, today],
  )
  const weeks = calendarWeeks(period)
  const isCurrent = ym.year === current.year && ym.month === current.month

  function move(delta: number) {
    const d = new Date(Date.UTC(ym.year, ym.month - 1 + delta, 1))
    const next = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }
    setYm(next)
    const p = monthPeriod(next.year, next.month, startDay)
    setSelected(inPeriod(today, p) ? today : null)
  }

  // 左右スワイプで月を切り替える
  const touch = useRef<{ x: number; y: number } | null>(null)
  const onTouchStart = (e: TouchEvent) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  const onTouchEnd = (e: TouchEvent) => {
    if (!touch.current) return
    const dx = e.changedTouches[0].clientX - touch.current.x
    const dy = e.changedTouches[0].clientY - touch.current.y
    touch.current = null
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) move(dx < 0 ? 1 : -1)
  }

  const dayTxs = selected ? txs.filter((t) => t.date === selected) : []

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
      <div>
        {/* 月の切り替え */}
        <div className="mb-3 flex items-center justify-between">
          <button type="button" onClick={() => move(-1)} aria-label="前の月" className="rounded-lg px-3 py-2 text-lg hover:bg-slate-200 dark:hover:bg-slate-800">
            ‹
          </button>
          <div className="text-center">
            <h1 className="text-xl font-bold lg:text-2xl">
              {ym.year}年{ym.month}月
            </h1>
            {startDay > 1 && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {period.start.slice(5).replace('-', '/')}〜{period.end.slice(5).replace('-', '/')}
              </p>
            )}
          </div>
          <div className="flex items-center">
            {!isCurrent && (
              <button type="button" onClick={() => move((current.year - ym.year) * 12 + current.month - ym.month)} className="rounded-lg px-2 py-2 text-sm text-teal-700 hover:bg-slate-200 dark:text-teal-400 dark:hover:bg-slate-800">
                今月
              </button>
            )}
            <button type="button" onClick={() => move(1)} aria-label="次の月" className="rounded-lg px-3 py-2 text-lg hover:bg-slate-200 dark:hover:bg-slate-800">
              ›
            </button>
          </div>
        </div>

        <Summary summary={summary} />

        {/* カレンダー */}
        <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="grid grid-cols-7 border-b border-slate-200 text-center text-xs dark:border-slate-800">
            {WEEKDAYS.map((w, i) => (
              <div key={w} className={`py-1.5 ${i === 0 ? 'text-red-600 dark:text-red-400' : i === 6 ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}>
                {w}
              </div>
            ))}
          </div>
          <div role="grid" aria-label="カレンダー" className={loaded ? '' : 'opacity-50'}>
            {weeks.map((week, wi) => (
              <div role="row" key={wi} className="grid grid-cols-7">
                {week.map((d, di) => {
                  if (!d) return <div key={di} className="min-h-14 border-t border-slate-100 dark:border-slate-800/60" />
                  const t = totals.get(d)
                  const level = spendLevel(t?.living ?? 0, summary.livingPerDay)
                  const over = level >= 3
                  const isToday = d === today
                  const isSel = d === selected
                  const day = Number(d.slice(8))
                  return (
                    <button
                      role="gridcell"
                      key={d}
                      type="button"
                      aria-selected={isSel}
                      aria-label={`${formatJpDate(d)} 支出${formatYen(t?.expense ?? 0)}${over ? '（1日の予算超え）' : ''}`}
                      onClick={() => setSelected(d)}
                      className={`relative flex min-h-14 flex-col items-center border-t border-slate-100 px-0.5 pt-1 pb-1 text-left dark:border-slate-800/60 ${LEVEL_BG[level]} ${
                        isSel ? 'z-10 outline-2 -outline-offset-2 outline-teal-600 dark:outline-teal-400' : ''
                      }`}
                    >
                      <span
                        className={`flex size-6 items-center justify-center rounded-full text-xs ${
                          isToday ? 'bg-teal-600 font-bold text-white dark:bg-teal-400 dark:text-slate-950' : di === 0 ? 'text-red-600 dark:text-red-400' : di === 6 ? 'text-blue-600 dark:text-blue-400' : ''
                        }`}
                      >
                        {day}
                      </span>
                      {t && t.expense > 0 && (
                        <span className={`tabular mt-0.5 text-[10px] leading-none sm:text-xs ${over ? 'font-bold text-red-800 dark:text-red-200' : 'text-slate-600 dark:text-slate-300'}`}>
                          {over && '!'}
                          {formatCompact(t.expense)}
                        </span>
                      )}
                      {t && t.income > 0 && <span className="tabular mt-0.5 text-[10px] leading-none text-green-700 dark:text-green-400">+{formatCompact(t.income)}</span>}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
          <p className="border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
            色は生活費の1日あたり予算 {formatYen(summary.livingPerDay)} との比較。「!」は予算超え。
          </p>
        </div>
      </div>

      {/* 選んだ日の記録（スマホは下、PCは右） */}
      <div className="lg:sticky lg:top-8 lg:self-start">
        {selected ? (
          <DayPanel date={selected} txs={dayTxs} onAdd={() => openNew(selected)} onEdit={openEdit} />
        ) : (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">日付を選ぶと、その日の記録が表示されます</p>
        )}
      </div>
    </div>
  )
}

function Summary({ summary: s }: { summary: ReturnType<typeof monthSummary> }) {
  const ratio = s.budget > 0 ? Math.min(100, Math.round((s.expense / s.budget) * 100)) : 0
  const overBudget = s.expense > s.budget
  const savingsDone = s.plannedSavings > 0 && s.savings >= s.plannedSavings
  return (
    <Card>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-sm text-slate-500 dark:text-slate-400">今月の支出</span>
        <span className="tabular">
          <span className={`text-xl font-bold ${overBudget ? 'text-red-700 dark:text-red-400' : ''}`}>{formatYen(s.expense)}</span>
          <span className="text-sm text-slate-500 dark:text-slate-400"> / {formatYen(s.budget)}</span>
        </span>
      </div>
      <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" role="progressbar" aria-valuenow={ratio} aria-valuemin={0} aria-valuemax={100} aria-label="予算の使用率">
        <div className={`h-full rounded-full ${overBudget ? 'bg-red-600' : 'bg-teal-600 dark:bg-teal-400'}`} style={{ width: `${ratio}%` }} />
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-slate-500 dark:text-slate-400">生活費の残り</dt>
          <dd className={`tabular font-bold ${s.livingRemaining < 0 ? 'text-red-700 dark:text-red-400' : ''}`}>
            {s.livingRemaining < 0 ? `⚠ ${formatYen(-s.livingRemaining)} 超過` : formatYen(s.livingRemaining)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500 dark:text-slate-400">1日あたり{s.daysLeft > 0 && `（残り${s.daysLeft}日）`}</dt>
          <dd className="tabular font-bold">{s.daysLeft > 0 ? formatYen(s.perDayAvailable) : '—'}</dd>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <dt className="text-xs text-slate-500 dark:text-slate-400">今月の積立</dt>
          <dd className="tabular font-bold">
            {formatYen(s.savings)}
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400"> / 予定 {formatYen(s.plannedSavings)}</span>
            {savingsDone && <span className="ml-1 text-xs text-green-700 dark:text-green-400">✓ 達成</span>}
          </dd>
        </div>
      </dl>
    </Card>
  )
}

function DayPanel({ date, txs, onAdd, onEdit }: { date: DateStr; txs: Transaction[]; onAdd: () => void; onEdit: (t: Transaction) => void }) {
  const { categories, accounts } = useData()
  const cat = new Map(categories.map((c) => [c.id, c]))
  const acc = new Map(accounts.map((a) => [a.id, a.name]))
  const expense = txs.reduce((sum, t) => sum + (t.type === 'expense' ? t.amount : 0), 0)

  return (
    <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" aria-label={`${formatJpDate(date)}の記録`}>
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <div>
          <h2 className="font-bold">{formatJpDate(date)}</h2>
          <p className="tabular text-xs text-slate-500 dark:text-slate-400">支出 {formatYen(expense)}</p>
        </div>
        <button type="button" onClick={onAdd} className="rounded-lg border border-teal-600 px-3 py-1.5 text-sm font-bold text-teal-700 hover:bg-teal-50 dark:border-teal-400 dark:text-teal-300 dark:hover:bg-teal-950">
          ＋ この日に記録
        </button>
      </div>
      {txs.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">記録はありません</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {txs.map((t) => {
            const c = t.category_id ? cat.get(t.category_id) : undefined
            const title =
              t.type === 'transfer'
                ? `${acc.get(t.from_account_id ?? '') ?? '?'} → ${acc.get(t.to_account_id ?? '') ?? '?'}`
                : t.type === 'adjustment'
                  ? `残高調整（${acc.get(t.to_account_id ?? t.from_account_id ?? '') ?? '?'}）`
                  : (c?.name ?? 'カテゴリなし')
            const sub = [t.memo, t.type === 'expense' ? t.payment_method : null].filter(Boolean).join('・')
            return (
              <li key={t.id}>
                <button type="button" onClick={() => onEdit(t)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg dark:bg-slate-800">
                    {t.type === 'transfer' ? '🔄' : t.type === 'adjustment' ? '⚖️' : (c?.icon ?? '・')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">
                      {title}
                      {t.recurring_rule_id && (
                        <span className="ml-1 rounded bg-slate-100 px-1 text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400" title="定期ルールから自動で作った記録">
                          🔁 自動
                        </span>
                      )}
                    </span>
                    {sub && <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{sub}</span>}
                  </span>
                  <span
                    className={`tabular shrink-0 text-sm font-bold ${
                      t.type === 'income' ? 'text-green-700 dark:text-green-400' : t.type === 'expense' ? '' : 'font-normal text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {t.type === 'income' ? '+' : t.type === 'expense' ? '-' : ''}
                    {formatYen(t.amount)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
