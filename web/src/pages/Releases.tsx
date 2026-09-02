import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { prefGet, prefSet } from '@/lib/prefs'
import { currentProjects, onProjectChange } from '@/components/ProjectPicker'
import type { Project } from '@/types'
import './Releases.css'

/**
 * **Releases — Jira 버전별 이슈와 그 이슈를 덮는 시험.**
 *
 * 「이번 릴리스의 이슈가 다 검증됐나」 를 배포 전에 보는 자리다. 주신 목업의
 * 노션 꼴 표를 따랐다 — 사업자 ▸ 버전 ▸ 이슈 ▸ TC 가 한 표 안에서 접히고
 * 펴진다.
 *
 * 자료는 **이미 도는 서버 것을 그대로** 쓴다.
 *  · 이슈·버전 : Jira (`/api/jira/versions` · `/api/jira/search-all`)
 *  · 이슈↔TC  : `/api/release-summary` — 열쇠는 `프로젝트@@버전` 이고 그 안이
 *    이슈키별 `{tcs:[…]}` 다. 옛 화면이 쓰던 모양 그대로라 **쌓아 둔 연결이
 *    그대로 보인다.**
 */

/** 사업자 — 버전 이름의 괄호에서 뽑는다. 옛 화면(_rlsOperator)과 같은 규칙이라
 *  같은 자료가 같은 묶음으로 선다. 예: `R24(LGU_R5.5.0)` → `LGU+` */
function operatorOf(ver: string): string {
  const m = String(ver || '').match(/\(([A-Za-z가-힣]+)[_)]/)
  const code = String(m?.[1] ?? '').toUpperCase()
  const map: Record<string, string> = { LGU: 'LGU+', KT: 'KT', KTS: 'KT', SKB: 'SKB', SK: 'SK', SO: 'SO' }
  return map[code] || code || '공통'
}

interface JiraVersion {
  id?: string
  name?: string
  released?: boolean
  archived?: boolean
  releaseDate?: string
}
interface JiraIssue {
  key: string
  fields?: {
    summary?: string
    status?: { name?: string; statusCategory?: { key?: string } }
    issuetype?: { name?: string }
    reporter?: { displayName?: string }
    assignee?: { displayName?: string }
    fixVersions?: Array<{ name?: string }>
  }
}
/** 이슈 하나에 붙은 시험 — 옛 자료의 tcs 는 문자열이거나 객체다 */
interface LinkTc {
  tcid?: string
  id?: string
  result?: string
}
type Store = Record<string, Record<string, { tcs?: Array<LinkTc | string>; statusCat?: string }>>

/** 빈 목록은 **하나를 돌려쓴다** — 매번 [] 를 새로 만들면 그것만으로도
 *  memo 가 깨진다. */
const EMPTY: string[] = []

/** 이 화면이 다루는 이슈 종류 — 시험으로 덮을 거리가 되는 것만(지시) */
const KINDS = ['Defect', 'CR', '개발 Defect']

const tcidOf = (t: LinkTc | string): string =>
  typeof t === 'string' ? t : String(t?.tcid ?? t?.id ?? '')


/** 이슈 한 줄.
 *
 *  **따로 떼어 memo 로 감쌌다.** 한 줄 안에 다 두었더니 이슈 하나를 펼 때마다
 *  97줄이 전부 다시 그려져 화면이 무거웠다(지적). 이제 눌린 줄만 다시 그린다.
 */
