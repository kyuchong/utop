import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import type { TcData, TcSlot, TcStep } from './types'

interface Proposal {
  slots?: TcSlot[]
  steps?: TcStep[]
  summary?: string
  unsure?: string[]
}

interface Grounding {
  devices: number
  prev_steps: number
  docs: number
  embed_ready: boolean
}

interface Props {
  tcid: string
  data: TcData
  onChange: (patch: Partial<TcData>) => void
}

/**
 * 자연어로 시험 만들기.
 *
 * "E6100 rate limit 시험 해줘" 한 줄에서 슬롯과 스텝을 만든다.
 *
 * 만든 것을 바로 넣지 않고 먼저 보여준다. 모델이 만든 명령이 확인 없이
 * 장비로 나가면 안 된다. 그리고 '무엇을 근거로 만들었는지' 를 함께 보여준다 —
 * 근거가 빈약하면 그 결과도 믿을 수 없다는 것을 사람이 알아야 한다.
 */
export default function TcGenerate({ tcid, data, onChange }: Props) {
  const [prompt, setPrompt] = useState('')
  const [prop, setProp] = useState<Proposal | null>(null)
  const [ground, setGround] = useState<Grounding | null>(null)
  const [err, setErr] = useState('')

  const genM = useMutation({
    mutationFn: async () => {
      const r = await apiFetch(`/api/tc/${encodeURIComponent(tcid)}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      })
      const b = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(b.detail || `만들지 못했습니다 (${r.status})`)
      return b as { proposal: Proposal; grounding: Grounding }
    },
    onSuccess: (b) => {
      setProp(b.proposal)
      setGround(b.grounding)
      setErr('')
    },
    onError: (e) => {
      setProp(null)
      setErr(e instanceof Error ? e.message : String(e))
    },
  })

  /** 제안을 지금 TC 에 넣는다. 기존 것을 지우지 않고 뒤에 붙인다. */
  const apply = () => {
    if (!prop) return
    const have = new Set((data.slots ?? []).map((s) => s.key))
    const newSlots = (prop.slots ?? []).filter((s) => !have.has(s.key))
    onChange({
      slots: [...(data.slots ?? []), ...newSlots],
      checks: [
        ...(data.checks ?? []),
        ...(prop.steps ?? []).map((s) => ({ ...s, kind: 'auto' as const })),
      ],
    })
    setProp(null)
  }

  return (
    <div className="tc-card gen-card">
      <div className="tc-card-head">
        <b>자연어로 만들기</b>
        <span className="muted small">한 줄로 적으면 슬롯과 스텝을 만듭니다</span>
      </div>

      <div className="gen-bar">
        <input
          value={prompt}
          placeholder="예) E6100 가입자 포트 rate limit 10M 설정하고 계측기로 확인하는 시험 만들어줘"
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && prompt.trim()) genM.mutate()
          }}
        />
        <button
          className="btn primary"
          type="button"
          disabled={genM.isPending || !prompt.trim()}
          onClick={() => genM.mutate()}
        >
          {genM.isPending ? '만드는 중…' : '만들기'}
        </button>
      </div>

      {err && <div className="form-error">{err}</div>}

      {ground && (
        <div className="gen-ground">
          <span className="muted small">근거</span>
          <span className={`tag ${ground.devices ? '' : 'weak'}`}>장비 {ground.devices}</span>
          <span className={`tag ${ground.prev_steps ? '' : 'weak'}`}>
            기존 명령 {ground.prev_steps}
          </span>
          <span className={`tag ${ground.docs ? '' : 'weak'}`}>문서 {ground.docs}</span>
          {!ground.embed_ready && (
            <span className="muted small">
              · 임베딩 서버가 없어 매뉴얼 근거 없이 만들었습니다
            </span>
          )}
        </div>
      )}

      {prop && (
        <div className="gen-out">
          {prop.summary && <div className="gen-sum">{prop.summary}</div>}

          {(prop.unsure ?? []).length > 0 && (
            <div className="hint">
              <b>확인이 필요합니다</b>
              <ul>
                {prop.unsure!.map((u, i) => (
                  <li key={i}>{u}</li>
                ))}
              </ul>
            </div>
          )}

          {(prop.slots ?? []).length > 0 && (
            <>
              <div className="muted small">슬롯 {prop.slots!.length}개</div>
              <div className="gen-list">
                {prop.slots!.map((s, i) => (
                  <div className="gen-row" key={i}>
                    <b>{s.key}</b>
                    <span>{s.label || '–'}</span>
                    <span className="muted small">
                      {[s.family, s.device_ip, s.protocol].filter(Boolean).join(' · ') || '미정'}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {(prop.steps ?? []).length > 0 && (
            <>
              <div className="muted small">스텝 {prop.steps!.length}개</div>
              <div className="gen-list">
                {prop.steps!.map((s, i) => (
                  <div className="gen-row step" key={i}>
                    <b>{i + 1}</b>
                    <span className="gen-sess">{s.session || '–'}</span>
                    <span className="gen-step">{s.step || ''}</span>
                    <code className={`gen-cmd${s.data ? '' : ' none'}`}>
                      {s.data || '(명령 없음)'}
                    </code>
                    <span className="muted small">{s.criteria || ''}</span>
                    {s.note && <span className="gen-note">{s.note}</span>}
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="gen-actions">
            <button className="btn" type="button" onClick={() => setProp(null)}>
              버리기
            </button>
            <button className="btn primary" type="button" onClick={apply}>
              이 TC 에 넣기
            </button>
          </div>
          <div className="muted small">
            넣어도 바로 저장되지는 않습니다. 확인한 뒤 위의 「저장」 을 누르세요.
          </div>
        </div>
      )}
    </div>
  )
}
