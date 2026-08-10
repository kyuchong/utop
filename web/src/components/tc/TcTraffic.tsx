import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { isMeter, meterKind } from './device'
import type { MeterCfg, MeterStream, TcData } from './types'
import type { Device } from '@/pages/Devices'
import './TcTraffic.css'

interface Props {
  data: TcData
  onChange: (patch: Partial<TcData>) => void
}

/** 새 스트림 한 줄 — 옛 화면(_meterNewStream)과 같은 기본값 */
function newStream(n: number, a: string, b: string): MeterStream {
  return {
    name: `Stream_${n}`,
    enabled: true,
    src: a,
    dst: b,
    count: '1',
    packetType: 'IPv4/Ethernet',
    srcMac: '00:00:00:00:00:01',
    dstMac: '00:00:00:00:00:02',
    srcMacTo: '00:00:00:00:00:01',
    dstMacTo: '00:00:00:00:00:02',
    srcMacMod: '고정',
    dstMacMod: '고정',
    srcMacStep: '1',
    dstMacStep: '1',
    vlan: '',
    vlanTo: '',
    vlanMod: '고정',
    vlanStep: '1',
    prio: '0',
    etherType: '0x0800',
    srcIp: '1.1.1.1',
    dstIp: '2.1.1.1',
    srcIpTo: '1.1.1.1',
    dstIpTo: '2.1.1.1',
    srcIpMod: '고정',
    dstIpMod: '고정',
    gw: '1.1.1.254',
    dscp: '0',
    ttl: '64',
    l4proto: 'TCP',
    srcPort: '',
    dstPort: '',
    frameType: 'Ethernet II',
    minByte: '64',
    maxByte: '1518',
    byteType: 'Fixed',
    load: '10',
    unit: 'Mbps',
    frameCnt: '0',
    burst: '1',
    gap: '0',
    direction: '단방향',
  }
}

const MODS = ['고정', '증가', '감소', '무작위']
const UNITS = ['Mbps', 'Percent(%)', 'Frames/sec(fps)', 'bps']
const BYTEMODES = ['Fixed', 'Increment', 'Decrement', 'Random']
const L4 = ['TCP', 'UDP', 'ICMP', '없음']
const ETYPES = ['0x0800', '0x0806', '0x86DD', '0x8100']

type Layer = 'port' | 'load' | 'l2' | 'l3' | 'l4'
const LAYERS: Array<{ k: Layer; label: string }> = [
  { k: 'port', label: '물리 포트 매핑' },
  { k: 'load', label: 'Traffic Load' },
  { k: 'l2', label: 'L2 Ethernet' },
  { k: 'l3', label: 'L3 IP' },
  { k: 'l4', label: 'L4 / 포트' },
]

/**
 * 계측기 트래픽 스튜디오.
 *
 * 무엇을 어떻게 보낼지는 여기서 정하고, 스텝은 「시작·정지·조회」 만 시킨다.
 * 스트림이 여럿이고 VLAN·MAC 증가·L3/L4 까지 있어서 스텝 칸에는 안 들어간다.
 *
 * 자료(`meterCfg`)는 **옛 화면 것을 그대로** 쓴다. 이미 저장된 TC 가 있고
 * 백엔드 변환기도 이 이름을 보기 때문이다 — 새로 지으면 그것들이 다 깨진다.
 */
