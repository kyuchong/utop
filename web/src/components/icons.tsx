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

/**
 * 폴더 — iTest(Eclipse) 처럼 **속이 채워진** 노란 폴더.
 *
 * 처음엔 선만 그렸더니 옆의 글자와 굵기가 비슷해 눈에 안 띄었다. 폴더가
 * 폴더로 보이려면 바탕이 칠해져 있어야 한다. 펼친 것은 앞장이 열려
 * 비스듬한 모양이라, 아이콘만 보고도 접혔는지 펼쳤는지 안다.
 *
 * 색은 테마를 안 탄다. 폴더는 어느 화면에서나 폴더고, 밝은 화면에서나
 * 어두운 화면에서나 같은 노랑이라야 눈이 바로 찾는다.
 */
export const IconFolder = ({ open, ...rest }: P & { open?: boolean }) => (
  <svg
    width="17"
    height="17"
    viewBox="0 0 16 16"
    aria-hidden="true"
    focusable="false"
    {...rest}
  >
    {open ? (
      <>
        <path
          d="M1.5 4.2a.7.7 0 0 1 .7-.7h3.4l1.2 1.4h5.5a.7.7 0 0 1 .7.7v1.6H1.5V4.2Z"
          fill="#e8b53d"
          stroke="#b8860b"
          strokeWidth="0.7"
          strokeLinejoin="round"
        />
        <path
          d="M1.5 12.5 3.3 7.2a.7.7 0 0 1 .66-.48h10.1a.5.5 0 0 1 .47.66l-1.63 4.8a.7.7 0 0 1-.66.48H1.5Z"
          fill="#f5cd63"
          stroke="#b8860b"
          strokeWidth="0.7"
          strokeLinejoin="round"
        />
      </>
    ) : (
      <>
        <path
          d="M1.5 4.2a.7.7 0 0 1 .7-.7h3.4l1.2 1.4h6.5a.7.7 0 0 1 .7.7v6.7a.7.7 0 0 1-.7.7H2.2a.7.7 0 0 1-.7-.7V4.2Z"
          fill="#f0c14b"
          stroke="#b8860b"
          strokeWidth="0.7"
          strokeLinejoin="round"
        />
        {/* 앞장 — 위쪽 띠와 갈라 놓아야 폴더처럼 보인다 */}
        <path
          d="M1.5 6.4h13v5.9a.7.7 0 0 1-.7.7H2.2a.7.7 0 0 1-.7-.7V6.4Z"
          fill="#f7d573"
          stroke="#b8860b"
          strokeWidth="0.7"
          strokeLinejoin="round"
        />
      </>
    )}
  </svg>
)

/**
 * 요구사항 한 건 — 글이 적힌 종이.
 *
 * 트리에서 폴더는 노란 폴더로 갈리는데, **요구사항 줄과 시험 줄은 서로
 * 안 갈렸다.** 둘 다 그냥 글자였다. ID 앞에 작은 표를 둔다.
 */
export const IconReqDoc = (p: P) => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false" {...p}>
    {/* 세로로 길쭉하면 옆 글자와 안 맞는다. 폭을 넓혀 정사각에 가깝게 */}
    <path
      d="M2.6 2.6h6.2l3.6 3.4v7.4a.6.6 0 0 1-.6.6H2.6a.6.6 0 0 1-.6-.6V3.2a.6.6 0 0 1 .6-.6Z"
      fill="#dbeafe"
      stroke="#2563eb"
      strokeWidth="1"
      strokeLinejoin="round"
    />
    <path d="M8.8 2.6v3.4h3.6" fill="none" stroke="#2563eb" strokeWidth="1" strokeLinejoin="round" />
    <path
      d="M4.4 8.6h6M4.4 10.8h6M4.4 13h3.6"
      stroke="#2563eb"
      strokeWidth="1"
      strokeLinecap="round"
    />
  </svg>
)

/** 시험 한 건 — 확인 표가 붙은 종이 */
export const IconTcDoc = (p: P) => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false" {...p}>
    <path
      d="M2.6 2.6h6.2l3.6 3.4v7.4a.6.6 0 0 1-.6.6H2.6a.6.6 0 0 1-.6-.6V3.2a.6.6 0 0 1 .6-.6Z"
      fill="#dcfce7"
      stroke="#15803d"
      strokeWidth="1"
      strokeLinejoin="round"
    />
    <path d="M8.8 2.6v3.4h3.6" fill="none" stroke="#15803d" strokeWidth="1" strokeLinejoin="round" />
    <path
      d="m4.4 10.4 2 2 3.6-4.4"
      fill="none"
      stroke="#15803d"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

/** 돋보기 */
export const IconSearch = (p: P) => (
  <Svg width="15" height="15" strokeWidth="2" {...p}>
    <circle cx="11" cy="11" r="6" />
    <path d="m20 20-4.4-4.4" />
  </Svg>
)

