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
