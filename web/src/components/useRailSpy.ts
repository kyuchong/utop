import { useEffect, useRef, type RefObject } from 'react'

/**
 * 세로 레일 ↔ 한 줄기 스크롤 문서를 묶는다(지시).
 *
 *  · 레일을 누르면 그 칸으로 **간다**
 *  · 손으로 위아래로 굴리면 지금 보고 있는 칸으로 **레일 색이 옮겨진다**
 *
 * 칸은 `data-sec="<키>"` 를 단 요소면 무엇이든 된다. 두 방향이 서로를
 * 다시 부르지 않도록, 스크롤이 바꾼 것인지(fromSpy) 를 기억한다 —
 * 이게 없으면 굴릴 때마다 화면이 제자리로 튕겨 돌아온다.
 */
export function useRailSpy(
  boxRef: RefObject<HTMLDivElement | null>,
  active: string,
  setActive: (k: string) => void,
  enabled: boolean,
) {
  const fromSpy = useRef(false)
  const activeRef = useRef(active)
  activeRef.current = active
  const setRef = useRef(setActive)
  setRef.current = setActive

  /* 스크롤 → 레일 */
  useEffect(() => {
    const box = boxRef.current
    if (!box || !enabled) return
    let raf = 0
    const scan = () => {
      raf = 0
      const secs = Array.from(box.querySelectorAll<HTMLElement>('[data-sec]'))
      const head = secs[0]
      const tail = secs[secs.length - 1]
      if (!head || !tail) return
      /* 「지금 읽는 줄」 은 칸 맨 위가 아니라 위에서 조금 내려온 자리로 잡는다.
         맨 위로 잡으면 칸 경계에서 레일이 두 칸 사이를 떨었다. */
      const line = box.scrollTop + 90
      let cur: HTMLElement = head
      for (const s of secs) if (s.offsetTop <= line) cur = s
      /* 바닥에 닿으면 마지막 칸. 짧은 칸은 위 규칙만으로는 영영 안 켜진다. */
      if (box.scrollTop + box.clientHeight >= box.scrollHeight - 4) cur = tail
      const k = cur.dataset.sec
      if (k && k !== activeRef.current) {
        fromSpy.current = true
        setRef.current(k)
      }
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(scan)
    }
    box.addEventListener('scroll', onScroll, { passive: true })
    /* 처음에는 훑지 않는다 — 열자마자 훑으면 기억해 둔 칸을 첫 칸이 덮는다. */
    return () => {
      box.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [boxRef, enabled])

  /* 레일(또는 다른 코드) → 스크롤 */
  useEffect(() => {
    if (fromSpy.current) {
      fromSpy.current = false
      return
    }
    if (!enabled) return
    const box = boxRef.current
    if (!box) return
    const el = box.querySelector<HTMLElement>(`[data-sec="${active}"]`)
    if (!el) return
    box.scrollTo({ top: Math.max(0, el.offsetTop - 4), behavior: 'smooth' })
  }, [boxRef, active, enabled])
}

export default useRailSpy
