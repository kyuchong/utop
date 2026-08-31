import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { autoColor } from './palette'
import { CALC_LABEL, multiVals, type NCalc, type NCol, type NPerson, type NRow, type NView } from './types'
import {
  DateEditor, FieldMenu, PersonEditor, Pill, Pop, SelectEditor, TextEditor,
} from './NParts'
import {
  IcCheck, IcDots, IcFilter, IcGroup, IcHide, IcOpen, IcPlus, IcSearch,
  IcSortAsc, IcSortDesc, TYPE_ICON,
} from './NIcons'
import './NTable.css'

/**
 * 노션 꼴 표 — **기존 표를 건드리지 않고 옆에 새로 만든 부품**(승인).
 * 접두어는 전부 `ntb-` 라 기존 CSS 와 겹치지 않는다.
 *
 * 값(행)에는 색을 담지 않는다 — 색은 **필드 정의의 선택지**에만 있고
 * 그리는 순간 찾아 쓴다(스펙 3장). 그래서 값 하나를 새로 만들어도
 * 온 화면이 같은 색으로 따라온다.
 */
export interface NTableProps {
  columns: NCol[]
  rows: NRow[]
  view: NView
  onView: (v: NView) => void
  /** 필드 정의가 바뀌었다 — 이름·타입·폭·숨김·선택지·순서 */
  onColumns: (cols: NCol[]) => void
  /** 한 칸 값이 바뀌었다 */
  onCell: (rowId: string, key: string, value: string) => void
  people?: NPerson[]
  meName?: string
  /** ID 를 누르면 — 상세 화면으로(지시) */
  onOpen?: (rowId: string) => void
  /** 제목 앞 아이콘을 누르면 — 팝업으로(지시) */
  onPeek?: (rowId: string) => void
  /** ＋ 새 줄. 그룹 안에서 누르면 그 그룹 값이 실린다 */
  onNew?: (seed?: { key: string; value: string }) => void
  /** 여러 줄 골라 한 번에 — 무엇을 할지는 쓰는 쪽이 정한다 */
  onBulk?: (action: string, ids: string[]) => void
  /** 지금 체크된 줄 — 화면 제 도구줄(복제·삭제·⋯)이 이걸 본다 */
  onSelect?: (ids: string[]) => void
  /** 특별한 칸은 쓰는 쪽이 그린다(Map·REQ Map 처럼). undefined 를 주면 기본 그림 */
  renderCell?: (row: NRow, col: NCol) => React.ReactNode | undefined
  /** 값이 못 고치는 칸(계산된 값 등) */
  readOnlyKeys?: string[]
  /** 필드 **정의**(이름·타입·선택지·삽입·복제·삭제)를 잠근다 — 아직
      저장할 곳이 없는 화면에서 있는 척하지 않으려고(검증) */
  lockDefs?: boolean
  /** ID 로 쓸 열쇠(링크 꼴로 그린다) */
  idKey?: string
  /** 제목으로 쓸 열쇠(아이콘·열기 단추가 붙는다) */
  titleKey?: string
  title?: string
  busy?: boolean
  /** 도구줄 왼쪽 끝에 화면이 끼워 넣는 것(표 전환 단추 같은) */
  toolbarLeft?: React.ReactNode
  /** 열마다 아래에서 세는 것 — 고르면 바로 저장된다 */
  calcs?: Record<string, NCalc>
  onCalcs?: (v: Record<string, NCalc>) => void
  /** 한 쪽에 보여 줄 줄 수 */
  perPage?: number
  onPerPage?: (n: number) => void
}

/* 「복제」·「폴더 옮기기」 는 뺐다(지시) — 어느 화면도 받아 주지 않아
   눌러도 「아직 없습니다」 만 뜨는 죽은 단추였다 */
const BULK = [
  { k: 'assign', label: '담당 일괄' },
  { k: 'status', label: '상태 바꾸기' },
  { k: 'csv', label: 'CSV' },
  { k: 'del', label: '삭제', danger: true },
]

