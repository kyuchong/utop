import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import LlmPick, { useLlmPick } from '@/components/LlmPick'
import type { TcData, TcStep } from './types'

interface Proposal {
  slots?: Array<{ key?: string; label?: string; family?: string; device_ip?: string }>
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
  /** 걸린 요구사항의 구현의도(Intent). 요구사항이 없으면 빈 글 */
  intent: string
  onChange: (patch: Partial<TcData>) => void
}

/**
 * 요구사항 구현의도 + 시험 목적 → 스텝 제안.
 *
 * 「스텝을 보고 목적 쓰기」(TcEnv)의 반대 방향이자 본류다 — 시험은
 * 요구사항을 검증하려고 있는 것이라, 스텝이 무엇이어야 하는지는 구현의도와
 * 목적이 정한다.
 *
 * 재료(구현의도·목적)가 둘 다 비어 있으면 만들지 않는다. 모델이 지어낸
 * 스텝은 확인 없이 장비로 나갈 수 있는 글이 아니다 — 그래서 여기서
 * 경고하고 단추를 끈다.
 */
export default function TcSuggest({ tcid, data, intent, onChange }: Props) {
  /** 스텝 설계를 누구에게 맡길지(지시) */
  const [llm, setLlm] = useLlmPick('automation')
  const [prop, setProp] = useState<Proposal | null>(null)
  const [ground, setGround] = useState<Grounding | null>(null)
  const [err, setErr] = useState('')

  const obj = String(data.object_md ?? '').trim()
  const ready = Boolean(intent.trim() || obj)

  const genM = useMutation({
    mutationFn: async () => {
      const r = await apiFetch(`/api/tc/${encodeURIComponent(tcid)}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 프롬프트를 안 보낸다 — 서버가 요구사항 구현의도와 시험 목적으로
        // 만든다. 저장 안 한 목적으로도 만들 수 있게 tc 를 실어 보낸다.
        body: JSON.stringify({ tc: data, llm }),
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

  /**
   * 제안을 지금 TC 뒤에 붙인다. 기존 스텝은 건드리지 않는다.
   *
   * 모델의 session 은 's1'·'s2' 인데 이 화면의 스텝은 `sessions` 배열
   * 인덱스를 쓴다 — s1→0 으로 바꿔 넣는다. 어느 장비가 그 자리인지는
   * 사람이 세션 띠에서 정한다.
   */
  const apply = () => {
    if (!prop) return
    const sessAt = new Map((prop.slots ?? []).map((s, i) => [String(s.key || ''), i]))
    onChange({
      checks: [
        ...((data.checks ?? []) as TcStep[]),
        ...(prop.steps ?? []).map((s) => ({
          ...s,
          kind: 'auto' as const,
          session: sessAt.get(String(s.session ?? '')) ?? 0,
        })),
      ],
    })
    setProp(null)
  }

  return (
    <div className="tc-card gen-card">
      <div className="tc-card-head">
        <b>요구사항으로 만들기</b>
        <span className="muted small">구현의도와 시험 목적을 읽고 스텝을 설계합니다</span>
        <span className="sp" />
        <LlmPick value={llm} onChange={setLlm} />
        <button
          className="btn small"
          type="button"
          disabled={genM.isPending || !ready}
          title={
            ready
              ? '요구사항 구현의도와 시험 목적을 읽고 스텝을 제안합니다'
              : '구현의도(요구사항 Intent)나 시험 목적(Object 탭)이 있어야 만들 수 있습니다'
          }
          onClick={() => genM.mutate()}
        >
          {genM.isPending ? '설계 중…' : '✨ 스텝 설계'}
        </button>
      </div>

      {/* 재료가 없으면 왜 못 만드는지 그 자리에서 말한다 — 꺼진 단추만
          있으면 고장으로 읽힌다 */}
      {!ready && (
        <div className="hint">
          <b>아직 만들 수 없습니다</b> — 요구사항의 <b>Intent(구현의도)</b>와 이 시험의{' '}
          <b>Object 탭(시험 목적)</b>이 모두 비어 있습니다. 둘 중 하나는 있어야 AI 가
          무엇을 검증할지 알 수 있습니다.
        </div>
      )}

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
            <span className="muted small">· 임베딩 서버가 없어 매뉴얼 근거 없이 만들었습니다</span>
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

          {(prop.steps ?? []).length > 0 && (
            <>
              <div className="muted small">스텝 {prop.steps!.length}개</div>
              <div className="gen-list">
                {prop.steps!.map((s, i) => (
                  <div className="gen-row step" key={i}>
                    <b>{i + 1}</b>
                    <span className="gen-sess">{String(s.session ?? '') || '–'}</span>
                    <span className="gen-step">{s.step || ''}</span>
                    <code className={`gen-cmd${s.data ? '' : ' none'}`}>
                      {s.data || '(명령 없음)'}
                    </code>
                    <span className="muted small">{s.criteria || ''}</span>
                    {s.note != null && s.note !== '' && (
                      <span className="gen-note">{String(s.note)}</span>
                    )}
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
              스텝에 넣기
            </button>
          </div>
          <div className="muted small">
            넣어도 바로 저장되지는 않습니다 — 스텝을 확인한 뒤 「저장」 을 누르세요.
          </div>
        </div>
      )}
    </div>
  )
}
