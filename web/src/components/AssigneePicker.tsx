import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import './AssigneePicker.css'

/**
 * 담당 고르개 — 온 화면 공용(플랜 표·플랜 항목·러너).
 *
 * 지시: 「조직을 선택하고 클릭클릭으로 담당자 지정」. 왼쪽에 조직,
 * 오른쪽에 그 조직 사람 — **조직 클릭 → 사람 클릭** 두 번이면 끝난다.
 * 맨 위 지름길: 「나에게」 한 번 · 「비움」 한 번. 검색을 치면 조직에
 * 상관없이 온 사람에서 찾는다(이름·조직 다 걸림). ↑↓·Enter 도 된다.
 */

const RECENT_KEY = 'utop.ass.recent'
const RECENT_ORG = '★ 최근'
const readRecent = (): string[] => {
  try {
    return (JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[]).slice(0, 8)
  } catch {
    return []
  }
}
const pushRecent = (name: string) => {
  if (!name) return
  try {
    const v = [name, ...readRecent().filter((x) => x !== name)].slice(0, 8)
    localStorage.setItem(RECENT_KEY, JSON.stringify(v))
  } catch {
    /* 사생활 보호 모드 */
  }
}

export default function AssigneePicker({
  at,
  value,
  me,
  onPick,
  onClose,
}: {
  /** 여는 자리(fixed) — 고르개가 스스로 화면 안으로 되민다 */
  at: { x: number; y: number }
  /** 지금 담당 — 목록에서 ✓ 로 표시, 그 사람의 조직이 먼저 열린다 */
  value?: string
  /** 내 이름 — 「나에게」 지름길 */
  me?: string
  /** '' = 비움 */
  onPick: (name: string) => void
  onClose: () => void
}) {
  const q = useQuery({
    queryKey: ['user-names'],
    queryFn: async () => {
      const r = await apiFetch('/api/user-names')
      return (await r.json()) as { names?: Array<{ name: string; org: string }> }
    },
    staleTime: 60_000,
  })
  const [txt, setTxt] = useState('')
  const [org, setOrg] = useState<string | null>(null)
  const [act, setAct] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  /* 조직 → 사람들. 조직 없는 계정(봇·공용)은 「기타」 로 맨 아래 */
  const orgs = useMemo(() => {
    const raw = q.data?.names ?? []
    const g = new Map<string, string[]>()
    for (const u of raw) {
      const k = u.org || '기타'
      g.set(k, [...(g.get(k) ?? []), u.name])
    }
    const out = [...g.entries()].sort((a, b) => {
      if (a[0] === '기타') return 1
      if (b[0] === '기타') return -1
      return a[0].localeCompare(b[0], 'ko')
    })
    const rec = readRecent().filter((n) => raw.some((u) => u.name === n))
    if (rec.length) out.unshift([RECENT_ORG, rec])
    return out
  }, [q.data])

  /* 처음 열 조직 — 지금 담당의 조직 > 내 조직 > 첫 조직(최근 있으면 최근) */
  useEffect(() => {
    if (org !== null || orgs.length === 0) return
    const raw = q.data?.names ?? []
    const orgOf = (n?: string) => raw.find((u) => u.name === n)?.org || undefined
    setOrg(orgOf(value) ?? (orgs[0]?.[0] === RECENT_ORG ? RECENT_ORG : undefined) ?? orgOf(me) ?? orgs[0]?.[0] ?? null)
  }, [org, orgs, q.data, value, me])

  /* 오른쪽 사람들 — 검색 중엔 조직 무시하고 온 사람에서(이름·조직 다 걸림) */
  const people = useMemo(() => {
    const raw = q.data?.names ?? []
    const nq = txt.trim().normalize('NFC').toLowerCase()
    if (nq) {
      const hit = (s: string) => s.normalize('NFC').toLowerCase().includes(nq)
      return raw.filter((u) => hit(u.name) || hit(u.org || '')).map((u) => ({ name: u.name, org: u.org }))
    }
    if (org === RECENT_ORG)
      return readRecent()
        .filter((n) => raw.some((u) => u.name === n))
        .map((n) => ({ name: n, org: raw.find((u) => u.name === n)?.org ?? '' }))
    return raw.filter((u) => (u.org || '기타') === org).map((u) => ({ name: u.name, org: '' }))
  }, [q.data, txt, org])
  useEffect(() => setAct(0), [txt, org])
  useEffect(() => {
    listRef.current?.querySelector('.assp-opt.on')?.scrollIntoView({ block: 'nearest' })
  }, [act, people])

  const pick = (name: string) => {
    pushRecent(name)
    onPick(name)
    onClose()
  }

  /* 화면 밖으로 안 나가게 — 오른쪽·아래 끝에서 되민다(지적: 잘림) */
  const x = Math.max(8, Math.min(at.x, window.innerWidth - 388))
  const y = Math.max(8, Math.min(at.y, window.innerHeight - 396))

  return (
    <>
      <span className="assp-ovl" onClick={onClose} />
      <div className="assp" style={{ left: x, top: y }}>
        <div className="assp-quick">
          {me && (
            <button type="button" className="assp-mebtn" onClick={() => pick(me)}>
              👤 나에게 ({me})
            </button>
          )}
          <button type="button" className="assp-clearbtn" onClick={() => pick('')}>
            – 비움
          </button>
        </div>
        <input
          autoFocus
          placeholder="이름·조직으로 찾기 — ↑↓·Enter"
          value={txt}
          onChange={(e) => setTxt(e.target.value)}
          onKeyDown={(e) => {
            /* 한글 조합 확정 Enter 가 사람을 골라 버리면 안 된다(검증) —
               keyCode 229 는 사파리 계열의 조합 종료 특이 동작까지 덮는다 */
            if (e.nativeEvent.isComposing || e.keyCode === 229) return
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setAct((i) => Math.min(i + 1, Math.max(people.length - 1, 0)))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setAct((i) => Math.max(i - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              const o = people[act]
              if (o) pick(o.name)
            } else if (e.key === 'Escape') onClose()
          }}
        />
        <div className="assp-body">
          <div className={`assp-orgs${txt.trim() ? ' dim' : ''}`}>
            {orgs.map(([o, names]) => (
              <button
                key={o}
                type="button"
                className={`assp-org${o === org && !txt.trim() ? ' on' : ''}`}
                onClick={() => {
                  setTxt('')
                  setOrg(o)
                }}
              >
                <span className="nm">{o}</span>
                <span className="cnt">{names.length}</span>
              </button>
            ))}
            {q.isLoading && <div className="assp-hdr">읽는 중…</div>}
          </div>
          <div className="assp-list" ref={listRef}>
            {people.map((p, i) => (
              <button
                key={`${p.name}-${i}`}
                type="button"
                className={`assp-opt${i === act ? ' on' : ''}${p.name === value ? ' cur' : ''}`}
                onClick={() => pick(p.name)}
                onMouseMove={() => setAct(i)}
              >
                {p.name === value ? '✓ ' : ''}
                {p.name}
                {p.org && <span className="org">{p.org}</span>}
              </button>
            ))}
            {!q.isLoading && people.length === 0 && (
              <div className="assp-hdr">{txt.trim() ? '맞는 사람이 없습니다' : '이 조직엔 사람이 없습니다'}</div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
