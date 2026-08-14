import { useMemo, useState } from 'react'
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
 * 랙 틀(구역·랙 이름·높이·블랭크 패널)은 옛 화면과 같은 KV(/api/racks)를
 * 쓴다 — 옛 앱에서 그려 둔 랙이 그대로 나온다. 장비 배치는 PG(device 의
 * rack_id·rack_pos·rack_units)가 정본이고, 아직 새 DB 로 안 옮긴 옛
 * 배치는 회색 유령으로 보여 준다(숨김 금지 원칙).
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
interface RvData {
  labs: RvLab[]
  racks: RvRack[]
  blanks: RvBlank[]
  devices: RvDevice[]
  unplaced: Array<{ id: string; ip: string; name?: string | null; model?: string | null; lab?: string | null }>
}

const LAB_KEY = 'utop.rack.lab'

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

export default function RackView() {
  const qc = useQueryClient()
  const [lab, setLab] = useState(() => localStorage.getItem(LAB_KEY) ?? '')
  const [q, setQ] = useState('')
  const [form, setForm] = useState<Device | null | undefined>(undefined)
  const [tip, setTip] = useState<{ x: number; y: number; d: RvDevice } | null>(null)
  const [placeAt, setPlaceAt] = useState<{ rack: RvRack; pos: number } | null>(null)
  const [addingLab, setAddingLab] = useState(false)
  const [labDraft, setLabDraft] = useState('')

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
    onSuccess: () => {
      setPlaceAt(null)
      void qc.invalidateQueries({ queryKey: ['rackview'] })
    },
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

  /** 이 랙에서 pos 부터 units 칸이 비어 있나 — 놓기 전에 겹침을 막는다 */
  const fits = (rk: RvRack, pos: number, units: number) => {
    const top = rk.units ?? 45
    if (pos < 1 || pos + units - 1 > top) return false
    const used = new Set<number>()
    for (const d of devByRack.get(rk.id) ?? [])
      for (let u = d.rack_pos; u < d.rack_pos + d.rack_units; u++) used.add(u)
    for (const b of blanksByRack.get(rk.id) ?? []) {
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
            return (
              <button
                key={l.id}
                type="button"
                className={`rv-zone${l.id === curLab ? ' on' : ''}`}
                onClick={() => pickLab(l.id)}
              >
                {l.name}
                <i className="rv-zn">{cnt}랙</i>
                {hit > 0 && <i className="rv-zhit">{hit}</i>}
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

      <div className="rv-board">
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
            return (
              <div className="rv-rack" key={rk.id}>
                <div className="rv-rhead">
                  <b className="rv-rnm">{rk.name}</b>
                  {rk.desc && <span className="rv-rdesc">{rk.desc}</span>}
                  <span className="rv-uband">{top}U</span>
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
                      <span
                        key={`n${u}`}
                        className="rv-uno"
                        style={{ gridRow: i + 1 }}
                      >
                        {u}
                      </span>
                    )
                  })}
                  {Array.from({ length: top }, (_, i) => {
                    const u = top - i
                    return (
                      <span key={`b${u}`} className="rv-blank" style={{ gridRow: i + 1 }}>
                        <i>BLANK · 1U</i>
                        <button
                          className="rv-put"
                          type="button"
                          title={`${u}U 자리에 장비 놓기`}
                          onClick={() => setPlaceAt({ rack: rk, pos: u })}
                        >
                          ＋
                        </button>
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
                        style={{
                          gridRow: rowOf(rk, bp, bu),
                          ...(b.color
                            ? { background: `${b.color}22`, borderColor: `${b.color}88` }
                            : {}),
                        }}
                      >
                        {b.label}
                        {bu > 1 ? ` · ${bu}U` : ''}
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

      {tip && (
        <div className="rv-tip" style={{ left: tip.x + 14, top: tip.y + 12 }}>
          <b>{tip.d.name || tip.d.ip}</b>
          <div className="rv-tr"><i>IP</i><span>{tip.d.ip || '–'}</span></div>
          <div className="rv-tr"><i>모델</i><span>{tip.d.model || '–'}</span></div>
          <div className="rv-tr"><i>자리</i><span>{tip.d.rack_pos}U{tip.d.rack_units > 1 ? ` · ${tip.d.rack_units}U 크기` : ''}</span></div>
          <div className="rv-tr"><i>상태</i><span>{ledOf(tip.d).label}</span></div>
          <div className="rv-hint">
            {tip.d.source === 'pg' ? '눌러서 열기' : '옛 자료 — 누르면 새 장비로 등록'}
          </div>
        </div>
      )}

      {placeAt && (
        <PlaceDialog
          rack={placeAt.rack}
          pos={placeAt.pos}
          unplaced={data?.unplaced ?? []}
          fits={fits}
          busy={setRack.isPending}
          onPlace={(devId, units) =>
            setRack.mutate({ devId, rack_id: placeAt.rack.id, rack_pos: placeAt.pos, rack_units: units })
          }
          onClose={() => setPlaceAt(null)}
        />
      )}
    </section>
  )
}

/** 빈 칸에 장비 놓기 — 아직 랙에 없는 장비 중에서 고른다 */
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
  unplaced: RvData['unplaced']
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
  const ok = sel && fits(rack, pos, units)
  return (
    <div className="rv-ovl" onClick={onClose}>
      <div className="rv-dlg" onClick={(e) => e.stopPropagation()}>
        <div className="rv-dh">
          <b>{rack.name} · {pos}U 자리에 놓기</b>
          <button className="rv-rx" type="button" onClick={onClose}>×</button>
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
                onClick={() => setSel(d.id)}
              >
                <b>{d.name || d.ip}</b>
                <span className="muted small">{d.model || '–'}</span>
                <span className="muted small">{d.ip}</span>
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
