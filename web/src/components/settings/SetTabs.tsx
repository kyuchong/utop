/**
 * SETUP 안 **한 페이지의 갈래** — 한 벌짜리 탭 줄.
 *
 * 같은 SETUP 안에서 갈래를 나누는 방식이 둘이었다: 용도별 프롬프트는
 * 밑줄 탭, Jira 는 알약(seg). 나란히 놓으면 다른 종류의 물건처럼 보이는데
 * 실제로는 같은 일이다 — 「이 페이지 안에서 무엇을 고칠까」(지적).
 *
 * 밑줄 쪽으로 모은다. 알약은 **두어 개짜리 모드 토글**의 모양이고(장비
 * 화면이 그렇게 쓴다), 여기 갈래는 이름이 길고 서넛을 넘는다.
 *
 * 고른 갈래는 기억한다(`remember` 를 주면). 저장하고 새로고침했더니 첫
 * 갈래로 돌아가 있으면, 고치던 자리를 매번 다시 찾아야 한다.
 */
import { useEffect, useState } from 'react'

export default function SetTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<{ k: T; label: string; hint?: string }>
  value: T
  onChange: (k: T) => void
}) {
  return (
    <div className="ps-tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.k}
          type="button"
          role="tab"
          aria-selected={value === t.k}
          title={t.hint}
          className={`ps-tab${value === t.k ? ' on' : ''}`}
          onClick={() => onChange(t.k)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

/** 고른 갈래를 기억한다 — 키는 `utop.tab.<자리>` */
export function useSetTab<T extends string>(slot: string, first: T): [T, (v: T) => void] {
  const key = `utop.tab.${slot}`
  const [v, setV] = useState<T>(() => (localStorage.getItem(key) as T) || first)
  useEffect(() => {
    localStorage.setItem(key, v)
  }, [key, v])
  return [v, setV]
}
