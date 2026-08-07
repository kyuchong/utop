import { useEffect, useState, type ComponentType, type ReactNode } from 'react'
import {
  IconAi,
  IconCycle,
  IconDashboard,
  IconDefect,
  IconExecution,
  IconKnowledge,
  IconPanelToggle,
  IconRelease,
  IconRequirements,
  IconDevice,
  IconInstrument,
  IconSettings,
  IconTestCase,
} from './icons'
import './Layout.css'

export interface NavItem {
  key: string
  label: string
  Icon: ComponentType<{ className?: string }>
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
  { items: [{ key: 'dashboard', label: '대시보드', Icon: IconDashboard }] },
  {
    title: 'QUALITY',
    items: [
      { key: 'requirements', label: 'Requirements', Icon: IconRequirements },
      { key: 'testcases', label: 'Test Cases', Icon: IconTestCase },
      { key: 'cycles', label: 'Cycles', Icon: IconCycle },
      { key: 'executions', label: 'Executions', Icon: IconExecution },
    ],
  },
  {
    title: 'RESOURCES',
    items: [
      { key: 'devices', label: '장비', Icon: IconDevice },
      { key: 'instruments', label: '계측기', Icon: IconInstrument },
    ],
  },
  {
    title: 'MANAGEMENT',
    items: [
      { key: 'defects', label: 'Defects', Icon: IconDefect },
      { key: 'releases', label: 'Releases', Icon: IconRelease },
    ],
  },
  {
    title: 'AI',
    items: [
      { key: 'ai-tc', label: 'TC 생성', Icon: IconAi },
      { key: 'knowledge', label: 'Knowledge', Icon: IconKnowledge },
    ],
  },
  {
    title: 'SYSTEM',
    items: [{ key: 'settings', label: '설정', Icon: IconSettings }],
  },
]

const COLLAPSE_KEY = 'utop.nav.collapsed'

interface Props {
  /** 로그인한 사람 (좌측 하단에 표시) */
  user?: { username?: string; name?: string; role?: string } | null
  onLogout?: () => void
  current: string
  onNavigate: (key: string) => void
  children: ReactNode
}

export default function Layout({ user, onLogout, current, onNavigate, children }: Props) {
  // 접힘 상태는 사람마다 취향이 갈리므로 브라우저에 기억시킨다.
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(COLLAPSE_KEY) === '1',
  )

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  return (
    <div className={`app${collapsed ? ' nav-collapsed' : ''}`}>
      <header className="topbar">
        <div className="topbar-logo">UTOP</div>
        <div className="topbar-chip">QA Management</div>
        <div className="topbar-search" role="search">
          Requirement / TC 검색
        </div>
      </header>

      <div className="app-body">
        <nav className="nav" aria-label="주 메뉴">
          <button
            type="button"
            className="nav-toggle"
            onClick={() => setCollapsed((v) => !v)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? '메뉴 펼치기' : '메뉴 접기'}
            title={collapsed ? '메뉴 펼치기' : '메뉴 접기'}
          >
            <IconPanelToggle />
          </button>

          {NAV.map((group, gi) => (
            <div className="nav-section" key={group.title ?? `g${gi}`}>
              {group.title && <h5 className="nav-group">{group.title}</h5>}
              {group.items.map(({ key, label, Icon }) => (
                <button
                  key={key}
                  type="button"
                  className={`nav-item${key === current ? ' on' : ''}`}
                  // 화면마다 다른 색을 입히려면 어느 항목인지 CSS 가 알아야 한다
                  data-key={key}
                  aria-current={key === current ? 'page' : undefined}
                  onClick={() => onNavigate(key)}
                  // 접힌 상태에서는 글자가 안 보이므로 이름을 툴팁으로 남긴다.
                  title={collapsed ? label : undefined}
                >
                  <span className="nav-icon">
                    <Icon />
                  </span>
                  <span className="nav-label">{label}</span>
                  <span className="nav-tip" aria-hidden="true">
                    {label}
                  </span>
                </button>
              ))}
            </div>
          ))}

          {/* 사용자는 메뉴 맨 아래에 둔다. 오른쪽 위 구석은 눈이 잘 가지
              않는 자리이고, 메뉴를 접어도 여기는 아이콘으로 남는다. */}
          <div className="nav-user">
            <div className="nav-user-face" title={user?.name || user?.username || ''}>
              {(user?.name || user?.username || '?').slice(0, 1)}
            </div>
            <div className="nav-user-who">
              <div className="nav-user-name">{user?.name || user?.username || '알 수 없음'}</div>
              {user?.role && user.role !== (user.name || user.username) && (
                <div className="muted small">{user.role}</div>
              )}
            </div>
            <button
              type="button"
              className="nav-user-out"
              title="로그아웃"
              onClick={onLogout}
            >
              ⏻
            </button>
          </div>
        </nav>

        <main className="main">{children}</main>
      </div>
    </div>
  )
}
