import { useState } from 'react'
import LlmSettings from '@/components/settings/LlmSettings'
import DeviceCatalog from '@/components/settings/DeviceCatalog'
import CodeSettings from '@/components/settings/CodeSettings'
import CustomFieldSettings from '@/components/settings/CustomFieldSettings'
import './Settings.css'

// 'chat' 은 없앴다 — Chat 모델 설정은 'llm' 안의 탭으로 들어갔다.
// 서버 연결과 모델 설정을 따로 두면 같은 모델을 두 군데서 고치게 된다.
type Section = 'llm' | 'accounts' | 'perms' | 'catalog' | 'codes' | 'fields'

/**
 * 설정 화면.
 *
 * 항목이 계속 늘어난다고 하셔서, 좌측에 항목 목록을 두고 오른쪽에서 여는
 * 구조로 잡았다. 새 설정을 넣을 때 SECTIONS 에 한 줄, 컴포넌트 하나만
 * 추가하면 된다 — 화면 구조를 다시 짜지 않는다.
 */
const SECTIONS: Array<{ key: Section; label: string; desc: string; ready: boolean }> = [
  {
    key: 'llm',
    label: 'LLM 설정',
    desc: '',
    ready: true,
  },
  {
    key: 'catalog',
    label: '장비 카탈로그',
    desc: '',
    ready: true,
  },
  {
    key: 'codes',
    label: 'TC INFO 필드',
    desc: 'TC 상세 「기본」 칸의 고를 값',
    ready: true,
  },
  {
    key: 'fields',
    label: '커스텀 필드',
    desc: 'TC · 요구사항에 우리 팀 항목 추가',
    ready: true,
  },
  {
    key: 'accounts',
    label: '계정 관리',
    desc: '사용자 추가 · 권한 · 비활성화',
    ready: false,
  },
  {
    key: 'perms',
    label: '페이지별 접근 권한',
    desc: '역할마다 볼 수 있는 화면',
    ready: false,
  },
]

export default function Settings() {
  const [sec, setSec] = useState<Section>('llm')
  const cur = SECTIONS.find((s) => s.key === sec)!

  return (
    <div className="set-wrap">
      <nav className="set-nav">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            type="button"
            className={`set-nav-item${sec === s.key ? ' on' : ''}`}
            onClick={() => setSec(s.key)}
          >
            <div className="set-nav-label">
              {s.label}
              {!s.ready && <span className="tag">준비 중</span>}
            </div>
            {/* 설명이 없으면 줄 자체를 내지 않는다. 빈 div 를 두면
                그 항목만 높이가 남아 목록이 어긋나 보인다. */}
            {s.desc && <div className="muted small">{s.desc}</div>}
          </button>
        ))}
      </nav>

      <section className="set-body">
        {sec === 'llm' ? (
          <LlmSettings />
        ) : sec === 'catalog' ? (
          <DeviceCatalog />
        ) : sec === 'codes' ? (
          <CodeSettings />
        ) : sec === 'fields' ? (
          <CustomFieldSettings />
        ) : (
          <div className="set-todo">
            <b>{cur.label}</b>
            <p className="muted">
              아직 만들지 않았습니다. {cur.desc}
            </p>
          </div>
        )}
      </section>
    </div>
  )
}
