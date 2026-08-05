import { useEffect, useState } from 'react'
import { apiFetch } from '@/api/client'
import type { Device } from '@/pages/Devices'
import { deviceLabel } from './device'
import type { TcData, TcWire } from './types'

interface Props {
  data: TcData
  devices: Device[]
  onChange: (patch: Partial<TcData>) => void
  /** 장비 목록을 다시 읽어 달라 — 계측기를 여기서 새로 만들었을 때 */
  onDevicesChanged?: () => void
  onMsg: (kind: 'ok' | 'err', text: string) => void
}

/** 계측기인가. 옛 화면과 같은 기준 — role 이 '계측기' 거나 이름에 표가 난다 */
export function isMeter(d: Device): boolean {
  return (
    d.role === '계측기' ||
    d.device_group === '계측기' ||
    /spirent|stc|ixia|n2x/i.test(`${d.model ?? ''} ${d.name ?? ''} ${d.vendor ?? ''}`)
  )
}

/** N2X 인가 STC 인가. 포트 표기도 부르는 API 도 다르다 */
export function meterKind(d: Device | undefined): 'n2x' | 'stc' {
  if (!d) return 'n2x'
  return /spirent|stc/i.test(`${d.model ?? ''} ${d.name ?? ''} ${d.vendor ?? ''}`) ? 'stc' : 'n2x'
}

/**
 * 토폴로지 — 무엇이 무엇에 꽂혀 있나.
 *
 * 여기 적는 것은 **랩의 사실**이지 시험의 내용이 아니다. 한 번 적어 두면
 * 시험은 장비 포트 이름(`Gi0/1`)으로만 말하고, 계측기 포트(`4106/1`)는
 * 여기서 풀린다. 배선이 바뀌면 이 줄만 고치고, 그 배선을 쓰는 시험은 한
 * 건도 안 건드린다.
 *
 * 옛 계측기 창은 스트림 하나에 필드가 60개, 편집 탭이 9개였다. 그런데
 * `meterCfg` 10건 중 9건이 손도 안 댄 기본값이다 — 아무도 못 쓴 것이다.
 * 채워져 있던 것은 포트·MAC·IP·부하뿐이고 MAC·IP 는 아무 값이나 되면
 * 되는 것이라 사람이 정할 이유가 없다. 그래서 여기서는 **꽂힌 자리만**
 * 묻는다.
 */
