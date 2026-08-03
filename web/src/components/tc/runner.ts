import { apiFetch } from '@/api/client'
import type { Device } from '@/pages/Devices'
import { connParams, CLI_PROTOCOLS, deviceLabel, protocolOf } from './device'
import { evalCond, extractVars, judge, subVars, type Verdict } from './judge'
import { sessionIndex, stepSummary, type TcStep } from './types'

/**
 * 스텝 실행기.
 *
 * 백엔드에는 이미 `/api/session-open` · `/api/run-cli` · `/api/session-close`
 * 가 있다. 여기서 하는 일은 스텝 배열을 그 셋으로 옮기고, 응답을 판정해서
 * 스텝에 되돌려 놓는 것뿐이다.
 *
 * TC Cycle 의 자동 실행(backend/engine.py)과는 다른 길이다. 저쪽은 여러 TC 를
 * 배치로 돌려 PPTX 까지 만들고, 이쪽은 스텝을 쓰면서 그 자리에서 한 줄씩
 * 돌려보는 용도다 — Sequencer 라면 만들면서 바로 돌려보는 것이 요점이다.
 */

export interface RunLog {
  /** 스텝 번호(0-기준). -1 은 실행 전체에 대한 줄 */
  i: number
  text: string
  kind: 'info' | 'pass' | 'fail' | 'skip'
}

export interface RunCtx {
  steps: TcStep[]
  /** `data.sessions` — 자리 번호 → 장비 id */
  sessions: string[]
  devById: Map<string, Device>
  /** 스텝 하나가 끝날 때마다 결과를 화면에 되돌린다 */
  onStep: (i: number, patch: Partial<TcStep>) => void
  /** 지금 어느 줄을 돌고 있는지 */
  onAt: (i: number) => void
  onLog: (line: RunLog) => void
  signal: AbortSignal
}

export interface RunResult {
  pass: number
  fail: number
  /** 실행한 스텝 수 (건너뛴 것 제외) */
  done: number
  stopped: boolean
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((res, rej) => {
    const t = setTimeout(res, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        rej(new DOMException('중지', 'AbortError'))
      },
      { once: true },
    )
  })

async function post(path: string, body: unknown, signal: AbortSignal) {
  const r = await apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  return (await r.json()) as Record<string, unknown>
}

/** 스텝이 쓰는 장비. 자리가 비었거나 없는 장비면 이유를 돌려준다. */
function deviceOf(ctx: RunCtx, step: TcStep): { dev?: Device; error?: string } {
  const k = sessionIndex(step.session)
  if (k < 0) return { error: '세션이 지정되지 않았습니다 — 스텝의 Session 을 고르세요' }
  const id = ctx.sessions[k]
  if (!id) return { error: `S${k + 1} 자리에 장비가 없습니다 — 「+ 세션」 으로 넣으세요` }
  const dev = ctx.devById.get(id)
  if (!dev) return { error: `S${k + 1} 의 장비(${id})가 등록에 없습니다` }
  if (!dev.ip) return { error: `${deviceLabel(dev)} 에 IP 가 없습니다` }
  const proto = protocolOf(dev)
  if (!CLI_PROTOCOLS.includes(proto))
    return { error: `${proto.toUpperCase()} 로는 CLI 세션을 열 수 없습니다` }
  return { dev }
}

/**
 * 이 블록(if · loop)의 몸통이 어디까지인가.
 *
 * 스텝은 한 배열에 순서대로 들어 있고 중첩은 `indent` 로만 나타난다
 * (652스텝이 이 값을 갖고 있다). 여는 줄보다 깊은 동안이 그 블록의 몸통이다.
 */
export function blockEnd(steps: TcStep[], at: number): number {
  const base = Number(steps[at]?.indent ?? 0)
  let j = at + 1
  while (j < steps.length && Number(steps[j]?.indent ?? 0) > base) j++
  return j
}

/**
 * 스텝 하나를 실제로 보낸다.
 *
 * 세션은 `require_session` 으로 연다 — 스텝을 실행할 때마다 새로 접속하면
 * enable 이 풀리고 config 모드도 날아간다. 백엔드가 유휴로 세션을 정리한
 * 경우에만 알아서 다시 잡는다.
 */
