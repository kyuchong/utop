import { useEffect, useRef, useState } from 'react'
import type { FolderSortMode } from '@/types'
import { IconSort } from './icons'

const OPTS: ReadonlyArray<readonly [FolderSortMode, string]> = [
  ['num', '숫자'],
  ['abc', '알파벳'],
  ['kor', '한글'],
  ['manual', '끌기 순'],
]

/**
 * 폴더 정렬 아이콘 버튼 — 트리 머리줄용.
 *
 * 셀렉트로 두었더니 「정렬: 숫자」 글자가 머리줄 폭을 먹었다(피드백).
 * 찾기·전역 파라미터와 같은 아이콘 단추로 두고, 누르면 네 가지에서
 * 고른다. 요구사항·Coverage 두 화면이 같이 쓴다.
 */
export default function FolderSortBtn({
  value,
  onChange,
}: {
  value: FolderSortMode
  onChange: (v: FolderSortMode) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <span className="fsort" ref={ref}>
      <button
        type="button"
        className={`lh-findbtn${open ? ' on' : ''}`}
        title={`폴더 정렬 — 지금: ${OPTS.find((o) => o[0] === value)?.[1] ?? ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <IconSort />
      </button>
      {open && (
        <div className="fsort-pop" role="menu">
          {OPTS.map(([v, label]) => (
            <button
              key={v}
              type="button"
              className={value === v ? 'on' : ''}
              onClick={() => {
                onChange(v)
                setOpen(false)
              }}
            >
              {value === v ? '✓ ' : ''}
              {label}
            </button>
          ))}
        </div>
      )}
    </span>
  )
}
