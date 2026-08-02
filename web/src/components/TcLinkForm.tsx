import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, categoryApi, tcApi } from '@/api/client'
import {
  reqLabel,
  reqPk,
  statusClass,
  UNCATEGORIZED,
  type Requirement,
  type TestCaseMeta,
} from '@/types'
import './ReqForm.css'

interface Props {
  /** 연결 대상 요구사항 */
  req: Requirement
  /** 이미 이 요구사항에 붙어 있는 TC */
  linked: TestCaseMeta[]
  onClose: () => void
}

/** 왼쪽 목록에서 고를 수 있는 것. 분류 id 이거나 아래 특수값 하나. */
const ALL = '__all__'
const UNLINKED = '__unlinked__'

/**
 * 기존 TC 를 요구사항에 붙이거나 뗀다.
 *
 * 「+ TC 생성」이 새 TC 를 만드는 것이라면, 여기는 이미 있는 TC 를 고르는
 * 자리다. 같은 시험을 여러 요구사항에서 재활용하는 일이 흔해서 둘 다 필요하다.
 *
 * 화면을 두 열로 나눈다. TC 가 수백 건이 되면 한 줄짜리 검색만으로는
 * 찾을 수 없다. 왼쪽에서 '어디에 있는 TC 인가' 로 좁히고 오른쪽에서 고른다:
 *  · 미연결      — 아직 어느 요구사항에도 안 붙은 TC. 대개 여기서 찾는다
 *  · 분류        — 그 분류의 요구사항에 붙어 있는 TC
 *  · 미분류      — 붙어는 있는데 그 요구사항이 분류가 없는 것
 *
 * 연결의 실체는 tc.req_id 한 칸이다. 그래서 "붙이기 = req_id 를 이 요구사항으로",
 * "떼기 = req_id 를 비움" 이다.
 */
