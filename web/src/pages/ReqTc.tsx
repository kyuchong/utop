import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, categoryApi, apiFetch, type MeUser } from '@/api/client'
import { reqLabel, reqPk, statusClass, type Requirement, type TestCaseMeta } from '@/types'
import { goto } from '@/api/goto'
import { IconChevron } from '@/components/icons'
import './ReqTc.css'

interface Props {
  me?: MeUser | null
}

/** 한 요구사항과 그에 붙은 시험들 — 화면이 그리는 단위 */
interface Pair {
  req: Requirement | null // null 이면 「요구사항 없는 시험」 묶음
  tcs: TestCaseMeta[]
}

/**
 * REQ-TC — 요구사항과 시험을 **한 판에** 놓고 본다(지시).
 *
 * 지금은 요구사항과 시험항목(Coverage)이 각자 제 화면이라, 어느 요구사항에
 * 어떤 시험이 붙었나를 보려면 두 화면을 오간다. 더 나쁜 것은 **시험이 하나도
 * 없는 요구사항**이 어디에도 안 보인다는 점이다 — 213 기준 57건 중 51건이
 * 그렇다. 합쳐 놓으면 그것이 첫 화면에서 바로 드러난다.
 *
 * **읽기 전용이다.** 아무것도 쓰지 않고, 이미 있는 `/api/req`·`/api/tc` 를
 * 그대로 읽는다. 자료 구조도 안 바꾼다 — 연결(`tc.req_id` → `req.id`)은
 * 원래 있던 것이다. 기존 화면(Requirements·Coverage)은 손대지 않는다(지시).
 *
 * 줄 모양은 사진(Testiny)의 문법을 따른다 — 요구사항이 묶음 머리로 서고 그
 * 아래 시험이 들여써진다. 다만 **ID 접두어로 가르지 않는다**: 실제 자료의
 * 요구사항 ID 는 `REQ-2633-0003` 도 있고 `U-REQ-SYS-HW-Spec-002` 도 있어
 * 「REQ 로 시작」 이 늘 참이 아니다. 아이콘과 들여쓰기로 가른다.
 */
