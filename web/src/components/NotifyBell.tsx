import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/api/client'
import { goto } from '@/api/goto'
import { onWs } from '@/api/wsBus'
import './NotifyBell.css'

/**
 * 알림 종 — 좌측 메뉴 아래. 서버의 수정 이력(audit_log)을 읽는다.
 *
 * 브라우저에 쌓는 방식이었는데, 그러면 꺼 둔 사이의 일과 남의 브라우저
 * 일이 안 남는다. 이력은 서버가 정본이고(전부 남는다), 웹소켓 소식은
 * 「새 이력이 생겼다」 는 초인종으로만 쓴다. 줄을 누르면 그 시험·
 * 요구사항·사이클로 간다.
 */

interface AuditItem {
  id: number
  at: string | null
  kind: string
  ref_id: string
  action: string
  username: string
}

const SEEN = 'utop.notify.seenid'
const TRACKED = new Set([
  'tc_updated', 'tc_deleted', 'req_updated', 'req_deleted',
  'cycle_updated', 'defect_updated', 'tc_run_history_new',
])

/** 이력 한 줄 → 사람 말 + 눌렀을 때 갈 곳 */
function lineOf(it: AuditItem): { text: string; go?: { kind: string; id: string } } {
  const who = it.username ? ` · ${it.username}` : ''
  const act = it.action || ''
  if (it.kind === 'tc') {
    if (act.startsWith('run'))
      return { text: `실행 — ${it.ref_id}${act.slice(3)}${who}`, go: { kind: 'tc', id: it.ref_id } }
    if (act === 'deleted') return { text: `시험 삭제 — ${it.ref_id}${who}` }
    return { text: `시험 저장 — ${it.ref_id}${who}`, go: { kind: 'tc', id: it.ref_id } }
  }
  if (it.kind === 'req') {
    if (act === 'deleted') return { text: `요구사항 삭제 — ${it.ref_id}${who}` }
    return { text: `요구사항 저장 — ${it.ref_id}${who}`, go: { kind: 'req', id: it.ref_id } }
  }
  if (it.kind === 'cycle')
    return { text: `사이클 저장 — ${it.ref_id}${who}`, go: { kind: 'cycle', id: it.ref_id } }
  if (it.kind === 'defect') return { text: `결함 — ${it.ref_id}${who}` }
  return { text: `${it.kind} ${act} — ${it.ref_id}${who}` }
}

export default function NotifyBell({ collapsed }: { collapsed?: boolean }) {
  const [items, setItems] = useState<AuditItem[]>([])
  const [open, setOpen] = useState(false)
  const [seenId, setSeenId] = useState<number>(() => Number(localStorage.getItem(SEEN) || 0))
  const boxRef = useRef<HTMLDivElement | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const load = async () => {
    try {
      const r = await apiFetch('/api/audit?limit=200')
      if (!r.ok) return
      const b = (await r.json()) as { items?: AuditItem[] }
      setItems(b.items ?? [])
    } catch {
      /* 종은 장식이 아니라도, 못 읽었다고 화면이 죽으면 안 된다 */
    }
  }

  useEffect(() => {
    void load()
    // 소식이 오면 이력을 다시 읽는다 — 몰아치면 한 번만
    return onWs((m) => {
      if (!TRACKED.has(String(m.type ?? ''))) return
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => void load(), 400)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!open || !items.length) return
    const top = items[0]?.id ?? 0
    if (top > seenId) {
      setSeenId(top)
      localStorage.setItem(SEEN, String(top))
    }
  }, [open, items, seenId])

  useEffect(() => {
    if (!open) return
    const off = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', off)
    return () => document.removeEventListener('mousedown', off)
  }, [open])

  const unseen = items.filter((i) => i.id > seenId).length
  const fmt = (iso: string | null) => {
    if (!iso) return ''
    const d = new Date(iso)
    const p = (n: number) => String(n).padStart(2, '0')
    const today = new Date().toDateString() === d.toDateString()
    return today
      ? `${p(d.getHours())}:${p(d.getMinutes())}`
      : `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  }

  return (
    <div className="nb" ref={boxRef}>
      <button
        type="button"
        className={`nb-btn${unseen > 0 ? ' has' : ''}`}
        title="알림 — 수정 이력"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {!collapsed && <span className="nb-label">알림</span>}
        {unseen > 0 && <i className="nb-n">{unseen > 99 ? '99+' : unseen}</i>}
      </button>

      {open && (
        <div className="nb-pop" role="dialog" aria-label="수정 이력">
          <div className="nb-head">
            <b>수정 이력</b>
            <span className="muted small">{items.length ? `최근 ${items.length}건` : ''}</span>
            <span className="sp" />
          </div>
          <div className="nb-list">
            {items.length === 0 ? (
              <div className="nb-empty muted small">
                아직 이력이 없습니다.
                <br />
                저장·삭제·실행이 생기면 서버에 남고 여기 보입니다.
              </div>
            ) : (
              items.map((it) => {
                const L = lineOf(it)
                return (
                  <div
                    className={`nb-row${L.go ? ' go' : ''}${it.id > seenId ? ' new' : ''}`}
                    key={it.id}
                    role={L.go ? 'button' : undefined}
                    tabIndex={L.go ? 0 : undefined}
                    title={L.go ? '눌러서 이동' : undefined}
                    onClick={() => {
                      if (!L.go) return
                      setOpen(false)
                      goto(L.go.kind, L.go.id)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && L.go) {
                        setOpen(false)
                        goto(L.go.kind, L.go.id)
                      }
                    }}
                  >
                    <span className="nb-at">{fmt(it.at)}</span>
                    <span className="nb-tx">{L.text}</span>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