export default function TcLinkForm({ req, linked, onClose }: Props) {
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  // 처음에 '미연결' 을 보여준다 — 연결하러 들어온 사람이 가장 먼저 볼 것이다
  const [bucket, setBucket] = useState<string>(UNLINKED)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')

  const tcQ = useQuery({
    queryKey: ['tc', 'list', 'meta'],
    queryFn: ({ signal }) => api.listTestCases(signal),
  })
  const reqQ = useQuery({
    queryKey: ['req', 'list'],
    queryFn: ({ signal }) => api.listRequirements(signal),
  })
  const catQ = useQuery({
    queryKey: ['req-categories'],
    queryFn: ({ signal }) => categoryApi.list(signal),
  })

  const tcs = tcQ.data?.tcs ?? []
  const reqs = reqQ.data?.reqs ?? []
  const cats = catQ.data?.categories ?? []
  const myPk = reqPk(req)
  const linkedIds = useMemo(() => new Set(linked.map((t) => t.tcid)), [linked])

  /** 요구사항 키(pk·label 양쪽) → 그 요구사항 */
  const reqByKey = useMemo(() => {
    const m = new Map<string, Requirement>()
    for (const r of reqs) {
      m.set(reqPk(r), r)
      const l = reqLabel(r)
      if (l) m.set(l, r)
    }
    return m
  }, [reqs])

  /**
   * TC 하나가 어느 칸에 속하는가.
   * 분류는 대·중·소·4단 중 어느 것이든 맞으면 그 분류로 본다.
   */
  const bucketsOf = (t: TestCaseMeta): string[] => {
    const key = (t.req_id || '').trim()
    if (!key) return [UNLINKED]
    const owner = reqByKey.get(key)
    if (!owner) return [UNLINKED] // 끊어진 연결도 사실상 미연결이다
    const ids = [owner.cat1, owner.cat2, owner.cat3, owner.cat4].filter(Boolean) as string[]
    return ids.length > 0 ? ids : [UNCATEGORIZED]
  }

  /** 왼쪽 목록에 붙일 건수 */
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of tcs) {
      for (const b of bucketsOf(t)) m.set(b, (m.get(b) ?? 0) + 1)
    }
    m.set(ALL, tcs.length)
    return m
  }, [tcs, reqByKey])

  /** 이름 있는 분류만, 건수 있는 것 먼저 */
  const catRows = useMemo(
    () =>
      cats
        .map((c) => ({ id: c.id, name: c.name, n: counts.get(c.id) ?? 0 }))
        .filter((c) => c.n > 0)
        .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)),
    [cats, counts],
  )

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return tcs.filter((t) => {
      if (bucket !== ALL && !bucketsOf(t).includes(bucket)) return false
      if (!needle) return true
      return (
        t.tcid.toLowerCase().includes(needle) ||
        (t.name ?? '').toLowerCase().includes(needle) ||
        (t.type ?? '').toLowerCase().includes(needle)
      )
    })
  }, [tcs, q, bucket, reqByKey])

  const toggle = (tcid: string) =>
    setPicked((s) => {
      const n = new Set(s)
      if (n.has(tcid)) n.delete(tcid)
      else n.add(tcid)
      return n
    })

  const saveM = useMutation({
    mutationFn: async (mode: 'link' | 'unlink') => {
      // 순차 저장. TC 저장은 스텝 보존 로직 때문에 서버가 이전 값을 읽으므로
      // 같은 대상에 동시에 던지지 않는 편이 안전하다.
      for (const tcid of picked) {
        const cur = tcs.find((t) => t.tcid === tcid)
        if (!cur) continue
        await tcApi.save(tcid, {
          tcid,
          name: cur.name ?? '',
          type: cur.type ?? '',
          status: cur.status ?? '',
          severity: cur.severity ?? '',
          req_id: mode === 'link' ? myPk : '',
        })
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tc', 'list', 'meta'] })
      void qc.invalidateQueries({ queryKey: ['req', 'list'] })
      onClose()
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  })

  const busy = saveM.isPending
  const pickedLinked = [...picked].filter((id) => linkedIds.has(id)).length
  const pickedFree = picked.size - pickedLinked
  const loading = tcQ.isLoading || reqQ.isLoading

  const navItem = (key: string, label: string, hint?: string) => (
    <button
      key={key}
      type="button"
      className={`lk-nav-item${bucket === key ? ' on' : ''}`}
      onClick={() => setBucket(key)}
    >
      <span className="lk-nav-label">{label}</span>
      <span className="lk-nav-n">{counts.get(key) ?? 0}</span>
      {hint && <span className="muted small lk-nav-hint">{hint}</span>}
    </button>
  )

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div
        className="modal xwide tall-lk"
        role="dialog"
        aria-modal="true"
        aria-label="Test Case 연결"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <b>Test Case 연결 — {reqLabel(req)}</b>
          <button className="modal-x" type="button" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <div className="modal-body lk-body">
          {error && <div className="form-error">{error}</div>}

          <div className="lk-cols">
            {/* ── 왼쪽: 어디에 있는 TC 인가 ── */}
            <nav className="lk-nav">
              {navItem(UNLINKED, '미연결', '어디에도 안 붙은 TC')}
              {navItem(ALL, '전체')}

              <div className="lk-nav-title">REQ 분류</div>
              {catQ.isLoading ? (
                <div className="muted small lk-nav-empty">불러오는 중…</div>
              ) : catRows.length === 0 ? (
                <div className="muted small lk-nav-empty">분류에 붙은 TC 가 없습니다</div>
              ) : (
                catRows.map((c) => navItem(c.id, c.name))
              )}

              {(counts.get(UNCATEGORIZED) ?? 0) > 0 &&
                navItem(UNCATEGORIZED, '미분류', '분류 없는 요구사항의 TC')}
            </nav>

            {/* ── 오른쪽: 고르기 ── */}
            <div className="lk-main">
              <input
                autoFocus
                className="lk-search"
                placeholder="TC ID / 제목 / 유형 검색"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />

              <div className="link-list lk-list">
                {loading ? (
                  <div className="empty">불러오는 중…</div>
                ) : shown.length === 0 ? (
                  <div className="empty">
                    {tcs.length === 0
                      ? '등록된 TC 가 없습니다. 「+ TC 생성」으로 먼저 만드세요.'
                      : bucket === UNLINKED
                        ? '연결되지 않은 TC 가 없습니다. 왼쪽에서 분류를 골라 다른 요구사항의 TC 를 가져올 수 있습니다.'
                        : '조건에 맞는 TC 가 없습니다.'}
                  </div>
                ) : (
                  shown.map((t) => {
                    const isLinked = linkedIds.has(t.tcid)
                    const key = (t.req_id || '').trim()
                    const owner = key && key !== myPk ? reqByKey.get(key) : undefined
                    return (
                      <label className="link-row" key={t.tcid}>
                        <input
                          type="checkbox"
                          checked={picked.has(t.tcid)}
                          onChange={() => toggle(t.tcid)}
                        />
                        <span className="tc-id">{t.tcid}</span>
                        <span className="req-name">{t.name || '(제목 없음)'}</span>
                        {isLinked ? (
                          <span className="tag">연결됨</span>
                        ) : owner ? (
                          <span className="tag" title="다른 요구사항에 연결되어 있습니다">
                            {reqLabel(owner)}
                          </span>
                        ) : (
                          <span className="tag free" title="아직 어디에도 붙지 않았습니다">
                            미연결
                          </span>
                        )}
                        <span className={`status ${statusClass(t.status)}`}>
                          ● {t.status || '미실행'}
                        </span>
                      </label>
                    )
                  })
                )}
              </div>

              <div className="hint">
                TC 하나는 요구사항 하나에만 붙습니다(<code>tc.req_id</code> 한 칸).
                다른 요구사항에 붙어 있는 TC 를 고르면 <b>그쪽 연결이 끊기고</b> 이리로
                옮겨옵니다 — 회색 배지가 현재 주인입니다.
              </div>
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <span className="muted small">
            {picked.size > 0 ? `${picked.size}건 선택` : '연결할 TC 를 고르세요'}
          </span>
          <span className="page-head-actions">
            <button className="btn" type="button" onClick={onClose} disabled={busy}>
              취소
            </button>
            {pickedLinked > 0 && (
              <button
                className="btn danger"
                type="button"
                disabled={busy}
                onClick={() => saveM.mutate('unlink')}
              >
                {busy ? '처리 중…' : `${pickedLinked}건 연결 해제`}
              </button>
            )}
            <button
              className="btn primary"
              type="button"
              disabled={busy || pickedFree === 0}
              onClick={() => saveM.mutate('link')}
            >
              {busy ? '처리 중…' : `${pickedFree}건 연결`}
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}
