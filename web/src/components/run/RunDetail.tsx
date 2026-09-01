import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import type { CycleMeta, CycleStep } from '@/pages/Cycles'
import type { TestCaseMeta } from '@/types'
import RunAuto from './RunAuto'
import RunManual from './RunManual'
import './RunDetail.css'

/**
 * **실행 상세** — 목업의 Run 화면.
 *
 * 두 얼굴이다. **자동**은 세 칸(대상·항목·스텝 │ 콘솔 │ 합격기준·판정),
 * **수동**은 절차마다 사람이 통과/실패를 남긴다. 어느 쪽이든 결과는
 * 실행 기록(plan_run.data.results)에 담긴다 — 플랜이 아니라 실행이
 * 정본이라야 빌드마다 결과가 따로 남는다.
 */

export type Verdict = 'p' | 'f' | 'b' | 'n'

export interface RunFull {
  id: string
  plan_id?: string | null
  name?: string | null
  version?: string | null
  owner?: string | null
  closed_at?: string | null
  rerun_of?: string | null
  results?: Record<string, Verdict>
  binds?: Record<string, string>
  logs?: Record<string, { steps: Array<{ no: number; t: string; cmd?: string; out?: string; mark?: string }>; at?: string }>
  notes?: Record<string, string>
  /** 절차마다의 판정 — 수동 시험에서 쓴다 */
  pchk?: Record<string, string[]>
  /** 스텝마다의 실측값·판정 시각·판정자 */
  pmeta?: Record<string, Array<{ at?: string; by?: string; act?: string } | null>>
  meta?: Record<string, string>
  /** 담긴 시험 항목 */
  items?: Array<{ tcid?: string }>
  /** 실행기에 건 일감 번호 — 이게 있으면 자동 시험이 돌고 있(었)다 */
  job_id?: string | null
  /** 자동·수동 — 플랜에서 물려받은 값. 없으면 항목에서 뽑는다 */
  mode?: string | null
  /** 시험을 시작한 시각 — 있으면 「돌고 있음」이다(ISO) */
  started_at?: string | null
  /** 지금 돌리는 사람 */
  runner?: string | null
}

interface DeviceLite {
  id?: string
  name?: string
  model?: string
  ip?: string
  kind?: string
  status?: string
}

/** 수동 항목의 확인 절차 — TC 의 manual 스텝이 있으면 그것을, 없으면 기본 네 줄 */
function manualSteps(tc?: Record<string, unknown>): Array<{ t: string; e: string; d?: string; da?: string }> {
  const steps = (tc?.steps as CycleStep[] | undefined) ?? []
  const man = steps
    .filter((s) => s.manual || s.action === '수동' || s.step || s.expected)
    .map((s) => ({
      t: String(s.step ?? s.desc ?? '').trim(),
      e: String(s.expected ?? s.criteria ?? '').trim(),
      d: String(s.desc ?? '').trim(),
      da: String((s as unknown as Record<string, unknown>).data ?? '').trim(),
    }))
    .filter((x) => x.t || x.e)
  /* 예전엔 스텝이 없으면 **기본 네 줄을 지어냈다.** 화면이 비는 걸 막으려던
     것인데 더 나빴다 — 없는 절차를 있는 것처럼 보이고, 그 껍데기에 판정·
     판정자·판정 시각까지 남아 결과서로 나간다. 게다가 「실행 Step 없음」 과
     「지금 스텝 4/4」 가 한 화면에서 서로 다른 말을 했다(지적).
     없으면 없다고 적는다. */
  return man
}

