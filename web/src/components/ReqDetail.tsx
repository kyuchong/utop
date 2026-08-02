import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { categoryApi } from '@/api/client'
import {
  categoryPath,
  reqLabel,
  reqPk,
  statusClass,
  type Requirement,
  type TestCaseMeta,
} from '@/types'
import './ReqDetail.css'

interface Props {
  req: Requirement
  /** 이 요구사항에 연결된 TC (Requirements 페이지가 이미 계산해 둔 것) */
  tcs: TestCaseMeta[]
  tab: 'detail' | 'history' | 'runs'
}

function fmt(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function ReqDetail({ req, tcs, tab }: Props) {
  const catQ = useQuery({
    queryKey: ['req-categories'],
    queryFn: ({ signal }) => categoryApi.list(signal),
  })
  const cats = catQ.data?.categories ?? []

  // 가장 깊은 분류의 경로를 보여준다 (소분류가 있으면 대>중>소 전체가 나온다)
  const catText = useMemo(() => {
    const deepest = req.cat3 || req.cat2 || req.cat1
    return categoryPath(cats, deepest) || '미분류'
  }, [cats, req])

  const stat = useMemo(() => {
    let pass = 0
    let fail = 0
    for (const t of tcs) {
      const c = statusClass(t.status)
      if (c === 'pass') pass++
      else if (c === 'fail') fail++
    }
    return { total: tcs.length, pass, fail, idle: tcs.length - pass - fail }
  }, [tcs])

  if (tab === 'detail') {
    const desc = typeof req.desc === 'string' ? req.desc : ''
    return (
      <div className="detail-body scroll">
        <dl className="kv">
          <dt>REQ ID</dt>
          <dd>{reqLabel(req) || '—'}</dd>
          <dt>제목</dt>
          <dd>{req.title || '—'}</dd>
          <dt>분류</dt>
          <dd>{catText}</dd>
          <dt>상태</dt>
          <dd>{req.status || '—'}</dd>
          <dt>우선순위</dt>
          <dd>{req.priority || '—'}</dd>
          <dt>연결 TC</dt>
          <dd>{stat.total}건</dd>
        </dl>

        <div className="detail-section">
          <h4>설명</h4>
          {desc ? (
            <p className="detail-desc">{desc}</p>
          ) : (
            <p className="muted small">설명이 없습니다. 「편집」에서 넣을 수 있습니다.</p>
          )}
        </div>
      </div>
    )
  }

  if (tab === 'history') {
    return (
      <div className="detail-body scroll">
        <dl className="kv">
          <dt>만든 때</dt>
          <dd>{fmt(req._created_at as string)}</dd>
          <dt>마지막 수정</dt>
          <dd>{fmt(req._updated_at as string)}</dd>
          <dt>만든 사람</dt>
          <dd>{req.created_by || '—'}</dd>
          <dt>수정한 사람</dt>
          <dd>{req.updated_by || '—'}</dd>
        </dl>

        <div className="detail-section">
          <p className="muted small">
            지금은 <b>마지막 상태</b>만 남습니다. 어떤 항목이 언제 무엇에서 무엇으로
            바뀌었는지는 아직 기록하지 않습니다.
            <br />
            항목별 이력이 필요하면 저장할 때마다 변경 내역을 따로 쌓는 작업이
            필요합니다 — 다음 작업으로 잡을 수 있습니다.
          </p>
        </div>
      </div>
    )
  }

  // runs
  return (
    <div className="detail-body scroll">
      <div className="run-summary">
        <div className="run-box">
          <span className="run-num">{stat.total}</span>
          <span className="muted">전체</span>
        </div>
        <div className="run-box">
          <span className="run-num status pass">{stat.pass}</span>
          <span className="muted">PASS</span>
        </div>
        <div className="run-box">
          <span className="run-num status fail">{stat.fail}</span>
          <span className="muted">FAIL</span>
        </div>
        <div className="run-box">
          <span className="run-num status idle">{stat.idle}</span>
          <span className="muted">미실행</span>
        </div>
      </div>

      {stat.total === 0 ? (
        <p className="muted small" style={{ padding: '0 4px' }}>
          연결된 TC 가 없어 실행 현황이 없습니다.
        </p>
      ) : (
        <>
          <div className="run-bar" aria-hidden="true">
            {stat.pass > 0 && (
              <span className="seg pass" style={{ flex: stat.pass }} />
            )}
            {stat.fail > 0 && (
              <span className="seg fail" style={{ flex: stat.fail }} />
            )}
            {stat.idle > 0 && (
              <span className="seg idle" style={{ flex: stat.idle }} />
            )}
          </div>

          <div className="detail-section">
            <h4>TC 별 결과</h4>
            {tcs.map((t) => (
              <div className="run-row" key={t.tcid}>
                <span className="tc-id">{t.tcid}</span>
                <span className="req-name">{t.name || '(제목 없음)'}</span>
                <span className={`status ${statusClass(t.status)}`}>
                  ● {t.status || '미실행'}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="muted small" style={{ padding: '0 4px' }}>
        실행 시각·소요 시간은 사이클 실행 기능을 옮긴 뒤에 함께 표시됩니다.
        지금은 TC 의 마지막 상태만 집계합니다. (요구사항 {reqPk(req)})
      </p>
    </div>
  )
}
