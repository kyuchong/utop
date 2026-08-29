import { useEffect, useRef, useState } from 'react'
import { IconSort } from './icons'

/** 2열 목록 정렬 — 세 화면이 같은 세 가지를 쓴다 */
export type ListSortMode = 'tree' | 'name' | 'recent'

/* 곁말은 짧게 — 길면 팝업이 옆으로 새어 글이 잘린다(지적) */
const OPTS: ReadonlyArray<readonly [ListSortMode, string]> = [
  ['tree', '트리 순서'],
  ['name', '이름'],
  ['recent', '최근'],
]

/** 1열 폴더 정렬 — 목록 정렬과 **같은 꼴**을 쓴다(지시) */
export type FolderSortMode = 'name' | 'req' | 'recent'

const FOPTS: ReadonlyArray<readonly [FolderSortMode, string]> = [
  ['name', '이름'],
  ['req', '요구사항 많은 순'],
  ['recent', '최근'],
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
          {OPTS.map(([v, label]) => (
            <button
              key={v}
              type="button"
              className={value === v ? 'on' : undefined}
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

/**
 * 1열 폴더 정렬 — 목록 정렬(ListSortBtn)과 **같은 아이콘·같은 팝업**이다.
 *
 * 여태 이 자리는 눌러서 두 값을 오가는 토글이었다. 그래서 지금 무엇으로
 * 서 있는지 눌러 보기 전에는 알 수 없었고, 오른쪽 목록 정렬과 생김새는
 * 같은데 동작이 달랐다(지적: 오른쪽 것과 똑같이 해 달라). 두 자리가 같은
 * 문법을 쓰면 한 번 배운 것이 양쪽에서 통한다.
 */
export function FolderSortBtn({
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
        title={`폴더 정렬 — 지금: ${FOPTS.find((o) => o[0] === value)?.[1] ?? ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <IconSort />
      </button>
      {open && (
        <div className="fsort-pop" role="menu">
          {FOPTS.map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={value === k ? 'on' : ''}
              onClick={() => {
                onChange(k)
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
