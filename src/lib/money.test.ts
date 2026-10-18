import { describe, expect, it } from 'vitest'
import { assertYen, formatBasisPercent, formatYen } from './money'

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
