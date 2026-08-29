import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { categoryApi, reqApi, apiFetch } from '@/api/client'
import { buildCategoryTree, reqPk, type Requirement } from '@/types'
import { useCodes } from '@/hooks/useCodes'
import { missingRequired, useCustomFields } from '@/hooks/useCustomFields'
import CustomFieldInputs from './CustomFieldInputs'
import MarkdownEditor from './MarkdownEditorLazy'
import './ReqForm.css'

interface Props {
  /** null 이면 새로 만들기, 값이 있으면 그 요구사항 편집 */
  editing: Requirement | null
  /**
   * 새로 만들 때 미리 넣어 둘 폴더(그 폴더의 id).
   *
   * 1열에서 폴더를 열어 놓고 「Add」 를 눌렀으면 그 폴더에 넣으려는 것이다.
   * 분류를 다시 고르게 하면 방금 고른 것을 한 번 더 고르는 셈이다.
   */
  presetFolder?: string | null
  onClose: () => void
}

// 서버가 아직 값을 안 준 첫 렌더에서 드롭다운이 비지 않도록 하는 기본값.
// 진짜 목록은 설정 → 요구사항 INFO 필드에 있다.
const FB_STATUS = ['작성중', '검토중', '검토완료', '보류', '폐기']
const FB_PRIORITY = ['High', 'Medium', 'Low']

export default function ReqForm({ editing, presetFolder, onClose }: Props) {
  const qc = useQueryClient()
  const isNew = editing === null

  const [reqid, setReqid] = useState('')
  const [title, setTitle] = useState('')
  const [cat1, setCat1] = useState('')
  const [cat2, setCat2] = useState('')
  const [cat3, setCat3] = useState('')
  const [cat4, setCat4] = useState('')
  const STATUSES = useCodes('req_status', FB_STATUS)
  const PRIORITIES = useCodes('req_priority', FB_PRIORITY)
  const [status, setStatus] = useState(FB_STATUS[0]!)
  const [priority, setPriority] = useState(FB_PRIORITY[1]!)
  const [desc, setDesc] = useState('')
  const [error, setError] = useState('')
  // 설정 → 커스텀 필드에서 팀이 늘린 칸. 값은 data->'custom' 에 산다.
  const [custom, setCustom] = useState<Record<string, unknown>>({})
  const cf = useCustomFields('req')

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
        const res = await apiFetch('/api/convert/markdown', { method: 'POST', body: fd })
        if (!res.ok) {
          const b = await res.json().catch(() => ({}))
          throw new Error(b.detail || `변환 실패 (${res.status})`)
        }
        md = (await res.json()).markdown ?? ''
      }
      // 기존 내용이 있으면 덮지 않고 아래에 잇는다 - 실수로 날리면 되돌릴 수 없다.
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
      const res = await apiFetch(
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
    // 새 ID 는 아래의 딴 effect 가 받는다 — 폴더에 따라 앞머리가 갈리므로
    // 폴더를 고를 때마다 다시 물어야 한다.

    setTitle(editing?.title ?? '')
    setCat1(editing?.cat1 ?? '')
    setCat2(editing?.cat2 ?? '')
    setCat3(editing?.cat3 ?? '')
    setCat4(editing?.cat4 ?? '')
    setStatus(editing?.status || FB_STATUS[0]!)
    setPriority(editing?.priority || FB_PRIORITY[1]!)
    setDesc(typeof editing?.desc === 'string' ? editing.desc : '')
    // 화면에 안 보이는 칸(show_form 이 꺼진 것)의 값도 통째로 들고 있다가
    // 그대로 돌려보낸다. 저장은 data 를 통째로 덮어쓰기 때문에, 여기서
    // 빠뜨리면 안 보이는 칸의 값이 조용히 사라진다.
    const c = editing?.custom
    setCustom(c && typeof c === 'object' ? { ...(c as Record<string, unknown>) } : {})
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

  /**
   * 새로 만들 때, 열어 둔 폴더의 **조상 사슬**로 대·중·소분류를 채운다.
   *
   * 폴더가 3단계 아래면 cat1·cat2·cat3 가 그 사슬대로 들어간다. ReqTree 가
   * 요구사항을 옮길 때 쓰는 규칙과 같다 — 그래야 트리에서 같은 자리에 뜬다.
   * 분류 목록이 늦게 와도 되게, 목록이 도착한 뒤에 한 번 채운다.
   */
  useEffect(() => {
    if (!isNew || !presetFolder) return
    const all = catQ.data?.categories ?? []
    if (!all.length) return
    const byId = new Map(all.map((c) => [c.id, c]))
    const chain: string[] = []
    let cur = byId.get(presetFolder)
    while (cur && chain.length < 4) {
      chain.unshift(cur.id)
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined
    }
    setCat1(chain[0] ?? '')
    setCat2(chain[1] ?? '')
    setCat3(chain[2] ?? '')
    setCat4(chain[3] ?? '')
  }, [isNew, presetFolder, catQ.data])
  /* 새 ID — **어느 폴더에 만드느냐**에 따라 앞머리가 갈린다(E61xx_R0001).
     그 폴더의 뿌리 프로젝트가 모델그룹을 쥐고 있어서, 폴더를 고칠 때마다
     다시 받는다. 사람이 못 바꾼다 — 손으로 바꾸면 번호가 겹친다. */
  const deepCat = cat4 || cat3 || cat2 || cat1
  useEffect(() => {
    if (editing !== null) return
    let dead = false
    void (async () => {
      try {
        const r = await apiFetch(`/api/req-next-id?cat=${encodeURIComponent(deepCat)}`)
        const j = (await r.json()) as { reqid?: string }
        if (!dead && j.reqid) setReqid(j.reqid)
      } catch {
        /* 실패해도 저장 시 서버가 채운다 */
      }
    })()
    return () => {
      dead = true
    }
  }, [editing, deepCat])

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
        cat4: cat4 || null,
        status,
        priority,
        desc: desc.trim(),
        custom,
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
              <span>REQ ID {isNew ? '· 자동 부여' : '· 고정'}</span>
              {/* ID 는 사람이 못 바꾼다. 새로 만들면 서버가 주차별로 매기고
                  (REQ-2615-0001), 이미 있는 것은 그대로 잠근다 — 바꾸면
                  붙어 있는 TC·추적성이 어긋난다. */}
              <input
                value={reqid || (isNew ? '자동 부여 중…' : '')}
                readOnly
                className="ro"
                title="요구사항 ID 는 자동으로 매겨지며 수정할 수 없습니다"
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

          <CustomFieldInputs
            fields={cf.inForm}
            values={custom}
            onChange={(k, v) => setCustom((c) => ({ ...c, [k]: v }))}
          />
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
