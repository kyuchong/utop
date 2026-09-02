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
  logs?: Record<
    string,
    {
      steps: Array<{ no: number; t: string; cmd?: string; out?: string; mark?: string }>
      at?: string
      /** 지난 실행의 출력 — 최근 두 번. 콘솔이 이번 것 위에 이어 쌓는다 */
      past?: Array<{ steps?: unknown[]; at?: string; by?: string }>
    }
  >
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
/** 이름이 없는 스텝의 **제 이름**.
 *
 *  대기·비교 스텝에는 desc·cli 가 없어 「스텝 2」 · 「스텝 5」 로 떴다(지적).
 *  자료에 이미 뜻이 들어 있다 — 대기는 몇 초인지, 비교는 무엇을 견주는지.
 */
function autoName(raw: Record<string, unknown>): string {
  const kind = String(raw?.kind ?? '').toLowerCase()
  if (kind === 'wait') {
    const sec = Number(raw?.waitSec ?? 0)
    return sec > 0 ? `${sec}초 대기` : '대기'
  }
  if (kind === 'diff') {
    /* conds 가 정본이다(l · op · r). 없으면 옛 칸(cmpLeft·cmpRight)으로. */
    const cs = Array.isArray(raw?.conds) ? (raw.conds as Array<Record<string, unknown>>) : []
    const join = String(raw?.condJoin ?? 'and').toLowerCase() === 'or' ? ' || ' : ' && '
    const parts = cs
      .map((c) => `${String(c?.l ?? '')} ${String(c?.op ?? '==')} ${String(c?.r ?? '')}`.trim())
      .filter((x) => x.length > 2)
    if (parts.length) return parts.join(join)
    const l = String(raw?.cmpLeft ?? '')
    const r = String(raw?.cmpRight ?? '')
    if (l || r) return `${l} ${String(raw?.cmpOp ?? '==')} ${r}`.trim()
    return '비교'
  }
  return ''
}

/** 스텝 하나를 화면이 아는 모양으로 바꾼다.
 *
 * 실제 자료의 칸 이름은 목업과 다르다 — 절차는 `cli`(명령)·`desc`(설명)·
 * `rules`(견줄 것)·`status`(판정)·`took_ms`(걸린 시간)로 적힌다. 이걸 안
 * 맞춰 줘서, 다 돌고도 표가 전부 「—」 였다(지적).
 */
function asStep(raw: Record<string, unknown>, i: number): {
  no: number; t: string; cmd: string; expected: string; action: string
  session: string; out: string; mark?: string; took?: string; waitSec?: number; at?: string
  /** 비교 스텝이 통과·실패일 때 적어 둔 문구 */
  okMsg?: string; ngMsg?: string
  /** 이 스텝이 실제로 돌았나. 판정이 없는 스텝(대기·조회)과 **안 돌린 스텝**은 다르다 */
  ran?: boolean
} {
  const g = (k: string) => String(raw?.[k] ?? '').trim()
  const cli = g('cli') || g('cmd')
  /* 기대값 — criteria 가 비면 rules 를 사람 말로 잇는다 */
  const rules = Array.isArray(raw?.rules) ? (raw.rules as Array<Record<string, unknown>>) : []
  const expected =
    g('criteria') ||
    g('expected') ||
    rules
      .map((r) => `${String(r?.rhs ?? r?.t ?? '')} ${String(r?.op ?? '==')} ${String(r?.v ?? '')}`.trim())
      .filter(Boolean)
      .join(' && ')
  /* 판정 — 사람이 적은 result 가 먼저, 없으면 실행기의 status */
  const res = g('result')
  const st = g('status').toUpperCase()
  const mark = res || ({ PASS: 'Pass', FAIL: 'Fail', BLOCKED: 'Blocked', WIP: 'WIP' } as Record<string, string>)[st]
  const ms = Number(raw?.took_ms ?? NaN)
  return {
    no: Number(raw?.no ?? NaN) || i + 1,
    /* 「스텝 2」 같은 자리 채우개를 여기서 넣으면, 로그 쪽 채우개가 정의
       쪽 진짜 이름을 이겨 버린다(지적: Description 이 「스텝 2」). 비워
       두고, 그릴 때 채운다. */
    t: g('desc') || g('step') || g('t') || cli || autoName(raw),
    cmd: cli,
    expected: expected || '—',
    action: g('action') || (g('kind') === 'cli' || cli ? 'command' : g('kind')) || '—',
    session: raw?.session === undefined || raw?.session === null ? '—' : `s${String(raw.session)}`,
    out: g('output') || g('out'),
    mark: mark || undefined,
    took: Number.isFinite(ms) ? `${(ms / 1000).toFixed(2)}s` : g('took') || undefined,
    waitSec: Number(raw?.waitSec ?? 0) || undefined,
    /* 스텝이 **언제** 돌았나. 안 실으면 이벤트 줄이 전부 항목 끝난 시각
       하나로 찍혀, 무엇이 먼저였는지 알 수 없다. */
    at: g('executed_at') || g('at') || undefined,
    /* 사람이 적어 둔 판정 문구. 실행 이벤트가 「기준 맞음」 대신 이걸 적는다(지시) */
    okMsg: g('msgYes') || g('trueMsg') || undefined,
    ngMsg: g('msgNo') || g('falseMsg') || undefined,
    /* 걸린 시간이나 출력이 있으면 돈 것이다. 실행기는 판정 기준이 없는
       스텝(대기·단순 조회)에는 status 를 안 남긴다 — 그걸 「미실행」 으로
       그려서 「건너뛴 것 같다」 는 말이 나왔다(지적). */
    ran: Number.isFinite(ms) || !!g('output') || !!g('out') || !!g('executed_at') || !!res || !!st,
  }
}

