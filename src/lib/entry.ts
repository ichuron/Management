// 入力シートで記録を組み立てる（純粋関数）
import type { DateStr } from './date'
import type { Account, PaymentMethod, Template, Transaction } from './types'

export type EntryType = 'expense' | 'income' | 'transfer'

/** 支払い方法から、残高が減る口座を引く */
export function paymentAccount(methods: PaymentMethod[], name: string | null): string | null {
  return methods.find((m) => m.name === name)?.account_id ?? null
}

const active = (accounts: Account[]) => accounts.filter((a) => !a.archived).sort((a, b) => a.sort - b.sort)

/** 収入の入金先：貯蓄扱いでない最初の銀行口座（給与口座） */
export function defaultIncomeAccount(accounts: Account[]): string | null {
  const list = active(accounts)
  return (list.find((a) => a.kind === 'bank' && !a.is_savings) ?? list[0])?.id ?? null
}

/** 振替の初期値：給与口座 → 最初の貯蓄口座 */
export function defaultTransferAccounts(accounts: Account[]): { from: string | null; to: string | null } {
  const from = defaultIncomeAccount(accounts)
  const to = active(accounts).find((a) => a.is_savings && a.id !== from)?.id ?? null
  return { from, to }
}

export interface EntryDraft {
  type: EntryType
  amount: number
  date: DateStr
  categoryId: string | null
  paymentMethod: string | null
  fromAccountId: string | null
  toAccountId: string | null
  memo: string
}

/** 入力内容の誤り。問題なければ null */
export function validateDraft(d: EntryDraft): string | null {
  if (!Number.isSafeInteger(d.amount) || d.amount <= 0) return '金額を入力してください'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return '日付を選んでください'
  if (d.type !== 'transfer' && !d.categoryId) return 'カテゴリを選んでください'
  if (d.type === 'transfer') {
    if (!d.fromAccountId || !d.toAccountId) return '振替元と振替先の口座を選んでください'
    if (d.fromAccountId === d.toAccountId) return '振替元と振替先が同じです'
  }
  return null
}

/** 入力内容から保存する記録を作る。base があれば編集（自動記録などの紐づけは引き継ぐ） */
export function draftToTransaction(d: EntryDraft, id: string, methods: PaymentMethod[], base?: Transaction): Transaction {
  const common = {
    id,
    date: d.date,
    type: d.type,
    amount: d.amount,
    memo: d.memo.trim(),
    recurring_rule_id: base?.recurring_rule_id ?? null,
    planned_expense_id: base?.planned_expense_id ?? null,
    created_at: base?.created_at,
  }
  switch (d.type) {
    case 'expense':
      return {
        ...common,
        category_id: d.categoryId,
        payment_method: d.paymentMethod,
        // 支払い方法に口座が無い（給与天引きなど）ときは、元の口座を保つ
        from_account_id: paymentAccount(methods, d.paymentMethod) ?? base?.from_account_id ?? null,
        to_account_id: null,
      }
    case 'income':
      return { ...common, category_id: d.categoryId, payment_method: null, from_account_id: null, to_account_id: d.toAccountId }
    case 'transfer':
      return { ...common, category_id: null, payment_method: null, from_account_id: d.fromAccountId, to_account_id: d.toAccountId }
  }
}

/** 記録を入力シートの内容に戻す（編集用） */
export function transactionToDraft(t: Transaction): EntryDraft {
  return {
    type: t.type === 'adjustment' ? 'expense' : t.type,
    amount: t.amount,
    date: t.date,
    categoryId: t.category_id,
    paymentMethod: t.payment_method,
    fromAccountId: t.from_account_id,
    toAccountId: t.to_account_id,
    memo: t.memo,
  }
}

/** テンプレートからワンタップで作る記録の内容 */
export function templateToDraft(t: Template, date: DateStr, accounts: Account[], fallbackPayment: string | null): EntryDraft {
  const transfer = defaultTransferAccounts(accounts)
  return {
    type: t.type,
    amount: t.amount,
    date,
    categoryId: t.category_id,
    paymentMethod: t.type === 'expense' ? (t.payment_method ?? fallbackPayment) : null,
    fromAccountId: t.type === 'transfer' ? transfer.from : null,
    toAccountId: t.type === 'income' ? defaultIncomeAccount(accounts) : t.type === 'transfer' ? transfer.to : null,
    memo: t.memo,
  }
}
