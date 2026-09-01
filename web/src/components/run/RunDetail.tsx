import { useEffect, useMemo, useState } from 'react'
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
const RESN2: Record<Verdict, string> = { p: 'PASS', f: 'FAIL', b: 'BLOCKED', n: 'WAIT' }

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
  if (man.length) return man
  const crit = String(tc?.criteria ?? '') || '기대한 값이 나옵니다'
  return [
    { t: '대상 장비 세션 접속', e: '프롬프트가 뜨고 명령을 받을 수 있습니다' },
    { t: String(tc?.name ?? '시험') + ' 절차를 수행', e: crit },
    { t: '출력값 확인', e: '기대한 값이 나오고 오류 메시지가 없습니다' },
    { t: '설정 원복 · 증적 저장', e: '변경한 설정을 되돌리고 화면·로그를 남깁니다' },
  ]
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
        {run.started_at && (
          <span className="rd-run">
            <i />
            RUNNING
          </span>
        )}
        <span className="rd-sp" />
        {run.started_at ? (
          <button
            type="button"
            className="rd-btn"
            title="시험을 멈춥니다 — 남긴 결과는 그대로입니다"
            onClick={() => void save({ started_at: null })}
          >
            ■ 중지
          </button>
        ) : (
          <button
            type="button"
            className="rd-btn go"
            title="시험을 시작합니다 — 시작 시각과 실행자를 남깁니다"
            onClick={() => void save({ started_at: new Date().toISOString(), runner: run.owner ?? '' })}
          >
            ▶ 시험 시작
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
          <div className="rd-lab">지금 결과</div>
          <b className={`rd-res ${results[cur] ?? 'n'}`}>{RESN2[results[cur] ?? 'n']}</b>
          <div className="rd-sub">{dut ? `${dut.name} · ${dut.ip ?? ''}` : '장비 미배정'}</div>
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
              group: String(t2?.req_id ?? '기타'),
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
