import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { categoryApi, projectApi, reqApi, apiFetch } from '@/api/client'
import {
  categoryPath,
  reqLabel,
  reqPk,
  statusClass,
  type Requirement,
  type TestCaseMeta,
} from '@/types'
import LlmPick, { useLlmPick } from '@/components/LlmPick'
import Markdown from './Markdown'
import MarkdownEditor from './MarkdownEditorLazy'
import InfoPane from '@/components/info/InfoPane'
import { goto } from '@/api/goto'
import './ReqDetail.css'

interface Props {
  /** 상태·우선순위를 **늘 고칠 수 있게**(지시). 없으면 읽기 전용 */
  edit?: {
    title: string
    status: string
    priority: string
    statuses: readonly string[]
    priorities: readonly string[]
    onChange: (p: { title?: string; status?: string; priority?: string }) => void
  }
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

export default function ReqDetail({ req, tcs, tab, edit }: Props) {
  const catQ = useQuery({
    queryKey: ['req-categories'],
    queryFn: ({ signal }) => categoryApi.list(signal),
  })
  const cats = catQ.data?.categories ?? []

  // 가장 깊은 분류의 경로를 보여준다 (소분류가 있으면 대>중>소 전체가 나온다)
  const catText = useMemo(() => {
    const deepest = req.cat4 || req.cat3 || req.cat2 || req.cat1
    return categoryPath(cats, deepest) || '미분류'
  }, [cats, req])

  /** 소속 프로젝트 — 분류 사슬의 맨 위 폴더가 프로젝트면 그것이다.
      따로 설정하는 값이 아니라 트리 위치에서 자동으로 나온다. */
  const prjQ = useQuery({
    queryKey: ['projects'],
    queryFn: ({ signal }) => projectApi.list(signal),
  })
  const prj = useMemo(() => {
    const deepest = req.cat4 || req.cat3 || req.cat2 || req.cat1
    if (!deepest) return undefined
    const byId = new Map(cats.map((c) => [c.id, c]))
    let cur = byId.get(String(deepest))
    while (cur && cur.parent_id) {
      const up = byId.get(cur.parent_id)
      if (!up || up.id === cur.id) break
      cur = up
    }
    return cur ? (prjQ.data?.projects ?? []).find((p) => p.cat_id === cur!.id) : undefined
  }, [cats, prjQ.data, req])

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

  /** 요구사항 화면에서 **고른** 시험항목 — 보기·이동용이다(자료는 안 바뀐다).
      요구사항 1 : 시험항목 N 이라, 시험항목 화면의 「요구사항 제목」 과 뜻이
      다르다(그쪽은 매다는 곳을 바꾼다). */
  const [tcSel, setTcSel] = useState('')
  const curTc = tcs.find((t) => t.tcid === tcSel) ?? tcs[0]

  if (tab === 'info') {
    return (
      <InfoPane
        project={
          prj ? [prj.customer, prj.model_group, prj.model].filter(Boolean).join(' · ') : ''
        }
        category={catText}
        req={{
          id: reqPk(req),
          label: reqLabel(req),
          title: edit?.title ?? req.title ?? '',
          options: [],
          onPick: () => {},
          onTitle: (v) => edit?.onChange({ title: v }),
        }}
        tc={{
          id: curTc?.tcid ?? '',
          title: String(curTc?.name ?? ''),
          options: tcs.map((t) => ({ id: t.tcid, title: String(t.name ?? t.tcid) })),
          onPick: (id) => setTcSel(id),
          onGo: (id) => goto('tc', id),
          hint: tcs.length
            ? `이 요구사항을 덮는 시험항목 ${tcs.length}건 중 하나 — 골라서 ID 를 누르면 그리로 갑니다`
            : '덮는 시험항목이 없습니다',
        }}
        modelGroup={{ value: String(prj?.model_group ?? ''), options: [] }}
        model={{ value: String(prj?.model ?? ''), options: [] }}
        fields={[
          {
            key: 'status',
            label: '상태',
            value: edit?.status ?? String(req.status ?? ''),
            options: [...(edit?.statuses ?? [])],
            onChange: edit ? (v) => edit.onChange({ status: v }) : undefined,
          },
          {
            key: 'priority',
            label: '우선순위',
            value: edit?.priority ?? String(req.priority ?? ''),
            options: [...(edit?.priorities ?? [])],
            onChange: edit ? (v) => edit.onChange({ priority: v }) : undefined,
          },
        ]}
        record={{
          by: String(req.created_by ?? ''),
          at: fmt(req.created_at as string | undefined),
          upBy: String(req.updated_by ?? ''),
          upAt: fmt(req.updated_at as string | undefined),
        }}
        extra={
          <section className="ip-card">
            <div className="ip-h">
              덮는 시험 <em>{stat.total}건 · 통과 {stat.pass} · 실패 {stat.fail} · 대기 {stat.idle}</em>
            </div>
          </section>
        }
      />
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
        실행 시각·소요 시간은 플랜 실행 기능을 옮긴 뒤에 함께 표시됩니다.
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

  /**
   * 구현의도를 **AI 에게 다듬게 한다**(지시: Intent 에도 드롭바를).
   *
   * 바로 칸에 넣지 않는다 — 이미 쓴 글이 소리 없이 없어지면 안 된다.
   * 아래에 초안으로 보여 주고 「넣기」 를 누르면 그때 편집 칸으로 간다.
   */
  const [llm, setLlm] = useLlmPick('req-intent')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiText, setAiText] = useState('')

  const askAi = async () => {
    setAiBusy(true)
    setNote({ kind: '', msg: '' })
    try {
      const r = await apiFetch(`/api/req/${encodeURIComponent(reqPk(req))}/ai-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ req: { ...req, desc: editing ? draft : desc }, llm }),
      })
      const b = (await r.json().catch(() => ({}))) as { text?: string; detail?: string }
      if (!r.ok) throw new Error(b.detail || `만들지 못했습니다 (${r.status})`)
      setAiText(String(b.text || '').trim())
      if (!String(b.text || '').trim()) setNote({ kind: 'err', msg: '모델이 빈 글을 돌려줬습니다' })
    } catch (e) {
      setNote({ kind: 'err', msg: e instanceof Error ? e.message : String(e) })
    } finally {
      setAiBusy(false)
    }
  }

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
          <LlmPick value={llm} onChange={setLlm} />
          <button
            className="btn"
            type="button"
            onClick={() => void askAi()}
            disabled={aiBusy}
            title="제목과 이미 적힌 글을 읽고 구현의도 초안을 씁니다"
          >
            {/* 이름은 「✨ AI」 한 벌이다(지시). 도는 동안 글자를 바꾸면
                단추 폭이 들썩이고, 무엇보다 「쓰는 중」 「뽑는 중」 이 자리마다
                달라 읽는 사람이 매번 새로 읽어야 했다. 도는 것은 별표가
                숨쉬는 것으로 보인다 */}
            <span className={`ai-mark${aiBusy ? ' on' : ''}`}>✨</span> AI
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

      {/* AI 초안 — 사람이 읽고 넣는다. 바로 덮으면 되돌릴 수가 없다 */}
      {aiText && (
        <div className="rd-ai">
          <div className="rd-ai-head">
            <b>이렇게 쓸까요</b>
            <span className="sp" />
            <button
              className="btn small primary"
              type="button"
              onClick={() => {
                setDraft(aiText)
                setEditing(true)
                setAiText('')
              }}
            >
              편집칸에 넣기
            </button>
            <button className="btn small" type="button" onClick={() => setAiText('')}>
              버리기
            </button>
          </div>
          <div className="rd-ai-body">
            <Markdown text={aiText} />
          </div>
        </div>
      )}

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