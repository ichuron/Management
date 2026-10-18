import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface AuthState {
  session: Session | null
  loading: boolean
  /** 初期データ投入でエラーが起きたときのメッセージ */
  seedError: string | null
  /** 初期データの用意が終わり、画面がデータを読める状態か */
  dataReady: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [seedError, setSeedError] = useState<string | null>(null)
  const [readyFor, setReadyFor] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  // ログインしたら初期データを用意する（既にあれば何もしない）
  const userId = session?.user.id
  useEffect(() => {
    if (!supabase || !userId) return
    supabase.rpc('ensure_initial_data').then(({ error }) => {
      setSeedError(error ? error.message : null)
      setReadyFor(userId)
    })
  }, [userId])

  const value: AuthState = {
    session,
    loading,
    seedError,
    dataReady: Boolean(userId) && readyFor === userId,
    async signIn(email, password) {
      if (!supabase) return 'Supabase が設定されていません'
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (!error) return null
      return error.message === 'Invalid login credentials'
        ? 'メールアドレスかパスワードが違います'
        : error.message
    },
    async signOut() {
      await supabase?.auth.signOut()
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth は AuthProvider の中で使ってください')
  return ctx
}
