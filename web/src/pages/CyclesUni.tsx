/**
 * **Cycles — 플랜과 실행을 한 화면에서**(지시: 목업 반영).
 *
 * 전에는 Plans 와 Runs 가 갈려 있었다. 그런데 사람이 묻는 것은 「이 버전
 * 어디까지 됐나」 하나인데, 답은 두 화면에 나뉘어 있었다 — 계획은 저기,
 * 결과는 여기. 그래서 한 화면으로 합친다.
 *
 *   1열  트리 — **기준을 바꿔 가며** 본다
 *          사업자 ▸ 모델 ▸ 버전그룹 ▸ 버전명   (무엇을 어디에 넣었나)
 *          플랜 ▸ 버전명                        (계획대로 됐나)
 *          담당 ▸ 실행                          (누가 무엇을 쥐고 있나)
 *   2열  고른 자리의 **묶음 집계**
 *          버전 자리  개요(버전 정보·시험 실행 타일) │ 시험 항목
 *          그 밖      요약 + 그 안의 실행 목록
 *   3열  고른 실행의 **상세** — 자동·수동 화면을 그대로 얹는다(RunDetail)
 *
 * 실행 화면은 **새로 만들지 않는다.** Runs 가 쓰던 그 부품을 그대로 쓴다 —
 * 베껴 만들면 한쪽만 고치는 날이 온다(이 저장소에서 이미 여러 번 겪었다).
 */
import { useEffect, useMemo, useState } from 'react'
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { prefGet, prefSet } from '@/lib/prefs'
import { normMode } from '@/lib/runMode'
import RunDetail from '@/components/run/RunDetail'
import type { RunFull } from '@/components/run/RunDetail'
import CycleReport from '@/components/cycle/CycleReport'
import CycleInsight from '@/components/cycle/CycleInsight'
import CycleEdit from '@/components/cycle/CycleEdit'
import { CloneDialog, exportCycleCsv, itemVerdict, verdictLabel } from '@/pages/Cycles'
import type { CycleItemLite } from '@/pages/Cycles'
import { MakePlanRun } from '@/components/cycle/PlanRunPopup'
import { CycleMailOne } from '@/components/cycle/CyclePlan'
import type { CycleMeta } from '@/pages/Cycles'
import type { TestCaseMeta } from '@/types'
import './CyclesUni.css'

/** 실행 한 줄 — 목록 API 가 집계까지 함께 준다(큰 결과는 안 읽는다) */
interface RunLite {
  id: string
  plan_id?: string | null
  name?: string | null
  version?: string | null
  version_group?: string | null
  owner?: string | null
  created_at?: string | null
  closed_at?: string | null
  mode?: string | null
  n_total: number
  n_pass: number
  n_fail: number
  n_etc: number
  n_none: number
}

/** 트리를 무엇으로 세울까 — 세 가지 눈 */
type TreeMode = 'model' | 'plan' | 'owner'
/** 고른 자리 — 트리의 어느 마디인가 */
interface Sel {
  t: 'cust' | 'model' | 'vg' | 'ver' | 'plan' | 'owner' | 'plans' | 'run'
  /** 자리를 가리키는 **온전한 경로**. 버전그룹·버전은 이름만으로는 모자라다 —
      사업자·모델이 다른데 이름만 같은 자리가 흔하다(R100 이 여럿). */
  k: string
}
/** 트리 한 마디. run 이 있으면 누를 때 그 실행을 곁에 연다 */
interface Node {
  d: 1 | 2 | 3 | 4
  label: string
  n?: number
  t: Sel['t']
  k: string
  run?: string
}

const TREE_LABEL: Record<TreeMode, string> = {
  model: '사업자 ▸ 모델 ▸ 버전그룹 ▸ 버전명',
  plan: '플랜 ▸ 버전명',
  owner: '담당 ▸ 실행',
}
const SEL_LABEL: Record<Sel['t'], string> = {
  cust: '사업자', model: '모델', vg: '버전그룹', ver: '버전', plan: '플랜', owner: '담당',
  plans: '전체', run: '실행',
}

/** 경로 열쇠 — 사업자|모델|버전그룹|버전 을 이어 붙인다 */
function key(...parts: string[]): string {
  return parts.join('|')
}

/** 한 묶음의 집계 — 여러 실행을 더한다 */
function sum(rs: RunLite[]) {
  const s = { pass: 0, fail: 0, etc: 0, none: 0, total: 0 }
  for (const r of rs) {
    s.pass += r.n_pass || 0
    s.fail += r.n_fail || 0
    s.etc += r.n_etc || 0
    s.none += r.n_none || 0
    s.total += r.n_total || 0
  }
  const done = s.pass + s.fail + s.etc
  return {
    ...s,
    done,
    prg: s.total ? Math.round((done / s.total) * 100) : 0,
    rate: s.pass + s.fail ? Math.round((s.pass / (s.pass + s.fail)) * 100) : 0,
  }
}

/** 통과·실패·기타·미실행을 한 줄 막대로.
    기타(b)는 **사람이 남긴 판정**이지 미실행이 아니다 — 회색에 섞으면
    「실행 3건」 이라면서 막대는 안 찬 것처럼 보인다. */
function Bar({ s, sm }: { s: ReturnType<typeof sum>; sm?: boolean }) {
  const t = s.total || 1
  return (
    <div className={`cu-bar${sm ? ' sm' : ''}`}>
      <i className="p" style={{ width: `${(s.pass / t) * 100}%` }} />
      <i className="f" style={{ width: `${(s.fail / t) * 100}%` }} />
      <i className="b" style={{ width: `${(s.etc / t) * 100}%` }} />
      <i className="n" style={{ width: `${(s.none / t) * 100}%` }} />
    </div>
  )
}

/** 창 머리에 쓸 플랜 이름 — 옛 화면과 같은 식(모델 · 버전) */
function planTitle(p: CycleMeta): string {
  return [p.model, p.version].filter(Boolean).join(' · ') || String(p.cid ?? p.id)
}

/** 겹치는 값을 하나로 — 「E6100 · E6200」 처럼 이어 붙인다 */
function uniq(vals: Array<string | null | undefined>): string {
  const out = [...new Set(vals.map((v) => String(v ?? '').trim()).filter(Boolean))]
  return out.length ? out.join(' · ') : '—'
}

/** 판정 한 글자를 사람 말로 — **실행 화면(RunAuto)과 같은 말**이라야 한다.
    한쪽이 「N/A」 라 하고 다른 쪽이 「미실행」 이라 하면 같은 것을 다른
    것으로 읽는다. 서버도 n=미기록·b=기타로 나눠 센다(db.py). */
const VERDICT: Record<string, { k: string; t: string }> = {
  p: { k: 'p', t: 'PASS' },
  f: { k: 'f', t: 'FAIL' },
  b: { k: 'b', t: '기타' },
  n: { k: 'w', t: '미실행' },
}

