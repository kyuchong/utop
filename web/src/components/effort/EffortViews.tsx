import { useEffect, useMemo, useRef, useState } from 'react'
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
import { autoColor, defaultGroup, isNumCol, newId, numFmt, toNum, type EfColumn, type EfDoc, type EfRow, type EfView } from './model'

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
  const [over, setOver] = useState<string | null>(null)
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
  const drop = (g: string) => {
    const r = dragRow
    setDragRow(null)
    setOver(null)
    if (!r) return
    const nv = g === NONE ? '' : g
    if (cellText(r[bc.id]) === nv) return
    if (nv) r[bc.id] = nv
    else delete r[bc.id]
    touch()
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
              className={`ef-klist${over === g ? ' over' : ''}`}
              onDragOver={(e) => {
                if (!dragRow) return
                e.preventDefault()
                if (over !== g) setOver(g)
              }}
              onDragLeave={(e) => e.currentTarget === e.target && setOver(null)}
              onDrop={(e) => {
                e.preventDefault()
                drop(g)
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
                  <div
                    key={i}
                    className={`ef-kcard${dragRow === r ? ' ghost' : ''}`}
                    draggable
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
                )
              })}
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

// ── 차트 추가(지시: 보고 싶은 차트를 사용자가 골라 보이게) ───────────────────
/** 사용자가 만든 차트 하나 — 보기의 chartSet.custom 에 둔다 */
export type EfChartKind = 'doughnut' | 'bar' | 'hbar' | 'line'
export interface EfChartSpec {
  id: string
  kind: EfChartKind
  /** 가로축 — 열 id, 또는 MONTH(월 열들) */
  by: string
  /** 값 — 'count'(행 개수) · 'mm'(행 공수) · 숫자 열 id. 가로축이 월이면 쓰지 않는다 */
  val: string
  /** 가로축이 월일 때 이 열 값마다 선·막대를 나눈다 */
  split?: string
  title?: string
}
export interface EfChartSet {
  /** 숨긴 기본 차트 id */
  hidden: string[]
  custom: EfChartSpec[]
}
export const MONTH = '__month'
/** 기본 차트 네 개 — 예전 화면 배치 차례 */
export const BUILTIN_CHARTS: Array<{ id: string; name: string }> = [
  { id: 'cnt', name: '개수 분포' },
  { id: 'sum', name: '숫자 열 합계' },
  { id: 'mm', name: '기준 열별 공수 합계' },
  { id: 'mon', name: '월별 추이' },
]
export const CHART_KINDS: Array<{ k: EfChartKind; name: string; ic: string }> = [
  { k: 'bar', name: '막대', ic: 'chart-bar' },
  { k: 'hbar', name: '가로 막대', ic: 'chart-bar' },
  { k: 'line', name: '선', ic: 'chart-line' },
  { k: 'doughnut', name: '도넛', ic: 'chart-donut' },
]
/** 보기에 붙은 차트 설정 — 없으면 만들어 붙인다(보기와 같이 저장된다) */
export function chartSetOf(view: EfView): EfChartSet {
  const cs = view.chartSet as Partial<EfChartSet> | undefined
  if (!cs || !Array.isArray(cs.hidden) || !Array.isArray(cs.custom)) view.chartSet = { hidden: cs?.hidden ?? [], custom: cs?.custom ?? [] }
  return view.chartSet as EfChartSet
}
/** 가로축이 될 수 있는 열 — 숫자·합계 열 빼고 전부 */
export const chartByCols = (cols: EfColumn[]) => cols.filter((c) => !isNumCol(c))

const monthCols = (cols: EfColumn[]) => cols.filter((c) => c.type === 'number' && !c.autoSum)
const r2 = (n: number) => Math.round(n * 100) / 100

export function chartTitle(sp: EfChartSpec, cols: EfColumn[]) {
  if (sp.title?.trim()) return sp.title.trim()
  const t = (id?: string) => cols.find((c) => c.id === id)?.title ?? '(지운 열)'
  if (sp.by === MONTH) return `월별 공수${sp.split ? ` — ${t(sp.split)}별` : ''}`
  const v = sp.val === 'count' ? '개수' : sp.val === 'mm' ? '공수 합계' : `${t(sp.val)} 합계`
  return `${t(sp.by)}별 ${v}`
}

