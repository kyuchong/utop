import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
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
  diffSrcOf,
  hasOptions,
  isNumCol,
  missingOptions,
  FORMULA_FNS,
  FORMULA_OPS,
  calcFormula,
  formulaOf,
  formulaSrcCols,
  formulaText,
  type FormulaOp,
  type FormulaSpec,
  normDate,
  natural,
  nearest,
  numFmt,
  optColor,
  optCount,
  parseRange,
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
    <div className={cls || 'ef-pop'} data-efpop="" ref={ref} style={pos}>
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
  // 선택지가 바깥(설정)에 정해진 열은 새 값을 못 만든다(fixedOptions — REQ-Coverage 코드·만든 칸)
  if (t && !options.includes(t) && !col.fixedOptions) items = [...items, { v: t, create: true }]
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
        <div className="ef-pick-lbl">{col.fixedOptions ? '옵션을 고르세요 — 선택지는 설정에서 정합니다' : '옵션을 고르거나 새로 만드세요'}</div>
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

/** 다중 선택 고르기 — 체크 목록(예전 _rscOptDropdown multi). 누를 때마다 바로 저장하고 창은 열어 둔다 */
export function MultiPicker({
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
  const [cur, setCur] = useState(() => value.split(',').map((x) => x.trim()).filter(Boolean))
  const [q, setQ] = useState('')
  const t = q.trim()
  const all = [...options, ...cur.filter((x) => !options.includes(x))]
  const items = all.filter((o) => !t || o.toLowerCase().includes(t.toLowerCase()))
  const set = (n: string[]) => {
    setCur(n)
    onPick(n.join(', '))
  }
  const flip = (o: string) => set(cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o])
  return (
    <Pop anchor={anchor} onClose={onClose}>
      <div className="ef-pick">
        <div className="ef-pick-hd">
          <input
            autoFocus
            value={q}
            placeholder="검색하거나 새 값 입력 후 Enter"
            aria-label="값 검색 또는 입력"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && t) {
                e.preventDefault()
                if (!cur.includes(t)) set([...cur, t])
                setQ('')
              }
            }}
          />
        </div>
        <div className="ef-pick-lbl">여러 개 고를 수 있습니다{cur.length ? ` · ${cur.length}개 고름` : ''}</div>
        <div role="listbox" aria-multiselectable="true" className="ef-pick-list">
          {items.map((o) => {
            const on = cur.includes(o)
            return (
              <button key={o} type="button" role="option" aria-selected={on} className={`ef-pick-it${on ? ' on' : ''}`} onClick={() => flip(o)}>
                <TI n={on ? 'checkbox' : 'square'} className={on ? 'ef-pick-cb on' : 'ef-pick-cb'} />
                <Chip col={col} v={o} />
              </button>
            )
          })}
          {t && !all.includes(t) && !col.fixedOptions && (
            <button type="button" className="ef-pick-it" onClick={() => { set([...cur, t]); setQ('') }}>
              <span className="ef-pick-new">만들기</span>
              <Chip col={col} v={t} />
            </button>
          )}
        </div>
        {cur.length > 0 && (
          <button type="button" className="ef-pick-it ef-pick-clr" onClick={() => set([])}>
            <TI n="eraser" /> 모두 지우기
          </button>
        )}
      </div>
    </Pop>
  )
}

const ymdOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** 달력 한 장 — ‹ › 는 달만 넘기고, 날을 눌러야 onDay(지적: 기본 달력은 달을 넘기면 값이 골라졌다) */
function CalGrid({ init, cls, onDay }: { init: string | null; cls: (v: string) => string; onDay: (v: string) => void }) {
  const base = init ? new Date(init + 'T00:00:00') : new Date()
  const [ym, setYm] = useState({ y: base.getFullYear(), m: base.getMonth() })
  // 밖에서 날짜를 쳐 넣으면 그 달로 옮긴다
  useEffect(() => {
    if (init) setYm({ y: Number(init.slice(0, 4)), m: Number(init.slice(5, 7)) - 1 })
  }, [init])
  const first = new Date(ym.y, ym.m, 1)
  const start = new Date(ym.y, ym.m, 1 - first.getDay()) // 1일이 든 주의 일요일부터 6주
  const days = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  const move = (n: number) => setYm((o) => ({ y: new Date(o.y, o.m + n, 1).getFullYear(), m: new Date(o.y, o.m + n, 1).getMonth() }))
  const t = ymdOf(new Date())
  return (
    <>
      <div className="ef-cal-h">
        <button type="button" className="ef-cal-nav" aria-label="이전 달" onClick={() => move(-1)}>
          ‹
        </button>
        <b>
          {ym.y}년 {ym.m + 1}월
        </b>
        <button type="button" className="ef-cal-nav" aria-label="다음 달" onClick={() => move(1)}>
          ›
        </button>
      </div>
      <div className="ef-cal-g">
        {['일', '월', '화', '수', '목', '금', '토'].map((w, i) => (
          <span key={w} className={`ef-cal-w${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}`}>
            {w}
          </span>
        ))}
        {days.map((d) => {
          const v = ymdOf(d)
          return (
            <button
              key={v}
              type="button"
              className={`ef-cal-d${d.getMonth() !== ym.m ? ' out' : ''}${v === t ? ' today' : ''}${d.getDay() === 0 ? ' sun' : d.getDay() === 6 ? ' sat' : ''} ${cls(v)}`}
              onClick={() => onDay(v)}
            >
              {d.getDate()}
            </button>
          )
        })}
      </div>
    </>
  )
}

/** 날짜 고르기 — 직접 그린 달력(예전 Pikaday 처럼). 날을 누르면 바로 저장, 위 칸에 쳐 넣고 Enter 도 된다 */
export function DatePicker({ anchor, value, onPick, onClose }: { anchor: HTMLElement; value: string; onPick: (v: string) => void; onClose: () => void }) {
  const cur = normDate(value)
  const [txt, setTxt] = useState(cur ?? '')
  return (
    <Pop anchor={anchor} cls="ef-menu ef-cal" onClose={onClose}>
      <input
        className="ef-fsel ef-cal-in"
        autoFocus
        value={txt}
        placeholder="2026-01-05 입력 후 Enter"
        aria-label="날짜 입력"
        onChange={(e) => setTxt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onPick(txt.trim())
          }
        }}
      />
      <CalGrid init={normDate(txt) ?? cur} cls={(v) => (v === cur ? 'on' : '')} onDay={onPick} />
      <div className="ef-cal-f">
        <button type="button" className="ef-btn gh" onClick={() => onPick(ymdOf(new Date()))}>
          오늘
        </button>
        <span className="ef-sp" />
        {cur && (
          <button type="button" className="ef-btn gh" onClick={() => onPick('')}>
            지우기
          </button>
        )}
      </div>
    </Pop>
  )
}

