import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { prefGet, prefSet } from '@/lib/prefs'
import { EffortBody } from '@/pages/EffortPlan'
import { Pill } from '@/components/ntable/NParts'
import { paintOfAny } from '@/components/ntable/palette'
import { multiVals, type NCol, type NOption, type NRow } from '@/components/ntable/types'
import type { ViewBody, ViewDef } from '@/components/ntable/NViews'
import { ensureViews, type EfColumn, type EfDoc, type EfRow, type EfView, type EfViewState } from './model'
import './Effort.css'

/**
 * **NTable 자리에 끼우는 Effort 표**(지시: Effort Plan 표 형태를 REQ-Coverage 에).
 *
 * NTable 과 같은 속성(columns·rows·onCell·onOpen·onPeek·onNew·bulk·renderCell·export…)을 받아
 * Effort 본문(EffortBody)으로 그린다 — 쓰는 화면은 `<NTable/>` 을 이것으로 바꾸기만 한다.
 *
 * - 보기 탭은 **서버(/api/views)에 저장, 정책 그대로**(승인): 만들면 나만 보기, 「모두에게 보이기」 는
 *   관리자만, 지우기는 만든 사람 또는 관리자, 공용 12·개인 20 상한은 서버가 지킨다. 맨 앞 「기본」 탭은
 *   이 계정의 작업대(계정 설정 `${layoutKey}.base`).
 * - 탭 body 는 **예전 표가 읽는 칸(hidden·widths·order·flt)을 그대로 두고** Effort 상태를 efv 에 더한다 —
 *   「예전 표로 보기」 로 돌아가도 그 탭이 그대로 열린다.
 * - 선택지 색·그림은 **설정이 정본**이다 — 칩은 NTable 의 Pill 그대로(같은 색·같은 그림), 표에서 새 값을
 *   만들지 못한다(fixedOptions).
 */
export interface EfNTableProps {
  columns: NCol[]
  rows: NRow[]
  /** 서버 보기 묶음 — 예전 NViews 와 같은 이름(reqtc.tc · reqtc.req) */
  scope: string
  /** 이 표의 계정 설정 앞머리 — 기본 탭 상태(.base) · 보던 탭(.cur) */
  layoutKey: string
  meName: string
  isAdmin: boolean
  idKey: string
  titleKey?: string
  readOnlyKeys?: string[]
  /** 칸 하나 저장 — Promise 가 false 로 끝나면(저장 실패) 표의 값을 되돌린다 */
  onCell: (rowId: string, key: string, value: string) => void | Promise<unknown>
  onOpen?: (rowId: string) => void
  onPeek?: (rowId: string) => void
  onNew?: () => void
  bulk?: Array<{ k: string; label: string; danger?: boolean }>
  onBulk?: (action: string, ids: string[]) => void
  onSelect?: (ids: string[]) => void
  renderCell?: (row: NRow, col: NCol) => ReactNode | undefined
  exportTitle?: string
  exportScope?: string
  exportCell?: (row: Record<string, unknown>, key: string) => string | null | undefined
  /** 열 차례·폭·기본 탭의 숨긴 열이 바뀌었다 — 예전 표의 설정 열쇠(utop.ntb.*)에도 적어 둘이 같게 */
  onLayout?: (p: { order: string[]; widths: Record<string, number>; hidden: string[] }) => void
  /** 도구 줄 오른쪽(엑셀 왼쪽)에 더 넣을 것 — 「예전 표로 보기」 등 */
  toolRight?: ReactNode
  /**
   * 머리 메뉴로 열 정의를 고쳤다 — 예전 표의 onColumns 와 같은 꼴(바뀐 뒤 열 목록 전부).
   * 만든 칸(cf_)은 이름·유형·옵션·삭제, codeKeys 의 칸은 이름·옵션, 나머지는 잠근다. 새 열은 cf_ 열쇠로 선다
   */
  onColumns?: (after: NCol[]) => void
  /** 선택지가 설정 코드에 사는 기본 칸(유형·상태 …) — 이름·옵션만 고친다 */
  codeKeys?: string[]
  /** 행 줄 클래스(Cycles: 돌고 있는 사이클) */
  rowClass?: (row: NRow) => string
  /** ID 앞 그림(Cycles 시험 항목: 수동 ✎ · 자동 ▶) */
  rowIcon?: (row: NRow) => ReactNode
  /** 끌어서 차례 바꾸기 — 새 차례의 ID 전부. reorderKey 열 오름차순 정렬일 때도 끌 수 있다 */
  onReorder?: (ids: string[]) => void
  reorderKey?: string
  /** 처음 고른 행 — 표가 다시 서도 고른 것을 되살린다 */
  initSelected?: string[]
  /** 선택 줄에 단추·건수를 안 세운다(바깥 도구 줄이 맡는다) */
  hideBulk?: boolean
  /** 보기 탭 오른쪽 도구(Add TC · Test Start …) */
  toolbarLeft?: ReactNode
  /** 보이는 행(검색·필터 뒤, 차례대로)의 ID */
  onShown?: (ids: string[]) => void
  /**
   * 「기본」 탭의 정렬·묶기를 바깥이 쥔다(Cycles 시험 항목: 사이클 문서 itView — 차례가 곧 시험 차례라
   * 사람·PC 마다 달라지면 안 된다). 바뀌면 onBaseView 로 돌려준다. 예전 표와 같은 꼴(sorts·groupBy)
   */
  baseView?: { sorts: Array<{ key: string; dir: 'asc' | 'desc' }>; groupBy: string }
  /** 보기 탭 없이 「기본」 하나로만(Cycles 시험 항목 — 정렬·묶기는 사이클 문서가 쥔다). 서버 보기는 안 읽는다 */
  noViews?: boolean
  onBaseView?: (v: { sorts: Array<{ key: string; dir: 'asc' | 'desc' }>; groupBy: string }) => void
}

