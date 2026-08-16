import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { goto } from '@/api/goto'
import Executions from '@/pages/Executions'
import './Reports.css'

interface Row {
  cycle_id: string
  cycle: string
  model: string
  version: string
  version_group: string
  customer: string
  cycle_status: string
  tcid: string
  name: string
  req_id: string
  severity: string
  assignee: string
  executed_at: string
  auto: boolean
  kind: string
  verdict: string
  steps: number
  fail_steps: number
}

/** 색과 이름을 한 곳에서 — 도넛·막대·표가 같은 말을 써야 한다 */
const V = [
  { k: 'Pass', label: '합격', color: '#16a34a' },
  { k: 'Fail', label: '불합격', color: '#dc2626' },
  { k: '', label: '예정', color: '#d4d4d8' },
  { k: '진행불가', label: '제외', color: '#c2903a' },
] as const

/** 도넛 한 조각 — 라이브러리 없이 그린다(외부 스크립트를 못 쓴다) */
function arc(cx: number, cy: number, r: number, from: number, to: number): string {
  const p = (a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)]
  const [x1, y1] = p(from)
  const [x2, y2] = p(to)
  return `M ${x1} ${y1} A ${r} ${r} 0 ${to - from > Math.PI ? 1 : 0} 1 ${x2} ${y2}`
}

/**
 * Reports — 지금 어디까지 왔나.
 *
 * 사이클 화면은 **한 사이클**을 붙들고 보는 자리다. 그런데 「E5724RL 이
 * 지금 몇 % 왔나」 · 「어느 버전이 제일 많이 깨졌나」 는 사이클을 하나씩
 * 열어서는 못 답한다.
 *
 * 여기는 **전부를 한 장에** 놓고 거른다. 숫자 · 그림 · 목록이 같은
 * 거르개를 본다 — 도넛의 빨간 조각을 누르면 아래 목록도 불합격만 남는다.
 *
 * 실행 이력(언제 누가 돌렸나)은 옆 탭이다. 같은 화면인데 묻는 것이
 * 다르다 — 여기는 「무엇이 어떤가」, 저기는 「무슨 일이 있었나」.
 */
