import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'

interface Item {
  kind: string
  name: string
  vendor?: string | null
  operator?: string | null
  /** kind=model 일 때 속한 모델그룹(시리즈) */
  model_group?: string | null
  family?: string | null
  interfaces?: string | null
  note?: string | null
  used?: number
}

/** 왼쪽 분류 다섯 — 이름만 있는 것들. 모델은 오른쪽 표가 주인공이다 */
const SIDE_KINDS: Array<{ v: string; label: string; hint: string }> = [
  { v: 'lab', label: 'LAB', hint: '시험실' },
  { v: 'vendor', label: '벤더', hint: 'UBIQUOSS · IXIA …' },
  { v: 'operator', label: '사업자', hint: 'KT · LGU+ · 공공 …' },
  { v: 'family', label: '제품군', hint: 'L2 · L3 · OLT …' },
  { v: 'group', label: '모델그룹', hint: 'E61xx · UbiEnt …' },
]

/** 새 모델 입력 줄의 빈 값 */
const EMPTY_MODEL: Item = { kind: 'model', name: '' }

/**
 * 장비 카탈로그 — 한 화면.
 *
 * 전에는 탭 여섯을 오가며 「고치기로 위에 올려서 다시 추가」 해야 했다.
 * 이제 왼쪽에서 분류(LAB·벤더·사업자·제품군·모델그룹)를 알약으로 바로
 * 만들고·이름 바꾸고·지우고, 오른쪽 모델 표에서는 **칸을 그 자리에서
 * 고친다** — 콤보를 바꾸면 바로 저장된다.
 *
 * 목록에 없는 저장값은 붉게 드러난다. 유비쿼스가 DB 에 숨은 채 화면은
 * 빈 칸이던 일을 다시 만들지 않기 위해서다.
 */
