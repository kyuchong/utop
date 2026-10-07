/**
 * Effort Plan(인원 투입) — 자료 모양과 도우미.
 *
 * 예전 UTOP(C:/utop)의 「인원 투입 beta」(14-resource-beta.js)를 이 앱으로 옮긴 것이다(지시: TanStack).
 * 서버 자료(/api/resource/manpower)는 **예전과 같은 꼴**로 둔다 — 예전 자료를 그대로 가져올 수 있게:
 *   { columns:[...], pages:{ "2025":{ rows:[...] } }, years:[...], curPage:"2025",
 *     views:[...], curView, betaViews:[...], curBetaView }
 * 이 화면은 beta 쪽 보기(betaViews/curBetaView)를 쓴다. 열·행은 함께 쓴다.
 *
 * 왼쪽 트리(폴더 ▸ 표, 지시: 큰 카테고리)는 efTree 에 둔다. 표마다 열·연도·보기가 따로다.
 * 첫 표(id 'main', 처음 이름 「인원 투입」)는 **문서 맨 위 그대로** — 예전 자료를 그대로 읽고,
 * 서버 백업(맨 위 pages 의 행 수로 판단)도 예전처럼 돈다. 나머지 표는 efTables[id] 에 같은 꼴로 둔다.
 */

export type EfType =
  | 'text' | 'number' | 'select' | 'multiselect' | 'status' | 'date' | 'daterange'
  | 'datediff' | 'person' | 'checkbox' | 'url' | 'email' | 'phone' | 'formula'

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
  /** 남은 일수 열이 볼 기간 열 id — 머리글 › 유형 › 남은 일수 에서 고른다. 없으면 맨 앞 기간 열 */
  diffSrc?: string
  [k: string]: unknown
}
export type EfRow = Record<string, unknown>
export interface EfSortRule { id: string; desc: boolean }
export interface EfFilterRule { id: string; value: unknown }
/** 이 화면의 보기 상태 — 예전 보기(searchQ 등)와 섞이지 않게 ef 에 따로 담는다 */
/** 툴바 필터 조건 한 줄 — 열 · 조건 · 값 (예전 _rscFilters, 모두 만족) */
export interface EfCond { col: string; op: string; v: string }
export interface EfViewState {
  q: string
  filters: EfFilterRule[]
  sorting: EfSortRule[]
  group: string | null
  conds?: EfCond[]
  /** 숨긴 열 id — 보기마다(노션처럼) */
  hidden?: string[]
  /** 바닥줄 계산 — 열 id → 계산(calc.ts 의 CalcKey). 없으면 유형별 자동 */
  calc?: Record<string, string>
  /** 숨긴 그룹(노션 「그룹 숨기기」) — 묶은 열 id → 숨긴 값들('' = 빈값). 그 행은 표·합계에서 빠진다 */
  hiddenGroups?: Record<string, string[]>
}
export interface EfView {
  id: string
  name: string
  type: string
  searchQ?: string
  ef?: EfViewState
  [k: string]: unknown
}
export interface EfNode {
  id: string
  kind: 'folder' | 'table'
  name: string
  /** 부모 폴더 id — null 이면 맨 위 */
  parent: string | null
  /** 폴더가 펼쳐져 있나(기본 펼침) */
  open?: boolean
}
export interface EfTree {
  nodes: EfNode[]
  /** 지금 보는 표 */
  cur: string
}
/** 표 하나 — 열·연도 페이지·보기 */
export interface EfDoc {
  columns: EfColumn[]
  pages: Record<string, { rows: EfRow[] }>
  years?: string[]
  curPage?: string
  betaViews?: EfView[]
  curBetaView?: string
  views?: EfView[]
  curView?: string
  /** 맨 위 문서에만 — 트리와 첫 표 말고의 표들 */
  efTree?: EfTree
  efTables?: Record<string, EfDoc>
  [k: string]: unknown
}

export const MAIN = 'main'