export default function Reports() {
  const [tab, setTab] = useState<'sum' | 'runs'>('sum')
  const [only, setOnly] = useState<string | null>(null)
  const [sev, setSev] = useState('')
  const [kind, setKind] = useState('')
  const [cyc, setCyc] = useState('')
  const [q, setQ] = useState('')
  /** 기간 — 실행일 기준. 0 = 전체 */
  const [days, setDays] = useState(0)
  /** 축 분석 — 사이클 INFO 필드가 곧 축이다 (조사 결론: 축 교체가 리포트 엔진) */
  const [axis, setAxis] = useState<'cycle' | 'version_group' | 'model' | 'customer' | 'severity' | 'assignee' | 'cycle_status'>('cycle')
  const [axf, setAxf] = useState<{ axis: string; val: string } | null>(null)
  /** 결과 상세 페이지 — 500건 자르기 대신 (참고안) */
  const [psz, setPsz] = useState(20)
  const [pg, setPg] = useState(1)
  /** 깔때기 필터 — 드롭다운 줄 대신 (실행 화면과 같은 문법) */
  const [filtAt, setFiltAt] = useState<{ x: number; y: number } | null>(null)

  const sumQ = useQuery({
    queryKey: ['report', 'summary'],
    queryFn: async () => {
      const r = await apiFetch('/api/report/summary')
      if (!r.ok) throw new Error('집계를 불러오지 못했습니다')
      return (await r.json()) as { rows: Row[] }
    },
    enabled: tab === 'sum',
  })

  const all = useMemo(() => sumQ.data?.rows ?? [], [sumQ.data])

  /** 거르개를 지난 것 — 숫자·그림·목록이 모두 이것을 본다 */
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase()
    const cut = days ? new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10) : ''
    return all.filter(
      (r) =>
        (only === null || r.verdict === only) &&
        (!sev || r.severity === sev) &&
        (!kind || r.kind === kind) &&
        (!cyc || r.cycle_id === cyc) &&
        (!cut || (r.executed_at || '').slice(0, 10) >= cut) &&
        (!axf || String((r as unknown as Record<string, unknown>)[axf.axis] ?? '') === axf.val) &&
        (!n ||
          r.tcid.toLowerCase().includes(n) ||
          r.name.toLowerCase().includes(n) ||
          r.req_id.toLowerCase().includes(n)),
    )
  }, [all, only, sev, kind, cyc, q, days, axf])

  /** 도넛·카드는 **결과 거르개만 빼고** 센다 — 안 그러면 고른 조각만 남아 원이 없어진다 */
  const base = useMemo(() => {
    const n = q.trim().toLowerCase()
    const cut = days ? new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10) : ''
    return all.filter(
      (r) =>
        (!sev || r.severity === sev) &&
        (!kind || r.kind === kind) &&
        (!cyc || r.cycle_id === cyc) &&
        (!cut || (r.executed_at || '').slice(0, 10) >= cut) &&
        (!n ||
          r.tcid.toLowerCase().includes(n) ||
          r.name.toLowerCase().includes(n) ||
          r.req_id.toLowerCase().includes(n)),
    )
  }, [all, sev, kind, cyc, q, days])

  const cnt = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of base) m[r.verdict] = (m[r.verdict] ?? 0) + 1
    return m
  }, [base])

  const total = base.length || 1
  const done = (cnt['Pass'] ?? 0) + (cnt['Fail'] ?? 0)
  const pct = Math.round((done / total) * 100)

  /** 축별 합격·불합격 — 축(INFO 필드)을 갈아 끼우면 리포트가 바뀐다 */
  const AXES: Array<{ k: typeof axis; label: string }> = [
    { k: 'cycle', label: '사이클(버전)' },
    { k: 'version_group', label: '버전그룹' },
    { k: 'model', label: '모델' },
    { k: 'customer', label: '고객' },
    { k: 'severity', label: '심각도' },
    { k: 'assignee', label: '담당자' },
    { k: 'cycle_status', label: '사이클 상태' },
  ]
  const byCycle = useMemo(() => {
    const m = new Map<string, { name: string; id: string; pass: number; fail: number; rest: number }>()
    for (const r of base) {
      const key =
        axis === 'cycle'
          ? r.cycle_id
          : String((r as unknown as Record<string, unknown>)[axis] ?? '') || '(없음)'
      const label = axis === 'cycle' ? r.cycle : key
      const cur = m.get(key) ?? { name: label, id: key, pass: 0, fail: 0, rest: 0 }
      if (r.verdict === 'Pass') cur.pass++
      else if (r.verdict === 'Fail') cur.fail++
      else cur.rest++
      m.set(key, cur)
    }
    return [...m.values()].sort((a, b) => b.fail - a.fail || b.pass - a.pass).slice(0, 14)
  }, [base, axis])

  useEffect(() => {
    setPg(1)
  }, [only, sev, kind, cyc, q, days, axf, psz])

  /** 거른 것을 CSV 로 — 원자료 내보내기(조사: 표 리포트는 Excel 이 실무 표준) */
  const exportCsv = () => {
    if (!rows.length) return
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [
      ['결과', 'TC ID', '시험항목', '심각도', '요구사항', '사이클', '버전', '버전그룹', '고객', '담당자', '실행일']
        .map(esc)
        .join(','),
      ...rows.map((r) =>
        [
          r.verdict || '미실행', r.tcid, r.name, r.severity, r.req_id, r.cycle,
          r.version, r.version_group, r.customer, r.assignee, r.executed_at,
        ]
          .map(esc)
          .join(','),
      ),
    ].join('\r\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `리포트_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const sevs = useMemo(
    () => [...new Set(all.map((r) => r.severity).filter(Boolean))].sort(),
    [all],
  )
  const cycles = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of all) m.set(r.cycle_id, r.cycle)
    return [...m.entries()]
  }, [all])

  // 도넛 각도
  let a0 = -Math.PI / 2
  const slices = V.map((v) => {
    const n = cnt[v.k] ?? 0
    const a1 = a0 + (n / total) * Math.PI * 2
    const s = { ...v, n, from: a0, to: a1 }
    a0 = a1
    return s
  })

  return (
    <div className="rp">
      <div className="rp-tabs seg" role="tablist">
        <button
          type="button"
          role="tab"
          className={`seg-btn${tab === 'sum' ? ' on' : ''}`}
          onClick={() => setTab('sum')}
        >
          집계
        </button>
        <button
          type="button"
          role="tab"
          className={`seg-btn${tab === 'runs' ? ' on' : ''}`}
          onClick={() => setTab('runs')}
        >
          실행 이력
        </button>
      </div>

      {tab === 'runs' ? (
        <Executions />
      ) : (
        <div className="rp-body">
          <div className="rp-filters">
            <input
              className="rp-q"
              value={q}
              placeholder="TC ID · 이름 · 요구사항으로 찾기"
              onChange={(e) => setQ(e.target.value)}
            />
            {(() => {
              const fCnt = (sev ? 1 : 0) + (kind ? 1 : 0) + (cyc ? 1 : 0) + (days ? 1 : 0) + (axf ? 1 : 0)
              return (
                <button
                  className={`btn small cxp-funnel${fCnt ? ' cxp-fon' : ''}`}
                  type="button"
                  title="필터 — 기간 · 심각도 · 타입 · 사이클"
                  onClick={(e) => {
                    const r2 = e.currentTarget.getBoundingClientRect()
                    setFiltAt((v2) => (v2 ? null : { x: r2.left, y: r2.bottom + 4 }))
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M3 5h18l-7 8v5l-4 2v-7L3 5z"
                      fill={fCnt ? 'currentColor' : 'none'}
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinejoin="round"
                    />
                  </svg>
                  {fCnt > 0 && <em className="cxp-fbadge">{fCnt}</em>}
                </button>
              )
            })()}
            {filtAt && (
              <>
                <span className="cyt-gearovl" onClick={() => setFiltAt(null)} />
                <div
                  className="cy-hmenu-pop cxp-sidepop rp-fpop"
                  role="menu"
                  style={{
                    position: 'fixed',
                    left: Math.max(8, Math.min(filtAt.x, window.innerWidth - 280)),
                    top: filtAt.y,
                    right: 'auto',
                    zIndex: 60,
                  }}
                >
                  <div className="rp-fsec">기간 (실행일)</div>
                  <div className="cxp-flist">
                    {[
                      { v: 0, l: '전체' },
                      { v: 7, l: '최근 7일' },
                      { v: 30, l: '최근 30일' },
                      { v: 90, l: '최근 90일' },
                    ].map((o) => (
                      <button key={o.v} type="button" className={days === o.v ? 'on' : ''} onClick={() => setDays(o.v)}>
                        <s className="d all" />
                        {o.l}
                      </button>
                    ))}
                  </div>
                  <div className="rp-fsec">심각도</div>
                  <div className="cxp-flist">
                    <button type="button" className={sev === '' ? 'on' : ''} onClick={() => setSev('')}>
                      <s className="d all" />
                      전체
                    </button>
                    {sevs.map((s2) => (
                      <button key={s2} type="button" className={sev === s2 ? 'on' : ''} onClick={() => setSev(sev === s2 ? '' : s2)}>
                        <s className="d" style={{ background: '#EF9F27' }} />
                        {s2}
                      </button>
                    ))}
                  </div>
                  <div className="rp-fsec">타입</div>
                  <div className="cxp-flist">
                    {[
                      { v: '', l: '전체' },
                      { v: 'auto', l: 'Auto' },
                      { v: 'manual', l: 'Manual' },
                      { v: 'mixed', l: '섞임' },
                    ].map((o) => (
                      <button key={o.v} type="button" className={kind === o.v ? 'on' : ''} onClick={() => setKind(o.v)}>
                        <s className="d" style={{ background: o.v ? '#378ADD' : undefined }} />
                        {o.l}
                      </button>
                    ))}
                  </div>
                  <div className="rp-fsec">사이클</div>
                  <div className="cxp-flist rp-fcyc">
                    <button type="button" className={cyc === '' ? 'on' : ''} onClick={() => setCyc('')}>
                      <s className="d all" />
                      전체
                    </button>
                    {cycles.map(([id, nm]) => (
                      <button key={id} type="button" className={cyc === id ? 'on' : ''} onClick={() => setCyc(cyc === id ? '' : id)}>
                        <s className="d" style={{ background: '#7F77DD' }} />
                        {nm}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
            <span className="sp" />
            <button
              className="btn small"
              type="button"
              disabled={!rows.length}
              title="거른 결과를 원자료 그대로 CSV(Excel) 로 내려받습니다"
              onClick={exportCsv}
            >
              Excel
            </button>
            <button
              className="btn small"
              type="button"
              onClick={() => {
                setOnly(null)
                setSev('')
                setKind('')
                setCyc('')
                setQ('')
                setDays(0)
                setAxf(null)
              }}
            >
              초기화
            </button>
            <span className="muted small">대상 {rows.length}건</span>
          </div>

          {/* 숫자부터. 그림은 그다음이다 — 회의에서 먼저 읽히는 것이 숫자다 */}
          <div className="rp-cards">
            <div className="rp-card">
              <i>전체 TC</i>
              <b>{base.length}</b>
            </div>
            {V.map((v) => (
              <button
                key={v.k}
                type="button"
                className={`rp-card click${only === v.k ? ' on' : ''}`}
                style={{ color: v.color }}
                title={only === v.k ? '전부 보기' : `${v.label} 만 보기`}
                onClick={() => setOnly(only === v.k ? null : v.k)}
              >
                <i>{v.label}</i>
                <b>
                  {cnt[v.k] ?? 0}
                  <em className="rp-cpct">{Math.round(((cnt[v.k] ?? 0) / total) * 100)}%</em>
                </b>
              </button>
            ))}
            <div className="rp-card">
              <i>진행률</i>
              <b className="rp-pct">{pct}%</b>
            </div>
          </div>

          <div className="rp-charts">
            <div className="panel rp-chart">
              <b className="rp-ct">진행률</b>
              <div className="rp-donut">
                <svg viewBox="0 0 200 200" width="200" height="200">
                  {slices.map(
                    (s) =>
                      s.n > 0 && (
                        <path
                          key={s.k}
                          d={arc(100, 100, 70, s.from, s.to)}
                          stroke={s.color}
                          strokeWidth={30}
                          fill="none"
                          opacity={only === null || only === s.k ? 1 : 0.25}
                          style={{ cursor: 'pointer' }}
                          onClick={() => setOnly(only === s.k ? null : s.k)}
                        />
                      ),
                  )}
                  <text x="100" y="98" textAnchor="middle" className="rp-dn">
                    {pct}%
                  </text>
                  <text x="100" y="116" textAnchor="middle" className="rp-dl">
                    진행
                  </text>
                </svg>
                <div className="rp-leg">
                  {V.map((v) => (
                    <button
                      key={v.k}
                      type="button"
                      className={`rp-legi${only === v.k ? ' on' : ''}`}
                      onClick={() => setOnly(only === v.k ? null : v.k)}
                    >
                      <span className="rp-dot" style={{ background: v.color }} />
                      {v.label} <b>{cnt[v.k] ?? 0}</b>
                      <em className="rp-lpct">({Math.round(((cnt[v.k] ?? 0) / total) * 100)}%)</em>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="panel rp-chart">
              <b className="rp-ct">
                <select
                  className="rp-axis"
                  value={axis}
                  title="축 — 사이클 INFO 필드를 갈아 끼우면 리포트가 바뀝니다"
                  onChange={(e) => {
                    setAxis(e.target.value as typeof axis)
                    setAxf(null)
                    setCyc('')
                  }}
                >
                  {AXES.map((a) => (
                    <option key={a.k} value={a.k}>
                      {a.label}
                    </option>
                  ))}
                </select>
                별 합격 · 불합격 <span className="muted small">({byCycle.length}개)</span>
              </b>
              <div className="rp-vtbl">
                <div className="rp-vrow head">
                  <span>이름</span>
                  <span>합격 · 불합격 · 예정</span>
                  <span className="tr">총 TC</span>
                  <span className="tr">합격률</span>
                </div>
                {byCycle.map((c) => {
                  const tot = c.pass + c.fail + c.rest
                  const pr = Math.round((c.pass / Math.max(1, tot)) * 100)
                  const on = axis === 'cycle' ? cyc === c.id : axf?.val === c.id
                  const seg = (n2: number, color: string, label: string) =>
                    n2 > 0 && (
                      <span
                        className="rp-seg2"
                        style={{ flexGrow: n2, background: color }}
                        title={`${label} ${n2}건 (${Math.round((n2 / Math.max(1, tot)) * 100)}%)`}
                      >
                        {n2} ({Math.round((n2 / Math.max(1, tot)) * 100)}%)
                      </span>
                    )
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={`rp-vrow${on ? ' on' : ''}`}
                      title={`${c.name} — 누르면 아래 목록을 이것만으로`}
                      onClick={() => {
                        if (axis === 'cycle') setCyc(cyc === c.id ? '' : c.id)
                        else setAxf(axf?.val === c.id ? null : { axis, val: c.id === '(없음)' ? '' : c.id })
                      }}
                    >
                      <span className="rp-bnm">{c.name}</span>
                      <span className="rp-btrack2">
                        {seg(c.pass, '#16a34a', '합격')}
                        {seg(c.fail, '#dc2626', '불합격')}
                        {seg(c.rest, '#d4d4d8', '예정')}
                      </span>
                      <span className="tr">{tot}</span>
                      <span className={`tr rp-rate${pr >= 60 ? ' good' : ' warn'}`}>{pr}%</span>
                    </button>
                  )
                })}
                {byCycle.length === 0 && <div className="empty">해당하는 것이 없습니다.</div>}
              </div>
            </div>
          </div>

          <div className="panel rp-table">
            <div className="rp-tbar">
              <b>결과 상세</b>
              <span className="sp" />
              <span className="muted small">총 {rows.length}건</span>
              <select value={psz} onChange={(e) => setPsz(Number(e.target.value))}>
                <option value={20}>20개</option>
                <option value={50}>50개</option>
                <option value={100}>100개</option>
              </select>
            </div>
            <div className="rp-row head">
              <span>결과</span>
              <span>TC ID</span>
              <span>시험항목</span>
              <span>심각도</span>
              <span>요구사항</span>
              <span>사이클</span>
              <span>실행일</span>
            </div>
            {sumQ.isLoading ? (
              <div className="empty">불러오는 중…</div>
            ) : rows.length === 0 ? (
              <div className="empty">해당하는 것이 없습니다.</div>
            ) : (
              rows.slice((Math.min(pg, Math.max(1, Math.ceil(rows.length / psz))) - 1) * psz, Math.min(pg, Math.max(1, Math.ceil(rows.length / psz))) * psz).map((r, i) => {
                const v = V.find((x) => x.k === r.verdict) ?? V[2]
                return (
                  <div className="rp-row" key={`${r.cycle_id}-${r.tcid}-${i}`}>
                    <span className="rp-v" style={{ color: v.color }}>
                      {v.label}
                    </span>
                    <button
                      type="button"
                      className="rp-tcid"
                      title={`${r.tcid} — 누르면 이 시험으로 갑니다`}
                      onClick={() => r.tcid && goto('tc', r.tcid)}
                    >
                      {r.tcid || '–'}
                    </button>
                    <span className="rp-nm" title={r.name}>
                      {r.name}
                      {r.fail_steps > 0 && <i className="rp-bad">{r.fail_steps} 부적합</i>}
                    </span>
                    <span className="muted">{r.severity || '–'}</span>
                    <button
                      type="button"
                      className="rp-req"
                      onClick={() => r.req_id && goto('req', r.req_id)}
                    >
                      {r.req_id || '–'}
                    </button>
                    <button
                      type="button"
                      className="rp-cyc"
                      onClick={() => r.cycle_id && goto('cycle', r.cycle_id)}
                    >
                      {r.cycle}
                    </button>
                    <span className="muted small">
                      {r.executed_at ? r.executed_at.slice(5, 16) : '–'}
                    </span>
                  </div>
                )
              })
            )}
            {rows.length > psz && (() => {
              const pages = Math.max(1, Math.ceil(rows.length / psz))
              const cur = Math.min(pg, pages)
              const around = Array.from({ length: pages }, (_, i) => i + 1).filter(
                (n2) => n2 === 1 || n2 === pages || Math.abs(n2 - cur) <= 2,
              )
              return (
                <div className="rp-pager">
                  <button type="button" disabled={cur <= 1} onClick={() => setPg(cur - 1)}>
                    ‹
                  </button>
                  {around.map((n2, i2) => (
                    <span key={n2} className="rp-pgwrap">
                      {i2 > 0 && around[i2 - 1]! < n2 - 1 && <em>…</em>}
                      <button
                        type="button"
                        className={n2 === cur ? 'on' : ''}
                        onClick={() => setPg(n2)}
                      >
                        {n2}
                      </button>
                    </span>
                  ))}
                  <button type="button" disabled={cur >= pages} onClick={() => setPg(cur + 1)}>
                    ›
                  </button>
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
