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
 * 왼쪽 목록은 Effort Plan 과 같은 **폴더 ▸ 페이지**다(지시). 페이지마다 프로젝트·이슈 유형·이슈단계를
 * 제목 줄의 고르개 셋으로 고르고, Sync 는 그 페이지의 프로젝트·유형만 받는다 — 필요한 것만.
 * 이슈단계는 **보기만 거른다**: 단계는 이슈가 진행하며 바뀌어, 받을 때 거르면 단계를 넘긴 이슈가 옛 값으로 남는다.
 *
 * 열 배치·폭·보기(탭마다 검색·필터·정렬·그룹·숨긴 열·계산)는 계정을 따라간다(utop.jira.ef) — 페이지가 함께 쓴다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, type MeUser, isAdminUser } from '@/api/client'
import { prefGet, prefSet } from '@/lib/prefs'
import Resizer, { useResizableWidth } from '@/components/Resizer'
import { IssueDrawer } from '@/components/jira/IssueDrawer'
import { useJiraBase } from '@/components/jira/useJiraBase'
import { EffortBody } from '@/pages/EffortPlan'
import EffortTree, { type TreeKit } from '@/components/effort/EffortTree'
import { TI } from '@/components/effort/icons'
import { ensureViews, newId, type EfColumn, type EfDoc, type EfNode, type EfRow, type EfView } from '@/components/effort/model'
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

