/**
 * **시험 항목 담기 드로어** (지시: 목업 반영 — Cycles 새 화면의 담기 창).
 *
 * REQ-Coverage 계층(폴더 ▸ REQ ▸ 시험 항목)을 그대로 띄우고, 고른 단위로
 * 담는다. 담는 단위는 세그먼트로 고른다 —
 *   폴더        트리에서 폴더를 누르면 그 아래 시험이 모두 담긴다
 *   REQ         폴더는 캡션 한 줄로 접고, REQ 를 골라 담는다
 *   시험 항목    항목을 하나씩 고른다 (모델그룹·모델명·타입 열이 선다)
 *
 * **더하기만 한다.** 이미 담긴 항목은 어떤 필터에서도 후보가 아니다 —
 * 「이미 담긴 항목 제외」 칩은 그것을 화면에서 숨길지(기본)·눕혀 보일지만
 * 고른다. 빼기는 시험 항목 탭의 ✕ 가 맡는다. 열었다 그냥 닫는 손이 담긴
 * 것을 지우는 사고(PickItems 가 되묻어 막던 그 사고)가 아예 없다.
 *
 * 필터(타입·검색)는 **표시와 담길 것**을 바꾸지만 고른 표시(picked)는
 * 지우지 않는다 — 필터를 되돌리면 선택이 그대로 복원된다. 실제 담기는
 * 값은 늘 picked ∩ 후보(effPicked)다.
 *
 * 고를 수 있는 것은 **모델그룹·모델명이 맞는 시험만** — 담기 정책은
 * PickItems 와 같은 규칙 한 벌이다.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, apiFetch, categoryApi } from '@/api/client'
import { normMode } from '@/lib/runMode'
import { IconChevron } from '@/components/icons'
import { buildCategoryTree, reqPk } from '@/types'
import type { CategoryTreeNode, Requirement, TestCaseMeta } from '@/types'
import type { CycleMeta } from '@/pages/Cycles'
import { orderTcIds, useReqIndex } from '@/pages/qaBits'
import './AddItems.css'

type Base = 'folder' | 'req' | 'tc'
/** 요구사항이 안 붙은 시험을 모으는 자리 — 실존 id 와 안 겹치는 표식 */
const NO_REQ = '__noreq__'

