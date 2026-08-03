import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { categoryApi, reqApi } from '@/api/client'
import {
  buildCategoryTree,
  MAX_CAT_DEPTH,
  naturalCompare,
  reqLabel,
  reqPk,
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
 * 요구사항은 끌어서 다른 폴더로 옮긴다. 옮기면 cat1~cat4 가 그 폴더의
 * 조상 사슬로 다시 채워진다 — 화면이 어느 단계에 놓였는지 계산해서
 * 서버에 그대로 넘긴다.
 */
export default function ReqTree({
  reqs,
  tcsFor,
  selected,
  onSelect,
  picked,
  onPick,
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
  /** 끌고 있는 요구사항 PK */
  const [dragReq, setDragReq] = useState<string | null>(null)
  /** 올려둔 폴더 id. null = 미분류로 빼기 */
  const [overFolder, setOverFolder] = useState<string | null | undefined>(undefined)

  const catQ = useQuery({
    queryKey: ['req-categories'],
    queryFn: ({ signal }) => categoryApi.list(signal),
  })
  const cats = catQ.data?.categories ?? []
  const tree = useMemo(() => buildCategoryTree(cats), [cats])

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
   * 거슬러 올라가 단계에 맞춰 채운다. 3단 폴더에 놓으면
   * cat1=조부모 · cat2=부모 · cat3=그 폴더 · cat4=없음 이 된다.
   */
  const moveM = useMutation({
    mutationFn: async ({ r, folderId }: { r: Requirement; folderId: string | null }) => {
      const chain: string[] = []
      let cur = folderId ? cats.find((c) => c.id === folderId) : undefined
      while (cur) {
        chain.unshift(cur.id)
        cur = cur.parent_id ? cats.find((c) => c.id === cur!.parent_id) : undefined
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

  /** 이 폴더(자손 포함)에 걸리는 요구사항 수 — 폴더 오른쪽 숫자 */
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

  /**
   * 요구사항 끌기. 포인터 이벤트를 쓰는 이유는 분류 트리와 같다 —
   * HTML5 드래그는 행 안에 버튼·체크박스가 있으면 시작조차 안 되고
   * 원격데스크톱에서 자주 먹통이 된다.
   */
  const beginDrag = (e: React.PointerEvent, pk: string) => {
    if (e.button !== 0) return
    const x0 = e.clientX
    const y0 = e.clientY
    let started = false

    const move = (ev: PointerEvent) => {
      if (!started) {
        // 5px 넘게 움직여야 드래그. 그냥 클릭까지 먹으면 고를 수가 없다.
        if (Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) < 5) return
        started = true
        setDragReq(pk)
        document.body.style.userSelect = 'none'
        document.body.style.cursor = 'grabbing'
      }
      const el = document.elementFromPoint(ev.clientX, ev.clientY)
      const row = el?.closest('[data-folder]') as HTMLElement | null
      if (row) setOverFolder(row.dataset.folder || null)
      else if (el?.closest('[data-uncat]')) setOverFolder(null)
      else setOverFolder(undefined)
    }

    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      setDragReq(null)
      setOverFolder(undefined)
      if (!started) return
      const el = document.elementFromPoint(ev.clientX, ev.clientY)
      const row = el?.closest('[data-folder]') as HTMLElement | null
      const target = row ? row.dataset.folder || null : el?.closest('[data-uncat]') ? null : undefined
      if (target === undefined) return
      const r = reqs.find((x) => reqPk(x) === pk)
      if (!r) return
      if (reqFolder(r) === target) return
      moveM.mutate({ r, folderId: target })
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const reqRow = (r: Requirement, depth: number) => {
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
    return (
      <div
        key={pk}
        role="button"
        tabIndex={0}
        className={`rt-req${pk === selected ? ' on' : ''}${dragReq === pk ? ' dragging' : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => onSelect(pk)}
        onPointerDown={(e) => beginDrag(e, pk)}
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
          aria-label={`${reqLabel(r)} 선택`}
          checked={picked.has(pk)}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={() => onPick(pk)}
        />
        <span className="rt-id" title={reqLabel(r)}>
          {reqLabel(r) || '(ID 없음)'}
        </span>
        <span className="rt-title" title={r.title ?? ''}>
          {r.title || '(제목 없음)'}
        </span>
        <span className="rt-tc">
          {tcs.length === 0 ? (
            <span className="muted">TC 0</span>
          ) : (
            <>
              {pass > 0 && <b className="status pass">{pass}</b>}
              {f > 0 && <b className="status fail">{f}</b>}
              {idle > 0 && <b className="status idle">{idle}</b>}
            </>
          )}
        </span>
      </div>
    )
  }

  const renderFolder = (n: CategoryTreeNode) => {
    // 검색 중에는 접힌 것도 펼친다 — 접혀 있으면 찾아놓고 못 본다.
    const open = needle ? true : openIds.has(n.id)
    const mine = (byFolder.get(n.id) ?? []).filter(match)
    const total = countDeep(n)
    if (needle && total === 0) return null
    const hasKids = n.children.length > 0 || mine.length > 0
    return (
      <div key={n.id}>
        <div
          data-folder={n.id}
          className={`rt-fold${overFolder === n.id ? ' dropinto' : ''}`}
          style={{ paddingLeft: 4 + (n.depth - 1) * 14 }}
        >
          <button
            type="button"
            className={`rt-caret${open ? ' open' : ''}`}
            onClick={() => toggle(n.id)}
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
              onClick={() => draftName.trim() && createM.mutate({ name: draftName.trim(), parentId: n.id })}
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

  const uncat = (byFolder.get(null) ?? []).filter(match)

  return (
    <div className="rt">
      {editing && (
        <CategoryEditForm cat={editing} all={cats} onClose={() => setEditing(null)} />
      )}

      <div className="rt-head">
        <span className="panel-name">
          요구사항
          <span className="muted small">{reqs.length}건</span>
        </span>
        <button
          className="btn small"
          type="button"
          title="최상위 폴더 추가"
          onClick={() => {
            setAddingTo(null)
            setDraftName('')
          }}
        >
          + 폴더
        </button>
      </div>

      <div className="rt-search">
        <input
          value={q}
          placeholder="REQ ID · 제목 검색"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setQ('')}
        />
      </div>

      {error && <div className="rt-error">{error}</div>}

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
              onClick={() => draftName.trim() && createM.mutate({ name: draftName.trim(), parentId: null })}
            >
              추가
            </button>
            <button className="btn small" type="button" onClick={() => setAddingTo(undefined)}>
              취소
            </button>
          </div>
        )}

        {catQ.isLoading ? (
          <div className="empty">불러오는 중…</div>
        ) : (
          tree.map(renderFolder)
        )}

        {/* 분류가 안 붙은 것. 끌어다 놓으면 폴더에서 빼낼 수도 있다. */}
        <div
          data-uncat="1"
          className={`rt-fold rt-uncat${overFolder === null && dragReq ? ' dropinto' : ''}`}
        >
          <span className="rt-caret" />
          <b className="rt-fname">미분류</b>
          <span className="rt-cnt">{uncat.length || ''}</span>
        </div>
        {uncat.map((r) => reqRow(r, 1))}

        {dragReq && (
          <div className="rt-hint">폴더 위에 놓으면 그 폴더로 옮겨집니다</div>
        )}
      </div>
    </div>
  )
}
