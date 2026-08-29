import { useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, categoryApi, projectApi, reqApi, apiFetch, type MeUser } from '@/api/client'
import EditProjectDialog from '@/components/EditProjectDialog'
import MoveCatDialog from '@/components/MoveCatDialog'
import { reqLabel, reqPk, statusClass, type Requirement, type TestCaseMeta } from '@/types'
import { goto, onGoto } from '@/api/goto'
import { fillOf } from '@/lib/fieldFill'
import PickCell from '@/components/PickCell'
import { useCodes } from '@/hooks/useCodes'
import {
  IconChevron,
  IconGrip,
  IconPanel,
  IconParam,
  IconSearch,
  IconSettings,
} from '@/components/icons'
import GlobalParams from '@/components/settings/GlobalParams'
import ListSortBtn, {
  FolderSortBtn,
  type FolderSortMode,
  type ListSortMode,
} from '@/components/ListSortBtn'
import { useInfoCols } from '@/components/useInfoCols'
import ReqForm from '@/components/ReqForm'
import ReqBulkForm from '@/components/ReqBulkForm'
import ReqBulkEdit from '@/components/ReqBulkEdit'
import ReqMapDialog from '@/components/ReqMapDialog'
import TcMapReqDialog from '@/components/tc/TcMapReqDialog'
import TcBulkForm from '@/components/TcBulkForm'
import TcBulkEdit from '@/components/tc/TcBulkEdit'
import CopyDialog from '@/components/CopyDialog'
import { buildTcFile, tcFileName, downloadJson, parseTcFile } from '@/components/tc/portable'
import TcForm from '@/components/TcForm'
import ReqDetail from '@/components/ReqDetail'
import TestCases from '@/pages/TestCases'
import { currentProjects, onProjectChange } from '@/components/ProjectPicker'
import { currentMode, onModeChange, setMode as setSharedMode } from '@/components/ReqTcMode'
import Resizer, { useResizableWidth } from '@/components/Resizer'
/* 요구사항 화면은 지웠지만 그 CSS 는 남아 있고, 끼워 넣은 Coverage 화면이
   거기 사는 규칙(rq-bar·railbox)을 쓴다. 읽던 화면이 없어졌으니 여기서 읽는다 —
   안 읽으면 시험 상세가 모양 없이 무너진다. */
import './Requirements.css'
import './ReqTc.css'

interface Props {
  me?: MeUser | null
}

/** 2열이 무엇을 세나 — 목업에서 고른 「토글」 */
type Mode = 'req' | 'tc'

/**
 * REQ-TC — 요구사항과 시험을 한 화면에서(지시, 목업 확정).
 *
 * **트리는 폴더만, 표는 한 벌, 무엇을 셀지는 토글이 정한다.**
 * 요구사항을 트리에 넣는 안도 있었지만, 그러면 트리가 길어지고(폴더 29 +
 * 요구사항 57) 무엇보다 **요구사항을 표로 관리할 길이 사라진다** — 213 은
 * 57건 중 51건이 미커버라, 훑고 메우려면 정렬·거르기·여러 개 고르기가 되는
 * 표가 있어야 한다. 대신 「요구사항 줄을 누르면 그 시험으로 좁혀지는」 다리를
 * 놓아, 트리에 넣었을 때 얻으려던 흐름을 그대로 얻는다.
 *
 * **사업자·모델그룹·모델명은 프로젝트가 정본**(지시). 시험은 제 값을 갖고
 * 있으므로 그것을 먼저 쓰고, 없으면 프로젝트 값으로 채운다.
 *
 * **읽고 고치기만 한다. 구조는 안 바꾼다.** 이미 있는 API 만 읽고, 고칠 때는
 * 이미 있는 부품(ReqForm·TcForm)을 부른다 — 편집기를 두 벌 만들면 한쪽만
 * 고치는 날이 온다. 기존 Requirements·Coverage 화면은 손대지 않는다(지시).
 */
/**
 * 낼 쪽 번호 — 처음·끝과 지금 언저리만. 0 은 「…」 자리다.
 * 쉰두 쪽이면 번호를 쉰둘 다 늘어놓을 수 없다.
 */
function pagesOf(cur: number, last: number): number[] {
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1)
  const out = new Set<number>([1, last, cur, cur - 1, cur + 1])
  const ps = [...out].filter((p) => p >= 1 && p <= last).sort((a, b) => a - b)
  const res: number[] = []
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i]!
    if (i > 0 && p - ps[i - 1]! > 1) res.push(0)
    res.push(p)
  }
  return res
}

