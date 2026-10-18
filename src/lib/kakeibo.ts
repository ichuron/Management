// 家計簿タブの集計（UI から分けた純粋関数。金額はすべて整数の円）
import { daysBetweenInclusive, shiftDays, type DateStr, type MonthPeriod } from './date'
import type { Account, Budget, Category, RecurringRule, Transaction } from './types'

/** 期間内の日付を、日曜始まりの週ごとに並べる。期間外は null で埋める */
export function calendarWeeks(period: MonthPeriod): (DateStr | null)[][] {
  const [y, m, d] = period.start.split('-').map(Number)
  const firstWeekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  const days = daysBetweenInclusive(period.start, period.end)
  const cells: (DateStr | null)[] = Array(firstWeekday).fill(null)
  for (let i = 0; i < days; i++) cells.push(shiftDays(period.start, i))
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (DateStr | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

export function inPeriod(date: DateStr, period: MonthPeriod): boolean {
  return date >= period.start && date <= period.end
}

/**
 * その月に使う予算。月ごとの上書きがあればそれを、無ければ既定値（month が null）を使う。
 * 月の指定は期間の名前の月（year-month-01）。
 */
export function effectiveBudgets(budgets: Budget[], year: number, month: number): Map<string, number> {
  const key = `${year}-${String(month).padStart(2, '0')}-01`
  const result = new Map<string, number>()
  for (const b of budgets) if (b.month === null) result.set(b.category_id, b.amount)
  for (const b of budgets) if (b.month === key) result.set(b.category_id, b.amount)
  return result
}

export interface DayTotal {
  /** 支出の合計（固定費も含む） */
  expense: number
  /** 生活費カテゴリの支出（色分けの基準に使う） */
  living: number
  income: number
}

/** 日ごとの合計。振替と調整は支出にも収入にも数えない */
export function dailyTotals(txs: Transaction[], categories: Category[]): Map<DateStr, DayTotal> {
  const grp = new Map(categories.map((c) => [c.id, c.grp]))
  const map = new Map<DateStr, DayTotal>()
  for (const t of txs) {
    if (t.type !== 'expense' && t.type !== 'income') continue
    const cur = map.get(t.date) ?? { expense: 0, living: 0, income: 0 }
    if (t.type === 'expense') {
      cur.expense += t.amount
      if (t.category_id && grp.get(t.category_id) === 'living') cur.living += t.amount
    } else {
      cur.income += t.amount
    }
    map.set(t.date, cur)
  }
  return map
}

/** 貯蓄・投資の口座か（預金積立先と運用口座） */
export function isSavingsAccount(a: Account): boolean {
  return a.is_savings
}

/**
 * 貯蓄・投資に回した額：貯蓄口座へ入れた振替 − 貯蓄口座から貯蓄以外へ戻した振替。
 * 貯蓄口座どうしの移動は数えない。
 */
export function savingsAmount(txs: Transaction[], accounts: Account[]): number {
  const savings = new Set(accounts.filter(isSavingsAccount).map((a) => a.id))
  let sum = 0
  for (const t of txs) {
    if (t.type !== 'transfer') continue
    const from = t.from_account_id !== null && savings.has(t.from_account_id)
    const to = t.to_account_id !== null && savings.has(t.to_account_id)
    if (to && !from) sum += t.amount
    else if (from && !to) sum -= t.amount
  }
  return sum
}

/** その月に予定している積立額（有効な定期振替のうち、貯蓄口座へ入れるもの） */
export function plannedSavings(rules: RecurringRule[], accounts: Account[], period: MonthPeriod): number {
  const savings = new Set(accounts.filter(isSavingsAccount).map((a) => a.id))
  const monthKey = `${period.year}-${String(period.month).padStart(2, '0')}-01`
  let sum = 0
  for (const r of rules) {
    if (!r.active || r.type !== 'transfer') continue
    if (r.start_month > monthKey) continue
    if (r.end_month !== null && r.end_month < monthKey) continue
    const to = r.to_account_id !== null && savings.has(r.to_account_id)
    const from = r.from_account_id !== null && savings.has(r.from_account_id)
    if (to && !from) sum += r.amount
  }
  return sum
}

export interface MonthSummary {
  expense: number
  /** 固定費＋生活費の予算合計 */
  budget: number
  livingSpent: number
  livingBudget: number
  /** 生活費の残り予算（超過ならマイナス） */
  livingRemaining: number
  /** 今日を含めた残り日数。過去の月は 0、未来の月は期間の全日数 */
  daysLeft: number
  /** 残りの生活費を残り日数で割った額（切り捨て。残りが無ければ 0） */
  perDayAvailable: number
  /** 生活費の1日あたり予算（切り捨て）。カレンダーの色分けの基準 */
  livingPerDay: number
  savings: number
  plannedSavings: number
}

export function monthSummary(args: {
  txs: Transaction[]
  categories: Category[]
  accounts: Account[]
  budgets: Budget[]
  rules: RecurringRule[]
  period: MonthPeriod
  today: DateStr
}): MonthSummary {
  const { categories, accounts, budgets, rules, period, today } = args
  const txs = args.txs.filter((t) => inPeriod(t.date, period))
  const grp = new Map(categories.map((c) => [c.id, c.grp]))
  const eff = effectiveBudgets(budgets, period.year, period.month)

  let budget = 0
  let livingBudget = 0
  for (const c of categories) {
    if (c.archived || c.grp === 'income') continue
    const amount = eff.get(c.id) ?? 0
    budget += amount
    if (c.grp === 'living') livingBudget += amount
  }

  let expense = 0
  let livingSpent = 0
  for (const t of txs) {
    if (t.type !== 'expense') continue
    expense += t.amount
    if (t.category_id && grp.get(t.category_id) === 'living') livingSpent += t.amount
  }

  const totalDays = daysBetweenInclusive(period.start, period.end)
  let daysLeft: number
  if (today > period.end) daysLeft = 0
  else if (today < period.start) daysLeft = totalDays
  else daysLeft = daysBetweenInclusive(today, period.end)

  const livingRemaining = livingBudget - livingSpent
  return {
    expense,
    budget,
    livingSpent,
    livingBudget,
    livingRemaining,
    daysLeft,
    perDayAvailable: daysLeft > 0 && livingRemaining > 0 ? Math.floor(livingRemaining / daysLeft) : 0,
    livingPerDay: Math.floor(livingBudget / totalDays),
    savings: savingsAmount(txs, accounts),
    plannedSavings: plannedSavings(rules, accounts, period),
  }
}

/** 日付マスの色の濃さ（0〜4）。生活費の支出を1日あたり予算と比べる */
export function spendLevel(living: number, perDay: number): 0 | 1 | 2 | 3 | 4 {
  if (living <= 0) return 0
  if (perDay <= 0) return 4
  if (living <= perDay / 2) return 1
  if (living <= perDay) return 2
  if (living <= perDay * 2) return 3
  return 4
}

// ---------------------------------------------------------------
// 金額キーパッド
// ---------------------------------------------------------------
export const MAX_AMOUNT_DIGITS = 9 // 9億9999万…円まで

export type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '00' | 'back' | 'clear'

/** キーパッドの入力を金額（整数）に反映する */
export function pressKey(amount: number, key: KeypadKey): number {
  if (key === 'clear') return 0
  if (key === 'back') return Math.floor(amount / 10)
  const next = Number(String(amount) + key)
  return String(next).length > MAX_AMOUNT_DIGITS ? amount : next
}

// ---------------------------------------------------------------
// カテゴリの並び順
// ---------------------------------------------------------------
const GROUP_ORDER: Record<Category['grp'], number> = { living: 0, income: 1, fixed: 2 }

/** よく使う順。同数なら生活費を固定費より前に、その中は設定の並び順。アーカイブ済みは除く */
export function sortByUsage(categories: Category[], usage: Record<string, number>): Category[] {
  return categories
    .filter((c) => !c.archived)
    .slice()
    .sort((a, b) => (usage[b.id] ?? 0) - (usage[a.id] ?? 0) || GROUP_ORDER[a.grp] - GROUP_ORDER[b.grp] || a.sort - b.sort)
}
