import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Legend,
  Filler,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js'
import { Pop } from './EffortMenus'
import { TI } from './icons'
import { AUTO, autoColor, defaultGroup, numFmt, toNum, type EfColumn, type EfDoc, type EfRow, type EfView } from './model'

/**
 * Effort Plan 의 보드·차트 보기 — 예전 13-resource.js 의 _rscRenderBoard·_rscRenderChart 를 옮겼다.
 * 둘 다 지금 연도 페이지의 모든 행을 본다(예전과 같다 — 검색·필터는 표 보기에만).
 * 기준 열은 보기마다 v.boardBy · v.chartCol 에 둔다(예전 보기와 같은 이름).
 */

Chart.register(
  DoughnutController, ArcElement, BarController, BarElement, LineController, LineElement, PointElement, Filler,
  CategoryScale, LinearScale, Legend, Tooltip,
)

const NONE = '(미지정)'
const cellText = (v: unknown) => (v == null ? '' : String(v))

/** 보드 기준이 될 수 있는 열 — 선택·상태 */
export const boardCols = (cols: EfColumn[]) => cols.filter((c) => c.type === 'select' || c.type === 'status')
/** 차트 기준이 될 수 있는 열 — 선택·글자 */
export const chartCols = (cols: EfColumn[]) => cols.filter((c) => c.type === 'select' || c.type === 'text')

export function boardColOf(view: EfView, cols: EfColumn[]) {
  const id = view.boardBy as string | undefined
  return cols.find((c) => c.id === id && (c.type === 'select' || c.type === 'status')) ?? boardCols(cols)[0]
}
export function chartColOf(view: EfView, cols: EfColumn[]) {
  const id = view.chartCol as string | undefined
  return cols.find((c) => c.id === id) ?? chartCols(cols)[0]
}

// ── 보드(칸반) ──────────────────────────────────────────────────────
/**
 * 카드 놓기 — 칸(lane)의 i 번째 카드 앞에 r 을 넣는다(i = 칸 끝이면 마지막 카드 뒤).
 * 보드는 행 차례대로 그리므로 **행 자체를 옮긴다**(지시: 보드에서도 행 순서를 바꾼다) — 표도 정렬이 없으면 이 차례로 보인다.
 * lane 은 놓기 전의 그 칸 카드들(r 이 들어 있을 수도 있다). 빈 칸이면 행은 제자리에 둔다.
 */
export function placeRow(rows: EfRow[], r: EfRow, lane: EfRow[], i: number) {
  const before = lane.slice(i).find((x) => x !== r)
  const rest = lane.filter((x) => x !== r)
  const after = before ? undefined : rest[rest.length - 1]
  if (!before && !after) return
  const from = rows.indexOf(r)
  if (from < 0) return
  rows.splice(from, 1)
  const at = before ? rows.indexOf(before) : rows.indexOf(after!) + 1
  rows.splice(at < 0 ? rows.length : at, 0, r)
}

