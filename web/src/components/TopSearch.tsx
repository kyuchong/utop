import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, apiFetch } from '@/api/client'
import { reqLabel } from '@/types'
import type { TestCaseMeta } from '@/types'

interface Hit {
  kind: 'req' | 'tc'
  id: string
  title: string
  sub: string
}

interface Props {
  /** 고른 것으로 옮겨 간다 */
  onGo: (kind: 'req' | 'tc', id: string) => void
}

/**
 * 요구사항 · 시험 통합 찾기.
 *
 * 상단 바에 「Requirement / TC 검색」 이라고 **글자만** 적혀 있었다.
 * 누르면 아무 일도 안 났다.
 *
 * 요구사항 29건 · 시험 89건이면 통째로 받아 두고 화면에서 거르는 것이
 * 맞다. 글자를 칠 때마다 서버에 물으면 느리기만 하고 얻는 것이 없다.
 * 나중에 수백 건이 되면 그때 서버로 옮기면 된다.
 */
export default function TopSearch({ onGo }: Props) {
  const [q, setQ] = useState('')
  const [at, setAt] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  const reqQ = useQuery({
    queryKey: ['reqs'],
    queryFn: ({ signal }) => api.listRequirements(signal),
    staleTime: 60_000,
  })
  const tcQ = useQuery({
    queryKey: ['tcs'],
    queryFn: async () => {
      const r = await apiFetch('/api/tc?meta=1')
      if (!r.ok) throw new Error('시험 목록을 불러오지 못했습니다')
      return (await r.json()) as { tcs: TestCaseMeta[] }
    },
    staleTime: 60_000,
  })

  const hits = useMemo(() => {
    const n = q.trim().toLowerCase()
    if (!n) return []
    const out: Hit[] = []
    for (const r of reqQ.data?.reqs ?? []) {
      const label = reqLabel(r)
      if (`${label} ${r.title ?? ''}`.toLowerCase().includes(n))
        out.push({
          kind: 'req',
          id: r.reqid || r.id || '',
          title: r.title || label,
          sub: label,
        })
      if (out.length >= 40) break
    }
    for (const t of tcQ.data?.tcs ?? []) {
      if (`${t.tcid} ${t.name ?? ''}`.toLowerCase().includes(n))
        out.push({ kind: 'tc', id: t.tcid, title: t.name || t.tcid, sub: t.tcid })
      if (out.length >= 80) break
    }
    return out
  }, [q, reqQ.data, tcQ.data])

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    // Ctrl+K 로 어디서든 연다 — 찾기는 늘 하는 일이라 손이 안 가야 한다
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        boxRef.current?.querySelector('input')?.focus()
        setOpen(true)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', key)
    }
  }, [])

  const go = (h: Hit) => {
    onGo(h.kind, h.id)
    setOpen(false)
    setQ('')
  }

  return (
    <div className="tsr" ref={boxRef}>
      <input
        className="tsr-in"
        value={q}
        placeholder="요구사항 · 시험 찾기   Ctrl+K"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value)
          setAt(0)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setAt((n) => Math.min(n + 1, hits.length - 1))
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault()
            setAt((n) => Math.max(n - 1, 0))
          }
          if (e.key === 'Enter') {
            const h = hits[at]
            if (h) go(h)
          }
        }}
      />
      {open && q.trim() && (
        <div className="tsr-pop">
          {hits.length === 0 ? (
            <div className="empty">찾는 것이 없습니다.</div>
          ) : (
            hits.slice(0, 24).map((h, i) => (
              <button
                key={`${h.kind}-${h.id}`}
                type="button"
                className={`tsr-row${i === at ? ' on' : ''}`}
                onMouseEnter={() => setAt(i)}
                onClick={() => go(h)}
              >
                {/* 어느 쪽에서 찾았는지가 먼저다 — 이름만 보면 요구사항인지
                    시험인지 알 수 없다 */}
                <span className={`tsr-k ${h.kind}`}>{h.kind === 'req' ? '요구' : '시험'}</span>
                <span className="tsr-t">{h.title}</span>
                <span className="tsr-s">{h.sub}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
