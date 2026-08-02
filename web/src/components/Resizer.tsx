import { useCallback, useEffect, useRef, useState } from 'react'
import './Resizer.css'

/**
 * 패널 폭을 기억하는 훅. 값은 왼쪽 패널의 px 폭이고,
 * 오른쪽 패널이 남는 공간을 가져간다.
 *
 * 폭은 localStorage 에 남긴다 — 매번 다시 맞추게 하면 안 쓰게 된다.
 *
 * 주의: 처음 열 때 곧바로 저장되므로, 나중에 initial 만 바꾸면 이미 저장된
 * 옛 기본값이 이겨서 아무도 변화를 못 본다. 기본값을 바꿀 때는 key 도 함께
 * 올릴 것 (catW → catW2).
 */
export function useResizableWidth(key: string, initial: number, min = 140, max = 900) {
  const [width, setWidth] = useState<number>(() => {
    const saved = Number(localStorage.getItem(key))
    return Number.isFinite(saved) && saved >= min && saved <= max ? saved : initial
  })

  useEffect(() => {
    localStorage.setItem(key, String(Math.round(width)))
  }, [key, width])

  const clamp = useCallback((v: number) => Math.min(max, Math.max(min, v)), [min, max])
  return [width, useCallback((v: number) => setWidth(clamp(v)), [clamp])] as const
}

interface Props {
  /** 드래그할 때마다 새 폭(px)을 받는다 */
  onResize: (width: number) => void
  /** 왼쪽 패널의 왼쪽 끝 x 좌표를 구하는 함수 (폭 = 마우스 x - 이 값) */
  getOrigin: () => number
  label: string
}

export default function Resizer({ onResize, getOrigin, label }: Props) {
  const [dragging, setDragging] = useState(false)
  const originRef = useRef(0)

  useEffect(() => {
    if (!dragging) return
    const move = (e: MouseEvent) => onResize(e.clientX - originRef.current)
    const up = () => setDragging(false)
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    // 드래그 중에는 글자가 선택되지 않게 (선택되면 파랗게 번져 지저분하다)
    const prev = document.body.style.userSelect
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      document.body.style.userSelect = prev
      document.body.style.cursor = ''
    }
  }, [dragging, onResize])

  return (
    <div
      className={`resizer${dragging ? ' on' : ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      title="드래그해서 폭 조절"
      onMouseDown={(e) => {
        originRef.current = getOrigin()
        setDragging(true)
        e.preventDefault()
      }}
    >
      <span className="resizer-grip" />
    </div>
  )
}
