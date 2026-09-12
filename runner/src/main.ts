import { apiFetch, setToken } from './api'
import { runSteps, type RunLog } from '@/components/tc/runner'
import { isManualStep, sessionIndex, type MeterCfg, type TcStep } from '@/components/tc/types'
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
/* 모아 두는 시간. 700ms 는 **한 묶음이 통째로 튀어나오게** 했다 —
   회차가 150ms 마다 도니 다섯 회차가 한꺼번에 올라온다(지적: 한 번에 팍).
   200ms 면 회차마다 한 번꼴이라 한 줄씩 올라오는 것으로 보인다. */
const PUSH_MS = Number(process.env.RUNNER_PUSH_MS || 200)

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
  /* tcid 가 정본(지적: 자리번호는 사이클 재정렬에 뒤틀린다) — 옛 큐의 숫자도 받는다 */
  picked: Array<number | string>
  started_by?: string
  total: number
  /** 이 일감이 매인 실행 기록. 회차 기록을 여기에 매단다 */
  plan_run_id?: string | null
  /** **몇 회차인가.** 일감 하나가 한 회차다 — 「다시 실행」 은 지난 회차를
   *  덮지 않고 그 다음 번호로 쌓인다. 서버가 걸 때 정해 준다 */
  round?: number | null
}

interface Item {
  tcid?: string
  name?: string | null
  /** 사람이 손으로 정한 결과. 자동 실행이 다시 돌면 지운다 */
  result?: string | null
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
  private logs: Array<RunLog & { at: number; ts: string }> = []
  private patch: Record<string, unknown> = {}
  private last = 0
  /**
   * 지금 몇 번째 항목인가.
   *
   * 로그에 스텝 번호만 있으면 64건짜리 사이클에서 「3번 스텝」 이 어느
   * 항목의 3번인지 모른다. 나중에 로그를 그 항목 밑에 붙이려면 필요하다.
   */
  private at = -1
  /** 서버가 「멈추라」 고 했나 */
  stop = false

  constructor(private runId: string) {}

  itemAt(n: number): void {
    this.at = n
  }
  addLog(x0: RunLog): void {
    /* 서버 로그 표에는 **앞말(label) 칸이 없다** — 붙여서 한 줄로 보낸다.
       안 그러면 「비교 결과」 가 Cycles 쪽에서만 사라진다(지적: 시험 항목
       로그와 다르다). */
    const lb = String((x0 as { label?: string }).label ?? '').trim()
    const x: RunLog = lb ? { ...x0, text: `${lb} ${String(x0.text ?? '')}`, label: undefined } : x0
    /* 같은 `tick` 을 단 줄은 **앞엣것을 갈아 끼운다** — 화면(RunLog)이 하는
       것과 같다. 안 하면 「▸ show system」 과 그 결과가 두 줄로 남아,
       시험 항목 로그는 한 줄인데 실행 이벤트만 두 줄이 된다(지적).
       맨 끝 줄일 때만 바꾼다: 사이에 다른 줄이 끼었으면 딴 사건이다. */
    if (x.tick) {
      const last = this.logs[this.logs.length - 1]
      if (last && last.tick === x.tick && last.i === x.i) {
        this.logs[this.logs.length - 1] = { ...last, ...x, at: this.at, ts: new Date().toISOString() }
        return
      }
    }
    /* **줄이 생긴 그때**를 함께 싣는다(지시: 실시간 라이브처럼 보여야 한다).
       안 실으면 서버에 닿은 시각이 찍혀, 한 묶음이 통째로 같은 시각이 된다 —
       20 회가 모두 같은 초로 보이던 것이 이것이다(지적). */
    this.logs.push({ ...x, at: this.at, ts: new Date().toISOString() })
  }
  set(p: Record<string, unknown>): void {
    Object.assign(this.patch, p)
  }

  /** 올리는 중인 것 — 겹쳐 부르지 못하게 한 줄로 세운다 */
  private flying: Promise<void> = Promise.resolve()

