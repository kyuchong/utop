import { useCallback, useRef, useState } from 'react'

/**
 * 목록에서 여러 개 고르기 — Ctrl · Shift.
 *
 * 줄마다 네모를 두었더니 목록이 그만큼 좁아지고, 무엇보다 **다른 도구와
 * 다르게** 동작했다. 파일 탐색기도 iTest 도 Ctrl·Shift 로 고른다. 손이
 * 이미 아는 방식을 두고 새 규칙을 배우게 할 이유가 없다.
 *
 *   그냥 누르면   — 그것 하나만 (그리고 연다)
 *   Ctrl+누르면   — 하나씩 더하고 뺀다
 *   Shift+누르면  — 마지막에 누른 것부터 여기까지
 *
 * 요구사항·시험·플랜이 같은 규칙을 쓰도록 여기 한 곳에 둔다.
 */
export function useMultiSelect<T extends string | number>() {
  const [picked, setPicked] = useState<Set<T>>(new Set())
  /** Shift 범위의 기준 — 마지막에 「그냥」 누른 자리 */
  const anchor = useRef<T | null>(null)

  /**
   * 줄을 눌렀을 때.
   *
   * `order` 는 지금 화면에 보이는 차례다. 접힌 가지를 건너뛰고 눈에 보이는
   * 것만 골라야 Shift 범위가 사람이 본 그대로 잡힌다.
   */
  const onClick = useCallback(
    (id: T, e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }, order: T[]) => {
      // 브라우저가 이미 잡아 둔 글자 선택을 턴다. `user-select: none` 이
      // 새로 잡히는 것은 막지만, 그 전에 잡힌 것은 남아 있다.
      if (e.shiftKey) window.getSelection?.()?.removeAllRanges()
      const multi = e.ctrlKey || e.metaKey
      if (e.shiftKey && anchor.current !== null) {
        const a = order.indexOf(anchor.current)
        const b = order.indexOf(id)
        if (a >= 0 && b >= 0) {
          const [s, t] = a < b ? [a, b] : [b, a]
          const range = order.slice(s, t + 1)
          setPicked((cur) => {
            // Shift 만이면 범위로 갈아 끼우고, Ctrl 을 같이 누르면 더한다
            const next = multi ? new Set(cur) : new Set<T>()
            for (const x of range) next.add(x)
            return next
          })
          return
        }
      }
      if (multi) {
        setPicked((cur) => {
          const next = new Set(cur)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        })
        anchor.current = id
        return
      }
      /*
       * 그냥 누름 — **그것 하나만** 고른 것이 된다.
       *
       * 전에는 비웠다. 그랬더니 「열려 있는 줄」 과 「고른 줄」 이 따로
       * 놀아서, 한 줄을 눌러 놓고도 「0건 선택됨」 이었다. 화면에 칠해진
       * 것과 세는 것이 다르면 안 된다.
       */
      setPicked(new Set([id]))
      anchor.current = id
    },
    [],
  )

  const clear = useCallback(() => {
    setPicked(new Set())
    anchor.current = null
  }, [])

  /** 화면이 직접 넣고 뺄 때 (전체 고르기 같은 것) */
  const set = useCallback((ids: T[]) => {
    setPicked(new Set(ids))
    anchor.current = ids[ids.length - 1] ?? null
  }, [])

  return { picked, onClick, clear, set }
}