async function runOne(
  ctx: RunCtx,
  i: number,
  vars: Record<string, string>,
): Promise<Verdict> {
  const step = ctx.steps[i]
  if (!step) return ''
  const kind = step.kind || 'cli'
  const at = new Date().toISOString()

  if (kind === 'comment' || kind === 'message' || kind === 'model') {
    ctx.onLog({ i, text: stepSummary(step) || '(내용 없음)', kind: 'info' })
    return ''
  }

  if (kind === 'wait') {
    const sec = Math.max(0, Number(step.waitSec ?? 0))
    ctx.onLog({ i, text: `${sec}초 기다림`, kind: 'info' })
    await sleep(Math.min(sec, 600) * 1000, ctx.signal)
    return ''
  }

  const { dev, error } = deviceOf(ctx, step)
  if (!dev) {
    ctx.onStep(i, { output: `[오류] ${error}`, executed_at: at, status: 'FAIL', repeatResult: 'Fail', reason: error })
    ctx.onLog({ i, text: error ?? '실행할 수 없습니다', kind: 'fail' })
    return 'Fail'
  }
  const conn = connParams(dev)

  if (kind === 'connect' || kind === 'disconnect') {
    const path = kind === 'connect' ? '/api/session-open' : '/api/session-close'
    const r = await post(path, kind === 'connect' ? { ...conn, fast: true } : conn, ctx.signal)
    const ok = !!r.ok
    const text = ok
      ? `${deviceLabel(dev)} ${kind === 'connect' ? '접속' : '해제'}${r.prompt ? ` · ${String(r.prompt).trim()}` : ''}`
      : `${deviceLabel(dev)} ${kind === 'connect' ? '접속' : '해제'} 실패 — ${String(r.error ?? '')}`
    ctx.onStep(i, {
      output: String(r.login_log ?? r.error ?? text),
      executed_at: at,
      status: ok ? 'PASS' : 'FAIL',
      repeatResult: ok ? 'Pass' : 'Fail',
      reason: ok ? '' : String(r.error ?? ''),
    })
    ctx.onLog({ i, text, kind: ok ? 'pass' : 'fail' })
    return ok ? 'Pass' : 'Fail'
  }

  // cli · instrument · manual · auto — 명령을 보내는 것들
  const cmdText = subVars(String(step.cli ?? step.data ?? ''), vars)
  const commands = cmdText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  if (commands.length === 0) {
    ctx.onLog({ i, text: '보낼 명령이 없습니다', kind: 'skip' })
    return ''
  }

  const body = { ...conn, commands, repeat: 1, interval: 1, cmd_delay: 100, require_session: true }
  let r = await post('/api/run-cli', body, ctx.signal)
  if (r.no_session) {
    // Connect 스텝 없이 한 줄만 돌려보는 일이 잦다. 세션이 없으면 열고 한 번
    // 더 시도한다 — require_session 을 빼면 매 스텝마다 새로 접속해서
    // enable 도 config 모드도 그때그때 풀린다.
    ctx.onLog({ i, text: `${deviceLabel(dev)} 세션을 엽니다`, kind: 'info' })
    const open = await post('/api/session-open', { ...conn, fast: true }, ctx.signal)
    if (!open.ok) {
      const err = `접속 실패 — ${String(open.error ?? '')}`
      ctx.onStep(i, { output: `[오류] ${err}`, executed_at: at, status: 'FAIL', repeatResult: 'Fail', reason: err })
      ctx.onLog({ i, text: err, kind: 'fail' })
      return 'Fail'
    }
    r = await post('/api/run-cli', body, ctx.signal)
  }

  const outputs = Array.isArray(r.outputs) ? (r.outputs as unknown[]) : []
  const output = outputs.length
    ? outputs
        .map((o) =>
          typeof o === 'string' ? o : String((o as Record<string, unknown>)?.output ?? ''),
        )
        .join('\n')
    : String(r.output ?? r.error ?? '')

  if (!r.ok && !output.trim()) {
    const err = String(r.error ?? '실행 실패')
    ctx.onStep(i, { output: `[오류] ${err}`, executed_at: at, status: 'FAIL', repeatResult: 'Fail', reason: err })
    ctx.onLog({ i, text: err, kind: 'fail' })
    return 'Fail'
  }

  Object.assign(vars, extractVars(step, output))
  const { verdict, reason } = judge(step, output, vars)
  ctx.onStep(i, {
    output,
    executed_at: at,
    status: verdict ? verdict.toUpperCase() : '',
    repeatResult: verdict,
    reason,
  })
  ctx.onLog({
    i,
    text: `${commands[0]}${commands.length > 1 ? ` 외 ${commands.length - 1}` : ''}${reason ? ` — ${reason}` : ''}`,
    kind: verdict === 'Pass' ? 'pass' : verdict === 'Fail' ? 'fail' : 'info',
  })
  return verdict
}

