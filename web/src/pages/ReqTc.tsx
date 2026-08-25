import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, categoryApi, projectApi, apiFetch, type MeUser } from '@/api/client'
import { reqLabel, reqPk, statusClass, type Requirement, type TestCaseMeta } from '@/types'
import { goto } from '@/api/goto'
import { IconChevron, IconSearch, IconSort } from '@/components/icons'
import ReqForm from '@/components/ReqForm'
import ProjectPicker, { currentProject, onProjectChange } from '@/components/ProjectPicker'
import './ReqTc.css'

interface Props {
  me?: MeUser | null
}

/**
 * REQ-TC — 요구사항과 시험을 한 판에(지시, 사진).
 *
 * 사진의 문법 그대로: **상단 가로바(제품 이름 · 프로젝트 고르기) — 폴더 트리 —
 * 요구사항 표**. 표의 **TC 칸이 곧 커버리지**다(미커버 / TC N). 캐럿을 누르면
 * 그 요구사항에 붙은 시험이 아래로 펴진다 — 여기가 REQ 와 TC 를 합쳐 보는
 * 자리라서다.
 *
 * **사업자·모델그룹·모델명은 프로젝트가 정본이다**(지시). 요구사항마다 따로
 * 적지 않는다 — 요구사항의 분류 사슬을 타고 올라가 그 프로젝트를 찾고, 거기
 * 적힌 값을 표에 세운다. 그래서 모델을 바꾸면 한 곳만 고치면 된다.
 *
 * **읽고 고치기만 한다. 구조는 안 바꾼다.** 이미 있는 /api/req · /api/tc ·
 * /api/req-categories · /api/projects 만 읽고, 고칠 때는 이미 있는 부품
 * (ReqForm)을 그대로 부른다 — 편집기를 두 벌 만들면 한쪽만 고치는 날이 온다.
 * 기존 Requirements · Coverage 화면은 손대지 않는다(지시).
 */
