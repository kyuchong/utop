import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { prefGet, prefSet } from '@/lib/prefs'
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

const tcidOf = (t: LinkTc | string): string =>
  typeof t === 'string' ? t : String(t?.tcid ?? t?.id ?? '')

export default function Releases() {
  const qc = useQueryClient()
  const [proj, setProj] = useState(() => prefGet('utop.rls.proj') ?? '')
  const [fOp, setFOp] = useState('')
  const [fType, setFType] = useState('')
  const [fStat, setFStat] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [openIssue, setOpenIssue] = useState<Set<string>>(new Set())

  const toggle = (set: Set<string>, k: string, put: (s: Set<string>) => void) => {
    const n = new Set(set)
    if (n.has(k)) n.delete(k)
    else n.add(k)
    put(n)
  }

  /* ── 프로젝트 ── */
  const projQ = useQuery({
    queryKey: ['jira-projects'],
    staleTime: 300_000,
    queryFn: async () => {
      const r = await apiFetch('/api/jira/projects')
      if (!r.ok) throw new Error('Jira 프로젝트를 불러오지 못했습니다')
      return (await r.json()) as { ok?: boolean; projects?: Array<{ key: string; name: string }>; error?: string }
    },
  })
  const projects = projQ.data?.projects ?? []
  useEffect(() => {
    if (!proj && projects.length) setProj(projects[0]!.key)
  }, [projects, proj])
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
  const issQ = useQuery({
    queryKey: ['jira-issues', proj],
    enabled: !!proj,
    staleTime: 60_000,
    queryFn: async () => {
      const jql = `project = ${proj} AND fixVersion IS NOT EMPTY ORDER BY key DESC`
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
    const versions = (verQ.data?.versions ?? []).filter((v) => !v.archived)
    const g = new Map<string, JiraVersion[]>()
    for (const v of versions) {
      const op = operatorOf(String(v.name ?? ''))
      if (fOp && op !== fOp) continue
      const arr = g.get(op)
      if (arr) arr.push(v)
      else g.set(op, [v])
    }
    return [...g.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ko'))
  }, [verQ.data, fOp])

  const ops = useMemo(
    () => [...new Set((verQ.data?.versions ?? []).map((v) => operatorOf(String(v.name ?? ''))))].sort(),
    [verQ.data],
  )

  const store = sumQ.data?.releases ?? {}
  const linkKey = (ver: string) => `${proj}@@${ver}`
  const tcsOf = (ver: string, key: string): string[] =>
    ((store[linkKey(ver)] ?? {})[key]?.tcs ?? []).map(tcidOf).filter(Boolean)
  const resultOf = (tcid: string) => String((lastQ.data ?? {})[tcid]?.result ?? '')

  const err = projQ.data?.error || verQ.data?.error || issQ.data?.error

  return (
    <div className="rls">
      {/* ── 프로젝트 탭 ── */}
      <div className="rls-tabs">
        {projects.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`rls-tab${proj === p.key ? ' on' : ''}`}
            onClick={() => setProj(p.key)}
          >
            {p.name} <small>{p.key}</small>
          </button>
        ))}
        {!projects.length && !projQ.isLoading && <span className="rls-none">Jira 프로젝트가 없습니다</span>}
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
        <button
          type="button"
          className="rls-btn"
          disabled={verQ.isFetching || issQ.isFetching}
          onClick={() => {
            void qc.invalidateQueries({ queryKey: ['jira-versions'] })
            void qc.invalidateQueries({ queryKey: ['jira-issues'] })
            void qc.invalidateQueries({ queryKey: ['release-summary'] })
          }}
        >
          ↻ Jira Sync
        </button>
      </div>

      {err && <div className="rls-err">Jira 를 읽지 못했습니다 — {err}</div>}

      {/* ── 표 ── */}
      <div className="rls-db">
        {(verQ.isLoading || issQ.isLoading) && <div className="rls-none">불러오는 중…</div>}
        {!verQ.isLoading && !tree.length && !err && (
          <div className="rls-none">이 프로젝트에는 버전이 없습니다.</div>
        )}
        {tree.map(([op, vers]) => {
          const nIss = vers.reduce((a, v) => a + (byVer.get(String(v.name ?? '')) ?? []).filter(keep).length, 0)
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
                  const list = (byVer.get(vn) ?? []).filter(keep)
                  const vOpen = !open.has(`v:${vn}`)
                  const nTc = list.reduce((a, it) => a + tcsOf(vn, it.key).length, 0)
                  return (
                    <div key={vn}>
                      <div className="rls-vrow" role="button" tabIndex={0}
                        onClick={() => toggle(open, `v:${vn}`, setOpen)}
                        onKeyDown={(e) => e.key === 'Enter' && toggle(open, `v:${vn}`, setOpen)}>
                        <span className="rls-car">{vOpen ? '⌄' : '›'}</span>
                        <span className="rls-vname">{vn}</span>
                        {v.released && <span className="rls-rel">released</span>}
                        <span className="rls-right">
                          <span>Issues {list.length}</span>
                          <span>TC {nTc}</span>
                          {v.releaseDate && <span>{v.releaseDate}</span>}
                        </span>
                      </div>
                      {vOpen &&
                        list.map((it) => {
                          const tcs = tcsOf(vn, it.key)
                          const iOpen = openIssue.has(`${vn}|${it.key}`)
                          const st = String(it.fields?.status?.name ?? '')
                          const cat = String(it.fields?.status?.statusCategory?.key ?? '')
                          return (
                            <div className="rls-iblock" key={`${vn}|${it.key}`}>
                              <div className="rls-irow">
                                <span
                                  className="rls-car"
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => toggle(openIssue, `${vn}|${it.key}`, setOpenIssue)}
                                  onKeyDown={(e) =>
                                    e.key === 'Enter' && toggle(openIssue, `${vn}|${it.key}`, setOpenIssue)
                                  }
                                >
                                  {iOpen ? '⌄' : '›'}
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
                              {iOpen && (
                                <div className="rls-tcs">
                                  {tcs.map((tcid) => {
                                    const t = tcById.get(tcid)
                                    const rv = resultOf(tcid)
                                    return (
                                      <div className="rls-tcrow" key={tcid}>
                                        <span className="rls-code">{tcid}</span>
                                        <span className="rls-name">{t?.name ?? '(지워진 시험 항목)'}</span>
                                        <span className="rls-kind">
                                          {t?.kind === '수동' ? 'MANUAL' : t?.kind ? 'AUTO' : ''}
                                        </span>
                                        <span className={`rls-res ${rv.toLowerCase()}`}>
                                          {rv ? rv.toUpperCase() : ''}
                                        </span>
                                      </div>
                                    )
                                  })}
                                  {!tcs.length && (
                                    <div className="rls-tcrow rls-empty">
                                      이 이슈에 붙은 시험 항목이 없습니다.
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      {vOpen && !list.length && (
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
