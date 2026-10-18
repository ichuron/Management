import { describe, expect, it } from 'vitest'
import { daysBetweenInclusive, fiscalYearOf, formatJpDate, monthPeriod, periodOf, shiftMonths, todayTokyo } from './date'

describe('todayTokyo', () => {
  it('UTC 15:00 は日本時間の翌日0時', () => {
    expect(todayTokyo(new Date('2027-03-31T14:59:59Z'))).toBe('2027-03-31')
    expect(todayTokyo(new Date('2027-03-31T15:00:00Z'))).toBe('2027-04-01')
  })
  it('年またぎ', () => {
    expect(todayTokyo(new Date('2027-12-31T15:00:00Z'))).toBe('2028-01-01')
  })
})

describe('monthPeriod（1日始まり）', () => {
  it('うるう年の2月', () => {
    expect(monthPeriod(2028, 2)).toEqual({ year: 2028, month: 2, start: '2028-02-01', end: '2028-02-29' })
  })
  it('平年の2月', () => {
    expect(monthPeriod(2027, 2).end).toBe('2027-02-28')
  })
  it('12月', () => {
    expect(monthPeriod(2027, 12)).toMatchObject({ start: '2027-12-01', end: '2027-12-31' })
  })
})

describe('monthPeriod（25日始まり）', () => {
  it('5月は4/25〜5/24', () => {
    expect(monthPeriod(2027, 5, 25)).toMatchObject({ start: '2027-04-25', end: '2027-05-24' })
  })
  it('1月は前年12/25から', () => {
    expect(monthPeriod(2028, 1, 25)).toMatchObject({ start: '2027-12-25', end: '2028-01-24' })
  })
})

describe('periodOf', () => {
  it('1日始まり', () => {
    expect(periodOf('2027-04-30')).toMatchObject({ year: 2027, month: 4 })
  })
  it('25日始まり：24日は当月、25日は翌月', () => {
    expect(periodOf('2027-04-24', 25)).toMatchObject({ year: 2027, month: 4 })
    expect(periodOf('2027-04-25', 25)).toMatchObject({ year: 2027, month: 5 })
    expect(periodOf('2027-12-25', 25)).toMatchObject({ year: 2028, month: 1 })
  })
})

describe('fiscalYearOf', () => {
  it('3月末は前年度、4月1日から新年度', () => {
    expect(fiscalYearOf('2027-03-31')).toBe(2026)
    expect(fiscalYearOf('2027-04-01')).toBe(2027)
    expect(fiscalYearOf('2028-01-15')).toBe(2027)
  })
})

describe('その他', () => {
  it('月末からの月送り', () => {
    expect(shiftMonths('2027-01-31', 1)).toBe('2027-02-28')
  })
  it('期間の日数', () => {
    expect(daysBetweenInclusive('2028-02-01', '2028-02-29')).toBe(29)
    expect(daysBetweenInclusive('2027-04-25', '2027-05-24')).toBe(30)
  })
  it('曜日つき表示', () => {
    expect(formatJpDate('2027-04-01')).toBe('2027年4月1日（木）')
  })
})