/** 머리 메뉴에서 고를 수 있는 유형 — 서버 정의(사용자 정의 칸)가 받는 것만 */
const DEF_TYPES: EfColumn['type'][] = ['text', 'number', 'date', 'select', 'multiselect']
const toNType = (t: EfColumn['type']): NCol['type'] =>
  t === 'number' || t === 'date' || t === 'select' || t === 'multiselect' ? t : 'text'

const BASE = 'base'
const EMPTY_ST: EfViewState = { q: '', filters: [], sorting: [], group: null }

function prefJson<T>(key: string, dflt: T): T {
  try {
    const v = JSON.parse(prefGet(key) || 'null') as unknown
    return v == null ? dflt : (v as T)
  } catch {
    return dflt
  }
}

/** 탭에 담는 Effort 쪽 상태 — 이름·주인·공용 여부는 서버 칸이 따로 든다 */
type EfvBody = Pick<EfView, 'type' | 'ef'> & { nchart?: unknown; chartCol?: unknown }
const efvOf = (v: EfView): EfvBody => ({ type: v.type, ef: v.ef, nchart: v.nchart, chartCol: v.chartCol })

/** 예전 표의 탭(flt·hidden)을 Effort 상태로 — 처음 한 번. 고른 값 거르기는 선택 칸이면 머리글 필터, 아니면 조건식 */
function fromOldBody(body: ViewBody, cols: NCol[]): EfViewState {
  const flt = body.flt as { q?: string; filters?: Array<{ key: string; values: string[] }>; sorts?: Array<{ key: string; dir: string }>; groupBy?: string } | undefined
  const st: EfViewState = { ...EMPTY_ST, hidden: body.hidden ?? [] }
  if (!flt) return st
  st.q = flt.q ?? ''
  st.sorting = (flt.sorts ?? []).map((x) => ({ id: x.key, desc: x.dir === 'desc' }))
  st.group = flt.groupBy || null
  for (const f of flt.filters ?? []) {
    if (!f.values?.length) continue
    const c = cols.find((x) => x.key === f.key)
    if (c && (c.type === 'select' || c.type === 'multiselect')) st.filters.push({ id: f.key, value: f.values })
    else if (f.values.length === 1) st.conds = [...(st.conds ?? []), { col: f.key, op: 'eq', v: f.values[0]! }]
  }
  return st
}

