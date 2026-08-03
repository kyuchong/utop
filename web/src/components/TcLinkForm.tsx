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
 * 기존 TC 를 이 요구사항에 붙인다. **붙이기만 한다.**
 *
 *   [분류]  [가져올 수 있는 TC — 체크박스]
 *
 * 떼는 것은 Coverages 탭의 목록에서 한다. 한 창에서 붙이기와 떼기를 같이
 * 하면 어느 쪽이 무엇인지 계속 생각해야 한다 — Zephyr Enterprise 도 같은
 * 구조다(요구사항 화면에 Mapped Testcases 가 상시로 있고, Map TestCase
 * 버튼이 여는 창은 추가 전용이다).
 *
 * 왼쪽은 후보를 좁히는 칸이다. TC 가 수백 건이 되면 검색 한 줄로는 못 찾는다.
 *  · 미연결  — 아직 어느 요구사항에도 안 붙은 TC. 대개 여기서 찾는다
 *  · 분류    — 그 분류의 요구사항에 붙어 있는 TC (가져오면 그쪽이 끊긴다)
 *  · 미분류  — 붙어는 있는데 그 요구사항에 분류가 없는 것
 *
 * 연결의 실체는 tc.req_id 한 칸이다. "붙이기 = req_id 를 이 요구사항으로".
 */
