/**
 * 블록 손잡이(＋ ⠿)를 **그 줄의 세로 정중앙**에 세운다(지적: 제목 1~6마다
 * 위치가 다 다르다).
 *
 * BlockNote 는 손잡이의 세로 보정을 상수로 박아 뒀다(h1=39px·h2=27·
 * h3=18.5·나머지 0 — SideMenuController 의 crossAxis). 그 상수는 기본
 * 글자 16px 기준이라, 우리처럼 편집기를 13px 로 줄이면 레벨마다 제각각
 * 어긋난다(실측 h1 +14px ↓ … h6 −3px ↑).
 *
 * 상수를 고치는 대신 **지금 화면의 첫 줄을 실측**한다 — 글자 크기를
 * 다시 바꿔도, 제목 단계가 늘어도 늘 중앙이다.
 */
import { useMemo, useRef } from 'react'
import { offset } from '@floating-ui/react'
import { SideMenuController, useExtensionState } from '@blocknote/react'
import { SideMenuExtension } from '@blocknote/core/extensions'

export default function BnSideMenuCentered() {
  /* 지금 손잡이가 붙은 블록 — BlockNote 의 사이드메뉴 상태에서 읽는다 */
  const st = useExtensionState(SideMenuExtension, {
    selector: (s?: { block?: { id?: string } }) => (s ? { id: s.block?.id } : undefined),
  }) as { id?: string } | undefined
  const idRef = useRef<string | undefined>(undefined)
  idRef.current = st?.id

  const opts = useMemo(
    () => ({
      useFloatingOptions: {
        /* BlockNote 의 상수 crossAxis 를 **통째로 대체**한다 — 여기 준
           middleware 가 기본 것 뒤에 펼쳐져 이긴다(placement 등은 유지) */
        middleware: [
          offset((a: {
            rects: { reference: { y: number }; floating: { height: number } }
          }) => {
            try {
              const id = idRef.current
              if (!id) return 0
              const c = document.querySelector(
                `[data-id="${CSS.escape(id)}"] .bn-block-content`,
              ) as HTMLElement | null
              if (!c) return 0
              const cr = c.getBoundingClientRect()
              /* 첫 줄 = 안쪽 첫 요소(h1‥h6·p)의 line-height */
              const inner = (c.firstElementChild as HTMLElement | null) ?? c
              const lh = parseFloat(getComputedStyle(inner).lineHeight) || 24
              const pt = parseFloat(getComputedStyle(c).paddingTop) || 0
              const menuH = a.rects.floating.height || 30
              /* 기준점(reference 위)에서 첫 줄 중앙까지 내려 손잡이를 맞춘다 */
              return { crossAxis: cr.top - a.rects.reference.y + pt + (lh - menuH) / 2 }
            } catch {
              return 0
            }
          }),
        ],
      },
    }),
    [],
  )

  return <SideMenuController floatingUIOptions={opts} />
}
