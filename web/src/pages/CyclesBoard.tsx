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
import MakeCycle from '@/components/cycle/MakeCycle'
import AddItems from '@/components/cycle/AddItems'
import CycleEdit from '@/components/cycle/CycleEdit'
import { MakePlanRun } from '@/components/cycle/PlanRunPopup'
import { Donut, StatBar, ago, orderTcIds, sumRuns, useReqIndex, useUserNames } from '@/pages/qaBits'
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
  const [tab, setTab] = useState<'ov' | 'it'>('ov')
  const [q, setQ] = useState('')
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const [tickedIt, setTickedIt] = useState<Set<string>>(new Set())
  const [making, setMaking] = useState(false)
  const [addTo, setAddTo] = useState(false)
  const [mkRun, setMkRun] = useState(false)
  const [edit, setEdit] = useState(false)
  const [cloneId, setCloneId] = useState('')
  const [busy, setBusy] = useState(false)
  /** ⋯ 더보기 — 목록 줄·상세 머리 공용 */
  const [moreAt, setMoreAt] = useState<{ x: number; y: number; id: string } | null>(null)
  /* 만들기 창(MakePlanRun)이 쓰는 카탈로그 — 창을 열 때만 받아 온다 */
  const [needMake, setNeedMake] = useState(false)

  const openPlanId = (id: string) => {
    setOpen(id)
    setTab('ov')
    setTickedIt(new Set())
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
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    return plans
      .filter(
        (p) =>
          !s ||
          [p.cid, p.id, p.name, p.version, p.version_group, p.model, p.model_group, p.customer, p.assignee]
            .map((v) => String(v ?? '').toLowerCase())
            .some((v) => v.includes(s)),
      )
      .sort((a, b) => cmp(String(a.cid ?? a.id), String(b.cid ?? b.id)))
  }, [plans, q, cmp])

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
    setBusy(true)
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
      setBusy(false)
      setTicked(new Set())
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
      enabled: !!open && tab === 'it',
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
        if (v !== 'p' && v !== 'f' && v !== 'b') continue
        const s = m.get(tcid) ?? { fail: 0, ran: 0 }
        s.ran++
        if (v === 'f') s.fail++
        m.set(tcid, s)
      }
    }
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failQs.map((q2) => q2.dataUpdatedAt).join(',')])

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
    setTickedIt(new Set())
  }

  /* ── 그리기 ── */
  const kv = (k: string, v: React.ReactNode) => (
    <>
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </>
  )

  const menuFor = (id: string) => {
    const p = planOf.get(id)
    if (!p) return null
    return (
      <>
        <span className="qa-moreovl" role="presentation" onClick={() => setMoreAt(null)} />
        <div className="qa-menu" role="menu" style={{ left: moreAt!.x, top: moreAt!.y }}>
          <button type="button" role="menuitem" onClick={() => { setMoreAt(null); if (open !== id) openPlanId(id); setNeedMake(true); setMkRun(true) }}>
            시험 실행 만들기
          </button>
          <button type="button" role="menuitem" onClick={() => { setMoreAt(null); setCloneId(id) }}>
            사이클 복제
          </button>
          <button type="button" role="menuitem" onClick={() => { setMoreAt(null); if (open !== id) openPlanId(id); setEdit(true) }}>
            고치기 (제목·항목)
          </button>
          <button type="button" role="menuitem" onClick={() => { setMoreAt(null); void csvPlan(id) }}>
            CSV 내보내기
          </button>
          <div className="qa-menusep" />
          <button type="button" role="menuitem" className="danger" onClick={() => { setMoreAt(null); void delPlans([id]) }}>
            사이클 지우기
          </button>
        </div>
      </>
    )
  }

  /* ── 목록 화면 ── */
  function renderList() {
    const picked = rows.filter((p) => ticked.has(p.id))
    return (
      <section className="panel lp">
        <div className="lp-hd">
          <h1>시험 사이클</h1>
          <span className="cu-sp" />
          <button type="button" className="cu-new" onClick={() => setMaking(true)}>
            <i aria-hidden="true">＋</i>사이클
          </button>
        </div>
        <div className="lp-bar">
          <input
            className="inp"
            style={{ width: 260 }}
            placeholder="사이클 · 모델 · 버전그룹 검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <span className="cu-sp" />
          <span className="cu-m">사이클은 한 버전의 시험 묶음입니다 — 판정은 Runs 에서 봅니다</span>
        </div>
        {!!picked.length && (
          <div className="lp-selbar">
            <b>{picked.length}개 선택됨</b>
            <button type="button" className="linkbtn" onClick={() => setTicked(new Set())}>
              선택 해제
            </button>
            <span className="cu-sp" />
            <button type="button" className="btn small danger" disabled={busy} onClick={() => void delPlans([...ticked])}>
              🗑 삭제
            </button>
          </div>
        )}
        <div className="lp-body">
          <table className="grid pltbl">
            <thead>
              <tr>
                <th style={{ width: 30 }}>
                  <input
                    type="checkbox"
                    checked={!!rows.length && picked.length === rows.length}
                    ref={(el) => {
                      if (el) el.indeterminate = picked.length > 0 && picked.length < rows.length
                    }}
                    onChange={(e) =>
                      setTicked(e.target.checked ? new Set(rows.map((p) => p.id)) : new Set())
                    }
                  />
                </th>
                <th style={{ width: 116 }}>ID</th>
                <th style={{ minWidth: 200 }}>제목</th>
                <th style={{ width: 82 }}>버전그룹</th>
                <th style={{ width: 68 }}>사업자</th>
                <th style={{ width: 76 }}>모델그룹</th>
                <th style={{ width: 80 }}>모델명</th>
                <th className="num" style={{ width: 56 }}>항목</th>
                <th style={{ width: 76 }}>실행</th>
                <th style={{ width: 168 }}>마지막 실행</th>
                <th style={{ width: 170 }}>판정 현황</th>
                <th style={{ width: 72 }}>담당</th>
                <th style={{ width: 64 }} aria-label="줄 단추" />
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((p) => {
                  const rs = runsByPlan.get(p.id) ?? []
                  const openN = rs.filter((r) => !r.closed_at).length
                  const last = rs
                    .slice()
                    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))[0]
                  return (
                    <tr
                      key={p.id}
                      className={ticked.has(p.id) ? 'picked' : ''}
                      onClick={() => openPlanId(p.id)}
                    >
                      <td style={{ width: 30 }} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={ticked.has(p.id)}
                          onChange={(e) => {
                            const n = new Set(ticked)
                            if (e.target.checked) n.add(p.id)
                            else n.delete(p.id)
                            setTicked(n)
                          }}
                        />
                      </td>
                      <td className="idcell cu-mono">{String(p.cid ?? p.id)}</td>
                      <td>
                        <b>{String(p.name ?? p.version ?? '')}</b>
                        {!!p.description && (
                          <div className="cu-m sub1">{String(p.description).slice(0, 46)}</div>
                        )}
                      </td>
                      <td className="cu-mono">{String(p.version_group ?? '') || '—'}</td>
                      <td>{String(p.customer ?? '') || '—'}</td>
                      <td className="cu-mono">{String(p.model_group ?? '') || '—'}</td>
                      <td>{String(p.model ?? '') || '—'}</td>
                      <td className="num">{p._item_count ?? p.items?.length ?? 0}</td>
                      <td>
                        {rs.length ? (
                          openN ? (
                            <span className="badge b-run" title={`진행 중 ${openN}건`}>{rs.length}회</span>
                          ) : (
                            `${rs.length}회`
                          )
                        ) : (
                          <span className="cu-m">—</span>
                        )}
                      </td>
                      <td>
                        {last ? (
                          <>
                            <span className="cu-mono">{String(last.name || last.id)}</span>
                            <div className="cu-m sub1">{ago(last.created_at)}</div>
                          </>
                        ) : (
                          <span className="cu-m">—</span>
                        )}
                      </td>
                      <td>
                        <StatBar t={sumRuns(rs)} />
                      </td>
                      <td>{String(p.assignee ?? '') || '—'}</td>
                      <td style={{ width: 64 }}>
                        <div className="rowact">
                          <button
                            type="button"
                            className="btn icon small"
                            title="더보기"
                            onClick={(e) => {
                              e.stopPropagation()
                              const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                              setMoreAt({ x: Math.max(8, r.right - 180), y: r.bottom + 4, id: p.id })
                            }}
                          >
                            ⋯
                          </button>
                          <button
                            type="button"
                            className="btn icon small"
                            title="열기"
                            onClick={(e) => {
                              e.stopPropagation()
                              openPlanId(p.id)
                            }}
                          >
                            →
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={13}>
                    <div className="cu-empty">
                      <strong>{plansQ.isLoading ? '불러오는 중…' : '사이클이 없습니다'}</strong>
                      <span>빌드가 나오면 사이클을 하나 만들고, 시험 항목을 담아 실행을 뜹니다.</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="lp-ft">
          <span>총 {rows.length}건</span>
          <span className="cu-sp" />
          <span className="cu-m">실행·판정은 Runs 화면에서</span>
        </div>
      </section>
    )
  }

  /* ── 상세: 개요 ── */
  function renderOverview() {
    if (!plan) return null
    const pctA = itemRows.length ? Math.round((nAuto / itemRows.length) * 100) : 0
    const pctM = itemRows.length ? Math.round((nMan / itemRows.length) * 100) : 0
    const cov = poolN ? ((itemRows.length / poolN) * 100).toFixed(1) : '0.0'
    const reqN = new Set(itemRows.map((r) => r.reqLabel).filter(Boolean)).size
    const openN = myRuns.filter((r) => !r.closed_at).length
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

        <div className="cu-sec cu-card">
          <h2>기본 정보</h2>
          <div className="pad">
            <div className="kvgrid">
              {kv('사이클 ID', <span className="cu-mono">{String(plan.cid ?? plan.id)}</span>)}
              {kv('버전명', <span className="cu-mono">{String(plan.version ?? '') || '—'}</span>)}
              {kv('버전그룹', <span className="cu-mono">{String(plan.version_group ?? '') || '—'}</span>)}
              {kv(
                '담당',
                <select
                  className="kvin"
                  value={String(plan.assignee ?? '')}
                  onChange={(e) => void saveFull({ assignee: e.target.value })}
                >
                  {!users.includes(String(plan.assignee ?? '')) && (
                    <option value={String(plan.assignee ?? '')}>{String(plan.assignee ?? '') || '(안 정함)'}</option>
                  )}
                  {users.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>,
              )}
              {kv('사업자', String(plan.customer ?? '') || '—')}
              {kv('제품군', String(plan.family ?? '') || '—')}
              {kv('모델그룹', <span className="cu-mono">{String(plan.model_group ?? '') || '—'}</span>)}
              {kv('모델명', String(plan.model ?? '') || '—')}
              {kv('REQ', <>{reqN}건</>)}
              {kv(
                '시험 항목',
                <>
                  {itemRows.length}건 <span className="cu-m">(자동 {nAuto} · 수동 {nMan})</span>
                </>,
              )}
              {kv(
                '실행',
                myRuns.length ? (
                  <>
                    {myRuns.length}회{openN ? <span className="cu-m"> · 진행 중 {openN}건</span> : null}
                  </>
                ) : (
                  <span className="cu-m">없음</span>
                ),
              )}
              {kv(
                '만든 날짜',
                <>
                  {String(plan._created_at_pg ?? '').slice(0, 10) || '—'}{' '}
                  <span className="cu-m">{ago(plan._created_at_pg)}</span>
                </>,
              )}
              <span className="k">설명</span>
              <span className="v wide">
                <span
                  className="edt desc"
                  title="더블클릭하면 고칩니다"
                  onDoubleClick={(e) => editInline(e.currentTarget, String(plan.description ?? ''), (v) => void saveFull({ description: v }))}
                >
                  {String(plan.description ?? '') || <span className="cu-m">—</span>}
                </span>
              </span>
            </div>
          </div>
        </div>

        <div className="cu-sec cu-card flat">
          <h2>
            이 사이클의 실행 <span className="dim">{myRuns.length}</span>
            <span className="cu-sp" />
            <button
              type="button"
              className="btn small"
              onClick={() => {
                setNeedMake(true)
                setMkRun(true)
              }}
            >
              ＋ 실행
            </button>
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
                        <StatBar t={t} />
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
  function renderItems() {
    if (!plan) return null
    const picked = itemRows.filter((r) => tickedIt.has(r.tcid))
    const repeats = itemRows.filter((r) => {
      const s = failStat.get(r.tcid)
      return !!s && s.fail >= 2
    })
    let lastFolder = ''
    let lastReq: string | null = null
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
        <div className="addbar">
          <button type="button" className="cu-new" onClick={() => setAddTo(true)}>
            <i aria-hidden="true">＋</i>항목 담기
          </button>
          <span className="cu-sp" />
          <span className="cu-m">
            REQ {new Set(itemRows.map((r) => r.reqLabel).filter(Boolean)).size}건 · TC {itemRows.length}건 ·
            자동 {nAuto} / 수동 {nMan}
          </span>
        </div>
        {!!picked.length && (
          <div className="lp-selbar">
            <b>{picked.length}개 항목 선택됨</b>
            <button type="button" className="linkbtn" onClick={() => setTickedIt(new Set())}>
              선택 해제
            </button>
            <span className="cu-sp" />
            <button type="button" className="btn small danger" onClick={() => void dropItems([...tickedIt])}>
              🗑 제거
            </button>
          </div>
        )}
        <div className="cu-card flat grow">
          <div className="cu-tblwrap">
            <table className="grid tctbl">
              <thead>
                <tr>
                  <th style={{ width: 30 }}>
                    <input
                      type="checkbox"
                      checked={!!itemRows.length && picked.length === itemRows.length}
                      ref={(el) => {
                        if (el) el.indeterminate = picked.length > 0 && picked.length < itemRows.length
                      }}
                      onChange={(e) =>
                        setTickedIt(e.target.checked ? new Set(itemRows.map((r) => r.tcid)) : new Set())
                      }
                    />
                  </th>
                  <th style={{ width: 124 }}>ID</th>
                  <th>제목</th>
                  <th style={{ width: 82 }}>모델그룹</th>
                  <th style={{ width: 88 }}>모델명</th>
                  <th style={{ width: 92 }}>유형</th>
                  <th style={{ width: 64 }} title="자동 ▶ · 수동 ✎">타입</th>
                  <th style={{ width: 112 }} title="이 사이클의 실행들에서 실패한 횟수">실패 이력</th>
                  <th style={{ width: 40 }} aria-label="줄 단추" />
                </tr>
              </thead>
              <tbody>
                {itemRows.length ? (
                  itemRows.map((r) => {
                    const heads: React.ReactNode[] = []
                    if (r.folder !== lastFolder) {
                      lastFolder = r.folder
                      lastReq = null
                      const fin = itemRows.filter((x) => x.folder === r.folder)
                      const fa = fin.filter((x) => !x.man).length
                      heads.push(
                        <tr key={`f-${r.folder}`} className="grp-f">
                          <td />
                          <td colSpan={8}>
                            <span className="folder">🗀 {r.folder}</span>{' '}
                            <span className="cu-m">
                              {fin.length}건 · 자동 {fa} · 수동 {fin.length - fa}
                            </span>
                          </td>
                        </tr>,
                      )
                    }
                    if (r.reqLabel !== lastReq) {
                      lastReq = r.reqLabel
                      const rin = itemRows.filter((x) => x.folder === r.folder && x.reqLabel === r.reqLabel)
                      heads.push(
                        <tr key={`r-${r.folder}-${r.reqLabel}`} className="grp-r">
                          <td />
                          <td colSpan={8}>
                            <span className="reqid">◈ {r.reqLabel || '(REQ 없음)'}</span>{' '}
                            {!!r.reqTitle && <span className="cu-m">{r.reqTitle} · </span>}
                            <span className="cu-m">TC {rin.length}건</span>
                          </td>
                        </tr>,
                      )
                    }
                    const st = failStat.get(r.tcid)
                    return (
                      <React.Fragment key={r.tcid}>
                        {heads}
                        <tr className={tickedIt.has(r.tcid) ? 'picked' : ''} onClick={() => goto('tc', r.tcid)} title="REQ-Coverage 에서 엽니다">
                          <td style={{ width: 30 }} onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={tickedIt.has(r.tcid)}
                              onChange={(e) => {
                                const n = new Set(tickedIt)
                                if (e.target.checked) n.add(r.tcid)
                                else n.delete(r.tcid)
                                setTickedIt(n)
                              }}
                            />
                          </td>
                          <td className="idcell cu-mono">{r.tcid}</td>
                          <td>{r.title || <span className="cu-m">(이름 없음)</span>}</td>
                          <td className="cu-mono">{r.mg || '—'}</td>
                          <td>{r.model || '—'}</td>
                          <td>
                            <span className="cu-m">{r.type || '—'}</span>
                          </td>
                          <td>
                            <span className={`badge ${r.man ? 'b-wait' : 'b-auto'}`}>
                              {r.man ? '✎ 수동' : '▶ 자동'}
                            </span>
                          </td>
                          <td>
                            {!st || !st.ran ? (
                              <span className="cu-m">—</span>
                            ) : !st.fail ? (
                              <span className="cu-m">{st.ran}회 중 0</span>
                            ) : (
                              <>
                                <span className="badge b-fail">{st.fail}회</span>
                                <span className="cu-m"> / {st.ran}</span>
                                {st.fail >= 2 && (
                                  <span className="flag" title="돌릴 때마다 깨집니다"> 반복</span>
                                )}
                              </>
                            )}
                          </td>
                          <td style={{ width: 40 }} onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className="cu-nbtn del always"
                              title="사이클에서 제거"
                              onClick={() => void dropItems([r.tcid])}
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      </React.Fragment>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={9}>
                      <div className="cu-empty">
                        <strong>{fullQ.isLoading ? '불러오는 중…' : '담긴 시험 항목이 없습니다'}</strong>
                        <span>
                          위 <b>＋ 항목 담기</b> 로 REQ-Coverage 에서 담으세요.
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
          <div className="cu-hdbtns">
            <button
              type="button"
              className="btn small"
              onClick={(e) => {
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                setMoreAt({ x: Math.max(8, r.right - 180), y: r.bottom + 4, id: plan.id })
              }}
            >
              ⋯
            </button>
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
        <div className="cu-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'ov'} className={tab === 'ov' ? 'on' : ''} onClick={() => setTab('ov')}>
            개요
          </button>
          <button type="button" role="tab" aria-selected={tab === 'it'} className={tab === 'it' ? 'on' : ''} onClick={() => setTab('it')}>
            시험 항목 <span className="dim">{itemRows.length}</span>
          </button>
        </div>
        {tab === 'ov' ? renderOverview() : renderItems()}
      </section>
    )
  }

  return (
    <div className="qav cyb">
      {open ? renderDetail() : renderList()}

      {!!moreAt && menuFor(moreAt.id)}

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
