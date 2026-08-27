import { useEffect, useMemo, useRef, useState } from 'react'
import { apiFetch } from '@/api/client'
import './JiraFields.css'

/**
 * 이 프로젝트·이슈유형이 **실제로 요구하는 칸**을 Jira 에게 물어 그린다.
 *
 * 칸을 화면에 박아 두면 프로젝트마다 다른 것을 못 담는다 — 어떤 곳은
 * 사업자·이슈분류가 필수고, 어떤 곳은 시험시설·발생빈도를 본다. 그래서
 * createmeta 가 주는 대로 그린다.
 *
 * 필수는 위로 올린다. 아래에 묻혀 있으면 「왜 등록이 안 되나」 를 스물두 칸
 * 훑어 가며 찾아야 한다.
 */
export interface JiraField {
  id: string
  name?: string
  required?: boolean
  type?: string
  items?: string
  custom?: string
  options?: Array<{ id?: string; name?: string }> | null
}

/** Jira 가 만들어 주는 값이거나 우리가 따로 다루는 칸 — 여기서는 안 그린다 */
const SKIP = new Set([
  'project',
  'issuetype',
  'summary',
  'description',
  'attachment',
  'issuelinks',
  'labels',
])

export type JiraFieldValues = Record<string, unknown>

export default function JiraFields({
  project,
  issuetype,
  value,
  onChange,
  onLoaded,
  disabled,
}: {
  project: string
  issuetype: string
  value: JiraFieldValues
  onChange: (v: JiraFieldValues) => void
  /** 어떤 칸이 왔는지 바깥에 알린다 — 올릴 때 필수를 짚어야 한다 */
  onLoaded?: (f: JiraField[]) => void
  disabled?: boolean
}) {
  const [fields, setFields] = useState<JiraField[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!project || !issuetype) {
      setFields([])
      return
    }
    let dead = false
    setBusy(true)
    setErr('')
    void (async () => {
      try {
        const r = await apiFetch(
          `/api/jira/createmeta?project=${encodeURIComponent(project)}&issuetype=${encodeURIComponent(issuetype)}`,
        )
        const j = (await r.json()) as { ok?: boolean; fields?: JiraField[]; error?: string }
        if (dead) return
        if (!j.ok) {
          setErr(j.error || '칸을 못 읽었습니다')
          setFields([])
        } else {
          const fs = (j.fields ?? []).filter((f) => !SKIP.has(f.id))
          /* 필수를 위로 — 아래에 묻히면 왜 등록이 안 되는지 스물두 칸을
             훑어야 한다 */
          fs.sort((a, b) => (b.required ? 1 : 0) - (a.required ? 1 : 0))
          setFields(fs)
          onLoaded?.(fs)
        }
      } catch (e) {
        if (!dead) setErr(String((e as Error).message))
      } finally {
        if (!dead) setBusy(false)
      }
    })()
    return () => {
      dead = true
    }
  }, [project, issuetype, onLoaded])

  const set = (id: string, v: unknown) => onChange({ ...value, [id]: v })

  if (!project || !issuetype) return null
  if (busy) return <div className="jf-note">Jira 칸 불러오는 중…</div>
  if (err) return <div className="jf-note bad">칸을 못 읽었습니다 — {err}</div>
  if (!fields.length) return null

  return (
    <div className="jf">
      <div className="jf-h">
        Jira 필드 ({fields.length}개)
        <span className="jf-req">· * 필수</span>
      </div>
      {fields.map((f) => (
        <One key={f.id} f={f} v={value[f.id]} set={set} disabled={disabled} project={project} />
      ))}
    </div>
  )
}

