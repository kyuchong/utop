import { useCallback, useEffect, useRef, useState } from 'react'
import type { Device } from '@/pages/Devices'
import { deviceShort, isMeter, meterKind } from './device'
import type { TcPortLink, TcWire } from './types'
import './TcCanvas.css'

/**
 * 랩 구성도 — 놓고, 끌고, 잇는다.
 *
 * 랩을 그리는 순서는 **장비를 놓고 → 선을 잇는다** 이다. 화면도 그 순서다.
 *
 *  1. 위에서 장비를 골라 판에 놓는다
 *  2. 네모 옆의 점을 누르고, 다른 네모의 점을 누른다
 *  3. 어느 포트끼리인지 묻고, 답하면 선이 그어진다
 *
 * React Flow 를 붙여 봤지만 이 화면에서는 노드를 못 재서(판은 재는데
 * 노드만 `visibility: hidden` 으로 남았다) 선이 한 줄도 안 그려졌다.
 * 남의 것을 고쳐 쓰느니 직접 그린다 — 필요한 것은 네모·선·끌기뿐이다.
 *
 * 끄는 것은 포인터로 받는다. 마우스와 손가락을 따로 다루면 한쪽만 되는
 * 일이 생긴다.
 */

interface Props {
  devices: Device[]
  wiring: TcWire[]
  links: TcPortLink[]
  sessions: string[]
  ports: Record<string, string[]>
  placed: Array<{ dev: string; x: number; y: number }>
  onPlaced: (v: Array<{ dev: string; x: number; y: number }>) => void
  onChange: (v: { wiring?: TcWire[]; links?: TcPortLink[] }) => void
}

const W = 132
const H = 46

