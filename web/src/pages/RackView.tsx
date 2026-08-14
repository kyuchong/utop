import { useMemo, useState } from 'react'
import type { DragEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import DeviceForm from '@/components/DeviceForm'
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
  power_w?: number | null
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

/** LED — 옛 랙뷰와 같은 문법: 초록 Telnet · 파랑 SSH · 빨강 미연결 · 회색 미확인 */
function ledOf(d: RvDevice): { cls: string; label: string } {
  if (d.source === 'legacy') return { cls: 'old', label: '옛 자료 (새 DB 미등록)' }
  const acc = (d.access ?? []).filter((a) => a.enabled !== false)
  const ok = (p: string) => acc.some((a) => a.protocol === p && a.status === 'ok')
  if (ok('telnet')) return { cls: 'tn', label: '연결됨 · Telnet' }
  if (ok('ssh') || ok('n2x') || ok('stc')) return { cls: 'sh', label: '연결됨 · SSH' }
  if (acc.some((a) => a.status === 'fail')) return { cls: 'ng', label: '미연결' }
  return { cls: 'un', label: '미확인' }
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
        kv.racks = ((kv.racks as RvRack[] | undefined) ?? []).filter((r) => r.id !== rk.id)
        kv.blanks = ((kv.blanks as RvBlank[] | undefined) ?? []).filter(
          (b) => (b.rack_id ? b.rack_id !== rk.id : b.rack_name !== rk.name),
        )
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

  /* 미배치 장비 팔레트 검색 */
  const unplaced = useMemo(() => {
    const list = data?.unplaced ?? []
    if (!nq) return list
    return list.filter((d) =>
      [d.name, d.ip, d.model].filter(Boolean).join(' ').toLowerCase().includes(nq),
    )
  }, [data, nq])

  const powerOf = (rkId: string) =>
    (devByRack.get(rkId) ?? []).reduce((s, d) => s + (d.power_w ?? 0), 0)
  const usedOf = (rkId: string) =>
    (devByRack.get(rkId) ?? []).reduce((s, d) => s + (d.rack_units || 1), 0) +
    (blanksByRack.get(rkId) ?? []).reduce((s, b) => s + (Number(b.units) || 1), 0)

  return (
    <section className="panel rv">
      {form !== undefined && (
        <DeviceForm
          editing={form}
          onClose={() => {
            setForm(undefined)
            void qc.invalidateQueries({ queryKey: ['rackview'] })
          }}
        />
      )}
      <div className="panel-title">
        <span className="panel-name">
          랙뷰
          <span className="muted small">{racks.length ? `${racks.length}랙` : ''}</span>
        </span>
        <div className="page-head-actions">
          <button className="btn small" type="button" disabled={!curLab} onClick={() => addRack.mutate(45)}>
            + 랙 45U
          </button>
          <button className="btn small" type="button" disabled={!curLab} onClick={() => addRack.mutate(36)}>
            + 랙 36U
          </button>
        </div>
      </div>

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
          <span><i className="rv-led tn" /> 연결됨·Telnet</span>
          <span><i className="rv-led sh" /> 연결됨·SSH</span>
          <span><i className="rv-led ng" /> 미연결</span>
          <span><i className="rv-led un" /> 미확인</span>
          <span><i className="rv-led old" /> 옛 자료</span>
        </div>
      </div>

      <div className="rv-main">
        {/* ── 팔레트 — 여기서 끌어다 랙에 놓는다 ── */}
        <aside className="rv-pal">
          <div className="rv-psec">
            <div className="rv-ph">
              미배치 장비 <i>{unplaced.length}</i>
            </div>
            <div className="rv-plist">
              {unplaced.length === 0 ? (
                <div className="muted small rv-pempty">
                  {nq ? '검색에 걸린 미배치 장비가 없습니다' : '전부 랙에 실려 있습니다'}
                </div>
              ) : (
                unplaced.map((d) => (
                  <div
                    key={d.id}
                    className="rv-pdev"
                    draggable
                    onDragStart={(e) =>
                      startDrag(e, { kind: 'dev', id: d.id, units: d.rack_units || 1 })
                    }
                    title="랙의 빈 칸으로 끌어다 놓으세요"
                  >
                    <b>{d.name || d.ip}</b>
                    <span className="muted small">{d.model || d.ip}</span>
                    <i>{d.rack_units || 1}U</i>
                  </div>
                ))
              )}
            </div>
            <div className="rv-phint muted small">
              끌어다 랙에 놓으세요. 랙의 빈 칸을 우클릭하면 부품(블랭크·패치
              패널…)도, 판 빈 곳을 우클릭하면 랙을 추가할 수 있습니다.
            </div>
          </div>
        </aside>

        {/* ── 판 — 랙 기둥들 ── */}
        <div
          className="rv-board"
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
              return (
                <div className="rv-rack" key={rk.id}>
                  <div className="rv-rhead">
                    <b className="rv-rnm">{rk.name}</b>
                    {rk.desc && <span className="rv-rdesc">{rk.desc}</span>}
                    {watt > 0 && (
                      <span className="rv-watt" title="실린 장비 소모전력 합계">
                        {watt}W
                      </span>
                    )}
                    <span className="rv-uband" title="사용 중 U / 랙 높이">
                      {usedOf(rk.id)}/{top}U
                    </span>
                    <button
                      className="rv-rx"
                      type="button"
                      title="랙 지우기"
                      onClick={() => {
                        if (devs.length > 0) {
                          window.alert(`장비 ${devs.length}대가 실려 있어 지울 수 없습니다`)
                          return
                        }
                        if (window.confirm(`${rk.name} 랙을 지울까요?`)) delRack.mutate(rk)
                      }}
                    >
                      ×
                    </button>
                  </div>
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
                          <button
                            className="rv-x"
                            type="button"
                            title="부품 빼기"
                            onClick={() => delPart.mutate(b.id)}
                          >
                            ×
                          </button>
                        </span>
                      )
                    })}
                    {devs.map((d) => {
                      const led = ledOf(d)
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
                          onClick={() => void openDev(d)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void openDev(d)
                          }}
                          onMouseEnter={(e) => setTip({ x: e.clientX, y: e.clientY, d })}
                          onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, d })}
                          onMouseLeave={() => setTip(null)}
                        >
                          <span className="rv-dnm">{d.name || d.model || d.ip}</span>
                          {d.rack_units > 1 && <span className="rv-du">{d.rack_units}U</span>}
                          <i className={`rv-led ${led.cls}`} />
                          {d.source === 'pg' && d.id && (
                            <button
                              className="rv-x"
                              type="button"
                              title="랙에서 빼기 (장비는 남습니다)"
                              onClick={(e) => {
                                e.stopPropagation()
                                setRack.mutate({ devId: d.id!, rack_id: null })
                              }}
                            >
                              ×
                            </button>
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

      {tip && (
        <div className="rv-tip" style={{ left: tip.x + 14, top: tip.y + 12 }}>
          <b>{tip.d.name || tip.d.ip}</b>
          <div className="rv-tr"><i>IP</i><span>{tip.d.ip || '–'}</span></div>
          <div className="rv-tr"><i>모델</i><span>{tip.d.model || '–'}</span></div>
          <div className="rv-tr">
            <i>자리</i>
            <span>
              {tip.d.rack_pos}U{tip.d.rack_units > 1 ? ` · ${tip.d.rack_units}U 크기` : ''}
              {tip.d.power_w ? ` · ${tip.d.power_w}W` : ''}
            </span>
          </div>
          <div className="rv-tr"><i>상태</i><span>{ledOf(tip.d).label}</span></div>
          <div className="rv-hint">
            {tip.d.source === 'pg'
              ? '눌러서 열기 · 끌어서 옮기기'
              : '옛 자료 — 누르면 새 장비로 등록'}
          </div>
        </div>
      )}
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
