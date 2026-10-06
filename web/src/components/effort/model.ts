/**
 * Effort Plan(인원 투입) — 자료 모양과 도우미.
 *
 * 예전 UTOP(C:/utop)의 「인원 투입 beta」(14-resource-beta.js)를 이 앱으로 옮긴 것이다(지시: TanStack).
 * 서버 자료(/api/resource/manpower)는 **예전과 같은 꼴**로 둔다 — 예전 자료를 그대로 가져올 수 있게:
 *   { columns:[...], pages:{ "2025":{ rows:[...] } }, years:[...], curPage:"2025",
 *     views:[...], curView, betaViews:[...], curBetaView }
 * 이 화면은 beta 쪽 보기(betaViews/curBetaView)를 쓴다. 열·행은 함께 쓴다.
 */

export type EfType =
  | 'text' | 'number' | 'select' | 'multiselect' | 'status' | 'date' | 'daterange'
  | 'datediff' | 'person' | 'checkbox' | 'url' | 'email' | 'phone'

export interface EfColumn {
  id: string
  title: string
  type: EfType
  width?: number
  options?: string[]
  /** 옵션 값 → 색(#RRGGBB) */
  optColors?: Record<string, string>
  /** 숫자 열들의 합을 행마다 넣는 열(합계) */
  autoSum?: boolean
  [k: string]: unknown
}
export type EfRow = Record<string, unknown>
export interface EfSortRule { id: string; desc: boolean }
export interface EfFilterRule { id: string; value: unknown }
/** 이 화면의 보기 상태 — 예전 보기(searchQ 등)와 섞이지 않게 ef 에 따로 담는다 */
export interface EfViewState { q: string; filters: EfFilterRule[]; sorting: EfSortRule[]; group: string | null }
export interface EfView {
  id: string
  name: string
  type: string
  searchQ?: string
  ef?: EfViewState
  [k: string]: unknown
}
export interface EfDoc {
  columns: EfColumn[]
  pages: Record<string, { rows: EfRow[] }>
  years?: string[]
  curPage?: string
  betaViews?: EfView[]
  curBetaView?: string
  views?: EfView[]
  curView?: string
  [k: string]: unknown
}

export const TYPES: Array<{ t: EfType; n: string; ic: string }> = [
  { t: 'text', n: '텍스트', ic: '≡' },
  { t: 'number', n: '숫자', ic: '#' },
  { t: 'select', n: '선택', ic: '◉' },
  { t: 'multiselect', n: '다중 선택', ic: '⊞' },
  { t: 'status', n: '상태', ic: '◎' },
  { t: 'date', n: '날짜', ic: '▦' },
  { t: 'daterange', n: '기간', ic: '▤' },
  { t: 'datediff', n: '기간 일수', ic: '⏱' },
  { t: 'person', n: '사람', ic: '☺' },
  { t: 'checkbox', n: '체크박스', ic: '☑' },
  { t: 'url', n: 'URL', ic: '⛓' },
  { t: 'email', n: '이메일', ic: '✉' },
  { t: 'phone', n: '전화번호', ic: '☎' },
]
export const typeIcon = (c: EfColumn) => (c.autoSum ? 'Σ' : TYPES.find((x) => x.t === c.type)?.ic ?? '≡')
export const hasOptions = (t: string) => t === 'select' || t === 'status' || t === 'multiselect'

export const newId = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
export const natural = (a: string, b: string) => String(a).localeCompare(String(b), 'ko', { numeric: true })

/** 비었으면 처음 세울 열 — 인원 투입 표의 기본 꼴(부서·인원·직급·사업자·제품·업무 + 01~12월 + 합계) */
export function defaultColumns(): EfColumn[] {
  const m = Array.from({ length: 12 }, (_, i) => ({
    id: 'm' + String(i + 1).padStart(2, '0'),
    title: String(i + 1).padStart(2, '0') + '월',
    type: 'number' as EfType,
  }))
  return [
    { id: 'name', title: '인원', type: 'text' },
    { id: 'dept', title: '부서', type: 'select', options: [] },
    { id: 'rank', title: '직급', type: 'select', options: [] },
    { id: 'biz', title: '사업자', type: 'select', options: [] },
    { id: 'product', title: '제품명(프로젝트)', type: 'text' },
    { id: 'work', title: '업무분류(대분류)', type: 'select', options: [] },
    ...m,
    { id: 'total', title: '합계', type: 'number', autoSum: true },
  ]
}

