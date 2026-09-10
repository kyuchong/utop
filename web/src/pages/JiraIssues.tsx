/**
 * Jira Issue — **지라에서 가져다 보는 자리**(목업 포팅).
 *
 * 지라에는 팔만 건이 넘는다. 다 가져오는 것은 뜻이 없고 지라도 못 견딘다.
 * 그래서 두 가지를 지킨다:
 *   · **프로젝트를 골라** 그것만 받는다(지시).
 *   · 한 번 받은 것은 **우리 DB 에 둔다**. 다음 Sync 는 마지막으로 받은
 *     갱신 시각 뒤에 바뀐 것만 부른다 — 두 번째부터는 몇 건이라 금방 끝난다.
 *
 * 표는 앱의 NTable 을 쓴다. 목업도 「Jira 표는 Cycles 표(ntb) 형태」 라고
 * 적어 두었고, 화면마다 표를 새로 만들면 결이 갈린다.
 *
 * 열은 목업 것을 그대로 쓰되 **값은 실제 지라 필드**에서 온다 — 사업자·
 * 문제유형·이슈분류·시험시설은 이 지라에 정말 있는 커스텀 필드다.
 */
import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { prefGet, prefSet } from '@/lib/prefs'
import NTable from '@/components/ntable/NTable'
import { EMPTY_VIEW, type NCalc, type NCol, type NRow, type NView } from '@/components/ntable/types'
import './JiraIssues.css'

interface JiraProject {
  key: string
  name: string
}
interface SyncMark {
  at?: string
  last_updated?: string
  n?: number
  total?: number
}

/**
 * 열 — 목업 JIRA_COLS 그대로. `def` 는 처음에 보이는 열이다.
 *
 * 목업이 지어낸 「UMS-Key」 는 뺐다 — 이 지라에 그런 필드가 없다.
 * 있는 척하는 빈 열보다 없는 편이 낫다.
 */
const COLS: Array<{ key: string; label: string; type?: NCol['type']; w?: number; def?: boolean }> = [
  { key: 'created', label: '생성일', type: 'date', w: 104, def: true },
  { key: 'customer', label: '사업자', type: 'select', w: 92, def: true },
  { key: 'project', label: '프로젝트', w: 140, def: true },
  { key: 'issuekey', label: '키', w: 118, def: true },
  { key: 'probtype', label: '문제유형', type: 'select', w: 116, def: true },
  { key: 'hwsw', label: '이슈분류(HW,SW)', type: 'select', w: 122, def: true },
  { key: 'summary', label: '요약', w: 340, def: true },
  { key: 'status', label: '상태', type: 'select', w: 104, def: true },
  { key: 'reporter', label: '등록자', w: 128, def: true },
  { key: 'lab', label: '시험시설', type: 'select', w: 108, def: true },
  { key: 'issuetype', label: '이슈 유형', type: 'select', w: 104 },
  { key: 'assignee', label: '담당자', w: 120 },
  { key: 'priority', label: '우선순위', type: 'select', w: 92 },
  { key: 'updated', label: '갱신일', type: 'date', w: 104 },
  { key: 'stage', label: '이슈단계', type: 'select', w: 130 },
  { key: 'freq', label: '발생빈도', type: 'select', w: 92 },
  { key: 'start', label: '시작일', type: 'date', w: 100 },
  { key: 'due', label: '완료일', type: 'date', w: 100 },
  { key: 'crkind', label: 'CR 구분', type: 'select', w: 96 },
  { key: 'bsptest', label: 'BSP 시험버전', w: 126 },
  { key: 'bspfix', label: 'BSP 해결버전', w: 126 },
  { key: 'fwver', label: 'F/W Version', w: 118 },
  { key: 'sysinfo', label: '시스템정보', w: 160 },
  { key: 'labels', label: '라벨', w: 150 },
  { key: 'description', label: '내용', w: 280 },
]

