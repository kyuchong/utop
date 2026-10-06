import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Column } from '@tanstack/react-table'
import { TI } from './icons'
import {
  HUES,
  SHADE,
  TYPES,
  chipSize,
  chipStyle,
  hex2hsl,
  hasOptions,
  isNumCol,
  missingOptions,
  natural,
  nearest,
  numFmt,
  optColor,
  optCount,
  typeIcon,
  type EfColumn,
  type EfRow,
  type EfType,
} from './model'

/**
 * Effort Plan 의 떠 있는 것들 — 칸 값 고르기, 열 머리 메뉴(유형·옵션·필터·정렬), 옵션 색판, 행 메뉴.
 * 예전 14-resource-beta.js 의 Pop·SelectPicker·HeadMenu·_rscBetaOptMenu·RowMenu 를 옮겼다.
 * 모두 body 로 띄운다 — 표의 스크롤 틀에 잘리지 않게. 이름은 ef- 아래에만.
 */

/** 기준 요소 아래(side 면 오른쪽)에 띄우고, 바깥 누름·Esc 로 닫는 판 */
export function Pop({
  anchor,
  side,
  cls,
  onClose,
  children,
}: {
  anchor: HTMLElement
  side?: boolean
  cls?: string
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: -9999, top: -9999 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = anchor.getBoundingClientRect()
    if (!r.width && !r.height) return
    const vw = window.innerWidth
    const vh = window.innerHeight
    const w = el.offsetWidth
    const h = el.offsetHeight
    let left: number
    let top: number
    if (side) {
      left = r.right + 4
      if (left + w > vw - 8) left = Math.max(8, r.left - w - 4)
      top = Math.min(r.top, Math.max(8, vh - h - 8))
    } else {
      left = Math.max(8, Math.min(r.left, vw - w - 8))
      top = r.bottom + 4
      if (top + h > vh - 8) top = Math.max(8, r.top - h - 4)
    }
    setPos({ left, top })
  }, [anchor])
  useEffect(() => {
    const down = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      // 하위 메뉴·옵션 메뉴는 따로 떠 있으므로 「바깥」 으로 치지 않는다
      if (t.closest?.('.ef-submenu') || t.closest?.('.ef-optmenu')) return
      if (ref.current && !ref.current.contains(t) && !anchor.contains(t)) onClose()
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', down)
      document.removeEventListener('keydown', key)
    }
  }, [anchor, onClose])
  return createPortal(
    <div className={cls || 'ef-pop'} ref={ref} style={pos}>
      {children}
    </div>,
    document.body,
  )
}

export const Chip = ({ col, v }: { col?: EfColumn; v: string }) =>
  v === '' ? null : (
    <span className="ef-chip" style={chipStyle(optColor(col, v))}>
      {v}
    </span>
  )

/** 선택 칸 값 고르기 — 검색 + 목록 + 새 값 만들기 + 값 지우기 */
export function SelectPicker({
  anchor,
  col,
  value,
  options,
  onPick,
  onClose,
}: {
  anchor: HTMLElement
  col: EfColumn
  value: string
  options: string[]
  onPick: (v: string) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(() => Math.max(0, options.indexOf(value)))
  const first = useRef(true)
  const t = q.trim()
  let items = options.filter((o) => !t || o.toLowerCase().includes(t.toLowerCase())).map((v) => ({ v, create: false }))
  if (t && !options.includes(t)) items = [...items, { v: t, create: true }]
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setHi(0)
  }, [q])
  return (
    <Pop anchor={anchor} onClose={onClose}>
      <div className="ef-pick">
        <div className="ef-pick-hd">
          <Chip col={col} v={value} />
          <input
            autoFocus
            value={q}
            placeholder="검색하거나 새 값 입력"
            aria-label="값 검색 또는 입력"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setHi((h) => Math.min(items.length - 1, h + 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setHi((h) => Math.max(0, h - 1))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                const it = items[hi]
                if (it) onPick(it.v)
              }
            }}
          />
        </div>
        <div className="ef-pick-lbl">옵션을 고르거나 새로 만드세요</div>
        <div role="listbox" className="ef-pick-list">
          {items.map((it, i) => (
            <button
              key={(it.create ? '+' : '') + it.v}
              type="button"
              role="option"
              aria-selected={i === hi}
              className={`ef-pick-it${i === hi ? ' on' : ''}`}
              onMouseEnter={() => setHi(i)}
              onClick={() => onPick(it.v)}
            >
              {it.create && <span className="ef-pick-new">만들기</span>}
              <Chip col={col} v={it.v} />
              {it.v === value && <span className="ef-pick-ck">✓</span>}
            </button>
          ))}
        </div>
        {value && (
          <button type="button" className="ef-pick-it ef-pick-clr" onClick={() => onPick('')}>
            <TI n="eraser" /> 값 지우기
          </button>
        )}
      </div>
    </Pop>
  )
}

