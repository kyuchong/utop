import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  getCoreRowModel,
  getExpandedRowModel,
  getFacetedMinMaxValues,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getGroupedRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnSizingState,
  type ExpandedState,
  type FilterFn,
  type Row,
  type Table,
} from '@tanstack/react-table'
import { copyText } from '@/lib/copy'
import { PeoplePick } from '@/components/AssigneePicker'
import { useMeName } from '@/components/ntable/useAdmin'
import { useUserPeople } from '@/pages/qaBits'
import { CalcMenu, Chip, CtxMenu, DatePicker, FormulaEditor, HeadMenu, MultiPicker, RangePicker, SelectPicker, type HeadOps } from './EffortMenus'
import { TI } from './icons'
import { CALC_MENU, calc, calcMenuFor, calcOf, defaultCalc, type CalcKey } from './calc'
import { placeRow } from './EffortViews'
import {
  autoOptions,
  autoColor,
  FX_NAME,
  formulaOf,
  formulaText,
  fxKey,
  fxOf,
  fxTargetCol,
  type FxFn,
  cloneRow,
  pickableCol,
  rowId,
  ROW_ID,
  colSize,
  condMatch,
  dayDiff,
  dayLeft,
  defaultGroup,
  rowSrcOf,
  srcKey,
  hasOptions,
  isNumCol,
  natural,
  newId,
  normDate,
  filterSeed,
  optionsOf,
  normRange,
  numFmt,
  parseRange,
  recalcAuto,
  toNum,
  truthy,
  typeIcon,
  type EfColumn,
  type EfDoc,
  type EfRow,
  type EfType,
  type EfViewState,
} from './model'

/**
 * Effort Plan 표 — TanStack Table(헤드리스) 위에 표 DOM 을 직접 그린다.
 * 예전 14-resource-beta.js 의 App 을 옮겼다: 그룹(기본 인원)·소계·하단 합계·막대 숫자·칩,
 * 두 번 클릭 수정, 범위 선택·채우기 핸들, 열 끌어 옮기기·너비, 머리글 메뉴, 행 우클릭 삭제.
 *
 * 표에 넘기는 data 는 **실제 행 객체**다(서버 문서의 pages[연도].rows). 고친 값은 그 객체에
 * 바로 쓰고, 다시 그릴 때는 새 배열을 넘긴다 — TanStack 은 data 참조가 같으면 다시 계산하지 않는다.
 */

export interface EfCtx {
  doc: EfDoc
  rows: EfRow[]
  cols: EfColumn[]
  st: EfViewState
  /** 보기 상태를 바꾼다(저장까지) */
  setSt: (p: Partial<EfViewState>) => void
  /** 문서를 고쳤다 — 저장하고 다시 그린다 */
  touch: () => void
  toast: (m: string) => void
  ver: number
  /**
   * 다른 화면이 이 표를 빌려 쓸 때(Jira Issue) — 행을 늘리거나 지우거나 옮기지 않는다, 열 유형·이름·추가·삭제도 없다.
   * 칸 값은 열마다 readOnly 로 막고, 고칠 수 있는 열만 onPut 으로 바깥에 알린다
   */
  lock?: boolean
  /** link 열을 누르면(또는 그 칸에서 Enter) — 그 행을 연다 */
  onOpen?: (r: EfRow) => void
  /** 칸 하나를 고쳤다(put 이 실제로 바꾼 뒤) — prev 는 고치기 전 값(바깥 저장이 실패하면 되돌린다) */
  onPut?: (r: EfRow, c: EfColumn, v: unknown, prev?: unknown) => void
  /** 체크한 행이 바뀌었다 */
  onCheck?: (rs: EfRow[]) => void
  /** 잠근 표에서도 고른 행을 지우게 한다(Jira — 받아 둔 복사본만 지운다). 지우는 일은 바깥이 한다 */
  onDelete?: (rs: EfRow[]) => void
  /** 한 번에 그릴 행 수 — 많으면 「더 보기」(수천 행을 다 그리면 무겁다). 없으면 전부 */
  pageSize?: number
  /** 칸을 빌려 쓰는 화면이 직접 그린다(Defects: 지라 이슈 링크·지라 상태 칩). undefined 면 표가 그린다 */
  renderCell?: (r: EfRow, c: EfColumn) => ReactNode | undefined
  /** 잠근 표의 선택 줄 단추(REQ-Coverage: 복제·일괄 편집·엑셀·삭제) — 누르면 onBulk(열쇠, 고른 행). danger 는 해제 오른쪽 */
  bulk?: Array<{ k: string; label: string; danger?: boolean }>
  onBulk?: (k: string, rs: EfRow[]) => void
  /** 잠근 표의 「+ 새로 만들기」 — 빈 행 대신 바깥(작성 창)이 연다 */
  onNew?: () => void
  /** 검색·필터를 지나 보이는 행이 바뀌었다(차례대로) — 바깥 「내보내기」 가 쓴다 */
  onShown?: (rs: EfRow[]) => void
  /** 잠근 표에서 열 정의를 고치게 한다 — 고를 수 있는 유형 · 열 추가(왼쪽/오른쪽). 열마다 무엇을 고치는지는 EfColumn.defs */
  defs?: { types: EfType[]; add: boolean }
  /** 행 줄에 붙일 클래스(Cycles: 돌고 있는 사이클 줄을 두드러지게) */
  rowClass?: (r: EfRow) => string
  /**
   * 잠근 표에서도 행을 끌어 차례를 바꾼다(Cycles: 시험 차례) — 표는 행을 옮기지 않고 새 차례(행 전부)를 바깥에 넘긴다.
   * key 열로 오름차순 정렬돼 있을 때도 끌 수 있다(그 열이 곧 차례)
   */
  reorder?: { key?: string; on: (rs: EfRow[]) => void }
  /** 처음 고른 행(__id) — 다른 화면에 다녀와 표가 다시 서도 고른 것을 되살린다 */
  initChecked?: string[]
  /** 선택 줄에 단추·건수를 세우지 않는다 — 바깥 도구 줄이 「N개 선택」 과 일을 맡는다 */
  hideBulk?: boolean
}

const cellText = (v: unknown) => (v == null ? '' : String(v))
/** 남은 일수 칸은 계산 값 — 기준 기간 열은 열마다 머리글에서 고른다 */
const DIFF_HINT = '기준 기간 열은 머리글 › 유형 › 남은 일수 › 기간 열에서 고릅니다'

const fNum: FilterFn<EfRow> = (row, id, fv) => {
  const [lo, hi] = (fv as [number?, number?] | undefined) ?? []
  const v = row.getValue<number | undefined>(id)
  if (lo == null && hi == null) return true
  if (v == null) return false
  return (lo == null || v >= lo) && (hi == null || v <= hi)
}
const fPick: FilterFn<EfRow> = (row, id, fv) => {
  const want = (fv as string[] | undefined) ?? []
  if (!want.length) return true
  return want.includes(String(row.getValue(id) ?? ''))
}
const fMulti: FilterFn<EfRow> = (row, id, fv) => {
  const want = (fv as string[] | undefined) ?? []
  if (!want.length) return true
  const parts = String(row.getValue(id) ?? '').split(',').map((x) => x.trim())
  return want.some((w) => parts.includes(w))
}
const fText: FilterFn<EfRow> = (row, id, fv) => {
  const q = String(fv ?? '').trim().toLowerCase()
  return !q || String(row.getValue(id) ?? '').toLowerCase().includes(q)
}

