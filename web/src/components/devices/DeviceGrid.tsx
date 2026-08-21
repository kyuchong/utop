import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import DeviceForm, { expandRange } from '@/components/DeviceForm'
import LockCell, { useLocks, type Lock } from '@/components/LockCell'
import { ColFilter, EditCell, type Device, type DeviceAccess } from '@/pages/Devices'
import './DeviceGrid.css'

interface Item {
  kind: string
  name: string
  vendor?: string | null
  family?: string | null
  model_group?: string | null
  operator?: string | null
  interfaces?: string | null
}

const PROTOS = [
  { v: 'telnet', lb: 'T', full: 'Telnet 23' },
  { v: 'ssh', lb: 'S', full: 'SSH 22' },
  { v: 'console', lb: 'C', full: 'Console' },
  { v: 'snmp', lb: 'N', full: 'SNMP 161' },
] as const

/** 이 줄이 무엇인가 — 장비 한 대, 또는 아직 장비가 없는 모델(=카탈로그) */
interface Row {
  key: string
  dev?: Device
  model: string
  vendor: string
  family: string
  group: string
}

/**
 * 장비 한 화면 — LAB 을 고르면 그 랩의 것이 표 하나에 선다(지시).
 *
 * 「IP 가 없으면 카탈로그(틀), IP 가 붙으면 장비(실물)」 — 사용자의 말이
 * 그대로 이 표의 규칙이다. 그래서 장비가 없는 모델도 한 줄로 서고, 그 줄의
 * IP 칸에 주소를 적는 순간 장비가 된다.
 *
 * 칸의 **주인이 둘**이라는 것이 이 화면의 핵심이다.
 *   · 벤더 · 제품군 · 모델그룹 → **모델**의 값. 고치면 그 모델을 쓰는 장비가
 *     다 따라 바뀐다. 그래서 옅게 그리고, 바꾸기 전에 몇 대인지 말해 준다.
 *   · 사업자 · IP · RO · RW · 인터페이스 → **이 장비 하나**의 값.
 * 한 모델이 여러 사업자에 걸리므로 사업자는 장비 쪽이다.
 */
