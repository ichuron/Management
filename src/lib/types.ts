export type AccountKind = 'bank' | 'cash' | 'nisa_tsumitate' | 'nisa_growth' | 'taxable'
export type CategoryGroup = 'fixed' | 'living' | 'income'
export type Theme = 'system' | 'light' | 'dark'

export interface Account {
  id: string
  name: string
  kind: AccountKind
  opening_balance: number
  opening_date: string | null
  sort: number
  archived: boolean
  /** 貯蓄・投資の口座（ここへの振替を「貯蓄・投資に回した額」に数える） */
  is_savings: boolean
}

export interface Category {
  id: string
  name: string
  icon: string
  color: string
  grp: CategoryGroup
  sort: number
  archived: boolean
}

export interface Budget {
  id: string
  category_id: string
  month: string | null
  amount: number
}

export type TxType = 'expense' | 'income' | 'transfer' | 'adjustment'

export interface Transaction {
  id: string
  date: string
  type: TxType
  amount: number
  category_id: string | null
  from_account_id: string | null
  to_account_id: string | null
  payment_method: string | null
  memo: string
  recurring_rule_id: string | null
  planned_expense_id: string | null
  created_at?: string
  updated_at?: string
}

export interface RecurringRule {
  id: string
  type: 'expense' | 'income' | 'transfer'
  amount: number
  category_id: string | null
  from_account_id: string | null
  to_account_id: string | null
  payment_method: string | null
  day_of_month: number
  start_month: string
  end_month: string | null
  active: boolean
  memo: string
}

export interface Template {
  id: string
  name: string
  type: 'expense' | 'income' | 'transfer'
  amount: number
  category_id: string | null
  payment_method: string | null
  memo: string
  sort: number
}

export const TX_TYPE_LABEL: Record<TxType, string> = {
  expense: '支出',
  income: '収入',
  transfer: '振替',
  adjustment: '残高調整',
}

export interface PaymentMethod {
  name: string
  account_id: string | null
}

export interface Settings {
  id: string
  month_start_day: number
  assumed_returns: number[]
  yearly_contribution_increase: number
  theme: Theme
  nisa_limits: {
    tsumitate_annual: number
    growth_annual: number
    lifetime: number
    growth_lifetime: number
  }
  payment_methods: PaymentMethod[]
  last_export_at: string | null
}

export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  bank: '銀行口座',
  cash: '現金',
  nisa_tsumitate: 'NISA（つみたて投資枠）',
  nisa_growth: 'NISA（成長投資枠）',
  taxable: '課税口座',
}

export const CATEGORY_GROUP_LABEL: Record<CategoryGroup, string> = {
  fixed: '固定費',
  living: '生活費',
  income: '収入',
}
