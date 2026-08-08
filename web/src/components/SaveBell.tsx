import { useEffect, useRef, useState } from 'react'
import './SaveBell.css'

/** 저장 한 건 */
export interface SaveEvent {
  user: string
  /** 받은 시각 */
  at: number
  /** 내 손에 고친 게 있어 아직 안 읽어온 것 */
  kept?: boolean
}

interface Props {
  items: SaveEvent[]
  /** 아직 안 본 건수 */
  unseen: number
  onSeen: () => void
}

/**
 * 언제 저장했나 — 시각 그대로.
 *
 * 「3분 전」 은 읽기는 편한데 남기지를 못한다. 시험 이력을 대조할 때는
 * 「그때 그 실행이 몇 시였지」 와 맞춰 봐야 하고, 화면을 캡처해 두면
 * 「방금」 이 무슨 뜻이었는지 알 수 없다.
 */
function stamp(t: number): string {
  const d = new Date(t)
  const p = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  )
}

/**
 * 누가 저장했나 — 종.
 *
 * 전에는 저장될 때마다 띠가 떴다 사라졌다. 한 사람이 연달아 저장하면
 * 앞의 것이 뒤의 것에 밀려서 **누가 무엇을 언제** 했는지가 남지 않았고,
 * 자리를 잠깐 비운 사이에 온 것은 통째로 놓쳤다.
 *
 * 종은 쌓아 둔다. 숫자만 보고 지나가도 되고, 눌러서 훑어도 된다.
 * 안 읽은 것이 없으면 숫자를 떼서 조용히 있는다.
 *
 * **이 시험을 열어 둔 동안**의 것만 모은다. 서버는 마지막으로 저장한
 * 사람만 들고 있어서 지난 것을 되살릴 수는 없다.
 */
export default function SaveBell({ items, unseen, onSeen }: Props) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', esc)
    }
  }, [open])

  if (items.length === 0) return null

  return (
    <div className="sb" ref={boxRef}>
      <button
        type="button"
        className={`sb-btn${unseen > 0 ? ' on' : ''}`}
        title={unseen > 0 ? `안 본 저장 ${unseen}건` : '저장 이력'}
        onClick={() => {
          setOpen((v) => !v)
          if (!open) onSeen()
        }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M8 1.6a3.4 3.4 0 0 0-3.4 3.4v2.2c0 .7-.3 1.4-.8 1.9l-.5.5h9.4l-.5-.5a2.7 2.7 0 0 1-.8-1.9V5A3.4 3.4 0 0 0 8 1.6Z"
            fill="currentColor"
          />
          <path d="M6.5 12a1.5 1.5 0 0 0 3 0Z" fill="currentColor" />
        </svg>
        {unseen > 0 && <span className="sb-n">{unseen}</span>}
      </button>

      {open && (
        <div className="sb-pop" role="dialog" aria-label="저장 이력">
          <div className="sb-head">저장 이력</div>
          <ul className="sb-list">
            {items.map((x, i) => (
              <li key={`${x.at}-${i}`}>
                <span className="sb-who">
                  <b>{x.user}</b>
                  {x.kept && <span className="sb-kept">안 읽어옴</span>}
                </span>
                {/* 시각은 아래 줄로. 한 줄에 붙이면 이름이 길 때 밀린다 */}
                <span className="sb-t">{stamp(x.at)}</span>
              </li>
            ))}
          </ul>
          <div className="sb-foot">이 시험을 열어 둔 동안의 것만 남습니다</div>
        </div>
      )}
    </div>
  )
}
