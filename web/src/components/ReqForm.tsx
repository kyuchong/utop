import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { categoryApi, reqApi } from '@/api/client'
import { buildCategoryTree, reqPk, type Requirement } from '@/types'
import MarkdownEditor from './MarkdownEditorLazy'
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
  const [cat3, setCat3] = useState('')
  const [status, setStatus] = useState(STATUSES[0]!)
  const [priority, setPriority] = useState(PRIORITIES[1]!)
  const [desc, setDesc] = useState('')
  const [error, setError] = useState('')

  // 파일 등록 / 벡터 저장
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [embedding, setEmbedding] = useState(false)
  const [importState, setImportState] = useState<{ kind: string; msg: string }>({
    kind: '',
    msg: '',
  })

  /**
   * 문서를 마크다운으로 바꿔 구현내용에 넣는다.
   * .md/.txt 는 브라우저에서 바로 읽고, 나머지(.docx/.pdf/…)는 서버가 변환한다 —
   * 워드 파일은 브라우저가 제대로 못 읽는다.
   */
  const doImport = async (f: File) => {
    setImporting(true)
    setImportState({ kind: '', msg: '' })
    try {
      const plain = /\.(md|markdown|txt)$/i.test(f.name)
      let md: string
      if (plain) {
        md = await f.text()
      } else {
        const fd = new FormData()
        fd.append('file', f)
        const res = await fetch('/api/convert/markdown', { method: 'POST', body: fd })
        if (!res.ok) {
          const b = await res.json().catch(() => ({}))
          throw new Error(b.detail || `변환 실패 (${res.status})`)
        }
        md = (await res.json()).markdown ?? ''
      }
      // 기존 내용이 있으면 덮지 않고 아래에 잇는다 — 실수로 날리면 되돌릴 수 없다.
      setDesc((cur) => (cur.trim() ? `${cur}

---

${md}` : md))
      setImportState({ kind: 'ok', msg: `${f.name} 불러옴` })
    } catch (e) {
      setImportState({ kind: 'err', msg: e instanceof Error ? e.message : String(e) })
    } finally {
      setImporting(false)
    }
  }

  /** 구현내용을 검색·TC 생성에 쓸 수 있도록 벡터로 저장한다 */
  const doEmbed = async () => {
    setEmbedding(true)
    setImportState({ kind: '', msg: '' })
    try {
      const res = await fetch(
        `/api/req/${encodeURIComponent(isNew ? reqid.trim() : reqPk(editing))}/embed`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: desc }),
        },
      )
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error(b.detail || `저장 실패 (${res.status})`)
      }
      const r = await res.json()
      setImportState({ kind: 'ok', msg: `벡터 저장 완료 (${r.chunks ?? 0}조각)` })
    } catch (e) {
      setImportState({ kind: 'err', msg: e instanceof Error ? e.message : String(e) })
    } finally {
      setEmbedding(false)
    }
  }

  useEffect(() => {
    setReqid(editing?.reqid ?? '')
    setTitle(editing?.title ?? '')
    setCat1(editing?.cat1 ?? '')
    setCat2(editing?.cat2 ?? '')
    setCat3(editing?.cat3 ?? '')
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
  const lv2 = useMemo(() => tree.find((p) => p.id === cat1)?.children ?? [], [tree, cat1])
  const lv3 = useMemo(() => lv2.find((p) => p.id === cat2)?.children ?? [], [lv2, cat2])

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
        cat3: cat3 || null,
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
        className="modal tall"
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
                  // 상위가 바뀌면 아래 단계는 반드시 다시 고른다 (남아 있으면 짝이 안 맞는다)
                  setCat1(e.target.value)
                  setCat2('')
                  setCat3('')
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
                disabled={!cat1 || lv2.length === 0}
                onChange={(e) => {
                  setCat2(e.target.value)
                  setCat3('')
                }}
              >
                <option value="">
                  {!cat1 ? '(대분류 먼저)' : lv2.length === 0 ? '(하위 없음)' : '(선택 안 함)'}
                </option>
                {lv2.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="fld">
              <span>소분류</span>
              <select
                value={cat3}
                disabled={!cat2 || lv3.length === 0}
                onChange={(e) => setCat3(e.target.value)}
              >
                <option value="">
                  {!cat2 ? '(중분류 먼저)' : lv3.length === 0 ? '(하위 없음)' : '(선택 안 함)'}
                </option>
                {lv3.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="fld wide">
            <div className="fld-head">
              <span>구현내용</span>
              <div className="md-actions">
                <span className={`stat ${importState.kind}`}>{importState.msg}</span>
                <button
                  type="button"
                  className="btn"
                  onClick={() => fileRef.current?.click()}
                  disabled={importing}
                >
                  {importing ? '변환 중…' : '파일 등록'}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={doEmbed}
                  disabled={embedding || !desc.trim()}
                  title="구현내용을 검색·TC 생성에 쓸 수 있도록 벡터로 저장합니다"
                >
                  {embedding ? '저장 중…' : '벡터 저장'}
                </button>
              </div>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".md,.markdown,.txt,.docx,.pdf,.xlsx,.pptx,.html,.htm"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) doImport(f)
              }}
            />
            <MarkdownEditor
              value={desc}
              onChange={setDesc}
              placeholder={
                '무엇을, 어떻게 구현하는지 적습니다.\n\n' +
                '## 동작\n' +
                '- 포트별 rate limit 을 1Mbps 단위로 설정한다\n' +
                '- 설정값 초과 트래픽은 drop 한다\n\n' +
                '## CLI\n' +
                '```\n' +
                'rate-limit input 100000\n' +
                '```\n\n' +
                '## 판정 기준\n' +
                '| 항목 | 기준 |\n' +
                '|---|---|\n' +
                '| 오차 | ±2% 이내 |'
              }
            />
          </div>
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
