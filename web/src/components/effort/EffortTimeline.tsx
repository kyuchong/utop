import { Fragment, useMemo, useState } from 'react'
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

const W = 66 // 한 달 칸 폭
const fmtM = (d: Date) => `${String(d.getFullYear()).slice(2)}.${String(d.getMonth() + 1).padStart(2, '0')}`

export function EfTimeline({ cols, rows, view, year }: { cols: EfColumn[]; rows: EfRow[]; view: EfView; year: string }) {
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
  const tip = (r: EfRow) =>
    cols
      .filter((c) => !isNumCol(c) && cellText(r[c.id]))
      .map((c) => `${c.title}: ${cellText(r[c.id])}`)
      .join('\n')

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
    const pos = (d: Date) => {
      const mi = (d.getFullYear() - x0.getFullYear()) * 12 + d.getMonth() - x0.getMonth()
      const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
      return (mi + (d.getDate() - 1) / dim) * W
    }
    const end = (d: Date) => pos(d) + W / new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    const today = new Date()
    const todayX = today >= x0 && today <= new Date(axis[axis.length - 1]!.getFullYear(), axis[axis.length - 1]!.getMonth() + 1, 0) ? pos(today) : null
    const byRow = new Map(items.map((x) => [x.r, x.d]))
    const dgroups = tlGroups(items.map((x) => x.r), by)
    return (
      <Frame
        axis={axis.map((d) => ({ t: fmtM(d), now: d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() }))}
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
              <GroupHead k={g.k} n={g.rs.length} on={on} onFlip={() => flip(g.k)} by={by}>
                <div className="ef-tl-sum" style={{ left: pos(s), width: Math.max(8, end(e) - pos(s)) }} title={`${fmtD(s)} ~ ${fmtD(e)}`} />
              </GroupHead>
              {on &&
                g.rs.map((r, i) => {
                  const d = byRow.get(r)!
                  const c = autoColor(label(r))
                  return (
                    <div className="ef-tl-row" key={i}>
                      <div className="ef-tl-lab" title={tip(r)}>{label(r)}</div>
                      <div className="ef-tl-lane">
                        <div className="ef-tl-bar" style={{ left: pos(d.s), width: Math.max(10, end(d.e) - pos(d.s)), background: c + '26', borderColor: c }} title={`${tip(r)}\n${fmtD(d.s)} ~ ${fmtD(d.e)}`}>
                          <span>{label(r)}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
            </Fragment>
          )
        })}
      </Frame>
    )
  }

  // ── 월 모드 ──
  const nameId = defaultGroup(cols)
  const thisYear = String(new Date().getFullYear()) === year
  const nowM = new Date().getMonth()
  if (!rows.length) return <div className="ef-empty">행이 없습니다</div>
  return (
    <Frame
      axis={months.map((c, i) => ({ t: c.title, now: thisYear && months.length === 12 && i === nowM }))}
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
                    style={{ left: i * W + 3, width: W - 6, ...(v > 0 && load <= 1.0001 ? { background: `rgba(45,111,212,${0.12 + Math.min(1, load) * 0.6})`, color: load > 0.55 ? '#fff' : undefined } : {}) }}
                    title={`${months[i]!.title} · ${numFmt(Math.round(v * 100) / 100)} M/M${full > 1 ? ` (가득 ${full})` : ''}`}
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
                    <div className="ef-tl-lab" title={tip(r)}>{label(r)}</div>
                    <div className="ef-tl-lane">
                      {segs.map((s, k) => (
                        <div
                          key={k}
                          className="ef-tl-bar"
                          style={{ left: s.a * W + 3, width: (s.b - s.a + 1) * W - 6, background: c + '26', borderColor: c }}
                          title={tip(r)}
                        >
                          {s.v.map((v, j) => (
                            <span key={j} className="ef-tl-v" style={{ width: W }}>
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
    </Frame>
  )
}

const fmtD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** 틀 — 왼쪽 이름 기둥 + 위 달 머리줄(둘 다 붙박이), 오른쪽이 가로로 구른다 */
function Frame({
  axis,
  allOpen,
  onAll,
  nowX,
  children,
}: {
  axis: Array<{ t: string; now: boolean }>
  allOpen: boolean
  onAll: () => void
  nowX: number | null
  children: React.ReactNode
}) {
  return (
    <div className="ef-tl">
      <div className="ef-tl-in" style={{ width: 230 + axis.length * W }}>
        <div className="ef-tl-head">
          <div className="ef-tl-lab ef-tl-corner">
            <button type="button" className="ef-tl-all" onClick={onAll}>
              <TI n={allOpen ? 'chevron-down' : 'chevron-right'} /> {allOpen ? '모두 접기' : '모두 펼치기'}
            </button>
          </div>
          <div className="ef-tl-axis">
            {axis.map((a, i) => (
              <div key={i} className={`ef-tl-m${a.now ? ' now' : ''}`} style={{ width: W }}>
                {a.t}
              </div>
            ))}
          </div>
        </div>
        <div className="ef-tl-body" style={{ ['--ef-tl-w' as string]: `${W}px` }}>
          {nowX !== null && <div className="ef-tl-today" style={{ left: 230 + nowX }} title="오늘" />}
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
  children,
}: {
  k: string
  n: number
  on: boolean
  onFlip: () => void
  by: EfColumn | undefined
  total?: number
  children: React.ReactNode
}) {
  return (
    <div className="ef-tl-row ef-tl-grp">
      <div className="ef-tl-lab" onClick={onFlip} title={`${by?.title ?? ''}: ${k} — 눌러서 ${on ? '접기' : '펼치기'}`}>
        <TI n={on ? 'chevron-down' : 'chevron-right'} className="ef-tl-car" />
        <b>{k}</b>
        <em>{n}</em>
        {total !== undefined && total > 0 && <span className="ef-tl-tot">{numFmt(Math.round(total * 100) / 100)}</span>}
      </div>
      <div className="ef-tl-lane">{children}</div>
    </div>
  )
}