/** 유형 — ic 는 예전 Tabler 아이콘 이름(ti- 뒤), e 는 열 설정 창 고르기 칸(그림을 못 넣는다)의 예전 글자 */
export const TYPES: Array<{ t: EfType; n: string; ic: string; e: string }> = [
  { t: 'text', n: '텍스트', ic: 'align-left', e: '📝' },
  { t: 'number', n: '숫자', ic: 'hash', e: '🔢' },
  { t: 'select', n: '선택', ic: 'circle-chevron-down', e: '🔽' },
  { t: 'multiselect', n: '다중 선택', ic: 'tags', e: '🏷' },
  { t: 'status', n: '상태', ic: 'circle-dot', e: '◉' },
  { t: 'date', n: '날짜', ic: 'calendar', e: '📅' },
  { t: 'daterange', n: '기간', ic: 'calendar-week', e: '🗓' },
  { t: 'datediff', n: '남은 일수', ic: 'clock-hour-4', e: '⏱' },
  { t: 'person', n: '사람', ic: 'user', e: '👤' },
  { t: 'checkbox', n: '체크박스', ic: 'checkbox', e: '☑' },
  { t: 'url', n: 'URL', ic: 'link', e: '🔗' },
  { t: 'email', n: '이메일', ic: 'mail', e: '✉' },
  { t: 'phone', n: '전화번호', ic: 'phone', e: '📞' },
  { t: 'formula', n: '수식', ic: 'math-function', e: 'ƒ' },
]
/** 머리글·메뉴 아이콘 이름 — 합계 열은 Σ(sum) */
export const typeIcon = (c: EfColumn) => (c.autoSum ? 'sum' : TYPES.find((x) => x.t === c.type)?.ic ?? 'align-left')
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

/** 서버에서 받은 것을 이 화면이 쓰는 꼴로 — 첫 표(맨 위)와 트리·다른 표들까지 */
export function normalize(raw: unknown): EfDoc {
  const d = normalizeTable(raw)
  ensureViews(d)
  const tables = d.efTables && typeof d.efTables === 'object' ? d.efTables : {}
  Object.keys(tables).forEach((k) => {
    tables[k] = normalizeTable(tables[k])
    ensureViews(tables[k]!)
  })
  d.efTables = tables
  const t = d.efTree && Array.isArray(d.efTree.nodes) ? d.efTree : { nodes: [], cur: MAIN }
  // 표 노드는 실제 표가 있는 것만, 부모는 있는 폴더만
  const folders = new Set(t.nodes.filter((n) => n.kind === 'folder').map((n) => n.id))
  t.nodes = t.nodes.filter((n) => n.kind === 'folder' || n.id === MAIN || tables[n.id])
  t.nodes.forEach((n) => {
    if (n.parent && !folders.has(n.parent)) n.parent = null
  })
  if (!t.nodes.some((n) => n.id === MAIN)) t.nodes.unshift({ id: MAIN, kind: 'table', name: '인원 투입', parent: null })
  Object.keys(tables).forEach((k) => {
    if (!t.nodes.some((n) => n.id === k)) t.nodes.push({ id: k, kind: 'table', name: '표', parent: null })
  })
  if (!t.nodes.some((n) => n.kind === 'table' && n.id === t.cur)) t.cur = MAIN
  d.efTree = t
  return d
}
/** 표 id → 표 문서(첫 표는 맨 위 문서 자신) */
export const tableOf = (root: EfDoc, id: string): EfDoc => (id === MAIN ? root : (root.efTables?.[id] ?? root))
/** 표의 행 수(지금 연도) */
export const tableRows = (t: EfDoc) => t.pages[t.curPage ?? '']?.rows.length ?? 0
/**
 * 새 표의 열 — 노션 새 데이터베이스처럼 「이름」·「태그」 둘만(지적: 노션은 기본 열이 없다).
 * 인원 투입 틀(defaultColumns)은 원래 표(인원 투입)를 처음 세울 때만 쓴다
 */
export const blankColumns = (): EfColumn[] => [
  { id: 'title', title: '이름', type: 'text' },
  { id: 'tags', title: '태그', type: 'multiselect', options: [] },
]
/** 새 표 — 이름·태그 열(또는 넘긴 열), 올해 페이지, 표 보기 하나 */
export function newTable(cols?: EfColumn[]): EfDoc {
  const d = normalizeTable({ columns: JSON.parse(JSON.stringify(cols ?? blankColumns())) })
  ensureViews(d)
  return d
}

