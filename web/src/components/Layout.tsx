import { useEffect, useState, type ComponentType, type ReactNode } from 'react'
import {
  IconCycle,
  IconDashboard,
  IconDefect,
  IconKnowledge,
  IconPanelToggle,
  IconRelease,
  IconRequirements,
  IconReqTc,
  IconDevice,
  IconInstrument,
  IconRack,
  IconSettings,
  IconTestCase,
  IconSparkle,
} from './icons'
import NotifyBell from '@/components/NotifyBell'
import ProjectPicker from '@/components/ProjectPicker'
import TopUser from '@/components/TopUser'
import TopStatus from './TopStatus'
import { apiFetch } from '@/api/client'
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
  { items: [{ key: 'dashboard', label: 'Dashboard', Icon: IconDashboard }] },
  {
    title: 'QUALITY',
    items: [
      /* 요구사항과 시험을 **합쳐 보는** 자리(지시). 기존 두 화면은 그대로 두고
         여기서만 합친다 — Requirements 바로 위. */
      { key: 'reqtc', label: 'REQ-TC', Icon: IconReqTc },
      { key: 'requirements', label: 'Requirements', Icon: IconRequirements },
      { key: 'testcases', label: 'Coverage', Icon: IconTestCase },
      { key: 'cycles', label: 'Cycles', Icon: IconCycle },
      /* 「Reports」 는 걷었다(지시) — 집계·축·결과 상세·거르개가 모두
         사이클 폴더 현황으로 옮겨 갔다. 옛 주소(executions)로 들어오면
         사이클 화면으로 넘긴다(App.tsx). */
    ],
  },
  {
    title: 'RESOURCES',
    items: [
      { key: 'devices', label: 'Devices', Icon: IconDevice },
      /* 장비 카탈로그는 설정이 아니라 **장비 곁**이 제자리다(지시) */
      { key: 'instruments', label: 'Traffic Gen', Icon: IconInstrument },
      { key: 'rackview', label: 'Rack View', Icon: IconRack },
    ],
  },
  {
    /*
     * INTEGRATION — 밖과 이어지는 것들.
     *
     * 「MANAGEMENT」 였는데, 여기 있는 것이 실은 전부 Jira 다.
     * `/api/jira/defect/*` 가 말해 준다 — 결함은 우리가 따로 들고 있는
     * 자료가 아니라 **Jira 이슈**고, 릴리즈도 Jira 의 fixVersion 이다.
     * 이름이 하는 일과 맞아야 어디를 눌러야 할지 헤매지 않는다.
     */
    title: 'INTEGRATION',
    items: [
      { key: 'defects', label: 'Defects', Icon: IconDefect },
      { key: 'releases', label: 'Releases', Icon: IconRelease },
      /* Jira 연동(붙이는 설정)은 설정 화면으로 옮겼다. 여기 있는 것은
         Jira 에서 가져다 **보는** 것이고, 붙이는 일은 한 번 하고 마는
         설정이다. 두 군데 있으면 어느 쪽인지 매번 생각하게 된다. */
    ],
  },
  {
    title: 'AI',
    items: [
      { key: 'ai-tc', label: 'AI', Icon: IconSparkle },
      { key: 'knowledge', label: 'Knowledge', Icon: IconKnowledge },
    ],
  },
  {
    title: 'SYSTEM',
    items: [{ key: 'settings', label: 'SETUP', Icon: IconSettings }],
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
  /** 브랜딩 — 설정에서 올린 로고·이름·글꼴. 한 번만 읽는다 */
  const [brand, setBrand] = useState<{
    logo?: string
    name?: string
    size?: string
    color?: string
    accent?: string
    font?: string
    link?: string
  }>({})
  useEffect(() => {
    void (async () => {
      try {
        const r = await apiFetch('/api/branding', { cache: 'no-store' })
        if (!r.ok) return
        const b = (await r.json()) as {
          logo?: string
          name_text?: string
          name_size?: string
          name_color?: string
          name_accent_color?: string
          name_font?: string
          link_url?: string
        }
        setBrand({
          logo: b.logo,
          name: b.name_text,
          size: b.name_size,
          color: b.name_color,
          accent: b.name_accent_color,
          font: b.name_font,
          link: b.link_url,
        })
      } catch {
        /* 로고는 장식이다 — 못 읽어도 화면은 살아야 한다 */
      }
    })()
  }, [])

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  return (
    <div className={`app${collapsed ? ' nav-collapsed' : ''}`}>
      {/* 맨 윗줄 — **화면 전체 폭**(지시, 사진). 메뉴바는 이 아래로 들어간다.
          그래야 「1행 = 상단바 / 2행 = 메뉴바 + 본문」 이 된다.
          지금은 REQ-TC 에서만 띄운다 — 다른 화면은 손대지 않는다(지시). */}
      {(
        <header className="app-top">
          {brand.logo ? (
            <img className="app-top-logo" src={brand.logo} alt="" />
          ) : (
            <span className="app-top-logo ph" aria-hidden="true">
              U
            </span>
          )}
          <span className="app-top-brand">{brand.name || 'ubiQuoss'} Test Orchestration Platform</span>
          <ProjectPicker />
          <span className="sp" />
          {/* 「나」 단추 — 이름만 적혀 있었다(지시: 받은 그림처럼).
              글자만 있으면 누를 수 있는지 몰라, 로그아웃하려면 왼쪽 메뉴 맨
              아래까지 내려가야 했다. */}
          <TopUser
            name={user?.name || user?.username || ''}
            role={user?.role}
            isAdmin={user?.role === '관리자'}
            onSettings={() => onNavigate?.('settings')}
            onLogout={onLogout}
          />
        </header>
      )}
      <div className="app-body">
        <nav className="nav" aria-label="주 메뉴">
          {/* 로고·제품 이름은 **상단바**로 옮겼다(지시) — 메뉴에서 걷어낸다.
              같은 것이 두 곳에 있으면 좁혔을 때 두 번 겹쳐 보인다. */}

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

          {/* 아래쪽 — 내 장비 현황과 사용자. 오른쪽 위 구석은 눈이 잘 가지
              않아 상단바에서 여기로 내렸다. 메뉴를 접어도 아이콘으로 남는다. */}
          <div className="nav-foot">
            {/* 알림 종 — 자리 비운 사이의 저장·실행·결함 소식이 쌓인다 */}
            <NotifyBell collapsed={collapsed} />
            <div className="nav-status">
              <TopStatus me={user} />
            </div>
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

            {/* 접기 — **맨 아래, 사용자 밑**(지시). 위 구석에 있던 것을 내렸다.
                접은 상태에서는 글자가 들어갈 자리가 없어 아이콘만 남고,
                무엇인지는 올렸을 때 말풍선으로 말한다. */}
            <button
              type="button"
              className="nav-collapse"
              onClick={() => setCollapsed((v) => !v)}
              aria-expanded={!collapsed}
              title={collapsed ? '메뉴 펼치기' : '메뉴 접기'}
            >
              <span className="nav-icon">
                <IconPanelToggle />
              </span>
              <span className="nav-label">{collapsed ? '펼치기' : '축소'}</span>
            </button>
          </div>
        </nav>

        {/* 화면마다 바탕색을 달리한다 — 카드는 흰색 그대로 두고 그 뒤만
            물들여, 지금 어느 화면에 있는지 색으로 먼저 알게. */}
        <main className="main" data-page={current}>
          {children}
        </main>
      </div>
    </div>
  )
}
