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
import { Chip, HeadMenu, RowMenu, SelectPicker, type HeadOps } from './EffortMenus'
import { TI } from './icons'
import {
  autoOptions,
  colSize,
  condMatch,
  defaultGroup,
  hasOptions,
  isNumCol,
  natural,
  newId,
  numFmt,
  recalcAuto,
  toNum,
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
}

const cellText = (v: unknown) => (v == null ? '' : String(v))

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

  // 검색과 툴바 조건식 필터는 표에 넘기기 전에 거른다(예전 _rscViewRows 와 같다) — 머리글 필터는 TanStack 이 거른다
  const data = useMemo(() => {
    const q = st.q.trim().toLowerCase()
    const conds = (st.conds ?? []).filter((f) => cols.some((c) => c.id === f.col))
    if (!q && !conds.length) return [...rows]
    const byId = new Map(cols.map((c) => [c.id, c]))
    return rows.filter(
      (r) =>
        (!q || cols.some((c) => cellText(r[c.id]).toLowerCase().includes(q))) &&
        conds.every((f) => condMatch(r, f, byId.get(f.col))),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, st.q, st.conds, ver])

  const max = useMemo(() => {
    const m: Record<string, number> = {}
    cols.forEach((c) => {
      if (!isNumCol(c)) return
      let mx = 0
      rows.forEach((r) => {
        const v = toNum(r[c.id])
        if (v !== null && v > mx) mx = v
      })
      m[c.id] = mx
    })
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, ver])

  const columns = useMemo<ColumnDef<EfRow>[]>(
    () =>
      cols.map((c) => {
        const num = isNumCol(c)
        return {
          id: c.id,
          accessorFn: (r: EfRow) => (num ? (toNum(r[c.id]) ?? undefined) : cellText(r[c.id]) || undefined),
          getGroupingValue: (r: EfRow) => cellText(r[c.id]),
          header: c.title,
          size: colSize(c),
          minSize: 36,
          meta: { col: c },
          sortUndefined: 'last' as const,
          sortingFn: num ? 'basic' : (a: Row<EfRow>, b: Row<EfRow>, id: string) => natural(cellText(a.getValue(id)), cellText(b.getValue(id))),
          filterFn: num ? fNum : c.type === 'multiselect' ? fMulti : hasOptions(c.type) ? fPick : fText,
          aggregationFn: num ? 'sum' : undefined,
          enableGrouping: !num,
        } satisfies ColumnDef<EfRow>
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cols, ver],
  )

  // ★ 표에 넘기는 상태 배열은 참조가 그대로여야 한다 — 그릴 때마다 새 배열을 주면 TanStack 이
  //   행 모델을 매번 다시 만들고, 그때마다 내부 상태를 되돌려(setState) 끝없이 다시 그린다(실제로 멈췄다)
  const idKey = cols.map((c) => c.id).join('|')
  // null = 아직 안 고름 → 기본 인원 열, '' = 그룹 없음
  const g0 = st.group === null ? defaultGroup(cols) : st.group
  const sorting = useMemo(() => st.sorting.filter((s) => idKey.split('|').includes(s.id)), [st.sorting, idKey])
  const columnFilters = useMemo(() => st.filters.filter((f) => idKey.split('|').includes(f.id)), [st.filters, idKey])
  const grouping = useMemo(() => (g0 && idKey.split('|').includes(g0) ? [g0] : []), [g0, idKey])
  const table = useReactTable<EfRow>({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      grouping,
      expanded,
      columnSizing: sizing,
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
  return { table, max, sizing, setSizing }
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

/** 선택 칸의 옵션 — 열 옵션 순서 그대로 + 표에만 쓰인 값 */
export function optionsOf(rows: EfRow[], c: EfColumn): string[] {
  const have = (c.options ?? []).filter((o) => o !== '' && o != null)
  const extra = new Set<string>()
  rows.forEach((r) => {
    const v = cellText(r[c.id])
    if (v && !have.includes(v)) extra.add(v)
  })
  return [...have, ...[...extra].sort(natural)]
}

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
  const { table, max, sizing, setSizing } = api
  const [edit, setEdit] = useState<{ src: EfRow; col: EfColumn; anchor: HTMLElement } | null>(null)
  const [sel, setSel] = useState<Sel | null>(null)
  const [menu, setMenu] = useState<{ anchor: HTMLElement; colId: string } | null>(null)
  const [rowMenu, setRowMenu] = useState<{ x: number; y: number; src: EfRow } | null>(null)
  const drag = useRef<{ mode: 'sel' | 'fill' | 'row'; r1: number; c1: number; c2?: number } | null>(null)
  const leafRef = useRef<EfRow[]>([])
  const paintRef = useRef<ReactNode>(null)
  const tblRef = useRef<HTMLTableElement>(null)

  const ordered = table.getVisibleLeafColumns().map((c) => (c.columnDef.meta as { col: EfColumn }).col)

  /** 실제 행에 쓴다. 바뀌었으면 true — 합계 열 다시 계산은 부른 쪽이 한 번만 */
  const put = (src: EfRow, c: EfColumn, raw: unknown): boolean => {
    if (!src || c.autoSum) return false
    let v: string | number
    if (c.type === 'number') {
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
    if (cellText(src[c.id]) === String(v)) return false // 안 바뀌었으면 저장도 안 함
    if (v === '') delete src[c.id]
    else src[c.id] = v
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
        c.type = t
        if (hasOptions(t)) autoOptions(allRows(), c)
        if (t !== 'number') c.autoSum = false
        recalcAuto(rows, cols)
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
        allRows().forEach((r) => r[c.id] != null && (r[nc.id] = r[c.id]))
        touch()
      },
      remove: () => {
        if (doc.columns.length <= 1) {
          toast('마지막 열은 삭제할 수 없습니다')
          return
        }
        if (!window.confirm(`「${c.title}」 열을 삭제할까요?`)) return
        doc.columns.splice(doc.columns.indexOf(c), 1)
        if (c.autoSum) Object.values(doc.pages).forEach((p) => p.rows.forEach((r) => delete r[c.id]))
        touch()
      },
      group: (on) => ctx.setSt({ group: on ? c.id : '' }),
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
            title="누르면 메뉴 (유형·필터·수식·정렬) · 끌면 열 이동"
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
  const bodyRow = (row: Row<EfRow>, n: number): ReactNode => {
    if (row.getIsGrouped()) {
      return (
        <tr key={row.id} className="ef-grp">
          <td className="ef-rh" />
          {row.getVisibleCells().map((cell) =>
            cell.getIsGrouped() ? (
              <td key={cell.id} className="ef-gcell">
                <button type="button" className="ef-gx" onClick={row.getToggleExpandedHandler()} aria-expanded={row.getIsExpanded()}>
                  <span className={`ef-tw${row.getIsExpanded() ? ' open' : ''}`}>▸</span>
                  <b>{String(row.groupingValue ?? '') || '(빈값)'}</b>
                  <span className="ef-cnt">{row.subRows.length}개</span>
                </button>
              </td>
            ) : (
              <td key={cell.id} />
            ),
          )}
        </tr>
      )
    }
    const src = row.original
    return (
      <tr key={row.id} onContextMenu={(e) => { e.preventDefault(); setRowMenu({ x: e.clientX, y: e.clientY, src }) }}>
        {/* 행 번호 — 누르면 그 행 통째로 선택, 끌면 여러 행, Shift 는 지금 선택에서 이어 붙인다 */}
        <td
          className={`ef-rh ef-rnum${n0 && n >= n0.r1 && n <= n0.r2 && n0.c1 === 0 && n0.c2 === ordered.length - 1 ? ' ef-rsel' : ''}`}
          data-r={n}
          data-c={-1}
          title="누르면 행 선택 · 끌면 여러 행"
          onMouseDown={(e) => {
            if (e.button !== 0) return
            e.preventDefault()
            const last = ordered.length - 1
            const from = e.shiftKey && sel ? sel.r1 : n
            drag.current = { mode: 'row', r1: from, c1: 0, c2: last }
            setSel({ r1: from, c1: 0, r2: n, c2: last })
            setEdit(null)
          }}
        >
          {n}
        </td>
        {row.getVisibleCells().map((cell, ci) => {
          const c = (cell.column.columnDef.meta as { col: EfColumn }).col
          const num = isNumCol(c)
          const editable = !c.autoSum
          const isEd = edit && edit.src === src && edit.col.id === c.id
          const picker = hasOptions(c.type) && c.type !== 'multiselect'
          if (isEd && !picker) {
            return (
              <td key={cell.id} className={`${num ? 'ef-n ' : ''}ef-editing`}>
                <input
                  className="ef-cell-in"
                  autoFocus
                  inputMode={num ? 'decimal' : undefined}
                  defaultValue={cellText(src[c.id])}
                  onFocus={(e) => e.currentTarget.select()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      commit(src, c, e.currentTarget.value)
                    } else if (e.key === 'Escape') {
                      e.preventDefault()
                      setEdit(null)
                    }
                  }}
                  onBlur={(e) => commit(src, c, e.currentTarget.value)}
                />
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
              className={`${num ? 'ef-n ' : ''}${editable ? 'ef-ed ' : 'ef-auto '}${isEd ? 'ef-editing ' : ''}${edge}`}
              onMouseDown={(e) => {
                if (e.button !== 0) return
                drag.current = { mode: 'sel', r1: n, c1: ci }
                setSel({ r1: n, c1: ci, r2: n, c2: ci })
                setEdit(null)
              }}
              onDoubleClick={editable ? (e) => setEdit({ src, col: c, anchor: e.currentTarget }) : undefined}
            >
              {/* 묶은 열(기본 인원)은 그룹 머리에만 쓰고 행에서는 비운다(예전과 같다) */}
              {cell.getIsPlaceholder() ? null : <CellView c={c} v={src[c.id]} max={max[c.id] ?? 0} />}
              {corner && (
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
      </tr>
    )
  }

  // 그룹 소계 — 그룹 맨 아래 한 줄. 값은 TanStack 이 aggregationFn(sum)으로 모은 것
  const subRow = (g: Row<EfRow>) => (
    <tr key={'sum-' + g.id} className="ef-rsum">
      <td className="ef-rh" />
      {ordered.map((c) => {
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
    table.getRowModel().rows.forEach((r) => {
      if (r.getIsGrouped()) {
        if (openGroup) body.push(subRow(openGroup))
        body.push(bodyRow(r, 0))
        openGroup = r.getIsExpanded() ? r : null
      } else {
        ord++
        leaf[ord] = r.original
        body.push(bodyRow(r, ord))
      }
    })
    if (openGroup) body.push(subRow(openGroup))
    leafRef.current = leaf
    painted = (
      <>
          <tbody>
            {body.length ? (
              body
            ) : (
              <tr>
                <td className="ef-rh" />
                <td colSpan={ordered.length} className="ef-none">
                  <span className="ef-none-msg">{rows.length ? '조건에 맞는 행이 없습니다' : '행이 없습니다 — [행 추가]로 시작하세요'}</span>
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td className="ef-rh" />
              {ordered.map((c) => {
                if (isNumCol(c)) {
                  const s = shown.reduce((a, r) => a + (toNum(r[c.id]) ?? 0), 0)
                  return (
                    <td key={c.id} className="ef-n">
                      {s ? (
                        <span className="ef-tot">
                          합계<b>{numFmt(Math.round(s * 1e4) / 1e4)}</b>
                        </span>
                      ) : null}
                    </td>
                  )
                }
                if (c.id === 'name')
                  return (
                    <td key={c.id}>
                      <span className="ef-flbl">인원</span>
                      <b>{new Set(shown.map((r) => cellText(r[c.id])).filter(Boolean)).size}</b>
                    </td>
                  )
                if (c.id === 'dept')
                  return (
                    <td key={c.id}>
                      <span className="ef-flbl">개수</span>
                      <b>{shown.length}</b>
                    </td>
                  )
                return <td key={c.id} />
              })}
            </tr>
          </tfoot>
      </>
    )
    paintRef.current = painted
  }

  const menuCol = menu ? table.getColumn(menu.colId) : undefined
  const menuEf = menuCol ? (menuCol.columnDef.meta as { col: EfColumn }).col : undefined
  return (
    <div className="ef-scroll" translate="no">
      <table className="ef-t" ref={tblRef} style={{ width: table.getTotalSize() + 44 }}>
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              <th className="ef-rh" />
              {hg.headers.map(headCell)}
            </tr>
          ))}
        </thead>
        {painted}
      </table>
      <div className="ef-hint">
        <b>머리글 클릭=메뉴</b>(유형·필터·수식·정렬) · <b>머리글 끌기=열 이동</b> · 셀 클릭=선택, 끌면 범위 · 오른쪽 아래 점 끌기=채우기 ·{' '}
        <b>셀 두 번 클릭=수정</b> · 행 우클릭=삭제
      </div>

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
          onClose={() => setMenu(null)}
        />
      )}
      {rowMenu && (
        <RowMenu
          at={rowMenu}
          onClose={() => setRowMenu(null)}
          onDelete={() => {
            const i = rows.indexOf(rowMenu.src)
            setRowMenu(null)
            if (i < 0) return
            rows.splice(i, 1)
            setSel(null)
            touch()
            toast('1행 삭제됨')
          }}
        />
      )}
    </div>
  )
}

/** 칸 보기 — 선택 계열은 칩, 숫자는 열 최대값 대비 막대(85% 넘으면 주황) */
function CellView({ c, v, max }: { c: EfColumn; v: unknown; max: number }) {
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
  if (c.type === 'checkbox') return <span className="ef-ck">{v === true || v === 'true' || v === '1' || v === 'Y' ? '☑' : '☐'}</span>
  if (!isNumCol(c)) return <>{String(v)}</>
  const n = toNum(v)
  if (n === null) return null
  const pct = max > 0 ? Math.max(4, Math.min(100, (n / max) * 100)) : 0
  return (
    <span className="ef-numbar">
      <i className={`ef-numbar-fill${max > 0 && n / max >= 0.85 ? ' hot' : ''}`} style={{ width: pct + '%' }} />
      <b>{numFmt(n)}</b>
    </span>
  )
}
