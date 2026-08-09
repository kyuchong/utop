import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, categoryApi, tcApi } from '@/api/client'
import { IconChevron, IconFolder } from '@/components/icons'
import {
  buildCategoryTree,
  reqLabel,
  reqPk,
  statusClass,
  type CategoryTreeNode,
  type Requirement,
} from '@/types'
import './ReqMapDialog.css'

interface Props {
  /** 처음 열 요구사항 (표에서 Map 을 누른 줄) */
  req: Requirement
  onClose: () => void
}

/**
 * 요구사항 ↔ 시험 연결 창.
 *
 *   [1열 요구사항 폴더] [2열 그 폴더의 요구사항] [3열 붙일 시험 — 추가 여부]
 *
 * 왼쪽에서 폴더를 열고, 가운데에서 요구사항을 고르고, 오른쪽에서 그 요구사항에
 * 붙일 시험을 체크한다. 창을 닫지 않고 요구사항을 옮겨 다니며 계속 붙일 수
 * 있어야 한다 — 한 건 붙일 때마다 창을 다시 여는 것이 제일 성가시다.
 *
 * 연결의 실체는 `tc.req_id` 한 칸이다. 체크하면 이 요구사항으로 채우고,
 * 풀면 비운다. 그래서 「이미 남의 요구사항에 붙은 것」 을 가져오면 그쪽은
 * 끊긴다 — 그 사실을 행에 적어 둔다.
 */
