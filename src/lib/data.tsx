import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import type { DateStr } from './date'
import type { Account, Budget, Category, RecurringRule, Settings, Template, Transaction } from './types'

interface Master {
  categories: Category[]
  accounts: Account[]
  budgets: Budget[]
  settings: Settings | null
  templates: Template[]
  rules: RecurringRule[]
}

const EMPTY_MASTER: Master = { categories: [], accounts: [], budgets: [], settings: null, templates: [], rules: [] }

interface DataState extends Master {
  masterLoading: boolean
  error: string | null
  reloadMaster: () => Promise<void>
  /** 読み込んだ記録（id → 記録）。表示は useTransactions で期間を指定して取り出す */
  txById: Record<string, Transaction>
  ensureRange: (start: DateStr, end: DateStr) => void
  isRangeLoaded: (start: DateStr, end: DateStr) => boolean
  saveTransaction: (tx: Transaction) => Promise<boolean>
  deleteTransaction: (id: string) => Promise<Transaction | null>
}

const DataContext = createContext<DataState | null>(null)

const PAGE = 1000

/** PostgREST は1回に1000件までなので、ページを分けて全件読む */
async function fetchRange(start: DateStr, end: DateStr): Promise<Transaction[]> {
  if (!supabase) return []
  const rows: Transaction[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .gte('date', start)
      .lte('date', end)
      .order('date')
      .order('created_at')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    rows.push(...((data ?? []) as Transaction[]))
    if (!data || data.length < PAGE) return rows
  }
}

/** DB に送る列だけにする（created_at などはサーバーが付ける） */
function toRow(tx: Transaction) {
  return {
    id: tx.id,
    date: tx.date,
    type: tx.type,
    amount: tx.amount,
    category_id: tx.category_id,
    from_account_id: tx.from_account_id,
    to_account_id: tx.to_account_id,
    payment_method: tx.payment_method,
    memo: tx.memo,
    recurring_rule_id: tx.recurring_rule_id,
    planned_expense_id: tx.planned_expense_id,
  }
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [master, setMaster] = useState<Master>(EMPTY_MASTER)
  const [masterLoading, setMasterLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [txById, setTxById] = useState<Record<string, Transaction>>({})
  const txRef = useRef(txById)
  txRef.current = txById
  // 読み込みを始めた期間と、読み終えた期間
  const rangesRef = useRef<[DateStr, DateStr][]>([])
  const [loadedRanges, setLoadedRanges] = useState<[DateStr, DateStr][]>([])

  const reloadMaster = useCallback(async () => {
    if (!supabase) return
    const [c, a, b, s, t, r] = await Promise.all([
      supabase.from('categories').select('*').order('sort'),
      supabase.from('accounts').select('*').order('sort'),
      supabase.from('budgets').select('*'),
      supabase.from('settings').select('*').maybeSingle(),
      supabase.from('templates').select('*').order('sort'),
      supabase.from('recurring_rules').select('*').order('day_of_month'),
    ])
    const err = c.error ?? a.error ?? b.error ?? s.error ?? t.error ?? r.error
    setError(err ? err.message : null)
    setMaster({
      categories: (c.data ?? []) as Category[],
      accounts: (a.data ?? []) as Account[],
      budgets: (b.data ?? []) as Budget[],
      settings: (s.data ?? null) as Settings | null,
      templates: (t.data ?? []) as Template[],
      rules: (r.data ?? []) as RecurringRule[],
    })
    setMasterLoading(false)
  }, [])

  useEffect(() => {
    reloadMaster()
  }, [reloadMaster])

  /** 期間の記録をサーバーから読み直して差し替える */
  const loadRange = useCallback(async (start: DateStr, end: DateStr) => {
    try {
      const rows = await fetchRange(start, end)
      setTxById((prev) => {
        const next: Record<string, Transaction> = {}
        for (const [id, t] of Object.entries(prev)) if (t.date < start || t.date > end) next[id] = t
        for (const t of rows) next[t.id] = t
        return next
      })
      setLoadedRanges((prev) => (prev.some(([s, e]) => s === start && e === end) ? prev : [...prev, [start, end]]))
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  const isRangeLoaded = useCallback(
    (start: DateStr, end: DateStr) => loadedRanges.some(([s, e]) => s <= start && e >= end),
    [loadedRanges],
  )

  const ensureRange = useCallback(
    (start: DateStr, end: DateStr) => {
      if (rangesRef.current.some(([s, e]) => s <= start && e >= end)) return
      rangesRef.current = [...rangesRef.current, [start, end]]
      loadRange(start, end)
    },
    [loadRange],
  )

  // 他の端末での変更をすぐ反映する（Realtime）。RLS により自分の記録だけが届く
  useEffect(() => {
    const client = supabase
    if (!client) return
    const channel = client
      .channel('transactions-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as { id?: string }).id
          if (id) setTxById(({ [id]: _removed, ...rest }) => rest)
        } else {
          const row = payload.new as Transaction
          setTxById((prev) => ({ ...prev, [row.id]: row }))
        }
      })
      .subscribe()
    return () => {
      client.removeChannel(channel)
    }
  }, [])

  // スリープ復帰などで Realtime が途切れていた間の変更を取りこぼさないよう、画面に戻ったら読み直す
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      for (const [s, e] of rangesRef.current) loadRange(s, e)
      reloadMaster()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [loadRange, reloadMaster])

  const saveTransaction = useCallback(
    async (tx: Transaction) => {
      if (!supabase) return false
      // 先に画面へ反映し、失敗したら元に戻す
      const before = txRef.current[tx.id]
      setTxById((prev) => ({ ...prev, [tx.id]: tx }))
      const { data, error: err } = await supabase.from('transactions').upsert(toRow(tx)).select().single()
      if (err) {
        setTxById(({ [tx.id]: _failed, ...rest }) => (before ? { ...rest, [tx.id]: before } : rest))
        setError(`保存できませんでした：${err.message}`)
        return false
      }
      setTxById((prev) => ({ ...prev, [tx.id]: data as Transaction }))
      return true
    },
    [],
  )

  const deleteTransaction = useCallback(async (id: string) => {
    if (!supabase) return null
    const removed = txRef.current[id] ?? null
    setTxById(({ [id]: _removed, ...rest }) => rest)
    const { error: err } = await supabase.from('transactions').delete().eq('id', id)
    if (err) {
      if (removed) setTxById((prev) => ({ ...prev, [id]: removed }))
      setError(`削除できませんでした：${err.message}`)
      return null
    }
    return removed
  }, [])

  const value = useMemo<DataState>(
    () => ({
      ...master,
      masterLoading,
      error,
      reloadMaster,
      txById,
      ensureRange,
      isRangeLoaded,
      saveTransaction,
      deleteTransaction,
    }),
    [master, masterLoading, error, reloadMaster, txById, ensureRange, isRangeLoaded, saveTransaction, deleteTransaction],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): DataState {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData は DataProvider の中で使ってください')
  return ctx
}

/** 期間の記録（日付順）。まだ読んでいなければ読み込む */
export function useTransactions(start: DateStr, end: DateStr): { txs: Transaction[]; loaded: boolean } {
  const { txById, ensureRange, isRangeLoaded } = useData()
  useEffect(() => {
    ensureRange(start, end)
  }, [start, end, ensureRange])
  const txs = useMemo(
    () =>
      Object.values(txById)
        .filter((t) => t.date >= start && t.date <= end)
        .sort((a, b) => a.date.localeCompare(b.date) || (a.created_at ?? '').localeCompare(b.created_at ?? '')),
    [txById, start, end],
  )
  return { txs, loaded: isRangeLoaded(start, end) }
}
