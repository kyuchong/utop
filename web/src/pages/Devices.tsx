import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, getToken } from '@/api/client'
import DeviceForm, { expandRange } from '@/components/DeviceForm'
import DeviceBulk from '@/components/DeviceBulk'
import LockCell, { useLocks, type Lock } from '@/components/LockCell'
import DeviceCatalog from '@/components/settings/DeviceCatalog'
import './Devices.css'

export interface DeviceIf {
  id?: number
  name: string
  kind?: string | null
  speed?: string | null
  note?: string | null
}

export interface DeviceAccess {
  protocol: string
  host?: string | null
  port?: number | null
  username?: string | null
  password?: string | null
  enable_password?: string | null
  /** SNMP 읽기(RO) community — 비우면 public */
  community?: string | null
  /** 그 밖의 값. SNMP 쓰기(RW) community 가 여기 산다(`community_rw`) */
  params?: Record<string, unknown> | null
  enabled?: boolean
  is_default?: boolean
  last_status?: string | null
  last_error?: string | null
  last_checked_at?: string | null
}

export interface Device {
  id: string
  ip: string
  lab?: string | null
  name?: string | null
  model?: string | null
  /** 카탈로그에서 끌어온 모델군. 장비에 저장하지 않는다 */
  model_group?: string | null
  vendor?: string | null
  device_group?: string | null
  role?: string | null
  /** 기본 접속 방식·포트. 방식마다 다를 때만 access[] 가 덮는다 */
  protocol?: string | null
  port?: number | null
  username?: string | null
  password?: string | null
  /** 공용 enable 비번. 방식마다 다를 때만 device_access 로 덮는다 */
  enable_password?: string | null
  description?: string | null
  status?: string | null
  /** 랙뷰 몫 — 이 장비가 몇 U 짜리인지·소모전력(W). 자리(rack_id·rack_pos)는
      장비 편집이 안 만진다: 랙뷰에서 끌어다 놓는 것으로만 바뀐다 */
  rack_units?: number | null
  power_w?: number | null
  interfaces?: DeviceIf[]
  /** 목록에서만 오는 값 — 인터페이스 줄 대신 개수만 */
  if_count?: number
  access?: DeviceAccess[]
}


async function getJson<T>(path: string): Promise<T> {
  const r = await apiFetch(path)
  if (!r.ok) {
    const b = await r.json().catch(() => ({}))
    throw new Error(b.detail || `불러오지 못했습니다 (${r.status})`)
  }
  return (await r.json()) as T
}


const PROTO_COLS = ['telnet', 'ssh', 'console', 'snmp']
/** 제품군 — 서버의 DEVICE_ROLES 와 같은 벌 */
const DEV_ROLES = ['L2', 'L3', 'OLT', 'ONT', 'CPE', 'HGW', '계측기', '기타'] as const

const accOf = (d: Device, proto: string): DeviceAccess | undefined =>
  (d.access ?? []).find((a) => a.protocol === proto)

/**
 * 접속 방식 한 칸.
 *
 * 등록 안 함 / 등록만 함 / 연결됨 / 실패 를 구분해서 보여준다. 이 넷이
 * 섞이면 "telnet 은 되는데 ssh 가 막힌 장비" 를 목록에서 못 찾는다.
 */
export function ProtoCell({
  access,
  onCheck,
  busy,
}: {
  access?: DeviceAccess
  onCheck: () => void
  busy: boolean
}) {
  if (!access || access.enabled === false) return <span className="muted acc-none">–</span>
  const st = access.last_status
  const cls = st === 'ok' ? 'pass' : st === 'fail' ? 'fail' : 'draft'
  const mark = st === 'ok' ? '●' : st === 'fail' ? '●' : '○'
  const label = busy ? '확인 중' : st === 'ok' ? '연결됨' : st === 'fail' ? '실패' : '미확인'
  return (
    <button
      type="button"
      className={`acc-cell status ${cls}`}
      disabled={busy}
      title={
        `${access.host || ''}${access.host ? ':' : ''}${access.port ?? ''}` +
        (access.last_error ? ' — ' + access.last_error : '') +
        (access.is_default ? ' (기본)' : '') +
        ' · 눌러서 연결 확인'
      }
      onClick={(e) => {
        e.stopPropagation()
        onCheck()
      }}
    >
      {busy ? '⋯' : mark} {label}
      <span className="acc-port-txt">{access.port ?? ''}</span>
    </button>
  )
}

/**
 * 장비 목록.
 *
 * 시험을 시작하기 전에 가장 먼저 여는 화면이다. 그래서 '누가 쓰고 있나'
 * 를 목록에서 바로 본다 — 장비를 눌러 들어가야 알 수 있으면 아무도 안 본다.
 */
interface Props {
  me?: { username?: string; role?: string } | null
}

/**
 * 칸 거르개 — 표 머리를 눌러 그 칸의 값을 **여러 개** 고른다(지시).
 * 값 목록은 다른 거르개가 걸린 뒤의 목록에서 뽑으므로, 고르면 고를수록
 * 남은 것만 보인다(엑셀 표 거르개와 같은 셈).
 */
