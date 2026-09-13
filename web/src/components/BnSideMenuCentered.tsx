/**
 * 블록 손잡이(＋ ⠿)를 **그 줄의 세로 정중앙**에 세운다(지적: 제목 1~6마다
 * 위치가 다 다르다).
 *
 * BlockNote 는 손잡이 세로 보정을 상수로 박아 뒀다(h1=39px·h2=27·
 * h3=18.5·나머지 0). 기본 글자 16px 기준이라, 우리처럼 13px 로 줄이면
 * 레벨마다 제각각 어긋난다(실측 h1 +14px ↓ … h6 −3px ↑).
 *
 * 손잡이가 붙는 블록은 **마우스가 올라간 블록**을 직접 찾는다 —
 * BlockNote 가 주는 기준 사각형은 블록 위치가 아니었다(실측: 블록보다
 * 52px 위). 첫 줄의 중앙을 절대 좌표로 계산해 그 자리에 맞춘다.
 */
import { offset } from '@floating-ui/react'
import { SideMenuController } from '@blocknote/react'

/* 마지막 마우스 위치 — 손잡이는 늘 마우스가 있는 블록에 붙는다 */
let lastY = -1
if (typeof window !== 'undefined')
  window.addEventListener('mousemove', (e) => { lastY = e.clientY }, {
    passive: true,
    capture: true,
  })

/** 마우스 y 를 품은 블록의 content — 중첩이면 가장 안쪽(마지막 매칭) */
function contentUnderMouse(): HTMLElement | null {
  let hit: HTMLElement | null = null
  for (const ed of document.querySelectorAll<HTMLElement>('.bn-editor')) {
    if (!ed.offsetParent) continue
    for (const b of ed.querySelectorAll<HTMLElement>('.bn-block-outer')) {
      const r = b.getBoundingClientRect()
      if (lastY >= r.top && lastY <= r.bottom)
        hit = b.querySelector<HTMLElement>('.bn-block-content') ?? b
    }
  }
  return hit
}

const OPTS = {
  useFloatingOptions: {
    /* BlockNote 의 상수 crossAxis 를 **통째로 대체**한다 — 여기 준
       middleware 가 기본 것 뒤에 펼쳐져 이긴다(placement 등은 유지) */
    middleware: [
      offset((a: { rects: { reference: { y: number }; floating: { height: number } } }) => {
        try {
          const c = contentUnderMouse()
          if (!c) return 0
          const cr = c.getBoundingClientRect()
          /* 첫 줄 = 안쪽 첫 요소(h1‥h6·p)의 line-height */
          const inner = (c.firstElementChild as HTMLElement | null) ?? c
          const lh = parseFloat(getComputedStyle(inner).lineHeight) || 24
          const pt = parseFloat(getComputedStyle(c).paddingTop) || 0
          const menuH = a.rects.floating.height || 30
          /* 목표: 손잡이 top = 첫 줄 중앙 − 손잡이 절반. 기준 y 가 무엇을
             가리키든 절대 좌표로 맞추면 흔들리지 않는다 */
          const targetTop = cr.top + pt + lh / 2 - menuH / 2
          return { crossAxis: targetTop - a.rects.reference.y }
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
