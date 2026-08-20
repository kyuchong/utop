import type { ReactNode } from 'react'
import { IconChevron } from '@/components/icons'
import './VRail.css'

/**
 * 세로 아이콘 레일 — 요구사항·시험항목(·사이클) 세부의 탭.
 *
 * 화면마다 따로 만들면 폭도 표시도 갈린다. 탭 목록만 다르고 생김새는
 * 한 곳(VRail.css)에서 온다.
 */
export type VRailItem = {
  /** 탭 키 */
  k: string
  /** 말풍선·읽기 도구가 읽을 이름 */
  label: string
  icon: ReactNode
  /** 개수 — 0 이면 안 그린다 */
  n?: number
  /** 말풍선에 쓸 더 긴 설명 (없으면 label) */
  hint?: string
}

export default function VRail({
  items,
  value,
  onPick,
  ariaLabel,
  dir = 'v',
}: {
  items: readonly VRailItem[]
  value: string
  onPick: (k: string) => void
  ariaLabel: string
  /** 'h' 면 **가로 레일**(지시) — 칸이 짧은 화면에서 세로 레일이 엉성했다 */
  dir?: 'v' | 'h'
}) {
  if (dir === 'h') {
    const at = Math.max(
      0,
      items.findIndex((x) => x.k === value),
    )
    const go = (d: number) => {
      const n = items[Math.min(items.length - 1, Math.max(0, at + d))]
      if (n) onPick(n.k)
    }
    return (
      <nav className="hrail" role="tablist" aria-label={ariaLabel}>
        {/* 앞·다음 — 레일을 누르지 않고도 옮긴다(지시). 화살표보다 큰 표 */}
        <button
          type="button"
          className="hrail-nav"
          disabled={at <= 0}
          title="앞 칸 (Alt+←)"
          aria-label="앞 칸"
          onClick={() => go(-1)}
        >
          <IconChevron />
        </button>
        <span className="hrail-tabs">
          {items.map((it) => (
            <button
              key={it.k}
              type="button"
              role="tab"
              aria-selected={value === it.k}
              className={`hrail-b${value === it.k ? ' on' : ''}`}
              title={it.hint || it.label}
              onClick={() => onPick(it.k)}
            >
              <i aria-hidden="true">{it.icon}</i>
              <b>{it.label}</b>
              {it.n ? <em className="hrail-n">{it.n}</em> : null}
            </button>
          ))}
        </span>
        <button
          type="button"
          className="hrail-nav next"
          disabled={at >= items.length - 1}
          title="다음 칸 (Alt+→)"
          aria-label="다음 칸"
          onClick={() => go(1)}
        >
          <IconChevron />
        </button>
      </nav>
    )
  }

  return (
    <nav className="vrail" role="tablist" aria-label={ariaLabel}>
      {items.map((it) => (
        <button
          key={it.k}
          type="button"
          role="tab"
          aria-selected={value === it.k}
          aria-label={it.label}
          className={`vrail-b${value === it.k ? ' on' : ''}`}
          onClick={() => onPick(it.k)}
        >
          <i aria-hidden="true">{it.icon}</i>
          {it.n ? <em className="vrail-n">{it.n}</em> : null}
          <span className="vrail-l" aria-hidden="true">
            {it.hint || it.label}
          </span>
        </button>
      ))}
    </nav>
  )
}

/**
 * 레일이 가리키는 칸 — 접었다 펴는 카드(사진 꼴).
 *
 * 탭처럼 하나만 남기지 않는다. 칸이 죽 이어져 있어야 굴리는 것만으로
 * 다음 이야기가 나오고, 레일이 「지금 여기」 를 짚어 줄 수 있다.
 */
export function RailSec({
  k,
  title,
  open,
  onToggle,
  right,
  children,
}: {
  k: string
  title: string
  open: boolean
  onToggle: () => void
  /** 이름표 오른쪽 끝에 놓을 것 (건수 따위) */
  right?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="railsec" data-sec={k}>
      <button
        type="button"
        className="railsec-h"
        aria-expanded={open}
        onClick={onToggle}
        title={open ? '접기' : '펴기'}
      >
        <i className={`railsec-caret${open ? ' on' : ''}`} aria-hidden="true">
          <IconChevron />
        </i>
        <span>{title}</span>
        {right ? <span className="railsec-r">{right}</span> : null}
      </button>
      {open ? <div className="railsec-b">{children}</div> : null}
    </section>
  )
}