export default function EfNTable(p: EfNTableProps) {
  const qc = useQueryClient()
  const [ver, setVer] = useState(0)
  const [msg, setMsg] = useState('')
  const toastT = useRef<number | undefined>(undefined)
  const toast = useCallback((m: string) => {
    setMsg(m)
    window.clearTimeout(toastT.current)
    toastT.current = window.setTimeout(() => setMsg(''), 2600)
  }, [])

  // ── 서버 보기 ──
  const vq = useQuery({
    queryKey: ['views', p.scope],
    enabled: !p.noViews,
    queryFn: async () => {
      const r = await apiFetch(`/api/views?scope=${encodeURIComponent(p.scope)}`)
      if (!r.ok) throw new Error('보기를 못 읽었습니다')
      return (await r.json()) as { views: ViewDef[] }
    },
    staleTime: 30_000,
  })

  /** 열 정의 글(이름·유형·옵션·색·차례) — 바깥 열에서 세운 직후 값과 견주어 머리 메뉴로 고쳤는지 안다 */
  const defsSigOf = (cs: EfColumn[]) =>
    JSON.stringify(cs.map((c) => [c.id, c.title, c.type, c.options ?? [], c.optColors ?? {}]))
  const defsSig = useRef('')
  // ── 표 문서 — 열은 바깥 NCol 에서, 행은 바깥 행 그대로(같은 객체 — 체크·더 보기가 안 풀린다) ──
  const docRef = useRef<EfDoc | null>(null)
  if (!docRef.current) {
    const base: EfView = prefJson<EfView | null>(`${p.layoutKey}.base`, null) ?? { id: BASE, name: '기본', type: 'table' }
    Object.assign(base, { id: BASE, name: '기본', fixed: true })
    if (!base.ef) base.ef = { ...EMPTY_ST, hidden: p.columns.filter((c) => c.hidden).map((c) => c.key) }
    docRef.current = { columns: [], pages: { all: { rows: [] } }, years: ['all'], curPage: 'all', betaViews: [base], curBetaView: BASE }
  }
  const doc = docRef.current
  const nById = useMemo(() => new Map(p.columns.map((c) => [c.key, c])), [p.columns])
  /* 열 — 바깥 열 정의가 바뀔 때만 다시 세운다. 끌어 바꾼 차례·폭은 지금 문서에서 이어 받는다 */
  const colSig = p.columns.map((c) => `${c.key}|${c.type}|${c.label}|${(c.options ?? []).map((o) => o.value + o.color).join(',')}`).join('§')
  const colSigRef = useRef('')
  if (colSigRef.current !== colSig) {
    colSigRef.current = colSig
    const prev = new Map(doc.columns.map((c) => [c.id, c]))
    const ro = new Set([...(p.readOnlyKeys ?? []), p.idKey])
    const made: EfColumn[] = p.columns.map((c) => {
      const ty: EfColumn['type'] =
        c.type === 'select' ? 'select' : c.type === 'multiselect' ? 'multiselect' : c.type === 'number' ? 'number' : c.type === 'date' ? 'date' : c.type === 'person' ? 'person' : 'text'
      const nc: EfColumn = { id: c.key, title: c.label, type: ty, width: c.width, readOnly: ro.has(c.key) }
      if (c.key === p.idKey) nc.link = true
      if (c.options?.length) {
        nc.options = c.options.map((o) => o.value)
        // 편집기 칩 색 — 설정의 색 이름(palette)·hex 를 점 색으로
        nc.optColors = Object.fromEntries(c.options.map((o) => [o.value, paintOfAny(o.color).dot]))
      }
      if (ty === 'select' || ty === 'multiselect') nc.fixedOptions = true
      // 머리 메뉴 허용 — 만든 칸은 이름·유형·옵션·삭제, 코드 칸은 이름·옵션, ID·제목·계산 칸은 잠금
      if (p.onColumns && !c.fixed && !ro.has(c.key)) {
        if (c.key.startsWith('cf_')) nc.defs = { rename: true, type: true, opts: true, del: true }
        else if ((p.codeKeys ?? []).includes(c.key)) nc.defs = { rename: true, opts: true }
      }
      const old = prev.get(c.key)
      if (old?.efWidth) nc.efWidth = old.efWidth
      else if (c.width) nc.efWidth = c.width
      return nc
    })
    // 차례 — 지금 문서(끌어 바꾼 것) → 계정 설정에 기억해 둔 것 → 바깥 열 차례
    const saved = doc.columns.length ? null : prefJson<{ order?: string[]; widths?: Record<string, number> } | null>(`${p.layoutKey}.cols`, null)
    if (saved?.widths) for (const c of made) if (saved.widths[c.id]) c.efWidth = saved.widths[c.id]
    const order = doc.columns.length ? doc.columns.map((c) => c.id) : (saved?.order ?? p.columns.map((c) => c.key))
    const at = new Map(order.map((k, i) => [k, i]))
    const pos = (c: EfColumn) => at.get(c.id) ?? 900 + p.columns.findIndex((x) => x.key === c.id)
    made.sort((a, b) => pos(a) - pos(b))
    doc.columns = made
    defsSig.current = defsSigOf(made)
  }
  doc.pages.all!.rows = p.rows as EfRow[]

  /* 서버 보기 → 문서 탭. 같은 id 는 지금 문서의 것(고치던 상태)을 그대로 두고 이름·공용·주인만 서버 값으로 */
  const known = useRef(new Map<string, string>()) // id → 마지막으로 서버와 맞춘 body 글
  const bodies = useRef(new Map<string, ViewBody & { efv?: EfvBody }>()) // id → 서버 body(예전 칸 보존용)
  const made = useRef(new Set<string>()) // 우리가 만들고 서버가 아직 안 돌려준 탭
  const svSig = JSON.stringify((vq.data?.views ?? []).map((v) => [v.id, v.name, v.shared, v.owner, v.sort_order]))
  const svSigRef = useRef('')
  if (vq.data && svSigRef.current !== svSig) {
    svSigRef.current = svSig
    const cur = new Map((doc.betaViews ?? []).map((v) => [v.id, v]))
    const out: EfView[] = [cur.get(BASE)!]
    for (const sv of vq.data.views) {
      const b = (sv.body ?? {}) as ViewBody & { efv?: EfvBody }
      bodies.current.set(sv.id, b)
      made.current.delete(sv.id)
      const had = cur.get(sv.id)
      const v: EfView =
        had ??
        ({ id: sv.id, name: sv.name, type: b.efv?.type ?? 'table', ef: b.efv?.ef ?? fromOldBody(b, p.columns), nchart: b.efv?.nchart, chartCol: b.efv?.chartCol } as EfView)
      Object.assign(v, { name: sv.name, shared: sv.shared, owner: sv.owner, sort_order: sv.sort_order })
      if (!had) known.current.set(sv.id, JSON.stringify(efvOf(v)))
      out.push(v)
    }
    // 우리가 막 만든 것(아직 서버 목록에 없음)은 남긴다
    for (const v of doc.betaViews ?? []) if (made.current.has(v.id) && !out.includes(v)) out.push(v)
    doc.betaViews = out
    const want = prefGet(`${p.layoutKey}.cur`) || doc.curBetaView || BASE
    doc.curBetaView = out.some((v) => v.id === want) ? want : BASE
  }
  ensureViews(doc)
  /* 바깥이 쥔 기본 탭 정렬·묶기 — 바뀌었을 때만 얹는다(얹은 값을 sync 가 도로 돌려주지 않게 글로 기억) */
  const bvSig = useRef('')
  const bvOf = (st?: EfViewState) =>
    JSON.stringify({ s: (st?.sorting ?? []).map((x) => ({ key: x.id, dir: x.desc ? 'desc' : 'asc' })), g: st?.group ?? '' })
  if (p.baseView) {
    const want = JSON.stringify({ s: p.baseView.sorts ?? [], g: p.baseView.groupBy ?? '' })
    if (want !== bvSig.current) {
      bvSig.current = want
      const base = (doc.betaViews ?? []).find((v) => v.id === BASE)
      if (base) base.ef = { ...(base.ef ?? EMPTY_ST), sorting: (p.baseView.sorts ?? []).map((x) => ({ id: x.key, desc: x.dir === 'desc' })), group: p.baseView.groupBy || null }
    }
  }

  /** 서버에 한 탭 저장 — 예전 표가 읽는 칸은 그대로 두고 efv·hidden 만 */
  const saveView = useCallback(
    async (v: EfView, i: number) => {
      const old = bodies.current.get(v.id) ?? {}
      const body = { ...old, efv: efvOf(v), hidden: v.ef?.hidden ?? old.hidden ?? [] }
      const r = await apiFetch('/api/views', {
        method: 'POST',
        body: JSON.stringify({ id: v.id, scope: p.scope, name: v.name, shared: !!v.shared, body, sort_order: Number(v.sort_order ?? i) }),
      })
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { detail?: string }
        throw new Error(j.detail || '보기를 저장하지 못했습니다')
      }
      bodies.current.set(v.id, body)
      known.current.set(v.id, JSON.stringify(efvOf(v)))
    },
    [p.scope],
  )
  const timer = useRef<number | undefined>(undefined)
  const layoutSig = useRef('')
  /** 고쳤다 — 기본 탭·열 배치는 계정 설정에, 서버 탭은 바뀐 것만 서버에(만들기·고치기·지우기) */
  const sync = useCallback(() => {
    const d = docRef.current!
    const views = d.betaViews ?? []
    const base = views.find((v) => v.id === BASE)
    if (base) prefSet(`${p.layoutKey}.base`, JSON.stringify({ type: base.type, ef: base.ef, nchart: base.nchart, chartCol: base.chartCol }))
    // 기본 탭 정렬·묶기를 바깥이 쥐었으면 바뀐 것을 돌려준다
    if (base && p.onBaseView && p.baseView) {
      const now = bvOf(base.ef)
      if (now !== bvSig.current) {
        bvSig.current = now
        const st = base.ef
        p.onBaseView({ sorts: (st?.sorting ?? []).map((x) => ({ key: x.id, dir: x.desc ? 'desc' : 'asc' })), groupBy: st?.group ?? '' })
      }
    }
    prefSet(`${p.layoutKey}.cur`, d.curBetaView ?? BASE)
    // 열 차례·폭·기본 탭 숨긴 열 — 예전 표 설정에도(바뀐 때만)
    const lay = {
      order: d.columns.map((c) => c.id),
      widths: Object.fromEntries(d.columns.filter((c) => c.efWidth).map((c) => [c.id, Number(c.efWidth)])),
      hidden: base?.ef?.hidden ?? [],
    }
    // 머리 메뉴로 열 정의를 고쳤다 → 바깥(사용자 정의 칸·코드 저장)으로. 새 열은 cf_ 열쇠로 바꿔 세운다
    if (p.onColumns && defsSigOf(d.columns) !== defsSig.current) {
      for (const c of d.columns) {
        if (nById.has(c.id)) continue
        const key = `cf_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 4)}`
        c.id = key
        c.defs = { rename: true, type: true, opts: true, del: true }
      }
      const hid = new Set(base?.ef?.hidden ?? [])
      const after: NCol[] = d.columns.map((c) => {
        const n = nById.get(c.id)
        const ty = toNType(c.type)
        const out: NCol = { ...(n ?? {}), key: c.id, label: c.title, type: ty, width: c.efWidth ? Number(c.efWidth) : n?.width, hidden: hid.has(c.id) }
        if (ty === 'select' || ty === 'multiselect') {
          // 색 — 편집기에서 새로 고른 색(hex)이면 그것, 아니면 설정에 있던 그대로(이름 색 보존). 그림·보이기도 그대로
          out.options = (c.options ?? []).map((v) => {
            const o = n?.options?.find((x) => x.value === v)
            const hex = c.optColors?.[v]
            const keepOld = o && (!hex || hex === paintOfAny(o.color).dot)
            return { value: v, color: keepOld ? o!.color : (hex ?? ''), icon: o?.icon, show: o?.show }
          })
        } else delete out.options
        return out
      })
      defsSig.current = defsSigOf(d.columns)
      p.onColumns(after)
    }
    const ls = JSON.stringify(lay)
    if (ls !== layoutSig.current) {
      layoutSig.current = ls
      prefSet(`${p.layoutKey}.cols`, JSON.stringify({ order: lay.order, widths: lay.widths }))
      p.onLayout?.(lay)
    }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      void (async () => {
        try {
          const ids = new Set(views.map((v) => v.id))
          // 지운 것
          for (const id of [...known.current.keys()]) {
            if (ids.has(id)) continue
            const r = await apiFetch(`/api/views/${encodeURIComponent(id)}`, { method: 'DELETE' })
            if (!r.ok) throw new Error('보기를 지우지 못했습니다 — 만든 사람이나 관리자만 지웁니다')
            known.current.delete(id)
            bodies.current.delete(id)
          }
          // 새로 만든 것 · 고친 것
          for (const [i, v] of views.entries()) {
            if (v.id === BASE) continue
            const sig = JSON.stringify(efvOf(v))
            const meta = `${v.name}|${!!v.shared}`
            const was = known.current.get(v.id)
            const wasMeta = (vq.data?.views ?? []).find((x) => x.id === v.id)
            const metaSame = wasMeta && `${wasMeta.name}|${wasMeta.shared}` === meta
            if (was === sig && metaSame) continue
            if (was === undefined) made.current.add(v.id)
            await saveView(v, i)
          }
          void qc.invalidateQueries({ queryKey: ['views', p.scope] })
        } catch (e) {
          // 상한·권한 — 서버 말 그대로 알리고 서버 목록으로 되돌린다
          toast(e instanceof Error ? e.message : '보기를 저장하지 못했습니다')
          made.current.clear()
          svSigRef.current = ''
          const d2 = docRef.current!
          d2.betaViews = (d2.betaViews ?? []).filter((v) => v.id === BASE || known.current.has(v.id))
          if (!d2.betaViews.some((v) => v.id === d2.curBetaView)) d2.curBetaView = BASE
          void qc.invalidateQueries({ queryKey: ['views', p.scope] })
          setVer((n) => n + 1)
        }
      })()
    }, 700)
  }, [p, qc, saveView, toast, vq.data])
  const touch = useCallback(() => {
    sync()
    setVer((v) => v + 1)
  }, [sync])
  const redraw = useCallback(() => {
    prefSet(`${p.layoutKey}.cur`, docRef.current?.curBetaView ?? BASE)
    setVer((v) => v + 1)
  }, [p.layoutKey])
  useEffect(() => () => window.clearTimeout(timer.current), [])

  // ── 보이는 행 · 고른 행 ──
  const shown = useRef<EfRow[]>([])
  const onShown = useCallback(
    (rs: EfRow[]) => {
      shown.current = rs
      p.onShown?.(rs.map((r) => String(r.__id ?? '')))
    },
    [p],
  )
  const onCheck = useCallback((rs: EfRow[]) => p.onSelect?.(rs.map((r) => String(r.__id ?? ''))), [p])

  /** 엑셀 — 보이는 열 차례 그대로, 값 색은 설정 색(예전 표와 같은 서버 xlsx) */
  const exportXlsx = useCallback(
    async (rs: EfRow[], vcols: EfColumn[]) => {
      const pick = rs.length ? rs : shown.current
      const cols = vcols.filter((c) => p.exportCell?.(pick[0] ?? {}, c.id) !== null)
      const colors: Record<string, Record<string, string>> = {}
      for (const c of cols) {
        const n = nById.get(c.id)
        if (!n?.options?.length) continue
        colors[c.id] = Object.fromEntries(n.options.map((o) => [o.value, paintOfAny(o.color).fg]))
      }
      const now = new Date()
      const p2 = (n: number) => String(n).padStart(2, '0')
      const day = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`
      const when = `${day} ${p2(now.getHours())}:${p2(now.getMinutes())}`
      const scope = String(p.exportScope ?? '').trim()
      const title = String(p.exportTitle ?? '표')
      const body = {
        title,
        subtitle: [scope, `${pick.length}건`, `${when} 내보냄`].filter(Boolean).join(' · '),
        columns: cols.map((c) => ({ key: c.id, label: c.title })),
        rows: pick.map((r) =>
          Object.fromEntries(
            cols.map((c) => {
              const made = p.exportCell?.(r, c.id)
              return [c.id, made !== undefined ? made : (r[c.id] ?? '')]
            }),
          ),
        ),
        colors,
      }
      const r = await apiFetch('/api/export/xlsx', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!r.ok) {
        toast('엑셀을 만들지 못했습니다')
        return
      }
      const url = URL.createObjectURL(await r.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = `${[title.replace(/[\\/:*?"<>|]/g, ' '), scope].filter(Boolean).join('_')}_${day}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      toast(`엑셀 내려받음 — ${pick.length}행`)
    },
    [p, nById, toast],
  )
  /** 지금 보기에서 보이는 열(차례대로) — 선택 줄 「엑셀」 이 쓴다 */
  const visCols = () => {
    const d = docRef.current!
    const v = (d.betaViews ?? []).find((x) => x.id === d.curBetaView)
    const hid = new Set(v?.ef?.hidden ?? [])
    return d.columns.filter((c) => !hid.has(c.id))
  }

  /** 칸 그리기 — 바깥이 먼저, 그다음 제목(열기 단추)·선택 칸(설정 색·그림 알약) */
  const renderCell = useCallback(
    (r: EfRow, c: EfColumn) => {
      const n = nById.get(c.id)
      if (!n) return undefined
      const own = p.renderCell?.(r as NRow, n)
      if (own !== undefined) return own
      const v = r[c.id] == null ? '' : String(r[c.id])
      if (c.id === p.idKey && p.rowIcon) {
        // 그림 + 여는 글자(.ef-link — 표가 누름을 받아 연다)
        return (
          <span className="efn-idw">
            {p.rowIcon(r as NRow)}
            <span className="ef-link">{v}</span>
          </span>
        )
      }
      if (c.id === p.titleKey) {
        return (
          <span className="efn-ttl">
            <span className="efn-ttltxt">{v || '(제목 없음)'}</span>
            {!!p.onOpen && (
              <button
                type="button"
                className="efn-open"
                title="상세 화면으로"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => p.onOpen!(String(r.__id ?? ''))}
              >
                열기
              </button>
            )}
          </span>
        )
      }
      if (n.type === 'select' || n.type === 'multiselect') {
        const opt = (x: string): NOption | undefined => (n.options ?? []).find((o) => o.value === x)
        const vals = n.type === 'multiselect' ? multiVals(v) : v ? [v] : []
        if (!vals.length) return null
        return (
          <span className="efn-pills">
            {vals.map((x) => {
              const o = opt(x)
              return <Pill key={x} value={x} color={o?.color} icon={o?.icon} show={o?.show} />
            })}
          </span>
        )
      }
      return undefined
    },
    [nById, p],
  )
  /** ID 를 누르면 — 팝업이 있는 화면은 상세내역 팝업, 없으면 상세 화면(예전 표와 같다) */
  const onOpen = useCallback((r: EfRow) => {
    const id = String(r.__id ?? '')
    if (p.onPeek) p.onPeek(id)
    else p.onOpen?.(id)
  }, [p])
  const onPut = useCallback(
    (r: EfRow, c: EfColumn, v: unknown, prev?: unknown) => {
      const res = p.onCell(String(r.__id ?? ''), c.id, v == null ? '' : String(v))
      // 저장이 실패하면(false) 표에 먼저 넣은 값을 되돌린다 — 예전 표처럼 실제 값만 남게
      if (res && typeof (res as Promise<unknown>).then === 'function')
        void (res as Promise<unknown>).then((ok) => {
          if (ok !== false) return
          if (prev === undefined || prev === '') delete r[c.id]
          else r[c.id] = prev
          setVer((n) => n + 1)
        })
    },
    [p],
  )
  const onBulk = useCallback(
    (k: string, rs: EfRow[]) => {
      // 「엑셀」 은 여기서 — 고른 행을 보이는 열 그대로
      if (k === 'csv') return void exportXlsx(rs, visCols())
      p.onBulk?.(k, rs.map((r) => String(r.__id ?? '')))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p, exportXlsx],
  )

  return (
    <div className="ef efn">
      {!!msg && <div className="ef-toast">{msg}</div>}
      <EffortBody
        d={doc}
        name=""
        path={[]}
        ver={ver}
        touch={touch}
        redraw={redraw}
        toast={toast}
        save="idle"
        retry={() => {}}
        sideHide
        onToggleSide={() => {}}
        host={{
          title: null,
          bare: true,
          viewTypes: ['table', 'chart'],
          csvName: `${p.exportTitle ?? '표'}.csv`,
          viewPolicy: { me: p.meName, isAdmin: p.isAdmin },
          onOpen,
          onPut,
          onCheck,
          onShown,
          onNew: p.onNew,
          bulk: p.bulk,
          onBulk,
          renderCell,
          onExport: (rs, vc) => void exportXlsx(rs, vc),
          colDefs: p.onColumns ? { types: DEF_TYPES, add: true } : undefined,
          toolLeft: p.toolbarLeft,
          noTabs: p.noViews,
          rowClass: p.rowClass ? (r) => p.rowClass!(r as NRow) : undefined,
          reorder: p.onReorder ? { key: p.reorderKey, on: (rs) => p.onReorder!(rs.map((r) => String(r.__id ?? ''))) } : undefined,
          initChecked: p.initSelected,
          hideBulk: p.hideBulk,
          toolRight: p.toolRight,
          pageSize: 200,
        }}
      />
    </div>
  )
}
