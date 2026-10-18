// 端末ごとの入力の好み（最後に使ったカテゴリ、使用回数など）。失われても困らないものだけを置く
type Prefs = {
  lastCategory: Partial<Record<'expense' | 'income', string>>
  lastPayment: string | null
  categoryUsage: Record<string, number>
  continuous: boolean
}

const KEY = 'entry-prefs'
const DEFAULTS: Prefs = { lastCategory: {}, lastPayment: null, categoryUsage: {}, continuous: false }

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) }
  } catch {
    // 読めなければ既定値
  }
  return { ...DEFAULTS }
}

export function updatePrefs(patch: (p: Prefs) => Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(patch(loadPrefs())))
  } catch {
    // 保存できなくても入力は続けられる
  }
}

/** 記録を保存したときに呼ぶ：最後に使ったものと、カテゴリの使用回数を覚える */
export function rememberEntry(type: 'expense' | 'income' | 'transfer', categoryId: string | null, payment: string | null): void {
  updatePrefs((p) => ({
    ...p,
    lastCategory: categoryId && type !== 'transfer' ? { ...p.lastCategory, [type]: categoryId } : p.lastCategory,
    lastPayment: type === 'expense' && payment ? payment : p.lastPayment,
    categoryUsage: categoryId ? { ...p.categoryUsage, [categoryId]: (p.categoryUsage[categoryId] ?? 0) + 1 } : p.categoryUsage,
  }))
}