export default function ReqMapDialog({ req, onClose }: Props) {
  const qc = useQueryClient()
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())
  const [folder, setFolder] = useState<string | null>(null)
  /** 지금 붙이는 대상 요구사항(PK) */
  const [curPk, setCurPk] = useState(reqPk(req))
  const [q, setQ] = useState('')
  const [onlyFree, setOnlyFree] = useState(false)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')

  const reqQ = useQuery({
    queryKey: ['req', 'list'],
    queryFn: ({ signal }) => api.listRequirements(signal),
  })
  const tcQ = useQuery({
    queryKey: ['tc', 'list', 'meta'],
    queryFn: ({ signal }) => api.listTestCases(signal),
  })
  const catQ = useQuery({
    queryKey: ['req-categories'],
    queryFn: ({ signal }) => categoryApi.list(signal),
  })

  const allReqs = reqQ.data?.reqs ?? []
  const tcs = tcQ.data?.tcs ?? []
  const cats = useMemo(() => catQ.data?.categories ?? [], [catQ.data])
  const tree = useMemo(() => buildCategoryTree(cats), [cats])

  /** 처음 열 때, 누른 요구사항이 든 폴더를 펴 둔다 */
  useEffect(() => {
    const chain = [req.cat1, req.cat2, req.cat3, req.cat4].filter(Boolean) as string[]
    if (!chain.length) return
    setOpenIds(new Set(chain))
    setFolder(chain[chain.length - 1] ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cur = allReqs.find((r) => reqPk(r) === curPk) ?? req

  /** 이 폴더(하위 포함)의 요구사항 — 요구사항이 조상 사슬을 들고 있다 */
  const folderReqs = useMemo(() => {
    if (folder === null) return allReqs
    return allReqs.filter(
      (r) => r.cat1 === folder || r.cat2 === folder || r.cat3 === folder || r.cat4 === folder,
    )
  }, [allReqs, folder])

  /** 이 요구사항에 이미 붙은 TC id */
  const linkedIds = useMemo(() => {
    const s = new Set<string>()
    for (const t of tcs) if ((t.req_id || '') === curPk) s.add(t.tcid)
    const label = reqLabel(cur)
    if (label) for (const t of tcs) if ((t.req_id || '') === label) s.add(t.tcid)
    for (const ref of cur.tc ?? []) if (ref?.tcid) s.add(ref.tcid)
    return s
  }, [tcs, curPk, cur])

  /** 요구사항 PK/라벨 → 제목 (어느 요구사항 것인지 적으려고) */
  const ownerName = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of allReqs) {
      const nm = r.title || reqLabel(r) || ''
      m.set(reqPk(r), nm)
      const l = reqLabel(r)
      if (l) m.set(l, nm)
    }
    return m
  }, [allReqs])

  const shownTcs = useMemo(() => {
    const n = q.trim().toLowerCase()
    return tcs.filter((t) => {
      if (onlyFree && (t.req_id || '') && !linkedIds.has(t.tcid)) return false
      if (!n) return true
      return t.tcid.toLowerCase().includes(n) || (t.name ?? '').toLowerCase().includes(n)
    })
  }, [tcs, q, onlyFree, linkedIds])

  /**
   * 고른 것(아직 서버에 안 보낸 상태).
   *
   * 체크는 「이렇게 하겠다」 는 표시일 뿐이고, 실제로 붙고 떼는 것은 아래
   * 단추를 눌러야 일어난다. 체크할 때마다 저장하면 잘못 누른 것을 되돌릴
   * 틈이 없고, 무엇이 바뀌는지 한눈에 못 본다.
   */
  const [draft, setDraft] = useState<Set<string>>(new Set())
  // 대상 요구사항이 바뀌면 그 요구사항의 현재 상태로 초기화한다
  useEffect(() => {
    setDraft(new Set(linkedIds))
    setMsg('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curPk, tcQ.data])

  /** 지금 체크 상태와 실제 상태의 차이 — 이것이 「적용」 이 할 일이다 */
  const toAdd = useMemo(
    () => [...draft].filter((id) => !linkedIds.has(id)),
    [draft, linkedIds],
  )
  const toDrop = useMemo(
    () => [...linkedIds].filter((id) => !draft.has(id)),
    [draft, linkedIds],
  )
  const dirty = toAdd.length + toDrop.length

  /** 모아 둔 차이를 한 번에 적용한다 — tc.req_id 한 칸을 바꾼다 */
  const applyM = useMutation({
    mutationFn: async () => {
      const byId = new Map(tcs.map((t) => [t.tcid, t]))
      const write = async (tcid: string, reqId: string) => {
        const t = byId.get(tcid)
        if (!t) return
        await tcApi.save(tcid, {
          tcid,
          name: t.name ?? '',
          type: t.type ?? '',
          status: t.status ?? '',
          severity: t.severity ?? '',
          req_id: reqId,
        })
      }
      for (const id of toAdd) await write(id, curPk)
      for (const id of toDrop) await write(id, '')
      return { added: toAdd.length, dropped: toDrop.length }
    },
    onSuccess: (r) => {
      setMsg(`붙임 ${r.added} · 뗌 ${r.dropped}`)
      void qc.invalidateQueries({ queryKey: ['tc', 'list', 'meta'] })
      void qc.invalidateQueries({ queryKey: ['req', 'list'] })
    },
    onError: (e) => setMsg(e instanceof Error ? e.message : String(e)),
    onSettled: () => setBusy(''),
  })

  const toggleFolder = (id: string) =>
    setOpenIds((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const renderFolder = (n: CategoryTreeNode): React.ReactNode => {
    const open = openIds.has(n.id)
    const kids = n.children ?? []
    return (
      <div key={n.id}>
        <div
          className={`rmd-fold${folder === n.id ? ' on' : ''}${n.depth === 1 ? ' top' : ''}`}
          style={{ paddingLeft: 4 + (n.depth - 1) * 14 }}
          role="button"
          tabIndex={0}
          onClick={() => setFolder(n.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setFolder(n.id)
            }
          }}
        >
          <button
            type="button"
            className={`rmd-caret${open ? ' open' : ''}`}
            disabled={!kids.length}
            aria-label={open ? '접기' : '펼치기'}
            onClick={(e) => {
              e.stopPropagation()
              toggleFolder(n.id)
            }}
          >
            {kids.length ? <IconChevron /> : <span className="rmd-dot" />}
          </button>
          <span className="rmd-ficon" aria-hidden="true">
            <IconFolder open={open} />
          </span>
          <span className="rmd-fname">{n.name}</span>
        </div>
        {open && kids.map(renderFolder)}
      </div>
    )
  }

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div
        className="modal rmd"
        role="dialog"
        aria-modal="true"
        aria-label="요구사항에 시험 연결"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <b>시험 연결 (Map Testcases)</b>
          <span className="muted small">{cur.title || reqLabel(cur)}</span>
          <span className="sp" />
          {msg && <span className="muted small ok">{msg}</span>}
          <button className="modal-x" type="button" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="rmd-cols">
          {/* 1열 — 요구사항 폴더 */}
          <div className="rmd-col rmd-tree">
            <div className="rmd-ch">요구사항 폴더</div>
            <div className="rmd-body">
              <div
                className={`rmd-fold${folder === null ? ' on' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => setFolder(null)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setFolder(null)}
              >
                <span className="rmd-caret" />
                <span className="rmd-fname">전체</span>
              </div>
              {tree.map(renderFolder)}
            </div>
          </div>

          {/* 2열 — 그 폴더의 요구사항. 고르면 3열이 그 요구사항 것으로 바뀐다 */}
          <div className="rmd-col rmd-reqs">
            <div className="rmd-ch">요구사항 {folderReqs.length}</div>
            <div className="rmd-body">
              {folderReqs.length === 0 ? (
                <div className="empty">이 폴더에 요구사항이 없습니다.</div>
              ) : (
                folderReqs.map((r) => {
                  const pk = reqPk(r)
                  const n = tcs.filter((t) => (t.req_id || '') === pk).length
                  return (
                    <button
                      key={pk}
                      type="button"
                      className={`rmd-req${pk === curPk ? ' on' : ''}`}
                      onClick={() => setCurPk(pk)}
                    >
                      <span className="rmd-rid">{reqLabel(r) || '–'}</span>
                      <span className="rmd-rt">{r.title || '(제목 없음)'}</span>
                      <span className={`rmd-rn${n ? ' has' : ''}`}>{n || ''}</span>
                    </button>
                  )
                })
              )}
            </div>
          </div>

          {/* 3열 — 붙일 시험. 체크가 곧 추가 여부다 */}
          <div className="rmd-col rmd-tcs">
            <div className="rmd-ch">
              <span>시험 · 붙은 것 {linkedIds.size}</span>
              <span className="sp" />
              <label className="rmd-only">
                <input
                  type="checkbox"
                  checked={onlyFree}
                  onChange={(e) => setOnlyFree(e.target.checked)}
                />
                안 붙은 것만
              </label>
            </div>
            <div className="rmd-find">
              <input
                placeholder="시험 이름 · ID 로 찾기"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div className="rmd-body">
              {shownTcs.length === 0 ? (
                <div className="empty">해당하는 시험이 없습니다.</div>
              ) : (
                shownTcs.map((t) => {
                  const on = draft.has(t.tcid)
                  const was = linkedIds.has(t.tcid)
                  const owner = !was && t.req_id ? ownerName.get(t.req_id) : ''
                  return (
                    <label
                      key={t.tcid}
                      className={`rmd-tc${on ? ' on' : ''}${
                        on && !was ? ' add' : !on && was ? ' drop' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) =>
                          setDraft((s) => {
                            const n = new Set(s)
                            if (e.target.checked) n.add(t.tcid)
                            else n.delete(t.tcid)
                            return n
                          })
                        }
                      />
                      <span className="rmd-tn">{t.name || '(제목 없음)'}</span>
                      {on && !was && <span className="rmd-mark add">추가</span>}
                      {!on && was && <span className="rmd-mark drop">해제</span>}
                      {owner && (
                        <span className="rmd-own" title="가져오면 이쪽 연결이 끊깁니다">
                          {owner}
                        </span>
                      )}
                      <span className={`rmd-st ${statusClass(t.status)}`}>
                        ● {t.status || '미실행'}
                      </span>
                    </label>
                  )
                })
              )}
            </div>
          </div>
        </div>

        <div className="modal-foot rmd-foot">
          {dirty ? (
            <span className="rmd-diff">
              {toAdd.length > 0 && <b className="add">추가 {toAdd.length}</b>}
              {toDrop.length > 0 && <b className="drop">해제 {toDrop.length}</b>}
            </span>
          ) : (
            <span className="muted small">체크해서 고른 뒤 「적용」 을 누르세요.</span>
          )}
          <span className="sp" />
          <button
            className="btn"
            type="button"
            disabled={!dirty || !!busy}
            onClick={() => setDraft(new Set(linkedIds))}
          >
            되돌리기
          </button>
          <button
            className="btn primary"
            type="button"
            disabled={!dirty || !!busy}
            onClick={() => {
              setBusy('apply')
              setMsg('')
              applyM.mutate()
            }}
          >
            {busy === 'apply' ? '적용 중…' : `적용${dirty ? ` (${dirty})` : ''}`}
          </button>
          <button className="btn" type="button" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}
