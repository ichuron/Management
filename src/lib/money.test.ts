import { describe, expect, it } from 'vitest'
import { assertYen, formatBasisPercent, formatCompact, formatYen } from './money'

describe('formatYen', () => {
  it('3桁区切り', () => {
    expect(formatYen(208200)).toBe('208,200円')
    expect(formatYen(0)).toBe('0円')
    expect(formatYen(-500)).toBe('-500円')
  })
  it('小数は誤りとして弾く', () => {
    expect(() => assertYen(100.5)).toThrow()
  })
})

describe('formatBasisPercent', () => {
  it('万分率', () => {
    expect(formatBasisPercent(300)).toBe('3%')
    expect(formatBasisPercent(0)).toBe('0%')
    expect(formatBasisPercent(350)).toBe('3.50%')
  })
})

describe('formatCompact', () => {
  it('10万円未満はそのまま、以上は万単位（切り捨て）', () => {
    expect(formatCompact(800)).toBe('800')
    expect(formatCompact(99999)).toBe('99,999')
    expect(formatCompact(100000)).toBe('10万')
    expect(formatCompact(123456)).toBe('12.3万')
    expect(formatCompact(208200)).toBe('20.8万')
    expect(formatCompact(12345678)).toBe('1,234.5万')
  })
})