export default function ReqTc({ me }: Props) {
  void me
  const [cat, setCat] = useState('')
  const [openCat, setOpenCat] = useState<Set<string>>(new Set())
  const [openReq, setOpenReq] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  /** 하위 폴더까지 함께 볼까 — 사진의 「하위 폴더 포함」 */
  const [deep, setDeep] = useState(true)
  const [onlyBare, setOnlyBare] = useState(false)
  const [pop, setPop] = useState<{ kind: 'req' | 'tc'; id: string } | null>(null)
  /** undefined = 안 열림 · null = 새로 만들기 · 값 = 그 요구사항 고치기 */
  const [edit, setEdit] = useState<Requirement | null | undefined>(undefined)
  const [prj, setPrj] = useState(currentProject)
  /** 1열 머리의 찾기 — 아이콘을 눌러 폈다 접는다(사진) */
  const [findOn, setFindOn] = useState(false)
  /** 폴더 판 접기 — 표를 넓게 볼 때(사진의 접기 단추) */
  const [foldSide, setFoldSide] = useState(false)
  /** 폴더 정렬 — 이름순 · 요구사항 많은 순 */
  const [fsort, setFsort] = useState<'name' | 'req'>('name')
  /** 표에서 고른 줄 — 사진의 체크박스 */
  const [sel, setSel] = useState<Set<string>>(new Set())
  /** 로고·제품 이름은 **브랜딩 설정**이 정본이다 — 여기 박아 넣지 않는다 */
  const [brand, setBrand] = useState<{ logo?: string; name?: string }>({})

  useEffect(() => {
    void (async () => {
      try {
        const r = await apiFetch('/api/branding', { cache: 'no-store' })
        if (!r.ok) return
        const b = (await r.json()) as { logo?: string; name_text?: string }
        setBrand({ logo: b.logo, name: b.name_text })
      } catch {
        /* 못 읽어도 화면은 떠야 한다 */
      }
    })()
  }, [])

  useEffect(() => onProjectChange(() => setPrj(currentProject())), [])

  const reqQ = useQuery({ queryKey: ['reqs'], queryFn: ({ signal }) => api.listRequirements(signal) })
  const tcQ = useQuery({ queryKey: ['tcs'], queryFn: ({ signal }) => api.listTestCases(signal) })
  const catQ = useQuery({ queryKey: ['req-categories'], queryFn: ({ signal }) => categoryApi.list(signal) })
  const prjQ = useQuery({ queryKey: ['projects'], queryFn: ({ signal }) => projectApi.list(signal) })

  const reqs = useMemo(() => reqQ.data?.reqs ?? [], [reqQ.data])
  const tcs = useMemo(() => tcQ.data?.tcs ?? [], [tcQ.data])
  const cats = useMemo(() => catQ.data?.categories ?? [], [catQ.data])
  const projects = useMemo(() => prjQ.data?.projects ?? [], [prjQ.data])

  /** 분류 자식 — 트리를 그리고 「아래 전부」를 셀 때 쓴다 */
  const kids = useMemo(() => {
    const m = new Map<string, typeof cats>()
    for (const c of cats) {
      const k = c.parent_id ?? ''
      m.set(k, [...(m.get(k) ?? []), c])
    }
    return m
  }, [cats])

  /** 그 분류와 그 아래 전부 */
  const under = useMemo(() => {
    const f = (id: string): string[] => [id, ...(kids.get(id) ?? []).flatMap((c) => f(c.id))]
    return f
  }, [kids])

  /** 요구사항이 매달린 분류 — cat1~cat4 중 **가장 깊은 것**이 제자리다 */
  const catOf = (r: Requirement) => String(r.cat4 || r.cat3 || r.cat2 || r.cat1 || '')
  const catsOf = (r: Requirement) => [r.cat1, r.cat2, r.cat3, r.cat4].filter(Boolean).map(String)

  /**
   * 요구사항마다 제 시험. 잇는 키는 **req.id**(내부 키)다 — 화면에 보이는
   * reqid 로 맞추면 하나도 안 붙는다(실제로 그렇게 어긋나 있었다).
   */
  const tcOf = useMemo(() => {
    const m = new Map<string, TestCaseMeta[]>()
    for (const t of tcs) {
      const k = String(t.req_id ?? '').trim()
      if (k) m.set(k, [...(m.get(k) ?? []), t])
    }
    return m
  }, [tcs])

  /** 프로젝트로 좁히기 — 프로젝트 하나가 최상위 폴더 하나(cat_id)와 짝이다 */
  const prjCats = useMemo(() => (prj ? new Set(under(prj)) : null), [prj, under])
  const inPrj = (r: Requirement) => !prjCats || catsOf(r).some((c) => prjCats.has(c))

  /**
   * 이 요구사항이 속한 프로젝트 — **사업자·모델그룹·모델명의 정본**(지시).
   * 분류 사슬 어느 하나가 그 프로젝트의 최상위 폴더 아래면 그 프로젝트다.
   */
  const prjOf = useMemo(() => {
    const byCat = new Map<string, (typeof projects)[number]>()
    for (const p of projects) for (const c of under(p.cat_id)) byCat.set(c, p)
    return (r: Requirement) => catsOf(r).map((c) => byCat.get(c)).find(Boolean)
  }, [projects, under])

  /** 그 분류(하위 포함) 아래 요구사항·시험 수 — 트리의 R·T 배지 */
  const countOf = (id: string) => {
    const set = new Set(under(id))
    const rs = reqs.filter((r) => catsOf(r).some((c) => set.has(c)))
    return { r: rs.length, t: rs.reduce((n, r) => n + (tcOf.get(reqPk(r))?.length ?? 0), 0) }
  }

  /** 표에 실을 줄 */
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase()
    const set = cat ? new Set(under(cat)) : null
    return reqs.filter((r) => {
      if (!inPrj(r)) return false
      if (set && !(deep ? catsOf(r).some((c) => set.has(c)) : catOf(r) === cat)) return false
      if (onlyBare && (tcOf.get(reqPk(r))?.length ?? 0) > 0) return false
      if (!n) return true
      const tt = (tcOf.get(reqPk(r)) ?? []).map((t) => `${t.tcid} ${t.name ?? ''}`).join(' ')
      return `${reqLabel(r)} ${r.title ?? ''} ${tt}`.toLowerCase().includes(n)
    })
  }, [reqs, q, cat, deep, onlyBare, tcOf, prjCats, under])

  /** 빵부스러기 — 고른 폴더까지의 길 */
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

  const bare = rows.filter((r) => !(tcOf.get(reqPk(r))?.length ?? 0)).length

  if (reqQ.isLoading || tcQ.isLoading) return <div className="empty">불러오는 중…</div>
  if (reqQ.error) return <div className="load-error">{(reqQ.error as Error).message}</div>

  /** 폴더 한 가지 */
  const Tree = ({ parent, depth }: { parent: string | null; depth: number }) => (
    <>
      {[...(kids.get(parent ?? '') ?? [])]
        .sort((a, b) => (fsort === 'name' ? a.name.localeCompare(b.name) : countOf(b.id).r - countOf(a.id).r))
        .map((c) => {
        const kid = kids.get(c.id) ?? []
        const on = openCat.has(c.id)
        const n = countOf(c.id)
        const root = depth === 0
        return (
          <div key={c.id}>
            <div
              className={`rqtc-fold${cat === c.id ? ' on' : ''}${root ? ' root' : ''}`}
              style={{ paddingLeft: 6 + depth * 14 }}
              onClick={() => setCat(cat === c.id ? '' : c.id)}
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
                {root ? '🗂' : '📁'}
              </span>
              <span className="rqtc-fnm">{c.name}</span>
              <span className="rqtc-rt">
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
      {/* ── 상단 가로바(지시, 사진) — **이 화면 안에만** 둔다.
             기존 화면의 틀(Layout)은 안 건드린다(지시: REQ-TC 만). ── */}
      <header className="rqtc-top">
        {brand.logo ? (
          <img className="rqtc-logo" src={brand.logo} alt="" />
        ) : (
          <span className="rqtc-logo ph" aria-hidden="true">
            U
          </span>
        )}
        <span className="rqtc-brand">{brand.name || 'ubiQuoss'} Test Orchestration Platform</span>
        <ProjectPicker />
        <span className="sp" />
        <span className="rqtc-topinfo">
          요구사항 {rows.length}건
          {bare > 0 && <b className="rqtc-barebadge">미커버 {bare}</b>}
        </span>
      </header>

      <div className={`rqtc${foldSide ? ' folded' : ''}`}>
        {/* 접었을 때 — 다시 펴는 단추만 가느다랗게 남긴다 */}
        {foldSide && (
          <button
            type="button"
            className="rqtc-unfold"
            title="폴더 판 펴기"
            onClick={() => setFoldSide(false)}
          >
            ⇥
          </button>
        )}
        {/* ── 폴더 트리 ── */}
        {!foldSide && (
        <aside className="panel rqtc-side">
          <div className="rqtc-sidehead">
            <b>Folder Tree</b>
            <span className="sp" />
            {/* 찾기·정렬·더보기 — 사진의 머리줄 */}
            <button
              type="button"
              className={`rqtc-ib${findOn || q ? ' on' : ''}`}
              title="찾기"
              onClick={() => {
                setFindOn((v) => !v)
                if (findOn) setQ('')
              }}
            >
              <IconSearch />
            </button>
            <button
              type="button"
              className="rqtc-ib"
              title={fsort === 'name' ? '이름순 (눌러서 요구사항 많은 순)' : '요구사항 많은 순 (눌러서 이름순)'}
              onClick={() => setFsort((v) => (v === 'name' ? 'req' : 'name'))}
            >
              <IconSort />
            </button>
            <button type="button" className="rqtc-ib" title="더 보기">
              ⋯
            </button>
            {/* 폴더 판 접기 — 표를 넓게 본다(지적: 접기 단추가 없다) */}
            <button
              type="button"
              className="rqtc-ib"
              title="폴더 판 접기"
              onClick={() => setFoldSide(true)}
            >
              ⇤
            </button>
          </div>
          {/* ＋ New Folder — 고른 폴더 **아래**에 만든다(안 고르면 최상위) */}
          <div className="rqtc-newf">
            <button
              className="btn small"
              type="button"
              onClick={() => {
                const nm = window.prompt(
                  cat ? '새 폴더 이름 (고른 폴더 아래에 만듭니다)' : '새 폴더 이름 (최상위)',
                )?.trim()
                if (!nm) return
                void categoryApi.create(nm, cat || null).then(() => {
                  void catQ.refetch()
                  if (cat) setOpenCat((o) => new Set([...o, cat]))
                })
              }}
            >
              ＋ New Folder
            </button>
          </div>
          {(findOn || q) && (
            <div className="rqtc-sidetools">
              <input
                className="rqtc-q"
                autoFocus
                value={q}
                placeholder="요구사항 · 시험 찾기"
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          )}
          <div className="rqtc-tree">
            <div className={`rqtc-fold${cat === '' ? ' on' : ''}`} onClick={() => setCat('')}>
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

        {/* ── 요구사항 표 ── */}
        <section className="panel rqtc-main">
          <div className="rqtc-crumb">
            {crumb.length ? (
              crumb.map((c, i) => (
                <span key={c.id}>
                  {i > 0 && <i className="rqtc-sep">›</i>}
                  <button type="button" className="rqtc-crumbgo" onClick={() => setCat(c.id)}>
                    {c.name}
                  </button>
                </span>
              ))
            ) : (
              <b>전체</b>
            )}
            <span className="rqtc-crumbn">
              {rows.length}건
              {cat && (
                <label className="rqtc-deep" title="하위 폴더의 요구사항까지 함께 봅니다">
                  <input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} />
                  하위 폴더 포함
                </label>
              )}
            </span>
          </div>

          <div className="rqtc-bar">
            {/* 만드는 창은 **이미 있는 것**(ReqForm)을 그대로 부른다 */}
            <button className="btn small primary" type="button" onClick={() => setEdit(null)}>
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
            <label className="rqtc-only">
              <input type="checkbox" checked={onlyBare} onChange={(e) => setOnlyBare(e.target.checked)} />
              미커버만
            </label>
          </div>

          <div className="rqtc-tbl">
            <div className="rqtc-tr rqtc-th">
              <div className="c-chk">
                <input
                  type="checkbox"
                  aria-label="전체 고르기"
                  checked={rows.length > 0 && sel.size === rows.length}
                  ref={(el) => {
                    if (el) el.indeterminate = sel.size > 0 && sel.size < rows.length
                  }}
                  onChange={(e) => setSel(e.target.checked ? new Set(rows.map(reqPk)) : new Set())}
                />
              </div>
              <div className="c-caret" />
              <div className="c-title">제목</div>
              <div className="c-mg">모델그룹</div>
              <div className="c-md">모델명</div>
              <div className="c-tc">TC</div>
              <div className="c-st">상태</div>
              <div className="c-pr">우선순위</div>
            </div>

            {rows.map((r) => {
              const pk = reqPk(r)
              const list = tcOf.get(pk) ?? []
              const on = openReq.has(pk)
              const p = prjOf(r)
              return (
                <div key={pk}>
                  <div
                    className={`rqtc-tr${sel.has(pk) ? ' picked' : ''}`}
                    onClick={() => setPop({ kind: 'req', id: pk })}
                  >
                    <div className="c-chk" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label="고르기"
                        checked={sel.has(pk)}
                        onChange={() => toggle(sel, pk, setSel)}
                      />
                    </div>
                    <div className="c-caret">
                      <button
                        type="button"
                        className={`rqtc-caret${on ? ' open' : ''}`}
                        disabled={!list.length}
                        aria-label={on ? '접기' : '펴기'}
                        onClick={(e) => {
                          e.stopPropagation()
                          toggle(openReq, pk, setOpenReq)
                        }}
                      >
                        <IconChevron />
                      </button>
                    </div>
                    <div className="c-title">
                      <span className="rqtc-rid">{reqLabel(r)}</span>
                      <span className="rqtc-rtitle">{r.title || '(제목 없음)'}</span>
                    </div>
                    {/* 사업자·모델은 **프로젝트가 정본**이라 여기서 끌어다 쓴다 */}
                    <div className="c-mg">{p?.model_group || '–'}</div>
                    <div className="c-md">{p?.model || '–'}</div>
                    <div className="c-tc" onClick={(e) => e.stopPropagation()}>
                      {/* 배지를 눌러도 펴진다 — 캐럿만으로는 인라인이 있는 줄 모른다(지적) */}
                      <button
                        type="button"
                        className={`rqtc-cov ${list.length ? 'ok' : 'no'}${list.length ? ' go' : ''}`}
                        title={list.length ? (on ? '접기' : '붙은 시험 펴기') : '덮는 시험이 없습니다'}
                        onClick={() => list.length && toggle(openReq, pk, setOpenReq)}
                      >
                        {list.length ? `TC ${list.length}` : '미커버'}
                      </button>
                    </div>
                    <div className="c-st">{r.status || '–'}</div>
                    <div className="c-pr">{r.priority || '–'}</div>
                  </div>

                  {/* 붙은 시험 — 합쳐 보는 자리라서 아래로 편다 */}
                  {on &&
                    list.map((t) => (
                      <div
                        className="rqtc-tr rqtc-sub"
                        key={t.tcid}
                        onClick={() => setPop({ kind: 'tc', id: t.tcid })}
                      >
                        <div className="c-chk" />
                        <div className="c-caret" />
                        <div className="c-title">
                          <span className="rqtc-rid tc">{t.tcid}</span>
                          <span className="rqtc-rtitle">{t.name || '(제목 없음)'}</span>
                        </div>
                        <div className="c-mg">{p?.model_group || '–'}</div>
                        <div className="c-md">{p?.model || '–'}</div>
                        <div className="c-tc">
                          <span className="rqtc-kind">{String(t.kind ?? t.type ?? '') || '시험'}</span>
                        </div>
                        <div className="c-st">
                          {t.status ? (
                            <span className={`rqtc-v ${statusClass(String(t.status))}`}>{String(t.status)}</span>
                          ) : (
                            '–'
                          )}
                        </div>
                        <div className="c-pr">{String(t.severity ?? '') || '–'}</div>
                      </div>
                    ))}
                </div>
              )
            })}
            {!rows.length && <div className="empty">보여 줄 요구사항이 없습니다.</div>}
          </div>
        </section>
      </div>

      {pop && (
        <DetailPop
          kind={pop.kind}
          id={pop.id}
          onClose={() => setPop(null)}
          onEdit={
            pop.kind === 'req'
              ? () => {
                  const r = reqs.find((x) => reqPk(x) === pop.id)
                  if (r) {
                    setPop(null)
                    setEdit(r)
                  }
                }
              : undefined
          }
        />
      )}

      {/* 요구사항 만들기·고치기 — **이미 있는 창**을 그대로 부른다 */}
      {edit !== undefined && (
        <ReqForm
          editing={edit}
          presetFolder={cat || null}
          onClose={() => {
            setEdit(undefined)
            void reqQ.refetch()
          }}
        />
      )}
    </div>
  )
}

/**
 * 상세 팝업 — 3열로는 좁아서 팝업으로 넓게 본다(지시).
 *
 * 고치는 것은 **원래 부품**으로 넘긴다: 요구사항은 ReqForm, 시험은 Coverage.
 * 편집기를 여기 복제하면 두 벌이 되고, 한쪽만 고치는 날이 온다.
 */
function DetailPop({
  kind,
  id,
  onClose,
  onEdit,
}: {
  kind: 'req' | 'tc'
  id: string
  onClose: () => void
  onEdit?: () => void
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  const q = useQuery({
    queryKey: ['rqtc-detail', kind, id],
    queryFn: async () => {
      const r = await apiFetch(
        kind === 'req' ? `/api/req/${encodeURIComponent(id)}` : `/api/tc/${encodeURIComponent(id)}`,
      )
      if (!r.ok) throw new Error('불러오지 못했습니다')
      return (await r.json()) as Record<string, unknown>
    },
  })

  const d = q.data ?? {}
  const steps = Array.isArray(d.checks) ? (d.checks as Array<Record<string, unknown>>) : []

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div className="modal rqtc-pop" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <b>{kind === 'req' ? '요구사항' : '시험항목'}</b>
          <span className="rqtc-popid">{String(d.reqid || d.tcid || id)}</span>
          <span className="sp" />
          {onEdit && (
            <button className="btn small primary" type="button" onClick={onEdit}>
              고치기
            </button>
          )}
          <button
            className="btn small"
            type="button"
            onClick={() => {
              goto(kind, String(d.id || d.tcid || id))
              onClose()
            }}
          >
            {kind === 'req' ? 'Requirements 에서 열기' : 'Coverage 에서 열기'}
          </button>
          <button className="btn small" type="button" onClick={onClose}>
            닫기
          </button>
        </div>

        <div className="rqtc-popbody">
          {q.isLoading ? (
            <div className="empty">불러오는 중…</div>
          ) : q.error ? (
            <div className="load-error">{(q.error as Error).message}</div>
          ) : (
            <>
              <h3 className="rqtc-poptitle">{String(d.title || d.name || '(제목 없음)')}</h3>
              <div className="rqtc-kv">
                {(
                  [
                    ['상태', d.status],
                    ['우선순위', d.priority],
                    ['유형', d.type],
                    ['심각도', d.severity],
                    ['모델', d.model],
                    ['만든이', d.created_by],
                    ['고친이', d.updated_by],
                  ] as Array<[string, unknown]>
                )
                  .filter(([, v]) => v !== undefined && v !== null && String(v) !== '')
                  .map(([k, v]) => (
                    <div className="rqtc-kvi" key={k}>
                      <i>{k}</i>
                      <b>{String(v)}</b>
                    </div>
                  ))}
              </div>

              {kind === 'req' && Array.isArray(d.tc) && (d.tc as unknown[]).length > 0 && (
                <>
                  <h4 className="rqtc-poph">붙은 시험 {(d.tc as unknown[]).length}건</h4>
                  <div className="rqtc-poplist">
                    {(d.tc as Array<Record<string, unknown>>).map((t, i) => (
                      <div className="rqtc-popline" key={i}>
                        <span className="rqtc-rid tc">{String(t.tcid ?? '')}</span>
                        <span>{String(t.name ?? '')}</span>
                        <span className="sp" />
                        {!!t.status && (
                          <span className={`rqtc-v ${statusClass(String(t.status))}`}>{String(t.status)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {kind === 'tc' && steps.length > 0 && (
                <>
                  <h4 className="rqtc-poph">스텝 {steps.length}개</h4>
                  <div className="rqtc-poplist">
                    {steps.map((s, i) => (
                      <div className="rqtc-popline" key={i}>
                        <span className="rqtc-rid">#{i + 1}</span>
                        <span className="rqtc-kind">{String(s.kind ?? s.action ?? '')}</span>
                        <span className="mono">{String(s.cli ?? s.step ?? s.desc ?? '')}</span>
                        <span className="sp" />
                        {!!s.repeatResult && (
                          <span className={`rqtc-v ${statusClass(String(s.repeatResult))}`}>
                            {String(s.repeatResult)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {!!d.overview && <p className="rqtc-desc">{String(d.overview)}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
