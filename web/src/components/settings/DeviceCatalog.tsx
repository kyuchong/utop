import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'

interface Item {
  kind: string
  name: string
  vendor?: string | null
  /** kind=model 일 때 속한 모델군(시리즈) */
  model_group?: string | null
  family?: string | null
  interfaces?: string | null
  note?: string | null
  used?: number
}

const KINDS: Array<{ v: string; label: string; desc: string }> = [
  { v: 'vendor', label: '제조사', desc: '유비쿼스 · Cisco …' },
  { v: 'group', label: '모델군', desc: 'E6000 시리즈 · U9500 시리즈 …' },
  { v: 'family', label: '제품군', desc: 'L2 · L3 · OLT · ONT · CPE · HGW' },
  { v: 'model', label: '모델명', desc: '제조사 · 모델군 · 제품군 · 기본 인터페이스' },
  { v: 'lab', label: 'LAB', desc: '시험실' },
]

/**
 * 장비 카탈로그.
 *
 * 장비를 등록할 때마다 제조사와 모델을 손으로 치면 '유비쿼스' 와
 * '유비쿼스(주)' 로 갈려 같은 것이 둘로 보인다. 여기에 한 번 등록해 두고
 * 장비 등록에서는 고르기만 한다.
 *
 * 모델에 기본 인터페이스를 적어두면 장비 등록에서 모델만 골라도 48포트가
 * 채워진다 — 같은 모델을 30대 등록할 때 이것이 가장 크게 줄여준다.
 */
