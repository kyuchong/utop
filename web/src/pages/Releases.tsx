import { useCallback, useEffect, useMemo, useState } from 'react'
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

/** 빈 목록은 **하나를 돌려쓴다** — 매번 [] 를 새로 만들면 그것만으로도
 *  memo 가 깨진다. */
const EMPTY: string[] = []

const tcidOf = (t: LinkTc | string): string =>
  typeof t === 'string' ? t : String(t?.tcid ?? t?.id ?? '')


export default function Releases() {
  const qc = useQueryClient()
  const [proj, setProj] = useState(() => prefGet('utop.rls.proj') ?? '')
  const [fOp, setFOp] = useState('')
  const [fType, setFType] = useState('')
  const fStat = ''
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')

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
  const allProjects = useMemo(
    () =>
      [...(projQ.data?.projects ?? [])].sort((a, b) =>
        String(a.key).localeCompare(String(b.key), undefined, { numeric: true }),
      ),
    [projQ.data],
  )
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
    /* 즐겨찾기가 있으면 그 첫 번째를, 없으면 아무것도 안 고른다 —
       고르개에서 사람이 고른다(옛 화면과 같다). */
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

  /* ── 왼쪽 판 폭 — 끌어서 바꾸고 계정별로 남는다(옛 화면과 같다) ── */
  const [treeW, setTreeW] = useState(() => Number(prefGet('utop.rls.treew') ?? '') || 320)
  const dragW = (e: React.MouseEvent) => {
    e.preventDefault()
    const x0 = e.clientX
    const w0 = treeW
    const mv = (m: MouseEvent) =>
      setTreeW(Math.max(220, Math.min(window.innerWidth - 420, w0 + (m.clientX - x0))))
    const up = () => {
      window.removeEventListener('mousemove', mv)
      window.removeEventListener('mouseup', up)
      setTreeW((w) => {
        prefSet('utop.rls.treew', String(w))
        return w
      })
    }
    window.addEventListener('mousemove', mv)
    window.addEventListener('mouseup', up)
  }

  /** 고른 것 — 오른쪽 판이 이걸 그린다 */
  const [sel, setSel] = useState<{ ver: string; key: string } | null>(null)
  const selIssue = useMemo(
    () => (sel ? (byVer.get(sel.ver) ?? []).find((x) => x.key === sel.key) ?? null : null),
    [sel, byVer],
  )
  const selTcs = sel ? (tcMap.get(`${sel.ver}|${sel.key}`) ?? EMPTY) : EMPTY

  const hit = (t: string) => !q.trim() || t.toLowerCase().includes(q.trim().toLowerCase())

  return (
    <div className="rls">
      {/* ── 위 줄 — 옛 화면과 같은 차례: 이름 · 프로젝트 · 버전 · Sync · 찾기 ── */}
      <div className="rls-top">
        <b className="rls-h1">Jira Issue Coverage</b>
        <select
          className="rls-sel proj"
          value={proj}
          onChange={(e) => {
            setProj(e.target.value)
            setSel(null)
          }}
          disabled={projQ.isLoading}
          title="프로젝트"
        >
          <option value="">{projQ.isLoading ? '로드 중…' : '(프로젝트 선택)'}</option>
          {allProjects.map((p) => (
            <option key={p.key} value={p.key}>
              {p.key} · {p.name}
            </option>
          ))}
        </select>
        <select
          className="rls-sel ver"
          value={sel?.ver ?? ''}
          onChange={(e) => setSel(e.target.value ? { ver: e.target.value, key: '' } : null)}
          title="버전 선택"
        >
          <option value="">버전…</option>
          {(verQ.data?.versions ?? [])
            .filter((v) => !v.archived)
            .map((v) => {
              const vn = String(v.name ?? '')
              const st = stat.get(vn)
              return (
                <option key={vn} value={vn}>
                  {vn}
                  {v.released ? ' ✓' : ''}
                  {v.releaseDate ? ` · ${v.releaseDate}` : ''}
                  {st ? ` [이슈 ${st.n}]` : ''}
                </option>
              )
            })}
        </select>
        <button
          type="button"
          className="rls-sync"
          disabled={verQ.isFetching || issQ.isFetching}
          onClick={() => {
            void qc.invalidateQueries({ queryKey: ['jira-versions'] })
            void qc.invalidateQueries({ queryKey: ['jira-issues'] })
            void qc.invalidateQueries({ queryKey: ['release-summary'] })
          }}
        >
          ↻ Sync
        </button>
        <input
          className="rls-find"
          value={q}
          placeholder="버전·이슈 검색…"
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {err && <div className="rls-err">Jira 를 읽지 못했습니다 — {err}</div>}

      <div className="rls-two">
        {/* ── 왼쪽: 버전·이슈 트리 ── */}
        <div className="rls-tree" style={{ flex: `0 0 ${treeW}px`, width: treeW }}>
          <div className="rls-th">
            <b>버전·이슈</b>
            <span className="sp" />
            <select value={fOp} onChange={(e) => setFOp(e.target.value)} title="사업자">
              <option value="">사업자 전체</option>
              {ops.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
            <select value={fType} onChange={(e) => setFType(e.target.value)} title="이슈유형">
              <option value="">유형 전체</option>
              {opts.types.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
            <button
              type="button"
              title="전체 펼치기"
              onClick={() => {
                const n = new Set<string>()
                for (const [op, vers] of tree) {
                  n.add(`op:${op}`)
                  for (const v of vers) n.add(`v:${String(v.name ?? '')}`)
                }
                setOpen(n)
              }}
            >
              전체 +
            </button>
            <button type="button" title="전체 닫기" onClick={() => setOpen(new Set())}>
              전체 −
            </button>
          </div>

          <div className="rls-tb">
            {(verQ.isLoading || issQ.isLoading) && <div className="rls-none">불러오는 중…</div>}
            {!proj && !projQ.isLoading && <div className="rls-none">위에서 프로젝트를 고르세요.</div>}
            {proj && !verQ.isLoading && !tree.length && !err && (
              <div className="rls-none">이 프로젝트에는 버전이 없습니다.</div>
            )}
            {tree.map(([op, vers]) => {
              const oOpen = open.has(`op:${op}`)
              const nIss = vers.reduce((a, v) => a + (stat.get(String(v.name ?? ''))?.n ?? 0), 0)
              return (
                <div key={op}>
                  <button
                    type="button"
                    className="rls-tn op"
                    onClick={() => toggle(open, `op:${op}`, setOpen)}
                  >
                    <span className="rls-car">{oOpen ? '⌄' : '›'}</span>
                    <b>{op}</b>
                    <span className="rls-cnt">
                      버전 {vers.length} · 이슈 {nIss}
                    </span>
                  </button>
                  {oOpen &&
                    vers.map((v) => {
                      const vn = String(v.name ?? '')
                      if (!hit(vn) && !(byVer.get(vn) ?? []).some((x) => hit(x.key) || hit(String(x.fields?.summary ?? '')))) return null
                      const st0 = stat.get(vn) ?? { n: 0, tc: 0 }
                      const vOpen = open.has(`v:${vn}`)
                      return (
                        <div key={vn}>
                          <button
                            type="button"
                            className={`rls-tn ver${sel?.ver === vn && !sel?.key ? ' on' : ''}`}
                            onClick={() => {
                              toggle(open, `v:${vn}`, setOpen)
                              setSel({ ver: vn, key: '' })
                            }}
                            title={vn}
                          >
                            <span className="rls-car">{vOpen ? '⌄' : '›'}</span>
                            <span className="rls-vn">{vn}</span>
                            {v.released && <i className="rls-rel">✓</i>}
                            <span className="rls-cnt">{st0.n}</span>
                          </button>
                          {vOpen &&
                            (byVer.get(vn) ?? [])
                              .filter(keep)
                              .filter((it) => hit(it.key) || hit(String(it.fields?.summary ?? '')) || hit(vn))
                              .map((it) => {
                                const n = (tcMap.get(`${vn}|${it.key}`) ?? EMPTY).length
                                return (
                                  <button
                                    type="button"
                                    key={it.key}
                                    className={`rls-tn iss${sel?.key === it.key && sel?.ver === vn ? ' on' : ''}`}
                                    onClick={() => setSel({ ver: vn, key: it.key })}
                                    title={String(it.fields?.summary ?? '')}
                                  >
                                    <span className="rls-ik">{it.key}</span>
                                    <span className="rls-is">{it.fields?.summary ?? ''}</span>
                                    {!!n && <span className="rls-cnt">TC {n}</span>}
                                  </button>
                                )
                              })}
                        </div>
                      )
                    })}
                </div>
              )
            })}
          </div>
        </div>

        {/* 폭 조절 막대 */}
        <div className="rls-rail" onMouseDown={dragW} role="separator" aria-orientation="vertical" />

        {/* ── 오른쪽: 고른 것의 상세 ── */}
        <div className="rls-detail">
          {!sel && <div className="rls-none">왼쪽에서 버전이나 이슈를 고르세요.</div>}
          {sel && !sel.key && (
            <div className="rls-dv">
              <div className="rls-dh">
                <b>{sel.ver}</b>
                <span className="rls-cnt">
                  이슈 {stat.get(sel.ver)?.n ?? 0} · TC {stat.get(sel.ver)?.tc ?? 0}
                </span>
              </div>
              <div className="rls-none">이슈를 고르면 그 이슈에 붙은 시험이 여기 나옵니다.</div>
            </div>
          )}
          {sel && sel.key && selIssue && (
            <div className="rls-dv">
              <div className="rls-dh">
                <b>{selIssue.key}</b>
                <span className={`rls-stat ${String(selIssue.fields?.status?.statusCategory?.key ?? '')}`}>
                  {selIssue.fields?.status?.name ?? ''}
                </span>
                <span className="rls-type">{selIssue.fields?.issuetype?.name ?? ''}</span>
                <span className="sp" />
                <span className="rls-cnt">{sel.ver}</span>
              </div>
              <div className="rls-dt">{selIssue.fields?.summary ?? ''}</div>
              <div className="rls-dmeta">
                <span>
                  <em>보고자</em>
                  {selIssue.fields?.reporter?.displayName ?? '–'}
                </span>
                <span>
                  <em>담당자</em>
                  {selIssue.fields?.assignee?.displayName ?? '–'}
                </span>
              </div>
              <div className="rls-dsec">
                이 이슈를 덮는 시험 <span className="rls-cnt">{selTcs.length}건</span>
              </div>
              <div className="rls-tcs">
                {selTcs.map((tcid) => {
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
                {!selTcs.length && (
                  <div className="rls-tcrow rls-empty">
                    이 이슈에 붙은 시험 항목이 없습니다.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
