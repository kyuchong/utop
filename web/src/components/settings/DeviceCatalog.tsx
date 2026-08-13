import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'

interface Item {
  kind: string
  name: string
  vendor?: string | null
  /** kind=model 일 때 속한 모델그룹(시리즈) */
  model_group?: string | null
  family?: string | null
  interfaces?: string | null
  note?: string | null
  used?: number
}

// 넓은 것에서 좁은 것 순으로 둔다 — LAB 안에 장비가 있고, 장비는 Vendor 와
// 제품군으로 갈리고, 모델그룹은 그 아래 시리즈, 모델명이 가장 아래다.
// 등록할 때도 이 차례로 채우게 되므로 탭 순서가 곧 작업 순서가 된다.
const KINDS: Array<{ v: string; label: string; desc: string }> = [
  { v: 'lab', label: 'LAB', desc: '시험실' },
  { v: 'vendor', label: 'Vendor', desc: '유비쿼스 · Cisco …' },
  { v: 'family', label: '제품군', desc: 'L2 · L3 · OLT · ONT · CPE · HGW' },
  { v: 'group', label: '모델그룹', desc: 'E6000 시리즈 · U9500 시리즈 …' },
  { v: 'model', label: '모델명', desc: 'Vendor · 모델그룹 · 제품군 · 기본 인터페이스' },
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
  // 처음 열리는 탭은 목록 첫 번째와 같아야 한다 — 다르면 어느 탭이 켜져
  // 있는지 눈으로 한 번 더 찾아야 한다.
  const [kind, setKind] = useState('lab')
  const [draft, setDraft] = useState<Item>({ kind: 'lab', name: '' })
  const [note, setNote] = useState<{ kind: string; msg: string }>({ kind: '', msg: '' })
  // 여러 줄 붙여넣기로 한 번에 등록하는 칸
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulk, setBulk] = useState('')

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

  /**
   * 여러 줄을 한 번에 등록.
   *
   * 모델은 한 시리즈에 열 개씩 되는 일이 흔한데, 한 줄씩 넣으면 Vendor·
   * 제품군·모델그룹을 매번 다시 고르게 된다. 공통 값은 위에서 한 번만
   * 고르고 이름만 줄로 붙여넣는다.
   *
   * 엑셀에서 그대로 붙여넣는 경우가 많아 탭·쉼표로 나뉜 둘째 칸을
   * 인터페이스로 받는다 — 시리즈 안에서도 포트 수는 다를 수 있다.
   */
  const bulkM = useMutation({
    mutationFn: async (lines: string[]) => {
      // 순차로 넣는다. 한꺼번에 던지면 어디까지 들어갔는지 알 수 없어
      // 실패한 것만 다시 시도할 수가 없다.
      const done: string[] = []
      const failed: Array<{ name: string; why: string }> = []
      for (const line of lines) {
        // 첫 구분자에서만 자르고 나머지는 통째로 인터페이스로 본다.
        // split(re, 2) 를 쓰면 'E6100-48T, gi1/0/1-48, te1/1-4' 에서
        // te1/1-4 가 조용히 사라진다 — 인터페이스 자체에 쉼표가 들어간다.
        const at = line.search(/[\t,]/)
        const name = (at < 0 ? line : line.slice(0, at)).trim()
        const rawIf = at < 0 ? '' : line.slice(at + 1)
        if (!name) continue
        const item: Item = {
          ...draft,
          kind,
          name,
          // 줄에 인터페이스가 적혀 있으면 그것을, 없으면 위에서 고른 공통값을 쓴다
          interfaces: (rawIf ?? '').trim() || draft.interfaces || null,
        }
        try {
          const r = await apiFetch('/api/device-catalog2', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item),
          })
          const b = await r.json().catch(() => ({}))
          if (!r.ok) throw new Error(b.detail || '저장 실패')
          done.push(name)
        } catch (e) {
          failed.push({ name, why: e instanceof Error ? e.message : String(e) })
        }
      }
      return { done, failed }
    },
    onSuccess: ({ done, failed }) => {
      void qc.invalidateQueries({ queryKey: ['device-catalog'] })
      void qc.invalidateQueries({ queryKey: ['device-roles'] })
      if (failed.length === 0) {
        setBulk('')
        setBulkOpen(false)
        setNote({ kind: 'ok', msg: `${done.length}건 등록했습니다` })
        return
      }
      // 실패한 줄만 칸에 남긴다 — 고쳐서 그대로 다시 누르면 된다.
      setBulk(failed.map((f) => f.name).join('\n'))
      setNote({
        kind: 'err',
        msg:
          `${done.length}건 등록, ${failed.length}건 실패. 실패한 것만 칸에 남겨뒀습니다 — ` +
          failed
            .slice(0, 3)
            .map((f) => `${f.name}: ${f.why}`)
            .join(' / ') +
          (failed.length > 3 ? ` 외 ${failed.length - 3}건` : ''),
      })
    },
    onError: (e) => setNote({ kind: 'err', msg: e instanceof Error ? e.message : String(e) }),
  })

  const bulkLines = bulk
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)

  const submitBulk = () => {
    if (bulkLines.length === 0) {
      setNote({ kind: 'err', msg: '한 줄에 하나씩 이름을 적으세요' })
      return
    }
    bulkM.mutate(bulkLines)
  }

  return (
    <div className="set-page">
      <div className="set-head">
        <div>
          <h3>장비 카탈로그</h3>
          <p className="muted small">
            여기 등록해두면 장비 등록 화면에서 고르기만 하면 됩니다.
            손으로 칠 때마다 이름이 갈리는 것을 막습니다.
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
          <button
            className="btn small dc-bulk-toggle"
            type="button"
            onClick={() => {
              setBulkOpen((v) => !v)
              setNote({ kind: '', msg: '' })
            }}
          >
            {bulkOpen ? '하나씩 추가' : '일괄 추가'}
          </button>
        </div>

        <div className="dc-add">
          {!bulkOpen && (
            <input
              placeholder={cur.label}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
              }}
            />
          )}
          {kind === 'model' && (
            <>
              <select
                value={draft.vendor ?? ''}
                onChange={(e) => setDraft({ ...draft, vendor: e.target.value })}
              >
                <option value="">Vendor</option>
                {/* 저장값이 목록에 없으면 숨기지 말고 드러낸다 — 「유비쿼스」가
                    DB 에 숨어 있는데 화면은 빈 칸이라, 어긋난 줄도 몰랐다 */}
                {draft.vendor && !vendors.some((v) => v.name === draft.vendor) && (
                  <option value={draft.vendor}>{draft.vendor} (목록에 없음)</option>
                )}
                {vendors.map((v) => (
                  <option key={v.name}>{v.name}</option>
                ))}
              </select>
              <select
                value={draft.model_group ?? ''}
                onChange={(e) => setDraft({ ...draft, model_group: e.target.value })}
              >
                <option value="">모델그룹</option>
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
          {!bulkOpen && (
            <button
              className="btn primary"
              type="button"
              onClick={submit}
              disabled={saveM.isPending}
            >
              추가
            </button>
          )}
        </div>

        {/* 일괄 추가. 위의 Vendor·제품군·모델그룹은 그대로 쓰고 이름만
            줄로 받는다 — 시리즈 하나에 모델이 열 개씩 되는 일이 흔한데
            한 줄씩 넣으면 공통 값을 매번 다시 고르게 된다. */}
        {bulkOpen && (
          <div className="dc-bulk">
            <textarea
              rows={7}
              value={bulk}
              placeholder={
                kind === 'model'
                  ? 'E6100-24T\nE6100-48T, gi1/0/1-48, te1/1-4\nE6200-24T'
                  : `${cur.label} 을 한 줄에 하나씩\n\n예:\nLAB-1\nLAB-2`
              }
              onChange={(e) => setBulk(e.target.value)}
            />
            <div className="dc-bulk-foot">
              <span className="muted small">
                {bulkLines.length > 0 ? `${bulkLines.length}건` : '한 줄에 하나씩'}
                {kind === 'model' && ' · 이름 뒤에 쉼표나 탭으로 인터페이스를 따로 적을 수 있습니다'}
              </span>
              <button
                className="btn primary"
                type="button"
                onClick={submitBulk}
                disabled={bulkM.isPending || bulkLines.length === 0}
              >
                {bulkM.isPending ? '등록 중…' : `${bulkLines.length || ''}건 등록`}
              </button>
            </div>
          </div>
        )}

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
          <div className="dc-list">
            {items.map((it) => (
              <div className="dc-row" key={it.name}>
                <b className="dc-name">{it.name}</b>
                {kind === 'model' && (
                  <span className="muted small dc-meta">
                    {[it.vendor, it.model_group, it.family].filter(Boolean).join(' · ') || '–'}
                    {it.interfaces ? ` · ${it.interfaces}` : ''}
                  </span>
                )}
                {kind === 'group' && (
                  <span className="muted small dc-meta">
                    {(listQ.data?.items ?? [])
                      .filter((m) => m.kind === 'model' && m.model_group === it.name)
                      .map((m) => m.name)
                      .join(' · ') || '속한 모델 없음'}
                  </span>
                )}
                <span className="muted small">{it.used ? `${it.used}대 사용 중` : ''}</span>
                <span className="dc-actions">
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