/** 기간 고르기 — 같은 달력에서 시작 → 종료를 차례로 누른다(그 사이를 칠한다). 「시작 ~ 종료」 로 저장 */
export function RangePicker({ anchor, value, onPick, onClose }: { anchor: HTMLElement; value: string; onPick: (v: string) => void; onClose: () => void }) {
  const p = parseRange(value)
  const [s, setS] = useState(normDate(p.s) ?? '')
  const [e, setE] = useState(normDate(p.e) ?? '')
  /** 지금 고르는 쪽 — 위의 시작·종료 칸을 눌러 바꾼다(지적: 시작·종료를 골라 바꿀 수 없었다) */
  const [act, setAct] = useState<'s' | 'e'>(s ? 'e' : 's')
  const days = s && e ? Math.round((new Date(e + 'T00:00:00').getTime() - new Date(s + 'T00:00:00').getTime()) / 86400000) + 1 : 0
  const day = (v: string) => {
    if (act === 's') {
      setS(v)
      if (e && v > e) setE('') // 종료보다 뒤로 옮긴 시작 — 종료를 다시 고르게
      setAct('e')
    } else if (s && v < s) {
      // 시작보다 앞을 종료로 누르면 둘을 바꿔 잡는다
      setE(s)
      setS(v)
    } else {
      setE(v)
      if (!s) {
        setS(v)
      }
    }
  }
  const cls = (v: string) =>
    v === s || v === e ? 'on' : s && e && v > s && v < e ? 'mid' : ''
  // 달력은 지금 고르는 쪽의 달을 보인다
  const init = act === 's' ? s || e || null : e || s || null
  return (
    <Pop anchor={anchor} cls="ef-menu ef-cal ef-range" onClose={onClose}>
      <div className="ef-range-sum">
        <button type="button" className={act === 's' ? 'now' : ''} title="눌러서 시작일 고르기" onClick={() => setAct('s')}>
          <em>시작</em>
          {s || '—'}
        </button>
        <i>~</i>
        <button type="button" className={act === 'e' ? 'now' : ''} title="눌러서 종료일 고르기" onClick={() => setAct('e')}>
          <em>종료</em>
          {e || '—'}
        </button>
      </div>
      <div className="ef-range-hint">
        {act === 's' ? '달력에서 시작일을 누르세요' : '달력에서 종료일을 누르세요'}
        {days > 0 && <b>{days}일</b>}
      </div>
      <CalGrid init={init} cls={cls} onDay={day} />
      <div className="ef-cal-f">
        {value && (
          <button type="button" className="ef-btn gh" onClick={() => onPick('')}>
            지우기
          </button>
        )}
        <span className="ef-sp" />
        <button type="button" className="ef-btn" disabled={!(s && e)} onClick={() => onPick(`${s} ~ ${e}`)}>
          적용
        </button>
      </div>
    </Pop>
  )
}

/**
 * 수식 설정 — 함수 · 대상 열(체크한 차례) · 조건 · 미리보기(지시: 노션처럼 열 전체에 같은 식, 글 대신 골라서)
 */