export function EfBoard({
  d,
  rows,
  view,
  touch,
  toast,
}: {
  d: EfDoc
  rows: EfRow[]
  view: EfView
  touch: () => void
  toast: (m: string) => void
}) {
  const cols = d.columns
  const bc = boardColOf(view, cols)
  const [dragRow, setDragRow] = useState<EfRow | null>(null)
  /** 끄는 중 놓일 자리 — 칸 g 의 i 번째 카드 앞(i = 칸 끝이면 맨 뒤) */
  const [over, setOver] = useState<{ g: string; i: number } | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; r: EfRow } | null>(null)
  if (!bc) return <div className="ef-empty">선택/상태 타입 열이 있어야 보드를 만들 수 있습니다 — [열 설정]에서 추가하세요</div>

  // 칸 = 옵션 순서 + 표에만 쓰인 값, 하나도 없으면 (미지정)
  const groups = [...(bc.options ?? [])]
  rows.forEach((r) => {
    const v = cellText(r[bc.id])
    if (v && !groups.includes(v)) groups.push(v)
  })
  if (!groups.length) groups.push(NONE)
  const titleCol = cols.find((c) => c.type === 'text')
  const drop = () => {
    const r = dragRow
    const at = over
    setDragRow(null)
    setOver(null)
    if (!r || !at) return
    const lane = rows.filter((x) => (cellText(x[bc.id]) || NONE) === at.g)
    const nv = at.g === NONE ? '' : at.g
    const moved = cellText(r[bc.id]) !== nv
    const was = rows.indexOf(r)
    if (moved) {
      if (nv) r[bc.id] = nv
      else delete r[bc.id]
    }
    placeRow(rows, r, lane, at.i)
    if (moved || rows.indexOf(r) !== was) touch()
  }
  return (
    <div className="ef-kanban">
      {groups.map((g) => {
        const items = rows.filter((r) => (cellText(r[bc.id]) || NONE) === g)
        return (
          <div className="ef-kcol" key={g}>
            <div className="ef-kcol-h">
              <span className="ef-kdot" style={{ background: autoColor(g) }} />
              {g}
              <span className="ef-kcnt">{items.length}</span>
            </div>
            <div
              className={`ef-klist${over?.g === g ? ' over' : ''}`}
              onDragOver={(e) => {
                if (!dragRow) return
                e.preventDefault()
                // 카드 위가 아니면(빈 자리) 칸 맨 뒤
                if (e.target === e.currentTarget && (over?.g !== g || over.i !== items.length)) setOver({ g, i: items.length })
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null)
              }}
              onDrop={(e) => {
                e.preventDefault()
                drop()
              }}
            >
              {items.map((r, i) => {
                // 제목 열·기준 열 말고 값이 있는 칸 셋(예전과 같다)
                const meta = cols
                  .filter((c) => c.id !== bc.id && c.id !== titleCol?.id && cellText(r[c.id]))
                  .slice(0, 3)
                  .map((c) => `${c.title}: ${cellText(r[c.id])}`)
                  .join(' · ')
                return (
                  <Fragment key={i}>
                  {over?.g === g && over.i === i && <div className="ef-kdrop" />}
                  <div
                    className={`ef-kcard${dragRow === r ? ' ghost' : ''}`}
                    draggable
                    onDragOver={(e) => {
                      if (!dragRow) return
                      e.preventDefault()
                      // 카드 위쪽 절반이면 그 앞, 아래쪽 절반이면 그 뒤
                      const b = e.currentTarget.getBoundingClientRect()
                      const at = e.clientY < b.top + b.height / 2 ? i : i + 1
                      if (over?.g !== g || over.i !== at) setOver({ g, i: at })
                    }}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move'
                      e.dataTransfer.setData('text/plain', 'card')
                      setDragRow(r)
                    }}
                    onDragEnd={() => {
                      setDragRow(null)
                      setOver(null)
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setMenu({ x: e.clientX, y: e.clientY, r })
                    }}
                  >
                    <div className="ef-kname">{(titleCol && cellText(r[titleCol.id])) || '(제목)'}</div>
                    {meta && <div className="ef-kmeta">{meta}</div>}
                  </div>
                  </Fragment>
                )
              })}
              {over?.g === g && over.i === items.length && <div className="ef-kdrop" />}
            </div>
          </div>
        )
      })}
      {menu && (
        <CardMenu
          at={menu}
          onClose={() => setMenu(null)}
          onCopy={() => {
            const i = rows.indexOf(menu.r)
            rows.splice(i < 0 ? rows.length : i + 1, 0, JSON.parse(JSON.stringify(menu.r)) as EfRow)
            setMenu(null)
            touch()
            toast('📋 복사됨 (전체 내용 복제)')
          }}
          onAdd={() => {
            rows.push({})
            setMenu(null)
            touch()
          }}
          onDelete={() => {
            const i = rows.indexOf(menu.r)
            setMenu(null)
            if (i < 0) return
            rows.splice(i, 1)
            touch()
          }}
        />
      )}
    </div>
  )
}

