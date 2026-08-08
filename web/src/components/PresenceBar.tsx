import './PresenceBar.css'

interface Props {
  users: string[]
  me: string
}

/** 이름에서 늘 같은 색을 뽑는다 — 같은 사람은 어느 화면에서나 같은 색 */
function colorOf(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return `hsl(${h % 360}, 58%, 46%)`
}

/**
 * 지금 이걸 같이 보고 있는 사람.
 *
 * 나 혼자면 아무것도 안 보인다. 둘부터 뜬다 — 혼자일 때도 동그라미가
 * 있으면 그것이 늘 있는 장식이 되어, 정작 둘이 됐을 때 눈에 안 띈다.
 */
export default function PresenceBar({ users, me }: Props) {
  if (users.length < 2) return null
  // 나를 맨 앞에
  const all = [...users].sort((a, b) => (a === me ? -1 : b === me ? 1 : 0))
  const shown = all.slice(0, 5)
  const more = all.length - shown.length

  return (
    <span className="pb" title={all.map((u) => (u === me ? `${u} (나)` : u)).join(', ')}>
      {shown.map((u) => (
        <span
          key={u}
          className={`pb-av${u === me ? ' me' : ''}`}
          style={{ background: u === me ? undefined : colorOf(u) }}
        >
          {(u.trim()[0] || '?').toUpperCase()}
        </span>
      ))}
      {more > 0 && <span className="pb-av more">+{more}</span>}
      <b className="pb-n">{all.length}명이 함께 보는 중</b>
    </span>
  )
}