export default function CyclesUni({
  me,
}: {
  me?: { username?: string; name?: string; role?: string } | null
}) {
  const [mode, setMode] = useState<TreeMode>(
    () => (prefGet('utop.cyc.tree') as TreeMode) || 'model',
  )
  const [sel, setSel] = useState<Sel | null>(null)
  const [openRun, setOpenRun] = useState('')
  /** 실행을 전체 폭으로 — 스텝을 짤 때는 곁의 트리가 자리만 먹는다 */
  const [wide, setWide] = useState(false)
  /** 1열 접기 */
  const [col1, setCol1] = useState(() => prefGet('utop.cyc.col1') !== '0')
  const [tab, setTab] = useState<'ov' | 'it'>('ov')
  /** 결과 메일·고객사 결과서 — 어느 플랜으로 낼지 고른 뒤 연다 */
  const [mailPlan, setMailPlan] = useState<CycleMeta | null>(null)
  const [repPlan, setRepPlan] = useState<CycleMeta | null>(null)
  const [pick, setPick] = useState<'mail' | 'report' | ''>('')
  /** 플랜 만들기(빈 값) · 고치기(플랜 id) — 같은 창이다 */
  const [edit, setEdit] = useState<{ id?: string } | null>(null)
  /** 항목 담기 — 그 플랜에 시험 항목을 넣는다 */
  const [addTo, setAddTo] = useState('')
  /** 실행 만들기 — 모델·버전을 묻는다 */
  const [mkRun, setMkRun] = useState('')
  /** 복제 — 옛 화면의 그 창(CloneDialog)을 그대로 연다 */
  const [clone, setClone] = useState('')
  /** AI 요약 · 메트릭스 — **알맹이까지 받아 든 뒤에** 연다.
      전에는 창부터 띄우고 자료를 기다렸다. 그 사이 메트릭스는 「항목 0건 ·
      진행 0%」 를 사실처럼 그렸고, 읽기가 실패하면 그 0 이 그대로 남았다. */
  const [insight, setInsight] = useState<
    { id: string; title: string; mode: 'ai' | 'metrics'; items: CycleItemLite[] } | null
  >(null)
  /** 자료를 받아 오는 중 — 단추가 죽은 것처럼 보이지 않게 */
  const [busy, setBusy] = useState('')
  /** 버전그룹 폴더 만들기 — 그 모델 줄 밑에 입력칸이 열린다 */
  const [addVg, setAddVg] = useState<{ model: string; name: string } | null>(null)
  /** ⋯ 더보기 — 단추가 아홉이 되면 아무것도 안 보인다 */
  const [moreAt, setMoreAt] = useState<{ x: number; y: number } | null>(null)
  /** 전체 플랜 표에서 고른 것 — 여러 건 지우기·CSV 가 이걸 본다 */
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const qc = useQueryClient()

  useEffect(() => prefSet('utop.cyc.tree', mode), [mode])
  useEffect(() => prefSet('utop.cyc.col1', col1 ? '1' : '0'), [col1])

  const runsQ = useQuery({
    queryKey: ['plan-runs'],
    queryFn: async () => {
      const r = await apiFetch('/api/plan-runs')
      if (!r.ok) throw new Error('실행을 불러오지 못했습니다')
      return (await r.json()) as { runs: RunLite[] }
    },
  })
  /* 키는 **옛 화면과 같은 ['cycles']** 여야 한다. 서버가 플랜이 바뀌었다고
     알릴 때(useLiveRefresh) 헐어 주는 것이 그 키다 — 나만의 이름을 쓰면
     남이 만들거나 지운 것이 내 화면에 영영 안 들어온다. */
  const plansQ = useQuery({
    queryKey: ['cycles'],
    staleTime: 60_000,
    queryFn: async () => {
      const r = await apiFetch('/api/cycle?meta=1')
      if (!r.ok) throw new Error('플랜을 불러오지 못했습니다')
      return (await r.json()) as { cycles?: CycleMeta[]; items?: CycleMeta[] }
    },
  })
  /** 항목 표의 제목·방식 — 실행에는 tcid 만 담긴다 */
  const tcQ = useQuery({
    queryKey: ['tc-meta'],
    staleTime: 60_000,
    queryFn: async () => {
      const r = await apiFetch('/api/tc?meta=1')
      if (!r.ok) throw new Error('시험 항목을 불러오지 못했습니다')
      return (await r.json()) as { tcs: TestCaseMeta[] }
    },
  })

  /* 아래 둘은 **만들기 창이 쓰는 것**이다 — 창을 열 때만 받아 온다.
     화면을 여는 것만으로 장비 카탈로그까지 끌어오면 첫 그림이 늦다. */
  const [needMake, setNeedMake] = useState(false)
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
  /* 버전그룹은 **트리 폴더**이기도 하다 — 만들기 창을 열 때만 받아 오면
     폴더를 만들어도 목록이 안 따라온다. 늘 읽는다. */
  const vgQ = useQuery({
    queryKey: ['cycle-version-groups'],
    staleTime: 60_000,
    queryFn: async () => {
      const r = await apiFetch('/api/cycle-version-groups')
      if (!r.ok) throw new Error('버전그룹을 불러오지 못했습니다')
      return (await r.json()) as { groups: Record<string, string[]> }
    },
  })

  const runs = useMemo(() => runsQ.data?.runs ?? [], [runsQ.data])
  const plans = useMemo(
    () => plansQ.data?.cycles ?? plansQ.data?.items ?? [],
    [plansQ.data],
  )
  const planOf = useMemo(() => new Map(plans.map((p) => [p.id, p])), [plans])
  const tcOf = useMemo(
    () => new Map((tcQ.data?.tcs ?? []).map((t) => [t.tcid, t])),
    [tcQ.data],
  )

  /** 이 실행이 어느 자리에 속하나 — 플랜이 사업자·모델을 안다 */
  const where = useMemo(() => {
    return (r: RunLite) => {
      const p = r.plan_id ? planOf.get(r.plan_id) : undefined
      /* `??` 가 아니라 `||` 다. 빈 문자열은 「값이 있다」 로 통과해 버려,
         버전이 빈 실행이 트리에서 통째로 사라졌다(마디 열쇠가 '' 이 된다). */
      return {
        cust: String(p?.customer || '미지정'),
        model: String(p?.model || '미지정'),
        vg: String(r.version_group || p?.version_group || '미지정'),
        ver: String(r.version || '미지정'),
        plan: String(r.plan_id ?? ''),
        owner: String(r.owner || '미배정'),
      }
    }
  }, [planOf])

  /** 고른 자리에 드는 실행 */
  const shown = useMemo(() => {
    if (!sel) return []
    return runs.filter((r) => {
      const w = where(r)
      if (sel.t === 'cust') return w.cust === sel.k
      if (sel.t === 'model') return key(w.cust, w.model) === sel.k
      /* 버전그룹·버전은 **경로로** 견준다. 이름만 보면 사업자 A 의 R100 을
         눌렀는데 사업자 B 의 R100 실행까지 한 덩이로 세어졌다. */
      if (sel.t === 'vg') return key(w.cust, w.model, w.vg) === sel.k
      if (sel.t === 'ver') return key(w.cust, w.model, w.vg, w.ver) === sel.k
      if (sel.t === 'plan') return w.plan === sel.k
      if (sel.t === 'owner') return w.owner === sel.k
      if (sel.t === 'run') return r.id === sel.k
      return false
    })
  }, [runs, sel, where])

  const agg = useMemo(() => sum(shown), [shown])
  const isVer = sel?.t === 'ver'
  const isPlan = sel?.t === 'plan'
  const isAll = sel?.t === 'plans'
  /** 자리의 **보이는 이름** — 열쇠는 경로(사업자|모델|버전그룹|버전)다.
      그대로 그리면 머리줄에 `LGUPU|E6100|R100|R100_08_31` 이 뜬다. */
  const selName = useMemo(() => {
    if (!sel) return ''
    if (sel.t === 'plans') return '전체 플랜'
    if (sel.t === 'plan') {
      const p = planOf.get(sel.k)
      return String(p?.cid ?? p?.name ?? sel.k)
    }
    if (sel.t === 'run') {
      const r = runs.find((x) => x.id === sel.k)
      return String(r?.name || r?.version || sel.k)
    }
    if (sel.t === 'model') return sel.k.split('|').join(' · ')
    if (sel.t === 'vg' || sel.t === 'ver') return sel.k.split('|').pop() ?? sel.k
    return sel.k
  }, [sel, planOf, runs])
  /** 플랜 자리에서 보고 있는 그 플랜 — 실행이 0건이어도 잡힌다 */
  const selPlan = isPlan ? planOf.get(sel.k) : undefined
  /** 이 자리에 걸린 플랜들 — 결과 메일·결과서를 여기서 낸다 */
  const selPlans = useMemo(() => {
    const ids = [...new Set(shown.map((r) => String(r.plan_id ?? '')).filter(Boolean))]
    return ids.map((id) => planOf.get(id)).filter((p): p is CycleMeta => !!p)
  }, [shown, planOf])

  /** 시험 항목 탭 — 그 자리 실행들의 알맹이를 읽는다(탭을 열 때만) */
  const detailQs = useQueries({
    queries: shown.map((r) => ({
      queryKey: ['plan-run', r.id],
      enabled: isVer && tab === 'it',
      queryFn: async () => {
        const res = await apiFetch(`/api/plan-runs/${encodeURIComponent(r.id)}`)
        if (!res.ok) throw new Error('실행을 불러오지 못했습니다')
        return (await res.json()) as RunFull
      },
    })),
  })
  const items = useMemo(() => {
    const out: Array<{
      tcid: string
      title: string
      man: boolean
      v: string
      at: string
      run: string
      runId: string
    }> = []
    detailQs.forEach((q, i) => {
      const run = q.data
      const lite = shown[i]
      if (!run || !lite) return
      for (const it of run.items ?? []) {
        const id = String(it?.tcid ?? '')
        if (!id) continue
        const meta = tcOf.get(id)
        const pm = (run.pmeta ?? {})[id] ?? []
        const at =
          String((run.logs ?? {})[id]?.at ?? '') ||
          String([...pm].reverse().find((m) => m?.at)?.at ?? '')
        out.push({
          tcid: id,
          title: String(meta?.name ?? ''),
          /* 시험이 자동인지 수동인지는 **run_type** 에 적힌다. kind 만 보면
             목록 API 가 그 열을 안 실어 보내 거의 모두 「자동」 으로 떴다. */
          man:
            normMode(
              String(meta?.run_type ?? meta?.kind ?? lite.mode ?? ''),
            ) === '수동',
          v: String((run.results ?? {})[id] ?? ''),
          at: at.replace('T', ' ').slice(0, 19),
          run: String(lite.name || lite.id),
          runId: lite.id,
        })
      }
    })
    return out
  }, [detailQs, shown, tcOf])
  const itemsLoading = isVer && tab === 'it' && detailQs.some((q) => q.isLoading)

  /* 처음 열면 가장 최근 버전을 잡아 준다 — 빈 화면은 「고장났다」 로 읽힌다 */
  useEffect(() => {
    if (sel || !runs.length) return
    const newest = [...runs].sort((a, b) =>
      String(b.version ?? '').localeCompare(String(a.version ?? '')),
    )[0]
    if (!newest) return
    const w = where(newest)
    setSel({ t: 'ver', k: key(w.cust, w.model, w.vg, w.ver) })
  }, [runs, sel, where])

  /* ⋯ 메뉴는 **자리가 바뀌면 닫힌다.** 메뉴와 오버레이가 selPlan 에 함께
     묶여 있어, 자리를 옮기면 둘 다 사라지면서 moreAt 만 값이 남았다 —
     다음에 ⋯ 를 누르면 토글이 「닫기」로 먹혀 한 번이 헛돌았다. */
  useEffect(() => setMoreAt(null), [sel])

  /* 고른 것에서 **사라진 플랜을 솎는다.** 남이 지우면 목록만 줄고 선택은
     남아, 띠가 없는 줄을 세며 「3건 선택」 이라 말한다. */
  useEffect(() => {
    setTicked((cur) => {
      if (!cur.size) return cur
      const live = new Set(plans.map((p) => p.id))
      const next = new Set([...cur].filter((k) => live.has(k)))
      return next.size === cur.size ? cur : next
    })
  }, [plans])

  const openRunRow = openRun ? runs.find((r) => r.id === openRun) : undefined
  const openPlan = openRunRow?.plan_id ? planOf.get(openRunRow.plan_id) : undefined

  /* ── 트리 ──────────────────────────────────────────────────────────
     **플랜도 마디다.** 실행만으로 세우면 갓 만든 플랜은 어디에도 안 보여,
     만들고 나서 찾을 수가 없다(실행이 아직 0건이니까). */
  const tree = useMemo(() => {
    const out: Node[] = []
    if (mode === 'model') {
      /* 자리 = 사업자▸모델▸버전그룹▸버전. 실행이 있으면 버전 마디까지,
         없는 플랜은 버전그룹까지만 서고 그 밑에 플랜 이름이 붙는다. */
      type Leaf = { runs: RunLite[]; plans: CycleMeta[] }
      const by = new Map<string, Map<string, Map<string, Map<string, Leaf>>>>()
      const put = (c: string, m: string, g: string, v: string) => {
        if (!by.has(c)) by.set(c, new Map())
        const m1 = by.get(c)!
        if (!m1.has(m)) m1.set(m, new Map())
        const m2 = m1.get(m)!
        if (!m2.has(g)) m2.set(g, new Map())
        const m3 = m2.get(g)!
        if (!m3.has(v)) m3.set(v, { runs: [], plans: [] })
        return m3.get(v)!
      }
      for (const r of runs) {
        const w = where(r)
        put(w.cust, w.model, w.vg, w.ver).runs.push(r)
      }
      /* 실행이 하나도 없는 플랜만 따로 매단다 — 있는 것은 위에서 이미 섰다 */
      const used = new Set(runs.map((r) => String(r.plan_id ?? '')))
      for (const p of plans) {
        if (used.has(p.id)) continue
        put(
          String(p.customer || '미지정'),
          String(p.model || '미지정'),
          String(p.version_group || '미지정'),
          '',
        ).plans.push(p)
      }
      /* **갓 만든 빈 폴더도 선다.** 폴더는 실행·플랜에서 파생되기만 했다 —
         그러면 「＋」 로 만든 버전그룹이 아무 데도 안 보여, 만들어 놓고
         찾을 수가 없다. 어느 사업자 밑에 걸지는 그 모델을 쓰는 플랜이
         알려 준다(없으면 「미지정」). */
      const custOf = new Map<string, string>()
      for (const p of plans)
        if (p.model) custOf.set(String(p.model), String(p.customer || '미지정'))
      for (const [model, gs] of Object.entries(vgQ.data?.groups ?? {}))
        for (const g of gs ?? []) {
          const c = custOf.get(model) ?? '미지정'
          const m1 = by.get(c)?.get(model)
          if (m1?.has(String(g))) continue
          put(c, model, String(g), '')
        }
      for (const [c, m1] of [...by].sort()) {
        out.push({ d: 1, label: `🏢 ${c}`, t: 'cust', k: c })
        for (const [m, m2] of [...m1].sort()) {
          out.push({ d: 2, label: `📦 ${m}`, t: 'model', k: `${c}|${m}` })
          for (const [g, m3] of [...m2].sort()) {
            out.push({ d: 3, label: `🔖 ${g}`, t: 'vg', k: key(c, m, g) })
            for (const [v, leaf] of [...m3].sort().reverse()) {
              if (v)
                out.push({
                  d: 4,
                  label: v,
                  n: leaf.runs.length,
                  t: 'ver',
                  k: key(c, m, g, v),
                })
              for (const p of leaf.plans)
                out.push({
                  d: 4,
                  label: `📋 ${p.cid ?? p.name ?? p.id}`,
                  t: 'plan',
                  k: p.id,
                })
            }
          }
        }
      }
    } else if (mode === 'plan') {
      /* 플랜이 먼저다 — 실행 0건도 선다. 그 밑에 실행을 단다(누르면 열린다) */
      const byPlan = new Map<string, RunLite[]>()
      for (const r of runs) {
        const k = String(r.plan_id ?? '')
        byPlan.set(k, [...(byPlan.get(k) ?? []), r])
      }
      /* 여러 건 지우기·CSV 는 **고르는 자리**가 있어야 한다. 트리는 한 번에
         한 마디뿐이라, 표를 여는 마디를 맨 위에 하나 둔다. */
      out.push({ d: 1, label: `📚 전체 플랜`, n: plans.length, t: 'plans', k: '*' })
      const seen = new Set<string>()
      const line = (p: CycleMeta) => {
        seen.add(p.id)
        const list = byPlan.get(p.id) ?? []
        out.push({
          d: 1,
          label: `📋 ${p.cid ?? p.name ?? p.id}`,
          n: list.length,
          t: 'plan',
          k: p.id,
        })
        for (const r of [...list].sort((a, b) =>
          String(b.version ?? '').localeCompare(String(a.version ?? '')),
        ))
          out.push({
            d: 3,
            label: `${normMode(r.mode) === '수동' ? '✋' : '⚙'} ${r.version || r.name || r.id}`,
            /* 이 마디는 **그 실행 한 건**이다. 전에는 버전 자리로 걸어서,
               같은 버전을 쓰는 남의 플랜 실행까지 함께 세어졌다. */
            t: 'run',
            k: r.id,
            run: r.id,
          })
      }
      for (const p of [...plans].sort((a, b) =>
        String(a.cid ?? a.name ?? a.id).localeCompare(String(b.cid ?? b.name ?? b.id)),
      ))
        line(p)
      /* 플랜이 지워졌는데 실행만 남은 것 — 숨기면 영영 못 찾는다 */
      for (const [k, list] of byPlan)
        if (!seen.has(k)) {
          out.push({ d: 1, label: '📋 (플랜 없음)', n: list.length, t: 'plan', k })
          for (const r of list)
            out.push({
              d: 3,
              label: `${normMode(r.mode) === '수동' ? '✋' : '⚙'} ${r.version || r.name || r.id}`,
              t: 'run',
              k: r.id,
              run: r.id,
            })
        }
    } else {
      const by = new Map<string, RunLite[]>()
      for (const r of runs) {
        const k = r.owner || '미배정'
        by.set(k, [...(by.get(k) ?? []), r])
      }
      for (const [k, list] of [...by].sort()) {
        out.push({ d: 1, label: `👤 ${k}`, n: list.length, t: 'owner', k })
        for (const r of list)
          out.push({
            d: 3,
            label: `${normMode(r.mode) === '수동' ? '✋' : '⚙'} ${r.name || r.id}`,
            t: 'run',
            k: r.id,
            run: r.id,
          })
      }
    }
    return out
  }, [runs, plans, mode, where, vgQ.data])

  const cols = [
    /* 280px — 「사업자 ▸ 모델 ▸ 버전그룹 ▸ 버전명」 이 안 잘리는 폭이다.
       재 보면 그 글자만 173px, 여기에 select 안여백·화살표(36)와 열의
       여백·접기 단추(52)가 붙는다. 250 에서는 「버전」 에서 잘렸다. */
    !wide && col1 ? '280px' : '',
    !wide ? 'minmax(0,1fr)' : '',
    openRun ? 'minmax(0,1.05fr)' : '',
  ].filter(Boolean).join(' ')

  /**
   * 플랜 **전문**을 지금 읽는다 — 캐시를 거치지 않는다.
   *
   * 목록(meta=1)의 항목은 깎여 있어 사람이 손으로 찍은 판정(result)이
   * 빠진다. 그리고 ['cycle-full'] 캐시는 항목 담기 창이 **담기 전** 모습으로
   * 채워 두는 자리라, 그것을 그대로 쓰면 방금 담은 항목이 빠진 파일이
   * 떨어진다(전역 staleTime 30초 안에는 다시 읽지도 않는다).
   */
  async function readFull(id: string): Promise<(CycleMeta & { items?: CycleItemLite[] }) | null> {
    try {
      const r = await apiFetch(`/api/cycle/${encodeURIComponent(id)}`)
      if (!r.ok) return null
      return (await r.json()) as CycleMeta & { items?: CycleItemLite[] }
    } catch {
      return null
    }
  }

  /** AI 요약·메트릭스 열기 — 알맹이를 받아 든 뒤에 창을 띄운다 */
  async function openInsight(p: CycleMeta, mode: 'ai' | 'metrics') {
    setBusy(p.id)
    const full = await readFull(p.id)
    setBusy('')
    if (!full) {
      window.alert('플랜을 불러오지 못했습니다.')
      return
    }
    setInsight({ id: p.id, title: planTitle(p), mode, items: full.items ?? [] })
  }

  /**
   * 플랜을 CSV 로 — **한 건이든 여러 건이든 이 함수 하나**를 지난다.
   *
   * 한 건이면 옛 화면과 똑같은 파일(열·이름)을 낸다 — 같은 함수를 부른다.
   * 여러 건이면 한 장에 플랜 열을 더해 담는다. 옛 화면은 고른 수만큼
   * 내려받기를 연달아 걸었는데, 브라우저가 두 번째부터 막아 첫 파일만
   * 떨어지고 파일 이름이 모델·버전뿐이라 같은 모델이면 서로 덮었다.
   */
  async function csvPlans(ids: string[]) {
    const first = ids[0]
    if (!first) return
    setBusy(first)
    try {
      if (ids.length === 1) {
        const c = await readFull(first)
        if (!c) {
          window.alert('플랜을 불러오지 못했습니다.')
          return
        }
        if (!(c.items ?? []).length) {
          window.alert('담긴 시험 항목이 없어 내보낼 것이 없습니다.')
          return
        }
        exportCycleCsv(c)
        return
      }
      await csvMany(ids)
    } finally {
      setBusy('')
    }
  }

  async function csvMany(ids: string[]) {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [['플랜', 'TC ID', '시험', '결과', '담당', '실행'].map(esc).join(',')]
    let bad = 0
    for (const id of ids) {
      const c = await readFull(id)
      if (!c) {
        bad++
      } else {
        const nm = c.cid ?? c.name ?? id
        for (const it of c.items ?? [])
          lines.push(
            [
              nm,
              it.tcid,
              it.name ?? '',
              verdictLabel(itemVerdict(it)),
              it.assignee || it.executed_by || '',
              it.executed_at ?? '',
            ]
              .map(esc)
              .join(','),
          )
      }
    }
    if (lines.length === 1) {
      /* 못 읽은 것과 「담긴 항목이 없다」 는 다른 말이다. 옛 화면은 둘을
         한 문구로 뭉뚱그려, 서버가 다 거절해도 「항목이 없다」 고 했다. */
      window.alert(
        bad === ids.length
          ? `${bad}건을 모두 읽지 못해 내보내지 못했습니다.`
          : '담긴 시험 항목이 없어 내보낼 것이 없습니다.',
      )
      return
    }
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `플랜_${ids.length}건.csv`
    a.click()
    URL.revokeObjectURL(a.href)
    if (bad) window.alert(`${bad}건은 읽지 못해 빠졌습니다.`)
  }

  /**
   * 플랜 지우기 — **한 건이든 여러 건이든 이 함수 하나**를 지난다.
   *
   * 옛 화면은 길이 두 벌이었다(표의 일괄 삭제 · 트리 우클릭). 문구가 서로
   * 달랐고, 한쪽은 실패를 알렸고 한쪽은 삼켰다. 한 곳으로 모은다.
   */
  async function delPlans(ids: string[]) {
    const list = ids.map((id) => planOf.get(id)).filter((p): p is CycleMeta => !!p)
    if (!list.length) return
    /* 딸린 실행 — **같이 지워지지 않는다.** 서버는 cycle 행만 지우고
       plan_run 은 그대로 남는다(딸린 키가 없다). 옛 화면은 「실행 결과도
       함께 사라집니다」 라고 했는데 사실이 아니었다. 남은 실행은 「플랜
       없음」 자리로 떨어진다 — 그 말을 그대로 한다. */
    const kids = runs.filter((r) => ids.includes(String(r.plan_id ?? '')))
    const names = list
      .slice(0, 5)
      .map((p) => `· ${p.cid ?? p.name ?? p.id}${p.name && p.cid ? ` (${p.name})` : ''}`)
      .join('\n')
    const more = list.length > 5 ? `\n… 외 ${list.length - 5}건` : ''
    const warn = kids.length
      ? `\n\n딸린 시험 실행 ${kids.length}건은 지워지지 않고 「(플랜 없음)」 자리로 남습니다.`
      : ''
    if (
      !window.confirm(
        `플랜 ${list.length}건을 지웁니다. 되돌릴 수 없습니다.\n${names}${more}${warn}`,
      )
    )
      return
    let bad = 0
    for (const id of ids) {
      try {
        const r = await apiFetch(`/api/cycle/${encodeURIComponent(id)}`, { method: 'DELETE' })
        if (!r.ok) bad++
      } catch {
        bad++
      }
    }
    /* 지운 뒤 — 목록·버전그룹·실행을 다시 읽고, 가리키던 자리를 비운다.
       옛 화면은 목록만 다시 읽어 빈 버전그룹 폴더가 남았다. */
    await plansQ.refetch()
    void qc.invalidateQueries({ queryKey: ['cycle-version-groups'] })
    void runsQ.refetch()
    setTicked((cur) => new Set([...cur].filter((k) => !ids.includes(k))))
    if (sel?.t === 'plan' && ids.includes(sel.k)) setSel(null)
    if (bad) window.alert(`${bad}건은 지우지 못했습니다.`)
  }

  /**
   * 버전그룹 폴더를 만든다.
   *
   * 서버가 **읽어서 더한다**(/add). 화면이 제 손에 든 사전을 통째로 되쓰면,
   * 그 사이 남이 만든 폴더가 소리 없이 지워진다.
   */
  async function addVgNow() {
    if (!addVg) return
    const model = addVg.model.trim()
    const name = addVg.name.trim()
    if (!model || !name) return
    try {
      const r = await apiFetch('/api/cycle-version-groups/add', {
        method: 'POST',
        body: JSON.stringify({ model, group: name }),
      })
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { detail?: string }
        window.alert(j.detail || '폴더를 만들지 못했습니다.')
        return
      }
    } catch {
      window.alert('폴더를 만들지 못했습니다.')
      return
    }
    setAddVg(null)
    void vgQ.refetch()
    void qc.invalidateQueries({ queryKey: ['cycle-version-groups'] })
  }

  /**
   * 버전그룹 폴더를 지운다. 안에 플랜이 있으면 서버가 409 로 막고 몇 건인지
   * 알려 준다 — 그때 다시 물어 force 로 밀어붙인다. 그냥 지우면 그 플랜들이
   * 「(버전그룹 없음)」 으로 굴러떨어져 사라진 것처럼 보인다.
   */
  async function delVg(model: string, group: string) {
    if (!model || !group) return
    const url = `/api/cycle-version-groups/${encodeURIComponent(model)}/${encodeURIComponent(group)}`
    const done = () => {
      void vgQ.refetch()
      void qc.invalidateQueries({ queryKey: ['cycle-version-groups'] })
      void plansQ.refetch()
    }
    try {
      const r = await apiFetch(url, { method: 'DELETE' })
      if (r.ok) {
        done()
        return
      }
      const j = (await r.json().catch(() => ({}))) as { detail?: string }
      if (r.status !== 409) {
        window.alert(j.detail || '지우지 못했습니다.')
        return
      }
      if (!window.confirm(`${j.detail}\n\n그래도 폴더만 지울까요? 플랜은 「(버전그룹 없음)」 으로 남습니다.`))
        return
      const r2 = await apiFetch(`${url}?force=1`, { method: 'DELETE' })
      if (!r2.ok) {
        window.alert('지우지 못했습니다.')
        return
      }
      done()
    } catch {
      window.alert('지우지 못했습니다.')
    }
  }

  /** ⋯ 메뉴를 그 단추 아래에 연다 */
  function openMore(e: { currentTarget: HTMLElement }) {
    const r = e.currentTarget.getBoundingClientRect()
    setMoreAt((v) => (v ? null : { x: Math.max(8, r.right - 176), y: r.bottom + 4 }))
  }

  /** 트리 마디를 누르면 — 실행이 달린 마디는 그 실행까지 곁에 연다 */
  function pickNode(n: Node) {
    setSel({ t: n.t, k: n.k })
    setTab('ov')
    if (n.run) setOpenRun(n.run)
  }

  /** 결과 메일·결과서 — 플랜이 하나면 바로, 여럿이면 고르게 한다 */
  function ask(kind: 'mail' | 'report') {
    const only = selPlans.length === 1 ? selPlans[0] : null
    if (only) {
      if (kind === 'mail') setMailPlan(only)
      else setRepPlan(only)
      return
    }
    setPick(selPlans.length ? kind : '')
  }

  /** 이 자리 실행들의 대표 플랜 — 버전 정보 카드에 쓴다 */
  const p0 = selPlans[0]

  /** 실행 목록 표 — 자리마다 같은 모양이라 한 곳에 둔다 */
  const runTable = (
    <div className="cu-sec cu-list">
      <table>
        <thead>
          <tr>
            <th>실행</th>
            <th>버전</th>
            <th>방식</th>
            <th>플랜</th>
            <th>결과</th>
            <th>상태</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const s = sum([r])
            const man = normMode(r.mode) === '수동'
            const p = r.plan_id ? planOf.get(r.plan_id) : undefined
            return (
              <tr key={r.id}>
                <td>
                  <button type="button" className="cu-key" onClick={() => setOpenRun(r.id)}>
                    {r.name || r.id}
                  </button>
                </td>
                <td className="cu-mono">{r.version ?? '—'}</td>
                <td>
                  <span className={`cu-pill ${man ? 'amber' : 'blue'}`}>
                    {man ? '✋ 수동' : '⚙ 자동'}
                  </span>
                </td>
                <td className="cu-mono">{p?.cid ?? p?.name ?? '—'}</td>
                <td style={{ minWidth: 150 }}>
                  <Bar s={s} sm />
                  <div className="cu-sm">
                    통과 {s.pass} · 실패 {s.fail} · {s.done}/{s.total}
                  </div>
                </td>
                <td>
                  <span className={`cu-pill ${r.closed_at ? 'green' : s.done ? 'blue' : 'gray'}`}>
                    {r.closed_at ? '완료' : s.done ? '진행중' : '대기'}
                  </span>
                </td>
              </tr>
            )
          })}
          {!shown.length && (
            <tr>
              <td colSpan={6} className="cu-none">
                이 자리에 실행이 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )

  /** 집계 한 덩이 — 막대와 범례 */
  const summary = (
    <div className="cu-sec">
      <div className="cu-spread">
        <span className="cu-m">
          실행 {shown.length}건 · 항목 {agg.total}건
        </span>
        <span className="cu-m">
          합격률 <b>{agg.total ? `${agg.rate}%` : '—'}</b>
        </span>
      </div>
      <Bar s={agg} />
      <div className="cu-legend">
        <span>
          <i className="dot p" />
          통과 <b>{agg.pass}</b>
        </span>
        <span>
          <i className="dot f" />
          실패 <b>{agg.fail}</b>
        </span>
        {!!agg.etc && (
          <span>
            <i className="dot b" />
            기타 <b>{agg.etc}</b>
          </span>
        )}
        <span className="cu-m">미실행 {agg.none}</span>
      </div>
    </div>
  )

  /** 자동·수동 타일 — 누르면 그 실행이 곁에 열린다 */
  function Tile({ man }: { man: boolean }) {
    const list = shown.filter((r) => (normMode(r.mode) === '수동') === man)
    const s = sum(list)
    if (!list.length)
      return (
        <button type="button" className="cu-tile" disabled>
          <span className="ico">{man ? '✎' : '▶'}</span>
          <span className="tt">{man ? '수동 시험' : '자동 시험'}</span>
          <span className="td">이 버전에 해당 실행이 없습니다</span>
          <span className="tn">실행 0건</span>
        </button>
      )
    return (
      <button type="button" className="cu-tile" onClick={() => setOpenRun(String(list[0]?.id ?? ''))}>
        <span className="ico">{man ? '✎' : '▶'}</span>
        <span className="tt">{man ? '수동 시험' : '자동 시험'}</span>
        <span className="td">{list.map((r) => r.name || r.id).join(' · ')}</span>
        <span className="tn">
          항목 {s.total}건 · {s.done}건 실행 · 통과 {s.pass} · 실패 {s.fail}
        </span>
        <Bar s={s} sm />
      </button>
    )
  }

  return (
    <div className="cu">
      {!wide && (
        <div className="cu-top">
          <h1>Cycles</h1>
          <span className="cu-sub">
            트리 기준을 바꿔 계획·실행·담당 관점으로 봅니다
          </span>
          <span className="cu-sp" />
          <button
            type="button"
            className="btn small cu-new"
            title="새 플랜을 만듭니다 — 사업자·모델·버전을 고르고 시험 항목을 담습니다"
            onClick={() => {
              setNeedMake(true)
              setEdit({})
            }}
          >
            ＋ 플랜
          </button>
        </div>
      )}

      <div className="cu-grid" style={{ gridTemplateColumns: cols }}>
        {!wide && col1 && (
          <section className="panel cu-tree">
            <div className="cu-th">
              <button
                type="button"
                className="cu-colbtn"
                title="열 접기"
                onClick={() => setCol1(false)}
              >
                ◧
              </button>
              <select value={mode} onChange={(e) => setMode(e.target.value as TreeMode)}>
                {(Object.keys(TREE_LABEL) as TreeMode[]).map((k) => (
                  <option key={k} value={k}>
                    {TREE_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="cu-tbody">
              {!tree.length && <div className="cu-none">실행이 아직 없습니다.</div>}
              {tree.map((n, i) => (
                <div key={`${n.t}-${n.k}-${i}`}>
                  <div
                    className={`cu-n d${n.d}${sel?.t === n.t && sel.k === n.k ? ' on' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => pickNode(n)}
                    onKeyDown={(e) => e.key === 'Enter' && pickNode(n)}
                  >
                    <span className="nm">{n.label}</span>
                    {n.n != null && <span className="c">{n.n}</span>}
                    {/* 폴더를 만들고 지우는 자리. **버전그룹만** 사람이 만든다 —
                        사업자·모델은 SETUP 의 코드표·장비 카탈로그가 정본이라
                        여기서 지우면 그것을 쓰는 다른 화면이 함께 무너진다. */}
                    {n.t === 'model' && (
                      <button
                        type="button"
                        className="cu-nbtn"
                        title="이 모델에 버전그룹 폴더를 만듭니다"
                        onClick={(e) => {
                          e.stopPropagation()
                          setAddVg({ model: n.k.split('|')[1] ?? '', name: '' })
                        }}
                      >
                        ＋
                      </button>
                    )}
                    {n.t === 'vg' && (
                      <button
                        type="button"
                        className="cu-nbtn del"
                        title="이 버전그룹 폴더를 지웁니다"
                        onClick={(e) => {
                          e.stopPropagation()
                          const [, m, g] = n.k.split('|')
                          void delVg(String(m ?? ''), String(g ?? ''))
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  {/* 제자리 입력칸 — 창을 띄우지 않는다. 창으로 물으면 만들고
                      나서 그것이 어디에 생겼는지 눈으로 못 쫓는다. */}
                  {addVg?.model === (n.t === 'model' ? (n.k.split('|')[1] ?? '') : '\u0000') && (
                    <div className="cu-add">
                      <input
                        autoFocus
                        value={addVg.name}
                        placeholder="버전그룹 이름 (예: R100)"
                        onChange={(e) => setAddVg({ ...addVg, name: e.target.value })}
                        onKeyDown={(e) => {
                          e.stopPropagation()
                          if (e.key === 'Enter') void addVgNow()
                          if (e.key === 'Escape') setAddVg(null)
                        }}
                      />
                      <button type="button" className="btn small cu-teal" onClick={() => void addVgNow()}>
                        추가
                      </button>
                      <button type="button" className="btn small" onClick={() => setAddVg(null)}>
                        취소
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {!wide && (
          <section className="panel cu-main">
            <div className="cu-hd">
              {!col1 && (
                <button
                  type="button"
                  className="cu-colbtn"
                  title="폴더 열기"
                  onClick={() => setCol1(true)}
                >
                  ▸
                </button>
              )}
              <b>{selName || '고른 것 없음'}</b>
              {sel && <span className="cu-chip">{SEL_LABEL[sel.t]}</span>}
              {isPlan && !!selPlan?.name && selPlan.name !== selPlan.cid && (
                <span className="cu-m">{selPlan.name}</span>
              )}
              {isVer && p0 && (
                <span className="cu-m">
                  {[p0.customer, p0.model, p0.version_group].filter(Boolean).join(' · ')}
                </span>
              )}
              <span className="cu-sp" />
              <div className="cu-hdbtns">
                {isPlan && !!selPlan && (
                  <>
                    <button
                      type="button"
                      className="btn small"
                      title="이 플랜에 시험 항목을 담습니다"
                      onClick={() => setAddTo(selPlan.id)}
                    >
                      ＋ 항목 담기
                    </button>
                    <button
                      type="button"
                      className="btn small cu-teal"
                      title="모델·버전을 정해 이 플랜의 시험 실행을 만듭니다"
                      onClick={() => {
                        setNeedMake(true)
                        setMkRun(selPlan.id)
                      }}
                    >
                      ▶ 실행 만들기
                    </button>
                    <button
                      type="button"
                      className="btn small"
                      title="플랜의 기본 정보를 고칩니다"
                      onClick={() => {
                        setNeedMake(true)
                        setEdit({ id: selPlan.id })
                      }}
                    >
                      고치기
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="btn small"
                  disabled={!selPlans.length}
                  title="이 자리의 결과로 메일을 보냅니다"
                  onClick={() => ask('mail')}
                >
                  📧 결과 메일
                </button>
                <button
                  type="button"
                  className="btn small"
                  disabled={!selPlans.length}
                  title="이 자리의 결과로 결과서를 만듭니다"
                  onClick={() => ask('report')}
                >
                  📄 고객사 결과서
                </button>
                <button
                  type="button"
                  className="btn small"
                  disabled={!selPlan || !!busy}
                  title="AI 요약 · 메트릭스 · CSV · 복제 · 삭제"
                  onClick={openMore}
                >
                  {busy ? '…' : '⋯'}
                </button>
                {!!pick && (
                  <div className="cu-pickpop" role="dialog">
                    <div className="hd">어느 플랜으로 낼까요</div>
                    {selPlans.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          if (pick === 'mail') setMailPlan(p)
                          else setRepPlan(p)
                          setPick('')
                        }}
                      >
                        {p.cid ?? p.name ?? p.id}
                        <i>{p.name ?? ''}</i>
                      </button>
                    ))}
                    <button type="button" className="cancel" onClick={() => setPick('')}>
                      닫기
                    </button>
                  </div>
                )}
              </div>
            </div>

            {isVer ? (
              <>
                <div className="cu-tabs" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'ov'}
                    className={tab === 'ov' ? 'on' : ''}
                    onClick={() => setTab('ov')}
                  >
                    개요
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'it'}
                    className={tab === 'it' ? 'on' : ''}
                    onClick={() => setTab('it')}
                  >
                    시험 항목 <span className="dim">{agg.total}</span>
                  </button>
                </div>

                {tab === 'ov' ? (
                  <div className="cu-scroll">
                    {summary}
                    <div className="cu-sec cu-grid2">
                      <div className="cu-card">
                        <h2>버전 정보</h2>
                        <table className="cu-kv">
                          <tbody>
                            <tr>
                              <td>사업자</td>
                              <td>{uniq(selPlans.map((p) => p.customer))}</td>
                            </tr>
                            <tr>
                              <td>모델</td>
                              <td>{uniq(selPlans.map((p) => p.model))}</td>
                            </tr>
                            <tr>
                              <td>버전그룹</td>
                              <td className="cu-mono">
                                {uniq(shown.map((r) => r.version_group))}
                              </td>
                            </tr>
                            <tr>
                              <td>버전명</td>
                              <td className="cu-mono">{selName || '—'}</td>
                            </tr>
                            <tr>
                              <td>플랜</td>
                              <td>{uniq(selPlans.map((p) => p.cid ?? p.name))}</td>
                            </tr>
                            <tr>
                              <td>담당</td>
                              <td>{uniq(shown.map((r) => r.owner || '미배정'))}</td>
                            </tr>
                            <tr>
                              <td>생성</td>
                              <td>{String(shown[0]?.created_at ?? '—').slice(0, 10)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <div className="cu-card">
                        <h2>시험 실행</h2>
                        <div className="cu-picker">
                          <Tile man={false} />
                          <Tile man />
                        </div>
                        <div className="cu-hint">누르면 실행 화면이 곁에 열립니다</div>
                      </div>
                    </div>
                    {/* 타일은 그 방식의 **첫 실행**을 연다. 같은 버전에 실행이
                        여럿이면 나머지는 이 표에서 골라야 한다 — 표가 없으면
                        영영 못 여는 실행이 생긴다. */}
                    {shown.length > 2 && runTable}
                  </div>
                ) : (
                  <div className="cu-sec cu-list">
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width: '15%' }}>ID</th>
                          <th>제목</th>
                          <th style={{ width: '9%' }}>방식</th>
                          <th style={{ width: '9%' }}>결과</th>
                          <th style={{ width: '15%' }}>판정 시각</th>
                          <th style={{ width: '15%' }}>실행</th>
                          <th style={{ width: '8%' }} />
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((it, i) => {
                          const v = VERDICT[it.v] ?? { k: 'w', t: '대기' }
                          return (
                            <tr key={`${it.runId}-${it.tcid}-${i}`}>
                              <td className="cu-mono">{it.tcid}</td>
                              <td className="cu-ell">{it.title || '—'}</td>
                              <td>
                                <span className={`cu-pill ${it.man ? 'amber' : 'blue'}`}>
                                  {it.man ? '✋ 수동' : '⚙ 자동'}
                                </span>
                              </td>
                              <td>
                                <span className={`cu-st ${v.k}`}>{v.t}</span>
                              </td>
                              <td className="cu-sm">{it.at || '–'}</td>
                              <td className="cu-mono">{it.run}</td>
                              <td>
                                <button
                                  type="button"
                                  className="btn small"
                                  onClick={() => setOpenRun(it.runId)}
                                >
                                  {it.man ? '판정' : '▶ 실행'}
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                        {!items.length && (
                          <tr>
                            <td colSpan={7} className="cu-none">
                              {itemsLoading ? '불러오는 중…' : '항목이 없습니다.'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : isAll ? (
              <div className="cu-sec cu-list">
                {/* 고른 것이 있으면 일괄 도구줄이 뜬다 — 옛 표의 그 띠다 */}
                {!!ticked.size && (
                  <div className="cu-bulk">
                    <b>{ticked.size}건 선택</b>
                    <span className="cu-sp" />
                    <button
                      type="button"
                      className="btn small"
                      title="고른 플랜을 CSV 한 장으로 내보냅니다"
                      onClick={() => void csvPlans([...ticked])}
                    >
                      CSV
                    </button>
                    <button
                      type="button"
                      className="btn small cu-danger"
                      onClick={() => void delPlans([...ticked])}
                    >
                      삭제
                    </button>
                    <button
                      type="button"
                      className="cu-colbtn"
                      title="선택 비우기"
                      onClick={() => setTicked(new Set())}
                    >
                      ✕
                    </button>
                  </div>
                )}
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 34 }}>
                        <input
                          type="checkbox"
                          aria-label="전부 고르기"
                          checked={!!plans.length && plans.every((p) => ticked.has(p.id))}
                          onChange={(e) =>
                            setTicked(e.target.checked ? new Set(plans.map((p) => p.id)) : new Set())
                          }
                        />
                      </th>
                      <th style={{ width: '15%' }}>부여 ID</th>
                      <th>제목</th>
                      <th style={{ width: '16%' }}>모델</th>
                      <th style={{ width: '12%' }}>버전그룹</th>
                      <th style={{ width: '9%' }}>항목</th>
                      <th style={{ width: '10%' }}>상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...plans]
                      .sort((a, b) =>
                        String(a.cid ?? a.name ?? a.id).localeCompare(String(b.cid ?? b.name ?? b.id)),
                      )
                      .map((p) => (
                        <tr key={p.id}>
                          <td>
                            <input
                              type="checkbox"
                              aria-label={`${p.cid ?? p.id} 고르기`}
                              checked={ticked.has(p.id)}
                              onChange={() =>
                                setTicked((cur) => {
                                  const n = new Set(cur)
                                  if (n.has(p.id)) n.delete(p.id)
                                  else n.add(p.id)
                                  return n
                                })
                              }
                            />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="cu-key"
                              onClick={() => {
                                setSel({ t: 'plan', k: p.id })
                                setTab('ov')
                              }}
                            >
                              {p.cid ?? p.id}
                            </button>
                          </td>
                          <td className="cu-ell">{p.name || '—'}</td>
                          <td>{[p.customer, p.model].filter(Boolean).join(' · ') || '—'}</td>
                          <td className="cu-mono">{p.version_group ?? '—'}</td>
                          <td>{p._item_count ?? 0}</td>
                          <td>
                            <span className="cu-pill gray">{p.status || '—'}</span>
                          </td>
                        </tr>
                      ))}
                    {!plans.length && (
                      <tr>
                        <td colSpan={7} className="cu-none">
                          플랜이 아직 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : isPlan ? (
              <div className="cu-scroll">
                {summary}
                <div className="cu-sec cu-grid2">
                  <div className="cu-card">
                    <h2>플랜 정보</h2>
                    <table className="cu-kv">
                      <tbody>
                        <tr>
                          <td>부여 ID</td>
                          <td className="cu-mono">{selPlan?.cid ?? '—'}</td>
                        </tr>
                        <tr>
                          <td>제목</td>
                          <td>{selPlan?.name ?? '—'}</td>
                        </tr>
                        <tr>
                          <td>사업자</td>
                          <td>{selPlan?.customer ?? '—'}</td>
                        </tr>
                        <tr>
                          <td>모델</td>
                          <td>
                            {[selPlan?.model_group, selPlan?.model].filter(Boolean).join(' · ') || '—'}
                          </td>
                        </tr>
                        <tr>
                          <td>버전그룹</td>
                          <td className="cu-mono">{selPlan?.version_group ?? '—'}</td>
                        </tr>
                        <tr>
                          <td>유형</td>
                          <td>{selPlan?.type ?? '—'}</td>
                        </tr>
                        <tr>
                          <td>상태</td>
                          <td>{selPlan?.status ?? '—'}</td>
                        </tr>
                        <tr>
                          <td>담당</td>
                          <td>{selPlan?.assignee ?? '—'}</td>
                        </tr>
                        <tr>
                          <td>담긴 항목</td>
                          <td>{selPlan?._item_count ?? 0}건</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="cu-card">
                    <h2>이 플랜의 실행</h2>
                    {shown.length ? (
                      <div className="cu-picker">
                        <Tile man={false} />
                        <Tile man />
                      </div>
                    ) : (
                      /* 실행이 없다 — 무엇을 해야 할지 그 자리에서 말해 준다.
                         빈 칸만 두면 「고장났나」 로 읽힌다. */
                      <div className="cu-empty">
                        아직 실행이 없습니다.
                        <br />
                        항목을 담고 <b>▶ 실행 만들기</b> 를 누르면 여기에 섭니다.
                      </div>
                    )}
                  </div>
                </div>
                {!!shown.length && runTable}
              </div>
            ) : (
              <>
                {summary}
                {runTable}
              </>
            )}
          </section>
        )}

        {!!openRun && (
          /* 머리줄을 따로 세우지 않는다 — RunDetail 이 이미 한 줄을 갖고
             있어, 위에 하나 더 얹으면 같은 말(버전·실행키·플랜)이 두 줄로
             선다. 확장·닫기만 그 줄에 끼워 넣는다. */
          <section className="cu-run">
            <RunDetail
              runId={openRun}
              plan={openPlan}
              onBack={() => setOpenRun('')}
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
                setOpenRun('')
                setWide(false)
              }}
            />
          </section>
        )}
      </div>

      {/* ── ⋯ 더보기 ─────────────────────────────────────────────── */}
      {!!moreAt && !!selPlan && (
        <>
          <span
            className="cu-moreovl"
            role="presentation"
            onClick={() => setMoreAt(null)}
          />
          <div className="cu-menu" role="menu" style={{ left: moreAt.x, top: moreAt.y }}>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMoreAt(null)
                void openInsight(selPlan, 'ai')
              }}
            >
              AI 요약
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMoreAt(null)
                void openInsight(selPlan, 'metrics')
              }}
            >
              메트릭스
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMoreAt(null)
                void csvPlans([selPlan.id])
              }}
            >
              CSV 내보내기
            </button>
            <div className="cu-menusep" />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMoreAt(null)
                setClone(selPlan.id)
              }}
            >
              복제
            </button>
            <button
              type="button"
              role="menuitem"
              className="danger"
              onClick={() => {
                setMoreAt(null)
                void delPlans([selPlan.id])
              }}
            >
              삭제
            </button>
          </div>
        </>
      )}

      {/* ── 만들기 창들 — **옛 화면이 쓰던 그 부품**이다 ────────────── */}
      {!!edit && (
        <CycleEdit
          cycleId={edit.id}
          folders={vgQ.data?.groups ?? {}}
          onClose={() => setEdit(null)}
          onDone={(id) => {
            setEdit(null)
            void plansQ.refetch()
            void vgQ.refetch()
            /* 만든 플랜을 바로 보여 준다 — 만들고 나서 찾아 헤매지 않게 */
            if (id) {
              setMode('plan')
              setSel({ t: 'plan', k: id })
            }
          }}
        />
      )}
      {!!addTo && (
        <CycleEdit
          cycleId={addTo}
          popupOnly
          folders={vgQ.data?.groups ?? {}}
          onClose={() => setAddTo('')}
          onDone={() => {
            setAddTo('')
            void plansQ.refetch()
          }}
        />
      )}
      {!!mkRun && !!planOf.get(mkRun) && (
        <MakePlanRun
          plan={planOf.get(mkRun)!}
          catalog={
            (catQ.data?.items ?? []) as Array<{
              kind?: string
              name?: string
              model_group?: string | null
              family?: string | null
            }>
          }
          owner={me?.name || me?.username || ''}
          vgroups={vgQ.data?.groups ?? {}}
          seed={{
            family: String(planOf.get(mkRun)?.family ?? ''),
            model_group: String(planOf.get(mkRun)?.model_group ?? ''),
            model: String(planOf.get(mkRun)?.model ?? ''),
            version_group: String(planOf.get(mkRun)?.version_group ?? ''),
          }}
          onClose={() => setMkRun('')}
          onMade={(id) => {
            /* 만든 실행을 **이 화면 안에서** 연다 — 옛 화면은 Runs 로 넘겼지만
               이제 실행은 여기 3열이 제자리다. */
            setMkRun('')
            void runsQ.refetch()
            setOpenRun(id)
          }}
        />
      )}
      {!!clone && (
        <CloneDialog
          cycleId={clone}
          onClose={() => setClone('')}
          onDone={() => {
            setClone('')
            void plansQ.refetch()
            void qc.invalidateQueries({ queryKey: ['cycle-version-groups'] })
          }}
        />
      )}
      {!!insight && (
        /* items 는 **전문**에서 온다 — 목록의 깎인 항목은 사람이 찍은 판정을
           잃어버려, 메트릭스가 실제와 다른 숫자를 말한다. */
        <CycleInsight
          mode={insight.mode}
          cycleId={insight.id}
          title={insight.title}
          items={insight.items}
          onClose={() => setInsight(null)}
        />
      )}
      {!!mailPlan && <CycleMailOne cycle={mailPlan} onClose={() => setMailPlan(null)} />}
      {!!repPlan && (
        <CycleReport
          cycleId={repPlan.id}
          model={String(repPlan.model ?? '')}
          version={isVer ? selName : String(repPlan.version ?? '')}
          onClose={() => setRepPlan(null)}
        />
      )}
    </div>
  )
}
