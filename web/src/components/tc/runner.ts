import { apiFetch } from '@/api/client'
import type { Device } from '@/pages/Devices'
import { connParams, CLI_PROTOCOLS, deviceLabel, isMeter, meterKind, protocolOf } from './device'
import {
  diffLines,
  diffText,
  evalCondWhy,
  extractVars,
  judge,
  subVars,
  type Verdict,
} from './judge'
import {
  sessionIndex,
  stepResult,
  stepSummary,
  type MeterCfg,
  type MeterStream,
  type StepRound,
  type TcStep,
} from './types'

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
  /**
   * `warn` 은 「돌긴 했는데 네가 바란 대로는 아니다」 다.
   *
   * 빈 반복처럼 실패도 성공도 아닌 것이 있다. info 로 적으면 묻히고
   * fail 로 적으면 안 깨진 시험이 깨진 것이 된다.
   */
  kind: 'info' | 'pass' | 'fail' | 'skip' | 'warn'
}

export interface RunCtx {
  steps: TcStep[]
  /**
   * 계측기 설정 — Traffic 탭이 정한 것.
   *
   * 스텝은 「시작·정지·조회」 만 시키고 무엇을 어떻게 보낼지는 여기 있다.
   * 없으면 스텝이 제 칸으로 한 줄짜리 스트림을 만든다(옛 자료).
   */
  meterCfg?: MeterCfg
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

/** 계측기 통계 한 줄 — 데몬이 주는 이름 그대로 */
export interface MeterStat {
  idx?: number
  tx?: unknown
  rx?: unknown
  txOct?: unknown
  rxOct?: unknown
  txTput?: unknown
  rxTput?: unknown
  loss?: unknown
  latency?: unknown
  misorder?: unknown
  [k: string]: unknown
}

/** 「-」·빈칸·글자가 섞여 온다. 못 읽으면 0 */
function statNum(v: unknown): number {
  const n = Number(String(v ?? '').replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

/**
 * 계측기 통계로 합격·불합격을 낸다.
 *
 * 보는 것은 표의 **Rx Packet Loss** 하나다. 스트림마다 본다 — 둘 중 하나가
 * 통째로 죽어도 합만 보면 「손실 50%」 로 뭉개져 어느 쪽인지 모른다.
 *
 * 이유를 적어 두는 이유: 「Fail」 세 글자만 남기면 나중에 왜 떨어졌는지
 * 알려고 다시 돌려야 하는데, 그때 트래픽은 이미 없다.
 */
export function judgeMeterStats(
  rows: MeterStat[],
  step: TcStep,
): { ok: boolean; reason: string } {
  if (!rows.length) {
    return { ok: false, reason: '통계가 비어 있습니다 — 트래픽을 시작하지 않았거나 스트림이 만들어지지 않았습니다' }
  }
  const cap = step.meterMaxLoss ?? 0
  const bad: string[] = []
  const said: string[] = []
  rows.forEach((r, k) => {
    const name = `스트림 ${(typeof r.idx === 'number' ? r.idx : k) + 1}`
    const tx = statNum(r.tx)
    const rx = statNum(r.rx)
    const loss = statNum(r.loss)
    said.push(`${name}: 보냄 ${tx} · 받음 ${rx} · 손실 ${loss}`)
    if (loss > cap) bad.push(`${name} 손실 ${loss} > 허용 ${cap}`)
  })
  return bad.length
    ? { ok: false, reason: bad.join(' / ') }
    : { ok: true, reason: said.join(' / ') }
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
    const left = subVars(String(step.cmpLeft ?? ''), vars)
    const right = subVars(String(step.cmpRight ?? ''), vars)
    const op = step.cmpOp || '=='
    const multi = left.includes('\n') || right.includes('\n')

    /**
     * 여러 줄이면 줄 단위로 견준다.
     *
     * `running-config` 를 통째로 담아 견주는 것이 이 스텝의 본래 쓸모다.
     * 그때 '같다/다르다' 만 말하면 쓸 수가 없다 — 어느 줄이 다른지 보여야
     * 고칠 데를 안다.
     */
    if (multi && (op === '==' || op === '!=')) {
      const d = diffLines(left, right, step.excludeLines)
      const ok = op === '==' ? d.same : !d.same
      const body = diffText(d)
      const head = d.same
        ? '두 값이 같습니다'
        : `다른 줄 ${d.onlyA.length + d.onlyB.length}개`
      ctx.onStep(i, {
        output: body,
        reason: head,
        executed_at: at,
        status: ok ? 'PASS' : 'FAIL',
        repeatResult: ok ? 'Pass' : 'Fail',
      })
      ctx.onLog({ i, text: head, kind: ok ? 'pass' : 'fail' })
      return ok ? 'Pass' : 'Fail'
    }

    const { ok, why } = evalCondWhy(
      `${step.cmpLeft ?? ''} ${op} ${step.cmpRight ?? ''}`,
      vars,
    )
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

  /**
   * 기다리기.
   *
   * 전에는 통째로 한 번 자고 일어났다. 60초짜리 Wait 를 만나면 화면이
   * 1분 동안 아무 말도 안 해서, 기다리는 중인지 걸린 것인지 알 수가
   * 없었다. **1초씩 세면서 남은 시간을 되돌린다.**
   *
   * 멈춤도 이 김에 듣는다. 통째로 자면 「중지」 를 눌러도 그 60초가
   * 다 갈 때까지 안 멈췄다.
   */
  if (kind === 'wait') {
    const sec = Math.min(Math.max(0, Number(step.waitSec ?? 0)), 600)
    ctx.onLog({ i, text: `${sec}초 기다림`, kind: 'info' })
    for (let left = sec; left > 0; left--) {
      ctx.onStep(i, { waitLeft: left, output: `${sec}초 중 ${left}초 남음` })
      await sleep(1000, ctx.signal)
    }
    // 남은 시간은 지운다 — 안 지우면 다 기다린 줄이 목록에 「1초 남음」 인
    // 채로 남고, 그것이 저장까지 따라간다.
    ctx.onStep(i, { waitLeft: undefined, output: `${sec}초 기다렸습니다`, executed_at: at })
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

  /**
   * 계측기 동작 — N2X·STC 에 시키는 것.
   *
   * 백엔드가 이미 traffic/start·stat·stop·clear·ports 를 데몬 명령으로
   * 옮겨 준다. 여기서는 스텝의 칸을 그 몸통으로 바꿔 보낸다. raw Tcl 은
   * `meterAct` 가 없을 때만(옛 자료) CLI 로 흘려보낸다.
   *
   * 판정은 「통계 읽기」 에서 난다 — 손실이 허용치를 넘으면 불합격.
   * 트래픽이 얼마를 흘렸느냐가 곧 시험 결과인 경우가 그것이다.
   *
   * **이 자리가 아래 `deviceOf` 가드보다 위여야 한다.** 밑에 두었더니
   * 계측기 줄도 그 가드에 먼저 걸려 「S1 자리에 장비가 없습니다 — 「+
   * 세션」 으로 넣으세요」 로 죽었다. 세션 창에는 CLI 장비만 나오니 시키는
   * 대로 할 수도 없다. 계측기는 세션을 안 쓴다 — 가드를 만나기 전에 간다.
   */
  // 옛 자료에는 kind 가 instrument 인데 CLI 를 그대로 담은 줄이 있다.
  // 그 줄은 아래 CLI 길로 보낸다. 그것 말고는 전부 계측기로 다룬다 —
  // 전에는 meterAct 가 비어 있으면(새로 만든 줄이 늘 그렇다) 계측기 길로
  // 못 들어가 「보낼 명령이 없습니다」 로 조용히 건너뛰었다.
  if (kind === 'instrument' && (step.meterAct || !String(step.cli ?? step.data ?? '').trim())) {
    /**
     * 계측기는 **세션에 넣지 않는다.**
     *
     * 세션은 CLI(telnet·ssh)로 붙는 자리다 — 계측기는 그렇게 안 붙는다.
     * 넣어 두면 deviceOf 의 프로토콜 검사에서 막힌다. 그래서 스텝이 들고
     * 있는 주소(step.host)로 **장비 목록에서 직접 찾는다.**
     *
     * 이 찾기가 중요하다. 전에는 세션 장비로 N2X·STC 를 갈랐는데, 세션이
     * 없으면(=늘 없다) 무엇을 골랐든 N2X 로 나갔다 — STC 를 골라도 조용히
     * 엉뚱한 섀시를 두드렸다.
     */
    // 이름을 mcfg 로 둔다 — 아래 STC 가 제 설정을 cfg 로 짓는다
    const mcfg: MeterCfg = ctx.meterCfg ?? {}
    // 섀시는 Traffic 탭이 정한 것이 먼저다. 스텝에 적힌 것은 옛 자료다.
    const host = (mcfg.chassis || step.host || '').trim()
    const meterDev =
      [...ctx.devById.values()].find((d) => (d.ip ?? '').trim() === host && isMeter(d)) ??
      // 스텝에 주소가 없으면 옛 자료다 — 그때는 세션 장비를 본다
      (host ? undefined : deviceOf(ctx, step).dev)
    const server = (host || meterDev?.ip || '').trim()
    /**
     * N2X 세션 이름.
     *
     * 섀시는 동시에 열 수 있는 세션 수가 정해져 있고, **라벨 하나가 세션
     * 하나**다. 전에는 여기서 장비 id(`210.1.2.248`)를 쓰고 화면에서는
     * `utop` 을 써서, 같은 섀시에 두 세션이 열렸다 — 그 다음 시작이
     * 「maximum sessions running」 으로 막혔다. 한 이름으로 통일한다.
     */
    const label = String(mcfg.n2xLabel || 'utop')
    const act = step.meterAct ?? 'traffic_start'

    if (!server) {
      const err = '계측기를 고르지 않았습니다 — 스텝에서 계측기를 정하세요'
      ctx.onStep(i, { output: `[계측기 오류] ${err}`, executed_at: at, status: 'FAIL', repeatResult: 'Fail', reason: err })
      ctx.onLog({ i, text: err, kind: 'fail' })
      return 'Fail'
    }

    /**
     * STC 는 N2X 와 명령 모양이 다르다.
     *
     * N2X 는 «server + streams» 한 벌이면 되지만, STC 는 세션에 포트를 붙이고
     * 스트림을 지은 뒤 generator 를 돌린다(build→start→query→stop). 그래서
     * 경로도 몸통도 갈라 보낸다. 전에는 STC 를 골라도 N2X 로 나가 조용히
     * 엉뚱한 섀시를 두드렸다.
     */
    const isStc = meterKind(meterDev) === 'stc'
    if (isStc) {
      const stcAct: Record<string, string> = {
        ports: 'query',
        traffic_start: 'start',
        traffic_stat: 'query',
        traffic_stop: 'stop',
        traffic_clear: 'close',
      }
      const cfg: Record<string, unknown> = {
        chassis: server,
        restIp: 'localhost',
        restPort: 8888,
        ports: (mcfg.ports?.length
          ? mcfg.ports
          : [step.txPort ?? '', step.rxPort ?? '']
        )
          .map((x) => subVars(String(x), vars))
          .filter(Boolean),
        streams:
          act !== 'traffic_start'
            ? []
            : (mcfg.streams ?? []).filter((x) => x.enabled !== false).length
              ? (mcfg.streams ?? [])
                  .filter((x) => x.enabled !== false)
                  .map((x: MeterStream, n) => ({
                    name: String(x.name ?? `SB_${n + 1}`),
                    src: subVars(String(x.src ?? ''), vars),
                    dst: subVars(String(x.dst ?? ''), vars),
                    count: x.count ?? '1',
                    minByte: x.minByte ?? '64',
                    maxByte: x.maxByte ?? x.minByte ?? '64',
                    byteType: x.byteType ?? 'Fixed',
                    unit: x.unit ?? 'Mbps',
                    rate: x.load ?? '10',
                    srcMac: x.srcMac,
                    dstMac: x.dstMac,
                    srcIp: subVars(String(x.srcIp ?? ''), vars),
                    dstIp: subVars(String(x.dstIp ?? ''), vars),
                    gw: subVars(String(x.gw ?? ''), vars),
                  }))
              : [
                {
                  name: `UTOP_${i + 1}`,
                  src: subVars(step.txPort ?? '', vars),
                  dst: subVars(step.rxPort ?? '', vars),
                  minByte: step.meterSize ?? 64,
                  byteType: 'Fixed',
                  unit: 'fps',
                  rate: step.meterPps ?? 1000,
                  ...(step.meterSrcMac ? { srcMac: subVars(step.meterSrcMac, vars) } : {}),
                  ...(step.meterDstMac ? { dstMac: subVars(step.meterDstMac, vars) } : {}),
                  ...(step.meterSrcIp ? { srcIp: subVars(step.meterSrcIp, vars) } : {}),
                  ...(step.meterDstIp ? { dstIp: subVars(step.meterDstIp, vars) } : {}),
                  ...(step.meterGw ? { gw: subVars(step.meterGw, vars) } : {}),
                },
              ],
      }
      let sj: Record<string, unknown> = {}
      try {
        sj = await post(`/api/stc/meter/${stcAct[act] ?? 'query'}`, { cfg }, ctx.signal)
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e)
        ctx.onStep(i, { output: `[계측기 오류] ${err}`, executed_at: at, status: 'FAIL', repeatResult: 'Fail', reason: err })
        ctx.onLog({ i, text: err, kind: 'fail' })
        return 'Fail'
      }
      const text = String(sj.text ?? '')
      if (act === 'traffic_stat') {
        // stc_meter.py 가 「총 TX n · RX n · 손실 n」 을 찍는다
        const m = /손실\s+(\d+)/.exec(text)
        const loss = m ? Number(m[1]) : 0
        const cap = step.meterMaxLoss ?? 0
        const ok = sj.ok !== false && loss <= cap
        const reason = sj.ok === false ? '통계 실패' : `손실 ${loss}${cap ? ` (허용 ${cap})` : ''}`
        ctx.onStep(i, { output: text, executed_at: at, status: ok ? 'PASS' : 'FAIL', repeatResult: ok ? 'Pass' : 'Fail', reason })
        ctx.onLog({ i, text: `통계 — ${reason}`, kind: ok ? 'pass' : 'fail' })
        return ok ? 'Pass' : 'Fail'
      }
      const ok = sj.ok !== false
      ctx.onStep(i, { output: text, executed_at: at, status: ok ? 'PASS' : '', repeatResult: ok ? 'Pass' : '', reason: ok ? '' : text.slice(0, 200) })
      ctx.onLog({ i, text: `${act} — ${ok ? '보냄' : '실패'}`, kind: ok ? 'info' : 'fail' })
      return ok ? 'Pass' : 'Fail'
    }
    const port = (p: string): { module: string; port: string } => {
      const m = /(\d+)\s*[/\-]\s*(\d+)/.exec(p || '')
      return { module: m?.[1] ?? '101', port: m?.[2] ?? '1' }
    }
    const paths: Record<string, string> = {
      ports: '/api/n2x/ports',
      traffic_start: '/api/n2x/traffic/start',
      traffic_stat: '/api/n2x/traffic/stat',
      traffic_stop: '/api/n2x/traffic/stop',
      traffic_clear: '/api/n2x/traffic/clear',
    }
    /**
     * 포트 확인은 GET 이다.
     *
     * 여기서 POST 로 보내고 있었다. FastAPI 는 405 를 내주는데 그 몸통이
     * `{"detail":"Method Not Allowed"}` 라 `ok` 칸이 없다 — 아래 판정이
     * `ok !== false` 라서 **합격**으로 찍혔다. 계측기에 닿지도 않고 PASS 가
     * 나던 것이 이것이다.
     */
    if (act === 'ports') {
      const q = `/api/n2x/ports?server=${encodeURIComponent(server)}&label=${encodeURIComponent(label)}`
      let jp: Record<string, unknown> = {}
      try {
        const r = await apiFetch(q, { signal: ctx.signal })
        jp = (await r.json()) as Record<string, unknown>
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e)
        ctx.onStep(i, { output: `[계측기 오류] ${err}`, executed_at: at, status: 'FAIL', repeatResult: 'Fail', reason: err })
        ctx.onLog({ i, text: err, kind: 'fail' })
        return 'Fail'
      }
      const okp = jp.ok !== false
      const mods = Array.isArray(jp.modules) ? (jp.modules as unknown[]).length : 0
      const why = okp ? `모듈 ${mods}개` : String(jp.error ?? '포트를 읽지 못했습니다')
      ctx.onStep(i, {
        output: JSON.stringify(jp, null, 2),
        executed_at: at,
        status: okp ? 'PASS' : 'FAIL',
        repeatResult: okp ? 'Pass' : 'Fail',
        reason: why,
      })
      ctx.onLog({ i, text: `포트 확인 — ${why}`, kind: okp ? 'pass' : 'fail' })
      return okp ? 'Pass' : 'Fail'
    }

    const body: Record<string, unknown> = { server, label }
    if (act === 'traffic_start') {
      const tx = port(subVars(step.txPort ?? '', vars))
      const rx = port(subVars(step.rxPort ?? '', vars))
      /**
       * 무엇을 보낼까.
       *
       * Traffic 탭이 스트림을 정해 놓았으면 **그것을 전부** 보낸다 — 스트림이
       * 여럿인 시험(양방향·VLAN 여러 개)이 그래야 돈다. 정해 둔 것이 없으면
       * 스텝의 칸으로 한 줄짜리를 만든다(옛 자료가 그렇게 돌던 방식).
       */
      const on = (mcfg.streams ?? []).filter((x) => x.enabled !== false)
      const clean = (o: Record<string, unknown>) => {
        for (const k of Object.keys(o)) if (o[k] === '' || o[k] == null) delete o[k]
        return o
      }
      /**
       * 프레임을 어떻게 지을까.
       *
       * 데몬은 `proto` 를 안 받으면 `ethernet ipv4 udp` 로 짓는다. L2 시험을
       * 하려는데 IP·UDP 헤더가 붙어 나가고, IP 를 안 적었으니 0.0.0.0 이
       * 실린다 — L2 는 그것을 안 보지만, 시험이 무엇을 보냈는지가 화면과
       * 달라진다.
       *
       *  · L4 를 골랐으면(udp·tcp) 그대로
       *  · 아니면 IP 를 적었을 때만 ipv4
       *  · IP 도 안 적었으면 **ethernet 만** — 그것이 L2 시험이다
       *
       * 게이트웨이는 여기 없다. L2 는 GW 를 안 본다.
       */
      const frameKind = (x: MeterStream): string => {
        const l4 = String(x.l4proto ?? '').trim().toLowerCase()
        if (l4 === 'udp' || l4 === 'tcp') return l4
        const hasIp = !!String(x.srcIp ?? '').trim() || !!String(x.dstIp ?? '').trim()
        return hasIp ? 'ipv4' : 'eth'
      }
      const split = (p: string) => {
        const m = /(\d+)\s*[/\-]\s*(\d+)/.exec(subVars(p || '', vars))
        return { mod: m?.[1] ?? '', port: m?.[2] ?? '' }
      }
      body.streams = on.length
        ? on.map((x: MeterStream) => {
            const a = split(String(x.src ?? ''))
            const b = split(String(x.dst ?? ''))
            return clean({
              txMod: a.mod,
              txPort: a.port,
              rxMod: b.mod,
              rxPort: b.port,
              pps: x.load,
              npkt: x.frameCnt,
              frame: x.minByte,
              proto: frameKind(x),
              srcMac: subVars(String(x.srcMac ?? ''), vars),
              dstMac: subVars(String(x.dstMac ?? ''), vars),
              srcIp: subVars(String(x.srcIp ?? ''), vars),
              dstIp: subVars(String(x.dstIp ?? ''), vars),
            })
          })
        : [
            clean({
              module: tx.module,
              txPort: tx.port,
              rxPort: rx.port,
              pps: step.meterPps ?? 1000,
              size: step.meterSize ?? 64,
              srcMac: subVars(step.meterSrcMac ?? '', vars),
              dstMac: subVars(step.meterDstMac ?? '', vars),
              srcIp: subVars(step.meterSrcIp ?? '', vars),
              dstIp: subVars(step.meterDstIp ?? '', vars),
            }),
          ]
      body.dur = step.meterDur ?? 0
    }
    let j: Record<string, unknown> = {}
    try {
      j = await post(paths[act] ?? '/api/n2x/ping', body, ctx.signal)
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e)
      ctx.onStep(i, { output: `[계측기 오류] ${err}`, executed_at: at, status: 'FAIL', repeatResult: 'Fail', reason: err })
      ctx.onLog({ i, text: err, kind: 'fail' })
      return 'Fail'
    }
    const pretty = JSON.stringify(j, null, 2)
    // 「통계 읽기」 만 합격·불합격을 낸다. 나머지는 시켰다는 기록이다.
    if (act === 'traffic_stat') {
      // 데몬이 주는 칸 이름은 `streams` 다. 전에는 `j.stats` 를 읽어서 늘
      // 빈 배열이었고, 그래서 「받음 0 · 손실 0」 으로 **무조건 합격**했다.
      const rows = (j.streams as MeterStat[]) ?? (j.stats as MeterStat[]) ?? []
      const v = j.ok === false
        ? { ok: false, reason: String(j.error ?? '통계 실패') }
        : judgeMeterStats(rows, step)
      ctx.onStep(i, { output: pretty, executed_at: at, status: v.ok ? 'PASS' : 'FAIL', repeatResult: v.ok ? 'Pass' : 'Fail', reason: v.reason })
      ctx.onLog({ i, text: `통계 — ${v.reason}`, kind: v.ok ? 'pass' : 'fail' })
      return v.ok ? 'Pass' : 'Fail'
    }
    const ok = j.ok !== false
    // 실패인데 status 를 비워 두고 있었다 — 목록에는 「미실행」 으로 남고
    // 로그에만 실패가 찍혀서, 훑으면 안 돈 줄로 보였다.
    ctx.onStep(i, { output: pretty, executed_at: at, status: ok ? 'PASS' : 'FAIL', repeatResult: ok ? 'Pass' : 'Fail', reason: ok ? '' : String(j.error ?? '') })
    ctx.onLog({ i, text: `${act} — ${ok ? '보냄' : String(j.error ?? '실패')}`, kind: ok ? 'info' : 'fail' })
    return ok ? 'Pass' : 'Fail'
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


  // cli · instrument(raw) · manual · auto — 명령을 보내는 것들
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
/**
 * 앞 스텝들이 **지난번에** 뽑아 둔 값을 먼저 깔아 둔다.
 *
 * 한 줄만 돌리면 앞의 CLI 스텝이 이번에 안 돈다. 그래서 `${var1}` 이
 * '그런 변수 없다' 로 남고, 편집 화면에는 '지금은 합격' 이라고 떠 있는데
 * 돌리면 불합격이 나왔다 — 화면과 실행이 서로 다른 값을 보고 있었다.
 *
 * 저장된 응답에 그 스텝의 식을 다시 대 본다. 편집 화면이 미리보기에 쓰는
 * 것과 같은 값이다.
 */
function seedVars(ctx: RunCtx, upto: number, vars: Record<string, string>) {
  for (let i = 0; i < upto && i < ctx.steps.length; i++) {
    const s = ctx.steps[i]
    if (!s) continue
    const out = stepResult(s)
    if (!out) continue
    Object.assign(vars, extractVars(s, out))
  }
}

export async function runPicked(ctx: RunCtx, pick: number[]): Promise<RunResult> {
  const vars: Record<string, string> = { ...(ctx.params ?? {}) }
  // 고른 줄 중 가장 앞엣것보다 앞은 이번에 안 돈다 — 지난 값을 깔아 둔다
  seedVars(ctx, Math.min(...pick, ctx.steps.length), vars)
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

/**
 * 스텝 하나를 돌리고 **얼마나 걸렸는지** 남긴다.
 *
 * 전에는 `executed_at`(언제 시작했나)만 있었다. 그래서 부팅 시험이 40초
 * 걸리던 것이 3분이 돼도 아무도 몰랐다 — 결과는 여전히 Pass 니까.
 * 성능이 무너지는 것은 판정으로 안 잡히고 시간으로 잡힌다.
 *
 * 스텝을 도는 자리가 여기 하나뿐이라, 감싸면 종류에 상관없이 전부 잡힌다.
 */
async function runOneTimed(ctx: RunCtx, i: number, vars: Record<string, string>): Promise<Verdict> {
  const t0 = Date.now()
  try {
    return await runOne(ctx, i, vars)
  } finally {
    ctx.onStep(i, { took_ms: Date.now() - t0 })
  }
}

export async function runSteps(ctx0: RunCtx, from = 0, only = false): Promise<RunResult> {
  /*
   * 스텝에 무엇을 적었는지 우리도 들고 있는다.
   *
   * 반복 안의 스텝은 회차마다 같은 자리에 결과를 덮어쓴다. 그래서 3회
   * 중 2회차만 깨져도 마지막 회차가 덮어서 **결과가 적합**이 됐다.
   * 100번 돌려 3번 깨지는 것을 잡는 게 반복 시험의 목적인데 그것이
   * 통째로 사라진 셈이다.
   *
   * 화면이 `steps` 를 어떻게 들고 있는지는 화면마다 다르다(어떤 곳은
   * 새 배열로 갈아 끼운다). 그러니 여기서 직접 적어 둔다.
   */
  const lastPatch = new Map<number, Partial<TcStep>>()
  const ctx: RunCtx = {
    ...ctx0,
    onStep: (i, patch) => {
      lastPatch.set(i, { ...(lastPatch.get(i) ?? {}), ...patch })
      ctx0.onStep(i, patch)
    },
  }
  const vars: Record<string, string> = { ...(ctx.params ?? {}) }
  // 「여기부터」·「이 스텝만」 이면 앞은 이번에 안 돈다 — 지난 값을 깔아 둔다
  if (from > 0 || only) seedVars(ctx, from, vars)
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
        /*
         * 몸통이 비었으면 그 자리에서 말한다.
         *
         * 반복의 몸통은 **들여쓴 줄**로 정해진다. 들여쓰기를 안 하면 빈
         * 것을 10번 반복하고 아래 줄은 한 번만 돈다 — 그런데 아무 말이
         * 없어서, 10번 돈 줄 알고 결과를 읽게 된다. 조용히 아무것도 안
         * 하는 것이 틀리게 하는 것보다 나쁘다.
         */
        if (body <= i + 1) {
          ctx.onLog({
            i,
            kind: 'warn',
            text: `반복 안에 든 스텝이 없습니다 — 아무것도 ${times}회 돌지 않았습니다. 아래 줄을 「→」 로 들여써서 반복 안에 넣으세요`,
          })
          ctx.onStep(i, { output: '반복 안에 든 스텝이 없습니다', executed_at: new Date().toISOString() })
          i = body
          continue
        }
        ctx.onLog({ i, text: `${times}회 반복`, kind: 'info' })

        /**
         * 회차마다의 결과를 모은다.
         *
         * 마지막 회차가 앞을 덮으면 안 된다 — 3회 중 2회차만 깨져도
         * 그 시험은 깨진 것이다. 깨진 회차의 **출력과 근거**를 그대로
         * 들고 있다가 끝에 되돌려 놓는다. 고칠 사람이 볼 것은 통과한
         * 회차가 아니라 깨진 회차다.
         */
        const tally = new Map<
          number,
          {
            runs: number
            fails: number
            firstFailAt: number
            keep?: Partial<TcStep>
            rounds: StepRound[]
          }
        >()
        /**
         * 회차 출력의 한도 (스텝 하나당 글자 수).
         *
         * 다 남기는 것이 맞다 — 「3회차에 뭐가 나왔더라」 를 못 보면 반복
         * 시험을 왜 하나. 처음엔 통과한 회차를 버리려 했는데, 실제 자료를
         * 재 보니 그럴 이유가 없었다.
         *
         *   스텝 출력 평균 371바이트 · 최대 4KB (506스텝 기준)
         *   지금 가장 큰 사이클 6.6MB · DB 전체 19MB
         *
         * 100회 × 스텝 6개라도 220KB 다. 사이클 한 건이 이미 그 서른 배다.
         * 그래서 한도는 **폭주만 막는 선**으로 둔다 — 평균 크기로 5천 회쯤
         * 되어야 걸리는 값이고, 반복은 1000회에서 이미 잘린다. 사실상
         * 안 걸린다는 뜻이다.
         *
         * 걸리면 통과한 회차부터 버린다. 깨진 회차는 끝까지 들고 있는다 —
         * 고칠 사람이 볼 것은 그쪽이다. 버렸으면 버렸다고 화면에 말한다.
         */
        const OUT_BUDGET = 2_000_000
        const rounds = Math.min(times, 1000)
        for (let n = 0; n < rounds; n++) {
          if (ctx.signal.aborted) break
          if (s.loopVar) vars[s.loopVar] = String(from0 + n * stepBy)
          for (let j = i + 1; j < body; j++) lastPatch.delete(j)
          await walk(i + 1, body)
          for (let j = i + 1; j < body; j++) {
            const got = lastPatch.get(j)
            if (!got) continue
            const t = tally.get(j) ?? { runs: 0, fails: 0, firstFailAt: 0, rounds: [] }
            t.runs++
            const bad = String(got.status ?? '').toUpperCase() === 'FAIL'
            /*
             * 회차마다 한 줄씩 남긴다.
             *
             * 출력은 **깨진 회차와 마지막 회차만**. 100회분을 다 담으면
             * 사이클 한 건이 메가바이트가 되고, 통과한 회차의 출력은
             * 아무도 안 본다.
             */
            t.rounds.push({
              n: n + 1,
              status: String(got.status ?? ''),
              reason: String(got.reason ?? ''),
              took_ms: typeof got.took_ms === 'number' ? got.took_ms : undefined,
              output: String(got.output ?? ''),
            })
            if (bad) {
              t.fails++
              // 처음 깨진 회차의 것만 붙든다. 뒤엣것으로 바꾸면 「몇 회차에
              // 처음 깨졌나」 를 잃는다
              if (!t.keep) {
                t.keep = { ...got }
                t.firstFailAt = n + 1
              }
            }
            tally.set(j, t)
          }
        }

        /**
         * 너무 커지면 통과한 회차의 출력부터 버린다.
         *
         * 깨진 회차와 마지막 회차는 남긴다. 버렸으면 버렸다고 적어야
         * 「출력이 왜 없지」 를 안 헤맨다.
         */
        for (const t of tally.values()) {
          let size = t.rounds.reduce((a, r) => a + (r.output?.length ?? 0), 0)
          if (size <= OUT_BUDGET) continue
          let dropped = 0
          for (let k = 0; k < t.rounds.length - 1 && size > OUT_BUDGET; k++) {
            const r = t.rounds[k]
            if (!r?.output) continue
            if (String(r.status ?? '').toUpperCase() === 'FAIL') continue
            size -= r.output.length
            r.output = ''
            r.trimmed = true
            dropped++
          }
          if (dropped) {
            ctx.onLog({
              i: -1,
              kind: 'warn',
              text: `회차 출력이 너무 커서 통과한 ${dropped}회차의 출력은 남기지 않았습니다 (깨진 회차는 그대로 있습니다)`,
            })
          }
        }

        // 모은 것을 되돌려 놓는다
        for (const [j, t] of tally) {
          if (t.runs <= 1) continue // 한 번만 돈 것은 건드릴 것이 없다
          if (t.fails > 0 && t.keep) {
            ctx.onStep(j, {
              ...t.keep,
              rounds: t.rounds,
              status: 'FAIL',
              repeatResult: 'Fail',
              reason: `${t.runs}회 중 ${t.fails}회 부적합 (처음 ${t.firstFailAt}회차) — ${
                t.keep.reason ?? ''
              }`.trim(),
            })
            ctx.onLog({
              i: j,
              kind: 'fail',
              text: `${t.runs}회 중 ${t.fails}회 부적합 — 처음 깨진 것은 ${t.firstFailAt}회차`,
            })
          } else if (t.fails === 0) {
            const cur = lastPatch.get(j) ?? {}
            ctx.onStep(j, {
              rounds: t.rounds,
              reason: `${t.runs}회 모두 적합${cur.reason ? ` — ${cur.reason}` : ''}`,
            })
          }
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

      count(await runOneTimed(ctx, i, vars))
      i++
    }
  }

  try {
    if (only) {
      // 한 줄만 돌릴 때는 블록을 펴지 않는다. If 의 몸통까지 따라가면
      // '이 스텝만' 이라는 말과 어긋난다.
      ctx.onAt(from)
      count(await runOneTimed(ctx, from, vars))
    } else {
      await walk(from, ctx.steps.length)
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') stopped = true
    else throw e
  }
  return { pass, fail, done, stopped }
}
