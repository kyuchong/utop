import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'

/**
 * ID 옮기기 — 옛 ID 를 **모델그룹 기준**으로.
 *
 *     LGUP-E61xx_R0001 · _T0001 · _P0001 · _P0001-E001
 *
 * 앞머리는 **모델그룹 그대로**다 — 모델그룹이 이미 사업자를 알아볼 만큼
 * 줄여 담은 통칭이라(지시), 사업자를 덧붙이면 같은 말이 두 번 들어간다.
 *
 * 왜 화면에 두나 — 서버에 들어가 명령을 치는 방식이면, 손이 안 닿는
 * 설치처(253)는 사람이 거기까지 가서 쳐야 한다. 여기 두면 받기만 하고
 * 눌러서 끝난다. 그리고 **먼저 보여 준다** — 이 서버의 진짜 데이터로
 * 무엇이 무엇으로 바뀌는지 세어서 낸 다음에 누르게 한다.
 */
interface Move { kind: string; pk: string; old: string; new: string; name?: string
                 letter?: string
                 execs?: Array<{ old: string; new: string }> }
interface Skip { kind: string; pk: string; old: string; why: string }

const LAB: Record<string, string> = { req: '요구사항', tc: '시험항목', cycle: '플랜' }

/** 계열 — **각각 옮길 수 있다**(지시). 한꺼번에 백 건을 옮기는 것이 겁날 때
 *  요구사항만 먼저 해 보고 괜찮으면 나머지를 하는 식으로 쓴다.
 *
 *  R 요구사항 · T 요구사항을 덮는 시험 · **V Jira 이슈를 덮는 시험** ·
 *  P 플랜(그 안의 실행이 따라간다). */
const SERIES: Array<{ k: string; label: string; hint: string }> = [
  { k: 'R', label: '요구사항 R', hint: '요구사항 번호만 옮깁니다' },
  { k: 'T', label: '시험 T', hint: '요구사항을 덮는 시험만 옮깁니다' },
  { k: 'V', label: '릴리스 시험 V', hint: 'Jira 이슈를 덮는 시험만 옮깁니다' },
  { k: 'P', label: '플랜 P', hint: '플랜과 그 안의 실행을 옮깁니다' },
]

