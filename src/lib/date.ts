import { addDays, addMonths, format, getDaysInMonth, parseISO } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'

export const TIME_ZONE = 'Asia/Tokyo'

/** 日付は 'yyyy-MM-dd' の文字列で扱う（タイムゾーンのずれを避けるため Date を持ち回らない） */
export type DateStr = string

/** 日本時間での今日 */
export function todayTokyo(now: Date = new Date()): DateStr {
  return formatInTimeZone(now, TIME_ZONE, 'yyyy-MM-dd')
}

/** 'yyyy-MM-dd' を暦の上の日付として扱うための Date（ローカル 0 時） */
function toLocal(d: DateStr): Date {
  return parseISO(d)
}

export function shiftDays(d: DateStr, n: number): DateStr {
  return format(addDays(toLocal(d), n), 'yyyy-MM-dd')
}

export function shiftMonths(d: DateStr, n: number): DateStr {
  return format(addMonths(toLocal(d), n), 'yyyy-MM-dd')
}

export function daysInMonth(year: number, month: number): number {
  return getDaysInMonth(new Date(year, month - 1, 1))
}

export interface MonthPeriod {
  /** 月の名前に使う年月（開始日が25日なら、4/25〜5/24 は「5月」） */
  year: number
  month: number
  /** 期間の初日と最終日（両端を含む） */
  start: DateStr
  end: DateStr
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function ymd(year: number, month: number, day: number): DateStr {
  return `${year}-${pad(month)}-${pad(day)}`
}

/**
 * 「◯年◯月」の期間を返す。
 * startDay = 1 なら暦どおり。startDay = 25 なら前月25日〜当月24日を当月として扱う。
 */
export function monthPeriod(year: number, month: number, startDay = 1): MonthPeriod {
  if (startDay <= 1) {
    return { year, month, start: ymd(year, month, 1), end: ymd(year, month, daysInMonth(year, month)) }
  }
  const prevYear = month === 1 ? year - 1 : year
  const prevMonth = month === 1 ? 12 : month - 1
  const start = ymd(prevYear, prevMonth, Math.min(startDay, daysInMonth(prevYear, prevMonth)))
  const end = shiftDays(ymd(year, month, Math.min(startDay, daysInMonth(year, month))), -1)
  return { year, month, start, end }
}

/** ある日付が属する「月」 */
export function periodOf(d: DateStr, startDay = 1): MonthPeriod {
  const [y, m, day] = d.split('-').map(Number)
  if (startDay <= 1 || day < startDay) return monthPeriod(y, m, startDay)
  return m === 12 ? monthPeriod(y + 1, 1, startDay) : monthPeriod(y, m + 1, startDay)
}

/** 会計年度（4月〜3月）。2027-03-31 は 2026年度、2027-04-01 は 2027年度 */
export function fiscalYearOf(d: DateStr): number {
  const [y, m] = d.split('-').map(Number)
  return m >= 4 ? y : y - 1
}

/** 期間の日数（両端を含む） */
export function daysBetweenInclusive(start: DateStr, end: DateStr): number {
  const ms = Date.UTC(...ymdParts(end)) - Date.UTC(...ymdParts(start))
  return Math.round(ms / 86_400_000) + 1
}

function ymdParts(d: DateStr): [number, number, number] {
  const [y, m, day] = d.split('-').map(Number)
  return [y, m - 1, day]
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

export function formatJpDate(d: DateStr): string {
  const [y, m, day] = d.split('-').map(Number)
  const w = WEEKDAYS[new Date(Date.UTC(y, m - 1, day)).getUTCDay()]
  return `${y}年${m}月${day}日（${w}）`
}
