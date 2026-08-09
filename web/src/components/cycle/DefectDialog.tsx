import { useEffect, useMemo, useRef, useState } from 'react'
import { apiFetch } from '@/api/client'
import { stepVerdict, type TcStep } from '@/components/tc/types'
import type { CycleItemLite, CycleStep } from '@/pages/Cycles'
import './DefectDialog.css'

/** UTOP 안에 쌓는 결함 한 건 */
export interface DefectRec {
  id: string
  status: string
  title?: string
  jira_key?: string | null
  jira_project?: string | null
  project_name?: string | null
  issue_type?: string | null
  priority?: string | null
  fix_version?: string | null
  component?: string | null
  reporter?: string | null
  created_by?: string | null
  created_at?: string | null
  steps?: unknown
}

interface Props {
  cycle: { id: string; model?: string | null; version?: string | null }
  item: CycleItemLite
  /** 이 항목에 이미 걸린 결함 (있으면 그 값으로 채운다) */
  existing: DefectRec | null
  onClose: () => void
  onSaved: (d: DefectRec) => void
}

const isFail = (r: string) => r === 'Fail' || r === '불합격'
const PRIORITIES = ['Blocker', 'Critical', 'Major', 'Minor', 'Trivial']

/** 한 스텝을 결함에 담을 모양으로 추린다 */
interface StepBrief {
  no: number
  kind: string
  desc: string
  cli: string
  criteria: string
  status: string
  reason: string
  output: string
  actual_img: string
}

/** 항목의 깨진 스텝(없으면 전체)을 자세히 뽑는다 */
function briefsOf(item: CycleItemLite): StepBrief[] {
  const steps = (item.steps ?? []) as CycleStep[]
  const bad = steps.filter((x) => isFail(stepVerdict(x as TcStep)))
  const pick = bad.length ? bad : steps
  return pick.map((x, i) => ({
    no: steps.indexOf(x) + 1 || i + 1,
    kind: x.kind ?? 'cli',
    desc: x.desc ?? x.step ?? '',
    cli: x.cli ?? '',
    criteria: x.criteria ?? '',
    status: stepVerdict(x as TcStep),
    reason: x.reason ?? '',
    output: String(x.output ?? '').slice(0, 4000),
    actual_img: x.actual_img ?? '',
  }))
}

