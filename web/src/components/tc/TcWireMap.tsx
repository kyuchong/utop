import { useMemo, useState } from 'react'
import { apiFetch } from '@/api/client'
import type { Device } from '@/pages/Devices'
import { deviceLabel, deviceShort, isMeter } from './device'
import type { TcPortLink, TcWire } from './types'
import './TcWireMap.css'

/**
 * 배선 잇기.
 *
 * 처음에는 포트를 늘어놓고 「누르고 반대쪽 누르기」 로 만들었다. 그런데
 * 48포트 장비 둘이면 96줄이 되고, 무엇보다 **처음 쓰는 사람은 그 규칙을
 * 모른다** — 눌러야 하는지 끌어야 하는지 화면이 말해 주지 않는다.
 *
 * 그래서 고르는 칸 넷과 단추 하나로 바꿨다.
 *
 *   [장비 ▾] [포트 ▾]  ↔  [장비 ▾] [포트 ▾]  [연결]
 *
 * 이건 배운 적 없어도 할 수 있다. 아래에 이어진 것을 줄로 적고 각 줄에
 * 「끊기」 를 둔다 — 무엇이 물려 있는지가 글로 보여야 옮겨 적을 수 있다.
 *
 * 계측기가 한쪽에 끼면 트래픽이 읽는 `wiring` 에, 장비끼리면 `portLinks`
 * 에 적는다. 트래픽은 계측기 배선만 읽으므로 둘을 섞지 않는다.
 */

interface Props {
  wiring: TcWire[]
  links: TcPortLink[]
  devices: Device[]
  sessions: string[]
  ports: Record<string, string[]>
  loading?: string
  onLoadPorts?: (meterId: string) => void
  onChange: (v: { wiring?: TcWire[]; links?: TcPortLink[] }) => void
}