/** 카드 우클릭 — 복사하기 · 항목 추가 · 삭제(예전 _rscCardMenu) */
function CardMenu({
  at,
  onCopy,
  onAdd,
  onDelete,
  onClose,
}: {
  at: { x: number; y: number }
  onCopy: () => void
  onAdd: () => void
  onDelete: () => void
  onClose: () => void
}) {
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
    <div
      className="ef-menu ef-cardmenu"
      ref={ref}
      style={{ left: Math.min(at.x, window.innerWidth - 170), top: Math.min(at.y, window.innerHeight - 110) }}
    >
      <button type="button" className="ef-mi" onClick={onCopy}>
        <i className="ef-mi-ic"><TI n="copy" /></i>
        <span>복사하기</span>
      </button>
      <button type="button" className="ef-mi" onClick={onAdd}>
        <i className="ef-mi-ic"><TI n="plus" /></i>
        <span>항목 추가</span>
      </button>
      <button type="button" className="ef-mi del" onClick={onDelete}>
        <i className="ef-mi-ic"><TI n="trash" /></i>
        <span>삭제</span>
      </button>
    </div>,
    document.body,
  )
}

// ── 차트 ────────────────────────────────────────────────────────────
/** 기준 열 값별 공수 합계 — 큰 차례. full = 그 값에 든 인원 수 × 월 열 수(한 달 1 M/M 가 가득 찬 투입) */
export function mmByGroup(rows: EfRow[], cols: EfColumn[], cc: EfColumn | undefined) {
  if (!cc) return []
  const months = cols.filter((c) => c.type === 'number' && !c.autoSum)
  const auto = cols.find((c) => c.autoSum)
  const nameId = defaultGroup(cols)
  const by = new Map<string, { sum: number; people: Set<string> }>()
  rows.forEach((r) => {
    const k = cellText(r[cc.id]) || '(빈값)'
    // 행 공수 = 합계 열(있으면), 없으면 월 열을 더한다
    const mm = auto ? (toNum(r[auto.id]) ?? 0) : months.reduce((a, c) => a + (toNum(r[c.id]) ?? 0), 0)
    const g = by.get(k) ?? { sum: 0, people: new Set<string>() }
    g.sum += mm
    const who = cellText(r[nameId])
    if (who) g.people.add(who)
    by.set(k, g)
  })
  return [...by.entries()]
    .map(([k, g]) => ({ k, sum: Math.round(g.sum * 100) / 100, full: Math.max(1, g.people.size) * months.length }))
    .sort((a, b) => b.sum - a.sum)
}
/** 월별 추이 — 숫자 열(자동 합계 열 제외)마다 합 */
export function monthTrend(rows: EfRow[], cols: EfColumn[]) {
  const months = cols.filter((c) => c.type === 'number' && !c.autoSum)
  return months.map((c) => ({ t: c.title, v: Math.round(rows.reduce((a, r) => a + (toNum(r[c.id]) ?? 0), 0) * 100) / 100 }))
}

// ── 차트 고르기(지시: 만들기가 아니라 여러 차트 중에서 골라 보이게) ───────────────
const monthCols = (cols: EfColumn[]) => cols.filter((c) => c.type === 'number' && !c.autoSum)
const r2 = (n: number) => Math.round(n * 100) / 100
/** 행 공수 — 합계 열(있으면), 없으면 월 열을 더한다 */
function rowMMOf(cols: EfColumn[]) {
  const months = monthCols(cols)
  const auto = cols.find((c) => c.autoSum)
  return (r: EfRow) => (auto ? (toNum(r[auto.id]) ?? 0) : months.reduce((a, c) => a + (toNum(r[c.id]) ?? 0), 0))
}