/** 옵션 하나 — 이름 · 색(17색×6단계) · 삭제를 한 자리에(노션식) */
function OptMenu({
  anchor,
  col,
  oi,
  rows,
  onRename,
  onColor,
  onDelete,
  onClose,
}: {
  anchor: HTMLElement
  col: EfColumn
  oi: number
  rows: EfRow[]
  onRename: (v: string) => void
  onColor: (c: string) => void
  onDelete: () => void
  onClose: () => void
}) {
  const opt = (col.options ?? [])[oi] ?? ''
  const [name, setName] = useState(opt)
  const inRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    inRef.current?.focus()
    inRef.current?.select()
  }, [])
  const now = nearest(optColor(col, opt))
  const done = () => {
    if (name.trim() && name.trim() !== opt) onRename(name.trim())
    onClose()
  }
  return (
    <Pop anchor={anchor} side cls="ef-optmenu" onClose={done}>
      <div className="ef-om-name">
        <input
          ref={inRef}
          value={name}
          aria-label="옵션 이름"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') {
              e.preventDefault()
              done()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              onClose()
            }
          }}
        />
        <span className="ef-om-cnt" title="이 옵션을 쓰는 행 수">
          {optCount(rows, col, opt)}
        </span>
      </div>
      <div className="ef-om-lbl">색</div>
      {HUES.map(([hn, cs]) => (
        <div className="ef-om-row" key={hn}>
          <span className="ef-om-cname">{hn}</span>
          {cs.map((cl, k) => {
            const hsl = hex2hsl(cl)
            const title = cl === '#000000' ? '검정' : cl === '#ffffff' ? '흰색' : SHADE[k] ? `${hn} · ${SHADE[k]}` : hn
            return (
              <button
                key={cl}
                type="button"
                title={title}
                className={`ef-om-sw${now === cl.toLowerCase() ? ' on' : ''}${hsl && hsl.l > 0.62 ? ' lt' : ''}`}
                style={{ background: cl }}
                onClick={() => onColor(cl)}
              >
                <TI n="check" />
              </button>
            )
          })}
        </div>
      ))}
      <div className="ef-om-hr" />
      <button
        type="button"
        className="ef-om-del"
        onClick={() => {
          onDelete()
          onClose()
        }}
      >
        <TI n="trash" />
        <span>삭제</span>
      </button>
    </Pop>
  )
}

