import { useEffect, useMemo, useRef, useState } from 'react'
import { prefGet } from '@/lib/prefs'
import { useQuery } from '@tanstack/react-query'
import { api, apiFetch } from '@/api/client'
import IdPill from '@/components/IdPill'
import AssigneePicker from '@/components/AssigneePicker'
import { gotoHref } from '@/api/goto'
import {
  itemVerdict,
  kindOf,
  useResults,
  type CycleItemLite,
  type CycleMeta,
} from '@/pages/Cycles'
import type { Requirement } from '@/types'
import { reqPk } from '@/types'
import './CyclePlan.css'

/**
 * 플랜(플랜) 화면 — **Testiny 「Working with Test Runs」 배치 그대로**(지시:
 * 그냥 똑같이). 왼쪽 플랜 레일 · 머리(수정·실행·메일·결과서) · 요약 띠
 * (도넛 | 결과 줄 | 팀·상세·수동/자동 탭) · 항목 표(＋추가 · 담당/결과
 * 인라인). 실행 화면(수동/자동 분리)은 플랜 완료 뒤 별도로 간다(지시).
 *
 * 집계 잣대는 온 화면과 같다: itemVerdict + 설정 「실행 판정 기준」 의
 * group. 색도 .split.cy 가 풀어 둔 CSS 변수를 물려받는다.
 */
interface Props {
  /** 플랜(계획) 인가 실행인가 — Testiny 처럼 **딴 화면**이다(지적: 플랜에
      모든 걸 넣었나). 플랜에는 결과 열·러너가 없고, 실행이 그 둘을 갖는다. */
  mode: 'plan' | 'exec'
  cycles: CycleMeta[]
  /** ← 뒤로 — 플랜이면 목록(표)으로, 실행이면 플랜으로 */
  onBack: () => void
  /** ▶ 실행 — 플랜에서 실행 화면으로 넘어간다(별도 화면) */
  onExec: () => void
  famOf: Map<string, string>
  mgroupOf: Map<string, string>
  meName: string
  onEdit: (id: string) => void
  /** ＋ 추가 — CycleEdit 의 항목 추가 팝업(popupOnly)을 연다 */
  onAddItems: (id: string) => void
  /** ▶ 실행 — 지금의 실행 화면. 수동/자동 분리 화면이 오면 갈아탄다 */
  onRun: (id: string) => void
  onReport: (c: CycleMeta) => void
  onInsight: (c: CycleMeta, mode: 'ai' | 'metrics') => void
  onCsv: (c: CycleMeta) => void
  onDup: (id: string) => void
  onDel: (id: string) => void
  /** 지금 도는 실행 — cycle_id → 돌리는 사람. 레일에 ▶ 로 깜빡인다 */
  running: Map<string, string>
  onRefresh: () => void
}

/** 도넛 원호 — Reports 와 같은 SVG path 방식 */
function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const p = (a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)]
  const [x0, y0] = p(a0)
  const [x1, y1] = p(a1)
  const big = a1 - a0 > Math.PI ? 1 : 0
  return `M ${x0} ${y0} A ${r} ${r} 0 ${big} 1 ${x1} ${y1}`
}

