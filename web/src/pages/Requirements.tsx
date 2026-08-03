import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, categoryApi, reqApi, tcApi } from '@/api/client'
import ReqTree from '@/components/ReqTree'
import ReqForm from '@/components/ReqForm'
import Resizer, { useResizableWidth } from '@/components/Resizer'
import ReqBulkForm from '@/components/ReqBulkForm'
import TcForm from '@/components/TcForm'
import ReqDetail from '@/components/ReqDetail'
import TcLinkForm from '@/components/TcLinkForm'
import TcBulkForm from '@/components/TcBulkForm'
import {
  reqLabel,
  reqPk,
  statusClass,
  type Requirement,
  type TestCaseMeta,
} from '@/types'
import './Requirements.css'

/**
 * REQ ↔ TC 연결 화면.
 *
 * 연결 관계의 정본은 두 군데에 있다:
 *   - TC 쪽의 req_id  (PG tc.req_id 컬럼, db.py:_tc_meta)
 *   - REQ 쪽의 tc[]   (PG req.data->'tc', main.py:2074 가 참조로 축약)
 * 둘이 어긋난 데이터가 실제로 있을 수 있어 합집합으로 본다.
 * 어느 쪽에만 있는지는 행에 표시해 준다.
 */
export default function Requirements() {
  const [selected, setSelected] = useState<string | null>(null)
  // 여러 건을 골라 한 번에 지우기
  const [picked, setPicked] = useState<Set<string>>(new Set())
  /** 고른 폴더. 요구사항과 함께 지울 수 있어야 정리가 한 번에 끝난다. */
  const [pickedFolders, setPickedFolders] = useState<Set<string>>(new Set())
  /** 버튼 줄에서 트리에게 보내는 신호 (숫자가 늘면 트리가 반응한다) */
  const [addFolder, setAddFolder] = useState(0)
  // undefined = 폼 닫힘 / null = 새로 만들기 / Requirement = 편집
  const [form, setForm] = useState<Requirement | null | undefined>(undefined)
  const [bulkOpen, setBulkOpen] = useState(false)
  // undefined = 닫힘 / { } = 새 TC(요구사항 미리 연결)
  const [tcForm, setTcForm] = useState<{ reqId: string } | undefined>(undefined)
  const [tcLinkOpen, setTcLinkOpen] = useState(false)
  const [tcBulkOpen, setTcBulkOpen] = useState(false)
  const [tab, setTab] = useState<'info' | 'detail' | 'tc' | 'runs' | 'history'>('info')
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // 패널 폭은 사람마다 선호가 다르다. 드래그로 맞추고 브라우저에 기억시킨다.
  const splitRef = useRef<HTMLDivElement>(null)
  const [catW, setCatW] = useResizableWidth('utop.req.catW3', 230, 150, 460)

  const qc = useQueryClient()

  const removeManyM = useMutation({
    mutationFn: async ({ reqIds, folderIds }: { reqIds: string[]; folderIds: string[] }) => {
      // 순차 삭제. 한꺼번에 던지면 어디까지 지워졌는지 알 수 없어
      // 실패했을 때 무엇을 다시 시도해야 하는지 말해줄 수 없다.
      let ok = 0
      for (const id of reqIds) {
        await reqApi.remove(id)
        ok++
      }
      // 폴더는 나중에. 요구사항을 먼저 지워야 '안에 든 것' 셈이 맞는다.
      // 조상을 지우면 자손은 CASCADE 로 함께 사라져 404 가 날 수 있어 넘긴다.
      for (const id of folderIds) {
        try {
          await categoryApi.remove(id)
          ok++
        } catch (e) {
          if (!(e instanceof Error) || !e.message.includes('찾을 수 없')) throw e
        }
      }
      return ok
    },
    onSuccess: () => {
      setPicked(new Set())
      setPickedFolders(new Set())
      void qc.invalidateQueries({ queryKey: ['req', 'list'] })
      void qc.invalidateQueries({ queryKey: ['req-categories'] })
      void qc.invalidateQueries({ queryKey: ['tc', 'list', 'meta'] })
    },
  })

  const reqQ = useQuery({
    queryKey: ['req', 'list'],
    queryFn: ({ signal }) => api.listRequirements(signal),
  })
  const tcQ = useQuery({
    queryKey: ['tc', 'list', 'meta'],
    queryFn: ({ signal }) => api.listTestCases(signal),
  })

  const allReqs = reqQ.data?.reqs ?? []
  const tcs = tcQ.data?.tcs ?? []

  /** req_id → TC[] (TC 쪽 포인터 기준) */
  const tcsByReq = useMemo(() => {
    const m = new Map<string, TestCaseMeta[]>()
    for (const t of tcs) {
      const k = (t.req_id || '').trim()
      if (!k) continue
      const arr = m.get(k)
      if (arr) arr.push(t)
      else m.set(k, [t])
    }
    return m
  }, [tcs])

  /**
   * 이 요구사항을 가리키는 TC 들.
   *
   * tc.req_id 에 무엇이 들어 있는지가 데이터마다 다르다 —
   * 예전 데이터는 PK 와 reqid 가 같은 값이었지만(REQ-001), 새로 만든
   * 요구사항은 PK 가 rq-<ts> 라서 둘이 갈린다. 어느 쪽으로 저장됐든
   * 놓치지 않도록 둘 다로 찾아 합친다.
   */
  const tcsFor = useMemo(
    () => (r: Requirement): TestCaseMeta[] => {
      const a = tcsByReq.get(reqPk(r)) ?? []
      const label = reqLabel(r)
      const b = label && label !== reqPk(r) ? (tcsByReq.get(label) ?? []) : []
      if (b.length === 0) return a
      const seen = new Set(a.map((t) => t.tcid))
      return [...a, ...b.filter((t) => !seen.has(t.tcid))]
    },
    [tcsByReq],
  )

  const tcById = useMemo(() => {
    const m = new Map<string, TestCaseMeta>()
    for (const t of tcs) m.set(t.tcid, t)
    return m
  }, [tcs])

  const selectedReq: Requirement | undefined = useMemo(
    () => allReqs.find((r) => reqPk(r) === selected),
    [allReqs, selected],
  )

  /** 선택된 REQ 에 연결된 TC — 양쪽 정본의 합집합 */
  /**
   * 연결 해제. tc.req_id 를 비우는 것이 전부다 — TC 자체는 남는다.
   * 붙이는 창이 아니라 이 목록에서 한다(Zephyr 도 같은 구조다).
   */
  const unlinkM = useMutation({
    mutationFn: (t: TestCaseMeta) =>
      tcApi.save(t.tcid, {
        tcid: t.tcid,
        name: t.name ?? '',
        type: t.type ?? '',
        status: t.status ?? '',
        severity: t.severity ?? '',
        req_id: '',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tc', 'list', 'meta'] })
      void qc.invalidateQueries({ queryKey: ['req', 'list'] })
    },
  })

  const linked = useMemo(() => {
    if (!selectedReq) return []
    const byTc = tcsFor(selectedReq)
    const seen = new Set(byTc.map((t) => t.tcid))

    const extra: TestCaseMeta[] = []
    for (const ref of selectedReq.tc ?? []) {
      if (!ref?.tcid || seen.has(ref.tcid)) continue
      seen.add(ref.tcid)
      // TC 목록에 있으면 그 메타를, 없으면 REQ 가 들고 있는 참조만으로 행을 만든다.
      extra.push(
        tcById.get(ref.tcid) ?? {
          tcid: ref.tcid,
          name: ref.name,
          status: ref.status,
        },
      )
    }
    return [...byTc, ...extra]
  }, [selectedReq, tcsFor, tcById])

  /** 커버리지 집계. Xray 처럼 '덮였는가' 를 먼저 답하려고 쓴다. */
  const cov = useMemo(() => {
    let p = 0
    let f = 0
    for (const t of linked) {
      const c = statusClass(t.status)
      if (c === 'pass') p++
      else if (c === 'fail') f++
    }
    return { pass: p, fail: f, idle: linked.length - p - f }
  }, [linked])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return linked.filter((t) => {
      if (statusFilter && statusClass(t.status) !== statusFilter) return false
      if (!needle) return true
      return (
        t.tcid.toLowerCase().includes(needle) ||
        (t.name ?? '').toLowerCase().includes(needle)
      )
    })
  }, [linked, q, statusFilter])

  const togglePick = (id: string) =>
    setPicked((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const togglePickFolder = (id: string) =>
    setPickedFolders((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const doRemovePicked = () => {
    const ids = [...picked]
    const folderIds = [...pickedFolders]
    if (ids.length === 0 && folderIds.length === 0) return
    const tcCount = ids.reduce((a, id) => {
      const r = allReqs.find((x) => reqPk(x) === id)
      return a + (r ? tcsFor(r).length : 0)
    }, 0)
    const lines: string[] = []
    if (ids.length > 0) lines.push(`요구사항 ${ids.length}건을 삭제합니다.`)
    if (folderIds.length > 0)
      lines.push(
        `폴더 ${folderIds.length}개를 삭제합니다. 안에 있던 요구사항은 지워지지 않고 미분류가 됩니다.`,
      )
    if (tcCount > 0) lines.push(`연결된 TC ${tcCount}건도 함께 사라집니다.`)
    lines.push('되돌릴 수 없습니다. 계속할까요?')
    if (!window.confirm(lines.join('\n'))) return
    removeManyM.mutate({ reqIds: ids, folderIds })
  }

  const loading = reqQ.isLoading || tcQ.isLoading
  const error = reqQ.error ?? tcQ.error

  return (
    <>
      {form !== undefined && (
        <ReqForm editing={form} onClose={() => setForm(undefined)} />
      )}
      {bulkOpen && <ReqBulkForm onClose={() => setBulkOpen(false)} />}
      {tcForm !== undefined && (
        <TcForm
          editing={null}
          presetReqId={tcForm.reqId}
          onClose={() => setTcForm(undefined)}
        />
      )}
      {tcLinkOpen && selectedReq && (
        <TcLinkForm
          req={selectedReq}
          linked={linked}
          onClose={() => setTcLinkOpen(false)}
        />
      )}
      {tcBulkOpen && selectedReq && (
        <TcBulkForm
          presetReqId={reqPk(selectedReq)}
          onClose={() => setTcBulkOpen(false)}
        />
      )}

      {error ? (
        <div className="load-error">
          데이터를 불러오지 못했습니다 — {(error as Error).message}
        </div>
      ) : null}

      <div className="split" ref={splitRef}>
        {/* ── 왼쪽: 폴더 + 요구사항 한 트리 ─────────────────
            전에는 분류 트리와 요구사항 목록이 따로였다. 자료가 29건 ·
            분류 20개라 전체가 한 화면에 들어오는데 두 단계로 고르게 하고
            있었다. Zephyr Enterprise 처럼 폴더 안에 요구사항을 둔다. */}
        <section className="panel req-tree-panel" style={{ flexBasis: catW }}>
          {/* 한 줄에 다 넣는다. 건수를 따로 아래에 두면 그만큼 목록이 준다. */}
          <div className="rt-actions">
            <span className="rt-count">
              요구사항 <b>{allReqs.length}</b>건
            </span>
            <button
              className="btn small"
              type="button"
              disabled={!selectedReq}
              onClick={() => selectedReq && setForm(selectedReq)}
            >
              편집
            </button>
            {(picked.size > 0 || pickedFolders.size > 0) && (
              <button
                className="btn small danger"
                type="button"
                onClick={doRemovePicked}
                disabled={removeManyM.isPending}
              >
                {removeManyM.isPending
                  ? '삭제 중…'
                  : `${picked.size + pickedFolders.size}건 삭제`}
              </button>
            )}
            <span className="sp" />
            <button className="btn small" type="button" onClick={() => setBulkOpen(true)}>
              일괄
            </button>
            <button className="btn small primary" type="button" onClick={() => setForm(null)}>
              + REQ
            </button>
            {/* 폴더 만들기는 요구사항 만들기 오른쪽에. 둘 다 '새로 만드는'
                일이라 붙여 두고, 자주 쓰는 + REQ 를 왼쪽에 둔다. */}
            <button
              className="btn small"
              type="button"
              title="폴더 추가"
              onClick={() => setAddFolder((n) => n + 1)}
            >
              + 폴더
            </button>
          </div>
          {loading ? (
            <div className="empty">불러오는 중…</div>
          ) : (
            <ReqTree
              reqs={allReqs}
              tcsFor={tcsFor}
              selected={selected}
              onSelect={setSelected}
              picked={picked}
              onPick={togglePick}
              pickedFolders={pickedFolders}
              onPickFolder={togglePickFolder}
              addFolderSignal={addFolder}
            />
          )}
        </section>

        <Resizer
          label="요구사항 트리 폭 조절"
          onResize={setCatW}
          getOrigin={() => splitRef.current?.getBoundingClientRect().left ?? 0}
        />


        {/* ── 오른쪽: 탭에 따라 내용이 바뀐다 ─────────────── */}
        <section className="panel tc-panel">
          <div className="panel-title">
            {/* 탭은 이 패널만 바꾼다. 화면 전체 폭을 쓰는 띠로 두면 자리만 먹는다. */}
            <div className="seg" role="tablist">
              {([
                ['info', 'REQ Info'],
                ['detail', 'REQ Details'],
                ['tc', 'Coverages'],
                ['runs', 'Execution History'],
                ['history', 'Change History'],
              ] as const).map(([k, label]) => (
                <button
                  key={k}
                  role="tab"
                  aria-selected={tab === k}
                  className={`seg-btn${tab === k ? ' on' : ''}`}
                  type="button"
                  onClick={() => setTab(k)}
                >
                  {label}
                </button>
              ))}
            </div>
            {tab === 'tc' && (
              <div className="page-head-actions">
                <button
                  className="btn"
                  type="button"
                  disabled={!selectedReq}
                  onClick={() => setTcLinkOpen(true)}
                  title="이미 있는 TC 를 이 요구사항에 붙입니다"
                >
                  TC 연결
                </button>
                <button
                  className="btn"
                  type="button"
                  disabled={!selectedReq}
                  onClick={() => setTcBulkOpen(true)}
                >
                  일괄 생성
                </button>
                <button
                  className="btn primary"
                  type="button"
                  disabled={!selectedReq}
                  onClick={() =>
                    // 새 TC 를 만들되 이 요구사항에 미리 연결해 둔다.
                    selectedReq && setTcForm({ reqId: reqPk(selectedReq) })
                  }
                >
                  + TC 생성
                </button>
              </div>
            )}
          </div>

          {!selectedReq ? (
            <div className="empty">왼쪽에서 요구사항을 선택하세요.</div>
          ) : tab !== 'tc' ? (
            <ReqDetail req={selectedReq} tcs={linked} tab={tab} />
          ) : (
            <div className="tc-body scroll">
              {/* 커버리지 상태. 목록만 있으면 '이 요구사항이 덮였나' 를
                  눈으로 세어야 한다. 한 줄로 먼저 답한다. */}
              <div className={`cov-bar ${linked.length === 0 ? 'none' : cov.fail > 0 ? 'bad' : cov.idle > 0 ? 'warn' : 'good'}`}>
                {linked.length === 0 ? (
                  <>
                    <b>미커버</b>
                    <span className="muted small">
                      이 요구사항을 검증하는 TC 가 없습니다. 「TC 연결」 또는 「+ TC 생성」
                    </span>
                  </>
                ) : (
                  <>
                    <b>{cov.fail > 0 ? '실패 있음' : cov.idle > 0 ? '미실행 있음' : '커버됨'}</b>
                    <span className="muted small">
                      TC {linked.length}건 · PASS {cov.pass} · FAIL {cov.fail} · 미실행 {cov.idle}
                    </span>
                  </>
                )}
              </div>

              <div className="filter">
                <input
                  placeholder="TC ID / 제목 검색"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">전체 상태</option>
                  <option value="pass">PASS</option>
                  <option value="fail">FAIL</option>
                  <option value="idle">미실행</option>
                  <option value="draft">작성중</option>
                </select>
              </div>

              <div className="table">
                <div className="tr th">
                  <div>Test Case</div>
                  <div>유형</div>
                  <div>Step</div>
                  <div>상태</div>
                  <div />
                </div>
                {shown.length === 0 ? (
                  <div className="empty">
                    {linked.length === 0
                      ? '연결된 TC가 없습니다.'
                      : '조건에 맞는 TC가 없습니다.'}
                  </div>
                ) : (
                  shown.map((t) => (
                    <div className="tr" key={t.tcid}>
                      <div className="tc-cell">
                        {/* 읽는 것은 제목이다. ID 는 참조 번호라 작게 위에 둔다. */}
                        <div className="id-cell">{t.tcid}</div>
                        <div className="tc-name">{t.name || '(제목 없음)'}</div>
                      </div>
                      <div>
                        {t.type ? <span className="tag">{t.type}</span> : null}
                      </div>
                      <div className="muted small">{t._cli_count ?? '-'}</div>
                      <div className={`status ${statusClass(t.status)}`}>
                        ● {t.status || '미실행'}
                      </div>
                      {/* 떼는 것은 붙이는 창이 아니라 이 목록에서 한다.
                          한 창에서 붙이기·떼기를 같이 하면 무엇이 무엇인지
                          계속 생각해야 한다(Zephyr 도 같은 구조다). */}
                      <div>
                        <button
                          className="btn small danger"
                          type="button"
                          disabled={unlinkM.isPending}
                          title="이 요구사항에서 뗍니다. TC 자체는 지워지지 않습니다"
                          onClick={() => {
                            if (window.confirm(`'${t.name || t.tcid}' 을 이 요구사항에서 뗍니다.`))
                              unlinkM.mutate(t)
                          }}
                        >
                          해제
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="bottom">
                <span>
                  {linked.length}개 TC 연결
                  {shown.length !== linked.length && ` · ${shown.length}개 표시`}
                </span>
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  )
}
