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
  /** 주소 칸에 적을 것 — 방식마다 다르다 */
  hostLabel?: string
  /** 계측기 전용. 스위치 등록 화면에는 안 나온다 */
  meter?: boolean
}> = [
  { v: 'telnet', label: 'Telnet', port: 23, cli: true, ownHost: false, hint: '' },
  { v: 'ssh', label: 'SSH', port: 22, cli: true, ownHost: false, hint: '' },
  {
    v: 'console',
    label: 'Console',
    port: 7001,
    cli: true,
    ownHost: true,
    hostLabel: '콘솔서버 IP',
    hint: '콘솔서버 주소와 이 장비에 배정된 포트',
  },
  { v: 'snmp', label: 'SNMP', port: 161, cli: false, ownHost: false, hint: '조회 전용' },
  /*
   * 계측기는 Telnet·SSH 로 안 붙는다.
   *
   *  · N2X — 백엔드가 N2X Tcl(`n2xtclsh85`)을 상주 프로세스로 띄우고
   *    stdin/stdout 으로 주고받는다. Tcl 쪽이 Agilent API 로 섀시에 붙는다.
   *    등록할 TCP 포트가 없다
   *  · STC — Spirent REST 서버(기본 8888)에 HTTP 로 말하고 그 서버가
   *    섀시에 붙는다. 이 포트는 REST 서버 포트지 섀시 포트가 아니다
   *
   * 이 둘이 목록에 없어서 계측기를 SSH 로 등록하게 돼 있었다.
   */
  {
    v: 'n2x',
    label: 'N2X (Tcl)',
    port: 0,
    cli: false,
    ownHost: false,
    hint: '백엔드의 N2X Tcl 이 섀시에 붙습니다 — 포트 없음',
    meter: true,
  },
  {
    v: 'stc',
    label: 'STC (REST)',
    port: 8888,
    cli: false,
    ownHost: true,
    hostLabel: 'REST 서버 IP (비우면 이 서버)',
    hint: 'stcweb.exe 가 도는 PC. 비우면 백엔드가 스스로 띄웁니다 — 윈도우일 때만',
    meter: true,
  },
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
    // te6/1~te6/8 처럼 앞자리를 되풀이해 적은 것도 받는다. 기존 자료가
    // 물결로 들어와 있어서 '-' 만 알면 8포트가 1개로 세어진다.
    const m = /^(.*?)(\d+)\s*[-~]\s*(?:\1)?(\d+)$/.exec(s)
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

/**
 * 이미 쓰고 있는 값을 고르게 하는 목록.
 *
 * select 가 아니라 datalist 인 이유: 새 랩·새 제조사를 등록할 때 목록에
 * 없다고 막히면 안 된다. 고를 수도 있고 새로 칠 수도 있어야 한다.
 */
function DL({ id, items }: { id: string; items?: string[] }) {
  return (
    <datalist id={id}>
      {(items ?? []).map((v) => (
        <option key={v} value={v} />
      ))}
    </datalist>
  )
}

/**
 * 고르거나 직접 치거나 — 드롭다운 하나로.
 *
 * datalist 는 브라우저마다(특히 Edge) 목록이 잘 안 떠서 「그냥 입력칸」
 * 처럼 보였다. 제품군처럼 확실한 드롭다운으로 바꾸되, 목록에 없는 값도
 * 넣을 수 있어야 하니 「＋ 직접 입력」 을 끝에 둔다. 그걸 고르면 칸이
 * 입력으로 바뀌고, 「목록」 으로 되돌아간다.
 */
function Combo({
  value,
  items,
  placeholder,
  onChange,
  autoFocus,
}: {
  value: string
  items?: string[]
  placeholder?: string
  onChange: (v: string) => void
  autoFocus?: boolean
}) {
  const list = items ?? []
  // 「직접 입력」 을 눌러 입력 모드로 들어갔나. 값이 목록에 없다고
  // 자동으로 입력 모드가 되지는 않는다 — 목록이 늦게 로딩되는 사이에
  // 저장된 값이 「없는 값」 으로 오해돼 사라지는 일이 있었다.
  const [typing, setTyping] = useState(false)

  if (typing || list.length === 0) {
    return (
      <div className="combo">
        <input
          autoFocus={autoFocus}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
        {list.length > 0 && (
          <button
            type="button"
            className="combo-back"
            title="목록에서 고르기"
            onClick={() => setTyping(false)}
          >
            목록
          </button>
        )}
      </div>
    )
  }
  // 저장된 값이 목록에 없으면(옛 자료·다른 곳에서 친 것) 그 값을 옵션으로
  // 넣어 지킨다. 안 그러면 select 가 (선택) 으로 튕겨 값이 사라진다.
  const extra = value && !list.includes(value) ? [value] : []
  return (
    <select
      value={value}
      onChange={(e) => {
        if (e.target.value === '__type__') {
          setTyping(true)
        } else onChange(e.target.value)
      }}
    >
      <option value="">(선택)</option>
      {extra.map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
      {list.map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
      <option value="__type__">＋ 직접 입력</option>
    </select>
  )
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
      // LAB 이 빠져 있어서 편집을 열면 늘 비어 보였다 — 저장은 돼 있는데
      // 폼이 안 받아서, 저장을 누르면 LAB 이 지워졌다.
      lab: editing?.lab ?? '',
      name: editing?.name ?? '',
      model: editing?.model ?? '',
      vendor: editing?.vendor ?? '',
      device_group: editing?.device_group ?? '',
      role: editing?.role ?? '',
      username: editing?.username ?? '',
      password: editing?.password ?? '',
      enable_password: editing?.enable_password ?? '',
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
      return (await r.json()) as {
        roles: string[]
        labs: string[]
        vendors: string[]
        models: string[]
        usernames: string[]
        model_info: Record<
          string,
          { vendor?: string | null; family?: string | null; interfaces?: string | null }
        >
      }
    },
  })

  const set = <K extends keyof Device>(k: K, v: Device[K]) => setF((c) => ({ ...c, [k]: v }))

  /**
   * 계측기인가 — 역할로만 본다.
   *
   * 이름·모델로 넘겨짚으면 등록하는 도중(아직 모델을 안 고른 때)에 목록이
   * 왔다 갔다 한다. 여기서는 사람이 고른 역할이 곧 답이다.
   */
  const isMeterRole = (f.role ?? '') === '계측기'

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

  /**
   * 카탈로그에 등록된 모델을 고르면 제조사·제품군·기본 인터페이스를 채운다.
   * 같은 모델을 30대 등록할 때 이것이 가장 크게 줄여준다.
   *
   * 이미 적어둔 값은 덮지 않는다 — 카탈로그와 다르게 쓰는 장비가 있다.
   * 인터페이스도 비어 있을 때만 채운다.
   */
  const pickModel = (name: string) => {
    const info = rolesQ.data?.model_info?.[name]
    setF((c) => ({
      ...c,
      model: name,
      vendor: c.vendor || info?.vendor || '',
      role: c.role || info?.family || '',
    }))
    if (info?.interfaces && ifs.length === 0) {
      setIfs(expandRange(info.interfaces).map((n) => ({ name: n, kind: 'general' })))
    }
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

  const body = () => {
    // 역할에 맞는 접속방식만 저장한다. 계측기에 SSH 가 켜진 채로 남으면
    // 다음에 열 때 또 SSH 가 떠서 혼란을 준다.
    const meter = (f.role ?? '') === '계측기'
    const kept = Object.values(acc).filter((a) => {
      const proto = PROTOS.find((p) => p.v === a.protocol)
      return proto ? !!proto.meter === meter : true
    })
    return { ...f, interfaces: ifs, access: kept }
  }

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
  const [probing, setProbing] = useState('')
  const checkM = useMutation({
    mutationFn: async (only?: string) => {
      setProbing(only || 'all')
      const s = await apiFetch('/api/devices2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body()),
      })
      const sb = await s.json().catch(() => ({}))
      if (!s.ok) throw new Error(sb.detail || `저장 실패 (${s.status})`)
      const id = sb.id || f.id || f.ip
      const r = await apiFetch(
        `/api/devices2/${encodeURIComponent(id)}/check${only ? '?protocol=' + only : ''}`,
        { method: 'POST' },
      )
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
    onSettled: () => setProbing(''),
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
        className="modal xwide"
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

          {/* LAB · 제조사 · 제품군 · 모델명 을 한 줄에. 모두 「고르거나
              직접 입력」 하는 드롭다운(Combo) 이라 생김새가 같다. */}
          <div className="frow frow-4">
            <label className="fld">
              <span>LAB</span>
              <Combo
                autoFocus
                value={f.lab ?? ''}
                items={rolesQ.data?.labs}
                placeholder="Lab#1"
                onChange={(v) => set('lab', v)}
              />
            </label>
            <label className="fld">
              <span>제조사</span>
              <Combo
                value={f.vendor ?? ''}
                items={rolesQ.data?.vendors}
                placeholder="유비쿼스"
                onChange={(v) => set('vendor', v)}
              />
            </label>
            <label className="fld">
              <span>제품군</span>
              <Combo
                value={f.role ?? ''}
                items={rolesQ.data?.roles}
                onChange={(v) => set('role', v)}
              />
            </label>
            <label className="fld">
              <span>모델명</span>
              <Combo
                value={f.model ?? ''}
                items={rolesQ.data?.models}
                placeholder="E6100-48X"
                onChange={(v) => pickModel(v)}
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
              <input
                list="user-list"
                value={f.username ?? ''}
                onChange={(e) => set('username', e.target.value)}
              />
              <DL id="user-list" items={rolesQ.data?.usernames} />
            </label>
            <label className="fld">
              <span>비밀번호</span>
              <input
                type="password"
                value={f.password ?? ''}
                onChange={(e) => set('password', e.target.value)}
              />
            </label>
            <label className="fld">
              <span>enable</span>
              <input
                type="password"
                value={f.enable_password ?? ''}
                onChange={(e) => set('enable_password', e.target.value)}
              />
            </label>
          </div>

          {/* ── 접속 방식 ── */}
          <div className="fld wide">
            <div className="fld-head">
              <span>접속 방식</span>
              <span className="muted small">
                켠 것만 등록됩니다. 계정을 비우면 위의 계정을 씁니다
              </span>
            </div>

            <div className="acc-list">
              {/* 계측기에는 계측기용(N2X·STC)만, 스위치에는 스위치용
                  (Telnet·SSH·Console·SNMP)만. 전에는 「켜져 있으면 역할이
                  달라도 보여 준다」 였는데, 계측기에 SSH 가 잘못 켜져 저장된
                  것이 계측기 편집에 SSH 로 떠서 헷갈렸다. 역할에 맞는 것만
                  보이고, 안 맞게 켜진 것은 저장할 때 걸러낸다. */}
              {PROTOS.filter((p) => !!p.meter === isMeterRole).map((p) => {
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
                            // 「콘솔서버 IP」 가 박혀 있어서 STC 를 켜면
                            // 섀시 주소를 적으라는 말인지 알 수 없었다
                            placeholder={p.hostLabel ?? '주소'}
                            value={a.host ?? ''}
                            onChange={(e) => setAccField(p.v, 'host', e.target.value)}
                          />
                        )}
                        {/* N2X 는 붙을 TCP 포트가 없다 — Tcl 이 알아서 붙는다.
                            빈 칸을 내놓으면 무엇을 적어야 하나 헤매게 된다. */}
                        {p.port > 0 && (
                          <input
                            className="acc-port"
                            type="number"
                            placeholder={String(p.port)}
                            value={a.port ?? p.port}
                            onChange={(e) => setAccField(p.v, 'port', Number(e.target.value))}
                          />
                        )}
                        {p.v === 'snmp' && (
                          <input
                            placeholder="community (public)"
                            value={a.community ?? ''}
                            onChange={(e) => setAccField(p.v, 'community', e.target.value)}
                          />
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
                        {/* 계정은 보통 telnet/ssh 가 같은 것을 쓴다. 위의 공용 계정을
                            그대로 쓰고, 이 방식만 다를 때에만 펼쳐서 덮는다. */}
                        {p.cli && (
                          <label className="acc-def">
                            <input
                              type="checkbox"
                              checked={!!a.username || !!a.password || !!a.enable_password}
                              onChange={(e) => {
                                if (e.target.checked) setAccField(p.v, 'username', ' ')
                                else
                                  setAcc((c) => ({
                                    ...c,
                                    [p.v]: {
                                      ...(c[p.v] ?? { protocol: p.v }),
                                      username: '',
                                      password: '',
                                      enable_password: '',
                                    } as DeviceAccess,
                                  }))
                              }}
                            />
                            계정 다름
                          </label>
                        )}
                        {p.cli && (!!a.username || !!a.password || !!a.enable_password) && (
                          <>
                            <input
                              placeholder="계정"
                              value={(a.username ?? '').trim()}
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
                              placeholder="enable"
                              value={a.enable_password ?? ''}
                              onChange={(e) => setAccField(p.v, 'enable_password', e.target.value)}
                            />
                          </>
                        )}
                        <button
                          className="btn small"
                          type="button"
                          disabled={busy}
                          title="저장한 뒤 이 방식으로만 붙어 봅니다"
                          onClick={() => checkM.mutate(p.v)}
                        >
                          {probing === p.v ? '확인 중…' : '확인'}
                        </button>
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
                onClick={() => checkM.mutate(undefined)}
                title="저장한 뒤 각 방식으로 붙어 봅니다"
              >
                {checkM.isPending ? '확인 중…' : '연결 확인'}
              </button>
              <span className="muted small">{probe}</span>
            </div>
          </div>

          {/* ── 인터페이스 ── 계측기는 안 보인다.
              계측기 포트는 섀시에서 읽는다(포트 현황). 여기 손으로 적는
              것은 스위치 포트(gi1/0/1…)라 계측기에는 쓸모가 없다. */}
          {!isMeterRole && (
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
          )}
        </div>

        <div className="modal-foot">
          <span>
            {!isNew && (
              <button
                className="btn danger"
                type="button"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`'${f.model || f.ip}' 을 삭제합니다. 계속할까요?`))
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
