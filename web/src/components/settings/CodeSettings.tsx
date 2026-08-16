import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { cfOptions, type CfMeta, type CustomField } from '@/hooks/useCustomFields'

interface Item {
  kind: string
  value: string
  sort_order?: number
  note?: string | null
  used?: number
}

interface Props {
  /** 'tc' | 'req' | 'cycle' — 서버의 kind 접두사와 같다 */
  target: 'tc' | 'req' | 'cycle'
}

const TITLE: Record<string, { h: string; p: string }> = {
  tc: {
    h: 'TC INFO 필드',
    p: 'TC 상세 「기본」 카드에서 고를 값을 여기서 정합니다. 고치면 TC 상세와 추가 창에 함께 반영됩니다.',
  },
  req: {
    h: '요구사항 INFO 필드',
    p: '요구사항 편집 창에서 고를 값을 여기서 정합니다. 전에는 코드에 박혀 있어 배포해야 늘릴 수 있었습니다.',
  },
  cycle: {
    h: '사이클 INFO 필드',
    p: '사이클 만들기·편집에서 고를 값(상태·고객 등)을 여기서 정합니다.',
  },
}

/** 탭 하나. 기본 칸(code_item)과 우리가 만든 칸(custom_field)을 같은 모양으로 다룬다. */
interface Tab {
  key: string
  label: string
  /** 우리가 만든 칸이면 그 정의. 기본 칸이면 undefined */
  cf?: CustomField
  values: string[]
}

/**
 * INFO 필드 — 드롭다운에 들어가는 값 관리.
 *
 * 전에는 TcForm.tsx 와 TcDetail.tsx 에 같은 목록이 따로 박혀 있어서 서로
 * 어긋날 수 있었고, 항목 하나 늘리려면 배포를 해야 했다.
 *
 * TC 와 요구사항이 같은 화면을 쓴다 — 하는 일이 똑같아서 따로 만들면
 * 한쪽만 고치는 일이 생긴다. 서버의 kind 접두사(tc_ / req_)로 가른다.
 *
 * 탭은 두 곳에서 온다:
 *   - 기본 칸  : code_item 테이블. 상태·유형처럼 원래 있던 칸이라 지울 수 없다.
 *   - 만든 칸  : custom_field 의 「고르기」 필드. 값은 그 행의 options 에 산다.
 *
 * 둘을 한 화면에 모으는 이유: 전에는 '이 드롭다운 값을 어디서 고치지?' 의
 * 답이 칸마다 달랐다(상태는 여기, 우리가 만든 칸은 커스텀 필드 화면).
 * 값을 고치는 자리는 하나여야 한다.
 */
