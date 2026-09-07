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
import { exportCycleCsv, CloneDialog } from '@/pages/Cycles'
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
import MakeCycle from '@/components/cycle/MakeCycle'
import AddItems from '@/components/cycle/AddItems'
import CycleEdit from '@/components/cycle/CycleEdit'
import { MakePlanRun } from '@/components/cycle/PlanRunPopup'
import CycleInsight from '@/components/cycle/CycleInsight'
import TestSummary from '@/components/cycle/TestSummary'
import AssigneePicker from '@/components/AssigneePicker'
import { Donut, StatBar, ago, orderTcIds, sumRuns, useNCols, useReqIndex, useUserPeople } from '@/pages/qaBits'
import { useVerdictsState, vDef, vGroup, vLetter, vName } from '@/lib/verdicts'
import type { RunLite } from '@/pages/qaBits'
import './QaShared.css'
import './CyclesBoard.css'
import './RunsBoard.css'

/** GET /api/cycle/{id} — data JSONB 전문. 저장은 이 전문을 통째로 되민다 */
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
  const [tab, setTab] = useState<'ov' | 'ai' | 'sum' | 'it' | 'run'>('ov')
  const [making, setMaking] = useState(false)
  const [addTo, setAddTo] = useState(false)
  const [mkRun, setMkRun] = useState(false)
  const [edit, setEdit] = useState(false)
  const [cloneId, setCloneId] = useState('')
  /* 만들기 창(MakePlanRun)이 쓰는 카탈로그 — 창을 열 때만 받아 온다 */
  const [needMake, setNeedMake] = useState(false)

  const openPlanId = (id: string) => {
    setOpen(id)
    setTab('ov')
    prefSet('utop.cycle.sel', id)
    reflectUrl('cycle', id)
  }
  const closePlan = () => {
    setOpen('')
    prefRemove('utop.cycle.sel')
    window.history.pushState({ utop: true }, '', `${window.location.pathname}?p=cycles`)
  }

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
  /** 실행 판정 기준 — 셋업이 정본. 막대 색·Test Summary 셈이 쓴다 */
  const { defs: verds, ready: verdsReady } = useVerdictsState()
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
  useEffect(() => prefSet('utop.cyc.side', sideOn ? '1' : '0'), [sideOn])

  /* ── 실행 탭 상태 (옛 Runs 화면을 들여온 것) ── */
  const [selRun, setSelRun] = useState(() => prefGet('utop.runs.open') ?? '')
  /** 3열 실행기 */
  const [runnerOn, setRunnerOn] = useState(false)
  const [runMode, setRunMode] = useState<'A' | 'M'>('A')
  const [runFocus, setRunFocus] = useState('')
  const [wide, setWide] = useState(false)
  const [sumOff, setSumOff] = useState(false)
  const [sumTab, setSumTab] = useState<'team' | 'info'>('team')
  const [vf, setVf] = useState<string | null>(null)
  const [bulkAt, setBulkAt] = useState<{ kind: 'assign' | 'status'; ids: string[] } | null>(null)
  const [runMoreAt, setRunMoreAt] = useState<{ x: number; y: number } | null>(null)
  /** 실행 담당 고르개 — 요약의 세부 정보 담당 칸이 연다 */
  const [ownAt, setOwnAt] = useState<{ x: number; y: number } | null>(null)
  const [mailPlan, setMailPlan] = useState<CycleMeta | null>(null)
  const [repPlan, setRepPlan] = useState<CycleMeta | null>(null)
  const [busyRun, setBusyRun] = useState('')

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

  /* 실행 탭의 항목 표(노션 표) — Runs 화면과 같은 열, 같은 계정 저장키 */
  const [riView, setRiView] = useState<NView>({ ...EMPTY_VIEW, groupBy: 'folder' })
  const RI_DEFS: NCol[] = [
    { key: 'id', label: 'ID', type: 'text', width: 124, fixed: true },
    { key: 'title', label: '제목', type: 'text', width: 360, fixed: true },
    { key: 'folder', label: '폴더', type: 'text', width: 200 },
    { key: 'who', label: '할당 대상', type: 'person', width: 110 },
    {
      /* 선택지는 셋업(실행 판정 기준)이 정본 — 그리기 직전에 끼운다 */
      key: 'result', label: '결과', type: 'select', width: 110, options: [],
    },
  ]
  const [riCols, setRiCols] = useNCols('utop.ntb.runit.cols', RI_DEFS)

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
    { key: 'stat', label: '판정 현황', type: 'text', width: 190 },
    { key: 'assignee', label: '담당', type: 'person', width: 96 },
    { key: 'created', label: '생성일자', type: 'text', width: 100 },
  ]
  const [lsCols, setLsCols] = useNCols('utop.ntb.cyc.cols', LS_DEFS)

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
        if (kind === 'cycle') openPlanId(id)
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
  /* 남이 지운 사이클을 붙들고 있으면 상세가 영영 빈다 */
  useEffect(() => {
    if (open && plansQ.isSuccess && !planOf.get(open)) closePlan()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, plansQ.isSuccess, planOf])

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
    const out: TreeRow[] = []
    out.push({
      d: 0,
      key: '__all',
      label: '전체 사이클',
      n: plans.length,
      zero: !plans.length,
      on: !open && !grpSel,
    })
    const custs = [...new Set(plans.map((p) => String(p.customer || '미지정')))].sort(cmp)
    for (const cust of custs) {
      const custPlans = plans.filter((p) => String(p.customer || '미지정') === cust)
      const models = [...new Set(custPlans.map((p) => String(p.model || '미지정')))].sort(cmp)
      const custRows: TreeRow[] = []
      for (const model of models) {
        const mk = keyOf(cust, model)
        const mPlans = custPlans.filter((p) => String(p.model || '미지정') === model)
        const vgs = [...new Set(mPlans.map((p) => String(p.version_group || '미지정')))].sort(cmp)
        const modelRows: TreeRow[] = []
        for (const vg of vgs) {
          const vk = keyOf(cust, model, vg)
          const vPlans = mPlans
            .filter((p) => String(p.version_group || '미지정') === vg)
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
          if (!planRows.length) continue
          const vn = planRows.reduce((a, r) => a + r.n, 0)
          modelRows.push({
            d: 3,
            key: vk,
            label: vg,
            n: planRows.length,
            zero: !planRows.length,
            caret: true,
            open: !closed.has(vk),
            on: !open && grpSel?.t === 'vg' && grpSel.k === vk,
            ico: '🔖',
          })
          void vn
          if (!closed.has(vk)) modelRows.push(...planRows)
        }
        if (!modelRows.length) continue
        const mCnt = mPlans.length
        custRows.push({
          d: 2,
          key: mk,
          label: model,
          n: mCnt,
          zero: !mCnt,
          caret: true,
          open: !closed.has(mk),
          on: !open && grpSel?.t === 'model' && grpSel.k === mk,
          ico: '📦',
        })
        if (!closed.has(mk)) custRows.push(...modelRows)
      }
      if (!custRows.length) continue
      out.push({
        d: 1,
        key: keyOf(cust),
        label: cust,
        n: custPlans.length,
        zero: !custPlans.length,
        on: !open && grpSel?.t === 'cust' && grpSel.k === cust,
        ico: '🏢',
      })
      out.push(...custRows)
    }
    return out
  }, [plans, runsByPlan, closed, open, grpSel, treeQ, cmp])

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

  async function csvPlan(id: string) {
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
    exportCycleCsv(c)
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
  const myRuns = useMemo(
    () =>
      (runsByPlan.get(open) ?? []).slice().sort((a, b) =>
        String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')),
      ),
    [runsByPlan, open],
  )

  /** 항목 줄 — TC 메타·REQ 이름표를 입혀 폴더 ▸ REQ 로 묶는다 */
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
      })
    }
    /* 차례는 **공용 한 곳**(orderTcIds)이 정한다 — Runs 의 표·실행기와
       같은 차례라야 「사이클에서 본 차례대로 돈다」 가 성립한다 */
    const rank = new Map(orderTcIds(out.map((r) => r.tcid), tcOf, reqIndex).map((id, i) => [id, i]))
    out.sort((a, b) => (rank.get(a.tcid) ?? 0) - (rank.get(b.tcid) ?? 0))
    return out
  }, [full, tcOf, reqIndex])
  /* 유형 선택지는 자료에서 뽑는다 — 담긴 값이 곧 목록이고 색은 자동 */
  const itCols = useMemo<NCol[]>(
    () =>
      itColsRaw.map((c) =>
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
    [itColsRaw, itemRows],
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
      enabled: !!open && (tab === 'it' || tab === 'sum'),
      queryFn: async () => {
        const res = await apiFetch(`/api/plan-runs/${encodeURIComponent(r.id)}`)
        if (!res.ok) throw new Error('실행을 불러오지 못했습니다')
        return (await res.json()) as RunFull
      },
    })),
  })
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

  /** Test Summary 용 합산 — 실행들이 남긴 판정을 항목별로 겹쳐(뒤가 이김) 센다 */
  const sumOfRuns = useMemo(() => {
    const asc = [...myRuns].sort((a, b) =>
      String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')),
    )
    const got = new Map<string, { v: string; run: string }>()
    for (const r of asc) {
      const full2 = failQs[myRuns.findIndex((x) => x.id === r.id)]?.data
      for (const [tcid, v] of Object.entries(full2?.results ?? {})) {
        const g = vGroup(verds, String(v ?? ''))
        if (g !== 'none') got.set(tcid, { v: g, run: String(r.name || r.id) })
      }
    }
    const stat = { total: itemRows.length, pass: 0, fail: 0, etc: 0, none: 0, rate: 0 }
    const fails: Array<{ tcid: string; title: string; run: string }> = []
    for (const it of itemRows) {
      const hit = got.get(it.tcid)
      if (!hit) stat.none++
      else if (hit.v === 'pass') stat.pass++
      else if (hit.v === 'fail') {
        stat.fail++
        fails.push({ tcid: it.tcid, title: it.title, run: hit.run })
      } else stat.etc++
    }
    stat.rate = stat.pass + stat.fail ? Math.round((stat.pass / (stat.pass + stat.fail)) * 100) : 0
    /* 「다 왔나」 는 isLoading 으로 재면 안 된다 — enabled 가 켜지기 직전에는
       아직 안 도는 쿼리도 isLoading=false 라, 빈 손으로 ready 가 되어
       초안이 「실패 0」 으로 굳었다(실측). 자료가 실제로 왔는지를 본다. */
    return {
      stat,
      fails,
      /* 셋업(판정 계열)까지 와야 셈이 맞다 — 커스텀 pass/fail 이 폴백(중립)으로
         셈해진 초안이 굳으면 안 된다(검증 지적) */
      ready:
        verdsReady &&
        (!myRuns.length || failQs.every((q2) => q2.data !== undefined || q2.isError)),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myRuns, itemRows, failQs.map((q2) => q2.dataUpdatedAt).join(','), verds, verdsReady])

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
        .filter((x) => String(x.kind) === 'model' && String(x.model_group ?? '') === String(plan?.model_group ?? ''))
        .map((x) => String(x.name ?? '')))].filter(Boolean).sort(cmp),
    [catQ.data, plan, cmp],
  )
  const vgOfModel = useMemo(
    () => (vgQ.data?.groups ?? {})[String(plan?.model ?? '')] ?? [],
    [vgQ.data, plan],
  )

  /** 모델그룹·모델명 바꾸기 — 담긴 항목은 모델 규칙으로 담긴 것이라,
      모델이 달라지면 물어보고 비운다(목업의 규칙 그대로) */
  async function setTarget(mg: string, model: string) {
    if (!full || !plan) return
    let nextModel = model
    if (!nextModel) {
      const ms = ((catQ.data?.items ?? []) as Array<Record<string, unknown>>)
        .filter((x) => String(x.kind) === 'model' && String(x.model_group ?? '') === mg)
        .map((x) => String(x.name ?? ''))
      nextModel = ms.includes(String(plan.model ?? '')) ? String(plan.model ?? '') : (ms[0] ?? '')
    }
    const modelChanged = nextModel !== String(plan.model ?? '')
    const n = (full.items ?? []).length
    if (modelChanged && n) {
      if (
        !window.confirm(
          `대상 모델을 ${nextModel || '(없음)'} 로 바꾸면 담긴 시험 항목 ${n}건이 비워집니다.\n` +
            '항목은 모델그룹·모델명 규칙으로 담긴 것이라 그대로 둘 수 없습니다.\n계속할까요?',
        )
      )
        return
    }
    await saveFull({
      model_group: mg,
      model: nextModel,
      ...(modelChanged && n ? { items: [] } : {}),
    })
  }

  /** 버전그룹 바꾸기 — 그 모델의 폴더 목록에도 넣어 트리와 한 살림으로 */
  async function setVg(vg: string) {
    if (!plan) return
    await saveFull({ version_group: vg })
    if (vg && plan.model) {
      await apiFetch('/api/cycle-version-groups/add', {
        method: 'POST',
        body: JSON.stringify({ model: plan.model, group: vg }),
      }).catch(() => undefined)
      void vgQ.refetch()
    }
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
    setVf(null)
    prefSet('utop.runs.open', id)
  }
  /* 상세가 다른 사이클로 바뀌면 — 실행 선택을 그 사이클의 최신으로 맞추고
     실행기·필터를 접는다 */
  useEffect(() => {
    setRunnerOn(false)
    setWide(false)
    setVf(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  useEffect(() => {
    if (!open) return
    if (selRun && myRuns.some((r) => r.id === selRun)) return
    const first = myRuns[0]?.id ?? ''
    setSelRun(first)
    if (first) prefSet('utop.runs.open', first)
    else prefRemove('utop.runs.open')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, myRuns])

  async function saveRun(patch: Record<string, unknown>) {
    if (!selRun) return
    const r = await apiFetch(`/api/plan-runs/${encodeURIComponent(selRun)}`, {
      method: 'POST',
      body: JSON.stringify(patch),
    })
    if (!r.ok) {
      window.alert('저장하지 못했습니다')
      return
    }
    await qc.invalidateQueries({ queryKey: ['plan-run', selRun] })
    await qc.invalidateQueries({ queryKey: ['plan-runs'] })
  }

  async function delRun(id: string) {
    const r = runs.find((x) => x.id === id)
    if (!r) return
    const done = r.n_pass + r.n_fail + r.n_etc
    if (
      !window.confirm(
        `시험 실행 「${r.name || r.id}」 을 지웁니다. 되돌릴 수 없습니다.` +
          (done ? `\n\n이미 판정한 항목 ${done}건의 결과도 함께 사라집니다.` : ''),
      )
    )
      return
    await apiFetch(`/api/plan-runs/${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (selRun === id) {
      setSelRun('')
      prefRemove('utop.runs.open')
      setRunnerOn(false)
      setWide(false)
    }
    void runsQ.refetch()
  }

  /**
   * 시험 실행을 뜬다 — **담긴 항목 전부**(자동·수동은 실행 안에서 골라
   * 돌린다). 담는 차례는 화면에 보이는 그 차례(폴더 ▸ REQ ▸ ID)다.
   */
  async function makeRun(p: CycleMeta) {
    const ids = orderTcIds(
      (p.items ?? []).map((it) => String(it?.tcid ?? '')).filter(Boolean),
      tcOf,
      reqIndex,
    )
    if (!ids.length) {
      window.alert('담긴 시험 항목이 없습니다 — 시험 항목 탭에서 먼저 담으세요.')
      return
    }
    setBusyRun('1')
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
      if (j.id) {
        openRun(j.id)
        setTab('run')
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyRun('')
    }
  }

  /** 실행기를 연다 — 그 방식의 항목만, 표에 보이는 차례로 */
  function openRunner(mode: 'A' | 'M', focus = '') {
    setRunMode(mode)
    setRunFocus(focus)
    setRunnerOn(true)
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
    const ids = (runFull.items ?? []).map((x) => String(x?.tcid ?? '')).filter(Boolean)
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
  }, [runFull, tcOf, reqIndex, verds])
  const runTally = useMemo(() => {
    const t = { p: 0, f: 0, b: 0, n: 0, total: runItems.length, done: 0 }
    for (const it of runItems) t[vLetter(verds, it.v)]++
    t.done = t.p + t.f + t.b
    return t
  }, [runItems, verds])
  const runByVerd = useMemo(() => {
    const m = new Map<string, number>()
    for (const it of runItems) m.set(it.v, (m.get(it.v) ?? 0) + 1)
    return m
  }, [runItems])
  const shownRunItems = useMemo(
    () => runItems.filter((it) => vf === null || it.v === vf),
    [runItems, vf],
  )

  async function setVerdict(tcid: string, v: string) {
    if (!runFull) return
    await saveRun({ results: { ...(runFull.results ?? {}), [tcid]: v } })
  }
  async function setWho(tcids: string[], who: string) {
    if (!runFull) return
    const asg = { ...(runFull.assignees ?? {}) }
    for (const id of tcids) asg[id] = who
    await saveRun({ assignees: asg })
  }
  /** 판정 일괄 — 노션 표의 「상태 바꾸기」 가 부른다. 미실행이 곧 초기화다 */
  async function setVerdicts(tcids: string[], v: string) {
    if (!runFull || !tcids.length) return
    const results = { ...(runFull.results ?? {}) }
    for (const id of tcids) results[id] = v
    await saveRun({ results })
  }
  async function dropRunItems(tcids: string[]) {
    if (!runFull || !tcids.length) return
    if (
      !window.confirm(
        `시험 항목 ${tcids.length}건을 이 실행에서 뺍니다.\n판정 결과도 함께 사라집니다.`,
      )
    )
      return
    const gone = new Set(tcids)
    const items = (runFull.items ?? []).filter((x) => !gone.has(String(x?.tcid ?? '')))
    const results = Object.fromEntries(
      Object.entries(runFull.results ?? {}).filter(([k]) => !gone.has(k)),
    )
    await saveRun({ items, results })
  }

  /* ── 그리기 ── */
  const kv = (k: string, v: React.ReactNode) => (
    <>
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </>
  )


  /* ── 1열: 사이클 트리 ── */
  function renderSide() {
    return (
      <section className="panel run-side">
        <div className="run-side-hd">
          <b>시험 사이클</b>
          <span className="cu-sp" />
          <button type="button" className="cu-new small" title="새 사이클을 만듭니다" onClick={() => setMaking(true)}>
            <i aria-hidden="true">＋</i>사이클
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
                </span>
                <span className={`c${n.zero ? ' zero' : ''}`} title={n.plan ? `실행 ${n.n}회` : `사이클 ${n.n}건`}>{n.n}</span>
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
      <IconPanel open={sideOn} />
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
          <span className="crumbline">
            <button type="button" className="crumb-b" onClick={() => { setGrpSel(null) }}>전체</button>
            {crumb.map(([k, l], i) => (
              <React.Fragment key={k}>
                <span className="cu-m">▸</span>
                {i === crumb.length - 1 ? (
                  <b>{l}</b>
                ) : (
                  <button type="button" className="crumb-b" onClick={() => pickCrumb(k)}>{l}</button>
                )}
              </React.Fragment>
            ))}
          </span>
          <span className="cu-sp" />
        </div>
        <div className="lp-hd">
          <h1>시험 사이클</h1>
          <span className="cu-m">사이클은 한 버전의 시험 묶음입니다 — 실행·판정·결과서도 이 안에서 봅니다</span>
          <span className="cu-sp" />
          <button type="button" className="cu-new" onClick={() => setMaking(true)}>
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
            bulk={[
              { k: 'run', label: '실행 만들기' },
              { k: 'clone', label: '복제' },
              { k: 'edit', label: '고치기' },
              { k: 'csv', label: 'CSV' },
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
              if (a === 'run') {
                openPlanId(one)
                setNeedMake(true)
                setMkRun(true)
              } else if (a === 'clone') setCloneId(one)
              else if (a === 'edit') {
                openPlanId(one)
                setEdit(true)
              } else if (a === 'csv') void csvPlan(one)
            }}
            renderCell={(row, col) => {
              if (col.key === 'stat') {
                const rs = runsByPlan.get(String(row.__id)) ?? []
                const t = sumRuns(rs)
                return t.total ? <StatBar t={t} pal={verdPal} /> : <span className="cu-m">—</span>
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

  /* ── 상세: 개요 ── */
  function renderOverview() {
    if (!plan) return null
    const pctA = itemRows.length ? Math.round((nAuto / itemRows.length) * 100) : 0
    const pctM = itemRows.length ? Math.round((nMan / itemRows.length) * 100) : 0
    const cov = poolN ? ((itemRows.length / poolN) * 100).toFixed(1) : '0.0'
    const reqN = new Set(itemRows.map((r) => r.reqLabel).filter(Boolean)).size
    return (
      <div className="cu-scroll">
        <div className="cu-sec statrow">
          <div className="cu-card statcard">
            <h2>자동 시험</h2>
            <div className="sbody">
              <Donut parts={[{ v: nAuto, cls: 'a' }]} total={itemRows.length} label={String(nAuto)} sub={`${pctA}%`} />
              <div className="statcap">{nAuto ? '장비에 접속해 스텝을 순서대로 돌립니다' : '자동 항목이 없습니다'}</div>
            </div>
          </div>
          <div className="cu-card statcard">
            <h2>수동 시험</h2>
            <div className="sbody">
              <Donut parts={[{ v: nMan, cls: 'm' }]} total={itemRows.length} label={String(nMan)} sub={`${pctM}%`} />
              <div className="statcap">{nMan ? '사람이 확인하고 판정을 기록합니다' : '수동 항목이 없습니다'}</div>
            </div>
          </div>
          <div className="cu-card statcard">
            <h2>커버리지</h2>
            <div className="sbody">
              <Donut parts={[{ v: itemRows.length, cls: 'c' }]} total={poolN} label={String(itemRows.length)} sub={`${cov}%`} />
              <div className="statcap">
                {String(plan.model ?? plan.model_group ?? '전체')} 시험 {poolN}건 중
              </div>
            </div>
          </div>
        </div>

        {/* 기본 정보 — **네 묶음으로 가른다**(지시):
            대상 │ 사이클 │ 구성 │ 사람·이력. 한 판에 열두 칸을 늘어놓았더니
            어느 칸이 어느 얘기인지 눈이 매번 갈랐다. 설명은 지시 목록에
            없지만 고칠 자리가 사라지면 안 되어 아래 한 줄로 남긴다. */}
        <div className="cu-sec metarow">
          <div className="cu-card metacard">
            <h2>대상</h2>
            <div className="pad">
              {/* 값을 그 자리에서 고친다(지시: 드롭다운) — 목록이 있는 칸은
                  드롭다운, 버전명은 자유 글이라 입력칸이다 */}
              <div className="kv1">
                {kv(
                  '모델그룹',
                  <select
                    className="kvin cu-mono"
                    value={String(plan.model_group ?? '')}
                    onChange={(e) => void setTarget(e.target.value, '')}
                  >
                    {!catGroups.includes(String(plan.model_group ?? '')) && (
                      <option value={String(plan.model_group ?? '')}>{String(plan.model_group ?? '') || '(안 고름)'}</option>
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
                    value={String(plan.model ?? '')}
                    onChange={(e) => void setTarget(String(plan.model_group ?? ''), e.target.value)}
                  >
                    {!catModels.includes(String(plan.model ?? '')) && (
                      <option value={String(plan.model ?? '')}>{String(plan.model ?? '') || '(안 고름)'}</option>
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
                    value={String(plan.version_group ?? '')}
                    onChange={(e) => void setVg(e.target.value)}
                  >
                    {!vgOfModel.includes(String(plan.version_group ?? '')) && (
                      <option value={String(plan.version_group ?? '')}>{String(plan.version_group ?? '') || '(안 고름)'}</option>
                    )}
                    {vgOfModel.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>,
                )}
                {kv(
                  '버전명',
                  <input
                    className="kvin cu-mono"
                    defaultValue={String(plan.version ?? '')}
                    onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
                    onBlur={(e) => {
                      const v = e.target.value.trim()
                      if (v && v !== String(plan.version ?? '')) void saveFull({ version: v })
                    }}
                  />,
                )}
              </div>
            </div>
          </div>
          <div className="cu-card metacard">
            <h2>사이클</h2>
            <div className="pad">
              <div className="kv1">
                {kv('사이클 ID', <span className="cu-mono">{String(plan.cid ?? plan.id)}</span>)}
                {kv(
                  '사이클 제목',
                  <span
                    className="edt desc"
                    title="더블클릭하면 고칩니다"
                    onDoubleClick={(e) =>
                      editInline(e.currentTarget, String(plan.name ?? ''), (v) => {
                        if (v.trim()) void saveFull({ name: v.trim() })
                      })
                    }
                  >
                    {String(plan.name ?? plan.version ?? '') || <span className="cu-m">—</span>}
                  </span>,
                )}
              </div>
            </div>
          </div>
          <div className="cu-card metacard">
            <h2>구성</h2>
            <div className="pad">
              <div className="kv1">
                {kv('요구사항', <>{reqN}건</>)}
                {kv(
                  '시험 항목',
                  <>
                    {itemRows.length}건 <span className="cu-m">(자동 {nAuto} · 수동 {nMan})</span>
                  </>,
                )}
              </div>
            </div>
          </div>
          <div className="cu-card metacard">
            <h2>사람 · 이력</h2>
            <div className="pad">
              <div className="kv1">
                {kv(
                  '담당자',
                  /* 조직을 눌러 좁히거나 이름으로 찾아 고른다(지시) —
                     온 화면 공용 고르개(AssigneePicker) 그대로 */
                  <button
                    type="button"
                    className="kvin cyb-ass"
                    onClick={(e) => {
                      const r2 = (e.currentTarget as HTMLElement).getBoundingClientRect()
                      setAssAt({ x: r2.left, y: r2.bottom + 4 })
                    }}
                  >
                    {String(plan.assignee ?? '') || <span className="cu-m">(안 정함)</span>}
                    <span className="cu-m"> ▾</span>
                  </button>,
                )}
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
        <div className="cu-sec cu-card">
          <h2>설명</h2>
          <div className="pad">
            <span
              className="edt desc"
              title="더블클릭하면 고칩니다"
              onDoubleClick={(e) => editInline(e.currentTarget, String(plan.description ?? ''), (v) => void saveFull({ description: v }))}
            >
              {String(plan.description ?? '') || <span className="cu-m">—</span>}
            </span>
          </div>
        </div>

        <div className="cu-sec cu-card flat">
          {/* ＋ 실행은 머리줄에 이미 있다 — 같은 단추가 두 곳이면 어느
              쪽이 정본인지 헷갈린다(지적: 중복) */}
          <h2>
            이 사이클의 실행 <span className="dim">{myRuns.length}</span>
          </h2>
          {myRuns.length ? (
            <table className="grid">
              <thead>
                <tr>
                  <th>실행 ID</th>
                  <th style={{ width: 72 }}>방식</th>
                  <th className="num" style={{ width: 60 }}>항목</th>
                  <th style={{ width: 180 }}>판정 현황</th>
                  <th style={{ width: 76 }}>담당</th>
                  <th style={{ width: 96 }}>생성</th>
                  <th style={{ width: 80 }}>진행</th>
                </tr>
              </thead>
              <tbody>
                {myRuns.map((r) => {
                  const t = sumRuns([r])
                  return (
                    <tr key={r.id} onClick={() => { setTab('run'); openRun(r.id) }} title="실행 탭에서 엽니다">
                      <td className="idcell cu-mono">{r.id}</td>
                      <td>{String(r.mode ?? '') || '—'}</td>
                      <td className="num">{r.n_total}</td>
                      <td>
                        <StatBar t={t} pal={verdPal} />
                      </td>
                      <td>{String(r.owner ?? '') || '—'}</td>
                      <td className="cu-m">{String(r.created_at ?? '').slice(0, 10)}</td>
                      <td>
                        {r.closed_at ? (
                          <span className="badge b-wait">종료</span>
                        ) : t.none ? (
                          <span className="badge b-run">{t.none} 남음</span>
                        ) : (
                          <span className="badge b-pass">완료</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <div className="cu-empty">
              <strong>아직 실행이 없습니다</strong>
              <span>담긴 항목으로 자동·수동 시험 실행을 만듭니다.</span>
            </div>
          )}
        </div>
        <p className="cu-m" style={{ margin: 0 }}>
          판정 결과는 실행 탭에서 봅니다 — 실행 하나가 빌드 하나의 결과입니다.
        </p>
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
  function renderItems() {
    if (!plan) return null
    const repeats = itemRows.filter((r) => {
      const s = failStat.get(r.tcid)
      return !!s && s.fail >= 2
    })
    const rows: NRow[] = itemRows.map((r) => {
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
            <button type="button" className="cu-new small" onClick={() => setAddTo(true)}>
              <i aria-hidden="true">＋</i>항목 담기
            </button>
          }
          perPage={100}
        />
        </div>
      </div>
    )
  }

  /* ── 상세: 실행 탭 — 옛 Runs 의 실행 본문 그대로 ── */
  function renderRunTab() {
    if (!plan) return null
    if (!myRuns.length) {
      const nIds = itemRows.length
      return (
        <div className="cu-fill">
          <div className="cu-empty" style={{ margin: 'auto', padding: '48px 14px' }}>
            <strong style={{ fontSize: 15 }}>이 사이클에는 아직 시험 실행이 없습니다</strong>
            <span>
              {nIds
                ? `담긴 시험 항목 ${nIds}건 (자동 ${nAuto} · 수동 ${nMan}) 을 담아 실행을 만듭니다 —
                   자동·수동은 만든 뒤 실행 안에서 골라 돌립니다.`
                : '담긴 시험 항목이 없습니다 — 시험 항목 탭에서 먼저 담으세요.'}
            </span>
            <div className="rnb-acts">
              <button
                type="button"
                className="cu-new"
                disabled={!nIds || !!busyRun}
                onClick={() => void makeRun(plan)}
              >
                <i aria-hidden="true">▶</i>
                {busyRun ? '만드는 중…' : `실행 만들기 ${nIds}건`}
              </button>
              <button
                type="button"
                className="btn"
                title="모델·버전을 직접 골라 실행을 만듭니다"
                onClick={() => {
                  setNeedMake(true)
                  setMkRun(true)
                }}
              >
                ＋ 실행 만들기
              </button>
            </div>
          </div>
        </div>
      )
    }
    const r = runLite && myRuns.some((x) => x.id === runLite.id) ? runLite : undefined
    if (!r)
      return (
        <div className="cu-fill">
          <div className="cu-empty" style={{ margin: 'auto' }}>
            <strong>불러오는 중…</strong>
          </div>
        </div>
      )
    const t = runTally
    const pct = t.total ? Math.round((t.done / t.total) * 100) : 0
    const nA = runItems.filter((x) => !x.man).length
    const nM = runItems.length - nA
    const modeTxt =
      r.mode === 'empty' ? '직접 구성' : nA && nM ? '전체 항목' : nA ? '자동' : nM ? '수동' : '빈 실행'
    const asgOf = new Map<string, number>()
    for (const it of runItems) {
      const k2 = it.who || String(r.owner ?? '') || '(안 정함)'
      asgOf.set(k2, (asgOf.get(k2) ?? 0) + 1)
    }
    return (
      <div className="cu-fill run-tab">
        {/* 실행 고르개 + 실행 하나짜리 일들 */}
        <div className="runpick">
          <span className="cu-m">이 사이클의 실행</span>
          {myRuns.map((x) => (
            <button
              key={x.id}
              type="button"
              className={`rpick${x.id === r.id ? ' on' : ''}`}
              onClick={() => openRun(x.id)}
            >
              {x.n_none ? '▤' : '✓'} {x.id}{' '}
              <span className="cu-m">{String(x.created_at ?? '').slice(0, 10)}</span>
            </button>
          ))}
          <span className="cu-sp" />
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

        {/* 제목 줄 + 자동·수동 열기 */}
        <div className="run-titlerow">
          <h1
            className="run-title edt"
            title="더블클릭하면 고칩니다"
            onDoubleClick={(e) =>
              editInline(e.currentTarget, String(r.name ?? r.id), (v) => {
                if (v.trim()) void saveRun({ name: v.trim() })
              }, true)
            }
          >
            {String(r.name || r.id)}
          </h1>
          <span className="cu-mono cu-m">({r.id})</span>
          <span className={`cu-chip${modeTxt === '자동' ? ' auto' : ''}`}>{modeTxt}</span>
          {!!t.total && !t.n && <span className="cu-chip done">✓ 완료</span>}
          {!!r.closed_at && <span className="cu-chip">종료</span>}
          <span className="cu-sp" />
          <button
            type="button"
            className="cu-new"
            disabled={!nA}
            title="장비에 접속해 스텝을 순서대로 돌립니다"
            onClick={() => openRunner('A')}
          >
            <i aria-hidden="true">▶</i>자동 시험 {nA}
          </button>
          <button
            type="button"
            className="btn small"
            disabled={!nM}
            title="사람이 확인하고 판정을 기록합니다"
            onClick={() => openRunner('M')}
          >
            ✎ 수동 시험 {nM}
          </button>
        </div>

        {/* 요약 */}
        {sumOff ? (
          <div className="run-sum mini">
            <button type="button" className="linkbtn" onClick={() => setSumOff(false)}>
              › 요약
            </button>
            {vf !== null && (
              <span className="vfchip">
                {vName(verds, vf)}만 보는 중
                <button type="button" className="linkbtn" onClick={() => setVf(null)}>전체</button>
              </span>
            )}
            <span className="cu-sp" />
            <span className="cu-m">{t.total}개의 시험 항목 · {pct}% 완료</span>
          </div>
        ) : (
          <div className="run-sum">
            <div className="run-sum-hd">
              <button type="button" className="linkbtn" onClick={() => setSumOff(true)}>
                ˅ 요약
              </button>
            </div>
            <div className="run-sum-body">
              <div className="sumdonut">
                <Donut
                  big
                  parts={[
                    { v: t.p, cls: 'p', color: vDef(verds, 'Pass').color },
                    { v: t.f, cls: 'f', color: vDef(verds, 'Fail').color },
                    { v: t.b, cls: 'b', color: vDef(verds, 'Blocked').color },
                  ]}
                  total={t.total}
                  label={`${pct}%`}
                  sub="완료"
                />
                <div className="cu-m">{t.total} 개 중 {t.done} 완료됨</div>
              </div>
              <div className="sumrows">
                {[
                  ...verds,
                  ...[...runByVerd.keys()]
                    .filter((k2) => !verds.some((d) => d.v === k2))
                    .map((k2) => ({ ...vDef(verds, k2), label: `${k2} (지워진 판정)` })),
                ].map((d) => {
                  const nn = runByVerd.get(d.v) ?? 0
                  const on = vf === d.v
                  return (
                    <button
                      key={d.v || '(none)'}
                      type="button"
                      className={`sumrow hit${on ? ' on' : vf !== null ? ' dim' : ''}`}
                      title={`${d.label}만 보기${on ? ' (해제하려면 다시 누르세요)' : ''}`}
                      onClick={() => setVf(on ? null : d.v)}
                    >
                      <span
                        className={`vpill${d.v ? '' : ' v-n'}`}
                        style={d.v ? { background: d.color, color: '#fff' } : undefined}
                      >
                        {t.total ? Math.round((nn / t.total) * 100) : 0}%
                      </span>
                      <b>{nn || '-'}</b>
                      <span className="cu-m">{d.label}</span>
                    </button>
                  )
                })}
              </div>
              <div className="sumbox">
                <div className="sumbox-tabs">
                  <button type="button" className={sumTab === 'team' ? 'on' : ''} onClick={() => setSumTab('team')}>
                    👤 팀
                  </button>
                  <button type="button" className={sumTab === 'info' ? 'on' : ''} onClick={() => setSumTab('info')}>
                    ▤ 세부 정보
                  </button>
                </div>
                <div className="sumbox-body">
                  {sumTab === 'team' ? (
                    <>
                      {[...asgOf.entries()].map(([w, nn]) => (
                        <div key={w} className="sumrow">
                          <span className="who">👤 {w}</span>
                          <span className="cu-m">{nn}개의 시험 항목</span>
                        </div>
                      ))}
                      <div className="sumbox-ft">{asgOf.size}명</div>
                    </>
                  ) : (
                    <div className="kvgrid tight">
                      {kv('실행 ID', <span className="cu-mono">{r.id}</span>)}
                      {kv('방식', modeTxt)}
                      {kv('버전그룹', <span className="cu-mono">{String(r.version_group ?? '') || '—'}</span>)}
                      {kv('버전명', <span className="cu-mono">{String(r.version ?? '') || '—'}</span>)}
                      {kv(
                        '담당',
                        <button
                          type="button"
                          className="kvin rnb-own"
                          onClick={(e) => {
                            const b = (e.currentTarget as HTMLElement).getBoundingClientRect()
                            setOwnAt({ x: b.left, y: b.bottom + 4 })
                          }}
                        >
                          {String(r.owner ?? '') || <span className="cu-m">(안 정함)</span>}
                          <span className="cu-m"> ▾</span>
                        </button>,
                      )}
                      {kv('생성', `${String(r.created_at ?? '').slice(0, 10)} · ${ago(r.created_at)}`)}
                      {kv('상태', r.closed_at ? '종료' : t.n ? `진행 중 · 미실행 ${t.n}건` : '완료')}
                      <span className="k">설명</span>
                      <span className="v wide">
                        <span
                          className="edt desc"
                          title="더블클릭하면 고칩니다"
                          onDoubleClick={(e) =>
                            editInline(e.currentTarget, String(runFull?.desc ?? ''), (v) => void saveRun({ desc: v }))
                          }
                        >
                          {String(runFull?.desc ?? '') || <span className="cu-m">—</span>}
                        </span>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 항목 표 — 노션 표(Runs 와 같은 열·저장키) */}
        <div className="rnb-ntb">
          <NTable
            columns={riCols.map((c) =>
              c.key === 'result'
                ? { ...c, options: verds.map((d) => ({ value: d.label, color: d.color })) }
                : c,
            )}
            rows={shownRunItems.map((it) => ({
              __id: it.tcid,
              id: it.tcid,
              title: it.title || '(이름 없음)',
              folder: it.folder,
              who: it.who,
              result: vName(verds, it.v),
            }))}
            view={riView}
            onView={setRiView}
            onColumns={setRiCols}
            people={people}
            meName={meName}
            onCell={(id, key, v) => {
              if (key === 'who') void setWho([id], v)
              if (key === 'result') {
                /* 「– 비움」·Delete 는 빈 글을 준다 — 미실행('') 판정이다 */
                const d = v === '' ? { v: '' } : verds.find((x) => x.label === v)
                if (d) void setVerdict(id, d.v)
              }
            }}
            readOnlyKeys={['id', 'title', 'folder']}
            lockDefs
            idKey="id"
            titleKey="title"
            rowIcon={(row) => {
              const man = runItems.find((x) => x.tcid === row.__id)?.man
              return <span className="cu-m" title={man ? '수동' : '자동'}>{man ? '✎' : '▶'}</span>
            }}
            onOpen={(id) => {
              const man = runItems.find((x) => x.tcid === id)?.man
              openRunner(man ? 'M' : 'A', id)
            }}
            onBulk={(a, ids) => {
              if (a === 'del') void dropRunItems(ids)
              else if (a === 'assign') setBulkAt({ kind: 'assign', ids })
              else if (a === 'status') setBulkAt({ kind: 'status', ids })
              else window.alert('이 표에서는 아직 없는 동작입니다')
            }}
            perPage={100}
          />
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
          <button type="button" className="btn icon" title="목록으로" onClick={closePlan}>
            ←
          </button>
          <b
            className="edt"
            title="더블클릭하면 제목을 고칩니다"
            onDoubleClick={(e) =>
              editInline(e.currentTarget, String(plan.name ?? ''), (v) => {
                if (v.trim()) void saveFull({ name: v.trim() })
              }, true)
            }
          >
            {String(plan.name ?? plan.version ?? plan.id)}
          </b>
          <span className="cu-chip plan">사이클</span>
          {!!plan.version_group && (
            <span className="cu-chip">
              <span className="cu-mono">{String(plan.version_group)}</span>
            </span>
          )}
          <span className="cu-m">
            {[plan.customer, plan.model].filter(Boolean).join(' · ') || '대상 미지정'}
          </span>
          <span className="cu-sp" />
          {/* ⋯ 는 걷었다(지시) — 복제·고치기·CSV·지우기·실행 만들기는
              목록에서 줄을 골랐을 때 아래 선택 바가 맡는다 */}
          <div className="cu-hdbtns">
            <button
              type="button"
              className="cu-new"
              title="이 사이클에 담긴 시험 항목으로 시험 실행을 만듭니다"
              onClick={() => {
                setNeedMake(true)
                setMkRun(true)
              }}
            >
              <i aria-hidden="true">＋</i>실행
            </button>
          </div>
        </div>
        {/* 순서는 **읽는 순서**다(옛 화면 그대로) — 한눈에 보고(개요),
            무엇이 일어났는지 읽고(AI 요약), 글로 옮기고(Test Summary),
            마지막에 항목 하나하나를 판다. */}
        <div className="cu-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'ov'} className={tab === 'ov' ? 'on' : ''} onClick={() => setTab('ov')}>
            개요
          </button>
          <button type="button" role="tab" aria-selected={tab === 'ai'} className={tab === 'ai' ? 'on' : ''} onClick={() => setTab('ai')}>
            AI 요약
          </button>
          <button type="button" role="tab" aria-selected={tab === 'sum'} className={tab === 'sum' ? 'on' : ''} onClick={() => setTab('sum')}>
            Test Summary
          </button>
          <button type="button" role="tab" aria-selected={tab === 'it'} className={tab === 'it' ? 'on' : ''} onClick={() => setTab('it')}>
            시험 항목 <span className="dim">{itemRows.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={tab === 'run'} className={tab === 'run' ? 'on' : ''} onClick={() => setTab('run')}>
            실행 <span className="dim">{myRuns.length}</span>
          </button>
        </div>
        {tab === 'ov' ? (
          renderOverview()
        ) : tab === 'ai' ? (
          /* AI 요약 — 창이 아니라 탭 안에(옛 화면 그대로). 부품 한 벌 */
          <div className="cu-fill">
            <CycleInsight
              inline
              mode="ai"
              cycleId={plan.id}
              title={[plan.model, plan.version].filter(Boolean).join(' · ') || String(plan.cid ?? plan.id)}
              items={[]}
              onClose={() => setTab('ov')}
            />
          </div>
        ) : tab === 'sum' ? (
          <div className="cu-fill">
            <TestSummary
              plan={plan}
              title={String(plan.name ?? plan.version ?? plan.id)}
              stat={sumOfRuns.stat}
              fails={sumOfRuns.fails}
              statReady={sumOfRuns.ready}
            />
          </div>
        ) : tab === 'run' ? (
          renderRunTab()
        ) : (
          renderItems()
        )}
      </section>
    )
  }

  const runnerCols = runnerOn && !!selRun && !!open && tab === 'run'
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
              /* 표에 보이는 그 차례 그대로 — 이 목록이 실행기가 도는 차례다 */
              only={runItems.filter((x) => (runMode === 'M' ? x.man : !x.man)).map((x) => x.tcid)}
              focus={runFocus}
              onBack={() => setRunnerOn(false)}
              lead={
                <button
                  type="button"
                  className="cu-colbtn"
                  title={wide ? '축소' : '전체로 확장'}
                  onClick={() => setWide((v) => !v)}
                >
                  {wide ? '⇤' : '⇥'}
                </button>
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

      {/* 실행 더보기 — 실행 하나짜리 일들 */}
      {!!runMoreAt && !!runLite && (
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
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setRunMoreAt(null)
                setNeedMake(true)
                setMkRun(true)
              }}
            >
              ＋ 실행 하나 더
            </button>
            <div className="qa-menusep" />
            <button
              type="button"
              role="menuitem"
              className="danger"
              onClick={() => {
                setRunMoreAt(null)
                void delRun(runLite.id)
              }}
            >
              실행 지우기
            </button>
          </div>
        </>
      )}

      {/* 노션 표의 「담당 일괄」 — 조직·검색 되는 공용 고르개 */}
      {!!bulkAt && bulkAt.kind === 'assign' && (
        <AssigneePicker
          at={{ x: window.innerWidth / 2 - 150, y: 160 }}
          me={meName}
          onPick={(name) => { const ids = bulkAt.ids; setBulkAt(null); void setWho(ids, name) }}
          onClose={() => setBulkAt(null)}
        />
      )}
      {/* 「상태 바꾸기」 — 셋업의 판정 목록 그대로 */}
      {!!bulkAt && bulkAt.kind === 'status' && (
        <>
          <span className="qa-moreovl" role="presentation" onClick={() => setBulkAt(null)} />
          <div className="qa-menu" role="menu" style={{ left: '50%', top: 160, transform: 'translateX(-50%)' }}>
            <div className="qa-menuh">고른 {bulkAt.ids.length}건의 결과</div>
            {verds.map((d) => (
              <button key={d.v || '(none)'} type="button" role="menuitem" onClick={() => { setBulkAt(null); void setVerdicts(bulkAt.ids, d.v) }}>
                <i className="qa-dot" style={{ background: d.color }} /> {d.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* 실행 담당 고르개 */}
      {!!ownAt && !!selRun && (
        <AssigneePicker
          at={ownAt}
          value={String(runs.find((x) => x.id === selRun)?.owner ?? '')}
          me={meName}
          onPick={(name) => void saveRun({ owner: name })}
          onClose={() => setOwnAt(null)}
        />
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
          onClose={() => setMaking(false)}
          onMade={(id) => {
            setMaking(false)
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
