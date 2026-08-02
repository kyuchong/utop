import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import type { Device, DeviceAccess, DeviceIf } from '@/pages/Devices'
import './ReqForm.css'

interface Props {
  /** null 이면 새 장비, 값이 있으면 그 장비 편집 */
  editing: Device | null
  onClose: () => void
}

/**
 * 인터페이스 종류.
 *
 * 스위치는 48포트가 전부 같은 포트라 업링크/가입자 구분이 없다. 어느 포트를
 * 업링크로 쓸지는 그 시험에서 어떻게 물리느냐의 문제이지 장비의 성질이 아니다.
 * 그래서 '일반' 이 기본값이다 — 여기서는 '어떤 포트가 있는가' 만 적고,
 * 역할은 시험 구성도에서 정한다. OLT 처럼 하드웨어로 갈리는 장비만 지정한다.
 */
const IF_KINDS = [
  { v: 'general', label: '일반' },
  { v: 'subscriber', label: '가입자' },
  { v: 'uplink', label: '업링크' },
  { v: 'mgmt', label: '관리' },
]

/**
 * 접속 방식.
 *
 * 한 장비에 telnet 과 ssh 가 함께 열려 있는 것이 보통이고, TC 스텝마다 어느
 * 쪽으로 붙을지 고른다. console 은 장비가 아니라 터미널 서버로 가므로 주소를
 * 따로 받는다(콘솔서버 IP 의 7001 같은 포트). snmp 는 조회 전용이라 명령을
 * 실행하지 못한다 — 기본 접속으로 고를 수 없다.
 */
const PROTOS: Array<{
  v: string
  label: string
  port: number
  cli: boolean
  ownHost: boolean
  hint: string
}> = [
  { v: 'telnet', label: 'Telnet', port: 23, cli: true, ownHost: false, hint: '' },
  { v: 'ssh', label: 'SSH', port: 22, cli: true, ownHost: false, hint: '' },
  {
    v: 'console',
    label: 'Console',
    port: 7001,
    cli: true,
    ownHost: true,
    hint: '콘솔서버 주소와 이 장비에 배정된 포트',
  },
  { v: 'snmp', label: 'SNMP', port: 161, cli: false, ownHost: false, hint: '조회 전용' },
]

/**
 * gi1/0/1-48 처럼 범위로 적은 것을 펼친다.
 * 48포트를 한 줄씩 치게 만들면 아무도 인터페이스를 채우지 않는다.
 */
export function expandRange(text: string): string[] {
  const out: string[] = []
  for (const raw of text.split(/[,\n]/)) {
    const s = raw.trim()
    if (!s) continue
    const m = /^(.*?)(\d+)\s*-\s*(\d+)$/.exec(s)
    if (!m) {
      out.push(s)
      continue
    }
    const [, prefix, a, b] = m
    const from = Number(a)
    const to = Number(b)
    if (!Number.isFinite(from) || !Number.isFinite(to) || to < from || to - from > 512) {
      out.push(s)
      continue
    }
    for (let i = from; i <= to; i++) out.push(`${prefix}${i}`)
  }
  return out
}