/** 사용자 차트의 자료 — 이름표 + 계열들. 계열이 많으면 큰 차례 10개 + 기타 */
export function customSeries(sp: EfChartSpec, rows: EfRow[], cols: EfColumn[]) {
  const months = monthCols(cols)
  const auto = cols.find((c) => c.autoSum)
  const rowMM = (r: EfRow) => (auto ? (toNum(r[auto.id]) ?? 0) : months.reduce((a, c) => a + (toNum(r[c.id]) ?? 0), 0))
  if (sp.by === MONTH) {
    const labels = months.map((c) => c.title)
    const sum = (rs: EfRow[]) => months.map((c) => r2(rs.reduce((a, r) => a + (toNum(r[c.id]) ?? 0), 0)))
    if (!sp.split || !cols.some((c) => c.id === sp.split)) return { labels, series: [{ name: '합계', data: sum(rows) }] }
    const by = new Map<string, EfRow[]>()
    rows.forEach((r) => {
      const k = cellText(r[sp.split!]) || '(빈값)'
      by.set(k, [...(by.get(k) ?? []), r])
    })
    let groups = [...by.entries()].map(([name, rs]) => ({ name, rs, tot: rs.reduce((a, r) => a + rowMM(r), 0) })).sort((a, b) => b.tot - a.tot)
    if (groups.length > 10) groups = [...groups.slice(0, 9), { name: '기타', rs: groups.slice(9).flatMap((g) => g.rs), tot: 0 }]
    return { labels, series: groups.map((g) => ({ name: g.name, data: sum(g.rs) })) }
  }
  const valOf = (r: EfRow) => (sp.val === 'count' ? 1 : sp.val === 'mm' ? rowMM(r) : (toNum(r[sp.val]) ?? 0))
  const by = new Map<string, number>()
  rows.forEach((r) => {
    const k = cellText(r[sp.by]) || '(빈값)'
    by.set(k, (by.get(k) ?? 0) + valOf(r))
  })
  const ent = [...by.entries()].map(([k, v]) => [k, r2(v)] as const).sort((a, b) => b[1] - a[1])
  return { labels: ent.map((e) => e[0]), series: [{ name: sp.val === 'count' ? '개수' : '합계', data: ent.map((e) => e[1]) }] }
}

type Mk = ((el: HTMLCanvasElement) => { destroy: () => void }) | null
const BLUE = '#2d6fd4'
const ORANGE = '#e06a34'

function customMk(sp: EfChartSpec, rows: EfRow[], cols: EfColumn[]): Mk {
  const { labels, series } = customSeries(sp, rows, cols)
  if (!labels.length || !series.length) return null
  const multi = series.length > 1
  const color = (name: string) => (multi ? autoColor(name) : BLUE)
  if (sp.kind === 'doughnut')
    return (el) =>
      new Chart(el, {
        type: 'doughnut',
        data: { labels, datasets: [{ data: series[0]!.data, backgroundColor: labels.map((k) => autoColor(k)), borderWidth: 2, borderColor: '#fff' }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } },
      })
  if (sp.kind === 'line')
    return (el) =>
      new Chart(el, {
        type: 'line',
        data: {
          labels,
          datasets: series.map((s) => ({
            label: s.name, data: s.data, borderColor: color(s.name), backgroundColor: multi ? color(s.name) : 'rgba(45,111,212,.14)',
            fill: !multi, tension: 0.4, pointRadius: 3, borderWidth: 2,
          })),
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: multi, position: 'bottom' } },
          scales: { x: { grid: { display: false } }, y: { beginAtZero: true } },
        },
      })
  const h = sp.kind === 'hbar'
  return (el) =>
    new Chart(el, {
      type: 'bar',
      data: { labels, datasets: series.map((s) => ({ label: s.name, data: s.data, backgroundColor: color(s.name), borderRadius: 5 })) },
      options: {
        indexAxis: h ? 'y' : 'x', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: multi, position: 'bottom' } },
        scales: { x: { stacked: multi, beginAtZero: true, grid: { display: h } }, y: { stacked: multi, beginAtZero: true, grid: { display: !h } } },
      },
    })
}

/** 차트 카드 하나 — 그리는 함수(mk)가 바뀔 때만 다시 그린다 */
function ChartCard({ title, sub, tall, mk, onHide, hideTip }: { title: string; sub?: string; tall?: boolean; mk: Mk; onHide: () => void; hideTip: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!ref.current || !mk) return
    const c = mk(ref.current)
    return () => c.destroy()
  }, [mk])
  return (
    <div className="ef-card">
      <div className="ef-ch">
        <span className="ef-ch-t">
          {title}
          {sub && <span className="ef-ch-sub">{sub}</span>}
        </span>
        <button type="button" className="ef-chx" title={hideTip} aria-label={hideTip} onClick={onHide}>
          <TI n="x" />
        </button>
      </div>
      <div className={`ef-chbox${tall ? ' tall' : ''}`}>{mk ? <canvas ref={ref} /> : <div className="ef-chnone">그릴 자료가 없습니다</div>}</div>
    </div>
  )
}

