import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { categoryApi } from '@/api/client'
import {
  buildCategoryTree,
  MAX_CAT_DEPTH,
  compareByAlpha,
  compareByNumber,
  naturalCompare,
  UNCATEGORIZED,
  type CategoryTreeNode,
  type ReqCategory,
} from '@/types'
import { IconChevron, IconGrip } from './icons'
import CategoryEditForm from './CategoryEditForm'
import './CategoryTree.css'

type SortKey = 'manual' | 'number' | 'alpha' | 'name'

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
  const [editing, setEditing] = useState<ReqCategory | null>(null)
  // 드래그 중인 분류 id / 올려둔 대상 id (null = 최상위로 빼기)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null | undefined>(undefined)
  // 체크박스는 항상 보인다. 모드를 두면 '선택' 을 먼저 눌러야 해서 한 단계가 는다.
  const [picked, setPicked] = useState<Set<string>>(new Set())
  // 정렬 기준. 브라우저에 기억시킨다.
  const [sort, setSort] = useState<SortKey>(
    () => (localStorage.getItem('utop.cat.sort') as SortKey) || 'manual',
  )

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

  /**
   * 정렬. 같은 단계끼리만 정렬하고 부모-자식 관계는 건드리지 않는다.
   *  - manual: 서버가 준 순서(sort_order → 이름). 드래그로 옮긴 구조를 그대로.
   *  - name  : 이름 오름차순. 숫자를 수로 읽는 자연 정렬이다 —
   *            그냥 비교하면 '1-10' 이 '1-2' 보다, 'E43' 이 'E5' 보다 앞에 온다.
   *  - count : 요구사항이 많은 분류부터. 어디에 일이 몰려 있는지 볼 때.
   */
  const tree = useMemo(() => {
    const t0 = buildCategoryTree(list)
    if (sort === 'manual') return t0
    const by =
      sort === 'number' ? compareByNumber : sort === 'alpha' ? compareByAlpha : naturalCompare
    const walk = (ns: CategoryTreeNode[]): CategoryTreeNode[] =>
      [...ns]
        .sort((a, b) => by(a.name, b.name))
        .map((n) => ({ ...n, children: walk(n.children) }))
    return walk(t0)
  }, [list, sort])

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
    // 이름만 바꾸는 게 아니라 상위 분류도 여기서 고른다.
    // 드래그는 환경을 타서(원격데스크톱·터치패드) 확실한 길이 따로 있어야 한다.
    setEditing(c)
  }


  const countAll = (n: CategoryTreeNode): number =>
    n.children.reduce((a, k) => a + 1 + countAll(k), 0)

  /** 자기 자신 + 모든 자손 id */
  const withDescendants = (id: string): string[] => {
    const out: string[] = []
    const walk = (x: string) => {
      if (out.includes(x)) return
      out.push(x)
      for (const c of list) if (c.parent_id === x) walk(c.id)
    }
    walk(id)
    return out
  }

  /**
   * 체크는 하위까지 함께 움직인다.
   * 상위만 고르고 하위는 안 골라진 상태로 지우면, 어차피 CASCADE 로 하위도
   * 사라지는데 화면에는 안 고른 것처럼 보여 헷갈린다.
   */
  const togglePick = (id: string) =>
    setPicked((s) => {
      const n = new Set(s)
      const ids = withDescendants(id)
      if (n.has(id)) ids.forEach((x) => n.delete(x))
      else ids.forEach((x) => n.add(x))
      return n
    })

  const removeManyM = useMutation({
    mutationFn: async (ids: string[]) => {
      // 조상을 먼저 지우면 자손은 CASCADE 로 함께 사라진다. 그 뒤에 자손을
      // 또 지우려 하면 404 가 나므로, 이미 사라진 것은 조용히 넘긴다.
      for (const id of ids) {
        try {
          await categoryApi.remove(id)
        } catch (e) {
          if (!(e instanceof Error) || !e.message.includes('찾을 수 없')) throw e
        }
      }
    },
    onSuccess: () => {
      setPicked(new Set())
      setError('')
      invalidate()
    },
    onError: fail,
  })

  const doRemovePicked = () => {
    const ids = [...picked]
    if (ids.length === 0) return
    // 고른 것들의 자손까지 합쳐서 실제로 몇 개가 사라지는지 알려준다
    const all = new Set<string>()
    const walk = (id: string) => {
      if (all.has(id)) return
      all.add(id)
      for (const c of list) if (c.parent_id === id) walk(c.id)
    }
    ids.forEach(walk)
    const extra = all.size - ids.length
    const lines = [`분류 ${ids.length}개를 삭제합니다.`]
    if (extra > 0) lines.push(`하위 분류 ${extra}개도 함께 사라집니다.`)
    lines.push('요구사항은 지워지지 않고 미분류가 됩니다. 계속할까요?')
    const msg = lines.join('\n')
    if (!window.confirm(msg)) return
    removeManyM.mutate(ids)
  }

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
            // 버튼·체크박스 위에서 시작한 드래그는 무시한다 —
            // 그 위에서는 클릭이 우선이어야 한다.
            const el = e.target as HTMLElement
            if (el.closest('button, input')) {
              e.preventDefault()
              return
            }
            setDragId(n.id)
            e.dataTransfer.effectAllowed = 'move'
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
          {/* 드래그는 이 손잡이에서만 시작한다.
              행 전체를 draggable 로 두면 체크박스·버튼 위에서 끌 때
              브라우저가 컨테이너 드래그를 시작하지 않아 잡을 곳이 없다. */}
          <span
            className="cat-grip"
            title="끌어서 상위 분류 변경"
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
          >
            <IconGrip />
          </span>
          <input
            type="checkbox"
            className="cat-pick"
            checked={picked.has(n.id)}
            onChange={() => togglePick(n.id)}
            onClick={(e) => e.stopPropagation()}
            aria-label={`${n.name} 선택`}
          />
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
      {editing && (
        <CategoryEditForm
          cat={editing}
          all={list}
          onClose={() => setEditing(null)}
        />
      )}
      <div className="cat-head">
        <span className="panel-name">REQ 분류</span>
        <select
          className="cat-sort"
          value={sort}
          title="정렬 기준"
          onChange={(e) => {
            const v = e.target.value as SortKey
            setSort(v)
            localStorage.setItem('utop.cat.sort', v)
          }}
        >
          <option value="manual">직접</option>
          <option value="number">숫자순</option>
          <option value="alpha">알파벳순</option>
          <option value="name">이름순</option>
        </select>
        <button
          type="button"
          className={`btn cat-all${selected === null ? ' primary' : ''}`}
          onClick={() => onSelect(null)}
          title="분류에 상관없이 전체 보기"
        >
          전체
        </button>
        <div className="cat-head-actions">
          {picked.size > 0 && (
            <button
              className="btn danger"
              type="button"
              disabled={removeManyM.isPending}
              onClick={doRemovePicked}
              title={`${picked.size}개 삭제`}
            >
              {removeManyM.isPending ? '…' : `${picked.size} 삭제`}
            </button>
          )}
          <button
            className="btn"
            type="button"
            onClick={() => startAdd(null)}
            title="대분류 추가"
          >
            +
          </button>
        </div>
      </div>

      {error && <div className="cat-error">{error}</div>}

      {/* 드래그 중에만 나타나는 '최상위로 빼기' 영역.
          평소에 자리를 차지하면 목록만 밀린다. */}
      {dragId && (
        <div
          className={`cat-drop-root${overId === null ? ' dropinto' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setOverId(null)
          }}
          onDragLeave={() => setOverId((v) => (v === null ? undefined : v))}
          onDrop={(e) => {
            e.preventDefault()
            drop(null)
          }}
        >
          여기에 놓으면 대분류로 나갑니다
        </div>
      )}

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

      {/* 분류가 안 붙은 요구사항을 찾는 자리. 실제 분류가 아니라 필터라서
          이름 변경·삭제·하위 추가가 없다. */}
      <div
        className={`cat-row uncat${selected === UNCATEGORIZED ? ' sel' : ''}`}
        onClick={() => onSelect(UNCATEGORIZED)}
      >
        <span className="cat-caret" />
        {/* 글자를 누르는 게 자연스러운데, 여기서 stopPropagation 을 하면
            부모의 선택 처리까지 막혀 아무 일도 일어나지 않았다. */}
        <button
          type="button"
          className="cat-name"
          onClick={() => onSelect(UNCATEGORIZED)}
        >
          미분류
        </button>
      </div>
    </div>
  )
}
