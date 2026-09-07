import { useEffect, useMemo, useRef, useState } from 'react'
import { prefGet, prefSet } from '@/lib/prefs'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import './AssigneePicker.css'

/**
 * 담당 고르개 — 온 화면 공용(플랜 표·플랜 항목·러너·노션 표).
 *
 * 지시: 「조직을 선택하고 클릭클릭으로 담당자 지정」 + 「UI가 조금 복잡한것같아」.
 * 그래서 구역은 둘뿐이다 — 민무늬 검색줄 하나, 그 아래 조직 레일과 사람 목록.
 * 「나에게·비움」은 단추 줄이 아니라 사람 목록 맨 위 고정 줄이라 ↑↓로도 닿는다.
 * 노션 표의 사람 칸(PersonEditor)도 이 몸통(PeoplePick)을 그대로 쓴다 —
 * 두 벌이 갈라지면 같은 일이 두 모습이 된다.
 */

const RECENT_KEY = 'utop.ass.recent'
const RECENT_ORG = '최근'
const readRecent = (): string[] => {
  try {
    return (JSON.parse(prefGet(RECENT_KEY) ?? '[]') as string[]).slice(0, 8)
  } catch {
    return []
  }
}
const pushRecent = (name: string) => {
  if (!name) return
  try {
    const v = [name, ...readRecent().filter((x) => x !== name)].slice(0, 8)
    prefSet(RECENT_KEY, JSON.stringify(v))
  } catch {
    /* 사생활 보호 모드 */
  }
}

/** 목록의 한 줄 — 고정 줄(나에게·비움)과 사람 줄을 한 차례로 순회한다 */
type Row = { kind: 'me' | 'clear' | 'person'; name: string; org?: string }