export default function IdMigrate() {
  const [done, setDone] = useState<Record<string, number> | null>(null)
  const q = useQuery({
    queryKey: ['id-migrate-plan'],
    queryFn: async () => {
      const r = await apiFetch('/api/id-migrate/plan')
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || '미리 보기를 못 만들었습니다')
      return (await r.json()) as { moves: Move[]; skipped: Skip[] }
    },
  })
  /** 지금 누른 것 — 단추마다 「옮기는 중」 을 따로 보여 준다 */
  const [busy, setBusy] = useState('')
  const run = useMutation({
    mutationFn: async (letters: string = '') => {
      const r = await apiFetch(
        `/api/id-migrate/apply${letters ? `?letters=${encodeURIComponent(letters)}` : ''}`,
        { method: 'POST' },
      )
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || '옮기지 못했습니다')
      return (await r.json()) as { counts: Record<string, number> }
    },
    onSuccess: (d) => { setDone(d.counts); setBusy(''); void q.refetch() },
    onError: () => setBusy(''),
  })

  if (q.isLoading) return <div className="muted">세는 중…</div>
  if (q.error) return <div className="load-error">{(q.error as Error).message}</div>

  const moves = q.data?.moves ?? []
  const skipped = q.data?.skipped ?? []
  const execs = moves.reduce((a, m) => a + (m.execs?.length ?? 0), 0)
  const byKind = (k: string) => moves.filter((m) => m.kind === k)
  /** 계열마다 몇 건인가 — 단추에 적는다. 0 건이면 누를 것이 없다 */
  const bySeries = (k: string) => moves.filter((m) => (m.letter || '') === k).length

  return (
    <div className="idm">
      <div className="set-h">
        <b>ID 옮기기</b>
        <span className="muted small">
          옛 ID 를 모델그룹 기준으로 — <code>LGUP-E61xx_R0001</code> ·{' '}
          <code>_T0001</code> · <code>_P0001</code> · <code>_P0001-E001</code>
        </span>
      </div>

      {done && (
        <div className="idm-done">
          옮겼습니다 — 요구사항 {done.req ?? 0} · 시험항목 {done.tc ?? 0} · 플랜 {done.cycle ?? 0} ·
          실행 {done.exec ?? 0}건 (이슈 연결 {done.defect ?? 0} · 변경 이력 {done.history ?? 0}건 따라 옮김)
        </div>
      )}

      {moves.length === 0 ? (
        <div className="idm-none">옮길 것이 없습니다. 이미 모두 새 규칙입니다.</div>
      ) : (
        <>
          <div className="idm-sum">
            {(['req', 'tc', 'cycle'] as const).map((k) => (
              <span key={k} className="idm-chip">{LAB[k]} <b>{byKind(k).length}</b></span>
            ))}
            <span className="idm-chip">실행 <b>{execs}</b></span>
          </div>

          {/* **계열마다 따로 옮기기**(지시). 한꺼번에 다 옮기는 단추는 아래
              오른쪽에 그대로 둔다 — 나눠 하고 싶을 때만 여기를 쓴다. */}
          <div className="idm-series">
            {SERIES.map((sr) => {
              const n = bySeries(sr.k)
              return (
                <button
                  key={sr.k}
                  type="button"
                  className="btn small"
                  disabled={!n || run.isPending}
                  title={n ? sr.hint : '옮길 것이 없습니다'}
                  onClick={() => {
                    setBusy(sr.k)
                    run.mutate(sr.k)
                  }}
                >
                  {busy === sr.k && run.isPending ? '옮기는 중…' : `${sr.label} ${n}건`}
                </button>
              )
            })}
          </div>

          <div className="idm-tblwrap">
            <table className="idm-tbl">
              <thead><tr><th>구분</th><th>지금</th><th>바뀔 ID</th><th>이름</th></tr></thead>
              <tbody>
                {moves.map((m) => (
                  <tr key={`${m.kind}-${m.pk}`}>
                    <td>{LAB[m.kind] ?? m.kind}</td>
                    <td className="idm-old">{m.old || '(없음)'}</td>
                    <td className="idm-new">{m.new}</td>
                    <td className="idm-nm">{m.name || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {skipped.length > 0 && (
        <div className="idm-skip">
          {/* 조용히 빼면 「다 됐구나」 로 읽힌다. 못 옮긴 것은 반드시 밝힌다. */}
          <b>못 옮기는 것 {skipped.length}건</b>
          <ul>
            {Object.entries(
              skipped.reduce<Record<string, number>>((a, s) => ({ ...a, [s.why]: (a[s.why] ?? 0) + 1 }), {}),
            ).map(([why, n]) => (
              <li key={why}>{n}건 — {why}</li>
            ))}
          </ul>
          <span className="muted small">
            폴더를 프로젝트 아래로 옮기거나 시험항목에 모델그룹을 채운 뒤 다시 누르면 이어서 옮깁니다.
          </span>
        </div>
      )}

      <div className="idm-foot">
        <span className="muted small">
          옛 ID 는 표로 남아, 위키·Jira 에 적힌 옛 ID 도 계속 새 것을 찾아갑니다.
        </span>
        <span className="sp" />
        <button
          className="btn idm-go"
          type="button"
          disabled={moves.length === 0 || run.isPending}
          onClick={() => {
            setBusy('*')
            run.mutate('')
          }}
        >
          {busy === '*' && run.isPending ? '옮기는 중…' : `전부 ${moves.length}건 옮기기`}
        </button>
      </div>
      {run.error && <div className="load-error">{(run.error as Error).message}</div>}
    </div>
  )
}
