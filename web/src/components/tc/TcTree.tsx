import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiFetch, categoryApi } from '@/api/client'
import {
  buildCategoryTree,
  naturalCompare,
  reqLabel,
  reqPk,
  shortReqId,
  statusClass,
  type CategoryTreeNode,
  type Requirement,
  type TestCaseMeta,
} from '@/types'
import { IconChevron, IconFolder, IconReqDoc, IconTcDoc } from '../icons'
// 요구사항 화면과 **같은 트리로 보여야 한다**. 줄 높이·글자·구분선을 여기서
// 다시 정하면 두 화면을 오가며 같은 것이 달라 보인다. 그 화면의 규칙을
// 그대로 가져다 쓰고, TC 줄만 이 화면 CSS 에서 더한다.
import '../ReqTree.css'

interface Props {
  tcs: TestCaseMeta[]
  /** 지금 열려 있는 TC */
  openId: string
  onOpen: (tcid: string) => void
  /** 지금 열려 있는 파라미터 파일 (`__global__` 또는 모델명) */
  paramKey: string
  onOpenParam: (key: string) => void
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
  onOpen,
  paramKey,
  onOpenParam,
  picked,
  q = '',
  onPickClick,
}: Props) {
  const qc = useQueryClient()
  /** 파라미터 파일 새로 만들기 — 이름을 적는 중인가 */
  const [newParam, setNewParam] = useState<string | null>(null)
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

  /**
   * 전역 파라미터 파일 목록.
   *
   * iTest 가 `parameter_files/` 를 탐색기 폴더로 두는 것과 같다. 설정 안에
   * 넣어 두면 스텝을 쓰다가 값을 하나 고치려고 화면을 떠나야 한다.
   */
  const gpQ = useQuery({
    queryKey: ['global-params'],
    queryFn: async () => {
      const r = await apiFetch('/api/global-params')
      if (!r.ok) throw new Error('전역 파라미터를 불러오지 못했습니다')
      return (await r.json()) as Record<string, unknown>
    },
    staleTime: 60_000,
  })

  /**
   * 등록된 장비의 모델.
   *
   * 파일 이름을 손으로만 치게 두면 오타 난 이름이 생기고, 그 파일은 어느
   * TC 에도 안 붙는다 — 파일 이름이 곧 모델명이라 한 글자만 틀려도 못 만난다.
   * 고를 수 있게 해 둔다.
   */
  const devQ = useQuery({
    queryKey: ['devices2'],
    queryFn: async () => {
      const r = await apiFetch('/api/devices2')
      if (!r.ok) throw new Error('장비를 불러오지 못했습니다')
      return (await r.json()) as { devices?: Array<{ model?: string | null }> }
    },
    staleTime: 60_000,
  })

  const addParamM = useMutation({
    mutationFn: async (name: string) => {
      const cur = (gpQ.data ?? {}) as Record<string, unknown>
      if (cur[name] !== undefined) return name
      const r = await apiFetch('/api/global-params', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...cur, [name]: [] }),
      })
      if (!r.ok) throw new Error('만들지 못했습니다')
      return name
    },
    onSuccess: (name) => {
      setNewParam(null)
      void qc.invalidateQueries({ queryKey: ['global-params'] })
      onOpenParam(name)
    },
  })

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

  const toggle = (id: string) =>
    setOpenIds((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  /** 검색 중에는 전부 펼친다 — 접힌 가지 안에 있으면 찾은 보람이 없다 */
  const isOpen = (id: string) => (needle ? true : openIds.has(id))

  /**
   * 지금 화면에 보이는 TC 차례.
   *
   * Shift 범위는 **눈에 보이는 순서**로 잡혀야 한다. 접힌 가지 안의 것을
   * 세면 「여기부터 저기까지」 가 화면과 달라진다.
   */
  const shownOrder = (() => {
    const out: string[] = []
    const walk = (n: CategoryTreeNode) => {
      if (!isOpen(n.id)) return
      for (const r of reqsOf(n.id)) {
        if (!isOpen(reqPk(r))) continue
        for (const x of shownTcs(r)) out.push(x.tcid)
      }
      n.children.forEach(walk)
    }
    tree.forEach(walk)
    for (const r of reqsOf(null)) {
      if (!isOpen(reqPk(r))) continue
      for (const x of shownTcs(r)) out.push(x.tcid)
    }
    return out
  })()



  /*
   * TC 줄.
   *
   * 네모는 단추 **밖**에 둔다. 단추 안에 넣으면 네모를 누를 때 TC 가 같이
   * 열려서, 열두 건을 고르는 동안 화면이 열두 번 바뀐다.
   */
  const tcRow = (t: TestCaseMeta, depth: number) => (
    <div className="tt-row" key={t.tcid} style={{ paddingLeft: 10 + depth * 14 }}>
      <button
        type="button"
        className={`tt-tc${openId === t.tcid ? ' on' : ''}${picked.has(t.tcid) ? ' picked' : ''}`}
        // Ctrl·Shift 로 여러 개. 파일 탐색기·iTest 와 같은 규칙이라
        // 손이 이미 아는 방식이다.
        onClick={(e) => {
          onPickClick(t.tcid, e, shownOrder)
          if (!e.ctrlKey && !e.metaKey && !e.shiftKey) onOpen(t.tcid)
        }}
        title={t.tcid}
      >
        {/* 요구사항 줄과 갈리게. 둘 다 그냥 글자였다 */}
        <span className="rt-dicon" aria-hidden="true">
          <IconTcDoc />
        </span>
        <span className={`tc-dot ${statusClass(t.status)}`} />
        <span className="tt-tc-nm">{t.name || '(제목 없음)'}</span>
        {typeof t._cli_count === 'number' && t._cli_count > 0 && (
          <span className="tt-n">{t._cli_count}</span>
        )}
      </button>
    </div>
  )

  const reqRow = (r: Requirement, depth: number, folderName: string | null) => {
    const pk = reqPk(r)
    const mine = shownTcs(r)
    const open = isOpen(pk)
    const full = reqLabel(r)
    return (
      <div key={pk}>
        <div
          className="rt-req tt-req"
          role="button"
          tabIndex={0}
          style={{ paddingLeft: 4 + depth * 14 }}
          onClick={() => toggle(pk)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              toggle(pk)
            }
          }}
        >
          <span className={`rt-caret${open ? ' open' : ''}`}>
            {mine.length > 0 ? <IconChevron /> : <span className="rt-dot" />}
          </span>
          {/* TC 가 없는 요구사항에도 자리를 지킨다. 안 그리면 뒤 칸이
              한 칸씩 밀려서 제목과 숫자가 엉뚱한 데로 간다. */}
          <span className="rt-dicon" aria-hidden="true">
            <IconReqDoc />
          </span>
          <span className="rt-id" title={full}>
            {shortReqId(full, folderName) || '(ID 없음)'}
          </span>
          <span className="rt-title" title={r.title ?? ''}>
            {r.title || '(제목 없음)'}
          </span>
          <span className="rt-cnt">{mine.length || ''}</span>
        </div>
        {open && mine.map((t) => tcRow(t, depth + 1))}
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
          className="rt-fold"
          role="button"
          tabIndex={0}
          style={{ paddingLeft: 4 + (n.depth - 1) * 14 }}
          onClick={() => toggle(n.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              toggle(n.id)
            }
          }}
        >
          <span className={`rt-caret${open ? ' open' : ''}`}>
            <IconChevron />
          </span>
          {/* 요구사항 화면과 같은 폴더 표시 */}
          <span className="rt-ficon" aria-hidden="true">
            <IconFolder open={open} />
          </span>
          <b className="rt-fname" title={n.name}>
            {n.name}
          </b>
          <span className="rt-cnt">{total}</span>
        </div>
        {open && (
          <>
            {n.children.map(renderFolder)}
            {mine.map((r) => reqRow(r, n.depth, n.name))}
          </>
        )}
      </div>
    )
  }

  /** 아직 파일이 없는 장비 모델 — 고를 수 있게 */
  const models = (() => {
    const d = (gpQ.data ?? {}) as Record<string, unknown>
    const s = new Set<string>()
    for (const x of devQ.data?.devices ?? []) if (x.model && d[x.model] === undefined) s.add(x.model)
    return [...s].sort()
  })()

  /** 파일 목록. 공통이 늘 맨 위고, 없어도 자리는 있다 */
  const paramFiles = (() => {
    const d = gpQ.data ?? {}
    const rest = Object.keys(d)
      .filter((k) => k !== '__global__' && k !== '__gp_folders__' && k !== '__includes__')
      .sort()
    return ['__global__', ...rest]
  })()

  const paramCount = (k: string) => {
    const v = (gpQ.data ?? {})[k]
    return Array.isArray(v) ? v.filter((r) => (r as { name?: string })?.name).length || '' : ''
  }

  const uncat = reqsOf(null)
  const orphanShown = orphans.filter(tcMatch)
  const loading = reqQ.isLoading || catQ.isLoading

  return (
    <div className="rt tt">
      <div className="rt-body">
        {/* 고정 폴더. 지우거나 옮길 수 없고 늘 맨 위다 — 시스템 폴더지
            사람이 만든 분류가 아니다. 요구사항 트리와 선으로 가른다. */}
        <div className="tt-fixed">
          <div
            className="rt-fold"
            role="button"
            tabIndex={0}
            onClick={() => toggle('__params__')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                toggle('__params__')
              }
            }}
          >
            <span className={`rt-caret${isOpen('__params__') ? ' open' : ''}`}>
              <IconChevron />
            </span>
            <b className="rt-fname">Global Parameter</b>
            <span className="rt-cnt">{paramFiles.length}</span>
            {/* 새 파일. 폴더 줄에 둬야 '여기 아래에 만든다' 가 읽힌다 */}
            <button
              type="button"
              className="tt-add"
              title="파라미터 파일 만들기"
              onClick={(e) => {
                e.stopPropagation()
                setOpenIds((s) => new Set(s).add('__params__'))
                setNewParam('')
              }}
            >
              ＋
            </button>
          </div>

          {newParam !== null && (
            <div className="rt-add" style={{ paddingLeft: 22 }}>
              {/* 모델명을 고르거나 직접 친다. datalist 라 둘 다 된다 */}
              <input
                autoFocus
                list="tt-models"
                value={newParam}
                placeholder="모델명 (예: E4320-24TX)"
                onChange={(e) => setNewParam(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newParam.trim()) addParamM.mutate(newParam.trim())
                  if (e.key === 'Escape') setNewParam(null)
                }}
              />
              <datalist id="tt-models">
                {models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              <button
                className="btn small primary"
                type="button"
                disabled={!newParam.trim() || addParamM.isPending}
                onClick={() => newParam.trim() && addParamM.mutate(newParam.trim())}
              >
                만들기
              </button>
              <button className="btn small" type="button" onClick={() => setNewParam(null)}>
                취소
              </button>
            </div>
          )}
          {isOpen('__params__') &&
            paramFiles.map((k) => (
              <button
                key={k}
                type="button"
                className={`tt-tc tt-param${paramKey === k ? ' on' : ''}`}
                style={{ paddingLeft: 24 }}
                onClick={() => onOpenParam(k)}
              >
                <span className="tt-tc-nm">{k === '__global__' ? '공통' : k}</span>
                <span className="tt-n">{paramCount(k)}</span>
              </button>
            ))}
        </div>

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
                {uncat.map((r) => reqRow(r, 1, null))}
              </>
            )}

            {/* 요구사항에 안 걸린 TC. 트리에만 두면 이것들이 사라져서
                '분명히 만들었는데 목록에 없다' 가 된다. */}
            {orphanShown.length > 0 && (
              <>
                <div className="rt-fold rt-uncat">
                  <span className="rt-caret" />
                  <b className="rt-fname">요구사항 없음</b>
                  <span className="rt-cnt">{orphanShown.length}</span>
                </div>
                {orphanShown.map((t) => tcRow(t, 1))}
              </>
            )}

            {tree.length === 0 && uncat.length === 0 && orphanShown.length === 0 && (
              <div className="empty">
                {needle ? '조건에 맞는 TC 가 없습니다.' : '아직 TC 가 없습니다.'}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
