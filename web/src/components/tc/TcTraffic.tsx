import { useEffect, useMemo, useState } from 'react'
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

const MODS = ['고정', '증가', '감소', '무작위']
const UNITS = ['Mbps', 'Percent(%)', 'Frames/sec(fps)', 'bps']
const BYTEMODES = ['Fixed', 'Increment', 'Decrement', 'Random']
const L4 = ['TCP', 'UDP', 'ICMP', '없음']
const ETYPES = ['0x0800', '0x0806', '0x86DD', '0x8100']

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
    Array<{ id: string; free: boolean; mine: boolean; who: string; state: string; lock: string }>
  >([])
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
  const sendArp = async () => {
    if (!cfg.chassis) return setMsg('계측기를 먼저 고르세요')
    const gw = String(s?.gw ?? '').trim()
    if (!gw) return setMsg('GW 를 먼저 적으세요 — 보내는 쪽이 붙은 장비 포트의 IP 입니다')
    setBusy('arp')
    setMsg('')
    try {
      if (kind === 'stc') {
        const r = await apiFetch('/api/stc/meter/arp', {
          method: 'POST',
          body: JSON.stringify({
            cfg: { chassis: cfg.chassis, restIp: 'localhost', restPort: cfg.restPort ?? 8888 },
          }),
        })
        const j = (await r.json()) as { ok?: boolean; error?: string; text?: string; mac?: string }
        setRaw(JSON.stringify(j, null, 2))
        if (j.ok === false) throw new Error(j.error || 'ARP 를 보내지 못했습니다')
        // 응답 어디에 있든 MAC 꼴을 찾아 쓴다 — 도구마다 적는 자리가 다르다
        const mac = j.mac || (String(j.text ?? '').match(/([0-9a-f]{2}[:-]){5}[0-9a-f]{2}/i) ?? [])[0]
        if (mac) {
          setStream(sel, { dstMac: mac })
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
            port: s?.src ?? '',
            gw,
            srcIp: s?.srcIp ?? '',
            srcMac: s?.srcMac ?? '',
          }),
        })
        const j = (await r.json()) as { ok?: boolean; error?: string; mac?: string }
        setRaw(JSON.stringify(j, null, 2))
        if (j.ok === false) throw new Error(j.error || 'ARP 를 보내지 못했습니다')
        if (j.mac) {
          setStream(sel, { dstMac: j.mac })
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
   * 속성 편집의 한 칸.
   *
   * 폭(`w`)을 **담기는 값에 맞춰** 받는다. 스무 칸을 다 같은 폭으로
   * 두었더니 TTL(세 자리)이 MAC(열일곱 자)과 같은 자리를 먹어, 화면의
   * 절반이 빈 입력칸이었다. 값이 짧으면 칸도 짧아야 한 줄에 여럿이
   * 서고, 그래야 눈이 옆으로 훑어 읽는다.
   */
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
          value={String(s?.[k] ?? '')}
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
            {kind !== 'stc' && (
              <button
                className="btn small"
                type="button"
                disabled={!!busy || !cfg.chassis}
                title="섀시에 실제로 꽂힌 포트를 읽어 옵니다"
                onClick={() => void readPorts()}
              >
                {busy === 'ports' ? '읽는 중…' : '섀시에서 읽기'}
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
                  표는 **고르는 자리**다.

                  열한 칸 중 일곱(포트·MAC·IP·GW)이 아래 편집기와 같은 값을
                  그리고 있었다. 같은 것을 두 군데서 고칠 수 있으니 어느
                  쪽이 진짜인지 매번 생각하게 되고, 가로 스크롤(1140px)도
                  거기서 나왔다. 고칠 곳은 아래 하나로 모으고, 여기에는
                  **아래를 봐서는 한눈에 안 보이는 것**만 남긴다.
                */}
                <th title="이 스트림을 보낼지">활성</th>
                <th>Stream Name</th>
                <th title="보내는 포트 → 받는 포트">경로</th>
                <th title="부하와 단위">부하</th>
                <th title="프레임 크기와 모드">프레임</th>
                <th title="적어 넣은 값으로 정해지는 헤더">헤더</th>
              </tr>
            </thead>
            <tbody>
              {streams.length === 0 ? (
                <tr>
                  <td colSpan={7} className="tt-empty">
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
                    <td>{cell(i, 'name', 140)}</td>
                    <td className="mono small">
                      {row.src || '–'} → {row.dst || '–'}
                    </td>
                    <td className="mono small">
                      {row.load || '–'} {row.unit || ''}
                    </td>
                    <td className="mono small">
                      {row.byteType === 'Random'
                        ? `${row.minByte || 64}–${row.maxByte || 1518} Random`
                        : `${row.minByte || 64} Fixed`}
                    </td>
                    {/* 적어 넣은 값으로 정해진다. 「비우면 L2」 규칙이 편집기
                        안내문에만 있어서 여기서 제일 자주 틀렸다. */}
                    <td>
                      <span className="tt-tag">{headerOf(row)}</span>
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
            <div className="tt-all">
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
              <div className="tt-box">
                <div className="tt-bh">포트 · 방향 · L4</div>
                <div className="tt-grid">
                  {fld('SRC', 'src', '', portOpts(s?.src as string | undefined), 104)}
                  {fld('DST', 'dst', '', portOpts(s?.dst as string | undefined), 104)}
                  {fld('방향', 'direction', '', ['단방향', '양방향'], 88)}
                  {fld('프로토콜', 'l4proto', '', L4, 84)}
                  {fld('S.Port', 'srcPort', '', undefined, 64)}
                  {fld('D.Port', 'dstPort', '', undefined, 64)}
                </div>
              </div>

              <div className="tt-box">
                <div className="tt-bh">L2 Ethernet</div>
                <div className="tt-sub">SRC MAC</div>
                <div className="tt-grid">
                  {fld('From', 'srcMac', '00:00:00:00:00:01', undefined, 140)}
                  {fld('To', 'srcMacTo', '비우면 자동', undefined, 140)}
                  {fld('Step', 'srcMacStep', '1', undefined, 48)}
                  {fld('모드', 'srcMacMod', '', MODS, 88)}
                </div>
                <div className="tt-sub">DST MAC</div>
                <div className="tt-grid">
                  {fld('From', 'dstMac', '00:00:00:00:00:02', undefined, 140)}
                  {fld('To', 'dstMacTo', '비우면 자동', undefined, 140)}
                  {fld('Step', 'dstMacStep', '1', undefined, 48)}
                  {fld('모드', 'dstMacMod', '', MODS, 88)}
                </div>
                <div className="tt-sub">VLAN</div>
                <div className="tt-grid">
                  {fld('VLAN ID', 'vlan', '없으면 비움', undefined, 92)}
                  {fld('모드', 'vlanMod', '', MODS, 88)}
                  {fld('Step', 'vlanStep', '1', undefined, 48)}
                  {fld('802.1p', 'prio', '0', undefined, 44)}
                  {fld('E-Type', 'etherType', '', ETYPES, 92)}
                </div>
              </div>

              <div className="tt-box">
                <div className="tt-bh">L3 IP</div>
                {/* 무엇이 나가는지를 여기서 정한다 — 비우면 L2 다.
                    전에는 비워도 IPv4·UDP 헤더가 붙어 나갔다. */}
                <div className="tt-hint">
                  <b>비우면 L2</b> 로 나갑니다 — 위 표의 「헤더」 칸이 지금 무엇으로 나가는지
                  알려 줍니다.
                </div>
                <div className="tt-sub">SRC IP</div>
                <div className="tt-grid">
                  {fld('From', 'srcIp', '1.1.1.1', undefined, 124)}
                  {fld('To', 'srcIpTo', '비우면 자동', undefined, 124)}
                  {fld('모드', 'srcIpMod', '', MODS, 88)}
                </div>
                <div className="tt-sub">DST IP</div>
                <div className="tt-grid">
                  {fld('From', 'dstIp', '2.1.1.1', undefined, 124)}
                  {fld('To', 'dstIpTo', '비우면 자동', undefined, 124)}
                  {fld('모드', 'dstIpMod', '', MODS, 88)}
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
                      onClick={() => void sendArp()}
                    >
                      {busy === 'arp' ? '…' : 'ARP Send'}
                    </button>
                  </label>
                  {fld('DSCP', 'dscp', '0', undefined, 48)}
                  {fld('TTL', 'ttl', '64', undefined, 48)}
                </div>
              </div>

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
