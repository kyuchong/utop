import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiFetch, tcApi } from '@/api/client'
import { reqLabel, reqPk, type TestCaseMeta } from '@/types'
import { useCodes } from '@/hooks/useCodes'
import { missingRequired, useCustomFields } from '@/hooks/useCustomFields'
import CustomFieldInputs from './CustomFieldInputs'
import './ReqForm.css'

interface Props {
  /** null 이면 새로 만들기, 값이 있으면 그 TC 편집 */
  editing: TestCaseMeta | null
  /** 새로 만들 때 미리 연결해 둘 요구사항 (요구사항 화면의 「+ TC 생성」) */
  presetReqId?: string
  onClose: () => void
}

const FB_STATUS = ['작성중', '검토중', '승인', 'PASS', 'FAIL', '보류']
const FB_SEVERITY = ['치명', '중대', '보통', '경미']
const FB_TYPE = ['FT', 'Function']

export default function TcForm({ editing, presetReqId, onClose }: Props) {
  const qc = useQueryClient()
  const isNew = editing === null

  const [tcid, setTcid] = useState('')
  const [name, setName] = useState('')
  const [reqId, setReqId] = useState('')
  const [type, setType] = useState('')
  const STATUSES = useCodes('tc_status', FB_STATUS)
  const SEVERITIES = useCodes('tc_severity', FB_SEVERITY)
  const TYPES = useCodes('tc_type', FB_TYPE)
  const [status, setStatus] = useState(FB_STATUS[0]!)
  const [severity, setSeverity] = useState(FB_SEVERITY[1]!)
  const [error, setError] = useState('')
  // 설정 → 커스텀 필드에서 팀이 늘린 칸. 값은 data->'custom' 에 산다.
  const [custom, setCustom] = useState<Record<string, unknown>>({})
  const cf = useCustomFields('tc')

  useEffect(() => {
    setTcid(editing?.tcid ?? '')
    // 새로 만들 때는 서버가 주차별로 매기는 다음 ID(TC-2632-0001)를 받아
    // 채운다. 사람이 못 바꾼다 — tcid 는 곧 PK 라, 손으로 바꾸면 남의
    // 시험을 덮거나 사이클·실행 이력의 참조가 끊긴다.
    if (editing === null) {
      void (async () => {
        try {
          const r = await apiFetch('/api/tc-next-id')
          const j = (await r.json()) as { tcid?: string }
          if (j.tcid) setTcid(j.tcid)
        } catch {
          /* 실패해도 저장할 때 사람이 볼 수 있게 빈 칸으로 둔다 */
        }
      })()
    }
    setName(editing?.name ?? '')
    setReqId(editing?.req_id ?? presetReqId ?? '')
    setType(editing?.type ?? '')
    setStatus(editing?.status || FB_STATUS[0]!)
    setSeverity(editing?.severity || FB_SEVERITY[1]!)
    // 화면에 안 보이는 칸의 값까지 통째로 들고 있다가 그대로 돌려보낸다.
    // 저장이 data 를 통째로 덮어쓰므로(main.py:save_tc) 여기서 빠뜨리면
    // 숨긴 칸의 값이 조용히 사라진다.
    const c = editing?.custom
    setCustom(c && typeof c === 'object' ? { ...(c as Record<string, unknown>) } : {})
    setError('')
  }, [editing, presetReqId])

  const reqQ = useQuery({
    queryKey: ['req', 'list'],
    queryFn: ({ signal }) => api.listRequirements(signal),
  })
  const reqs = reqQ.data?.reqs ?? []

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['tc', 'list', 'meta'] })
    void qc.invalidateQueries({ queryKey: ['req', 'list'] })
  }
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e))

  const saveM = useMutation({
    mutationFn: () =>
      // tcid 가 곧 PK 다(REQ 와 달리 별도 PK 가 없다). 그래서 편집 중에는
      // tcid 를 바꾸지 못하게 막는다 — 바꾸면 새 TC 가 생기고 원본이 남는다.
      tcApi.save(isNew ? tcid.trim() : editing.tcid, {
        tcid: isNew ? tcid.trim() : editing.tcid,
        name: name.trim(),
        req_id: reqId || '',
        type: type.trim(),
        status,
        severity,
        custom,
      }),
    onSuccess: () => {
      invalidate()
      onClose()
    },
    onError: fail,
  })

  const removeM = useMutation({
    mutationFn: () => tcApi.remove(editing!.tcid),
    onSuccess: () => {
      invalidate()
      onClose()
    },
    onError: fail,
  })

  const submit = () => {
    if (isNew && !tcid.trim()) {
      setError('TC ID 를 입력하세요')
      return
    }
    if (!name.trim()) {
      setError('제목을 입력하세요')
      return
    }
    // 필수는 보이는 칸만 따진다. 숨긴 칸을 필수로 걸어두면 고칠 방법이
    // 없는 채로 저장이 막힌다.
    const miss = missingRequired(cf.inForm, custom)
    if (miss) {
      setError(`'${miss}' 을 입력하세요`)
      return
    }
    saveM.mutate()
  }

  const doDelete = () => {
    if (!window.confirm(`'${editing!.tcid}' 를 삭제합니다. 계속할까요?`)) return
    removeM.mutate()
  }

  const busy = saveM.isPending || removeM.isPending

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={isNew ? '테스트케이스 추가' : '테스트케이스 편집'}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <b>{isNew ? '테스트케이스 추가' : '테스트케이스 편집'}</b>
          <button className="modal-x" type="button" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="form-error">{error}</div>}

          <div className="frow">
            <label className="fld">
              <span>TC ID {isNew ? '· 자동 부여' : '· 고정'}</span>
              {/* ID 는 사람이 못 바꾼다. 새로 만들면 서버가 주차별로 매기고
                  (TC-2632-0001), 이미 있는 것은 그대로 잠근다. */}
              <input
                value={tcid || (isNew ? '자동 부여 중…' : '')}
                readOnly
                className="ro"
                title="시험 ID 는 자동으로 매겨지며 수정할 수 없습니다"
              />
            </label>
            <label className="fld">
              <span>상태</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="fld">
              <span>중요도</span>
              <select value={severity} onChange={(e) => setSeverity(e.target.value)}>
                {SEVERITIES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="fld">
            <span>제목</span>
            <input
              autoFocus
              value={name}
              placeholder="E6100 10G Rate Limit 검증 (1518B)"
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <div className="frow">
            <label className="fld">
              <span>연결 요구사항</span>
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
              <span>유형</span>
              {/* 자유 입력이면 'FT' 와 'ft' 가 갈려 같은 유형이 둘로 보인다.
                  목록은 설정 → TC INFO 필드에서 늘린다. */}
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">(선택)</option>
                {TYPES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>

          <CustomFieldInputs
            fields={cf.inForm}
            values={custom}
            onChange={(k, v) => setCustom((c) => ({ ...c, [k]: v }))}
          />

          {!isNew && (
            <div className="hint">
              시험 절차 {editing._cli_count ?? 0}스텝은 이 창에서 고치지 않습니다.
              스텝 편집 화면은 다음 작업으로 붙입니다 — 지금 저장해도 기존
              스텝은 그대로 보존됩니다.
            </div>
          )}
        </div>

        <div className="modal-foot">
          <span>
            {!isNew && (
              <button
                className="btn danger"
                type="button"
                onClick={doDelete}
                disabled={busy}
              >
                삭제
              </button>
            )}
          </span>
          <span className="page-head-actions">
            <button className="btn" type="button" onClick={onClose} disabled={busy}>
              취소
            </button>
            <button className="btn primary" type="button" onClick={submit} disabled={busy}>
              {busy ? '저장 중…' : '저장'}
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}
