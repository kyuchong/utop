/**
 * 좌측 메뉴용 아이콘. 외부 아이콘 라이브러리를 쓰지 않는다 —
 * 기존 앱이 CDN 16개에 묶여 사내망에서 취약했던 문제를 되풀이하지 않기 위해서다.
 *
 * 규격: 20x20, stroke 기반, currentColor. 메뉴 글자색을 그대로 따라간다.
 */
import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>

function Svg({ children, ...p }: P) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...p}
    >
      {children}
    </svg>
  )
}

export const IconDashboard = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="3" width="7" height="9" rx="1" />
    <rect x="14" y="3" width="7" height="5" rx="1" />
    <rect x="14" y="12" width="7" height="9" rx="1" />
    <rect x="3" y="16" width="7" height="5" rx="1" />
  </Svg>
)

export const IconRequirements = (p: P) => (
  <Svg {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
    <path d="M9 13h6M9 17h4" />
  </Svg>
)

export const IconTestCase = (p: P) => (
  <Svg {...p}>
    <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
    <rect x="9" y="3" width="6" height="4" rx="1" />
    <path d="m9 13 2 2 4-4" />
  </Svg>
)

export const IconCycle = (p: P) => (
  <Svg {...p}>
    <path d="M21 12a9 9 0 1 1-3.4-7" />
    <path d="M21 3v6h-6" />
  </Svg>
)

export const IconExecution = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m10 8 6 4-6 4z" />
  </Svg>
)

export const IconDefect = (p: P) => (
  <Svg {...p}>
    <path d="M12 3v2M5 7l1.5 1.5M19 7l-1.5 1.5" />
    <rect x="7" y="8" width="10" height="12" rx="5" />
    <path d="M3 13h4M17 13h4M4 18h3M17 18h3" />
  </Svg>
)

export const IconRelease = (p: P) => (
  <Svg {...p}>
    <path d="M12 3 3 8v8l9 5 9-5V8z" />
    <path d="M3 8l9 5 9-5M12 13v8" />
  </Svg>
)

export const IconAi = (p: P) => (
  <Svg {...p}>
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
    <rect x="7" y="7" width="10" height="10" rx="2" />
    <path d="M11 11h2v2h-2z" />
  </Svg>
)

export const IconKnowledge = (p: P) => (
  <Svg {...p}>
    <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
    <path d="M9 7h6M9 11h4" />
  </Svg>
)

/** 좌측 메뉴 접기/펴기 토글 (Docker Desktop 과 같은 패널 아이콘) */
export const IconPanelToggle = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
  </Svg>
)

/**
 * 트리 펼침/접기 캐럿.
 * ▸ ▾ 같은 문자 기호는 글꼴마다 크기·굵기가 제각각이라 어떤 환경에서는
 * 거의 안 보인다. 그래서 도형으로 그린다.
 */
export const IconChevron = (p: P) => (
  <Svg width="16" height="16" strokeWidth="2.4" {...p}>
    <path d="m9 6 6 6-6 6" />
  </Svg>
)
