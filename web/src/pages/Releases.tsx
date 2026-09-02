import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { goto } from '@/api/goto'
import { prefGet, prefSet } from '@/lib/prefs'
import { currentProjects, onProjectChange } from '@/components/ProjectPicker'
import TcForm from '@/components/TcForm'
import type { Project } from '@/types'
import './Releases.css'

/**
 * **Releases — Jira 버전별 이슈와 그 이슈를 덮는 시험.**
 *
 * 「이번 릴리스의 이슈가 다 검증됐나」 를 배포 전에 보는 자리다.
 *
 * ## Sync 한 것은 남는다
 *
 * 예전엔 Sync 를 눌러야만 표가 찼고, 새로고침하면 도로 비었다(지적:
 * 「계속 새로 해야 됩니다」). Jira 응답을 화면 안에만 들고 있었기 때문이다.
 *
 * 이제 **가져온 이슈를 `release_summary` 에 그대로 넣는다.** 옛 화면
 * (`_rlsStore`)이 쓰던 모양 그대로다 —
 *
 *   releases["프로젝트@@버전"]["이슈키"] = { summary, type, status, statusCat,
 *                                            assignee, reporter, …, tcs:[…] }
 *
 * 그래서 ① 새로고침해도 그대로 있고 ② 옛 화면이 쌓아 둔 것도 그대로 보이고
 * ③ 표를 그릴 때 Jira 를 안 두드린다. 표에 서는 버전 = **Sync 한 버전**이다.
 *
 * Sync 는 두 자리에 있다. 위 줄의 것은 체크한 버전을 한꺼번에, 버전 줄의
 * ↻ 는 그 버전 하나만 — 한 버전만 다시 보려고 79개를 다시 받지 않는다.
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
  startDate?: string
  description?: string
}
/** Jira 가 준 이슈 — 받은 그대로. 저장할 때 아래 StoredIssue 로 줄인다 */
interface JiraIssue {
  key: string
  fields?: {
    summary?: string
    created?: string
    status?: { name?: string; statusCategory?: { key?: string } }
    issuetype?: { name?: string }
    priority?: { name?: string }
    resolution?: { name?: string }
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
/** **저장되는 이슈.** 칸 이름은 옛 화면과 한 글자도 다르지 않다 —
 *  이름을 바꾸면 그 화면이 쌓아 둔 것을 못 읽는다. */
interface StoredIssue {
  key?: string
  summary?: string
  type?: string
  status?: string
  statusCat?: string
  priority?: string
  resolution?: string
  assignee?: string
  reporter?: string
  created?: string
  source?: string
  /** 언제 Jira 에서 받아 왔나 — 버전 줄에 「마지막 Sync」 로 나온다 */
  syncedAt?: string
  tcs?: Array<LinkTc | string>
}
type Store = Record<string, Record<string, StoredIssue>>

/** 빈 목록은 **하나를 돌려쓴다** — 매번 [] 를 새로 만들면 그것만으로도
 *  memo 가 깨진다. */
const EMPTY: string[] = []

/** 이 화면이 다루는 이슈 종류 — 시험으로 덮을 거리가 되는 것만(지시) */
const KINDS = ['Defect', 'CR', '개발 Defect']

const tcidOf = (t: LinkTc | string): string =>
  typeof t === 'string' ? t : String(t?.tcid ?? t?.id ?? '')

/** 받은 이슈를 저장할 모양으로 줄인다. 화면이 그리는 칸만 남긴다 —
 *  Jira 응답을 통째로 넣으면 이슈 백 건에 몇 MB 가 된다. */
function shrink(it: JiraIssue, at: string, old?: StoredIssue): StoredIssue {
  const f = it.fields ?? {}
  return {
    ...old,
    key: it.key,
    summary: String(f.summary ?? ''),
    type: String(f.issuetype?.name ?? ''),
    status: String(f.status?.name ?? ''),
    statusCat: String(f.status?.statusCategory?.key ?? ''),
    priority: String(f.priority?.name ?? ''),
    resolution: String(f.resolution?.name ?? ''),
    assignee: String(f.assignee?.displayName ?? ''),
    reporter: String(f.reporter?.displayName ?? ''),
    created: String(f.created ?? '').slice(0, 10),
    source: old?.source || 'jira',
    syncedAt: at,
    /* 붙여 둔 시험은 **건드리지 않는다.** Sync 는 Jira 쪽 이야기를
       새로 받는 것이지, 사람이 이어 둔 것을 지우는 일이 아니다. */
    tcs: old?.tcs ?? [],
  }
}

/** 언제 받아 왔나 — 「09-02 11:20」 */
function stamp(iso: string): string {
  const s = String(iso || '')
  if (s.length < 16) return ''
  return `${s.slice(5, 10).replace('-', '.')} ${s.slice(11, 16)}`
}

/** Jira 가 준 HTML 을 화면에 놓기 전에 손본다 — 옛 화면(_rlsJiraHtml)과 같은 규칙.
 *
 *  · `<script>` 와 `on…` 속성은 걷는다 — 남이 쓴 글이 내 화면에서 돌면 안 된다
 *  · `<img src>` 는 인증 프록시로 돌린다 — 브라우저는 Jira 에 로그인해 있지 않아
 *    그냥 두면 첨부 그림이 전부 깨진다
 *  · 상대 링크는 절대로 펴고 새 탭에서 연다 */
function jiraHtml(html: string, base: string): string {
  let s = String(html || '')
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '')
  s = s.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  s = s.replace(/(<img\b[^>]*?\bsrc=")([^"]+)(")/gi, (m, a: string, u: string, b: string) => {
    if (/^data:/i.test(u)) return m
    const full = /^https?:/i.test(u) ? u : /^\//.test(u) ? base + u : `${base}/${u}`
    return `${a}/api/jira/attachment?url=${encodeURIComponent(full)}${b}`
  })
  s = s.replace(
    /(<a\b[^>]*?\bhref=")(\/[^"]*)(")/gi,
    (_m, a: string, u: string, b: string) => `${a}${base}${u}${b} target="_blank" rel="noopener"`,
  )
  return s
}

