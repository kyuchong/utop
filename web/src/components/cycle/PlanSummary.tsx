import { useMemo, useState } from 'react'
import { prefGet, prefSet } from '@/lib/prefs'
import './PlanSummary.css'

/**
 * **플랜 목록 위 요약 띠** (제안하신 그림 그대로).
 *
 * 왼쪽은 **일자별 추이**, 오른쪽은 **결과 분포 파이와 범례**다.
 *
 * 무엇을 세느냐가 이 판의 전부다. **지금 표에 보이는 플랜**을 센다 —
 * 거르개·검색을 걸면 요약도 같이 좁혀지고, 걸러서 한 건만 남으면 자연히
 * 그 한 건의 요약이 된다. 무엇을 세고 있는지는 위에 글로 적는다.
 *
 * 추이는 **지어내지 않는다.** 항목마다 찍힌 실행 날짜(executed_at)를
 * 날짜별로 모은 것이라, 안 돌린 날은 0이 맞다.
 */

/** 요약이 세는 한 항목 — 결과와 언제 돌렸는지 */
export interface SumItem {
  /** pass · fail · etc · none */
  k: 'pass' | 'fail' | 'etc' | 'none'
  /** 실행 날짜 (YYYY-MM-DD). 안 돌렸으면 빈 값 */
  day: string
}

/** 왼쪽 그림으로 무엇을 볼지 — 드롭다운으로 고른다(지시).
    자료로 **실제 그릴 수 있는 것**만 둔다. 없는 것을 메뉴에 두면
    골랐을 때 빈 판이 뜬다. */
const CHARTS = [
  { k: 'daily', label: '일자별 시험 진행 현황' },
  { k: 'cum', label: '일자별 누적 진행' },
  { k: 'plan', label: '플랜별 진행률' },
] as const
type ChartKind = (typeof CHARTS)[number]['k']

const SEG = [
  { k: 'pass', label: '통과', color: '#12a678' },
  { k: 'fail', label: '실패', color: '#d92953' },
  { k: 'etc', label: '기타', color: '#e8a33d' },
  { k: 'none', label: '미실행', color: '#9aa7ab' },
] as const

function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p = (a: number) => [
    cx + r * Math.cos(((a - 90) * Math.PI) / 180),
    cy + r * Math.sin(((a - 90) * Math.PI) / 180),
  ]
  const big = a1 - a0 > 180 ? 1 : 0
  const [x0, y0] = p(a0)
  const [x1, y1] = p(a1)
  return `M${cx} ${cy} L${x0} ${y0} A${r} ${r} 0 ${big} 1 ${x1} ${y1} Z`
}

/** 오늘까지 n 일 — 자료가 없어도 가로축은 서야 한다 */
function lastDays(n: number, end: string): string[] {
  const out: string[] = []
  const d = new Date(`${end}T00:00:00`)
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d)
    x.setDate(d.getDate() - i)
    out.push(x.toISOString().slice(0, 10))
  }
  return out
}

