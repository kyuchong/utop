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
import { useQueries, useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { prefGet, prefSet } from '@/lib/prefs'
import { normMode } from '@/lib/runMode'
import RunDetail from '@/components/run/RunDetail'
import type { RunFull } from '@/components/run/RunDetail'
import CycleReport from '@/components/cycle/CycleReport'
import CycleEdit from '@/components/cycle/CycleEdit'
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
  t: 'cust' | 'model' | 'vg' | 'ver' | 'plan' | 'owner'
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

/** 통과·실패·미실행을 한 줄 막대로 */
function Bar({ s, sm }: { s: ReturnType<typeof sum>; sm?: boolean }) {
  const t = s.total || 1
  return (
    <div className={`cu-bar${sm ? ' sm' : ''}`}>
      <i className="p" style={{ width: `${(s.pass / t) * 100}%` }} />
      <i className="f" style={{ width: `${(s.fail / t) * 100}%` }} />
      <i className="n" style={{ width: `${((s.none + s.etc) / t) * 100}%` }} />
    </div>
  )
}

/** 겹치는 값을 하나로 — 「E6100 · E6200」 처럼 이어 붙인다 */
function uniq(vals: Array<string | null | undefined>): string {
  const out = [...new Set(vals.map((v) => String(v ?? '').trim()).filter(Boolean))]
  return out.length ? out.join(' · ') : '—'
}

/** 판정 한 글자를 사람 말로 */
const VERDICT: Record<string, { k: string; t: string }> = {
  p: { k: 'p', t: 'PASS' },
  f: { k: 'f', t: 'FAIL' },
  b: { k: 'b', t: '보류' },
  n: { k: 'w', t: 'N/A' },
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
  const plansQ = useQuery({
    queryKey: ['cycle', 'meta'],
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
  const vgQ = useQuery({
    queryKey: ['cycle-version-groups'],
    enabled: needMake,
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
      return {
        cust: String(p?.customer ?? '미지정'),
        model: String(p?.model ?? '미지정'),
        vg: String(r.version_group ?? p?.version_group ?? '미지정'),
        ver: String(r.version ?? '미지정'),
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
      if (sel.t === 'model') return `${w.cust}|${w.model}` === sel.k
      if (sel.t === 'vg') return w.vg === sel.k
      if (sel.t === 'ver') return w.ver === sel.k
      if (sel.t === 'plan') return w.plan === sel.k
      if (sel.t === 'owner') return w.owner === sel.k
      return false
    })
  }, [runs, sel, where])

  const agg = useMemo(() => sum(shown), [shown])
  const isVer = sel?.t === 'ver'
  const isPlan = sel?.t === 'plan'
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
          man: normMode(String(meta?.kind ?? lite.mode ?? '')) === '수동',
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
    const vs = [...new Set(runs.map((r) => String(r.version ?? '')))].filter(Boolean).sort().reverse()
    if (vs[0]) setSel({ t: 'ver', k: vs[0] })
  }, [runs, sel])

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
          String(p.customer ?? '미지정'),
          String(p.model ?? '미지정'),
          String(p.version_group ?? '미지정'),
          '',
        ).plans.push(p)
      }
      for (const [c, m1] of [...by].sort()) {
        out.push({ d: 1, label: `🏢 ${c}`, t: 'cust', k: c })
        for (const [m, m2] of [...m1].sort()) {
          out.push({ d: 2, label: `📦 ${m}`, t: 'model', k: `${c}|${m}` })
          for (const [g, m3] of [...m2].sort()) {
            out.push({ d: 3, label: `🔖 ${g}`, t: 'vg', k: g })
            for (const [v, leaf] of [...m3].sort().reverse()) {
              if (v) out.push({ d: 4, label: v, n: leaf.runs.length, t: 'ver', k: v })
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
            t: 'ver',
            k: String(r.version ?? ''),
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
              t: 'ver',
              k: String(r.version ?? ''),
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
            t: 'ver',
            k: String(r.version ?? ''),
            run: r.id,
          })
      }
    }
    return out
  }, [runs, plans, mode, where])

  const cols = [
    !wide && col1 ? '250px' : '',
    !wide ? 'minmax(0,1fr)' : '',
    openRun ? 'minmax(0,1.05fr)' : '',
  ].filter(Boolean).join(' ')

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
        <span className="cu-m">미실행 {agg.none + agg.etc}</span>
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
                <div
                  key={`${n.t}-${n.k}-${i}`}
                  className={`cu-n d${n.d}${sel?.t === n.t && sel.k === n.k ? ' on' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => pickNode(n)}
                  onKeyDown={(e) => e.key === 'Enter' && pickNode(n)}
                >
                  <span className="nm">{n.label}</span>
                  {n.n != null && <span className="c">{n.n}</span>}
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
              <b>
                {!sel
                  ? '고른 것 없음'
                  : isPlan
                    ? (selPlan?.cid ?? selPlan?.name ?? sel.k)
                    : sel.k.replace('|', ' · ')}
              </b>
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
                              <td>{p0?.customer ?? '—'}</td>
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
                              <td className="cu-mono">{sel?.k ?? '—'}</td>
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
      {!!mailPlan && <CycleMailOne cycle={mailPlan} onClose={() => setMailPlan(null)} />}
      {!!repPlan && (
        <CycleReport
          cycleId={repPlan.id}
          model={String(repPlan.model ?? '')}
          version={isVer ? String(sel?.k ?? '') : String(repPlan.version ?? '')}
          onClose={() => setRepPlan(null)}
        />
      )}
    </div>
  )
}
