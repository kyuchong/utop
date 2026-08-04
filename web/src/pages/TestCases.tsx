import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiFetch, tcApi } from '@/api/client'
import TcForm from '@/components/TcForm'
import TcBulkForm from '@/components/TcBulkForm'
import TcSequence from '@/components/tc/TcSequence'
import TcStepDetail from '@/components/tc/TcStepDetail'
import TcTree from '@/components/tc/TcTree'
import TcSessionBar from '@/components/tc/TcSessionBar'
import TcTerminal from '@/components/tc/TcTerminal'
import TcSaveAs from '@/components/tc/TcSaveAs'
import {
  buildTcFile,
  downloadJson,
  parseTcFile,
  remapSessions,
  tcFileName,
  TcFileError,
  nextTcId,
  uniqueTcId,
} from '@/components/tc/portable'
import TcInfo from '@/components/tc/TcInfo'
import TcManual from '@/components/tc/TcManual'
import TcHistory from '@/components/tc/TcHistory'
import TcCycles from '@/components/tc/TcCycles'
import { deviceLabel } from '@/components/tc/device'
import type { Device } from '@/pages/Devices'
import Resizer, { useResizableWidth } from '@/components/Resizer'
import { type TestCaseMeta } from '@/types'
import { runSteps, type RunLog } from '@/components/tc/runner'
import {
  sessionIndex,
  stepStatus,
  type StepKind,
  type TcData,
  type TcStep,
} from '@/components/tc/types'
import './TestCases.css'

type Tab = 'steps' | 'info' | 'manual' | 'history' | 'cycle'

