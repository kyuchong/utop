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

function ago(t: number, now: number): string {
  const s = Math.max(0, Math.floor((now - t) / 1000))
  if (s < 60) return '방금'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}분 전`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}시간 전`
  return `${Math.floor(h / 24)}일 전`
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
  const [now, setNow] = useState(() => items[0]?.at ?? 0)
  const boxRef = useRef<HTMLDivElement>(null)

  // 「3분 전」 이 3분 전에 멈춰 있으면 거짓말이 된다
  useEffect(() => {
    if (!open) return
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [open])

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
                <b>{x.user}</b>
                <span className="sb-t">{ago(x.at, now || x.at)}</span>
                {x.kept && <span className="sb-kept">안 읽어옴</span>}
              </li>
            ))}
          </ul>
          <div className="sb-foot">이 시험을 열어 둔 동안의 것만 남습니다</div>
        </div>
      )}
    </div>
  )
}
