import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/api/client'
import { EfGrid, leafRows, useEfTable, type EfCtx } from '@/components/effort/EffortTable'
import { FilterBody, Pop } from '@/components/effort/EffortMenus'
import EffortTree from '@/components/effort/EffortTree'
import {
  TYPES,
  defaultGroup,
  downloadCsv,
  ensureViews,
  hasOptions,
  isNumCol,
  newId,
  normalize,
  tableOf,
  viewState,
  type EfColumn,
  type EfDoc,
  type EfType,
  type EfView,
  type EfViewState,
} from '@/components/effort/model'
import '@/components/effort/Effort.css'

/**
 * Effort Plan — 연도별 인원 투입(M/M) 계획표.
 *
 * 예전 UTOP 의 「인원 투입 beta」(TanStack Table)를 옮겼다(지시: 리소스 메뉴, 이름 Effort Plan).
 * 자료는 예전과 같은 /api/resource/manpower(KV "manpower") 문서 한 벌이다 — 서버가 저장 전에
 * 백업(최근 30개)을 남긴다. 연도는 페이지(pages[YYYY].rows), 열은 모든 연도가 함께 쓴다.
 * 보기 탭은 betaViews — 탭마다 검색·필터·정렬·그룹을 따로 기억한다(v.ef).
 * 보드·차트·타임라인 보기는 아직 옮기지 않았다(탭은 남기고 안내만 한다).
 */

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

export default function EffortPlan() {
  const docRef = useRef<EfDoc | null>(null)
  const [ver, setVer] = useState(0)
  const [err, setErr] = useState('')
  const [save, setSave] = useState<SaveState>('idle')
  const [msg, setMsg] = useState('')
  const timer = useRef<number | undefined>(undefined)
  const toastT = useRef<number | undefined>(undefined)

  useEffect(() => {
    let off = false
    apiFetch('/api/resource/manpower')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status + ' ' + r.statusText))))
      .then((raw) => {
        if (off) return
        const d = normalize(raw)
        ensureViews(d)
        docRef.current = d
        setVer((v) => v + 1)
      })
      .catch((e: Error) => !off && setErr(e.message || String(e)))
    return () => {
      off = true
    }
  }, [])

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current)
    timer.current = undefined
    const d = docRef.current
    if (!d) return
    setSave('saving')
    try {
      const r = await apiFetch('/api/resource/manpower', { method: 'POST', body: JSON.stringify(d) })
      if (!r.ok) throw new Error(String(r.status))
      setSave((s) => (s === 'saving' ? 'saved' : s))
    } catch {
      setSave('error')
    }
  }, [])
  /** 문서를 고쳤다 — 다시 그리고, 잠시 뒤 한 번에 저장한다 */
  const touch = useCallback(() => {
    setVer((v) => v + 1)
    setSave('dirty')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void flush(), 700)
  }, [flush])
  // 화면을 떠나기 전에 남은 저장을 보낸다
  useEffect(() => {
    const bye = (e: BeforeUnloadEvent) => {
      if (timer.current === undefined) return
      void flush()
      e.preventDefault()
    }
    window.addEventListener('beforeunload', bye)
    return () => {
      window.removeEventListener('beforeunload', bye)
      if (timer.current !== undefined) void flush()
    }
  }, [flush])

  const toast = useCallback((m: string) => {
    setMsg(m)
    window.clearTimeout(toastT.current)
    toastT.current = window.setTimeout(() => setMsg(''), 2200)
  }, [])

  const d = docRef.current
  if (err) return <section className="panel ef"><div className="ef-empty">불러오지 못했습니다 — {err}</div></section>
  if (!d) return <section className="panel ef"><div className="ef-empty">불러오는 중…</div></section>
  const cur = d.efTree!.cur
  return (
    <section className="panel ef">
      <div className="ef-layout">
        <EffortTree root={d} touch={touch} toast={toast} />
        {/* 표를 바꾸면 표 쪽 상태(펼침·선택·너비)는 새로 — key 로 다시 만든다 */}
        <EffortBody
          key={cur}
          d={tableOf(d, cur)}
          name={d.efTree!.nodes.find((n) => n.id === cur)?.name ?? ''}
          ver={ver}
          touch={touch}
          toast={toast}
          save={save}
          retry={() => void flush()}
        />
      </div>
      {msg && <div className="ef-toast">{msg}</div>}
    </section>
  )
}

