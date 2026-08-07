import type { ReactNode } from 'react'
import './PageMark.css'

/** 화면마다 다른 색. 세 화면이 같은 뼈대라서 색이 곧 이름표다 */
export type PageKind = 'req' | 'tc' | 'cycle' | 'exec' | 'ai'

interface Props {
  kind: PageKind
  /** 화면 이름 — 왼쪽 메뉴에 적힌 것과 같아야 한다 */
  name: string
  /** 이 화면이 무엇을 하는 곳인지 한 줄 */
  sub?: string
  /** 건수 같은 것 */
  count?: ReactNode
  children?: ReactNode
}

/**
 * 화면 이름표.
 *
 * 요구사항 · 시험항목 · 사이클이 **같은 뼈대**(왼쪽 트리 + 오른쪽 칸)를
 * 쓰다 보니, 화면을 옮기고도 어디에 와 있는지가 한눈에 안 들어왔다.
 *
 * 뼈대를 다시 흩뜨리는 대신 **이름표 한 줄**을 세 화면에 똑같이 둔다.
 * 모양은 같고 **이름과 색만 다르다** — 같아서 익숙하고, 색이 달라서
 * 헷갈리지 않는다. 왼쪽 메뉴에서 고른 항목과 같은 색을 쓴다.
 */
export default function PageMark({ kind, name, sub, count, children }: Props) {
  return (
    <div className={`pm pm-${kind}`}>
      <span className="pm-dot" aria-hidden="true" />
      <b className="pm-name">{name}</b>
      {count !== undefined && <span className="pm-cnt">{count}</span>}
      {sub && <span className="pm-sub">{sub}</span>}
      <span className="sp" />
      {children}
    </div>
  )
}
