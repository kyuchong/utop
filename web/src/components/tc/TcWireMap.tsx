import { useMemo, useState } from 'react'
import { apiFetch } from '@/api/client'
import type { Device } from '@/pages/Devices'
import { deviceLabel, deviceShort, isMeter, meterKind } from './device'
import type { TcPortLink, TcWire } from './types'
import './TcWireMap.css'

/**
 * 배선을 **그림으로** 잇는다.
 *
 * 표로만 적게 두었더니 줄마다 「어느 장비 · 어느 포트 · 어느 계측기 ·
 * 어느 포트」 를 네 번 골라야 했다. 랩에서 하는 일은 「이 포트에서 저
 * 포트로 선이 간다」 하나뿐인데 그것을 적는 데 네 번을 고르니, 배선이
 * 여덟 줄만 되어도 손이 지친다.
 *
 * 왼쪽 포트를 누르고 오른쪽 포트를 누르면 이어진다. 끌지 않는다 —
 * 화면이 좁으면 끌기는 빗나가고, 빗나간 것을 되돌리는 데 또 손이 간다.
 *
 * **양쪽 다 아무거나 고른다.** 처음에는 왼쪽은 장비, 오른쪽은 계측기로
 * 못박아 두었는데, 랩에서는 DUT 끼리 물리는 일이 더 흔하다 — 두 대를
 * 업링크로 잇고 그 사이로 트래픽을 흘리는 시험이 그렇다. 계측기가 아예
 * 안 끼는 시험도 있다.
 *
 * 계측기가 한쪽에 끼면 `wiring` 에, 장비끼리면 `links` 에 적는다.
 * 트래픽은 계측기 배선만 읽으므로 둘을 섞지 않는다.
 */

interface Props {
  wiring: TcWire[]
  links: TcPortLink[]
  devices: Device[]
  /** 시험에 앉힌 장비들 — 고르는 목록에서 위에 먼저 온다 */
  sessions: string[]
  /** 계측기별로 읽어 둔 포트 */
  ports: Record<string, string[]>
  /** 지금 포트를 읽고 있는 계측기 id */
  loading?: string
  /** 계측기에 직접 물어 포트를 받아 온다 */
  onLoadPorts?: (meterId: string) => void
  onChange: (v: { wiring?: TcWire[]; links?: TcPortLink[] }) => void
}

