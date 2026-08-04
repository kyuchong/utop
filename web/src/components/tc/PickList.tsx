import { useEffect, useRef, useState } from 'react'

export interface PickItem {
  /** 넣을 값 */
  value: string
  /** 사람이 읽는 이름 */
  label: string
  /** 오른쪽에 붙는 부연 (지금 값 · 어느 모델 것인지) */
  note?: string
}

interface Props {
  title: string
  items: PickItem[]
  /** 자료가 비어 있을 때 왜 비었는지 */
  empty?: string
  loading?: boolean
  onPick: (v: PickItem) => void
  onClose: () => void
  /** 글자를 칠 때마다 서버에 다시 물어야 하면 준다 (OID 처럼 수만 개일 때) */
  onSearch?: (q: string) => void
}

/**
 * 찾아서 눌러 넣기.
 *
 * OID 도 전역 파라미터도 하는 일이 같다 — 목록에서 골라 그 자리에 넣는다.
 * 손으로 치게 두면 `1.3.6.1.2.1.1.3.0` 을 외우거나 문서를 뒤져야 하고,
 * 한 글자만 틀려도 실행할 때 가서야 안다.
 *
 * 드롭다운이 아니라 뜨는 목록이다. 항목이 수백 개라 검색이 필요하고,
 * 이름·값·출처 세 가지를 한 줄에 보여야 어느 것인지 고를 수 있다.
 */
export default function PickList({
  title,
  items,
  empty,
  loading,
  onPick,
  onClose,
  onSearch,
}: Props) {
  const [q, setQ] = useState('')
  const [at, setAt] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)

  // 바깥을 누르거나 Esc 로 닫는다
  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) onClose()
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    // 이 창을 연 클릭이 그대로 '바깥 클릭' 으로 잡히지 않게 한 박자 늦춘다
    const t = setTimeout(() => window.addEventListener('mousedown', down), 0)
    window.addEventListener('keydown', esc)
    return () => {
      clearTimeout(t)
      window.removeEventListener('mousedown', down)
      window.removeEventListener('keydown', esc)
    }
  }, [onClose])

  const shown = onSearch
    ? items
    : items.filter(
        (x) =>
          !q.trim() ||
          x.label.toLowerCase().includes(q.trim().toLowerCase()) ||
          x.value.toLowerCase().includes(q.trim().toLowerCase()),
      )

  return (
    <div className="pk" ref={boxRef}>
      <div className="pk-top">
        <b>{title}</b>
        <span className="muted small">{shown.length}개</span>
      </div>
      <input
        autoFocus
        className="pk-q"
        value={q}
        placeholder="이름 · 값으로 찾기"
        onChange={(e) => {
          setQ(e.target.value)
          setAt(0)
          onSearch?.(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setAt((n) => Math.min(n + 1, shown.length - 1))
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault()
            setAt((n) => Math.max(n - 1, 0))
          }
          if (e.key === 'Enter') {
            e.preventDefault()
            const it = shown[at]
            if (it) onPick(it)
          }
        }}
      />
      <div className="pk-body">
        {loading ? (
          <div className="empty">불러오는 중…</div>
        ) : shown.length === 0 ? (
          <div className="empty">{empty || '없습니다.'}</div>
        ) : (
          shown.map((x, i) => (
            <button
              key={`${x.value}-${i}`}
              type="button"
              className={`pk-row${i === at ? ' on' : ''}`}
              onMouseEnter={() => setAt(i)}
              onClick={() => onPick(x)}
            >
              <b>{x.label}</b>
              {x.note && <span className="pk-note">{x.note}</span>}
              <span className="pk-val">{x.value}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
