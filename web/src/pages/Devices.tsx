import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, getToken } from '@/api/client'
import DeviceForm from '@/components/DeviceForm'
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
  username?: string | null
  password?: string | null
  /** 공용 enable 비번. 방식마다 다를 때만 device_access 로 덮는다 */
  enable_password?: string | null
  description?: string | null
  status?: string | null
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
  const lockQ = useLocks()

  const devices = devQ.data?.devices ?? []
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

        <div className="dev-row th">
          <span>LAB</span>
          <span>IP</span>
          <span>제조사</span>
          <span>제품군</span>
          <span>모델명</span>
          <span>Telnet</span>
          <span>SSH</span>
          <span>Console</span>
          <span>SNMP</span>
          <span>인터페이스</span>
          <span>사용 현황</span>
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
                  <span className="muted ell">{d.lab || '–'}</span>
                  <b className="dev-name">{d.ip}</b>
                  <span className="muted ell">{d.vendor || '–'}</span>
                  <span>
                    {d.role ? <span className="tag">{d.role}</span> : <span className="muted">–</span>}
                  </span>
                  <span className="muted ell">{d.model || '–'}</span>
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
      </section>
    </>
  )
}
