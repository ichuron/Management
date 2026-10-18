import { describe, expect, it } from 'vitest'
import { monthPeriod } from './date'
import {
  calendarWeeks,
  dailyTotals,
  effectiveBudgets,
  monthSummary,
  plannedSavings,
  pressKey,
  savingsAmount,
  sortByUsage,
  spendLevel,
} from './kakeibo'
import type { Account, Budget, Category, RecurringRule, Transaction } from './types'

const cat = (id: string, grp: Category['grp'], sort = 0): Category => ({ id, name: id, icon: '', color: '', grp, sort, archived: false })
const acc = (id: string, kind: Account['kind'], is_savings = false): Account => ({
  id,
  name: id,
  kind,
  opening_balance: 0,
  opening_date: null,
  sort: 0,
  archived: false,
  is_savings,
})
let seq = 0
const tx = (p: Partial<Transaction> & Pick<Transaction, 'date' | 'type' | 'amount'>): Transaction => ({
  id: `t${seq++}`,
  category_id: null,
  from_account_id: null,
  to_account_id: null,
  payment_method: null,
  memo: '',
  recurring_rule_id: null,
  planned_expense_id: null,
  ...p,
})

const categories = [cat('rent', 'fixed'), cat('food', 'living'), cat('fun', 'living'), cat('salary', 'income')]
const accounts = [acc('main', 'bank'), acc('save', 'bank', true), acc('cash', 'cash'), acc('nisa', 'nisa_tsumitate', true)]
const budgets: Budget[] = [
  { id: 'b1', category_id: 'rent', month: null, amount: 10000 },
  { id: 'b2', category_id: 'food', month: null, amount: 31000 },
  { id: 'b3', category_id: 'fun', month: null, amount: 0 },
  { id: 'b4', category_id: 'fun', month: '2027-08-01', amount: 20000 },
]

describe('calendarWeeks', () => {
  it('2027年4月は木曜始まり・30日・5週', () => {
    const weeks = calendarWeeks(monthPeriod(2027, 4))
    expect(weeks).toHaveLength(5)
    expect(weeks[0].slice(0, 4)).toEqual([null, null, null, null])
    expect(weeks[0][4]).toBe('2027-04-01')
    expect(weeks.flat().filter(Boolean)).toHaveLength(30)
    expect(weeks[4][5]).toBe('2027-04-30')
  })
  it('うるう年2月（2028年2月は火曜始まり）', () => {
    const days = calendarWeeks(monthPeriod(2028, 2)).flat()
    expect(days.filter(Boolean)).toHaveLength(29)
    expect(days.at(-1 - days.slice().reverse().findIndex(Boolean))).toBe('2028-02-29')
  })
  it('25日始まりは期間のとおりに並ぶ', () => {
    const days = calendarWeeks(monthPeriod(2027, 5, 25)).flat().filter(Boolean)
    expect(days[0]).toBe('2027-04-25')
    expect(days.at(-1)).toBe('2027-05-24')
  })
})

describe('effectiveBudgets', () => {
  it('上書きのある月だけ差し替わる', () => {
    expect(effectiveBudgets(budgets, 2027, 7).get('fun')).toBe(0)
    expect(effectiveBudgets(budgets, 2027, 8).get('fun')).toBe(20000)
    expect(effectiveBudgets(budgets, 2027, 9).get('fun')).toBe(0)
  })
})

describe('dailyTotals', () => {
  it('支出・生活費・収入を日ごとに分け、振替は数えない', () => {
    const m = dailyTotals(
      [
        tx({ date: '2027-04-25', type: 'expense', amount: 10000, category_id: 'rent' }),
        tx({ date: '2027-04-25', type: 'expense', amount: 800, category_id: 'food' }),
        tx({ date: '2027-04-25', type: 'income', amount: 208200, category_id: 'salary' }),
        tx({ date: '2027-04-25', type: 'transfer', amount: 16600, from_account_id: 'main', to_account_id: 'save' }),
        tx({ date: '2027-04-25', type: 'adjustment', amount: -300, to_account_id: 'cash' }),
      ],
      categories,
    )
    expect(m.get('2027-04-25')).toEqual({ expense: 10800, living: 800, income: 208200 })
  })
})

describe('savingsAmount', () => {
  it('貯蓄口座への振替を足し、引き出しを引く。ATM引き出しや貯蓄口座どうしは数えない', () => {
    const s = savingsAmount(
      [
        tx({ date: '2027-05-01', type: 'transfer', amount: 66400, from_account_id: 'main', to_account_id: 'nisa' }),
        tx({ date: '2027-05-25', type: 'transfer', amount: 16600, from_account_id: 'main', to_account_id: 'save' }),
        tx({ date: '2027-05-10', type: 'transfer', amount: 5000, from_account_id: 'main', to_account_id: 'cash' }),
        tx({ date: '2027-05-11', type: 'transfer', amount: 3000, from_account_id: 'save', to_account_id: 'main' }),
        tx({ date: '2027-05-12', type: 'transfer', amount: 9999, from_account_id: 'save', to_account_id: 'nisa' }),
      ],
      accounts,
    )
    expect(s).toBe(66400 + 16600 - 3000)
  })
})

