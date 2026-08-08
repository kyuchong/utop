import { useEffect, useMemo, useState } from 'react'
import type { PickItem } from './PickList'

interface Props {
  items: PickItem[]
  /** 이름 → 지금 값. 이름만 보고는 어느 것인지 모른다 */
  values: Record<string, string>
  loading?: boolean
  empty?: string
  onPick: (v: PickItem) => void
  onClose: () => void
}

/**
 * 전역 파라미터 고르기 — 창으로.
 *
 * 전에는 칸 옆에 목록이 뜨는 방식이었다. 파라미터가 열댓 개일 때는 그것으로
 * 됐는데, 파일이 여럿이고 값이 수십 개가 되면 좁은 목록에서 이름만 보고
 * 골라야 해서 **어느 파일 것인지, 지금 값이 무엇인지** 알 수 없다.
 *
 * 창을 띄우고 **파일로 묶어** 보여 준다. 한 줄에 이름 · 지금 값 · 어느
 * 파일인지가 함께 나오면 눈으로 고를 수 있다.
 */
export default function ParamPicker({ items, values, loading, empty, onPick, onClose }: Props) {
  const [q, setQ] = useState('')
  const [at, setAt] = useState(0)

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    if (!n) return items
    return items.filter(
      (x) =>
        x.label.toLowerCase().includes(n) ||
        (x.note ?? '').toLowerCase().includes(n) ||
        (values[x.label] ?? '').toLowerCase().includes(n),
    )
  }, [items, q, values])

  /**
   * 파일로 묶는다.
   *
   * `note` 는 `그룹 · 설명 · 파일` 꼴이라 맨 뒤가 파일이다. 같은 이름이
   * 여러 파일에 있을 때 어느 것이 이기는지(뒤가 앞을 덮는다)를 알려면
   * 파일이 보여야 한다.
   */
  const groups = useMemo(() => {
    const m = new Map<string, PickItem[]>()
    for (const x of shown) {
      const parts = (x.note ?? '').split('·').map((s) => s.trim()).filter(Boolean)
      const file = parts[parts.length - 1] || '공통'
      const arr = m.get(file)
      if (arr) arr.push(x)
      else m.set(file, [x])
    }
    return [...m.entries()]
  }, [shown])

  const flat = groups.flatMap(([, list]) => list)

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div
        className="modal pp"
        role="dialog"
        aria-modal="true"
        aria-label="전역 파라미터 고르기"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <b>값 넣기</b>
          <span className="muted small">{shown.length}개</span>
          <span className="sp" />
          <button className="btn small" type="button" onClick={onClose}>
            ✕
          </button>
        </div>

        <input
          autoFocus
          className="pp-q"
          value={q}
          placeholder="이름 · 값 · 파일로 찾기"
          onChange={(e) => {
            setQ(e.target.value)
            setAt(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setAt((n) => Math.min(n + 1, flat.length - 1))
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setAt((n) => Math.max(n - 1, 0))
            }
            if (e.key === 'Enter') {
              e.preventDefault()
              const it = flat[at]
              if (it) onPick(it)
            }
          }}
        />

        <div className="pp-body">
          {loading ? (
            <div className="empty">불러오는 중…</div>
          ) : flat.length === 0 ? (
            <div className="empty">{empty || '전역 파라미터가 없습니다.'}</div>
          ) : (
            groups.map(([file, list]) => (
              <div key={file}>
                <div className="pp-file">{file}</div>
                {list.map((x) => {
                  const i = flat.indexOf(x)
                  return (
                    <button
                      key={`${file}-${x.value}`}
                      type="button"
                      className={`pp-row${i === at ? ' on' : ''}`}
                      onMouseEnter={() => setAt(i)}
                      onClick={() => onPick(x)}
                    >
                      <code className="pp-name">{x.value}</code>
                      {/* 지금 값이 무엇인지가 이름만큼 중요하다 — 이름이
                          비슷한 것이 여럿이면 값으로 갈린다 */}
                      <span className="pp-val">{values[x.label] || ''}</span>
                      {/* 그룹·설명이 있으면 뒤에 옅게 */}
                      {(x.note ?? '').split('·').length > 1 && (
                        <span className="pp-note">
                          {(x.note ?? '')
                            .split('·')
                            .slice(0, -1)
                            .map((s) => s.trim())
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
