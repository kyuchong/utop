/**
 * **Cycles — 사이클 목록과 상세** (지시: 목업 반영, 기존 화면 대체).
 *
 * 목업의 Plans 화면을 실제 자료에 얹었다. 목록은 사이클(cycle 표) 전부를
 * 한 표로 세우고, 한 건을 열면 Testiny 식 상세가 선다 —
 *   개요      자동·수동·커버리지 도넛 3장 + 기본 정보 + 이 사이클의 실행
 *   시험 항목  폴더 ▸ REQ ▸ TC 로 묶인 표 + 담기 + 실패 이력
 *
 * 실행(판정)은 Runs 화면이 맡는다 — 사이클은 「무엇을 시험할지」 만 정한다.
 * 만들기·담기·실행 만들기 창은 **쓰던 부품 그대로**다(MakeCycle · PickItems ·
 * MakePlanRun) — 베껴 만들면 한쪽만 고치는 날이 온다.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { goto, onGoto, reflectUrl } from '@/api/goto'
import { prefGet, prefRemove, prefSet } from '@/lib/prefs'
import { normMode } from '@/lib/runMode'
import { exportCycleCsv, CloneDialog } from '@/pages/Cycles'
import type { CycleItemLite, CycleMeta } from '@/pages/Cycles'
import type { TestCaseMeta } from '@/types'
import type { RunFull } from '@/components/run/RunDetail'
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
import { useVerdictsState, vDef, vGroup } from '@/lib/verdicts'
import type { RunLite } from '@/pages/qaBits'
import './QaShared.css'
import './CyclesBoard.css'

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
  const [tab, setTab] = useState<'ov' | 'ai' | 'sum' | 'it'>('ov')
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
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plans],
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

  async function dropItems(ids: string[]) {
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

  /* ── 그리기 ── */
  const kv = (k: string, v: React.ReactNode) => (
    <>
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </>
  )


  /* ── 목록 화면 ── */
  /**
   * 목록 — **노션 표**(지시). 검색·거르기·정렬·묶기·열 폭이 상세의 항목
   * 표·REQ-Coverage 와 한 벌이다. 담당은 칸에서 바로 바꾼다(전문을 읽어
   * 통째로 되민다 — 서버 계약). 줄 일들(복제·CSV·지우기)은 줄 ⋯ 대신
   * 선택 바(삭제)와 목록 위 ＋ 사이클, ID 열기로 잇는다.
   */
  function renderList() {
    const listRows: NRow[] = rows.map((p) => {
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
        runs: rs.length ? `${rs.length}회${openRunN ? ` (진행 ${openRunN})` : ''}` : '',
        last: last ? `${String(last.name || last.id)} · ${ago(last.created_at)}` : '',
        stat: t.total ? `통과 ${t.pass} · 실패 ${t.fail} · 미실행 ${t.none}` : '',
        assignee: String(p.assignee ?? ''),
        created: String(p._created_at_pg ?? '').slice(0, 10),
      }
    })
    return (
      <section className="panel lp">
        <div className="lp-hd">
          <h1>시험 사이클</h1>
          <span className="cu-m">사이클은 한 버전의 시험 묶음입니다 — 판정은 Runs 에서 봅니다</span>
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
            readOnlyKeys={['id', 'title', 'vg', 'customer', 'mg', 'model', 'items', 'runs', 'last', 'stat', 'created']}
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
                    <tr key={r.id} onClick={() => goto('run', r.id)} title="Runs 에서 엽니다">
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
          판정 결과는 Runs 에서 봅니다. 사이클은 무엇을 시험할지만 정합니다.
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
            if (a === 'del') void dropItems(ids)
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
        ) : (
          renderItems()
        )}
      </section>
    )
  }

  return (
    <div className="qav cyb">
      {open ? renderDetail() : renderList()}

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
            /* 실행은 Runs 가 제자리다 — 만든 것을 그 화면에서 연다 */
            goto('run', id)
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
