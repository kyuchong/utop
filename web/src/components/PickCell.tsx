import { useEffect, useState } from 'react'
import type React from 'react'

/**
 * 표 안에서 **그 자리에서 고치는 칸**.
 *
 * 처음에는 「눌러야 고르개가 열리는」 꼴이었다. 줄이 수백일 때 `<option>` 을
 * 미리 만들지 않으려는 값이었는데, 고치려면 올리고·누르고·열리고·고르는
 * 네 걸음이 든다(지적). 이 세 화면(요구사항·시험항목·사이클)의 칸은 고를 값이
 * 서너 개뿐이라 그 값이 크지 않다 — **늘 살아 있는 고르개**로 두고 한 번에 고른다.
 *
 * 평소에는 글자처럼 조용하다. 올리면 칸이 드러나고, 고르면 바로 저장한다.
 */
export default function PickCell({
  value,
  opts,
  onSave,
  title,
  cls,
  dbl = false,
  view,
}: {
  value: string
  /** 고를 값들. 비우면 **글자 칸**이 된다(제목·버전처럼 정해진 값이 없는 칸) */
  opts?: readonly string[]
  onSave: (v: string) => void | Promise<void>
  title?: string
  /** 그 칸의 꼴을 더 얹을 때 */
  cls?: string
  /**
   * **두 번 눌러야** 고치는 칸(지시).
   *
   * 한 번 누르는 것이 다른 일(실행 화면으로 가기)인 칸이 있다 — 그런 자리는
   * 고치는 문을 두 번 누르기로 옮긴다.
   */
  dbl?: boolean
  /** 두 번 누르기 칸이 평소에 보여 줄 것 — 안 주면 글자 그대로 */
  view?: React.ReactNode
}) {
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [txt, setTxt] = useState(value)
  useEffect(() => setTxt(value), [value])

  const save = (v: string) => {
    if (v === value) return
    setBusy(true)
    void Promise.resolve(onSave(v)).finally(() => setBusy(false))
  }
  /* 줄 누르기·끌어 옮기기가 이 칸에서 시작되면 안 된다 */
  const stop = {
    onClick: (e: { stopPropagation: () => void }) => e.stopPropagation(),
    onMouseDown: (e: { stopPropagation: () => void }) => e.stopPropagation(),
    onPointerDown: (e: { stopPropagation: () => void }) => e.stopPropagation(),
  }

  if (dbl && !open)
    return (
      <span
        className={`pick-view${cls ? ' ' + cls : ''}`}
        title={title ?? '두 번 누르면 고칩니다'}
        onDoubleClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
      >
        {view ?? (value || <span className="muted">–</span>)}
      </span>
    )

  if (!opts || opts.length === 0)
    return (
      <input
        className={`pick-live${cls ? ' ' + cls : ''}`}
        value={txt}
        autoFocus={dbl}
        disabled={busy}
        title={title ?? '고치고 Enter — 자리를 떠도 저장됩니다'}
        {...stop}
        onChange={(e) => setTxt(e.target.value)}
        onBlur={() => {
          setOpen(false)
          save(txt)
        }}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') {
            setTxt(value)
            setOpen(false)
            ;(e.target as HTMLInputElement).blur()
          }
        }}
      />
    )

  const known = !value || opts.includes(value)
  return (
    <select
      className={`pick-live${known ? '' : ' warn'}${cls ? ' ' + cls : ''}`}
      value={value}
      disabled={busy}
      title={title ?? '고르면 바로 저장됩니다'}
      {...stop}
      onChange={(e) => save(e.target.value)}
    >
      <option value="">–</option>
      {!known && <option value={value}>{value} (목록에 없음)</option>}
      {opts.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  )
}