export default function DeviceGrid({ me }: { me?: { username?: string; role?: string } | null }) {
  const qc = useQueryClient()
  const [lab, setLab] = useState<string>(() => localStorage.getItem('utop.dev.lab') || '')
  const [q, setQ] = useState('')
  const [colF, setColF] = useState<Record<string, string[]>>({})
  const [note, setNote] = useState<{ kind: string; msg: string }>({ kind: '', msg: '' })
  const [busyId, setBusyId] = useState('')
  const [form, setForm] = useState<Device | null | undefined>(undefined)
  const [ifEdit, setIfEdit] = useState<{ dev: Device; text: string } | null>(null)
  const [ctx, setCtx] = useState<{ dev: Device; x: number; y: number } | null>(null)
  /** 새 줄 — 모델을 고르고 IP 를 적으면 그 자리에서 장비가 된다 */
  const [nu, setNu] = useState<{ model: string; ip: string; op: string }>({ model: '', ip: '', op: '' })
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!note.msg) return
    const t = setTimeout(() => setNote({ kind: '', msg: '' }), note.kind === 'err' ? 8000 : 3000)
    return () => clearTimeout(t)
  }, [note])
  useEffect(() => localStorage.setItem('utop.dev.lab', lab), [lab])

  const devQ = useQuery({
    queryKey: ['devices'],
    queryFn: async () => {
      const r = await apiFetch('/api/devices2?ifs=0')
      if (!r.ok) throw new Error('장비를 불러오지 못했습니다')
      return (await r.json()) as { devices: Device[] }
    },
    staleTime: 60_000,
  })
  const catQ = useQuery({
    queryKey: ['device-catalog'],
    queryFn: async () => {
      const r = await apiFetch('/api/device-catalog2')
      if (!r.ok) throw new Error('카탈로그를 불러오지 못했습니다')
      return (await r.json()) as { items: Item[] }
    },
    staleTime: 60_000,
  })
  const locks = useLocks()
  const lockBy = useMemo(() => {
    const m = new Map<string, Lock>()
    for (const l of locks.data?.locks ?? []) m.set(l.resource_id, l)
    return m
  }, [locks.data])

  const devices = devQ.data?.devices ?? []
  const items = catQ.data?.items ?? []
  const models = items.filter((i) => i.kind === 'model')
  const listOf = (kind: string) => items.filter((i) => i.kind === kind).map((i) => i.name)
  const modelBy = useMemo(() => new Map(models.map((m) => [m.name, m])), [models])

  const nrm = (v?: string | null) => String(v ?? '').trim()
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['devices'] })
    void qc.invalidateQueries({ queryKey: ['device-catalog'] })
    void qc.invalidateQueries({ queryKey: ['device-roles'] })
  }

  /** 줄에서 고친 값 하나를 그대로 저장한다 */
  const patchDev = async (d: Device, p: Partial<Device> & { operator?: string }) => {
    try {
      const r = await apiFetch('/api/devices2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...d, ...p }),
      })
      const b = (await r.json().catch(() => ({}))) as { detail?: string }
      if (!r.ok) throw new Error(b.detail || '저장하지 못했습니다')
      refresh()
      setNote({ kind: 'ok', msg: '고쳤습니다' })
    } catch (e) {
      setNote({ kind: 'err', msg: e instanceof Error ? e.message : String(e) })
    }
  }

  /**
   * SNMP community.
   *
   * 읽는 쪽(랙뷰 포트·접속 확인·시험 스텝)은 죄다 접속 줄의 **계정 칸**을
   * community 로 본다. 그래서 RO 는 거기에 적는다 — 여태 다른 칸에 적혀
   * 조용히 버려지고 있었다(지적). RW 는 params 에 담아 SNMP Set 이 쓴다.
   */
  const patchSnmp = async (d: Device, p: { ro?: string; rw?: string }) => {
    const cur = (d.access ?? []).find((a) => a.protocol === 'snmp')
    const prm = { ...((cur?.params as Record<string, unknown>) ?? {}) }
    if (p.rw !== undefined) {
      prm.community_rw = p.rw
      prm.rw = !!p.rw
    }
    const next: DeviceAccess = {
      port: 161,
      enabled: true,
      ...(cur ?? { protocol: 'snmp' }),
      protocol: 'snmp',
      ...(p.ro !== undefined ? { username: p.ro, community: p.ro } : {}),
      params: prm,
    } as DeviceAccess
    const rest = (d.access ?? []).filter((a) => a.protocol !== 'snmp')
    await patchDev(d, { access: [...rest, next] })
  }

  /** 모델의 분류 — 그 모델을 쓰는 장비 전부에 걸린다. 그래서 먼저 묻는다 */
  const classify = async (model: string, p: Partial<Item>) => {
    const n = devices.filter((d) => nrm(d.model) === model).length
    if (n > 1 && !window.confirm(`「${model}」 의 분류를 바꿉니다.\n이 모델을 쓰는 장비 ${n}대에 함께 적용됩니다.`))
      return
    try {
      const r = await apiFetch('/api/device-catalog2/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: model, ...p }),
      })
      const b = (await r.json().catch(() => ({}))) as { detail?: string }
      if (!r.ok) throw new Error(b.detail || '옮기지 못했습니다')
      refresh()
      setNote({ kind: 'ok', msg: `${model} 을(를) 옮겼습니다${n > 1 ? ` — 장비 ${n}대` : ''}` })
    } catch (e) {
      setNote({ kind: 'err', msg: e instanceof Error ? e.message : String(e) })
    }
  }

  /** 접속 확인 — 그 칸을 누르면 그 자리에서 붙어 본다 */
  const checkM = useMutation({
    mutationFn: async (v: { id: string; protocol?: string }) => {
      setBusyId(v.id + ':' + (v.protocol ?? ''))
      const r = await apiFetch(
        `/api/devices2/${encodeURIComponent(v.id)}/check${v.protocol ? `?protocol=${v.protocol}` : ''}`,
        { method: 'POST' },
      )
      const b = (await r.json().catch(() => ({}))) as { detail?: string }
      if (!r.ok) throw new Error(b.detail || '확인하지 못했습니다')
      return b
    },
    onSettled: () => {
      setBusyId('')
      void qc.invalidateQueries({ queryKey: ['devices'] })
    },
    onError: (e) => setNote({ kind: 'err', msg: e instanceof Error ? e.message : String(e) }),
  })

  /** 이 LAB 전부 — 한 대씩 차례로, 끝나는 대로 칸이 물든다 */
  const [allChk, setAllChk] = useState(0)
  const checkAll = async (ds: Device[]) => {
    if (!ds.length) return
    if (!window.confirm(`${ds.length}대에 차례로 붙어 봅니다. 몇 분 걸릴 수 있습니다.`)) return
    for (let i = 0; i < ds.length; i += 1) {
      const d = ds[i]
      if (!d) continue
      setAllChk(i + 1)
      try {
        await apiFetch(`/api/devices2/${encodeURIComponent(d.id)}/check`, { method: 'POST' })
      } catch {
        /* 한 대가 막혀도 나머지는 계속 본다 */
      }
      void qc.invalidateQueries({ queryKey: ['devices'] })
    }
    setAllChk(0)
    setNote({ kind: 'ok', msg: `${ds.length}대 확인을 마쳤습니다` })
  }

  /* ── LAB 탭 ────────────────────────────────────────────── */
  const labs = useMemo(() => {
    const s = new Set<string>()
    for (const d of devices) if (nrm(d.lab)) s.add(nrm(d.lab))
    for (const n of listOf('lab')) if (n) s.add(n)
    return [...s].sort((a, b) => a.localeCompare(b, 'ko'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devices, items])

  /* ── 줄 만들기 ────────────────────────────────────────── */
  const rowsAll: Row[] = useMemo(() => {
    const out: Row[] = []
    for (const d of devices) {
      const m = modelBy.get(nrm(d.model))
      out.push({
        key: d.id,
        dev: d,
        model: nrm(d.model),
        vendor: nrm(m?.vendor) || nrm(d.vendor),
        family: nrm(m?.family) || nrm(d.role),
        group: nrm(m?.model_group) || nrm(d.model_group),
      })
    }
    /* 장비가 없는 모델 — 「전체」 에서만 보인다. LAB 은 장비가 들고 있는
       값이라, 아직 실물이 없는 모델은 어느 랩에도 속할 수 없다. */
    if (!lab) {
      const has = new Set(devices.map((d) => nrm(d.model)))
      for (const m of models) {
        if (has.has(m.name)) continue
        out.push({
          key: `m:${m.name}`,
          model: m.name,
          vendor: nrm(m.vendor),
          family: nrm(m.family),
          group: nrm(m.model_group),
        })
      }
    }
    return out.sort(
      (a, b) =>
        a.model.localeCompare(b.model, 'ko') ||
        nrm(a.dev?.ip).localeCompare(nrm(b.dev?.ip), undefined, { numeric: true }),
    )
  }, [devices, models, modelBy, lab])

  const valOf = (r: Row, k: string): string => {
    if (k === 'op') return nrm(r.dev?.operator)
    if (k === 'ven') return r.vendor
    if (k === 'fam') return r.family
    if (k === 'grp') return r.group
    if (k === 'mdl') return r.model
    if (k === 'lab') return nrm(r.dev?.lab)
    return ''
  }

  const inLab = (r: Row) => !lab || nrm(r.dev?.lab) === lab
  const hitQ = (r: Row) => {
    const n = q.trim().toLowerCase()
    if (!n) return true
    const hay = [
      r.model, r.vendor, r.family, r.group,
      r.dev?.ip, r.dev?.name, r.dev?.operator, r.dev?.lab,
      (r.dev?.access ?? []).map((a) => a.username).join(' '),
    ]
      .map((v) => String(v ?? '').toLowerCase())
      .join(' ')
    return n.split(/\s+/).every((w) => hay.includes(w))
  }
  const passF = (r: Row, skip?: string) =>
    Object.entries(colF).every(([k, vals]) =>
      !vals.length || k === skip ? true : vals.includes(valOf(r, k) || '(없음)'),
    )

  const rows = rowsAll.filter((r) => inLab(r) && hitQ(r) && passF(r))
  const optsOf = (k: string): Array<[string, number]> => {
    const m = new Map<string, number>()
    for (const r of rowsAll.filter((x) => inLab(x) && hitQ(x) && passF(x, k)))
      m.set(valOf(r, k) || '(없음)', (m.get(valOf(r, k) || '(없음)') ?? 0) + 1)
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ko'))
  }

  /* ── 장비 만들기 ──────────────────────────────────────── */
  const addDev = async (model: string, ip: string, op: string) => {
    const m = modelBy.get(model)
    if (!ip.trim()) {
      setNote({ kind: 'err', msg: 'IP 를 적으세요' })
      return
    }
    /* 모델이 들고 있는 것을 그대로 물려받는다 — 접속 방식과 포트 목록.
       300대를 한 대씩 넣는 자리라, 여기서 안 물려주면 매번 같은 값을
       손으로 채우게 된다. */
    const ifs = expandRange(String(m?.interfaces ?? '')).map((n) => ({ name: n, kind: 'general' }))
    const body = {
      id: ip.trim(),
      ip: ip.trim(),
      model,
      operator: op,
      vendor: nrm(m?.vendor),
      role: nrm(m?.family),
      lab: lab || '',
      access: [
        { protocol: 'telnet', port: 23, enabled: true, is_default: true },
        { protocol: 'ssh', port: 22, enabled: true },
        { protocol: 'snmp', port: 161, enabled: true, username: 'public', community: 'public' },
      ],
      ...(ifs.length ? { interfaces: ifs } : {}),
    }
    try {
      const r = await apiFetch('/api/devices2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const b = (await r.json().catch(() => ({}))) as { detail?: string }
      if (!r.ok) throw new Error(b.detail || '등록하지 못했습니다')
      refresh()
      setNu({ model, ip: '', op })
      setNote({ kind: 'ok', msg: `${model} · ${ip} 등록했습니다` })
    } catch (e) {
      setNote({ kind: 'err', msg: e instanceof Error ? e.message : String(e) })
    }
  }

  const delDev = async (d: Device) => {
    if (!window.confirm(`'${d.model || d.name} · ${d.ip}' 장비를 지울까요?\n이 줄이 사라지고 대수가 줍니다.`))
      return
    try {
      const r = await apiFetch(`/api/devices2/${encodeURIComponent(d.id)}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('지우지 못했습니다')
      refresh()
      setNote({ kind: 'ok', msg: '장비를 지웠습니다' })
    } catch (e) {
      setNote({ kind: 'err', msg: e instanceof Error ? e.message : String(e) })
    }
  }

  /** CSV 가져오기 — 먼저 무엇이 바뀌는지 보여 주고 묻는다 */
  const importCsv = async (text: string) => {
    try {
      const send = async (dry: boolean) => {
        const r = await apiFetch('/api/devices2/import-csv', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ csv: text, dry_run: dry }),
        })
        const b = (await r.json().catch(() => ({}))) as {
          detail?: string
          created?: unknown[]
          updated?: unknown[]
          errors?: string[]
        }
        if (!r.ok) throw new Error(b.detail || '가져오지 못했습니다')
        return b
      }
      const dry = await send(true)
      const msg =
        `새로 ${dry.created?.length ?? 0}대 · 고침 ${dry.updated?.length ?? 0}대` +
        (dry.errors?.length ? `\n\n걸린 줄 ${dry.errors.length}개:\n${dry.errors.slice(0, 8).join('\n')}` : '')
      if (!window.confirm(`${msg}\n\n이대로 넣을까요?`)) return
      const done = await send(false)
      refresh()
      setNote({
        kind: 'ok',
        msg: `새로 ${done.created?.length ?? 0}대 · 고침 ${done.updated?.length ?? 0}대`,
      })
    } catch (e) {
      setNote({ kind: 'err', msg: e instanceof Error ? e.message : String(e) })
    }
  }

  const shown = rows.filter((r) => r.dev)
  const accOf = (d: Device, p: string) => (d.access ?? []).find((a) => a.protocol === p)

  return (
    <div className="dg">
      {/* ── 머리줄 ─────────────────────────────────────── */}
      <div className="dg-head">
        <input
          className="dg-find"
          value={q}
          placeholder="찾기 — 모델 · IP · 사업자 · 계정"
          onChange={(e) => setQ(e.target.value)}
        />
        {note.msg && <span className={`dg-note ${note.kind}`}>{note.msg}</span>}
        <span className="sp" />
        <a className="btn small" href="/api/devices2/export.csv" download>
          내보내기
        </a>
        <button className="btn small" type="button" onClick={() => fileRef.current?.click()}>
          가져오기
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            void f.text().then((t) => importCsv(t))
          }}
        />
        <button className="btn small primary" type="button" onClick={() => setForm(null)}>
          ＋ 장비
        </button>
      </div>

      {/* ── LAB 탭 ─────────────────────────────────────── */}
      <div className="dg-labs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={!lab}
          className={`dg-lab${lab ? '' : ' on'}`}
          onClick={() => setLab('')}
        >
          전체<em>{devices.length}</em>
        </button>
        {labs.map((l) => (
          <button
            key={l}
            type="button"
            role="tab"
            aria-selected={lab === l}
            className={`dg-lab${lab === l ? ' on' : ''}`}
            onClick={() => setLab(l)}
          >
            {l}
            <em>{devices.filter((d) => nrm(d.lab) === l).length}</em>
          </button>
        ))}
      </div>

      {/* ── 표 ─────────────────────────────────────────── */}
      <div className="dg-card">
        <div className="dg-scroll">
          <table className={`dg-tbl${lab ? '' : ' all'}`}>
            <colgroup>
              {!lab && <col className="c-lab" />}
              <col className="c-op" />
              <col className="c-ven" />
              <col className="c-fam" />
              <col className="c-grp" />
              <col className="c-mdl" />
              <col className="c-ip" />
              <col className="c-st" />
              <col className="c-st" />
              <col className="c-st" />
              <col className="c-st" />
              <col className="c-ro" />
              <col className="c-rw" />
              <col className="c-if" />
              <col className="c-use" />
            </colgroup>
            <thead>
              <tr>
                {!lab && (
                  <th>
                    <ColFilter
                      label="LAB"
                      opts={optsOf('lab')}
                      picked={colF.lab ?? []}
                      onPick={(v) => setColF((c) => ({ ...c, lab: v }))}
                    />
                  </th>
                )}
                <th>
                  <ColFilter
                    label="사업자"
                    opts={optsOf('op')}
                    picked={colF.op ?? []}
                    onPick={(v) => setColF((c) => ({ ...c, op: v }))}
                  />
                </th>
                <th>
                  <ColFilter
                    label="벤더"
                    opts={optsOf('ven')}
                    picked={colF.ven ?? []}
                    onPick={(v) => setColF((c) => ({ ...c, ven: v }))}
                  />
                </th>
                <th>
                  <ColFilter
                    label="제품군"
                    opts={optsOf('fam')}
                    picked={colF.fam ?? []}
                    onPick={(v) => setColF((c) => ({ ...c, fam: v }))}
                  />
                </th>
                <th>
                  <ColFilter
                    label="모델그룹"
                    opts={optsOf('grp')}
                    picked={colF.grp ?? []}
                    onPick={(v) => setColF((c) => ({ ...c, grp: v }))}
                  />
                </th>
                <th>
                  <ColFilter
                    label="모델명"
                    opts={optsOf('mdl')}
                    picked={colF.mdl ?? []}
                    onPick={(v) => setColF((c) => ({ ...c, mdl: v }))}
                  />
                </th>
                <th>IP</th>
                {PROTOS.map((p) => (
                  <th key={p.v} className="st" title={p.full}>
                    {p.lb}
                  </th>
                ))}
                <th title="SNMP RO community — 랙뷰 포트·시험이 이 값을 씁니다">RO</th>
                <th title="SNMP RW community — SNMP Set 스텝이 씁니다">RW</th>
                <th>인터페이스</th>
                <th>사용 현황</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const d = r.dev
                return (
                  <tr
                    key={r.key}
                    className={d ? '' : 'nodev'}
                    onContextMenu={(e) => {
                      if (!d) return
                      e.preventDefault()
                      setCtx({ dev: d, x: e.clientX, y: e.clientY })
                    }}
                  >
                    {!lab && (
                      <td className="ell">
                        {d ? (
                          <EditCell
                            value={nrm(d.lab)}
                            opts={labs}
                            title="이 장비가 놓인 LAB"
                            onSave={(v) => void patchDev(d, { lab: v })}
                          />
                        ) : (
                          <span className="muted">–</span>
                        )}
                      </td>
                    )}
                    <td className="ell">
                      {d ? (
                        <EditCell
                          value={nrm(d.operator)}
                          opts={listOf('operator')}
                          title="사업자 — 이 장비 하나의 값입니다"
                          onSave={(v) => void patchDev(d, { operator: v })}
                        />
                      ) : (
                        <span className="muted">–</span>
                      )}
                    </td>
                    {/* 여기 셋은 **모델**의 값 — 옅게 그리고, 바꾸면 그 모델 전부 */}
                    <td className="ell mcol">
                      <EditCell
                        value={r.vendor}
                        opts={listOf('vendor')}
                        title="모델의 값 — 이 모델을 쓰는 장비 전부에 적용됩니다"
                        onSave={(v) => void classify(r.model, { vendor: v })}
                      />
                    </td>
                    <td className="ell mcol">
                      <EditCell
                        value={r.family}
                        opts={listOf('family')}
                        title="모델의 값 — 이 모델을 쓰는 장비 전부에 적용됩니다"
                        onSave={(v) => void classify(r.model, { family: v })}
                      />
                    </td>
                    <td className="ell mcol">
                      <EditCell
                        value={r.group}
                        opts={listOf('group')}
                        title="모델의 값 — 이 모델을 쓰는 장비 전부에 적용됩니다"
                        onSave={(v) => void classify(r.model, { model_group: v })}
                      />
                    </td>
                    <td className="ell">
                      {d ? (
                        <EditCell
                          value={r.model}
                          opts={models.map((m) => m.name)}
                          title="이 장비의 모델 — 바꾸면 이 한 대만 옮겨집니다"
                          onSave={(v) => void patchDev(d, { model: v })}
                        />
                      ) : (
                        <b>{r.model}</b>
                      )}
                    </td>
                    <td className="ell">
                      {d ? (
                        <EditCell
                          value={d.ip}
                          cls="dg-ip"
                          title="IP — 이 장비의 주소"
                          onSave={(v) => void patchDev(d, { ip: v.trim() })}
                        />
                      ) : (
                        <NewIp
                          onAdd={(ip) => void addDev(r.model, ip, '')}
                        />
                      )}
                    </td>
                    {PROTOS.map((p) => {
                      const a = d ? accOf(d, p.v) : undefined
                      const st = String(a?.last_status ?? '')
                      const at = String(a?.last_checked_at ?? '').replace('T', ' ').slice(0, 16)
                      return (
                        <td key={p.v} className="st">
                          {!d || !a ? (
                            <span className="muted">–</span>
                          ) : (
                            <button
                              type="button"
                              className={`dg-dot ${st === 'ok' ? 'ok' : st === 'fail' ? 'ng' : 'un'}`}
                              disabled={busyId === d.id + ':' + p.v}
                              title={
                                busyId === d.id + ':' + p.v
                                  ? '확인 중…'
                                  : `${p.full} — ${
                                      st === 'ok' ? '연결됨' : st === 'fail' ? `실패: ${a.last_error ?? ''}` : '아직 확인 안 함'
                                    }${at ? ` · ${at}` : ''} (누르면 붙어 봅니다)`
                              }
                              onClick={() => checkM.mutate({ id: d.id, protocol: p.v })}
                            />
                          )}
                        </td>
                      )
                    })}
                    <td className="ell">
                      {d ? (
                        <EditCell
                          value={String(accOf(d, 'snmp')?.username ?? accOf(d, 'snmp')?.community ?? '')}
                          cls="mono"
                          title="SNMP RO community"
                          onSave={(v) => void patchSnmp(d, { ro: v })}
                        />
                      ) : (
                        <span className="muted">–</span>
                      )}
                    </td>
                    <td className="ell">
                      {d ? (
                        <EditCell
                          value={String(
                            ((accOf(d, 'snmp')?.params as { community_rw?: string } | undefined)?.community_rw) ?? '',
                          )}
                          cls="mono"
                          title="SNMP RW community"
                          onSave={(v) => void patchSnmp(d, { rw: v })}
                        />
                      ) : (
                        <span className="muted">–</span>
                      )}
                    </td>
                    {/* 인터페이스 — 개수만으론 섀시형이 안 읽힌다. 구성 그대로 */}
                    <td className="ell">
                      {d ? (
                        <button
                          type="button"
                          className="dg-if"
                          title={`포트 ${d.if_count ?? 0}개 — 누르면 고칩니다`}
                          onClick={() =>
                            setIfEdit({ dev: d, text: String(d.if_brief ?? '') })
                          }
                        >
                          {d.if_brief ? (
                            <>
                              <span className="mono ell">{d.if_brief}</span>
                              <em>{d.if_count}</em>
                            </>
                          ) : (
                            <span className="muted">비어 있음 — 모델 기본값 채우기</span>
                          )}
                        </button>
                      ) : (
                        <span className="mono muted ell">{modelBy.get(r.model)?.interfaces || '–'}</span>
                      )}
                    </td>
                    <td>
                      {d ? (
                        <LockCell
                          resourceId={d.id}
                          kind="device"
                          lock={lockBy.get(d.id) ?? lockBy.get(d.ip)}
                          me={me?.username}
                          isAdmin={me?.role === '관리자' || me?.role === 'admin'}
                          onMessage={(kind, text) => setNote({ kind: kind === 'ok' ? 'ok' : 'err', msg: text })}
                        />
                      ) : (
                        <span className="muted">장비 없음</span>
                      )}
                    </td>
                  </tr>
                )
              })}

              {/* 새 줄 — 모델을 고르고 IP 를 적으면 그 자리에서 장비가 된다 */}
              <tr className="dg-new">
                {!lab && <td className="muted">{lab || '전체'}</td>}
                <td>
                  <input
                    value={nu.op}
                    list="dg-ops"
                    placeholder="사업자"
                    onChange={(e) => setNu((v) => ({ ...v, op: e.target.value }))}
                  />
                  <datalist id="dg-ops">
                    {listOf('operator').map((o) => (
                      <option key={o} value={o} />
                    ))}
                  </datalist>
                </td>
                <td colSpan={3} className="muted small">
                  모델을 고르면 벤더·제품군·모델그룹이 따라옵니다
                </td>
                <td>
                  <select value={nu.model} onChange={(e) => setNu((v) => ({ ...v, model: e.target.value }))}>
                    <option value="">모델 고르기</option>
                    {models.map((m) => (
                      <option key={m.name} value={m.name}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    value={nu.ip}
                    className="mono"
                    placeholder="220.1.13.10"
                    onChange={(e) => setNu((v) => ({ ...v, ip: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && nu.model && nu.ip.trim())
                        void addDev(nu.model, nu.ip, nu.op)
                    }}
                  />
                </td>
                <td colSpan={PROTOS.length + 4} className="muted small">
                  {nu.model
                    ? 'IP 를 적고 Enter — 접속 방식과 인터페이스는 이 모델에서 물려받습니다'
                    : '왼쪽에서 모델을 먼저 고르세요'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── 바닥 ─────────────────────────────────────── */}
        <div className="dg-foot">
          <span className="dg-pill">장비 {shown.length}대</span>
          <span className="muted small">
            모델 {new Set(rows.map((r) => r.model)).size} · 사업자{' '}
            {new Set(shown.map((r) => nrm(r.dev?.operator)).filter(Boolean)).size}
          </span>
          <span className="sp" />
          <span className="dg-leg muted small">
            <i className="ok" />
            연결됨
            <i className="ng" />
            실패
            <i className="un" />
            미확인
            <b>–</b>
            미등록
          </span>
          <button
            className="btn small"
            type="button"
            disabled={!!allChk || !shown.length}
            onClick={() => void checkAll(shown.map((r) => r.dev!).filter(Boolean))}
          >
            {allChk ? `확인 중 ${allChk}/${shown.length}` : '이 LAB 전부 접속 확인'}
          </button>
        </div>
      </div>

      {/* ── 오른쪽 단추 ─────────────────────────────────── */}
      {ctx && (
        <>
          <div className="dg-ctxback" onMouseDown={() => setCtx(null)} />
          <div className="dg-ctx" style={{ left: ctx.x, top: ctx.y }}>
            <b className="ell">
              {ctx.dev.model || ctx.dev.name} · {ctx.dev.ip}
            </b>
            <button
              type="button"
              onClick={() => {
                setForm(ctx.dev)
                setCtx(null)
              }}
            >
              편집 창 열기
            </button>
            <button
              type="button"
              onClick={() => {
                const d = ctx.dev
                setCtx(null)
                setNu({ model: nrm(d.model), ip: '', op: nrm(d.operator) })
                setNote({ kind: 'ok', msg: '아래 새 줄에 같은 모델을 담았습니다 — IP 만 적으세요' })
              }}
            >
              같은 모델로 하나 더
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => {
                const d = ctx.dev
                setCtx(null)
                void delDev(d)
              }}
            >
              장비 삭제
            </button>
          </div>
        </>
      )}

      {/* ── 인터페이스 편집 ─────────────────────────────── */}
      {ifEdit && (
        <div className="modal-back" onMouseDown={() => setIfEdit(null)}>
          <div className="modal dg-ifmodal" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <b>
                {ifEdit.dev.model} · {ifEdit.dev.ip} — 인터페이스
              </b>
              <span className="sp" />
              <button className="btn" type="button" onClick={() => setIfEdit(null)}>
                취소
              </button>
              <button
                className="btn primary"
                type="button"
                onClick={() => {
                  const names = expandRange(ifEdit.text.replace(/\n+/g, ', '))
                  void patchDev(ifEdit.dev, {
                    interfaces: names.map((n) => ({ name: n, kind: 'general' })),
                  })
                  setIfEdit(null)
                }}
              >
                저장
              </button>
            </div>
            <div className="modal-body">
              <textarea
                autoFocus
                rows={8}
                className="mono"
                value={ifEdit.text}
                onChange={(e) => setIfEdit({ ...ifEdit, text: e.target.value })}
              />
              <p className="muted small">
                범위로 적습니다 — 예: <code>gi1/0/1-48, te1/1-4</code>. 비우고 저장하면 이 장비의
                인터페이스가 모두 지워집니다.
              </p>
              <button
                className="btn small"
                type="button"
                onClick={() =>
                  setIfEdit({ ...ifEdit, text: String(modelBy.get(nrm(ifEdit.dev.model))?.interfaces ?? '') })
                }
              >
                모델 기본값 가져오기
              </button>
            </div>
          </div>
        </div>
      )}

      {form !== undefined && (
        <DeviceForm
          editing={form}
          onClose={() => {
            setForm(undefined)
            refresh()
          }}
        />
      )}
    </div>
  )
}

/** 장비 없는 모델 줄의 IP 칸 — 적는 순간 장비가 된다 */
function NewIp({ onAdd }: { onAdd: (ip: string) => void }) {
  const [on, setOn] = useState(false)
  const [v, setV] = useState('')
  if (!on)
    return (
      <span className="dg-newip" onClick={() => setOn(true)} title="IP 를 적으면 장비가 됩니다">
        장비 없음 — IP 적기
      </span>
    )
  return (
    <input
      className="mono dv-cell"
      autoFocus
      value={v}
      placeholder="220.1.13.10"
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        setOn(false)
        if (v.trim()) onAdd(v.trim())
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') {
          setV('')
          setOn(false)
        }
      }}
    />
  )
}