/** 드래그 손잡이 (점 6개) */
export const IconGrip = (p: P) => (
  <Svg width="12" height="14" strokeWidth="0" {...p}>
    <g fill="currentColor">
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </g>
  </Svg>
)

/** 설정 (톱니) */
export const IconSettings = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 8.9 19a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 5 8.9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Svg>
)

/** 장비 (스위치) */
export const IconDevice = (p: P) => (
  <Svg {...p}>
    <rect x="2" y="7" width="20" height="10" rx="2" />
    <path d="M6 12h.01M10 12h.01M14 12h.01M18 12h.01" />
  </Svg>
)

/** 계측기 (신호) */
export const IconInstrument = (p: P) => (
  <Svg {...p}>
    <path d="M3 12h3l3-7 4 14 3-7h5" />
  </Svg>
)

/* ── 스텝 종류 (Action) ────────────────────────────────────────
   14px 로 줄마다 들어간다. 색 네모만으로는 훑을 때 안 읽혀서,
   모양으로 구분되게 한다. 선 굵기는 메뉴 아이콘보다 살짝 얇다 —
   작은 크기에서 1.7 은 뭉개진다. */
function SmallSvg({ children, ...p }: P) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
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

/** CLI — 터미널 */
export const IconCli = (p: P) => (
  <SmallSvg {...p}>
    <path d="m4 7 4 4-4 4M11 15h9" />
  </SmallSvg>
)

/** 계측기 — 계기판 */
export const IconMeter = (p: P) => (
  <SmallSvg {...p}>
    <path d="M4 18a8 8 0 1 1 16 0" />
    <path d="m12 14 4-4" />
  </SmallSvg>
)

/** If — 갈라짐 */
export const IconBranch = (p: P) => (
  <SmallSvg {...p}>
    <path d="M6 4v6a4 4 0 0 0 4 4h8" />
    <path d="m15 11 3 3-3 3" />
    <path d="M6 14v6" />
  </SmallSvg>
)

/** Loop — 되돌아감 */
export const IconLoop = (p: P) => (
  <SmallSvg {...p}>
    <path d="M4 10a6 6 0 0 1 6-6h10" />
    <path d="m17 1 3 3-3 3" />
    <path d="M20 14a6 6 0 0 1-6 6H4" />
    <path d="m7 23-3-3 3-3" />
  </SmallSvg>
)

/** Switch — 여러 갈래 */
export const IconSwitch = (p: P) => (
  <SmallSvg {...p}>
    <path d="M4 12h5" />
    <path d="M9 12c4 0 4-7 8-7h3M9 12c4 0 4 7 8 7h3" />
    <path d="m18 2 2 3-2 3M18 16l2 3-2 3" />
  </SmallSvg>
)

/** Wait — 시계 */
export const IconClock = (p: P) => (
  <SmallSvg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </SmallSvg>
)

/** Connect — 이어짐 */
export const IconPlug = (p: P) => (
  <SmallSvg {...p}>
    <path d="M9 3v5M15 3v5" />
    <path d="M6 8h12v3a6 6 0 0 1-12 0z" />
    <path d="M12 17v4" />
  </SmallSvg>
)

/** Close — 끊김 */
export const IconUnplug = (p: P) => (
  <SmallSvg {...p}>
    <path d="M5 19 9 15" />
    <path d="M13 3 21 11" />
    <path d="m8.5 10.5 5 5" />
    <path d="M12 7 7 12a3.5 3.5 0 0 0 5 5l5-5" />
  </SmallSvg>
)

/** Model — 칩 */
export const IconChip = (p: P) => (
  <SmallSvg {...p}>
    <rect x="7" y="7" width="10" height="10" rx="1.5" />
    <path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4" />
  </SmallSvg>
)

/** Comment — 말풍선 */
export const IconNote = (p: P) => (
  <SmallSvg {...p}>
    <path d="M20 15a2 2 0 0 1-2 2H8l-4 3V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" />
  </SmallSvg>
)

/** Manual — 손 */
export const IconHand = (p: P) => (
  <SmallSvg {...p}>
    <path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11" />
    <path d="M12 11V4.5a1.5 1.5 0 0 1 3 0V11" />
    <path d="M15 11V6.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1a6 6 0 0 1-5.2-3l-2-3.4a1.5 1.5 0 0 1 2.5-1.6L9 15" />
  </SmallSvg>
)

/** 값 비교 — 두 값을 저울에 */
export const IconDiff = (p: P) => (
  <SmallSvg {...p}>
    <path d="M4 9h16M4 15h16" />
    <path d="M9 4 5 20M19 4l-4 16" />
  </SmallSvg>
)

/** Ping — 되돌아오는 신호 */
export const IconPing = (p: P) => (
  <SmallSvg {...p}>
    <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    <path d="M7.8 16.2a6 6 0 0 1 0-8.4" />
    <path d="M16.2 7.8a6 6 0 0 1 0 8.4" />
    <path d="M4.9 19.1a10 10 0 0 1 0-14.2" />
    <path d="M19.1 4.9a10 10 0 0 1 0 14.2" />
  </SmallSvg>
)

