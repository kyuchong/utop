import { apiFetch, setToken } from './api'
import { runSteps, type RunLog } from '@/components/tc/runner'
import type { TcStep } from '@/components/tc/types'
import type { Device } from '@/pages/Devices'

/**
 * 사이클 실행기.
 *
 * 전에는 브라우저가 실행을 붙들고 있었다. 64건을 걸어 놓고 탭을 닫으면
 * 거기서 멈췄고, 자리를 뜰 수가 없었다.
 *
 * 여기서 하는 일은 단순하다 — 줄에 걸린 일감을 하나 집어서, 화면이 하던
 * 것과 **글자 그대로 같은 코드**(`runSteps`)로 돌리고, 진행을 서버에
 * 올린다. 서버가 그것을 보고 있는 사람들에게 뿌린다.
 *
 * 판정기를 파이썬으로 다시 짜지 않은 이유가 이것이다. 두 벌이면 규칙을
 * 고칠 때마다 양쪽을 맞춰야 하고, 어긋나는 순간 같은 시험이 화면마다
 * 다른 결과를 낸다.
 */

const API = (process.env.API_BASE || 'http://api:8000').replace(/\/+$/, '')
const KEY = process.env.RUNNER_KEY || ''
const NAME = process.env.RUNNER_NAME || 'runner'
/** 일감이 없을 때 얼마나 있다가 다시 묻나 */
const IDLE_MS = Number(process.env.RUNNER_IDLE_MS || 2000)
/** 진행을 얼마나 자주 올리나. 너무 잦으면 DB 를 두들기고, 뜸하면 화면이 멎어 보인다 */
const PUSH_MS = Number(process.env.RUNNER_PUSH_MS || 700)

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function log(...a: unknown[]): void {
  console.log(`[runner ${new Date().toISOString().slice(11, 19)}]`, ...a)
}

/** 서버 부르기 — 실행기 전용 자리는 열쇠를 함께 보낸다 */
async function call(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const r = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, key: KEY }),
  })
  if (!r.ok) throw new Error(`${path} → ${r.status} ${await r.text()}`)
  return (await r.json()) as Record<string, unknown>
}

interface Run {
  id: string
  cycle_id: string
  cycle_name?: string
  picked: number[]
  started_by?: string
  total: number
}

interface Item {
  tcid?: string
  name?: string | null
  steps?: unknown[]
  executed_at?: string | null
  executed_by?: string | null
  executed_auto?: boolean
}

/**
 * 진행과 로그를 모아 두었다가 한 번에 올린다.
 *
 * 스텝 하나에 로그가 수십 줄 나온다. 줄마다 부르면 서버가 그만큼 쓰기를
 * 하고, 그 사이 실행이 기다린다. 모아서 보내되 **너무 오래 쥐고 있지는
 * 않는다** — 보고 있는 사람은 지금 무엇이 도는지가 궁금하다.
 */
class Pusher {
  private logs: RunLog[] = []
  private patch: Record<string, unknown> = {}
  private last = 0
  /** 서버가 「멈추라」 고 했나 */
  stop = false

  constructor(private runId: string) {}

  addLog(x: RunLog): void {
    this.logs.push(x)
  }
  set(p: Record<string, unknown>): void {
    Object.assign(this.patch, p)
  }

  /** 때가 됐으면 올린다. `force` 면 무조건 */
  async flush(force = false): Promise<void> {
    const now = Date.now()
    if (!force && now - this.last < PUSH_MS) return
    if (!force && this.logs.length === 0 && Object.keys(this.patch).length === 0) return
    const logs = this.logs.splice(0, this.logs.length)
    const patch = this.patch
    this.patch = {}
    this.last = now
    try {
      const r = await call(`/api/runner/${this.runId}/progress`, { patch, logs })
      if (r.stop) this.stop = true
    } catch (e) {
      // 못 올려도 실행은 계속한다. 다음 번에 같이 올라간다.
      log('진행 올리기 실패', String(e))
      this.logs.unshift(...logs)
    }
  }
}

async function loadDevices(): Promise<Map<string, Device>> {
  const r = await apiFetch('/api/devices2')
  if (!r.ok) throw new Error(`장비 목록 ${r.status}`)
  const j = (await r.json()) as { devices?: Device[] }
  return new Map((j.devices ?? []).map((d) => [d.id, d]))
}

