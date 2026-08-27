import { useEffect, useRef, useState } from 'react'
import './TopUser.css'

/**
 * 상단 오른쪽 — 지금 누구로 들어와 있나.
 *
 * 이름만 적혀 있었다(지적: 받은 그림처럼 해 달라). 글자만 있으면 누를 수
 * 있는지 알 수 없어, 로그아웃하려면 왼쪽 메뉴 맨 아래까지 내려가야 했다.
 * 사람 그림 · 이름 · 꺾쇠를 단추 하나로 묶어, 여기가 「나」 를 다루는
 * 자리임을 모양으로 말한다.
 *
 * 열쇠 접두어는 `tpu-`. 이 프로젝트의 CSS 는 전역이라 새 화면은 제 접두어를
 * 가져야 한다 — `rt-`·`pp-` 로 두 번 남의 화면을 망가뜨렸다.
 */
export default function TopUser({
  name,
  role,
  team,
  dept,
  isAdmin,
  onSettings,
  onLogout,
}: {
  name: string
  role?: string
  /** 팀 · 소속담당 — 「누가」 만으로는 같은 이름이 갈리지 않는다(지시) */
  team?: string
  dept?: string
  isAdmin?: boolean
  onSettings?: () => void
  onLogout?: () => void
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  /* 바깥을 누르거나 Esc 면 닫는다 — 열어 두고 다른 일을 하면 메뉴가 화면에
     남아 무엇을 가리고 있는지 모른다 */
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', down)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('mousedown', down)
      window.removeEventListener('keydown', key)
    }
  }, [open])

  if (!name) return null
  const sub = [role, team, dept].map((x) => String(x ?? '').trim()).filter(Boolean).join(' · ')
  /* 머리글자 — 그림이 없으니 이름 첫 글자로 대신한다 */
  const initial = name.trim().charAt(0) || '?'

  return (
    <div className="tpu" ref={box}>
      <button
        type="button"
        className={`tpu-btn${open ? ' on' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="tpu-av" aria-hidden="true">
          {initial}
        </span>
        <span className="tpu-who">
          <b className="tpu-nm">{name}</b>
          {/* 역할·팀·소속담당 — 이름 뒤에 이어 붙인다. 없는 것은 안 적어,
              「· ·」 처럼 빈 자리가 남지 않게 한다. */}
          {sub && <span className="tpu-sub">{sub}</span>}
        </span>
        <span className="tpu-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div className="tpu-menu" role="menu">
          <div className="tpu-head">
            <span className="tpu-av big" aria-hidden="true">
              {initial}
            </span>
            <div className="tpu-headt">
              <b>{name}</b>
              {sub && <span className="muted small">{sub}</span>}
            </div>
          </div>
          <div className="tpu-sep" />
          {isAdmin && onSettings && (
            <button
              type="button"
              className="tpu-item"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                onSettings()
              }}
            >
              계정 관리
            </button>
          )}
          <button
            type="button"
            className="tpu-item out"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onLogout?.()
            }}
          >
            로그아웃
          </button>
        </div>
      )}
    </div>
  )
}
