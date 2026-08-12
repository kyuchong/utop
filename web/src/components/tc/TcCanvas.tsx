import { useCallback, useEffect, useRef, useState } from 'react'
import type { Device } from '@/pages/Devices'
import { deviceFull, deviceShort, isMeter, meterKind } from './device'
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

const W = 152
const H = 56

/**
 * 선이 붙는 자리 — **여덟 군데**. 네 변과 네 모서리다.
 *
 * 넷만 두었더니 비스듬히 놓인 장비끼리 선이 변을 억지로 타고 돌았다.
 * 실제 랩에서도 장비는 나란히만 놓이지 않는다.
 */
const SIDES = ['t', 'tr', 'r', 'br', 'b', 'bl', 'l', 'tl'] as const
type Side = (typeof SIDES)[number]

/** 변인가 모서리인가 — 모서리는 한 점이라 여럿을 벌려 놓을 수 없다 */
const isEdge = (s: Side) => s === 'l' || s === 'r' || s === 't' || s === 'b'

/** 그 자리의 좌표. `f` 는 변에서 어디쯤(0~1)인지 — 모서리는 안 쓴다. */
function edgePt(p: { x: number; y: number }, side: Side, f: number) {
  switch (side) {
    case 'l':
      return { x: p.x, y: p.y + H * f }
    case 'r':
      return { x: p.x + W, y: p.y + H * f }
    case 't':
      return { x: p.x + W * f, y: p.y }
    case 'b':
      return { x: p.x + W * f, y: p.y + H }
    case 'tl':
      return { x: p.x, y: p.y }
    case 'tr':
      return { x: p.x + W, y: p.y }
    case 'bl':
      return { x: p.x, y: p.y + H }
    default:
      return { x: p.x + W, y: p.y + H }
  }
}

/** 그 자리에서 밖으로 나가는 쪽 */
const AWAY: Record<Side, { x: number; y: number }> = {
  t: { x: 0, y: -1 },
  tr: { x: 0.71, y: -0.71 },
  r: { x: 1, y: 0 },
  br: { x: 0.71, y: 0.71 },
  b: { x: 0, y: 1 },
  bl: { x: -0.71, y: 0.71 },
  l: { x: -1, y: 0 },
  tl: { x: -0.71, y: -0.71 },
}

/** 마주 보는 자리 — 상대 네모는 반대쪽으로 받는다 */
const FACING: Record<Side, Side> = {
  t: 'b',
  tr: 'bl',
  r: 'l',
  br: 'tl',
  b: 't',
  bl: 'tr',
  l: 'r',
  tl: 'br',
}

/**
 * 상대가 어느 쪽에 있는가 — 여덟 방향 중 하나로.
 *
 * 45도씩 나눈다. 나란히 놓이면 옆구리로, 비스듬하면 모서리로 나간다.
 */
