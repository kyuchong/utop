import { useRef, useState } from 'react'
import { apiFetch } from '@/api/client'
import { runSteps } from '@/components/tc/runner'
import type { TcStep } from '@/components/tc/types'
import type { Device } from '@/pages/Devices'

interface DraftStep {
  desc: string
  cli: string
  type?: string
  criteria?: string
  /** cli(기본) · wait(기다리기) · loop(되풀이) */
  kind?: string
  /** 장비가 둘 이상일 때 몇 번째 것으로 보낼까 (0부터) */
  session?: number
  loopCount?: number
  waitSec?: number
}

interface Draft {
  name: string
  object?: string
  device_ip?: string
  /** 장비가 둘 이상인 시험 — 차례가 곧 session 번호다 */
  device_ips?: string[]
  steps: DraftStep[]
  cut?: string[]
  allow_config?: boolean
}


/** 제안 하나 — 눌러서 그대로 판정기준이 된다 */
interface Suggest {
  label: string
  type: string
  criteria: string
}

/**
 * 받은 출력에서 판정기준을 **제안**한다.
 *
 * 누구나 쓰는 도구인데 판정기준은 기술자만 안다 — 이것이 학습 곡선의
 * 본체다. `contains` 가 뭔지, 무슨 문구를 적어야 하는지 알아야 하니까.
 *
 * 그래서 사람에게 묻지 않고 **출력을 보고 만들어 준다.** 장비 출력은
 * 대개 `항목 : 값` 꼴이라 그대로 판정이 된다.
 *
 *     Model Name : E5010-24C   →  「모델명이 E5010-24C 인가」
 *     Main Memory Size : 1 GB  →  「메모리가 1 GB 인가」
 *
 * AI 를 부르지 않는다. 즉시 뜨고, 늘 같은 답을 내고, 틀려도 눈에 보인다.
 */
function suggest(output: string): Suggest[] {
  const out: Suggest[] = []
  const seen = new Set<string>()
  for (const raw of String(output ?? '').split(/\r?\n/)) {
    const line = raw.trim()
    // `항목 : 값` — 콜론 앞뒤에 글자가 있어야 한다
    const m = /^([A-Za-z][A-Za-z0-9 _./#-]{2,30}?)\s*:\s*(\S.*)$/.exec(line)
    if (!m) continue
    const key = (m[1] ?? '').trim()
    const val = (m[2] ?? '').trim()
    // 시각·프롬프트처럼 돌 때마다 바뀌는 것은 기준이 될 수 없다
    if (!val || val.length > 40) continue
    if (/^\d{1,2}:\d{2}/.test(val) || /\b(19|20)\d\d\b/.test(val)) continue
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ label: `${key} 가 ${val}`, type: 'contains', criteria: val })
    if (out.length >= 6) break
  }
  return out
}

interface Props {
  devices: Device[]
}

/**
 * 말로 시험 만들기.
 *
 * 있는 시험을 찾아 주는 것이 아니라, 있는 것을 **참고해서 새 시험을 짜고
 * 돌리고 결과를 알려 준다.**
 *
 * 1차는 **조회 시험만** 짓는다. 설정을 바꾸는 명령을 AI 가 지어내 장비로
 * 보내면 되돌릴 수가 없다. 조회는 틀려도 「출력이 없다」 로 끝난다.
 * 서버가 한 번 더 거르고, 잘린 것이 있으면 무엇을 왜 뺐는지 알려 준다.
 *
 * 그리고 **초안을 보여 주고 사람이 누른다.** 말이 잘못 알아들어졌을 때
 * 명령이 그대로 나가면 안 된다.
 */
