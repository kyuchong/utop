import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiFetch, tcApi } from '@/api/client'
import TcForm from '@/components/TcForm'
import TcBulkForm from '@/components/TcBulkForm'
import TcSequence from '@/components/tc/TcSequence'
import TcStepDetail from '@/components/tc/TcStepDetail'
import ReqPicker from '@/components/tc/ReqPicker'
import TcSessionBar from '@/components/tc/TcSessionBar'
import TcInfo from '@/components/tc/TcInfo'
import TcHistory from '@/components/tc/TcHistory'
import { deviceLabel } from '@/components/tc/device'
import type { Device } from '@/pages/Devices'
import Resizer, { useResizableWidth } from '@/components/Resizer'
import { reqLabel, reqPk, statusClass, type Requirement, type TestCaseMeta } from '@/types'
import { runSteps, type RunLog } from '@/components/tc/runner'
import {
  sessionIndex,
  stepStatus,
  type StepKind,
  type TcData,
  type TcStep,
} from '@/components/tc/types'
import './TestCases.css'

type Tab = 'steps' | 'info' | 'history'

/** 새 스텝의 기본값. 종류마다 처음부터 채워둬야 자연스러운 값이 다르다. */
function blankStep(kind: StepKind): TcStep {
  const base: TcStep = { kind, indent: 0 }
  if (kind === 'cli' || kind === 'connect' || kind === 'disconnect' || kind === 'instrument')
    base.session = 0
  if (kind === 'wait') base.waitSec = 3
  if (kind === 'loop') {
    base.forFrom = 1
    base.forTo = 10
    base.loopVar = 'i'
  }
  return base
}

/**
 * 테스트케이스 화면.
 *
 * 3열이다 — 1열 TC 목록 · 2열 스텝 요약 · 3열 스텝 세부.
 * 요구사항은 왼쪽에 상주시키지 않고 위 「요구사항」 버튼으로 띄운다. 스텝을
 * 쓰는 동안은 트리를 쓸 일이 없는데 폭만 먹기 때문이다.
 *
 * 전에는 TC 를 누르면 화면이 통째로 상세로 바뀌어 목록이 사라졌다. 89건을
 * 훑을 때 그것이 가장 불편했다.
 */
