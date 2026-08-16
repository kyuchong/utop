import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { goto } from '@/api/goto'
import './Dashboard.css'

/**
 * 대시보드 — 열면 바로 보이는 관제판.
 *
 * 리포트의 위젯화다(Zephyr 가젯 문법): 같은 집계를 Reports 는 골라서
 * 문서로 만들고, 여기는 「지금」 을 위젯으로 깐다. 모든 위젯은 눌러서
 * 그 화면으로 파고든다. 실데이터가 없는 것(장비 라이브 상태·ETA)은
 * 흉내 내지 않는다 — 실행이 쌓일수록 스스로 채워진다.
 */
interface DashData {
  devices: { total: number; groups: Record<string, number> }
  meters: { total: number }
  defects: { open: number; week_new: number }
  today: { runs: number; ok: number }
  yday_runs: number
  daily: Array<{ date: string; runs: number; ok: number; bad: number }>
  versions: Array<{
    id: string
    cid: string
    version: string
    name: string
    total: number
    ok: number
    bad: number
    done: number
  }>
  running: { key?: string; name?: string; done?: number; total?: number; user?: string } | null
  assets: { reqs: number; tcs: number; cycles: number }
  automation: { auto: number; manual: number }
  overall: Record<string, number>
  attention: Array<{
    tcid: string
    name: string
    label: string
    cycle_id: string
    version: string
    at: string
  }>
  coverage: { total: number; covered: number }
  tcexec: { total: number; executed: number; passed: number; failed: number }
  top_fail: Array<{ tcid: string; name: string; fails: number; runs: number }>
  recent_defects: Array<{
    id: string
    title: string
    severity: string
    status: string
    created_at: string
    cycle_id: string
    tcid: string
  }>
}

/** 위젯 목록 — ⚙ 로 보이기/숨기기 (표 열 설정과 같은 문법) */
const WIDGETS: Array<{ k: string; label: string }> = [
  { k: 'kpi', label: '상단 지표 (오늘·Pass·Fail…)' },
  { k: 'devices', label: '등록 장비' },
  { k: 'meters', label: 'Traffic Gen' },
  { k: 'assets', label: '자산 현황 (REQ·TC·사이클)' },
  { k: 'defects', label: '열린 결함' },
  { k: 'attention', label: 'Attention Required' },
  { k: 'running', label: '실행 중 Test Run' },
  { k: 'daily', label: '실행 결과 추이' },
  { k: 'versions', label: '버전별 합격률' },
  { k: 'donuts', label: '커버리지 · 실행 현황 · 자동화' },
  { k: 'topfail', label: '자주 발생하는 결함' },
  { k: 'rdefects', label: '최근 결함' },
]

/** 단일 값 도넛 — 라이브러리 없이 (원 둘레 자르기) */
function Donut({ pct, color }: { pct: number; color: string }) {
  const R = 34
  const C = 2 * Math.PI * R
  return (
    <svg viewBox="0 0 90 90" className="dash-donut" aria-hidden="true">
      <circle cx="45" cy="45" r={R} fill="none" stroke="var(--c-surface-alt)" strokeWidth="11" />
      <circle
        cx="45"
        cy="45"
        r={R}
        fill="none"
        stroke={color}
        strokeWidth="11"
        strokeLinecap="round"
        strokeDasharray={`${(Math.min(100, Math.max(0, pct)) / 100) * C} ${C}`}
        transform="rotate(-90 45 45)"
      />
      <text x="45" y="50" textAnchor="middle" className="dash-donut-t">
        {Math.round(pct)}%
      </text>
    </svg>
  )
}