/** 분기별 공수 — 월 열을 차례대로 셋씩 묶는다(12개면 1~4분기, 아니면 「01월~03월」) */
export function quarterSums(rows: EfRow[], cols: EfColumn[]) {
  const months = monthCols(cols)
  const out: Array<{ t: string; v: number }> = []
  for (let i = 0; i < months.length; i += 3) {
    const g = months.slice(i, i + 3)
    const t = months.length === 12 ? `${i / 3 + 1}분기` : g.length > 1 ? `${g[0]!.title}~${g[g.length - 1]!.title}` : g[0]!.title
    out.push({ t, v: r2(rows.reduce((a, r) => a + g.reduce((b, c) => b + (toNum(r[c.id]) ?? 0), 0), 0)) })
  }
  return out
}
/** 월별 누적 공수 */
export function cumTrend(rows: EfRow[], cols: EfColumn[]) {
  let acc = 0
  return monthTrend(rows, cols).map((x) => ({ t: x.t, v: r2((acc += x.v)) }))
}
/** 기준 열 값마다 월별 공수 — 큰 차례 9개 + 기타 */
export function monthByGroup(rows: EfRow[], cols: EfColumn[], cc: EfColumn | undefined) {
  const months = monthCols(cols)
  if (!cc) return { labels: months.map((c) => c.title), series: [] as Array<{ name: string; data: number[] }> }
  const mm = rowMMOf(cols)
  const by = new Map<string, EfRow[]>()
  rows.forEach((r) => {
    const k = cellText(r[cc.id]) || '(빈값)'
    by.set(k, [...(by.get(k) ?? []), r])
  })
  let g = [...by.entries()].map(([name, rs]) => ({ name, rs, tot: rs.reduce((a, r) => a + mm(r), 0) })).sort((a, b) => b.tot - a.tot)
  if (g.length > 10) g = [...g.slice(0, 9), { name: '기타', rs: g.slice(9).flatMap((x) => x.rs), tot: 0 }]
  return {
    labels: months.map((c) => c.title),
    series: g.map((x) => ({ name: x.name, data: months.map((c) => r2(x.rs.reduce((a, r) => a + (toNum(r[c.id]) ?? 0), 0))) })),
  }
}
/** 인원 × 월 공수 — 인원은 이름 차례 */
export function personMonth(rows: EfRow[], cols: EfColumn[]) {
  const months = monthCols(cols)
  const nameId = defaultGroup(cols)
  const by = new Map<string, number[]>()
  rows.forEach((r) => {
    const k = cellText(r[nameId]) || '(빈값)'
    const a = by.get(k) ?? months.map(() => 0)
    months.forEach((c, i) => (a[i]! += toNum(r[c.id]) ?? 0))
    by.set(k, a)
  })
  return {
    months: months.map((c) => c.title),
    people: [...by.entries()].map(([k, a]) => ({ k, v: a.map(r2) })).sort((a, b) => a.k.localeCompare(b.k, 'ko')),
  }
}
/** 인원별 평균 투입률(%) — 공수 합 ÷ 월 수, 큰 차례 */
export function utilByPerson(rows: EfRow[], cols: EfColumn[]) {
  const { months, people } = personMonth(rows, cols)
  if (!months.length) return []
  return people.map((p) => ({ k: p.k, v: Math.round((p.v.reduce((a, b) => a + b, 0) / months.length) * 1000) / 10 })).sort((a, b) => b.v - a.v)
}
/** 월별 투입 인원 — 그 달 공수가 0 보다 큰 사람 수 */
export function headsByMonth(rows: EfRow[], cols: EfColumn[]) {
  const { months, people } = personMonth(rows, cols)
  return months.map((t, i) => ({ t, v: people.filter((p) => p.v[i]! > 0).length }))
}

/** 고를 수 있는 차트 — 이 차례로 그린다. 앞의 네 개가 기본(예전 화면) */
export const CHARTS: Array<{ id: string; name: string; ic: string; tip: string; def?: boolean }> = [
  { id: 'cnt', name: '개수 분포', ic: 'chart-donut', tip: '기준 열 값마다 행 개수', def: true },
  { id: 'sum', name: '숫자 열 합계', ic: 'chart-bar', tip: '숫자 열마다 합계', def: true },
  { id: 'mm', name: '기준 열별 공수 합계', ic: 'chart-bar-h', tip: '기준 열 값마다 공수 — 가득 찬 투입을 넘으면 주황', def: true },
  { id: 'mon', name: '월별 추이', ic: 'chart-line', tip: '월마다 공수 합계', def: true },
  { id: 'share', name: '기준 열별 공수 비중', ic: 'chart-donut', tip: '기준 열 값마다 공수가 차지하는 몫' },
  { id: 'stack', name: '월별 공수 구성', ic: 'chart-bar', tip: '월마다 공수를 기준 열 값으로 쌓은 막대' },
  { id: 'lines', name: '기준 열별 월별 추이', ic: 'chart-line', tip: '기준 열 값마다 선 하나' },
  { id: 'cum', name: '월별 누적 공수', ic: 'chart-line', tip: '1월부터 쌓아 온 공수' },
  { id: 'qtr', name: '분기별 공수', ic: 'chart-bar', tip: '월 열을 셋씩 묶은 합계' },
  { id: 'util', name: '인원별 평균 투입률', ic: 'chart-bar-h', tip: '사람마다 한 달 평균 공수(%) — 100% 를 넘으면 주황' },
  { id: 'heads', name: '월별 투입 인원', ic: 'chart-bar', tip: '그 달에 공수가 있는 사람 수' },
  { id: 'heat', name: '인원 × 월 투입 표', ic: 'table', tip: '사람·달마다 공수를 색 진하기로 — 1 을 넘으면 주황' },
]
/** 보기마다 켠 차트 — view.chartSet.on. 없으면 기본 네 개(예전 hidden 만 있던 설정은 그만큼 뺀다) */
export function chartsOn(view: EfView): string[] {
  const cs = view.chartSet as { on?: string[]; hidden?: string[] } | undefined
  if (Array.isArray(cs?.on)) return cs.on
  const hid = cs?.hidden ?? []
  return CHARTS.filter((c) => c.def && !hid.includes(c.id)).map((c) => c.id)
}
export function setChartsOn(view: EfView, on: string[]) {
  view.chartSet = { on: CHARTS.map((c) => c.id).filter((id) => on.includes(id)) }
}

