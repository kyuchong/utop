import { useCallback, useRef, useState } from 'react'
import { apiFetch } from '@/api/client'
import type { Device } from '@/pages/Devices'
import { runSteps, type RunLog } from '@/components/tc/runner'
import type { TcStep } from '@/components/tc/types'

/** 지금 무엇이 돌고 있나 — 화면이 그대로 그린다 */
export interface RunState {
  on: boolean
  /** 이번에 돌릴 항목 수 */
  total: number
  /** 끝낸 항목 수 */
  done: number
  /** 지금 항목 */
  itemAt: number
  itemName: string
  /** 지금 스텝 (0부터) */
  stepAt: number
  stepCount: number
  stepName: string
  /**
   * 오간 것.
   *
   * iTest 가 좋은 점이 실행 진행이 다 보이는 것이다. 스텝이 끝나야 결과가
   * 툭 튀어나오면 멈춘 것인지 도는 것인지 알 수 없다. 명령을 보낸 것,
   * 받고 있는 것, 판정한 것을 줄줄이 남긴다.
   */
  log: RunLog[]
}

const EMPTY: RunState = {
  on: false,
  total: 0,
  done: 0,
  itemAt: -1,
  itemName: '',
  stepAt: -1,
  stepCount: 0,
  stepName: '',
  log: [],
}

/** 사이클 항목 — 실행하면 steps 가 채워진다 */
export interface RunItem {
  tcid?: string
  name?: string | null
  steps?: unknown[]
  executed_at?: string | null
  executed_by?: string | null
  executed_auto?: boolean
}

interface TcFull {
  checks?: TcStep[]
  sessions?: unknown
}

/** 로그가 무한히 쌓이면 화면이 먹는다. 뒤쪽 이만 줄만 들고 있는다 */
const LOG_CAP = 20000

/**
 * 사이클 실행.
 *
 * TC 화면에 이미 만든 실행기(`runSteps`)를 그대로 쓴다. 스트리밍·판정·변수
 * 규칙이 한 곳에만 있어야 한 화면에서 적합인 것이 다른 화면에서 부적합이
 * 되는 일이 없다.
 *
 * 옛 백엔드에 `/api/cycle/{id}/run` 이 있지만 파일 기반이라(`CYCLE_DIR`)
 * DB 로 옮긴 지금은 돌지 않는다. 되살리는 것보다 실행기를 한 벌 쓰는 것이
 * 맞다.
 */
export function useCycleRun(devices: Device[]) {
  const [st, setSt] = useState<RunState>(EMPTY)
  const abortRef = useRef<AbortController | null>(null)

  const stop = useCallback(() => {
    abortRef.current?.abort()
    setSt((s) => ({ ...s, on: false }))
  }, [])

  const run = useCallback(
    async (cycleId: string, items: RunItem[], pick: number[], who: string) => {
      if (!pick.length) return
      const ac = new AbortController()
      abortRef.current = ac
      const devById = new Map(devices.map((d) => [d.id, d]))
      const push = (line: RunLog) =>
        setSt((s) => ({ ...s, log: [...s.log, line].slice(-LOG_CAP) }))

      setSt({ ...EMPTY, on: true, total: pick.length })

      // 사이클 전체를 한 번 읽어 두고, 항목마다 결과를 채운 뒤 통째로 저장한다.
      // 항목마다 저장하면 64건이면 64번 쓰는데, 그 사이에 남이 고친 것을
      // 덮어쓸 자리가 그만큼 늘어난다.
      let cycle: Record<string, unknown> = {}
      try {
        const r = await apiFetch(`/api/cycle/${encodeURIComponent(cycleId)}`)
        if (r.ok) cycle = (await r.json()) as Record<string, unknown>
      } catch {
        // 못 읽으면 아래에서 items 만 가지고 간다
      }
      const all = (Array.isArray(cycle.items) ? (cycle.items as RunItem[]) : items).slice()

      let n = 0
      for (const at of pick) {
        if (ac.signal.aborted) break
        const it = all[at]
        if (!it?.tcid) continue

        setSt((s) => ({
          ...s,
          itemAt: at,
          itemName: it.name || it.tcid || '',
          stepAt: -1,
          stepCount: 0,
          stepName: '',
        }))
        push({ i: -1, kind: 'info', text: `▶ ${it.name || it.tcid}` })

        // 절차는 TC 가 갖고 있다. 사이클 항목에 박아 둔 옛 스텝을 쓰면
        // 그동안 TC 를 고친 것이 반영되지 않는다.
        let tc: TcFull = {}
        try {
          const r = await apiFetch(`/api/tc/${encodeURIComponent(it.tcid)}`)
          if (!r.ok) throw new Error(String(r.status))
          tc = (await r.json()) as TcFull
        } catch {
          push({ i: -1, kind: 'fail', text: `${it.tcid} 를 불러오지 못했습니다` })
          n++
          setSt((s) => ({ ...s, done: n }))
          continue
        }

        const steps = (tc.checks ?? []).slice()
        const sessions = Array.isArray(tc.sessions) ? (tc.sessions as string[]) : []
        setSt((s) => ({ ...s, stepCount: steps.length }))

        await runSteps(
          {
            steps,
            sessions,
            devById,
            onStep: (i, patch) => {
              const cur = steps[i]
              if (cur) steps[i] = { ...cur, ...patch }
            },
            onAt: (i) =>
              setSt((s) => ({
                ...s,
                stepAt: i,
                stepName: String(steps[i]?.cli ?? steps[i]?.step ?? '').split('\n')[0] ?? '',
              })),
            onLog: push,
            signal: ac.signal,
          },
          0,
          false,
        )

        // 결과를 항목에 옮겨 담는다
        it.steps = steps
        it.executed_at = new Date().toISOString().slice(0, 19).replace('T', ' ')
        it.executed_by = who
        it.executed_auto = true
        n++
        setSt((s) => ({ ...s, done: n }))
      }

      try {
        await apiFetch(`/api/cycle/${encodeURIComponent(cycleId)}`, {
          method: 'POST',
          body: JSON.stringify({ ...cycle, id: cycleId, items: all }),
        })
      } catch {
        push({ i: -1, kind: 'fail', text: '결과를 저장하지 못했습니다' })
      }

      push({
        i: -1,
        kind: 'info',
        text: ac.signal.aborted ? `⏹ 멈췄습니다 (${n}/${pick.length})` : `✔ ${n}건 끝`,
      })
      setSt((s) => ({ ...s, on: false, itemAt: -1, stepAt: -1 }))
    },
    [devices],
  )

  return { st, run, stop, clear: () => setSt(EMPTY) }
}