/** SNMP — 값을 물어 가져온다 (꼬리표) */
export const IconSnmp = (p: P) => (
  <SmallSvg {...p}>
    <path d="M12 3v7" />
    <path d="M8 6.5 12 3l4 3.5" />
    <rect x="3" y="12" width="18" height="8" rx="2" />
    <path d="M7 16h.01M11 16h.01M15 16h.01" />
  </SmallSvg>
)

/* 들여쓰기 — 블록 안으로 / 밖으로.
   ⇤ ⇥ 문자를 썼더니 글꼴에 따라 거의 안 보였다(IconChevron 과 같은 사정).
   편집기에서 쓰는 모양 그대로 — 줄 몇 개와 그 줄을 미는 화살표. */

/** 블록 안으로 (들여쓰기) */
export const IconIndent = (p: P) => (
  <SmallSvg {...p}>
    <path d="M11 6h10M11 12h10M11 18h10" />
    <path d="m3 8 3.5 4L3 16z" fill="currentColor" stroke="none" />
  </SmallSvg>
)

/** 블록 밖으로 (내어쓰기) */
export const IconOutdent = (p: P) => (
  <SmallSvg {...p}>
    <path d="M11 6h10M11 12h10M11 18h10" />
    <path d="m7 8-3.5 4L7 16z" fill="currentColor" stroke="none" />
  </SmallSvg>
)

/** 재생 — 이 스텝만 실행 */
export const IconPlay = (p: P) => (
  <SmallSvg {...p}>
    <path d="M7 4.5 19 12 7 19.5z" fill="currentColor" stroke="none" />
  </SmallSvg>
)

/* ── 설정 화면 항목 ────────────────────────────────────────────
   왼쪽 메뉴와 같은 규격(18px·stroke·currentColor)을 쓴다. 설정 안에서만
   다른 모양을 쓰면 같은 앱으로 안 보인다. */

/** LLM 설정 (신경망 — 노드가 이어진 모양) */
export const IconLlm = (p: P) => (
  <Svg {...p}>
    <circle cx="5" cy="6" r="2" />
    <circle cx="5" cy="18" r="2" />
    <circle cx="12" cy="12" r="2.2" />
    <circle cx="19" cy="8" r="2" />
    <circle cx="19" cy="17" r="2" />
    <path d="M7 6.9 10 11M7 17.1 10 13M14 11.2 17 8.7M14 12.9 17.2 16" />
  </Svg>
)

/** 장비 카탈로그 (목록이 붙은 상자) */
export const IconCatalog = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9h18M8 4v16M11.5 13h6M11.5 16h4" />
  </Svg>
)

/** TC INFO 필드 (고를 값 목록 — 체크가 붙은 항목) */
export const IconCodeList = (p: P) => (
  <Svg {...p}>
    <path d="M9 6h12M9 12h12M9 18h12" />
    <path d="m3 5.6 1.4 1.4L7 4.4" />
    <path d="m3 11.6 1.4 1.4L7 10.4" />
    <path d="m3 17.6 1.4 1.4L7 16.4" />
  </Svg>
)

/** 요구사항 INFO 필드 (문서에 붙은 고를 값 목록) */
export const IconReqCodeList = (p: P) => (
  <Svg {...p}>
    <path d="M5 3h9l5 5v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
    <path d="M14 3v5h5" />
    <path d="M11 13h5M11 17h3" />
    <path d="m7 12.6.9.9L10 11.6" />
    <path d="m7 16.6.9.9L10 15.6" />
  </Svg>
)

/** 커스텀 필드 (칸을 새로 더한다 — 입력칸 + 더하기) */
export const IconCustomField = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="5" width="12" height="5" rx="1.5" />
    <rect x="3" y="14" width="12" height="5" rx="1.5" />
    <path d="M19 6.5v6M22 9.5h-6" />
  </Svg>
)

/** 전역 파라미터 (이름표가 붙은 값들) */
export const IconGlobalParam = (p: P) => (
  <Svg {...p}>
    <path d="M4 7h7M4 12h5M4 17h7" />
    <path d="M14 7h6M12 12h8M14 17h6" />
    <circle cx="12.5" cy="7" r="1.3" />
    <circle cx="10.5" cy="12" r="1.3" />
    <circle cx="12.5" cy="17" r="1.3" />
  </Svg>
)

/** 계정 관리 (사람 여럿) */
export const IconAccounts = (p: P) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20c0-3.3 2.7-5.2 6-5.2s6 1.9 6 5.2" />
    <path d="M16.5 5.2a3.2 3.2 0 0 1 0 5.9M18 14.4c2 .6 3.5 2.2 3.5 4.6" />
  </Svg>
)

/** 페이지별 접근 권한 (잠금) */
export const IconPerms = (p: P) => (
  <Svg {...p}>
    <rect x="4" y="10" width="16" height="10" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    <path d="M12 14v2.5" />
  </Svg>
)
