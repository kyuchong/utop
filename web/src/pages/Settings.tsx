import { useState } from 'react'
import LlmSettings from '@/components/settings/LlmSettings'
import './Settings.css'

type Section = 'llm' | 'accounts' | 'perms' | 'chat'

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
    label: 'LLM 연결',
    desc: 'Chat · 임베딩 · 리랭커 서버',
    ready: true,
  },
  {
    key: 'chat',
    label: 'Chat 모델별 설정',
    desc: '모델 선택 · 프롬프트 · 온도',
    ready: false,
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
            <div className="muted small">{s.desc}</div>
          </button>
        ))}
      </nav>

      <section className="set-body">
        {sec === 'llm' ? (
          <LlmSettings />
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
