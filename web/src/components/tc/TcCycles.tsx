import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import './tc.css'

interface Row {
  cycle_id: string
  model?: string
  version?: string
  at?: string
  by?: string
  auto?: boolean
  device?: string
  status?: string
  pass?: number
  fail?: number
  steps?: number
  issues?: number
}

interface Props {
  tcid: string
}

/**
 * 사이클 탭 — 이 TC 가 어느 배포 검증에 들어갔고 결과가 어땠나.
 *
 * 실행 이력과 다른 질문이다. 저쪽은 '이 화면에서 언제 돌렸나'(만드는 동안의
 * 기록)이고, 이쪽은 '어느 릴리스 검증에 들어갔나'(공식 기록)다. 자료도 다른
 * 곳에 있다 — 이력은 파일, 사이클은 DB 다.
 *
 * 줄을 누르면 그 사이클로 넘어가야 하는데, Cycles 화면이 아직 새 UI 로
 * 안 옮겨졌다. 그래서 지금은 넘기지 않고, 대신 넘어가서 볼 만한 것(모델·
 * 버전·장비·스텝 집계)을 이 줄에 다 적어 둔다.
 */
export default function TcCycles({ tcid }: Props) {
  const q = useQuery({
    queryKey: ['tc', tcid, 'cycles'],
    queryFn: async () => {
      const r = await apiFetch(`/api/tc/${encodeURIComponent(tcid)}/cycles`)
      if (!r.ok) throw new Error('사이클을 불러오지 못했습니다')
      return (await r.json()) as { cycles?: Row[] }
    },
  })

  const rows = q.data?.cycles ?? []
  const done = rows.filter((r) => r.status === 'PASS' || r.status === 'FAIL')
  const failed = rows.filter((r) => r.status === 'FAIL').length

  if (q.isLoading) return <div className="empty">불러오는 중…</div>
  if (q.error) return <div className="load-error">{(q.error as Error).message}</div>

  return (
    <div className="tc-pane">
      <section className="tc-card">
        <div className="tc-card-head">
          <b>Cycle</b>
          <span className="muted small">
            {rows.length}개에 들어감
            {done.length > 0 && ` · 실행 ${done.length} · FAIL ${failed}`}
          </span>
        </div>

        {rows.length === 0 ? (
          <div className="empty">
            이 TC 가 들어간 사이클이 없습니다.
            <br />
            <span className="muted small">
              사이클은 배포 검증 단위입니다 — Cycles 화면에서 이 TC 를 담으면 여기 나옵니다.
            </span>
          </div>
        ) : (
          <div className="cy-list">
            <div className="cy-row th">
              <span>사이클</span>
              <span>장비</span>
              <span>실행</span>
              <span>사람</span>
              <span>스텝</span>
              <span>결과</span>
            </div>
            {rows.map((r, i) => (
              <div className="cy-row" key={`${r.cycle_id}-${i}`}>
                <span className="cy-nm">
                  <b>{r.version || '(버전 없음)'}</b>
                  <span className="muted small">{r.model || r.cycle_id}</span>
                </span>
                <span className="muted small">{r.device || '–'}</span>
                <span className="cy-at">
                  {r.at ? r.at.slice(0, 16).replace('T', ' ') : '–'}
                  {/* 손으로 돌렸는지 자동으로 돌렸는지. 결과를 믿을 수 있는
                      정도가 다르다 */}
                  {r.status ? <small>{r.auto ? '자동' : '수동'}</small> : null}
                </span>
                <span className="muted small">{r.by || '–'}</span>
                <span className="muted small">
                  {r.steps ? `${(r.pass ?? 0)}/${r.steps}` : '–'}
                </span>
                <span>
                  {r.status ? (
                    <b className={`status ${r.status.toLowerCase()}`}>{r.status}</b>
                  ) : (
                    <span className="muted small">미실행</span>
                  )}
                  {(r.issues ?? 0) > 0 && <span className="cy-iss">결함 {r.issues}</span>}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="hint">
          줄을 눌러 그 사이클로 넘어가는 것은 Cycles 화면이 새 UI 로 옮겨진 뒤에
          붙습니다. 그때까지 넘어가서 볼 만한 것은 이 줄에 적어 둡니다.
        </div>
      </section>
    </div>
  )
}
