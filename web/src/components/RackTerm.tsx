import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/api/client'
import { connParams, deviceLabel, deviceShort } from '@/components/tc/device'
import type { Device } from '@/pages/Devices'
import './RackTerm.css'

/**
 * 랙뷰 터미널 — 장비 우클릭 「접속」 에서 열린다. SecureCRT 처럼 쓰도록:
 *
 *  · 탭 — 장비 여러 대를 한 창에서 오간다. 창이 랙뷰를 가리지 않는
 *    떠 있는 창이라, 열어 둔 채 다른 장비를 우클릭 → 접속하면 탭이
 *    늘어난다. 탭이든 창이든 닫으면 서버 세션도 그 자리에서 끊는다 —
 *    안 보이는 접속이 남아 있으면 안 된다.
 *  · 로그 저장 — 지금 탭의 친 명령·응답 전부를 .txt 로 내려받는다.
 *  · 화면 지우기 · 글꼴 크기 · 명령 히스토리(↑↓) · 연결 끊기/재접속.
 *
 * 명령 단위 터미널이다(줄 치면 응답이 쌓임). TcTerminal 과 같은 서버
 * 길(/api/session-open · /api/run-cli-stream)이라 파괴 명령 차단도
 * 서버가 그대로 지킨다.
 */

export interface TermTab {
  key: string
  dev: Device
  protocol: 'telnet' | 'ssh' | 'console'
}

interface Block {
  cmd: string
  out: string
  error?: boolean
}

interface HostProps {
  tabs: TermTab[]
  on: number
  onPick: (i: number) => void
  onCloseTab: (i: number) => void
  onClose: () => void
}

export default function RackTermHost({ tabs, on, onPick, onCloseTab, onClose }: HostProps) {
  const [fontPx, setFontPx] = useState(12)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const winRef = useRef<HTMLDivElement | null>(null)

  /** 서버 세션 끊기 — 창·탭을 닫을 때 무조건. 결과는 기다리지 않는다 */
  const killSession = (t: TermTab) => {
    void apiFetch('/api/session-close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(connParams(t.dev, t.protocol)),
    }).catch(() => {})
  }

  const closeTab = (i: number) => {
    const t = tabs[i]
    if (t) killSession(t)
    onCloseTab(i)
  }

  const closeAll = () => {
    for (const t of tabs) killSession(t)
    onClose()
  }

  /** 탭줄 빈 곳을 잡고 끌면 창이 따라온다 — SecureCRT 창처럼 */
  const dragWin = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement
    if (t.closest('button') || t.closest('.tm-tab')) return
    const r = winRef.current?.getBoundingClientRect()
    if (!r) return
    const dx = e.clientX - r.left
    const dy = e.clientY - r.top
    const move = (ev: MouseEvent) => {
      setPos({
        x: Math.min(Math.max(ev.clientX - dx, 160 - r.width), window.innerWidth - 160),
        y: Math.min(Math.max(ev.clientY - dy, 0), window.innerHeight - 60),
      })
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    e.preventDefault()
  }

  return (
    // 떠 있는 창 — 오버레이는 자리만 잡고 클릭은 통과시킨다. 뒤 랙뷰가
    // 살아 있어야 열어 둔 채 다른 장비를 우클릭해 탭을 늘릴 수 있다.
    <div className="tm-ovl">
      <div
        className="tm-win"
        ref={winRef}
        style={pos ? { position: 'fixed', left: pos.x, top: pos.y } : undefined}
      >
        <div className="tm-tabs" onMouseDown={dragWin}>
          {tabs.map((t, i) => (
            <span key={t.key} className={`tm-tab${i === on ? ' on' : ''}`} onClick={() => onPick(i)}>
              {deviceShort(t.dev)}
              <i className="tm-tp">{t.protocol === 'telnet' ? 'T' : t.protocol === 'ssh' ? 'S' : 'C'}</i>
              <button
                type="button"
                className="tm-tx"
                title="탭 닫기 (세션도 끊습니다)"
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(i)
                }}
              >
                ×
              </button>
            </span>
          ))}
          <span className="tm-hint muted small">랙에서 장비 우클릭 → 접속으로 탭이 늘어납니다</span>
          <span className="sp" />
          <button className="tm-fz" type="button" title="글자 작게" onClick={() => setFontPx((v) => Math.max(10, v - 1))}>
            A−
          </button>
          <button className="tm-fz" type="button" title="글자 크게" onClick={() => setFontPx((v) => Math.min(18, v + 1))}>
            A+
          </button>
          <button className="btn small" type="button" onClick={closeAll} title="창 닫기 (모든 세션 종료)">
            닫기
          </button>
        </div>
        {tabs.map((t, i) => (
          <TermPane key={t.key} tab={t} visible={i === on} fontPx={fontPx} />
        ))}
      </div>
    </div>
  )
}

