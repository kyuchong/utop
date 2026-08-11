import { useMemo, useState } from 'react'
import { apiFetch } from '@/api/client'
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
  /** 말로 적는 칸 — 「E5724RL 1·2번을 N2X 4106/3, 4106/4 에 물렸어」 */
  const [say, setSay] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  /**
   * 지금 보고 있는 장비 · 계측기.
   *
   * 등록된 장비의 포트를 한꺼번에 늘어놓았더니 스물넉 장짜리 장비가 둘만
   * 되어도 마흔여덟 줄이 됐다. 어느 것이 어느 장비 것인지 머리글을 위로
   * 올려 가며 확인해야 한다. 장비를 먼저 고르고 그 포트만 본다.
   */
  const [atDev, setAtDev] = useState('')
  const [atMeter, setAtMeter] = useState('')
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

  /**
   * 말한 것을 배선으로.
   *
   * **저장하지 않는다.** 그린 것을 그림으로 보여 주고 사람이 정한다 —
   * 모델이 지어낸 포트가 그대로 저장되면 실행할 때까지 아무도 모른다.
   * 서버도 목록에 없는 것은 걸러 내고 무엇을 버렸는지 돌려준다.
   */
  const askAi = async () => {
    if (!say.trim()) return
    setBusy(true)
    setNote('')
    try {
      const r = await apiFetch('/api/llm/wiring', {
        method: 'POST',
        body: JSON.stringify({
          text: say,
          devices: leftDevs.map((d) => ({
            id: d.id,
            label: deviceLabel(d),
            ports: (d.interfaces ?? []).map((x) => String((x as { name?: string })?.name ?? x)),
          })),
          meters: meters.map((m) => ({
            id: m.id,
            label: deviceLabel(m),
            ports: ports[m.id] ?? [],
          })),
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
        // 이미 있는 줄은 다시 만들지 않는다
        if (wiring.some((x) => devOf(x) === w.dev && x.port === w.port)) continue
        const at = sessions.indexOf(w.dev)
        add.push({
          session: at < 0 ? 0 : at,
          ...(at < 0 ? { dev: w.dev } : {}),
          port: w.port,
          meter: w.meter,
          meterPort: w.meterPort,
        })
      }
      onChange([...wiring, ...add])
      const bad = (j.dropped ?? []).length
      setNote(
        `${add.length}줄 그렸습니다${bad ? ` · ${bad}줄은 버렸습니다 — ${(j.dropped ?? []).join(' / ')}` : ''}. 맞는지 보고 저장하세요.`,
      )
      if (add.length) setSay('')
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

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
      {/*
        말로 적기.
        
        「무엇을 어떻게 적어야 하나」 가 첫 벽이다. 빈 칸에 「자연어로
        적으세요」 만 있으면 아무도 못 적는다 — 무슨 말을 알아듣는지
        모르기 때문이다.
        
        그래서 **이 랩의 진짜 이름으로** 예를 만들어 보여 준다. 누르면
        그대로 칸에 들어가니, 처음 쓰는 사람은 눌러서 숫자만 고치면 된다.
      */}
      <div className="wm-ai">
        <input
          value={say}
          placeholder="어느 포트를 어디에 물렸는지 그냥 적으세요"
          onChange={(e) => setSay(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void askAi()
          }}
        />
        <button className="btn small primary" type="button" disabled={busy || !say.trim()} onClick={() => void askAi()}>
          {busy ? '그리는 중…' : '✨ 그리기'}
        </button>
      </div>
      {/* 이 랩의 진짜 이름으로 만든 예 — 누르면 칸에 들어간다 */}
      {(() => {
        const d = leftDevs.find((x) => x.id === atDev) ?? leftDevs[0]
        const m = meters.find((x) => x.id === atMeter) ?? meters[0]
        if (!d || !m) return null
        const dp = (d.interfaces ?? []).map((x) => String((x as { name?: string })?.name ?? x))
        const mp = ports[m.id] ?? []
        if (dp.length < 2 || mp.length < 2) return null
        const eg = [
          `${deviceLabel(d)} ${dp[0]} 를 ${deviceLabel(m)} ${mp[0]} 에 물렸어`,
          `${deviceLabel(d)} ${dp[0]}, ${dp[1]} 를 ${mp[0]}, ${mp[1]} 에 각각 물렸어`,
        ]
        return (
          <div className="wm-eg">
            <span>이렇게 적으면 됩니다 — 눌러 보세요</span>
            {eg.map((t) => (
              <button key={t} type="button" onClick={() => setSay(t)}>
                {t}
              </button>
            ))}
          </div>
        )
      })()}
      {note && <div className="wm-note">{note}</div>}
      <div className="wm-hint">
        {held
          ? '이제 반대쪽 포트를 누르세요 — 선이 그어집니다'
          : '포트를 누르고, 반대쪽 포트를 누르면 이어집니다. 이어진 포트를 누르면 끊습니다.'}
      </div>
      <div className="wm-cols">
        <div className="wm-col">
          <div className="wm-ch">
            장비
            {leftDevs.length > 1 && (
              <select
                value={atDev || leftDevs[0]?.id || ''}
                onChange={(e) => setAtDev(e.target.value)}
              >
                {leftDevs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {deviceLabel(d)}
                  </option>
                ))}
              </select>
            )}
          </div>
          {leftDevs.length === 0 ? (
            <div className="empty">등록된 장비가 없습니다.</div>
          ) : (
            [leftDevs.find((d) => d.id === atDev) ?? leftDevs[0]].filter(Boolean).map((d) => {
              if (!d) return null
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
          <div className="wm-ch">
            계측기
            {meters.length > 1 && (
              <select
                value={atMeter || meters[0]?.id || ''}
                onChange={(e) => setAtMeter(e.target.value)}
              >
                {meters.map((m) => (
                  <option key={m.id} value={m.id}>
                    {deviceLabel(m)}
                  </option>
                ))}
              </select>
            )}
          </div>
          {meters.length === 0 ? (
            <div className="empty">등록된 계측기가 없습니다.</div>
          ) : (
            [meters.find((m) => m.id === atMeter) ?? meters[0]].filter(Boolean).map((m) => {
              if (!m) return null
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
