import { useEffect, useRef, useState } from 'react'
import { IconSort } from './icons'

/** 2열 목록 정렬 — 세 화면이 같은 세 가지를 쓴다 */
export type ListSortMode = 'tree' | 'name' | 'recent'

const OPTS: ReadonlyArray<readonly [ListSortMode, string, string]> = [
  ['tree', '트리 순서', '왼쪽 트리에 선 차례 그대로 — 어느 폴더 것인지 눈으로 따라간다'],
  ['name', '이름', '가나다·ABC 차례'],
  ['recent', '최근', '나중에 고친 것이 위로'],
]

/**
 * 목록 정렬 아이콘 — **⚙ 왼쪽**에 선다(지시).
 *
 * 기본은 「트리 순서」다. 이름순으로 세워 두면 같은 폴더 것이 목록 여기저기에
 * 흩어져, 왼쪽 트리에서 폴더를 짚어 놓고도 오른쪽에서 그걸 다시 찾아야 한다
 * (지적: 어떤 폴더·어떤 요구사항인지 찾아가기 애매하다).
 *
 * 폴더 정렬(FolderSortBtn)과 같은 아이콘·같은 팝업 꼴을 쓴다 — 하나는 트리,
 * 하나는 목록이라 자리로 갈린다.
 */
export default function ListSortBtn({
  value,
  onChange,
}: {
  value: ListSortMode
  onChange: (v: ListSortMode) => void
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
        title={`목록 정렬 — 지금: ${OPTS.find((o) => o[0] === value)?.[1] ?? ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <IconSort />
      </button>
      {open && (
        <div className="fsort-pop" role="menu">
          {OPTS.map(([v, label, hint]) => (
            <button
              key={v}
              type="button"
              className={value === v ? 'on' : undefined}
              title={hint}
              onClick={() => {
                onChange(v)
                setOpen(false)
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </span>
  )
}
