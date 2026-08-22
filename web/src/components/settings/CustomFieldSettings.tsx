import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import './SetTabs.css'
import type { CfMeta, CfTarget, CfType, CustomField } from '@/hooks/useCustomFields'
import './CustomFieldSettings.css'

/** 편집 중인 칸. id 가 없으면 새로 만드는 중이다. */
interface Draft {
  id?: number
  target: CfTarget
  key: string
  label: string
  type: CfType
  options: string
  required: boolean
  show_form: boolean
  show_list: boolean
  sort_order: number
  note: string
  /** 키를 손으로 고쳤는지. 그 뒤로는 이름을 바꿔도 키를 덮지 않는다. */
  touchedKey?: boolean
}

const blank = (target: CfTarget): Draft => ({
  target,
  key: '',
  label: '',
  type: 'text',
  options: '',
  required: false,
  // 새로 만든 칸은 편집 화면에만 넣는다. 목록은 열이 늘수록 좁아지므로
  // 정말 목록에서 봐야 하는 것만 사람이 직접 켜게 한다.
  show_form: true,
  show_list: false,
  sort_order: 0,
  note: '',
})

/**
 * 이름에서 키를 만든다.
 *
 * 키는 영문·숫자·_ 만 받는다(서버가 막는다). 그런데 이 제품의 이름은
 * 거의 다 한글이라 그대로 옮기면 남는 글자가 없다 — '수행자' → ''.
 * 그래서 만들 게 없으면 field_1, field_2 로 번호를 붙인다. 대부분은
 * 키가 무엇인지 신경 쓸 이유가 없고, 신경 쓰는 사람은 직접 고치면 된다.
 */
const keyFromLabel = (label: string, taken: string[]): string => {
  const derived = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^([0-9])/, 'f$1')
    .slice(0, 40)
  if (derived && !taken.includes(derived)) return derived
  const base = derived || 'field'
  for (let i = 1; i < 1000; i++) {
    const cand = `${base}_${i}`.slice(0, 40)
    if (!taken.includes(cand)) return cand
  }
  return base
}

const toDraft = (f: CustomField): Draft => ({
  id: f.id,
  target: f.target,
  key: f.key,
  label: f.label,
  type: f.type,
  options: f.options ?? '',
  required: f.required,
  show_form: f.show_form,
  show_list: f.show_list,
  sort_order: f.sort_order,
  note: f.note ?? '',
})

/**
 * 커스텀 필드 관리.
 *
 * 팀마다 TC·요구사항에 적어두고 싶은 항목이 다르다(수행자·시험 환경·
 * 고객사·관련 이슈…). 그때마다 컬럼을 늘리고 배포하면 따라갈 수 없어서,
 * 여기서 칸을 정의하고 값은 각 리소스의 data->'custom' 에 담는다.
 *
 * 대상(TC/요구사항)을 나누는 이유는 두 화면을 쓰는 사람도 시점도 달라서다.
 * 한 목록으로 두면 TC 에만 필요한 칸이 요구사항 편집까지 따라온다.
 */
