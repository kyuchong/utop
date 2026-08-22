import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { isMeter, meterKind } from './device'
import MeterStats, { statNum as num, type StatRow } from './MeterStats'
import type { MeterCfg, MeterStream, TcData } from './types'
import type { Device } from '@/pages/Devices'
import './TcTraffic.css'

interface Props {
  data: TcData
  onChange: (patch: Partial<TcData>) => void
}

/** 새 스트림 한 줄 — 옛 화면(_meterNewStream)과 같은 기본값 */
/*
 * 끝 주소는 **스스로 셈한다.**
 *
 * From·Step·개수를 적어 놓고도 To 를 손으로 또 적어야 했다. 셋 중 하나만
 * 고쳐도 To 가 옛 값으로 남는데 화면에는 아무 표시가 없어서, 계측기는
 * 열 개를 뿌리는데 사람은 백 개인 줄 알고 판정 기준을 세웠다.
 *
 * 「고정」 이면 끝이 곧 시작이다. 「증가·감소」 면 시작에서 걸음 × (개수-1)
 * 만큼 간 자리다.
 */
function macToNum(v: string): bigint | null {
  const h = String(v ?? '').replace(/[^0-9a-f]/gi, '')
  if (h.length !== 12) return null
  try {
    return BigInt('0x' + h)
  } catch {
    return null
  }
}

function numToMac(n: bigint): string {
  const h = (n & 0xffffffffffffn).toString(16).padStart(12, '0')
  return (h.match(/.{2}/g) ?? []).join(':')
}

function ipToNum(v: string): number | null {
  const p = String(v ?? '').trim().split('.')
  if (p.length !== 4) return null
  let n = 0
  for (const x of p) {
    const d = Number(x)
    if (!Number.isInteger(d) || d < 0 || d > 255) return null
    n = n * 256 + d
  }
  return n
}

function numToIp(n: number): string {
  const m = ((n % 4294967296) + 4294967296) % 4294967296
  return [(m >>> 24) & 255, (m >>> 16) & 255, (m >>> 8) & 255, m & 255].join('.')
}

/**
 * 끝 주소.
 *
 * 개수는 **몇 개**를 뜻한다. 10 이라 적으면 시작부터 열 개이니 끝은
 * 시작 + 9 다. 처음에는 「한 칸에 얼마씩」 으로 잡고 개수를 따로 두었는데,
 * 그러면 10 을 적어도 개수가 1인 한 끝이 그대로라 「반영이 안 된다」 로
 * 보인다. 계측기 화면들이 쓰는 뜻(Count)에 맞춘다.
 */
function endOf(from: string, mod: string, cnt: string, kind: 'mac' | 'ip'): string {
  const n = Math.max(1, Number(cnt) || 1)
  const dir = mod === '감소' ? -1 : 1
  if (incOf(mod) === 'No') return from
  if (kind === 'mac') {
    const a = macToNum(from)
    return a === null ? from : numToMac(a + BigInt(dir * (n - 1)))
  }
  const a = ipToNum(from)
  return a === null ? from : numToIp(a + dir * (n - 1))
}

/**
 * 주소 목록 — 시작에서 개수만큼.
 *
 * 「From 1, To 10」 만 보고는 그 사이가 어떻게 채워지는지 알 수 없다.
 * 미리보기는 실제로 나갈 값을 늘어놓아 보여 준다.
 */
function listOf(from: string, mod: string, cnt: string, kind: 'mac' | 'ip'): string[] {
  const n = Math.max(1, Number(cnt) || 1)
  const dir = mod === '감소' ? -1 : 1
  if (!String(from ?? '').trim()) return []
  if (incOf(mod) === 'No') return [from]
  const out: string[] = []
  if (kind === 'mac') {
    const a = macToNum(from)
    if (a === null) return [from]
    for (let i = 0; i < n; i++) out.push(numToMac(a + BigInt(dir * i)))
    return out
  }
  const a = ipToNum(from)
  if (a === null) return [from]
  for (let i = 0; i < n; i++) out.push(numToIp(a + dir * i))
  return out
}

