import { dayLeft, isNumCol, normDate, numFmt, parseRange, rowSrcOf, toNum, truthy, type EfColumn, type EfRow } from './model'

/**
 * 계산 줄(노션 Calculate) — 바닥줄·그룹 소계에서 열마다 고르는 계산(지시).
 * 고른 값은 보기마다 view.ef.calc[열 id]. 안 골랐으면 예전 바닥줄과 같게(숫자 열 합계 · 인원 고유값 · 부서 개수).
 */

export type CalcKey =
  | 'none' | 'count' | 'filled' | 'empty' | 'unique' | 'pctFilled' | 'pctEmpty'
  | 'sum' | 'avg' | 'median' | 'min' | 'max' | 'range'
  | 'checked' | 'unchecked' | 'pctChecked'
  | 'earliest' | 'latest' | 'dateRange'

export const CALC_NAME: Record<CalcKey, string> = {
  none: '없음',
  count: '개수',
  filled: '값 있음',
  empty: '빈 칸',
  unique: '고유값',
  pctFilled: '값 있음 %',
  pctEmpty: '빈 칸 %',
  sum: '합계',
  avg: '평균',
  median: '중앙값',
  min: '최소',
  max: '최대',
  range: '범위',
  checked: '체크',
  unchecked: '체크 안 됨',
  pctChecked: '체크 %',
  earliest: '가장 이른',
  latest: '가장 늦은',
  dateRange: '날짜 범위',
}

const numeric = (c: EfColumn) => isNumCol(c) || c.type === 'datediff'
const dated = (c: EfColumn) => c.type === 'date' || c.type === 'daterange'

/** 이 열에서 고를 수 있는 계산 — 유형마다(노션처럼 묶음: 세기 · 숫자 · 체크 · 날짜) */
export function calcsFor(c: EfColumn): CalcKey[][] {
  const base: CalcKey[] = ['count', 'filled', 'empty', 'unique', 'pctFilled', 'pctEmpty']
  if (c.type === 'checkbox') return [['none'], ['count'], ['checked', 'unchecked', 'pctChecked']]
  if (numeric(c)) return [['none'], base, ['sum', 'avg', 'median', 'min', 'max', 'range']]
  if (dated(c)) return [['none'], base, ['earliest', 'latest', 'dateRange']]
  return [['none'], base]
}

/** 안 골랐을 때 — 예전 바닥줄과 같게 */
export function defaultCalc(c: EfColumn): CalcKey {
  if (isNumCol(c)) return 'sum'
  if (c.id === 'name' || String(c.title ?? '').trim() === '인원') return 'unique'
  if (c.id === 'dept') return 'count'
  return 'none'
}
export function calcOf(c: EfColumn, picked: Record<string, string> | undefined): CalcKey {
  const k = picked?.[c.id] as CalcKey | undefined
  return k && CALC_NAME[k] && calcsFor(c).flat().includes(k) ? k : defaultCalc(c)
}

const cellText = (v: unknown) => (v == null ? '' : String(v).trim())
const r4 = (n: number) => Math.round(n * 1e4) / 1e4
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '0%')

/** 계산 — 보일 글자를 돌려준다('' 이면 안 보임). cols 는 남은 일수가 기간 열을 찾는 데 */
export function calc(k: CalcKey, c: EfColumn, rows: EfRow[], cols: EfColumn[]): string {
  if (k === 'none' || !rows.length) return ''
  if (k === 'count') return String(rows.length)
  // 칸 값 — 남은 일수는 계산값, 체크박스는 켜짐, 나머지는 글자
  const raw = (r: EfRow): string =>
    c.type === 'datediff' ? cellText(dayLeft(r, rowSrcOf(r, cols, c))) : c.type === 'checkbox' ? (truthy(r[c.id]) ? '1' : '') : cellText(r[c.id])
  const vals = rows.map(raw)
  const filled = vals.filter(Boolean)
  switch (k) {
    case 'filled':
      return String(filled.length)
    case 'empty':
      return String(vals.length - filled.length)
    case 'pctFilled':
      return pct(filled.length, vals.length)
    case 'pctEmpty':
      return pct(vals.length - filled.length, vals.length)
    case 'unique': {
      // 다중 선택은 값마다
      const s = new Set(c.type === 'multiselect' ? filled.flatMap((v) => v.split(',').map((x) => x.trim()).filter(Boolean)) : filled)
      return String(s.size)
    }
    case 'checked':
      return String(filled.length)
    case 'unchecked':
      return String(vals.length - filled.length)
    case 'pctChecked':
      return pct(filled.length, vals.length)
  }
  if (k === 'earliest' || k === 'latest' || k === 'dateRange') {
    const ds = rows
      .flatMap((r) => (c.type === 'daterange' ? [parseRange(r[c.id]).s, parseRange(r[c.id]).e] : [cellText(r[c.id])]))
      .map((v) => normDate(v))
      .filter((v): v is string => !!v)
      .sort()
    if (!ds.length) return ''
    if (k === 'earliest') return ds[0]!
    if (k === 'latest') return ds[ds.length - 1]!
    const n = Math.round((new Date(ds[ds.length - 1]! + 'T00:00:00').getTime() - new Date(ds[0]! + 'T00:00:00').getTime()) / 86400000) + 1
    return `${n}일`
  }
  const nums = filled.map((v) => toNum(v)).filter((n): n is number => n !== null)
  if (!nums.length) return ''
  const sorted = [...nums].sort((a, b) => a - b)
  const sum = nums.reduce((a, b) => a + b, 0)
  const v =
    k === 'sum' ? sum
    : k === 'avg' ? sum / nums.length
    : k === 'median' ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2]! : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2)
    : k === 'min' ? sorted[0]!
    : k === 'max' ? sorted[sorted.length - 1]!
    : sorted[sorted.length - 1]! - sorted[0]!
  if (k === 'sum' && v === 0) return ''
  return numFmt(r4(v))
}
