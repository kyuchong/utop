import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { categoryApi, reqApi, apiFetch } from '@/api/client'
import {
  categoryPath,
  reqLabel,
  reqPk,
  statusClass,
  type Requirement,
  type TestCaseMeta,
} from '@/types'
import Markdown from './Markdown'
import MarkdownEditor from './MarkdownEditorLazy'
import './ReqDetail.css'

interface Props {
  req: Requirement
  /** 이 요구사항에 연결된 TC (Requirements 페이지가 이미 계산해 둔 것) */
  tcs: TestCaseMeta[]
  tab: 'info' | 'detail' | 'history' | 'runs'
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

  const desc = typeof req.desc === 'string' ? req.desc : ''

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

  if (tab === 'info') {
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

      </div>
    )
  }

  if (tab === 'detail') {
    // 본문만. 메타데이터는 'REQ Info' 탭에 있다 — 규격서를 읽을 때마다
    // 6줄짜리 표를 지나 스크롤하게 만들 이유가 없다.
    return <DetailDoc req={req} desc={desc} />
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


/**
 * REQ Details — 읽기와 편집을 한자리에서.
 *
 * 규격서는 자주 손본다. 고칠 때마다 창을 열었다 닫는 건 흐름을 끊는다.
 * 그래서 이 탭 안에서 바로 고치고 저장한다.
 *
 * 다만 기본은 읽기다. 편집으로 들어가야 글이 바뀌므로 실수로 건드릴 일이 없고,
 * 저장하지 않고 나가려 하면 붙잡는다.
 */
function DetailDoc({ req, desc }: { req: Requirement; desc: string }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(desc)
  const [error, setError] = useState('')
  const savedRef = useRef(desc)

  // 파일 등록 / 벡터 저장 — 편집 창에만 있던 것을 여기서도 쓸 수 있게 한다.
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [embedding, setEmbedding] = useState(false)
  const [note, setNote] = useState<{ kind: string; msg: string }>({ kind: '', msg: '' })

  const doImport = async (f: File) => {
    setImporting(true)
    setNote({ kind: '', msg: '' })
    try {
      let md: string
      if (/\.(md|markdown|txt)$/i.test(f.name)) {
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
      // 덮지 않고 아래에 잇는다 — 실수로 날리면 되돌릴 수 없다.
      setDraft((cur) => (cur.trim() ? `${cur}

---

${md}` : md))
      setEditing(true)
      setNote({ kind: 'ok', msg: `${f.name} 불러옴 · 저장을 눌러야 반영됩니다` })
    } catch (e) {
      setNote({ kind: 'err', msg: e instanceof Error ? e.message : String(e) })
    } finally {
      setImporting(false)
    }
  }

  const doEmbed = async () => {
    setEmbedding(true)
    setNote({ kind: '', msg: '' })
    try {
      const res = await apiFetch(`/api/req/${encodeURIComponent(reqPk(req))}/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: editing ? draft : desc }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error(b.detail || `저장 실패 (${res.status})`)
      }
      const r = await res.json()
      setNote({ kind: 'ok', msg: `벡터 저장 완료 (${r.chunks ?? 0}조각)` })
    } catch (e) {
      setNote({ kind: 'err', msg: e instanceof Error ? e.message : String(e) })
    } finally {
      setEmbedding(false)
    }
  }

  // 다른 요구사항으로 옮겨가면 편집을 닫고 새 내용을 싣는다
  useEffect(() => {
    setEditing(false)
    setDraft(desc)
    savedRef.current = desc
    setError('')
  }, [reqPk(req), desc])

  const dirty = editing && draft !== savedRef.current

  const saveM = useMutation({
    mutationFn: () =>
      // 본문만 바꾼다. 나머지 필드는 그대로 실어 보내야 서버가 덮어쓰지 않는다.
      reqApi.save(reqPk(req), { ...req, desc: draft.trim() }),
    onSuccess: () => {
      savedRef.current = draft
      setEditing(false)
      setError('')
      void qc.invalidateQueries({ queryKey: ['req', 'list'] })
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  })

  const cancel = () => {
    if (dirty && !window.confirm('저장하지 않은 변경이 있습니다. 버릴까요?')) return
    setDraft(savedRef.current)
    setEditing(false)
    setError('')
  }

  return (
    <div className="detail-doc-wrap">
      <div className="doc-bar">
        <span className={`small ${note.kind || 'muted'}`}>
          {note.msg || (editing ? (dirty ? '수정 중 · 저장하지 않음' : '수정 중') : '읽기')}
        </span>
        <span className="page-head-actions">
          <input
            ref={fileRef}
            type="file"
            accept=".md,.markdown,.txt,.docx,.pdf,.xlsx,.pptx,.html,.htm"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void doImport(f)
            }}
          />
          <button
            className="btn"
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={importing}
          >
            {importing ? '변환 중…' : '파일 등록'}
          </button>
          <button
            className="btn"
            type="button"
            onClick={doEmbed}
            disabled={embedding || !(editing ? draft : desc).trim()}
            title="구현내용을 검색·TC 생성에 쓸 수 있도록 벡터로 저장합니다"
          >
            {embedding ? '저장 중…' : '벡터 저장'}
          </button>
          {editing ? (
            <>
              <button className="btn" type="button" onClick={cancel} disabled={saveM.isPending}>
                취소
              </button>
              <button
                className="btn primary"
                type="button"
                onClick={() => saveM.mutate()}
                disabled={saveM.isPending || !dirty}
              >
                {saveM.isPending ? '저장 중…' : '저장'}
              </button>
            </>
          ) : (
            <button className="btn primary" type="button" onClick={() => setEditing(true)}>
              편집
            </button>
          )}
        </span>
      </div>

      {error && <div className="form-error">{error}</div>}

      {editing ? (
        <div className="doc-editor">
          <MarkdownEditor
            value={draft}
            onChange={setDraft}
            placeholder="무엇을, 어떻게 구현하는지 적습니다."
          />
        </div>
      ) : (
        <div className="detail-body scroll detail-doc">
          <Markdown text={desc} empty="구현내용이 없습니다. 「편집」을 눌러 넣으세요." />
        </div>
      )}
    </div>
  )
}