export default function CustomFieldSettings() {
  const qc = useQueryClient()
  const [target, setTarget] = useState<CfTarget>('tc')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [note, setNote] = useState<{ kind: string; msg: string }>({ kind: '', msg: '' })

  const listQ = useQuery({
    queryKey: ['custom-fields'],
    queryFn: async () => {
      const r = await apiFetch('/api/custom-fields')
      if (!r.ok) throw new Error('불러오지 못했습니다')
      return (await r.json()) as CfMeta
    },
  })

  const targets = listQ.data?.targets ?? {}
  const types = listQ.data?.types ?? {}
  const all = listQ.data?.items ?? []
  const items = all.filter((f) => f.target === target)

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['custom-fields'] })
    // 편집 화면·목록이 같이 읽는다 — 고치면 바로 반영되어야 한다
    void qc.invalidateQueries({ queryKey: ['tc', 'list', 'meta'] })
    void qc.invalidateQueries({ queryKey: ['req', 'list'] })
  }

  const saveM = useMutation({
    mutationFn: async (d: Draft) => {
      const r = await apiFetch('/api/custom-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(d),
      })
      const b = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(b.detail || '저장하지 못했습니다')
    },
    onSuccess: () => {
      setDraft(null)
      setNote({ kind: 'ok', msg: '저장했습니다' })
      invalidate()
    },
    onError: (e) => setNote({ kind: 'err', msg: e instanceof Error ? e.message : String(e) }),
  })

  const delM = useMutation({
    mutationFn: async (f: CustomField) => {
      const r = await apiFetch(`/api/custom-fields/${f.id}`, { method: 'DELETE' })
      const b = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(b.detail || '지우지 못했습니다')
    },
    onSuccess: () => {
      setNote({ kind: 'ok', msg: '지웠습니다' })
      invalidate()
    },
    onError: (e) => setNote({ kind: 'err', msg: e instanceof Error ? e.message : String(e) }),
  })

  /** 보이기 토글은 창을 열지 않고 그 자리에서 바꾼다 — 가장 자주 하는 일이다. */
  const toggle = (f: CustomField, which: 'show_form' | 'show_list') =>
    saveM.mutate({ ...toDraft(f), [which]: !f[which] })

  const move = (f: CustomField, dir: -1 | 1) => {
    const i = items.findIndex((x) => x.id === f.id)
    const j = i + dir
    if (j < 0 || j >= items.length) return
    const other = items[j]
    if (!other) return
    saveM.mutate({ ...toDraft(f), sort_order: other.sort_order ?? j })
    saveM.mutate({ ...toDraft(other), sort_order: f.sort_order ?? i })
  }

  const submit = () => {
    if (!draft) return
    if (!draft.label.trim()) {
      setNote({ kind: 'err', msg: '이름을 입력하세요' })
      return
    }
    if (!draft.key.trim()) {
      setNote({ kind: 'err', msg: '키를 입력하세요' })
      return
    }
    saveM.mutate({ ...draft, sort_order: draft.sort_order || items.length + 1 })
  }

  const doDelete = (f: CustomField) => {
    const lines = [`'${f.label}' 칸을 지웁니다.`]
    if (f.used) {
      // 값은 안 지워진다는 것을 분명히 해야 한다. 지운 뒤에도 같은 키로
      // 다시 만들면 값이 도로 보이므로 사실 되돌릴 수 있다.
      lines.push(
        `${f.used}건에 값이 들어 있습니다. 값 자체는 지워지지 않고 화면에서만 사라집니다`,
        '(같은 키로 다시 만들면 도로 보입니다).',
      )
    }
    lines.push('계속할까요?')
    if (!window.confirm(lines.join('\n'))) return
    delM.mutate(f)
  }

  return (
    <div className="set-page">
      <div className="set-head">
        <div>
          <h3>커스텀 필드</h3>
          <p className="muted small">
            테스트케이스와 요구사항에 우리 팀이 쓰는 칸을 더합니다. 칸마다 어느
            쪽에 쓸지, 편집 화면과 목록 중 어디에 보일지를 따로 정합니다.
          </p>
        </div>
      </div>

      {note.msg && <div className={`set-note ${note.kind}`}>{note.msg}</div>}

      <div className="ps-tabs" role="tablist">
        {Object.entries(targets).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={target === k}
            className={`ps-tab${target === k ? ' on' : ''}`}
            onClick={() => {
              setTarget(k as CfTarget)
              setDraft(null)
              setNote({ kind: '', msg: '' })
            }}
          >
            {label}
            <span className="cnt">{all.filter((f) => f.target === k).length}</span>
          </button>
        ))}
      </div>

      {draft ? (
        <section className="set-card">
          <div className="set-card-head">
            <b>{draft.id ? `${draft.label || '칸'} 수정` : '칸 추가'}</b>
          </div>
          <div className="cf-form">
            <div className="frow">
              <label className="fld">
                <span>이름 (화면에 보입니다)</span>
                <input
                  autoFocus
                  value={draft.label}
                  placeholder="수행자"
                  onChange={(e) => {
                    const label = e.target.value
                    // 키를 아직 손대지 않았으면 이름에서 만들어 준다.
                    // 이미 만든 칸을 고치는 중이면 건드리지 않는다 — 저장된
                    // 값이 그 키를 쓰고 있다.
                    setDraft((d) => {
                      if (!d) return d
                      if (d.id || d.touchedKey) return { ...d, label }
                      return {
                        ...d,
                        label,
                        key: label.trim()
                          ? keyFromLabel(
                              label,
                              items.map((f) => f.key),
                            )
                          : '',
                      }
                    })
                  }}
                />
              </label>
              <label className="fld">
                <span>키 (저장에 쓰는 이름)</span>
                <input
                  value={draft.key}
                  placeholder="owner"
                  disabled={!!draft.id}
                  title={draft.id ? '이미 저장된 값이 이 키를 쓰고 있어 바꾸지 않습니다' : ''}
                  onChange={(e) =>
                    setDraft((d) => (d ? { ...d, key: e.target.value, touchedKey: true } : d))
                  }
                />
              </label>
              <label className="fld">
                <span>종류</span>
                <select
                  value={draft.type}
                  onChange={(e) =>
                    setDraft((d) => (d ? { ...d, type: e.target.value as CfType } : d))
                  }
                >
                  {Object.entries(types).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {draft.type === 'select' && (
              <div className="fld wide">
                <span>고를 값 (한 줄에 하나)</span>
                <textarea
                  rows={4}
                  value={draft.options}
                  placeholder={'홍길동\n김철수'}
                  onChange={(e) => setDraft((d) => (d ? { ...d, options: e.target.value } : d))}
                />
              </div>
            )}

            <div className="fld wide">
              <span>설명 (입력칸에 흐리게 뜹니다)</span>
              <input
                value={draft.note}
                placeholder="이 시험을 수행한 사람"
                onChange={(e) => setDraft((d) => (d ? { ...d, note: e.target.value } : d))}
              />
            </div>

            <div className="cf-flags">
              <label>
                <input
                  type="checkbox"
                  checked={draft.show_form}
                  onChange={(e) =>
                    setDraft((d) => (d ? { ...d, show_form: e.target.checked } : d))
                  }
                />
                편집 화면에 표시
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={draft.show_list}
                  onChange={(e) =>
                    setDraft((d) => (d ? { ...d, show_list: e.target.checked } : d))
                  }
                />
                목록에 열로 표시
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={draft.required}
                  disabled={draft.type === 'checkbox'}
                  title={draft.type === 'checkbox' ? "'아니오' 도 답이라 필수로 걸지 않습니다" : ''}
                  onChange={(e) =>
                    setDraft((d) => (d ? { ...d, required: e.target.checked } : d))
                  }
                />
                필수 입력
              </label>
            </div>

            <div className="cf-form-foot">
              <button className="btn" type="button" onClick={() => setDraft(null)}>
                취소
              </button>
              <button
                className="btn primary"
                type="button"
                onClick={submit}
                disabled={saveM.isPending}
              >
                {saveM.isPending ? '저장 중…' : '저장'}
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section className="set-card">
          <div className="set-card-head">
            <b>{targets[target] ?? target} 칸 목록</b>
            <span className="muted small">위에 있는 것부터 화면에 뜹니다</span>
            <button
              className="btn primary cf-add"
              type="button"
              onClick={() => {
                setDraft(blank(target))
                setNote({ kind: '', msg: '' })
              }}
            >
              + 칸 추가
            </button>
          </div>

          {listQ.isLoading ? (
            <div className="empty">불러오는 중…</div>
          ) : items.length === 0 ? (
            <div className="empty">
              아직 없습니다.
              <br />
              <span className="muted small">
                「+ 칸 추가」로 이 화면에 쓸 항목을 만드세요.
              </span>
            </div>
          ) : (
            <div className="cf-list">
              <div className="cf-row th">
                <span className="cf-name">이름 · 키</span>
                <span className="cf-type">종류</span>
                <span className="cf-where">편집</span>
                <span className="cf-where">목록</span>
                <span className="cf-used">쓰는 중</span>
                <span className="cf-actions" />
              </div>
              {items.map((f, i) => (
                <div className="cf-row" key={f.id}>
                  <span className="cf-name">
                    <b>{f.label}</b>
                    {f.required && <b className="req-mark"> *</b>}
                    <span className="muted small"> · {f.key}</span>
                  </span>
                  <span className="cf-type muted small">{types[f.type] ?? f.type}</span>
                  {/* 보이기는 가장 자주 바꾸는 값이라 창을 열지 않고 여기서 켠다 */}
                  <span className="cf-where">
                    <input
                      type="checkbox"
                      checked={f.show_form}
                      aria-label={`${f.label} 편집 화면에 표시`}
                      onChange={() => toggle(f, 'show_form')}
                    />
                  </span>
                  <span className="cf-where">
                    <input
                      type="checkbox"
                      checked={f.show_list}
                      aria-label={`${f.label} 목록에 표시`}
                      onChange={() => toggle(f, 'show_list')}
                    />
                  </span>
                  <span className="cf-used muted small">{f.used ? `${f.used}건` : ''}</span>
                  <span className="cf-actions">
                    <button
                      className="btn small"
                      type="button"
                      disabled={i === 0}
                      onClick={() => move(f, -1)}
                      title="위로"
                    >
                      ▲
                    </button>
                    <button
                      className="btn small"
                      type="button"
                      disabled={i === items.length - 1}
                      onClick={() => move(f, 1)}
                      title="아래로"
                    >
                      ▼
                    </button>
                    <button className="btn small" type="button" onClick={() => setDraft(toDraft(f))}>
                      수정
                    </button>
                    <button
                      className="btn small danger"
                      type="button"
                      disabled={delM.isPending}
                      onClick={() => doDelete(f)}
                    >
                      삭제
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
