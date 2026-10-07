import { Fragment, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { TI } from './icons'
import { autoColor, defaultGroup, isNumCol, numFmt, parseRange, toNum, type EfColumn, type EfRow, type EfView } from './model'

/**
 * Effort Plan 타임라인 보기(지적: 구현 안 됨).
 *
 * 예전(13-resource.js _rscRenderGantt)은 Frappe Gantt 로 **기간 열 1개 또는 날짜 열 2개**가 있어야 그렸다.
 * 인원 투입 표는 날짜 대신 01~12월 숫자 열이라 예전 방식으로는 아무것도 안 나온다. 그래서 두 가지를 그린다.
 *   · 월 모드(날짜 열이 없고 숫자 열이 있을 때) — 묶기 열 값(기본 인원)마다 한 줄에 월별 투입,
 *     펼치면 그 행들이 투입된 달에 걸친 막대(달마다 공수 표시)
 *   · 날짜 모드(기간 열 또는 날짜 열 2개) — 예전처럼 시작~완료 막대
 * 라이브러리 없이 그린다 — 인터넷이 안 되는 서버(252)에서도 보이게.
 * 묶기·막대 이름 열은 보기마다 v.tlBy · v.tlLabel 에 둔다.
 */

const cellText = (v: unknown) => (v == null ? '' : String(v))
const NONE = '(빈값)'

/** 묶기·막대 이름이 될 수 있는 열 — 숫자·합계 열 빼고 */
export const tlCols = (cols: EfColumn[]) => cols.filter((c) => !isNumCol(c))
export function tlByOf(view: EfView, cols: EfColumn[]) {
  return cols.find((c) => c.id === view.tlBy && !isNumCol(c)) ?? cols.find((c) => c.id === defaultGroup(cols))
}
export function tlLabelOf(view: EfView, cols: EfColumn[]) {
  const by = tlByOf(view, cols)
  return (
    cols.find((c) => c.id === view.tlLabel && !isNumCol(c)) ??
    cols.find((c) => c.type === 'text' && c.id !== by?.id) ??
    tlCols(cols).find((c) => c.id !== by?.id)
  )
}

export { parseRange }
const toDate = (s: string) => {
  const m = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/.exec(s.trim())
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
}

/** 날짜 모드의 시작·완료 — 기간 열 우선, 없으면 날짜 열 앞의 둘(예전과 같다) */
export function dateSpanOf(cols: EfColumn[]): ((r: EfRow) => { s: Date; e: Date } | null) | null {
  const dr = cols.find((c) => c.type === 'daterange')
  if (dr)
    return (r) => {
      const p = parseRange(r[dr.id])
      const s = toDate(p.s)
      const e = toDate(p.e) ?? s
      return s && e ? { s, e: e < s ? s : e } : null
    }
  const ds = cols.filter((c) => c.type === 'date')
  if (ds.length < 2) return null
  return (r) => {
    const s = toDate(cellText(r[ds[0]!.id]))
    const e = toDate(cellText(r[ds[1]!.id])) ?? s
    return s && e ? { s, e: e < s ? s : e } : null
  }
}

/** 그릴 수 있는 방식 — 월 열(숫자 열) · 날짜(기간 열 또는 날짜 열 둘). 둘 다면 보기에서 고른다(v.tlMode, 기본 월) */
export function tlModes(cols: EfColumn[]): Array<'month' | 'date'> {
  const m: Array<'month' | 'date'> = []
  if (cols.some((c) => c.type === 'number' && !c.autoSum)) m.push('month')
  if (dateSpanOf(cols)) m.push('date')
  return m
}
export function tlModeOf(view: EfView, cols: EfColumn[]) {
  const m = tlModes(cols)
  return m.includes(view.tlMode as 'month' | 'date') ? (view.tlMode as 'month' | 'date') : m[0]
}

/** 월 모드 — 값이 있는 달이 이어진 덩어리마다 막대 하나 */
export function monthSegments(r: EfRow, months: EfColumn[]) {
  const out: Array<{ a: number; b: number; v: Array<number | null> }> = []
  let cur: { a: number; b: number; v: Array<number | null> } | null = null
  months.forEach((c, i) => {
    const n = toNum(r[c.id])
    if (n !== null && n > 0) {
      if (cur && cur.b === i - 1) {
        cur.b = i
        cur.v.push(n)
      } else {
        cur = { a: i, b: i, v: [n] }
        out.push(cur)
      }
    }
  })
  return out
}

/** 묶기 열 값마다 행 — 이름 차례, 빈값은 맨 뒤 */
export function tlGroups(rows: EfRow[], by: EfColumn | undefined) {
  const m = new Map<string, EfRow[]>()
  rows.forEach((r) => {
    const k = (by && cellText(r[by.id]).trim()) || NONE
    m.set(k, [...(m.get(k) ?? []), r])
  })
  return [...m.entries()]
    .map(([k, rs]) => ({ k, rs }))
    .sort((a, b) => (a.k === NONE ? 1 : b.k === NONE ? -1 : a.k.localeCompare(b.k, 'ko')))
}

/**
 * 폭 — 보기마다 둔다(지적: 열 폭 조절이 안 된다). 머리줄 경계를 끌어 바꾸고, 두 번 누르면 기본.
 *   · v.tlWs[달 키] — 달 칸마다 따로(지적: 끈 열만 늘어야 한다). 키는 월 모드면 열 id, 날짜 모드면 'YYYY-MM'
 *   · v.tlLabW — 왼쪽 이름 기둥. (잠깐 있던 v.tlW — 모든 달을 한꺼번에 — 는 읽지 않는다: 그게 지적받은 동작이다)
 */
export const TL_W = 66
export const TL_LAB = 230
const clamp = (v: unknown, lo: number, hi: number, d: number) => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : d
  return Math.round(Math.max(lo, Math.min(hi, n)))
}
const clampW = (n: unknown) => clamp(n, 24, 240, TL_W)
const clampLab = (n: unknown) => clamp(n, 120, 640, TL_LAB)
export const tlLabOf = (v: EfView) => clampLab(v.tlLabW)
/** 그 달 칸의 폭 — 따로 정한 값, 없으면 보기 기본 */
export function tlColW(v: EfView, k: string) {
  const ws = v.tlWs as Record<string, unknown> | undefined
  return ws && ws[k] !== undefined ? clampW(ws[k]) : TL_W
}
/** 칸 폭들 → 왼쪽 끝 위치들(누적) */
export const tlOffsets = (ws: number[]) => ws.reduce<number[]>((a, _w, i) => (a.push(i ? a[i - 1]! + ws[i - 1]! : 0), a), [])
type TlLive = { k?: string; w?: number; lab?: number }
const fmtM = (d: Date) => `${String(d.getFullYear()).slice(2)}.${String(d.getMonth() + 1).padStart(2, '0')}`

