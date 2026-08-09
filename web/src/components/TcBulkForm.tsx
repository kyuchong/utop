import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiFetch, tcApi } from '@/api/client'
import { reqLabel, reqPk } from '@/types'
import './ReqForm.css'

interface Props {
  /** 미리 골라둘 요구사항 (요구사항 화면에서 열 때) */
  presetReqId?: string
  onClose: () => void
}

interface Parsed {
  tcid: string
  name: string
  type: string
}

/**
 * TC 일괄 생성.
 *
 * 시험 항목은 보통 엑셀 표로 넘어온다. 한 줄에 한 건씩 붙여넣게 한다.
 * 열 순서: 제목 · 유형(선택). 탭 또는 쉼표로 나눈다.
 *
 * **ID 는 안 적는다.** 서버가 주차별로 매긴다(TC-2632-0001) — 요구사항과
 * 같은 규칙이다. 사람이 적게 두면 제각각이 되고, tcid 는 곧 PK 라 겹치면
 * 남의 시험을 덮는다.
 */
function parseLines(text: string): Parsed[] {
  const out: Parsed[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const sep = line.includes('\t') ? '\t' : line.includes(',') ? ',' : ''
    if (!sep) {
      // 구분자가 없으면 제목만 있는 줄이다 — ID 는 서버가 매긴다
      out.push({ tcid: '', name: line, type: '' })
      continue
    }
    const cols = line.split(sep).map((c) => c.trim())
    out.push({ tcid: '', name: cols[0] ?? '', type: cols[1] ?? '' })
  }
  return out.filter((r) => r.name)
}

