import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'

export function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(await signIn(email, password))
    setBusy(false)
  }

  const input =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/30 dark:border-slate-700 dark:bg-slate-800'

  return (
    <div className="flex min-h-full items-center justify-center px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h1 className="mb-6 text-center text-xl font-bold text-teal-700 dark:text-teal-400">家計簿にログイン</h1>
        <label className="mb-4 block">
          <span className="mb-1 block text-sm text-slate-600 dark:text-slate-300">メールアドレス</span>
          <input className={input} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="mb-6 block">
          <span className="mb-1 block text-sm text-slate-600 dark:text-slate-300">パスワード</span>
          <input className={input} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && (
          <p role="alert" className="mb-4 text-sm text-red-700 dark:text-red-400">
            ⚠ {error}
          </p>
        )}
        <button type="submit" disabled={busy} className="w-full rounded-lg bg-teal-600 py-3 font-bold text-white hover:bg-teal-700 disabled:opacity-60 dark:bg-teal-500 dark:text-slate-950">
          {busy ? 'ログイン中…' : 'ログイン'}
        </button>
      </form>
    </div>
  )
}