function sideToward(dx: number, dy: number): Side {
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI // -180 ~ 180, 아래가 +
  const i = Math.round(((deg + 360) % 360) / 45) % 8
  // 0도(오른쪽)부터 시계 방향으로
  const ring: Side[] = ['r', 'br', 'b', 'bl', 'l', 'tl', 't', 'tr']
  return ring[i] ?? 'r'
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
  const lines: Array<{
    k: string
    a: string
    b: string
    /** 양 끝의 포트 — 선 가운데가 아니라 **붙는 자리**에 적는다 */
    pa: string
    pb: string
    t: string
    wire: boolean
    at: number
  }> = []
  wiring.forEach((w, i) => {
    if (on.has(devOf(w)) && on.has(w.meter))
      lines.push({
        k: `w${i}`,
        a: devOf(w),
        b: w.meter,
        pa: w.port,
        pb: w.meterPort,
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
        pa: l.a.port,
        pb: l.b.port,
        t: `${l.a.port} ↔ ${l.b.port}`,
        wire: false,
        at: i,
      })
  })

  /*
   * 선이 붙는 자리를 **변 위에 벌린다.**
   *
   * 장비 한 대에 선이 셋이면 셋 다 같은 변 한가운데로 몰려서, 어느 선이
   * 어느 포트인지 눈으로 못 가린다 — 실제 장비는 포트가 스물여덟인데
   * 그림에서는 한 점이었다.
   *
   * 그래서 두 번 센다. 먼저 선마다 어느 변으로 나갈지 정하고, 그 다음
   * 같은 변을 쓰는 선들을 상대 쪽 자리 순으로 줄 세워 고르게 나눈다.
   * 줄 세우지 않고 나누면 선끼리 서로 넘어가며 엇갈린다.
   */
  const ends = lines.map((l) => {
    const A = posOf(l.a)
    const B = posOf(l.b)
    const ac = { x: A.x + W / 2, y: A.y + H / 2 }
    const bc = { x: B.x + W / 2, y: B.y + H / 2 }
    const sa = sideToward(bc.x - ac.x, bc.y - ac.y)
    return { l, A, B, ac, bc, sa, sb: FACING[sa] }
  })

  const slots = new Map<string, Array<{ k: string; order: number }>>()
  const claim = (dev: string, side: Side, k: string, order: number) => {
    const key = `${dev}|${side}`
    const arr = slots.get(key) ?? []
    arr.push({ k, order })
    slots.set(key, arr)
  }
  for (const e of ends) {
    // 옆으로 나가면 상대의 높이로, 위아래로 나가면 상대의 가로 자리로 줄 세운다.
    // 모서리는 한 점이라 나눌 것이 없다.
    if (isEdge(e.sa)) claim(e.l.a, e.sa, e.l.k, e.sa === 'l' || e.sa === 'r' ? e.bc.y : e.bc.x)
    if (isEdge(e.sb)) claim(e.l.b, e.sb, e.l.k, e.sb === 'l' || e.sb === 'r' ? e.ac.y : e.ac.x)
  }
  for (const arr of slots.values()) arr.sort((x, y) => x.order - y.order)
  const fracOf = (dev: string, side: Side, k: string) => {
    const arr = slots.get(`${dev}|${side}`) ?? []
    const i = arr.findIndex((x) => x.k === k)
    return i < 0 ? 0.5 : (i + 1) / (arr.length + 1)
  }

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
                /*
                 * 가까운 변에서 나가고 가까운 변으로 들어간다. 늘 오른쪽으로
                 * 내보내고 왼쪽으로 받게 해 두었더니 상대가 왼쪽이나 아래에
                 * 있으면 선이 네모를 감아 돌며 꼬였다.
                 *
                 * 붙는 자리는 변 한가운데가 아니라 **제 차례**다. 위에서
                 * 나눠 둔 몫을 여기서 쓴다.
                 */
                const l = e.l
                const p1 = edgePt(e.A, e.sa, fracOf(l.a, e.sa, l.k))
                const p2 = edgePt(e.B, e.sb, fracOf(l.b, e.sb, l.k))
                const out = (s: Side, p: { x: number; y: number }, k: number) => ({
                  x: p.x + AWAY[s].x * k,
                  y: p.y + AWAY[s].y * k,
                })
                const k = Math.max(
                  28,
                  Math.hypot(p2.x - p1.x, p2.y - p1.y) / 3,
                )
                const c1 = out(e.sa, p1, k)
                const c2 = out(e.sb, p2, k)

                /*
                 * 포트 이름은 **붙는 자리 옆**에 적는다.
                 *
                 * 전에는 「Te0/3 ↔ 4106/3」 을 선 한가운데 하나로 적었다.
                 * 그러면 어느 이름이 어느 쪽 장비 것인지 짚어 보아야 알고,
                 * 선이 여럿이면 가운데 글자끼리 겹친다. 옛 화면이 포트까지
                 * 그려 주던 것도 이 때문이다.
                 */
                const tag = (s: Side, p: { x: number; y: number }, txt: string, key: string) => {
                  if (!txt) return null
                  const at = out(s, p, 11)
                  const anchor =
                    AWAY[s].x > 0.3 ? 'start' : AWAY[s].x < -0.3 ? 'end' : 'middle'
                  // 위로 나가면 글자를 조금 더 올린다 — 기준선이 글자 아래다
                  const dy = AWAY[s].y < -0.3 ? -2 : AWAY[s].y > 0.3 ? 9 : 3
                  return (
                    <g key={key} className="cv-pt">
                      <text x={at.x} y={at.y + dy} textAnchor={anchor} className="cv-lt-bg">
                        {txt}
                      </text>
                      <text x={at.x} y={at.y + dy} textAnchor={anchor}>
                        {txt}
                      </text>
                    </g>
                  )
                }

                return (
                  <g key={l.k} className={l.wire ? 'cv-l wire' : 'cv-l'}>
                    <path
                      d={`M${p1.x},${p1.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`}
                    />
                    {tag(e.sa, p1, l.pa, `${l.k}a`)}
                    {tag(e.sb, p2, l.pb, `${l.k}b`)}
                  </g>
                )
              })}
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
