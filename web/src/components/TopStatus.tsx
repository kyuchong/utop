import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { useLocks } from '@/components/LockCell'

interface Props {
  me?: { username?: string; name?: string } | null
}

/**
 * 상단 바의 「지금 랩 사정」.
 *
 * 왼쪽 메뉴가 화면 이동을 맡고 있으니, 위쪽은 **어느 화면에 있든 알아야
 * 하는 것**을 둔다. 지금까지는 글자만 적혀 있고 아무것도 안 했다.
 *
 * 첫 번째가 **내가 잡고 있는 장비**다. 랩 장비는 공용인데, 잡아 놓고
 * 다른 일을 하다 잊는 일이 실제로 생긴다 — 그래서 `resource_lock` 에
 * heartbeat 까지 달아 놓은 것이다. 몇 대 쥐고 있는지가 늘 눈에 있으면
 * 잊지 않고, 여기서 바로 반납할 수 있으면 남을 기다리게 하지 않는다.
 */
export default function TopStatus({ me }: Props) {
  const qc = useQueryClient()
  const lockQ = useLocks()
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  const who = me?.username ?? ''
  const locks = (lockQ.data?.locks ?? []).filter((l) => l.locked_by && l.locked_by === who)
  const others = (lockQ.data?.locks ?? []).length - locks.length

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const t = setTimeout(() => window.addEventListener('mousedown', away), 0)
    window.addEventListener('keydown', esc)
    return () => {
      clearTimeout(t)
      window.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', esc)
    }
  }, [open])

  const release = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiFetch(`/api/locks/${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('반납하지 못했습니다')
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['locks'] }),
  })

  // 안 잡고 있으면 아예 안 그린다 — 「쓰는 장비 없음」 은 정보가 0인
  // 죽은 칩이었다. 잡는 순간 나타나는 쪽이 오히려 눈에 띈다.
  if (locks.length === 0) return null

  return (
    <div className="ts" ref={boxRef}>
      <button
        type="button"
        className={`ts-chip${locks.length ? ' on' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title={locks.length ? '내가 쓰고 있는 장비 — 눌러서 반납' : '지금 쓰는 장비가 없습니다'}
      >
        <span className="ts-dot" aria-hidden="true" />
        {locks.length ? `내 장비 ${locks.length}대` : '쓰는 장비 없음'}
        {/* 남이 몇 대 쥐고 있는지도 함께. 「왜 못 잡지」 를 화면 밖에서
            찾지 않게 한다 */}
        {others > 0 && <i className="ts-others">남 {others}</i>}
      </button>

      {open && (
        <div className="ts-pop">
          <div className="ts-pop-h">
            <b>내가 쓰는 장비</b>
            <span className="muted small">{locks.length}대</span>
          </div>
          {locks.length === 0 ? (
            <div className="empty">잡아 둔 장비가 없습니다.</div>
          ) : (
            locks.map((l) => (
              <div className="ts-row" key={l.resource_id}>
                <span className="ts-id">{l.resource_id}</span>
                {l.note && <span className="muted small">{l.note}</span>}
                <span className="sp" />
                <button
                  className="btn small"
                  type="button"
                  disabled={release.isPending}
                  onClick={() => release.mutate(l.resource_id)}
                >
                  반납
                </button>
              </div>
            ))
          )}
          {others > 0 && (
            <div className="ts-foot">
              다른 사람이 {others}대를 쓰고 있습니다 — 장비 화면에서 누구인지 볼 수 있습니다.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
