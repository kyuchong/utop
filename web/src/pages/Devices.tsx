import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import DeviceForm from '@/components/DeviceForm'
import './Devices.css'

export interface DeviceIf {
  id?: number
  name: string
  kind?: string | null
  speed?: string | null
  note?: string | null
}

export interface Device {
  id: string
  ip: string
  name?: string | null
  model?: string | null
  vendor?: string | null
  device_group?: string | null
  role?: string | null
  protocol?: string | null
  port?: number | null
  username?: string | null
  password?: string | null
  description?: string | null
  status?: string | null
  interfaces?: DeviceIf[]
}

interface Lock {
  resource_id: string
  locked_by: string
  locked_name?: string | null
  cycle_id?: string | null
  locked_at?: string | null
  stale_sec?: number
}

async function getJson<T>(path: string): Promise<T> {
  const r = await apiFetch(path)
  if (!r.ok) {
    const b = await r.json().catch(() => ({}))
    throw new Error(b.detail || `불러오지 못했습니다 (${r.status})`)
  }
  return (await r.json()) as T
}

function fmt(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * 장비 목록.
 *
 * 시험을 시작하기 전에 가장 먼저 여는 화면이다. 그래서 '누가 쓰고 있나'
 * 를 목록에서 바로 본다 — 장비를 눌러 들어가야 알 수 있으면 아무도 안 본다.
 */
export default function Devices() {
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [form, setForm] = useState<Device | null | undefined>(undefined)
  const [msg, setMsg] = useState<{ kind: string; text: string }>({ kind: '', text: '' })

  const devQ = useQuery({
    queryKey: ['devices'],
    queryFn: () => getJson<{ devices: Device[] }>('/api/devices2'),
  })
  const lockQ = useQuery({
    queryKey: ['locks'],
    queryFn: () => getJson<{ locks: Lock[] }>('/api/locks'),
    // 남이 잡거나 푼 것이 화면에 늦게 반영되면 같은 장비를 두 사람이 잡는다
    refetchInterval: 15_000,
  })

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
      return [d.name, d.ip, d.model, d.vendor, d.device_group]
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

  const releaseM = useMutation({
    mutationFn: async (rid: string) => {
      const r = await apiFetch(`/api/locks/${encodeURIComponent(rid)}`, { method: 'DELETE' })
      const b = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(b.detail || `해제하지 못했습니다 (${r.status})`)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['locks'] }),
    onError: (e) => setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) }),
  })

  const err = devQ.error

  return (
    <>
      {form !== undefined && (
        <DeviceForm editing={form} onClose={() => setForm(undefined)} />
      )}

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
            <button className="btn primary" type="button" onClick={() => setForm(null)}>
              + 장비 등록
            </button>
          </div>
        </div>

        {msg.text && <div className={`dev-msg ${msg.kind}`}>{msg.text}</div>}
        {err && <div className="load-error">{(err as Error).message}</div>}

        <div className="dev-filter">
          <input
            placeholder="이름 / IP / 모델 / 제조사 검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="">전체 제품군</option>
            {roles.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>

        <div className="dev-row th">
          <span>이름</span>
          <span>제품군</span>
          <span>모델 · 제조사</span>
          <span>IP · 접속</span>
          <span>포트</span>
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
              const lock = lockBy.get(d.id) ?? lockBy.get(d.ip)
              const stale = (lock?.stale_sec ?? 0) > 600
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
                  <span className="dev-name">{d.name || d.ip}</span>
                  <span>{d.role ? <span className="tag">{d.role}</span> : <span className="muted small">–</span>}</span>
                  <span className="muted small ell">
                    {d.model || '–'}
                    {d.vendor ? ` · ${d.vendor}` : ''}
                  </span>
                  <span className="muted small">
                    {d.ip}
                    <span className="dev-proto">{(d.protocol || 'ssh').toUpperCase()}</span>
                  </span>
                  <span className="muted small">{d.interfaces?.length ?? 0}</span>
                  <span className="dev-lock">
                    {lock ? (
                      <>
                        <span className={`status ${stale ? 'draft' : 'fail'}`}>
                          ● {lock.locked_name || lock.locked_by}
                        </span>
                        <span className="muted small">
                          {fmt(lock.locked_at)}
                          {lock.cycle_id ? ` · ${lock.cycle_id}` : ''}
                          {stale ? ' · 응답 없음' : ''}
                        </span>
                        <button
                          className="btn danger"
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (
                              window.confirm(
                                `${lock.locked_name || lock.locked_by} 님이 잡고 있습니다.\n` +
                                  '시험 중일 수 있습니다. 해제할까요?',
                              )
                            )
                              releaseM.mutate(lock.resource_id)
                          }}
                        >
                          해제
                        </button>
                      </>
                    ) : (
                      <span className="status pass">○ 사용 가능</span>
                    )}
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
