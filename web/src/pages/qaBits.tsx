/**
 * Cycles · Runs 가 함께 쓰는 조각들 (지시: 목업 반영).
 *
 * 두 화면이 같은 것을 다르게 그리면 사람이 같은 수를 다른 것으로 읽는다 —
 * 판정 막대·도넛·집계는 여기 한 벌만 둔다. 판정 글자(p/f/b/n)는 실행
 * 화면(RunDetail)과 같은 말이다: b 는 「기타」 지 미실행이 아니다.
 */
import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { api, apiFetch, categoryApi } from '@/api/client'
import { prefGet, prefSet } from '@/lib/prefs'
import { buildCategoryTree, reqPk } from '@/types'
import type { CategoryTreeNode } from '@/types'
import type { NCol } from '@/components/ntable/types'
import { vLetter, type VerdDef } from '@/lib/verdicts'

/** 실행 목록 한 줄 — 목록 API 가 집계까지 함께 준다(큰 결과는 안 읽는다) */
export interface RunLite {
  id: string
  plan_id?: string | null
  name?: string | null
  version?: string | null
  version_group?: string | null
  owner?: string | null
  start_date?: string | null
  end_date?: string | null
  closed_at?: string | null
  rerun_of?: string | null
  created_by?: string | null
  created_at?: string | null
  mode?: string | null
  meta?: Record<string, string> | null
  binds?: Record<string, string> | null
  n_total: number
  n_pass: number
  n_fail: number
  n_etc: number
  n_none: number
  /** 판정 값별 건수 — {Pass: 3, WIP: 1, '': 2}. 팝업이 WIP·Blocked·진행불가를 따로 센다 */
  hist?: Record<string, number>
}

/** 여러 실행의 집계를 한 덩어리로 */
export function sumRuns(rs: RunLite[]) {
  const s = { pass: 0, fail: 0, etc: 0, none: 0, total: 0 }
  const by: Record<string, number> = {}
  for (const r of rs) {
    s.pass += r.n_pass || 0
    s.fail += r.n_fail || 0
    s.etc += r.n_etc || 0
    s.none += r.n_none || 0
    s.total += r.n_total || 0
    for (const [v, n] of Object.entries(r.hist ?? {})) by[v] = (by[v] ?? 0) + (Number(n) || 0)
  }
  const done = s.pass + s.fail + s.etc
  return {
    ...s,
    by,
    done,
    prg: s.total ? Math.round((done / s.total) * 100) : 0,
    rate: s.pass + s.fail ? Math.round((s.pass / (s.pass + s.fail)) * 100) : 0,
  }
}
export type Tally = ReturnType<typeof sumRuns>

/** 판정 현황 막대 — 색 구간에 건수를 얹는다. pal 은 셋업 판정 색(계열 대표).
    slim 은 좁은 칸용(지시): 숫자를 안 얹는 대신 올리면 자세한 내역이 뜬다 */
