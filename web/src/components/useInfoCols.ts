import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'

/**
 * 화면 ⚙ 에 세울 INFO 필드 목록 — SETUP 구성과 1:1 (합의 규칙).
 *
 * 기본 칸(코드 탭)은 SETUP 의 이름 변경·숨김을 그대로 따르고, 만든
 * 칸(커스텀 필드)은 「목록 표시」 가 켜진 것만 온다. 그래서 SETUP 에서
 * 필드를 비활성하면 세 화면 ⚙ 에서도 함께 사라진다.
 */
export interface InfoCol {
  /** 열쇠 — 기본 칸은 f_<필드>, 만든 칸은 cf_<key> */
  k: string
  label: string
  w: string
}

const BASE: Record<'req' | 'tc' | 'cycle', Array<{ kind: string; k: string; label: string; w: string }>> = {
  req: [
    { kind: 'req_status', k: 'f_status', label: '상태', w: '72px' },
    { kind: 'req_priority', k: 'f_priority', label: '우선순위', w: '64px' },
  ],
  tc: [
    { kind: 'tc_type', k: 'f_type', label: '유형', w: '74px' },
    { kind: 'tc_status', k: 'f_status', label: '상태', w: '70px' },
    { kind: 'tc_severity', k: 'f_severity', label: '중요도', w: '80px' },
    { kind: 'tc_run_type', k: 'f_kind', label: '타입', w: '84px' },
    { kind: 'tc_origin', k: 'f_origin', label: '구분', w: '76px' },
  ],
  // 실행 결과 탭은 열이 아니라 진행결과 바가 쓰는 값 체계라 뺀다
  cycle: [
    { kind: 'cycle_status', k: 'f_status', label: '상태', w: '64px' },
    { kind: 'cycle_customer', k: 'f_customer', label: '고객', w: '64px' },
  ],
}

export function useInfoCols(target: 'req' | 'tc' | 'cycle'): InfoCol[] {
  const kindsQ = useQuery({
    queryKey: ['codes'],
    queryFn: async () => {
      const r = await apiFetch('/api/codes')
      return (await r.json()) as { kinds?: Record<string, string> }
    },
    staleTime: 30_000,
  })
  const cfQ = useQuery({
    queryKey: ['custom-fields', target],
    // cycle 은 커스텀 필드 대상이 아니다 (CF_TARGETS = tc·req)
    enabled: target !== 'cycle',
    queryFn: async () => {
      const r = await apiFetch(`/api/custom-fields?target=${target}`)
      return (await r.json()) as {
        items?: Array<{ key: string; label: string; show_list?: boolean }>
      }
    },
    staleTime: 30_000,
  })
  return useMemo(() => {
    const kinds = kindsQ.data?.kinds
    const base = BASE[target]
      // 숨긴(비활성) 기본 칸은 kinds 에서 빠져서 온다
      .filter((b) => !kinds || b.kind in kinds)
      .map((b) => ({ k: b.k, label: kinds?.[b.kind] || b.label, w: b.w }))
    const cf = (cfQ.data?.items ?? [])
      .filter((f) => f.show_list !== false)
      .map((f) => ({ k: `cf_${f.key}`, label: f.label, w: 'minmax(72px, 110px)' }))
    return [...base, ...cf]
  }, [kindsQ.data, cfQ.data, target])
}