export default function CyclePlan({
  mode,
  cycles,
  onBack,
  onExec,
  famOf,
  mgroupOf,
  meName,
  onEdit,
  onAddItems,
  onRun,
  onReport,
  onInsight,
  onCsv,
  onDup,
  onDel,
  running,
  onRefresh,
}: Props) {
  const resDefs = useResults()
  const groupOf = useMemo(() => {
    const m = new Map(resDefs.map((r) => [r.v, r.group]))
    return (v: string) => m.get(v) ?? (v ? 'neutral' : 'none')
  }, [resDefs])

  /* ── 완료 나눔 — 처음 보여 줄 플랜을 고를 때 쓴다 ── */
  /* 닫힘 = 상태가 '완료' 이거나 종료일이 지난 것. 「✔ 시험 완료」 흐름은
     status 를 안 건드리고 end_date 만 적는다(검증) — 상태 글자 하나에
     걸면 정상 완료가 영영 「열린」 레일에 남는다. */
  const today = new Date().toISOString().slice(0, 10)
  const isClosed = (c: CycleMeta) =>
    String(c.status ?? '') === '완료' ||
    (!!c.end_date && String(c.end_date).slice(0, 10) < today)

  /* 고른 플랜 — 기억한다. 없으면 첫 줄(요약은 상시다) */
  const [sel] = useState(() => prefGet('utop.cycle.plan') ?? '')
  /* 실행 ID(ceid) 부여 — 멱등이라 볼 때마다 쳐도 된다. 실행 화면에
     들어가야만 부여되던 탓에, 플랜에서 갓 만든 플랜의 항목들은 ceid 가
     비어 인라인 수정이 「첫 번째 빈 항목」 을 덮었다(검증: 데이터 오염). */
  const stamped = useRef<Set<string>>(new Set())
  const cur =
    cycles.find((c) => c.id === sel) ?? cycles.find((c) => !isClosed(c)) ?? cycles[0]

  useEffect(() => {
    const id = cur?.id
    if (!id || stamped.current.has(id)) return
    stamped.current.add(id)
    void apiFetch(`/api/cycle/${encodeURIComponent(id)}/exec-ids`, { method: 'POST' })
      .then((r) => {
        if (r.ok) onRefresh()
      })
      .catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.id])

  /* TC 마스터의 실행 타입 — 수동/자동 가름은 실행 화면(typeOf)과 같은
     잣대라야 한다. 스텝만 보면 run_type 'A' 로 적은 자동 TC 가 수동으로
     세어져 두 화면 숫자가 갈린다(검증 — 과거 실사고 재발 경로). */
  const tcMetaQ = useQuery({
    queryKey: ['tc-meta'],
    queryFn: async () => {
      const r = await apiFetch('/api/tc?meta=1')
      return (await r.json()) as { tcs: Array<{ tcid: string; run_type?: string; kind?: string }> }
    },
    staleTime: 60_000,
  })
  const tcRun = useMemo(() => {
    const m = new Map<string, string>()
    for (const tc of tcMetaQ.data?.tcs ?? []) m.set(tc.tcid, String(tc.run_type ?? tc.kind ?? ''))
    return m
  }, [tcMetaQ.data])

  /* ── 집계 — 결과 줄·도넛·수동/자동 ── */
  const items = useMemo(() => cur?.items ?? [], [cur])
  const t = useMemo(() => {
    const tally = (arr: CycleItemLite[]) => {
      let pass = 0
      let fail = 0
      let other = 0
      for (const it of arr) {
        const v = itemVerdict(it)
        const g = v ? groupOf(v) : 'none'
        if (g === 'pass') pass += 1
        else if (g === 'fail') fail += 1
        else if (v) other += 1
      }
      const total = arr.length
      const done = pass + fail + other
      return { total, done, pass, fail, other, none: total - done }
    }
    const isManual = (it: CycleItemLite) => {
      const rt = String(tcRun.get(it.tcid) ?? '').trim().toUpperCase()
      if (rt === '자동' || rt === 'A' || rt === 'AUTO') return false
      if (rt === '수동' || rt === '혼합' || rt === 'M' || rt === 'MANUAL') return true
      const kd = kindOf(it.steps ?? [])
      return !(kd === 'auto' || kd === 'mixed')
    }
    const who = new Map<string, number>()
    for (const it of items) {
      const a = String(it.assignee ?? '').trim() || '(미배정)'
      who.set(a, (who.get(a) ?? 0) + 1)
    }
    return {
      ...tally(items),
      manual: tally(items.filter(isManual)),
      auto: tally(items.filter((x) => !isManual(x))),
      who: [...who.entries()].sort((a, b) => b[1] - a[1]),
    }
  }, [items, groupOf, tcRun])

  const donut = useMemo(() => {
    const segs = [
      { k: 'pass', n: t.pass },
      { k: 'fail', n: t.fail },
      { k: 'other', n: t.other },
      { k: 'none', n: t.none },
    ].filter((s) => s.n > 0)
    const sum = segs.reduce((a, s) => a + s.n, 0) || 1
    let a = -Math.PI / 2
    return segs.map((s) => {
      const a1 = a + (s.n / sum) * Math.PI * 2
      const d = arc(55, 55, 42, a, Math.min(a1, a + Math.PI * 2 - 0.0001))
      a = a1
      return { ...s, d }
    })
  }, [t])

  const [tab, setTab] = useState<'team' | 'info' | 'ma'>('team')
  const pct = (n: number) => (t.total ? Math.round((n / t.total) * 100) : 0)

  /* ── 항목 표 — 요구사항으로 묶는다(Testiny 의 폴더 묶음 줄) ── */
  const reqQ = useQuery({ queryKey: ['reqs'], queryFn: ({ signal }) => api.listRequirements(signal) })
  const reqName = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of (reqQ.data?.reqs ?? []) as Requirement[]) m.set(reqPk(r), r.title ?? '')
    return m
  }, [reqQ.data])
  const [q, setQ] = useState('')
  const [fold, setFold] = useState<Set<string>>(new Set())
  const grouped = useMemo(() => {
    const n = q.trim().normalize('NFC').toLowerCase()
    const shown = items.filter(
      (it) =>
        !n ||
        [it.tcid, it.name, it.assignee]
          .filter(Boolean)
          .join(' ')
          .normalize('NFC')
          .toLowerCase()
          .includes(n),
    )
    const g = new Map<string, CycleItemLite[]>()
    for (const it of shown) {
      const k = String(it.req_id ?? '')
      g.set(k, [...(g.get(k) ?? []), it])
    }
    return [...g.entries()].map(([rid, arr]) => ({
      rid,
      label: reqName.get(rid) || '(요구사항 없음)',
      items: arr,
    }))
  }, [items, q, reqName])

  /* ── 그 자리에서 고치기 — 문서 통째 읽고 그 칸만 얹어 되저장.
     요약(summary)만 되저장하면 items 가 날아간다(코드베이스의 그 함정). ── */
  const [busy, setBusy] = useState(false)
  const setItemField = async (
    ceid: string,
    tcid: string,
    patch: Record<string, unknown> | ((it: Record<string, unknown>) => void),
  ) => {
    if (!cur) return
    setBusy(true)
    try {
      const r = await apiFetch(`/api/cycle/${encodeURIComponent(cur.id)}`)
      const full = (await r.json()) as Record<string, unknown>
      const arr = (full.items ?? []) as Array<Record<string, unknown>>
      /* ceid 가 있으면 그것으로, 없으면 tcid 로 찾는다. 빈 문자열끼리
         맞아 떨어져 첫 항목을 덮는 사고를 막는다(검증). 못 찾으면
         조용히 덮지 말고 그만둔다. */
      const it = ceid
        ? arr.find((x) => String(x.ceid ?? '') === ceid)
        : tcid
          ? arr.find((x) => String(x.tcid ?? '') === tcid)
          : undefined
      if (!it) {
        window.alert('항목을 찾지 못했습니다 — 화면을 새로 고친 뒤 다시 시도하세요')
        return
      }
      if (typeof patch === 'function') patch(it)
      else Object.assign(it, patch)
      await apiFetch(`/api/cycle/${encodeURIComponent(cur.id)}`, {
        method: 'POST',
        /* 저장자 귀속(검증) — 안 실으면 브로드캐스트가 직전 저장자
           이름으로 나가 동료 알림이 오귀속·억제된다 */
        body: JSON.stringify({ ...full, updated_by: meName }),
      })
      onRefresh()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '저장하지 못했습니다')
    } finally {
      setBusy(false)
    }
  }

  const bulkAssign = async (name: string) => {
    if (!cur || chk.size === 0) return
    setBusy(true)
    try {
      const r = await apiFetch(`/api/cycle/${encodeURIComponent(cur.id)}`)
      const full = (await r.json()) as Record<string, unknown>
      const arr = (full.items ?? []) as Array<Record<string, unknown>>
      /* setItemField 와 같은 규약: ceid 우선, 없으면 tcid — 빈 것끼리
         매칭 금지(검증). 통짜 키 일치만 보면 스탬핑 직후 키가 낡아
         조용히 빠진다. */
      let n = 0
      for (const k of chk) {
        const i = k.indexOf('|')
        const ceid = k.slice(0, i)
        const tcid = k.slice(i + 1)
        const it = ceid
          ? arr.find((x) => String(x.ceid ?? '') === ceid)
          : tcid
            ? arr.find((x) => String(x.tcid ?? '') === tcid)
            : undefined
        if (it) {
          it.assignee = name
          n++
        }
      }
      if (n === 0) {
        window.alert('고른 항목을 찾지 못했습니다 — 화면을 새로 고친 뒤 다시 시도하세요')
        return
      }
      /* 부분 일치를 소리 없이 저장하지 않는다(검증) — 몇 건이 빠지는지
         묻고, 취소하면 체크를 남겨 새로 고친 뒤 다시 고르게 한다 */
      if (n < chk.size) {
        const ok = window.confirm(
          `고른 ${chk.size}건 중 ${n}건만 문서에서 찾았습니다 — ` +
            `${chk.size - n}건은 삭제되었거나 키가 바뀌었습니다. ${n}건만 배정할까요?`,
        )
        if (!ok) return
      }
      await apiFetch(`/api/cycle/${encodeURIComponent(cur.id)}`, {
        method: 'POST',
        body: JSON.stringify({ ...full, updated_by: meName }),
      })
      setChk(new Set())
      onRefresh()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '저장하지 못했습니다')
    } finally {
      setBusy(false)
    }
  }

  /* ── 러너(수동 실행) — Testiny 「Run test case」 패널 그대로(지시).
     항목 줄을 누르거나 ▶ 실행으로 연다. 목록 응답의 스텝은 라이트라
     (판정용 result·kind 만) 본문(스텝·기대결과)은 전체 문서에서 읽는다. */
  const [runIdx, setRunIdx] = useState<number | null>(null)
  const [runTab, setRunTab] = useState<'detail' | 'comment' | 'history'>('detail')
  const [jump, setJump] = useState(true)
  const fullQ = useQuery({
    queryKey: ['cycle-full', cur?.id ?? ''],
    enabled: !!cur && runIdx !== null,
    queryFn: async () => {
      const r = await apiFetch(`/api/cycle/${encodeURIComponent(cur?.id ?? '')}`)
      return (await r.json()) as { items?: Array<Record<string, unknown>> }
    },
  })
  const runItem = runIdx !== null ? items[runIdx] : undefined
  const runFull = useMemo(() => {
    if (!runItem) return undefined
    const arr = fullQ.data?.items ?? []
    return (
      arr.find((x) => String(x.ceid ?? '') && String(x.ceid ?? '') === String(runItem.ceid ?? '')) ??
      arr.find((x) => String(x.tcid ?? '') === String(runItem.tcid ?? ''))
    )
  }, [fullQ.data, runItem])
  /**
   * 스텝 스냅샷 채우기 — 항목은 추가될 때 `steps: []` 로 만들어진다.
   * 그래서 TC 에 절차가 버젓이 있는데 러너가 「스텝이 없습니다」 를 냈다
   * (지적). TC 문서의 **checks** 를 떠서 이 회차의 스냅샷으로 심는다 —
   * 결과 기록도 이 줄들에 쌓인다. 옛 실행 화면이 하던 것과 같은 일이다.
   *
   * 수동/자동 가름은 **TC 의 run_type** 이 정본이다('A'/'AUTO'/'자동' 도
   * 자동 — 글자 하나만 알아듣다가 자동 TC 가 전부 수동으로 보인 적이 있다).
   * 갈랐더니 한 줄도 안 남으면 **거르지 않고 전부** 심는다 — 러너는 자동
   * 스텝을 「자동」 칩으로 그릴 줄 알고, 있는 절차를 안 보여 주는 것이
   * 사람에게 더 나쁘다.
   */
  const seeded = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (runIdx === null || !cur || !runItem) return
    const tcid = String(runItem.tcid ?? '')
    if (!tcid) return
    if (!fullQ.data) return
    if (((runFull?.steps as unknown[]) ?? []).length > 0) return
    const key = `${cur.id}|${tcid}`
    if (seeded.current.has(key)) return
    seeded.current.add(key)
    void (async () => {
      try {
        const r = await apiFetch(`/api/tc/${encodeURIComponent(tcid)}`)
        if (!r.ok) return
        const j = (await r.json()) as {
          data?: { checks?: Array<Record<string, unknown>>; run_type?: string }
          checks?: Array<Record<string, unknown>>
          run_type?: string
        }
        const doc = j.data ?? j
        const checks = (doc.checks ?? []) as Array<Record<string, unknown>>
        if (!checks.length) return
        const rt = String(doc.run_type ?? '').trim().toUpperCase()
        const auto = rt === '자동' || rt === 'A' || rt === 'AUTO'
        const want = checks.filter((st) =>
          auto
            ? st.kind !== 'manual' && st.manual !== true && st.action !== '수동'
            : st.kind === 'manual' || st.manual === true || st.action === '수동',
        )
        const seed = want.length ? want : checks
        await setItemField(String(runItem.ceid ?? ''), tcid, (it) => {
          if (((it.steps as unknown[]) ?? []).length === 0) it.steps = seed
        })
        void fullQ.refetch()
      } catch {
        /* 못 읽어도 러너는 계속 뜬다 */
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runIdx, cur?.id, runItem?.tcid, fullQ.data, runFull])

  const openRun = (it: CycleItemLite) => {
    const i = items.findIndex(
      (x) => (x.ceid && x.ceid === it.ceid) || (!x.ceid && x.tcid === it.tcid),
    )
    if (i >= 0) {
      setRunIdx(i)
      setRunTab('detail')
    }
  }
  /* ▶ 실행 — 첫 미실행 항목부터. 다 끝났으면 첫 항목 */
  const startRun = () => {
    const i = items.findIndex((x) => !itemVerdict(x))
    setRunIdx(i >= 0 ? i : items.length ? 0 : null)
    setRunTab('detail')
  }
  const stepRun = (d: -1 | 1) => {
    if (runIdx === null || !items.length) return
    setRunIdx((runIdx + d + items.length) % items.length)
  }
  /* 판정 — 표의 인라인 셀렉트와 같은 규약. 주면 다음으로(Testiny) */
  const giveVerdict = (v: string) => {
    if (!runItem) return
    const patch =
      v === '미실행'
        ? { result: '미실행' }
        : {
            result: v,
            executed_by: runItem.executed_by || meName,
            executed_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
          }
    void setItemField(String(runItem.ceid ?? ''), String(runItem.tcid ?? ''), patch).then(() => {
      if (jump) stepRun(1)
    })
  }
  const giveStep = (si: number, v: string) => {
    if (!runItem) return
    void setItemField(String(runItem.ceid ?? ''), String(runItem.tcid ?? ''), (it) => {
      const steps = (it.steps ?? []) as Array<Record<string, unknown>>
      if (steps[si]) {
        steps[si].result = v
        steps[si].executed_at = new Date().toISOString().slice(0, 19).replace('T', ' ')
      }
    }).then(() => void fullQ.refetch())
  }
  const saveMemo = (text: string) => {
    if (!runItem) return
    void setItemField(String(runItem.ceid ?? ''), String(runItem.tcid ?? ''), { memo: text })
  }

  /* 플랜의 탭 — Testiny 그대로: 개요 | 테스트 케이스(시험 항목) */
  const [ptab, setPtab] = useState<'over' | 'cases'>('over')
  const [moreAt, setMoreAt] = useState<{ x: number; y: number } | null>(null)
  const [mail, setMail] = useState(false)
  /* 담당 고르개(공용) — 지적: 두 번 누르고 손으로 치는 칸은 너무 불편.
     bulk 면 체크한 항목 전부에 한 번에 준다. */
  const [assAt, setAssAt] = useState<{
    x: number
    y: number
    ceid: string
    tcid: string
    value: string
    bulk?: boolean
  } | null>(null)
  const [chk, setChk] = useState<Set<string>>(new Set())
  useEffect(() => {
    setChk(new Set())
    setAssAt(null)
  }, [cur?.id])
  /* exec-ids 스탬핑·cid 재부여로 항목 키(ceid|tcid)가 바뀌면 체크가
     낡는다(검증) — tcid 로 새 키에 갈아 끼우고, 사라진 항목은 버린다 */
  useEffect(() => {
    setChk((s2) => {
      if (!s2.size) return s2
      const valid = new Set(items.map(keyOfIt))
      const byTc = new Map(
        items
          .filter((it) => String(it.tcid ?? '') !== '')
          .map((it) => [String(it.tcid), keyOfIt(it)] as const),
      )
      const n2 = new Set<string>()
      let ch = false
      for (const k of s2) {
        if (valid.has(k)) {
          n2.add(k)
          continue
        }
        ch = true
        const tc = k.slice(k.indexOf('|') + 1)
        const re = tc ? byTc.get(tc) : undefined
        if (re) n2.add(re)
      }
      return ch ? n2 : s2
    })
  }, [items])

  const vcls = (v: string) => {
    if (!v || v === '미실행') return 'n'
    const g = groupOf(v)
    return g === 'pass' ? 'p' : g === 'fail' ? 'f' : 'o'
  }

  return (
    <div className={`cpl${mode === 'exec' ? ' exec' : ''}${runIdx !== null && mode === 'exec' ? ' with-run' : ''}`}>
      {/* ── 가운데 — 고른 플랜 ── */}
      <section className="panel cpl-main">
        {!cur ? (
          <div className="empty">
            플랜이 골라지지 않았습니다 — 목록에서 ID 를 누르세요.
          </div>
        ) : (
          <>
            {/* ② 머리 — cid + 하는 일 단추들 */}
            <div className="cpl-crumb">
              <button type="button" className="btn small" onClick={onBack}>
                {mode === 'plan' ? '← 목록' : '← 플랜'}
              </button>
              <IdPill id={String(cur.cid || cur.id)} href={gotoHref('cycle', String(cur.id))} />
              {running.has(cur.id) && (
                <span className="cpl-run" title={`${running.get(cur.id)} 실행 중`}>▶ 실행 중</span>
              )}
              <span className="sp" />
              <button type="button" className="btn small" onClick={() => onEdit(cur.id)}>
                ✎ 수정
              </button>
              {mode === 'plan' ? (
                /* 플랜의 ▶ 실행 = **실행 화면으로 이동**(Testiny — 딴 화면).
                   자동 실행 UI 는 따로 온다(지시). */
                <button type="button" className="btn small cpl-teal" onClick={onExec}>
                  ▶ 실행
                </button>
              ) : (
                <button type="button" className="btn small cpl-teal" onClick={startRun}>
                  ▶ 시험 시작
                </button>
              )}
              <button type="button" className="btn small" onClick={() => setMail(true)}>
                📧 결과 메일
              </button>
              <button type="button" className="btn small" onClick={() => onReport(cur)}>
                📄 고객사 결과서
              </button>
              <button
                type="button"
                className="btn small"
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect()
                  setMoreAt((v) => (v ? null : { x: r.right - 180, y: r.bottom + 4 }))
                }}
              >
                ⋯
              </button>
            </div>
            <h1 className="cpl-title">{cur.name || '(이름 없음)'}</h1>
            {mode === 'plan' && (
              <div className="cpl-viewtabs">
                <button type="button" className={ptab === 'over' ? 'on' : ''} onClick={() => setPtab('over')}>
                  ▤ 개요
                </button>
                <button type="button" className={ptab === 'cases' ? 'on' : ''} onClick={() => setPtab('cases')}>
                  ▦ 시험 항목
                </button>
              </div>
            )}
            {mode === 'exec' && (
            <div className="cpl-chips">
              <span className="cpl-chip">사업자 <b>{cur.customer || '–'}</b></span>
              {famOf.get(cur.model ?? '') && (
                <span className="cpl-chip">제품군 <b>{famOf.get(cur.model ?? '')}</b></span>
              )}
              <span className="cpl-chip">
                모델그룹 <b>{(cur.model_group ?? '').trim() || mgroupOf.get(cur.model ?? '') || '–'}</b>
              </span>
              <span className="cpl-chip">모델 <b>{cur.model || '–'}</b></span>
              <span className="cpl-chip">버전그룹 <b>{cur.version_group || '–'}</b></span>
              <span className="cpl-chip">버전 <b>{cur.version || '–'}</b></span>
              <span className="cpl-chip">
                기간{' '}
                <b>
                  {[cur.start_date, cur.end_date]
                    .map((v) => String(v ?? '').slice(0, 10))
                    .filter(Boolean)
                    .join('~') || '–'}
                </b>
              </span>
            </div>
            )}

            {/* ③ 요약 띠 — 실행 화면의 결과 집계(Testiny 런 화면) */}
            {mode === 'exec' && (
            <div className="cpl-sum">
              <div className="cpl-donutcol">
                <svg viewBox="0 0 110 110" className="cpl-donut" aria-hidden="true">
                  {donut.map((s) => (
                    <path key={s.k} className={s.k} d={s.d} />
                  ))}
                  <text x="55" y="52" textAnchor="middle" className="cpl-dpct">
                    {t.total ? Math.round((t.done / t.total) * 100) : 0}%
                  </text>
                  <text x="55" y="67" textAnchor="middle" className="cpl-dlab">
                    COMPLETE
                  </text>
                </svg>
                <div className="cpl-dsub">
                  {t.total}개 중 {t.done}개 실행
                </div>
              </div>
              <div className="cpl-rescol">
                <div className="cpl-rrow">
                  <span className="cpl-rpill f">{pct(t.fail)}%</span>
                  <i>✗</i> Fail <b>{t.fail}</b>
                </div>
                <div className="cpl-rrow">
                  <span className="cpl-rpill o">{pct(t.other)}%</span>
                  <i>⊘</i> 기타 <b>{t.other}</b>
                </div>
                <div className="cpl-rrow">
                  <span className="cpl-rpill n">{pct(t.none)}%</span>
                  <i>◌</i> 미실행 <b>{t.none}</b>
                </div>
                <div className="cpl-rrow">
                  <span className="cpl-rpill p">{pct(t.pass)}%</span>
                  <i>✓</i> Pass <b>{t.pass}</b>
                </div>
                <div className="cpl-rtotal">
                  시험 항목 <b>{t.total}</b>
                </div>
              </div>
              <div className="cpl-tabcol">
                <div className="cpl-tabs">
                  <button type="button" className={tab === 'team' ? 'on' : ''} onClick={() => setTab('team')}>
                    팀
                  </button>
                  <button type="button" className={tab === 'info' ? 'on' : ''} onClick={() => setTab('info')}>
                    상세
                  </button>
                  <button type="button" className={tab === 'ma' ? 'on' : ''} onClick={() => setTab('ma')}>
                    수동/자동
                  </button>
                </div>
                {tab === 'team' && (
                  <div className="cpl-team">
                    {t.who.map(([who, n]) => (
                      <div className="cpl-teamrow" key={who}>
                        <span className="who">{who}</span>
                        <span className="cnt">{n}개 배정</span>
                      </div>
                    ))}
                    {t.who.length === 0 && <div className="muted small">배정된 항목이 없습니다</div>}
                  </div>
                )}
                {tab === 'info' && (
                  <div className="cpl-info">
                    담당 <b>{cur.assignee || '–'}</b> · 만든이 <b>{cur.created_by || '–'}</b>
                    <br />
                    만든 날 <b>{String(cur._created_at_pg ?? '').slice(0, 10) || '–'}</b> · 고친 날{' '}
                    <b>{String(cur._updated_at_pg ?? '').slice(0, 10) || '–'}</b>
                    <br />
                    상태 <b>{cur.status || '–'}</b>
                  </div>
                )}
                {tab === 'ma' && (
                  <div className="cpl-ma">
                    {([['수동', t.manual], ['자동', t.auto]] as const).map(([lab, m]) => (
                      <div className="cpl-marow" key={lab}>
                        <span className="lab">{lab}</span>
                        <span className="bar" aria-hidden="true">
                          <i className="p" style={{ flexGrow: m.pass }} />
                          <i className="f" style={{ flexGrow: m.fail }} />
                          <i className="o" style={{ flexGrow: m.other }} />
                          <i className="n" style={{ flexGrow: m.none }} />
                        </span>
                        <span className="num">
                          {m.total}건 · <b className="p">{m.pass}✓</b> <b className="f">{m.fail}✗</b> ·
                          미실행 {m.none}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            )}

            {/* ③′ 개요 탭 — Testiny 테스트 계획 개요 그대로: 상세 카드 |
                실행 열기 | 진행 도넛, 아래에 이 계획의 실행 목록 표 */}
            {mode === 'plan' && ptab === 'over' && (
              <div className="cpl-over">
                <div className="cpl-cards">
                  <div className="cpl-card">
                    <div className="cpl-cardh">🗒 시험 계획 상세</div>
                    <dl className="cpl-meta">
                      <dt>작성자</dt><dd>{cur.created_by || '–'}</dd>
                      <dt>생성 날짜</dt><dd>{String(cur._created_at_pg ?? '').slice(0, 10) || '–'}</dd>
                      <dt>시험 항목 수</dt><dd>{t.total}</dd>
                      <dt>사업자</dt><dd>{cur.customer || '–'}</dd>
                      <dt>모델그룹</dt>
                      <dd>{(cur.model_group ?? '').trim() || mgroupOf.get(cur.model ?? '') || '–'}</dd>
                      <dt>모델</dt><dd>{cur.model || '–'}</dd>
                      <dt>버전</dt>
                      <dd>{[cur.version_group, cur.version].filter(Boolean).join(' · ') || '–'}</dd>
                      <dt>기간</dt>
                      <dd>
                        {[cur.start_date, cur.end_date]
                          .map((v) => String(v ?? '').slice(0, 10))
                          .filter(Boolean)
                          .join('~') || '–'}
                      </dd>
                      <dt>담당</dt><dd>{cur.assignee || '–'}</dd>
                    </dl>
                  </div>
                  <div className="cpl-card cpl-openrun">
                    <div className="cpl-cardh">시험 실행 열기</div>
                    <button type="button" onClick={onExec} title="실행 화면으로 갑니다">
                      <span className="cpl-openrun-ico">▶</span>
                      <span className="cpl-openrun-id">{String(cur.ce || cur.cid || cur.id)}</span>
                    </button>
                  </div>
                  <div className="cpl-card">
                    <div className="cpl-cardh">진행률</div>
                    <div className="cpl-covwrap">
                      <svg viewBox="0 0 110 110" className="cpl-donut" aria-hidden="true">
                        {donut.map((sg) => (
                          <path key={sg.k} className={sg.k} d={sg.d} />
                        ))}
                        <text x="55" y="52" textAnchor="middle" className="cpl-dpct">
                          {t.total ? Math.round((t.done / t.total) * 100) : 0}%
                        </text>
                        <text x="55" y="67" textAnchor="middle" className="cpl-dlab">
                          COMPLETE
                        </text>
                      </svg>
                      <div className="cpl-covtxt">
                        이 계획의 시험 항목 {t.total}개 중 {t.done}개가 실행되었습니다.
                        <br />
                        <b className="p">✓ {t.pass}</b> · <b className="f">✗ {t.fail}</b> · ⊘ {t.other} ·
                        미실행 {t.none}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="cpl-card cpl-runstbl">
                  <div className="cpl-cardh">이 계획에서 생성된 시험 실행</div>
                  <table>
                    <thead>
                      <tr>
                        <th className="w-id">ID</th>
                        <th>제목</th>
                        <th className="w-bar">결과</th>
                        <th className="w-dt">생성 날짜</th>
                        <th className="w-dt">종료</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr onClick={onExec} title="실행 화면으로 갑니다">
                        <td><span className="cpl-runid">{String(cur.ce || cur.cid || cur.id)}</span></td>
                        <td>▶ {cur.name || '(이름 없음)'}</td>
                        <td>
                          <span className="cpl-runbar" aria-hidden="true">
                            <i className="p" style={{ flexGrow: t.pass }} />
                            <i className="f" style={{ flexGrow: t.fail }} />
                            <i className="o" style={{ flexGrow: t.other }} />
                            <i className="n" style={{ flexGrow: t.none }} />
                          </span>
                        </td>
                        <td>{String(cur._created_at_pg ?? '').slice(0, 10) || '–'}</td>
                        <td>{String(cur.end_date ?? '').slice(0, 10) || '–'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ④ 항목 표 — 플랜은 「시험 항목」 탭, 실행은 늘 */}
            {(mode === 'exec' || ptab === 'cases') && (
            <>
            <div className="cpl-tbltools">
              {mode === 'plan' && (
                <button type="button" className="cpl-add" onClick={() => onAddItems(cur.id)}>
                  ＋ 추가
                </button>
              )}
              {chk.size > 0 && (
                <button
                  type="button"
                  className="btn small"
                  onClick={(e) => {
                    const r2 = e.currentTarget.getBoundingClientRect()
                    setAssAt({ x: r2.left, y: r2.bottom + 4, ceid: '', tcid: '', value: '', bulk: true })
                  }}
                >
                  👤 담당 일괄 ({chk.size})
                </button>
              )}
              {busy && <span className="muted small">저장 중…</span>}
              <span className="sp" />
              <input
                className="cpl-q"
                placeholder="키워드로 거르기"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div className="cpl-tblwrap">
              <table className="cpl-tbl">
                <thead>
                  <tr>
                    <th className="w-chk">
                      {(() => {
                        const keys = grouped.flatMap((g2) => g2.items.map(keyOfIt))
                        const all = keys.length > 0 && keys.every((k) => chk.has(k))
                        return (
                          <input
                            type="checkbox"
                            title="보이는 항목 모두 고르기 — 고른 뒤 「담당 일괄」"
                            checked={all}
                            onChange={() => setChk(all ? new Set() : new Set(keys))}
                          />
                        )
                      })()}
                    </th>
                    <th className="w-id">ID</th>
                    <th>제목</th>
                    <th className="w-ass">담당</th>
                    {mode === 'exec' && <th className="w-res">결과</th>}
                    <th className="w-x" />
                  </tr>
                </thead>
                <tbody>
                  {grouped.map((g) => (
                    <GroupRows
                      key={g.rid || '(none)'}
                      g={g}
                      folded={fold.has(g.rid)}
                      onFold={() =>
                        setFold((s) => {
                          const n2 = new Set(s)
                          if (n2.has(g.rid)) n2.delete(g.rid)
                          else n2.add(g.rid)
                          return n2
                        })
                      }
                      mode={mode}
                      resDefs={resDefs}
                      vcls={vcls}
                      meName={meName}
                      onOpen={openRun}
                      chkKeys={chk}
                      onChk={(keys, on) =>
                        setChk((s2) => {
                          const n2 = new Set(s2)
                          for (const k of keys) {
                            if (on) n2.add(k)
                            else n2.delete(k)
                          }
                          return n2
                        })
                      }
                      onAssPick={(it2, x, y) =>
                        setAssAt({
                          x,
                          y,
                          ceid: String(it2.ceid ?? ''),
                          tcid: String(it2.tcid ?? ''),
                          value: String(it2.assignee ?? ''),
                        })
                      }
                      onResult={(ceid, tcid, v, prev) =>
                        void setItemField(
                          ceid,
                          tcid,
                          /* 규약(실행 화면과 동일): 강제 미실행은 문자열
                             '미실행' — '' 는 「덮은 것 없음」이라 스텝에서
                             재계산돼 되튄다. 미실행은 실행자·시각을 남기지
                             않고, 판정은 원 실행자를 보존한다(검증). */
                          v === '미실행'
                            ? { result: '미실행' }
                            : {
                                result: v,
                                executed_by: prev.executed_by || meName,
                                executed_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
                              },
                        )
                      }
                    />
                  ))}
                  {grouped.length === 0 && (
                    <tr>
                      <td colSpan={6} className="cpl-none">
                        {items.length === 0
                          ? '아직 항목이 없습니다 — 「＋ 추가」 로 담으세요.'
                          : '거른 결과가 없습니다'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="cpl-foot">
              {items.length}건
            </div>
            </>
            )}
          </>
        )}

        {assAt && cur && (
          <AssigneePicker
            at={assAt}
            value={assAt.value}
            me={meName}
            onPick={(n) => {
              if (assAt.bulk) void bulkAssign(n)
              else void setItemField(assAt.ceid, assAt.tcid, { assignee: n })
            }}
            onClose={() => setAssAt(null)}
          />
        )}

        {moreAt && cur && (
          <>
            <span className="cyt-gearovl" onClick={() => setMoreAt(null)} />
            <div
              className="tc-menu"
              role="menu"
              /* 오버레이(.cyt-gearovl, z40)보다 위 — 안 주면 메뉴가 보이기만
                 하고 클릭이 전부 닫기로 먹힌다(검증). 옛 보드도 60 을 줬다. */
              style={{ position: 'fixed', left: Math.max(8, moreAt.x), top: moreAt.y, right: 'auto', zIndex: 60 }}
            >
              <button type="button" role="menuitem" onClick={() => { setMoreAt(null); onInsight(cur, 'ai') }}>
                AI 요약
              </button>
              <button type="button" role="menuitem" onClick={() => { setMoreAt(null); onInsight(cur, 'metrics') }}>
                메트릭스
              </button>
              <button type="button" role="menuitem" onClick={() => { setMoreAt(null); onCsv(cur) }}>
                CSV 내보내기
              </button>
              <button type="button" role="menuitem" onClick={() => { setMoreAt(null); onRun(cur.id) }}>
                자동 실행 (기존 화면)
              </button>
              <button type="button" role="menuitem" onClick={() => { setMoreAt(null); onDup(cur.id) }}>
                복제
              </button>
              <button type="button" role="menuitem" className="danger" onClick={() => { setMoreAt(null); onDel(cur.id) }}>
                삭제
              </button>
            </div>
          </>
        )}

        {mail && cur && <CycleMailOne cycle={cur} onClose={() => setMail(false)} />}
      </section>

      {/* ── ⑥ 러너(수동 실행) — Testiny 「Run test case」 그대로 ── */}
      {mode === 'exec' && runIdx !== null && runItem && (
        <section className="panel cpl-runner">
          <div className="cpl-rhead">
            ▶ 시험 실행
            <span className="sp" />
            <button type="button" className="cpl-x" title="닫기" onClick={() => setRunIdx(null)}>
              ✕
            </button>
          </div>
          <div className="cpl-rtitle">
            <span className="cpl-tid">{runItem.tcid}</span> {runItem.name || '(제목 없음)'}
          </div>
          <div className="cpl-rtabs">
            {([['detail', '상세'], ['comment', '코멘트'], ['history', '이력']] as const).map(([k, lab]) => (
              <button
                key={k}
                type="button"
                className={runTab === k ? 'on' : ''}
                onClick={() => setRunTab(k)}
              >
                {lab}
              </button>
            ))}
          </div>
          <div className="cpl-rbody">
            {runTab === 'detail' && (
              <>
                <div className="cpl-rfld">
                  <label>담당</label>
                  <button
                    type="button"
                    className="cpl-assbtn"
                    title="누르면 담당을 고릅니다"
                    onClick={(e) => {
                      const r2 = e.currentTarget.getBoundingClientRect()
                      setAssAt({
                        x: r2.left - 40,
                        y: r2.bottom + 4,
                        ceid: String(runItem.ceid ?? ''),
                        tcid: String(runItem.tcid ?? ''),
                        value: String(runItem.assignee ?? ''),
                      })
                    }}
                  >
                    {String(runItem.assignee ?? '') || '– 담당 없음'}
                  </button>
                </div>
                {fullQ.isLoading ? (
                  <div className="muted small">스텝을 읽는 중…</div>
                ) : (
                  <div className="cpl-rsteps">
                    {((runFull?.steps ?? []) as Array<Record<string, unknown>>).map((st, si) => {
                      const isManual =
                        st.kind === 'manual' || st.manual === true || st.action === '수동'
                      const what = String(st.step ?? st.desc ?? st.text ?? st.cli ?? '') || '(내용 없음)'
                      const expected = String(st.expected ?? st.criteria ?? '')
                      const res = String(st.result ?? '')
                      if (st.kind === 'comment' || st.kind === 'message')
                        return (
                          <div className="cpl-rnote" key={si}>
                            💬 {what}
                          </div>
                        )
                      return (
                        <div className={`cpl-rstep${res ? ` ${vcls(res)}` : ''}`} key={si}>
                          <span className="no">{si + 1}</span>
                          <span className="what">
                            <b>{what}</b>
                            {String(st.data ?? '') !== '' && <i>Data: {String(st.data)}</i>}
                            {expected && <em>기대: {expected}</em>}
                          </span>
                          {isManual ? (
                            <span className="res">
                              <button
                                type="button"
                                className={`sv p${res === 'Pass' ? ' on' : ''}`}
                                title="이 스텝 Pass"
                                onClick={() => giveStep(si, 'Pass')}
                              >
                                ✓
                              </button>
                              <button
                                type="button"
                                className={`sv f${res === 'Fail' ? ' on' : ''}`}
                                title="이 스텝 Fail"
                                onClick={() => giveStep(si, 'Fail')}
                              >
                                ✗
                              </button>
                            </span>
                          ) : (
                            <span className={`chip ${vcls(res)}`}>{res || '자동'}</span>
                          )}
                        </div>
                      )
                    })}
                    {((runFull?.steps ?? []) as unknown[]).length === 0 && (
                      <div className="muted small">스텝이 없습니다</div>
                    )}
                  </div>
                )}
              </>
            )}
            {runTab === 'comment' && (
              <MemoBox
                key={String(runItem.ceid ?? runItem.tcid)}
                initial={String((runFull?.memo as string) ?? '')}
                onSave={saveMemo}
              />
            )}
            {runTab === 'history' && (
              <div className="cpl-rhist">
                실행자 <b>{runItem.executed_by || '–'}</b>
                <br />
                실행 시각 <b>{String(runItem.executed_at ?? '').slice(0, 19) || '–'}</b>
                <br />
                판정 <b>{itemVerdict(runItem) || '미실행'}</b>
              </div>
            )}
          </div>
          <div className="cpl-rfoot">
            <div className="cpl-rverdicts">
              <button type="button" className="cpl-vpass" onClick={() => giveVerdict('Pass')}>
                ✓ Pass
              </button>
              <button type="button" className="cpl-vfail" onClick={() => giveVerdict('Fail')}>
                ✗ Fail
              </button>
              <select
                className="cpl-vetc"
                value=""
                title="다른 판정"
                onChange={(e) => e.target.value && giveVerdict(e.target.value)}
              >
                <option value="">기타 ▾</option>
                <option value="미실행">◌ 미실행</option>
                {resDefs
                  .filter((r) => r.v && r.v !== 'Pass' && r.v !== 'Fail' && r.v !== '미실행')
                  .map((r) => (
                    <option key={r.v} value={r.v}>
                      {r.label || r.v}
                    </option>
                  ))}
              </select>
            </div>
            <label className="cpl-jump">
              <input type="checkbox" checked={jump} onChange={(e) => setJump(e.target.checked)} />
              결과를 주면 다음 항목으로
            </label>
          </div>
          <div className="cpl-rpager">
            <button type="button" onClick={() => stepRun(-1)}>‹</button>
            <span className="sp" />
            {runIdx + 1} / {items.length}
            <span className="sp" />
            <button type="button" onClick={() => stepRun(1)}>›</button>
            <button type="button" className="btn small" onClick={() => setRunIdx(null)}>
              닫기
            </button>
          </div>
        </section>
      )}
    </div>
  )
}

/** 코멘트 칸 — 러너의 memo. 저장을 눌러야 나간다(입력마다 통짜 저장은 무겁다) */
function MemoBox({ initial, onSave }: { initial: string; onSave: (t: string) => void }) {
  const [text, setText] = useState(initial)
  const [saved, setSaved] = useState(false)
  return (
    <div className="cpl-memo">
      <textarea
        rows={6}
        value={text}
        placeholder="코멘트를 적으세요"
        onChange={(e) => {
          setText(e.target.value)
          setSaved(false)
        }}
      />
      <button
        type="button"
        className="btn small"
        onClick={() => {
          onSave(text)
          setSaved(true)
        }}
      >
        {saved ? '저장됨' : '저장'}
      </button>
    </div>
  )
}

/** 항목 하나의 고르기 키 — ceid|tcid 짝(빈 것끼리 겹치지 않게 둘 다) */
const keyOfIt = (x: { ceid?: unknown; tcid?: unknown }) =>
  `${String(x.ceid ?? '')}|${String(x.tcid ?? '')}`

/** 요구사항 묶음 줄 + 그 아래 항목들 — Testiny 의 폴더 묶음 줄 */
function GroupRows({
  g,
  folded,
  onFold,
  mode,
  resDefs,
  vcls,
  onOpen,
  chkKeys,
  onChk,
  onAssPick,
  onResult,
}: {
  mode: 'plan' | 'exec'
  g: { rid: string; label: string; items: CycleItemLite[] }
  folded: boolean
  onFold: () => void
  resDefs: Array<{ v: string; label?: string }>
  vcls: (v: string) => string
  meName: string
  onOpen: (it: CycleItemLite) => void
  chkKeys: Set<string>
  onChk: (keys: string[], on: boolean) => void
  onAssPick: (it: CycleItemLite, x: number, y: number) => void
  onResult: (
    ceid: string,
    tcid: string,
    v: string,
    prev: { executed_by?: string | null },
  ) => void
}) {
  return (
    <>
      <tr className="cpl-grp" onClick={onFold}>
        <td colSpan={6}>
          <input
            type="checkbox"
            className="cpl-grpchk"
            title="이 묶음 모두 고르기"
            checked={g.items.length > 0 && g.items.every((x) => chkKeys.has(keyOfIt(x)))}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onChk(g.items.map(keyOfIt), e.target.checked)}
          />
          <span className="caret">{folded ? '▸' : '▾'}</span> 📁 {g.label}{' '}
          <span className="cnt">| {g.items.length}</span>
        </td>
      </tr>
      {!folded &&
        g.items.map((it) => {
          const v = itemVerdict(it)
          return (
            <tr
              key={it.ceid || it.tcid}
              className={mode === 'exec' ? 'cpl-row' : ''}
              /* 줄을 누르면 러너가 열린다(Testiny). 담당·결과 같은 일하는
                 부품 위 클릭은 그 부품 몫 */
              onClick={(e) => {
                if (mode !== 'exec') return
                const el = e.target as HTMLElement
                if (el.closest('button, input, select, textarea, .pick-view')) return
                onOpen(it)
              }}
            >
              <td className="w-chk">
                <input
                  type="checkbox"
                  checked={chkKeys.has(keyOfIt(it))}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => onChk([keyOfIt(it)], e.target.checked)}
                />
              </td>
              <td className="cpl-tid">{it.tcid}</td>
              <td className="cpl-nm">{it.name || '(제목 없음)'}</td>
              <td>
                <button
                  type="button"
                  className="cpl-assbtn"
                  title="누르면 담당을 고릅니다"
                  onClick={(e) => {
                    e.stopPropagation()
                    const r2 = e.currentTarget.getBoundingClientRect()
                    onAssPick(it, r2.left - 40, r2.bottom + 4)
                  }}
                >
                  {String(it.assignee ?? '') || '–'}
                </button>
              </td>
              {mode === 'exec' && (
              <td>
                <select
                  className={`cpl-res ${vcls(v)}`}
                  value={v || '미실행'}
                  onChange={(e) =>
                    onResult(String(it.ceid ?? ''), String(it.tcid ?? ''), e.target.value, it)
                  }
                >
                  {/* 강제 미실행 = '미실행' 문자열(규약). '' 는 스텝 재계산 */}
                  <option value="미실행">◌ 미실행</option>
                  {resDefs
                    .filter((r) => r.v && r.v !== '미실행')
                    .map((r) => (
                      <option key={r.v} value={r.v}>
                        {r.label || r.v}
                      </option>
                    ))}
                </select>
              </td>
              )}
              <td className="cpl-x" />
            </tr>
          )
        })}
    </>
  )
}

/**
 * 결과 메일 창 — 미리보기를 먼저 보인다. 보낸 메일은 무를 수 없다.
 */
function CycleMailOne({ cycle, onClose }: { cycle: CycleMeta; onClose: () => void }) {
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null)

  const loadPreview = async () => {
    try {
      const r = await apiFetch(
        `/api/cycle/${encodeURIComponent(cycle.id)}/mail-preview?note=${encodeURIComponent(note)}`,
      )
      const j = (await r.json()) as { subject?: string; html?: string; detail?: string }
      if (!r.ok) throw new Error(j.detail || '미리보기를 만들지 못했습니다')
      setPreview({ subject: j.subject ?? '', html: j.html ?? '' })
      if (!subject) setSubject(j.subject ?? '')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    }
  }

  const send = async () => {
    setBusy(true)
    setMsg('')
    try {
      const r = await apiFetch(`/api/cycle/${encodeURIComponent(cycle.id)}/mail`, {
        method: 'POST',
        body: JSON.stringify({ to, subject, note }),
      })
      const j = (await r.json()) as { success?: boolean; to?: string[]; detail?: string }
      if (!r.ok || !j.success) throw new Error(j.detail || '보내지 못했습니다')
      setMsg(`보냈습니다 — ${(j.to ?? []).join(', ')}`)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div className="modal cyl-mail" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <b>결과 메일 — {cycle.name || cycle.cid}</b>
          <button className="modal-x" type="button" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>
        <div className="modal-body">
          <label className="fld">
            <span>받는 사람 (콤마로 여럿)</span>
            <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="a@co.kr, b@co.kr" autoFocus />
          </label>
          <label className="fld">
            <span>제목 (비우면 자동)</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <label className="fld">
            <span>덧붙이는 말 (맨 위에 실림)</span>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <button type="button" className="btn" onClick={() => void loadPreview()}>
            미리보기
          </button>
          {preview && (
            <iframe className="cyl-mailprev" title="메일 미리보기" sandbox="" srcDoc={preview.html} />
          )}
          {msg && <div className="cyl-mailmsg">{msg}</div>}
        </div>
        <div className="modal-foot">
          <span className="muted small">보낸 메일은 무를 수 없습니다 — 미리보기로 확인하세요.</span>
          <span className="sa-sp" />
          <button className="btn" type="button" onClick={onClose}>
            닫기
          </button>
          <button className="btn cpl-teal" type="button" disabled={busy || !to.trim()} onClick={() => void send()}>
            {busy ? '보내는 중…' : '보내기'}
          </button>
        </div>
      </div>
    </div>
  )
}