function manualSteps(tc?: Record<string, unknown>): Array<{ t: string; e: string; d?: string; da?: string }> {
  /* 절차는 `steps` 가 아니라 **`checks`** 에 사는 항목이 많다(213 은 전부
     그렇다). 한쪽만 보면 「절차가 없습니다」 로 잘못 뜬다. */
  const raw = (tc?.steps as CycleStep[] | undefined) ?? []
  const steps = raw.length ? raw : ((tc?.checks as CycleStep[] | undefined) ?? [])
  const man = steps
    /* **거르지 않는다.** 예전엔 이름이 있는 것만 남겼는데, 대기·비교 스텝은
       desc·cli 가 아예 없어 통째로 빠졌다. 그래서 표는 5줄인데 띠는
       「Step 2 / 3」 이라 서로 다른 말을 했다(지적).
       스텝은 스텝이다 — 이름이 없으면 그릴 때 「스텝 N」 으로 채운다. */
    .filter((s) => !!s && typeof s === 'object')
    .map((s) => ({
      t: String(s.step ?? s.desc ?? (s as unknown as Record<string, unknown>).cli ?? '').trim(),
      e: String(s.expected ?? s.criteria ?? '').trim(),
      d: String(s.desc ?? '').trim(),
      da: String((s as unknown as Record<string, unknown>).data ?? '').trim(),
    }))
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
  const [busy, setBusy] = useState(false)
  /* 경과 시간 — **도는 동안에만** 1초마다 다시 그린다. 끝났는데도 계속
     세면 화면은 「끝났습니다」 라면서 시계는 올라간다(지적). */
  const [, tick] = useState(0)
  const [ticking, setTicking] = useState(true)
  useEffect(() => {
    if (!ticking) return
    const t = window.setInterval(() => tick((n) => n + 1), 1000)
    return () => window.clearInterval(t)
  }, [ticking])

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
      /* 1초. 2초로 두었더니 0.37초짜리 스텝은 통째로 지나가 버려
         「실시간이 아닌 것 같다」 는 말이 나왔다(지적). */
      return st === 'queued' || st === 'running' ? 1000 : false
    },
    queryFn: async () => {
      const r = await apiFetch(`/api/runs/${encodeURIComponent(jobId)}`)
      if (!r.ok) throw new Error('일감을 불러오지 못했습니다')
      return (await r.json()) as {
        run?: { status?: string; done?: number; total?: number; item_name?: string
                step_name?: string; step_at?: number; step_count?: number; error?: string
        item_at?: number; ended_at?: string | null
        /** 지금 도는 항목의 스텝들 — 결과가 차오르는 그대로다 */
        live_steps?: unknown[] | null }
      }
    },
  })
  const job = jobQ.data?.run
  const jobLive = job?.status === 'queued' || job?.status === 'running'
  /** 실행기가 지금 돌고 있는 항목·스텝. 안 돌면 없다 — 없는 것을 그리지 않는다 */
  const runItem = jobLive ? String(job?.item_name ?? '') : ''
  /** 일감이 끝났나 — 끝났으면 멈출 것이 없고, 다시 돌릴 수 있다 */
  const jobDone = !!jobId && !jobLive && !!job?.status
  /** 시계를 멈출 시각 — 일감이 끝났으면 그 끝난 시각이다.
      끝난 시각을 못 받았으면 「끝났다고 본 순간」 에 못 박는다. */
  const froze = useRef('')
  const stoppedAt = (() => {
    if (jobLive) return ''
    if (!jobId) return ''
    const e = String(job?.ended_at ?? '')
    if (e) return e
    if (!job?.status) return ''
    if (!froze.current) froze.current = new Date().toISOString()
    return froze.current
  })()
  useEffect(() => {
    if (jobLive) froze.current = ''
  }, [jobLive])
  useEffect(() => {
    /* 도는 중이거나 수동이 시작만 눌린 상태면 센다. 그 밖엔 멈춘다. */
    setTicking(jobLive || (!jobId && !!run?.started_at))
  }, [jobLive, jobId, run?.started_at])
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
    const add = (k: string) => {
      if (k && !out.includes(k)) out.push(k)
    }
    /* ① 실행이 담은 차례가 정본이다(배열이라 차례가 남는다) */
    for (const it of (run?.items ?? []) as Array<{ tcid?: string }>) add(String(it?.tcid ?? ''))
    /* ② 없으면 플랜의 항목 차례를 쓴다. results 키를 그냥 쓰면 안 된다 —
       JSONB 는 키를 **정렬해 버려서** 담은 차례가 사라진다. 실행기는 위에서
       아래로 도는데 화면만 뒤섞이면 순서대로 안 도는 것처럼 보인다(지적). */
    if (!out.length)
      for (const it of ((plan?.items ?? []) as Array<{ tcid?: string }>))
        if (results[String(it?.tcid ?? '')] !== undefined) add(String(it?.tcid ?? ''))
    /* ③ 그래도 빠진 것이 있으면 뒤에 붙인다 */
    for (const k of Object.keys(results)) add(k)
    return out
  }, [run, plan, results])
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
    if (!ids.length) return
    if (cur && ids.includes(cur)) return
    /* 실행기가 도는 항목이 있으면 그리로. 무턱대고 첫 항목으로 되돌리면
       따라가기와 서로 밀어낸다. */
    setCur(runId2 && ids.includes(runId2) ? runId2 : ids[0]!)
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

  /* 일감이 끝나면 **마지막 스텝**으로 옮긴다. 중간에 멈춰 있으면 그 뒤
     스텝이 안 돈 것처럼 보인다 — 실제로는 다 돌았다.
     msteps 는 이른 return 아래에 있어 여기서 쓸 수 없다(훅 차례가 깨진다).
     그냥 다시 센다 — 훅이 아니라 함수 호출이다. */
  const doneMoved = useRef('')
  const nSteps = manualSteps(oneQ.data).length
  useEffect(() => {
    /* 스텝이 아직 안 온 사이에 옮기려 하면 0 으로 가 버리고, 한 번 옮겼다고
       표시돼 다시 안 옮긴다. 스텝이 온 뒤에 옮긴다. */
    if (!jobDone || !jobId || !nSteps) return
    const key = `${jobId}:${cur}:${nSteps}`
    if (doneMoved.current === key) return
    doneMoved.current = key
    setPinned(false)
    setStepAt(Math.max(0, nSteps - 1))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobDone, jobId, cur, nSteps])

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
  /** 멈출 것이 있나 — 도는 일감이 있거나, 수동이 시작만 눌린 상태 */
  const canStop = jobLive || (!isAuto && !!run?.started_at)

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

  /* 「고른 항목 판정」 단추가 쓰던 길은 그 줄과 함께 걷었다(지시).
     자동 시험의 결과는 실행기가 내고, 수동 시험의 항목 결과는 스텝
     판정에서 굴러 나온다 — 사람이 항목 결과를 직접 찍는 자리는 없다. */

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

  /* 도는 동안에는 **실행기를 따라간다.** 안 그러면 CLI 판은 첫 스텝에
     머문 채, 표에서만 파란 줄이 내려가 서로 다른 곳을 가리킨다.
     사람이 줄을 누르면 그 자리에 멈춘다(pinned). */
  const [pinned, setPinned] = useState(false)
  useEffect(() => {
    if (!jobLive) return
    setPinned(false)
  }, [cur, jobLive])
  /** 실행기가 도는 항목의 id.
   *  이름으로 맞추되, 못 찾으면 **자리 번호**(item_at, 플랜 항목의 몇 번째)로
   *  떨어진다. 플랜 항목 이름과 시험 항목 이름이 어긋나면 이름만으로는 못 찾고,
   *  그러면 실시간 스텝이 안 붙어 지난 값이 그대로 남는다. */
  const runId2 = (() => {
    if (!jobLive) return ''
    if (runItem) {
      const byName = ids.find((k) => String(tcById.get(k)?.name ?? '') === runItem)
      if (byName) return byName
    }
    const at = Number(job?.item_at ?? -1)
    const pitems = (plan?.items ?? []) as Array<{ tcid?: string }>
    if (at >= 0 && at < pitems.length) {
      const k = String(pitems[at]?.tcid ?? '')
      if (k && ids.includes(k)) return k
    }
    return ''
  })()
  /* 실행기는 항목을 **시작할 때 step_at 을 -1 로** 준다(스텝을 아직 안 집었다).
     그걸 「도는 스텝 없음」 으로 읽으면 지난 실행 값이 통째로 펼쳐진다 —
     막 시작한 항목은 **첫 스텝**으로 본다. */
  const runStep =
    !jobLive || typeof job?.step_at !== 'number'
      ? null
      : job.step_at >= 0
        ? job.step_at
        : runId2
          ? 0
          : null
  /* 보는 스텝도 실행기를 따라간다 — 사람이 줄을 누르면 그 자리에 멈춘다 */
  useEffect(() => {
    if (pinned || runStep == null) return
    setStepAt(runStep)
  }, [runStep, pinned])
  /* 보는 항목도 실행기를 따라간다. 안 그러면 첫 항목에 머문 채 밑에서만
     결과가 바뀌어, 위에서 아래로 도는 게 안 보인다(지적).
     사람이 다른 항목을 누르면 그 자리에 멈춘다. */
  const [pinItem, setPinItem] = useState(false)
  useEffect(() => {
    if (jobLive) setPinItem(false)
  }, [jobLive])
  /* **바뀐 순간에만** 옮긴다. 예전엔 cur 를 의존에 넣어 매 렌더마다 밀었고,
     밑의 「고른 항목이 목록에 없으면 첫 항목으로」 와 서로 밀어내며 화면이
     T0033 ↔ T0034 로 튀었다(지적). 실행기가 다음 항목으로 넘어간 그 한
     번만 따라가고, 그 뒤로는 가만둔다. */
  /** 마지막으로 본 실시간 스텝(항목별). 다음 항목으로 넘어가는 **사이**에도
      방금 끝난 항목의 결과를 그대로 보여 주려고 붙들어 둔다. */
  const lastLive = useRef<{ id: string; steps: unknown[] } | null>(null)
  useEffect(() => {
    if (!jobLive || !cur || runId2 !== cur) return
    if (Array.isArray(job?.live_steps)) lastLive.current = { id: cur, steps: job.live_steps }
  }, [job?.live_steps, jobLive, runId2, cur])

  const wentTo = useRef('')
  /** 넘어갈 곳 — 늦춰 옮기는 사이에 또 바뀌면 **늘 최신**으로 간다 */
  const nextItem = useRef('')
  /** 지금 **붙잡고 있는** 항목 — 직전까지 돌던 것을 1.6초 더 보여 주는 중이다.
      비어 있으면 붙잡는 중이 아니다. */
  const holding = useRef('')
  useEffect(() => {
    if (!runId2 || wentTo.current === runId2) return
    /* 고정 중이면 **기억하지 않고** 그냥 넘긴다. 예전엔 먼저 기억해 두어,
       고정을 푼 뒤에도 그 항목 바뀜이 영영 삼켜져 화면이 안 따라갔다
       (지적: 실행기는 T0034 인데 화면은 T0033). */
    if (pinItem) return
    const prev = wentTo.current
    wentTo.current = runId2
    nextItem.current = runId2
    /* **처음 시작**이거나, 보고 있던 항목이 직전까지 돌던 그것이 아니면
       붙잡지 않고 **바로** 옮긴다. 예전엔 여기서도 1.6초를 붙잡아, 지난번에
       보던 항목(아무것도 안 돌고 있는)의 마지막 스텝에 RUN 이 찍혔다가
       넘어갔다(지적: 처음 실행하는데 1번 그림처럼 나온다). */
    if (!prev || cur !== prev) {
      holding.current = ''
      setCur(runId2)
      setStepAt(0)
      setPinned(false)
      return
    }
    holding.current = prev
    /* **바로 안 넘어간다.** 실행기는 마지막 스텝을 올린 직후 다음 항목
       이름을 올린다 — 그 사이가 1초도 안 돼, 곧장 따라가면 방금 끝난
       항목의 마지막 결과를 아무도 못 본다(지적). 1.6초 머문 뒤 넘어간다.
       그 사이 또 바뀌면 늘 **최신** 항목으로 간다. */
    const t = window.setTimeout(() => {
      const go = nextItem.current
      if (!go) return
      holding.current = ''
      setCur(go)
      setStepAt(0)
      setPinned(false)
      /* 넘어가면서 실행 기록을 다시 읽는다 — 방금 끝난 항목의 결과가
         서버에 옮겨 적혔다. 안 읽으면 되돌아가 볼 때 지난 값이 보인다. */
      void qc.invalidateQueries({ queryKey: ['plan-run', runId] })
    }, 1600)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId2])

  /** **시작 시각을 여기서 기억한다.**
   *
   *  실행기는 「몇 번째 항목·몇 번째 스텝을 도는 중」 까지만 알려 주고,
   *  언제부터 도는지는 안 준다. 그래서 그것이 도는 것을 **본 순간**을
   *  적어 둔다.
   *
   *  이 기억은 **RunAuto 안에 두면 안 된다.** 다른 항목을 봤다 오면 그
   *  판이 새로 서면서 기억이 비고, 대기 초읽기가 20 부터 다시 셌다(지적).
   *  이 판(RunDetail)은 항목을 옮겨도 안 죽으므로 여기가 제자리다.
   *  일감이 바뀌면 통째로 비운다 — 지난 실행의 시각이 남으면 안 된다. */
  const seenAt = useRef<{ job: string; item: Record<string, number>; step: Record<string, number> }>({
    job: '', item: {}, step: {},
  })
  if (seenAt.current.job !== jobId) seenAt.current = { job: jobId, item: {}, step: {} }
  useEffect(() => {
    if (!jobLive || !runId2) return
    const m = seenAt.current
    if (!m.item[runId2]) m.item[runId2] = Date.now()
    if (runStep != null) {
      const k = `${runId2}|${runStep}`
      if (!m.step[k]) m.step[k] = Date.now()
    }
  }, [jobLive, runId2, runStep])

  /** 지금 도는 항목이 **얼마나 돌았나** — 벽시계로 센다.
   *
   *  예전엔 여기도 기록(logs)의 걸린 시간을 더했다. 그런데 그 기록에는
   *  **지난 실행의 값**이 남아 있어서, 경과가 7초일 때 항목에는 벌써
   *  20s 가 떠 있었다(지적). 도는 중에는 기록을 믿지 않는다. */
  const liveTook = (id: string): string => {
    const at = seenAt.current.item[id]
    if (!at) return ''
    const sec = Math.max(0, Math.round((Date.now() - at) / 1000))
    if (sec < 60) return `${sec}s`
    const m = Math.floor(sec / 60)
    return `${m}m${String(sec % 60).padStart(2, '0')}s`
  }

  /** 이 항목을 도는 데 걸린 시간 — 스텝들의 걸린 시간을 더한다.
      실행기는 항목 단위 시간을 따로 안 준다. 안 돌린 항목은 비운다. */
  const tookOf = (id: string): string => {
    const st = ((run?.logs ?? {})[id]?.steps ?? []) as Array<Record<string, unknown>>
    let ms = 0
    let saw = false
    for (const s2 of st) {
      const v = Number(s2?.took_ms ?? NaN)
      if (Number.isFinite(v)) {
        ms += v
        saw = true
      }
    }
    if (!saw) return ''
    const sec = Math.round(ms / 1000)
    if (sec < 60) return `${sec}s`
    const m = Math.floor(sec / 60)
    return `${m}m${String(sec % 60).padStart(2, '0')}s`
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
      froze.current = ''
      await save({ ...stamp, job_id: String(j.run?.id ?? '') })
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '실행기에 걸지 못했습니다')
    } finally {
      setBusy(false)
    }
  }

  /** **고른 항목 하나만** 돌린다(지시).
   *  서버는 pick(플랜 항목의 자리 번호)을 받는다 — 그것만 걸면 나머지
   *  항목의 결과는 건드리지 않는다. */
  const startOne = async () => {
    if (busy || !cur) return
    const items = (plan?.items ?? []) as Array<{ tcid?: string }>
    const at = items.findIndex((x) => String(x?.tcid ?? '') === cur)
    if (at < 0) {
      window.alert('이 항목이 플랜에 없습니다 — 플랜에서 빠졌는지 보세요')
      return
    }
    setBusy(true)
    try {
      const r = await apiFetch('/api/runs', {
        method: 'POST',
        body: JSON.stringify({ plan_run_id: runId, pick: [at] }),
      })
      const j = (await r.json().catch(() => ({}))) as { run?: { id?: string }; detail?: string }
      if (!r.ok) throw new Error(j.detail || '실행기에 걸지 못했습니다')
      froze.current = ''
      await save({ started_at: new Date().toISOString(), runner: run?.owner ?? '', job_id: String(j.run?.id ?? '') })
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

  /* 「실패만 재시험」 은 뺐다(지시) — 그 길만 쓰던 rerun 도 함께 걷는다.
     안 쓰는 길을 남겨 두면 다음 사람이 살아 있는 줄로 읽는다. */

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
    /* 돌고 있으면 **실행기 자리**가 정본이다. 안 그러면 띠는 Step 1 인데
       표에서는 3번 줄이 도는, 서로 다른 말을 하는 화면이 된다(지적). */
    if (runStep != null && msteps.length) return Math.min(runStep, msteps.length - 1)
    if (!msteps.length) return 0
    /* 다 돈 자동 실행은 **마지막 스텝**에서 멎는다. 첫 스텝으로 되돌리면
       「끝났습니다」 옆에 Step 1 이 서서 아직 시작 전처럼 보인다. */
    if (jobId && !jobLive && job?.status) return msteps.length - 1
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
        {/* 방식 딱지와 RUNNING/QUEUED 배지를 뺐다(지시). 상태는 위 띠의
            「지금 스텝」 이 이미 말한다 — Step 1 / 5 (대기) 처럼. */}
        <span className="rd-sp" />
        {/* 「중지」 는 **멈출 것이 있을 때만** 선다. 자동 실행이 끝난 뒤에도
            started_at 이 남아 있어 계속 중지가 서 있었고, 눌러도 멈출 것이
            없으니 아무 일도 안 일어났다(지적). 끝났으면 다시 돌릴 차례다. */}
        {canStop ? (
          <button
            type="button"
            className="rd-btn"
            title={jobLive ? '실행기에 멈춤을 부탁합니다 — 스텝 사이에서 내려옵니다' : '시작 기록을 지웁니다 — 남긴 결과는 그대로입니다'}
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
              !isAuto
                ? '시험을 시작합니다 — 시작 시각과 실행자를 남깁니다'
                : jobDone
                  ? '같은 항목을 실행기에 다시 겁니다 — 결과는 새로 덮입니다'
                  : '이 실행이 담은 항목을 실행기에 겁니다 — 실행기가 집어 가면 여기서 진행이 보입니다'
            }
            onClick={() => void start()}
          >
            {busy ? '거는 중…' : jobDone ? '▶ 다시 실행' : '▶ 시험 시작'}
          </button>
        )}
        {/* 「장비 배정」 은 뺐다 — binds 를 저장만 하고 실행기가 안 읽어,
            배정해도 그 장비로 안 돌았다(죽은 단추였다).
            「실패만 재시험」·「실행 닫기」 도 뺐다(지시). */}
        {isAuto && (
          <button
            type="button"
            className="rd-btn"
            disabled={busy || !cur || jobLive}
            title={
              jobLive
                ? '지금 돌고 있습니다'
                : cur
                  ? `${cur} 하나만 실행기에 겁니다 — 나머지 결과는 그대로 둡니다`
                  : '먼저 시험 항목을 고르세요'
            }
            onClick={() => void startOne()}
          >
            ▶ 이 항목만 실행
          </button>
        )}
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
      {/* 끝났다는 초록 띠는 뺐다(지시) — 머리줄의 「▶ 다시 실행」 과 진행
          100% 가 이미 그 말을 한다. 도는 중과 **실패**만 남긴다: 그 둘은
          다른 데서 알 수 없다(실패는 까닭이 여기에만 있다). */}
      {/* 「실행기가 집어 가기를 기다립니다」 띠도 뺐다(지시).
          실패만 남긴다 — 까닭이 이 줄에만 있어서 지우면 알 길이 없다. */}
      {isAuto && jobId && job?.status === 'failed' && (
        <div className="rd-warn">
          <b>!</b>
          실행이 실패했습니다 — {job.error || '까닭을 못 받았습니다'}
        </div>
      )}

      <div className="rd-live">
        <span className="rd-lb">
          <em>경과</em>
          <b>
            {(() => {
              if (!run.started_at) return '—'
              const end = stoppedAt ? new Date(stoppedAt).getTime() : Date.now()
              const sec = Math.max(0, Math.floor((end - new Date(run.started_at).getTime()) / 1000))
              const p2 = (n: number) => String(n).padStart(2, '0')
              return `${p2(Math.floor(sec / 3600))}:${p2(Math.floor((sec % 3600) / 60))}:${p2(sec % 60)}`
            })()}
          </b>
          <i>
            {run.started_at
              ? `(${(() => {
                  const d = new Date(run.started_at)
                  const p = (n: number) => String(n).padStart(2, '0')
                  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
                })()} 시작)`
              : '(아직 시작 안 함)'}
          </i>
        </span>

        <span className="rd-lb grow2">
          <em>진행</em>
          <span className="rd-bar2">
            <i className="p" style={{ flexGrow: tally.p }} />
            <i className="f" style={{ flexGrow: tally.f }} />
            <i className="b" style={{ flexGrow: tally.b }} />
            <i className="n" style={{ flexGrow: tally.n }} />
          </span>
          <b>{pct}%</b>
          <i>
            (<span className="p">Pass {tally.p}</span> <span className="f">Fail {tally.f}</span> 대기{' '}
            {tally.n} · 전체 {tally.total})
          </i>
        </span>

        <span className="rd-lb grow3">
          <em>지금 항목</em>
          <b className="rd-ell">
            {cur}
            {meta?.name ? ` · ${meta.name}` : ''}
          </b>
          <i className="rd-ell">
            (할당자 {String((meta as Record<string, unknown> | undefined)?.assignee ?? '–')} · 실행자{' '}
            {run.runner || run.owner || '–'})
          </i>
        </span>

        <span className="rd-lb last">
          <em>지금 스텝</em>
          <b>
            {msteps.length ? `Step ${Math.min(stepNow + 1, msteps.length)} / ${msteps.length}` : '스텝 없음'}
          </b>
          <i className="rd-ell" title={msteps[stepNow]?.t ?? ''}>
            {msteps.length ? `(${msteps[stepNow]?.t || '—'})` : ''}
          </i>
        </span>
        {/* 남는 자리는 여기가 먹는다 — 칸이 늘어나면 구분선만 밀려난다 */}
        <span className="rd-sp" />
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
              /* 도는 중인 항목은 벽시계로(위 liveTook 주석) — 기록에는
                 지난 실행의 값이 남아 있다 */
              took: jobLive && id === runId2 ? liveTook(id) : tookOf(id),
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
            /* 정의도 로그도 **같은 변환**을 탄다. 예전엔 로그만 있을 때
               no·t·cmd·out·mark 만 옮겨, Action·Session·Expected·Time 이
               통째로 비었다(지적: 다 돌았는데 표가 —). */
            const rawDef = ((oneQ.data?.steps as unknown[] | undefined)?.length
              ? (oneQ.data?.steps as unknown[])
              : ((oneQ.data?.checks as unknown[] | undefined) ?? [])) as Array<Record<string, unknown>>
            const def = rawDef.map(asStep)
            /* 도는 중에는 **실행기가 보내는 실시간 스텝**을 쓴다.
               실행기는 항목을 다 마쳐야 저장하므로, 그 전까지 저장본은
               **지난 실행의 값**이다 — 그걸 그리면 지금 것과 섞인다(지적). */
            const onAir = jobLive && runId2 === cur
            /* 넘어가는 사이(실행기는 다음 항목, 화면은 아직 이 항목)에도
               붙들어 둔 실시간 스텝을 쓴다 — 그래야 마지막 결과가 안 사라진다 */
            const held =
              jobLive && !onAir && lastLive.current?.id === cur ? lastLive.current.steps : null
            const live = onAir && Array.isArray(job?.live_steps) ? job.live_steps : held
            /* 도는 항목이면 저장본으로 **안 떨어진다.** 실행기는 항목을 다
               마쳐야 저장하므로 저장본은 지난 실행의 값이다 — 그게 남아서
               Time 이 계속 똑같아 보였다(지적). 아직 안 온 것은 빈 채로 둔다. */
            const lg = ((live ?? (onAir ? [] : (log?.steps ?? []))) as unknown[]) as Array<Record<string, unknown>>
            if (!lg.length) return def
            const run2 = lg.map(asStep)
            if (!def.length) return run2
            /* 돈 값이 이긴다 — 정의는 빈 칸을 메우는 데만 쓴다.
               **도는 중이면 결과 쪽은 정의에서 안 가져온다.** 정의(checks)에는
               지난 실행의 executed_at·status 가 그대로 남아 있어, 아직 안 돈
               스텝이 이미 돈 것처럼 보인다 — 실행 이벤트가 5번까지 미리
               나오던 까닭이다(지적). 이름·기대값만 정의에서 쓴다. */
            return def.map((d2, i2) => {
              const l = run2[i2]
              if (!l) return onAir ? { ...d2, mark: undefined, at: undefined, took: undefined, out: '', ran: false } : d2
              if (onAir) {
                /* **아직 안 온 스텝은 결과를 비운다.** 실행기가 보내는
                   live_steps 는 TC 정의를 통째로 복사해 만들어서, 지난 실행의
                   status·executed_at 을 처음부터 안고 온다 — 그래서 2번이
                   도는데 3·4·5번 이벤트가 옛 시각으로 떠 있었다(지적).
                   믿을 수 있는 것은 **자리 번호**뿐이다: runStep 뒤는 안 돈 것. */
                if (runStep != null && i2 > runStep)
                  return {
                    ...d2,
                    cmd: l.cmd || d2.cmd,
                    expected: l.expected !== '—' ? l.expected : d2.expected,
                    action: l.action !== '—' ? l.action : d2.action,
                    session: l.session !== '—' ? l.session : d2.session,
                    t: l.t || d2.t,
                    waitSec: l.waitSec ?? d2.waitSec,
                    out: '',
                    mark: undefined,
                    took: undefined,
                    at: undefined,
                    ran: false,
                  }
                return {
                  ...d2,
                  cmd: l.cmd || d2.cmd,
                  expected: l.expected !== '—' ? l.expected : d2.expected,
                  action: l.action !== '—' ? l.action : d2.action,
                  session: l.session !== '—' ? l.session : d2.session,
                  t: l.t || d2.t,
                  waitSec: l.waitSec ?? d2.waitSec,
                  okMsg: l.okMsg ?? d2.okMsg,
                  ngMsg: l.ngMsg ?? d2.ngMsg,
                  /* 결과 쪽은 **이번에 돈 것만**.
                     지금 도는 스텝은 아직 안 끝났다 — 판정·시각·걸린 시간을
                     비운다. 안 그러면 실행기가 복사해 온 지난 값이 그대로
                     떠서, 돌고 있는 스텝이 벌써 「기준 맞음」 이 된다(지적). */
                  out: l.out,
                  mark: i2 === runStep ? undefined : l.mark,
                  took: i2 === runStep ? undefined : l.took,
                  at: i2 === runStep ? undefined : l.at,
                  ran: i2 === runStep ? false : l.ran,
                }
              }
              return {
                ...d2,
                cmd: l.cmd || d2.cmd,
                out: l.out || d2.out,
                expected: l.expected !== '—' ? l.expected : d2.expected,
                action: l.action !== '—' ? l.action : d2.action,
                session: l.session !== '—' ? l.session : d2.session,
                t: l.t || d2.t,
                mark: l.mark,
                took: l.took ?? d2.took,
                waitSec: l.waitSec ?? d2.waitSec,
                ran: l.ran ?? d2.ran,
                at: l.at ?? d2.at,
                okMsg: l.okMsg ?? d2.okMsg,
                ngMsg: l.ngMsg ?? d2.ngMsg,
              }
            })
          })()}
          past={(() => {
            /* 지난 실행의 출력 — 콘솔이 그 위에 이어 쌓는다(지시).
               서버가 최근 두 번을 들고 있다. */
            const ps = ((log?.past ?? []) as Array<{ steps?: unknown[]; at?: string }>) ?? []
            return ps.map((p2) => ({
              at: String(p2?.at ?? ''),
              steps: ((p2?.steps ?? []) as Array<Record<string, unknown>>).map(asStep),
            }))
          })()}
          stepAt={stepAt}
          onStep={(i) => {
            setPinned(true)
            setStepAt(i)
          }}
          runStep={
            /* 붙잡는 1.6초 동안에도 **마지막 스텝**에 표시를 남긴다.
               안 그러면 목록에는 RUN 이 있는데 표에서만 잠깐 사라져,
               고쳐 놓은 어긋남이 반대로 다시 생긴다. */
            runId2 === cur
              ? runStep
              : jobLive && !pinItem && holding.current === cur && msteps.length
                ? msteps.length - 1
                : null
          }
          runItem={
            /* **판과 목록이 같은 것을 가리킨다.** 항목이 바뀔 때 판은 1.6초
               붙잡아 두는데(마지막 결과를 보라고) 목록은 안 붙잡아, 목록이
               먼저 RUN 으로 튀고 표는 뒤늦게 따라왔다(지적).
               따라가는 중이면 **판이 보고 있는 항목**을 표시한다. 사람이
               다른 항목을 눌러 고정해 두었으면 판은 딴 데를 보는 것이니,
               그때는 실행기가 실제로 도는 항목을 표시한다. */
            jobLive ? (pinItem || holding.current !== cur ? runId2 : cur) : ''
          }
          /* 대기 초읽기의 **시작 시각**. 여기서 줘야 항목을 옮겼다 와도
             이어서 센다(지적: 갔다 오면 20 부터 다시 줄어든다). */
          waitAt={
            jobLive && runId2 === cur && runStep != null
              ? (seenAt.current.step[`${runId2}|${runStep}`] ?? null)
              : null
          }
          dut={dut?.name ?? 'DUT'}
          logAt={log?.at}
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
    </div>
  )
}

/** 역할(DUT·ONU1…)에 이번 실행에서 붙일 장비를 고른다 */