export default function TcBulkForm({ presetReqId, onClose }: Props) {
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const [reqId, setReqId] = useState(presetReqId ?? '')
  const [status, setStatus] = useState('대기')
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ ok: number; fail: number; skipped: number } | null>(
    null,
  )

  const reqQ = useQuery({
    queryKey: ['req', 'list'],
    queryFn: ({ signal }) => api.listRequirements(signal),
  })
  const tcQ = useQuery({
    queryKey: ['tc', 'list', 'meta'],
    queryFn: ({ signal }) => api.listTestCases(signal),
  })
  const reqs = reqQ.data?.reqs ?? []
  const existing = useMemo(
    () => new Set((tcQ.data?.tcs ?? []).map((t) => t.tcid)),
    [tcQ.data],
  )

  const parsed = useMemo(() => parseLines(text), [text])
  const valid = useMemo(() => parsed.filter((r) => r.name), [parsed])
  const dupes = useMemo(
    () => valid.filter((r) => existing.has(r.tcid)).length,
    [valid, existing],
  )

  const saveM = useMutation({
    mutationFn: async () => {
      let ok = 0
      let fail = 0
      // 순차 저장. save_tc 는 기존 스텝을 보존하려고 저장 전에 이전 값을 읽는다.
      for (const r of valid) {
        try {
          // 한 건씩 받아 쓴다 — 미리 여러 개 받아 두면 그 사이 남이 만든
          // 것과 겹칠 수 있다(서버는 「지금 최대 +1」 을 준다).
          const nres = await apiFetch('/api/tc-next-id')
          const tcid = ((await nres.json()) as { tcid?: string }).tcid || ''
          if (!tcid) throw new Error('ID 를 받지 못했습니다')
          await tcApi.save(tcid, {
            tcid,
            name: r.name,
            type: r.type,
            status,
            severity: 'Major',
            req_id: reqId || '',
          })
          ok++
        } catch {
          fail++
        }
      }
      return { ok, fail, skipped: parsed.length - valid.length }
    },
    onSuccess: (r) => {
      setDone(r)
      void qc.invalidateQueries({ queryKey: ['tc', 'list', 'meta'] })
      void qc.invalidateQueries({ queryKey: ['req', 'list'] })
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  })

  const submit = () => {
    if (valid.length === 0) {
      setError('TC ID 가 있는 줄이 없습니다. 첫 칸에 TC ID 를 넣으세요.')
      return
    }
    setError('')
    saveM.mutate()
  }

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div
        className="modal wide"
        role="dialog"
        aria-modal="true"
        aria-label="Test Case 일괄 생성"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <b>Test Case 일괄 생성</b>
          <button className="modal-x" type="button" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="form-error">{error}</div>}

          {done ? (
            <div className="hint">
              <b>{done.ok}건 생성 완료</b>
              {done.fail > 0 && ` · ${done.fail}건 실패`}
              {done.skipped > 0 && ` · ${done.skipped}건 건너뜀(ID 없음)`}
            </div>
          ) : (
            <>
              <div className="hint">
                한 줄에 한 건. <b>TC ID · 제목 · 유형</b> 순으로 <b>탭</b> 또는{' '}
                <b>쉼표</b>로 나눕니다. 유형은 없어도 됩니다.
                <br />
                TC ID 는 곧 식별자라 비울 수 없습니다 — 없는 줄은 건너뜁니다.
              </div>

              <label className="fld">
                <span>붙여넣기</span>
                <textarea
                  autoFocus
                  rows={10}
                  value={text}
                  placeholder={
                    'TC-E6100-RATE-001\tE6100 10G Rate Limit 검증\tRate Limit\n' +
                    'TC-E6100-VLAN-001\tVLAN Filtering 기본 동작\tVLAN\n' +
                    'TC-E6100-STP-001\tSTP 수렴 시간 측정\tSTP'
                  }
                  onChange={(e) => setText(e.target.value)}
                />
              </label>

              <div className="frow">
                <label className="fld">
                  <span>연결 요구사항 (전부 같은 요구사항으로)</span>
                  <select value={reqId} onChange={(e) => setReqId(e.target.value)}>
                    <option value="">(연결 안 함)</option>
                    {reqs.map((r) => (
                      <option key={reqPk(r)} value={reqPk(r)}>
                        {reqLabel(r)} · {r.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="fld">
                  <span>초기 상태</span>
                  <select value={status} onChange={(e) => setStatus(e.target.value)}>
                    {['대기', '작성중', 'PASS', 'FAIL', '보류'].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
              </div>

              {parsed.length > 0 && (
                <div className="fld">
                  <span>
                    미리보기 — {valid.length}건 생성
                    {parsed.length !== valid.length &&
                      ` · ${parsed.length - valid.length}건 건너뜀`}
                    {dupes > 0 && ` · ${dupes}건은 기존 TC 를 덮어씁니다`}
                  </span>
                  <div className="bulk-preview">
                    {parsed.slice(0, 30).map((r, i) => (
                      <div
                        className={`bulk-row${r.tcid ? '' : ' invalid'}`}
                        key={i}
                        title={r.tcid ? '' : 'TC ID 가 없어 건너뜁니다'}
                      >
                        <span className="tc-id">{r.tcid || '(ID 없음)'}</span>
                        <span className="req-name">{r.name || '(제목 없음)'}</span>
                        {r.type && <span className="tag">{r.type}</span>}
                        {r.tcid && existing.has(r.tcid) && (
                          <span className="tag" title="같은 ID 가 이미 있어 덮어씁니다">
                            덮어씀
                          </span>
                        )}
                      </div>
                    ))}
                    {parsed.length > 30 && (
                      <div className="bulk-row muted small">… 외 {parsed.length - 30}건</div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-foot">
          <span />
          <span className="page-head-actions">
            <button className="btn" type="button" onClick={onClose}>
              {done ? '닫기' : '취소'}
            </button>
            {!done && (
              <button
                className="btn primary"
                type="button"
                onClick={submit}
                disabled={saveM.isPending || valid.length === 0}
              >
                {saveM.isPending ? '생성 중…' : `${valid.length}건 생성`}
              </button>
            )}
          </span>
        </div>
      </div>
    </div>
  )
}
