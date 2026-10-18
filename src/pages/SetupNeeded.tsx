export function SetupNeeded() {
  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <h1 className="mb-4 text-xl font-bold">Supabase の設定が必要です</h1>
      <p className="mb-2 text-sm">
        プロジェクト直下に <code>.env.local</code> を作り、<code>VITE_SUPABASE_URL</code> と <code>VITE_SUPABASE_ANON_KEY</code> を書いてください（<code>.env.example</code> を参照）。
      </p>
      <p className="text-sm">詳しい手順は README.md にあります。</p>
    </div>
  )
}
