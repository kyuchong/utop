import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { categoryApi } from '@/api/client'
import {
  buildCategoryTree,
  MAX_CAT_DEPTH,
  type CategoryTreeNode,
  type ReqCategory,
} from '@/types'
import { IconChevron } from './icons'
import './CategoryTree.css'

interface Props {
  /** 선택된 분류 id. null 이면 전체 */
  selected: string | null
  onSelect: (id: string | null) => void
}

/**
 * 요구사항 분류 트리 (대분류 > 중분류 > 소분류, 최대 3단).
 *
 * 깊이 상한은 서버가 강제한다. 화면에서는 3단째 행에 「+」 버튼을 아예
 * 두지 않는 것으로 같은 규칙을 미리 보여준다 — 눌러본 뒤 거부당하지 않도록.
 */
export default function CategoryTree({ selected, onSelect }: Props) {
  const qc = useQueryClient()
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())
  const [addingTo, setAddingTo] = useState<string | null | undefined>(undefined)
  const [draftName, setDraftName] = useState('')
  const [error, setError] = useState('')
  // 드래그 중인 분류 id / 올려둔 대상 id (null = 최상위로 빼기)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null | undefined>(undefined)

  const catQ = useQuery({
    queryKey: ['req-categories'],
    queryFn: ({ signal }) => categoryApi.list(signal),
  })

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
    mutationFn: (v: { id: string; name: string; parentId: string | null }) =>
      categoryApi.rename(v.id, v.name, v.parentId),
    onSuccess: () => {
      setError('')
      invalidate()
    },
    onError: fail,
  })

  const removeM = useMutation({
    mutationFn: (id: string) => categoryApi.remove(id),
    onSuccess: () => {
      setError('')
      invalidate()
    },
    onError: fail,
  })

  const list = catQ.data?.categories ?? []
  const tree = buildCategoryTree(list)

  const toggle = (id: string) =>
    setOpenIds((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const startAdd = (parentId: string | null) => {
    setAddingTo(parentId)
    setDraftName('')
    setError('')
    if (parentId) setOpenIds((s) => new Set(s).add(parentId))
  }

  const submitAdd = () => {
    const name = draftName.trim()
    if (!name) return
    createM.mutate({ name, parentId: addingTo ?? null })
  }

  /** 자기 자신이나 자기 자손 위로는 떨어뜨릴 수 없다 (순환) */
  const isSelfOrDescendant = (dragged: string, target: string): boolean => {
    if (dragged === target) return true
    const kids = list.filter((c) => c.parent_id === dragged)
    return kids.some((k) => isSelfOrDescendant(k.id, target))
  }

  const drop = (targetId: string | null) => {
    const id = dragId
    setDragId(null)
    setOverId(undefined)
    if (!id) return
    if (targetId && isSelfOrDescendant(id, targetId)) {
      setError('자기 자신이나 하위 분류 밑으로는 옮길 수 없습니다')
      return
    }
    const me = list.find((c) => c.id === id)
    if (!me || (me.parent_id ?? null) === targetId) return
    setError('')
    // 깊이 상한은 서버가 판정한다 — 옮기는 가지의 높이까지 계산해야 해서
    // 화면에서 흉내내면 규칙이 두 벌이 된다.
    renameM.mutate({ id, name: me.name, parentId: targetId })
  }

  const doRename = (c: ReqCategory) => {
    const name = window.prompt('분류 이름', c.name)?.trim()
    if (!name || name === c.name) return
    renameM.mutate({ id: c.id, name, parentId: c.parent_id })
  }

  const countAll = (n: CategoryTreeNode): number =>
    n.children.reduce((a, k) => a + 1 + countAll(k), 0)

  const doRemove = (n: CategoryTreeNode) => {
    const total = countAll(n)
    const warn =
      total > 0
        ? `'${n.name}' 과 그 아래 하위 분류 ${total}개가 함께 삭제됩니다.\n`
        : `'${n.name}' 을 삭제합니다.\n`
    if (!window.confirm(warn + '요구사항은 지워지지 않고 미분류가 됩니다. 계속할까요?'))
      return
    removeM.mutate(n.id)
  }

  const nameInput = (
    <div className="cat-add">
      <input
        autoFocus
        value={draftName}
        placeholder="분류 이름"
        onChange={(e) => setDraftName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submitAdd()
          if (e.key === 'Escape') setAddingTo(undefined)
        }}
      />
      <button className="btn primary" type="button" onClick={submitAdd}>
        추가
      </button>
      <button className="btn" type="button" onClick={() => setAddingTo(undefined)}>
        취소
      </button>
    </div>
  )

  const renderNode = (n: CategoryTreeNode) => {
    const open = openIds.has(n.id)
    const hasKids = n.children.length > 0
    const canAddChild = n.depth < MAX_CAT_DEPTH
    return (
      <div key={n.id}>
        <div
          className={
            `cat-row${selected === n.id ? ' sel' : ''}` +
            `${dragId === n.id ? ' dragging' : ''}` +
            `${overId === n.id ? ' dropinto' : ''}`
          }
          style={{ paddingLeft: 4 + (n.depth - 1) * 14 }}
          draggable
          onDragStart={(e) => {
            setDragId(n.id)
            e.dataTransfer.effectAllowed = 'move'
            // 파이어폭스는 데이터가 없으면 드래그를 시작하지 않는다
            e.dataTransfer.setData('text/plain', n.id)
          }}
          onDragEnd={() => {
            setDragId(null)
            setOverId(undefined)
          }}
          onDragOver={(e) => {
            if (!dragId || dragId === n.id) return
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            setOverId(n.id)
          }}
          onDragLeave={() => setOverId((v) => (v === n.id ? undefined : v))}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            drop(n.id)
          }}
        >
          <button
            type="button"
            className={`cat-caret${open ? ' open' : ''}`}
            onClick={() => toggle(n.id)}
            aria-label={open ? '접기' : '펼치기'}
            disabled={!hasKids}
          >
            {hasKids ? <IconChevron /> : <span className="cat-dot" />}
          </button>
          <button
            type="button"
            className="cat-name"
            onClick={() => onSelect(n.id)}
            title={n.name}
          >
            {n.name}
          </button>
          {n.req_count > 0 && <span className="cat-count">{n.req_count}</span>}
          <span className="cat-actions">
            {canAddChild && (
              <button type="button" onClick={() => startAdd(n.id)} title="하위 분류 추가">
                +
              </button>
            )}
            <button type="button" onClick={() => doRename(n)} title="이름 변경">
              ✎
            </button>
            <button type="button" onClick={() => doRemove(n)} title="삭제">
              ×
            </button>
          </span>
        </div>

        {addingTo === n.id && (
          <div style={{ paddingLeft: (n.depth - 1) * 14 }}>{nameInput}</div>
        )}

        {open && n.children.map(renderNode)}
      </div>
    )
  }

  return (
    <div className="cat-tree">
      <div className="cat-head">
        <b>분류</b>
        <button className="btn" type="button" onClick={() => startAdd(null)} title="대분류 추가">
          + 대분류
        </button>
      </div>

      {error && <div className="cat-error">{error}</div>}

      <button
        type="button"
        className={
          `cat-row root${selected === null ? ' sel' : ''}` +
          `${overId === null ? ' dropinto' : ''}`
        }
        onClick={() => onSelect(null)}
        onDragOver={(e) => {
          if (!dragId) return
          e.preventDefault()
          setOverId(null)
        }}
        onDragLeave={() => setOverId((v) => (v === null ? undefined : v))}
        onDrop={(e) => {
          e.preventDefault()
          drop(null)
        }}
        title={dragId ? '여기에 놓으면 최상위(대분류)로 나갑니다' : undefined}
      >
        <span className="cat-name">전체</span>
      </button>

      {addingTo === null && nameInput}

      {catQ.isLoading ? (
        <div className="empty">불러오는 중…</div>
      ) : tree.length === 0 ? (
        <div className="empty">
          분류가 없습니다.
          <br />
          <span className="muted small">위 「+ 대분류」로 만드세요.</span>
        </div>
      ) : (
        tree.map(renderNode)
      )}
    </div>
  )
}
