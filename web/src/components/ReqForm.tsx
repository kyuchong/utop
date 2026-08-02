import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { categoryApi, reqApi } from '@/api/client'
import { buildCategoryTree, reqPk, type Requirement } from '@/types'
import './ReqForm.css'

interface Props {
  /** null 이면 새로 만들기, 값이 있으면 그 요구사항 편집 */
  editing: Requirement | null
  onClose: () => void
}

const STATUSES = ['작성중', '검토중', '검토완료', '보류', '폐기']
const PRIORITIES = ['High', 'Medium', 'Low']

export default function ReqForm({ editing, onClose }: Props) {
  const qc = useQueryClient()
  const isNew = editing === null

  const [reqid, setReqid] = useState('')
  const [title, setTitle] = useState('')
  const [cat1, setCat1] = useState('')
  const [cat2, setCat2] = useState('')
  const [status, setStatus] = useState(STATUSES[0]!)
  const [priority, setPriority] = useState(PRIORITIES[1]!)
  const [desc, setDesc] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    setReqid(editing?.reqid ?? '')
    setTitle(editing?.title ?? '')
    setCat1(editing?.cat1 ?? '')
    setCat2(editing?.cat2 ?? '')
    setStatus(editing?.status || STATUSES[0]!)
    setPriority(editing?.priority || PRIORITIES[1]!)
    setDesc(typeof editing?.desc === 'string' ? editing.desc : '')
    setError('')
  }, [editing])

  const catQ = useQuery({
    queryKey: ['req-categories'],
    queryFn: ({ signal }) => categoryApi.list(signal),
  })
  const tree = useMemo(
    () => buildCategoryTree(catQ.data?.categories ?? []),
    [catQ.data],
  )
  const children = useMemo(
    () => tree.find((p) => p.id === cat1)?.children ?? [],
    [tree, cat1],
  )

  const saveM = useMutation({
    mutationFn: async () => {
      // PK 는 한 번 정해지면 바꾸지 않는다. reqid(REQ-001)는 사람이 읽는 이름이라
      // 나중에 바뀔 수 있어서, 그걸 PK 로 쓰면 이름을 고칠 때마다 행이 갈라진다.
      const id = isNew ? `rq-${Date.now()}` : reqPk(editing)
      return reqApi.save(id, {
        reqid: reqid.trim(),
        title: title.trim(),
        cat1: cat1 || null,
        cat2: cat2 || null,
        status,
        priority,
        desc: desc.trim(),
      })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['req', 'list'] })
      void qc.invalidateQueries({ queryKey: ['req-categories'] })
      onClose()
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  })

  const removeM = useMutation({
    mutationFn: () => reqApi.remove(reqPk(editing!)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['req', 'list'] })
      void qc.invalidateQueries({ queryKey: ['req-categories'] })
      void qc.invalidateQueries({ queryKey: ['tc', 'list', 'meta'] })
      onClose()
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  })

  const submit = () => {
    if (!title.trim()) {
      setError('제목을 입력하세요')
      return
    }
    saveM.mutate()
  }

  const doDelete = () => {
    const n = editing?.tc?.length ?? 0
    const warn =
      n > 0
        ? `연결된 TC ${n}건도 함께 삭제됩니다.\n`
        : ''
    if (!window.confirm(`'${title || reqid}' 을 삭제합니다.\n${warn}계속할까요?`)) return
    removeM.mutate()
  }

  const busy = saveM.isPending || removeM.isPending

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={isNew ? '요구사항 추가' : '요구사항 편집'}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <b>{isNew ? '요구사항 추가' : '요구사항 편집'}</b>
          <button className="modal-x" type="button" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="form-error">{error}</div>}

          <div className="frow">
            <label className="fld">
              <span>REQ ID</span>
              <input
                value={reqid}
                placeholder="REQ-001"
                onChange={(e) => setReqid(e.target.value)}
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
              <span>우선순위</span>
              <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                {PRIORITIES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="fld">
            <span>제목</span>
            <input
              autoFocus
              value={title}
              placeholder="10G Rate Limit 지원"
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>

          <div className="frow">
            <label className="fld">
              <span>대분류</span>
              <select
                value={cat1}
                onChange={(e) => {
                  setCat1(e.target.value)
                  setCat2('') // 대분류가 바뀌면 중분류는 반드시 다시 고른다
                }}
              >
                <option value="">(미분류)</option>
                {tree.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="fld">
              <span>중분류</span>
              <select
                value={cat2}
                disabled={!cat1 || children.length === 0}
                onChange={(e) => setCat2(e.target.value)}
              >
                <option value="">
                  {!cat1
                    ? '(대분류를 먼저 고르세요)'
                    : children.length === 0
                      ? '(중분류 없음)'
                      : '(선택 안 함)'}
                </option>
                {children.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="fld">
            <span>설명</span>
            <textarea
              rows={5}
              value={desc}
              placeholder="요구사항 내용을 적습니다."
              onChange={(e) => setDesc(e.target.value)}
            />
          </label>
        </div>

        <div className="modal-foot">
          <span>
            {!isNew && (
              <button className="btn danger" type="button" onClick={doDelete} disabled={busy}>
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