export default function TcTopology({
  data,
  devices,
  onChange,
  onDevicesChanged,
  onMsg,
}: Props) {
  // TcData 는 세션을 느슨하게 들고 있다(옛 자료에 문자열도 있었다).
  // 여기서 한 번 걸러 쓴다 — TestCases 도 같은 방식이다.
  const sessions = Array.isArray(data.sessions) ? (data.sessions as string[]) : []
  const wiring = data.wiring ?? []
  const meters = devices.filter(isMeter)
  const devById = new Map(devices.map((d) => [d.id, d]))

  /** 계측기별로 불러온 포트 목록 */
  const [ports, setPorts] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState('')
  const [adding, setAdding] = useState(false)

  const set = (i: number, patch: Partial<TcWire>) =>
    onChange({ wiring: wiring.map((w, n) => (n === i ? { ...w, ...patch } : w)) })

  const add = () =>
    onChange({
      wiring: [...wiring, { session: 0, port: '', meter: meters[0]?.id ?? '', meterPort: '' }],
    })

  /**
   * 계측기에 직접 물어 포트 목록을 받아 온다.
   *
   * `4106/1` 을 손으로 치게 하면 안 된다 — 한 글자만 틀려도 실행해 봐야
   * 알고, 그때는 트래픽이 이미 엉뚱한 데로 간 뒤다.
   */
  const loadPorts = async (meterId: string) => {
    const dev = devById.get(meterId)
    if (!dev) return
    setLoading(meterId)
    try {
      const got: string[] = []
      if (meterKind(dev) === 'n2x') {
        const r = await apiFetch(`/api/n2x/ports?server=${encodeURIComponent(dev.ip)}`)
        const j = await r.json().catch(() => ({}))
        if (!j?.ok) throw new Error(j?.error || '계측기가 응답하지 않습니다')
        for (const m of j.modules ?? [])
          for (const p of m.portList ?? []) got.push(`${m.id}/${p.port}`)
      } else {
        const r = await apiFetch('/api/stc/conncheck', {
          method: 'POST',
          body: JSON.stringify({ chassis: dev.ip, restPort: dev.port ?? 8888 }),
        })
        const j = await r.json().catch(() => ({}))
        if (!j?.ok) throw new Error(j?.error || '계측기가 응답하지 않습니다')
        for (const m of j.modules ?? [])
          for (const p of m.ports ?? []) got.push(String(p.location ?? p.name ?? p))
      }
      setPorts((x) => ({ ...x, [meterId]: got }))
      onMsg(got.length ? 'ok' : 'err', got.length ? `포트 ${got.length}개` : '포트가 없습니다')
    } catch (e) {
      onMsg('err', e instanceof Error ? e.message : '포트를 불러오지 못했습니다')
    } finally {
      setLoading('')
    }
  }

  /** 계측기를 그 자리에서 만든다. 장비 화면까지 다녀오게 하면 흐름이 끊긴다 */
  const addMeter = async (f: { name: string; ip: string; kind: 'n2x' | 'stc' }) => {
    try {
      const r = await apiFetch('/api/devices2', {
        method: 'POST',
        body: JSON.stringify({
          ip: f.ip.trim(),
          name: f.name.trim() || f.ip.trim(),
          role: '계측기',
          vendor: f.kind === 'stc' ? 'Spirent' : 'IXIA',
          model: f.kind === 'stc' ? 'Spirent TestCenter' : 'IXIA-N2X',
          ...(f.kind === 'stc' ? { port: 8888 } : {}),
        }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || '만들지 못했습니다')
      onMsg('ok', '계측기를 등록했습니다')
      setAdding(false)
      onDevicesChanged?.()
    } catch (e) {
      onMsg('err', e instanceof Error ? e.message : '만들지 못했습니다')
    }
  }

  return (
    <div className="tp">
      <div className="tp-head">
        <b>배선</b>
        <span className="muted small">
          여기 적는 것은 <b>랩의 사실</b>입니다. 한 번 적어 두면 시험은 <code>Gi0/1</code> 처럼
          장비 포트로만 말하고, 계측기 포트는 여기서 풀립니다.
        </span>
        <span className="sp" />
        <button className="btn small" type="button" onClick={() => setAdding(true)}>
          계측기 등록
        </button>
        <button
          className="btn primary small"
          type="button"
          onClick={add}
          disabled={!sessions.length}
        >
          배선 추가
        </button>
      </div>

      {adding && <MeterForm onSave={addMeter} onClose={() => setAdding(false)} />}

      {!sessions.length ? (
        <div className="empty">
          먼저 <b>세션</b>에 장비를 앉히세요. 배선은 그 장비의 포트를 가리킵니다.
        </div>
      ) : !wiring.length ? (
        <div className="empty">
          아직 배선이 없습니다. 계측기를 쓰는 시험이라면 <b>어느 포트끼리 꽂혀 있는지</b> 한 번만
          적어 두면 됩니다.
        </div>
      ) : (
        <div className="tp-list">
          {wiring.map((w, i) => {
            const dev = devById.get(sessions[w.session] ?? '')
            const meter = devById.get(w.meter)
            const ifs = dev?.interfaces ?? []
            const mports = ports[w.meter] ?? []
            return (
              <div className="tp-row" key={i}>
                <span className="tp-side">
                  <select
                    value={w.session}
                    onChange={(e) => set(i, { session: Number(e.target.value), port: '' })}
                  >
                    {sessions.map((sid, n) => {
                      const d = devById.get(sid)
                      return (
                        <option key={n} value={n}>
                          S{n + 1} · {d ? deviceLabel(d) : sid}
                        </option>
                      )
                    })}
                  </select>
                  {/* 포트 이름은 장비에 등록된 것에서 고른다. 없으면 직접 친다 */}
                  {ifs.length ? (
                    <select value={w.port} onChange={(e) => set(i, { port: e.target.value })}>
                      <option value="">포트…</option>
                      {ifs.map((f) => (
                        <option key={f.name} value={f.name}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="mono"
                      value={w.port}
                      placeholder="Gi0/1"
                      onChange={(e) => set(i, { port: e.target.value })}
                    />
                  )}
                </span>

                <span className="tp-link" aria-hidden="true">
                  ↔
                </span>

                <span className="tp-side">
                  <select
                    value={w.meter}
                    onChange={(e) => set(i, { meter: e.target.value, meterPort: '' })}
                  >
                    <option value="">계측기…</option>
                    {meters.map((m) => (
                      <option key={m.id} value={m.id}>
                        {deviceLabel(m)} · {meterKind(m) === 'stc' ? 'STC' : 'N2X'}
                      </option>
                    ))}
                  </select>
                  {mports.length ? (
                    <select
                      value={w.meterPort}
                      onChange={(e) => set(i, { meterPort: e.target.value })}
                    >
                      <option value="">포트…</option>
                      {mports.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="mono"
                      value={w.meterPort}
                      placeholder={meterKind(meter) === 'stc' ? '1/1/3' : '4106/1'}
                      onChange={(e) => set(i, { meterPort: e.target.value })}
                    />
                  )}
                  <button
                    className="btn small"
                    type="button"
                    disabled={!w.meter || loading === w.meter}
                    title="계측기에 직접 물어 포트 목록을 받아옵니다"
                    onClick={() => loadPorts(w.meter)}
                  >
                    {loading === w.meter ? '…' : '불러오기'}
                  </button>
                </span>

                <button
                  className="btn small"
                  type="button"
                  title="이 배선 지우기"
                  onClick={() => onChange({ wiring: wiring.filter((_, n) => n !== i) })}
                >
                  ✕
                </button>
              </div>
            )
          })}
        </div>
      )}

      {!meters.length && (
        <div className="tp-note">
          등록된 계측기가 없습니다. <b>계측기 등록</b>을 누르면 여기서 바로 만듭니다 — 섀시 주소만
          있으면 되고, 포트는 계측기에 물어봅니다.
        </div>
      )}
    </div>
  )
}

/** 계측기 등록 — 묻는 것은 셋뿐이다. 나머지는 섀시가 알고 있다 */
function MeterForm({
  onSave,
  onClose,
}: {
  onSave: (f: { name: string; ip: string; kind: 'n2x' | 'stc' }) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [ip, setIp] = useState('')
  const [kind, setKind] = useState<'n2x' | 'stc'>('n2x')

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  return (
    <div className="tp-form">
      <label>
        종류
        <select value={kind} onChange={(e) => setKind(e.target.value as 'n2x' | 'stc')}>
          <option value="n2x">IXIA N2X</option>
          <option value="stc">Spirent TestCenter</option>
        </select>
      </label>
      <label>
        섀시 주소
        <input
          className="mono"
          value={ip}
          placeholder="210.1.2.248"
          onChange={(e) => setIp(e.target.value)}
        />
      </label>
      <label>
        이름 <span className="muted small">(선택)</span>
        <input value={name} placeholder="랩 N2X" onChange={(e) => setName(e.target.value)} />
      </label>
      <span className="sp" />
      <button className="btn small" type="button" onClick={onClose}>
        취소
      </button>
      <button
        className="btn primary small"
        type="button"
        disabled={!ip.trim()}
        onClick={() => onSave({ name, ip, kind })}
      >
        등록
      </button>
    </div>
  )
}
