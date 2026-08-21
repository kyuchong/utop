import { useEffect, useState } from 'react'

/**
 * 표 안에서 **그 자리에서 고르는 칸**.
 *
 * 목록의 상태·우선순위를 고치려고 한 건씩 열어 들어갔다 나오는 일이 잦다
 * (지시). 평소에는 글자 한 줄로 조용히 있다가, 누르면 그때 고르개가 열린다 —
 * 줄이 수백이라도 `<option>` 을 미리 만들지 않는다(장비 화면에서 겪은 값).
 */
export default function PickCell({
  value,
  opts,
  onSave,
  render,
  title,
}: {
  value: string
  opts: readonly string[]
  onSave: (v: string) => void | Promise<void>
  /** 평소 보이는 꼴 — 안 주면 글자 그대로 */
  render?: (v: string) => React.ReactNode
  title?: string
}) {
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (busy) setOn(false)
  }, [busy])

  if (!on)
    return (
      <span
        className="pick-cell"
        title={title ?? '누르면 고칩니다'}
        /* 줄을 끌어 폴더로 옮기는 손짓(onPointerDown)이 이 칸에서 시작되면
           고르개 대신 끌기가 걸린다 — 여기서 끊는다 */
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          setOn(true)
        }}
      >
        {render ? render(value) : value || <span className="muted">–</span>}
        <i aria-hidden="true">▾</i>
      </span>
    )

  return (
    <select
      className="pick-sel"
      value={value}
      autoFocus
      disabled={busy}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={() => setOn(false)}
      onChange={(e) => {
        const v = e.target.value
        setOn(false)
        if (v === value) return
        setBusy(true)
        void Promise.resolve(onSave(v)).finally(() => setBusy(false))
      }}
    >
      <option value="">–</option>
      {!opts.includes(value) && value && <option value={value}>{value} (목록에 없음)</option>}
      {opts.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  )
}