const IssueRow = memo(function IssueRow({
  it, ver, open, tcs, tcById, resultOf, onToggle,
}: {
  it: JiraIssue
  ver: string
  open: boolean
  tcs: string[]
  tcById: Map<string, { name: string; kind: string }>
  resultOf: (tcid: string) => string
  onToggle: (k: string) => void
}) {
  const st = String(it.fields?.status?.name ?? '')
  const cat = String(it.fields?.status?.statusCategory?.key ?? '')
  return (
    <div className="rls-iblock">
      <div className="rls-irow">
        <span
          className="rls-car"
          role="button"
          tabIndex={0}
          onClick={() => onToggle(`${ver}|${it.key}`)}
          onKeyDown={(e) => e.key === 'Enter' && onToggle(`${ver}|${it.key}`)}
        >
          {open ? '⌄' : '›'}
        </span>
        <span className="rls-key">{it.key}</span>
        <span className="rls-type">{it.fields?.issuetype?.name ?? ''}</span>
        <span className={`rls-stat ${cat}`}>{st}</span>
        <span className="rls-person">
          <span>보고자</span>
          {it.fields?.reporter?.displayName ?? '–'}
        </span>
        <span className="rls-person">
          <span>담당자</span>
          {it.fields?.assignee?.displayName ?? '–'}
        </span>
        <span className="rls-tcn">TC {tcs.length}</span>
      </div>
      <div className="rls-ititle">{it.fields?.summary ?? ''}</div>
      {open && (
        <div className="rls-tcs">
          {tcs.map((tcid) => {
            const t = tcById.get(tcid)
            const rv = resultOf(tcid)
            return (
              <div className="rls-tcrow" key={tcid}>
                <span className="rls-code">{tcid}</span>
                <span className="rls-name">{t?.name ?? '(지워진 시험 항목)'}</span>
                <span className="rls-kind">{t?.kind === '수동' ? 'MANUAL' : t?.kind ? 'AUTO' : ''}</span>
                <span className={`rls-res ${rv.toLowerCase()}`}>{rv ? rv.toUpperCase() : ''}</span>
              </div>
            )
          })}
          {!tcs.length && (
            <div className="rls-tcrow rls-empty">이 이슈에 붙은 시험 항목이 없습니다.</div>
          )}
        </div>
      )}
    </div>
  )
})