type Mk = ((el: HTMLCanvasElement) => { destroy: () => void }) | null
const BLUE = '#2d6fd4'
const ORANGE = '#e06a34'
const lineOpts = (legend: boolean) => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: legend, position: 'bottom' as const } },
  scales: { x: { grid: { display: false } }, y: { beginAtZero: true } },
})
const simpleBar = (labels: string[], data: number[], color: string | string[] = BLUE): Mk => (el) =>
  new Chart(el, {
    type: 'bar',
    data: { labels, datasets: [{ label: '합계', data, backgroundColor: color, borderRadius: 5 }] },
    options: lineOpts(false),
  })
const simpleLine = (labels: string[], data: number[]): Mk => (el) =>
  new Chart(el, {
    type: 'line',
    data: { labels, datasets: [{ label: '합계', data, borderColor: BLUE, backgroundColor: 'rgba(45,111,212,.14)', fill: true, tension: 0.4, pointRadius: 3, borderWidth: 2 }] },
    options: lineOpts(false),
  })
const donut = (labels: string[], data: number[]): Mk => (el) =>
  new Chart(el, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: labels.map((k) => autoColor(k)), borderWidth: 2, borderColor: '#fff' }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } },
  })
const hbar = (labels: string[], data: number[], colors: string[], unit: string, extra?: (i: number) => string): Mk => (el) =>
  new Chart(el, {
    type: 'bar',
    data: { labels, datasets: [{ label: unit, data, backgroundColor: colors, borderRadius: 5 }] },
    options: {
      indexAxis: 'y', // 가로 막대 — 위에서부터 큰 차례(예전과 같다)
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: extra ? { afterLabel: (it) => extra(it.dataIndex) } : {} } },
      scales: { x: { beginAtZero: true }, y: { grid: { display: false } } },
    },
  })