/** 표 인스턴스 — 툴바(필터·정렬·그룹·CSV)와 그리드가 함께 쓴다 */
export function useEfTable(ctx: EfCtx) {
  const { rows, cols, st, setSt, ver } = ctx
  const [expanded, setExpanded] = useState<ExpandedState>(true)
  const [sizing, setSizing] = useState<ColumnSizingState>({})

  // null = 아직 안 고름 → 원래 표(인원 투입)만 기본 인원 열, 새 표는 묶지 않는다(지적: 노션은 기본 그룹이 없다). '' = 그룹 없음
  const isMain = !!ctx.doc.efTree
  const g0 = st.group === null ? (isMain ? defaultGroup(cols) : '') : st.group
  // 숨긴 그룹(지시: 그룹 숨기기) — 지금 묶은 열에서 숨긴 값들. 묶음을 풀면 다시 다 보인다
  const hidG = (g0 && st.hiddenGroups?.[g0]) || []
  const hidGKey = hidG.join('\u0001')

  /**
   * 방금 만든 행 — 필터·검색에 안 맞아도 보이게 둔다(노션처럼, 지적: 새로 만들기 행이 필터 때문에 안 보였다).
   * 검색·필터를 바꾸면 비운다(그때부터는 조건대로)
   */
  const fresh = useRef(new WeakSet<EfRow>())
  const filterKey = JSON.stringify([st.q, st.conds ?? [], st.filters])
  const lastFilterKey = useRef(filterKey)
  if (lastFilterKey.current !== filterKey) {
    lastFilterKey.current = filterKey
    fresh.current = new WeakSet()
  }
  const markFresh = (r: EfRow) => fresh.current.add(r)
  const keep = (fn: FilterFn<EfRow>): FilterFn<EfRow> => (row, id, fv, add) => fresh.current.has(row.original) || fn(row, id, fv, add)

  // 검색과 툴바 조건식 필터·숨긴 그룹은 표에 넘기기 전에 거른다(예전 _rscViewRows 와 같다) — 머리글 필터는 TanStack 이 거른다
  const data = useMemo(() => {
    const q = st.q.trim().toLowerCase()
    const conds = (st.conds ?? []).filter((f) => cols.some((c) => c.id === f.col))
    if (!q && !conds.length && !hidG.length) return [...rows]
    const byId = new Map(cols.map((c) => [c.id, c]))
    const hid = new Set(hidG)
    return rows.filter(
      (r) =>
        fresh.current.has(r) ||
        (!hid.size || !hid.has(cellText(r[g0!]))) &&
        (!q || cols.some((c) => cellText(r[c.id]).toLowerCase().includes(q))) &&
        conds.every((f) => condMatch(r, f, byId.get(f.col))),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, st.q, st.conds, ver, g0, hidGKey])

  /**
   * 숫자 막대의 「가득」 — 값 크기 그대로 보이게(지적: 열 최대값 기준이면 0.1 도 꽉 찼다).
   * 월 열은 1(한 사람 한 달), 합계 열은 월 열 수(1년 꽉 채움). 넘으면 꽉 찬 주황.
   */
  const max = useMemo(() => {
    const m: Record<string, number> = {}
    const months = cols.filter((c) => c.type === 'number' && !c.autoSum).length
    cols.forEach((c) => {
      if (isNumCol(c)) m[c.id] = c.autoSum ? Math.max(1, months) : 1
    })
    return m
  }, [cols])

  const columns = useMemo<ColumnDef<EfRow>[]>(
    () =>
      cols.map((c) => {
        const diff = c.type === 'datediff'
        const num = isNumCol(c) || diff
        return {
          id: c.id,
          // 기간 일수는 저장하지 않고 같은 행의 기간에서 센다(예전과 같다) · 체크박스는 켜짐만 값으로
          accessorFn: (r: EfRow) =>
            diff
              ? (dayLeft(r, rowSrcOf(r, cols, c)) ?? undefined)
              : c.type === 'checkbox'
                ? truthy(r[c.id]) ? '✓' : undefined
                : num
                  ? (toNum(r[c.id]) ?? undefined)
                  : cellText(r[c.id]) || undefined,
          getGroupingValue: (r: EfRow) => cellText(r[c.id]),
          header: c.title,
          size: colSize(c),
          minSize: 36,
          meta: { col: c },
          sortUndefined: 'last' as const,
          sortingFn: num ? 'basic' : (a: Row<EfRow>, b: Row<EfRow>, id: string) => natural(cellText(a.getValue(id)), cellText(b.getValue(id))),
          filterFn: keep(num ? fNum : c.type === 'multiselect' ? fMulti : hasOptions(c.type) ? fPick : fText),
          aggregationFn: num && !diff ? 'sum' : undefined,
          enableGrouping: !num,
        } satisfies ColumnDef<EfRow>
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cols, ver],
  )

  // ★ 표에 넘기는 상태 배열은 참조가 그대로여야 한다 — 그릴 때마다 새 배열을 주면 TanStack 이
  //   행 모델을 매번 다시 만들고, 그때마다 내부 상태를 되돌려(setState) 끝없이 다시 그린다(실제로 멈췄다)
  const idKey = cols.map((c) => c.id).join('|')
  const sorting = useMemo(() => st.sorting.filter((s) => idKey.split('|').includes(s.id)), [st.sorting, idKey])
  const columnFilters = useMemo(() => st.filters.filter((f) => idKey.split('|').includes(f.id)), [st.filters, idKey])
  const grouping = useMemo(() => (g0 && idKey.split('|').includes(g0) ? [g0] : []), [g0, idKey])
  // 숨긴 열(지시: 머리글 → 열 숨기기) — 보기마다
  const hiddenKey = (st.hidden ?? []).join('|')
  const columnVisibility = useMemo(() => Object.fromEntries((st.hidden ?? []).map((id) => [id, false])), [hiddenKey])
  const table = useReactTable<EfRow>({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      grouping,
      expanded,
      columnSizing: sizing,
      columnVisibility,
    },
    onSortingChange: (u) => setSt({ sorting: typeof u === 'function' ? u(st.sorting) : u }),
    onColumnFiltersChange: (u) => setSt({ filters: typeof u === 'function' ? u(st.filters) : u }),
    onGroupingChange: (u) => {
      const g = typeof u === 'function' ? u(grouping) : u
      setSt({ group: g[0] ?? '' })
    },
    onExpandedChange: setExpanded,
    onColumnSizingChange: setSizing,
    columnResizeMode: 'onChange',
    autoResetAll: false, // 쪽 나누기·펼침을 저절로 되돌리지 않는다(되돌리면 setState → 다시 그리기)
    enableMultiSort: true,
    isMultiSortEvent: () => false,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getFacetedMinMaxValues: getFacetedMinMaxValues(),
  })
  return { table, max, sizing, setSizing, markFresh }
}
export type EfTableApi = ReturnType<typeof useEfTable>

/** 지금 보이는 순서대로의 실제 행(접힌 그룹 안까지) — CSV 가 쓴다 */
export function leafRows(table: Table<EfRow>): EfRow[] {
  const out: EfRow[] = []
  const walk = (rs: Row<EfRow>[]) =>
    rs.forEach((r) => {
      if (r.getIsGrouped()) walk(r.subRows)
      else out.push(r.original)
    })
  walk(table.getSortedRowModel().rows)
  return out
}

/** 선택 칸의 옵션 — model.optionsOf(페이지·필터에서도 이 이름으로 쓴다) */
export { optionsOf }

interface Sel {
  r1: number
  c1: number
  r2: number
  c2: number
}
const norm = (s: Sel | null) =>
  s && { r1: Math.min(s.r1, s.r2), r2: Math.max(s.r1, s.r2), c1: Math.min(s.c1, s.c2), c2: Math.max(s.c1, s.c2) }

let draggedAt = 0 // 끌고 나서 바로 뒤따라오는 click(= 메뉴 열기)을 눌러 두려고

export function EfGrid({ ctx, api }: { ctx: EfCtx; api: EfTableApi }) {
  const { rows, cols, doc, touch, toast } = ctx
  const lock = !!ctx.lock
  /** 줄을 표 폭 끝까지 채운다 — 빌려 쓰는 표(예전 노션식 표가 그랬다). Effort Plan 은 열 폭 그대로 */
  const fill = lock
  /** 그릴 행 수(더 보기로 늘린다) — 표가 바뀌면(행 배열이 달라지면) 처음 수로 */
  const [limit, setLimit] = useState(ctx.pageSize ?? Infinity)
  const { table, max, sizing, setSizing, markFresh } = api
  /** 새 행 준비 — 지금 필터를 만족하는 값을 채우고(base 값이 먼저), 필터에 걸려도 보이게 표시 */
  const seedNew = (base: EfRow): EfRow => {
    const nr: EfRow = { ...filterSeed((ctx.st.conds ?? []).filter((f) => cols.some((c) => c.id === f.col)), table.getState().columnFilters), ...base }
    markFresh(nr)
    return nr
  }
  /** init = 칸을 고른 채 글자를 쳐서 시작했을 때 그 글자(엑셀처럼 기존 값을 바꿔 쓴다) */
  const [edit, setEdit] = useState<{ src: EfRow; col: EfColumn; anchor: HTMLElement; init?: string } | null>(null)
  const [sel, setSel] = useState<Sel | null>(null)
  const [menu, setMenu] = useState<{ anchor: HTMLElement; colId: string } | null>(null)
  const [rowMenu, setRowMenu] = useState<{ x: number; y: number; src: EfRow; c?: number } | null>(null)
  /** 그룹 머리 「⋯」·우클릭 메뉴 — v 는 그 그룹 값('' = 빈값) */
  const [groupMenu, setGroupMenu] = useState<{ x: number; y: number; v: string } | null>(null)
  /** 바닥줄 계산 고르기 — 누른 칸 위치 */
  const [calcMenu, setCalcMenu] = useState<{ x: number; top: number; bottom: number; colId: string } | null>(null)
  /** 수식 설정 창 — 수식 열(지시: 노션처럼 열 전체에 같은 식) */
  const [formulaEd, setFormulaEd] = useState<{ colId: string; anchor: HTMLElement } | null>(null)
  const openFormula = (c: EfColumn, at?: HTMLElement) => {
    const a = at ?? tblRef.current?.querySelector<HTMLElement>(`th[data-col="${c.id}"]`)
    if (a) setFormulaEd({ colId: c.id, anchor: a })
  }
  /** 체크한 행(예전 _rscSelSet) — 행 객체로 들고 있다. 연도·표가 바뀌면(rows 가 다른 배열) 비운다 */
  /**
   * 수식(지시: 칸 먼저 → 우클릭 「수식」 → 결과 칸) — 고른 칸들과 함수를 들고 「결과를 넣을 칸」 을 기다리는 상태.
   * 칸 하나를 누르면 끝난다(Esc·취소로도). 이 동안만 그 누름이 칸 고르기 대신 결과 칸 지정이 된다
   */
  const [fx, setFx] = useState<{ fn: FxFn; cells: Array<{ row: EfRow; col: string }> } | null>(null)
  const fxRef = useRef(fx)
  fxRef.current = fx
  const [checked, setChecked] = useState<Set<EfRow>>(() => {
    const want = new Set(ctx.initChecked ?? [])
    return new Set(want.size ? rows.filter((r) => want.has(String(r.__id ?? ''))) : [])
  })
  const [ckOf, setCkOf] = useState(rows)
  if (ckOf !== rows) {
    setCkOf(rows)
    // 빌려 쓰는 표는 바깥이 자료를 다시 받으면 행을 새로 만든다 — 같은 __id 면 고른 것을 이어 받는다
    // (Cycles: 고른 항목만 돌린다 — 조용히 풀리면 도구 줄 「N개 선택」 과 표가 어긋난다)
    if (lock && checked.size) {
      const ids = new Set([...checked].map((r) => String(r.__id ?? '')))
      setChecked(new Set(rows.filter((r) => ids.has(String(r.__id ?? '')))))
    } else {
      setChecked(new Set())
      setLimit(ctx.pageSize ?? Infinity) // 다른 행 묶음(프로젝트·연도)이면 그릴 수도 처음부터
    }
  }
  // 체크한 행을 바깥에 알린다(Jira — LLM 분류 대상)
  const onCheck = ctx.onCheck
  useEffect(() => {
    onCheck?.([...checked])
  }, [checked, onCheck])
  const drag = useRef<{ mode: 'sel' | 'fill' | 'row'; r1: number; c1: number; c2?: number; add?: boolean } | null>(null)
  const leafRef = useRef<EfRow[]>([])
  const paintRef = useRef<ReactNode>(null)
  const tblRef = useRef<HTMLTableElement>(null)

  const ordered = table.getVisibleLeafColumns().map((c) => (c.columnDef.meta as { col: EfColumn }).col)

  /** 실제 행에 쓴다. 바뀌었으면 true — 합계 열 다시 계산은 부른 쪽이 한 번만 */
  const put = (src: EfRow, c: EfColumn, raw: unknown): boolean => {
    if (!src || c.autoSum || c.readOnly || c.type === 'datediff' || c.type === 'formula') return false
    // 수식 칸에 값을 직접 넣으면 엑셀처럼 수식을 지우고 값으로
    const hadFx = !!src[fxKey(c)]
    if (hadFx) delete src[fxKey(c)]
    let v: string | number | boolean
    if (c.type === 'checkbox') v = truthy(raw) ? true : ''
    else if (c.type === 'date') {
      const t = cellText(raw).trim()
      const d = t ? normDate(t) : ''
      if (d === null) {
        toast('날짜는 2026-01-05 꼴로 넣어 주세요')
        return false
      }
      v = d
    } else if (c.type === 'daterange') {
      const d = normRange(raw)
      if (d === null) {
        toast('기간은 2026-01-05 ~ 2026-02-10 꼴로 넣어 주세요')
        return false
      }
      v = d
    } else if (c.type === 'number') {
      const t = cellText(raw).trim()
      if (t === '') v = ''
      else {
        const n = Number(t.replace(/,/g, ''))
        if (isNaN(n)) {
          toast('숫자만 입력할 수 있습니다')
          return false
        }
        v = n
      }
    } else v = cellText(raw)
    if (!hadFx && cellText(src[c.id]) === String(v)) return false // 안 바뀌었으면 저장도 안 함(수식을 지웠으면 저장)
    const prev = src[c.id]
    if (v === '') delete src[c.id]
    else src[c.id] = v
    ctx.onPut?.(src, c, v, prev)
    return true
  }
  const commit = (src: EfRow, c: EfColumn, raw: unknown) => {
    setEdit(null)
    if (!put(src, c, raw)) return
    // 선택 칸에 새 값을 만들었으면 옵션에도 넣는다
    if (hasOptions(c.type) && c.type !== 'multiselect') {
      const v = cellText(src[c.id])
      if (v && !(c.options ?? []).includes(v)) c.options = [...(c.options ?? []), v]
    }
    recalcAuto(rows, cols)
    touch()
  }

  /** 다중 선택 — 창을 닫지 않고 저장한다(여러 개를 차례로 고른다). 새 값은 옵션에도 */
  const keep = (src: EfRow, c: EfColumn, v: string) => {
    if (!put(src, c, v)) return
    const add = v.split(',').map((x) => x.trim()).filter((x) => x && !(c.options ?? []).includes(x))
    if (add.length) c.options = [...(c.options ?? []), ...add]
    touch()
  }
  /** 사람 열 후보 — 그 열에 쓰인 이름(모든 연도) + 앱 사용자 이름 */
  const users = useUserPeople()
  const me = useMeName()
  const people = (c: EfColumn) => {
    // 앱 사용자(조직 포함) 먼저, 그 열에만 쓰인 이름(퇴사자·외부 인원 등)은 조직 없이 덧붙인다
    const out = users.map((u) => ({ name: u.name, org: u.org }))
    const seen = new Set(out.map((u) => u.name))
    Object.values(doc.pages).forEach((p) =>
      p.rows.forEach((r) => {
        const v = cellText(r[c.id]).trim()
        if (v && !seen.has(v)) {
          seen.add(v)
          out.push({ name: v, org: '' })
        }
      }),
    )
    return out
  }

  // ── 키보드(지시: 방향키로 칸 이동) — ↑↓←→ 이동, Shift+방향키 범위, Enter·F2 고치기, 글자를 치면 바로 고치기,
  //    Tab 오른쪽, Delete 지우기. 표 밖(검색칸·팝업 입력)에 글쇠가 있을 때·메뉴가 열려 있을 때는 안 받는다 ──
  /** 고른 칸을 옮긴다 — 끝 칸(r2,c2) 기준, extend 면 범위를 늘린다 */
  const moveSel = (dr: number, dc: number, extend = false) => {
    const last = leafRef.current.length - 1
    const lc = ordered.length - 1
    setSel((s0) => {
      if (!s0 || last < 1) return s0
      const r = Math.min(last, Math.max(1, s0.r2 + dr))
      const c = Math.min(lc, Math.max(0, s0.c2 + dc))
      const nx = extend ? { ...s0, r2: r, c2: c } : { r1: r, c1: c, r2: r, c2: c }
      requestAnimationFrame(() =>
        tblRef.current?.querySelector(`td[data-r="${r}"][data-c="${c}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }),
      )
      return nx
    })
  }
  /** 고른 칸에서 고치기 시작 — 체크박스는 켜고 끄기, 계산 칸은 안 됨 */
  const editAt = (r: number, c: number, init?: string) => {
    const src = leafRef.current[r]
    const col = ordered[c]
    const td = tblRef.current?.querySelector<HTMLElement>(`td[data-r="${r}"][data-c="${c}"]`)
    if (!src || !col || !td || col.autoSum) return
    if (col.readOnly) {
      // 못 고치는 칸 — 여는 열(지라 키)이면 그 행을 연다
      if (col.link && ctx.onOpen) ctx.onOpen(src)
      return
    }
    if (col.type === 'formula') {
      openFormula(col, td)
      return
    }
    if (col.type === 'checkbox') {
      commit(src, col, !truthy(src[col.id]))
      return
    }
    if (col.type === 'datediff') {
      toast(DIFF_HINT)
      return
    }
    const picker = hasOptions(col.type) || col.type === 'date' || col.type === 'daterange' || col.type === 'person'
    setEdit({ src, col, anchor: td, init: picker ? undefined : init })
  }
  /**
   * 글쇠 받는 칸(sink) — 고른 칸 위에 보이지 않게 놓은 입력칸에 늘 포커스를 둔다(Handsontable 방식).
   * 칸만 고른 채 한글을 치면 입력기(IME) 조합이 이 입력칸에서 시작되고, 첫 글자가 들어오는 순간 이 입력칸이
   * 그대로 보이는 편집기가 된다 — 포커스를 옮기지 않으므로 첫 글자가 사라지지 않는다(실제로 사라졌다).
   */
  const sinkRef = useRef<HTMLTextAreaElement>(null)
  const [typing, setTyping] = useState<{ r: number; c: number } | null>(null)
  const typingRef = useRef(typing)
  typingRef.current = typing
  /** 칸을 누르는 그 자리에서 글쇠 받는 칸으로 포커스(누르자마자 쳐도 첫 글자가 들어가게) */
  const grab = () => {
    // 덮어쓰기 중에 다른 칸을 누르면 — 포커스가 안 옮겨가 blur 가 없으니 여기서 저장
    if (typingRef.current) endTyping(true)
    const sk = sinkRef.current
    if (sk && document.activeElement !== sk) sk.focus({ preventScroll: true })
  }
  const placeSink = (r: number, c: number) => {
    const sk = sinkRef.current
    const box = sk?.parentElement
    const td = tblRef.current?.querySelector<HTMLElement>(`td[data-r="${r}"][data-c="${c}"]`)
    if (!sk || !box || !td) return
    const a = td.getBoundingClientRect()
    const b = box.getBoundingClientRect()
    sk.style.left = `${a.left - b.left + box.scrollLeft}px`
    sk.style.top = `${a.top - b.top + box.scrollTop}px`
    sk.style.width = `${a.width}px`
    sk.style.minHeight = `${a.height}px`
  }
  // 칸을 고르면(고치는 중·메뉴가 없을 때) 그 칸 위로 옮기고 글쇠를 받는다. 누른 뒤 브라우저가 포커스를 옮기므로 한 박자 늦게
  useEffect(() => {
    if (!sel || edit || typing || menu || rowMenu) return
    const t = window.setTimeout(() => {
      const sk = sinkRef.current
      if (!sk) return
      placeSink(sel.r2, sel.c2)
      const a = document.activeElement as HTMLElement | null
      if (a && a !== sk && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable)) return // 검색칸 등에 쓰는 중
      if (document.querySelector('[data-efpop], .ef-imp-back, .ef-modal')) return // 열린 팝업
      sk.focus({ preventScroll: true })
    }, 0)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, edit, typing, menu, rowMenu])
  /** 글자가 들어와 고치기 시작 — 고르는 유형은 고르기 창, 못 고치는 칸은 버린다 */
  const sinkStart = () => {
    if (typingRef.current || !sel) return
    const sk = sinkRef.current!
    const r = sel.r2
    const c = sel.c2
    const col = ordered[c]
    const src = leafRef.current[r]
    if (!col || !src || col.autoSum || col.readOnly || col.type === 'checkbox' || col.type === 'formula' || col.type === 'datediff') {
      sk.value = ''
      return
    }
    if (hasOptions(col.type) || col.type === 'date' || col.type === 'daterange' || col.type === 'person') {
      sk.value = ''
      editAt(r, c)
      return
    }
    typingRef.current = { r, c }
    placeSink(r, c)
    setTyping({ r, c })
  }
  const endTyping = (save: boolean) => {
    const t = typingRef.current
    const sk = sinkRef.current
    if (!t || !sk) return
    const v = sk.value
    sk.value = ''
    sk.rows = 1
    typingRef.current = null
    setTyping(null)
    const src = leafRef.current[t.r]
    const col = ordered[t.c]
    if (save && src && col) commit(src, col, v)
  }
  const sinkKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return // 한글 조합 중의 Enter·방향키는 입력기 몫
    const t = typingRef.current
    if (t) {
      // 덮어쓰기 고치기 중 — Enter 저장 후 아래, Shift+Enter 는 글자 칸이면 줄 바꿈, Tab 오른쪽, Esc 취소
      const col = ordered[t.c]
      if (e.key === 'Enter' && !(e.shiftKey && col?.type === 'text')) {
        e.preventDefault()
        endTyping(true)
        moveSel(1, 0)
      } else if (e.key === 'Tab') {
        e.preventDefault()
        endTyping(true)
        moveSel(0, e.shiftKey ? -1 : 1)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        endTyping(false)
      }
      return
    }
    if (fxRef.current && e.key === 'Escape') {
      e.preventDefault()
      setFx(null)
      return
    }
    if (!sel) return
    const k = e.key
    const mv: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }
    if (mv[k]) {
      e.preventDefault()
      moveSel(mv[k]![0], mv[k]![1], e.shiftKey)
    } else if (k === 'Tab') {
      e.preventDefault()
      moveSel(0, e.shiftKey ? -1 : 1)
    } else if (k === 'Enter' || k === 'F2') {
      e.preventDefault()
      editAt(sel.r2, sel.c2)
    } else if (k === ' ' && ordered[sel.c2]?.type === 'checkbox') {
      e.preventDefault()
      editAt(sel.r2, sel.c2)
    } else if (k === 'Delete' || k === 'Backspace') {
      e.preventDefault()
      const n = norm(sel)!
      let changed = false
      for (let r = n.r1; r <= n.r2; r++)
        for (let c = n.c1; c <= n.c2; c++) {
          const src = leafRef.current[r]
          const col = ordered[c]
          if (src && col && put(src, col, '')) changed = true
        }
      if (changed) {
        recalcAuto(rows, cols)
        touch()
      }
    } else if (k === 'Escape') {
      setSel(null)
    }
    // 글자는 막지 않는다 — 입력칸에 들어가고 onInput·조합 시작에서 고치기가 열린다
  }

  /** 우클릭 「수식」 — 지금 고른 범위의 숫자 칸을 들고 결과 칸을 기다린다 */
  const selCells = () => {
    const n = norm(sel)
    const out: Array<{ row: EfRow; col: string }> = []
    if (!n) return out
    for (let r = n.r1; r <= n.r2; r++)
      for (let c = n.c1; c <= n.c2; c++) {
        const row = leafRef.current[r]
        const mc = ordered[c]
        if (row && pickableCol(mc)) out.push({ row, col: mc!.id })
      }
    return out
  }
  /** 결과 칸을 눌렀다 — 숫자 열 칸이면 그 칸에 수식을 둔다 */
  const fxPlace = (src: EfRow, col: EfColumn) => {
    const f = fxRef.current
    if (!f) return
    if (!fxTargetCol(col)) {
      toast('결과는 숫자 열 칸에 넣을 수 있습니다 — 다른 칸을 누르거나 Esc')
      return
    }
    if (f.cells.some((x) => x.row === src && x.col === col.id)) {
      toast('고른 칸 안에는 넣을 수 없습니다 — 다른 칸을 누르세요')
      return
    }
    src[fxKey(col)] = { fn: f.fn, refs: f.cells.map((x) => ({ r: rowId(x.row), c: x.col })) }
    recalcAuto(rows, cols)
    setFx(null)
    touch()
    toast(`${FX_NAME[f.fn]}(${f.cells.length}칸) = ${numFmt(Number(src[col.id] ?? 0))}`)
  }
  /** 표시할 칸 — 결과 칸을 기다리는 중이면 고른 칸(점선), 아니면 고른 수식 칸 하나가 보는 칸(옅게) */
  const marks = (() => {
    const m = new Map<EfRow, Set<string>>()
    const add = (row: EfRow, col: string) => {
      if (!m.has(row)) m.set(row, new Set())
      m.get(row)!.add(col)
    }
    if (fx) fx.cells.forEach((x) => add(x.row, x.col))
    else if (sel && sel.r1 === sel.r2 && sel.c1 === sel.c2) {
      const col = ordered[sel.c1]
      const src = leafRef.current[sel.r1]
      const f = src && col ? fxOf(src, col) : null
      if (f) {
        const byId = new Map(rows.filter((r) => typeof r[ROW_ID] === 'string').map((r) => [r[ROW_ID] as string, r]))
        f.refs.forEach((x) => {
          const row = byId.get(x.r)
          if (row) add(row, x.c)
        })
      }
    }
    return m
  })()

  // ── 범위 선택 · 채우기 ── 한 번 클릭 = 선택, 끌면 범위, 오른쪽 아래 점을 끌면 그 값으로 채우기(세로)
  useEffect(() => {
    const move = (e: MouseEvent) => {
      const d = drag.current
      if (!d) return
      const td = (e.target as HTMLElement)?.closest?.('td[data-r]')
      if (!td) return
      const r = Number(td.getAttribute('data-r'))
      const c = Number(td.getAttribute('data-c'))
      if (d.mode === 'sel') setSel({ r1: d.r1, c1: d.c1, r2: r, c2: Math.max(0, c) }) // 행 번호 칸(-1)까지 끌어도 첫 열에서 멈춘다
      else if (d.mode === 'row') setSel({ r1: d.r1, c1: 0, r2: r, c2: d.c2 ?? 0 }) // 행 번호를 끌면 여러 행 통째로
      else setSel({ r1: d.r1, c1: d.c1, r2: r, c2: d.c2 ?? d.c1 })
    }
    const up = () => {
      const d = drag.current
      if (!d) return
      drag.current = null
      if (d.mode !== 'fill') return
      const n = norm(sel)
      if (!n) return
      const leaf = leafRef.current
      let changed = false
      for (let c = n.c1; c <= n.c2; c++) {
        const mc = ordered[c]
        const srcRow = leaf[d.r1]
        if (!mc || mc.autoSum || !srcRow) continue
        if (mc.type === 'datediff') continue // 계산 값 — 채울 것이 없다(기준 기간은 열마다)
        const val = srcRow[mc.id]
        for (let r = n.r1; r <= n.r2; r++) {
          if (r === d.r1 || !leaf[r]) continue
          if (put(leaf[r]!, mc, val)) changed = true
        }
      }
      if (changed) {
        recalcAuto(rows, cols)
        touch()
      }
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
    return () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
    }
  })

  // 너비를 끌어 바꾸고 놓으면 열에 적어 둔다(새로고침해도 남게)
  const resizing = table.getState().columnSizingInfo.isResizingColumn
  const wasResizing = useRef<string | false>(false)
  useEffect(() => {
    const was = wasResizing.current
    wasResizing.current = resizing
    if (!was || resizing) return
    const w = sizing[was]
    const c = cols.find((x) => x.id === was)
    if (c && w && Math.round(w) !== c.efWidth) {
      c.efWidth = Math.round(w)
      touch()
    }
  }, [resizing, sizing, cols, touch])

  // ── 열 끌어 옮기기 — React 를 거치지 않고 transform 만 바꾼다(363행을 매번 다시 그리면 안 끌린다) ──
  const colDrag = (ev: React.MouseEvent, colId: string) => {
    if (ev.button !== 0) return
    const tbl = tblRef.current
    if (!tbl) return
    const ths = [...tbl.querySelectorAll<HTMLTableCellElement>('thead th[data-col]')]
    if (ths.length < 2) return
    ev.preventDefault()
    const trs = [...tbl.rows]
    const n = ths.length + 1 // 행 번호 한 칸 + 열들
    const cs = ths.map((th) => {
      const ci = th.cellIndex
      const r = th.getBoundingClientRect()
      const cells: HTMLElement[] = []
      trs.forEach((tr) => tr.cells.length === n && tr.cells[ci] && cells.push(tr.cells[ci]!))
      return { id: th.getAttribute('data-col')!, th, cells, left: r.left, right: r.right, w: r.width }
    })
    const from = cs.findIndex((c) => c.id === colId)
    if (from < 0) return
    const W = cs[from]!.w
    const x0 = ev.clientX
    let to = from
    let moved = false
    const set = (c: (typeof cs)[number], t: string) => c.cells.forEach((el) => el.style.transform !== t && (el.style.transform = t))
    const apply = (dx: number) =>
      cs.forEach((c, i) => {
        let t = ''
        if (i === from) t = `translateX(${dx}px)`
        else if (to > from && i > from && i <= to) t = `translateX(${-W}px)`
        else if (to < from && i >= to && i < from) t = `translateX(${W}px)`
        set(c, t)
      })
    const clear = () =>
      cs.forEach((c) => {
        set(c, '')
        c.th.classList.remove('ef-colmoving')
      })
    const mv = (e: MouseEvent) => {
      if (!moved) {
        if (Math.abs(e.clientX - x0) < 4) return
        moved = true
        setMenu(null)
        document.body.style.cursor = 'grabbing'
        cs[from]!.th.classList.add('ef-colmoving')
      }
      const mx = e.clientX
      if (mx < cs[0]!.left) to = 0
      else if (mx >= cs[cs.length - 1]!.right) to = cs.length - 1
      else to = Math.max(0, cs.findIndex((c) => mx >= c.left && mx < c.right))
      apply(e.clientX - x0)
    }
    const up = () => {
      document.removeEventListener('mousemove', mv, true)
      document.removeEventListener('mouseup', up, true)
      document.body.style.cursor = ''
      clear()
      if (moved) draggedAt = Date.now()
      if (moved && to !== from) {
        const all = doc.columns
        const fi = all.findIndex((c) => c.id === colId)
        const toId = cs[to]!.id
        if (fi < 0) return
        const [m] = all.splice(fi, 1)
        const at = all.findIndex((c) => c.id === toId)
        all.splice(to > from ? at + 1 : at, 0, m!)
        touch()
      }
    }
    document.addEventListener('mousemove', mv, true)
    document.addEventListener('mouseup', up, true)
  }

  /**
   * 행 끌어 옮기기(지시: 표에서 행 상/하 드래그) — 행 번호 칸의 손잡이(⋮⋮)를 잡고 끈다.
   * 열 이동·보드 카드와 같은 방식: 끄는 행이 마우스를 따라오고 다른 행이 비켜서 자리가 열린다(칸 transform 만).
   * 정렬이 걸려 있으면 차례를 정렬이 정하므로 옮기지 않는다. 그룹으로 보면 그 그룹 안에서만 옮긴다.
   * 놓으면 실제 행 배열(rows)에서 자리를 바꾼다 — 필터로 숨은 행은 보이는 이웃 기준으로 자리를 잡는다.
   */
  /** 행을 끌어 옮길 수 있나 — 잠근 표는 바깥이 차례를 받을 때만(reorder) */
  const canMove = !lock || !!ctx.reorder
  /** 정렬이 끌기를 막나 — 정렬 없음, 또는 차례 열(reorder.key) 오름차순 하나뿐이면 된다 */
  const sortOk = () => {
    const s0 = table.getState().sorting
    return !s0.length || (s0.length === 1 && !!ctx.reorder?.key && s0[0]!.id === ctx.reorder.key && !s0[0]!.desc)
  }
  const rowDrag = (ev: React.MouseEvent, r: EfRow) => {
    if (ev.button !== 0) return
    ev.preventDefault()
    ev.stopPropagation()
    if (!sortOk()) {
      toast('정렬이 걸려 있으면 행을 옮길 수 없습니다 — 정렬을 풀고 끌어 주세요')
      return
    }
    const tbl = tblRef.current
    const box = tbl?.closest<HTMLElement>('.ef-scroll')
    if (!tbl || !box) return
    // 끄는 행과 같은 묶음(그룹 머리 줄 사이)의 행들만 대상
    let gi = 0
    const all: Array<{ tr: HTMLTableRowElement; row: EfRow; g: number }> = []
    for (const tr of tbl.tBodies[0]?.rows ?? []) {
      if (tr.classList.contains('ef-grp')) gi++
      const td = tr.querySelector<HTMLElement>('td.ef-rnum')
      const row = td && leafRef.current[Number(td.dataset.r)]
      if (row) all.push({ tr, row, g: gi })
    }
    const me = all.find((x) => x.row === r)
    if (!me) return
    const lane = all.filter((x) => x.g === me.g)
    const f = lane.indexOf(me)
    const b0 = box.getBoundingClientRect()
    const st0 = box.scrollTop
    const H = me.tr.getBoundingClientRect().height
    const others = lane
      .filter((x) => x !== me)
      .map((x) => {
        const rr = x.tr.getBoundingClientRect()
        return { ...x, k: lane.indexOf(x), mid: rr.top - b0.top + st0 + rr.height / 2 }
      })
    const top0 = me.tr.getBoundingClientRect().top - b0.top + st0
    const lo = lane[0]!.tr.getBoundingClientRect().top - b0.top + st0 - top0
    const hi = lane[lane.length - 1]!.tr.getBoundingClientRect().top - b0.top + st0 - top0
    const y0 = ev.clientY
    let py = y0
    let ti = f
    let moved = false
    const set = (tr: HTMLTableRowElement, t: string) =>
      [...tr.cells].forEach((td) => td.style.transform !== t && (td.style.transform = t))
    const apply = () => {
      const raw = py - y0 + box.scrollTop - st0
      const dy = Math.max(lo, Math.min(hi, raw))
      // 들어갈 자리는 마우스 그대로로 센다 — 묶은 dy 로 세면 맨 위·맨 아래에서 끄는 행 가운데가
      // 첫·끝 행 가운데와 딱 겹쳐 높이가 조금만 달라도 그 행을 못 넘는다(지적: 1번 행이랑 위치 변경이 안돼)
      const mid = top0 + raw + H / 2
      ti = others.filter((c) => c.mid < mid).length
      others.forEach((c, w) => {
        const was = c.k > f ? 1 : 0
        const now = w >= ti ? 1 : 0
        set(c.tr, now - was ? `translateY(${(now - was) * H}px)` : '')
      })
      set(me.tr, `translateY(${dy}px)`)
    }
    // 표 위·아래 끝에 대고 있으면 그쪽으로 굴린다(긴 표)
    let roll = 0
    const tick = () => {
      const b = box.getBoundingClientRect()
      const vy = py > b.bottom - 36 ? 12 : py < b.top + 56 ? -12 : 0
      if (vy) {
        box.scrollTop += vy
        apply()
      }
      roll = requestAnimationFrame(tick)
    }
    const mv = (e: MouseEvent) => {
      py = e.clientY
      if (!moved) {
        if (Math.abs(py - y0) < 4) return
        moved = true
        setRowMenu(null)
        setEdit(null)
        document.body.style.cursor = 'grabbing'
        me.tr.classList.add('ef-rmoving')
        tbl.classList.add('ef-rdragging')
        roll = requestAnimationFrame(tick)
      }
      apply()
    }
    const up = () => {
      document.removeEventListener('mousemove', mv, true)
      document.removeEventListener('mouseup', up, true)
      cancelAnimationFrame(roll)
      document.body.style.cursor = ''
      me.tr.classList.remove('ef-rmoving')
      tbl.classList.remove('ef-rdragging')
      lane.forEach((x) => set(x.tr, ''))
      if (!moved || ti === f) return
      // 잠근 표 — 행은 바깥 것이라 옮기지 않고 새 차례만 넘긴다
      if (lock && ctx.reorder) {
        const next = [...rows]
        placeRow(next, r, others.map((x) => x.row), ti)
        ctx.reorder.on(next)
        return
      }
      const was = rows.indexOf(r)
      placeRow(rows, r, others.map((x) => x.row), ti)
      if (rows.indexOf(r) === was) return
      pickAfter.current = { r }
      touch()
    }
    document.addEventListener('mousemove', mv, true)
    document.addEventListener('mouseup', up, true)
  }
  /** 그룹 숨기기(지시: 노션처럼 그룹 통째로) — 지금 묶은 열의 그 값. 보기마다 저장, 표·합계에서 빠진다 */
  const hideGroup = (v: string) => {
    const g = table.getState().grouping[0]
    if (!g) return
    const m = { ...(ctx.st.hiddenGroups ?? {}) }
    m[g] = [...new Set([...(m[g] ?? []), v])]
    ctx.setSt({ hiddenGroups: m })
    toast(`「${v || '(빈값)'}」 그룹을 숨겼습니다 — 도구 줄 「그룹」 에서 눈을 눌러 다시 보입니다`)
  }
  /** 이 그룹에 행 추가 — 그 그룹 마지막 행 바로 아래에, 묶은 열 값을 채워서(노션 그룹 「+」) */
  const addToGroup = (v: string) => {
    const g = table.getState().grouping[0]
    if (!g) return
    let at = -1
    rows.forEach((r, i) => cellText(r[g]) === v && (at = i))
    const nr = seedNew(v ? { [g]: v } : {})
    rows.splice(at < 0 ? rows.length : at + 1, 0, nr)
    pickAfter.current = { r: nr, cell: true }
    touch()
  }
  /**
   * 표 맨 아래 「+ 새로 만들기」(지시: 노션처럼) — 맨 끝에 빈 행, 그 첫 칸을 골라 둬 바로 칠 수 있게.
   * 검색·필터에 걸려 안 보일 수 있으면 알린다
   */
  const addAtEnd = () => {
    const nr = seedNew({})
    rows.push(nr)
    pickAfter.current = { r: nr, cell: true }
    touch()
  }
  /** 옮긴 행 — 다시 그린 뒤 그 행을 골라 둔다(어디로 갔는지 보이게) */
  //   cell = 새로 만든 행 — 행 통째가 아니라 첫 칸을 고르고 보이게 굴린다(바로 쳐서 넣게)
  const pickAfter = useRef<{ r: EfRow; cell?: boolean } | null>(null)
  useEffect(() => {
    const p = pickAfter.current
    if (!p) return
    pickAfter.current = null
    const n = leafRef.current.indexOf(p.r)
    if (n <= 0) return
    setSel({ r1: n, c1: 0, r2: n, c2: p.cell ? 0 : ordered.length - 1 })
    if (p.cell) {
      grab()
      requestAnimationFrame(() => tblRef.current?.querySelector(`td.ef-rnum[data-r="${n}"]`)?.scrollIntoView({ block: 'nearest' }))
    }
  })

  /**
   * 행 추가·복제(행 우클릭) — 누른 행 바로 위·아래에 넣는다.
   * 그룹으로 보고 있으면 빈 행에도 그 그룹 값을 넣어 둔다 — 안 그러면 「(빈값)」 그룹으로 가 버려 안 보인다.
   */
  const addRow = (src: EfRow, after: boolean, copy: boolean) => {
    const i = rows.indexOf(src)
    const g = table.getState().grouping[0]
    const nr = copy ? cloneRow(src) : seedNew(g && src[g] != null ? { [g]: src[g] } : {})
    if (copy) markFresh(nr)
    rows.splice(i < 0 ? rows.length : i + (after ? 1 : 0), 0, nr)
    setSel(null)
    touch()
    toast(copy ? '행을 복제했습니다' : '행 추가됨')
  }

  // ── 머리글 메뉴가 하는 열 조작 — 열은 모든 연도가 함께 쓴다 ──
  const opsFor = (c: EfColumn): HeadOps => {
    const allRows = () => Object.values(doc.pages).flatMap((p) => p.rows)
    return {
      rename: (t) => {
        c.title = t
        touch()
      },
      setType: (t: EfType) => {
        if (c.type === t) return
        if (t === 'formula') {
          // 열 값이 수식 결과로 바뀐다 — 값이 있으면 묻는다
          const n = allRows().filter((r) => r[c.id] != null && r[c.id] !== '').length
          if (n && !window.confirm(`「${c.title}」 열의 값 ${n}개가 수식 결과로 바뀝니다. 계속할까요?\n(서버가 저장 전 상태를 백업해 둡니다)`)) return
          c.type = 'formula'
          c.autoSum = false
          if (!c.formula) c.formula = { fn: 'sum', cols: [] }
          Object.values(doc.pages).forEach((p) => recalcAuto(p.rows, cols))
          touch()
          setMenu(null) // 머리글 메뉴는 닫고
          window.setTimeout(() => openFormula(c), 60) // 바로 무엇을 계산할지 고르게
          return
        }
        c.type = t
        if (hasOptions(t)) autoOptions(allRows(), c)
        if (t !== 'number') c.autoSum = false
        recalcAuto(rows, cols)
        touch()
      },
      setDiffSrc: (id: string) => {
        // 남은 일수 열로(이미면 그대로) 바꾸고 볼 기간 열을 정한다. 예전에 행마다 골라 둔 기준은 지워 열 하나로 맞춘다
        c.type = 'datediff'
        c.autoSum = false
        c.diffSrc = id
        allRows().forEach((r) => delete r[srcKey(c)])
        Object.values(doc.pages).forEach((p) => recalcAuto(p.rows, cols))
        touch()
      },
      toggleAutoSum: () => {
        if (!c.autoSum && c.type !== 'number') {
          toast('숫자 열에서만 켤 수 있습니다 — 유형을 [숫자]로 먼저 바꾸세요')
          return
        }
        c.autoSum = !c.autoSum
        Object.values(doc.pages).forEach((p) => recalcAuto(p.rows, cols))
        touch()
      },
      insert: (after) => {
        const i = doc.columns.indexOf(c)
        doc.columns.splice(i + (after ? 1 : 0), 0, { id: newId(), title: '새 속성', type: 'text' })
        touch()
      },
      duplicate: () => {
        const i = doc.columns.indexOf(c)
        const nc = JSON.parse(JSON.stringify(c)) as EfColumn
        nc.id = newId()
        nc.title = c.title + ' 복사'
        doc.columns.splice(i + 1, 0, nc)
        // 잠근 표(위키 데이터베이스)는 정의만 — 값은 바깥(서버)에 있다(예전 표의 열 복제와 같다)
        if (!lock) allRows().forEach((r) => r[c.id] != null && (r[nc.id] = r[c.id]))
        touch()
      },
      remove: () => {
        if (doc.columns.length <= 1) {
          toast('마지막 열은 삭제할 수 없습니다')
          return
        }
        // 잠근 표(REQ-Coverage)의 만든 칸 — 묻는 것은 바깥(서버 정의를 지우는 쪽, 값 든 건수까지 말한다)이 한다
        if (!(lock && c.defs?.del) && !window.confirm(`「${c.title}」 열을 삭제할까요?`)) return
        doc.columns.splice(doc.columns.indexOf(c), 1)
        if (c.autoSum) Object.values(doc.pages).forEach((p) => p.rows.forEach((r) => delete r[c.id]))
        touch()
      },
      group: (on) => ctx.setSt({ group: on ? c.id : '' }),
      editFormula: () => window.setTimeout(() => openFormula(c), 30),
      hide: () => {
        const hid = ctx.st.hidden ?? []
        if (cols.filter((x) => !hid.includes(x.id)).length <= 1) {
          toast('마지막 열은 숨길 수 없습니다')
          return
        }
        ctx.setSt({ hidden: [...hid.filter((x) => x !== c.id), c.id] })
        setSel(null)
        toast(`「${c.title}」 열을 숨겼습니다 — 도구 줄 「숨긴 열」에서 다시 보입니다`)
      },
      touch,
    }
  }

  const headCell = (h: ReturnType<typeof table.getFlatHeaders>[number]) => {
    const col = h.column
    const c = (col.columnDef.meta as { col: EfColumn }).col
    const s = col.getIsSorted()
    const num = isNumCol(c)
    return (
      <th key={h.id} data-col={c.id} style={{ width: h.getSize() }}>
        {/* 머리글 아무 데나 끌면 열 이동, 누르면 메뉴(예전과 같다) */}
        <div
          className={`ef-hc${num ? ' num' : ''}${col.getIsFiltered() ? ' filtered' : ''}`}
          onMouseDown={(e) => colDrag(e, c.id)}
        >
          <span
            className="ef-hlbl"
            title={c.type === 'formula' ? `수식: ${formulaText(formulaOf(c), cols)} · 누르면 메뉴 · 끌면 열 이동` : '누르면 메뉴 (유형·필터·정렬) · 끌면 열 이동'}
            onClick={(e) => {
              if (Date.now() - draggedAt < 250) return
              const a = e.currentTarget
              setEdit(null)
              setMenu((m) => (m && m.colId === c.id ? null : { anchor: a, colId: c.id }))
            }}
          >
            <TI n={typeIcon(c)} className="ef-hicon" />
            <span className="ef-ttl">{c.title}</span>
            {s && <span className="ef-ar">{s === 'asc' ? '↑' : '↓'}</span>}
            {col.getIsFiltered() && <span className="ef-fon">▼</span>}
          </span>
        </div>
        <div
          className={`ef-rz${col.getIsResizing() ? ' act' : ''}`}
          onMouseDown={h.getResizeHandler()}
          onTouchStart={h.getResizeHandler()}
          onDoubleClick={() => {
            delete c.efWidth
            setSizing((z) => {
              const n = { ...z }
              delete n[c.id]
              return n
            })
            touch()
          }}
        />
      </th>
    )
  }

  const n0 = norm(sel)
  /** n 번째 행 하나만 통째로 골라져 있나 — 그러면 행 번호를 끌어 옮긴다 */
  const rowOnly = (n: number) => !!n0 && n0.r1 === n && n0.r2 === n && n0.c1 === 0 && n0.c2 === ordered.length - 1
  const bodyRow = (row: Row<EfRow>, n: number): ReactNode => {
    if (row.getIsGrouped()) {
      return (
        <tr
          key={row.id}
          className="ef-grp"
          onContextMenu={(e) => {
            e.preventDefault()
            setGroupMenu({ x: e.clientX, y: e.clientY, v: String(row.groupingValue ?? '') })
          }}
        >
          <td className="ef-rh" />
          {row.getVisibleCells().map((cell) =>
            cell.getIsGrouped() ? (
              <td key={cell.id} className="ef-gcell">
                <span className="ef-ghead">
                <button type="button" className="ef-gx" onClick={row.getToggleExpandedHandler()} aria-expanded={row.getIsExpanded()}>
                  <span className={`ef-tw${row.getIsExpanded() ? ' open' : ''}`}>▸</span>
                  <b>{String(row.groupingValue ?? '') || '(빈값)'}</b>
                  <span className="ef-cnt">{row.subRows.length}개</span>
                </button>
                {/* 노션처럼 올렸을 때만 「⋯」 — 그룹 숨기기 · 이 그룹에 행 추가 · 모두 접기/펼치기. 다시 보이기는 「그룹」 창의 눈 */}
                <button
                  type="button"
                  className="ef-gmore"
                  aria-label="그룹 메뉴"
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect()
                    setGroupMenu({ x: r.left, y: r.bottom + 2, v: String(row.groupingValue ?? '') })
                  }}
                >
                  <TI n="dots" />
                </button>
                </span>
              </td>
            ) : (
              <td key={cell.id} />
            ),
          )}
          {fill && <td className="ef-fillc" />}
        </tr>
      )
    }
    const src = row.original
    return (
      <tr
        key={row.id}
        className={ctx.rowClass?.(src) || undefined}
        onContextMenu={(e) => {
          if (lock) return // 빌려 쓰는 표(Jira)는 행 추가·복제·삭제가 없다 — 브라우저 메뉴 그대로
          e.preventDefault()
          const td = (e.target as HTMLElement).closest<HTMLElement>('td[data-c]')
          setRowMenu({ x: e.clientX, y: e.clientY, src, c: td ? Number(td.dataset.c) : undefined })
        }}
      >
        {/* 행 번호 — 누르면 그 행 통째로 선택, 끌면 여러 행, Shift 는 지금 선택에서 이어 붙인다.
            이미 그 한 행만 골라져 있으면 끌어서 옮긴다(구글 시트처럼 — 손잡이를 못 찾아도 늘 누르던 자리에서) */}
        <td
          className={`ef-rh ef-rnum${n0 && n >= n0.r1 && n <= n0.r2 && n0.c1 === 0 && n0.c2 === ordered.length - 1 ? ' ef-rsel' : ''}${rowOnly(n) ? ' ef-rmov' : ''}`}
          data-r={n}
          data-c={-1}
          title={rowOnly(n) && canMove ? '끌면 행 옮기기' : '누르면 행 선택 · 끌면 여러 행'}
          onMouseDown={(e) => {
            if (e.button !== 0) return
            if (!e.shiftKey && canMove && rowOnly(n) && sortOk()) {
              rowDrag(e, src)
              return
            }
            e.preventDefault()
            const last = ordered.length - 1
            const from = e.shiftKey && sel ? sel.r1 : n
            grab()
            drag.current = { mode: 'row', r1: from, c1: 0, c2: last }
            setSel({ r1: from, c1: 0, r2: n, c2: last })
            setEdit(null)
          }}
        >
          <span className="ef-rnum-in">
            {canMove && (
              <i className="ef-rgrip" aria-label={`${n}행 끌어 옮기기`} onMouseDown={(e) => rowDrag(e, src)}>
                <TI n="grip" />
              </i>
            )}
            <input
              type="checkbox"
              className="ef-rck"
              aria-label={`${n}행 선택`}
              checked={checked.has(src)}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onChange={() =>
                setChecked((o) => {
                  const k = new Set(o)
                  if (k.has(src)) k.delete(src)
                  else k.add(src)
                  return k
                })
              }
            />
            <b>{n}</b>
          </span>
        </td>
        {row.getVisibleCells().map((cell, ci) => {
          const c = (cell.column.columnDef.meta as { col: EfColumn }).col
          const num = isNumCol(c) || c.type === 'datediff'
          // 합계는 계산값이라 못 고친다. 체크박스는 두 번 클릭 = 켜고 끄기, 남은 일수는 = 이 행의 기준 기간 고르기
          const editable = !c.autoSum && !c.readOnly
          const isEd = edit && edit.src === src && edit.col.id === c.id
          // 팝업으로 고르는 유형 — 선택·상태·다중 선택·날짜·기간
          const picker = hasOptions(c.type) || c.type === 'date' || c.type === 'daterange' || c.type === 'person'
          if (isEd && !picker) {
            const kind = c.type === 'url' ? 'url' : c.type === 'email' ? 'email' : c.type === 'phone' ? 'tel' : 'text'
            const init = edit!.init
            // 고치기 끝 — Enter 는 저장 후 아래 칸, Tab 은 오른쪽 칸(엑셀처럼), Esc 는 취소
            const keys = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
              if (e.key === 'Enter' && !(e.shiftKey && c.type === 'text')) {
                e.preventDefault()
                commit(src, c, e.currentTarget.value)
                moveSel(1, 0)
              } else if (e.key === 'Tab') {
                e.preventDefault()
                commit(src, c, e.currentTarget.value)
                moveSel(0, e.shiftKey ? -1 : 1)
              } else if (e.key === 'Escape') {
                e.preventDefault()
                setEdit(null)
              }
            }
            const start = (el: HTMLInputElement | HTMLTextAreaElement) => {
              // 글자를 쳐서 시작했으면 커서를 끝에, 아니면 전체 선택
              if (init !== undefined) el.setSelectionRange(el.value.length, el.value.length)
              else el.select()
            }
            return (
              <td key={cell.id} className={`${num ? 'ef-n ' : ''}ef-editing`}>
                {c.type === 'text' ? (
                  // 글자 칸 — Shift+Enter 로 줄 바꿈(지시), 줄 수만큼 칸이 늘어난다
                  <textarea
                    className="ef-cell-in ef-cell-ta"
                    autoFocus
                    rows={Math.max(1, (init ?? cellText(src[c.id])).split('\n').length)}
                    defaultValue={init ?? cellText(src[c.id])}
                    onFocus={(e) => start(e.currentTarget)}
                    onInput={(e) => (e.currentTarget.rows = Math.max(1, e.currentTarget.value.split('\n').length))}
                    onKeyDown={keys}
                    onBlur={(e) => commit(src, c, e.currentTarget.value)}
                  />
                ) : (
                  <input
                    className="ef-cell-in"
                    autoFocus
                    type={kind}
                    inputMode={num ? 'decimal' : undefined}
                    defaultValue={init ?? cellText(src[c.id])}
                    onFocus={(e) => start(e.currentTarget)}
                    onKeyDown={keys}
                    onBlur={(e) => commit(src, c, e.currentTarget.value)}
                  />
                )}
              </td>
            )
          }
          const on = !!n0 && n >= n0.r1 && n <= n0.r2 && ci >= n0.c1 && ci <= n0.c2
          const corner = on && n === n0!.r2 && ci === n0!.c2
          const edge = on
            ? 'ef-sel' + (n === n0!.r1 ? ' ef-s-t' : '') + (n === n0!.r2 ? ' ef-s-b' : '') + (ci === n0!.c1 ? ' ef-s-l' : '') + (ci === n0!.c2 ? ' ef-s-r' : '')
            : ''
          return (
            <td
              key={cell.id}
              data-r={n}
              data-c={ci}
              className={`${num ? 'ef-n ' : ''}${editable ? 'ef-ed ' : c.readOnly ? 'ef-ro ' : 'ef-auto '}${isEd ? 'ef-editing ' : ''}${c.type === 'text' && cellText(src[c.id]).includes('\n') ? 'ef-ml ' : ''}${marks.get(src)?.has(c.id) ? (fx ? 'ef-pk ' : 'ef-ref ') : ''}${fx && fxTargetCol(c) ? 'ef-fxok ' : ''}${edge}`}
              onMouseDown={(e) => {
                if (e.button !== 0) return
                e.preventDefault() // 글자 끌어 고르기 대신 칸 고르기 — 포커스는 바로 글쇠 받는 칸으로
                grab()
                // 여는 열의 글자(지라 키)를 누르면 그 행을 연다 — 칸은 고른 채로
                if (c.link && ctx.onOpen && (e.target as HTMLElement).closest('.ef-link')) {
                  setSel({ r1: n, c1: ci, r2: n, c2: ci })
                  setEdit(null)
                  ctx.onOpen(src)
                  return
                }
                if (fxRef.current) {
                  fxPlace(src, c) // 수식 결과 칸 지정
                  setSel({ r1: n, c1: ci, r2: n, c2: ci })
                  return
                }
                drag.current = { mode: 'sel', r1: n, c1: ci, add: e.ctrlKey || e.metaKey }
                setSel({ r1: n, c1: ci, r2: n, c2: ci })
                setEdit(null)
              }}
              onDoubleClick={
                !editable
                  ? c.link && ctx.onOpen
                    ? () => ctx.onOpen!(src)
                    : undefined
                  : c.type === 'checkbox'
                    ? () => commit(src, c, !truthy(src[c.id]))
                    : c.type === 'formula'
                      ? (e) => openFormula(c, e.currentTarget)
                      : c.type === 'datediff'
                        ? () => toast(DIFF_HINT)
                        : (e) => setEdit({ src, col: c, anchor: e.currentTarget })
              }
            >
              {/* 묶은 열(기본 인원)은 그룹 머리에만 쓰고 행에서는 비운다(예전과 같다) */}
              {cell.getIsPlaceholder() ? null : ctx.renderCell?.(src, c) !== undefined ? (
                ctx.renderCell!(src, c)
              ) : (
                <CellView
                  c={c}
                  v={
                    c.type === 'datediff'
                      ? {
                          left: dayLeft(src, rowSrcOf(src, cols, c)),
                          span: dayDiff(src, rowSrcOf(src, cols, c)),
                        }
                      : src[c.id]
                  }
                  max={max[c.id] ?? 0}
                  fx={(() => {
                    const f = fxOf(src, c)
                    return f ? `${FX_NAME[f.fn]}(${f.refs.length}칸)` : undefined
                  })()}
                  onToggle={c.type === 'checkbox' ? () => commit(src, c, !truthy(src[c.id])) : undefined}
                />
              )}
              {corner && !lock && (
                <span
                  className="ef-fill"
                  title="끌어서 아래로 채우기"
                  onMouseDown={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    drag.current = { mode: 'fill', r1: n0!.r1, c1: n0!.c1, c2: n0!.c2 }
                  }}
                />
              )}
            </td>
          )
        })}
        {fill && <td className="ef-fillc" />}
      </tr>
    )
  }

  // 그룹 소계 — 그룹 맨 아래 한 줄. 값은 TanStack 이 aggregationFn(sum)으로 모은 것
  const subRow = (g: Row<EfRow>) => (
    <tr key={'sum-' + g.id} className="ef-rsum">
      <td className="ef-rh" />
      {ordered.map((c) => {
        // 그룹 소계도 바닥줄과 같은 계산(그 그룹 행들로) — 숫자 열의 자동은 예전처럼 TanStack 합계
        const k = calcOf(c, ctx.st.calc)
        if (k !== 'auto') {
          const f = c.id === table.getState().grouping[0] ? null : calc(k, c, g.getLeafRows().filter((r) => !r.getIsGrouped()).map((r) => r.original), cols)
          return (
            <td key={c.id} className={isNumCol(c) || c.type === 'datediff' ? 'ef-n' : ''}>
              {f && (
                <span className="ef-tot">
                  {f.lbl}
                  <b>{f.val}</b>
                </span>
              )}
            </td>
          )
        }
        if (!isNumCol(c)) return <td key={c.id} />
        const v = Number(g.getValue(c.id))
        return (
          <td key={c.id} className="ef-n">
            {v ? (
              <span className="ef-tot">
                합계<b>{numFmt(v)}</b>
              </span>
            ) : null}
          </td>
        )
      })}
      {fill && <td className="ef-fillc" />}
    </tr>
  )

  /** 「+ 새로 만들기」 줄 — 행 번호 칸 + 나머지 전체 한 칸 */
  const newRowTr = (key: string, on: () => void) => (
    <tr key={key} className="ef-newrow">
      <td className="ef-rh" />
      <td colSpan={ordered.length + (fill ? 1 : 0)}>
        <button type="button" className="ef-newrow-btn" onClick={on}>
          <TI n="plus" /> 새로 만들기
        </button>
      </td>
    </tr>
  )

  // ★ 열 너비를 끄는 동안은 머리글 너비만 바뀐다 — 본문(363행 × 19칸)을 매번 새로 그리면 한 번 움직일 때
  //   0.3초씩 걸려 끊겼다. 끄는 동안은 직전에 그린 본문을 그대로 쓴다(같은 요소면 React 가 건너뛴다).
  let painted = paintRef.current
  if (!resizing || !painted) {
    const shown = table.getFilteredRowModel().rows.map((r) => r.original)
    const body: ReactNode[] = []
    const leaf: EfRow[] = []
    let ord = 0
    let openGroup: Row<EfRow> | null = null
    // 그룹 끝 — 노션처럼 「+ 새로 만들기」(그 그룹 값으로) 다음 소계
    const closeGroup = (g: Row<EfRow>) => {
      if (!lock) body.push(newRowTr('new-' + g.id, () => addToGroup(String(g.groupingValue ?? ''))))
      else if (ctx.onNew) body.push(newRowTr('new-' + g.id, ctx.onNew))
      body.push(subRow(g))
    }
    // 한 번에 그릴 행 수(pageSize) — 넘으면 거기서 멈추고 아래에 「더 보기」. 바닥줄 계산은 그대로 전체로 센다
    let total = 0
    let cut = false
    table.getRowModel().rows.forEach((r) => {
      if (r.getIsGrouped()) {
        if (cut) return
        if (openGroup) closeGroup(openGroup)
        body.push(bodyRow(r, 0))
        openGroup = r.getIsExpanded() ? r : null
      } else {
        total++
        if (ord >= limit) {
          cut = true
          return
        }
        ord++
        leaf[ord] = r.original
        body.push(bodyRow(r, ord))
      }
    })
    if (openGroup && !cut) closeGroup(openGroup)
    if (cut) {
      const step = ctx.pageSize ?? 200
      body.push(
        <tr key="more" className="ef-newrow ef-morerow">
          <td className="ef-rh" />
          <td colSpan={ordered.length + (fill ? 1 : 0)}>
            {/* 한 묶음으로 왼쪽에 붙인다 — 글자·단추를 따로 붙이면 같은 자리로 밀려 겹쳤다(지적) */}
            <span className="ef-more-in">
              <span className="ef-more-n">
                {ord.toLocaleString()} / {total.toLocaleString()}행
              </span>
              <button type="button" className="ef-more-btn" onClick={() => setLimit((l) => l + step * 2.5)}>
                <TI n="chevron-down" /> 더 보기
              </button>
              <button type="button" className="ef-more-btn" onClick={() => setLimit(Infinity)}>
                모두 보기
              </button>
            </span>
          </td>
        </tr>,
      )
    }
    // 묶지 않았으면 표 맨 아래에 하나
    if (body.length && !cut && !table.getState().grouping.length) {
      if (!lock) body.push(newRowTr('new-end', addAtEnd))
      else if (ctx.onNew) body.push(newRowTr('new-end', ctx.onNew)) // 잠근 표 — 빈 행 대신 작성 창(바깥)
    }
    leafRef.current = leaf
    painted = (
      <>
          <tbody>
            {body.length ? (
              body
            ) : (
              // 빈 표도 노션처럼 「+ 새로 만들기」(지시). 행은 있는데 검색·필터에 걸렸으면 그 안내를 위에
              <>
                {(rows.length > 0 || lock) && (
                  <tr>
                    <td className="ef-rh" />
                    <td colSpan={ordered.length + (fill ? 1 : 0)} className="ef-none">
                      <span className="ef-none-msg">{rows.length ? '조건에 맞는 행이 없습니다' : '행이 없습니다'}</span>
                    </td>
                  </tr>
                )}
                {!lock ? newRowTr('new-end', addAtEnd) : ctx.onNew ? newRowTr('new-end', ctx.onNew) : null}
              </>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td className="ef-rh" />
              {/* 계산 줄(노션 Calculate) — 칸을 누르면 그 열의 계산을 고른다(지시). 안 고르면 유형별 자동 값 */}
              {ordered.map((c) => {
                const k = calcOf(c, ctx.st.calc)
                const f = calc(k, c, shown, cols)
                const num = isNumCol(c) || c.type === 'datediff'
                // 좁은 열(부서·직급…)의 최다는 그 값만 — 「최다 검증3…」 처럼 잘렸다. 이름표·개수·분포는 올리면 보인다
                const slim = f?.short && (table.getColumn(c.id)?.getSize() ?? 999) < 110
                return (
                  <td
                    key={c.id}
                    className={`ef-fcalc${num ? ' ef-n' : ' ef-fst'}`}
                    title={f ? `${f.lbl} — ${f.tip ?? f.val} · 눌러서 계산 바꾸기` : '눌러서 계산 고르기'}
                    onClick={(e) => {
                      const r = e.currentTarget.getBoundingClientRect()
                      setCalcMenu({ x: r.left, top: r.top, bottom: r.bottom, colId: c.id })
                    }}
                  >
                    {!f ? (
                      <span className="ef-fhint">계산 ▾</span>
                    ) : num ? (
                      <span className="ef-tot">
                        {f.lbl}
                        <b>{f.val}</b>
                      </span>
                    ) : slim ? (
                      <b>{f.short}</b>
                    ) : (
                      <>
                        <span className="ef-flbl">{f.lbl}</span> <b>{f.val}</b>
                      </>
                    )}
                  </td>
                )
              })}
              {fill && <td className="ef-fillc" />}
            </tr>
          </tfoot>
      </>
    )
    paintRef.current = painted
  }

  const menuCol = menu ? table.getColumn(menu.colId) : undefined
  const menuEf = menuCol ? (menuCol.columnDef.meta as { col: EfColumn }).col : undefined
  // ── 체크한 행 줄(예전 _rscSelBar) — 보이는 행 전체 · N행 선택 · 복사 · 복제 · 삭제 · 해제 ──
  const shown = table.getFilteredRowModel().rows.map((r) => r.original)
  const ckList = rows.filter((r) => checked.has(r)) // 표 차례대로
  // 보이는 행을 바깥에 알린다(바뀌었을 때만) — 정렬 차례대로
  const shownSig = ctx.onShown ? leafRows(table).map((r) => String(r.__id ?? '')).join('\u0001') : ''
  const onShown = ctx.onShown
  useEffect(() => {
    if (onShown) onShown(leafRows(table))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownSig])
  const allOn = shown.length > 0 && shown.every((r) => checked.has(r))
  const someOn = !allOn && shown.some((r) => checked.has(r))
  const selCopy = async () => {
    const vc = ordered
    const lines = [vc.map((c) => c.title).join('\t'), ...ckList.map((r) => vc.map((c) => cellText(r[c.id]).replace(/[\t\n]/g, ' ')).join('\t'))]
    toast((await copyText(lines.join('\n'))) ? `📋 ${ckList.length}행 복사됨 — 엑셀·다른 표에 붙여넣을 수 있습니다` : '복사하지 못했습니다')
  }
  const selDup = () => {
    // 저마다 바로 아래에 복제(행 우클릭 「행 복제」 와 같게)
    ckList.forEach((r) => rows.splice(rows.indexOf(r) + 1, 0, cloneRow(r)))
    setChecked(new Set())
    setSel(null)
    touch()
    toast(`⧉ ${ckList.length}행 복제됨`)
  }
  const selDel = () => {
    if (!window.confirm(`${ckList.length}행을 삭제할까요?\n(서버가 저장 전 상태를 백업해 둡니다)`)) return
    ckList.forEach((r) => {
      const i = rows.indexOf(r)
      if (i >= 0) rows.splice(i, 1)
    })
    setChecked(new Set())
    setSel(null)
    touch()
    toast(`🗑 ${ckList.length}행 삭제됨`)
  }
  return (
    <div className="ef-gbox">
    {fx && (
      <div className="ef-pickbar">
        <TI n="sum" />
        <span>
          <b>{FX_NAME[fx.fn]}</b> ({fx.cells.length}칸 · 지금 {numFmt(Math.round((() => { const v = fx.cells.map((x) => toNum(x.row[x.col])).filter((n): n is number => n !== null); return fx.fn === 'count' ? v.length : !v.length ? 0 : fx.fn === 'sum' ? v.reduce((a, b) => a + b, 0) : fx.fn === 'avg' ? v.reduce((a, b) => a + b, 0) / v.length : fx.fn === 'min' ? Math.min(...v) : Math.max(...v) })() * 1e4) / 1e4)}) — 결과를 넣을 칸을 누르세요
        </span>
        <span className="ef-pickhint">숫자 열 칸 · 그 칸이 수식 칸이 됩니다 · Esc 취소</span>
        <span className="ef-sp" />
        <button type="button" className="ef-btn gh" onClick={() => setFx(null)}>
          취소
        </button>
      </div>
    )}
    <div className="ef-selbar">
      <label className="ef-selall">
        <input
          type="checkbox"
          checked={allOn}
          ref={(el) => {
            if (el) el.indeterminate = someOn
          }}
          onChange={() => setChecked(allOn ? new Set() : new Set([...checked, ...shown]))}
        />
        보이는 행 전체
      </label>
      {ckList.length > 0 && !ctx.hideBulk && (
        <>
          <span className="ef-selcnt">{ckList.length}행 선택</span>
          <button type="button" className="ef-btn gh" onClick={() => void selCopy()}>
            <TI n="copy" /> 복사
          </button>
          {/* 잠근 표의 바깥 일괄 단추 — 지우기처럼 되돌릴 수 없는 것(danger)은 해제 오른쪽 끝에 */}
          {lock &&
            (ctx.bulk ?? [])
              .filter((b) => !b.danger)
              .map((b) => (
                <button key={b.k} type="button" className="ef-btn gh" onClick={() => ctx.onBulk?.(b.k, ckList)}>
                  {b.label}
                </button>
              ))}
          {!lock && (
            <>
              <button type="button" className="ef-btn gh" onClick={selDup}>
                <TI n="copy-plus" /> 복제
              </button>
              <button type="button" className="ef-btn gh ef-danger" onClick={selDel}>
                <TI n="trash" /> 삭제
              </button>
            </>
          )}
          <button type="button" className="ef-btn gh" onClick={() => setChecked(new Set())}>
            해제
          </button>
          {/* 잠근 표(Jira)의 삭제 — 해제 오른쪽(지시). 무엇을 지우는지는 바깥(onDelete)이 정하고 묻는다 */}
          {lock && ctx.onDelete && (
            <button type="button" className="ef-btn gh ef-danger" onClick={() => ctx.onDelete!(ckList)}>
              <TI n="trash" /> 삭제
            </button>
          )}
          {lock &&
            (ctx.bulk ?? [])
              .filter((b) => b.danger)
              .map((b) => (
                <button key={b.k} type="button" className="ef-btn gh ef-danger" onClick={() => ctx.onBulk?.(b.k, ckList)}>
                  <TI n="trash" /> {b.label}
                </button>
              ))}
        </>
      )}
    </div>
    <div className="ef-gmain">
    <div className="ef-scroll" translate="no">
      <textarea
        ref={sinkRef}
        className={`ef-sink${typing ? ' on' : ''}${typing && ordered[typing.c] && isNumCol(ordered[typing.c]) ? ' num' : ''}`}
        aria-label="고른 칸에 입력"
        tabIndex={-1}
        rows={1}
        spellCheck={false}
        onKeyDown={sinkKey}
        onCompositionStart={() => sinkStart()}
        onInput={(e) => {
          if (!typingRef.current) sinkStart()
          e.currentTarget.rows = Math.max(1, e.currentTarget.value.split('\n').length)
        }}
        onBlur={() => typingRef.current && endTyping(true)}
      />
      {/* 빌려 쓰는 표는 줄이 오른쪽 끝까지(지시: 예전 표처럼) — 맨 끝 빈 채움 칸이 남는 폭을 받는다 */}
      <table className="ef-t" ref={tblRef} style={{ width: fill ? `max(100%, ${table.getTotalSize() + 62}px)` : table.getTotalSize() + 62 }}>
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              <th className="ef-rh" />
              {hg.headers.map(headCell)}
              {fill && <th className="ef-fillc" />}
            </tr>
          ))}
        </thead>
        {painted}
      </table>
      <div className="ef-hint">
        <b>머리글 클릭=메뉴</b>(유형·필터·정렬·수식 설정) · <b>바닥줄 클릭=계산 고르기</b> · <b>머리글 끌기=열 이동</b> · 셀 클릭=선택, 끌면 범위 · 오른쪽 아래 점 끌기=채우기 ·{' '}
        <b>셀 두 번 클릭·Enter·F2·바로 입력=수정</b> · 방향키=이동 · Shift+Enter=줄 바꿈 · <b>행 우클릭=행 추가·복제·삭제</b>
      </div>

      {edit && edit.col.type === 'multiselect' && (
        <MultiPicker
          anchor={edit.anchor}
          col={edit.col}
          value={cellText(edit.src[edit.col.id])}
          options={optionsOf(rows, edit.col)}
          onClose={() => setEdit(null)}
          onPick={(v) => keep(edit.src, edit.col, v)}
        />
      )}
      {edit && edit.col.type === 'date' && (
        <DatePicker anchor={edit.anchor} value={cellText(edit.src[edit.col.id])} onClose={() => setEdit(null)} onPick={(v) => commit(edit.src, edit.col, v)} />
      )}
      {edit && edit.col.type === 'daterange' && (
        <RangePicker anchor={edit.anchor} value={cellText(edit.src[edit.col.id])} onClose={() => setEdit(null)} onPick={(v) => commit(edit.src, edit.col, v)} />
      )}
      {edit && edit.col.type === 'person' && (
        // 사람 — 앱 공용 담당 고르개(조직 레일 · 검색 · 최근 · 나에게 · 비움). 플랜 표·노션 표와 같은 몸통
        <PeoplePick
          at={{ x: edit.anchor.getBoundingClientRect().left, y: edit.anchor.getBoundingClientRect().bottom + 2 }}
          people={people(edit.col)}
          value={cellText(edit.src[edit.col.id])}
          me={me}
          loading={!users.length}
          onPick={(v) => commit(edit.src, edit.col, v)}
          onClose={() => setEdit(null)}
        />
      )}
      {edit && hasOptions(edit.col.type) && edit.col.type !== 'multiselect' && (
        <SelectPicker
          anchor={edit.anchor}
          col={edit.col}
          value={cellText(edit.src[edit.col.id])}
          options={optionsOf(rows, edit.col)}
          onClose={() => setEdit(null)}
          onPick={(v) => commit(edit.src, edit.col, v)}
        />
      )}
      {menu && menuCol && menuEf && (
        <HeadMenu
          key={menu.colId}
          anchor={menu.anchor}
          column={menuCol}
          col={menuEf}
          rows={rows}
          grouped={table.getState().grouping[0] === menuEf.id}
          facetOptions={optionsOf(rows, menuEf)}
          ops={opsFor(menuEf)}
          allCols={cols}
          lock={lock}
          defs={ctx.defs}
          onClose={() => setMenu(null)}
        />
      )}
      {groupMenu && (
        <CtxMenu
          at={groupMenu}
          onClose={() => setGroupMenu(null)}
          items={[
            ...(lock ? [] : [{ ic: 'plus', label: '이 그룹에 행 추가', on: () => addToGroup(groupMenu.v) }]),
            { ic: 'eye-off', label: '그룹 숨기기', on: () => hideGroup(groupMenu.v) },
            { ic: 'chevron-right', label: '모든 그룹 접기', on: () => table.toggleAllRowsExpanded(false), sep: true },
            { ic: 'chevron-down', label: '모든 그룹 펼치기', on: () => table.toggleAllRowsExpanded(true) },
          ]}
        />
      )}
      {rowMenu && (
        <CtxMenu
          at={rowMenu}
          onClose={() => setRowMenu(null)}
          items={[
            { ic: 'arrow-bar-to-up', label: '위에 행 추가', on: () => addRow(rowMenu.src, false, false) },
            { ic: 'arrow-bar-to-down', label: '아래에 행 추가', on: () => addRow(rowMenu.src, true, false) },
            { ic: 'copy', label: '행 복제', on: () => addRow(rowMenu.src, true, true) },
            // 수식 — 고른 범위에 숫자 칸이 있으면(지시: 칸 먼저 → 수식 → 결과 칸)
            ...(() => {
              const cells = selCells()
              if (!cells.length) return []
              return (['sum', 'avg', 'min', 'max', 'count'] as FxFn[]).map((fn, i) => ({
                ic: 'sum',
                label: `수식 · ${FX_NAME[fn]} (${cells.length}칸)`,
                sep: i === 0,
                on: () => {
                  setFx({ fn, cells })
                  toast('결과를 넣을 칸을 누르세요(숫자 열)')
                },
              }))
            })(),
            // 우클릭한 칸이 수식 칸이면 — 수식만 지우고 지금 값은 남긴다
            ...(() => {
              const col = rowMenu.c !== undefined ? ordered[rowMenu.c] : undefined
              if (!col || !fxOf(rowMenu.src, col)) return []
              return [
                {
                  ic: 'eraser',
                  label: '수식 지우기 (값만 남기기)',
                  sep: true,
                  on: () => {
                    delete rowMenu.src[fxKey(col)]
                    touch()
                    toast('수식을 지웠습니다 — 값은 그대로')
                  },
                },
              ]
            })(),
            {
              ic: 'trash',
              label: '행 삭제',
              del: true,
              sep: true,
              on: () => {
                const i = rows.indexOf(rowMenu.src)
                if (i < 0) return
                rows.splice(i, 1)
                setSel(null)
                touch()
                toast('1행 삭제됨')
              },
            },
          ]}
        />
      )}
      {formulaEd && (() => {
        const c = cols.find((x) => x.id === formulaEd.colId)
        if (!c || c.type !== 'formula') return null
        return (
          <FormulaEditor
            anchor={formulaEd.anchor}
            col={c}
            cols={cols}
            rows={rows}
            onClose={() => setFormulaEd(null)}
            onApply={(f) => {
              c.formula = f
              Object.values(doc.pages).forEach((p) => recalcAuto(p.rows, cols))
              setFormulaEd(null)
              touch()
              toast(`「${c.title}」 = ${formulaText(f, cols)}`)
            }}
          />
        )
      })()}
      {calcMenu &&
        (() => {
          const c = cols.find((x) => x.id === calcMenu.colId)
          if (!c) return null
          return (
            <CalcMenu
              at={{ x: calcMenu.x, top: calcMenu.top, bottom: calcMenu.bottom }}
              groups={calcMenuFor(c)}
              cur={calcOf(c, ctx.st.calc)}
              name={(k) => CALC_MENU[k as CalcKey]}
              onPick={(k) => {
                // 기본값(숫자=자동, 나머지=계산 안함)을 고르면 저장값을 지운다
                const m = { ...(ctx.st.calc ?? {}) }
                if (k === defaultCalc(c)) delete m[c.id]
                else m[c.id] = k
                ctx.setSt({ calc: m })
              }}
              onClose={() => setCalcMenu(null)}
            />
          )
        })()}
    </div>
    </div>
    </div>
  )
}

/** 칸 보기 — 선택 계열은 칩, 숫자는 열 최대값 대비 막대(85% 넘으면 주황) */
function CellView({ c, v, max, fx, onToggle }: { c: EfColumn; v: unknown; max: number; fx?: string; onToggle?: () => void }) {
  // 여는 열(지라 키) — 누르면 그 행을 연다(표가 누름을 받아 EfCtx.onOpen 으로)
  if (c.link) return v == null || v === '' ? null : <span className="ef-link">{String(v)}</span>
  // 체크박스 — 비어 있어도 빈 상자를 그린다. 상자를 누르면 켜고 끈다(예전 Handsontable 체크박스처럼)
  if (c.type === 'checkbox') {
    const on = truthy(v)
    return (
      <button
        type="button"
        className={`ef-ckbox${on ? ' on' : ''}`}
        aria-pressed={on}
        title={on ? '켜짐 — 눌러서 끄기' : '꺼짐 — 눌러서 켜기'}
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onClick={onToggle}
      >
        <TI n={on ? 'checkbox' : 'square'} />
      </button>
    )
  }
  if (v == null || v === '') return null
  if (c.type === 'select' || c.type === 'status') return <Chip col={c} v={String(v)} />
  if (c.type === 'multiselect')
    return (
      <>
        {String(v)
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean)
          .map((x, i) => (
            <Chip key={i} col={c} v={x} />
          ))}
      </>
    )
  if (c.type === 'date') return <span className="ef-date">{String(v)}</span>
  if (c.type === 'daterange') {
    const p = parseRange(v)
    // 같은 해면 뒤쪽 연도를 줄인다 — 「2026-01-05 ~ 02-10」
    const e = p.e && p.s.slice(0, 5) === p.e.slice(0, 5) ? p.e.slice(5) : p.e
    return (
      <span className="ef-drange" title={`${p.s} ~ ${p.e}`}>
        <TI n="calendar-week" />
        {p.s} ~ {e}
      </span>
    )
  }
  if (c.type === 'datediff') {
    // 「총 N일 / N일 남음」(지시) — 총은 기간 시작~종료(양끝 포함), 남음은 오늘 → 종료일.
    // 사흘 안이면 주황, 지났으면 흐리게. 종료일만 있거나 시작만 있으면(총을 못 세면) 남음만
    const { left, span } = (v ?? {}) as { left: number | null; span: number | null }
    if (left == null) return null
    const txt = left > 0 ? `${left}일 남음` : left === 0 ? '오늘 마감' : `${-left}일 지남`
    return (
      <span className={`ef-ddiff${left < 0 ? ' past' : left <= 3 ? ' soon' : ''}`} title={DIFF_HINT}>
        <TI n="clock-hour-4" />
        {span ? <span className="ef-dtot">총 {span}일 /</span> : null}
        {txt}
      </span>
    )
  }
  if (c.type === 'person') {
    const s = String(v).trim()
    return (
      <span className="ef-person">
        <i className="ef-ava" style={{ background: autoColor(s) }}>{s.charAt(0)}</i>
        {s}
      </span>
    )
  }
  if (c.type === 'url' || c.type === 'email' || c.type === 'phone') {
    const s = String(v).trim()
    const href = c.type === 'email' ? 'mailto:' + s : c.type === 'phone' ? 'tel:' + s.replace(/[^\d+]/g, '') : /^https?:/i.test(s) ? s : 'https://' + s
    return (
      <a className="ef-link" href={href} target="_blank" rel="noopener noreferrer" onMouseDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} title={href}>
        <TI n={c.type === 'email' ? 'mail' : c.type === 'phone' ? 'phone' : 'link'} />
        {s}
      </a>
    )
  }
  if (c.type === 'formula') {
    // 수식 열 — 숫자는 ƒ 와 함께, 조건 결과(글자)는 그대로
    const n = typeof v === 'number' ? v : null
    return n === null ? <span className="ef-fxval">{String(v)}</span> : (
      <span className="ef-fxval">
        <TI n="math-function" />
        {numFmt(n)}
      </span>
    )
  }
  if (!isNumCol(c)) return <>{String(v)}</>
  const n = toNum(v)
  if (n === null) return null
  // max = 가득 기준(월 1 · 합계 12). 비율 그대로, 0 보다 크면 최소 3% 는 보이게, 넘치면 꽉 찬 주황
  const pct = max > 0 && n > 0 ? Math.max(3, Math.min(100, (n / max) * 100)) : 0
  return (
    <span
      className={`ef-numbar${fx ? ' ef-fxcell' : ''}`}
      title={fx ? `수식 = ${fx} — 칸을 고르면 보는 칸이 표시됩니다 · 값을 치면 수식이 지워집니다` : max > 0 ? `${numFmt(n)} / ${numFmt(max)} (${Math.round((n / max) * 100)}%)` : undefined}
    >
      {fx && <em className="ef-fxb">ƒ</em>}
      <i className={`ef-numbar-fill${max > 0 && n > max + 1e-9 ? ' hot' : ''}`} style={{ width: pct + '%' }} />
      <b>{numFmt(n)}</b>
    </span>
  )
}