/** 고른 표 하나 — 제목(표 이름 · 연도 ▾) · 보기 탭 · 도구 줄 · 표 */
function EffortBody({
  d,
  name,
  ver,
  touch,
  toast,
  save,
  retry,
}: {
  d: EfDoc
  name: string
  ver: number
  touch: () => void
  toast: (m: string) => void
  save: SaveState
  retry: () => void
}) {
  const year = d.curPage!
  const rows = d.pages[year]!.rows
  const cols = d.columns
  const views = ensureViews(d)
  const view = views.find((v) => v.id === d.curBetaView) ?? views[0]!
  // 보기 상태는 보기에 붙여 둔다 — 그릴 때마다 새로 만들면 표가 「바뀌었다」 고 보고 다시 계산한다
  if (!view.ef) view.ef = viewState(view, cols)
  const st = view.ef
  const setSt = (p: Partial<EfViewState>) => {
    view.ef = { ...st, ...p }
    touch()
  }
  const ctx: EfCtx = { doc: d, rows, cols, st, setSt, touch, toast, ver }
  const api = useEfTable(ctx)
  const { table } = api

  const [pop, setPop] = useState<{ kind: string; anchor: HTMLElement; id?: string } | null>(null)
  const [colMgr, setColMgr] = useState(false)
  const open = (kind: string, id?: string) => (e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault()
    const a = e.currentTarget
    setPop((p) => (p && p.kind === kind && p.anchor === a ? null : { kind, anchor: a, id }))
  }
  const close = () => setPop(null)

  const setYear = (y: string) => {
    d.curPage = y
    touch()
  }
  const addYear = (y: string) => {
    if (!/^\d{4}$/.test(y)) return toast('연도는 숫자 4자리입니다')
    if (d.pages[y]) {
      setYear(y)
      return
    }
    d.pages[y] = { rows: [] }
    d.years = [...(d.years ?? []), y].sort().reverse()
    setYear(y)
    toast(y + '년 추가됨')
  }
  const clearYear = (y: string) => {
    const n = d.pages[y]?.rows.length ?? 0
    if (!n) return toast('이미 비어 있습니다')
    if (!window.confirm(`${y}년의 ${n}행을 모두 지울까요?\n(서버가 저장 전 상태를 백업해 둡니다)`)) return
    d.pages[y]!.rows.splice(0)
    touch()
  }
  const delYear = (y: string) => {
    if ((d.years ?? []).length <= 1) return toast('마지막 연도는 삭제할 수 없습니다')
    const n = d.pages[y]?.rows.length ?? 0
    if (!window.confirm(`${y}년${n ? `(${n}행)` : ''}을 삭제할까요?\n(서버가 저장 전 상태를 백업해 둡니다)`)) return
    delete d.pages[y]
    d.years = (d.years ?? []).filter((x) => x !== y)
    if (d.curPage === y) d.curPage = d.years[0]
    touch()
  }

  const addView = () => {
    const v: EfView = { id: newId(), name: '표 ' + (views.length + 1), type: 'table' }
    views.push(v)
    d.curBetaView = v.id
    touch()
  }

  const fCount = st.filters.filter((f) => cols.some((c) => c.id === f.id)).length
  const sCount = st.sorting.filter((s) => cols.some((c) => c.id === s.id)).length
  const gId = table.getState().grouping[0]
  const gName = cols.find((c) => c.id === gId)?.title ?? ''
  const shownN = table.getFilteredRowModel().rows.length
  const isTable = (view.type || 'table') === 'table'

  return (
    <>
        <div className="ef-main">
          <div className="ef-head">
            <b>Effort Plan</b>
            <span className="ef-head-sep">·</span>
            <span className="ef-head-name">{name}</span>
            <button type="button" className="ef-yrbtn" title="연도 바꾸기·추가·삭제" onClick={open('yearmenu')}>
              {year}년 ▾
            </button>
            <span className={`ef-save ${save}`} onClick={save === 'error' ? retry : undefined}>
              {save === 'saving' || save === 'dirty' ? '저장 중…' : save === 'saved' ? '저장됨' : save === 'error' ? '저장 실패 — 눌러서 다시' : ''}
            </span>
          </div>

          <div className="ef-toolbar">
            <div className="ef-tabs">
              {views.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className={`ef-tab${v.id === view.id ? ' on' : ''}`}
                  title="우클릭: 이름 바꾸기·복사·삭제"
                  onClick={() => {
                    if (d.curBetaView === v.id) return
                    d.curBetaView = v.id
                    touch()
                  }}
                  onContextMenu={open('view', v.id)}
                >
                  <span className="ef-tab-ic">{viewIcon(v.type)}</span>
                  {v.name}
                </button>
              ))}
              <button type="button" className="ef-tab ef-tab-add" title="표 보기 추가" onClick={addView}>
                ＋
              </button>
            </div>
            <span className="ef-sp" />
            <input
              className="ef-search"
              placeholder="🔍 검색"
              aria-label="검색"
              value={st.q}
              onChange={(e) => setSt({ q: e.target.value })}
            />
            <button type="button" className={`ef-btn gh${fCount ? ' on' : ''}`} onClick={open('filter')}>
              ⏷ 필터{fCount ? ' ' + fCount : ''}
            </button>
            <button type="button" className={`ef-btn gh${sCount ? ' on' : ''}`} onClick={open('sort')}>
              ⇅ 정렬{sCount ? ' ' + sCount : ''}
            </button>
            <button type="button" className={`ef-btn gh${gId ? ' on' : ''}`} onClick={open('group')}>
              ☰ 그룹{gName ? ': ' + gName : ''}
            </button>
            <span className="ef-tbsep" />
            <button type="button" className="ef-btn gh" onClick={() => setColMgr(true)}>
              ▥ 열 설정
            </button>
            <button
              type="button"
              className="ef-btn gh"
              onClick={() => {
                d.columns.push({ id: newId(), title: '새 속성', type: 'text' })
                touch()
                toast('열 추가됨 — 머리글을 눌러 이름·유형을 바꾸세요')
              }}
            >
              ⇥ 열 추가
            </button>
            <button
              type="button"
              className="ef-btn gh"
              onClick={() => {
                rows.push({})
                touch()
                toast(
                  st.q.trim() || fCount
                    ? '행 추가됨 — 검색·필터에 가려 지금은 안 보입니다'
                    : gId
                      ? '행 추가됨 — 그룹 「(빈값)」 아래에 있습니다'
                      : '행 추가됨 — 맨 아래에 있습니다',
                )
              }}
            >
              ＋ 행 추가
            </button>
            <button
              type="button"
              className="ef-btn"
              onClick={() => {
                const out = leafRows(table)
                downloadCsv(`EffortPlan_${name || '표'}_${year}.csv`, table.getVisibleLeafColumns().map((c) => (c.columnDef.meta as { col: EfColumn }).col), out)
                toast('CSV 내려받음 — ' + out.length + '행')
              }}
            >
              ⤓ CSV
            </button>
            <span className="ef-cnt-all">{shownN}행</span>
          </div>

          <div className="ef-wrap">
            {!cols.length ? (
              <div className="ef-empty">열이 없습니다 — [열 설정]에서 추가하세요</div>
            ) : isTable ? (
              <EfGrid ctx={ctx} api={api} />
            ) : (
              <div className="ef-empty">
                「{view.name}」은 {viewName(view.type)} 보기입니다 — Effort Plan 에는 아직 표 보기만 있습니다.
              </div>
            )}
          </div>
        </div>

      {pop?.kind === 'addyear' && <AddYear anchor={pop.anchor} years={d.years ?? []} onAdd={(y) => { close(); addYear(y) }} onClose={close} />}
      {pop?.kind === 'yearmenu' && (
        <Pop anchor={pop.anchor} cls="ef-menu" onClose={close}>
          <div className="ef-lbl">연도</div>
          <div className="ef-mlist">
            {(d.years ?? []).map((y) => (
              <div key={y} className="ef-yrrow">
                <button type="button" className={`ef-mi${y === year ? ' on' : ''}`} onClick={() => { close(); setYear(y) }}>
                  <i className="ef-mi-ic">▦</i>
                  <span>{y}년</span>
                  <em className="ef-mi-n">{d.pages[y]?.rows.length ?? 0}</em>
                </button>
                <button type="button" className="ef-yrmore" title="비우기·삭제" onClick={() => setPop({ kind: 'year', anchor: pop.anchor, id: y })}>
                  ⋯
                </button>
              </div>
            ))}
          </div>
          <div className="ef-sep" />
          <button type="button" className="ef-mi" onClick={() => setPop({ kind: 'addyear', anchor: pop.anchor })}>
            <i className="ef-mi-ic">＋</i>
            <span>연도 추가</span>
          </button>
        </Pop>
      )}
      {pop?.kind === 'year' && pop.id && (
        <Pop anchor={pop.anchor} cls="ef-menu" onClose={close}>
          <div className="ef-lbl">{pop.id}년</div>
          <button type="button" className="ef-mi" onClick={() => { const y = pop.id!; close(); clearYear(y) }}>
            <i className="ef-mi-ic">⌫</i>
            <span>이 연도 비우기</span>
          </button>
          <button type="button" className="ef-mi del" onClick={() => { const y = pop.id!; close(); delYear(y) }}>
            <i className="ef-mi-ic">✕</i>
            <span>연도 삭제</span>
          </button>
        </Pop>
      )}
      {pop?.kind === 'view' && pop.id && (
        <ViewMenu
          anchor={pop.anchor}
          view={views.find((v) => v.id === pop.id)!}
          canDelete={views.length > 1}
          onClose={close}
          onRename={(nm) => {
            const v = views.find((x) => x.id === pop.id)
            if (v && nm && nm !== v.name) {
              v.name = nm
              touch()
            }
          }}
          onDup={() => {
            const i = views.findIndex((x) => x.id === pop.id)
            const nv = JSON.parse(JSON.stringify(views[i])) as EfView
            nv.id = newId()
            nv.name = views[i]!.name + ' 복사'
            views.splice(i + 1, 0, nv)
            d.curBetaView = nv.id
            close()
            touch()
          }}
          onDelete={() => {
            const i = views.findIndex((x) => x.id === pop.id)
            if (i < 0 || views.length <= 1) return
            if (!window.confirm(`「${views[i]!.name}」 보기를 삭제할까요? (자료는 그대로입니다)`)) return
            views.splice(i, 1)
            if (d.curBetaView === pop.id) d.curBetaView = views[Math.max(0, i - 1)]!.id
            close()
            touch()
          }}
        />
      )}
      {pop?.kind === 'filter' && (
        <FilterPanel anchor={pop.anchor} cols={cols} table={table} onClear={() => setSt({ filters: [] })} onClose={close} />
      )}
      {pop?.kind === 'sort' && <SortPanel anchor={pop.anchor} cols={cols} st={st} setSt={setSt} onClose={close} />}
      {pop?.kind === 'group' && (
        <Pop anchor={pop.anchor} cls="ef-menu" onClose={close}>
          <div className="ef-lbl">그룹 기준</div>
          <div className="ef-mlist">
            <button type="button" className={`ef-mi${!gId ? ' on' : ''}`} onClick={() => { close(); setSt({ group: '' }) }}>
              <i className="ef-mi-ic">≡</i>
              <span>그룹 없음</span>
              {!gId && <i className="ef-mi-ck">✓</i>}
            </button>
            {cols
              .filter((c) => !isNumCol(c))
              .map((c) => (
                <button key={c.id} type="button" className={`ef-mi${gId === c.id ? ' on' : ''}`} onClick={() => { close(); setSt({ group: c.id }) }}>
                  <i className="ef-mi-ic">☰</i>
                  <span>{c.title}</span>
                  {c.id === defaultGroup(cols) && <em className="ef-mi-n">기본</em>}
                  {gId === c.id && <i className="ef-mi-ck">✓</i>}
                </button>
              ))}
          </div>
        </Pop>
      )}
      {colMgr && <ColMgr d={d} touch={touch} toast={toast} onClose={() => setColMgr(false)} />}
    </>
  )
}

