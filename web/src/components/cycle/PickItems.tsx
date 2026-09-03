/**
 * **시험 항목 고르기** — 목업대로, 사이클에 담을 항목을 체크로 고른다.
 *
 * 전에는 옛 편집 창(CycleEdit)의 큰 팝업이 떴다. 요구사항 트리·필터 여섯
 * 개·공용 항목 토글까지 한 화면에 펴 놓아, 정작 알아야 할 것 — **이 항목이
 * 자동인가 수동인가** — 가 어디에도 없었다. 사이클은 담긴 항목의 방식대로
 * 자동·수동 실행을 뜨므로, 그것이 고를 때 가장 중요한 값이다.
 *
 * 자동·수동의 정본은 **TC 의 run_type** 이다(REQ-Coverage 의 실행 타입).
 * 목록 API 는 kind 를 안 실어 보내므로 그것만 보면 전부 자동으로 뜬다.
 */
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, apiFetch, categoryApi } from '@/api/client'
import { normMode } from '@/lib/runMode'
import { IconChevron, IconFolder, IconProject } from '@/components/icons'
import { buildCategoryTree, reqPk } from '@/types'
import type { CategoryTreeNode, Requirement, TestCaseMeta } from '@/types'
import type { CycleMeta } from '@/pages/Cycles'
import './PickItems.css'

type Tab = 'all' | 'a' | 'm'

