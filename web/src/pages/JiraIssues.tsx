/**
 * Jira Issue — **지라에서 가져다 보는 자리**.
 *
 * 지라에는 팔만 건이 넘는다. 다 가져오는 것은 뜻이 없고 지라도 못 견딘다.
 * 그래서 두 가지를 지킨다:
 *   · **프로젝트를 골라** 그것만 받는다(지시).
 *   · 한 번 받은 것은 **우리 DB 에 둔다**. 다음 Sync 는 마지막으로 받은
 *     갱신 시각 뒤에 바뀐 것만 부른다 — 두 번째부터는 몇 건이라 금방 끝난다.
 *
 * 화면은 **Effort Plan 양식**이다(지시: Effort Plan database 양식을 Jira issue 에) —
 * 왼쪽 목록 카드(고른 프로젝트) + 오른쪽 본문 카드(제목 · 보기 탭 · 도구 줄 · 표/차트 · 바닥줄 계산).
 * 본문은 EffortPlan 의 EffortBody 를 그대로 빌린다(host). 지라 값은 못 고치고(지라가 정본),
 * 우리가 매기는 분류 다섯 칸만 고친다. 키를 누르면 오른쪽에 지라 이슈 창(IssueDrawer) — 예전 그대로(지시).
 *
 * 열 배치·폭·보기(탭마다 검색·필터·정렬·그룹·숨긴 열·계산)는 계정을 따라간다(utop.jira.ef).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, type MeUser, isAdminUser } from '@/api/client'
import { prefGet, prefSet } from '@/lib/prefs'
import Resizer, { useResizableWidth } from '@/components/Resizer'
import { IssueDrawer } from '@/components/jira/IssueDrawer'
import { useJiraBase } from '@/components/jira/useJiraBase'
import { EffortBody } from '@/pages/EffortPlan'
import { TI } from '@/components/effort/icons'
import { ensureViews, type EfColumn, type EfDoc, type EfRow, type EfView } from '@/components/effort/model'
import '@/components/effort/Effort.css'
import './JiraIssues.css'

interface JiraProject {
  key: string
  name: string
}
/** 분류 한 건 — 서버 _defect_norm 이 돌려주는 그대로 */
interface DefClass {
  source?: string
  device?: string
  category?: string
  item?: string
  type3?: string
  by?: string
  at?: string
}
/** 지라의 칸 하나 — /api/jira/fields */
interface JiraField {
  id: string
  name: string
  custom?: boolean
  type?: string
  items?: string
}
/** 사람이 더한 칸 — 서버에 한 벌(공용) */
interface ExtraCol {
  id: string
  label: string
  type?: string
  items?: string
}
interface DefSchema {
  device?: string[]
  category_field?: string[]
  category_live?: string[]
  item?: string[]
  type3?: string[]
}
interface SyncMark {
  at?: string
  last_updated?: string
  n?: number
  total?: number
}
type JType = 'text' | 'select' | 'date' | 'number' | 'multiselect'

/**
 * 열 — 예전 목업 JIRA_COLS 그대로. `def` 는 처음에 보이는 열이다.
 * 「UMS-Key」 는 뺐다 — 이 지라에 그런 필드가 없다.
 */
const COLS: Array<{
  key: string
  label: string
  type?: JType
  w?: number
  def?: boolean
  /** 분류 열이면 분류 한 건의 어느 필드인지 */
  cls?: keyof DefClass
}> = [
  { key: 'created', label: '생성일', type: 'date', w: 96, def: true },
  { key: 'customer', label: '사업자', type: 'select', w: 84, def: true },
  { key: 'project', label: '프로젝트', w: 96, def: true },
  { key: 'issuekey', label: '키', w: 104, def: true },
  { key: 'probtype', label: '문제유형', type: 'select', w: 116, def: true },
  { key: 'hwsw', label: '이슈분류(HW,SW)', type: 'select', w: 116, def: true },
  { key: 'summary', label: '요약', w: 340, def: true },
  { key: 'status', label: '상태', type: 'select', w: 96, def: true },
  { key: 'reporter', label: '등록자', w: 110, def: true },
  { key: 'lab', label: '시험시설', type: 'select', w: 100, def: true },
  { key: 'issuetype', label: '이슈 유형', type: 'select', w: 100 },
  { key: 'assignee', label: '담당자', w: 110 },
  { key: 'priority', label: '우선순위', type: 'select', w: 88 },
  { key: 'updated', label: '갱신일', type: 'date', w: 96 },
  { key: 'stage', label: '이슈단계', type: 'select', w: 120 },
  { key: 'freq', label: '발생빈도', type: 'select', w: 88 },
  { key: 'start', label: '시작일', type: 'date', w: 96 },
  { key: 'due', label: '완료일', type: 'date', w: 96 },
  { key: 'crkind', label: 'CR 구분', type: 'select', w: 92 },
  { key: 'bsptest', label: 'BSP 시험버전', w: 120 },
  { key: 'bspfix', label: 'BSP 해결버전', w: 120 },
  { key: 'fwver', label: 'F/W Version', w: 112 },
  { key: 'labels', label: '라벨', type: 'multiselect', w: 150 },
  { key: 'description', label: '내용', w: 280 },
  /* ── 분류(LLM) ── 지라에 없는 값이다. **우리가 매긴다**.
     그래서 이 다섯만 표에서 고칠 수 있다 — 나머지는 지라가 정본이다. */
  { key: 'cls_source', label: '발생상황', type: 'select', w: 96, def: true, cls: 'source' },
  { key: 'cls_device', label: '분류 유형', type: 'select', w: 84, def: true, cls: 'device' },
  { key: 'cls_category', label: '분류 카테고리', type: 'select', w: 104, def: true, cls: 'category' },
  { key: 'cls_item', label: '상용망 항목', type: 'select', w: 104, cls: 'item' },
  { key: 'cls_type3', label: '상용망 유형', type: 'select', w: 104, cls: 'type3' },
]
/** 지라의 칸 타입 → 표의 칸 갈래 */
function jtypeOf(f: { type?: string }): JType {
  const t = String(f.type || '')
  if (t === 'date' || t === 'datetime') return 'date'
  if (t === 'number') return 'number'
  /* 배열은 「A, B」 로 이어 붙인 글자 — 하나짜리만 고르는 칸(option·status…)만 선택으로 세운다 */
  if (t === 'option' || t === 'priority' || t === 'status') return 'select'
  return 'text'
}

