import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, categoryApi, projectApi, apiFetch, type MeUser } from '@/api/client'
import { reqLabel, reqPk, statusClass, type Requirement, type TestCaseMeta } from '@/types'
import { goto } from '@/api/goto'
import { fillOf } from '@/lib/fieldFill'
import { IconChevron, IconSearch, IconSort } from '@/components/icons'
import ReqForm from '@/components/ReqForm'
import TcForm from '@/components/TcForm'
import ReqDetail from '@/components/ReqDetail'
import TestCases from '@/pages/TestCases'
import { currentProject, onProjectChange } from '@/components/ProjectPicker'
import Resizer, { useResizableWidth } from '@/components/Resizer'
import './ReqTc.css'

interface Props {
  me?: MeUser | null
}

/** 2열이 무엇을 세나 — 목업에서 고른 「토글」 */
type Mode = 'req' | 'tc'
const MODE_KEY = 'utop.reqtc.mode'

/**
 * REQ-TC — 요구사항과 시험을 한 화면에서(지시, 목업 확정).
 *
 * **트리는 폴더만, 표는 한 벌, 무엇을 셀지는 토글이 정한다.**
 * 요구사항을 트리에 넣는 안도 있었지만, 그러면 트리가 길어지고(폴더 29 +
 * 요구사항 57) 무엇보다 **요구사항을 표로 관리할 길이 사라진다** — 213 은
 * 57건 중 51건이 미커버라, 훑고 메우려면 정렬·거르기·여러 개 고르기가 되는
 * 표가 있어야 한다. 대신 「요구사항 줄을 누르면 그 시험으로 좁혀지는」 다리를
 * 놓아, 트리에 넣었을 때 얻으려던 흐름을 그대로 얻는다.
 *
 * **사업자·모델그룹·모델명은 프로젝트가 정본**(지시). 시험은 제 값을 갖고
 * 있으므로 그것을 먼저 쓰고, 없으면 프로젝트 값으로 채운다.
 *
 * **읽고 고치기만 한다. 구조는 안 바꾼다.** 이미 있는 API 만 읽고, 고칠 때는
 * 이미 있는 부품(ReqForm·TcForm)을 부른다 — 편집기를 두 벌 만들면 한쪽만
 * 고치는 날이 온다. 기존 Requirements·Coverage 화면은 손대지 않는다(지시).
 */