/** 차트마다 그리는 함수 — 자료가 없으면 null */
function makeAll(rows: EfRow[], cols: EfColumn[], cc: EfColumn | undefined): Record<string, Mk> {
  const mk: Record<string, Mk> = {}
  const mm = mmByGroup(rows, cols, cc)
  mk.mm = mm.length ? hbar(mm.map((x) => x.k), mm.map((x) => x.sum), mm.map((x) => (x.sum > x.full ? ORANGE : BLUE)), '공수(M/M)', (i) => `가득 찬 투입 ${numFmt(mm[i]!.full)}`) : null
  mk.share = mm.some((x) => x.sum > 0) ? donut(mm.map((x) => x.k), mm.map((x) => x.sum)) : null
  const tr = monthTrend(rows, cols)
  mk.mon = tr.length ? simpleLine(tr.map((x) => x.t), tr.map((x) => x.v)) : null
  const cu = cumTrend(rows, cols)
  mk.cum = cu.length ? simpleLine(cu.map((x) => x.t), cu.map((x) => x.v)) : null
  const q = quarterSums(rows, cols)
  mk.qtr = q.length ? simpleBar(q.map((x) => x.t), q.map((x) => x.v)) : null
  const hd = headsByMonth(rows, cols)
  mk.heads = hd.length ? simpleBar(hd.map((x) => x.t), hd.map((x) => x.v), '#00a872') : null
  const ut = utilByPerson(rows, cols)
  mk.util = ut.length ? hbar(ut.map((x) => x.k), ut.map((x) => x.v), ut.map((x) => (x.v > 100 ? ORANGE : BLUE)), '평균 투입률(%)') : null
  // 개수 분포
  const cnt: Record<string, number> = {}
  if (cc) rows.forEach((r) => {
    const v = cellText(r[cc.id]) || '(빈값)'
    cnt[v] = (cnt[v] ?? 0) + 1
  })
  const ck = Object.keys(cnt)
  mk.cnt = ck.length ? donut(ck, ck.map((k) => cnt[k]!)) : null
  // 숫자 열 합계
  const numCols = cols.filter((c) => c.type === 'number')
  mk.sum = numCols.length ? simpleBar(numCols.map((c) => c.title), numCols.map((c) => r2(rows.reduce((a, r) => a + (toNum(r[c.id]) ?? 0), 0)))) : null
  // 기준 열 값마다 — 쌓은 막대 · 선 여러 개
  const g = monthByGroup(rows, cols, cc)
  // 계열 색은 팔레트 차례로(이름 해시는 겹친다) · 기타는 회색
  const sc = (name: string, i: number) => (name === '기타' ? '#c3cad6' : AUTO[i % AUTO.length]!)
  const ds = (fill: boolean) =>
    g.series.map((s, i) => ({ label: s.name, data: s.data, backgroundColor: sc(s.name, i), borderColor: sc(s.name, i), ...(fill ? { borderRadius: 3 } : { tension: 0.35, pointRadius: 2, borderWidth: 2 }) }))
  mk.stack = g.series.length && g.labels.length
    ? (el) => new Chart(el, { type: 'bar', data: { labels: g.labels, datasets: ds(true) }, options: { ...lineOpts(true), scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true } } } })
    : null
  mk.lines = g.series.length && g.labels.length ? (el) => new Chart(el, { type: 'line', data: { labels: g.labels, datasets: ds(false) }, options: lineOpts(true) }) : null
  return mk
}

