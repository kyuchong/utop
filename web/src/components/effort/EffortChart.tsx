import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type Plugin,
} from 'chart.js'
import { TI } from './icons'
import { AUTO, isNumCol, natural, normDate, numFmt, optColor, parseRange, toNum, truthy, type EfColumn, type EfRow, type EfView } from './model'

/**
 * Effort Plan 차트 보기 — 노션 방식(지시): **차트 보기 하나 = 차트 하나**, 오른쪽 설정 패널에서 꾸민다.
 *   종류(세로 막대·가로 막대·선·도넛) ·
 *   X축 — 표시 대상(열 또는 월, 날짜 묶음) · 정렬 기준 · 값 생략(고른 값 · 0 인 값) ·
 *   Y축 — 표시 대상(개수 / 합계·평균·중앙값·최소·최대 + 대상 열) · 그룹화(나란히·쌓기 / 여러 선) · 범위 · 기준선 ·
 *   모양 — 높이 · 색 · 눈금선 · 축 이름 · 값 라벨 · 범례 · 선(곡선·채우기·누적)   (지시: 노션 차트 설정처럼)
 * 설정은 보기의 view.nchart 에 둔다. 필터는 표처럼 보기마다(EffortPlan 이 걸러서 rows 로 준다).
 */

Chart.register(
  BarController, BarElement, LineController, LineElement, PointElement, DoughnutController, ArcElement, Filler,
  CategoryScale, LinearScale, Legend, Tooltip,
)

export type NcKind = 'bar' | 'hbar' | 'line' | 'donut'
export type NcAgg = 'count' | 'sum' | 'avg' | 'median' | 'min' | 'max'
export interface NcSpec {
  kind: NcKind
  /** X축 — 열 id 또는 MONTH(월 열들) */
  x: string
  /** 날짜 X 의 묶음 단위 */
  unit: 'day' | 'week' | 'month' | 'year'
  agg: NcAgg
  /** 집계 대상 — 숫자 열 id 또는 MM(행 공수). 개수면 안 쓴다, X 가 월이면 그 달 값 */
  of: string
  /** 그룹 기준 — 열 id, '' 이면 없음(도넛은 안 쓴다) */
  group: string
  /**
   * 그룹 막대 배치 — 나란히(그룹마다 막대 하나씩) · 쌓기(한 막대를 그룹으로 쪼갬, 노션 기본).
   * 지시: 그룹화하면 그룹대로 갈라져 나와야 한다 — 그래서 기본은 나란히
   */
  stack: 'side' | 'stack'
  /** 정렬 기준 — X축 차례 · X축 역순 · 값 큰 차례 · 값 작은 차례 */
  sort: 'x' | 'xdesc' | 'desc' | 'asc'
  omitZero: boolean
  /** 값 생략 — 숨길 X 값(이름표)들 */
  omit: string[]
  /** Y축 범위 — null 이면 자동 */
  yMin: number | null
  yMax: number | null
  /** 기준선 — 값 축의 이 값에 점선, 이름은 선 옆에 */
  ref: number | null
  refLabel: string
  height: 'S' | 'M' | 'L' | 'XL'
  color: 'auto' | 'one'
  grid: boolean
  axisNames: boolean
  labels: boolean
  legend: boolean
  smooth: boolean
  fill: boolean
  cumulative: boolean
}
export const MONTH = '__month'
export const MM = '__mm'
const NONE = '(빈값)'
const BLUE = '#2d6fd4'
const H: Record<NcSpec['height'], number> = { S: 220, M: 320, L: 440, XL: 580 }

const monthCols = (cols: EfColumn[]) => cols.filter((c) => c.type === 'number' && !c.autoSum)
/** X축이 될 수 있는 열 — 숫자·합계·계산 열 빼고 */
export const xCols = (cols: EfColumn[]) => cols.filter((c) => !isNumCol(c) && c.type !== 'datediff')
const cellText = (v: unknown) => (v == null ? '' : String(v))

