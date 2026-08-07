import { useEffect, useRef, useState, type ReactNode } from 'react'
import './ListHead.css'

interface Props {
  /** 이 칸이 무엇인가 — 「요구사항」 「시험항목」 「사이클」 */
  name: string
  count?: number
  /** 여러 개 골랐을 때 나오는 것 (삭제 같은 것) */
  picked?: ReactNode
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
export default function ListHead({ name, count, picked, add, menu }: Props) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

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
