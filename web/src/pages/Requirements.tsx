import { useEffect, useMemo, useRef, useState } from 'react'
import { gotoClick, gotoHref, onGoto, reflectUrl } from '@/api/goto'
import IdPill from '@/components/IdPill'
import PickCell from '@/components/PickCell'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiFetch, categoryApi, projectApi, reqApi, tcApi } from '@/api/client'
import ListHead from '@/components/ListHead'
import ListSortBtn, { type ListSortMode } from '@/components/ListSortBtn'
import PresenceBar from '@/components/PresenceBar'
import { usePageCrowd } from '@/components/usePageCrowd'
import { usePresence } from '@/components/usePresence'
import ReqTree from '@/components/ReqTree'
import LlmPick, { useLlmPick } from '@/components/LlmPick'
import { useCodes } from '@/hooks/useCodes'
import { useMultiSelect } from '@/components/useMultiSelect'
import {
  IconCycle,
  IconExecution,
  IconPanel,
  IconReqDoc,
  IconSettings,
  IconSparkle,
  IconTcDoc,
} from '@/components/icons'
import ReqForm from '@/components/ReqForm'
import ReqBulkForm from '@/components/ReqBulkForm'
import ReqBulkEdit from '@/components/ReqBulkEdit'
import ReqMapDialog from '@/components/ReqMapDialog'
import NewProjectDialog from '@/components/NewProjectDialog'
import FolderSortBtn from '@/components/FolderSortBtn'
import { useInfoCols } from '@/components/useInfoCols'
import Resizer, { useResizableWidth } from '@/components/Resizer'
import VRail, { RailSec } from '@/components/VRail'
import { useRailSpy } from '@/components/useRailSpy'
import ReqDetail from '@/components/ReqDetail'
import {
  reqLabel,
  reqPk,
  statusClass,
  type Requirement,
  type TestCaseMeta,
} from '@/types'
import './Requirements.css'
import { fillOf } from '@/lib/fieldFill'

/**
 * REQ ↔ TC 연결 화면.
 *
 * 연결 관계의 정본은 두 군데에 있다:
 *   - TC 쪽의 req_id  (PG tc.req_id 컬럼, db.py:_tc_meta)
 *   - REQ 쪽의 tc[]   (PG req.data->'tc', main.py:2074 가 참조로 축약)
 * 둘이 어긋난 데이터가 실제로 있을 수 있어 합집합으로 본다.
 * 어느 쪽에만 있는지는 행에 표시해 준다.
 */
/** 새로고침해도 보던 자리로 (TestCases.tsx 와 같은 뜻) */
const SEL_KEY = 'utop.req.sel'
const FOLDER_KEY = 'utop.req.folder'

interface Props {
  /** 지금 로그인한 사람 — 「함께 보는 중」 에 쓴다 */
  me?: { username?: string; name?: string } | null
}