export default function AddItems({
  cycle,
  by,
  onClose,
  onDone,
}: {
  cycle: CycleMeta
  /** 저장에 남길 이름 — 실시간 알림이 「누가 담았나」 를 이걸로 말한다 */
  by?: string
  onClose: () => void
  /** 담기를 마쳤다 — 부르는 쪽이 목록을 다시 읽는다 */
  onDone: () => void
}) {
  const [base, setBase] = useState<Base>('folder')
  const [q, setQ] = useState('')
  const [typeF, setTypeF] = useState<'' | 'A' | 'M'>('')
  /** 이미 담긴 항목 제외 — 기본 켬(숨김). 끄면 「이미 담김」 으로 눕혀 보인다 */
  const [onlyNew, setOnlyNew] = useState(true)
  /** 고른 시험 항목 — 필터로 가려져도 지우지 않는다(effPicked 가 거른다) */
  const [picked, setPicked] = useState<Set<string>>(new Set())
  /** 펼친 폴더(분류 id) — 기본은 최상위만 보이고 접혀 있다 */
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [wideDr, setWideDr] = useState(false)
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose, busy])

  /* ── 자료 ── */
  const tcQ = useQuery({
    queryKey: ['tc-meta'],
    staleTime: 60_000,
    queryFn: async () => {
      const r = await apiFetch('/api/tc?meta=1')
      if (!r.ok) throw new Error('시험 항목을 불러오지 못했습니다')
      return (await r.json()) as { tcs: TestCaseMeta[] }
    },
  })
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
  /** 저장 차례(폴더 ▸ REQ ▸ ID)를 세울 때 쓴다 — 표·실행기와 같은 규칙 */
  const reqIndex = useReqIndex()
  /** 담긴 항목 — 전문에서 읽는다. 읽기가 실패하면 담기를 막는다 */
  const [inCycle, setInCycle] = useState<Set<string> | null>(null)
  const [loadErr, setLoadErr] = useState('')
  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const r = await apiFetch(`/api/cycle/${encodeURIComponent(cycle.id)}`)
        if (!r.ok) throw new Error('사이클을 불러오지 못했습니다')
        const j = (await r.json()) as { items?: Array<{ tcid?: string }> }
        if (!live) return
        setInCycle(new Set((j.items ?? []).map((x) => String(x?.tcid ?? '')).filter(Boolean)))
      } catch (e) {
        if (live) setLoadErr(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      live = false
    }
  }, [cycle.id])

  /* 자료가 덜 온 채로 트리를 세우면 — 이미 담긴 것이 표식 없이 골라지고,
     REQ 가 늦으면 「없습니다」 가 먼저 깜빡인다. 다 오기 전에는 안 세운다. */
  const loading =
    tcQ.isLoading || reqQ.isLoading || catQ.isLoading || (inCycle === null && !loadErr)

  const all = useMemo(() => tcQ.data?.tcs ?? [], [tcQ.data])
  const reqs: Requirement[] = useMemo(() => reqQ.data?.reqs ?? [], [reqQ.data])
  const cats = useMemo(() => buildCategoryTree(catQ.data?.categories ?? []), [catQ.data])

  const isMan = (t: TestCaseMeta) => normMode(String(t.run_type ?? t.kind ?? '')) === '수동'

  /** 모델그룹·모델명이 맞는 시험만 — PickItems 와 같은 규칙 */
  const ofModel = useMemo(() => {
    const m = String(cycle.model ?? '').trim()
    const g = String(cycle.model_group ?? '').trim()
    if (!m && !g) return all
    return all.filter((t) => {
      const tm = String(t.model ?? '').trim()
      const tg = String(t.model_group ?? '').trim()
      if (!tm && !tg) return false
      return (!!m && tm === m) || (!!g && tg === g)
    })
  }, [all, cycle])

  const already = inCycle ?? new Set<string>()
  /** 담기 후보 — 타입 필터를 지난 것. 이미 담긴 것은 **언제나** 뺀다
      (더하기만 하므로 「이미 담긴 항목 제외」 칩과 무관하다) */
  const cands = useMemo(
    () =>
      ofModel.filter((t) => {
        if (typeF && (typeF === 'A' ? isMan(t) : !isMan(t))) return false
        return !already.has(t.tcid)
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ofModel, typeF, inCycle],
  )
  /** 화면에 세울 것 — 칩을 끄면 이미 담긴 것도 눕혀 보인다(켜면 숨는다) */
  const shownPool = useMemo(
    () =>
      ofModel.filter((t) => {
        if (typeF && (typeF === 'A' ? isMan(t) : !isMan(t))) return false
        if (onlyNew && already.has(t.tcid)) return false
        return true
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ofModel, typeF, onlyNew, inCycle],
  )
  /** 유효 선택 — 지금 조건으로 실제 담길 것. 칩·요약·저장이 전부 이걸 센다 */
  const effPicked = useMemo(() => {
    const ok = new Set(cands.map((t) => t.tcid))
    return new Set([...picked].filter((id) => ok.has(id)))
  }, [picked, cands])

  /* ── REQ · 폴더 색인 ── */
  const reqByPk = useMemo(() => {
    const m = new Map<string, Requirement>()
    for (const r of reqs) m.set(reqPk(r), r)
    return m
  }, [reqs])
  const deepCatOf = (r?: Requirement) =>
    String(r?.cat4 || r?.cat3 || r?.cat2 || r?.cat1 || '') || ''
  /** 분류 id → 그 분류(하위 말고 제 칸)에 붙은 REQ pk 들 */
  const reqsByCat = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const r of reqs) {
      const c = deepCatOf(r)
      if (!c) continue
      const arr = m.get(c) ?? []
      arr.push(reqPk(r))
      m.set(c, arr)
    }
    return m
  }, [reqs])
  /** REQ pk → 담기 후보 / 보여줄 시험 */
  const candByReq = useMemo(() => {
    const m = new Map<string, TestCaseMeta[]>()
    for (const t of cands) {
      const k = String(t.req_id ?? '').trim() || NO_REQ
      const arr = m.get(k) ?? []
      arr.push(t)
      m.set(k, arr)
    }
    return m
  }, [cands])
  const shownByReq = useMemo(() => {
    const m = new Map<string, TestCaseMeta[]>()
    for (const t of shownPool) {
      const k = String(t.req_id ?? '').trim() || NO_REQ
      const arr = m.get(k) ?? []
      arr.push(t)
      m.set(k, arr)
    }
    return m
  }, [shownPool])

  /** 분류의 온전한 경로 이름 — 캡션·검색이 본다 */
  const catPath = useMemo(() => {
    const m = new Map<string, string>()
    const walk = (ns: CategoryTreeNode[], pre: string) => {
      for (const n of ns) {
        const p = pre ? `${pre} ▸ ${n.name}` : n.name
        m.set(n.id, p)
        walk(n.children, p)
      }
    }
    walk(cats, '')
    return m
  }, [cats])

  /**
   * 노드별 집계 — 한 번에 계산해 둔다. 렌더마다 노드마다 서브트리를 다시
   * 훑으면 시험이 수천이 될 때 글쇠 하나에 트리 전체를 여러 번 재집계한다
   * (검토 지적).
   */
  const nodeAgg = useMemo(() => {
    const candsBy = new Map<string, TestCaseMeta[]>()
    const reqNBy = new Map<string, number>()
    const pksBy = new Map<string, string[]>()
    const walk = (n: CategoryTreeNode): { cs: TestCaseMeta[]; rn: number; pks: string[] } => {
      const own = reqsByCat.get(n.id) ?? []
      let cs: TestCaseMeta[] = []
      let rn = own.length
      let pks = [...own]
      for (const pk of own) cs = cs.concat(candByReq.get(pk) ?? [])
      for (const c of n.children) {
        const r = walk(c)
        cs = cs.concat(r.cs)
        rn += r.rn
        pks = pks.concat(r.pks)
      }
      candsBy.set(n.id, cs)
      reqNBy.set(n.id, rn)
      pksBy.set(n.id, pks)
      return { cs, rn, pks }
    }
    for (const n of cats) walk(n)
    return { candsBy, reqNBy, pksBy }
  }, [cats, reqsByCat, candByReq])
  const candsUnder = (n: CategoryTreeNode) => nodeAgg.candsBy.get(n.id) ?? []
  const reqNUnder = (n: CategoryTreeNode) => nodeAgg.reqNBy.get(n.id) ?? 0

  /* ── 검색 — 폴더 경로·REQ·시험 항목을 다 본다 ── */
  const ql = q.trim().toLowerCase()
  const tcHit = (t: TestCaseMeta) =>
    `${t.tcid} ${String(t.name ?? '')}`.toLowerCase().includes(ql)
  /** REQ 제 이름이 걸렸나 — 시험 항목 줄을 좁힐 때는 이것만 쓴다 */
  const reqSelfHit = (pk: string): boolean => {
    if (!ql) return true
    if (pk === NO_REQ) return false
    const r = reqByPk.get(pk)
    return `${String(r?.reqid ?? '')} ${String(r?.title ?? '')}`.toLowerCase().includes(ql)
  }
  /** REQ 가 화면에 남나 — 제 이름이 걸렸거나 하위 시험이 걸렸으면 남는다 */
  const reqHit = (pk: string): boolean => {
    if (!ql) return true
    if (reqSelfHit(pk)) return true
    return (shownByReq.get(pk) ?? []).some(tcHit)
  }
  /** 폴더(경로)가 걸렸나 — 경로에 조상 이름이 다 들어 있어 조상 검색도 통한다 */
  const folderHit = (cid: string): boolean =>
    !!ql && (catPath.get(cid) ?? '').toLowerCase().includes(ql)
  const nodeVisible = (n: CategoryTreeNode): boolean => {
    const has = candsUnder(n).length > 0
    if (!ql) return has
    /* 검색 중에는 이름이 걸린 폴더는 비어 있어도 보인다(명세) */
    if (folderHit(n.id)) return true
    if (n.children.some(nodeVisible)) return true
    if (!has) return false
    for (const pk of nodeAgg.pksBy.get(n.id) ?? [])
      if ((candByReq.get(pk) ?? []).length && reqHit(pk)) return true
    return false
  }
  /** (REQ 미지정) 자리 — 검색 중에는 제 시험이 걸릴 때만 남는다 */
  const noreqCands = candByReq.get(NO_REQ) ?? []
  const noreqShown = shownByReq.get(NO_REQ) ?? []
  const noreqVisible =
    noreqShown.length > 0 && (!ql || '(req 미지정)'.includes(ql) || noreqShown.some(tcHit))

  /* ── 고르기 ── */
  const toggleMany = (list: TestCaseMeta[]) => {
    if (!list.length) return
    setPicked((cur) => {
      const next = new Set(cur)
      const allOn = list.every((t) => next.has(t.tcid))
      for (const t of list) {
        if (allOn) next.delete(t.tcid)
        else next.add(t.tcid)
      }
      return next
    })
  }
  const stateOf = (list: TestCaseMeta[]): 'on' | 'part' | 'off' => {
    if (!list.length) return 'off'
    const n = list.filter((t) => picked.has(t.tcid)).length
    return n === 0 ? 'off' : n === list.length ? 'on' : 'part'
  }

  /** 하위가 전부 고른 폴더 — 칩의 「폴더 N개」. 위에서부터 접어 센다 */
  const fullFolders = useMemo(() => {
    let n = 0
    const walk = (ns: CategoryTreeNode[]) => {
      for (const node of ns) {
        const cs = nodeAgg.candsBy.get(node.id) ?? []
        if (cs.length && cs.every((t) => picked.has(t.tcid))) n++
        else walk(node.children)
      }
    }
    walk(cats)
    return n
  }, [cats, picked, nodeAgg])

  /* ── 저장 — 더하기만 한다 ── */
  async function save() {
    const ids = [...effPicked]
    if (!ids.length) {
      window.alert('시험 항목을 하나 이상 고르세요.')
      return
    }
    setBusy(true)
    try {
      const r = await apiFetch(`/api/cycle/${encodeURIComponent(cycle.id)}`)
      if (!r.ok) throw new Error('사이클을 불러오지 못했습니다')
      const full = (await r.json()) as Record<string, unknown> & {
        items?: Array<Record<string, unknown>>
      }
      const was = full.items ?? []
      const had = new Set(was.map((x) => String(x?.tcid ?? '')))
      const add = ids
        .filter((id) => !had.has(id))
        .map((id) => ({
          tcid: id,
          name: String(all.find((t) => t.tcid === id)?.name ?? ''),
          steps: [],
        }))
      if (!add.length) {
        window.alert('고른 항목이 이미 다 담겨 있습니다.')
        setBusy(false)
        return
      }
      /* **저장 차례 = 보이는 차례**(폴더 ▸ REQ ▸ ID). 담은(클릭) 차례
         그대로 뒤에 붙여 두면, 이 배열을 그대로 복사해 가는 실행이
         화면과 다른 차례로 돈다(검토 지적: 저장 차례와 보이는 차례가
         갈린다). 차례 규칙은 표·실행기와 같은 한 곳(orderTcIds)이다. */
      const merged = [...was, ...add]
      const tcOfMap = new Map(all.map((t) => [t.tcid, t]))
      const rank = new Map(
        orderTcIds(merged.map((x) => String(x?.tcid ?? '')), tcOfMap, reqIndex).map((id2, i) => [id2, i]),
      )
      merged.sort(
        (a, b) => (rank.get(String(a?.tcid ?? '')) ?? 0) - (rank.get(String(b?.tcid ?? '')) ?? 0),
      )
      const w = await apiFetch(`/api/cycle/${encodeURIComponent(cycle.id)}`, {
        method: 'POST',
        /* updated_by 를 새로 싣는다 — 옛 값을 되밀면 실시간 알림이 이전
           편집자 이름으로 「담았다」 고 말한다(검토 지적) */
        body: JSON.stringify({ ...full, items: merged, updated_by: by ?? '' }),
      })
      if (!w.ok) throw new Error('담지 못했습니다')
      onDone()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  /* ── 그리기 조각 ── */
  const caretBtn = (id: string, isOpen: boolean) => (
    <button
      type="button"
      className={`af-caret${isOpen ? ' open' : ''}`}
      aria-label={isOpen ? '접기' : '펴기'}
      onClick={(e) => {
        e.stopPropagation()
        setOpen((cur) => {
          const next = new Set(cur)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        })
      }}
    >
      <IconChevron />
    </button>
  )
  const ck = (st: 'on' | 'part' | 'off', onChange: () => void, disabled?: boolean) => (
    <input
      type="checkbox"
      className="af-ck"
      checked={st === 'on'}
      disabled={disabled}
      ref={(el) => {
        if (el) el.indeterminate = st === 'part'
      }}
      onClick={(e) => e.stopPropagation()}
      onChange={onChange}
    />
  )

  /** 시험 항목 한 줄 — 이미 담긴 것은 눕혀서 「이미 담김」 (칩을 껐을 때만 보인다) */
  const tcRow = (t: TestCaseMeta, pad: number) => {
    const dupe = already.has(t.tcid)
    return (
      <div
        key={t.tcid}
        className={`af-row tcrow${dupe ? ' dupe' : ''}${picked.has(t.tcid) && !dupe ? ' on' : ''}`}
        style={{ paddingLeft: pad }}
        onClick={dupe ? undefined : () => toggleMany([t])}
      >
        <span className="af-caret none" aria-hidden="true" />
        {ck(picked.has(t.tcid) && !dupe ? 'on' : 'off', () => toggleMany([t]), dupe)}
        <span className="af-ico" aria-hidden="true">{isMan(t) ? '✎' : '▶'}</span>
        <span className="af-id">{t.tcid}</span>
        <span className="af-nm">{String(t.name ?? '')}</span>
        {dupe && <span className="af-rt">이미 담김</span>}
        <span className="af-sp" />
        <span className="af-col mg">{String(t.model_group ?? '') || '—'}</span>
        <span className="af-col md">{String(t.model ?? '') || '—'}</span>
        <span className="af-col tp">
          <span className={`af-badge ${isMan(t) ? 'm' : 'a'}`}>{isMan(t) ? '수동' : '자동'}</span>
        </span>
      </div>
    )
  }

  /** REQ 한 줄 — 체크는 담기 후보만 토글한다 */
  const reqRow = (pk: string, pad: number) => {
    const r = reqByPk.get(pk)
    const mine = candByReq.get(pk) ?? []
    const st = stateOf(mine)
    const label = pk === NO_REQ ? '(REQ 없음)' : String(r?.reqid ?? pk)
    return (
      <div
        key={`rq-${pk}`}
        className={`af-row reqrow${st === 'on' ? ' on' : ''}`}
        style={{ paddingLeft: pad }}
        onClick={mine.length ? () => toggleMany(mine) : undefined}
      >
        <span className="af-caret none" aria-hidden="true" />
        {ck(st, () => toggleMany(mine), !mine.length)}
        <span className="af-ico req" aria-hidden="true">◈</span>
        <span className="af-id req">{label}</span>
        <span className="af-nm dim2">{String(r?.title ?? '')}</span>
        <span className={`af-rt${mine.length ? '' : ' bare'}`}>
          {mine.length ? `TC ${mine.length}` : '시험 항목 없음'}
        </span>
        <span className="af-sp" />
      </div>
    )
  }

  /** 폴더(분류) 한 마디 — base=folder 의 트리. 최상위는 프로젝트(🏠)다 */
  const renderCat = (n: CategoryTreeNode, depth: number): React.ReactNode => {
    if (!nodeVisible(n)) return null
    const mine = candsUnder(n)
    const st = stateOf(mine)
    const kids = n.children.filter(nodeVisible)
    const isOpen = ql ? true : open.has(n.id)
    const pad = 6 + depth * 16
    return (
      <div key={n.id}>
        <div
          className={`af-row${depth === 0 ? ' root' : ''}${st === 'on' ? ' on' : ''}`}
          style={{ paddingLeft: pad }}
          onClick={() => toggleMany(mine)}
        >
          {kids.length ? caretBtn(n.id, isOpen) : <span className="af-caret none" aria-hidden="true" />}
          {ck(st, () => toggleMany(mine), !mine.length)}
          <span className="af-ico" aria-hidden="true">{depth === 0 ? '🏠' : '📁'}</span>
          <span className="af-nm">{n.name}</span>
          <span
            className={`af-rt${mine.length ? '' : ' bare'}`}
            title={`REQ ${reqNUnder(n)}건 / 담길 시험 항목 ${mine.length}건`}
          >
            ({reqNUnder(n)} / {mine.length})
          </span>
          <span className="af-sp" />
        </div>
        {isOpen && kids.map((c) => renderCat(c, depth + 1))}
      </div>
    )
  }

  /** base=req · tc — 위 계층은 캡션 한 줄로 접는다(목업 flat) */
  const renderFlat = (): React.ReactNode[] => {
    const out: React.ReactNode[] = []
    const leaves: string[] = []
    const walk = (ns: CategoryTreeNode[]) => {
      for (const n of ns) {
        if (!nodeVisible(n)) continue
        /* 제 칸에 REQ 가 붙은 분류가 잎이다 — 하위가 있어도 제 REQ 는 제 캡션에 선다 */
        if ((reqsByCat.get(n.id) ?? []).length) leaves.push(n.id)
        walk(n.children)
      }
    }
    walk(cats)
    for (const cid of leaves) {
      /* 폴더 이름이 걸렸으면 그 안 REQ 는 다 남는다 — 폴더 검색이 REQ·시험
         항목 모드에서도 통해야 한다(검토 지적) */
      const pks = (reqsByCat.get(cid) ?? []).filter((pk) => {
        const mine = candByReq.get(pk) ?? []
        if (!mine.length && !ql) return false
        return folderHit(cid) || reqHit(pk)
      })
      if (!pks.length) continue
      const nT = pks.reduce((s, pk) => s + (candByReq.get(pk) ?? []).length, 0)
      if (base === 'req') {
        out.push(
          <div key={`cap-${cid}`} className="af-cap">
            <span>🗀 {catPath.get(cid) ?? ''}</span>
            <span className="af-sp" />
            <span className="r">REQ {pks.length} · TC {nT}</span>
          </div>,
        )
        for (const pk of pks) out.push(reqRow(pk, 18))
      } else {
        for (const pk of pks) {
          const r = reqByPk.get(pk)
          /* 줄 필터는 **제 이름 일치**만 본다 — reqHit(하위 일치 포함)를 또
             쓰면 조건이 항상 참이라 TC 검색이 형제까지 다 데려온다(검토 지적) */
          const shown = (shownByReq.get(pk) ?? []).filter(
            (t) => !ql || tcHit(t) || reqSelfHit(pk) || folderHit(cid),
          )
          if (!shown.length) continue
          out.push(
            <div key={`cap-${pk}`} className="af-cap">
              <span>
                🗀 {catPath.get(cid) ?? ''}{'  '}
                <b className="af-id req">◈ {String(r?.reqid ?? pk)}</b> {String(r?.title ?? '')}
              </span>
              <span className="af-sp" />
              <span className="r">TC {(candByReq.get(pk) ?? []).length}</span>
            </div>,
          )
          for (const t of shown) out.push(tcRow(t, 18))
        }
      }
    }
    /* REQ 안 붙은 시험 — 있으면 맨 아래 제 자리를 만든다 */
    if (noreqVisible) {
      out.push(
        <div key="cap-noreq" className="af-cap">
          <span>🗀 (REQ 미지정)</span>
          <span className="af-sp" />
          <span className="r">TC {noreqCands.length}</span>
        </div>,
      )
      if (base === 'req') out.push(reqRow(NO_REQ, 18))
      else for (const t of noreqShown.filter((t2) => !ql || tcHit(t2))) out.push(tcRow(t, 18))
    }
    return out
  }

  /* ── 본체 ── */
  const scope = [cycle.model_group, cycle.model]
    .map((v) => String(v ?? '').trim())
    .filter(Boolean)
    .join(' · ')
  const totalRow = (
    <div
      className={`af-row total${stateOf(cands) === 'on' ? ' on' : ''}`}
      onClick={() => toggleMany(cands)}
    >
      <span className="af-caret none" aria-hidden="true" />
      {ck(stateOf(cands), () => toggleMany(cands), !cands.length)}
      <span className="af-ico" aria-hidden="true">🗃</span>
      <span className="af-nm"><b>전체</b></span>
      <span className="af-rt" title={`REQ ${reqs.length}건 / 담길 시험 항목 ${cands.length}건`}>
        ({reqs.length} / {cands.length})
      </span>
      <span className="af-sp" />
    </div>
  )
  const flatBody = base === 'folder' ? [] : renderFlat()
  const treeEmpty =
    !loading &&
    (base === 'folder' ? !cats.some(nodeVisible) && !noreqVisible : flatBody.length === 0)

  const setAllOpen = (want: boolean) => {
    if (!want) {
      setOpen(new Set())
      return
    }
    const next = new Set<string>()
    const walk = (ns: CategoryTreeNode[]) => {
      for (const n of ns) {
        next.add(n.id)
        walk(n.children)
      }
    }
    walk(cats)
    setOpen(next)
  }

  return (
    <div className="qav afd" role="presentation">
      <div className="afd-scrim" onClick={() => !busy && onClose()} />
      <aside className={`afd-panel${wideDr ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label="시험 항목 담기">
        <div className="afd-hd">
          <button type="button" className="btn icon" title={wideDr ? '원래 폭' : '넓게 보기'} onClick={() => setWideDr((v) => !v)}>
            ⛶
          </button>
          <h3>시험 항목 담기</h3>
          <button type="button" className="btn icon" title="닫기" onClick={onClose} disabled={busy}>
            ✕
          </button>
        </div>
        <div className="afd-bd">
          <p className="afd-note">
            {scope ? (
              <>
                <b>{scope}</b> 에 맞는 시험만 보입니다 — 담는 단위(폴더 · REQ · 시험 항목)를 골라 체크하세요.
              </>
            ) : (
              <>이 사이클은 모델이 아직 안 정해져 모든 시험이 보입니다.</>
            )}
          </p>
          <div className={`af-chosen${effPicked.size ? ' has' : ''}`}>
            {effPicked.size
              ? `담길 항목 ${effPicked.size}건${fullFolders ? ` · 폴더 ${fullFolders}개` : ''}`
              : '고른 항목 없음'}
          </div>
          <div className="af-bar">
            <input
              className="inp"
              placeholder="폴더 · REQ · 항목 찾기"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select className="inp af-typef" value={typeF} onChange={(e) => setTypeF(e.target.value as '' | 'A' | 'M')}>
              <option value="">타입 전체</option>
              <option value="A">자동</option>
              <option value="M">수동</option>
            </select>
            <button
              type="button"
              className="btn small"
              title="더보기"
              onClick={(e) => {
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                setMenuAt({ x: Math.max(8, r.right - 176), y: r.bottom + 4 })
              }}
            >
              ⋯
            </button>
          </div>
          <div className="af-chips">
            <span className="af-seg" role="tablist" aria-label="담는 단위">
              {(
                [
                  ['folder', '폴더'],
                  ['req', 'REQ'],
                  ['tc', '시험 항목'],
                ] as Array<[Base, string]>
              ).map(([b, label]) => (
                <button key={b} type="button" className={base === b ? 'on' : ''} onClick={() => setBase(b)}>
                  {label}
                </button>
              ))}
            </span>
            <button
              type="button"
              className={`af-chip${onlyNew ? ' on' : ''}`}
              title="켜면 이미 담긴 항목을 숨기고, 끄면 「이미 담김」 으로 눕혀 보입니다"
              onClick={() => setOnlyNew((v) => !v)}
            >
              이미 담긴 항목 제외
            </button>
          </div>
          <div className={`af-tree b-${base}`}>
            {loading && !loadErr ? (
              <div className="af-empty">불러오는 중…</div>
            ) : loadErr ? (
              <div className="af-empty err">{loadErr}</div>
            ) : (
              <>
                {base === 'tc' && (
                  <div className="af-cols">
                    <span className="af-sp" />
                    <span className="af-col mg">모델그룹</span>
                    <span className="af-col md">모델명</span>
                    <span className="af-col tp">타입</span>
                  </div>
                )}
                {totalRow}
                {base === 'folder' && noreqVisible && (
                  <div
                    className={`af-row${stateOf(noreqCands) === 'on' ? ' on' : ''}`}
                    style={{ paddingLeft: 6 }}
                    onClick={() => toggleMany(noreqCands)}
                  >
                    <span className="af-caret none" aria-hidden="true" />
                    {ck(stateOf(noreqCands), () => toggleMany(noreqCands), !noreqCands.length)}
                    <span className="af-ico" aria-hidden="true">📁</span>
                    <span className="af-nm">(REQ 미지정)</span>
                    <span className="af-rt">(0 / {noreqCands.length})</span>
                    <span className="af-sp" />
                  </div>
                )}
                {base === 'folder' ? cats.filter(nodeVisible).map((n) => renderCat(n, 0)) : flatBody}
                {treeEmpty && (
                  <div className="af-empty">
                    <strong>담을 수 있는 항목이 없습니다</strong>
                    <span>검색어를 지우거나 필터를 풀어보세요.</span>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="af-sum">
            {effPicked.size
              ? `지금 조건으로 담을 수 있는 ${cands.length}건 중 ${effPicked.size}건을 골랐습니다`
              : base === 'folder'
                ? '폴더를 누르면 그 안의 시험 항목이 모두 담깁니다'
                : base === 'req'
                  ? 'REQ 를 누르면 그 REQ 의 시험 항목이 모두 담깁니다 · 폴더는 위 줄에만 적습니다'
                  : '시험 항목을 하나씩 고릅니다 · 폴더와 REQ 는 위 줄에만 적습니다'}
          </div>
        </div>
        <div className="afd-ft">
          <span className="af-sum" style={{ margin: 0 }}>
            자동 {cands.filter((t) => !isMan(t)).length} · 수동 {cands.filter(isMan).length}
          </span>
          <span className="af-sp" />
          <button type="button" className="cu-new" onClick={() => void save()} disabled={busy || !!loadErr || loading}>
            {busy ? '담는 중…' : `담기${effPicked.size ? ` ${effPicked.size}건` : ''}`}
          </button>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            닫기
          </button>
        </div>
      </aside>
      {!!menuAt && (
        <>
          <span className="qa-moreovl" role="presentation" onClick={() => setMenuAt(null)} />
          <div className="qa-menu" role="menu" style={{ left: menuAt.x, top: menuAt.y }}>
            {/* 펼치기·접기는 폴더 트리에만 뜻이 있다 — REQ·시험 항목 모드는
                캡션으로 늘 펴져 있어, 눌러도 아무 일이 없는 단추가 된다 */}
            {base === 'folder' && (
              <>
                <button type="button" role="menuitem" onClick={() => { setMenuAt(null); setAllOpen(true) }}>
                  모두 펼치기
                </button>
                <button type="button" role="menuitem" onClick={() => { setMenuAt(null); setAllOpen(false) }}>
                  모두 접기
                </button>
                <div className="qa-menusep" />
              </>
            )}
            <button type="button" role="menuitem" onClick={() => { setMenuAt(null); setPicked(new Set()) }}>
              선택 모두 해제
            </button>
          </div>
        </>
      )}
    </div>
  )
}
