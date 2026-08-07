import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { categoryApi, reqApi } from '@/api/client'
import {
  buildCategoryTree,
  MAX_CAT_DEPTH,
  naturalCompare,
  reqLabel,
  reqPk,
  shortReqId,
  statusClass,
  type CategoryTreeNode,
  type ReqCategory,
  type Requirement,
  type TestCaseMeta,
} from '@/types'
import { IconChevron, IconFolder, IconReqDoc } from './icons'
import './ReqTree.css'

interface Props {
  reqs: Requirement[]
  /** req PK → 그 요구사항에 달린 TC */
  tcsFor: (r: Requirement) => TestCaseMeta[]
  selected: string | null
  onSelect: (reqPk: string) => void
  /**
   * 고른 폴더. undefined = 폴더를 안 고름 · null = 미분류.
   * 폴더를 고르면 오른쪽에 그 폴더 아래 요구사항의 TC 가 전부 모여 나온다.
   */
  selectedFolder: string | null | undefined
  onSelectFolder: (catId: string | null) => void
  /** 여러 건 고르기 (삭제용) */
  picked: Set<string>
  /** 보기 방식 — ⋯ 메뉴에서 켠다 */
  view?: { fullId: boolean; foldersOnly: boolean }
  onPick: (reqPk: string) => void
  /** 고른 폴더. 바깥 버튼에서 삭제하려고 올려 보낸다 */
  pickedFolders: Set<string>
  onPickFolder: (catId: string) => void
  /** 「+ 폴더」를 바깥 버튼 줄에서 누를 수 있게 */
  addFolderSignal: number
}

/** 이 요구사항이 놓인 가장 깊은 분류 id. 없으면 null(미분류) */
function reqFolder(r: Requirement): string | null {
  return (r.cat4 || r.cat3 || r.cat2 || r.cat1 || null) as string | null
}

/** 우클릭 메뉴 위치와 대상 */
interface Ctx {
  x: number
  y: number
  cat: CategoryTreeNode
}

/**
 * 요구사항 트리 — 폴더 안에 요구사항이 들어간다.
 *
 * 폴더 다루는 방식은 Zephyr Enterprise 를 그대로 따른다. 거기가 곧
 * 윈도우 탐색기 방식이라 배울 것이 없다:
 *   · 폴더에 우클릭 → 하위 폴더 추가 · 이름 변경 · 복사 · 붙여넣기 · 삭제
 *   · 이름 변경은 창을 띄우지 않고 그 줄에서 바로 (F2 도 같다)
 *   · 끌어서 옮기고, 정확히 놓기 어려울 때는 복사·붙여넣기를 쓴다
 *
 * 요구사항도 같은 트리 안에 있어서 끌어 옮길 수 있다. 폴더 구조만 볼
 * 때는 「폴더만」 을 켠다 — 정리할 때 트리가 짧아진다.
 */
