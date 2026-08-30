import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'

export interface Lock {
  resource_id: string
  kind?: string
  locked_by: string
  locked_name?: string | null
  cycle_id?: string | null
  /** 어느 플랜에서 쓰는 중인가 — id 만으로는 사람이 못 읽는다(지시) */
  cycle_name?: string | null
  cycle_cid?: string | null
  note?: string | null
  locked_at?: string | null
  stale_sec?: number
}

/** 신호가 이만큼 끊기면 '응답 없음' — 브라우저를 닫고 간 것으로 본다 */
const STALE_SEC = 600

export function useLocks() {
  return useQuery({
    queryKey: ['locks'],
    queryFn: async () => {
      const r = await apiFetch('/api/locks')
      if (!r.ok) throw new Error('점유 현황을 불러오지 못했습니다')
      return (await r.json()) as { locks: Lock[] }
    },
    // 남이 잡거나 푼 것이 늦게 반영되면 같은 장비를 두 사람이 잡는다
    refetchInterval: 15_000,
  })
}

export function fmtTime(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

interface Props {
  resourceId: string
  kind: 'device' | 'instrument'
  lock?: Lock
  /** 지금 로그인한 사람 (내가 잡은 것인지 판단) */
  me?: string
  isAdmin?: boolean
  onMessage?: (kind: string, text: string) => void
}

/**
 * 자원 점유 한 칸.
 *
 * 시험 전에 "이 장비 지금 누가 쓰나" 를 목록에서 바로 본다. 잡기와 해제도
 * 여기서 한다 — 별도 화면으로 빼면 아무도 잡지 않고 그냥 쓴다.
 *
 * 남의 락을 푸는 것은 관리자만 할 수 있게 서버가 막는다. 화면에서도
 * 버튼 이름을 다르게 해서 '내 것 반납' 과 '남의 것 뺏기' 를 구분한다.
 */
export default function LockCell({
  resourceId,
  kind,
  lock,
  me,
  isAdmin,
  onMessage,
}: Props) {
  const qc = useQueryClient()
  const mine = !!lock && !!me && lock.locked_by === me
  const stale = (lock?.stale_sec ?? 0) > STALE_SEC

  const say = (k: string, t: string) => onMessage?.(k, t)

  const acquireM = useMutation({
    mutationFn: async () => {
      const r = await apiFetch('/api/locks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource_id: resourceId, kind }),
      })
      const b = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(b.detail || '잡지 못했습니다')
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['locks'] })
      say('ok', '점유했습니다')
    },
    onError: (e) => say('err', e instanceof Error ? e.message : String(e)),
  })

  const releaseM = useMutation({
    mutationFn: async () => {
      const r = await apiFetch(`/api/locks/${encodeURIComponent(resourceId)}`, {
        method: 'DELETE',
      })
      const b = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(b.detail || '해제하지 못했습니다')
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['locks'] })
      say('ok', '해제했습니다')
    },
    onError: (e) => say('err', e instanceof Error ? e.message : String(e)),
  })

  const busy = acquireM.isPending || releaseM.isPending

  if (!lock) {
    return (
      <span className="lk">
        <span className="status pass">○ 사용 가능</span>
        <button
          className="btn small"
          type="button"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation()
            acquireM.mutate()
          }}
        >
          점유
        </button>
      </span>
    )
  }

  return (
    <span className="lk">
      <span className={`status ${mine ? 'draft' : stale ? 'draft' : 'fail'}`}>
        ● {mine ? '내가 사용 중' : lock.locked_name || lock.locked_by}
      </span>
      <span className="muted small lk-when">
        {fmtTime(lock.locked_at)}
        {/* 어느 시험에서 쓰는 중인가(지시) — 회차 이름이 있으면 그것을 */}
        {lock.cycle_name || lock.cycle_cid || lock.cycle_id ? (
          <b
            className="lk-cyc"
            title={`이 시험에서 쓰는 중입니다 — ${lock.cycle_name || lock.cycle_cid || lock.cycle_id}`}
          >
            {lock.cycle_cid ? `${lock.cycle_cid} · ` : ''}
            {lock.cycle_name || lock.cycle_id}
          </b>
        ) : null}
        {stale ? ' · 응답 없음' : ''}
      </span>
      {(mine || isAdmin) && (
        <button
          className={`btn small${mine ? '' : ' danger'}`}
          type="button"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation()
            if (mine) {
              releaseM.mutate()
              return
            }
            if (
              window.confirm(
                `${lock.locked_name || lock.locked_by} 님이 잡고 있습니다.\n` +
                  '시험 중일 수 있습니다. 해제할까요?',
              )
            )
              releaseM.mutate()
          }}
        >
          {mine ? '반납' : '강제 해제'}
        </button>
      )}
    </span>
  )
}