/** 서랍에 내는 분류 줄 */
const CLS_ROWS: Array<[string, string]> = [
  ['발생상황', 'cls_source'],
  ['분류 유형', 'cls_device'],
  ['분류 카테고리', 'cls_category'],
  ['상용망 항목', 'cls_item'],
  ['상용망 유형', 'cls_type3'],
]
/** 분류 열 → 분류 한 건의 어느 필드인가 */
const CLS_OF: Record<string, keyof DefClass> = Object.fromEntries(
  COLS.filter((c) => c.cls).map((c) => [c.key, c.cls as keyof DefClass]),
)
const clsFields = (r: EfRow, c: DefClass) => {
  r.cls_source = c.source ?? ''
  r.cls_device = c.device ?? ''
  r.cls_category = c.category ?? ''
  r.cls_item = c.item ?? ''
  r.cls_type3 = c.type3 ?? ''
}

/* 프로젝트는 「프로젝트」 값으로 가른다 — 키 앞글자가 프로젝트와 다른 것이 있다(E6100 의 P88-4340) */
const prjOf = (r: EfRow) => String(r.project ?? '')

/** 한 번에 가를 수 있는 최대 — 로컬 LLM 이 한 건에 1~2초다. 이백이면 한 잔 마실 참 */
const CLS_CAP = 200

const PRJ_KEY = 'utop.jira.projects'
/** 프로젝트마다 고른 이슈 유형 — 없거나 빈 배열이면 전부. 계정을 따라간다(SYNC) */
const TYPES_KEY = 'utop.jira.types'
/** 열 배치·폭·보기 — 계정을 따라간다(SYNC) */
const LAYOUT_KEY = 'utop.jira.ef'
/** 왼쪽에서 고른 프로젝트 — 이 PC 의 보던 자리(SYNC 아님) */
const CUR_KEY = 'utop.jira.cur'
/* 예전 NTable 화면의 열 숨김·폭·차례 — 처음 한 번 새 양식으로 옮겨 받는다 */
const OLD_COL_KEY = 'utop.jira.cols'
const OLD_W_KEY = 'utop.jira.w'
const OLD_ORD_KEY = 'utop.jira.order'

interface JiraLayout {
  order?: string[]
  w?: Record<string, number>
  views?: EfView[]
  cur?: string
  /** 본 적 있는 열 — 나중에 더한 칸은 숨긴 채로 선다 */
  known?: string[]
}

/** 저장해 둔 것을 꺼낸다 — 없으면 준 것을 그대로 */
function prefJson<T>(key: string, dflt: T): T {
  try {
    const v = JSON.parse(prefGet(key) || 'null') as unknown
    return v == null ? dflt : (v as T)
  } catch {
    return dflt
  }
}

