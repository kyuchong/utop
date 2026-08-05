import { useState } from 'react'
import { apiFetch } from '@/api/client'

interface PlanTc {
  tcid: string
  name?: string | null
  req_id?: string | null
}

interface Plan {
  model?: string
  why?: string
  tcs: PlanTc[]
  dropped?: string[]
}

interface Props {
  /** 고른 시험으로 사이클을 만든다 */
  onMake: (model: string, tcs: PlanTc[]) => void
}

/**
 * 말로 시험 시키기.
 *
 * 「E5724RL 시스템 정보 시험해줘」 한 줄이면 되게 하는 자리다.
 *
 * **AI 가 시험을 지어내지 않는다.** 있는 TC 중에서 고르기만 한다. 스텝을
 * 자유롭게 만들게 하면 그럴듯한데 틀린 시험이 나오고, 그건 사람이 검토하는
 * 데 더 오래 걸린다. 고르게 하면 결과가 「이 3건」 이라 눈으로 바로 확인된다.
 *
 * 그리고 **바로 안 돌린다.** 무엇을 돌릴지 보여 주고 사람이 누른다. 말이
 * 잘못 알아들어졌을 때 장비에 명령이 나가 버리면 되돌릴 수가 없다.
 */
export default function AskBar({ onMake }: Props) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [err, setErr] = useState('')

  const ask = async () => {
    if (!text.trim()) return
    setBusy(true)
    setErr('')
    setPlan(null)
    try {
      const r = await apiFetch('/api/nl/plan', {
        method: 'POST',
        body: JSON.stringify({ text: text.trim() }),
      })
      const b = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(b.detail || `찾지 못했습니다 (${r.status})`)
      setPlan(b as Plan)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ask">
      <div className="ask-row">
        <input
          className="ask-in"
          value={text}
          placeholder="말로 시키기 — 예) E5724RL 시스템 정보 시험해줘"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void ask()
          }}
        />
        <button className="btn small" type="button" disabled={busy || !text.trim()} onClick={() => void ask()}>
          {busy ? '찾는 중…' : '찾기'}
        </button>
      </div>

      {err && <div className="ask-err">{err}</div>}

      {plan && (
        <div className="ask-plan">
          <div className="ask-why">
            {plan.why || '이렇게 골랐습니다.'}
            {plan.model && <b> · {plan.model}</b>}
          </div>

          {plan.tcs.length === 0 ? (
            <div className="muted small">맞는 시험을 못 찾았습니다. 다르게 말해 보세요.</div>
          ) : (
            <>
              <ul className="ask-list">
                {plan.tcs.map((t) => (
                  <li key={t.tcid}>
                    {t.name || t.tcid} <i>{t.tcid}</i>
                  </li>
                ))}
              </ul>
              {/* 지어낸 것이 있었다는 사실도 알린다. 조용히 지우면 왜 빠졌는지 모른다 */}
              {(plan.dropped?.length ?? 0) > 0 && (
                <div className="ask-drop">
                  없는 시험 {plan.dropped?.length}건은 뺐습니다 — {plan.dropped?.join(', ')}
                </div>
              )}
              <div className="ask-act">
                {/* 바로 안 돌린다. 잘못 알아들었을 때 장비에 명령이 나가면
                    되돌릴 수가 없다. */}
                <button
                  className="btn primary small"
                  type="button"
                  onClick={() => onMake(plan.model ?? '', plan.tcs)}
                >
                  이 {plan.tcs.length}건으로 사이클 만들기
                </button>
                <button className="btn small" type="button" onClick={() => setPlan(null)}>
                  닫기
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