/** 필터 몸통 — 숫자는 범위, 선택은 값 고르기, 글자는 포함 검색. 거르는 일은 TanStack 이 한다 */
export function FilterBody({ column, col, options }: { column: Column<EfRow, unknown>; col: EfColumn; options: string[] }) {
  const [fq, setFq] = useState('')
  const fv = column.getFilterValue()
  if (isNumCol(col)) {
    const mm = (column.getFacetedMinMaxValues() as [number, number] | undefined) ?? [0, 0]
    const v = (fv as [number?, number?] | undefined) ?? []
    const put = (i: 0 | 1, x: string) => {
      const n: [number | undefined, number | undefined] = [v[0], v[1]]
      const num = x.trim() === '' ? undefined : Number(x)
      n[i] = num === undefined || isNaN(num) ? undefined : num
      column.setFilterValue(n[0] === undefined && n[1] === undefined ? undefined : n)
    }
    return (
      <div className="ef-row2">
        <input inputMode="decimal" placeholder={'최소 ' + numFmt(mm[0] || 0)} defaultValue={v[0] ?? ''} onChange={(e) => put(0, e.target.value)} />
        <input inputMode="decimal" placeholder={'최대 ' + numFmt(mm[1] || 0)} defaultValue={v[1] ?? ''} onChange={(e) => put(1, e.target.value)} />
      </div>
    )
  }
  if (!hasOptions(col.type)) {
    return (
      <input
        className="ef-in"
        placeholder="포함할 글자"
        defaultValue={String(fv ?? '')}
        onChange={(e) => column.setFilterValue(e.target.value || undefined)}
      />
    )
  }
  const facets = column.getFacetedUniqueValues()
  const chosen = new Set((fv as string[] | undefined) ?? [])
  const t = fq.trim().toLowerCase()
  // 다중 선택은 「a, b」 한 덩어리가 아니라 값 하나하나로 센다
  const cnt = new Map<string, number>()
  facets.forEach((n, k) => {
    const parts = col.type === 'multiselect' ? String(k ?? '').split(',').map((x) => x.trim()) : [String(k ?? '')]
    parts.forEach((p) => p && cnt.set(p, (cnt.get(p) ?? 0) + n))
  })
  const all = [...options, ...[...cnt.keys()].filter((k) => !options.includes(k)).sort(natural)]
  const vals = all.filter((o) => (cnt.get(o) || chosen.has(o)) && (!t || o.toLowerCase().includes(t)))
  const toggle = (o: string) => {
    const s = new Set(chosen)
    if (s.has(o)) s.delete(o)
    else s.add(o)
    column.setFilterValue(s.size ? [...s] : undefined)
  }
  return (
    <div>
      {all.length > 5 && <input className="ef-in" placeholder="값 검색" value={fq} onChange={(e) => setFq(e.target.value)} />}
      <div className="ef-opts">
        {vals.length ? (
          vals.map((o) => (
            <label key={o} className="ef-mi ef-fopt" title={o}>
              <input type="checkbox" checked={chosen.has(o)} onChange={() => toggle(o)} />
              <span>{o}</span>
              <em className="ef-fcnt">{cnt.get(o) ?? 0}</em>
            </label>
          ))
        ) : (
          <div className="ef-empty-s">값이 없습니다</div>
        )}
      </div>
    </div>
  )
}

export interface HeadOps {
  rename: (title: string) => void
  setType: (t: EfType) => void
  toggleAutoSum: () => void
  insert: (after: boolean) => void
  duplicate: () => void
  remove: () => void
  group: (on: boolean) => void
  /** 옵션을 고쳤다 — 저장하고 다시 그린다 */
  touch: () => void
}

