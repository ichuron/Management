import type { ReactNode } from 'react'

export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="mb-4 text-xl font-bold lg:text-2xl">{children}</h1>
}

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      {title && <h2 className="mb-3 text-sm font-bold text-slate-600 dark:text-slate-300">{title}</h2>}
      {children}
    </section>
  )
}

export function ComingSoon({ phase, items }: { phase: number; items: string[] }) {
  return (
    <Card>
      <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">この画面は Phase {phase} で作ります。</p>
      <ul className="list-inside list-disc text-sm text-slate-500 dark:text-slate-400">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </Card>
  )
}