export function FormulaEditor({
  anchor,
  col,
  cols,
  rows,
  onApply,
  onClose,
}: {
  anchor: HTMLElement
  col: EfColumn
  cols: EfColumn[]
  rows: EfRow[]
  onApply: (f: FormulaSpec) => void
  onClose: () => void
}) {
  const [f, setF] = useState<FormulaSpec>(() => formulaOf(col))
  const srcs = formulaSrcCols(cols, col)
  const flip = (id: string) => setF((o) => ({ ...o, cols: o.cols.includes(id) ? o.cols.filter((x) => x !== id) : [...o.cols, id] }))
  const ordered = f.fn === 'sub' || f.fn === 'div'
  const cond = f.cond ?? { col: srcs[0]?.id ?? '', op: '>' as FormulaOp, v: 0, t: '', f: '' }
  const setCond = (p: Partial<typeof cond>) => setF((o) => ({ ...o, cond: { ...cond, ...p } }))
  const prev = rows.slice(0, 4).map((r) => calcFormula(r, f.fn === 'if' ? { ...f, cond } : f, cols))
  return (
    <Pop anchor={anchor} cls="ef-menu ef-fxed" onClose={onClose}>
      <div className="ef-lbl">수식 — {col.title}</div>
      <div className="ef-fxfns">
        {FORMULA_FNS.map((x) => (
          <button key={x.k} type="button" className={f.fn === x.k ? 'on' : ''} title={x.tip} onClick={() => setF((o) => ({ ...o, fn: x.k }))}>
            {x.n}
          </button>
        ))}
      </div>
      {f.fn === 'if' ? (
        <div className="ef-fxcond">
          <div className="ef-fxrow">
            <select className="ef-fsel" value={cond.col} onChange={(e) => setCond({ col: e.target.value })} aria-label="조건 열">
              {srcs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <select className="ef-fsel ef-fxop" value={cond.op} onChange={(e) => setCond({ op: e.target.value as FormulaOp })} aria-label="비교">
              {FORMULA_OPS.map((o) => (
                <option key={o} value={o}>
                  {{ '>': '>', '>=': '≥', '<': '<', '<=': '≤', '=': '=', '!=': '≠' }[o]}
                </option>
              ))}
            </select>
            <input className="ef-fsel ef-fxnum" type="number" value={cond.v} onChange={(e) => setCond({ v: Number(e.target.value) || 0 })} aria-label="값" />
          </div>
          <div className="ef-fxrow">
            <span>맞으면</span>
            <input className="ef-fsel" value={cond.t} placeholder="예: 초과" onChange={(e) => setCond({ t: e.target.value })} />
          </div>
          <div className="ef-fxrow">
            <span>아니면</span>
            <input className="ef-fsel" value={cond.f} placeholder="예: 정상" onChange={(e) => setCond({ f: e.target.value })} />
          </div>
        </div>
      ) : (
        <>
          <div className="ef-lbl">대상 열{ordered ? ' — 체크한 차례로 계산' : ''}</div>
          <div className="ef-fxcols">
            {srcs.length ? (
              srcs.map((c) => {
                const i = f.cols.indexOf(c.id)
                return (
                  <button key={c.id} type="button" className={`ef-fxcol${i >= 0 ? ' on' : ''}`} onClick={() => flip(c.id)}>
                    <TI n={i >= 0 ? 'checkbox' : 'square'} />
                    <span>{c.title}</span>
                    {ordered && i >= 0 && <em>{i + 1}</em>}
                  </button>
                )
              })
            ) : (
              <div className="ef-src-none">숫자 열이 없습니다</div>
            )}
          </div>
        </>
      )}
      <div className="ef-fxprev">
        <b>{formulaText(f.fn === 'if' ? { ...f, cond } : f, cols)}</b>
        <span>미리보기: {prev.map((v) => (v === null ? '—' : typeof v === 'number' ? numFmt(v) : v)).join(' · ') || '행 없음'}</span>
      </div>
      <div className="ef-fxbtns">
        <button type="button" className="ef-btn gh" onClick={onClose}>
          취소
        </button>
        <button type="button" className="ef-btn" onClick={() => onApply(f.fn === 'if' ? { ...f, cond } : { fn: f.fn, cols: f.cols })}>
          적용
        </button>
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
  /** 남은 일수 열로 바꾸고(이미면 그대로) 볼 기간 열을 정한다 */
  setDiffSrc: (id: string) => void
  toggleAutoSum: () => void
  insert: (after: boolean) => void
  duplicate: () => void
  remove: () => void
  group: (on: boolean) => void
  /** 수식 열 — 수식 설정 창 열기 */
  editFormula: () => void
  /** 이 열 숨기기(보기마다) */
  hide: () => void
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
  allCols,
  lock,
  onClose,
}: {
  anchor: HTMLElement
  column: Column<EfRow, unknown>
  col: EfColumn
  /** 빌려 쓰는 표(Jira) — 필터·정렬·그룹·열 숨기기만(유형·옵션·이름·추가·복제·삭제 없음) */
  lock?: boolean
  /** 표의 모든 열 — 남은 일수가 볼 기간 열 목록 */
  allCols: EfColumn[]
  rows: EfRow[]
  grouped: boolean
  facetOptions: string[]
  ops: HeadOps
  onClose: () => void
}) {
  const [sub, setSub] = useState<{ kind: string; anchor: HTMLElement } | null>(null)
  /** 유형 › 남은 일수 옆에 펼친 기간 열 목록 */
  const [diffAt, setDiffAt] = useState<HTMLElement | null>(null)
  const ranges = allCols.filter((x) => x.type === 'daterange')
  const curSrc = diffSrcOf(allCols, col)
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
          readOnly={lock}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          onBlur={() => title.trim() && title.trim() !== col.title && ops.rename(title.trim())}
        />
        <div className="ef-mlist">
          {!lock && item('type', typeIcon(col), '유형', false)}
          {!lock && hasOptions(col.type) && item('opts', 'tags', '옵션', false)}
          {item('filter', 'filter', '필터', column.getIsFiltered())}
          {item('sort', 'arrows-sort', '정렬', !!sorted)}
          {!lock && col.type === 'formula' && (
            <button type="button" className="ef-mi" onClick={() => { setSub(null); close(); ops.editFormula() }}>
              <i className="ef-mi-ic"><TI n="math-function" /></i>
              <span>수식 설정</span>
            </button>
          )}
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
          {!lock && (<>
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
          </>)}
          <button type="button" className="ef-mi" onClick={() => { setSub(null); close(); ops.hide() }}>
            <i className="ef-mi-ic"><TI n="eye-off" /></i>
            <span>열 숨기기</span>
          </button>
          {!lock && (
            <button type="button" className="ef-mi del" onClick={() => { setSub(null); ops.remove(); close() }}>
              <i className="ef-mi-ic"><TI n="trash" /></i>
              <span>열 삭제</span>
            </button>
          )}
        </div>
      </Pop>

      {sub?.kind === 'type' && (
        <Pop anchor={sub.anchor} side cls="ef-menu ef-submenu" onClose={() => setSub(null)}>
          <div className="ef-lbl">유형</div>
          <div className="ef-mlist">
            {TYPES.map((t) =>
              t.t === 'datediff' ? (
                // 남은 일수 — 옆에 어느 기간 열로 셀지 고르는 목록을 펼친다(지시)
                <button
                  key={t.t}
                  type="button"
                  className={`ef-mi ef-mi-sub${col.type === t.t ? ' on' : ''}${diffAt ? ' open' : ''}`}
                  onMouseEnter={(e) => setDiffAt(e.currentTarget)}
                  onClick={(e) => setDiffAt(e.currentTarget)}
                >
                  <i className="ef-mi-ic"><TI n={t.ic} /></i>
                  <span>{t.n}</span>
                  {col.type === t.t && <i className="ef-mi-ck"><TI n="check" /></i>}
                  <span className="ef-mi-arr">›</span>
                </button>
              ) : (
                <button
                  key={t.t}
                  type="button"
                  className={`ef-mi${col.type === t.t ? ' on' : ''}`}
                  onMouseEnter={() => setDiffAt(null)}
                  onClick={() => {
                    setSub(null)
                    ops.setType(t.t)
                  }}
                >
                  <i className="ef-mi-ic"><TI n={t.ic} /></i>
                  <span>{t.n}</span>
                  {col.type === t.t && <i className="ef-mi-ck"><TI n="check" /></i>}
                </button>
              ),
            )}
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

      {sub?.kind === 'type' && diffAt && (
        <Pop anchor={diffAt} side cls="ef-menu ef-submenu ef-submenu-wide" onClose={() => setDiffAt(null)}>
          <div className="ef-lbl">어느 기간 열로 셀까요</div>
          <div className="ef-mlist">
            {ranges.length ? (
              ranges.map((x) => {
                const on = col.type === 'datediff' && curSrc?.id === x.id
                return (
                  <button
                    key={x.id}
                    type="button"
                    className={`ef-mi${on ? ' on' : ''}`}
                    onClick={() => {
                      setDiffAt(null)
                      setSub(null)
                      ops.setDiffSrc(x.id)
                    }}
                  >
                    <i className="ef-mi-ic"><TI n="calendar-week" /></i>
                    <span>{x.title}</span>
                    {on && <i className="ef-mi-ck"><TI n="check" /></i>}
                  </button>
                )
              })
            ) : (
              <div className="ef-empty-s">기간 열이 없습니다 — 먼저 기간 유형 열을 만드세요</div>
            )}
          </div>
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

/** 우클릭 메뉴 한 줄 — sep 이면 그 앞에 실금 */
export interface CtxItem { ic: string; label: string; on: () => void; del?: boolean; sep?: boolean }
/** 우클릭 메뉴 — 누른 자리에 뜬다(행 우클릭 · 머리글 우클릭이 같이 쓴다) */
export function CtxMenu({ at, items, onClose }: { at: { x: number; y: number }; items: CtxItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState(at)
  useLayoutEffect(() => {
    // 화면 끝에서 열면 안쪽으로 당긴다
    const el = ref.current
    if (!el) return
    setPos({ x: Math.min(at.x, window.innerWidth - el.offsetWidth - 8), y: Math.min(at.y, window.innerHeight - el.offsetHeight - 8) })
  }, [at])
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
    <div className="ef-pop ef-menu ef-rowmenu" ref={ref} style={{ left: pos.x, top: pos.y }} onContextMenu={(e) => e.preventDefault()}>
      {items.map((it, i) => (
        <Fragment key={i}>
          {it.sep && <div className="ef-sep" />}
          <button
            type="button"
            className={`ef-mi${it.del ? ' del' : ''}`}
            onClick={() => {
              onClose()
              it.on()
            }}
          >
            <i className="ef-mi-ic"><TI n={it.ic} /></i>
            <span>{it.label}</span>
          </button>
        </Fragment>
      ))}
    </div>,
    document.body,
  )
}

/**
 * 바닥줄 계산 고르기 — 노션 모양(지시): 자동 · 계산 안함 · 수 › · 비율(%) › · 더 많은 옵션 ›
 * 바닥줄 칸 아래로 연다(지시) — 아래가 모자라면 위로. 하위 메뉴는 그 줄 오른쪽(모자라면 왼쪽)에.
 */
export function CalcMenu({
  at,
  groups,
  cur,
  name,
  onPick,
  onClose,
}: {
  /** 누른 칸의 화면 위치 — 칸 바로 아래에 연다 */
  at: { x: number; top: number; bottom: number }
  groups: Array<{ sub?: string; keys: string[] }>
  cur: string
  name: (k: string) => string
  onPick: (k: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  /** 크기는 메뉴 상자로 잰다 — 바깥 상자(ref)는 바깥 누름 판정용이라 폭이 화면 전체다 */
  const boxRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: at.x, y: -9999 })
  const [open, setOpen] = useState<{ i: number; x: number; y: number; left: boolean } | null>(null)
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const h = el.offsetHeight
    const below = at.bottom + 4
    setPos({
      x: Math.max(8, Math.min(at.x, window.innerWidth - el.offsetWidth - 8)),
      y: below + h <= window.innerHeight - 8 ? below : Math.max(8, at.top - h - 4),
    })
  }, [at])
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
  const pick = (k: string) => {
    onPick(k)
    onClose()
  }
  const item = (k: string) => (
    <button key={k} type="button" className={`ef-mi${k === cur ? ' on' : ''}`} onClick={() => pick(k)}>
      <span>{name(k)}</span>
      {k === cur && <i className="ef-mi-ck"><TI n="check" /></i>}
    </button>
  )
  // 하위 메뉴 — 그 줄 오른쪽(모자라면 왼쪽), 화면 아래로 넘치면 위로 올린다
  const openSub = (i: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    const left = r.right + 220 > window.innerWidth
    const h = groups[i]!.keys.length * 31 + 14
    setOpen({ i, x: left ? r.left - 4 : r.right + 4, y: Math.max(8, Math.min(r.top - 6, window.innerHeight - h - 8)), left })
  }
  const sub = open && groups[open.i]
  return createPortal(
    // 하위 메뉴도 이 상자 안(DOM)에 두어 바깥 누름 판정에 같이 든다
    <div ref={ref} className="ef-calcmenu-root">
      <div ref={boxRef} className="ef-pop ef-menu ef-calcmenu" style={{ left: pos.x, top: pos.y }} onContextMenu={(e) => e.preventDefault()}>
        {groups.map((g, i) =>
          g.sub ? (
            <button
              key={g.sub}
              type="button"
              className={`ef-mi${open?.i === i ? ' open' : ''}${g.keys.includes(cur) ? ' on' : ''}`}
              onMouseEnter={(e) => openSub(i, e.currentTarget)}
              onClick={(e) => openSub(i, e.currentTarget)}
            >
              <span>{g.sub}</span>
              <i className="ef-mi-arr"><TI n="chevron-right" /></i>
            </button>
          ) : (
            <div key={i} onMouseEnter={() => setOpen(null)}>
              {g.keys.map(item)}
              <div className="ef-sep" />
            </div>
          ),
        )}
      </div>
      {sub && (
        <div
          className="ef-pop ef-menu ef-submenu ef-submenu-wide"
          style={open.left ? { right: window.innerWidth - open.x, top: open.y } : { left: open.x, top: open.y }}
        >
          {sub.keys.map(item)}
        </div>
      )}
    </div>,
    document.body,
  )
}