export default function JiraIssues({ me }: { me?: MeUser | null }) {
  const qc = useQueryClient()
  const jbase = useJiraBase()
  /** 고른 프로젝트 — 계정을 따라간다 */
  const [picked, setPicked] = useState<string[]>(() => {
    const v = prefJson<unknown>(PRJ_KEY, [])
    return Array.isArray(v) ? (v as string[]) : []
  })
  useEffect(() => {
    prefSet(PRJ_KEY, JSON.stringify(picked))
  }, [picked])
  /** 프로젝트마다 고른 이슈 유형(지시: 이슈 유형을 골라서 가져오기) — 보이는 것도, Sync 로 받는 것도 이것만 */
  const [types, setTypes] = useState<Record<string, string[]>>(() => prefJson<Record<string, string[]>>(TYPES_KEY, {}))
  useEffect(() => {
    prefSet(TYPES_KEY, JSON.stringify(types))
  }, [types])
  /** 유형 고르기 창 — 어느 프로젝트의, 어디에 */
  const [tyPop, setTyPop] = useState<{ prj: string; x: number; y: number; pick: string[] } | null>(null)
  /** 왼쪽 목록에서 보는 프로젝트 — '' 이면 고른 것 전부 */
  const [cur, setCur] = useState(() => prefGet(CUR_KEY) || '')
  const pickCur = (k: string) => {
    setCur(k)
    prefSet(CUR_KEY, k)
  }
  const [prjOpen, setPrjOpen] = useState(false)
  const [prjQ, setPrjQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState('')
  const [sel, setSel] = useState<string>('')
  /** 표에서 체크한 줄(키) — 분류가 누구를 대상으로 도는지 정한다 */
  const [checked, setChecked] = useState<string[]>([])
  const onCheck = useCallback((rs: EfRow[]) => setChecked(rs.map((r) => String(r.issuekey ?? ''))), [])
  const [clsAsk, setClsAsk] = useState(false)
  /** 지라 칸 더하기 판 */
  const [fldOpen, setFldOpen] = useState(false)
  const [fldQ, setFldQ] = useState('')
  /** 목록 판 — 끌어 맞춘 폭 · 접어 둠(Effort Plan 과 같은 부품, 열쇠는 따로) */
  const [sideW, setSideW] = useResizableWidth('utop.jira.sideW', 190, 150, 520)
  const [sideHide, setSideHide] = useState(() => prefGet('utop.jira.sideHide') === '1')
  const toggleSide = useCallback(() => {
    setSideHide((h) => {
      prefSet('utop.jira.sideHide', h ? '0' : '1')
      return !h
    })
  }, [])
  const layoutRef = useRef<HTMLDivElement>(null)

  const prjQuery = useQuery({
    queryKey: ['jira-projects'],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const r = await apiFetch('/api/jira/projects')
      return (await r.json()) as { ok?: boolean; projects?: JiraProject[] }
    },
  })
  const projects = prjQuery.data?.projects ?? []

  const issQuery = useQuery({
    queryKey: ['jira-issues', picked.join(',')],
    enabled: picked.length > 0,
    queryFn: async () => {
      // 서버 기본은 2,000건에서 자른다 — 표가 200건씩 「더 보기」 로 그리므로 서버 한도(20,000)까지 받는다
      const r = await apiFetch(`/api/jira/issues?projects=${encodeURIComponent(picked.join(','))}&limit=20000`)
      return (await r.json()) as {
        ok?: boolean
        rows?: Array<Record<string, string>>
        total?: number
        sync?: Record<string, SyncMark | null>
      }
    },
  })
  /** 고를 수 있는 분류 값 — 서버가 정본이라 화면에 박지 않는다 */
  const schQuery = useQuery({
    queryKey: ['jira-defschema'],
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const r = await apiFetch('/api/jira/defect/schema')
      return (await r.json()) as DefSchema
    },
  })
  /** 매겨 둔 분류 — 이슈와 따로 산다(지라 값이 아니라 우리 값이라) */
  const clsQuery = useQuery({
    queryKey: ['jira-defclass'],
    queryFn: async () => {
      const r = await apiFetch('/api/jira/defect/class')
      return (await r.json()) as { ok?: boolean; classes?: Record<string, DefClass> }
    },
  })
  const classes = useMemo(() => clsQuery.data?.classes ?? {}, [clsQuery.data])

  /* 행 — 받아 온 이슈 그대로(행 객체는 이슈가 다시 올 때만 새로 — 분류가 바뀌어도 같은 객체에 고쳐 쓴다.
     새 객체로 바꾸면 표가 「다른 행 묶음」 으로 보고 체크·더 보기를 처음으로 돌린다) */
  const baseRows: EfRow[] = useMemo(
    () => (issQuery.data?.rows ?? []).map((r) => ({ ...r, __id: String(r.issuekey ?? '') })),
    [issQuery.data],
  )
  const [ver, setVer] = useState(0)
  useEffect(() => {
    baseRows.forEach((r) => clsFields(r, classes[String(r.issuekey ?? '')] ?? {}))
    setVer((v) => v + 1)
  }, [baseRows, classes])
  /** 고른 유형에 드는 행만 — 프로젝트마다 고른 것이 없으면 전부 */
  const typedRows = useMemo(
    () =>
      baseRows.filter((r) => {
        const ts = types[prjOf(r)]
        return !ts?.length || ts.includes(String(r.issuetype ?? ''))
      }),
    [baseRows, types],
  )
  /** 프로젝트별 행 수(목록 판) */
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    typedRows.forEach((r) => m.set(prjOf(r), (m.get(prjOf(r)) ?? 0) + 1))
    return m
  }, [typedRows])
  const curOk = cur && picked.includes(cur) ? cur : ''
  const rows = useMemo(() => (curOk ? typedRows.filter((r) => prjOf(r) === curOk) : typedRows), [typedRows, curOk])
  /** 유형 고르기 창의 목록 — 지라가 이 프로젝트에 둔 유형(만들 수 있는 것) + 받아 둔 이슈에 있는 유형 */
  const tyQuery = useQuery({
    queryKey: ['jira-issuetypes', tyPop?.prj ?? ''],
    enabled: !!tyPop,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const r = await apiFetch(`/api/jira/issuetypes?project=${encodeURIComponent(tyPop!.prj)}`)
      return (await r.json()) as { ok?: boolean; issuetypes?: Array<{ name?: string; subtask?: boolean }> }
    },
  })
  const tyList = useMemo(() => {
    if (!tyPop) return [] as Array<[string, number]>
    const n = new Map<string, number>()
    baseRows.forEach((r) => prjOf(r) === tyPop.prj && n.set(String(r.issuetype ?? ''), (n.get(String(r.issuetype ?? '')) ?? 0) + 1))
    ;(tyQuery.data?.issuetypes ?? []).forEach((t) => t.name && !n.has(t.name) && n.set(t.name, 0))
    n.delete('')
    return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))
  }, [tyPop, baseRows, tyQuery.data])

  /** 사람이 더한 지라 칸 — **온 서버에 한 벌**이다(Sync 도 한 벌이라 그렇다) */
  const extraQuery = useQuery({
    queryKey: ['jira-extracols'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const r = await apiFetch('/api/jira/columns')
      return (await r.json()) as { ok?: boolean; columns?: ExtraCol[] }
    },
  })
  const extras = useMemo(() => extraQuery.data?.columns ?? [], [extraQuery.data])
  /** 붙박이 + 더한 칸. 더한 칸은 **늘 기본 숨김**이다 — 마흔 개를 더하면 표가 터진다 */
  const allCols: typeof COLS = useMemo(
    () => [...COLS, ...extras.map((e) => ({ key: e.id, label: e.label, type: jtypeOf(e), w: 130, def: false }))],
    [extras],
  )

  // ── 표 문서(Effort 양식) — 열·보기는 계정 설정에서, 행은 받아 온 이슈 ──
  const layout = useRef<JiraLayout | null>(null)
  if (!layout.current) {
    const saved = prefJson<JiraLayout | null>(LAYOUT_KEY, null)
    if (saved) layout.current = saved
    else {
      // 처음 — 예전 표에서 숨겨 둔 열·폭·차례를 옮겨 받는다
      const oldHidden = prefJson<string[] | null>(OLD_COL_KEY, null)
      const oldW = prefJson<Record<string, number>>(OLD_W_KEY, {})
      const oldOrd = prefJson<string[]>(OLD_ORD_KEY, [])
      const hidden = oldHidden ?? COLS.filter((c) => !c.def).map((c) => c.key)
      layout.current = {
        order: oldOrd,
        w: oldW,
        views: [{ id: 'jv-table', name: '표', type: 'table', ef: { q: '', filters: [], sorting: [], group: '', hidden } }],
        cur: 'jv-table',
        known: COLS.map((c) => c.key),
      }
    }
  }
  const docRef = useRef<EfDoc | null>(null)
  if (!docRef.current) {
    const L = layout.current
    docRef.current = { columns: [], pages: { all: { rows: [] } }, years: ['all'], curPage: 'all', betaViews: L.views, curBetaView: L.cur }
    ensureViews(docRef.current)
  }
  const doc = docRef.current
  /* 열 — 지라 칸 목록·분류 값이 바뀔 때만 다시 세운다. 끌어 바꾼 차례·폭은 지금 문서에서 이어 받는다 */
  const colKey = allCols.map((c) => c.key).join('|') + '#' + JSON.stringify(schQuery.data ?? {})
  const colKeyRef = useRef('')
  if (colKeyRef.current !== colKey) {
    colKeyRef.current = colKey
    const L = layout.current
    const sch = schQuery.data ?? {}
    const prev = new Map(doc.columns.map((c) => [c.id, c]))
    const made: EfColumn[] = allCols.map((c) => {
      const nc: EfColumn = { id: c.key, title: c.label, type: c.type ?? 'text', width: c.w, readOnly: !c.cls }
      if (c.key === 'issuekey') nc.link = true
      if (c.cls) {
        // 분류 값은 **서버 스키마가 정본**이다 — 현장장애·상용망검증은 카테고리가 갈리는데 열은 하나라 합쳐 준다
        nc.options =
          c.cls === 'source'
            ? ['현장장애', '상용망검증']
            : c.cls === 'device'
              ? sch.device ?? []
              : c.cls === 'category'
                ? [...new Set([...(sch.category_field ?? []), ...(sch.category_live ?? [])])]
                : c.cls === 'item'
                  ? sch.item ?? []
                  : sch.type3 ?? []
      }
      const old = prev.get(c.key)
      const w = old?.efWidth ?? L.w?.[c.key]
      if (w) nc.efWidth = w
      if (old?.optColors) nc.optColors = old.optColors
      return nc
    })
    const order = doc.columns.length ? doc.columns.map((c) => c.id) : (L.order ?? [])
    const at = new Map(order.map((k, i) => [k, i]))
    made.sort((a, b) => (at.get(a.id) ?? 900 + made.indexOf(a)) - (at.get(b.id) ?? 900 + made.indexOf(b)))
    doc.columns = made
    // 처음 보는 열(나중에 더한 지라 칸)은 모든 보기에서 숨긴 채로
    const known = new Set(L.known ?? COLS.map((c) => c.key))
    const fresh = made.filter((c) => !known.has(c.id) && !allCols.find((x) => x.key === c.id)?.def).map((c) => c.id)
    if (fresh.length)
      (doc.betaViews ?? []).forEach((v) => {
        if (v.ef) v.ef = { ...v.ef, hidden: [...new Set([...(v.ef.hidden ?? []), ...fresh])] }
      })
    L.known = made.map((c) => c.id)
  }
  doc.pages.all!.rows = rows

  /** 열 배치·폭·보기를 계정 설정에 적는다 — 표·차트가 고쳤다(touch)·보기를 옮겼다(redraw) 둘 다 */
  const persist = useCallback(() => {
    const d = docRef.current!
    const L: JiraLayout = {
      order: d.columns.map((c) => c.id),
      w: Object.fromEntries(d.columns.filter((c) => c.efWidth).map((c) => [c.id, c.efWidth as number])),
      views: d.betaViews,
      cur: d.curBetaView,
      known: layout.current?.known,
    }
    layout.current = L
    prefSet(LAYOUT_KEY, JSON.stringify(L))
  }, [])
  const touch = useCallback(() => {
    persist()
    setVer((v) => v + 1)
  }, [persist])
  const toast = useCallback((m: string) => {
    setFlash(m)
    window.setTimeout(() => setFlash(''), 2600)
  }, [])

  async function sync(full = false) {
    if (!picked.length || busy) return
    setBusy(true)
    setFlash('')
    try {
      const r = await apiFetch('/api/jira/issues/sync', {
        method: 'POST',
        // 고른 유형만 받는다 — 서버는 유형마다 마지막 받은 시각을 따로 둔다
        body: JSON.stringify({ projects: picked, full, types: Object.fromEntries(picked.filter((k) => types[k]?.length).map((k) => [k, types[k]])) }),
      })
      const j = (await r.json()) as {
        ok?: boolean
        error?: string
        got?: number
        added?: number
        updated?: number
        same?: number
        ms?: number
      }
      if (!j.ok) {
        setFlash(`동기화 실패 — ${j.error ?? '알 수 없는 까닭'}`)
        return
      }
      setFlash(
        `● 지라에서 ${j.got ?? 0}건 받아 DB 에 저장했습니다 — 새로 ${j.added ?? 0} · 갱신 ${j.updated ?? 0} · 변경 없음 ${j.same ?? 0} (${j.ms ?? 0}ms)`,
      )
      void qc.invalidateQueries({ queryKey: ['jira-issues'] })
      window.setTimeout(() => setFlash(''), 8000)
    } catch (e) {
      setFlash(`동기화 실패 — ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  /** 무엇을 가를 것인가 — 체크한 줄이 있으면 그것만, 없으면 지금 목록 전부 */
  const clsTargets = checked.length ? checked : rows.map((r) => String(r.issuekey ?? ''))
  const clsUndone = clsTargets.filter((k) => !(classes[k] ?? {}).source).length

  /** LLM 분류 — 프롬프트는 SETUP 「용도별 프롬프트 › Jira-분류」 가 정한다 */
  async function classify(overwrite: boolean) {
    setClsAsk(false)
    if (busy) return
    const keys = clsTargets.slice(0, CLS_CAP)
    if (!keys.length) return
    setBusy(true)
    setFlash(`● ${keys.length}건을 LLM 으로 가르는 중… 한 건에 1~2초 걸립니다`)
    try {
      const r = await apiFetch('/api/jira/defect/classify', {
        method: 'POST',
        body: JSON.stringify({ keys, overwrite }),
      })
      const j = (await r.json()) as {
        ok?: boolean
        error?: string
        detail?: string
        classified?: number
        failed?: string[]
        llm?: string
        message?: string
      }
      if (!j.ok) {
        setFlash(`분류 실패 — ${j.error ?? j.detail ?? '알 수 없는 까닭'}`)
        return
      }
      const bad = j.failed?.length ?? 0
      setFlash(
        j.message
          ? `● ${j.message}`
          : `● ${j.classified ?? 0}건을 갈랐습니다${bad ? ` · 못 가른 것 ${bad}건` : ''}${j.llm ? ` (${j.llm})` : ''}`,
      )
      void qc.invalidateQueries({ queryKey: ['jira-defclass'] })
      window.setTimeout(() => setFlash(''), 8000)
    } catch (e) {
      setFlash(`분류 실패 — ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  /** 분류 한 칸을 손으로 고친다 — LLM 이 틀린 것을 사람이 바로잡는 자리(표에서 고르면 여기로) */
  async function saveCls(key: string, colKey: string, value: string) {
    const field = CLS_OF[colKey]
    if (!field) return
    const next: DefClass = { ...(classes[key] ?? {}), [field]: value }
    qc.setQueryData(['jira-defclass'], (old: { classes?: Record<string, DefClass> } | undefined) => ({
      ...(old ?? {}),
      classes: { ...(old?.classes ?? {}), [key]: next },
    }))
    try {
      const r = await apiFetch('/api/jira/defect/class', {
        method: 'POST',
        body: JSON.stringify({ key, class: next }),
      })
      const j = (await r.json()) as { ok?: boolean; class?: DefClass }
      /* 서버는 **발생상황에 안 맞는 값을 걸러 낸다** — 돌려받은 것을 그대로 쓰고, 떨어졌으면 왜 그런지 말해 준다 */
      if (j.ok && j.class) {
        const got = String(j.class[field] ?? '')
        qc.setQueryData(['jira-defclass'], (old: { classes?: Record<string, DefClass> } | undefined) => ({
          ...(old ?? {}),
          classes: { ...(old?.classes ?? {}), [key]: j.class as DefClass },
        }))
        if (value && got !== value) {
          setFlash(`「${value}」 는 ${next.source || '이 발생상황'} 에는 쓰지 않는 값이라 저장되지 않았습니다`)
          window.setTimeout(() => setFlash(''), 6000)
        }
      }
    } catch {
      setFlash('분류를 저장하지 못했습니다')
    }
  }
  const onPut = useCallback((r: EfRow, c: EfColumn, v: unknown) => {
    if (CLS_OF[c.id]) void saveCls(String(r.issuekey ?? ''), c.id, v == null ? '' : String(v))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes])
  const onOpen = useCallback((r: EfRow) => setSel(String(r.issuekey ?? '')), [])

  /** 지라에 있는 칸 전부 — 열 때만 부른다(246 개, 서버가 30 분 담아 둔다) */
  const fldQuery = useQuery({
    queryKey: ['jira-fields'],
    enabled: fldOpen,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const r = await apiFetch('/api/jira/fields')
      return (await r.json()) as { ok?: boolean; fields?: JiraField[]; error?: string }
    },
  })
  /** 이미 열로 서 있는 것은 목록에서 뺀다 */
  const fldList = useMemo(() => {
    const have = new Set(allCols.map((c) => c.key))
    const q = fldQ.trim().toLowerCase()
    return (fldQuery.data?.fields ?? [])
      .filter((f) => !have.has(f.id))
      .filter((f) => !q || `${f.name} ${f.id}`.toLowerCase().includes(q))
      .slice(0, 300)
  }, [fldQuery.data, allCols, fldQ])

  const isAdmin = isAdminUser(me)

  /** 칸을 더하거나 뺀다 — **온 서버 공용**이라 관리자만 */
  async function saveExtras(next: ExtraCol[]) {
    try {
      const r = await apiFetch('/api/jira/columns', {
        method: 'POST',
        body: JSON.stringify({ columns: next }),
      })
      const j = (await r.json()) as { ok?: boolean; detail?: string; columns?: ExtraCol[] }
      if (!j.ok) {
        setFlash(`칸을 저장하지 못했습니다 — ${j.detail ?? '권한을 확인하세요'}`)
        return
      }
      await qc.invalidateQueries({ queryKey: ['jira-extracols'] })
      setFlash('칸을 더했습니다 — 이미 받아 둔 이슈에는 값이 아직 없습니다. 「값 채우기」 를 누르면 이 칸만 지라에서 받아옵니다.')
    } catch (e) {
      setFlash(`칸을 저장하지 못했습니다 — ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  /** 더한 칸의 값을 이미 받아 둔 이슈에 채운다 */
  async function backfill() {
    if (!picked.length || busy) return
    setBusy(true)
    setFlash('● 더한 칸의 값을 지라에서 받는 중… 건수에 따라 몇 분 걸립니다')
    try {
      const r = await apiFetch('/api/jira/issues/backfill', {
        method: 'POST',
        body: JSON.stringify({ projects: picked }),
      })
      const j = (await r.json()) as { ok?: boolean; error?: string; filled?: number; ms?: number; message?: string }
      setFlash(
        j.ok
          ? j.message
            ? `● ${j.message}`
            : `● ${j.filled ?? 0}건에 값을 채웠습니다 (${j.ms ?? 0}ms)`
          : `값 채우기 실패 — ${j.error ?? '알 수 없는 까닭'}`,
      )
      void qc.invalidateQueries({ queryKey: ['jira-issues'] })
      window.setTimeout(() => setFlash(''), 8000)
    } catch (e) {
      setFlash(`값 채우기 실패 — ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const syncMark = issQuery.data?.sync ?? {}
  const lastAt = Object.values(syncMark)
    .map((m) => m?.at || '')
    .filter(Boolean)
    .sort()
    .pop()

  const prjList = projects.filter(
    (p) => !prjQ.trim() || `${p.key} ${p.name}`.toLowerCase().includes(prjQ.trim().toLowerCase()),
  )
  const prjName = (k: string) => projects.find((p) => p.key === k)?.name ?? ''

  /** 제목 줄 오른쪽 — 마지막 받은 때 · LLM 분류 · 전체 다시 · Sync(예전 위쪽 줄 그대로) */
  const headRight = (
    <span className="jri-hr">
      {!!lastAt && (
        <span className="jri-last" title="마지막으로 지라에서 받아 온 때">
          {String(lastAt).slice(0, 16).replace('T', ' ')} 받음
        </span>
      )}
      <span className="jri-clswrap">
        <button
          type="button"
          className="ef-btn gh"
          disabled={!rows.length || busy}
          title="이슈 내용을 읽어 발생상황·장비·카테고리로 가릅니다 (SETUP › 용도별 프롬프트 › Jira-분류)"
          onClick={(e) => {
            e.stopPropagation()
            setClsAsk((v) => !v)
          }}
        >
          <TI n="sparkles" /> LLM 분류
        </button>
        {clsAsk && (
          <>
            <span className="jri-veil" onClick={() => setClsAsk(false)} aria-hidden="true" />
            <span className="jri-clspop" onClick={(e) => e.stopPropagation()}>
              <b>
                {checked.length ? `고른 ${checked.length}건` : `이 목록 ${rows.length}건`}
                {clsTargets.length > CLS_CAP ? ` 가운데 앞 ${CLS_CAP}건` : ''}
              </b>
              <span>{clsUndone ? `아직 안 가른 것이 ${clsUndone}건 있습니다.` : '모두 한 번씩 갈라 두었습니다.'}</span>
              <span className="jri-clsbtns">
                <button type="button" className="btn small" onClick={() => void classify(false)}>
                  안 가른 것만
                </button>
                <button type="button" className="btn small primary" onClick={() => void classify(true)}>
                  전부 다시
                </button>
              </span>
            </span>
          </>
        )}
      </span>
      <button
        type="button"
        className="ef-btn gh"
        disabled={!picked.length || busy}
        title="처음부터 다시 받습니다 — 오래 걸립니다"
        onClick={() => void sync(true)}
      >
        전체 다시
      </button>
      <button
        type="button"
        className="ef-btn"
        disabled={!picked.length || busy}
        title="마지막으로 받은 뒤에 바뀐 것만 받습니다"
        onClick={() => void sync(false)}
      >
        <TI n="refresh" /> {busy ? '받는 중…' : 'Sync'}
      </button>
    </span>
  )

  return (
    // 바깥 흰 판 없이 카드 두 장(목록 · 본문) — Effort Plan · REQ-Coverage 와 같은 꼴
    <section className="ef jri-ef">
      {!!flash && <div className="jri-toast">{flash}</div>}
      <div className="ef-layout" ref={layoutRef}>
        {!sideHide && (
          <>
            <aside className="ef-side" style={{ flex: `0 0 ${sideW}px` }}>
              <div className="ef-tree-hd">
                <span>프로젝트</span>
                {/* 프로젝트 고르기 — 245 개 중 몇 개다. 고른 것만 받고(Sync) 목록에 선다 */}
                <span className="jri-prjwrap">
                  <button
                    type="button"
                    className="ef-tadd"
                    title="프로젝트 고르기"
                    aria-haspopup="listbox"
                    aria-expanded={prjOpen}
                    onClick={(e) => {
                      e.stopPropagation()
                      setPrjOpen((v) => !v)
                    }}
                  >
                    <TI n="plus" />
                  </button>
                  {prjOpen && (
                    <>
                      <span className="jri-veil" onClick={() => setPrjOpen(false)} aria-hidden="true" />
                      <span className="jri-prjpop" role="listbox">
                        <input
                          autoFocus
                          value={prjQ}
                          placeholder="프로젝트 키 · 이름 찾기"
                          onChange={(e) => setPrjQ(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span className="jri-prjlist">
                          {prjList.slice(0, 200).map((p) => {
                            const on = picked.includes(p.key)
                            return (
                              <button
                                key={p.key}
                                type="button"
                                className={on ? 'on' : ''}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setPicked((v) => (on ? v.filter((x) => x !== p.key) : [...v, p.key]))
                                }}
                              >
                                <i aria-hidden="true">{on ? '✓' : ''}</i>
                                <b>{p.key}</b>
                                <span>{p.name}</span>
                              </button>
                            )
                          })}
                          {!prjList.length && <span className="jri-none">맞는 프로젝트가 없습니다</span>}
                        </span>
                        {!!picked.length && (
                          <span className="jri-prjft">
                            <button type="button" onClick={() => setPicked([])}>
                              모두 해제
                            </button>
                          </span>
                        )}
                      </span>
                    </>
                  )}
                </span>
              </div>
              <div className="ef-tree" role="tree" aria-label="프로젝트 목록">
                {picked.length > 1 && (
                  <div className={`ef-tn${!curOk ? ' on' : ''}`} role="treeitem" aria-selected={!curOk} onClick={() => pickCur('')}>
                    <span className="ef-tn-tw" />
                    <span className="ef-tn-ic">
                      <TI n="layout-list" />
                    </span>
                    <span className="ef-tn-name">전체</span>
                    <em className="ef-tn-n">{baseRows.length}</em>
                  </div>
                )}
                {picked.map((k) => (
                  <div
                    key={k}
                    className={`ef-tn${curOk === k || (picked.length === 1 && !curOk) ? ' on' : ''}`}
                    role="treeitem"
                    aria-selected={curOk === k}
                    title={prjName(k)}
                    onClick={() => pickCur(k)}
                  >
                    <span className="ef-tn-tw" />
                    <span className="ef-tn-ic">
                      <TI n="table" />
                    </span>
                    <span className="ef-tn-name">{k}</span>
                    <em className="ef-tn-n">{counts.get(k) ?? 0}</em>
                    <button
                      type="button"
                      className="jri-prm"
                      title="목록에서 빼기(받아 둔 이슈는 DB 에 그대로)"
                      aria-label={`${k} 빼기`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setPicked((v) => v.filter((x) => x !== k))
                        if (curOk === k) pickCur('')
                      }}
                    >
                      <TI n="x" />
                    </button>
                  </div>
                )).flatMap((node, i) => {
                  // 프로젝트 아래 한 줄 — 고른 이슈 유형(누르면 고르기 창)
                  const k = picked[i]!
                  const ts = types[k] ?? []
                  return [
                    node,
                    <button
                      key={k + '-ty'}
                      type="button"
                      className={`jri-tyrow${ts.length ? ' on' : ''}`}
                      title="이 프로젝트에서 보고 받아 올 이슈 유형 고르기"
                      onClick={(e) => {
                        const r = e.currentTarget.getBoundingClientRect()
                        setTyPop({ prj: k, x: r.left, y: r.bottom + 4, pick: [...ts] })
                      }}
                    >
                      <TI n="filter" />
                      <span>유형: {ts.length ? (ts.length === 1 ? ts[0] : `${ts[0]} 외 ${ts.length - 1}`) : '전체'}</span>
                    </button>,
                  ]
                })}
                {!picked.length && <div className="jri-side-empty">「＋」 로 볼 프로젝트를 고르세요</div>}
              </div>
            </aside>
            <Resizer
              label="목록 폭 조절"
              onResize={setSideW}
              getOrigin={() => layoutRef.current?.querySelector('.ef-side')?.getBoundingClientRect().left ?? 0}
            />
          </>
        )}
        <EffortBody
          key={curOk || 'all'}
          d={doc}
          name=""
          path={[]}
          ver={ver}
          touch={touch}
          redraw={touch}
          toast={toast}
          save="idle"
          retry={() => {}}
          sideHide={sideHide}
          onToggleSide={toggleSide}
          host={{
            title: (
              <>
                <b>Jira Issue</b>
                <span className="ef-head-sep">·</span>
                <span className="ef-head-name" title={curOk ? prjName(curOk) : picked.join(', ')}>
                  {curOk || (picked.length ? (picked.length === 1 ? picked[0] : `전체 ${picked.length}개`) : '프로젝트를 고르세요')}
                </span>
                {issQuery.isLoading && <span className="jri-last">읽는 중…</span>}
              </>
            ),
            headRight,
            toolRight: (
              <button
                type="button"
                className="ef-btn gh"
                title="지라에 있는 칸을 열로 더합니다(관리자)"
                onClick={() => {
                  setFldQ('')
                  setFldOpen(true)
                }}
              >
                <TI n="plus" /> 지라 칸{extras.length ? ` ${extras.length}` : ''}
              </button>
            ),
            viewTypes: ['table', 'chart'],
            csvName: `Jira_${curOk || picked.join('_') || 'issues'}.csv`,
            onOpen,
            onPut,
            onCheck,
            pageSize: 200,
          }}
        />
      </div>

      {/* 이슈 유형 고르기 — 고른 유형만 보이고, Sync 도 그것만 받는다(지시). 하나도 안 고르면 전부 */}
      {tyPop && (
        <>
          <span className="jri-veil" onClick={() => setTyPop(null)} aria-hidden="true" />
          <div className="jri-typop" style={{ left: tyPop.x, top: tyPop.y }} role="dialog" aria-label={`${tyPop.prj} 이슈 유형`}>
            <b>{tyPop.prj} · 이슈 유형</b>
            <span className="jri-tyhint">고른 유형만 보이고, Sync 도 그것만 받습니다</span>
            <div className="jri-tylist">
              {tyQuery.isLoading && !tyList.length && <span className="jri-none">지라에서 유형을 읽는 중…</span>}
              {tyList.map(([t, n]) => {
                const on = tyPop.pick.includes(t)
                return (
                  <label key={t} className={on ? 'on' : ''}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => setTyPop({ ...tyPop, pick: on ? tyPop.pick.filter((x) => x !== t) : [...tyPop.pick, t] })}
                    />
                    <span>{t}</span>
                    <em>{n ? `${n}건` : '아직 안 받음'}</em>
                  </label>
                )
              })}
            </div>
            <div className="jri-tyft">
              <button type="button" className="btn small" onClick={() => setTyPop({ ...tyPop, pick: [] })}>
                전체로
              </button>
              <span className="sp" />
              <button
                type="button"
                className="btn small primary"
                onClick={() => {
                  const k = tyPop.prj
                  const pick = tyPop.pick
                  setTypes((m) => {
                    const n = { ...m }
                    if (pick.length) n[k] = pick
                    else delete n[k]
                    return n
                  })
                  setTyPop(null)
                  const notYet = pick.filter((t) => !baseRows.some((r) => prjOf(r) === k && String(r.issuetype ?? '') === t))
                  setFlash(
                    notYet.length
                      ? `${k} — ${notYet.join(', ')} 은(는) 아직 받지 않았습니다. 위의 Sync 를 누르면 받아 옵니다`
                      : `${k} — ${pick.length ? pick.join(', ') + ' 만' : '모든 유형을'} 보고 받아 옵니다`,
                  )
                  window.setTimeout(() => setFlash(''), 6000)
                }}
              >
                적용
              </button>
            </div>
          </div>
        </>
      )}

      {/* 지라 칸 더하기 — 지라에 칸이 이백사십여 개다. **볼 것만 골라** 세운다. 고른 것은 온 서버에 한 벌이라
          (Sync·받아 둔 자료도 한 벌) 더하는 것은 관리자만 한다. */}
      {fldOpen && (
        <div className="jri-back" onMouseDown={() => setFldOpen(false)}>
          <div className="jri-fld" onMouseDown={(e) => e.stopPropagation()}>
            <header>
              <b>지라 칸 더하기</b>
              <span className="sp" />
              <button type="button" title="닫기" onClick={() => setFldOpen(false)}>
                ✕
              </button>
            </header>
            {!!extras.length && (
              <div className="jri-fldon">
                {extras.map((e) => (
                  <span key={e.id} className="jri-fldchip">
                    {e.label}
                    {isAdmin && (
                      <i title="빼기" onClick={() => void saveExtras(extras.filter((x) => x.id !== e.id))}>
                        ✕
                      </i>
                    )}
                  </span>
                ))}
              </div>
            )}
            <input autoFocus value={fldQ} placeholder="칸 이름 찾기" onChange={(e) => setFldQ(e.target.value)} />
            <div className="jri-fldlist">
              {fldQuery.isLoading && <div className="jri-none">지라에서 칸 목록을 읽는 중…</div>}
              {!fldQuery.isLoading && !fldList.length && <div className="jri-none">맞는 칸이 없습니다</div>}
              {fldList.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  disabled={!isAdmin}
                  title={isAdmin ? '이 칸을 열로 세웁니다' : '관리자만 더할 수 있습니다'}
                  onClick={() => void saveExtras([...extras, { id: f.id, label: f.name || f.id, type: f.type, items: f.items }])}
                >
                  <span>{f.name || f.id}</span>
                  <em>{f.type || 'string'}</em>
                  <b>{f.custom ? f.id : '붙박이'}</b>
                </button>
              ))}
            </div>
            <footer>
              {isAdmin ? (
                <span>
                  더한 칸은 <b>모두에게</b> 보입니다 — 새 열은 숨김으로 서고, 볼 사람이 「숨긴 열」 에서 켭니다.
                </span>
              ) : (
                <span>칸을 더하는 것은 관리자만 합니다 — 모두의 Sync 가 무거워지는 일입니다.</span>
              )}
              <button
                type="button"
                className="btn small"
                disabled={!extras.length || !picked.length || busy}
                title="더한 칸의 값을 이미 받아 둔 이슈에 채웁니다"
                onClick={() => void backfill()}
              >
                값 채우기
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* 키를 누르면 그 이슈 — **예전과 같은 서랍**(지시: 그대로 유지). 지라에 없는 우리 값(분류 다섯)만 extra 로 */}
      {!!sel && (
        <IssueDrawer
          ikey={sel}
          base={jbase}
          onClose={() => setSel('')}
          extra={
            <>
              <h4 className="rls-dh">분류</h4>
              <div className="rls-dmeta">
                {CLS_ROWS.map(([lb, k]) => (
                  <div className="rls-fld" key={k}>
                    <span>{lb}</span>
                    <b>{String((classes[sel] ?? {})[CLS_OF[k] as keyof DefClass] ?? '') || '없음'}</b>
                  </div>
                ))}
              </div>
            </>
          }
        />
      )}
    </section>
  )
}
