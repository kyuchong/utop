import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import type { Device, DeviceIf } from '@/pages/Devices'
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
    protocol: 'ssh',
    port: 22,
    username: '',
    password: '',
    description: '',
  })
  const [ifs, setIfs] = useState<DeviceIf[]>([])
  const [bulk, setBulk] = useState('')
  const [bulkKind, setBulkKind] = useState('general')
  const [error, setError] = useState('')

  useEffect(() => {
    setF({
      id: editing?.id ?? '',
      ip: editing?.ip ?? '',
      name: editing?.name ?? '',
      model: editing?.model ?? '',
      vendor: editing?.vendor ?? '',
      device_group: editing?.device_group ?? '',
      role: editing?.role ?? '',
      protocol: editing?.protocol ?? 'ssh',
      port: editing?.port ?? 22,
      username: editing?.username ?? '',
      password: editing?.password ?? '',
      description: editing?.description ?? '',
    })
    setIfs(editing?.interfaces ?? [])
    setError('')
  }, [editing])

  const rolesQ = useQuery({
    queryKey: ['device-roles'],
    queryFn: async () => {
      const r = await apiFetch('/api/device-roles')
      return (await r.json()) as { roles: string[] }
    },
  })

  const set = <K extends keyof Device>(k: K, v: Device[K]) => setF((c) => ({ ...c, [k]: v }))

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

  const saveM = useMutation({
    mutationFn: async () => {
      const r = await apiFetch('/api/devices2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, interfaces: ifs }),
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

  const submit = () => {
    if (!f.ip.trim()) {
      setError('IP 를 입력하세요')
      return
    }
    saveM.mutate()
  }

  const busy = saveM.isPending || removeM.isPending

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
              <span>이름</span>
              <input
                autoFocus
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
              <span>접속</span>
              <select
                value={f.protocol ?? 'ssh'}
                onChange={(e) => {
                  const p = e.target.value
                  set('protocol', p)
                  // 프로토콜을 바꾸면 기본 포트도 따라가야 한다.
                  // 22 에서 telnet 으로 바꿔놓고 접속 실패를 겪는 일이 흔하다.
                  set('port', p === 'telnet' ? 23 : 22)
                }}
              >
                <option value="ssh">SSH</option>
                <option value="telnet">Telnet</option>
              </select>
            </label>
            <label className="fld">
              <span>포트</span>
              <input
                type="number"
                value={f.port ?? 22}
                onChange={(e) => set('port', Number(e.target.value))}
              />
            </label>
          </div>

          <div className="frow">
            <label className="fld">
              <span>계정</span>
              <input
                value={f.username ?? ''}
                onChange={(e) => set('username', e.target.value)}
              />
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