export function StatBar({
  t,
  pal,
  slim,
  title,
  defs,
}: {
  t: Tally
  pal?: Record<string, string>
  slim?: boolean
  /** 팝업 머리에 적을 이름 — 사이클 이름. 주면 slim 막대에 올렸을 때 그림 같은 어두운 팝업이 뜬다(지시) */
  title?: string
  /** 셋업의 실행 판정 기준 — 주면 팝업 줄이 그 목록 차례·색을 따른다(WIP·Blocked·진행불가·직접 만든 것까지) */
  defs?: VerdDef[]
}) {
  /* 팝업 자리 — 막대의 화면 좌표. 표 칸은 overflow 로 잘리므로 body 에 띄운다 */
  const [pop, setPop] = useState<{ x: number; y: number; up: boolean } | null>(null)
  if (!t.total) return <span className="cu-m">—</span>
  const parts: Array<[number, string, string]> = [
    [t.pass, 'p', '합격'],
    [t.fail, 'f', '실패'],
    [t.etc, 'b', '검증 불가'],
    [t.none, 'n', '미실행'],
  ]
  const pct = (v: number) => (t.total ? Math.round((v / t.total) * 100) : 0)
  const detail =
    parts
      .filter(([v]) => v > 0)
      .map(([v, , name]) => `${name} ${v} (${pct(v)}%)`)
      .join(' · ') + ` — 총 ${t.total}건, 합격률 ${t.rate}%`
  /* 진행률 — 미실행을 뺀 실행 비율. 좁은 칸(slim)에서 막대 오른쪽에
     적는다(지시: 막대만 있으면 몇 % 진행인지 안 보인다). */
  const prog = t.total ? Math.round(((t.total - t.none) / t.total) * 100) : 0
  const rich = slim && title !== undefined
  const bar = (
    <div className={`q-stats${slim ? ' slim' : ''}`} title={slim && !rich ? detail : undefined}>
      {parts.map(([v, cls, name]) =>
        v ? (
          <i
            key={cls}
            className={cls}
            style={{ flexGrow: v, ...(pal?.[cls] ? { background: pal[cls] } : {}) }}
            title={slim ? undefined : `${name} ${v}`}
          >
            {slim ? '' : v}
          </i>
        ) : null,
      )}
    </div>
  )
  if (!slim) return bar
  /* 어두운 팝업(지시: 그림처럼) — Pass·Fail 줄에 색 점, 건수 / 비율, 그 아래 항목 수·진행률.
     검증 불가·미실행은 있을 때만 줄을 낸다. 아래쪽 행이면 위로 띄운다. */
  /* 줄 — 셋업의 판정 목록 차례로. Pass·Fail 은 늘, 나머지(WIP·Blocked·진행불가·직접 만든 것)는
     건수가 있을 때만(지시: 그것들이 팝업에 안 나온다). 값별 건수(hist)가 없는 옛 서버면 네 칸으로 접은
     것(etc)을 「검증 불가」 한 줄로 낸다. 미실행은 맨 아래 흐린 글줄. */
  const by = t.by ?? {}
  const rows: Array<{ name: string; cls: string; color?: string; n: number }> = []
  if (defs && defs.length) {
    for (const d of defs) {
      if (d.v === '') continue
      const n = by[d.v] ?? (d.v === 'Pass' ? t.pass : d.v === 'Fail' ? t.fail : 0)
      if (n > 0 || d.v === 'Pass' || d.v === 'Fail') rows.push({ name: d.label, cls: vLetter(defs, d.v), color: d.color, n })
    }
    /* 셋업 목록에 없는 값이 기록에 있으면(지운 판정 등) 그것도 버리지 않는다 */
    for (const [v, n] of Object.entries(by)) {
      if (v && n > 0 && !defs.some((d) => d.v === v)) rows.push({ name: v, cls: 'b', n })
    }
  } else {
    rows.push({ name: 'Pass', cls: 'p', n: t.pass }, { name: 'Fail', cls: 'f', n: t.fail })
    if (t.etc) rows.push({ name: '검증 불가', cls: 'b', n: t.etc })
  }
  const tail = t.none ? `미실행 ${t.none}` : ''
  return (
    <div
      className="q-statsw"
      title={rich ? undefined : detail}
      onMouseEnter={(e) => {
        if (!rich) return
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
        const up = window.innerHeight - r.bottom < 170
        setPop({ x: Math.min(r.left, window.innerWidth - 300), y: up ? r.top - 6 : r.bottom + 6, up })
      }}
      onMouseLeave={() => setPop(null)}
    >
      {bar}
      <span className="q-statpct">{prog}%</span>
      {rich &&
        pop &&
        createPortal(
          <div
            className="q-statpop"
            style={{ left: pop.x, top: pop.up ? undefined : pop.y, bottom: pop.up ? window.innerHeight - pop.y : undefined }}
            role="tooltip"
          >
            <div className="q-statpop-t">{title || '(이름 없음)'}</div>
            {rows.map((r) => (
              <div className="q-statpop-r" key={r.name}>
                <i className={`q-statpop-d ${r.cls}`} style={r.color ? { background: r.color } : pal?.[r.cls] ? { background: pal[r.cls] } : undefined} />
                <span>
                  {r.name} <b>{r.n}</b> / {pct(r.n)}%
                </span>
              </div>
            ))}
            <div className="q-statpop-f">
              항목 {t.total}개 · 진행률 {prog}%
            </div>
            {tail && <div className="q-statpop-s">{tail}</div>}
          </div>,
          document.body,
        )}
    </div>
  )
}