export default function TcWireMap({
  wiring,
  links,
  devices,
  sessions,
  ports,
  loading,
  onLoadPorts,
  onChange,
}: Props) {
  const [say, setSay] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const devById = useMemo(() => new Map(devices.map((d) => [d.id, d])), [devices])

  /** 고를 수 있는 것 — 시험에 앉힌 것이 먼저 */
  const all = useMemo(() => {
    const first = sessions.map((s) => devices.find((d) => d.id === s)).filter(Boolean) as Device[]
    return [...first, ...devices.filter((d) => !sessions.includes(d.id))]
  }, [devices, sessions])

  const [aDev, setADev] = useState('')
  const [aPort, setAPort] = useState('')
  const [bDev, setBDev] = useState('')
  const [bPort, setBPort] = useState('')

  const A = all.find((d) => d.id === aDev) ?? all.find((d) => !isMeter(d)) ?? all[0]
  const B =
    all.find((d) => d.id === bDev) ?? all.find((d) => isMeter(d)) ?? all.find((d) => d !== A)

  const portsOf = (d?: Device): string[] => {
    if (!d) return []
    if (isMeter(d)) return ports[d.id] ?? []
    return (d.interfaces ?? []).map((x) => String((x as { name?: string })?.name ?? x))
  }

  const devOf = (w: TcWire) => w.dev || sessions[w.session] || ''
  const nameOf = (id: string) => {
    const d = devById.get(id)
    return d ? deviceShort(d) : id
  }

  /** 이미 물려 있나 — 같은 포트를 두 번 쓰면 실행할 때 엉킨다 */
  const used = (dev: string, port: string) =>
    wiring.some((w) => (devOf(w) === dev && w.port === port) || (w.meter === dev && w.meterPort === port)) ||
    links.some((l) => (l.a.dev === dev && l.a.port === port) || (l.b.dev === dev && l.b.port === port))

  /** 이어진 것 전부 — 한 줄씩 글로 */
  const rows = useMemo(() => {
    const out: Array<{
      k: string
      a: string
      b: string
      aDev: string
      aPort: string
      bDev: string
      bPort: string
      kind: 'wire' | 'link'
      at: number
    }> = []
    wiring.forEach((w, i) => {
      out.push({
        k: `w${i}`,
        a: `${nameOf(devOf(w))} ${w.port}`,
        b: `${nameOf(w.meter)} ${w.meterPort}`,
        aDev: devOf(w),
        aPort: w.port,
        bDev: w.meter,
        bPort: w.meterPort,
        kind: 'wire',
        at: i,
      })
    })
    links.forEach((l, i) => {
      out.push({
        k: `l${i}`,
        a: `${nameOf(l.a.dev)} ${l.a.port}`,
        b: `${nameOf(l.b.dev)} ${l.b.port}`,
        aDev: l.a.dev,
        aPort: l.a.port,
        bDev: l.b.dev,
        bPort: l.b.port,
        kind: 'link',
        at: i,
      })
    })
    return out
  }, [wiring, links, devices, sessions])

  const join = () => {
    if (!A || !B || !aPort || !bPort) return
    if (A.id === B.id && aPort === bPort) return setNote('같은 포트끼리는 잇지 않습니다')
    if (isMeter(A) && isMeter(B)) return setNote('계측기끼리는 잇지 않습니다 — 한쪽은 장비여야 합니다')
    if (used(A.id, aPort) || used(B.id, bPort)) return setNote('이미 물려 있는 포트입니다')
    if (isMeter(A) || isMeter(B)) {
      const d = isMeter(A) ? { dev: B.id, port: bPort } : { dev: A.id, port: aPort }
      const m = isMeter(A) ? { dev: A.id, port: aPort } : { dev: B.id, port: bPort }
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
        links: [...links, { a: { dev: A.id, port: aPort }, b: { dev: B.id, port: bPort } }],
      })
    }
    setNote('')
    setAPort('')
    setBPort('')
  }

  const cut = (r: { kind: 'wire' | 'link'; at: number }) => {
    if (r.kind === 'wire') onChange({ wiring: wiring.filter((_, i) => i !== r.at) })
    else onChange({ links: links.filter((_, i) => i !== r.at) })
  }

  /** 말한 것을 배선으로. 저장하지 않고 목록에만 더한다. */
  const askAi = async () => {
    if (!say.trim()) return
    setBusy(true)
    setNote('')
    try {
      const r = await apiFetch('/api/llm/wiring', {
        method: 'POST',
        body: JSON.stringify({
          text: say,
          devices: all
            .filter((d) => !isMeter(d))
            .map((d) => ({ id: d.id, label: deviceShort(d), ports: portsOf(d) })),
          meters: all
            .filter(isMeter)
            .map((d) => ({ id: d.id, label: deviceShort(d), ports: portsOf(d) })),
        }),
      })
      const j = (await r.json()) as {
        ok?: boolean
        error?: string
        wires?: Array<{ dev: string; port: string; meter: string; meterPort: string }>
        dropped?: string[]
      }
      if (j.ok === false) throw new Error(j.error || '만들지 못했습니다')
      const add: TcWire[] = []
      for (const w of j.wires ?? []) {
        if (used(w.dev, w.port) || used(w.meter, w.meterPort)) continue
        const at = sessions.indexOf(w.dev)
        add.push({
          session: at < 0 ? 0 : at,
          ...(at < 0 ? { dev: w.dev } : {}),
          port: w.port,
          meter: w.meter,
          meterPort: w.meterPort,
        })
      }
      if (add.length) onChange({ wiring: [...wiring, ...add] })
      const bad = (j.dropped ?? []).length
      setNote(
        add.length
          ? `${add.length}줄 이었습니다${bad ? ` · ${bad}줄은 못 이었습니다` : ''}. 아래에서 보고 저장하세요.`
          : `못 알아들었습니다${bad ? ` — ${(j.dropped ?? []).join(' / ')}` : ''}. 아래 칸에서 골라 이어 주세요.`,
      )
      if (add.length) setSay('')
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  /** 한쪽 고르는 칸 — 장비와 포트 */
  const side = (
    d: Device | undefined,
    at: string,
    setAt: (v: string) => void,
    port: string,
    setPort: (v: string) => void,
  ) => {
    const list = portsOf(d)
    return (
      <div className="wm-side">
        <select
          value={at || d?.id || ''}
          onChange={(e) => {
            setAt(e.target.value)
            setPort('')
          }}
        >
          {all.map((x) => (
            <option key={x.id} value={x.id}>
              {isMeter(x) ? `[계측기] ${deviceLabel(x)}` : deviceLabel(x)}
            </option>
          ))}
        </select>
        <select value={port} onChange={(e) => setPort(e.target.value)} disabled={!list.length}>
          <option value="">
            {list.length ? '포트 고르기' : d && isMeter(d) ? '먼저 불러오기' : '등록된 포트 없음'}
          </option>
          {list.map((p) => (
            <option key={p} value={p} disabled={used(d!.id, p)}>
              {p}
              {used(d!.id, p) ? ' (이미 물림)' : ''}
            </option>
          ))}
        </select>
        {d && isMeter(d) && (
          <button
            className="btn small"
            type="button"
            disabled={loading === d.id}
            title="계측기에 직접 물어 포트 목록을 받아옵니다"
            onClick={() => onLoadPorts?.(d.id)}
          >
            {loading === d.id ? '읽는 중…' : '불러오기'}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="wm">
      {/* 골라서 잇기 — 배운 적 없어도 할 수 있는 모양이다 */}
      <div className="wm-join">
        {side(A, aDev, setADev, aPort, setAPort)}
        <i>↔</i>
        {side(B, bDev, setBDev, bPort, setBPort)}
        <button
          className="btn primary"
          type="button"
          disabled={!aPort || !bPort}
          onClick={join}
        >
          연결
        </button>
      </div>

      {/* 말로도 된다. 다만 이것은 곁길이다 — 위의 칸만으로 다 할 수 있다. */}
      <div className="wm-ai">
        <input
          value={say}
          placeholder="말로 적어도 됩니다"
          onChange={(e) => setSay(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void askAi()
          }}
        />
        <button
          className="btn small"
          type="button"
          disabled={busy || !say.trim()}
          onClick={() => void askAi()}
        >
          {busy ? '읽는 중…' : '말로 잇기'}
        </button>
      </div>
      {(() => {
        const dp = portsOf(A)
        const mp = portsOf(B)
        if (!A || !B || !dp.length || !mp.length) return null
        const eg = `${deviceShort(A)} ${dp[0]} 를 ${deviceShort(B)} ${mp[0]} 에 물렸어`
        return (
          <div className="wm-eg">
            <span>예)</span>
            <button type="button" onClick={() => setSay(eg)}>
              {eg}
            </button>
          </div>
        )
      })()}
      {note && <div className="wm-note">{note}</div>}

      {/*
        구성도.
        
        글 목록만으로는 「이게 어떻게 생긴 랩인가」 가 안 그려진다. 장비를
        네모로 두고 물린 데를 선으로 잇는다 — 사람이 종이에 그리는 그대로다.
        선 가운데에 포트를 적어, 그림만 보고도 결과서에 옮겨 적을 수 있게 한다.
      */}
      {rows.length > 0 && (
        <div className="wm-pic">
          {(() => {
            // 그림에 나올 장비 — 왼쪽은 장비, 오른쪽은 계측기가 자연스럽다
            const ids = [...new Set(rows.flatMap((r) => [r.aDev, r.bDev]))]
            //
            // 어느 쪽에 세울까.
            //
            // 계측기는 오른쪽, 장비는 왼쪽이 자연스럽다. 다만 계측기가 안
            // 끼는 배선(장비끼리)이면 오른쪽이 비어 선을 그을 데가 없다 —
            // 그때는 장비를 반씩 갈라 세운다. 처음에 「없으면 통째로 다시
            // 쓴다」 로 두었더니 같은 장비가 양쪽에 두 번 그려졌다.
            //
            const meterIds = ids.filter((i) => isMeter(devById.get(i) ?? ({} as Device)))
            const plainIds = ids.filter((i) => !meterIds.includes(i))
            let left: string[]
            let right: string[]
            if (meterIds.length) {
              left = plainIds
              right = meterIds
            } else {
              const half = Math.ceil(plainIds.length / 2)
              left = plainIds.slice(0, half)
              right = plainIds.slice(half)
            }
            //
            // 자리.
            //
            // 처음에는 상자를 크게 그리고 선을 곧게 그었더니, 같은 칸에
            // 있는 두 장비를 잇는 선이 상자를 가로질러 지나갔다. 같은
            // 칸끼리는 바깥으로 돌려 긋는다.
            //
            const BW = 132
            const BH = 42
            const GAP = 22
            const PAD = 30   // 같은 칸끼리 도는 선이 나갈 자리
            const X2 = 300
            const rowsN = Math.max(left.length, right.length, 1)
            const H = rowsN * (BH + GAP) + 16
            const yOf = (list: string[], i: number) =>
              (H - (list.length * (BH + GAP) - GAP)) / 2 + i * (BH + GAP)
            const at = (id: string): { x: number; y: number; side: 'l' | 'r' } | null => {
              const li = left.indexOf(id)
              if (li >= 0) return { x: PAD, y: yOf(left, li), side: 'l' }
              const ri = right.indexOf(id)
              if (ri >= 0) return { x: PAD + X2, y: yOf(right, ri), side: 'r' }
              return null
            }
            const W = PAD * 2 + X2 + BW
            return (
              <svg
                viewBox={`0 0 ${W} ${H}`}
                width={W}
                height={H}
                className="wm-svg"
              >
                {rows.map((r) => {
                  const a = at(r.aDev)
                  const b = at(r.bDev)
                  if (!a || !b) return null
                  const y1 = a.y + BH / 2
                  const y2 = b.y + BH / 2
                  let d: string
                  let lx: number
                  let ly: number
                  if (a.side === b.side) {
                    // 같은 칸끼리 — 바깥으로 돌린다. 곧게 그으면 상자를 가로지른다.
                    const out = a.side === 'l' ? a.x - PAD + 6 : a.x + BW + PAD - 6
                    const ex = a.side === 'l' ? a.x : a.x + BW
                    d = `M${ex},${y1} C${out},${y1} ${out},${y2} ${ex},${y2}`
                    lx = a.side === 'l' ? out + 4 : out - 4
                    ly = (y1 + y2) / 2 + 3
                  } else {
                    const x1 = a.x < b.x ? a.x + BW : a.x
                    const x2 = a.x < b.x ? b.x : b.x + BW
                    const mx = (x1 + x2) / 2
                    d = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`
                    lx = mx
                    ly = (y1 + y2) / 2 - 3
                  }
                  return (
                    <g key={r.k} className={r.kind === 'wire' ? 'wm-l wire' : 'wm-l'}>
                      <path d={d} />
                      {/* 글자 뒤에 흰 테를 두른다 — 선 위에 겹쳐도 읽힌다 */}
                      {/* 바깥으로 도는 선은 가장자리에 붙으므로 글자를
                          안쪽으로 흘린다 — 가운데 맞춤이면 잘린다 */}
                      <text
                        x={lx}
                        y={ly}
                        textAnchor={a.side === b.side ? (a.side === 'l' ? 'start' : 'end') : 'middle'}
                        className="wm-lt-bg"
                      >
                        {r.aPort} ↔ {r.bPort}
                      </text>
                      <text
                        x={lx}
                        y={ly}
                        textAnchor={a.side === b.side ? (a.side === 'l' ? 'start' : 'end') : 'middle'}
                      >
                        {r.aPort} ↔ {r.bPort}
                      </text>
                    </g>
                  )
                })}
                {[...left, ...right].map((id) => {
                  const pos = at(id)
                  if (!pos) return null
                  const dv = devById.get(id)
                  const meter = isMeter(dv ?? ({} as Device))
                  const nm = dv ? deviceShort(dv) : id
                  // 같은 모델이 둘이면 이름만으로는 안 갈린다 — IP 를 밑에 적는다
                  const dup = ids.some((o) => o !== id && deviceShort(devById.get(o) ?? ({} as Device)) === nm)
                  const ip = dup ? (dv?.ip || dv?.id || '') : ''
                  return (
                    <g key={id} className={`wm-n${meter ? ' meter' : ''}`}>
                      <rect x={pos.x} y={pos.y} width={BW} height={BH} rx="5" />
                      <text
                        x={pos.x + BW / 2}
                        y={pos.y + (ip ? BH / 2 - 2 : BH / 2 + 4)}
                        textAnchor="middle"
                      >
                        {nm}
                      </text>
                      {ip && (
                        <text
                          x={pos.x + BW / 2}
                          y={pos.y + BH / 2 + 11}
                          textAnchor="middle"
                          className="wm-nip"
                        >
                          {ip}
                        </text>
                      )}
                    </g>
                  )
                })}
              </svg>
            )
          })()}
        </div>
      )}

      {/* 이어진 것 — 글로도 적는다. 그림은 한눈에, 글은 옮겨 적을 때 쓴다 */}
      <div className="wm-list">
        <div className="wm-lh">이어진 배선 {rows.length}</div>
        {rows.length === 0 ? (
          <div className="wm-none">아직 없습니다. 위에서 양쪽 포트를 고르고 「연결」 을 누르세요.</div>
        ) : (
          rows.map((r) => (
            <div className="wm-row" key={r.k}>
              <b>{r.a}</b>
              <i>↔</i>
              <b>{r.b}</b>
              {r.kind === 'wire' && <span className="wm-tag">계측기</span>}
              <span className="sp" />
              <button className="btn small" type="button" onClick={() => cut(r)}>
                끊기
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