/** 사람 칸(등록자·담당자) — 지라에 담긴 것은 아이디라, 표에는 「성+이름」(지시) */
const PERSON_KEYS = ['reporter', 'assignee'] as const
/** 지라 표시 이름에서 성+이름만 — 「김형일 책임」·「김형일(검증)」 이면 김형일. 한글 이름이 아니면 표시 이름 그대로 */
const personName = (dn: string) => {
  const t = dn.trim()
  const m = /^([가-힣]{2,5})(?=$|[\s(（/_·,.-])/.exec(t)
  return m ? m[1]! : t
}

/* 프로젝트는 「프로젝트」 값으로 가른다 — 키 앞글자가 프로젝트와 다른 것이 있다(E6100 의 P88-4340) */
const prjOf = (r: EfRow) => String(r.project ?? '')

/** 한 번에 가를 수 있는 최대 — 로컬 LLM 이 한 건에 1~2초다. 이백이면 한 잔 마실 참 */
const CLS_CAP = 200

/* 예전 「고른 프로젝트」·「프로젝트마다 고른 유형」 — 처음 한 번 페이지로 옮겨 받는다 */
const PRJ_KEY = 'utop.jira.projects'
const TYPES_KEY = 'utop.jira.types'
/** 폴더 ▸ 페이지 목록과 페이지마다 고른 것 — 계정을 따라간다(SYNC) */
const TREE_KEY = 'utop.jira.tree'
/** 열 배치·폭·보기 — 계정을 따라간다(SYNC) */
const LAYOUT_KEY = 'utop.jira.ef'
/** 지금 보는 페이지 — 이 PC 의 보던 자리(SYNC 아님) */
const CUR_KEY = 'utop.jira.cur'
/* 예전 NTable 화면의 열 숨김·폭·차례 — 처음 한 번 새 양식으로 옮겨 받는다 */
const OLD_COL_KEY = 'utop.jira.cols'
const OLD_W_KEY = 'utop.jira.w'
const OLD_ORD_KEY = 'utop.jira.order'

/** 페이지 하나 — 볼 프로젝트 · 이슈 유형 · 이슈단계(빈 배열이면 전부) */
interface JPage {
  prj: string[]
  types: string[]
  stages: string[]
}
interface JTree {
  nodes: EfNode[]
  pages: Record<string, JPage>
}
const blankPage = (): JPage => ({ prj: [], types: [], stages: [] })
/** 이 행이 페이지에 드는가 — 단계는 빼고 볼 수 있다(단계 고르개의 건수) */
const inPage = (p: JPage, r: EfRow, noStage = false) =>
  p.prj.includes(prjOf(r)) &&
  (!p.types.length || p.types.includes(String(r.issuetype ?? ''))) &&
  (noStage || !p.stages.length || p.stages.includes(String(r.stage ?? '')))
/** 떠 있는 창의 왼쪽 — 창 폭(w)이 화면 오른쪽 끝을 넘지 않게 */
const fitX = (left: number, w: number) => Math.max(8, Math.min(left, window.innerWidth - w - 12))
/** 고르개 글 — 하나·둘이면 그대로, 많으면 「첫째 외 n」 */
const chipTxt = (vs: string[], none = '전체') => (!vs.length ? none : vs.length <= 2 ? vs.join(', ') : `${vs[0]} 외 ${vs.length - 1}`)

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

/** 목록을 꺼낸다 — 처음이면 예전에 고른 프로젝트를 프로젝트마다 한 페이지로(고른 유형도 함께) */
function loadTree(): JTree {
  const t = prefJson<JTree | null>(TREE_KEY, null)
  if (t && Array.isArray(t.nodes)) return { nodes: t.nodes, pages: t.pages ?? {} }
  const picked = prefJson<unknown>(PRJ_KEY, [])
  const types = prefJson<Record<string, string[]>>(TYPES_KEY, {})
  const out: JTree = { nodes: [], pages: {} }
  ;(Array.isArray(picked) ? (picked as string[]) : []).forEach((k) => {
    const id = 't' + newId()
    out.nodes.push({ id, kind: 'table', name: k, parent: null })
    out.pages[id] = { prj: [k], types: types[k] ?? [], stages: [] }
  })
  if (!out.nodes.length) {
    const id = 't' + newId()
    out.nodes.push({ id, kind: 'table', name: '새 페이지', parent: null })
    out.pages[id] = blankPage()
  }
  return out
}

export default function JiraIssues({ me }: { me?: MeUser | null }) {
  const qc = useQueryClient()
  const jbase = useJiraBase()
  /* 목록(폴더 ▸ 페이지) — EffortTree 가 nodes·cur 를 제자리에서 고친다. 페이지 속(고른 것)은 pagesRef */
  const treeRef = useRef<EfDoc | null>(null)
  const pagesRef = useRef<Record<string, JPage>>({})
  if (!treeRef.current) {
    const t = loadTree()
    pagesRef.current = t.pages
    const saved = prefGet(CUR_KEY) || ''
    const cur0 = t.nodes.some((n) => n.id === saved && n.kind === 'table') ? saved : (t.nodes.find((n) => n.kind === 'table')?.id ?? '')
    treeRef.current = { columns: [], pages: {}, efTree: { nodes: t.nodes, cur: cur0 } }
  }
  const tdoc = treeRef.current
  const [tver, setTver] = useState(0)
  /** 목록·페이지를 고쳤다 — 계정 설정에 적고 다시 그린다 */
  const treeTouch = useCallback(() => {
    const t = treeRef.current!.efTree!
    prefSet(TREE_KEY, JSON.stringify({ nodes: t.nodes, pages: pagesRef.current }))
    prefSet(CUR_KEY, t.cur)
    setTver((v) => v + 1)
  }, [])
  /** 페이지만 옮겼다(접고 펴기 포함) — 보던 자리만 적는다 */
  const treeRedraw = useCallback(() => {
    prefSet(CUR_KEY, treeRef.current!.efTree!.cur)
    setTver((v) => v + 1)
  }, [])
  const curId = tdoc.efTree!.cur
  const curNode = tdoc.efTree!.nodes.find((n) => n.id === curId && n.kind === 'table')
  const page: JPage | null = curNode ? (pagesRef.current[curId] ??= blankPage()) : null
  const pageName = curNode?.name ?? ''
  const prj = page?.prj ?? []
  const setPage = (p: Partial<JPage>) => {
    if (!curNode) return
    pagesRef.current[curId] = { ...(page ?? blankPage()), ...p }
    treeTouch()
  }
  /** 모든 페이지의 프로젝트 — 한 번에 읽어 페이지마다 가른다(목록 숫자도 이것으로) */
  const allPrj = useMemo(
    () => [...new Set(Object.values(pagesRef.current).flatMap((p) => p.prj))].sort(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tver],
  )
  /** 제목 줄 고르개 창 — 프로젝트 / 유형·단계 */
  const [prjPop, setPrjPop] = useState<{ x: number; y: number } | null>(null)
  const [pickPop, setPickPop] = useState<{ kind: 'type' | 'stage'; x: number; y: number; pick: string[] } | null>(null)
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
    queryKey: ['jira-issues', allPrj.join(',')],
    enabled: allPrj.length > 0,
    queryFn: async () => {
      // 서버 기본은 2,000건에서 자른다 — 표가 200건씩 「더 보기」 로 그리므로 서버 한도(20,000)까지 받는다
      const r = await apiFetch(`/api/jira/issues?projects=${encodeURIComponent(allPrj.join(','))}&limit=20000`)
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
  /* 사람 이름 — 받아 둔 이슈의 아이디들을 서버에 물어(서버가 지라에 한 번 묻고 담아 둔다) 칸 값을 이름으로 바꾼다.
     아이디는 _id 칸에 남긴다. 이름을 모르면 아이디 그대로 */
  const personIds = useMemo(() => {
    const set = new Set<string>()
    baseRows.forEach((r) => PERSON_KEYS.forEach((k) => {
      const id = String(r[k + '_id'] ?? r[k] ?? '').trim()
      if (id) set.add(id)
    }))
    return [...set].sort()
  }, [baseRows])
  const nameQuery = useQuery({
    queryKey: ['jira-usernames', personIds.join(',')],
    enabled: personIds.length > 0,
    staleTime: 60 * 60_000,
    queryFn: async () => {
      const r = await apiFetch('/api/jira/usernames', { method: 'POST', body: JSON.stringify({ ids: personIds }) })
      return (await r.json()) as { ok?: boolean; names?: Record<string, string> }
    },
  })
  useEffect(() => {
    const names = nameQuery.data?.names
    if (!names) return
    baseRows.forEach((r) =>
      PERSON_KEYS.forEach((k) => {
        const id = String(r[k + '_id'] ?? r[k] ?? '').trim()
        if (!id) return
        r[k + '_id'] = id
        r[k] = names[id] ? personName(names[id]) : id
      }),
    )
    setVer((v) => v + 1)
  }, [baseRows, nameQuery.data])
  /** 이 페이지의 행 — 프로젝트 · 유형 · 단계 */
  const rows = useMemo(
    () => (page ? baseRows.filter((r) => inPage(page, r)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseRows, tver, curId],
  )
  /** 목록 숫자 — 페이지마다 든 행 수 */
  const pageCounts = useMemo(() => {
    const m = new Map<string, number>()
    Object.entries(pagesRef.current).forEach(([id, p]) => m.set(id, p.prj.length ? baseRows.filter((r) => inPage(p, r)).length : 0))
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseRows, tver])
  const kit: TreeKit = {
    noun: '페이지',
    count: (id) => pageCounts.get(id) ?? 0,
    make: (id, from) => {
      const src = from ? pagesRef.current[from] : undefined
      pagesRef.current[id] = src ? (JSON.parse(JSON.stringify(src)) as JPage) : blankPage()
    },
    ask: (id) => `「${tdoc.efTree!.nodes.find((n) => n.id === id)?.name ?? ''}」 페이지를 지울까요?\n\n받아 둔 이슈는 UTOP DB 에 그대로 남습니다.`,
    drop: (id) => {
      delete pagesRef.current[id]
    },
  }
  /** 유형 고르개 목록 — 지라가 이 프로젝트들에 둔 유형(만들 수 있는 것) + 받아 둔 이슈에 있는 유형 */
  const tyQuery = useQuery({
    queryKey: ['jira-issuetypes', prj.join(',')],
    enabled: pickPop?.kind === 'type' && prj.length > 0,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const got = await Promise.all(
        prj.map(async (k) => {
          const r = await apiFetch(`/api/jira/issuetypes?project=${encodeURIComponent(k)}`)
          const j = (await r.json()) as { issuetypes?: Array<{ name?: string }> }
          return (j.issuetypes ?? []).map((t) => t.name ?? '')
        }),
      )
      return [...new Set(got.flat().filter(Boolean))]
    },
  })
  /** 고르개 창 목록 — [값, 받아 둔 건수]. 단계는 고른 유형 안에서 센다 */
  const pickList = useMemo(() => {
    if (!pickPop || !page) return [] as Array<[string, number]>
    const n = new Map<string, number>()
    const key = pickPop.kind === 'type' ? 'issuetype' : 'stage'
    const scope: JPage = pickPop.kind === 'type' ? { prj: page.prj, types: [], stages: [] } : page
    baseRows.forEach((r) => {
      if (!inPage(scope, r, true)) return
      const v = String(r[key] ?? '')
      n.set(v, (n.get(v) ?? 0) + 1)
    })
    if (pickPop.kind === 'type') (tyQuery.data ?? []).forEach((t) => !n.has(t) && n.set(t, 0))
    n.delete('')
    return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickPop, baseRows, tyQuery.data, tver, curId])
  const openPick = (kind: 'type' | 'stage', el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    setPickPop({ kind, x: fitX(r.left, 280), y: r.bottom + 4, pick: [...((kind === 'type' ? page?.types : page?.stages) ?? [])] })
  }

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
    if (!page || !prj.length || busy) return
    setBusy(true)
    setFlash('')
    try {
      const r = await apiFetch('/api/jira/issues/sync', {
        method: 'POST',
        // 이 페이지의 프로젝트 · 고른 유형만 받는다(지시: 필요한 것만) — 서버는 유형마다 마지막 받은 시각을 따로 둔다
        body: JSON.stringify({ projects: prj, full, types: page.types.length ? Object.fromEntries(prj.map((k) => [k, page.types])) : {} }),
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
  /**
   * 고른 행 삭제(지시: 해제 오른쪽) — **UTOP 에 받아 둔 복사본만** 지운다. 지라는 그대로.
   * 온 서버에 한 벌이라 관리자만. 분류는 남겨 다시 받으면 되살아난다
   */
  async function delRows(rs: EfRow[]) {
    const keys = rs.map((r) => String(r.issuekey ?? '')).filter(Boolean)
    if (!keys.length || busy) return
    if (!isAdminUser(me)) {
      setFlash('받아 둔 이슈를 지우는 것은 관리자만 합니다 — 모두가 함께 보는 자료입니다')
      window.setTimeout(() => setFlash(''), 5000)
      return
    }
    if (
      !window.confirm(
        `고른 ${keys.length}건을 UTOP 에서 지웁니다.\n\n· 지라의 이슈는 그대로입니다\n· 지라에서 그 이슈가 바뀌거나 「전체 다시」 를 누르면 다시 들어옵니다\n· 매겨 둔 분류는 남겨 두어 다시 받으면 되살아납니다\n\n지울까요?`,
      )
    )
      return
    setBusy(true)
    try {
      const r = await apiFetch('/api/jira/issues/delete', { method: 'POST', body: JSON.stringify({ keys }) })
      const j = (await r.json()) as { ok?: boolean; deleted?: number; error?: string; detail?: string }
      if (!r.ok || !j.ok) {
        setFlash(`지우지 못했습니다 — ${j.error ?? j.detail ?? r.status}`)
        return
      }
      setFlash(`● UTOP 에서 ${j.deleted ?? 0}건을 지웠습니다 (지라는 그대로)`)
      await qc.invalidateQueries({ queryKey: ['jira-issues'] })
      window.setTimeout(() => setFlash(''), 6000)
    } catch (e) {
      setFlash(`지우지 못했습니다 — ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }
  const onDelete = useCallback((rs: EfRow[]) => void delRows(rs), // eslint-disable-next-line react-hooks/exhaustive-deps
    [busy, me])

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
    if (!prj.length || busy) return
    setBusy(true)
    setFlash('● 더한 칸의 값을 지라에서 받는 중… 건수에 따라 몇 분 걸립니다')
    try {
      const r = await apiFetch('/api/jira/issues/backfill', {
        method: 'POST',
        body: JSON.stringify({ projects: prj }),
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
  // 이 페이지의 프로젝트 것만 — 표시는 「P106」·「P106::Defect」 둘 다다
  const lastAt = Object.entries(syncMark)
    .filter(([k]) => prj.includes(k.split('::')[0]!))
    .map(([, m]) => m?.at || '')
    .filter(Boolean)
    .sort()
    .pop()

  const prjList = projects.filter(
    (p) => !prjQ.trim() || `${p.key} ${p.name}`.toLowerCase().includes(prjQ.trim().toLowerCase()),
  )

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
        disabled={!prj.length || busy}
        title="처음부터 다시 받습니다 — 오래 걸립니다"
        onClick={() => void sync(true)}
      >
        전체 다시
      </button>
      <button
        type="button"
        className="ef-btn"
        disabled={!prj.length || busy}
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
            <EffortTree root={tdoc} touch={treeTouch} redraw={treeRedraw} toast={toast} width={sideW} kit={kit} />
            <Resizer
              label="목록 폭 조절"
              onResize={setSideW}
              getOrigin={() => layoutRef.current?.querySelector('.ef-side')?.getBoundingClientRect().left ?? 0}
            />
          </>
        )}
        <EffortBody
          key={curId || 'none'}
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
                {/* 고르개 셋(지시: 제목 자리에 프로젝트 · 유형 옆에 이슈단계) — 이 페이지가 볼 것 */}
                <button
                  type="button"
                  className={`jri-tysel jri-prjsel${prj.length ? ' on' : ''}`}
                  aria-haspopup="listbox"
                  title={page ? '이 페이지에서 볼 프로젝트 고르기' : '왼쪽 「＋」 로 페이지를 먼저 만드세요'}
                  disabled={!page}
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect()
                    setPrjQ('')
                    setPrjPop({ x: fitX(r.left, 340), y: r.bottom + 4 })
                  }}
                >
                  <TI n="table" />
                  <span className="jri-tysel-l">프로젝트</span>
                  <span className="jri-tysel-v">{chipTxt(prj, '고르세요')}</span>
                  <TI n="chevron-down" />
                </button>
                {prj.length > 0 && (
                  <>
                    <button
                      type="button"
                      className={`jri-tysel${page?.types.length ? ' on' : ''}`}
                      aria-haspopup="dialog"
                      title="보고 받아 올 이슈 유형 고르기 — Sync 도 이것만 받습니다"
                      onClick={(e) => openPick('type', e.currentTarget)}
                    >
                      <TI n="filter" />
                      <span className="jri-tysel-l">이슈 유형</span>
                      <span className="jri-tysel-v">{chipTxt(page?.types ?? [])}</span>
                      <TI n="chevron-down" />
                    </button>
                    <button
                      type="button"
                      className={`jri-tysel${page?.stages.length ? ' on' : ''}`}
                      aria-haspopup="dialog"
                      title="볼 이슈단계 고르기 — 보기만 거릅니다(Sync 는 프로젝트·유형으로)"
                      onClick={(e) => openPick('stage', e.currentTarget)}
                    >
                      <TI n="filter" />
                      <span className="jri-tysel-l">이슈단계</span>
                      <span className="jri-tysel-v">{chipTxt(page?.stages ?? [])}</span>
                      <TI n="chevron-down" />
                    </button>
                  </>
                )}
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
            csvName: `Jira_${pageName || prj.join('_') || 'issues'}.csv`,
            onOpen,
            onPut,
            onCheck,
            onDelete,
            pageSize: 200,
          }}
        />
      </div>

      {/* 프로젝트 고르기 — 245 개 중 몇 개다. 고른 것만 이 페이지에 보이고 Sync 로 받는다 */}
      {prjPop && page && (
        <>
          <span className="jri-veil" onClick={() => setPrjPop(null)} aria-hidden="true" />
          <span className="jri-prjpop fx" role="listbox" style={{ left: prjPop.x, top: prjPop.y }}>
            <input autoFocus value={prjQ} placeholder="프로젝트 키 · 이름 찾기" onChange={(e) => setPrjQ(e.target.value)} />
            <span className="jri-prjlist">
              {prjList.slice(0, 200).map((p) => {
                const on = prj.includes(p.key)
                return (
                  <button
                    key={p.key}
                    type="button"
                    className={on ? 'on' : ''}
                    onClick={() => setPage({ prj: on ? prj.filter((x) => x !== p.key) : [...prj, p.key] })}
                  >
                    <i aria-hidden="true">{on ? '✓' : ''}</i>
                    <b>{p.key}</b>
                    <span>{p.name}</span>
                  </button>
                )
              })}
              {prjQuery.isLoading && <span className="jri-none">지라에서 프로젝트를 읽는 중…</span>}
              {!prjQuery.isLoading && !prjList.length && <span className="jri-none">맞는 프로젝트가 없습니다</span>}
            </span>
            {!!prj.length && (
              <span className="jri-prjft">
                <button type="button" onClick={() => setPage({ prj: [] })}>
                  모두 해제
                </button>
              </span>
            )}
          </span>
        </>
      )}

      {/* 이슈 유형 · 이슈단계 고르기 — 유형은 보기와 Sync 둘 다, 단계는 보기만. 하나도 안 고르면 전부 */}
      {pickPop && page && (
        <>
          <span className="jri-veil" onClick={() => setPickPop(null)} aria-hidden="true" />
          <div
            className="jri-typop"
            style={{ left: pickPop.x, top: pickPop.y }}
            role="dialog"
            aria-label={pickPop.kind === 'type' ? '이슈 유형' : '이슈단계'}
          >
            <b>
              {chipTxt(prj)} · {pickPop.kind === 'type' ? '이슈 유형' : '이슈단계'}
            </b>
            <span className="jri-tyhint">
              {pickPop.kind === 'type'
                ? '고른 유형만 보이고, Sync 도 그것만 받습니다'
                : '고른 단계만 보입니다 — 단계는 이슈가 진행하며 바뀌어 Sync 는 거르지 않습니다'}
            </span>
            <div className="jri-tylist">
              {pickPop.kind === 'type' && tyQuery.isLoading && !pickList.length && (
                <span className="jri-none">지라에서 유형을 읽는 중…</span>
              )}
              {pickPop.kind === 'stage' && !pickList.length && <span className="jri-none">받아 둔 이슈에 이슈단계 값이 없습니다</span>}
              {pickList.map(([t, n]) => {
                const on = pickPop.pick.includes(t)
                return (
                  <label key={t} className={on ? 'on' : ''}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => setPickPop({ ...pickPop, pick: on ? pickPop.pick.filter((x) => x !== t) : [...pickPop.pick, t] })}
                    />
                    <span>{t}</span>
                    <em>{n ? `${n}건` : '아직 안 받음'}</em>
                  </label>
                )
              })}
            </div>
            <div className="jri-tyft">
              <button type="button" className="btn small" onClick={() => setPickPop({ ...pickPop, pick: [] })}>
                전체로
              </button>
              <span className="sp" />
              <button
                type="button"
                className="btn small primary"
                onClick={() => {
                  const { kind, pick } = pickPop
                  setPickPop(null)
                  if (kind === 'stage') {
                    setPage({ stages: pick })
                    return
                  }
                  setPage({ types: pick })
                  const notYet = pick.filter((t) => !baseRows.some((r) => prj.includes(prjOf(r)) && String(r.issuetype ?? '') === t))
                  setFlash(
                    notYet.length
                      ? `${notYet.join(', ')} 은(는) 아직 받지 않았습니다. 위의 Sync 를 누르면 받아 옵니다`
                      : `${pick.length ? pick.join(', ') + ' 만' : '모든 유형을'} 보고 받아 옵니다`,
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
                disabled={!extras.length || !prj.length || busy}
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