export default function ReqTc({ me }: Props) {
  void me
  /* 무엇을 볼지는 **상단바 토글**이 정한다(지시) — 여기서는 읽기만 한다.
     화면 안에도 토글을 두면 같은 것을 두 곳에서 고치게 된다. */
  const [mode, setModeState] = useState<Mode>(currentMode)
  useEffect(() => onModeChange(() => setModeState(currentMode())), [])
  const setMode = (m: Mode) => {
    setModeState(m)
    setSharedMode(m)
  }
  /* 마지막으로 보던 폴더를 기억한다(지시).
     여태 들어올 때마다 「전체」 로 돌아갔다 — 74건짜리 목록 앞에서 트리를
     다시 펼쳐 제 폴더를 찾아 들어가야 했다. 하루에도 여러 번 오가는 자리라
     그 몇 초가 매번 쌓인다. 주소(?cat=)로 들어오면 App 이 같은 열쇠에 적어
     주므로, 링크로 들어온 자리도 여기서 이어진다. */
  const [cat, setCat] = useState(() => {
    try {
      return localStorage.getItem('utop.reqtc.cat') ?? ''
    } catch {
      return ''
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('utop.reqtc.cat', cat)
    } catch {
      /* 사생활 보호 모드 */
    }
  }, [cat])
  /* 펼쳐 둔 폴더를 기억한다(지적: 새로 고치면 무조건 접힌다).
     층이 깊은 트리에서 새로 고칠 때마다 다시 펼치는 것은, 보던 자리를
     기억해 두고도 거기까지 가는 길만 매번 잃는 것과 같다. */
  const [openCat, setOpenCat] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('utop.reqtc.opencat')
      return new Set(raw ? (JSON.parse(raw) as string[]) : [])
    } catch {
      return new Set()
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('utop.reqtc.opencat', JSON.stringify([...openCat]))
    } catch {
      /* 사생활 보호 모드 */
    }
  }, [openCat])
  /** 「이 요구사항의 시험만」 — 요구사항 줄을 눌렀을 때 걸리는 다리 */
  const [reqOnly, setReqOnly] = useState('')
  const [q, setQ] = useState('')
  /* 1열 찾기는 **트리 안에서만** 쓴다. 여태 2열 찾기와 같은 값을 써서, 여기에
     치면 오른쪽 표가 걸러졌다(지적). 두 칸이 하는 일이 다르니 값도 달라야 한다. */
  const [treeQ, setTreeQ] = useState('')

  /* 글자를 견주기 전에 **자모 결합 방식을 맞춘다.**
     같은 「시스템」 이라도 붙여 저장한 것(3글자)과 풀어 저장한 것(7글자)이
     있다. 그대로 견주면 한 글자도 안 걸린다(지적: 한글이 안 된다).
     맥에서 만든 파일·붙여넣기로 들어온 이름이 흔히 풀린 꼴이다. */
  const norm = (v: unknown) => String(v ?? '').normalize('NFC').toLowerCase()

  /* 트리에 요구사항까지 낼지 — 폴더만 볼 때가 기본이다(지시로 고를 수 있게).
     스무 폴더 밑에 요구사항이 다 펼쳐지면 트리가 목록이 되어, 정작 폴더를
     짚는 일이 어려워진다. */
  /* 폴더 정렬 — 되살린다(지시: 지우라던 것은 ＋New Folder 였다).
     고른 값은 기억한다. */
  const [fsort, setFsort] = useState<FolderSortMode>(() => {
    try {
      return (localStorage.getItem('utop.reqtc.fsort') as FolderSortMode) || 'name'
    } catch {
      return 'name'
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('utop.reqtc.fsort', fsort)
    } catch {
      /* 사생활 보호 모드 */
    }
  }, [fsort])

  const [treeReqs, setTreeReqs] = useState(() => {
    try {
      return localStorage.getItem('utop.reqtc.treereqs') === '1'
    } catch {
      return false
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('utop.reqtc.treereqs', treeReqs ? '1' : '0')
    } catch {
      /* 사생활 보호 모드 */
    }
  }, [treeReqs])
  const [sideMenu, setSideMenu] = useState(false)
  /* 하위 폴더는 **늘 함께 본다** — 끄는 손잡이를 없앴다(지시) */
  const deep = true
  const [onlyBare, setOnlyBare] = useState(false)
  const [foldSide, setFoldSide] = useState(false)
  /* 두 판 사이 이동바(지시) — 다른 화면과 같은 부품을 쓴다. 폭은 기억한다. */
  const [sideW, setSideW] = useResizableWidth('rqtcSideW', 264, 180, 620)
  const gridRef = useRef<HTMLDivElement>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [pop, setPop] = useState<{ kind: 'req' | 'tc'; id: string } | null>(null)
  /** undefined = 안 열림 · null = 새로 만들기 · 값 = 그것을 고치기 */
  const [editReq, setEditReq] = useState<Requirement | null | undefined>(undefined)
  const [editTc, setEditTc] = useState<TestCaseMeta | null | undefined>(undefined)
  const [prjs, setPrjs] = useState<string[]>(currentProjects)

  /* 링크로 들어오면 그 폴더를 편다 — App 이 주소를 읽어 알려 준다 */
  useEffect(() => {
    const open1 = (id: string) => {
      if (!id) return
      setCat(id)
      setReqOnly('')
      setOpenCat((o) => new Set([...o, id]))
    }
    open1(new URLSearchParams(window.location.search).get('cat') ?? '')
    return onGoto((kind, id) => {
      if (kind === 'cat') open1(id)
    })
  }, [])

  /* 상단바(Layout)에서 프로젝트를 바꾸면 이 화면이 다시 좁힌다.
     **고른 폴더도 함께 푼다.** 폴더는 프로젝트에 매여 있어서, 그대로 두면
     새 프로젝트에 없는 폴더로 거르게 되고 2열이 통째로 빈다(지적: E6100 을
     골랐는데 아무것도 안 나온다). 고른 줄과 「이 요구사항만」 도 같이 푼다 —
     남겨 두면 딴 프로젝트의 것을 붙들고 있는 셈이다. */
  useEffect(
    () =>
      onProjectChange(() => {
        setPrjs(currentProjects())
        setCat('')
        setReqOnly('')
        setSel(new Set())
      }),
    [],
  )

  const reqQ = useQuery({ queryKey: ['reqs'], queryFn: ({ signal }) => api.listRequirements(signal) })
  const tcQ = useQuery({ queryKey: ['tcs'], queryFn: ({ signal }) => api.listTestCases(signal) })
  const catQ = useQuery({ queryKey: ['req-categories'], queryFn: ({ signal }) => categoryApi.list(signal) })
  const prjQ = useQuery({ queryKey: ['projects'], queryFn: ({ signal }) => projectApi.list(signal) })
  /** 먼데이 통채움 색 — **설정이 정본**(lib/fieldFill). 화면에 색을 박지 않는다 */
  const codesQ = useQuery({
    queryKey: ['codes'],
    staleTime: 60_000,
    queryFn: async () => {
      const r = await apiFetch('/api/codes')
      if (!r.ok) throw new Error('코드를 불러오지 못했습니다')
      return (await r.json()) as { items: Array<{ kind: string; value: string; note?: string | null }> }
    },
  })
  /** 최근 결과 — 결과는 사이클 안에 살아서 따로 읽는다 */
  const lastQ = useQuery({
    queryKey: ['tc-last-result'],
    staleTime: 30_000,
    queryFn: async () => {
      const r = await apiFetch('/api/tc-last-result')
      if (!r.ok) return {} as Record<string, { result: string; cycle_name?: string; at?: string }>
      const j = (await r.json()) as {
        items?: Record<string, { result: string; cycle_name?: string; at?: string }>
      }
      return j.items ?? {}
    },
  })

  const reqs = useMemo(() => reqQ.data?.reqs ?? [], [reqQ.data])
  const tcs = useMemo(() => tcQ.data?.tcs ?? [], [tcQ.data])
  const cats = useMemo(() => catQ.data?.categories ?? [], [catQ.data])
  const projects = useMemo(() => prjQ.data?.projects ?? [], [prjQ.data])
  const lastOf = (id: string) => lastQ.data?.[id]?.result ?? ''

  const codeFill = (kind: string, value: string) =>
    fillOf((codesQ.data?.items ?? []).find((x) => x.kind === kind && x.value === value)?.note, value)

  const kids = useMemo(() => {
    const m = new Map<string, typeof cats>()
    for (const c of cats) m.set(c.parent_id ?? '', [...(m.get(c.parent_id ?? '') ?? []), c])
    return m
  }, [cats])
  const under = useMemo(() => {
    const f = (id: string): string[] => [id, ...(kids.get(id) ?? []).flatMap((c) => f(c.id))]
    return f
  }, [kids])

  /** 이 폴더의 조상 길(뿌리부터). cat1..cat4 는 그 길을 네 칸에 나눠 담는다 */
  const pathOf = useMemo(() => {
    const par = new Map(cats.map((c) => [c.id, c.parent_id ?? '']))
    return (id: string): string[] => {
      const out: string[] = []
      let cur = id
      for (let i = 0; i < 8 && cur; i++) {
        out.unshift(cur)
        cur = par.get(cur) ?? ''
      }
      return out
    }
  }, [cats])

  /**
   * 요구사항을 다른 폴더로 옮긴다 — 끌어다 놓기(지시·Testiny).
   *
   * **원본을 읽어 폴더만 갈아 끼운다.** save_req 는 보낸 것으로 통째로
   * 덮어써서, 폴더 네 칸만 보내면 제목·내용이 다 지워진다.
   */
  const [dropCat, setDropCat] = useState('')
  /* 끌고 있는 **폴더**. 요구사항 끌기(text/utop-req)와 따로 둔다 — 받는
     쪽 규칙이 서로 다르다: 요구사항은 아무 폴더에나 가지만, 폴더는 제
     하위로는 못 간다(고리가 된다). */
  const [dragCat, setDragCat] = useState('')
  /* 도구줄이 여는 창들 — 요구사항·시험항목 화면의 것을 그대로 쓴다.
     같은 일을 하는 창을 새로 만들면 두 화면이 서로 다르게 동작한다. */
  const [bulkNew, setBulkNew] = useState(false)
  const [bulkEdit, setBulkEdit] = useState(false)
  const [copyOpen, setCopyOpen] = useState(false)
  const [actBusy, setActBusy] = useState('')

  /* 목록 정렬 — 세 화면이 같은 세 가지를 쓴다(트리 순서·이름·최근) */
  const [listSort, setListSort] = useState<ListSortMode>(
    () => (localStorage.getItem('utop.reqtc.listsort') as ListSortMode) || 'tree',
  )
  useEffect(() => localStorage.setItem('utop.reqtc.listsort', listSort), [listSort])

  /* INFO 열 — **설정이 정본**이다(useInfoCols 가 이름·폭을 들고 온다).
     어느 열을 볼지는 사람마다 다르니 이 브라우저에 기억한다. */
  /**
   * 톱니가 다루는 열 — **표에 이미 있는 칸까지 여기서 켜고 끈다.**
   *
   * 앞서 겹친다고 목록에서 빼 버렸더니 고를 것이 하나도 안 남아 「INFO 필드가
   * 없습니다」 만 떴다(지적). 겹침의 진짜 까닭은 「같은 칸을 두 번 그린 것」
   * 이지 「목록에 있는 것」 이 아니다. 요구사항 화면처럼 이 칸들을 목록이
   * 갖게 하고, 표는 **켜진 것만** 그린다.
   */
  const infoCols = useInfoCols(mode === 'req' ? 'req' : 'tc')
  const [showCols, setShowCols] = useState<Set<string> | null>(() => {
    try {
      const raw = localStorage.getItem('utop.reqtc.infocols')
      if (raw) return new Set(JSON.parse(raw) as string[])
    } catch {
      /* 깨진 값이면 기본으로 */
    }
    /* null = 아직 정한 적 없음 → **전부 켜짐**. 빈 Set 과 갈라 두어야
       「다 껐다」 와 「아직 안 정했다」 가 구별된다. */
    return null
  })
  useEffect(() => {
    if (showCols) localStorage.setItem('utop.reqtc.infocols', JSON.stringify([...showCols]))
  }, [showCols])
  const isOn = (k: string) => (showCols ? showCols.has(k) : true)
  const visCols = infoCols.filter((c) => isOn(c.k))
  /* 격자 폭 — 고정 칸 + 고른 INFO 열. **폭은 설정이 정본**이라 useInfoCols 가
     들고 온 값을 그대로 쓴다(화면에 숫자를 박지 않는다). */
  /* 고정 칸(고르기·제목·모델·TC/최근·Map) + **켜진 열**. 상태·우선순위 같은
     칸은 이제 켜진 열 쪽에서 나온다 — 두 곳에서 그리면 두 번 보인다. */
  /* ID 를 제 칸으로 뗀다(지시: ID 와 제목 사이에도 세로선). 한 칸에 같이
     두면 선을 그을 자리가 없다 — 표의 선은 칸 사이에만 선다. */
  const gridReq = `52px 48px 108px minmax(0, 1fr) 110px 80px 78px 52px 132px ${visCols.map((c) => c.w).join(' ')}`.trim()
  const gridTc = `52px 48px 108px minmax(0, 1fr) 100px 80px 70px 52px 108px ${visCols.map((c) => c.w).join(' ')}`.trim()
  const gridOf = (tc: boolean) => (tc ? gridTc : gridReq)
  /* 표에서 바로 고치는 칸이 쓸 값들 — 설정(codes)이 정본이다 */
  const REQ_STATUS = useCodes('req_status', ['작성중', '검토중', '검토완료', '보류', '폐기'])
  const REQ_PRIORITY = useCodes('req_priority', ['High', 'Medium', 'Low'])
  const TC_STATUS = useCodes('tc_status', ['작성중', '검토중', '검토완료', '보류', '폐기'])
  const TC_SEVERITY = useCodes('tc_severity', ['Blocker', 'Critical', 'Major', 'Minor'])

  /**
   * 한 칸만 고쳐 저장한다.
   *
   * **원본을 읽어 그 칸만 갈아 끼운다** — 서버의 저장은 보낸 것으로 통째로
   * 덮어써서, 칸 하나만 보내면 나머지가 다 지워진다(폴더 옮기기에서 겪은 그것).
   */
  const setOneField = async (kind: 'req' | 'tc', id: string, p: Record<string, unknown>) => {
    setSaveState('saving')
    try {
      if (kind === 'req') {
        const full = (await api.getRequirement(id)) as unknown as Record<string, unknown>
        await reqApi.save(id, { ...full, ...p })
        await reqQ.refetch()
      } else {
        const r = await apiFetch(`/api/tc/${encodeURIComponent(id)}`)
        const full = (await r.json()) as Record<string, unknown>
        await apiFetch(`/api/tc/${encodeURIComponent(id)}`, {
          method: 'POST',
          body: JSON.stringify({ ...full, ...p }),
        })
        await tcQ.refetch()
      }
      setSaveState('saved')
      window.setTimeout(() => setSaveState(''), 1500)
    } catch (e) {
      setSaveState('')
      window.alert(`고치지 못했습니다 — ${String((e as Error).message)}`)
    }
  }

  /* 우클릭한 칸 — 「아래로 채우기」 가 여기서 뜬다 */
  const [rowMenu, setRowMenu] = useState<{
    kind: 'req' | 'tc'
    id: string
    field: string
    label: string
    value: string
    x: number
    y: number
  } | null>(null)
  useEffect(() => {
    if (!rowMenu) return
    const off = () => setRowMenu(null)
    window.addEventListener('mousedown', off)
    window.addEventListener('scroll', off, true)
    return () => {
      window.removeEventListener('mousedown', off)
      window.removeEventListener('scroll', off, true)
    }
  }, [rowMenu])

  /**
   * 아래로 채우기 — 그 줄 **아래 전부**를 같은 값으로.
   *
   * 한 건씩 저장하고 그때마다 목록을 다시 읽으면 서른 건이 서른 번 왕복한다.
   * 여덟씩 묶어 보내고 목록은 끝에 한 번만 다시 읽는다.
   */
  const fillDown = async () => {
    const m = rowMenu
    setRowMenu(null)
    if (!m) return
    const rows: string[] =
      m.kind === 'req' ? reqPageRows.map((r) => reqPk(r)) : tcPageRows.map((t) => t.tcid)
    const at = rows.indexOf(m.id)
    const below = at < 0 ? [] : rows.slice(at + 1)
    if (!below.length) {
      window.alert('아래에 줄이 없습니다')
      return
    }
    if (!window.confirm(`아래 ${below.length}줄의 ${m.label} 을(를) 「${m.value || '(빈 값)'}」 로 채웁니다.`))
      return
    setActBusy('fill')
    try {
      const CH = 8
      for (let i = 0; i < below.length; i += CH) {
        await Promise.all(
          below.slice(i, i + CH).map(async (id) => {
            if (m.kind === 'req') {
              const full = (await api.getRequirement(id)) as unknown as Record<string, unknown>
              await reqApi.save(id, { ...full, [m.field]: m.value })
            } else {
              const r = await apiFetch(`/api/tc/${encodeURIComponent(id)}`)
              const full = (await r.json()) as Record<string, unknown>
              await apiFetch(`/api/tc/${encodeURIComponent(id)}`, {
                method: 'POST',
                body: JSON.stringify({ ...full, [m.field]: m.value }),
              })
            }
          }),
        )
      }
      await reqQ.refetch()
      await tcQ.refetch()
    } catch (e) {
      window.alert(`채우지 못했습니다 — ${String((e as Error).message)}`)
    } finally {
      setActBusy('')
    }
  }

  /** INFO 열 값 — 커스텀 필드는 **data->custom** 안에 있다(cf_<열쇠>) */
  const colVal = (row: Record<string, unknown>, k: string) => {
    const cf = (row.custom ?? {}) as Record<string, unknown>
    return String((k.startsWith('cf_') ? cf[k.slice(3)] : row[k]) ?? '')
  }
  const [gearAt, setGearAt] = useState<{ x: number; y: number } | null>(null)
  /* ⋯ — 시험 하나를 파일로 떼고 붙인다(Coverage 화면의 그 메뉴).
     랩마다 UTOP 이 따로 서 있어서, 한쪽에서 만든 시험을 다른 쪽에서 그대로
     돌리고 싶은 일이 잦다. DB 를 통째로 옮기면 장비 비밀번호까지 따라가므로
     시험 하나만 파일로 뗀다. */
  /** 만들기 메뉴 — ⋯ 안에 ＋New·＋Bulk New·＋Copy 가 든다 */
  const [newOpen, setNewOpen] = useState(false)
  /* 시험 연결 — 요구사항 화면이 쓰던 **그 창**을 그대로 얹는다(지시).
     TC Map 칸은 보여 주기만 한다: 붙였다 떼는 일은 이 창이 한다. */
  const [mapFor, setMapFor] = useState<Requirement | null>(null)
  /* 시험 쪽에서 요구사항을 붙였다 뗀다 — Coverage 화면의 그 창을 그대로
     쓴다(TcMapReqDialog). 붙이는 규칙이 두 벌이면 한쪽만 고치는 날이 온다. */
  const [mapTcFor, setMapTcFor] = useState<TestCaseMeta | null>(null)
  /* 제목을 누르면 2열이 **그 요구사항 화면**이 된다(지시) — 팝업이 아니다.
     ID 는 팝업, 제목은 이 화면. 둘이 같은 부품(ReqBody)을 쓴다. */
  const [openReq, setOpenReq] = useState('')
  const [openTab, setOpenTab] = useState<'info' | 'detail' | 'tc' | 'runs' | 'history'>('info')
  /** 시험항목도 같은 규칙 — ID 는 팝업, 제목은 이 화면(지시) */
  const [openTc, setOpenTc] = useState('')
  /* 전역 파라미터 — Coverage 화면의 그 단추를 여기에도(지시). 스텝에서
     ${이름} 으로 쓰는 값이라, 시험을 보다가 바로 열어 고칠 일이 잦다. */
  const [gpOpen, setGpOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  /* 「파일로 내보내기」 단추는 뺐지만(지시) 기능은 남긴다 — 자리를 정하면
     다시 낸다. 참조가 없으면 빌드가 막히므로 창에서 부를 수 있게 걸어 둔다. */
  useEffect(() => {
    ;(window as unknown as { utopExportTc?: () => void }).utopExportTc = () => void exportTc()
  })
  const exportTc = async () => {
    const id = [...sel][0]
    if (!id) return
    try {
      const r = await apiFetch(`/api/tc/${encodeURIComponent(id)}`)
      const d = (await r.json()) as Record<string, unknown>
      downloadJson(tcFileName(d as never), buildTcFile({ ...d, tcid: id } as never, new Map()))
    } catch (e) {
      window.alert(`내보내지 못했습니다 — ${String((e as Error).message)}`)
    }
  }
  const importTc = async (file: File) => {
    try {
      const f = parseTcFile(await file.text())
      const tc = { ...f.tc } as Record<string, unknown>
      const id = String(tc.tcid ?? '')
      if (!id) throw new Error('파일에 TC ID 가 없습니다')
      await apiFetch(`/api/tc/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify(tc) })
      await tcQ.refetch()
      window.alert(`가져왔습니다 — ${id}`)
    } catch (e) {
      window.alert(`가져오지 못했습니다 — ${String((e as Error).message)}`)
    }
  }
  const moveToCat = async (ids: string[], catId: string) => {
    const p = pathOf(catId)
    for (const id of ids) {
      try {
        const full = (await api.getRequirement(id)) as unknown as Record<string, unknown>
        await reqApi.save(id, {
          ...full,
          cat1: p[0] ?? '',
          cat2: p[1] ?? '',
          cat3: p[2] ?? '',
          cat4: p[3] ?? '',
        })
      } catch (e) {
        window.alert(`옮기지 못했습니다 — ${String((e as Error).message)}`)
        break
      }
    }
    setSel(new Set())
    await reqQ.refetch()
    await tcQ.refetch()
  }
  /**
   * 고른 요구사항을 복제한다 — 요구사항 화면과 **같은 방식**이다.
   * 새 ID 는 신규 생성이 쓰는 /api/req-next-id 그대로 받는다. 복제라고 다른
   * 규칙으로 매기면 「어느 ID 가 왜 이 모양이지」 를 두 가지로 기억해야 한다.
   * 제목 끝에 (복제)를 붙인다 — 안 붙이면 같은 이름이 나란히 서서 어느 것이
   * 원본인지 알 수 없다.
   */
  const cloneReqs = async () => {
    const ids = [...sel]
    if (!ids.length) return
    if (!window.confirm(`고른 ${ids.length}건을 복제합니다.`)) return
    setActBusy('clone')
    try {
      for (const id of ids) {
        const r = (await api.getRequirement(id)) as unknown as Record<string, unknown>
        const nid = ((await (await apiFetch('/api/req-next-id')).json()) as { reqid?: string }).reqid ?? ''
        const pk = `rq-${Date.now()}-${Math.floor(Math.random() * 1e4)}`
        const { id: _i, reqid: _r, tc: _t, ...rest } = r
        const t = String(rest.title ?? '').trim()
        await apiFetch(`/api/req/${encodeURIComponent(pk)}`, {
          method: 'POST',
          body: JSON.stringify({
            ...rest,
            id: pk,
            reqid: nid,
            title: t.endsWith('(복제)') ? t : `${t} (복제)`.trim(),
            tc: [],
          }),
        })
      }
      setSel(new Set())
      await reqQ.refetch()
    } catch (e) {
      window.alert(`복제하지 못했습니다 — ${String((e as Error).message)}`)
    } finally {
      setActBusy('')
    }
  }

  /** 고른 것을 지운다 — 되돌릴 수 없으니 몇 건인지 적어 두고 묻는다 */
  const deletePicked = async () => {
    const ids = [...sel]
    if (!ids.length) return
    const what = mode === 'req' ? '요구사항' : '시험'
    if (!window.confirm(`고른 ${what} ${ids.length}건을 삭제합니다.\n되돌릴 수 없습니다. 계속할까요?`)) return
    setActBusy('del')
    try {
      for (const id of ids) {
        const url = mode === 'req' ? `/api/req/${encodeURIComponent(id)}` : `/api/tc/${encodeURIComponent(id)}`
        await apiFetch(url, { method: 'DELETE' })
      }
      setSel(new Set())
      await reqQ.refetch()
      await tcQ.refetch()
    } catch (e) {
      window.alert(`지우지 못했습니다 — ${String((e as Error).message)}`)
    } finally {
      setActBusy('')
    }
  }

  /** 끌고 있는 것들 — 고른 줄이 여럿이면 그 전부, 아니면 잡은 줄 하나 */
  const dragIds = (id: string) => (sel.has(id) ? [...sel] : [id])

  const catsOf = (r: Requirement) => [r.cat1, r.cat2, r.cat3, r.cat4].filter(Boolean).map(String)
  const catOf = (r: Requirement) => String(r.cat4 || r.cat3 || r.cat2 || r.cat1 || '')

  /** 시험 → 요구사항. 잇는 키는 **req.id**(내부 키)다 — reqid 로는 안 붙는다 */
  const tcOf = useMemo(() => {
    const m = new Map<string, TestCaseMeta[]>()
    for (const t of tcs) {
      const k = String(t.req_id ?? '').trim()
      if (k) m.set(k, [...(m.get(k) ?? []), t])
    }
    return m
  }, [tcs])
  const reqById = useMemo(() => new Map(reqs.map((r) => [reqPk(r), r])), [reqs])

  /* 고른 프로젝트들 아래 폴더를 모두 모은다 — 여럿을 함께 볼 수 있다(지시).
     하나도 안 골랐으면 null 이고, 그건 「전체」 다. */
  const prjCats = useMemo(
    () => (prjs.length ? new Set(prjs.flatMap((p) => under(p))) : null),
    [prjs, under],
  )
  const inPrj = (r: Requirement) => !prjCats || catsOf(r).some((c) => prjCats.has(c))

  /** 이 요구사항의 프로젝트 — 사업자·모델의 정본 */
  const prjOf = useMemo(() => {
    const byCat = new Map<string, (typeof projects)[number]>()
    for (const p of projects) for (const c of under(p.cat_id)) byCat.set(c, p)
    return (r?: Requirement) => (r ? catsOf(r).map((c) => byCat.get(c)).find(Boolean) : undefined)
  }, [projects, under])

  const countOf = (id: string) => {
    const set = new Set(under(id))
    const rs = reqs.filter((r) => inPrj(r) && catsOf(r).some((c) => set.has(c)))
    return { r: rs.length, t: rs.reduce((n, r) => n + (tcOf.get(reqPk(r))?.length ?? 0), 0) }
  }

  const inCat = (r: Requirement) => {
    if (!cat) return true
    const set = new Set(under(cat))
    return deep ? catsOf(r).some((c) => set.has(c)) : catOf(r) === cat
  }

  /** 요구사항 줄 */
  const reqRows = useMemo(() => {
    const n = q.trim().toLowerCase()
    return reqs.filter((r) => {
      if (!inPrj(r) || !inCat(r)) return false
      if (onlyBare && (tcOf.get(reqPk(r))?.length ?? 0) > 0) return false
      if (!n) return true
      return `${reqLabel(r)} ${r.title ?? ''}`.toLowerCase().includes(n)
    })
  }, [reqs, q, cat, deep, onlyBare, tcOf, prjCats, under])

  /** 시험 줄 — 폴더(또는 고른 요구사항)에 매인 것만 */
  const tcRows = useMemo(() => {
    const n = q.trim().toLowerCase()
    const ok = (t: TestCaseMeta) => {
      const rid = String(t.req_id ?? '')
      if (reqOnly) return rid === reqOnly
      const r = reqById.get(rid)
      if (!r) return false
      return inPrj(r) && inCat(r)
    }
    return tcs.filter((t) => ok(t) && (!n || `${t.tcid} ${t.name ?? ''}`.toLowerCase().includes(n)))
  }, [tcs, q, cat, deep, reqOnly, reqById, prjCats, under])

  const crumb = useMemo(() => {
    const out: Array<{ id: string; name: string }> = []
    let at = cats.find((c) => c.id === cat)
    while (at) {
      out.unshift({ id: at.id, name: at.name })
      const pid = at.parent_id
      at = pid ? cats.find((c) => c.id === pid) : undefined
    }
    return out
  }, [cat, cats])

  /**
   * 열어 둔 시험의 **자리**.
   *
   * 끼워 넣은 Coverage 화면도 제 빵부스러기를 그린다. 그러면 한 화면에
   * 빵부스러기가 둘, 「목록」 이 둘이 된다(지적). 자리를 말하는 줄은 화면에
   * 하나여야 하고, 그 자리는 **맨 윗줄**이다 — 폴더를 볼 때 자리가 적히던
   * 그 자리에, 시험을 열면 시험의 자리가 적힌다(지시).
   *
   * 폴더는 요구사항의 cat1..cat4 다. 시험은 폴더에 직접 안 달리고 요구사항을
   * 통해 달리므로, 그 요구사항의 길이 곧 시험의 길이다.
   */
  const tcCrumb = useMemo(() => {
    if (!openTc) return null
    const t = tcs.find((x) => x.tcid === openTc)
    const r = t?.req_id ? reqById.get(String(t.req_id)) : undefined
    const folders = r
      ? [r.cat1, r.cat2, r.cat3, r.cat4]
          .filter(Boolean)
          .map((id) => cats.find((c) => c.id === String(id)))
          .filter((c): c is NonNullable<typeof c> => !!c)
          .map((c) => ({ id: c.id, name: c.name }))
      : []
    return { folders, req: r ?? null, name: t?.name || openTc }
  }, [openTc, tcs, reqById, cats])

  /**
   * 지금 보고 있는 것을 **주소창에 적는다.**
   *
   * 여태 주소는 남이 보낸 링크로 **들어올 때만** 쓰였다. 그래서 이 화면에서
   * 시험을 열어 놓고 주소를 복사하면 남에게 「REQ-Coverage 첫 화면」 이
   * 갔다 — 정작 보여 주려던 그 시험이 아니라. 새로 고쳐도 처음으로
   * 돌아갔다.
   *
   * 차례가 곧 좁은 것부터다: 시험 > 요구사항 > 폴더. 셋 다 아니면 주소를
   * 비운다.
   *
   * replaceState 를 쓴다. 폴더를 훑는 동안 pushState 로 쌓으면 뒤로가기를
   * 스무 번 눌러야 여기서 빠져나간다 — 그건 「뒤로」 가 아니다.
   */
  useEffect(() => {
    const p = window.location.pathname
    /* 주소에는 **사람이 읽는 ID**(REQ-2633-0016)를 적는다(지적).
       내부 열쇠(rq-1786…)는 우리끼리 쓰는 값이라, 주소창에 나오면 무엇을
       가리키는지 알 수 없고 링크를 눈으로 확인할 수도 없다. */
    const reqShow = openReq ? reqLabel(reqById.get(openReq) ?? ({} as Requirement)) || openReq : ''
    const url = openTc
      ? `${p}?tc=${encodeURIComponent(openTc)}`
      : openReq
        ? `${p}?req=${encodeURIComponent(reqShow)}`
        : cat
          ? `${p}?cat=${encodeURIComponent(cat)}`
          /* 아무것도 안 골랐어도 **어느 화면인지**는 적는다. 빈 주소를
             남기면 뒤로가기가 여기로 왔을 때 무엇을 보여야 할지 모른다. */
          : `${p}?p=reqtc`
    if (window.location.pathname + window.location.search !== url) {
      window.history.replaceState({ utop: true }, '', url)
    }
  }, [openTc, openReq, cat, reqById])

  /** 열어 둔 요구사항의 자리 — 시험(tcCrumb)과 **같은 꼴**이다.
      두 상세가 서로 다른 모양으로 서면, 같은 화면인데 무엇을 열었느냐에
      따라 눈이 다른 데를 찾아야 한다(지적: 표시 방법이 다르다). */
  const reqCrumb = useMemo(() => {
    if (!openReq) return null
    const r = reqById.get(openReq)
    if (!r) return null
    const folders = [r.cat1, r.cat2, r.cat3, r.cat4]
      .filter(Boolean)
      .map((id) => cats.find((c) => c.id === String(id)))
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map((c) => ({ id: c.id, name: c.name }))
    return { folders, name: r.title || '(제목 없음)', label: reqLabel(r) }
  }, [openReq, reqById, cats])

  const toggle = (s: Set<string>, k: string, set: (v: Set<string>) => void) => {
    const n = new Set(s)
    if (n.has(k)) n.delete(k)
    else n.add(k)
    set(n)
  }

  /** 다리 — 요구사항 줄을 누르면 그 시험으로 간다(트리에 요구사항을 넣는 대신) */
  const goTcOf = (pk: string) => {
    setReqOnly(pk)
    setMode('tc')
    setSel(new Set())
  }
  const pickFolder = (id: string) => {
    /* 상세를 보고 있으면 폴더를 누르는 것은 「목록으로 돌아가 그 폴더를
       본다」 는 뜻이다. 그때 껐다 켜기를 하면 이미 고른 폴더를 눌렀을 때
       꺼져서 「전체」 로 튄다(지적). 상세를 닫고 그 폴더로 간다. */
    const inDetail = !!openReq || !!openTc || gpOpen
    setOpenReq('')
    setOpenTc('')
    setGpOpen(false)
    setCat(inDetail ? id : cat === id ? '' : id)
    setReqOnly('')
    setSel(new Set())
  }

  const bare = reqRows.filter((r) => !(tcOf.get(reqPk(r))?.length ?? 0)).length
  const rowsN = mode === 'req' ? reqRows.length : tcRows.length

  /* 쪽 나누기 — 수천 줄을 한 번에 그리면 스크롤이 뻑뻑하고, 「몇 번째쯤
     보고 있나」 를 알 길도 없다. 한 쪽 크기는 사람이 정한다. */
  const [per, setPer] = useState(100)
  const [page, setPage] = useState(1)
  const pageN = Math.max(1, Math.ceil(rowsN / per))
  /* 거르개가 바뀌면 1쪽으로 — 3쪽을 보다 좁히면 그 쪽이 없어져 빈 화면이
     되고, 사람은 「걸러진 게 없다」 고 읽는다 */
  useEffect(() => setPage(1), [mode, cat, deep, q, onlyBare, reqOnly, prjs, per])
  /* 목록이 바뀌면 열어 둔 상세는 닫는다 — 딴 폴더를 보면서 옛 상세가 남아
     있으면, 화면이 무엇을 말하는지 알 수 없다. */
  useEffect(() => {
    setOpenReq('')
    setOpenTc('')
  }, [mode, cat, prjs])
  useEffect(() => {
    if (page > pageN) setPage(pageN)
  }, [page, pageN])
  const from = (page - 1) * per
  /* 정렬 — 기본은 「트리 순서」(자료가 온 차례)다. 이름순으로 세워 두면 같은
     폴더 것이 목록 여기저기에 흩어져, 왼쪽에서 폴더를 짚어 놓고도 오른쪽에서
     그걸 다시 찾아야 한다. */
  const sorted = <T,>(arr: T[], nameOf: (x: T) => string, atOf: (x: T) => string): T[] => {
    if (listSort === 'tree') return arr
    const a = [...arr]
    if (listSort === 'name') a.sort((x, y) => nameOf(x).localeCompare(nameOf(y)))
    else a.sort((x, y) => atOf(y).localeCompare(atOf(x)))
    return a
  }
  const reqSorted = useMemo(
    () => sorted(reqRows, (r) => String(r.title ?? ''), (r) => String((r as { updated_at?: string }).updated_at ?? '')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reqRows, listSort],
  )
  const tcSorted = useMemo(
    () => sorted(tcRows, (t) => String(t.name ?? ''), (t) => String((t as { updated_at?: string }).updated_at ?? '')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tcRows, listSort],
  )
  const reqPageRows = useMemo(() => reqSorted.slice(from, from + per), [reqSorted, from, per])
  const tcPageRows = useMemo(() => tcSorted.slice(from, from + per), [tcSorted, from, per])
  const onlyReq = reqOnly ? reqById.get(reqOnly) : undefined

  /* 폴더 줄의 ⋯ 메뉴 — 어느 폴더에 떠 있나.

     **훅은 아래 조기 반환보다 위에 있어야 한다.** 아래에 두었더니 읽는
     동안에는 훅이 하나 적고 다 읽고 나면 하나 늘어, React 가 「훅 개수가
     달라졌다」(#310) 로 화면을 통째로 걷어 냈다 — 로그인하면 백지가 되던
     것이 이것이다. 조건부 반환 뒤에는 어떤 훅도 두지 않는다. */
  /* 폴더 ⋯ 메뉴 — **화면 좌표에 띄운다.**
     판 안에 두면 트리가 잘라 버리고, 판 밖으로 밀면 화면 밖으로 나간다.
     CSS 로 세 번 고쳐도 어느 한쪽이 늘 잘렸다(지적). 단추 자리를 재서
     그 자리에 고정으로 띄우면 어떤 상자에도 안 걸린다. */
  const [catMenu, setCatMenu] = useState('')
  const [moving, setMoving] = useState('')
  const [editPrj, setEditPrj] = useState('')
  const [catMenuAt, setCatMenuAt] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  /* 「하위 폴더」 를 고르면 그 폴더 밑에 **이름 칸이 바로 열린다**(지시·사진).
     창을 띄워 묻지 않는 까닭: 어디에 만드는지가 그 자리에 보여야 한다.
     창은 화면 한가운데 떠서 「어느 폴더 밑이더라」 를 다시 생각하게 한다. */
  const [newUnder, setNewUnder] = useState('')
  /* 이름은 **그 줄에서 바로** 고친다(지시) — 창을 띄우면 어느 폴더를 고치는
     중인지 화면에서 사라진다. */
  useEffect(() => {
    /* 다른 요구사항으로 넘어가면 들고 있던 값은 버린다 — 남겨 두면 엉뚱한
       요구사항에 저장된다. */
    setReqDraft({})
    setSaveState('')
  }, [openReq])

  const [copiedId, setCopiedId] = useState(false)

  /** 주소 복사 — http 로 여는 화면에는 navigator.clipboard 가 없다.
      옛 방식(숨은 칸)으로 받아 내고, 그것도 안 되면 주소를 띄운다. */
  const copyLink = (kind: 'req' | 'tc', id: string) => {
    const url = `${window.location.origin}${window.location.pathname}?${kind}=${encodeURIComponent(id)}`
    const run = async () => {
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(url)
          return true
        }
      } catch {
        /* 아래 옛 방식으로 */
      }
      const ta = document.createElement('textarea')
      ta.value = url
      ta.style.cssText = 'position:fixed;left:-9999px'
      document.body.appendChild(ta)
      ta.select()
      let ok = false
      try {
        ok = document.execCommand('copy')
      } catch {
        ok = false
      }
      ta.remove()
      return ok
    }
    void run().then((ok) => {
      if (ok) {
        setCopiedId(true)
        window.setTimeout(() => setCopiedId(false), 1200)
      } else {
        window.prompt('아래 주소를 복사하세요', url)
      }
    })
  }
  /* 「저장」 은 누르는 단추가 아니라 **상태 표시**다. 상태·우선순위는 고치는
     즉시 저장되므로 누를 것이 없다 — 누를 수 없는 단추를 두면 「눌러야
     저장되나」 를 묻게 된다. */
  const [saveState, setSaveState] = useState<'' | 'saving' | 'saved'>('')
  /* 고친 값을 **손에 들고 있다가** 저장 단추를 누를 때 보낸다(지시).
     자동 저장은 「고치는 중」 과 「고쳤다」 를 구별하지 못한다 — 드롭다운을
     훑어 내리는 것만으로도 값이 바뀌어 나갔다. */
  const [reqDraft, setReqDraft] = useState<{ status?: string; priority?: string }>({})
  const [toast, setToast] = useState('')
  /* 끼워 넣은 Coverage 화면이 넘겨 준 저장·⋯ — 머리줄은 이 화면이 그린다 */
  const [tcApi2, setTcApi2] = useState<{
    dirty: boolean
    saving: boolean
    save: () => void
    menu: React.ReactNode
  } | null>(null)
  const [renaming, setRenaming] = useState('')
  const [renameName, setRenameName] = useState('')

  const doRename = async (id: string, parent: string | null, was: string, name: string) => {
    const nm = name.trim()
    setRenaming('')
    if (!nm || nm === was) return
    await categoryApi.rename(id, nm, parent)
    await catQ.refetch()
  }
  /* 옮기기 — 이름은 그대로 두고 부모만 바꾼다. rename 이 이미 부모를
     받으므로 같은 문을 쓴다: 문이 둘이면 한쪽에만 규칙이 붙는 날이 온다. */
  /* 제 하위 — 여기로는 못 간다. 끌 때마다 세지 않고 폴더 목록이 바뀔 때만 센다. */
  const kidsOfCat = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const c of cats) m.set(c.parent_id ?? '', [...(m.get(c.parent_id ?? '') ?? []), c.id])
    return m
  }, [cats])
  const banFor = (id: string): Set<string> => {
    const out = new Set<string>([id])
    const walk = (k: string) => {
      for (const x of kidsOfCat.get(k) ?? []) {
        out.add(x)
        walk(x)
      }
    }
    walk(id)
    return out
  }
  const isPrjCat = (id: string) => projects.some((p) => p.cat_id === id)

  const doMove = async (id: string, name: string, parent: string | null) => {
    setMoving('')
    try {
      await categoryApi.rename(id, name, parent)
      await catQ.refetch()
      setToast('옮겼습니다')
      window.setTimeout(() => setToast(''), 1800)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '옮기지 못했습니다')
    }
  }

  const [newName, setNewName] = useState('')

  const makeSub = async (parent: string, name: string) => {
    const nm = name.trim()
    if (!nm) return
    await categoryApi.create(nm, parent)
    setNewUnder('')
    setNewName('')
    await catQ.refetch()
    setOpenCat((o) => new Set([...o, parent]))
  }

  if (reqQ.isLoading || tcQ.isLoading) return <div className="empty">불러오는 중…</div>
  if (reqQ.error) return <div className="load-error">{(reqQ.error as Error).message}</div>

  const Tree = ({ parent, depth }: { parent: string | null; depth: number }) => (
    <>
      {[...(kids.get(parent ?? '') ?? [])]
        /* 프로젝트를 고르면 **그 프로젝트의 폴더만** 낸다(지적: 6100 을
           골랐는데 다른 제품 폴더가 같이 나온다). 폴더는 프로젝트에 매여
           있어서, 남겨 두면 늘 (0 / 0) 인 줄이 남아 「비었나, 잘못 골랐나」
           를 헷갈리게 한다. 아래 가지는 이미 그 프로젝트 안이라 안 거른다. */
        .filter((c) => depth > 0 || !prjs.length || prjs.includes(c.id))
        /* 찾기 — 이름이 걸리거나, 자손 중에 걸리는 것이 있으면 남긴다.
           자손을 안 보면 「MGMT 밑 SNMP」 를 찾을 때 MGMT 가 사라져 길이
           끊긴다. */
        .filter((c) => {
          const n = norm(treeQ.trim())
          if (!n) return true
          /* 폴더 이름만 보던 것을 고친다(지적) — 사람은 「System Temp」 처럼
             **요구사항 이름**으로도 찾는다. 그 요구사항이 든 폴더를 남긴다.
             자손도 함께 본다: 안 그러면 「MGMT 밑」 을 찾을 때 길이 끊긴다. */
          const hit = (x: { id: string; name: string }): boolean =>
            norm(x.name).includes(n) ||
            reqs.some(
              (r) =>
                catOf(r) === x.id &&
                (norm(r.title).includes(n) || norm(reqLabel(r)).includes(n)),
            ) ||
            (kids.get(x.id) ?? []).some(hit)
          return hit(c)
        })
        .sort((a, b) =>
          fsort === 'name'
            ? a.name.localeCompare(b.name)
            : fsort === 'req'
              ? countOf(b.id).r - countOf(a.id).r
              : String((b as { updated_at?: string }).updated_at ?? '').localeCompare(
                  String((a as { updated_at?: string }).updated_at ?? ''),
                ),
        )
        .map((c) => {
          const kid = kids.get(c.id) ?? []
          /* 이 폴더에 **바로 달린** 요구사항. 「폴더 + 요구사항」 일 때는
             이것도 펼칠 거리다 — 하위 폴더가 없다고 단추를 꺼 두면 끝단
             폴더의 요구사항은 영영 못 본다(지적: 요구사항+폴더가 안 된다). */
          const nq = norm(treeQ.trim())
          const own = (treeReqs || !!nq
            ? reqs.filter((r) => catOf(r) === c.id)
            : []
          ).filter(
            (r) =>
              !nq ||
              norm(r.title).includes(nq) ||
              norm(reqLabel(r)).includes(nq) ||
              norm(c.name).includes(nq),
          )
          const canOpen = kid.length > 0 || own.length > 0
          const on = openCat.has(c.id) || !!treeQ.trim()
          const n = countOf(c.id)
          return (
            <div key={c.id}>
              <div
                className={`rqtc-fold${cat === c.id && !openReq && !openTc ? ' on' : ''}${depth === 0 ? ' root' : ''}${
                  dropCat === c.id ? ' drop' : ''
                }${dragCat === c.id ? ' dragging' : ''}`}
                style={{ paddingLeft: 6 + depth * 14 }}
                onClick={() => pickFolder(c.id)}
                /* 폴더를 끌어서 옮긴다(지시). 이름 바꾸는 중에는 못 끈다 —
                   글자를 골라 끌려는 손이 폴더를 통째로 끌고 간다. */
                draggable={renaming !== c.id}
                onDragStart={(e) => {
                  e.stopPropagation()
                  e.dataTransfer.setData('text/utop-cat', c.id)
                  e.dataTransfer.effectAllowed = 'move'
                  setDragCat(c.id)
                }}
                onDragEnd={() => {
                  setDragCat('')
                  setDropCat('')
                }}
                onDragOver={(e) => {
                  const t = e.dataTransfer.types
                  if (t.includes('text/utop-cat')) {
                    /* 제 하위로는 못 간다(고리). 프로젝트는 맨 위가 자리라
                       아예 못 들어간다 — 서버도 막지만, 여기서 막아야
                       끌어다 놓고 나서 되돌아가는 일이 없다. */
                    if (!dragCat || banFor(dragCat).has(c.id) || isPrjCat(dragCat)) return
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    setDropCat(c.id)
                    return
                  }
                  if (!t.includes('text/utop-req')) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  setDropCat(c.id)
                }}
                onDragLeave={() => setDropCat((v) => (v === c.id ? '' : v))}
                onDrop={(e) => {
                  setDropCat('')
                  const moved = e.dataTransfer.getData('text/utop-cat')
                  if (moved) {
                    e.preventDefault()
                    e.stopPropagation()
                    const src = cats.find((x) => x.id === moved)
                    setDragCat('')
                    if (!src || src.parent_id === c.id) return
                    if (banFor(moved).has(c.id) || isPrjCat(moved)) return
                    void doMove(moved, src.name, c.id)
                    setOpenCat((o) => new Set([...o, c.id]))
                    return
                  }
                  const ids = e.dataTransfer.getData('text/utop-req')
                  if (!ids) return
                  e.preventDefault()
                  void moveToCat(ids.split(',').filter(Boolean), c.id)
                }}
              >
                <button
                  type="button"
                  className={`rqtc-caret${on ? ' open' : ''}`}
                  disabled={!canOpen}
                  aria-label={on ? '접기' : '펴기'}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggle(openCat, c.id, setOpenCat)
                  }}
                >
                  <IconChevron />
                </button>
                {/* 층마다 **다른 종류**로 보이게 한다(지시·목업 B).
                    전체는 서랍(🗃), 프로젝트는 집(🏠), 그 아래는 폴더(📁).
                    셋 다 폴더 그림이면 「전체 · 프로젝트 · 폴더」 가 한 덩어리로
                    읽혀 층이 안 갈린다. */}
                <span className="rqtc-fico" aria-hidden="true">
                  {depth === 0 ? '🏠' : '📁'}
                </span>
                {renaming === c.id ? (
                  <input
                    className="rqtc-rename"
                    autoFocus
                    value={renameName}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setRenameName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void doRename(c.id, c.parent_id ?? null, c.name, renameName)
                      if (e.key === 'Escape') setRenaming('')
                    }}
                    onBlur={() => void doRename(c.id, c.parent_id ?? null, c.name, renameName)}
                  />
                ) : (
                  <span className="rqtc-fnm">{c.name}</span>
                )}
                {/* 개수는 **이름 바로 오른쪽**에 붙인다(지시) — 오른쪽 끝에
                    밀어 두면 폴더 이름과 숫자 사이가 비어, 어느 줄의 숫자인지
                    눈이 한 번 더 짚어야 한다.
                    덮이지 않은 폴더는 붉게 — 트리만 훑어도 구멍이 보인다 */}
                <span className={`rqtc-rt${n.r > 0 && n.t === 0 ? ' bare' : ''}`}>
                  ({n.r} / {n.t})
                </span>
                <span className="sp" />
                {/* ⋯ — 마우스를 올린 줄에서만 보인다(지시). 늘 보이면 트리가
                    단추로 시끄럽다. 하는 일이 그 폴더에 매이므로 줄 위가
                    제자리다 — 위 도구줄에 두면 「어느 폴더에?」 를 또 물어야
                    한다. */}
                <span className="rqtc-fmenu" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="rqtc-fmore"
                    aria-haspopup="menu"
                    aria-expanded={catMenu === c.id}
                    onClick={(e) => {
                      const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                      setCatMenuAt({ x: r.left, y: r.bottom + 4 })
                      setCatMenu((v) => (v === c.id ? '' : c.id))
                    }}
                  >
                    ⋯
                  </button>
                  {catMenu === c.id && (
                    <>
                      <div className="tc-menu-back" onClick={() => setCatMenu('')} />
                      <div
                        className="tc-menu rqtc-fmenu-pop"
                        role="menu"
                        style={{ position: 'fixed', left: catMenuAt.x, top: catMenuAt.y, right: 'auto' }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setCatMenu('')
                            setNewUnder(c.id)
                            setNewName('')
                            setOpenCat((o) => new Set([...o, c.id]))
                          }}
                        >
                          Add subfolder
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCatMenu('')
                            setRenaming(c.id)
                            setRenameName(c.name)
                          }}
                        >
                          Rename
                        </button>
                        {/* 프로젝트 폴더에만 — 고객사·모델그룹은 프로젝트의 것이지
                            폴더의 것이 아니다. 아닌 폴더에 내면 눌러 보고 실망한다. */}
                        {projects.some((p) => p.cat_id === c.id) && (
                          <button
                            type="button"
                            onClick={() => {
                              setCatMenu('')
                              setEditPrj(c.id)
                            }}
                          >
                            프로젝트 수정
                          </button>
                        )}
                        {/* 옮기기 — 서버는 진작 되는데 화면에 길이 없었다(지적).
                            이름 바꾸기 옆이 자리다: 둘 다 「이 폴더 자체」 를 만지는 일이다. */}
                        <button
                          type="button"
                          onClick={() => {
                            setCatMenu('')
                            setMoving(c.id)
                          }}
                        >
                          Move to…
                        </button>
                        <div className="tc-menu-sep" />
                        {/* 펼치기·접기는 **자손까지**. 한 층만 바꾸면
                            「눌렀는데 반쯤만 됐다」 로 보인다. */}
                        <button
                          type="button"
                          disabled={!canOpen}
                          onClick={() => {
                            setCatMenu('')
                            const all: string[] = []
                            const walk = (id: string) => {
                              all.push(id)
                              for (const k of kids.get(id) ?? []) walk(k.id)
                            }
                            walk(c.id)
                            setOpenCat((o) => new Set([...o, ...all]))
                          }}
                        >
                          Expand all
                        </button>
                        <button
                          type="button"
                          disabled={!canOpen}
                          onClick={() => {
                            setCatMenu('')
                            const all: string[] = []
                            const walk = (id: string) => {
                              all.push(id)
                              for (const k of kids.get(id) ?? []) walk(k.id)
                            }
                            walk(c.id)
                            setOpenCat((o) => new Set([...o].filter((x) => !all.includes(x))))
                          }}
                        >
                          Collapse all
                        </button>
                        <div className="tc-menu-sep" />
                        <button
                          type="button"
                          className="danger"
                          onClick={() => {
                            setCatMenu('')
                            if (
                              !window.confirm(
                                `「${c.name}」 폴더를 지웁니다.\n안의 요구사항은 지워지지 않고 폴더만 없어집니다.`,
                              )
                            )
                              return
                            void categoryApi.remove(c.id).then(
                              () => {
                                if (cat === c.id) setCat('')
                                void catQ.refetch()
                              },
                              (err) => window.alert(err instanceof Error ? err.message : String(err)),
                            )
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </span>
              </div>
              {/* 새 하위 폴더 이름 — **그 폴더 바로 밑**에서 친다(사진).
                  어디에 만드는지가 눈에 보여야 한다. Enter 로 만들고,
                  Esc 나 X 로 접는다. */}
              {newUnder === c.id && (
                <div className="rqtc-newsub" style={{ paddingLeft: 6 + (depth + 1) * 14 }}>
                  <input
                    autoFocus
                    value={newName}
                    placeholder="폴더 이름"
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void makeSub(c.id, newName)
                      if (e.key === 'Escape') setNewUnder('')
                    }}
                    onBlur={() => void makeSub(c.id, newName)}
                  />
                  <button type="button" title="그만두기" onMouseDown={() => setNewUnder('')}>
                    ✕
                  </button>
                </div>
              )}
              {on && (
                <>
                  <Tree parent={c.id} depth={depth + 1} />
                  {/* 이 폴더에 바로 달린 요구사항 — 「폴더 + 요구사항」 일 때만.
                      누르면 그 요구사항 하나로 좁혀 본다. */}
                  {own.map((r) => (
                        <div
                          key={reqPk(r)}
                          className={`rqtc-fold rqtc-treq${openReq === reqPk(r) ? ' on' : ''}`}
                          style={{ paddingLeft: 6 + (depth + 1) * 14 }}
                          onClick={() => {
                            /* 트리에서 요구사항을 누르면 **그 요구사항을 연다**
                               (지시) — 목록을 좁히는 것이 아니다. 좁히기는
                               폴더가 하는 일이고, 요구사항은 끝단이라 더 좁힐
                               것이 없다. */
                            setOpenTc('')
                            setOpenReq(reqPk(r))
                            /* **그 요구사항이 든 폴더**를 고른 것으로 둔다.
                               그래야 「← 목록」 으로 돌아왔을 때 그 폴더가
                               서 있다(지적: 색이 유지돼야 하나 옮겨가야 하나
                               — 돌아갈 자리는 그 요구사항이 있던 폴더다). */
                            setCat(c.id)
                          }}
                          title={`${reqLabel(r)} ${r.title ?? ''}`}
                        >
                          <span className="rqtc-caret" />
                          <span className="rqtc-fico" aria-hidden="true">
                            📄
                          </span>
                          <span className="rqtc-fnm">{r.title || reqLabel(r)}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )
        })}
    </>
  )

  return (
    <div className="rqtc-shell">

      <div
        className={`rqtc${foldSide ? ' folded' : ''}`}
        ref={gridRef}
        style={foldSide ? undefined : { gridTemplateColumns: `${sideW}px 6px minmax(0, 1fr)` }}
      >
        {!foldSide && (
          <aside className="panel rqtc-side">
            {/* 판 이름 줄을 뺐다(지시) — 왼쪽 메뉴의 REQ-Coverage 가 이미
                무엇인지 말한다. 줄 하나가 통째로 트리 몫이 된다. */}
            {/* 2행 — 만들기와 손잡이들. 사진처럼 만들기가 왼쪽을 채우고
                정렬·더보기가 오른쪽 끝에 붙는다. */}
            <div className="rqtc-newf">
              {/* 「＋ New Folder」 를 뺐다(지시) — 폴더는 그 폴더의 ⋯ 에서
                  「Add subfolder」 로 만든다. 어디에 만드는지가 그 자리에
                  보여야 한다. */}
              {/* 남는 여백(sp)도 함께 걷는다 — 그 단추가 있던 자리가 그대로
                  빈칸으로 남아, 찾기 칸이 오른쪽 끝에 쪼그라들어 있었다(지적). */}
              {/* 찾기 — 정렬 **왼쪽**(지시). 무엇을 볼지 좁히는 일이라
                  차례 정하기보다 앞에 온다. */}
              <span className="rqtc-sidefind">
                <span className="rqtc-qico" aria-hidden="true">
                  <IconSearch />
                </span>
                <input
                  className="rqtc-q"
                  value={treeQ}
                  placeholder="폴더 찾기"
                  onChange={(e) => setTreeQ(e.target.value)}
                />
              </span>
              <FolderSortBtn value={fsort} onChange={setFsort} />
              {/* ⋯ — 여태 아무 일도 안 하는 단추였다(지적). 트리에 무엇까지
                  낼지를 여기서 고른다. 2열 ⋯ 와 같은 색·같은 꼴이다. */}
              <span className="rqtc-more">
                <button
                  type="button"
                  className={`rqtc-ib${sideMenu ? ' on' : ''}`}
                  aria-haspopup="menu"
                  aria-expanded={sideMenu}
                  title="트리에 무엇까지 낼지"
                  onClick={() => setSideMenu((v) => !v)}
                >
                  ⋯
                </button>
                {sideMenu && (
                  <>
                    <div className="tc-menu-back" onClick={() => setSideMenu(false)} />
                    <div className="tc-menu" role="menu">
                      <button
                        type="button"
                        className={!treeReqs ? 'on' : ''}
                        onClick={() => {
                          setTreeReqs(false)
                          setSideMenu(false)
                        }}
                      >
                        <i className="tc-menu-tick">{!treeReqs ? '✓' : ''}</i>
                        폴더만 보기
                      </button>
                      <button
                        type="button"
                        className={treeReqs ? 'on' : ''}
                        onClick={() => {
                          setTreeReqs(true)
                          setSideMenu(false)
                        }}
                      >
                        <i className="tc-menu-tick">{treeReqs ? '✓' : ''}</i>
                        폴더 + 요구사항
                      </button>
                    </div>
                  </>
                )}
              </span>
              <button
                type="button"
                className={`rqtc-ib${gpOpen ? ' on' : ''}`}
                title="전역 파라미터 — 스텝에서 ${이름} 으로 쓰는 값"
                aria-pressed={gpOpen}
                onClick={() => setGpOpen((v) => !v)}
              >
                <IconParam />
              </button>
            </div>
            {/* 3행 — 찾기. 여닫는 단추를 두면 한 번 더 눌러야 하고, 접혀
                있으면 걸러 볼 수 있다는 걸 모른다. 늘 보인다(사진). */}

            <div className="rqtc-tree">
              {/* 「전체」 에 떨어뜨리면 **맨 위로** 나온다 — 프로젝트 층이다.
                  이 자리가 없으면 한 번 폴더 안에 넣은 것을 다시 꺼낼 길이
                  드래그에는 없어서, 꺼낼 때만 메뉴를 써야 한다. */}
              <div
                className={`rqtc-fold${cat === '' ? ' on' : ''}${dropCat === '\u0000root' ? ' drop' : ''}`}
                onClick={() => pickFolder('')}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes('text/utop-cat')) return
                  if (!dragCat || !cats.find((x) => x.id === dragCat)?.parent_id) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  setDropCat('\u0000root')
                }}
                onDragLeave={() => setDropCat((v) => (v === '\u0000root' ? '' : v))}
                onDrop={(e) => {
                  const moved = e.dataTransfer.getData('text/utop-cat')
                  setDropCat('')
                  setDragCat('')
                  if (!moved) return
                  e.preventDefault()
                  const src = cats.find((x) => x.id === moved)
                  if (!src || !src.parent_id) return
                  void doMove(moved, src.name, null)
                }}
              >
                <span className="rqtc-caret" />
                {/* 「전체」 는 서랍 — 프로젝트를 담는 자리다 */}
                <span className="rqtc-fico" aria-hidden="true">
                  🗃
                </span>
                <span className="rqtc-fnm">전체</span>
                <span className="rqtc-rt">
                  ({reqs.filter(inPrj).length} /{' '}
                  {tcs.filter((t) => {
                    const r = reqById.get(String(t.req_id ?? ''))
                    return !!r && inPrj(r)
                  }).length}
                  )
                </span>
              </div>
              <Tree parent={null} depth={0} />
            </div>
          </aside>
        )}
        {!foldSide && (
          <Resizer
            label="폴더 판 폭 조절"
            onResize={setSideW}
            getOrigin={() => gridRef.current?.getBoundingClientRect().left ?? 0}
          />
        )}

        <section className="panel rqtc-main">
          {/* ── 무엇을 셀지 고르는 토글(목업 확정) ── */}
          {/* **전역 파라미터에서는 이 줄이 통째로 없다(지시).**
              빵부스러기도 저장도 그 화면 것이 아니라 「← 목록」 하나만
              남았는데, 그러자고 줄 하나와 구분선을 쓰는 건 빈 띠를 그리는
              일이다(지적). 돌아가는 길은 1열의 {} 단추가 그대로 쥐고 있다 —
              누르면 켜지고 다시 누르면 꺼진다. */}
          {!gpOpen && (
          <div className="rqtc-modebar">
            {/* 폴더 판 여닫기 — 접으면 1열이 **통째로 사라지고**, 다시 펴는
                길은 여기뿐이다(지시·Testiny). 그래서 이 단추는 접었든 폈든
                늘 같은 자리에 서 있어야 한다. */}
            {/* 상세를 열면 이 자리에 **목록·저장**이 선다(지시).
                판 여닫기와 만들기는 목록을 볼 때 쓰는 것이라, 상세에서는
                자리만 먹는다. 줄 하나가 통째로 준다. */}
            {gpOpen ? (
              /* 전역 파라미터는 제 화면 안에 「저장됨」 과 닫기를 갖고 있다.
                 여기 줄까지 두면 같은 말이 두 줄로 나간다(지적) — 돌아가는
                 길만 남긴다. */
              <button type="button" className="btn small" onClick={() => setGpOpen(false)}>
                ← 목록
              </button>
            ) : openReq || openTc ? (
              <>
                <button
                  type="button"
                  className="btn small"
                  onClick={() => {
                    setOpenReq('')
                    setOpenTc('')
                    setGpOpen(false)
                  }}
                >
                  ← 목록
                </button>
                {/* 「저장」 은 상태 표시다 — 상태·우선순위는 고치는 즉시
                    저장되므로 누를 것이 없다. 눌러야 저장되는 줄 알고 안
                    누른 채 나가는 일이 없어야 한다. */}
                {/* 단추 꼴로 세운다(지시). 눌러도 되지만, 상태·우선순위는
                    고치는 즉시 저장되므로 대개 누를 일이 없다 — 눌렀을 때는
                    지금 값을 한 번 더 저장한다. */}
                {/* 고친 것이 있으면 **초록으로 살아난다**(지시) — 누르기
                    전에는 저장할 것이 없다는 뜻이라 쉰 채로 둔다. */}
                {openTc ? (
                  <>
                    <button
                      type="button"
                      className={`btn small rqtc-savebtn${tcApi2?.dirty ? ' dirty' : ''}`}
                      disabled={!tcApi2?.dirty || !!tcApi2?.saving}
                      title={tcApi2?.dirty ? '고친 값을 저장합니다' : '고친 것이 없습니다'}
                      onClick={() => tcApi2?.save()}
                    >
                      {tcApi2?.saving ? '저장 중…' : '저장'}
                    </button>
                    {/* ⋯ 는 **줄 오른쪽 끝**으로(지시). 빵부스러기와 섞이면
                        자리 이야기 중간에 할 일이 끼어든다. 그리려면 자리를
                        빵부스러기 뒤로 미뤄야 해서, 아래 줄 끝에서 낸다. */}
                  </>
                ) : (
                  <button
                    type="button"
                    className={`btn small rqtc-savebtn${Object.keys(reqDraft).length ? ' dirty' : ''}`}
                    disabled={!Object.keys(reqDraft).length || saveState === 'saving'}
                    title={Object.keys(reqDraft).length ? '고친 값을 저장합니다' : '고친 것이 없습니다'}
                    onClick={async () => {
                      if (!openReq || !Object.keys(reqDraft).length) return
                      await setOneField('req', openReq, reqDraft)
                      setReqDraft({})
                      setToast('저장되었습니다')
                      window.setTimeout(() => setToast(''), 1800)
                    }}
                  >
                    {saveState === 'saving' ? '저장 중…' : '저장'}
                  </button>
                )}
              </>
            ) : (
              <button
                type="button"
                className="rqtc-ib rqtc-foldb"
                title={foldSide ? '폴더 판 펴기' : '폴더 판 접기'}
                onClick={() => setFoldSide((v) => !v)}
              >
                <IconPanel open={foldSide} />
              </button>
            )}
            {/* Requirements/Coverage 토글은 **상단바**로 올렸다(지시) —
                프로젝트 오른쪽, 세로선 너머다. 여기 또 두면 같은 것을 두 곳
                에서 고치게 된다. */}
            {/* 만들기 셋은 **⋯ 안으로**(지시). 늘 서 있을 필요가 없는
                것들이라 줄을 먹고 있었다 — 눌러서 꺼내 쓴다. */}
            {!openReq && !openTc && !gpOpen && (
            <div className="rqtc-more">
              <button
                type="button"
                className="rqtc-ib rqtc-newb"
                aria-haspopup="menu"
                aria-expanded={newOpen}
                title="만들기"
                onClick={() => setNewOpen((v) => !v)}
              >
                ⋯
              </button>
              {newOpen && (
                <>
                  <div className="tc-menu-back" onClick={() => setNewOpen(false)} />
                  <div className="tc-menu" role="menu">
                    <button
                      type="button"
                      onClick={() => {
                        setNewOpen(false)
                        if (mode === 'req') setEditReq(null)
                        else setEditTc(null)
                      }}
                    >
                      ＋ New
                    </button>
                    <button
                      type="button"
                      title="엑셀·문서에서 붙여넣어 여러 건을 한 번에 만듭니다"
                      onClick={() => {
                        setNewOpen(false)
                        setBulkNew(true)
                      }}
                    >
                      ＋ Bulk New
                    </button>
                    {mode === 'tc' && (
                      <button
                        type="button"
                        title="다른 폴더·요구사항의 시험을 복사해 옵니다"
                        onClick={() => {
                          setNewOpen(false)
                          setCopyOpen(true)
                        }}
                      >
                        ＋ Copy
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
            )}
            {/* 세로선 — 왼쪽은 「무엇을 볼지·무엇을 만들지」, 오른쪽은
                「지금 어디를 보고 있나」(빵부스러기)다(지시). */}
            <span className="rqtc-vsep" aria-hidden="true" />
            {/* 여기 있던 여백(sp)을 걷어낸다.
                왼쪽에 Requirements/Coverage 토글과 만들기 단추들이 서 있던
                시절의 것이다. 토글은 상단바로, 만들기는 ⋯ 와 떠오르는 줄로
                옮겼는데 여백만 남아, 빵부스러기가 빈칸만큼 오른쪽으로 밀려
                가운데에 떠 있었다(지적). 자리를 말하는 줄은 세로선 바로
                오른쪽에서 시작한다. */}
            {!gpOpen && (
            <div className="rqtc-crumb">
              {tcCrumb ? (
                /* 시험을 열었을 때 — 이 줄이 **그 시험의 자리**를 말한다.
                   끼워 넣은 화면의 같은 줄은 감춘다(.rqtc-embed .rq-bar). */
                <>
                  {/* 「← 목록」 은 여기 두지 않는다 — 바로 아래 할 일 줄에
                      끼워 넣은 화면이 이미 그린다. 둘이 되면 어느 것을
                      눌러야 하는지 묻게 된다(지적). 이 줄은 **자리**만
                      말하고, 되돌아가려면 첫 칸 「Coverage」 를 누른다. */}
                  {/* 뿌리 칸(「Coverage」)은 뺐다(지적) — 그런 화면이 이제
                      없다. 자리는 폴더에서 시작한다. */}
                  {tcCrumb.folders.map((c, i) => (
                    <span className="rqtc-crumbi" key={c.id}>
                      <i className="rqtc-sep">/</i>
                      {/* 1열 트리와 **같은 그림**을 쓴다(지시) — 맨 앞은
                          프로젝트(집), 그 아래는 폴더. 같은 자리를 가리키는데
                          그림이 다르면 같은 것인 줄 모른다. */}
                      <span className="rqtc-cfico" aria-hidden="true">
                        {i === 0 ? '🏠' : '📁'}
                      </span>
                      <button
                        type="button"
                        className="rqtc-crumbgo"
                        onClick={() => {
                          setOpenTc('')
                          pickFolder(c.id)
                        }}
                      >
                        {c.name}
                      </button>
                    </span>
                  ))}
                  {tcCrumb.req && (
                    <span className="rqtc-crumbi">
                      <i className="rqtc-sep">/</i>
                      <button
                        type="button"
                        className="rqtc-crumbgo"
                        title="이 요구사항을 엽니다"
                        onClick={() => {
                          setOpenTc('')
                          setOpenReq(reqPk(tcCrumb.req as Requirement))
                        }}
                      >
                        {tcCrumb.req.title || reqLabel(tcCrumb.req)}
                      </button>
                    </span>
                  )}
                  <span className="rqtc-crumbi">
                    <i className="rqtc-sep">/</i>
                    <b className="rqtc-crumbgo last">{tcCrumb.name}</b>
                  </span>
                  {/* 시험 배지도 누르면 주소가 복사된다(지시) —
                      요구사항 쪽과 같은 꼴이다. */}
                  <button
                    type="button"
                    className={`rqtc-popid rqtc-copyid${copiedId ? ' done' : ''}`}
                    title="이 시험으로 바로 가는 주소를 복사합니다"
                    onClick={() => copyLink('tc', openTc)}
                  >
                    {copiedId ? '주소 복사됨' : openTc}
                  </button>
                </>
              ) : reqCrumb ? (
                <>
                  <span className="rqtc-crumbi">
                    <button type="button" className="rqtc-crumbgo" onClick={() => setOpenReq('')}>
                      Requirements
                    </button>
                  </span>
                  {reqCrumb.folders.map((c, i) => (
                    <span className="rqtc-crumbi" key={c.id}>
                      <i className="rqtc-sep">/</i>
                      {/* 1열 트리와 **같은 그림**을 쓴다(지시) — 맨 앞은
                          프로젝트(집), 그 아래는 폴더. 같은 자리를 가리키는데
                          그림이 다르면 같은 것인 줄 모른다. */}
                      <span className="rqtc-cfico" aria-hidden="true">
                        {i === 0 ? '🏠' : '📁'}
                      </span>
                      <button
                        type="button"
                        className="rqtc-crumbgo"
                        onClick={() => {
                          setOpenReq('')
                          pickFolder(c.id)
                        }}
                      >
                        {c.name}
                      </button>
                    </span>
                  ))}
                  <span className="rqtc-crumbi">
                    <i className="rqtc-sep">/</i>
                    <b className="rqtc-crumbgo last">{reqCrumb.name}</b>
                  </span>
                  {/* 배지 — 누르면 이 자리 주소가 복사된다(지시).
                      말로 「REQ-2632-0003 보세요」 하면 상대가 다시 찾는다. */}
                  <button
                    type="button"
                    className={`rqtc-popid rqtc-copyid${copiedId ? ' done' : ''}`}
                    title="이 요구사항으로 바로 가는 주소를 복사합니다"
                    onClick={() => copyLink('req', reqCrumb.label)}
                  >
                    {copiedId ? '주소 복사됨' : reqCrumb.label}
                  </button>
                </>
              ) : crumb.length ? (
                crumb.map((c, i) => (
                  <span className="rqtc-crumbi" key={c.id}>
                    {i > 0 && <i className="rqtc-sep">/</i>}
                    {/* 폴더 그림 — 「이건 폴더다」 를 글자 앞에서 말한다 */}
                    <span className="rqtc-cfico" aria-hidden="true">
                      {i === 0 ? '🏠' : '📁'}
                    </span>
                    <button
                      type="button"
                      className={`rqtc-crumbgo${i === crumb.length - 1 ? ' last' : ''}`}
                      onClick={() => pickFolder(c.id)}
                    >
                      {c.name}
                    </button>
                  </span>
                ))
              ) : null /* 폴더를 안 골랐을 때 「전체」 라 적던 것을 뺀다(지시) —
                           1열의 「전체」 줄이 이미 그 말을 하고 있다 */}
              {/* 「링크 복사」 는 뺐다(지시) — 주소창이 이제 지금 보는 것을 그대로
                  적으므로 주소를 그냥 복사하면 된다. 같은 일을 하는 단추가
                  둘이면 어느 쪽이 맞는지 묻게 된다. */}
              {/* 「이 요구사항만」 걸린 상태를 늘 보이게 — 안 보이면 왜 몇 건뿐인지 모른다 */}
              {onlyReq && (
                <span className="rqtc-scope">
                  {reqLabel(onlyReq)} {onlyReq.title}
                  <button type="button" title="이 요구사항 좁히기 해제" onClick={() => setReqOnly('')}>
                    ✕
                  </button>
                </span>
              )}
              {/* 「하위 폴더 포함」 은 뺐다(지시) — 폴더를 고르면 그 아래까지 함께
                  보는 것이 사람이 기대하는 바다. */}
            </div>
            )}
            <span className="sp" />
            {/* 여기부터는 **목록을 어떻게 볼지** 정하는 것들이다 — 미커버만·
                찾기·정렬·열 고르기. 상세를 열면 목록이 없으므로 다 치운다.
                할 일도 없는 단추가 자리를 먹으면 빵부스러기가 밀려 두 줄로
                접힌다(지적: 빵부스러기가 잘린다). 치우면 그 줄이 통째로
                자리 이야기 몫이 된다. */}
            {openTc && tcApi2?.menu && (
              <span className="rqtc-tcmore">{tcApi2.menu}</span>
            )}
            {!openTc && !openReq && !gpOpen && (
            <>
            <span className="rqtc-vsep" aria-hidden="true" />
            {/* 미커버만 — 찾기 칸 왼쪽(지시). 둘 다 「무엇을 볼지」 를 좁히는
                것이라 나란히 있어야 한 묶음으로 읽힌다. */}
            {mode === 'req' && (
              <label className="rqtc-only">
                <input type="checkbox" checked={onlyBare} onChange={(e) => setOnlyBare(e.target.checked)} />
                미커버만
              </label>
            )}
            <input
              className="rqtc-q top"
              value={q}
              placeholder={mode === 'req' ? '요구사항 찾기 (이름 · ID)' : '시험 찾기 (이름 · TC ID)'}
              onChange={(e) => setQ(e.target.value)}
            />
            {/* 정렬·열 고르기 — **찾기 칸 오른쪽**(지시). 도구줄에 두었더니
                만들기·지우기와 한 줄에 섞여, 「무엇을 하는 단추」 와 「어떻게
                볼지 정하는 단추」 가 구별되지 않았다. 정렬이 ⚙ 왼쪽에 선다. */}
            {/* ⋯ 를 뺐다(지시) — 안에 있던 「파일로 내보내기·가져오기」 는
                아래 떠오르는 줄로 옮겼다. 하는 일이 고른 것에 매이므로 고른
                것 옆이 제자리다. */}
            {mode === 'tc' && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".json,application/json"
                  hidden
                  onChange={(e) => {
                    const f2 = e.target.files?.[0]
                    e.target.value = ''
                    if (f2) void importTc(f2)
                  }}
                />
              </>
            )}
            <ListSortBtn value={listSort} onChange={setListSort} />
            <button
              type="button"
              className="rqtc-ib"
              title="INFO 필드 보이기/숨기기 — SETUP 구성과 같은 목록"
              aria-expanded={!!gearAt}
              onClick={(e) => setGearAt(gearAt ? null : { x: e.clientX, y: e.clientY })}
            >
              <IconSettings />
            </button>
            {gearAt && (
              <>
                <div className="tc-menu-back" style={{ zIndex: 60 }} onClick={() => setGearAt(null)} />
                <div
                  className="tc-menu tc-colpop"
                  role="menu"
                  style={{
                    position: 'fixed',
                    left: Math.max(8, gearAt.x - 170),
                    top: gearAt.y + 10,
                    right: 'auto',
                    zIndex: 61,
                  }}
                >
                  {infoCols.length === 0 && (
                    <span className="muted small">INFO 필드가 없습니다 — SETUP 에서 만듭니다</span>
                  )}
                  {infoCols.map((c2) => (
                    <label key={c2.k}>
                      <input
                        type="checkbox"
                        checked={isOn(c2.k)}
                        onChange={() =>
                          setShowCols((s2) => {
                            const n2 = new Set(s2 ?? infoCols.map((c3) => c3.k))
                            if (n2.has(c2.k)) n2.delete(c2.k)
                            else n2.add(c2.k)
                            return n2
                          })
                        }
                      />
                      {c2.label}
                    </label>
                  ))}
                </div>
              </>
            )}
            </>
            )}
          </div>
          )}

          {/* 도구줄 — 요구사항·시험항목 화면의 그 줄을 그대로 옮겨 왔다(지시).
              만들기는 늘 서 있고, 고른 뒤에만 고치기·복제·삭제가 선다:
                없음    → ＋New · ＋Bulk New (시험은 ＋Copy 도)
                1건     → … | Edit  Clone | Delete
                2건 이상 → … | Bulk Edit  Clone | Delete
              삭제는 구분선 너머 끝자리다 — 되돌릴 수 없는 것은 손이 닿기
              어려운 곳에 둔다. */}
          {/* 제목을 누르면 표 자리에 **그 요구사항 화면**이 선다(지시).
              1열 폴더는 그대로 남아, 옆 것으로 넘어가기 쉽다. */}
          {gpOpen ? (
            <div className="rqtc-one">
              {/* 머리줄을 뺐다(지시) — 위 빵부스러기 줄에 이미 「← 목록」 이
                  있어 같은 말이 두 줄로 나갔다. */}
              {/* 설정 화면이 쓰는 **그 부품**을 그대로 얹는다 — 베껴 만들면
                  한쪽에서 고친 값이 다른 쪽에 안 보이는 날이 온다. */}
              <div className="rqtc-gp">
                <GlobalParams />
              </div>
            </div>
          ) : openTc ? (
            <div className="rqtc-one">
              {/* 머리줄이 없다 — 「목록으로」 · 제목 · 번호 · 「Coverage 에서
                  열기」 는 모두 **맨 윗줄**로 올라갔다(지시). 여기 두면
                  끼워 넣은 화면의 같은 줄과 둘이 되어, 「목록」 이 두 번
                  나온다(지적). */}
              {/* Coverage 화면을 통째로 얹는다 — 탭과 그 안의 동작이 **같은
                  코드**라 두 자리가 갈릴 수 없다. 베껴 만들면 한쪽만 고치는
                  날이 온다(옛 부품을 얹었다가 스텝을 하나도 못 읽어 물렸다). */}
              <div className="rqtc-embed">
                <TestCases
                  embedTc={openTc}
                  /* 「Coverage 에서 열기」 는 뺐다(지시) — 그 화면을 지웠으니
                     갈 곳이 없다. */
                  /* 끼운 화면의 「← 목록」 이 **이 화면의 목록**으로 오게 한다.
                     여태는 그 화면 제 목록으로 돌아가, 돌아와 보면 우리 표가
                     아니라 남의 표가 서 있었다 — TC ID 칸이 없는 그 표다
                     (지적: 목록으로 오면 TC ID 가 안 보인다). */
                  onEmbedBack={() => setOpenTc('')}
                  onEmbedApi={setTcApi2}
                />
              </div>
            </div>
          ) : openReq ? (
            <div className="rqtc-one">
              {/* 머리줄을 없앴다(지시) — 「목록·저장」 은 맨 윗줄로 갔고,
                  「이 요구사항의 시험 보기」·「고치기」 는 뺐다. 탭이 바로
                  시작하니 줄 두 개가 준다. */}
              <ReqBody
                req={reqById.get(openReq)}
                tcs={tcOf.get(openReq) ?? []}
                tab={openTab}
                setTab={setOpenTab}
                edit={{
                  status: String(reqDraft.status ?? reqById.get(openReq)?.status ?? ''),
                  priority: String(reqDraft.priority ?? reqById.get(openReq)?.priority ?? ''),
                  statuses: REQ_STATUS,
                  priorities: REQ_PRIORITY,
                  /* 고친 값은 **들고만 있는다** — 나가는 것은 저장 단추다(지시) */
                  onChange: (p) => setReqDraft((d) => ({ ...d, ...p })),
                }}
              />
            </div>
          ) : (
          <div className="rqtc-tbl">
            {mode === 'req' ? (
              <>
                <div className="rqtc-tr rqtc-th" style={{ gridTemplateColumns: gridOf(false) }}>
                  <div className="c-chk">
                    <input
                      type="checkbox"
                      aria-label="전체 고르기"
                      checked={reqRows.length > 0 && sel.size === reqRows.length}
                      ref={(el) => {
                        if (el) el.indeterminate = sel.size > 0 && sel.size < reqRows.length
                      }}
                      onChange={(e) => setSel(e.target.checked ? new Set(reqRows.map(reqPk)) : new Set())}
                    />
                  </div>
                  {/* 몇 번째 줄인가 — ID 는 뜻을 담은 이름이라
                      「지금 어디쯤」 을 못 말해 준다. 쪽을 넘겨도 이어진다. */}
                  <div className="c-no">No</div>
                  <div className="c-id">ID</div>
                  <div className="c-title">제목</div>
                  <div className="c-mg">모델그룹</div>
                  <div className="c-md">모델명</div>
                  {/* 이 칸이 세는 것은 「그 요구사항을 덮은 시험」 이다(지시) */}
                  <div className="c-tc">Coverage</div>
                  {/* 붙였다 떼는 자리 — 보여 주기(TC Map)와는 다른 일이다 */}
                  <div className="c-mapb">Map</div>
                  {/* 어느 시험이 덮고 있나 — 숫자만으로는 「무엇이」 를 모른다.
                      Coverage 모드의 REQ Map 과 짝이다(지시). */}
                  <div className="c-map">TC Map</div>
                  {visCols.map((c) => (
                    <div key={c.k}>{c.label}</div>
                  ))}
                </div>
                {reqPageRows.map((r, i) => {
                  const pk = reqPk(r)
                  const n = tcOf.get(pk)?.length ?? 0
                  const p = prjOf(r)
                  return (
                    <div
                      className={`rqtc-tr${sel.has(pk) ? ' picked' : ''}`}
                      style={{ gridTemplateColumns: gridOf(false) }}
                      key={pk}
                      /* 줄 전체를 누르는 것은 뺐다(지시) — ID 는 팝업, 제목은
                         이 화면으로 간다. 줄까지 누르는 자리가 되면 어디를
                         눌렀는지에 따라 다른 일이 나서 헷갈린다. */
                    >
                      <div className="c-chk" onClick={(e) => e.stopPropagation()}>
                        {/* 점 여섯 — 잡아서 왼쪽 폴더로 끌면 그 폴더로 옮긴다
                            (지시·Testiny). 줄 전체를 끌게 하면 「눌러서 보기」
                            와 헷갈려, 보려던 것이 옮겨진다. */}
                        <span
                          className="rqtc-grip"
                          draggable
                          title="끌어서 왼쪽 폴더로 옮기기"
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/utop-req', dragIds(pk).join(','))
                            e.dataTransfer.effectAllowed = 'move'
                          }}
                        >
                          <IconGrip />
                        </span>
                        <input type="checkbox" checked={sel.has(pk)} onChange={() => toggle(sel, pk, setSel)} />
                      </div>
                      {/* 쪽을 넘겨도 이어지는 번호 — 매 쪽 1부터 다시 세면
                          「200개 중 어디」 를 못 읽는다 */}
                      <div className="c-no">{from + i + 1}</div>
                      <div className="c-id">
                        <button
                          type="button"
                          className="rqtc-rid"
                          title="요구사항 상세"
                          onClick={(e) => {
                            e.stopPropagation()
                            setPop({ kind: 'req', id: pk })
                          }}
                        >
                          {reqLabel(r)}
                        </button>
                      </div>
                      <div className="c-title">
                        <button
                          type="button"
                          className="rqtc-rtitle as-link"
                          title="눌러서 이 요구사항 화면 보기"
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenReq(pk)
                            setOpenTab('info')
                          }}
                        >
                          {r.title || '(제목 없음)'}
                        </button>
                      </div>
                      <div className="c-mg">{p?.model_group || '–'}</div>
                      <div className="c-md">{p?.model || '–'}</div>
                      <div className="c-tc rqtc-fillc">
                        <span className={`rqtc-cov ${n ? 'ok' : 'no'}`}>{n ? `TC ${n}` : '미커버'}</span>
                      </div>
                      <div className="c-mapb" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="rqtc-mapb"
                          title="시험 연결 — 체크해서 붙였다 뗍니다"
                          onClick={(e) => {
                            e.stopPropagation()
                            setMapFor(r)
                          }}
                        >
                          Map
                        </button>
                      </div>
                      <div className="c-map" onClick={(e) => e.stopPropagation()}>
                        {n ? (
                          <>
                            <button
                              type="button"
                              className="rqtc-rid tc"
                              title={(tcOf.get(pk) ?? []).map((t) => t.tcid).join(', ')}
                              onClick={(e) => {
                                e.stopPropagation()
                                setPop({ kind: 'tc', id: (tcOf.get(pk) ?? [])[0]!.tcid })
                              }}
                            >
                              {(tcOf.get(pk) ?? [])[0]!.tcid}
                            </button>
                            {n > 1 && (
                              <button
                                type="button"
                                className="rqtc-more-n"
                                title="이 요구사항의 시험 모두 보기"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  goTcOf(pk)
                                }}
                              >
                                +{n - 1}
                              </button>
                            )}
                          </>
                        ) : (
                          '–'
                        )}
                      </div>
                      {/* 켜진 열 — 상태·우선순위는 그 자리에서 고칠 수 있고,
                          커스텀 필드는 값만 낸다 */}
                      {visCols.map((c) =>
                        c.k === 'f_status' ? (
                          <Fill
                            key={c.k}
                            kind="req_status"
                            v={r.status}
                            cls="c-st"
                            f={codeFill}
                            opts={REQ_STATUS}
                            onSave={(x) => void setOneField('req', pk, { status: x })}
                            onFill={(e) =>
                              setRowMenu({ kind: 'req', id: pk, field: 'status', label: '상태', value: String(r.status ?? ''), x: e.clientX, y: e.clientY })
                            }
                          />
                        ) : c.k === 'f_priority' ? (
                          <Fill
                            key={c.k}
                            kind="req_priority"
                            v={r.priority}
                            cls="c-pr"
                            f={codeFill}
                            opts={REQ_PRIORITY}
                            onSave={(x) => void setOneField('req', pk, { priority: x })}
                            onFill={(e) =>
                              setRowMenu({ kind: 'req', id: pk, field: 'priority', label: '우선순위', value: String(r.priority ?? ''), x: e.clientX, y: e.clientY })
                            }
                          />
                        ) : (
                          <div className="ell" key={c.k}>
                            {colVal(r as unknown as Record<string, unknown>, c.k)}
                          </div>
                        ),
                      )}
                    </div>
                  )
                })}
                {!reqRows.length && <div className="empty">보여 줄 요구사항이 없습니다.</div>}
              </>
            ) : (
              <>
                <div className="rqtc-tr tc rqtc-th" style={{ gridTemplateColumns: gridOf(true) }}>
                  <div className="c-chk">
                    <input
                      type="checkbox"
                      aria-label="전체 고르기"
                      checked={tcRows.length > 0 && sel.size === tcRows.length}
                      ref={(el) => {
                        if (el) el.indeterminate = sel.size > 0 && sel.size < tcRows.length
                      }}
                      onChange={(e) => setSel(e.target.checked ? new Set(tcRows.map((t) => t.tcid)) : new Set())}
                    />
                  </div>
                  {/* 몇 번째 줄인가 — ID 는 뜻을 담은 이름이라
                      「지금 어디쯤」 을 못 말해 준다. 쪽을 넘겨도 이어진다. */}
                  <div className="c-no">No</div>
                  <div className="c-id">ID</div>
                  <div className="c-title">제목</div>
                  <div className="c-mg">모델그룹</div>
                  <div className="c-md">모델명</div>
                  {/* 유형·상태·중요도·타입·구분은 이제 **켜진 열** 쪽에서 나온다
                      (⚙ 로 켜고 끈다) — 여기 또 두면 머리와 몸이 어긋난다. */}
                  <div className="c-last">최근 결과</div>
                  {/* 붙였다 떼는 자리 — 오른쪽 REQ Map 은 붙은 것을 보여
                      주기만 한다(요구사항 쪽 Map · TC Map 과 같은 짝). */}
                  <div className="c-mapb">Map</div>
                  <div className="c-map">REQ Map</div>
                  {visCols.map((c) => (
                    <div key={c.k}>{c.label}</div>
                  ))}
                </div>
                {tcPageRows.map((t, i) => {
                  const r = reqById.get(String(t.req_id ?? ''))
                  const p = prjOf(r)
                  const last = lastOf(t.tcid)
                  return (
                    <div
                      className={`rqtc-tr tc${sel.has(t.tcid) ? ' picked' : ''}`}
                      style={{ gridTemplateColumns: gridOf(true) }}
                      key={t.tcid}
                    >
                      <div className="c-chk" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={sel.has(t.tcid)}
                          onChange={() => toggle(sel, t.tcid, setSel)}
                        />
                      </div>
                      {/* 쪽을 넘겨도 이어지는 번호 — 매 쪽 1부터 다시 세면
                          「200개 중 어디」 를 못 읽는다 */}
                      <div className="c-no">{from + i + 1}</div>
                      <div className="c-id">
                        <button
                          type="button"
                          className="rqtc-rid tc"
                          title="시험항목 상세"
                          onClick={(e) => {
                            e.stopPropagation()
                            setPop({ kind: 'tc', id: t.tcid })
                          }}
                        >
                          {t.tcid}
                        </button>
                      </div>
                      <div className="c-title">
                        <button
                          type="button"
                          className="rqtc-rtitle as-link"
                          title="눌러서 이 시험항목 화면 보기"
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenTc(t.tcid)
                          }}
                        >
                          {t.name || '(제목 없음)'}
                        </button>
                      </div>
                      {/* 시험은 제 모델 값을 갖고 있다 — 없으면 프로젝트 값으로 */}
                      <div className="c-mg">{String(t.model_group ?? '') || p?.model_group || '–'}</div>
                      <div className="c-md">{String(t.model ?? '') || p?.model || '–'}</div>
                      <div className="c-last rqtc-fillc">
                        {last ? (
                          <span className={`rqtc-lastv ${statusClass(last)}`}>{last}</span>
                        ) : (
                          <span className="rqtc-fill none">–</span>
                        )}
                      </div>
                      <div className="c-mapb" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="rqtc-mapb"
                          title="요구사항 연결 — 체크해서 붙였다 뗍니다"
                          onClick={(e) => {
                            e.stopPropagation()
                            setMapTcFor(t)
                          }}
                        >
                          Map
                        </button>
                      </div>
                      <div className="c-map">
                        {r ? (
                          <button
                            type="button"
                            className="rqtc-rid"
                            onClick={(e) => {
                              e.stopPropagation()
                              setPop({ kind: 'req', id: reqPk(r) })
                            }}
                          >
                            {reqLabel(r)}
                          </button>
                        ) : (
                          '–'
                        )}
                      </div>
                      {/* 켜진 열 — 상태·중요도는 그 자리에서 고칠 수 있다 */}
                      {visCols.map((c) => {
                        const F = (
                          kind: string,
                          v: unknown,
                          cls: string,
                          opts?: readonly string[],
                          field?: string,
                          label?: string,
                        ) => (
                          <Fill
                            key={c.k}
                            kind={kind}
                            v={String(v ?? '')}
                            cls={cls}
                            f={codeFill}
                            opts={opts}
                            onSave={field ? (x) => void setOneField('tc', t.tcid, { [field]: x }) : undefined}
                            onFill={
                              field
                                ? (e) =>
                                    setRowMenu({
                                      kind: 'tc',
                                      id: t.tcid,
                                      field,
                                      label: label ?? '',
                                      value: String(v ?? ''),
                                      x: e.clientX,
                                      y: e.clientY,
                                    })
                                : undefined
                            }
                          />
                        )
                        if (c.k === 'f_type') return F('tc_type', t.type, 'c-ty')
                        if (c.k === 'f_status') return F('tc_status', t.status, 'c-st', TC_STATUS, 'status', '상태')
                        if (c.k === 'f_severity')
                          return F('tc_severity', t.severity, 'c-sv', TC_SEVERITY, 'severity', '중요도')
                        if (c.k === 'f_kind') return F('tc_run_type', t.run_type, 'c-rt')
                        if (c.k === 'f_origin') return F('tc_origin', t.origin, 'c-og')
                        return (
                          <div className="ell" key={c.k}>
                            {colVal(t as unknown as Record<string, unknown>, c.k)}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
                {!tcRows.length && (
                  <div className="rqtc-none">
                    {onlyReq ? (
                      <>
                        <b>이 요구사항에는 시험이 없습니다</b>
                        <span>위 ＋New 로 만들면 이 요구사항에 바로 붙습니다</span>
                      </>
                    ) : (
                      <b>보여 줄 시험이 없습니다.</b>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          )}

          {/* 쪽 나누기 — 왼쪽에 「몇 번째부터 몇 번째, 모두 몇 건」,
              오른쪽에 쪽 번호(사진). 한 쪽이면 번호는 안 낸다.

              **상세를 열면 감춘다**(지시). 그 줄은 목록이 몇 건인지를 말하는데,
              지금 화면에 목록이 없다. 「1 – 62 of 62」 가 상세 밑에 남아 있으면
              무엇을 세는 숫자인지 알 수 없다. */}
          {!gpOpen && !openTc && !openReq && (
          <div className="rqtc-pager">
            <span className="rqtc-pgn">
              {rowsN === 0 ? 0 : from + 1} – {Math.min(from + per, rowsN)}
              <select value={per} onChange={(e) => setPer(Number(e.target.value))}>
                {[50, 100, 200, 500].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              of {rowsN}
            </span>
            {/* 미커버는 남긴다 — 요약 줄은 없앴지만(지시) 이 수는 이 화면이
                있는 까닭이다. 줄을 늘리지 않으려고 쪽 줄에 얹었다. */}
            {mode === 'req' && bare > 0 && (
              <span className="rqtc-barepg">미커버 {bare}</span>
            )}
            <span className="sp" />
            {pageN > 1 && (
              <span className="rqtc-pg">
                <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  ‹
                </button>
                {pagesOf(page, pageN).map((p, i) =>
                  p === 0 ? (
                    <i key={`gap${i}`}>…</i>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      className={p === page ? 'on' : ''}
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </button>
                  ),
                )}
                <button type="button" disabled={page >= pageN} onClick={() => setPage(page + 1)}>
                  ›
                </button>
              </span>
            )}
          </div>
          )}

          {/* 아래 요약 줄은 뺐다(지시) — 쪽 나누기 줄이 바로 위에서 「몇 건」
              을 이미 말한다. 같은 수를 두 줄로 적으면 어느 것이 지금 보고
              있는 수인지 헷갈린다. */}
        </section>
      </div>

      {/* 저장 알림 — 오른쪽 위에 잠깐 떴다 사라진다(지시).
          단추 옆에 글자로 두면 저장했는지 눈이 안 간다. */}
      {toast && <div className="rqtc-toast">{toast}</div>}
      {editPrj && (() => {
        const p = projects.find((x) => x.cat_id === editPrj)
        if (!p) return null
        return (
          <EditProjectDialog
            project={p}
            onSaved={() => {
              setEditPrj('')
              setToast('저장되었습니다')
              window.setTimeout(() => setToast(''), 1800)
            }}
            onClose={() => setEditPrj('')}
          />
        )
      })()}
      {moving && (() => {
        const c = cats.find((x) => x.id === moving)
        if (!c) return null
        return (
          <MoveCatDialog
            cat={c}
            cats={cats}
            projectIds={new Set(projects.map((p) => p.cat_id))}
            onMove={(parent) => void doMove(c.id, c.name, parent)}
            onClose={() => setMoving('')}
          />
        )
      })()}

      {/* 고른 것에 하는 일 — **아래에서 떠오르는 줄**(승인).
          위 도구줄에 두었더니 고를 때마다 단추가 늘어났다 줄었다 하며 옆
          단추 자리가 밀려, 누르려던 곳이 다른 단추로 바뀌었다. 표 위에 떠
          있어 스무 줄 아래에서 골라도 위로 올라갈 일이 없다. */}
      {sel.size > 0 && (
        <div className="rqtc-act" role="toolbar" aria-label="고른 것에 할 일">
          <span className="rqtc-act-n">{sel.size}개 선택</span>
          <span className="rqtc-act-sep" aria-hidden="true" />
          {sel.size === 1 ? (
            <button
              type="button"
              onClick={() => {
                const id = [...sel][0]!
                if (mode === 'req') setEditReq(reqById.get(id) ?? null)
                else setEditTc(tcs.find((t) => t.tcid === id) ?? null)
              }}
            >
              Edit
            </button>
          ) : (
            <button type="button" onClick={() => setBulkEdit(true)}>
              Bulk Edit
            </button>
          )}
          {mode === 'req' && (
            <button type="button" disabled={!!actBusy} onClick={() => void cloneReqs()}>
              {actBusy === 'clone' ? '복제 중…' : 'Clone'}
            </button>
          )}
          {/* 「파일로 내보내기·가져오기」 는 뺐다(지시). 고른 것에 하는
              일 줄은 Edit·Clone·Delete 처럼 **이 화면 안에서 끝나는 일**만
              둔다 — 파일을 주고받는 것은 결이 다르고, 자리를 먹어 정작 자주
              쓰는 단추가 밀렸다. 기능 자체는 지우지 않았다: 파일 고르기
              입력과 exportTc·importTc 는 그대로라 자리만 정하면 다시 낸다. */}
          <span className="rqtc-act-sep" aria-hidden="true" />
          <button
            type="button"
            className="danger"
            disabled={!!actBusy}
            onClick={() => void deletePicked()}
          >
            {actBusy === 'del' ? '삭제 중…' : 'Delete'}
          </button>
          <button type="button" className="x" title="고르기 해제" onClick={() => setSel(new Set())}>
            ✕
          </button>
        </div>
      )}

      {/* 아래로 채우기 — 우클릭한 칸의 값을 그 아래 줄에 모두 넣는다.
          같은 값을 스무 줄에 손으로 고르는 일이 잦다. */}
      {rowMenu && (
        <div
          className="rqtc-ctx"
          style={{
            left: Math.min(rowMenu.x, window.innerWidth - 240),
            top: Math.min(rowMenu.y, window.innerHeight - 90),
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button type="button" disabled={!!actBusy} onClick={() => void fillDown()}>
            ⬇ 아래 줄에 {rowMenu.label} 「{rowMenu.value || '(빈 값)'}」 채우기
          </button>
        </div>
      )}

      {mapTcFor && (
        <TcMapReqDialog
          tc={mapTcFor}
          onClose={() => {
            setMapTcFor(null)
            void reqQ.refetch()
            void tcQ.refetch()
          }}
        />
      )}
      {mapFor && (
        <ReqMapDialog
          req={mapFor}
          onClose={() => {
            setMapFor(null)
            void reqQ.refetch()
            void tcQ.refetch()
          }}
        />
      )}

      {bulkNew &&
        (mode === 'req' ? (
          <ReqBulkForm presetFolder={cat || null} onClose={() => setBulkNew(false)} />
        ) : (
          <TcBulkForm onClose={() => setBulkNew(false)} />
        ))}
      {bulkEdit &&
        (mode === 'req' ? (
          <ReqBulkEdit
            ids={[...sel]}
            onClose={() => setBulkEdit(false)}
            onDone={() => {
              setBulkEdit(false)
              setSel(new Set())
              void reqQ.refetch()
            }}
          />
        ) : (
          <TcBulkEdit
            items={tcs.filter((t) => sel.has(t.tcid))}
            onClose={() => setBulkEdit(false)}
            onDone={() => {
              setBulkEdit(false)
              setSel(new Set())
              void tcQ.refetch()
            }}
          />
        ))}
      {copyOpen && (
        <CopyDialog
          onClose={() => setCopyOpen(false)}
          onDone={() => {
            setCopyOpen(false)
            void reqQ.refetch()
            void tcQ.refetch()
          }}
        />
      )}

      {pop && (
        <DetailPop
          kind={pop.kind}
          id={pop.id}
          req={pop.kind === 'req' ? reqs.find((x) => reqPk(x) === pop.id) : undefined}
          tcs={pop.kind === 'req' ? (tcOf.get(pop.id) ?? []) : []}
          onClose={() => setPop(null)}
          onEdit={() => {
            if (pop.kind === 'req') {
              const r = reqs.find((x) => reqPk(x) === pop.id)
              if (r) {
                setPop(null)
                setEditReq(r)
              }
            } else {
              const t = tcs.find((x) => x.tcid === pop.id)
              if (t) {
                setPop(null)
                setEditTc(t)
              }
            }
          }}
          onSeeTcs={pop.kind === 'req' ? () => { setPop(null); goTcOf(pop.id) } : undefined}
        />
      )}

      {editReq !== undefined && (
        <ReqForm
          editing={editReq}
          presetFolder={cat || null}
          onClose={() => {
            setEditReq(undefined)
            void reqQ.refetch()
          }}
        />
      )}
      {editTc !== undefined && (
        <TcForm
          editing={editTc}
          presetReqId={reqOnly || undefined}
          onClose={() => {
            setEditTc(undefined)
            void tcQ.refetch()
          }}
          onCreated={() => {
            setEditTc(undefined)
            void tcQ.refetch()
          }}
        />
      )}
    </div>
  )
}

/** 통채움 한 칸 — 셀 전체가 값의 색(먼데이). 색은 설정이 정본이다 */
/**
 * 통채움 칸. **고를 값(opts)을 주면 그 자리에서 고친다**(지시).
 *
 * 고치려고 상세를 열었다 닫는 걸음이 하루에도 여럿이다. 요구사항 화면이
 * 쓰는 PickCell 을 그대로 얹는다 — 평소엔 글자처럼 조용하고, 올리면 드러나고,
 * 고르면 바로 저장한다.
 */
function Fill({
  kind,
  v,
  cls,
  f,
  opts,
  onSave,
  onFill,
}: {
  kind: string
  v?: string | null
  cls: string
  f: (kind: string, value: string) => { bg: string; fg: string }
  opts?: readonly string[]
  onSave?: (v: string) => void
  /** 우클릭 = 아래로 채우기 */
  onFill?: (e: React.MouseEvent) => void
}) {
  const val = String(v ?? '')
  if (!opts || !onSave) {
    if (!val)
      return (
        <div className={`${cls} rqtc-fillc`}>
          <span className="rqtc-fill none">–</span>
        </div>
      )
    const c0 = f(kind, val)
    return (
      <div className={`${cls} rqtc-fillc`}>
        <span className="rqtc-fill" style={{ background: c0.bg, color: c0.fg }}>
          {val}
        </span>
      </div>
    )
  }
  const c = f(kind, val)
  return (
    <div
      className={`${cls} rqtc-fillc`}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        if (!onFill) return
        e.preventDefault()
        e.stopPropagation()
        onFill(e)
      }}
      title="고르면 바로 저장 · 우클릭 = 아래로 채우기"
    >
      <span
        className={`rqtc-fill${val ? '' : ' none'}`}
        style={val ? { background: c.bg, color: c.fg } : undefined}
      >
        <PickCell value={val} opts={opts} title="고르면 바로 저장됩니다" onSave={onSave} />
      </span>
    </div>
  )
}

/**
 * 상세 팝업 — **자세히 보는 자리**(지시). 3열로는 좁아서 팝업으로 넓게 본다.
 *
 * 보는 것은 여기서 다 한다(스텝·판정·결과까지). 다만 **고치는 것은 원래
 * 부품**으로 넘긴다 — 편집기를 복제하면 두 벌이 되고, 한쪽만 고치는 날이 온다.
 */
/** 요구사항 팝업의 탭 — Requirements 화면과 같은 차례 */
const REQ_TABS: Array<{ k: 'info' | 'detail' | 'tc' | 'runs' | 'history'; label: string }> = [
  { k: 'info', label: 'Info' },
  { k: 'detail', label: 'Intent' },
  { k: 'tc', label: 'Coverages' },
  { k: 'runs', label: 'Execution History' },
  { k: 'history', label: 'Change History' },
]

/**
 * 상세 팝업 — **자세히 보는 자리**(지시). 3열로는 좁아서 팝업으로 넓게 본다.
 *
 * 요구사항은 **이미 있는 부품**(ReqDetail — Requirements 화면이 쓰는 그것)을
 * 탭으로 갈아 끼운다. 시험은 아직 그런 부품이 없어(세부 판이 TestCases 안에
 * 박혀 있다) **읽어서 보이는 것**만 한다 — 고치는 것은 Coverage 로 넘긴다.
 */
function DetailPop({
  kind,
  id,
  req,
  tcs,
  onClose,
  onEdit,
  onSeeTcs,
}: {
  kind: 'req' | 'tc'
  id: string
  req?: Requirement
  tcs: TestCaseMeta[]
  onClose: () => void
  onEdit: () => void
  onSeeTcs?: () => void
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  if (kind === 'req')
    return <ReqPop id={id} req={req} tcs={tcs} onClose={onClose} onEdit={onEdit} onSeeTcs={onSeeTcs} />

  /* ── 시험항목 ──
     TcDetail 을 얹어 봤다가 물렸다: 그 부품은 스텝 종류가 manual/auto 둘뿐이던
     시절 것이라 `data.slots` 를 읽고(지금은 `sessions`), 스텝을 kind==='auto'
     로 거른다(지금은 cli·wait·diff…). 그래서 스텝 5개짜리 시험이 **「스텝이
     없습니다」** 로 보였다(지적) — 빈 화면이 거짓말을 하는 것이 제일 나쁘다.
     제대로 된 탭(Object·Traffic·Cycle 포함)은 Coverage 의 세부 판을 부품으로
     빼야 나온다. 그때까지는 **읽어서 보여 주는 것**만 정확히 한다. */
  return <TcPop id={id} onClose={onClose} onEdit={onEdit} />
}

/**
 * 시험항목 팝업 — **Coverage 화면을 통째로 얹는다**(지시: 실제 페이지와 동일하게).
 *
 * 세부 판을 부품으로 빼 오는 대신 그 화면 자체를 끼워 넣는다. 탭(Info·Object·
 * Topology·Traffic·Manual·Automation·Execution·Cycle)과 그 안의 동작이 **같은
 * 코드**라 두 자리가 갈릴 수 없다. 베껴 만들면 한쪽만 고치는 날이 온다 —
 * 실제로 옛 부품(TcDetail)을 얹었다가 스텝을 하나도 못 읽어 물렸다.
 */
function TcPop({ id, onClose }: { id: string; onClose: () => void; onEdit: () => void }) {
  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div
        className="modal rqtc-pop full"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 머리줄은 얇게 — **이름·자리는 안쪽 화면의 빵부스러기가 말한다**
            (지시: 시험항목 옆 ID 자리를 그걸로 대체). 여기서 또 적으면 같은
            말이 두 줄이 되고, 정작 어느 폴더의 시험인지는 안 보인다. */}
        <div className="modal-head slim">
          <span className="sp" />
          <button
            className="btn small"
            type="button"
            onClick={() => {
              goto('tc', id)
              onClose()
            }}
          >
            Coverage 에서 열기
          </button>
          <button className="btn small" type="button" onClick={onClose}>
            닫기
          </button>
        </div>
        <div className="rqtc-embed">
          <TestCases embedTc={id} />
        </div>
      </div>
    </div>
  )
}

function ReqPop({
  id,
  req,
  tcs,
  onClose,
  onEdit,
  onSeeTcs,
}: {
  id: string
  req?: Requirement
  tcs: TestCaseMeta[]
  onClose: () => void
  onEdit: () => void
  onSeeTcs?: () => void
}) {
  const [tab, setTab] = useState<'info' | 'detail' | 'tc' | 'runs' | 'history'>('info')
  /* ── 요구사항 — ReqDetail 을 탭으로 갈아 끼운다 ── */
  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div className="modal rqtc-pop wide" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <b>요구사항</b>
          <span className="rqtc-popid">{req ? reqLabel(req) : id}</span>
          <span className="sp" />
          {onSeeTcs && (
            <button className="btn small" type="button" onClick={onSeeTcs}>
              이 요구사항의 시험 보기
            </button>
          )}
          <button className="btn small primary" type="button" onClick={onEdit}>
            고치기
          </button>
          <button
            className="btn small"
            type="button"
            onClick={() => {
              goto('req', id)
              onClose()
            }}
          >
            Requirements 에서 열기
          </button>
          <button className="btn small" type="button" onClick={onClose}>
            닫기
          </button>
        </div>

        <ReqBody req={req} tcs={tcs} tab={tab} setTab={setTab} />
      </div>
    </div>
  )
}

/**
 * 요구사항 상세의 **속** — 탭과 몸.
 *
 * 팝업(ID 를 눌렀을 때)과 2열 화면(제목을 눌렀을 때)이 **같은 부품**을 쓴다.
 * 두 벌로 만들면 한쪽만 고치는 날이 오고, 같은 요구사항이 자리에 따라 다르게
 * 보인다.
 */
function ReqBody({
  req,
  tcs,
  tab,
  setTab,
  edit,
}: {
  req?: Requirement
  tcs: TestCaseMeta[]
  tab: 'info' | 'detail' | 'tc' | 'runs' | 'history'
  setTab: (t: 'info' | 'detail' | 'tc' | 'runs' | 'history') => void
  /** Info 의 상태·우선순위를 그 자리에서 고친다(지시) */
  edit?: {
    status: string
    priority: string
    statuses: readonly string[]
    priorities: readonly string[]
    onChange: (p: { status?: string; priority?: string }) => void
  }
}) {
  return (
    <>
      <div className="rqtc-poptabs">
        {REQ_TABS.map((t) => (
          <button
            key={t.k}
            type="button"
            className={tab === t.k ? 'on' : ''}
            onClick={() => setTab(t.k)}
          >
            {t.label}
            {t.k === 'tc' && <em>{tcs.length}</em>}
          </button>
        ))}
      </div>

      <div className="rqtc-popbody">
        {!req ? (
          <div className="empty">요구사항을 찾지 못했습니다.</div>
        ) : tab === 'tc' ? (
          /* Coverages — 붙은 시험. Requirements 화면도 이 목록을 제가 그린다 */
          tcs.length ? (
            <div className="rqtc-poplist">
              {tcs.map((t) => (
                <div className="rqtc-popline" key={t.tcid}>
                  <span className="rqtc-rid tc">{t.tcid}</span>
                  <span>{t.name || '(제목 없음)'}</span>
                  <span className="sp" />
                  {!!t.status && (
                    <span className={`rqtc-v ${statusClass(String(t.status))}`}>{String(t.status)}</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rqtc-popnone">덮는 시험이 없습니다</div>
          )
        ) : (
          <ReqDetail req={req} tcs={tcs} tab={tab} edit={edit} />
        )}
      </div>
    </>
  )
}