/** 지라 상태 로젠지 — 갈래(새것·진행·끝)로 색을 나눈다(목업) */
function statusKind(name: string): 'new' | 'run' | 'done' {
  const n = (name || '').toLowerCase()
  if (/close|resolve|reject|완료|승인|반려|done/.test(n)) return 'done'
  if (/new|할 일|작성|renew|assess/.test(n)) return 'new'
  return 'run'
}
/** 이슈 유형 아이콘 — 지라 아바타 대신 색 네모(목업 .jt) */
function typeKind(name: string): string {
  const n = (name || '').toLowerCase()
  if (/개발 ?defect|devdefect/.test(n)) return 'devdefect'
  if (/defect|bug|결함/.test(n)) return 'defect'
  if (/\bcr\b|request/.test(n)) return 'cr'
  if (/release|릴리/.test(n)) return 'osrel'
  if (/story/.test(n)) return 'story'
  if (/sub-?task|부작업/.test(n)) return 'subtask'
  if (/산출물|문서|doc/.test(n)) return 'doc'
  if (/리뷰|review/.test(n)) return 'review'
  if (/큰틀|epic/.test(n)) return 'epic'
  return 'task'
}

const PRJ_KEY = 'utop.jira.projects'
const COL_KEY = 'utop.jira.cols'

