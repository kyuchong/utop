/**
 * **Runs — 시험 실행** (지시: 목업 반영, 기존 화면 대체).
 *
 *   1열  트리 — 사업자 ▸ 모델 ▸ 버전그룹 ▸ 버전명(사이클). 실행이 아직
 *         없는 사이클도 선다 — 여기서 시험을 시작해야 하므로.
 *   2열  고른 자리 —
 *         묶음(사업자·모델·버전그룹)  판정 막대 + 실행 표
 *         사이클                       실행이 없으면 시작 화면, 있으면 실행 본문
 *         실행 본문                    요약(도넛·판정 알약·팀/세부) + 항목 표
 *   3열  실행기 — **쓰던 부품 그대로**(RunDetail). 자동은 콘솔이 흐르고
 *         수동은 절차마다 판정한다. 베껴 만들면 한쪽만 고치는 날이 온다.
 *
 * 판정의 정본은 실행 기록(plan_run.data.results)이다 — 사이클이 아니라
 * 실행이 정본이라야 빌드마다 결과가 따로 남는다.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { goto, onGoto, reflectUrl } from '@/api/goto'
import { prefGet, prefRemove, prefSet } from '@/lib/prefs'
import { normMode } from '@/lib/runMode'
import Resizer, { useResizableWidth } from '@/components/Resizer'
import { IconChevron, IconPanel } from '@/components/icons'
import RunDetail from '@/components/run/RunDetail'
import type { RunFull } from '@/components/run/RunDetail'
import MakeCycle from '@/components/cycle/MakeCycle'
import { MakePlanRun } from '@/components/cycle/PlanRunPopup'
import { CycleMailOne } from '@/components/cycle/CyclePlan'
import CycleReport from '@/components/cycle/CycleReport'
import type { CycleMeta } from '@/pages/Cycles'
import type { TestCaseMeta } from '@/types'
import { Donut, StatBar, VERD, ago, orderTcIds, sumRuns, useReqIndex, useUserNames, verdName } from '@/pages/qaBits'
import type { RunLite } from '@/pages/qaBits'
import './QaShared.css'
import './RunsBoard.css'

/** 실행 전문 + 이 화면이 실행 기록(data)에 얹어 두는 값 */
interface RunFullX extends RunFull {
  /** 항목별 할당 대상 — { tcid: 이름 }. 이 화면이 적고 이 화면이 읽는다 */
  assignees?: Record<string, string>
  /** 실행 설명 — 세부 정보 탭에서 고친다 */
  desc?: string
}

/** 트리의 고른 자리 */
interface Sel {
  t: 'cust' | 'model' | 'vg' | 'plan' | 'loose'
  k: string
}

const keyOf = (...parts: string[]) => parts.join('|')

