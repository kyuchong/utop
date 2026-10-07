import { dayLeft, footStat, isNumCol, normDate, numFmt, parseRange, rowSrcOf, toNum, truthy, type EfColumn, type EfRow, type FootStat } from './model'

/**
 * 표 바닥줄 계산 — 노션처럼 칸을 눌러 고른다(지시). 고른 값은 보기마다 view.ef.calc[열 id].
 * 안 골랐으면 「자동」 — 유형마다 정해 둔 값(model.footStat: 숫자 합계 · 선택 최다 · 글 종류 …).
 * 메뉴는 노션과 같은 묶음: 계산 안함 · 수 › · 비율(%) › · (숫자·날짜는) 더 많은 옵션 ›
 */

export type CalcKey =
  | 'auto' | 'none'
  | 'count' | 'values' | 'unique' | 'empty' | 'filled'
  | 'pctEmpty' | 'pctFilled'
  | 'checked' | 'unchecked' | 'pctChecked' | 'pctUnchecked'
  | 'sum' | 'avg' | 'median' | 'min' | 'max' | 'range'
  | 'earliest' | 'latest' | 'dateRange'

/** 메뉴에 보일 이름(노션 말) */
export const CALC_MENU: Record<CalcKey, string> = {
  auto: '자동 (유형별)',
  none: '계산 안함',
  count: '모두 세기',
  values: '값 세기',
  unique: '중복 제외 모두 세기',
  empty: '빈 값 세기',
  filled: '비어 있지 않은 값 세기',
  pctEmpty: '빈 값 세기(%)',
  pctFilled: '비어 있지 않은 값 세기(%)',
  checked: '체크 표시됨',
  unchecked: '체크 표시 해제됨',
  pctChecked: '체크 표시됨(%)',
  pctUnchecked: '체크 표시 해제됨(%)',
  sum: '합계',
  avg: '평균',
  median: '중앙값',
  min: '최소',
  max: '최대',
  range: '범위',
  earliest: '가장 이른 날짜',
  latest: '가장 늦은 날짜',
  dateRange: '날짜 범위',
}
/** 바닥줄에 값 앞에 붙는 짧은 이름 */
const CALC_LBL: Partial<Record<CalcKey, string>> = {
  count: '모두',
  values: '값',
  unique: '고유',
  empty: '빈 값',
  filled: '값 있음',
  pctEmpty: '빈 값',
  pctFilled: '값 있음',
  checked: '체크',
  unchecked: '미체크',
  pctChecked: '체크',
  pctUnchecked: '미체크',
  earliest: '가장 이른',
  latest: '가장 늦은',
  dateRange: '날짜 범위',
}

const numeric = (c: EfColumn) => isNumCol(c) || c.type === 'datediff'
const dated = (c: EfColumn) => c.type === 'date' || c.type === 'daterange'

export interface CalcGroup {
  /** 없으면 바로 고르는 항목들, 있으면 그 이름의 하위 메뉴 */
  sub?: string
  keys: CalcKey[]
}
/** 이 열에서 고를 수 있는 계산 — 노션 메뉴 모양대로 */
export function calcMenuFor(c: EfColumn): CalcGroup[] {
  if (c.type === 'checkbox')
    return [
      { keys: ['auto', 'none'] },
      { sub: '수', keys: ['count', 'checked', 'unchecked'] },
      { sub: '비율(%)', keys: ['pctChecked', 'pctUnchecked'] },
    ]
  const g: CalcGroup[] = [
    { keys: ['auto', 'none'] },
    { sub: '수', keys: ['count', 'values', 'unique', 'empty', 'filled'] },
    { sub: '비율(%)', keys: ['pctEmpty', 'pctFilled'] },
  ]
  if (numeric(c)) g.push({ sub: '더 많은 옵션', keys: ['sum', 'avg', 'median', 'min', 'max', 'range'] })
  if (dated(c)) g.push({ sub: '더 많은 옵션', keys: ['earliest', 'latest', 'dateRange'] })
  return g
}

