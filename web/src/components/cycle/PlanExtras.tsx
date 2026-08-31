import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import type { CycleMeta } from '@/pages/Cycles'
import './PlanExtras.css'

/**
 * 플랜 개요에 붙는 세 덩어리 (목업).
 *
 *  ① **판정** — 결과서를 지금 낼 수 있나. 플랜 화면의 축이다.
 *     실패·미실행이 남아 있으면 못 낸다고 **까닭과 함께** 말한다.
 *  ② **시험 범위 · 커버리지** — 이 플랜이 무엇을 얼마나 덮는가.
 *  ③ **빌드 간 회귀** — 지난 빌드 대비 새로 깨진 것·고쳐진 것.
 *     실행이 두 빌드 이상 있어야 뜻이 있어, 없으면 판 자체를 안 낸다.
 *  ④ **이 플랜의 실행** — 결과 메일·결과서는 실행에서 낸다.
 */

interface RunLite {
  id: string
  name?: string | null
  version?: string | null
  closed_at?: string | null
  created_at?: string | null
  rerun_of?: string | null
  n_total: number
  n_pass: number
  n_fail: number
  n_etc: number
  n_none: number
}

interface Reg {
  versions: string[]
  a: string
  b: string
  changed: Array<{ tcid: string; a?: string; b?: string; kind: string }>
  same: number
}

const KINDS: Record<string, { label: string; tone: string }> = {
  broke: { label: '새로 깨짐', tone: 'f' },
  still: { label: '계속 실패', tone: 'b' },
  fixed: { label: '고쳐짐', tone: 'p' },
  gone: { label: '아직 안 돌림', tone: 'n' },
}
const RESN: Record<string, string> = { p: 'Pass', f: 'Fail', b: '기타', n: '미실행' }

