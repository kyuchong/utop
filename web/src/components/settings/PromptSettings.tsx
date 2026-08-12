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
  /** 열려 있는 탭 — 용도 하나 */
  const [tab, setTab] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const [a, b] = await Promise.all([apiFetch('/api/llm/purposes'), apiFetch('/api/llms')])
        const j = (await a.json()) as { purposes?: Purpose[] }
        const k = (await b.json()) as { llms?: Llm[] }
        setItems(j.purposes ?? [])
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
        purposes: Object.fromEntries(items.map((x) => [x.id, { system: x.system, llm: x.llm }])),
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
          {/* 용도마다 탭 하나. 세로로 다 펼쳐 놓으니 스크롤이 길어져
              어느 용도를 고치고 있는지 놓쳤다 — 한 번에 하나만 본다. */}
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
          <div className="ps-item" key={x.id}>
            <div className="ps-h">
              <b>{x.label}</b>
              <span className="muted small">{x.hint}</span>
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
                기본값으로
              </button>
            </div>
            <label className="ps-row">
              <span>쓸 모델</span>
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
            <label className="ps-row ps-tall">
              <span>이렇게 말한다</span>
              <textarea
                rows={8}
                value={x.system}
                placeholder="비우면 기본값을 씁니다"
                onChange={(e) => set(x.id, { system: e.target.value })}
              />
            </label>
          </div>
            ))}
        </>
      )}
    </div>
  )
}