/** 보기의 차트 설정 — 없으면 만든다. 예전 차트 탭(기준 열 chartCol)은 그 열을 X축으로 이어 받는다 */
export function ncOf(view: EfView, cols: EfColumn[]): NcSpec {
  const cur = view.nchart as Partial<NcSpec> | undefined
  const xs = xCols(cols)
  const months = monthCols(cols)
  const def: NcSpec = {
    kind: 'bar',
    x: (xs.find((c) => c.id === view.chartCol) ?? xs.find((c) => c.type === 'select') ?? xs[0])?.id ?? (months.length ? MONTH : ''),
    unit: 'month',
    agg: months.length ? 'sum' : 'count',
    of: MM,
    group: '',
    stack: 'side',
    sort: 'x',
    omitZero: false,
    omit: [],
    yMin: null,
    yMax: null,
    ref: null,
    refLabel: '',
    height: 'M',
    color: 'auto',
    grid: true,
    axisNames: false,
    labels: false,
    legend: true,
    smooth: true,
    fill: false,
    cumulative: false,
  }
  const sp = { ...def, ...(cur ?? {}) } as NcSpec
  view.nchart = sp
  return sp
}

/** 행 공수 — 합계 열(있으면), 없으면 월 열 합 */
const rowMM = (cols: EfColumn[]) => {
  const months = monthCols(cols)
  const auto = cols.find((c) => c.autoSum)
  return (r: EfRow) => (auto ? (toNum(r[auto.id]) ?? 0) : months.reduce((a, c) => a + (toNum(r[c.id]) ?? 0), 0))
}
const aggOf = (agg: NcAgg, v: number[]): number => {
  if (agg === 'count') return v.length
  if (!v.length) return 0
  if (agg === 'sum') return v.reduce((a, b) => a + b, 0)
  if (agg === 'avg') return v.reduce((a, b) => a + b, 0) / v.length
  if (agg === 'min') return Math.min(...v)
  if (agg === 'max') return Math.max(...v)
  const s = [...v].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}
const r2 = (n: number) => Math.round(n * 100) / 100

/** 날짜 칸 값 → 묶음 이름(일·주·월·연) */
function dateKey(v: unknown, c: EfColumn, unit: NcSpec['unit']): string {
  const raw = c.type === 'daterange' ? parseRange(v).s : cellText(v)
  const d = normDate(raw)
  if (!d) return ''
  if (unit === 'day') return d
  if (unit === 'month') return d.slice(0, 7)
  if (unit === 'year') return d.slice(0, 4)
  const t = new Date(d + 'T00:00:00')
  t.setDate(t.getDate() - ((t.getDay() + 6) % 7)) // 그 주 월요일
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')} 주`
}
/** 한 행이 X(또는 그룹) 열에서 떨어지는 값들 — 다중 선택은 여럿, 빈 칸은 (빈값) */
function keysOf(r: EfRow, c: EfColumn, unit: NcSpec['unit']): string[] {
  if (c.type === 'multiselect') {
    const ks = cellText(r[c.id]).split(',').map((x) => x.trim()).filter(Boolean)
    return ks.length ? ks : [NONE]
  }
  if (c.type === 'checkbox') return [truthy(r[c.id]) ? '켜짐' : '꺼짐']
  if (c.type === 'date' || c.type === 'daterange') return [dateKey(r[c.id], c, unit) || NONE]
  return [cellText(r[c.id]).trim() || NONE]
}
/** 값 차례 — 선택 계열은 옵션 차례, 날짜는 시간 차례, 나머지는 이름 차례. 빈값은 맨 뒤 */
function orderOf(c: EfColumn | undefined, ks: string[]): string[] {
  const opts = c?.options ?? []
  return [...ks].sort((a, b) => {
    if (a === NONE) return 1
    if (b === NONE) return -1
    const ia = opts.indexOf(a)
    const ib = opts.indexOf(b)
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib)
    return natural(a, b)
  })
}