function One({
  f,
  v,
  set,
  disabled,
  project,
}: {
  f: JiraField
  v: unknown
  set: (id: string, v: unknown) => void
  disabled?: boolean
  project: string
}) {
  const label = (
    <div className={`jf-lb${f.required ? ' req' : ''}`}>
      {f.name || f.id}
      {f.required ? ' *' : ''}
    </div>
  )
  const isArr = f.type === 'array'
  const opts = f.options ?? []

  /* 담당자 — 이름·메일·ID 로 찾는다. Jira 아이디를 외우고 있는 사람은 없다 */
  if (f.type === 'user') {
    return (
      <div className="jf-f">
        {label}
        <UserPick project={project} v={String(v ?? '')} onPick={(x) => set(f.id, x)} disabled={disabled} />
      </div>
    )
  }
  if (opts.length) {
    if (isArr) {
      const arr = Array.isArray(v) ? (v as string[]) : []
      return (
        <div className="jf-f">
          {label}
          <select
            multiple
            size={Math.min(6, Math.max(3, opts.length))}
            value={arr}
            disabled={disabled}
            onChange={(e) =>
              set(f.id, Array.from(e.target.selectedOptions).map((o) => o.value).filter(Boolean))
            }
          >
            {opts.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <div className="jf-hint">Ctrl/Shift로 여러 개</div>
        </div>
      )
    }
    return (
      <div className="jf-f">
        {label}
        <select value={String(v ?? '')} disabled={disabled} onChange={(e) => set(f.id, e.target.value)}>
          <option value="">(선택)</option>
          {opts.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>
    )
  }
  if (f.type === 'date' || f.items === 'date') {
    return (
      <div className="jf-f">
        {label}
        <input type="date" value={String(v ?? '')} disabled={disabled} onChange={(e) => set(f.id, e.target.value)} />
      </div>
    )
  }
  if (f.custom && /textarea/.test(f.custom)) {
    return (
      <div className="jf-f">
        {label}
        <textarea rows={3} value={String(v ?? '')} disabled={disabled} onChange={(e) => set(f.id, e.target.value)} />
      </div>
    )
  }
  return (
    <div className="jf-f">
      {label}
      <input value={String(v ?? '')} disabled={disabled} onChange={(e) => set(f.id, e.target.value)} />
    </div>
  )
}

/** 담당자 고르기 — 이름·메일·ID 어느 쪽으로도 찾는다 */
function UserPick({
  project,
  v,
  onPick,
  disabled,
}: {
  project: string
  v: string
  onPick: (name: string) => void
  disabled?: boolean
}) {
  const [q, setQ] = useState(v)
  const [open, setOpen] = useState(false)
  const [users, setUsers] = useState<Array<{ name: string; displayName?: string; email?: string }>>([])
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => setQ(v), [v])
  useEffect(() => {
    if (!open || users.length) return
    void (async () => {
      try {
        const r = await apiFetch(`/api/jira/user-search?project=${encodeURIComponent(project)}&limit=200`)
        const j = (await r.json()) as { users?: Array<{ name: string; displayName?: string; email?: string }> }
        setUsers(j.users ?? [])
      } catch {
        /* 못 읽으면 손으로 적는다 */
      }
    })()
  }, [open, project, users.length])
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', down)
    return () => window.removeEventListener('mousedown', down)
  }, [open])

  const list = useMemo(() => {
    const n = q.trim().toLowerCase()
    if (!n) return users.slice(0, 200)
    return users
      .filter((u) =>
        [u.displayName, u.email, u.name].some((x) => String(x ?? '').toLowerCase().includes(n)),
      )
      .slice(0, 200)
  }, [users, q])

  return (
    <div className="jf-user" ref={box}>
      <input
        value={q}
        disabled={disabled}
        placeholder="이름·메일·ID 로 찾기 — 비우면 Jira 가 정합니다"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        onBlur={() => onPick(q.trim())}
      />
      {open && (
        <div className="jf-dd">
          <button type="button" className="jf-dditem" onMouseDown={() => { onPick(''); setQ(''); setOpen(false) }}>
            <span className="jf-av none">?</span>
            자동 (Jira 가 정함)
          </button>
          {list.map((u) => (
            <button
              key={u.name}
              type="button"
              className={`jf-dditem${u.name === v ? ' on' : ''}`}
              onMouseDown={() => {
                onPick(u.name)
                setQ(u.name)
                setOpen(false)
              }}
            >
              <span className="jf-av">{(u.displayName || u.name || '?').charAt(0)}</span>
              <b>{u.displayName || u.name}</b>
              {u.email && <span className="muted small">{u.email}</span>}
              <span className="muted small">({u.name})</span>
            </button>
          ))}
          {!list.length && <div className="jf-note">찾는 사람이 없습니다</div>}
        </div>
      )}
    </div>
  )
}

/**
 * 화면 값 → **미리보기에 적을 글**.
 *
 * 고르는 칸은 id 로 들고 있어서, 그대로 내면 「10521」 같은 숫자가 보인다.
 * 사람이 고른 것은 이름이므로 이름으로 되돌려 적는다.
 *
 * 값이 없어도 **필수는 남긴다** — 「아직 안 골랐다」 가 미리보기에서 보여야
 * 등록을 눌러 보고서야 알게 되는 일이 없다.
 */
export function toPreviewRows(
  fields: JiraField[],
  value: JiraFieldValues,
): Array<{ label: string; val: string; req: boolean }> {
  const rows: Array<{ label: string; val: string; req: boolean }> = []
  for (const f of fields) {
    const v = value[f.id]
    const nameOf = (id: string) =>
      (f.options ?? []).find((o) => String(o.id) === String(id))?.name ?? String(id)
    let txt = ''
    if (f.options && f.options.length) {
      if (f.type === 'array') txt = (Array.isArray(v) ? v : []).map((x) => nameOf(String(x))).join(', ')
      else if (String(v ?? '')) txt = nameOf(String(v))
    } else txt = String(v ?? '').trim()
    if (txt || f.required) rows.push({ label: f.name || f.id, val: txt || '—', req: !!f.required })
  }
  return rows
}

/**
 * 화면 값 → Jira 가 받는 모양.
 *
 * 고르는 칸은 {id}, 여러 개면 [{id}], 사람은 {name}, 나머지는 글자. 이 모양이
 * 틀리면 Jira 는 「필드가 잘못됐다」 한 줄만 주고 어느 칸인지 말해 주지 않는다.
 */
export function toJiraFields(
  fields: JiraField[],
  value: JiraFieldValues,
): { fields: Record<string, unknown>; missing: string[] } {
  const out: Record<string, unknown> = {}
  const missing: string[] = []
  for (const f of fields) {
    const v = value[f.id]
    let put: unknown
    if (f.options && f.options.length) {
      if (f.type === 'array') {
        const arr = (Array.isArray(v) ? v : []).filter(Boolean)
        if (arr.length) put = arr.map((id) => ({ id }))
      } else if (String(v ?? '')) put = { id: String(v) }
    } else if (f.type === 'user') {
      if (String(v ?? '').trim()) put = { name: String(v).trim() }
    } else if (String(v ?? '').trim()) put = String(v).trim()
    if (put === undefined) {
      if (f.required) missing.push(f.name || f.id)
    } else out[f.id] = put
  }
  return { fields: out, missing }
}