/** 표 하나를 이 화면이 쓰는 꼴로 — 연도 페이지를 보장한다(예전 _rscMP 와 같은 일) */
function normalizeTable(raw: unknown): EfDoc {
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
  migrateCalcCols(d)
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

/** 기본 그룹 — 인원 열(예전과 같다). 원래 표(인원 투입)에서만 쓴다 — 새 표는 노션처럼 묶지 않은 채 시작 */
export function defaultGroup(cols: EfColumn[]): string {
  const c =
    cols.find((x) => x.id === 'name') ||
    cols.find((x) => String(x.title ?? '').trim() === '인원') ||
    cols.find((x) => !isNumCol(x))
  return c ? c.id : ''
}

export const isNumCol = (c: EfColumn | undefined) =>
  !!c && (c.type === 'number' || !!c.autoSum || (c.type === 'formula' && formulaOf(c).fn !== 'if'))
export function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = parseFloat(String(v).replace(/,/g, ''))
  return isNaN(n) ? null : n
}
export const numFmt = (n: number) => String(Math.round(n * 100) / 100)

// ── 유형별 값 ──────────────────────────────────────────────────────
/** 날짜 → 「YYYY-MM-DD」. 2026.1.5 · 2026/01/05 · 20260105 도 받는다. 날짜가 아니면 null */
export function normDate(v: unknown): string | null {
  const t = (v == null ? '' : String(v)).trim()
  const m = /^(\d{4})[-./\s]?(\d{1,2})[-./\s]?(\d{1,2})\.?$/.exec(t)
  if (!m) return null
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3])
  const dt = new Date(y, mo - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
/** 기간 값 「2026-01-05 ~ 2026-02-10」(예전 _rscDateRangeParse 와 같은 규칙: 구분자는 ~, 없으면 「 - 」) */
export function parseRange(v: unknown): { s: string; e: string } {
  if (v == null || v === '') return { s: '', e: '' }
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    return { s: String(o.s ?? o.start ?? '').trim(), e: String(o.e ?? o.end ?? '').trim() }
  }
  const str = String(v)
  const p = str.includes('~') ? str.split('~') : /\s-\s/.test(str) ? str.split(/\s-\s/) : [str]
  return { s: (p[0] ?? '').trim(), e: (p[1] ?? '').trim() }
}
/** 기간 값 다듬기 — 「시작 ~ 종료」. 종료가 앞이면 바꾼다, 하나만 있으면 같은 날. 못 읽으면 null */
export function normRange(v: unknown): string | null {
  const p = parseRange(v)
  if (!p.s && !p.e) return ''
  let s = normDate(p.s || p.e)
  let e = normDate(p.e || p.s)
  if (!s || !e) return null
  if (e < s) [s, e] = [e, s]
  return `${s} ~ ${e}`
}
/** 체크박스 값 — true·1·y·o·v·✓·예 등이면 켜짐 */
export const truthy = (v: unknown) => v === true || /^(true|1|y|yes|o|v|✓|✔|☑|예|네)$/i.test(String(v ?? '').trim())
/** 예전에 행마다 고르던 기준 기간 열이 담기던 숨은 키 — 이제 안 읽는다(열에서 고르면 지운다) */
export const srcKey = (c: EfColumn) => `_src_${c.id}`
/**
 * 남은 일수 열이 볼 기간 열 — 열에서 고른 것(c.diffSrc), 없거나 그 열이 지워졌으면 맨 앞 기간 열.
 * 지시: 셀마다 더블클릭으로 고르던 것을 머리글 › 유형 › 남은 일수 › 기간 열 고르기로 바꿨다
 */
export const diffSrcOf = (cols: EfColumn[], c?: EfColumn) =>
  cols.find((x) => x.id === c?.diffSrc && x.type === 'daterange') ?? cols.find((x) => x.type === 'daterange')
/** 이 행의 남은 일수가 볼 기간 열 — 열마다 하나(행 r 은 예전 호출 모양을 지키려고 받기만 한다) */
export const rowSrcOf = (_r: EfRow, cols: EfColumn[], c: EfColumn) => diffSrcOf(cols, c)
const ymdLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const dayGap = (a: string, b: string) => Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000)
/**
 * 남은 일수 — **오늘부터 종료일까지**(지시: 기간 길이가 아니라 얼마 남았나). 오늘 끝나면 0, 지났으면 음수.
 * 종료일이 없으면 null. today 는 시험용(기본 지금)
 */