export default function PickItems({
  cycle,
  onClose,
  onDone,
}: {
  cycle: CycleMeta
  onClose: () => void
  /** 담기를 마쳤다 — 부르는 쪽이 목록을 다시 읽는다 */
  onDone: () => void
}) {
  const [tab, setTab] = useState<Tab>('all')
  const [q, setQ] = useState('')
  /** 담긴 것 — 창을 여는 순간의 사이클 항목에서 시작한다 */
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  /** 이 모델 것만 볼까 — 60여 건 중에서 고르려면 좁힐 자리가 필요하다 */
  const [mine, setMine] = useState(true)
  /** 공용 항목(모델이 안 적힌 것)도 볼까 — **기본은 켬** */
  const [common, setCommon] = useState(true)
  /** 고른 요구사항 폴더 — 그 아래(하위 포함) 시험만 남긴다 */
  const [catSel, setCatSel] = useState('')
  /** 펼친 폴더 */
  const [openCat, setOpenCat] = useState<Set<string>>(new Set())

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose, busy])

  /* 담긴 항목은 **전문**에서 읽는다 — 목록의 요약본은 항목을 깎아 준다.
     읽기가 실패하면 **저장을 막는다.** 빈 채로 시작해 두면 「완료」 가
     `keep = 원래항목.filter(고른것)` 을 빈 배열로 만들어 **담겨 있던 항목을
     통째로 지운다** — 고르지도 않았는데 사라진다. */
  const [loadErr, setLoadErr] = useState('')
  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const r = await apiFetch(`/api/cycle/${encodeURIComponent(cycle.id)}`)
        if (!r.ok) throw new Error('사이클을 불러오지 못했습니다')
        const j = (await r.json()) as { items?: Array<{ tcid?: string }> }
        if (!live) return
        setPicked(new Set((j.items ?? []).map((x) => String(x?.tcid ?? '')).filter(Boolean)))
        setLoadErr('')
        setReady(true)
      } catch (e) {
        if (live) setLoadErr(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      live = false
    }
  }, [cycle.id])

  const tcQ = useQuery({
    queryKey: ['tc-meta'],
    staleTime: 60_000,
    queryFn: async () => {
      const r = await apiFetch('/api/tc?meta=1')
      if (!r.ok) throw new Error('시험 항목을 불러오지 못했습니다')
      return (await r.json()) as { tcs: TestCaseMeta[] }
    },
  })

  /* 왼쪽 폴더 — **요구사항 분류**다. 옛 팝업이 이걸 갖고 있었고, 없으면
     57건을 스크롤로만 뒤져야 한다(지적: 폴더트리가 사라졌다). */
  const reqQ = useQuery({
    queryKey: ['reqs'],
    staleTime: 60_000,
    queryFn: ({ signal }) => api.listRequirements(signal),
  })
  const catQ = useQuery({
    queryKey: ['req-categories'],
    staleTime: 60_000,
    queryFn: ({ signal }) => categoryApi.list(signal),
  })
  const reqs: Requirement[] = useMemo(() => reqQ.data?.reqs ?? [], [reqQ.data])
  const cats = useMemo(() => buildCategoryTree(catQ.data?.categories ?? []), [catQ.data])

  /** 요구사항이 안 붙은 시험을 모으는 자리 — 실존 id 와 겹치지 않는 표식 */
  const NO_REQ = '__noreq__'

  /** 그 폴더(하위 포함) 아래 요구사항의 pk — 이걸로 시험을 좁힌다 */
  const underCat = useMemo(() => {
    if (!catSel) return null
    if (catSel === NO_REQ) return new Set<string>()
    const ids = new Set<string>()
    const walk = (n: CategoryTreeNode) => {
      ids.add(n.id)
      n.children.forEach(walk)
    }
    const find = (list: CategoryTreeNode[]): CategoryTreeNode | undefined => {
      for (const n of list) {
        if (n.id === catSel) return n
        const hit = find(n.children)
        if (hit) return hit
      }
      return undefined
    }
    const start = find(cats)
    if (start) walk(start)
    const pks = new Set<string>()
    for (const r of reqs)
      if (ids.has(String(r.cat4 || r.cat3 || r.cat2 || r.cat1 || ''))) pks.add(reqPk(r))
    return pks
  }, [catSel, cats, reqs])

  /** 자동·수동 — run_type 이 정본 */
  const isMan = (t: TestCaseMeta) => normMode(String(t.run_type ?? t.kind ?? '')) === '수동'

  const all = useMemo(() => tcQ.data?.tcs ?? [], [tcQ.data])
  /** 모델이 안 적힌 시험 = **공용**. 어느 모델에나 쓴다.
      213 에는 8건이 그렇고, 수동 시험 4건이 전부 여기 들었다 — 「이 모델」
      로만 거르면 수동 탭이 통째로 0이 된다(지적: 수동을 못 가져온다). */
  const isCommon = (t: TestCaseMeta) =>
    !String(t.model ?? '').trim() && !String(t.model_group ?? '').trim()
  const nMine = useMemo(() => {
    const m = String(cycle.model ?? '')
    const g = String(cycle.model_group ?? '')
    return all.filter(
      (t) =>
        !isCommon(t) && (String(t.model ?? '') === m || String(t.model_group ?? '') === g),
    ).length
  }, [all, cycle])
  const nCommon = useMemo(() => all.filter(isCommon).length, [all])

  /** 이 사이클의 모델(또는 모델그룹) 것 + 공용 */
  const ofModel = useMemo(() => {
    const m = String(cycle.model ?? '')
    const g = String(cycle.model_group ?? '')
    return all.filter((t) => {
      if (isCommon(t)) return common
      if (!m && !g) return true
      return String(t.model ?? '') === m || String(t.model_group ?? '') === g
    })
  }, [all, cycle, common])

  /** 폴더 셈의 바탕 — 모델까지만 좁힌다(폴더로 또 좁히면 제 셈이 0이 된다) */
  const base = mine ? ofModel : all
  const inCat = (t: TestCaseMeta) => {
    if (!underCat) return true
    const rid = String(t.req_id ?? '').trim()
    return catSel === NO_REQ ? !rid : underCat.has(rid)
  }
  const byCat = useMemo(
    () => ofModel.filter(inCat),
    // inCat 은 underCat·catSel 에서 나온다
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ofModel, underCat, catSel],
  )
  const wide = useMemo(() => all.filter((t) => (isCommon(t) ? common : true)), [all, common])
  const pool = mine ? byCat : wide.filter(inCat)
  const nAuto = pool.filter((t) => !isMan(t)).length
  const nMan = pool.length - nAuto

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return pool
      .filter((t) => (tab === 'all' ? true : tab === 'm' ? isMan(t) : !isMan(t)))
      .filter(
        (t) =>
          !s ||
          String(t.tcid).toLowerCase().includes(s) ||
          String(t.name ?? '').toLowerCase().includes(s),
      )
  }, [pool, tab, q])

  const pickedAuto = useMemo(() => {
    let a = 0
    for (const t of all) if (picked.has(t.tcid) && !isMan(t)) a++
    return a
  }, [all, picked])

  function toggle(tcid: string) {
    setPicked((cur) => {
      const n = new Set(cur)
      if (n.has(tcid)) n.delete(tcid)
      else n.add(tcid)
      return n
    })
  }

  /** 담기 — **전문을 읽어 얹는다.** 요약본을 되쓰면 실행 결과가 지워진다 */
  async function save() {
    setBusy(true)
    try {
      const r = await apiFetch(`/api/cycle/${encodeURIComponent(cycle.id)}`)
      if (!r.ok) throw new Error('사이클을 불러오지 못했습니다')
      const full = (await r.json()) as Record<string, unknown> & {
        items?: Array<Record<string, unknown>>
      }
      const was = full.items ?? []
      /* 담겨 있던 것이 **하나도 안 남는다면** 되묻는다. 고르기 창을 열었다가
         아무것도 안 건드리고 닫는 손이 흔한데, 그 한 번이 담긴 항목을
         전부 지우면 되돌릴 길이 없다. */
      if (was.length && !picked.size) {
        if (!window.confirm(`담겨 있던 시험 항목 ${was.length}건을 모두 뺍니다. 그대로 할까요?`)) {
          setBusy(false)
          return
        }
      }
      const keep = was.filter((x) => picked.has(String(x?.tcid ?? '')))
      const had = new Set(keep.map((x) => String(x?.tcid ?? '')))
      /* 새로 담긴 것 — 결과 칸은 비운 채로. 이름은 목록에서 가져온다 */
      const add = [...picked]
        .filter((id) => !had.has(id))
        .map((id) => ({
          tcid: id,
          name: String(all.find((t) => t.tcid === id)?.name ?? ''),
          steps: [],
        }))
      const w = await apiFetch(`/api/cycle/${encodeURIComponent(cycle.id)}`, {
        method: 'POST',
        body: JSON.stringify({ ...full, items: [...keep, ...add] }),
      })
      if (!w.ok) throw new Error('담지 못했습니다')
      onDone()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  /** 요구사항이 안 붙은 시험 수 — 있으면 트리에 그 자리를 만든다 */
  const nNoReq = useMemo(
    () => base.filter((t) => !String(t.req_id ?? '').trim()).length,
    [base],
  )

  /** 폴더 한 마디 — 그 아래에 시험이 하나도 없으면 안 그린다 */
  const renderCat = (n: CategoryTreeNode): React.ReactNode => {
    const deep = (x: CategoryTreeNode): number => {
      const ids = new Set<string>()
      const walk = (y: CategoryTreeNode) => {
        ids.add(y.id)
        y.children.forEach(walk)
      }
      walk(x)
      const pks = new Set(
        reqs
          .filter((r) => ids.has(String(r.cat4 || r.cat3 || r.cat2 || r.cat1 || '')))
          .map(reqPk),
      )
      return base.filter((t) => pks.has(String(t.req_id ?? ''))).length
    }
    const n2 = deep(n)
    if (!n2) return null
    const open = openCat.has(n.id)
    return (
      <div key={n.id}>
        <div
          className={`pki-cat${catSel === n.id ? ' on' : ''}`}
          role="button"
          tabIndex={0}
          style={{ paddingLeft: 4 + (n.depth - 1) * 12 }}
          /* 누르는 것은 **고르기**다. 접고 펴는 것은 화살표 몫 — 누를 때마다
             접히면 고르러 간 손이 트리를 흔든다. */
          onClick={() => setCatSel(catSel === n.id ? '' : n.id)}
          onKeyDown={(e) => e.key === 'Enter' && setCatSel(catSel === n.id ? '' : n.id)}
        >
          <button
            type="button"
            className={`pki-caret${open ? ' open' : ''}${n.children.length ? '' : ' none'}`}
            aria-label={open ? '접기' : '펼치기'}
            onClick={(e) => {
              e.stopPropagation()
              setOpenCat((cur) => {
                const x = new Set(cur)
                if (x.has(n.id)) x.delete(n.id)
                else x.add(n.id)
                return x
              })
            }}
          >
            <IconChevron />
          </button>
          {/* REQ-Coverage 와 같은 폴더 모양 — 최상위는 프로젝트 아이콘,
              그 아래는 폴더. 펼친 것과 닫힌 것의 모양이 다르다. */}
          <span className="pki-ficon" aria-hidden="true">
            {n.depth === 1 ? <IconProject /> : <IconFolder open={open} />}
          </span>
          <span className="nm">{n.name}</span>
          <span className="c">{n2}</span>
        </div>
        {open && n.children.map(renderCat)}
      </div>
    )
  }

  const where = [cycle.version || cycle.name, cycle.customer, cycle.model]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="pki-back" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="pki" role="dialog" aria-modal="true" aria-label="시험 항목 고르기">
        <header className="pki-head">
          <b>시험 항목 고르기</b>
          <span className="pki-where">{where}</span>
          <span className="pki-sp" />
          <button type="button" className="pki-x" title="닫기" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="pki-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'all'}
            className={tab === 'all' ? 'on' : ''}
            onClick={() => setTab('all')}
          >
            전체 <span className="n">{pool.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'a'}
            className={tab === 'a' ? 'on' : ''}
            onClick={() => setTab('a')}
          >
            ⚙ 자동 <span className="n">{nAuto}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'm'}
            className={tab === 'm' ? 'on' : ''}
            onClick={() => setTab('m')}
          >
            ✋ 수동 <span className="n">{nMan}</span>
          </button>
          <span className="pki-sp" />
          <input
            className="pki-q"
            value={q}
            placeholder="ID · 제목 찾기"
            onChange={(e) => setQ(e.target.value)}
          />
          <span className="pki-cnt2">
            이 모델 {nMine}건 · 공용 {nCommon}건
          </span>
          <label className="pki-only" title="이 사이클의 모델·모델그룹 것만 봅니다">
            <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
            이 모델만
          </label>
          <label className="pki-only" title="모델이 안 적힌 시험 — 어느 모델에나 씁니다">
            <input type="checkbox" checked={common} onChange={(e) => setCommon(e.target.checked)} />
            공용 항목
          </label>
        </div>

        <div className="pki-body">
        <aside className="pki-tree">
          <div className="pki-treehd">
            요구사항
            {!!catSel && (
              <button type="button" className="pki-clear" onClick={() => setCatSel('')}>
                전체 보기
              </button>
            )}
          </div>
          <div className="pki-treebody">
            {catQ.isLoading ? (
              <div className="pki-none">불러오는 중…</div>
            ) : (
              <>
                {cats.map(renderCat)}
                {!!nNoReq && (
                  <div
                    className={`pki-cat${catSel === NO_REQ ? ' on' : ''}`}
                    role="button"
                    tabIndex={0}
                    style={{ paddingLeft: 4 }}
                    onClick={() => setCatSel(catSel === NO_REQ ? '' : NO_REQ)}
                    onKeyDown={(e) =>
                      e.key === 'Enter' && setCatSel(catSel === NO_REQ ? '' : NO_REQ)
                    }
                  >
                    <span className="pki-caret none" />
                    <span className="pki-ficon" aria-hidden="true">
                      <IconFolder />
                    </span>
                    <span className="nm">(요구사항 없음)</span>
                    <span className="c">{nNoReq}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </aside>
        <div className="pki-rows">
          {loadErr ? (
            <div className="pki-none">
              {loadErr}
              <br />
              창을 닫고 다시 열어 주세요 — 이대로 담으면 담겨 있던 항목이 사라집니다.
            </div>
          ) : !ready || tcQ.isLoading ? (
            <div className="pki-none">불러오는 중…</div>
          ) : !shown.length ? (
            <div className="pki-none">고를 항목이 없습니다.</div>
          ) : (
            shown.map((t) => {
              const man = isMan(t)
              const on = picked.has(t.tcid)
              return (
                <label key={t.tcid} className={`pki-row${on ? ' on' : ''}`}>
                  <input type="checkbox" checked={on} onChange={() => toggle(t.tcid)} />
                  <span className="id">{t.tcid}</span>
                  <span className="nm">{t.name ?? ''}</span>
                  <span className={`pki-pill ${man ? 'amber' : 'blue'}`}>
                    {man ? '✋ 수동' : '⚙ 자동'}
                  </span>
                  <span className="pki-pill gray">{String(t.status ?? '')}</span>
                </label>
              )
            })
          )}
        </div>
        </div>

        <footer className="pki-foot">
          <span className="pki-cnt">
            담긴 항목 <b>자동 {pickedAuto}</b> · <b>수동 {picked.size - pickedAuto}</b>
          </span>
          <span className="pki-sp" />
          <button type="button" className="btn small" disabled={busy} onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className="btn small pki-go"
            disabled={busy || !ready}
            onClick={() => void save()}
          >
            {busy ? '담는 중…' : '완료'}
          </button>
        </footer>
      </div>
    </div>
  )
}