export function PeoplePick({
  at,
  people,
  value,
  me,
  loading,
  onPick,
  onClose,
}: {
  /** 여는 자리(fixed) — 고르개가 스스로 화면 안으로 되민다 */
  at: { x: number; y: number }
  people: Array<{ name: string; org: string }>
  /** 지금 담당 — ✓ 로 표시, 그 사람의 조직이 먼저 열린다 */
  value?: string
  /** 내 이름 — 「나에게」 고정 줄 */
  me?: string
  loading?: boolean
  /** '' = 비움 */
  onPick: (name: string) => void
  onClose: () => void
}) {
  const [txt, setTxt] = useState('')
  const [org, setOrg] = useState<string | null>(null)
  const [act, setAct] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  /* 조직 → 인원수. 조직 없는 계정(봇·공용)은 「기타」 로 맨 아래 */
  const orgs = useMemo(() => {
    const g = new Map<string, number>()
    for (const u of people) {
      const k = u.org || '기타'
      g.set(k, (g.get(k) ?? 0) + 1)
    }
    return [...g.entries()].sort((a, b) => {
      if (a[0] === '기타') return 1
      if (b[0] === '기타') return -1
      return a[0].localeCompare(b[0], 'ko')
    })
  }, [people])
  const recent = useMemo(
    () => readRecent().filter((n) => people.some((u) => u.name === n)),
    [people],
  )

  /* 처음 열 조직 — 지금 담당의 조직 > 최근 > 내 조직 > 첫 조직 */
  useEffect(() => {
    if (org !== null || people.length === 0) return
    const orgOf = (n?: string) => people.find((u) => u.name === n)?.org || undefined
    setOrg(orgOf(value) ?? (recent.length ? RECENT_ORG : undefined) ?? orgOf(me) ?? orgs[0]?.[0] ?? null)
  }, [org, orgs, people, recent, value, me])

  /* 사람들 — 검색 중엔 조직 무시하고 온 사람에서(이름·조직 다 걸림) */
  const nq = txt.trim().normalize('NFC').toLowerCase()
  const shown = useMemo(() => {
    if (nq) {
      const hit = (s: string) => s.normalize('NFC').toLowerCase().includes(nq)
      return people.filter((u) => hit(u.name) || hit(u.org || ''))
    }
    if (org === RECENT_ORG)
      return recent.map((n) => ({ name: n, org: people.find((u) => u.name === n)?.org ?? '' }))
    return people.filter((u) => (u.org || '기타') === org).map((u) => ({ name: u.name, org: '' }))
  }, [people, nq, org, recent])

  /* 순회 차례 — 검색 중엔 고정 줄을 건너뛰고 첫 결과부터 */
  const pinN = nq ? 0 : me ? 2 : 1
  const rows: Row[] = useMemo(() => {
    const pins: Row[] = nq
      ? []
      : [...(me ? [{ kind: 'me' as const, name: me }] : []), { kind: 'clear' as const, name: '' }]
    return [...pins, ...shown.map((p) => ({ kind: 'person' as const, name: p.name, org: p.org }))]
  }, [nq, me, shown])

  /* 처음 강조 = 지금 담당의 줄 — 무심코 Enter 쳐도 현상 유지라 안전하다 */
  useEffect(() => {
    if (nq) {
      setAct(0)
      return
    }
    const cur = value
      ? rows.findIndex((r) => r.kind === 'person' && r.name === value)
      : rows.findIndex((r) => r.kind === 'clear')
    setAct(cur >= 0 ? cur : 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nq, org, people.length])
  useEffect(() => {
    listRef.current?.querySelector('.assp-opt.on')?.scrollIntoView({ block: 'nearest' })
  }, [act, rows])

  const pick = (r: Row) => {
    const name = r.kind === 'clear' ? '' : r.name
    pushRecent(name)
    onPick(name)
    onClose()
  }

  /* 화면 밖으로 안 나가게 — 오른쪽·아래 끝에서 되민다(지적: 잘림) */
  const x = Math.max(8, Math.min(at.x, window.innerWidth - 468))
  const y = Math.max(8, Math.min(at.y, window.innerHeight - 528))

  const opt = (r: Row, i: number) => (
    <button
      key={`${r.kind}-${r.name}-${i}`}
      type="button"
      className={`assp-opt${i === act ? ' on' : ''}${r.kind !== 'person' ? ' pin' : ''}`}
      onClick={() => pick(r)}
      onMouseMove={() => setAct(i)}
    >
      <span className="nm">
        {r.kind === 'me' ? `나에게 (${me})` : r.kind === 'clear' ? '비움' : r.name}
      </span>
      <span className="sp" />
      {r.org ? <span className="org">{r.org}</span> : null}
      {/* ✓ 는 한 곳만 — 담당=나면 「나에게」 줄이 맡는다(고정 줄이 없는 검색 중엔 사람 줄이) */}
      {(r.kind === 'person' && !!value && r.name === value && (value !== me || pinN === 0)) ||
      (r.kind === 'me' && value === me && !!value) ||
      (r.kind === 'clear' && !value) ? (
        <span className="chk">✓</span>
      ) : null}
    </button>
  )

  return (
    <>
      <span className="assp-ovl" onClick={onClose} />
      <div className="assp" style={{ left: x, top: y }}>
        <input
          className="assp-q"
          autoFocus
          placeholder="이름·조직 찾기"
          value={txt}
          onChange={(e) => setTxt(e.target.value)}
          onKeyDown={(e) => {
            /* 한글 조합 확정 Enter 가 사람을 골라 버리면 안 된다(검증) —
               keyCode 229 는 사파리 계열의 조합 종료 특이 동작까지 덮는다 */
            if (e.nativeEvent.isComposing || e.keyCode === 229) return
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setAct((i) => Math.min(i + 1, Math.max(rows.length - 1, 0)))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setAct((i) => Math.max(i - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              const r = rows[act]
              if (r) pick(r)
            } else if (e.key === 'Escape') onClose()
          }}
        />
        <div className="assp-body">
          <div className={`assp-orgs${nq ? ' dim' : ''}`}>
            {recent.length > 0 && (
              <>
                <button
                  type="button"
                  className={`assp-org${org === RECENT_ORG && !nq ? ' on' : ''}`}
                  onClick={() => {
                    setTxt('')
                    setOrg(RECENT_ORG)
                  }}
                >
                  <span className="nm">최근</span>
                  <span className="cnt">{recent.length}</span>
                </button>
                <div className="assp-hr" />
              </>
            )}
            {orgs.map(([o, cnt]) => (
              <button
                key={o}
                type="button"
                className={`assp-org${o === org && !nq ? ' on' : ''}`}
                onClick={() => {
                  setTxt('')
                  setOrg(o)
                }}
              >
                <span className="nm">{o}</span>
                <span className="cnt">{cnt}</span>
              </button>
            ))}
            {loading && <div className="assp-mt">읽는 중…</div>}
          </div>
          <div className="assp-list" ref={listRef}>
            {pinN > 0 && <div className="assp-pins">{rows.slice(0, pinN).map((r, i) => opt(r, i))}</div>}
            {rows.slice(pinN).map((r, j) => opt(r, pinN + j))}
            {!loading && shown.length === 0 && (
              <div className="assp-mt">{nq ? '맞는 사람이 없습니다' : '이 조직엔 사람이 없습니다'}</div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

/** 후보를 스스로 읽는 껍데기 — 대부분의 화면은 이걸 쓴다 */
export default function AssigneePicker({
  at,
  value,
  me,
  onPick,
  onClose,
}: {
  at: { x: number; y: number }
  value?: string
  me?: string
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
  const people = useMemo(
    () =>
      (q.data?.names ?? [])
        .map((u) => ({ name: String(u?.name ?? ''), org: String(u?.org ?? '') }))
        .filter((u) => u.name),
    [q.data],
  )
  return (
    <PeoplePick
      at={at}
      people={people}
      value={value}
      me={me}
      loading={q.isLoading}
      onPick={onPick}
      onClose={onClose}
    />
  )
}