/** 차트 카드 하나 — 그리는 함수(mk)가 바뀔 때만 다시 그린다 */
function ChartCard({ title, sub, tall, mk, onHide }: { title: string; sub?: string; tall?: boolean; mk: Mk; onHide: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!ref.current || !mk) return
    const c = mk(ref.current)
    return () => c.destroy()
  }, [mk])
  return (
    <div className="ef-card">
      <CardHead title={title} sub={sub} onHide={onHide} />
      <div className={`ef-chbox${tall ? ' tall' : ''}`}>{mk ? <canvas ref={ref} /> : <div className="ef-chnone">그릴 자료가 없습니다</div>}</div>
    </div>
  )
}
function CardHead({ title, sub, onHide }: { title: string; sub?: string; onHide: () => void }) {
  return (
    <div className="ef-ch">
      <span className="ef-ch-t">
        {title}
        {sub && <span className="ef-ch-sub">{sub}</span>}
      </span>
      <button type="button" className="ef-chx" title="이 차트 숨기기" aria-label="이 차트 숨기기" onClick={onHide}>
        <TI n="x" />
      </button>
    </div>
  )
}
/** 인원 × 월 투입 표 — 칸 색 진하기 = 공수(1 이 가득), 1 을 넘으면 주황 */
function HeatCard({ rows, cols, onHide }: { rows: EfRow[]; cols: EfColumn[]; onHide: () => void }) {
  const { months, people } = useMemo(() => personMonth(rows, cols), [rows, cols])
  return (
    <div className="ef-card ef-card-wide">
      <CardHead title="인원 × 월 투입 표" sub="진할수록 많이 · 1 을 넘으면 주황" onHide={onHide} />
      {!months.length || !people.length ? (
        <div className="ef-chnone ef-heat-none">그릴 자료가 없습니다</div>
      ) : (
        <div className="ef-heat">
          <table>
            <thead>
              <tr>
                <th />
                {months.map((m) => (
                  <th key={m}>{m}</th>
                ))}
                <th>합계</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.k}>
                  <th>{p.k}</th>
                  {p.v.map((v, i) => (
                    <td
                      key={i}
                      style={v > 0 ? { background: v > 1 ? `rgba(224,106,52,${Math.min(0.85, 0.35 + (v - 1) * 0.5)})` : `rgba(45,111,212,${0.08 + v * 0.62})`, color: v > 0.6 ? '#fff' : undefined } : undefined}
                    >
                      {v > 0 ? numFmt(v) : ''}
                    </td>
                  ))}
                  <td className="ef-heat-sum">{numFmt(r2(p.v.reduce((a, b) => a + b, 0)))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** 차트 보기 — 고른 차트만 정해진 차례로. 기본은 예전 화면의 네 개 */
export function EfChart({ d, rows, view, ver, touch, toast }: { d: EfDoc; rows: EfRow[]; view: EfView; ver: number; touch: () => void; toast: (m: string) => void }) {
  const cc = chartColOf(view, d.columns)
  const on = chartsOn(view)
  const mk = useMemo(
    () => makeAll(rows, d.columns, cc),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, ver, cc?.id],
  )
  const hide = (id: string) => {
    setChartsOn(view, on.filter((x) => x !== id))
    touch()
    toast('차트를 숨겼습니다 — [＋ 차트 추가]에서 다시 켤 수 있습니다')
  }
  const shown = CHARTS.filter((c) => on.includes(c.id))
  if (!shown.length) return <div className="ef-empty">보이는 차트가 없습니다 — [＋ 차트 추가]에서 고르세요</div>
  const SUB: Record<string, string> = {
    mm: '많이 들어간 차례 · 가득 찬 투입을 넘으면 주황',
    mon: '숫자 열 합계(자동 합계 열 제외)',
    share: `기준 열: ${cc?.title ?? '-'}`,
    stack: `기준 열: ${cc?.title ?? '-'}`,
    lines: `기준 열: ${cc?.title ?? '-'}`,
    util: '한 달 평균 · 100% 를 넘으면 주황',
    heads: '그 달 공수가 있는 사람 수',
  }
  const TALL = ['mm', 'mon', 'stack', 'lines', 'util', 'cum', 'qtr', 'heads', 'share']
  return (
    <div className="ef-charts">
      {shown.map((c) =>
        c.id === 'heat' ? (
          <HeatCard key={c.id} rows={rows} cols={d.columns} onHide={() => hide(c.id)} />
        ) : (
          <ChartCard key={c.id} title={c.name} sub={SUB[c.id]} tall={TALL.includes(c.id)} mk={mk[c.id] ?? null} onHide={() => hide(c.id)} />
        ),
      )}
    </div>
  )
}

/** [＋ 차트 추가] — 고를 수 있는 차트 목록, 눌러서 켜고 끈다 */
export function ChartAdd({ anchor, view, touch, onClose }: { anchor: HTMLElement; view: EfView; touch: () => void; onClose: () => void }) {
  const [, re] = useState(0)
  const on = chartsOn(view)
  const flip = (id: string) => {
    setChartsOn(view, on.includes(id) ? on.filter((x) => x !== id) : [...on, id])
    touch()
    re((x) => x + 1)
  }
  return (
    <Pop anchor={anchor} cls="ef-menu ef-chadd" onClose={onClose}>
      <div className="ef-lbl">
        보일 차트 고르기 <em className="ef-chadd-n">{on.length}/{CHARTS.length}</em>
      </div>
      <div className="ef-mlist">
        {CHARTS.map((c) => {
          const v = on.includes(c.id)
          return (
            <button key={c.id} type="button" className={`ef-mi${v ? ' on' : ''}`} title={c.tip} onClick={() => flip(c.id)}>
              <i className={`ef-mi-ic${c.ic === 'chart-bar-h' ? ' ef-rot' : ''}`}>
                <TI n={c.ic === 'chart-bar-h' ? 'chart-bar' : c.ic} />
              </i>
              <span>{c.name}</span>
              {v && <i className="ef-mi-ck"><TI n="check" /></i>}
            </button>
          )
        })}
      </div>
      <div className="ef-sep" />
      <button
        type="button"
        className="ef-mi"
        onClick={() => {
          setChartsOn(view, CHARTS.filter((c) => c.def).map((c) => c.id))
          touch()
          re((x) => x + 1)
        }}
      >
        <i className="ef-mi-ic"><TI n="refresh" /></i>
        <span>기본 네 개로 되돌리기</span>
      </button>
    </Pop>
  )
}
