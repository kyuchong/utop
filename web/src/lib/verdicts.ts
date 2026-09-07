/**
 * 실행 판정 기준 — 셋업(실행 판정 기준)이 정본이다(지시).
 *
 * 값은 `/api/codes` 의 kind='cycle_result' 한 곳에 산다(색·계열은 note JSON).
 * 기본 여섯은 셋업 화면(VerdictSettings.BASE)과 같은 벌 — 셋업에 저장된
 * 행이 있으면 그 색·글자가 덮고, 새 값은 뒤에 붙는다. Cycles·Runs 의
 * 선택지·알약·막대·도넛·집계가 전부 이 목록 하나를 읽는다.
 *
 * 실행 기록(plan_run.results)에는 판정 **값 그대로** 담는다(예전 p/f/b/n
 * 네 글자는 서버 시동 마이그레이션이 걷는다). 이행기의 옛 글자도 읽는
 * 쪽에서는 알아듣는다 — vGroup·vLetter 가 그 통역이다.
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'

export type VerdGroup = 'pass' | 'fail' | 'neutral'

export interface VerdDef {
  /** 저장되는 값 — '' 는 미실행 */
  v: string
  label: string
  /** 진한 색(알약 바탕·도넛 조각) */
  color: string
  /** 눌러 둔 글자색(연한 바탕 위) */
  fg: string
  /** 셈 계열 — pass=합격, fail=실패, neutral=합격률에서 뺌 */
  group: VerdGroup
}

/** 기본 여섯 — 셋업 화면(VerdictSettings)의 BASE 와 같은 벌이라야 한다 */
export const VERD_BASE: VerdDef[] = [
  { v: 'Pass', label: 'Pass', color: '#16a34a', fg: '#0a7a45', group: 'pass' },
  { v: 'Fail', label: 'Fail', color: '#dc2626', fg: '#c22222', group: 'fail' },
  { v: 'WIP', label: 'WIP', color: '#f0b429', fg: '#a16207', group: 'neutral' },
  { v: 'Blocked', label: 'Blocked', color: '#e8820c', fg: '#b45309', group: 'neutral' },
  { v: '진행불가', label: '진행불가', color: '#8b93a1', fg: '#64748b', group: 'neutral' },
  { v: '', label: '미실행', color: '#c3cad4', fg: '#64748b', group: 'neutral' },
]

/** 옛 네 글자·레거시 동의어 → 판정 값. b(기타)는 Blocked 로 옮기기로 정했다(승인) */
export const LETTER_VERD: Record<string, string> = {
  p: 'Pass', f: 'Fail', b: 'Blocked', n: '',
  합격: 'Pass', 불합격: 'Fail', 미실행: '',
}

interface CodeItem {
  kind?: string
  value?: string
  sort_order?: number
  note?: string | null
}

/** 셋업의 판정 목록 + 도착 여부 — Test Summary 초안처럼 「셋업을 다 읽고
    셈했나」 가 중요한 곳은 ready 를 함께 본다(검증 지적: 커스텀 계열이
    폴백(중립)으로 셈해진 채 굳는다) */
export function useVerdictsState(): { defs: VerdDef[]; ready: boolean } {
  const q = useQuery({
    queryKey: ['codes'],
    staleTime: 60_000,
    queryFn: async () => {
      const r = await apiFetch('/api/codes')
      if (!r.ok) throw new Error('판정 기준을 불러오지 못했습니다')
      return (await r.json()) as { codes?: CodeItem[]; items?: CodeItem[] }
    },
  })
  const defs = useMemo(() => {
    const out = VERD_BASE.map((d) => ({ ...d }))
    const rows = (q.data?.codes ?? q.data?.items ?? [])
      .filter((c) => c.kind === 'cycle_result')
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    for (const c of rows) {
      const val = String(c.value ?? '').trim()
      let m: { color?: string; fg?: string; label?: string; group?: string } = {}
      try {
        m = JSON.parse(c.note || '{}') as typeof m
      } catch {
        /* 옛 자료 */
      }
      const g: VerdGroup = m.group === 'pass' || m.group === 'fail' ? m.group : 'neutral'
      const cur = out.find((d) => d.v === val)
      if (cur) {
        /* 기본과 같은 값이면 색·글자만 덮는다 — 저장된 결과는 안 흔들린다.
           기본 여섯의 계열은 판정 규칙이 물고 있어 셋업도 안 바꾼다 */
        cur.color = m.color || cur.color
        cur.fg = m.fg || cur.fg
        cur.label = m.label || cur.label
      } else if (val) {
        out.push({ v: val, label: m.label || val, color: m.color || '#7c4dff', fg: m.fg || '#5b21b6', group: g })
      }
    }
    return out
  }, [q.data])
  return { defs, ready: q.data !== undefined || q.isError }
}

/** 셋업의 판정 목록 — 기본 여섯에 저장분을 덮고, 새 값을 뒤에 붙인다 */
export function useVerdicts(): VerdDef[] {
  return useVerdictsState().defs
}

/** 판정 값의 정의 — 옛 글자(p/f/b/n)도 알아듣고, 모르는 값은 중립 보라로 */
export function vDef(defs: VerdDef[], v: string): VerdDef {
  const val = LETTER_VERD[v] ?? v
  return (
    defs.find((d) => d.v === val) ?? {
      v: val,
      label: val || '미실행',
      color: '#7c4dff',
      fg: '#5b21b6',
      group: 'neutral',
    }
  )
}

/** 셈 계열 — ''(미실행)만 none, 나머지는 정의를 따른다 */
export function vGroup(defs: VerdDef[], v: string): VerdGroup | 'none' {
  const val = LETTER_VERD[v] ?? v
  if (!val) return 'none'
  return vDef(defs, val).group
}

/** 실행기 내부용 네 글자 — 실행기 판(RunDetail)의 톱니는 이 넷으로 돈다 */
export function vLetter(defs: VerdDef[], v: string): 'p' | 'f' | 'b' | 'n' {
  const g = vGroup(defs, v)
  return g === 'pass' ? 'p' : g === 'fail' ? 'f' : g === 'none' ? 'n' : 'b'
}

/** 사람 말 — 표·알약·CSV 가 쓴다 */
export function vName(defs: VerdDef[], v: string): string {
  return vDef(defs, v).label
}