export default function Dashboard({ onNav }: { onNav: (k: string) => void }) {
  const q = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const r = await apiFetch('/api/dashboard')
      if (!r.ok) throw new Error('대시보드를 불러오지 못했습니다')
      return (await r.json()) as DashData
    },
    // 관제판은 스스로 신선해야 한다 — 30초마다, 창에 돌아와도
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })
  const d = q.data

  const [ws, setWs] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('utop.dash.widgets2')
      if (raw) return new Set(JSON.parse(raw) as string[])
    } catch {
      /* 깨진 저장값이면 기본(전부) */
    }
    return new Set(WIDGETS.map((w) => w.k))
  })
  const toggleW = (k: string) =>
    setWs((cur) => {
      const n = new Set(cur)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      localStorage.setItem('utop.dash.widgets2', JSON.stringify([...n]))
      return n
    })
  const [gearAt, setGearAt] = useState<{ x: number; y: number } | null>(null)

  const pctOf = (ok: number, total: number) => (total ? Math.round((ok / total) * 100) : 0)
  const maxRuns = Math.max(1, ...(d?.daily ?? []).map((x) => x.runs))
  const ovAll = Object.values(d?.overall ?? {}).reduce((a, b) => a + b, 0)
  const ov = (k: string) => d?.overall?.[k] ?? 0
  const autoTotal = (d?.automation.auto ?? 0) + (d?.automation.manual ?? 0)
  const todayDelta =
    d && d.yday_runs > 0 ? Math.round(((d.today.runs - d.yday_runs) / d.yday_runs) * 100) : null

  return (
    <div className="dash scroll">
      <div className="dash-head">
        <b>Dashboard</b>
        <span className="muted small">30초마다 새로 고침</span>
        <span className="sp" />
        <button
          type="button"
          className="cyt-gear cyt-gear-tb"
          title="위젯 보이기/숨기기"
          onClick={(e) => {
            const r2 = e.currentTarget.getBoundingClientRect()
            setGearAt((cur) => (cur ? null : { x: r2.right, y: r2.bottom + 4 }))
          }}
        >
          ⚙
        </button>
        {gearAt && (
          <>
            <span className="cyt-gearovl" onClick={() => setGearAt(null)} />
            <div
              className="tc-menu tc-colpop dash-gearpop"
              role="menu"
              style={{
                position: 'fixed',
                left: Math.max(8, gearAt.x - 190),
                top: gearAt.y,
                right: 'auto',
              }}
            >
              {WIDGETS.map((w) => (
                <label key={w.k}>
                  <input type="checkbox" checked={ws.has(w.k)} onChange={() => toggleW(w.k)} />
                  {w.label}
                </label>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 상단 지표 줄 — 오늘·실행 중·Pass·Fail·Blocked·자동화율 */}
      {ws.has('kpi') && (
        <div className="dash-cards">
          <button type="button" className="dash-card" onClick={() => onNav('cycles')}>
            <i>오늘 실행</i>
            <b>
              {d ? d.today.runs : '–'}건
              {todayDelta !== null && (
                <em className={`dash-delta${todayDelta >= 0 ? ' up' : ' dn'}`}>
                  {todayDelta >= 0 ? '▲' : '▼'} {Math.abs(todayDelta)}%
                </em>
              )}
            </b>
            <em>어제 {d ? d.yday_runs : '–'}건</em>
          </button>
          <button
            type="button"
            className="dash-card"
            onClick={() => d?.running?.key && goto('cycle', String(d.running.key))}
          >
            <i>실행 중</i>
            {d?.running ? (
              <>
                <b className="run">
                  {d.running.done ?? 0}/{d.running.total ?? 0}
                </b>
                <em>{d.running.name || ''}</em>
              </>
            ) : (
              <>
                <b>–</b>
                <em>도는 실행 없음</em>
              </>
            )}
          </button>
          <button type="button" className="dash-card" onClick={() => onNav('executions')}>
            <i>Pass</i>
            <b className="ok">
              {ov('Pass')}
              <em className="dash-pct">{pctOf(ov('Pass'), ovAll)}%</em>
            </b>
            <span className="dash-mini">
              <b style={{ width: `${pctOf(ov('Pass'), ovAll)}%`, background: '#1D9E75' }} />
            </span>
          </button>
          <button type="button" className="dash-card" onClick={() => onNav('executions')}>
            <i>Fail</i>
            <b className="bad">
              {ov('Fail')}
              <em className="dash-pct">{pctOf(ov('Fail'), ovAll)}%</em>
            </b>
            <span className="dash-mini">
              <b style={{ width: `${pctOf(ov('Fail'), ovAll)}%`, background: '#E24B4A' }} />
            </span>
          </button>
          <button type="button" className="dash-card" onClick={() => onNav('executions')}>
            <i>Blocked</i>
            <b className="wn">
              {ov('Blocked')}
              <em className="dash-pct">{pctOf(ov('Blocked'), ovAll)}%</em>
            </b>
            <span className="dash-mini">
              <b style={{ width: `${pctOf(ov('Blocked'), ovAll)}%`, background: '#EF9F27' }} />
            </span>
          </button>
          <button type="button" className="dash-card" onClick={() => onNav('testcases')}>
            <i>자동화율</i>
            <b>{autoTotal ? `${pctOf(d?.automation.auto ?? 0, autoTotal)}%` : '–'}</b>
            <em>{d ? `자동 ${d.automation.auto} / 전체 ${autoTotal}` : ''}</em>
          </button>
        </div>
      )}

      {/* 자산·환경 카드 줄 */}
      <div className="dash-cards">
        {ws.has('devices') && (
          <button type="button" className="dash-card" onClick={() => onNav('devices')}>
            <i>등록 장비</i>
            <b>{d ? d.devices.total : '–'}대</b>
            <em>
              {d
                ? Object.entries(d.devices.groups)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3)
                    .map(([g, n]) => `${g} ${n}`)
                    .join(' · ') || '없음'
                : ''}
            </em>
          </button>
        )}
        {ws.has('meters') && (
          <button type="button" className="dash-card" onClick={() => onNav('instruments')}>
            <i>Traffic Gen</i>
            <b>{d ? d.meters.total : '–'}대</b>
            <em>계측기 역할 장비</em>
          </button>
        )}
        {ws.has('assets') && (
          <button
            type="button"
            className="dash-card dash-card3"
            onClick={() => onNav('requirements')}
          >
            <i>시험 자산</i>
            <span className="dash-tri">
              <span>
                <b>{d ? d.assets.reqs : '–'}</b>
                <i>요구사항</i>
              </span>
              <span>
                <b>{d ? d.assets.tcs : '–'}</b>
                <i>시험항목</i>
              </span>
              <span>
                <b>{d ? d.assets.cycles : '–'}</b>
                <i>사이클</i>
              </span>
            </span>
          </button>
        )}
        {ws.has('defects') && (
          <button type="button" className="dash-card" onClick={() => onNav('defects')}>
            <i>열린 결함</i>
            <b className={d && d.defects.open ? 'bad' : ''}>{d ? d.defects.open : '–'}건</b>
            <em>{d && d.defects.week_new ? `이번 주 +${d.defects.week_new}` : '이번 주 새것 없음'}</em>
          </button>
        )}
      </div>

      <div className="dash-two">
        {/* Attention Required — 손 가야 하는 것들 */}
        {ws.has('attention') && (
          <div className="dash-wide">
            <div className="dash-wt">
              ⚠ Attention Required
              {d && d.attention.length > 0 && <s className="dash-attn-n">{d.attention.length}건</s>}
            </div>
            <div className="dash-defs">
              {(d?.attention ?? []).slice(0, 5).map((x, i) => (
                <button
                  key={`${x.cycle_id}-${x.tcid}-${i}`}
                  type="button"
                  className="dash-def"
                  title={`${x.version} — 누르면 그 실행 화면으로`}
                  onClick={() => x.cycle_id && goto('cycle', x.cycle_id)}
                >
                  <s
                    className={`lb-${x.label === 'Fail' ? 'fail' : x.label === 'Blocked' ? 'blk' : 'na'}`}
                  >
                    {x.label}
                  </s>
                  <span className="dash-def-t" title={`${x.tcid} ${x.name}`}>
                    {x.name || x.tcid}
                    <i className="dash-def-sub">{x.version}</i>
                  </span>
                  <em>{x.at ? x.at.slice(5, 16) : ''}</em>
                </button>
              ))}
              {d && d.attention.length === 0 && (
                <div className="empty">손 갈 것이 없습니다 — 좋은 신호입니다.</div>
              )}
            </div>
          </div>
        )}

        {/* 실행 중 Test Run — 큰 카드 */}
        {ws.has('running') && (
          <div className="dash-wide">
            <div className="dash-wt">현재 실행 중인 Test Run</div>
            {d?.running ? (
              <div className="dash-runbig">
                <div className="dash-runbig-h">
                  <b>{d.running.name || '…'}</b>
                  <s>RUNNING</s>
                  <span className="sp" />
                  <em>
                    {d.running.done ?? 0}/{d.running.total ?? 0} ·{' '}
                    {pctOf(d.running.done ?? 0, d.running.total ?? 0)}%
                  </em>
                </div>
                <span className="dash-run-bar">
                  <b
                    style={{
                      width: `${d.running.total ? ((d.running.done ?? 0) / d.running.total) * 100 : 0}%`,
                    }}
                  />
                </span>
                <div className="dash-runbig-f">
                  <em>{d.running.user ? `실행: ${d.running.user}` : ''}</em>
                  <span className="sp" />
                  <button
                    type="button"
                    className="btn small primary"
                    onClick={() => d.running?.key && goto('cycle', String(d.running.key))}
                  >
                    실행 화면 열기
                  </button>
                </div>
              </div>
            ) : (
              <div className="empty">지금 도는 자동 실행이 없습니다.</div>
            )}
          </div>
        )}
      </div>

      <div className="dash-two">
        {/* 실행 결과 추이 — Pass 초록 · Fail 빨강 선, 실행량은 옅은 영역 */}
        {ws.has('daily') && (
          <div className="dash-wide">
            <div className="dash-wt">
              실행 결과 추이 (14일 — 영역: 실행량, 초록: Pass, 빨강: Fail)
            </div>
            {(() => {
              const days2 = d?.daily ?? []
              if (!days2.length) return <div className="empty">자료가 없습니다.</div>
              const W = 560
              const H = 96
              const n = days2.length
              const px = (i: number) => (n > 1 ? (i / (n - 1)) * W : 0)
              const py = (v: number) => H - 6 - (v / maxRuns) * (H - 14)
              const line = (pick: (x2: { runs: number; ok: number; bad: number }) => number) =>
                days2
                  .map((x2, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)},${py(pick(x2)).toFixed(1)}`)
                  .join(' ')
              const runsLine = line((x2) => x2.runs)
              const okLine = line((x2) => x2.ok)
              const badLine = line((x2) => x2.bad)
              const area = `${runsLine} L${W},${H} L0,${H} Z`
              return (
                <div className="dash-trend">
                  <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
                    <path d={area} fill="#E6F1FB" stroke="none" />
                    <path
                      d={runsLine}
                      fill="none"
                      stroke="#85B7EB"
                      strokeWidth="1.5"
                      vectorEffect="non-scaling-stroke"
                    />
                    <path
                      d={okLine}
                      fill="none"
                      stroke="#1D9E75"
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                    />
                    <path
                      d={badLine}
                      fill="none"
                      stroke="#E24B4A"
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                    />
                    {days2.map((x2, i) => (
                      <rect
                        key={x2.date}
                        x={px(i) - W / n / 2}
                        y={0}
                        width={W / n}
                        height={H}
                        fill="transparent"
                      >
                        <title>{`${x2.date} — 실행 ${x2.runs} · Pass ${x2.ok} · Fail ${x2.bad}`}</title>
                      </rect>
                    ))}
                  </svg>
                  <div className="dash-trend-x">
                    {days2.map((x2) => (
                      <i key={x2.date}>{x2.date.slice(8)}</i>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* 버전별 합격률 — 누르면 그 사이클 실행 화면 */}
        {ws.has('versions') && (
          <div className="dash-wide">
            <div className="dash-wt">버전별 합격률 (최근 회차 — 누르면 실행 화면)</div>
            <div className="dash-vers">
              {(d?.versions ?? []).slice(0, 5).map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className="dash-ver"
                  title={`${v.name || ''} — 항목 ${v.total} · Pass ${v.ok} · Fail ${v.bad}`}
                  onClick={() => goto('cycle', v.id)}
                >
                  <i>{v.version || v.cid || v.id}</i>
                  <span className="dash-ver-bar">
                    <b style={{ flexGrow: v.ok, background: '#1D9E75' }} />
                    <b style={{ flexGrow: v.bad, background: '#E24B4A' }} />
                    <b
                      style={{
                        flexGrow: Math.max(v.done - v.ok - v.bad, 0),
                        background: '#EF9F27',
                      }}
                    />
                    <b style={{ flexGrow: Math.max(v.total - v.done, 0), background: '#d5dae2' }} />
                  </span>
                  <em>{pctOf(v.ok, v.total)}%</em>
                </button>
              ))}
              {d && d.versions.length === 0 && <div className="empty">아직 사이클이 없습니다.</div>}
            </div>
          </div>
        )}
      </div>

      {/* 도넛 셋 — 요구사항 커버리지 · TC 실행 현황 · 자동화 */}
      {ws.has('donuts') && (
        <div className="dash-donuts">
          <button type="button" className="dash-wide dash-dn" onClick={() => onNav('requirements')}>
            <Donut pct={d ? pctOf(d.coverage.covered, d.coverage.total) : 0} color="#378ADD" />
            <span className="dash-dn-t">
              <i>요구사항 커버리지</i>
              <em>전체 {d?.coverage.total ?? '–'}</em>
              <em>TC 연결됨 {d?.coverage.covered ?? '–'}</em>
              <em>미연결 {d ? d.coverage.total - d.coverage.covered : '–'}</em>
            </span>
          </button>
          <button type="button" className="dash-wide dash-dn" onClick={() => onNav('testcases')}>
            <Donut pct={d ? pctOf(d.tcexec.executed, d.tcexec.total) : 0} color="#7F77DD" />
            <span className="dash-dn-t">
              <i>TC 실행 현황 (최근 결과)</i>
              <em>전체 TC {d?.tcexec.total ?? '–'}</em>
              <em>
                실행됨 {d?.tcexec.executed ?? '–'} · Pass {d?.tcexec.passed ?? '–'}
              </em>
              <em>
                Fail {d?.tcexec.failed ?? '–'} · 미실행{' '}
                {d ? d.tcexec.total - d.tcexec.executed : '–'}
              </em>
            </span>
          </button>
          <button type="button" className="dash-wide dash-dn" onClick={() => onNav('testcases')}>
            <Donut
              pct={autoTotal ? pctOf(d?.automation.auto ?? 0, autoTotal) : 0}
              color="#1D9E75"
            />
            <span className="dash-dn-t">
              <i>자동화 현황</i>
              <em>자동 {d?.automation.auto ?? '–'}</em>
              <em>수동 {d?.automation.manual ?? '–'}</em>
              <em>전체 {autoTotal || '–'}</em>
            </span>
          </button>
        </div>
      )}

      <div className="dash-two">
        {ws.has('topfail') && (
          <div className="dash-wide">
            <div className="dash-wt">
              자주 발생하는 결함 (전체 회차 Fail 수 — 누르면 그 시험으로)
            </div>
            <div className="dash-vers">
              {(d?.top_fail ?? []).map((t2) => (
                <button
                  key={t2.tcid}
                  type="button"
                  className="dash-ver"
                  title={`${t2.tcid} — ${t2.runs}회 중 ${t2.fails}회 Fail`}
                  onClick={() => goto('tc', t2.tcid)}
                >
                  <i>{t2.name || t2.tcid}</i>
                  <span className="dash-ver-bar">
                    <b style={{ flexGrow: t2.fails, background: '#E24B4A' }} />
                    <b style={{ flexGrow: Math.max(t2.runs - t2.fails, 0), background: '#d5dae2' }} />
                  </span>
                  <em className="bad">{t2.fails}회</em>
                </button>
              ))}
              {d && d.top_fail.length === 0 && (
                <div className="empty">발생한 결함이 없습니다 — 좋은 신호입니다.</div>
              )}
            </div>
          </div>
        )}
        {ws.has('rdefects') && (
          <div className="dash-wide">
            <div className="dash-wt">최근 결함 (열린 것 — 누르면 Defects)</div>
            <div className="dash-defs">
              {(d?.recent_defects ?? []).slice(0, 5).map((x) => (
                <button
                  key={x.id}
                  type="button"
                  className="dash-def"
                  onClick={() => onNav('defects')}
                >
                  <s className={`sv-${(x.severity || '').toLowerCase()}`}>{x.severity || '—'}</s>
                  <span className="dash-def-t" title={x.title}>
                    {x.title || x.id}
                  </span>
                  <em>{x.created_at.slice(5, 10)}</em>
                </button>
              ))}
              {d && d.recent_defects.length === 0 && (
                <div className="empty">열린 결함이 없습니다.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