/** 고른 한쪽 — 어느 장비의 어느 포트인가. 계측기도 장비다. */
type Side = { dev: string; port: string } | null

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
  const [held, setHeld] = useState<Side>(null)
  const [say, setSay] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [atL, setAtL] = useState('')
  const [atR, setAtR] = useState('')

  const devById = useMemo(() => new Map(devices.map((d) => [d.id, d])), [devices])

  /** 고를 수 있는 것 전부 — 시험에 앉힌 것이 먼저, 그 뒤에 나머지 */
  const all = useMemo(() => {
    const first = sessions.map((s) => devices.find((d) => d.id === s)).filter(Boolean) as Device[]
    const rest = devices.filter((d) => !sessions.includes(d.id))
    return [...first, ...rest]
  }, [devices, sessions])

  /** 왼쪽은 장비를, 오른쪽은 계측기를 먼저 보인다 — 가장 흔한 짜임이다 */
  const left = all.find((d) => d.id === atL) ?? all.find((d) => !isMeter(d)) ?? all[0]
  const right =
    all.find((d) => d.id === atR) ?? all.find((d) => isMeter(d)) ?? all.find((d) => d !== left)

  /** 그 장비의 포트 — 계측기는 읽어 온 것, 장비는 등록된 것 */
  const portsOf = (d?: Device): string[] => {
    if (!d) return []
    if (isMeter(d)) return ports[d.id] ?? []
    return (d.interfaces ?? []).map((x) => String((x as { name?: string })?.name ?? x))
  }

  const devOf = (w: TcWire) => w.dev || sessions[w.session] || ''

  /** 그 포트에 걸린 선 — 계측기 배선이든 장비끼리든 */
  const lineAt = (dev: string, port: string) => {
    const w = wiring.findIndex(
      (x) => (devOf(x) === dev && x.port === port) || (x.meter === dev && x.meterPort === port),
    )
    if (w >= 0) return { kind: 'wire' as const, at: w }
    const l = links.findIndex(
      (x) => (x.a.dev === dev && x.a.port === port) || (x.b.dev === dev && x.b.port === port),
    )
    if (l >= 0) return { kind: 'link' as const, at: l }
    return null
  }

  /** 그 포트의 상대 — 칸에 적어 준다 */
  const partnerOf = (dev: string, port: string): string => {
    const f = lineAt(dev, port)
    if (!f) return ''
    if (f.kind === 'wire') {
      const w = wiring[f.at]
      if (!w) return ''
      const mine = devOf(w) === dev && w.port === port
      const od = devById.get(mine ? w.meter : devOf(w))
      const op = mine ? w.meterPort : w.port
      return `${od ? deviceShort(od) : ''} ${op}`.trim()
    }
    const l = links[f.at]
    if (!l) return ''
    const mine = l.a.dev === dev && l.a.port === port
    const o = mine ? l.b : l.a
    const od = devById.get(o.dev)
    return `${od ? deviceShort(od) : ''} ${o.port}`.trim()
  }

  /**
   * 한쪽을 눌렀다.
   *
   * 이미 이어진 포트를 누르면 그 선을 지운다 — 지우는 단추를 따로 두면
   * 그림 위에 자잘한 ✕ 가 스무 개 생긴다.
   */
  const tap = (side: Exclude<Side, null>) => {
    const f = lineAt(side.dev, side.port)
    if (f) {
      if (f.kind === 'wire') onChange({ wiring: wiring.filter((_, i) => i !== f.at) })
      else onChange({ links: links.filter((_, i) => i !== f.at) })
      setHeld(null)
      return
    }
    if (!held) {
      setHeld(side)
      return
    }
    if (held.dev === side.dev && held.port === side.port) {
      setHeld(null)
      return
    }
    const a = devById.get(held.dev)
    const b = devById.get(side.dev)
    if (!a || !b) {
      setHeld(null)
      return
    }
    if (isMeter(a) && isMeter(b)) {
      setNote('계측기끼리는 잇지 않습니다 — 한쪽은 장비여야 합니다')
      setHeld(null)
      return
    }
    if (isMeter(a) || isMeter(b)) {
      // 한쪽이 계측기 — 트래픽이 읽는 배선이다
      const d = isMeter(a) ? side : held
      const m = isMeter(a) ? held : side
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
      // 장비끼리 — 랩이 어떻게 생겼나를 적는 것이다
      onChange({ links: [...links, { a: held, b: side }] })
    }
    setHeld(null)
    setNote('')
  }

  const holding = (dev: string, port: string) =>
    held !== null && held.dev === dev && held.port === port

  /** 말한 것을 배선으로. 저장하지 않고 그림에만 그린다. */
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
        if (lineAt(w.dev, w.port)) continue
        const at = sessions.indexOf(w.dev)
        add.push({
          session: at < 0 ? 0 : at,
          ...(at < 0 ? { dev: w.dev } : {}),
          port: w.port,
          meter: w.meter,
          meterPort: w.meterPort,
        })
      }
      onChange({ wiring: [...wiring, ...add] })
      const bad = (j.dropped ?? []).length
      setNote(
        `${add.length}줄 그렸습니다${
          bad ? ` · ${bad}줄은 버렸습니다 — ${(j.dropped ?? []).join(' / ')}` : ''
        }. 맞는지 보고 저장하세요.`,
      )
      if (add.length) setSay('')
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  /** 한쪽 칸 — 무엇을 볼지 고르고, 그 포트를 늘어놓는다 */
  const col = (d: Device | undefined, at: string, setAt: (v: string) => void, side: string) => {
    const list = portsOf(d)
    return (
      <div className="wm-col">
        <div className="wm-ch">
          <select value={at || d?.id || ''} onChange={(e) => setAt(e.target.value)}>
            {all.map((x) => (
              <option key={x.id} value={x.id}>
                {isMeter(x) ? `[계측기] ${deviceLabel(x)}` : deviceLabel(x)}
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
        <div className="wm-box">
          <div className="wm-bh">
            {d ? deviceLabel(d) : '–'}
            {d && isMeter(d) ? ` · ${meterKind(d) === 'stc' ? 'STC' : 'N2X'}` : ''}
          </div>
          {!d || list.length === 0 ? (
            <div className="wm-none">
              {d && isMeter(d)
                ? '포트를 아직 안 읽었습니다 — 위의 「불러오기」 를 누르세요'
                : '등록된 포트가 없습니다 — 장비 화면에서 인터페이스를 넣으세요'}
            </div>
          ) : (
            list.map((p) => {
              const on = !!lineAt(d.id, p)
              return (
                <button
                  key={`${side}${p}`}
                  type="button"
                  className={`wm-port${on ? ' on' : ''}${holding(d.id, p) ? ' held' : ''}`}
                  title={on ? '이어져 있습니다 — 누르면 끊습니다' : '누르고 반대쪽을 누르세요'}
                  onClick={() => tap({ dev: d.id, port: p })}
                >
                  <i />
                  <span>{p}</span>
                  {on && <b>{partnerOf(d.id, p)}</b>}
                </button>
              )
            })
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="wm">
      <div className="wm-ai">
        <input
          value={say}
          placeholder="어느 포트를 어디에 물렸는지 그냥 적으세요"
          onChange={(e) => setSay(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void askAi()
          }}
        />
        <button
          className="btn small primary"
          type="button"
          disabled={busy || !say.trim()}
          onClick={() => void askAi()}
        >
          {busy ? '그리는 중…' : '\u2728 그리기'}
        </button>
      </div>

      {/* 이 랩의 진짜 이름으로 만든 예 — 누르면 칸에 들어간다.
          「자연어로 적으세요」 만 있으면 무슨 말을 알아듣는지 몰라 아무도
          못 적는다. 눌러서 숫자만 고치면 되게 한다. */}
      {(() => {
        const dp = portsOf(left)
        const mp = portsOf(right)
        if (!left || !right || dp.length < 2 || mp.length < 2) return null
        const eg = [
          `${deviceShort(left)} ${dp[0]} 를 ${deviceShort(right)} ${mp[0]} 에 물렸어`,
          `${deviceShort(left)} ${dp[0]}, ${dp[1]} 를 ${mp[0]}, ${mp[1]} 에 각각 물렸어`,
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
          : '포트를 누르고 반대쪽 포트를 누르면 이어집니다. 장비끼리도 됩니다. 이어진 포트를 누르면 끊습니다.'}
      </div>
      <div className="wm-cols">
        {col(left, atL, setAtL, 'L')}
        {col(right, atR, setAtR, 'R')}
      </div>
    </div>
  )
}
