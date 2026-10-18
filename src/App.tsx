import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { Layout } from './components/Layout'
import { isSupabaseConfigured } from './lib/supabase'
import { AssetsPage } from './pages/AssetsPage'
import { KakeiboPage } from './pages/KakeiboPage'
import { LoginPage } from './pages/LoginPage'
import { ReportPage } from './pages/ReportPage'
import { SettingsPage } from './pages/SettingsPage'
import { SetupNeeded } from './pages/SetupNeeded'

function Gate() {
  const { session, loading } = useAuth()
  if (loading) return <p className="py-12 text-center text-slate-500">読み込み中…</p>
  // 未ログインならどのURLでもログイン画面だけを出す
  if (!session) return <LoginPage />
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<KakeiboPage />} />
        <Route path="report" element={<ReportPage />} />
        <Route path="assets" element={<AssetsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export function App() {
  if (!isSupabaseConfigured) return <SetupNeeded />
  return (
    <AuthProvider>
      <BrowserRouter>
        <Gate />
      </BrowserRouter>
    </AuthProvider>
  )
}
