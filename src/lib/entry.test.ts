import { describe, expect, it } from 'vitest'
import { defaultIncomeAccount, defaultTransferAccounts, draftToTransaction, templateToDraft, validateDraft, type EntryDraft } from './entry'
import type { Account, PaymentMethod, Template, Transaction } from './types'

const acc = (id: string, kind: Account['kind'], sort: number, is_savings = false, archived = false): Account => ({
  id,
  name: id,
  kind,
  opening_balance: 0,
  opening_date: null,
  sort,
  archived,
  is_savings,
})
const accounts = [acc('nisa', 'nisa_tsumitate', 4, true), acc('cash', 'cash', 3), acc('save', 'bank', 2, true), acc('main', 'bank', 1)]
const methods: PaymentMethod[] = [
  { name: '現金', account_id: 'cash' },
  { name: 'PayPay', account_id: 'main' },
]
const draft = (p: Partial<EntryDraft>): EntryDraft => ({
  type: 'expense',
  amount: 800,
  date: '2027-05-10',
  categoryId: 'food',
  paymentMethod: 'PayPay',
  fromAccountId: null,
  toAccountId: null,
  memo: '',
  ...p,
})

describe('既定の口座', () => {
  it('収入は貯蓄扱いでない最初の銀行口座', () => {
    expect(defaultIncomeAccount(accounts)).toBe('main')
  })
  it('振替は給与口座 → 最初の貯蓄口座', () => {
    expect(defaultTransferAccounts(accounts)).toEqual({ from: 'main', to: 'save' })
  })
  it('アーカイブ済みは使わない', () => {
    expect(defaultIncomeAccount([acc('old', 'bank', 0, false, true), ...accounts])).toBe('main')
  })
})

describe('validateDraft', () => {
  it('金額0・カテゴリなし・同じ口座への振替は誤り', () => {
    expect(validateDraft(draft({}))).toBeNull()
    expect(validateDraft(draft({ amount: 0 }))).toMatch('金額')
    expect(validateDraft(draft({ categoryId: null }))).toMatch('カテゴリ')
    expect(validateDraft(draft({ type: 'transfer', categoryId: null, fromAccountId: 'main', toAccountId: 'main' }))).toMatch('同じ')
    expect(validateDraft(draft({ type: 'transfer', categoryId: null, fromAccountId: 'main', toAccountId: 'nisa' }))).toBeNull()
  })
})

describe('draftToTransaction', () => {
  it('支出は支払い方法の口座から出る', () => {
    const t = draftToTransaction(draft({ memo: ' 昼ごはん ' }), 'x', methods)
    expect(t).toMatchObject({ type: 'expense', category_id: 'food', from_account_id: 'main', to_account_id: null, memo: '昼ごはん' })
  })
  it('振替はカテゴリを持たない', () => {
    const t = draftToTransaction(draft({ type: 'transfer', fromAccountId: 'main', toAccountId: 'nisa' }), 'x', methods)
    expect(t).toMatchObject({ category_id: null, payment_method: null, from_account_id: 'main', to_account_id: 'nisa' })
  })
  it('編集しても自動記録の印は残る。口座の無い支払い方法なら元の口座を保つ', () => {
    const base = { recurring_rule_id: 'r1', from_account_id: 'main', planned_expense_id: null } as Transaction
    const t = draftToTransaction(draft({ amount: 10500, paymentMethod: '給与天引き' }), 'x', methods, base)
    expect(t).toMatchObject({ amount: 10500, recurring_rule_id: 'r1', from_account_id: 'main' })
  })
})

describe('templateToDraft', () => {
  const tpl: Template = { id: 't', name: '昼ごはん', type: 'expense', amount: 800, category_id: 'food', payment_method: null, memo: '昼ごはん', sort: 1 }
  it('支払い方法が無ければ最後に使った方法', () => {
    expect(templateToDraft(tpl, '2027-05-10', accounts, '現金')).toMatchObject({ amount: 800, paymentMethod: '現金', date: '2027-05-10' })
  })
  it('収入テンプレートは給与口座に入る', () => {
    expect(templateToDraft({ ...tpl, type: 'income' }, '2027-05-10', accounts, null)).toMatchObject({ toAccountId: 'main', paymentMethod: null })
  })
})
