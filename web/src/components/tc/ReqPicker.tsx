import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, categoryApi } from '@/api/client'
import {
  buildCategoryTree,
  reqLabel,
  reqPk,
  type CategoryTreeNode,
  type Requirement,
} from '@/types'

interface Props {
  /** 지금 걸려 있는 요구사항 PK. null 이면 전체 */
  selected: string | null
  onPick: (reqPk: string | null) => void
  onClose: () => void
}

/**
 * 요구사항 고르기 팝업.
 *
 * TC 화면 왼쪽에 요구사항 트리를 늘 띄워두지 않는 이유: 스텝을 쓰는 동안은
 * 트리를 쓸 일이 없는데 폭만 먹는다. 요구사항은 TC 를 찾을 때 한 번 고르는
 * 것이라 그때만 띄운다.
 *
 * 분류 트리와 요구사항을 함께 보여준다 — 요구사항이 29건이라 평면 목록으로도
 * 되지만, 분류로 좁히는 것이 사람이 실제로 찾는 방식이다.
 */
export default function ReqPicker({ selected, onPick, onClose }: Props) {
  const [q, setQ] = useState('')

  const reqQ = useQuery({
    queryKey: ['req', 'list'],
    queryFn: ({ signal }) => api.listRequirements(signal),
  })
  const catQ = useQuery({
    queryKey: ['req-categories'],
    queryFn: ({ signal }) => categoryApi.list(signal),
  })
  const tcQ = useQuery({
    queryKey: ['tc', 'list', 'meta'],
    queryFn: ({ signal }) => api.listTestCases(signal),
  })

  const reqs = reqQ.data?.reqs ?? []
  const tcs = tcQ.data?.tcs ?? []

  /** 요구사항 PK/이름표 양쪽으로 TC 를 센다 — 자료마다 어느 쪽이 들었는지 다르다 */
  const tcCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of tcs) {
      const k = (t.req_id || '').trim()
      if (!k) continue
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return (r: Requirement) => (m.get(reqPk(r)) ?? 0) + (m.get(reqLabel(r)) ?? 0)
  }, [tcs])

  const tree = useMemo(() => buildCategoryTree(catQ.data?.categories ?? []), [catQ.data])

  const needle = q.trim().toLowerCase()
  const match = (r: Requirement) =>
    !needle ||
    reqLabel(r).toLowerCase().includes(needle) ||
    (r.title ?? '').toLowerCase().includes(needle)

  /** 이 분류(자손 포함)에 달린 요구사항 */
  const reqsOf = (catId: string) =>
    reqs.filter(
      (r) => r.cat1 === catId || r.cat2 === catId || r.cat3 === catId || r.cat4 === catId,
    ).filter(match)

  const renderCat = (n: CategoryTreeNode) => {
    const mine = reqsOf(n.id)
    const kids = n.children.map(renderCat).filter(Boolean)
    // 검색 중에 걸리는 것이 없는 가지는 통째로 감춘다
    if (needle && mine.length === 0 && kids.length === 0) return null
    return (
      <div key={n.id} className="rp-cat">
        <div className="rp-cat-nm" style={{ paddingLeft: (n.depth - 1) * 12 }}>
          {n.name}
        </div>
        {mine.map((r) => (
          <button
            key={reqPk(r)}
            type="button"
            className={`rp-req${selected === reqPk(r) ? ' on' : ''}`}
            style={{ paddingLeft: 12 + (n.depth - 1) * 12 }}
            onClick={() => {
              onPick(reqPk(r))
              onClose()
            }}
          >
            <b>{reqLabel(r) || '(ID 없음)'}</b>
            <span className="rp-t">{r.title}</span>
            <span className="rp-n">TC {tcCount(r)}</span>
          </button>
        ))}
        {kids}
      </div>
    )
  }

  /** 분류가 안 붙은 것 */
  const uncat = reqs.filter((r) => !r.cat1 && !r.cat2 && !r.cat3 && !r.cat4).filter(match)

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div
        className="modal rp"
        role="dialog"
        aria-modal="true"
        aria-label="요구사항 고르기"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <b>요구사항 고르기</b>
          <button className="modal-x" type="button" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <div className="rp-top">
          <input
            autoFocus
            placeholder="REQ ID · 제목 검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button
            className={`btn${selected === null ? ' primary' : ''}`}
            type="button"
            onClick={() => {
              onPick(null)
              onClose()
            }}
          >
            전체 TC
          </button>
        </div>

        <div className="rp-body">
          {reqQ.isLoading ? (
            <div className="empty">불러오는 중…</div>
          ) : (
            <>
              {tree.map(renderCat)}
              {uncat.length > 0 && (
                <div className="rp-cat">
                  <div className="rp-cat-nm">미분류</div>
                  {uncat.map((r) => (
                    <button
                      key={reqPk(r)}
                      type="button"
                      className={`rp-req${selected === reqPk(r) ? ' on' : ''}`}
                      style={{ paddingLeft: 12 }}
                      onClick={() => {
                        onPick(reqPk(r))
                        onClose()
                      }}
                    >
                      <b>{reqLabel(r) || '(ID 없음)'}</b>
                      <span className="rp-t">{r.title}</span>
                      <span className="rp-n">TC {tcCount(r)}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
