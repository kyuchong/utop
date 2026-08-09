import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/api/client'
import { itemVerdict, verdictClass, verdictLabel, type CycleItemLite } from '@/pages/Cycles'
import './CycleInsight.css'

interface Props {
  /** 'ai' = AI 요약 · 'metrics' = 메트릭스 */
  mode: 'ai' | 'metrics'
  cycleId: string
  title: string
  items: CycleItemLite[]
  onClose: () => void
}

/** 이 회차가 며칠에 걸쳐 돌았나 — 처음과 마지막 실행 시각 */
function span(items: CycleItemLite[]): { first: string; last: string } {
  const ts = items.map((x) => x.executed_at ?? '').filter(Boolean).sort()
  return { first: ts[0] ?? '', last: ts[ts.length - 1] ?? '' }
}

/**
 * 회차 한 건을 놓고 보는 두 가지 — AI 요약과 메트릭스.
 *
 * 둘 다 「이 회차가 어땠나」 를 묻는 것이라 창을 같이 쓴다. 다른 점은
 * 요약은 서버(LLM)가 글로 답하고, 메트릭스는 항목에서 바로 세는 것이다.
 * 메트릭스가 서버를 안 부르는 것이 중요하다 — 회차를 훑는 동안 계속 열고
 * 닫는데 그때마다 물으면 느리다.
 */
