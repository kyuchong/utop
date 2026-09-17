/**
 * 표 **셀 배경색** 단추 — 툴바의 배경색 옆에 선다.
 *
 * 툴바에 이미 있는 배경색은 **글자 배경**이라, 셀을 드래그해 칠해도 글자에만
 * 칠해진다(지적: 표 열이 배경이 안 되고 텍스트 부분만 칠해졌다). 셀에는 제
 * 배경색이 따로 있고 BlockNote 가 그리기도 하는데, 그것을 바꿀 길만 없었다.
 *
 * 셀을 골랐을 때만 보인다 — 글만 고른 자리에서는 누를 일이 없다.
 */
import { useEffect, useRef, useState } from 'react'
import { useBlockNoteEditor } from '@blocknote/react'
import { CELL_BG, hasCellSelection, setCellBackground } from './cellBg'
import './CellBgButton.css'

export default function CellBgButton() {
  const editor = useBlockNoteEditor()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLSpanElement>(null)

  /* 바깥을 누르면 닫는다 — 열어 둔 채 딴 데를 누르면 떠 있는 채로 남는다 */
  useEffect(() => {
    if (!open) return
    const off = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', off)
    return () => document.removeEventListener('mousedown', off)
  }, [open])

  if (!hasCellSelection(editor)) return null

  return (
    <span className="bn-cellbg" ref={box}>
      <button
        type="button"
        className="bn-cellbg-b"
        aria-expanded={open}
        title="고른 칸의 배경색 — 글자가 아니라 칸을 칠합니다"
        onMouseDown={(e) => e.preventDefault() /* 셀 선택을 잃지 않는다 */}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="bn-cellbg-ico" aria-hidden="true">▦</span>
        칸 배경
      </button>
      {open && (
        <span className="bn-cellbg-pop" role="menu">
          {CELL_BG.map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="menuitem"
              className={`bn-cellbg-i${k === 'default' ? ' none' : ''}`}
              data-background-color={k}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setCellBackground(editor, k)
                setOpen(false)
              }}
            >
              <i aria-hidden="true" data-background-color={k} />
              {label}
            </button>
          ))}
        </span>
      )}
    </span>
  )
}
