import { useEffect, useState, type ComponentType, type ReactNode } from 'react'
import { prefGet, prefSet } from '@/lib/prefs'
import {
  IconCycle,
  IconExecution,
  IconDashboard,
  IconDefect,
  IconKnowledge,
  IconPanelToggle,
  IconRelease,
  IconReqTc,
  IconDevice,
  IconInstrument,
  IconRack,
  IconSettings,
  IconSearch,
  IconSparkle,
} from './icons'
import NotifyBell from '@/components/NotifyBell'
import ProjectPicker from '@/components/ProjectPicker'
import ReqTcModeToggle from '@/components/ReqTcMode'
import TopUser from '@/components/TopUser'
import PresenceBar from '@/components/PresenceBar'
import { usePageCrowd } from '@/components/usePageCrowd'
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
      /* 차례는 **일이 흘러가는 차례**다(지시): 적고 → 덮고 → 돌린다.
         위키에 규격과 절차를 적고, REQ-Coverage 에서 요구사항을 시험으로
         덮고, 플랜로 돌린다. */
      { key: 'wiki', label: 'Wiki', Icon: IconKnowledge },
      /* 요구사항과 시험을 **합쳐 보는** 자리(지시).
         Requirements · Coverage 두 줄은 뺐다 — 그 일을 여기서 다 한다.
         요구사항 목록과 시험 목록, 상세, 붙이기(Map)까지. 같은 일을 하는
         자리가 셋이면 사람마다 다른 자리에서 일하게 되고, 고칠 때도 셋을
         다 봐야 한다. 주소(?req= · ?tc=)는 살려 둔다 — 남이 보낸 링크가
         죽으면 안 된다. */
      { key: 'reqtc', label: 'REQ-Coverage', Icon: IconReqTc },
      /* **Cycles 와 Runs 를 다시 두 화면으로**(지시: 목업 반영).
         Cycles 는 「무엇을 시험할지」 — 사이클 목록·담긴 항목·구성.
         Runs 는 「어떻게 됐나」 — 실행·판정·실행기. 계획과 결과는 묻는
         말이 달라, 한 화면에 우겨 넣었더니 둘 다 좁아졌다. */
      { key: 'cycles', label: 'Cycles', Icon: IconCycle },
      { key: 'runs', label: 'Runs', Icon: IconExecution },
      /* 「Reports」 는 걷었다(지시) — 집계·축·결과 상세·거르개가 모두
         플랜 폴더 현황으로 옮겨 갔다. 옛 주소(executions)로 들어오면
         플랜 화면으로 넘긴다(App.tsx). */
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
      /* **둘로 가른다**(지시) — 하는 일이 다르다.
           Test AI       시험을 **만들고 고친다** (매뉴얼·시험항목 검색/생성/수정)
           Knowledge AI  자료를 **찾는다** (Wiki 문서 · Release 의 Jira 이슈)
         쓰기와 읽기라 묻는 말도 답하는 꼴도 다르다.

         이름을 줄인 까닭 — 메뉴 글자 자리는 108px 인데
         「Knowledge Assistant」 는 117px 이라 잘린다(재 보았다). 화면 안
         제목에서는 길게 쓴다.

         **전에 한 번 뺀 자리다**: 화면도 자료도 없이 메뉴에만 두어 누를
         때마다 「아직 안 옮겼습니다」 벽을 만났다(지적). 그래서 이번에는
         **무엇을 하는 자리인지 적힌 안내**를 함께 둔다 — 벽 대신 길잡이. */
      { key: 'ai-tc', label: 'Test AI', Icon: IconSparkle },
      { key: 'ai-kb', label: 'Knowledge AI', Icon: IconSearch },
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
  /** 상단바가 이름 뒤에 팀·소속담당까지 적는다 — /api/me 가 그대로 준다 */
  /** 상단바가 이름 뒤에 팀·소속담당까지 적는다 — /api/me 가 조직도 값을 함께 준다 */
  user?: {
    username?: string
    name?: string
    role?: string
    team?: string
    dept?: string
    org_path?: string
  } | null
  onLogout?: () => void
  current: string
  onNavigate: (key: string) => void
  children: ReactNode
}

