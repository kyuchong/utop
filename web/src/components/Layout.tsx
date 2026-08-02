import type { ReactNode } from 'react'
import './Layout.css'

export interface NavItem {
  key: string
  label: string
}

export interface NavGroup {
  /** 그룹 제목. 최상단 항목처럼 제목 없이 둘 수도 있다. */
  title?: string
  items: NavItem[]
}

/**
 * 좌측 메뉴 구성. 목업의 QUALITY / MANAGEMENT / AI 3그룹을 따른다.
 *
 * 기존 앱은 진입 가능한 화면이 38개였다. 여기서는 의도적으로 9개만 둔다 —
 * 화면을 새로 옮길 때마다 이 목록에 한 줄씩 추가하는 방식으로 늘린다.
 */
export const NAV: NavGroup[] = [
  { items: [{ key: 'dashboard', label: '대시보드' }] },
  {
    title: 'QUALITY',
    items: [
      { key: 'requirements', label: 'Requirements' },
      { key: 'testcases', label: 'Test Cases' },
      { key: 'cycles', label: 'Cycles' },
      { key: 'executions', label: 'Executions' },
    ],
  },
  {
    title: 'MANAGEMENT',
    items: [
      { key: 'defects', label: 'Defects' },
      { key: 'releases', label: 'Releases' },
    ],
  },
  {
    title: 'AI',
    items: [
      { key: 'ai-tc', label: 'TC 생성' },
      { key: 'knowledge', label: 'Knowledge' },
    ],
  },
]

interface Props {
  current: string
  onNavigate: (key: string) => void
  children: ReactNode
}

export default function Layout({ current, onNavigate, children }: Props) {
  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-logo">UTOP</div>
        <div className="topbar-chip">QA Management</div>
        <div className="topbar-search" role="search">
          Requirement / TC 검색
        </div>
        <div className="topbar-user">관리자</div>
      </header>

      <div className="app-body">
        <nav className="nav" aria-label="주 메뉴">
          {NAV.map((group, gi) => (
            <div key={group.title ?? `g${gi}`}>
              {group.title && <h5 className="nav-group">{group.title}</h5>}
              {group.items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`nav-item${item.key === current ? ' on' : ''}`}
                  aria-current={item.key === current ? 'page' : undefined}
                  onClick={() => onNavigate(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <main className="main">{children}</main>
      </div>
    </div>
  )
}
