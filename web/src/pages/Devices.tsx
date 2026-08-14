import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, getToken } from '@/api/client'
import DeviceForm, { expandRange } from '@/components/DeviceForm'
import DeviceBulk from '@/components/DeviceBulk'
import LockCell, { useLocks, type Lock } from '@/components/LockCell'
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
  community?: string | null
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

const accOf = (d: Device, proto: string): DeviceAccess | undefined =>
  (d.access ?? []).find((a) => a.protocol === proto)

/**
 * 접속 방식 한 칸.
 *
 * 등록 안 함 / 등록만 함 / 연결됨 / 실패 를 구분해서 보여준다. 이 넷이
 * 섞이면 "telnet 은 되는데 ssh 가 막힌 장비" 를 목록에서 못 찾는다.
 */
function ProtoCell({
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

export default function Devices({ me }: Props) {
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [form, setForm] = useState<Device | null | undefined>(undefined)
  const [bulk, setBulk] = useState(false)
  const [msg, setMsg] = useState<{ kind: string; text: string }>({ kind: '', text: '' })

  const devQ = useQuery({
    queryKey: ['devices'],
    queryFn: () => getJson<{ devices: Device[] }>('/api/devices2'),
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

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    return devices.filter((d) => {
      if (roleFilter && d.role !== roleFilter) return false
      if (!n) return true
      return [d.ip, d.model, d.vendor, d.lab, d.name, d.device_group]
        .some((v) => (v ?? '').toLowerCase().includes(n))
    })
  }, [devices, q, roleFilter])

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

        {/* 제품군 탭. 드롭다운은 열어봐야 무엇이 있는지 알 수 있지만
            탭은 제품군 구성과 대수가 한눈에 보인다. */}
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
          <span>사업자</span>
          <span>벤더</span>
          <span>제품군</span>
          <span>모델그룹</span>
          <span>모델명</span>
          <span>LAB</span>
          <span>IP</span>
          <span>Telnet</span>
          <span>SSH</span>
          <span>Console</span>
          <span>SNMP</span>
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
                  <span className="muted ell">{modelMeta.get(d.model ?? '')?.op || '–'}</span>
                  <span className="muted ell">{d.vendor || '–'}</span>
                  <span>
                    {d.role ? <span className="tag">{d.role}</span> : <span className="muted">–</span>}
                  </span>
                  <span className="muted ell">{modelMeta.get(d.model ?? '')?.group || '–'}</span>
                  <span className="muted ell">{d.model || '–'}</span>
                  <span className="muted ell">{d.lab || '–'}</span>
                  <b className="dev-name">{d.ip}</b>
                  {PROTO_COLS.map((p) => (
                    <ProtoCell
                      key={p}
                      access={accOf(d, p)}
                      busy={checking === d.id + ':' + p}
                      onCheck={() => checkM.mutate({ id: d.id, protocol: p })}
                    />
                  ))}
                  <span className="muted">{d.interfaces?.length ?? 0}</span>
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
      </section>
    </>
  )
}
