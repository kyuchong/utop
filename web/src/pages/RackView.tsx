import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import DeviceForm from '@/components/DeviceForm'
import RackTermHost, { type TermTab } from '@/components/RackTerm'
import type { Device } from '@/pages/Devices'
import './RackView.css'

/**
 * 랙뷰 — 시험실 랙 실장도.
 *
 * 「그 장비 어디 있어요」 를 눈으로 답한다. 구역 탭 → 랙 기둥 → U 자리에
 * 장비가 실물 배치 그대로 그려지고, LED 가 접속 상태를 말한다. 장비를
 * 누르면 그 자리에서 편집 창이 열린다 — 찾기와 접속이 한 화면이다.
 *
 * 배치는 끌어다 놓는다: 왼쪽 팔레트의 미배치 장비·부품(블랭크·패치 패널…)을
 * 랙 빈 칸으로, 랙 안의 장비는 다른 칸·다른 랙으로. U 크기는 장비 등록의
 * 「U 크기」 를 따르고, 랙 머리에는 소모전력 합계가 붙는다.
 *
 * 랙 틀(구역·랙·부품)은 옛 화면과 같은 KV(/api/racks)를 쓴다 — 옛 앱에서
 * 그려 둔 랙이 그대로 나온다. 장비 배치는 PG(device 의 rack_id·rack_pos·
 * rack_units)가 정본이고, 아직 새 DB 로 안 옮긴 옛 devices.json 배치는
 * 회색 유령으로 보여 준다(숨김 금지 원칙).
 */

interface RvAccess {
  protocol: string
  status?: string | null
  enabled?: boolean
}
interface RvDevice {
  id?: string
  ip: string
  name?: string | null
  model?: string | null
  lab?: string | null
  role?: string | null
  vendor?: string | null
  power_w?: number | null
  ifs?: string[]
  rack_id: string
  rack_pos: number
  rack_units: number
  source: 'pg' | 'legacy'
  access?: RvAccess[]
}
interface RvRack {
  id: string
  name: string
  units?: number
  lab_id?: string
  desc?: string
}
interface RvBlank {
  id: string
  rack_id?: string
  rack_name?: string
  pos: number | string
  units: number | string
  label: string
  color?: string
}
interface RvLab {
  id: string
  name: string
}
interface RvUnplaced {
  id: string
  ip: string
  name?: string | null
  model?: string | null
  lab?: string | null
  rack_units?: number | null
  power_w?: number | null
}
interface RvData {
  labs: RvLab[]
  racks: RvRack[]
  blanks: RvBlank[]
  devices: RvDevice[]
  unplaced: RvUnplaced[]
}

/** 끌 때 실어 보내는 것 */
type DragLoad =
  | { kind: 'dev'; id: string; units: number }
  | { kind: 'part'; label: string; units: number; color?: string }
  | { kind: 'partmove'; id: string; units: number }

const LAB_KEY = 'utop.rack.lab'

/** 부품 팔레트 — 자주 꽂는 것들. 직접 추가로 늘릴 수 있다 */
const PART_PRESETS: Array<{ label: string; units: number; color?: string }> = [
  { label: '블랭크', units: 1 },
  { label: '블랭크', units: 2 },
  { label: '패치 패널', units: 1, color: '#38bdf8' },
  { label: '광 분배함(ODF)', units: 4, color: '#2dd4bf' },
  { label: '케이블 정리', units: 1, color: '#94a3b8' },
  { label: '콘솔 서버', units: 1, color: '#a78bfa' },
]

/** Rack-2 < Rack-10 이 되도록 숫자를 알아듣는 정렬 */
const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { numeric: true })

/** 접속 상태 — 블록 오른쪽 끝의 점 4개. 자리 순서가 곧 프로토콜이다:
    Telnet · SSH · Console · SNMP. 색은 상태:
    초록 연결됨 · 빨강 실패 · 회색 미확인 · 빈 테두리 미등록. */
const PROTO_DOTS = [
  { p: 'telnet', label: 'Telnet' },
  { p: 'ssh', label: 'SSH' },
  { p: 'console', label: 'Console' },
  { p: 'snmp', label: 'SNMP' },
] as const
function protoState(d: RvDevice, p: string): 'ok' | 'ng' | 'un' | 'off' {
  const a = (d.access ?? []).find((x) => x.protocol === p && x.enabled !== false)
  if (!a) return 'off'
  if (a.status === 'ok') return 'ok'
  if (a.status === 'fail') return 'ng'
  return 'un'
}
/** 카드 머리의 한 마디 — 정상(초록)/실패(빨강)/미확인(회색) */
function stHead(d: RvDevice): { cls: string; word: string; via: string } {
  if (d.source === 'legacy') return { cls: 'old', word: '옛 자료', via: '' }
  const acc = (d.access ?? []).filter((a) => a.enabled !== false)
  const ok = acc.find((a) => a.status === 'ok')
  if (ok) return { cls: 'ok', word: '정상', via: ok.protocol.toUpperCase() }
  if (acc.some((a) => a.status === 'fail')) return { cls: 'ng', word: '미연결', via: '' }
  return { cls: 'un', word: '미확인', via: '' }
}


const readLoad = (e: DragEvent): DragLoad | null => {
  try {
    return JSON.parse(e.dataTransfer.getData('text/plain')) as DragLoad
  } catch {
    return null
  }
}

