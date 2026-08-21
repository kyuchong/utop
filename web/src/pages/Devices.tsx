import { useEffect, useState } from 'react'
import DeviceCatalog from '@/components/settings/DeviceCatalog'
import DeviceGrid from '@/components/devices/DeviceGrid'
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
  /** 목록에서만 오는 값 — 인터페이스 줄 대신 개수와 「gi1/0/1-48」 꼴 요약 */
  if_count?: number
  if_brief?: string
  /** 사업자 — 한 모델이 여러 사업자에 걸리므로 **장비**의 값이다 */
  operator?: string | null
  access?: DeviceAccess[]
}


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
export function ColFilter({
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
export function EditCell({
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

/**
 * 장비 화면 — **한 곳에서 다 한다**(지시).
 *
 * 여태 이 화면에 보기 셋(트리·표·분류 관리)이 있었고, 왼쪽 메뉴에 카탈로그가
 * 또 있었다. 넷이 같은 것을 조금씩 다르게 보여 주니 어디서 무엇을 고치는지
 * 알 수 없었고, css 도 넷으로 갈려 높이·알림 사고가 났다.
 *
 * 이제 둘이다.
 *   · **표** — LAB 을 고르면 그 랩의 장비가 한 표에 선다. 등록·수정·삭제가
 *     여기서 끝난다. 「IP 가 없으면 카탈로그, IP 가 붙으면 장비」.
 *   · **분류 트리** — 벤더·제품군·모델그룹을 통째로 손볼 때만 쓴다.
 */
export default function Devices({ me }: Props) {
  const [layout, setLayout] = useState<'table' | 'tree'>(() =>
    localStorage.getItem('utop.dev.layout') === 'tree' ? 'tree' : 'table',
  )
  const pick = (v: 'table' | 'tree') => {
    setLayout(v)
    localStorage.setItem('utop.dev.layout', v)
  }

  return (
    <section className="panel dev-page">
      <div className="dev-lay seg" role="tablist">
        {(
          [
            ['table', '장비 등록 현황'],
            ['tree', '장비 카탈로그'],
          ] as const
        ).map(([k, lb]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={layout === k}
            className={`seg-btn${layout === k ? ' on' : ''}`}
            onClick={() => pick(k)}
          >
            {lb}
          </button>
        ))}
        <span className="sp" />
        <span className="muted small">
          {layout === 'table'
            ? 'LAB 을 고르면 그 랩의 장비가 한 표에 섭니다 — 등록·수정·삭제가 여기서 끝납니다'
            : '벤더 › 제품군 › 모델그룹 › 모델 — 분류를 정리하는 자리입니다'}
        </span>
      </div>
      {layout === 'table' ? <DeviceGrid me={me} /> : <DeviceCatalog me={me} only="tree" />}
    </section>
  )
}
