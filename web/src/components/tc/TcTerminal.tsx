import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/api/client'
import type { Device } from '@/pages/Devices'
import { connParams, deviceLabel } from './device'
import type { TcStep } from './types'

interface Props {
  /** `data.sessions` — 자리 번호 → 장비 id */
  sessions: string[]
  devById: Map<string, Device>
  /** 사람이 읽는 세션 이름 (자리 번호가 곧 인덱스) */
  sessionNames: string[]
  /** 스텝으로 담기 */
  onAdd: (step: TcStep) => void
  onClose: () => void
}

/** 터미널에 쌓이는 한 덩어리 — 친 명령과 그 응답 */
interface Block {
  cmd: string
  out: string
  /** 이 덩어리가 이미 스텝이 되었는가 */
  taken: boolean
  error?: boolean
}

/**
 * 터미널에서 따오기.
 *
 * 이 화면의 요점은 **아무것도 배우지 않고 첫 스텝을 만드는 것**이다.
 * 스텝 종류를 고르고 세션을 지정하고 명령 문법을 익히는 대신, 평소처럼
 * 장비에 명령을 친다. 친 것과 응답이 그대로 스텝이 된다.
 *
 * 실제로 쳐 본 명령이라 오타가 없고, 응답이 이미 붙어 있어서 판정 기준을
 * 그 자리에서 끌어 만들 수 있다 — 손으로 만든 스텝은 처음 돌릴 때 절반이
 * 오타로 실패한다.
 */