export default function ReqTree({
  reqs,
  tcsFor,
  selected,
  onSelect,
  selectedFolder,
  onSelectFolder,
  view,
  picked,
  onPick,
  pickedFolders,
  onPickFolder,
  addFolderSignal,
}: Props) {
  const qc = useQueryClient()

  const [openIds, setOpenIds] = useState<Set<string>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('utop.reqtree.open') || '[]')
      return new Set(Array.isArray(saved) ? saved : [])
    } catch {
      return new Set()
    }
  })
  useEffect(() => {
    localStorage.setItem('utop.reqtree.open', JSON.stringify([...openIds]))
  }, [openIds])

  const [q, setQ] = useState('')
  /** 우클릭 메뉴 */
  const [ctx, setCtx] = useState<Ctx | null>(null)
  /** 제자리 이름 변경 중인 폴더 id */
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')
  /** 하위 폴더 추가 중인 곳. null = 최상위 */
  const [addingTo, setAddingTo] = useState<string | null | undefined>(undefined)
  const [draftName, setDraftName] = useState('')
  /** 복사해둔 폴더 (붙여넣기 대기) */
  const [clip, setClip] = useState<CategoryTreeNode | null>(null)
  const [error, setError] = useState('')
  const [drag, setDrag] = useState<{ kind: 'req' | 'cat'; id: string } | null>(null)
  /**
   * 끌고 있는 것이 커서를 따라다닌다.
   *
   * iTest 는 무엇을 쥐었는지 커서 옆에 그대로 붙여 보여 준다. 지금까지는
   * 원래 줄이 옅어지는 것뿐이라, 여러 줄을 지나다 보면 무엇을 쥐고
   * 있었는지 잊는다.
   */
  const [ghost, setGhost] = useState<{ x: number; y: number; label: string } | null>(null)
  const [over, setOver] = useState<string | null | undefined>(undefined)
  // 「폴더만 · 전체 ID」 는 ⋯ 메뉴로 옮겼다. 상태는 화면이 들고 있고
  // 여기서는 받아 쓴다 — 단추가 트리 위 줄을 먹고 있었다.
  const fullId = view?.fullId ?? false
  const foldersOnly = view?.foldersOnly ?? false
  /** 폴더 구조만 보기 — 정리할 때 요구사항이 사이에 끼면 트리가 길다 */


  const treeRef = useRef<HTMLDivElement>(null)
  /**
   * 방금 끌어 옮겼는가.
   *
   * 끌기가 끝나면 브라우저가 click 도 함께 쏜다. 그대로 두면 폴더를 옮길
   * 때마다 오른쪽 패널이 그 폴더로 튄다. 트리 안 아무 데나 다시 누르면
   * 풀린다 — 끌 수 없는 줄(미분류)에서도 풀리게 트리 전체에 건다.
   */
  const justDragged = useRef(false)

  useEffect(() => {
    if (addFolderSignal > 0) {
      setAddingTo(null)
      setDraftName('')
    }
  }, [addFolderSignal])

  // 메뉴는 아무 데나 누르거나 Esc 로 닫힌다
  useEffect(() => {
    if (!ctx) return
    const close = () => setCtx(null)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setCtx(null)
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', esc)
    }
  }, [ctx])

  const catQ = useQuery({
    queryKey: ['req-categories'],
    queryFn: ({ signal }) => categoryApi.list(signal),
  })
  const cats = catQ.data?.categories ?? []
  const tree = useMemo(() => buildCategoryTree(cats), [cats])
  const catById = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats])

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['req-categories'] })
    void qc.invalidateQueries({ queryKey: ['req', 'list'] })
  }
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e))

  const createM = useMutation({
    mutationFn: ({ name, parentId }: { name: string; parentId: string | null }) =>
      categoryApi.create(name, parentId),
    onSuccess: (_d, v) => {
      setAddingTo(undefined)
      setDraftName('')
      setError('')
      if (v.parentId) setOpenIds((s) => new Set(s).add(v.parentId as string))
      invalidate()
    },
    onError: fail,
  })

  const renameM = useMutation({
    mutationFn: ({ cat, name }: { cat: ReqCategory; name: string }) =>
      categoryApi.rename(cat.id, name, cat.parent_id ?? null),
    onSuccess: () => {
      setRenaming(null)
      setError('')
      invalidate()
    },
    onError: fail,
  })

  const moveCatM = useMutation({
    mutationFn: ({ cat, parentId }: { cat: ReqCategory; parentId: string | null }) =>
      categoryApi.rename(cat.id, cat.name, parentId),
    onSuccess: () => {
      setError('')
      invalidate()
    },
    onError: fail,
  })

  /**
   * 폴더 복사 — 가지를 통째로 새로 만든다.
   *
   * 안에 든 요구사항은 따라가지 않는다. 요구사항은 한 곳에만 있어야 하고,
   * 복사하면 같은 것이 둘이 되어 어느 쪽이 진짜인지 알 수 없어진다.
   * 구조만 복사하는 것이 Zephyr 와도 같다.
   */
  const pasteM = useMutation({
    mutationFn: async ({ src, parentId }: { src: CategoryTreeNode; parentId: string | null }) => {
      const copy = async (n: CategoryTreeNode, parent: string | null, top: boolean) => {
        const r = await categoryApi.create(top ? `${n.name} 복사` : n.name, parent)
        for (const k of n.children) await copy(k, r.id, false)
      }
      await copy(src, parentId, true)
    },
    onSuccess: () => {
      setError('')
      invalidate()
    },
    onError: fail,
  })

  const removeCatM = useMutation({
    mutationFn: (id: string) => categoryApi.remove(id),
    onSuccess: () => {
      setError('')
      invalidate()
    },
    onError: fail,
  })

  const moveReqM = useMutation({
    mutationFn: async ({ r, folderId }: { r: Requirement; folderId: string | null }) => {
      // 놓은 폴더의 조상 사슬로 cat1~cat4 를 단계에 맞춰 채운다
      const chain: string[] = []
      let cur = folderId ? catById.get(folderId) : undefined
      while (cur) {
        chain.unshift(cur.id)
        cur = cur.parent_id ? catById.get(cur.parent_id) : undefined
      }
      return reqApi.save(reqPk(r), {
        ...r,
        cat1: chain[0] ?? null,
        cat2: chain[1] ?? null,
        cat3: chain[2] ?? null,
        cat4: chain[3] ?? null,
      })
    },
    onSuccess: () => {
      setError('')
      invalidate()
    },
    onError: fail,
  })

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

  const needle = q.trim().toLowerCase()
  const match = (r: Requirement) =>
    !needle ||
    reqLabel(r).toLowerCase().includes(needle) ||
    (r.title ?? '').toLowerCase().includes(needle)

  const countDeep = (n: CategoryTreeNode): number =>
    (byFolder.get(n.id) ?? []).filter(match).length +
    n.children.reduce((a, k) => a + countDeep(k), 0)

  const toggle = (id: string) =>
    setOpenIds((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const isSelfOrDesc = (dragged: string, target: string): boolean => {
    if (dragged === target) return true
    return cats.filter((c) => c.parent_id === dragged).some((k) => isSelfOrDesc(k.id, target))
  }

  const startRename = (n: CategoryTreeNode) => {
    setCtx(null)
    setRenaming(n.id)
    setRenameText(n.name)
  }

  const doDelete = (n: CategoryTreeNode) => {
    setCtx(null)
    const deep = countDeep(n)
    const msg =
      deep > 0
        ? `'${n.name}' 을 지웁니다.\n안에 있는 요구사항 ${deep}건은 지워지지 않고 미분류가 됩니다.\n계속할까요?`
        : `'${n.name}' 을 지울까요?`
    if (window.confirm(msg)) removeCatM.mutate(n.id)
  }

  /**
   * 끌기. 포인터 이벤트를 쓰는 이유는 HTML5 드래그가 행 안에 버튼·
   * 체크박스가 있으면 시작조차 안 되고 원격데스크톱에서 자주 먹통이 되기
   * 때문이다.
   */
  /** 끌고 있는 것의 이름 — 커서 옆에 적는다 */
  const dragLabel = (kind: 'req' | 'cat', id: string) => {
    if (kind === 'cat') return cats.find((c) => c.id === id)?.name ?? '폴더'
    const r = reqs.find((x) => reqPk(x) === id)
    return r ? r.title || reqLabel(r) : '요구사항'
  }

  const beginDrag = (e: React.PointerEvent, kind: 'req' | 'cat', id: string) => {
    if (e.button !== 0) return
    const x0 = e.clientX
    const y0 = e.clientY
    let started = false

    const move = (ev: PointerEvent) => {
      if (!started) {
        if (Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) < 5) return
        started = true
        setDrag({ kind, id })
        document.body.style.userSelect = 'none'
        document.body.style.cursor = 'grabbing'
      }
      setGhost({ x: ev.clientX, y: ev.clientY, label: dragLabel(kind, id) })
      const el = document.elementFromPoint(ev.clientX, ev.clientY)
      const row = el?.closest('[data-folder]') as HTMLElement | null
      if (row) setOver(row.dataset.folder || null)
      else if (el?.closest('[data-root]')) setOver(null)
      else setOver(undefined)
    }

    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      setDrag(null)
      setGhost(null)
      setOver(undefined)
      if (!started) return
      justDragged.current = true
      const el = document.elementFromPoint(ev.clientX, ev.clientY)
      const row = el?.closest('[data-folder]') as HTMLElement | null
      const target = row
        ? row.dataset.folder || null
        : el?.closest('[data-root]')
          ? null
          : undefined
      if (target === undefined) return

      if (kind === 'req') {
        const r = reqs.find((x) => reqPk(x) === id)
        if (!r || reqFolder(r) === target) return
        moveReqM.mutate({ r, folderId: target })
        return
      }
      const cat = catById.get(id)
      if (!cat) return
      if (target && isSelfOrDesc(id, target)) {
        setError('자기 자신이나 하위 폴더 밑으로는 옮길 수 없습니다')
        return
      }
      if ((cat.parent_id ?? null) === target) return
      moveCatM.mutate({ cat, parentId: target })
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const reqRow = (r: Requirement, depth: number, folderName?: string | null) => {
    const pk = reqPk(r)
    const tcs = tcsFor(r)
    let pass = 0
    let f = 0
    for (const t of tcs) {
      const c = statusClass(t.status)
      if (c === 'pass') pass++
      else if (c === 'fail') f++
    }
    const idle = tcs.length - pass - f
    const cover =
      tcs.length === 0
        ? { cls: 'none', label: 'TC 없음 — 미커버' }
        : f > 0
          ? { cls: 'fail', label: `FAIL ${f}건` }
          : idle > 0
            ? { cls: 'idle', label: `미실행 ${idle}건` }
            : { cls: 'pass', label: `${pass}건 모두 통과` }

    const full = reqLabel(r)
    const shown = fullId ? full : shortReqId(full, folderName)

    return (
      <div
        key={pk}
        role="button"
        tabIndex={0}
        className={`rt-req${pk === selected ? ' on' : ''}${
          drag?.kind === 'req' && drag.id === pk ? ' dragging' : ''
        }`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => !justDragged.current && onSelect(pk)}
        onPointerDown={(e) => beginDrag(e, 'req', pk)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelect(pk)
          }
        }}
      >
        <input
          type="checkbox"
          className="rt-pick"
          aria-label={`${full} 선택`}
          checked={picked.has(pk)}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={() => onPick(pk)}
        />
        <span className="rt-dicon" aria-hidden="true">
          <IconReqDoc />
        </span>
        <span className="rt-id" title={full}>
          {shown || '(ID 없음)'}
        </span>
        <span className="rt-title" title={r.title ?? ''}>
          {r.title || '(제목 없음)'}
        </span>
        <span className="rt-tc" title={cover.label}>
          <span className={`rt-cdot ${cover.cls}`} />
          {tcs.length}
        </span>
      </div>
    )
  }

  const renderFolder = (n: CategoryTreeNode) => {
    const open = needle ? true : openIds.has(n.id)
    const mine = foldersOnly ? [] : (byFolder.get(n.id) ?? []).filter(match)
    const total = countDeep(n)
    if (needle && total === 0 && !foldersOnly) return null
    const hasKids = n.children.length > 0 || mine.length > 0

    return (
      <div key={n.id}>
        <div
          data-folder={n.id}
          className={`rt-fold${selectedFolder === n.id ? ' on' : ''}${
            over === n.id && drag ? ' dropinto' : ''
          }${drag?.kind === 'cat' && drag.id === n.id ? ' dragging' : ''}${
            clip?.id === n.id ? ' copied' : ''
          }`}
          style={{ paddingLeft: 4 + (n.depth - 1) * 14 }}
          tabIndex={0}
          // 폴더를 누르면 그 아래 요구사항의 TC 를 오른쪽에 모아 보인다.
          // 폴더는 펼치는 것 말고 할 일이 없었는데, 실제로는 '이 묶음의
          // 시험이 다 됐나' 를 폴더 단위로 보는 일이 가장 잦다.
          onClick={() => !justDragged.current && onSelectFolder(n.id)}
          onPointerDown={(e) => beginDrag(e, 'cat', n.id)}
          // 우클릭이 곧 메뉴다. Zephyr·탐색기와 같아 배울 것이 없다.
          onContextMenu={(e) => {
            e.preventDefault()
            setCtx({ x: e.clientX, y: e.clientY, cat: n })
          }}
          // F2 · Delete — 탐색기와 같은 키
          onKeyDown={(e) => {
            if (renaming) return
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onSelectFolder(n.id)
            }
            if (e.key === 'F2') {
              e.preventDefault()
              startRename(n)
            }
            if (e.key === 'Delete') {
              e.preventDefault()
              doDelete(n)
            }
          }}
        >
          <input
            type="checkbox"
            className="rt-pick"
            aria-label={`${n.name} 폴더 선택`}
            checked={pickedFolders.has(n.id)}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onChange={() => onPickFolder(n.id)}
          />
          <button
            type="button"
            className={`rt-caret${open ? ' open' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              toggle(n.id)
            }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={open ? '접기' : '펼치기'}
            disabled={!hasKids}
          >
            {hasKids ? <IconChevron /> : <span className="rt-dot" />}
          </button>

          {/* 폴더 아이콘. 굵기만으로는 폴더와 항목이 잘 안 갈린다 —
              iTest 도 폴더에 아이콘을 두고, 펼친 것과 닫힌 것의 모양을
              달리해 상태까지 한 번에 읽히게 한다. */}
          <span className="rt-ficon" aria-hidden="true">
            <IconFolder open={open} />
          </span>

          {renaming === n.id ? (
            // 창을 띄우지 않고 그 자리에서 고친다
            <input
              autoFocus
              className="rt-rename"
              value={renameText}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setRenameText(e.target.value)}
              onBlur={() => setRenaming(null)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && renameText.trim())
                  renameM.mutate({ cat: n, name: renameText.trim() })
                if (e.key === 'Escape') setRenaming(null)
              }}
            />
          ) : (
            <b
              className="rt-fname"
              title={n.name}
              // 두 번 누르면 이름 변경 — 탐색기와 같다
              onDoubleClick={(e) => {
                e.stopPropagation()
                startRename(n)
              }}
            >
              {n.name}
            </b>
          )}

          <span className="rt-cnt">{total || ''}</span>
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
            {mine.map((r) => reqRow(r, n.depth, n.name))}
          </>
        )}
      </div>
    )
  }

  const uncat = foldersOnly ? [] : (byFolder.get(null) ?? []).filter(match)

  return (
    <div
      className="rt"
      ref={treeRef}
      onPointerDown={() => {
        justDragged.current = false
      }}
    >
      <div className="rt-search">
        <input
          value={q}
          placeholder="REQ ID · 제목 검색"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setQ('')}
        />
      </div>

      {error && <div className="rt-error">{error}</div>}

      {clip && (
        <div className="rt-clip">
          <b>{clip.name}</b> 복사됨 — 붙여넣을 폴더에 우클릭
          <button className="btn small" type="button" onClick={() => setClip(null)}>
            취소
          </button>
        </div>
      )}

      <div className="rt-body">
        {addingTo === null && (
          <div className="rt-add" style={{ paddingLeft: 8 }}>
            <input
              autoFocus
              value={draftName}
              placeholder="폴더 이름"
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

        {catQ.isLoading ? <div className="empty">불러오는 중…</div> : tree.map(renderFolder)}

        <div
          data-root="1"
          className={`rt-fold rt-uncat${selectedFolder === null ? ' on' : ''}${
            over === null && drag ? ' dropinto' : ''
          }`}
          tabIndex={0}
          onClick={() => !justDragged.current && onSelectFolder(null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onSelectFolder(null)
            }
          }}
          onContextMenu={(e) => {
            // 최상위에 붙여넣기·폴더 만들기
            e.preventDefault()
            setCtx({ x: e.clientX, y: e.clientY, cat: { id: '', name: '', depth: 0, children: [] } as unknown as CategoryTreeNode })
          }}
        >
          <span className="rt-pick-sp" />
          <span className="rt-caret" />
          <b className="rt-fname">미분류</b>
          <span className="rt-cnt">{uncat.length || ''}</span>
        </div>
        {uncat.map((r) => reqRow(r, 1, null))}

        {ghost && (
          <div className="rt-ghost" style={{ left: ghost.x + 14, top: ghost.y + 12 }}>
            {drag?.kind === 'cat' ? <IconFolder /> : <IconReqDoc />}
            {ghost.label}
          </div>
        )}

        {drag && (
          <div className="rt-hint">
            {drag.kind === 'cat'
              ? '폴더 위에 놓으면 그 아래로, 미분류에 놓으면 최상위로 나갑니다'
              : '폴더 위에 놓으면 그 폴더로 옮겨집니다'}
          </div>
        )}
      </div>

      {/* 우클릭 메뉴 — Zephyr 와 같은 항목 */}
      {ctx && (
        <div
          className="rt-ctx"
          style={{ left: ctx.x, top: ctx.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {ctx.cat.id ? (
            <>
              {ctx.cat.depth < MAX_CAT_DEPTH && (
                <button
                  type="button"
                  onClick={() => {
                    setCtx(null)
                    setAddingTo(ctx.cat.id)
                    setDraftName('')
                    setOpenIds((s) => new Set(s).add(ctx.cat.id))
                  }}
                >
                  하위 폴더 추가
                </button>
              )}
              <button type="button" onClick={() => startRename(ctx.cat)}>
                이름 변경 <span className="rt-key">F2</span>
              </button>
              <hr />
              <button
                type="button"
                onClick={() => {
                  setClip(ctx.cat)
                  setCtx(null)
                }}
              >
                복사
              </button>
              <button
                type="button"
                disabled={!clip || pasteM.isPending || isSelfOrDesc(clip.id, ctx.cat.id)}
                title={
                  clip && isSelfOrDesc(clip.id, ctx.cat.id)
                    ? '자기 자신이나 하위에는 붙여넣을 수 없습니다'
                    : ''
                }
                onClick={() => {
                  if (!clip) return
                  pasteM.mutate({ src: clip, parentId: ctx.cat.id })
                  setClip(null)
                  setCtx(null)
                }}
              >
                붙여넣기
              </button>
              <hr />
              <button type="button" className="danger" onClick={() => doDelete(ctx.cat)}>
                삭제
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setCtx(null)
                  setAddingTo(null)
                  setDraftName('')
                }}
              >
                최상위 폴더 추가
              </button>
              <button
                type="button"
                disabled={!clip || pasteM.isPending}
                onClick={() => {
                  if (!clip) return
                  pasteM.mutate({ src: clip, parentId: null })
                  setClip(null)
                  setCtx(null)
                }}
              >
                여기에 붙여넣기
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