export default function Releases() {
  const qc = useQueryClient()
  const [proj, setProj] = useState(() => prefGet('utop.rls.proj') ?? '')
  const [fOp, setFOp] = useState('')
  const [fType, setFType] = useState('')
  const [fStat, setFStat] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [openIssue, setOpenIssue] = useState<Set<string>>(new Set())
  /** 머리줄에서 고른 UTOP 프로젝트 — 바뀌면 이 화면도 따라간다 */
  const [utop, setUtop] = useState<string[]>(() => currentProjects())
  useEffect(() => onProjectChange(() => setUtop(currentProjects())), [])
  /** 고른 버전. Sync 를 눌러야 세부를 가져온다 — 누른 「프로젝트@@버전」 이 synced 다 */
  const [ver, setVer] = useState('')
  const [synced, setSynced] = useState('')

  /** 이슈 펴기·접기 — **같은 함수**를 계속 준다. 매번 새로 만들면 memo 가
      「달라졌다」 고 보고 다 다시 그린다. */
  const toggleIssue = useCallback((k: string) => {
    setOpenIssue((s0) => {
      const n = new Set(s0)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })
  }, [])

  const toggle = (set: Set<string>, k: string, put: (s: Set<string>) => void) => {
    const n = new Set(set)
    if (n.has(k)) n.delete(k)
    else n.add(k)
    put(n)
  }

  /* ── 프로젝트 ── */
  /** UTOP 프로젝트들 — 어느 Jira 프로젝트에 물렸는지 여기 적혀 있다 */
  const upQ = useQuery({
    queryKey: ['projects'],
    staleTime: 300_000,
    queryFn: async () => {
      const r = await apiFetch('/api/projects')
      if (!r.ok) return { projects: [] as Project[] }
      return (await r.json()) as { projects?: Project[] }
    },
  })

  const projQ = useQuery({
    queryKey: ['jira-projects'],
    staleTime: 300_000,
    queryFn: async () => {
      const r = await apiFetch('/api/jira/projects')
      if (!r.ok) throw new Error('Jira 프로젝트를 불러오지 못했습니다')
      return (await r.json()) as { ok?: boolean; projects?: Array<{ key: string; name: string }>; error?: string }
    },
  })
  const jiraAll = useMemo(
    () =>
      [...(projQ.data?.projects ?? [])].sort((a, b) =>
        String(a.key).localeCompare(String(b.key), undefined, { numeric: true }),
      ),
    [projQ.data],
  )
  /** **이 화면이 다루는 Jira 프로젝트.**
   *
   *  머리줄에서 고른 UTOP 프로젝트에 물린 것만 띄운다(지시). 「전체
   *  프로젝트」 면 물려 둔 것 전부. 서른 개를 늘어놓고 사람이 찾게 하지
   *  않는다 — 물리는 자리는 프로젝트 설정의 「Jira 프로젝트」 칸이다. */
  const linked = useMemo(() => {
    const ups = upQ.data?.projects ?? []
    const mine = utop.length ? ups.filter((p) => utop.includes(p.id)) : ups
    const keys = [...new Set(mine.map((p) => String(p.jira_project ?? '')).filter(Boolean))]
    const byKey = new Map(jiraAll.map((p) => [p.key, p]))
    return keys.map((k) => byKey.get(k) ?? { key: k, name: k })
  }, [upQ.data, utop, jiraAll])
  const allProjects = linked
  /** 즐겨찾기 — Jira 설정의 fav_projects. 옛 화면과 **같은 열쇠**라 거기서
   *  정해 둔 것이 그대로 온다. 비면 「전부」 인데, 실제 Jira 는 프로젝트가
   *  서른 개가 넘어 탭이 가로로 넘쳐 못 쓴다(지적) — 그때는 고르개로 낸다. */
  const cfgQ = useQuery({
    queryKey: ['jira-cfg'],
    staleTime: 300_000,
    queryFn: async () => {
      const r = await apiFetch('/api/jira/config')
      if (!r.ok) return {} as Record<string, unknown>
      return (await r.json()) as Record<string, unknown>
    },
  })
  const favs = useMemo(() => {
    const v = cfgQ.data?.fav_projects
    const arr = Array.isArray(v)
      ? v.map(String)
      : String(v ?? '')
          .split(/[,\s]+/)
          .filter(Boolean)
    return arr
  }, [cfgQ.data])
  useEffect(() => {
    /* 즐겨찾기(fav_projects)가 있으면 그 첫 번째로 시작한다 — 옛 화면과
       같은 열쇠라 거기서 정해 둔 것이 그대로 온다. */
    if (proj || !favs.length || !allProjects.length) return
    const f = allProjects.find((p) => favs.includes(p.key))
    if (f) setProj(f.key)
  }, [favs, allProjects, proj])

  useEffect(() => {
    if (proj) prefSet('utop.rls.proj', proj)
  }, [proj])

  /* ── 버전 ── */
  const verQ = useQuery({
    queryKey: ['jira-versions', proj],
    enabled: !!proj,
    staleTime: 60_000,
    queryFn: async () => {
      const r = await apiFetch(`/api/jira/versions?project=${encodeURIComponent(proj)}`)
      if (!r.ok) throw new Error('버전을 불러오지 못했습니다')
      return (await r.json()) as { ok?: boolean; versions?: JiraVersion[]; error?: string }
    },
  })

  /* ── 이슈 — 버전이 붙은 것만 한 번에 받아 화면에서 나눈다 ── */
  /* 이슈는 **Sync 를 눌러야** 가져온다(지시). 프로젝트만 바꿔도 Jira 를
     두드리면, 서른 개를 훑는 동안 화면이 멎는다. */
  const issQ = useQuery({
    queryKey: ['jira-issues', synced],
    enabled: !!synced,
    staleTime: 60_000,
    queryFn: async () => {
      /* **이 셋만 가져온다**(지시). 나머지(Task·산출물·OS Release…)는 시험으로
         덮을 것이 아니라 이 화면에 설 까닭이 없다. Jira 에서 걸러 오므로
         받는 양도 그만큼 준다. */
      const types = KINDS.map((k) => `"${k}"`).join(', ')
      const [sp, sv] = synced.split('@@')
      const jql =
        `project = ${sp} AND fixVersion = "${sv}" AND issuetype in (${types}) ORDER BY key DESC`
      const f = 'summary,status,issuetype,reporter,assignee,fixVersions'
      const r = await apiFetch(
        `/api/jira/search-all?jql=${encodeURIComponent(jql)}&fields=${encodeURIComponent(f)}`,
      )
      if (!r.ok) throw new Error('이슈를 불러오지 못했습니다')
      return (await r.json()) as { ok?: boolean; issues?: JiraIssue[]; error?: string }
    },
  })

  /* ── 이슈↔TC 연결 · 시험 항목 이름 · 최근 결과 ── */
  const sumQ = useQuery({
    queryKey: ['release-summary'],
    staleTime: 30_000,
    queryFn: async () => {
      const r = await apiFetch('/api/release-summary')
      if (!r.ok) return { releases: {} as Store }
      const j = (await r.json()) as { releases?: unknown }
      const rel = j?.releases
      return { releases: (rel && typeof rel === 'object' && !Array.isArray(rel) ? rel : {}) as Store }
    },
  })
  const tcQ = useQuery({
    queryKey: ['tc-meta-rls'],
    staleTime: 300_000,
    queryFn: async () => {
      const r = await apiFetch('/api/tc?meta=1')
      if (!r.ok) return { tcs: [] as Array<{ tcid: string; name?: string; kind?: string }> }
      return (await r.json()) as { tcs?: Array<{ tcid: string; name?: string; kind?: string }> }
    },
  })
  const lastQ = useQuery({
    queryKey: ['tc-last-result'],
    staleTime: 60_000,
    queryFn: async () => {
      const r = await apiFetch('/api/tc-last-result')
      if (!r.ok) return {} as Record<string, { result?: string }>
      const j = (await r.json()) as { items?: Record<string, { result?: string }> }
      return j.items ?? {}
    },
  })
  const tcById = useMemo(() => {
    const m = new Map<string, { name: string; kind: string }>()
    for (const t of tcQ.data?.tcs ?? [])
      m.set(String(t.tcid), { name: String(t.name ?? ''), kind: String(t.kind ?? '') })
    return m
  }, [tcQ.data])

  /* ── 사업자 ▸ 버전 ▸ 이슈 로 접는다 ── */
  const issues = issQ.data?.issues ?? []
  const byVer = useMemo(() => {
    const m = new Map<string, JiraIssue[]>()
    for (const it of issues)
      for (const fv of it.fields?.fixVersions ?? []) {
        const k = String(fv?.name ?? '')
        if (!k) continue
        const arr = m.get(k)
        if (arr) arr.push(it)
        else m.set(k, [it])
      }
    return m
  }, [issues])

  const opts = useMemo(() => {
    const t = new Set<string>()
    const s = new Set<string>()
    for (const it of issues) {
      const ty = String(it.fields?.issuetype?.name ?? '')
      const st = String(it.fields?.status?.name ?? '')
      if (ty) t.add(ty)
      if (st) s.add(st)
    }
    const srt = (a: string, b: string) => a.localeCompare(b, 'ko')
    return { types: [...t].sort(srt), stats: [...s].sort(srt) }
  }, [issues])

  const keep = (it: JiraIssue) =>
    (!fType || String(it.fields?.issuetype?.name ?? '') === fType) &&
    (!fStat || String(it.fields?.status?.name ?? '') === fStat)

  const tree = useMemo(() => {
    /* **Sync 한 버전만** 그린다(지적: 1.1.3 만 Sync 했는데 다 나온다).
       위 고르개의 버전 목록은 「고를 수 있는 것 전부」 지만, 아래 표는
       가져온 그 버전의 것이다 — 79개를 다 늘어놓으면 무엇을 가져왔는지
       알 수 없다. */
    const only = synced ? synced.split('@@')[1] : ''
    const versions = (verQ.data?.versions ?? []).filter(
      (v) => !v.archived && (!only || String(v.name ?? '') === only),
    )
    const g = new Map<string, JiraVersion[]>()
    for (const v of versions) {
      const op = operatorOf(String(v.name ?? ''))
      if (fOp && op !== fOp) continue
      const arr = g.get(op)
      if (arr) arr.push(v)
      else g.set(op, [v])
    }
    return [...g.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ko'))
  }, [verQ.data, fOp, synced])

  const ops = useMemo(
    () => [...new Set(tree.map(([op]) => op))].sort(),
    [tree],
  )

  const store = sumQ.data?.releases ?? {}
  const resultOf = useCallback(
    (tcid: string) => String((lastQ.data ?? {})[tcid]?.result ?? ''),
    [lastQ.data],
  )

  /** 이슈키 → 붙은 TC. **한 번 만들어 두고 같은 배열을 계속 준다.**
   *  매 렌더마다 새 배열을 만들어 넘기면 memo 가 「달라졌다」 고 보고
   *  99줄을 다 다시 그린다 — memo 를 걸어 놓고 무의미해진다. */
  const tcMap = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const [vn] of byVer) {
      const bag = store[`${proj}@@${vn}`] ?? {}
      for (const k of Object.keys(bag)) {
        const arr = (bag[k]?.tcs ?? []).map(tcidOf).filter(Boolean)
        if (arr.length) m.set(`${vn}|${k}`, arr)
      }
    }
    return m
  }, [byVer, store, proj])

  /** 버전마다의 이슈 수·TC 수를 **한 번만** 센다.
   *  예전엔 그릴 때마다 다시 셌다 — 이슈가 97건이면 한 번 누를 때마다
   *  그 곱만큼 돌아 화면이 무거웠다(지적). */
  const stat = useMemo(() => {
    const m = new Map<string, { n: number; tc: number }>()
    for (const [vn, list] of byVer) {
      const kept = list.filter(
        (it) =>
          (!fType || String(it.fields?.issuetype?.name ?? '') === fType) &&
          (!fStat || String(it.fields?.status?.name ?? '') === fStat),
      )
      let tc = 0
      for (const it of kept) tc += (tcMap.get(`${vn}|${it.key}`) ?? EMPTY).length
      m.set(vn, { n: kept.length, tc })
    }
    return m
  }, [byVer, fType, fStat, tcMap])

  const err = projQ.data?.error || verQ.data?.error || issQ.data?.error

  return (
    <div className="rls">
      {/* ── 프로젝트 탭 ── */}
      {/* ── 위 줄 — **프로젝트와 버전까지만** 불러온다(지시).
             세부는 Sync 를 눌러야 온다. 프로젝트는 머리줄에서 고른 UTOP
             프로젝트에 물린 Jira 프로젝트만 뜬다. ── */}
      <div className="rls-top">
        <b className="rls-h1">Releases</b>
        <select
          className="rls-sel"
          value={proj}
          onChange={(e) => {
            setProj(e.target.value)
            setVer('')
            setSynced('')
          }}
          disabled={projQ.isLoading || upQ.isLoading}
          title="Jira 프로젝트"
        >
          <option value="">
            {projQ.isLoading || upQ.isLoading ? '불러오는 중…' : '(프로젝트 선택)'}
          </option>
          {allProjects.map((p) => (
            <option key={p.key} value={p.key}>
              {p.key} · {p.name}
            </option>
          ))}
        </select>
        <select
          className="rls-sel ver"
          value={ver}
          onChange={(e) => setVer(e.target.value)}
          disabled={!proj || verQ.isLoading}
          title="버전"
        >
          <option value="">{verQ.isLoading ? '버전 불러오는 중…' : '(버전 선택)'}</option>
          {(verQ.data?.versions ?? [])
            .filter((v) => !v.archived)
            .map((v) => {
              const vn = String(v.name ?? '')
              return (
                <option key={vn} value={vn}>
                  {vn}
                  {v.released ? ' ✓' : ''}
                  {v.releaseDate ? ` · ${v.releaseDate}` : ''}
                </option>
              )
            })}
        </select>
        <button
          type="button"
          className="rls-sync"
          disabled={!proj || !ver || issQ.isFetching}
          title={
            !proj || !ver
              ? '프로젝트와 버전을 먼저 고르세요'
              : '고른 버전의 이슈를 Jira 에서 가져옵니다'
          }
          onClick={() => {
            const k = `${proj}@@${ver}`
            if (synced === k) {
              void qc.invalidateQueries({ queryKey: ['jira-issues', k] })
              void qc.invalidateQueries({ queryKey: ['release-summary'] })
            } else setSynced(k)
          }}
        >
          {issQ.isFetching ? '가져오는 중…' : '↻ Sync'}
        </button>
        <span className="rls-kinds" title="이 세 가지만 가져옵니다">
          {KINDS.join(' · ')}
        </span>
      </div>

      {/* ── 거르개 ── */}
      <div className="rls-filters">
        <select value={fOp} onChange={(e) => setFOp(e.target.value)}>
          <option value="">사업자 전체</option>
          {ops.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <select value={fType} onChange={(e) => setFType(e.target.value)}>
          <option value="">이슈유형 전체</option>
          {opts.types.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <select value={fStat} onChange={(e) => setFStat(e.target.value)}>
          <option value="">상태 전체</option>
          {opts.stats.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <span className="sp" />
      </div>

      {err && <div className="rls-err">Jira 를 읽지 못했습니다 — {err}</div>}

      {/* ── 표 ── */}
      <div className="rls-db">
        {!allProjects.length && !upQ.isLoading && !projQ.isLoading && (
          <div className="rls-none">
            이 프로젝트에 물린 Jira 프로젝트가 없습니다 — 프로젝트 설정의 「Jira 프로젝트」 칸에서
            물려 주세요.
          </div>
        )}
        {!!allProjects.length && !synced && (
          <div className="rls-none">
            프로젝트와 버전을 고르고 <b>Sync</b> 를 누르면 그 버전의 이슈를 가져옵니다.
          </div>
        )}
        {(verQ.isLoading || issQ.isLoading) && <div className="rls-none">불러오는 중…</div>}
        {synced && !issQ.isLoading && !tree.length && !err && (
          <div className="rls-none">이 버전에 걸린 이슈가 없습니다.</div>
        )}
        {!!synced && tree.map(([op, vers]) => {
          const nIss = vers.reduce((a, v) => a + (stat.get(String(v.name ?? ''))?.n ?? 0), 0)
          const oOpen = !open.has(`op:${op}`)
          return (
            <div key={op}>
              <div className="rls-grow" role="button" tabIndex={0}
                onClick={() => toggle(open, `op:${op}`, setOpen)}
                onKeyDown={(e) => e.key === 'Enter' && toggle(open, `op:${op}`, setOpen)}>
                <span className="rls-car">{oOpen ? '⌄' : '›'}</span>
                <b>{op}</b>
                <span className="rls-right">
                  <span>버전 {vers.length}</span>
                  <span>이슈 {nIss}</span>
                </span>
              </div>
              {oOpen &&
                vers.map((v) => {
                  const vn = String(v.name ?? '')
                  const st0 = stat.get(vn) ?? { n: 0, tc: 0 }
                  const vOpen = open.has(`v:${vn}`)
                  /* 접혀 있으면 이슈 목록을 **만들지도 않는다** — 97건을
                     걸러 놓고 안 그리는 것은 그냥 버리는 일이다. */
                  const list = vOpen ? (byVer.get(vn) ?? []).filter(keep) : ([] as JiraIssue[])
                  return (
                    <div key={vn}>
                      <div className="rls-vrow" role="button" tabIndex={0}
                        onClick={() => toggle(open, `v:${vn}`, setOpen)}
                        onKeyDown={(e) => e.key === 'Enter' && toggle(open, `v:${vn}`, setOpen)}>
                        <span className="rls-car">{vOpen ? '⌄' : '›'}</span>
                        <span className="rls-vname">{vn}</span>
                        {v.released && <span className="rls-rel">released</span>}
                        <span className="rls-right">
                          <span>Issues {st0.n}</span>
                          <span>TC {st0.tc}</span>
                          {v.releaseDate && <span>{v.releaseDate}</span>}
                        </span>
                      </div>
                      {vOpen &&
                        list.map((it) => (
                          <IssueRow
                            key={`${vn}|${it.key}`}
                            it={it}
                            ver={vn}
                            open={openIssue.has(`${vn}|${it.key}`)}
                            tcs={tcMap.get(`${vn}|${it.key}`) ?? EMPTY}
                            tcById={tcById}
                            resultOf={resultOf}
                            onToggle={toggleIssue}
                          />
                        ))}
                      {vOpen && !st0.n && (
                        <div className="rls-iblock rls-empty">이 버전에 걸린 이슈가 없습니다.</div>
                      )}
                    </div>
                  )
                })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