export default function DeviceForm({ editing, onClose }: Props) {
  const qc = useQueryClient()
  const isNew = editing === null

  const [f, setF] = useState<Device>({
    id: '',
    ip: '',
    name: '',
    model: '',
    vendor: '',
    device_group: '',
    role: '',
    username: '',
    password: '',
    description: '',
  })
  const [ifs, setIfs] = useState<DeviceIf[]>([])
  const [acc, setAcc] = useState<Record<string, DeviceAccess>>({})
  const [bulk, setBulk] = useState('')
  const [bulkKind, setBulkKind] = useState('general')
  const [error, setError] = useState('')
  const [probe, setProbe] = useState('')

  useEffect(() => {
    setF({
      id: editing?.id ?? '',
      ip: editing?.ip ?? '',
      name: editing?.name ?? '',
      model: editing?.model ?? '',
      vendor: editing?.vendor ?? '',
      device_group: editing?.device_group ?? '',
      role: editing?.role ?? '',
      username: editing?.username ?? '',
      password: editing?.password ?? '',
      description: editing?.description ?? '',
    })
    setIfs(editing?.interfaces ?? [])
    const m: Record<string, DeviceAccess> = {}
    for (const a of editing?.access ?? []) m[a.protocol] = { ...a }
    setAcc(m)
    setError('')
    setProbe('')
  }, [editing])

  const rolesQ = useQuery({
    queryKey: ['device-roles'],
    queryFn: async () => {
      const r = await apiFetch('/api/device-roles')
      return (await r.json()) as { roles: string[]; labs: string[] }
    },
  })

  const set = <K extends keyof Device>(k: K, v: Device[K]) => setF((c) => ({ ...c, [k]: v }))

  const setAccField = (proto: string, k: keyof DeviceAccess, v: unknown) =>
    setAcc((c) => ({ ...c, [proto]: { ...(c[proto] ?? { protocol: proto }), [k]: v } as DeviceAccess }))

  const toggleProto = (p: (typeof PROTOS)[number], on: boolean) => {
    setAcc((c) => {
      const next = { ...c }
      if (on) {
        // 껐다 켜도 예전에 적어둔 포트·계정은 살린다
        next[p.v] = { protocol: p.v, port: p.port, ...(c[p.v] ?? {}), enabled: true }
      } else {
        delete next[p.v]
      }
      return next
    })
  }

  const addBulk = () => {
    const names = expandRange(bulk)
    if (names.length === 0) return
    const have = new Set(ifs.map((i) => i.name))
    setIfs([
      ...ifs,
      ...names.filter((n) => !have.has(n)).map((name) => ({ name, kind: bulkKind })),
    ])
    setBulk('')
  }

  const body = () => ({ ...f, interfaces: ifs, access: Object.values(acc) })

  const saveM = useMutation({
    mutationFn: async () => {
      const r = await apiFetch('/api/devices2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body()),
      })
      const b = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(b.detail || `저장 실패 (${r.status})`)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['devices'] })
      onClose()
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  })

  const removeM = useMutation({
    mutationFn: async () => {
      const r = await apiFetch(`/api/devices2/${encodeURIComponent(f.id || f.ip)}`, {
        method: 'DELETE',
      })
      if (!r.ok) {
        const b = await r.json().catch(() => ({}))
        throw new Error(b.detail || `삭제 실패 (${r.status})`)
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['devices'] })
      onClose()
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  })

  /**
   * 연결 확인은 저장부터 한다. 서버는 저장된 장비를 보고 붙기 때문에,
   * 방금 고친 포트가 아니라 예전 포트를 확인하면 "고쳤는데 왜 안 되냐" 가 된다.
   */
  const checkM = useMutation({
    mutationFn: async () => {
      const s = await apiFetch('/api/devices2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body()),
      })
      const sb = await s.json().catch(() => ({}))
      if (!s.ok) throw new Error(sb.detail || `저장 실패 (${s.status})`)
      const id = sb.id || f.id || f.ip
      const r = await apiFetch(`/api/devices2/${encodeURIComponent(id)}/check`, { method: 'POST' })
      const b = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(b.detail || `확인 실패 (${r.status})`)
      return b as { results: Array<{ protocol: string; ok: boolean; error: string }> }
    },
    onSuccess: (b) => {
      setProbe(
        (b.results ?? [])
          .map((x) => `${x.protocol.toUpperCase()} ${x.ok ? '연결됨' : `실패(${x.error})`}`)
          .join(' · ') || '확인할 접속 방식이 없습니다',
      )
      void qc.invalidateQueries({ queryKey: ['devices'] })
    },
    onError: (e) => setProbe(e instanceof Error ? e.message : String(e)),
  })

  const submit = () => {
    if (!f.ip.trim()) {
      setError('IP 를 입력하세요')
      return
    }
    saveM.mutate()
  }

  const busy = saveM.isPending || removeM.isPending || checkM.isPending

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div
        className="modal wide"
        role="dialog"
        aria-modal="true"
        aria-label={isNew ? '장비 등록' : '장비 편집'}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <b>{isNew ? '장비 등록' : '장비 편집'}</b>
          <button className="modal-x" type="button" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="form-error">{error}</div>}

          <div className="frow">
            <label className="fld">
              <span>LAB</span>
              <input
                autoFocus
                list="lab-list"
                value={f.lab ?? ''}
                placeholder="Lab#1"
                onChange={(e) => set('lab', e.target.value)}
              />
              {/* 이미 쓰던 랩 이름을 골라 쓰게 한다. 손으로 치면
                  'Lab#1' 과 'lab1' 이 갈려 같은 랩이 둘로 보인다. */}
              <datalist id="lab-list">
                {(rolesQ.data?.labs ?? []).map((l) => (
                  <option key={l} value={l} />
                ))}
              </datalist>
            </label>
            <label className="fld">
              <span>이름</span>
              <input
                value={f.name ?? ''}
                placeholder="E6100 #1"
                onChange={(e) => set('name', e.target.value)}
              />
            </label>
            <label className="fld">
              <span>제품군</span>
              <select value={f.role ?? ''} onChange={(e) => set('role', e.target.value)}>
                <option value="">(선택)</option>
                {(rolesQ.data?.roles ?? []).map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="frow">
            <label className="fld">
              <span>모델</span>
              <input
                value={f.model ?? ''}
                placeholder="E6100-48X"
                onChange={(e) => set('model', e.target.value)}
              />
            </label>
            <label className="fld">
              <span>제조사</span>
              <input
                value={f.vendor ?? ''}
                placeholder="유비쿼스"
                onChange={(e) => set('vendor', e.target.value)}
              />
            </label>
          </div>

          <div className="frow">
            <label className="fld">
              <span>IP</span>
              <input
                value={f.ip}
                placeholder="10.1.1.21"
                onChange={(e) => set('ip', e.target.value)}
              />
            </label>
            <label className="fld">
              <span>계정</span>
              <input value={f.username ?? ''} onChange={(e) => set('username', e.target.value)} />
            </label>
            <label className="fld">
              <span>비밀번호</span>
              <input
                type="password"
                value={f.password ?? ''}
                onChange={(e) => set('password', e.target.value)}
              />
            </label>
          </div>

          <label className="fld">
            <span>설명</span>
            <input
              value={f.description ?? ''}
              onChange={(e) => set('description', e.target.value)}
            />
          </label>

          {/* ── 접속 방식 ── */}
          <div className="fld wide">
            <div className="fld-head">
              <span>접속 방식</span>
              <span className="muted small">
                켠 것만 등록됩니다. 계정을 비우면 위의 계정을 씁니다
              </span>
            </div>

            <div className="acc-list">
              {PROTOS.map((p) => {
                const on = !!acc[p.v]
                const a = acc[p.v] ?? ({ protocol: p.v } as DeviceAccess)
                return (
                  <div className={`acc-row${on ? ' on' : ''}`} key={p.v}>
                    <label className="acc-name">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) => toggleProto(p, e.target.checked)}
                      />
                      <b>{p.label}</b>
                      {a.last_status && (
                        <span className={`status ${a.last_status === 'ok' ? 'pass' : 'fail'}`}>
                          {a.last_status === 'ok' ? '연결됨' : '실패'}
                        </span>
                      )}
                    </label>

                    {on && (
                      <div className="acc-fields">
                        {p.ownHost && (
                          <input
                            className="acc-host"
                            placeholder="콘솔서버 IP"
                            value={a.host ?? ''}
                            onChange={(e) => setAccField(p.v, 'host', e.target.value)}
                          />
                        )}
                        <input
                          className="acc-port"
                          type="number"
                          placeholder={String(p.port)}
                          value={a.port ?? p.port}
                          onChange={(e) => setAccField(p.v, 'port', Number(e.target.value))}
                        />
                        {p.v === 'snmp' ? (
                          <input
                            placeholder="community (public)"
                            value={a.community ?? ''}
                            onChange={(e) => setAccField(p.v, 'community', e.target.value)}
                          />
                        ) : (
                          <>
                            <input
                              placeholder="계정 (비우면 위와 같음)"
                              value={a.username ?? ''}
                              onChange={(e) => setAccField(p.v, 'username', e.target.value)}
                            />
                            <input
                              type="password"
                              placeholder="비밀번호"
                              value={a.password ?? ''}
                              onChange={(e) => setAccField(p.v, 'password', e.target.value)}
                            />
                            <input
                              type="password"
                              placeholder="enable 비번"
                              value={a.enable_password ?? ''}
                              onChange={(e) => setAccField(p.v, 'enable_password', e.target.value)}
                            />
                          </>
                        )}
                        {p.cli && (
                          <label className="acc-def" title="스텝이 방식을 안 적었을 때 쓰는 접속">
                            <input
                              type="radio"
                              name="acc-default"
                              checked={!!a.is_default}
                              onChange={() =>
                                setAcc((c) => {
                                  const n: Record<string, DeviceAccess> = {}
                                  for (const [k, v] of Object.entries(c))
                                    n[k] = { ...v, is_default: k === p.v }
                                  return n
                                })
                              }
                            />
                            기본
                          </label>
                        )}
                        {p.hint && <span className="muted small">{p.hint}</span>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="acc-probe">
              <button
                className="btn"
                type="button"
                disabled={busy}
                onClick={() => checkM.mutate()}
                title="저장한 뒤 각 방식으로 붙어 봅니다"
              >
                {checkM.isPending ? '확인 중…' : '연결 확인'}
              </button>
              <span className="muted small">{probe}</span>
            </div>
          </div>

          {/* ── 인터페이스 ── */}
          <div className="fld wide">
            <div className="fld-head">
              <span>인터페이스 {ifs.length > 0 && `(${ifs.length})`}</span>
              <span className="muted small">
                토폴로지와 자연어 생성이 이 목록에서 포트를 고릅니다
              </span>
            </div>

            <div className="if-add">
              <input
                value={bulk}
                placeholder="gi1/0/1-48  또는  te1/1, te1/2"
                onChange={(e) => setBulk(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addBulk()
                  }
                }}
              />
              <select value={bulkKind} onChange={(e) => setBulkKind(e.target.value)}>
                {IF_KINDS.map((k) => (
                  <option key={k.v} value={k.v}>
                    {k.label}
                  </option>
                ))}
              </select>
              <button className="btn" type="button" onClick={addBulk}>
                추가
              </button>
            </div>

            {ifs.length > 0 && (
              <div className="if-list">
                {ifs.map((it, i) => (
                  <div className="if-row" key={`${it.name}-${i}`}>
                    <span className="if-name">{it.name}</span>
                    <select
                      value={it.kind || 'general'}
                      onChange={(e) =>
                        setIfs(ifs.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)))
                      }
                    >
                      {IF_KINDS.map((k) => (
                        <option key={k.v} value={k.v}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="if-x"
                      onClick={() => setIfs(ifs.filter((_, j) => j !== i))}
                      aria-label={`${it.name} 삭제`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="modal-foot">
          <span>
            {!isNew && (
              <button
                className="btn danger"
                type="button"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`'${f.name || f.ip}' 을 삭제합니다. 계속할까요?`))
                    removeM.mutate()
                }}
              >
                삭제
              </button>
            )}
          </span>
          <span className="page-head-actions">
            <button className="btn" type="button" onClick={onClose} disabled={busy}>
              취소
            </button>
            <button className="btn primary" type="button" onClick={submit} disabled={busy}>
              {busy ? '저장 중…' : '저장'}
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}
