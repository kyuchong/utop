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
  /** 설정의 코드 종류(req_status 등) — 만든 칸은 없다 */
  kind?: string
}

/** 열 폭의 **기본값**(지시: 기본 40, 손으로 조절). 설정에서 정하면 그것이 이긴다 */
export const COL_W_DEFAULT = 40

const BASE: Record<'req' | 'tc' | 'cycle', Array<{ kind: string; k: string; label: string; w: string }>> = {
  req: [
    /* 통채움이 되면서 값이 「작…」 으로 잘렸다(지적) — 값이 통째로 서는
       폭이다. 「작성중」·「검토완료」·「Medium」 을 실측한 값 */
    { kind: 'req_status', k: 'f_status', label: '상태', w: '84px' },
    { kind: 'req_priority', k: 'f_priority', label: '우선순위', w: '92px' },
  ],
  tc: [
    /* 너무 조였더니 값도 머리 이름도 잘렸다(지적: 필드 내용이 안 보인다) —
       머리는 「이름+∨」 가, 칸은 값이 통째로 서는 폭이다.
       Function·작성중·Blocker·수동·자체 를 실측한 값. */
    { kind: 'tc_type', k: 'f_type', label: '유형', w: '84px' },
    { kind: 'tc_status', k: 'f_status', label: '상태', w: '78px' },
    { kind: 'tc_severity', k: 'f_severity', label: '중요도', w: '82px' },
    { kind: 'tc_run_type', k: 'f_kind', label: '타입', w: '68px' },
    { kind: 'tc_origin', k: 'f_origin', label: '구분', w: '68px' },
  ],
  // 실행 결과 탭은 열이 아니라 진행결과 바가 쓰는 값 체계라 뺀다
  cycle: [
    { kind: 'cycle_status', k: 'f_status', label: '상태', w: '62px' },
    /* 고객 이름은 「LGUPLUS」 처럼 길다 — 62px 로는 잘렸다(지적) */
    { kind: 'cycle_customer', k: 'f_customer', label: '고객', w: '92px' },
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
  /* 열 폭은 **설정이 정본**이다(지시) — 세 화면이 여기 한 곳에서 받아 간다.
     여태 요구사항만 이 값을 읽었고 시험항목·사이클은 코드에 박힌 폭을
     썼다. 한 군데서 정하지 않으면 「설정했는데 안 바뀐다」가 된다. */
  const styleQ = useQuery({
    queryKey: ['code-kind-style'],
    queryFn: async () => {
      const r = await apiFetch('/api/codes/kind-style')
      if (!r.ok) return { styles: {} as Record<string, { w?: string }> }
      return (await r.json()) as { styles: Record<string, { w?: string }> }
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
    const styles = styleQ.data?.styles ?? {}
    const base = BASE[target]
      // 숨긴(비활성) 기본 칸은 kinds 에서 빠져서 온다
      .filter((b) => !kinds || b.kind in kinds)
      .map((b) => {
        const w = Number(styles[b.kind]?.w)
        return {
          k: b.k,
          label: kinds?.[b.kind] || b.label,
          kind: b.kind,
          w: `${Number.isFinite(w) && w > 0 ? w : COL_W_DEFAULT}px`,
        }
      })
    const cf = (cfQ.data?.items ?? [])
      .filter((f) => f.show_list !== false)
      .map((f) => ({ k: `cf_${f.key}`, label: f.label, w: 'minmax(72px, 110px)' }))
    return [...base, ...cf]
  }, [kindsQ.data, cfQ.data, styleQ.data, target])
}
