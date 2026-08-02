import { useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import CategoryTree from '@/components/CategoryTree'
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
  UNCATEGORIZED,
  type Requirement,
  type TestCaseMeta,
} from '@/types'
import './Requirements.css'

/** REQ 하나에 달린 TC 집계 */
interface ReqRollup {
  total: number
  pass: number
  fail: number
  idle: number
}

function rollup(tcs: TestCaseMeta[]): ReqRollup {
  let pass = 0
  let fail = 0
  for (const t of tcs) {
    const c = statusClass(t.status)
    if (c === 'pass') pass++
    else if (c === 'fail') fail++
  }
  return { total: tcs.length, pass, fail, idle: tcs.length - pass - fail }
}

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
  const [catFilter, setCatFilter] = useState<string | null>(null)
  const [reqQuery, setReqQuery] = useState('')
  // undefined = 폼 닫힘 / null = 새로 만들기 / Requirement = 편집
  const [form, setForm] = useState<Requirement | null | undefined>(undefined)
  const [bulkOpen, setBulkOpen] = useState(false)
  // undefined = 닫힘 / { } = 새 TC(요구사항 미리 연결)
  const [tcForm, setTcForm] = useState<{ reqId: string } | undefined>(undefined)
  const [tcLinkOpen, setTcLinkOpen] = useState(false)
  const [tcBulkOpen, setTcBulkOpen] = useState(false)
  const [tab, setTab] = useState<'tc' | 'detail' | 'history' | 'runs'>('tc')
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // 패널 폭은 사람마다 선호가 다르다. 드래그로 맞추고 브라우저에 기억시킨다.
  const splitRef = useRef<HTMLDivElement>(null)
  const [catW, setCatW] = useResizableWidth('utop.req.catW2', 168, 120, 420)
  const [reqW, setReqW] = useResizableWidth('utop.req.reqW2', 560, 300, 1200)

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

  // 분류 필터. 어느 단계를 고르든, 그 아래에 달린 것까지 함께 보여야 자연스럽다.
  // 요구사항이 cat1/cat2/cat3 에 조상들을 그대로 담고 있으므로 셋 중 하나만
  // 맞으면 하위까지 자동으로 걸린다.
  const byCat = useMemo(() => {
    if (!catFilter) return allReqs
    if (catFilter === UNCATEGORIZED) {
      // 분류가 하나도 안 붙은 것 (지워진 분류를 가리키던 것도 여기로 온다)
      return allReqs.filter((r) => !r.cat1 && !r.cat2 && !r.cat3)
    }
    return allReqs.filter(
      (r) => r.cat1 === catFilter || r.cat2 === catFilter || r.cat3 === catFilter,
    )
  }, [allReqs, catFilter])

  /**
   * 분류로 좁힌 뒤 검색어로 한 번 더 좁힌다.
   * 구현내용까지 뒤지는 이유: 제목은 짧게 쓰는데 실제 내용(CLI 명령·판정
   * 기준)은 본문에 있어서, 'rate-limit' 같은 말로 찾는 일이 잦다.
   */
  const reqs = useMemo(() => {
    const needle = reqQuery.trim().toLowerCase()
    if (!needle) return byCat
    return byCat.filter((r) => {
      const desc = typeof r.desc === 'string' ? r.desc : ''
      return (
        reqLabel(r).toLowerCase().includes(needle) ||
        (r.title ?? '').toLowerCase().includes(needle) ||
        desc.toLowerCase().includes(needle)
      )
    })
  }, [byCat, reqQuery])

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
    () => reqs.find((r) => reqPk(r) === selected),
    [reqs, selected],
  )

  /** 선택된 REQ 에 연결된 TC — 양쪽 정본의 합집합 */
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
        {/* ── 왼쪽: 요구사항 목록 ─────────────────────────── */}
        {/* 분류는 독립된 열. 요구사항 목록 위에 얹으면 목록이 몇 줄 못 나온다. */}
        <section className="panel cat-panel" style={{ flexBasis: catW }}>
          <CategoryTree selected={catFilter} onSelect={setCatFilter} />
        </section>

        <Resizer
          label="분류 폭 조절"
          onResize={setCatW}
          getOrigin={() => splitRef.current?.getBoundingClientRect().left ?? 0}
        />

        <section className="panel req-panel" style={{ flexBasis: reqW }}>
          <div className="panel-title">
            <span className="panel-name">
              REQ LIST
              <span className="muted small">
                {reqs.length === allReqs.length
                  ? `${reqs.length}건`
                  : `${reqs.length} / ${allReqs.length}건`}
              </span>
            </span>
            <div className="page-head-actions">
              <button
                className="btn"
                type="button"
                disabled={!selectedReq}
                onClick={() => selectedReq && setForm(selectedReq)}
              >
                편집
              </button>
              <button className="btn" type="button" onClick={() => setBulkOpen(true)}>
                일괄 생성
              </button>
              <button className="btn primary" type="button" onClick={() => setForm(null)}>
                + Requirement
              </button>
            </div>
          </div>
          <div className="req-search">
            <input
              placeholder="REQ ID / 제목 / 구현내용 검색"
              value={reqQuery}
              onChange={(e) => setReqQuery(e.target.value)}
            />
            {reqQuery && (
              <button
                type="button"
                className="req-search-x"
                onClick={() => setReqQuery('')}
                aria-label="검색어 지우기"
              >
                ×
              </button>
            )}
          </div>

          {/* 표 머리. 3열에도 같은 높이의 머리가 있어 두 목록의 행이 맞는다. */}
          <div className="req-row th">
            <span className="req-id">REQ ID</span>
            <span className="req-name">제목</span>
            <span className="req-stat">TC</span>
          </div>

          <div className="scroll">
            {loading ? (
              <div className="empty">불러오는 중…</div>
            ) : reqs.length === 0 ? (
              <div className="empty">
                {reqQuery
                  ? `'${reqQuery}' 에 맞는 요구사항이 없습니다.`
                  : catFilter
                    ? '이 분류에 해당하는 요구사항이 없습니다.'
                    : '등록된 요구사항이 없습니다.'}
              </div>
            ) : (
              reqs.map((r) => {
                const pk = reqPk(r)
                const stat = rollup(tcsFor(r))
                return (
                  <button
                    key={pk}
                    type="button"
                    className={`req-row${pk === selected ? ' sel' : ''}`}
                    onClick={() => setSelected(pk)}
                  >
                    <span className="req-id">{reqLabel(r) || '(ID 없음)'}</span>
                    <span className="req-name">{r.title || '(제목 없음)'}</span>
                    <span className="req-stat">
                      {stat.total === 0 ? (
                        <span className="muted small">TC 0</span>
                      ) : (
                        <>
                          {stat.pass > 0 && <b className="status pass">{stat.pass}</b>}
                          {stat.fail > 0 && <b className="status fail">{stat.fail}</b>}
                          {stat.idle > 0 && <b className="status idle">{stat.idle}</b>}
                        </>
                      )}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </section>

        <Resizer
          label="요구사항 목록 폭 조절"
          onResize={setReqW}
          getOrigin={() => {
            const el = splitRef.current
            if (!el) return 0
            // 요구사항 패널의 왼쪽 끝 = split 왼쪽 + 분류 폭 + 조절바 폭(6px)
            return el.getBoundingClientRect().left + catW + 6
          }}
        />

        {/* ── 오른쪽: 탭에 따라 내용이 바뀐다 ─────────────── */}
        <section className="panel tc-panel">
          <div className="panel-title">
            {/* 탭은 이 패널만 바꾼다. 화면 전체 폭을 쓰는 띠로 두면 자리만 먹는다. */}
            <div className="seg" role="tablist">
              {([
                ['tc', 'TC 연결'],
                ['detail', '상세정보'],
                ['history', '변경이력'],
                ['runs', '실행현황'],
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
