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
/** 파일이 끌어다 쓰는 다른 파일들. iTest 의 Include 탭에 해당한다. */
export const INCLUDE_KEY = '__includes__'

export function fileIncludes(data: GlobalParamFile | undefined, file: string): string[] {
  const m = (data?.[INCLUDE_KEY] ?? {}) as Record<string, unknown>
  const v = m[file]
  return Array.isArray(v) ? (v as string[]) : []
}

/**
 * 전역 파라미터.
 *
 * iTest 의 parameter file(.ffpt)에 해당한다. **고른 파일이 순서대로 쌓이고
 * 뒤가 앞을 덮는다.** 파일이 다른 파일을 include 하고 있으면 그것부터 깔린다 —
 * 공통을 include 해 두고 파일마다 예외만 적는 것이 iTest 의 쓰는 법이다.
 *
 * 스텝에서는 `${이름}` 으로 쓴다. 실행할 때 실제 값으로 바뀐다.
 */
export function useGlobalParams(files: string[] = []) {
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

  const values: Record<string, string> = {}
  const items: PickItem[] = []
  const byName = new Map<string, number>()

  const take = (k: string) => {
    for (const p of rows(k)) {
      const name = (p.name || '').trim()
      if (!name) continue
      values[name] = p.value ?? ''
      const note = [p.group, p.desc, k].filter(Boolean).join(' · ')
      const at = byName.get(name)
      // 뒤가 앞을 덮으므로 목록에도 마지막 것만 남는다 — 두 줄이 보이면
      // 어느 값이 실제로 쓰이는지 알 수 없다
      if (at === undefined) {
        byName.set(name, items.length)
        items.push({ value: `\${${name}}`, label: name, note })
      } else {
        items[at] = { value: `\${${name}}`, label: name, note }
      }
    }
  }

  /** include 를 따라 내려간다. 서로 물면 한 번씩만 본다. */
  const walk = (k: string, seen: Set<string>) => {
    if (seen.has(k)) return
    seen.add(k)
    for (const inc of fileIncludes(q.data, k)) walk(inc, seen)
    take(k)
  }

  const seen = new Set<string>()
  for (const f of files) walk(f, seen)

  return {
    values,
    items,
    loading: q.isLoading,
    /** 실제로 깔린 파일 — include 까지 편 순서 */
    used: [...seen],
    /** 고를 수 있는 파일 이름 */
    files: Object.keys(q.data ?? {}).filter((k) => k !== FOLDER_KEY && k !== INCLUDE_KEY),
    empty: q.isLoading
      ? ''
      : files.length === 0
        ? '이 TC 에 파라미터 파일이 안 붙어 있습니다 — 위 실행 줄의 「파라미터」 에서 고르세요.'
        : '고른 파일에 값이 없습니다.',
  }
}
