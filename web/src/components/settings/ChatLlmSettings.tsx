import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/api/client'

/**
 * LLM 하나. 서버의 LLMCreate(main.py) 와 키가 같아야 한다 —
 * PUT 이 model_dump() 로 통째로 덮어쓰기 때문에, 여기서 빠뜨린 키는
 * 저장할 때마다 기본값으로 되돌아간다.
 */
export interface Llm {
  id?: string
  name: string
  type: string
  endpoint: string
  model: string
  apikey: string
  max_tokens: number
  context_size: number
  temperature: number
  completion_mode: string
  top_p: number | null
  top_k: number | null
  presence_penalty: number | null
  frequency_penalty: number | null
  compat_mode: string
  thinking_mode: string
  function_call_type: string
  stream_function_call: string
  vision_support: string
  structured_output: string
  stream_mode_auth: string
  stream_delimiter: string
  system_prompt: string
  greeting: string
  placeholder: string
  uses: string[]
  status: string
  field_prompts: Record<string, unknown>
  kb_group: string
}

const BLANK: Llm = {
  name: '',
  type: 'vllm',
  endpoint: '',
  model: '',
  apikey: '',
  max_tokens: 4096,
  context_size: 262144,
  temperature: 0.7,
  completion_mode: 'chat',
  top_p: null,
  top_k: null,
  presence_penalty: null,
  frequency_penalty: null,
  compat_mode: 'vllm',
  thinking_mode: 'none',
  function_call_type: 'not_support',
  stream_function_call: 'not_support',
  vision_support: 'not_support',
  structured_output: 'not_support',
  stream_mode_auth: 'not_use',
  stream_delimiter: '\\n\\n',
  system_prompt: '',
  greeting: '',
  placeholder: '',
  uses: [],
  status: 'active',
  field_prompts: {},
  kb_group: '',
}

/** 고를 값. 서버는 문자열을 그대로 받으므로 화면에서만 정한다. */
const TYPES: Array<[string, string]> = [
  ['vllm', '로컬 LLM (vLLM)'],
  ['openai', 'OpenAI 호환'],
  ['anthropic', 'Anthropic'],
  ['custom', '기타'],
]
const SUPPORT: Array<[string, string]> = [
  ['support', 'Support'],
  ['not_support', 'Not Support'],
]
const KB_GROUPS: Array<[string, string]> = [
  ['', '노출 안 함'],
  ['general', '일반 검색'],
  ['kb', '지식 검색'],
  ['jira', 'Jira'],
  ['external', '외부'],
]

/**
 * Chat LLM 관리.
 *
 * 답변을 만드는 모델을 여기에 등록한다. 여러 개를 두는 이유는 화면마다
 * 쓰는 모델이 다르기 때문이다 — TC 생성은 긴 문맥이 필요하고, 요약은
 * 싸고 빠른 것이 낫다.
 *
 * 왼쪽이 목록, 오른쪽이 그 하나의 설정이다. 한 화면에 다 펼치면 모델
 * 다섯 개만 되어도 무엇을 고치고 있는지 놓친다.
 */