/** "2026년 8월 9일 14:30:05" */
function fmtDate(iso?: string | null): string {
  if (!iso) return '지금(등록 시)'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/**
 * 결함 등록 창.
 *
 * 사이클 항목에서 「이슈 생성」 을 누르면 뜬다. 깨진 스텝을 그대로 담고,
 * 프로젝트 키·프로젝트명·이슈유형·우선순위·수정버전·구성요소·보고자·등록자·
 * 등록일 아홉 칸을 채워 Jira 이슈로 올린다.
 *
 * UTOP 안에는 먼저 저장하고(항목당 하나), 「지라에 등록」 을 누를 때 실제로
 * 이슈가 생긴다 — 64건 돌려 20건 깨졌다고 이슈 20개가 한꺼번에 생기지 않게.
 */
export default function DefectDialog({ cycle, item, existing, onClose, onSaved }: Props) {
  const briefs = useMemo(() => briefsOf(item), [item])
  const failN = briefs.filter((b) => b.status === 'Fail').length

  // 아홉 칸
  const [proj, setProj] = useState(existing?.jira_project ?? '')
  const [projName, setProjName] = useState(existing?.project_name ?? '')
  const [itype, setItype] = useState(existing?.issue_type ?? 'Defect')
  const [prio, setPrio] = useState(existing?.priority ?? 'Major')
  const [fixv, setFixv] = useState(existing?.fix_version ?? cycle.version ?? '')
  const [comp, setComp] = useState(existing?.component ?? cycle.model ?? '')
  const [reporter, setReporter] = useState(existing?.reporter ?? '')
  const [me, setMe] = useState(existing?.created_by ?? '')
  const [title, setTitle] = useState(
    existing?.title ??
      `[${cycle.model ?? ''} ${cycle.version ?? ''}] ${item.name || item.tcid}${
        briefs[0] ? ` — ${briefs[0].reason || briefs[0].desc}` : ''
      }`.trim(),
  )

  // 드롭다운 목록
  const [projects, setProjects] = useState<Array<{ key: string; name: string }>>([])
  const [itypes, setItypes] = useState<string[]>([])
  const [versions, setVersions] = useState<string[]>([])
  const [comps, setComps] = useState<string[]>([])
  const [users, setUsers] = useState<Array<{ name: string; displayName: string }>>([])

  const [defect, setDefect] = useState<DefectRec | null>(existing)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ kind: string; text: string }>({ kind: '', text: '' })
  const utoggle = useRef(0)

  // 나(등록자) — 아직 저장 전이면 백엔드가 채우기 전이라 여기서 보여만 준다
  useEffect(() => {
    if (me) return
    void (async () => {
      try {
        const r = await apiFetch('/api/me')
        const j = (await r.json()) as { user?: { username?: string; name?: string } }
        setMe(j.user?.name || j.user?.username || '')
      } catch {
        /* 무시 */
      }
    })()
  }, [me])

  // 프로젝트 목록
  useEffect(() => {
    void (async () => {
      try {
        const r = await apiFetch('/api/jira/projects')
        const j = (await r.json()) as { ok?: boolean; projects?: Array<{ key: string; name: string }> }
        if (j.ok) setProjects(j.projects ?? [])
      } catch {
        /* 무시 */
      }
    })()
  }, [])

  // 프로젝트를 고르면 이슈유형·수정버전·구성요소를 그 프로젝트 것으로 갈아 끼운다
  useEffect(() => {
    if (!proj) {
      setItypes([]); setVersions([]); setComps([])
      return
    }
    const p = projects.find((x) => x.key === proj)
    if (p && p.name) setProjName(p.name)
    void (async () => {
      try {
        const [it, ve, co] = await Promise.all([
          apiFetch(`/api/jira/issuetypes?project=${encodeURIComponent(proj)}`).then((r) => r.json()),
          apiFetch(`/api/jira/versions?project=${encodeURIComponent(proj)}`).then((r) => r.json()),
          apiFetch(`/api/jira/components?project=${encodeURIComponent(proj)}`).then((r) => r.json()),
        ])
        if (it?.ok) setItypes((it.issuetypes ?? []).map((t: { name: string }) => t.name).filter(Boolean))
        if (ve?.ok) setVersions((ve.versions ?? []).map((v: { name: string }) => v.name).filter(Boolean))
        if (co?.ok) setComps((co.components ?? []).map((c: { name: string }) => c.name).filter(Boolean))
      } catch {
        /* 무시 */
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proj, projects])

  // 보고자 검색 — 타이핑을 살짝 늦춰서 부른다
  const onReporterType = (v: string) => {
    setReporter(v)
    const q = v.trim()
    if (q.length < 1) return
    const seq = ++utoggle.current
    window.setTimeout(() => {
      if (seq !== utoggle.current) return
      void (async () => {
        try {
          const r = await apiFetch(
            `/api/jira/user-search?q=${encodeURIComponent(q)}${proj ? `&project=${encodeURIComponent(proj)}` : ''}`,
          )
          const j = (await r.json()) as { ok?: boolean; users?: Array<{ name: string; displayName: string }> }
          if (j.ok) setUsers(j.users ?? [])
        } catch {
          /* 무시 */
        }
      })()
    }, 250)
  }

  /** UTOP 안에 저장(항목당 하나). 이미 있으면 그대로 쓴다. */
  const save = async (): Promise<DefectRec | null> => {
    if (defect) return defect
    setBusy('save')
    try {
      const r = await apiFetch('/api/defects', {
        method: 'POST',
        body: JSON.stringify({
          cycle_id: cycle.id,
          cycle_name: [cycle.model, cycle.version].filter(Boolean).join(' · '),
          tcid: item.tcid,
          tc_name: item.name || item.tcid,
          model: cycle.model,
          version: cycle.version,
          title,
          steps: briefs,
          jira_project: proj,
          project_name: projName,
          issue_type: itype,
          priority: prio,
          fix_version: fixv,
          component: comp,
          reporter,
        }),
      })
      const j = (await r.json()) as { defect: DefectRec; existed?: boolean }
      setDefect(j.defect)
      onSaved(j.defect)
      setMsg({ kind: 'ok', text: j.existed ? `이미 걸린 결함입니다 (${j.defect.id})` : `UTOP에 저장했습니다 (${j.defect.id})` })
      return j.defect
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) })
      return null
    } finally {
      setBusy('')
    }
  }

  /** 지라에 이슈를 올린다 — 없으면 먼저 저장하고 민다 */
  const push = async () => {
    if (!proj) {
      setMsg({ kind: 'err', text: '프로젝트 키를 고르세요' })
      return
    }
    const d = await save()
    if (!d) return
    setBusy('push')
    try {
      const r = await apiFetch(`/api/defects/${encodeURIComponent(d.id)}/push`, {
        method: 'POST',
        body: JSON.stringify({
          jira_project: proj,
          issue_type: itype,
          priority: prio,
          fix_version: fixv,
          component: comp,
          reporter,
        }),
      })
      const j = (await r.json()) as { ok?: boolean; key?: string; url?: string; error?: string; defect?: DefectRec }
      if (!j.ok) {
        setMsg({ kind: 'err', text: j.error || '지라 등록에 실패했습니다' })
        return
      }
      if (j.defect) {
        setDefect(j.defect)
        onSaved(j.defect)
      }
      setMsg({ kind: 'ok', text: `지라에 등록했습니다 — ${j.key}` })
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy('')
    }
  }

  const pushed = !!defect?.jira_key

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div className="modal dfx" role="dialog" aria-modal="true" aria-label="결함 등록" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <b>결함 등록</b>
          <span className="muted small">
            {item.name || item.tcid} · 깨진 스텝 {failN}개
          </span>
          <span className="sp" />
          {pushed && <span className="dfx-key">● {defect?.jira_key}</span>}
          <button className="modal-x" type="button" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body dfx-body">
          {/* 제목 */}
          <label className="dfx-fld wide">
            <span>제목</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={pushed} />
          </label>

          {/* 아홉 칸 — 프로젝트 키·프로젝트명·이슈유형·우선순위·수정버전·구성요소·보고자·등록자·등록일 */}
          <div className="dfx-grid">
            <label className="dfx-fld">
              <span>프로젝트 키</span>
              <select value={proj} onChange={(e) => setProj(e.target.value)} disabled={pushed}>
                <option value="">— 고르기 —</option>
                {projects.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.key}
                  </option>
                ))}
              </select>
            </label>

            <label className="dfx-fld">
              <span>프로젝트명</span>
              <input value={projName} onChange={(e) => setProjName(e.target.value)} disabled={pushed} placeholder="프로젝트를 고르면 채워집니다" />
            </label>

            <label className="dfx-fld">
              <span>이슈유형</span>
              <input list="dfx-itypes" value={itype} onChange={(e) => setItype(e.target.value)} disabled={pushed} />
              <datalist id="dfx-itypes">
                {itypes.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </label>

            <label className="dfx-fld">
              <span>우선순위</span>
              <input list="dfx-prio" value={prio} onChange={(e) => setPrio(e.target.value)} disabled={pushed} />
              <datalist id="dfx-prio">
                {PRIORITIES.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </label>

            <label className="dfx-fld">
              <span>수정버전</span>
              <input list="dfx-versions" value={fixv} onChange={(e) => setFixv(e.target.value)} disabled={pushed} />
              <datalist id="dfx-versions">
                {versions.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </label>

            <label className="dfx-fld">
              <span>구성요소</span>
              <input list="dfx-comps" value={comp} onChange={(e) => setComp(e.target.value)} disabled={pushed} />
              <datalist id="dfx-comps">
                {comps.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </label>

            <label className="dfx-fld">
              <span>보고자</span>
              <input
                list="dfx-users"
                value={reporter}
                onChange={(e) => onReporterType(e.target.value)}
                disabled={pushed}
                placeholder="이름/ID 로 검색"
              />
              <datalist id="dfx-users">
                {users.map((u) => (
                  <option key={u.name} value={u.name}>
                    {u.displayName}
                  </option>
                ))}
              </datalist>
            </label>

            <label className="dfx-fld">
              <span>등록자</span>
              <input value={me} readOnly className="ro" />
            </label>

            <label className="dfx-fld">
              <span>등록일</span>
              <input value={fmtDate(defect?.created_at)} readOnly className="ro" />
            </label>
          </div>

          {/* 깨진 스텝 — 무엇이 어떻게 깨졌나 */}
          <div className="dfx-steps">
            <div className="dfx-sh">깨진 스텝 내용</div>
            {briefs.length === 0 ? (
              <div className="muted small">담을 스텝이 없습니다.</div>
            ) : (
              briefs.map((b) => (
                <div key={b.no} className={`dfx-step ${b.status === 'Fail' ? 'fail' : ''}`}>
                  <div className="dfx-st-h">
                    <b>#{b.no}</b>
                    <span>{b.desc || b.cli}</span>
                    <span className="sp" />
                    {b.status && <span className={`dfx-badge ${b.status === 'Fail' ? 'fail' : b.status === 'Pass' ? 'pass' : ''}`}>{b.status}</span>}
                  </div>
                  {b.cli && <pre className="dfx-cli">{b.cli}</pre>}
                  {b.criteria && (
                    <div className="dfx-meta">
                      <span className="k">판정 기준</span> {b.criteria}
                    </div>
                  )}
                  {b.reason && (
                    <div className="dfx-meta">
                      <span className="k">판정 근거</span> {b.reason}
                    </div>
                  )}
                  {b.output && <pre className="dfx-out">{b.output.slice(0, 1200)}</pre>}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="modal-foot dfx-foot">
          {msg.text && <span className={`muted small ${msg.kind}`}>{msg.text}</span>}
          <span className="sp" />
          {pushed ? (
            <button className="btn" type="button" onClick={onClose}>
              닫기
            </button>
          ) : (
            <>
              <button className="btn" type="button" disabled={!!busy} onClick={() => void save()}>
                {busy === 'save' ? '저장 중…' : 'UTOP에 저장'}
              </button>
              <button className="btn primary" type="button" disabled={!!busy || !proj} onClick={() => void push()}>
                {busy === 'push' ? '지라 등록 중…' : '지라에 등록'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
