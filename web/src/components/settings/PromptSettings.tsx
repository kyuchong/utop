import { useEffect, useState } from 'react'
import { apiFetch } from '@/api/client'

/**
 * 용도별 프롬프트 · 쓸 모델.
 *
 * 프롬프트가 코드에 박혀 있었다. 한 글자 고치는 데도 배포를 해야 하는데,
 * 랩에서 쓰는 말은 현장에서 자꾸 바뀐다 — 장비 계열이 늘거나, 부르는
 * 이름이 다르거나, 모델이 자꾸 틀리는 자리가 생기거나. 그때마다 사람이
 * 기다려야 했다.
 *
 * 용도마다 모델도 따로 붙인다. 배선처럼 짧은 일에는 작은 모델을, 절차
 * 만들기에는 큰 모델을 쓰는 편이 빠르고 싸다.
 */

interface Purpose {
  id: string
  label: string
  hint: string
  system: string
  llm: string
  /** 코드가 들고 있는 기본값 — 되돌릴 때 쓴다 */
  default: string
  /** 채팅 화면을 열 때 AI 가 먼저 하는 말 (마크다운) */
  greeting: string
  /** 입력칸에 흐리게 떠 있는 안내 */
  placeholder: string
  /** 눌러서 바로 묻는 추천 질문 */
  asks: string[]
}

interface Llm {
  id?: string
  name?: string
  model?: string
  endpoint?: string
  status?: string
  type?: string
}

