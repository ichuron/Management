import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

interface TableState<T> {
  rows: T[]
  loading: boolean
  error: string | null
  reload: () => void
}

/** テーブルの全行を読む（RLS により自分の行だけが返る） */
export function useTable<T>(table: string, orderBy = 'sort'): TableState<T> {
  const [rows, setRows] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    setLoading(true)
    supabase
      .from(table)
      .select('*')
      .order(orderBy)
      .then(({ data, error: err }) => {
        if (cancelled) return
        setRows((data ?? []) as T[])
        setError(err ? err.message : null)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [table, orderBy, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  return { rows, loading, error, reload }
}
