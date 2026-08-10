import { useEffect, useMemo, useState } from 'react'
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
/**
 * 측정 한 줄 — N2X 데몬이 주는 그대로.
 *
 * `idx` 는 스트림 차례다. 이름을 붙여 보내지 않으므로 그것으로 되짚어
 * 어느 스트림인지 적는다.
 */
interface StatRow {
  idx?: number
  tx?: unknown
  rx?: unknown
  loss?: unknown
  latency?: unknown
  misorder?: unknown
  txOct?: unknown
  rxOct?: unknown
  txTput?: unknown
  rxTput?: unknown
  /** STC 는 이름을 함께 준다 */
  name?: unknown
  [k: string]: unknown
}

/** 「-」·빈칸·글자가 섞여 온다. 못 읽으면 0 이다 */
function num(v: unknown): number {
  const n = Number(String(v ?? '').replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

/** 값이 없으면 「–」. 0 은 값이다 — 「–」 로 적으면 안 잰 것처럼 보인다 */
function show(v: unknown, digits = 0): string {
  const raw = String(v ?? '').trim()
  if (!raw || raw === '-') return '–'
  const n = Number(raw.replace(/,/g, ''))
  if (!Number.isFinite(n)) return raw
  return digits ? n.toFixed(digits) : n.toLocaleString()
}

/** 바이트를 사람이 읽는 크기로. 12자리 숫자는 눈으로 못 센다 */
function bytes(v: unknown): string {
  const n = num(v)
  const raw = String(v ?? '').trim()
  if (!raw || raw === '-') return '–'
  if (n < 1024) return `${n} B`
  const u = ['KB', 'MB', 'GB', 'TB']
  let x = n / 1024
  let i = 0
  while (x >= 1024 && i < u.length - 1) {
    x /= 1024
    i++
  }
  return `${x.toFixed(1)} ${u[i]}`
}

export default function TcTraffic({ data, onChange }: Props) {
  const [sel, setSel] = useState(0)
  const [layer, setLayer] = useState<Layer>('l2')
  const [pick, setPick] = useState<Set<number>>(new Set())
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState('')

  const cfg: MeterCfg = data.meterCfg ?? {}
  const streams = cfg.streams ?? []
  /**
   * 이 시험이 쓰는 포트.
   *
   * 비어 있으면 비어 있는 것이다. 전에는 비면 `1/1,1/2` 로 되돌렸는데,
   * 그 번호는 아무 근거 없는 짐작이라 그대로 트래픽이 나가면 스트림이
   * 하나도 안 만들어진다. 게다가 지울 수가 없었다 — 지우는 순간 도로
   * 그 둘이 들어왔다.
   */
  const ports = cfg.ports ?? []

  /**
   * 포트 고르는 칸에 넣을 목록.
   *
   * 지금 그 스트림이 가리키는 포트가 시험 포트 목록에서 빠졌을 수 있다
   * (포트를 바꿨을 때). 그때 목록에 없다고 빼 버리면 칸이 빈 채로 뜨고,
   * 사람이 손대지 않았는데 다음 저장에서 조용히 빈 값이 된다. 지금 값은
   * 늘 남긴다 — 틀린 것이 보여야 고칠 수 있다.
   */
  /**
   * 시험 포트에 없는 자리를 가리키는 스트림.
   *
   * 이것이 트래픽 시작이 「스트림을 하나도 만들지 못했습니다」 로 죽는
   * 이유다. 돌려 보고 나서야 알던 것을 여기서 미리 보인다.
   */
  const badStreams = (cfg.streams ?? [])
    .map((x, i) => ({ x, i }))
    .filter(({ x }) => x.enabled !== false)
    .filter(({ x }) => {
      const a = String(x.src ?? '').trim()
      const b = String(x.dst ?? '').trim()
      return !a || !b || !ports.includes(a) || !ports.includes(b)
    })

  /**
   * 이 열을 이 섀시가 재나.
   *
   * 데몬이 고른 항목 목록(`keys`)에 없으면 값이 영영 안 온다. 값이 없는
   * 것과 못 재는 것은 다르다 — 못 재는 것이면 기준을 걸어 봐야 소용없다.
   */
  const has = (k: string) => statKeys.length === 0 || statKeys.includes(k)
  const th = (label: string, k: string) => (
    <th className={has(k) ? undefined : 'tt-off'} title={has(k) ? undefined : '이 섀시가 재지 않는 항목입니다'}>
      {label}
      {!has(k) && ' *'}
    </th>
  )

  const portOpts = (cur?: string) => {
    const v = (cur ?? '').trim()
    return v && !ports.includes(v) ? [v, ...ports] : ports
  }

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
    setCfg({ streams: [...streams, newStream(n, ports[0] ?? '', ports[1] ?? ports[0] ?? '')] })
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

  /**
   * 측정 결과 — 섀시에서 지금 값을 읽는다.
   *
   * 데몬이 주는 이름을 그대로 쓴다(`txTput`·`rxTput`·`misorder`…). 전에는
   * 화면이 `txRate`·`rxRate` 를 찾고 있어서 속도 칸이 늘 「–」 였다 —
   * 값은 오고 있었는데 아무도 안 읽었다.
   */
  const [stats, setStats] = useState<StatRow[]>([])
  /** 지금 돌고 있나. 조회를 되풀이할지 여기서 정한다 */
  const [running, setRunning] = useState(false)
  /** 돌고 있는 동안 2초마다 다시 읽는다 */
  const [live, setLive] = useState(false)
  /**
   * 이 섀시가 실제로 재 주는 항목.
   *
   * N2X 빌드마다 되는 통계 상수가 다르다. 데몬이 하나씩 넣어 보고 받아
   * 주는 것만 고르는데(`_select_stats`), 그 결과를 화면이 몰랐다. 그래서
   * Throughput 칸이 늘 「–」 여도 「안 흐르나」 인지 「이 섀시가 안 재나」
   * 인지 알 수 없었다. 이제 안 재는 열은 흐리게 두고 그렇다고 적는다.
   */
  const [statKeys, setStatKeys] = useState<string[]>([])
  /** 데몬이 돌려준 그대로 — 무엇이 오는지 눈으로 보는 자리 */
  const [raw, setRaw] = useState('')
  const [rawOpen, setRawOpen] = useState(false)
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
        state?: string
        running?: boolean
        keys?: string
        streams?: StatRow[]
      }
      setRaw(JSON.stringify(j, null, 2))
      if (j.ok === false) throw new Error(j.error || '측정을 읽지 못했습니다')
      const rows = j.streams ?? []
      setStats(rows)
      setRunning(!!j.running)
      setStatKeys(String(j.keys ?? '').split(',').map((x) => x.trim()).filter(Boolean))
      if (kind === 'stc' && j.text) setMsg(j.text.split('\n').slice(0, 3).join(' · '))
      else {
        const t = rows.reduce((a, x) => a + num(x.tx), 0)
        const rr = rows.reduce((a, x) => a + num(x.rx), 0)
        const l = rows.reduce((a, x) => a + num(x.loss), 0)
        setMsg(
          rows.length
            ? `${j.running ? '보내는 중' : '멈춤'} · 보냄 ${t.toLocaleString()} · 받음 ${rr.toLocaleString()} · 손실 ${l.toLocaleString()}`
            : '아직 스트림이 없습니다 — 「트래픽 시작」 뒤에 조회하세요',
        )
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy('')
    }
  }

  /**
   * 실시간 조회.
   *
   * 트래픽은 몇 분씩 돈다. 그동안 손으로 「측정 조회」 를 누르고 있으면
   * 그게 일이 된다. 켜 두면 2초마다 읽고, 멈추면 저절로 끈다 — 아무도
   * 안 보는 화면이 섀시를 계속 두들기지 않게.
   */
  useEffect(() => {
    if (!live || kind === 'stc' || !cfg.chassis) return
    const t = setInterval(() => {
      void readStats()
    }, 2000)
    return () => clearInterval(t)
    // readStats 는 매 렌더 새로 만들어진다 — 넣으면 2초마다 타이머가 갈린다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, kind, cfg.chassis])

  useEffect(() => {
    if (live && !running && stats.length > 0) setLive(false)
  }, [live, running, stats.length])

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

  /**
   * 섀시에 실제로 꽂힌 포트를 읽어 온다.
   *
   * 포트를 손으로 적게 두었더니 「1/1」 같은 짐작이 들어가고, 그러면
   * 트래픽을 시작할 때 스트림이 하나도 안 만들어진다 — 그 자리에 포트가
   * 없으니 핸들을 못 잡는다. 실제 번호를 보고 고르게 한다.
   */
  const [chassisPorts, setChassisPorts] = useState<
    Array<{ id: string; free: boolean; who: string }>
  >([])
  const readPorts = async () => {
    if (!cfg.chassis) {
      setMsg('계측기를 먼저 고르세요')
      return
    }
    setBusy('ports')
    setMsg('')
    try {
      const q = `/api/n2x/ports?server=${encodeURIComponent(cfg.chassis)}&label=${encodeURIComponent(cfg.n2xLabel || 'utop')}`
      const r = await apiFetch(q)
      const j = (await r.json()) as {
        ok?: boolean
        error?: string
        modules?: Array<{
          id: number
          portList?: Array<{ port: number; label?: string; mine?: number; avail?: number }>
        }>
      }
      if (j.ok === false) throw new Error(j.error || '포트를 읽지 못했습니다')
      const out: Array<{ id: string; free: boolean; who: string }> = []
      for (const m of j.modules ?? []) {
        for (const x of m.portList ?? []) {
          out.push({
            id: `${m.id}/${x.port}`,
            free: !!x.avail || !!x.mine,
            who: x.mine ? '내 것' : x.avail ? '빈 포트' : x.label || '사용 중',
          })
        }
      }
      setChassisPorts(out)
      setMsg(`포트 ${out.length}개 · 쓸 수 있는 것 ${out.filter((x) => x.free).length}개`)
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
            <span>
              시험 포트 (쉼표, 예: 4106/1,4106/2)
              {kind !== 'stc' && (
                <button
                  className="btn small tt-portbtn"
                  type="button"
                  disabled={!!busy || !cfg.chassis}
                  title="섀시에 실제로 꽂힌 포트를 읽어 옵니다"
                  onClick={() => void readPorts()}
                >
                  {busy === 'ports' ? '읽는 중…' : '섀시에서 읽기'}
                </button>
              )}
            </span>
            <input
              className="mono"
              list="tt-chassis-ports"
              value={ports.join(',')}
              placeholder="4106/1,4106/2"
              onChange={(e) => {
                const pp = e.target.value.split(',').map((x) => x.trim()).filter(Boolean)
                setCfg({ ports: pp })
              }}
            />
            {chassisPorts.length > 0 && (
              <>
                <datalist id="tt-chassis-ports">
                  {chassisPorts.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.who}
                    </option>
                  ))}
                </datalist>
                {/* 눌러서 넣는다. 목록만 보여 주면 옮겨 적다가 또 틀린다. */}
                <span className="tt-ports">
                  {chassisPorts.map((x) => (
                    <button
                      key={x.id}
                      type="button"
                      className={`tt-port${ports.includes(x.id) ? ' on' : ''}${x.free ? '' : ' busy'}`}
                      title={x.who}
                      onClick={() => {
                        const has = ports.includes(x.id)
                        const next = has ? ports.filter((y) => y !== x.id) : [...ports, x.id]
                        setCfg({ ports: next })
                      }}
                    >
                      {x.id}
                    </button>
                  ))}
                </span>
              </>
            )}
          </label>
        </div>
      </section>

      {/* ── 스트림 ── */}
      <section className="tt-sec">
        <div className="tt-sh">
          <b>스트림</b>
          {badStreams.length > 0 && (
            <span className="tt-warn">
              시험 포트에 없는 자리를 가리키는 스트림 {badStreams.length}개 —
              이대로 시작하면 스트림이 만들어지지 않습니다
            </span>
          )}
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
                        <option value="">— 고르기 —</option>
                        {portOpts(row.src).map((p) => (
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
                        <option value="">— 고르기 —</option>
                        {portOpts(row.dst).map((p) => (
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
                  {fld('보내는 포트 (SRC)', 'src', '', portOpts(s?.src as string | undefined))}
                  {fld('받는 포트 (DST)', 'dst', '', portOpts(s?.dst as string | undefined))}
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
            <label className="tt-live" title="켜 두면 2초마다 다시 읽습니다">
              <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
              실시간
            </label>
          )}
          {stats.length > 0 && (
            <span className={`tt-state${running ? ' on' : ''}`}>
              {running ? '● 보내는 중' : '○ 멈춤'}
            </span>
          )}
          {raw && (
            <button className="btn small" type="button" onClick={() => setRawOpen((v) => !v)}>
              {rawOpen ? '원본 닫기' : '원본'}
            </button>
          )}
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
        {/* 계측기가 뭐라고 답했는지 그대로. 값이 안 맞을 때 여기부터 본다 —
            화면이 잘못 읽는 것인지, 애초에 안 오는 것인지가 여기서 갈린다. */}
        {rawOpen && <pre className="tt-raw">{raw}</pre>}
        {statKeys.length > 0 && statKeys.length < 9 && (
          <div className="tt-note">
            이 섀시가 재는 항목은 {statKeys.length}가지입니다 — <b>*</b> 표시한 열은 값이 오지
            않습니다. 그 열에는 판정 기준을 걸어도 소용없습니다.
          </div>
        )}
        <div className="tt-tablewrap">
          <table className="tt-table tt-stat">
            <thead>
              {/* 열 이름·차례는 N2X 의 Setup Measurements→Streams 와 같다.
                  쓰던 분들이 계측기 화면과 나란히 놓고 대 보는 자리라,
                  여기서만 다른 말로 적으면 그때마다 짝을 맞춰야 한다.
                  손실률만 하나 더 붙였다 — 판정이 그것으로 난다. */}
              <tr>
                <th>Stream</th>
                {th('Tx Test Packets', 'tx')}
                {th('Rx Test Packets', 'rx')}
                {th('Tx Test Octets', 'txoct')}
                {th('Rx Test Octets', 'rxoct')}
                {th('Tx Throughput (Mb/s)', 'txtput')}
                {th('Rx Throughput (Mb/s)', 'rxtput')}
                {th('Rx Packet Loss', 'loss')}
                <th>손실률</th>
                {th('Avg Latency (us)', 'lat')}
                {th('Sequence Errors', 'seq')}
              </tr>
            </thead>
            <tbody>
              {stats.length === 0 ? (
                streams.map((row, i) => (
                  <tr key={i}>
                    <td className="mono">
                      {row.src}→{row.dst}, {row.name}
                    </td>
                    {Array.from({ length: 10 }, (_, k) => (
                      <td key={k}>–</td>
                    ))}
                  </tr>
                ))
              ) : (
                <>
                  {stats.map((r, i) => {
                    // 데몬은 이름을 안 보낸다. idx 로 스트림을 되짚는다.
                    const st = streams[typeof r.idx === 'number' ? r.idx : i]
                    const tx = num(r.tx)
                    const loss = num(r.loss)
                    const rate = tx > 0 ? (loss / tx) * 100 : 0
                    return (
                      <tr key={i} className={loss > 0 ? 'bad' : undefined}>
                        {/* 「4106/1→4106/2, Stream_1_1」 — 쓰시던 양식 그대로.
                            어느 포트에서 어디로 가는 스트림인지가 이름보다 먼저다. */}
                        <td className="mono">
                          {st?.src ? `${st.src}→${st.dst}, ` : ''}
                          {String(r.name ?? st?.name ?? `Stream_${i + 1}`)}
                        </td>
                        <td>{show(r.tx)}</td>
                        <td>{show(r.rx)}</td>
                        <td title={bytes(r.txOct)}>{show(r.txOct)}</td>
                        <td title={bytes(r.rxOct)}>{show(r.rxOct)}</td>
                        <td>{show(r.txTput, 3)}</td>
                        <td>{show(r.rxTput, 3)}</td>
                        <td className={loss > 0 ? 'bad' : undefined}>{show(r.loss)}</td>
                        <td className={loss > 0 ? 'bad' : undefined}>
                          {tx > 0 ? `${rate.toFixed(2)}%` : '–'}
                        </td>
                        <td>{show(r.latency, 2)}</td>
                        <td className={num(r.misorder) > 0 ? 'bad' : undefined}>
                          {show(r.misorder)}
                        </td>
                      </tr>
                    )
                  })}
                  {/* 합계 — 스트림이 여럿이면 한 줄씩 더해 보는 것이 일이다 */}
                  {stats.length > 1 &&
                    (() => {
                      const tx = stats.reduce((a, x) => a + num(x.tx), 0)
                      const rx = stats.reduce((a, x) => a + num(x.rx), 0)
                      const loss = stats.reduce((a, x) => a + num(x.loss), 0)
                      const mis = stats.reduce((a, x) => a + num(x.misorder), 0)
                      return (
                        <tr className="tt-sum">
                          <td>합계 {stats.length}줄</td>
                          <td>{tx.toLocaleString()}</td>
                          <td>{rx.toLocaleString()}</td>
                          <td>{stats.reduce((a, x) => a + num(x.txOct), 0).toLocaleString()}</td>
                          <td>{stats.reduce((a, x) => a + num(x.rxOct), 0).toLocaleString()}</td>
                          <td>{stats.reduce((a, x) => a + num(x.txTput), 0).toFixed(3)}</td>
                          <td>{stats.reduce((a, x) => a + num(x.rxTput), 0).toFixed(3)}</td>
                          <td className={loss > 0 ? 'bad' : undefined}>{loss.toLocaleString()}</td>
                          <td className={loss > 0 ? 'bad' : undefined}>
                            {tx > 0 ? `${((loss / tx) * 100).toFixed(2)}%` : '–'}
                          </td>
                          <td>–</td>
                          <td className={mis > 0 ? 'bad' : undefined}>{mis.toLocaleString()}</td>
                        </tr>
                      )
                    })()}
                </>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