export default function JiraIssues() {
  const qc = useQueryClient()
  /** 고른 프로젝트 — 계정을 따라간다 */
  const [picked, setPicked] = useState<string[]>(() => {
    try {
      const v = JSON.parse(prefGet(PRJ_KEY) || '[]') as unknown
      return Array.isArray(v) ? (v as string[]) : []
    } catch {
      return []
    }
  })
  useEffect(() => {
    prefSet(PRJ_KEY, JSON.stringify(picked))
  }, [picked])
  const [prjOpen, setPrjOpen] = useState(false)
  const [prjQ, setPrjQ] = useState('')
  const [view, setView] = useState<NView>(EMPTY_VIEW)
  const [calcs, setCalcs] = useState<Record<string, NCalc>>({})
  const [per, setPer] = useState(50)
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState('')
  const [sel, setSel] = useState<string>('')
  /** 숨긴 열 — 계정을 따라간다 */
  const [hidden, setHidden] = useState<string[]>(() => {
    try {
      const v = JSON.parse(prefGet(COL_KEY) || 'null') as unknown
      return Array.isArray(v) ? (v as string[]) : COLS.filter((c) => !c.def).map((c) => c.key)
    } catch {
      return COLS.filter((c) => !c.def).map((c) => c.key)
    }
  })
  useEffect(() => {
    prefSet(COL_KEY, JSON.stringify(hidden))
  }, [hidden])

  const prjQuery = useQuery({
    queryKey: ['jira-projects'],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const r = await apiFetch('/api/jira/projects')
      return (await r.json()) as { ok?: boolean; projects?: JiraProject[] }
    },
  })
  const projects = prjQuery.data?.projects ?? []

  const issQuery = useQuery({
    queryKey: ['jira-issues', picked.join(',')],
    enabled: picked.length > 0,
    queryFn: async () => {
      const r = await apiFetch(`/api/jira/issues?projects=${encodeURIComponent(picked.join(','))}`)
      return (await r.json()) as {
        ok?: boolean
        rows?: Array<Record<string, string>>
        total?: number
        sync?: Record<string, SyncMark | null>
      }
    },
  })
  const rows: NRow[] = useMemo(
    () => (issQuery.data?.rows ?? []).map((r) => ({ ...r, __id: String(r.issuekey ?? '') })),
    [issQuery.data],
  )

  /** 고른 값들로 선택지를 만든다 — 지라 값은 프로젝트마다 달라 박아 둘 수 없다 */
  const columns: NCol[] = useMemo(
    () =>
      COLS.map((c) => {
        const col: NCol = {
          key: c.key,
          label: c.label,
          type: c.type ?? 'text',
          width: c.w,
          hidden: hidden.includes(c.key),
          fixed: c.key === 'issuekey' || c.key === 'summary',
        }
        if (col.type === 'select') {
          const vals = [...new Set(rows.map((r) => String(r[c.key] ?? '')).filter(Boolean))]
          col.options = vals.slice(0, 60).map((v) => ({ value: v, color: 'gray' }))
        }
        return col
      }),
    [rows, hidden],
  )

  async function sync(full = false) {
    if (!picked.length || busy) return
    setBusy(true)
    setFlash('')
    try {
      const r = await apiFetch('/api/jira/issues/sync', {
        method: 'POST',
        body: JSON.stringify({ projects: picked, full }),
      })
      const j = (await r.json()) as {
        ok?: boolean
        error?: string
        got?: number
        added?: number
        updated?: number
        same?: number
        ms?: number
      }
      if (!j.ok) {
        setFlash(`동기화 실패 — ${j.error ?? '알 수 없는 까닭'}`)
        return
      }
      setFlash(
        `● 지라에서 ${j.got ?? 0}건 받아 DB 에 저장했습니다 — 새로 ${j.added ?? 0} · 갱신 ${j.updated ?? 0} · 변경 없음 ${j.same ?? 0} (${j.ms ?? 0}ms)`,
      )
      void qc.invalidateQueries({ queryKey: ['jira-issues'] })
      window.setTimeout(() => setFlash(''), 8000)
    } catch (e) {
      setFlash(`동기화 실패 — ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const syncMark = issQuery.data?.sync ?? {}
  const lastAt = Object.values(syncMark)
    .map((m) => m?.at || '')
    .filter(Boolean)
    .sort()
    .pop()
  const cur = rows.find((r) => r.__id === sel) ?? null

  const prjList = projects.filter(
    (p) => !prjQ.trim() || `${p.key} ${p.name}`.toLowerCase().includes(prjQ.trim().toLowerCase()),
  )

  return (
    <div className="jri">
      {!!flash && <div className="jri-toast">{flash}</div>}

      <div className="jri-tools">
        {/* 프로젝트를 고르는 것이 이 화면의 첫 물음이다 — 245 개 중 몇 개다 */}
        <span className="jri-prjwrap">
          <button
            type="button"
            className={`btn small${picked.length ? ' primary' : ''}`}
            aria-haspopup="listbox"
            aria-expanded={prjOpen}
            onClick={(e) => {
              e.stopPropagation()
              setPrjOpen((v) => !v)
            }}
          >
            프로젝트 {picked.length ? `${picked.length}개` : '고르기'} ▾
          </button>
          {prjOpen && (
            <>
              <span className="jri-veil" onClick={() => setPrjOpen(false)} aria-hidden="true" />
              <span className="jri-prjpop" role="listbox">
                <input
                  autoFocus
                  value={prjQ}
                  placeholder="프로젝트 키 · 이름 찾기"
                  onChange={(e) => setPrjQ(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
                <span className="jri-prjlist">
                  {prjList.slice(0, 200).map((p) => {
                    const on = picked.includes(p.key)
                    return (
                      <button
                        key={p.key}
                        type="button"
                        className={on ? 'on' : ''}
                        onClick={(e) => {
                          e.stopPropagation()
                          setPicked((v) => (on ? v.filter((x) => x !== p.key) : [...v, p.key]))
                        }}
                      >
                        <i aria-hidden="true">{on ? '✓' : ''}</i>
                        <b>{p.key}</b>
                        <span>{p.name}</span>
                      </button>
                    )
                  })}
                  {!prjList.length && <span className="jri-none">맞는 프로젝트가 없습니다</span>}
                </span>
                {!!picked.length && (
                  <span className="jri-prjft">
                    <button type="button" onClick={() => setPicked([])}>
                      모두 해제
                    </button>
                  </span>
                )}
              </span>
            </>
          )}
        </span>
        {picked.map((k) => (
          <span key={k} className="jri-chip">
            {k}
            <i onClick={() => setPicked((v) => v.filter((x) => x !== k))}>✕</i>
          </span>
        ))}
        <span className="sp" />
        {!!lastAt && (
          <span className="jri-last" title="마지막으로 지라에서 받아 온 때">
            {String(lastAt).slice(0, 16).replace('T', ' ')} 받음
          </span>
        )}
        <button
          type="button"
          className="btn small"
          disabled={!picked.length || busy}
          title="처음부터 다시 받습니다 — 오래 걸립니다"
          onClick={() => void sync(true)}
        >
          전체 다시
        </button>
        <button
          type="button"
          className="btn small primary"
          disabled={!picked.length || busy}
          title="마지막으로 받은 뒤에 바뀐 것만 받습니다"
          onClick={() => void sync(false)}
        >
          {busy ? '↻ 받는 중…' : '↻ Sync'}
        </button>
      </div>

      {!picked.length ? (
        <div className="jri-empty">
          <b>프로젝트를 고르세요</b>
          <span>
            지라에는 이슈가 팔만 건이 넘습니다. 볼 프로젝트를 골라 <b>↻ Sync</b> 를 누르면
            그것만 받아 둡니다. 다음부터는 바뀐 것만 받으므로 금방 끝납니다.
          </span>
        </div>
      ) : !rows.length ? (
        <div className="jri-empty">
          <b>{issQuery.isLoading ? '읽는 중…' : '아직 받아 온 이슈가 없습니다'}</b>
          <span>
            {issQuery.isLoading
              ? ''
              : `고른 프로젝트(${picked.join(', ')})의 이슈를 아직 받지 않았습니다 — 위의 ↻ Sync 를 누르세요.`}
          </span>
        </div>
      ) : (
        <div className="jri-table">
          <NTable
            columns={columns}
            rows={rows}
            view={view}
            onView={setView}
            calcs={calcs}
            onCalcs={setCalcs}
            perPage={per}
            onPerPage={setPer}
            title={`Jira Issue · ${picked.join(', ')}`}
            busy={issQuery.isLoading || busy}
            idKey="issuekey"
            titleKey="summary"
            /* 지라 값은 여기서 못 고친다 — 고치는 자리는 지라다.
               고칠 수 있는 척하면 눌러 놓고 왜 안 되는지 찾게 된다. */
            readOnlyKeys={COLS.map((c) => c.key)}
            lockDefs
            onColumns={(cs) => setHidden(cs.filter((c) => c.hidden).map((c) => c.key))}
            onCell={() => {}}
            onOpen={(id) => setSel(id)}
            onPeek={(id) => setSel(id)}
            renderCell={(row, col) => {
              const v = String(row[col.key] ?? '')
              if (col.key === 'status') {
                return v ? <span className={`jri-st ${statusKind(v)}`}>{v}</span> : null
              }
              if (col.key === 'issuetype') {
                return v ? (
                  <span className="jri-ty">
                    <i className={`jt ${typeKind(v)}`} aria-hidden="true" />
                    {v}
                  </span>
                ) : null
              }
              if (col.key === 'hwsw') {
                return v ? <span className={`jri-hw ${/hw|하드/i.test(v) ? 'h' : /sw|소프/i.test(v) ? 's' : 'e'}`}>{v}</span> : null
              }
              if (col.key === 'labels') {
                return v
                  ? v.split(',').map((x, i) => (
                      <span key={i} className="jri-lbl">
                        {x.trim()}
                      </span>
                    ))
                  : null
              }
              return undefined
            }}
          />
        </div>
      )}

      {/* 줄을 누르면 그 이슈 — 지라로 건너가지 않고 여기서 본다 */}
      {!!cur && (
        <div className="jri-back" onMouseDown={() => setSel('')}>
          <aside className="jri-side" onMouseDown={(e) => e.stopPropagation()}>
            <header>
              <i className={`jt ${typeKind(String(cur.issuetype ?? ''))}`} aria-hidden="true" />
              <b>{String(cur.issuekey ?? '')}</b>
              <span className={`jri-st ${statusKind(String(cur.status ?? ''))}`}>
                {String(cur.status ?? '')}
              </span>
              <span className="sp" />
              <button type="button" title="닫기" onClick={() => setSel('')}>
                ✕
              </button>
            </header>
            <div className="jri-sbody">
              <h3>{String(cur.summary ?? '')}</h3>
              <table className="jri-kv">
                <tbody>
                  {[
                    ['프로젝트', 'project'],
                    ['사업자', 'customer'],
                    ['이슈 유형', 'issuetype'],
                    ['우선순위', 'priority'],
                    ['문제유형', 'probtype'],
                    ['이슈분류(HW,SW)', 'hwsw'],
                    ['시험시설', 'lab'],
                    ['이슈단계', 'stage'],
                    ['발생빈도', 'freq'],
                    ['등록자', 'reporter'],
                    ['담당자', 'assignee'],
                    ['생성일', 'created'],
                    ['갱신일', 'updated'],
                    ['시작일', 'start'],
                    ['완료일', 'due'],
                    ['BSP 시험버전', 'bsptest'],
                    ['BSP 해결버전', 'bspfix'],
                    ['F/W Version', 'fwver'],
                    ['CR 구분', 'crkind'],
                    ['시스템정보', 'sysinfo'],
                    ['라벨', 'labels'],
                  ].map(([lb, k]) => {
                    const v = String(cur[k as string] ?? '').trim()
                    return v ? (
                      <tr key={k}>
                        <td>{lb}</td>
                        <td>{v}</td>
                      </tr>
                    ) : null
                  })}
                </tbody>
              </table>
              {!!String(cur.description ?? '').trim() && (
                <>
                  <h4>내용</h4>
                  <pre className="jri-desc">{String(cur.description)}</pre>
                </>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