export default function AskBar({ devices }: Props) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  /**
   * 설정 명령을 쓰는 시험을 만들까.
   *
   * 기본은 꺼짐이다. 켜면 configure terminal · interface · shutdown ·
   * no shutdown 까지 지을 수 있다 — 링크를 내렸다 올리는 시험이 그것이다.
   * reload·write·copy·erase 는 켜도 못 지나간다.
   */
  const [allowConfig, setAllowConfig] = useState(false)
  const [devId, setDevId] = useState('')
  const [err, setErr] = useState('')
  /** 돌린 결과 — 스텝마다 판정과 출력 */
  const [ran, setRan] = useState<TcStep[] | null>(null)
  const [at, setAt] = useState(-1)
  const [running, setRunning] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  /** 출력에서 끌어 놓은 글자 — 판정기준으로 삼는다 */
  const [grab, setGrab] = useState<{ i: number; text: string } | null>(null)

  const usable = devices.filter((d) => d.role !== '계측기')

  const ask = async () => {
    if (!text.trim()) return
    setBusy(true)
    setErr('')
    setDraft(null)
    try {
      const r = await apiFetch('/api/nl/tc', {
        method: 'POST',
        body: JSON.stringify({ text: text.trim(), allow_config: allowConfig }),
      })
      const b = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(b.detail || `만들지 못했습니다 (${r.status})`)
      const d = b as Draft
      setDraft(d)
      // AI 가 짚은 장비를 먼저 고르되, 없으면 첫 장비
      const hit = usable.find((x) => x.ip === d.device_ip)
      setDevId(hit?.id ?? usable[0]?.id ?? '')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  /**
   * 만든 시험을 그 자리에서 돌린다.
   *
   * TC 화면·사이클과 같은 실행기(`runSteps`)를 쓴다. 판정 규칙이 한 곳에만
   * 있어야 여기서 적합인 것이 저기서 부적합이 되지 않는다.
   *
   * 저장하지 않고 돌린다 — 말로 시켜 본 것이 다 시험으로 남으면 목록이
   * 금세 쓰레기가 된다. 쓸 만하면 그때 저장한다.
   */
  const run = async () => {
    if (!draft || !devId) return
    const ac = new AbortController()
    abortRef.current = ac
    // 초안의 종류를 그대로 살린다 — loop·wait 를 cli 로 뭉개면 되풀이가 사라진다
    const steps: TcStep[] = draft.steps.map((s) => {
      const k = (s.kind || 'cli') as TcStep['kind']
      if (k === 'loop')
        return { kind: 'loop', indent: 0, desc: s.desc, loopCount: s.loopCount ?? 1 } as TcStep
      if (k === 'wait')
        return { kind: 'wait', indent: 0, desc: s.desc, waitSec: s.waitSec ?? 1 } as TcStep
      return {
        kind: 'cli',
        indent: 0,
        session: s.session ?? 0,
        desc: s.desc,
        cli: s.cli,
        type: s.type || 'contains',
        criteria: s.criteria || '',
      } as TcStep
    })
    setRan(steps.slice())
    setRunning(true)
    setAt(-1)
    try {
      await runSteps(
        {
          steps,
          sessions: [devId],
          devById: new Map(devices.map((d) => [d.id, d])),
          onStep: (i, patch) => {
            const cur = steps[i]
            if (!cur) return
            steps[i] = { ...cur, ...patch }
            setRan(steps.slice())
          },
          onAt: setAt,
          onLog: () => {},
          signal: ac.signal,
        },
        0,
        false,
      )
    } finally {
      setRunning(false)
      setAt(-1)
    }
  }

  /** 쓸 만하면 진짜 시험으로 남긴다 */
  const save = async () => {
    if (!draft) return
    const tcid = window.prompt('시험 ID', `NL-${Date.now().toString().slice(-8)}`)
    if (!tcid?.trim()) return
    try {
      const r = await apiFetch(`/api/tc/${encodeURIComponent(tcid.trim())}`, {
        method: 'POST',
        body: JSON.stringify({
          tcid: tcid.trim(),
          name: draft.name,
          object_md: draft.object ?? '',
          sessions: [devId],
          checks: (ran ?? []).map((s) => ({ ...s })),
        }),
      })
      if (!r.ok) throw new Error(String(r.status))
      window.alert(`「${draft.name}」 을 시험으로 저장했습니다.`)
    } catch {
      window.alert('저장하지 못했습니다')
    }
  }

  const setStep = (i: number, patch: Partial<DraftStep>) =>
    setDraft((d) =>
      d ? { ...d, steps: d.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) } : d,
    )

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
        <button
          className="btn small"
          type="button"
          disabled={busy || !text.trim()}
          onClick={() => void ask()}
        >
          {busy ? '만드는 중…' : '만들기'}
        </button>
      </div>

      {/* 설정 시험은 사람이 켤 때만. 켜 두면 말 한 줄에 장비 설정이 바뀌는
          시험이 만들어진다 — 그것을 모르고 돌리는 일이 없어야 한다. */}
      <label className={`ask-cfg${allowConfig ? ' on' : ''}`}>
        <input
          type="checkbox"
          checked={allowConfig}
          onChange={(e) => setAllowConfig(e.target.checked)}
        />
        <span>
          <b>설정 시험 허용</b>
          <i>
            {allowConfig
              ? 'configure terminal · interface · shutdown · no shutdown 까지 만듭니다. reload·write·copy·erase 는 켜도 막습니다.'
              : '지금은 조회 명령만 만듭니다. 링크를 내렸다 올리는 시험을 만들려면 켜세요.'}
          </i>
        </span>
      </label>

      {err && <div className="ask-err">{err}</div>}

      {draft && (
        <div className="ask-plan">
          {/* 왼쪽에서 고치고 오른쪽에서 결과를 본다. 위아래로 두면 출력을
              보려고 내리는 순간 고치던 칸이 화면에서 사라진다. */}
          <div className="ask-left">
          <div className="ask-why">
            <b>{draft.name}</b>
            {draft.object && <div className="muted small">{draft.object}</div>}
          </div>

          {/* 어느 장비에 보낼지는 사람이 정한다. AI 가 짚은 것을 미리
              골라 두되, 그대로 나가게 두지 않는다. */}
          <label className="ask-dev">
            보낼 장비
            <select value={devId} onChange={(e) => setDevId(e.target.value)}>
              {usable.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name || d.ip} · {d.model || d.role || ''}
                </option>
              ))}
            </select>
          </label>

          {draft.steps.length === 0 ? (
            <div className="muted small">쓸 만한 스텝을 못 만들었습니다. 다르게 말해 보세요.</div>
          ) : (
            <div className="ask-steps">
              {/* 고칠 수 있게 둔다. 대개 명령은 맞는데 판정기준이 아쉽다 */}
              {draft.steps.some((s) => s.type === 'none') && (
                <div className="ask-need">
                  「판정 안 함」 인 스텝이 있습니다 — 돌기만 하고 아무것도 확인하지 못합니다.
                  <b> 오류만 없으면 합격</b> 으로 바꾸거나, 돌린 뒤 출력에서 끌어 채우세요.
                </div>
              )}
              {draft.steps.map((s, i) => (
                <div className="ask-step" key={i}>
                  <div className="ask-step-h">
                    <b>{i + 1}</b>
                    <span>{s.desc || '—'}</span>
                  </div>
                  <input
                    className="mono"
                    value={s.cli}
                    onChange={(e) => setStep(i, { cli: e.target.value })}
                  />
                  <div className="ask-step-c">
                    <select
                      value={s.type ?? 'contains'}
                      onChange={(e) => setStep(i, { type: e.target.value })}
                    >
                      <option value="ok">오류만 없으면 합격</option>
                      <option value="contains">문구 포함</option>
                      <option value="contains_all">모두 포함</option>
                      <option value="notcontains">있으면 불합격</option>
                      <option value="none">판정 안 함</option>
                    </select>
                    {/* 「오류만 없으면」 은 적을 것이 없다. 빈 칸을 내놓으면
                        무엇을 적어야 하나 또 헤매게 된다. */}
                    {s.type === 'ok' || s.type === 'none' ? (
                      <span className="ask-nocrit">
                        {s.type === 'ok' ? '명령이 오류 없이 응답하면 합격' : '아무것도 확인하지 않음'}
                      </span>
                    ) : (
                      <input
                        className={!s.criteria ? 'need' : undefined}
                        value={s.criteria ?? ''}
                        placeholder="판정기준 — 이 문구가 나오면 합격"
                        onChange={(e) => setStep(i, { criteria: e.target.value })}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {(draft.cut?.length ?? 0) > 0 && (
            <div className="ask-drop">
              조회가 아닌 명령 {draft.cut?.length}개는 뺐습니다 — {draft.cut?.join(' · ')}
            </div>
          )}

          <div className="ask-act">
            {running ? (
              <button className="btn small" type="button" onClick={() => abortRef.current?.abort()}>
                ⏹ 멈추기
              </button>
            ) : (
              <button
                className="btn primary small"
                type="button"
                disabled={!draft.steps.length || !devId}
                onClick={() => void run()}
              >
                ▶ 이대로 돌리기
              </button>
            )}
            {ran && !running && (
              <button className="btn small" type="button" onClick={() => void save()}>
                시험으로 저장
              </button>
            )}
            <button
              className="btn small"
              type="button"
              onClick={() => {
                setDraft(null)
                setRan(null)
              }}
            >
              버리기
            </button>
          </div>

          </div>

          {/* 결과 — 스텝마다 판정과 받은 출력 */}
          <div className="ask-right">
          {!ran ? (
            <div className="empty">돌리면 여기에 결과가 나옵니다.</div>
          ) : (
            <div className="ask-res">
              {ran.map((s, i) => {
                const r = String(s.repeatResult ?? s.status ?? '').trim()
                const bad = r.toLowerCase() === 'fail'
                const on = at === i
                return (
                  <div className={`ask-r${bad ? ' bad' : ''}${on ? ' on' : ''}`} key={i}>
                    <div className="ask-r-h">
                      <b>{i + 1}</b>
                      <code>{String(s.cli ?? '').split('\n')[0]}</code>
                      <span className="sp" />
                      {/* 돌았는데 「대기」 로 보이면 안 된다. 판정을 안 한
                          것과 아직 안 돈 것은 다르다. */}
                      <span className={`ask-r-v ${bad ? 'fail' : r ? 'pass' : ''}`}>
                        {on
                          ? '도는 중'
                          : r
                            ? r
                            : s.output
                              ? '판정 안 함'
                              : '대기'}
                      </span>
                    </div>
                    {s.reason && <div className="ask-r-why">{s.reason}</div>}
                    {s.output && (
                      <>
                        {/* 판정기준은 출력을 보고 정하는 것이 제일 정확하다.
                            AI 가 비워 둔 스텝도 여기서 끌어 채우면 된다. */}
                        <pre
                          className="ask-r-out"
                          onMouseUp={() => {
                            const sel = window.getSelection()?.toString().trim() ?? ''
                            if (sel) setGrab({ i, text: sel })
                          }}
                        >
                          {s.output}
                        </pre>
                        {/* 눌러서 정한다. 무엇을 적어야 하는지 몰라도 된다 */}
                        {suggest(String(s.output ?? '')).length > 0 && (
                          <div className="ask-sug">
                            <span className="ask-sug-t">이걸로 판정할까요?</span>
                            {suggest(String(s.output ?? '')).map((g, k) => (
                              <button
                                key={k}
                                type="button"
                                className={
                                  draft.steps[i]?.criteria === g.criteria ? 'on' : undefined
                                }
                                onClick={() => setStep(i, { type: g.type, criteria: g.criteria })}
                              >
                                {g.label}
                              </button>
                            ))}
                            <button
                              type="button"
                              className={draft.steps[i]?.type === 'ok' ? 'on' : undefined}
                              onClick={() => setStep(i, { type: 'ok', criteria: '' })}
                            >
                              오류만 없으면
                            </button>
                          </div>
                        )}
                        {grab?.i === i && (
                          <div className="ask-r-grab">
                            <code>{grab.text.slice(0, 60)}</code>
                            <button
                              className="btn small primary"
                              type="button"
                              onClick={() => {
                                setStep(i, { type: 'contains', criteria: grab.text })
                                setGrab(null)
                              }}
                            >
                              판정기준으로
                            </button>
                            <button className="btn small" type="button" onClick={() => setGrab(null)}>
                              취소
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          </div>
        </div>
      )}
    </div>
  )
}