export default function PlanSummary({
  scope, items, plans, today,
}: {
  scope: string
  /** 지금 표에 보이는 플랜들의 **항목** 전부 */
  items: SumItem[]
  /** 보이는 플랜 — 이름과 진행률(플랜별 그림에 쓴다) */
  plans: Array<{ name: string; done: number; total: number }>
  /** 오늘 (YYYY-MM-DD) — 가로축 끝 */
  today: string
}) {
  const [open, setOpen] = useState(() => prefGet('utop.cycle.sum') !== '0')
  const [kind, setKind] = useState<ChartKind>(
    () => (prefGet('utop.cycle.sumchart') as ChartKind) || 'daily',
  )
  const pickKind = (k: ChartKind) => {
    setKind(k)
    prefSet('utop.cycle.sumchart', k)
  }

  const t = useMemo(() => {
    const s = { total: items.length, pass: 0, fail: 0, etc: 0, none: 0 }
    for (const it of items) s[it.k]++
    return s
  }, [items])

  const segs = useMemo(() => {
    const out: Array<{ k: string; label: string; color: string; n: number; pct: number; d: string }> = []
    if (!t.total) return out
    let at = 0
    for (const s of SEG) {
      const n = t[s.k]
      const pct = Math.round((n / t.total) * 100)
      const deg = (n / t.total) * 360
      out.push({
        k: s.k, label: s.label, color: s.color, n, pct,
        d: n ? arc(60, 60, 56, at, at + Math.min(deg, 359.9)) : '',
      })
      at += deg
    }
    return out
  }, [t])

  /** 일자별 — 그날 통과·실패·기타가 몇 건 나왔나 */
  const days = useMemo(() => lastDays(7, today), [today])
  const trend = useMemo(() => {
    const by = new Map<string, { pass: number; fail: number; etc: number }>()
    for (const d of days) by.set(d, { pass: 0, fail: 0, etc: 0 })
    for (const it of items) {
      if (!it.day || it.k === 'none') continue
      const b = by.get(it.day)
      if (b) b[it.k]++
    }
    return days.map((d) => ({ day: d, ...by.get(d)! }))
  }, [days, items])

  const top = useMemo(
    () => Math.max(5, ...trend.map((r) => Math.max(r.pass, r.fail, r.etc))),
    [trend],
  )

  /* 그림 좌표 — 왼쪽 눈금 자리를 비워 둔다 */
  /* 가로로 긴 판이다. viewBox 를 좁게 잡으면 SVG 가 비율을 지키느라
     가운데만 쓰고 좌우가 비어 보인다(재현함). */
  const W = 900
  const H = 170
  const L = 28
  const B = 22
  const x = (i: number) => L + (i * (W - L - 6)) / Math.max(1, days.length - 1)
  const y = (v: number) => H - B - (v / top) * (H - B - 8)
  const line = (k: 'pass' | 'fail' | 'etc') =>
    trend.map((r, i) => `${i ? 'L' : 'M'}${x(i)} ${y(r[k])}`).join(' ')

  /** 누적 — 그날까지 몇 건을 돌렸나 */
  const cum = useMemo(() => {
    let n = 0
    return trend.map((r) => {
      n += r.pass + r.fail + r.etc
      return n
    })
  }, [trend])
  const cumTop = Math.max(1, t.total)
  const cumY = (v: number) => H - B - (v / cumTop) * (H - B - 8)

  const csv = () => {
    const rows = [
      ['날짜', '통과', '실패', '기타'],
      ...trend.map((r) => [r.day, String(r.pass), String(r.fail), String(r.etc)]),
      [],
      ['구분', '건수', '비율'],
      ...segs.map((s) => [s.label, String(s.n), `${s.pct}%`]),
    ]
    const txt = rows.map((r) => r.join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([`﻿${txt}`], { type: 'text/csv;charset=utf-8' }))
    a.download = `plan-summary-${today}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const toggle = () =>
    setOpen((v) => {
      prefSet('utop.cycle.sum', v ? '0' : '1')
      return !v
    })

  return (
    <section className={`ps${open ? '' : ' shut'}`}>
      <div className="ps-head">
        <button type="button" className="ps-x" onClick={toggle} aria-expanded={open}>
          {open ? '▾' : '▸'}
        </button>
        <b>요약</b>
        <span className="ps-scope">{scope}</span>
        <span className="ps-sp" />
        {!open && t.total > 0 && (
          <span className="ps-mini">
            시험 항목 {t.total} · 통과 {t.pass} · 실패 {t.fail} · 미실행 {t.none}
          </span>
        )}
        {open && t.total > 0 && (
          <select
            className="ps-kind"
            value={kind}
            onChange={(e) => pickKind(e.target.value as ChartKind)}
            title="왼쪽 그림 바꾸기"
          >
            {CHARTS.map((c) => (
              <option key={c.k} value={c.k}>
                {c.label}
              </option>
            ))}
          </select>
        )}
        {open && t.total > 0 && (
          <button type="button" className="ps-dl" title="이 요약을 CSV 로 내려받습니다" onClick={csv}>
            ⭳ CSV
          </button>
        )}
      </div>

      {open &&
        (t.total ? (
          <div className="ps-body">
            {/* ── 왼쪽: 일자별 추이 ── */}
            <div className="ps-trend">
              {kind === 'plan' ? (
                /* 플랜별 진행률 — 어느 플랜이 뒤처졌는지 한눈에 */
                <div className="ps-plans">
                  {plans.length ? (
                    plans.slice(0, 8).map((p, i2) => {
                      const pct = p.total ? Math.round((p.done / p.total) * 100) : 0
                      return (
                        <div className="ps-prow" key={`${p.name}-${i2}`}>
                          <span className="ps-pnm" title={p.name}>
                            {p.name || '(이름 없음)'}
                          </span>
                          <span className="ps-pbar">
                            <i style={{ width: `${pct}%` }} />
                          </span>
                          <span className="ps-ppct">{pct}%</span>
                        </div>
                      )
                    })
                  ) : (
                    <div className="ps-none">보이는 플랜이 없습니다</div>
                  )}
                  {plans.length > 8 && <div className="ps-more">외 {plans.length - 8}건</div>}
                </div>
              ) : (
                <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={CHARTS.find((c) => c.k === kind)!.label}>
                  {[0, 0.5, 1].map((f) => {
                    const v = (kind === 'cum' ? cumTop : top) * f
                    const yy = kind === 'cum' ? cumY(v) : y(v)
                    return (
                      <g key={f}>
                        <line x1={L} y1={yy} x2={W - 6} y2={yy} className="ps-grid" />
                        <text x={L - 6} y={yy + 3} textAnchor="end" className="ps-ax">
                          {Math.round(v)}
                        </text>
                      </g>
                    )
                  })}

                  {kind === 'daily' ? (
                    <>
                      {(['etc', 'fail', 'pass'] as const).map((k) => (
                        <path
                          key={k}
                          d={line(k)}
                          fill="none"
                          stroke={SEG.find((s) => s.k === k)!.color}
                          strokeWidth="2"
                          strokeLinejoin="round"
                        />
                      ))}
                      {(['etc', 'fail', 'pass'] as const).map((k) =>
                        trend.map((r, i2) =>
                          r[k] ? (
                            <circle
                              key={`${k}${i2}`}
                              cx={x(i2)}
                              cy={y(r[k])}
                              r="3"
                              fill="#fff"
                              stroke={SEG.find((s) => s.k === k)!.color}
                              strokeWidth="2"
                            >
                              <title>{`${r.day} · ${SEG.find((s) => s.k === k)!.label} ${r[k]}건`}</title>
                            </circle>
                          ) : null,
                        ),
                      )}
                    </>
                  ) : (
                    /* 누적 — 그날까지 몇 건을 돌렸나. 채워서 그린다 */
                    <>
                      <path
                        d={`M${x(0)} ${cumY(0)} ${cum.map((v, i2) => `L${x(i2)} ${cumY(v)}`).join(' ')} L${x(cum.length - 1)} ${cumY(0)} Z`}
                        fill="#12a67822"
                      />
                      <path
                        d={cum.map((v, i2) => `${i2 ? 'L' : 'M'}${x(i2)} ${cumY(v)}`).join(' ')}
                        fill="none"
                        stroke="#12a678"
                        strokeWidth="2"
                      />
                      {cum.map((v, i2) => (
                        <circle key={i2} cx={x(i2)} cy={cumY(v)} r="3" fill="#fff" stroke="#12a678" strokeWidth="2">
                          <title>{`${trend[i2]!.day} · 누적 ${v} / ${t.total}건`}</title>
                        </circle>
                      ))}
                    </>
                  )}

                  {trend.map((r, i2) => (
                    <text key={r.day} x={x(i2)} y={H - 6} textAnchor="middle" className="ps-ax">
                      {r.day.slice(5).replace('-', '/')}
                    </text>
                  ))}
                </svg>
              )}
            </div>

            {/* ── 오른쪽: 파이와 범례 ── */}
            <div className="ps-right">
              <svg viewBox="0 0 120 120" className="ps-pie" role="img" aria-label="결과 분포">
                {segs.map((s) => s.d && <path key={s.k} d={s.d} fill={s.color} />)}
              </svg>
              <ul className="ps-leg">
                {segs.map((s) => (
                  <li key={s.k}>
                    <i style={{ background: s.color }} />
                    <div>
                      <b>
                        {s.n} {s.label}
                      </b>
                      <em>{s.pct}% 차지</em>
                    </div>
                  </li>
                ))}
                <li className="ps-tot">
                  <i style={{ background: 'transparent' }} />
                  <div>
                    <b>플랜 {plans.length}건</b>
                    <em>시험 항목 {t.total}건</em>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="ps-none">
            거른 결과에 시험 항목이 없습니다 — 플랜에 항목을 담으면 여기에 셈이 뜹니다.
          </div>
        ))}
    </section>
  )
}