/** 도넛 — parts 는 [{v, cls}], 가운데에 label/sub 를 얹는다. 색은 CSS 가 정한다 */
export function Donut({
  parts, total, label, sub, big,
}: {
  parts: Array<{ v: number; cls: string; color?: string }>
  total: number
  label: string
  sub: string
  big?: boolean
}) {
  const R = big ? 40 : 34
  const SW = big ? 15 : 13
  const C = 2 * Math.PI * R
  let off = 0
  const arcs = parts
    .filter((x) => x.v > 0)
    .map((x, i) => {
      const len = total ? (x.v / total) * C : 0
      const el = (
        <circle
          key={i}
          className={`dseg ${x.cls}`}
          r={R}
          cx={50}
          cy={50}
          fill="none"
          strokeWidth={SW}
          strokeDasharray={`${len} ${C - len}`}
          strokeDashoffset={-off}
          style={x.color ? { stroke: x.color } : undefined}
        />
      )
      off += len
      return el
    })
  const size = big ? 146 : 102
  return (
    <svg className={`donut2${big ? ' big' : ''}`} viewBox="0 0 100 100" width={size} height={size} role="img">
      <circle className="dbg" r={R} cx={50} cy={50} fill="none" strokeWidth={SW} />
      <g transform="rotate(-90 50 50)">{arcs}</g>
      <text className="dnum" x={50} y={49} textAnchor="middle">{label}</text>
      <text className="dsub" x={50} y={64} textAnchor="middle">{sub}</text>
    </svg>
  )
}

/** 「3일 전」 — 목록의 마지막 실행 칸에 쓴다 */
export function ago(d?: string | null): string {
  if (!d) return ''
  const t = new Date(String(d)).getTime()
  if (!Number.isFinite(t)) return ''
  const n = Math.round((Date.now() - t) / 86400000)
  if (n <= 0) return '오늘'
  if (n === 1) return '어제'
  if (n < 30) return `${n}일 전`
  return `${Math.floor(n / 30)}개월 전`
}

/**
 * 시험 항목의 **보이는 차례** — 폴더 ▸ REQ ▸ ID.
 *
 * Cycles 의 항목 표, Runs 의 항목 표, 그리고 **실행기가 도는 차례**가 전부
 * 이 한 함수를 쓴다. 화면마다 제각기 정렬하면 「표에 보이는 차례와 다르게
 * 돈다」 가 된다(지적). 정렬 기준을 바꿀 일이 있으면 여기 한 곳만 고친다.
 */
export function orderTcIds(
  ids: string[],
  tcOf: Map<string, { req_id?: unknown; [k: string]: unknown }>,
  reqIndex: Map<string, { label: string; folder: string }>,
): string[] {
  const cmp = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' }).compare
  const keyOf = (id: string) => {
    const rq = reqIndex.get(String(tcOf.get(id)?.req_id ?? ''))
    return { f: rq?.folder ?? '미분류', r: rq?.label ?? '' }
  }
  return [...ids].sort((a, b) => {
    const ka = keyOf(a)
    const kb = keyOf(b)
    return cmp(ka.f, kb.f) || cmp(ka.r, kb.r) || cmp(a, b)
  })
}

/**
 * 노션 표의 열 상태 — 폭·숨김·차례를 계정에 기억한다(utop.ntb.* 는 동기 목록).
 *
 * 열의 **정의**(이름·타입·선택지)는 코드가 정본이다 — 저장본에는 폭·숨김·
 * 차례만 남긴다. 정의까지 저장하면 코드에서 열을 고쳐도 옛 저장본이 이긴다.
 */
