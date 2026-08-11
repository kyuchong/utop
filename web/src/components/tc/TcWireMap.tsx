import { useMemo, useState } from 'react'
import type { Device } from '@/pages/Devices'
import { deviceLabel, isMeter, meterKind } from './device'
import type { TcWire } from './types'
import './TcWireMap.css'

/**
 * 배선을 **그림으로** 잇는다.
 *
 * 표로만 적게 두었더니, 줄마다 「어느 장비 · 어느 포트 · 어느 계측기 ·
 * 어느 포트」 를 네 번 골라야 했다. 랩에서 하는 일은 「이 포트에서 저
 * 포트로 선이 간다」 하나뿐인데, 그것을 적는 데 네 번을 고르니 배선이
 * 여덟 줄만 되어도 손이 지친다.
 *
 * 왼쪽 포트를 누르고 오른쪽 포트를 누르면 선이 그어진다. 끌지 않는다 —
 * 화면이 좁으면 끌기는 빗나가고, 빗나간 것을 되돌리는 데 또 손이 간다.
 *
 * 자료는 표와 **같은 것**을 쓴다. 여기서 그은 선이 곧 그 표의 한 줄이다.
 */

interface Props {
  wiring: TcWire[]
  devices: Device[]
  /** 시험에 앉힌 장비들 — 위에 먼저 보인다 */
  sessions: string[]
  /** 계측기별로 읽어 둔 포트 */
  ports: Record<string, string[]>
  onChange: (w: TcWire[]) => void
}

/** 고른 한쪽 — 장비 쪽이든 계측기 쪽이든 */
type Side =
  | { kind: 'dev'; dev: string; port: string }
  | { kind: 'meter'; meter: string; port: string }
  | null

