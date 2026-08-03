import { useEffect, useMemo, useState } from 'react'
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
import { IconChevron } from './icons'
import CategoryEditForm from './CategoryEditForm'
import './ReqTree.css'

interface Props {
  reqs: Requirement[]
  /** req PK → 그 요구사항에 달린 TC */
  tcsFor: (r: Requirement) => TestCaseMeta[]
  selected: string | null
  onSelect: (reqPk: string) => void
  /** 여러 건 고르기 (삭제용) */
  picked: Set<string>
  onPick: (reqPk: string) => void
  /** 고른 폴더. 바깥 버튼에서 삭제하려고 올려 보낸다 */
  pickedFolders: Set<string>
  onPickFolder: (catId: string) => void
  /** 「+ 폴더」 · 「일괄 폴더」를 바깥 버튼 줄에서 누를 수 있게 */
  addFolderSignal: number
  bulkFolderSignal: number
}

/** 이 요구사항이 놓인 가장 깊은 분류 id. 없으면 null(미분류) */
function reqFolder(r: Requirement): string | null {
  return (r.cat4 || r.cat3 || r.cat2 || r.cat1 || null) as string | null
}

/**
 * 요구사항 트리 — 폴더 안에 요구사항이 들어간다.
 *
 * 전에는 분류 트리와 요구사항 목록이 따로였다. 자료가 29건 · 분류 20개라
 * 전체가 한 화면에 들어오는데, 굳이 두 단계로 고르게 하고 있었다.
 * Zephyr Enterprise 도 같은 모양이다 — 폴더를 열면 그 안에 요구사항이 있다.
 *
 * 폴더와 요구사항 둘 다 끌어서 옮긴다. 폴더는 서버가 깊이·순환을 판정하고,
 * 요구사항은 놓은 폴더의 조상 사슬로 cat1~cat4 가 다시 채워진다.
 */
