import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/api/client'
import { onWs, onWsOpen } from '@/api/wsBus'
import type { RunLog } from '@/components/tc/runner'
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
  /** 이번 항목에서 **여기까지 갔다** — 반복이 되돌아가도 안 줄어드는 표시용 */
  stepTop: number
  stepCount: number
  stepName: string
  /** 지금 도는 항목의 스텝들 — 결과가 차오르는 그대로 */
  liveSteps: TcStep[]
  /** 오간 것 */
  log: RunLog[]
  /** 실행 번호. 없으면 도는 것이 없다 */
  runId: string
  /** 누가 걸었나 */
  who: string
  /** queued | running | done | stopped | failed */
  status: string
  error: string
  /** 실행기가 아직 안 집었다 */
  waiting: boolean
}

const EMPTY: RunState = {
  on: false,
  total: 0,
  done: 0,
  itemAt: -1,
  itemName: '',
  stepAt: -1,
  stepTop: -1,
  stepCount: 0,
  stepName: '',
  liveSteps: [],
  log: [],
  runId: '',
  who: '',
  status: '',
  error: '',
  waiting: false,
}

/** 서버가 들고 있는 실행 한 건 */
interface Run {
  id: string
  cycle_id: string
  status: string
  started_by?: string | null
  total?: number
  done?: number
  item_at?: number
  item_name?: string | null
  step_at?: number
  step_count?: number
  step_name?: string | null
  live_steps?: TcStep[] | null
  error?: string | null
}

interface LogRow {
  seq: number
  i: number
  kind: string
  text: string
}

/** 로그가 무한히 쌓이면 화면이 먹는다. 뒤쪽 이만 줄만 들고 있는다 */
const LOG_CAP = 20000

function fromRun(r: Run, prev: RunState): RunState {
  const live = r.status === 'queued' || r.status === 'running'
  /* 반복·If 건너뛰기는 스텝을 **뒤로** 되돌아가 다시 돈다(runSteps.walk).
     step_at 을 그대로 「스텝 n/m」 에 쓰면 7/9 가 3/9 로 되감겨, 보는 사람은
     실행이 뒷걸음친 줄 안다. 항목 안에서의 **최대값**을 따로 들고 표시는
     이쪽을 쓴다 — 파란 강조(stepAt)는 지금 진짜 도는 줄이라 그대로 둔다. */
  const at = r.step_at ?? -1
  const stepTop =
    r.id !== prev.runId || (r.item_at ?? -1) !== prev.itemAt || at < 0
      ? at
      : Math.max(prev.stepTop, at)
  return {
    ...prev,
    runId: r.id,
    status: r.status,
    who: r.started_by || '',
    on: live,
    waiting: r.status === 'queued',
    total: r.total ?? 0,
    done: r.done ?? 0,
    itemAt: r.item_at ?? -1,
    itemName: r.item_name || '',
    stepAt: at,
    stepTop,
    stepCount: r.step_count ?? 0,
    stepName: r.step_name || '',
    liveSteps: Array.isArray(r.live_steps) ? r.live_steps : prev.liveSteps,
    error: r.error || '',
  }
}

/**
 * 플랜 실행 — 보기만 한다.
 *
 * 전에는 이 자리에서 직접 돌렸다. 그러니 **탭을 닫으면 실행이 멈췄다.**
 * 64건을 걸어 놓고 자리를 뜰 수가 없었고, 실행 서버를 따로 둔 의미도
 * 없었다.
 *
 * 이제 여기서는 일감을 줄에 걸고 손을 뗀다. 돌리는 것은 실행기가 하고,
 * 진행은 WebSocket 으로 온다. 그래서
 *
 *  · 창을 닫아도 계속 돈다
 *  · 다시 열면 지난 로그까지 **처음부터** 다시 받아 그대로 그린다
 *  · 옆 사람 화면도 같이 움직인다 — 누가 돌리는지 보인다
 *
 * 판정기는 그대로 한 벌이다. 실행기가 화면과 **같은** `runner.ts`·`judge.ts`
 * 를 Node 로 돌린다 — 두 벌이면 한 화면에서 적합인 것이 다른 화면에서
 * 부적합이 된다.
 */