export default function TcWireMap({ wiring, devices, sessions, ports, onChange }: Props) {
  const [held, setHeld] = useState<Side>(null)
  const devById = useMemo(() => new Map(devices.map((d) => [d.id, d])), [devices])

  /** 왼쪽에 세울 장비 — 시험에 앉힌 것이 먼저, 그 뒤에 나머지 */
  const leftDevs = useMemo(() => {
    const plain = devices.filter((d) => !isMeter(d))
    const first = sessions.map((s) => plain.find((d) => d.id === s)).filter(Boolean) as Device[]
    const rest = plain.filter((d) => !sessions.includes(d.id))
    return [...first, ...rest]
  }, [devices, sessions])

  const meters = useMemo(() => devices.filter(isMeter), [devices])

  /** 이 배선 줄이 가리키는 장비 id — 곧바로 고른 것이 먼저 */
  const devOf = (w: TcWire) => w.dev || sessions[w.session] || ''

  /** 그 포트에 걸린 줄 번호 — 눌러 지울 때 쓴다 */
  const lineAtDev = (dev: string, port: string) =>
    wiring.findIndex((w) => devOf(w) === dev && w.port === port)
  const lineAtMeter = (meter: string, port: string) =>
    wiring.findIndex((w) => w.meter === meter && w.meterPort === port)

  /**
   * 한쪽을 눌렀다.
   *
   * 같은 쪽을 두 번 누르면 고르기를 무른다. 반대쪽을 누르면 선이 그어진다.
   * 이미 이어진 포트를 누르면 그 선을 지운다 — 지우는 단추를 따로 두면
   * 그림 위에 자잘한 ✕ 가 스무 개 생긴다.
   */
  const tap = (side: Exclude<Side, null>) => {
    const already =
      side.kind === 'dev' ? lineAtDev(side.dev, side.port) : lineAtMeter(side.meter, side.port)
    if (already >= 0) {
      onChange(wiring.filter((_, i) => i !== already))
      setHeld(null)
      return
    }
    if (!held) {
      setHeld(side)
      return
    }
    if (held.kind === side.kind) {
      // 같은 쪽을 다시 골랐다 — 방금 것으로 바꾼다
      setHeld(side)
      return
    }
    const d = held.kind === 'dev' ? held : (side as Extract<Side, { kind: 'dev' }>)
    const m = held.kind === 'meter' ? held : (side as Extract<Side, { kind: 'meter' }>)
    const at = sessions.indexOf(d.dev)
    onChange([
      ...wiring,
      {
        session: at < 0 ? 0 : at,
        // 시험에 안 앉힌 장비면 곧바로 가리킨다
        ...(at < 0 ? { dev: d.dev } : {}),
        port: d.port,
        meter: m.meter,
        meterPort: m.port,
      },
    ])
    setHeld(null)
  }

  const holding = (side: Exclude<Side, null>) =>
    held !== null &&
    held.kind === side.kind &&
    (side.kind === 'dev'
      ? held.kind === 'dev' && held.dev === side.dev && held.port === side.port
      : held.kind === 'meter' && held.meter === side.meter && held.port === side.port)

  const cell = (
    on: boolean,
    hold: boolean,
    label: string,
    partner: string,
    onClick: () => void,
  ) => (
    <button
      type="button"
      className={`wm-port${on ? ' on' : ''}${hold ? ' held' : ''}`}
      title={on ? `${partner} 와 이어져 있습니다 — 누르면 끊습니다` : '누르고 반대쪽을 누르세요'}
      onClick={onClick}
    >
      <i />
      <span>{label}</span>
      {on && <b>{partner}</b>}
    </button>
  )

  return (
    <div className="wm">
      <div className="wm-hint">
        {held
          ? '이제 반대쪽 포트를 누르세요 — 선이 그어집니다'
          : '포트를 누르고, 반대쪽 포트를 누르면 이어집니다. 이어진 포트를 누르면 끊습니다.'}
      </div>
      <div className="wm-cols">
        <div className="wm-col">
          <div className="wm-ch">장비</div>
          {leftDevs.length === 0 ? (
            <div className="empty">등록된 장비가 없습니다.</div>
          ) : (
            leftDevs.map((d) => {
              const ifs = d.interfaces ?? []
              return (
                <div className="wm-box" key={d.id}>
                  <div className="wm-bh">{deviceLabel(d)}</div>
                  {ifs.length === 0 ? (
                    <div className="wm-none">등록된 포트가 없습니다 — 장비 화면에서 넣으세요</div>
                  ) : (
                    ifs.map((p) => {
                      const name = String((p as { name?: string })?.name ?? p)
                      const at = lineAtDev(d.id, name)
                      const w = at >= 0 ? wiring[at] : undefined
                      return (
                        <div key={name}>
                          {cell(
                            at >= 0,
                            holding({ kind: 'dev', dev: d.id, port: name }),
                            name,
                            w ? `${w.meterPort}` : '',
                            () => tap({ kind: 'dev', dev: d.id, port: name }),
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              )
            })
          )}
        </div>

        <div className="wm-col">
          <div className="wm-ch">계측기</div>
          {meters.length === 0 ? (
            <div className="empty">등록된 계측기가 없습니다.</div>
          ) : (
            meters.map((m) => {
              const list = ports[m.id] ?? []
              return (
                <div className="wm-box" key={m.id}>
                  <div className="wm-bh">
                    {deviceLabel(m)} · {meterKind(m) === 'stc' ? 'STC' : 'N2X'}
                  </div>
                  {list.length === 0 ? (
                    <div className="wm-none">
                      포트를 아직 안 읽었습니다 — 아래 표의 「불러오기」 를 누르세요
                    </div>
                  ) : (
                    list.map((p) => {
                      const at = lineAtMeter(m.id, p)
                      const w = at >= 0 ? wiring[at] : undefined
                      const dl = w ? devById.get(devOf(w)) : undefined
                      return (
                        <div key={p}>
                          {cell(
                            at >= 0,
                            holding({ kind: 'meter', meter: m.id, port: p }),
                            p,
                            w ? `${dl ? deviceLabel(dl) : ''} ${w.port}`.trim() : '',
                            () => tap({ kind: 'meter', meter: m.id, port: p }),
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
