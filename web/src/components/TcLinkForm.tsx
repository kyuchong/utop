import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, tcApi } from '@/api/client'
import {
  reqLabel,
  reqPk,
  statusClass,
  type Requirement,
  type TestCaseMeta,
} from '@/types'
import './ReqForm.css'

interface Props {
  /** 연결 대상 요구사항 */
  req: Requirement
  /** 이미 이 요구사항에 붙어 있는 TC */
  linked: TestCaseMeta[]
  onClose: () => void
}

/**
 * 기존 TC 를 요구사항에 붙이거나 뗀다.
 *
 * 「+ TC 생성」이 새 TC 를 만드는 것이라면, 여기는 이미 있는 TC 를 고르는
 * 자리다. 같은 시험을 여러 요구사항에서 재활용하는 일이 흔해서 둘 다 필요하다.
 *
 * 연결의 실체는 tc.req_id 한 칸이다. 그래서 "붙이기 = req_id 를 이 요구사항으로",
 * "떼기 = req_id 를 비움" 이다.
 */
export default function TcLinkForm({ req, linked, onClose }: Props) {
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [onlyUnlinked, setOnlyUnlinked] = useState(true)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')

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
  const myPk = reqPk(req)
  const linkedIds = useMemo(() => new Set(linked.map((t) => t.tcid)), [linked])

  /** 다른 요구사항에 붙어 있는 TC 는 어디에 붙어 있는지 보여준다 */
  const ownerOf = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of reqs) {
      m.set(reqPk(r), reqLabel(r))
      const l = reqLabel(r)
      if (l) m.set(l, l)
    }
    return m
  }, [reqs])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return tcs.filter((t) => {
      if (onlyUnlinked && linkedIds.has(t.tcid)) return false
      if (!needle) return true
      return (
        t.tcid.toLowerCase().includes(needle) ||
        (t.name ?? '').toLowerCase().includes(needle) ||
        (t.type ?? '').toLowerCase().includes(needle)
      )
    })
  }, [tcs, q, onlyUnlinked, linkedIds])

  const toggle = (tcid: string) =>
    setPicked((s) => {
      const n = new Set(s)
      if (n.has(tcid)) n.delete(tcid)
      else n.add(tcid)
      return n
    })

  const saveM = useMutation({
    mutationFn: async (mode: 'link' | 'unlink') => {
      // 순차 저장. TC 저장은 스텝 보존 로직 때문에 서버가 이전 값을 읽으므로
      // 같은 대상에 동시에 던지지 않는 편이 안전하다.
      for (const tcid of picked) {
        const cur = tcs.find((t) => t.tcid === tcid)
        if (!cur) continue
        await tcApi.save(tcid, {
          tcid,
          name: cur.name ?? '',
          type: cur.type ?? '',
          status: cur.status ?? '',
          severity: cur.severity ?? '',
          req_id: mode === 'link' ? myPk : '',
        })
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tc', 'list', 'meta'] })
      void qc.invalidateQueries({ queryKey: ['req', 'list'] })
      onClose()
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  })

  const busy = saveM.isPending
  const pickedLinked = [...picked].filter((id) => linkedIds.has(id)).length
  const pickedFree = picked.size - pickedLinked

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div
        className="modal wide"
        role="dialog"
        aria-modal="true"
        aria-label="Test Case 연결"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <b>Test Case 연결 — {reqLabel(req)}</b>
          <button className="modal-x" type="button" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="form-error">{error}</div>}

          <div className="filter">
            <input
              autoFocus
              placeholder="TC ID / 제목 / 유형 검색"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <label className="chk">
              <input
                type="checkbox"
                checked={onlyUnlinked}
                onChange={(e) => setOnlyUnlinked(e.target.checked)}
              />
              이미 연결된 것 숨기기
            </label>
          </div>

          <div className="link-list">
            {tcQ.isLoading ? (
              <div className="empty">불러오는 중…</div>
            ) : shown.length === 0 ? (
              <div className="empty">
                {tcs.length === 0
                  ? '등록된 TC 가 없습니다. 「+ TC 생성」으로 먼저 만드세요.'
                  : '조건에 맞는 TC 가 없습니다.'}
              </div>
            ) : (
              shown.map((t) => {
                const isLinked = linkedIds.has(t.tcid)
                const other = t.req_id && t.req_id !== myPk ? ownerOf.get(t.req_id) : ''
                return (
                  <label className="link-row" key={t.tcid}>
                    <input
                      type="checkbox"
                      checked={picked.has(t.tcid)}
                      onChange={() => toggle(t.tcid)}
                    />
                    <span className="tc-id">{t.tcid}</span>
                    <span className="req-name">{t.name || '(제목 없음)'}</span>
                    {isLinked ? (
                      <span className="tag">연결됨</span>
                    ) : other ? (
                      <span className="tag" title="다른 요구사항에 연결되어 있습니다">
                        {other}
                      </span>
                    ) : null}
                    <span className={`status ${statusClass(t.status)}`}>
                      ● {t.status || '미실행'}
                    </span>
                  </label>
                )
              })
            )}
          </div>

          <div className="hint">
            TC 하나는 요구사항 하나에만 붙습니다(<code>tc.req_id</code> 한 칸).
            다른 요구사항에 붙어 있는 TC 를 고르면 <b>그쪽 연결이 끊기고</b> 이리로
            옮겨옵니다 — 위 목록의 회색 배지가 현재 주인입니다.
          </div>
        </div>

        <div className="modal-foot">
          <span className="muted small">
            {picked.size > 0 ? `${picked.size}건 선택` : '연결할 TC 를 고르세요'}
          </span>
          <span className="page-head-actions">
            <button className="btn" type="button" onClick={onClose} disabled={busy}>
              취소
            </button>
            {pickedLinked > 0 && (
              <button
                className="btn danger"
                type="button"
                disabled={busy}
                onClick={() => saveM.mutate('unlink')}
              >
                {busy ? '처리 중…' : `${pickedLinked}건 연결 해제`}
              </button>
            )}
            <button
              className="btn primary"
              type="button"
              disabled={busy || pickedFree === 0}
              onClick={() => saveM.mutate('link')}
            >
              {busy ? '처리 중…' : `${pickedFree}건 연결`}
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}