/** 서버에서 받은 것을 이 화면이 쓰는 꼴로 — 연도 페이지를 보장한다(예전 _rscMP 와 같은 일) */
export function normalize(raw: unknown): EfDoc {
  const d = (raw && typeof raw === 'object' ? raw : {}) as EfDoc
  if (!Array.isArray(d.columns) || !d.columns.length) d.columns = defaultColumns()
  if (!d.pages || typeof d.pages !== 'object') d.pages = {}
  // 아주 옛 꼴(맨 위 rows) — 올해 페이지로 옮긴다
  const top = (d as { rows?: EfRow[] }).rows
  const ys = new Set<string>()
  Object.keys(d.pages).forEach((k) => /^\d{4}$/.test(k) && ys.add(k))
  ;(d.years ?? []).forEach((y) => /^\d{4}$/.test(String(y)) && ys.add(String(y)))
  if (!ys.size) ys.add(String(new Date().getFullYear()))
  d.years = [...ys].sort().reverse()
  d.years.forEach((y) => {
    if (!d.pages[y] || !Array.isArray(d.pages[y]!.rows)) d.pages[y] = { rows: [] }
  })
  const cy = String(d.curPage ?? '').slice(0, 4)
  d.curPage = /^\d{4}$/.test(cy) && d.pages[cy] ? cy : d.years[0]!
  if (Array.isArray(top) && top.length && !d.pages[d.curPage]!.rows.length) d.pages[d.curPage]!.rows = top
  delete (d as { rows?: unknown }).rows
  delete (d as { _rowsPage?: unknown })._rowsPage
  return d
}

/** 이 화면의 보기 탭 목록 — 없으면 예전 「현황」 탭을 복사해 오거나 표 하나를 세운다 */
export function ensureViews(d: EfDoc): EfView[] {
  if (!Array.isArray(d.betaViews) || !d.betaViews.length) {
    if (Array.isArray(d.views) && d.views.length) {
      d.betaViews = JSON.parse(JSON.stringify(d.views)) as EfView[]
      d.betaViews.forEach((v) => (v.id = newId()))
    } else {
      d.betaViews = [{ id: newId(), name: '표', type: 'table' }]
    }
  }
  d.betaViews.forEach((v) => {
    if (v.type === 'beta1' || v.type === 'beta2') v.type = 'table'
  })
  if (!d.curBetaView || !d.betaViews.some((v) => v.id === d.curBetaView)) d.curBetaView = d.betaViews[0]!.id
  return d.betaViews
}

/** 보기의 검색·필터·정렬·그룹. 예전 보기(searchQ·sorts)에서 처음 한 번 옮겨 온다 */
export function viewState(v: EfView | undefined, cols: EfColumn[]): EfViewState {
  if (v?.ef) return v.ef
  const raw = (v as { sorts?: unknown } | undefined)?.sorts
  const sorts = Array.isArray(raw)
    ? (raw as Array<{ col: string; dir: number }>)
        .filter((s) => s && s.col && cols.some((c) => c.id === s.col))
        .map((s) => ({ id: s.col, desc: (s.dir ?? 1) < 0 }))
    : []
  return { q: String(v?.searchQ ?? ''), filters: [], sorting: sorts, group: null }
}

/** 기본 그룹 — 인원 열(예전과 같다) */
export function defaultGroup(cols: EfColumn[]): string {
  const c =
    cols.find((x) => x.id === 'name') ||
    cols.find((x) => String(x.title ?? '').trim() === '인원') ||
    cols.find((x) => !isNumCol(x))
  return c ? c.id : ''
}

export const isNumCol = (c: EfColumn | undefined) => !!c && (c.type === 'number' || !!c.autoSum)
export function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = parseFloat(String(v).replace(/,/g, ''))
  return isNaN(n) ? null : n
}
export const numFmt = (n: number) => String(Math.round(n * 100) / 100)