export default function RunDetail({
  runId, plan, onBack, onGone,
}: {
  runId: string
  plan?: CycleMeta
  onBack: () => void
  onGone: () => void
}) {
  const qc = useQueryClient()
  const [cur, setCur] = useState('')
  const [stepAt, setStepAt] = useState(0)
  /* 판정하면 다음 항목으로 — 두 판 화면은 표에서 직접 고르므로 늘 켠다 */
  const autoNext = true
  const [bindOpen, setBindOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  /* 경과 시간 — 시작했으면 1초마다 다시 그린다 */
  const [, tick] = useState(0)
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 1000)
    return () => window.clearInterval(t)
  }, [])

  const runQ = useQuery({
    queryKey: ['plan-run', runId],
    queryFn: async () => {
      const r = await apiFetch(`/api/plan-runs/${encodeURIComponent(runId)}`)
      if (!r.ok) throw new Error('실행을 불러오지 못했습니다')
      return (await r.json()) as RunFull
    },
  })
  const tcQ = useQuery({
    queryKey: ['tc-meta'],
    queryFn: async () => {
      const r = await apiFetch('/api/tc?meta=1')
      if (!r.ok) throw new Error('시험 항목을 불러오지 못했습니다')
      return (await r.json()) as { tcs: TestCaseMeta[] }
    },
    staleTime: 60_000,
  })
  /** 요구사항 이름표 — 자동 화면의 묶음 머리에 쓴다. 안쪽 키(rq-178…)를
      그대로 보이면 사람은 그게 무엇인지 알 수 없다(지적). */
  const reqQ = useQuery({
    queryKey: ['req-names'],
    queryFn: async () => {
      const r = await apiFetch('/api/req')
      if (!r.ok) throw new Error('요구사항을 불러오지 못했습니다')
      return (await r.json()) as { reqs?: Array<Record<string, unknown>> }
    },
    staleTime: 60_000,
  })
  const reqName = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of reqQ.data?.reqs ?? []) {
      const title = String(r.title ?? '').trim()
      const label = String(r.reqid ?? '').trim()
      const nm = title || label
      if (!nm) continue
      for (const k of [r.id, r.pk, r.reqid]) {
        const key = String(k ?? '').trim()
        if (key) m.set(key, nm)
      }
    }
    return m
  }, [reqQ.data])

  const devQ = useQuery({
    queryKey: ['devices'],
    queryFn: async () => {
      const r = await apiFetch('/api/devices')
      if (!r.ok) return { devices: [] as DeviceLite[] }
      return (await r.json()) as { devices?: DeviceLite[]; items?: DeviceLite[] }
    },
    staleTime: 60_000,
  })

  const run = runQ.data
  const results = useMemo(() => run?.results ?? {}, [run])
  /** 실행기 일감 — 돌고 있으면 2초마다 다시 묻는다.
      다 돌면 서버가 결과를 이 실행으로 옮겨 적으므로, 그때 실행도 다시 읽는다. */
  const jobId = String(run?.job_id ?? '')
  const jobQ = useQuery({
    queryKey: ['run-job', jobId],
    enabled: !!jobId,
    refetchInterval: (q) => {
      const st = String((q.state.data as { run?: { status?: string } } | undefined)?.run?.status ?? '')
      return st === 'queued' || st === 'running' ? 2000 : false
    },
    queryFn: async () => {
      const r = await apiFetch(`/api/runs/${encodeURIComponent(jobId)}`)
      if (!r.ok) throw new Error('일감을 불러오지 못했습니다')
      return (await r.json()) as {
        run?: { status?: string; done?: number; total?: number; item_name?: string
                step_name?: string; step_at?: number; step_count?: number; error?: string }
      }
    },
  })
  const job = jobQ.data?.run
  const jobLive = job?.status === 'queued' || job?.status === 'running'
  /* 일감이 끝나면 실행을 한 번 다시 읽는다 — 서버가 옮겨 적은 결과를 본다 */
  const doneSeen = useRef('')
  useEffect(() => {
    const st = String(job?.status ?? '')
    if (!st || st === 'queued' || st === 'running') return
    const key = `${jobId}:${st}`
    if (doneSeen.current === key) return
    doneSeen.current = key
    void qc.invalidateQueries({ queryKey: ['plan-run', runId] })
    void qc.invalidateQueries({ queryKey: ['plan-runs'] })
  }, [job?.status, jobId, qc, runId])

  /* 담긴 항목이 먼저다. 결과만 보면, 결과가 아직 안 깔린 실행이
     「항목이 없습니다」로 보인다 — 항목은 있는데. 둘을 합친다. */
  const ids = useMemo(() => {
    const out: string[] = []
    for (const it of (run?.items ?? []) as Array<{ tcid?: string }>) {
      const k = String(it?.tcid ?? '')
      if (k && !out.includes(k)) out.push(k)
    }
    for (const k of Object.keys(results)) if (!out.includes(k)) out.push(k)
    return out
  }, [run, results])
  const tcById = useMemo(() => {
    const m = new Map<string, TestCaseMeta>()
    for (const t of tcQ.data?.tcs ?? []) m.set(t.tcid, t)
    return m
  }, [tcQ.data])
  const devices = useMemo(
    () => devQ.data?.devices ?? devQ.data?.items ?? [],
    [devQ.data],
  )
  const devById = useMemo(() => {
    const m = new Map<string, DeviceLite>()
    for (const d of devices) if (d.id) m.set(String(d.id), d)
    return m
  }, [devices])

  useEffect(() => {
    if (ids.length && (!cur || !ids.includes(cur))) setCur(ids[0]!)
  }, [ids, cur])

  /** 지금 고른 항목의 **전체** 정의 — 스텝·합격 기준은 여기 있다 */
  const oneQ = useQuery({
    queryKey: ['tc-one', cur],
    enabled: !!cur,
    queryFn: async () => {
      const r = await apiFetch(`/api/tc/${encodeURIComponent(cur)}`)
      if (!r.ok) throw new Error('시험 항목을 불러오지 못했습니다')
      return (await r.json()) as Record<string, unknown>
    },
    staleTime: 60_000,
  })

  const tally = useMemo(() => {
    const t = { p: 0, f: 0, b: 0, n: 0, total: ids.length, done: 0 }
    for (const k of ids) t[results[k] ?? 'n']++
    t.done = t.p + t.f + t.b
    return t
  }, [ids, results])
  const pct = tally.total ? Math.round((tally.done / tally.total) * 100) : 0

  const meta = tcById.get(cur)
  /* 방식은 **실행에 적힌 값이 먼저**다(플랜에서 손으로 정한 값이 여기까지 온다).
     없으면 지금 고른 항목의 성격에서 뽑는다 — Plans 와 같은 규칙이다. */
  const isAuto = String(run?.mode || meta?.run_type || meta?.kind || '자동') !== '수동'

  const save = async (patch: Partial<RunFull>) => {
    const r = await apiFetch(`/api/plan-runs/${encodeURIComponent(runId)}`, {
      method: 'POST',
      body: JSON.stringify(patch),
    })
    if (!r.ok) {
      window.alert('저장하지 못했습니다')
      return
    }
    await qc.invalidateQueries({ queryKey: ['plan-run', runId] })
    await qc.invalidateQueries({ queryKey: ['plan-runs'] })
  }

  const setResult = async (cid: string, v: Verdict) => {
    await save({ results: { ...results, [cid]: v } })
    if (autoNext && v !== 'n') {
      const i = ids.indexOf(cid)
      if (i >= 0 && i < ids.length - 1) {
        setCur(ids[i + 1]!)
        setStepAt(0)
      }
    }
  }

  const setProc = async (cid: string, ix: number, v: string) => {
    const arr = [...((run?.pchk ?? {})[cid] ?? [])]
    arr[ix] = arr[ix] === v ? '' : v
    const pchk = { ...(run?.pchk ?? {}), [cid]: arr }
    /* 누가 언제 판정했는지 같이 남긴다 — 결과서의 판정 시각·판정자다 */
    const mArr = [...((run?.pmeta ?? {})[cid] ?? [])]
    mArr[ix] = { ...(mArr[ix] ?? {}), at: arr[ix] ? new Date().toISOString() : undefined, by: arr[ix] ? run?.owner ?? '' : undefined }
    const pmeta = { ...(run?.pmeta ?? {}), [cid]: mArr }
    /* 절차 판정에서 항목 결과를 뽑는다 — 하나라도 실패면 실패 */
    const n = manualSteps(oneQ.data).length
    const roll: Verdict = arr.includes('f')
      ? 'f'
      : arr.includes('b')
        ? 'b'
        : arr.filter((x) => x === 'p').length >= n
          ? 'p'
          : 'n'
    await save({ pchk, pmeta, results: { ...results, [cid]: roll } })
  }

  /** 시험 시작.
      수동은 「사람이 시작했다」는 기록이면 충분하다. 자동은 **실행기에
      일감을 건다** — 실행기는 플랜만 알고 도니, 서버가 이 실행이 담은
      항목만 골라 걸고 결과를 도로 옮겨 적는다. */
  const start = async () => {
    if (busy) return
    const stamp = { started_at: new Date().toISOString(), runner: run?.owner ?? '' }
    if (!isAuto) {
      await save(stamp)
      return
    }
    setBusy(true)
    try {
      const r = await apiFetch('/api/runs', {
        method: 'POST',
        body: JSON.stringify({ plan_run_id: runId }),
      })
      const j = (await r.json().catch(() => ({}))) as { run?: { id?: string }; detail?: string }
      if (!r.ok) throw new Error(j.detail || '실행기에 걸지 못했습니다')
      await save({ ...stamp, job_id: String(j.run?.id ?? '') })
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '실행기에 걸지 못했습니다')
    } finally {
      setBusy(false)
    }
  }

  /** 중지. 도는 일감이 있으면 실행기에 부탁하고(스텝 사이에서 내려온다),
      없으면 시작 기록만 지운다. */
  const stop = async () => {
    if (jobLive && jobId) {
      try {
        await apiFetch(`/api/runs/${encodeURIComponent(jobId)}/stop`, { method: 'POST' })
      } catch {
        /* 이미 끝났을 수 있다 */
      }
      await jobQ.refetch()
      return
    }
    await save({ started_at: null })
  }

  /** 스텝의 실측값(Actual Result) — 결과서에 그대로 실린다 */
  const setAct = async (cid: string, ix: number, act: string) => {
    const mArr = [...((run?.pmeta ?? {})[cid] ?? [])]
    mArr[ix] = { ...(mArr[ix] ?? {}), act }
    await save({ pmeta: { ...(run?.pmeta ?? {}), [cid]: mArr } })
  }

  /** 실패·기타만 모아 같은 빌드로 다시 뜬다 — 33건 중 2건 고치자고 전체를 안 돌린다 */
  const rerun = async () => {
    const bad = ids.filter((k) => results[k] === 'f' || results[k] === 'b')
    if (!bad.length) {
      window.alert('다시 돌릴 실패 항목이 없습니다')
      return
    }
    if (!window.confirm(`실패·기타 ${bad.length}건만 모아 새 실행을 만듭니다.`)) return
    const r = await apiFetch('/api/plan-runs', {
      method: 'POST',
      body: JSON.stringify({
        plan_id: run?.plan_id ?? '',
        version: run?.version ?? '',
        name: `${run?.name ?? runId} 재시험`,
        rerun_of: runId,
        results: Object.fromEntries(bad.map((k) => [k, 'n'])),
        binds: run?.binds ?? {},
      }),
    })
    if (!r.ok) {
      window.alert('재시험을 만들지 못했습니다')
      return
    }
    await qc.invalidateQueries({ queryKey: ['plan-runs'] })
    onBack()
  }

  if (runQ.isLoading) return <div className="rd-empty">불러오는 중…</div>
  if (!run) return <div className="rd-empty">실행을 찾을 수 없습니다</div>

  const binds = run.binds ?? {}
  const dut = binds.DUT ? devById.get(String(binds.DUT)) : undefined
  const note = (run.notes ?? {})[cur] ?? ''
  const pv = (run.pchk ?? {})[cur] ?? []
  const msteps = manualSteps(oneQ.data)
  const log = (run.logs ?? {})[cur]
  /** 지금 보고 있는 스텝 — 아직 판정 안 한 첫 스텝이다. 다 했으면 마지막 */
  const stepNow = (() => {
    if (!msteps.length) return 0
    const at = pv.findIndex((v) => !v)
    /* 하나도 판정 안 했으면 findIndex 가 -1 이 아니라 0 이어야 맞다.
       빈 배열일 때만 -1 이 나오는데, 그때도 **첫 스텝**이지 마지막이 아니다. */
    if (at >= 0) return Math.min(at, msteps.length - 1)
    return pv.length ? msteps.length - 1 : 0
  })()

  return (
    <div className="panel rd">
      {/* ── 머리줄 ── */}
      <div className="rd-bar">
        <button type="button" className="rd-home" onClick={onBack}>
          ← {run.version || '목록'}
        </button>
        <span className="rd-key">{run.id}</span>
        {plan && (
          <>
            <span className="rd-sep">·</span>
            <span className="rd-plan">플랜 {plan.cid || plan.id}</span>
          </>
        )}
        <span className="rd-sp" />
        <span className={`rd-mode ${isAuto ? 'a' : 'm'}`}>{isAuto ? '⚙ 자동' : '👆 수동'}</span>
        {(jobLive || (!isAuto && run.started_at)) && (
          <span className="rd-run">
            <i />
            {jobLive ? (job?.status === 'queued' ? 'QUEUED' : 'RUNNING') : 'RUNNING'}
          </span>
        )}
        <span className="rd-sp" />
        {run.started_at ? (
          <button
            type="button"
            className="rd-btn"
            title={jobLive ? '실행기에 멈춤을 부탁합니다 — 스텝 사이에서 내려옵니다' : '시험을 멈춥니다 — 남긴 결과는 그대로입니다'}
            onClick={() => void stop()}
          >
            ■ 중지
          </button>
        ) : (
          <button
            type="button"
            className="rd-btn go"
            disabled={busy}
            title={
              isAuto
                ? '이 실행이 담은 항목을 실행기에 겁니다 — 실행기가 집어 가면 여기서 진행이 보입니다'
                : '시험을 시작합니다 — 시작 시각과 실행자를 남깁니다'
            }
            onClick={() => void start()}
          >
            {busy ? '거는 중…' : '▶ 시험 시작'}
          </button>
        )}
        <button type="button" className="rd-btn" onClick={() => setBindOpen(true)}>
          장비 배정
        </button>
        <button type="button" className="rd-btn" onClick={() => void rerun()}>
          실패만 재시험
        </button>
        <button
          type="button"
          className="rd-btn"
          onClick={() => void save({ closed_at: run.closed_at ? null : new Date().toISOString() })}
        >
          {run.closed_at ? '실행 열기' : '실행 닫기'}
        </button>
        <button
          type="button"
          className="rd-btn danger"
          onClick={async () => {
            if (!window.confirm(`실행 ${run.id} 을 지웁니다. 결과도 함께 사라집니다.`)) return
            await apiFetch(`/api/plan-runs/${encodeURIComponent(runId)}`, { method: 'DELETE' })
            await qc.invalidateQueries({ queryKey: ['plan-runs'] })
            onGone()
          }}
        >
          삭제
        </button>
      </div>

      {/* ── 위 띠 — 목업의 네 칸 ── */}
      {isAuto && jobId && (
        <div className={`rd-warn${jobLive ? ' live' : job?.status === 'failed' ? '' : ' ok'}`}>
          <b>{jobLive ? '▶' : job?.status === 'failed' ? '!' : '✓'}</b>
          {job?.status === 'queued'
            ? '실행기가 집어 가기를 기다립니다 — 실행기가 꺼져 있으면 여기서 멈춰 있습니다.'
            : job?.status === 'running'
              ? `실행기가 돌고 있습니다 — ${job.done ?? 0} / ${job.total ?? 0}건${job.item_name ? ` · ${job.item_name}` : ''}${job.step_name ? ` · ${job.step_name}` : ''}`
              : job?.status === 'failed'
                ? `실행이 실패했습니다 — ${job.error || '까닭을 못 받았습니다'}`
                : job?.status === 'stopped'
                  ? '사람이 멈췄습니다 — 그때까지의 결과는 남아 있습니다.'
                  : '실행이 끝났습니다 — 결과를 이 기록으로 옮겨 적었습니다.'}
        </div>
      )}
      <div className="rd-live">
        <div className="rd-lb">
          <div className="rd-lab">경과</div>
          <div className="rd-big">
            {(() => {
              if (!run.started_at) return '—'
              const sec = Math.max(0, Math.floor((Date.now() - new Date(run.started_at).getTime()) / 1000))
              const p2 = (n: number) => String(n).padStart(2, '0')
              return `${p2(Math.floor(sec / 3600))}:${p2(Math.floor((sec % 3600) / 60))}:${p2(sec % 60)}`
            })()}
          </div>
          <div className="rd-sub">
            {run.started_at ? `${new Date(run.started_at).toLocaleTimeString('ko-KR', { hour12: false })} 시작` : '아직 시작 안 함'}
          </div>
        </div>
        <div className="rd-lb">
          <div className="rd-lab">전체 진행</div>
          <div className="rd-prow">
            <span className="rd-bar2">
              <i className="p" style={{ flexGrow: tally.p }} />
              <i className="f" style={{ flexGrow: tally.f }} />
              <i className="b" style={{ flexGrow: tally.b }} />
              <i className="n" style={{ flexGrow: tally.n }} />
            </span>
            <b>{pct}%</b>
          </div>
          <div className="rd-counts">
            <span className="p">Pass {tally.p}</span>
            <span className="f">Fail {tally.f}</span>
            <span className="n">대기 {tally.n}</span>
            <span className="rd-muted">전체 {tally.total}</span>
          </div>
        </div>
        <div className="rd-lb">
          <div className="rd-lab">지금 시험 항목</div>
          <div className="rd-cur">
            {cur} · {meta?.name ?? ''}
          </div>
          <div className="rd-sub">
            할당자 {String((meta as Record<string, unknown> | undefined)?.assignee ?? '–')} · 실행자{' '}
            {run.runner || run.owner || '–'}
          </div>
        </div>
        <div className="rd-lb">
          {/* 목업의 CURRENT STEP 자리. 항목 결과는 오른쪽 시험서에 크게
              적혀 있어, 여기까지 또 적으면 같은 값이 세 번이다. */}
          <div className="rd-lab">지금 스텝</div>
          <b>
            {msteps.length ? `Step ${Math.min(stepNow + 1, msteps.length)} / ${msteps.length}` : '스텝 없음'}
          </b>
          <div className="rd-sub rd-ell" title={msteps[stepNow]?.t ?? ''}>
            {msteps[stepNow]?.t || (msteps.length ? '—' : '시험 항목에 절차가 없습니다')}
          </div>
        </div>
      </div>

      {!ids.length ? (
        <div className="rd-empty">
          <strong>담긴 시험 항목이 없습니다</strong>
          플랜에 항목을 담고 실행을 다시 만드세요.
        </div>
      ) : isAuto ? (
        /* 자동은 **네 판 작업대**(주신 목업) — 판 크기와 자리는 계정별로 남는다 */
        <RunAuto
          items={ids.map((id) => {
            const t2 = tcById.get(id)
            return {
              id,
              name: String(t2?.name ?? id),
              group: reqName.get(String(t2?.req_id ?? '')) ?? (t2?.req_id ? '이름 없는 요구사항' : '요구사항 없음'),
              verdict: (results[id] ?? 'n') as Verdict,
            }
          })}
          cur={cur}
          onPick={(id) => {
            setCur(id)
            setStepAt(0)
          }}
          /* 스텝은 **시험 항목의 정의**가 바탕이다. 실행 로그만 보면 아직
             안 돌린 항목은 「스텝이 없습니다」 가 되는데, 정의는 있다(지적).
             정의를 깔고 그 위에 실행 결과를 자리(차례)로 얹는다. */
          steps={(() => {
            const def = ((oneQ.data?.steps ?? []) as CycleStep[]).map((s2, i2) => ({
              no: i2 + 1,
              t: String(s2.desc ?? s2.step ?? s2.cli ?? '').trim() || `스텝 ${i2 + 1}`,
              cmd: String(s2.cli ?? ''),
              expected: String(s2.criteria ?? s2.expected ?? '') || '—',
              action: String(s2.action ?? (s2.cli ? 'command' : '')) || '—',
              session: String((s2 as unknown as Record<string, unknown>).session ?? '') || '—',
              out: String(s2.output ?? ''),
              mark: undefined as string | undefined,
            }))
            const lg = log?.steps ?? []
            if (!lg.length) return def
            if (!def.length)
              return lg.map((s2, i2) => ({ no: s2.no ?? i2 + 1, t: s2.t, cmd: s2.cmd, out: s2.out, mark: s2.mark }))
            return def.map((d2, i2) => {
              const l = lg[i2]
              return l ? { ...d2, cmd: l.cmd || d2.cmd, out: l.out ?? d2.out, mark: l.mark } : d2
            })
          })()}
          stepAt={stepAt}
          onStep={setStepAt}
          dut={dut?.name ?? 'DUT'}
          logAt={log?.at}
          verdict={(results[cur] ?? 'n') as Verdict}
          onVerdict={(v) => void setResult(cur, v)}
        />
      ) : (
        /* 수동은 **두 판**(주신 목업) — 왼쪽 촘촘한 표, 오른쪽 시험서 */
        <RunManual
          items={ids.map((id) => {
            const t2 = tcById.get(id)
            return {
              id,
              title: String(t2?.name ?? id),
              assignee: String((t2 as Record<string, unknown> | undefined)?.assignee ?? ''),
              runner: String(run.owner ?? ''),
              v: (results[id] ?? 'n') as Verdict,
              /* 지난 빌드 결과는 아직 안 싣는다 — 없는 것을 지어내지 않는다 */
              last: 'n' as Verdict,
              bugs: 0,
              at: String((run.logs ?? {})[id]?.at ?? '').slice(0, 10),
            }
          })}
          cur={cur}
          onPick={(id) => {
            setCur(id)
            setStepAt(0)
          }}
          steps={msteps.map((x) => ({ t: x.t, expected: x.e, desc: x.d, data: x.da }))}
          pchk={pv}
          pmeta={(run.pmeta ?? {})[cur] ?? []}
          onStep={(ix, v) => void setProc(cur, ix, v)}
          onAct={(ix, t) => void setAct(cur, ix, t)}
          note={note}
          onNote={(v) => void save({ notes: { ...(run.notes ?? {}), [cur]: v } })}
          info={{
            purpose: String(oneQ.data?.purpose ?? ''),
            cond: String(oneQ.data?.precondition ?? ''),
            topo: String(oneQ.data?.topology ?? ''),
            crit: String(oneQ.data?.criteria ?? ''),
          }}
          planId={String(run.plan_id ?? '')}
          runId={runId}
          onBug={() => void qc.invalidateQueries({ queryKey: ['plan-run', runId] })}
        />
      )}
      {bindOpen && (
        <BindDevices
          binds={binds}
          devices={devices}
          onClose={() => setBindOpen(false)}
          onSave={async (b) => {
            await save({ binds: b })
            setBindOpen(false)
          }}
        />
      )}
    </div>
  )
}