export function EfTimeline({ cols, rows, view, year, touch }: { cols: EfColumn[]; rows: EfRow[]; view: EfView; year: string; touch: () => void }) {
  // 끄는 동안은 여기 값으로 바로 그리고, 놓을 때 보기에 적어 저장한다
  const [live, setLive] = useState<TlLive | null>(null)
  /**
   * 마우스를 올리면 보이는 검은 설명(지시: 막대가 좁아도 값이 보이게) — 이름·기간(일수)·그 행의 다른 값.
   * 브라우저 흰 설명(title)은 두지 않는다(두 개가 겹친다)
   */
  const [hint, setHint] = useState<{ x: number; y: number; head: string; lines: string[] } | null>(null)
  const hov = (head: string, lines: string[]) => ({
    onMouseEnter: (e: React.MouseEvent) => setHint({ x: e.clientX, y: e.clientY, head, lines }),
    onMouseMove: (e: React.MouseEvent) => setHint((h) => (h ? { ...h, x: e.clientX, y: e.clientY } : h)),
    onMouseLeave: () => setHint(null),
  })
  // 올린 막대가 다시 그려지며 사라지면(기준·묶기 바꿈, 접기) mouseleave 가 안 와 설명이 남는다 — 그때·구를 때 지운다
  useEffect(() => setHint(null), [view.tlMode, view.tlBy, view.tlLabel, rows, cols])
  useEffect(() => {
    if (!hint) return
    const off = () => setHint(null)
    window.addEventListener('scroll', off, true)
    window.addEventListener('mousedown', off, true)
    return () => {
      window.removeEventListener('scroll', off, true)
      window.removeEventListener('mousedown', off, true)
    }
  }, [hint])
  const hintEl =
    hint &&
    createPortal(
      <div className="ef-tl-hint" style={{ left: Math.min(hint.x + 14, window.innerWidth - 300), top: Math.min(hint.y + 16, window.innerHeight - 40 - hint.lines.length * 17) }}>
        <b>{hint.head}</b>
        {hint.lines.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>,
      document.body,
    )
  const LAB = live?.lab ?? tlLabOf(view)
  const colW = (k: string) => (live?.k === k && live.w !== undefined ? live.w : tlColW(view, k))
  /** 머리줄 칸들(키·글·이번 달) → 폭·위치까지 붙인 틀 값 */
  const layout = (axis: Array<{ k: string; t: string; now: boolean }>): TlSizing => {
    const ws = axis.map((a) => colW(a.k))
    return {
      LAB,
      axis,
      ws,
      xs: tlOffsets(ws),
      onLive: setLive,
      onDone: (p) => {
        setLive(null)
        if (p.lab !== undefined) view.tlLabW = p.lab
        if (p.k !== undefined) {
          const m = { ...((view.tlWs as Record<string, number> | undefined) ?? {}) }
          if (p.w === undefined) delete m[p.k]
          else m[p.k] = p.w
          view.tlWs = m
        }
        touch()
      },
    }
  }
  const by = tlByOf(view, cols)
  const lab = tlLabelOf(view, cols)
  const mode = tlModeOf(view, cols)
  const span = useMemo(() => (mode === 'date' ? dateSpanOf(cols) : null), [cols, mode])
  const months = useMemo(() => cols.filter((c) => c.type === 'number' && !c.autoSum), [cols])
  const groups = useMemo(() => tlGroups(rows, by), [rows, by])
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const allOpen = groups.length > 0 && groups.every((g) => open.has(g.k))
  const flip = (k: string) =>
    setOpen((o) => {
      const n = new Set(o)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })
  const label = (r: EfRow) => (lab && cellText(r[lab.id])) || '(이름 없음)'
  const tipLines = (r: EfRow) => cols.filter((c) => !isNumCol(c) && cellText(r[c.id])).map((c) => `${c.title}: ${cellText(r[c.id])}`)

  // ── 날짜 모드 — 자료의 첫 달부터 마지막 달까지(최대 60달) ──
  const dated = useMemo(() => {
    if (!span) return null
    const items = rows.map((r) => ({ r, d: span(r) })).filter((x): x is { r: EfRow; d: { s: Date; e: Date } } => !!x.d)
    if (!items.length) return { items, axis: [] as Date[] }
    const min = new Date(Math.min(...items.map((x) => x.d.s.getTime())))
    const max = new Date(Math.max(...items.map((x) => x.d.e.getTime())))
    const axis: Date[] = []
    for (let d = new Date(min.getFullYear(), min.getMonth(), 1); d <= max && axis.length < 60; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) axis.push(d)
    return { items, axis }
  }, [span, rows])

  if (!mode)
    return <div className="ef-empty">타임라인을 그릴 열이 없습니다 — 기간 열 1개, 날짜 열 2개(시작·완료), 또는 월 숫자 열이 있어야 합니다</div>

  if (dated) {
    const { items, axis } = dated
    if (!items.length) return <div className="ef-empty">시작·완료일이 입력된 행이 없습니다</div>
    const x0 = axis[0]!
    const today = new Date()
    const sz = layout(axis.map((d) => ({ k: fmtKey(d), t: fmtM(d), now: d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() })))
    const total = sz.xs[sz.xs.length - 1]! + sz.ws[sz.ws.length - 1]!
    // 달마다 폭이 달라서 그 달 칸 안에서 날짜 비율로 놓는다
    const at = (d: Date, plusDay: number) => {
      const mi = (d.getFullYear() - x0.getFullYear()) * 12 + d.getMonth() - x0.getMonth()
      if (mi < 0) return 0
      if (mi >= axis.length) return total
      const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
      return sz.xs[mi]! + ((d.getDate() - 1 + plusDay) / dim) * sz.ws[mi]!
    }
    const pos = (d: Date) => at(d, 0)
    const end = (d: Date) => at(d, 1)
    const todayX = today >= x0 && today <= new Date(axis[axis.length - 1]!.getFullYear(), axis[axis.length - 1]!.getMonth() + 1, 0) ? pos(today) : null
    const byRow = new Map(items.map((x) => [x.r, x.d]))
    const dgroups = tlGroups(items.map((x) => x.r), by)
    return (
      <Frame
        sz={sz}
        allOpen={dgroups.every((g) => open.has(g.k))}
        onAll={() => setOpen(dgroups.every((g) => open.has(g.k)) ? new Set() : new Set(dgroups.map((g) => g.k)))}
        nowX={todayX}
      >
        {dgroups.map((g) => {
          const ds = g.rs.map((r) => byRow.get(r)!)
          const s = new Date(Math.min(...ds.map((x) => x.s.getTime())))
          const e = new Date(Math.max(...ds.map((x) => x.e.getTime())))
          const on = open.has(g.k)
          return (
            <Fragment key={g.k}>
              <GroupHead k={g.k} n={g.rs.length} on={on} onFlip={() => flip(g.k)} by={by} sub={fmtSpan(s, e)}>
                <div className="ef-tl-sum" style={{ left: pos(s), width: Math.max(8, end(e) - pos(s)) }} {...hov(g.k, [periodText(s, e), `${g.rs.length}건`])} />
              </GroupHead>
              {on &&
                g.rs.map((r, i) => {
                  const d = byRow.get(r)!
                  const c = autoColor(label(r))
                  return (
                    <div className="ef-tl-row" key={i}>
                      {/* 왼쪽 이름 기둥에 기간도 — 막대 폭과 상관없이 늘 보인다(지시: 왼쪽에) */}
                      <div className="ef-tl-lab" {...hov(label(r), [periodText(d.s, d.e), ...tipLines(r)])}>
                        <span className="ef-tl-nm">{label(r)}</span>
                        <em className="ef-tl-dt">{fmtSpan(d.s, d.e)}</em>
                      </div>
                      <div className="ef-tl-lane">
                        {(() => {
                          // 짧은 기간(며칠)은 막대가 좁아 이름이 잘린다(지적) — 이름이 들어갈 만큼 넓혀 칩으로 보인다(지시).
                          // 실제 기간·일수는 왼쪽 이름 기둥과 올리면 뜨는 설명에
                          const x = pos(d.s)
                          const t = label(r)
                          const span = end(d.e) - x
                          const chip = span < textW(t) + 14
                          const w = chip ? textW(t) + 14 : span
                          return (
                            <div className={`ef-tl-bar${chip ? ' chip' : ''}`} style={{ left: x, width: w, background: c + '26', borderColor: c }} {...hov(t, [periodText(d.s, d.e), ...tipLines(r)])}>
                              <span>{t}</span>
                            </div>
                          )
                        })()}
                      </div>
                    </div>
                  )
                })}
            </Fragment>
          )
        })}
        {hintEl}
      </Frame>
    )
  }

  // ── 월 모드 ──
  const nameId = defaultGroup(cols)
  const thisYear = String(new Date().getFullYear()) === year
  const nowM = new Date().getMonth()
  if (!rows.length) return <div className="ef-empty">행이 없습니다</div>
  const sz = layout(months.map((c, i) => ({ k: c.id, t: c.title, now: thisYear && months.length === 12 && i === nowM })))
  const { xs, ws } = sz
  return (
    <Frame
      sz={sz}
      allOpen={allOpen}
      onAll={() => setOpen(allOpen ? new Set() : new Set(groups.map((g) => g.k)))}
      nowX={null}
    >
      {groups.map((g) => {
        const sums = months.map((c) => g.rs.reduce((a, r) => a + (toNum(r[c.id]) ?? 0), 0))
        // 가득 찬 투입 = 그 묶음에 든 사람 수(한 사람 한 달 1)
        const full = Math.max(1, new Set(g.rs.map((r) => cellText(r[nameId])).filter(Boolean)).size)
        const on = open.has(g.k)
        return (
          <Fragment key={g.k}>
            <GroupHead k={g.k} n={g.rs.length} on={on} onFlip={() => flip(g.k)} by={by} total={sums.reduce((a, b) => a + b, 0)}>
              {sums.map((v, i) => {
                const load = v / full
                return (
                  <div
                    key={i}
                    className={`ef-tl-load${v > 0 ? '' : ' zero'}${load > 1.0001 ? ' over' : ''}`}
                    style={{ left: xs[i]! + 3, width: ws[i]! - 6, ...(v > 0 && load <= 1.0001 ? { background: `rgba(45,111,212,${0.12 + Math.min(1, load) * 0.6})`, color: load > 0.55 ? '#fff' : undefined } : {}) }}
                    {...hov(`${g.k} · ${months[i]!.title}`, [`${numFmt(Math.round(v * 100) / 100)} M/M${full > 1 ? ` (가득 ${full})` : ''}`])}
                  >
                    {v > 0 ? numFmt(Math.round(v * 100) / 100) : ''}
                  </div>
                )
              })}
            </GroupHead>
            {on &&
              g.rs.map((r, i) => {
                const segs = monthSegments(r, months)
                const c = autoColor(label(r))
                return (
                  <div className="ef-tl-row" key={i}>
                    <div className="ef-tl-lab" {...hov(label(r), tipLines(r))}>
                      <span className="ef-tl-nm">{label(r)}</span>
                    </div>
                    <div className="ef-tl-lane">
                      {segs.map((s, k) => (
                        <div
                          key={k}
                          className="ef-tl-bar"
                          style={{ left: xs[s.a]! + 3, width: xs[s.b]! + ws[s.b]! - xs[s.a]! - 6, background: c + '26', borderColor: c }}
                          {...hov(label(r), [s.v.map((v, j) => `${months[s.a + j]!.title} ${numFmt(v ?? 0)}`).join(' · '), ...tipLines(r)])}
                        >
                          {s.v.map((v, j) => (
                            <span key={j} className="ef-tl-v" style={{ width: ws[s.a + j] }}>
                              {numFmt(v ?? 0)}
                            </span>
                          ))}
                        </div>
                      ))}
                      {!segs.length && <span className="ef-tl-none">공수 없음</span>}
                    </div>
                  </div>
                )
              })}
          </Fragment>
        )
      })}
      {hintEl}
      </Frame>
  )
}

/** 막대 이름이 차지할 폭(10.5px 굵은 글씨) — 화면 글꼴로 실제로 잰다(어림셈은 영문 대문자에서 모자라 잘렸다), 못 재면 어림 */
let measure: CanvasRenderingContext2D | null | undefined
const textW = (t: string) => {
  if (measure === undefined) {
    try {
      measure = document.createElement('canvas').getContext('2d')
      if (measure) measure.font = `700 10.5px ${getComputedStyle(document.body).fontFamily}`
    } catch {
      measure = null
    }
  }
  return measure ? Math.ceil(measure.measureText(t).width) + 2 : [...t].reduce((a, ch) => a + (ch.charCodeAt(0) > 255 ? 11 : 7.5), 0)
}
/** 이름 기둥·묶음 줄의 짧은 기간 — 하루면 MM-DD, 아니면 MM-DD~MM-DD */
const fmtSpan = (s: Date, e: Date) => {
  const md = (d: Date) => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return s.getTime() === e.getTime() ? md(s) : `${md(s)}~${md(e)}`
}
/** 설명 속 기간 — 2026-10-12 ~ 2026-10-16 (5일) */
const periodText = (s: Date, e: Date) => `${fmtD(s)} ~ ${fmtD(e)} (${Math.round((e.getTime() - s.getTime()) / 86400000) + 1}일)`
const fmtKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const fmtD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** 틀 — 왼쪽 이름 기둥 + 위 달 머리줄(둘 다 붙박이), 오른쪽이 가로로 구른다 */
interface TlSizing {
  LAB: number
  axis: Array<{ k: string; t: string; now: boolean }>
  /** 달 칸 폭 · 왼쪽 끝 위치 */
  ws: number[]
  xs: number[]
  onLive: (p: TlLive) => void
  onDone: (p: TlLive) => void
}

/** 경계 끌기 — 움직이는 동안 onLive, 놓으면 onDone(안 움직였으면 아무것도). 두 번 누르면 기본 폭 */
function edgeDrag(ev: React.MouseEvent, calc: (dx: number) => TlLive, sz: TlSizing) {
  if (ev.button !== 0) return
  ev.preventDefault()
  ev.stopPropagation()
  const x0 = ev.clientX
  let last: TlLive | null = null
  const mv = (e: MouseEvent) => {
    last = calc(e.clientX - x0)
    sz.onLive(last)
  }
  const up = () => {
    document.removeEventListener('mousemove', mv, true)
    document.removeEventListener('mouseup', up, true)
    document.body.style.cursor = ''
    if (last) sz.onDone(last)
  }
  document.body.style.cursor = 'col-resize'
  document.addEventListener('mousemove', mv, true)
  document.addEventListener('mouseup', up, true)
}

function Frame({
  sz,
  allOpen,
  onAll,
  nowX,
  children,
}: {
  sz: TlSizing
  allOpen: boolean
  onAll: () => void
  nowX: number | null
  children: React.ReactNode
}) {
  const { LAB, axis, ws, xs } = sz
  const total = axis.length ? xs[xs.length - 1]! + ws[ws.length - 1]! : 0
  return (
    <div className="ef-tl" style={{ ['--ef-tl-lab' as string]: `${LAB}px` }}>
      <div className="ef-tl-in" style={{ width: LAB + total }}>
        <div className="ef-tl-head">
          <div className="ef-tl-lab ef-tl-corner">
            <button type="button" className="ef-tl-all" onClick={onAll}>
              <TI n={allOpen ? 'chevron-down' : 'chevron-right'} /> {allOpen ? '모두 접기' : '모두 펼치기'}
            </button>
            {/* 이름 기둥 폭 — 끌면 바뀌고, 두 번 누르면 기본 */}
            <span
              className="ef-tl-rz"
              aria-label="이름 열 폭"
              onMouseDown={(e) => edgeDrag(e, (dx) => ({ lab: clampLab(LAB + dx) }), sz)}
              onDoubleClick={() => sz.onDone({ lab: TL_LAB })}
            />
          </div>
          <div className="ef-tl-axis">
            {axis.map((a, i) => (
              <div key={a.k} className={`ef-tl-m${a.now ? ' now' : ''}`} style={{ width: ws[i] }}>
                {a.t}
                {/* 달 칸 폭 — 끈 그 칸만 바뀐다(지적: 다 늘어난다). 두 번 누르면 그 칸만 기본으로 */}
                <span
                  className="ef-tl-rz"
                  aria-label={`${a.t} 칸 폭`}
                  onMouseDown={(e) => edgeDrag(e, (dx) => ({ k: a.k, w: clampW(ws[i]! + dx) }), sz)}
                  onDoubleClick={() => sz.onDone({ k: a.k })}
                />
              </div>
            ))}
          </div>
        </div>
        <div className="ef-tl-body">
          {/* 달 경계 세로줄 — 칸 폭이 저마다라 배경 무늬 대신 줄을 한 번만 긋는다(행 배경 위 · 막대 아래) */}
          {xs.map((x, i) => (
            <div key={i} className="ef-tl-vl" style={{ left: LAB + x + ws[i]! - 1 }} />
          ))}
          {nowX !== null && <div className="ef-tl-today" style={{ left: LAB + nowX }} title="오늘" />}
          {children}
        </div>
      </div>
    </div>
  )
}

function GroupHead({
  k,
  n,
  on,
  onFlip,
  by,
  total,
  sub,
  children,
}: {
  k: string
  n: number
  on: boolean
  onFlip: () => void
  by: EfColumn | undefined
  total?: number
  /** 이름 옆 글(날짜 모드 — 묶음 전체 기간) */
  sub?: string
  children: React.ReactNode
}) {
  return (
    <div className="ef-tl-row ef-tl-grp">
      <div className="ef-tl-lab" onClick={onFlip} title={`${by?.title ?? ''}: ${k} — 눌러서 ${on ? '접기' : '펼치기'}`}>
        <TI n={on ? 'chevron-down' : 'chevron-right'} className="ef-tl-car" />
        <b>{k}</b>
        <em>{n}</em>
        {total !== undefined && total > 0 && <span className="ef-tl-tot">{numFmt(Math.round(total * 100) / 100)}</span>}
        {sub && <span className="ef-tl-dt">{sub}</span>}
      </div>
      <div className="ef-tl-lane">{children}</div>
    </div>
  )
}