/** 이슈 한 줄.
 *
 *  **따로 떼어 memo 로 감쌌다.** 한 줄 안에 다 두었더니 이슈 하나를 펼 때마다
 *  97줄이 전부 다시 그려져 화면이 무거웠다(지적). 이제 눌린 줄만 다시 그린다.
 */
const IssueRow = memo(function IssueRow({
  it, ver, open, tcs, tcById, resultOf, onToggle, onNew, onPick, onDrop, onDetail,
}: {
  onNew: (ver: string, key: string, summary: string) => void
  onPick: (ver: string, key: string) => void
  onDrop: (ver: string, key: string, tcid: string) => void
  onDetail: (key: string) => void
  it: StoredIssue
  ver: string
  open: boolean
  tcs: string[]
  tcById: Map<string, { name: string; kind: string }>
  resultOf: (tcid: string) => string
  onToggle: (k: string) => void
}) {
  const k = String(it.key ?? '')
  return (
    <div className="rls-iblock">
      <div className="rls-irow">
        <span
          className="rls-car"
          role="button"
          tabIndex={0}
          onClick={() => onToggle(`${ver}|${k}`)}
          onKeyDown={(e) => e.key === 'Enter' && onToggle(`${ver}|${k}`)}
        >
          {open ? '⌄' : '›'}
        </span>
        {/* 이슈 키를 누르면 **서랍**이 열린다 — 설명·댓글은 Jira 로 건너가지
            않고 여기서 본다(지시) */}
        <button
          type="button"
          className="rls-key as-btn"
          title="Jira 세부 보기 — 설명·댓글·첨부"
          onClick={() => onDetail(k)}
        >
          {k}
        </button>
        <span className="rls-type">{it.type ?? ''}</span>
        <span className={`rls-stat ${it.statusCat ?? ''}`}>{it.status ?? ''}</span>
        <span className="rls-person">
          <span>보고자</span>
          {it.reporter || '–'}
        </span>
        <span className="rls-person">
          <span>담당자</span>
          {it.assignee || '–'}
        </span>
        <span className="rls-tcn">TC {tcs.length}</span>
      </div>
      <div className="rls-ititle">{it.summary ?? ''}</div>
      {open && (
        <div className="rls-tcs">
          {tcs.map((tcid) => {
            const t = tcById.get(tcid)
            const rv = resultOf(tcid)
            return (
              <div className="rls-tcrow" key={tcid}>
                <button
                  type="button"
                  className="rls-code as-btn"
                  title="이 시험 항목을 엽니다"
                  onClick={() => goto('tc', tcid)}
                >
                  {tcid}
                </button>
                <span className="rls-name">{t?.name ?? '(지워진 시험 항목)'}</span>
                <span className="rls-kind">{t?.kind === '수동' ? 'MANUAL' : t?.kind ? 'AUTO' : ''}</span>
                <span className={`rls-res ${rv.toLowerCase()}`}>{rv ? rv.toUpperCase() : ''}</span>
                <button
                  type="button"
                  className="rls-x"
                  title="이 이슈에서 뺍니다 — 시험 항목 자체는 안 지웁니다"
                  onClick={() => onDrop(ver, k, tcid)}
                >
                  ✕
                </button>
              </div>
            )
          })}
          {!tcs.length && (
            <div className="rls-tcrow rls-empty">이 이슈에 붙은 시험 항목이 없습니다.</div>
          )}
          <div className="rls-tcrow">
            {/* **＋ TC 추가 = 새로 만들어 그 자리에서 작성**(지시).
                만들고 나면 시험 항목 화면으로 넘어간다 — 스텝을 적는 자리는
                거기다. 여기서 반쪽짜리 편집기를 또 만들지 않는다. */}
            <button
              type="button"
              className="rls-add"
              title="이 이슈를 덮을 시험을 새로 만들고, 만든 뒤 그 시험 화면으로 갑니다"
              onClick={() => onNew(ver, k, String(it.summary ?? ''))}
            >
              ＋ TC 추가
            </button>
            <button
              type="button"
              className="rls-add sub"
              title="이미 있는 시험 항목을 이 이슈에 붙입니다"
              onClick={() => onPick(ver, k)}
            >
              이미 있는 것 붙이기
            </button>
          </div>
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
  /** 체크한 버전들 — **Sync 할 것**을 고르는 자리다. 표에 서는 것은
      「Sync 한 버전」 이지 여기서 체크한 것이 아니다. */
  const [vers, setVers] = useState<string[]>([])
  const [verOpen, setVerOpen] = useState(false)
  /** 이미 있는 시험 붙이는 창 · 새로 만드는 창 · Jira 세부 서랍 */
  const [addTo, setAddTo] = useState<{ ver: string; key: string } | null>(null)
  const [newTo, setNewTo] = useState<{ ver: string; key: string; summary: string } | null>(null)
  const [detail, setDetail] = useState('')
  /** Sync 진행 — 「R1.1.2 (1/3)」. 몇 개 중 몇 번째인지 안 보이면 멈춘 줄 안다 */
  const [busy, setBusy] = useState('')

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
   *  정해 둔 것이 그대로 온다. */
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
  /** Jira 주소 — 서랍의 그림·링크를 절대 주소로 펴는 데 쓴다 */
  const jbase = useMemo(() => String(cfgQ.data?.url ?? '').replace(/\/+$/, ''), [cfgQ.data])

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

  /* ── 쌓아 둔 것 — 이슈·이슈↔TC 연결이 **여기 한 곳**에 있다 ── */
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

  const store = useMemo(() => sumQ.data?.releases ?? ({} as Store), [sumQ.data])

  /* ── Sync — 받은 것을 **저장한다** ── */

  /** 저장하기 직전에 **서버에서 다시 읽어** 그 위에 얹는다.
   *
   *  `/api/release-summary` 는 통째로 덮는 통로다. 손에 든 사본으로 쓰면
   *  ① 그 사이 남이 저장한 것이 사라지고(둘이 같이 보는 화면이다)
   *  ② 아직 못 읽은 채로 눌리면 **다른 프로젝트 것까지 빈 값으로 덮는다.**
   *  한 번 더 읽는 이 한 겹이 그 둘을 다 막는다. */
  const readStore = async (): Promise<Store> => {
    const r = await apiFetch('/api/release-summary')
    if (!r.ok) throw new Error('저장된 것을 읽지 못했습니다')
    const j = (await r.json()) as { releases?: unknown }
    const rel = j?.releases
    return (rel && typeof rel === 'object' && !Array.isArray(rel) ? rel : {}) as Store
  }

  /** 한 버전의 이슈를 Jira 에서 받는다. 이 세 종류만(지시) — 나머지는
   *  시험으로 덮을 거리가 아니라 이 화면에 설 까닭이 없다. Jira 에서
   *  걸러 오므로 받는 양도 그만큼 준다. */
  const fetchVer = async (p: string, ver: string): Promise<JiraIssue[]> => {
    const types = KINDS.map((k) => `"${k}"`).join(', ')
    const jql = `project = ${p} AND fixVersion = "${ver}" AND issuetype in (${types}) ORDER BY key DESC`
    const f = 'summary,status,issuetype,priority,resolution,reporter,assignee,created,fixVersions'
    const r = await apiFetch(
      `/api/jira/search-all?jql=${encodeURIComponent(jql)}&fields=${encodeURIComponent(f)}`,
    )
    if (!r.ok) throw new Error('이슈를 불러오지 못했습니다')
    const j = (await r.json()) as { ok?: boolean; issues?: JiraIssue[]; error?: string }
    if (j.error) throw new Error(String(j.error))
    return j.issues ?? []
  }

  /** 버전 몇 개를 받아 **한 번에** 저장한다.
   *
   *  버전마다 저장하면 그 사이에 남이 저장한 것을 덮는다 — 다 받아 놓고
   *  한 번만 쓴다. 실패한 버전은 건너뛰고 까닭을 말한다(하나가 막혔다고
   *  나머지까지 버릴 일이 아니다). */
  const syncVers = useCallback(
    async (list: string[]) => {
      if (!proj || !list.length || busy) return
      /* 먼저 **다 받는다.** 받는 중간에 저장하면, 뒤 버전이 실패했을 때
         절반만 반영된 채로 남는다. */
      const got: Array<[string, JiraIssue[]]> = []
      const bad: string[] = []
      let n = 0
      for (const ver of list) {
        n += 1
        setBusy(`${ver} (${n}/${list.length})`)
        try {
          got.push([ver, await fetchVer(proj, ver)])
        } catch {
          bad.push(ver)
        }
      }
      if (got.length) {
        setBusy('저장 중…')
        try {
          const next = await readStore()
          for (const [ver, arr] of got) {
            const at = new Date().toISOString()
            const bag: Record<string, StoredIssue> = { ...(next[`${proj}@@${ver}`] ?? {}) }
            const seen = new Set<string>()
            for (const it of arr) {
              if (!it?.key) continue
              seen.add(it.key)
              bag[it.key] = shrink(it, at, bag[it.key])
            }
            /* Jira 에서 이 버전이 떨어진 이슈는 뺀다 — 안 빼면 옮겨 간 이슈가
               옛 버전에 영영 남는다. **다만 붙여 둔 시험이 있으면 남긴다**:
               사람이 이어 둔 것을 Sync 가 조용히 지우면 안 된다. */
            for (const k of Object.keys(bag)) {
              if (seen.has(k)) continue
              if ((bag[k]?.tcs ?? []).length) continue
              delete bag[k]
            }
            next[`${proj}@@${ver}`] = bag
          }
          await apiFetch('/api/release-summary', {
            method: 'POST',
            body: JSON.stringify({ releases: next }),
          })
          await qc.invalidateQueries({ queryKey: ['release-summary'] })
        } catch {
          window.alert('가져온 것을 저장하지 못했습니다')
        }
      }
      setBusy('')
      if (bad.length) window.alert(`Jira 를 읽지 못한 버전: ${bad.join(', ')}`)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [proj, busy, qc],
  )

  /** 이 버전을 표에서 치운다 — 붙여 둔 시험까지 사라지므로 한 번 묻는다 */
  const dropVer = useCallback(
    async (ver: string) => {
      const bag = store[`${proj}@@${ver}`] ?? {}
      const tcN = Object.values(bag).reduce((a, x) => a + (x?.tcs ?? []).length, 0)
      if (
        !window.confirm(
          `${ver} 를 이 화면에서 치웁니다.\n이슈 ${Object.keys(bag).length}건${
            tcN ? ` · 붙여 둔 시험 ${tcN}건` : ''
          } 이 함께 사라집니다.\n(Jira 는 그대로입니다 — 다시 Sync 하면 이슈는 돌아옵니다)`,
        )
      )
        return
      const next: Store = await readStore()
      delete next[`${proj}@@${ver}`]
      await apiFetch('/api/release-summary', {
        method: 'POST',
        body: JSON.stringify({ releases: next }),
      })
      await qc.invalidateQueries({ queryKey: ['release-summary'] })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [proj, qc],
  )

  /* ── 쌓아 둔 것에서 표를 세운다 ── */

  /** **Sync 한 버전** — 옛 화면(_rlsProjVers)과 같다. 표에 서는 것은
   *  체크한 것이 아니라 가져와 둔 것이다. */
  const savedVers = useMemo(() => {
    const pre = `${proj}@@`
    return Object.keys(store)
      .filter((k) => k.startsWith(pre) && Object.keys(store[k] ?? {}).length)
      .map((k) => k.slice(pre.length))
      .sort((a, b) => String(b).localeCompare(String(a), undefined, { numeric: true }))
  }, [store, proj])

  /** 처음 들어왔을 때 **가져와 둔 버전에 체크를 해 둔다** — 위 Sync 를
   *  그냥 누르면 보고 있는 것이 새로 고쳐진다. */
  const [primed, setPrimed] = useState('')
  useEffect(() => {
    if (!proj || sumQ.isLoading || primed === proj) return
    setPrimed(proj)
    setVers(savedVers)
  }, [proj, savedVers, sumQ.isLoading, primed])

  /** 버전 이름 → Jira 가 준 곁들이(배포 여부·날짜). 없으면 이름만 쓴다 */
  const verMeta = useMemo(() => {
    const m = new Map<string, JiraVersion>()
    for (const v of verQ.data?.versions ?? []) m.set(String(v.name ?? ''), v)
    return m
  }, [verQ.data])

  /** 버전별 이슈 — 저장된 것에서 꺼낸다. 제목·유형·시험이 다 없는 빈
   *  껍데기는 안 보인다(옛 화면과 같은 규칙). */
  const byVer = useMemo(() => {
    const m = new Map<string, StoredIssue[]>()
    for (const vn of savedVers) {
      const bag = store[`${proj}@@${vn}`] ?? {}
      const arr = Object.entries(bag)
        .map(([k, v]) => ({ ...(v ?? {}), key: String(v?.key ?? k) }))
        .filter((o) => String(o.summary ?? '').trim() || o.type || (o.tcs ?? []).length)
        .sort((a, b) => String(a.key).localeCompare(String(b.key), undefined, { numeric: true }))
      m.set(vn, arr)
    }
    return m
  }, [savedVers, store, proj])

  const opts = useMemo(() => {
    const t = new Set<string>()
    const s = new Set<string>()
    for (const arr of byVer.values())
      for (const it of arr) {
        if (it.type) t.add(String(it.type))
        if (it.status) s.add(String(it.status))
      }
    const srt = (a: string, b: string) => a.localeCompare(b, 'ko')
    return { types: [...t].sort(srt), stats: [...s].sort(srt) }
  }, [byVer])

  const keep = (it: StoredIssue) =>
    (!fType || String(it.type ?? '') === fType) && (!fStat || String(it.status ?? '') === fStat)

  const tree = useMemo(() => {
    const g = new Map<string, string[]>()
    for (const vn of savedVers) {
      const op = operatorOf(vn)
      if (fOp && op !== fOp) continue
      const arr = g.get(op)
      if (arr) arr.push(vn)
      else g.set(op, [vn])
    }
    return [...g.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ko'))
  }, [savedVers, fOp])

  const ops = useMemo(() => [...new Set(savedVers.map((v) => operatorOf(v)))].sort(), [savedVers])

  const resultOf = useCallback(
    (tcid: string) => String((lastQ.data ?? {})[tcid]?.result ?? ''),
    [lastQ.data],
  )

  /** 이슈키 → 붙은 TC. **한 번 만들어 두고 같은 배열을 계속 준다.**
   *  매 렌더마다 새 배열을 만들어 넘기면 memo 가 「달라졌다」 고 보고
   *  99줄을 다 다시 그린다 — memo 를 걸어 놓고 무의미해진다. */
  const tcMap = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const [vn, arr] of byVer)
      for (const it of arr) {
        const list = (it.tcs ?? []).map(tcidOf).filter(Boolean)
        if (list.length) m.set(`${vn}|${String(it.key ?? '')}`, list)
      }
    return m
  }, [byVer])

  /** 버전마다의 이슈 수·TC 수·마지막 Sync 를 **한 번만** 센다. */
  const stat = useMemo(() => {
    const m = new Map<string, { n: number; tc: number; at: string }>()
    for (const [vn, arr] of byVer) {
      const kept = arr.filter(keep)
      let tc = 0
      let at = ''
      for (const it of kept) tc += (tcMap.get(`${vn}|${String(it.key ?? '')}`) ?? EMPTY).length
      for (const it of arr) {
        const s = String(it.syncedAt ?? '')
        if (s > at) at = s
      }
      m.set(vn, { n: kept.length, tc, at })
    }
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byVer, fType, fStat, tcMap])

  /** 이슈에 붙은 TC 를 고쳐 저장한다. 자료 모양은 옛 화면 그대로다 —
   *  `프로젝트@@버전` 안에 이슈키별 `{tcs:[…]}`. 읽은 것 **위에 얹어** 보낸다. */
  const saveTcs = useCallback(
    async (ver: string, key: string, tcs: string[]) => {
      const k = `${proj}@@${ver}`
      const cur = await readStore()
      const next: Store = {
        ...cur,
        [k]: { ...(cur[k] ?? {}), [key]: { ...(cur[k]?.[key] ?? {}), key, tcs } },
      }
      await apiFetch('/api/release-summary', {
        method: 'POST',
        body: JSON.stringify({ releases: next }),
      })
      await qc.invalidateQueries({ queryKey: ['release-summary'] })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [proj, qc],
  )
  const openPick = useCallback((ver: string, key: string) => setAddTo({ ver, key }), [])
  const openNew = useCallback(
    (ver: string, key: string, summary: string) => setNewTo({ ver, key, summary }),
    [],
  )
  const openDetail = useCallback((key: string) => setDetail(key), [])
  const dropTc = useCallback(
    (ver: string, key: string, tcid: string) => {
      const cur = tcMap.get(`${ver}|${key}`) ?? EMPTY
      void saveTcs(ver, key, cur.filter((x) => x !== tcid))
    },
    [tcMap, saveTcs],
  )

  const err = projQ.data?.error || verQ.data?.error

  return (
    <div className="rls">
      {/* ── 위 줄 — **프로젝트와 버전까지만** 불러온다(지시).
             세부는 Sync 를 눌러야 오고, 온 것은 저장된다. ── */}
      <div className="rls-top">
        <b className="rls-h1">Releases</b>
        <select
          className="rls-sel"
          value={proj}
          onChange={(e) => {
            setProj(e.target.value)
            setVers([])
            setPrimed('')
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
        {/* 버전은 **체크박스로 여러 개**(지시). 고르개 한 줄로는 상태·날짜·
            설명을 같이 낼 수 없어, 눌러서 펴는 판으로 낸다. */}
        <div className="rls-vpick">
          <button
            type="button"
            className="rls-sel ver"
            disabled={!proj || verQ.isLoading}
            onClick={() => setVerOpen((v) => !v)}
            title="Sync 할 버전 고르기"
          >
            {verQ.isLoading
              ? '버전 불러오는 중…'
              : vers.length
                ? `버전 ${vers.length}개 — ${vers.slice(0, 2).join(', ')}${vers.length > 2 ? ' 외' : ''}`
                : '(버전 선택)'}
            <i>⌄</i>
          </button>
          {verOpen && (
            <div className="rls-vlist">
              <div className="rls-vhead">
                <span className="c1">버전</span>
                <span className="c2">상태</span>
                <span className="c3">시작일</span>
                <span className="c4">배포일</span>
                <span className="c5">설명</span>
              </div>
              <div className="rls-vbody">
                {(verQ.data?.versions ?? [])
                  .filter((v) => !v.archived)
                  .map((v) => {
                    const vn = String(v.name ?? '')
                    const on = vers.includes(vn)
                    const have = savedVers.includes(vn)
                    return (
                      <label key={vn} className={`rls-vrowp${on ? ' on' : ''}`}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={(e) =>
                            setVers((a) => (e.target.checked ? [...a, vn] : a.filter((x) => x !== vn)))
                          }
                        />
                        <span className="c1" title={vn}>
                          {vn}
                          {have && <b className="rls-have" title="이미 가져와 둔 버전">저장됨</b>}
                        </span>
                        <span className="c2">
                          <i className={v.released ? 'rel' : 'unrel'}>
                            {v.released ? '배포됨' : '미배포'}
                          </i>
                        </span>
                        <span className="c3">{v.startDate || '–'}</span>
                        <span className="c4">{v.releaseDate || '–'}</span>
                        <span className="c5" title={v.description || ''}>
                          {v.description || ''}
                        </span>
                      </label>
                    )
                  })}
              </div>
              <div className="rls-vfoot">
                <span className="rls-cnt">{vers.length}개 고름</span>
                <span className="sp" />
                <button type="button" onClick={() => setVers([])}>
                  전부 지우기
                </button>
                <button type="button" onClick={() => setVerOpen(false)}>
                  닫기
                </button>
              </div>
            </div>
          )}
        </div>
        <button
          type="button"
          className="rls-sync"
          disabled={!proj || !vers.length || !!busy}
          title={
            !proj || !vers.length
              ? '프로젝트와 버전을 먼저 고르세요'
              : `고른 버전 ${vers.length}개의 이슈를 Jira 에서 가져와 저장합니다`
          }
          onClick={() => void syncVers(vers)}
        >
          {busy ? `가져오는 중… ${busy}` : '↻ Sync'}
        </button>
        {/* 거르개 셋을 위 줄로 올렸다(지시) — 줄 하나가 통째로 없어진다 */}
        <select className="rls-f" value={fOp} onChange={(e) => setFOp(e.target.value)}>
          <option value="">사업자 전체</option>
          {ops.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <select className="rls-f" value={fType} onChange={(e) => setFType(e.target.value)}>
          <option value="">이슈유형 전체</option>
          {opts.types.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <select className="rls-f" value={fStat} onChange={(e) => setFStat(e.target.value)}>
          <option value="">상태 전체</option>
          {opts.stats.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <span className="sp" />
        <span className="rls-kinds" title="이 세 가지만 가져옵니다">
          {KINDS.join(' · ')}
        </span>
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
        {!!allProjects.length && !sumQ.isLoading && !savedVers.length && (
          <div className="rls-none">
            프로젝트와 버전을 고르고 <b>Sync</b> 를 누르면 그 버전의 이슈를 가져와 <b>저장</b>합니다.
            <br />
            한 번 가져온 것은 다시 들어와도 그대로 있습니다.
          </div>
        )}
        {sumQ.isLoading && <div className="rls-none">불러오는 중…</div>}
        {tree.map(([op, list]) => {
          const nIss = list.reduce((a, v) => a + (stat.get(v)?.n ?? 0), 0)
          const oOpen = !open.has(`op:${op}`)
          return (
            <div key={op}>
              <div className="rls-grow" role="button" tabIndex={0}
                onClick={() => toggle(open, `op:${op}`, setOpen)}
                onKeyDown={(e) => e.key === 'Enter' && toggle(open, `op:${op}`, setOpen)}>
                <span className="rls-car">{oOpen ? '⌄' : '›'}</span>
                <b>{op}</b>
                <span className="rls-right">
                  <span>버전 {list.length}</span>
                  <span>이슈 {nIss}</span>
                </span>
              </div>
              {oOpen &&
                list.map((vn) => {
                  const v = verMeta.get(vn)
                  const st0 = stat.get(vn) ?? { n: 0, tc: 0, at: '' }
                  const vOpen = open.has(`v:${vn}`)
                  /* 접혀 있으면 이슈 목록을 **만들지도 않는다** — 97건을
                     걸러 놓고 안 그리는 것은 그냥 버리는 일이다. */
                  const rows = vOpen ? (byVer.get(vn) ?? []).filter(keep) : ([] as StoredIssue[])
                  return (
                    <div key={vn}>
                      <div className="rls-vrow" role="button" tabIndex={0}
                        onClick={() => toggle(open, `v:${vn}`, setOpen)}
                        onKeyDown={(e) => e.key === 'Enter' && toggle(open, `v:${vn}`, setOpen)}>
                        <span className="rls-car">{vOpen ? '⌄' : '›'}</span>
                        <span className="rls-vname">{vn}</span>
                        {v?.released && <span className="rls-rel">released</span>}
                        <span className="rls-right">
                          {st0.at && (
                            <span className="rls-at" title="마지막으로 Jira 에서 가져온 때">
                              {stamp(st0.at)}
                            </span>
                          )}
                          <span>Issues {st0.n}</span>
                          <span>TC {st0.tc}</span>
                          {v?.releaseDate && <span>{v.releaseDate}</span>}
                          {/* 이 버전만 다시 가져온다(지시) — 한 버전 보려고
                              고른 것 전부를 다시 받지 않는다 */}
                          <button
                            type="button"
                            className="rls-vb"
                            disabled={!!busy}
                            title={`${vn} 의 이슈만 Jira 에서 다시 가져옵니다`}
                            onClick={(e) => {
                              e.stopPropagation()
                              void syncVers([vn])
                            }}
                          >
                            ↻
                          </button>
                          <button
                            type="button"
                            className="rls-vb del"
                            disabled={!!busy}
                            title={`${vn} 을 이 화면에서 치웁니다`}
                            onClick={(e) => {
                              e.stopPropagation()
                              void dropVer(vn)
                            }}
                          >
                            ✕
                          </button>
                        </span>
                      </div>
                      {vOpen &&
                        rows.map((it) => (
                          <IssueRow
                            key={`${vn}|${String(it.key ?? '')}`}
                            it={it}
                            ver={vn}
                            open={openIssue.has(`${vn}|${String(it.key ?? '')}`)}
                            tcs={tcMap.get(`${vn}|${String(it.key ?? '')}`) ?? EMPTY}
                            tcById={tcById}
                            resultOf={resultOf}
                            onToggle={toggleIssue}
                            onNew={openNew}
                            onPick={openPick}
                            onDrop={dropTc}
                            onDetail={openDetail}
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

      {detail && (
        <IssueDrawer
          ikey={detail}
          base={jbase}
          onClose={() => setDetail('')}
        />
      )}

      {addTo && (
        <TcPick
          title={`${addTo.key} 에 이미 있는 시험 붙이기`}
          have={tcMap.get(`${addTo.ver}|${addTo.key}`) ?? EMPTY}
          tcs={tcQ.data?.tcs ?? []}
          onClose={() => setAddTo(null)}
          onSave={async (next) => {
            await saveTcs(addTo.ver, addTo.key, next)
            setAddTo(null)
          }}
        />
      )}

      {/* **＋ TC 추가.** 시험 항목 화면의 그 창을 그대로 부른다 — 편집기를
          두 벌 만들면 한쪽은 반드시 뒤처진다(모델 고정·커스텀 필드 규칙이
          거기 다 들어 있다). 만들고 나면 이슈에 붙이고 그 시험을 연다. */}
      {newTo && (
        <TcForm
          editing={null}
          presetName={newTo.summary}
          onCreated={(tcid) => {
            const cur = tcMap.get(`${newTo.ver}|${newTo.key}`) ?? EMPTY
            void saveTcs(newTo.ver, newTo.key, [...cur, tcid]).then(() => goto('tc', tcid))
          }}
          onClose={() => setNewTo(null)}
        />
      )}
    </div>
  )
}

/** **Jira 세부 서랍**(지시).
 *
 *  이슈 키를 누르면 오른쪽에서 열린다. 설명·댓글은 Jira 가 렌더한 HTML
 *  (renderedFields)을 그대로 쓴다 — 표·코드블록·그림이 Jira 에서 보던
 *  모양 그대로 선다. 그림은 인증 프록시를 거친다(브라우저는 Jira 에
 *  로그인해 있지 않다).
 */
function IssueDrawer({ ikey, base, onClose }: { ikey: string; base: string; onClose: () => void }) {
  const q = useQuery({
    queryKey: ['jira-issue', ikey],
    staleTime: 60_000,
    queryFn: async () => {
      const r = await apiFetch(`/api/jira/issue/${encodeURIComponent(ikey)}`)
      if (!r.ok) throw new Error('이슈 세부를 불러오지 못했습니다')
      return (await r.json()) as {
        ok?: boolean
        error?: string
        fields?: Record<string, unknown>
        renderedFields?: Record<string, unknown>
      }
    },
  })

  /* Esc 로 닫는다 — 서랍은 덮는 것이라 빠져나갈 길이 손에 있어야 한다 */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const f = (q.data?.fields ?? {}) as Record<string, never>
  const rf = (q.data?.renderedFields ?? {}) as Record<string, never>
  const pick = (o: unknown, k: string): string =>
    String((o as Record<string, unknown> | undefined)?.[k] ?? '')
  /** 상태 칸의 색은 statusCategory.key 로 갈린다 — 한 겹 더 들어가 있다 */
  const scat = String(
    ((f.status as Record<string, unknown> | undefined)?.statusCategory as
      | Record<string, unknown>
      | undefined)?.key ?? '',
  )
  const descHtml = String(rf.description ?? '')
  const descText = String(f.description ?? '')
  const cmts = ((f.comment as { comments?: unknown[] } | undefined)?.comments ?? []) as Array<
    Record<string, unknown>
  >
  const cmtHtml = ((rf.comment as { comments?: unknown[] } | undefined)?.comments ?? []) as Array<
    Record<string, unknown>
  >
  const atts = (f.attachment ?? []) as Array<Record<string, unknown>>
  const err = q.error ? String(q.error) : q.data && q.data.ok === false ? String(q.data.error ?? '') : ''

  return (
    <div className="rls-ovl" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rls-drawer" role="dialog" aria-modal="true" aria-label={`${ikey} 세부`}>
        <header>
          <b>{ikey}</b>
          <span className={`rls-stat ${scat}`}>{pick(f.status, 'name')}</span>
          <span className="sp" />
          {base && (
            <a className="rls-jlink" href={`${base}/browse/${ikey}`} target="_blank" rel="noopener">
              Jira 에서 열기 ↗
            </a>
          )}
          <button type="button" className="rls-dx" onClick={onClose} title="닫기 (Esc)">
            ✕
          </button>
        </header>

        <div className="rls-dbody">
          {q.isLoading && <div className="rls-none">불러오는 중…</div>}
          {!!err && <div className="rls-err">{err}</div>}

          {!q.isLoading && !err && (
            <>
              <div className="rls-dtitle">{String(f.summary ?? '')}</div>
              <div className="rls-dmeta">
                <span>유형</span>
                <b>{pick(f.issuetype, 'name') || '–'}</b>
                <span>우선순위</span>
                <b>{pick(f.priority, 'name') || '–'}</b>
                <span>보고자</span>
                <b>{pick(f.reporter, 'displayName') || '–'}</b>
                <span>담당자</span>
                <b>{pick(f.assignee, 'displayName') || '–'}</b>
                <span>버전</span>
                <b>
                  {((f.fixVersions ?? []) as Array<Record<string, unknown>>)
                    .map((v) => String(v?.name ?? ''))
                    .filter(Boolean)
                    .join(', ') || '–'}
                </b>
                <span>고침</span>
                <b>{String(f.updated ?? '').replace('T', ' ').slice(0, 16) || '–'}</b>
              </div>

              <h4 className="rls-dh">설명</h4>
              {descHtml.trim() ? (
                <div
                  className="rls-jira"
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{ __html: jiraHtml(descHtml, base) }}
                />
              ) : (
                <div className="rls-dtext">{descText.trim() || '(설명 없음)'}</div>
              )}

              <h4 className="rls-dh">댓글 {cmts.length}</h4>
              {!cmts.length && <div className="rls-dtext">(댓글 없음)</div>}
              {cmts.map((c, i) => {
                const who = pick(c.author, 'displayName')
                const when = String(c.updated ?? c.created ?? '').replace('T', ' ').slice(0, 16)
                const bh = String((cmtHtml[i] as Record<string, unknown> | undefined)?.body ?? '')
                return (
                  <div className="rls-cmt" key={String(c.id ?? i)}>
                    <div className="rls-cmth">
                      <i>{who.slice(0, 1) || '?'}</i>
                      <b>{who || '–'}</b>
                      <span>{when}</span>
                    </div>
                    {bh.trim() ? (
                      <div
                        className="rls-jira"
                        // eslint-disable-next-line react/no-danger
                        dangerouslySetInnerHTML={{ __html: jiraHtml(bh, base) }}
                      />
                    ) : (
                      <div className="rls-dtext">{String(c.body ?? '')}</div>
                    )}
                  </div>
                )
              })}

              {!!atts.length && (
                <>
                  <h4 className="rls-dh">첨부 {atts.length}</h4>
                  {atts.map((a, i) => {
                    const url = String(a?.content ?? '')
                    return (
                      <a
                        className="rls-att"
                        key={String(a?.id ?? i)}
                        href={`/api/jira/attachment?url=${encodeURIComponent(url)}`}
                        target="_blank"
                        rel="noopener"
                      >
                        {String(a?.filename ?? '(이름 없음)')}
                      </a>
                    )
                  })}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** 시험 항목 고르는 창 — 찾아서 체크하고 저장한다.
 *  이슈 하나가 여러 시험으로 덮이는 것이 보통이라 **여러 개**를 고른다. */
function TcPick({
  title,
  have,
  tcs,
  onClose,
  onSave,
}: {
  title: string
  have: string[]
  tcs: Array<{ tcid: string; name?: string; kind?: string }>
  onClose: () => void
  onSave: (next: string[]) => Promise<void>
}) {
  const [pick, setPick] = useState<string[]>(have)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    const arr = n ? tcs.filter((t) => `${t.tcid} ${t.name ?? ''}`.toLowerCase().includes(n)) : tcs
    /* 이미 붙은 것을 위로 — 무엇이 붙어 있는지부터 보인다 */
    return [...arr].sort((a, b) => Number(have.includes(b.tcid)) - Number(have.includes(a.tcid)))
  }, [tcs, q, have])

  return (
    <div className="rls-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rls-modal" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <b>{title}</b>
          <span className="sp" />
          <button type="button" onClick={onClose}>
            ✕
          </button>
        </header>
        <input
          className="rls-find"
          value={q}
          placeholder="ID · 제목으로 찾기"
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="rls-mlist">
          {shown.map((t) => {
            const on = pick.includes(t.tcid)
            return (
              <label key={t.tcid} className={`rls-mrow${on ? ' on' : ''}`}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) =>
                    setPick((a) =>
                      e.target.checked ? [...a, t.tcid] : a.filter((x) => x !== t.tcid),
                    )
                  }
                />
                <span className="rls-code">{t.tcid}</span>
                <span className="rls-name">{t.name ?? ''}</span>
                <span className="rls-kind">{t.kind === '수동' ? 'MANUAL' : t.kind ? 'AUTO' : ''}</span>
              </label>
            )
          })}
          {!shown.length && <div className="rls-none">찾는 시험 항목이 없습니다.</div>}
        </div>
        <footer>
          <span className="rls-cnt">{pick.length}건 고름</span>
          <span className="sp" />
          <button type="button" onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className="pri"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void onSave(pick).finally(() => setBusy(false))
            }}
          >
            {busy ? '저장 중…' : '저장'}
          </button>
        </footer>
      </div>
    </div>
  )
}