export default function PlanExtras({ plan, onOpenRun }: { plan: CycleMeta; onOpenRun?: (id: string) => void }) {
  const [cmp, setCmp] = useState<{ a: string; b: string }>({ a: '', b: '' })

  const runsQ = useQuery({
    queryKey: ['plan-runs', plan.id],
    queryFn: async () => {
      const r = await apiFetch(`/api/plan-runs?plan_id=${encodeURIComponent(plan.id)}`)
      if (!r.ok) throw new Error('실행을 불러오지 못했습니다')
      return (await r.json()) as { runs: RunLite[] }
    },
    staleTime: 10_000,
  })
  const regQ = useQuery({
    queryKey: ['plan-reg', plan.id, cmp.a, cmp.b],
    queryFn: async () => {
      const q = new URLSearchParams({ plan_id: plan.id, a: cmp.a, b: cmp.b })
      const r = await apiFetch(`/api/plan-runs-regression?${q.toString()}`)
      if (!r.ok) throw new Error('회귀를 계산하지 못했습니다')
      return (await r.json()) as Reg
    },
    staleTime: 10_000,
  })

  const runs = useMemo(() => runsQ.data?.runs ?? [], [runsQ.data])
  const items = (plan.items ?? []) as Array<{ tcid?: string }>

  /** 항목의 **최종 상태** — 가장 최근 빌드의 결과가 이긴다.
      옛 빌드에서 깨졌어도 최신에서 통과면 통과다. */
  const tal = useMemo(() => {
    const t = { p: 0, f: 0, b: 0, n: 0, total: items.length }
    /* 목록 API 는 항목별 결과를 안 준다 — 실행별 집계로 근사한다.
       최신 빌드의 실행들을 합쳐 센다(같은 빌드 여러 실행은 합집합). */
    const vs = [...new Set(runs.map((r) => String(r.version ?? '')))].sort().reverse()
    const top = vs[0]
    const cur = runs.filter((r) => String(r.version ?? '') === top)
    if (!cur.length) {
      t.n = t.total
      return t
    }
    t.p = cur.reduce((a, r) => a + r.n_pass, 0)
    t.f = cur.reduce((a, r) => a + r.n_fail, 0)
    t.b = cur.reduce((a, r) => a + r.n_etc, 0)
    t.n = Math.max(0, t.total - t.p - t.f - t.b)
    return t
  }, [runs, items.length])

  /* ① 판정 — 결과서를 낼 수 있나 */
  const verdict = useMemo(() => {
    if (!runs.length)
      return { k: 'none', label: '아직 실행이 없습니다', why: '실행을 만들어 시험을 시작하세요' }
    const b: string[] = []
    if (tal.f) b.push(`실패 ${tal.f}`)
    if (tal.n) b.push(`미실행 ${tal.n}`)
    return b.length
      ? { k: 'block', label: '결과서 낼 수 없음', why: b.join(' · ') }
      : { k: 'ok', label: '결과서 발행 가능', why: `시험 항목 ${tal.total}건 전부 통과` }
  }, [runs.length, tal])

  const reg = regQ.data

  return (
    <>
      <div className={`pe-verdict ${verdict.k}`}>
        <span className="pe-vi">{verdict.k === 'ok' ? '✓' : verdict.k === 'block' ? '!' : '·'}</span>
        <b>{verdict.label}</b>
        <span className="pe-why">{verdict.why}</span>
      </div>

      <div className="pe-cards">
        <section className="pe-card">
          <h3>시험 범위</h3>
          <div className="pe-stats">
            <div className="pe-stat">
              <b>{items.length}</b>
              <em>시험 항목</em>
            </div>
            <div className="pe-stat">
              <b className="ok">{tal.p}</b>
              <em>통과</em>
            </div>
            <div className="pe-stat">
              <b className="bad">{tal.f}</b>
              <em>실패</em>
            </div>
          </div>
          <div className="pe-rows">
            <div className="pe-row">
              <span>실행</span>
              <b>{runs.length}건</b>
            </div>
            <div className="pe-row">
              <span>빌드</span>
              <b>{new Set(runs.map((r) => r.version ?? '')).size}개</b>
            </div>
            <div className="pe-row">
              <span>미실행</span>
              <b>{tal.n}건</b>
            </div>
          </div>
        </section>

        <section className="pe-card">
          <h3>이 플랜의 실행</h3>
          {runs.length ? (
            <div className="pe-runs">
              {runs.slice(0, 8).map((r) => {
                const done = r.n_pass + r.n_fail + r.n_etc
                const pct = r.n_total ? Math.round((done / r.n_total) * 100) : 0
                return (
                  <button type="button" className="pe-run" key={r.id} onClick={() => onOpenRun?.(r.id)}>
                    <span className="pe-key">{r.id}</span>
                    <span className="pe-ell">
                      {r.name ?? ''}
                      {r.rerun_of ? ' (재시험)' : ''}
                    </span>
                    <span className="pe-ver">{r.version ?? ''}</span>
                    <span className="pe-pct">{pct}%</span>
                    <span className={`pe-st ${r.closed_at ? 'done' : done ? 'run' : 'idle'}`}>
                      {r.closed_at ? '종료' : done ? '진행중' : '대기'}
                    </span>
                  </button>
                )
              })}
              {runs.length > 8 && <div className="pe-more">외 {runs.length - 8}건 — Runs 화면에서 전체 보기</div>}
            </div>
          ) : (
            <div className="pe-empty">
              <strong>아직 실행이 없습니다</strong>
              Runs 화면에서 이 플랜으로 실행을 만드세요.
            </div>
          )}
        </section>
      </div>

      {reg && reg.versions.length >= 2 && (
        <section className="pe-reg">
          <div className="pe-regh">
            <b>빌드 간 회귀</b>
            <span className="pe-muted">빌드 {reg.versions.length}개</span>
            <span className="pe-sp" />
            <select value={reg.a} onChange={(e) => setCmp({ a: e.target.value, b: reg.b })}>
              {reg.versions.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
            <span className="pe-muted">→</span>
            <select value={reg.b} onChange={(e) => setCmp({ a: reg.a, b: e.target.value })}>
              {reg.versions.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </div>
          {reg.changed.length ? (
            <>
              {(['broke', 'still', 'fixed', 'gone'] as const).map((k) => {
                const arr = reg.changed.filter((x) => x.kind === k)
                if (!arr.length) return null
                return (
                  <div key={k}>
                    <div className="pe-fold">
                      <i className={`pe-dot ${KINDS[k]!.tone}`} />
                      {KINDS[k]!.label}
                      <span className="pe-muted">{arr.length}</span>
                    </div>
                    {arr.map((x) => (
                      <div className="pe-crow" key={x.tcid}>
                        <span className="pe-key">{x.tcid}</span>
                        <span className={`pe-res ${x.a ?? 'n'}`}>{RESN[x.a ?? 'n']}</span>
                        <span className="pe-arrow">→</span>
                        <span className={`pe-res ${x.b ?? 'n'}`}>{RESN[x.b ?? 'n']}</span>
                      </div>
                    ))}
                  </div>
                )
              })}
              <div className="pe-more">변화 없음 {reg.same}건</div>
            </>
          ) : (
            <div className="pe-empty">
              <strong>달라진 항목이 없습니다</strong>
              {reg.a} 대비 {reg.b} 에서 결과가 바뀐 항목이 없습니다.
            </div>
          )}
        </section>
      )}
    </>
  )
}