export default function ReqTc({ me }: Props) {
  void me
  const [mode, setMode] = useState<Mode>(() => (localStorage.getItem(MODE_KEY) as Mode) || 'req')
  const [cat, setCat] = useState('')
  const [openCat, setOpenCat] = useState<Set<string>>(new Set())
  /** 「이 요구사항의 시험만」 — 요구사항 줄을 눌렀을 때 걸리는 다리 */
  const [reqOnly, setReqOnly] = useState('')
  const [q, setQ] = useState('')
  const [fsort, setFsort] = useState<'name' | 'req'>('name')
  const [deep, setDeep] = useState(true)
  const [onlyBare, setOnlyBare] = useState(false)
  const [foldSide, setFoldSide] = useState(false)
  /* 두 판 사이 이동바(지시) — 다른 화면과 같은 부품을 쓴다. 폭은 기억한다. */
  const [sideW, setSideW] = useResizableWidth('rqtcSideW', 264, 180, 620)
  const gridRef = useRef<HTMLDivElement>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [pop, setPop] = useState<{ kind: 'req' | 'tc'; id: string } | null>(null)
  /** undefined = 안 열림 · null = 새로 만들기 · 값 = 그것을 고치기 */
  const [editReq, setEditReq] = useState<Requirement | null | undefined>(undefined)
  const [editTc, setEditTc] = useState<TestCaseMeta | null | undefined>(undefined)
  const [prj, setPrj] = useState(currentProject)

  /* 상단바(Layout)에서 프로젝트를 바꾸면 이 화면이 다시 좁힌다 */
  useEffect(() => onProjectChange(() => setPrj(currentProject())), [])

  const reqQ = useQuery({ queryKey: ['reqs'], queryFn: ({ signal }) => api.listRequirements(signal) })
  const tcQ = useQuery({ queryKey: ['tcs'], queryFn: ({ signal }) => api.listTestCases(signal) })
  const catQ = useQuery({ queryKey: ['req-categories'], queryFn: ({ signal }) => categoryApi.list(signal) })
  const prjQ = useQuery({ queryKey: ['projects'], queryFn: ({ signal }) => projectApi.list(signal) })
  /** 먼데이 통채움 색 — **설정이 정본**(lib/fieldFill). 화면에 색을 박지 않는다 */
  const codesQ = useQuery({
    queryKey: ['codes'],
    staleTime: 60_000,
    queryFn: async () => {
      const r = await apiFetch('/api/codes')
      if (!r.ok) throw new Error('코드를 불러오지 못했습니다')
      return (await r.json()) as { items: Array<{ kind: string; value: string; note?: string | null }> }
    },
  })
  /** 최근 결과 — 결과는 사이클 안에 살아서 따로 읽는다 */
  const lastQ = useQuery({
    queryKey: ['tc-last-result'],
    staleTime: 30_000,
    queryFn: async () => {
      const r = await apiFetch('/api/tc-last-result')
      if (!r.ok) return {} as Record<string, { result: string; cycle_name?: string; at?: string }>
      const j = (await r.json()) as {
        items?: Record<string, { result: string; cycle_name?: string; at?: string }>
      }
      return j.items ?? {}
    },
  })

  const reqs = useMemo(() => reqQ.data?.reqs ?? [], [reqQ.data])
  const tcs = useMemo(() => tcQ.data?.tcs ?? [], [tcQ.data])
  const cats = useMemo(() => catQ.data?.categories ?? [], [catQ.data])
  const projects = useMemo(() => prjQ.data?.projects ?? [], [prjQ.data])
  const lastOf = (id: string) => lastQ.data?.[id]?.result ?? ''

  const codeFill = (kind: string, value: string) =>
    fillOf((codesQ.data?.items ?? []).find((x) => x.kind === kind && x.value === value)?.note, value)

  const kids = useMemo(() => {
    const m = new Map<string, typeof cats>()
    for (const c of cats) m.set(c.parent_id ?? '', [...(m.get(c.parent_id ?? '') ?? []), c])
    return m
  }, [cats])
  const under = useMemo(() => {
    const f = (id: string): string[] => [id, ...(kids.get(id) ?? []).flatMap((c) => f(c.id))]
    return f
  }, [kids])

  const catsOf = (r: Requirement) => [r.cat1, r.cat2, r.cat3, r.cat4].filter(Boolean).map(String)
  const catOf = (r: Requirement) => String(r.cat4 || r.cat3 || r.cat2 || r.cat1 || '')

  /** 시험 → 요구사항. 잇는 키는 **req.id**(내부 키)다 — reqid 로는 안 붙는다 */
  const tcOf = useMemo(() => {
    const m = new Map<string, TestCaseMeta[]>()
    for (const t of tcs) {
      const k = String(t.req_id ?? '').trim()
      if (k) m.set(k, [...(m.get(k) ?? []), t])
    }
    return m
  }, [tcs])
  const reqById = useMemo(() => new Map(reqs.map((r) => [reqPk(r), r])), [reqs])

  const prjCats = useMemo(() => (prj ? new Set(under(prj)) : null), [prj, under])
  const inPrj = (r: Requirement) => !prjCats || catsOf(r).some((c) => prjCats.has(c))

  /** 이 요구사항의 프로젝트 — 사업자·모델의 정본 */
  const prjOf = useMemo(() => {
    const byCat = new Map<string, (typeof projects)[number]>()
    for (const p of projects) for (const c of under(p.cat_id)) byCat.set(c, p)
    return (r?: Requirement) => (r ? catsOf(r).map((c) => byCat.get(c)).find(Boolean) : undefined)
  }, [projects, under])

  const countOf = (id: string) => {
    const set = new Set(under(id))
    const rs = reqs.filter((r) => inPrj(r) && catsOf(r).some((c) => set.has(c)))
    return { r: rs.length, t: rs.reduce((n, r) => n + (tcOf.get(reqPk(r))?.length ?? 0), 0) }
  }

  const inCat = (r: Requirement) => {
    if (!cat) return true
    const set = new Set(under(cat))
    return deep ? catsOf(r).some((c) => set.has(c)) : catOf(r) === cat
  }

  /** 요구사항 줄 */
  const reqRows = useMemo(() => {
    const n = q.trim().toLowerCase()
    return reqs.filter((r) => {
      if (!inPrj(r) || !inCat(r)) return false
      if (onlyBare && (tcOf.get(reqPk(r))?.length ?? 0) > 0) return false
      if (!n) return true
      return `${reqLabel(r)} ${r.title ?? ''}`.toLowerCase().includes(n)
    })
  }, [reqs, q, cat, deep, onlyBare, tcOf, prjCats, under])

  /** 시험 줄 — 폴더(또는 고른 요구사항)에 매인 것만 */
  const tcRows = useMemo(() => {
    const n = q.trim().toLowerCase()
    const ok = (t: TestCaseMeta) => {
      const rid = String(t.req_id ?? '')
      if (reqOnly) return rid === reqOnly
      const r = reqById.get(rid)
      if (!r) return false
      return inPrj(r) && inCat(r)
    }
    return tcs.filter((t) => ok(t) && (!n || `${t.tcid} ${t.name ?? ''}`.toLowerCase().includes(n)))
  }, [tcs, q, cat, deep, reqOnly, reqById, prjCats, under])

  const crumb = useMemo(() => {
    const out: Array<{ id: string; name: string }> = []
    let at = cats.find((c) => c.id === cat)
    while (at) {
      out.unshift({ id: at.id, name: at.name })
      const pid = at.parent_id
      at = pid ? cats.find((c) => c.id === pid) : undefined
    }
    return out
  }, [cat, cats])

  const toggle = (s: Set<string>, k: string, set: (v: Set<string>) => void) => {
    const n = new Set(s)
    if (n.has(k)) n.delete(k)
    else n.add(k)
    set(n)
  }

  /** 다리 — 요구사항 줄을 누르면 그 시험으로 간다(트리에 요구사항을 넣는 대신) */
  const goTcOf = (pk: string) => {
    setReqOnly(pk)
    setMode('tc')
    setSel(new Set())
  }
  const pickFolder = (id: string) => {
    setCat(cat === id ? '' : id)
    setReqOnly('')
    setSel(new Set())
  }

  const bare = reqRows.filter((r) => !(tcOf.get(reqPk(r))?.length ?? 0)).length
  const rowsN = mode === 'req' ? reqRows.length : tcRows.length
  const onlyReq = reqOnly ? reqById.get(reqOnly) : undefined

  if (reqQ.isLoading || tcQ.isLoading) return <div className="empty">불러오는 중…</div>
  if (reqQ.error) return <div className="load-error">{(reqQ.error as Error).message}</div>

  const Tree = ({ parent, depth }: { parent: string | null; depth: number }) => (
    <>
      {[...(kids.get(parent ?? '') ?? [])]
        .sort((a, b) => (fsort === 'name' ? a.name.localeCompare(b.name) : countOf(b.id).r - countOf(a.id).r))
        .map((c) => {
          const kid = kids.get(c.id) ?? []
          const on = openCat.has(c.id)
          const n = countOf(c.id)
          return (
            <div key={c.id}>
              <div
                className={`rqtc-fold${cat === c.id ? ' on' : ''}${depth === 0 ? ' root' : ''}`}
                style={{ paddingLeft: 6 + depth * 14 }}
                onClick={() => pickFolder(c.id)}
              >
                <button
                  type="button"
                  className={`rqtc-caret${on ? ' open' : ''}`}
                  disabled={!kid.length}
                  aria-label={on ? '접기' : '펴기'}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggle(openCat, c.id, setOpenCat)
                  }}
                >
                  <IconChevron />
                </button>
                <span className="rqtc-fico" aria-hidden="true">
                  {depth === 0 ? '🗂' : '📁'}
                </span>
                <span className="rqtc-fnm">{c.name}</span>
                {/* 덮이지 않은 폴더는 T 를 붉게 — 트리만 훑어도 구멍이 보인다 */}
                <span className={`rqtc-rt${n.r > 0 && n.t === 0 ? ' bare' : ''}`}>
                  <i>R</i>
                  {n.r} <i>T</i>
                  {n.t}
                </span>
              </div>
              {on && <Tree parent={c.id} depth={depth + 1} />}
            </div>
          )
        })}
    </>
  )

  return (
    <div className="rqtc-shell">

      <div
        className={`rqtc${foldSide ? ' folded' : ''}`}
        ref={gridRef}
        style={foldSide ? undefined : { gridTemplateColumns: `${sideW}px 6px minmax(0, 1fr)` }}
      >
        {foldSide && (
          <button type="button" className="rqtc-unfold" title="폴더 판 펴기" onClick={() => setFoldSide(false)}>
            ⇥
          </button>
        )}
        {!foldSide && (
          <aside className="panel rqtc-side">
            {/* 1행 — 이름과 접기 단추만(지시·사진) */}
            <div className="rqtc-sidehead">
              <b>Folder Tree</b>
              <span className="sp" />
              <button type="button" className="rqtc-ib" title="폴더 판 접기" onClick={() => setFoldSide(true)}>
                ⇤
              </button>
            </div>
            {/* 2행 — 만들기와 손잡이들. 사진처럼 만들기가 왼쪽을 채우고
                정렬·더보기가 오른쪽 끝에 붙는다. */}
            <div className="rqtc-newf">
              <button
                className="btn small"
                type="button"
                onClick={() => {
                  const nm = window
                    .prompt(cat ? '새 폴더 이름 (고른 폴더 아래에 만듭니다)' : '새 폴더 이름 (최상위)')
                    ?.trim()
                  if (!nm) return
                  void categoryApi.create(nm, cat || null).then(() => {
                    void catQ.refetch()
                    if (cat) setOpenCat((o) => new Set([...o, cat]))
                  })
                }}
              >
                ＋ New Folder
              </button>
              <span className="sp" />
              <button
                type="button"
                className={`rqtc-ib${fsort === 'req' ? ' on' : ''}`}
                title={fsort === 'name' ? '이름순 (눌러서 요구사항 많은 순)' : '요구사항 많은 순 (눌러서 이름순)'}
                onClick={() => setFsort((v) => (v === 'name' ? 'req' : 'name'))}
              >
                <IconSort />
              </button>
              <button type="button" className="rqtc-ib" title="더 보기">
                ⋯
              </button>
            </div>
            {/* 3행 — 찾기. 여닫는 단추를 두면 한 번 더 눌러야 하고, 접혀
                있으면 걸러 볼 수 있다는 걸 모른다. 늘 보인다(사진). */}
            <div className="rqtc-sidetools">
              <span className="rqtc-qico" aria-hidden="true">
                <IconSearch />
              </span>
              <input
                className="rqtc-q"
                value={q}
                placeholder="폴더 · 요구사항 찾기"
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div className="rqtc-tree">
              <div className={`rqtc-fold${cat === '' ? ' on' : ''}`} onClick={() => pickFolder('')}>
                <span className="rqtc-caret" />
                <span className="rqtc-fico" aria-hidden="true">
                  🗂
                </span>
                <span className="rqtc-fnm">전체</span>
                <span className="rqtc-rt">
                  <i>R</i>
                  {reqs.filter(inPrj).length}
                </span>
              </div>
              <Tree parent={null} depth={0} />
            </div>
          </aside>
        )}
        {!foldSide && (
          <Resizer
            label="폴더 판 폭 조절"
            onResize={setSideW}
            getOrigin={() => gridRef.current?.getBoundingClientRect().left ?? 0}
          />
        )}

        <section className="panel rqtc-main">
          {/* ── 무엇을 셀지 고르는 토글(목업 확정) ── */}
          <div className="rqtc-modebar">
            <div className="rqtc-seg">
              <button type="button" className={mode === 'req' ? 'on' : ''} onClick={() => setMode('req')}>
                요구사항
              </button>
              <button type="button" className={mode === 'tc' ? 'on' : ''} onClick={() => setMode('tc')}>
                시험항목
              </button>
            </div>
            <div className="rqtc-crumb">
              {crumb.length ? (
                crumb.map((c, i) => (
                  <span key={c.id}>
                    {i > 0 && <i className="rqtc-sep">›</i>}
                    <button type="button" className="rqtc-crumbgo" onClick={() => pickFolder(c.id)}>
                      {c.name}
                    </button>
                  </span>
                ))
              ) : (
                <b>전체</b>
              )}
              {/* 「이 요구사항만」 걸린 상태를 늘 보이게 — 안 보이면 왜 몇 건뿐인지 모른다 */}
              {onlyReq && (
                <span className="rqtc-scope">
                  {reqLabel(onlyReq)} {onlyReq.title}
                  <button type="button" title="이 요구사항 좁히기 해제" onClick={() => setReqOnly('')}>
                    ✕
                  </button>
                </span>
              )}
              {cat && !reqOnly && (
                <label className="rqtc-deep" title="하위 폴더까지 함께 봅니다">
                  <input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} />
                  하위 폴더 포함
                </label>
              )}
            </div>
            <span className="sp" />
            <input
              className="rqtc-q top"
              value={q}
              placeholder={mode === 'req' ? '요구사항 찾기 (이름 · ID)' : '시험 찾기 (이름 · TC ID)'}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <div className="rqtc-bar">
            <button
              className="btn small primary"
              type="button"
              onClick={() => (mode === 'req' ? setEditReq(null) : setEditTc(null))}
            >
              ＋ New
            </button>
            {sel.size > 0 && (
              <>
                <span className="rqtc-selinfo">{sel.size}개 고름</span>
                <button className="btn small" type="button" onClick={() => setSel(new Set())}>
                  고르기 해제
                </button>
              </>
            )}
            <span className="sp" />
            {mode === 'req' && (
              <label className="rqtc-only">
                <input type="checkbox" checked={onlyBare} onChange={(e) => setOnlyBare(e.target.checked)} />
                미커버만
              </label>
            )}
          </div>

          <div className="rqtc-tbl">
            {mode === 'req' ? (
              <>
                <div className="rqtc-tr rqtc-th">
                  <div className="c-chk">
                    <input
                      type="checkbox"
                      aria-label="전체 고르기"
                      checked={reqRows.length > 0 && sel.size === reqRows.length}
                      ref={(el) => {
                        if (el) el.indeterminate = sel.size > 0 && sel.size < reqRows.length
                      }}
                      onChange={(e) => setSel(e.target.checked ? new Set(reqRows.map(reqPk)) : new Set())}
                    />
                  </div>
                  <div className="c-title">제목</div>
                  <div className="c-mg">모델그룹</div>
                  <div className="c-md">모델명</div>
                  <div className="c-tc">TC</div>
                  <div className="c-st">상태</div>
                  <div className="c-pr">우선순위</div>
                </div>
                {reqRows.map((r) => {
                  const pk = reqPk(r)
                  const n = tcOf.get(pk)?.length ?? 0
                  const p = prjOf(r)
                  return (
                    <div
                      className={`rqtc-tr${sel.has(pk) ? ' picked' : ''}`}
                      key={pk}
                      title="눌러서 이 요구사항의 시험 보기"
                      onClick={() => goTcOf(pk)}
                    >
                      <div className="c-chk" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={sel.has(pk)} onChange={() => toggle(sel, pk, setSel)} />
                      </div>
                      <div className="c-title">
                        <button
                          type="button"
                          className="rqtc-rid"
                          title="요구사항 상세"
                          onClick={(e) => {
                            e.stopPropagation()
                            setPop({ kind: 'req', id: pk })
                          }}
                        >
                          {reqLabel(r)}
                        </button>
                        <span className="rqtc-rtitle">{r.title || '(제목 없음)'}</span>
                      </div>
                      <div className="c-mg">{p?.model_group || '–'}</div>
                      <div className="c-md">{p?.model || '–'}</div>
                      <div className="c-tc rqtc-fillc">
                        <span className={`rqtc-cov ${n ? 'ok' : 'no'}`}>{n ? `TC ${n}` : '미커버'}</span>
                      </div>
                      <Fill kind="req_status" v={r.status} cls="c-st" f={codeFill} />
                      <Fill kind="req_priority" v={r.priority} cls="c-pr" f={codeFill} />
                    </div>
                  )
                })}
                {!reqRows.length && <div className="empty">보여 줄 요구사항이 없습니다.</div>}
              </>
            ) : (
              <>
                <div className="rqtc-tr tc rqtc-th">
                  <div className="c-chk">
                    <input
                      type="checkbox"
                      aria-label="전체 고르기"
                      checked={tcRows.length > 0 && sel.size === tcRows.length}
                      ref={(el) => {
                        if (el) el.indeterminate = sel.size > 0 && sel.size < tcRows.length
                      }}
                      onChange={(e) => setSel(e.target.checked ? new Set(tcRows.map((t) => t.tcid)) : new Set())}
                    />
                  </div>
                  <div className="c-title">제목</div>
                  <div className="c-mg">모델그룹</div>
                  <div className="c-md">모델명</div>
                  <div className="c-ty">유형</div>
                  <div className="c-st">상태</div>
                  <div className="c-sv">중요도</div>
                  <div className="c-rt">타입</div>
                  <div className="c-og">구분</div>
                  <div className="c-last">최근 결과</div>
                  <div className="c-map">REQ Map</div>
                </div>
                {tcRows.map((t) => {
                  const r = reqById.get(String(t.req_id ?? ''))
                  const p = prjOf(r)
                  const last = lastOf(t.tcid)
                  return (
                    <div
                      className={`rqtc-tr tc${sel.has(t.tcid) ? ' picked' : ''}`}
                      key={t.tcid}
                      onClick={() => setPop({ kind: 'tc', id: t.tcid })}
                    >
                      <div className="c-chk" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={sel.has(t.tcid)}
                          onChange={() => toggle(sel, t.tcid, setSel)}
                        />
                      </div>
                      <div className="c-title">
                        <button
                          type="button"
                          className="rqtc-rid tc"
                          title="시험항목 상세"
                          onClick={(e) => {
                            e.stopPropagation()
                            setPop({ kind: 'tc', id: t.tcid })
                          }}
                        >
                          {t.tcid}
                        </button>
                        <span className="rqtc-rtitle">{t.name || '(제목 없음)'}</span>
                      </div>
                      {/* 시험은 제 모델 값을 갖고 있다 — 없으면 프로젝트 값으로 */}
                      <div className="c-mg">{String(t.model_group ?? '') || p?.model_group || '–'}</div>
                      <div className="c-md">{String(t.model ?? '') || p?.model || '–'}</div>
                      <Fill kind="tc_type" v={t.type} cls="c-ty" f={codeFill} />
                      <Fill kind="tc_status" v={t.status} cls="c-st" f={codeFill} />
                      <Fill kind="tc_severity" v={t.severity} cls="c-sv" f={codeFill} />
                      <Fill kind="tc_run_type" v={String(t.run_type ?? '')} cls="c-rt" f={codeFill} />
                      <Fill kind="tc_origin" v={String(t.origin ?? '')} cls="c-og" f={codeFill} />
                      <div className="c-last rqtc-fillc">
                        {last ? (
                          <span className={`rqtc-lastv ${statusClass(last)}`}>{last}</span>
                        ) : (
                          <span className="rqtc-fill none">–</span>
                        )}
                      </div>
                      <div className="c-map">
                        {r ? (
                          <button
                            type="button"
                            className="rqtc-rid"
                            onClick={(e) => {
                              e.stopPropagation()
                              setPop({ kind: 'req', id: reqPk(r) })
                            }}
                          >
                            {reqLabel(r)}
                          </button>
                        ) : (
                          '–'
                        )}
                      </div>
                    </div>
                  )
                })}
                {!tcRows.length && (
                  <div className="rqtc-none">
                    {onlyReq ? (
                      <>
                        <b>이 요구사항에는 시험이 없습니다</b>
                        <span>위 ＋New 로 만들면 이 요구사항에 바로 붙습니다</span>
                      </>
                    ) : (
                      <b>보여 줄 시험이 없습니다.</b>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="rqtc-foot">
            {mode === 'req' ? (
              <>
                요구사항 {rowsN}건 · 시험 붙음 {rowsN - bare} ·{' '}
                <b className={bare ? 'rqtc-bare' : ''}>미커버 {bare}</b> — 줄을 누르면 그 요구사항의 시험을 봅니다
              </>
            ) : (
              <>시험 {rowsN}건</>
            )}
          </div>
        </section>
      </div>

      {pop && (
        <DetailPop
          kind={pop.kind}
          id={pop.id}
          req={pop.kind === 'req' ? reqs.find((x) => reqPk(x) === pop.id) : undefined}
          tcs={pop.kind === 'req' ? (tcOf.get(pop.id) ?? []) : []}
          onClose={() => setPop(null)}
          onEdit={() => {
            if (pop.kind === 'req') {
              const r = reqs.find((x) => reqPk(x) === pop.id)
              if (r) {
                setPop(null)
                setEditReq(r)
              }
            } else {
              const t = tcs.find((x) => x.tcid === pop.id)
              if (t) {
                setPop(null)
                setEditTc(t)
              }
            }
          }}
          onSeeTcs={pop.kind === 'req' ? () => { setPop(null); goTcOf(pop.id) } : undefined}
        />
      )}

      {editReq !== undefined && (
        <ReqForm
          editing={editReq}
          presetFolder={cat || null}
          onClose={() => {
            setEditReq(undefined)
            void reqQ.refetch()
          }}
        />
      )}
      {editTc !== undefined && (
        <TcForm
          editing={editTc}
          presetReqId={reqOnly || undefined}
          onClose={() => {
            setEditTc(undefined)
            void tcQ.refetch()
          }}
          onCreated={() => {
            setEditTc(undefined)
            void tcQ.refetch()
          }}
        />
      )}
    </div>
  )
}

/** 통채움 한 칸 — 셀 전체가 값의 색(먼데이). 색은 설정이 정본이다 */
function Fill({
  kind,
  v,
  cls,
  f,
}: {
  kind: string
  v?: string | null
  cls: string
  f: (kind: string, value: string) => { bg: string; fg: string }
}) {
  const val = String(v ?? '')
  if (!val)
    return (
      <div className={`${cls} rqtc-fillc`}>
        <span className="rqtc-fill none">–</span>
      </div>
    )
  const c = f(kind, val)
  return (
    <div className={`${cls} rqtc-fillc`}>
      <span className="rqtc-fill" style={{ background: c.bg, color: c.fg }}>
        {val}
      </span>
    </div>
  )
}

/**
 * 상세 팝업 — **자세히 보는 자리**(지시). 3열로는 좁아서 팝업으로 넓게 본다.
 *
 * 보는 것은 여기서 다 한다(스텝·판정·결과까지). 다만 **고치는 것은 원래
 * 부품**으로 넘긴다 — 편집기를 복제하면 두 벌이 되고, 한쪽만 고치는 날이 온다.
 */
/** 요구사항 팝업의 탭 — Requirements 화면과 같은 차례 */
const REQ_TABS: Array<{ k: 'info' | 'detail' | 'tc' | 'runs' | 'history'; label: string }> = [
  { k: 'info', label: 'Info' },
  { k: 'detail', label: 'Intent' },
  { k: 'tc', label: 'Coverages' },
  { k: 'runs', label: 'Execution History' },
  { k: 'history', label: 'Change History' },
]

/**
 * 상세 팝업 — **자세히 보는 자리**(지시). 3열로는 좁아서 팝업으로 넓게 본다.
 *
 * 요구사항은 **이미 있는 부품**(ReqDetail — Requirements 화면이 쓰는 그것)을
 * 탭으로 갈아 끼운다. 시험은 아직 그런 부품이 없어(세부 판이 TestCases 안에
 * 박혀 있다) **읽어서 보이는 것**만 한다 — 고치는 것은 Coverage 로 넘긴다.
 */
function DetailPop({
  kind,
  id,
  req,
  tcs,
  onClose,
  onEdit,
  onSeeTcs,
}: {
  kind: 'req' | 'tc'
  id: string
  req?: Requirement
  tcs: TestCaseMeta[]
  onClose: () => void
  onEdit: () => void
  onSeeTcs?: () => void
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  if (kind === 'req')
    return <ReqPop id={id} req={req} tcs={tcs} onClose={onClose} onEdit={onEdit} onSeeTcs={onSeeTcs} />

  /* ── 시험항목 ──
     TcDetail 을 얹어 봤다가 물렸다: 그 부품은 스텝 종류가 manual/auto 둘뿐이던
     시절 것이라 `data.slots` 를 읽고(지금은 `sessions`), 스텝을 kind==='auto'
     로 거른다(지금은 cli·wait·diff…). 그래서 스텝 5개짜리 시험이 **「스텝이
     없습니다」** 로 보였다(지적) — 빈 화면이 거짓말을 하는 것이 제일 나쁘다.
     제대로 된 탭(Object·Traffic·Cycle 포함)은 Coverage 의 세부 판을 부품으로
     빼야 나온다. 그때까지는 **읽어서 보여 주는 것**만 정확히 한다. */
  return <TcPop id={id} onClose={onClose} onEdit={onEdit} />
}

/**
 * 시험항목 팝업 — **Coverage 화면을 통째로 얹는다**(지시: 실제 페이지와 동일하게).
 *
 * 세부 판을 부품으로 빼 오는 대신 그 화면 자체를 끼워 넣는다. 탭(Info·Object·
 * Topology·Traffic·Manual·Automation·Execution·Cycle)과 그 안의 동작이 **같은
 * 코드**라 두 자리가 갈릴 수 없다. 베껴 만들면 한쪽만 고치는 날이 온다 —
 * 실제로 옛 부품(TcDetail)을 얹었다가 스텝을 하나도 못 읽어 물렸다.
 */
function TcPop({ id, onClose }: { id: string; onClose: () => void; onEdit: () => void }) {
  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div
        className="modal rqtc-pop full"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 머리줄은 얇게 — **이름·자리는 안쪽 화면의 빵부스러기가 말한다**
            (지시: 시험항목 옆 ID 자리를 그걸로 대체). 여기서 또 적으면 같은
            말이 두 줄이 되고, 정작 어느 폴더의 시험인지는 안 보인다. */}
        <div className="modal-head slim">
          <span className="sp" />
          <button
            className="btn small"
            type="button"
            onClick={() => {
              goto('tc', id)
              onClose()
            }}
          >
            Coverage 에서 열기
          </button>
          <button className="btn small" type="button" onClick={onClose}>
            닫기
          </button>
        </div>
        <div className="rqtc-embed">
          <TestCases embedTc={id} />
        </div>
      </div>
    </div>
  )
}

function ReqPop({
  id,
  req,
  tcs,
  onClose,
  onEdit,
  onSeeTcs,
}: {
  id: string
  req?: Requirement
  tcs: TestCaseMeta[]
  onClose: () => void
  onEdit: () => void
  onSeeTcs?: () => void
}) {
  const [tab, setTab] = useState<'info' | 'detail' | 'tc' | 'runs' | 'history'>('info')
  /* ── 요구사항 — ReqDetail 을 탭으로 갈아 끼운다 ── */
  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div className="modal rqtc-pop wide" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <b>요구사항</b>
          <span className="rqtc-popid">{req ? reqLabel(req) : id}</span>
          <span className="sp" />
          {onSeeTcs && (
            <button className="btn small" type="button" onClick={onSeeTcs}>
              이 요구사항의 시험 보기
            </button>
          )}
          <button className="btn small primary" type="button" onClick={onEdit}>
            고치기
          </button>
          <button
            className="btn small"
            type="button"
            onClick={() => {
              goto('req', id)
              onClose()
            }}
          >
            Requirements 에서 열기
          </button>
          <button className="btn small" type="button" onClick={onClose}>
            닫기
          </button>
        </div>

        <div className="rqtc-poptabs">
          {REQ_TABS.map((t) => (
            <button
              key={t.k}
              type="button"
              className={tab === t.k ? 'on' : ''}
              onClick={() => setTab(t.k)}
            >
              {t.label}
              {t.k === 'tc' && <em>{tcs.length}</em>}
            </button>
          ))}
        </div>

        <div className="rqtc-popbody">
          {!req ? (
            <div className="empty">요구사항을 찾지 못했습니다.</div>
          ) : tab === 'tc' ? (
            /* Coverages — 붙은 시험. Requirements 화면도 이 목록을 제가 그린다 */
            tcs.length ? (
              <div className="rqtc-poplist">
                {tcs.map((t) => (
                  <div className="rqtc-popline" key={t.tcid}>
                    <span className="rqtc-rid tc">{t.tcid}</span>
                    <span>{t.name || '(제목 없음)'}</span>
                    <span className="sp" />
                    {!!t.status && (
                      <span className={`rqtc-v ${statusClass(String(t.status))}`}>{String(t.status)}</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rqtc-popnone">덮는 시험이 없습니다</div>
            )
          ) : (
            <ReqDetail req={req} tcs={tcs} tab={tab} />
          )}
        </div>
      </div>
    </div>
  )
}