export default function ReqTree({
  reqs,
  tcsFor,
  selected,
  onSelect,
  picked,
  onPick,
  pickedFolders,
  onPickFolder,
  addFolderSignal,
  bulkFolderSignal,
}: Props) {
  const qc = useQueryClient()

  // 펼친 폴더. 새로고침해도 남아야 매번 같은 가지를 다시 펴지 않는다.
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
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [addingTo, setAddingTo] = useState<string | null | undefined>(undefined)
  const [draftName, setDraftName] = useState('')
  const [editing, setEditing] = useState<ReqCategory | null>(null)
  const [error, setError] = useState('')
  /** 끌고 있는 것 — 요구사항이면 req, 폴더면 cat */
  const [drag, setDrag] = useState<{ kind: 'req' | 'cat'; id: string } | null>(null)
  /** 올려둔 폴더 id. null = 최상위/미분류로 빼기 */
  const [over, setOver] = useState<string | null | undefined>(undefined)
  /** 폴더 여러 개 만들기 */
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkText, setBulkText] = useState('')
  /** 전체 ID 를 그대로 볼지 (줄여서 보는 것이 기본) */
  const [fullId, setFullId] = useState(false)

  // 바깥 버튼 줄에서 「+ 폴더」·「일괄」을 눌렀을 때
  useEffect(() => {
    if (addFolderSignal > 0) {
      setAddingTo(null)
      setDraftName('')
    }
  }, [addFolderSignal])
  useEffect(() => {
    if (bulkFolderSignal > 0) setBulkOpen(true)
  }, [bulkFolderSignal])

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

  /**
   * 폴더 여러 개를 한 번에.
   *
   * 줄마다 하나씩, 앞의 공백 두 칸이 한 단계 아래다. 트리를 통째로 세울 수
   * 있어야 폴더 20개를 하나씩 만드는 일이 없다.
   */
  const bulkCatM = useMutation({
    mutationFn: async ({ text, parentId }: { text: string; parentId: string | null }) => {
      const stack: Array<{ depth: number; id: string | null }> = [{ depth: -1, id: parentId }]
      let made = 0
      for (const raw of text.split('\n')) {
        if (!raw.trim()) continue
        const depth = Math.floor((raw.length - raw.trimStart().length) / 2)
        while (stack.length > 1 && stack[stack.length - 1]!.depth >= depth) stack.pop()
        const r = await categoryApi.create(raw.trim(), stack[stack.length - 1]!.id)
        stack.push({ depth, id: r.id })
        made++
      }
      return made
    },
    onSuccess: () => {
      setBulkOpen(false)
      setBulkText('')
      setError('')
      invalidate()
    },
    onError: fail,
  })

  /**
   * 폴더 옮기기. 깊이 상한과 순환은 서버가 판정한다 —
   * 화면에서 흉내내면 규칙이 두 벌이 되어 어긋난다.
   */
  const moveCatM = useMutation({
    mutationFn: ({ cat, parentId }: { cat: ReqCategory; parentId: string | null }) =>
      categoryApi.rename(cat.id, cat.name, parentId),
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

  /**
   * 요구사항을 폴더로 옮긴다.
   *
   * 서버는 cat1~cat4 를 각 단계별로 받으므로, 놓은 폴더의 조상 사슬을
   * 거슬러 올라가 단계에 맞춰 채운다.
   */
  const moveReqM = useMutation({
    mutationFn: async ({ r, folderId }: { r: Requirement; folderId: string | null }) => {
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

  /** 폴더별 요구사항. 가장 깊은 분류에 매단다. */
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

  /** 자기 자신이나 자손 위로는 못 놓는다 (순환) */
  const isSelfOrDesc = (dragged: string, target: string): boolean => {
    if (dragged === target) return true
    return cats.filter((c) => c.parent_id === dragged).some((k) => isSelfOrDesc(k.id, target))
  }

  /**
   * 끌기. 포인터 이벤트를 쓰는 이유는 분류 트리와 같다 — HTML5 드래그는
   * 행 안에 버튼·체크박스가 있으면 시작조차 안 되고 원격데스크톱에서
   * 자주 먹통이 된다.
   */
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
      setOver(undefined)
      if (!started) return
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
        onClick={() => onSelect(pk)}
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
        {/* 줄인 ID 를 보이고 전체는 title 로. 폴더 이름이 트리에 이미
            있어서 ID 에 같은 말이 두 번 나오는 것을 막는다. */}
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
    const mine = (byFolder.get(n.id) ?? []).filter(match)
    const total = countDeep(n)
    if (needle && total === 0) return null
    const hasKids = n.children.length > 0 || mine.length > 0
    return (
      <div key={n.id}>
        <div
          data-folder={n.id}
          className={`rt-fold${over === n.id && drag ? ' dropinto' : ''}${
            drag?.kind === 'cat' && drag.id === n.id ? ' dragging' : ''
          }`}
          style={{ paddingLeft: 4 + (n.depth - 1) * 14 }}
          onPointerDown={(e) => beginDrag(e, 'cat', n.id)}
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
          <b className="rt-fname" title={n.name}>
            {n.name}
          </b>
          <span className="rt-cnt">{total || ''}</span>
          <span className="rt-fact">
            <button
              type="button"
              className={`rt-menu-btn${menuFor === n.id ? ' on' : ''}`}
              title="하위 폴더 추가 · 이름 변경 · 삭제"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                setMenuFor(menuFor === n.id ? null : n.id)
              }}
            >
              ⋯
            </button>
            {menuFor === n.id && (
              <>
                <div className="rt-menu-back" onClick={() => setMenuFor(null)} />
                <div className="rt-menu" role="menu">
                  {n.depth < MAX_CAT_DEPTH && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuFor(null)
                        setAddingTo(n.id)
                        setDraftName('')
                        setOpenIds((s) => new Set(s).add(n.id))
                      }}
                    >
                      하위 폴더 추가
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setMenuFor(null)
                      setEditing(n)
                    }}
                  >
                    이름 변경 · 이동
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => {
                      setMenuFor(null)
                      const deep = countDeep(n)
                      const msg =
                        deep > 0
                          ? `'${n.name}' 을 지웁니다.\n안에 있는 요구사항 ${deep}건은 지워지지 않고 미분류가 됩니다.\n계속할까요?`
                          : `'${n.name}' 을 지울까요?`
                      if (window.confirm(msg)) removeCatM.mutate(n.id)
                    }}
                  >
                    삭제
                  </button>
                </div>
              </>
            )}
          </span>
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

  const uncat = (byFolder.get(null) ?? []).filter(match)

  return (
    <div className="rt">
      {editing && <CategoryEditForm cat={editing} all={cats} onClose={() => setEditing(null)} />}

      <div className="rt-search">
        <input
          value={q}
          placeholder="REQ ID · 제목 검색"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setQ('')}
        />
        {/* 줄인 ID 가 기본. 전체가 필요할 때만 켠다. */}
        <button
          type="button"
          className={`rt-fullid${fullId ? ' on' : ''}`}
          title={fullId ? '짧게 보기' : '전체 ID 보기'}
          onClick={() => setFullId((v) => !v)}
        >
          ID
        </button>
      </div>

      {error && <div className="rt-error">{error}</div>}

      {bulkOpen && (
        <div className="rt-bulk">
          <div className="rt-bulk-lb">
            폴더 일괄 만들기 — 줄마다 하나씩. <b>공백 두 칸</b>이 한 단계 아래입니다.
          </div>
          <textarea
            autoFocus
            rows={7}
            value={bulkText}
            placeholder={'U-REQ-SYS-HW\n  Spec\n  FAN\nU-REQ-SYS-SW\n  ENV\n  MGMT'}
            onChange={(e) => setBulkText(e.target.value)}
          />
          <div className="rt-bulk-foot">
            <span className="muted small">
              {bulkText.split('\n').filter((s) => s.trim()).length}개
            </span>
            <button className="btn small" type="button" onClick={() => setBulkOpen(false)}>
              취소
            </button>
            <button
              className="btn small primary"
              type="button"
              disabled={bulkCatM.isPending || !bulkText.trim()}
              onClick={() => bulkCatM.mutate({ text: bulkText, parentId: null })}
            >
              {bulkCatM.isPending ? '만드는 중…' : '만들기'}
            </button>
          </div>
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

        {/* 미분류. 끌어다 놓으면 폴더에서 빼내거나 폴더를 최상위로 올린다. */}
        <div
          data-root="1"
          className={`rt-fold rt-uncat${over === null && drag ? ' dropinto' : ''}`}
        >
          <span className="rt-pick-sp" />
          <span className="rt-caret" />
          <b className="rt-fname">미분류</b>
          <span className="rt-cnt">{uncat.length || ''}</span>
        </div>
        {uncat.map((r) => reqRow(r, 1, null))}

        {drag && (
          <div className="rt-hint">
            {drag.kind === 'cat'
              ? '폴더 위에 놓으면 그 아래로, 미분류에 놓으면 최상위로 나갑니다'
              : '폴더 위에 놓으면 그 폴더로 옮겨집니다'}
          </div>
        )}
      </div>
    </div>
  )
}
