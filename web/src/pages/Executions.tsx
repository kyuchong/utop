import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { onWs } from '@/api/wsBus'
import ListHead from '@/components/ListHead'
import './Executions.css'

/** 실행 한 건 */
interface Run {
  id: string
  cycle_id: string
  cycle_name?: string | null
  status: string
  started_by?: string | null
  worker?: string | null
  total?: number
  done?: number
  item_name?: string | null
  step_at?: number
  step_count?: number
  error?: string | null
  queued_at?: string | null
  started_at?: string | null
  ended_at?: string | null
}

interface LogRow {
  seq: number
  at?: number
  i: number
  kind: string
  text: string
}

const STATUS: Record<string, { label: string; cls: string }> = {
  queued: { label: '대기', cls: 'wait' },
  running: { label: '실행 중', cls: 'run' },
  done: { label: '마침', cls: 'done' },
  stopped: { label: '멈춤', cls: 'stop' },
  failed: { label: '실패', cls: 'fail' },
}

/** 언제 — 오늘이면 시각만, 아니면 날짜까지. 목록에서 눈이 덜 움직인다 */
function when(iso?: string | null): string {
  if (!iso) return '–'
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  const today = new Date()
  const same =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  const hm = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  return same ? hm : `${d.getMonth() + 1}-${p(d.getDate())} ${hm}`
}

