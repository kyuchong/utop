import { useMemo, useState } from 'react'
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
    return all.filter(
      (r) =>
        (only === null || r.verdict === only) &&
        (!sev || r.severity === sev) &&
        (!kind || r.kind === kind) &&
        (!cyc || r.cycle_id === cyc) &&
        (!n ||
          r.tcid.toLowerCase().includes(n) ||
          r.name.toLowerCase().includes(n) ||
          r.req_id.toLowerCase().includes(n)),
    )
  }, [all, only, sev, kind, cyc, q])

  /** 도넛·카드는 **결과 거르개만 빼고** 센다 — 안 그러면 고른 조각만 남아 원이 없어진다 */
  const base = useMemo(() => {
    const n = q.trim().toLowerCase()
    return all.filter(
      (r) =>
        (!sev || r.severity === sev) &&
        (!kind || r.kind === kind) &&
        (!cyc || r.cycle_id === cyc) &&
        (!n ||
          r.tcid.toLowerCase().includes(n) ||
          r.name.toLowerCase().includes(n) ||
          r.req_id.toLowerCase().includes(n)),
    )
  }, [all, sev, kind, cyc, q])

  const cnt = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of base) m[r.verdict] = (m[r.verdict] ?? 0) + 1
    return m
  }, [base])

  const total = base.length || 1
  const done = (cnt['Pass'] ?? 0) + (cnt['Fail'] ?? 0)
  const pct = Math.round((done / total) * 100)

  /** 버전(사이클)별 합격·불합격 — 어느 버전이 무너졌는지 */
  const byCycle = useMemo(() => {
    const m = new Map<string, { name: string; id: string; pass: number; fail: number; rest: number }>()
    for (const r of base) {
      const cur = m.get(r.cycle_id) ?? { name: r.cycle, id: r.cycle_id, pass: 0, fail: 0, rest: 0 }
      if (r.verdict === 'Pass') cur.pass++
      else if (r.verdict === 'Fail') cur.fail++
      else cur.rest++
      m.set(r.cycle_id, cur)
    }
    return [...m.values()].sort((a, b) => b.fail - a.fail || b.pass - a.pass).slice(0, 14)
  }, [base])
  const maxBar = Math.max(1, ...byCycle.map((x) => x.pass + x.fail + x.rest))

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
            <select value={sev} onChange={(e) => setSev(e.target.value)}>
              <option value="">심각도 전체</option>
              {sevs.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">타입 전체</option>
              <option value="auto">Auto</option>
              <option value="manual">Manual</option>
              <option value="mixed">섞임</option>
            </select>
            <select value={cyc} onChange={(e) => setCyc(e.target.value)}>
              <option value="">사이클 전체</option>
              {cycles.map(([id, nm]) => (
                <option key={id} value={id}>
                  {nm}
                </option>
              ))}
            </select>
            <input
              className="rp-q"
              value={q}
              placeholder="TC ID · 이름 · 요구사항으로 찾기"
              onChange={(e) => setQ(e.target.value)}
            />
            <span className="sp" />
            <button
              className="btn small"
              type="button"
              onClick={() => {
                setOnly(null)
                setSev('')
                setKind('')
                setCyc('')
                setQ('')
              }}
            >
              거르개 초기화
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
                <b>{cnt[v.k] ?? 0}</b>
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
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="panel rp-chart">
              <b className="rp-ct">
                버전별 합격 · 불합격 <span className="muted small">({byCycle.length}개)</span>
              </b>
              <div className="rp-bars">
                {byCycle.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`rp-bar${cyc === c.id ? ' on' : ''}`}
                    title={`${c.name} — 합격 ${c.pass} · 불합격 ${c.fail} · 예정 ${c.rest}`}
                    onClick={() => setCyc(cyc === c.id ? '' : c.id)}
                  >
                    <span className="rp-bnm">{c.name}</span>
                    <span className="rp-btrack">
                      <span
                        className="rp-bseg"
                        style={{ width: `${(c.pass / maxBar) * 100}%`, background: '#16a34a' }}
                      />
                      <span
                        className="rp-bseg"
                        style={{ width: `${(c.fail / maxBar) * 100}%`, background: '#dc2626' }}
                      />
                      <span
                        className="rp-bseg"
                        style={{ width: `${(c.rest / maxBar) * 100}%`, background: '#d4d4d8' }}
                      />
                    </span>
                    <span className="rp-bn">{c.pass + c.fail + c.rest}</span>
                  </button>
                ))}
                {byCycle.length === 0 && <div className="empty">해당하는 것이 없습니다.</div>}
              </div>
            </div>
          </div>

          <div className="panel rp-table">
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
              rows.slice(0, 500).map((r, i) => {
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
            {rows.length > 500 && (
              <div className="muted small rp-more">
                500건까지만 그립니다 — 거르개로 좁히세요 (해당 {rows.length}건)
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