export default function DeviceCatalog() {
  const qc = useQueryClient()
  const [kind, setKind] = useState('vendor')
  const [draft, setDraft] = useState<Item>({ kind: 'vendor', name: '' })
  const [note, setNote] = useState<{ kind: string; msg: string }>({ kind: '', msg: '' })

  const listQ = useQuery({
    queryKey: ['device-catalog'],
    queryFn: async () => {
      const r = await apiFetch('/api/device-catalog2')
      if (!r.ok) throw new Error('불러오지 못했습니다')
      return (await r.json()) as { items: Item[] }
    },
  })

  const items = (listQ.data?.items ?? []).filter((i) => i.kind === kind)
  const cur = KINDS.find((k) => k.v === kind)!

  const saveM = useMutation({
    mutationFn: async (it: Item) => {
      const r = await apiFetch('/api/device-catalog2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(it),
      })
      const b = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(b.detail || '저장하지 못했습니다')
    },
    onSuccess: () => {
      setDraft({ kind, name: '' })
      setNote({ kind: 'ok', msg: '저장했습니다' })
      void qc.invalidateQueries({ queryKey: ['device-catalog'] })
      void qc.invalidateQueries({ queryKey: ['device-roles'] })
    },
    onError: (e) => setNote({ kind: 'err', msg: e instanceof Error ? e.message : String(e) }),
  })

  const delM = useMutation({
    mutationFn: async (it: Item) => {
      const r = await apiFetch(
        `/api/device-catalog2/${encodeURIComponent(it.kind)}/${encodeURIComponent(it.name)}`,
        { method: 'DELETE' },
      )
      const b = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(b.detail || '지우지 못했습니다')
    },
    onSuccess: () => {
      setNote({ kind: 'ok', msg: '지웠습니다' })
      void qc.invalidateQueries({ queryKey: ['device-catalog'] })
      void qc.invalidateQueries({ queryKey: ['device-roles'] })
    },
    onError: (e) => setNote({ kind: 'err', msg: e instanceof Error ? e.message : String(e) }),
  })

  const vendors = (listQ.data?.items ?? []).filter((i) => i.kind === 'vendor')
  const groups = (listQ.data?.items ?? []).filter((i) => i.kind === 'group')
  const families = (listQ.data?.items ?? []).filter((i) => i.kind === 'family')

  const submit = () => {
    if (!draft.name.trim()) {
      setNote({ kind: 'err', msg: '이름을 입력하세요' })
      return
    }
    saveM.mutate({ ...draft, kind })
  }

  return (
    <div className="set-page">
      <div className="set-head">
        <div>
          <h3>장비 카탈로그</h3>
          <p className="muted small">
            제조사·제품군·모델명·LAB 을 여기 등록해두면 장비 등록 화면에서 고르기만 하면
            됩니다. 손으로 칠 때마다 이름이 갈리는 것을 막습니다.
          </p>
        </div>
      </div>

      {note.msg && <div className={`set-note ${note.kind}`}>{note.msg}</div>}

      <div className="seg" role="tablist">
        {KINDS.map((k) => (
          <button
            key={k.v}
            type="button"
            role="tab"
            aria-selected={kind === k.v}
            className={`seg-btn${kind === k.v ? ' on' : ''}`}
            onClick={() => {
              setKind(k.v)
              setDraft({ kind: k.v, name: '' })
              setNote({ kind: '', msg: '' })
            }}
          >
            {k.label}
            <span className="cnt">
              {(listQ.data?.items ?? []).filter((i) => i.kind === k.v).length}
            </span>
          </button>
        ))}
      </div>

      <section className="set-card">
        <div className="set-card-head">
          <b>{cur.label} 추가</b>
          <span className="muted small">{cur.desc}</span>
        </div>

        <div className="cat-add">
          <input
            placeholder={cur.label}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
          />
          {kind === 'model' && (
            <>
              <select
                value={draft.vendor ?? ''}
                onChange={(e) => setDraft({ ...draft, vendor: e.target.value })}
              >
                <option value="">제조사</option>
                {vendors.map((v) => (
                  <option key={v.name}>{v.name}</option>
                ))}
              </select>
              <select
                value={draft.model_group ?? ''}
                onChange={(e) => setDraft({ ...draft, model_group: e.target.value })}
              >
                <option value="">모델군</option>
                {groups.map((v) => (
                  <option key={v.name}>{v.name}</option>
                ))}
              </select>
              <select
                value={draft.family ?? ''}
                onChange={(e) => setDraft({ ...draft, family: e.target.value })}
              >
                <option value="">제품군</option>
                {families.map((v) => (
                  <option key={v.name}>{v.name}</option>
                ))}
              </select>
              <input
                placeholder="기본 인터페이스 (gi1/0/1-48, te1/1-4)"
                value={draft.interfaces ?? ''}
                onChange={(e) => setDraft({ ...draft, interfaces: e.target.value })}
              />
            </>
          )}
          <button className="btn primary" type="button" onClick={submit} disabled={saveM.isPending}>
            추가
          </button>
        </div>

        {kind === 'model' && (
          <div className="hint">
            기본 인터페이스를 적어두면 장비 등록에서 이 모델을 고를 때 포트가 그대로
            채워집니다. 같은 모델을 여러 대 등록할 때 가장 크게 줄여줍니다.
          </div>
        )}
      </section>

      <section className="set-card">
        <div className="set-card-head">
          <b>{cur.label} 목록</b>
          <span className="muted small">{items.length}개</span>
        </div>

        {listQ.isLoading ? (
          <div className="empty">불러오는 중…</div>
        ) : items.length === 0 ? (
          <div className="empty">아직 없습니다.</div>
        ) : (
          <div className="cat-list">
            {items.map((it) => (
              <div className="cat-row" key={it.name}>
                <b className="cat-name">{it.name}</b>
                {kind === 'model' && (
                  <span className="muted small cat-meta">
                    {[it.vendor, it.model_group, it.family].filter(Boolean).join(' · ') || '–'}
                    {it.interfaces ? ` · ${it.interfaces}` : ''}
                  </span>
                )}
                {kind === 'group' && (
                  <span className="muted small cat-meta">
                    {(listQ.data?.items ?? [])
                      .filter((m) => m.kind === 'model' && m.model_group === it.name)
                      .map((m) => m.name)
                      .join(' · ') || '속한 모델 없음'}
                  </span>
                )}
                <span className="muted small">{it.used ? `${it.used}대 사용 중` : ''}</span>
                <span className="cat-actions">
                  <button
                    className="btn small"
                    type="button"
                    onClick={() => setDraft({ ...it, kind })}
                  >
                    고치기
                  </button>
                  <button
                    className="btn small danger"
                    type="button"
                    disabled={!!it.used || delM.isPending}
                    title={it.used ? '쓰는 장비가 있어 지울 수 없습니다' : ''}
                    onClick={() => {
                      if (window.confirm(`'${it.name}' 을 지울까요?`)) delM.mutate(it)
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
