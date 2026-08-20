import { useEffect, useState, type ComponentType } from 'react'
import LlmSettings from '@/components/settings/LlmSettings'
import PromptSettings from '@/components/settings/PromptSettings'
import DeviceCatalog from '@/components/settings/DeviceCatalog'
import CodeSettings from '@/components/settings/CodeSettings'
import VerdictSettings from '@/components/settings/VerdictSettings'
import CustomFieldSettings from '@/components/settings/CustomFieldSettings'
import JiraSettings from '@/components/settings/JiraSettings'
import JiraPanels from '@/components/settings/JiraPanels'
import Branding from '@/components/settings/Branding'
import {
  IconAccounts,
  IconCodeList,
  IconCustomField,
  IconReqCodeList,
  IconLlm,
  IconPerms,
  IconPlug,
} from '@/components/icons'
import Transfer from '@/pages/Transfer'
import { IconTransfer } from '@/components/icons'
import './Settings.css'

// 'chat' 은 없앴다 — Chat 모델 설정은 'llm' 안의 탭으로 들어갔다.
// 서버 연결과 모델 설정을 따로 두면 같은 모델을 두 군데서 고치게 된다.
type Section = 'verdicts' | 'llm' | 'prompts' | 'accounts' | 'perms' | 'catalog' | 'codes' | 'reqcodes' | 'cyclecodes' | 'fields' | 'jira' | 'jirapanels' | 'branding' | 'export' | 'import'

/**
 * 설정 화면.
 *
 * 항목이 계속 늘어난다고 하셔서, 좌측에 항목 목록을 두고 오른쪽에서 여는
 * 구조로 잡았다. 새 설정을 넣을 때 SECTIONS 에 한 줄, 컴포넌트 하나만
 * 추가하면 된다 — 화면 구조를 다시 짜지 않는다.
 */
interface SecItem {
  key: Section
  label: string
  icon: ComponentType<{ className?: string }>
  ready: boolean
}

/**
 * 설정 항목을 묶는다.
 *
 * 일곱 개가 평평하게 늘어서 있었다. LLM 과 계정 관리와 장비 카탈로그가
 * 한 줄씩 나란히 있으면 무엇을 고치러 왔는지와 상관없이 매번 일곱 줄을
 * 다 읽게 된다. 왼쪽 큰 메뉴와 같은 말(Quality·Resources·Integrations)로
 * 묶어 두면 어디를 볼지 먼저 정하고 들어온다.
 */
const GROUPS: Array<{ title: string; items: SecItem[] }> = [
  {
    title: 'AI',
    items: [
      { key: 'llm', label: 'LLM 설정', icon: IconLlm, ready: true },
      // 프롬프트는 LLM 옆에 둔다 — 모델과 말투는 함께 만지는 것이다
      { key: 'prompts', label: '용도별 프롬프트', icon: IconLlm, ready: true },
    ],
  },
  {
    title: 'Quality',
    items: [
      { key: 'reqcodes', label: '요구사항 INFO 필드', icon: IconReqCodeList, ready: true },
      { key: 'codes', label: 'TC INFO 필드', icon: IconCodeList, ready: true },
      { key: 'cyclecodes', label: '사이클 INFO 필드', icon: IconCodeList, ready: true },
      { key: 'verdicts', label: '실행 판정 기준', icon: IconCodeList, ready: true },
      { key: 'fields', label: '커스텀 필드', icon: IconCustomField, ready: true },
    ],
  },
  {
    title: 'Resources',
    /* 장비 카탈로그는 왼쪽 메뉴 「Catalog」 로 옮겼다(지시) — 장비 곁이
       제자리다. 여기서는 뺀다. */
    items: [],  // 비었다 — 아래에서 걸러 그리지 않는다
  },
  {
    title: 'Integrations',
    items: [
      { key: 'jira', label: 'Jira 연동', icon: IconPlug, ready: true },
      { key: 'jirapanels', label: 'Jira 프로젝트 패널 설정', icon: IconPerms, ready: true },
    ],
  },
  {
    title: 'Account',
    items: [
      { key: 'accounts', label: '계정 관리', icon: IconAccounts, ready: false },
      { key: 'perms', label: '페이지별 접근 권한', icon: IconPerms, ready: false },
    ],
  },
  {
    title: 'Data',
    items: [
      { key: 'export', label: '데이터 내보내기', icon: IconTransfer, ready: true },
      { key: 'import', label: '데이터 가져오기', icon: IconTransfer, ready: true },
    ],
  },
  {
    title: 'System',
    items: [{ key: 'branding', label: '브랜딩 (로고·이름)', icon: IconCustomField, ready: true }],
  },
]

const SECTIONS: SecItem[] = GROUPS.flatMap((g) => g.items)

export default function Settings() {
  // 보던 항목을 기억한다 — 새로고침할 때마다 LLM 으로 돌아가면
  // 카탈로그를 고치던 사람이 매번 다시 찾아 들어가야 한다(겪었다)
  const [sec, setSec] = useState<Section>(() => {
    const saved = localStorage.getItem('utop.set.sec')
    return SECTIONS.some((x) => x.key === saved) ? (saved as Section) : 'llm'
  })
  useEffect(() => {
    localStorage.setItem('utop.set.sec', sec)
  }, [sec])
  const cur = SECTIONS.find((s) => s.key === sec)!

  return (
    <div className="set-wrap">
      <nav className="set-nav">
        {GROUPS.filter((g) => g.items.length > 0).map((g) => (
          <div key={g.title} className="set-nav-grp">
            <div className="set-nav-grpt">{g.title}</div>
            {g.items.map((s) => (
              <button
                key={s.key}
                type="button"
                className={`set-nav-item${sec === s.key ? ' on' : ''}`}
                onClick={() => setSec(s.key)}
              >
                <s.icon className="set-nav-icon" />
                <div className="set-nav-label">
                  {s.label}
                  {!s.ready && <span className="tag">준비 중</span>}
                </div>
              </button>
            ))}
          </div>
        ))}
      </nav>

      <section className="set-body">
        {sec === 'llm' ? (
          <LlmSettings />
        ) : sec === 'prompts' ? (
          <PromptSettings />
        ) : sec === 'catalog' ? (
          /* 옛 주소로 들어오면 그대로 열어 준다 — 메뉴에서만 뺐다 */
          <DeviceCatalog />
        ) : sec === 'codes' ? (
          <CodeSettings target="tc" />
        ) : sec === 'reqcodes' ? (
          <CodeSettings target="req" />
        ) : sec === 'cyclecodes' ? (
          <CodeSettings target="cycle" />
        ) : sec === 'verdicts' ? (
          <VerdictSettings />
        ) : sec === 'fields' ? (
          <CustomFieldSettings />
        ) : sec === 'jira' ? (
          <JiraSettings />
        ) : sec === 'jirapanels' ? (
          <JiraPanels />
        ) : sec === 'branding' ? (
          <Branding />
        ) : sec === 'export' ? (
          <Transfer mode="export" />
        ) : sec === 'import' ? (
          <Transfer mode="import" />
        ) : (
          <div className="set-todo">
            <b>{cur.label}</b>
            <p className="muted">아직 만들지 않았습니다.</p>
          </div>
        )}
      </section>
    </div>
  )
}
