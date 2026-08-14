import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, categoryApi } from '@/api/client'
import {
  MAX_CAT_DEPTH,
  buildCategoryTree,
  naturalCompare,
  reqLabel,
  reqPk,
  type CategoryTreeNode,
  type Requirement,
  type TestCaseMeta,
} from '@/types'
import { IconChevron, IconFolder, IconReqDoc } from '../icons'
// 요구사항 화면과 **같은 트리로 보여야 한다**. 줄 높이·글자·구분선을 여기서
// 다시 정하면 두 화면을 오가며 같은 것이 달라 보인다. 그 화면의 규칙을
// 그대로 가져다 쓰고, TC 줄만 이 화면 CSS 에서 더한다.
import '../ReqTree.css'

interface Props {
  tcs: TestCaseMeta[]
  /** 지금 열려 있는 TC */
  openId: string
  onOpen: (tcid: string) => void
  /** 한꺼번에 고친다고 고른 TC 들 */
  picked: Set<string>
  /** 찾는 글자 — 머리줄에서 받는다 */
  q?: string
  /** 줄을 눌렀다 — Ctrl·Shift 는 화면이 판단한다 */
  onPickClick: (
    id: string,
    e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean },
    order: string[],
  ) => void
  /**
   * List 보기에서 「어디를 볼지」 를 정한다.
   *
   * 넘겨 주면 폴더·요구사항 줄이 **고를 수 있는 것**이 된다(펼치기는 그대로).
   * 안 넘기면 지금까지처럼 펼치기만 한다 — Detail 보기는 그대로다.
   */
  selectedFolder?: string | null
  onSelectFolder?: (id: string | null) => void
  /** 고른 요구사항 PK */
  selectedReq?: string | null
  onSelectReq?: (pk: string) => void
  /** 「+ 폴더」 를 바깥 머리줄에서 누를 수 있게 — 숫자가 바뀌면 입력칸을 연다 */
  addFolderSignal?: number
}

/** 이 요구사항이 놓인 가장 깊은 분류 id. 없으면 null(미분류) */
function reqFolder(r: Requirement): string | null {
  return (r.cat4 || r.cat3 || r.cat2 || r.cat1 || null) as string | null
}

/**
 * 1열 — 폴더 · 요구사항 · TC 세 층 트리.
 *
 * 전에는 TC 89건이 평평하게 늘어선 목록이었다. 요구사항으로 좁히려면 위의
 * 「요구사항」 팝업을 따로 띄워야 했고, 그래서 '지금 무엇으로 좁혀져 있나' 가
 * 목록 밖에 있었다. 요구사항 화면과 같은 트리로 두면 좁히는 일과 고르는
 * 일이 한 자리에서 끝난다.
 *
 * TC 는 폴더에 직접 들어가지 않는다 — 요구사항에 붙고, 요구사항이 폴더에
 * 들어간다. 그래서 층이 셋이다.
 */