const VIEW_TYPES: Record<string, [string, string]> = {
  table: ['▦', '표'],
  board: ['▤', '보드'],
  chart: ['▥', '차트'],
  gantt: ['▬', '타임라인'],
}
const viewIcon = (t: string) => VIEW_TYPES[t || 'table']?.[0] ?? '▦'
const viewName = (t: string) => VIEW_TYPES[t || 'table']?.[1] ?? t

function AddYear({ anchor, years, onAdd, onClose }: { anchor: HTMLElement; years: string[]; onAdd: (y: string) => void; onClose: () => void }) {
  const nums = years.map(Number).filter((n) => !isNaN(n))
  const base = nums.length ? Math.max(...nums) : new Date().getFullYear() - 1
  const cands: number[] = []
  for (let k = 1; k <= 4; k++) if (!years.includes(String(base + k))) cands.push(base + k)
  const [v, setV] = useState(String(cands[0] ?? base + 1))
  return (
    <Pop anchor={anchor} cls="ef-menu ef-addyear" onClose={onClose}>
      <div className="ef-lbl">연도 추가</div>
      <input
        className="ef-yrin"
        autoFocus
        inputMode="numeric"
        value={v}
        aria-label="추가할 연도"
        onChange={(e) => setV(e.target.value.replace(/\D/g, '').slice(0, 4))}
        onKeyDown={(e) => e.key === 'Enter' && onAdd(v)}
      />
      <div className="ef-yrcands">
        {cands.map((y) => (
          <button key={y} type="button" className="ef-yrc" onClick={() => setV(String(y))}>
            {y}
          </button>
        ))}
      </div>
      <button type="button" className="ef-btn ef-full" onClick={() => onAdd(v)}>
        추가
      </button>
    </Pop>
  )
}

