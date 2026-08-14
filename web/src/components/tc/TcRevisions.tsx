import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'

/**
 * 시험 판(버전) 이력 — 저장으로 덮이기 직전의 판들이 전부 남는다.
 *
 * 판을 고르면 그 판으로 되돌린다. 되돌리기 직전의 지금 판도 자동으로
 * 이력에 남으므로, 되돌리기를 되돌릴 수도 있다 — 겁먹을 일이 없다.
 */

interface Rev {
  id: number
  at: string | null
  username: string
  name: string | null
  steps: number
}

export default function TcRevisions({
  tcid,
  onClose,
  onRestored,
}: {
  tcid: string
  onClose: () => void
  onRestored: () => void
}) {
  const q = useQuery({
    queryKey: ['tc-revs', tcid],
    queryFn: async () => {
      const r = await apiFetch(`/api/tc/${encodeURIComponent(tcid)}/revisions`)
      if (!r.ok) throw new Error(`이력을 불러오지 못했습니다 (${r.status})`)
      return ((await r.json()) as { items: Rev[] }).items
    },
  })
  const items = q.data ?? []

  const fmt = (iso: string | null) => (iso ? iso.slice(0, 16).replace('T', ' ') : '–')

  const restore = async (rev: Rev) => {
    if (
      !window.confirm(
        `${fmt(rev.at)} 판(${rev.username || '?'})으로 되돌릴까요?\n지금 판도 이력에 남으니 다시 되돌릴 수 있습니다.`,
      )
    )
      return
    const r = await apiFetch(`/api/tc/${encodeURIComponent(tcid)}/revisions/${rev.id}/restore`, {
      method: 'POST',
    })
    if (!r.ok) {
      window.alert('되돌리지 못했습니다')
      return
    }
    onRestored()
    onClose()
  }

  return (
    <div className="tcrv-ovl" onClick={onClose}>
      <div className="tcrv" onClick={(e) => e.stopPropagation()}>
        <div className="tcrv-h">
          <b>변경 이력 — {tcid}</b>
          <span className="muted small">{items.length ? `${items.length}판` : ''}</span>
          <span className="sp" />
          <button className="btn small" type="button" onClick={onClose}>
            닫기
          </button>
        </div>
        <div className="tcrv-list">
          {q.isLoading ? (
            <div className="empty">불러오는 중…</div>
          ) : items.length === 0 ? (
            <div className="empty">
              아직 지난 판이 없습니다.
              <br />
              <span className="muted small">저장할 때마다 직전 판이 여기 남습니다.</span>
            </div>
          ) : (
            items.map((rev, i) => (
              <div className="tcrv-row" key={rev.id}>
                <span className="tcrv-no">#{items.length - i}</span>
                <span className="tcrv-at">{fmt(rev.at)}</span>
                <span className="tcrv-who">{rev.username || '–'}</span>
                <span className="tcrv-nm" title={rev.name ?? ''}>
                  {rev.name || '(제목 없음)'}
                </span>
                <span className="muted small">스텝 {rev.steps}</span>
                <button className="btn small" type="button" onClick={() => void restore(rev)}>
                  이 판으로
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
