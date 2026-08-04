import { apiFetch } from '@/api/client'
import type { Device } from '@/pages/Devices'
import { connParams, CLI_PROTOCOLS, deviceLabel, protocolOf } from './device'
import { evalCondWhy, extractVars, judge, subVars, type Verdict } from './judge'
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
  /**
   * 전역 파라미터 — 변수의 시작값.
   *
   * iTest 의 parameter file 에 해당한다. 스텝에 `${포트}` 라고 적어 두면
   * 여기 값이 들어간다. 응답에서 뽑은 변수가 같은 이름이면 그것이 이긴다 —
   * 돌면서 알아낸 값이 미리 적어 둔 값보다 최신이다.
   */
  params?: Record<string, string>
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

/**
 * SSE 를 읽어 오는 대로 넘긴다.
 *
 * cli 와 ping 이 같은 모양으로 받는다 — `{cmd}` `{o}` `{err}` `{done}`.
 * 다 모아 한 번에 보여주면 긴 명령이나 ping 4번 동안 화면이 멈춘 것처럼
 * 보이고, 장비가 느린 건지 걸린 건지 알 수가 없다.
 */
async function readSse(
  path: string,
  body: unknown,
  signal: AbortSignal,
  on: (e: { cmd?: string; o?: string; err?: string; done?: boolean; alive?: boolean }) => void,
): Promise<void> {
  const res = await apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok || !res.body) throw new Error(`스트리밍 실패 (${res.status})`)
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let cut: number
    while ((cut = buf.indexOf('\n\n')) >= 0) {
      const evt = buf.slice(0, cut)
      buf = buf.slice(cut + 2)
      if (!evt.startsWith('data: ')) continue
      try {
        on(JSON.parse(evt.slice(6)))
      } catch {
        /* 깨진 조각은 버린다 — 다음 이벤트가 온다 */
      }
    }
  }
}

