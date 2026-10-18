/** 金額は整数（円）。小数が来たら誤りとして弾く */
export function assertYen(n: number): number {
  if (!Number.isSafeInteger(n)) throw new Error(`金額は整数（円）で扱います: ${n}`)
  return n
}

const yenFormatter = new Intl.NumberFormat('ja-JP')

/** 1234567 → "1,234,567円"、-500 → "-500円" */
export function formatYen(n: number): string {
  assertYen(n)
  return `${yenFormatter.format(n)}円`
}

/** 万分率（300 = 3%）を表示用に "3%" へ */
export function formatBasisPercent(bp: number): string {
  return `${(bp / 100).toFixed(bp % 100 === 0 ? 0 : 2)}%`
}

/** カレンダーのマス用の短い表記。10万円未満は 12,345、以上は 12.3万（切り捨て） */
export function formatCompact(n: number): string {
  assertYen(n)
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs < 100_000) return sign + yenFormatter.format(abs)
  const tenths = Math.floor(abs / 1000)
  const whole = Math.floor(tenths / 10)
  const frac = tenths % 10
  return `${sign}${yenFormatter.format(whole)}${frac ? `.${frac}` : ''}万`
}
