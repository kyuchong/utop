import { useEffect, useMemo, useRef, useState } from 'react'
import { prefGet, prefSet } from '@/lib/prefs'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import './AssigneePicker.css'

/**
 * 담당 고르개 — 온 화면 공용(플랜 표·플랜 항목·러너·노션 표).
 *
 * 지시: 「조직을 선택하고 클릭클릭으로 담당자 지정」 + 「UI가 조금 복잡한것같아」
 * + 「계정 관리의 조직도 참고해서 구분하기 쉽도록」.
 * 구역은 둘 — 민무늬 검색줄, 그 아래 조직 레일과 사람 목록. 조직 레일은
 * 계정 관리가 심어 둔 조직도(/api/org: 회사→그룹→담당→팀)를 그대로 그린다.
 * 조직도에 이름이 없는 계정(봇·공용·꼬리 조직)은 「조직도 밖」 으로 내려 담는다.
 * 노션 표의 사람 칸(PersonEditor)도 이 몸통(PeoplePick)을 그대로 쓴다.
 */

const RECENT_KEY = 'utop.ass.recent'
const RECENT_ROW = '최근'
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

/** 계정 이름의 꼬리를 뗀다 — 「구병근(검증)」 → 「구병근」. 조직도는 꼬리 없는 이름을 쓴다 */
const baseOf = (v: string) => (v.split(/[([_]/)[0] ?? '').trim()

/** 조직도 한 마디 — 계정 관리(Accounts)와 같은 꼴 */
interface OrgNode {
  name?: string
  lead?: unknown
  members?: Array<{ name?: string }>
  children?: OrgNode[]
}
/** 장(長) 표기는 「최지훈 전무」 처럼 직급이 붙는다 — 이름 토막만 */
const leadBase = (ld: unknown): string => {
  if (typeof ld === 'string') return baseOf(ld.split(/\s+/)[0] ?? '')
  if (ld && typeof ld === 'object') return baseOf(String((ld as { name?: unknown }).name ?? ''))
  return ''
}

/** 레일 한 줄 — 조직도 마디(t) 또는 조직도 밖 묶음(f) */
interface RailRow {
  key: string
  label: string
  depth: number
  cnt: number
  /** 이 줄이 품는 사람(꼬리 뗀 이름). 조직도 줄은 아래 마디까지 전부 */
  bases: Set<string>
  /** 바로 이 마디 소속만 — 처음 열 조직을 「그 사람의 팀」 으로 잡는 데 쓴다 */
  direct: Set<string>
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
  /** 지금 담당 — ✓ 로 표시, 그 사람의 팀이 먼저 열린다 */
  value?: string
  /** 내 이름 — 「나에게」 고정 줄 */
  me?: string
  loading?: boolean
  /** '' = 비움 */
  onPick: (name: string) => void
  onClose: () => void
}) {
  const [txt, setTxt] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const [act, setAct] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  /* 조직도 — 계정 관리가 심어 둔 트리. 없거나 못 읽으면 꼬리 조직으로만 묶는다 */
  const orgQ = useQuery({
    queryKey: ['org-tree'],
    staleTime: 300_000,
    queryFn: async () => {
      const r = await apiFetch('/api/org')
      if (!r.ok) return null
      return ((await r.json()) as { org?: OrgNode | null }).org ?? null
    },
  })

  const rail = useMemo(() => {
    const rows: RailRow[] = []
    const chart = new Set<string>()
    const root = orgQ.data
    if (root) {
      const walk = (n: OrgNode, depth: number): Set<string> => {
        const direct = new Set<string>()
        const lb = leadBase(n.lead)
        if (lb) direct.add(lb)
        for (const m of n.members ?? []) {
          const b = baseOf(String(m?.name ?? ''))
          if (b) direct.add(b)
        }
        const bases = new Set(direct)
        const row: RailRow = { key: '', label: String(n.name ?? ''), depth, cnt: 0, bases, direct }
        const at2 = rows.length
        if (depth >= 0) rows.push(row)
        for (const c of n.children ?? []) for (const b of walk(c, depth + 1)) bases.add(b)
        row.key = `t:${at2}:${row.label}`
        return bases
      }
      walk(root, -1)
      for (const r of rows) for (const b of r.bases) chart.add(b)
      for (const r of rows) r.cnt = people.filter((u) => r.bases.has(baseOf(u.name))).length
    }
    const treeRows = rows.filter((r) => r.cnt > 0)

    /* 조직도 밖 — 이름이 조직도에 없는 계정. 꼬리 조직(검증·Bilab…)으로 묶는다 */
    const out = people.filter((u) => !chart.has(baseOf(u.name)))
    const g = new Map<string, Set<string>>()
    for (const u of out) {
      const k = u.org || '기타'
      if (!g.has(k)) g.set(k, new Set())
      g.get(k)!.add(u.name)
    }
    const flatRows: RailRow[] = [...g.entries()]
      .sort((a, b) => (a[0] === '기타' ? 1 : b[0] === '기타' ? -1 : a[0].localeCompare(b[0], 'ko')))
      .map(([o, names]) => ({
        key: `f:${o}`,
        label: o,
        depth: 0,
        cnt: names.size,
        bases: new Set([...names].map(baseOf)),
        direct: new Set([...names].map(baseOf)),
      }))
    /* 조직도 밖 줄의 사람 판정은 원 이름으로 — 꼬리 뗀 이름은 조직도와 겹칠 수 있다 */
    const flatNames = new Map<string, Set<string>>(
      [...g.entries()].map(([o, names]) => [`f:${o}`, names]),
    )
    return { treeRows, flatRows, flatNames }
  }, [orgQ.data, people])
  const railRows = useMemo(() => [...rail.treeRows, ...rail.flatRows], [rail])

  const recent = useMemo(
    () => readRecent().filter((n) => people.some((u) => u.name === n)),
    [people],
  )

  /* 처음 열 곳 — 지금 담당의 팀(가장 깊은 마디) > 최근 > 내 팀 > 첫 줄 */
  useEffect(() => {
    if (sel !== null || people.length === 0 || orgQ.isLoading) return
    const rowOf = (nm?: string) => {
      if (!nm) return undefined
      const b = baseOf(nm)
      let best: RailRow | undefined
      for (const r of railRows)
        if (r.direct.has(b) || rail.flatNames.get(r.key)?.has(nm))
          if (!best || r.depth >= best.depth) best = r
      return best?.key
    }
    setSel(rowOf(value) ?? (recent.length ? RECENT_ROW : undefined) ?? rowOf(me) ?? railRows[0]?.key ?? null)
  }, [sel, railRows, rail, people, recent, value, me, orgQ.isLoading])

  /* 사람들 — 검색 중엔 조직 무시하고 온 사람에서(이름·조직 다 걸림) */
  const nq = txt.trim().normalize('NFC').toLowerCase()
  const shown = useMemo(() => {
    if (nq) {
      const hit = (s: string) => s.normalize('NFC').toLowerCase().includes(nq)
      return people.filter((u) => hit(u.name) || hit(u.org || ''))
    }
    if (sel === RECENT_ROW)
      return recent.map((n) => ({ name: n, org: people.find((u) => u.name === n)?.org ?? '' }))
    const row = railRows.find((r) => r.key === sel)
    if (!row) return []
    const names = rail.flatNames.get(row.key)
    const mine = names
      ? people.filter((u) => names.has(u.name))
      : people.filter((u) => row.bases.has(baseOf(u.name)))
    return mine
      .map((u) => ({ name: u.name, org: '' }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }, [people, nq, sel, recent, railRows, rail])

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
  }, [nq, sel, people.length])
  useEffect(() => {
    listRef.current?.querySelector('.assp-opt.on')?.scrollIntoView({ block: 'nearest' })
  }, [act, rows])
  /* 고른 조직 줄이 보이게 — 레일이 길어서(조직도 전체) 처음 열 때 스크롤 */
  useEffect(() => {
    listRef.current?.parentElement
      ?.querySelector('.assp-org.on')
      ?.scrollIntoView({ block: 'nearest' })
  }, [sel])

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

  const railBtn = (r: RailRow) => (
    <button
      key={r.key}
      type="button"
      className={`assp-org${r.key === sel && !nq ? ' on' : ''}${r.depth === 0 ? ' top' : ''}`}
      style={r.depth > 0 ? { paddingLeft: 10 + r.depth * 11 } : undefined}
      onClick={() => {
        setTxt('')
        setSel(r.key)
      }}
    >
      <span className="nm">{r.label}</span>
      <span className="cnt">{r.cnt}</span>
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
                  className={`assp-org top${sel === RECENT_ROW && !nq ? ' on' : ''}`}
                  onClick={() => {
                    setTxt('')
                    setSel(RECENT_ROW)
                  }}
                >
                  <span className="nm">최근</span>
                  <span className="cnt">{recent.length}</span>
                </button>
                <div className="assp-hr" />
              </>
            )}
            {rail.treeRows.map(railBtn)}
            {rail.treeRows.length > 0 && rail.flatRows.length > 0 && (
              <>
                <div className="assp-hr" />
                <div className="assp-cap">조직도 밖</div>
              </>
            )}
            {rail.flatRows.map(railBtn)}
            {(loading || orgQ.isLoading) && <div className="assp-mt">읽는 중…</div>}
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