function newStream(n: number, a: string, b: string): MeterStream {
  return {
    name: `Stream_${n}`,
    enabled: true,
    src: a,
    dst: b,
    count: '1',
    /*
     * 새 스트림은 **L2 로 시작한다.**
     *
     * IP 와 L4 를 미리 채워 두었더니, L2 시험을 하려는 사람이 그것을 하나씩
     * 지워야 했다 — 안 지우면 IPv4+TCP 로 나가고, 장비가 라우팅을 안 하니
     * 손실 100% 로 보인다. 랩에서 제일 잦은 것이 L2 라 그것을 기본으로
     * 둔다. IP 를 적는 순간 IPv4 가 되고(위 표의 「헤더」 칸이 그때 바뀐다),
     * L4 를 고르면 UDP·TCP 까지 붙는다.
     */
    packetType: 'Ethernet',
    /*
     * MAC 은 **줄마다 다르게** 시작한다.
     *
     * 늘 01·02 로 만들었더니 스트림을 넷 만들면 넷이 같은 MAC 으로 나갔다.
     * 장비는 그것을 한 대로 보고 MAC 표를 한 줄만 잡는다 — 포트가 바뀔
     * 때마다 학습이 흔들리고, 무엇이 어느 스트림의 것인지도 못 가린다.
     * 첫 줄 01·02, 둘째 줄 03·04 … 로 벌려 둔다.
     */
    srcMac: numToMac(BigInt(n * 2 - 1)),
    dstMac: numToMac(BigInt(n * 2)),
    srcMacTo: numToMac(BigInt(n * 2 - 1)),
    dstMacTo: numToMac(BigInt(n * 2)),
    srcMacMod: '고정',
    dstMacMod: '고정',
    srcMacStep: '1',
    dstMacStep: '1',
    vlan: '',
    vlanTo: '',
    vlanMod: '고정',
    vlanStep: '1',
    prio: '0',
    etherType: '0x0800 (IPv4)',
    srcIp: '',
    dstIp: '',
    srcIpTo: '',
    dstIpTo: '',
    srcIpMod: '고정',
    dstIpMod: '고정',
    gw: '',
    dscp: '0',
    ttl: '64',
    l4proto: '없음',
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

/*
 * 늘릴까 말까 — **Yes / No**.
 *
 * 「고정·증가·감소·무작위」 넷으로 두었는데, N2X 는 칸마다 「늘릴래?」 를
 * 예·아니오로 묻는다. 화면이 계측기와 다른 말을 쓰면 옮겨 적을 때마다
 * 머리로 한 번 번역해야 한다.
 *
 * 옛 자료에는 「증가」·「고정」 이 그대로 들어 있다. 읽을 때만 Yes/No 로
 * 보여 주고(`incOf`), 새로 고르면 Yes/No 로 적힌다.
 */
const MODS = ['Yes', 'No']

/** 이 칸이 늘어나는가 — 옛 말(증가·감소)도 함께 읽는다 */
function incOf(v: unknown): 'Yes' | 'No' {
  const t = String(v ?? '').trim()
  return t === 'Yes' || t === '증가' || t === '감소' ? 'Yes' : 'No'
}
const UNITS = ['Mbps', 'Percent(%)', 'Frames/sec(fps)', 'bps']
const BYTEMODES = ['Fixed', 'Increment', 'Decrement', 'Random']
const L4 = ['TCP', 'UDP', 'ICMP', '없음']

/*
 * 스트림 속성의 갈래.
 *
 * 전에 다섯이었을 때는 「부하를 고치고 L2 를 보려면」 탭을 예닐곱 번
 * 오갔다. 셋으로 묶으니 한 번에 손대는 것이 한 갈래 안에 다 있다 —
 * 어디로 얼마나 / MAC 과 VLAN / IP 와 GW.
 */
type Layer = 'send' | 'l2' | 'l3'
const LAYERS: Array<{ k: Layer; label: string }> = [
  { k: 'send', label: '포트 · 방향 · 부하' },
  { k: 'l2', label: 'L2 Packet' },
  { k: 'l3', label: 'L3 Packet · L4' },
]
/*
 * Ether-Type — 번호 뒤에 이름을 붙인다.
 *
 * `0x0806` 만 적혀 있으면 그것이 ARP 인지 IPv6 인지 외우고 있어야 한다.
 * 고를 때 바로 알아보게 이름을 같이 적는다. 계측기로 나갈 때는 앞의
 * 번호만 쓴다(`etherNum`).
 */
const ETYPES = ['0x0800 (IPv4)', '0x0806 (ARP)', '0x86DD (IPv6)', '0x8100 (VLAN)']

/** 「0x0806 (ARP)」 에서 계측기가 받는 부분만 */
export function etherNum(v: string): string {
  return String(v ?? '').trim().split(/\s+/)[0] || ''
}

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
  const [pick, setPick] = useState<Set<number>>(new Set())
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState('')
  /** 섀시 포트 칩을 다 펴 두었나 — 44개가 늘 세 줄을 먹는다 */
  const [portsOpen, setPortsOpen] = useState(false)
  /** 무엇이 나갈지 미리 보여 주는 창 */
  const [preview, setPreview] = useState(false)
  const [layer, setLayer] = useState<Layer>('send')

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
   * 보낼 곳이 안 정해진 스트림.
   *
   * 처음엔 「시험 포트 목록에 없는 포트를 쓰면」 경고하게 했는데, 그것은
   * 틀린 말이었다 — N2X 는 시험 포트 칸을 안 본다. 스트림의 SRC/DST 를
   * 그대로 쓴다(그 칸은 STC 가 포트를 잡을 때 쓴다). 멀쩡히 도는 설정에
   * 붉은 경고를 띄워 사람을 헷갈리게 했다.
   *
   * 정말 못 도는 것은 **SRC 나 DST 가 비어 있을 때** 하나다.
   */
  const badStreams = (cfg.streams ?? [])
    .map((x, i) => ({ x, i }))
    .filter(({ x }) => x.enabled !== false)
    .filter(({ x }) => !String(x.src ?? '').trim() || !String(x.dst ?? '').trim())

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
  /**
   * STC REST 서버 포트.
   *
   * 여기서만 8888 로 박아 두었더니, REST 서버를 다른 포트로 띄운 랩에서는
   * 이 탭만 못 붙었다 — 계측기 등록 화면은 **등록해 둔 포트**로 묻고 있어서
   * 거기서는 되고 여기서는 「stcweb.exe 를 찾을 수 없습니다」 가 떴다
   * (지적). 등록한 값이 정본이고, 이 탭 값은 그것을 덮어쓸 때만 쓴다.
   */
  const restPort = Number(cfg.restPort ?? curMeter?.port ?? 8888) || 8888
  /**
   * REST 서버 주소.
   *
   * STC 는 자리가 둘이다 — **섀시**(장비 IP)와 **REST 서버**(윈도우 PC).
   * 이 탭은 REST 서버를 `localhost` 로 박아 두었는데 백엔드는 리눅스라
   * 거기엔 아무도 없다(지적). 계측기 등록의 stc 접속 줄에 그 주소가
   * 이미 있다 — 그것을 쓴다. 서버도 같은 곳을 한 번 더 본다.
   */
  const restIp =
    (curMeter?.access ?? []).find((a) => String(a.protocol ?? '').toLowerCase() === 'stc')?.host ||
    ''


  const setCfg = (patch: Partial<MeterCfg>) => onChange({ meterCfg: { ...cfg, ...patch } })
  const setStream = (i: number, patch: Partial<MeterStream>) =>
    setCfg({
      streams: streams.map((s, j) => {
        if (j !== i) return s
        const v = { ...s, ...patch }
        // 시작·개수·모드 중 무엇이 바뀌든 끝은 따라 바뀐다
        return {
          ...v,
          srcMacTo: endOf(v.srcMac ?? '', v.srcMacMod ?? '', v.srcMacStep ?? '1', 'mac'),
          dstMacTo: endOf(v.dstMac ?? '', v.dstMacMod ?? '', v.dstMacStep ?? '1', 'mac'),
          srcIpTo: endOf(v.srcIp ?? '', v.srcIpMod ?? '', v.srcIpStep ?? '1', 'ip'),
          dstIpTo: endOf(v.dstIp ?? '', v.dstIpMod ?? '', v.dstIpStep ?? '1', 'ip'),
          vlanTo: endOf(v.vlan ?? '', v.vlanMod ?? '', v.vlanStep ?? '1', 'ip'),
        }
      }),
    })

  const addStream = () => {
    const n = streams.length + 1
    setCfg({ streams: [...streams, newStream(n, ports[0] ?? '', ports[1] ?? ports[0] ?? '')] })
    setSel(streams.length)
  }
  const copyStream = () => {
    const src = streams[sel]
    if (!src) return
    // 사본도 MAC 을 벌린다 — 그대로 베끼면 장비가 둘을 한 대로 본다
    const n = streams.length + 1
    setCfg({
      streams: [
        ...streams,
        {
          ...src,
          name: `${src.name ?? 'Stream'}_사본`,
          srcMac: numToMac(BigInt(n * 2 - 1)),
          dstMac: numToMac(BigInt(n * 2)),
          srcMacTo: endOf(numToMac(BigInt(n * 2 - 1)), src.srcMacMod ?? '', src.srcMacStep ?? '1', 'mac'),
          dstMacTo: endOf(numToMac(BigInt(n * 2)), src.dstMacMod ?? '', src.dstMacStep ?? '1', 'mac'),
        },
      ],
    })
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
          ? { cfg: { chassis: cfg.chassis, restIp, restPort } }
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
    Array<{ id: string; free: boolean; mine: boolean; who: string; state: string; lock: string }>
  >(() =>
    /* 지난번에 읽어 둔 것으로 **먼저 그린다**. 섀시에 묻는 값은 수십 초라,
       다시 열 때마다 빈 화면을 보고 기다릴 이유가 없다(지적: 느리다).
       언제 읽은 것인지는 아래 줄이 말한다. */
    ((data.meterCfg?.seenPorts as string[] | undefined) ?? []).map((id) => ({
      id,
      free: true,
      mine: false,
      who: '지난번에 읽은 포트',
      state: 'seen',
      lock: '',
    })),
  )
  /**
   * N2X 기계의 데몬이 옛 판인가.
   *
   * 이 스크립트는 리눅스가 아니라 그 기계의 사본이 돈다. 저장소만 고치고
   * 서버를 다시 올려도 실제로 도는 것은 안 바뀌는데, 화면에는 그 사실이
   * 어디에도 없었다 — 부하 단위를 고쳐도 계속 100pps 로 나가는 이유를
   * 알 길이 없었다.
   */
  const [stale, setStale] = useState('')
  /** 옛 판이라 파일을 옮겨야 하는가 — 아예 안 닿는 것과 다르다 */
  const [staleFix, setStaleFix] = useState(false)
  const checkVer = async () => {
    if (!cfg.chassis || kind === 'stc') return
    try {
      const q = `/api/n2x/ver?server=${encodeURIComponent(cfg.chassis)}&label=${encodeURIComponent(cfg.n2xLabel || 'utop')}`
      const r = await apiFetch(q)
      const j = (await r.json()) as { stale?: boolean; reachable?: boolean; note?: string }
      setStale(String(j.note ?? ''))
      setStaleFix(!!j.stale)
    } catch {
      /* 못 물어봐도 하던 일은 계속한다 */
    }
  }

  /**
   * GW 에게 ARP 를 보내 **L2 DST 를 알아낸다.**
   *
   * L3 로 쏘려면 프레임의 목적지 MAC 이 첫 홉(=GW)의 MAC 이어야 한다.
   * 지금까지는 그것을 사람이 장비에서 `show arp` 로 읽어 손으로 옮겨
   * 적었다. 한 자만 틀려도 프레임이 장비로 안 가고 손실 100% 로 나오는데,
   * 화면에는 「안 받았다」 만 뜬다 — 무엇이 틀렸는지가 안 보인다.
   *
   * 받아 온 MAC 은 고른 스트림의 L2 DST 에 바로 넣는다. 물어만 보고
   * 적는 것은 사람에게 맡기면 옮겨 적다 또 틀린다.
   */
  const sendArp = async (at = sel) => {
    const row = streams[at]
    if (!cfg.chassis) return setMsg('계측기를 먼저 고르세요')
    const gw = String(row?.gw ?? '').trim()
    if (!gw) return setMsg('GW 를 먼저 적으세요 — 보내는 쪽이 붙은 장비 포트의 IP 입니다')
    setBusy('arp')
    setMsg('')
    try {
      if (kind === 'stc') {
        const r = await apiFetch('/api/stc/meter/arp', {
          method: 'POST',
          body: JSON.stringify({
            cfg: { chassis: cfg.chassis, restIp, restPort },
          }),
        })
        const j = (await r.json()) as { ok?: boolean; error?: string; text?: string; mac?: string }
        setRaw(JSON.stringify(j, null, 2))
        if (j.ok === false) throw new Error(j.error || 'ARP 를 보내지 못했습니다')
        // 응답 어디에 있든 MAC 꼴을 찾아 쓴다 — 도구마다 적는 자리가 다르다
        const mac = j.mac || (String(j.text ?? '').match(/([0-9a-f]{2}[:-]){5}[0-9a-f]{2}/i) ?? [])[0]
        if (mac) {
          setStream(at, { dstMac: mac })
          setMsg(`${gw} → ${mac} — L2 DST 에 넣었습니다`)
        } else {
          setMsg(`${gw} 의 MAC 을 못 받았습니다. 「원본」 을 열어 보세요`)
        }
      } else {
        const r = await apiFetch('/api/n2x/arp', {
          method: 'POST',
          body: JSON.stringify({
            server: cfg.chassis,
            label: cfg.n2xLabel || 'utop',
            port: row?.src ?? '',
            gw,
            srcIp: row?.srcIp ?? '',
            srcMac: row?.srcMac ?? '',
          }),
        })
        const j = (await r.json()) as { ok?: boolean; error?: string; mac?: string }
        setRaw(JSON.stringify(j, null, 2))
        if (j.ok === false) throw new Error(j.error || 'ARP 를 보내지 못했습니다')
        if (j.mac) {
          setStream(at, { dstMac: j.mac })
          setMsg(`${gw} → ${j.mac} — L2 DST 에 넣었습니다`)
        } else {
          setMsg(`${gw} 에서 답이 없습니다 — 선과 IP 를 보세요`)
        }
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy('')
    }
  }

  /** 데몬 스크립트를 받아 저장한다 — N2X 기계에 옮길 그 파일 */
  const getDaemon = async () => {
    try {
      const r = await apiFetch('/api/n2x/daemon.tcl')
      if (!r.ok) throw new Error(String(r.status))
      const blob = await r.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'n2x_daemon.tcl'
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (e) {
      setMsg(`내려받지 못했습니다 — ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  /*
   * 탭을 열면 바로 판을 확인한다.
   *
   * 「섀시에서 읽기」 를 눌렀을 때만 물어보게 해 두었더니, 그 단추를 안
   * 누른 사람에게는 「옛 판입니다」 가 영영 안 보였다 — 내려받을 자리도
   * 그 띠 안에 있어서, 알아야 할 사람이 못 보는 꼴이었다.
   */
  useEffect(() => {
    void checkVer()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.chassis, kind])

  /*
   * STC 는 **미리 데워 둔다**(지적: 포트 읽기가 느리다).
   *
   * 느린 것은 첫 한 번이다 — 세션을 붙이고 섀시에 물어 포트마다 값을
   * 읽는다. 사람이 단추를 누른 뒤에 그 일을 시작하면 그 몇 초를 그대로
   * 기다린다. 탭을 열 때 조용히 시켜 두면, 누를 때쯤에는 답이 와 있다.
   *
   * 화면은 건드리지 않는다 — 실패해도 사람이 알 일이 아니고, 단추를
   * 누르면 그때 제대로 말한다.
   */
  useEffect(() => {
    if (kind !== 'stc' || !cfg.chassis) return
    const t = window.setTimeout(() => {
      void apiFetch('/api/stc/conncheck', {
        method: 'POST',
        body: JSON.stringify({
          chassis: cfg.chassis,
          restIp,
          restPort,
        }),
      }).catch(() => {})
    }, 400)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.chassis, kind])

  /** 되는 길로 읽었을 때 그 값이 몇 초 전 것인가 (-1 이면 방금 읽음) */
  const slowAge = useRef(-1)

  const readPorts = async (force = false) => {
    if (!cfg.chassis) {
      setMsg('계측기를 먼저 고르세요')
      return
    }
    setBusy('ports')
    setMsg('')
    /*
     * STC 는 이 단추가 아예 없었다(지적). 포트를 손으로 적어야 했는데,
     * 「1/1」 인지 「1/1/1」 인지 슬롯이 몇 번부터인지는 섀시가 안다 —
     * 못 읽으면 틀린 번호로 스트림이 서고, 트래픽을 걸어야 그제야 안다.
     *
     * 읽는 길만 다르다: N2X 는 데몬에게, STC 는 REST 세션에게 묻는다.
     * 화면에 서는 것(칩·예약 표시)은 같은 벌이라 손놀림이 갈리지 않는다.
     */
    if (kind === 'stc') {
      /*
       * **빠른 길을 먼저, 안 되면 되는 길로.**
       *
       * N2X 는 기계에 데몬이 늘 떠 있어 묻는 즉시 답이 온다. STC 는 그런
       * 것이 없어 세션을 여는 값이 그대로 사람 기다리는 시간이 된다
       * (지적: N2X 는 엄청 빠르다).
       *
       *   · 빠른 길(portstatus): 살아 있는 세션에 묻는다. 두 번째부터는
       *     거의 즉시고, 예약이 누구 것인지까지 온다.
       *   · 되는 길(conncheck): 제 세션을 열고 인벤토리만 읽고 닫는다.
       *     수십 초가 들지만 세션이 죽어 있어도 된다.
       *
       * 빠른 길이 실패할 때만 되는 길로 내려간다. 어느 길로 읽었는지는
       * 아래 줄에 적는다 — 느릴 때 왜 느린지 사람이 알아야 한다.
       */
      const body = {
        chassis: cfg.chassis,
        restIp,
        restPort,
      }
      type Row = { id: string; free: boolean; mine: boolean; who: string; state: string; lock: string }

      const fast = async (): Promise<Row[]> => {
        const r = await apiFetch('/api/stc/sess/portstatus', {
          method: 'POST',
          body: JSON.stringify(body),
        })
        const j = (await r.json().catch(() => ({}))) as {
          ok?: boolean
          error?: string
          ports?: Array<{ slot?: string | number; port?: string | number; status?: string; who?: string }>
        }
        if (j.ok === false) throw new Error(j.error || '포트를 읽지 못했습니다')
        const rows = (j.ports ?? []).map((x) => {
          const st = String(x.status ?? '')
          return {
            id: `${x.slot ?? ''}/${x.port ?? ''}`,
            free: st === 'available' || st === 'mine',
            mine: st === 'mine',
            who:
              st === 'mine'
                ? '내가 잡음(예약됨)'
                : st === 'other'
                  ? `남이 씀${x.who ? ` — ${x.who}` : ''}`
                  : st === 'unavailable'
                    ? '쓸 수 없음'
                    : '빈 포트',
            state: st,
            lock: String(x.who ?? ''),
          }
        })
        if (!rows.length) throw new Error('빈 응답')
        return rows
      }

      const slow = async (f: boolean): Promise<Row[]> => {
        const ask = async (force2: boolean) => {
          const r = await apiFetch('/api/stc/conncheck', {
            method: 'POST',
            body: JSON.stringify({ ...body, ...(force2 ? { force: 1 } : {}) }),
          })
          return (await r.json().catch(() => ({}))) as {
            ok?: boolean
            error?: string
            cached?: boolean
            cache_age?: number
            modules?: Array<{
              slot?: number | string
              port_detail?: Array<{ index?: string; status?: string; owner?: string }>
            }>
          }
        }
        let j = await ask(f)
        /* 쥐고 있던 것이 비었으면 한 번은 새로 묻는다 — 빈 값을 쥔 채
           「포트가 없다」 고 말하면 사람이 케이블을 뒤진다 */
        if (!f && j.ok !== false && !(j.modules ?? []).length) j = await ask(true)
        if (j.ok === false) throw new Error(j.error || '포트를 읽지 못했습니다')
        slowAge.current = j.cached ? Number(j.cache_age ?? 0) : -1
        const rows: Row[] = []
        for (const m of j.modules ?? []) {
          const slot = String(m.slot ?? '')
          if (!slot) continue
          for (const d of m.port_detail ?? []) {
            const st = String(d.status ?? '')
            const owner = String(d.owner ?? '').replace(/@+$/, '')
            rows.push({
              id: `${slot}/${d.index ?? ''}`,
              free: st !== 'reserved',
              mine: false,
              who: st === 'reserved' ? `예약됨${owner ? ` — ${owner}` : ''}` : '빈 포트',
              state: st,
              lock: owner,
            })
          }
        }
        return rows
      }

      try {
        let out: Row[] = []
        let how = '빠른 길'
        if (force) {
          out = await slow(true)
          how = '섀시에 다시 물음'
        } else {
          try {
            out = await fast()
          } catch (e) {
            console.warn('[stc] 빠른 길 실패 → 되는 길로', e)
            out = await slow(false)
            how = '느린 길(세션을 새로 여는 중이라 다음엔 빨라집니다)'
          }
        }
        setChassisPorts(out)
        if (out.length) {
          setCfg({ seenPorts: out.map((x) => x.id), seenAt: new Date().toISOString() })
        }
        const usedN = out.filter((x) => !x.free).length
        const mineN = out.filter((x) => x.mine).length
        const age = slowAge.current
        setMsg(
          out.length
            ? `포트 ${out.length}개 · 빈 포트 ${out.length - usedN}개 · 예약된 것 ${usedN}개` +
                (mineN ? ` (내가 잡은 것 ${mineN}개)` : '') +
                ` · ${how}` +
                (age >= 0 ? ` · ${age}초 전에 읽은 값` : '')
            : '섀시가 포트를 돌려주지 않았습니다 — REST 서버·섀시 주소를 확인하세요',
        )
      } catch (e) {
        setMsg(e instanceof Error ? e.message : String(e))
      } finally {
        slowAge.current = -1
        setBusy('')
      }
      return
    }
    try {
      const q = `/api/n2x/ports?server=${encodeURIComponent(cfg.chassis)}&label=${encodeURIComponent(cfg.n2xLabel || 'utop')}`
      const r = await apiFetch(q)
      const j = (await r.json()) as {
        ok?: boolean
        error?: string
        modules?: Array<{
          id: number
          portList?: Array<{
            port: number
            label?: string
            mine?: number
            avail?: number
            state?: string
            lock?: string
          }>
        }>
      }
      if (j.ok === false) throw new Error(j.error || '포트를 읽지 못했습니다')
      const out: Array<{
        id: string
        free: boolean
        /** 내 세션이 잡고 있나 — 이것이 「예약됨」 이다 */
        mine: boolean
        who: string
        state: string
        lock: string
      }> = []
      for (const m of j.modules ?? []) {
        for (const x of m.portList ?? []) {
          /*
           * `GetPortState` 는 **링크가 아니라 소유 상태**다.
           *
           * 링크가 죽은 포트를 표시해 보려고 이 값으로 넘겨짚었는데, 섀시
           * 44개 포트가 전부 `AGT_PORT_LOCKED` 하나로만 나온다. 링크를
           * 아는 값이 아니었다 — 멀쩡한 포트에 ⚠ 를 붙여 케이블을 뒤지게
           * 만들 뻔했다. 아는 것만 적는다.
           */
          out.push({
            id: `${m.id}/${x.port}`,
            free: !!x.avail || !!x.mine,
            mine: !!x.mine,
            who: x.mine ? '내가 잡음(예약됨)' : x.avail ? '빈 포트' : `남이 씀${x.label ? ` — ${x.label}` : ''}`,
            state: String(x.state ?? ''),
            lock: String(x.lock ?? ''),
          })
        }
      }
      setChassisPorts(out)
      void checkVer()
      // 「예약했나」 를 여기서 답한다. 섀시는 포트마다 어느 세션이 쥐고
      // 있는지를 `lock` 으로 알려주고, 그것이 내 세션이면 내가 잡은 것이다.
      const mineN = out.filter((x) => x.mine).length
      const freeN = out.filter((x) => !x.mine && x.free).length
      setMsg(
        `포트 ${out.length}개 · 내가 잡은 것 ${mineN}개 · 빈 포트 ${freeN}개 · 남이 쓰는 것 ${
          out.length - mineN - freeN
        }개`,
      )
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy('')
    }
  }

  const s = streams[sel]

  /** 표 안에서 바로 고치는 칸 */
  /**
   * 이 스트림이 실제로 무엇으로 나가는가.
   *
   * 「IP 를 비우면 L2 로 나간다」 는 규칙이 편집기 안내문에만 있었다.
   * 그래서 IPv4 로 쏘는 줄 알고 IP 를 안 적어 L2 로 나가는 일이 제일
   * 잦았다 — 장비는 라우팅을 안 하니 손실 100% 로 보이고, 화면 어디에도
   * 왜 그런지가 없다. 목록에서 바로 읽히게 한다.
   */
  const headerOf = (r: MeterStream): string => {
    const ip = String(r.srcIp ?? '').trim() || String(r.dstIp ?? '').trim()
    if (!ip) return 'L2'
    const l4 = String(r.l4proto ?? '').trim()
    return l4 && l4 !== '없음' ? `IPv4+${l4}` : 'IPv4'
  }

  const cell = (i: number, k: keyof MeterStream, w?: number) => (
    <input
      className="tt-in mono"
      style={w ? { width: w } : undefined}
      value={String(streams[i]?.[k] ?? '')}
      onChange={(e) => setStream(i, { [k]: e.target.value })}
      onFocus={() => setSel(i)}
    />
  )

  /**
   * 셈해서 나오는 칸 — 읽기만.
   *
   * 손으로도 적게 두면 시작·걸음·개수와 어긋난 값이 남는다. 무엇으로
   * 정해지는지가 보이도록 흐리게 두고 잠근다.
   */
  /**
   * 걸음 칸.
   *
   * 모드가 「고정」 이면 걸음은 아무 뜻이 없다. 그런데 적을 수는 있어서,
   * 3 으로 키워 놓고 왜 끝 주소가 안 움직이냐고 보게 된다. 고정일 때는
   * 잠그고 왜 잠겼는지 적는다.
   */
  const fldStep = (k: keyof MeterStream, modK: keyof MeterStream, fromK: keyof MeterStream) => {
    const fixed = incOf(s?.[modK]) === 'No'
    // 시작이 비어 있으면 셈할 것이 없다. L3 는 새 스트림에서 비어 있으므로
    // 이 경우가 흔하다 — 잠긴 까닭을 적어 두지 않으면 고장으로 읽힌다.
    const noFrom = !String(s?.[fromK] ?? '').trim()
    const why = noFrom
      ? 'From 을 먼저 적으세요'
      : fixed
        ? '「증가」 를 Yes 로 바꾸면 켜집니다'
        : ''
    return (
      <>
        <label className="tt-f" title={why}>
          <span>개수</span>
          <input
            className="mono"
            style={{ width: 56 }}
            disabled={fixed || noFrom}
            value={fixed || noFrom ? '' : String(s?.[k] ?? '1')}
            placeholder="–"
            onChange={(e) => setStream(sel, { [k]: e.target.value })}
          />
        </label>
      </>
    )
  }

  const fldRO = (label: string, k: keyof MeterStream, w = 110) => (
    <label className="tt-f" title="From · Step · 개수로 저절로 정해집니다">
      <span>{label}</span>
      <input className="mono tt-ro" style={{ width: w }} readOnly value={String(s?.[k] ?? '')} />
    </label>
  )

  /**
   * 속성 편집의 한 칸.
   *
   * 폭(`w`)을 **담기는 값에 맞춰** 받는다. 스무 칸을 다 같은 폭으로
   * 두었더니 TTL(세 자리)이 MAC(열일곱 자)과 같은 자리를 먹어, 화면의
   * 절반이 빈 입력칸이었다. 값이 짧으면 칸도 짧아야 한 줄에 여럿이
   * 서고, 그래야 눈이 옆으로 훑어 읽는다.
   */
  /** 늘림 여부 칸 — Yes/No. 옛 말이 들어 있어도 Yes/No 로 보여 준다. */
  const fldInc = (k: keyof MeterStream) => (
    <label className="tt-f" title="Yes 면 개수만큼 늘려 가며 보냅니다 (N2X 와 같은 방식)">
      <span>증가</span>
      <select
        style={{ width: 62 }}
        value={incOf(s?.[k])}
        onChange={(e) => setStream(sel, { [k]: e.target.value })}
      >
        {MODS.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  )

  const fld = (
    label: string,
    k: keyof MeterStream,
    ph?: string,
    opts?: string[],
    w = 110,
  ) => (
    <label className="tt-f">
      <span>{label}</span>
      {opts ? (
        <select
          style={{ width: w }}
          /*
           * 골라 둔 값이 목록에 없으면 빈 칸으로 보인다.
           *
           * Ether-Type 에 이름을 붙이면서(`0x0806` → `0x0806 (ARP)`) 전에
           * 저장된 시험이 다 그 꼴이 됐다. 앞머리가 같은 것을 찾아 잇는다 —
           * 옛 자료를 손대지 않고도 제 값이 보인다.
           */
          value={
            opts.includes(String(s?.[k] ?? ''))
              ? String(s?.[k] ?? '')
              : (opts.find((o) => o.split(/\s+/)[0] === String(s?.[k] ?? '').trim()) ??
                String(s?.[k] ?? ''))
          }
          onChange={(e) => setStream(sel, { [k]: e.target.value })}
        >
          {opts.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          className="mono"
          style={{ width: w }}
          value={String(s?.[k] ?? '')}
          placeholder={ph}
          onChange={(e) => setStream(sel, { [k]: e.target.value })}
        />
      )}
    </label>
  )

  return (
    <div className="tt">
      {/*
        미리보기.
        「이 값들이 실제로 어떤 프레임이 되는가」 를 돌려 보기 전에 보여
        준다. 표와 세부에 흩어진 것을 머릿속에서 합쳐야만 알 수 있었고,
        그래서 틀린 채로 돌리고 손실 100% 를 보고서야 되짚었다.
      */}
      {preview && (
        <div className="tt-pv-back" onClick={() => setPreview(false)}>
          <div className="tt-pv" onClick={(e) => e.stopPropagation()}>
            <div className="tt-pv-h">
              <b>계측기에 만들어질 스트림</b>
              <span className="muted small">
                {kind === 'stc' ? 'STC' : 'N2X'} · {cfg.chassis || '계측기 안 고름'}
              </span>
              <span className="sp" />
              <button className="btn small" type="button" onClick={() => setPreview(false)}>
                닫기
              </button>
            </div>
            <div className="tt-pv-b">
              {(() => {
                /*
                 * 계측기가 만들 스트림을 **하나하나 늘어놓는다.**
                 *
                 * 처음에는 스트림마다 「SRC MAC 은 이것부터 저것까지」 식으로
                 * 적었다. 그것은 지금 화면에 적힌 값을 옮겨 적은 것일 뿐이라
                 * 새로 알게 되는 것이 없다. 알고 싶은 것은 「그래서 계측기에
                 * 몇 줄이 생기고 그 줄들이 각각 무엇인가」 다 — 개수 10 이면
                 * 열 줄이 생기고 그 열 줄의 MAC·IP·VLAN 이 어떻게 다른가.
                 */
                const on = streams.filter((x) => x.enabled !== false)
                type Row = {
                  no: number
                  name: string
                  path: string
                  sMac: string
                  dMac: string
                  vlan: string
                  sIp: string
                  dIp: string
                }
                const rows: Row[] = []
                let over = 0
                for (const x of on) {
                  const sM = listOf(x.srcMac ?? '', x.srcMacMod ?? '', x.srcMacStep ?? '1', 'mac')
                  const dM = listOf(x.dstMac ?? '', x.dstMacMod ?? '', x.dstMacStep ?? '1', 'mac')
                  const sI = listOf(x.srcIp ?? '', x.srcIpMod ?? '', x.srcIpStep ?? '1', 'ip')
                  const dI = listOf(x.dstIp ?? '', x.dstIpMod ?? '', x.dstIpStep ?? '1', 'ip')
                  const vl = listOf(x.vlan ?? '', x.vlanMod ?? '', x.vlanStep ?? '1', 'ip')
                  // 이 스트림이 몇 줄로 펼쳐지나 — 늘어나는 것 중 가장 긴 것
                  const n = Math.max(1, sM.length, dM.length, sI.length, dI.length, vl.length)
                  const at = (a: string[], i: number) =>
                    a.length ? (a[i] ?? a[a.length - 1] ?? '') : ''
                  for (let i = 0; i < n; i++) {
                    if (rows.length >= 200) {
                      over += 1
                      continue
                    }
                    rows.push({
                      no: rows.length + 1,
                      name: n > 1 ? `${x.name || 'Stream'}.${i + 1}` : x.name || 'Stream',
                      path: `${x.src || '–'} → ${x.dst || '–'}`,
                      sMac: at(sM, i),
                      dMac: at(dM, i),
                      vlan: at(vl, i),
                      sIp: at(sI, i),
                      dIp: at(dI, i),
                    })
                  }
                }
                if (!on.length)
                  return <div className="empty">보낼 스트림이 없습니다 — 「활성」 을 켜세요.</div>
                const one = on[0] ?? {}
                return (
                  <>
                    <div className="tt-pv-sum">
                      계측기에 <b>{rows.length + over}줄</b>이 생깁니다 · 스트림 {on.length}개 ·{' '}
                      {one.byteType === 'Random'
                        ? `${one.minByte || 64}–${one.maxByte || 1518}B 무작위`
                        : `${one.minByte || 64}B 고정`}{' '}
                      · 줄마다 {one.load || '–'} {one.unit || ''}
                    </div>
                    <div className="tt-pv-wrap">
                      <table className="tt-table tt-pv-tbl">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Stream</th>
                            <th>경로</th>
                            <th>SRC MAC</th>
                            <th>DST MAC</th>
                            <th>VLAN</th>
                            <th>SRC IP</th>
                            <th>DST IP</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r) => (
                            <tr key={r.no}>
                              <td className="muted">{r.no}</td>
                              <td>{r.name}</td>
                              <td className="mono">{r.path}</td>
                              <td className="mono">{r.sMac || '–'}</td>
                              <td className="mono">{r.dMac || '–'}</td>
                              <td className="mono">{r.vlan || '–'}</td>
                              <td className="mono">{r.sIp || '–'}</td>
                              <td className="mono">{r.dIp || '–'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {over > 0 && (
                      <div className="muted small">
                        …그리고 {over}줄 더. 여기서는 앞 200줄만 보입니다.
                      </div>
                    )}
                  </>
                )
              })()}
              {/*
                지금 계측기가 받는 것은 **한 값씩**이다. 데몬이
                `SetFieldFixedValue` 로만 넣는다 — 목록을 넣는
                `SetFieldValueList` 는 이 장비에 있지만 아직 안 쓴다.
                그래서 위에 여러 줄로 펼쳐 보여도 실제로 나가는 것은
                스트림마다 첫 줄 하나다. 이 말을 안 적으면 화면과 선로가
                어긋난 채 시험이 돈다.
              */}
              <div className="tt-hint">
                이대로 계측기에 만들어집니다. 옛 판 데몬(13 이하)은 갈래를 하나만
                만들고 값도 하나씩만 넣으니, 위 줄 수와 실제가 다르면{' '}
                <b>N2X 기계의 n2x_daemon.tcl 을 새 판으로 바꾸세요</b> — 기본 정보의 띠가
                알려 줍니다.
              </div>
            </div>
          </div>
        </div>
      )}
      {stale && (
        <div className="tt-stale">
          ⚠ {stale}
          {/* 어디서 받는지가 없으면 저장소를 뒤지거나 사람에게 물어야 한다.
              그 기계에서 이 링크를 열면 바로 받아진다.
              닿지도 않는데 이 단추를 보이면 안 된다 — 파일을 옮겨도 안
              바뀐다. 그때 고칠 곳은 주소다. */}
          {staleFix && (
          <div className="tt-stale-do">
            {/* 그냥 링크로 두면 안 된다 — 이 자리는 로그인이 필요한데
                브라우저가 여는 링크에는 우리 열쇠가 안 붙어서 401 만 본다.
                눌러서 받아 저장한다. */}
            <button type="button" className="btn small" onClick={() => void getDaemon()}>
              n2x_daemon.tcl 내려받기
            </button>
            <span className="muted small">
              N2X 기계에서 이 링크를 열어 중계 폴더에 덮어쓰고, n2x_relay.py 를 다시 띄우세요.
            </span>
          </div>
          )}
        </div>
      )}

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
                value={restPort}
                title="계측기 등록에 적어 둔 포트를 씁니다 — 여기서 고치면 이 시험에서만 달라집니다"
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
          {/* 시험 포트 — 이름표에 긴 안내문과 단추를 같이 넣었더니
              104px 짜리 칸을 넘겨 카드 밖으로 삐져나왔다. 이름표는 짧게,
              예시는 칸 안내로, 단추는 칸 뒤에 둔다. */}
          <label className="tt-f tt-wide">
            <span>시험 포트</span>
            <input
              className="mono"
              list="tt-chassis-ports"
              value={ports.join(',')}
              placeholder="쉼표로 나눠 적습니다 — 예: 4106/1,4106/2"
              onChange={(e) => {
                const pp = e.target.value.split(',').map((x) => x.trim()).filter(Boolean)
                setCfg({ ports: pp })
              }}
            />
            <button
              className="btn small"
              type="button"
              disabled={!!busy || !cfg.chassis}
              title={
                kind === 'stc'
                  ? '섀시에 실제로 꽂힌 포트를 읽어 옵니다 (10분 안에 읽은 것이 있으면 그것을 씁니다)'
                  : '섀시에 실제로 꽂힌 포트를 읽어 옵니다'
              }
              onClick={() => void readPorts()}
            >
              {busy === 'ports' ? '읽는 중…' : '섀시에서 읽기'}
            </button>
            {/* 카드를 갈아 끼웠을 때 — 쥐고 있던 것을 버리고 다시 묻는다 */}
            {kind === 'stc' && chassisPorts.length > 0 && (
              <button
                className="btn small"
                type="button"
                disabled={!!busy || !cfg.chassis}
                title="쥐고 있던 값을 버리고 섀시에 다시 묻습니다 — 수십 초 걸립니다"
                onClick={() => void readPorts(true)}
              >
                ⟳ 새로
              </button>
            )}
            {chassisPorts.length > 0 && (
              <>
                <datalist id="tt-chassis-ports">
                  {chassisPorts.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.who}
                    </option>
                  ))}
                </datalist>
                {/*
                  눌러서 넣는다. 목록만 보여 주면 옮겨 적다가 또 틀린다.

                  다만 44개를 늘 펴 두면 세 줄을 먹는다 — 정작 쓰는 것은
                  둘이다. 고른 것만 늘 보이고 나머지는 접는다.
                */}
                <span className="tt-ports">
                  {(portsOpen ? chassisPorts : chassisPorts.filter((x) => ports.includes(x.id))).map((x) => (
                    <button
                      key={x.id}
                      type="button"
                      className={`tt-port${ports.includes(x.id) ? ' on' : ''}${
                        x.free ? '' : ' busy'
                      }${x.mine ? ' mine' : ''}`}
                      title={`${x.who}${x.lock && x.lock !== '0' ? ` · 세션 ${x.lock}` : ''}`}
                      onClick={() => {
                        const has = ports.includes(x.id)
                        setCfg({
                          ports: has ? ports.filter((y) => y !== x.id) : [...ports, x.id],
                        })
                      }}
                    >
                      {x.id}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="tt-port tt-portmore"
                    onClick={() => setPortsOpen((v) => !v)}
                  >
                    {portsOpen
                      ? '접기'
                      : `＋ ${chassisPorts.length}개 중 고르기`}
                  </button>
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
          {/* 무엇이 나갈지 눌러서 보고 시작한다. 표와 세부에 흩어진 값이
              실제로 어떤 프레임이 되는지는 지금까지 돌려 보기 전에는
              알 수가 없었다. */}
          <button
            className="btn small"
            type="button"
            disabled={!streams.length}
            onClick={() => setPreview(true)}
          >
            미리보기
          </button>
          {badStreams.length > 0 && (
            <span className="tt-warn">
              보낼 곳이 안 정해진 스트림 {badStreams.length}개 — SRC·DST 를 고르세요
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
                {/*
                  이 표는 **처음 쓰는 사람의 자리**다.

                  MAC 도 VLAN 도 몰라도 여기 여섯 칸만 채우면 트래픽이
                  나간다 — 어디서 어디로(경로), 한쪽인가 양쪽인가(방향),
                  얼마나(로드), 얼마짜리로(바이트). 「헤더」 는 적어 넣은
                  값으로 저절로 정해지므로 고칠 수 없다.

                  MAC·VLAN·IP 를 손보는 것은 아래 「스트림 세부」 다. 전에는
                  그것들을 이 표에도 늘어놓아 열한 칸이었는데, 같은 값을 두
                  군데서 고칠 수 있으니 어느 쪽이 진짜인지 매번 생각하게 됐고
                  가로 스크롤(1140px)도 거기서 나왔다.
                */}
                <th title="이 스트림을 보낼지">활성</th>
                <th>Stream Name</th>
                <th title="보내는 포트 → 받는 포트">경로</th>
                <th title="한쪽으로만 보낼지, 서로 보낼지">방향</th>
                <th title="부하와 단위">로드</th>
                {/* 바이트(크기·모드)는 「포트 · 방향 · 부하」 갈래로 옮겼다.
                    한 번 정하면 시험 내내 그대로라 줄마다 보일 것이 아니다.
                    대신 줄마다 다른 MAC 을 여기서 본다. */}
                <th title="보내는 쪽 MAC">S.Mac</th>
                <th title="받는 쪽 MAC — ARP 를 누르면 GW 의 MAC 이 들어옵니다">D.Mac</th>
                <th title="적어 넣은 값으로 정해지는 헤더">헤더</th>
                {/* L3 로 쏠 때 꼭 채워야 하는 셋. 여기 없으면 세부로 들어가
                    적고 다시 나와야 했다 — 처음 쓰는 사람이 제일 자주
                    걸리는 자리다. */}
                <th title="보내는 쪽 IP — 비우면 L2 로 나갑니다">SRC IP</th>
                <th title="첫 홉(장비 포트)의 IP">Gateway</th>
                <th title="GW 에게 ARP 를 보내 그 MAC 을 L2 DST 에 넣습니다">ARP</th>
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
                    {/* 체크 대신 Yes/No 로 적는다. 계측기 화면이 그렇게
                        적고, 무엇보다 인쇄한 결과서에서 체크는 켠 것인지
                        칸이 빈 것인지 안 갈린다. */}
                    <td>
                      <select
                        className="tt-in"
                        style={{ width: 62 }}
                        value={row.enabled === false ? 'No' : 'Yes'}
                        title="No 면 이 스트림은 안 보냅니다"
                        onChange={(e) => setStream(i, { enabled: e.target.value === 'Yes' })}
                      >
                        <option>Yes</option>
                        <option>No</option>
                      </select>
                    </td>
                    <td>{cell(i, 'name', 140)}</td>
                    {/* 여기서 바로 고친다. 아래로 내려가 다시 찾을 것 없이
                        한 줄 안에서 끝나야 처음 쓰는 사람이 붙는다. */}
                    <td className="tt-pair">
                      <select
                        className="tt-in"
                        style={{ width: 84 }}
                        value={row.src ?? ''}
                        onChange={(e) => setStream(i, { src: e.target.value })}
                      >
                        <option value="">—</option>
                        {portOpts(row.src).map((x) => (
                          <option key={x} value={x}>
                            {x}
                          </option>
                        ))}
                      </select>
                      <i>→</i>
                      <select
                        className="tt-in"
                        style={{ width: 84 }}
                        value={row.dst ?? ''}
                        onChange={(e) => setStream(i, { dst: e.target.value })}
                      >
                        <option value="">—</option>
                        {portOpts(row.dst).map((x) => (
                          <option key={x} value={x}>
                            {x}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        className="tt-in"
                        style={{ width: 82 }}
                        value={row.direction ?? '단방향'}
                        onChange={(e) => setStream(i, { direction: e.target.value })}
                      >
                        <option>단방향</option>
                        <option>양방향</option>
                      </select>
                    </td>
                    <td className="tt-pair">
                      {cell(i, 'load', 52)}
                      <select
                        className="tt-in"
                        style={{ width: 92 }}
                        value={row.unit ?? 'Mbps'}
                        onChange={(e) => setStream(i, { unit: e.target.value })}
                      >
                        {UNITS.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{cell(i, 'srcMac', 136)}</td>
                    <td>{cell(i, 'dstMac', 136)}</td>
                    {/* 적어 넣은 값으로 정해진다. 「비우면 L2」 규칙이 편집기
                        안내문에만 있어서 여기서 제일 자주 틀렸다. */}
                    <td>
                      <span className="tt-tag">{headerOf(row)}</span>
                    </td>
                    <td>{cell(i, 'srcIp', 104)}</td>
                    <td>{cell(i, 'gw', 104)}</td>
                    <td>
                      <button
                        className="btn small"
                        type="button"
                        disabled={!!busy || !cfg.chassis || !String(row.gw ?? '').trim()}
                        title="이 GW 에게 ARP 를 보내 MAC 을 받아 L2 DST 에 넣습니다"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSel(i)
                          void sendArp(i)
                        }}
                      >
                        {busy === 'arp' && sel === i ? '…' : 'ARP'}
                      </button>
                    </td>
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
              <span className="tt-tag">{headerOf(s)}</span>
              <span className="muted small">— 속성 편집</span>
            </div>
            {/*
              층을 탭으로 갈라 두었더니 한 번에 한 겹만 보였다. 부하를
              고치고 L2 를 보려면 탭을 옮겨야 하고, 옮기면 방금 무엇을
              적었는지가 사라진다 — 스트림 하나를 맞추는 데 탭을 예닐곱
              번 오간다. 다 펴 놓고 옆으로 늘어놓는다. 자리가 좁으면
              아래로 접힌다.
            */}
            {/*
              세 갈래.
                ① 보내기  — 어디로, 얼마나 (포트·방향·L4 · Traffic Load)
                ② L2      — MAC 과 VLAN
                ③ L3      — IP 와 GW
              다 펴 놓으면 312px 을 먹는데, 한 번에 손대는 것은 대개 한
              갈래다. 갈라 두면 100px 안쪽으로 줄고 그만큼 표와 측정
              결과가 위로 올라온다. 갈래 이름 옆의 점은 그 갈래에 적힌
              것이 있다는 뜻이라, 닫아 두어도 무엇이 채워졌는지 보인다.
            */}
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
                  {l.k === 'l2' && String(s?.vlan ?? '').trim() && <i className="tt-dot" />}
                  {l.k === 'l3' && headerOf(s) !== 'L2' && <i className="tt-dot" />}
                </button>
              ))}
            </div>

            <div className="tt-all">
              {layer === 'send' && (
              <>
              {/* 자주 만지는 것이 먼저다 — 부하와 단위는 시험마다 바뀌고
                  포트는 한 번 정하면 그대로다. */}
              <div className="tt-box">
                <div className="tt-bh">Traffic Load</div>
                <div className="tt-grid">
                  {fld('부하', 'load', '10', undefined, 64)}
                  {fld('단위', 'unit', '', UNITS, 96)}
                  {fld('프레임', 'frameType', 'Ethernet II', undefined, 116)}
                  {fld('크기', 'byteType', '', BYTEMODES, 92)}
                  {fld('최소', 'minByte', '64', undefined, 56)}
                  {fld('최대', 'maxByte', '1518', undefined, 56)}
                  {fld('프레임 수', 'frameCnt', '0 = 연속', undefined, 76)}
                  {fld('버스트', 'burst', '1', undefined, 56)}
                  {fld('간격', 'gap', '0', undefined, 56)}
                </div>
              </div>

              {/* 포트·방향과 L4 를 한 묶음으로 둔다. 셋씩 짜리 둘을 따로
                  두었더니 그 줄이 통째로 비어 60px 씩 버렸다. 둘 다
                  「어디로 나가나」 라 뜻도 가깝다. */}
              {/* 물리 포트만. 방향이 먼저다 — 어느 쪽으로 흐르는지를 정하고
                  나서 그 양끝을 고른다. TCP·UDP 의 포트 번호는 여기가 아니라
                  L3 IP 에 있다. 같은 「포트」 라도 하나는 계측기 구멍이고
                  하나는 L4 번호라, 나란히 두면 서로 헷갈린다. */}
              <div className="tt-box">
                <div className="tt-bh">포트 · 방향</div>
                <div className="tt-grid">
                  {fld('방향', 'direction', '', ['단방향', '양방향'], 88)}
                  {fld('SRC Port', 'src', '', portOpts(s?.src as string | undefined), 104)}
                  {fld('DST Port', 'dst', '', portOpts(s?.dst as string | undefined), 104)}
                </div>
              </div>

              </>
              )}

              {layer === 'l2' && (
              <div className="tt-box">
                <div className="tt-bh">L2 Packet</div>
                <div className="tt-sub">SRC MAC</div>
                <div className="tt-grid">
                  {fld('From', 'srcMac', '00:00:00:00:00:01', undefined, 140)}
                  {fldRO('To', 'srcMacTo', 140)}
                  {fldInc('srcMacMod')}
                  {fldStep('srcMacStep', 'srcMacMod', 'srcMac')}
                </div>
                <div className="tt-sub">DST MAC</div>
                <div className="tt-grid">
                  {fld('From', 'dstMac', '00:00:00:00:00:02', undefined, 140)}
                  {fldRO('To', 'dstMacTo', 140)}
                  {fldInc('dstMacMod')}
                  {fldStep('dstMacStep', 'dstMacMod', 'dstMac')}
                </div>
                <div className="tt-sub">VLAN</div>
                <div className="tt-grid">
                  {fld('VLAN ID', 'vlan', '없으면 비움', undefined, 92)}
                  {/* 끝 VLAN 이 안 보였다. 셈은 하고 있었는데 그릴 자리가
                      없어서, 몇 번부터 몇 번까지 나가는지 알 길이 없었다. */}
                  {fldRO('To', 'vlanTo', 92)}
                  {fldInc('vlanMod')}
                  {fldStep('vlanStep', 'vlanMod', 'vlan')}
                  {fld('802.1p', 'prio', '0', undefined, 44)}
                  {fld('E-Type', 'etherType', '', ETYPES, 132)}
                </div>
              </div>

              )}

              {layer === 'l3' && (
              <div className="tt-box">
                <div className="tt-bh">L3 Packet</div>
                {/* 무엇이 나가는지를 여기서 정한다 — 비우면 L2 다.
                    전에는 비워도 IPv4·UDP 헤더가 붙어 나갔다. */}
                <div className="tt-hint">
                  <b>비우면 L2</b> 로 나갑니다 — 위 표의 「헤더」 칸이 지금 무엇으로 나가는지
                  알려 줍니다.
                </div>
                <div className="tt-sub">SRC IP</div>
                <div className="tt-grid">
                  {fld('From', 'srcIp', '1.1.1.1', undefined, 124)}
                  {fldRO('To', 'srcIpTo', 124)}
                  {fldInc('srcIpMod')}
                  {fldStep('srcIpStep', 'srcIpMod', 'srcIp')}
                </div>
                <div className="tt-sub">DST IP</div>
                <div className="tt-grid">
                  {fld('From', 'dstIp', '2.1.1.1', undefined, 124)}
                  {fldRO('To', 'dstIpTo', 124)}
                  {fldInc('dstIpMod')}
                  {fldStep('dstIpStep', 'dstIpMod', 'dstIp')}
                </div>
                <div className="tt-sub">L4</div>
                <div className="tt-grid">
                  {fld('프로토콜', 'l4proto', '', L4, 84)}
                  {fld('S.Port', 'srcPort', '', undefined, 64)}
                  {fld('D.Port', 'dstPort', '', undefined, 64)}
                </div>
                <div className="tt-sub">기타</div>
                <div className="tt-grid">
                  {/* GW 바로 옆에 둔다. 적어 넣은 그 값으로 물어보는 것이라
                      떨어뜨려 놓으면 무엇에 대한 ARP 인지가 안 읽힌다. */}
                  <label
                    className="tt-f tt-gw"
                    title="보내는 쪽이 붙은 장비 포트의 IP 입니다. 틀리면 프레임이 장비로 안 가고 손실 100% 로 나옵니다."
                  >
                    <span>GW</span>
                    <input
                      className="mono"
                      style={{ width: 124 }}
                      value={String(s?.gw ?? '')}
                      placeholder="1.1.1.254"
                      onChange={(e) => setStream(sel, { gw: e.target.value })}
                    />
                    <button
                      className="btn small"
                      type="button"
                      disabled={!!busy || !cfg.chassis || !String(s?.gw ?? '').trim()}
                      title="이 GW 에게 ARP 를 보내 MAC 을 받아 L2 DST 에 넣습니다"
                      onClick={() => void sendArp(sel)}
                    >
                      {busy === 'arp' ? '…' : 'ARP Send'}
                    </button>
                  </label>
                  {fld('DSCP', 'dscp', '0', undefined, 48)}
                  {fld('TTL', 'ttl', '64', undefined, 48)}
                </div>
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
        <MeterStats
          rows={stats}
          streams={streams}
          keys={statKeys}
          placeholder
        />
      </section>
    </div>
  )
}