export default function RunsBoard({
  me,
}: {
  me?: { username?: string; name?: string; role?: string } | null
}) {
  const qc = useQueryClient()
  const meName = me?.name || me?.username || ''

  const [sel, setSel] = useState<Sel | null>(null)
  const [selRun, setSelRun] = useState(() => prefGet('utop.runs.open') ?? '')
  /** 3열 실행기 */
  const [openDetail, setOpenDetail] = useState(false)
  /** 실행기에서 지금 돌리는 방식 — 실행의 성격이 아니라 「무엇을 돌리나」 */
  const [runMode, setRunMode] = useState<'A' | 'M'>('A')
  /** 표에서 그 줄을 눌러 열었을 때 짚을 항목 */
  const [runFocus, setRunFocus] = useState('')
  const [wide, setWide] = useState(false)
  const [sideOn, setSideOn] = useState(() => prefGet('utop.runs.side') !== '0')
  const [w1, setW1] = useResizableWidth('utop.ntb.runs.w1', 264, 180, 620)
  const gridRef = useRef<HTMLDivElement>(null)
  /** 접힌 트리 마디 — 기본은 전부 펼침 */
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const [treeQ, setTreeQ] = useState('')
  /** 실행 본문 */
  const [sumOff, setSumOff] = useState(false)
  const [sumTab, setSumTab] = useState<'team' | 'info'>('team')
  const [itemQ, setItemQ] = useState('')
  const [vf, setVf] = useState('')
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  /** 창들 */
  const [making, setMaking] = useState(false)
  const [mkRunFor, setMkRunFor] = useState('')
  const [mailPlan, setMailPlan] = useState<CycleMeta | null>(null)
  const [repPlan, setRepPlan] = useState<CycleMeta | null>(null)
  const [moreAt, setMoreAt] = useState<{ x: number; y: number } | null>(null)
  /** 결과 메일·결과서 — 묶음에 사이클이 여럿이면 고른 뒤 연다 */
  const [pickAt, setPickAt] = useState<{ x: number; y: number; kind: 'mail' | 'report'; plans: CycleMeta[] } | null>(null)
  const [busyRun, setBusyRun] = useState('')
  const [needMake, setNeedMake] = useState(false)

  useEffect(() => prefSet('utop.runs.side', sideOn ? '1' : '0'), [sideOn])

  /* ── 자료 ── */
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
  const plansQ = useQuery({
    queryKey: ['cycles'],
    staleTime: 60_000,
    queryFn: async () => {
      const r = await apiFetch('/api/cycle?meta=1')
      if (!r.ok) throw new Error('사이클을 불러오지 못했습니다')
      return (await r.json()) as { cycles?: CycleMeta[]; items?: CycleMeta[] }
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
    enabled: needMake,
    staleTime: 60_000,
    queryFn: async () => {
      const r = await apiFetch('/api/device-catalog2')
      if (!r.ok) throw new Error('장비 카탈로그를 불러오지 못했습니다')
      return (await r.json()) as { items: Array<Record<string, unknown>> }
    },
  })
  const users = useUserNames()
  const reqIndex = useReqIndex()

  const runs = useMemo(() => runsQ.data?.runs ?? [], [runsQ.data])
  const plans = useMemo(() => plansQ.data?.cycles ?? plansQ.data?.items ?? [], [plansQ.data])
  const planOf = useMemo(() => new Map(plans.map((p) => [p.id, p])), [plans])
  const tcOf = useMemo(
    () => new Map((tcQ.data?.tcs ?? []).map((t) => [t.tcid, t])),
    [tcQ.data],
  )
  const cmp = useMemo(
    () => new Intl.Collator('ko', { numeric: true, sensitivity: 'base' }).compare,
    [],
  )

  /** 이 시험이 수동인가 — 정본은 TC 의 run_type(팀이 바꾼 「M」 도 알아듣는다) */
  const isManTc = (tcid: string) => {
    const t = tcOf.get(tcid)
    return normMode(String(t?.run_type ?? t?.kind ?? '')) === '수동'
  }

  /** 실행의 자리 — 사이클이 사업자·모델을 안다 */
  const whereOf = useMemo(() => {
    return (r: RunLite) => {
      const p = r.plan_id ? planOf.get(r.plan_id) : undefined
      return {
        cust: String(p?.customer || '미지정'),
        model: String(p?.model || '미지정'),
        vg: String(p?.version_group || r.version_group || '미지정'),
        plan: p,
      }
    }
  }, [planOf])

  const runsByPlan = useMemo(() => {
    const m = new Map<string, RunLite[]>()
    for (const r of runs) {
      const k = String(r.plan_id ?? '')
      if (!k || !planOf.get(k)) continue
      const arr = m.get(k) ?? []
      arr.push(r)
      m.set(k, arr)
    }
    for (const arr of m.values())
      arr.sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
    return m
  }, [runs, planOf])
  const looseRuns = useMemo(
    () => runs.filter((r) => !r.plan_id || !planOf.get(String(r.plan_id))),
    [runs, planOf],
  )

  /* ── 자리 잡기 ── */
  const openRunId = (id: string) => {
    setSelRun(id)
    setTicked(new Set())
    setVf('')
    prefSet('utop.runs.open', id)
    reflectUrl('run', id)
    const r = runs.find((x) => x.id === id)
    const p = r?.plan_id ? planOf.get(String(r.plan_id)) : undefined
    setSel(p ? { t: 'plan', k: p.id } : { t: 'loose', k: '' })
  }
  const clearRun = () => {
    setSelRun('')
    prefRemove('utop.runs.open')
  }
  const pickPlan = (p: CycleMeta) => {
    setSel({ t: 'plan', k: p.id })
    const first = (runsByPlan.get(p.id) ?? [])[0]
    if (first) openRunId(first.id)
    else clearRun()
  }
  const pickGroup = (t: Sel['t'], k: string) => {
    setSel({ t, k })
    clearRun()
  }

  /* 다른 화면에서 「이 실행을 열어 줘」 (?run= 링크) */
  useEffect(() => onGoto((kind, id) => kind === 'run' && openRunId(id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runs, planOf])

  /* 처음 열면 — 주소의 실행이 먼저, 없으면 가장 최근 자리. 빈 화면은
     「고장났다」 로 읽힌다. */
  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current || !runsQ.isSuccess || !plansQ.isSuccess) return
    seeded.current = true
    if (selRun && runs.some((r) => r.id === selRun)) {
      openRunId(selRun)
      return
    }
    const newest = [...runs].sort((a, b) =>
      String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')),
    )[0]
    if (newest) {
      openRunId(newest.id)
      return
    }
    const p = [...plans].sort((a, b) =>
      cmp(String(b.version ?? b.name ?? ''), String(a.version ?? a.name ?? '')),
    )[0]
    if (p) pickPlan(p)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runsQ.isSuccess, plansQ.isSuccess])

  /* 남이 지운 실행을 붙들고 있으면 본문이 영영 빈다 */
  useEffect(() => {
    if (!selRun || !runsQ.isSuccess || runsQ.isFetching) return
    if (!runs.some((r) => r.id === selRun)) {
      clearRun()
      setOpenDetail(false)
      setWide(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs, selRun, runsQ.isSuccess, runsQ.isFetching])

  /* ── 실행 전문 — 본문 표·요약이 본다 ── */
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
  const runPlan = runLite?.plan_id ? planOf.get(String(runLite.plan_id)) : undefined

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
      clearRun()
      setOpenDetail(false)
      setWide(false)
    }
    void runsQ.refetch()
  }

  /** 사이클을 지운다 — 딸린 실행·판정 결과가 함께 간다(트리의 ✕) */
  async function delPlan(p: CycleMeta) {
    const mine = runsByPlan.get(p.id) ?? []
    const s = sumRuns(mine)
    if (
      !window.confirm(
        `사이클 「${p.name ?? p.version ?? p.id}」 을 지웁니다. 되돌릴 수 없습니다.\n` +
          `시험 항목 ${p.items?.length ?? p._item_count ?? 0}건` +
          (mine.length ? ` · 시험 실행 ${mine.length}건` : '') +
          (s.done ? `\n\n※ 이미 판정한 항목 ${s.done}건의 결과도 함께 사라집니다.` : ''),
      )
    )
      return
    for (const r of mine)
      await apiFetch(`/api/plan-runs/${encodeURIComponent(r.id)}`, { method: 'DELETE' })
    await apiFetch(`/api/cycle/${encodeURIComponent(p.id)}`, { method: 'DELETE' })
    const model = String(p.model ?? '')
    const vg = String(p.version_group ?? '')
    const left = plans.some(
      (x) => x.id !== p.id && String(x.model ?? '') === model && String(x.version_group ?? '') === vg,
    )
    if (model && vg && !left) {
      try {
        await apiFetch(
          `/api/cycle-version-groups/${encodeURIComponent(model)}/${encodeURIComponent(vg)}`,
          { method: 'DELETE' },
        )
      } catch { /* 못 걷어도 사이클은 이미 갔다 */ }
    }
    if (sel?.t === 'plan' && sel.k === p.id) setSel(null)
    if (selRun && mine.some((r) => r.id === selRun)) {
      clearRun()
      setOpenDetail(false)
      setWide(false)
    }
    void plansQ.refetch()
    void runsQ.refetch()
    void qc.invalidateQueries({ queryKey: ['cycle-version-groups'] })
  }

  /**
   * 시험 실행을 뜬다 — **담긴 항목 전부**를 담아서(지시: 목업).
   *
   * 실행을 자동용·수동용으로 가르지 않는다. 실행 하나가 그 버전의 전
   * 항목을 들고, 자동·수동은 실행 **안에서** 골라 돌린다(위 두 단추).
   * 갈라 두었더니 같은 버전을 두 줄로 세어야 했고, 결과서도 둘로 났다.
   *
   * 담는 차례는 **화면에 보이는 그 차례**(폴더 ▸ REQ ▸ ID)다 — 실행기가
   * 도는 차례가 여기서 정해진다(지적: 왔다갔다 실행한다).
   */
  async function makeRun(p: CycleMeta) {
    const ids = orderTcIds(
      (p.items ?? []).map((it) => String(it?.tcid ?? '')).filter(Boolean),
      tcOf,
      reqIndex,
    )
    if (!ids.length) {
      window.alert('담긴 시험 항목이 없습니다 — Cycles 에서 먼저 담으세요.')
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
          /* 방식은 안 굳힌다 — 섞여 있으면 서버가 비워 둔다(전체 항목) */
          items: ids.map((tcid) => ({ tcid })),
          results: Object.fromEntries(ids.map((tcid) => [tcid, 'n'])),
        }),
      })
      if (!r.ok) throw new Error('실행을 만들지 못했습니다')
      const j = (await r.json()) as { id?: string }
      await runsQ.refetch()
      if (j.id) openRunId(j.id)
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
    setOpenDetail(true)
  }

  /** 결과 메일·결과서 — 묶음이면 사이클이 여럿일 수 있어 고르게 한다 */
  function askOut(e: React.MouseEvent, kind: 'mail' | 'report', list: CycleMeta[]) {
    if (!list.length) {
      window.alert('이 자리에 사이클이 없습니다.')
      return
    }
    const one = list.length === 1 ? list[0] : undefined
    if (one) {
      if (kind === 'mail') setMailPlan(one)
      else setRepPlan(one)
      return
    }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setPickAt({ x: Math.max(8, r.right - 240), y: r.bottom + 4, kind, plans: list })
  }

  /* ── 트리 ── */
  const treeHit = (s: string) => !treeQ || s.toLowerCase().includes(treeQ.trim().toLowerCase())
  interface TreeRow {
    d: 1 | 2 | 3 | 4
    key: string
    label: string
    n: number
    zero: boolean
    caret?: boolean
    open?: boolean
    on?: boolean
    ico?: string
    plan?: CycleMeta
    run?: RunLite
  }
  const treeRows = useMemo<TreeRow[]>(() => {
    const out: TreeRow[] = []
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
            const label = String(p.version || p.name || '(버전 없음)')
            if (!treeHit(`${cust} ${model} ${vg} ${label}`)) continue
            planRows.push({
              d: 4,
              key: `p:${p.id}`,
              label,
              n: rs.length,
              zero: !rs.length,
              on: sel?.t === 'plan' && sel.k === p.id,
              plan: p,
            })
          }
          if (!planRows.length) continue
          const vn = planRows.reduce((a, r) => a + r.n, 0)
          modelRows.push({
            d: 3,
            key: vk,
            label: vg,
            n: vn,
            zero: !vn,
            caret: true,
            open: !closed.has(vk),
            on: sel?.t === 'vg' && sel.k === vk,
            ico: '🔖',
          })
          if (!closed.has(vk)) modelRows.push(...planRows)
        }
        if (!modelRows.length) continue
        const mn = runs.filter((r) => {
          const w = whereOf(r)
          return w.plan && w.cust === cust && w.model === model
        }).length
        custRows.push({
          d: 2,
          key: mk,
          label: model,
          n: mn,
          zero: !mn,
          caret: true,
          open: !closed.has(mk),
          on: sel?.t === 'model' && sel.k === mk,
          ico: '📦',
        })
        if (!closed.has(mk)) custRows.push(...modelRows)
      }
      if (!custRows.length) continue
      const cn = runs.filter((r) => {
        const w = whereOf(r)
        return w.plan && w.cust === cust
      }).length
      out.push({
        d: 1,
        key: keyOf(cust),
        label: cust,
        n: cn,
        zero: !cn,
        on: sel?.t === 'cust' && sel.k === cust,
        ico: '🏢',
      })
      out.push(...custRows)
    }
    if (looseRuns.length) {
      const lk = '__loose'
      out.push({
        d: 1,
        key: lk,
        label: '사이클 없음',
        n: looseRuns.length,
        zero: false,
        caret: true,
        open: !closed.has(lk),
        on: sel?.t === 'loose',
        ico: '🗂',
      })
      if (!closed.has(lk)) {
        for (const r of looseRuns) {
          if (!treeHit(`${r.id} ${r.name ?? ''}`)) continue
          out.push({
            d: 2,
            key: `r:${r.id}`,
            label: String(r.name || r.id),
            n: r.n_total,
            zero: !r.n_total,
            on: selRun === r.id && sel?.t === 'loose',
            run: r,
          })
        }
      }
    }
    return out
  }, [plans, runs, runsByPlan, looseRuns, closed, sel, selRun, treeQ, whereOf, cmp])

  /* ── 묶음 보기에 드는 실행 ── */
  const groupRuns = useMemo(() => {
    if (!sel) return []
    if (sel.t === 'loose') return looseRuns
    return runs.filter((r) => {
      const w = whereOf(r)
      if (!w.plan) return false
      if (sel.t === 'cust') return w.cust === sel.k
      if (sel.t === 'model') return keyOf(w.cust, w.model) === sel.k
      if (sel.t === 'vg') return keyOf(w.cust, w.model, w.vg) === sel.k
      return false
    })
  }, [sel, runs, looseRuns, whereOf])
  const groupPlans = useMemo(() => {
    const ids = [...new Set(groupRuns.map((r) => String(r.plan_id ?? '')).filter(Boolean))]
    const list = ids.map((id) => planOf.get(id)).filter((p): p is CycleMeta => !!p)
    if (sel?.t === 'vg') {
      for (const p of plans) {
        if (keyOf(String(p.customer || '미지정'), String(p.model || '미지정'), String(p.version_group || '미지정')) === sel.k && !list.some((x) => x.id === p.id))
          list.push(p)
      }
    }
    return list
  }, [groupRuns, planOf, plans, sel])

  /* ── 실행 본문의 항목 줄 ── */
  interface ItemRow {
    tcid: string
    title: string
    man: boolean
    folder: string
    v: string
    who: string
  }
  const runItems = useMemo<ItemRow[]>(() => {
    if (!runFull) return []
    const ids = (runFull.items ?? []).map((x) => String(x?.tcid ?? '')).filter(Boolean)
    /* 차례는 **한 곳에서** 정한다 — 이 표의 차례가 곧 실행기가 도는
       차례다(아래 only 로 내려보낸다). 여기서 따로 정렬하면 두 화면이
       다른 말을 한다(지적: 왔다갔다 실행한다). */
    const list = orderTcIds(ids.length ? ids : Object.keys(runFull.results ?? {}), tcOf, reqIndex)
    const asg = runFull.assignees ?? {}
    const out = list.map((tcid) => {
      const meta = tcOf.get(tcid)
      const rq = reqIndex.get(String(meta?.req_id ?? ''))
      return {
        tcid,
        title: String(meta?.name ?? ''),
        man: isManTc(tcid),
        folder: rq?.folder ?? '미분류',
        /* 판정 글자는 p/f/b/n 넷뿐 — 모르는 값은 미실행으로 읽는다 */
        v: (['p', 'f', 'b'].includes(String((runFull.results ?? {})[tcid] ?? ''))
          ? String((runFull.results ?? {})[tcid])
          : 'n'),
        who: String(asg[tcid] ?? ''),
      }
    })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runFull, tcOf, reqIndex])
  const runTally = useMemo(() => {
    const t = { p: 0, f: 0, b: 0, n: 0, total: runItems.length, done: 0 }
    for (const it of runItems) t[(it.v as 'p' | 'f' | 'b' | 'n') ?? 'n']++
    t.done = t.p + t.f + t.b
    return t
  }, [runItems])
  const shownItems = useMemo(() => {
    const s = itemQ.trim().toLowerCase()
    return runItems.filter((it) => {
      if (s && !`${it.tcid} ${it.title}`.toLowerCase().includes(s)) return false
      if (vf && it.v !== vf) return false
      return true
    })
  }, [runItems, itemQ, vf])

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
  async function resetItems(tcids: string[]) {
    if (!runFull || !tcids.length) return
    if (!window.confirm(`시험 항목 ${tcids.length}건의 판정을 지우고 미실행으로 되돌립니다.`)) return
    const results = { ...(runFull.results ?? {}) }
    for (const id of tcids) results[id] = 'n'
    await saveRun({ results })
    setTicked(new Set())
  }
  async function dropItems(tcids: string[]) {
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
    setTicked(new Set())
  }

  /* ══ 그리기 ══ */

  function renderSide() {
    return (
      <section className="panel run-side">
        <div className="run-side-hd">
          <b>시험 실행</b>
          <span className="cu-sp" />
          <button type="button" className="cu-new small" title="새 사이클(버전)을 만듭니다" onClick={() => setMaking(true)}>
            <i aria-hidden="true">＋</i>사이클
          </button>
          <button type="button" className="cu-colbtn" title="목록 판 접기" onClick={() => setSideOn(false)}>
            <IconPanel open />
          </button>
        </div>
        <div className="run-side-bar">
          <input
            className="inp"
            placeholder="실행 · 버전 · 모델 찾기"
            value={treeQ}
            onChange={(e) => setTreeQ(e.target.value)}
          />
        </div>
        <div className="cu-tbody">
          {treeRows.length ? (
            treeRows.map((n) => (
              <div
                key={n.key}
                className={`cu-n d${n.d}${n.on ? ' on' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (n.plan) pickPlan(n.plan)
                  else if (n.run) {
                    setSel({ t: 'loose', k: '' })
                    openRunId(n.run.id)
                  } else if (n.key === '__loose') pickGroup('loose', '')
                  else if (n.d === 1) pickGroup('cust', n.key)
                  else if (n.d === 2) pickGroup('model', n.key)
                  else pickGroup('vg', n.key)
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
                <span className={`c${n.zero ? ' zero' : ''}`}>{n.n}</span>
                {!!n.plan && (
                  <button
                    type="button"
                    className="cu-nbtn del"
                    title="사이클 지우기"
                    onClick={(e) => {
                      e.stopPropagation()
                      void delPlan(n.plan!)
                    }}
                  >
                    ✕
                  </button>
                )}
                {!!n.run && (
                  <button
                    type="button"
                    className="cu-nbtn del"
                    title="실행 지우기"
                    onClick={(e) => {
                      e.stopPropagation()
                      void delRun(n.run!.id)
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))
          ) : (
            <div className="cu-empty" style={{ padding: '16px 0' }}>
              <strong>{plansQ.isLoading || runsQ.isLoading ? '불러오는 중…' : '아직 아무것도 없습니다'}</strong>
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

  /** 묶음 보기 — 사업자 / 모델 / 버전그룹 / 사이클 없음 */
  function renderGroup() {
    if (!sel) return null
    const label =
      sel.t === 'cust' ? { name: sel.k, chip: '사업자' }
        : sel.t === 'model' ? { name: sel.k.split('|')[1] ?? sel.k, chip: '모델명' }
          : sel.t === 'vg' ? { name: sel.k.split('|')[2] ?? sel.k, chip: '버전그룹' }
            : { name: '사이클 없음', chip: '실행' }
    const rs = groupRuns.slice().sort((a, b) => {
      const wa = whereOf(a)
      const wb = whereOf(b)
      return (
        cmp(wa.model, wb.model) ||
        cmp(wa.vg, wb.vg) ||
        String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))
      )
    })
    const t = sumRuns(rs)
    const n = Math.max(t.total, 1)
    /* 한 단계 아래로 묶어 보여 준다 */
    const groupBy = sel.t === 'cust' ? 'model' : sel.t === 'model' ? 'vg' : sel.t === 'vg' ? 'plan' : ''
    const subKey = (r: RunLite) => {
      const w = whereOf(r)
      if (groupBy === 'model') return keyOf(w.cust, w.model)
      if (groupBy === 'vg') return keyOf(w.cust, w.model, w.vg)
      return String(r.plan_id ?? '')
    }
    const subName = (r: RunLite) => {
      const w = whereOf(r)
      if (groupBy === 'model') return `📦 ${w.model}`
      if (groupBy === 'vg') return `🔖 ${w.vg}`
      return `📋 ${String(w.plan?.version ?? w.plan?.name ?? '')}`
    }
    let lastK = ''
    return (
      <section className="panel run-main">
        <div className="run-crumb">
          {!sideOn && (
            <button type="button" className="cu-colbtn" title="목록 판 펴기" onClick={() => setSideOn(true)}>
              <IconPanel />
            </button>
          )}
          <b className="rd-ver">{label.name}</b>
          <span className="cu-chip">{label.chip}</span>
          <span className="cu-sp" />
          <div className="cu-hdbtns">
            <button type="button" className="btn small" onClick={(e) => askOut(e, 'mail', groupPlans)}>
              ✉ 결과 메일
            </button>
            <button type="button" className="btn small" onClick={(e) => askOut(e, 'report', groupPlans)}>
              ▤ 고객사 결과서
            </button>
          </div>
        </div>
        <div className="gs">
          <div className="gs-top">
            <span className="cu-m">
              실행 <b>{rs.length}</b>건 · 항목 <b>{t.total}</b>건
            </span>
            <span className="cu-sp" />
            <span className="cu-m">
              합격률 <b className="gs-rate">{t.rate}%</b>
            </span>
          </div>
          <div className="gs-bar">
            <i className="p" style={{ width: `${(t.pass / n) * 100}%` }} />
            <i className="f" style={{ width: `${(t.fail / n) * 100}%` }} />
            <i className="b" style={{ width: `${(t.etc / n) * 100}%` }} />
            <i className="n" style={{ width: `${(t.none / n) * 100}%` }} />
          </div>
          <div className="gs-leg">
            {t.pass ? <span><i className="dot p" />통과 <b>{t.pass}</b></span> : null}
            {t.fail ? <span><i className="dot f" />실패 <b>{t.fail}</b></span> : null}
            {t.etc ? <span><i className="dot b" />기타 <b>{t.etc}</b></span> : null}
            {t.none ? <span><i className="dot n" />미실행 <b>{t.none}</b></span> : null}
            {!t.total && <span className="cu-m">아직 판정이 없습니다</span>}
          </div>
        </div>
        <div className="lp-body">
          <table className="grid gstbl">
            <thead>
              <tr>
                <th style={{ width: 110 }}>ID</th>
                <th style={{ width: 104 }}>사이클</th>
                <th style={{ width: 64 }}>방식</th>
                <th style={{ width: 78 }}>모델그룹</th>
                <th style={{ width: 80 }}>모델명</th>
                <th style={{ width: 76 }}>버전그룹</th>
                <th style={{ width: 148 }}>버전명</th>
                <th style={{ width: 72 }}>담당</th>
                <th style={{ width: 92 }}>생성</th>
                <th style={{ width: 180 }}>판정 현황</th>
                <th style={{ width: 84 }}>진행</th>
              </tr>
            </thead>
            <tbody>
              {rs.length ? (
                rs.map((r) => {
                  const w = whereOf(r)
                  const rt = sumRuns([r])
                  const heads: React.ReactNode[] = []
                  if (groupBy && subKey(r) !== lastK) {
                    /* onClick 은 나중에 불린다 — 도는 변수(lastK)를 그대로 잡으면
                       마지막 묶음으로 굳는다. 줄마다 제 값을 상수로 쥔다. */
                    const gk = subKey(r)
                    lastK = gk
                    const mine = rs.filter((x) => subKey(x) === gk)
                    const gt = sumRuns(mine)
                    const gn = Math.max(gt.total, 1)
                    heads.push(
                      <tr
                        key={`g-${gk}`}
                        className="gs-grp"
                        onClick={() => {
                          if (groupBy === 'model') pickGroup('model', gk)
                          else if (groupBy === 'vg') pickGroup('vg', gk)
                          else {
                            const p = planOf.get(gk)
                            if (p) pickPlan(p)
                          }
                        }}
                      >
                        <td colSpan={11}>
                          <span className="gnm">{subName(r)}</span>
                          <span className="cu-m">실행 {mine.length}건 · 항목 {gt.total}건</span>
                          <span className="gs-bar mini">
                            <i className="p" style={{ width: `${(gt.pass / gn) * 100}%` }} />
                            <i className="f" style={{ width: `${(gt.fail / gn) * 100}%` }} />
                            <i className="b" style={{ width: `${(gt.etc / gn) * 100}%` }} />
                            <i className="n" style={{ width: `${(gt.none / gn) * 100}%` }} />
                          </span>
                          <span className="cu-m">합격률 <b>{gt.rate}%</b></span>
                        </td>
                      </tr>,
                    )
                  }
                  return (
                    <React.Fragment key={r.id}>
                      {heads}
                      <tr onClick={() => openRunId(r.id)}>
                        <td className="idcell cu-mono">{r.id}</td>
                        <td className="cu-mono">{String(w.plan?.cid ?? r.plan_id ?? '') || '—'}</td>
                        <td>{String(r.mode ?? '') || '—'}</td>
                        <td className="cu-mono">{String(w.plan?.model_group ?? r.meta?.model_group ?? '') || '—'}</td>
                        <td>{String(w.plan?.model ?? r.meta?.model ?? '') || '—'}</td>
                        <td className="cu-mono">{String(r.version_group ?? '') || '—'}</td>
                        <td className="cu-mono">{String(r.version ?? '') || '—'}</td>
                        <td>{String(r.owner ?? '') || '—'}</td>
                        <td className="cu-m">{String(r.created_at ?? '').slice(0, 10)}</td>
                        <td><StatBar t={rt} /></td>
                        <td>
                          {r.closed_at ? (
                            <span className="badge b-wait">종료</span>
                          ) : rt.none ? (
                            <span className="badge b-run">{rt.none} 남음</span>
                          ) : rt.total ? (
                            <span className="badge b-pass">완료</span>
                          ) : (
                            <span className="cu-m">—</span>
                          )}
                        </td>
                      </tr>
                    </React.Fragment>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={11}>
                    <div className="cu-empty">
                      <strong>실행이 없습니다</strong>
                      <span>왼쪽에서 사이클(버전명)을 골라 시험을 시작하세요.</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="lp-ft">
          <span>총 {rs.length}건</span>
        </div>
      </section>
    )
  }

  /** 실행이 아직 없는 사이클 — 여기서 자동·수동 시험을 시작한다 */
  function renderPlanNoRun(p: CycleMeta) {
    const ids = (p.items ?? []).map((it) => String(it?.tcid ?? '')).filter(Boolean)
    const nM = ids.filter((id) => isManTc(id)).length
    const nA = ids.length - nM
    return (
      <section className="panel run-main">
        <div className="run-crumb">
          {!sideOn && (
            <button type="button" className="cu-colbtn" title="목록 판 펴기" onClick={() => setSideOn(true)}>
              <IconPanel />
            </button>
          )}
          <span className="cu-m">
            {String(p.version ?? p.name ?? '')} <span className="cu-mono">({String(p.cid ?? p.id)})</span>
          </span>
        </div>
        <div className="run-titlerow">
          <h1 className="run-title">{String(p.name ?? p.version ?? p.id)}</h1>
          <span className="cu-m">
            {[p.customer, p.model, p.version_group].filter(Boolean).join(' · ')}
          </span>
        </div>
        <div className="cu-scroll">
          <div className="cu-empty" style={{ padding: '64px 14px' }}>
            <strong style={{ fontSize: 15 }}>이 사이클에는 아직 시험 실행이 없습니다</strong>
            <span>
              {ids.length
                ? `담긴 시험 항목 ${ids.length}건 (자동 ${nA} · 수동 ${nM}) 을 담아 실행을 만듭니다 —
                   자동·수동은 만든 뒤 실행 안에서 골라 돌립니다.`
                : '담긴 시험 항목이 없습니다 — Cycles 에서 먼저 항목을 담으세요.'}
            </span>
            <div className="rnb-acts">
              <button
                type="button"
                className="cu-new"
                disabled={!ids.length || !!busyRun}
                onClick={() => void makeRun(p)}
              >
                <i aria-hidden="true">▶</i>
                {busyRun ? '만드는 중…' : `실행 만들기 ${ids.length}건`}
              </button>
              <button
                type="button"
                className="btn"
                title="모델·버전을 직접 골라 실행을 만듭니다"
                onClick={() => {
                  setNeedMake(true)
                  setMkRunFor(p.id)
                }}
              >
                ＋ 실행 만들기
              </button>
              {!ids.length && (
                <button type="button" className="btn" onClick={() => goto('cycle', p.id)}>
                  Cycles 에서 항목 담기 →
                </button>
              )}
            </div>
          </div>
        </div>
      </section>
    )
  }

  /** 실행 본문 */
  function renderRun() {
    const r = runLite
    if (!r) return null
    const p = runPlan
    const t = runTally
    const pct = t.total ? Math.round((t.done / t.total) * 100) : 0
    const sib = p ? runsByPlan.get(p.id) ?? [] : []
    /* 실행은 그 버전의 **전 항목**을 담는다 — 방식은 실행의 성격이 아니라
       지금 무엇을 돌리느냐다(목업). 자동·수동만 담긴 실행은 옛 것이다. */
    const nA = runItems.filter((x) => !x.man).length
    const nM = runItems.length - nA
    const modeTxt =
      r.mode === 'empty' ? '직접 구성' : nA && nM ? '전체 항목' : nA ? '자동' : nM ? '수동' : '빈 실행'
    const picked = shownItems.filter((it) => ticked.has(it.tcid))
    const asgOf = new Map<string, number>()
    for (const it of runItems) {
      const k = it.who || String(r.owner ?? '') || '(안 정함)'
      asgOf.set(k, (asgOf.get(k) ?? 0) + 1)
    }
    let lastFolder = ''
    return (
      <section className="panel run-main">
        {/* 1) 브레드크럼 줄 — 왼쪽 경로, 오른쪽 액션 */}
        <div className="run-crumb">
          {!sideOn && (
            <button type="button" className="cu-colbtn" title="목록 판 펴기" onClick={() => setSideOn(true)}>
              <IconPanel />
            </button>
          )}
          <span className="cu-m">
            {String(r.name || r.id)} <span className="cu-mono">({r.id})</span>
          </span>
          <span className="cu-sp" />
          <div className="cu-hdbtns">
            {/* 자동·수동은 **실행 안에서 고른다**(목업). 누르면 그 방식의
                항목만, 표에 보이는 그 차례로 실행기가 열린다. */}
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
            <button
              type="button"
              className="btn small"
              onClick={(e) => {
                const rc = (e.currentTarget as HTMLElement).getBoundingClientRect()
                setMoreAt({ x: Math.max(8, rc.right - 180), y: rc.bottom + 4 })
              }}
            >
              더보기 ▾
            </button>
          </div>
        </div>

        {/* 2) 제목 줄 + 같은 사이클의 실행 고르개 */}
        <div className="run-titlerow">
          <h1
            className="run-title edt"
            title="더블클릭하면 고칩니다"
            onDoubleClick={(e) =>
              editInlineR(e.currentTarget, String(r.name ?? r.id), (v) => {
                if (v.trim()) void saveRun({ name: v.trim() })
              })
            }
          >
            {String(r.name || r.id)}
          </h1>
          <span className={`cu-chip${modeTxt === '자동' ? ' auto' : ''}`}>{modeTxt}</span>
          {p ? (
            <span className="cu-m">{[p.customer, p.model, r.version].filter(Boolean).join(' · ')}</span>
          ) : (
            <span className="cu-m">사이클에 속하지 않은 실행</span>
          )}
          {!!t.total && !t.n && <span className="cu-chip done">✓ 완료</span>}
          {!!r.closed_at && <span className="cu-chip">종료</span>}
        </div>
        {sib.length > 1 && (
          <div className="runpick">
            <span className="cu-m">이 사이클의 실행</span>
            {sib.map((x) => (
              <button
                key={x.id}
                type="button"
                className={`rpick${x.id === r.id ? ' on' : ''}`}
                onClick={() => openRunId(x.id)}
              >
                {x.n_none ? '▤' : '✓'} {x.id}{' '}
                <span className="cu-m">{String(x.created_at ?? '').slice(0, 10)}</span>
              </button>
            ))}
          </div>
        )}

        {/* 3) 요약 */}
        {sumOff ? (
          <div className="run-sum mini">
            <button type="button" className="linkbtn" onClick={() => setSumOff(false)}>
              › 요약
            </button>
            {!!vf && (
              <span className="vfchip">
                {verdName(vf)}만 보는 중
                <button type="button" className="linkbtn" onClick={() => setVf('')}>전체</button>
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
                    { v: t.p, cls: 'p' },
                    { v: t.f, cls: 'f' },
                    { v: t.b, cls: 'b' },
                  ]}
                  total={t.total}
                  label={`${pct}%`}
                  sub="완료"
                />
                <div className="cu-m">{t.total} 개 중 {t.done} 완료됨</div>
              </div>
              <div className="sumrows">
                {VERD.map((d) => {
                  const nn = t[d.v]
                  const on = vf === d.v
                  return (
                    <button
                      key={d.v}
                      type="button"
                      className={`sumrow hit${on ? ' on' : vf ? ' dim' : ''}`}
                      title={`${d.label}만 보기${on ? ' (해제하려면 다시 누르세요)' : ''}`}
                      onClick={() => {
                        setVf(on ? '' : d.v)
                        setTicked(new Set())
                      }}
                    >
                      <span className={`vpill v-${d.cls}`}>
                        {d.ico} {t.total ? Math.round((nn / t.total) * 100) : 0}%
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
                      {kv2('실행 ID', <span className="cu-mono">{r.id}</span>)}
                      {kv2('방식', modeTxt)}
                      {kv2('사업자', String(p?.customer ?? '') || '—')}
                      {kv2('제품군', String(p?.family ?? r.meta?.family ?? '') || '—')}
                      {kv2('모델그룹', <span className="cu-mono">{String(p?.model_group ?? r.meta?.model_group ?? '') || '—'}</span>)}
                      {kv2('모델명', String(p?.model ?? r.meta?.model ?? '') || '—')}
                      {kv2('버전그룹', <span className="cu-mono">{String(r.version_group ?? '') || '—'}</span>)}
                      {kv2('버전명', <span className="cu-mono">{String(r.version ?? '') || '—'}</span>)}
                      {kv2(
                        '사이클',
                        p ? (
                          <button type="button" className="linkbtn" onClick={() => goto('cycle', p.id)}>
                            {String(p.cid ?? p.id)}
                          </button>
                        ) : (
                          '—'
                        ),
                      )}
                      {kv2(
                        '담당',
                        <select
                          className="kvin"
                          value={String(r.owner ?? '')}
                          onChange={(e) => void saveRun({ owner: e.target.value })}
                        >
                          {!users.includes(String(r.owner ?? '')) && (
                            <option value={String(r.owner ?? '')}>{String(r.owner ?? '') || '(안 정함)'}</option>
                          )}
                          {users.map((u) => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>,
                      )}
                      {kv2('생성', `${String(r.created_at ?? '').slice(0, 10)} · ${ago(r.created_at)}`)}
                      {kv2('상태', r.closed_at ? '종료' : t.n ? `진행 중 · 미실행 ${t.n}건` : '완료')}
                      <span className="k">설명</span>
                      <span className="v wide">
                        <span
                          className="edt desc"
                          title="더블클릭하면 고칩니다"
                          onDoubleClick={(e) =>
                            editInlineR(e.currentTarget, String(runFull?.desc ?? ''), (v) => void saveRun({ desc: v }), true)
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

        {/* 4) 골라 잡은 것 */}
        {!!picked.length && (
          <div className="lp-selbar">
            <b>{picked.length}개 항목 선택됨</b>
            <button type="button" className="linkbtn" onClick={() => setTicked(new Set())}>
              선택 해제
            </button>
            <span className="cu-sp" />
            <select
              className="tsel"
              value=""
              title="할당 대상 일괄 변경"
              onChange={(e) => {
                if (e.target.value) void setWho([...ticked], e.target.value)
                e.target.value = ''
              }}
            >
              <option value="">✎ 할당 대상…</option>
              {users.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
            <button type="button" className="btn small" onClick={() => void resetItems([...ticked])}>
              ↺ 결과 초기화
            </button>
            <button type="button" className="btn small danger" onClick={() => void dropItems([...ticked])}>
              🗑 제거
            </button>
          </div>
        )}

        {/* 5) 툴바 + 항목 표 */}
        <div className="lp-bar">
          {!!vf && (
            <span className="vfchip">
              {verdName(vf)}만 보는 중
              <button type="button" className="linkbtn" onClick={() => setVf('')}>전체 보기</button>
            </span>
          )}
          <span className="cu-sp" />
          <input
            className="inp"
            style={{ width: 220 }}
            placeholder="ID · 제목으로 검색"
            value={itemQ}
            onChange={(e) => setItemQ(e.target.value)}
          />
        </div>
        <div className="lp-body">
          <table className="grid tctbl runtbl">
            <thead>
              <tr>
                <th style={{ width: 30 }}>
                  <input
                    type="checkbox"
                    checked={!!shownItems.length && picked.length === shownItems.length}
                    ref={(el) => {
                      if (el) el.indeterminate = picked.length > 0 && picked.length < shownItems.length
                    }}
                    onChange={(e) =>
                      setTicked(e.target.checked ? new Set(shownItems.map((x) => x.tcid)) : new Set())
                    }
                  />
                </th>
                <th style={{ width: 124 }}>ID</th>
                <th>제목</th>
                <th style={{ width: 112 }}>할당 대상</th>
                <th style={{ width: 118 }}>결과</th>
                <th style={{ width: 56 }} aria-label="줄 단추" />
              </tr>
            </thead>
            <tbody>
              {shownItems.length ? (
                shownItems.map((it) => {
                  const heads: React.ReactNode[] = []
                  if (it.folder !== lastFolder) {
                    lastFolder = it.folder
                    const nn = shownItems.filter((x) => x.folder === it.folder).length
                    heads.push(
                      <tr key={`f-${it.folder}`} className="grp-f">
                        <td />
                        <td colSpan={5}>
                          <span className="folder">🗀 {it.folder}</span>{' '}
                          <span className="cu-m">| {nn}</span>
                        </td>
                      </tr>,
                    )
                  }
                  return (
                    <React.Fragment key={it.tcid}>
                      {heads}
                      <tr
                        /* 그 줄의 방식으로, 그 항목을 짚어 연다 —
                           수동 항목을 눌렀는데 자동 작업대가 열리면 안 된다 */
                        onClick={() => openRunner(it.man ? 'M' : 'A', it.tcid)}
                        title="실행기에서 엽니다"
                      >
                        <td style={{ width: 30 }} onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={ticked.has(it.tcid)}
                            onChange={(e) => {
                              const nset = new Set(ticked)
                              if (e.target.checked) nset.add(it.tcid)
                              else nset.delete(it.tcid)
                              setTicked(nset)
                            }}
                          />
                        </td>
                        <td className="idcell cu-mono">{it.tcid}</td>
                        <td>
                          <span className="tc-ico" title={it.man ? '수동' : '자동'}>
                            {it.man ? '✎' : '▶'}
                          </span>
                          {it.title || <span className="cu-m">(이름 없음)</span>}
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <select
                            className="tsel"
                            value={it.who}
                            onChange={(e) => void setWho([it.tcid], e.target.value)}
                          >
                            <option value="">(실행 담당)</option>
                            {!users.includes(it.who) && !!it.who && <option value={it.who}>{it.who}</option>}
                            {users.map((u) => (
                              <option key={u} value={u}>{u}</option>
                            ))}
                          </select>
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <select
                            className={`tsel vsel v-${it.v}`}
                            value={it.v}
                            onChange={(e) => void setVerdict(it.tcid, e.target.value)}
                          >
                            {VERD.map((d) => (
                              <option key={d.v} value={d.v}>
                                {d.ico} {d.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={{ width: 56 }} onClick={(e) => e.stopPropagation()}>
                          <div className="rowact">
                            <button
                              type="button"
                              className="cu-nbtn del"
                              title="실행에서 빼기"
                              onClick={() => void dropItems([it.tcid])}
                            >
                              🗑
                            </button>
                            <button
                              type="button"
                              className="cu-nbtn"
                              title="실행기 열기"
                              onClick={() => openRunner(it.man ? 'M' : 'A', it.tcid)}
                            >
                              ⊞
                            </button>
                          </div>
                        </td>
                      </tr>
                    </React.Fragment>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={6}>
                    <div className="cu-empty">
                      <strong>{runFullQ.isLoading ? '불러오는 중…' : '맞는 항목이 없습니다'}</strong>
                      {!runItems.length && !runFullQ.isLoading && (
                        <span>이 실행에는 담긴 시험 항목이 없습니다.</span>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="lp-ft">
          <span>
            {shownItems.length}
            {vf || itemQ ? ` / 전체 ${t.total}` : ''} 항목
          </span>
          <span className="cu-sp" />
          <span className="cu-m">판정은 결과 칸에서 바로 바꿉니다 — 실행기는 절차까지 봅니다</span>
        </div>
      </section>
    )
  }

  function renderMain() {
    if (selRun && runLite) return renderRun()
    if (sel?.t === 'plan') {
      const p = planOf.get(sel.k)
      if (p) return renderPlanNoRun(p)
    }
    if (sel && sel.t !== 'plan') return renderGroup()
    return (
      <section className="panel run-main">
        <div className="cu-empty" style={{ margin: 'auto' }}>
          <strong>왼쪽에서 사이클(버전명)을 고르세요</strong>
          <span>사이클을 고르면 그 버전의 실행이 열립니다. 없으면 ＋ 사이클로 시작하세요.</span>
        </div>
      </section>
    )
  }

  /* ── 격자 ── */
  const cols =
    wide && openDetail && selRun
      ? 'minmax(0,1fr)'
      : [
          sideOn ? `${w1}px` : '',
          'minmax(0,1fr)',
          openDetail && selRun ? 'minmax(520px,1.15fr)' : '',
        ]
          .filter(Boolean)
          .join(' ')

  return (
    <div className="qav rnb">
      <div ref={gridRef} className="cu-grid" style={{ gridTemplateColumns: cols }}>
        {!(wide && openDetail && selRun) && sideOn && renderSide()}
        {!(wide && openDetail && selRun) && renderMain()}
        {openDetail && !!selRun && (
          <section className="cu-run">
            <RunDetail
              runId={selRun}
              plan={runPlan}
              /* **표에 보이는 그 차례를 그대로 내려보낸다.** 이 목록이 곧
                 실행기가 도는 차례다(RunDetail 이 이 차례로 pick 을 건다) */
              only={runItems.filter((x) => (runMode === 'M' ? x.man : !x.man)).map((x) => x.tcid)}
              focus={runFocus}
              onBack={() => setOpenDetail(false)}
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
                setOpenDetail(false)
                setWide(false)
                void qc.invalidateQueries({ queryKey: ['plan-run', selRun] })
              }}
            />
          </section>
        )}
      </div>

      {/* ⋯ 더보기 — 실행 하나짜리 일들 */}
      {!!moreAt && !!runLite && (
        <>
          <span className="qa-moreovl" role="presentation" onClick={() => setMoreAt(null)} />
          <div className="qa-menu" role="menu" style={{ left: moreAt.x, top: moreAt.y }}>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMoreAt(null)
                if (runPlan) setMailPlan(runPlan)
                else window.alert('사이클에 속하지 않은 실행이라 결과 메일을 못 냅니다.')
              }}
            >
              ✉ 결과 메일
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMoreAt(null)
                if (runPlan) setRepPlan(runPlan)
                else window.alert('사이클에 속하지 않은 실행이라 결과서를 못 냅니다.')
              }}
            >
              ▤ 고객사 결과서
            </button>
            {!!runPlan && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMoreAt(null)
                  setNeedMake(true)
                  setMkRunFor(runPlan.id)
                }}
              >
                ＋ 실행 하나 더
              </button>
            )}
            <div className="qa-menusep" />
            <button
              type="button"
              role="menuitem"
              className="danger"
              onClick={() => {
                setMoreAt(null)
                void delRun(runLite.id)
              }}
            >
              실행 지우기
            </button>
          </div>
        </>
      )}

      {/* 결과 메일·결과서 — 사이클 고르기 */}
      {!!pickAt && (
        <>
          <span className="qa-moreovl" role="presentation" onClick={() => setPickAt(null)} />
          <div className="qa-menu" role="menu" style={{ left: pickAt.x, top: pickAt.y }}>
            {pickAt.plans.map((p) => (
              <button
                key={p.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  if (pickAt.kind === 'mail') setMailPlan(p)
                  else setRepPlan(p)
                  setPickAt(null)
                }}
              >
                {String(p.cid ?? p.id)} · {String(p.name ?? p.version ?? '')}
              </button>
            ))}
          </div>
        </>
      )}

      {making && (
        <MakeCycle
          me={me}
          onClose={() => setMaking(false)}
          onMade={(id) => {
            setMaking(false)
            void plansQ.refetch()
            void vgQ.refetch()
            void qc.invalidateQueries({ queryKey: ['cycle-version-groups'] })
            const p = planOf.get(id)
            setSel({ t: 'plan', k: id })
            clearRun()
            void p
          }}
        />
      )}
      {!!mkRunFor && !!planOf.get(mkRunFor) && (
        <MakePlanRun
          plan={planOf.get(mkRunFor)!}
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
            family: String(planOf.get(mkRunFor)?.family ?? ''),
            model_group: String(planOf.get(mkRunFor)?.model_group ?? ''),
            model: String(planOf.get(mkRunFor)?.model ?? ''),
            version_group: String(planOf.get(mkRunFor)?.version_group ?? ''),
          }}
          onClose={() => setMkRunFor('')}
          onMade={(id) => {
            setMkRunFor('')
            void runsQ.refetch()
            openRunId(id)
          }}
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
    </div>
  )
}

function kv2(k: string, v: React.ReactNode) {
  return (
    <React.Fragment key={k}>
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </React.Fragment>
  )
}

/** 더블클릭 → 그 자리 입력칸. Enter 저장, Esc 취소 (CyclesBoard 와 같은 결) */
function editInlineR(el: HTMLElement, cur: string, onDone: (v: string) => void, small?: boolean) {
  const inp = document.createElement('input')
  inp.className = small ? 'edt-in desc-in' : 'edt-in'
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
