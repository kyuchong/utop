/**
 * Cycles · Runs 가 함께 쓰는 조각들 (지시: 목업 반영).
 *
 * 두 화면이 같은 것을 다르게 그리면 사람이 같은 수를 다른 것으로 읽는다 —
 * 판정 막대·도넛·집계는 여기 한 벌만 둔다. 판정 글자(p/f/b/n)는 실행
 * 화면(RunDetail)과 같은 말이다: b 는 「기타」 지 미실행이 아니다.
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, apiFetch, categoryApi } from '@/api/client'
import { buildCategoryTree, reqPk } from '@/types'
import type { CategoryTreeNode } from '@/types'

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
}

/** 여러 실행의 집계를 한 덩어리로 */
export function sumRuns(rs: RunLite[]) {
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
export type Tally = ReturnType<typeof sumRuns>

/** 판정 한 글자 → 사람 말. 실행 화면(RunAuto)과 같은 말이라야 한다 */
export const VERD: Array<{ v: 'p' | 'f' | 'b' | 'n'; label: string; ico: string; cls: string }> = [
  { v: 'p', label: '통과', ico: '✓', cls: 'p' },
  { v: 'f', label: '실패', ico: '✕', cls: 'f' },
  { v: 'b', label: '기타', ico: '⊘', cls: 'b' },
  { v: 'n', label: '미실행', ico: '⛶', cls: 'n' },
]
export const verdName = (v: string) => VERD.find((d) => d.v === v)?.label ?? '미실행'

/** 판정 현황 막대 — 색 구간에 건수를 얹는다 */
export function StatBar({ t }: { t: Tally }) {
  if (!t.total) return <span className="cu-m">—</span>
  const parts: Array<[number, string, string]> = [
    [t.pass, 'p', '통과'],
    [t.fail, 'f', '실패'],
    [t.etc, 'b', '기타'],
    [t.none, 'n', '미실행'],
  ]
  return (
    <div className="q-stats">
      {parts.map(([v, cls, name]) =>
        v ? (
          <i key={cls} className={cls} style={{ flexGrow: v }} title={`${name} ${v}`}>
            {v}
          </i>
        ) : null,
      )}
    </div>
  )
}

/** 도넛 — parts 는 [{v, cls}], 가운데에 label/sub 를 얹는다. 색은 CSS 가 정한다 */
export function Donut({
  parts, total, label, sub, big,
}: {
  parts: Array<{ v: number; cls: string }>
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

/** 담당 고르개 후보 — 지라에서 온 계정까지, 퇴사자는 뺀 이름 목록 */
export function useUserNames(): string[] {
  const q = useQuery({
    queryKey: ['user-names'],
    staleTime: 300_000,
    queryFn: async () => {
      const r = await apiFetch('/api/user-names')
      if (!r.ok) throw new Error('담당 후보를 불러오지 못했습니다')
      return (await r.json()) as { names?: Array<{ name?: string }> }
    },
  })
  return useMemo(
    () => (q.data?.names ?? []).map((n) => String(n?.name ?? '')).filter(Boolean),
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
    const byPk = new Map<string, { label: string; title: string; folder: string }>()
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
      })
    }
    return byPk
  }, [reqsQ.data, catQ.data])
}