function ColFilter({
  label,
  opts,
  picked,
  onPick,
}: {
  label: string
  opts: Array<[string, number]>
  picked: string[]
  onPick: (vals: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const list = q.trim()
    ? opts.filter(([v]) => v.toLowerCase().includes(q.trim().toLowerCase()))
    : opts
  const toggle = (v: string) =>
    onPick(picked.includes(v) ? picked.filter((x) => x !== v) : [...picked, v])

  return (
    <span className="dv-cf">
      <button
        type="button"
        className={`dv-cfb${picked.length ? ' on' : ''}`}
        title={picked.length ? `${label}: ${picked.join(', ')}` : `${label} — 눌러서 고릅니다`}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        {label}
        {picked.length > 0 && <em>({picked.length})</em>}
        <i aria-hidden="true">▾</i>
      </button>
      {open && (
        <>
          <span className="dv-cfback" onClick={() => setOpen(false)} />
          <span className="dv-cfpop" onClick={(e) => e.stopPropagation()}>
            <input
              className="dv-cfq"
              value={q}
              placeholder="찾기"
              autoFocus
              onChange={(e) => setQ(e.target.value)}
            />
            <span className="dv-cfrow">
              <button type="button" onClick={() => onPick(list.map(([v]) => v))}>
                모두
              </button>
              <button type="button" onClick={() => onPick([])}>
                해제
              </button>
            </span>
            <span className="dv-cflist">
              {list.map(([v, n]) => (
                <label key={v} className={picked.includes(v) ? 'on' : ''}>
                  <input type="checkbox" checked={picked.includes(v)} onChange={() => toggle(v)} />
                  <span className="ell">{v}</span>
                  <em>{n}</em>
                </label>
              ))}
              {list.length === 0 && <span className="dv-cfnone">값이 없습니다</span>}
            </span>
          </span>
        </>
      )}
    </span>
  )
}

/**
 * 줄에서 바로 고치는 칸.
 *
 * 카탈로그처럼 「그 자리에서 고치기」 는 그대로다. 다만 **누를 때만** 고르개를
 * 만든다 — 92줄 × 고르개 6개를 늘 펴 두면 `<option>` 이 1만 6천 개가 되어
 * 첫 화면이 무거웠다(지적). 평소에는 글자 한 줄이다.
 */
function EditCell({
  value,
  opts,
  cls,
  title,
  onSave,
}: {
  value: string
  /** 있으면 고르개, 없으면 글자칸 */
  opts?: readonly string[]
  cls?: string
  title?: string
  onSave: (v: string) => void
}) {
  const [on, setOn] = useState(false)
  const [v, setV] = useState(value)
  useEffect(() => {
    if (!on) setV(value)
  }, [value, on])
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()

  if (!on) {
    const known = !opts || !value || opts.includes(value)
    return (
      <span
        className={`dv-cell view${known ? '' : ' warn'} ${cls ?? ''}`}
        title={title ?? '누르면 고칩니다'}
        onClick={(e) => {
          stop(e)
          setOn(true)
        }}
        onMouseDown={stop}
      >
        {value || '–'}
        {opts && <i aria-hidden="true">▾</i>}
      </span>
    )
  }

  if (opts) {
    const known = !value || opts.includes(value)
    return (
      <select
        className={`dv-cell${known ? '' : ' warn'} ${cls ?? ''}`}
        value={value}
        autoFocus
        onClick={stop}
        onMouseDown={stop}
        onBlur={() => setOn(false)}
        onChange={(e) => {
          setOn(false)
          if (e.target.value !== value) onSave(e.target.value)
        }}
      >
        <option value="">–</option>
        {!known && <option value={value}>{value} (목록에 없음)</option>}
        {opts.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    )
  }

  return (
    <input
      className={`dv-cell ${cls ?? ''}`}
      value={v}
      autoFocus
      title={title ?? '고치고 Enter — 자리를 떠도 저장됩니다'}
      onClick={stop}
      onMouseDown={stop}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        setOn(false)
        if (v !== value) onSave(v)
      }}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') {
          setV(value)
          setOn(false)
        }
      }}
    />
  )
}