export default function Requirements({ me }: Props) {
  const meName = me?.name || me?.username || ''
  /**
   * 같은 것을 누가 같이 보고 있나.
   *
   * 시험 항목 화면에만 있었다(지적). 요구사항도 둘이 같은 건을 열어 놓고
   * 각자 고치면 나중에 저장한 사람이 앞사람 것을 조용히 덮는다 — 막지는
   * 않고, 누가 있는지 보여 준다.
   *   crowd    이 화면(요구사항)에 들어와 있는 사람 전부
   *   presence **이 요구사항 한 건**을 보고 있는 사람
   */
  const crowd = usePageCrowd('req')
  /** 2열 목록 정렬 — 기본은 **트리 순서**(지시) */
  const [listSort, setListSort] = useState<ListSortMode>(() => {
    const v = localStorage.getItem('utop.req.listsort')
    return v === 'name' || v === 'recent' ? v : 'tree'
  })
  useEffect(() => {
    localStorage.setItem('utop.req.listsort', listSort)
  }, [listSort])
  const [selected, setSelected] = useState<string | null>(
    () => localStorage.getItem(SEL_KEY) || null,
  )
  /**
   * 고른 폴더. undefined = 안 고름 · null = 미분류.
   *
   * 요구사항 하나가 아니라 폴더를 고르면 오른쪽에 그 폴더 아래 요구사항의
   * TC 가 전부 모인다. '이 묶음의 시험이 다 됐나' 는 요구사항 한 건이
   * 아니라 묶음 단위로 묻게 된다.
   */
  /** 보기 방식 — 트리 안에 있던 단추를 ⋯ 로 옮겼다 */
  /** 트리에 요구사항을 안 그리므로 축약 ID 규칙은 쓰이지 않는다 */
  const fullId = false
  /**
   * 1열은 **폴더만** 보여 준다.
   *
   * 요구사항은 2열 표에 뜬다(Zephyr 방식). 트리에도 같이 깔면 같은 것이
   * 두 군데 보여 어느 쪽을 눌러야 하는지 매번 생각하게 된다. 굳이 트리에서
   * 보고 싶으면 ⋯ 에서 끌 수 있다.
   */
  const [foldersOnly, setFoldersOnly] = useState(
    () => localStorage.getItem('utop.req.foldersOnly') !== '0',
  )
  useEffect(() => {
    localStorage.setItem('utop.req.foldersOnly', foldersOnly ? '1' : '0')
  }, [foldersOnly])
  /** 폴더 안의 차례 — ID 순. 번호가 이어져야 빠진 것이 눈에 띈다 */
  const sort: 'id' | 'title' = 'id'
  /**
   * 2열 목록에서 찾는 글자.
   *
   * 이 칸은 2열 위에 있다. 그런데 값을 1열 트리에 물려 두어서, 여기에
   * 「PERF」 를 치면 **1열이 걸러지고 2열은 그대로**였다 — 보는 자리와
   * 걸러지는 자리가 어긋나 있었다. 이제 2열 목록만 거른다. 1열은 바로
   * 위의 폴더 찾기가 맡는다.
   */
  const [listQ, setListQ] = useState('')
  /** 폴더 이름으로 찾기 — 요구사항 찾기와 갈라 둔다 */
  const [folderQ, setFolderQ] = useState('')
  const [selectedFolder, setSelectedFolder] = useState<string | null | undefined>(() => {
    // 'null'(미분류)과 '안 고름'(undefined)을 문자열 하나로 갈라 담는다
    const v = localStorage.getItem(FOLDER_KEY)
    return v === null || v === '' ? undefined : v === '\u0000' ? null : v
  })
  // 여러 건을 골라 한 번에 지우기
  /**
   * 트리에서 고른 줄 — `req:<pk>` · `cat:<id>` 를 한 자루에 담는다.
   *
   * 따로 담으면 Shift 범위가 폴더와 요구사항 사이를 못 건넌다. 화면에
   * 보이는 대로 이어져 있어야 「여기부터 저기까지」 가 맞는다.
   */
  const treeSel = useMultiSelect<string>()
  const picked = treeSel.picked
  /** 고른 폴더. 요구사항과 함께 지울 수 있어야 정리가 한 번에 끝난다. */
  /** 버튼 줄에서 트리에게 보내는 신호 (숫자가 늘면 트리가 반응한다) */
  const [addFolder, setAddFolder] = useState(0)
  /** 새 프로젝트 창 — 최상위 폴더는 이 창으로만 만든다(폴더=프로젝트명) */
  const [newProj, setNewProj] = useState(false)
  /** 1열 폴더 차례 — 숫자(기본)·알파벳·한글 이름 우선, 끌기 순도 남긴다 */
  const [folderSort, setFolderSort] = useState<'manual' | 'num' | 'abc' | 'kor'>(() => {
    const v = localStorage.getItem('utop.req.foldersort')
    return v === 'manual' || v === 'num' || v === 'abc' || v === 'kor' ? v : 'num'
  })
  useEffect(() => {
    localStorage.setItem('utop.req.foldersort', folderSort)
  }, [folderSort])
  // undefined = 폼 닫힘 / null = 새로 만들기 / Requirement = 편집
  const [form, setForm] = useState<Requirement | null | undefined>(undefined)
  /** 붙여넣기로 여러 건 들여오기(Import) */
  const [importOpen, setImportOpen] = useState(false)
  /** Map — 요구사항에 시험 붙이는 창(폴더 | 요구사항 | 시험) */
  const [mapFor, setMapFor] = useState<Requirement | null>(null)
  /** 고른 여러 건을 한꺼번에 고치는 창 */
  const [bulkEditOpen, setBulkEditOpen] = useState(false)
  // undefined = 닫힘 / { } = 새 TC(요구사항 미리 연결)
  // 새로고침해도 보던 탭 그대로 — 화면마다 같은 약속이다
  const [tab, setTab] = useState<'info' | 'detail' | 'tc' | 'runs' | 'history'>(() => {
    const t = localStorage.getItem('utop.req.tab')
    return t === 'detail' || t === 'tc' || t === 'runs' || t === 'history' ? t : 'info'
  })
  useEffect(() => {
    localStorage.setItem('utop.req.tab', tab)
  }, [tab])
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // 패널 폭은 사람마다 선호가 다르다. 드래그로 맞추고 브라우저에 기억시킨다.
  const splitRef = useRef<HTMLDivElement>(null)
  /* 세부는 탭이 아니라 한 줄기 스크롤이다 — 레일과 서로를 따라간다 */
  const railRef = useRef<HTMLDivElement>(null)
  /* 접어 둔 칸. 기본은 다 펴 둔다 — 접어도 이름표 줄은 남아 레일이 짚는다 */
  const [shut, setShut] = useState<Set<string>>(new Set())
  const toggleSec = (k: string) =>
    setShut((v) => {
      const n = new Set(v)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })
  /* 레일 ↔ 한 줄기 스크롤 묶기. 누르면 가고, 굴리면 레일이 따라온다 */
  /* 가로 레일로 바꾸며 스크롤 스파이는 걷었다(지시) — 칸을 갈아 끼우므로
     굴림과 레일을 맞출 일이 없다. 세로 레일을 쓰는 화면은 그대로 쓴다. */
  useRailSpy(railRef, tab, (k) => setTab(k as typeof tab), false)

  /* Alt+←/→ 로도 칸을 옮긴다 */
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
      const ks = TABS.map(([k]) => k)
      const at = ks.indexOf(tab)
      const to = ks[Math.min(ks.length - 1, Math.max(0, at + (e.key === 'ArrowLeft' ? -1 : 1)))]
      if (to && to !== tab) {
        e.preventDefault()
        setTab(to as typeof tab)
      }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [tab])
  const [catW, setCatW] = useResizableWidth('utop.req.catW5', 210, 150, 900)
  // 2열 폭 조절은 3열과 함께 은퇴했다 — 2열이 남은 폭을 다 갖는다(레일 개편)

  /**
   * 폴더 트리를 폈나. 사이클·TC 화면과 같은 접기다.
   *
   * 접고 펴는 것은 **사람만** 한다. 화면이 알아서 접으면, 줄 하나 누를
   * 때마다 왼쪽이 움직여 눈이 따라다녀야 한다.
   */
  const [treeOpen, setTreeOpen] = useState(
    () => localStorage.getItem('utop.req.treeOpen') !== '0',
  )
  useEffect(() => {
    localStorage.setItem('utop.req.treeOpen', treeOpen ? '1' : '0')
  }, [treeOpen])

  /** List 표에서 체크한 요구사항(PK) — 액션 바의 대상 */
  const [listPick, setListPick] = useState<Set<string>>(new Set())
  const [listBusy, setListBusy] = useState('')

  /** 보기 — list(표로 여럿) · detail(한 건 넓게) */
  /*
   * Detail/List 토글을 없앴다 — 고른 것이 화면을 정한다.
   * 폴더를 고르면 2열 표가 그 폴더의 요구사항을 보여 주고,
   * 표에서 한 건을 고르면 3열이 그 상세를 보여 준다.
   */

  const qc = useQueryClient()

  useEffect(() => {
    localStorage.setItem(SEL_KEY, selected ?? '')
  }, [selected])

  useEffect(() => {
    localStorage.setItem(
      FOLDER_KEY,
      selectedFolder === undefined ? '' : selectedFolder === null ? '\u0000' : selectedFolder,
    )
  }, [selectedFolder])


  const reqQ = useQuery({
    queryKey: ['req', 'list'],
    queryFn: ({ signal }) => api.listRequirements(signal),
  })
  const tcQ = useQuery({
    queryKey: ['tc', 'list', 'meta'],
    queryFn: ({ signal }) => api.listTestCases(signal),
  })

  const allReqs = reqQ.data?.reqs ?? []
  const tcs = tcQ.data?.tcs ?? []

  /** req_id → TC[] (TC 쪽 포인터 기준) */
  const tcsByReq = useMemo(() => {
    const m = new Map<string, TestCaseMeta[]>()
    for (const t of tcs) {
      const k = (t.req_id || '').trim()
      if (!k) continue
      const arr = m.get(k)
      if (arr) arr.push(t)
      else m.set(k, [t])
    }
    return m
  }, [tcs])

  /**
   * 이 요구사항을 가리키는 TC 들.
   *
   * tc.req_id 에 무엇이 들어 있는지가 데이터마다 다르다 —
   * 예전 데이터는 PK 와 reqid 가 같은 값이었지만(REQ-001), 새로 만든
   * 요구사항은 PK 가 rq-<ts> 라서 둘이 갈린다. 어느 쪽으로 저장됐든
   * 놓치지 않도록 둘 다로 찾아 합친다.
   */
  const tcsFor = useMemo(
    () => (r: Requirement): TestCaseMeta[] => {
      const a = tcsByReq.get(reqPk(r)) ?? []
      const label = reqLabel(r)
      const b = label && label !== reqPk(r) ? (tcsByReq.get(label) ?? []) : []
      if (b.length === 0) return a
      const seen = new Set(a.map((t) => t.tcid))
      return [...a, ...b.filter((t) => !seen.has(t.tcid))]
    },
    [tcsByReq],
  )

  const tcById = useMemo(() => {
    const m = new Map<string, TestCaseMeta>()
    for (const t of tcs) m.set(t.tcid, t)
    return m
  }, [tcs])

  const selectedReq: Requirement | undefined = useMemo(
    () => allReqs.find((r) => reqPk(r) === selected),
    [allReqs, selected],
  )

  /* Info 의 상태·우선순위는 **늘 고칠 수 있다**(지시). 고친 값은 위
     제목 자리의 「저장」 단추가 저장한다. */
  const REQ_STATUS = useCodes('req_status', ['작성중', '검토중', '검토완료', '보류', '폐기'])
  /* 연결된 시험을 그 자리에서 고치려면 시험 쪽 코드값이 필요하다(지시:
     시험항목 페이지처럼) — 같은 열쇠를 쓰므로 설정을 고치면 둘 다 따라온다 */
  const TC_TYPE = useCodes('tc_type', ['FT', 'Function'])
  const TC_STATUS = useCodes('tc_status', ['작성중', '검토중', '승인', 'PASS', 'FAIL', '보류'])
  const REQ_PRIO = useCodes('req_priority', ['High', 'Medium', 'Low'])

  /**
   * Monday 통채움 셀의 색 — **설정(INFO 필드)에서 값에 칠한 색이 정본**이고,
   * 안 칠했으면 Monday 팔레트로 기본을 깐다(승인). 코드 meta 는 note(JSON)
   * 에 산다 — 실행 판정 기준과 같은 자리다.
   */
  const codesQ = useQuery({
    queryKey: ['codes'],
    queryFn: async () => {
      const r = await apiFetch('/api/codes')
      if (!r.ok) throw new Error('코드를 불러오지 못했습니다')
      return (await r.json()) as {
        items: Array<{ kind: string; value: string; note?: string | null }>
      }
    },
    staleTime: 60_000,
  })
  /** 필드(탭) 단위 생김새 — SETUP › INFO 필드에서 정한 폭·모양·정렬(지시) */
  const kstyleQ = useQuery({
    queryKey: ['code-kind-style'],
    queryFn: async () => {
      const r = await apiFetch('/api/codes/kind-style')
      if (!r.ok) throw new Error('필드 모양을 불러오지 못했습니다')
      return (await r.json()) as {
        styles: Record<string, {
          w?: string
          shape?: string
          align?: string
          weight?: string
          size?: string
          font?: string
          caps?: string
        }>
      }
    },
    staleTime: 30_000,
  })
  const kstyle = (kind: string) => kstyleQ.data?.styles?.[kind] ?? {}
  /** 설정한 글꼴을 실제 칸에 입힌다(지시) */
  const kfont = (kind: string): React.CSSProperties => {
    const k = kstyle(kind)
    return {
      fontWeight: Number(k.weight || 700),
      fontSize: `${Number(k.size || 12)}px`,
      ...(k.font === 'mono'
        ? { fontFamily: 'var(--font-mono)' }
        : k.font === 'serif'
          ? { fontFamily: 'Georgia, "Noto Serif KR", serif' }
          : {}),
      ...(k.caps === 'upper' ? { textTransform: 'uppercase' as const } : {}),
    }
  }

  /** 기본색은 한 곳에서 온다(lib/fieldFill) — 설정 화면이 보여 주는 그 색이다 */
  const codeFill = (kind: string, value: string): { bg: string; fg: string } => {
    const it = (codesQ.data?.items ?? []).find((x) => x.kind === kind && x.value === value)
    return fillOf(it?.note, value)
  }

  /** 우클릭 메뉴 — 목업 그대로: 채우기 · 복제 · 삭제(지시) */
  const [rowMenu, setRowMenu] = useState<{ r: Requirement; key: 'status' | 'priority' | ''; x: number; y: number } | null>(null)
  useEffect(() => {
    if (!rowMenu) return
    const away = () => setRowMenu(null)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setRowMenu(null)
    const t = window.setTimeout(() => {
      window.addEventListener('mousedown', away)
      window.addEventListener('contextmenu', away)
    }, 0)
    window.addEventListener('keydown', esc)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('mousedown', away)
      window.removeEventListener('contextmenu', away)
      window.removeEventListener('keydown', esc)
    }
  }, [rowMenu])



  /** 아래로 채우기 — 묶어 보낸다 */
  const fillDownReq = async (from: Requirement, key: 'status' | 'priority', v: string) => {
    const at = midReqs.findIndex((x) => reqPk(x) === reqPk(from))
    if (at < 0) return
    const below = midReqs.slice(at + 1)
    if (!below.length) {
      window.alert('아래에 줄이 없습니다')
      return
    }
    /* 한 건씩 저장하고 그때마다 목록을 다시 읽으면 33건이 33번 왕복한다 —
       느린 까닭이 그것이었다(지적). 한꺼번에 보내고 목록은 끝에 한 번만
       다시 읽는다. 여덟씩 묶어 보내 서버도 한 번에 몰리지 않게 한다. */
    try {
      const CH = 8
      for (let i = 0; i < below.length; i += CH) {
        await Promise.all(
          below.slice(i, i + CH).map((r2) => reqApi.save(reqPk(r2), { ...r2, [key]: v })),
        )
      }
      await qc.invalidateQueries({ queryKey: ['req', 'list'] })
    } catch (e) {
      window.alert(e instanceof Error ? `저장하지 못했습니다 — ${e.message}` : '저장하지 못했습니다')
    }
  }
  const [infoDraft, setInfoDraft] = useState<{ status: string; priority: string } | null>(null)
  const [infoSaving, setInfoSaving] = useState(false)
  useEffect(() => {
    setInfoDraft(null)
  }, [selected])
  const curStatus = infoDraft?.status ?? selectedReq?.status ?? ''
  const curPrio = infoDraft?.priority ?? selectedReq?.priority ?? ''
  const infoDirty =
    !!selectedReq &&
    !!infoDraft &&
    (curStatus !== (selectedReq.status ?? '') || curPrio !== (selectedReq.priority ?? ''))
  const saveInfo = async () => {
    if (!selectedReq || !infoDirty) return
    setInfoSaving(true)
    try {
      await reqApi.save(reqPk(selectedReq), {
        ...selectedReq,
        status: curStatus,
        priority: curPrio,
      })
      await qc.invalidateQueries({ queryKey: ['req', 'list'] })
      setInfoDraft(null)
    } catch (e) {
      window.alert(e instanceof Error ? `저장하지 못했습니다 — ${e.message}` : '저장하지 못했습니다')
    } finally {
      setInfoSaving(false)
    }
  }

  /** 목록 줄에서 바로 고친다 — 상태·우선순위(지시) */
  const setField = async (r: Requirement, p: { status?: string; priority?: string }) => {
    try {
      await reqApi.save(reqPk(r), { ...r, ...p })
      await qc.invalidateQueries({ queryKey: ['req', 'list'] })
    } catch (e) {
      window.alert(e instanceof Error ? `저장하지 못했습니다 — ${e.message}` : '저장하지 못했습니다')
    }
  }

  const catQ = useQuery({
    queryKey: ['req-categories'],
    queryFn: ({ signal }) => categoryApi.list(signal),
  })

  /** 폴더 모드 — 요구사항 한 건이 아니라 묶음을 보고 있다 */
  const folderMode = selectedFolder !== undefined

  /** 1열 머리줄에 적을 수 — 이제 이 칸의 주인은 폴더다 */
  const folderCount = (catQ.data?.categories ?? []).length

  /**
   * 고른 폴더까지의 길 — 조상부터 차례로.
   *
   * 이름만 적으면 「Spec」 이 어느 Spec 인지 모른다. 폴더 이름은 흔해서
   * 여러 대분류 밑에 같은 이름이 있다(Spec · L2 · ENV 가 실제로 그렇다).
   * 1열이 접혀 있으면 트리에서 짚어 볼 수도 없다.
   */
  const folderPath = useMemo(() => {
    if (selectedFolder === undefined) return []
    if (selectedFolder === null) return [{ id: null as string | null, name: '미분류' }]
    const all = catQ.data?.categories ?? []
    const out: Array<{ id: string | null; name: string }> = []
    let at: string | null = selectedFolder
    // 자료가 어긋나 고리가 생기면 여기서 영원히 돈다 — 본 것은 다시 안 본다
    const seen = new Set<string>()
    while (at && !seen.has(at)) {
      seen.add(at)
      const c = all.find((x) => x.id === at)
      if (!c) {
        out.unshift({ id: at, name: '(없는 폴더)' })
        break
      }
      out.unshift({ id: c.id, name: c.name })
      at = c.parent_id ?? null
    }
    return out
  }, [selectedFolder, catQ.data])

  /** 길의 끝 — 지금 보고 있는 그 폴더 */
  // folderName 은 Export CSV 파일명에만 쓰였다 — Export 와 함께 뺐다.

  /**
   * 이 폴더에 속한 요구사항 — 하위 폴더까지.
   *
   * 전에는 요구사항이 들고 있는 조상 사슬(`cat1~cat4`)에서 고른 폴더를
   * 찾았다. 그것이 **다 채워져 있을 때만** 맞는 방법이다. 옛 자료나 손으로
   * 옮긴 것은 제가 놓인 칸만 차 있고 위쪽이 비어 있어서, PERF 를 누르면
   * 그 아래 L2·IPv4 의 요구사항이 통째로 빠졌다 — 트리의 수(REQ 10)와
   * 2열에 뜨는 수가 서로 달랐다.
   *
   * **분류 트리를 직접 훑는다.** 고른 폴더와 그 자손의 id 를 모아 두고,
   * 요구사항이 놓인 칸이 그 안에 있으면 내 것이다. 사슬이 비어 있어도
   * 맞는다 — 트리가 사실이고 사슬은 그 사본이다.
   */
  const folderReqs = useMemo(() => {
    if (selectedFolder === undefined) return []
    if (selectedFolder === null)
      return allReqs.filter((r) => !r.cat1 && !r.cat2 && !r.cat3 && !r.cat4)
    const cats = catQ.data?.categories ?? []
    const kids = new Map<string | null, string[]>()
    for (const c of cats) {
      const k = c.parent_id ?? null
      if (!kids.has(k)) kids.set(k, [])
      kids.get(k)!.push(c.id)
    }
    // 고른 폴더 + 그 아래 전부. 자료가 어긋나 고리가 생겨도 안 돌게 본 것은 건너뛴다
    const ids = new Set<string>()
    const walk = (id: string) => {
      if (ids.has(id)) return
      ids.add(id)
      for (const k of kids.get(id) ?? []) walk(k)
    }
    walk(selectedFolder)
    const catIds = new Set(cats.map((c) => c.id))
    const at = (r: Requirement) => (r.cat4 || r.cat3 || r.cat2 || r.cat1 || null) as string | null
    return allReqs.filter((r) => {
      const f = at(r)
      if (f && ids.has(f)) return true
      // 놓인 칸이 트리에 살아 있으면 그 칸만 믿는다 — 위 칸들은 폴더
      // 이동으로 낡은 사본일 수 있어, 옛 폴더가 계속 잡아 두면 안 된다
      // (실사고: 폴더를 프로젝트 밑으로 옮겼는데 옛 자리에 그대로 보임).
      if (f && catIds.has(f)) return false
      // 사슬만 남았으면 그것도 본다 — 폴더가 지워진 옛 자료를 위해
      return [r.cat1, r.cat2, r.cat3, r.cat4].some((c) => c && ids.has(c as string))
    })
  }, [allReqs, selectedFolder, catQ.data])

  /**
   * 트리에 선 차례.
   *
   * 왼쪽 트리와 **같은 규칙**으로 분류를 깊이 우선으로 훑어 번호를 매긴다.
   * 2열을 이 번호로 세우면 목록이 트리와 같은 차례로 서서, 폴더를 짚어 놓고
   * 오른쪽에서 그걸 다시 찾을 일이 없다(지적).
   */
  const treeRank = useMemo(() => {
    const cats = catQ.data?.categories ?? []
    const kids = new Map<string, typeof cats>()
    for (const c of cats) {
      const k = c.parent_id ?? ''
      kids.set(k, [...(kids.get(k) ?? []), c])
    }
    const rank = new Map<string, number>()
    let n = 0
    const walk = (pid: string) => {
      for (const c of [...(kids.get(pid) ?? [])].sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, 'ko'),
      )) {
        if (rank.has(c.id)) continue
        rank.set(c.id, n++)
        walk(c.id)
      }
    }
    walk('')
    return (r: Requirement): number => {
      const deep = (r.cat4 || r.cat3 || r.cat2 || r.cat1 || '') as string
      return rank.get(deep) ?? 1e9
    }
  }, [catQ.data])

  /** 줄이 놓인 폴더 — 고른 폴더 기준 상대 경로(「SW › ENV」).
      하위 폴더 포함으로 볼 때 어느 폴더 것인지 안 보여서 단다.
      바로 밑에 있으면 빈 문자열 — 붙일수록 지저분해질 뿐이다. */
  const relFolderPath = useMemo(() => {
    const cats = catQ.data?.categories ?? []
    const byId = new Map(cats.map((c) => [c.id, c]))
    return (r: Requirement): string => {
      if (!folderMode || !selectedFolder) return ''
      const deep = (r.cat4 || r.cat3 || r.cat2 || r.cat1 || null) as string | null
      if (!deep || deep === selectedFolder) return ''
      const names: string[] = []
      let cur = byId.get(deep)
      while (cur && cur.id !== selectedFolder) {
        names.unshift(cur.name)
        cur = cur.parent_id ? byId.get(cur.parent_id) : undefined
      }
      return names.join(' › ')
    }
  }, [catQ.data, folderMode, selectedFolder])

  /** ⚙ = 요구사항 INFO 필드만(SETUP 과 1:1, 합의 규칙).
      모델그룹·모델명(프로젝트 상속)·Map·TC 는 고정 열이라 ⚙ 에 없다. */
  const infoCols = useInfoCols('req')
  const [reqCols, setReqCols] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('utop.req.infocols')
      if (raw) return new Set(JSON.parse(raw) as string[])
    } catch {
      /* 깨진 저장값이면 기본으로 */
    }
    // 기본 = INFO 필드 2개(상태·우선순위) 선택(피드백)
    return new Set(['f_status', 'f_priority'])
  })
  const toggleReqCol = (k: string) =>
    setReqCols((cur) => {
      const n = new Set(cur)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      localStorage.setItem('utop.req.infocols', JSON.stringify([...n]))
      return n
    })
  /** ⚙ 팝업 — 사이클 보드처럼 고정 좌표로 띄운다(겹침·잘림에 안전).
      absolute 방식은 환경에 따라 안 보이는 곳에 열렸다(피드백: 반응 없음). */
  const [reqGearAt, setReqGearAt] = useState<{ x: number; y: number } | null>(null)
  const reqVisCols = infoCols.filter((c) => reqCols.has(c.k))
  /* 열 폭은 **설정이 정본**이다(지시) — useInfoCols 가 이미 그것을 들고 온다 */
  const reqGrid = `26px minmax(0, 1fr) 84px 76px 38px 50px ${reqVisCols
    .map((c) => c.w)
    .join(' ')}`.trim()

  /** 소속 프로젝트의 모델그룹·모델명 — 요구사항에는 모델 필드가 없다.
      프로젝트가 모델을 고정하므로(정책) 사슬 맨 위(cat1)에서 상속해 보인다. */
  const prjQ = useQuery({
    queryKey: ['projects'],
    queryFn: ({ signal }) => projectApi.list(signal),
  })
  const prjByCat = useMemo(
    () => new Map((prjQ.data?.projects ?? []).map((p) => [p.cat_id, p])),
    [prjQ.data],
  )

  /** 이 요구사항을 덮는 TC 수 — tc.req_id 와 req.tc[] 참조의 합집합 */
  const covCount = useMemo(
    () => (r: Requirement): number => {
      const ids = new Set(tcsFor(r).map((t) => t.tcid))
      for (const ref of r.tc ?? []) if (ref?.tcid) ids.add(ref.tcid)
      return ids.size
    },
    [tcsFor],
  )

  /** List 모드 표에 뿌릴 — 이 폴더의 요구사항을 정렬해 둔 것 */
  const sortedFolderReqs = useMemo(() => {
    const arr = [...folderReqs]
    const at = (r: Requirement) => String(r._updated_at ?? r._created_at ?? '')
    if (listSort === 'name')
      arr.sort((a, b) =>
        (reqLabel(a) || '').localeCompare(reqLabel(b) || '', 'ko', { numeric: true }),
      )
    else if (listSort === 'recent') arr.sort((a, b) => at(b).localeCompare(at(a)))
    // 트리 순서(기본) — 폴더가 트리에 선 차례, 같은 폴더 안은 ID 차례
    else
      arr.sort(
        (a, b) =>
          treeRank(a) - treeRank(b) ||
          String(a.reqid ?? '').localeCompare(String(b.reqid ?? ''), 'ko', { numeric: true }),
      )
    return arr
  }, [folderReqs, listSort, treeRank])

  /**
   * 2열 줄을 끌어 1열 폴더에 놓기.
   *
   * 트리 안 끌기(ReqTree)와 같은 포인터 방식이다 — HTML5 드래그는 줄에
   * 버튼·체크박스가 있으면 시작조차 안 된다. 놓을 곳은 트리가 줄마다
   * 달아 둔 data-folder 로 찾는다.
   */
  const [rowGhost, setRowGhost] = useState<{ x: number; y: number; label: string } | null>(null)
  const moveRowM = useMutation({
    mutationFn: async ({ r, folderId }: { r: Requirement; folderId: string | null }) => {
      const byId = new Map((catQ.data?.categories ?? []).map((c) => [c.id, c]))
      const chain: string[] = []
      let cur = folderId ? byId.get(folderId) : undefined
      while (cur) {
        chain.unshift(cur.id)
        cur = cur.parent_id ? byId.get(cur.parent_id) : undefined
      }
      return reqApi.save(reqPk(r), {
        ...r,
        cat1: chain[0] ?? null,
        cat2: chain[1] ?? null,
        cat3: chain[2] ?? null,
        cat4: chain[3] ?? null,
      })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['req', 'list'] })
      void qc.invalidateQueries({ queryKey: ['req-categories'] })
    },
  })
  const beginRowDrag = (e: React.PointerEvent, r: Requirement) => {
    if (e.button !== 0) return
    const x0 = e.clientX
    const y0 = e.clientY
    let started = false
    const move = (ev: PointerEvent) => {
      if (!started) {
        if (Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) < 5) return
        started = true
        document.body.style.userSelect = 'none'
        document.body.style.cursor = 'grabbing'
      }
      setRowGhost({ x: ev.clientX, y: ev.clientY, label: r.title || reqLabel(r) })
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      setRowGhost(null)
      if (!started) return
      const el = document.elementFromPoint(ev.clientX, ev.clientY)
      const row = el?.closest('[data-folder]') as HTMLElement | null
      const target = row
        ? row.dataset.folder || null
        : el?.closest('[data-root]')
          ? null
          : undefined
      if (target === undefined) return
      const at = (r.cat4 || r.cat3 || r.cat2 || r.cat1 || null) as string | null
      if (at === target) return
      moveRowM.mutate({ r, folderId: target })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  /** Detail 가운데 목록 — 보고 있는 폴더의 형제 요구사항들 */
  const midReqs = useMemo(() => {
    const base = folderMode ? sortedFolderReqs : selectedReq ? [selectedReq] : []
    const n = listQ.trim().toLowerCase()
    if (!n) return base
    return base.filter(
      (r) =>
        (r.reqid ?? '').toLowerCase().includes(n) ||
        (r.title ?? '').toLowerCase().includes(n),
    )
  }, [folderMode, sortedFolderReqs, selectedReq, listQ])

  /** 선택된 REQ 에 연결된 TC — 양쪽 정본의 합집합 */
  /**
   * 연결 해제 — **두 장부를 다 지운다.**
   *
   * 연결은 TC 의 req_id 와 요구사항의 tc[] 두 곳에 적힌다(일괄 생성이
   * 뒤엣것을 쓴다). req_id 만 비웠더니 tc[] 로 이어진 줄은 해제를 눌러도
   * 그대로 남았다. TC 자체는 지워지지 않는다.
   */
  /**
   * 연결된 시험의 한 칸을 **그 자리에서** 고친다(지시: 시험항목 페이지처럼).
   *
   * 여태 이 표는 읽기만 됐다. 제안으로 만든 시험은 유형·상태가 비어 있는데,
   * 그것을 채우러 매번 시험항목 화면으로 건너가야 했다.
   */
  const setTcCell = async (t: TestCaseMeta, patch: Record<string, unknown>) => {
    try {
      await tcApi.save(t.tcid, {
        tcid: t.tcid,
        name: t.name ?? '',
        type: t.type ?? '',
        status: t.status ?? '',
        severity: t.severity ?? '',
        req_id: t.req_id ?? '',
        ...patch,
      })
      void qc.invalidateQueries({ queryKey: ['tc', 'list', 'meta'] })
    } catch (e) {
      window.alert(e instanceof Error ? `저장하지 못했습니다 — ${e.message}` : '저장하지 못했습니다')
    }
  }

  /** 아주 지운다 — 「해제」(떼기)와 다른 일이라 단추도 따로 둔다 */
  const delTcM = useMutation({
    mutationFn: async (t: TestCaseMeta) => {
      await tcApi.remove(t.tcid)
      const owner = ownerOf.get(t.tcid) ?? selectedReq
      if (owner && (owner.tc ?? []).some((ref) => ref?.tcid === t.tcid)) {
        await reqApi.save(reqPk(owner), {
          ...owner,
          tc: (owner.tc ?? []).filter((ref) => ref?.tcid !== t.tcid),
        })
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tc', 'list', 'meta'] })
      void qc.invalidateQueries({ queryKey: ['req', 'list'] })
    },
    onError: (e: Error) => window.alert(`지우지 못했습니다 — ${e.message}`),
  })

  const unlinkM = useMutation({
    mutationFn: async (t: TestCaseMeta) => {
      await tcApi.save(t.tcid, {
        tcid: t.tcid,
        name: t.name ?? '',
        type: t.type ?? '',
        status: t.status ?? '',
        severity: t.severity ?? '',
        req_id: '',
      })
      const owner = ownerOf.get(t.tcid) ?? selectedReq
      if (owner && (owner.tc ?? []).some((ref) => ref?.tcid === t.tcid)) {
        await reqApi.save(reqPk(owner), {
          ...owner,
          tc: (owner.tc ?? []).filter((ref) => ref?.tcid !== t.tcid),
        })
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tc', 'list', 'meta'] })
      void qc.invalidateQueries({ queryKey: ['req', 'list'] })
      void qc.invalidateQueries({ queryKey: ['reqs'] })
    },
  })

  /**
   * 보고 있는 대상의 TC.
   *
   * 요구사항 하나를 골랐으면 그 하나, 폴더를 골랐으면 그 아래 요구사항
   * 전부를 모은다. 같은 TC 가 여러 요구사항에 걸려 있어도 한 줄만 나온다.
   * ownerOf 는 그 줄이 어느 요구사항의 것인지 — 폴더 모드에서만 쓴다.
   */
  const { linked, ownerOf } = useMemo(() => {
    // 요구사항을 고른 상태면 그 한 건이 먼저다. 폴더가 아직 골라져 있어도
    // (Detail 의 가운데 목록이 쓰라고 남겨 둔 것이라) 그 폴더 전체를 모으면
    // 엉뚱하게 형제들 TC 까지 딸려 온다.
    const targets = selectedReq ? [selectedReq] : folderMode ? folderReqs : []
    const out: TestCaseMeta[] = []
    const owner = new Map<string, Requirement>()
    const seen = new Set<string>()

    for (const r of targets) {
      const push = (t: TestCaseMeta) => {
        if (seen.has(t.tcid)) return
        seen.add(t.tcid)
        owner.set(t.tcid, r)
        out.push(t)
      }
      for (const t of tcsFor(r)) push(t)
      for (const ref of r.tc ?? []) {
        if (!ref?.tcid) continue
        // TC 목록에 있으면 그 메타를, 없으면 REQ 가 들고 있는 참조만으로 행을 만든다.
        push(tcById.get(ref.tcid) ?? { tcid: ref.tcid, name: ref.name, status: ref.status })
      }
    }
    return { linked: out, ownerOf: owner }
  }, [folderMode, folderReqs, selectedReq, tcsFor, tcById])

  /**
   * 이 요구사항을 덮을 **시험 항목 제안**(지시: Coverage 에도 드롭바).
   *
   * 만들지는 않는다 — 이름과 목적까지다. 어느 폴더에 어느 모델로 만들지는
   * 사람이 정하는 것이고, 그 결정을 모델에게 맡기면 엉뚱한 자리에 시험이
   * 쌓인다.
   */
  const [covLlm, setCovLlm] = useLlmPick('req-coverage')
  const [covBusy, setCovBusy] = useState(false)
  const [covErr, setCovErr] = useState('')
  const [covIdea, setCovIdea] = useState<Array<{ name: string; object: string }>>([])
  /** 만들 것으로 고른 제안의 자리 번호 — 처음엔 모두 켠다 */
  const [covPick, setCovPick] = useState<Set<number>>(new Set())
  const [covMaking, setCovMaking] = useState(false)

  const askCoverage = async () => {
    if (!selectedReq) return
    setCovBusy(true)
    setCovErr('')
    try {
      const r = await apiFetch(`/api/req/${encodeURIComponent(reqPk(selectedReq))}/ai-coverage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ req: selectedReq, llm: covLlm }),
      })
      const b = (await r.json().catch(() => ({}))) as {
        items?: Array<{ name: string; object: string }>
        detail?: string
      }
      if (!r.ok) throw new Error(b.detail || `만들지 못했습니다 (${r.status})`)
      setCovIdea(b.items ?? [])
      setCovPick(new Set((b.items ?? []).map((_, i) => i)))
      if (!(b.items ?? []).length) setCovErr('제안할 것이 없다고 합니다')
    } catch (e) {
      setCovIdea([])
      setCovErr(e instanceof Error ? e.message : String(e))
    } finally {
      setCovBusy(false)
    }
  }

  /**
   * 고른 제안을 **진짜 시험항목으로**.
   *
   * 자리(폴더)와 모델그룹·모델명은 요구사항에서 물려받는다 — 다시 고르게
   * 하면 제안을 받는 뜻이 없다. 스텝은 비운다: 무엇을 어떤 명령으로 볼지는
   * Automation 탭에서 정하는 일이다.
   */
  const makeTcs = async () => {
    if (!selectedReq || covPick.size === 0) return
    setCovMaking(true)
    setCovErr('')
    try {
      const picked = covIdea.filter((_, i) => covPick.has(i))
      const r = await apiFetch(`/api/req/${encodeURIComponent(reqPk(selectedReq))}/make-tcs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: picked }),
      })
      const b = (await r.json().catch(() => ({}))) as {
        made?: Array<{ tcid: string; name: string }>
        detail?: string
      }
      if (!r.ok) throw new Error(b.detail || `만들지 못했습니다 (${r.status})`)
      setCovIdea([])
      setCovPick(new Set())
      void qc.invalidateQueries({ queryKey: ['tcs'] })
      void qc.invalidateQueries()
      window.alert(
        `${(b.made ?? []).length}건을 만들었습니다 — ${(b.made ?? []).map((m) => m.tcid).join(', ')}`,
      )
    } catch (e) {
      setCovErr(e instanceof Error ? e.message : String(e))
    } finally {
      setCovMaking(false)
    }
  }

  /** 이 요구사항 한 건을 같이 보는 사람 */
  const presence = usePresence(selected ? `req:${selected}` : 'req', meName)

  /** 상세 탭 — 레일 보기가 쓴다 (인라인 카드는 피드백으로 제거) */
  const TABS = [
    ['info', 'Info', '요구사항 자체 — ID · 제목 · 자리 · 상태'],
    ['detail', 'Intent', '무엇을 왜 만드나 — 구현 의도'],
    ['tc', 'Coverages', '이 요구사항을 덮는 시험'],
    ['runs', 'Execution History', '언제 돌려 어떻게 나왔나'],
    ['history', 'Change History', '누가 무엇을 고쳤나'],
  ] as const

  /** 커버리지 집계. Xray 처럼 '덮였는가' 를 먼저 답하려고 쓴다. */
  const cov = useMemo(() => {
    let p = 0
    let f = 0
    for (const t of linked) {
      const c = statusClass(t.status)
      if (c === 'pass') p++
      else if (c === 'fail') f++
    }
    return { pass: p, fail: f, idle: linked.length - p - f }
  }, [linked])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return linked.filter((t) => {
      if (statusFilter && statusClass(t.status) !== statusFilter) return false
      if (!needle) return true
      return (
        t.tcid.toLowerCase().includes(needle) ||
        (t.name ?? '').toLowerCase().includes(needle)
      )
    })
  }, [linked, q, statusFilter])


  const loading = reqQ.isLoading || tcQ.isLoading
  const error = reqQ.error ?? tcQ.error

  /**
   * 한 건을 넓게 본다.
   *
   * 폴더 트리는 **건드리지 않는다.** 전에는 여기서 접었는데, 줄 하나 누를
   * 때마다 왼쪽이 접혔다 펴졌다 해서 화면이 튀고 지금 어느 폴더에 있는지
   * 감각을 잃었다. 트리는 230px 이라 셋을 펴 둬도 상세가 넉넉하다 —
   * 좁으면 사람이 접기 단추로 접으면 된다.
   */
  /** 주소에 쓸 이름 — 내부 키(rq-…)가 아니라 부여 ID(REQ-2633-0003) */
  const urlIdOf = (pk: string) => {
    const r = allReqs.find((x) => reqPk(x) === pk)
    return (r?.reqid ?? '').trim() || pk
  }
  /** 주소·링크로 온 이름을 내부 키로 — 부여 ID 든 내부 키든 받아 준다 */
  const pkOf = (id: string) =>
    reqPk(allReqs.find((x) => reqPk(x) === id || (x.reqid ?? '') === id) ?? ({ id } as never)) || id

  // 링크·뒤로가기로 이 화면에 온 채 다른 요구사항을 가리키면 갈아탄다
  useEffect(
    () =>
      onGoto((kind, id) => {
        if (kind !== 'req') return
        const pk = pkOf(id)
        if (pk !== selected) setSelected(pk)
      }),
    [selected, allReqs], // eslint-disable-line react-hooks/exhaustive-deps
  )

  // 새로 열었을 때 주소에 부여 ID 가 있었으면(딥링크) 내부 키로 푼다
  useEffect(() => {
    if (!selected || !allReqs.length) return
    if (allReqs.some((r) => reqPk(r) === selected)) return
    const pk = pkOf(selected)
    if (pk !== selected) setSelected(pk)
  }, [allReqs, selected]) // eslint-disable-line react-hooks/exhaustive-deps

  const goDetail = (pk: string, to: typeof tab = tab) => {
    reflectUrl('req', urlIdOf(pk))
    setSelected(pk)
    setTab(to)
  }

  /** 표로 돌아온다 */

  // ── List 액션 바 ────────────────────────────────────────────
  const pickedInList = sortedFolderReqs.filter((r) => listPick.has(reqPk(r)))
  const allListPicked = sortedFolderReqs.length > 0 && pickedInList.length === sortedFolderReqs.length

  const toggleAllList = () =>
    setListPick(allListPicked ? new Set() : new Set(sortedFolderReqs.map(reqPk)))

  const togglePick = (pk: string) =>
    setListPick((s) => {
      const n = new Set(s)
      if (n.has(pk)) n.delete(pk)
      else n.add(pk)
      return n
    })

  /** 고른 것을 이 폴더에 복제한다 — ID 는 서버가 새로 매긴다 */
  const clonePicked = async () => {
    if (!pickedInList.length) return
    if (!window.confirm(`고른 ${pickedInList.length}건을 복제합니다.`)) return
    setListBusy('clone')
    try {
      for (const r of pickedInList) {
        /* 새 ID 는 **신규 생성과 같은 방식**으로 받는다 — Add 가 쓰는
           /api/req-next-id 그대로. 복제라고 다른 규칙으로 매기면
           「어느 ID 가 왜 이 모양이지」 를 두 가지로 기억해야 한다. */
        const nres = await apiFetch('/api/req-next-id')
        const nid = ((await nres.json()) as { reqid?: string }).reqid ?? ''
        const pk = `rq-${Date.now()}-${Math.floor(Math.random() * 1e4)}`
        const { id: _id, reqid: _rid, tc: _tc, ...rest } = r as Record<string, unknown>
        await apiFetch(`/api/req/${encodeURIComponent(pk)}`, {
          method: 'POST',
          body: JSON.stringify({
            ...rest,
            id: pk,
            reqid: nid,
            /*
             * 제목 끝에 **(복제)** 를 붙인다(지적).
             *
             * 그대로 두었더니 같은 이름이 나란히 서서 어느 것이 원본인지
             * 목록에서 갈리지 않았다. 이름을 고치는 한 번의 수고보다,
             * 잘못된 줄을 고치는 사고가 크다. 이미 「(복제)」 가 붙어 있으면
             * 또 붙이지 않는다.
             */
            title: (() => {
              const t = String(r.title ?? '').trim()
              return t.endsWith('(복제)') ? t : `${t} (복제)`.trim()
            })(),
            tc: [],
          }),
        })
      }
      setListPick(new Set())
      void qc.invalidateQueries({ queryKey: ['req', 'list'] })
      void qc.invalidateQueries({ queryKey: ['reqs'] })
    } catch (e) {
      window.alert(`복제하지 못했습니다 — ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setListBusy('')
    }
  }

  /** 고른 것을 지운다 */
  const deletePicked = async () => {
    if (!pickedInList.length) return
    if (
      !window.confirm(
        `고른 요구사항 ${pickedInList.length}건을 삭제합니다.\n되돌릴 수 없습니다. 계속할까요?`,
      )
    )
      return
    setListBusy('del')
    try {
      for (const r of pickedInList) await reqApi.remove(reqPk(r))
      setListPick(new Set())
      void qc.invalidateQueries({ queryKey: ['req', 'list'] })
      void qc.invalidateQueries({ queryKey: ['req-categories'] })
    } catch (e) {
      window.alert(`삭제하지 못했습니다 — ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setListBusy('')
    }
  }

  // Export(CSV) 는 도구줄에서 뺐다(피드백) — 필요해지면 exportList 를
  // git 이력(d7adf19 이전)에서 되살린다.

  return (
    <>
      {form !== undefined && (
        <ReqForm
          editing={form}
          // 1열에서 열어 둔 폴더에 넣는다 — 대·중·소분류가 그 사슬로 채워진다
          presetFolder={selectedFolder ?? null}
          onClose={() => setForm(undefined)}
        />
      )}
      {importOpen && (
        <ReqBulkForm presetFolder={selectedFolder ?? null} onClose={() => setImportOpen(false)} />
      )}
      {mapFor && <ReqMapDialog req={mapFor} onClose={() => setMapFor(null)} />}

      {/* 줄 우클릭 메뉴 — 목업 그대로(지시): 채우기 · 복제 · 삭제 */}
      {rowMenu && (
        <div
          className="rq-ctxmenu"
          style={{
            left: Math.min(rowMenu.x, window.innerWidth - 220),
            top: Math.min(rowMenu.y, window.innerHeight - 160),
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            type="button"
            disabled={!rowMenu.key}
            title={rowMenu.key ? '' : '상태·우선순위 칸에서 우클릭하면 그 값을 채웁니다'}
            onClick={() => {
              const m = rowMenu
              setRowMenu(null)
              if (m.key) void fillDownReq(m.r, m.key, (m.key === 'status' ? m.r.status : m.r.priority) ?? '')
            }}
          >
            ⬇ 아래 행에 {rowMenu.key === 'priority' ? '우선순위' : rowMenu.key === 'status' ? '상태' : '값'} 채우기
          </button>
        </div>
      )}
      {newProj && (
        <NewProjectDialog
          onClose={() => setNewProj(false)}
          onCreated={(catId) => {
            setNewProj(false)
            // 갓 만든 프로젝트를 바로 보여 준다 — 다음 일이 하위 폴더 만들기다
            setSelectedFolder(catId)
            setSelected(null)
          }}
        />
      )}
      {rowGhost && (
        <div className="rt-ghost" style={{ left: rowGhost.x + 14, top: rowGhost.y + 12 }}>
          <IconReqDoc />
          {rowGhost.label}
        </div>
      )}
      {bulkEditOpen && (
        <ReqBulkEdit
          ids={pickedInList.map(reqPk)}
          onClose={() => setBulkEditOpen(false)}
          onDone={(msg) => {
            setBulkEditOpen(false)
            setListPick(new Set())
            window.alert(msg)
            void qc.invalidateQueries({ queryKey: ['req', 'list'] })
            void qc.invalidateQueries({ queryKey: ['reqs'] })
          }}
        />
      )}


      {error ? (
        <div className="load-error">
          데이터를 불러오지 못했습니다 — {(error as Error).message}
        </div>
      ) : null}

      {/* ── 맨 위 줄 — 지금 어디를 보고 있나 + 보기 방식 ────────────
          트리·표 위 전체 폭에 걸친다(Zephyr 와 같은 자리). 늘 떠 있다 —
          모드에 따라 사라지면 「내가 어디 있더라」 를 화면에서 못 읽는다. */}
      <div className="rq-bar">
        <span className="rq-crumb">
          {/* 이 화면이 무엇인가 — 빵부스러기의 머리다. 옅은 작은 글씨로
              두었더니 뒤따르는 폴더 이름과 무게가 같아, 어디를 보고 있는지
              읽으려면 줄 전체를 훑어야 했다. */}
          <span className="rq-crumb-root">Requirements</span>
          {/* 조상까지 다 적는다. 마지막(지금 폴더)만 진하게 — 앞엣것은
              어디에 있는지를 알려주는 길잡이지 지금 보는 것이 아니다.
              눌러서 그 폴더로 올라갈 수 있다. */}
          {folderPath.map((f, i) => (
            <span className="rq-crumb-seg" key={f.id ?? `u${i}`}>
              <span className="rq-crumb-sep">›</span>
              {i === folderPath.length - 1 ? (
                <b>{f.name}</b>
              ) : (
                <button
                  type="button"
                  className="rq-crumb-up"
                  onClick={() => {
                    // 트리에서 그 폴더를 누른 것과 같아야 한다 — 안 그러면
                    // 빵부스러기만 바뀌고 보던 요구사항이 그대로 남는다
                    setSelectedFolder(f.id)
                    setSelected(null)
                  }}
                  title={`${f.name} 으로`}
                >
                  {f.name}
                </button>
              )}
            </span>
          ))}
            {selectedReq && (
            <>
              <span className="rq-crumb-sep">›</span>
              <b>{selectedReq.title || reqLabel(selectedReq) || '(제목 없음)'}</b>
              {/* 번호는 이름 바로 오른쪽 알약에 — 누르면 이 자리 주소를 복사(지시) */}
              <IdPill
                id={reqLabel(selectedReq)}
                href={gotoHref('req', urlIdOf(reqPk(selectedReq)))}
              />
            </>
          )}
          <span className="muted small">
            {selectedReq
              ? ''
              : folderMode
                ? `${folderReqs.length}건 · 하위 폴더 포함`
                : '폴더를 고르세요'}
          </span>
        </span>
        <span className="sp" />
        {/* 시험 항목 화면과 **같은 자리** — 맨 위 줄 오른쪽 끝(지시).
            한 건을 펴 놓았으면 그 요구사항을 보는 사람, 목록이면 이 화면에
            들어와 있는 사람 전부. */}
        <PresenceBar users={selectedReq ? presence.users : crowd} me={meName} />
      </div>

      <div className="split rq-split" ref={splitRef}>
        {/* 접었을 때 — 세로 띠 하나만 남는다. 사이클·TC 화면과 같은 모양.
            아주 없애면 다시 펼 길이 없어지고 어디 있었는지도 잊는다. */}
        {!treeOpen && (
          <button
            type="button"
            className="tc-fold"
            title="폴더 펼치기"
            onClick={() => setTreeOpen(true)}
          >
            <IconPanel open />
            <span className="tc-fold-t">폴더 {allReqs.length}</span>
          </button>
        )}
        {/* ── 왼쪽: 폴더 + 요구사항 한 트리 ─────────────────
            전에는 분류 트리와 요구사항 목록이 따로였다. 자료가 29건 ·
            분류 20개라 전체가 한 화면에 들어오는데 두 단계로 고르게 하고
            있었다. Zephyr Enterprise 처럼 폴더 안에 요구사항을 둔다. */}
        {treeOpen && (
        <section className="panel req-tree-panel" style={{ flexBasis: catW }}>
          {/* 한 줄에 다 넣는다. 건수를 따로 아래에 두면 그만큼 목록이 준다. */}
          {/* 1열은 폴더만 다룬다 — 요구사항을 만들고 고치고 지우는 일은
              전부 2열 표(Add·Clone·Delete·Export)가 맡는다. 두 군데에
              같은 일이 있으면 어디를 눌러야 할지 매번 생각하게 된다. */}
          {/* 이름표(「Folder Tree 24」)를 빼고 그 자리에 **폴더 찾기**를 둔다
              (지시). 이름은 위 빵부스러기가 이미 말하고, 건수는 이 칸 맨
              아래 「폴더 N개 · 요구사항 N건」 이 말한다 — 줄 하나를 아꼈다. */}
          <ListHead
            name=""
            onCollapse={() => setTreeOpen(false)}
            // 찾기는 **세 화면이 같은 부품**을 쓴다(지시) — 평소엔 돋보기,
            // 누르면 왼쪽으로 자란다. 여기만 늘 펴진 칸이라 달라 보였다.
            search={{ value: folderQ, placeholder: '폴더 찾기', onChange: setFolderQ }}
            // 폴더 정렬 — ⋯ 왼쪽 아이콘 단추. 기본은 숫자(자릿수 코드).
            // 파란 + 는 뺐다(피드백) — 새 프로젝트는 ⋯ 메뉴에 있다.
            extra={<FolderSortBtn value={folderSort} onChange={setFolderSort} />}
            menu={
              <>
                <button type="button" onClick={() => setAddFolder((n) => n + 1)}>
                  새 프로젝트
                </button>
                <p className="lh-hint">
                  하위 폴더 추가 · 이름 바꾸기 · 삭제는 폴더를 우클릭하세요.
                </p>
                <hr />
                <button type="button" onClick={() => setFoldersOnly((v) => !v)}>
                  {foldersOnly ? '✓ ' : ''}폴더만 보기
                </button>
                <hr />
                <button
                  type="button"
                  onClick={() => {
                    void catQ.refetch()
                    void reqQ.refetch()
                  }}
                >
                  다시 읽기
                </button>
              </>
            }
          />
          {loading ? (
            <div className="empty">불러오는 중…</div>
          ) : (
            <ReqTree
              reqs={allReqs}
              tcsFor={tcsFor}
              selected={selected}
              // 요구사항과 폴더는 둘 중 하나만 골라져 있다. 오른쪽 패널이
              // 무엇을 보여줄지가 여기서 갈리므로 서로를 지운다.
              onSelect={(pk) => {
                // 트리에서 요구사항을 고르면 그 한 건을 보는 것이다 → Detail.
                // 폴더는 지우지 않는다(가운데 목록이 형제를 보여 줘야 한다).
                setSelected(pk)
                reflectUrl('req', urlIdOf(pk))
              }}
              view={{ fullId, foldersOnly }}
              folderQ={folderQ}
              selectedFolder={selectedFolder}
              onSelectFolder={(id) => {
                setSelectedFolder(id)
                setSelected(null)
              }}
              picked={picked}
              onRowClick={treeSel.onClick}
              sort={sort}
              folderSort={folderSort}
              addFolderSignal={addFolder}
              onAddRoot={() => setNewProj(true)}
            />
          )}
          {/* 카드 바닥 상태 바 — 세 칸이 같은 자리에서 같은 말을 한다(피드백) */}
          <div className="bottom colbot">
            <span>
              폴더 {folderCount}개 · 요구사항 {allReqs.length}건
            </span>
            {picked.size > 0 && <span>{picked.size}건 선택됨</span>}
          </div>
        </section>
        )}

        {treeOpen && (
          <Resizer
            label="요구사항 트리 폭 조절"
            onResize={setCatW}
            getOrigin={() => splitRef.current?.getBoundingClientRect().left ?? 0}
          />
        )}


        {/* ── 가운데: Detail 일 때만 — 형제 요구사항을 좁게 ──────
            어느 하나를 읽다가 옆 것으로 넘어가는 일이 잦다. 이 목록이
            없으면 그때마다 List 로 돌아갔다 다시 들어와야 한다. */}
        {/* 1건뿐이어도 띄운다. 「2건 이상일 때만」 으로 두었더니 폴더에 하나만
            있는 요구사항에서는 이 열이 통째로 사라져, 열이 있다 없다 하는
            것으로 보였다. */}
        {/* 폴더를 고른 것만으로도 띄운다.
            전에는 요구사항을 골라야 나왔다. 그래서 1열에서 상위 폴더를
            누르면 그 아래 요구사항이 어디에도 안 보였다 — 하위 폴더까지
            훑어 모은 목록이 정작 필요한 때가 그때인데. */}
        {/* ── 2열: 이 폴더의 요구사항 표 — 옛 List 화면 그대로 ──
            토글을 없앴다. 폴더를 고르면 여기가 그 폴더의 표고, 표에서
            한 건을 고르면 3열이 상세다 — 고른 것이 화면을 정한다. */}
        <section className="panel rq-listcol">
          {selectedReq ? (
            /* ── 레일 보기 — 3열이 하던 상세를 2열 전체로(합의 스펙).
                 트리에서 요구사항을 직접 누르거나, 인라인 카드에서
                 「레일로 크게」 를 누르면 여기로 온다. ── */
            <>
              <div className="rq-rail-h">
                <button
                  className="btn"
                  type="button"
                  title="요구사항 목록으로 돌아갑니다"
                  onClick={() => {
                    setSelected(null)
                    window.history.pushState({ utop: true }, '', window.location.pathname)
                  }}
                >
                  ← 목록
                </button>
                {/* 제목은 위 빵부스러기에 이미 있다 — 겹쳐서 걷고(지시)
                    그 자리를 **저장 단추**에 준다. */}
                <span className="sp" />
                {/* 시험항목 화면과 같은 꼴(지시) — 고친 게 있으면 파랗게,
                    다 저장돼 있으면 쉬면서 「저장됨」 으로 흐려진다. */}
                <button
                  className={`btn${infoDirty ? ' primary' : ''}`}
                  type="button"
                  disabled={!infoDirty || infoSaving}
                  title={infoDirty ? '고친 값을 저장합니다' : '고친 것이 없습니다'}
                  onClick={() => void saveInfo()}
                >
                  {infoSaving ? '저장 중…' : infoDirty ? '저장' : '저장됨'}
                </button>
              </div>
              {/* 탭을 **세로 레일**로 옮겼다(지시). 가로줄에 두면 그 아래가
                  또 한 칸으로 갈려 내용 칸이 좁아졌다 — 왼쪽에 세우고 오른쪽
                  전부를 내용에 준다. */}
              <div className="rq-rail-b">
                {/* 사진(SquashTM) 꼴 — 아이콘만 남는 48px 레일.
                    부품(VRail)은 세 화면이 같이 쓴다. 이름은 올렸을 때
                    말풍선으로, 개수는 아이콘 아래 숫자로 나온다. */}
                <VRail
                  dir="h"
                  ariaLabel="요구사항 보기"
                  value={tab}
                  onPick={(k) => {
                    /* 가로 레일은 **칸을 갈아 끼운다**(지시) — 굴려서 찾던
                       것이 짧은 칸에서 엉성했다. 접힘 상태는 안 쓴다. */
                    setShut((v) => {
                      if (!v.has(k)) return v
                      const n = new Set(v)
                      n.delete(k)
                      return n
                    })
                    setTab(k as typeof tab)
                  }}
                  items={TABS.map(([k, label, hint]) => ({
                    k,
                    label,
                    hint,
                    n: k === 'tc' ? linked.length : 0,
                    icon:
                      k === 'info' ? (
                        <IconReqDoc />
                      ) : k === 'detail' ? (
                        <IconSparkle />
                      ) : k === 'tc' ? (
                        <IconTcDoc />
                      ) : k === 'runs' ? (
                        <IconExecution />
                      ) : (
                        <IconCycle />
                      ),
                  }))}
                />
                <div className="rq-rail-c railbox" ref={railRef}>
                  {/* 탭을 갈아 끼우지 않고 **한 줄기로 잇는다**(지시·사진).
                      레일을 누르면 그 칸으로 가고, 손으로 굴리면 레일 색이
                      따라온다. 칸은 접었다 펼 수 있고, 접어도 이름표는 남는다. */}
                  {tab === "info" && <RailSec k="info" title="Info" open={!shut.has('info')} onToggle={() => toggleSec('info')}>
                    <ReqDetail
                      req={selectedReq}
                      tcs={linked}
                      tab="info"
                      edit={{
                        status: curStatus,
                        priority: curPrio,
                        statuses: REQ_STATUS,
                        priorities: REQ_PRIO,
                        onChange: (p) =>
                          setInfoDraft({
                            status: p.status ?? curStatus,
                            priority: p.priority ?? curPrio,
                          }),
                      }}
                    />
                  </RailSec>}
                  {tab === "detail" && <RailSec k="detail" title="Intent" open={!shut.has('detail')} onToggle={() => toggleSec('detail')}>
                    <ReqDetail req={selectedReq} tcs={linked} tab="detail" />
                  </RailSec>}
                  {tab === "tc" && <RailSec
                    k="tc"
                    title="Coverages"
                    right={`TC ${linked.length}건`}
                    open={!shut.has('tc')}
                    onToggle={() => toggleSec('tc')}
                  >
                <div className="tc-body scroll">
                  {/* 무엇이 덜 덮였는지 보고 바로 시험 이름을 뽑는다(지시) */}
                  <div className="cov-ai">
                    <b className="small">시험 항목 제안</b>
                    <span className="sp" />
                    <LlmPick value={covLlm} onChange={setCovLlm} />
                    <button
                      className="btn small"
                      type="button"
                      disabled={covBusy || !selectedReq}
                      title="구현내용을 읽고, 이미 있는 시험과 겹치지 않는 항목을 제안합니다"
                      onClick={() => void askCoverage()}
                    >
                      <span className={`ai-mark${covBusy ? ' on' : ''}`}>✨</span> AI
                    </button>
                  </div>
                  {covErr && <div className="form-error">{covErr}</div>}
                  {covIdea.length > 0 && (
                    <div className="cov-made">
                      <ol className="cov-idea">
                        {covIdea.map((x, i) => (
                          <li key={i}>
                            <label className="cov-pick">
                              <input
                                type="checkbox"
                                checked={covPick.has(i)}
                                onChange={(e) =>
                                  setCovPick((s2) => {
                                    const n = new Set(s2)
                                    if (e.target.checked) n.add(i)
                                    else n.delete(i)
                                    return n
                                  })
                                }
                              />
                              <b>{x.name}</b>
                            </label>
                            {x.object && <div className="muted small cov-obj">{x.object}</div>}
                          </li>
                        ))}
                      </ol>
                      <div className="cov-mkbar">
                        <span className="muted small">
                          고른 {covPick.size}건을 이 요구사항 자리에 만듭니다 — 스텝은 비어 있고,
                          모델그룹·모델명은 이 프로젝트 것을 씁니다.
                        </span>
                        <span className="sp" />
                        <button
                          className="btn small"
                          type="button"
                          onClick={() => {
                            setCovIdea([])
                            setCovPick(new Set())
                          }}
                        >
                          버리기
                        </button>
                        <button
                          className="btn small primary"
                          type="button"
                          disabled={covMaking || covPick.size === 0}
                          onClick={() => void makeTcs()}
                        >
                          {covMaking ? '만드는 중…' : `시험항목 만들기 (${covPick.size})`}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className={`cov-bar ${linked.length === 0 ? 'none' : cov.fail > 0 ? 'bad' : cov.idle > 0 ? 'warn' : 'good'}`}>
                    {linked.length === 0 ? (
                      <>
                        <b>미커버</b>
                        <span className="muted small">
                          이 요구사항을 검증하는 TC 가 없습니다. 표의 「Map」 으로 붙이세요.
                        </span>
                      </>
                    ) : (
                      <>
                        <b>{cov.fail > 0 ? '실패 있음' : cov.idle > 0 ? '미실행 있음' : '커버됨'}</b>
                        <span className="muted small">
                          TC {linked.length}건 · PASS {cov.pass} · FAIL {cov.fail} · 미실행 {cov.idle}
                        </span>
                      </>
                    )}
                  </div>

                  <div className="filter">
                    <input
                      placeholder="TC ID / 제목 검색"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                    />
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                    >
                      <option value="">전체 상태</option>
                      <option value="pass">PASS</option>
                      <option value="fail">FAIL</option>
                      <option value="idle">미실행</option>
                      <option value="draft">작성중</option>
                    </select>
                  </div>

                  <div className="table">
                    <div className="tr th">
                      <div>Test Case</div>
                      <div>유형</div>
                      <div>Step</div>
                      <div>상태</div>
                      <div />
                    </div>
                    {shown.length === 0 ? (
                      <div className="empty">
                        {linked.length === 0
                          ? '연결된 TC가 없습니다.'
                          : '조건에 맞는 TC가 없습니다.'}
                      </div>
                    ) : (
                      shown.map((t) => (
                        <div className="tr" key={t.tcid}>
                          <div className="tc-cell">
                            <span className="rt-dicon" aria-hidden="true">
                              <IconTcDoc />
                            </span>
                            <a
                              className="tc-name linkish"
                              href={gotoHref('tc', t.tcid)}
                              title={`${t.tcid} — 누르면 이 시험으로 갑니다 (Ctrl+클릭·오른쪽 단추로 새 탭)`}
                              onClick={(e) => gotoClick(e, 'tc', t.tcid)}
                            >
                              {t.name || '(제목 없음)'}
                            </a>
                          </div>
                          <div>
                            <PickCell
                              value={t.type ?? ''}
                              opts={TC_TYPE}
                              title="고르면 바로 저장됩니다"
                              onSave={(v) => setTcCell(t, { type: v })}
                            />
                          </div>
                          <div className="muted small">{t._cli_count ?? '-'}</div>
                          <div>
                            <PickCell
                              value={t.status ?? ''}
                              opts={TC_STATUS}
                              title="고르면 바로 저장됩니다"
                              cls={`status ${statusClass(t.status)}`}
                              onSave={(v) => setTcCell(t, { status: v })}
                            />
                          </div>
                          <div className="rq-tcacts">
                            <button
                              className="btn small"
                              type="button"
                              disabled={unlinkM.isPending}
                              title="이 요구사항에서 뗍니다. TC 자체는 지워지지 않습니다"
                              onClick={() => {
                                if (window.confirm(`'${t.name || t.tcid}' 을 이 요구사항에서 뗍니다.`))
                                  unlinkM.mutate(t)
                              }}
                            >
                              해제
                            </button>
                            {/* 지우기는 되돌릴 수 없다 — 해제와 눈에 띄게 갈라 둔다 */}
                            <button
                              className="btn small danger"
                              type="button"
                              disabled={delTcM.isPending}
                              title="이 시험을 아주 지웁니다 — 되돌릴 수 없습니다"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `'${t.name || t.tcid}' 를 아주 지울까요?\n스텝·실행 기록까지 함께 사라지고 되돌릴 수 없습니다.`,
                                  )
                                )
                                  delTcM.mutate(t)
                              }}
                            >
                              삭제
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                  </RailSec>}
                  {tab === "runs" && <RailSec k="runs" title="Execution History" open={!shut.has('runs')} onToggle={() => toggleSec('runs')}>
                    <ReqDetail req={selectedReq} tcs={linked} tab="runs" />
                  </RailSec>}
                  {tab === "history" && <RailSec k="history" title="Change History" open={!shut.has('history')} onToggle={() => toggleSec('history')}>
                    <ReqDetail req={selectedReq} tcs={linked} tab="history" />
                  </RailSec>}
                </div>
              </div>
              <div className="bottom colbot">
                <span>
                  연결 TC {linked.length}건
                  {tab === 'tc' && shown.length !== linked.length && ` · ${shown.length}개 표시`}
                </span>
              </div>
            </>
          ) : (
            <>
          {/* 액션은 머리줄에 — 따로 한 줄을 먹고 있어서 표가 그만큼 짧았다 */}
          <div className="rq-mid-h rq-mid-acts">
            {/* 「Requirements N」 이름표는 뺐다(피드백) — 위 빵부스러기와
                아래 「요구사항 N건」 이 이미 말한다. 버튼이 왼쪽부터 선다. */}
              <div className="rq-actions">
                {/* 만들기는 상시, 나머지는 고른 뒤에만(피드백 규칙):
                    없음   → +New · +Bulk New
                    1건    → … | Edit  Clone | Delete
                    2건 이상 → … | Bulk Edit  Clone | Delete
                    Export 는 뺐다. Delete 는 사이클처럼 구분선 너머 끝자리. */}
                <button className="btn" type="button" onClick={() => setForm(null)}>
                  + New
                </button>
                <button
                  className="btn"
                  type="button"
                  title="엑셀·문서에서 붙여넣어 여러 건을 한 번에 만듭니다"
                  onClick={() => setImportOpen(true)}
                >
                  + Bulk New
                </button>
                {pickedInList.length > 0 && (
                  <>
                    <span className="cy-vsep" aria-hidden="true" />
                    {pickedInList.length === 1 ? (
                      <button
                        className="btn"
                        type="button"
                        title="고른 요구사항을 고칩니다"
                        onClick={() => pickedInList[0] && setForm(pickedInList[0])}
                      >
                        Edit
                      </button>
                    ) : (
                      <button
                        className="btn"
                        type="button"
                        title={`고른 ${pickedInList.length}건을 한꺼번에 고칩니다`}
                        onClick={() => setBulkEditOpen(true)}
                      >
                        Bulk Edit
                      </button>
                    )}
                    <button
                      className="btn"
                      type="button"
                      disabled={!!listBusy}
                      onClick={() => void clonePicked()}
                    >
                      {listBusy === 'clone' ? '복제 중…' : 'Clone'}
                    </button>
                    <span className="cy-vsep" aria-hidden="true" />
                    <button
                      className="btn danger"
                      type="button"
                      disabled={!!listBusy}
                      onClick={() => void deletePicked()}
                    >
                      {listBusy === 'del' ? '삭제 중…' : 'Delete'}
                    </button>
                  </>
                )}
              </div>
              <span className="sp" />
              {/* 검색 — 별줄 대신 도구줄 오른쪽(피드백: 2번 자리) */}
              <div className="rq-ffind rq-actfind">
                <input
                  value={listQ}
                  placeholder="요구사항 찾기"
                  onChange={(e) => setListQ(e.target.value)}
                />
                {listQ && (
                  <button type="button" title="지우기" onClick={() => setListQ('')}>
                    ✕
                  </button>
                )}
              </div>
              {/* 목록 정렬 — **⚙ 왼쪽**(지시). 기본은 트리 순서 */}
              <ListSortBtn value={listSort} onChange={setListSort} />
              {/* ⚙ — INFO 필드 보이기/숨기기. 사이클 보드처럼 고정 좌표 팝업 */}
              <button
                type="button"
                className="lh-findbtn"
                title="INFO 필드 보이기/숨기기 — SETUP 구성과 같은 목록"
                aria-expanded={!!reqGearAt}
                onClick={(e) =>
                  setReqGearAt(reqGearAt ? null : { x: e.clientX, y: e.clientY })
                }
              >
                <IconSettings />
              </button>
              {reqGearAt && (
                <>
                  <div
                    className="tc-menu-back"
                    style={{ zIndex: 60 }}
                    onClick={() => setReqGearAt(null)}
                  />
                  <div
                    className="tc-menu tc-colpop"
                    role="menu"
                    style={{
                      position: 'fixed',
                      left: Math.max(8, reqGearAt.x - 170),
                      top: reqGearAt.y + 10,
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
                          checked={reqCols.has(c2.k)}
                          onChange={() => toggleReqCol(c2.k)}
                        />
                        {c2.label}
                      </label>
                    ))}
                  </div>
                </>
              )}
          </div>
          {/* 검색 줄은 도구줄 오른쪽으로 옮겼다(피드백) */}
          <div className="rq-list scroll">
            {/* Select All 줄은 걷었다(지시) — 전체 선택은 머리줄 첫 칸
                체크박스가 한다. 엑셀·Monday 표의 그 자리다. */}
            <div className="rq-table">
              <div className="rq-tr rq-th" style={{ gridTemplateColumns: reqGrid }}>
                <div className="rq-ck">
                  <input
                    type="checkbox"
                    checked={allListPicked}
                    title={`전체 선택${pickedInList.length ? ` (${pickedInList.length}건 선택됨)` : ''}`}
                    ref={(el) => {
                      if (el) el.indeterminate = pickedInList.length > 0 && !allListPicked
                    }}
                    disabled={!sortedFolderReqs.length}
                    onChange={toggleAllList}
                  />
                </div>
                {/* ID 열은 뺐다 — 고르면 위 빵부스러기에 그대로 나온다.
                    고정: Name·모델(상속)·Map·TC. INFO 필드는 ⚙ 가 정한다. */}
                <div>제목</div>
                <div>모델그룹</div>
                <div>모델명</div>
                <div>Map</div>
                <div>TC</div>
                {reqVisCols.map((c) => (
                  <div key={c.k}>{c.label}</div>
                ))}
              </div>
              {midReqs.length === 0 ? (
                <div className="empty">
                  {folderMode ? '이 폴더에 요구사항이 없습니다.' : '왼쪽에서 폴더를 고르세요.'}
                </div>
              ) : (
                midReqs.map((r) => {
                  const n = covCount(r)
                  const pk = reqPk(r)
                  return (
                    <div
                      className={`rq-tr${listPick.has(pk) ? ' picked' : ''}`}
                      key={pk}
                      style={{ gridTemplateColumns: reqGrid }}
                      // 끌어서 1열 폴더로 — 5px 은 눌러 고르기와 안 겹친다
                      onPointerDown={(e) => beginRowDrag(e, r)}
                      /* 우클릭 = 메뉴(지시: 목업 그대로). 어느 칸에서 눌렀는지
                         보고 「채우기」 가 무엇을 채울지 정한다 */
                      onContextMenu={(e) => {
                        e.preventDefault()
                        const cell = (e.target as HTMLElement).closest('.rq-cell-fill')
                        const idx = cell ? [...(cell.parentElement?.children ?? [])].indexOf(cell) : -1
                        const heads = ['', '', '', '', '', '', ...reqVisCols.map((c) => c.k)]
                        const k = heads[idx] === 'f_priority' ? 'priority' : heads[idx] === 'f_status' ? 'status' : ''
                        setRowMenu({ r, key: k as 'status' | 'priority' | '', x: e.clientX, y: e.clientY })
                      }}
                    >
                      <div className="rq-ck">
                        <input
                          type="checkbox"
                          checked={listPick.has(pk)}
                          aria-label={`${r.title || pk} 고르기`}
                          onChange={() => togglePick(pk)}
                        />
                      </div>
                      <div className="rq-name">
                        <span className="rq-icon" aria-hidden="true">
                          <IconReqDoc />
                        </span>
                        <button
                          type="button"
                          className="linkish"
                          title={`${reqLabel(r)} — 누르면 상세(레일)로 갑니다`}
                          /* 인라인 카드는 걷어냈다(피드백) — 레일 왕복이
                             「← 목록」 으로 충분히 빨라 겹말이었다.
                             탭은 안 건드린다 — 훑을 때 탭 유지. */
                          onClick={() => goDetail(pk)}
                        >
                          {r.title || '(제목 없음)'}
                        </button>
                        {(() => {
                          const loc = relFolderPath(r)
                          return loc ? (
                            <i className="rq-loc" title={loc}>
                              {loc}
                            </i>
                          ) : null
                        })()}
                      </div>
                      {(() => {
                        const p = r.cat1 ? prjByCat.get(r.cat1 as string) : undefined
                        return (
                          <>
                            <div className="muted small">{p?.model_group || '–'}</div>
                            <div className="muted small">{p?.model || '–'}</div>
                          </>
                        )
                      })()}
                      <div>
                        <button
                          type="button"
                          className="linkish"
                          title="이 요구사항에 시험을 붙입니다"
                          onClick={() => setMapFor(r)}
                        >
                          Map
                        </button>
                      </div>
                      {/* Monday 통채움 — 미커버(빨강)가 이 표에서 제일 값진
                          신호라 셀 통째로 말한다(승인) */}
                      <div className="rq-cell-fill">
                        <div
                          className={`rq-mfill ${n > 0 ? 'cov-ok' : 'cov-no'}`}
                          title={n > 0 ? `${n}개 시험이 덮고 있습니다` : '덮는 시험이 없습니다'}
                        >
                          {n > 0 ? `TC ${n}` : '미커버'}
                        </div>
                      </div>
                      {reqVisCols.map((c2) => {
                        switch (c2.k) {
                          case 'f_status': {
                            /* Monday 통채움(승인) — 셀 전체가 값의 색이고,
                               그대로 드롭다운이다. 우클릭 = 아래로 채우기 */
                            const f = codeFill('req_status', r.status ?? '')
                            const ks = kstyle('req_status')
                            return (
                              <div className={`rq-cell-fill al-${ks.align || 'center'}`} key={c2.k}>
                                <div
                                  className={`rq-mfill sh-${ks.shape || 'fill'}`}
                                  style={{ background: f.bg, color: f.fg, ...kfont('req_status') }}
                                >
                                  <PickCell
                                    value={r.status ?? ''}
                                    opts={REQ_STATUS}
                                    title="상태 — 고르면 바로 저장 · 우클릭 = 아래로 채우기"
                                    onSave={(v) => setField(r, { status: v })}
                                  />
                                </div>
                              </div>
                            )
                          }
                          case 'f_priority': {
                            const f = codeFill('req_priority', r.priority ?? '')
                            const ks = kstyle('req_priority')
                            return (
                              <div className={`rq-cell-fill al-${ks.align || 'center'}`} key={c2.k}>
                                <div
                                  className={`rq-mfill sh-${ks.shape || 'fill'}`}
                                  style={{ background: f.bg, color: f.fg, ...kfont('req_priority') }}
                                >
                                  <PickCell
                                    value={r.priority ?? ''}
                                    opts={REQ_PRIO}
                                    title="우선순위 — 고르면 바로 저장 · 우클릭 = 아래로 채우기"
                                    onSave={(v) => setField(r, { priority: v })}
                                  />
                                </div>
                              </div>
                            )
                          }
                          default: {
                            // 커스텀 INFO 필드 — 값은 data->custom
                            const v = String(
                              ((r as unknown as { custom?: Record<string, unknown> }).custom?.[
                                c2.k.slice(3)
                              ] ?? '') || '',
                            )
                            return (
                              <div className="muted small" key={c2.k} title={v}>
                                {v || '–'}
                              </div>
                            )
                          }
                        }
                      })}
                    </div>
                  )
                })
              )}
            </div>
          </div>
          {/* 카드 직속으로 둬야 1열 상태 바와 구분선 높이가 맞는다(피드백) —
              rq-list 안에 두면 그 여백만큼 떠 보인다 */}
          <div className="bottom colbot">
            <span>요구사항 {midReqs.length}건</span>
            {pickedInList.length > 0 && <span>{pickedInList.length}건 선택됨</span>}
          </div>
            </>
          )}
        </section>
        {/* 3열은 들어냈다(합의 스펙) — 상세는 위 레일 보기와 인라인 카드가
            맡는다. 폴더 단위 TC 모음이 필요하면 Coverage 화면이 그 자리다. */}
      </div>
    </>
  )
}