export function dayLeft(r: EfRow, src: EfColumn | undefined, today = new Date()): number | null {
  if (!src) return null
  const p = parseRange(r[src.id])
  const e = normDate(p.e || p.s)
  if (!e) return null
  return dayGap(ymdLocal(today), e)
}
/** 기간 길이 — 시작~종료 양끝 포함(예전 _rscHotDateDiff). 남은 일수 칸에 마우스를 올리면 보인다 */
export function dayDiff(r: EfRow, src: EfColumn | undefined): number | null {
  if (!src) return null
  const p = parseRange(r[src.id])
  const s = normDate(p.s)
  const e = normDate(p.e)
  if (!s || !e) return null
  const n = Math.round((new Date(e + 'T00:00:00').getTime() - new Date(s + 'T00:00:00').getTime()) / 86400000) + 1
  return n > 0 ? n : null
}

// ── 수식 칸(지시: 칸을 먼저 고르고 → 우클릭 「수식」 → 결과를 넣을 칸) ──────────────────────
/** 행 이름표 — 수식이 「몇 행」 이 아니라 「그 행」 을 기억하게(정렬·이동해도 따라간다). 숨은 값 */
export const ROW_ID = '_id'
export type FxFn = 'sum' | 'avg' | 'min' | 'max' | 'count'
export const FX_NAME: Record<FxFn, string> = { sum: '합계', avg: '평균', min: '최소', max: '최대', count: '개수' }
export interface CalcRef {
  r: string
  c: string
}
export interface FxSpec {
  fn: FxFn
  refs: CalcRef[]
}
/** 수식이 담기는 행의 숨은 값 — 이 열 칸의 수식 */
export const fxKey = (c: EfColumn) => `_fx_${c.id}`
export function fxOf(r: EfRow, c: EfColumn): FxSpec | null {
  const v = r[fxKey(c)] as FxSpec | undefined
  return v && Array.isArray(v.refs) && FX_NAME[v.fn] ? v : null
}
/** 행 이름표 — 없으면 붙인다 */
export function rowId(r: EfRow): string {
  if (typeof r[ROW_ID] !== 'string' || !r[ROW_ID]) r[ROW_ID] = 'r' + newId().slice(1)
  return r[ROW_ID] as string
}
/** 수식이 볼 수 있는 칸 — 숫자·합계 열 */
export const pickableCol = (c: EfColumn | undefined) => !!c && (c.type === 'number' || !!c.autoSum)
/** 수식을 넣을 수 있는 칸 — 숫자 열(합계 열은 저절로 계산돼서 안 된다) */
export const fxTargetCol = (c: EfColumn | undefined) => !!c && c.type === 'number' && !c.autoSum
/** 행 복제 — 깊은 복사, 이름표는 떼서(같은 이름표가 둘이면 수식이 엉뚱한 행을 본다) */
export function cloneRow(r: EfRow): EfRow {
  const n = JSON.parse(JSON.stringify(r)) as EfRow
  delete n[ROW_ID]
  return n
}
const fxCalc = (fn: FxFn, v: number[]): number | null => {
  if (fn === 'count') return v.length
  if (!v.length) return null
  if (fn === 'sum') return v.reduce((a, b) => a + b, 0)
  if (fn === 'avg') return v.reduce((a, b) => a + b, 0) / v.length
  return fn === 'min' ? Math.min(...v) : Math.max(...v)
}
/**
 * 수식 칸 다시 계산 — 결과를 칸 값으로 둔다(정렬·필터·CSV·차트가 숫자로 쓰게). 지운 행·열은 건너뛴다.
 * 수식이 다른 수식 칸을 볼 수 있어 바뀌지 않을 때까지 몇 번 돈다(돌고 도는 수식은 5번에서 멈춘다)
 */
export function recalcFx(rows: EfRow[], cols: EfColumn[]) {
  const targets = cols.filter(fxTargetCol)
  const has = rows.some((r) => targets.some((c) => r[fxKey(c)]))
  if (!has) return
  const byId = new Map<string, EfRow>()
  rows.forEach((r) => typeof r[ROW_ID] === 'string' && byId.set(r[ROW_ID] as string, r))
  const colBy = new Map(cols.map((c) => [c.id, c]))
  for (let pass = 0; pass < 5; pass++) {
    let changed = false
    rows.forEach((r) =>
      targets.forEach((c) => {
        const fx = fxOf(r, c)
        if (!fx) return
        const vals: number[] = []
        fx.refs.forEach((x) => {
          const rr = byId.get(x.r)
          const n = rr && pickableCol(colBy.get(x.c)) ? toNum(rr[x.c]) : null
          if (n !== null) vals.push(n)
        })
        const v = fxCalc(fx.fn, vals)
        const nv = v === null ? undefined : Math.round(v * 1e6) / 1e6
        if (r[c.id] !== nv) {
          if (nv === undefined) delete r[c.id]
          else r[c.id] = nv
          changed = true
        }
      }),
    )
    if (!changed) break
  }
}
/** 예전 「계산」 유형 열 → 숫자 열 + 합계 수식(지시: 유형 대신 수식으로 바꿨다) */
function migrateCalcCols(d: EfDoc) {
  d.columns.forEach((c) => {
    if ((c.type as string) !== 'calc') return
    c.type = 'number'
    const old = `_calc_${c.id}`
    Object.values(d.pages).forEach((p) =>
      p.rows.forEach((r) => {
        if (Array.isArray(r[old])) r[fxKey(c)] = { fn: 'sum', refs: r[old] }
        delete r[old]
      }),
    )
  })
}