/** 차트 보기 — 기본 네 개(개수 분포 · 숫자 열 합계 · 기준 열별 공수 합계 · 월별 추이, 예전 화면 배치) + 사용자가 추가한 차트 */
export function EfChart({ d, rows, view, ver, touch, toast }: { d: EfDoc; rows: EfRow[]; view: EfView; ver: number; touch: () => void; toast: (m: string) => void }) {
  const cc = chartColOf(view, d.columns)
  const cs = chartSetOf(view)
  const base = useMemo(() => {
    const mk: Record<string, Mk> = {}
    // ① 기준 열별 공수 합계 — 가득 찬 투입을 넘으면 주황
    const mm = mmByGroup(rows, d.columns, cc)
    mk.mm = !mm.length ? null : (el) =>
      new Chart(el, {
        type: 'bar',
        data: {
          labels: mm.map((x) => x.k),
          datasets: [{ label: '공수(M/M)', data: mm.map((x) => x.sum), backgroundColor: mm.map((x) => (x.sum > x.full ? ORANGE : BLUE)), borderRadius: 5 }],
        },
        options: {
          indexAxis: 'y', // 가로 막대 — 위에서부터 큰 차례(예전과 같다)
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { afterLabel: (it) => `가득 찬 투입 ${numFmt(mm[it.dataIndex]!.full)}` } },
          },
          scales: { x: { beginAtZero: true }, y: { grid: { display: false } } },
        },
      })
    // ② 월별 추이
    const tr = monthTrend(rows, d.columns)
    mk.mon = !tr.length ? null : (el) =>
      new Chart(el, {
        type: 'line',
        data: {
          labels: tr.map((x) => x.t),
          datasets: [{ label: '합계', data: tr.map((x) => x.v), borderColor: BLUE, backgroundColor: 'rgba(45,111,212,.14)', fill: true, tension: 0.4, pointRadius: 3, borderWidth: 2 }],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true } } },
      })
    // ③ 개수 분포
    const cnt: Record<string, number> = {}
    if (cc) rows.forEach((r) => {
      const v = cellText(r[cc.id]) || '(빈값)'
      cnt[v] = (cnt[v] ?? 0) + 1
    })
    const ck = Object.keys(cnt)
    mk.cnt = !ck.length ? null : (el) =>
      new Chart(el, {
        type: 'doughnut',
        data: { labels: ck, datasets: [{ data: ck.map((k) => cnt[k]!), backgroundColor: ck.map((k) => autoColor(k)), borderWidth: 2, borderColor: '#fff' }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } },
      })
    // ④ 숫자 열 합계
    const numCols = d.columns.filter((c) => c.type === 'number')
    const sums = numCols.map((c) => r2(rows.reduce((a, r) => a + (toNum(r[c.id]) ?? 0), 0)))
    mk.sum = !numCols.length ? null : (el) =>
      new Chart(el, {
        type: 'bar',
        data: { labels: numCols.map((c) => c.title), datasets: [{ label: '합계', data: sums, backgroundColor: BLUE, borderRadius: 5 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true } } },
      })
    return mk
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, ver, cc?.id])
  const custom = useMemo(
    () => cs.custom.map((sp) => ({ sp, mk: customMk(sp, rows, d.columns) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, ver, cs.custom],
  )
  const hide = (id: string) => {
    cs.hidden = [...cs.hidden.filter((x) => x !== id), id]
    touch()
    toast('차트를 숨겼습니다 — [＋ 차트 추가]에서 다시 켤 수 있습니다')
  }
  const del = (id: string) => {
    cs.custom = cs.custom.filter((x) => x.id !== id)
    touch()
    toast('차트를 지웠습니다')
  }
  const shown = BUILTIN_CHARTS.filter((b) => !cs.hidden.includes(b.id))
  if (!shown.length && !custom.length) return <div className="ef-empty">보이는 차트가 없습니다 — [＋ 차트 추가]에서 고르세요</div>
  const SUB: Record<string, string> = { mm: '많이 들어간 차례 · 가득 찬 투입을 넘으면 주황', mon: '숫자 열 합계(자동 합계 열 제외)' }
  return (
    <div className="ef-charts">
      {shown.map((b) => (
        <ChartCard key={b.id} title={b.name} sub={SUB[b.id]} tall={b.id === 'mm' || b.id === 'mon'} mk={base[b.id] ?? null} onHide={() => hide(b.id)} hideTip="이 차트 숨기기" />
      ))}
      {custom.map(({ sp, mk }) => (
        <ChartCard key={sp.id} title={chartTitle(sp, d.columns)} tall mk={mk} onHide={() => del(sp.id)} hideTip="이 차트 지우기" />
      ))}
    </div>
  )
}

/** [＋ 차트 추가] — 위: 기본 차트 켜고 끄기, 아래: 새 차트 만들기(종류 · 가로축 · 값) */
export function ChartAdd({ anchor, d, view, touch, toast, onClose }: { anchor: HTMLElement; d: EfDoc; view: EfView; touch: () => void; toast: (m: string) => void; onClose: () => void }) {
  const cols = d.columns
  const cs = chartSetOf(view)
  const byCols = chartByCols(cols)
  const nums = monthCols(cols) // 합계 열은 「공수 합계」 와 같아 뺀다
  const [, re] = useState(0)
  const [sp, setSp] = useState<EfChartSpec>(() => ({ id: '', kind: 'bar', by: byCols[0]?.id ?? MONTH, val: 'mm' }))
  const put = (p: Partial<EfChartSpec>) =>
    setSp((o) => {
      const n = { ...o, ...p }
      if (n.by === MONTH && n.kind === 'doughnut') n.kind = 'line' // 월별은 도넛으로 못 그린다
      return n
    })
  const toggle = (id: string) => {
    cs.hidden = cs.hidden.includes(id) ? cs.hidden.filter((x) => x !== id) : [...cs.hidden, id]
    touch()
    re((x) => x + 1)
  }
  const add = () => {
    const n: EfChartSpec = { ...sp, id: newId(), title: sp.title?.trim() || undefined }
    if (n.by !== MONTH) delete n.split
    cs.custom = [...cs.custom, n]
    touch()
    onClose()
    toast(`「${chartTitle(n, cols)}」 차트를 추가했습니다`)
  }
  const month = sp.by === MONTH
  return (
    <Pop anchor={anchor} cls="ef-menu ef-chadd" onClose={onClose}>
      <div className="ef-lbl">기본 차트</div>
      <div className="ef-mlist">
        {BUILTIN_CHARTS.map((b) => {
          const on = !cs.hidden.includes(b.id)
          return (
            <button key={b.id} type="button" className={`ef-mi${on ? ' on' : ''}`} onClick={() => toggle(b.id)}>
              <i className="ef-mi-ic"><TI n={on ? 'checkbox' : 'square'} /></i>
              <span>{b.name}</span>
            </button>
          )
        })}
      </div>
      <div className="ef-sep" />
      <div className="ef-lbl">새 차트 만들기</div>
      <div className="ef-chk">
        {CHART_KINDS.map((k) => (
          <button
            key={k.k}
            type="button"
            className={`ef-chk-b${sp.kind === k.k ? ' on' : ''}${k.k === 'hbar' ? ' rot' : ''}`}
            disabled={month && k.k === 'doughnut'}
            title={month && k.k === 'doughnut' ? '월별은 도넛으로 그릴 수 없습니다' : k.name}
            onClick={() => put({ kind: k.k })}
          >
            <TI n={k.ic} />
            <span>{k.name}</span>
          </button>
        ))}
      </div>
      <label className="ef-chf">
        <span>가로축</span>
        <select className="ef-fsel" value={sp.by} onChange={(e) => put({ by: e.target.value })}>
          <option value={MONTH}>월 (월 열마다)</option>
          {byCols.map((c) => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
      </label>
      {month ? (
        <label className="ef-chf">
          <span>나눠 보기</span>
          <select className="ef-fsel" value={sp.split ?? ''} onChange={(e) => put({ split: e.target.value || undefined })}>
            <option value="">나누지 않음 (전체 합)</option>
            {byCols.map((c) => (
              <option key={c.id} value={c.id}>{c.title}별</option>
            ))}
          </select>
        </label>
      ) : (
        <label className="ef-chf">
          <span>값</span>
          <select className="ef-fsel" value={sp.val} onChange={(e) => put({ val: e.target.value })}>
            <option value="mm">공수 합계 (M/M)</option>
            <option value="count">행 개수</option>
            {nums.map((c) => (
              <option key={c.id} value={c.id}>{c.title} 합계</option>
            ))}
          </select>
        </label>
      )}
      <label className="ef-chf">
        <span>제목</span>
        <input className="ef-fsel" value={sp.title ?? ''} placeholder={chartTitle({ ...sp, title: '' }, cols)} onChange={(e) => put({ title: e.target.value })} />
      </label>
      <button type="button" className="ef-btn ef-full" onClick={add}>
        <TI n="plus" /> 차트 추가
      </button>
    </Pop>
  )
}