export default function TcTree({
  tcs,
  openId,
  q = '',
  selectedFolder,
  onSelectFolder,
  selectedReq,
  onSelectReq,
  addFolderSignal = 0,
}: Props) {
  const [openIds, setOpenIds] = useState<Set<string>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('utop.tctree.open') || '[]')
      return new Set(Array.isArray(saved) ? saved : [])
    } catch {
      return new Set()
    }
  })
  useEffect(() => {
    localStorage.setItem('utop.tctree.open', JSON.stringify([...openIds]))
  }, [openIds])

  const reqQ = useQuery({
    queryKey: ['req', 'list'],
    queryFn: ({ signal }) => api.listRequirements(signal),
  })
  const catQ = useQuery({
    queryKey: ['req-categories'],
    queryFn: ({ signal }) => categoryApi.list(signal),
  })

  const reqs = reqQ.data?.reqs ?? []
  const tree = useMemo(() => buildCategoryTree(catQ.data?.categories ?? []), [catQ.data])

  /* ── 폴더 다루기 — 요구사항 트리와 같은 문법 ──────────────────
     같은 분류(req_category)를 쓰므로 여기서 만들고 고친 것이 요구사항
     화면에도 그대로 나타난다. 우클릭 → 하위 추가·이름 변경·삭제,
     이름 변경은 그 줄에서 바로. */
  const qc = useQueryClient()
  const invalidateCats = () => {
    void qc.invalidateQueries({ queryKey: ['req-categories'] })
    void qc.invalidateQueries({ queryKey: ['req', 'list'] })
  }
  const [ctx, setCtx] = useState<{ x: number; y: number; node: CategoryTreeNode } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')
  const [addingTo, setAddingTo] = useState<string | null | undefined>(undefined)
  const [draftName, setDraftName] = useState('')
  const [catErr, setCatErr] = useState('')
  const fail = (e: unknown) => setCatErr(e instanceof Error ? e.message : String(e))

  const createM = useMutation({
    mutationFn: ({ name, parentId }: { name: string; parentId: string | null }) =>
      categoryApi.create(name, parentId),
    onSuccess: (_d, v) => {
      setAddingTo(undefined)
      setDraftName('')
      setCatErr('')
      if (v.parentId) setOpenIds((x) => new Set(x).add(v.parentId as string))
      invalidateCats()
    },
    onError: fail,
  })
  const renameM = useMutation({
    mutationFn: ({ node, name }: { node: CategoryTreeNode; name: string }) =>
      categoryApi.rename(node.id, name, (node.parent_id ?? null) as string | null),
    onSuccess: () => {
      setRenaming(null)
      setCatErr('')
      invalidateCats()
    },
    onError: fail,
  })
  const removeM = useMutation({
    mutationFn: (id: string) => categoryApi.remove(id),
    onSuccess: () => {
      setCatErr('')
      invalidateCats()
    },
    onError: fail,
  })

  // 바깥 「+」 — 최상위 폴더 입력칸
  const firstSig = useRef(true)
  useEffect(() => {
    if (firstSig.current) {
      firstSig.current = false
      return
    }
    setAddingTo(null)
    setDraftName('')
  }, [addFolderSignal])

  // 아무 데나 누르면 우클릭 메뉴를 닫는다
  useEffect(() => {
    if (!ctx) return
    const off = () => setCtx(null)
    window.addEventListener('pointerdown', off)
    return () => window.removeEventListener('pointerdown', off)
  }, [ctx])

  /**
   * req_id → TC.
   *
   * tc.req_id 에 PK 가 들었는지 이름표가 들었는지 자료마다 다르다. 어느
   * 쪽으로 저장됐든 놓치지 않도록 둘 다로 찾는다(Requirements.tsx 에 같은
   * 사정이 적혀 있다).
   */
  const byReqKey = useMemo(() => {
    const m = new Map<string, TestCaseMeta[]>()
    for (const t of tcs) {
      const k = (t.req_id || '').trim()
      if (!k) continue
      const arr = m.get(k)
      if (arr) arr.push(t)
      else m.set(k, [t])
    }
    return m
  }, [tcs])

  const tcsFor = useMemo(
    () =>
      (r: Requirement): TestCaseMeta[] => {
        const a = byReqKey.get(reqPk(r)) ?? []
        const label = reqLabel(r)
        const b = label && label !== reqPk(r) ? (byReqKey.get(label) ?? []) : []
        if (b.length === 0) return a
        const seen = new Set(a.map((t) => t.tcid))
        return [...a, ...b.filter((t) => !seen.has(t.tcid))]
      },
    [byReqKey],
  )

  const byFolder = useMemo(() => {
    const m = new Map<string | null, Requirement[]>()
    for (const r of reqs) {
      const k = reqFolder(r)
      const arr = m.get(k)
      if (arr) arr.push(r)
      else m.set(k, [r])
    }
    for (const arr of m.values())
      arr.sort((a, b) => naturalCompare(reqLabel(a) || '', reqLabel(b) || ''))
    return m
  }, [reqs])

  /** 어느 요구사항에도 안 걸린 TC. 안 보이면 영영 못 찾는다. */
  const orphans = useMemo(() => {
    const claimed = new Set<string>()
    for (const r of reqs) for (const t of tcsFor(r)) claimed.add(t.tcid)
    return tcs.filter((t) => !claimed.has(t.tcid))
  }, [reqs, tcs, tcsFor])

  const needle = q.trim().toLowerCase()

  const tcMatch = (t: TestCaseMeta) =>
    !needle ||
    t.tcid.toLowerCase().includes(needle) ||
    (t.name ?? '').toLowerCase().includes(needle)

  /**
   * 이 요구사항 아래 보일 TC.
   *
   * 요구사항 자체가 검색어에 걸리면 그 아래 TC 를 전부 보인다 —
   * 'rate limit 요구사항의 시험 전부' 를 찾는 일이 잦다.
   */
  const shownTcs = (r: Requirement): TestCaseMeta[] => {
    const all = tcsFor(r)
    if (!needle) return all
    const reqHit =
      reqLabel(r).toLowerCase().includes(needle) ||
      (r.title ?? '').toLowerCase().includes(needle)
    return reqHit ? all : all.filter(tcMatch)
  }

  const reqHit = (r: Requirement) =>
    reqLabel(r).toLowerCase().includes(needle) || (r.title ?? '').toLowerCase().includes(needle)

  /**
   * 이 폴더 아래 보일 요구사항.
   *
   * 전에는 **TC 가 붙은 것만** 보였다. 그러니 요구사항 화면과 커버리지
   * 화면의 트리가 서로 달라 보였고 — 같은 폴더를 열었는데 있어야 할 줄이
   * 없다 — 무엇보다 **아직 시험이 없는 요구사항에 시험을 붙일 수가
   * 없었다.** 커버리지는 「어디가 비었나」 를 보는 자리인데 정작 빈 곳이
   * 안 보였던 셈이다.
   *
   * 그래서 그냥 다 보인다. 거르는 것은 검색할 때뿐이다.
   */
  const reqsOf = (folderId: string | null) =>
    (byFolder.get(folderId) ?? []).filter((r) => !needle || reqHit(r) || shownTcs(r).length > 0)

  const countDeep = (n: CategoryTreeNode): number =>
    reqsOf(n.id).reduce((a, r) => a + shownTcs(r).length, 0) +
    n.children.reduce((a, k) => a + countDeep(k), 0)

  /** 이 가지에 보일 요구사항이 하나라도 있나 — 검색했을 때 가지를 접는 기준 */
  const hasReqDeep = (n: CategoryTreeNode): boolean =>
    reqsOf(n.id).length > 0 || n.children.some(hasReqDeep)

  /** 이 폴더 아래(하위 폴더까지)의 TC 전부 */
  const deepTcs = (n: CategoryTreeNode): TestCaseMeta[] => [
    ...reqsOf(n.id).flatMap((r) => shownTcs(r)),
    ...n.children.flatMap(deepTcs),
  ]

  /**
   * 열어 둔 TC 를 트리에서 **드러낸다.**
   *
   * 요구사항 화면에서 시험 이름을 누르면 이 화면으로 넘어와 오른쪽에는
   * 그 시험이 열린다. 그런데 왼쪽 트리는 접힌 그대로라, 방금 연 것이
   * 어디 있는지 폴더를 하나씩 눌러 다시 찾아야 했다 — 이미 찾아 준
   * 것을 사람이 또 찾는 셈이다.
   *
   * 그 TC 를 물고 있는 요구사항과 그 위 폴더 사슬을 펴고, 그 줄로
   * 굴려 준다. 사람이 손으로 접은 것을 되돌리지 않도록 **연 것이
   * 바뀔 때 한 번만** 한다.
   */
  const revealed = useRef('')
  useEffect(() => {
    if (!openId || tree.length === 0 || reqs.length === 0) return
    if (revealed.current === openId) return
    revealed.current = openId

    const holder = reqs.find((r) => tcsFor(r).some((t) => t.tcid === openId))
    const want = new Set<string>()
    if (holder) {
      want.add(reqPk(holder))
      const fid = reqFolder(holder)
      if (fid) {
        // 그 폴더까지 내려가는 길 — 지나온 폴더를 모두 편다
        const walk = (n: CategoryTreeNode, path: string[]): boolean => {
          const here = [...path, n.id]
          if (n.id === fid) {
            here.forEach((x) => want.add(x))
            return true
          }
          return n.children.some((k) => walk(k, here))
        }
        tree.some((n) => walk(n, []))
      }
    }
    if (want.size)
      setOpenIds((prev) => {
        const m = new Set(prev)
        want.forEach((x) => m.add(x))
        return m
      })

    // 펴는 것은 다음 그림에서 일어난다. 그때 줄이 생기므로 그 뒤에 굴린다.
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        document
          .querySelector('.tt-tc.on')
          ?.scrollIntoView({ block: 'center', behavior: 'smooth' }),
      ),
    )
  }, [openId, tree, reqs, tcsFor])

  const toggle = (id: string) =>
    setOpenIds((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  /** 검색 중에는 전부 펼친다 — 접힌 가지 안에 있으면 찾은 보람이 없다 */
  const isOpen = (id: string) => (needle ? true : openIds.has(id))

  const reqRow = (r: Requirement, depth: number) => {
    const pk = reqPk(r)
    const mine = shownTcs(r)
    const full = reqLabel(r)
    return (
      <div key={pk}>
        <div
          className={`rt-req tt-req${selectedReq === pk ? ' on' : ''}`}
          role="button"
          tabIndex={0}
          style={{ paddingLeft: 4 + depth * 14 }}
          // List 보기에서는 고르는 것이 먼저다 — 그 요구사항의 TC 를 표에
          // 띄운다. Detail 보기(핸들러 없음)에서는 지금까지처럼 펼치기만.
          onClick={() => (onSelectReq ? onSelectReq(pk) : toggle(pk))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              if (onSelectReq) onSelectReq(pk)
              else toggle(pk)
            }
          }}
        >
          {/* 시험 잎은 트리에 안 그린다 — 1열은 요구사항까지만. 시험은
              오른쪽 표가 말하고, 세부는 표에서 인라인으로 펼친다. */}
          <button type="button" className="rt-caret" disabled aria-hidden="true">
            <span className="rt-dot" />
          </button>
          {/* TC 가 없는 요구사항에도 자리를 지킨다. 안 그리면 뒤 칸이
              한 칸씩 밀려서 제목과 숫자가 엉뚱한 데로 간다. */}
          <span className="rt-dicon" aria-hidden="true">
            <IconReqDoc />
          </span>
          {/* ID 는 안 그린다 — 고르면 위 빵부스러기와 Info 탭에 나온다.
              트리는 이름을 읽는 자리다. 궁금하면 말풍선에 있다. */}
          <span className="rt-title" title={[full, r.title].filter(Boolean).join(' — ')}>
            {r.title || full || '(제목 없음)'}
          </span>
          <span className="rt-cnt">{mine.length || ''}</span>
        </div>
      </div>
    )
  }

  const renderFolder = (n: CategoryTreeNode) => {
    const total = countDeep(n)
    // 폴더는 요구사항 화면과 **똑같이** 다 보인다. 전에는 TC 가 없는 가지를
    // 통째로 감췄는데, 두 화면의 트리가 달라 보이는 원인이었다.
    // 검색할 때만, 걸린 것이 하나도 없는 가지를 접는다.
    if (needle && !hasReqDeep(n)) return null
    const open = isOpen(n.id)
    const mine = reqsOf(n.id)
    return (
      <div key={n.id}>
        <div
          className={`rt-fold${selectedFolder === n.id ? ' on' : ''}${
            n.depth === 1 ? ' rt-top' : ''
          }`}
          role="button"
          tabIndex={0}
          style={{ paddingLeft: 4 + (n.depth - 1) * 14 }}
          onClick={() => (onSelectFolder ? onSelectFolder(n.id) : toggle(n.id))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              if (onSelectFolder) onSelectFolder(n.id)
              else toggle(n.id)
            }
            if (e.key === 'F2') {
              e.preventDefault()
              setCtx(null)
              setRenaming(n.id)
              setRenameText(n.name)
            }
          }}
          onContextMenu={(e) => {
            // 탐색기와 같은 우클릭 — 요구사항 트리와 같은 문법
            e.preventDefault()
            e.stopPropagation()
            setCtx({ x: e.clientX, y: e.clientY, node: n })
          }}
        >
          <button
            type="button"
            className={`rt-caret${open ? ' open' : ''}`}
            aria-label={open ? '접기' : '펼치기'}
            onClick={(e) => {
              e.stopPropagation()
              toggle(n.id)
            }}
          >
            <IconChevron />
          </button>
          {/* 요구사항 화면과 같은 폴더 표시 */}
          <span className="rt-ficon" aria-hidden="true">
            <IconFolder open={open} />
          </span>
          {renaming === n.id ? (
            // 창을 띄우지 않고 그 자리에서 고친다 (F2 · 두 번 누르기)
            <input
              autoFocus
              className="rt-rename"
              value={renameText}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setRenameText(e.target.value)}
              onBlur={() => setRenaming(null)}
              onKeyDown={(e) => {
                // 키가 폴더 줄로 새면 안 된다 — 줄이 스페이스를 「고르기」 로
                // 가로채 preventDefault 해서 띄어쓰기가 안 먹었다
                e.stopPropagation()
                if (e.key === 'Enter' && renameText.trim())
                  renameM.mutate({ node: n, name: renameText.trim() })
                if (e.key === 'Escape') setRenaming(null)
              }}
            />
          ) : (
            <b
              className="rt-fname"
              title={n.name}
              onDoubleClick={(e) => {
                e.stopPropagation()
                setRenaming(n.id)
                setRenameText(n.name)
              }}
            >
              {n.name}
            </b>
          )}
          <span className="rt-cnt">{total}</span>
        </div>
        {addingTo === n.id && (
          <div className="rt-add" style={{ paddingLeft: 8 + n.depth * 14 }}>
            <input
              autoFocus
              value={draftName}
              placeholder="폴더 이름"
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && draftName.trim())
                  createM.mutate({ name: draftName.trim(), parentId: n.id })
                if (e.key === 'Escape') setAddingTo(undefined)
              }}
            />
            <button
              className="btn small primary"
              type="button"
              onClick={() =>
                draftName.trim() && createM.mutate({ name: draftName.trim(), parentId: n.id })
              }
            >
              추가
            </button>
            <button className="btn small" type="button" onClick={() => setAddingTo(undefined)}>
              취소
            </button>
          </div>
        )}
        {open && (
          <>
            {n.children.map(renderFolder)}
            {mine.map((r) => reqRow(r, n.depth))}
          </>
        )}
      </div>
    )
  }

  const uncat = reqsOf(null)
  const orphanShown = orphans.filter(tcMatch)
  const loading = reqQ.isLoading || catQ.isLoading

  return (
    <div className="rt tt">
      <div className="rt-body">
        {/* 전역 파라미터는 이 트리에서 뺐다. 여기 있을 때는 폴더인 척
            하면서 폴더가 아니었고(지울 수도 옮길 수도 없다), 시험을 찾는
            눈길이 매번 그 줄을 넘어가야 했다. 이제 칸 머리의 단추로 열어
            2열 전체에서 본다 — 파일 목록과 편집이 함께 있는 자리다. */}
        {catErr && <div className="rt-error">{catErr}</div>}
        {/* 최상위 폴더 추가 — 머리줄의 + 가 연다 */}
        {addingTo === null && (
          <div className="rt-add">
            <input
              autoFocus
              value={draftName}
              placeholder="새 최상위 폴더 이름"
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && draftName.trim())
                  createM.mutate({ name: draftName.trim(), parentId: null })
                if (e.key === 'Escape') setAddingTo(undefined)
              }}
            />
            <button
              className="btn small primary"
              type="button"
              onClick={() =>
                draftName.trim() && createM.mutate({ name: draftName.trim(), parentId: null })
              }
            >
              추가
            </button>
            <button className="btn small" type="button" onClick={() => setAddingTo(undefined)}>
              취소
            </button>
          </div>
        )}
        {loading ? (
          <div className="empty">불러오는 중…</div>
        ) : (
          <>
            {tree.map(renderFolder)}

            {uncat.length > 0 && (
              <>
                <div className="rt-fold rt-uncat">
                  <span className="rt-caret" />
                  <b className="rt-fname">미분류</b>
                  <span className="rt-cnt">
                    {uncat.reduce((a, r) => a + shownTcs(r).length, 0)}
                  </span>
                </div>
                {uncat.map((r) => reqRow(r, 1))}
              </>
            )}

            {/* 요구사항에 안 걸린 TC. 트리에만 두면 이것들이 사라져서
                '분명히 만들었는데 목록에 없다' 가 된다. */}
            {orphanShown.length > 0 && (
              <div
                className={`rt-fold rt-uncat${selectedReq === '__orphan__' ? ' on' : ''}`}
                role="button"
                tabIndex={0}
                title="요구사항에 안 붙은 시험들 — 눌러서 표로 봅니다"
                onClick={() => onSelectReq?.('__orphan__')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelectReq?.('__orphan__')
                  }
                }}
              >
                <span className="rt-caret" />
                <b className="rt-fname">요구사항 없음</b>
                <span className="rt-cnt">{orphanShown.length}</span>
              </div>
            )}

            {tree.length === 0 && uncat.length === 0 && orphanShown.length === 0 && (
              <div className="empty">
                {needle ? '조건에 맞는 TC 가 없습니다.' : '아직 TC 가 없습니다.'}
              </div>
            )}
          </>
        )}
      </div>
      {ctx && (
        <div
          className="rt-ctx"
          style={{ left: ctx.x, top: ctx.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {ctx.node.depth < MAX_CAT_DEPTH && (
            <button
              type="button"
              onClick={() => {
                const n = ctx.node
                setCtx(null)
                setAddingTo(n.id)
                setDraftName('')
                setOpenIds((x) => new Set(x).add(n.id))
              }}
            >
              하위 폴더 추가
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              const n = ctx.node
              setCtx(null)
              setRenaming(n.id)
              setRenameText(n.name)
            }}
          >
            이름 변경 <span className="rt-key">F2</span>
          </button>
          <hr />
          <button
            type="button"
            className="danger"
            onClick={() => {
              const n = ctx.node
              setCtx(null)
              if (
                window.confirm(
                  `'${n.name}' 폴더를 지웁니다.\n하위 폴더도 함께 지워집니다. 요구사항·시험은 미분류로 남습니다.`,
                )
              )
                removeM.mutate(n.id)
            }}
          >
            삭제
          </button>
        </div>
      )}
    </div>
  )
}