/** 열 머리 메뉴 — 위는 이름, 그 아래 유형·옵션·필터·정렬(옆으로 펼침)·그룹, 그 아래 열 조작 */
export function HeadMenu({
  anchor,
  column,
  col,
  rows,
  grouped,
  facetOptions,
  ops,
  onClose,
}: {
  anchor: HTMLElement
  column: Column<EfRow, unknown>
  col: EfColumn
  rows: EfRow[]
  grouped: boolean
  facetOptions: string[]
  ops: HeadOps
  onClose: () => void
}) {
  const [sub, setSub] = useState<{ kind: string; anchor: HTMLElement } | null>(null)
  const [optAt, setOptAt] = useState<{ oi: number; anchor: HTMLElement } | null>(null)
  const [title, setTitle] = useState(col.title)
  const nameRef = useRef<HTMLInputElement>(null)
  const num = isNumCol(col)
  const sorted = column.getIsSorted()
  const open = (kind: string) => (e: React.MouseEvent<HTMLButtonElement>) => {
    const a = e.currentTarget
    setSub((s) => (s && s.kind === kind ? null : { kind, anchor: a }))
  }
  const close = () => {
    setSub(null)
    setOptAt(null)
    if (title.trim() && title.trim() !== col.title) ops.rename(title.trim())
    onClose()
  }
  const item = (kind: string, ic: string, name: string, on: boolean) => (
    <button
      type="button"
      className={`ef-mi ef-mi-sub${sub?.kind === kind ? ' open' : ''}${on ? ' hasval' : ''}`}
      onClick={open(kind)}
    >
      <i className="ef-mi-ic"><TI n={ic} /></i>
      <span>{name}</span>
      <span className="ef-mi-arr">›</span>
    </button>
  )

  const miss = hasOptions(col.type) ? missingOptions(rows, col) : []
  return (
    <>
      <Pop anchor={anchor} cls="ef-menu" onClose={close}>
        <input
          ref={nameRef}
          className="ef-menu-name"
          value={title}
          aria-label="열 이름"
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          onBlur={() => title.trim() && title.trim() !== col.title && ops.rename(title.trim())}
        />
        <div className="ef-mlist">
          {item('type', typeIcon(col), '유형', false)}
          {hasOptions(col.type) && item('opts', 'tags', '옵션', false)}
          {item('filter', 'filter', '필터', column.getIsFiltered())}
          {item('sort', 'arrows-sort', '정렬', !!sorted)}
          <button
            type="button"
            className={`ef-mi${grouped ? ' on' : ''}${num ? ' off' : ''}`}
            title={num ? '숫자 열로는 묶지 않습니다' : '이 열 값으로 행을 묶습니다'}
            onClick={() => {
              if (num) return
              ops.group(!grouped)
              close()
            }}
          >
            <i className="ef-mi-ic"><TI n="layout-rows" /></i>
            <span>{grouped ? '그룹 해제' : '이 열로 그룹'}</span>
            {grouped && <i className="ef-mi-ck"><TI n="check" /></i>}
          </button>
        </div>
        <div className="ef-sep" />
        <div className="ef-mlist">
          {/* 메뉴는 열어 둔 채 맨 위 이름 칸으로 간다(예전과 같다) */}
          <button
            type="button"
            className="ef-mi"
            onClick={() => {
              setSub(null)
              nameRef.current?.focus()
              nameRef.current?.select()
            }}
          >
            <i className="ef-mi-ic"><TI n="pencil" /></i>
            <span>이름 바꾸기</span>
          </button>
          <button type="button" className="ef-mi" onClick={() => { setSub(null); ops.insert(false); close() }}>
            <i className="ef-mi-ic"><TI n="arrow-bar-to-left" /></i>
            <span>왼쪽에 열 추가</span>
          </button>
          <button type="button" className="ef-mi" onClick={() => { setSub(null); ops.insert(true); close() }}>
            <i className="ef-mi-ic"><TI n="arrow-bar-to-right" /></i>
            <span>오른쪽에 열 추가</span>
          </button>
          <button type="button" className="ef-mi" onClick={() => { setSub(null); ops.duplicate(); close() }}>
            <i className="ef-mi-ic"><TI n="copy" /></i>
            <span>열 복제</span>
          </button>
          <button type="button" className="ef-mi del" onClick={() => { setSub(null); ops.remove(); close() }}>
            <i className="ef-mi-ic"><TI n="trash" /></i>
            <span>열 삭제</span>
          </button>
        </div>
      </Pop>

      {sub?.kind === 'type' && (
        <Pop anchor={sub.anchor} side cls="ef-menu ef-submenu" onClose={() => setSub(null)}>
          <div className="ef-lbl">유형</div>
          <div className="ef-mlist">
            {TYPES.map((t) => (
              <button
                key={t.t}
                type="button"
                className={`ef-mi${col.type === t.t ? ' on' : ''}`}
                onClick={() => {
                  setSub(null)
                  ops.setType(t.t)
                }}
              >
                <i className="ef-mi-ic"><TI n={t.ic} /></i>
                <span>{t.n}</span>
                {col.type === t.t && <i className="ef-mi-ck"><TI n="check" /></i>}
              </button>
            ))}
          </div>
          {col.type === 'number' && (
            <>
              <div className="ef-sep" />
              <button type="button" className={`ef-mi${col.autoSum ? ' on' : ''}`} onClick={ops.toggleAutoSum}>
                <i className="ef-mi-ic"><TI n="sum" /></i>
                <span>합계 열(숫자 열 합)</span>
                {col.autoSum && <i className="ef-mi-ck"><TI n="check" /></i>}
              </button>
            </>
          )}
        </Pop>
      )}

      {sub?.kind === 'opts' && (
        <Pop anchor={sub.anchor} side cls="ef-menu ef-submenu ef-submenu-wide" onClose={() => setSub(null)}>
          <div className="ef-lbl">옵션</div>
          {miss.length > 0 && (
            <button
              type="button"
              className="ef-mi ef-sync"
              title={miss.slice(0, 12).join(', ')}
              onClick={() => {
                col.options = [...(col.options ?? []), ...miss].sort(natural)
                ops.touch()
              }}
            >
              <i className="ef-mi-ic"><TI n="refresh" /></i>
              <span>표에 쓰인 값 {miss.length}개 넣기</span>
            </button>
          )}
          <OptList col={col} rows={rows} onTouch={ops.touch} onMenu={(oi, a) => setOptAt({ oi, anchor: a })} />
          <input
            className="ef-in ef-optadd"
            placeholder="＋ 옵션 추가 후 Enter"
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              const v = e.currentTarget.value.trim()
              if (!v || (col.options ?? []).includes(v)) return
              e.currentTarget.value = ''
              col.options = [...(col.options ?? []), v]
              ops.touch()
            }}
          />
        </Pop>
      )}

      {sub?.kind === 'filter' && (
        <Pop anchor={sub.anchor} side cls="ef-menu ef-submenu ef-submenu-wide" onClose={() => setSub(null)}>
          <div className="ef-lbl">필터</div>
          <FilterBody column={column} col={col} options={facetOptions} />
          {column.getIsFiltered() && (
            <button type="button" className="ef-mi del" onClick={() => column.setFilterValue(undefined)}>
              <i className="ef-mi-ic"><TI n="filter-off" /></i>
              <span>필터 해제</span>
            </button>
          )}
        </Pop>
      )}

      {sub?.kind === 'sort' && (
        <Pop anchor={sub.anchor} side cls="ef-menu ef-submenu" onClose={() => setSub(null)}>
          <div className="ef-lbl">정렬</div>
          <div className="ef-mlist">
            <button type="button" className={`ef-mi${sorted === 'asc' ? ' on' : ''}`} onClick={() => { column.toggleSorting(false); close() }}>
              <i className="ef-mi-ic"><TI n="sort-ascending" /></i>
              <span>오름차순</span>
              {sorted === 'asc' && <i className="ef-mi-ck"><TI n="check" /></i>}
            </button>
            <button type="button" className={`ef-mi${sorted === 'desc' ? ' on' : ''}`} onClick={() => { column.toggleSorting(true); close() }}>
              <i className="ef-mi-ic"><TI n="sort-descending" /></i>
              <span>내림차순</span>
              {sorted === 'desc' && <i className="ef-mi-ck"><TI n="check" /></i>}
            </button>
            {sorted && (
              <button type="button" className="ef-mi" onClick={() => { column.clearSorting(); close() }}>
                <i className="ef-mi-ic"><TI n="x" /></i>
                <span>정렬 해제</span>
              </button>
            )}
          </div>
        </Pop>
      )}

      {optAt && (
        <OptMenu
          anchor={optAt.anchor}
          col={col}
          oi={optAt.oi}
          rows={rows}
          onClose={() => setOptAt(null)}
          onColor={(cl) => {
            const o = (col.options ?? [])[optAt.oi]
            if (o == null) return
            col.optColors = { ...(col.optColors ?? {}), [o]: cl }
            ops.touch()
          }}
          onDelete={() => {
            const o = (col.options ?? [])[optAt.oi]
            if (o == null) return
            col.options = (col.options ?? []).filter((_, i) => i !== optAt.oi)
            if (col.optColors) delete col.optColors[o]
            ops.touch()
          }}
          onRename={(nv) => {
            renameOption(rows, col, optAt.oi, nv)
            ops.touch()
          }}
        />
      )}
    </>
  )
}

