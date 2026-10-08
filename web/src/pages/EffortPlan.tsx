import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { apiFetch } from '@/api/client'
import { prefGet, prefSet } from '@/lib/prefs'
import { IconPanel } from '@/components/icons'
import Resizer, { useResizableWidth } from '@/components/Resizer'
import { EfGrid, leafRows, optionsOf, useEfTable, type EfCtx } from '@/components/effort/EffortTable'
import { Pop } from '@/components/effort/EffortMenus'
import { TI } from '@/components/effort/icons'
import EffortTree from '@/components/effort/EffortTree'
import { EfImport } from '@/components/effort/EffortImport'
import { EfTimeline, tlByOf, tlCols, tlLabelOf, tlModeOf, tlModes } from '@/components/effort/EffortTimeline'
import { EfNotionChart } from '@/components/effort/EffortChart'
import { EfBoard, boardColOf, boardCols } from '@/components/effort/EffortViews'
import {
  natural,
  TYPES,
  condMatch,
  condNeedsValue,
  condOps,
  normOp,
  defaultGroup,
  downloadCsv,
  ensureViews,
  applyNav,
  navOf,
  type EfNav,
  hasOptions,
  isNumCol,
  newId,
  normalize,
  tableOf,
  viewState,
  type EfColumn,
  type EfRow,
  type EfCond,
  type EfDoc,
  type EfNode,
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
 * 보드·차트·타임라인 보기는 components/effort 의 EffortViews · EffortTimeline 에 있다.
 */

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

/**
 * 다른 화면이 이 몸통(제목·보기 탭·도구 줄·표·차트)을 빌려 쓸 때 — Jira Issue(지시: Effort 양식을 Jira 에).
 * 행·열은 못 바꾸고(lock), 연도·가져오기·열 설정이 없다. 제목·오른쪽 단추·더 넣을 도구는 빌려 쓰는 쪽이 준다
 */
export interface EfHost {
  /** 제목 자리 — 접기 단추 오른쪽 */
  title: ReactNode
  /** 제목 줄 오른쪽(Sync 등) */
  headRight?: ReactNode
  /** 표 도구 줄 CSV 왼쪽에 더 넣을 것(지라 칸 더하기 등) */
  toolRight?: ReactNode
  /** 보기 추가에서 고를 수 있는 종류 */
  viewTypes: string[]
  csvName: string
  onOpen?: (r: EfRow) => void
  onPut?: (r: EfRow, c: EfColumn, v: unknown, prev?: unknown) => void
  onCheck?: (rs: EfRow[]) => void
  onDelete?: (rs: EfRow[]) => void
  pageSize?: number
  /** 칸을 직접 그린다 — undefined 를 돌려주면 표가 그린다 */
  renderCell?: (r: EfRow, c: EfColumn) => ReactNode | undefined
  /** 선택 줄 단추(복제·일괄 편집·엑셀·삭제) — 누르면 onBulk(열쇠, 고른 행) */
  bulk?: Array<{ k: string; label: string; danger?: boolean }>
  onBulk?: (k: string, rs: EfRow[]) => void
  /** 「+ 새로 만들기」 를 바깥(작성 창)이 받는다 */
  onNew?: () => void
  /** 보이는 행(검색·필터 뒤, 차례대로)이 바뀌었다 */
  onShown?: (rs: EfRow[]) => void
  /** 제목 줄·카드 테두리 없이 — 빌려 쓰는 화면이 제 머리줄을 가졌다(REQ-Coverage) */
  bare?: boolean
  /**
   * 보기 탭이 서버 공용 정책을 따른다(REQ-Coverage, 승인된 정책) — 만들면 나만 보기(●),
   * 「모두에게 보이기」 는 관리자만, 지우기는 만든 사람 또는 관리자, 「기본」 탭(fixed)은 못 지우고 이름도 그대로.
   * 탭 줄은 한 줄 — 넘치면 「⋯ 더보기」. 실제 저장·상한은 바깥(서버)이 한다
   */
  viewPolicy?: { me: string; isAdmin: boolean }
  /** 내보내기를 바깥이 한다 — 도구 줄 단추가 「CSV」 대신 「엑셀」 이 되고, 보이는 행·보이는 열 차례 그대로 넘긴다 */
  onExport?: (rows: EfRow[], cols: EfColumn[]) => void
}
/** 한 줄에 세우는 보기 탭 수(정책) — 넘치면 「⋯ 더보기」 */
const TABS_ON_ROW = 8
/** 이 PC 의 보던 자리(항해 상태 — 계정 동기화 목록 SYNC 에 넣지 않는다) */
const NAV_KEY = 'utop.ef.nav'

export default function EffortPlan() {
  const docRef = useRef<EfDoc | null>(null)
  const [ver, setVer] = useState(0)
  const [err, setErr] = useState('')
  const [save, setSave] = useState<SaveState>('idle')
  const [msg, setMsg] = useState('')
  const timer = useRef<number | undefined>(undefined)
  const toastT = useRef<number | undefined>(undefined)
  /** 목록(트리) 판 — 끌어 맞춘 폭 · 접어 둠(지시: 노션처럼 닫기). 계정을 따라간다 */
  const [sideW, setSideW] = useResizableWidth('utop.ef.sideW', 190, 150, 520)
  const [sideHide, setSideHide] = useState(() => prefGet('utop.ef.sideHide') === '1')
  const toggleSide = useCallback(() => {
    setSideHide((h) => {
      prefSet('utop.ef.sideHide', h ? '0' : '1')
      return !h
    })
  }, [])
  const layoutRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let off = false
    apiFetch('/api/resource/manpower')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status + ' ' + r.statusText))))
      .then((raw) => {
        if (off) return
        const d = normalize(raw)
        ensureViews(d)
        // 이 PC 에서 마지막으로 보던 표·보기·연도로(옮기기는 서버에 저장하지 않는다)
        try {
          applyNav(d, JSON.parse(prefGet(NAV_KEY) || 'null') as EfNav | null)
        } catch {
          /* 깨진 값이면 서버 문서 그대로 */
        }
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
  /**
   * 다시 그리기만 — 저장하지 않는다(지적: 표·차트·보드 보기, 표·연도를 옮겨 다닐 때마다 저장했다).
   * 지금 보고 있는 보기·표·연도는 문서에 적어 두므로, 다음에 무언가를 고쳐 저장할 때 함께 간다
   */
  const redraw = useCallback(() => setVer((v) => v + 1), [])
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

  // 보던 자리를 그릴 때마다 적어 둔다 — 보기 탭·표·연도를 옮겨도(저장 없이 다시 그리기만) 새로고침 뒤 그 자리로
  useEffect(() => {
    if (docRef.current) prefSet(NAV_KEY, JSON.stringify(navOf(docRef.current)))
  }, [ver])

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
    // 바깥 흰 판 없이 카드 두 장(목록 · 본문) — REQ-Coverage 2열과 같은 꼴(지시)
    <section className="ef">
      <div className="ef-layout" ref={layoutRef}>
        {!sideHide && (
          <>
            <EffortTree root={d} touch={touch} redraw={redraw} toast={toast} width={sideW} />
            <Resizer
              label="목록 폭 조절"
              onResize={setSideW}
              getOrigin={() => layoutRef.current?.querySelector('.ef-side')?.getBoundingClientRect().left ?? 0}
            />
          </>
        )}
        {/* 표를 바꾸면 표 쪽 상태(펼침·선택·너비)는 새로 — key 로 다시 만든다 */}
        <EffortBody
          key={cur}
          d={tableOf(d, cur)}
          name={d.efTree!.nodes.find((n) => n.id === cur)?.name ?? ''}
          path={folderPath(d.efTree!.nodes, cur)}
          ver={ver}
          touch={touch}
          redraw={redraw}
          toast={toast}
          save={save}
          retry={() => void flush()}
          sideHide={sideHide}
          onToggleSide={toggleSide}
        />
      </div>
      {msg && <div className="ef-toast">{msg}</div>}
    </section>
  )
}