export default function DeviceCatalog() {
  const qc = useQueryClient()
  const [note, setNote] = useState<{ kind: string; msg: string }>({ kind: '', msg: '' })
  /** 두 탭 — 분류 등록 / 모델 목록. 보던 쪽을 기억한다 */
  const [view, setView] = useState<'cls' | 'models' | 'tree'>(() => {
    const v = localStorage.getItem('utop.dc.view')
    return v === 'cls' || v === 'models' ? v : 'tree'
  })
  const pickView = (v: 'cls' | 'models' | 'tree') => {
    setView(v)
    localStorage.setItem('utop.dc.view', v)
  }
  /** 트리에서 고른 자리 — LAB(거르개) · 벤더 › 제품군 › 모델그룹 */
  const [tlab, setTlab] = useState('')
  const [tven, setTven] = useState('')
  const [tfam, setTfam] = useState('')
  const [tgrp, setTgrp] = useState('')
  /** 새 모델 줄 */
  const [draft, setDraft] = useState<Item>(EMPTY_MODEL)
  /** 분류마다 새 이름 입력칸 */
  const [adds, setAdds] = useState<Record<string, string>>({})
  /** 모델 일괄 추가 */
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulk, setBulk] = useState('')
  /** 인터페이스 큰 편집창 — U9500H 처럼 포트가 수십·수백이면 한 줄로 안 된다 */
  const [ifEdit, setIfEdit] = useState<{ model: Item; text: string } | null>(null)

  const listQ = useQuery({
    queryKey: ['device-catalog'],
    queryFn: async () => {
      const r = await apiFetch('/api/device-catalog2')
      if (!r.ok) throw new Error('불러오지 못했습니다')
      return (await r.json()) as { items: Item[] }
    },
  })
  /** 어느 모델이 어느 LAB 에 있나 — LAB 은 장비가 들고 있다(트리 1층) */
  const devQ = useQuery({
    queryKey: ['devices', 'labmap'],
    queryFn: async () => {
      const r = await apiFetch('/api/devices2?ifs=0')
      if (!r.ok) throw new Error('장비를 불러오지 못했습니다')
      return (await r.json()) as { devices: Array<{ model?: string | null; lab?: string | null }> }
    },
    staleTime: 60_000,
  })
  const labsOfModel = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const d of devQ.data?.devices ?? []) {
      const md = String(d.model ?? '').trim()
      if (!md) continue
      const lb = String(d.lab ?? '').trim() || '(LAB 없음)'
      if (!m.has(md)) m.set(md, new Set())
      m.get(md)!.add(lb)
    }
    return m
  }, [devQ.data])

  const all = listQ.data?.items ?? []
  const of = (kind: string) => all.filter((i) => i.kind === kind)
  const models = of('model')
  const lists: Record<string, Item[]> = {
    lab: of('lab'),
    vendor: of('vendor'),
    operator: of('operator'),
    family: of('family'),
    group: of('group'),
  }

  const refetch = () => {
    void qc.invalidateQueries({ queryKey: ['device-catalog'] })
    void qc.invalidateQueries({ queryKey: ['device-roles'] })
  }

  const saveM = useMutation({
    mutationFn: async (it: Item) => {
      const r = await apiFetch('/api/device-catalog2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(it),
      })
      const b = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error((b as { detail?: string }).detail || '저장하지 못했습니다')
      return it
    },
    onSuccess: (it) => {
      setNote({ kind: 'ok', msg: `저장했습니다 — ${it.name}` })
      if (it.kind === 'model' && it.name === draft.name.trim()) setDraft({ ...draft, name: '' })
      refetch()
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
      if (!r.ok) throw new Error((b as { detail?: string }).detail || '지우지 못했습니다')
    },
    onSuccess: () => {
      setNote({ kind: 'ok', msg: '지웠습니다' })
      refetch()
    },
    onError: (e) => setNote({ kind: 'err', msg: e instanceof Error ? e.message : String(e) }),
  })

  /** 이름 변경 — 그 이름을 쓰는 모델·장비까지 서버가 한 번에 바꾼다.
      새 이름이 이미 있으면 병합된다 (Spirent → SPIRENT). */
  const renameM = useMutation({
    mutationFn: async (v: { kind: string; old: string; next: string }) => {
      const r = await apiFetch('/api/device-catalog2/rename', {
        method: 'POST',
        body: JSON.stringify({ kind: v.kind, old: v.old, new: v.next }),
      })
      if (!r.ok)
        throw new Error(
          ((await r.json().catch(() => ({}))) as { detail?: string }).detail || String(r.status),
        )
    },
    onSuccess: () => {
      setNote({ kind: 'ok', msg: '이름을 바꿨습니다 — 쓰던 모델·장비도 함께 바뀌었습니다' })
      refetch()
    },
    onError: (e) => setNote({ kind: 'err', msg: e instanceof Error ? e.message : String(e) }),
  })

  /** 여러 줄 한 번에 — 공통 값은 새 모델 줄에서 고른 것을 쓰고,
      줄마다 「이름[, 인터페이스]」 로 받는다 (엑셀 붙여넣기 호환) */
  const bulkM = useMutation({
    mutationFn: async (lines: string[]) => {
      const done: string[] = []
      const failed: Array<{ name: string; why: string }> = []
      for (const line of lines) {
        const at = line.search(/[\t,]/)
        const name = (at < 0 ? line : line.slice(0, at)).trim()
        const rawIf = at < 0 ? '' : line.slice(at + 1)
        if (!name) continue
        try {
          const r = await apiFetch('/api/device-catalog2', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...draft,
              kind: 'model',
              name,
              interfaces: rawIf.trim() || draft.interfaces || null,
            }),
          })
          const b = await r.json().catch(() => ({}))
          if (!r.ok) throw new Error((b as { detail?: string }).detail || '저장 실패')
          done.push(name)
        } catch (e) {
          failed.push({ name, why: e instanceof Error ? e.message : String(e) })
        }
      }
      return { done, failed }
    },
    onSuccess: ({ done, failed }) => {
      refetch()
      if (failed.length === 0) {
        setBulk('')
        setBulkOpen(false)
        setNote({ kind: 'ok', msg: `${done.length}건 등록했습니다` })
        return
      }
      setBulk(failed.map((f) => f.name).join('\n'))
      setNote({
        kind: 'err',
        msg:
          `${done.length}건 등록, ${failed.length}건 실패 — ` +
          failed.slice(0, 3).map((f) => `${f.name}: ${f.why}`).join(' / ') +
          (failed.length > 3 ? ` 외 ${failed.length - 3}건` : ''),
      })
    },
    onError: (e) => setNote({ kind: 'err', msg: e instanceof Error ? e.message : String(e) }),
  })

  /** 표의 콤보 하나 — 값이 목록에 없으면 붉고, 그 값도 고를 수 있게 남긴다 */
  const cellSelect = (
    row: Item,
    field: 'vendor' | 'operator' | 'family' | 'model_group',
    listKind: string,
  ) => {
    const val = String(row[field] ?? '')
    const list = lists[listKind] ?? []
    const known = !val || list.some((x) => x.name === val)
    return (
      <select
        className={known ? '' : 'dc-warn'}
        value={val}
        onChange={(e) => saveM.mutate({ ...row, kind: 'model', [field]: e.target.value })}
      >
        <option value="">–</option>
        {!known && <option value={val}>{val} (목록에 없음)</option>}
        {list.map((x) => (
          <option key={x.name}>{x.name}</option>
        ))}
      </select>
    )
  }

  const bulkLines = bulk.split('\n').map((x) => x.trim()).filter(Boolean)

  return (
    <div className="set-page dc2">
      <div className="set-head">
        <div>
          <h3>장비 카탈로그</h3>
          <p className="muted">
            「분류 등록」 에서 LAB·벤더·사업자·제품군·모델그룹을 만들고, 「모델 목록」 표에서는
            칸을 <b>그 자리에서</b> 바꿉니다 — 콤보를 바꾸면 바로 저장됩니다.
          </p>
        </div>
      </div>

      <div className="seg" role="tablist">
        {(
          [
            ['tree', '트리'],
            ['cls', '분류 등록'],
            ['models', '모델 목록'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={view === k}
            className={`seg-btn${view === k ? ' on' : ''}`}
            onClick={() => pickView(k)}
          >
            {label}
            <span className="cnt">{k === 'models' ? models.length : SIDE_KINDS.reduce((a, x) => a + (lists[x.v]?.length ?? 0), 0)}</span>
          </button>
        ))}
      </div>

      {note.msg && <div className={`set-note ${note.kind}`}>{note.msg}</div>}

      {/* ── 트리 — **칸을 옮겨 가며 좁힌다**(주신 화면 참고) ─────────
          벤더 › 제품군 › 모델그룹 › 모델. 위에 LAB 알약을 두어 그 랩에 있는
          것만 볼 수 있다(LAB 은 장비가 들고 있는 값이라 읽기만 한다).
          모델을 그 자리에서 더하면 **왼쪽에서 고른 값이 저절로 붙는다** —
          고르개 넷을 따로 채우던 일이 사라진다. */}
      {view === 'tree' && (() => {
        const norm = (v?: string | null) => String(v ?? '').trim()
        const inLab = (m: Item) =>
          !tlab || (labsOfModel.get(m.name) ?? new Set()).has(tlab)
        const labs = [...new Set([...labsOfModel.values()].flatMap((x) => [...x]))].sort((a2, b2) =>
          a2.localeCompare(b2, 'ko'),
        )
        const pool = models.filter(inLab)
        const nV = (v: string) => pool.filter((m) => norm(m.vendor) === v).length
        const nF = (f: string) =>
          pool.filter((m) => norm(m.vendor) === tven && norm(m.family) === f).length
        const nG = (g: string) =>
          pool.filter(
            (m) =>
              norm(m.vendor) === tven &&
              (!tfam || norm(m.family) === tfam) &&
              norm(m.model_group) === g,
          ).length
        const shown = pool.filter(
          (m) =>
            (!tven || norm(m.vendor) === tven) &&
            (!tfam || norm(m.family) === tfam) &&
            (!tgrp || norm(m.model_group) === (tgrp === '(미지정)' ? '' : tgrp)),
        )
        const col = (
          title: string,
          kind: string,
          items: Array<{ nm: string; n: number }>,
          sel: string,
          pick: (v: string) => void,
        ) => (
          <div className="dcc">
            <div className="dcc-h">
              <b>{title}</b>
              <span className="muted small">{items.length}</span>
            </div>
            <div className="dcc-add">
              <input
                value={adds[`t:${kind}`] ?? ''}
                placeholder={`${title} 추가`}
                onChange={(e) => setAdds((v) => ({ ...v, [`t:${kind}`]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  const nm = (adds[`t:${kind}`] ?? '').trim()
                  if (!nm) return
                  saveM.mutate({ kind, name: nm })
                  setAdds((v) => ({ ...v, [`t:${kind}`]: '' }))
                }}
              />
            </div>
            <div className="dcc-b">
              {items.map((x) => (
                <button
                  key={x.nm}
                  type="button"
                  className={`dcc-r${sel === x.nm ? ' on' : ''}`}
                  onClick={() => pick(sel === x.nm ? '' : x.nm)}
                >
                  <span className="ell">{x.nm}</span>
                  <em>{x.n}</em>
                </button>
              ))}
              {items.length === 0 && <div className="dcc-none">없습니다</div>}
            </div>
          </div>
        )

        return (
          <div className="dc2-tree">
            <div className="dcc-labs">
              <span className="muted small">LAB</span>
              <button
                type="button"
                className={`dcc-lab${tlab ? '' : ' on'}`}
                onClick={() => setTlab('')}
              >
                전체 <em>{models.length}</em>
              </button>
              {labs.map((lb) => (
                <button
                  key={lb}
                  type="button"
                  className={`dcc-lab${tlab === lb ? ' on' : ''}`}
                  onClick={() => setTlab(tlab === lb ? '' : lb)}
                >
                  {lb}{' '}
                  <em>{models.filter((m) => (labsOfModel.get(m.name) ?? new Set()).has(lb)).length}</em>
                </button>
              ))}
            </div>

            <div className="dcc-cols">
              {col(
                '벤더',
                'vendor',
                lists.vendor?.map((x) => ({ nm: x.name, n: nV(x.name) })) ?? [],
                tven,
                (v) => {
                  setTven(v)
                  setTfam('')
                  setTgrp('')
                },
              )}
              {col(
                '제품군',
                'family',
                lists.family?.map((x) => ({ nm: x.name, n: nF(x.name) })) ?? [],
                tfam,
                (v) => {
                  setTfam(v)
                  setTgrp('')
                },
              )}
              {col(
                '모델그룹',
                'group',
                [
                  ...(lists.group?.map((x) => ({ nm: x.name, n: nG(x.name) })) ?? []),
                  { nm: '(미지정)', n: nG('') },
                ],
                tgrp,
                setTgrp,
              )}

              <div className="dcc dcc-models">
                <div className="dcc-h">
                  <b>모델</b>
                  <span className="muted small">{shown.length}</span>
                  <span className="sp" />
                  <span className="muted small">
                    {[tlab, tven, tfam, tgrp].filter(Boolean).join(' · ') || '전체'}
                  </span>
                </div>
                <div className="dcc-add">
                  <input
                    value={adds['t:model'] ?? ''}
                    placeholder={
                      tven
                        ? `모델 추가 — ${[tven, tfam, tgrp].filter(Boolean).join(' · ')} 에 붙습니다`
                        : '왼쪽에서 벤더를 먼저 고르세요'
                    }
                    disabled={!tven}
                    onChange={(e) => setAdds((v) => ({ ...v, 't:model': e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return
                      const nm = (adds['t:model'] ?? '').trim()
                      if (!nm || !tven) return
                      /* 고른 자리를 그대로 물려준다(지시) — 넷을 다시 고를 일 없음 */
                      saveM.mutate({
                        kind: 'model',
                        name: nm,
                        vendor: tven,
                        family: tfam || null,
                        model_group: tgrp && tgrp !== '(미지정)' ? tgrp : null,
                      })
                      setAdds((v) => ({ ...v, 't:model': '' }))
                    }}
                  />
                </div>
                <div className="dcc-b">
                  {shown.length === 0 ? (
                    <div className="dcc-none">이 자리에 걸린 모델이 없습니다.</div>
                  ) : (
                    shown.map((it) => (
                      <div className="dcc-m" key={it.name}>
                        <b className="ell" title={it.name}>
                          {it.name}
                        </b>
                        <span className="dcc-op">{cellSelect(it, 'operator', 'operator')}</span>
                        <button
                          type="button"
                          className="dcc-if"
                          title={`${it.interfaces || '(없음)'} — 누르면 크게 편집`}
                          onClick={() => setIfEdit({ model: it, text: it.interfaces ?? '' })}
                        >
                          {it.interfaces || '＋ 인터페이스'}
                        </button>
                        <span className="muted small dcc-used">{it.used ? `장비 ${it.used}` : '–'}</span>
                        <button
                          className="btn small danger"
                          type="button"
                          disabled={delM.isPending}
                          onClick={() => {
                            if (window.confirm(`'${it.name}' 을 지울까요?`)) delM.mutate(it)
                          }}
                        >
                          삭제
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      <div className={`dc2-cols dc2-${view}`}>
        {/* ── 분류 다섯 — 알약으로 만들고·바꾸고·지운다 ────── */}
        {view === 'cls' && (
        <aside className="dc2-side">
          {SIDE_KINDS.map((k) => (
            <section className="dc2-sec" key={k.v}>
              <div className="dc2-sech">
                <b>{k.label}</b>
                <span className="muted small">{lists[k.v]?.length ?? 0}</span>
              </div>
              <div className="dc2-chips">
                {(lists[k.v] ?? []).map((it) => (
                  <span
                    className="dc2-chip"
                    key={it.name}
                    title={it.used ? `${it.used}대 사용 중` : ''}
                  >
                    <button
                      type="button"
                      className="dc2-chip-nm"
                      title="누르면 이름을 바꿉니다 — 쓰던 모델·장비도 함께"
                      onClick={() => {
                        const next = window.prompt(`'${it.name}' 의 새 이름`, it.name)?.trim()
                        if (next && next !== it.name)
                          renameM.mutate({ kind: k.v, old: it.name, next })
                      }}
                    >
                      {it.name}
                    </button>
                    {it.used ? <i className="dc2-used">{it.used}</i> : null}
                    <button
                      type="button"
                      className="dc2-chip-x"
                      aria-label={`${it.name} 지우기`}
                      title="지우기 — 쓰는 장비가 있으면 어느 장비인지 알려줍니다"
                      onClick={() => {
                        if (window.confirm(`'${it.name}' 을 지울까요?`)) delM.mutate(it)
                      }}
                    >
                      ✕
                    </button>
                  </span>
                ))}
                <input
                  className="dc2-add"
                  placeholder={`+ ${k.label}`}
                  title={k.hint}
                  value={adds[k.v] ?? ''}
                  onChange={(e) => setAdds((a) => ({ ...a, [k.v]: e.target.value }))}
                  onKeyDown={(e) => {
                    const name = (adds[k.v] ?? '').trim()
                    if (e.key === 'Enter' && name) {
                      saveM.mutate({ kind: k.v, name })
                      setAdds((a) => ({ ...a, [k.v]: '' }))
                    }
                  }}
                />
              </div>
            </section>
          ))}
        </aside>
        )}

        {/* ── 모델 표 — 그 자리에서 고친다 ─────────────── */}
        {view === 'models' && (
        <section className="dc2-main">
          <div className="dc2-sech">
            <b>모델 {models.length}</b>
            <span className="muted small">칸을 바꾸면 바로 저장됩니다</span>
            <span className="sp" />
            <button className="btn small" type="button" onClick={() => setBulkOpen((v) => !v)}>
              {bulkOpen ? '하나씩 추가' : '일괄 추가'}
            </button>
          </div>

          <div className="dc-table">
            {/* 칸 차례는 등록 순서 그대로: 사업자→벤더→제품군→모델그룹→모델명 */}
            <div className="dc-tr dc-th">
              <b>사업자</b>
              <b>벤더</b>
              <b>제품군</b>
              <b>모델그룹</b>
              <b>모델명</b>
              <b>기본 인터페이스</b>
              <b>사용</b>
              <b />
            </div>

            {/* 새 모델 줄 — 표 맨 위가 곧 등록 칸이다 */}
            {!bulkOpen && (
              <div className="dc-tr dc2-new">
                {(['operator', 'vendor', 'family', 'model_group'] as const).map((f, i) => (
                  <select
                    key={f}
                    value={String(draft[f] ?? '')}
                    onChange={(e) => setDraft({ ...draft, [f]: e.target.value })}
                  >
                    <option value="">{['사업자', '벤더', '제품군', '모델그룹'][i]}</option>
                    {(lists[f === 'model_group' ? 'group' : f] ?? []).map((x) => (
                      <option key={x.name}>{x.name}</option>
                    ))}
                  </select>
                ))}
                <input
                  placeholder="+ 새 모델명"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && draft.name.trim())
                      saveM.mutate({ ...draft, kind: 'model', name: draft.name.trim() })
                  }}
                />
                <input
                  placeholder="gi1/0/1-48, te1/1-4"
                  value={draft.interfaces ?? ''}
                  onChange={(e) => setDraft({ ...draft, interfaces: e.target.value })}
                />
                <span />
                <span className="dc-actions">
                  <button
                    className="btn small primary"
                    type="button"
                    disabled={!draft.name.trim() || saveM.isPending}
                    onClick={() =>
                      saveM.mutate({ ...draft, kind: 'model', name: draft.name.trim() })
                    }
                  >
                    추가
                  </button>
                </span>
              </div>
            )}

            {bulkOpen && (
              <div className="dc2-bulk">
                <p className="muted small">
                  공통 값(벤더·제품군·사업자·모델그룹)은 새 모델 줄에서 고른 것을 씁니다. 한
                  줄에 「이름[, 인터페이스]」 — 엑셀에서 붙여넣어도 됩니다.
                </p>
                <textarea
                  rows={6}
                  value={bulk}
                  placeholder={'E6100-24T\nE6100-48T, gi1/0/1-48, te1/1-4'}
                  onChange={(e) => setBulk(e.target.value)}
                />
                <div className="dc2-bulkfoot">
                  <span className="muted small">
                    {bulkLines.length ? `${bulkLines.length}건` : ''}
                  </span>
                  <button
                    className="btn small primary"
                    type="button"
                    disabled={bulkM.isPending || bulkLines.length === 0}
                    onClick={() => bulkM.mutate(bulkLines)}
                  >
                    {bulkM.isPending ? '등록 중…' : `${bulkLines.length || ''}건 등록`}
                  </button>
                </div>
              </div>
            )}

            {listQ.isLoading ? (
              <div className="empty">불러오는 중…</div>
            ) : (
              models.map((it) => (
                <div className="dc-tr" key={it.name}>
                  {cellSelect(it, 'operator', 'operator')}
                  {cellSelect(it, 'vendor', 'vendor')}
                  {cellSelect(it, 'family', 'family')}
                  {cellSelect(it, 'model_group', 'group')}
                  <b className="dc-name" title={it.name}>
                    {it.name}
                  </b>
                  {/* 포트가 수십·수백 개라 한 줄 입력으로는 안 된다 —
                      누르면 큰 편집창이 뜬다 */}
                  <button
                    type="button"
                    className="dc2-if dc2-ifbtn"
                    title={`${it.interfaces || '(없음)'} — 누르면 크게 편집`}
                    onClick={() => setIfEdit({ model: it, text: it.interfaces ?? '' })}
                  >
                    {it.interfaces || '–'}
                  </button>
                  <span className="muted small">{it.used ? `${it.used}대` : '–'}</span>
                  <span className="dc-actions">
                    <button
                      className="btn small danger"
                      type="button"
                      disabled={delM.isPending}
                      title={
                        it.used ? `${it.used}대가 쓰는 중 — 누르면 어느 장비인지 알려줍니다` : ''
                      }
                      onClick={() => {
                        if (window.confirm(`'${it.name}' 을 지울까요?`)) delM.mutate(it)
                      }}
                    >
                      삭제
                    </button>
                  </span>
                </div>
              ))
            )}
          </div>

          {ifEdit && (
            <div className="modal-back" onMouseDown={() => setIfEdit(null)}>
              <div
                className="modal dc2-ifmodal"
                role="dialog"
                aria-modal="true"
                aria-label="기본 인터페이스 편집"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="modal-head">
                  <b>{ifEdit.model.name} — 기본 인터페이스</b>
                  <span className="sp" />
                  <button className="btn" type="button" onClick={() => setIfEdit(null)}>
                    취소
                  </button>
                  <button
                    className="btn primary"
                    type="button"
                    onClick={() => {
                      const v = ifEdit.text.trim().replace(/\n+/g, ', ')
                      saveM.mutate({ ...ifEdit.model, kind: 'model', interfaces: v || null })
                      setIfEdit(null)
                    }}
                  >
                    저장
                  </button>
                </div>
                <p className="muted small">
                  쉼표나 줄바꿈으로 나눠 적으세요 — 범위 표기(gi1/0/1-48, pon1/1-80)가 됩니다.
                  줄바꿈은 저장할 때 쉼표로 합칩니다.
                </p>
                <textarea
                  autoFocus
                  rows={12}
                  value={ifEdit.text}
                  onChange={(e) => setIfEdit({ ...ifEdit, text: e.target.value })}
                />
              </div>
            </div>
          )}

          <div className="hint">
            기본 인터페이스를 적어두면 장비 등록에서 이 모델을 고를 때 포트가 그대로 채워집니다.
            모델명 자체를 바꾸는 것은 사이클·시험이 물려 있어 막아 두었습니다.
          </div>
        </section>
        )}
      </div>
    </div>
  )
}