export default function Layout({ user, onLogout, current, onNavigate, children }: Props) {
  /* 접두어를 비워 **어느 화면이든** 들어와 있는 사람을 모두 센다 */
  const crowd = usePageCrowd('')
  // 접힘 상태는 사람마다 취향이 갈리므로 브라우저에 기억시킨다.
  const [collapsed, setCollapsed] = useState(
    () => prefGet(COLLAPSE_KEY) === '1',
  )
  /**
   * 독 자동 숨김(지시) — 켜면 메뉴바가 통째로 숨고, 왼쪽 가장자리에
   * 마우스를 대면 위로 떠서 나온다. 화면을 다 쓰고 싶은 사람의 선택지다.
   * 강제하지 않는다: 밑값은 끔이고, 켜고 끄는 것은 계정을 따라간다.
   */
  const [dock, setDock] = useState(() => prefGet('utop.nav.dock') === '1')
  const [dockOpen, setDockOpen] = useState(false)
  useEffect(() => {
    prefSet('utop.nav.dock', dock ? '1' : '0')
    if (!dock) setDockOpen(false)
  }, [dock])
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
    prefSet(COLLAPSE_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  return (
    <div
      /* 독 숨김이 켜지면 **축소는 무시한다**(승인). 축소는 「늘 보이되 좁게」,
         독은 「숨기되 부르면 제대로」 — 곱하면 아이콘만 남은 레일이 본문 위에
         떠서 트리를 반쯤 가렸다(지적). 꺼 두는 것이 아니라 안 미치게 한다 —
         독을 끄면 접어 둔 상태가 그대로 돌아온다. */
      className={`app${collapsed && !dock ? ' nav-collapsed' : ''}${dock ? ' nav-dock' : ''}${
        dock && dockOpen ? ' nav-dock-open' : ''
      }`}
    >
      {/* 독 모드의 부름 띠 — 왼쪽 가장자리 8px. 마우스가 닿으면 메뉴가 떠서
          나오고, 메뉴에서 벗어나면 도로 숨는다. */}
      {dock && (
        <span
          className="nav-dockzone"
          aria-hidden="true"
          onMouseEnter={() => setDockOpen(true)}
        />
      )}
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
          {/* **설정한 이름을 그대로 낸다.**

              여태 뒤에 「Test Orchestration Platform」 이 코드에 박혀 있어,
              이름을 「ubiQuoss Test Studio」 로 바꿔도 옛 이름이 따라붙어
              두 이름이 한 줄에 섰다(지적). 설정 화면은 「여기 적은 것이 곧
              이름」 이라고 말하는데 화면은 그것을 앞머리로만 썼다.

              크기·색·글꼴도 설정을 따른다. 적어 둔 값이 화면에 안 나오면
              그 칸은 있으나 마나다. 대괄호로 감싼 글자는 강조 색으로 —
              `ubi[Q]uoss` 처럼 적으면 그 한 글자만 색이 바뀐다. */}
          <span
            className="app-top-brand"
            style={{
              fontSize: brand.size ? `${brand.size}px` : undefined,
              color: brand.color || undefined,
              fontFamily: brand.font === 'Monospace' ? 'var(--font-mono)' : brand.font || undefined,
            }}
          >
            {(brand.name || 'ubiQuoss Test Orchestration Platform')
              .split(/(\[[^\]]*\])/)
              .map((part, i) =>
                part.startsWith('[') && part.endsWith(']') ? (
                  <b key={i} style={{ color: brand.accent || undefined }}>
                    {part.slice(1, -1)}
                  </b>
                ) : (
                  part
                ),
              )}
          </span>
          {/* 가름선 — 「이 도구가 무엇인가」(왼쪽)와 「지금 무엇을 보고
              있나」(오른쪽)를 나눈다. 제품 이름과 프로젝트 이름이 붙어
              있으면 한 덩어리로 읽혀, 프로젝트가 이름의 일부처럼 보인다. */}
          <span className="app-top-div" aria-hidden="true" />
          <ProjectPicker />
          {/* 무엇을 볼지 — REQ-Coverage 에서만 뜬다(지시). 프로젝트 오른쪽,
              세로선 너머다: 왼쪽은 「어느 프로젝트」, 오른쪽은 「그 안에서
              무엇을」 이다. 다른 화면에서는 뜻이 없어 안 낸다. */}
          {current === 'reqtc' && (
            <>
              <span className="app-top-div" aria-hidden="true" />
              <ReqTcModeToggle />
            </>
          )}
          <span className="sp" />
          {/* 지금 UTOP 을 같이 쓰고 있는 사람(지시) — 어느 화면에 있든 보인다.
              같은 자료를 둘이 고치다 덮어쓰는 일이 잦아, 「지금 누가 들어와
              있나」 는 화면 하나가 아니라 도구 전체의 소식이다. */}
          <PresenceBar users={crowd} me={user?.name || user?.username || ''} />
          {/* 알림 — 왼쪽 메뉴 맨 아래에 있던 것을 여기로 올렸다(지시).
              소식은 어느 화면에 있든 눈에 걸려야 하는데, 메뉴 맨 아래는
              접으면 아이콘만 남고 스크롤 밖으로 밀리기도 했다. */}
          <NotifyBell collapsed />
          {/* 「나」 단추 — 이름만 적혀 있었다(지시: 받은 그림처럼).
              글자만 있으면 누를 수 있는지 몰라, 로그아웃하려면 왼쪽 메뉴 맨
              아래까지 내려가야 했다. */}
          <TopUser
            name={user?.name || user?.username || ''}
            role={user?.role}
            team={String(user?.team ?? '')}
            dept={String(user?.dept ?? '')}
            isAdmin={user?.role === '관리자'}
            onSettings={() => onNavigate?.('settings')}
            onLogout={onLogout}
          />
        </header>
      )}
      <div className="app-body">
        <nav
          className="nav"
          aria-label="주 메뉴"
          onMouseLeave={() => dock && setDockOpen(false)}
        >
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

          {/* 아래쪽 — 내 장비 현황만 남는다.
              계정과 알림은 **상단바 오른쪽**으로 올렸다(지시). 같은 것이 두
              곳에 있으면 어느 쪽이 진짜인지 헷갈리고, 로그아웃하려고 메뉴
              맨 아래까지 내려가야 했다. */}
          <div className="nav-foot">
            <div className="nav-status">
              <TopStatus me={user} />
            </div>

            {/* 독 자동 숨김 — 축소 단추 위 체크박스(지시). 접힌 레일에서는
                글자 자리가 없어 숨긴다 — 아이콘 레일과 독은 어차피 같이 쓸
                조합이 아니다.
                단 독이 켜져 있으면 **늘 세운다** — 접어 둔 채 독을 켰을 때
                이 칸까지 숨으면 독을 끌 길이 화면에 없다. */}
            {(!collapsed || dock) && (
              <label className="nav-dockopt" title="메뉴바를 숨기고, 왼쪽 가장자리에 마우스를 대면 나옵니다">
                <input
                  type="checkbox"
                  checked={dock}
                  onChange={(e) => setDock(e.target.checked)}
                />
                독 자동 숨김
              </label>
            )}

            {/* 접기 — **맨 아래, 사용자 밑**(지시). 위 구석에 있던 것을 내렸다.
                접은 상태에서는 글자가 들어갈 자리가 없어 아이콘만 남고,
                무엇인지는 올렸을 때 말풍선으로 말한다.
                독 숨김이 켜져 있으면 **안 세운다**(승인) — 독에서는 축소가
                무시되므로, 눌러도 아무 일 없는 단추가 된다. */}
            {!dock && (
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
            )}
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