async function doRun(run: Run): Promise<void> {
  log(`집음 ${run.id} — ${run.cycle_name || run.cycle_id} ${run.picked.length}건`)
  const push = new Pusher(run.id)
  const devById = await loadDevices()

  // 사이클을 한 번 읽어 두고, 항목마다 결과를 채운 뒤 통째로 저장한다.
  // 항목마다 저장하면 64건이면 64번 쓰는데, 그 사이 남이 고친 것을
  // 덮어쓸 자리가 그만큼 늘어난다.
  const cr = await apiFetch(`/api/cycle/${encodeURIComponent(run.cycle_id)}`)
  if (!cr.ok) throw new Error(`사이클을 읽지 못했습니다 (${cr.status})`)
  const cycle = (await cr.json()) as Record<string, unknown>
  const all: Item[] = Array.isArray(cycle.items) ? (cycle.items as Item[]) : []

  let n = 0
  let stopped = false

  for (const at of run.picked) {
    await push.flush(true)
    if (push.stop) {
      stopped = true
      break
    }
    const it = all[at]
    if (!it?.tcid) continue

    push.set({ item_at: at, item_name: it.name || it.tcid, step_at: -1, step_count: 0, step_name: '' })
    push.addLog({ i: -1, kind: 'info', text: `▶ ${it.name || it.tcid}` })

    // 절차는 TC 가 갖고 있다. 사이클 항목에 박아 둔 옛 스텝을 쓰면
    // 그동안 TC 를 고친 것이 반영되지 않는다.
    let steps: TcStep[] = []
    let sessions: string[] = []
    try {
      const r = await apiFetch(`/api/tc/${encodeURIComponent(it.tcid)}`)
      if (!r.ok) throw new Error(String(r.status))
      const tc = (await r.json()) as { checks?: TcStep[]; sessions?: unknown }
      steps = (tc.checks ?? []).slice()
      sessions = Array.isArray(tc.sessions) ? (tc.sessions as string[]) : []
    } catch (e) {
      push.addLog({ i: -1, kind: 'fail', text: `${it.tcid} 를 불러오지 못했습니다 (${String(e)})` })
      n++
      push.set({ done: n })
      continue
    }

    push.set({ step_count: steps.length, live_steps: steps })

    // 멈춤은 스텝 사이에서 듣는다. 명령 한복판에서 끊으면 장비 세션이
    // 열린 채로 남는다.
    const ac = new AbortController()
    await runSteps(
      {
        steps,
        sessions,
        devById,
        onStep: (i, patch) => {
          const cur = steps[i]
          if (!cur) return
          steps[i] = { ...cur, ...patch }
          push.set({ live_steps: steps })
          void push.flush()
        },
        onAt: (i) => {
          push.set({
            step_at: i,
            step_name: String(steps[i]?.cli ?? steps[i]?.step ?? '').split('\n')[0] ?? '',
          })
          if (push.stop) ac.abort()
          void push.flush()
        },
        onLog: (line) => {
          push.addLog(line)
          void push.flush()
        },
        signal: ac.signal,
      },
      0,
      false,
    )

    it.steps = steps
    it.executed_at = new Date().toISOString().slice(0, 19).replace('T', ' ')
    it.executed_by = run.started_by || '실행 서버'
    it.executed_auto = true
    n++
    push.set({ done: n, live_steps: steps })
    await push.flush(true)
    if (push.stop) {
      stopped = true
      break
    }
  }

  // 결과 저장. 여기까지 온 것은 어떻게든 남겨야 한다 — 멈췄더라도
  // 그때까지 돈 것은 결과다.
  try {
    const r = await apiFetch(`/api/cycle/${encodeURIComponent(run.cycle_id)}`, {
      method: 'POST',
      body: JSON.stringify({ ...cycle, id: run.cycle_id, items: all }),
    })
    if (!r.ok) throw new Error(String(r.status))
  } catch (e) {
    push.addLog({ i: -1, kind: 'fail', text: `결과를 저장하지 못했습니다 (${String(e)})` })
  }

  push.addLog({
    i: -1,
    kind: 'info',
    text: stopped ? `⏹ 멈췄습니다 (${n}/${run.picked.length})` : `✔ ${n}건 끝`,
  })
  await call(`/api/runner/${run.id}/finish`, {
    status: stopped ? 'stopped' : 'done',
    logs: [{ i: -1, kind: 'info', text: stopped ? `⏹ 멈췄습니다 (${n}/${run.picked.length})` : `✔ ${n}건 끝` }],
  })
  log(`끝 ${run.id} — ${n}/${run.picked.length}${stopped ? ' (멈춤)' : ''}`)
}

async function login(): Promise<void> {
  // 실행기도 사이클·TC 를 읽고 결과를 저장한다 — 사람이 하는 일과 같다.
  // 그래서 인증 길을 따로 파지 않고 보통 토큰을 하나 받아 쓴다.
  const r = await call('/api/runner/login', {})
  setToken(String(r.token || ''))
}

async function main(): Promise<void> {
  if (!KEY) {
    console.error('RUNNER_KEY 가 없습니다. 실행기를 띄우지 않습니다.')
    process.exit(1)
  }
  log(`실행기 시작 — ${NAME} → ${API}`)

  for (;;) {
    try {
      if (!process.env.__LOGGED_IN) {
        await login()
        process.env.__LOGGED_IN = '1'
      }
      const r = await call('/api/runner/claim', { worker: NAME })
      const run = r.run as Run | null
      if (!run) {
        await sleep(IDLE_MS)
        continue
      }
      try {
        await doRun(run)
      } catch (e) {
        log('실행 중 오류', String(e))
        await call(`/api/runner/${run.id}/finish`, {
          status: 'failed',
          error: String(e).slice(0, 500),
          logs: [{ i: -1, kind: 'fail', text: `실행이 멈췄습니다 — ${String(e)}` }],
        }).catch(() => undefined)
      }
    } catch (e) {
      // 토큰이 만료됐거나 API 가 잠깐 내려간 것일 수 있다. 다시 로그인한다.
      log('대기 중 오류', String(e))
      process.env.__LOGGED_IN = ''
      await sleep(IDLE_MS * 2)
    }
  }
}

void main()