/** 역할(DUT·ONU1…)에 이번 실행에서 붙일 장비를 고른다 */
function BindDevices({
  binds, devices, onClose, onSave,
}: {
  binds: Record<string, string>
  devices: DeviceLite[]
  onClose: () => void
  onSave: (b: Record<string, string>) => void | Promise<void>
}) {
  const ROLES = ['DUT', 'ONU1', 'ONU2', 'TG1']
  const [val, setVal] = useState<Record<string, string>>({ ...binds })
  return (
    <div className="rd-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rd-modal" role="dialog" aria-modal="true" aria-label="장비 배정">
        <header>장비 배정</header>
        <div className="rd-mbody">
          <p className="rd-note2">
            시험 항목은 <b>역할</b>(DUT·ONU1…)만 가리킵니다. 이번 실행에서 그 역할에 붙일 장비를
            고르세요. 다른 실행에는 영향이 없습니다.
          </p>
          {ROLES.map((role) => (
            <label className="rd-fld" key={role}>
              <span>{role}</span>
              <select
                value={val[role] ?? ''}
                onChange={(e) => setVal((v) => ({ ...v, [role]: e.target.value }))}
              >
                <option value="">— 안 붙임 —</option>
                {devices.map((d) => (
                  <option key={String(d.id)} value={String(d.id)}>
                    {d.name} · {d.ip ?? ''} {d.model ? `(${d.model})` : ''}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <footer>
          <span className="rd-sp" />
          <button type="button" className="rd-btn" onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className="rd-btn pri"
            onClick={() =>
              void onSave(Object.fromEntries(Object.entries(val).filter(([, v]) => v)))
            }
          >
            저장
          </button>
        </footer>
      </div>
    </div>
  )
}