export default function Devices({ me }: Props) {
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  /** 칸별 거르개(여러 개 고르기) — 사업자·벤더·제품군·모델그룹·모델명·LAB */
  const [colF, setColF] = useState<Record<string, string[]>>({})
  /** 보기 꼴 — 트리(기본) · 표(예전 것) */
  const [layout, setLayout] = useState<'tree' | 'table' | 'catalog'>(() => {
    const v = localStorage.getItem('utop.dev.layout')
    return v === 'table' || v === 'catalog' ? v : 'tree'
  })
  const pickLayout = (v: 'tree' | 'table' | 'catalog') => {
    setLayout(v)
    localStorage.setItem('utop.dev.layout', v)
  }
  /** 왼쪽 트리에서 고른 자리 — 벤더 › 제품군 › 모델그룹 */
  const [tv, setTv] = useState('')
  const [tr, setTr] = useState('')
  const [tg, setTg] = useState('')
  /** 가운데 목록에서 고른 장비 · 구역·연결 거르개 */
  const [pick, setPick] = useState('')
  const [fLab, setFLab] = useState('')
  const [fConn, setFConn] = useState('')
  const [form, setForm] = useState<Device | null | undefined>(undefined)
  const [bulk, setBulk] = useState(false)
  const [msg, setMsg] = useState<{ kind: string; text: string }>({ kind: '', text: '' })

  const devQ = useQuery({
    queryKey: ['devices'],
    /* 인터페이스는 **개수만** 받는다(성능) — 목록은 「48」 처럼 수로만 쓰는데
       92대 × 48줄이면 4천 줄이 브라우저로 넘어와 첫 화면이 무거웠다(지적). */
    queryFn: () => getJson<{ devices: Device[] }>('/api/devices2?ifs=0'),
  })
  /** 사업자·모델그룹은 장비가 아니라 카탈로그의 모델이 들고 있다 */
  const catQ = useQuery({
    queryKey: ['device-catalog'],
    queryFn: () =>
      getJson<{ items: Array<{ kind: string; name: string; operator?: string | null; model_group?: string | null }> }>(
        '/api/device-catalog2',
      ),
    staleTime: 60_000,
  })
  const modelMeta = useMemo(() => {
    const m = new Map<string, { op: string; group: string; vendor: string; family: string; ifs: string }>()
    for (const it of catQ.data?.items ?? [])
      if (it.kind === 'model')
        m.set(it.name, {
          op: String(it.operator ?? '').trim(),
          group: String(it.model_group ?? '').trim(),
          vendor: String((it as { vendor?: string | null }).vendor ?? '').trim(),
          family: String((it as { family?: string | null }).family ?? '').trim(),
          ifs: String((it as { interfaces?: string | null }).interfaces ?? '').trim(),
        })
    return m
  }, [catQ.data])
  const catModels = useMemo(
    () => (catQ.data?.items ?? []).filter((x) => x.kind === 'model').map((x) => x.name).sort((a, b) => a.localeCompare(b, 'ko')),
    [catQ.data],
  )
  /** 분류 목록 — 카탈로그가 만든 사업자·벤더·모델그룹·제품군(지시) */
  const catOpts = useMemo(() => {
    const pick = (kind: string) =>
      (catQ.data?.items ?? [])
        .filter((x) => x.kind === kind)
        .map((x) => x.name)
        .sort((a, b) => a.localeCompare(b, 'ko'))
    return {
      operator: pick('operator'),
      vendor: pick('vendor'),
      /* 카탈로그는 모델그룹을 **`group`** 이라는 이름으로 담는다 —
         `model_group` 으로 찾아 늘 비어 「목록에 없음」 이 됐다(지적) */
      model_group: [...pick('group'), ...pick('model_group')],
      family: pick('family'),
    }
  }, [catQ.data])
  const catLabs = useMemo(
    () => (catQ.data?.items ?? []).filter((x) => x.kind === 'lab').map((x) => x.name).sort((a, b) => a.localeCompare(b, 'ko')),
    [catQ.data],
  )

  /**
   * 빠른 등록 줄 — 카탈로그 모델 표와 같은 문법. 모델을 고르면 벤더·
   * 제품군·모델그룹·인터페이스가 카탈로그에서 따라오고, LAB·IP 만 넣고
   * 추가한다. 계정·프로토콜 같은 세부는 줄을 눌러 여는 기존 창 몫이다.
   */
  const [qa, setQa] = useState({ model: '', lab: '', ip: '' })
  const qaMeta = modelMeta.get(qa.model)
  const qaAdd = useMutation({
    mutationFn: async () => {
      const meta = modelMeta.get(qa.model)
      const r = await apiFetch('/api/devices2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: qa.ip.trim(),
          model: qa.model,
          lab: qa.lab || null,
          vendor: meta?.vendor || null,
          role: meta?.family || null,
          interfaces: meta?.ifs ? expandRange(meta.ifs).map((n) => ({ name: n, kind: 'general' })) : [],
        }),
      })
      const b = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error((b as { detail?: string }).detail || `저장 실패 (${r.status})`)
    },
    onSuccess: () => {
      setQa({ model: '', lab: '', ip: '' })
      setMsg({ kind: 'ok', text: '등록했습니다 — 계정·접속은 줄을 눌러 채우세요' })
      void qc.invalidateQueries({ queryKey: ['devices'] })
    },
    onError: (e) => setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) }),
  })
  const lockQ = useLocks()

  /*
   * 계측기는 여기 안 나온다 — 「계측기」 화면이 따로 있다.
   *
   * 두 화면에 같은 장비가 나오면 어느 쪽에서 고쳐야 하는지 매번 생각하게
   * 되고, 「장비 3대」 라는 숫자도 계측기를 세는지 아닌지 알 수 없다.
   * 등록부(device 표)는 같이 쓰되 보이는 자리는 하나여야 한다.
   */
  const devices = (devQ.data?.devices ?? []).filter((d) => d.role !== '계측기')
  const lockBy = useMemo(() => {
    const m = new Map<string, Lock>()
    for (const l of lockQ.data?.locks ?? []) m.set(l.resource_id, l)
    return m
  }, [lockQ.data])

  const roles = useMemo(
    () => [...new Set(devices.map((d) => d.role).filter(Boolean))] as string[],
    [devices],
  )

  /** 한 줄에서 그 칸이 무엇으로 보이나 — 거르개와 표가 **같은 값**을 쓴다 */
  const colVal = useMemo(() => {
    return (d: Device, k: string): string => {
      const m = modelMeta.get(d.model ?? '')
      if (k === 'op') return m?.op || ''
      if (k === 'vendor') return d.vendor || ''
      if (k === 'role') return d.role || ''
      if (k === 'group') return m?.group || ''
      if (k === 'model') return d.model || ''
      if (k === 'lab') return d.lab || ''
      return ''
    }
  }, [modelMeta])

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    return devices.filter((d) => {
      if (roleFilter && d.role !== roleFilter) return false
      for (const [k, vals] of Object.entries(colF)) {
        if (!vals.length) continue
        const v = colVal(d, k) || '(없음)'
        if (!vals.includes(v)) return false
      }
      if (!n) return true
      return [d.ip, d.model, d.vendor, d.lab, d.name, d.device_group]
        .some((v) => (v ?? '').toLowerCase().includes(n))
    })
  }, [devices, q, roleFilter, colF, colVal])

  /** 그 칸에 실제로 있는 값들 — 다른 거르개가 걸린 뒤의 목록에서 뽑는다 */
  const colOpts = useMemo(() => {
    return (k: string) => {
      const pre = devices.filter((d) => {
        if (roleFilter && d.role !== roleFilter) return false
        for (const [k2, vals] of Object.entries(colF)) {
          if (k2 === k || !vals.length) continue
          if (!vals.includes(colVal(d, k2) || '(없음)')) return false
        }
        return true
      })
      const m = new Map<string, number>()
      for (const d of pre) {
        const v = colVal(d, k) || '(없음)'
        m.set(v, (m.get(v) ?? 0) + 1)
      }
      return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ko'))
    }
  }, [devices, roleFilter, colF, colVal])

  /** 줄에서 고친 값을 그대로 저장한다 — 목록이 들고 있는 장비를 통째로 보낸다 */
  const patchDev = async (d: Device, p: Partial<Device>) => {
    try {
      const r = await apiFetch('/api/devices2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...d, ...p }),
      })
      const b = (await r.json().catch(() => ({}))) as { detail?: string }
      if (!r.ok) throw new Error(b.detail || '저장하지 못했습니다')
      void qc.invalidateQueries({ queryKey: ['devices'] })
      setMsg({ kind: 'ok', text: '고쳤습니다' })
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) })
    }
  }

  /** SNMP 의 읽기(RO)·쓰기(RW) community — device_access 에 산다 */
  const snmpOf = (d: Device) => (d.access ?? []).find((a) => a.protocol === 'snmp')
  const patchSnmp = async (d: Device, p: { ro?: string; rw?: string }) => {
    const cur = snmpOf(d)
    const prm = { ...((cur?.params as Record<string, unknown>) ?? {}) }
    if (p.rw !== undefined) {
      prm.community_rw = p.rw
      prm.rw = !!p.rw
    }
    const next: DeviceAccess = {
      protocol: 'snmp',
      port: cur?.port ?? 161,
      enabled: true,
      ...cur,
      community: p.ro !== undefined ? p.ro : (cur?.community ?? ''),
      params: prm,
    }
    const rest = (d.access ?? []).filter((a) => a.protocol !== 'snmp')
    await patchDev(d, { access: [...rest, next] })
  }

  /** 사업자·모델그룹은 **모델 카탈로그**가 정본이다 — 고치면 같은 모델 전부에 든다 */
  const patchModel = async (model: string, p: { operator?: string; model_group?: string }) => {
    const nm = String(model || '').trim()
    if (!nm) {
      setMsg({ kind: 'err', text: '모델이 없는 장비입니다 — 모델을 먼저 고르세요' })
      return
    }
    if (
      !window.confirm(
        `이 값은 모델 카탈로그(${nm})가 정본입니다.\n같은 모델을 쓰는 장비 전부에 반영됩니다. 고칠까요?`,
      )
    )
      return
    try {
      /* 카탈로그 저장은 **그 줄을 통째로 덮는다.** 고칠 값만 보내면 나머지
         (사업자·모델그룹·제품군·인터페이스…)가 지워졌다(지적).
         지금 줄을 먼저 펼치고 고칠 값만 덧댄다. */
      const cur = (catQ.data?.items ?? []).find(
        (x) => x.kind === 'model' && String(x.name) === nm,
      )
      const r = await apiFetch('/api/device-catalog2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(cur ?? {}), kind: 'model', name: nm, ...p }),
      })
      if (!r.ok) throw new Error('저장하지 못했습니다')
      void qc.invalidateQueries({ queryKey: ['device-catalog'] })
      void qc.invalidateQueries({ queryKey: ['devices'] })
      setMsg({ kind: 'ok', text: '카탈로그를 고쳤습니다' })
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) })
    }
  }

  const importM = useMutation({
    mutationFn: async () => {
      const r = await apiFetch('/api/devices2/import-legacy', { method: 'POST' })
      const b = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(b.detail || `가져오지 못했습니다 (${r.status})`)
      return b as { imported: number }
    },
    onSuccess: (b) => {
      setMsg({ kind: 'ok', text: `${b.imported}대를 가져왔습니다` })
      void qc.invalidateQueries({ queryKey: ['devices'] })
    },
    onError: (e) => setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) }),
  })



  // 어느 칸을 확인 중인지. 목록 전체가 아니라 그 칸만 '확인 중' 으로 바뀌어야 한다.
  const [checking, setChecking] = useState('')
  const checkM = useMutation({
    mutationFn: async (v: { id: string; protocol: string }) => {
      setChecking(v.id + ':' + v.protocol)
      const r = await apiFetch(
        `/api/devices2/${encodeURIComponent(v.id)}/check?protocol=${v.protocol}`,
        { method: 'POST' },
      )
      const b = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(b.detail || '확인하지 못했습니다')
      return b as { results: Array<{ ok: boolean; error: string }> }
    },
    onSuccess: (b) => {
      const bad = (b.results ?? []).find((x) => !x.ok)
      if (bad) setMsg({ kind: 'err', text: bad.error || '연결하지 못했습니다' })
      else setMsg({ kind: 'ok', text: '연결됨' })
      void qc.invalidateQueries({ queryKey: ['devices'] })
    },
    onError: (e) => setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) }),
    onSettled: () => setChecking(''),
  })

  const err = devQ.error

  return (
    <>
      {form !== undefined && (
        <DeviceForm editing={form} onClose={() => setForm(undefined)} />
      )}
      {bulk && <DeviceBulk onClose={() => setBulk(false)} />}

      <section className="panel dev-panel">
        <div className="panel-title">
          <span className="panel-name">
            장비
            <span className="muted small">
              {shown.length === devices.length
                ? `${devices.length}대`
                : `${shown.length} / ${devices.length}대`}
            </span>
          </span>
          <div className="page-head-actions">
            <button
              className="btn"
              type="button"
              onClick={() => importM.mutate()}
              disabled={importM.isPending}
              title="옛 devices.json 을 가져옵니다 (IP 기준, 여러 번 눌러도 안전)"
            >
              {importM.isPending ? '가져오는 중…' : '기존 장비 가져오기'}
            </button>
            <a
              className="btn"
              href={`/api/devices2/export.csv?token=${encodeURIComponent(getToken())}`}
              download="devices.csv"
              title="지금 목록을 CSV 로 (비밀번호는 빼고 내보냅니다)"
            >
              내보내기
            </a>
            <button className="btn" type="button" onClick={() => setBulk(true)}>
              일괄 등록
            </button>
            <button className="btn primary" type="button" onClick={() => setForm(null)}>
              + 장비 등록
            </button>
          </div>
        </div>

        {msg.text && <div className={`dev-msg ${msg.kind}`}>{msg.text}</div>}
        {err && <div className="load-error">{(err as Error).message}</div>}

        {/* 보기 꼴 고르개 — 트리(주신 화면 꼴) · 표(예전 것) */}
        <div className="dev-lay seg" role="tablist">
          {(
            [
              ['tree', '트리로 보기'],
              ['table', '표로 보기'],
              ['catalog', '모델 관리'],
            ] as const
          ).map(([k, lb]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={layout === k}
              className={`seg-btn${layout === k ? ' on' : ''}`}
              onClick={() => pickLayout(k)}
            >
              {lb}
            </button>
          ))}
        </div>

        {/* 모델(카탈로그)도 이 화면에서 — 설정으로 오가지 않게 합쳤다(지시) */}
        {layout === 'catalog' && <DeviceCatalog />}

        {layout === 'tree' && (() => {
          const nrm = (v?: string | null) => String(v ?? '').trim()
          const grpOf = (d: Device) => modelMeta.get(d.model ?? '')?.group || '(모델그룹 없음)'
          const base = devices.filter((d) => {
            if (fConn) {
              const on = PROTO_COLS.some((p) => accOf(d, p)?.last_status === 'ok')
              const ng = PROTO_COLS.some((p) => accOf(d, p)?.last_status === 'fail')
              if (fConn === 'ok' && !on) return false
              if (fConn === 'fail' && !ng) return false
              if (fConn === 'none' && (on || ng)) return false
            }
            const n = q.trim().toLowerCase()
            if (n && ![d.ip, d.model, d.vendor, d.lab, d.name].some((v) => (v ?? '').toLowerCase().includes(n)))
              return false
            return true
          })
          /* 트리는 **LAB 이 맨 위**다(지시): LAB › 벤더 › 제품군 › 모델그룹 */
          const labOf = (d: Device) => nrm(d.lab) || '(구역 없음)'
          const rows = base.filter(
            (d) =>
              (!fLab || labOf(d) === fLab) &&
              (!tv || nrm(d.vendor) === tv) &&
              (!tr || nrm(d.role) === tr) &&
              (!tg || grpOf(d) === tg),
          )
          const labs = [...new Set(base.map(labOf))].sort((a2, b2) => a2.localeCompare(b2, 'ko'))
          const inLab = (lb: string) => base.filter((d) => labOf(d) === lb)
          const vends = (lb: string) =>
            [...new Set(inLab(lb).map((d) => nrm(d.vendor) || '(벤더 없음)'))].sort()
          const roles2 = (lb: string, v: string) =>
            [
              ...new Set(
                inLab(lb)
                  .filter((d) => nrm(d.vendor) === v)
                  .map((d) => nrm(d.role) || '(제품군 없음)'),
              ),
            ].sort()
          const grps = (lb: string, v: string, r: string) =>
            [
              ...new Set(
                inLab(lb)
                  .filter((d) => nrm(d.vendor) === v && nrm(d.role) === r)
                  .map(grpOf),
              ),
            ].sort()
          const cur = devices.find((d) => d.id === pick) ?? rows[0]
          const dot = (d: Device) => {
            const on = PROTO_COLS.some((p) => accOf(d, p)?.last_status === 'ok')
            const ng = PROTO_COLS.some((p) => accOf(d, p)?.last_status === 'fail')
            return on ? 'ok' : ng ? 'ng' : 'un'
          }
          return (
            <div className="dvt">
              {/* ① 왼쪽 — 벤더 › 제품군 › 모델그룹 */}
              <aside className="dvt-tree">
                <button
                  type="button"
                  className={`dvt-n lv0${!fLab ? ' on' : ''}`}
                  onClick={() => {
                    setFLab('')
                    setTv('')
                    setTr('')
                    setTg('')
                  }}
                >
                  전체 <em>{base.length}</em>
                </button>
                {labs.map((lb) => (
                  <div key={lb}>
                    <button
                      type="button"
                      className={`dvt-n lv1${fLab === lb && !tv ? ' on' : ''}`}
                      onClick={() => {
                        setFLab(fLab === lb ? '' : lb)
                        setTv('')
                        setTr('')
                        setTg('')
                      }}
                    >
                      {lb} <em>{inLab(lb).length}</em>
                    </button>
                    {fLab === lb &&
                      vends(lb).map((v) => (
                        <div key={v}>
                          <button
                            type="button"
                            className={`dvt-n lv2${tv === v && !tr ? ' on' : ''}`}
                            onClick={() => {
                              setTv(tv === v ? '' : v)
                              setTr('')
                              setTg('')
                            }}
                          >
                            {v}{' '}
                            <em>{inLab(lb).filter((d) => nrm(d.vendor) === v).length}</em>
                          </button>
                          {tv === v &&
                            roles2(lb, v).map((r) => (
                              <div key={r}>
                                <button
                                  type="button"
                                  className={`dvt-n lv3${tr === r && !tg ? ' on' : ''}`}
                                  onClick={() => {
                                    setTr(tr === r ? '' : r)
                                    setTg('')
                                  }}
                                >
                                  {r}{' '}
                                  <em>
                                    {
                                      inLab(lb).filter(
                                        (d) => nrm(d.vendor) === v && nrm(d.role) === r,
                                      ).length
                                    }
                                  </em>
                                </button>
                                {tr === r &&
                                  grps(lb, v, r).map((g) => (
                                    <button
                                      key={g}
                                      type="button"
                                      className={`dvt-n lv4${tg === g ? ' on' : ''}`}
                                      onClick={() => setTg(tg === g ? '' : g)}
                                    >
                                      {g}{' '}
                                      <em>
                                        {
                                          inLab(lb).filter(
                                            (d) =>
                                              nrm(d.vendor) === v &&
                                              nrm(d.role) === r &&
                                              grpOf(d) === g,
                                          ).length
                                        }
                                      </em>
                                    </button>
                                  ))}
                              </div>
                            ))}
                        </div>
                      ))}
                  </div>
                ))}
              </aside>

              {/* ② 가운데 — 그 자리의 장비만 */}
              <section className="dvt-list">
                <div className="dvt-f">
                  <input
                    className="dvt-q"
                    placeholder="검색 — 모델 · IP · 구역 · 이름"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                  <select className="cy-v" value={fConn} onChange={(e) => setFConn(e.target.value)}>
                    <option value="">연결 상태: 전체</option>
                    <option value="ok">연결됨</option>
                    <option value="fail">실패</option>
                    <option value="none">미확인</option>
                  </select>
                </div>
                <div className="dvt-rows">
                  {rows.length === 0 ? (
                    <div className="empty">이 자리에 장비가 없습니다.</div>
                  ) : (
                    rows.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        className={`dvt-r${cur?.id === d.id ? ' on' : ''}`}
                        onClick={() => setPick(d.id)}
                      >
                        <i className={`dvt-dot ${dot(d)}`} aria-hidden="true" />
                        <span className="muted small dvt-vd">{d.vendor || '–'}</span>
                        <span className="dvt-rl">{d.role || '–'}</span>
                        <span className="dvt-gp">{modelMeta.get(d.model ?? '')?.group || '–'}</span>
                        <b className="dvt-md ell">{d.model || '(모델 없음)'}</b>
                        <span className="dvt-ip">{d.ip}</span>
                        <span className="dvt-lb muted small">{d.lab || '–'}</span>
                      </button>
                    ))
                  )}
                </div>
                <div className="dvt-foot muted small">
                  {rows.length}대 {rows.length !== devices.length && `· 전체 ${devices.length}`}
                </div>
              </section>

              {/* ③ 오른쪽 — 고른 장비 */}
              <aside className="dvt-det">
                {!cur ? (
                  <div className="empty">가운데에서 장비를 고르세요.</div>
                ) : (
                  <>
                    <div className="dvt-deth">
                      <b>{cur.model || cur.ip}</b>
                      <span className="muted small">
                        {[cur.vendor, cur.role, cur.lab].filter(Boolean).join(' · ')}
                      </span>
                      <span className="sp" />
                      <button className="btn small" type="button" onClick={() => setForm(cur)}>
                        편집 창
                      </button>
                    </div>
                    <div className="dvt-card">
                      <b>기본 정보</b>
                      <div className="dvt-kv">
                        <span>벤더</span>
                        <EditCell
                          value={cur.vendor || ''}
                          opts={catOpts.vendor}
                          onSave={(v) => void patchDev(cur, { vendor: v })}
                        />
                        <span>제품군</span>
                        <EditCell
                          value={cur.role || ''}
                          opts={catOpts.family.length ? catOpts.family : DEV_ROLES}
                          onSave={(v) => void patchDev(cur, { role: v })}
                        />
                        <span>모델명</span>
                        <EditCell
                          value={cur.model || ''}
                          opts={catModels}
                          onSave={(v) => void patchDev(cur, { model: v })}
                        />
                        <span>LAB</span>
                        <EditCell
                          value={cur.lab || ''}
                          opts={catLabs}
                          onSave={(v) => void patchDev(cur, { lab: v })}
                        />
                        <span>IP</span>
                        <EditCell
                          value={cur.ip || ''}
                          cls="dev-name"
                          onSave={(v) => void patchDev(cur, { ip: v.trim() })}
                        />
                      </div>
                    </div>
                    <div className="dvt-card">
                      <b>접속 정보</b>
                      <div className="dvt-acc">
                        {PROTO_COLS.map((p) => (
                          <ProtoCell
                            key={p}
                            access={accOf(cur, p)}
                            busy={checking === cur.id + ':' + p}
                            onCheck={() => checkM.mutate({ id: cur.id, protocol: p })}
                          />
                        ))}
                      </div>
                      <div className="dvt-kv">
                        <span>SNMP RO</span>
                        <EditCell
                          value={String(snmpOf(cur)?.community ?? '')}
                          onSave={(v) => void patchSnmp(cur, { ro: v })}
                        />
                        <span>SNMP RW</span>
                        <EditCell
                          value={String(
                            ((snmpOf(cur)?.params as { community_rw?: string } | null) ?? {})
                              .community_rw ?? '',
                          )}
                          onSave={(v) => void patchSnmp(cur, { rw: v })}
                        />
                      </div>
                    </div>
                    <div className="dvt-card">
                      <b>인터페이스</b>
                      <div className="muted small">
                        {cur.if_count ?? cur.interfaces?.length ?? 0}개 — 자세한 것은 편집 창에서
                        봅니다
                      </div>
                    </div>
                    <div className="dvt-card">
                      <b>사용 현황</b>
                      <LockCell
                        resourceId={cur.id}
                        kind="device"
                        lock={lockBy.get(cur.id) ?? lockBy.get(cur.ip)}
                        me={me?.username}
                        isAdmin={me?.role === '관리자'}
                        onMessage={(kind, text) => setMsg({ kind, text })}
                      />
                    </div>
                  </>
                )}
              </aside>
            </div>
          )
        })()}

        {/* 제품군 탭. 드롭다운은 열어봐야 무엇이 있는지 알 수 있지만
            탭은 제품군 구성과 대수가 한눈에 보인다. */}
        {layout === 'table' && (
        <>
        <div className="dev-tabs">
          <div className="seg" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={roleFilter === ''}
              className={`seg-btn${roleFilter === '' ? ' on' : ''}`}
              onClick={() => setRoleFilter('')}
            >
              전체<span className="cnt">{devices.length}</span>
            </button>
            {roles.map((r) => (
              <button
                key={r}
                type="button"
                role="tab"
                aria-selected={roleFilter === r}
                className={`seg-btn${roleFilter === r ? ' on' : ''}`}
                onClick={() => setRoleFilter(r)}
              >
                {r}
                <span className="cnt">{devices.filter((d) => d.role === r).length}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="dev-filter">
          <input
            placeholder="이름 / IP / 모델 / 제조사 검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {/* 칸 차례는 카탈로그 표와 같다: 사업자 → 벤더 → 제품군 →
            모델그룹 → 모델명 → LAB. 그 뒤가 장비 고유(IP·접속·사용) */}
        <div className="dev-table">
        <div className="dev-row th">
          {[
            ['op', '사업자'],
            ['vendor', '벤더'],
            ['role', '제품군'],
            ['group', '모델그룹'],
            ['model', '모델명'],
            ['lab', 'LAB'],
          ].map(([k, lb]) => (
            <ColFilter
              key={k}
              label={lb ?? ''}
              opts={colOpts(k ?? '')}
              picked={colF[k ?? ''] ?? []}
              onPick={(vals) => setColF((cur) => ({ ...cur, [k ?? '']: vals }))}
            />
          ))}
          <span>IP</span>
          <span>Telnet</span>
          <span>SSH</span>
          <span>Console</span>
          <span>SNMP</span>
          <span>RO</span>
          <span>RW</span>
          <span>인터페이스</span>
          <span>사용 현황</span>
        </div>

        {/* 빠른 등록 줄 — 카탈로그 모델 표와 같은 문법. 표 맨 위가 곧 등록 칸 */}
        <div className="dev-row dev-new">
          <span className="muted ell">{qaMeta?.op || '–'}</span>
          <span className="muted ell">{qaMeta?.vendor || '–'}</span>
          <span className="muted ell">{qaMeta?.family || '–'}</span>
          <span className="muted ell">{qaMeta?.group || '–'}</span>
          <select value={qa.model} onChange={(e) => setQa({ ...qa, model: e.target.value })}>
            <option value="">+ 모델</option>
            {catModels.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <select value={qa.lab} onChange={(e) => setQa({ ...qa, lab: e.target.value })}>
            <option value="">LAB</option>
            {catLabs.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
          <input
            placeholder="IP"
            value={qa.ip}
            onChange={(e) => setQa({ ...qa, ip: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && qa.model && qa.ip.trim()) qaAdd.mutate()
            }}
          />
          <span /><span /><span /><span />
          <span />
          <span />
          <span className="muted">{qaMeta?.ifs ? expandRange(qaMeta.ifs).length : '–'}</span>
          <span>
            <button
              className="btn small primary"
              type="button"
              disabled={!qa.model || !qa.ip.trim() || qaAdd.isPending}
              onClick={() => qaAdd.mutate()}
            >
              추가
            </button>
          </span>
        </div>

        <div className="scroll">
          {devQ.isLoading ? (
            <div className="empty">불러오는 중…</div>
          ) : shown.length === 0 ? (
            <div className="empty">
              {devices.length === 0
                ? '등록된 장비가 없습니다. 「기존 장비 가져오기」로 옛 목록을 옮길 수 있습니다.'
                : '조건에 맞는 장비가 없습니다.'}
            </div>
          ) : (
            shown.map((d) => {
              return (
                <div
                  key={d.id}
                  role="button"
                  tabIndex={0}
                  className="dev-row"
                  onClick={() => setForm(d)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setForm(d)
                  }}
                >
                  <EditCell
                    value={modelMeta.get(d.model ?? '')?.op || ''}
                    opts={catOpts.operator}
                    title="사업자 — 모델 카탈로그가 정본입니다"
                    onSave={(v) => void patchModel(d.model ?? '', { operator: v })}
                  />
                  <EditCell
                    value={d.vendor || ''}
                    opts={catOpts.vendor}
                    title="벤더"
                    onSave={(v) => void patchDev(d, { vendor: v })}
                  />
                  <EditCell
                    value={d.role || ''}
                    opts={catOpts.family.length ? catOpts.family : DEV_ROLES}
                    onSave={(v) => void patchDev(d, { role: v })}
                  />
                  <EditCell
                    value={modelMeta.get(d.model ?? '')?.group || ''}
                    opts={catOpts.model_group}
                    title="모델그룹 — 모델 카탈로그가 정본입니다"
                    onSave={(v) => void patchModel(d.model ?? '', { model_group: v })}
                  />
                  <EditCell
                    value={d.model || ''}
                    opts={catModels}
                    onSave={(v) => void patchDev(d, { model: v })}
                  />
                  <EditCell
                    value={d.lab || ''}
                    opts={catLabs}
                    onSave={(v) => void patchDev(d, { lab: v })}
                  />
                  <EditCell
                    value={d.ip || ''}
                    cls="dev-name"
                    onSave={(v) => void patchDev(d, { ip: v.trim() })}
                  />
                  {PROTO_COLS.map((p) => (
                    <ProtoCell
                      key={p}
                      access={accOf(d, p)}
                      busy={checking === d.id + ':' + p}
                      onCheck={() => checkM.mutate({ id: d.id, protocol: p })}
                    />
                  ))}
                  {/* SNMP 읽기·쓰기 community — 여기서 바로 고친다(지시) */}
                  <EditCell
                    value={String(snmpOf(d)?.community ?? '')}
                    title="SNMP RO Community — 두 번 누르면 고칩니다 (비우면 public)"
                    onSave={(v) => void patchSnmp(d, { ro: v })}
                  />
                  <EditCell
                    value={String(
                      ((snmpOf(d)?.params as { community_rw?: string } | null) ?? {}).community_rw ??
                        '',
                    )}
                    title="SNMP RW Community — 두 번 누르면 고칩니다 (Set 을 쓸 때만)"
                    onSave={(v) => void patchSnmp(d, { rw: v })}
                  />
                  <span className="muted">{d.if_count ?? d.interfaces?.length ?? 0}</span>
                  <span className="dev-lock">
                    <LockCell
                      resourceId={d.id}
                      kind="device"
                      lock={lockBy.get(d.id) ?? lockBy.get(d.ip)}
                      me={me?.username}
                      isAdmin={me?.role === '관리자' || me?.role === 'admin'}
                      onMessage={(k, txt) => setMsg({ kind: k, text: txt })}
                    />
                  </span>
                </div>
              )
            })
          )}
        </div>
        </div>
        </>
        )}
      </section>
    </>
  )
}
