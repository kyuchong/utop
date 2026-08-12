import { useCallback, useEffect, useRef, useState } from 'react'
import type { Device } from '@/pages/Devices'
import { deviceFull, deviceName, deviceShort, isMeter, meterKind } from './device'
import { H, NARROW, SIDES, W, edgePt, layout, portTag, type BoardLine, type Side } from './board'
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
  const [ask, setAsk] = useState<{ a: string; b: string; sa?: Side; sb?: Side } | null>(null)
  const [aPort, setAPort] = useState('')
  const [bPort, setBPort] = useState('')
  const [note, setNote] = useState('')
  /** 끄는 동안만 여기 담는다 — 매번 시험을 고치면 화면이 되돈다 */
  const [live, setLive] = useState<Record<string, { x: number; y: number }>>({})
  /** 누른 선 — 끊는 단추를 띄운다 */
  const [pickLine, setPickLine] = useState('')
  /** 잇는 중 손끝을 따라오는 선 */
  const linking = useRef<{ dev: string; side: Side; moved: boolean } | null>(null)
  const [aim, setAim] = useState<{ x: number; y: number } | null>(null)
  const [aimFrom, setAimFrom] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
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

  /**
   * 점을 눌러 **끌어서 잇는다.**
   *
   * 눌렀다 떼고 상대를 다시 누르는 방식만 있었다. 그러면 첫 번째를 누른
   * 뒤 화면이 아무 말도 안 해서 눌린 건지 알 수 없고, 무르려면 Esc 를
   * 알아야 했다. 끌면 선이 손끝을 따라오니 배울 것이 없다.
   *
   * 눌렀다 그 자리에서 떼면 예전처럼 「상대를 누르는」 방식으로 남는다 —
   * 둘 다 되게 둔다.
   */
  const dotDown = (e: React.PointerEvent, id: string, side: Side) => {
    e.stopPropagation()
    e.preventDefault()
    const at = edgePt(posOf(id), side, 0.5)
    setAimFrom(at)
    setAim(at)
    setFrom(id)
    setPickLine('')
    linking.current = { dev: id, side, moved: false }
  }

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
    const box = boxRef.current?.getBoundingClientRect()
    const lk = linking.current
    if (lk && box) {
      lk.moved = true
      setAim({ x: e.clientX - box.left, y: e.clientY - box.top })
      return
    }
    const d = drag.current
    if (!d || !box) return
    // 격자에 맞춰 놓는다. 손으로 대충 놓아도 줄이 맞아 구성도처럼 보인다 —
    // 판 바탕의 점 간격(16px)과 같은 격자다.
    const snap = (v: number) => Math.max(0, Math.round(v / 16) * 16)
    setLive((s) => ({
      ...s,
      [d.dev]: {
        x: snap(e.clientX - box.left - d.dx),
        y: snap(e.clientY - box.top - d.dy),
      },
    }))
  }, [])

  const onUp = useCallback((e: PointerEvent) => {
    const lk = linking.current
    if (lk) {
      linking.current = null
      setAim(null)
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
      const dot = el?.closest?.('.cv-dot') as HTMLElement | null
      const at = el?.closest?.('.cv-node') as HTMLElement | null
      const id = at?.dataset?.dev ?? ''
      if (id && id !== lk.dev) {
        // 점 위에 놓았으면 그 점에, 네모 아무 데나면 자리를 보고 정한다
        setAsk({ a: lk.dev, b: id, sa: lk.side, sb: (dot?.dataset?.side as Side) || undefined })
        setAPort('')
        setBPort('')
        setNote('')
        setFrom('')
      } else if (lk.moved) {
        // 허공에 놓았다 — 무른다
        setFrom('')
      }
      // 안 움직였으면 `from` 을 남긴다: 눌렀다 떼고 상대를 누르는 방식
      return
    }
    const d = drag.current
    drag.current = null
    if (!d) return
    setLive((s) => {
      const at = s[d.dev]
      if (at) {
        /*
         * 겹쳐 놓지 못하게 한다.
         *
         * 네모를 남의 위에 떨어뜨리면 글자가 서로 가려 어느 장비인지도 못
         * 읽는다. 구성도라고 부를 수가 없는 그림이 된다. 떨어뜨린 자리가
         * 이미 차 있으면 빈자리로 내려 놓는다.
         */
        const others = placed.filter((p) => p.dev !== d.dev)
        const hits = (x: number, y: number) =>
          others.some((p) => {
            const q = live[p.dev] ?? p
            return Math.abs(q.x - x) < W + 12 && Math.abs(q.y - y) < H + 12
          })
        let { x, y } = at
        for (let i = 0; i < 40 && hits(x, y); i++) {
          y += 16
          if (i % 8 === 7) {
            x += 16
            y = at.y
          }
        }
        onPlaced(placed.map((p) => (p.dev === d.dev ? { ...p, x, y } : p)))
      }
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
      const d = isMeter(A)
        ? { dev: ask.b, port: bPort, side: ask.sb }
        : { dev: ask.a, port: aPort, side: ask.sa }
      const m = isMeter(A)
        ? { dev: ask.a, port: aPort, side: ask.sa }
        : { dev: ask.b, port: bPort, side: ask.sb }
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
            ...(d.side ? { side: d.side } : {}),
            ...(m.side ? { meterSide: m.side } : {}),
          },
        ],
      })
    } else {
      onChange({
        links: [
          ...links,
          {
            a: { dev: ask.a, port: aPort, ...(ask.sa ? { side: ask.sa } : {}) },
            b: { dev: ask.b, port: bPort, ...(ask.sb ? { side: ask.sb } : {}) },
          },
        ],
      })
    }
    setAsk(null)
  }

  /** 판에 올리기 */
  const put = (id: string) => {
    if (!id || placed.some((p) => p.dev === id)) return
    const n = placed.length
    onPlaced([...placed, { dev: id, x: 32 + (n % 3) * 208, y: 32 + Math.floor(n / 3) * 112 }])
  }

  const cut = (kind: 'wire' | 'link', at: number) => {
    if (kind === 'wire') onChange({ wiring: wiring.filter((_, i) => i !== at) })
    else onChange({ links: links.filter((_, i) => i !== at) })
  }

  /** 그릴 선 — 판에 놓인 것끼리만 */
  const on = new Set(placed.map((p) => p.dev))
  const lines: BoardLine[] = []
  wiring.forEach((w, i) => {
    if (on.has(devOf(w)) && on.has(w.meter))
      lines.push({
        k: `w${i}`,
        a: devOf(w),
        b: w.meter,
        pa: w.port,
        pb: w.meterPort,
        wire: true,
        at: i,
        sa: w.side as Side | undefined,
        sb: w.meterSide as Side | undefined,
      })
  })
  links.forEach((l, i) => {
    if (on.has(l.a.dev) && on.has(l.b.dev))
      lines.push({
        k: `l${i}`,
        a: l.a.dev,
        b: l.b.dev,
        pa: l.a.port,
        pb: l.b.port,
        wire: false,
        at: i,
        sa: l.a.side as Side | undefined,
        sb: l.b.side as Side | undefined,
      })
  })

  /** 붙는 자리 셈은 `board.ts` 한 벌뿐이다 — 결과서도 같은 것을 쓴다 */
  const ends = layout(lines, posOf)

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
        <span title={d ? deviceFull(d) : id}>{d ? deviceFull(d) : id}</span>
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
              {isMeter(d) ? '[계측기] ' : ''}
              {deviceFull(d)}
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
              {ends.map((e) => {
                const l = e.l
                const { p1, p2, d, mid } = e

                /*
                 * 포트 이름은 **붙는 자리 옆**에 적는다.
                 *
                 * 전에는 「Te0/3 ↔ 4106/3」 을 선 한가운데 하나로 적었다.
                 * 그러면 어느 이름이 어느 쪽 장비 것인지 짚어 보아야 알고,
                 * 선이 여럿이면 가운데 글자끼리 겹친다. 옛 화면이 포트까지
                 * 그려 주던 것도 이 때문이다.
                 */
                const gap = Math.hypot(p2.x - p1.x, p2.y - p1.y)
                const tag = (s: Side, p: { x: number; y: number }, txt: string, key: string) => {
                  if (!txt) return null
                  const at = portTag(s, p)
                  return (
                    <g key={key} className="cv-pt">
                      <text x={at.x} y={at.y} textAnchor={at.anchor} className="cv-lt-bg">
                        {txt}
                      </text>
                      <text x={at.x} y={at.y} textAnchor={at.anchor}>
                        {txt}
                      </text>
                    </g>
                  )
                }

                // 선 한가운데 — 끊는 단추를 여기 둔다
                const mx = mid.x
                const my = mid.y

                return (
                  <g
                    key={l.k}
                    className={`cv-l${l.wire ? ' wire' : ''}${pickLine === l.k ? ' on' : ''}`}
                  >
                    <path d={d} />
                    {/*
                      선은 굵기가 2px 도 안 돼서 그대로는 눌러지지 않는다.
                      보이지 않는 굵은 선을 밑에 깔아 누르는 자리를 넓힌다 —
                      선을 지우려고 아래 목록까지 내려가야 했다.
                    */}
                    <path
                      className="cv-hit"
                      d={d}
                      onClick={(ev) => {
                        ev.stopPropagation()
                        setPickLine(pickLine === l.k ? '' : l.k)
                      }}
                    >
                      <title>눌러서 끊기</title>
                    </path>
                    {gap < NARROW ? (
                      // 틈이 좁으면 자리가 없다 — 붙여서 하나로
                      <g className="cv-pt">
                        <text x={mx} y={my - 3} textAnchor="middle" className="cv-lt-bg">
                          {l.pa} ↔ {l.pb}
                        </text>
                        <text x={mx} y={my - 3} textAnchor="middle">
                          {l.pa} ↔ {l.pb}
                        </text>
                      </g>
                    ) : (
                      <>
                        {tag(e.sa, p1, l.pa, `${l.k}a`)}
                        {tag(e.sb, p2, l.pb, `${l.k}b`)}
                      </>
                    )}
                    <g
                      className="cv-cut"
                      onClick={(ev) => {
                        ev.stopPropagation()
                        setPickLine('')
                        cut(l.wire ? 'wire' : 'link', l.at)
                      }}
                    >
                      <title>이 선을 끊습니다</title>
                      <circle cx={mx} cy={my} r={9} />
                      <text x={mx} y={my + 3.5} textAnchor="middle">
                        ✕
                      </text>
                    </g>
                  </g>
                )
              })}
              {/* 잇는 중 — 손끝까지 끌리는 선. 어디로 가고 있는지 보여야
                  「눌렀는데 아무 일도 안 난다」 가 안 된다. */}
              {from && aim && (
                <path
                  className="cv-aimline"
                  d={`M${aimFrom.x},${aimFrom.y} L${aim.x},${aim.y}`}
                />
              )}
            </svg>
            {placed.map((p) => {
              const d = byId.get(p.dev)
              const nm = d ? deviceShort(d) : p.dev
              const at = posOf(p.dev)
              const meter = isMeter(d ?? ({} as Device))
              return (
                <div
                  key={p.dev}
                  className={`cv-node${meter ? ' meter' : ''}${from === p.dev ? ' from' : ''}${
                    from && from !== p.dev ? ' aim' : ''
                  }`}
                  data-dev={p.dev}
                  style={{ left: at.x, top: at.y, width: W, height: H }}
                  onPointerDown={(e) => onDown(e, p.dev)}
                  onClick={() => {
                    // 이을 상대를 고르는 중이면 네모 아무 데나 눌러도 된다.
                    // 점만 눌러야 하면 「어디를 눌러야 하나」 를 배워야 한다.
                    if (from && from !== p.dev) tapDot(p.dev)
                  }}
                >
                  <b>{nm}</b>
                  {/* 랩과 IP 를 늘 적는다. 같은 모델이 둘일 때만 적게
                      해 두었더니, 한 대뿐일 때도 「이게 어느 랩 것이지」 를
                      알 수 없었다. */}
                  <i>{[d?.ip || p.dev, d?.lab].filter(Boolean).join(' · ')}</i>
                  {meter && <em>{meterKind(d as Device) === 'stc' ? 'STC' : 'N2X'}</em>}
                  {/* 잇는 점. 네모를 끄는 것과 헷갈리지 않게 점만 누른다.
                      여덟 군데 — 네 변과 네 모서리. 양옆 둘만 두었더니
                      비스듬히 놓인 장비끼리는 어디서 시작해야 하는지
                      알 수 없었다. 여덟 다 같은 일을 한다. */}
                  {SIDES.map((side) => (
                    <button
                      key={side}
                      type="button"
                      className={`cv-dot ${side}`}
                      data-side={side}
                      title={
                        from ? '여기에 잇습니다' : '여기를 끌어 상대 장비에 놓으면 이어집니다'
                      }
                      onPointerDown={(e) => dotDown(e, p.dev, side)}
                      onClick={(e) => e.stopPropagation()}
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
              <b>{deviceName(byId.get(l.a), devices)}</b>
              <i>·</i>
              <span>
                {l.pa} ↔ {l.pb}
              </span>
              <i>·</i>
              <b>{deviceName(byId.get(l.b), devices)}</b>
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