function ViewMenu({
  anchor,
  view,
  canDelete,
  onRename,
  onDup,
  onDelete,
  onClose,
}: {
  anchor: HTMLElement
  view: EfView
  canDelete: boolean
  onRename: (n: string) => void
  onDup: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const [name, setName] = useState(view.name)
  const done = () => {
    onRename(name.trim())
    onClose()
  }
  return (
    <Pop anchor={anchor} cls="ef-menu" onClose={done}>
      <input
        className="ef-menu-name"
        value={name}
        aria-label="보기 이름"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && done()}
      />
      <div className="ef-mlist">
        <button type="button" className="ef-mi" onClick={onDup}>
          <i className="ef-mi-ic">⧉</i>
          <span>보기 복사</span>
        </button>
        {canDelete && (
          <button type="button" className="ef-mi del" onClick={onDelete}>
            <i className="ef-mi-ic">✕</i>
            <span>보기 삭제</span>
          </button>
        )}
      </div>
    </Pop>
  )
}

/** 툴바 필터 — 왼쪽은 열 목록(걸린 열은 파랗게), 오른쪽은 고른 열의 필터 */
function FilterPanel({
  anchor,
  cols,
  table,
  onClear,
  onClose,
}: {
  anchor: HTMLElement
  cols: EfColumn[]
  table: ReturnType<typeof useEfTable>['table']
  onClear: () => void
  onClose: () => void
}) {
  const on = cols.filter((c) => table.getColumn(c.id)?.getIsFiltered())
  const [cur, setCur] = useState<string>(on[0]?.id ?? cols[0]?.id ?? '')
  const col = cols.find((c) => c.id === cur)
  const tc = col ? table.getColumn(col.id) : undefined
  const opts = col ? (col.options ?? []) : []
  return (
    <Pop anchor={anchor} cls="ef-menu ef-fpanel" onClose={onClose}>
      <div className="ef-fp">
        <div className="ef-fp-cols">
          <div className="ef-lbl">열</div>
          {cols.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`ef-mi${c.id === cur ? ' open' : ''}${table.getColumn(c.id)?.getIsFiltered() ? ' hasval' : ''}`}
              onClick={() => setCur(c.id)}
            >
              <span>{c.title}</span>
              {table.getColumn(c.id)?.getIsFiltered() && <i className="ef-mi-ck">●</i>}
            </button>
          ))}
        </div>
        <div className="ef-fp-body">
          {col && tc ? (
            <>
              <div className="ef-lbl">{col.title}</div>
              <FilterBody key={col.id} column={tc} col={col} options={opts} />
              {tc.getIsFiltered() && (
                <button type="button" className="ef-mi del" onClick={() => tc.setFilterValue(undefined)}>
                  <i className="ef-mi-ic">✕</i>
                  <span>이 열 필터 해제</span>
                </button>
              )}
            </>
          ) : null}
          {on.length > 0 && (
            <button type="button" className="ef-btn gh ef-full ef-danger" onClick={onClear}>
              모든 필터 지우기({on.length})
            </button>
          )}
        </div>
      </div>
    </Pop>
  )
}

