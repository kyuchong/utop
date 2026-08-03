import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import './tc.css'

interface Entry {
  at?: string
  user?: string
  pass?: number
  fail?: number
  sec?: number
  sessions?: string[]
  /** 옛 자료는 실행 로그를 통째로 들고 있기도 하다 */
  log?: unknown[]
  [k: string]: unknown
}

interface Props {
  tcid: string
}

/** 초를 사람이 읽는 길이로. 시험은 몇 초에서 몇 십 분까지 간다. */
function dur(sec?: number): string {
  const s = Math.max(0, Math.round(Number(sec ?? 0)))
  if (!s) return '–'
  if (s < 60) return `${s}초`
  const m = Math.floor(s / 60)
  return s % 60 ? `${m}분 ${s % 60}초` : `${m}분`
}

/**
 * 이력 탭 — 이 TC 를 언제 누가 돌렸나.
 *
 * 서버에 이미 `/api/tc/{id}/run-history` 가 있고 모든 사용자의 실행이 한
 * 곳에 쌓인다(최근 100건). 전체 실행만 남기므로, 한 줄씩 돌려본 것은 여기
 * 오지 않는다 — 그것까지 쌓으면 이력이 편집 기록이 되어 '언제 통째로
 * 돌렸나' 를 못 찾는다.
 */
export default function TcHistory({ tcid }: Props) {
  const qc = useQueryClient()
  const key = ['tc', tcid, 'run-history']

  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const r = await apiFetch(`/api/tc/${encodeURIComponent(tcid)}/run-history`)
      if (!r.ok) throw new Error('실행 이력을 불러오지 못했습니다')
      return (await r.json()) as { history?: Entry[] }
    },
  })

  const delM = useMutation({
    mutationFn: async (idx: number) => {
      const r = await apiFetch(
        `/api/tc/${encodeURIComponent(tcid)}/run-history?idx=${idx}`,
        { method: 'DELETE' },
      )
      if (!r.ok) throw new Error('지우지 못했습니다')
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
  })

  const rows = q.data?.history ?? []

  if (q.isLoading) return <div className="empty">불러오는 중…</div>
  if (q.error) return <div className="load-error">{(q.error as Error).message}</div>

  return (
    <div className="tc-pane">
      <section className="tc-card">
        <div className="tc-card-head">
          <b>실행 이력</b>
          <span className="muted small">{rows.length}건 · 모든 사용자 · 최근 100건</span>
          {rows.length > 0 && (
            <button
              className="btn small danger"
              type="button"
              disabled={delM.isPending}
              onClick={() => {
                if (window.confirm('이 TC 의 실행 이력을 전부 지웁니다. 계속할까요?'))
                  delM.mutate(-1)
              }}
            >
              전체 삭제
            </button>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="empty">
            아직 돌린 적이 없습니다.
            <br />
            <span className="muted small">
              「스텝」 탭의 「▶ 전체」 로 통째로 돌리면 여기 쌓입니다.
            </span>
          </div>
        ) : (
          <div className="th-list">
            <div className="th-row th">
              <span>시각</span>
              <span>사람</span>
              <span>결과</span>
              <span>걸린 시간</span>
              <span>장비</span>
              <span />
            </div>
            {rows.map((h, i) => {
              const pass = Number(h.pass ?? 0)
              const fail = Number(h.fail ?? 0)
              return (
                <div className="th-row" key={`${h.at ?? ''}-${i}`}>
                  <span className="th-at">
                    {(h.at ?? '').slice(0, 16).replace('T', ' ') || '–'}
                  </span>
                  <span>{h.user || '–'}</span>
                  <span>
                    <b className={`status ${fail > 0 ? 'fail' : pass > 0 ? 'pass' : ''}`}>
                      {fail > 0 ? 'FAIL' : pass > 0 ? 'PASS' : '–'}
                    </b>
                    <span className="muted small">
                      {' '}
                      {pass}/{pass + fail}
                    </span>
                  </span>
                  <span className="muted small">{dur(h.sec)}</span>
                  <span className="muted small th-dev" title={(h.sessions ?? []).join(' · ')}>
                    {(h.sessions ?? []).join(' · ') || '–'}
                  </span>
                  <span>
                    <button
                      className="btn small"
                      type="button"
                      disabled={delM.isPending}
                      title="이 줄만 지우기"
                      onClick={() => delM.mutate(i)}
                    >
                      ×
                    </button>
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