// ── 수식 열(지시: 노션처럼 열 전체에 같은 식, 글 대신 골라서) ─────────────────────
export type FormulaFn = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'sub' | 'mul' | 'div' | 'if'
export type FormulaOp = '>' | '>=' | '<' | '<=' | '=' | '!='
export interface FormulaSpec {
  fn: FormulaFn
  /** 대상 열 — 체크한 차례(빼기·나누기는 이 차례로) */
  cols: string[]
  /** 조건일 때 — [열] [비교] [값] 이면 참 글자, 아니면 거짓 글자 */
  cond?: { col: string; op: FormulaOp; v: number; t: string; f: string }
}
export const FORMULA_FNS: Array<{ k: FormulaFn; n: string; tip: string }> = [
  { k: 'sum', n: '합계', tip: '고른 열을 더한다' },
  { k: 'avg', n: '평균', tip: '값이 있는 칸의 평균' },
  { k: 'min', n: '최소', tip: '가장 작은 값' },
  { k: 'max', n: '최대', tip: '가장 큰 값' },
  { k: 'count', n: '개수', tip: '값이 있는 칸 수' },
  { k: 'sub', n: '빼기', tip: '첫 열 − 나머지(체크한 차례)' },
  { k: 'mul', n: '곱하기', tip: '고른 열을 곱한다' },
  { k: 'div', n: '나누기', tip: '첫 열 ÷ 나머지(체크한 차례)' },
  { k: 'if', n: '조건', tip: '조건이 맞으면 참 글자, 아니면 거짓 글자' },
]
export const FORMULA_OPS: FormulaOp[] = ['>', '>=', '<', '<=', '=', '!=']
const OP_TXT: Record<FormulaOp, string> = { '>': '>', '>=': '≥', '<': '<', '<=': '≤', '=': '=', '!=': '≠' }
export function formulaOf(c: EfColumn): FormulaSpec {
  const f = c.formula as Partial<FormulaSpec> | undefined
  return { fn: f?.fn && FORMULA_FNS.some((x) => x.k === f.fn) ? f.fn : 'sum', cols: Array.isArray(f?.cols) ? f.cols : [], cond: f?.cond }
}
/** 수식이 볼 수 있는 열 — 숫자·합계 열(수식 열끼리는 안 엮는다) */
export const formulaSrcCols = (cols: EfColumn[], self?: EfColumn) =>
  cols.filter((c) => c.id !== self?.id && (c.type === 'number' || !!c.autoSum))