/** 탭 하나 = 세션 하나. 숨겨도 언마운트하지 않는다 — 스크롤백이 남아야 한다 */
function TermPane({ tab, visible, fontPx }: { tab: TermTab; visible: boolean; fontPx: number }) {
  const { dev, protocol } = tab
  const [blocks, setBlocks] = useState<Block[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [note, setNote] = useState('접속 중…')
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const hist = useRef<string[]>([])
  const histAt = useRef(-1)

  const params = () => connParams(dev, protocol)

  const open = async () => {
    setNote('접속 중…')
    try {
      const r = await apiFetch('/api/session-open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...params(), fast: true }),
      })
      const b = (await r.json()) as { ok?: boolean; prompt?: string; error?: string }
      if (b.ok) {
        setPrompt(String(b.prompt ?? '').trim() || '#')
        setNote('')
        inputRef.current?.focus()
      } else {
        setNote(`접속 실패 — ${b.error ?? '이유 불명'}`)
      }
    } catch (e) {
      setNote(`접속 실패 — ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  useEffect(() => {
    void open()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dev.id, protocol])

  useEffect(() => {
    if (visible) inputRef.current?.focus()
  }, [visible])

  // 명령이 끝나면 포커스를 입력줄로 되돌린다 — 클릭 없이 바로 다음 명령
  useEffect(() => {
    if (visible && !busy) inputRef.current?.focus()
  }, [visible, busy])

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight })
  }, [blocks, note])

  const disconnect = async () => {
    setBusy(true)
    try {
      await apiFetch('/api/session-close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params()),
      })
      setPrompt('')
      setNote('연결을 끊었습니다 — 「재접속」 으로 다시 붙습니다')
    } catch (e) {
      setNote(`끊지 못했습니다 — ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  /** 로그 저장 — SecureCRT 의 Log Session 몫. 지금 탭 전부를 .txt 로 */
  const saveLog = () => {
    const L: string[] = [
      `# ${deviceLabel(dev)} · ${protocol.toUpperCase()} · ${new Date().toLocaleString()}`,
      '',
    ]
    for (const b of blocks) {
      L.push(`${prompt || '#'} ${b.cmd}`)
      if (b.out) L.push(b.out.replace(/\s+$/, ''))
    }
    const blob = new Blob([L.join('\n')], { type: 'text/plain;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${deviceShort(dev)}-${protocol}-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  /** SSE 로 받는다 — 긴 응답도 화면이 멈춘 것처럼 보이지 않게 */
  const send = async (cmd: string) => {
    if (!cmd.trim() || busy) return
    hist.current = [...hist.current.filter((h) => h !== cmd), cmd]
    histAt.current = -1
    setInput('')
    setBusy(true)
    const at = blocks.length
    setBlocks((v) => [...v, { cmd, out: '' }])
    try {
      const r = await apiFetch('/api/run-cli-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...params(), commands: [cmd], require_session: true }),
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
          let o: { o?: string; err?: string }
          try {
            o = JSON.parse(evt.slice(6)) as { o?: string; err?: string }
          } catch {
            continue
          }
          if (o.o != null) {
            const chunk = o.o
            setBlocks((v) => v.map((b, i) => (i === at ? { ...b, out: b.out + chunk } : b)))
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

  return (
    <div className="tm-pane" style={{ display: visible ? 'flex' : 'none' }}>
      <div className="tm-head">
        <b>{deviceLabel(dev)}</b>
        <span className="tm-proto">{protocol.toUpperCase()}</span>
        {prompt && <span className="tm-prompt">{prompt}</span>}
        <span className="sp" />
        <button className="btn small" type="button" disabled={blocks.length === 0} onClick={saveLog}>
          로그 저장
        </button>
        <button
          className="btn small"
          type="button"
          disabled={blocks.length === 0}
          onClick={() => setBlocks([])}
        >
          지우기
        </button>
        {prompt ? (
          <button className="btn small" type="button" disabled={busy} onClick={() => void disconnect()}>
            연결 끊기
          </button>
        ) : (
          <button className="btn small" type="button" disabled={busy} onClick={() => void open()}>
            재접속
          </button>
        )}
      </div>
      <div
        className="tm-body"
        ref={bodyRef}
        style={{ fontSize: fontPx }}
        onClick={() => {
          // 드래그로 긁는 중이면 포커스를 뺏지 않는다 — 복사가 우선이다
          if (!window.getSelection()?.toString()) inputRef.current?.focus()
        }}
      >
        {blocks.map((b, i) => (
          <div className="tm-blk" key={i}>
            <div className="tm-cmd">
              <i>{prompt || '#'}</i> {b.cmd}
            </div>
            {b.out && <pre className={b.error ? 'err' : ''}>{b.out}</pre>}
          </div>
        ))}
        {note && <div className="tm-note">{note}</div>}
        {/* 진짜 터미널처럼 — 입력은 출력 흐름의 끝에 붙는다. 아래에 따로
            달린 입력 칸은 터미널이 아니라 채팅창이다. */}
        <div className="tm-line">
          <i>{prompt || '›'}</i>
          <input
            ref={inputRef}
            value={input}
            disabled={!prompt}
            placeholder={prompt ? '' : '접속되면 입력할 수 있습니다'}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.nativeEvent.isComposing) return
              if (e.key === 'Enter') {
                if (input.trim()) void send(input)
                // 빈 엔터도 진짜 터미널처럼 — 프롬프트 줄이 한 줄 넘어간다
                else if (prompt && !busy) setBlocks((v) => [...v, { cmd: '', out: '' }])
              }
              if (e.key === 'ArrowUp') {
                const h = hist.current
                if (!h.length) return
                histAt.current = histAt.current < 0 ? h.length - 1 : Math.max(0, histAt.current - 1)
                setInput(h[histAt.current] ?? '')
                e.preventDefault()
              }
              if (e.key === 'ArrowDown') {
                const h = hist.current
                if (histAt.current < 0) return
                histAt.current = histAt.current + 1
                if (histAt.current >= h.length) {
                  histAt.current = -1
                  setInput('')
                } else setInput(h[histAt.current] ?? '')
                e.preventDefault()
              }
            }}
          />
        </div>
      </div>
    </div>
  )
}
