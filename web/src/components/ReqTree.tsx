import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { categoryApi, projectApi, reqApi } from '@/api/client'
import {
  buildCategoryTree,
  sortCategoryTree,
  MAX_CAT_DEPTH,
  naturalCompare,
  reqLabel,
  reqPk,
  type CategoryTreeNode,
  type ReqCategory,
  type Requirement,
  type TestCaseMeta,
} from '@/types'
import { IconChevron, IconFolder, IconProject, IconReqDoc } from './icons'
import './ReqTree.css'

interface Props {
  reqs: Requirement[]
  /** req PK → 그 요구사항에 달린 TC */
  tcsFor: (r: Requirement) => TestCaseMeta[]
  /**
   * 폴더 이름으로 거르기.
   *
   * 요구사항 찾기(`q`)와 갈라 둔다. 하나로 묶으면 「ENV」 를 칠 때 그
   * 이름을 가진 요구사항까지 딸려 나와, 정작 폴더를 찾으려던 사람이
   * 결과를 헤집게 된다. 찾는 것이 다르면 칸도 달라야 한다.
   */
  folderQ?: string
  selected: string | null
  onSelect: (reqPk: string) => void
  /**
   * 고른 폴더. undefined = 폴더를 안 고름 · null = 미분류.
   * 폴더를 고르면 오른쪽에 그 폴더 아래 요구사항의 TC 가 전부 모여 나온다.
   */
  selectedFolder: string | null | undefined
  onSelectFolder: (catId: string | null) => void
  /**
   * 여러 건 고르기 — `req:<pk>` · `cat:<id>` 로 섞어 담는다.
   *
   * 폴더와 요구사항을 따로 담으면 Shift 범위가 둘 사이를 못 건넌다.
   * 화면에 보이는 대로 이어져 있어야 「여기부터 저기까지」 가 맞는다.
   */
  picked: Set<string>
  /** 보기 방식 — ⋯ 메뉴에서 켠다 */
  view?: { fullId: boolean; foldersOnly: boolean }
  /** 찾는 글자 — 머리줄에서 받는다 */
  q?: string
  /** 줄을 눌렀다 — Ctrl·Shift 는 화면이 판단한다 */
  onRowClick: (
    id: string,
    e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean },
    order: string[],
  ) => void
  /** 폴더 안의 차례 — ⋯ 메뉴에서 고른다 */
  sort?: 'id' | 'title'
  /** 폴더 차례 — 이름 첫 글자 갈래를 앞세운다. num=숫자(기본)·
      abc=알파벳·kor=한글, manual=끌기 순(sort_order) */
  folderSort?: 'manual' | 'num' | 'abc' | 'kor'
  /** 「+ 폴더」를 바깥 버튼 줄에서 누를 수 있게 */
  addFolderSignal: number
  /**
   * 최상위 추가 = 새 프로젝트 창(페이지가 띄운다).
   *
   * 최상위 폴더가 곧 프로젝트명이라(2026-08 기획) 이름만 받는 제자리
   * 입력으로는 부족하다 — 고객사·모델을 함께 받아야 한다.
   */
  onAddRoot: () => void
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
  folderQ = '',
  selected,
  onSelect,
  selectedFolder,
  onSelectFolder,
  view,
  q = '',
  picked,
  onRowClick,
  sort = 'id',
  folderSort = 'num',
  addFolderSignal,
  onAddRoot,
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
    if (addFolderSignal > 0) onAddRoot()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  /** 최상위 폴더 = 프로젝트. cat_id 로 찾아 아이콘·고객사 칩을 단다 */
  const prjQ = useQuery({
    queryKey: ['projects'],
    queryFn: ({ signal }) => projectApi.list(signal),
  })
  const prjByCat = useMemo(
    () => new Map((prjQ.data?.projects ?? []).map((p) => [p.cat_id, p])),
    [prjQ.data],
  )
  const cats = catQ.data?.categories ?? []
  const tree = useMemo(
    () => sortCategoryTree(buildCategoryTree(cats), folderSort),
    [cats, folderSort],
  )
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
    /*
     * 폴더 안의 차례.
     *
     * ID 순이 기본이다 — 요구사항은 번호로 부르는 일이 많고, 번호가
     * 이어져 있어야 빠진 것이 눈에 띈다. 제목순은 「무엇에 대한 것인지」
     * 로 훑을 때 쓴다.
     */
    for (const arr of m.values())
      arr.sort((a, b) =>
        sort === 'title'
          ? naturalCompare(a.title || '', b.title || '')
          : naturalCompare(reqLabel(a) || '', reqLabel(b) || ''),
      )
    return m
  }, [reqs, sort])

  const needle0 = q.trim().toLowerCase()

  /**
   * 지금 보이는 줄의 차례 — 폴더와 요구사항이 섞여 있다.
   *
   * Shift 범위가 **화면에 보이는 그대로** 잡히려면 접힌 가지를 건너뛰고
   * 눈에 든 것만 세야 한다.
   */
  const rowOrder = (): string[] => {
    const out: string[] = []
    const walk = (n: CategoryTreeNode) => {
      if (!openIds.has(n.id) && !needle0) return
      if (!foldersOnly)
        for (const r of byFolder.get(n.id) ?? []) out.push(`req:${reqPk(r)}`)
      n.children.forEach(walk)
    }
    tree.forEach(walk)
    if (!foldersOnly) for (const r of byFolder.get(null) ?? []) out.push(`req:${reqPk(r)}`)
    return out
  }

  const needle = q.trim().toLowerCase()
  const match = (r: Requirement) =>
    !needle ||
    reqLabel(r).toLowerCase().includes(needle) ||
    (r.title ?? '').toLowerCase().includes(needle)

  /** 폴더 이름이 걸리나 — 제 이름이든, 아래 어느 폴더든 */
  const fNeedle = folderQ.trim().toLowerCase()
  const folderHit = (n: CategoryTreeNode): boolean =>
    !fNeedle ||
    n.name.toLowerCase().includes(fNeedle) ||
    n.children.some(folderHit)

  const countDeep = (n: CategoryTreeNode): number =>
    (byFolder.get(n.id) ?? []).filter(match).length +
    n.children.reduce((a, k) => a + countDeep(k), 0)

  /**
   * 이 폴더 아래 요구사항 수와 그것들이 물고 있는 시험 수.
   *
   * 전에는 수가 하나뿐이라 「22」 가 요구사항인지 시험인지 알 수 없었다.
   * 커버리지를 볼 때 궁금한 것은 **둘의 비**다 — 요구사항 7건에 시험이
   * 0건이면 그 폴더는 아직 손도 안 댄 것이다.
   */
  const countDeep2 = (n: CategoryTreeNode): { req: number; tc: number } => {
    const mine = (byFolder.get(n.id) ?? []).filter(match)
    let req = mine.length
    let tc = mine.reduce((a, r) => a + tcsFor(r).length, 0)
    for (const k of n.children) {
      const c = countDeep2(k)
      req += c.req
      tc += c.tc
    }
    return { req, tc }
  }

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
      // 프로젝트는 트리 맨 위가 자리다 — 폴더 밑으로 들어가면 프로젝트
      // 층 자체가 무너진다. 서버도 같은 이유로 거절한다.
      if (target && prjByCat.has(id)) {
        setError('프로젝트는 트리 맨 위에만 둘 수 있습니다')
        return
      }
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

  const reqRow = (r: Requirement, depth: number) => {
    const pk = reqPk(r)
    const full = reqLabel(r)
    const tcn = tcsFor(r).length

    return (
      <div
        key={pk}
        role="button"
        tabIndex={0}
        className={`rt-req${pk === selected ? ' on' : ''}${
          // 담을 때 `req:` 를 붙였으니 볼 때도 붙여야 한다. 안 붙여서
          // 고르기는 되는데 칠해지지가 않았다.
          picked.has(`req:${pk}`) ? ' picked' : ''
        }${drag?.kind === 'req' && drag.id === pk ? ' dragging' : ''}`}
        // 폴더보다 한 단 더 — 아이콘이 폴더 아이콘과 같은 열에 서면
        // 어느 폴더에 담겼는지 안 읽힌다(피드백)
        style={{ paddingLeft: 8 + (depth + 1) * 14 }}
        // Ctrl·Shift 로 여러 개. 그냥 누르면 하나만 골라 연다.
        onClick={(e) => {
          if (justDragged.current) return
          onRowClick(`req:${pk}`, e, rowOrder())
          if (!e.ctrlKey && !e.metaKey && !e.shiftKey) onSelect(pk)
        }}
        onPointerDown={(e) => beginDrag(e, 'req', pk)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelect(pk)
          }
        }}
      >
        <span className="rt-dicon" aria-hidden="true">
          <IconReqDoc />
        </span>
        {/* ID·커버리지 점은 접었다(피드백 — 트리는 제목으로 읽는다).
            ID 는 툴팁에. 연결 TC 수만 폴더 배지와 같은 문법으로 오른쪽에. */}
        <span className="rt-title" title={full ? `${full} — ${r.title ?? ''}` : (r.title ?? '')}>
          {r.title || full || '(제목 없음)'}
        </span>
        <span className="rt-nums">
          <i title={`연결 TC ${tcn}건`}>T {tcn}</i>
        </span>
        <span className="rt-sp" />
      </div>
    )
  }

  const renderFolder = (n: CategoryTreeNode) => {
    // 폴더를 찾는 중이면 안 걸린 가지는 통째로 감춘다
    if (!folderHit(n)) return null
    const open = needle || fNeedle ? true : openIds.has(n.id)
    const mine = foldersOnly ? [] : (byFolder.get(n.id) ?? []).filter(match)
    const total = countDeep(n)
    const cnt = countDeep2(n)
    if (needle && total === 0 && !foldersOnly) return null
    const hasKids = n.children.length > 0 || mine.length > 0
    const prj = n.depth === 1 ? prjByCat.get(n.id) : undefined

    return (
      <div key={n.id}>
        <div
          data-folder={n.id}
          className={`rt-fold${selectedFolder === n.id ? ' on' : ''}${
            n.depth === 1 ? ' rt-top' : ''
          }${over === n.id && drag ? ' dropinto' : ''}${
            drag?.kind === 'cat' && drag.id === n.id ? ' dragging' : ''
          }${clip?.id === n.id ? ' copied' : ''}`}
          /* 몇 층인가. 아이콘 색을 이것으로 가른다 — 들여쓰기만으로는
             1차·2차·3차가 한눈에 안 갈린다. 특히 폭을 줄여 놓으면 들여쓴
             폭이 몇 픽셀이라 층이 뭉개진다. */
          data-depth={Math.min(n.depth, 4)}
          style={{ paddingLeft: 4 + (n.depth - 1) * 14 }}
          tabIndex={0}
          // 폴더를 누르면 그 아래 요구사항의 TC 를 오른쪽에 모아 보인다.
          // 폴더는 펼치는 것 말고 할 일이 없었는데, 실제로는 '이 묶음의
          // 시험이 다 됐나' 를 폴더 단위로 보는 일이 가장 잦다.
          // 폴더는 고르는 것이 아니라 **여는** 것이다. 골라 봐야 할 수 있는
          // 일이 요구사항과 달라서(지우면 안에 든 것이 미분류로 나간다),
          // 같은 자루에 담으면 「N건 선택됨」 이 무엇을 가리키는지 흐려진다.
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
            {prj ? <IconProject /> : <IconFolder open={open} />}
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
                // 키가 폴더 줄로 새면 안 된다 — 줄이 스페이스를 「고르기」 로
                // 가로채 preventDefault 해서 띄어쓰기가 안 먹었다
                e.stopPropagation()
                if (e.key === 'Enter' && renameText.trim())
                  renameM.mutate({ cat: n, name: renameText.trim() })
                if (e.key === 'Escape') setRenaming(null)
              }}
            />
          ) : (
            <b
              className="rt-fname"
              // 프로젝트면 고객사·모델·설명을 툴팁으로 — 칩으로 달았더니
              // 지저분하다는 피드백. 아이콘이 프로젝트임을 말하고,
              // 정보는 올려야 보인다.
              title={
                prj
                  ? [n.name, [prj.customer, prj.model].filter(Boolean).join(' · '), prj.description]
                      .filter(Boolean)
                      .join(' — ')
                  : n.name
              }
              // 두 번 누르면 이름 변경 — 탐색기와 같다
              onDoubleClick={(e) => {
                e.stopPropagation()
                startRename(n)
              }}
            >
              {n.name}
            </b>
          )}

          {/* 수는 **이름 바로 뒤**에(지시). 오른쪽 끝에 몰아 두었더니 이름과
              수 사이가 멀어 어느 줄의 수인지 눈으로 이어야 했다.
              **0 도 적는다** — 「아직 안 센 것」 과 「세어 보니 0」 은 다르다. */}
          <span className="rt-nums">
            <i title={`요구사항 ${cnt.req}건`}>R {cnt.req}</i>
            <i title={`시험 ${cnt.tc}건`}>T {cnt.tc}</i>
          </span>
          <span className="rt-sp" />
          {/* 끝의 ⋯ — 올려야 보이고, 누르면 우클릭과 같은 메뉴다(지시) */}
          <button
            type="button"
            className="rt-more"
            title="폴더 메뉴"
            aria-label="폴더 메뉴"
            onClick={(e) => {
              e.stopPropagation()
              const b = (e.currentTarget as HTMLElement).getBoundingClientRect()
              setCtx({ x: b.right - 4, y: b.bottom + 2, cat: n })
            }}
          >
            ⋯
          </button>
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

  const uncat = foldersOnly ? [] : (byFolder.get(null) ?? []).filter(match)

  return (
    <div
      className="rt"
      ref={treeRef}
      onPointerDown={() => {
        justDragged.current = false
      }}
    >
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
          <span className="rt-caret" />
          <b className="rt-fname">미분류</b>
          <span className="rt-cnt">{uncat.length || ''}</span>
        </div>
        {uncat.map((r) => reqRow(r, 1))}

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
                  onAddRoot()
                }}
              >
                새 프로젝트
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