/** 옵션 이름 바꾸기 — 목록·색·그 값을 쓰는 모든 행을 함께 고친다 */
export function renameOption(rows: EfRow[], col: EfColumn, oi: number, nv: string): boolean {
  const old = (col.options ?? [])[oi]
  if (old == null || !nv || nv === old) return false
  col.options![oi] = nv
  if (col.optColors && col.optColors[old] != null) {
    col.optColors[nv] = col.optColors[old]!
    delete col.optColors[old]
  }
  const multi = col.type === 'multiselect'
  rows.forEach((r) => {
    const v = r[col.id]
    if (v == null || v === '') return
    if (multi) {
      const parts = String(v).split(',').map((x) => x.trim())
      if (parts.includes(old)) r[col.id] = parts.map((x) => (x === old ? nv : x)).join(', ')
    } else if (String(v) === old) r[col.id] = nv
  })
  return true
}

/** 옵션 목록 — ⠿ 를 끌어 순서를 바꾸고, 칩을 눌러 이름을 고치고, 끝의 ⌄ 로 색·삭제 */
function OptList({
  col,
  rows,
  onTouch,
  onMenu,
}: {
  col: EfColumn
  rows: EfRow[]
  onTouch: () => void
  onMenu: (oi: number, anchor: HTMLElement) => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  /* 끄는 동안은 React 를 거치지 않고 transform 만 바꾼다 — 놓을 때 한 번만 반영 */
  const drag = (e: React.MouseEvent, from: number) => {
    if (e.button !== 0) return
    const box = boxRef.current
    if (!box) return
    const els = [...box.querySelectorAll<HTMLElement>('.ef-optrow')]
    if (els.length < 2) return
    e.preventDefault()
    const rs = els.map((el) => el.getBoundingClientRect())
    const step = rs.length > 1 ? rs[1]!.top - rs[0]!.top : rs[0]!.height
    const y0 = e.clientY
    let to = from
    let moved = false
    const apply = (dy: number) =>
      els.forEach((el, i) => {
        let t = ''
        if (i === from) t = `translateY(${dy}px)`
        else if (to > from && i > from && i <= to) t = `translateY(${-step}px)`
        else if (to < from && i >= to && i < from) t = `translateY(${step}px)`
        el.style.transform = t
      })
    const mv = (ev: MouseEvent) => {
      if (!moved && Math.abs(ev.clientY - y0) < 4) return
      moved = true
      els[from]!.classList.add('moving')
      const y = ev.clientY
      to = y < rs[0]!.top ? 0 : y >= rs[rs.length - 1]!.bottom ? rs.length - 1 : Math.max(0, rs.findIndex((r) => y >= r.top && y < r.bottom))
      apply(ev.clientY - y0)
    }
    const up = () => {
      document.removeEventListener('mousemove', mv, true)
      document.removeEventListener('mouseup', up, true)
      els.forEach((el) => {
        el.style.transform = ''
        el.classList.remove('moving')
      })
      if (moved && to !== from) {
        const os = [...(col.options ?? [])]
        const [m] = os.splice(from, 1)
        os.splice(to, 0, m!)
        col.options = os
        onTouch()
      }
    }
    document.addEventListener('mousemove', mv, true)
    document.addEventListener('mouseup', up, true)
  }
  return (
    <div className="ef-opts" ref={boxRef}>
      {(col.options ?? []).map((o, oi) => (
        <div key={o + '@' + oi} className="ef-optrow">
          <span className="ef-grip" title="끌어서 순서 이동" onMouseDown={(e) => drag(e, oi)}>
            ⠿
          </span>
          {/* 칩이 곧 입력칸 — 표에 보이는 색 그대로, 눌러 바로 이름을 고친다(예전과 같다) */}
          <input
            className="ef-optchip"
            defaultValue={o}
            size={chipSize(o)}
            aria-label="옵션 이름"
            style={chipStyle(optColor(col, o))}
            onInput={(e) => (e.currentTarget.size = chipSize(e.currentTarget.value))}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            onBlur={(e) => {
              if (renameOption(rows, col, oi, e.currentTarget.value.trim())) onTouch()
            }}
          />
          <button type="button" className="ef-optdots" title="이름·색·삭제" onClick={(e) => onMenu(oi, e.currentTarget)}>
            <TI n="chevron-down" />
          </button>
        </div>
      ))}
    </div>
  )
}

/** 행 우클릭 메뉴 — 지금은 삭제만(예전과 같다) */
export function RowMenu({ at, onDelete, onClose }: { at: { x: number; y: number }; onDelete: () => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const down = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onClose()
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', down)
      document.removeEventListener('keydown', key)
    }
  }, [onClose])
  return createPortal(
    <div className="ef-pop ef-rowmenu" ref={ref} style={{ left: at.x, top: at.y }}>
      <button type="button" className="ef-mi del" onClick={onDelete}>
        <i className="ef-mi-ic"><TI n="trash" /></i>
        <span>행 삭제</span>
      </button>
    </div>,
    document.body,
  )
}