/** 한 행의 결과 — 숫자(조건이면 글자), 계산할 값이 없으면 null */
export function calcFormula(r: EfRow, f: FormulaSpec, cols: EfColumn[]): number | string | null {
  const ok = new Set(formulaSrcCols(cols).map((c) => c.id))
  if (f.fn === 'if') {
    const k = f.cond
    if (!k || !ok.has(k.col)) return null
    const v = toNum(r[k.col]) ?? 0
    const hit = k.op === '>' ? v > k.v : k.op === '>=' ? v >= k.v : k.op === '<' ? v < k.v : k.op === '<=' ? v <= k.v : k.op === '=' ? v === k.v : v !== k.v
    return (hit ? k.t : k.f) || null
  }
  const ids = f.cols.filter((id) => ok.has(id))
  if (!ids.length) return null
  const vals = ids.map((id) => toNum(r[id]))
  const got = vals.filter((n): n is number => n !== null)
  let out: number | null
  if (f.fn === 'count') out = got.length
  else if (!got.length) out = null
  else if (f.fn === 'sum') out = got.reduce((a, b) => a + b, 0)
  else if (f.fn === 'avg') out = got.reduce((a, b) => a + b, 0) / got.length
  else if (f.fn === 'min') out = Math.min(...got)
  else if (f.fn === 'max') out = Math.max(...got)
  else if (f.fn === 'mul') out = got.reduce((a, b) => a * b, 1)
  else {
    // 빼기·나누기 — 체크한 차례 그대로, 빈 칸은 0(나누기에서 0 으로 나누면 비움)
    const seq = vals.map((n) => n ?? 0)
    out = seq.slice(1).reduce<number | null>((a, b) => (a === null ? null : f.fn === 'sub' ? a - b : b === 0 ? null : a / b), seq[0]!)
  }
  return out === null ? null : Math.round(out * 1e6) / 1e6
}
/** 머리글·설명용 식 글자 — 「01월 + 02월 + 03월」 */
export function formulaText(f: FormulaSpec, cols: EfColumn[]): string {
  const t = (id: string) => cols.find((c) => c.id === id)?.title ?? '(지운 열)'
  if (f.fn === 'if') return f.cond ? `${t(f.cond.col)} ${OP_TXT[f.cond.op]} ${f.cond.v} ? 「${f.cond.t}」 : 「${f.cond.f}」` : '조건 없음'
  if (!f.cols.length) return '대상 열 없음'
  const names = f.cols.map(t)
  if (f.fn === 'sum') return names.join(' + ')
  if (f.fn === 'sub') return names.join(' − ')
  if (f.fn === 'mul') return names.join(' × ')
  if (f.fn === 'div') return names.join(' ÷ ')
  return `${FORMULA_FNS.find((x) => x.k === f.fn)!.n}(${names.join(', ')})`
}
/** 수식 열 다시 계산 — 결과를 칸 값으로 둔다(정렬·필터·CSV·차트가 쓰게) */
export function recalcFormula(rows: EfRow[], cols: EfColumn[]) {
  const fs = cols.filter((c) => c.type === 'formula')
  if (!fs.length) return
  fs.forEach((c) => {
    const f = formulaOf(c)
    rows.forEach((r) => {
      const v = calcFormula(r, f, cols)
      if (v === null) delete r[c.id]
      else r[c.id] = v
    })
  })
}

