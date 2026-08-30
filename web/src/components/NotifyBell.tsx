import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, apiFetch } from '@/api/client'
import { goto, type GotoKind } from '@/api/goto'
import { onWs } from '@/api/wsBus'
import './NotifyBell.css'

/**
 * 알림 종 — 좌측 메뉴 아래. 서버의 수정 이력(audit_log)을 읽는다.
 *
 * 브라우저에 쌓는 방식이었는데, 그러면 꺼 둔 사이의 일과 남의 브라우저
 * 일이 안 남는다. 이력은 서버가 정본이고(전부 남는다), 웹소켓 소식은
 * 「새 이력이 생겼다」 는 초인종으로만 쓴다. 줄을 누르면 그 시험·
 * 요구사항·플랜로 간다.
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

/** 이력 한 줄 → 사람 말 + 눌렀을 때 갈 곳
 *
 * 이력에 남는 것은 **속 열쇠**(rq-1786536029452-3202)다 — 사람이 읽을 수
 * 없다(지적). 화면에서 목록을 보고 **REQ-2633-0016 제목** 으로 바꿔 찍는다.
 * 누르면 가는 곳은 그대로 속 열쇠를 쓴다.
 */
/**
 * 한 줄을 **칸으로 나눈다**(지시): 언제 · 무엇(결함·플랜…) · ID · 제목.
 *
 * 예전엔 한 문장으로 이어 붙여, 좁은 판에서 두세 줄로 접히고 무엇이 ID 이고
 * 무엇이 제목인지 눈이 짚어야 했다. 칸이 나뉘면 세로로 줄이 맞아, 「결함만
 * 보고 싶다」 를 눈으로 훑을 수 있다.
 */
function lineOf(
  it: AuditItem,
  label?: (kind: string, id: string) => string,
): { kind: string; act: string; id: string; name: string; who: string; go?: { kind: GotoKind; id: string } } {
  const who = it.username || ''
  const nm = label?.(it.kind, it.ref_id) || ''
  const act = it.action || ''
  const base = { id: it.ref_id, name: nm, who }
  if (it.kind === 'tc') {
    if (act.startsWith('run'))
      return { ...base, kind: '실행', act: act.slice(3).trim(), go: { kind: 'tc', id: it.ref_id } }
    if (act === 'deleted') return { ...base, kind: '시험', act: '삭제' }
    return { ...base, kind: '시험', act: '저장', go: { kind: 'tc', id: it.ref_id } }
  }
  if (it.kind === 'req') {
    if (act === 'deleted') return { ...base, kind: '요구사항', act: '삭제' }
    return { ...base, kind: '요구사항', act: '저장', go: { kind: 'req', id: it.ref_id } }
  }
  if (it.kind === 'cycle')
    return { ...base, kind: '플랜', act: '저장', go: { kind: 'cycle', id: it.ref_id } }
  if (it.kind === 'defect') return { ...base, kind: '결함', act: act || '' }
  return { ...base, kind: it.kind, act }
}

export default function NotifyBell({ collapsed }: { collapsed?: boolean }) {
  const [items, setItems] = useState<AuditItem[]>([])
  const [open, setOpen] = useState(false)
  const [seenId, setSeenId] = useState<number>(() => Number(localStorage.getItem(SEEN) || 0))
  const boxRef = useRef<HTMLDivElement | null>(null)

  /* 속 열쇠 → 사람이 읽는 이름. 목록은 화면 어딘가가 이미 받아 두었으므로
     같은 열쇠를 써서 두 번 받지 않는다. */
  const reqQ = useQuery({
    queryKey: ['req', 'list'],
    queryFn: ({ signal }) => api.listRequirements(signal),
    staleTime: 60_000,
  })
  const cycQ = useQuery({
    queryKey: ['cycle', 'meta'],
    queryFn: async () => {
      const r = await apiFetch('/api/cycle?meta=1')
      if (!r.ok) throw new Error('플랜을 불러오지 못했습니다')
      return (await r.json()) as {
        cycles: Array<{ id: string; cid?: string | null; name?: string | null }>
      }
    },
    staleTime: 60_000,
  })
  const labelOf = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of reqQ.data?.reqs ?? []) {
      const pk = String((r as { id?: string }).id ?? '')
      const nm = [String(r.reqid ?? '').trim(), String(r.title ?? '').trim()]
        .filter(Boolean)
        .join(' ')
      if (pk && nm) m.set(`req:${pk}`, nm)
    }
    for (const c of cycQ.data?.cycles ?? []) {
      const nm = [String(c.cid ?? '').trim(), String(c.name ?? '').trim()]
        .filter(Boolean)
        .join(' · ')
      if (c.id && nm) m.set(`cycle:${c.id}`, nm)
    }
    return (kind: string, id: string) => m.get(`${kind}:${id}`) || ''
  }, [reqQ.data, cycQ.data])
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
                const L = lineOf(it, labelOf)
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
                    <span className={`nb-kind k-${it.kind}`}>{L.kind}</span>
                    <span className="nb-act" title={L.act}>
                      {L.act}
                    </span>
                    <span className="nb-id" title={L.id}>
                      {L.id}
                    </span>
                    <span className="nb-nm" title={L.name}>
                      {L.name}
                    </span>
                    <span className="nb-who">{L.who}</span>
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
