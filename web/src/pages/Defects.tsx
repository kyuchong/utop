import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch, type MeUser } from '@/api/client'
import { onWs } from '@/api/wsBus'
import { onGoto } from '@/api/goto'
import { prefGet, prefSet } from '@/lib/prefs'
import Resizer, { useResizableWidth } from '@/components/Resizer'
import DefectDialog, { type DefectRec } from '@/components/cycle/DefectDialog'
import { JiraStatusChip, jiraIssueUrl, jiraStatusText, useJiraBase, useJiraStatus } from '@/lib/jiraStatus'
import { EffortBody } from '@/pages/EffortPlan'
import { TI } from '@/components/effort/icons'
import { ensureViews, type EfColumn, type EfDoc, type EfRow, type EfView } from '@/components/effort/model'
import '@/components/effort/Effort.css'
import './Defects.css'

/**
 * Defects — 등록된 결함이 모이는 화면.
 *
 * 플랜 항목에서 「결함 등록」 을 누르면 그 자리에서 UTOP 에 쌓인다. 여기서
 * 그것들을 한눈에 보고, 골라서 「지라에 등록」 을 눌러 Jira 이슈로 민다.
 *
 * 화면은 **Effort Plan 양식**이다(지시: Jira Issue 에 한 것처럼) — 왼쪽 목록 카드(상태: 전체·미해결·지라 등록·닫힘)
 * + 오른쪽 본문 카드(제목 · 보기 탭 · 도구 줄 · 표/차트 · 바닥줄 계산). 본문은 EffortBody 를 빌린다(host).
 * 결함 값은 여기서 못 고친다 — 고치는 자리는 결함 창이다(ID 를 누르면 연다).
 *
 * 열 배치·폭·보기(탭마다 검색·필터·정렬·그룹·숨긴 열·계산)는 계정을 따라간다(utop.defects.ef).
 */

/** 상태 — 왼쪽 목록. 서버 거르기(db.defect_list)와 같은 뜻으로 화면에서 가른다 */
const TABS: Array<{ k: string; label: string; ok: (s: string) => boolean }> = [
  { k: '', label: '전체', ok: () => true },
  // 「미해결」 은 아직 닫히지도 지라에 오르지도 않은 것 — 자동 등록분(New)도 여기
  { k: 'open', label: '미해결', ok: (s) => s !== 'closed' && s !== 'pushed' },
  { k: 'pushed', label: '지라 등록', ok: (s) => s === 'pushed' },
  { k: 'closed', label: '닫힘', ok: (s) => s === 'closed' },
]

