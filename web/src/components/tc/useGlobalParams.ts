import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import type { PickItem } from './PickList'

/** 전역 파라미터 한 줄. 옛 화면(07-global-params.js)이 쓰는 모양 그대로다. */
export interface GlobalParam {
  group?: string
  name?: string
  value?: string
  desc?: string
}

/** `/api/global-params` 의 응답 — 모델 이름이 곧 키다 */
type GlobalParamFile = Record<string, GlobalParam[] | unknown>

const GLOBAL_KEY = '__global__'
const FOLDER_KEY = '__gp_folders__'

/**
 * 전역 파라미터.
 *
 * iTest 의 parameter file(.ffpt)에 해당한다. `__global__` 에 공통 값이,
 * 모델 이름 키에 그 모델만의 값이 들어 있다 — 같은 시험을 E6100 과
 * E5724RL 에서 돌릴 때 포트 이름이나 슬롯 번호가 다른 것을 여기서 흡수한다.
 *
 * 스텝에서는 `${이름}` 으로 쓴다. 실행할 때 실제 값으로 바뀐다.
 *
 * 모델 것이 공통 것을 덮는다 — 공통에 적어 두고 특정 모델만 예외를 두는
 * 것이 이 파일을 쓰는 이유다.
 */
export function useGlobalParams(model?: string, override?: string) {
  const q = useQuery({
    queryKey: ['global-params'],
    queryFn: async () => {
      const r = await apiFetch('/api/global-params')
      if (!r.ok) throw new Error('전역 파라미터를 불러오지 못했습니다')
      return (await r.json()) as GlobalParamFile
    },
    staleTime: 60_000,
  })

  const rows = (k: string): GlobalParam[] => {
    const v = q.data?.[k]
    return Array.isArray(v) ? (v as GlobalParam[]) : []
  }

  /** 이름 → 값. 모델 것이 나중에 들어가 공통을 덮는다. */
  const values: Record<string, string> = {}
  const items: PickItem[] = []
  const seen = new Set<string>()

  const take = (k: string, from: string) => {
    for (const p of rows(k)) {
      const name = (p.name || '').trim()
      if (!name) continue
      values[name] = p.value ?? ''
      if (!seen.has(name)) {
        seen.add(name)
        items.push({
          value: `\${${name}}`,
          label: name,
          // 그룹 경로를 함께 보인다 — 파일 안이 여러 단계로 나뉘면 이름만
          // 봐서는 어느 것인지 모른다
          note: [p.group, p.desc, from].filter(Boolean).join(' · '),
        })
      }
    }
  }

  // 공통은 늘 깔린다. 그 위에 파일 하나가 덮는다 —
  // TC 가 못박았으면(override) 그것, 아니면 장비 모델 것.
  take(GLOBAL_KEY, '공통')
  const use = (override || model || '').trim()
  if (use && use !== GLOBAL_KEY && use !== FOLDER_KEY) take(use, use)

  return {
    values,
    items,
    loading: q.isLoading,
    /** 어느 파일까지 섞였는지 — 화면에 밝힌다 */
    model: use,
    /** TC 가 못박았는가, 장비 모델에서 따라왔는가 */
    pinned: !!override,
    /** 고를 수 있는 파일 이름 */
    files: Object.keys(q.data ?? {}).filter((k) => k !== FOLDER_KEY),
    empty: q.isLoading
      ? ''
      : '전역 파라미터가 없습니다 — 상단 메뉴의 「전역 파라미터」 에서 만드세요.',
  }
}
