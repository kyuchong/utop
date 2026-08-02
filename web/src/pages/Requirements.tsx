import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import {
  reqKey,
  statusClass,
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
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const reqQ = useQuery({
    queryKey: ['req', 'list'],
    queryFn: ({ signal }) => api.listRequirements(signal),
  })
  const tcQ = useQuery({
    queryKey: ['tc', 'list', 'meta'],
    queryFn: ({ signal }) => api.listTestCases(signal),
  })

  const reqs = reqQ.data?.reqs ?? []
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

  const tcById = useMemo(() => {
    const m = new Map<string, TestCaseMeta>()
    for (const t of tcs) m.set(t.tcid, t)
    return m
  }, [tcs])

  const selectedReq: Requirement | undefined = useMemo(
    () => reqs.find((r) => reqKey(r) === selected),
    [reqs, selected],
  )

  /** 선택된 REQ 에 연결된 TC — 양쪽 정본의 합집합 */
  const linked = useMemo(() => {
    if (!selectedReq) return []
    const key = reqKey(selectedReq)
    const byTc = tcsByReq.get(key) ?? []
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
  }, [selectedReq, tcsByReq, tcById])

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
      <div className="crumb">Requirements</div>
      <div className="page-head">
        <h1>
          {selectedReq
            ? `${reqKey(selectedReq)} · ${selectedReq.title || '(제목 없음)'}`
            : 'Requirements'}
        </h1>
        <div className="page-head-actions">
          <button className="btn" type="button" disabled={!selectedReq}>
            편집
          </button>
          <button className="btn primary" type="button">
            + Requirement
          </button>
        </div>
      </div>

      <div className="tabs">
        <button className="tab on" type="button">
          TC 연결
        </button>
        <button className="tab" type="button" disabled>
          상세정보
        </button>
        <button className="tab" type="button" disabled>
          변경이력
        </button>
        <button className="tab" type="button" disabled>
          실행현황
        </button>
      </div>

      {error ? (
        <div className="load-error">
          데이터를 불러오지 못했습니다 — {(error as Error).message}
        </div>
      ) : null}

      <div className="split">
        {/* ── 왼쪽: 요구사항 목록 ─────────────────────────── */}
        <section className="panel req-panel">
          <div className="panel-title">
            <b>Requirements</b>
            <span className="muted">{reqs.length}건</span>
          </div>
          <div className="scroll">
            {loading ? (
              <div className="empty">불러오는 중…</div>
            ) : reqs.length === 0 ? (
              <div className="empty">등록된 요구사항이 없습니다.</div>
            ) : (
              reqs.map((r) => {
                const key = reqKey(r)
                const stat = rollup(tcsByReq.get(key) ?? [])
                return (
                  <button
                    key={key || r.title}
                    type="button"
                    className={`req-row${key === selected ? ' sel' : ''}`}
                    onClick={() => setSelected(key)}
                  >
                    <div className="req-id">{key || '(ID 없음)'}</div>
                    <div className="req-name">{r.title || '(제목 없음)'}</div>
                    <div className="muted">
                      TC {stat.total}
                      {stat.pass > 0 && ` · PASS ${stat.pass}`}
                      {stat.fail > 0 && ` · FAIL ${stat.fail}`}
                      {stat.idle > 0 && ` · 미실행 ${stat.idle}`}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </section>

        {/* ── 오른쪽: 연결된 TC ───────────────────────────── */}
        <section className="panel tc-panel">
          <div className="panel-title">
            <b>연결된 Test Cases</b>
            <div className="page-head-actions">
              <button className="btn" type="button" disabled={!selectedReq}>
                TC 연결
              </button>
              <button
                className="btn primary"
                type="button"
                disabled={!selectedReq}
              >
                + TC 생성
              </button>
            </div>
          </div>

          {!selectedReq ? (
            <div className="empty">왼쪽에서 요구사항을 선택하세요.</div>
          ) : (
            <div className="tc-body scroll">
              <div className="summary">
                <b>{reqKey(selectedReq)}</b> · {selectedReq.title || '(제목 없음)'}
                <br />
                <span className="muted">
                  모델별 실제 실행 TC를 연결합니다. 유사한 TC라도 모델별
                  CLI/특성이 다르면 독립 TC로 관리합니다.
                </span>
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
                      <div>
                        <div className="tc-name">{t.tcid}</div>
                        <div className="muted">{t.name || '(제목 없음)'}</div>
                      </div>
                      <div>
                        {t.type ? <span className="tag">{t.type}</span> : null}
                      </div>
                      <div className="muted">{t._cli_count ?? '-'}</div>
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