/** 고른 표 하나 — 제목(표 이름 · 연도 ▾) · 보기 탭 · 도구 줄 · 표 */
/** 표가 든 폴더 이름들 — 맨 위 폴더부터(빵부스러기) */
function folderPath(nodes: EfNode[], id: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  let p = nodes.find((n) => n.id === id)?.parent ?? null
  while (p && !seen.has(p)) {
    seen.add(p)
    const n = nodes.find((x) => x.id === p)
    if (!n) break
    out.unshift(n.name)
    p = n.parent
  }
  return out
}

export function EffortBody({
  d,
  name,
  path,
  ver,
  touch,
  redraw,
  toast,
  save,
  retry,
  sideHide,
  onToggleSide,
  host,
}: {
  d: EfDoc
  name: string
  path: string[]
  ver: number
  touch: () => void
  /** 다시 그리기만(저장 안 함) — 보기·연도 옮기기 */
  redraw: () => void
  toast: (m: string) => void
  save: SaveState
  retry: () => void
  /** 목록 판이 접혀 있나 · 접고 펴기(제목 옆 단추) */
  sideHide: boolean
  onToggleSide: () => void
  /** 빌려 쓰는 화면(Jira Issue) — 없으면 Effort Plan */
  host?: EfHost
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
  const ctx: EfCtx = {
    doc: d,
    rows,
    cols,
    st,
    setSt,
    touch,
    toast,
    ver,
    ...(host ? { lock: true, onOpen: host.onOpen, onPut: host.onPut, onCheck: host.onCheck, onDelete: host.onDelete, pageSize: host.pageSize, renderCell: host.renderCell, bulk: host.bulk, onBulk: host.onBulk, onNew: host.onNew, onShown: host.onShown } : {}),
  }
  const api = useEfTable(ctx)
  const { table } = api

  const [pop, setPop] = useState<{ kind: string; anchor: HTMLElement; id?: string } | null>(null)
  const [colMgr, setColMgr] = useState(false)
  const [imp, setImp] = useState(false)
  /** 차트 설정 패널 — 처음 만든 차트 보기는 열어 둔다(무엇을 그릴지 고르게) */
  const [ncPanel, setNcPanel] = useState(() => view.type === 'chart' && !view.nchart)
  const open = (kind: string, id?: string) => (e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault()
    const a = e.currentTarget
    setPop((p) => (p && p.kind === kind && p.anchor === a ? null : { kind, anchor: a, id }))
  }
  const close = () => setPop(null)

  const setYear = (y: string) => {
    d.curPage = y
    redraw() // 옮기기만 — 저장하지 않는다(새 연도 만들기·이름 바꾸기 쪽은 따로 저장한다)
  }
  const addYear = (y: string) => {
    if (!/^\d{4}$/.test(y)) return toast('연도는 숫자 4자리입니다')
    if (d.pages[y]) {
      setYear(y)
      return
    }
    d.pages[y] = { rows: [] }
    d.years = [...(d.years ?? []), y].sort().reverse()
    d.curPage = y
    touch() // 새 연도는 저장한다(옮기기만 하는 setYear 와 다르다)
    toast(y + '년 추가됨')
  }
  const clearYear = (y: string) => {
    const n = d.pages[y]?.rows.length ?? 0
    if (!n) return toast('이미 비어 있습니다')
    if (!window.confirm(`${y}년의 ${n}행을 모두 지울까요?\n(서버가 저장 전 상태를 백업해 둡니다)`)) return
    d.pages[y]!.rows.splice(0)
    touch()
  }
  /** 연도 이름 바꾸기 — 그 연도 표를 새 연도로 옮긴다(행·내용 그대로). 숫자 4자리 · 없는 연도만(예전 화면도 4자리만 연도로 읽는다) */
  const renameYear = (from: string, to: string) => {
    to = to.trim()
    if (!to || to === from) return
    if (!/^\d{4}$/.test(to)) return toast('연도는 숫자 4자리입니다')
    if (d.pages[to]) return toast(`${to}년은 이미 있습니다`)
    d.pages[to] = d.pages[from]!
    delete d.pages[from]
    d.years = (d.years ?? []).map((x) => (x === from ? to : x)).sort().reverse()
    if (d.curPage === from) d.curPage = to
    touch()
    toast(`${from}년 → ${to}년으로 바꿨습니다`)
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

  /** 보기 추가 — 고른 종류의 이름으로, 같은 이름이 있으면 번호를 붙인다(표 2, 보드 2 …) */
  const addView = (type: string) => {
    const base = viewName(type)
    let nm = base
    for (let k = 2; views.some((x) => x.name === nm); k++) nm = `${base} ${k}`
    const v: EfView = { id: newId(), name: nm, type }
    if (host?.viewPolicy) Object.assign(v, { owner: host.viewPolicy.me, shared: false }) // 만들면 나만 보기(정책)
    views.push(v)
    d.curBetaView = v.id
    if (type === 'chart') setNcPanel(true) // 새 차트 — 무엇을 그릴지 고르게 설정 패널을 연다(노션처럼)
    touch()
  }

  // 툴바 필터 수 = 조건식 줄 수(예전 _rscFilters) — 머리글 필터는 머리글에 ▼ 로 보인다
  const fCount = (st.conds ?? []).filter((f) => cols.some((c) => c.id === f.col)).length
  // 차트에 쓸 행 — 조건식 필터를 건 뒤(표와 같은 condMatch)
  const chartRows = useMemo(() => {
    const conds = (st.conds ?? []).filter((f) => cols.some((c) => c.id === f.col))
    if (!conds.length) return rows
    const byId = new Map(cols.map((c) => [c.id, c]))
    return rows.filter((r) => conds.every((f) => condMatch(r, f, byId.get(f.col))))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, st.conds, ver])
  const sCount = st.sorting.filter((s) => cols.some((c) => c.id === s.id)).length
  const gId = table.getState().grouping[0]
  const gName = cols.find((c) => c.id === gId)?.title ?? ''
  const isTable = (view.type || 'table') === 'table'
  /* 정책 표 — 탭 줄은 한 줄(TABS_ON_ROW 개). 고른 탭이 뒤에 있으면 앞줄 끝에 끌어 세운다 */
  const tabsOnRow = (() => {
    const head = views.slice(0, TABS_ON_ROW)
    return head.includes(view) ? head : [...head.slice(0, TABS_ON_ROW - 1), view]
  })()
  const tabsRest = views.filter((v) => !tabsOnRow.includes(v))
  const hidCols = cols.filter((c) => (st.hidden ?? []).includes(c.id))
  // 숨긴 그룹 — 지금 묶은 열에서 숨긴 값들(묶음을 바꾸면 그 열 것만)
  const hidGroups = gId ? (st.hiddenGroups?.[gId] ?? []) : []
  /** 숨긴 그룹 값들을 통째로 바꾼다(그룹 창의 눈 · 모두 숨기기/보이기) */
  const setHidGroups = (vals: string[]) => {
    const m = { ...(st.hiddenGroups ?? {}) }
    if (vals.length) m[gId!] = vals
    else delete m[gId!]
    setSt({ hiddenGroups: m })
  }
  // 그룹 창에 늘어놓을 그룹들 — 이 연도 모든 행의 묶은 열 값(빈값 포함)과 행 수, 이름 순(빈값은 끝)
  const groupList = (() => {
    if (!gId) return [] as Array<[string, number]>
    const m = new Map<string, number>()
    rows.forEach((r) => {
      const v = r[gId] == null ? '' : String(r[gId])
      m.set(v, (m.get(v) ?? 0) + 1)
    })
    return [...m].sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : natural(a[0], b[0])))
  })()

  return (
    <>
        <div className={`ef-main${host?.bare ? ' bare' : ''}`}>
          {!host?.bare && (
          <div className="ef-head">
            {/* 목록 접기·펴기 — REQ-Coverage 접기 단추와 같은 모양·같은 아이콘(지시) */}
            <button
              type="button"
              className="ef-sidebtn"
              aria-label={sideHide ? '목록 펴기' : '목록 접기'}
              title={sideHide ? '목록 펴기' : '목록 접기'}
              onClick={onToggleSide}
            >
              <IconPanel open={sideHide} />
            </button>
            {host ? (
              <>
                {host.title}
                <span className="ef-sp" />
                {host.headRight}
              </>
            ) : (
            <>
            <b>Effort Plan</b>
            <span className="ef-head-sep">·</span>
            {/* 빵부스러기를 제목에 그대로(지시) — 「Effort Plan · 폴더 › 표 2026년」 */}
            {path.map((f, i) => (
              <span key={i} className="ef-head-path">
                {f}
                <span className="ef-head-psep">›</span>
              </span>
            ))}
            <span className="ef-head-name" title={[...path, name].join(' › ')}>{name}</span>
            <button type="button" className="ef-yrbtn" title="연도 바꾸기·추가·삭제" onClick={open('yearmenu')}>
              {year}년
              <TI n="chevron-down" />
            </button>
            <span className={`ef-save ${save}`} onClick={save === 'error' ? retry : undefined}>
              {save === 'saving' || save === 'dirty' ? '저장 중…' : save === 'saved' ? '저장됨' : save === 'error' ? '저장 실패 — 눌러서 다시' : ''}
            </span>
            </>
            )}
          </div>
          )}

          <div className="ef-toolbar">
            <div className="ef-tabs">
              {(host?.viewPolicy ? tabsOnRow : views).map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className={`ef-tab${v.id === view.id ? ' on' : ''}`}
                  title="우클릭: 이름 바꾸기·복사·삭제"
                  onClick={() => {
                    if (d.curBetaView === v.id) return
                    d.curBetaView = v.id
                    redraw() // 옮기기만 — 저장하지 않는다
                  }}
                  onContextMenu={open('view', v.id)}
                >
                  <span className="ef-tab-ic">{viewIcon(v.type)}</span>
                  {v.name}
                  {/* 나만 보는 탭 — 정책 표(서버 보기)에서만 */}
                  {!!host?.viewPolicy && !v.fixed && !v.shared && (
                    <i className="ef-tab-priv" title={`나만 봅니다 · 만든이 ${String(v.owner ?? '')}`}>●</i>
                  )}
                </button>
              ))}
              {!!host?.viewPolicy && tabsRest.length > 0 && (
                <button type="button" className="ef-tab ef-tab-more" title="더 있는 보기" onClick={open('moreviews')}>
                  ⋯ 더보기 {tabsRest.length}
                </button>
              )}
              <button type="button" className="ef-tab ef-tab-add" title="보기 추가 — 표·보드·차트·타임라인" onClick={open('addview')}>
                <TI n="plus" />
              </button>
            </div>
            <span className="ef-sp" />
            {isTable ? (
              <>
                <input
                  className="ef-search"
                  placeholder="🔍 검색"
                  aria-label="검색"
                  value={st.q}
                  onChange={(e) => setSt({ q: e.target.value })}
                />
                <button type="button" className={`ef-btn gh${fCount ? ' on' : ''}`} onClick={open('filter')}>
                  <TI n="filter" /> 필터{fCount ? ' ' + fCount : ''}
                </button>
                <button type="button" className={`ef-btn gh${sCount ? ' on' : ''}`} onClick={open('sort')}>
                  <TI n="arrows-sort" /> 정렬{sCount ? ' ' + sCount : ''}
                </button>
                <button type="button" className={`ef-btn gh${gId ? ' on' : ''}`} onClick={open('group')}>
                  <TI n="layout-rows" /> 그룹{gName ? ': ' + gName : ''}
                  {hidGroups.length > 0 && <em className="ef-btn-sub"> · 숨김 {hidGroups.length}</em>}
                </button>
                {/* 숨긴 열 — 있을 때만, 눌러서 다시 보이기 */}
                {hidCols.length > 0 && (
                  <button type="button" className={`ef-btn gh on${pop?.kind === 'hidden' ? ' open' : ''}`} onClick={open('hidden')}>
                    <TI n="eye-off" /> 숨긴 열 {hidCols.length}
                  </button>
                )}
                <span className="ef-tbsep" />
                {!host && (
                  <>
                    <button type="button" className="ef-btn gh" onClick={() => setColMgr(true)}>
                      <TI n="columns" /> 열 설정
                    </button>
                    {/* 가져오기는 CSV 바로 왼쪽(지시) — 짝으로 붙여 둔다 */}
                    <button type="button" className="ef-btn gh" title="엑셀(.xlsx)·CSV·붙여넣기 — 열을 맞춰 들인다" onClick={() => setImp(true)}>
                      <TI n="upload" /> 가져오기
                    </button>
                  </>
                )}
                {host?.toolRight}
                <button
                  type="button"
                  className="ef-btn"
                  onClick={() => {
                    const out = leafRows(table)
                    const vc = table.getVisibleLeafColumns().map((c) => (c.columnDef.meta as { col: EfColumn }).col)
                    if (host?.onExport) return host.onExport(out, vc) // 바깥(엑셀) — REQ-Coverage
                    downloadCsv(host ? host.csvName : `EffortPlan_${name || '표'}_${year}.csv`, vc, out)
                    toast('CSV 내려받음 — ' + out.length + '행')
                  }}
                >
                  <TI n="download" /> {host?.onExport ? '엑셀' : 'CSV'}
                </button>
              </>
            ) : view.type === 'board' ? (
              <>
                {/* 예전 보드 툴바 — 기준 열 고르기 · 안내 · 항목 추가 */}
                <select
                  className="ef-fsel ef-tbsel"
                  aria-label="보드 기준 열"
                  value={boardColOf(view, cols)?.id ?? ''}
                  onChange={(e) => {
                    view.boardBy = e.target.value
                    touch()
                  }}
                >
                  {boardCols(cols).map((c) => (
                    <option key={c.id} value={c.id}>
                      기준: {c.title}
                    </option>
                  ))}
                </select>
                <span className="ef-tbhint">카드 끌기 → 칸·순서 바꾸기</span>
                <span className="ef-sp" />
                <button
                  type="button"
                  className="ef-btn"
                  onClick={() => {
                    rows.push({})
                    touch()
                  }}
                >
                  <TI n="plus" /> 항목
                </button>
              </>
            ) : view.type === 'chart' ? (
              <>
                {/* 노션식 차트(지시) — 설정은 차트 오른쪽 패널, 도구 줄엔 설정 열기·필터 */}
                <button type="button" className={`ef-btn gh${ncPanel ? ' on' : ''}`} onClick={() => setNcPanel(!ncPanel)}>
                  <TI n="chart-bar" /> 차트 설정
                </button>
                {/* 차트도 표와 같은 조건식 필터 — 걸린 조건에 맞는 행만으로 그린다(차트 탭마다 따로) */}
                <button type="button" className={`ef-btn gh${fCount ? ' on' : ''}`} onClick={open('filter')}>
                  <TI n="filter" /> 필터{fCount ? ' ' + fCount : ''}
                </button>
              </>
            ) : view.type === 'gantt' ? (
              <>
                {/* 타임라인 — 묶기 열(한 줄에 하나) · 막대 이름 열 · 필터(차트처럼 탭마다) */}
                {tlModes(cols).length > 1 && (
                  <select
                    className="ef-fsel ef-tbsel"
                    aria-label="타임라인 기준"
                    value={tlModeOf(view, cols)}
                    onChange={(e) => {
                      view.tlMode = e.target.value
                      touch()
                    }}
                  >
                    <option value="month">기준: 월 열(공수)</option>
                    <option value="date">기준: 기간·날짜 열</option>
                  </select>
                )}
                <select
                  className="ef-fsel ef-tbsel"
                  aria-label="타임라인 묶기 열"
                  value={tlByOf(view, cols)?.id ?? ''}
                  onChange={(e) => {
                    view.tlBy = e.target.value
                    touch()
                  }}
                >
                  {tlCols(cols).map((c) => (
                    <option key={c.id} value={c.id}>
                      묶기: {c.title}
                    </option>
                  ))}
                </select>
                <select
                  className="ef-fsel ef-tbsel"
                  aria-label="타임라인 막대 이름 열"
                  value={tlLabelOf(view, cols)?.id ?? ''}
                  onChange={(e) => {
                    view.tlLabel = e.target.value
                    touch()
                  }}
                >
                  {tlCols(cols).map((c) => (
                    <option key={c.id} value={c.id}>
                      막대 이름: {c.title}
                    </option>
                  ))}
                </select>
                <button type="button" className={`ef-btn gh${fCount ? ' on' : ''}`} onClick={open('filter')}>
                  <TI n="filter" /> 필터{fCount ? ' ' + fCount : ''}
                </button>
              </>
            ) : null}
          </div>

          <div className="ef-wrap">
            {!cols.length ? (
              <div className="ef-empty">열이 없습니다 — [열 설정]에서 추가하세요</div>
            ) : isTable ? (
              <EfGrid ctx={ctx} api={api} />
            ) : view.type === 'board' ? (
              <EfBoard d={d} rows={rows} view={view} touch={touch} toast={toast} />
            ) : view.type === 'chart' ? (
              <EfNotionChart cols={cols} rows={chartRows} view={view} ver={ver} panel={ncPanel} setPanel={setNcPanel} touch={touch} />
            ) : view.type === 'gantt' ? (
              <EfTimeline cols={cols} rows={chartRows} view={view} year={year} touch={touch} />
            ) : (
              <div className="ef-empty">「{view.name}」은 알 수 없는 보기({viewName(view.type)})입니다</div>
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
                  <i className="ef-mi-ic"><TI n="calendar" /></i>
                  <span>{y}년</span>
                  <em className="ef-mi-n">{d.pages[y]?.rows.length ?? 0}</em>
                </button>
                <button type="button" className="ef-yrmore" title="이름 변경·비우기·삭제" onClick={() => setPop({ kind: 'year', anchor: pop.anchor, id: y })}>
                  ⋯
                </button>
              </div>
            ))}
          </div>
          <div className="ef-sep" />
          <button type="button" className="ef-mi" onClick={() => setPop({ kind: 'addyear', anchor: pop.anchor })}>
            <i className="ef-mi-ic"><TI n="plus" /></i>
            <span>연도 추가</span>
          </button>
        </Pop>
      )}
      {pop?.kind === 'year' && pop.id && (
        <YearMenu
          anchor={pop.anchor}
          year={pop.id}
          onRename={(to) => renameYear(pop.id!, to)}
          onClear={() => { const y = pop.id!; close(); clearYear(y) }}
          onDelete={() => { const y = pop.id!; close(); delYear(y) }}
          onClose={close}
        />
      )}
      {pop?.kind === 'view' && pop.id && (
        <ViewMenu
          anchor={pop.anchor}
          view={views.find((v) => v.id === pop.id)!}
          canDelete={(() => {
            const v = views.find((x) => x.id === pop.id)!
            const pol = host?.viewPolicy
            // 정책 표 — 기본 탭은 못 지우고, 그 밖은 만든 사람 또는 관리자
            if (pol) return !v.fixed && (v.owner === pol.me || pol.isAdmin)
            return views.length > 1
          })()}
          canRename={!views.find((x) => x.id === pop.id)?.fixed}
          share={(() => {
            const v = views.find((x) => x.id === pop.id)!
            const pol = host?.viewPolicy
            if (!pol || v.fixed) return undefined
            return {
              on: !!v.shared,
              // 공용으로 올리는 것은 관리자만 — 내리는 것은 막지 않는다(예전 보기 줄과 같다)
              can: !!v.shared || pol.isAdmin,
              onToggle: () => {
                v.shared = !v.shared
                close()
                touch()
              },
            }
          })()}
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
            // 정책 표 — 복제본은 내 것, 나만 보기로
            if (host?.viewPolicy) {
              delete nv.fixed
              Object.assign(nv, { owner: host.viewPolicy.me, shared: false })
            }
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
      {pop?.kind === 'hidden' && (
        <Pop anchor={pop.anchor} cls="ef-menu" onClose={close}>
          <div className="ef-lbl">숨긴 열 — 눌러서 다시 보이기</div>
          <div className="ef-mlist">
            {hidCols.map((c) => (
              <button
                key={c.id}
                type="button"
                className="ef-mi"
                onClick={() => {
                  const left = (st.hidden ?? []).filter((x) => x !== c.id)
                  setSt({ hidden: left })
                  if (!left.length) close()
                }}
              >
                <i className="ef-mi-ic"><TI n="eye" /></i>
                <span>{c.title}</span>
              </button>
            ))}
          </div>
          <div className="ef-sep" />
          <button type="button" className="ef-mi" onClick={() => { close(); setSt({ hidden: [] }) }}>
            <i className="ef-mi-ic"><TI n="eye" /></i>
            <span>모두 보이기</span>
          </button>
        </Pop>
      )}
      {pop?.kind === 'filter' && <CondPanel anchor={pop.anchor} cols={cols} rows={rows} st={st} setSt={setSt} onClose={close} />}
      {pop?.kind === 'sort' && <SortPanel anchor={pop.anchor} cols={cols} st={st} setSt={setSt} onClose={close} />}
      {pop?.kind === 'moreviews' && (
        <Pop anchor={pop.anchor} cls="ef-menu" onClose={close}>
          <div className="ef-lbl">더 있는 보기</div>
          <div className="ef-mlist">
            {tabsRest.map((v) => (
              <button
                key={v.id}
                type="button"
                className="ef-mi"
                onClick={() => {
                  close()
                  d.curBetaView = v.id
                  redraw()
                }}
              >
                <i className="ef-mi-ic">{viewIcon(v.type)}</i>
                <span>{v.name}</span>
                {!v.shared && <em className="ef-mi-sub">나만</em>}
              </button>
            ))}
          </div>
        </Pop>
      )}
      {pop?.kind === 'addview' && (
        <Pop anchor={pop.anchor} cls="ef-menu ef-addview" onClose={close}>
          <div className="ef-lbl">보기 추가</div>
          <div className="ef-mlist">
            {Object.entries(VIEW_TYPES)
              .filter(([t]) => !host || host.viewTypes.includes(t))
              .map(([t, [ic, nm]]) => (
              <button
                key={t}
                type="button"
                className="ef-mi ef-av"
                onClick={() => {
                  close()
                  addView(t)
                }}
              >
                <i className="ef-mi-ic ef-av-ic">{ic}</i>
                <span>{nm}</span>
              </button>
            ))}
          </div>
        </Pop>
      )}
      {pop?.kind === 'group' && (
        <Pop anchor={pop.anchor} cls="ef-menu ef-gpanel" onClose={close}>
          <div className="ef-lbl">그룹 기준</div>
          <div className="ef-mlist">
            <button type="button" className={`ef-mi${!gId ? ' on' : ''}`} onClick={() => { close(); setSt({ group: '' }) }}>
              <i className="ef-mi-ic"><TI n="layout-list" /></i>
              <span>그룹 없음</span>
              {!gId && <i className="ef-mi-ck"><TI n="check" /></i>}
            </button>
            {cols
              .filter((c) => !isNumCol(c))
              .map((c) => (
                <button key={c.id} type="button" className={`ef-mi${gId === c.id ? ' on' : ''}`} onClick={() => { close(); setSt({ group: c.id }) }}>
                  <i className="ef-mi-ic"><TI n="layout-rows" /></i>
                  <span>{c.title}</span>
                  {d.efTree && c.id === defaultGroup(cols) && <em className="ef-mi-n">기본</em>}
                  {gId === c.id && <i className="ef-mi-ck"><TI n="check" /></i>}
                </button>
              ))}
          </div>
          {/* 그룹 — 눈을 눌러 숨기기/보이기(노션 보기 설정 › 그룹). 창은 열어 둔 채 */}
          {gId && groupList.length > 0 && (
            <>
              <div className="ef-sep" />
              <div className="ef-lbl ef-glbl">
                <span>그룹 ({gName})</span>
                <button type="button" className="ef-glink" onClick={() => setHidGroups(hidGroups.length ? [] : groupList.map(([v]) => v))}>
                  {hidGroups.length ? '모두 보이기' : '모두 숨기기'}
                </button>
              </div>
              <div className="ef-mlist">
                {groupList.map(([v, n]) => {
                  const off = hidGroups.includes(v)
                  return (
                    <button
                      key={v}
                      type="button"
                      className={`ef-mi ef-gvis${off ? ' off' : ''}`}
                      title={off ? '눌러서 다시 보이기' : '눌러서 숨기기'}
                      onClick={() => setHidGroups(off ? hidGroups.filter((x) => x !== v) : [...hidGroups, v])}
                    >
                      <span>{v || '(빈값)'}</span>
                      <em className="ef-mi-n">{n}</em>
                      <i className="ef-mi-ic"><TI n={off ? 'eye-off' : 'eye'} /></i>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </Pop>
      )}
      {imp && (
        <EfImport
          cols={cols}
          rows={rows}
          year={year}
          onDone={(m) => {
            touch()
            toast(m)
          }}
          onClose={() => setImp(false)}
        />
      )}
      {colMgr && <ColMgr d={d} touch={touch} toast={toast} onClose={() => setColMgr(false)} />}
    </>
  )
}

/** 보기 종류 — 탭·보기 추가 메뉴의 그림 글자는 예전(_RSC_VIEWTYPES)과 같게 */
const VIEW_TYPES: Record<string, [string, string]> = {
  table: ['📋', '표'],
  board: ['🗂', '보드'],
  chart: ['📊', '차트'],
  gantt: ['📅', '타임라인'],
}
const viewIcon = (t: string) => VIEW_TYPES[t || 'table']?.[0] ?? '📋'
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

/** 연도 ⋯ 메뉴 — 이름 변경(지시) · 비우기 · 삭제. 이름 변경은 보기 메뉴처럼 그 자리에서 칸이 열린다 */
function YearMenu({
  anchor,
  year,
  onRename,
  onClear,
  onDelete,
  onClose,
}: {
  anchor: HTMLElement
  year: string
  onRename: (to: string) => void
  onClear: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [v, setV] = useState(year)
  const done = () => {
    if (renaming) onRename(v)
    onClose()
  }
  return (
    <Pop anchor={anchor} cls="ef-menu" onClose={done}>
      <div className="ef-lbl">{year}년</div>
      {renaming ? (
        <>
          <input
            className="ef-menu-name"
            autoFocus
            inputMode="numeric"
            value={v}
            aria-label="새 연도"
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setV(e.target.value.replace(/\D/g, '').slice(0, 4))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') done()
              else if (e.key === 'Escape') onClose()
            }}
          />
          <div className="ef-yrhint">숫자 4자리 · Enter 로 바꾸기 (행은 그대로 옮겨 갑니다)</div>
        </>
      ) : (
        <div className="ef-mlist">
          <button type="button" className="ef-mi" onClick={() => setRenaming(true)}>
            <i className="ef-mi-ic"><TI n="pencil" /></i>
            <span>이름 변경</span>
          </button>
          <button type="button" className="ef-mi" onClick={onClear}>
            <i className="ef-mi-ic"><TI n="eraser" /></i>
            <span>이 연도 비우기</span>
          </button>
          <button type="button" className="ef-mi del" onClick={onDelete}>
            <i className="ef-mi-ic"><TI n="trash" /></i>
            <span>연도 삭제</span>
          </button>
        </div>
      )}
    </Pop>
  )
}

function ViewMenu({
  anchor,
  view,
  canDelete,
  canRename = true,
  share,
  onRename,
  onDup,
  onDelete,
  onClose,
}: {
  anchor: HTMLElement
  view: EfView
  canDelete: boolean
  /** 이름 바꾸기 — 기본 탭(fixed)은 못 바꾼다 */
  canRename?: boolean
  /** 정책 표의 「모두에게 보이기 / 나만 보기로 되돌리기」 — can 이 아니면 잠그고 까닭을 붙인다 */
  share?: { on: boolean; can: boolean; onToggle: () => void }
  onRename: (n: string) => void
  onDup: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const [name, setName] = useState(view.name)
  const [renaming, setRenaming] = useState(false)
  const done = () => {
    if (renaming) onRename(name.trim())
    onClose()
  }
  // 예전 보기 메뉴와 같은 세 줄 — 이름 변경 · 보기 복사 · 보기 삭제(보기가 하나면 숨김)
  return (
    <Pop anchor={anchor} cls="ef-menu ef-viewmenu" onClose={done}>
      {renaming ? (
        <input
          className="ef-menu-name"
          autoFocus
          value={name}
          aria-label="보기 이름"
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && done()}
        />
      ) : (
        <div className="ef-mlist">
          {canRename && (
            <button type="button" className="ef-mi" onClick={() => setRenaming(true)}>
              <i className="ef-mi-ic"><TI n="pencil" /></i>
              <span>이름 변경</span>
            </button>
          )}
          <button type="button" className="ef-mi" onClick={onDup}>
            <i className="ef-mi-ic"><TI n="copy" /></i>
            <span>보기 복사</span>
          </button>
          {share && (
            <button
              type="button"
              className={`ef-mi${share.can ? '' : ' off'}`}
              disabled={!share.can}
              title={share.can ? '' : '공용으로 올리는 것은 관리자가 승인합니다'}
              onClick={share.onToggle}
            >
              <i className="ef-mi-ic"><TI n={share.on ? 'eye-off' : 'eye'} /></i>
              <span>{share.on ? '나만 보기로 되돌리기' : '모두에게 보이기'}</span>
              {!share.on && !share.can && <em className="ef-mi-sub">관리자</em>}
            </button>
          )}
          {canDelete && (
            <button type="button" className="ef-mi del" onClick={onDelete}>
              <i className="ef-mi-ic"><TI n="trash" /></i>
              <span>보기 삭제</span>
            </button>
          )}
        </div>
      )}
    </Pop>
  )
}

/** 툴바 필터 — 열 · 조건 · 값 줄을 여러 개, 모두 만족(예전 rscFilterMenu 와 같은 꼴).
 *  머리글 메뉴의 필터(값 고르기·범위)와는 따로 걸린다 — 예전도 둘이 따로였다. */
function CondPanel({
  anchor,
  cols,
  rows,
  st,
  setSt,
  onClose,
}: {
  anchor: HTMLElement
  cols: EfColumn[]
  rows: EfDoc['pages'][string]['rows']
  st: EfViewState
  setSt: (p: Partial<EfViewState>) => void
  onClose: () => void
}) {
  const list = (st.conds ?? []).filter((f) => cols.some((c) => c.id === f.col))
  const set = (next: EfCond[]) => setSt({ conds: next })
  const put = (i: number, p: Partial<EfCond>) =>
    set(
      list.map((f, k) => {
        if (k !== i) return f
        const n = { ...f, ...p }
        // 열을 바꾸면 값만 비운다(예전 _rscFiltSet)
        if (p.col && p.col !== f.col) n.v = ''
        return n
      }),
    )
  return (
    <Pop anchor={anchor} cls="ef-menu ef-cpanel" onClose={onClose}>
      <div className="ef-lbl">필터 (모든 조건 만족)</div>
      {list.length ? (
        list.map((f, i) => {
          const c = cols.find((x) => x.id === f.col)
          return (
            <div key={i} className="ef-fl-row">
              <select className="ef-fsel" value={f.col} aria-label="열" onChange={(e) => put(i, { col: e.target.value })}>
                {cols.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.title}
                  </option>
                ))}
              </select>
              <select className="ef-fsel" value={normOp(f.op)} aria-label="조건" onChange={(e) => put(i, { op: e.target.value })}>
                {condOps(c).map(([k, n]) => (
                  <option key={k} value={k}>
                    {n}
                  </option>
                ))}
              </select>
              {!condNeedsValue(f.op) ? (
                <span className="ef-sp" />
              ) : c && (hasOptions(c.type) || (c.options?.length ?? 0) > 0) ? (
                <select className="ef-fsel" value={f.v} aria-label="값" onChange={(e) => put(i, { v: e.target.value })}>
                  <option value="">(값 선택)</option>
                  {optionsOf(rows, c).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="ef-fsel"
                  value={f.v}
                  inputMode={c && isNumCol(c) ? 'decimal' : undefined}
                  placeholder="값"
                  aria-label="값"
                  onChange={(e) => put(i, { v: e.target.value })}
                />
              )}
              <button type="button" className="ef-x" title="빼기" onClick={() => set(list.filter((_, k) => k !== i))}>
                ✕
              </button>
            </div>
          )
        })
      ) : (
        <div className="ef-empty-s">조건이 없습니다.</div>
      )}
      <button
        type="button"
        className="ef-btn gh ef-full"
        onClick={() => {
          const c = cols[0]
          if (c) set([...list, { col: c.id, op: 'contains', v: '' }])
        }}
      >
        <TI n="plus" /> 조건 추가
      </button>
      {list.length > 0 && (
        <button type="button" className="ef-btn gh ef-full ef-danger" onClick={() => set([])}>
          모든 필터 지우기
        </button>
      )}
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
              <TI n={s.desc ? 'sort-descending' : 'sort-ascending'} /> {s.desc ? '내림' : '오름'}
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
        <TI n="plus" /> 정렬 추가
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
                    {t.e} {t.n}
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
