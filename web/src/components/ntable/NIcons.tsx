import type { ReactNode, SVGProps } from 'react'

/** 표에서 쓰는 그림들 — 바깥 의존 없이 인라인 SVG(노션과 같은 결) */
const S = (d: ReactNode) => {
  const C = (p: SVGProps<SVGSVGElement>) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="13"
      height="13"
      {...p}
    >
      {d}
    </svg>
  )
  return C
}

export const IcText = S(<><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="14" y2="12" /><line x1="4" y1="17" x2="18" y2="17" /></>)
export const IcSelect = S(<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /></>)
export const IcNumber = S(<><line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" /><line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" /></>)
export const IcDate = S(<><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>)
export const IcPerson = S(<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>)
export const IcSortAsc = S(<><path d="M11 5h10" /><path d="M11 9h7" /><path d="M11 13h4" /><path d="M3 17l3 3 3-3" /><path d="M6 4v16" /></>)
export const IcSortDesc = S(<><path d="M11 5h4" /><path d="M11 9h7" /><path d="M11 13h10" /><path d="M3 7l3-3 3 3" /><path d="M6 4v16" /></>)
export const IcFilter = S(<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />)
export const IcGroup = S(<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>)
export const IcLeft = S(<><path d="M14 4v16" /><path d="M8 12H2" /><path d="M5 9l-3 3 3 3" /></>)
export const IcRight = S(<><path d="M10 4v16" /><path d="M16 12h6" /><path d="M19 9l3 3-3 3" /></>)
export const IcCopy = S(<><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>)
export const IcHide = S(<><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><line x1="1" y1="1" x2="23" y2="23" /></>)
export const IcTrash = S(<><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></>)
export const IcSearch = S(<><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>)
export const IcDots = S(<><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></>)
export const IcCheck = S(<polyline points="20 6 9 17 4 12" />)
export const IcPlus = S(<><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>)
export const IcOpen = S(<><path d="M7 17L17 7" /><path d="M9 7h8v8" /></>)

export const IcMulti = S(<><circle cx="8" cy="8" r="5" /><circle cx="16" cy="16" r="5" /></>)

/** 자동 시험 — 톱니. 목업의 그림 그대로다(이모지는 글꼴 따라 모양이 갈린다) */
export const IcAuto = S(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 8.9 19a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 5 8.9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </>,
)

/** 수동 시험 — 손 */
export const IcManual = S(
  <>
    <path d="M18 11V6a1.5 1.5 0 0 0-3 0" />
    <path d="M15 10.5V4a1.5 1.5 0 0 0-3 0v6.5" />
    <path d="M12 10V5a1.5 1.5 0 0 0-3 0v8" />
    <path d="M9 12.5V9a1.5 1.5 0 0 0-3 0v6a7 7 0 0 0 7 7h1a6 6 0 0 0 6-6v-4a1.5 1.5 0 0 0-3 0" />
  </>,
)

export const TYPE_ICON = {
  text: IcText,
  select: IcSelect,
  multiselect: IcMulti,
  number: IcNumber,
  date: IcDate,
  person: IcPerson,
} as const