export function useNCols(prefKey: string, defs: NCol[]): [NCol[], (c: NCol[]) => void] {
  const [cols, setColsRaw] = useState<NCol[]>(() => {
    try {
      const saved = JSON.parse(prefGet(prefKey) ?? '') as {
        order?: string[]
        w?: Record<string, number>
        hid?: string[]
      }
      const hid = new Set(saved.hid ?? [])
      const byKey = new Map(defs.map((c) => [c.key, c]))
      const ordered = [
        ...(saved.order ?? []).map((k) => byKey.get(k)).filter((c): c is NCol => !!c),
        ...defs.filter((c) => !(saved.order ?? []).includes(c.key)),
      ]
      return ordered.map((c) => ({
        ...c,
        width: saved.w?.[c.key] ?? c.width,
        hidden: hid.has(c.key) ? true : c.hidden,
      }))
    } catch {
      return defs
    }
  })
  const setCols = (next: NCol[]) => {
    setColsRaw(next)
    try {
      prefSet(
        prefKey,
        JSON.stringify({
          order: next.map((c) => c.key),
          w: Object.fromEntries(next.filter((c) => c.width).map((c) => [c.key, c.width])),
          hid: next.filter((c) => c.hidden).map((c) => c.key),
        }),
      )
    } catch {
      /* 사생활 보호 모드 */
    }
  }
  return [cols, setCols]
}

/** 담당 후보를 **조직째** — 노션 표 사람 고르개·담당 고르개가 조직으로 묶는다 */
export function useUserPeople(): Array<{ name: string; org: string }> {
  const q = useQuery({
    queryKey: ['user-names'],
    staleTime: 300_000,
    queryFn: async () => {
      const r = await apiFetch('/api/user-names')
      if (!r.ok) throw new Error('담당 후보를 불러오지 못했습니다')
      return (await r.json()) as { names?: Array<{ name?: string; org?: string }> }
    },
  })
  return useMemo(
    () =>
      (q.data?.names ?? [])
        .map((n) => ({ name: String(n?.name ?? ''), org: String(n?.org ?? '') }))
        .filter((n) => n.name),
    [q.data],
  )
}

/**
 * TC → 폴더 경로 · REQ 이름표.
 *
 * 시험 항목 표는 폴더 ▸ REQ ▸ TC 로 묶인다(목업). 폴더는 REQ 의 분류
 * (cat1‥cat4)에서 오고, REQ 이름표는 reqid 가 사람 말이다 — 안쪽 키
 * (rq-178…)를 그대로 보이면 무엇인지 알 수 없다.
 */
export function useReqIndex() {
  const reqsQ = useQuery({
    queryKey: ['reqs'],
    staleTime: 60_000,
    queryFn: ({ signal }) => api.listRequirements(signal),
  })
  const catQ = useQuery({
    queryKey: ['req-categories'],
    staleTime: 60_000,
    queryFn: ({ signal }) => categoryApi.list(signal),
  })
  return useMemo(() => {
    const catName = new Map<string, string>()
    const walk = (ns: CategoryTreeNode[]) => {
      for (const n of ns) {
        catName.set(n.id, n.name)
        walk(n.children)
      }
    }
    walk(buildCategoryTree(catQ.data?.categories ?? []))
    const byPk = new Map<
      string,
      { label: string; title: string; folder: string; custom: Record<string, unknown> }
    >()
    for (const r of reqsQ.data?.reqs ?? []) {
      const pk = reqPk(r)
      if (!pk) continue
      const folder = [r.cat1, r.cat2, r.cat3, r.cat4]
        .map((c) => (c ? catName.get(String(c)) : ''))
        .filter(Boolean)
        .join(' ▸ ')
      byPk.set(pk, {
        label: String(r.reqid ?? r.id ?? ''),
        title: String(r.title ?? ''),
        folder: folder || '미분류',
        /* 사람이 만든 칸(cf_) — 사이클 표가 열로 세워 그 값으로 차례를 정한다.
           요구사항에 만든 칸은 그 요구사항의 시험 항목이 함께 물려받는다. */
        custom: ((r as unknown as { custom?: Record<string, unknown> }).custom ?? {}),
      })
    }
    return byPk
  }, [reqsQ.data, catQ.data])
}
