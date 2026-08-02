import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import TcForm from '@/components/TcForm'
import TcBulkForm from '@/components/TcBulkForm'
import {
  reqLabel,
  reqPk,
  statusClass,
  type Requirement,
  type TestCaseMeta,
} from '@/types'
import './TestCases.css'

/**
 * 테스트케이스 목록.
 *
 * 요구사항 화면이 "REQ 하나에 달린 TC" 를 본다면, 여기는 TC 전체를
 * 한 번에 훑고 찾는 자리다. 그래서 목록 + 검색·필터가 중심이고,
 * 연결된 요구사항을 함께 보여준다.
 */
export default function TestCases() {
  const [form, setForm] = useState<TestCaseMeta | null | undefined>(undefined)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [reqFilter, setReqFilter] = useState('')

  const tcQ = useQuery({
    queryKey: ['tc', 'list', 'meta'],
    queryFn: ({ signal }) => api.listTestCases(signal),
  })
  const reqQ = useQuery({
    queryKey: ['req', 'list'],
    queryFn: ({ signal }) => api.listRequirements(signal),
  })

  const tcs = tcQ.data?.tcs ?? []
  const reqs = reqQ.data?.reqs ?? []

  /** req PK/label 양쪽으로 찾을 수 있게 (tc.req_id 에 무엇이 들었는지 데이터마다 다름) */
  const reqByKey = useMemo(() => {
    const m = new Map<string, Requirement>()
    for (const r of reqs) {
      m.set(reqPk(r), r)
      const l = reqLabel(r)
      if (l) m.set(l, r)
    }
    return m
  }, [reqs])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return tcs.filter((t) => {
      if (statusFilter && statusClass(t.status) !== statusFilter) return false
      if (reqFilter && (t.req_id || '') !== reqFilter) return false
      if (!needle) return true
      return (
        t.tcid.toLowerCase().includes(needle) ||
        (t.name ?? '').toLowerCase().includes(needle) ||
        (t.type ?? '').toLowerCase().includes(needle)
      )
    })
  }, [tcs, q, statusFilter, reqFilter])

  const stat = useMemo(() => {
    let pass = 0
    let fail = 0
    for (const t of shown) {
      const c = statusClass(t.status)
      if (c === 'pass') pass++
      else if (c === 'fail') fail++
    }
    return { pass, fail, idle: shown.length - pass - fail }
  }, [shown])

  const loading = tcQ.isLoading || reqQ.isLoading
  const error = tcQ.error ?? reqQ.error

  return (
    <>
      {form !== undefined && (
        <TcForm editing={form} onClose={() => setForm(undefined)} />
      )}
      {bulkOpen && <TcBulkForm onClose={() => setBulkOpen(false)} />}

      {error ? (
        <div className="load-error">
          데이터를 불러오지 못했습니다 — {(error as Error).message}
        </div>
      ) : null}

      <section className="panel tc-list">
        <div className="panel-title">
          <div className="tc-filters">
            <input
              placeholder="TC ID / 제목 / 유형 검색"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select value={reqFilter} onChange={(e) => setReqFilter(e.target.value)}>
              <option value="">전체 요구사항</option>
              {reqs.map((r) => (
                <option key={reqPk(r)} value={reqPk(r)}>
                  {reqLabel(r)} · {r.title}
                </option>
              ))}
            </select>
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
          <span className="muted small tc-stat">
            {shown.length}건
            {stat.pass > 0 && ` · PASS ${stat.pass}`}
            {stat.fail > 0 && ` · FAIL ${stat.fail}`}
            {stat.idle > 0 && ` · 미실행 ${stat.idle}`}
          </span>
          <div className="page-head-actions">
            <button className="btn" type="button" onClick={() => setBulkOpen(true)}>
              일괄 생성
            </button>
            <button className="btn primary" type="button" onClick={() => setForm(null)}>
              + Test Case
            </button>
          </div>
        </div>

        <div className="scroll">
          <div className="tc-table">
            <div className="tcr th">
              <div>Test Case</div>
              <div>요구사항</div>
              <div>유형</div>
              <div>Step</div>
              <div>상태</div>
            </div>

            {loading ? (
              <div className="empty">불러오는 중…</div>
            ) : shown.length === 0 ? (
              <div className="empty">
                {tcs.length === 0
                  ? '등록된 테스트케이스가 없습니다.'
                  : '조건에 맞는 테스트케이스가 없습니다.'}
              </div>
            ) : (
              shown.map((t) => {
                const r = reqByKey.get((t.req_id || '').trim())
                return (
                  <button
                    key={t.tcid}
                    type="button"
                    className="tcr"
                    onClick={() => setForm(t)}
                    title="클릭하면 편집합니다"
                  >
                    <div className="tc-main">
                      <span className="id-cell">{t.tcid}</span>
                      <span className="tc-title">{t.name || '(제목 없음)'}</span>
                    </div>
                    <div className="muted small ell">
                      {r ? (
                        `${reqLabel(r)} · ${r.title ?? ''}`
                      ) : t.req_id ? (
                        <span className="orphan">연결 끊김</span>
                      ) : (
                        '—'
                      )}
                    </div>
                    <div>{t.type ? <span className="tag">{t.type}</span> : null}</div>
                    <div className="muted small">{t._cli_count ?? '-'}</div>
                    <div className={`status ${statusClass(t.status)}`}>
                      ● {t.status || '미실행'}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      </section>
    </>
  )
}
