import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import DeviceForm from '@/components/DeviceForm'
import LockCell, { useLocks } from '@/components/LockCell'
import N2xPorts from '@/components/N2xPorts'
import type { Device } from '@/pages/Devices'
import './Devices.css'

async function getJson<T>(path: string): Promise<T> {
  const r = await apiFetch(path)
  if (!r.ok) {
    const b = await r.json().catch(() => ({}))
    throw new Error(b.detail || `불러오지 못했습니다 (${r.status})`)
  }
  return (await r.json()) as T
}

interface Props {
  me?: { username?: string; role?: string } | null
}

/**
 * 계측기 목록.
 *
 * 장비와 같은 등록부(device)를 쓰고 제품군이 '계측기' 인 것만 본다.
 * 나누지 않는 이유: 계측기도 IP 로 붙고, 점유도 같은 문제이며, 무엇보다
 * 시험 중에 "장비는 비었는데 계측기가 잡혀 있다" 를 한 화면에서 알아야 한다.
 */
export default function Instruments({ me }: Props) {
  const [q, setQ] = useState('')
  const [form, setForm] = useState<Device | null | undefined>(undefined)
  const [msg, setMsg] = useState<{ kind: string; text: string }>({ kind: '', text: '' })
  /** N2X 포트 현황을 볼 섀시 IP. 비면 안 봄 */
  const [ports, setPorts] = useState('')

  const devQ = useQuery({
    queryKey: ['devices'],
    queryFn: () => getJson<{ devices: Device[] }>('/api/devices2'),
  })
  const lockQ = useLocks()

  const lockBy = useMemo(() => {
    const m = new Map<string, (typeof locks)[number]>()
    const locks = lockQ.data?.locks ?? []
    for (const l of locks) m.set(l.resource_id, l)
    return m
  }, [lockQ.data])

  const all = (devQ.data?.devices ?? []).filter((d) => d.role === '계측기')
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    if (!n) return all
    return all.filter((d) =>
      [d.ip, d.model, d.vendor, d.lab].some((v) => (v ?? '').toLowerCase().includes(n)),
    )
  }, [all, q])

  const isAdmin = me?.role === '관리자' || me?.role === 'admin'
  const err = devQ.error

  return (
    <>
      {form !== undefined && <DeviceForm editing={form} onClose={() => setForm(undefined)} />}

      <section className="panel dev-panel">
        <div className="panel-title">
          <span className="panel-name">
            계측기
            <span className="muted small">
              {shown.length === all.length ? `${all.length}대` : `${shown.length} / ${all.length}대`}
            </span>
          </span>
          <div className="page-head-actions">
            <button
              className="btn primary"
              type="button"
              onClick={() => setForm({ id: '', ip: '', role: '계측기' } as Device)}
            >
              + 계측기 등록
            </button>
          </div>
        </div>

        {msg.text && <div className={`dev-msg ${msg.kind}`}>{msg.text}</div>}
        {err && <div className="load-error">{(err as Error).message}</div>}

        <div className="dev-filter">
          <input
            placeholder="IP / 모델 / 제조사 / LAB 검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="dev-row inst th">
          <span>LAB</span>
          <span>IP</span>
          <span>제조사</span>
          <span>모델명</span>
          <span>포트</span>
          <span></span>
          <span>사용 현황</span>
        </div>

        <div className="scroll">
          {devQ.isLoading ? (
            <div className="empty">불러오는 중…</div>
          ) : shown.length === 0 ? (
            <div className="empty">
              {all.length === 0
                ? '등록된 계측기가 없습니다. 「+ 계측기 등록」 으로 추가하세요.'
                : '조건에 맞는 계측기가 없습니다.'}
            </div>
          ) : (
            shown.map((d) => {
              const acc = (d.access ?? [])[0]
              return (
                <div
                  key={d.id}
                  role="button"
                  tabIndex={0}
                  className="dev-row inst"
                  onClick={() => setForm(d)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setForm(d)
                  }}
                >
                  <span className="muted ell">{d.lab || '–'}</span>
                  <b className="dev-name">{d.ip}</b>
                  <span className="muted ell">{d.vendor || '–'}</span>
                  <span className="muted ell">{d.model || '–'}</span>
                  <span className="muted">
                    {acc ? `${acc.protocol.toUpperCase()} ${acc.port ?? ''}` : '–'}
                  </span>
                  {/* N2X 는 포트 현황을 여기서 바로 본다 — 빈 포트가 있나,
                      누가 잡고 있나. 시험 걸기 전에 궁금한 것이다. */}
                  {(d.access ?? []).some((a) => a.protocol === 'n2x') ? (
                    <button
                      type="button"
                      className="btn small"
                      onClick={(e) => {
                        e.stopPropagation()
                        setPorts(d.ip)
                      }}
                    >
                      포트 현황
                    </button>
                  ) : (
                    <span />
                  )}
                  <span className="dev-lock">
                    <LockCell
                      resourceId={d.id}
                      kind="instrument"
                      lock={lockBy.get(d.id) ?? lockBy.get(d.ip)}
                      me={me?.username}
                      isAdmin={isAdmin}
                      onMessage={(k, t) => setMsg({ kind: k, text: t })}
                    />
                  </span>
                </div>
              )
            })
          )}
        </div>
      </section>
      {ports && <N2xPorts server={ports} onClose={() => setPorts('')} />}
    </>
  )
}