export default function CycleInsight({ mode, cycleId, title, items, onClose }: Props) {
  const [busy, setBusy] = useState(false)
  const [text, setText] = useState('')
  const [at, setAt] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose, busy])

  /** 이미 만들어 둔 요약이 있으면 먼저 보여 준다 — 매번 LLM 을 부르지 않게 */
  useEffect(() => {
    if (mode !== 'ai') return
    void (async () => {
      try {
        const r = await apiFetch(`/api/cycle/${encodeURIComponent(cycleId)}`)
        const j = (await r.json()) as { ai_summary?: { text?: string; at?: string } }
        if (j.ai_summary?.text) {
          setText(j.ai_summary.text)
          setAt(j.ai_summary.at ?? '')
        }
      } catch {
        /* 없으면 없는 대로 — 아래 단추로 만든다 */
      }
    })()
  }, [mode, cycleId])

  const make = async () => {
    setBusy(true)
    setErr('')
    try {
      const r = await apiFetch(`/api/cycle/${encodeURIComponent(cycleId)}/summarize`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      const j = (await r.json()) as {
        ok?: boolean
        error?: string
        summary?: { text?: string; at?: string }
      }
      if (!j.ok) throw new Error(j.error || '요약을 만들지 못했습니다')
      setText(j.summary?.text ?? '')
      setAt(j.summary?.at ?? '')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  /** 메트릭스 — 항목에서 바로 센다 */
  const m = useMemo(() => {
    const byVerdict = new Map<string, number>()
    const byAssignee = new Map<string, { all: number; fail: number }>()
    const byType = new Map<string, number>()
    let steps = 0
    let failSteps = 0
    let auto = 0

    for (const it of items) {
      const v = verdictLabel(itemVerdict(it))
      byVerdict.set(v, (byVerdict.get(v) ?? 0) + 1)

      const who = it.assignee || it.executed_by || '(없음)'
      const a = byAssignee.get(who) ?? { all: 0, fail: 0 }
      a.all++
      if (itemVerdict(it) === 'Fail') a.fail++
      byAssignee.set(who, a)

      const st = it.steps ?? []
      steps += st.length
      const manual = st.some((x) => x.manual || x.action === '수동')
      const t = st.length === 0 ? '(스텝 없음)' : manual ? 'Manual' : 'Auto'
      byType.set(t, (byType.get(t) ?? 0) + 1)
      if (!manual && st.length) auto++
      for (const x of st) {
        const r = String(x.result ?? x.status ?? '')
        if (r === 'Fail' || r === '불합격') failSteps++
      }
    }
    const done = items.filter((x) => verdictLabel(itemVerdict(x)) !== '미실행').length
    return {
      byVerdict: [...byVerdict.entries()].sort((a, b) => b[1] - a[1]),
      byAssignee: [...byAssignee.entries()].sort((a, b) => b[1].all - a[1].all),
      byType: [...byType.entries()].sort((a, b) => b[1] - a[1]),
      steps,
      failSteps,
      auto,
      done,
      ...span(items),
    }
  }, [items])

  const pct = items.length ? Math.round((m.done / items.length) * 100) : 0

  return (
    <div className="modal-back" onMouseDown={() => !busy && onClose()}>
      <div
        className="modal cin"
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'ai' ? 'AI 요약' : '메트릭스'}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <b>{mode === 'ai' ? 'AI 요약' : '메트릭스'}</b>
          <span className="muted small">{title}</span>
          <span className="sp" />
          {mode === 'ai' && (
            <button className="btn small" type="button" disabled={busy} onClick={() => void make()}>
              {busy ? '만드는 중…' : text ? '다시 만들기' : '요약 만들기'}
            </button>
          )}
          <button className="modal-x" type="button" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body cin-body">
          {mode === 'ai' ? (
            <>
              {err && <div className="form-error">{err}</div>}
              {at && <div className="muted small">만든 때 {at}</div>}
              {text ? (
                <pre className="cin-text">{text}</pre>
              ) : (
                <div className="empty">
                  아직 요약이 없습니다.
                  <br />
                  <span className="muted small">
                    위 「요약 만들기」 를 누르면 이 회차의 결과를 글로 정리합니다.
                  </span>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="cin-cards">
                <div className="cin-card">
                  <span className="cin-lb">항목</span>
                  <b>{items.length}</b>
                </div>
                <div className="cin-card">
                  <span className="cin-lb">진행</span>
                  <b>{pct}%</b>
                </div>
                <div className="cin-card">
                  <span className="cin-lb">스텝</span>
                  <b>{m.steps}</b>
                </div>
                <div className="cin-card">
                  <span className="cin-lb">깨진 스텝</span>
                  <b className={m.failSteps ? 'no' : ''}>{m.failSteps}</b>
                </div>
              </div>

              <div className="cin-sec">
                <div className="cin-h">결과</div>
                {m.byVerdict.map(([v, n]) => (
                  <div className="cin-row" key={v}>
                    <span className={`cy-v ${verdictClass(v === '미실행' ? '' : (v as never))}`}>
                      {v}
                    </span>
                    <div className="cin-track">
                      <div
                        className={`cin-fill v-${verdictClass(v === '미실행' ? '' : (v as never))}`}
                        style={{ width: `${items.length ? (n / items.length) * 100 : 0}%` }}
                      />
                    </div>
                    <b>{n}</b>
                  </div>
                ))}
              </div>

              <div className="cin-sec">
                <div className="cin-h">담당자별</div>
                {m.byAssignee.map(([who, a]) => (
                  <div className="cin-row" key={who}>
                    <span className="cin-nm">{who}</span>
                    <div className="cin-track">
                      <div
                        className="cin-fill v-pass"
                        style={{ width: `${items.length ? (a.all / items.length) * 100 : 0}%` }}
                      />
                    </div>
                    <b>
                      {a.all}
                      {a.fail > 0 && <span className="no"> · 부적합 {a.fail}</span>}
                    </b>
                  </div>
                ))}
              </div>

              <div className="cin-sec">
                <div className="cin-h">유형별</div>
                {m.byType.map(([t, n]) => (
                  <div className="cin-row" key={t}>
                    <span className="cin-nm">{t}</span>
                    <div className="cin-track">
                      <div
                        className="cin-fill v-wip"
                        style={{ width: `${items.length ? (n / items.length) * 100 : 0}%` }}
                      />
                    </div>
                    <b>{n}</b>
                  </div>
                ))}
              </div>

              {(m.first || m.last) && (
                <div className="cin-sec">
                  <div className="cin-h">실행 기간</div>
                  <div className="muted small">
                    {m.first || '–'} ~ {m.last || '–'}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
