import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import type { CycleMeta, CycleStep } from '@/pages/Cycles'
import type { TestCaseMeta } from '@/types'
import RunAuto from './RunAuto'
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
const RESN: Record<Verdict, string> = { p: 'Pass', f: 'Fail', b: '기타', n: '미실행' }

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
  meta?: Record<string, string>
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
function manualSteps(tc?: Record<string, unknown>): Array<{ t: string; e: string }> {
  const steps = (tc?.steps as CycleStep[] | undefined) ?? []
  const man = steps
    .filter((s) => s.manual || s.action === '수동' || s.step || s.expected)
    .map((s) => ({
      t: String(s.step ?? s.desc ?? '').trim(),
      e: String(s.expected ?? s.criteria ?? '').trim(),
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

function donutPath(pct: number) {
  const R = 38
  const C = 2 * Math.PI * R
  return { R, C, off: C * (1 - pct / 100) }
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
  const [autoNext, setAutoNext] = useState(true)
  const [bindOpen, setBindOpen] = useState(false)

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
  const ids = useMemo(() => Object.keys(results), [results])
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
  const isAuto = String(meta?.run_type ?? meta?.kind ?? '자동') !== '수동'

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
    /* 절차 판정에서 항목 결과를 뽑는다 — 하나라도 실패면 실패 */
    const n = manualSteps(oneQ.data).length
    const roll: Verdict = arr.includes('f')
      ? 'f'
      : arr.includes('b')
        ? 'b'
        : arr.filter((x) => x === 'p').length >= n
          ? 'p'
          : 'n'
    await save({ pchk, results: { ...results, [cid]: roll } })
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
  const d = donutPath(pct)
  const note = (run.notes ?? {})[cur] ?? ''
  const pv = (run.pchk ?? {})[cur] ?? []
  const msteps = manualSteps(oneQ.data)
  const marked = pv.filter(Boolean).length
  const log = (run.logs ?? {})[cur]
  const i = ids.indexOf(cur)

  return (
    <div className="rd">
      {/* ── 머리줄 ── */}
      <div className="rd-bar">
        <button type="button" className="rd-home" onClick={onBack}>
          ← {run.version || '목록'}
        </button>
        <span className="rd-key">{run.id}</span>
        <span className={`rd-mode ${isAuto ? 'a' : 'm'}`}>{isAuto ? '⚙ 자동' : '👆 수동'}</span>
        {plan && (
          <>
            <span className="rd-sep">·</span>
            <span className="rd-plan">플랜 {plan.cid || plan.id}</span>
          </>
        )}
        <span className="rd-sp" />
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

      {/* ── 요약 띠 ── */}
      <div className="rd-strip">
        <svg viewBox="0 0 100 100" width="64" height="64" aria-hidden="true">
          <circle cx="50" cy="50" r={d.R} fill="none" stroke="#dbe4e6" strokeWidth="12" />
          <circle
            cx="50" cy="50" r={d.R} fill="none" stroke="#12a678" strokeWidth="12" strokeLinecap="round"
            strokeDasharray={d.C} strokeDashoffset={d.off} transform="rotate(-90 50 50)"
          />
          <text x="50" y="52" textAnchor="middle" className="rd-dn">{pct}%</text>
          <text x="50" y="63" textAnchor="middle" className="rd-dl">COMPLETE</text>
        </svg>
        <div className="rd-tal">
          <span className="rd-res p">Pass {tally.p}</span>
          <span className="rd-res f">Fail {tally.f}</span>
          <span className="rd-res b">기타 {tally.b}</span>
          <span className="rd-res n">미실행 {tally.n}</span>
          <em>{tally.total}개 중 {tally.done}개</em>
        </div>
        <div className="rd-meta">
          <b>{run.name || run.id}</b>
          <span>
            {[plan?.customer, plan?.model, run.version, dut ? `${dut.name} ${dut.ip ?? ''}` : '']
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
        <span className="rd-sp" />
        <span className="rd-chip">🔒 플랜에서 복사한 시점 고정</span>
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
        <div className="rd-view manual">
          {/* ── 왼쪽: 대상 세션 + 항목 ── */}
          <aside className="rd-side">
            <div className="rd-h">대상 장비</div>
            <div className="rd-sess">
              {Object.keys(binds).length ? (
                Object.entries(binds).map(([role, id]) => {
                  const dv = devById.get(String(id))
                  return (
                    <div className="rd-srow" key={role}>
                      <span className="rd-role">{role}</span>
                      <span className="rd-ell">{dv?.name ?? '미배정'}</span>
                      <span className="rd-ip">{dv?.ip ?? '–'}</span>
                    </div>
                  )
                })
              ) : (
                <div className="rd-muted">아직 장비를 안 붙였습니다</div>
              )}
            </div>
            <div className="rd-h">
              시험 항목 <span className="rd-muted">{tally.total}</span>
            </div>
            <div className="rd-items">
              {ids.map((id) => {
                const t = tcById.get(id)
                const k = results[id] ?? 'n'
                return (
                  <button
                    type="button"
                    key={id}
                    className={`rd-item${id === cur ? ' on' : ''}`}
                    onClick={() => {
                      setCur(id)
                      setStepAt(0)
                    }}
                  >
                    <span className="rd-ell">{t?.name ?? id}</span>
                    <i className={`rd-res ${k}`}>{RESN[k]}</i>
                  </button>
                )
              })}
            </div>
          </aside>

            /* ── 수동: 절차마다 판정 ── */
            <section className="rd-main">
              <div className="rd-h2">
                {cur} · {meta?.name ?? ''}
                <span className="rd-sp" />
                <span className="rd-muted">
                  절차 판정 {marked} / {msteps.length}
                </span>
                <button
                  type="button"
                  className="rd-btn"
                  onClick={() =>
                    void save({
                      pchk: { ...(run.pchk ?? {}), [cur]: Array(msteps.length).fill('p') },
                      results: { ...results, [cur]: 'p' },
                    })
                  }
                >
                  전부 통과
                </button>
              </div>
              <div className="rd-procs">
                <div className="rd-phd">
                  <span>#</span>
                  <span>절차</span>
                  <span>기대 결과</span>
                  <span>판정</span>
                </div>
                {msteps.map((x, ix) => {
                  const v = pv[ix] ?? ''
                  return (
                    <div className={`rd-proc${v ? ` v-${v}` : ''}`} key={ix}>
                      <span className="rd-no">{ix + 1}</span>
                      <span>{x.t}</span>
                      <span className="rd-exp">{x.e}</span>
                      <span className="rd-pb">
                        {(['p', 'f', 'b'] as const).map((o) => (
                          <button
                            type="button"
                            key={o}
                            className={`rd-vb ${o}${v === o ? ' on' : ''}`}
                            onClick={() => void setProc(cur, ix, o)}
                          >
                            {o === 'p' ? '통과' : o === 'f' ? '실패' : '기타'}
                          </button>
                        ))}
                      </span>
                    </div>
                  )
                })}
              </div>
              <div className="rd-note">
                <div className="rd-h">비고 · 특이사항</div>
                <textarea
                  className="rd-ta"
                  defaultValue={note}
                  key={`m-${cur}`}
                  placeholder="결과서의 비고 칸에 그대로 들어갑니다"
                  onBlur={(e) => {
                    if (e.target.value === note) return
                    void save({ notes: { ...(run.notes ?? {}), [cur]: e.target.value } })
                  }}
                />
              </div>
              <div className="rd-foot">
                {(['p', 'f', 'b', 'n'] as Verdict[]).map((v) => (
                  <button
                    type="button"
                    key={v}
                    className={`rd-mb ${v}${(results[cur] ?? 'n') === v ? ' on' : ''}`}
                    onClick={() => void setResult(cur, v)}
                  >
                    {RESN[v]}
                  </button>
                ))}
                <label className="rd-next">
                  <input type="checkbox" checked={autoNext} onChange={(e) => setAutoNext(e.target.checked)} />
                  판정 후 다음 항목으로
                </label>
                <span className="rd-sp" />
                <button type="button" className="rd-btn" disabled={i <= 0} onClick={() => setCur(ids[i - 1]!)}>
                  ‹
                </button>
                <span className="rd-muted">
                  {i + 1} / {ids.length}
                </span>
                <button
                  type="button"
                  className="rd-btn"
                  disabled={i >= ids.length - 1}
                  onClick={() => setCur(ids[i + 1]!)}
                >
                  ›
                </button>
              </div>
            </section>
        </div>
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