export default function RackView() {
  const qc = useQueryClient()
  const [lab, setLab] = useState(() => localStorage.getItem(LAB_KEY) ?? '')
  const [q, setQ] = useState('')
  const [form, setForm] = useState<Device | null | undefined>(undefined)
  const [tip, setTip] = useState<{ x: number; y: number; d: RvDevice } | null>(null)
  const [addingLab, setAddingLab] = useState(false)
  const [labDraft, setLabDraft] = useState('')
  const [renamingLab, setRenamingLab] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  /** 지금 어느 칸 위에 끌고 있나 — 붙을 수 있으면 파랗게, 없으면 붉게 */
  const [over, setOver] = useState<{ rack: string; pos: number; ok: boolean } | null>(null)
  /** 빈 칸을 눌러서 놓기 — 드래그가 안 되는 환경(터치패드 등) 몫 */
  const [placeAt, setPlaceAt] = useState<{ rack: RvRack; pos: number } | null>(null)
  /** 빈 칸 우클릭 — 장비를 놓을지 부품을 놓을지 고르는 메뉴 */
  const [ctx, setCtx] = useState<{ x: number; y: number; rack: RvRack; pos: number } | null>(null)
  const [partAt, setPartAt] = useState<{ rack: RvRack; pos: number } | null>(null)
  /** 판 빈 곳 우클릭 — 랙 추가 메뉴 */
  const [boardCtx, setBoardCtx] = useState<{ x: number; y: number } | null>(null)
  /** 장비 우클릭 — 열기·빼기 메뉴 */
  const [devCtx, setDevCtx] = useState<{ x: number; y: number; d: RvDevice } | null>(null)
  /** 랙 머리 우클릭 — 용도·지우기 메뉴 */
  const [rackCtx, setRackCtx] = useState<{ x: number; y: number; rack: RvRack } | null>(null)
  /** 부품 우클릭 — 빼기 메뉴 */
  const [partCtx, setPartCtx] = useState<{ x: number; y: number; b: RvBlank } | null>(null)
  /** 터미널 — 탭 여러 개, 장비 우클릭 「접속」 으로 늘어난다 */
  const [term, setTerm] = useState<{ tabs: TermTab[]; on: number } | null>(null)
  /** 랙 용도 한 줄 — 이름 아래. 누르면 그 자리에서 적는다 */
  const [descEdit, setDescEdit] = useState<string | null>(null)
  const [descDraft, setDescDraft] = useState('')
  const boardRef = useRef<HTMLDivElement | null>(null)
  /** 카드의 포트 형상 — SNMP 실측 결과 (장비 id → 결과) */
  const [tipPorts, setTipPorts] = useState<{
    id: string
    ok: boolean
    ports: Array<{ name: string; up: boolean }>
    reason?: string
  } | null>(null)
  const portsTimer = useRef<number | undefined>(undefined)
  /** 구역 탭 hover 요약 */
  const [zoneTip, setZoneTip] = useState<{ x: number; y: number; labId: string } | null>(null)
  /** 랙 머리 hover 요약 */
  const [rackTip, setRackTip] = useState<{ x: number; y: number; rack: RvRack } | null>(null)
  /** 1U 높이 — 제일 큰 랙이 판 높이에 꽉 차게 자동 계산. 고정값은 화면마다
      아래가 남거나(너무 촘촘) 잘리거나(너무 성김) 한다. */
  const [uH, setUH] = useState(19)

  const rvQ = useQuery({
    queryKey: ['rackview'],
    queryFn: async () => {
      const r = await apiFetch('/api/rackview')
      if (!r.ok) throw new Error(`불러오지 못했습니다 (${r.status})`)
      return (await r.json()) as RvData
    },
    refetchInterval: 30_000,
  })
  const data = rvQ.data

  /* ── 구역 탭 — KV labs 가 정본, racks 에만 있는 lab_id 도 끼워 준다 ── */
  const labs = useMemo(() => {
    const out: RvLab[] = [...(data?.labs ?? [])]
    for (const r of data?.racks ?? []) {
      const lid = r.lab_id ?? ''
      if (lid && !out.some((l) => l.id === lid)) out.push({ id: lid, name: lid })
    }
    return out
  }, [data])

  const curLab = labs.some((l) => l.id === lab) ? lab : (labs[0]?.id ?? '')
  const pickLab = (id: string) => {
    setLab(id)
    localStorage.setItem(LAB_KEY, id)
  }

  const racks = useMemo(
    () => (data?.racks ?? []).filter((r) => (r.lab_id ?? '') === curLab).sort(byName),
    [data, curLab],
  )
  useEffect(() => {
    const d = tip?.d
    if (portsTimer.current) window.clearTimeout(portsTimer.current)
    if (!d || d.source !== 'pg' || !d.id) return
    const hasSnmp = (d.access ?? []).some((a) => a.protocol === 'snmp' && a.enabled !== false)
    if (!hasSnmp) {
      setTipPorts({ id: d.id, ok: false, ports: [], reason: 'SNMP 미등록' })
      return
    }
    if (tipPorts?.id === d.id) return
    portsTimer.current = window.setTimeout(() => {
      void (async () => {
        try {
          const r = await apiFetch(`/api/devices2/${encodeURIComponent(d.id!)}/snmp-ports`)
          const b = (await r.json()) as {
            ok?: boolean
            ports?: Array<{ name: string; up: boolean }>
            reason?: string
          }
          setTipPorts({ id: d.id!, ok: !!b.ok, ports: b.ports ?? [], reason: b.reason })
        } catch {
          setTipPorts({ id: d.id!, ok: false, ports: [], reason: '조회 실패' })
        }
      })()
    }, 250)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tip?.d])

  useEffect(() => {
    const el = boardRef.current
    if (!el) return
    const maxU = racks.reduce((m, r) => Math.max(m, r.units ?? 45), 45)
    const calc = () => {
      // 어림 상수는 화면마다 아래가 남았다(실측 60px). 실제 그려진 머리·
      // 용도 줄·패딩을 재서 뺀다 — 제일 큰 랙이 판에 꽉 차게.
      const cs = getComputedStyle(el)
      const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
      let chrome = 37 // 랙이 아직 없을 때의 근사값(머리 28+그리드 7+테두리 2)
      const head = el.querySelector<HTMLElement>('.rv-rhead')
      if (head) {
        const desc = el.querySelector<HTMLElement>('.rv-rdescln, .rv-rdesced')
        const grid = el.querySelector<HTMLElement>('.rv-grid')
        const g = grid ? getComputedStyle(grid) : null
        chrome =
          head.offsetHeight +
          (desc ? desc.offsetHeight : 0) +
          (g ? parseFloat(g.paddingTop) + parseFloat(g.paddingBottom) : 7) +
          2
      }
      const usable = el.clientHeight - padY - chrome
      // 정수로 내리면 45U 에서 최대 44px 자투리가 아래에 남는다 — 소수점
      // 그대로 준다. 브라우저가 소수 픽셀을 알아서 나눠 그린다.
      // 하한 17 — Full HD 에서 참고 화면과 같은 밀도. 더 작은 창은 스크롤
      setUH(Math.max(17, Math.min(30, Math.round((usable / maxU) * 100) / 100)))
    }
    calc()
    const ro = new ResizeObserver(calc)
    ro.observe(el)
    return () => ro.disconnect()
  }, [racks])

  const devByRack = useMemo(() => {
    const m = new Map<string, RvDevice[]>()
    for (const d of data?.devices ?? []) {
      if (!m.has(d.rack_id)) m.set(d.rack_id, [])
      m.get(d.rack_id)!.push(d)
    }
    return m
  }, [data])
  const blanksByRack = useMemo(() => {
    const m = new Map<string, RvBlank[]>()
    for (const b of data?.blanks ?? []) {
      const rk = (data?.racks ?? []).find(
        (r) => (b.rack_id ? r.id === b.rack_id : r.name === b.rack_name),
      )
      if (!rk) continue
      if (!m.has(rk.id)) m.set(rk.id, [])
      m.get(rk.id)!.push(b)
    }
    return m
  }, [data])

  /* ── 검색 — 다른 구역의 몇 대가 걸리는지 탭에도 알려 준다 ── */
  const nq = q.trim().toLowerCase()
  const hits = useMemo(() => {
    if (!nq) return null
    const set = new Set<RvDevice>()
    const perLab = new Map<string, number>()
    const rackLab = new Map((data?.racks ?? []).map((r) => [r.id, r.lab_id ?? '']))
    for (const d of data?.devices ?? []) {
      const s = [d.name, d.ip, d.model].filter(Boolean).join(' ').toLowerCase()
      if (!s.includes(nq)) continue
      set.add(d)
      const lid = rackLab.get(d.rack_id) ?? ''
      perLab.set(lid, (perLab.get(lid) ?? 0) + 1)
    }
    return { set, perLab }
  }, [data, nq])

  /* ── 랙 틀 저장 — KV 전체를 읽어 그 자리만 고치고 되쓴다 ── */
  const saveFrames = async (fn: (kv: Record<string, unknown>) => void) => {
    const r = await apiFetch('/api/racks')
    const kv = ((await r.json()) as Record<string, unknown>) ?? {}
    fn(kv)
    const w = await apiFetch('/api/racks', { method: 'POST', body: JSON.stringify(kv) })
    const j = (await w.json()) as { success?: boolean; error?: string }
    if (!j.success) throw new Error(j.error || '저장하지 못했습니다')
    await qc.invalidateQueries({ queryKey: ['rackview'] })
  }

  const addLab = useMutation({
    mutationFn: (name: string) =>
      saveFrames((kv) => {
        const list = (kv.labs as RvLab[] | undefined) ?? []
        if (list.some((l) => l.name === name)) throw new Error('이미 있는 구역입니다')
        list.push({ id: 'lab-' + Date.now(), name })
        kv.labs = list
      }),
    onSuccess: () => {
      setAddingLab(false)
      setLabDraft('')
    },
    onError: (e) => window.alert(e instanceof Error ? e.message : String(e)),
  })

  const renameLab = useMutation({
    mutationFn: (p: { id: string; name: string }) =>
      saveFrames((kv) => {
        const list = (kv.labs as RvLab[] | undefined) ?? []
        const it = list.find((l) => l.id === p.id)
        if (it) it.name = p.name
        kv.labs = list
      }),
    onSuccess: () => setRenamingLab(null),
    onError: (e) => window.alert(e instanceof Error ? e.message : String(e)),
  })

  const setDesc = useMutation({
    mutationFn: (p: { id: string; desc: string }) =>
      saveFrames((kv) => {
        const it = ((kv.racks as RvRack[] | undefined) ?? []).find((r) => r.id === p.id)
        if (it) it.desc = p.desc
      }),
    onSuccess: () => setDescEdit(null),
    onError: (e) => window.alert(e instanceof Error ? e.message : String(e)),
  })

  const delLab = useMutation({
    mutationFn: (id: string) =>
      saveFrames((kv) => {
        kv.labs = ((kv.labs as RvLab[] | undefined) ?? []).filter((l) => l.id !== id)
      }),
    onError: (e) => window.alert(e instanceof Error ? e.message : String(e)),
  })

  const addRack = useMutation({
    mutationFn: (units: number) =>
      saveFrames((kv) => {
        const list = (kv.racks as RvRack[] | undefined) ?? []
        const mine = list.filter((r) => (r.lab_id ?? '') === curLab)
        let mx = 0
        for (const r of mine) {
          const m = /(\d+)\s*$/.exec(r.name)
          if (m) mx = Math.max(mx, parseInt(m[1] ?? '0', 10))
        }
        list.push({ id: 'rack-' + Date.now(), name: `Rack-${mx + 1}`, units, lab_id: curLab })
        kv.racks = list
      }),
    onError: (e) => window.alert(e instanceof Error ? e.message : String(e)),
  })

  const delRack = useMutation({
    mutationFn: (rk: RvRack) =>
      saveFrames((kv) => {
        const racks = ((kv.racks as RvRack[] | undefined) ?? []).filter((r) => r.id !== rk.id)
        const blanks = ((kv.blanks as RvBlank[] | undefined) ?? []).filter(
          (b) => (b.rack_id ? b.rack_id !== rk.id : b.rack_name !== rk.name),
        )
        // 중간을 지우면 순번을 당긴다 — 자동 이름(Rack-N)만, 같은 구역 안에서.
        // 직접 지은 이름은 안 건드린다. 장비는 rack_id 로 붙어 있어 이름이
        // 바뀌어도 안 떨어지지만, 이름으로 붙는 옛 부품은 같이 고쳐 준다.
        const auto = racks
          .filter((r) => (r.lab_id ?? '') === (rk.lab_id ?? '') && /^Rack-\d+$/.test(r.name))
          .sort((a, b) => parseInt(a.name.slice(5), 10) - parseInt(b.name.slice(5), 10))
        auto.forEach((r, i) => {
          const want = `Rack-${i + 1}`
          if (r.name === want) return
          for (const b of blanks)
            if (b.rack_id === r.id || (!b.rack_id && b.rack_name === r.name)) b.rack_name = want
          r.name = want
        })
        kv.racks = racks
        kv.blanks = blanks
      }),
    onError: (e) => window.alert(e instanceof Error ? e.message : String(e)),
  })

  /* ── 부품(블랭크·패치 패널…) 넣기·옮기기·빼기 ── */
  const putPart = useMutation({
    mutationFn: (p: { rack: RvRack; pos: number; label: string; units: number; color?: string }) =>
      saveFrames((kv) => {
        const list = (kv.blanks as RvBlank[] | undefined) ?? []
        list.push({
          id: 'blk-' + Date.now(),
          rack_id: p.rack.id,
          rack_name: p.rack.name,
          pos: p.pos,
          units: p.units,
          label: p.label,
          ...(p.color ? { color: p.color } : {}),
        })
        kv.blanks = list
      }),
    onError: (e) => window.alert(e instanceof Error ? e.message : String(e)),
  })

  const movePart = useMutation({
    mutationFn: (p: { id: string; rack: RvRack; pos: number }) =>
      saveFrames((kv) => {
        const it = ((kv.blanks as RvBlank[] | undefined) ?? []).find((b) => b.id === p.id)
        if (!it) throw new Error('부품을 찾을 수 없습니다')
        it.rack_id = p.rack.id
        it.rack_name = p.rack.name
        it.pos = p.pos
      }),
    onError: (e) => window.alert(e instanceof Error ? e.message : String(e)),
  })

  const delPart = useMutation({
    mutationFn: (id: string) =>
      saveFrames((kv) => {
        kv.blanks = ((kv.blanks as RvBlank[] | undefined) ?? []).filter((b) => b.id !== id)
      }),
    onError: (e) => window.alert(e instanceof Error ? e.message : String(e)),
  })

  /* ── 장비 배치 ── */
  const setRack = useMutation({
    mutationFn: async (p: {
      devId: string
      rack_id: string | null
      rack_pos?: number
      rack_units?: number
    }) => {
      const r = await apiFetch(`/api/devices2/${encodeURIComponent(p.devId)}/rack`, {
        method: 'POST',
        body: JSON.stringify({ rack_id: p.rack_id, rack_pos: p.rack_pos, rack_units: p.rack_units }),
      })
      if (!r.ok) {
        const b = (await r.json().catch(() => ({}))) as { detail?: string }
        throw new Error(b.detail || String(r.status))
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['rackview'] }),
    onError: (e) => window.alert(e instanceof Error ? e.message : String(e)),
  })

  const delDevice = useMutation({
    mutationFn: async (devId: string) => {
      const r = await apiFetch(`/api/devices2/${encodeURIComponent(devId)}`, { method: 'DELETE' })
      if (!r.ok) {
        const b = (await r.json().catch(() => ({}))) as { detail?: string }
        throw new Error(b.detail || String(r.status))
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['rackview'] }),
    onError: (e) => window.alert(e instanceof Error ? e.message : String(e)),
  })

  /** 접속 탭 열기 — 같은 장비·방식 탭이 있으면 그 탭으로 간다 */
  const openTerm = async (d: RvDevice, proto: 'telnet' | 'ssh' | 'console') => {
    if (!d.id) return
    const r = await apiFetch(`/api/devices2/${encodeURIComponent(d.id)}`)
    if (!r.ok) {
      window.alert('장비를 불러오지 못했습니다')
      return
    }
    const dev = (await r.json()) as Device
    const key = `${dev.id}:${proto}`
    setTerm((cur) => {
      const tabs = cur?.tabs ?? []
      const at = tabs.findIndex((t) => t.key === key)
      if (at >= 0) return { tabs, on: at }
      return { tabs: [...tabs, { key, dev, protocol: proto }], on: tabs.length }
    })
  }

  /* 장비를 누르면 — PG 장비는 편집 창, 옛 자료는 새 장비 등록으로 문을 연다 */
  const openDev = async (d: RvDevice) => {
    setTip(null)
    if (d.source === 'pg' && d.id) {
      const r = await apiFetch(`/api/devices2/${encodeURIComponent(d.id)}`)
      if (r.ok) setForm((await r.json()) as Device)
      return
    }
    if (
      window.confirm(
        `${d.name || d.ip} 는 아직 새 DB 에 없는 옛 자료입니다.\n지금 새 장비로 등록할까요?`,
      )
    )
      setForm({ id: '', ip: d.ip, model: d.model ?? '', lab: d.lab ?? '' } as Device)
  }

  /** pos 부터 units 칸이 비어 있나 — 옮기는 자기 자신은 빼고 센다 */
  const fits = (
    rk: RvRack,
    pos: number,
    units: number,
    ignore?: { devId?: string; blankId?: string },
  ) => {
    const top = rk.units ?? 45
    if (pos < 1 || pos + units - 1 > top) return false
    const used = new Set<number>()
    for (const d of devByRack.get(rk.id) ?? []) {
      if (ignore?.devId && d.id === ignore.devId) continue
      for (let u = d.rack_pos; u < d.rack_pos + d.rack_units; u++) used.add(u)
    }
    for (const b of blanksByRack.get(rk.id) ?? []) {
      if (ignore?.blankId && b.id === ignore.blankId) continue
      const bp = Number(b.pos) || 0
      const bu = Number(b.units) || 1
      for (let u = bp; u < bp + bu; u++) used.add(u)
    }
    for (let u = pos; u < pos + units; u++) if (used.has(u)) return false
    return true
  }

  const rowOf = (rk: RvRack, pos: number, units: number) => {
    const top = rk.units ?? 45
    return `${top - (pos + units - 1) + 1} / span ${units}`
  }

  /** 끌던 것을 이 칸에 놓는다 */
  const dropAt = (rk: RvRack, pos: number, e: DragEvent) => {
    e.preventDefault()
    setOver(null)
    const load = readLoad(e)
    if (!load) return
    const ignore =
      load.kind === 'dev'
        ? { devId: load.id }
        : load.kind === 'partmove'
          ? { blankId: load.id }
          : undefined
    // 위가 모자라면 옛 화면처럼 내려 앉힌다 (45U 에 4U 를 45 에 놓으면 42 로)
    const top = rk.units ?? 45
    let at = pos
    if (at + load.units - 1 > top) at = top - load.units + 1
    if (at < 1) at = 1
    if (!fits(rk, at, load.units, ignore)) {
      window.alert(`그 자리에 ${load.units}U 가 안 들어갑니다 — 겹치는 칸이 있습니다`)
      return
    }
    if (load.kind === 'dev')
      setRack.mutate({ devId: load.id, rack_id: rk.id, rack_pos: at, rack_units: load.units })
    else if (load.kind === 'part')
      putPart.mutate({ rack: rk, pos: at, label: load.label, units: load.units, color: load.color })
    else movePart.mutate({ id: load.id, rack: rk, pos: at })
  }

  const startDrag = (e: DragEvent, load: DragLoad) => {
    e.dataTransfer.setData('text/plain', JSON.stringify(load))
    e.dataTransfer.effectAllowed = load.kind === 'part' ? 'copy' : 'move'
  }

  const powerOf = (rkId: string) =>
    (devByRack.get(rkId) ?? []).reduce((s, d) => s + (d.power_w ?? 0), 0)
  const usedOf = (rkId: string) =>
    (devByRack.get(rkId) ?? []).reduce((s, d) => s + (d.rack_units || 1), 0) +
    (blanksByRack.get(rkId) ?? []).reduce((s, b) => s + (Number(b.units) || 1), 0)

  return (
    <section className="panel rv" style={{ ['--rv-u' as string]: `${uH}px` }}>
      {form !== undefined && (
        <DeviceForm
          editing={form}
          onClose={() => {
            setForm(undefined)
            void qc.invalidateQueries({ queryKey: ['rackview'] })
          }}
        />
      )}
      {/* 제목 줄 없음 — 세로 한 뼘이 랙 한 칸이다. 랙 추가는 판 우클릭 */}
      <div className="rv-bar">
        <div className="rv-zones">
          {labs.map((l) => {
            const cnt = (data?.racks ?? []).filter((r) => (r.lab_id ?? '') === l.id).length
            const hit = hits?.perLab.get(l.id) ?? 0
            if (renamingLab === l.id)
              return (
                <input
                  key={l.id}
                  className="rv-labadd"
                  autoFocus
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Enter' && renameDraft.trim())
                      renameLab.mutate({ id: l.id, name: renameDraft.trim() })
                    if (e.key === 'Escape') setRenamingLab(null)
                  }}
                  onBlur={() => setRenamingLab(null)}
                />
              )
            return (
              <button
                key={l.id}
                type="button"
                className={`rv-zone${l.id === curLab ? ' on' : ''}`}
                title="더블클릭하면 이름을 바꿉니다"
                onMouseEnter={(e) => {
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  setZoneTip({ x: r.left, y: r.bottom, labId: l.id })
                }}
                onMouseLeave={() => setZoneTip(null)}
                onClick={() => pickLab(l.id)}
                onDoubleClick={() => {
                  setRenamingLab(l.id)
                  setRenameDraft(l.name)
                }}
              >
                {l.name}
                <i className="rv-zn">{cnt}랙</i>
                {hit > 0 && <i className="rv-zhit">{hit}</i>}
                <i
                  className="rv-zx"
                  role="button"
                  title="구역 지우기"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (cnt > 0) {
                      window.alert(`랙 ${cnt}개가 있어 지울 수 없습니다 — 랙을 먼저 지우세요`)
                      return
                    }
                    if (window.confirm(`${l.name} 구역을 지울까요?`)) delLab.mutate(l.id)
                  }}
                >
                  ×
                </i>
              </button>
            )
          })}
          {addingLab ? (
            <input
              className="rv-labadd"
              autoFocus
              placeholder="구역 이름"
              value={labDraft}
              onChange={(e) => setLabDraft(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter' && labDraft.trim()) addLab.mutate(labDraft.trim())
                if (e.key === 'Escape') setAddingLab(false)
              }}
              onBlur={() => setAddingLab(false)}
            />
          ) : (
            <button className="rv-zone rv-zadd" type="button" onClick={() => setAddingLab(true)}>
              + 구역
            </button>
          )}
        </div>
        <input
          className="rv-search"
          placeholder="장비 검색 (이름·IP·모델)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="rv-legend">
          <span>
            <span className="rv-4d demo">
              <i className="rv-d4 ok" /><i className="rv-d4 ok" /><i className="rv-d4 un" /><i className="rv-d4 un" />
            </span>
            점 4개 = Telnet · SSH · Console · SNMP 순
          </span>
          <span><i className="rv-dot ok" /> 연결됨</span>
          <span><i className="rv-dot ng" /> 실패</span>
          <span><i className="rv-dot un" /> 미확인</span>
          <span><i className="rv-lsw old" /> 옛 자료</span>
        </div>
      </div>

      <div className="rv-main">

        {/* ── 판 — 랙 기둥들 ── */}
        <div
          className="rv-board"
          ref={boardRef}
          onContextMenu={(e) => {
            e.preventDefault()
            if (curLab) setBoardCtx({ x: e.clientX, y: e.clientY })
          }}
        >
          {rvQ.isLoading ? (
            <div className="empty">불러오는 중…</div>
          ) : labs.length === 0 ? (
            <div className="empty">
              아직 구역이 없습니다. 「+ 구역」 으로 시험실 구역(예: 7F_A구역)을 만들고
              랙을 추가하세요.
            </div>
          ) : racks.length === 0 ? (
            <div className="empty">이 구역에 랙이 없습니다. 오른쪽 위 「+ 랙」 으로 추가하세요.</div>
          ) : (
            racks.map((rk) => {
              const top = rk.units ?? 45
              const devs = devByRack.get(rk.id) ?? []
              const parts = blanksByRack.get(rk.id) ?? []
              const watt = powerOf(rk.id)
              // 무엇이 앉은 칸 — BLANK 바탕·글자를 아예 그리지 않는다.
              // 반투명 부품 밑으로 BLANK 글자가 비쳐 보이던 문제의 답.
              const taken = new Set<number>()
              for (const d of devs)
                for (let u = d.rack_pos; u < d.rack_pos + d.rack_units; u++) taken.add(u)
              for (const b of parts) {
                const bp = Number(b.pos) || 0
                for (let u = bp; u < bp + (Number(b.units) || 1); u++) taken.add(u)
              }
              return (
                <div className="rv-rack" key={rk.id}>
                  <div
                    className="rv-rhead"
                    onMouseEnter={(e) => {
                      const r2 = (e.currentTarget as HTMLElement).getBoundingClientRect()
                      setRackTip({ x: Math.min(r2.left, window.innerWidth - 280), y: r2.bottom, rack: rk })
                    }}
                    onMouseLeave={() => setRackTip(null)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setRackCtx({ x: e.clientX, y: e.clientY, rack: rk })
                    }}
                  >
                    <b className="rv-rnm">{rk.name}</b>
                    {watt > 0 && (
                      <span className="rv-watt" title="실린 장비 소모전력 합계">
                        {watt}W
                      </span>
                    )}
                    <span className="rv-uband" title="사용 중 U / 랙 높이">
                      {usedOf(rk.id)}/{top}U
                    </span>
                  </div>
                  {descEdit === rk.id ? (
                    <input
                      className="rv-rdesced"
                      autoFocus
                      value={descDraft}
                      placeholder="용도 (예: 공공 L2 스위치)"
                      onChange={(e) => setDescDraft(e.target.value)}
                      onKeyDown={(e) => {
                        e.stopPropagation()
                        if (e.key === 'Enter') setDesc.mutate({ id: rk.id, desc: descDraft.trim() })
                        if (e.key === 'Escape') setDescEdit(null)
                      }}
                      onBlur={() => setDescEdit(null)}
                    />
                  ) : rk.desc ? (
                    <div
                      className="rv-rdescln"
                      title="눌러서 고칩니다"
                      onClick={() => {
                        setDescEdit(rk.id)
                        setDescDraft(rk.desc ?? '')
                      }}
                    >
                      {rk.desc}
                    </div>
                  ) : null}
                  <div
                    className="rv-grid"
                    style={{ gridTemplateRows: `repeat(${top}, var(--rv-u))` }}
                  >
                    {Array.from({ length: top }, (_, i) => {
                      const u = top - i
                      return (
                        <span key={`n${u}`} className="rv-uno" style={{ gridRow: i + 1 }}>
                          {u}
                        </span>
                      )
                    })}
                    {Array.from({ length: top }, (_, i) => {
                      const u = top - i
                      if (taken.has(u))
                        return (
                          <span key={`b${u}`} className="rv-blank off" style={{ gridRow: i + 1 }} />
                        )
                      const ov = over && over.rack === rk.id && over.pos === u
                      return (
                        <span
                          key={`b${u}`}
                          className={`rv-blank${ov ? (over.ok ? ' can' : ' cant') : ''}`}
                          style={{ gridRow: i + 1 }}
                          onDragOver={(e) => {
                            e.preventDefault()
                            const load = readLoad(e)
                            // dragover 에서는 dataTransfer 를 못 읽는 브라우저가
                            // 있어 자리 표시만 하고, 판정은 drop 에서 다시 한다
                            const ok = load
                              ? fits(
                                  rk,
                                  u,
                                  load.units,
                                  load.kind === 'dev'
                                    ? { devId: load.id }
                                    : load.kind === 'partmove'
                                      ? { blankId: load.id }
                                      : undefined,
                                )
                              : true
                            setOver({ rack: rk.id, pos: u, ok })
                          }}
                          onDragLeave={() => setOver(null)}
                          onDrop={(e) => dropAt(rk, u, e)}
                          onClick={() => setPlaceAt({ rack: rk, pos: u })}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setCtx({ x: e.clientX, y: e.clientY, rack: rk, pos: u })
                          }}
                          title="누르면 장비 놓기 · 우클릭하면 장비/부품 · 끌어다 놓아도 됩니다"
                        >
                          <i>BLANK · 1U</i>
                        </span>
                      )
                    })}
                    {parts.map((b) => {
                      const bp = Number(b.pos) || 1
                      const bu = Number(b.units) || 1
                      return (
                        <span
                          key={b.id}
                          className="rv-part"
                          draggable
                          onDragStart={(e) =>
                            startDrag(e, { kind: 'partmove', id: b.id, units: bu })
                          }
                          onContextMenu={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setPartCtx({ x: e.clientX, y: e.clientY, b })
                          }}
                          style={{
                            gridRow: rowOf(rk, bp, bu),
                            ...(b.color
                              ? { background: `${b.color}22`, borderColor: `${b.color}88` }
                              : {}),
                          }}
                        >
                          <span className="rv-ptxt">
                            {b.label}
                            {bu > 1 ? ` · ${bu}U` : ''}
                          </span>
                        </span>
                      )
                    })}
                    {devs.map((d) => {
                      const dim = hits && !hits.set.has(d)
                      const hit = hits?.set.has(d)
                      return (
                        <div
                          key={`${d.source}-${d.id ?? d.ip}-${d.rack_pos}`}
                          className={`rv-dev ${d.source}${dim ? ' dim' : ''}${hit ? ' hit' : ''}`}
                          style={{ gridRow: rowOf(rk, d.rack_pos, d.rack_units) }}
                          role="button"
                          tabIndex={0}
                          draggable={d.source === 'pg' && !!d.id}
                          onDragStart={(e) => {
                            if (d.source === 'pg' && d.id)
                              startDrag(e, { kind: 'dev', id: d.id, units: d.rack_units })
                            setTip(null)
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setTip(null)
                            setDevCtx({ x: e.clientX, y: e.clientY, d })
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void openDev(d)
                          }}
                          onMouseEnter={(e) => setTip({ x: e.clientX, y: e.clientY, d })}
                          onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, d })}
                          onMouseLeave={() => setTip(null)}
                        >
                          <span className="rv-dnm">{d.name || d.model || d.ip}</span>
                          {d.source === 'pg' && (
                            <span className="rv-4d">
                              {PROTO_DOTS.map((x) => {
                                const st = protoState(d, x.p)
                                return (
                                  <i
                                    key={x.p}
                                    className={`rv-d4 ${st}`}
                                    title={`${x.label} ${
                                      st === 'off' ? '없음' : st === 'ok' ? '연결됨' : st === 'ng' ? '실패' : '미확인'
                                    }`}
                                  />
                                )
                              })}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {ctx && (
        <div
          className="rv-ctxovl"
          onClick={() => setCtx(null)}
          onContextMenu={(e) => {
            e.preventDefault()
            setCtx(null)
          }}
        >
          <div className="rv-ctx" style={{ left: ctx.x, top: ctx.y }} onClick={(e) => e.stopPropagation()}>
            <div className="rv-ctxh">
              {ctx.rack.name} · {ctx.pos}U
            </div>
            <button
              type="button"
              onClick={() => {
                setPlaceAt({ rack: ctx.rack, pos: ctx.pos })
                setCtx(null)
              }}
            >
              장비 놓기…
            </button>
            <button
              type="button"
              onClick={() => {
                setPartAt({ rack: ctx.rack, pos: ctx.pos })
                setCtx(null)
              }}
            >
              부품 놓기… <i className="muted small">블랭크·패치 패널·ODF</i>
            </button>
          </div>
        </div>
      )}

      {boardCtx && (
        <div
          className="rv-ctxovl"
          onClick={() => setBoardCtx(null)}
          onContextMenu={(e) => {
            e.preventDefault()
            setBoardCtx(null)
          }}
        >
          <div
            className="rv-ctx"
            style={{ left: boardCtx.x, top: boardCtx.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rv-ctxh">{labs.find((l) => l.id === curLab)?.name ?? ''}</div>
            <button
              type="button"
              onClick={() => {
                addRack.mutate(45)
                setBoardCtx(null)
              }}
            >
              + 랙 45U 추가
            </button>
            <button
              type="button"
              onClick={() => {
                addRack.mutate(36)
                setBoardCtx(null)
              }}
            >
              + 랙 36U 추가
            </button>
          </div>
        </div>
      )}

      {rackCtx && (
        <div
          className="rv-ctxovl"
          onClick={() => setRackCtx(null)}
          onContextMenu={(e) => {
            e.preventDefault()
            setRackCtx(null)
          }}
        >
          <div
            className="rv-ctx"
            style={{ left: rackCtx.x, top: rackCtx.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rv-ctxh">{rackCtx.rack.name}</div>
            <button
              type="button"
              onClick={() => {
                setDescEdit(rackCtx.rack.id)
                setDescDraft(rackCtx.rack.desc ?? '')
                setRackCtx(null)
              }}
            >
              {rackCtx.rack.desc ? '용도 고치기…' : '용도 적기…'}
            </button>
            <button
              type="button"
              onClick={() => {
                const devsIn = devByRack.get(rackCtx.rack.id) ?? []
                setRackCtx(null)
                if (devsIn.length > 0) {
                  window.alert(`장비 ${devsIn.length}대가 실려 있어 지울 수 없습니다`)
                  return
                }
                if (window.confirm(`${rackCtx.rack.name} 랙을 지울까요?`)) delRack.mutate(rackCtx.rack)
              }}
            >
              랙 지우기
            </button>
          </div>
        </div>
      )}

      {partCtx && (
        <div
          className="rv-ctxovl"
          onClick={() => setPartCtx(null)}
          onContextMenu={(e) => {
            e.preventDefault()
            setPartCtx(null)
          }}
        >
          <div
            className="rv-ctx"
            style={{ left: partCtx.x, top: partCtx.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rv-ctxh">{partCtx.b.label}</div>
            <button
              type="button"
              className="danger"
              onClick={() => {
                delPart.mutate(partCtx.b.id)
                setPartCtx(null)
              }}
            >
              부품 빼기
            </button>
          </div>
        </div>
      )}

      {devCtx && (
        <div
          className="rv-ctxovl"
          onClick={() => setDevCtx(null)}
          onContextMenu={(e) => {
            e.preventDefault()
            setDevCtx(null)
          }}
        >
          <div
            className="rv-ctx"
            style={{ left: devCtx.x, top: devCtx.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rv-ctxh">{devCtx.d.name || devCtx.d.ip}</div>
            {devCtx.d.source === 'pg' && (
              <>
                <div className="rv-ctxs">접속</div>
                {(['telnet', 'ssh', 'console'] as const).map((p) => {
                  const has = (devCtx.d.access ?? []).some(
                    (a) => a.protocol === p && a.enabled !== false,
                  )
                  return (
                    <button
                      key={p}
                      type="button"
                      disabled={!has}
                      title={has ? '' : '이 장비에 등록되지 않은 방식입니다'}
                      onClick={() => {
                        void openTerm(devCtx.d, p)
                        setDevCtx(null)
                      }}
                    >
                      {p === 'telnet' ? 'Telnet' : p === 'ssh' ? 'SSH' : 'Console'}
                    </button>
                  )
                })}
                <hr className="rv-ctxhr" />
              </>
            )}
            <button
              type="button"
              onClick={() => {
                void openDev(devCtx.d)
                setDevCtx(null)
              }}
            >
              {devCtx.d.source === 'pg' ? '장비 열기…' : '새 장비로 등록…'}
            </button>
            {devCtx.d.source === 'pg' && devCtx.d.id && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setRack.mutate({ devId: devCtx.d.id!, rack_id: null })
                    setDevCtx(null)
                  }}
                >
                  랙에서 빼기 <i className="muted small">장비는 남습니다</i>
                </button>
                <hr className="rv-ctxhr" />
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    const nm = devCtx.d.name || devCtx.d.ip
                    setDevCtx(null)
                    if (
                      window.confirm(
                        `${nm} 를 완전히 삭제할까요?\n랙 자리만 비우는 게 아니라 장비 등록 자체가 지워집니다.`,
                      )
                    )
                      delDevice.mutate(devCtx.d.id!)
                  }}
                >
                  장비 삭제…
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {partAt && (
        <PartDialog
          rack={partAt.rack}
          pos={partAt.pos}
          fits={fits}
          busy={putPart.isPending}
          onPlace={(label, units, color) => {
            putPart.mutate({ rack: partAt.rack, pos: partAt.pos, label, units, color })
            setPartAt(null)
          }}
          onClose={() => setPartAt(null)}
        />
      )}

      {placeAt && (
        <PlaceDialog
          rack={placeAt.rack}
          pos={placeAt.pos}
          unplaced={data?.unplaced ?? []}
          fits={fits}
          busy={setRack.isPending}
          onPlace={(devId, units) => {
            setRack.mutate({
              devId,
              rack_id: placeAt.rack.id,
              rack_pos: placeAt.pos,
              rack_units: units,
            })
            setPlaceAt(null)
          }}
          onClose={() => setPlaceAt(null)}
        />
      )}

      {term && term.tabs.length > 0 && (
        <RackTermHost
          tabs={term.tabs}
          on={term.on}
          onPick={(i) => setTerm((c) => (c ? { ...c, on: i } : c))}
          onCloseTab={(i) =>
            setTerm((c) => {
              if (!c) return c
              const tabs = c.tabs.filter((_, j) => j !== i)
              if (tabs.length === 0) return null
              return { tabs, on: Math.min(c.on > i ? c.on - 1 : c.on, tabs.length - 1) }
            })
          }
          onClose={() => setTerm(null)}
        />
      )}

      {tip && (() => {
        const d = tip.d
        const h = stHead(d)
        const rk = (data?.racks ?? []).find((r) => r.id === d.rack_id)
        const labNm = labs.find((l) => l.id === (rk?.lab_id ?? ''))?.name ?? ''
        const word = (p: string) => {
          const st = protoState(d, p)
          return st === 'off' ? '없음' : st === 'ok' ? '연결됨' : st === 'ng' ? '실패' : '미확인'
        }
        // 포트 — SNMP 실측이 있으면 그것이 정본, 없으면 등록 목록(중립)
        const live = tipPorts && tipPorts.id === d.id ? tipPorts : null
        const rawPorts: Array<{ no: string; name: string; up?: boolean }> = (
          live?.ok
            ? live.ports.map((x) => {
                const m = /(\d+)\s*$/.exec(x.name)
                return { no: m ? m[1]! : x.name.slice(-2), name: x.name, up: x.up }
              })
            : (d.ifs ?? []).map((n) => {
                const m = /(\d+)\s*$/.exec(n)
                return { no: m ? m[1]! : n.slice(-2), name: n }
              })
        ).slice(0, 96)
        // 8포트 단위 묶음 — 실물 스위치의 블록과 같은 문법
        const groups: (typeof rawPorts)[] = []
        for (let g = 0; g < rawPorts.length; g += 8) groups.push(rawPorts.slice(g, g + 8))
        const upCnt = live?.ok ? live.ports.filter((x) => x.up).length : 0
        const x = Math.min(tip.x + 14, window.innerWidth - 320)
        const y = Math.min(tip.y + 12, window.innerHeight - (rawPorts.length ? 420 : 300))
        return (
          <div className="rv-tip" style={{ left: x, top: y }}>
            <div className="rv-th2">
              <b>{d.name || d.ip}</b>
              <span className={`rv-tst ${h.cls}`}>● {h.word}</span>
            </div>
            <div className="rv-tr"><i>구역</i><span>{labNm || '–'}</span></div>
            <div className="rv-tr"><i>위치</i><span>{rk?.name ?? '–'} · {d.rack_pos}U</span></div>
            <div className="rv-tr"><i>장비 높이</i><span>{d.rack_units}U</span></div>
            <div className="rv-tr"><i>제조사</i><span>{d.vendor || '–'}</span></div>
            <div className="rv-tr"><i>제품군</i><span>{d.role || '–'}</span></div>
            <div className="rv-tr"><i>모델명</i><span>{d.model || '–'}</span></div>
            {d.source === 'pg' && (
              <div className="rv-tr rv-tacc">
                <i>접속</i>
                <span>
                  {(['telnet', 'ssh', 'console', 'snmp'] as const).map((pr) => (
                    <em key={pr} className={`rv-tal ${protoState(d, pr)}`}>
                      {pr === 'telnet' ? 'Telnet' : pr === 'ssh' ? 'SSH' : pr === 'console' ? 'Console' : 'SNMP'}{' '}
                      {word(pr)}
                    </em>
                  ))}
                </span>
              </div>
            )}
            <div className="rv-tr"><i>소모전력</i><span>{d.power_w ? `${d.power_w}W` : '–'}</span></div>
            {rawPorts.length > 0 && (
              <div className="rv-tports-wrap">
                <div className="rv-tports-h">
                  {live?.ok
                    ? `포트 형상 · SNMP 실측 — up ${upCnt} / 전체 ${live.ports.length}`
                    : `포트 형상 · 등록 목록 ${rawPorts.length}포트${live?.reason ? ` (${live.reason})` : ''}`}
                </div>
                <div className="rv-tp8s">
                  {groups.map((g, gi) => (
                    <div className="rv-tports" key={gi}>
                      {g.map((pp, k) => (
                        <i
                          key={k}
                          className={pp.up === undefined ? '' : pp.up ? 'up' : 'down'}
                          title={`${pp.name}${pp.up === undefined ? '' : pp.up ? ' — up' : ' — down'}`}
                        >
                          {pp.no}
                        </i>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="rv-hint">
              {d.source === 'pg'
                ? '우클릭 → 접속(Telnet/SSH)·열기·빼기 · 끌어서 옮기기'
                : '옛 자료 — 우클릭해서 새 장비로 등록'}
            </div>
          </div>
        )
      })()}

      {/* 구역 탭 hover — 그 Lab 전체 현황 */}
      {zoneTip && (() => {
        const lid = zoneTip.labId
        const rks = (data?.racks ?? []).filter((r) => (r.lab_id ?? '') === lid)
        const rkIds = new Set(rks.map((r) => r.id))
        const devs = (data?.devices ?? []).filter((d) => rkIds.has(d.rack_id))
        const totU = rks.reduce((s2, r) => s2 + (r.units ?? 45), 0)
        const usedU = rks.reduce((s2, r) => s2 + usedOf(r.id), 0)
        const watt = devs.reduce((s2, d) => s2 + (d.power_w ?? 0), 0)
        const st = { ok: 0, ng: 0, un: 0 }
        for (const d of devs) {
          const c = stHead(d).cls
          if (c === 'ok') st.ok++
          else if (c === 'ng') st.ng++
          else st.un++
        }
        const nm = labs.find((l) => l.id === lid)?.name ?? ''
        return (
          <div className="rv-tip" style={{ left: zoneTip.x, top: zoneTip.y + 12 }}>
            <div className="rv-th2"><b>{nm}</b><span className="muted small">구역 현황</span></div>
            <div className="rv-tr"><i>랙</i><span>{rks.length}개</span></div>
            <div className="rv-tr"><i>장비</i><span>{devs.length}대</span></div>
            <div className="rv-tr"><i>사용 U</i><span>{usedU} / {totU}U</span></div>
            <div className="rv-tr"><i>소모전력</i><span>{watt ? `${watt}W` : '–'}</span></div>
            <div className="rv-tr">
              <i>접속</i>
              <span>
                <em className="rv-tal ok">연결 {st.ok}</em>
                <em className="rv-tal ng">실패 {st.ng}</em>
                <em className="rv-tal un">미확인 {st.un}</em>
              </span>
            </div>
          </div>
        )
      })()}

      {/* 랙 머리 hover — 그 랙 현황 */}
      {rackTip && (() => {
        const rk = rackTip.rack
        const devs = devByRack.get(rk.id) ?? []
        const parts = blanksByRack.get(rk.id) ?? []
        const watt = devs.reduce((s2, d) => s2 + (d.power_w ?? 0), 0)
        const st = { ok: 0, ng: 0, un: 0 }
        for (const d of devs) {
          const c = stHead(d).cls
          if (c === 'ok') st.ok++
          else if (c === 'ng') st.ng++
          else st.un++
        }
        return (
          <div className="rv-tip" style={{ left: rackTip.x, top: rackTip.y + 12 }}>
            <div className="rv-th2"><b>{rk.name}</b><span className="muted small">랙 현황</span></div>
            {rk.desc && <div className="rv-tr"><i>용도</i><span>{rk.desc}</span></div>}
            <div className="rv-tr"><i>장비</i><span>{devs.length}대</span></div>
            <div className="rv-tr"><i>부품</i><span>{parts.length}개</span></div>
            <div className="rv-tr"><i>사용 U</i><span>{usedOf(rk.id)} / {rk.units ?? 45}U</span></div>
            <div className="rv-tr"><i>소모전력</i><span>{watt ? `${watt}W` : '–'}</span></div>
            <div className="rv-tr">
              <i>접속</i>
              <span>
                <em className="rv-tal ok">연결 {st.ok}</em>
                <em className="rv-tal ng">실패 {st.ng}</em>
                <em className="rv-tal un">미확인 {st.un}</em>
              </span>
            </div>
          </div>
        )
      })()}
    </section>
  )
}

/** 빈 칸을 눌러 장비 놓기 — 아직 랙에 없는 장비 중에서 고른다.
    드래그가 기본이지만, 폼 경로를 없애면 안 된다(터치패드·정밀 배치). */
function PlaceDialog({
  rack,
  pos,
  unplaced,
  fits,
  busy,
  onPlace,
  onClose,
}: {
  rack: RvRack
  pos: number
  unplaced: RvUnplaced[]
  fits: (rk: RvRack, pos: number, units: number) => boolean
  busy: boolean
  onPlace: (devId: string, units: number) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState('')
  const [units, setUnits] = useState(1)
  const nq = q.trim().toLowerCase()
  const list = unplaced.filter(
    (d) => !nq || [d.name, d.ip, d.model].filter(Boolean).join(' ').toLowerCase().includes(nq),
  )
  const pick = (d: RvUnplaced) => {
    setSel(d.id)
    setUnits(d.rack_units || 1)
  }
  const ok = sel && fits(rack, pos, units)
  return (
    <div className="rv-ovl" onClick={onClose}>
      <div className="rv-dlg" onClick={(e) => e.stopPropagation()}>
        <div className="rv-dh">
          <b>
            {rack.name} · {pos}U 자리에 놓기
          </b>
          <button className="rv-rx" type="button" onClick={onClose}>
            ×
          </button>
        </div>
        <input
          autoFocus
          placeholder="장비 검색 (이름·IP·모델)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="rv-dlist">
          {list.length === 0 ? (
            <div className="muted small rv-dempty">
              랙에 안 실린 장비가 없습니다 — 장비 화면에서 먼저 등록하세요.
            </div>
          ) : (
            list.map((d) => (
              <button
                key={d.id}
                type="button"
                className={`rv-drow${sel === d.id ? ' on' : ''}`}
                onClick={() => pick(d)}
              >
                <b>{d.name || d.ip}</b>
                <span className="muted small">{d.model || '–'}</span>
                <span className="muted small">{d.rack_units || 1}U</span>
              </button>
            ))
          )}
        </div>
        <div className="rv-df">
          <label>
            크기(U)
            <input
              type="number"
              min={1}
              max={20}
              value={units}
              onChange={(e) => setUnits(Math.max(1, parseInt(e.target.value, 10) || 1))}
            />
          </label>
          {sel && !fits(rack, pos, units) && (
            <span className="rv-warn">그 자리에 {units}U 가 안 들어갑니다</span>
          )}
          <span className="sp" />
          <button className="btn small" type="button" onClick={onClose}>
            취소
          </button>
          <button
            className="btn small primary"
            type="button"
            disabled={!ok || busy}
            onClick={() => sel && onPlace(sel, units)}
          >
            놓기
          </button>
        </div>
      </div>
    </div>
  )
}

/** 빈 칸 우클릭 → 부품 놓기 — 자주 쓰는 것 + 직접 입력 */
function PartDialog({
  rack,
  pos,
  fits,
  busy,
  onPlace,
  onClose,
}: {
  rack: RvRack
  pos: number
  fits: (rk: RvRack, pos: number, units: number) => boolean
  busy: boolean
  onPlace: (label: string, units: number, color?: string) => void
  onClose: () => void
}) {
  const [sel, setSel] = useState<number>(-1)
  const [label, setLabel] = useState('')
  const [units, setUnits] = useState(1)
  const [color, setColor] = useState('#94a3b8')
  const custom = sel === -1 && label.trim() !== ''
  const cur = custom
    ? { label: label.trim(), units, color }
    : sel >= 0
      ? PART_PRESETS[sel]
      : null
  const ok = cur && fits(rack, pos, cur.units)
  return (
    <div className="rv-ovl" onClick={onClose}>
      <div className="rv-dlg" onClick={(e) => e.stopPropagation()}>
        <div className="rv-dh">
          <b>
            {rack.name} · {pos}U 에 부품 놓기
          </b>
          <button className="rv-rx" type="button" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="rv-plist">
          {PART_PRESETS.map((p, i) => (
            <button
              key={i}
              type="button"
              className={`rv-ppart${sel === i ? ' on' : ''}`}
              style={p.color ? { borderColor: `${p.color}88`, background: `${p.color}1a` } : {}}
              onClick={() => {
                setSel(i)
                setLabel('')
              }}
            >
              <b>{p.label}</b>
              <i>{p.units}U</i>
            </button>
          ))}
        </div>
        <div className="rv-padd">
          <input
            placeholder="직접 입력 (이름)"
            value={label}
            onChange={(e) => {
              setLabel(e.target.value)
              if (e.target.value.trim()) setSel(-1)
            }}
          />
          <input
            type="number"
            min={1}
            max={10}
            value={units}
            onChange={(e) => setUnits(Math.max(1, parseInt(e.target.value, 10) || 1))}
          />
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </div>
        <div className="rv-df">
          {cur && !fits(rack, pos, cur.units) && (
            <span className="rv-warn">그 자리에 {cur.units}U 가 안 들어갑니다</span>
          )}
          <span className="sp" />
          <button className="btn small" type="button" onClick={onClose}>
            취소
          </button>
          <button
            className="btn small primary"
            type="button"
            disabled={!ok || busy}
            onClick={() => cur && onPlace(cur.label, cur.units, cur.color)}
          >
            놓기
          </button>
        </div>
      </div>
    </div>
  )
}
