import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
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
import { IconChevron } from '../icons'
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
export default function TcTree({ tcs, openId, onOpen, paramKey, onOpenParam }: Props) {
  const [q, setQ] = useState('')
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

  const reqsOf = (folderId: string | null) =>
    (byFolder.get(folderId) ?? []).filter((r) => shownTcs(r).length > 0)

  const countDeep = (n: CategoryTreeNode): number =>
    reqsOf(n.id).reduce((a, r) => a + shownTcs(r).length, 0) +
    n.children.reduce((a, k) => a + countDeep(k), 0)

  const toggle = (id: string) =>
    setOpenIds((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  /** 검색 중에는 전부 펼친다 — 접힌 가지 안에 있으면 찾은 보람이 없다 */
  const isOpen = (id: string) => (needle ? true : openIds.has(id))

  const tcRow = (t: TestCaseMeta, depth: number) => (
    <button
      key={t.tcid}
      type="button"
      className={`tt-tc${openId === t.tcid ? ' on' : ''}`}
      style={{ paddingLeft: 10 + depth * 14 }}
      onClick={() => onOpen(t.tcid)}
      title={t.tcid}
    >
      <span className={`tc-dot ${statusClass(t.status)}`} />
      <span className="tt-tc-nm">{t.name || '(제목 없음)'}</span>
      {typeof t._cli_count === 'number' && t._cli_count > 0 && (
        <span className="tt-n">{t._cli_count}</span>
      )}
    </button>
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
    // TC 가 하나도 없는 가지는 접어두는 게 아니라 아예 안 보인다. 이 화면은
    // TC 를 고르는 자리라, 빈 폴더는 고를 것이 없는 줄일 뿐이다.
    if (total === 0) return null
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

  /** 파일 목록. 공통이 늘 맨 위고, 없어도 자리는 있다 */
  const paramFiles = (() => {
    const d = gpQ.data ?? {}
    const rest = Object.keys(d)
      .filter((k) => k !== '__global__' && k !== '__gp_folders__')
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
      <div className="rt-search">
        <input
          value={q}
          placeholder="TC · 요구사항 검색"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setQ('')}
        />
      </div>

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
          </div>
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
