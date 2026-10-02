import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { goto } from '@/api/goto'
import './RunBusy.css'

/**
 * 실행을 **누르기 전에** 「장비 사용중」 을 보인다(지시).
 *
 * 여태는 실행을 누르고서야 서버가 막으며 알림창이 떴다. 이 사이클이 쓰는 장비를
 * 다른 사이클이 쓰고 있으면 실행 단추가 회색 「● 장비 사용중」 으로 바뀌고, 마우스를
 * 올리면(누르면 고정) 어느 장비가 어느 사이클에서 누구에게 언제부터 쓰이는지 보인다.
 * 판단은 서버(/api/run-precheck)가 실행 걸기와 **같은 규칙**으로 한다 — 화면이 따로
 * 판단하면 둘이 어긋난다. 10초마다 다시 본다. 이름은 rbz- 로(겹치면 남의 화면이 망가진다).
 */
export interface RunBusyLine {
  resource_id: string
  cycle_id?: string | null
  cycle_name?: string | null
  running?: boolean
  locked_by?: string | null
  locked_name?: string | null
  locked_at?: string | null
  /** 이 장비를 쓰는 항목들 — 단추마다(전체·고른 것) 따로 가린다 */
  tcids?: string[]
}

export function useRunBusy(cycleId: string, tcids: string[]) {
  const key = tcids.join(',')
  return useQuery({
    queryKey: ['run-busy', cycleId, key],
    enabled: !!cycleId && tcids.length > 0,
    queryFn: async () => {
      const r = await apiFetch(
        `/api/run-precheck?cycle_id=${encodeURIComponent(cycleId)}&pick=${encodeURIComponent(key)}`,
      )
      if (!r.ok) return [] as RunBusyLine[]
      return (((await r.json()) as { blocked?: RunBusyLine[] }).blocked ?? []) as RunBusyLine[]
    },
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  })
}

/** 이 항목들 가운데 하나라도 쓰는 막힌 장비만 */
export function busyFor(lines: RunBusyLine[] | undefined, tcids: Iterable<string>): RunBusyLine[] {
  const want = new Set(tcids)
  return (lines ?? []).filter((l) => !(l.tcids ?? []).length || (l.tcids ?? []).some((t) => want.has(t)))
}

const hhmm = (iso?: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  const today = new Date().toDateString() === d.toDateString()
  return today ? `${p(d.getHours())}:${p(d.getMinutes())}` : `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 실행 단추 대신 서는 「● 장비 사용중」 — 올리면 까닭, 누르면 고정(사이클로 가는 링크) */
export function RunBusyButton({ lines, small = true, round = false }: { lines: RunBusyLine[]; small?: boolean; round?: boolean }) {
  const [pin, setPin] = useState(false)
  const boxRef = useRef<HTMLSpanElement | null>(null)
  useEffect(() => {
    if (!pin) return
    const off = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setPin(false)
    }
    document.addEventListener('mousedown', off)
    return () => document.removeEventListener('mousedown', off)
  }, [pin])
  const head = useMemo(
    () => `다른 사이클이 쓰고 있는 장비가 있어 지금은 실행할 수 없습니다 (${lines.length}대)`,
    [lines.length],
  )
  return (
    <span ref={boxRef} className={`rbz${pin ? ' pin' : ''}`}>
      <button
        type="button"
        className={`rbz-btn${small ? ' small' : ''}${round ? ' round' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={pin}
        aria-label={head}
        onClick={() => setPin((v) => !v)}
      >
        <i className="rbz-dot" aria-hidden="true" />
        {!round && '장비 사용중'}
      </button>
      <span className="rbz-tip" role="dialog" aria-label="사용 중인 장비">
        <b>{head}</b>
        {lines.map((l) => (
          <span className="rbz-row" key={l.resource_id}>
            <span className="rbz-dev">{l.resource_id}</span>
            <span className="rbz-what">
              {l.cycle_name ? (
                <>
                  「{l.cycle_name}」 에서 {l.running ? '실행 중' : '점유 중'}
                </>
              ) : (
                '직접 점유'
              )}
              <em>
                {' '}
                ({l.locked_name || l.locked_by || '누군가'}
                {hhmm(l.locked_at) ? ` · ${hhmm(l.locked_at)}부터` : ''})
              </em>
            </span>
            {l.cycle_id && (
              <button
                type="button"
                className="rbz-go"
                onClick={() => {
                  setPin(false)
                  goto('cycle', String(l.cycle_id))
                }}
              >
                그 사이클로 가기
              </button>
            )}
          </span>
        ))}
        <span className="rbz-foot">그 사이클이 끝나거나 멈추면 이 단추가 저절로 「실행」 으로 돌아옵니다.</span>
      </span>
    </span>
  )
}
