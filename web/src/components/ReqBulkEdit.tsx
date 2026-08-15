import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, apiFetch, reqApi } from '@/api/client'
import MarkdownEditor from '@/components/MarkdownEditorLazy'
import { reqLabel, reqPk, type Requirement } from '@/types'

interface Props {
  /** 고른 요구사항 PK 들 */
  ids: string[]
  onClose: () => void
  onDone: (msg: string) => void
}

/** 무엇을 바꿀지 */
interface Fill {
  status: boolean
  priority: boolean
  folder: boolean
  desc: boolean
}

interface CodeItem {
  kind: string
  value: string
}

interface Cat {
  id: string
  name: string
  parent_id?: string | null
}

/**
 * 여러 요구사항을 한 번에 고치기.
 *
 * 같은 상태·우선순위를 열 건에 손으로 열 번 바꾸는 일이 있었다. 한 건당
 * 열고·고치고·저장하고·닫기라 마흔 번을 누른다.
 *
 * TC 쪽 Bulk 수정과 **같은 규칙**을 쓴다.
 *
 *  · 바꿀 항목을 고른다 — 셋을 한꺼번에 밀면 안 건드린 칸이 빈 값으로 덮인다
 *  · 대상 목록을 옆에 세운다. 「10건」 이라는 숫자만 보고 누르게 하면
 *    잘못 고른 한 건이 그 안에 있어도 모른다
 *  · 끝나면 몇 건이 바뀌었는지 말한다
 */
export default function ReqBulkEdit({ ids, onClose, onDone }: Props) {
  const [fill, setFill] = useState<Fill>({
    status: true,
    priority: false,
    folder: false,
    desc: false,
  })
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [folder, setFolder] = useState('')
  /** 구현 내용 — TC Bulk 와 같은 서식 편집기, 같은 「비어 있는 것만」 규칙 */
  const [desc, setDesc] = useState('')
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose, busy])

  const reqQ = useQuery({ queryKey: ['reqs'], queryFn: ({ signal }) => api.listRequirements(signal) })
  const codeQ = useQuery({
    queryKey: ['codes'],
    queryFn: async () => {
      const r = await apiFetch('/api/codes')
      if (!r.ok) throw new Error('목록을 불러오지 못했습니다')
      return (await r.json()) as { items: CodeItem[] }
    },
    staleTime: 60_000,
  })
  const catQ = useQuery({
    queryKey: ['req-categories'],
    queryFn: async () => {
      const r = await apiFetch('/api/req-categories')
      if (!r.ok) throw new Error('분류를 불러오지 못했습니다')
      return (await r.json()) as { categories: Cat[] }
    },
  })

  const all = reqQ.data?.reqs ?? []
  const targets = ids
    .map((id) => all.find((r) => reqPk(r) === id))
    .filter((x): x is Requirement => !!x)
  const codes = (k: string) => (codeQ.data?.items ?? []).filter((x) => x.kind === k).map((x) => x.value)
  const cats = catQ.data?.categories ?? []

  const ready =
    (fill.status && status) ||
    (fill.priority && priority) ||
    (fill.folder && folder !== '') ||
    (fill.desc && desc.trim() !== '')

  const apply = async () => {
    setBusy(true)
    setErr('')
    let done = 0
    const fails: string[] = []
    for (const r of targets) {
      try {
        // 있는 값 위에 얹는다. 통째로 보내면 안 건드린 칸이 사라진다.
        const body: Record<string, unknown> = { ...r }
        if (fill.status && status) body.status = status
        if (fill.priority && priority) body.priority = priority
        if (fill.desc && desc.trim()) {
          const had = String((r as Record<string, unknown>).desc ?? '').trim()
          if (!had || over) body.desc = desc
        }
        if (fill.folder) {
          // 분류는 네 칸(cat1~4)에 나뉘어 있다. 옮길 때는 맨 아래 칸에 넣고
          // 나머지를 비워야 트리가 두 군데에 걸치지 않는다.
          body.cat1 = folder || null
          body.cat2 = null
          body.cat3 = null
          body.cat4 = null
        }
        await reqApi.save(reqPk(r), body)
        done++
      } catch {
        fails.push(reqLabel(r))
      }
    }
    setBusy(false)
    if (fails.length) setErr(`${fails.length}건 실패 — ${fails.slice(0, 3).join(', ')}`)
    else onDone(`${done}건을 고쳤습니다`)
  }

  const row = (key: keyof Fill, label: string, body: React.ReactNode) => (
    <div className={`bk-row${fill[key] ? ' on' : ''}`}>
      <label className="bk-name">
        <input
          type="checkbox"
          checked={fill[key]}
          onChange={(e) => setFill((f) => ({ ...f, [key]: e.target.checked }))}
        />
        <b>{label}</b>
      </label>
      {fill[key] && <div className="bk-body">{body}</div>}
    </div>
  )

  return (
    <div className="modal-back" onMouseDown={() => !busy && onClose()}>
      <div
        className="modal bk"
        role="dialog"
        aria-modal="true"
        aria-label="고른 요구사항 한꺼번에 고치기"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <b>고른 요구사항 {ids.length}건 고치기</b>
          <span className="sp" />
          <button className="btn small" type="button" disabled={busy} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="bk-cols">
          <div className="bk-list">
            {row(
              'status',
              '상태',
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">고르세요</option>
                {codes('req_status').map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>,
            )}
            {row(
              'priority',
              '우선순위',
              <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="">고르세요</option>
                {codes('req_priority').map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>,
            )}
            {row(
              'folder',
              '폴더 옮기기',
              <select value={folder} onChange={(e) => setFolder(e.target.value)}>
                <option value="">미분류로</option>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>,
            )}
            {/* 구현 내용 — 편집 창과 같은 서식 편집기 */}
            {row(
              'desc',
              '구현 내용',
              <div className="bk-md">
                <MarkdownEditor
                  value={desc}
                  onChange={setDesc}
                  placeholder="무엇을, 어떻게 구현하는지"
                />
              </div>,
            )}
          </div>

          <div className="bk-targets">
            <div className="bk-thead">바뀔 요구사항 {targets.length}건</div>
            <ul>
              {targets.map((r) => (
                <li key={reqPk(r)} title={reqLabel(r)}>
                  {r.title || reqLabel(r)}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="bk-mode">
          {/* 구현 내용에만 적용 — 상태·우선순위·폴더는 고른 값으로 바꾸는 것이 목적이다 */}
          <label>
            <input type="radio" checked={!over} onChange={() => setOver(false)} />
            비어 있는 것만 채우기 (구현 내용)
          </label>
          <label className="bk-danger">
            <input type="radio" checked={over} onChange={() => setOver(true)} />
            덮어쓰기
          </label>
          {over && (
            <span className="bk-warn">이미 적혀 있는 구현 내용이 지워집니다. 되돌릴 수 없습니다.</span>
          )}
        </div>

        <div className="modal-foot">
          {err && <span className="muted small err">{err}</span>}
          <span className="sp" />
          <span className="page-head-actions">
            <button className="btn" type="button" disabled={busy} onClick={onClose}>
              취소
            </button>
            <button
              className="btn primary"
              type="button"
              disabled={!ready || busy}
              onClick={() => void apply()}
            >
              {busy ? '고치는 중…' : '고치기'}
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}
