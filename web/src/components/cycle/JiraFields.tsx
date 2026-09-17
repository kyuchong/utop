import { useEffect, useMemo, useRef, useState } from 'react'
import { apiFetch } from '@/api/client'
import './JiraFields.css'
import { prefGet, prefSet } from '@/lib/prefs'

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

/**
 * 실제로 쓰는 칸만 남긴다(지시).
 *
 * createmeta 는 그 프로젝트가 아는 칸을 **스물두 개** 다 준다 — 시작일·
 * 완료일·OS/BSP/HW/FW 시험버전·영향받는 버전… 결함 하나 올리자고 다 채우는
 * 사람은 없고, 스물두 칸을 스크롤하다 정작 필수를 놓친다.
 *
 * 이름으로 고른다. 열쇠는 customfield_10521 처럼 프로젝트마다 다르지만
 * 이름은 사람이 붙인 것이라 그대로다.
 *
 * **필수는 목록에 없어도 남긴다.** 감췄다가 Jira 가 물리면 왜 안 되는지
 * 화면 어디에도 안 나온다.
 */
const KEEP = new Set([
  '우선순위',
  '사업자',
  '이슈분류',
  '구성요소',
  '이슈단계',
  '문제유형',
  '시험시설',
  '발생빈도',
  '목표버전',
  '대외OPEN',
  /* 아래 셋은 Jira 등록 창에 있는데 여기에만 없었다(지적) — 있는 칸은
     건드리지 않고 빠진 것만 더한다.
     · OS 시험버전(최초) — 어느 판에서 난 문제인지가 첫 물음이다
     · 시작일·완료일(WBSGantt) — 일정 칸 */
  'OS시험버전',
  '시작일',
  '완료일',
])

/**
 * **고를 값에서 빼는 것**(지시).
 *
 * Jira 는 그 프로젝트가 아는 값을 다 주지만, 여기서 결함을 낼 때 고를 일이
 * 없는 값이 섞여 있다. 이름으로 건다 — 값 ID 는 프로젝트마다 다르다.
 */
const DROP_OPT: Record<string, Set<string>> = {
  /* 우선순위 — 「전체」 는 고를 값이 아니다(거르개용) */
  우선순위: new Set(['전체']),
  /* 이슈분류 — PON 갈래는 이 팀이 안 쓴다 */
  이슈분류: new Set(['1G-PON', '10G-PON']),
}
/** 사업자는 **이 열 가지만**(지시) — 그 밖의 값은 목록에 안 세운다 */
const ONLY_OPT: Record<string, string[]> = {
  사업자: ['KT', 'LGU+', 'ENT', 'SO', '공공', '삼성OEM', 'LGHV', '해외(ITUS)', '해외(ADTRAN)', '해외(기타)'],
}