export default function CodeSettings({ target }: Props) {
  const qc = useQueryClient()
  const [kind, setKind] = useState(
    target === 'req' ? 'req_status' : target === 'cycle' ? 'cycle_status' : 'tc_type',
  )
  const [draft, setDraft] = useState('')
  const [note, setNote] = useState<{ kind: string; msg: string }>({ kind: '', msg: '' })
  // 새 탭(= 「고르기」 커스텀 필드) 만들기
  const [newTab, setNewTab] = useState<string | null>(null)

  const listQ = useQuery({
    queryKey: ['codes'],
    queryFn: async () => {
      const r = await apiFetch('/api/codes')
      if (!r.ok) throw new Error('불러오지 못했습니다')
      return (await r.json()) as { items: Item[]; kinds: Record<string, string> }
    },
  })

  const cfQ = useQuery({
    queryKey: ['custom-fields'],
    queryFn: async () => {
      const r = await apiFetch('/api/custom-fields')
      if (!r.ok) throw new Error('불러오지 못했습니다')
      return (await r.json()) as CfMeta
    },
  })

  // 기본 칸. 접두사로 가르므로 서버에 종류를 늘려도 화면 코드는 안 고친다.
  const builtin: Tab[] = Object.entries(listQ.data?.kinds ?? {})
    .filter(([k]) => k.startsWith(`${target}_`))
    .map(([k, label]) => ({
      key: k,
      label,
      values: (listQ.data?.items ?? [])
        .filter((i) => i.kind === k)
        .map((i) => i.value),
    }))

  // 우리가 만든 「고르기」 칸. 글자·숫자 칸은 고를 값이 없으니 탭이 되지 않는다.
  const made: Tab[] = (cfQ.data?.items ?? [])
    .filter((f) => f.target === target && f.type === 'select')
    .map((f) => ({ key: `cf:${f.id}`, label: f.label, cf: f, values: cfOptions(f) }))

  const tabs = [...builtin, ...made]
  const cur = tabs.find((t) => t.key === kind) ?? tabs[0]
  const items = (listQ.data?.items ?? []).filter((i) => i.kind === kind)

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['codes'] })
    void qc.invalidateQueries({ queryKey: ['custom-fields'] })
    // 편집 폼들이 이 목록을 읽는다 — 고치면 바로 반영되어야 한다
    void qc.invalidateQueries({ queryKey: ['tc', 'list', 'meta'] })
    void qc.invalidateQueries({ queryKey: ['req', 'list'] })
  }

  /** 실행 결과(cycle_result) 값의 색·계열 — note 에 JSON 으로 담는다 */
  const saveMeta = (value: string, color?: string, group?: string) => {
    const it = items.find((x) => x.value === value)
    void apiFetch('/api/codes', {
      method: 'POST',
      body: JSON.stringify({
        kind,
        value,
        sort_order: it?.sort_order ?? 0,
        note: JSON.stringify({ color: color || undefined, group: group || 'neutral' }),
      }),
    }).then(invalidate)
  }

  const fail = (e: unknown) =>
    setNote({ kind: 'err', msg: e instanceof Error ? e.message : String(e) })

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
    onError: fail,
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
    onError: fail,
  })

  /** 만든 칸의 값 목록 저장. 값은 그 필드 정의의 options 에 통째로 들어간다. */
  const cfSaveM = useMutation({
    mutationFn: async ({ f, values }: { f: CustomField; values: string[] }) => {
      const r = await apiFetch('/api/custom-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, options: values.join('\n') }),
      })
      const b = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(b.detail || '저장하지 못했습니다')
    },
    onSuccess: () => {
      setDraft('')
      setNote({ kind: 'ok', msg: '저장했습니다' })
      invalidate()
    },
    onError: fail,
  })

  /** 새 탭 = 「고르기」 커스텀 필드 하나. 칸과 고를 값이 함께 생긴다. */
  const newTabM = useMutation({
    mutationFn: async (label: string) => {
      // 키는 저장에 쓰는 이름이라 영문만 받는다. 이름이 한글이면 남는 글자가
      // 없어서 번호를 붙인다(커스텀 필드 화면과 같은 규칙).
      const taken = (cfQ.data?.items ?? []).filter((f) => f.target === target).map((f) => f.key)
      const base =
        label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'field'
      let key = base
      for (let i = 1; taken.includes(key) && i < 500; i++) key = `${base}_${i}`
      const r = await apiFetch('/api/custom-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target,
          key,
          label: label.trim(),
          type: 'select',
          // 값은 아직 없다. 서버가 '고르기는 값이 있어야 한다'로 막으므로
          // 자리표시자를 하나 넣고, 사람이 진짜 값을 넣으면 지우면 된다.
          options: '(값을 넣으세요)',
          show_form: true,
          show_list: false,
        }),
      })
      const b = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(b.detail || '만들지 못했습니다')
      return b.id as number
    },
    onSuccess: (id) => {
      setNewTab(null)
      setKind(`cf:${id}`)
      setNote({ kind: 'ok', msg: '탭을 만들었습니다. 아래에 고를 값을 넣으세요' })
      invalidate()
    },
    onError: fail,
  })

  /** 순서 바꾸기. 드롭다운에 뜨는 차례가 곧 이 값이다. */
  const move = (i: number, dir: -1 | 1) => {
    if (!cur) return
    const j = i + dir
    if (j < 0 || j >= cur.values.length) return
    if (cur.cf) {
      const next = [...cur.values]
      const a = next[i]!
      next[i] = next[j]!
      next[j] = a
      cfSaveM.mutate({ f: cur.cf, values: next })
      return
    }
    const it = items[i]
    const other = items[j]
    if (!it || !other) return
    saveM.mutate({ ...it, sort_order: other.sort_order ?? j })
    saveM.mutate({ ...other, sort_order: it.sort_order ?? i })
  }

  const submit = () => {
    const v = draft.trim()
    if (!v || !cur) {
      setNote({ kind: 'err', msg: '값을 입력하세요' })
      return
    }
    if (cur.cf) {
      if (cur.values.includes(v)) {
        setNote({ kind: 'err', msg: '이미 있는 값입니다' })
        return
      }
      // 새로 만든 탭의 자리표시자는 진짜 값이 들어오면 걷어낸다
      const kept = cur.values.filter((x) => x !== '(값을 넣으세요)')
      cfSaveM.mutate({ f: cur.cf, values: [...kept, v] })
      return
    }
    saveM.mutate({ kind, value: v, sort_order: cur.values.length + 1 })
  }

  const removeValue = (i: number) => {
    if (!cur) return
    const v = cur.values[i]!
    if (!window.confirm(`'${v}' 을 지울까요?`)) return
    if (cur.cf) {
      cfSaveM.mutate({ f: cur.cf, values: cur.values.filter((_, x) => x !== i) })
      return
    }
    const it = items[i]
    if (it) delM.mutate(it)
  }

  const busy = saveM.isPending || delM.isPending || cfSaveM.isPending

  return (
    <div className="set-page">
      <div className="set-head">
        <div>
          <h3>{TITLE[target]!.h}</h3>
          <p className="muted small">{TITLE[target]!.p}</p>
        </div>
      </div>

      {note.msg && <div className={`set-note ${note.kind}`}>{note.msg}</div>}

      <div className="seg" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={kind === t.key}
            className={`seg-btn${kind === t.key ? ' on' : ''}`}
            onClick={() => {
              setKind(t.key)
              setDraft('')
              setNewTab(null)
              setNote({ kind: '', msg: '' })
            }}
          >
            {t.label}
            {/* 우리가 만든 탭은 표시해 둔다 — 기본 칸과 달리 지울 수 있어서,
                구분이 안 되면 지워도 되는지 매번 판단해야 한다. */}
            {t.cf && <span className="seg-made">추가</span>}
            <span className="cnt">{t.values.length}</span>
          </button>
        ))}
        <button
          type="button"
          className="seg-btn seg-add"
          title="고를 값을 갖는 칸을 새로 만듭니다"
          onClick={() => {
            setNewTab('')
            setNote({ kind: '', msg: '' })
          }}
        >
          + 탭 추가
        </button>
      </div>

      {newTab !== null && (
        <section className="set-card">
          <div className="set-card-head">
            <b>탭 추가</b>
            <span className="muted small">
              {target === 'tc' ? 'TC' : target === 'cycle' ? '사이클' : '요구사항'} 편집 화면에
              드롭다운 칸이 하나 생깁니다
            </span>
          </div>
          <div className="dc-add">
            <input
              autoFocus
              placeholder="칸 이름 (예: 담당자)"
              value={newTab}
              onChange={(e) => setNewTab(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newTab.trim()) newTabM.mutate(newTab)
                if (e.key === 'Escape') setNewTab(null)
              }}
            />
            <button
              className="btn primary"
              type="button"
              disabled={!newTab.trim() || newTabM.isPending}
              onClick={() => newTabM.mutate(newTab)}
            >
              {newTabM.isPending ? '만드는 중…' : '만들기'}
            </button>
            <button className="btn" type="button" onClick={() => setNewTab(null)}>
              취소
            </button>
          </div>
          <div className="hint">
            새 탭은 「커스텀 필드」의 <b>고르기</b> 칸으로 만들어집니다. 목록 열에 함께
            보이게 하거나 나중에 지우는 것은 설정 → 커스텀 필드에서 합니다.
          </div>
        </section>
      )}

      {!cur ? null : (
        <>
          <section className="set-card">
            <div className="set-card-head">
              <b>{cur.label} 추가</b>
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
              <button className="btn primary" type="button" onClick={submit} disabled={busy}>
                추가
              </button>
            </div>
          </section>

          <section className="set-card">
            <div className="set-card-head">
              <b>{cur.label} 목록</b>
              <span className="muted small">위에 있는 것부터 드롭다운에 뜹니다</span>
            </div>

            {listQ.isLoading || cfQ.isLoading ? (
              <div className="empty">불러오는 중…</div>
            ) : cur.values.length === 0 ? (
              <div className="empty">아직 없습니다.</div>
            ) : (
              <div className="dc-list">
                {cur.values.map((v, i) => {
                  const used = cur.cf ? 0 : (items[i]?.used ?? 0)
                  return (
                    <div className="dc-row" key={v}>
                      <b className="dc-name">{v}</b>
                      {/* 실행 결과 값은 색과 계열(집계 규칙)을 함께 정한다 */}
                      {kind === 'cycle_result' && !cur.cf && (() => {
                        let meta: { color?: string; group?: string } = {}
                        try {
                          meta = JSON.parse(items[i]?.note || '{}') as typeof meta
                        } catch {
                          /* 옛 자료 */
                        }
                        return (
                          <span className="dc-resmeta">
                            <input
                              type="color"
                              value={meta.color || '#94a3b8'}
                              title="이 상태의 색"
                              onChange={(e) => saveMeta(v, e.target.value, meta.group)}
                            />
                            <select
                              value={meta.group || 'neutral'}
                              title="집계 계열 — Pass 계열은 통과로, Fail 계열은 실패로 센다"
                              onChange={(e) => saveMeta(v, meta.color, e.target.value)}
                            >
                              <option value="pass">Pass 계열</option>
                              <option value="fail">Fail 계열</option>
                              <option value="neutral">중립</option>
                            </select>
                          </span>
                        )
                      })()}
                      <span className="muted small dc-meta">
                        {used ? `${used}건이 쓰는 중` : ''}
                      </span>
                      <span className="dc-actions">
                        <button
                          className="btn small"
                          type="button"
                          disabled={i === 0 || busy}
                          onClick={() => move(i, -1)}
                          title="위로"
                        >
                          ▲
                        </button>
                        <button
                          className="btn small"
                          type="button"
                          disabled={i === cur.values.length - 1 || busy}
                          onClick={() => move(i, 1)}
                          title="아래로"
                        >
                          ▼
                        </button>
                        <button
                          className="btn small danger"
                          type="button"
                          disabled={!!used || busy}
                          title={used ? '쓰는 것이 있어 지울 수 없습니다' : ''}
                          onClick={() => removeValue(i)}
                        >
                          삭제
                        </button>
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