export default function TcCanvas({
  devices,
  wiring,
  links,
  sessions,
  ports,
  placed,
  onPlaced,
  onChange,
}: Props) {
  const byId = new Map(devices.map((d) => [d.id, d]))
  const devOf = (w: TcWire) => w.dev || sessions[w.session] || ''

  /** 끄는 중인 네모 · 잇는 중에 고른 첫 점 */
  const drag = useRef<{ dev: string; dx: number; dy: number } | null>(null)
  const [from, setFrom] = useState('')
  const [ask, setAsk] = useState<{ a: string; b: string } | null>(null)
  const [aPort, setAPort] = useState('')
  const [bPort, setBPort] = useState('')
  const [note, setNote] = useState('')
  /** 끄는 동안만 여기 담는다 — 매번 시험을 고치면 화면이 되돈다 */
  const [live, setLive] = useState<Record<string, { x: number; y: number }>>({})
  const boxRef = useRef<HTMLDivElement>(null)

  const posOf = (id: string) => live[id] ?? placed.find((p) => p.dev === id) ?? { x: 0, y: 0 }

  const portsOf = (id: string): string[] => {
    const d = byId.get(id)
    if (!d) return []
    if (isMeter(d)) return ports[d.id] ?? []
    return (d.interfaces ?? []).map((x) => String((x as { name?: string })?.name ?? x))
  }

  const used = (dev: string, port: string) =>
    wiring.some(
      (w) => (devOf(w) === dev && w.port === port) || (w.meter === dev && w.meterPort === port),
    ) ||
    links.some(
      (l) => (l.a.dev === dev && l.a.port === port) || (l.b.dev === dev && l.b.port === port),
    )

  // ── 끌기 ────────────────────────────────────────────────
  const onDown = (e: React.PointerEvent, id: string) => {
    // 이을 상대를 고르는 중이면 끌지 않는다 — 누르는 순간 이어야 한다
    if (from) return
    const box = boxRef.current?.getBoundingClientRect()
    if (!box) return
    const p = posOf(id)
    drag.current = { dev: id, dx: e.clientX - box.left - p.x, dy: e.clientY - box.top - p.y }
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }

  const onMove = useCallback((e: PointerEvent) => {
    const d = drag.current
    const box = boxRef.current?.getBoundingClientRect()
    if (!d || !box) return
    setLive((s) => ({
      ...s,
      [d.dev]: {
        x: Math.max(0, Math.round(e.clientX - box.left - d.dx)),
        y: Math.max(0, Math.round(e.clientY - box.top - d.dy)),
      },
    }))
  }, [])

  const onUp = useCallback(() => {
    const d = drag.current
    drag.current = null
    if (!d) return
    setLive((s) => {
      const at = s[d.dev]
      if (at) onPlaced(placed.map((p) => (p.dev === d.dev ? { ...p, ...at } : p)))
      const n = { ...s }
      delete n[d.dev]
      return n
    })
  }, [placed, onPlaced])

  // 잘못 눌렀을 때 빠져나갈 길. 없으면 판을 새로 고치는 수밖에 없다.
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setFrom('')
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [])

  useEffect(() => {
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [onMove, onUp])

  // ── 잇기 ────────────────────────────────────────────────
  const tapDot = (id: string) => {
    if (!from) return setFrom(id)
    if (from === id) return setFrom('')
    setAsk({ a: from, b: id })
    setAPort('')
    setBPort('')
    setNote('')
    setFrom('')
  }

  const join = () => {
    if (!ask || !aPort || !bPort) return
    const A = byId.get(ask.a)
    const B = byId.get(ask.b)
    if (!A || !B) return
    if (isMeter(A) && isMeter(B)) return setNote('계측기끼리는 잇지 않습니다')
    if (used(ask.a, aPort) || used(ask.b, bPort)) return setNote('이미 물려 있는 포트입니다')
    if (isMeter(A) || isMeter(B)) {
      const d = isMeter(A) ? { dev: ask.b, port: bPort } : { dev: ask.a, port: aPort }
      const m = isMeter(A) ? { dev: ask.a, port: aPort } : { dev: ask.b, port: bPort }
      const at = sessions.indexOf(d.dev)
      onChange({
        wiring: [
          ...wiring,
          {
            session: at < 0 ? 0 : at,
            ...(at < 0 ? { dev: d.dev } : {}),
            port: d.port,
            meter: m.dev,
            meterPort: m.port,
          },
        ],
      })
    } else {
      onChange({
        links: [...links, { a: { dev: ask.a, port: aPort }, b: { dev: ask.b, port: bPort } }],
      })
    }
    setAsk(null)
  }

  /** 판에 올리기 */
  const put = (id: string) => {
    if (!id || placed.some((p) => p.dev === id)) return
    const n = placed.length
    onPlaced([...placed, { dev: id, x: 30 + (n % 3) * 200, y: 24 + Math.floor(n / 3) * 110 }])
  }

  const cut = (kind: 'wire' | 'link', at: number) => {
    if (kind === 'wire') onChange({ wiring: wiring.filter((_, i) => i !== at) })
    else onChange({ links: links.filter((_, i) => i !== at) })
  }

  /** 그릴 선 — 판에 놓인 것끼리만 */
  const on = new Set(placed.map((p) => p.dev))
  const lines: Array<{ k: string; a: string; b: string; t: string; wire: boolean; at: number }> = []
  wiring.forEach((w, i) => {
    if (on.has(devOf(w)) && on.has(w.meter))
      lines.push({
        k: `w${i}`,
        a: devOf(w),
        b: w.meter,
        t: `${w.port} ↔ ${w.meterPort}`,
        wire: true,
        at: i,
      })
  })
  links.forEach((l, i) => {
    if (on.has(l.a.dev) && on.has(l.b.dev))
      lines.push({
        k: `l${i}`,
        a: l.a.dev,
        b: l.b.dev,
        t: `${l.a.port} ↔ ${l.b.port}`,
        wire: false,
        at: i,
      })
  })

  const canAdd = devices.filter((d) => !placed.some((p) => p.dev === d.id))
  const height = Math.max(
    260,
    ...placed.map((p) => (live[p.dev]?.y ?? p.y) + H + 40),
  )

  const pickPort = (id: string, v: string, set: (s: string) => void) => {
    const list = portsOf(id)
    const d = byId.get(id)
    return (
      <label className="cv-pick">
        <span>{d ? deviceShort(d) : id}</span>
        <select value={v} onChange={(e) => set(e.target.value)} disabled={!list.length}>
          <option value="">
            {list.length
              ? '포트 고르기'
              : d && isMeter(d)
                ? '포트를 먼저 불러오세요'
                : '등록된 포트 없음'}
          </option>
          {list.map((p) => (
            <option key={p} value={p} disabled={used(id, p)}>
              {p}
              {used(id, p) ? ' (이미 물림)' : ''}
            </option>
          ))}
        </select>
      </label>
    )
  }

  return (
    <div className="cv">
      <div className="cv-bar">
        <select value="" onChange={(e) => put(e.target.value)}>
          <option value="">＋ 장비 · 계측기 놓기…</option>
          {canAdd.map((d) => (
            <option key={d.id} value={d.id}>
              {isMeter(d) ? `[계측기] ${deviceShort(d)}` : deviceShort(d)}
              {d.ip ? ` (${d.ip})` : ''}
            </option>
          ))}
        </select>
        <span className="muted small">
          {from
            ? '이제 이을 상대 네모를 누르세요 (Esc 로 무르기)'
            : '네모를 끌어 옮깁니다 · 옆의 점을 누른 뒤 상대 네모를 누르면 이어집니다'}
        </span>
        <span className="sp" />
        <span className="muted small">
          장비 {placed.length} · 선 {lines.length}
        </span>
        {placed.length > 0 && (
          <button className="btn small" type="button" onClick={() => onPlaced([])}>
            판 비우기
          </button>
        )}
      </div>

      <div className="cv-box" ref={boxRef} style={{ height }}>
        {placed.length === 0 ? (
          <div className="cv-empty">
            위에서 장비를 골라 판에 놓으세요. 다 놓고 나서 선을 이으면 됩니다.
          </div>
        ) : (
          <>
            <svg className="cv-svg">
              {lines.map((l) => {
                const A = posOf(l.a)
                const B = posOf(l.b)
                const x1 = A.x + W
                const y1 = A.y + H / 2
                const x2 = B.x
                const y2 = B.y + H / 2
                const mx = (x1 + x2) / 2
                return (
                  <g key={l.k} className={l.wire ? 'cv-l wire' : 'cv-l'}>
                    <path d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} />
                    <text x={mx} y={(y1 + y2) / 2 - 4} textAnchor="middle" className="cv-lt-bg">
                      {l.t}
                    </text>
                    <text x={mx} y={(y1 + y2) / 2 - 4} textAnchor="middle">
                      {l.t}
                    </text>
                  </g>
                )
              })}
            </svg>
            {placed.map((p) => {
              const d = byId.get(p.dev)
              const nm = d ? deviceShort(d) : p.dev
              const dup = placed.some(
                (o) => o.dev !== p.dev && deviceShort(byId.get(o.dev) ?? ({} as Device)) === nm,
              )
              const at = posOf(p.dev)
              const meter = isMeter(d ?? ({} as Device))
              return (
                <div
                  key={p.dev}
                  className={`cv-node${meter ? ' meter' : ''}${from === p.dev ? ' from' : ''}${
                    from && from !== p.dev ? ' aim' : ''
                  }`}
                  style={{ left: at.x, top: at.y, width: W, height: H }}
                  onPointerDown={(e) => onDown(e, p.dev)}
                  onClick={() => {
                    // 이을 상대를 고르는 중이면 네모 아무 데나 눌러도 된다.
                    // 점만 눌러야 하면 「어디를 눌러야 하나」 를 배워야 한다.
                    if (from && from !== p.dev) tapDot(p.dev)
                  }}
                >
                  <b>{nm}</b>
                  {dup && <i>{d?.ip || p.dev}</i>}
                  {meter && <em>{meterKind(d as Device) === 'stc' ? 'STC' : 'N2X'}</em>}
                  {/* 잇는 점. 네모를 끄는 것과 헷갈리지 않게 점만 누른다 */}
                  {/* 점은 양옆에. 한쪽에만 두었더니 어느 쪽으로 이어야
                      하는지 헷갈렸다 — 둘 다 같은 일을 한다. */}
                  {(['l', 'r'] as const).map((side) => (
                    <button
                      key={side}
                      type="button"
                      className={`cv-dot ${side}`}
                      title={from ? '여기에 잇습니다' : '여기서 선을 시작합니다'}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation()
                        tapDot(p.dev)
                      }}
                    />
                  ))}
                  <button
                    type="button"
                    className="cv-x"
                    title="판에서 내립니다 — 배선은 남습니다"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      onPlaced(placed.filter((x) => x.dev !== p.dev))
                    }}
                  >
                    ✕
                  </button>
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* 이어진 것 — 글로도 적는다. 결과서에 붙이는 것은 글이다 */}
      {lines.length > 0 && (
        <div className="cv-list">
          {lines.map((l) => (
            <div className="cv-row" key={l.k}>
              <b>{deviceShort(byId.get(l.a) ?? ({} as Device))}</b>
              <i>·</i>
              <span>{l.t}</span>
              <i>·</i>
              <b>{deviceShort(byId.get(l.b) ?? ({} as Device))}</b>
              {l.wire && <span className="cv-tag">계측기</span>}
              <span className="sp" />
              <button className="btn small" type="button" onClick={() => cut(l.wire ? 'wire' : 'link', l.at)}>
                끊기
              </button>
            </div>
          ))}
        </div>
      )}

      {ask && (
        <div className="modal-back" onClick={() => setAsk(null)}>
          <div className="cv-ask" onClick={(e) => e.stopPropagation()}>
            <div className="cv-ask-h">
              <b>어느 포트끼리 물렸나요?</b>
              <span className="sp" />
              <button className="btn small" type="button" onClick={() => setAsk(null)}>
                취소
              </button>
            </div>
            {pickPort(ask.a, aPort, setAPort)}
            {pickPort(ask.b, bPort, setBPort)}
            {note && <div className="cv-note">{note}</div>}
            <div className="cv-ask-do">
              <button className="btn primary" type="button" disabled={!aPort || !bPort} onClick={join}>
                잇기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
