import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/api/client'
import type { Device } from '@/pages/Devices'
import { deviceLabel, isMeter, meterKind } from './device'
import { wireValues, type TcData, type TcWire } from './types'

interface Props {
  data: TcData
  devices: Device[]
  onChange: (patch: Partial<TcData>) => void
  /** 장비 목록을 다시 읽어 달라 — 계측기를 여기서 새로 만들었을 때 */
  onDevicesChanged?: () => void
  onMsg: (kind: 'ok' | 'err', text: string) => void
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
  /** 기본값을 펼친 배선 줄. 평소엔 접혀 있다 — 대개 손댈 일이 없다 */
  const [open, setOpen] = useState<number | null>(null)
  /** 그림을 크게 볼 때. 새 탭으로 띄우면 돌아와서 이 TC 를 다시 찾아야 한다 */
  const [big, setBig] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!big) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setBig(false)
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [big])

  /**
   * 그림 넣기 — 붙여넣기 · 끌어놓기 · 고르기.
   *
   * 시험 문서에 이미 구성도가 있는 경우가 많다. 다시 그리라고 하면 아무도
   * 안 한다. 화면을 캡쳐해서 Ctrl+V 하는 것이 실제로 하는 일이다.
   */
  const upload = async (file: File) => {
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await apiFetch('/api/upload/image', { method: 'POST', body: fd })
      const b = (await r.json().catch(() => ({}))) as { url?: string; name?: string; detail?: string }
      if (!r.ok) throw new Error(b.detail || '올리지 못했습니다')
      onChange({ topo_img: b.url || b.name })
    } catch (e) {
      onMsg('err', e instanceof Error ? e.message : '올리지 못했습니다')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const grab = (items?: DataTransferItemList | null, files?: FileList | null) => {
    let f: File | null = null
    for (const it of Array.from(items ?? [])) {
      if (it.kind === 'file' && it.type.startsWith('image/')) {
        f = it.getAsFile()
        if (f) break
      }
    }
    if (!f) f = Array.from(files ?? []).find((x) => x.type.startsWith('image/')) ?? null
    if (!f) return false
    void upload(f)
    return true
  }

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

      {/* 구성도 그림. 사람이 보는 것 — 배선 표를 대신하지는 못한다 */}
      <div
        className={`tp-pic${data.topo_img ? ' has' : ''}`}
        tabIndex={0}
        onPaste={(e) => {
          if (grab(e.clipboardData?.items, e.clipboardData?.files)) e.preventDefault()
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          if (grab(e.dataTransfer?.items, e.dataTransfer?.files)) e.preventDefault()
        }}
      >
        {data.topo_img ? (
          <div
            className="tp-picbox"
            style={data.topo_img_w ? { width: data.topo_img_w } : undefined}
            onPointerUp={(e) => {
              const now = Math.round(e.currentTarget.offsetWidth)
              if (now > 0 && now !== data.topo_img_w) onChange({ topo_img_w: now })
            }}
          >
            <button type="button" className="tp-picopen" onClick={() => setBig(true)} title="크게 보기">
              <img src={data.topo_img} alt="구성도" />
            </button>
            <button
              type="button"
              className="if-x"
              aria-label="그림 지우기"
              onClick={() => onChange({ topo_img: '', topo_img_w: undefined })}
            >
              ×
            </button>
          </div>
        ) : (
          <div className="tp-picempty">
            <b>구성도 그림</b>
            <span>
              여기를 누르고 <b>Ctrl+V</b> — 문서에 있는 구성도를 그대로 붙여넣으세요. 끌어다
              놓아도 됩니다.
            </span>
            <button
              className="btn small"
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              {busy ? '올리는 중…' : '파일에서'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void upload(f)
              }}
            />
          </div>
        )}
      </div>

      {/* 그림은 사람이 보는 것이고 배선 표는 기계가 읽는 것이다.
          그림만 있으면 실행기는 아무것도 모른다 — 그렇다고 말해 준다. */}
      {data.topo_img && !wiring.length && (
        <div className="tp-warn">
          그림은 <b>사람이 보는 것</b>입니다. 트래픽을 흘리려면 그림에 그려진 대로{' '}
          <b>어느 포트가 어느 계측기 포트에 꽂혔는지</b>를 아래에 한 번 적어야 합니다.
        </div>
      )}

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
              <div className="tp-item" key={i}>
                <div className="tp-row">
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
                  className={`btn small${open === i ? ' primary' : ''}`}
                  type="button"
                  title="이 포트가 늘 쓰는 MAC · IP"
                  onClick={() => setOpen(open === i ? null : i)}
                >
                  기본값
                </button>
                <button
                  className="btn small"
                  type="button"
                  title="이 배선 지우기"
                  onClick={() => onChange({ wiring: wiring.filter((_, n) => n !== i) })}
                >
                  ✕
                </button>
                </div>
                {open === i && <WireDefaults w={w} i={i} onSet={(pt) => set(i, pt)} />}
              </div>
            )
          })}
        </div>
      )}

      {big && data.topo_img && (
        <div className="tp-bigwrap" onClick={() => setBig(false)}>
          <div className="tp-bigbar">
            <button className="btn small" type="button" onClick={() => setBig(false)}>
              닫기
            </button>
          </div>
          <img src={data.topo_img} alt="구성도" />
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

/**
 * 이 포트가 늘 쓰는 값.
 *
 * 비워 두면 자리 번호로 채우되, **무엇으로 채웠는지 자리표시로 보여 준다.**
 * 몰래 정해 두면 멀티캐스트나 라우팅 시험에서 왜 안 되는지 알 수가 없다.
 */
function WireDefaults({
  w,
  i,
  onSet,
}: {
  w: TcWire
  i: number
  onSet: (patch: Partial<TcWire>) => void
}) {
  const v = wireValues(w, i)
  return (
    <div className="tp-def">
      <label>
        MAC
        <input
          className="mono"
          value={w.mac ?? ''}
          placeholder={v.mac}
          onChange={(e) => onSet({ mac: e.target.value })}
        />
      </label>
      <label>
        IP
        <input
          className="mono"
          value={w.ip ?? ''}
          placeholder={v.ip}
          onChange={(e) => onSet({ ip: e.target.value })}
        />
      </label>
      <label>
        /
        <input
          className="mono tp-mask"
          value={w.mask ?? ''}
          placeholder={v.mask}
          onChange={(e) => onSet({ mask: e.target.value })}
        />
      </label>
      <label>
        게이트웨이
        <input
          className="mono"
          value={w.gw ?? ''}
          placeholder={v.gw}
          onChange={(e) => onSet({ gw: e.target.value })}
        />
      </label>
      <label>
        VLAN
        <input
          className="mono tp-mask"
          value={w.vlan ?? ''}
          placeholder="없음"
          onChange={(e) => onSet({ vlan: e.target.value })}
        />
      </label>
      <span className="tp-defnote">
        비워 두면 옅게 적힌 값을 씁니다. 순수 부하 시험이면 손댈 일이 없고,
        <b> 멀티캐스트·라우팅·MAC learning</b> 처럼 주소가 곧 시험 내용일 때만 정하세요.
      </span>
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