export default function TcTraffic({ data, onChange }: Props) {
  const [sel, setSel] = useState(0)
  const [layer, setLayer] = useState<Layer>('l2')
  const [pick, setPick] = useState<Set<number>>(new Set())
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState('')

  const cfg: MeterCfg = data.meterCfg ?? {}
  const streams = cfg.streams ?? []
  const ports = cfg.ports?.length ? cfg.ports : ['1/1', '1/2']

  const devQ = useQuery({
    queryKey: ['devices2'],
    queryFn: async () => {
      const r = await apiFetch('/api/devices2')
      if (!r.ok) throw new Error('장비를 불러오지 못했습니다')
      return (await r.json()) as { devices: Device[] }
    },
    staleTime: 60_000,
  })
  const meters = useMemo(
    () => (devQ.data?.devices ?? []).filter((d) => isMeter(d)),
    [devQ.data],
  )
  const curMeter = meters.find((d) => (d.ip ?? '').trim() === (cfg.chassis ?? '').trim())
  const kind = meterKind(curMeter)

  const setCfg = (patch: Partial<MeterCfg>) => onChange({ meterCfg: { ...cfg, ...patch } })
  const setStream = (i: number, patch: Partial<MeterStream>) =>
    setCfg({ streams: streams.map((s, j) => (j === i ? { ...s, ...patch } : s)) })

  const addStream = () => {
    const n = streams.length + 1
    setCfg({ streams: [...streams, newStream(n, ports[0] ?? '1/1', ports[1] ?? ports[0] ?? '1/2')] })
    setSel(streams.length)
  }
  const copyStream = () => {
    const src = streams[sel]
    if (!src) return
    setCfg({ streams: [...streams, { ...src, name: `${src.name ?? 'Stream'}_사본` }] })
    setSel(streams.length)
  }
  const delStreams = () => {
    const idx = pick.size ? pick : new Set([sel])
    if (!idx.size) return
    if (!window.confirm(`스트림 ${idx.size}개를 지웁니다.`)) return
    setCfg({ streams: streams.filter((_, i) => !idx.has(i)) })
    setPick(new Set())
    setSel(0)
  }

  /** 측정 결과 — 섀시에서 지금 값을 읽는다 */
  const [stats, setStats] = useState<Array<Record<string, unknown>>>([])
  const readStats = async () => {
    if (!cfg.chassis) {
      setMsg('계측기를 먼저 고르세요')
      return
    }
    setBusy('stat')
    setMsg('')
    try {
      const path = kind === 'stc' ? '/api/stc/meter/query' : '/api/n2x/traffic/stat'
      const body =
        kind === 'stc'
          ? { cfg: { chassis: cfg.chassis, restIp: 'localhost', restPort: cfg.restPort ?? 8888 } }
          : { server: cfg.chassis, label: cfg.n2xLabel || 'utop' }
      const r = await apiFetch(path, { method: 'POST', body: JSON.stringify(body) })
      const j = (await r.json()) as {
        ok?: boolean
        error?: string
        text?: string
        streams?: Array<Record<string, unknown>>
      }
      if (j.ok === false) throw new Error(j.error || '측정을 읽지 못했습니다')
      setStats(j.streams ?? [])
      if (kind === 'stc' && j.text) setMsg(j.text.split('\n').slice(0, 3).join(' · '))
      else setMsg(`측정 ${(j.streams ?? []).length}줄을 읽었습니다`)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy('')
    }
  }

  /**
   * 섀시가 붙잡고 있는 세션을 놓게 한다.
   *
   * N2X 는 동시에 열 수 있는 세션 수가 정해져 있다. 그것이 차면 트래픽
   * 시작이 「The system already has maximum sessions running」 으로 막히는데,
   * 화면에서는 손쓸 방법이 없어 계측기 앞까지 가야 했다. 세션은 우리가
   * 띄운 Tcl 데몬이 하나씩 쥐고 있으므로 그것을 정리하면 자리가 난다.
   *
   * 남의 세션(다른 PC · N2X GUI)까지 끊지는 못한다 — 그때는 그렇다고 적어
   * 준다. 그것까지 끊었다가는 남이 돌리던 시험을 끊는 셈이다.
   */
  const freeSessions = async () => {
    if (!cfg.chassis) {
      setMsg('계측기를 먼저 고르세요')
      return
    }
    if (!window.confirm(`${cfg.chassis} 로 UTOP 이 열어 둔 N2X 세션을 정리합니다.\n돌고 있는 트래픽이 있으면 끊깁니다.`))
      return
    setBusy('free')
    setMsg('')
    try {
      const r = await apiFetch('/api/n2x/reset', {
        method: 'POST',
        // 라벨을 비워 보낸다 — 이 섀시로 띄운 것을 전부 정리하라는 뜻
        body: JSON.stringify({ server: cfg.chassis }),
      })
      const j = (await r.json()) as { ok?: boolean; count?: number; note?: string; error?: string }
      if (j.ok === false) throw new Error(j.error || '정리하지 못했습니다')
      setMsg(j.note || `세션 ${j.count ?? 0}개를 정리했습니다`)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy('')
    }
  }

  const s = streams[sel]

  /** 표 안에서 바로 고치는 칸 */
  const cell = (i: number, k: keyof MeterStream, w?: number) => (
    <input
      className="tt-in mono"
      style={w ? { width: w } : undefined}
      value={String(streams[i]?.[k] ?? '')}
      onChange={(e) => setStream(i, { [k]: e.target.value })}
      onFocus={() => setSel(i)}
    />
  )

  /** 속성 편집의 한 칸 */
  const fld = (label: string, k: keyof MeterStream, ph?: string, opts?: string[]) => (
    <label className="tt-f">
      <span>{label}</span>
      {opts ? (
        <select value={String(s?.[k] ?? '')} onChange={(e) => setStream(sel, { [k]: e.target.value })}>
          {opts.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          className="mono"
          value={String(s?.[k] ?? '')}
          placeholder={ph}
          onChange={(e) => setStream(sel, { [k]: e.target.value })}
        />
      )}
    </label>
  )

  return (
    <div className="tt">
      {/* ── 기본 정보 ── */}
      <section className="tt-sec">
        <div className="tt-sh">
          <b>기본 정보</b>
          <span className="sp" />
          {cfg.chassis && (
            <span className="muted small">
              {kind === 'stc' ? 'STC' : 'N2X'} · {cfg.chassis}
            </span>
          )}
        </div>
        <div className="tt-basic">
          <label className="tt-f">
            <span>계측기</span>
            <select value={cfg.chassis ?? ''} onChange={(e) => setCfg({ chassis: e.target.value })}>
              <option value="">— 고르기 —</option>
              {meters.map((d) => (
                <option key={d.id} value={d.ip ?? ''}>
                  {d.name || d.id} · {d.ip} ({meterKind(d) === 'stc' ? 'STC' : 'N2X'})
                </option>
              ))}
            </select>
          </label>
          <label className="tt-f">
            <span>{kind === 'stc' ? 'REST 포트' : 'N2X 계정(label)'}</span>
            {kind === 'stc' ? (
              <input
                type="number"
                value={cfg.restPort ?? 8888}
                onChange={(e) => setCfg({ restPort: Number(e.target.value) || 8888 })}
              />
            ) : (
              <input
                value={cfg.n2xLabel ?? 'utop'}
                placeholder="utop"
                onChange={(e) => setCfg({ n2xLabel: e.target.value })}
              />
            )}
          </label>
          <label className="tt-f tt-wide">
            <span>시험 포트 (쉼표, 예: 4106/1,4106/2)</span>
            <input
              className="mono"
              value={ports.join(',')}
              placeholder="4106/1,4106/2"
              onChange={(e) => {
                const pp = e.target.value.split(',').map((x) => x.trim()).filter(Boolean)
                setCfg({ ports: pp.length ? pp : ['1/1', '1/2'] })
              }}
            />
          </label>
        </div>
      </section>

      {/* ── 스트림 ── */}
      <section className="tt-sec">
        <div className="tt-sh">
          <b>스트림</b>
          <button className="btn small" type="button" onClick={addStream}>
            ＋ 추가
          </button>
          <button className="btn small" type="button" disabled={!s} onClick={copyStream}>
            복사
          </button>
          <button
            className="btn small danger"
            type="button"
            disabled={!streams.length}
            onClick={delStreams}
          >
            삭제
          </button>
          <span className="sp" />
          <span className="muted small">{streams.length}개</span>
        </div>

        <div className="tt-tablewrap">
          <table className="tt-table">
            <thead>
              <tr>
                <th />
                <th>활성</th>
                <th>SRC Port</th>
                <th>DST Port</th>
                <th>Stream Name</th>
                <th>Stream.CNT</th>
                <th>L2 Source</th>
                <th>L2 Destination</th>
                <th>L3 Source</th>
                <th>L3 Destination</th>
                <th>Gateway</th>
              </tr>
            </thead>
            <tbody>
              {streams.length === 0 ? (
                <tr>
                  <td colSpan={11} className="tt-empty">
                    스트림이 없습니다. 「＋ 추가」 를 누르세요.
                  </td>
                </tr>
              ) : (
                streams.map((row, i) => (
                  <tr
                    key={i}
                    className={`${i === sel ? 'on' : ''}${pick.has(i) ? ' picked' : ''}`}
                    onClick={() => setSel(i)}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={pick.has(i)}
                        onChange={(e) => {
                          const n = new Set(pick)
                          if (e.target.checked) n.add(i)
                          else n.delete(i)
                          setPick(n)
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={row.enabled !== false}
                        title="끄면 이 스트림은 안 보냅니다"
                        onChange={(e) => setStream(i, { enabled: e.target.checked })}
                      />
                    </td>
                    <td>
                      <select
                        className="tt-in"
                        value={row.src ?? ''}
                        onChange={(e) => setStream(i, { src: e.target.value })}
                      >
                        {ports.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        className="tt-in"
                        value={row.dst ?? ''}
                        onChange={(e) => setStream(i, { dst: e.target.value })}
                      >
                        {ports.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{cell(i, 'name', 150)}</td>
                    <td>{cell(i, 'count', 70)}</td>
                    <td>{cell(i, 'srcMac', 150)}</td>
                    <td>{cell(i, 'dstMac', 150)}</td>
                    <td>{cell(i, 'srcIp', 120)}</td>
                    <td>{cell(i, 'dstIp', 120)}</td>
                    <td>{cell(i, 'gw', 120)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 고른 스트림의 속성 */}
        {s && (
          <div className="tt-edit">
            <div className="tt-eh">
              <b>{s.name || `Stream_${sel + 1}`}</b>
              <span className="tt-tag">{s.packetType || 'IPv4/Ethernet'}</span>
              <span className="muted small">— 속성 편집</span>
            </div>
            <div className="tt-layers" role="tablist">
              {LAYERS.map((l) => (
                <button
                  key={l.k}
                  type="button"
                  role="tab"
                  aria-selected={layer === l.k}
                  className={`tt-layer${layer === l.k ? ' on' : ''}`}
                  onClick={() => setLayer(l.k)}
                >
                  {l.label}
                </button>
              ))}
            </div>

            <div className="tt-panel">
              {layer === 'port' && (
                <div className="tt-grid">
                  {fld('보내는 포트 (SRC)', 'src', '', ports)}
                  {fld('받는 포트 (DST)', 'dst', '', ports)}
                  {fld('방향', 'direction', '', ['단방향', '양방향'])}
                </div>
              )}

              {layer === 'load' && (
                <div className="tt-grid">
                  {fld('부하', 'load', '10')}
                  {fld('단위', 'unit', '', UNITS)}
                  {fld('프레임 종류', 'frameType', 'Ethernet II')}
                  {fld('최소 크기', 'minByte', '64')}
                  {fld('최대 크기', 'maxByte', '1518')}
                  {fld('크기 모드', 'byteType', '', BYTEMODES)}
                  {fld('프레임 수 (0=연속)', 'frameCnt', '0')}
                  {fld('버스트', 'burst', '1')}
                  {fld('간격', 'gap', '0')}
                </div>
              )}

              {layer === 'l2' && (
                <>
                  <div className="tt-box">
                    <div className="tt-bh">L2 Source MAC</div>
                    <div className="tt-grid">
                      {fld('From', 'srcMac', '00:00:00:00:00:01')}
                      {fld('To (자동)', 'srcMacTo', '00:00:00:00:00:0a')}
                      {fld('Step', 'srcMacStep', '1')}
                      {fld('모드', 'srcMacMod', '', MODS)}
                    </div>
                  </div>
                  <div className="tt-box">
                    <div className="tt-bh">L2 Destination MAC</div>
                    <div className="tt-grid">
                      {fld('From', 'dstMac', '00:00:00:00:00:02')}
                      {fld('To (자동)', 'dstMacTo', '')}
                      {fld('Step', 'dstMacStep', '1')}
                      {fld('모드', 'dstMacMod', '', MODS)}
                    </div>
                  </div>
                  <div className="tt-grid">
                    {fld('VLAN ID', 'vlan', '비우면 태그 없음')}
                    {fld('VLAN 모드', 'vlanMod', '', MODS)}
                    {fld('VLAN Step', 'vlanStep', '1')}
                    {fld('Priority (802.1p)', 'prio', '0')}
                    {fld('Ether-Type', 'etherType', '', ETYPES)}
                  </div>
                </>
              )}

              {layer === 'l3' && (
                <>
                  <div className="tt-box">
                    <div className="tt-bh">L3 Source</div>
                    <div className="tt-grid">
                      {fld('From', 'srcIp', '1.1.1.1')}
                      {fld('To (자동)', 'srcIpTo', '')}
                      {fld('모드', 'srcIpMod', '', MODS)}
                    </div>
                  </div>
                  <div className="tt-box">
                    <div className="tt-bh">L3 Destination</div>
                    <div className="tt-grid">
                      {fld('From', 'dstIp', '2.1.1.1')}
                      {fld('To (자동)', 'dstIpTo', '')}
                      {fld('모드', 'dstIpMod', '', MODS)}
                    </div>
                  </div>
                  <div className="tt-grid">
                    {fld('Gateway', 'gw', '1.1.1.254')}
                    {fld('DSCP', 'dscp', '0')}
                    {fld('TTL', 'ttl', '64')}
                  </div>
                  <p className="tt-hint">
                    Gateway 는 보내는 쪽이 붙은 <b>장비 포트의 IP</b> 입니다. 이것이 틀리면
                    프레임이 장비로 안 가고 손실 100% 로 나옵니다.
                  </p>
                </>
              )}

              {layer === 'l4' && (
                <div className="tt-grid">
                  {fld('프로토콜', 'l4proto', '', L4)}
                  {fld('보내는 포트', 'srcPort', '')}
                  {fld('받는 포트', 'dstPort', '')}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ── 측정 결과 ── */}
      <section className="tt-sec">
        <div className="tt-sh">
          <b>측정 결과</b>
          <button
            className="btn small"
            type="button"
            disabled={!!busy || !cfg.chassis}
            onClick={() => void readStats()}
          >
            {busy === 'stat' ? '읽는 중…' : '측정 조회'}
          </button>
          {kind !== 'stc' && (
            <button
              className="btn small"
              type="button"
              disabled={!!busy || !cfg.chassis}
              title="「maximum sessions running」 으로 시작이 막힐 때 — UTOP 이 열어 둔 N2X 세션을 놓습니다"
              onClick={() => void freeSessions()}
            >
              {busy === 'free' ? '정리 중…' : '세션 정리'}
            </button>
          )}
          <span className="muted small">지금 섀시의 값을 읽어 옵니다</span>
          <span className="sp" />
          {msg && <span className="muted small">{msg}</span>}
        </div>
        <div className="tt-tablewrap">
          <table className="tt-table">
            <thead>
              <tr>
                <th>Stream</th>
                <th>Tx 패킷</th>
                <th>Rx 패킷</th>
                <th>손실</th>
                <th>Tx (Mb/s)</th>
                <th>Rx (Mb/s)</th>
                <th>지연 (us)</th>
              </tr>
            </thead>
            <tbody>
              {stats.length === 0 ? (
                streams.map((row, i) => (
                  <tr key={i}>
                    <td className="mono">
                      {row.src}→{row.dst}, {row.name}
                    </td>
                    <td>–</td>
                    <td>–</td>
                    <td>–</td>
                    <td>–</td>
                    <td>–</td>
                    <td>–</td>
                  </tr>
                ))
              ) : (
                stats.map((r, i) => (
                  <tr key={i}>
                    <td className="mono">{String(r.name ?? streams[i]?.name ?? i + 1)}</td>
                    <td>{String(r.tx ?? '–')}</td>
                    <td>{String(r.rx ?? r.received ?? '–')}</td>
                    <td>{String(r.loss ?? r.lost ?? '–')}</td>
                    <td>{String(r.txRate ?? '–')}</td>
                    <td>{String(r.rxRate ?? '–')}</td>
                    <td>{String(r.latency ?? '–')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