/** 그 칸이 실제로 보여 줄 값 — 빼기·남기기를 한 자리에서 판단한다 */
export function optionsOf(f: JiraField): Array<{ id?: string; name?: string }> {
  const all = f.options ?? []
  const key = keyOfName(f.name || f.id)
  const only = ONLY_OPT[key]
  if (only) {
    const want = new Set(only)
    const kept = all.filter((o) => want.has(String(o.name ?? '')))
    /* 하나도 안 맞으면 거르지 않는다 — 프로젝트마다 이름이 다를 수 있고,
       빈 목록을 주면 아무것도 못 고른다 */
    if (kept.length) return kept
    return all
  }
  const drop = DROP_OPT[key]
  return drop ? all.filter((o) => !drop.has(String(o.name ?? ''))) : all
}
const keyOfName = (v?: string) => String(v ?? '').replace(/\s+/g, '').split('(')[0] ?? ''
export const wanted = (f: JiraField) => !!f.required || KEEP.has(keyOfName(f.name || f.id))

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
          const fs = (j.fields ?? []).filter((f) => !SKIP.has(f.id)).filter(wanted)
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

  /* 어떤 칸을 보일지 — **프로젝트마다 따로** 기억한다(칸 구성이 프로젝트마다
     다르다). 계정을 따라다녀, 자리를 옮겨 앉아도 쓰던 대로 열린다. */
  const [fcOpen, setFcOpen] = useState(false)
  const pkey = `utop.jf.pick.${project}`
  const [pick, setPick] = useState<{ mode: 'all' | 'custom'; on: Set<string> }>(() => {
    try {
      const raw = prefGet(pkey)
      if (!raw) return { mode: 'all', on: new Set<string>() }
      const j = JSON.parse(raw) as { mode?: string; on?: string[] }
      return { mode: j.mode === 'custom' ? 'custom' : 'all', on: new Set(j.on ?? []) }
    } catch {
      return { mode: 'all', on: new Set<string>() }
    }
  })
  /* 프로젝트가 바뀌면 그 프로젝트의 기억으로 갈아 낀다 */
  useEffect(() => {
    try {
      const raw = prefGet(`utop.jf.pick.${project}`)
      const j = raw ? (JSON.parse(raw) as { mode?: string; on?: string[] }) : null
      setPick({ mode: j?.mode === 'custom' ? 'custom' : 'all', on: new Set(j?.on ?? []) })
    } catch {
      setPick({ mode: 'all', on: new Set<string>() })
    }
  }, [project])
  const pickFirst = useRef(true)
  useEffect(() => {
    if (pickFirst.current) {
      pickFirst.current = false
      return
    }
    prefSet(pkey, JSON.stringify({ mode: pick.mode, on: [...pick.on] }))
  }, [pick, pkey])

  if (!project || !issuetype) return null
  if (busy) return <div className="jf-note">Jira 칸 불러오는 중…</div>
  if (err) return <div className="jf-note bad">칸을 못 읽었습니다 — {err}</div>
  if (!fields.length) return null

  /* 보이는 칸만 그린다 — 필수는 늘 보인다(아래 useFieldPick) */
  const shown = fields.filter((f) => f.required || pick.mode === 'all' || pick.on.has(f.id))
  const opt = fields.filter((f) => !f.required)

  return (
    <div className="jf">
      <div className="jf-h">
        Jira 필드 ({shown.length}
        {shown.length !== fields.length ? `/${fields.length}` : ''}개)
        <span className="jf-req">· * 필수</span>
        <span className="sp" />
        {/* **필드 구성**(지시: 목업). Jira 가 주는 칸이 스무 개를 넘는 프로젝트가
            있는데, 늘 적는 것은 그중 몇이다. 필수는 늘 보인다 — 숨겨 두고
            「왜 못 올리지」 를 겪게 할 수는 없다. */}
        {opt.length > 0 && (
          <span className="jf-fc">
            <button
              type="button"
              className="jf-fcb"
              aria-expanded={fcOpen}
              onClick={() => setFcOpen((v) => !v)}
              title="어떤 칸을 보일지 고릅니다 — 필수는 늘 보입니다"
            >
              ⚙ 필드 구성
            </button>
            {fcOpen && (
              <>
                <span className="jf-fcveil" onClick={() => setFcOpen(false)} />
                <span className="jf-fcpop" role="dialog" aria-label="표시할 필드">
                  <span className="jf-fch">
                    <b>표시할 필드</b>
                    <span className="sp" />
                    <span className="jf-seg" role="group">
                      {(['all', 'custom'] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          className={pick.mode === m ? 'on' : ''}
                          aria-pressed={pick.mode === m}
                          onClick={() => setPick({ ...pick, mode: m })}
                        >
                          {m === 'all' ? '모든' : '고른 것만'}
                        </button>
                      ))}
                    </span>
                  </span>
                  <span className="jf-fcl">
                    {opt.map((f) => (
                      <label key={f.id}>
                        <input
                          type="checkbox"
                          checked={pick.mode === 'all' || pick.on.has(f.id)}
                          disabled={pick.mode === 'all'}
                          onChange={(e) => {
                            const on = new Set(pick.on)
                            if (e.target.checked) on.add(f.id)
                            else on.delete(f.id)
                            setPick({ ...pick, on })
                          }}
                        />
                        <span>{f.name || f.id}</span>
                      </label>
                    ))}
                  </span>
                  <span className="jf-fcf">
                    필수 칸은 늘 보입니다. 「고른 것만」 을 고르면 체크한 칸만 보입니다.
                  </span>
                </span>
              </>
            )}
          </span>
        )}
      </div>
      {shown.map((f) => (
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
      {f.required && (
        <span className="jf-star" title="필수">
          *
        </span>
      )}
    </div>
  )
  const isArr = f.type === 'array'
  const opts = optionsOf(f)

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
 * **칸은 하나도 빼지 않는다.** 빈 것을 감췄더니 미리보기에 네 줄만 남아,
 * 무엇을 더 고를 수 있는지 알 수 없었다(지적). 안 고른 칸은 「(선택)」 으로,
 * 안 고른 **필수**는 「—」 로 적고 이름을 붉게 둔다 — 등록을 눌러 보고서야
 * 빠진 것을 알게 되면 늦다.
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
    rows.push({
      label: f.name || f.id,
      val: txt || (f.required ? '—' : '(선택)'),
      req: !!f.required && !txt,
    })
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
