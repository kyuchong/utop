import { useMemo, useState } from 'react'
import { apiFetch } from '@/api/client'
import LlmPick, { useLlmPick } from '@/components/LlmPick'
import type { Device } from '@/pages/Devices'
import { deviceName, deviceShort, isMeter } from './device'
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
  /** 판에 놓인 장비 — 있으면 **이것만** 결선에 나온다 */
  placed?: string[]
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
  placed,
  sessions,
  ports,
  loading,
  onLoadPorts,
  onChange,
}: Props) {
  const [say, setSay] = useState('')
  /** 배선을 누구에게 맡길지 — 이 자리에서 고른 것은 이 자리에만 기억한다(지시) */
  const [llm, setLlm] = useLlmPick('wiring')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const devById = useMemo(() => new Map(devices.map((d) => [d.id, d])), [devices])

  /**
   * 고를 수 있는 것.
   *
   * 판에 장비를 놓았으면 **놓은 것만** 나온다 — 등록장비 전부를 부어
   * 놓으니 랩에 있지도 않은 장비끼리 이어지는 배선이 생겼다. 옛 화면도
   * 배치한 장비만 결선에 내놓았다. 판이 비어 있을 때만 전부 보여 준다.
   */
  const all = useMemo(() => {
    if (placed?.length) {
      return placed.map((id) => devices.find((d) => d.id === id)).filter(Boolean) as Device[]
    }
    const first = sessions.map((s) => devices.find((d) => d.id === s)).filter(Boolean) as Device[]
    return [...first, ...devices.filter((d) => !sessions.includes(d.id))]
  }, [devices, sessions, placed])

  /** 판의 번호 — 그림의 #1 과 목록의 #1 이 같은 장비여야 한다 */
  const noOf = (id: string) => {
    const i = (placed ?? []).indexOf(id)
    return i < 0 ? '' : `#${i + 1} `
  }

  /**
   * 결선 칸에 적는 이름 — **짧게**.
   *
   * 역할·벤더까지 다 적으니(deviceFull) 닫힌 드롭다운에서 뒤가 잘려
   * IP 를 볼 수가 없었다. 여기선 번호·모델·IP·랩이면 장비가 갈린다 —
   * 역할·벤더는 판의 카드에 이미 적혀 있다.
   */
  const pickName = (x: Device) =>
    [deviceShort(x), (x.ip || '').trim(), (x.lab || '').trim()]
      .filter(Boolean)
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .join(' · ')

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
    return noOf(id) + (d ? deviceName(d, devices) : id)
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

  /**
   * 판에 없는 장비의 배선 — 유령이다.
   *
   * 판에 장비를 놓고 쓰는 시험에서, 어느 한쪽이 판에 없는 배선은 그림에
   * 선이 안 그려지는데 포트는 「이미 물림」 으로 잠근다. 판을 안 쓰는
   * (안 놓은) 시험에서는 따지지 않는다.
   */
  const ghostKeys = useMemo(() => {
    const out = new Set<string>()
    if (!placed?.length) return out
    const on = new Set(placed)
    for (const r of rows) {
      if (!on.has(r.aDev) || !on.has(r.bDev)) out.add(r.k)
    }
    return out
  }, [rows, placed])
  const ghosts = rows.filter((r) => ghostKeys.has(r.k))

  const cleanGhosts = () => {
    const wi = new Set(ghosts.filter((g) => g.kind === 'wire').map((g) => g.at))
    const li = new Set(ghosts.filter((g) => g.kind === 'link').map((g) => g.at))
    onChange({
      wiring: wiring.filter((_, i) => !wi.has(i)),
      links: links.filter((_, i) => !li.has(i)),
    })
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
          llm,
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
      /* 이미 물려 있어 건너뛴 것 — 이걸 조용히 버리고 「못 알아들었다」 고
         말했었다. 알아들었는데 못 알아들었다고 하니 사람이 문장만 계속
         고쳐 보게 된다. 무엇을 왜 안 더했는지 그대로 말한다. */
      const dup: string[] = []
      for (const w of j.wires ?? []) {
        if (used(w.dev, w.port) || used(w.meter, w.meterPort)) {
          dup.push(`${nameOf(w.dev)} ${w.port} ↔ ${nameOf(w.meter)} ${w.meterPort}`)
          continue
        }
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
          ? `${add.length}줄 이었습니다${dup.length ? ` · ${dup.length}줄은 이미 있습니다` : ''}${bad ? ` · ${bad}줄은 못 이었습니다` : ''}. 아래에서 보고 저장하세요.`
          : dup.length
            ? `이미 물려 있는 배선입니다 — ${dup.join(' / ')}`
            : bad
              ? `장비·포트 이름을 못 맞췄습니다 — ${(j.dropped ?? []).join(' / ')}. 「예)」 버튼의 실제 이름을 참고하세요.`
              : '못 알아들었습니다. 아래 칸에서 골라 이어 주세요.',
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
              {noOf(x.id)}
              {isMeter(x) ? '[계측기] ' : ''}
              {pickName(x)}
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
        <LlmPick value={llm} onChange={setLlm} />
        <button
          className="btn small"
          type="button"
          disabled={busy || !say.trim()}
          onClick={() => void askAi()}
        >
          {busy && <i className="btn-spin" aria-hidden="true" />}
          말로 잇기
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

      {/* 구성도는 위의 판이 그린다. 여기서도 그렸더니 같은 그림이 두 번
          나와, 어느 것을 봐야 하는지 알 수 없었다. */}
      {/* 이어진 것 — 글로도 적는다. 그림은 한눈에, 글은 옮겨 적을 때 쓴다 */}
      <div className="wm-list">
        <div className="wm-lh">
          이어진 배선 {rows.length}
          {ghosts.length > 0 && (
            <>
              <span className="sp" />
              {/*
                판에 없는 장비의 배선. 그림에는 선이 안 보이는데 포트만
                「이미 물림」 으로 잠겨 있어, 왜 못 잇는지 알 수가 없었다 —
                줄을 지우기 전까지 계속 물고 있는 것이다.
              */}
              <button
                className="btn small"
                type="button"
                title="판에 없는 장비의 배선을 한 번에 끊습니다"
                onClick={cleanGhosts}
              >
                판에 없는 배선 {ghosts.length}줄 정리
              </button>
            </>
          )}
        </div>
        {rows.length === 0 ? (
          <div className="wm-none">아직 없습니다. 위에서 양쪽 포트를 고르고 「연결」 을 누르세요.</div>
        ) : (
          rows.map((r) => (
            <div className="wm-row" key={r.k}>
              <b>{r.a}</b>
              <i>↔</i>
              <b>{r.b}</b>
              {r.kind === 'wire' && <span className="wm-tag">계측기</span>}
              {ghostKeys.has(r.k) && (
                <span className="wm-tag ghost" title="판에 없는 장비의 배선 — 포트만 잡고 있습니다">
                  판에 없음
                </span>
              )}
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
