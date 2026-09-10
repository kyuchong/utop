/**
 * 오른쪽 서랍을 **어느 쪽에 붙일지** — 한 열쇠로 온 화면이 함께 움직인다.
 *
 * 서랍은 늘 화면의 한쪽을 가린다. 가린 쪽을 보려면 서랍이 비켜 줘야 하는데,
 * 창마다 따로 기억하면 「이 창은 왼쪽, 저 창은 오른쪽」 이 되어 자리를 매번
 * 다시 찾게 된다. RunManual 의 서랍 주석에 이미 적혀 있던 말이다 —
 * *화면마다 여는 쪽이 다르면 사람이 자리를 매번 다시 찾는다.*
 *
 * 값은 **계정을 따라다닌다**(prefs SYNC). PC 에 적으면 자리를 옮겼을 때
 * 서랍이 제자리로 돌아가 버린다.
 */
import { useEffect, useState } from 'react'
import { prefGet, prefSet } from '@/lib/prefs'

export const DRAWER_SIDE_KEY = 'utop.drawer.side'
export type DrawerSide = 'left' | 'right'

export function useDrawerSide(): [DrawerSide, (s: DrawerSide) => void] {
  const [side, setSide] = useState<DrawerSide>(() =>
    prefGet(DRAWER_SIDE_KEY) === 'left' ? 'left' : 'right',
  )
  useEffect(() => {
    prefSet(DRAWER_SIDE_KEY, side)
  }, [side])
  return [side, setSide]
}

/**
 * 좌·우 이동 단추 한 쌍. 서랍 머리의 ✕ 왼쪽에 놓는다.
 *
 * 지금 붙은 쪽 단추는 잠근다 — 눌러도 아무 일이 없으면 고장으로 읽힌다.
 * `cls` 는 그 화면의 머리 단추 클래스다(서랍마다 머리 꼴이 다르다).
 */
export function DrawerSideBtns({
  side,
  onSide,
  cls,
  disabled,
}: {
  side: DrawerSide
  onSide: (s: DrawerSide) => void
  cls: string
  /** 옮길 자리가 없을 때(넓게 보기 같은) 둘 다 잠근다 */
  disabled?: boolean
}) {
  return (
    <>
      <button
        type="button"
        className={cls}
        title="왼쪽에 붙이기"
        aria-label="왼쪽에 붙이기"
        onClick={() => onSide('left')}
        disabled={!!disabled || side === 'left'}
      >
        ◀
      </button>
      <button
        type="button"
        className={cls}
        title="오른쪽에 붙이기"
        aria-label="오른쪽에 붙이기"
        onClick={() => onSide('right')}
        disabled={!!disabled || side === 'right'}
      >
        ▶
      </button>
    </>
  )
}