/** 새 스텝의 기본값. 종류마다 처음부터 채워둬야 자연스러운 값이 다르다. */
function blankStep(kind: StepKind): TcStep {
  const base: TcStep = { kind, indent: 0 }
  if (kind === 'cli' || kind === 'connect' || kind === 'disconnect' || kind === 'instrument')
    base.session = 0
  if (kind === 'wait') base.waitSec = 3
  if (kind === 'ping') base.pingCount = 4
  if (kind === 'snmp_trap') base.trapSec = 15
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
 * 3열이다 — 1열 폴더·요구사항·TC 트리 · 2열 스텝 요약 · 3열 스텝 세부.
 *
 * 1열은 요구사항 화면과 같은 트리다. 전에는 TC 89건이 평평하게 늘어선
 * 목록이었고 요구사항으로 좁히려면 위의 「요구사항」 팝업을 따로 띄워야
 * 했다 — '지금 무엇으로 좁혀져 있나' 가 목록 밖에 있었다. 좁히는 일과
 * 고르는 일은 한 자리에서 끝나야 한다.
 *
 * 전에는 TC 를 누르면 화면이 통째로 상세로 바뀌어 목록이 사라졌다. 89건을
 * 훑을 때 그것이 가장 불편했다.
 */
export default function TestCases() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('steps')
  const [openId, setOpenId] = useState('')
  const [stepIdx, setStepIdx] = useState(-1)
  const [menuOpen, setMenuOpen] = useState(false)
  /** 명령어 캡쳐를 열면 3열이 그것으로 바뀐다 — 캡쳐하는 동안 스텝 세부는 볼 일이 없다 */
  const [termOpen, setTermOpen] = useState(false)
  const [form, setForm] = useState<TestCaseMeta | null | undefined>(undefined)
  const [bulkOpen, setBulkOpen] = useState(false)
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
  // 기본값을 바꿀 때는 key 도 올린다 — 이미 저장된 옛 값이 이겨서 아무도
  // 변화를 못 본다(Resizer.tsx 주석). 3열이 남는 폭을 갖게 되면서 2열의
  // 적정 폭도 달라졌다.
  const [seqW, setSeqW] = useResizableWidth('utop.tc.seqW2', 620, 260, 1400)

  const tcQ = useQuery({
    queryKey: ['tc', 'list', 'meta'],
    queryFn: ({ signal }) => api.listTestCases(signal),
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

  const devices = useMemo(() => devQ.data?.devices ?? [], [devQ.data])

  const devById = useMemo(() => {
    const m = new Map<string, Device>()
    for (const dv of devices) if (dv.id) m.set(dv.id, dv)
    return m
  }, [devices])

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
  /** 수동 절차 몇 개인가. 탭에 숫자를 달아 두면 있는지 없는지 눌러보지 않아도 안다 */
  const manualCount = steps.filter((s) => s.kind === 'manual').length
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
  /**
   * 묻지 않고 바로 뺀다.
   *
   * 세션을 넣고 빼는 것은 자주 있는 일이라 매번 물으면 그 창을 안 읽고
   * 누르게 된다. 대신 무슨 일이 있었는지는 알린다 — 스텝의 세션이 비워진
   * 것을 모르고 넘어가면 실행할 때 가서야 안다. 잘못 뺐으면 저장 전에
   * 다시 넣으면 되고, 저장 전까지는 서버에 아무 일도 일어나지 않는다.
   */
  const removeSession = (i: number) => {
    const gone = sessionNames[i] ?? `S${i + 1}`
    const used = steps.filter((s) => sessionIndex(s.session) === i).length
    setMsg({
      kind: used ? 'err' : '',
      text: used
        ? `S${i + 1} (${gone}) 뺐습니다 — 스텝 ${used}개의 세션이 비었습니다`
        : `S${i + 1} (${gone}) 뺐습니다`,
    })
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

  /**
   * 다른 이름으로 저장 · 파일에서 가져오기.
   *
   * 둘 다 '내용은 이미 있고 새 ID 만 정하면 되는' 일이라 한 창을 쓴다.
   */
  const [saveAs, setSaveAs] = useState<{
    title: string
    id: string
    name: string
    note?: string
    data: TcData
  } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const takenIds = useMemo(() => new Set(tcs.map((t) => t.tcid)), [tcs])

  const saveAsM = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const src = saveAs?.data ?? {}
      await tcApi.save(id, { ...src, tcid: id, name, checks: src.checks ?? [] })
      return id
    },
    onSuccess: (id) => {
      setSaveAs(null)
      setDirty(false)
      setOpenId(id)
      setMsg({ kind: 'ok', text: `${id} 를 만들었습니다` })
      void qc.invalidateQueries({ queryKey: ['tc', 'list', 'meta'] })
    },
    onError: (e) => setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) }),
  })

  /** 지금 TC 를 파일로. 다른 랩의 UTOP 에서 그대로 연다. */
  const exportTc = () => {
    if (!openId) return
    downloadJson(tcFileName(d), buildTcFile({ ...d, tcid: openId }, devById))
    setMsg({ kind: 'ok', text: '파일로 내보냈습니다' })
  }

  /**
   * 파일에서 가져오기.
   *
   * 서버가 다르면 장비도 다르다. 세션이 가리키던 장비를 IP·이름·모델로
   * 찾아 이 서버 것으로 바꿔 준다. 못 찾으면 그대로 두어 세션 칩이
   * 「없는 장비」로 뜨게 한다 — 아무 장비나 붙이면 엉뚱한 곳에 명령이 나간다.
   */
  const importFile = async (file: File) => {
    try {
      const f = parseTcFile(await file.text())
      const tc = { ...f.tc }
      const sess = Array.isArray(tc.sessions) ? (tc.sessions as string[]) : []
      const { sessions: mapped, matched } = remapSessions(sess, f.session_devices, devices)
      tc.sessions = mapped

      const from = f.origin ? `${f.origin} 에서 만든 시험` : '가져온 시험'
      const dev =
        sess.length === 0
          ? '세션 없음'
          : matched === sess.length
            ? `장비 ${matched}자리 모두 이 서버 것으로 맞췄습니다`
            : `장비 ${sess.length}자리 중 ${matched}개만 찾았습니다 — 나머지는 세션에서 고르세요`
      setSaveAs({
        title: '파일에서 가져오기',
        id: uniqueTcId(String(tc.tcid ?? 'TC'), takenIds),
        name: String(tc.name ?? ''),
        note: `${from} · ${dev}`,
        data: tc,
      })
    } catch (e) {
      setMsg({
        kind: 'err',
        text: e instanceof TcFileError ? e.message : `읽지 못했습니다 — ${String(e)}`,
      })
    }
  }

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

  const error = tcQ.error

  return (
    <>
      {form !== undefined && <TcForm editing={form} onClose={() => setForm(undefined)} />}
      {bulkOpen && <TcBulkForm onClose={() => setBulkOpen(false)} />}
      {saveAs && (
        <TcSaveAs
          title={saveAs.title}
          defaultId={saveAs.id}
          defaultName={saveAs.name}
          note={saveAs.note}
          taken={takenIds}
          busy={saveAsM.isPending}
          onSubmit={(id, name) => saveAsM.mutate({ id, name })}
          onClose={() => setSaveAs(null)}
        />
      )}
      {/* 파일 고르기는 감춰 둔다 — ⋯ 메뉴가 이 칸을 대신 누른다 */}
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          // 같은 파일을 다시 골라도 change 가 뜨도록 비운다
          e.target.value = ''
          if (f) void importFile(f)
        }}
      />

      {error ? (
        <div className="load-error">
          데이터를 불러오지 못했습니다 — {(error as Error).message}
        </div>
      ) : null}

      {/* 상단 한 줄 — 어느 TC 를 보고 있는지 · 탭.
          요구사항으로 좁히는 일은 1열 트리가 맡는다. */}
      <div className="tc-bar">
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
              // '스텝' 이 아니라 Automation 이다 — 장비에 명령을 보내 자동으로
              // 도는 절차. 사람이 하는 것은 Manual Step 탭에 있다.
              ['steps', 'Automation'],
              ['info', '정보'],
              ['manual', 'Manual Step'],
              ['history', '실행 이력'],
              ['cycle', '사이클'],
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
                {k === 'manual' && manualCount > 0 && <span className="cnt">{manualCount}</span>}
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
                {/* 「⌨ 명령어 캡쳐」 는 실행 줄에 있다. 같은 것을 여기 또 두면
                    어느 쪽이 무엇인지 생각하게 된다. */}
                <hr />
                {/* 랩마다 UTOP 이 따로 서 있어서 한쪽에서 만든 시험을 다른
                    쪽에서 그대로 돌리고 싶은 일이 잦다. DB 를 통째로 옮기면
                    장비 비밀번호까지 따라가므로, 시험 하나만 파일로 뗀다. */}
                <button
                  type="button"
                  disabled={!openId}
                  onClick={() => {
                    setMenuOpen(false)
                    setSaveAs({
                      title: '다른 이름으로 저장',
                      // 같은 요구사항 묶음의 다음 번호. TC ID 앞부분이 곧
                      // 그 요구사항이라(U-REQ-SYS-HW-TC-004) 앞은 지키고
                      // 번호만 올린다.
                      id: nextTcId(openId, takenIds),
                      name: `${d.name ?? ''} 복사`.trim(),
                      data: d,
                    })
                  }}
                >
                  다른 이름으로 저장
                </button>
                <button
                  type="button"
                  disabled={!openId}
                  onClick={() => {
                    setMenuOpen(false)
                    exportTc()
                  }}
                >
                  파일로 내보내기
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    fileRef.current?.click()
                  }}
                >
                  파일에서 가져오기
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
        {/* 1열 — 폴더 · 요구사항 · TC 트리 (요구사항 화면과 같은 모양) */}
        <section className="panel tc-listcol" style={{ flexBasis: listW }}>
          <div className="tc-col-head">
            <span className="panel-name">
              TC
              <span className="muted small">{tcs.length}건</span>
            </span>
            <button className="btn small" type="button" onClick={() => setForm(null)}>
              +
            </button>
          </div>
          {tcQ.isLoading ? (
            <div className="empty">불러오는 중…</div>
          ) : (
            <TcTree tcs={tcs} openId={openId} onOpen={pickTc} />
          )}
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
            <TcInfo data={d} onChange={patch} tcid={openId} />
          </section>
        ) : tab === 'manual' ? (
          <section className="panel tc-tabcol">
            <TcManual data={d} onChange={patch} />
          </section>
        ) : tab === 'history' ? (
          <section className="panel tc-tabcol">
            <TcHistory tcid={openId} />
          </section>
        ) : tab === 'cycle' ? (
          <section className="panel tc-tabcol">
            <TcCycles tcid={openId} />
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
                {/* 스텝을 손으로 만들지 않고 쳐서 만드는 길. ⋯ 안에 숨기면
                    처음 오는 사람이 못 찾는다 — 여기가 그 사람의 첫 30초다. */}
                <button
                  className={`btn small${termOpen ? ' primary' : ''}`}
                  type="button"
                  title="장비에 붙어 명령을 치면 그대로 스텝이 됩니다"
                  onClick={() => setTermOpen((v) => !v)}
                >
                  ⌨ 명령어 캡쳐
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

            {/* 3열 — 스텝 세부, 또는 캡쳐하는 동안은 명령어 캡쳐 */}
            <section className={`panel tc-detcol${termOpen ? ' wide' : ''}`}>
              {termOpen ? (
                <TcTerminal
                  sessions={sessionIds}
                  devById={devById}
                  sessionNames={sessionNames}
                  onAdd={(s) => {
                    // 함수형으로 붙인다. 기록 중에는 명령이 잇달아 들어와서
                    // 닫힌 값을 쓰면 앞 스텝이 뒤 스텝에 덮인다.
                    setD((c) => ({ ...c, checks: [...((c.checks ?? []) as TcStep[]), s] }))
                    setDirty(true)
                  }}
                  onClose={() => setTermOpen(false)}
                />
              ) : (
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
              )}
            </section>
          </>
        )}
      </div>
    </>
  )
}