/** 차트 자료 — 이름표(X) + 계열(그룹 기준 값마다, 없으면 하나) */
export function ncData(sp: NcSpec, rows: EfRow[], cols: EfColumn[]) {
  const months = monthCols(cols)
  const mm = rowMM(cols)
  const xc = cols.find((c) => c.id === sp.x)
  const gc = sp.kind === 'donut' ? undefined : cols.find((c) => c.id === sp.group && c.id !== sp.x)
  const valOf = (r: EfRow): number | null => (sp.of === MM ? mm(r) : toNum(r[sp.of]))
  // 그룹별 행 묶음 — 그룹이 없으면 한 묶음
  const groups = new Map<string, EfRow[]>()
  if (gc)
    rows.forEach((r) =>
      keysOf(r, gc, sp.unit).forEach((k) => {
        if (!groups.has(k)) groups.set(k, [])
        groups.get(k)!.push(r)
      }),
    )
  else groups.set('', rows)

  let labels: string[]
  const cell = (rs: EfRow[], x: string): number => {
    if (sp.x === MONTH) {
      const mc = months.find((c) => c.title === x)
      const v = rs.map((r) => toNum(r[mc!.id])).filter((n): n is number => n !== null && n !== 0)
      return aggOf(sp.agg, v)
    }
    const hit = rs.filter((r) => keysOf(r, xc!, sp.unit).includes(x))
    if (sp.agg === 'count') return hit.length
    return aggOf(sp.agg, hit.map(valOf).filter((n): n is number => n !== null))
  }
  if (sp.x === MONTH) labels = months.map((c) => c.title)
  else if (xc) labels = orderOf(xc, [...new Set(rows.flatMap((r) => keysOf(r, xc, sp.unit)))])
  else labels = []

  let series = [...groups.entries()].map(([name, rs]) => ({ name, data: labels.map((x) => r2(cell(rs, x))) }))
  if (gc) {
    // 그룹 계열 차례 — 그룹 열의 차례, 많으면 큰 차례 9개 + 기타
    const ord = orderOf(gc, series.map((s) => s.name))
    series.sort((a, b) => ord.indexOf(a.name) - ord.indexOf(b.name))
    if (series.length > 10) {
      const tot = (s: { data: number[] }) => s.data.reduce((a, b) => a + b, 0)
      const big = [...series].sort((a, b) => tot(b) - tot(a))
      const keep = new Set(big.slice(0, 9).map((s) => s.name))
      const rest = series.filter((s) => !keep.has(s.name))
      series = [...series.filter((s) => keep.has(s.name)), { name: '기타', data: labels.map((_, i) => r2(rest.reduce((a, s) => a + s.data[i]!, 0))) }]
    }
  }
  // 값 생략 · 0 숨기기 · 정렬 — X 이름표 단위로(계열 합 기준). 생략 고르기 목록은 생략 전 이름표 전부
  const allLabels = [...labels]
  const total = labels.map((_, i) => series.reduce((a, s) => a + s.data[i]!, 0))
  let idx = labels.map((_, i) => i)
  const omit = new Set(sp.omit ?? [])
  if (omit.size) idx = idx.filter((i) => !omit.has(labels[i]!))
  if (sp.omitZero) idx = idx.filter((i) => total[i] !== 0)
  if (sp.sort === 'xdesc') idx.reverse()
  else if (sp.sort !== 'x') idx.sort((a, b) => (sp.sort === 'desc' ? total[b]! - total[a]! : total[a]! - total[b]!))
  labels = idx.map((i) => labels[i]!)
  series = series.map((s) => ({ name: s.name, data: idx.map((i) => s.data[i]!) }))
  if (sp.kind === 'line' && sp.cumulative)
    series = series.map((s) => {
      let acc = 0
      return { name: s.name, data: s.data.map((v) => r2((acc += v))) }
    })
  return { labels, series, xCol: xc, gCol: gc, allLabels }
}

/** 기준선 — 값 축의 그 값에 점선과 이름(노션 Y축 「기준선」). 가로 막대면 세로선 */
const refLine: Plugin = {
  id: 'efRefLine',
  afterDatasetsDraw(chart, _args, opts) {
    const o = opts as { value?: number | null; label?: string; horiz?: boolean }
    if (o.value == null || !Number.isFinite(o.value)) return
    const sc = chart.scales[o.horiz ? 'x' : 'y']
    if (!sc) return
    const p = sc.getPixelForValue(o.value)
    const a = chart.chartArea
    if (o.horiz ? p < a.left || p > a.right : p < a.top || p > a.bottom) return
    const ctx = chart.ctx
    ctx.save()
    ctx.strokeStyle = '#e06a34'
    ctx.lineWidth = 1.5
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    if (o.horiz) {
      ctx.moveTo(p, a.top)
      ctx.lineTo(p, a.bottom)
    } else {
      ctx.moveTo(a.left, p)
      ctx.lineTo(a.right, p)
    }
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#e06a34'
    ctx.font = '700 11px Pretendard, system-ui, sans-serif'
    const t = `${o.label ? o.label + ' ' : ''}${numFmt(o.value)}`
    if (o.horiz) {
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(t, p + 4, a.top + 2)
    } else {
      ctx.textAlign = 'right'
      ctx.textBaseline = 'bottom'
      ctx.fillText(t, a.right - 2, p - 3)
    }
    ctx.restore()
  },
}