export default function NTable(p: NTableProps) {
  const {
    columns, rows, view, onView, onColumns, onCell,
    people = [], meName, onOpen, onPeek, onNew, onBulk,
    renderCell, readOnlyKeys = [], lockDefs,
    idKey = 'id', titleKey = 'title', title, busy, toolbarLeft,
    calcs = {}, onCalcs, perPage = 100, onPerPage,
  } = p

  const [menuAt, setMenuAt] = useState<{ key: string; x: number; y: number } | null>(null)
  const [cellAt, setCellAt] = useState<{ row: string; key: string; x: number; y: number } | null>(null)
  const [editAt, setEditAt] = useState<{ row: string; key: string } | null>(null)
  /* 고른 줄을 바깥에 흘려 준다 — 안 그러면 화면의 「복제·삭제·⋯」 가
     영영 안 켜진다(플랜에서 재현). 그릴 때가 아니라 바뀔 때만 알린다. */
  const [panel, setPanel] = useState<{ kind: 'filter' | 'sort' | 'props'; x: number; y: number } | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  useEffect(() => {
    p.onSelect?.([...checked])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked])
  const [folded, setFolded] = useState<Set<string>>(new Set())
  const [widths, setWidths] = useState<Record<string, number>>({})
  const [calcAt, setCalcAt] = useState<{ key: string; x: number; y: number } | null>(null)
  const [page, setPage] = useState(1)
  const drag = useRef<{ key: string; x0: number; w0: number } | null>(null)

  const vis = useMemo(() => columns.filter((c) => !c.hidden), [columns])
  const colOf = (k: string) => columns.find((c) => c.key === k)
  const wOf = (c: NCol) => widths[c.key] ?? c.width ?? 120

  /* 고른 줄이 사라지면(거르기·삭제) 체크도 함께 걷는다 — 안 그러면
     「N건 선택」 숫자와 실제가 어긋난다(전에 겪은 그것) */
  useEffect(() => {
    setChecked((s) => {
      if (!s.size) return s
      const live = new Set(rows.map((r) => r.__id))
      const n = new Set([...s].filter((id) => live.has(id)))
      return n.size === s.size ? s : n
    })
  }, [rows])

  /* ── 거르기 · 정렬 · 묶기 ── */
  const shown = useMemo(() => {
    const nq = view.q.trim().normalize('NFC').toLowerCase()
    let out = rows.filter((r) => {
      for (const f of view.filters) {
        if (!f.values.length) continue
        if (!f.values.includes(String(r[f.key] ?? ''))) return false
      }
      if (!nq) return true
      return vis.some((c) => String(r[c.key] ?? '').normalize('NFC').toLowerCase().includes(nq))
    })
    if (view.sorts.length) {
      out = [...out].sort((a, b) => {
        for (const s of view.sorts) {
          const x = String(a[s.key] ?? '')
          const y = String(b[s.key] ?? '')
          const d = x.localeCompare(y, 'ko', { numeric: true })
          if (d) return s.dir === 'asc' ? d : -d
        }
        return 0
      })
    }
    return out
  }, [rows, view, vis])

  /* 쪽 나누기 — 묶기를 켜면 나누지 않는다(묶음을 쪼개면 뜻이 깨진다) */
  const pageN = Math.max(1, Math.ceil(shown.length / Math.max(1, perPage)))
  useEffect(() => {
    if (page > pageN) setPage(pageN)
  }, [page, pageN])
  useEffect(() => setPage(1), [view.q, view.filters, view.sorts, perPage])
  const paged = useMemo(
    () => (view.groupBy ? shown : shown.slice((page - 1) * perPage, page * perPage)),
    [shown, view.groupBy, page, perPage],
  )

  /** 한 열의 계산 값 — 지금 보이는 줄들로 센다 */
  const calcOf = (c: NCol): string => {
    const k = calcs[c.key] ?? ''
    if (!k) return ''
    const vals = shown.map((r) => String(r[c.key] ?? '').trim())
    const filled = vals.filter(Boolean)
    const nums = filled.map((v) => Number(v.replace(/[^0-9.-]/g, ''))).filter((n) => !Number.isNaN(n))
    const fx = (n: number) => (Math.round(n * 100) / 100).toLocaleString()
    switch (k) {
      case 'count': return String(vals.length)
      case 'filled': return String(filled.length)
      case 'empty': return String(vals.length - filled.length)
      case 'pctFilled': return vals.length ? `${Math.round((filled.length / vals.length) * 100)}%` : '0%'
      case 'unique': return String(new Set(filled).size)
      case 'sum': return nums.length ? fx(nums.reduce((a, b) => a + b, 0)) : '–'
      case 'avg': return nums.length ? fx(nums.reduce((a, b) => a + b, 0) / nums.length) : '–'
      case 'min': return nums.length ? fx(Math.min(...nums)) : '–'
      case 'max': return nums.length ? fx(Math.max(...nums)) : '–'
      default: return ''
    }
  }

  const groups = useMemo(() => {
    if (!view.groupBy) return [{ value: '', rows: paged }]
    const gc = colOf(view.groupBy)
    const order = (gc?.options ?? []).map((o) => o.value)
    const m = new Map<string, NRow[]>()
    for (const r of paged) {
      const v = String(r[view.groupBy] ?? '')
      m.set(v, [...(m.get(v) ?? []), r])
    }
    const keys = [...m.keys()].sort((a, b) => {
      const ia = order.indexOf(a)
      const ib = order.indexOf(b)
      if (ia < 0 && ib < 0) return a.localeCompare(b, 'ko')
      if (ia < 0) return 1
      if (ib < 0) return -1
      return ia - ib
    })
    return keys.map((k) => ({ value: k, rows: m.get(k) ?? [] }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paged, view.groupBy, columns])

  /* ── 열 고치기 ── */
  const putCol = (key: string, next: NCol | null) => {
    if (!next) return onColumns(columns.filter((c) => c.key !== key))
    onColumns(columns.map((c) => (c.key === key ? next : c)))
  }
  const insertCol = (key: string, side: 'left' | 'right') => {
    const i = columns.findIndex((c) => c.key === key)
    const nc: NCol = { key: `f_${Date.now()}`, label: '새 속성', type: 'text', width: 110 }
    const next = [...columns]
    next.splice(side === 'left' ? i : i + 1, 0, nc)
    onColumns(next)
  }
  const dupCol = (key: string) => {
    const i = columns.findIndex((c) => c.key === key)
    const c = columns[i]
    if (!c) return
    const next = [...columns]
    next.splice(i + 1, 0, { ...c, key: `${c.key}_c${Date.now()}`, label: `${c.label} (복사)`, fixed: false })
    onColumns(next)
  }
  const addSort = (key: string, dir: 'asc' | 'desc') =>
    onView({ ...view, sorts: [{ key, dir }, ...view.sorts.filter((s) => s.key !== key)] })
  const addFilter = (key: string) =>
    onView({
      ...view,
      filters: view.filters.some((f) => f.key === key)
        ? view.filters
        : [...view.filters, { key, values: [] }],
    })

  /* ── 폭 끌기 ── */
  useEffect(() => {
    const mv = (e: PointerEvent) => {
      const d = drag.current
      if (!d) return
      setWidths((w) => ({ ...w, [d.key]: Math.max(56, d.w0 + (e.clientX - d.x0)) }))
    }
    const up = () => {
      const d = drag.current
      if (!d) return
      drag.current = null
      setWidths((w) => {
        const nw = w[d.key]
        if (nw) onColumns(columns.map((c) => (c.key === d.key ? { ...c, width: Math.round(nw) } : c)))
        return w
      })
    }
    window.addEventListener('pointermove', mv)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', mv)
      window.removeEventListener('pointerup', up)
    }
  }, [columns, onColumns])

  /* ── 한 칸 그리기 ── */
  const cell = (r: NRow, c: NCol) => {
    const own = renderCell?.(r, c)
    if (own !== undefined) return own
    const v = String(r[c.key] ?? '')
    /* ID 는 **못 고치는 칸 검사보다 먼저** 본다. 뒤에 두면 ID 를
       readOnlyKeys 에 넣는 순간(서버가 매기는 Key 라 당연히 넣는다)
       링크가 조용히 맨 글자로 떨어져 상세로 못 들어간다(플랜에서 재현). */
    if (c.key === idKey)
      return (
        <button type="button" className="ntb-id" title="상세 화면으로" onClick={() => onOpen?.(r.__id)}>
          {v}
        </button>
      )
    const ro = readOnlyKeys.includes(c.key)
    if (ro) return <span className="ntb-txt">{v || <span className="ntb-empty">–</span>}</span>
    const editing = editAt?.row === r.__id && editAt.key === c.key
    if (c.key === titleKey)
      return (
        <div className="ntb-ttl">
          <button type="button" className="ntb-tico" title="팝업으로 보기" onClick={() => onPeek?.(r.__id)}>
            {(() => { const I = TYPE_ICON.text; return <I /> })()}
          </button>
          {editing ? (
            <TextEditor
              value={v}
              onSave={(nv) => { onCell(r.__id, c.key, nv); setEditAt(null) }}
              onCancel={() => setEditAt(null)}
            />
          ) : (
            <span
              className="ntb-ttltxt"
              title="두 번 누르면 제목을 고칩니다"
              onDoubleClick={() => setEditAt({ row: r.__id, key: c.key })}
            >
              {v || '(제목 없음)'}
            </span>
          )}
          <button type="button" className="ntb-open" onClick={() => onOpen?.(r.__id)}>
            열기 <IcOpen />
          </button>
        </div>
      )
    if (c.type === 'select' || c.type === 'multiselect')
      return (
        <button
          type="button"
          className="ntb-cellb"
          onClick={(e) => {
            const b = e.currentTarget.getBoundingClientRect()
            setCellAt({ row: r.__id, key: c.key, x: b.left, y: b.bottom + 4 })
          }}
        >
          {c.type === 'multiselect' ? (
            /* 여러 개 고른 칸 — 담긴 만큼 알약을 잇는다 */
            multiVals(v).length ? (
              <span className="ntb-multi">
                {multiVals(v).map((x) => {
                  const o = (c.options ?? []).find((y) => y.value === x)
                  return <Pill key={x} value={x} color={o?.color} icon={o?.icon} show={o?.show} />
                })}
              </span>
            ) : (
              <span className="ntb-empty">–</span>
            )
          ) : (
            <Pill
              value={v}
              color={(c.options ?? []).find((o) => o.value === v)?.color}
              icon={(c.options ?? []).find((o) => o.value === v)?.icon}
              show={(c.options ?? []).find((o) => o.value === v)?.show}
              caret
            />
          )}
        </button>
      )
    if (c.type === 'person')
      return (
        <button
          type="button"
          className="ntb-cellb"
          onClick={(e) => {
            const b = e.currentTarget.getBoundingClientRect()
            setCellAt({ row: r.__id, key: c.key, x: b.left - 40, y: b.bottom + 4 })
          }}
        >
          {v ? (
            <span className="ntb-per"><span className="ntb-av">{v.slice(0, 1)}</span>{v}</span>
          ) : (
            <span className="ntb-empty">–</span>
          )}
        </button>
      )
    if (c.type === 'date')
      return (
        <button
          type="button"
          className="ntb-cellb"
          onClick={(e) => {
            const b = e.currentTarget.getBoundingClientRect()
            setCellAt({ row: r.__id, key: c.key, x: b.left - 60, y: b.bottom + 4 })
          }}
        >
          {v || <span className="ntb-empty">–</span>}
        </button>
      )
    return editing ? (
      <TextEditor
        value={v}
        numeric={c.type === 'number'}
        onSave={(nv) => { onCell(r.__id, c.key, nv); setEditAt(null) }}
        onCancel={() => setEditAt(null)}
      />
    ) : (
      <span className="ntb-txt" onDoubleClick={() => setEditAt({ row: r.__id, key: c.key })}>
        {v || <span className="ntb-empty">–</span>}
      </span>
    )
  }

  const allKeys = shown.map((r) => r.__id)
  const allOn = allKeys.length > 0 && allKeys.every((k) => checked.has(k))
  const curCol = menuAt ? colOf(menuAt.key) : undefined
  const curCell = cellAt ? colOf(cellAt.key) : undefined
  const curRow = cellAt ? rows.find((r) => r.__id === cellAt.row) : undefined

  return (
    <div className="ntb">
      {/* ── 도구줄 ── */}
      <div className="ntb-bar">
        {/* 탭이 이 자리에 온다(지시) — 건수는 아래 줄이 이미 말한다 */}
        {toolbarLeft}
        {title && <div className="ntb-title">{title}</div>}
        {busy && <div className="ntb-cnt">저장 중…</div>}
        <div className="ntb-tools">
          <div className="ntb-search">
            <IcSearch />
            <input
              placeholder="검색"
              value={view.q}
              onChange={(e) => onView({ ...view, q: e.target.value })}
            />
          </div>
          <button
            type="button"
            className={`ntb-tb${view.filters.length ? ' on' : ''}`}
            onClick={(e) => {
              const b = e.currentTarget.getBoundingClientRect()
              setPanel(panel?.kind === 'filter' ? null : { kind: 'filter', x: b.left - 90, y: b.bottom + 6 })
            }}
          >
            <IcFilter /> 필터
          </button>
          <button
            type="button"
            className={`ntb-tb${view.sorts.length ? ' on' : ''}`}
            onClick={(e) => {
              const b = e.currentTarget.getBoundingClientRect()
              setPanel(panel?.kind === 'sort' ? null : { kind: 'sort', x: b.left - 60, y: b.bottom + 6 })
            }}
          >
            <IcSortAsc /> 정렬
          </button>
          <button
            type="button"
            className={`ntb-tb${view.groupBy ? ' on' : ''}`}
            onClick={(e) => {
              const b = e.currentTarget.getBoundingClientRect()
              setPanel({ kind: 'props', x: b.left - 120, y: b.bottom + 6 })
            }}
          >
            <IcGroup /> 그룹
          </button>
          <button
            type="button"
            className="ntb-tb"
            onClick={(e) => {
              const b = e.currentTarget.getBoundingClientRect()
              setPanel(panel?.kind === 'props' ? null : { kind: 'props', x: b.left - 120, y: b.bottom + 6 })
            }}
          >
            <IcHide /> 속성
          </button>
          {onNew && (
            <button type="button" className="ntb-new" onClick={() => onNew()}>
              ＋ 새로 만들기
            </button>
          )}
        </div>
      </div>

      {/* ── 조건 칩 ── */}
      {(view.filters.length > 0 || view.sorts.length > 0 || view.groupBy) && (
        <div className="ntb-chips">
          {view.filters.map((f) => (
            <span className="ntb-chip on" key={f.key}>
              {colOf(f.key)?.label ?? f.key}:{' '}
              <b>{f.values.length ? f.values.join(', ') : '전체'}</b>
              <button
                type="button"
                onClick={() => onView({ ...view, filters: view.filters.filter((x) => x.key !== f.key) })}
              >
                ✕
              </button>
            </span>
          ))}
          {view.sorts.map((s) => (
            <span className="ntb-chip" key={s.key}>
              정렬: <b>{colOf(s.key)?.label ?? s.key} {s.dir === 'asc' ? '↑' : '↓'}</b>
              <button
                type="button"
                onClick={() => onView({ ...view, sorts: view.sorts.filter((x) => x.key !== s.key) })}
              >
                ✕
              </button>
            </span>
          ))}
          {view.groupBy && (
            <span className="ntb-chip">
              묶기: <b>{colOf(view.groupBy)?.label}</b>
              <button type="button" onClick={() => onView({ ...view, groupBy: '' })}>✕</button>
            </span>
          )}
        </div>
      )}

      {/* ── 표 ── */}
      <div className="ntb-wrap">
        <table className="ntb-tbl">
          <thead>
            <tr>
              <th className="ntb-gp">
                <div className="ntb-gpin">
                  {/* 줄에는 끌기 손잡이가 있고 머리줄에는 없어 체크박스가
                      25px 어긋났다(실측) — 같은 자리를 비워 맞춘다 */}
                  <IcDots className="ntb-grip" style={{ visibility: 'hidden' }} aria-hidden="true" />
                  <input
                    type="checkbox"
                    aria-label="모두 고르기"
                    checked={allOn}
                    onChange={() => setChecked(allOn ? new Set() : new Set(allKeys))}
                  />
                </div>
              </th>
              {vis.map((c) => {
                const I = TYPE_ICON[c.type]
                const s = view.sorts.find((x) => x.key === c.key)
                return (
                  <th key={c.key} style={{ width: wOf(c) }}>
                    <button
                      type="button"
                      className={`ntb-hb${menuAt?.key === c.key ? ' on' : ''}`}
                      onClick={(e) => {
                        const b = e.currentTarget.getBoundingClientRect()
                        setMenuAt(menuAt?.key === c.key ? null : { key: c.key, x: b.left, y: b.bottom + 4 })
                      }}
                    >
                      <I />
                      <span className="l">{c.label}</span>
                      {s && <span className="ntb-ar">{s.dir === 'asc' ? '↑' : '↓'}</span>}
                    </button>
                    <span
                      className="ntb-rs"
                      onPointerDown={(e) => {
                        e.preventDefault()
                        drag.current = { key: c.key, x0: e.clientX, w0: wOf(c) }
                      }}
                    />
                  </th>
                )
              })}
              {/* 남는 폭은 이 빈 칸이 먹는다 — 없으면 지정 폭에 비례해
                  모든 칸이 늘어나 번호 칸까지 넓어진다(지적) */}
              <th className="ntb-fill" />
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const gc = view.groupBy ? colOf(view.groupBy) : undefined
              const off = folded.has(g.value)
              return (
                <Fragment key={`g-${g.value}`}>
                  {view.groupBy && (
                    <tr className="ntb-grh">
                      <td colSpan={vis.length + 2}>
                        <button
                          type="button"
                          className="ntb-gtog"
                          onClick={() =>
                            setFolded((s) => {
                              const n = new Set(s)
                              if (n.has(g.value)) n.delete(g.value)
                              else n.add(g.value)
                              return n
                            })
                          }
                        >
                          {off ? '▸' : '▾'}
                        </button>
                        <Pill
                          value={g.value || '(없음)'}
                          color={(gc?.options ?? []).find((o) => o.value === g.value)?.color}
                          icon={(gc?.options ?? []).find((o) => o.value === g.value)?.icon}
                          show={(gc?.options ?? []).find((o) => o.value === g.value)?.show}
                        />
                        <span className="ntb-gcnt">{g.rows.length}건</span>
                        {onNew && view.groupBy && (
                          <button
                            type="button"
                            className="ntb-gnew"
                            onClick={() => onNew({ key: view.groupBy, value: g.value })}
                          >
                            ＋ 새로 만들기
                          </button>
                        )}
                      </td>
                    </tr>
                  )}
                  {!off &&
                    g.rows.map((r, i) => (
                      <tr key={r.__id} className={checked.has(r.__id) ? 'ntb-row on' : 'ntb-row'}>
                        <td className="ntb-gp">
                          <div className="ntb-gpin">
                            <IcDots className="ntb-grip" />
                            <input
                              type="checkbox"
                              checked={checked.has(r.__id)}
                              onChange={(e) =>
                                setChecked((s) => {
                                  const n = new Set(s)
                                  if (e.target.checked) n.add(r.__id)
                                  else n.delete(r.__id)
                                  return n
                                })
                              }
                            />
                            <span className="ntb-no">{i + 1}</span>
                          </div>
                        </td>
                        {vis.map((c) => (
                          <td key={c.key} style={{ width: wOf(c) }}>
                            {cell(r, c)}
                          </td>
                        ))}
                        <td className="ntb-fill" />
                      </tr>
                    ))}
                </Fragment>
              )
            })}
            {shown.length === 0 && (
              <tr>
                <td colSpan={vis.length + 2} className="ntb-none">
                  {rows.length ? '거른 결과가 없습니다' : '아직 줄이 없습니다'}
                </td>
              </tr>
            )}
            {onNew && (
              <tr>
                <td colSpan={vis.length + 2}>
                  <button type="button" className="ntb-add" onClick={() => onNew()}>
                    ＋ 새로 만들기
                  </button>
                </td>
              </tr>
            )}
          </tbody>
          {/* 열마다 아래에서 센다(지시) — 누르면 무엇을 셀지 고른다 */}
          <tfoot>
            <tr className="ntb-calcrow">
              <td className="ntb-gp" />
              {vis.map((c) => {
                const val = calcOf(c)
                return (
                  <td key={c.key}>
                    <button
                      type="button"
                      className={`ntb-calcb${val ? ' on' : ''}`}
                      title="이 열에서 셀 것을 고릅니다"
                      onClick={(e) => {
                        const b = e.currentTarget.getBoundingClientRect()
                        setCalcAt(calcAt?.key === c.key ? null : { key: c.key, x: b.left - 40, y: b.top - 300 })
                      }}
                    >
                      {val ? (
                        <>
                          <i>{CALC_LABEL[calcs[c.key] ?? '']}</i> {val}
                        </>
                      ) : (
                        '계산 ▾'
                      )}
                    </button>
                  </td>
                )
              })}
              <td className="ntb-fill" />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="ntb-foot">
        {shown.length}건
        <span className="ntb-pg">
          <span>줄 수</span>
          <select
            value={perPage}
            title="한 쪽에 보여 줄 줄 수"
            onChange={(e) => onPerPage?.(Number(e.target.value))}
          >
            {[25, 50, 75, 100].map((n) => (
              <option key={n} value={n}>{n}개</option>
            ))}
          </select>
        </span>
        {!view.groupBy && pageN > 1 && (
          <span className="ntb-pg">
            <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button>
            {page} / {pageN}
            <button type="button" disabled={page >= pageN} onClick={() => setPage(page + 1)}>›</button>
          </span>
        )}
        {view.groupBy && <span className="ntb-sub">묶는 동안은 쪽을 안 나눕니다</span>}
        <span className="sp" />
      </div>

      {/* ── 헤더 필드 메뉴 ── */}
      {menuAt && curCol && (
        <FieldMenu
          col={curCol}
          at={menuAt}
          canDelete={!lockDefs && vis.length > 1}
          lockDefs={lockDefs}
          onCol={(next) => putCol(curCol.key, next)}
          onSort={(d) => addSort(curCol.key, d)}
          onFilter={() => addFilter(curCol.key)}
          onGroup={() => onView({ ...view, groupBy: view.groupBy === curCol.key ? '' : curCol.key })}
          onInsert={(side) => insertCol(curCol.key, side)}
          onDup={() => dupCol(curCol.key)}
          onClose={() => setMenuAt(null)}
        />
      )}

      {/* ── 셀 편집기 ── */}
      {cellAt && curCell && curRow && (curCell.type === 'select' || curCell.type === 'multiselect') && (
        <SelectEditor
          lockDefs={lockDefs}
          col={curCell}
          value={String(curRow[curCell.key] ?? '')}
          at={cellAt}
          onPick={(v) => onCell(cellAt.row, cellAt.key, v)}
          onCol={(next) => putCol(curCell.key, next)}
          onClose={() => setCellAt(null)}
        />
      )}
      {cellAt && curCell && curRow && curCell.type === 'person' && (
        <PersonEditor
          people={people}
          me={meName}
          value={String(curRow[curCell.key] ?? '')}
          at={cellAt}
          onPick={(v) => onCell(cellAt.row, cellAt.key, v)}
          onClose={() => setCellAt(null)}
        />
      )}
      {cellAt && curCell && curRow && curCell.type === 'date' && (
        <DateEditor
          value={String(curRow[curCell.key] ?? '')}
          at={cellAt}
          onPick={(v) => onCell(cellAt.row, cellAt.key, v)}
          onClose={() => setCellAt(null)}
        />
      )}

      {/* ── 필터 · 정렬 · 속성 판 ── */}
      {panel?.kind === 'filter' && (
        <Pop at={panel} w={244} h={360} onClose={() => setPanel(null)}>
          <div className="ntb-sec">필터</div>
          {view.filters.map((f) => {
            const c = colOf(f.key)
            return (
              <div key={f.key} className="ntb-fblk">
                <div className="ntb-frow">
                  <b>{c?.label ?? f.key}</b>
                  <button
                    type="button"
                    onClick={() => onView({ ...view, filters: view.filters.filter((x) => x.key !== f.key) })}
                  >
                    ✕
                  </button>
                </div>
                <div className="ntb-fvals">
                  {(c?.options ?? []).map((o) => {
                    const on = f.values.includes(o.value)
                    return (
                      <button
                        type="button"
                        key={o.value}
                        className={on ? 'on' : ''}
                        onClick={() =>
                          onView({
                            ...view,
                            filters: view.filters.map((x) =>
                              x.key !== f.key
                                ? x
                                : {
                                    ...x,
                                    values: on
                                      ? x.values.filter((v) => v !== o.value)
                                      : [...x.values, o.value],
                                  },
                            ),
                          })
                        }
                      >
                        <Pill value={o.value} color={o.color} />
                        {on && <IcCheck className="ntb-chk" />}
                      </button>
                    )
                  })}
                  {!(c?.options ?? []).length && <span className="ntb-sub">선택지가 없는 필드입니다</span>}
                </div>
              </div>
            )
          })}
          <div className="ntb-hr" />
          <div className="ntb-sec">조건 추가</div>
          {columns
            .filter((c) => c.type === 'select' && !view.filters.some((f) => f.key === c.key))
            .map((c) => (
              <button type="button" className="ntb-mi" key={c.key} onClick={() => addFilter(c.key)}>
                <IcPlus />
                <span className="l">{c.label}</span>
              </button>
            ))}
        </Pop>
      )}
      {panel?.kind === 'sort' && (
        <Pop at={panel} w={228} h={320} onClose={() => setPanel(null)}>
          <div className="ntb-sec">정렬</div>
          {view.sorts.map((s) => (
            <div className="ntb-mi" key={s.key}>
              <span className="l">{colOf(s.key)?.label ?? s.key}</span>
              <button
                type="button"
                className="ntb-sub"
                onClick={() =>
                  onView({
                    ...view,
                    sorts: view.sorts.map((x) =>
                      x.key === s.key ? { ...x, dir: x.dir === 'asc' ? 'desc' : 'asc' } : x,
                    ),
                  })
                }
              >
                {s.dir === 'asc' ? '오름차순' : '내림차순'} ⇅
              </button>
              <button
                type="button"
                className="ntb-x"
                onClick={() => onView({ ...view, sorts: view.sorts.filter((x) => x.key !== s.key) })}
              >
                ✕
              </button>
            </div>
          ))}
          <div className="ntb-hr" />
          <div className="ntb-sec">정렬 추가</div>
          {columns
            .filter((c) => !view.sorts.some((s) => s.key === c.key))
            .map((c) => (
              <button type="button" className="ntb-mi" key={c.key} onClick={() => addSort(c.key, 'asc')}>
                <IcSortDesc />
                <span className="l">{c.label}</span>
              </button>
            ))}
        </Pop>
      )}
      {panel?.kind === 'props' && (
        <Pop at={panel} w={246} h={430} onClose={() => setPanel(null)}>
          <div className="ntb-sec">속성 — 눌러서 숨기기 · ↕ 로 순서</div>
          {columns.map((c, i) => (
            <div className="ntb-prow" key={c.key}>
              <button
                type="button"
                className="ntb-mv"
                title="위로"
                disabled={i === 0}
                onClick={() => {
                  const n = [...columns]
                  const [x] = n.splice(i, 1)
                  if (x) n.splice(i - 1, 0, x)
                  onColumns(n)
                }}
              >
                ↑
              </button>
              <button
                type="button"
                className="ntb-mv"
                title="아래로"
                disabled={i === columns.length - 1}
                onClick={() => {
                  const n = [...columns]
                  const [x] = n.splice(i, 1)
                  if (x) n.splice(i + 1, 0, x)
                  onColumns(n)
                }}
              >
                ↓
              </button>
              {(() => { const I = TYPE_ICON[c.type]; return <I /> })()}
              <span className="l">{c.label}</span>
              <button
                type="button"
                className={`ntb-tg${c.hidden ? ' off' : ''}`}
                disabled={c.fixed}
                onClick={() => putCol(c.key, { ...c, hidden: !c.hidden })}
              >
                <i />
              </button>
            </div>
          ))}
          <div className="ntb-hr" />
          <div className="ntb-sec">묶기</div>
          {columns
            .filter((c) => c.type === 'select')
            .map((c) => (
              <button
                type="button"
                className="ntb-mi"
                key={c.key}
                onClick={() => onView({ ...view, groupBy: view.groupBy === c.key ? '' : c.key })}
              >
                <IcGroup />
                <span className="l">{c.label}</span>
                {view.groupBy === c.key && <IcCheck className="ntb-chk" />}
              </button>
            ))}
          <div className="ntb-hr" />
          {!lockDefs && (
            <button
              type="button"
              className="ntb-mi"
              onClick={() => {
                /* 이름을 먼저 묻는다 — 「새 속성」 이라는 이름의 칸이 생기고
                   나서 다시 고치게 하면 두 걸음이다 */
                const nm = window.prompt('새 필드 이름')?.trim()
                if (!nm) return
                onColumns([
                  ...columns,
                  { key: `cf_${Date.now().toString(36)}`, label: nm, type: 'text', width: 110 },
                ])
              }}
            >
              <IcPlus />
              <span className="l">새 필드 만들기</span>
            </button>
          )}
          <button type="button" className="ntb-mi" onClick={() => onColumns(columns.map((c) => ({ ...c, hidden: false })))}>
            <span className="l">모두 보이기</span>
          </button>
        </Pop>
      )}

      {calcAt && (
        <Pop at={calcAt} w={168} h={330} onClose={() => setCalcAt(null)}>
          <div className="ntb-sec">이 열에서 셀 것</div>
          {(Object.keys(CALC_LABEL) as NCalc[]).map((k) => (
            <button
              type="button"
              key={k || 'none'}
              className="ntb-mi"
              onClick={() => {
                onCalcs?.({ ...calcs, [calcAt.key]: k })
                setCalcAt(null)
              }}
            >
              <span className="l">{CALC_LABEL[k]}</span>
              {(calcs[calcAt.key] ?? '') === k && <IcCheck className="ntb-chk" />}
            </button>
          ))}
        </Pop>
      )}

      {/* ── 여러 줄 골랐을 때 ── */}
      {checked.size > 0 && (
        <div className="ntb-bulk">
          <b>{checked.size}건 선택</b>
          {BULK.map((b) => (
            <button
              type="button"
              key={b.k}
              className={b.danger ? 'dg' : ''}
              onClick={() => onBulk?.(b.k, [...checked])}
            >
              {b.label}
            </button>
          ))}
          <button type="button" className="ntb-bx" onClick={() => setChecked(new Set())}>✕</button>
        </div>
      )}
    </div>
  )
}

/** 값에서 선택지를 만들어 붙인다 — 옛 자료에는 색이 없다 */
export function seedOptions(cols: NCol[], rows: NRow[]): NCol[] {
  return cols.map((c) => {
    if (c.type !== 'select') return c
    const have = new Set((c.options ?? []).map((o) => o.value))
    const add: Array<{ value: string; color: string }> = []
    for (const r of rows) {
      const v = String(r[c.key] ?? '').trim()
      if (v && !have.has(v)) {
        have.add(v)
        add.push({ value: v, color: autoColor(v) })
      }
    }
    return add.length ? { ...c, options: [...(c.options ?? []), ...add] } : c
  })
}