export function useCycleRun(cycleId: string) {
  const [st, setSt] = useState<RunState>(EMPTY)
  /** 어디까지 받았나. 이어 받을 때 쓴다 */
  const seenRef = useRef(0)
  const idRef = useRef('')
  idRef.current = st.runId

  /** 서버에서 통째로 다시 읽는다 — 처음 붙을 때와 끊겼다 붙었을 때 */
  const pull = useCallback(async (runId: string, after = 0) => {
    const r = await apiFetch(`/api/runs/${encodeURIComponent(runId)}?after=${after}`)
    if (!r.ok) return
    const j = (await r.json()) as { run: Run; logs: LogRow[] }
    setSt((s) => {
      const base = fromRun(j.run, after === 0 ? { ...EMPTY } : s)
      const rows = (j.logs ?? []).map((x) => ({ i: x.i, kind: x.kind, text: x.text }) as RunLog)
      return { ...base, log: (after === 0 ? rows : [...s.log, ...rows]).slice(-LOG_CAP) }
    })
    const last = (j.logs ?? []).at(-1)
    if (last) seenRef.current = last.seq
  }, [])

  /**
   * 이 플랜의 실행에 붙는다.
   *
   * 도는 것이 있으면 그것에, 없으면 **마지막으로 돈 것**에 붙는다. 잠깐
   * 자리를 비운 사이에 끝났을 수도 있는데, 그때 아무것도 안 보이면
   * 「돌긴 한 건가」 부터 다시 물어야 한다. 무엇이 언제 왜 실패했는지는
   * 끝난 뒤에 보는 것이다.
   */
  const attach = useCallback(async () => {
    if (!cycleId) return
    let cur: Run | undefined
    const live = await apiFetch(`/api/runs?active=1&cycle_id=${encodeURIComponent(cycleId)}`)
    if (live.ok) cur = ((await live.json()) as { runs: Run[] }).runs?.[0]
    if (!cur) {
      const past = await apiFetch(`/api/runs?cycle_id=${encodeURIComponent(cycleId)}`)
      if (past.ok) cur = ((await past.json()) as { runs: Run[] }).runs?.[0]
    }
    if (!cur) return
    seenRef.current = 0
    await pull(cur.id, 0)
  }, [cycleId, pull])

  // 화면을 열 때 · 플랜을 바꿀 때
  useEffect(() => {
    setSt(EMPTY)
    seenRef.current = 0
    void attach()
  }, [attach])

  // 진행 받기
  useEffect(() => {
    const off = onWs((m) => {
      if (m.type !== 'run_progress') return
      const run = m.run as Run | undefined
      if (!run || run.cycle_id !== cycleId) return
      // 내가 보던 것이 아니면(먼저 것이 끝나고 새로 걸렸다) 통째로 다시 읽는다
      if (idRef.current && idRef.current !== run.id) {
        seenRef.current = 0
        void pull(run.id, 0)
        return
      }
      const logs = (m.logs as { i?: number; kind?: string; text?: string }[]) ?? []
      setSt((s) => {
        const base = fromRun(run, s)
        if (!logs.length) return base
        const rows = logs.map((x) => ({ i: x.i ?? -1, kind: x.kind ?? '', text: x.text ?? '' }) as RunLog)
        return { ...base, log: [...s.log, ...rows].slice(-LOG_CAP) }
      })
    })
    // 끊겼다 붙으면 그 사이 것을 놓쳤다. 이어서 받는다.
    const offOpen = onWsOpen(() => {
      if (idRef.current) void pull(idRef.current, seenRef.current)
      else void attach()
    })
    return () => {
      off()
      offOpen()
    }
  }, [cycleId, pull, attach])

  /** 줄에 건다. 돌리는 것은 실행기가 한다 */
  const run = useCallback(
    async (pick: number[]): Promise<string> => {
      const r = await apiFetch('/api/runs', {
        method: 'POST',
        body: JSON.stringify({ cycle_id: cycleId, pick }),
      })
      const j = (await r.json().catch(() => ({}))) as { run?: Run; detail?: string }
      if (!r.ok) return j.detail || `실행을 걸지 못했습니다 (${r.status})`
      if (j.run) {
        seenRef.current = 0
        setSt((s) => ({ ...fromRun(j.run as Run, { ...EMPTY }), log: s.log }))
      }
      return ''
    },
    [cycleId],
  )

  /**
   * 멈춤.
   *
   * 그 자리에서 죽이지 않는다 — 실행기가 스텝 사이에서 보고 스스로
   * 내려와야 장비 세션이 열린 채로 남지 않는다.
   */
  const stop = useCallback(async () => {
    if (!idRef.current) return
    await apiFetch(`/api/runs/${encodeURIComponent(idRef.current)}/stop`, { method: 'POST' })
  }, [])

  return { st, run, stop, clear: () => setSt(EMPTY) }
}