  /**
   * 때가 됐으면 올린다. `force` 면 무조건.
   *
   * **겹쳐 부르면 줄이 사라진다.** 서버는 seq 를 `max(seq) + n` 으로 매기고
   * `ON CONFLICT DO NOTHING` 으로 넣는다 — 두 번이 동시에 들어오면 둘 다
   * 같은 max 를 읽어 같은 번호를 만들고, 뒤엣것이 통째로 버려진다.
   * `onLog` 마다 await 없이 부르고 있어 실제로 겹쳤다(지적: 실행 이벤트에
   * 안 나오는 로그가 있다).
   */
  async flush(force = false): Promise<void> {
    const mine = this.flying.then(() => this.flush1(force)).catch(() => {})
    this.flying = mine
    await mine
  }

  private async flush1(force: boolean): Promise<void> {
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

/**
 * 전역 파라미터의 활성 값 — 화면(useGlobalParams)과 같은 규칙.
 *
 * 이것이 빠져서 같은 TC 가 화면에서는 합격, 사이클 실행에서는 부적합이었다
 * — 판정기준의 `${Model_Name}` 이 값으로 안 바뀌고 글자 그대로 견줘졌다.
 * 규칙: 활성 목록(__active__)의 파일이 순서대로 쌓이고 뒤가 앞을 덮는다.
 * 파일이 include(__includes__)한 파일이 먼저 깔린다. 활성 표가 없으면
 * 공통(__global__)만.
 */
async function loadGlobalParams(): Promise<Record<string, string>> {
  const values: Record<string, string> = {}
  try {
    const r = await apiFetch('/api/global-params')
    if (!r.ok) return values
    const data = (await r.json()) as Record<string, unknown>
    const activeRaw = data['__active__']
    const files = Array.isArray(activeRaw)
      ? (activeRaw as string[])
      : '__global__' in data
        ? ['__global__']
        : []
    const incOf = (f: string): string[] => {
      const m = (data['__includes__'] ?? {}) as Record<string, unknown>
      const v = m[f]
      return Array.isArray(v) ? (v as string[]) : []
    }
    const take = (k: string) => {
      const v = data[k]
      if (!Array.isArray(v)) return
      for (const p of v as Array<{ name?: string; value?: string }>) {
        const name = (p.name || '').trim()
        if (name) values[name] = p.value ?? ''
      }
    }
    const walk = (k: string, seen: Set<string>) => {
      if (seen.has(k)) return
      seen.add(k)
      for (const inc of incOf(k)) walk(inc, seen)
      take(k)
    }
    const seen = new Set<string>()
    for (const f of files) walk(f, seen)
  } catch (e) {
    // 파라미터를 못 읽어도 실행은 계속한다 — 값 없는 ${이름} 은 글자로 남는다
    log('전역 파라미터 읽기 실패', String(e))
  }
  return values
}

async function doRun(run: Run): Promise<void> {
  log(`집음 ${run.id} — ${run.cycle_name || run.cycle_id} ${run.picked.length}건`)
  const push = new Pusher(run.id)
  const devById = await loadDevices()
  // 스텝의 ${이름} 이 여기서 값을 얻는다 — TC 화면의 ctx.params 와 같은 자리
  const gparams = await loadGlobalParams()

  // 사이클을 한 번 읽어 두고, 항목마다 결과를 채운 뒤 통째로 저장한다.
  // 항목마다 저장하면 64건이면 64번 쓰는데, 그 사이 남이 고친 것을
  // 덮어쓸 자리가 그만큼 늘어난다.
  const cr = await apiFetch(`/api/cycle/${encodeURIComponent(run.cycle_id)}`)
  if (!cr.ok) throw new Error(`사이클을 읽지 못했습니다 (${cr.status})`)
  const cycle = (await cr.json()) as Record<string, unknown>
  const all: Item[] = Array.isArray(cycle.items) ? (cycle.items as Item[]) : []

  let n = 0
  let stopped = false

  // 지금까지의 결과를 통째로 저장한다. 항목마다 부르므로 실패해도 로그만
  // 남기고 계속 돈다 — 저장 한 번 실패가 실행을 멈추게 하지 않는다.
  const saveAll = async (): Promise<void> => {
    try {
      const r = await apiFetch(`/api/cycle/${encodeURIComponent(run.cycle_id)}`, {
        method: 'POST',
        body: JSON.stringify({ ...cycle, id: run.cycle_id, items: all }),
      })
      if (!r.ok) throw new Error(String(r.status))
    } catch (e) {
      push.addLog({ i: -1, kind: 'fail', text: `결과를 저장하지 못했습니다 (${String(e)})` })
    }
  }

  /** 이 항목이 **이 회차에** 남긴 결과.
   *
   * 위 saveAll 은 사이클 문서에 덮어쓴다 — 한 벌뿐이라 다시 돌리면 지난
   * 회차가 그 자리에서 사라진다(지적: 회차 표시는 되는데 확인할 방법이
   * 없다). 이쪽은 실행 기록에 매달아 **회차마다 따로** 남기므로, 몇 번을
   * 다시 돌려도 지난 것이 그대로 있다.
   *
   * 사이클 문서 저장은 그대로 둔다 — 지금 화면들이 그것을 보고 있고,
   * 「가장 최근 결과」 라는 뜻으로 여전히 쓸모가 있다.
   */
  const saveRound = async (it: Item, tookMs: number, round = Number(run.round) || 1): Promise<void> => {
    const rid = String(run.plan_run_id ?? '')
    if (!rid) return // 실행 기록에 안 매인 일감이면 남길 자리가 없다
    try {
      const steps = (it.steps ?? []) as Array<Record<string, unknown>>
      /* 항목 판정 — 판정 기준이 걸린 스텝이 하나라도 깨졌으면 Fail.
         기준이 아예 없는 항목은 빈 값으로 둔다(조회만 하는 항목이다). */
      const marked = steps.filter((s) => String(s?.mark ?? '').trim())
      const verdict = marked.length
        ? marked.some((s) => /fail/i.test(String(s.mark))) ? 'Fail' : 'Pass'
        : ''
      const r = await apiFetch(`/api/plan-runs/${encodeURIComponent(rid)}/item`, {
        method: 'POST',
        body: JSON.stringify({
          tcid: it.tcid,
          round,
          verdict,
          at: it.executed_at ?? '',
          took_ms: tookMs,
          /* 서버가 앞 회차와 견주어 **같으면 전문을 또 쌓지 않는다**(접기) */
          data: { steps: it.steps ?? [] },
        }),
      })
      if (!r.ok) throw new Error(String(r.status))
    } catch (e) {
      /* 회차 기록이 실패해도 실행은 이어 간다 — 사이클 문서에는 이미 남았다 */
      log(`회차 기록 실패 (${it.tcid}) — ${String(e)}`)
    }
  }

  /** 항목과 항목 사이 쉬는 시간(지시) — 장비가 숨 돌릴 틈을 준다 */
  const GAP_MS = 500
  let first = true
  for (const raw of run.picked) {
    /* 첫 항목 앞에서는 쉬지 않는다 — 누른 뒤 곧바로 돌기 시작해야 한다 */
    if (!first) await sleep(GAP_MS)
    first = false
    await push.flush(true)
    if (push.stop) {
      stopped = true
      break
    }
    /* tcid 면 지금 스냅샷에서 그 항목을 찾는다 — 어느 시점에 풀어도 같은 항목 */
    const at = typeof raw === 'number' ? raw : all.findIndex((x) => x?.tcid === raw)
    const it = at >= 0 ? all[at] : undefined
    if (!it?.tcid) {
      push.addLog({ i: -1, kind: 'fail', text: `항목을 찾을 수 없습니다 — ${String(raw)} (사이클에서 빠졌나 봅니다)` })
      n++
      push.set({ done: n })
      continue
    }

    push.itemAt(at)
    /* 이 항목이 얼마나 걸렸나 — 회차 기록에 함께 남긴다 */
    const t0 = Date.now()
    push.set({ item_at: at, item_name: it.name || it.tcid, step_at: -1, step_count: 0, step_name: '' })
    /* 항목 이름은 **안 찍는다**(지시: 왜 제목이 항상 먼저 나오나).
       무엇을 돌고 있는지는 머리줄과 Test Report 가 이미 말한다 — 로그
       첫 줄을 제목이 먹으면 시험 항목 화면의 로그와도 어긋난다. */
    log(`▶ ${it.name || it.tcid}`)

    // 절차는 TC 가 갖고 있다. 사이클 항목에 박아 둔 옛 스텝을 쓰면
    // 그동안 TC 를 고친 것이 반영되지 않는다.
    let steps: TcStep[] = []
    let sessions: string[] = []
    // 계측기 스텝이 볼 트래픽 설정. 스텝에는 시작·정지·조회만 있고, 무엇을
    // 얼마나 보낼지는 TC 의 Traffic 탭에 한 벌로 있다 — 스텝마다 되풀이해
    // 적으면 한 군데만 고치고 나머지를 잊는다.
    let meterCfg: MeterCfg | undefined
    try {
      const r = await apiFetch(`/api/tc/${encodeURIComponent(it.tcid)}`)
      if (!r.ok) throw new Error(String(r.status))
      const tc = (await r.json()) as { checks?: TcStep[]; sessions?: unknown; meterCfg?: MeterCfg }
      steps = (tc.checks ?? []).slice()
      /*
       * **지난 실행의 자취를 지우고 시작한다**(지적: Response 에 두 달 전
       * 장비 응답이 나온다).
       *
       * TC 의 checks 에는 그때 결과가 그대로 남아 있다 — 8/8 에 돌린
       * `show system` 출력(그 자리에 있던 E5010-24C)까지. 이번 실행이 그
       * 전부를 덮지는 않는다: `output` 은 스텝마다 새로 쓰지만 **rounds ·
       * queries 는 그 스텝이 그 길로 가야만** 손대므로, 안 도는 회차·질의는
       * 옛것이 살아남아 화면에 섞였다.
       *
       * 수동 스텝은 건드리지 않는다 — 사람이 적은 기록이고, 아래에서 플랜의
       * 손 기록을 다시 얹는다.
       */
      steps = steps.map((st) => {
        if (isManualStep(st)) return st
        const c = { ...(st as Record<string, unknown>) }
        for (const k of [
          'output',
          'out',
          'rounds',
          'status',
          'executed_at',
          'took_ms',
          'reason',
          'sentCmd',
          'repeatResult',
        ])
          delete c[k]
        return c as unknown as TcStep
      })
      sessions = Array.isArray(tc.sessions) ? (tc.sessions as string[]) : []
      meterCfg = tc.meterCfg
    } catch (e) {
      push.addLog({ i: -1, kind: 'fail', text: `${it.tcid} 를 불러오지 못했습니다 (${String(e)})` })
      n++
      push.set({ done: n })
      continue
    }

    // 수동 스텝의 **사람 기록**은 남긴다. 절차는 TC 가 정본이라 새로 받지만,
    // 결과(result)·ACTUAL(글·사진)·RCA 는 사람이 플랜 항목에 적은 것이고
    // TC 에는 없다 — 통째로 갈아 끼우면 재실행 한 번에 다 지워진다.
    // 스텝에는 id 가 없어 「몇 번째 수동 스텝」 끼리 맞춘다. 자동 스텝을
    // 넣거나 빼서 순번이 밀려도 수동 기록은 제자리를 찾는다.
    {
      type HumanMark = {
        result?: string | null
        executed_at?: string | null
        actual_txt?: string | null
        actual_img?: string | null
        rca?: string | null
      }
      const olds = ((it.steps ?? []) as Array<(TcStep & HumanMark) | null>).filter(
        (s): s is TcStep & HumanMark => !!s && isManualStep(s),
      )
      let mi = 0
      for (let i = 0; i < steps.length && mi < olds.length; i++) {
        const s = steps[i]
        if (!s || !isManualStep(s)) continue
        const old = olds[mi++]
        if (!old) break
        const keep: { result?: string; executed_at?: string; actual_txt?: string; actual_img?: string; rca?: string } = {}
        if (old.actual_txt != null) keep.actual_txt = old.actual_txt
        if (old.actual_img != null) keep.actual_img = old.actual_img
        if (old.rca != null) keep.rca = old.rca
        const r = String(old.result ?? '').trim()
        if (r) {
          keep.result = r
          if (old.executed_at) keep.executed_at = old.executed_at
        }
        if (Object.keys(keep).length) steps[i] = { ...s, ...keep }
      }
    }

    /* **읽은 절차를 있는 그대로 한 줄 남긴다**(진단: 사이클에서 돌리면
       반복이 1 회만 돌았다. 같은 TC 를 TC 화면에서 돌리면 20 회가 정상이라,
       실행기가 읽은 것과 화면이 보는 것이 갈린다는 뜻이다). */
    try {
      const lps = steps
        .map((st, ix) => ({ st, ix }))
        .filter((x) => String(x.st?.kind ?? '') === 'loop')
      if (lps.length) {
        for (const { st, ix } of lps) {
          const body = steps.filter(
            (x, j) => j > ix && Number(x?.indent ?? 0) > Number(st?.indent ?? 0),
          ).length
          const _diag =
            `반복 스텝 #${ix + 1} — from=${String(st?.forFrom)} to=${String(st?.forTo)} ` +
            `count=${String(st?.loopCount)} list=${String(st?.forList ?? '')} ` +
            `indent=${String(st?.indent ?? 0)} · 몸통 ${body}줄`
          /* 화면의 「실행 이벤트」 는 **스텝에 붙은 줄만** 보여 준다(i>=0).
             진단은 스텝에 안 붙는 줄이라 거기서 걸린다 — 실행기 콘솔에도
             찍어 `docker logs` 로 반드시 보이게 한다. */
          /* 화면에는 **안 보낸다**(지적: 실행 이벤트가 시험 항목 로그와
             다르다). 이것은 실행기를 고칠 때 보는 말이지 시험을 돌리는
             사람이 읽을 말이 아니다 — `docker logs` 에만 남긴다. */
          log(_diag)
        }
      } else {
        const _diag0 = `반복 스텝이 없습니다 — 스텝 ${steps.length}개 · kind 목록 ${steps
          .map((x) => String(x?.kind ?? ''))
          .join(',')}`
        log(_diag0)
      }
    } catch {
      /* 진단이 실행을 막으면 안 된다 */
    }

    /*
     * **어느 장비로 나가는지 먼저 적는다**(지적: 시험 항목에 설정된 세션과
     * 다른 장비로 나갔다).
     *
     * 여태 화면에 있는 단서는 세션 판의 「장비 미지정」 과 프롬프트 `DUT#`
     * 뿐이었다 — 엉뚱한 곳에 붙어도 알 길이 없고, 나중에 따질 기록도 안
     * 남는다. 배정을 항목 첫 줄에 남기면 실행 이벤트만 보고 가린다.
     */
    {
      const sessLine = sessions.length
        ? sessions
            .map((id, k) => {
              const d = devById.get(id)
              return `S${k + 1} = ${
                d
                  ? `${d.name || d.model || id}${d.ip ? ` (${d.ip}${d.port ? `:${d.port}` : ''})` : ''}`
                  : `${id} — 장비 목록에 없습니다`
              }`
            })
            .join(' · ')
        : '세션이 없습니다 — 이 항목은 장비로 나가지 않습니다'
      /* 화면에는 안 보낸다(지시: 시험 항목 로그와 똑같이) — 어느 장비로
         나갔는지는 세션 판이 이미 말한다. 실행기 기록에는 남긴다. */
      log(`세션 배정 · ${sessLine}`)
    }

    /* 스텝마다 **제 장비**를 심는다 — 세션 판이 이것으로 장비를 찾는다.
       안 심어서 「장비 미지정」 으로만 떴다(지적). */
    steps = steps.map((st) => {
      const k = sessionIndex(st.session)
      const id = k >= 0 ? sessions[k] : ''
      return id ? ({ ...st, devId: id } as TcStep) : st
    })

    push.set({ step_count: steps.length, live_steps: steps })

    // 멈춤은 스텝 사이에서 듣는다. 명령 한복판에서 끊으면 장비 세션이
    // 열린 채로 남는다.
    const ac = new AbortController()
    await runSteps(
      {
        steps,
        sessions,
        devById,
        meterCfg,
        params: gparams,
        onStep: (i, patch) => {
          const cur = steps[i]
          if (!cur) return
          steps[i] = { ...cur, ...patch }
          push.set({ live_steps: steps })
          // 스텝이 길면 다음 스텝 경계까지 못 내려왔다 — 결과가 올 때마다 본다
          if (push.stop) ac.abort()
          void push.flush()
        },
        onAt: (i) => {
          push.set({
            step_at: i,
            step_name: String(steps[i]?.cli ?? steps[i]?.step ?? '').split('\n')[0] ?? '',
          })
          if (push.stop) ac.abort()
          // 스텝 경계는 **바로** 올린다(force). 예전엔 700ms 묶음에 얹혀,
          // 그 안에 다음 스텝이 시작하면 step_at 이 덮여 화면이 1→3 으로
          // 건너뛰었다 — 빠른 2번 스텝의 파란 강조가 통째로 사라졌다.
          // 스텝 시작은 드문 사건이라 매번 올려도 부담이 없다(로그는 그대로 묶음).
          void push.flush(true)
        },
        onLog: (line) => {
          push.addLog(line)
          if (push.stop) ac.abort()
          void push.flush()
        },
        signal: ac.signal,
      },
      0,
      false,
    )

    /* **회차가 정말 몇 번 돌았나**(진단). 절차는 from=1 to=20 으로 멀쩡한데
       화면에는 1 회처럼 보인다 — 실제로 돈 횟수와 화면이 갈리는지 가른다.
       runSteps 가 반복 안 스텝의 rounds 에 회차별 기록을 남긴다. */
    try {
      const _rd = steps
        .map((st, ix) => {
          const rs = (st as unknown as { rounds?: unknown[] })?.rounds
          return Array.isArray(rs) && rs.length ? `#${ix + 1}:${rs.length}회` : ''
        })
        .filter(Boolean)
        .join(' ')
      log(_rd ? `회차 기록 — ${_rd}` : '회차 기록 없음 (반복 안 스텝에 rounds 가 안 남았다)')
    } catch {
      /* 진단이 실행을 막으면 안 된다 */
    }

    it.steps = steps
    // 사람이 손으로 정한 옛 결과를 지운다. 안 지우면 항목 판정에서 그 값이
    // 스텝을 이겨서, 방금 세 스텝 다 Pass 인데도 목록엔 옛 Fail 이 남는다.
    // 방금 돈 것이 최신이다 — 자동 실행이 손 결과를 덮는다.
    it.result = ''
    /* **밀리초까지** 남긴다(지적: 1번보다 2번이 먼저 돈 것처럼 보인다).
       초에서 자르면 한 초에 끝난 두 항목이 같은 값이 되어 차례를 가릴 수
       없다 — 항목 사이에 쉬는 시간을 두는 것보다 이쪽이 공짜다.
       화면은 초까지만 보여 준다(shortStamp 가 자른다). */
    it.executed_at = new Date().toISOString().slice(0, 23).replace('T', ' ')
    it.executed_by = run.started_by || '실행 서버'
    it.executed_auto = true
    n++
    push.set({ done: n, live_steps: steps })
    await push.flush(true)
    // 항목이 끝날 때마다 저장한다. 전에는 마지막에 한 번만 저장해서, 도는
    // 동안 이미 끝난 1·2·3 항목이 목록에선 「미실행」 그대로였다(그 결과가
    // 아직 서버에 없으니). 지금 저장하면 cycle_updated 로 다른 화면까지
    // 그 자리에서 초록으로 바뀐다. 중간에 죽어도 여기까지는 남는다.
    await saveAll()
    /* 그리고 **이 회차의 것으로도** 남긴다. 사이클 문서는 다음 실행이
       덮지만, 이쪽은 회차마다 한 줄씩 서서 지워지지 않는다. */
    await saveRound(it, Date.now() - t0)
    if (push.stop) {
      stopped = true
      break
    }
  }

  // 멈췄거나 끝났으면 마지막 상태를 한 번 더 굳힌다.
  await saveAll()

  push.addLog({
    i: -1,
    kind: 'info',
    text: stopped ? `⏹ 멈췄습니다 (${n}/${run.picked.length})` : `✔ ${n}건 끝`,
  })
  await call(`/api/runner/${run.id}/finish`, {
    status: stopped ? 'stopped' : 'done',
    logs: [
      {
        i: -1,
        at: -1,
        kind: 'info',
        text: stopped ? `⏹ 멈췄습니다 (${n}/${run.picked.length})` : `✔ ${n}건 끝`,
      },
    ],
  })
  log(`끝 ${run.id} — ${n}/${run.picked.length}${stopped ? ' (멈춤)' : ''}`)
}

async function login(): Promise<void> {
  // 실행기도 사이클·TC 를 읽고 결과를 저장한다 — 사람이 하는 일과 같다.
  // 그래서 인증 길을 따로 파지 않고 보통 토큰을 하나 받아 쓴다.
  const r = await call('/api/runner/login', {})
  setToken(String(r.token || ''))
}

/**
 * API 가 뜰 때까지 기다린다.
 *
 * 도커가 실행기를 API 보다 먼저 띄우는 일이 흔하다. 그때 나는 오류를
 * 그대로 찍으면 「고장났다」 로 읽힌다 — 실제로는 3초 뒤에 붙는다.
 * 기다리는 중이라고 말하고, 오래 걸릴 때만 목소리를 키운다.
 */
async function waitForApi(): Promise<void> {
  for (let n = 1; ; n++) {
    try {
      const r = await fetch(API + '/api/health')
      if (r.ok) {
        if (n > 1) log('API 붙음')
        return
      }
    } catch {
      // 아직 안 떴다
    }
    if (n === 1) log('API 를 기다리는 중…')
    else if (n % 20 === 0) log(`API 가 아직 안 뜹니다 (${n}번째) — ${API} 를 확인하세요`)
    await sleep(3000)
  }
}

async function main(): Promise<void> {
  if (!KEY) {
    console.error('RUNNER_KEY 가 없습니다 — .env 에 넣어야 사이클을 돌릴 수 있습니다.')
    process.exit(1)
  }
  log(`실행기 시작 — ${NAME} → ${API}`)
  await waitForApi()

  let loggedIn = false
  let quiet = 0
  for (;;) {
    try {
      if (!loggedIn) {
        await login()
        loggedIn = true
        log('대기 중 — 걸린 일감이 없습니다')
      }
      const r = await call('/api/runner/claim', { worker: NAME })
      const run = r.run as Run | null
      if (!run) {
        quiet = 0
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
      // 잠깐 끊긴 것까지 매번 찍으면 로그가 오류로 도배된다.
      loggedIn = false
      if (quiet === 0 || quiet % 20 === 0) log('API 와 다시 붙는 중…', String(e))
      quiet++
      await sleep(IDLE_MS * 2)
    }
  }
}

void main()