/** 합계 열(autoSum) 다시 계산 — 숫자 열(합계 열 빼고)을 더해 행마다 넣는다 */
export function recalcAuto(rows: EfRow[], cols: EfColumn[]) {
  recalcFx(rows, cols) // 수식 칸 먼저(월 열에 든 수식이 합계에 들어가게)
  recalcFormula(rows, cols)
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
  recalcFx(rows, cols) // 합계를 보는 수식 칸도 다시
  recalcFormula(rows, cols) // 합계를 보는 수식 열도
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
/**
 * 고르기 목록 — 정해 둔 옵션 + 표에만 쓰인 값(뒤에, 이름 순).
 * 다중 선택은 칸 값을 쉼표로 나눠 낱개로 센다(지적: 「q, w」 「e, r」 가 옵션 하나처럼 목록에 나왔다)
 */
export function optionsOf(rows: EfRow[], c: EfColumn): string[] {
  const have = (c.options ?? []).filter((o) => o !== '' && o != null)
  const extra = new Set<string>()
  rows.forEach((r) => {
    const v = r[c.id] == null ? '' : String(r[c.id]).trim()
    if (!v) return
    const parts = c.type === 'multiselect' ? v.split(',').map((x) => x.trim()).filter(Boolean) : [v]
    parts.forEach((x) => !have.includes(x) && extra.add(x))
  })
  return [...have, ...[...extra].sort(natural)]
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
// 예전 _RSC_PAL 그대로 — 같은 값이면 예전 화면과 같은 색이 나온다
export const AUTO = ['#2d6fd4', '#00a872', '#7c5cff', '#c9923e', '#e53e5a', '#0ea5e9', '#ec4899', '#14b8a6', '#f59e0b', '#64748b', '#0a9b5a', '#d12d4a']
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
/** 칩 색 — 늘 옅은 바탕+그 색 글자, 밝은 색은 글자만 같은 계열로 진하게 */
export function chipStyle(hex: string): { background: string; color: string } {
  // 늘 옅은 바탕(그 색 13%) — 예전 _rscTagHtml 과 같다. 색이 밝을수록 칩도 연하다(지적: 밝기 0.72 를 넘으면
  // 꽉 찬 바탕으로 바꾸던 탓에 색판 5번째 칸이 4번째보다 진해 보였다). 밝은 색은 글자만 같은 계열로 진하게 — 읽히게
  const c = String(hex || '')
  const hsl = hex2hsl(c)
  if (!hsl || hsl.l <= 0.6) return { background: c + '22', color: c }
  const fg = hsl.s < 0.06 ? '#374151' : hsl2hex(hsl.h, Math.max(hsl.s, 0.45), 0.32)
  return { background: c.toLowerCase() === '#ffffff' ? '#f3f4f6' : c + '22', color: fg }
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

/** 열 너비 — 머리글 12px · 내용 11px 기준으로 다시 잼(지시): 머리글이 안 잘리고 내용 9할이 다 보이는 폭.
 *  월 열은 머리글(# 01월)이 58 에서 잘려 64. 이 화면에서 끌어 바꾼 너비는 efWidth 에 둔다(그게 우선) */
const SIZE: Record<string, number> = {
  부서: 78, 인원: 64, 직급: 62, 사업자: 74, '제품명(프로젝트)': 128, '업무분류(대분류)': 200, 합계: 64,
}
const NUM_W = 64
/** 유형별 기본 폭 — 기간은 「2026-01-05 ~ 02-10」 이 다 보이게 */
const TYPE_W: Partial<Record<EfType, number>> = { date: 96, daterange: 176, datediff: 120, checkbox: 52, url: 150, email: 150, phone: 116 }
export const colSize = (c: EfColumn) =>
  (typeof c.efWidth === 'number' && c.efWidth > 0 ? c.efWidth : 0) ||
  (SIZE[String(c.title ?? '').trim()] ?? (isNumCol(c) ? NUM_W : c.width || TYPE_W[c.type] || 96))

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

// ── 툴바 조건식 필터 — 예전 _RSC_FOPS·_rscMatch 그대로 ─────────────────
export const FOPS: Array<[string, string]> = [
  ['eq', '같음'], ['neq', '다름'], ['contains', '포함'], ['ncontains', '미포함'], ['gt', '초과'],
  ['lt', '미만'], ['gte', '이상'], ['lte', '이하'], ['empty', '비어있음'], ['notempty', '안비어있음'],
]
/** 앞 판에서 저장한 조건 이름 → 예전 이름 */
const OLD_OP: Record<string, string> = { has: 'contains', nhas: 'ncontains', ne: 'neq', ge: 'gte', le: 'lte', nempty: 'notempty' }
export const normOp = (op: string) => OLD_OP[op] ?? op
/** 열 유형과 상관없이 같은 조건 목록(예전과 같다) */
export const condOps = (_c?: EfColumn): Array<[string, string]> => FOPS
export const condNeedsValue = (op: string) => normOp(op) !== 'empty' && normOp(op) !== 'notempty'
/** 행이 조건 하나를 만족하나 — 값이 빈 조건은 거르지 않는다(남은 조건 때문에 0행이 되지 않게) */
export function condMatch(r: EfRow, f: EfCond, _c?: EfColumn): boolean {
  if (!f || !f.col) return true
  const v = r[f.col]
  const vs = v == null ? '' : String(v)
  const fv = f.v == null ? '' : String(f.v)
  const op = normOp(f.op)
  if (op !== 'empty' && op !== 'notempty' && fv.trim() === '') return true
  switch (op) {
    case 'eq': return vs === fv
    case 'neq': return vs !== fv
    case 'contains': return vs.toLowerCase().includes(fv.toLowerCase())
    case 'ncontains': return !vs.toLowerCase().includes(fv.toLowerCase())
    case 'empty': return vs.trim() === ''
    case 'notempty': return vs.trim() !== ''
    case 'gt': return parseFloat(vs) > parseFloat(fv)
    case 'lt': return parseFloat(vs) < parseFloat(fv)
    case 'gte': return parseFloat(vs) >= parseFloat(fv)
    case 'lte': return parseFloat(vs) <= parseFloat(fv)
    default: return vs === fv
  }
}
/** 옵션 칩 입력칸 너비(글자 칸 수) — 한글은 두 칸으로 센다(예전 _rscBetaChipSize) */
export const chipSize = (v: string) => Math.max(2, [...String(v)].reduce((a, ch) => a + (ch.charCodeAt(0) > 255 ? 2 : 1), 0) + 1)

// ── 하단 통계 줄 — 숫자 열(합계) 말고 유형마다 그 열에 맞는 값 하나(지시: 입력됨 말고 열에 맞는 통계) ──
export interface FootStat {
  lbl: string
  val: string
  /** 마우스를 올리면 보일 자세한 값(상위 3개 분포 · 전체 날짜) */
  tip?: string
  /** 좁은 열에서 이름표·값 대신 보일 짧은 글(최다 → 그 값만) */
  short?: string
}
/** 값별 개수 — 많은 순, 같으면 이름 순 */
function tally(vals: string[]): Array<[string, number]> {
  const m = new Map<string, number>()
  vals.forEach((v) => m.set(v, (m.get(v) ?? 0) + 1))
  return [...m].sort((a, b) => b[1] - a[1] || natural(a[0], b[0]))
}
const top3 = (t: Array<[string, number]>) => t.slice(0, 3).map(([v, n]) => `${v} ${n}`).join(' · ')
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)
/** 날짜 범위 — 모두 같은 해면 MM-DD, 아니면 YY-MM-DD */
function dateSpan(ds: string[]): FootStat | null {
  if (!ds.length) return null
  const s = [...ds].sort()
  const a = s[0]!
  const b = s[s.length - 1]!
  const short = (d: string) => (a.slice(0, 4) === b.slice(0, 4) ? d.slice(5) : d.slice(2))
  return { lbl: '범위', val: a === b ? short(a) : `${short(a)} ~ ${short(b)}`, tip: `${a} ~ ${b}` }
}
export function footStat(c: EfColumn, rows: EfRow[], cols: EfColumn[], today = new Date()): FootStat {
  const txt = (r: EfRow) => (r[c.id] == null ? '' : String(r[c.id]).trim())
  const vals = rows.map(txt).filter(Boolean)
  const filled: FootStat = { lbl: '입력됨', val: String(vals.length) }
  const most = (vs: string[]): FootStat => {
    const t = tally(vs)
    return t.length ? { lbl: '최다', val: `${t[0]![0]} ${t[0]![1]}`, tip: top3(t), short: t[0]![0] } : { lbl: '최다', val: '—' }
  }
  // 인원 — 사람 유형이거나 이름이 「인원」인 글 열(열 id 로 정하지 않는다)
  if (c.type === 'person' || (c.type === 'text' && c.title.trim() === '인원')) {
    const t = tally(vals)
    return { lbl: '인원', val: String(t.length), tip: top3(t) || undefined }
  }
  switch (c.type) {
    case 'text': {
      const t = tally(vals)
      return { lbl: '종류', val: String(t.length), tip: top3(t) || undefined }
    }
    case 'select':
      return most(vals)
    case 'multiselect':
      return most(vals.flatMap((v) => v.split(',').map((x) => x.trim()).filter(Boolean)))
    case 'status': {
      // 옵션 맨 끝 단계를 「완료」로 본다(지시) — 옵션이 없으면 선택처럼 최다
      const last = c.options?.[c.options.length - 1]
      if (!last) return most(vals)
      const done = vals.filter((v) => v === last).length
      return { lbl: last, val: `${done}/${rows.length} (${pct(done, rows.length)}%)`, tip: top3(tally(vals)) || undefined }
    }
    case 'checkbox': {
      const n = rows.filter((r) => truthy(r[c.id])).length
      return { lbl: '체크', val: `${n}/${rows.length} (${pct(n, rows.length)}%)` }
    }
    case 'date':
      return dateSpan(rows.map((r) => normDate(r[c.id])).filter((d): d is string => !!d)) ?? { lbl: '범위', val: '—' }
    case 'daterange': {
      const ds: string[] = []
      rows.forEach((r) => {
        const p = parseRange(r[c.id])
        const s = normDate(p.s)
        const e = normDate(p.e || p.s)
        if (s) ds.push(s)
        if (e) ds.push(e)
      })
      return dateSpan(ds) ?? { lbl: '범위', val: '—' }
    }
    case 'datediff': {
      const ds = rows.map((r) => dayLeft(r, rowSrcOf(r, cols, c), today)).filter((d): d is number => d != null)
      if (!ds.length) return { lbl: '최소', val: '—' }
      const m = Math.min(...ds)
      return { lbl: '최소', val: m < 0 ? `${-m}일 지남` : `${m}일` }
    }
    default:
      return filled
  }
}