export default function ReqTc({ me }: Props) {
  void me
  /** 펼친 요구사항 — 기본은 **접힘**. 안 그러면 빈 줄 51개가 화면을 덮는다 */
  const [open, setOpen] = useState<Set<string>>(new Set())
  /** 시험이 붙은 요구사항만 보기 — 커버리지 구멍을 볼 땐 꺼서 본다 */
  const [onlyWithTc, setOnlyWithTc] = useState(false)
  const [q, setQ] = useState('')
  /** 1열에서 고른 폴더(분류) */
  const [cat, setCat] = useState('')
  /** 팝업으로 연 것 — 요구사항이거나 시험 */
  const [pop, setPop] = useState<{ kind: 'req' | 'tc'; id: string } | null>(null)

  const reqQ = useQuery({ queryKey: ['reqs'], queryFn: ({ signal }) => api.listRequirements(signal) })
  const tcQ = useQuery({ queryKey: ['tcs'], queryFn: ({ signal }) => api.listTestCases(signal) })
  const catQ = useQuery({ queryKey: ['req-categories'], queryFn: ({ signal }) => categoryApi.list(signal) })

  const reqs = useMemo(() => reqQ.data?.reqs ?? [], [reqQ.data])
  const tcs = useMemo(() => tcQ.data?.tcs ?? [], [tcQ.data])
  // 분류 API 는 `{categories: [...]}` 로 온다 — 배열이 아니다
  const cats = useMemo(() => catQ.data?.categories ?? [], [catQ.data])

  /** 분류 트리 — 고른 폴더 아래(하위 포함) 요구사항만 남긴다 */
  const catKids = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const c of cats) {
      const k = c.parent_id ?? ''
      m.set(k, [...(m.get(k) ?? []), c.id])
    }
    return m
  }, [cats])
  const catUnder = (id: string): string[] => [id, ...(catKids.get(id) ?? []).flatMap(catUnder)]

  /**
   * 요구사항마다 제 시험을 붙인다.
   *
   * 잇는 키는 **`req.id`(내부 키)** 다 — 화면에 보이는 `reqid` 가 아니다.
   * `tc.req_id` 에 든 값이 그것이라, reqid 로 맞추면 71건이 통째로 안 붙는다.
   */
  const pairs: Pair[] = useMemo(() => {
    const byReq = new Map<string, TestCaseMeta[]>()
    const loose: TestCaseMeta[] = []
    for (const t of tcs) {
      const k = String(t.req_id ?? '').trim()
      if (!k) loose.push(t)
      else byReq.set(k, [...(byReq.get(k) ?? []), t])
    }
    const out: Pair[] = reqs.map((r) => ({ req: r, tcs: byReq.get(reqPk(r)) ?? [] }))
    // 어디에도 안 붙은 시험 — 사진의 「폴더에 없는 테스트 케이스」 자리다.
    // 안 보이면 「내 시험이 사라졌다」 가 된다.
    if (loose.length) out.push({ req: null, tcs: loose })
    return out
  }, [reqs, tcs])

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    const inCat = cat ? new Set(catUnder(cat)) : null
    return pairs.filter((p) => {
      if (onlyWithTc && !p.tcs.length) return false
      if (inCat) {
        if (!p.req) return false
        const own = [p.req.cat1, p.req.cat2, p.req.cat3, p.req.cat4].filter(Boolean) as string[]
        if (!own.some((c) => inCat.has(c))) return false
      }
      if (!n) return true
      // 요구사항이 걸리면 그 묶음째, 시험이 걸려도 그 묶음을 보인다
      const hay = [p.req ? reqLabel(p.req) : '', p.req?.title ?? '', ...p.tcs.map((t) => `${t.tcid} ${t.name ?? ''}`)]
      return hay.join(' ').toLowerCase().includes(n)
    })
  }, [pairs, q, onlyWithTc, cat, catUnder])

  /** 찾는 중에는 저절로 펴 준다 — 접힌 채로는 무엇이 걸렸는지 안 보인다 */
  const isOpen = (k: string) => open.has(k) || !!q.trim()
  const toggle = (k: string) =>
    setOpen((s) => {
      const n = new Set(s)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })

  /** 팝업에서 이전·다음으로 걸어 다닐 차례 — 지금 보이는 줄 순서 그대로 */
  const flat = useMemo(() => {
    const rows: Array<{ kind: 'req' | 'tc'; id: string }> = []
    for (const p of shown) {
      if (p.req) rows.push({ kind: 'req', id: reqPk(p.req) })
      if (isOpen(p.req ? reqPk(p.req) : '__loose__')) for (const t of p.tcs) rows.push({ kind: 'tc', id: t.tcid })
    }
    return rows
  }, [shown, open, q])

  const step = (d: number) => {
    if (!pop) return
    const at = flat.findIndex((x) => x.kind === pop.kind && x.id === pop.id)
    const next = flat[at + d]
    if (next) setPop(next)
  }

  const total = pairs.length
  const covered = pairs.filter((p) => p.req && p.tcs.length).length
  const bare = pairs.filter((p) => p.req && !p.tcs.length).length

  if (reqQ.isLoading || tcQ.isLoading) return <div className="empty">불러오는 중…</div>
  if (reqQ.error) return <div className="load-error">{(reqQ.error as Error).message}</div>

  return (
    <div className="rt">
      {/* ── 1열 폴더 — 사진 그대로 「변함 없음」(지시) ── */}
      <aside className="panel rt-side">
        <div className="rt-sidehead">
          <b>요구사항 폴더</b>
        </div>
        <button type="button" className={`rt-cat${cat === '' ? ' on' : ''}`} onClick={() => setCat('')}>
          전체 <span className="rt-n">{reqs.length}</span>
        </button>
        <CatTree cats={cats} depth={0} parent={null} sel={cat} onSel={setCat} reqs={reqs} />
      </aside>

      {/* ── 2열 — 요구사항 줄 + 그 아래 시험 줄 ── */}
      <section className="panel rt-main">
        <div className="rt-head">
          <b>REQ · TC</b>
          <span className="muted small">
            요구사항 {total - (pairs.some((p) => !p.req) ? 1 : 0)}건 · 시험 붙음 {covered} ·{' '}
            <b className={bare ? 'rt-bare' : ''}>시험 없음 {bare}</b>
          </span>
          <span className="sp" />
          <label className="rt-only">
            <input type="checkbox" checked={onlyWithTc} onChange={(e) => setOnlyWithTc(e.target.checked)} />
            시험 있는 것만
          </label>
          <input
            className="rt-q"
            value={q}
            placeholder="요구사항 · 시험 제목/ID 로 찾기"
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="rt-rows">
          {shown.map((p) => {
            const key = p.req ? reqPk(p.req) : '__loose__'
            const on = isOpen(key)
            return (
              <div key={key}>
                {/* 요구사항 줄 — 묶음 머리 */}
                <div className={`rt-req${p.tcs.length ? '' : ' bare'}`}>
                  <button
                    type="button"
                    className={`rt-caret${on ? ' open' : ''}`}
                    aria-label={on ? '접기' : '펴기'}
                    disabled={!p.tcs.length}
                    onClick={() => toggle(key)}
                  >
                    <IconChevron />
                  </button>
                  <span className="rt-icon" aria-hidden="true">
                    📄
                  </span>
                  <span className="rt-id">{p.req ? reqLabel(p.req) : '(요구사항 없음)'}</span>
                  {p.req ? (
                    <button type="button" className="rt-title" onClick={() => setPop({ kind: 'req', id: reqPk(p.req!) })}>
                      {p.req.title || '(제목 없음)'}
                    </button>
                  ) : (
                    <span className="rt-title muted">어느 요구사항에도 안 붙은 시험</span>
                  )}
                  <span className="sp" />
                  {p.req?.status && <span className="rt-st">{p.req.status}</span>}
                  <span className={`rt-cnt${p.tcs.length ? '' : ' zero'}`}>{p.tcs.length}</span>
                </div>

                {/* 시험 줄 — 들여써서 그 아래 */}
                {on &&
                  p.tcs.map((t) => (
                    <div className="rt-tc" key={t.tcid}>
                      <span className="rt-icon" aria-hidden="true">
                        🧪
                      </span>
                      <span className="rt-id">{t.tcid}</span>
                      <button type="button" className="rt-title" onClick={() => setPop({ kind: 'tc', id: t.tcid })}>
                        {t.name || '(제목 없음)'}
                      </button>
                      <span className="sp" />
                      {t.kind && <span className="rt-kind">{t.kind}</span>}
                      {t.status && <span className={`rt-v ${statusClass(String(t.status))}`}>{String(t.status)}</span>}
                    </div>
                  ))}
              </div>
            )
          })}
          {!shown.length && <div className="empty">보여 줄 것이 없습니다.</div>}
        </div>
      </section>

      {pop && (
        <DetailPop
          kind={pop.kind}
          id={pop.id}
          onClose={() => setPop(null)}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
        />
      )}
    </div>
  )
}

