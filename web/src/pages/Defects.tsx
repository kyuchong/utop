import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import DefectDialog, { type DefectRec } from '@/components/cycle/DefectDialog'
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
 * 사이클 항목에서 「결함 등록」 을 누르면 그 자리에서 UTOP 에 쌓인다. 여기서
 * 그것들을 한눈에 보고, 골라서 「지라에 등록」 을 눌러 Jira 이슈로 민다.
 *
 * 칸은 등록 양식과 같다 — 프로젝트 키·프로젝트명·이슈유형·우선순위·수정버전·
 * 구성요소·보고자·등록자·등록일.
 */
export default function Defects() {
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
            <span className="muted small">사이클 화면에서 부적합 항목의 스텝을 열고 「＋ 결함 등록」 을 누르면 여기에 쌓입니다.</span>
          </div>
        ) : (
          <div className="dfl-tablewrap">
            <table className="dfl-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>프로젝트 키</th>
                  <th>프로젝트명</th>
                  <th>이슈유형</th>
                  <th>제목</th>
                  <th>상태</th>
                  <th>우선순위</th>
                  <th>수정버전</th>
                  <th>구성요소</th>
                  <th>보고자</th>
                  <th>등록자</th>
                  <th>등록일</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id} onClick={() => setOpen(d)} className="dfl-row">
                    <td className="mono">{d.id}</td>
                    <td>{d.jira_project || '–'}</td>
                    <td>{d.project_name || '–'}</td>
                    <td>{d.issue_type || '–'}</td>
                    <td className="dfl-title" title={d.title || d.tc_name || ''}>
                      {d.title || d.tc_name || '–'}
                    </td>
                    <td>
                      {d.jira_key ? (
                        <span className="dfl-jira" title="Jira 이슈 키">
                          ● {d.jira_key}
                        </span>
                      ) : (
                        <span className={`dfl-badge ${d.status}`}>{d.status === 'closed' ? '닫힘' : '미등록'}</span>
                      )}
                    </td>
                    <td>{d.priority || '–'}</td>
                    <td>{d.fix_version || '–'}</td>
                    <td>{d.component || '–'}</td>
                    <td>{d.reporter || '–'}</td>
                    <td>{d.created_by || '–'}</td>
                    <td className="muted small">{fmtDate(d.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open && (
        <DefectDialog
          existing={open}
          onClose={() => setOpen(null)}
          onSaved={() => void refetch()}
          onDeleted={() => {
            setOpen(null)
            void refetch()
          }}
        />
      )}
    </div>
  )
}