export default function TestCases() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('steps')
  const [openId, setOpenId] = useState('')
  const [stepIdx, setStepIdx] = useState(-1)
  const [reqFilter, setReqFilter] = useState<string | null>(null)
  const [reqOpen, setReqOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [form, setForm] = useState<TestCaseMeta | null | undefined>(undefined)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState<{ kind: string; text: string }>({ kind: '', text: '' })

  // 편집 중인 TC 전체. 목록의 메타가 아니라 스텝까지 든 원본이다.
  const [d, setD] = useState<TcData>({})
  const [dirty, setDirty] = useState(false)

  const [running, setRunning] = useState(false)
  /** 지금 돌고 있는 줄. -1 이면 안 돌고 있다 */
  const [runAt, setRunAt] = useState(-1)
  const [runLog, setRunLog] = useState<RunLog[]>([])

  const splitRef = useRef<HTMLDivElement>(null)
  const [listW, setListW] = useResizableWidth('utop.tc.listW', 250, 170, 460)
  const [seqW, setSeqW] = useResizableWidth('utop.tc.seqW', 560, 340, 1100)

  const tcQ = useQuery({
    queryKey: ['tc', 'list', 'meta'],
    queryFn: ({ signal }) => api.listTestCases(signal),
  })
  const reqQ = useQuery({
    queryKey: ['req', 'list'],
    queryFn: ({ signal }) => api.listRequirements(signal),
  })

  // 세션이 장비 id 로 저장돼 있어 이름을 붙이려면 장비 목록이 필요하다.
  const devQ = useQuery({
    queryKey: ['devices2'],
    queryFn: async () => {
      const r = await apiFetch('/api/devices2')
      if (!r.ok) throw new Error('장비 목록을 불러오지 못했습니다')
      return (await r.json()) as { devices?: Device[] }
    },
    staleTime: 60_000,
  })

  const tcs = tcQ.data?.tcs ?? []
  const reqs = reqQ.data?.reqs ?? []

  const devices = useMemo(() => devQ.data?.devices ?? [], [devQ.data])

  const devById = useMemo(() => {
    const m = new Map<string, Device>()
    for (const dv of devices) if (dv.id) m.set(dv.id, dv)
    return m
  }, [devices])

  const reqByKey = useMemo(() => {
    const m = new Map<string, Requirement>()
    for (const r of reqs) {
      m.set(reqPk(r), r)
      const l = reqLabel(r)
      if (l) m.set(l, r)
    }
    return m
  }, [reqs])

  const curReq = reqFilter ? reqByKey.get(reqFilter) : undefined

  /**
   * 요구사항 필터. tc.req_id 에 PK 가 들었는지 이름표가 들었는지 자료마다
   * 달라서 둘 다로 맞춘다 (Requirements.tsx 에 같은 사정이 적혀 있다).
   */
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const label = curReq ? reqLabel(curReq) : ''
    return tcs.filter((t) => {
      if (reqFilter) {
        const k = (t.req_id || '').trim()
        if (k !== reqFilter && (!label || k !== label)) return false
      }
      if (!needle) return true
      return (
        t.tcid.toLowerCase().includes(needle) ||
        (t.name ?? '').toLowerCase().includes(needle) ||
        (t.type ?? '').toLowerCase().includes(needle)
      )
    })
  }, [tcs, q, reqFilter, curReq])

  // 고른 TC 의 원본을 따로 읽는다 — 목록 응답에는 스텝이 빠져 있다.
  const fullQ = useQuery({
    queryKey: ['tc', openId],
    enabled: !!openId,
    queryFn: async () => {
      const r = await apiFetch(`/api/tc/${encodeURIComponent(openId)}`)
      if (!r.ok) throw new Error('TC 를 불러오지 못했습니다')
      return (await r.json()) as TcData
    },
  })

  useEffect(() => {
    if (fullQ.data) {
      setD(fullQ.data)
      setDirty(false)
      setStepIdx(-1)
    }
  }, [fullQ.data])

  const steps = (d.checks ?? []) as TcStep[]
  /**
   * 이 TC 가 쓰는 세션. 자료에는 `sessions: ["dev-…"]` 처럼 장비 id 배열이
   * 들어 있고, 스텝의 session 은 그 배열의 자리 번호다.
   * 화면에는 장비 이름을 보여야 하므로 여기서 이름으로 바꿔 넘긴다.
   */
  const sessionIds = Array.isArray(d.sessions) ? (d.sessions as string[]) : []
  const sessionNames = sessionIds.map((id, i) => {
    const dev = devById.get(id)
    return dev ? deviceLabel(dev) : `세션 ${i + 1}`
  })
  const sessionName = (i: number) => (i >= 0 ? (sessionNames[i] ?? `세션 ${i + 1}`) : '')

  const patch = (p: Partial<TcData>) => {
    setD((c) => ({ ...c, ...p }))
    setDirty(true)
  }

  /**
   * 스텝 한 줄 고치기.
   *
   * 최신 상태에서 갈아끼운다. 화면에서 손으로 고칠 때는 차이가 없지만,
   * 실행 중에는 스텝 결과가 잇달아 들어와서 닫힌 값(steps)을 쓰면 앞의
   * 결과가 뒤 결과에 덮여 사라진다.
   */
  const patchStep = (i: number, p: Partial<TcStep>) => {
    setD((c) => {
      const arr = (c.checks ?? []) as TcStep[]
      return { ...c, checks: arr.map((s, j) => (j === i ? { ...s, ...p } : s)) }
    })
    setDirty(true)
  }

  const addStep = (kind: StepKind) => {
    const next = [...steps, blankStep(kind)]
    patch({ checks: next })
    setStepIdx(next.length - 1)
  }

  const moveStep = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= steps.length) return
    const next = [...steps]
    const a = next[i]!
    next[i] = next[j]!
    next[j] = a
    patch({ checks: next })
    setStepIdx(j)
  }

  const setSessions = (next: string[], p?: Partial<TcData>) =>
    patch({ sessions: next, ...(p ?? {}) })

  /**
   * 세션 자리를 뺀다.
   *
   * 스텝은 장비가 아니라 **자리 번호**를 들고 있어서, 자리를 빼면 뒤쪽
   * 번호가 하나씩 당겨진다. 스텝을 그대로 두면 다음에 저장하는 순간
   * 조용히 옆 장비로 명령이 나간다 — 옛 화면이 실제로 그랬다.
   */
  const removeSession = (i: number) => {
    const gone = sessionNames[i] ?? `S${i + 1}`
    const used = steps.filter((s) => sessionIndex(s.session) === i).length
    const msg = used
      ? `S${i + 1} (${gone}) 을 뺍니다.\n이 세션을 쓰는 스텝 ${used}개는 세션이 비워집니다.\n계속할까요?`
      : `S${i + 1} (${gone}) 을 뺄까요?`
    if (!window.confirm(msg)) return
    setSessions(
      sessionIds.filter((_, j) => j !== i),
      {
        checks: steps.map((s) => {
          const k = sessionIndex(s.session)
          if (k < 0) return s
          if (k === i) return { ...s, session: '' }
          return k > i ? { ...s, session: k - 1 } : s
        }),
      },
    )
  }

  const removeStep = (i: number) => {
    if (!window.confirm(`스텝 ${i + 1} 을 지웁니다. 계속할까요?`)) return
    patch({ checks: steps.filter((_, j) => j !== i) })
    setStepIdx(-1)
  }

  const saveM = useMutation({
    mutationFn: async () => {
      // checks 를 항상 함께 보낸다. 빠지면 서버가 옛 값을 되살려
      // 방금 지운 스텝이 다시 나타난다(main.py 의 보존 장치).
      await tcApi.save(openId, { ...d, checks: d.checks ?? [] })
    },
    onSuccess: () => {
      setDirty(false)
      setMsg({ kind: 'ok', text: '저장했습니다' })
      void qc.invalidateQueries({ queryKey: ['tc', openId] })
      void qc.invalidateQueries({ queryKey: ['tc', 'list', 'meta'] })
    },
    onError: (e) => setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) }),
  })

  const pickTc = (id: string) => {
    if (dirty && !window.confirm('저장하지 않은 변경이 있습니다. 옮길까요?')) return
    setOpenId(id)
    setMsg({ kind: '', text: '' })
  }

  const runStat = useMemo(() => {
    let pass = 0
    let fail = 0
    for (const s of steps) {
      const v = stepStatus(s)
      if (v === 'PASS') pass++
      else if (v === 'FAIL') fail++
    }
    return { pass, fail, done: pass + fail }
  }, [steps])

  /**
   * 실행.
   *
   * 스텝을 쓰면서 그 자리에서 돌려보는 것이 이 화면의 요점이라, TC Cycle 의
   * 배치 실행(backend/engine.py)과는 다른 길로 간다 — 여기서는 스텝 하나가
   * 끝날 때마다 결과가 그 줄에 바로 박힌다.
   */
  const runAbort = useRef<AbortController | null>(null)

  const doRun = async (from: number, only: boolean) => {
    if (running) return
    if (sessionIds.length === 0) {
      setMsg({ kind: 'err', text: '세션이 없습니다 — 「+ 세션」 으로 장비를 넣으세요' })
      return
    }
    const ac = new AbortController()
    runAbort.current = ac
    setRunning(true)
    setRunLog([])
    setMsg({ kind: '', text: only ? '스텝 실행 중…' : '실행 중…' })
    const began = Date.now()
    try {
      const r = await runSteps(
        {
          steps,
          sessions: sessionIds,
          devById,
          onStep: patchStep,
          onAt: setRunAt,
          onLog: (l) => setRunLog((v) => [...v.slice(-400), l]),
          signal: ac.signal,
        },
        from,
        only,
      )
      setMsg({
        kind: r.fail > 0 ? 'err' : 'ok',
        text: `${r.stopped ? '중지됨 · ' : ''}PASS ${r.pass} · FAIL ${r.fail}`,
      })
      // 실행 이력은 전체 실행만 남긴다. 한 줄씩 돌려보는 것까지 쌓으면
      // 이력이 편집 기록이 되어 '언제 통째로 돌렸나' 를 못 찾는다.
      if (!only && !r.stopped) {
        void apiFetch(`/api/tc/${encodeURIComponent(openId)}/run-history`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            at: new Date().toISOString(),
            pass: r.pass,
            fail: r.fail,
            sec: Math.round((Date.now() - began) / 1000),
            sessions: sessionNames,
          }),
        })
          .then(() => qc.invalidateQueries({ queryKey: ['tc', openId, 'run-history'] }))
          .catch((e) => console.warn('[TestCases.doRun] 이력 저장 실패:', e))
      }
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setRunning(false)
      setRunAt(-1)
      runAbort.current = null
    }
  }

  const error = tcQ.error ?? reqQ.error

  return (
    <>
      {form !== undefined && <TcForm editing={form} onClose={() => setForm(undefined)} />}
      {bulkOpen && <TcBulkForm onClose={() => setBulkOpen(false)} />}
      {reqOpen && (
        <ReqPicker selected={reqFilter} onPick={setReqFilter} onClose={() => setReqOpen(false)} />
      )}

      {error ? (
        <div className="load-error">
          데이터를 불러오지 못했습니다 — {(error as Error).message}
        </div>
      ) : null}

      {/* 상단 한 줄 — 어느 TC 를 보고 있는지 · 요구사항 필터 · 탭 */}
      <div className="tc-bar">
        <button
          className={`btn tc-reqbtn${reqFilter ? ' on' : ''}`}
          type="button"
          onClick={() => setReqOpen(true)}
          title="요구사항으로 TC 를 좁힙니다"
        >
          요구사항
          {curReq && <b> · {reqLabel(curReq)}</b>}
        </button>
        {reqFilter && (
          <button
            className="tc-reqx"
            type="button"
            onClick={() => setReqFilter(null)}
            aria-label="요구사항 필터 해제"
          >
            ×
          </button>
        )}

        <span className="tc-bar-ttl">
          {openId ? (
            <>
              <b>{d.name || '(제목 없음)'}</b>
              <span className="muted small"> {openId}</span>
            </>
          ) : (
            <span className="muted">왼쪽에서 테스트케이스를 고르세요</span>
          )}
        </span>

        {openId && (
          <div className="seg" role="tablist">
            {([
              ['steps', '스텝'],
              ['info', '정보'],
              ['history', '이력'],
            ] as const).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                className={`seg-btn${tab === k ? ' on' : ''}`}
                onClick={() => setTab(k)}
              >
                {label}
                {k === 'steps' && steps.length > 0 && <span className="cnt">{steps.length}</span>}
              </button>
            ))}
          </div>
        )}

        <span className="sp" />
        {msg.text && <span className={`muted small ${msg.kind}`}>{msg.text}</span>}

        {/* ⋯ — 자주 안 쓰는 것은 접어 둔다 */}
        <div className="tc-more">
          <button
            className="btn tc-dots"
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            ⋯
          </button>
          {menuOpen && (
            <>
              <div className="tc-menu-back" onClick={() => setMenuOpen(false)} />
              <div className="tc-menu" role="menu">
                <button type="button" disabled={!openId}>
                  ✨ AI 로 만들기
                </button>
                <button type="button" disabled={!openId}>
                  ⌨ 터미널에서 따오기
                </button>
                <hr />
                <button type="button" onClick={() => { setMenuOpen(false); setBulkOpen(true) }}>
                  일괄 생성
                </button>
                <button type="button" onClick={() => { setMenuOpen(false); setForm(null) }}>
                  + Test Case
                </button>
              </div>
            </>
          )}
        </div>
        {openId && (
          <button
            className="btn primary"
            type="button"
            disabled={saveM.isPending || !dirty}
            onClick={() => saveM.mutate()}
          >
            {saveM.isPending ? '저장 중…' : dirty ? '저장' : '저장됨'}
          </button>
        )}
      </div>

      <div className="split tc-split" ref={splitRef}>
        {/* 1열 — TC 목록 */}
        <section className="panel tc-listcol" style={{ flexBasis: listW }}>
          <div className="tc-col-head">
            <span className="panel-name">
              TC
              <span className="muted small">
                {shown.length === tcs.length ? `${tcs.length}건` : `${shown.length} / ${tcs.length}건`}
              </span>
            </span>
            <button className="btn small" type="button" onClick={() => setForm(null)}>
              +
            </button>
          </div>
          <div className="tc-search">
            <input
              placeholder="TC ID · 제목 검색"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="scroll">
            {tcQ.isLoading ? (
              <div className="empty">불러오는 중…</div>
            ) : shown.length === 0 ? (
              <div className="empty">
                {reqFilter ? '이 요구사항에 달린 TC 가 없습니다.' : '조건에 맞는 TC 가 없습니다.'}
              </div>
            ) : (
              shown.map((t) => (
                <button
                  key={t.tcid}
                  type="button"
                  className={`tc-item${openId === t.tcid ? ' on' : ''}`}
                  onClick={() => pickTc(t.tcid)}
                >
                  <span className={`tc-dot ${statusClass(t.status)}`} />
                  <span className="tc-item-txt">
                    <b>{t.name || '(제목 없음)'}</b>
                    <span className="muted small">{t.tcid}</span>
                  </span>
                  {typeof t._cli_count === 'number' && t._cli_count > 0 && (
                    <span className="tc-item-n">{t._cli_count}</span>
                  )}
                </button>
              ))
            )}
          </div>
        </section>

        <Resizer
          label="TC 목록 폭 조절"
          onResize={setListW}
          getOrigin={() => splitRef.current?.getBoundingClientRect().left ?? 0}
        />

        {!openId ? (
          <section className="panel">
            <div className="empty">왼쪽에서 테스트케이스를 고르세요.</div>
          </section>
        ) : tab === 'info' ? (
          <section className="panel tc-tabcol">
            <TcInfo data={d} onChange={patch} />
          </section>
        ) : tab === 'history' ? (
          <section className="panel tc-tabcol">
            <TcHistory tcid={openId} />
          </section>
        ) : (
          <>
            {/* 2열 — 스텝 요약 */}
            <section className="panel tc-seqcol" style={{ flexBasis: seqW }}>
              <div className="tc-run">
                <button
                  className="btn small primary"
                  type="button"
                  disabled={running || steps.length === 0}
                  title="처음부터 끝까지 돌립니다"
                  onClick={() => void doRun(0, false)}
                >
                  ▶ 전체
                </button>
                <button
                  className="btn small"
                  type="button"
                  disabled={running || stepIdx < 0}
                  title="고른 줄부터 끝까지"
                  onClick={() => void doRun(stepIdx, false)}
                >
                  ▶ 여기부터
                </button>
                <button
                  className="btn small danger"
                  type="button"
                  disabled={!running}
                  title="중지"
                  onClick={() => runAbort.current?.abort()}
                >
                  ⏹
                </button>
                <TcSessionBar
                  sessions={sessionIds}
                  devices={devices}
                  onAdd={(id) => setSessions([...sessionIds, id])}
                  onPick={(i, id) => setSessions(sessionIds.map((v, j) => (j === i ? id : v)))}
                  onRemove={removeSession}
                  onMsg={(kind, text) => setMsg({ kind, text })}
                />
                <span className="sp" />
                {runStat.done > 0 && (
                  <span className="muted small">
                    {runStat.done}/{steps.length} ·{' '}
                    <b className="status pass">PASS {runStat.pass}</b> ·{' '}
                    <b className="status fail">FAIL {runStat.fail}</b>
                  </span>
                )}
              </div>
              {fullQ.isLoading ? (
                <div className="empty">불러오는 중…</div>
              ) : (
                <TcSequence
                  steps={steps}
                  selected={stepIdx}
                  onSelect={setStepIdx}
                  onAdd={addStep}
                  sessionName={sessionName}
                  runningAt={runAt}
                  onRun={running ? undefined : (i) => void doRun(i, true)}
                />
              )}
              {runLog.length > 0 && (
                <div className="tc-runlog">
                  {runLog.slice(-6).map((l, i) => (
                    <div className={`rl ${l.kind}`} key={i}>
                      <span className="rl-n">{l.i + 1}</span>
                      {l.text}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <Resizer
              label="스텝 목록 폭 조절"
              onResize={setSeqW}
              getOrigin={() => {
                const el = splitRef.current
                if (!el) return 0
                return el.getBoundingClientRect().left + listW + 6
              }}
            />

            {/* 3열 — 스텝 세부 */}
            <section className="panel tc-detcol">
              <TcStepDetail
                step={stepIdx >= 0 ? (steps[stepIdx] ?? null) : null}
                index={stepIdx}
                total={steps.length}
                sessions={sessionNames}
                onChange={(p) => stepIdx >= 0 && patchStep(stepIdx, p)}
                onMove={(dir) => stepIdx >= 0 && moveStep(stepIdx, dir)}
                onRemove={() => stepIdx >= 0 && removeStep(stepIdx)}
                onRun={running || stepIdx < 0 ? undefined : () => void doRun(stepIdx, true)}
              />
            </section>
          </>
        )}
      </div>
    </>
  )
}