/** 1열 분류 트리 — 요구사항 화면의 트리를 **건드리지 않으려고** 여기 따로 둔다 */
function CatTree({
  cats,
  parent,
  depth,
  sel,
  onSel,
  reqs,
}: {
  cats: Array<{ id: string; name: string; parent_id: string | null }>
  parent: string | null
  depth: number
  sel: string
  onSel: (v: string) => void
  reqs: Requirement[]
}) {
  const mine = cats.filter((c) => (c.parent_id ?? null) === parent)
  if (!mine.length) return null
  return (
    <>
      {mine.map((c) => {
        const n = reqs.filter((r) => [r.cat1, r.cat2, r.cat3, r.cat4].includes(c.id)).length
        return (
          <div key={c.id}>
            <button
              type="button"
              className={`rt-cat${sel === c.id ? ' on' : ''}`}
              style={{ paddingLeft: 10 + depth * 14 }}
              onClick={() => onSel(sel === c.id ? '' : c.id)}
            >
              📁 {c.name} <span className="rt-n">{n || ''}</span>
            </button>
            <CatTree cats={cats} parent={c.id} depth={depth + 1} sel={sel} onSel={onSel} reqs={reqs} />
          </div>
        )
      })}
    </>
  )
}

/**
 * 상세 팝업 — **읽기 중심**(합의).
 *
 * 시험 상세는 탭이 여덟이라 3열에 안 들어간다. 그래서 팝업으로 넓게 본다.
 * 다만 **편집기를 여기 복제하지 않는다** — 두 벌이 되면 한쪽만 고치는 날이
 * 오고, 그것은 「기존 것을 건드리지 말라」 는 뜻과도 어긋난다. 고칠 때는
 * 원래 화면으로 넘긴다.
 *
 * 62건짜리 묶음을 훑을 때 매번 닫았다 여는 것은 고통스러우니 **이전·다음**을
 * 둔다(합의).
 */