/** "2026-08-09 14:30" — 글자 그대로 정렬해도 시간 차례가 맞는 꼴 */
function fmtDate(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 열 — 등록 양식과 같은 차례. `def` 는 처음에 보이는 열이다. */
const COLS: Array<{ key: string; label: string; type?: 'text' | 'select'; w?: number; def?: boolean }> = [
  { key: 'id', label: 'ID', w: 124, def: true },
  { key: 'jira_project', label: '프로젝트 키', w: 112, def: true },
  { key: 'project_name', label: '프로젝트명', w: 104, def: true },
  { key: 'issue_type', label: '이슈유형', type: 'select', w: 92, def: true },
  { key: 'title', label: '요약', w: 420, def: true },
  { key: 'status', label: '상태', type: 'select', w: 104, def: true },
  { key: 'priority', label: '우선순위', type: 'select', w: 88, def: true },
  { key: 'fix_version', label: '수정버전', w: 130, def: true },
  { key: 'component', label: '구성요소', type: 'select', w: 104, def: true },
  { key: 'reporter', label: '보고자', w: 96, def: true },
  { key: 'created_by', label: '등록자', w: 104, def: true },
  { key: 'created_at', label: '등록일', w: 132, def: true },
  { key: 'tcid', label: '시험 항목', w: 130 },
  { key: 'jira_key', label: 'Jira 키', w: 118 },
]
/** 열 배치·폭·보기 — 계정을 따라간다(SYNC) */
const LAYOUT_KEY = 'utop.defects.ef'
/** 왼쪽에서 고른 상태 — 이 PC 의 보던 자리(SYNC 아님) */
const TAB_KEY = 'utop.defects.tab'
/* 예전 NTable 화면의 숨긴 열 — 처음 한 번 새 양식으로 옮겨 받는다 */
const OLD_COL_KEY = 'utop.defects.cols'

interface DfLayout {
  order?: string[]
  w?: Record<string, number>
  views?: EfView[]
  cur?: string
}

function prefJson<T>(key: string, dflt: T): T {
  try {
    const v = JSON.parse(prefGet(key) || 'null') as unknown
    return v == null ? dflt : (v as T)
  } catch {
    return dflt
  }
}

export default function Defects(_: { me?: MeUser | null }) {
  const [tab, setTabRaw] = useState(() => {
    const t = prefGet(TAB_KEY) || ''
    return TABS.some((x) => x.k === t) ? t : ''
  })
  const setTab = (k: string) => {
    setTabRaw(k)
    prefSet(TAB_KEY, k)
  }
  const [open, setOpen] = useState<DefectRec | null>(null)
  /** 목록 판 — 끌어 맞춘 폭 · 접어 둠(Effort Plan 과 같은 부품, 열쇠는 따로) */
  const [sideW, setSideW] = useResizableWidth('utop.defects.sideW', 170, 140, 360)
  const [sideHide, setSideHide] = useState(() => prefGet('utop.defects.sideHide') === '1')
  const toggleSide = useCallback(() => {
    setSideHide((h) => {
      prefSet('utop.defects.sideHide', h ? '0' : '1')
      return !h
    })
  }, [])
  const layoutRef = useRef<HTMLDivElement>(null)
  const [flash, setFlash] = useState('')

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['defects', 'all'],
    /* **들어올 때마다 새로 받는다**(지적: 사이클에서 지웠는데 여기 남아
       있다). 결함은 사이클 화면에서도 만들어지고 지워지므로, 캐시를 그대로
       보이면 이 화면만 옛 목록을 들고 있게 된다.
       상태는 왼쪽 목록이 화면에서 가른다 — 숫자를 함께 세려고 전부 받는다 */
    refetchOnMount: 'always',
    queryFn: async () => {
      const r = await apiFetch('/api/defects?limit=5000')
      const j = (await r.json()) as { defects: DefectRec[] }
      return j.defects ?? []
    },
    staleTime: 10_000,
  })

  /* 결함 소식을 듣고 그 자리에서 다시 받는다(지시: 실시간) — 사이클
     화면에서 만들어지거나 지워진 것이 여기에도 바로 선다. */
  useEffect(() => onWs((m) => { if (m.type === 'defect_updated') void refetch() }), [refetch])

  /* **다른 화면이 짚어 보낸 결함**을 연다(지시: 사이클 결함 탭의 ID).
     목록이 아직 안 왔을 수 있어 id 를 들고 기다렸다가, 오면 그때 편다. */
  const [wantId, setWantId] = useState(() => {
    try {
      /* **주소에 있을 때만 연다.** 계정에 남겨 둔 값(utop.defect.open)까지
         읽었더니, 한 번 쓰고 버릴 값이 그대로 남아 이 화면에 들어올 때마다
         창이 저절로 열렸다(지적: 새로고침하면 팝업이 떠 있다).
         남아 있으면 그 자리에서 비운다 — 다음에 또 열지 않게. */
      const fromUrl = new URLSearchParams(window.location.search).get('defect') ?? ''
      if (String(prefGet('utop.defect.open') ?? '')) prefSet('utop.defect.open', '')
      return fromUrl
    } catch {
      return ''
    }
  })
  useEffect(() => onGoto((kind, id) => { if (kind === 'defect') setWantId(id) }), [])
  useEffect(() => {
    if (!wantId) return
    const d = (data ?? []).find((x) => String(x.id ?? '') === wantId)
    if (!d) return
    setOpen(d)
    setWantId('')
    try {
      prefSet('utop.defect.open', '')
    } catch {
      /* 사생활 보호 모드 */
    }
  }, [wantId, data])

  /** 올라간 이슈들의 **지금 지라 상태** — 표의 「상태」 칸이 이것을 쓴다 */
  const jstat = useJiraStatus(useMemo(() => (data ?? []).map((d) => String(d.jira_key ?? '')), [data]))
  /** 지라 주소 — 이슈 열쇠를 누르면 바로 그 이슈로 간다(지시) */
  const jbase = useJiraBase()

  /* 행 — 받아 온 결함 그대로(행 객체는 결함이 다시 올 때만 새로. 지라 상태가 와도 같은 객체에 고쳐 쓴다 —
     새 객체로 바꾸면 표가 「다른 행 묶음」 으로 보고 체크·더 보기를 처음으로 돌린다) */
  const baseRows: EfRow[] = useMemo(
    () =>
      (data ?? []).map((d) => ({
        __id: String(d.id ?? ''),
        id: String(d.id ?? ''),
        /* **등록되면 그 이슈 열쇠**를 세운다(지시). 프로젝트 키(P88)는
           올리기 전에만 뜻이 있고, 올린 뒤에 알고 싶은 것은 「어느
           이슈였나」(P88-4341) 다. 검색·정렬도 이 값을 본다. */
        jira_project: d.jira_key || d.jira_project || '',
        project_name: d.project_name ?? '',
        issue_type: d.issue_type ?? '',
        title: d.title || d.tc_name || '',
        status: '',
        /* 원본 상태 — 왼쪽 목록(미해결·지라 등록·닫힘)과 닫힘 칩이 본다 */
        status_raw: d.status ?? '',
        jira_key: d.jira_key ?? '',
        priority: d.priority ?? '',
        fix_version: d.fix_version ?? '',
        component: d.component ?? '',
        reporter: d.reporter ?? '',
        created_by: d.created_by ?? '',
        created_at: fmtDate(d.created_at),
        tcid: d.tcid ?? '',
      })),
    [data],
  )
  const [ver, setVer] = useState(0)
  useEffect(() => {
    /* **값 자체가 지라 상태**다(지시). 칩만 바꾸고 값을 open 으로 두면
       거르기·정렬·검색이 사람이 보는 것과 다른 것을 본다 */
    const byId = new Map((data ?? []).map((d) => [String(d.id ?? ''), d]))
    baseRows.forEach((r) => {
      const d = byId.get(String(r.id ?? ''))
      if (d) r.status = jiraStatusText(d, jstat)
    })
    setVer((v) => v + 1)
  }, [baseRows, jstat, data])

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    TABS.forEach((t) => m.set(t.k, baseRows.filter((r) => t.ok(String(r.status_raw ?? ''))).length))
    return m
  }, [baseRows])
  const tabDef = TABS.find((t) => t.k === tab) ?? TABS[0]!
  const rows = useMemo(() => baseRows.filter((r) => tabDef.ok(String(r.status_raw ?? ''))), [baseRows, tabDef])

  // ── 표 문서(Effort 양식) — 열·보기는 계정 설정에서, 행은 받아 온 결함 ──
  const layout = useRef<DfLayout | null>(null)
  if (!layout.current) {
    const saved = prefJson<DfLayout | null>(LAYOUT_KEY, null)
    if (saved) layout.current = saved
    else {
      // 처음 — 예전 표에서 숨겨 둔 열을 옮겨 받는다
      const old = prefJson<string[] | null>(OLD_COL_KEY, null)
      const hidden = old ?? COLS.filter((c) => !c.def).map((c) => c.key)
      layout.current = {
        views: [{ id: 'dv-table', name: '표', type: 'table', ef: { q: '', filters: [], sorting: [], group: '', hidden } }],
        cur: 'dv-table',
      }
    }
  }
  const docRef = useRef<EfDoc | null>(null)
  if (!docRef.current) {
    const L = layout.current
    const columns: EfColumn[] = COLS.map((c) => {
      const nc: EfColumn = { id: c.key, title: c.label, type: c.type ?? 'text', width: c.w, readOnly: true }
      if (c.key === 'id') nc.link = true // ID 를 누르면 결함 창
      const w = L.w?.[c.key]
      if (w) nc.efWidth = w
      return nc
    })
    // 끌어 바꾼 열 차례 — 모르는 열(나중에 더한 것)은 제자리 뒤로
    const at = new Map((L.order ?? []).map((k, i) => [k, i]))
    const pos = (c: EfColumn) => at.get(c.id) ?? 900 + COLS.findIndex((x) => x.key === c.id)
    columns.sort((a, b) => pos(a) - pos(b))
    docRef.current = { columns, pages: { all: { rows: [] } }, years: ['all'], curPage: 'all', betaViews: L.views, curBetaView: L.cur }
    ensureViews(docRef.current)
  }
  const doc = docRef.current
  doc.pages.all!.rows = rows

  /** 열 배치·폭·보기를 계정 설정에 적는다 — 표·차트가 고쳤다(touch)·보기를 옮겼다(redraw) 둘 다 */
  const touch = useCallback(() => {
    const d = docRef.current!
    const L: DfLayout = {
      order: d.columns.map((c) => c.id),
      w: Object.fromEntries(d.columns.filter((c) => c.efWidth).map((c) => [c.id, c.efWidth as number])),
      views: d.betaViews,
      cur: d.curBetaView,
    }
    layout.current = L
    prefSet(LAYOUT_KEY, JSON.stringify(L))
    setVer((v) => v + 1)
  }, [])
  const toast = useCallback((m: string) => {
    setFlash(m)
    window.setTimeout(() => setFlash(''), 2600)
  }, [])

  const onOpen = useCallback((r: EfRow) => setOpen((data ?? []).find((d) => String(d.id ?? '') === String(r.id ?? '')) ?? null), [data])
  const renderCell = useCallback(
    (r: EfRow, c: EfColumn) => {
      /* **이슈로 바로 건너뛴다**(지시) — 열쇠를 눈으로 읽어 지라 검색창에 옮겨 치던 일을 없앤다 */
      if (c.id === 'jira_project') {
        const jk = String(r.jira_key ?? '')
        const url = jiraIssueUrl(jbase, jk)
        if (!jk || !url) return undefined
        return (
          <a
            className="jst-link"
            href={url}
            target="_blank"
            rel="noreferrer"
            title={`지라에서 ${jk} 를 엽니다`}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {jk}
          </a>
        )
      }
      if (c.id === 'status') {
        const jk = String(r.jira_key ?? '')
        return <JiraStatusChip jiraKey={jk} stat={jstat[jk]} closed={String(r.status_raw ?? '') === 'closed'} />
      }
      return undefined
    },
    [jbase, jstat],
  )

  return (
    // 바깥 흰 판 없이 카드 두 장(목록 · 본문) — Effort Plan · Jira Issue 와 같은 꼴
    <section className="ef dfl-ef">
      {!!flash && <div className="ef-toast">{flash}</div>}
      <div className="ef-layout" ref={layoutRef}>
        {!sideHide && (
          <>
            <aside className="ef-side" style={{ flex: `0 0 ${sideW}px` }}>
              <div className="ef-tree-hd">
                <span>상태</span>
              </div>
              <div className="ef-tree" role="tree" aria-label="결함 상태">
                {TABS.map((t) => (
                  <div
                    key={t.k}
                    role="treeitem"
                    tabIndex={0}
                    aria-selected={tab === t.k}
                    className={`ef-tn${tab === t.k ? ' on' : ''}`}
                    onClick={() => setTab(t.k)}
                    onKeyDown={(e) => e.key === 'Enter' && setTab(t.k)}
                  >
                    <span className="ef-tn-tw" />
                    <span className="ef-tn-ic">
                      <TI n={t.k ? 'filter' : 'layout-list'} />
                    </span>
                    <span className="ef-tn-name">{t.label}</span>
                    <em className="ef-tn-n">{counts.get(t.k) ?? 0}</em>
                  </div>
                ))}
                {!isLoading && !baseRows.length && (
                  <div className="dfl-empty">
                    등록된 결함이 없습니다. 플랜 화면에서 부적합 항목의 스텝을 열고 「＋ 결함 등록」 을 누르면 여기에 쌓입니다.
                  </div>
                )}
              </div>
            </aside>
            <Resizer
              label="목록 폭 조절"
              onResize={setSideW}
              getOrigin={() => layoutRef.current?.querySelector('.ef-side')?.getBoundingClientRect().left ?? 0}
            />
          </>
        )}
        <EffortBody
          key={tab || 'all'}
          d={doc}
          name=""
          path={[]}
          ver={ver}
          touch={touch}
          redraw={touch}
          toast={toast}
          save="idle"
          retry={() => {}}
          sideHide={sideHide}
          onToggleSide={toggleSide}
          host={{
            title: (
              <>
                <b>Defects</b>
                <span className="ef-head-sep">·</span>
                <span className="ef-head-name">{tabDef.label}</span>
                {isLoading && <span className="dfl-note">읽는 중…</span>}
              </>
            ),
            headRight: (
              <button type="button" className="ef-btn gh" disabled={isFetching} title="결함 목록을 다시 받습니다" onClick={() => void refetch()}>
                <TI n="refresh" /> {isFetching ? '받는 중…' : '새로고침'}
              </button>
            ),
            viewTypes: ['table', 'chart'],
            csvName: `Defects${tab ? '_' + tabDef.label : ''}.csv`,
            onOpen,
            renderCell,
            pageSize: 200,
          }}
        />
      </div>

      {open && <DefectDialog existing={open} onClose={() => setOpen(null)} onSaved={() => void refetch()} />}
    </section>
  )
}