/** 값 라벨 — 막대 끝·선 점·도넛 조각 위에 숫자(작은 플러그인, 라이브러리를 더 들이지 않는다) */
const valueLabels: Plugin = {
  id: 'efValueLabels',
  afterDatasetsDraw(chart) {
    const ctx = chart.ctx
    const horiz = (chart.options as { indexAxis?: string }).indexAxis === 'y'
    const donut = (chart.config as { type?: string }).type === 'doughnut'
    const bar = (chart.config as { type?: string }).type === 'bar'
    // 쌓은 막대는 조각 가운데에(위에 쓰면 겹친다), 얇은 조각은 건너뛴다. 나란히 선 막대는 저마다 끝에
    const stacked = bar && chart.data.datasets.length > 1 && !!(chart.options as { scales?: { x?: { stacked?: boolean } } }).scales?.x?.stacked
    ctx.save()
    ctx.font = '600 11px Pretendard, system-ui, sans-serif'
    ctx.fillStyle = donut ? '#fff' : '#374151'
    ctx.textAlign = horiz ? 'left' : 'center'
    ctx.textBaseline = horiz ? 'middle' : 'bottom'
    chart.data.datasets.forEach((ds, di) => {
      const meta = chart.getDatasetMeta(di)
      if (meta.hidden) return
      meta.data.forEach((el, i) => {
        const v = Number(ds.data[i])
        if (!v) return
        const p = donut ? (el as unknown as { tooltipPosition: () => { x: number; y: number } }).tooltipPosition() : el
        const t = numFmt(v)
        if (donut) {
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(t, p.x, p.y)
        } else if (stacked) {
          const b = el as unknown as { x: number; y: number; base: number }
          const size = Math.abs((horiz ? b.x : b.y) - b.base)
          if (size < 14) return
          ctx.save()
          ctx.fillStyle = '#fff'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          if (horiz) ctx.fillText(t, (b.x + b.base) / 2, b.y)
          else ctx.fillText(t, b.x, (b.y + b.base) / 2)
          ctx.restore()
        } else if (horiz) ctx.fillText(t, p.x + 4, p.y)
        else ctx.fillText(t, p.x, p.y - 3)
      })
    })
    ctx.restore()
  },
}

const AGG_NAME: Record<NcAgg, string> = { count: '개수', sum: '합계', avg: '평균', median: '중앙값', min: '최소', max: '최대' }

