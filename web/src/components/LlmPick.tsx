import { useState } from 'react'
import { prefGet, prefSet } from '@/lib/prefs'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'

/**
 * 누구에게 맡길 것인가 — **한 벌짜리 드롭바**.
 *
 * Object 탭에만 있던 것을 떼어 냈다(지시: Intent·Coverage·토폴로지·
 * 매뉴얼·오토메이션·플랜 요약에도). 같은 자리에 같은 모양으로 있어야
 * 한 번 배운 손이 어느 탭에서나 통한다.
 *
 * 랩 안의 로컬 LLM 과 Claude 는 잘하는 일이 다르다 — 로컬은 밖으로 나가지
 * 않아 자료를 맡길 수 있고, Claude 는 글이 낫다. 그래서 매번 고를 수
 * 있어야 하고, 고른 것은 **자리마다 따로** 기억한다. 배선에 쓰는 모델과
 * 결과 요약에 쓰는 모델이 같아야 할 이유가 없다.
 *
 * 고를 것이 하나뿐이면 그리지 않는다 — 고를 수 없는 드롭바는 자리만
 * 차지한다.
 */
export default function LlmPick({
  value,
  onChange,
  title = '누구에게 맡길지',
}: {
  value: string
  onChange: (v: string) => void
  title?: string
}) {
  const q = useQuery({
    queryKey: ['llm-choices'],
    queryFn: async () => {
      const r = await apiFetch('/api/llm-choices')
      if (!r.ok) throw new Error('LLM 목록을 불러오지 못했습니다')
      return (await r.json()) as {
        choices?: Array<{ id: string; name: string; model?: string; local?: boolean }>
      }
    },
    staleTime: 60_000,
  })
  const choices = q.data?.choices ?? []
  if (choices.length < 2) return null

  return (
    <select className="tc-llm" value={value} title={title} onChange={(e) => onChange(e.target.value)}>
      <option value="">자동</option>
      {choices.map((c) => (
        <option key={c.id} value={c.id}>
          {c.local ? '🏠 ' : '☁ '}
          {c.name}
        </option>
      ))}
    </select>
  )
}

/** 고른 것을 자리마다 기억한다 — 키는 `utop.llm.<자리>` */
export function useLlmPick(slot: string): [string, (v: string) => void] {
  const key = `utop.llm.${slot}`
  const [val, setVal] = useState(() => prefGet(key) || '')
  return [
    val,
    (v: string) => {
      setVal(v)
      prefSet(key, v)
    },
  ]
}
