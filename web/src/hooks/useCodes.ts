import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'

interface CodeItem {
  kind: string
  value: string
  sort_order?: number
}

/**
 * 드롭다운에 들어가는 값을 서버에서 읽는다.
 *
 * 전에는 TcForm.tsx 와 TcDetail.tsx 에 같은 배열이 따로 박혀 있어서 서로
 * 어긋날 수 있었고, 항목 하나 늘리려면 배포를 해야 했다. 이제 설정 →
 * 코드 관리에서 고치면 두 화면에 함께 반영된다.
 *
 * fallback 은 서버가 아직 값을 안 준 첫 렌더에서 빈 드롭다운이 뜨는 것을
 * 막기 위한 것이다 — 목록이 비면 이미 저장된 값도 못 고른다.
 */
export function useCodes(kind: string, fallback: string[] = []): string[] {
  const q = useQuery({
    queryKey: ['codes'],
    queryFn: async () => {
      const r = await apiFetch('/api/codes')
      if (!r.ok) throw new Error('코드 목록을 불러오지 못했습니다')
      return (await r.json()) as { items: CodeItem[] }
    },
    staleTime: 60_000,
  })
  const got = (q.data?.items ?? []).filter((i) => i.kind === kind).map((i) => i.value)
  return got.length > 0 ? got : fallback
}
