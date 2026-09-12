/**
 * **Cycles — 사이클과 실행을 한 화면에** (지시: 통합 시안 반영).
 *
 *   1열  사이클 트리 — 사업자 ▸ 모델 ▸ 버전그룹 ▸ 사이클. 잎의 숫자는
 *         실행 횟수다. 여기서 만들고(＋) 지운다(✕).
 *   2열  범위를 고르면 그 범위의 **사이클 노션 표**, 사이클을 고르면
 *         상세 — 개요 · AI 요약 · Test Summary · 시험 항목 · **실행**.
 *         실행 탭이 옛 Runs 화면이다: 실행 고르개 + 요약 + 항목 표.
 *   3열  실행기(RunDetail) — 실행 탭에서 자동·수동을 열면 선다.
 *
 * Runs 메뉴는 이 화면으로 합쳤다(지시) — 실행·판정·결과 메일·결과서가
 * 전부 사이클 안에 있다. 판정의 정본은 여전히 실행 기록(plan_run)이다.
 * 만들기·담기·실행 만들기 창은 **쓰던 부품 그대로**다.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { goto, onGoto, reflectUrl } from '@/api/goto'
import { prefGet, prefRemove, prefSet } from '@/lib/prefs'
import { normMode } from '@/lib/runMode'
import DescNote from '@/components/DescNote'
import { exportCycleXlsx, CloneDialog } from '@/pages/Cycles'
import type { CycleItemLite, CycleMeta } from '@/pages/Cycles'
import type { TestCaseMeta } from '@/types'
import RunDetail from '@/components/run/RunDetail'
import type { RunFull } from '@/components/run/RunDetail'
import Resizer, { useResizableWidth } from '@/components/Resizer'
import { IconChevron, IconPanel } from '@/components/icons'
import { CycleMailOne } from '@/components/cycle/CyclePlan'
import CycleReport from '@/components/cycle/CycleReport'
import NTable from '@/components/ntable/NTable'
import { EMPTY_VIEW } from '@/components/ntable/types'
import { autoColor } from '@/components/ntable/palette'
import type { NCol, NRow, NView } from '@/components/ntable/types'
import RepeatPop, { type RepeatCfg } from '@/components/cycle/RepeatPop'
import MakeCycle from '@/components/cycle/MakeCycle'
import AddItems from '@/components/cycle/AddItems'
import CycleEdit from '@/components/cycle/CycleEdit'
import { MakePlanRun } from '@/components/cycle/PlanRunPopup'
import AssigneePicker from '@/components/AssigneePicker'
import { Donut, StatBar, ago, orderTcIds, sumRuns, useNCols, useReqIndex, useUserPeople } from '@/pages/qaBits'
import { useVerdictsState, vDef, vGroup, vLetter } from '@/lib/verdicts'
import type { RunLite } from '@/pages/qaBits'
import './QaShared.css'
import './CyclesBoard.css'
import './RunsBoard.css'

/** GET /api/cycle/{id} — data JSONB 전문. 저장은 이 전문을 통째로 되민다 */
/** 글자 복사 — http 로 여는 화면(210·253)에는 navigator.clipboard 가 없다.
    그때는 옛 방식으로 — 복사가 안 되는데 아무 말 없는 것이 제일 나쁘다. */
function copyText(t: string, ok: () => void) {
  const legacy = () => {
    try {
      const ta = document.createElement('textarea')
      ta.value = t
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      ok()
    } catch {
      window.prompt('복사하세요', t)
    }
  }
  if (navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(t).then(ok, legacy)
    return
  }
  legacy()
}

interface PlanFull {
  [k: string]: unknown
  items?: CycleItemLite[]
  name?: string
  version?: string
  version_group?: string
  customer?: string
  family?: string
  model_group?: string
  model?: string
  assignee?: string
  description?: string
  cid?: string
  status?: string
  /** 시험 기간 — YYYY-MM-DD */
  period_start?: string
  period_end?: string
  /** 설명의 블록 저장분(정본) — description 은 함께 뽑아 둔 마크다운 */
  description_doc?: unknown[]
}

/** 실행 전문 + 실행 탭이 실행 기록(data)에 얹어 두는 값 */
interface RunFullX extends RunFull {
  /** 항목별 할당 대상 — { tcid: 이름 } */
  assignees?: Record<string, string>
  /** 실행 설명 — 요약의 세부 정보에서 고친다 */
  desc?: string
}

const keyOf = (...parts: string[]) => parts.join('|')

/** 시험 항목 한 줄 — 사이클 항목에 TC 메타·REQ 이름표를 입힌 것 */
interface ItemRow {
  tcid: string
  title: string
  man: boolean
  mg: string
  model: string
  type: string
  reqLabel: string
  reqTitle: string
  folder: string
}

