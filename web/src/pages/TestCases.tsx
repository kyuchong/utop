import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiFetch, categoryApi, tcApi } from '@/api/client'
import TcForm from '@/components/TcForm'
import ListHead from '@/components/ListHead'
import { IconPanel, IconParam, IconSettings, IconTcDoc } from '@/components/icons'
import PresenceBar from '@/components/PresenceBar'
import SaveBell, { type SaveEvent } from '@/components/SaveBell'
import { usePresence } from '@/components/usePresence'
import { usePageCrowd } from '@/components/usePageCrowd'
import TcBulkForm from '@/components/TcBulkForm'
import TcBulkEdit from '@/components/tc/TcBulkEdit'
import TcMapReqDialog from '@/components/tc/TcMapReqDialog'
import { useMultiSelect } from '@/components/useMultiSelect'
import TcSequence from '@/components/tc/TcSequence'
import TcStepDetail from '@/components/tc/TcStepDetail'
import TcTree from '@/components/tc/TcTree'
import FolderSortBtn from '@/components/FolderSortBtn'
import { useInfoCols } from '@/components/useInfoCols'
import TcStart from '@/components/tc/TcStart'
import TcSessionBar from '@/components/tc/TcSessionBar'
import TcParamBar from '@/components/tc/TcParamBar'
import TcTerminal from '@/components/tc/TcTerminal'
import TcSaveAs from '@/components/tc/TcSaveAs'
import TcRevisions from '@/components/tc/TcRevisions'
import { useGlobalParams } from '@/components/tc/useGlobalParams'
import GlobalParams from '@/components/settings/GlobalParams'
import {
  buildTcFile,
  downloadJson,
  parseTcFile,
  remapSessions,
  tcFileName,
  TcFileError,
  nextTcId,
  uniqueTcId,
} from '@/components/tc/portable'
import TcInfo from '@/components/tc/TcInfo'
import TcManual from '@/components/tc/TcManual'
import TcEnv from '@/components/tc/TcEnv'
import TcTopology from '@/components/tc/TcTopology'
import TcTraffic from '@/components/tc/TcTraffic'
import TcHistory from '@/components/tc/TcHistory'
import TcCycles from '@/components/tc/TcCycles'
import TcSuggest from '@/components/tc/TcSuggest'
import { deviceLabel, isMeter } from '@/components/tc/device'
import type { Device } from '@/pages/Devices'
import Resizer, { useResizableWidth } from '@/components/Resizer'
import { onGoto, reflectUrl } from '@/api/goto'
import {
  reqLabel,
  reqPk,
  statusClass,
  type Requirement,
  type TestCaseMeta,
} from '@/types'
import { blockEnd, runPicked, runSteps, type RunCtx } from '@/components/tc/runner'
import { extractOne } from '@/components/tc/judge'
import type { PickItem } from '@/components/tc/PickList'
import {
  needsDevice,
  sessionIndex,
  stepResult,
  stepStatus,
  type StepKind,
  type TcData,
  type TcStep,
} from '@/components/tc/types'
import './TestCases.css'

type Tab = 'steps' | 'info' | 'env' | 'topo' | 'traffic' | 'manual' | 'history' | 'cycle'

/** 새 스텝의 기본값. 종류마다 처음부터 채워둬야 자연스러운 값이 다르다. */
function blankStep(kind: StepKind): TcStep {
  const base: TcStep = { kind, indent: 0 }
  if (kind === 'cli' || kind === 'connect' || kind === 'disconnect' || kind === 'instrument')
    base.session = 0
  if (kind === 'wait') base.waitSec = 3
  if (kind === 'ping') base.pingCount = 4
  if (kind === 'snmp_trap') base.trapSec = 15
  if (kind === 'loop') {
    base.forFrom = 1
    base.forTo = 10
    base.loopVar = 'i'
  }
  return base
}

/**
 * 테스트케이스 화면.
 *
 * 3열이다 — 1열 폴더·요구사항·TC 트리 · 2열 스텝 요약 · 3열 스텝 세부.
 *
 * 1열은 요구사항 화면과 같은 트리다. 전에는 TC 89건이 평평하게 늘어선
 * 목록이었고 요구사항으로 좁히려면 위의 「요구사항」 팝업을 따로 띄워야
 * 했다 — '지금 무엇으로 좁혀져 있나' 가 목록 밖에 있었다. 좁히는 일과
 * 고르는 일은 한 자리에서 끝나야 한다.
 *
 * 전에는 TC 를 누르면 화면이 통째로 상세로 바뀌어 목록이 사라졌다. 89건을
 * 훑을 때 그것이 가장 불편했다.
 */
/**
 * 새로고침해도 보던 자리로 돌아온다.
 *
 * 스텝을 쓰다가 새로고침하면 TC 89건 목록 앞으로 튕겨서 트리를 다시 펼치고
 * 다시 찾아 들어가야 했다. 화면 이름은 이미 App.tsx 가 기억하고 있으니,
 * 여기서는 그 안에서 무엇을 보고 있었는지를 기억한다.
 */
/** List 표의 선택형 열 — ⚙ 에서 켜고 끈다. 이름 열은 항상 있다. */
// ⚙ = SETUP 시험항목 INFO 필드와 1:1(합의 규칙) — 열 정의는
// useInfoCols('tc') 가 만든다. 고정 열(모델그룹·모델명·REQ Map)은
// ⚙ 에 없다. TC ID·생성자·변경일 열은 뺐다 — Info 탭이 보여 준다.
const COL_DEFAULT = ['f_type', 'f_status']

/** 열 하나의 표시값 — 필터 드롭다운과 줄 필터가 같은 값을 쓴다.
    컴포넌트 안에 두면 위쪽 useMemo 가 선언 전에 불러 TDZ 로 터진다. */
function colVal(k: string, t: TestCaseMeta): string {
  // INFO 열쇠(f_<필드>)는 기존 열쇠로 푼다 — 값 셈은 여기 한 곳뿐
  if (k.startsWith('f_')) k = k.slice(2)
  switch (k) {
    case 'id': return t.tcid
    case 'model_group': return (t.model_group as string) || '공용'
    case 'model': return (t.model as string) || '–'
    case 'type': return t.type || '–'
    case 'severity': return t.severity || '–'
    // 목록 API 는 data JSONB 를 돌려준다 — Info 탭의 실행 타입은 그 안에
    // run_type 으로 있다. kind 만 보면 늘 비었다(겪었다).
    case 'kind': return t.kind || (t.run_type as string) || '–'
    case 'created_by': return (t.created_by as string) || '–'
    case 'updated_by': return (t.updated_by as string) || '–'
    case 'updated': return String(t._updated_at_pg ?? '').slice(0, 10) || '–'
    case 'status': return t.status || '미실행'
    case 'origin': return String((t as Record<string, unknown>).origin ?? '') || '–'
    default:
      // 커스텀 INFO 필드(cf_<key>) — 값은 data->custom 에 산다
      if (k.startsWith('cf_')) {
        const v = (t as unknown as { custom?: Record<string, unknown> }).custom?.[k.slice(3)]
        return String(v ?? '') || '–'
      }
      return ''
  }
}

const OPEN_KEY = 'utop.tc.open'
const TAB_KEY = 'utop.tc.tab'
const TABS: Tab[] = ['steps', 'info', 'env', 'topo', 'traffic', 'manual', 'history', 'cycle']

interface PageProps {
  /** 지금 사람. 같이 보고 있는 사람을 가리는 데 쓴다 */
  me?: { username?: string; name?: string } | null
}

