import { useEffect, useRef, useState } from 'react'
import { onWs, type WsMsg } from '@/api/wsBus'
import './NotifyBell.css'

/**
 * 알림 종 — 좌측 메뉴 아래. 서버가 쏘는 소식(저장·삭제·실행·결함·사이클)을
 * 시간순으로 쌓아 두고, 안 본 개수를 배지로 단다.
 *
 * 접속자 수 세기(presence)·실행 중 터미널 줄(cli-live) 같은 초 단위 소음은
 * 담지 않는다 — 종은 「자리 비운 사이 무슨 일이 있었나」 를 답하는 곳이다.
 */

interface Item {
  at: number
  text: string
}

const STORE = 'utop.notify'
const SEEN = 'utop.notify.seen'
const CAP = 100

/** 서버 소식 → 사람 말. null 이면 종에 안 담는다 */
function textOf(m: WsMsg): string | null {
  const s = (k: string) => String(m[k] ?? '')
  switch (m.type) {
    case 'tc_updated':
      return `시험 저장 — ${s('tcid')}${s('user') ? ` · ${s('user')}` : ''}`
    case 'tc_deleted':
      return `시험 삭제 — ${s('tcid')}`
    case 'req_updated':
      return `요구사항 갱신 — ${s('req_id')}`
    case 'req_deleted':
      return `요구사항 삭제 — ${s('req_id')}`
    case 'cycle_updated':
      return `사이클 갱신${s('user') ? ` — ${s('user')}` : ''}`
    case 'defect_updated':
      return `결함 갱신 — ${s('id')}`
    case 'tc_run_history_new':
      return `실행 끝 — ${s('tcid')} · PASS ${s('pass')} · FAIL ${s('fail')}${
        s('user') ? ` · ${s('user')}` : ''
      }`
    case 'force_reload':
      return `서버가 새로고침을 예약했습니다${s('message') ? ` — ${s('message')}` : ''}`
    case 'stc_start':
      return 'STC 트래픽 시작'
    default:
      return null
  }
}

function load(): Item[] {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) || '[]')
    return Array.isArray(v) ? (v as Item[]) : []
  } catch {
    return []
  }
}

export default function NotifyBell({ collapsed }: { collapsed?: boolean }) {
  const [items, setItems] = useState<Item[]>(load)
  const [open, setOpen] = useState(false)
  const [seenAt, setSeenAt] = useState<number>(() => Number(localStorage.getItem(SEEN) || 0))
  const boxRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    return onWs((m) => {
      const text = textOf(m)
      if (!text) return
      setItems((v) => {
        // 같은 소식이 연달아 오면(일괄 저장 등) 마지막 것만 남긴다
        const last = v[v.length - 1]
        const next =
          last && last.text === text && Date.now() - last.at < 3000
            ? v.slice(0, -1)
            : v
        const out = [...next, { at: Date.now(), text }].slice(-CAP)
        localStorage.setItem(STORE, JSON.stringify(out))
        return out
      })
    })
  }, [])

  // 판을 열면 그 시점까지 본 것으로 친다
  useEffect(() => {
    if (!open) return
    const now = Date.now()
    setSeenAt(now)
    localStorage.setItem(SEEN, String(now))
  }, [open, items.length])

  useEffect(() => {
    if (!open) return
    const off = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', off)
    return () => document.removeEventListener('mousedown', off)
  }, [open])

  const unseen = items.filter((i) => i.at > seenAt).length
  const fmt = (at: number) => {
    const d = new Date(at)
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
        title="알림"
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
        <div className="nb-pop" role="dialog" aria-label="알림 내역">
          <div className="nb-head">
            <b>알림</b>
            <span className="muted small">{items.length ? `${items.length}건` : ''}</span>
            <span className="sp" />
            <button
              type="button"
              className="linkish small"
              disabled={!items.length}
              onClick={() => {
                setItems([])
                localStorage.setItem(STORE, '[]')
              }}
            >
              비우기
            </button>
          </div>
          <div className="nb-list">
            {items.length === 0 ? (
              <div className="nb-empty muted small">
                아직 알림이 없습니다.
                <br />
                저장·실행·결함 같은 일이 생기면 여기 쌓입니다.
              </div>
            ) : (
              [...items].reverse().map((i, k) => (
                <div className="nb-row" key={`${i.at}-${k}`}>
                  <span className="nb-at">{fmt(i.at)}</span>
                  <span className="nb-tx">{i.text}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
