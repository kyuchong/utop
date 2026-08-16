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
 * 그 화면으로 파고든다 — 정적 차트는 두지 않는다(조사 결론).
 */
interface DashData {
  devices: { total: number; groups: Record<string, number> }
  meters: { total: number }
  defects: { open: number; week_new: number }
  today: { runs: number; ok: number }
  daily: Array<{ date: string; runs: number; ok: number }>
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
}

/** 위젯 목록 — ⚙ 로 보이기/숨기기 (표 열 설정과 같은 문법) */
const WIDGETS: Array<{ k: string; label: string }> = [
  { k: 'devices', label: '등록 장비' },
  { k: 'meters', label: 'Traffic Gen' },
  { k: 'today', label: '오늘 실행' },
  { k: 'defects', label: '열린 결함' },
  { k: 'daily', label: '데일리 실행 추이' },
  { k: 'versions', label: '버전별 합격률' },
  { k: 'running', label: '진행 중 사이클' },
]

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
      const raw = localStorage.getItem('utop.dash.widgets')
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
      localStorage.setItem('utop.dash.widgets', JSON.stringify([...n]))
      return n
    })
  const [gearAt, setGearAt] = useState<{ x: number; y: number } | null>(null)

  const pctOf = (ok: number, total: number) => (total ? Math.round((ok / total) * 100) : 0)
  const maxRuns = Math.max(1, ...(d?.daily ?? []).map((x) => x.runs))

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
              style={{ position: 'fixed', left: Math.max(8, gearAt.x - 170), top: gearAt.y, right: 'auto' }}
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

      {/* 지표 카드 — 눌러서 그 화면으로 */}
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
        {ws.has('today') && (
          <button type="button" className="dash-card" onClick={() => onNav('cycles')}>
            <i>오늘 실행</i>
            <b>{d ? d.today.runs : '–'}건</b>
            <em>{d && d.today.runs ? `합격률 ${pctOf(d.today.ok, d.today.runs)}%` : '아직 실행 없음'}</em>
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

      {/* 진행 중 — 실행 화면의 진행 줄과 같은 문법 */}
      {ws.has('running') && d?.running && (
        <button
          type="button"
          className="dash-wide dash-run"
          onClick={() => d.running?.key && goto('cycle', String(d.running.key))}
        >
          <b>▶ 실행 중</b>
          <span className="dash-run-nm">{d.running.name || '…'}</span>
          <span className="dash-run-bar">
            <b
              style={{
                width: `${d.running.total ? ((d.running.done ?? 0) / d.running.total) * 100 : 0}%`,
              }}
            />
          </span>
          <em>
            {d.running.done ?? 0}/{d.running.total ?? 0}
            {d.running.user ? ` · ${d.running.user}` : ''}
          </em>
        </button>
      )}

      <div className="dash-two">
        {/* 데일리 추이 — 막대 전체가 실행량, 안의 초록이 Pass */}
        {ws.has('daily') && (
          <div className="dash-wide">
            <div className="dash-wt">데일리 실행 추이 (14일 — 막대: 실행, 초록: Pass)</div>
            <div className="dash-daily">
              {(d?.daily ?? []).map((x) => (
                <span
                  key={x.date}
                  className="dash-day"
                  title={`${x.date} — 실행 ${x.runs}건 · Pass ${x.ok}건`}
                >
                  <span className="dash-day-bar" style={{ height: `${(x.runs / maxRuns) * 100}%` }}>
                    <b style={{ height: `${x.runs ? (x.ok / x.runs) * 100 : 0}%` }} />
                  </span>
                  <i>{x.date.slice(8)}</i>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 버전별 합격률 — 누르면 그 사이클 실행 화면 */}
        {ws.has('versions') && (
          <div className="dash-wide">
            <div className="dash-wt">버전별 합격률 (최근 회차 — 누르면 실행 화면)</div>
            <div className="dash-vers">
              {(d?.versions ?? []).slice(0, 6).map((v) => (
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
              {d && d.versions.length === 0 && (
                <div className="empty">아직 사이클이 없습니다.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