/** 차트 보기 본문 — 왼쪽 차트, 오른쪽 설정 패널(노션처럼 열고 닫는다) */
export function EfNotionChart({
  cols,
  rows,
  view,
  ver,
  panel,
  setPanel,
  touch,
}: {
  cols: EfColumn[]
  rows: EfRow[]
  view: EfView
  ver: number
  panel: boolean
  setPanel: (v: boolean) => void
  touch: () => void
}) {
  const sp = ncOf(view, cols)
  const ref = useRef<HTMLCanvasElement>(null)
  const [omitOpen, setOmitOpen] = useState(false)
  const data = useMemo(
    () => ncData(sp, rows, cols),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, cols, ver, JSON.stringify(sp)],
  )
  const set = (p: Partial<NcSpec>) => {
    view.nchart = { ...sp, ...p }
    touch()
  }
  const ofName = sp.x === MONTH ? '그 달 공수' : sp.of === MM ? '공수(M/M)' : (cols.find((c) => c.id === sp.of)?.title ?? '')
  const yTitle = sp.agg === 'count' ? '개수' : `${ofName} ${AGG_NAME[sp.agg]}`
  const xTitle = sp.x === MONTH ? '월' : (data.xCol?.title ?? '')

  useEffect(() => {
    const el = ref.current
    if (!el || !data.labels.length) return
    const { labels, series, xCol, gCol } = data
    const multi = !!gCol
    // 색 — 옵션에 직접 정한 색이 있으면 그 색(노션처럼), 없으면 팔레트 차례(이름으로 정하면 겹친다: PA1팀=검증1팀)
    // 팔레트는 직접 정한 색과 겹치지 않게 그 색들을 건너뛴다(검증1팀이 파랑이면 PA1팀은 다음 색)
    const palOf = (c: EfColumn | undefined, names: string[]) => {
      const fixed = new Set(names.map((n) => c?.optColors?.[n]?.toLowerCase()).filter(Boolean))
      const pal = AUTO.filter((x) => !fixed.has(x.toLowerCase()))
      const m = new Map<string, string>()
      let k = 0
      names.forEach((n) => {
        const own = c?.optColors?.[n]
        m.set(n, own ? optColor(c, n) : (pal.length ? pal : AUTO)[k++ % (pal.length || AUTO.length)]!)
      })
      return m
    }
    const xPal = palOf(xCol, labels)
    const gPal = palOf(gCol, series.map((s) => s.name))
    const colorOf = (name: string, _i: number, c: EfColumn | undefined) =>
      sp.color === 'one' ? BLUE : ((c === gCol && gCol ? gPal : xPal).get(name) ?? BLUE)
    let ch: Chart
    if (sp.kind === 'donut') {
      const s = series[0]!
      ch = new Chart(el, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{ data: s.data, backgroundColor: labels.map((l, i) => (sp.color === 'one' ? AUTO[0]! : colorOf(l, i, xCol))), borderColor: '#fff', borderWidth: 2 }],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: sp.legend, position: 'right' } } },
        plugins: sp.labels ? [valueLabels] : [],
      })
    } else {
      const horiz = sp.kind === 'hbar'
      const line = sp.kind === 'line'
      const datasets = series.map((s, i) => {
        // 그룹이 없으면 막대마다 X 값 색(옵션 색), 있으면 계열마다 그룹 값 색
        const c = multi ? colorOf(s.name, i, gCol) : line ? BLUE : undefined
        const perBar = !multi && !line ? labels.map((l, k) => colorOf(l, k, xCol)) : undefined
        return line
          ? {
              label: s.name || yTitle,
              data: s.data,
              borderColor: c,
              backgroundColor: multi ? c + '33' : 'rgba(45,111,212,.14)',
              fill: sp.fill,
              tension: sp.smooth ? 0.4 : 0,
              pointRadius: 3,
              borderWidth: 2,
            }
          : { label: s.name || yTitle, data: s.data, backgroundColor: perBar ?? c, borderRadius: 4, maxBarThickness: 48 }
      })
      const ax = (title: string, isVal: boolean) => ({
        stacked: multi && !line && sp.stack === 'stack',
        beginAtZero: !(isVal && sp.yMin != null),
        // Y축 범위(노션) — 값 축만, 비우면 자동
        ...(isVal && sp.yMin != null ? { min: sp.yMin } : {}),
        ...(isVal && sp.yMax != null ? { max: sp.yMax } : {}),
        grid: { display: sp.grid && isVal },
        title: { display: sp.axisNames, text: title, font: { size: 11, weight: 700 as const } },
        ticks: { font: { size: 11 } },
      })
      ch = new Chart(el, {
        type: line ? 'line' : 'bar',
        data: { labels, datasets },
        options: {
          indexAxis: horiz ? 'y' : 'x',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: sp.legend && multi, position: 'bottom' },
            ...({ efRefLine: { value: sp.ref, label: sp.refLabel, horiz } } as object),
          },
          scales: horiz ? { x: ax(yTitle, true), y: ax(xTitle, false) } : { x: ax(xTitle, false), y: ax(yTitle, true) },
        },
        plugins: [...(sp.labels ? [valueLabels] : []), refLine],
      })
    }
    return () => ch.destroy()
  }, [data, sp.kind, sp.color, sp.legend, sp.labels, sp.grid, sp.axisNames, sp.smooth, sp.fill, sp.yMin, sp.yMax, sp.ref, sp.refLabel, sp.stack, yTitle, xTitle])

  const xs = xCols(cols)
  const nums = monthCols(cols)
  const donut = sp.kind === 'donut'
  /** 입력칸 숫자 — 비우면 null(자동) */
  const numIn = (v: string) => (v.trim() === '' || !Number.isFinite(Number(v)) ? null : Number(v))
  const xc = cols.find((c) => c.id === sp.x)
  const dateX = xc && (xc.type === 'date' || xc.type === 'daterange')
  const Seg = <T extends string>({ v, opts, on }: { v: T; opts: Array<[T, string, string?]>; on: (v: T) => void }) => (
    <div className="ef-nc-seg">
      {opts.map(([k, t, ic]) => (
        <button key={k} type="button" className={v === k ? 'on' : ''} onClick={() => on(k)} title={t}>
          {ic && <TI n={ic} className={k === 'hbar' ? 'ef-nc-rot' : undefined} />}
          <span>{t}</span>
        </button>
      ))}
    </div>
  )
  const Tog = ({ k, t }: { k: 'grid' | 'axisNames' | 'labels' | 'legend' | 'smooth' | 'fill' | 'cumulative' | 'omitZero'; t: string }) => (
    <label className="ef-nc-tog">
      <span>{t}</span>
      <input type="checkbox" checked={sp[k]} onChange={(e) => set({ [k]: e.target.checked } as Partial<NcSpec>)} />
    </label>
  )

  return (
    <div className="ef-nc">
      <div className="ef-nc-main">
        <div className="ef-nc-card">
          <div className="ef-nc-title">
            {yTitle} <span>· {xTitle}{data.gCol ? ` · ${data.gCol.title}별` : ''}</span>
          </div>
          {data.labels.length ? (
            <div className="ef-nc-box" style={{ height: H[sp.height] }}>
              <canvas ref={ref} />
            </div>
          ) : (
            <div className="ef-nc-none">그릴 자료가 없습니다 — 오른쪽 설정에서 X축을 고르거나 필터를 풀어 보세요</div>
          )}
        </div>
      </div>
      {panel && (
        <aside className="ef-nc-panel" aria-label="차트 설정">
          <div className="ef-nc-ph">
            <b>차트 설정</b>
            <button type="button" className="ef-nc-x" aria-label="닫기" onClick={() => setPanel(false)}>
              <TI n="x" />
            </button>
          </div>
          <div className="ef-nc-sec">종류</div>
          <Seg
            v={sp.kind}
            opts={[
              ['bar', '세로 막대', 'chart-bar'],
              ['hbar', '가로 막대', 'chart-bar'],
              ['line', '선', 'chart-line'],
              ['donut', '도넛', 'chart-donut'],
            ]}
            on={(k) => set({ kind: k })}
          />
          {/* 노션 차트 설정처럼 X축 · Y축 두 묶음(지시) */}
          <div className="ef-nc-sec">{donut ? '조각' : 'X축'}</div>
          <label className="ef-nc-f">
            <span>표시 대상</span>
            <select className="ef-fsel" value={sp.x} onChange={(e) => set({ x: e.target.value, omit: [] })}>
              {nums.length > 0 && <option value={MONTH}>월 (01월~12월 열)</option>}
              {xs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
          {dateX && (
            <label className="ef-nc-f">
              <span>날짜 묶음</span>
              <select className="ef-fsel" value={sp.unit} onChange={(e) => set({ unit: e.target.value as NcSpec['unit'], omit: [] })}>
                <option value="day">일</option>
                <option value="week">주</option>
                <option value="month">월</option>
                <option value="year">연</option>
              </select>
            </label>
          )}
          <label className="ef-nc-f">
            <span>정렬 기준</span>
            <select className="ef-fsel" value={sp.sort} onChange={(e) => set({ sort: e.target.value as NcSpec['sort'] })}>
              <option value="x">{donut ? '조각' : 'X축'} 차례</option>
              <option value="xdesc">{donut ? '조각' : 'X축'} 역순</option>
              <option value="desc">값 큰 차례</option>
              <option value="asc">값 작은 차례</option>
            </select>
          </label>
          {/* 값 생략 — 숨길 X 값 고르기(노션 「Omit values」) + 0 인 값 모두 */}
          <button type="button" className="ef-nc-f ef-nc-more" onClick={() => setOmitOpen((o) => !o)} aria-expanded={omitOpen}>
            <span>값 생략</span>
            <em>{(sp.omit?.length ?? 0) + (sp.omitZero ? 1 : 0) ? `${sp.omit?.length ?? 0}개${sp.omitZero ? ' · 0 값' : ''}` : '없음'}</em>
            <TI n={omitOpen ? 'chevron-down' : 'chevron-right'} />
          </button>
          {omitOpen && (
            <div className="ef-nc-omit">
              <Tog k="omitZero" t="0 인 값 모두 생략" />
              {data.allLabels.map((l) => {
                const on = (sp.omit ?? []).includes(l)
                return (
                  <label key={l} className="ef-nc-tog">
                    <span className={on ? 'off' : ''}>{l}</span>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => set({ omit: on ? sp.omit.filter((x) => x !== l) : [...(sp.omit ?? []), l] })}
                    />
                  </label>
                )
              })}
              {(sp.omit?.length ?? 0) > 0 && (
                <button type="button" className="ef-nc-link" onClick={() => set({ omit: [] })}>
                  생략 모두 풀기
                </button>
              )}
            </div>
          )}

          <div className="ef-nc-sec">{donut ? '값' : 'Y축'}</div>
          <label className="ef-nc-f">
            <span>표시 대상</span>
            <select className="ef-fsel" value={sp.agg} onChange={(e) => set({ agg: e.target.value as NcAgg })}>
              {(Object.keys(AGG_NAME) as NcAgg[]).map((a) => (
                <option key={a} value={a}>
                  {a === 'count' ? (sp.x === MONTH ? '개수 (공수가 있는 행)' : '개수 (행)') : AGG_NAME[a]}
                </option>
              ))}
            </select>
          </label>
          {sp.agg !== 'count' && sp.x !== MONTH && (
            <label className="ef-nc-f">
              <span>대상 열</span>
              <select className="ef-fsel" value={sp.of} onChange={(e) => set({ of: e.target.value })}>
                {nums.length > 0 && <option value={MM}>공수 (M/M, 행 합계)</option>}
                {nums.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!donut && (
            <label className="ef-nc-f">
              <span>그룹화</span>
              <select className="ef-fsel" value={sp.group} onChange={(e) => set({ group: e.target.value })}>
                <option value="">없음</option>
                {xs
                  .filter((c) => c.id !== sp.x)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {/* 그룹 막대 배치(지시: 그룹화대로 갈라져 나오게) — 막대 차트에 그룹이 있을 때만 */}
          {!!sp.group && (sp.kind === 'bar' || sp.kind === 'hbar') && (
            <label className="ef-nc-f">
              <span>막대 배치</span>
              <Seg v={sp.stack} opts={[['side', '나란히'], ['stack', '쌓기']]} on={(v) => set({ stack: v })} />
            </label>
          )}
          {!donut && (
            <div className="ef-nc-f">
              <span>범위</span>
              <div className="ef-nc-range">
                <input className="ef-fsel" type="number" placeholder="자동" aria-label="최솟값" value={sp.yMin ?? ''} onChange={(e) => set({ yMin: numIn(e.target.value) })} />
                <i>~</i>
                <input className="ef-fsel" type="number" placeholder="자동" aria-label="최댓값" value={sp.yMax ?? ''} onChange={(e) => set({ yMax: numIn(e.target.value) })} />
              </div>
            </div>
          )}
          {!donut && (
            <div className="ef-nc-f">
              <span>기준선</span>
              <div className="ef-nc-range">
                <input className="ef-fsel" type="number" placeholder="값" aria-label="기준선 값" value={sp.ref ?? ''} onChange={(e) => set({ ref: numIn(e.target.value) })} />
                <input className="ef-fsel" placeholder="이름 (목표 등)" aria-label="기준선 이름" value={sp.refLabel ?? ''} onChange={(e) => set({ refLabel: e.target.value })} />
              </div>
            </div>
          )}
          <div className="ef-nc-sec">모양</div>
          <label className="ef-nc-f">
            <span>높이</span>
            <Seg v={sp.height} opts={[['S', '작게'], ['M', '보통'], ['L', '크게'], ['XL', '최대']]} on={(h) => set({ height: h })} />
          </label>
          <label className="ef-nc-f">
            <span>색</span>
            <Seg v={sp.color} opts={[['auto', '옵션 색'], ['one', '한 가지']]} on={(c) => set({ color: c })} />
          </label>
          {sp.kind !== 'donut' && <Tog k="grid" t="눈금선" />}
          {sp.kind !== 'donut' && <Tog k="axisNames" t="축 이름" />}
          <Tog k="labels" t="값 라벨" />
          <Tog k="legend" t="범례" />
          {sp.kind === 'line' && (
            <>
              <Tog k="smooth" t="부드러운 곡선" />
              <Tog k="fill" t="아래 채우기" />
              <Tog k="cumulative" t="누적" />
            </>
          )}
        </aside>
      )}
    </div>
  )
}