export default function PromptSettings() {
  const [items, setItems] = useState<Purpose[]>([])
  const [llms, setLlms] = useState<Llm[]>([])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  /** 열려 있는 탭 — 용도 하나. 세로로 다 펼치니 어디를 고치는지 놓쳤다 */
  const [tab, setTab] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const [a, b] = await Promise.all([apiFetch('/api/llm/purposes'), apiFetch('/api/llms')])
        const j = (await a.json()) as { purposes?: Purpose[] }
        const k = (await b.json()) as { llms?: Llm[] }
        /* 옛 저장본에는 채팅 쪽 값이 없다 — 없으면 빈 것으로 세운다 */
        setItems((j.purposes ?? []).map((x) => ({
          ...x,
          greeting: x.greeting ?? '',
          placeholder: x.placeholder ?? '',
          asks: Array.isArray(x.asks) ? x.asks : [],
        })))
        setLlms(k.llms ?? [])
      } catch {
        setNote('설정을 읽지 못했습니다')
      }
    })()
  }, [])

  const set = (id: string, patch: Partial<Purpose>) =>
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)))

  const save = async () => {
    setBusy(true)
    setNote('')
    try {
      const body = {
        purposes: Object.fromEntries(
          items.map((x) => [
            x.id,
            {
              system: x.system,
              llm: x.llm,
              greeting: x.greeting,
              placeholder: x.placeholder,
              /* 빈 줄은 버린다 — 「＋질문 추가」 를 눌러 놓고 안 적은 것 */
              asks: x.asks.filter((q) => q.trim()),
            },
          ]),
        ),
      }
      const r = await apiFetch('/api/llm/purposes', { method: 'POST', body: JSON.stringify(body) })
      if (!r.ok) throw new Error(String(r.status))
      setNote('저장했습니다')
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="set-pane">
      <div className="set-head">
        <b>용도별 프롬프트</b>
        <span className="muted small">
          AI 에게 무엇을 시킬 때 어떻게 말할지, 그리고 어느 모델을 쓸지 정합니다.
        </span>
        <span className="sp" />
        {note && <span className="muted small">{note}</span>}
        <button className="btn primary" type="button" disabled={busy} onClick={() => void save()}>
          {busy ? '저장 중…' : '저장'}
        </button>
      </div>

      {items.length === 0 ? (
        <div className="empty">불러오는 중…</div>
      ) : (
        <>
          <div className="ps-tabs" role="tablist">
            {items.map((x) => (
              <button
                key={x.id}
                type="button"
                role="tab"
                className={`ps-tab${(tab || items[0]?.id) === x.id ? ' on' : ''}`}
                onClick={() => setTab(x.id)}
              >
                {x.label}
              </button>
            ))}
          </div>
          {items
            .filter((x) => x.id === (tab || items[0]?.id))
            .map((x) => (
          <div className="ps-item ps-two" key={x.id}>
            {/* 왼쪽 — 무엇에 쓰는 것인지와 쓸 모델 */}
            <div className="ps-left">
              <div className="ps-name">
                <b>{x.label}</b>
                <span className="muted small">{x.hint}</span>
              </div>
              <label className="ps-fld">
                <span>사용 LLM</span>
                <select value={x.llm} onChange={(e) => set(x.id, { llm: e.target.value })}>
                  {/* 안 고르면 켜져 있는 것 중 첫 번째를 쓴다 — 모델이 하나뿐인
                      랩에서 매번 고르게 하면 손만 간다 */}
                  <option value="">아무거나 (켜져 있는 첫 번째)</option>
                  {llms.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name || l.model || l.endpoint}
                      {l.status && l.status !== 'active' ? ' (꺼짐)' : ''}
                    </option>
                  ))}
                </select>
              </label>

              {/* 채팅 화면에서 보이는 것 — 프롬프트는 AI 가 읽고, 이 셋은
                  사람이 본다(지시: 붉은 상자). 여는 말·입력칸 안내·추천 질문. */}
              <div className="ps-chat">
                <div className="ps-chat-h">
                  <b>AI 채팅 화면 (이 AI 토글 열 때)</b>
                  <span className="muted small">사람이 보는 자리입니다 — 프롬프트와 달리 화면에 그대로 뜹니다.</span>
                </div>

                <label className="ps-fld">
                  <span>오프닝 멘트 · 마크다운</span>
                  <textarea
                    rows={4}
                    value={x.greeting}
                    placeholder="안녕하세요. 저는 U-TOP 에서 … 관련하여 답변하는 Assistant 입니다."
                    onChange={(e) => set(x.id, { greeting: e.target.value })}
                  />
                </label>

                <label className="ps-fld">
                  <span>입력창 안내</span>
                  <input
                    value={x.placeholder}
                    placeholder="가장 많이 실패한 원인은? 을 입력해 보세요"
                    onChange={(e) => set(x.id, { placeholder: e.target.value })}
                  />
                </label>

                <div className="ps-fld">
                  <span>추천 질문 (클릭형 칩)</span>
                  {x.asks.length === 0 && (
                    <span className="muted small">아직 없습니다. 아래에서 더하세요.</span>
                  )}
                  {x.asks.map((q, i) => (
                    <div className="ps-ask" key={i}>
                      <input
                        value={q}
                        placeholder="눌러서 바로 묻게 할 말"
                        onChange={(e) =>
                          set(x.id, { asks: x.asks.map((v, j) => (j === i ? e.target.value : v)) })
                        }
                      />
                      <button
                        className="btn small"
                        type="button"
                        title="이 질문을 지웁니다"
                        onClick={() => set(x.id, { asks: x.asks.filter((_, j) => j !== i) })}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <div>
                    <button
                      className="btn small"
                      type="button"
                      onClick={() => set(x.id, { asks: [...x.asks, ''] })}
                    >
                      ＋ 질문 추가
                    </button>
                  </div>
                </div>
              </div>
            </div>
            {/* 오른쪽 — 시스템 프롬프트가 주인공이다. 크게. */}
            <div className="ps-right">
              <div className="ps-ph">
                <span>시스템 프롬프트</span>
                <span className="sp" />
                {/* 되돌리기 — 고치다 망가뜨려도 원래대로 돌아갈 길이 있어야
                    사람이 마음 놓고 고친다 */}
                <button
                  className="btn small"
                  type="button"
                  disabled={!x.default || x.system === x.default}
                  title="처음 값으로 되돌립니다"
                  onClick={() => set(x.id, { system: x.default })}
                >
                  ↺ 기본값
                </button>
              </div>
              <textarea
                rows={22}
                value={x.system}
                placeholder="비우면 기본값을 씁니다"
                onChange={(e) => set(x.id, { system: e.target.value })}
              />
            </div>

          </div>
            ))}
        </>
      )}
    </div>
  )
}