/** 화면을 너무 자주 고치지 않게 짧게 모아 내보낸다 */
function throttled(send: (s: string) => void) {
  let last = 0
  return (text: string, force = false) => {
    const now = Date.now()
    if (!force && now - last < 80) return
    last = now
    send(text)
  }
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

  /**
   * 주석 · 메시지 · 모델 — 장비로 아무것도 안 나간다.
   *
   * Comment 는 사람이 읽는 설명이라 실행할 때 아무 일도 하지 않는다.
   * Message 는 실행 로그에 그 글을 찍는다 — 긴 절차에서 '여기부터 2단계'
   * 같은 표시를 남기는 데 쓴다. 그래서 Message 만 ${변수} 를 풀어준다.
   */
  if (kind === 'comment' || kind === 'message' || kind === 'model') {
    const raw = stepSummary(step) || '(내용 없음)'
    const text = kind === 'message' ? subVars(raw, vars) : raw
    ctx.onLog({ i, text, kind: 'info' })
    if (kind === 'message') ctx.onStep(i, { output: text, executed_at: at })
    return ''
  }

  /**
   * 사람이 직접 하는 절차. 장비에 보내지 않는다.
   *
   * 여기 적힌 것은 명령이 아니라 '장비 전원을 내린다' 같은 사람의 일이다.
   * 전에는 이 문장을 CLI 로 그대로 보내고 있었다 — 장비는 못 알아듣고
   * 그 스텝은 늘 실패했다.
   *
   * 실행을 멈추고 묻지도 않는다. 시험 하나에 사람 손이 몇 번 들어가는데
   * 매번 창이 뜨면 자동 실행이 아니게 된다. 대신 판정을 비워 두고, 사람이
   * 나중에 3열에서 합격·불합격을 찍는다.
   */
  if (kind === 'manual') {
    const what = (step.step || step.data || '').trim()
    ctx.onStep(i, { executed_at: at })
    ctx.onLog({ i, text: `사람이 할 일 — ${what || '(내용 없음)'}`, kind: 'skip' })
    return ''
  }

  /**
   * 값 비교 — 두 값을 견주어 합격·불합격을 낸다.
   *
   * If 와 다르다. If 는 갈래를 고를 뿐이라 조건이 거짓이어도 불합격이
   * 아니다. 여기는 '이 값이 저 값과 같아야 한다' 가 곧 시험인 경우다.
   * 장비로는 아무것도 안 나간다.
   */
  if (kind === 'diff') {
    const expr = `${step.cmpLeft ?? ''} ${step.cmpOp || '=='} ${step.cmpRight ?? ''}`
    const { ok, why } = evalCondWhy(expr, vars)
    ctx.onStep(i, {
      output: why,
      reason: why,
      executed_at: at,
      status: ok ? 'PASS' : 'FAIL',
      repeatResult: ok ? 'Pass' : 'Fail',
    })
    ctx.onLog({ i, text: why, kind: ok ? 'pass' : 'fail' })
    return ok ? 'Pass' : 'Fail'
  }

  if (kind === 'wait') {
    const sec = Math.max(0, Number(step.waitSec ?? 0))
    ctx.onLog({ i, text: `${sec}초 기다림`, kind: 'info' })
    await sleep(Math.min(sec, 600) * 1000, ctx.signal)
    return ''
  }

  /**
   * CLI 가 아닌 것들 — ping · SNMP.
   *
   * 세션(CLI 접속)이 없어도 된다. SNMP 만 등록된 장비도 있고, 재부팅
   * 중이라 CLI 가 안 붙는 동안 ping 으로 살아나는지 보는 것이 시험의
   * 내용이기도 하다. 그래서 세션을 강제하지 않고, 대상 IP 만 있으면 된다.
   */
  if (kind === 'ping' || kind === 'snmp_get' || kind === 'snmp_set' || kind === 'snmp_trap') {
    // host 를 직접 적었으면 그것을, 아니면 세션 장비의 IP 를 쓴다
    const sessDev = deviceOf(ctx, step).dev
    const host = (step.host || sessDev?.ip || '').trim()
    if (kind !== 'snmp_trap' && !host) {
      const err = '대상 IP 가 없습니다 — 세션을 고르거나 IP 를 직접 적으세요'
      ctx.onStep(i, { output: `[오류] ${err}`, executed_at: at, status: 'FAIL', repeatResult: 'Fail', reason: err })
      ctx.onLog({ i, text: err, kind: 'fail' })
      return 'Fail'
    }

    const snmp = {
      host,
      oid: subVars(String(step.oid ?? ''), vars),
      community: step.community || undefined,
      version: step.snmpVersion || undefined,
      port: step.snmpPort || undefined,
    }
    // ping 만 스트리밍이다. SNMP 는 한 번 물어 한 번 받는 것이라 나눌 것이
    // 없다. ping 은 1초에 하나씩 나오므로 그때그때 보여야 한다 —
    // 재부팅 시험에서 '언제 살아났나' 가 바로 그 줄에 있다.
    if (kind === 'ping') {
      let acc = ''
      let alive = false
      let perr = ''
      const flush = throttled((s) => ctx.onStep(i, { output: s, executed_at: at }))
      try {
        await readSse('/api/ping-stream', { host, count: step.pingCount ?? 4 }, ctx.signal, (e) => {
          if (e.o != null) {
            acc += e.o
            flush(acc)
          } else if (e.err) perr = e.err
          if (e.done) alive = !!e.alive
        })
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') throw e
        perr = e instanceof Error ? e.message : String(e)
      }
      flush(acc || `[오류] ${perr}`, true)

      Object.assign(vars, extractVars(step, acc))
      const hasCrit = !!String(step.criteria ?? step.expected ?? '').trim()
      const j = hasCrit
        ? judge(step, acc, vars)
        : {
            verdict: (alive ? 'Pass' : 'Fail') as Verdict,
            reason: alive ? '' : perr || '응답 없음',
          }
      ctx.onStep(i, {
        output: acc || `[오류] ${perr}`,
        executed_at: at,
        status: j.verdict ? j.verdict.toUpperCase() : '',
        repeatResult: j.verdict,
        reason: j.reason,
      })
      ctx.onLog({
        i,
        text: `${host} ping${j.reason ? ` — ${j.reason}` : alive ? ' — 응답 있음' : ''}`,
        kind: j.verdict === 'Pass' ? 'pass' : j.verdict === 'Fail' ? 'fail' : 'info',
      })
      return j.verdict
    }

    const [path, body] =
      kind === 'snmp_get'
          ? ['/api/snmp-get', snmp]
          : kind === 'snmp_set'
            ? ['/api/snmp-set', { ...snmp, value: subVars(String(step.snmpValue ?? ''), vars), type: step.snmpType || undefined }]
            : ['/api/snmp-trap/wait', { oid: snmp.oid, timeout: step.trapSec ?? 15 }]

    const r = await post(path as string, body, ctx.signal)
    // Trap 은 output 이 아니라 trap 객체로 온다. 없으면 안 온 것이다.
    const output =
      kind === 'snmp_trap'
        ? r.trap
          ? JSON.stringify(r.trap, null, 2)
          : `[Trap 없음] ${step.trapSec ?? 15}초 동안 오지 않았습니다`
        : String(r.output ?? r.error ?? '')

    Object.assign(vars, extractVars(step, output))
    // 판정기준을 안 적었으면 '됐나 안 됐나' 로 본다 — ping 은 그것만으로
    // 충분한 경우가 대부분이다.
    const hasCriteria = !!String(step.criteria ?? step.expected ?? '').trim()
    const okByItself = kind === 'snmp_trap' ? !!r.trap : !!r.ok
    const j = hasCriteria
      ? judge(step, output, vars)
      : { verdict: (okByItself ? 'Pass' : 'Fail') as Verdict, reason: okByItself ? '' : String(r.error ?? '응답 없음') }

    ctx.onStep(i, {
      output,
      executed_at: at,
      status: j.verdict ? j.verdict.toUpperCase() : '',
      repeatResult: j.verdict,
      reason: j.reason,
    })
    ctx.onLog({
      i,
      text: `${stepSummary(step)}${j.reason ? ` — ${j.reason}` : ''}`,
      kind: j.verdict === 'Pass' ? 'pass' : j.verdict === 'Fail' ? 'fail' : 'info',
    })
    return j.verdict
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
    const out = String(r.login_log ?? r.error ?? '')
    const text = ok
      ? `${deviceLabel(dev)} ${kind === 'connect' ? '접속' : '해제'}${r.prompt ? ` · ${String(r.prompt).trim()}` : ''}`
      : `${deviceLabel(dev)} ${kind === 'connect' ? '접속' : '해제'} 실패 — ${String(r.error ?? '')}`

    /**
     * 판정기준을 적었으면 로그인 로그에도 대 본다.
     *
     * 3열에는 Expected 칸을 띄워 놓고 실행기는 안 보고 있었다 — 적어 둔
     * 기준이 조용히 무시되면 '봤다고 생각한 것' 을 안 보게 된다.
     * 접속 자체가 실패하면 기준을 볼 것도 없이 불합격이다.
     */
    const hasCrit = !!String(step.criteria ?? step.expected ?? '').trim()
    const j =
      ok && hasCrit
        ? judge(step, out || text, vars)
        : { verdict: (ok ? 'Pass' : 'Fail') as Verdict, reason: ok ? '' : String(r.error ?? '') }

    ctx.onStep(i, {
      output: out || text,
      executed_at: at,
      status: j.verdict ? j.verdict.toUpperCase() : '',
      repeatResult: j.verdict,
      reason: j.reason,
    })
    ctx.onLog({
      i,
      text: `${text}${j.reason ? ` — ${j.reason}` : ''}`,
      kind: j.verdict === 'Pass' ? 'pass' : j.verdict === 'Fail' ? 'fail' : 'info',
    })
    return j.verdict
  }

  // cli · instrument · manual · auto — 명령을 보내는 것들
  const cmdText = subVars(String(step.cli ?? step.data ?? ''), vars)
  const commands = cmdText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  if (commands.length === 0) {
    ctx.onLog({ i, text: '보낼 명령이 없습니다', kind: 'skip' })
    return ''
  }

  /**
   * 응답을 SSE 로 받아 오는 대로 그 줄에 쌓는다.
   *
   * 전에는 다 끝난 뒤 한 번에 넣었다. `show running-config` 처럼 긴 명령은
   * 몇 초 동안 화면이 멈춘 것처럼 보이고, 장비가 느리게 뱉는 중인지 아니면
   * 걸린 것인지 알 수가 없었다. 이제 나오는 대로 보인다.
   *
   * 세션은 백엔드가 알아서 잡는다 — `require_session` 이어도 conn 이 없으면
   * `_ensure_conn` 으로 열고, 못 열 때만 err 를 보낸다.
   */
  const body = {
    ...conn,
    commands,
    require_session: true,
    // 프롬프트 뒤 대기. 스텝마다 올릴 수 있다 — reload 처럼 한참 뒤에
    // 뭔가 더 뱉는 명령이 있다.
    ...(step.tailWait !== undefined ? { tail_wait: step.tailWait } : {}),
  }
  let acc = ''
  let err = ''
  const flush = throttled((s) => ctx.onStep(i, { output: s, executed_at: at }))
  /**
   * 방금 명령을 찍었는가.
   *
   * 명령 뒤에 줄을 바꿔 주지 않으면 장비 응답 첫 줄이 명령에 붙는다 —
   * `$ show envTue Aug 04 2026 …` 처럼. 그렇다고 모든 조각에서 앞 빈 줄을
   * 걷어내면 출력 중간의 의미 있는 빈 줄까지 사라진다. 명령 **바로 뒤**
   * 한 번만 걷어낸다.
   */
  let afterCmd = false
  try {
    await readSse('/api/run-cli-stream', body, ctx.signal, (e) => {
      if (e.cmd != null) {
        // 명령이 여러 개면 어디까지 갔는지 보여야 한다
        if (commands.length > 1) ctx.onLog({ i, text: `▸ ${e.cmd}`, kind: 'info' })
        if (acc && !acc.endsWith('\n')) acc += '\n'
        acc += `$ ${e.cmd}\n`
        afterCmd = true
        flush(acc, true)
      } else if (e.o != null) {
        let chunk = e.o
        if (afterCmd) {
          chunk = chunk.replace(/^\r?\n/, '')
          if (chunk !== '') afterCmd = false
        }
        acc += chunk
        flush(acc)
      } else if (e.err) {
        err = e.err
      }
    })
    flush(acc, true)
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    err = e instanceof Error ? e.message : String(e)
  }

  const output = acc
  if (err && !output.trim()) {
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
/**
 * 고른 줄만 돌린다.
 *
 * 블록을 펴지 않는다 — 고른 것이 If 라면 그 조건만 보고 몸통은 안 돈다.
 * '이 줄들만' 이라고 한 뜻이 그것이다. 순서는 화면에 보이는 대로(번호순)
 * 지킨다. 건너뛰기가 걸린 줄은 골랐어도 안 돈다 — 두 표시가 부딪히면
 * '안 돈다' 가 이겨야 안전하다.
 */
export async function runPicked(ctx: RunCtx, pick: number[]): Promise<RunResult> {
  const vars: Record<string, string> = { ...(ctx.params ?? {}) }
  let pass = 0
  let fail = 0
  let done = 0
  let stopped = false

  try {
    for (const i of [...pick].sort((a, b) => a - b)) {
      if (ctx.signal.aborted) {
        stopped = true
        break
      }
      const s = ctx.steps[i]
      if (!s) continue
      ctx.onAt(i)
      if (s.skip) {
        ctx.onLog({ i, text: '건너뜀', kind: 'skip' })
        continue
      }
      const v = await runOne(ctx, i, vars)
      if (v === 'Pass') pass++
      else if (v === 'Fail') fail++
      if (v) done++
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') stopped = true
    else throw e
  }
  return { pass, fail, done, stopped }
}

export async function runSteps(ctx: RunCtx, from = 0, only = false): Promise<RunResult> {
  const vars: Record<string, string> = { ...(ctx.params ?? {}) }
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
        const { ok: yes, why } = evalCondWhy(String(s.condition ?? ''), vars)
        // 무엇과 무엇을 견줘서 그렇게 됐는지 적는다. '조건 참' 만 적혀
        // 있으면 왜 참인지 다시 짚어야 한다.
        //
        // 참·거짓은 판정(status)이 아니라 `condResult` 에 남긴다 — If 는
        // 본래 합격·불합격을 내지 않는다. 다만 줄에 아무 표시도 안 남으면
        // 돌리고 나서도 어느 갈래로 갔는지 모른다.
        const assert = !!s.assertIf
        ctx.onStep(i, {
          condResult: yes ? 'Y' : 'N',
          output: why,
          reason: why,
          executed_at: new Date().toISOString(),
          ...(assert
            ? { status: yes ? 'PASS' : 'FAIL', repeatResult: yes ? 'Pass' : 'Fail' }
            : { status: '', repeatResult: '' }),
        })
        ctx.onLog({
          i,
          text: `조건 ${yes ? '참' : '거짓'} — ${why}`,
          kind: assert ? (yes ? 'pass' : 'fail') : yes ? 'info' : 'skip',
        })
        if (assert) {
          if (yes) pass++
          else fail++
          done++
        }
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
