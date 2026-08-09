import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, categoryApi, tcApi } from '@/api/client'
import { IconReqDoc } from '@/components/icons'
import { reqLabel, reqPk, type Requirement, type TestCaseMeta } from '@/types'
import '@/components/ReqMapDialog.css'

interface Props {
  /** 요구사항을 붙일 시험 */
  tc: TestCaseMeta
  onClose: () => void
}

/**
 * 시험 하나에 요구사항 붙이기 — 요구사항 화면의 Map 과 **반대 방향**.
 *
 * 연결의 실체는 `tc.req_id` 한 칸이라 붙는 요구사항은 하나다. 그래서 체크가
 * 아니라 고르기(라디오)로 둔다 — 여러 개를 체크할 수 있게 해 놓고 하나만
 * 저장되면 그게 더 나쁘다.
 *
 * 고르기만 하고 저장은 「적용」 을 눌러야 일어난다. 목록에서 지나가듯 눌러
 * 연결이 바뀌면 되돌릴 틈이 없다.
 */
export default function TcMapReqDialog({ tc, onClose }: Props) {
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [pick, setPick] = useState(tc.req_id || '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const reqQ = useQuery({
    queryKey: ['req', 'list'],
    queryFn: ({ signal }) => api.listRequirements(signal),
  })
  const catQ = useQuery({
    queryKey: ['req-categories'],
    queryFn: ({ signal }) => categoryApi.list(signal),
  })

  useEffect(() => setPick(tc.req_id || ''), [tc.req_id])

  /** 폴더 경로를 붙인 요구사항 목록 — 이름만으로는 어느 것인지 모른다 */
  const rows = useMemo(() => {
    const byId = new Map((catQ.data?.categories ?? []).map((c) => [c.id, c]))
    const path = (r: Requirement) =>
      [r.cat1, r.cat2, r.cat3, r.cat4]
        .filter(Boolean)
        .map((id) => byId.get(id as string)?.name ?? '')
        .filter(Boolean)
        .join(' › ')
    const n = q.trim().toLowerCase()
    return (reqQ.data?.reqs ?? [])
      .map((r) => ({ r, pk: reqPk(r), label: reqLabel(r), path: path(r) }))
      .filter((x) =>
        !n ? true : `${x.label} ${x.r.title ?? ''} ${x.path}`.toLowerCase().includes(n),
      )
      .sort((a, b) => `${a.path}${a.r.title}`.localeCompare(`${b.path}${b.r.title}`, 'ko'))
  }, [reqQ.data, catQ.data, q])

  const dirty = (tc.req_id || '') !== pick

  const applyM = useMutation({
    mutationFn: () =>
      tcApi.save(tc.tcid, {
        tcid: tc.tcid,
        name: tc.name ?? '',
        type: tc.type ?? '',
        status: tc.status ?? '',
        severity: tc.severity ?? '',
        req_id: pick,
      }),
    onSuccess: () => {
      setMsg(pick ? '붙였습니다' : '연결을 뗐습니다')
      void qc.invalidateQueries({ queryKey: ['tc', 'list', 'meta'] })
      void qc.invalidateQueries({ queryKey: ['req', 'list'] })
      void qc.invalidateQueries({ queryKey: ['tc', tc.tcid] })
    },
    onError: (e) => setMsg(e instanceof Error ? e.message : String(e)),
    onSettled: () => setBusy(false),
  })

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div
        className="modal rmd tmr"
        role="dialog"
        aria-modal="true"
        aria-label="시험에 요구사항 붙이기"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <b>요구사항 연결 (REQ Map)</b>
          <span className="muted small">{tc.name || tc.tcid}</span>
          <span className="sp" />
          {msg && <span className="muted small ok">{msg}</span>}
          <button className="modal-x" type="button" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="rmd-find">
          <input
            placeholder="요구사항 제목 · ID · 폴더로 찾기"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="rmd-body tmr-body">
          {/* 연결의 실체가 한 칸이라 고르는 것도 하나다 */}
          <label className={`rmd-tc${pick === '' ? ' on' : ''}`}>
            <input
              type="radio"
              name="req"
              checked={pick === ''}
              onChange={() => setPick('')}
            />
            <span className="rmd-tn muted">(연결 안 함)</span>
          </label>
          {rows.length === 0 ? (
            <div className="empty">해당하는 요구사항이 없습니다.</div>
          ) : (
            rows.map((x) => (
              <label key={x.pk} className={`rmd-tc${pick === x.pk ? ' on' : ''}`}>
                <input
                  type="radio"
                  name="req"
                  checked={pick === x.pk}
                  onChange={() => setPick(x.pk)}
                />
                <span className="rmd-icon" aria-hidden="true">
                  <IconReqDoc />
                </span>
                <span className="rmd-tn">{x.r.title || x.label || '(제목 없음)'}</span>
                {x.path && <span className="tmr-path">{x.path}</span>}
                <span className="rmd-st muted">{x.label}</span>
              </label>
            ))
          )}
        </div>

        <div className="modal-foot rmd-foot">
          {dirty ? (
            <span className="rmd-diff">
              <b className="add">바꿀 것 있음</b>
            </span>
          ) : (
            <span className="muted small">고른 뒤 「적용」 을 누르세요.</span>
          )}
          <span className="sp" />
          <button
            className="btn"
            type="button"
            disabled={!dirty || busy}
            onClick={() => setPick(tc.req_id || '')}
          >
            되돌리기
          </button>
          <button
            className="btn primary"
            type="button"
            disabled={!dirty || busy}
            onClick={() => {
              setBusy(true)
              setMsg('')
              applyM.mutate()
            }}
          >
            {busy ? '적용 중…' : '적용'}
          </button>
          <button className="btn" type="button" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}