/** 합계 열(autoSum) 다시 계산 — 숫자 열(합계 열 빼고)을 더해 행마다 넣는다 */
export function recalcAuto(rows: EfRow[], cols: EfColumn[]) {
  const autos = cols.filter((c) => c.autoSum)
  if (!autos.length) return
  const nums = cols.filter((c) => c.type === 'number' && !c.autoSum)
  rows.forEach((r) => {
    let s = 0
    let any = false
    nums.forEach((nc) => {
      const v = toNum(r[nc.id])
      if (v !== null) {
        s += v
        any = true
      }
    })
    autos.forEach((ac) => {
      if (any) r[ac.id] = Math.round(s * 1e6) / 1e6
      else delete r[ac.id]
    })
  })
}

/** 표에 쓰인 값 중 옵션에 없는 것 */
export function missingOptions(rows: EfRow[], c: EfColumn): string[] {
  const used = new Set<string>()
  rows.forEach((r) => {
    const v = r[c.id]
    if (v == null || v === '') return
    String(v).split(',').forEach((x) => {
      const t = x.trim()
      if (t) used.add(t)
    })
  })
  const have = c.options ?? []
  return [...used].filter((v) => !have.includes(v)).sort(natural)
}
/** 유형을 선택 계열로 바꿀 때 쓰인 값을 옵션으로(예전 _rscAutoOptions) */
export function autoOptions(rows: EfRow[], c: EfColumn) {
  const add = missingOptions(rows, c)
  if (add.length) c.options = [...(c.options ?? []), ...add].sort(natural)
}
/** 이 옵션을 쓰는 행 수 */
export function optCount(rows: EfRow[], c: EfColumn, opt: string): number {
  const multi = c.type === 'multiselect'
  let n = 0
  rows.forEach((r) => {
    const v = r[c.id]
    if (v == null || v === '') return
    if (multi ? String(v).split(',').map((x) => x.trim()).includes(opt) : String(v) === opt) n++
  })
  return n
}

// ── 색 ──────────────────────────────────────────────────────────────
/** 색판 — 17색 × 6단계(아주 진함·진함·기본·밝음·옅음·여림). 예전 _RSC_HUES 그대로 */
export const HUES: Array<[string, string[]]> = [
  ['빨강', ['#7f1d1d', '#b91c1c', '#dc2626', '#f87171', '#fca5a5', '#fee2e2']],
  ['주황', ['#7c2d12', '#c2410c', '#ea580c', '#fb923c', '#fdba74', '#ffedd5']],
  ['호박', ['#78350f', '#b45309', '#e8820c', '#fbbf24', '#fcd34d', '#fef3c7']],
  ['노랑', ['#713f12', '#a16207', '#eab308', '#facc15', '#fde68a', '#fefce8']],
  ['연두', ['#365314', '#4d7c0f', '#65a30d', '#a3e635', '#bef264', '#ecfccb']],
  ['초록', ['#14532d', '#15803d', '#16a34a', '#4ade80', '#86efac', '#dcfce7']],
  ['에메랄드', ['#064e3b', '#047857', '#10b981', '#34d399', '#6ee7b7', '#d1fae5']],
  ['청록', ['#134e4a', '#0f766e', '#0d9488', '#2dd4bf', '#5eead4', '#ccfbf1']],
  ['하늘', ['#0c4a6e', '#0369a1', '#0ea5e9', '#38bdf8', '#7dd3fc', '#e0f2fe']],
  ['파랑', ['#1e3a8a', '#1d4ed8', '#2563eb', '#60a5fa', '#93c5fd', '#dbeafe']],
  ['남색', ['#312e81', '#4338ca', '#4f46e5', '#818cf8', '#a5b4fc', '#e0e7ff']],
  ['보라', ['#4c1d95', '#6d28d9', '#7c3aed', '#a78bfa', '#c4b5fd', '#ede9fe']],
  ['자주', ['#701a75', '#a21caf', '#c026d3', '#e879f9', '#f0abfc', '#fae8ff']],
  ['분홍', ['#831843', '#be185d', '#ec4899', '#f472b6', '#f9a8d4', '#fce7f3']],
  ['장미', ['#881337', '#be123c', '#e11d48', '#fb7185', '#fda4af', '#ffe4e6']],
  ['갈색', ['#451a03', '#78350f', '#a16207', '#c8a06a', '#d6bd9a', '#f5ecdf']],
  ['회색', ['#000000', '#374151', '#6b7280', '#9ca3af', '#c3cad4', '#ffffff']],
]
export const SHADE = ['아주 진함', '진함', '', '밝음', '옅음', '여림']

