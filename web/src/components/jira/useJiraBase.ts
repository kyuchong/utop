/**
 * 지라 주소 한 줄 — 서랍이 「Jira 에서 열기」 와 그림 주소에 쓴다.
 *
 * 규칙이랄 것도 없는 한 줄이지만, 두 화면이 각자 적어 두면 그것부터 갈린다
 * (한쪽만 끝 슬래시를 떼는 식으로). queryKey 를 Releases 와 **똑같이**
 * 두어 캐시를 나눠 쓴다 — 화면이 늘어도 요청은 안 는다.
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'

export function useJiraBase(): string {
  const q = useQuery({
    queryKey: ['jira-cfg'],
    staleTime: 300_000,
    queryFn: async () => {
      const r = await apiFetch('/api/jira/config')
      if (!r.ok) return {} as Record<string, unknown>
      return (await r.json()) as Record<string, unknown>
    },
  })
  return useMemo(() => String(q.data?.url ?? '').replace(/\/+$/, ''), [q.data])
}
