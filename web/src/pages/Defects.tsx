import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch, type MeUser } from '@/api/client'
import { prefGet, prefSet } from '@/lib/prefs'
import DefectDialog, { type DefectRec } from '@/components/cycle/DefectDialog'
import NTable from '@/components/ntable/NTable'
import NViews, { type ViewBody, type ViewDef } from '@/components/ntable/NViews'
import { EMPTY_VIEW, type NCalc, type NCol, type NRow, type NView } from '@/components/ntable/types'
import './Defects.css'

/** 상태 탭 */
const TABS: Array<{ k: string; label: string }> = [
  { k: '', label: '전체' },
  { k: 'open', label: '미해결' },
  { k: 'pushed', label: '지라 등록' },
  { k: 'closed', label: '닫힘' },
]

/** "2026-08-09 14:30" */
function fmtDate(iso?: string | null): string {
  if (!iso) return '–'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * Defects — 등록된 결함이 모이는 화면.
 *
 * 플랜 항목에서 「결함 등록」 을 누르면 그 자리에서 UTOP 에 쌓인다. 여기서
 * 그것들을 한눈에 보고, 골라서 「지라에 등록」 을 눌러 Jira 이슈로 민다.
 *
 * 칸은 등록 양식과 같다 — 프로젝트 키·프로젝트명·이슈유형·우선순위·수정버전·
 * 구성요소·보고자·등록자·등록일.
 */
/** 열 — 등록 양식과 같은 차례. `def` 는 처음에 보이는 열이다. */
const COLS: Array<{ key: string; label: string; type?: NCol['type']; w?: number; def?: boolean }> = [
  { key: 'id', label: 'ID', w: 124, def: true },
  { key: 'jira_project', label: '프로젝트 키', w: 96, def: true },
  { key: 'project_name', label: '프로젝트명', w: 104, def: true },
  { key: 'issue_type', label: '이슈유형', type: 'select', w: 92, def: true },
  { key: 'title', label: '제목', w: 420, def: true },
  { key: 'status', label: '상태', type: 'select', w: 104, def: true },
  { key: 'priority', label: '우선순위', type: 'select', w: 88, def: true },
  { key: 'fix_version', label: '수정버전', w: 130, def: true },
  { key: 'component', label: '구성요소', type: 'select', w: 104, def: true },
  { key: 'reporter', label: '보고자', w: 96, def: true },
  { key: 'created_by', label: '등록자', w: 104, def: true },
  { key: 'created_at', label: '등록일', type: 'date', w: 132, def: true },
  { key: 'tcid', label: '시험 항목', w: 130 },
  { key: 'jira_key', label: 'Jira 키', w: 118 },
]
const COL_KEY = 'utop.defects.cols'

export default function Defects({ me }: { me?: MeUser | null }) {
  const [tab, setTab] = useState('')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<DefectRec | null>(null)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['defects', tab],
    queryFn: async () => {
      const r = await apiFetch(`/api/defects${tab ? `?status=${encodeURIComponent(tab)}` : ''}`)
      const j = (await r.json()) as { defects: DefectRec[] }
      return j.defects ?? []
    },
    staleTime: 10_000,
  })

  const rows = useMemo(() => {
    const all = data ?? []
    const s = q.trim().toLowerCase()
    if (!s) return all
    return all.filter((d) =>
      [d.id, d.title, d.tcid, d.jira_project, d.jira_key, d.reporter, d.created_by]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s)),
    )
  }, [data, q])

  /** 노션 표가 읽는 줄 — 값은 글자로 굳혀 넘긴다(정렬·검색이 같은 것을 본다) */
  const nrows: NRow[] = useMemo(
    () =>
      rows.map((d) => ({
        __id: String(d.id ?? ''),
        id: String(d.id ?? ''),
        jira_project: d.jira_project ?? '',
        project_name: d.project_name ?? '',
        issue_type: d.issue_type ?? '',
        title: d.title || d.tc_name || '',
        status: d.status ?? '',
        jira_key: d.jira_key ?? '',
        priority: d.priority ?? '',
        fix_version: d.fix_version ?? '',
        component: d.component ?? '',
        reporter: d.reporter ?? '',
        created_by: d.created_by ?? '',
        created_at: fmtDate(d.created_at),
        tcid: d.tcid ?? '',
      })),
    [rows],
  )
  const [view, setView] = useState<NView>(EMPTY_VIEW)
  const [calcs, setCalcs] = useState<Record<string, NCalc>>({})
  const [per, setPer] = useState(50)
  const [nvId, setNvId] = useState('')
  const [hidden, setHidden] = useState<string[]>(() => {
    try {
      const v = JSON.parse(prefGet(COL_KEY) || 'null') as unknown
      const dflt = COLS.filter((c) => !c.def).map((c) => c.key)
      if (!Array.isArray(v)) return dflt
      const known = new Set(v as string[])
      return [...(v as string[]), ...dflt.filter((k) => !known.has(k))]
    } catch {
      return COLS.filter((c) => !c.def).map((c) => c.key)
    }
  })
  useEffect(() => {
    prefSet(COL_KEY, JSON.stringify(hidden))
  }, [hidden])
  const columns: NCol[] = useMemo(
    () =>
      COLS.map((c) => {
        const col: NCol = {
          key: c.key,
          label: c.label,
          type: c.type ?? 'text',
          width: c.w,
          hidden: hidden.includes(c.key),
          fixed: c.key === 'id' || c.key === 'title',
        }
        if (col.type === 'select' && !col.hidden) {
          const vals = [...new Set(nrows.map((r) => String(r[c.key] ?? '')).filter(Boolean))]
          col.options = vals.slice(0, 40).map((v) => ({ value: v, color: 'gray' }))
        }
        return col
      }),
    [nrows, hidden],
  )
  const nBody: ViewBody = useMemo(
    () => ({
      hidden: columns.filter((c) => c.hidden).map((c) => c.key),
      widths: Object.fromEntries(columns.filter((c) => c.width).map((c) => [c.key, c.width!])),
      order: columns.map((c) => c.key),
    }),
    [columns],
  )
  const applyView = (v: ViewDef | null) => {
    setNvId(v?.id ?? '')
    const dflt = COLS.filter((c) => !c.def).map((c) => c.key)
    const saved = v?.body?.hidden
    const known = new Set(saved ?? [])
    setHidden(saved ? [...saved, ...dflt.filter((k) => !known.has(k))] : dflt)
  }

  const counts = useMemo(() => {
    const all = data ?? []
    return { total: all.length, pushed: all.filter((d) => d.jira_key).length }
  }, [data])

  return (
    <div className="dfl">
      <div className="dfl-head">
        <b>Defects</b>
        <span className="muted small">
          결함 {counts.total}건{counts.pushed ? ` · 지라 등록 ${counts.pushed}건` : ''}
        </span>
        <span className="sp" />
        <div className="dfl-tabs">
          {TABS.map((t) => (
            <button key={t.k} type="button" className={`dfl-tab${tab === t.k ? ' on' : ''}`} onClick={() => setTab(t.k)}>
              {t.label}
            </button>
          ))}
        </div>
        <input className="dfl-search" placeholder="검색 (ID·제목·프로젝트·보고자…)" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn small" type="button" onClick={() => void refetch()}>
          새로고침
        </button>
      </div>

      <div className="dfl-body">
        {isLoading ? (
          <div className="empty">불러오는 중…</div>
        ) : rows.length === 0 ? (
          <div className="empty">
            등록된 결함이 없습니다.
            <br />
            <span className="muted small">플랜 화면에서 부적합 항목의 스텝을 열고 「＋ 결함 등록」 을 누르면 여기에 쌓입니다.</span>
          </div>
        ) : (
          <NTable
            columns={columns}
            rows={nrows}
            view={view}
            onView={setView}
            calcs={calcs}
            onCalcs={setCalcs}
            perPage={per}
            onPerPage={setPer}
            toolbarLeft={
              <NViews
                scope="defects"
                curId={nvId}
                onPick={applyView}
                current={nBody}
                meName={me?.username || me?.name || ''}
                isAdmin={me?.role === 'admin' || me?.role === '관리자'}
              />
            }
            idKey="id"
            titleKey="title"
            /* 결함 값은 여기서 못 고친다 — 고치는 자리는 결함 창이다 */
            readOnlyKeys={COLS.map((c) => c.key)}
            lockDefs
            bulk={[{ k: 'csv', label: '엑셀' }]}
            onColumns={(cs) => setHidden(cs.filter((c) => c.hidden).map((c) => c.key))}
            onCell={() => {}}
            onOpen={(id) => setOpen((data ?? []).find((d) => d.id === id) ?? null)}
            onPeek={(id) => setOpen((data ?? []).find((d) => d.id === id) ?? null)}
            renderCell={(row, col) => {
              const v = String(row[col.key] ?? '')
              if (col.key === 'status') {
                const jk = String(row.jira_key ?? '')
                return jk ? (
                  <span className="dfl-jira" title="Jira 이슈 키">
                    ● {jk}
                  </span>
                ) : (
                  <span className={`dfl-badge ${v}`}>{v === 'closed' ? '닫힘' : '미등록'}</span>
                )
              }
              return undefined
            }}
          />
        )}
      </div>

      {open && (
        <DefectDialog
          existing={open}
          onClose={() => setOpen(null)}
          onSaved={() => void refetch()}
        />
      )}
    </div>
  )
}