/** 툴바 정렬 — 위가 1순위. 머리글 메뉴의 정렬은 한 열만 걸고, 여기서는 여러 열을 건다 */
function SortPanel({
  anchor,
  cols,
  st,
  setSt,
  onClose,
}: {
  anchor: HTMLElement
  cols: EfColumn[]
  st: EfViewState
  setSt: (p: Partial<EfViewState>) => void
  onClose: () => void
}) {
  const list = st.sorting.filter((s) => cols.some((c) => c.id === s.id))
  const set = (next: typeof list) => setSt({ sorting: next })
  return (
    <Pop anchor={anchor} cls="ef-menu ef-spanel" onClose={onClose}>
      <div className="ef-lbl">정렬 (위가 1순위)</div>
      {list.length ? (
        list.map((s, i) => (
          <div key={i} className="ef-sortrow">
            <span className="ef-sort-n">{i + 1}</span>
            <select
              value={s.id}
              aria-label={`${i + 1}순위 열`}
              onChange={(e) => set(list.map((x, k) => (k === i ? { ...x, id: e.target.value } : x)))}
            >
              {cols.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <button type="button" className="ef-btn gh" onClick={() => set(list.map((x, k) => (k === i ? { ...x, desc: !x.desc } : x)))}>
              {s.desc ? '↓ 내림' : '↑ 오름'}
            </button>
            <button type="button" className="ef-x" title="빼기" onClick={() => set(list.filter((_, k) => k !== i))}>
              ✕
            </button>
          </div>
        ))
      ) : (
        <div className="ef-empty-s">정렬이 없습니다</div>
      )}
      <button
        type="button"
        className="ef-btn gh ef-full"
        onClick={() => {
          const c = cols.find((x) => !list.some((s) => s.id === x.id))
          if (c) set([...list, { id: c.id, desc: false }])
        }}
      >
        ＋ 정렬 추가
      </button>
      {list.length > 0 && (
        <button type="button" className="ef-btn gh ef-full ef-danger" onClick={() => set([])}>
          정렬 지우기
        </button>
      )}
    </Pop>
  )
}

/** 열 설정 — 이름·유형·옵션(쉼표)을 한 화면에서. 바꾸면 바로 저장 */
function ColMgr({ d, touch, toast, onClose }: { d: EfDoc; touch: () => void; toast: (m: string) => void; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="ef-ov" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ef-modal" role="dialog" aria-label="열 설정">
        <div className="ef-modal-hd">
          <b>열 설정</b>
          <small>모든 연도 공통 · 바꾸면 바로 저장</small>
          <button type="button" className="ef-x" aria-label="닫기" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="ef-modal-body">
          <div className="ef-cmrow ef-cmhead">
            <span>이름</span>
            <span>유형</span>
            <span>옵션(쉼표 구분)</span>
            <span />
          </div>
          {d.columns.map((c, i) => (
            <div key={c.id} className="ef-cmrow">
              <input
                defaultValue={c.title}
                aria-label="열 이름"
                onBlur={(e) => {
                  const v = e.target.value.trim()
                  if (v && v !== c.title) {
                    c.title = v
                    touch()
                  }
                }}
              />
              <select
                value={c.type}
                aria-label="유형"
                onChange={(e) => {
                  c.type = e.target.value as EfType
                  if (c.type !== 'number') c.autoSum = false
                  touch()
                }}
              >
                {TYPES.map((t) => (
                  <option key={t.t} value={t.t}>
                    {t.ic} {t.n}
                  </option>
                ))}
              </select>
              <input
                key={c.type + (c.options ?? []).join('|')}
                defaultValue={(c.options ?? []).join(', ')}
                disabled={!hasOptions(c.type)}
                placeholder={hasOptions(c.type) ? '옵션(쉼표)' : '옵션 없음'}
                aria-label="옵션"
                onBlur={(e) => {
                  const next = e.target.value.split(',').map((x) => x.trim()).filter(Boolean)
                  if (next.join('|') !== (c.options ?? []).join('|')) {
                    c.options = [...new Set(next)]
                    touch()
                  }
                }}
              />
              <button
                type="button"
                className="ef-x"
                title="열 삭제"
                onClick={() => {
                  if (d.columns.length <= 1) return toast('마지막 열은 삭제할 수 없습니다')
                  if (!window.confirm(`「${c.title}」 열을 삭제할까요?`)) return
                  d.columns.splice(i, 1)
                  touch()
                }}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className="ef-btn gh"
            onClick={() => {
              d.columns.push({ id: newId(), title: '새 속성', type: 'text' })
              touch()
            }}
          >
            ＋ 열 추가
          </button>
        </div>
        <div className="ef-modal-ft">
          <button type="button" className="ef-btn" onClick={onClose}>
            완료
          </button>
        </div>
      </div>
    </div>
  )
}