export default function TcLinkForm({ req, linked, onClose }: Props) {
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [bucket, setBucket] = useState<string>(UNLINKED)
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

  /** 저장 전 상태. 처음에는 지금 붙어 있는 것 그대로. */
  const [mine, setMine] = useState<Set<string>>(() => new Set(linked.map((t) => t.tcid)))
  const original = useMemo(() => new Set(linked.map((t) => t.tcid)), [linked])

  const reqByKey = useMemo(() => {
    const m = new Map<string, Requirement>()
    for (const r of reqs) {
      m.set(reqPk(r), r)
      const l = reqLabel(r)
      if (l) m.set(l, r)
    }
    return m
  }, [reqs])

  const tcById = useMemo(() => new Map(tcs.map((t) => [t.tcid, t])), [tcs])

  /** TC 하나가 왼쪽의 어느 칸에 속하는가 */
  const bucketsOf = (t: TestCaseMeta): string[] => {
    const key = (t.req_id || '').trim()
    if (!key) return [UNLINKED]
    const owner = reqByKey.get(key)
    if (!owner) return [UNLINKED] // 끊어진 연결도 사실상 주인이 없다
    const ids = [owner.cat1, owner.cat2, owner.cat3, owner.cat4].filter(Boolean) as string[]
    return ids.length > 0 ? ids : [UNCATEGORIZED]
  }

  /** 후보 = 오른쪽에 없는 TC */
  const candidates = useMemo(() => tcs.filter((t) => !mine.has(t.tcid)), [tcs, mine])

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of candidates) {
      for (const b of bucketsOf(t)) m.set(b, (m.get(b) ?? 0) + 1)
    }
    m.set(ALL, candidates.length)
    return m
  }, [candidates, reqByKey])

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
    return candidates.filter((t) => {
      if (bucket !== ALL && !bucketsOf(t).includes(bucket)) return false
      if (!needle) return true
      return (
        t.tcid.toLowerCase().includes(needle) ||
        (t.name ?? '').toLowerCase().includes(needle) ||
        (t.type ?? '').toLowerCase().includes(needle)
      )
    })
  }, [candidates, q, bucket, reqByKey])

  const add = (tcid: string) => setMine((s) => new Set(s).add(tcid))
  const drop = (tcid: string) =>
    setMine((s) => {
      const n = new Set(s)
      n.delete(tcid)
      return n
    })
  const addAll = () => setMine((s) => new Set([...s, ...shown.map((t) => t.tcid)]))

  /** 저장할 것. 이 창은 붙이기만 하므로 새로 고른 것뿐이다. */
  const toLink = useMemo(() => [...mine].filter((id) => !original.has(id)), [mine, original])
  const dirty = toLink.length

  const saveM = useMutation({
    mutationFn: async () => {
      // 순차 저장. TC 저장은 스텝 보존 로직 때문에 서버가 이전 값을 읽으므로
      // 같은 대상에 동시에 던지지 않는 편이 안전하다.
      for (const tcid of toLink) {
        const cur = tcById.get(tcid)
        if (!cur) continue
        await tcApi.save(tcid, {
          tcid,
          name: cur.name ?? '',
          type: cur.type ?? '',
          status: cur.status ?? '',
          severity: cur.severity ?? '',
          req_id: myPk,
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
  const loading = tcQ.isLoading || reqQ.isLoading

  const close = () => {
    if (dirty && !window.confirm('저장하지 않은 변경이 있습니다. 닫을까요?')) return
    onClose()
  }

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
    <div className="modal-back" onMouseDown={close}>
      <div
        className="modal xwide tall-lk"
        role="dialog"
        aria-modal="true"
        aria-label="Test Case 연결"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <b>Test Case 연결 — {reqLabel(req)}</b>
          <button className="modal-x" type="button" onClick={close} aria-label="닫기">
            ×
          </button>
        </div>

        <div className="modal-body lk-body">
          {error && <div className="form-error">{error}</div>}

          <div className="lk-cols">
            {/* ── 1열: 후보를 좁히는 칸 ── */}
            <nav className="lk-nav">
              {navItem(UNLINKED, '미연결', '주인 없는 TC')}
              {navItem(ALL, '전체')}

              <div className="lk-nav-title">REQ 분류</div>
              {catQ.isLoading ? (
                <div className="muted small lk-nav-empty">불러오는 중…</div>
              ) : catRows.length === 0 ? (
                <div className="muted small lk-nav-empty">가져올 TC 가 없습니다</div>
              ) : (
                catRows.map((c) => navItem(c.id, c.name))
              )}

              {(counts.get(UNCATEGORIZED) ?? 0) > 0 &&
                navItem(UNCATEGORIZED, '미분류', '분류 없는 요구사항의 TC')}
            </nav>

            {/* ── 2열: 후보 ── */}
            <section className="lk-pane">
              <div className="lk-pane-head">
                <b>가져올 수 있는 TC</b>
                <span className="muted small">{shown.length}건</span>
                {toLink.length > 0 && <span className="tag chg">고른 것 {toLink.length}</span>}
                <button
                  className="btn small"
                  type="button"
                  disabled={shown.length === 0}
                  onClick={addAll}
                >
                  모두 고르기
                </button>
              </div>

              <input
                autoFocus
                className="lk-search"
                placeholder="TC ID / 제목 / 유형 검색"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />

              <div className="lk-list">
                {loading ? (
                  <div className="empty">불러오는 중…</div>
                ) : shown.length === 0 ? (
                  <div className="empty">
                    {bucket === UNLINKED
                      ? '주인 없는 TC 가 없습니다. 왼쪽에서 분류를 골라 다른 요구사항의 TC 를 가져올 수 있습니다.'
                      : '조건에 맞는 TC 가 없습니다.'}
                  </div>
                ) : (
                  shown.map((t) => {
                    const key = (t.req_id || '').trim()
                    const owner = key ? reqByKey.get(key) : undefined
                    return (
                      <label
                        key={t.tcid}
                        className={`lk-row${mine.has(t.tcid) ? ' added' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={mine.has(t.tcid)}
                          onChange={() => (mine.has(t.tcid) ? drop(t.tcid) : add(t.tcid))}
                        />
                        <span className="lk-txt">
                          <b className="lk-name">{t.name || '(제목 없음)'}</b>
                          <span className="muted small lk-id">{t.tcid}</span>
                        </span>
                        {owner ? (
                          <span className="tag" title="지금 이 요구사항에 붙어 있습니다">
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
            </section>

          </div>

          <div className="hint">
            TC 하나는 요구사항 하나에만 붙습니다(<code>tc.req_id</code> 한 칸).
            다른 요구사항의 TC 를 가져오면 <b>그쪽 연결은 끊깁니다</b> — 회색 배지가
            현재 주인입니다. <b>떼는 것은 Coverages 목록의 「해제」</b> 로 합니다.
          </div>
        </div>

        <div className="modal-foot">
          <span className="muted small">
            {dirty === 0
              ? '가져올 TC 를 고르세요'
              : `${toLink.length}건을 이 요구사항에 붙입니다`}
          </span>
          <span className="page-head-actions">
            <button className="btn" type="button" onClick={close} disabled={busy}>
              취소
            </button>
            <button
              className="btn primary"
              type="button"
              disabled={busy || dirty === 0}
              onClick={() => saveM.mutate()}
            >
              {busy ? '붙이는 중…' : dirty > 0 ? `${dirty}건 붙이기` : '붙이기'}
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}