/** 색을 안 고른 값의 자동 색 — 값 글자로 늘 같은 색이 나오게 */
const AUTO = ['#2563eb', '#16a34a', '#ea580c', '#7c3aed', '#0d9488', '#db2777', '#ca8a04', '#4f46e5', '#dc2626', '#0891b2', '#65a30d', '#c026d3']
export function autoColor(v: string): string {
  let h = 0
  for (let i = 0; i < v.length; i++) h = (h * 31 + v.charCodeAt(i)) >>> 0
  return AUTO[h % AUTO.length]!
}
export const optColor = (c: EfColumn | undefined, v: string) => c?.optColors?.[v] || autoColor(v)

export function hex2hsl(hex: string): { h: number; s: number; l: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''))
  if (!m) return null
  const n = parseInt(m[1]!, 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const l = (mx + mn) / 2
  let h = 0
  let s = 0
  if (mx !== mn) {
    const d = mx - mn
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
    h = (mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) / 6
  }
  return { h, s, l }
}
function hsl2hex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12
    const a = s * Math.min(l, 1 - l)
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(c * 255).toString(16).padStart(2, '0')
  }
  return '#' + f(0) + f(8) + f(4)
}
/** 칩 색 — 어두운·중간 색은 옅은 바탕+그 색 글자, 밝은 색은 바탕으로 쓰고 글자를 어둡게(예전 _rscChipStyle) */
export function chipStyle(hex: string): { background: string; color: string } {
  const c = String(hex || '')
  const hsl = hex2hsl(c)
  if (!hsl || hsl.l <= 0.72) return { background: c + '22', color: c }
  const fg = hsl2hex(hsl.h, Math.max(hsl.s, 0.45), hsl.l > 0.93 ? 0.34 : 0.3)
  return { background: c, color: hsl.s < 0.06 ? '#374151' : fg }
}
/** 색판에서 가장 가까운 칸 — 메뉴를 열면 지금 색 자리에 체크가 서게 */
export function nearest(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''))
  if (!m) return ''
  const n = parseInt(m[1]!, 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  let best = ''
  let bd = Infinity
  HUES.forEach(([, cs]) =>
    cs.forEach((cl) => {
      const q = parseInt(cl.slice(1), 16)
      const d = (((q >> 16) & 255) - r) ** 2 + (((q >> 8) & 255) - g) ** 2 + ((q & 255) - b) ** 2
      if (d < bd) {
        bd = d
        best = cl
      }
    }),
  )
  return best.toLowerCase()
}

/** 열 너비 — 글자 10px 기준, 12개월 + 합계가 가로 스크롤 없이 들어가게(예전 값 그대로).
 *  이 화면에서 끌어 바꾼 너비는 efWidth 에 둔다 — width 는 예전 표가 쓰는 값이라 건드리지 않는다 */
const SIZE: Record<string, number> = {
  부서: 86, 인원: 78, 직급: 58, 사업자: 74, '제품명(프로젝트)': 120, '업무분류(대분류)': 190, 합계: 72,
}
export const colSize = (c: EfColumn) =>
  (typeof c.efWidth === 'number' && c.efWidth > 0 ? c.efWidth : 0) ||
  (SIZE[String(c.title ?? '').trim()] ?? (isNumCol(c) ? 58 : c.width || 96))

/** CSV — 지금 화면에 보이는 열 순서·행 그대로(엑셀이 한글을 읽게 BOM) */
export function downloadCsv(name: string, cols: EfColumn[], rows: EfRow[]) {
  const q = (s: unknown) => {
    const t = String(s ?? '')
    return /[",\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t
  }
  const text =
    '\ufeff' + [cols.map((c) => q(c.title)).join(','), ...rows.map((r) => cols.map((c) => q(r[c.id])).join(','))].join('\r\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