/** 얼마나 걸렸나 */
function span(a?: string | null, b?: string | null): string {
  if (!a) return '–'
  const s = Math.max(0, Math.round((new Date(b || Date.now()).getTime() - new Date(a).getTime()) / 1000))
  if (s < 60) return `${s}초`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}분 ${s % 60}초`
  return `${Math.floor(m / 60)}시간 ${m % 60}분`
}

/**
 * Executions — 무슨 일이 있었나.
 *
 * 메뉴에는 있는데 페이지가 없었다. 만들 수가 없었다 — **보여 줄 것이
 * 없었으니까.** 실행이 브라우저 안에서만 일어나서 창을 닫으면 흔적도 없이
 * 사라졌다. 남는 것은 사이클 항목에 찍힌 시각 한 줄뿐이었다.
 *
 * 실행을 서버로 옮기면서 누가·언제·무엇을·몇 건·얼마나·어떻게 됐는지가
 * 다 남는다. 밤새 돌려 놓고 아침에 보는 자리가 여기다.
 *
 * 사이클 화면과 다른 점: 저기는 **한 사이클**을 붙들고 보는 자리고, 여기는
 * **모든 사이클의 실행**을 시간순으로 훑는 자리다. 「어제 밤에 뭐가
 * 돌았나」 는 사이클을 하나씩 열어서는 못 답한다.
 */
export default function Executions() {
  const qc = useQueryClient()
  const [sel, setSel] = useState('')
  const [status, setStatus] = useState('')
  const [who, setWho] = useState('')
  const [q, setQ] = useState('')
  const [onlyFail, setOnlyFail] = useState(false)
  /** 로그를 어느 회차 것만 볼까 — 반복이면 열 배가 된다 */
  const [round, setRound] = useState(0)

  const listQ = useQuery({
    queryKey: ['runs', 'all', status, who, q],
    queryFn: async () => {
      const p = new URLSearchParams()
      if (status) p.set('status', status)
      if (who) p.set('who', who)
      if (q.trim()) p.set('q', q.trim())
      const r = await apiFetch(`/api/runs?${p.toString()}`)
      if (!r.ok) throw new Error('실행 이력을 불러오지 못했습니다')
      return (await r.json()) as { runs: Run[]; people: string[] }
    },
  })

  const runs = useMemo(() => listQ.data?.runs ?? [], [listQ.data])
  const cur = runs.find((r) => r.id === sel)
  const live = runs.filter((r) => r.status === 'running')
  const queued = runs.filter((r) => r.status === 'queued')

  /** 멈추기 — 실행기가 스텝 사이에서 보고 스스로 내려온다 */
  const stop = async (id: string) => {
    await apiFetch(`/api/runs/${encodeURIComponent(id)}/stop`, { method: 'POST' })
    void qc.invalidateQueries({ queryKey: ['runs'] })
  }

  /**
   * 다시 걸기.
   *
   * 이력만 보는 화면이면 여기서 할 일이 없다. 밤새 돌린 것이 5건 깨졌으면
   * **그 5건만** 다시 거는 것이 다음 할 일이다 — 64건을 통째로 다시 돌릴
   * 이유가 없다.
   */
  const [busy, setBusy] = useState('')
  const again = async (r: Run, failedOnly: boolean) => {
    setBusy(r.id)
    try {
      let pick: number[] | undefined
      if (failedOnly) {
        const c = await apiFetch(`/api/cycle/${encodeURIComponent(r.cycle_id)}`)
        if (!c.ok) throw new Error('사이클을 읽지 못했습니다')
        const j = (await c.json()) as { items?: { steps?: { status?: string }[] }[] }
        pick = (j.items ?? [])
          .map((it, i) => ({ i, bad: (it.steps ?? []).some((x) => x.status === 'FAIL') }))
          .filter((x) => x.bad)
          .map((x) => x.i)
        if (!pick.length) {
          window.alert('깨진 항목이 없습니다.')
          return
        }
      }
      const res = await apiFetch('/api/runs', {
        method: 'POST',
        body: JSON.stringify({ cycle_id: r.cycle_id, ...(pick ? { pick } : {}) }),
      })
      const j = (await res.json().catch(() => ({}))) as { detail?: string }
      if (!res.ok) {
        window.alert(j.detail || `다시 걸지 못했습니다 (${res.status})`)
        return
      }
      void qc.invalidateQueries({ queryKey: ['runs'] })
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy('')
    }
  }

  const detQ = useQuery({
    queryKey: ['run', sel],
    enabled: !!sel,
    queryFn: async () => {
      const r = await apiFetch(`/api/runs/${encodeURIComponent(sel)}?after=0`)
      if (!r.ok) throw new Error('실행을 불러오지 못했습니다')
      return (await r.json()) as { run: Run; logs: LogRow[] }
    },
  })

  // 도는 것이 있으면 그대로 따라온다
  useEffect(() => {
    const off = onWs((m) => {
      if (m.type !== 'run_progress') return
      void qc.invalidateQueries({ queryKey: ['runs', 'all'] })
      const r = m.run as Run | undefined
      if (r && r.id === sel) void qc.invalidateQueries({ queryKey: ['run', sel] })
    })
    return off
  }, [qc, sel])

  // 다른 실행을 고르면 거르개는 되돌린다
  useEffect(() => {
    setRound(0)
    setOnlyFail(false)
  }, [sel])

  const logRef = useRef<HTMLDivElement>(null)
  const logs = detQ.data?.logs ?? []
  const rounds = 0 // 회차는 로그에 안 실린다 — 아래에서 항목 번호로만 가른다
  void rounds
  const items = useMemo(() => {
    const set = new Set<number>()
    for (const l of logs) if (typeof l.at === 'number' && l.at >= 0) set.add(l.at)
    return [...set].sort((a, b) => a - b)
  }, [logs])

  const shown = useMemo(() => {
    let v = logs
    if (round > 0) v = v.filter((l) => l.at === round - 1)
    if (onlyFail) v = v.filter((l) => l.kind === 'fail' || l.kind === 'warn')
    return v
  }, [logs, round, onlyFail])

  const stat = (s: string) => STATUS[s] ?? { label: s || '–', cls: '' }

  return (
    <div className="split ex">
      <section className="panel ex-list">
        <ListHead
          name="실행"
          count={runs.length}
          search={{ value: q, placeholder: '사이클 이름으로 찾기', onChange: setQ }}
        />

        {/* 지금 무엇이 살아 있나. 이력을 훑기 전에 이것부터 눈에 들어와야
            한다 — 밤새 돌린 것이 아직 도는 중인지 끝났는지가 먼저다. */}
        {(live.length > 0 || queued.length > 0) && (
          <div className="ex-live">
            {live.length > 0 && (
              <b>
                ● 도는 중 {live.length}건
                {live[0]?.cycle_name && ` — ${live[0].cycle_name}`}
                {live[0]?.started_by && ` (${live[0].started_by})`}
              </b>
            )}
            {queued.length > 0 && <span className="muted small">대기 {queued.length}건</span>}
          </div>
        )}

        <div className="ex-filters">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">상태 전부</option>
            {Object.entries(STATUS).map(([v, x]) => (
              <option key={v} value={v}>
                {x.label}
              </option>
            ))}
          </select>
          <select value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">누구나</option>
            {(listQ.data?.people ?? []).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div className="ex-rows">
          <div className="ex-row head">
            <span>상태</span>
            <span>사이클</span>
            <span>사람</span>
            <span>건수</span>
            <span>시작</span>
            <span>걸림</span>
          </div>
          {listQ.isLoading ? (
            <div className="empty">불러오는 중…</div>
          ) : runs.length === 0 ? (
            <div className="empty">
              아직 돌린 것이 없습니다. 사이클에서 「▶ 전체 실행」 을 누르면 여기 쌓입니다.
            </div>
          ) : (
            runs.map((r) => {
              const st = stat(r.status)
              return (
                <div
                  key={r.id}
                  className={`ex-row ${st.cls}${sel === r.id ? ' on' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSel(r.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setSel(r.id)
                    }
                  }}
                >
                  <span className={`ex-st ${st.cls}`}>{st.label}</span>
                  <span className="ex-nm" title={r.cycle_id}>
                    {r.cycle_name || r.cycle_id}
                    {/* 도는 중이면 지금 무엇을 하는지. 끝난 것에는 안 붙인다 */}
                    {r.status === 'running' && r.item_name && (
                      <i className="ex-now">{r.item_name}</i>
                    )}
                  </span>
                  <span className="muted">{r.started_by || '–'}</span>
                  <span className="ex-n">
                    {r.done ?? 0}/{r.total ?? 0}
                  </span>
                  <span className="muted small">{when(r.started_at || r.queued_at)}</span>
                  <span className="muted small">{span(r.started_at, r.ended_at)}</span>
                </div>
              )
            })
          )}
        </div>
      </section>

      <section className="panel ex-det">
        {!cur ? (
          <div className="empty">왼쪽에서 실행을 고르세요.</div>
        ) : (
          <>
            <div className="ex-dethead">
              <b>{cur.cycle_name || cur.cycle_id}</b>
              <span className={`ex-st ${stat(cur.status).cls}`}>{stat(cur.status).label}</span>
              <span className="muted small">
                {cur.started_by || '–'} · {cur.done ?? 0}/{cur.total ?? 0} ·{' '}
                {when(cur.started_at || cur.queued_at)} · {span(cur.started_at, cur.ended_at)}
                {cur.worker && ` · ${cur.worker}`}
              </span>
              {cur.error && <span className="muted small err">{cur.error}</span>}
              <span className="sp" />
              {/* 보기만 하는 화면이면 여기서 할 일이 없다. 밤새 돌린 것이
                  5건 깨졌으면 그 5건만 다시 거는 것이 다음 할 일이다. */}
              {cur.status === 'running' || cur.status === 'queued' ? (
                <button className="btn small danger" type="button" onClick={() => void stop(cur.id)}>
                  ⏹ 멈추기
                </button>
              ) : (
                <>
                  <button
                    className="btn small"
                    type="button"
                    disabled={busy === cur.id}
                    onClick={() => void again(cur, true)}
                  >
                    깨진 항목만 다시
                  </button>
                  <button
                    className="btn small primary"
                    type="button"
                    disabled={busy === cur.id}
                    onClick={() => void again(cur, false)}
                  >
                    ▶ 전체 다시 걸기
                  </button>
                </>
              )}
            </div>

            {/* 로그를 거른다.
                64건 × 스텝 × 회차면 수천 줄이 된다. 「어느 항목에서 깨졌나」
                를 그 안에서 눈으로 찾을 수는 없다. */}
            <div className="ex-logbar">
              <span className="muted small">
                {shown.length}/{logs.length}줄
              </span>
              {items.length > 1 && (
                <select value={round} onChange={(e) => setRound(Number(e.target.value))}>
                  <option value={0}>항목 전부</option>
                  {items.map((n) => (
                    <option key={n} value={n + 1}>
                      {n + 1}번째 항목
                    </option>
                  ))}
                </select>
              )}
              <label className="ex-only">
                <input
                  type="checkbox"
                  checked={onlyFail}
                  onChange={(e) => setOnlyFail(e.target.checked)}
                />
                깨진 것만
              </label>
            </div>

            <div className="ex-log" ref={logRef}>
              {detQ.isLoading ? (
                <div className="empty">불러오는 중…</div>
              ) : shown.length === 0 ? (
                <div className="empty">
                  {onlyFail ? '깨진 줄이 없습니다.' : '남은 줄이 없습니다.'}
                </div>
              ) : (
                shown.map((l) => (
                  <div className={`ex-line ${l.kind}`} key={l.seq}>
                    {l.i >= 0 && <b>{l.i + 1}</b>}
                    {l.text}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