describe('plannedSavings', () => {
  const rule = (p: Partial<RecurringRule>): RecurringRule => ({
    id: 'r',
    type: 'transfer',
    amount: 0,
    category_id: null,
    from_account_id: 'main',
    to_account_id: 'nisa',
    payment_method: null,
    day_of_month: 1,
    start_month: '2027-04-01',
    end_month: null,
    active: true,
    memo: '',
    ...p,
  })
  it('開始月より前・終了後・無効なルールは数えない', () => {
    const rules = [
      rule({ amount: 66400, start_month: '2027-05-01' }),
      rule({ amount: 16600, to_account_id: 'save' }),
      rule({ amount: 1000, active: false }),
      rule({ amount: 2000, end_month: '2027-04-01' }),
      rule({ amount: 3000, type: 'expense' }),
    ]
    expect(plannedSavings(rules, accounts, monthPeriod(2027, 4))).toBe(16600 + 2000)
    expect(plannedSavings(rules, accounts, monthPeriod(2027, 5))).toBe(66400 + 16600)
  })
})

describe('monthSummary', () => {
  const base = { categories, accounts, budgets, rules: [] as RecurringRule[], period: monthPeriod(2027, 5) }
  const txs = [
    tx({ date: '2027-05-01', type: 'transfer', amount: 66400, from_account_id: 'main', to_account_id: 'nisa' }),
    tx({ date: '2027-05-02', type: 'expense', amount: 3000, category_id: 'food' }),
    tx({ date: '2027-05-03', type: 'expense', amount: 1000, category_id: 'fun' }),
    tx({ date: '2027-04-30', type: 'expense', amount: 99999, category_id: 'food' }), // 期間外
  ]

  it('月の途中', () => {
    const s = monthSummary({ ...base, txs, today: '2027-05-11' })
    expect(s).toMatchObject({
      expense: 4000,
      budget: 41000,
      livingSpent: 4000,
      livingBudget: 31000,
      livingRemaining: 27000,
      daysLeft: 21, // 11日〜31日
      perDayAvailable: Math.floor(27000 / 21),
      livingPerDay: 1000,
      savings: 66400,
    })
  })
  it('月末当日は残り1日', () => {
    expect(monthSummary({ ...base, txs, today: '2027-05-31' }).daysLeft).toBe(1)
  })
  it('過去の月は残り0日・使える額0', () => {
    const s = monthSummary({ ...base, txs, today: '2027-06-01' })
    expect(s.daysLeft).toBe(0)
    expect(s.perDayAvailable).toBe(0)
  })
  it('未来の月は全日数', () => {
    expect(monthSummary({ ...base, txs: [], today: '2027-04-20' }).daysLeft).toBe(31)
  })
  it('予算超過なら残りはマイナス、使える額は0', () => {
    const s = monthSummary({ ...base, txs: [tx({ date: '2027-05-02', type: 'expense', amount: 40000, category_id: 'food' })], today: '2027-05-10' })
    expect(s.livingRemaining).toBe(-9000)
    expect(s.perDayAvailable).toBe(0)
  })
  it('振替だけの月は支出0', () => {
    const s = monthSummary({ ...base, txs: [txs[0]], today: '2027-05-10' })
    expect(s.expense).toBe(0)
    expect(s.savings).toBe(66400)
  })
})

describe('spendLevel', () => {
  it('1日あたり予算と比べる', () => {
    expect(spendLevel(0, 1000)).toBe(0)
    expect(spendLevel(500, 1000)).toBe(1)
    expect(spendLevel(1000, 1000)).toBe(2)
    expect(spendLevel(2000, 1000)).toBe(3)
    expect(spendLevel(2001, 1000)).toBe(4)
    expect(spendLevel(1, 0)).toBe(4)
  })
})

describe('pressKey', () => {
  it('数字・00・一文字消す・全消し', () => {
    let a = 0
    a = pressKey(a, '0')
    expect(a).toBe(0)
    a = pressKey(a, '8')
    a = pressKey(a, '00')
    expect(a).toBe(800)
    a = pressKey(a, 'back')
    expect(a).toBe(80)
    expect(pressKey(a, 'clear')).toBe(0)
  })
  it('9桁を超えない', () => {
    expect(pressKey(123456789, '1')).toBe(123456789)
    expect(pressKey(12345678, '00')).toBe(12345678)
  })
})

describe('sortByUsage', () => {
  it('よく使う順、同数は並び順', () => {
    const list = [cat('a', 'living', 1), cat('b', 'living', 2), cat('c', 'living', 3)]
    expect(sortByUsage(list, { c: 5, b: 1 }).map((c) => c.id)).toEqual(['c', 'b', 'a'])
    expect(sortByUsage(list, {}).map((c) => c.id)).toEqual(['a', 'b', 'c'])
  })
  it('使用回数が同じなら生活費が固定費より前', () => {
    const list = [cat('rent', 'fixed', 1), cat('food', 'living', 11)]
    expect(sortByUsage(list, {}).map((c) => c.id)).toEqual(['food', 'rent'])
  })
})