export function calcOf(c: EfColumn, picked: Record<string, string> | undefined): CalcKey {
  const k = picked?.[c.id] as CalcKey | undefined
  return k && calcMenuFor(c).some((g) => g.keys.includes(k)) ? k : 'auto'
}

const cellText = (v: unknown) => (v == null ? '' : String(v).trim())
const r4 = (n: number) => Math.round(n * 1e4) / 1e4
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '0%')

/**
 * 계산 — 바닥줄에 보일 이름표·값(값이 없으면 null = 비워 둔다).
 * 숫자 열의 「자동」 은 합계(0 도), 그 밖의 「자동」 은 유형별 값(footStat).
 */
export function calc(k: CalcKey, c: EfColumn, rows: EfRow[], cols: EfColumn[], today = new Date()): FootStat | null {
  if (k === 'none') return null
  if (k === 'auto') {
    if (isNumCol(c)) return { lbl: '합계', val: numFmt(r4(rows.reduce((a, r) => a + (toNum(r[c.id]) ?? 0), 0))) }
    return footStat(c, rows, cols, today)
  }
  const lbl = CALC_LBL[k] ?? CALC_MENU[k]
  const out = (val: string): FootStat => ({ lbl, val })
  if (k === 'count') return out(String(rows.length))
  // 칸 값 — 남은 일수는 계산값, 체크박스는 켜짐, 나머지는 글자
  const raw = (r: EfRow): string =>
    c.type === 'datediff' ? cellText(dayLeft(r, rowSrcOf(r, cols, c), today)) : c.type === 'checkbox' ? (truthy(r[c.id]) ? '1' : '') : cellText(r[c.id])
  const vals = rows.map(raw)
  const filled = vals.filter(Boolean)
  const parts = c.type === 'multiselect' ? filled.flatMap((v) => v.split(',').map((x) => x.trim()).filter(Boolean)) : filled
  switch (k) {
    case 'values':
      return out(String(parts.length))
    case 'unique':
      return out(String(new Set(parts).size))
    case 'filled':
    case 'checked':
      return out(String(filled.length))
    case 'empty':
    case 'unchecked':
      return out(String(vals.length - filled.length))
    case 'pctFilled':
    case 'pctChecked':
      return out(pct(filled.length, vals.length))
    case 'pctEmpty':
    case 'pctUnchecked':
      return out(pct(vals.length - filled.length, vals.length))
  }
  if (k === 'earliest' || k === 'latest' || k === 'dateRange') {
    const ds = rows
      .flatMap((r) => (c.type === 'daterange' ? [parseRange(r[c.id]).s, parseRange(r[c.id]).e] : [cellText(r[c.id])]))
      .map((v) => normDate(v))
      .filter((v): v is string => !!v)
      .sort()
    if (!ds.length) return out('—')
    if (k === 'earliest') return out(ds[0]!)
    if (k === 'latest') return out(ds[ds.length - 1]!)
    const n = Math.round((new Date(ds[ds.length - 1]! + 'T00:00:00').getTime() - new Date(ds[0]! + 'T00:00:00').getTime()) / 86400000) + 1
    return out(`${n}일`)
  }
  const nums = filled.map((v) => toNum(v)).filter((n): n is number => n !== null)
  if (!nums.length) return out('—')
  const sorted = [...nums].sort((a, b) => a - b)
  const sum = nums.reduce((a, b) => a + b, 0)
  const v =
    k === 'sum' ? sum
    : k === 'avg' ? sum / nums.length
    : k === 'median' ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2]! : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2)
    : k === 'min' ? sorted[0]!
    : k === 'max' ? sorted[sorted.length - 1]!
    : sorted[sorted.length - 1]! - sorted[0]!
  return out(numFmt(r4(v)))
}
