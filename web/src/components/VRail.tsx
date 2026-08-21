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
 * 레일이 가리키는 칸.
 *
 * **제목 줄은 없앴다**(지시, 승인 2026-08-22). 탭에 이미 이름과 건수가
 * 있는데 그 아래에 같은 말이 한 번 더 나왔다 — 「Info」 탭을 골랐는데 안에
 * 또 「Info」. 접기 단추도 그 줄에 있었으므로 함께 걷었다: 탭을 고르면 그
 * 칸은 늘 펼쳐져 있다. 그만큼 내용이 위로 올라온다.
 *
 * `open`·`onToggle`·`title`·`right` 는 부르는 쪽을 안 건드리려고 남겨 둔다.
 * 화면에는 안 쓴다.
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
  void title
  void open
  void onToggle
  void right
  return (
    <section className="railsec" data-sec={k}>
      <div className="railsec-b">{children}</div>
    </section>
  )
}