export default function TcTerminal({
  sessions,
  devById,
  sessionNames,
  onAdd,
  onClose,
}: Props) {
  const [idx, setIdx] = useState(0)
  const [blocks, setBlocks] = useState<Block[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [note, setNote] = useState('')
  /** 켜 두면 친 명령이 곧바로 스텝이 된다 */
  const [rec, setRec] = useState(true)
  /** 위/아래 키로 꺼내 쓰는 명령 기록 */
  const hist = useRef<string[]>([])
  const histAt = useRef(-1)
  /** 기록으로 이미 담은 마지막 덩어리. 같은 것을 두 번 담지 않기 위한 것 */
  const lastDone = useRef(-1)
  const bodyRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const devId = sessions[idx]
  const dev = devId ? devById.get(devId) : undefined

  // 새 줄이 붙으면 바닥으로. 터미널은 늘 마지막 줄을 보고 있어야 한다.
  useEffect(() => {
    const el = bodyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [blocks, busy])

  /** 세션을 바꾸면 화면을 비운다 — 다른 장비의 출력이 섞이면 못 읽는다 */
  useEffect(() => {
    setBlocks([])
    setPrompt('')
    setNote('')
    lastDone.current = -1
  }, [idx])

  const open = async () => {
    if (!dev) return
    setBusy(true)
    setNote('접속 중…')
    try {
      const r = await apiFetch('/api/session-open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...connParams(dev), fast: true }),
      })
      const b = (await r.json()) as { ok?: boolean; prompt?: string; error?: string }
      if (b.ok) {
        setPrompt(String(b.prompt ?? '').trim())
        setNote('')
        inputRef.current?.focus()
      } else {
        setNote(`접속 실패 — ${b.error ?? '이유 불명'}`)
      }
    } catch (e) {
      setNote(`접속 실패 — ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  /**
   * 명령 보내기.
   *
   * SSE 로 받는다. 응답을 다 모아 한 번에 보여주면 `show running-config`
   * 처럼 긴 명령에서 몇 초 동안 화면이 멈춘 것처럼 보인다.
   */
  const send = async (cmd: string) => {
    if (!dev || !cmd.trim() || busy) return
    hist.current = [...hist.current.filter((h) => h !== cmd), cmd]
    histAt.current = -1
    setInput('')
    setBusy(true)
    const at = blocks.length
    setBlocks((v) => [...v, { cmd, out: '', taken: false }])

    try {
      const r = await apiFetch('/api/run-cli-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...connParams(dev), commands: [cmd], require_session: true }),
      })
      if (!r.ok || !r.body) throw new Error(`스트리밍 실패 (${r.status})`)

      const reader = r.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let cut: number
        while ((cut = buf.indexOf('\n\n')) >= 0) {
          const evt = buf.slice(0, cut)
          buf = buf.slice(cut + 2)
          if (!evt.startsWith('data: ')) continue
          let o: { o?: string; err?: string; done?: boolean }
          try {
            o = JSON.parse(evt.slice(6))
          } catch {
            continue
          }
          if (o.o != null) {
            const chunk = o.o
            setBlocks((v) =>
              v.map((b, i) => (i === at ? { ...b, out: b.out + chunk } : b)),
            )
          } else if (o.err) {
            const err = o.err
            setBlocks((v) =>
              v.map((b, i) => (i === at ? { ...b, out: `${b.out}[오류] ${err}`, error: true } : b)),
            )
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setBlocks((v) => v.map((b, i) => (i === at ? { ...b, out: `[오류] ${msg}`, error: true } : b)))
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  /**
   * 스텝으로 담기.
   *
   * 응답을 함께 넣는다 — 판정 기준을 끌어 만들려면 응답이 있어야 하고,
   * 방금 눈으로 본 그 응답이어야 한다.
   */
  const take = (i: number) => {
    const b = blocks[i]
    if (!b) return
    onAdd({
      kind: 'cli',
      indent: 0,
      session: idx,
      cli: b.cmd,
      output: b.out.replace(/\s+$/, ''),
      executed_at: new Date().toISOString(),
      type: 'contains',
    })
    setBlocks((v) => v.map((x, j) => (j === i ? { ...x, taken: true } : x)))
  }

  // 기록 중이면 명령이 끝나는 대로 담는다. 사람이 매번 ⊕ 를 누르지 않아도
  // 되는 것이 이 화면의 요점이다.
  useEffect(() => {
    if (!rec || busy) return
    const i = blocks.length - 1
    if (i < 0 || i === lastDone.current) return
    lastDone.current = i
    const b = blocks[i]
    if (b && !b.taken && !b.error) take(i)
    // take 는 blocks 를 바꾸므로 의존성에 넣지 않는다 — 넣으면 서로 부른다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, blocks.length, rec])

  if (sessions.length === 0) {
    return (
      <div className="tm">
        <div className="tm-head">
          <b>터미널</b>
          <span className="sp" />
          <button className="btn small" type="button" onClick={onClose}>
            닫기
          </button>
        </div>
        <div className="empty">
          먼저 장비를 넣으세요.
          <br />
          <span className="muted small">위 실행 줄의 「+ 세션」 입니다.</span>
        </div>
      </div>
    )
  }

  return (
    <div className="tm">
      <div className="tm-head">
        <b>터미널</b>
        <select value={idx} onChange={(e) => setIdx(Number(e.target.value))}>
          {sessions.map((_, i) => (
            <option key={i} value={i}>
              S{i + 1} · {sessionNames[i] ?? `세션 ${i + 1}`}
            </option>
          ))}
        </select>
        <label className="tm-rec" title="켜 두면 친 명령이 바로 스텝이 됩니다">
          <input type="checkbox" checked={rec} onChange={(e) => setRec(e.target.checked)} />
          기록
        </label>
        <span className="sp" />
        <button className="btn small" type="button" onClick={onClose}>
          닫기
        </button>
      </div>

      <div className="tm-body" ref={bodyRef} onClick={() => inputRef.current?.focus()}>
        {!prompt && (
          <div className="tm-open">
            <b>{dev ? deviceLabel(dev) : '(장비 없음)'}</b>
            <span className="muted small">{dev?.ip}</span>
            <button className="btn small primary" type="button" disabled={busy || !dev} onClick={() => void open()}>
              {busy ? '접속 중…' : '접속'}
            </button>
            {note && <span className="tm-note">{note}</span>}
          </div>
        )}

        {blocks.map((b, i) => (
          <div className="tm-blk" key={i}>
            <div className="tm-cmd">
              <span className="tm-p">{prompt || '$'}</span>
              {b.cmd}
              {/* 기록이 꺼져 있을 때만 손으로 담는다. 켜져 있으면 이미 담겼다. */}
              {b.taken ? (
                <span className="tm-took">스텝으로 담음</span>
              ) : (
                <button className="tm-take" type="button" onClick={() => take(i)}>
                  ⊕ 스텝으로
                </button>
              )}
            </div>
            {b.out && <pre className={`tm-out${b.error ? ' err' : ''}`}>{b.out}</pre>}
          </div>
        ))}

        {prompt && (
          <div className="tm-line">
            <span className="tm-p">{prompt}</span>
            <input
              ref={inputRef}
              className="tm-in"
              value={input}
              disabled={busy}
              autoFocus
              spellCheck={false}
              autoComplete="off"
              placeholder={busy ? '…' : '명령을 치세요'}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void send(input)
                  return
                }
                // 위/아래로 친 명령 꺼내 쓰기 — 터미널이면 되는 게 당연하다
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  const h = hist.current
                  if (h.length === 0) return
                  histAt.current = histAt.current < 0 ? h.length - 1 : Math.max(0, histAt.current - 1)
                  setInput(h[histAt.current] ?? '')
                }
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  const h = hist.current
                  if (histAt.current < 0) return
                  histAt.current = histAt.current + 1
                  if (histAt.current >= h.length) {
                    histAt.current = -1
                    setInput('')
                  } else setInput(h[histAt.current] ?? '')
                }
              }}
            />
          </div>
        )}

        {note && prompt && <div className="tm-note">{note}</div>}
      </div>

      <div className="tm-foot">
        {rec ? (
          <span>친 명령이 응답과 함께 스텝으로 담깁니다.</span>
        ) : (
          <span>줄 오른쪽 「⊕ 스텝으로」 를 눌러 담습니다.</span>
        )}
        <span className="sp" />
        <span className="muted small">{blocks.filter((b) => b.taken).length}개 담음</span>
      </div>
    </div>
  )
}
