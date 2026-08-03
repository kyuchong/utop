import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'

interface Item {
  kind: string
  value: string
  sort_order?: number
  note?: string | null
  used?: number
}

interface Props {
  /** 'tc' | 'req' — 서버의 kind 접두사와 같다 */
  target: 'tc' | 'req'
}

const TITLE: Record<string, { h: string; p: string }> = {
  tc: {
    h: 'TC INFO 필드',
    p: 'TC 상세 「기본」 카드의 상태·유형·심각도처럼 고를 값을 여기서 정합니다. 고치면 TC 상세와 추가 창에 함께 반영됩니다.',
  },
  req: {
    h: '요구사항 INFO 필드',
    p: '요구사항 편집 창의 상태·우선순위에서 고를 값을 여기서 정합니다. 전에는 코드에 박혀 있어 배포해야 늘릴 수 있었습니다.',
  },
}

/**
 * 코드 목록 관리.
 *
 * 화면의 드롭다운에 들어가는 값을 여기서 정한다. 전에는 TcForm.tsx 와
 * TcDetail.tsx 에 같은 목록이 따로 박혀 있어서 서로 어긋날 수 있었고,
 * 항목 하나 늘리려면 배포를 해야 했다.
 *
 * TC 와 요구사항이 같은 화면을 쓴다 — 하는 일이 똑같아서 따로 만들면
 * 한쪽만 고치는 일이 생긴다. 서버의 kind 접두사(tc_ / req_)로 가른다.
 */
export default function CodeSettings({ target }: Props) {
  const qc = useQueryClient()
  const [kind, setKind] = useState(target === 'req' ? 'req_status' : 'tc_type')
  const [draft, setDraft] = useState('')
  const [note, setNote] = useState<{ kind: string; msg: string }>({ kind: '', msg: '' })

  const listQ = useQuery({
    queryKey: ['codes'],
    queryFn: async () => {
      const r = await apiFetch('/api/codes')
      if (!r.ok) throw new Error('불러오지 못했습니다')
      return (await r.json()) as { items: Item[]; kinds: Record<string, string> }
    },
  })

  // 이 화면 것만 남긴다. 접두사로 가르므로 서버에 종류를 늘려도
  // 화면 코드를 고칠 일이 없다.
  const kinds = Object.fromEntries(
    Object.entries(listQ.data?.kinds ?? {}).filter(([k]) => k.startsWith(`${target}_`)),
  )
  const items = (listQ.data?.items ?? []).filter((i) => i.kind === kind)

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['codes'] })
    // 편집 폼들이 이 목록을 읽는다 — 고치면 바로 반영되어야 한다
    void qc.invalidateQueries({ queryKey: ['tc', 'list', 'meta'] })
    void qc.invalidateQueries({ queryKey: ['req', 'list'] })
  }

  const saveM = useMutation({
    mutationFn: async (it: Item) => {
      const r = await apiFetch('/api/codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(it),
      })
      const b = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(b.detail || '저장하지 못했습니다')
    },
    onSuccess: () => {
      setDraft('')
      setNote({ kind: 'ok', msg: '저장했습니다' })
      invalidate()
    },
    onError: (e) => setNote({ kind: 'err', msg: e instanceof Error ? e.message : String(e) }),
  })

  const delM = useMutation({
    mutationFn: async (it: Item) => {
      const r = await apiFetch(
        `/api/codes/${encodeURIComponent(it.kind)}/${encodeURIComponent(it.value)}`,
        { method: 'DELETE' },
      )
      const b = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(b.detail || '지우지 못했습니다')
    },
    onSuccess: () => {
      setNote({ kind: 'ok', msg: '지웠습니다' })
      invalidate()
    },
    onError: (e) => setNote({ kind: 'err', msg: e instanceof Error ? e.message : String(e) }),
  })

  /** 순서 바꾸기. 드롭다운에 뜨는 차례가 곧 이 값이다. */
  const move = (it: Item, dir: -1 | 1) => {
    const i = items.findIndex((x) => x.value === it.value)
    const j = i + dir
    if (j < 0 || j >= items.length) return
    const other = items[j]
    if (!other) return
    saveM.mutate({ ...it, sort_order: (other.sort_order ?? j) })
    saveM.mutate({ ...other, sort_order: (it.sort_order ?? i) })
  }

  const submit = () => {
    const v = draft.trim()
    if (!v) {
      setNote({ kind: 'err', msg: '값을 입력하세요' })
      return
    }
    saveM.mutate({ kind, value: v, sort_order: items.length + 1 })
  }

  return (
    <div className="set-page">
      <div className="set-head">
        <div>
          <h3>{TITLE[target]!.h}</h3>
          <p className="muted small">
            {TITLE[target]!.p} 칸 자체를 늘리는 것은 「커스텀 필드」에서 합니다.
          </p>
        </div>
      </div>

      {note.msg && <div className={`set-note ${note.kind}`}>{note.msg}</div>}

      <div className="seg" role="tablist">
        {Object.entries(kinds).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kind === k}
            className={`seg-btn${kind === k ? ' on' : ''}`}
            onClick={() => {
              setKind(k)
              setDraft('')
              setNote({ kind: '', msg: '' })
            }}
          >
            {label}
            <span className="cnt">
              {(listQ.data?.items ?? []).filter((i) => i.kind === k).length}
            </span>
          </button>
        ))}
      </div>

      <section className="set-card">
        <div className="set-card-head">
          <b>{kinds[kind] ?? kind} 추가</b>
        </div>
        <div className="dc-add">
          <input
            placeholder="값 (화면에 그대로 보입니다)"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
          />
          <button className="btn primary" type="button" onClick={submit} disabled={saveM.isPending}>
            추가
          </button>
        </div>
      </section>

      <section className="set-card">
        <div className="set-card-head">
          <b>{kinds[kind] ?? kind} 목록</b>
          <span className="muted small">위에 있는 것부터 드롭다운에 뜹니다</span>
        </div>

        {listQ.isLoading ? (
          <div className="empty">불러오는 중…</div>
        ) : items.length === 0 ? (
          <div className="empty">아직 없습니다.</div>
        ) : (
          <div className="dc-list">
            {items.map((it, i) => (
              <div className="dc-row" key={it.value}>
                <b className="dc-name">{it.value}</b>
                <span className="muted small dc-meta">
                  {it.used ? `${it.used}건이 쓰는 중` : ''}
                </span>
                <span className="dc-actions">
                  <button
                    className="btn small"
                    type="button"
                    disabled={i === 0}
                    onClick={() => move(it, -1)}
                    title="위로"
                  >
                    ▲
                  </button>
                  <button
                    className="btn small"
                    type="button"
                    disabled={i === items.length - 1}
                    onClick={() => move(it, 1)}
                    title="아래로"
                  >
                    ▼
                  </button>
                  <button
                    className="btn small danger"
                    type="button"
                    disabled={!!it.used || delM.isPending}
                    title={it.used ? '쓰는 TC 가 있어 지울 수 없습니다' : ''}
                    onClick={() => {
                      if (window.confirm(`'${it.value}' 을 지울까요?`)) delM.mutate(it)
                    }}
                  >
                    삭제
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