export default function CyclesBoard({
  me,
}: {
  me?: { username?: string; name?: string; role?: string } | null
}) {
  const qc = useQueryClient()
  const meName = me?.name || me?.username || ''

  /** 열린 사이클 — 비면 목록. 주소(?cycle=)가 정본이다 */
  const [open, setOpen] = useState(() => prefGet('utop.cycle.sel') ?? '')
  const [tab, setTab] = useState<'info' | 'run' | 'itm' | 'ita' | 'def'>('info')
  const [making, setMaking] = useState(false)
  const [addTo, setAddTo] = useState(false)
  const [mkRun, setMkRun] = useState(false)
  const [edit, setEdit] = useState(false)
  const [cloneId, setCloneId] = useState('')
  /* 만들기 창(MakePlanRun)이 쓰는 카탈로그 — 창을 열 때만 받아 온다 */
  const [needMake, setNeedMake] = useState(false)

  /* 상세 메타의 **초안** — 수동 저장(지시): 고친 값은 여기 담기고,
     머리의 저장 단추를 눌러야 실려 나간다 */
  const [draft, setDraft] = useState<Partial<PlanFull>>({})
  const [savingMeta, setSavingMeta] = useState(false)
  const [cidDone, setCidDone] = useState(false)
  const dirty = Object.keys(draft).length > 0

  const openPlanId = (id: string) => {
    if (dirty && id !== open && !window.confirm('저장하지 않은 변경이 있습니다. 버리고 이동할까요?')) return
    setOpen(id)
    setTab('info')
    prefSet('utop.cycle.sel', id)
    /* 주소에는 **부여 ID(cid)** 를 비춘다(지적: cycle-178… 은 사람이 못 읽는다).
       아직 목록을 못 받았으면 안쪽 id 그대로 — 받은 뒤 다시 열면 좋아진다 */
    reflectUrl('cycle', String(planOf.get(id)?.cid ?? id))
  }
  const closePlan = () => {
    setOpen('')
    prefRemove('utop.cycle.sel')
    window.history.pushState({ utop: true }, '', `${window.location.pathname}?p=cycles`)
  }
  /* 다른 사이클로 옮기면 초안은 버린다 — 남의 사이클에 실리면 안 된다 */
  useEffect(() => {
    setDraft({})
    setCidDone(false)
  }, [open])

  /* ── 자료 ── */
  const plansQ = useQuery({
    queryKey: ['cycles'],
    staleTime: 60_000,
    queryFn: async () => {
      const r = await apiFetch('/api/cycle?meta=1')
      if (!r.ok) throw new Error('사이클을 불러오지 못했습니다')
      return (await r.json()) as { cycles?: CycleMeta[]; items?: CycleMeta[] }
    },
  })
  const runsQ = useQuery({
    queryKey: ['plan-runs'],
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async () => {
      const r = await apiFetch('/api/plan-runs')
      if (!r.ok) throw new Error('실행을 불러오지 못했습니다')
      return (await r.json()) as { runs: RunLite[] }
    },
  })
  /* 폴더 실체 — 사이클이 없어도 폴더가 트리에 서야 한다(승인).
     저장은 기존 /api/cycle-folders 문서의 paths 칸을 쓴다(옛 칸은 보존).
     옛 경로 문자열(사업자/제품군/모델그룹/모델/버전그룹)도 번역해 합류. */
  const codesQ = useQuery({
    queryKey: ['codes'],
    staleTime: 60_000,
    queryFn: async () => {
      const r = await apiFetch('/api/codes')
      if (!r.ok) throw new Error('코드를 불러오지 못했습니다')
      return (await r.json()) as { items?: Array<{ kind?: string; value?: string }> }
    },
  })
  const foldersQ = useQuery({
    queryKey: ['cycle-folders'],
    staleTime: 60_000,
    queryFn: async () => {
      const r = await apiFetch('/api/cycle-folders')
      if (!r.ok) return {} as Record<string, unknown>
      return (await r.json()) as Record<string, unknown>
    },
  })
  const tcQ = useQuery({
    queryKey: ['tc-meta'],
    staleTime: 60_000,
    queryFn: async () => {
      const r = await apiFetch('/api/tc?meta=1')
      if (!r.ok) throw new Error('시험 항목을 불러오지 못했습니다')
      return (await r.json()) as { tcs: TestCaseMeta[] }
    },
  })
  const vgQ = useQuery({
    queryKey: ['cycle-version-groups'],
    staleTime: 60_000,
    queryFn: async () => {
      const r = await apiFetch('/api/cycle-version-groups')
      if (!r.ok) throw new Error('버전그룹을 불러오지 못했습니다')
      return (await r.json()) as { groups: Record<string, string[]> }
    },
  })
  const catQ = useQuery({
    queryKey: ['device-catalog'],
    /* 만들기 창뿐 아니라 **개요의 대상 드롭다운**도 쓴다(지시) — 상세를
       열면 받아 온다 */
    enabled: needMake || !!open,
    staleTime: 60_000,
    queryFn: async () => {
      const r = await apiFetch('/api/device-catalog2')
      if (!r.ok) throw new Error('장비 카탈로그를 불러오지 못했습니다')
      return (await r.json()) as { items: Array<Record<string, unknown>> }
    },
  })
  const people = useUserPeople()
  /** 실행 판정 기준 — 셋업이 정본. 막대 색과 판정 알약이 쓴다 */
  const { defs: verds } = useVerdictsState()
  const verdPal = useMemo(
    () => ({
      p: vDef(verds, 'Pass').color,
      f: vDef(verds, 'Fail').color,
      b: vDef(verds, 'Blocked').color,
      n: vDef(verds, '').color,
    }),
    [verds],
  )
  const reqIndex = useReqIndex()
  /** 담당자 고르개(조직 클릭·이름 검색) — 개요의 담당자 칸이 연다 */
  const [assAt, setAssAt] = useState<{ x: number; y: number } | null>(null)

  /* ── 1열 트리 · 2열 범위 (지시: Cycles·Runs 통합) ── */
  const [grpSel, setGrpSel] = useState<{ t: 'cust' | 'model' | 'vg'; k: string } | null>(null)
  const [sideOn, setSideOn] = useState(() => prefGet('utop.cyc.side') !== '0')
  const [w1, setW1] = useResizableWidth('utop.ntb.cyc.w1', 264, 180, 620)
  const gridRef = useRef<HTMLDivElement>(null)
  /** 접힌 트리 마디 — 기본은 전부 펼침 */
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const [treeQ, setTreeQ] = useState('')
  /** 트리 보기 — 폴더만 / 폴더+버전명(사이클). REQ-Coverage 의 ⋯ 과 같은 결 */
  const [leafOn, setLeafOn] = useState(() => prefGet('utop.cyc.leaves') !== '0')
  const [treeModeAt, setTreeModeAt] = useState<{ x: number; y: number } | null>(null)
  const setLeaves = (v: boolean) => {
    setLeafOn(v)
    prefSet('utop.cyc.leaves', v ? '1' : '0')
  }
  /** 폴더 ⋯ 메뉴 — 트리의 사업자·모델·버전그룹 줄 */
  const [folderMenu, setFolderMenu] = useState<{ x: number; y: number; t: 'cust' | 'model' | 'vg'; k: string } | null>(null)
  /** ＋ 폴더 창 — 사업자 ▸ 제품명 ▸ 버전그룹 (뒤 단계는 비워도 됨) */
  const [folderDlg, setFolderDlg] = useState<{
    customer: string
    customerNew: string
    model: string
    vg: string
    vgNew: string
  } | null>(null)
  /** 사이클 만들기 씨앗 — 버전그룹 ⋯ 의 ＋사이클이 채운다(지시: 자동 채움) */
  const [mkSeed, setMkSeed] = useState<{ customer?: string; model?: string; version_group?: string } | null>(null)
  useEffect(() => prefSet('utop.cyc.side', sideOn ? '1' : '0'), [sideOn])

  /* ── 실행 탭 상태 (옛 Runs 화면을 들여온 것) ── */
  const [selRun, setSelRun] = useState(() => prefGet('utop.runs.open') ?? '')
  /** 3열 실행기 */
  const [runnerOn, setRunnerOn] = useState(false)
  /** 일자별 그래프 꼴 — **선이 기본**(지시). 계정별로 남는다 */
  const [dayKind, setDayKind] = useState<'line' | 'bar'>(
    () => (prefGet('utop.cyc.daykind') === 'bar' ? 'bar' : 'line'),
  )
  const [runMode, setRunMode] = useState<'A' | 'M'>('A')
  /** 표에서 체크한 항목 — 있으면 도구 줄에 단추 둘이 나타난다(승인) */
  const [picked, setPicked] = useState<string[]>([])
  /** 실행을 열 때 **고정한** 목록. picked 를 그대로 쓰면 표에서 체크를
   *  푸는 순간 도는 목록이 바뀐다 */
  const [runPick, setRunPick] = useState<string[]>([])
  /** 반복 시험 규칙 — 걸어 두면 실행 화면의 「시험 시작」 이 이대로 건다 */
  const [repPop, setRepPop] = useState(false)
  const [repCfg, setRepCfg] = useState<RepeatCfg | null>(null)
  const [runFocus, setRunFocus] = useState('')
  const [wide, setWide] = useState(false)
  const [runMoreAt, setRunMoreAt] = useState<{ x: number; y: number } | null>(null)
  /** 실행 담당 고르개 — 요약의 세부 정보 담당 칸이 연다 */
  const [mailPlan, setMailPlan] = useState<CycleMeta | null>(null)
  const [repPlan, setRepPlan] = useState<CycleMeta | null>(null)

  /* 시험 항목 탭의 노션 표 — 열 정의는 코드가 정본, 폭·숨김·차례는 계정에.
     유형 선택지는 담긴 값에서 뽑아 색만 자동으로 입힌다. */
  const [itView, setItView] = useState<NView>({ ...EMPTY_VIEW, groupBy: 'folder' })
  const IT_DEFS: NCol[] = [
    { key: 'id', label: 'ID', type: 'text', width: 124, fixed: true },
    { key: 'title', label: '제목', type: 'text', width: 340, fixed: true },
    { key: 'req', label: 'REQ', type: 'text', width: 130 },
    { key: 'folder', label: '폴더', type: 'text', width: 200 },
    { key: 'mg', label: '모델그룹', type: 'text', width: 90 },
    { key: 'model', label: '모델명', type: 'text', width: 90 },
    { key: 'type', label: '유형', type: 'select', width: 96, options: [] },
    {
      key: 'run', label: '타입', type: 'select', width: 88,
      options: [
        { value: '자동', color: '#1769d2', icon: '▶' },
        { value: '수동', color: '#8a949e', icon: '✎' },
      ],
    },
    { key: 'fail', label: '실패 이력', type: 'text', width: 110 },
  ]
  const [itColsRaw, setItCols] = useNCols('utop.ntb.cycit.cols', IT_DEFS)

  /* 목록의 노션 표 */
  const [lsView, setLsView] = useState<NView>({ ...EMPTY_VIEW })
  const LS_DEFS: NCol[] = [
    { key: 'id', label: 'ID', type: 'text', width: 122, fixed: true },
    { key: 'title', label: '제목', type: 'text', width: 240, fixed: true },
    { key: 'vg', label: '버전그룹', type: 'text', width: 90 },
    { key: 'customer', label: '사업자', type: 'text', width: 80 },
    { key: 'mg', label: '모델그룹', type: 'text', width: 90 },
    { key: 'model', label: '모델명', type: 'text', width: 96 },
    { key: 'items', label: '항목', type: 'number', width: 60 },
    { key: 'iss', label: '결함', type: 'number', width: 60 },
    { key: 'runs', label: '실행', type: 'text', width: 104 },
    { key: 'last', label: '마지막 실행', type: 'text', width: 190 },
    { key: 'stat', label: '판정 현황', type: 'text', width: 110 },
    { key: 'assignee', label: '담당', type: 'person', width: 96 },
    { key: 'created', label: '생성일자', type: 'text', width: 100 },
  ]
  const [lsCols, setLsCols] = useNCols('utop.ntb.cyc.cols', LS_DEFS)
  /* 판정 현황을 좁힌다(지시) — 계정에 남은 옛 폭(190)이 정의를 이기므로
     한 번만 바로잡고 표식을 남긴다. 사람이 다시 넓히는 것은 그대로 둔다 */
  useEffect(() => {
    if (prefGet('utop.ntb.cyc.statslim') === '1') return
    prefSet('utop.ntb.cyc.statslim', '1')
    const cur = lsCols.find((c) => c.key === 'stat')
    if (cur && (cur.width ?? 0) > 120) setLsCols(lsCols.map((c) => (c.key === 'stat' ? { ...c, width: 110 } : c)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const plans = useMemo(() => plansQ.data?.cycles ?? plansQ.data?.items ?? [], [plansQ.data])
  const runs = useMemo(() => runsQ.data?.runs ?? [], [runsQ.data])
  const planOf = useMemo(() => new Map(plans.map((p) => [p.id, p])), [plans])
  const tcOf = useMemo(
    () => new Map((tcQ.data?.tcs ?? []).map((t) => [t.tcid, t])),
    [tcQ.data],
  )
  const runsByPlan = useMemo(() => {
    const m = new Map<string, RunLite[]>()
    for (const r of runs) {
      const k = String(r.plan_id ?? '')
      if (!k) continue
      const arr = m.get(k) ?? []
      arr.push(r)
      m.set(k, arr)
    }
    return m
  }, [runs])

  /* 다른 화면에서 「이 사이클을 열어 줘」 — ?cycle= · ?ce= 링크가 온다 */
  useEffect(
    () =>
      onGoto((kind, id) => {
        if (kind === 'cycle') {
          const hit = planOf.get(id) ?? plans.find((p) => String(p.cid ?? '') === id)
          openPlanId(hit ? hit.id : id)
        }
        if (kind === 'ce') {
          const hit = plans.find((p) => String(p.ce ?? '') === id)
          if (hit) openPlanId(hit.id)
        }
        if (kind === 'run') {
          /* 옛 Runs 링크(?run=) — 그 실행의 사이클을 열고 실행 탭에 선다 */
          const r = runs.find((x) => x.id === id)
          const pid = String(r?.plan_id ?? '')
          if (pid && planOf.get(pid)) {
            openPlanId(pid)
            setTab('run')
            openRun(id)
          }
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plans, runs],
  )
  /* 남이 지운 사이클을 붙들고 있으면 상세가 영영 빈다.
     주소가 부여 ID(cid)로 왔으면 먼저 안쪽 id 로 바꿔 태운다 */
  useEffect(() => {
    if (!open || !plansQ.isSuccess) return
    if (planOf.get(open)) return
    const hit = plans.find((p) => String(p.cid ?? '') === open)
    if (hit) {
      setOpen(hit.id)
      prefSet('utop.cycle.sel', hit.id)
      reflectUrl('cycle', String(hit.cid ?? hit.id))
      return
    }
    closePlan()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, plansQ.isSuccess, planOf, plans])

  /* ── 목록 ── */
  const cmp = useMemo(
    () => new Intl.Collator('ko', { numeric: true, sensitivity: 'base' }).compare,
    [],
  )
  /* 검색·거르기는 노션 표가 맡는다 — 여기서는 안정 정렬만 */
  const rows = useMemo(
    () => [...plans].sort((a, b) => cmp(String(a.cid ?? a.id), String(b.cid ?? b.id))),
    [plans, cmp],
  )

  interface FolderPath {
    customer: string
    model?: string
    version_group?: string
  }
  const folderPathsRaw = useMemo<FolderPath[]>(() => {
    const doc = foldersQ.data ?? {}
    const arr = Array.isArray(doc.paths) ? (doc.paths as FolderPath[]) : []
    return arr.filter((x) => x && String(x.customer ?? '').trim())
  }, [foldersQ.data])
  const folderPaths = useMemo<FolderPath[]>(() => {
    const out = [...folderPathsRaw]
    const legacy = Array.isArray((foldersQ.data ?? {}).folders)
      ? ((foldersQ.data as Record<string, unknown>).folders as unknown[])
      : []
    for (const it of legacy) {
      const seg = String(it ?? '').split('/')
      if (seg.length === 5 && seg[0])
        out.push({ customer: seg[0]!, model: seg[3] || undefined, version_group: seg[4] || undefined })
    }
    return out
  }, [folderPathsRaw, foldersQ.data])
  async function saveFolderPaths(next: FolderPath[]) {
    const doc = { ...(foldersQ.data ?? {}), paths: next }
    const r = await apiFetch('/api/cycle-folders', { method: 'POST', body: JSON.stringify(doc) })
    if (!r.ok) window.alert('폴더를 저장하지 못했습니다')
    await qc.invalidateQueries({ queryKey: ['cycle-folders'] })
  }
  async function addFolderPath(customer: string, model?: string, vg?: string) {
    const c = customer.trim()
    if (!c) return
    const m = (model ?? '').trim() || undefined
    const v = (vg ?? '').trim() || undefined
    if (
      folderPathsRaw.some(
        (x) => x.customer === c && (x.model ?? '') === (m ?? '') && (x.version_group ?? '') === (v ?? ''),
      )
    )
      return
    await saveFolderPaths([...folderPathsRaw, { customer: c, ...(m ? { model: m } : {}), ...(v ? { version_group: v } : {}) }])
    if (m && v)
      await apiFetch('/api/cycle-version-groups/add', {
        method: 'POST',
        body: JSON.stringify({ model: m, group: v }),
      }).catch(() => undefined)
    void vgQ.refetch()
  }

  /* ── 1열 트리: 사업자 ▸ 모델 ▸ 버전그룹 ▸ 사이클 (지시: 통합 시안) ── */
  const treeHit = (t2: string) => !treeQ || t2.toLowerCase().includes(treeQ.trim().toLowerCase())
  interface TreeRow {
    d: 0 | 1 | 2 | 3 | 4
    key: string
    label: string
    n: number
    zero: boolean
    caret?: boolean
    open?: boolean
    on?: boolean
    ico?: string
    plan?: CycleMeta
  }
  const treeRows = useMemo<TreeRow[]>(() => {
    /* 폴더 실체 ∪ 사이클에서 파생된 경로 — 빈 폴더도 선다(승인) */
    const custMap = new Map<string, Map<string, Map<string, CycleMeta[]>>>()
    const touch = (c: string, m?: string, v?: string) => {
      let mm = custMap.get(c)
      if (!mm) {
        mm = new Map()
        custMap.set(c, mm)
      }
      if (m === undefined) return
      let vm = mm.get(m)
      if (!vm) {
        vm = new Map()
        mm.set(m, vm)
      }
      if (v !== undefined && !vm.has(v)) vm.set(v, [])
    }
    for (const f of folderPaths) {
      const c = f.customer || '미지정'
      if (f.model) {
        if (f.version_group) touch(c, f.model, f.version_group)
        else touch(c, f.model)
      } else touch(c)
    }
    for (const p of plans) {
      const c = String(p.customer || '미지정')
      const m = String(p.model || '미지정')
      const v = String(p.version_group || '미지정')
      touch(c, m, v)
      custMap.get(c)!.get(m)!.get(v)!.push(p)
    }

    const out: TreeRow[] = []
    out.push({
      d: 0,
      key: '__all',
      label: '전체 사이클',
      n: plans.length,
      zero: !plans.length,
      on: !open && !grpSel,
    })
    const custs = [...custMap.keys()].sort(cmp)
    for (const cust of custs) {
      const mm = custMap.get(cust)!
      const custRows: TreeRow[] = []
      let custPlanN = 0
      for (const model of [...mm.keys()].sort(cmp)) {
        const mk = keyOf(cust, model)
        const vm = mm.get(model)!
        const modelRows: TreeRow[] = []
        let modelPlanN = 0
        for (const vg of [...vm.keys()].sort(cmp)) {
          const vk = keyOf(cust, model, vg)
          const vPlans = vm
            .get(vg)!
            .slice()
            .sort((a, b) => cmp(String(b.version ?? b.name ?? ''), String(a.version ?? a.name ?? '')))
          const planRows: TreeRow[] = []
          for (const p of vPlans) {
            const rs = runsByPlan.get(p.id) ?? []
            const label = String(p.name || p.version || '(이름 없음)')
            if (!treeHit(`${cust} ${model} ${vg} ${label} ${String(p.cid ?? p.id)}`)) continue
            planRows.push({
              d: 4,
              key: `p:${p.id}`,
              label,
              n: rs.length,
              zero: !rs.length,
              on: open === p.id,
              plan: p,
            })
          }
          /* 찾는 중엔 걸린 것만 — 평소엔 빈 폴더도 선다 */
          if (treeQ && !planRows.length && !treeHit(`${cust} ${model} ${vg}`)) continue
          modelPlanN += vPlans.length
          modelRows.push({
            d: 3,
            key: vk,
            label: vg,
            n: vPlans.length,
            zero: !vPlans.length,
            caret: true,
            open: !closed.has(vk),
            on: !open && grpSel?.t === 'vg' && grpSel.k === vk,
            ico: '🔖',
          })
          if (leafOn && !closed.has(vk)) modelRows.push(...planRows)
        }
        if (treeQ && !modelRows.length && !treeHit(`${cust} ${model}`)) continue
        custPlanN += modelPlanN
        custRows.push({
          d: 2,
          key: mk,
          label: model,
          n: modelPlanN,
          zero: !modelPlanN,
          caret: true,
          open: !closed.has(mk),
          on: !open && grpSel?.t === 'model' && grpSel.k === mk,
          ico: '📦',
        })
        if (!closed.has(mk)) custRows.push(...modelRows)
      }
      if (treeQ && !custRows.length && !treeHit(cust)) continue
      const ck = keyOf(cust)
      out.push({
        d: 1,
        key: ck,
        label: cust,
        n: custPlanN,
        zero: !custPlanN,
        caret: true,
        open: !closed.has(ck),
        on: !open && grpSel?.t === 'cust' && grpSel.k === cust,
        ico: '🏢',
      })
      if (!closed.has(ck)) out.push(...custRows)
    }
    return out
  }, [plans, folderPaths, runsByPlan, closed, open, grpSel, treeQ, cmp, leafOn])

  /** 2열 범위 — 트리에서 고른 묶음의 사이클만 */
  const scopedRows = useMemo(() => {
    if (!grpSel) return rows
    return rows.filter((p) => {
      const cust = String(p.customer || '미지정')
      const model = String(p.model || '미지정')
      const vg = String(p.version_group || '미지정')
      if (grpSel.t === 'cust') return cust === grpSel.k
      if (grpSel.t === 'model') return keyOf(cust, model) === grpSel.k
      return keyOf(cust, model, vg) === grpSel.k
    })
  }, [rows, grpSel])
  /** 범위 빵부스러기 — [키, 이름] 짝 */
  const crumb = useMemo<Array<[string, string]>>(() => {
    if (!grpSel) return []
    const parts = grpSel.k.split('|')
    const out: Array<[string, string]> = []
    if (parts[0] !== undefined) out.push([keyOf(parts[0]!), parts[0]!])
    if (grpSel.t !== 'cust' && parts[1] !== undefined) out.push([keyOf(parts[0]!, parts[1]!), parts[1]!])
    if (grpSel.t === 'vg' && parts[2] !== undefined) out.push([grpSel.k, parts[2]!])
    return out
  }, [grpSel])
  const pickCrumb = (key: string) => {
    if (open && dirty && !window.confirm('저장하지 않은 변경이 있습니다. 버리고 이동할까요?')) return
    const n = key.split('|').length
    setGrpSel({ t: n === 1 ? 'cust' : n === 2 ? 'model' : 'vg', k: key })
    if (open) closePlan()
  }

  async function delPlans(ids: string[]) {
    const list = ids.map((id) => planOf.get(id)).filter((p): p is CycleMeta => !!p)
    if (!list.length) return
    let runN = 0
    for (const p of list) runN += (runsByPlan.get(p.id) ?? []).length
    const names = list.map((p) => `  ${p.cid ?? p.id}  ${p.name ?? ''}`).join('\n')
    if (
      !window.confirm(
        `사이클 ${list.length}건을 지웁니다. 되돌릴 수 없습니다.\n${names}` +
          (runN ? `\n\n딸린 시험 실행 ${runN}건과 판정 결과도 함께 사라집니다.` : ''),
      )
    )
      return
    await reallyDelPlans(ids)
  }

  /** 확인 없이 실제로 지운다 — delPlans·폴더 지우기가 함께 쓴다 */
  async function reallyDelPlans(ids: string[]) {
    const list = ids.map((id) => planOf.get(id)).filter((p): p is CycleMeta => !!p)
    if (!list.length) return
    try {
      let bad = 0
      for (const p of list) {
        for (const r of runsByPlan.get(p.id) ?? []) {
          const res = await apiFetch(`/api/plan-runs/${encodeURIComponent(r.id)}`, { method: 'DELETE' })
          if (!res.ok) bad++
        }
        const res = await apiFetch(`/api/cycle/${encodeURIComponent(p.id)}`, { method: 'DELETE' })
        if (!res.ok) bad++
        /* 그 버전그룹에 아무것도 안 남으면 폴더도 걷는다 — 서버는 비었을 때만 지운다 */
        const model = String(p.model ?? '')
        const vg = String(p.version_group ?? '')
        const left = plans.some(
          (x) => x.id !== p.id && !ids.includes(x.id) &&
            String(x.model ?? '') === model && String(x.version_group ?? '') === vg,
        )
        if (model && vg && !left) {
          try {
            await apiFetch(
              `/api/cycle-version-groups/${encodeURIComponent(model)}/${encodeURIComponent(vg)}`,
              { method: 'DELETE' },
            )
          } catch { /* 못 걷어도 사이클은 이미 갔다 */ }
        }
      }
      if (bad) window.alert(`${bad}건은 지우지 못했습니다.`)
    } finally {
      if (ids.includes(open)) closePlan()
      void plansQ.refetch()
      void runsQ.refetch()
      void qc.invalidateQueries({ queryKey: ['cycle-version-groups'] })
    }
  }

  async function xlsxPlan(id: string) {
    const r = await apiFetch(`/api/cycle/${encodeURIComponent(id)}`)
    if (!r.ok) {
      window.alert('사이클을 불러오지 못했습니다.')
      return
    }
    const d = (await r.json()) as PlanFull
    const meta = planOf.get(id)
    const c = { ...(meta ?? { id }), items: d.items ?? [] } as CycleMeta
    if (!(c.items ?? []).length) {
      window.alert('담긴 시험 항목이 없어 내보낼 것이 없습니다.')
      return
    }
    await exportCycleXlsx(c)
  }

  /* ── 상세 자료 ── */
  const plan = open ? planOf.get(open) : undefined
  const fullQ = useQuery({
    queryKey: ['cycle-full', open],
    enabled: !!open,
    queryFn: async () => {
      const r = await apiFetch(`/api/cycle/${encodeURIComponent(open)}`)
      if (!r.ok) throw new Error('사이클을 불러오지 못했습니다')
      return (await r.json()) as PlanFull
    },
  })
  const full = fullQ.data
  /** 이 사이클의 결함 — 결함 내역 탭이 읽는다 */
  const defQ = useQuery({
    queryKey: ['cycle-defects', open],
    enabled: !!open && tab === 'def',
    queryFn: async () => {
      const r = await apiFetch(`/api/defects?cycle_id=${encodeURIComponent(open)}`)
      if (!r.ok) throw new Error('결함을 불러오지 못했습니다')
      return (await r.json()) as {
        defects: Array<{
          id?: string
          title?: string
          status?: string
          severity?: string | null
          tcid?: string
          tc_name?: string
          jira_key?: string | null
          created_at?: string
        }>
      }
    },
  })
  const myRuns = useMemo(
    () =>
      (runsByPlan.get(open) ?? []).slice().sort((a, b) =>
        String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')),
      ),
    [runsByPlan, open],
  )

  /** 항목 줄 — TC 메타·REQ 이름표를 입혀 폴더 ▸ REQ 로 묶는다 */
  /*
   * 사람이 만든 칸(SETUP ▸ 필드) — 시험 항목에 붙는 것만 가져온다.
   *
   * REQ-Coverage 에서 만든 「Key」 같은 칸이 여기 표에는 없어서, 그것으로
   * 세우고 싶어도 열이 안 보였다(지적). 정의는 서버 한 곳(custom_field)에
   * 있으니 같은 것을 읽어 쓴다.
   */
  const cfQ = useQuery({
    queryKey: ['custom-fields'],
    staleTime: 60_000,
    queryFn: async () => {
      const r = await apiFetch('/api/custom-fields')
      if (!r.ok) throw new Error('필드를 불러오지 못했습니다')
      return (await r.json()) as { items?: Array<Record<string, unknown>> }
    },
  })
  /* 시험 항목에 붙는 칸과 **요구사항에 붙는 칸**을 함께 쓴다 — 요구사항에
     만든 Key 는 그 요구사항의 시험 항목이 물려받는다(지적: Key 값이 비었다) */
  const cfTc = useMemo(
    () =>
      (cfQ.data?.items ?? []).filter((x) => {
        const t = String(x.target ?? '')
        return t === 'tc' || t === 'req'
      }),
    [cfQ.data],
  )

  /** 표가 거르고 세운 차례 — 시험도 이 차례로 돈다(makeRun) */
  const [shownOrder, setShownOrder] = useState<string[]>([])

  /*
   * 정렬·묶기는 **사이클에 남긴다**(지적: 정렬은 저장이 안 되는데).
   *
   * 차례가 곧 시험 차례라 사람마다·PC 마다 달라지면 안 된다 — 계정 설정이
   * 아니라 사이클 문서에 둔다. 거르기·찾기는 그때그때 보는 것이라 안 남긴다.
   */
  const cycView = (full as unknown as { itView?: { sorts?: NView['sorts']; groupBy?: string } } | undefined)
    ?.itView
  const viewLoaded = useRef('')
  useEffect(() => {
    const id = String(full?.id ?? '')
    if (!id || viewLoaded.current === id) return
    viewLoaded.current = id
    setItView((v) => ({
      ...v,
      sorts: cycView?.sorts ?? [],
      groupBy: cycView?.groupBy ?? 'folder',
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full?.id])
  const viewSig = JSON.stringify({ s: itView.sorts, g: itView.groupBy })
  const viewSaved = useRef<string | null>(null)
  useEffect(() => {
    if (!full) return
    /* 처음 그릴 때는 저장하지 않는다 — 읽은 값을 도로 쓰는 셈이다 */
    if (viewSaved.current === null) {
      viewSaved.current = viewSig
      return
    }
    if (viewSaved.current === viewSig) return
    viewSaved.current = viewSig
    void saveFull({ itView: { sorts: itView.sorts, groupBy: itView.groupBy } } as Partial<PlanFull>)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewSig])
  const itemRows = useMemo<ItemRow[]>(() => {
    const out: ItemRow[] = []
    for (const it of full?.items ?? []) {
      const tcid = String(it?.tcid ?? '')
      if (!tcid) continue
      const meta = tcOf.get(tcid)
      /* REQ 는 **TC 정본이 먼저**, 사이클에 박힌 스냅샷은 폴백 — 차례를
         정하는 orderTcIds 와 같은 눈으로 봐야 묶음과 차례가 안 갈린다 */
      const rq = reqIndex.get(String(meta?.req_id ?? it?.req_id ?? ''))
      out.push({
        tcid,
        title: String(meta?.name ?? it?.name ?? ''),
        man: normMode(String(meta?.run_type ?? meta?.kind ?? '')) === '수동',
        mg: String(meta?.model_group ?? ''),
        model: String(meta?.model ?? ''),
        type: String(meta?.type ?? ''),
        reqLabel: rq?.label ?? (it?.req_id ? String(it.req_id) : ''),
        reqTitle: rq?.title ?? '',
        folder: rq?.folder ?? '미분류',
        /* 만든 칸의 값 — **요구사항 것을 먼저 깔고 시험 항목 것으로 덮는다**.
           요구사항에 만든 칸(Key 등)은 그 아래 시험 항목이 물려받고, 같은
           이름이 양쪽에 있으면 더 가까운 시험 항목 것이 이긴다. */
        ...Object.fromEntries(
          Object.entries(rq?.custom ?? {}).map(([k, v]) => [`cf_${k}`, String(v ?? '')]),
        ),
        ...Object.fromEntries(
          Object.entries((meta as unknown as { custom?: Record<string, unknown> })?.custom ?? {}).map(
            ([k, v]) => [`cf_${k}`, String(v ?? '')],
          ),
        ),
      })
    }
    /* **담긴 차례가 곧 시험 차례**다(지시: 서버에 저장돼야 하고, 항목을
       담으면서 순서가 정해져야 한다). 이름으로 다시 세우면 요구사항 이름을
       고칠 때마다 차례가 바뀌고, 보기 설정은 사람마다 다르다.
       담을 때 폴더 ▸ REQ ▸ ID 로 세워 넣으므로 처음 모습은 예전과 같다. */
    return out
  }, [full, tcOf, reqIndex])
  /* 유형 선택지는 자료에서 뽑는다 — 담긴 값이 곧 목록이고 색은 자동 */
  /**
   * 지금 표에 보이는 차례로 **사이클 항목을 다시 세워 저장**한다(지시).
   *
   * 차례가 사이클 문서에 남으므로 서버에 저장되고, 다른 사람이 열어도 같다.
   * 거르기로 숨은 항목은 자리를 잃지 않게 **뒤에 그대로** 붙인다.
   */
  const saveOrder = async () => {
    if (!full || !shownOrder.length) return
    const rank = new Map(shownOrder.map((id, i) => [id, i]))
    const items = [...(full.items ?? [])]
    items.sort(
      (a, b) =>
        (rank.get(String(a?.tcid ?? '')) ?? 1e9) - (rank.get(String(b?.tcid ?? '')) ?? 1e9),
    )
    await saveFull({ items })
  }

  const itCols = useMemo<NCol[]>(
    () =>
      /* **한 번만 붙인다.** 열 차례·폭은 저장되는데(useNCols) 거기에 들어간
         만든 칸을 다시 붙여, 열을 한 번 옮길 때마다 같은 칸이 하나씩
         늘어났다(지적: Key 가 엄청나게 많이 생긴다). 열쇠로 걸러 낸다. */
      (() => {
        const seen = new Set<string>()
        return [
          ...itColsRaw,
          ...cfTc.map((cf) => ({
            key: `cf_${String(cf.key ?? '')}`,
            label: String(cf.label ?? ''),
            type: (String(cf.type ?? '') === 'number' ? 'number' : 'text') as NCol['type'],
            width: 96,
          })),
        ].filter((c) => {
          if (!c.key || seen.has(c.key)) return false
          seen.add(c.key)
          return true
        })
      })().map((c) =>
        c.key === 'type'
          ? {
              ...c,
              options: [...new Set(itemRows.map((r) => r.type).filter(Boolean))].map((v) => ({
                value: v,
                color: autoColor(v),
              })),
            }
          : c,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [itColsRaw, itemRows, cfTc],
  )
  const nAuto = itemRows.filter((r) => !r.man).length
  const nMan = itemRows.length - nAuto

  /** 커버리지 분모 — 이 모델(그룹)에 속한 시험 전체(담기 창과 같은 규칙) */
  const poolN = useMemo(() => {
    const m = String(plan?.model ?? '').trim()
    const g = String(plan?.model_group ?? '').trim()
    const all = tcQ.data?.tcs ?? []
    if (!m && !g) return all.length
    return all.filter((t) => {
      const tm = String(t.model ?? '').trim()
      const tg = String(t.model_group ?? '').trim()
      if (!tm && !tg) return false
      return (!!m && tm === m) || (!!g && tg === g)
    }).length
  }, [tcQ.data, plan])

  /** 실패 이력 — 이 사이클의 실행들이 남긴 결과를 항목별로 센다 */
  const failQs = useQueries({
    queries: myRuns.map((r) => ({
      queryKey: ['plan-run', r.id],
      enabled: !!open && (tab === 'run' || tab === 'itm' || tab === 'ita'),
      queryFn: async () => {
        const res = await apiFetch(`/api/plan-runs/${encodeURIComponent(r.id)}`)
        if (!res.ok) throw new Error('실행을 불러오지 못했습니다')
        return (await res.json()) as RunFull
      },
    })),
  })
  /** 일자별 판정 셈 — **방식으로 갈라서**(지시). 판정한 날은 vat 가 정본이고,
      없으면 그 실행을 뜬 날로 친다. 실행 전문은 이미 받고 있어 조회가 늘지 않는다 */
  const dayStat = useMemo(() => {
    const byMode = { auto: new Map<string, { p: number; f: number; b: number }>(), man: new Map<string, { p: number; f: number; b: number }>() }
    failQs.forEach((qr, i) => {
      const run = qr.data
      if (!run) return
      const made = String(myRuns[i]?.created_at ?? '').slice(0, 10)
      const vat = (run.vat ?? {}) as Record<string, string>
      for (const [tcid, v] of Object.entries(run.results ?? {})) {
        const l = vLetter(verds, String(v ?? ''))
        if (l === 'n') continue
        const day = String(vat[tcid] ?? '').slice(0, 10) || made
        if (!day) continue
        /* isManTc 는 아래에 선언돼 있어 여기서 못 부른다(실측: 화면이
           통째로 죽었다 — Cannot access before initialization). 같은 규칙을
           여기서 바로 본다 */
        const t2 = tcOf.get(tcid)
        const man = normMode(String(t2?.run_type ?? t2?.kind ?? '')) === '수동'
        const m = man ? byMode.man : byMode.auto
        const cur = m.get(day) ?? { p: 0, f: 0, b: 0 }
        cur[l] += 1
        m.set(day, cur)
      }
    })
    const pick = (m: Map<string, { p: number; f: number; b: number }>) =>
      [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    return { auto: pick(byMode.auto), man: pick(byMode.man) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failQs.map((q2) => q2.dataUpdatedAt).join(','), myRuns, verds, tcOf])

  /** 누적 그림에서 **며칠치를 보나**(지시: 7일·15일·한 달) */
  const [spanD, setSpanD] = useState<number>(() => {
    const v = Number(prefGet('utop.cyc.span') ?? 7)
    return v === 15 || v === 30 ? v : 7
  })

  /** 커버리지 — 그날까지 **판정한 항목 누적**을 자동·수동으로 나눠 본다(지시) */
  const covCum = useMemo(() => {
    const days = [...new Set([...dayStat.auto.map(([d]) => d), ...dayStat.man.map(([d]) => d)])].sort()
    const sum = (v: { p: number; f: number; b: number }) => v.p + v.f + v.b
    const A = new Map(dayStat.auto)
    const M = new Map(dayStat.man)
    let a = 0
    let m = 0
    return days.map((d) => {
      a += sum(A.get(d) ?? { p: 0, f: 0, b: 0 })
      m += sum(M.get(d) ?? { p: 0, f: 0, b: 0 })
      return [d, { p: a, f: m, b: 0 }] as [string, { p: number; f: number; b: number }]
    })
  }, [dayStat])

  /** 고른 기간을 **날마다 채워서** 준다(지적: 7일을 눌러도 9/11 하루만 나온다).
   *
   *  기록이 있는 날만 그리면 축이 하루짜리가 된다. 누적 그림이므로 **없는
   *  날은 직전 값을 잇는다** — 그래야 7일·15일·한 달이 정말 그 폭으로 보인다.
   *  기간 시작보다 앞선 기록은 시작값으로 접어 넣는다. */
  const covCumSpan = useMemo(() => {
    type Pt = { p: number; f: number; b: number }
    const dayMs = 86400000
    const endTxt = covCum.length ? covCum[covCum.length - 1]![0] : ''
    const end = Date.parse(`${endTxt}T00:00:00Z`)
    if (!Number.isFinite(end)) return covCum
    const from = end - (spanD - 1) * dayMs
    const M = new Map(covCum)
    /* 기간 시작 이전의 마지막 누적 — 첫날이 0 에서 시작하면 안 된다 */
    let last: Pt = { p: 0, f: 0, b: 0 }
    for (const [d, v] of covCum) {
      const t = Date.parse(`${d}T00:00:00Z`)
      if (Number.isFinite(t) && t < from) last = v
      else break
    }
    const out: Array<[string, Pt]> = []
    for (let t = from; t <= end; t += dayMs) {
      const d = new Date(t).toISOString().slice(0, 10)
      const v = M.get(d)
      if (v) last = v
      out.push([d, last])
    }
    return out
  }, [covCum, spanD])

  const failStat = useMemo(() => {
    const m = new Map<string, { fail: number; ran: number }>()
    for (const qr of failQs) {
      for (const [tcid, v] of Object.entries(qr.data?.results ?? {})) {
        const g = vGroup(verds, String(v ?? ''))
        if (g === 'none') continue
        const s = m.get(tcid) ?? { fail: 0, ran: 0 }
        s.ran++
        if (g === 'fail') s.fail++
        m.set(tcid, s)
      }
    }
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failQs.map((q2) => q2.dataUpdatedAt).join(','), verds])

  /** 전문을 통째로 고쳐 저장한다 — 서버는 data 를 통으로 받는다 */
  async function saveFull(patch: Partial<PlanFull>) {
    if (!full) return
    const body = { ...full, ...patch, updated_by: meName }
    const r = await apiFetch(`/api/cycle/${encodeURIComponent(open)}`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    if (!r.ok) {
      window.alert('저장하지 못했습니다')
      return
    }
    await qc.invalidateQueries({ queryKey: ['cycle-full', open] })
    await qc.invalidateQueries({ queryKey: ['cycles'] })
  }

  /** 초안에 담기 — 원래 값과 같아지면 그 칸은 도로 뺀다(무변경 저장 방지) */
  function stage(patch: Partial<PlanFull>) {
    setDraft((d) => {
      const nd: Record<string, unknown> = { ...d }
      const base = (full ?? plan ?? {}) as Record<string, unknown>
      for (const [k, v] of Object.entries(patch)) {
        if (typeof v === 'string' && String(base[k] ?? '') === v) delete nd[k]
        else nd[k] = v
      }
      return nd as Partial<PlanFull>
    })
  }

  /** 초안 → 저장 — 저장 단추가 부른다 */
  async function saveDraft() {
    if (!plan || !dirty || savingMeta) return
    const patch: Partial<PlanFull> = { ...draft }
    if (typeof patch.name === 'string' && !patch.name.trim()) delete patch.name
    if (typeof patch.version === 'string') patch.version = patch.version.trim()
    setSavingMeta(true)
    try {
      await saveFull(patch)
      const vg = typeof patch.version_group === 'string' ? patch.version_group : ''
      const mdl = String(patch.model ?? plan.model ?? '')
      if (vg && mdl) {
        /* 버전그룹은 그 모델의 폴더 목록에도 넣는다 — 트리와 한 살림 */
        await apiFetch('/api/cycle-version-groups/add', {
          method: 'POST',
          body: JSON.stringify({ model: mdl, group: vg }),
        }).catch(() => undefined)
        void vgQ.refetch()
      }
      setDraft({})
    } finally {
      setSavingMeta(false)
    }
  }

  /* 대상 드롭다운이 부르는 것들 — 개요에서 바로 고친다(지시) */
  const catGroups = useMemo(
    () =>
      [...new Set(((catQ.data?.items ?? []) as Array<Record<string, unknown>>)
        .filter((x) => String(x.kind) === 'group')
        .map((x) => String(x.name ?? '')))].filter(Boolean).sort(cmp),
    [catQ.data, cmp],
  )
  const catModels = useMemo(
    () =>
      [...new Set(((catQ.data?.items ?? []) as Array<Record<string, unknown>>)
        .filter((x) => String(x.kind) === 'model' && String(x.model_group ?? '') === String(draft.model_group ?? plan?.model_group ?? ''))
        .map((x) => String(x.name ?? '')))].filter(Boolean).sort(cmp),
    [catQ.data, plan, draft, cmp],
  )
  const vgOfModel = useMemo(
    () => (vgQ.data?.groups ?? {})[String(draft.model ?? plan?.model ?? '')] ?? [],
    [vgQ.data, plan, draft],
  )

  /** 모델그룹·모델명 바꾸기 — 초안에 담는다(지시: 수동 저장).
      모델이 달라지면 담긴 항목은 저장할 때 비워진다 — 미리 물어본다 */
  function setTarget(mg: string, model: string) {
    if (!full || !plan) return
    const curModel = String((draft.model as string | undefined) ?? plan.model ?? '')
    let nextModel = model
    if (!nextModel) {
      const ms = ((catQ.data?.items ?? []) as Array<Record<string, unknown>>)
        .filter((x) => String(x.kind) === 'model' && String(x.model_group ?? '') === mg)
        .map((x) => String(x.name ?? ''))
      nextModel = ms.includes(curModel) ? curModel : (ms[0] ?? '')
    }
    const modelChanged = nextModel !== String(plan.model ?? '')
    const n = (full.items ?? []).length
    if (modelChanged && n) {
      if (
        !window.confirm(
          `대상 모델을 ${nextModel || '(없음)'} 로 바꾸면 저장할 때 담긴 시험 항목 ${n}건이 비워집니다.\n` +
            '항목은 모델그룹·모델명 규칙으로 담긴 것이라 그대로 둘 수 없습니다.\n계속할까요?',
        )
      )
        return
    }
    setDraft((d) => {
      /* 모델을 되돌리면 항목 비우기도 같이 무른다 */
      const nd: Partial<PlanFull> = { ...d, model_group: mg, model: nextModel }
      if (modelChanged && n) nd.items = []
      else delete nd.items
      if (String(full.model_group ?? '') === mg) delete nd.model_group
      if (String(full.model ?? '') === nextModel) delete nd.model
      return nd
    })
  }

  /** 버전그룹 바꾸기 — 초안에 담고, 저장할 때 폴더 목록에도 넣는다 */
  function setVg(vg: string) {
    stage({ version_group: vg })
  }

  async function dropCycleItems(ids: string[]) {
    if (!full || !ids.length) return
    if (
      !window.confirm(
        `시험 항목 ${ids.length}건을 이 사이클에서 제거합니다.\n이미 뜬 실행은 그대로입니다.`,
      )
    )
      return
    const gone = new Set(ids)
    await saveFull({ items: (full.items ?? []).filter((it) => !gone.has(String(it?.tcid ?? ''))) })
  }

  /* ══ 실행 탭 — 옛 Runs 화면의 심장을 그대로 들여왔다 ══ */

  /** 이 시험이 수동인가 — 정본은 TC 의 run_type(팀이 바꾼 「M」 도 알아듣는다) */
  const isManTc = (tcid: string) => {
    const t = tcOf.get(tcid)
    return normMode(String(t?.run_type ?? t?.kind ?? '')) === '수동'
  }

  const runFullQ = useQuery({
    queryKey: ['plan-run', selRun],
    enabled: !!selRun,
    queryFn: async () => {
      const r = await apiFetch(`/api/plan-runs/${encodeURIComponent(selRun)}`)
      if (!r.ok) throw new Error('실행을 불러오지 못했습니다')
      return (await r.json()) as RunFullX
    },
  })
  const runFull = runFullQ.data
  const runLite = runs.find((r) => r.id === selRun)

  const openRun = (id: string) => {
    setSelRun(id)
    prefSet('utop.runs.open', id)
  }
  /* 상세가 다른 사이클로 바뀌면 — 실행 선택을 그 사이클의 최신으로 맞추고
     실행기·필터를 접는다 */
  useEffect(() => {
    setRunnerOn(false)
    setWide(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  useEffect(() => {
    if (!open) return
    /* **목록이 아직 안 왔으면 아무것도 안 한다.**
       예전엔 로딩 중(myRuns 가 빈 배열)에도 이 줄이 돌아, 계정에 남겨 둔
       실행(utop.runs.open)을 지우고 목록이 온 뒤 맨 앞 것으로 바꿔 버렸다
       — 보던 실행이 아닌 엉뚱한 실행이 열렸다(실측). */
    if (!runsQ.isSuccess) return
    if (selRun && myRuns.some((r) => r.id === selRun)) return
    const first = myRuns[0]?.id ?? ''
    setSelRun(first)
    if (first) prefSet('utop.runs.open', first)
    else prefRemove('utop.runs.open')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, myRuns, runsQ.isSuccess])




  /** 실행을 뜬다 — 담긴 항목 전부. 시험을 시작할 때 속에서만 부른다 */
  async function makeRun(p: CycleMeta): Promise<string | null> {
    /*
     * **사이클에 담긴 차례 그대로 돈다**(지시).
     *
     * 차례는 사이클 문서에 있으므로 **서버에 남고 누가 열어도 같다**. 바꾸려면
     * 표에서 정렬한 뒤 「이 차례로 저장」 을 누른다 — 그때 이 배열이 다시
     * 세워진다.
     */
    const ids = (p.items ?? []).map((it) => String(it?.tcid ?? '')).filter(Boolean)
    if (!ids.length) {
      window.alert('담긴 시험 항목이 없습니다 — 시험 항목 탭에서 먼저 담으세요.')
      return null
    }
    try {
      const r = await apiFetch('/api/plan-runs', {
        method: 'POST',
        body: JSON.stringify({
          plan_id: p.id,
          model: p.model ?? '',
          model_group: p.model_group ?? '',
          version: p.version ?? p.name ?? '',
          version_group: p.version_group ?? '',
          owner: p.assignee ?? meName,
          items: ids.map((tcid) => ({ tcid })),
          results: Object.fromEntries(ids.map((tcid) => [tcid, ''])),
        }),
      })
      if (!r.ok) throw new Error('실행을 만들지 못했습니다')
      const j = (await r.json()) as { id?: string }
      await runsQ.refetch()
      if (j.id) openRun(j.id)
      return j.id ?? null
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e))
      return null
    }
  }

  /** 실행기를 연다 — 그 방식의 항목만, 표에 보이는 차례로 */
  async function openRunner(mode: 'A' | 'M', focus = '') {
    /* 실행이 하나도 없으면 **여기서 뜬다**(지시: 만들기 단추를 걷었다) —
       시험을 시작하는 순간이 곧 실행이 생기는 순간이다 */
    if (!myRuns.length && plan) {
      const made = await makeRun(plan)
      if (!made) return
    }
    setRunMode(mode)
    /* 체크한 것이 있으면 **그것만** 돈다(승인: iTest 처럼 몇 개만) */
    setRunPick(picked)
    setRunFocus(focus)
    setRunnerOn(true)
    /* 3열에 끼워 넣으면 실행기가 화면의 3분의 1을 받아 스텝 표가 설 자리가
       없다(지적). 시험하는 동안은 **화면을 통째로** 쓰고, 「← 돌아가기」 로
       나온다 — Azure·Zephyr·qTest 도 실행은 제 화면에서 돈다 */
    setWide(true)
  }

  /* 실행 본문의 항목 줄 — 차례는 orderTcIds 한 곳이 정한다 */
  interface RunItemRow {
    tcid: string
    title: string
    man: boolean
    folder: string
    v: string
    who: string
  }
  const runItems = useMemo<RunItemRow[]>(() => {
    if (!runFull) return []
    /* **사이클에 담긴 것도 센다**(지적: Manual 탭인데 자동 항목만 나온다).
       실행을 만든 뒤에 담은 항목 — 특히 수동 — 은 실행 스냅샷에 없다.
       그것만 보면 수동 목록이 비고, 빈 목록은 아래에서 다시 전체로 떨어져
       자동 62 건이 나왔다. */
    const ids = [
      ...new Set([
        ...((plan?.items ?? []) as Array<{ tcid?: string }>).map((x) => String(x?.tcid ?? '')),
        ...(runFull.items ?? []).map((x) => String(x?.tcid ?? '')),
        ...Object.keys(runFull.results ?? {}),
      ]),
    ].filter(Boolean)
    const list = orderTcIds(ids.length ? ids : Object.keys(runFull.results ?? {}), tcOf, reqIndex)
    const asg = runFull.assignees ?? {}
    return list.map((tcid) => {
      const meta = tcOf.get(tcid)
      const rq = reqIndex.get(String(meta?.req_id ?? ''))
      return {
        tcid,
        title: String(meta?.name ?? ''),
        man: isManTc(tcid),
        folder: rq?.folder ?? '미분류',
        /* 셋업 판정 값 그대로 — 옛 네 글자(p/f/b/n)만 값으로 통역한다 */
        v: vDef(verds, String((runFull.results ?? {})[tcid] ?? '')).v,
        who: String(asg[tcid] ?? ''),
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runFull, plan, tcOf, reqIndex, verds])

  /* ── 그리기 ── */
  const kv = (k: string, v: React.ReactNode) => (
    <>
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </>
  )


  /** 이 폴더 범위의 사이클들 */
  const plansInScope = (t: 'cust' | 'model' | 'vg', k: string) =>
    plans.filter((p) => {
      const cust = String(p.customer || '미지정')
      const model = String(p.model || '미지정')
      const vg = String(p.version_group || '미지정')
      if (t === 'cust') return cust === k
      if (t === 'model') return keyOf(cust, model) === k
      return keyOf(cust, model, vg) === k
    })

  /** 버전그룹 폴더 이름 바꾸기 — 담긴 사이클을 전부 새 이름으로 옮긴다 */
  async function renameVg(k: string) {
    const parts = k.split('|')
    const model = parts[1] ?? ''
    const oldVg = parts[2] ?? ''
    const list = plansInScope('vg', k)
    const nv = window.prompt(
      `버전그룹 이름 바꾸기 — 담긴 사이클 ${list.length}건이 함께 옮겨집니다.`,
      oldVg === '미지정' ? '' : oldVg,
    )
    if (nv === null) return
    const v = nv.trim()
    if (!v || v === oldVg) return
    for (const p of list) {
      const r = await apiFetch(`/api/cycle/${encodeURIComponent(p.id)}`)
      if (!r.ok) continue
      const d = (await r.json()) as PlanFull
      await apiFetch(`/api/cycle/${encodeURIComponent(p.id)}`, {
        method: 'POST',
        body: JSON.stringify({ ...d, version_group: v, updated_by: meName }),
      })
    }
    if (model && model !== '미지정') {
      await apiFetch('/api/cycle-version-groups/add', {
        method: 'POST',
        body: JSON.stringify({ model, group: v }),
      }).catch(() => undefined)
      if (oldVg && oldVg !== '미지정')
        await apiFetch(
          `/api/cycle-version-groups/${encodeURIComponent(model)}/${encodeURIComponent(oldVg)}`,
          { method: 'DELETE' },
        ).catch(() => undefined)
    }
    await saveFolderPaths(
      folderPathsRaw.map((x) =>
        x.customer === (parts[0] ?? '') && (x.model ?? '') === model && (x.version_group ?? '') === oldVg
          ? { ...x, version_group: v }
          : x,
      ),
    )
    if (grpSel?.t === 'vg' && grpSel.k === k) setGrpSel({ t: 'vg', k: keyOf(parts[0] ?? '', model, v) })
    void plansQ.refetch()
    void vgQ.refetch()
    void qc.invalidateQueries({ queryKey: ['cycle-version-groups'] })
  }

  /** 폴더 지우기 — 담긴 사이클·실행째. 폴더 실체(paths)도 걷는다 */
  async function delFolder(t: 'cust' | 'model' | 'vg', k: string) {
    const parts = k.split('|')
    const list = plansInScope(t, k)
    let runN = 0
    for (const p of list) runN += (runsByPlan.get(p.id) ?? []).length
    const label = parts[parts.length - 1] || ''
    if (
      !window.confirm(
        `폴더 「${label}」 을 지웁니다.` +
          (list.length
            ? `\n담긴 사이클 ${list.length}건${runN ? `과 실행 ${runN}건·판정 결과` : ''}이 함께 사라집니다. 되돌릴 수 없습니다.`
            : '\n빈 폴더입니다.'),
      )
    )
      return
    if (list.length) await reallyDelPlans(list.map((p) => p.id))
    /* 폴더 실체 걷기 — 이 경로와 그 아래 전부 */
    const c = parts[0] ?? ''
    const m = parts[1]
    const v = parts[2]
    const keep = folderPathsRaw.filter((x) => {
      if (x.customer !== c) return true
      if (t === 'cust') return false
      if ((x.model ?? '') !== (m ?? '')) return true
      if (t === 'model') return false
      return (x.version_group ?? '') !== (v ?? '')
    })
    await saveFolderPaths(keep)
    /* 버전그룹 등록부도 걷는다(비었을 때만 지워지는 기존 규칙) */
    if (t === 'vg' && m && v && m !== '미지정' && v !== '미지정')
      await apiFetch(
        `/api/cycle-version-groups/${encodeURIComponent(m)}/${encodeURIComponent(v)}`,
        { method: 'DELETE' },
      ).catch(() => undefined)
    if (grpSel && grpSel.k.startsWith(k)) setGrpSel(null)
    void plansQ.refetch()
    void vgQ.refetch()
  }

  /** 사업자 폴더 이름 바꾸기 — 담긴 사이클의 사업자를 일괄로 옮긴다 */
  async function renameCustomer(k: string) {
    const oldC = k.split('|')[0] ?? ''
    const list = plansInScope('cust', k)
    const nv = window.prompt(
      `사업자 이름 바꾸기 — 담긴 사이클 ${list.length}건이 함께 옮겨집니다.`,
      oldC === '미지정' ? '' : oldC,
    )
    if (nv === null) return
    const v = nv.trim()
    if (!v || v === oldC) return
    for (const p of list) {
      const r = await apiFetch(`/api/cycle/${encodeURIComponent(p.id)}`)
      if (!r.ok) continue
      const d = (await r.json()) as PlanFull
      await apiFetch(`/api/cycle/${encodeURIComponent(p.id)}`, {
        method: 'POST',
        body: JSON.stringify({ ...d, customer: v, updated_by: meName }),
      })
    }
    await saveFolderPaths(folderPathsRaw.map((x) => (x.customer === oldC ? { ...x, customer: v } : x)))
    if (grpSel?.t === 'cust' && grpSel.k === k) setGrpSel({ t: 'cust', k: v })
    void plansQ.refetch()
  }

  /* ── 1열: 사이클 트리 ── */
  function renderSide() {
    return (
      <section className="panel run-side">
        <div className="run-side-hd">
          <b>Cycles</b>
          <span className="cu-sp" />
          <button
            type="button"
            className="btn small"
            title="트리 보기 — 폴더만 / 폴더＋버전명"
            aria-haspopup="menu"
            onClick={(e) => {
              const rc = (e.currentTarget as HTMLElement).getBoundingClientRect()
              setTreeModeAt({ x: rc.left, y: rc.bottom + 4 })
            }}
          >
            ⋯
          </button>
          {/* 위 ＋는 **폴더**를 만든다(승인) — 사업자 ▸ 제품명 ▸ 버전그룹.
              사이클은 버전그룹 ⋯ 나 목록의 ＋사이클로 만든다. */}
          <button
            type="button"
            className="cu-new small"
            title="폴더를 만듭니다 — 사업자 ▸ 제품명 ▸ 버전그룹 (뒤 단계는 비워도 됩니다)"
            onClick={() => {
              setNeedMake(true)
              setFolderDlg({ customer: '', customerNew: '', model: '', vg: '', vgNew: '' })
            }}
          >
            <i aria-hidden="true">＋</i>폴더
          </button>
        </div>
        <div className="run-side-bar">
          <input
            className="inp"
            placeholder="사이클 · 버전 · 모델 찾기"
            value={treeQ}
            onChange={(e) => setTreeQ(e.target.value)}
          />
        </div>
        <div className="cu-tbody">
          {treeRows.length > 1 ? (
            treeRows.map((n) => (
              <div
                key={n.key}
                className={`cu-n d${Math.max(1, n.d)}${n.on ? ' on' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (n.plan) {
                    setGrpSel(null)
                    openPlanId(n.plan.id)
                  } else if (n.key === '__all') {
                    setGrpSel(null)
                    if (open) closePlan()
                  } else if (n.d === 1) {
                    setGrpSel({ t: 'cust', k: n.key })
                    if (open) closePlan()
                  } else if (n.d === 2) {
                    setGrpSel({ t: 'model', k: n.key })
                    if (open) closePlan()
                  } else {
                    setGrpSel({ t: 'vg', k: n.key })
                    if (open) closePlan()
                  }
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLElement).click()}
              >
                {n.caret ? (
                  <button
                    type="button"
                    className={`cu-caret${n.open ? ' open' : ''}`}
                    aria-expanded={n.open}
                    title="접기 · 펴기"
                    onClick={(e) => {
                      e.stopPropagation()
                      setClosed((cur) => {
                        const next = new Set(cur)
                        if (next.has(n.key)) next.delete(n.key)
                        else next.add(n.key)
                        return next
                      })
                    }}
                  >
                    <IconChevron />
                  </button>
                ) : (
                  <span className="cu-caret none" aria-hidden="true" />
                )}
                <span className="nm">
                  {n.ico ? `${n.ico} ` : ''}
                  {n.label}
                  {/* 개수는 이름 바로 오른쪽에(지시: REQ-Coverage 꼴) —
                      폴더는 사이클 수, 잎은 실행 횟수라 잎엔 「회」 를 붙인다 */}
                  <span className={`cnt${n.zero ? ' zero' : ''}`} title={n.plan ? `실행 ${n.n}회` : `사이클 ${n.n}건`}>
                    ({n.plan ? `${n.n}회` : n.n})
                  </span>
                </span>
                {!n.plan && n.key !== '__all' && (
                  <button
                    type="button"
                    className="cu-nbtn"
                    title="폴더 일들"
                    onClick={(e) => {
                      e.stopPropagation()
                      const rc = (e.currentTarget as HTMLElement).getBoundingClientRect()
                      setFolderMenu({
                        x: Math.max(8, rc.right - 176),
                        y: rc.bottom + 2,
                        t: n.d === 1 ? 'cust' : n.d === 2 ? 'model' : 'vg',
                        k: n.key,
                      })
                    }}
                  >
                    ⋯
                  </button>
                )}
                {!!n.plan && (
                  <button
                    type="button"
                    className="cu-nbtn del"
                    title="사이클 지우기"
                    onClick={(e) => {
                      e.stopPropagation()
                      void delPlans([n.plan!.id])
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))
          ) : (
            <div className="cu-empty" style={{ padding: '16px 0' }}>
              <strong>{plansQ.isLoading ? '불러오는 중…' : '아직 사이클이 없습니다'}</strong>
              <span>위 ＋ 사이클로 시작하세요.</span>
            </div>
          )}
        </div>
        <div className="cu-rzslot">
          <Resizer
            label="목록 열 너비 조절"
            onResize={setW1}
            getOrigin={() => gridRef.current?.getBoundingClientRect().left ?? 0}
          />
        </div>
      </section>
    )
  }

  /** 판 여닫이 — 2열 왼쪽 위, REQ-Coverage 와 한 꼴 */
  const colBtn = (
    <button
      type="button"
      className="cu-colbtn"
      title={sideOn ? '목록 판 접기' : '목록 판 펴기'}
      onClick={() => setSideOn((v) => !v)}
    >
      <IconPanel open={!sideOn} />
    </button>
  )

  /* ── 목록 화면 ── */
  /**
   * 목록 — **노션 표**(지시). 검색·거르기·정렬·묶기·열 폭이 상세의 항목
   * 표·REQ-Coverage 와 한 벌이다. 담당은 칸에서 바로 바꾼다(전문을 읽어
   * 통째로 되민다 — 서버 계약). 줄 일들(복제·CSV·지우기)은 줄 ⋯ 대신
   * 선택 바(삭제)와 목록 위 ＋ 사이클, ID 열기로 잇는다.
   */
  function renderList() {
    const listRows: NRow[] = scopedRows.map((p) => {
      const rs = runsByPlan.get(p.id) ?? []
      const openRunN = rs.filter((r) => !r.closed_at).length
      const last = rs
        .slice()
        .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))[0]
      const t = sumRuns(rs)
      return {
        __id: p.id,
        id: String(p.cid ?? p.id),
        title: String(p.name ?? p.version ?? ''),
        vg: String(p.version_group ?? ''),
        customer: String(p.customer ?? ''),
        mg: String(p.model_group ?? ''),
        model: String(p.model ?? ''),
        items: String(p._item_count ?? p.items?.length ?? 0),
        /* 결함 — 항목에 달린 결함 수의 합(레거시 플랜 표와 같은 셈) */
        iss: String((p.items ?? []).reduce((n2, it) => n2 + (it.issues?.length ?? 0), 0)),
        runs: rs.length ? `${rs.length}회${openRunN ? ` (진행 ${openRunN})` : ''}` : '',
        last: last ? `${String(last.name || last.id)} · ${ago(last.created_at)}` : '',
        stat: t.total ? `통과 ${t.pass} · 실패 ${t.fail} · 미실행 ${t.none}` : '',
        assignee: String(p.assignee ?? ''),
        created: String(p._created_at_pg ?? '').slice(0, 10),
      }
    })
    return (
      <section className="panel lp">
        <div className="run-crumb">
          {colBtn}
          {/* 빵부스러기 — REQ-Coverage 와 같은 꼴(지시): / 구분, 트리와
              같은 그림(🏢 사업자 · 📦 제품 · 🔖 버전그룹), 마지막은 굵게 */}
          <span className="cyb-crumb">
            <button type="button" className={`crumbgo${crumb.length ? '' : ' last'}`} onClick={() => setGrpSel(null)}>
              전체
            </button>
            {crumb.map(([k, l], i) => (
              <span className="crumbi" key={k}>
                <i className="csep">/</i>
                <span className="cfico" aria-hidden="true">{i === 0 ? '🏢' : i === 1 ? '📦' : '🔖'}</span>
                <button
                  type="button"
                  className={`crumbgo${i === crumb.length - 1 ? ' last' : ''}`}
                  onClick={() => pickCrumb(k)}
                >
                  {l}
                </button>
              </span>
            ))}
          </span>
          <span className="cu-sp" />
          <button
            type="button"
            className="cu-new"
            title="사이클을 만듭니다 — 트리에서 고른 사업자·제품명·버전그룹이 미리 채워집니다"
            onClick={() => {
              const parts = grpSel ? grpSel.k.split('|') : []
              setMkSeed(
                grpSel
                  ? {
                      customer: parts[0] ?? '',
                      model: parts[1] ?? '',
                      version_group: parts[2] ?? '',
                    }
                  : null,
              )
              setMaking(true)
            }}
          >
            <i aria-hidden="true">＋</i>사이클
          </button>
        </div>
        <div className="cyb-ntb">
          <NTable
            columns={lsCols}
            rows={listRows}
            view={lsView}
            onView={setLsView}
            onColumns={setLsCols}
            people={people}
            meName={meName}
            onCell={(rowId, key, v) => {
              if (key === 'assignee') void saveAssigneeOf(rowId, v)
            }}
            readOnlyKeys={['id', 'title', 'vg', 'customer', 'mg', 'model', 'items', 'iss', 'runs', 'last', 'stat', 'created']}
            lockDefs
            idKey="id"
            titleKey="title"
            onOpen={(id) => openPlanId(id)}
            /* 「실행 만들기」 를 걷었다(지시) — 시험을 시작하는 순간이 곧
               실행이 생기는 순간이라, 미리 만들어 두는 단추는 쓸 일이 없다.
               「CSV」 는 이름과 함께 **파일도 엑셀**로 바꿨다. */
            bulk={[
              { k: 'clone', label: '복제' },
              { k: 'edit', label: '고치기' },
              { k: 'csv', label: '엑셀' },
              { k: 'del', label: '삭제', danger: true },
            ]}
            onBulk={(a, ids) => {
              const one = ids.length === 1 ? ids[0] : undefined
              if (a === 'del') {
                void delPlans(ids)
                return
              }
              if (!one) {
                window.alert('이 일은 한 건씩 합니다 — 하나만 골라 주세요.')
                return
              }
              if (a === 'clone') setCloneId(one)
              else if (a === 'edit') {
                openPlanId(one)
                setEdit(true)
              } else if (a === 'csv') void xlsxPlan(one)
            }}
            renderCell={(row, col) => {
              if (col.key === 'stat') {
                const rs = runsByPlan.get(String(row.__id)) ?? []
                const t = sumRuns(rs)
                return t.total ? <StatBar t={t} pal={verdPal} slim /> : <span className="cu-m">—</span>
              }
              if (col.key === 'runs' && !row.runs) return <span className="cu-m">—</span>
              if (col.key === 'last' && !row.last) return <span className="cu-m">—</span>
              return undefined
            }}
          perPage={100}
          />
        </div>
      </section>
    )
  }

  /** 목록 칸에서 담당 바꾸기 — 서버는 전문을 통으로 받으니 읽어서 되민다 */
  async function saveAssigneeOf(planId: string, who: string) {
    const r = await apiFetch(`/api/cycle/${encodeURIComponent(planId)}`)
    if (!r.ok) {
      window.alert('사이클을 불러오지 못했습니다')
      return
    }
    const d = (await r.json()) as PlanFull
    const w = await apiFetch(`/api/cycle/${encodeURIComponent(planId)}`, {
      method: 'POST',
      body: JSON.stringify({ ...d, assignee: who, updated_by: meName }),
    })
    if (!w.ok) {
      window.alert('저장하지 못했습니다')
      return
    }
    void plansQ.refetch()
  }

  /* ── 상세: Info — 대상 · 사이클 · 구성 · 사람·이력 · 설명 (지시: 탭 재편) ── */
  function renderInfo() {
    if (!plan) return null
    const reqN = new Set(itemRows.map((r) => r.reqLabel).filter(Boolean)).size
    /* 초안 우선 값 — 고친 것이 화면에 바로 보여야 저장 단추의 뜻이 선다 */
    const pv = (k: string) =>
      String((draft as Record<string, unknown>)[k] ?? (plan as unknown as Record<string, unknown>)[k] ?? '')
    const catRows = (catQ.data?.items ?? []) as Array<Record<string, unknown>>
    const custsAll = [...new Set([
      ...catRows.filter((x) => String(x.kind) === 'operator').map((x) => String(x.name ?? '')),
      ...((codesQ.data?.items ?? []).filter((x) => x.kind === 'cycle_customer').map((x) => String(x.value ?? ''))),
      ...plans.map((p2) => String(p2.customer || '')),
    ])].filter(Boolean).sort(cmp)
    const famsAll = [...new Set(catRows.filter((x) => String(x.kind) === 'family').map((x) => String(x.name ?? '')))]
      .filter(Boolean).sort(cmp)
    return (
      <div className="cu-scroll">
        <div className="cu-sec cyb-inforow">
          <div className="cyb-infocol">
          <div className="cu-card metacard">
            <h2>기본 정보</h2>
            <div className="pad">
              <div className="kv1">
                {kv(
                  '사업자',
                  <select className="kvin" value={pv('customer')} onChange={(e) => stage({ customer: e.target.value })}>
                    {!custsAll.includes(pv('customer')) && (
                      <option value={pv('customer')}>{pv('customer') || '(안 고름)'}</option>
                    )}
                    {custsAll.map((c2) => (
                      <option key={c2} value={c2}>{c2}</option>
                    ))}
                  </select>,
                )}
                {kv(
                  '제품군',
                  <select className="kvin" value={pv('family')} onChange={(e) => stage({ family: e.target.value })}>
                    {!famsAll.includes(pv('family')) && (
                      <option value={pv('family')}>{pv('family') || '(안 고름)'}</option>
                    )}
                    {famsAll.map((f2) => (
                      <option key={f2} value={f2}>{f2}</option>
                    ))}
                  </select>,
                )}
                {kv(
                  '모델그룹',
                  <select
                    className="kvin cu-mono"
                    value={pv('model_group')}
                    onChange={(e) => setTarget(e.target.value, '')}
                  >
                    {!catGroups.includes(pv('model_group')) && (
                      <option value={pv('model_group')}>{pv('model_group') || '(안 고름)'}</option>
                    )}
                    {catGroups.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>,
                )}
                {kv(
                  '모델명',
                  <select
                    className="kvin"
                    value={pv('model')}
                    onChange={(e) => setTarget(pv('model_group'), e.target.value)}
                  >
                    {!catModels.includes(pv('model')) && (
                      <option value={pv('model')}>{pv('model') || '(안 고름)'}</option>
                    )}
                    {catModels.map((m2) => (
                      <option key={m2} value={m2}>{m2}</option>
                    ))}
                  </select>,
                )}
                {kv(
                  '버전그룹',
                  <select
                    className="kvin cu-mono"
                    value={pv('version_group')}
                    onChange={(e) => setVg(e.target.value)}
                  >
                    {!vgOfModel.includes(pv('version_group')) && (
                      <option value={pv('version_group')}>{pv('version_group') || '(안 고름)'}</option>
                    )}
                    {vgOfModel.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>,
                )}
                {kv('사이클 ID', <span className="kvin cu-mono kvro">{String(plan.cid ?? plan.id)}</span>)}
                {kv(
                  '버전명',
                  <input
                    className="kvin cu-mono"
                    value={pv('version')}
                    onChange={(e) => stage({ version: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
                  />,
                )}
              </div>
            </div>
          </div>
          <div className="cu-card metacard">
            <h2>시험 정보</h2>
            <div className="pad">
              <div className="kv1">
                {kv(
                  '담당자',
                  <button
                    type="button"
                    className="kvin cyb-ass"
                    onClick={(e) => {
                      const r2 = (e.currentTarget as HTMLElement).getBoundingClientRect()
                      setAssAt({ x: r2.left, y: r2.bottom + 4 })
                    }}
                  >
                    {String(plan.assignee ?? '') || <span className="cu-m">(안 정함)</span>}
                  </button>,
                )}
                {kv(
                  '시험 기간',
                  <span className="cyb-period">
                    <input
                      type="date"
                      value={pv('period_start')}
                      onChange={(e) => stage({ period_start: e.target.value })}
                      title="시작일 — 누르면 달력이 뜹니다"
                    />
                    <i>~</i>
                    <input
                      type="date"
                      value={pv('period_end')}
                      onChange={(e) => stage({ period_end: e.target.value })}
                      title="종료일 — 누르면 달력이 뜹니다"
                    />
                  </span>,
                )}
                {kv('요구사항', <>{reqN}건</>)}
                {kv(
                  '전체 항목',
                  <>
                    {itemRows.length}건 <span className="cu-m">(자동 {nAuto} · 수동 {nMan})</span>
                  </>,
                )}
                {kv(
                  '수동 항목',
                  <>
                    {nMan}건{' '}
                    <span className="cu-m">
                      (요구사항 {new Set(itemRows.filter((r) => r.man).map((r) => r.reqLabel).filter(Boolean)).size}건)
                    </span>
                  </>,
                )}
                {kv(
                  '자동 항목',
                  <>
                    {nAuto}건{' '}
                    <span className="cu-m">
                      (요구사항 {new Set(itemRows.filter((r) => !r.man).map((r) => r.reqLabel).filter(Boolean)).size}건)
                    </span>
                  </>,
                )}
              </div>
            </div>
          </div>
          <div className="cu-card metacard">
            <h2>이력</h2>
            <div className="pad">
              <div className="kv1">
                {kv('생성자', String(plan.created_by ?? '') || '—')}
                {kv('수정자', String(full?.updated_by ?? (plan as unknown as Record<string, unknown>).updated_by ?? '') || '—')}
                {kv(
                  '생성일자',
                  <>
                    {String(plan._created_at_pg ?? '').slice(0, 10) || '—'}{' '}
                    <span className="cu-m">{ago(plan._created_at_pg)}</span>
                  </>,
                )}
                {kv(
                  '수정일자',
                  <>
                    {String(plan._updated_at_pg ?? '').slice(0, 10) || '—'}{' '}
                    <span className="cu-m">{ago(plan._updated_at_pg)}</span>
                  </>,
                )}
              </div>
            </div>
          </div>
          </div>
          <div className="cu-card cyb-desccard">
            <h2>설명</h2>
            <div className="pad cyb-descbody">
              {/* 위키와 같은 블록 노트 — 편집 단추 없이 바로 친다(지시).
                  고친 것은 초안에 담기고 머리의 저장 단추가 실어 보낸다 */}
              <DescNote
                key={open}
                doc={(draft.description_doc ?? full?.description_doc) as unknown}
                text={pv('description')}
                editable
                onChange={(d, md) => stage({ description_doc: d, description: md })}
              />
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ── 상세: 시험 항목 ── */
  /**
   * 시험 항목 탭 — **노션 표**(지시: REQ-Coverage 와 같은 표).
   *
   * 손수 그린 표를 걷고 공용 NTable 을 얹는다 — 검색·거르기·정렬·묶기·
   * 열 폭·계산 줄이 저쪽과 한 벌이 된다. 값은 TC(REQ-Coverage)가 정본이라
   * 칸은 못 고친다. 기본 묶기는 폴더 — 옛 표의 폴더 ▸ REQ 층 중 위층이다.
   */
  function renderItems(man: boolean) {
    if (!plan) return null
    /* 시험 단추(지시: 각 탭의 항목 담기 오른쪽) — **보는 실행**을 돌린다 */
    /* 「실행이 있는가」 는 **시작을 막는 조건이 아니다**(지적: 복제한
       사이클에서 시작 단추가 죽어 있다). 실행이 없으면 시작하는 순간
       만들어진다(openRunner). 예전엔 여기서 막고 「실행 탭에서 실행을
       만드세요」 라고 안내했는데, 그 탭도 그 단추도 이미 걷었다 —
       안내대로 할 길이 없는 막다른 골목이었다. */
    const hasRun = !!(runLite && myRuns.some((x) => x.id === runLite.id))
    const mine = itemRows.filter((r) => r.man === man)
    const repeats = mine.filter((r) => {
      const s = failStat.get(r.tcid)
      return !!s && s.fail >= 2
    })
    const rows: NRow[] = mine.map((r) => {
      const st = failStat.get(r.tcid)
      return {
        __id: r.tcid,
        id: r.tcid,
        title: r.title || '(이름 없음)',
        req: r.reqLabel || '(REQ 없음)',
        folder: r.folder,
        mg: r.mg,
        model: r.model,
        type: r.type,
        run: r.man ? '수동' : '자동',
        fail: !st || !st.ran ? '' : st.fail ? `${st.fail}회 / ${st.ran}${st.fail >= 2 ? ' 반복' : ''}` : `${st.ran}회 중 0`,
      }
    })
    return (
      <div className="cu-fill">
        {!!repeats.length && (
          <div className="pl-note warn">
            <div>
              <b>반복해서 깨지는 항목 {repeats.length}건</b>
              <span className="cu-m">
                {repeats.map((r) => r.tcid).join(', ')} — 계속 담을지, 절차를 손볼지 살펴보세요.
              </span>
            </div>
          </div>
        )}
        {/* 스크롤은 이 판이 맡는다 — cu-fill 은 overflow:hidden 이라
            표가 길면 잘린 채 내릴 길이 없었다(지적) */}
        <div className="cyb-ntb">
        <NTable
          columns={itCols}
          rows={rows}
          view={itView}
          onView={setItView}
          onColumns={setItCols}
          onCell={() => {}}
          readOnlyKeys={itCols.map((c) => c.key)}
          lockDefs
          idKey="id"
          titleKey="title"
          rowIcon={(r) => (
            <span className="cu-m" title={String(r.run)}>{r.run === '수동' ? '✎' : '▶'}</span>
          )}
          onOpen={(id) => goto('tc', id)}
          bulk={[{ k: 'del', label: '사이클에서 제거', danger: true }]}
          onBulk={(a, ids) => {
            if (a === 'del') void dropCycleItems(ids)
          }}
          onShown={setShownOrder}
          renderCell={(row, col) => {
            if (col.key !== 'fail') return undefined
            const st = failStat.get(String(row.__id))
            if (!st || !st.ran) return <span className="cu-m">—</span>
            if (!st.fail) return <span className="cu-m">{st.ran}회 중 0</span>
            return (
              <>
                <span className="badge b-fail">{st.fail}회</span>
                <span className="cu-m"> / {st.ran}</span>
                {st.fail >= 2 && <span className="flag" title="돌릴 때마다 깨집니다"> 반복</span>}
              </>
            )
          }}
          toolbarLeft={
            <>
              <button type="button" className="cu-new small" onClick={() => setAddTo(true)}>
                <i aria-hidden="true">＋</i>Add Coverage
              </button>
              <button
                type="button"
                className="cu-new small"
                /* 막는 것은 **담긴 항목이 없을 때** 하나뿐이다 — 돌릴 것이
                   정말 없는 경우다. 실행은 시작하는 순간 만들어진다. */
                disabled={!mine.length}
                title={
                  !mine.length
                    ? `이 사이클에 ${man ? '수동' : '자동'} 항목이 없습니다 — 「Add Coverage」 로 먼저 담으세요`
                    : `${
                        man
                          ? '수동 항목 — 사람이 확인하고 판정을 기록합니다'
                          : '자동 항목 — 장비에 접속해 스텝을 순서대로 돌립니다'
                      }${hasRun ? '' : '\n(첫 시작에 실행이 하나 만들어집니다)'}`
                }
                onClick={() => openRunner(man ? 'M' : 'A')}
              >
                {/* 무엇이 시작되는지 단추가 말한다 — 고른 수·반복 횟수(지적:
                    고른 것이 표시가 안 된다 / 반복 설정이 안 보인다) */}
                {man
                  ? picked.length
                    ? `✎ 고른 ${picked.length}개 Manual Test`
                    : '✎ Manual Test Start'
                  : picked.length
                    ? `▶ 고른 ${picked.length}개 실행${
                        repCfg && repCfg.repeat > 1 ? ` · ${repCfg.repeat}회` : ''
                      }`
                    : '▶ Automation Test Start'}
              </button>
              {/* **이 차례로 저장**(지시) — 표에서 정렬한 차례를 사이클에
                  못박는다. 차례가 사이클 문서에 남으므로 서버에 저장되고,
                  다른 사람이 열어도·다시 돌려도 같은 차례다. */}
              <button
                type="button"
                className="cu-new small"
                title="지금 보이는 차례를 이 사이클의 시험 차례로 저장합니다"
                onClick={() => void saveOrder()}
              >
                ↓ 이 차례로 저장
              </button>
              {/* ── 체크한 것이 있을 때만 나타난다(승인). 아무것도 안 고르면
                  지금 화면과 완전히 같다 — 단추가 아예 없다. ── */}
              {picked.length > 0 && (
                <>
                  <span className="cu-pick">{picked.length}개 선택 — 이것만 돕니다</span>
                  {!man && (
                    <button
                      type="button"
                      className="cu-new small"
                      title="고른 항목을 한 묶음으로 여러 번 돌립니다 — 부팅 반복 같은 내구 시험.
거는 것은 위 「Test Start」 입니다"
                      onClick={() => setRepPop(true)}
                    >
                      🔁 반복 설정…
                    </button>
                  )}
                </>
              )}
              {/* 걸어 둔 반복 — 화면을 안 바꾸므로 여기서 말해 줘야 안다(지적) */}
              {!!repCfg && repCfg.repeat > 1 && (
                <span className="cu-pick rep">
                  🔁 {repCfg.repeat}회 반복
                  <button type="button" title="반복을 풉니다" onClick={() => setRepCfg(null)}>
                    ✕
                  </button>
                </span>
              )}
            </>
          }
          /* 체크한 항목을 받는다 — 도구 줄의 단추 둘이 이걸 본다(승인) */
          onSelect={setPicked}
          /* 실행 화면에 다녀오면 이 표는 통째로 사라졌다 다시 선다 —
             그때 체크를 되살린다(지적: 실행할 때마다 다시 골라야 한다) */
          initSelected={picked}
          perPage={100}
        />
        </div>
      </div>
    )
  }

  /* ── 상세: 실행 탭 — 자동/수동/커버리지 · 판정 요약 · 이 사이클의 실행 ·
     선택한 실행의 본문(옛 Runs)까지 실행 이야기는 전부 여기(지시: 탭 재편) ── */
  /** 요일 한 글자 — 날짜 밑에 함께 적는다(지시: 「09-08 (화)」) */
  const dow = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`)
    return Number.isNaN(d.getTime()) ? '' : ['일', '월', '화', '수', '목', '금', '토'][d.getDay()]
  }

  /** 일자별 그림 — 선(기본)·막대 두 꼴. 세 갈래를 쌓거나 세 선으로 긋는다 */
  function DayChart({
    rows, series, unit,
  }: {
    rows: Array<[string, { p: number; f: number; b: number }]>
    series: Array<{ k: 'p' | 'f' | 'b'; label: string; color: string }>
    unit?: string
  }) {
    if (!rows.length)
      return (
        <div className="cu-empty">
          <strong>아직 그릴 것이 없습니다</strong>
          <span>판정을 남기면 날짜별로 쌓입니다.</span>
        </div>
      )
    /* **가로로 늘리지 않는다**(지적: 일자별 표현이 서툴다) — 예전에는
       preserveAspectRatio="none" 이라 칸이 넓어질수록 글자와 선이 납작하게
       늘어났다. 비율을 지키고 폭에 맞춰 고르게 키운다. */
    const W = 1000
    const H = 230
    const padL = 44
    const padR = 14
    const padB = 30
    const padT = 18
    const tot = (v: { p: number; f: number; b: number }) => series.reduce((n, s2) => n + v[s2.k], 0)
    const max = Math.max(1, ...rows.map(([, v]) => (dayKind === 'bar' ? tot(v) : Math.max(...series.map((s2) => v[s2.k])))))
    /* 눈금은 **깔끔한 수**로 — 62 를 3 등분해 20.67 같은 값을 적지 않는다 */
    const niceMax = (() => {
      const raw = max
      const mag = Math.pow(10, Math.floor(Math.log10(raw)))
      for (const m of [1, 2, 2.5, 5, 10]) {
        const c = mag * m
        if (c >= raw) return c
      }
      return mag * 10
    })()
    const y = (n: number) => padT + (H - padT - padB) * (1 - n / niceMax)
    const hOf = (n: number) => ((H - padT - padB) * n) / niceMax
    const inner = W - padL - padR
    const slot = inner / rows.length
    const cx = (i: number) => padL + i * slot + slot / 2
    const ticks = [0, 0.25, 0.5, 0.75, 1]
    /* 점은 날이 적을 때만 — 서른 개를 찍으면 선이 안 보인다 */
    const dots = rows.length <= 16
    const one = rows.length === 1
    return (
      <>
        <svg
          className="cyb-daychart"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="일자별 시험 현황"
        >
          {ticks.map((t2) => (
            <g key={t2}>
              <line
                x1={padL}
                x2={W - padR}
                y1={y(niceMax * t2)}
                y2={y(niceMax * t2)}
                stroke="var(--c-border-soft, #e8ecef)"
                strokeDasharray={t2 === 0 ? undefined : '3 4'}
                vectorEffect="non-scaling-stroke"
              />
              <text x={padL - 8} y={y(niceMax * t2) + 4} textAnchor="end" className="tick">
                {Math.round(niceMax * t2)}
              </text>
            </g>
          ))}
          {dayKind === 'bar'
            ? rows.map(([d, v], i) => {
                const bw = one ? 64 : Math.max(6, Math.min(44, slot - 10))
                let top = y(0)
                return (
                  <g key={d}>
                    <title>{`${d.slice(5)} · ${tot(v)}건`}</title>
                    {series.map((s2) => {
                      const n = v[s2.k]
                      if (!n) return null
                      top -= hOf(n)
                      return <rect key={s2.k} x={cx(i) - bw / 2} y={top} width={bw} height={hOf(n)} fill={s2.color} rx={3} />
                    })}
                    {/* 값은 **마지막 칸만** — 다 찍으면 글자가 겹친다 */}
                    {!!tot(v) && (i === rows.length - 1 || rows.length <= 8) && (
                      <text x={cx(i)} y={top - 6} textAnchor="middle" className="val">{tot(v)}</text>
                    )}
                  </g>
                )
              })
            : series.map((s2) => {
                const pts = rows.map(([, v], i) => [cx(i), y(v[s2.k])] as [number, number])
                const line = pts.map(([x2, y2]) => `${x2},${y2}`).join(' ')
                /* 선 아래를 옅게 채운다 — 누적이 얼마나 찼는지 눈에 잡힌다 */
                const area = `M ${pts[0]![0]},${y(0)} L ${line.split(' ').join(' L ')} L ${pts[pts.length - 1]![0]},${y(0)} Z`
                const lastV = rows[rows.length - 1]![1][s2.k]
                return (
                  <g key={s2.k}>
                    {pts.length > 1 && <path d={area} fill={s2.color} opacity={0.1} />}
                    {pts.length > 1 ? (
                      <polyline points={line} fill="none" stroke={s2.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                    ) : null}
                    {(dots || pts.length === 1) &&
                      rows.map(([d, v], i) => (
                        <circle key={d} cx={cx(i)} cy={y(v[s2.k])} r={3.5} fill="#fff" stroke={s2.color} strokeWidth={2} vectorEffect="non-scaling-stroke">
                          <title>{`${d.slice(5)} · ${s2.label} ${v[s2.k]}`}</title>
                        </circle>
                      ))}
                    {/* 끝값은 언제나 짚어 준다 — 「지금 얼마인가」 가 제일 궁금하다 */}
                    {!!lastV && (
                      <>
                        <circle cx={cx(rows.length - 1)} cy={y(lastV)} r={4.5} fill={s2.color} />
                        <text x={cx(rows.length - 1)} y={y(lastV) - 10} textAnchor="middle" className="val" fill={s2.color}>
                          {lastV}
                        </text>
                      </>
                    )}
                  </g>
                )
              })}
          {/* 날짜 글자는 **띄엄띄엄** — 한 칸이 90 단위는 돼야 안 붙는다.
              마지막 날은 언제나 찍어 축 끝을 알려 주고, 열흘이 넘으면
              요일은 뺀다(날짜만으로 충분하고 글자가 절반이 된다). */}
          {(() => {
            const step = Math.max(1, Math.ceil(rows.length / Math.max(1, Math.floor(inner / 90))))
            const longSpan = rows.length > 10
            return rows.map(([d], i) => {
              if (i % step !== 0 && i !== rows.length - 1) return null
              if (i !== rows.length - 1 && rows.length - 1 - i < step / 2) return null
              return (
                <text key={d} x={cx(i)} y={H - 9} textAnchor="middle" className="tick">
                  {longSpan ? d.slice(5) : `${d.slice(5)} (${dow(d)})`}
                </text>
              )
            })
          })()}
        </svg>
        <div className="cyb-daylegend">
          {series.map((s2) => (
            <span key={s2.k}>
              <i style={{ background: s2.color }} />
              {s2.label}
            </span>
          ))}
          {!!unit && <span className="cu-m">{unit}</span>}
        </div>
      </>
    )
  }

  /** 그래프 꼴 고르개 — 선(기본)·막대 */
  /** 7일 · 15일 · 한 달(지시) — 누적 그림이 덮는 기간 */
  const spanPick = (
    <span className="cyb-span">
      {([[7, '7일'], [15, '15일'], [30, '한 달']] as Array<[number, string]>).map(([n, l]) => (
        <button
          key={n}
          type="button"
          className={spanD === n ? 'on' : ''}
          onClick={() => {
            setSpanD(n)
            prefSet('utop.cyc.span', String(n))
          }}
        >
          {l}
        </button>
      ))}
    </span>
  )

  const kindPick = (
    <select
      className="cyb-kind"
      value={dayKind}
      title="그래프 꼴"
      onChange={(e) => {
        const v = e.target.value === 'bar' ? 'bar' : 'line'
        setDayKind(v)
        prefSet('utop.cyc.daykind', v)
      }}
    >
      <option value="line">선</option>
      <option value="bar">막대</option>
    </select>
  )

  function renderRunTab() {
    if (!plan) return null
    const cov = poolN ? ((itemRows.length / poolN) * 100).toFixed(1) : '0.0'
    const r = runLite && myRuns.some((x) => x.id === runLite.id) ? runLite : undefined
    const cP = vDef(verds, 'Pass').color
    const cF = vDef(verds, 'Fail').color
    const cB = vDef(verds, 'Blocked').color

    /* 방식별 판정 셈 — 실행이 있으면 보는 실행의 항목, 없으면 담긴 항목 전부 미실행 */
    const modeStat = (man: boolean) => {
      const vals = r
        ? runItems.filter((x) => x.man === man).map((x) => x.v)
        : itemRows.filter((x) => x.man === man).map(() => '')
      const by = new Map<string, number>()
      let p = 0
      let f = 0
      let b = 0
      let none = 0
      for (const v of vals) {
        const val = vDef(verds, v).v
        by.set(val, (by.get(val) ?? 0) + 1)
        const l = vLetter(verds, v)
        if (l === 'p') p += 1
        else if (l === 'f') f += 1
        else if (l === 'n') none += 1
        else b += 1
      }
      return { total: vals.length, by, p, f, b, done: vals.length - none }
    }

    /** 전체 항목 — 자동·수동을 합쳐 센다(커버리지 칸이 쓴다) */
    const allStat = () => {
      const a2 = modeStat(false)
      const b2 = modeStat(true)
      const by = new Map(a2.by)
      for (const [k2, n2] of b2.by) by.set(k2, (by.get(k2) ?? 0) + n2)
      return {
        total: a2.total + b2.total,
        by,
        p: a2.p + b2.p,
        f: a2.f + b2.f,
        b: a2.b + b2.b,
        done: a2.done + b2.done,
      }
    }

    /** 판정 알약 여섯 — **2 열로 나눈다**(지적: 세로 한 줄이라 너무 길다) */
    const verdRows = (st: ReturnType<typeof modeStat>) => (
      <div className="sumrows">
        {[
          ...verds,
          ...[...st.by.keys()]
            .filter((k2) => !verds.some((d) => d.v === k2))
            .map((k2) => ({ ...vDef(verds, k2), label: `${k2} (지워진 판정)` })),
        ].map((d) => {
          const nn = st.by.get(d.v) ?? 0
          return (
            <span key={d.v || '(none)'} className="sumrow">
              <span
                className={`vpill${d.v ? '' : ' v-n'}`}
                style={d.v ? { background: d.color, color: '#fff' } : undefined}
              >
                {st.total ? Math.round((nn / st.total) * 100) : 0}%
              </span>
              <b>{nn || '-'}</b>
              <span className="cu-m">{d.label}</span>
            </span>
          )
        })}
      </div>
    )

    /** 왼쪽 한 줄 — 도넛과 판정 알약 */
    const verdCell = (title: string, man: boolean) => {
      const st = modeStat(man)
      return (
        <>
          <h3 className="cyb-rowh">
            {title} <span className="dim">{r ? `실행 ${r.id}` : '실행 없음'}</span>
          </h3>
          <div className="ov-verd">
            <div className="sumdonut">
              <Donut
                big
                parts={[
                  { v: st.p, cls: 'p', color: cP },
                  { v: st.f, cls: 'f', color: cF },
                  { v: st.b, cls: 'b', color: cB },
                ]}
                total={st.total}
                label={st.total ? `${Math.round((st.done / st.total) * 100)}%` : '0%'}
                sub="완료"
              />
              <div className="cu-m">
                {st.total}개 중 {st.done} 완료됨
              </div>
            </div>
            {verdRows(st)}
          </div>
        </>
      )
    }

    return (
      <div className="cu-scroll">
        {/* **1행 3열 + 2행 통짜**(지시). 위는 자동·수동·커버리지 셋을 나란히,
            아래는 누적 그림 하나가 폭을 다 쓴다. 갈래별 일자 그림 둘은
            걷었다(지시) — 아래 누적이 같은 것을 더 잘 말한다. */}
        <div className="cu-sec cu-card cyb-rt3">
          <div className="cyb-rtl">{verdCell('자동 시험', false)}</div>
          <div className="cyb-rtl">{verdCell('수동 시험', true)}</div>
          <div className="cyb-rtl">
            <h3 className="cyb-rowh">커버리지</h3>
            <div className="ov-verd">
              <div className="sumdonut">
                <Donut big parts={[{ v: itemRows.length, cls: 'c' }]} total={poolN} label={String(itemRows.length)} sub={`${cov}%`} />
                <div className="cu-m">
                  {String(plan.model ?? plan.model_group ?? '전체')} 시험 {poolN}건 중 · 안 담김{' '}
                  {Math.max(0, poolN - itemRows.length)}
                </div>
              </div>
              {/* 담은 항목 **전체 기준** 판정 여섯(지시) — 자동·수동을 합쳐
                  센다. 담은/안 담김 수는 위 도넛과 그 밑 한 줄이 말한다. */}
              {verdRows(allStat())}
            </div>
          </div>
          <div className="cyb-rtw">
            <h3 className="cyb-rowh">
              일자별 <span className="dim">누적 판정 — 자동 · 수동</span>
              <span className="cu-sp" />
              {spanPick}
              {kindPick}
            </h3>
            <DayChart
              rows={covCumSpan}
              series={[
                { k: 'p', label: '자동(누적)', color: 'var(--c-primary)' },
                { k: 'f', label: '수동(누적)', color: '#8a949e' },
              ]}
              unit={`담은 항목 ${itemRows.length}건 기준`}
            />
          </div>
        </div>
      </div>
    )
  }

  /* ── 상세: 결함 내역 — 이 사이클에 등록된 결함(지시) ── */
  function renderDefects() {
    const list = defQ.data?.defects ?? []
    return (
      <div className="cu-scroll">
        <div className="cu-sec cu-card flat">
          <h2 className="flexh">
            결함 내역 <span className="dim">{list.length}</span>
          </h2>
          {defQ.isLoading ? (
            <div className="cu-empty"><strong>불러오는 중…</strong></div>
          ) : list.length ? (
            <table className="grid">
              <thead>
                <tr>
                  <th style={{ width: 120 }}>결함 ID</th>
                  <th>제목</th>
                  <th style={{ width: 120 }}>시험 항목</th>
                  <th style={{ width: 72 }}>상태</th>
                  <th style={{ width: 80 }}>심각도</th>
                  <th style={{ width: 110 }}>Jira</th>
                </tr>
              </thead>
              <tbody>
                {list.map((d) => (
                  <tr key={String(d.id ?? d.title)}>
                    <td className="cu-mono">{String(d.id ?? '') || '—'}</td>
                    <td title={String(d.title ?? '')}>{String(d.title ?? '') || '—'}</td>
                    <td>
                      {d.tcid ? (
                        <button type="button" className="linkbtn cu-mono" onClick={() => goto('tc', String(d.tcid))}>
                          {String(d.tcid)}
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <span className={`badge ${String(d.status) === 'open' ? 'b-fail' : 'b-pass'}`}>
                        {String(d.status ?? '') || '—'}
                      </span>
                    </td>
                    <td>{String(d.severity ?? '') || '—'}</td>
                    <td className="cu-mono">{String(d.jira_key ?? '') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="cu-empty">
              <strong>등록된 결함이 없습니다</strong>
              <span>실행에서 실패한 항목에 결함을 등록하면 여기에 모입니다.</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  /* ── 상세 골격 ── */
  function renderDetail() {
    if (!plan) {
      return (
        <section className="panel lp">
          <div className="cu-empty" style={{ margin: 'auto' }}>
            <strong>{plansQ.isLoading ? '불러오는 중…' : '사이클을 찾을 수 없습니다'}</strong>
          </div>
        </section>
      )
    }
    return (
      <section className="panel" style={{ height: '100%' }}>
        <div className="cu-hd">
          {colBtn}
          <button
            type="button"
            className="btn small"
            onClick={() => {
              if (dirty && !window.confirm('저장하지 않은 변경이 있습니다. 버리고 나갈까요?')) return
              closePlan()
            }}
          >
            ← 목록
          </button>
          {/* 수동 저장(지시) — 고치면 초록으로 서고, 눌러야 실린다. REQ-Coverage 와 같은 벌 */}
          <button
            type="button"
            className={`cyb-save${dirty ? ' dirty' : ''}`}
            disabled={!dirty || savingMeta}
            title={dirty ? '고친 값을 저장합니다' : '고친 것이 없습니다'}
            onClick={() => void saveDraft()}
          >
            {savingMeta ? '저장 중…' : dirty ? '저장' : '저장됨'}
          </button>
          <i className="cyb-vsep" aria-hidden="true" />
          {/* 자리 빵부스러기 — REQ-Coverage 와 같은 꼴(지시): 사업자 / 제품 /
              버전그룹 / 제목. 앞 세 단계는 눌러 그 범위 목록으로 간다 */}
          <span className="cyb-crumb">
            {(() => {
              const cust = String(plan.customer || '미지정')
              const model = String(plan.model || '미지정')
              const vg = String(plan.version_group || '미지정')
              const segs: Array<[string, string, string]> = [
                ['🏢', cust, keyOf(cust)],
                ['📦', model, keyOf(cust, model)],
                ['🔖', vg, keyOf(cust, model, vg)],
              ]
              return segs.map(([ico, l, k], i) => (
                <span className="crumbi" key={k}>
                  {i > 0 && <i className="csep">/</i>}
                  <span className="cfico" aria-hidden="true">{ico}</span>
                  <button type="button" className="crumbgo" onClick={() => pickCrumb(k)}>
                    {l}
                  </button>
                </span>
              ))
            })()}
            <i className="csep">/</i>
            <b
              className="edt crumbgo last"
              title="더블클릭하면 제목을 고칩니다"
              onDoubleClick={(e) =>
                editInline(e.currentTarget, String(draft.name ?? plan.name ?? ''), (v) => {
                  if (v.trim()) stage({ name: v.trim() })
                }, true)
              }
            >
              {String(draft.name ?? plan.name ?? plan.version ?? plan.id)}
            </b>
          </span>
          <button
            type="button"
            className={`cu-chip cu-mono cyb-cid${cidDone ? ' done' : ''}`}
            title="누르면 사이클 ID 를 복사합니다"
            onClick={() =>
              copyText(String(plan.cid ?? plan.id), () => {
                setCidDone(true)
                window.setTimeout(() => setCidDone(false), 1400)
              })
            }
          >
            {cidDone ? '복사됨 ✓' : String(plan.cid ?? plan.id)}
          </button>
          {/* 사이클·버전그룹·대상 칩은 걷었다(지시) — 같은 값이 트리와
              개요 카드에 이미 있어 제목 옆에선 소음이었다 */}
          <span className="cu-sp" />
          {/* ⋯ 는 걷었다(지시) — 복제·고치기·CSV·지우기·실행 만들기는
              목록에서 줄을 골랐을 때 아래 선택 바가 맡는다 */}
          <div className="cu-hdbtns">
            {/* 실행 더보기 — 결과 메일·고객사 결과서·실행 하나 더(지시: 상단 오른쪽) */}
            <button
              type="button"
              className="btn small"
              onClick={(e) => {
                const rc = (e.currentTarget as HTMLElement).getBoundingClientRect()
                setRunMoreAt({ x: Math.max(8, rc.right - 180), y: rc.bottom + 4 })
              }}
            >
              더보기 ▾
            </button>
          </div>
        </div>
        {/* 탭 차례는 읽는 순서다: Info → Status → 수동 → 자동 → 결함.
            「AI 요약」·「Test Summary」 는 걷었다(지시). */}
        <div className="cu-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'info'} className={tab === 'info' ? 'on' : ''} onClick={() => setTab('info')}>
            Info
          </button>
          <button type="button" role="tab" aria-selected={tab === 'run'} className={tab === 'run' ? 'on' : ''} onClick={() => setTab('run')}>
            Status
          </button>
          <button type="button" role="tab" aria-selected={tab === 'itm'} className={tab === 'itm' ? 'on' : ''} onClick={() => setTab('itm')}>
            Manual <span className="tabn">{nMan}</span>
          </button>
          <button type="button" role="tab" aria-selected={tab === 'ita'} className={tab === 'ita' ? 'on' : ''} onClick={() => setTab('ita')}>
            Automation <span className="tabn">{nAuto}</span>
          </button>
          <button type="button" role="tab" aria-selected={tab === 'def'} className={tab === 'def' ? 'on' : ''} onClick={() => setTab('def')}>
            Defects
          </button>
        </div>
        {tab === 'info' ? (
          renderInfo()
        ) : tab === 'run' ? (
          renderRunTab()
        ) : tab === 'def' ? (
          renderDefects()
        ) : tab === 'itm' ? (
          renderItems(true)
        ) : (
          renderItems(false)
        )}
      </section>
    )
  }

  const runnerCols = runnerOn && !!selRun && !!open && (tab === 'run' || tab === 'itm' || tab === 'ita')
  const cols =
    wide && runnerCols
      ? 'minmax(0,1fr)'
      : [
          sideOn ? `${w1}px` : '',
          'minmax(0,1fr)',
          runnerCols ? 'minmax(520px,1.15fr)' : '',
        ]
          .filter(Boolean)
          .join(' ')

  return (
    <div className="qav cyb rnb">
      <div ref={gridRef} className="cu-grid" style={{ gridTemplateColumns: cols }}>
        {!(wide && runnerCols) && sideOn && renderSide()}
        {!(wide && runnerCols) && (open ? renderDetail() : renderList())}
        {runnerCols && (
          <section className="cu-run">
            <RunDetail
              runId={selRun}
              plan={plan}
              /* 어느 탭에서 열었나 — 실행 기록에는 mode 가 안 실려서, 이걸
                 안 넘기면 Manual 탭에서도 자동 작업대가 열린다(지적) */
              mode={runMode}
              /* 표에 보이는 그 차례 그대로 — 이 목록이 실행기가 도는 차례다 */
              only={runItems
                .filter((x) => (runMode === 'M' ? x.man : !x.man))
                /* 고른 것이 있으면 그것만 — 없으면 여태처럼 전부 */
                .filter((x) => !runPick.length || runPick.includes(x.tcid))
                .map((x) => x.tcid)}
              /* 걸어 둔 반복 규칙 — 「시험 시작」 이 이대로 건다 */
              repeat={repCfg ?? undefined}
              onClearRepeat={() => setRepCfg(null)}
              /* 골라서 왔으면 몇 개인지 머리에 말해 준다(지적) */
              pickedN={runPick.length}
              onClearPick={() => setRunPick([])}
              focus={runFocus}
              onBack={() => setRunnerOn(false)}
              lead={
                <>
                  {/* 돌아가기 — 사이클 화면의 접기 단추와 **같은 아이콘**(지시) */}
                  <button
                    type="button"
                    className="cu-colbtn"
                    title="돌아가기 — 시험을 멈추지 않고 사이클 화면으로"
                    onClick={() => {
                      setRunnerOn(false)
                      setWide(false)
                    }}
                  >
                    <IconPanel open />
                  </button>
                  <button
                    type="button"
                    className="cu-colbtn"
                    title={wide ? '사이클 화면과 나란히 보기' : '전체로 확장'}
                    onClick={() => setWide((v) => !v)}
                  >
                    {wide ? '⇤' : '⇥'}
                  </button>
                </>
              }
              onClose={() => {
                setRunnerOn(false)
                setWide(false)
                void qc.invalidateQueries({ queryKey: ['plan-run', selRun] })
              }}
            />
          </section>
        )}
      </div>

      {/* ＋ 폴더 — 사업자 ▸ 제품명 ▸ 버전그룹, 셋 다 드롭다운(지시).
          사업자·버전그룹은 「새로 적기」 를 고르면 입력칸이 나온다 */}
      {!!folderDlg && (() => {
        const d = folderDlg
        const custsAll = [...new Set([
          /* 장비 카탈로그의 사업자(operator)가 정본(지적) — 코드표·기존 값도 합친다 */
          ...(((catQ.data?.items ?? []) as Array<Record<string, unknown>>)
            .filter((x) => String(x.kind) === 'operator')
            .map((x) => String(x.name ?? ''))),
          ...((codesQ.data?.items ?? [])
            .filter((x) => String(x.kind) === 'cycle_customer')
            .map((x) => String(x.value ?? ''))),
          ...folderPaths.map((x) => x.customer),
          ...plans.map((p) => String(p.customer || '')),
        ])].filter(Boolean).sort(cmp)
        const modelsAll = [...new Set(((catQ.data?.items ?? []) as Array<Record<string, unknown>>)
          .filter((x) => String(x.kind) === 'model')
          .map((x) => String(x.name ?? '')))].filter(Boolean).sort(cmp)
        const vgsAll = d.model ? ((vgQ.data?.groups ?? {})[d.model] ?? []).slice().sort(cmp) : []
        const custVal = d.customer === '__new' ? d.customerNew.trim() : d.customer
        const vgVal = d.vg === '__new' ? d.vgNew.trim() : d.vg
        return (
          <div className="cyb-fdlg-back" onMouseDown={(e) => e.target === e.currentTarget && setFolderDlg(null)}>
            <div className="cyb-fdlg" role="dialog" aria-modal="true" aria-label="폴더 만들기">
              <header>
                <b>폴더 만들기</b>
                <span className="cu-sp" />
                <button type="button" className="btn icon" title="닫기" onClick={() => setFolderDlg(null)}>✕</button>
              </header>
              <div className="body">
                <label>
                  <span>사업자 <i className="req">*</i></span>
                  <select
                    className="kvin"
                    value={d.customer}
                    onChange={(e) => setFolderDlg({ ...d, customer: e.target.value })}
                  >
                    <option value="">(고르세요)</option>
                    {custsAll.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                    <option value="__new">＋ 새 사업자…</option>
                  </select>
                  {d.customer === '__new' && (
                    <input
                      className="kvin"
                      autoFocus
                      value={d.customerNew}
                      placeholder="새 사업자 이름"
                      onChange={(e) => setFolderDlg({ ...d, customerNew: e.target.value })}
                    />
                  )}
                </label>
                <label>
                  <span>제품명</span>
                  <select
                    className="kvin"
                    value={d.model}
                    onChange={(e) => setFolderDlg({ ...d, model: e.target.value, vg: '', vgNew: '' })}
                  >
                    <option value="">(여기까지만 — 사업자 폴더)</option>
                    {modelsAll.map((m2) => (
                      <option key={m2} value={m2}>{m2}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>버전그룹</span>
                  <select
                    className="kvin"
                    value={d.vg}
                    disabled={!d.model}
                    onChange={(e) => setFolderDlg({ ...d, vg: e.target.value })}
                  >
                    <option value="">{d.model ? '(여기까지만 — 제품명 폴더)' : '먼저 제품명을 고르세요'}</option>
                    {vgsAll.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                    {!!d.model && <option value="__new">＋ 새 버전그룹…</option>}
                  </select>
                  {d.vg === '__new' && (
                    <input
                      className="kvin"
                      autoFocus
                      value={d.vgNew}
                      placeholder="예: R300"
                      onChange={(e) => setFolderDlg({ ...d, vgNew: e.target.value })}
                    />
                  )}
                </label>
                <p className="cu-m">제품명은 장비 카탈로그에서 고릅니다. 사이클은 버전그룹 폴더의 ⋯ 에서 만듭니다.</p>
              </div>
              <footer>
                <button type="button" className="btn" onClick={() => setFolderDlg(null)}>취소</button>
                <button
                  type="button"
                  className="cu-new"
                  disabled={!custVal}
                  onClick={() => {
                    void addFolderPath(custVal, d.model || undefined, vgVal || undefined)
                    setFolderDlg(null)
                  }}
                >
                  만들기
                </button>
              </footer>
            </div>
          </div>
        )
      })()}

      {/* 트리 보기 ⋯ — REQ-Coverage 와 같은 결(지시) */}
      {!!treeModeAt && (
        <>
          <span className="qa-moreovl" role="presentation" onClick={() => setTreeModeAt(null)} />
          <div className="qa-menu" role="menu" style={{ left: treeModeAt.x, top: treeModeAt.y }}>
            <button type="button" role="menuitem" onClick={() => { setTreeModeAt(null); setLeaves(false) }}>
              <span style={{ width: 14, display: 'inline-block', color: 'var(--c-primary)' }}>{leafOn ? '' : '✓'}</span>
              폴더만 보기
            </button>
            <button type="button" role="menuitem" onClick={() => { setTreeModeAt(null); setLeaves(true) }}>
              <span style={{ width: 14, display: 'inline-block', color: 'var(--c-primary)' }}>{leafOn ? '✓' : ''}</span>
              폴더 + 버전명
            </button>
          </div>
        </>
      )}

      {/* 폴더 ⋯ — 트리의 사업자·모델·버전그룹 줄 일들 */}
      {!!folderMenu && (() => {
        const list = plansInScope(folderMenu.t, folderMenu.k)
        const label = folderMenu.k.split('|').pop() || ''
        return (
          <>
            <span className="qa-moreovl" role="presentation" onClick={() => setFolderMenu(null)} />
            <div className="qa-menu" role="menu" style={{ left: folderMenu.x, top: folderMenu.y }}>
              <div className="qa-menuh">
                {label} · 사이클 {list.length}건
              </div>
              {folderMenu.t === 'cust' && label !== '미지정' && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const c = folderMenu.k.split('|')[0] ?? ''
                    setFolderMenu(null)
                    setNeedMake(true)
                    setFolderDlg({ customer: c, customerNew: '', model: '', vg: '', vgNew: '' })
                  }}
                >
                  ＋ 제품명 폴더
                </button>
              )}
              {folderMenu.t === 'model' && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const parts = folderMenu.k.split('|')
                    setFolderMenu(null)
                    const nv = window.prompt('새 버전그룹 이름', '')
                    if (nv === null || !nv.trim()) return
                    void addFolderPath(parts[0] ?? '', parts[1] ?? '', nv.trim())
                  }}
                >
                  ＋ 버전그룹 폴더
                </button>
              )}
              {folderMenu.t === 'cust' && label !== '미지정' && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const k = folderMenu.k
                    setFolderMenu(null)
                    void renameCustomer(k)
                  }}
                >
                  폴더 이름 바꾸기
                </button>
              )}
              {folderMenu.t === 'vg' && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const k = folderMenu.k
                    setFolderMenu(null)
                    void renameVg(k)
                  }}
                >
                  폴더 이름 바꾸기
                </button>
              )}
              <div className="qa-menusep" />
              <button
                type="button"
                role="menuitem"
                className="danger"
                onClick={() => {
                  const fm = folderMenu
                  setFolderMenu(null)
                  void delFolder(fm.t, fm.k)
                }}
              >
                폴더 지우기{list.length ? ` — 사이클 ${list.length}건 포함` : ''}
              </button>
            </div>
          </>
        )
      })()}

      {/* 실행 더보기 — 실행 하나짜리 일들 */}
      {!!runMoreAt && (
        <>
          <span className="qa-moreovl" role="presentation" onClick={() => setRunMoreAt(null)} />
          <div className="qa-menu" role="menu" style={{ left: runMoreAt.x, top: runMoreAt.y }}>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setRunMoreAt(null)
                if (plan) setMailPlan(plan)
              }}
            >
              ✉ 결과 메일
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setRunMoreAt(null)
                if (plan) setRepPlan(plan)
              }}
            >
              ▤ 고객사 결과서
            </button>
          </div>
        </>
      )}

      {!!mailPlan && <CycleMailOne cycle={mailPlan} onClose={() => setMailPlan(null)} />}
      {!!repPlan && (
        <CycleReport
          cycleId={repPlan.id}
          model={String(repPlan.model ?? '')}
          version={String(repPlan.version ?? '')}
          onClose={() => setRepPlan(null)}
        />
      )}

      {!!assAt && !!plan && (
        <AssigneePicker
          at={assAt}
          value={String(plan.assignee ?? '')}
          me={meName}
          onPick={(name) => void saveFull({ assignee: name })}
          onClose={() => setAssAt(null)}
        />
      )}
      {making && (
        <MakeCycle
          me={me}
          seed={mkSeed ?? undefined}
          onClose={() => {
            setMaking(false)
            setMkSeed(null)
          }}
          onMade={(id) => {
            setMaking(false)
            setMkSeed(null)
            void plansQ.refetch()
            void vgQ.refetch()
            openPlanId(id)
          }}
        />
      )}
      {addTo && !!plan && (
        /* 담기 드로어 — 목업의 폴더 ▸ REQ ▸ 시험 항목 3단 담기 창.
           옛 고르기 창(PickItems)은 plans-old 화면이 아직 쓴다. */
        <AddItems
          cycle={plan}
          by={meName}
          onClose={() => setAddTo(false)}
          onDone={() => {
            setAddTo(false)
            void plansQ.refetch()
            void qc.invalidateQueries({ queryKey: ['cycle-full', open] })
            if (myRuns.length)
              window.alert(
                '사이클에 담았습니다.\n이미 뜬 실행에는 안 들어갑니다 — 새 실행을 만들면 담깁니다.',
              )
          }}
        />
      )}
      {edit && !!plan && (
        <CycleEdit
          cycleId={plan.id}
          folders={vgQ.data?.groups ?? {}}
          onClose={() => setEdit(false)}
          onDone={() => {
            setEdit(false)
            void plansQ.refetch()
            void qc.invalidateQueries({ queryKey: ['cycle-full', open] })
          }}
        />
      )}
      {!!cloneId && (
        <CloneDialog
          cycleId={cloneId}
          onClose={() => setCloneId('')}
          onDone={() => {
            setCloneId('')
            void plansQ.refetch()
          }}
        />
      )}
      {/* 반복 시험 규칙(승인) — 걸어 두면 실행 화면의 「시험 시작」 이 이대로
          건다. 바로 돌리지 않는 것은 일부러다: 10,000 회가 실수로 시작되면
          장비가 며칠 잡힌다. 한 번 더 누르게 한다. */}
      {repPop && (
        <RepeatPop
          count={picked.length}
          init={repCfg ?? undefined}
          onClose={() => setRepPop(false)}
          /* **화면을 안 바꾼다**(지적: 고르기 선택하면 바로 실행으로 넘어가면
             안 된다). 여기서는 걸어 두기만 하고, 거는 것은 위 「Test Start」 다 */
          onGo={(cfg) => {
            setRepCfg(cfg)
            setRepPop(false)
          }}
        />
      )}
      {mkRun && !!plan && (
        <MakePlanRun
          plan={plan}
          catalog={
            (catQ.data?.items ?? []) as Array<{
              kind?: string
              name?: string
              model_group?: string | null
              family?: string | null
            }>
          }
          owner={meName}
          vgroups={vgQ.data?.groups ?? {}}
          seed={{
            family: String(plan.family ?? ''),
            model_group: String(plan.model_group ?? ''),
            model: String(plan.model ?? ''),
            version_group: String(plan.version_group ?? ''),
          }}
          onClose={() => setMkRun(false)}
          onMade={(id) => {
            setMkRun(false)
            void runsQ.refetch()
            setTab('run')
            openRun(id)
          }}
        />
      )}
    </div>
  )
}

/**
 * 더블클릭 → 그 자리에서 입력칸으로. Enter 저장, Esc 취소.
 * React 트리 밖에서 DOM 을 바꾸면 다음 렌더와 부딪히므로, 입력칸을 잠깐
 * 얹었다가 끝나면 통째로 다시 그리게 한다(onDone 이 저장 → 쿼리 무효화).
 */
function editInline(
  el: HTMLElement,
  cur: string,
  onDone: (v: string) => void,
  title?: boolean,
) {
  const inp = document.createElement('input')
  inp.className = title ? 'edt-in' : 'edt-in desc-in'
  inp.value = cur
  const parent = el.parentNode
  if (!parent) return
  parent.replaceChild(inp, el)
  inp.focus()
  inp.select()
  let done = false
  const finish = (save: boolean) => {
    if (done) return
    done = true
    try {
      parent.replaceChild(el, inp)
    } catch { /* 이미 리액트가 다시 그렸다 */ }
    if (save && inp.value !== cur) onDone(inp.value)
  }
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      finish(true)
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      finish(false)
    }
  })
  inp.addEventListener('blur', () => finish(true))
}