/**
 * 스텝을 순서대로 돌린다.
 *
 * If·Loop 은 `indent` 로 몸통을 잡는다. Switch 는 아직 안 돈다 — 자료에
 * switch 스텝이 없다시피 해서 규칙을 확인할 자료가 없다. 만나면 건너뛰고
 * 그 사실을 로그에 남긴다(조용히 지나가면 안 돈 줄 모른다).
 */
export async function runSteps(ctx: RunCtx, from = 0, only = false): Promise<RunResult> {
  const vars: Record<string, string> = {}
  let pass = 0
  let fail = 0
  let done = 0
  let stopped = false

  const count = (v: Verdict) => {
    if (v === 'Pass') pass++
    else if (v === 'Fail') fail++
    if (v) done++
  }

  const walk = async (start: number, end: number): Promise<void> => {
    let i = start
    while (i < end) {
      if (ctx.signal.aborted) {
        stopped = true
        return
      }
      const s = ctx.steps[i]
      if (!s) break
      ctx.onAt(i)

      if (s.skip) {
        ctx.onLog({ i, text: '건너뜀', kind: 'skip' })
        i = Math.max(i + 1, blockEnd(ctx.steps, i))
        continue
      }

      const kind = s.kind || 'cli'

      if (kind === 'if') {
        const body = blockEnd(ctx.steps, i)
        const yes = evalCond(String(s.condition ?? ''), vars)
        ctx.onLog({ i, text: `조건 ${yes ? '참' : '거짓'} — ${s.condition ?? ''}`, kind: 'info' })
        if (yes) await walk(i + 1, body)
        i = body
        continue
      }

      if (kind === 'loop') {
        const body = blockEnd(ctx.steps, i)
        const from0 = Number(s.forFrom ?? 1)
        const to0 = Number(s.forTo ?? s.loopCount ?? 1)
        const stepBy = Math.max(1, Number(s.forStep ?? 1))
        // 자료에 forFrom/forTo 와 loopCount 두 형태가 있다. 없으면 1회.
        const times =
          s.forFrom !== undefined && s.forTo !== undefined
            ? Math.max(0, Math.floor((to0 - from0) / stepBy) + 1)
            : Math.max(1, Number(s.loopCount ?? 1))
        ctx.onLog({ i, text: `${times}회 반복`, kind: 'info' })
        for (let n = 0; n < Math.min(times, 1000); n++) {
          if (ctx.signal.aborted) break
          if (s.loopVar) vars[s.loopVar] = String(from0 + n * stepBy)
          await walk(i + 1, body)
        }
        i = body
        continue
      }

      if (kind === 'switch') {
        const body = blockEnd(ctx.steps, i)
        ctx.onLog({ i, text: 'Switch 는 아직 실행하지 않습니다 — 통째로 건너뜁니다', kind: 'skip' })
        i = body
        continue
      }

      count(await runOne(ctx, i, vars))
      i++
    }
  }

  try {
    if (only) {
      // 한 줄만 돌릴 때는 블록을 펴지 않는다. If 의 몸통까지 따라가면
      // '이 스텝만' 이라는 말과 어긋난다.
      ctx.onAt(from)
      count(await runOne(ctx, from, vars))
    } else {
      await walk(from, ctx.steps.length)
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') stopped = true
    else throw e
  }
  return { pass, fail, done, stopped }
}
