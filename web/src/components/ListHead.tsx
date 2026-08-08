import { useEffect, useRef, useState, type ReactNode } from 'react'
import { IconSearch } from './icons'
import './ListHead.css'

interface Props {
  /** 이 칸이 무엇인가 — 「요구사항」 「시험항목」 「사이클」 */
  name: string
  count?: number
  /** 여러 개 골랐을 때 나오는 것 (삭제 같은 것) */
  picked?: ReactNode
  /** 찾는 칸 — 이름 오른쪽에 붙인다 */
  search?: { value: string; placeholder: string; onChange: (v: string) => void }
  /** 늘 쓰는 것 하나. 「+ 만들기」 */
  add?: { title: string; onClick: () => void }
  /** ⋯ 안에 들어갈 것들 */
  menu?: ReactNode
}

/**
 * 목록 칸의 머리줄.
 *
 * 세 화면이 저마다 다르게 만들어져 있었다 — 요구사항은 「요구사항 29건」
 * 에 단추 넷, TC 와 사이클은 「TC 89건」 에 `+` 하나. 같은 자리에 같은
 * 모양이 있어야 화면을 옮겨도 손이 같은 데로 간다.
 *
 *     이름 N건        [고른 것에 대한 단추]   [+]  [⋯]
 *
 * 늘 쓰는 것 하나만 밖에 두고 나머지는 ⋯ 안에 넣는다. 단추가 넷이면 줄
 * 하나를 다 먹는데 그중 셋은 어쩌다 한 번 쓴다.
 */
export default function ListHead({ name, count, picked, search, add, menu }: Props) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  /**
   * 찾는 칸을 펼쳤는가.
   *
   * 늘 펼쳐 두면 이름과 단추 사이를 그만큼 먹는다. 찾는 일은 가끔이라
   * 평소에는 돋보기 하나로 두고, 누르면 **왼쪽으로 자라** 자리를 만든다 —
   * 오른쪽으로 자라면 `+` 와 `⋯` 를 밀어내서 손이 가던 자리가 움직인다.
   */
  const [qOpen, setQOpen] = useState(false)
  const qRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const t = setTimeout(() => window.addEventListener('mousedown', away), 0)
    window.addEventListener('keydown', esc)
    return () => {
      clearTimeout(t)
      window.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <div className="lh">
      <span className="lh-name">
        {name}
        {count !== undefined && <b>{count}</b>}
      </span>
      {picked}
      <span className="sp" />
      {search && (
        <span className={`lh-find${qOpen || search.value ? ' on' : ''}`}>
          <input
            ref={qRef}
            className="lh-q"
            value={search.value}
            placeholder={search.placeholder}
            onChange={(e) => search.onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                search.onChange('')
                setQOpen(false)
                e.currentTarget.blur()
              }
            }}
            // 비어 있을 때만 접는다. 글자가 남아 있는데 접으면 왜 목록이
            // 걸러져 있는지 알 수 없다.
            onBlur={() => !search.value && setQOpen(false)}
          />
          <button
            type="button"
            className="lh-findbtn"
            title="찾기"
            aria-label="찾기"
            onClick={() => {
              setQOpen(true)
              // 펼쳐진 다음에 focus 해야 한다
              setTimeout(() => qRef.current?.focus(), 0)
            }}
          >
            <IconSearch />
          </button>
        </span>
      )}
      {add && (
        <button className="btn small primary" type="button" title={add.title} onClick={add.onClick}>
          +
        </button>
      )}
      {menu && (
        <div className="lh-more" ref={boxRef}>
          <button
            className="btn small"
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            title="더 보기"
            onClick={() => setOpen((v) => !v)}
          >
            ⋯
          </button>
          {open && (
            // 누르면 닫힌다. 메뉴를 고르고도 열려 있으면 뒤에 가린 것을
            // 보려고 한 번 더 눌러야 한다.
            <div className="lh-menu" role="menu" onClick={() => setOpen(false)}>
              {menu}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