export default function ChatLlmSettings() {
  const [llms, setLlms] = useState<Llm[]>([])
  const [sel, setSel] = useState<string>('')
  const [draft, setDraft] = useState<Llm | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ kind: string; msg: string }>({ kind: '', msg: '' })
  const [probe, setProbe] = useState('')

  const load = async (keepId?: string) => {
    try {
      /*
       * **캐시를 건너뛴다.**
       *
       * 저장하자마자 목록을 다시 읽는데, 브라우저가 30초 묵은 응답을 그대로
       * 돌려주어 방금 고친 이름이 옛 이름으로 되돌아 보였다(지적). 서버에서도
       * 이 경로의 캐시를 걷었지만, 이미 브라우저에 남은 것까지 지나치려면
       * 여기서도 말해 줘야 한다.
       */
      const r = await apiFetch('/api/llms', { cache: 'no-store' })
      if (!r.ok) throw new Error('목록을 불러오지 못했습니다')
      const b = (await r.json()) as { llms?: Llm[] }
      const list = b.llms ?? []
      setLlms(list)
      const want = keepId ?? sel
      const found = list.find((l) => l.id === want) ?? list[0]
      setSel(found?.id ?? '')
      setDraft(found ? { ...BLANK, ...found } : null)
    } catch (e) {
      setNote({ kind: 'err', msg: e instanceof Error ? e.message : String(e) })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // 첫 로드만. sel 이 바뀔 때마다 다시 부르면 고치던 내용이 날아간다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dirty = useMemo(() => {
    if (!draft) return false
    const cur = llms.find((l) => l.id === draft.id)
    if (!cur) return true
    return JSON.stringify({ ...BLANK, ...cur }) !== JSON.stringify(draft)
  }, [draft, llms])

  const set = <K extends keyof Llm>(k: K, v: Llm[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d))

  /**
   * 공급자를 고르면 **그 공급자의 기본값을 채운다.**
   *
   * Anthropic 을 골라 놓고도 엔드포인트·모델·호환 모드를 손으로 다 적어야
   * 했다 — 정답이 하나뿐인 칸들이다. 키만 넣으면 되게 채워 준다.
   * 이미 그 공급자의 값이면(사람이 고쳐 둔 것이면) 안 덮는다.
   */
  const setType = (t: string) =>
    setDraft((d) => {
      if (!d) return d
      if (t === 'anthropic') {
        const fresh = !d.endpoint || !d.endpoint.includes('anthropic.com')
        return {
          ...d,
          type: t,
          compat_mode: 'anthropic',
          ...(fresh
            ? {
                endpoint: 'https://api.anthropic.com',
                model: 'claude-sonnet-5',
                context_size: 200000,
                max_tokens: 8192,
                completion_mode: 'chat',
                vision_support: 'support',
                structured_output: 'support',
              }
            : {}),
        }
      }
      return { ...d, type: t }
    })

  const pick = (l: Llm) => {
    if (dirty && !window.confirm('저장하지 않은 변경이 있습니다. 옮길까요?')) return
    setSel(l.id ?? '')
    setDraft({ ...BLANK, ...l })
    setProbe('')
    setNote({ kind: '', msg: '' })
  }

  const save = async () => {
    if (!draft) return
    if (!draft.name.trim()) {
      setNote({ kind: 'err', msg: '이름을 입력하세요' })
      return
    }
    if (!draft.endpoint.trim()) {
      setNote({ kind: 'err', msg: '엔드포인트를 입력하세요' })
      return
    }
    setBusy(true)
    setNote({ kind: '', msg: '' })
    try {
      // 새로 만들 때는 POST, 이미 있으면 PUT. 서버가 id 를 붙여 준다.
      const isNew = !draft.id
      const r = await apiFetch(isNew ? '/api/llms' : `/api/llms/${draft.id}`, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, id: undefined }),
      })
      const b = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(b.detail || '저장하지 못했습니다')
      setNote({ kind: 'ok', msg: '저장했습니다' })
      await load(isNew ? b.llm?.id : draft.id)
    } catch (e) {
      setNote({ kind: 'err', msg: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  /**
   * 연결 테스트. 저장된 설정으로 서버가 검사하므로 먼저 저장한다 —
   * 안 그러면 방금 고친 주소가 아니라 예전 주소를 확인하게 된다.
   */
  const test = async () => {
    if (!draft?.id) {
      setProbe('먼저 저장하세요')
      return
    }
    setBusy(true)
    setProbe('저장하고 확인하는 중…')
    try {
      if (dirty) await save()
      const r = await apiFetch(`/api/llms/${draft.id}/test`, { method: 'POST' })
      const b = await r.json().catch(() => ({}))
      setProbe(b.detail || (b.ok ? '연결됨' : '실패'))
    } catch (e) {
      setProbe(e instanceof Error ? e.message : '확인하지 못했습니다')
    } finally {
      setBusy(false)
    }
  }

  const copy = () => {
    if (!draft) return
    // id 를 떼면 저장할 때 새로 만들어진다. 비슷한 설정을 하나 더 만들 때
    // 20개 넘는 칸을 다시 채우지 않아도 된다.
    setDraft({ ...draft, id: undefined, name: `${draft.name} 복사` })
    setSel('')
    setNote({ kind: '', msg: '저장을 누르면 새로 만들어집니다' })
  }

  const remove = async () => {
    if (!draft?.id) return
    if (!window.confirm(`'${draft.name}' 을 지웁니다. 계속할까요?`)) return
    setBusy(true)
    try {
      const r = await apiFetch(`/api/llms/${draft.id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('지우지 못했습니다')
      setNote({ kind: 'ok', msg: '지웠습니다' })
      setSel('')
      await load('')
    } catch (e) {
      setNote({ kind: 'err', msg: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  /** 숫자 칸. 비우면 null 로 둔다 — 0 과 '안 정함' 은 다르다. */
  const num = (v: number | null) => (v === null || v === undefined ? '' : String(v))
  const toNum = (s: string): number | null => (s.trim() === '' ? null : Number(s))

  if (loading) return <div className="empty">불러오는 중…</div>

  return (
    <div className="llm-wrap">
      <aside className="llm-list">
        <div className="llm-list-head">
          <b>LLM 목록</b>
          <button
            className="btn small primary"
            type="button"
            onClick={() => {
              setDraft({ ...BLANK })
              setSel('')
              setProbe('')
              setNote({ kind: '', msg: '' })
            }}
          >
            + 추가
          </button>
        </div>
        {llms.length === 0 ? (
          <div className="empty">
            아직 없습니다.
            <br />
            <span className="muted small">「+ 추가」로 등록하세요.</span>
          </div>
        ) : (
          llms.map((l) => (
            <button
              key={l.id}
              type="button"
              className={`llm-item${sel === l.id ? ' on' : ''}`}
              onClick={() => pick(l)}
            >
              <span className={`llm-dot ${l.status === 'active' ? 'on' : ''}`} />
              <span className="llm-item-text">
                <b>{l.name || '(이름 없음)'}</b>
                <span className="muted small">{l.model}</span>
              </span>
            </button>
          ))
        )}
      </aside>

      <div className="llm-detail">
        {!draft ? (
          <div className="empty">왼쪽에서 LLM 을 고르거나 「+ 추가」를 누르세요.</div>
        ) : (
          <>
            <div className="llm-detail-head">
              <input
                className="llm-title"
                value={draft.name}
                placeholder="이름 (예: Gemma4)"
                onChange={(e) => set('name', e.target.value)}
              />
              <select value={draft.type} onChange={(e) => setType(e.target.value)}>
                {TYPES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <select value={draft.status} onChange={(e) => set('status', e.target.value)}>
                <option value="active">활성</option>
                <option value="inactive">비활성</option>
              </select>
            </div>

            {note.msg && <div className={`set-note ${note.kind}`}>{note.msg}</div>}

            <div className="llm-cols">
              <section className="set-card">
                <div className="set-card-head">
                  <b>연결 정보</b>
                </div>
                <label className="fld">
                  <span>엔드포인트</span>
                  <input
                    value={draft.endpoint}
                    placeholder="http://10.10.30.219:4821/v1"
                    onChange={(e) => set('endpoint', e.target.value)}
                  />
                </label>
                <label className="fld">
                  <span>모델명</span>
                  <input
                    value={draft.model}
                    placeholder="gemma-4-31b-it"
                    onChange={(e) => set('model', e.target.value)}
                  />
                </label>
                <label className="fld">
                  <span>API Key</span>
                  <input
                    type="password"
                    value={draft.apikey}
                    placeholder="없으면 비워 둡니다"
                    onChange={(e) => set('apikey', e.target.value)}
                  />
                </label>
                <label className="fld">
                  <span>지식 검색 노출</span>
                  <select value={draft.kb_group} onChange={(e) => set('kb_group', e.target.value)}>
                    {KB_GROUPS.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
              </section>

              <section className="set-card">
                <div className="set-card-head">
                  <b>파라미터</b>
                </div>
                <label className="fld">
                  <span>Completion Mode</span>
                  <select
                    value={draft.completion_mode}
                    onChange={(e) => set('completion_mode', e.target.value)}
                  >
                    <option value="chat">Chat</option>
                    <option value="completion">Completion</option>
                  </select>
                </label>
                <label className="fld">
                  <span>Max Tokens</span>
                  <input
                    type="number"
                    value={draft.max_tokens}
                    onChange={(e) => set('max_tokens', Number(e.target.value))}
                  />
                </label>
                <label className="fld">
                  <span>Context Size</span>
                  <input
                    type="number"
                    value={draft.context_size}
                    onChange={(e) => set('context_size', Number(e.target.value))}
                  />
                </label>
                <label className="fld">
                  <span>Temperature</span>
                  <input
                    type="number"
                    step="0.1"
                    value={draft.temperature}
                    onChange={(e) => set('temperature', Number(e.target.value))}
                  />
                </label>
                <label className="fld">
                  <span>Top P</span>
                  <input
                    type="number"
                    step="0.05"
                    value={num(draft.top_p)}
                    placeholder="0.0 ~ 1.0 (비우면 기본값)"
                    onChange={(e) => set('top_p', toNum(e.target.value))}
                  />
                </label>
                <label className="fld">
                  <span>Top K</span>
                  <input
                    type="number"
                    value={num(draft.top_k)}
                    placeholder="예: 50 (비우면 기본값)"
                    onChange={(e) => set('top_k', toNum(e.target.value))}
                  />
                </label>
                <label className="fld">
                  <span>Presence Penalty</span>
                  <input
                    type="number"
                    step="0.1"
                    value={num(draft.presence_penalty)}
                    placeholder="-2.0 ~ 2.0"
                    onChange={(e) => set('presence_penalty', toNum(e.target.value))}
                  />
                </label>
                <label className="fld">
                  <span>Frequency Penalty</span>
                  <input
                    type="number"
                    step="0.1"
                    value={num(draft.frequency_penalty)}
                    placeholder="-2.0 ~ 2.0"
                    onChange={(e) => set('frequency_penalty', toNum(e.target.value))}
                  />
                </label>
              </section>

              <section className="set-card">
                <div className="set-card-head">
                  <b>고급 옵션</b>
                </div>
                <label className="fld">
                  <span>Compatibility Mode</span>
                  <select
                    value={draft.compat_mode}
                    onChange={(e) => set('compat_mode', e.target.value)}
                  >
                    <option value="vllm">vLLM</option>
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                  </select>
                </label>
                <label className="fld">
                  <span>Thinking Mode</span>
                  <select
                    value={draft.thinking_mode}
                    onChange={(e) => set('thinking_mode', e.target.value)}
                  >
                    <option value="none">None</option>
                    <option value="both">Both</option>
                    <option value="think">Think</option>
                  </select>
                </label>
                <label className="fld">
                  <span>Function Call</span>
                  <select
                    value={draft.function_call_type}
                    onChange={(e) => set('function_call_type', e.target.value)}
                  >
                    <option value="not_support">Not Support</option>
                    <option value="function_call">Function Call</option>
                    <option value="tool_call">Tool Call</option>
                  </select>
                </label>
                {([
                  ['stream_function_call', 'Stream Function Call'],
                  ['vision_support', 'Vision Support'],
                  ['structured_output', 'Structured Output'],
                ] as const).map(([k, label]) => (
                  <label className="fld" key={k}>
                    <span>{label}</span>
                    <select value={draft[k]} onChange={(e) => set(k, e.target.value)}>
                      {SUPPORT.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
                <label className="fld">
                  <span>Stream Mode Auth</span>
                  <select
                    value={draft.stream_mode_auth}
                    onChange={(e) => set('stream_mode_auth', e.target.value)}
                  >
                    <option value="not_use">Not Use</option>
                    <option value="use">Use</option>
                  </select>
                </label>
                <label className="fld">
                  <span>Stream Delimiter</span>
                  <input
                    value={draft.stream_delimiter}
                    onChange={(e) => set('stream_delimiter', e.target.value)}
                  />
                </label>
              </section>
            </div>

            <div className="llm-foot">
              <span className="muted small">{probe}</span>
              <button className="btn" type="button" onClick={() => void test()} disabled={busy}>
                연결 테스트
              </button>
              <button className="btn" type="button" onClick={copy} disabled={busy || !draft.id}>
                복사
              </button>
              <button
                className="btn danger"
                type="button"
                onClick={() => void remove()}
                disabled={busy || !draft.id}
              >
                삭제
              </button>
              <button
                className="btn primary"
                type="button"
                onClick={() => void save()}
                disabled={busy || !dirty}
              >
                {busy ? '저장 중…' : dirty ? '저장' : '저장됨'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
