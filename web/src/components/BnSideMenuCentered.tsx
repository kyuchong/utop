/**
 * 블록 손잡이(＋ ⠿)를 **그 줄의 세로 정중앙**에 세운다(지적: 제목 1~6마다
 * 위치가 다 다르다).
 *
 * BlockNote 는 손잡이의 세로 보정을 상수로 박아 뒀다(h1=39px·h2=27·
 * h3=18.5·나머지 0 — SideMenuController 의 crossAxis). 그 상수는 기본
 * 글자 16px 기준이라, 우리처럼 편집기를 13px 로 줄이면 레벨마다 제각각
 * 어긋난다(실측 h1 +14px ↓ … h6 −3px ↑).
 *
 * 상수 대신 **지금 화면의 첫 줄을 실측**한다 — 손잡이가 붙는 블록은
 * 기준 사각형(reference)과 같은 높이의 블록을 DOM 에서 찾는다. 훅 없이
 * 컨트롤러만 감싸므로 BlockNote 안쪽 상태에 기대지 않는다.
 */
import { offset } from '@floating-ui/react'
import { SideMenuController } from '@blocknote/react'

/** 기준 y 와 같은 높이에 선 블록의 content — 손잡이가 붙는 그 블록이다 */
function contentAt(y: number): HTMLElement | null {
  for (const ed of document.querySelectorAll<HTMLElement>('.bn-editor')) {
    if (!ed.offsetParent) continue
    for (const b of ed.querySelectorAll<HTMLElement>('.bn-block-outer, .bn-block')) {
      if (Math.abs(b.getBoundingClientRect().top - y) < 3)
        return (b.querySelector<HTMLElement>('.bn-block-content') ?? b)
    }
  }
  return null
}

const OPTS = {
  useFloatingOptions: {
    /* BlockNote 의 상수 crossAxis 를 **통째로 대체**한다 — 여기 준
       middleware 가 기본 것 뒤에 펼쳐져 이긴다(placement 등은 유지) */
    middleware: [
      offset((a: { rects: { reference: { y: number }; floating: { height: number } } }) => {
        try {
          const c = contentAt(a.rects.reference.y)
          if (!c) return 0
          const cr = c.getBoundingClientRect()
          /* 첫 줄 = 안쪽 첫 요소(h1‥h6·p)의 line-height */
          const inner = (c.firstElementChild as HTMLElement | null) ?? c
          const lh = parseFloat(getComputedStyle(inner).lineHeight) || 24
          const pt = parseFloat(getComputedStyle(c).paddingTop) || 0
          const menuH = a.rects.floating.height || 30
          return { crossAxis: cr.top - a.rects.reference.y + pt + (lh - menuH) / 2 }
        } catch {
          return 0
        }
      }),
    ],
  },
}

export default function BnSideMenuCentered() {
  return <SideMenuController floatingUIOptions={OPTS} />
}