export default function TestCases({ me }: PageProps) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>(() => {
    const v = localStorage.getItem(TAB_KEY) as Tab | null
    // 저장된 값이 지금 없는 탭일 수 있다(탭 이름을 바꾼 뒤). 빈 화면이 뜨느니
    // 기본으로 돌린다.
    return v && TABS.includes(v) ? v : 'steps'
  })
  const [openId, setOpenId] = useState(() => localStorage.getItem(OPEN_KEY) || '')
  /**
   * 인라인으로 보는 중인가 — 표에서 ▸ 로 펼치면 켜진다.
   *
   * 켜져 있으면 시험이 열려 있어도(List 안 인라인) 표를 떠나지 않는다.
   * 이름을 눌러 제대로 열면(Detail) 꺼진다.
   */
  // 인라인 모드는 걷어냈다(피드백 — 요구사항 화면과 같은 결론):
  // 줄 클릭 = 전체 상세(레일), ← 목록으로 복귀. 인라인은 제약만 많았다.
  /** 보이는 INFO 필드 열 — ⚙ 는 SETUP 의 시험항목 INFO 필드와 1:1(합의).
      모델그룹·모델명·REQ Map 은 고정 열이라 ⚙ 에 없다. */
  const [cols, setCols] = useState<string[]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem('utop.tc.infocols') || '')
      return Array.isArray(v) ? (v as string[]) : COL_DEFAULT
    } catch {
      return COL_DEFAULT
    }
  })
  useEffect(() => {
    localStorage.setItem('utop.tc.infocols', JSON.stringify(cols))
  }, [cols])
  const [colsOpen, setColsOpen] = useState(false)
  /** 판(버전) 이력 창 */
  const [revOpen, setRevOpen] = useState(false)
  // 열 차례 끌기는 뺐다 — ⚙ 는 SETUP INFO 필드 목록 그대로(합의 규칙),
  // 차례도 그 목록의 차례다.
  /** 표 검색 — 트리 검색과 별개로, 지금 자리 안에서 좁힌다 */
  const [listQ, setListQ] = useState('')
  /** 열 값 필터 — 머리의 드롭다운 */
  const [colF, setColF] = useState<Record<string, string>>({})
  const view: 'list' | 'detail' = openId ? 'detail' : 'list'
  const [stepIdx, setStepIdx] = useState(-1)
  const [menuOpen, setMenuOpen] = useState(false)
  /** 1열 「+」 — 최상위 폴더 입력칸을 연다 (요구사항 화면과 같은 문법) */
  const [addFolderN, setAddFolderN] = useState(0)
  /** 3열 머리의 ⋯ — 이 칸을 무엇으로 쓸지 고르는 자리 */
  const [detMenu, setDetMenu] = useState(false)
  /** 명령어 캡쳐를 열면 3열이 그것으로 바뀐다 — 캡쳐하는 동안 스텝 세부는 볼 일이 없다 */
  const [termOpen, setTermOpen] = useState(false)
  /**
   * 전역 파라미터를 보고 있는가.
   *
   * 전에는 트리 맨 위의 고정 폴더에서 파일을 하나 골라 열었다. 그 줄은
   * 폴더인 척하면서 폴더가 아니었고(지울 수도 옮길 수도 없다), 시험을
   * 찾는 눈길이 매번 그것을 넘어가야 했다. 이제 칸 머리의 단추 하나로
   * 켜고, 2열에 **파일 목록과 편집을 함께** 편다 — 값을 고치려고 파일을
   * 하나씩 골라 들어갈 일이 없다.
   */
  const [gpOpen, setGpOpen] = useState(false)
  /** 1열 폴더 차례 — 요구사항 화면과 같은 저장 키를 쓴다(두 트리가 같은 순서) */
  const [folderSort, setFolderSort] = useState<'manual' | 'num' | 'abc' | 'kor'>(() => {
    const v = localStorage.getItem('utop.req.foldersort')
    return v === 'manual' || v === 'num' || v === 'abc' || v === 'kor' ? v : 'num'
  })
  useEffect(() => {
    localStorage.setItem('utop.req.foldersort', folderSort)
  }, [folderSort])
  const [form, setForm] = useState<TestCaseMeta | null | undefined>(undefined)
  const [bulkOpen, setBulkOpen] = useState(false)
  /** 「시험 시작하기」 — 닮은 시험을 찾아 베낀다 */
  const [startOpen, setStartOpen] = useState(false)
  const [msg, setMsg] = useState<{ kind: string; text: string }>({ kind: '', text: '' })

  // 편집 중인 TC 전체. 목록의 메타가 아니라 스텝까지 든 원본이다.
  const [d, setD] = useState<TcData>({})
  const [dirty, setDirty] = useState(false)

  /** 여러 줄 고르기. 지우거나 건너뛰기를 한 번에 하려는 것 */
  const [picked, setPicked] = useState<Set<number>>(new Set())
  /** shift 범위 고르기의 기준 */
  const lastPick = useRef(-1)

  const [running, setRunning] = useState(false)
  /** 지금 돌고 있는 줄. -1 이면 안 돌고 있다 */
  const [runAt, setRunAt] = useState(-1)

  const splitRef = useRef<HTMLDivElement>(null)
  const [listW, setListW] = useResizableWidth('utop.tc.listW', 250, 170, 900)
  /**
   * 1열을 접어 뒀나.
   *
   * 스텝을 들여다볼 때는 목록이 자리만 먹는다. 폭 조절로 줄일 수는 있지만
   * 끝까지 줄여도 170px 이 남고, 다시 늘릴 때 아까 그 폭을 손으로 찾아야
   * 한다. 접으면 폭은 그대로 기억해 두었다가 펼 때 되돌린다.
   */
  const [listOpen, setListOpen] = useState(
    () => localStorage.getItem('utop.tc.listOpen') !== '0',
  )
  useEffect(() => {
    localStorage.setItem('utop.tc.listOpen', listOpen ? '1' : '0')
  }, [listOpen])
  // 기본값을 바꿀 때는 key 도 올린다 — 이미 저장된 옛 값이 이겨서 아무도
  // 변화를 못 본다(Resizer.tsx 주석). 3열이 남는 폭을 갖게 되면서 2열의
  // 적정 폭도 달라졌다.
  const [seqW, setSeqW] = useResizableWidth('utop.tc.seqW2', 620, 260, 1400)

  const tcQ = useQuery({
    queryKey: ['tc', 'list', 'meta'],
    queryFn: ({ signal }) => api.listTestCases(signal),
  })

  // 세션이 장비 id 로 저장돼 있어 이름을 붙이려면 장비 목록이 필요하다.
  const devQ = useQuery({
    queryKey: ['devices2'],
    queryFn: async () => {
      const r = await apiFetch('/api/devices2')
      if (!r.ok) throw new Error('장비 목록을 불러오지 못했습니다')
      return (await r.json()) as { devices?: Device[] }
    },
    staleTime: 60_000,
  })

  const tcs = tcQ.data?.tcs ?? []

  /**
   * 한꺼번에 고치려고 고른 TC 들. 스텝 고르기(`picked`)와 다른 것이다.
   *
   * 줄마다 네모를 두었더니 목록이 좁아지고 다른 도구와 다르게 동작했다.
   * 파일 탐색기·iTest 처럼 **Ctrl·Shift** 로 고른다.
   */
  const tcSel = useMultiSelect<string>()
  /** 찾는 글자 — 트리 안에 있던 줄을 머리줄로 올렸다 */
  const [treeQ, setTreeQ] = useState('')

  /**
   * 보기 — list(표로 여럿) · detail(한 건을 짜는 편집기).
   *
   * 요구사항 화면과 같은 뼈대다. Detail 은 지금까지의 화면 그대로고
   * (트리 | 스텝 목록 | 스텝 상세), List 는 그 자리를 TC 목록 표가 쓴다.
   * 열을 늘리지 않는 것이 핵심 — 늘리면 정작 스텝 짜는 칸이 좁아진다.
   */
  /*
   * Detail/List 토글을 없앴다 — 고른 것이 화면을 정한다.
   * 폴더·요구사항을 고르면 List(그 묶음의 시험 표), 시험을 고르면
   * Detail(스텝 편집기)이다. view 는 상태가 아니라 파생이다.
   */
  /** List 에서 무엇으로 좁혀 볼지 — 폴더 또는 요구사항 */
  const [selFolder, setSelFolder] = useState<string | null>(null)
  const [selReq, setSelReq] = useState<string | null>(null)
  /** List 표에서 체크한 TC */
  const [listPick, setListPick] = useState<Set<string>>(new Set())
  /** REQ Map — 이 시험에 요구사항을 붙이는 창 */
  const [mapTc, setMapTc] = useState<TestCaseMeta | null>(null)

  /** List 표에 「연결된 요구사항」 을 적고 폴더로 좁히려면 이것들이 필요하다 */
  const reqQ = useQuery({
    queryKey: ['req', 'list'],
    queryFn: ({ signal }) => api.listRequirements(signal),
  })
  const catQ = useQuery({
    queryKey: ['req-categories'],
    queryFn: ({ signal }) => categoryApi.list(signal),
  })

  /** req_id(PK 또는 라벨) → 그 요구사항. TC 가 어느 요구사항 것인지 적으려고 */
  const reqByKey = useMemo(() => {
    const m = new Map<string, Requirement>()
    for (const r of reqQ.data?.reqs ?? []) {
      m.set(reqPk(r), r)
      const l = reqLabel(r)
      if (l) m.set(l, r)
    }
    return m
  }, [reqQ.data])

  /**
   * 이 시험을 가리키는 요구사항들 (tcid → 요구사항 PK 집합).
   *
   * 연결의 정본이 두 군데다 — tc.req_id 한 칸과, 요구사항이 들고 있는
   * tc[] 참조. 둘이 어긋난 자료가 실제로 있어서 합집합으로 센다.
   */
  const reqsOfTc = useMemo(() => {
    const m = new Map<string, Set<string>>()
    const add = (tcid: string, pk: string) => {
      const s0 = m.get(tcid) ?? new Set<string>()
      s0.add(pk)
      m.set(tcid, s0)
    }
    for (const r of reqQ.data?.reqs ?? []) {
      const pk = reqPk(r)
      const label = reqLabel(r)
      for (const t of tcs) {
        const k = t.req_id || ''
        if (k && (k === pk || k === label)) add(t.tcid, pk)
      }
      for (const ref of r.tc ?? []) if (ref?.tcid) add(ref.tcid, pk)
    }
    return m
  }, [reqQ.data, tcs])

  /** 이 폴더(하위 포함)에 속한 요구사항인가 — 조상 사슬을 요구사항이 들고 있다 */
  /**
   * 이 폴더와 그 밑 전부.
   *
   * cat1~4 만 봤더니 상위 폴더를 골라도 하위 폴더의 시험이 안 나왔다 —
   * 요구사항이 조상 사슬을 다 안 들고 있는 자료가 있다. 요구사항 화면이
   * 같은 병을 같은 방법(분류 트리 걷기)으로 고쳤다.
   */
  const folderSet = useMemo(() => {
    if (!selFolder) return null
    const cats = catQ.data?.categories ?? []
    const kids = new Map<string | null, string[]>()
    for (const c of cats) {
      const k = (c.parent_id ?? null) as string | null
      if (!kids.has(k)) kids.set(k, [])
      kids.get(k)!.push(c.id)
    }
    const ids = new Set<string>()
    const walk = (id: string) => {
      if (ids.has(id)) return
      ids.add(id)
      for (const k of kids.get(id) ?? []) walk(k)
    }
    walk(selFolder)
    return ids
  }, [selFolder, catQ.data])

  const inFolder = (r: Requirement | undefined, _folder: string) =>
    !!r &&
    !!folderSet &&
    ([r.cat1, r.cat2, r.cat3, r.cat4].some((c) => c && folderSet.has(c as string)))

  /**
   * List 표에 뿌릴 TC.
   *
   * 트리에서 요구사항을 골랐으면 그 요구사항 것만, 폴더를 골랐으면 그 폴더
   * (하위 포함) 아래 요구사항의 것 전부. 아무것도 안 골랐으면 다 보여 준다 —
   * 「고르기 전엔 텅 빈 화면」 이 제일 답답하다.
   */
  const listRows = useMemo(() => {
    const n = treeQ.trim().toLowerCase()
    return tcs.filter((t) => {
      const r = reqByKey.get(t.req_id || '')
      // 요구사항에 안 붙은 시험들 — 트리의 「요구사항 없음」 줄
      if (selReq === '__orphan__') {
        if (r) return false
      } else if (selReq && (t.req_id || '') !== selReq && (r ? reqPk(r) : '') !== selReq)
        return false
      if (!selReq && selFolder && !inFolder(r, selFolder)) return false
      if (n && !(t.tcid.toLowerCase().includes(n) || (t.name ?? '').toLowerCase().includes(n)))
        return false
      const q2 = listQ.trim().toLowerCase()
      if (q2 && !(t.tcid.toLowerCase().includes(q2) || (t.name ?? '').toLowerCase().includes(q2)))
        return false
      return true
    })
  }, [tcs, reqByKey, selReq, selFolder, folderSet, treeQ, listQ])

  /** 열 필터까지 먹인 줄들 — 드롭다운 선택지는 필터 전(base)에서 뽑는다 */
  const shownListRows = useMemo(() => {
    const keys = Object.keys(colF).filter((k) => colF[k])
    if (!keys.length) return listRows
    return listRows.filter((t) => keys.every((k) => colVal(k, t) === colF[k]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listRows, colF])

  /**
   * 지금 보고 있는 자리까지의 길 — 조상부터 차례로.
   *
   * 이름 하나만 적으면 「ENV」 가 어느 ENV 인지 모른다. 폴더 이름은
   * 흔해서 대분류 여럿 밑에 같은 이름이 있고, 1열을 접으면 트리에서
   * 짚어 볼 수도 없다. 요구사항 화면과 같은 규칙이다.
   *
   * 폴더는 `parent_id` 를 거슬러 올라가고, 요구사항은 제 `cat1~cat4` 에
   * 조상 사슬을 이미 들고 있다 — 그것을 그대로 쓴다.
   */
  const wherePath = useMemo(() => {
    const all = catQ.data?.categories ?? []
    const byId = new Map(all.map((c) => [c.id, c]))
    if (selReq === '__orphan__') return [{ id: '', name: '요구사항 없음' }]
    if (selReq) {
      const r = reqByKey.get(selReq)
      if (!r) return []
      const folders = [r.cat1, r.cat2, r.cat3, r.cat4]
        .filter(Boolean)
        .map((id) => ({ id: id as string, name: byId.get(id as string)?.name ?? '' }))
        .filter((f) => f.name)
      return [...folders, { id: '', name: r.title || reqLabel(r) }]
    }
    if (selFolder) {
      const out: Array<{ id: string; name: string }> = []
      let at: string | null = selFolder
      // 자료가 어긋나 고리가 생기면 영원히 돈다 — 본 것은 다시 안 본다
      const seen = new Set<string>()
      while (at && !seen.has(at)) {
        seen.add(at)
        const c = byId.get(at)
        if (!c) {
          out.unshift({ id: at, name: '(없는 폴더)' })
          break
        }
        out.unshift({ id: c.id, name: c.name })
        at = c.parent_id ?? null
      }
      return out
    }
    return []
  }, [selReq, selFolder, reqByKey, catQ.data])

  /**
   * 빵부스러기의 폴더를 눌렀을 때.
   *
   * 트리에서 그 폴더를 누른 것과 **같은 일**이 나야 한다. 안 그러면
   * 머리줄만 바뀌고 보던 시험이 그대로 남아 어디에 있는지가 어긋난다.
   * Detail 에서 눌렀으면 List 로 나온다 — 폴더는 여럿을 보는 자리다.
   */
  const goFolder = (id: string) => {
    if (dirty && !window.confirm('저장하지 않은 변경이 있습니다. 옮길까요?')) return
    setSelFolder(id)
    setSelReq(null)
    setListPick(new Set())
    // view 는 파생이다 — 편집기를 닫으면 곧 List 다
    setOpenId('')
  }

  // whereName(내려받기 파일 이름)은 Export 와 함께 뺐다.

  /**
   * 목록을 CSV 로.
   *
   * List 의 `Export` 안에 박혀 있었다. 그래서 Detail 로 트리를 훑다가
   * 내보내려면 List 로 건너가야 했다 — 요구사항 화면은 `⋯` 에 있는데
   * 여기만 그랬다. 둘이 같은 것을 쓰도록 밖으로 뽑는다.
   */
  // Export(CSV) 는 도구줄에서 뺐다(피드백 — 요구사항 화면과 같은 규칙).
  // 필요해지면 exportCsv 를 git 이력(68596e4 이전)에서 되살린다.

  /**
   * 열어 둔 시험이 **어느 폴더의 어느 요구사항** 것인가.
   *
   * 이것이 없으면 Detail 에서 「이 시험이 어디 것이지」 를 알 길이 없다 —
   * 트리를 눈으로 되짚거나 Info 탭의 날 PK(req-1781…)를 봐야 했다.
   */
  const detailPath = useMemo(() => {
    if (!openId) return { folders: [] as Array<{ id: string; name: string }>, req: '', reqPk: '' }
    const t = tcs.find((x) => x.tcid === openId)
    const r = t ? reqByKey.get(t.req_id || '') : undefined
    if (!r) return { folders: [] as Array<{ id: string; name: string }>, req: '', reqPk: '' }
    const byId = new Map((catQ.data?.categories ?? []).map((c) => [c.id, c]))
    const folders = [r.cat1, r.cat2, r.cat3, r.cat4]
      .filter(Boolean)
      .map((id) => ({ id: id as string, name: byId.get(id as string)?.name ?? '' }))
      .filter((f) => f.name)
    return { folders, req: r.title || reqLabel(r), reqPk: reqPk(r) }
  }, [openId, tcs, reqByKey, catQ.data])

  /**
   * 같은 시험을 누가 같이 보고 있나.
   *
   * 「여러 사람이 동시에 붙는다」 가 리눅스로 옮긴 이유였는데 화면에는
   * 그 흔적이 없었다. 같은 것을 둘이 열어 놓고 각자 고치면 나중에 저장한
   * 사람이 앞사람 것을 조용히 덮는다.
   */
  const meName = me?.name || me?.username || ''
  /**
   * 남이 저장한 이력 — 새것이 앞이다.
   *
   * 전에는 저장될 때마다 띠가 떴다 사라졌다. 연달아 저장되면 앞의 것이
   * 밀려서 누가 언제 했는지가 안 남고, 잠깐 자리를 비우면 통째로 놓쳤다.
   * 종에 쌓아 두고 숫자만 보인다.
   *
   * `kept` 는 「내가 고친 게 있어 아직 안 읽어왔다」 — 이것만은 종에
   * 묻으면 안 된다. 내가 눌러야 하는 일이라 띠로 남는다.
   */
  const [saves, setSaves] = useState<SaveEvent[]>([])
  const [seen, setSeen] = useState(0)
  const [remote, setRemote] = useState<{ user: string; kept: boolean } | null>(null)
  /**
   * 남이 저장하면 그 자리에서 반영한다.
   *
   * 「접속자만 보여 준다」 로는 모자랐다. 옆 사람이 저장해도 내 화면은
   * 읽던 그대로라, 이미 낡은 것을 보면서 계속 고치게 된다.
   *
   *  · 내가 고친 게 없으면 — **그냥 새로 읽는다.** 물어볼 이유가 없다
   *  · 고친 게 있으면 — 덮지 않고 **띠로 알리기만** 한다. 남의 저장이
   *    내 손의 것을 지우면 안 된다. 불러올지는 내가 고른다
   */
  /** 이 화면(시험항목 묶음)에 들어와 있는 사람들 — 상단 오른쪽 표시 몫 */
  const crowd = usePageCrowd('tc')
  const presence = usePresence(openId ? `tc:${openId}` : 'tc', meName, (m) => {
    if (m.type !== 'tc_updated' || !openId || m.tcid !== openId) return
    // 소식은 서버가 보내는 것이라 무슨 값이 올지 화면이 정할 수 없다
    const by = typeof m.user === 'string' ? m.user : ''
    if (by && by === meName) return // 내가 방금 저장한 것
    const who = by || '다른 사람'
    // 20건까지만. 그 아래는 아무도 안 본다
    setSaves((c) => [{ user: who, at: Date.now(), kept: dirty }, ...c].slice(0, 20))
    if (dirty) {
      setRemote({ user: who, kept: true })
      return
    }
    void qc.invalidateQueries({ queryKey: ['tc', openId] })
  })
  // 다른 시험으로 옮기면 지난 것은 지운다 — 이 시험의 이력이지 내 이력이 아니다
  useEffect(() => {
    setRemote(null)
    setSaves([])
    setSeen(0)
  }, [openId])
  const pickedTc = tcSel.picked
  const [bulkEdit, setBulkEdit] = useState(false)

  /**
   * 고른 시험 지우기.
   *
   * 하나씩 순서대로 지운다. 한꺼번에 던지면 어디까지 지워졌는지 알 수 없어
   * 실패했을 때 무엇을 다시 해야 하는지 말해줄 수 없다.
   */
  useEffect(() => {
    localStorage.setItem(TAB_KEY, tab)
  }, [tab])

  useEffect(() => {
    localStorage.setItem(OPEN_KEY, openId)
  }, [openId])

  /**
   * 기억해 둔 TC 가 그새 지워졌을 수 있다.
   *
   * 그냥 두면 3열이 계속 '불러오는 중' 이거나 빈 채로 남아서 화면이 고장난
   * 것처럼 보인다. 목록이 오면 확인하고 지운다.
   */
  useEffect(() => {
    if (!openId || tcQ.isLoading || tcs.length === 0) return
    if (!tcs.some((x) => x.tcid === openId)) setOpenId('')
  }, [openId, tcs, tcQ.isLoading])

  const devices = useMemo(() => devQ.data?.devices ?? [], [devQ.data])

  const devById = useMemo(() => {
    const m = new Map<string, Device>()
    for (const dv of devices) if (dv.id) m.set(dv.id, dv)
    return m
  }, [devices])

  // 고른 TC 의 원본을 따로 읽는다 — 목록 응답에는 스텝이 빠져 있다.
  const fullQ = useQuery({
    queryKey: ['tc', openId],
    enabled: !!openId,
    /*
     * 창을 다시 눌렀다고 다시 읽지 않는다.
     *
     * 기본값이 「창에 포커스가 오면 다시 읽기」 인데, 그 값이 오면 아래
     * effect 가 화면을 통째로 갈아 끼웠다. 시험을 짜다가 다른 창을 잠깐
     * 보고 오면 손댄 것이 사라졌다 — 그것도 조용히.
     */
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const r = await apiFetch(`/api/tc/${encodeURIComponent(openId)}`)
      if (!r.ok) throw new Error('TC 를 불러오지 못했습니다')
      return (await r.json()) as TcData
    },
  })

  /** 어느 TC 를 화면에 올려 두었나. 저장 뒤 다시 읽어온 것과 구분한다 */
  const loadedId = useRef('')

  /**
   * 안 저장한 것이 있나 — effect 안에서 「지금」 값을 봐야 한다.
   *
   * `dirty` 를 의존성에 넣으면 저장 직후 dirty 가 false 로 바뀌는 순간
   * effect 가 **아직 갱신 안 된 옛 자료**로 다시 돌아 방금 저장한 것을
   * 화면에서 되돌린다. ref 로 읽는다.
   */
  const dirtyRef = useRef(false)
  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])

  useEffect(() => {
    if (!fullQ.data) return
    /*
     * 읽어온 것이 내 손의 것을 덮지 않는다.
     *
     * Traffic 탭에서 계측기를 고르고 저장을 안 한 채 다른 창을 보고 오면,
     * 다시 읽어온 값이 그것을 지우고 「저장됨」 으로 바꿔 놓았다. 고친 줄
     * 알고 사이클을 돌리면 그제서야 「계측기를 고르지 않았습니다」 가 났다.
     *
     * 같은 시험을 보고 있고 안 저장한 것이 있으면 그대로 둔다. 남이
     * 저장한 경우는 위 presence 가 띠로 알린다 — 불러올지는 사람이 고른다.
     */
    if (loadedId.current === openId && dirtyRef.current) return
    setD(fullQ.data)
    setDirty(false)
    // **다른 TC 로 옮겼을 때만** 고른 줄을 되돌린다.
    //
    // 저장하면 서버에서 다시 읽어오는데, 그때도 되돌리고 있었다. 그래서
    // 저장 버튼을 누르는 순간 3열이 '스텝을 고르세요' 로 비었다 — 한 줄
    // 고치고 저장할 때마다 그 줄을 다시 찾아 눌러야 했다.
    if (loadedId.current !== openId) {
      loadedId.current = openId
      setStepIdx(-1)
      // 고른 줄은 자리 번호라 다른 TC 에서는 엉뚱한 줄을 가리킨다
      setPicked(new Set())
    }
  }, [fullQ.data, openId])

  const steps = (d.checks ?? []) as TcStep[]

  /**
   * 어느 회차를 보고 있나. 0 이면 「전체」 — 합쳐진 결과.
   *
   * 반복 시험에서 궁금한 것은 「7회차에 무슨 일이 있었나」 다. 그런데
   * 스텝마다 회차를 따로 누르면 7회차를 보려고 스텝 수만큼 눌러야 한다.
   * 회차를 하나 고르면 **목록 전체가 그 회차로** 바뀌어야 한다.
   *
   * 세로로 1회·2회…10회를 늘어놓지 않는 이유는 100회를 돌리면 못 쓰기
   * 때문이다. 고르는 방식은 회차가 늘어도 견딘다.
   */
  const [viewRound, setViewRound] = useState(0)
  /** 깨진 회차만 보기 — 1000회를 돌리면 늘어놓은 것만으로는 못 찾는다 */
  const [badOnly, setBadOnly] = useState(false)
  /** 이 시험이 몇 회차까지 돌았나 */
  const roundMax = steps.reduce((a, x) => Math.max(a, x.rounds?.length ?? 0), 0)
  /** 한 스텝이라도 깨진 회차 — 100번 돌려 3번 깨졌으면 궁금한 것은 그 3번이다 */
  const badRounds = Array.from({ length: roundMax }, (_, n) => n + 1).filter((n) =>
    steps.some(
      (x) => String(x.rounds?.find((r) => r.n === n)?.status ?? '').toUpperCase() === 'FAIL',
    ),
  )
  useEffect(() => setViewRound(0), [openId])

  /**
   * 고른 회차의 눈으로 본 스텝들.
   *
   * 반복 밖의 스텝은 회차가 없다 — 그대로 둔다. 한 번만 돌았으니 그것이
   * 그 회차의 결과다.
   */
  const shownSteps =
    viewRound > 0 && roundMax > 0
      ? steps.map((x) => {
          const rd = x.rounds?.find((r) => r.n === viewRound)
          if (!rd) return x
          return {
            ...x,
            status: rd.status ?? '',
            repeatResult: rd.status === 'PASS' ? 'Pass' : rd.status === 'FAIL' ? 'Fail' : '',
            reason: rd.reason ?? '',
            output: rd.output ?? '',
            took_ms: rd.took_ms,
          } as TcStep
        })
      : steps
  /** 탭에 숫자를 달아 두면 있는지 없는지 눌러보지 않아도 안다 */
  const manualCount = steps.filter((s) => s.kind === 'manual').length
  const wireCount = (d.wiring ?? []).length
  const autoCount = steps.length - manualCount
  /**
   * 이 TC 가 쓰는 세션. 자료에는 `sessions: ["dev-…"]` 처럼 장비 id 배열이
   * 들어 있고, 스텝의 session 은 그 배열의 자리 번호다.
   * 화면에는 장비 이름을 보여야 하므로 여기서 이름으로 바꿔 넘긴다.
   */
  const sessionIds = Array.isArray(d.sessions) ? (d.sessions as string[]) : []
  const sessionNames = sessionIds.map((id, i) => {
    const dev = devById.get(id)
    if (!dev) return `세션 ${i + 1}`
    // 이름이 있으면 IP 도 함께. 이름만 보이면 같은 이름의 장비가 랩마다
    // 있을 때 어느 것인지 모른다.
    const nm = deviceLabel(dev)
    const base = dev.ip && nm !== dev.ip ? `${nm} (${dev.ip})` : nm
    // 계측기는 표를 낸다. 이름을 안 적어 둔 장비가 많아 IP 만 뜨는데,
    // 그러면 스텝의 세션 칸에서 계측기를 스위치인 줄 알고 고른다.
    return isMeter(dev) ? `${base} · 계측기` : base
  })
  const sessionName = (i: number) => (i >= 0 ? (sessionNames[i] ?? `세션 ${i + 1}`) : '')

  /**
   * 스텝별로 이 TC 안에서 쓰이는 변수 이름.
   *
   * 같은 이름을 두 스텝이 뽑으면 뒤엣것이 앞엣것을 덮는다. 그런데 화면
   * 어디에도 안 나와서, 뒤 스텝의 `${var1}` 이 왜 엉뚱한 값인지 알 수가
   * 없었다. 지금 고른 스텝을 뺀 나머지가 쓰는 이름을 넘겨 준다.
   */
  const varsByStep = useMemo(
    () =>
      steps.map((s) =>
        [
          ...(s.queries ?? []).map((x) => x.var),
          ...(s.extracts ?? []).map((x) => x.var),
        ].filter((x): x is string => !!x),
      ),
    [steps],
  )

  const takenVars = useMemo(
    () => varsByStep.filter((_, i) => i !== stepIdx).flat(),
    [varsByStep, stepIdx],
  )

  /**
   * 앞 스텝이 뽑아 둔 변수와 지금 값.
   *
   * 전역 파라미터만 목록에 있어서 `${var1}` 은 손으로 쳐야 했다. 무엇을
   * 뽑아 뒀는지 화면 어디에도 안 보이니 값 비교를 쓸 수가 없었다.
   * 마지막 실행의 응답에 식을 대 보고 값까지 함께 보인다.
   */
  const stepVars = useMemo(() => {
    const items: PickItem[] = []
    const values: Record<string, string> = {}
    steps.forEach((s, i) => {
      // 뒤 스텝의 변수는 아직 안 뽑혔다 — 고른 줄보다 앞엣것만
      if (stepIdx >= 0 && i >= stepIdx) return
      const out = stepResult(s)
      const rules = [
        ...(s.queries ?? []).map((x) => ({ name: x.var, rule: x.q })),
        ...(s.extracts ?? []).map((x) => ({ name: x.var, rule: x.rule })),
      ]
      for (const r of rules) {
        if (!r.name) continue
        const got = r.rule ? extractOne(r.rule, out) : null
        if (got != null) values[r.name] = got
        items.push({
          value: `\${${r.name}}`,
          label: r.name,
          note: [got ?? '아직 안 뽑힘', `스텝 ${i + 1}`].join(' · '),
        })
      }
    })
    return { items, values }
  }, [steps, stepIdx])


  /**
   * 이 TC 가 붙는 장비의 모델.
   *
   * 전역 파라미터가 모델별로 갈려 있어서(E6100 의 포트 이름과 E5724RL 의
   * 것이 다르다) 어느 모델 것을 쓸지 정해야 한다. 첫 세션의 장비를 쓴다 —
   * 세션이 여럿이어도 시험 대상(DUT)은 보통 첫 자리다.
   */
  /**
   * 이 TC 가 쓰는 파라미터 파일.
   *
   * 고른 것이 없으면 안 붙는다 — 전에는 장비 모델과 이름이 같은 파일이
   * 자동으로 붙었는데, iTest 에 없는 규칙인 데다 아무도 못 알아챘다.
   * 옛 값(param_file, 하나만 고르던 때)은 읽어서 이어 준다.
   */
  const paramFiles = useMemo(() => {
    const v = d.param_files
    if (Array.isArray(v)) return v.filter((x) => typeof x === 'string' && x)
    return d.param_file ? [d.param_file] : []
  }, [d.param_files, d.param_file])

  const gp = useGlobalParams(paramFiles)

  /** 스텝 변수가 전역 파라미터를 덮는다 — 돌면서 알아낸 값이 최신이다 */
  const stepParams = useMemo(
    () => ({
      values: { ...gp.values, ...stepVars.values },
      items: [...stepVars.items, ...gp.items],
      loading: gp.loading,
      empty: gp.empty,
    }),
    [gp.values, gp.items, gp.loading, gp.empty, stepVars],
  )

  const patch = (p: Partial<TcData>) => {
    setD((c) => ({ ...c, ...p }))
    setDirty(true)
  }

  /**
   * 스텝 한 줄 고치기.
   *
   * 최신 상태에서 갈아끼운다. 화면에서 손으로 고칠 때는 차이가 없지만,
   * 실행 중에는 스텝 결과가 잇달아 들어와서 닫힌 값(steps)을 쓰면 앞의
   * 결과가 뒤 결과에 덮여 사라진다.
   */
  /**
   * 스텝 하나를 고친다.
   *
   * `fromRun` 이면 저장을 재촉하지 않는다. TC 화면의 실행은 **스텝이 잘
   * 만들어졌는지 보는 자리**지 결과를 남기는 자리가 아니다 — 결과를
   * 남기는 것은 사이클이고 거기서는 실행기가 알아서 저장한다.
   *
   * 전에는 실행만 해도 「저장 안 됨」 이 되어서, 아무것도 안 고쳤는데
   * 저장을 누르거나 나갈 때 물음창을 받아야 했다. 새로고침하면 사라지는
   * 것이 맞다.
   */
  const patchStep = (i: number, p: Partial<TcStep>, fromRun = false) => {
    setD((c) => {
      const arr = (c.checks ?? []) as TcStep[]
      return { ...c, checks: arr.map((s, j) => (j === i ? { ...s, ...p } : s)) }
    })
    if (!fromRun) setDirty(true)
  }

  /**
   * 스텝을 넣는다 — **고른 줄 바로 아래**.
   *
   * 전에는 늘 맨 끝에 붙였다. 30줄짜리 절차 가운데에 한 줄을 끼우려면
   * 끝에 만들고 「▲」 를 스물몇 번 눌러 올려야 했다.
   *
   * 블록(반복·조건)을 고른 채로 넣으면 그 **몸통 뒤**로 간다. 여는 줄
   * 바로 뒤에 같은 깊이로 넣으면 거기서 몸통이 끊겨, 반복 안에 있던
   * 줄들이 조용히 밖으로 나온다.
   */
  const addStep = (kind: StepKind) => {
    const cur = stepIdx >= 0 ? steps[stepIdx] : undefined
    // 아래에 들여쓴 줄을 거느리고 있으면 그 뒤로. 종류로 보지 않는다 —
    // 주석 아래에 스텝을 들여쓴 것도 똑같이 몸통이다.
    const at = cur ? blockEnd(steps, stepIdx) : steps.length
    // 깊이는 고른 줄을 따라간다 — 반복 안에서 넣으면 그 안에 남는다
    const born = { ...blankStep(kind), ...(cur?.indent ? { indent: cur.indent } : {}) }
    const next = [...steps.slice(0, at), born, ...steps.slice(at)]
    patch({ checks: next })
    setStepIdx(at)
    clearPicked()
  }

  /** 줄이 늘거나 자리가 바뀌면 고른 번호가 다른 줄을 가리킨다 */
  const clearPicked = () => {
    setPicked(new Set())
    lastPick.current = -1
  }

  const moveStep = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= steps.length) return
    const next = [...steps]
    const a = next[i]!
    next[i] = next[j]!
    next[j] = a
    patch({ checks: next })
    setStepIdx(j)
    clearPicked()
  }

  const setSessions = (next: string[], p?: Partial<TcData>) =>
    patch({ sessions: next, ...(p ?? {}) })

  /**
   * 세션 자리를 뺀다.
   *
   * 스텝은 장비가 아니라 **자리 번호**를 들고 있어서, 자리를 빼면 뒤쪽
   * 번호가 하나씩 당겨진다. 스텝을 그대로 두면 다음에 저장하는 순간
   * 조용히 옆 장비로 명령이 나간다 — 옛 화면이 실제로 그랬다.
   */
  /**
   * 묻지 않고 바로 뺀다.
   *
   * 세션을 넣고 빼는 것은 자주 있는 일이라 매번 물으면 그 창을 안 읽고
   * 누르게 된다. 대신 무슨 일이 있었는지는 알린다 — 스텝의 세션이 비워진
   * 것을 모르고 넘어가면 실행할 때 가서야 안다. 잘못 뺐으면 저장 전에
   * 다시 넣으면 되고, 저장 전까지는 서버에 아무 일도 일어나지 않는다.
   */
  const removeSession = (i: number) => {
    const gone = sessionNames[i] ?? `S${i + 1}`
    const used = steps.filter((s) => sessionIndex(s.session) === i).length
    setMsg({
      kind: used ? 'err' : '',
      text: used
        ? `S${i + 1} (${gone}) 뺐습니다 — 스텝 ${used}개의 세션이 비었습니다`
        : `S${i + 1} (${gone}) 뺐습니다`,
    })
    setSessions(
      sessionIds.filter((_, j) => j !== i),
      {
        checks: steps.map((s) => {
          const k = sessionIndex(s.session)
          if (k < 0) return s
          if (k === i) return { ...s, session: '' }
          return k > i ? { ...s, session: k - 1 } : s
        }),
      },
    )
  }

  /**
   * 스텝 복제.
   *
   * 바로 아래에 넣는다. 비슷한 명령을 줄줄이 만드는 일이 잦은데
   * (show interface 1 · 2 · 3 …) 지금은 매번 새로 만들어 다시 쳐야 했다.
   *
   * **결과는 안 가져온다.** output·판정·실행 시각을 복사하면 돌려보지도
   * 않은 줄이 PASS 로 앉아 있게 된다.
   */
  const duplicateStep = (i: number) => {
    const src = steps[i]
    if (!src) return
    const {
      output: _o,
      response: _r,
      status: _s,
      repeatResult: _rr,
      reason: _rs,
      executed_at: _at,
      ...rest
    } = src
    const next = [...steps]
    next.splice(i + 1, 0, { ...rest })
    patch({ checks: next })
    setStepIdx(i + 1)
    setMsg({ kind: 'ok', text: `${i + 1}번 줄을 복제했습니다` })
  }

  /**
   * 줄 고르기. shift 를 누른 채면 앞서 고른 줄부터 여기까지.
   *
   * 30줄짜리 시험에서 가운데 열 줄을 지우려면 하나씩 누르는 것으로는
   * 못 쓴다.
   */
  const pickStep = (i: number, range: boolean) => {
    setPicked((cur) => {
      const n = new Set(cur)
      if (range && lastPick.current >= 0) {
        const [a, b] = lastPick.current < i ? [lastPick.current, i] : [i, lastPick.current]
        for (let k = a; k <= b; k++) n.add(k)
      } else if (n.has(i)) n.delete(i)
      else n.add(i)
      return n
    })
    lastPick.current = i
  }

  /**
   * 묻지 않고 지운다.
   *
   * 저장 전까지 서버에는 아무 일도 일어나지 않는다 — 잘못 지웠으면 저장을
   * 안 하고 다시 열면 된다. 매번 창을 띄우면 그 창을 안 읽고 누르게 된다.
   * 대신 몇 개를 지웠는지는 알린다.
   */
  const removeSteps = (idx: number[]) => {
    if (idx.length === 0) return
    const gone = new Set(idx)
    patch({ checks: steps.filter((_, j) => !gone.has(j)) })
    setStepIdx(-1)
    setPicked(new Set())
    lastPick.current = -1
    setMsg({
      kind: '',
      text: `스텝 ${idx.length}개를 지웠습니다 — 저장 전까지는 되돌릴 수 있습니다`,
    })
  }

  const removeStep = (i: number) => removeSteps([i])

  /** 고른 줄을 한꺼번에 건너뛰기 / 되돌리기 */
  const skipPicked = (on: boolean) => {
    patch({ checks: steps.map((s, j) => (picked.has(j) ? { ...s, skip: on } : s)) })
    setMsg({ kind: '', text: `스텝 ${picked.size}개를 ${on ? '건너뜁니다' : '다시 돌립니다'}` })
  }

  const saveM = useMutation({
    mutationFn: async () => {
      // checks 를 항상 함께 보낸다. 빠지면 서버가 옛 값을 되살려
      // 방금 지운 스텝이 다시 나타난다(main.py 의 보존 장치).
      // 읽을 때 받은 `_rev` 를 같이 보낸다. 그 사이에 남이 저장했으면
      // 서버가 409 로 막는다 — 조용히 덮는 것보다 낫다.
      // 누가 저장했는지 실어 보낸다. 서버가 이것을 그대로 다른 사람들에게
      // 뿌려서, 받는 쪽이 「내가 저장한 것」 을 걸러낸다.
      await tcApi.save(openId, { ...d, checks: d.checks ?? [], updated_by: meName })
    },
    onSuccess: () => {
      setDirty(false)
      setRemote(null)
      setMsg({ kind: 'ok', text: '저장했습니다' })
      void qc.invalidateQueries({ queryKey: ['tc', openId] })
      void qc.invalidateQueries({ queryKey: ['tc', 'list', 'meta'] })
    },
    onError: (e) => {
      const m = e instanceof Error ? e.message : String(e)
      // 남이 먼저 저장한 경우 — 무엇을 해야 하는지까지 말한다
      if (m.includes('다른 사람이 먼저')) {
        setMsg({ kind: 'err', text: m })
        if (window.confirm(`${m}\n\n지금 저장된 것을 불러올까요? 내가 고친 것은 사라집니다.`)) {
          void qc.invalidateQueries({ queryKey: ['tc', openId] })
          setDirty(false)
          setRemote(null)
        }
        return
      }
      setMsg({ kind: 'err', text: m })
    },
  })

  /**
   * 다른 이름으로 저장 · 파일에서 가져오기.
   *
   * 둘 다 '내용은 이미 있고 새 ID 만 정하면 되는' 일이라 한 창을 쓴다.
   */
  const [saveAs, setSaveAs] = useState<{
    title: string
    id: string
    name: string
    note?: string
    data: TcData
  } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const takenIds = useMemo(() => new Set(tcs.map((t) => t.tcid)), [tcs])

  const [cloning, setCloning] = useState(false)
  /** Clone 은 모델을 골라야 저장된다(합의) — 고른 모델을 복제본 전체에 적용 */
  const [cloneAsk, setCloneAsk] = useState(false)
  /**
   * 고른 시험을 그대로 하나 더 만든다.
   *
   * 목록 응답에는 스텝이 없다. 그것만 베끼면 이름만 같은 빈 껍데기가
   * 나오므로 한 건씩 원본을 읽어 통째로 옮긴다 — 느리지만 몇 건 고르는
   * 일이고, 빈 껍데기를 받아 손으로 다시 짜는 것보다 낫다.
   *
   * 새 번호는 같은 묶음의 다음 번호다. TC ID 앞부분이 곧 그 요구사항이라
   * (U-REQ-SYS-HW-TC-004) 앞은 지키고 번호만 올린다.
   */
  const clonePicked = async (mg?: string, md?: string) => {
    const ids = [...listPick]
    if (!ids.length || cloning) return
    setCloning(true)
    const taken = new Set(takenIds)
    const made: string[] = []
    try {
      for (const id of ids) {
        const r = await apiFetch(`/api/tc/${encodeURIComponent(id)}`)
        if (!r.ok) throw new Error(`${id} 를 읽지 못했습니다`)
        const src = (await r.json()) as TcData & { _rev?: string }
        delete src._rev
        const nid = nextTcId(id, taken)
        taken.add(nid)
        await tcApi.save(nid, {
          ...src,
          tcid: nid,
          name: `${String(src.name ?? id).replace(/ \([^)]*\)$/, '')}${md ? ` (${md})` : ' 복사'}`.trim(),
          ...(mg ? { model_group: mg } : {}),
          ...(md ? { model: md } : {}),
          checks: src.checks ?? [],
          updated_by: meName,
        })
        made.push(nid)
      }
      setListPick(new Set())
      void qc.invalidateQueries({ queryKey: ['tc', 'list', 'meta'] })
      setMsg({ kind: 'ok', text: `${made.length}건을 복사했습니다 — ${made.join(', ')}` })
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setCloning(false)
    }
  }

  const saveAsM = useMutation({
    mutationFn: async ({ id, name, mg, md }: { id: string; name: string; mg?: string; md?: string }) => {
      const src = saveAs?.data ?? {}
      await tcApi.save(id, {
        ...src,
        tcid: id,
        name,
        // 복제는 모델을 고정한다(합의) — 고른 모델로 갈아 끼운다
        ...(mg ? { model_group: mg } : {}),
        ...(md ? { model: md } : {}),
        checks: src.checks ?? [],
      })
      return id
    },
    onSuccess: (id) => {
      setSaveAs(null)
      setDirty(false)
      setOpenId(id)
      setMsg({ kind: 'ok', text: `${id} 를 만들었습니다` })
      void qc.invalidateQueries({ queryKey: ['tc', 'list', 'meta'] })
    },
    onError: (e) => setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) }),
  })

  /** 지금 TC 를 파일로. 다른 랩의 UTOP 에서 그대로 연다. */
  const exportTc = () => {
    if (!openId) return
    downloadJson(tcFileName(d), buildTcFile({ ...d, tcid: openId }, devById))
    setMsg({ kind: 'ok', text: '파일로 내보냈습니다' })
  }

  /**
   * 파일에서 가져오기.
   *
   * 서버가 다르면 장비도 다르다. 세션이 가리키던 장비를 IP·이름·모델로
   * 찾아 이 서버 것으로 바꿔 준다. 못 찾으면 그대로 두어 세션 칩이
   * 「없는 장비」로 뜨게 한다 — 아무 장비나 붙이면 엉뚱한 곳에 명령이 나간다.
   */
  const importFile = async (file: File) => {
    try {
      const f = parseTcFile(await file.text())
      const tc = { ...f.tc }
      const sess = Array.isArray(tc.sessions) ? (tc.sessions as string[]) : []
      const { sessions: mapped, matched } = remapSessions(sess, f.session_devices, devices)
      tc.sessions = mapped

      const from = f.origin ? `${f.origin} 에서 만든 시험` : '가져온 시험'
      const dev =
        sess.length === 0
          ? '세션 없음'
          : matched === sess.length
            ? `장비 ${matched}자리 모두 이 서버 것으로 맞췄습니다`
            : `장비 ${sess.length}자리 중 ${matched}개만 찾았습니다 — 나머지는 세션에서 고르세요`
      setSaveAs({
        title: '파일에서 가져오기',
        id: uniqueTcId(String(tc.tcid ?? 'TC'), takenIds),
        name: String(tc.name ?? ''),
        note: `${from} · ${dev}`,
        data: tc,
      })
    } catch (e) {
      setMsg({
        kind: 'err',
        text: e instanceof TcFileError ? e.message : `읽지 못했습니다 — ${String(e)}`,
      })
    }
  }

  const pickTc = (id: string) => {
    if (dirty && !window.confirm('저장하지 않은 변경이 있습니다. 옮길까요?')) return
    setOpenId(id)
    setMsg({ kind: '', text: '' })
    // 주소창에 남긴다 — 이 주소를 남에게 보내면 같은 시험이 열린다
    reflectUrl('tc', id)
  }

  // 링크·뒤로가기로 이 화면에 온 채 다른 시험을 가리키면 갈아탄다
  useEffect(
    () =>
      onGoto((kind, id) => {
        if (kind === 'tc' && id !== openId) {
          setOpenId(id)
          setGpOpen(false)
        }
      }),
    [openId],
  )

  const runStat = useMemo(() => {
    let pass = 0
    let fail = 0
    for (const s of steps) {
      const v = stepStatus(s)
      if (v === 'PASS') pass++
      else if (v === 'FAIL') fail++
    }
    return { pass, fail, done: pass + fail }
  }, [steps])

  /**
   * 실행.
   *
   * 스텝을 쓰면서 그 자리에서 돌려보는 것이 이 화면의 요점이라, TC Cycle 의
   * 배치 실행(backend/engine.py)과는 다른 길로 간다 — 여기서는 스텝 하나가
   * 끝날 때마다 결과가 그 줄에 바로 박힌다.
   */
  const runAbort = useRef<AbortController | null>(null)

  /**
   * 고른 줄이 블록(반복)인데 몸통이 비었나 · 몇 줄을 넣을 수 있나.
   *
   * 33건 중 2건이 이 꼴이었다 — 들여쓰기를 안 해서 빈 것을 10번 돌고
   * 아래는 한 번만 돌았다. 손으로 한 줄씩 「→」 를 누르게 하지 않는다.
   */
  const blockInfo = (() => {
    const s = stepIdx >= 0 ? steps[stepIdx] : undefined
    if (!s || s.kind !== 'loop') return undefined
    const base = Number(s.indent ?? 0)
    const end = blockEnd(steps, stepIdx)
    // 같은 깊이로 뒤에 남은 줄 — 이 중 몇 개까지 안에 넣을 수 있다
    let after = 0
    for (let j = end; j < steps.length; j++) {
      if (Number(steps[j]?.indent ?? 0) < base) break
      after++
    }
    return {
      empty: end <= stepIdx + 1,
      after,
      wrap: (n: number) => {
        const next = steps.map((x, j) =>
          j > stepIdx && j <= stepIdx + n ? { ...x, indent: Number(x.indent ?? 0) + 1 } : x,
        )
        patch({ checks: next })
        setMsg({ kind: 'ok', text: `아래 ${n}줄을 반복 안에 넣었습니다` })
      },
    }
  })()

  const doRun = async (from: number, only: boolean, pick?: number[]) => {
    if (running) return
    /*
     * 장비가 정말 필요한 줄이 있을 때만 막는다.
     *
     * 전에는 세션이 하나도 없으면 무조건 막았다. 그런데 Diff·If·Wait·
     * Message 는 장비로 아무것도 안 나간다 — 두 값을 견주거나 기다릴
     * 뿐이다. 그래서 Diff 만 있는 시험은 아예 못 돌렸다.
     */
    const about = pick ? pick.map((n) => steps[n]) : only ? [steps[from]] : steps.slice(from)
    if (sessionIds.length === 0 && about.some((x) => x && needsDevice(x))) {
      setMsg({ kind: 'err', text: '장비가 필요한 스텝이 있습니다 — 「+ 세션」 으로 장비를 넣으세요' })
      return
    }
    const ac = new AbortController()
    runAbort.current = ac
    setRunning(true)
    setMsg({
      kind: '',
      text: pick ? `고른 ${pick.length}줄 실행 중…` : only ? '스텝 실행 중…' : '실행 중…',
    })
    const began = Date.now()
    try {
      // 타입을 못박아 둔다 — 인라인 리터럴이라 콜백 인자를 추론해 주지 않는다
      const ctx: RunCtx = {
          steps,
          sessions: sessionIds,
          devById,
          // 계측기 스텝이 볼 트래픽 설정 — Traffic 탭이 정한 것
          meterCfg: d.meterCfg,
          onStep: (i, p) => patchStep(i, p, true),
          // 돌고 있는 줄을 따라간다. 3열이 그 줄의 응답이 자라는 것을
          // 보여주므로, 안 따라가면 스트리밍이 보이지 않는다.
          onAt: (i) => {
            setRunAt(i)
            setStepIdx(i)
          },
          // 실행 판을 없앴다. 무슨 일이 있었나는 스텝 줄과 그 줄의
          // Result 에 남는다 — 로그를 따로 쌓아 둘 자리가 없다.
          onLog: () => {},
          params: gp.values,
          signal: ac.signal,
      }
      const r = pick ? await runPicked(ctx, pick) : await runSteps(ctx, from, only)
      /*
       * TC 상태는 여기서 안 건드린다.
       *
       * 전에는 끝까지 돌리면 TC 를 PASS/FAIL 로 도장 찍고 「저장해야
       * 남습니다」 를 붙였다. 그런데 이 화면의 실행은 **스텝이 잘
       * 만들어졌는지 보는 자리**다 — 돌려 보고, 응답을 뜯어 보고, 판정
       * 기준을 고친다. 그때마다 저장을 재촉받을 이유가 없다.
       *
       * 결과를 남기는 것은 사이클이고, 거기서는 실행기가 알아서 저장한다.
       */
      setMsg({
        kind: r.fail > 0 ? 'err' : 'ok',
        text: `${r.stopped ? '중지됨 · ' : ''}PASS ${r.pass} · FAIL ${r.fail}`,
      })
      // 실행 이력은 전체 실행만 남긴다. 한 줄씩 돌려보는 것까지 쌓으면
      // 이력이 편집 기록이 되어 '언제 통째로 돌렸나' 를 못 찾는다.
      if (!only && !pick && !r.stopped) {
        void apiFetch(`/api/tc/${encodeURIComponent(openId)}/run-history`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            at: new Date().toISOString(),
            pass: r.pass,
            fail: r.fail,
            sec: Math.round((Date.now() - began) / 1000),
            sessions: sessionNames,
          }),
        })
          .then(() => qc.invalidateQueries({ queryKey: ['tc', openId, 'run-history'] }))
          .catch((e) => console.warn('[TestCases.doRun] 이력 저장 실패:', e))
      }
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setRunning(false)
      setRunAt(-1)
      runAbort.current = null
    }
  }

  /*
   * 3열 머리 — 저장 · 탭 ····· ⋯.
   *
   * 3열 안에만 두었더니 Automation 이 아닌 탭에서는 3열 자체를 안 그려서
   * **탭이 통째로 사라졌다.** 어느 탭에 있든 같은 자리에 있어야 다음 탭으로
   * 옮겨 갈 수 있다.
   */
  /** ⋯ — 다른 이름으로 저장·파일 내보내기/가져오기.
      Detail 에서는 머리 오른끝, List 에서는 도구줄 오른끝(3번 자리)에 선다. */
  const moreMenu = (
    <div className="tc-more">
                    <button
                      className="btn tc-dots"
                      type="button"
                      aria-haspopup="menu"
                      aria-expanded={menuOpen}
                      onClick={() => setMenuOpen((v) => !v)}
                    >
                      ⋯
                    </button>
                    {menuOpen && (
                      <>
                        <div className="tc-menu-back" onClick={() => setMenuOpen(false)} />
                        <div className="tc-menu" role="menu">
                          {/* 랩마다 UTOP 이 따로 서 있어서 한쪽에서 만든 시험을 다른
                              쪽에서 그대로 돌리고 싶은 일이 잦다. DB 를 통째로 옮기면
                              장비 비밀번호까지 따라가므로, 시험 하나만 파일로 뗀다. */}
                          <button
                            type="button"
                            disabled={!openId}
                            onClick={() => {
                              setMenuOpen(false)
                              setSaveAs({
                                title: '다른 이름으로 저장',
                                // 같은 요구사항 묶음의 다음 번호. TC ID 앞부분이 곧
                                // 그 요구사항이라(U-REQ-SYS-HW-TC-004) 앞은 지키고
                                // 번호만 올린다.
                                id: nextTcId(openId, takenIds),
                                name: `${d.name ?? ''} 복사`.trim(),
                                data: d,
                              })
                            }}
                          >
                            다른 이름으로 저장
                          </button>
                          <button
                            type="button"
                            disabled={!openId}
                            onClick={() => {
                              setMenuOpen(false)
                              exportTc()
                            }}
                          >
                            파일로 내보내기
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMenuOpen(false)
                              fileRef.current?.click()
                            }}
                          >
                            파일에서 가져오기
                          </button>
                          <button
                            type="button"
                            disabled={!openId}
                            title="저장할 때마다 남는 지난 판들 — 골라서 되돌립니다"
                            onClick={() => {
                              setMenuOpen(false)
                              setRevOpen(true)
                            }}
                          >
                            변경 이력…
                          </button>
                        </div>
                      </>
                    )}
                  </div>
  )

  // 세로 아이콘 레일은 걷어냈다(피드백) — 인라인 시절의 산물이었다.
  // 탭은 요구사항 레일과 같은 문법으로 detHead(상단 가로)에 선다.

  const detHead = (
                <div className="tc-dethead">
                  {/* ← 목록 + 가로 글자 탭 + 저장 — 요구사항 레일과 같은
                      문법. 알림(함께 보는 중·저장 종)과 ⋯ 는 오른쪽 끝. */}
                  <button
                    className="btn"
                    type="button"
                    title="시험항목 목록으로 돌아갑니다"
                    onClick={() => {
                      if (dirty && !window.confirm('저장하지 않은 변경이 있습니다. 목록으로 갈까요?'))
                        return
                      setOpenId('')
                      window.history.pushState({ utop: true }, '', window.location.pathname)
                    }}
                  >
                    ← 목록
                  </button>
                  <div className="seg" role="tablist">
                    {([
                      { k: 'info', label: 'Info', n: 0 },
                      { k: 'env', label: 'Object', n: 0 },
                      { k: 'topo', label: 'Topology', n: wireCount },
                      { k: 'traffic', label: 'Traffic', n: 0 },
                      { k: 'manual', label: 'Manual', n: manualCount },
                      { k: 'steps', label: 'Automation', n: autoCount },
                      { k: 'history', label: 'Execution', n: 0 },
                      { k: 'cycle', label: 'Cycle', n: 0 },
                    ] as const).map((x) => (
                      <button
                        key={x.k}
                        type="button"
                        role="tab"
                        aria-selected={tab === x.k}
                        className={`seg-btn${tab === x.k ? ' on' : ''}`}
                        onClick={() => setTab(x.k)}
                      >
                        {x.label}
                        {x.n > 0 && <i className="tc-htn">{x.n}</i>}
                      </button>
                    ))}
                  </div>
                  {/* 저장 — 고친 게 있으면 파랗게, 다 저장돼 있으면 쉰다 */}
                  <button
                    className={`btn${dirty ? ' primary' : ''}`}
                    type="button"
                    disabled={saveM.isPending || !dirty}
                    onClick={() => saveM.mutate()}
                  >
                    {saveM.isPending ? '저장 중…' : dirty ? '저장' : '저장됨'}
                  </button>

                  <span className="sp" />

                  {/* 이름·ID 는 위 빵부스러기에 이미 있다. 여기에도 적었더니
                      같은 글이 두 줄로 보였다 — 이 줄은 알림·탭 몫이다. */}
                  {/* 지금 이 시험을 누가 같이 보고 있나 — 제목 바로 옆.
                      혼자면 아무것도 안 뜬다. 둘부터 뜬다. */}
                  <PresenceBar users={presence.users} me={meName} />
                  {/* 누가 저장했나 — 쌓아 두고 숫자만. 「함께 보는 중」 옆이다 */}
                  <SaveBell
                    items={saves}
                    unseen={Math.max(0, saves.length - seen)}
                    onSeen={() => setSeen(saves.length)}
                  />
                  {/* 내가 고친 게 있어 못 읽어온 경우만 띠로 남는다. 덮지
                      않고 여기서 묻는다 — 누르는 것은 내가 고른다. */}
                  {remote?.kept && (
                    <span className="tc-remote">
                      {remote.user} 님이 저장했습니다
                      <button
                        className="btn small"
                        type="button"
                        onClick={() => {
                          if (
                            !window.confirm('지금 저장된 것을 불러올까요? 내가 고친 것은 사라집니다.')
                          )
                            return
                          void qc.invalidateQueries({ queryKey: ['tc', openId] })
                          setDirty(false)
                          setRemote(null)
                        }}
                      >
                        불러오기
                      </button>
                    </span>
                  )}
                  {/* 화면 전체의 알림. 전에는 「스텝을 골랐을 때 뜨는 띠」
                      안에만 있어서, 저장했다는 말도 오류도 스텝을 골라야만
                      보였다. 늘 보이는 자리로 올린다. */}
                  {msg.text && <span className={`tc-msg ${msg.kind}`}>{msg.text}</span>}
                  {view === 'detail' && moreMenu}
                </div>
  )

  const error = tcQ.error

  /** SETUP 에서 만든 INFO 필드(커스텀)도 열로 — ⚙ 에서 켜고 끈다(피드백) */
  /** ⚙ 후보 = SETUP 시험항목 INFO 필드 그대로(라벨·숨김·활성 반영) */
  const infoColDefs = useInfoCols('tc')
  const visCols = useMemo(
    () => infoColDefs.filter((c) => cols.includes(c.k)),
    [infoColDefs, cols],
  )
  /** 고정: ☐·Name·모델그룹·모델명 | INFO 열들 | REQ Map */
  const listGrid =
    `30px minmax(220px, 1fr) 96px 110px ${visCols.map((c) => c.w).join(' ')} 78px`.trim()
  /** 선택형 열 한 칸 — 열쇠(k)로 그린다 */
  const colCell = (k: string, t: TestCaseMeta) => {
    if (k.startsWith('f_')) k = k.slice(2)
    switch (k) {
      case 'id':
        return <div className="muted" key={k}>{t.tcid}</div>
      case 'model_group':
      case 'model':
        return <div className="muted" key={k}>{colVal(k, t)}</div>
      case 'type':
        return <div key={k}>{t.type ? <span className="tag">{t.type}</span> : '–'}</div>
      case 'severity':
        return <div key={k}>{t.severity || '–'}</div>
      case 'kind':
        // 값 셈은 colVal 한 곳만 — 두 군데로 갈라져 한쪽만 고치는 사고를 겪었다
        return <div key={k}>{colVal('kind', t)}</div>
      case 'map':
        return (
          <div className="tc-map" key={k}>
            <button
              type="button"
              className="linkish"
              title="이 시험에 요구사항을 붙입니다"
              onClick={() => setMapTc(t)}
            >
              Map
            </button>
            <span className={`tc-mapn${(reqsOfTc.get(t.tcid)?.size ?? 0) ? ' has' : ''}`}>
              {reqsOfTc.get(t.tcid)?.size ?? 0}
            </span>
          </div>
        )
      case 'created_by':
        return <div className="muted" key={k}>{(t.created_by as string) || '–'}</div>
      case 'updated_by':
        return <div className="muted" key={k}>{(t.updated_by as string) || '–'}</div>
      case 'updated':
        return <div className="muted" key={k}>{String(t._updated_at_pg ?? '').slice(0, 10) || '–'}</div>
      case 'status':
        return (
          <div className={`status ${statusClass(t.status)}`} key={k}>
            ● {t.status || '미실행'}
          </div>
        )
      case 'origin':
        return <div className="muted" key={k}>{colVal('origin', t)}</div>
      default: {
        // 커스텀 INFO 필드 열 — 값은 data->custom 에 산다
        if (k.startsWith('cf_')) {
          const v = String(
            ((t as unknown as { custom?: Record<string, unknown> }).custom?.[k.slice(3)] ?? '') ||
              '',
          )
          return (
            <div className="muted" key={k} title={v}>
              {v || '–'}
            </div>
          )
        }
        return null
      }
    }
  }

  /**
   * 3열 세부 — Info…Automation 탭 판.
   *
   * Detail 보기와 표의 인라인 펼침이 **같은 것**을 그린다. 따로 만들면
   * 인라인에서는 실행이 안 되는 반쪽이 된다 — 실행·저장·프레즌스까지
   * 같은 상태를 쓰는 한 덩어리다.
   */
  const detPanes = !openId ? (
          <section className="panel">
            <div className="empty">왼쪽에서 테스트케이스를 고르세요.</div>
          </section>
        ) : tab === 'info' ? (
          <section className="panel tc-tabcol">
            <TcInfo data={d} onChange={patch} />
          </section>
        ) : tab === 'env' ? (
          <section className="panel tc-tabcol">
            <TcEnv data={d} onChange={patch} tcid={openId} />
          </section>
        ) : tab === 'topo' ? (
          <section className="panel tc-tabcol">
            <TcTopology
              data={d}
              devices={devices}
              onChange={patch}
              onDevicesChanged={() => void devQ.refetch()}
              onMsg={(kind, text) => setMsg({ kind, text })}
            />
          </section>
        ) : tab === 'traffic' ? (
          <section className="panel tc-tabcol">
            <TcTraffic data={d} onChange={patch} />
          </section>
        ) : tab === 'manual' ? (
          <section className="panel tc-tabcol">
            <TcManual data={d} onChange={patch} />
          </section>
        ) : tab === 'history' ? (
          <section className="panel tc-tabcol">
            <TcHistory tcid={openId} />
          </section>
        ) : tab === 'cycle' ? (
          <section className="panel tc-tabcol">
            <TcCycles tcid={openId} />
          </section>
        ) : (
          // Automation 만 안에서 좌우로 나뉜다 — 목록과 세부.
          // 바깥 칸 수는 그대로라 탭을 옮겨도 화면이 출렁이지 않는다.
          <div className="tc-inner">
            {/* 목록 */}
            <section className="panel tc-seqcol" style={{ flexBasis: seqW }}>
              <div className="tc-run">
                <button
                  className="btn small primary"
                  type="button"
                  disabled={running || steps.length === 0}
                  title="처음부터 끝까지 돌립니다"
                  onClick={() => void doRun(0, false)}
                >
                  ▶ 전체
                </button>
                <button
                  className="btn small"
                  type="button"
                  disabled={running || stepIdx < 0}
                  title="고른 줄부터 끝까지"
                  onClick={() => void doRun(stepIdx, false)}
                >
                  ▶ 여기부터
                </button>
                <button
                  className="btn small danger"
                  type="button"
                  disabled={!running}
                  title="중지"
                  onClick={() => runAbort.current?.abort()}
                >
                  ⏹
                </button>
                {/* 어느 파라미터 파일이 붙어 있나. 실행 줄에 둔다 —
                    정보 탭 깊숙이 두면 지금 무엇이 깔려 있는지 모른 채
                    스텝을 쓰게 된다. */}
                <TcParamBar
                  files={paramFiles}
                  all={gp.files}
                  used={gp.used}
                  onChange={(next) => patch({ param_files: next, param_file: '' })}
                />
                <TcSessionBar
                  sessions={sessionIds}
                  devices={devices}
                  onAdd={(id) => setSessions([...sessionIds, id])}
                  onPick={(i, id) => setSessions(sessionIds.map((v, j) => (j === i ? id : v)))}
                  onRemove={removeSession}
                  onMsg={(kind, text) => setMsg({ kind, text })}
                />
                <span className="sp" />
                {runStat.done > 0 && (
                  <span className="muted small">
                    {runStat.done}/{steps.length} ·{' '}
                    <b className="status pass">PASS {runStat.pass}</b> ·{' '}
                    <b className="status fail">FAIL {runStat.fail}</b>
                  </span>
                )}
              </div>

              {/* 회차 고르기.
                  반복 시험에서 궁금한 것은 「7회차에 무슨 일이 있었나」 다.
                  회차를 고르면 **목록 전체가 그 회차로** 바뀐다 — 스텝마다
                  따로 눌러 다니지 않는다. 100회여도 견딘다. */}
              {roundMax > 1 && (
                <div className="tc-rounds">
                  <span className="muted small">
                    회차 {roundMax}
                    {badRounds.length > 0 && (
                      <>
                        {' · '}
                        <b className="status fail">부적합 {badRounds.length}</b>
                      </>
                    )}
                  </span>
                  <button
                    type="button"
                    className={`sc-round${viewRound === 0 ? ' on' : ''}`}
                    title="회차를 합친 결과 — 한 번이라도 깨졌으면 부적합"
                    onClick={() => setViewRound(0)}
                  >
                    전체
                  </button>
                  {/* 이력은 다 남긴다. 다만 1000개를 늘어놓으면 못 쓴다 —
                      찾는 쪽을 붙인다. 100번 돌려 3번 깨졌으면 궁금한 것은
                      그 3번이고, 나머지 997개는 자리만 먹는다. */}
                  {badRounds.length > 0 && (
                    <label className="tc-round-only">
                      <input
                        type="checkbox"
                        checked={badOnly}
                        onChange={(e) => setBadOnly(e.target.checked)}
                      />
                      깨진 것만
                    </label>
                  )}
                  {roundMax > 30 && (
                    <input
                      className="tc-round-q"
                      type="number"
                      min={1}
                      max={roundMax}
                      placeholder="회차로 가기"
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return
                        const n = Number((e.target as HTMLInputElement).value)
                        if (n >= 1 && n <= roundMax) setViewRound(n)
                      }}
                    />
                  )}
                  <span className="tc-round-list">
                    {(badOnly ? badRounds : Array.from({ length: roundMax }, (_, n) => n + 1)).map(
                      (n) => (
                        <button
                          key={n}
                          type="button"
                          className={`sc-round${badRounds.includes(n) ? ' bad' : ''}${
                            viewRound === n ? ' on' : ''
                          }`}
                          onClick={() => setViewRound(viewRound === n ? 0 : n)}
                        >
                          {n}
                        </button>
                      ),
                    )}
                  </span>
                  {viewRound > 0 && (
                    <span className="muted small">{viewRound}회차의 결과를 보고 있습니다</span>
                  )}
                </div>
              )}

              {/* 요구사항 구현의도·시험 목적 → 스텝 설계.
                  스텝 목록 위다 — 빈 시험을 열면 이것부터 보여야 한다. */}
              <TcSuggest
                tcid={openId}
                data={d}
                intent={String(reqByKey.get(String(d.req_id ?? ''))?.desc ?? '')}
                onChange={patch}
              />
              {fullQ.isLoading ? (
                <div className="empty">불러오는 중…</div>
              ) : (
                <TcSequence
                  steps={shownSteps}
                  selected={stepIdx}
                  onSelect={setStepIdx}
                  onAdd={addStep}
                  sessionName={sessionName}
                  runningAt={runAt}
                  picked={picked}
                  onPick={pickStep}
                  // 수동 스텝은 여기 안 나온다. 별개 탭이다.
                  hide={(s) => s.kind === 'manual'}
                  onRun={running ? undefined : (i) => void doRun(i, true)}
                />
              )}
              {/* 고른 줄이 있을 때만 뜬다. 목록 **아래**에 둔다 — 위에 두면 띠가
                  나타나는 순간 줄이 통째로 아래로 밀려서, 방금 누른 칸이
                  손 밑에서 달아난다. */}
              {picked.size > 0 && (
                <div className="sq-bulk">
                  <b>{picked.size}개 골랐습니다</b>
                  <span className="muted small">shift 를 누른 채 누르면 그 사이가 모두</span>
                  <button
                    className="btn small primary"
                    type="button"
                    disabled={running}
                    title="고른 줄만 번호순으로 돌립니다"
                    onClick={() => void doRun(0, false, [...picked])}
                  >
                    ▶ 고른 것만
                  </button>
                  <button className="btn small" type="button" onClick={() => skipPicked(true)}>
                    건너뛰기
                  </button>
                  <button className="btn small" type="button" onClick={() => skipPicked(false)}>
                    되돌리기
                  </button>
                  <button
                    className="btn small danger"
                    type="button"
                    onClick={() => removeSteps([...picked])}
                  >
                    삭제
                  </button>
                  <button className="btn small" type="button" onClick={clearPicked}>
                    해제
                  </button>
                </div>
              )}
            </section>

            <Resizer
              label="스텝 목록 폭 조절"
              onResize={setSeqW}
              getOrigin={() => {
                const el = splitRef.current
                if (!el) return 0
                /*
                 * 1열이 접혀 있으면 왼쪽에는 30px 띠만 있다. 그런데 늘
                 * listW 를 더해 기준을 잡으니 200px 넘게 어긋나서, 접힌
                 * 상태에서는 조절바를 끌어도 폭이 안 바뀌는 것처럼 보였다.
                 */
                return el.getBoundingClientRect().left + (listOpen ? listW + 6 : 30)
              }}
            />

            {/* 세부 — 스텝 하나, 또는 캡쳐하는 동안은 명령어 캡쳐.
                탭 줄은 이 칸 위(오른쪽 칸 머리)에 한 번만 그린다. 여기에도
                두었더니 같은 줄이 두 번 나왔다. */}
            <section className={`panel tc-detcol${termOpen ? ' wide' : ''}`}>
              {/* 3열도 제 머리를 단다. 1열(`Coverage`)·2열(실행 띠)과 같은
                  46px 라야 세 칸의 구분선이 한 줄에서 만난다. */}
              <div className="tc-colh">
                <b>{termOpen ? '명령어 캡쳐' : '스텝 상세'}</b>
                <span className="sp" />
                {/* 캡쳐는 **이 칸을 바꾸는 일**이라 이 칸 머리에 둔다.
                    2열 실행 줄에 있을 때는 왼쪽을 눌러 오른쪽이 바뀌는
                    꼴이었고, 그 줄은 「돌리는」 것들만 있어야 읽힌다. */}
                <div className="tc-more">
                  <button
                    className="btn tc-dots"
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={detMenu}
                    onClick={() => setDetMenu((v) => !v)}
                  >
                    ⋯
                  </button>
                  {detMenu && (
                    <>
                      <div className="tc-menu-back" onClick={() => setDetMenu(false)} />
                      <div className="tc-menu" role="menu">
                        <button
                          type="button"
                          title="장비에 붙어 명령을 치면 그대로 스텝이 됩니다"
                          onClick={() => {
                            setTermOpen((v) => !v)
                            setDetMenu(false)
                          }}
                        >
                          {termOpen ? '⌨ 명령어 캡쳐 닫기' : '⌨ 명령어 캡쳐'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
              {termOpen ? (
                <TcTerminal
                  sessions={sessionIds}
                  devById={devById}
                  sessionNames={sessionNames}
                  onAdd={(s) => {
                    // 함수형으로 붙인다. 기록 중에는 명령이 잇달아 들어와서
                    // 닫힌 값을 쓰면 앞 스텝이 뒤 스텝에 덮인다.
                    setD((c) => ({ ...c, checks: [...((c.checks ?? []) as TcStep[]), s] }))
                    setDirty(true)
                  }}
                  onClose={() => setTermOpen(false)}
                />
              ) : (
              <TcStepDetail
                step={stepIdx >= 0 ? (shownSteps[stepIdx] ?? null) : null}
                index={stepIdx}
                total={steps.length}
                sessions={sessionNames}
                params={stepParams}
                takenVars={takenVars}
                onChange={(p) => stepIdx >= 0 && patchStep(stepIdx, p)}
                onMove={(dir) => stepIdx >= 0 && moveStep(stepIdx, dir)}
                onRemove={() => stepIdx >= 0 && removeStep(stepIdx)}
                onDuplicate={() => stepIdx >= 0 && duplicateStep(stepIdx)}
                onRun={running || stepIdx < 0 ? undefined : () => void doRun(stepIdx, true)}
                meterCfg={d.meterCfg}
                onGoTraffic={() => setTab('traffic')}
                block={blockInfo}
              />
              )}
            </section>
          </div>
        )


  return (
    <>
      {form !== undefined && (
        <TcForm
          editing={form}
          /*
           * 새로 만들 때 **서 있는 자리의 요구사항**에 미리 걸어 둔다.
           *
           * 전에는 늘 「(연결 안 함)」 이었다. MGMT-001 아래에서 `+` 를
           * 눌러도 만들어진 시험은 미분류로 떨어졌고, 트리에서 사라진 것을
           * 다시 찾아 손으로 연결해야 했다 — 어디서 눌렀는지가 화면에
           * 뻔히 보이는데 그것을 안 쓰고 있었다.
           *
           * List 에서는 트리에서 고른 요구사항, Detail 에서는 지금 열어 둔
           * 시험이 걸린 요구사항이 그 자리다.
           */
          presetReqId={
            form === null
              ? (view === 'list' && selReq
                  ? selReq
                  : tcs.find((x) => x.tcid === openId)?.req_id) || undefined
              : undefined
          }
          onCreated={(id) => pickTc(id)}
          onClose={() => setForm(undefined)}
        />
      )}
      {mapTc && <TcMapReqDialog tc={mapTc} onClose={() => setMapTc(null)} />}
      {revOpen && openId && (
        <TcRevisions
          tcid={openId}
          onClose={() => setRevOpen(false)}
          onRestored={() => {
            void qc.invalidateQueries({ queryKey: ['tc', openId] })
            void qc.invalidateQueries({ queryKey: ['tc', 'list', 'meta'] })
            setDirty(false)
          }}
        />
      )}
      {bulkOpen && <TcBulkForm onClose={() => setBulkOpen(false)} />}
      {startOpen && (
        <TcStart
          devices={devices}
          onClose={() => setStartOpen(false)}
          onMade={(id) => {
            setStartOpen(false)
            void tcQ.refetch()
            pickTc(id)
          }}
        />
      )}
      {bulkEdit && (
        <TcBulkEdit
          items={[...(view === 'list' ? listPick : pickedTc)].map((id) => ({
            tcid: id,
            name: tcs.find((x) => x.tcid === id)?.name,
          }))}
          onClose={() => setBulkEdit(false)}
          onDone={(text) => {
            setBulkEdit(false)
            tcSel.clear()
            setListPick(new Set())
            setMsg({ kind: 'ok', text })
            void tcQ.refetch()
            // 지금 열어 둔 TC 도 방금 바뀌었을 수 있다
            void qc.invalidateQueries({ queryKey: ['tc', openId] })
          }}
        />
      )}
      {cloneAsk && (
        <CloneModelAsk
          count={listPick.size}
          busy={cloning}
          onClose={() => setCloneAsk(false)}
          onGo={(mg, md) => {
            setCloneAsk(false)
            void clonePicked(mg, md)
          }}
        />
      )}
      {saveAs && (
        <TcSaveAs
          title={saveAs.title}
          defaultId={saveAs.id}
          defaultName={saveAs.name}
          note={saveAs.note}
          taken={takenIds}
          busy={saveAsM.isPending}
          askModel={saveAs.title === '다른 이름으로 저장'}
          onSubmit={(id, name, mg, md) => saveAsM.mutate({ id, name, mg, md })}
          onClose={() => setSaveAs(null)}
        />
      )}
      {/* 파일 고르기는 감춰 둔다 — ⋯ 메뉴가 이 칸을 대신 누른다 */}
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          // 같은 파일을 다시 골라도 change 가 뜨도록 비운다
          e.target.value = ''
          if (f) void importFile(f)
        }}
      />

      {error ? (
        <div className="load-error">
          데이터를 불러오지 못했습니다 — {(error as Error).message}
        </div>
      ) : null}

      {/* 맨 위 줄 — 지금 어디를 보고 있나 + 보기 방식.
          요구사항 화면(.rq-bar)과 **같은 자리·같은 모양**이다. 두 화면을
          오가는 사람이 매번 다시 찾지 않게. */}
      <div className="rq-bar">
        <span className="rq-crumb">
          {/* 요구사항 화면의 「Requirements」 와 같은 자리·같은 무게.
              이 화면이 담는 것은 「어느 요구사항이 무엇으로 덮였나」 라
              차림표·칸 머리와 같은 말을 쓴다. */}
          <span className="rq-crumb-root">Coverage</span>
          {/* 조상까지 다 적는다. 마지막(지금 자리)만 진하게 — 앞엣것은
              어디에 있는지를 알려주는 길잡이지 지금 보는 것이 아니다.
              눌러서 그 폴더로 올라갈 수 있다. */}
          {view === 'list' &&
            wherePath.map((f, i) => (
              <span className="rq-crumb-seg" key={f.id || `x${i}`}>
                <span className="rq-crumb-sep">›</span>
                {i === wherePath.length - 1 || !f.id ? (
                  <b>{f.name}</b>
                ) : (
                  <button
                    type="button"
                    className="rq-crumb-up"
                    onClick={() => goFolder(f.id)}
                    title={`${f.name} 으로`}
                  >
                    {f.name}
                  </button>
                )}
              </span>
            ))}
          {view === 'detail' && openId && (
            <>
              {detailPath.folders.map((f, i) => (
                <span className="rq-crumb-seg" key={f.id || `d${i}`}>
                  <span className="rq-crumb-sep">›</span>
                  <button
                    type="button"
                    className="rq-crumb-up"
                    onClick={() => goFolder(f.id)}
                    title={`${f.name} 으로`}
                  >
                    {f.name}
                  </button>
                </span>
              ))}
              {detailPath.req && (
                <>
                  <span className="rq-crumb-sep">›</span>
                  {/* 누르면 그 요구사항의 시험 표로 — 폴더 조각과 같은 문법 */}
                  <button
                    type="button"
                    className="rq-crumb-up tc-crumb-req"
                    title={`${detailPath.req} — 이 요구사항의 시험 표로`}
                    onClick={() => {
                      if (dirty && !window.confirm('저장하지 않은 변경이 있습니다. 옮길까요?'))
                        return
                      if (detailPath.reqPk) setSelReq(detailPath.reqPk)
                      setListPick(new Set())
                      setOpenId('')
                    }}
                  >
                    {detailPath.req}
                  </button>
                </>
              )}
              <span className="rq-crumb-sep">›</span>
              <b>{d.name || openId}</b>
            </>
          )}
          <span className="muted small">
            {view === 'list' ? `${shownListRows.length}건` : openId || '고른 것 없음'}
          </span>
        </span>
        <span className="sp" />
        {/* 시험항목 화면에 들어와 있는 사람 전부 — 상단 오른쪽 */}
        <PresenceBar users={crowd} me={meName} />
      </div>

      <div className="split tc-split" ref={splitRef}>
        {/* 접었을 때 — 세로 띠 하나만 남는다.
            아주 없애면 다시 펼 길이 없어지고, 어디에 있었는지도 잊는다. */}
        {!listOpen && (
          <button
            type="button"
            className="tc-fold"
            title="시험 항목 펼치기"
            onClick={() => setListOpen(true)}
          >
            <IconPanel open />
            <span className="tc-fold-t">Coverage Tree {tcs.length}</span>
          </button>
        )}
        {/* 1열 — 폴더 · 요구사항 · TC 트리 (요구사항 화면과 같은 모양) */}
        {listOpen && (
        <section className="panel tc-listcol" style={{ flexBasis: listW }}>
          {/* 요구사항 화면과 **같은 부품**을 쓴다. 저마다 만들면 또 어긋난다 */}
          {/* 이 칸은 폴더 → 요구사항 → 시험 순으로 걸린다. 담긴 것은 시험이지만
              읽히는 것은 「어느 요구사항이 무엇으로 덮였나」 다 — 그래서
              Coverage 다. */}
          <ListHead
            name="Coverage Tree"
            count={tcs.length}
            onCollapse={() => setListOpen(false)}
            add={{ title: '최상위 폴더 추가', onClick: () => setAddFolderN((n) => n + 1) }}
            picked={
              pickedTc.size > 1 ? (
                // 세 화면이 같은 말을 쓴다 — 「N건 선택됨」 · ✕ 로 해제.
                // 무엇을 할지는 List 의 일 줄에서 고른다.
                <span className="lh-picked">
                  {pickedTc.size}건 선택됨
                  <button type="button" onClick={tcSel.clear} title="선택 해제">
                    ✕
                  </button>
                </span>
              ) : undefined
            }
            search={{ value: treeQ, placeholder: 'TC · 요구사항 검색', onChange: setTreeQ }}
            /* 파라미터는 시험이 아니라 **시험이 쓰는 값**이다. 트리에 폴더인
               척 끼워 두는 것보다 칸 머리에서 켜고 끄는 편이 맞다. */
            extra={
              /* 찾기 단추와 **같은 모양**으로 나란히 둔다. 글자로 두었더니
                 「Coverage Tree 89」 옆에서 폭을 크게 먹어 이름이 밀렸다. */
              <>
                <FolderSortBtn value={folderSort} onChange={setFolderSort} />
                <button
                  className={`lh-findbtn lh-gp${gpOpen ? ' on' : ''}`}
                  type="button"
                  title="전역 파라미터 — 스텝에서 ${이름} 으로 쓰는 값"
                  aria-pressed={gpOpen}
                  onClick={() => setGpOpen((v) => !v)}
                >
                  <IconParam />
                </button>
              </>
            }
            /* 만들기·일괄·삭제·내보내기는 List 의 일 줄에 있다. 여기 또 두면
               같은 일이 두 자리에 있어 어느 쪽이 무엇인지 생각하게 된다.
               이 칸은 찾아 들어가는 자리라 찾기 하나면 된다. */
          />
          {tcQ.isLoading ? (
            <div className="empty">불러오는 중…</div>
          ) : (
            <TcTree
              tcs={tcs}
              folderSort={folderSort}
              openId={gpOpen ? '' : openId}
              onOpen={(id) => {
                setGpOpen(false)
                pickTc(id)
              }}
              picked={pickedTc}
              q={treeQ}
              onPickClick={tcSel.onClick}
              /* 폴더·요구사항은 언제나 「고를 수 있는 것」 이다. 고르면
                 편집기에서 나와 그 묶음의 표(List)가 된다 — 시험을 고르면
                 다시 편집기다. 접기는 ▶ 화살표 몫이라 클릭과 안 섞인다. */
              selectedFolder={selFolder}
              onSelectFolder={(id) => {
                if (dirty && !window.confirm('저장하지 않은 변경이 있습니다. 옮길까요?')) return
                setSelFolder(id)
                setSelReq(null)
                setListPick(new Set())
                setOpenId('')
              }}
              addFolderSignal={addFolderN}
              selectedReq={selReq}
              onSelectReq={(pk) => {
                if (dirty && !window.confirm('저장하지 않은 변경이 있습니다. 옮길까요?')) return
                setSelReq(pk)
                setListPick(new Set())
                setOpenId('')
              }}
            />
          )}

        </section>
        )}

        {listOpen && (
          <Resizer
            label="TC 목록 폭 조절"
            onResize={setListW}
            getOrigin={() => splitRef.current?.getBoundingClientRect().left ?? 0}
          />
        )}

        {/* 오른쪽은 늘 한 칸이다. 그 안에서 탭이 무엇을 보여줄지 정하고,
            Automation 일 때만 다시 좌우로 나뉜다. 바깥 칸 수가 탭마다
            달라지면 옮길 때마다 화면이 통째로 흔들린다. */}
        <div className="tc-content">
          {view === 'detail' && openId && !gpOpen && detHead}
        {gpOpen ? (
          /* 파일 목록까지 통째로 — `only` 를 안 준다. 하나만 주면 옆의
             파일로 넘어갈 길이 없어 되돌아 나와야 한다.
             List·Detail 어느 쪽에서 켜든 여기가 먼저다. 뒤에 두었더니
             List 에서는 단추가 먹통이었다. */
          <section className="panel tc-tabcol">
            <GlobalParams />
          </section>
        ) : view === 'list' ? (
          /* ── List — 이 자리의 시험을 표로 (요구사항 화면과 같은 모양) ──
             열을 늘리지 않는다. 표가 편집기 자리를 대신 쓴다. */
          <section className="panel tc-listview">
            <div className="rq-list">
              <div className="tc-listhead">
                <div className="rq-actions">
                  {/* 요구사항 2열과 같은 규칙(피드백):
                      없음   → + New · + Bulk New
                      1건    → … | Edit  Clone | Delete
                      2건 이상 → … | Bulk Edit  Clone | Delete
                      Export 는 뺐다. Delete 는 구분선 너머 끝자리. */}
                  <button className="btn" type="button" onClick={() => setForm(null)}>
                    + New
                  </button>
                  {/* 여러 건을 한 번에 만드는 창 — 요구사항 화면과 같은 이름 */}
                  <button className="btn" type="button" onClick={() => setBulkOpen(true)}>
                    + Bulk New
                  </button>
                  {listPick.size > 0 && (
                    <>
                      <span className="cy-vsep" aria-hidden="true" />
                      {listPick.size === 1 ? (
                        <button
                          className="btn"
                          type="button"
                          title="고른 시험을 고칩니다"
                          onClick={() => {
                            const id = [...listPick][0]
                            const meta = tcs.find((x) => x.tcid === id)
                            if (meta) setForm(meta)
                          }}
                        >
                          Edit
                        </button>
                      ) : (
                        <button
                          className="btn"
                          type="button"
                          title={`고른 ${listPick.size}건을 한꺼번에 고칩니다`}
                          onClick={() => setBulkEdit(true)}
                        >
                          Bulk Edit
                        </button>
                      )}
                      {/* 고른 것을 그대로 하나 더 — 스텝까지 통째로 베낀다 */}
                      <button
                        className="btn"
                        type="button"
                        disabled={cloning}
                        title={`고른 ${listPick.size}건을 복사합니다 (스텝까지)`}
                        onClick={() => setCloneAsk(true)}
                      >
                        {cloning ? '복사 중…' : 'Clone'}
                      </button>
                      <span className="cy-vsep" aria-hidden="true" />
                      <button
                        className="btn danger"
                        type="button"
                        onClick={() => {
                          const ids = [...listPick]
                          if (!window.confirm(`고른 시험 ${ids.length}건을 삭제합니다.\n되돌릴 수 없습니다.`))
                            return
                          void (async () => {
                            for (const id of ids) await tcApi.remove(id)
                            setListPick(new Set())
                            void qc.invalidateQueries({ queryKey: ['tc', 'list', 'meta'] })
                          })()
                        }}
                      >
                        Delete
                      </button>
                    </>
                  )}
                  <span className="sp" />
                  {/* 펼친(연) 시험에 쓰는 ⋯ — 안 연 것에는 저장·내보내기가 꺼진다 */}
                  {moreMenu}
                </div>
              </div>

              <div className="rq-selbar">
                <label className="rq-selall">
                  <input
                    type="checkbox"
                    checked={shownListRows.length > 0 && listPick.size === shownListRows.length}
                    ref={(el) => {
                      if (el)
                        el.indeterminate =
                          listPick.size > 0 && listPick.size < shownListRows.length
                    }}
                    disabled={!shownListRows.length}
                    onChange={() =>
                      setListPick(
                        listPick.size === shownListRows.length
                          ? new Set()
                          : new Set(shownListRows.map((t) => t.tcid)),
                      )
                    }
                  />
                  Select All
                </label>
                <span className="rq-seldiv" aria-hidden="true" />
                <span className="muted small">Selected : {listPick.size}</span>
                {/* 표 안 검색 — 트리 검색과 별개로 지금 자리에서 좁힌다 */}
                <input
                  className="tc-listq"
                  placeholder="검색 (이름 · TC ID)"
                  value={listQ}
                  onChange={(e) => setListQ(e.target.value)}
                />
                {/* 열 설정 ⚙ — 표 바로 위 오른끝. 보이기/숨기기 + 끌어서 차례 바꾸기 */}
                <div className="tc-more">
                  <button
                    className="btn tc-gear"
                    type="button"
                    title="열 보이기/숨기기 · 차례 바꾸기"
                    aria-haspopup="menu"
                    aria-expanded={colsOpen}
                    onClick={() => setColsOpen((v) => !v)}
                  >
                    <IconSettings />
                  </button>
                  {colsOpen && (
                    <>
                      <div className="tc-menu-back" onClick={() => setColsOpen(false)} />
                      <div className="tc-menu tc-colpop" role="menu">
                        {/* SETUP 시험항목 INFO 필드와 1:1(합의 규칙) */}
                        {infoColDefs.length === 0 && (
                          <span className="muted small">
                            INFO 필드가 없습니다 — SETUP 에서 만듭니다
                          </span>
                        )}
                        {infoColDefs.map((c) => (
                          <label key={c.k}>
                            <input
                              type="checkbox"
                              checked={cols.includes(c.k)}
                              onChange={() =>
                                setCols((v) =>
                                  v.includes(c.k) ? v.filter((x) => x !== c.k) : [...v, c.k],
                                )
                              }
                            />
                            {c.label}
                          </label>
                        ))}
                        <button
                          type="button"
                          className="linkish tc-coldef"
                          onClick={() => {
                            setCols([...COL_DEFAULT])
                            setColF({})
                          }}
                        >
                          기본값 복원
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="rq-table">
                <div className="rq-tr tc-tr rq-th" style={{ gridTemplateColumns: listGrid }}>
                  <div />
                  <div>이름</div>
                  {/* 고정 열 + INFO 열 + REQ Map. 머리 자체가 필터다 */}
                  {(
                    [
                      { k: 'model_group', label: '모델그룹' },
                      { k: 'model', label: '모델명' },
                      ...visCols,
                    ] as Array<{ k: string; label: string }>
                  ).map((c) => (
                    <div key={c.k} className="tc-thdrag">
                      <select
                        className={`tc-colf${colF[c.k] ? ' on' : ''}`}
                        value={colF[c.k] ?? ''}
                        onChange={(e) => setColF((v) => ({ ...v, [c.k]: e.target.value }))}
                      >
                        <option value="">{c.label}</option>
                        {[...new Set(listRows.map((t) => colVal(c.k, t)))].sort().map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                  <div>REQ Map</div>
                </div>
                {shownListRows.length === 0 ? (
                  <div className="empty">이 자리에 시험이 없습니다.</div>
                ) : (
                  shownListRows.map((t) => {
                    return (
                      <div key={t.tcid} className="tcl-rw">
                      <div
                        className={`rq-tr tc-tr${listPick.has(t.tcid) ? ' picked' : ''}`}
                        style={{ gridTemplateColumns: listGrid }}
                      >
                        <div className="rq-ck">
                          <input
                            type="checkbox"
                            checked={listPick.has(t.tcid)}
                            aria-label={`${t.name || t.tcid} 고르기`}
                            onChange={() =>
                              setListPick((sv) => {
                                const n = new Set(sv)
                                if (n.has(t.tcid)) n.delete(t.tcid)
                                else n.add(t.tcid)
                                return n
                              })
                            }
                          />
                        </div>
                        <div className="rq-name">
                          {/* 인라인 펼침은 걷어냈다(피드백) — 이름을 누르면
                              전체 상세(레일)로 간다. ← 목록으로 복귀. */}
                          <span className="rq-icon" aria-hidden="true">
                            <IconTcDoc />
                          </span>
                          {/* 누르면 그 시험을 열어 짠다 — Detail 로 넘어간다 */}
                          <button
                            type="button"
                            className="linkish"
                            title={`${t.tcid} — 열어서 시험 짜기`}
                            onClick={() => pickTc(t.tcid)}
                          >
                            {t.name || '(제목 없음)'}
                          </button>
                          {/* 스텝 수는 열로 두지 않고 이름 꼬리에 — 트리와 같은 문법 */}
                          {typeof t._cli_count === 'number' && t._cli_count > 0 && (
                            <span className="tt-n">{t._cli_count}</span>
                          )}
                          {/* 세션 없는 자동 시험 — 돌릴 수 없다. 미리 보인다 */}
                          {(t._cli_count ?? 0) > 0 &&
                            ((t as Record<string, unknown>)._sess_n ?? 0) === 0 &&
                            String((t as Record<string, unknown>).run_type ?? '') !== '수동' && (
                              <span
                                className="tc-nosess"
                                title="세션(장비)이 없습니다 — 자동 스텝을 돌릴 수 없습니다. 열어서 + 세션으로 장비를 앉히거나 Bulk Edit 세션을 쓰세요"
                              >
                                ⚠
                              </span>
                            )}
                        </div>
                        {colCell('model_group', t)}
                        {colCell('model', t)}
                        {visCols.map((c) => colCell(c.k, t))}
                        {colCell('map', t)}
                      </div>
                      </div>
                    )
                  })
                )}
              </div>
              <div className="bottom">
                <span>
                  시험 {shownListRows.length}건
                  {shownListRows.length !== listRows.length && ` (전체 ${listRows.length}건)`}
                </span>
              </div>
            </div>
          </section>

        ) : (
          <div className="tc-withrail">
            <div className="tc-railbody">{detPanes}</div>
          </div>
        )}
        </div>
      </div>
    </>
  )
}

/**
 * Clone 의 모델 고르기 — 복제는 모델을 고정해야 저장된다(합의 2026-08-16).
 * 고른 모델그룹·모델명이 이번에 복제되는 전부에 들어가고, 이름 꼬리에
 * 모델 태그가 붙는다.
 */
function CloneModelAsk({
  count,
  busy,
  onGo,
  onClose,
}: {
  count: number
  busy?: boolean
  onGo: (mg: string, md: string) => void
  onClose: () => void
}) {
  const [mg, setMg] = useState('')
  const [md, setMd] = useState('')
  const rolesQ = useQuery({
    queryKey: ['device-roles'],
    queryFn: async () => {
      const r = await apiFetch('/api/device-roles')
      return (await r.json()) as {
        groups?: string[]
        models?: string[]
        model_info?: Record<string, { model_group?: string | null }>
      }
    },
    staleTime: 60_000,
  })
  const modelOpts = (rolesQ.data?.models ?? []).filter(
    (m) => !mg || (rolesQ.data?.model_info?.[m]?.model_group ?? '') === mg,
  )
  return (
    <div className="modal-back" onMouseDown={() => !busy && onClose()}>
      <form
        className="modal sa"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          if (!mg || !md || busy) return
          onGo(mg, md)
        }}
      >
        <div className="modal-head">
          <b>Clone — 모델 고르기 ({count}건)</b>
          <button className="modal-x" type="button" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="sa-note">
            복제는 모델을 고정해야 저장됩니다 — 고른 모델이 복제본 전부에 들어갑니다.
          </div>
          <label className="fld">
            <span>모델그룹</span>
            <select
              value={mg}
              onChange={(e) => {
                setMg(e.target.value)
                setMd('')
              }}
            >
              <option value="">(골라 주세요 — 필수)</option>
              {(rolesQ.data?.groups ?? []).map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
          <label className="fld">
            <span>모델명</span>
            <select value={md} onChange={(e) => setMd(e.target.value)}>
              <option value="">(골라 주세요 — 필수)</option>
              {modelOpts.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="modal-foot">
          <button className="btn" type="button" onClick={onClose} disabled={busy}>
            취소
          </button>
          <button className="btn primary" type="submit" disabled={!mg || !md || busy}>
            {busy ? '복제 중…' : `복제 (${count}건)`}
          </button>
        </div>
      </form>
    </div>
  )
}