function DetailPop({
  kind,
  id,
  onClose,
  onPrev,
  onNext,
}: {
  kind: 'req' | 'tc'
  id: string
  onClose: () => void
  onPrev: () => void
  onNext: () => void
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') onPrev()
      if (e.key === 'ArrowRight') onNext()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose, onPrev, onNext])

  const q = useQuery({
    queryKey: ['rt-detail', kind, id],
    queryFn: async () => {
      const r = await apiFetch(kind === 'req' ? `/api/req/${encodeURIComponent(id)}` : `/api/tc/${encodeURIComponent(id)}`)
      if (!r.ok) throw new Error('불러오지 못했습니다')
      return (await r.json()) as Record<string, unknown>
    },
  })

  const d = q.data ?? {}
  const steps = Array.isArray(d.checks) ? (d.checks as Array<Record<string, unknown>>) : []

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div className="modal rt-pop" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <b>{kind === 'req' ? '요구사항' : '시험항목'}</b>
          <span className="rt-popid">{String(d.reqid || d.tcid || id)}</span>
          <span className="sp" />
          <button className="btn small" type="button" onClick={onPrev} title="이전 (←)">
            ◀
          </button>
          <button className="btn small" type="button" onClick={onNext} title="다음 (→)">
            ▶
          </button>
          {/* 고치는 것은 원래 화면에서 — 편집기를 여기 복제하지 않는다 */}
          <button
            className="btn small primary"
            type="button"
            onClick={() => {
              goto(kind, String(d.id || d.tcid || id))
              onClose()
            }}
          >
            {kind === 'req' ? 'Requirements 에서 열기' : 'Coverage 에서 열기'}
          </button>
          <button className="btn small" type="button" onClick={onClose}>
            닫기
          </button>
        </div>

        <div className="rt-popbody">
          {q.isLoading ? (
            <div className="empty">불러오는 중…</div>
          ) : q.error ? (
            <div className="load-error">{(q.error as Error).message}</div>
          ) : (
            <>
              <h3 className="rt-poptitle">{String(d.title || d.name || '(제목 없음)')}</h3>
              <div className="rt-kv">
                {(
                  [
                    ['상태', d.status],
                    ['우선순위', d.priority],
                    ['유형', d.type],
                    ['심각도', d.severity],
                    ['실행 타입', d.run_type],
                    ['모델', d.model],
                    ['만든이', d.created_by],
                    ['고친이', d.updated_by],
                  ] as Array<[string, unknown]>
                )
                  .filter(([, v]) => v !== undefined && v !== null && String(v) !== '')
                  .map(([k, v]) => (
                    <div className="rt-kvi" key={k}>
                      <i>{k}</i>
                      <b>{String(v)}</b>
                    </div>
                  ))}
              </div>

              {kind === 'req' && Array.isArray(d.tc) && (d.tc as unknown[]).length > 0 && (
                <>
                  <h4 className="rt-poph">붙은 시험 {(d.tc as unknown[]).length}건</h4>
                  <div className="rt-poplist">
                    {(d.tc as Array<Record<string, unknown>>).map((t, i) => (
                      <div className="rt-popline" key={i}>
                        <span className="rt-id">{String(t.tcid ?? '')}</span>
                        <span>{String(t.name ?? '')}</span>
                        <span className="sp" />
                        {!!t.status && <span className={`rt-v ${statusClass(String(t.status))}`}>{String(t.status)}</span>}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {kind === 'tc' && steps.length > 0 && (
                <>
                  <h4 className="rt-poph">스텝 {steps.length}개</h4>
                  <div className="rt-poplist">
                    {steps.map((s, i) => (
                      <div className="rt-popline" key={i}>
                        <span className="rt-id">#{i + 1}</span>
                        <span className="rt-kind">{String(s.kind ?? s.action ?? '')}</span>
                        <span className="mono">{String(s.cli ?? s.step ?? s.desc ?? '')}</span>
                        <span className="sp" />
                        {!!s.repeatResult && (
                          <span className={`rt-v ${statusClass(String(s.repeatResult))}`}>{String(s.repeatResult)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {!!d.desc && <p className="rt-desc">{String(d.desc)}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
