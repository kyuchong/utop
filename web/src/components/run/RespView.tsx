import { useEffect, useMemo, useRef, useState } from 'react'
import BlockText from '@/components/tc/BlockText'
import { IconChevron } from '@/components/icons'
import { stepSummary, type TcStep } from '@/components/tc/types'
import type { AutoStep, AutoDev } from './RunAuto'
import './RunAuto.css'

/**
 * **Response 판 한 몸** — 사이클 자동 실행 화면(RunAuto)과 Test AI 3단계가
 * 같은 부품을 쓴다(지시: Test AI 도 자동 실행의 response 화면처럼).
 * 스텝 카드(명령 · 판정 기준 · 변수 · RCA · 출력 강조)와 칩 줄 · 바닥 판정이
 * 전부다. 한쪽만 고쳐지면 두 화면이 갈린다 — 그래서 여기 하나로 모았다.
 */

/** 걸린 시간 — **분:초**(지시). 「20.01s」 보다 「00:20」 이 표에서 줄이 맞는다.
 *  1초가 안 걸린 스텝은 00:00 이다 — 그건 정말 순식간이라는 뜻이다. */
export function mmss(v?: string): string {
  const raw = String(v ?? '').trim()
  if (!raw) return '—'
  const sec = Number(raw.replace(/s$/, ''))
  if (!Number.isFinite(sec)) return raw
  const t = Math.round(sec)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(Math.floor(t / 60))}:${p(t % 60)}`
}
/** 대기·비교 스텝의 이름 짓기 — 정의에 이름이 없을 때 갈래에서 만든다 */
function autoName(raw: Record<string, unknown>): string {
  const kind = String(raw?.kind ?? '').toLowerCase()
  if (kind === 'wait') {
    const sec = Number(raw?.waitSec ?? 0)
    return sec > 0 ? `${sec}초 대기` : '대기'
  }
  if (kind === 'diff') {
    /* conds 가 정본이다(l · op · r). 없으면 옛 칸(cmpLeft·cmpRight)으로. */
    const cs = Array.isArray(raw?.conds) ? (raw.conds as Array<Record<string, unknown>>) : []
    const join = String(raw?.condJoin ?? 'and').toLowerCase() === 'or' ? ' || ' : ' && '
    const parts = cs
      .map((c) => `${String(c?.l ?? '')} ${String(c?.op ?? '==')} ${String(c?.r ?? '')}`.trim())
      .filter((x) => x.length > 2)
    if (parts.length) return parts.join(join)
    const l = String(raw?.cmpLeft ?? '')
    const r = String(raw?.cmpRight ?? '')
    if (l || r) return `${l} ${String(raw?.cmpOp ?? '==')} ${r}`.trim()
    return '비교'
  }
  return ''
}

/** 스텝 하나를 화면이 아는 모양으로 바꾼다.
 *
 * 실제 자료의 칸 이름은 목업과 다르다 — 절차는 `cli`(명령)·`desc`(설명)·
 * `rules`(견줄 것)·`status`(판정)·`took_ms`(걸린 시간)로 적힌다. 이걸 안
 * 맞춰 줘서, 다 돌고도 표가 전부 「—」 였다(지적).
 */
export function asStep(raw: Record<string, unknown>, i: number): {
  no: number; kind: string; t: string; cmd: string; expected: string; action: string
  session: string; out: string; mark?: string; took?: string; tookMs?: number; waitSec?: number; at?: string
  /** 왜 그 판정이 났나 — 블록이 판정 기준 아래 적는다 */
  reason?: string
  /** 이 스텝이 담는 변수 — 이름과 규칙 */
  vars?: Array<{ name: string; rule?: string }>
  /** 이 스텝이 붙은 장비 — 세션 판이 이것으로 장비를 찾는다 */
  devId?: string
  /** 비교 스텝이 통과·실패일 때 적어 둔 문구 */
  okMsg?: string; ngMsg?: string
  /** **반복 회차별 기록**(지적: 20 회를 돌았는데 화면은 1 회로 보인다).
   *  실행기는 회차마다 여기에 남기는데 화면이 통째로 버리고 있었다. */
  rounds?: Array<{ n?: number; status?: string; reason?: string; took_ms?: number; output?: string; cmd?: string; trimmed?: boolean }>
  /** 이 스텝이 실제로 돌았나. 판정이 없는 스텝(대기·조회)과 **안 돌린 스텝**은 다르다 */
  ran?: boolean
} {
  const g = (k: string) => String(raw?.[k] ?? '').trim()
  const cli = g('cli') || g('cmd')
  /* 기대값 — criteria 가 비면 rules 를 사람 말로 잇는다 */
  const rules = Array.isArray(raw?.rules) ? (raw.rules as Array<Record<string, unknown>>) : []
  /* **견주는 줄은 그 식이 곧 기준**이다(지적: Diff 에 「기준 없음」 이 떴다).
     criteria 칸을 안 쓰고 cmpLeft·cmpOp·cmpRight 에 적는 갈래라 비어 보였다.
     적어 둔 말(cmpLeftLabel)이 있으면 함께 세워 사람 말로 읽히게 한다. */
  const cmpText = (() => {
    if (String(raw?.kind ?? '') !== 'diff') return ''
    const l = `${g('cmpLeftLabel')} ${g('cmpLeft')}`.trim()
    const r = `${g('cmpRightLabel')} ${g('cmpRight')}`.trim()
    if (!l && !r) return ''
    const op = g('cmpOp') || '=='
    const word: Record<string, string> = {
      '==': '같다', '!=': '다르다', '포함': '포함한다',
      '>': '크다', '<': '작다', '>=': '크거나 같다', '<=': '작거나 같다',
    }
    return `${l} ${word[op] ?? op} ${r}`.trim()
  })()
  const expected =
    cmpText ||
    g('criteria') ||
    g('expected') ||
    rules
      .map((r) => {
        const t = String(r?.t ?? '')
        /* 새 칩(추가)은 사람 말로 — 줄있음·줄수. 옛 칩 표기는 그대로 둔다 */
        if (t === 'hasline')
          return `줄있음 == ${String(r?.v ?? '')}${
            String(r?.op ?? '').trim() && String(r?.rhs ?? '').trim()
              ? ` (줄수 ${r?.op} ${r?.rhs})`
              : ''
          }`.trim()
        if (t === 'rowcount') return `줄수 ${String(r?.op ?? '==')} ${String(r?.v ?? '')}`.trim()
        return `${String(r?.rhs ?? r?.t ?? '')} ${String(r?.op ?? '==')} ${String(r?.v ?? '')}`.trim()
      })
      .filter(Boolean)
      .join(' && ')
  /* 판정 — 사람이 적은 result 가 먼저, 없으면 실행기의 status */
  const res = g('result')
  const st = g('status').toUpperCase()
  const mark = res || ({ PASS: 'Pass', FAIL: 'Fail', BLOCKED: 'Blocked', WIP: 'WIP' } as Record<string, string>)[st]
  const ms = Number(raw?.took_ms ?? NaN)
  return {
    no: Number(raw?.no ?? NaN) || i + 1,
    /* 「스텝 2」 같은 자리 채우개를 여기서 넣으면, 로그 쪽 채우개가 정의
       쪽 진짜 이름을 이겨 버린다(지적: Description 이 「스텝 2」). 비워
       두고, 그릴 때 채운다. */
    kind: g('kind'),
    t: g('desc') || g('step') || g('t') || cli || autoName(raw),
    /* Description 에는 시험 항목의 **「명령 내용」** 이 선다(지시) — 여태
       cli 만 봐서 주석·메시지·OID·대기는 「스텝 N」 으로 비었다.
       그 칸을 만드는 함수를 그대로 쓴다(한 곳). */
    cmd: cli || stepSummary(raw as unknown as TcStep) || '',
    expected: expected || '—',
    action: g('action') || (g('kind') === 'cli' || cli ? 'command' : g('kind')) || '—',
    session: raw?.session === undefined || raw?.session === null ? '—' : `s${String(raw.session)}`,
    devId: g('devId') || g('dev_id') || undefined,
    out: g('output') || g('out'),
    mark: mark || undefined,
    took: Number.isFinite(ms) ? `${(ms / 1000).toFixed(2)}s` : g('took') || undefined,
    tookMs: Number.isFinite(ms) ? ms : undefined,
    waitSec: Number(raw?.waitSec ?? 0) || undefined,
    /* 스텝이 **언제** 돌았나. 안 실으면 이벤트 줄이 전부 항목 끝난 시각
       하나로 찍혀, 무엇이 먼저였는지 알 수 없다. */
    at: g('executed_at') || g('at') || undefined,
    /* **왜 그 판정이 났나**(RCA) — 블록이 판정 기준 바로 아래 적는다(승인) */
    reason: g('reason') || undefined,
    /* 이 스텝이 **담는 변수** — 이름과 규칙. 값은 RCA 문장에 이미 들어 있다 */
    vars: (() => {
      const out: Array<{ name: string; rule?: string }> = []
      for (const x of (Array.isArray(raw?.extracts) ? raw.extracts : []) as Array<Record<string, unknown>>) {
        const n = String(x?.var ?? '').trim()
        if (n) out.push({ name: n, rule: String(x?.rule ?? '') || undefined })
      }
      for (const x of (Array.isArray(raw?.queries) ? raw.queries : []) as Array<Record<string, unknown>>) {
        const n = String(x?.var ?? '').trim()
        if (n && !out.some((y) => y.name === n))
          out.push({ name: n, rule: String(x?.q ?? x?.col ?? '') || undefined })
      }
      return out.length ? out : undefined
    })(),
    /* 사람이 적어 둔 판정 문구. 실행 이벤트가 「기준 맞음」 대신 이걸 적는다(지시) */
    okMsg: g('msgYes') || g('trueMsg') || undefined,
    ngMsg: g('msgNo') || g('falseMsg') || undefined,
    /* 회차 기록은 **있는 그대로** 나른다 — 여기서 버려서 20 회가 1 회로 보였다 */
    rounds: Array.isArray(raw?.rounds)
      ? (raw.rounds as Array<Record<string, unknown>>).map((r) => ({
          n: Number(r?.n ?? 0) || undefined,
          status: String(r?.status ?? '') || undefined,
          reason: String(r?.reason ?? '') || undefined,
          took_ms: typeof r?.took_ms === 'number' ? r.took_ms : undefined,
          output: String(r?.output ?? ''),
          /* 그 회차에 **실제로 보낸 명령** — 변수를 푼 뒤의 것 */
          cmd: String(r?.cmd ?? '') || undefined,
          trimmed: !!r?.trimmed,
        }))
      : undefined,
    /* 걸린 시간이나 출력이 있으면 돈 것이다. 실행기는 판정 기준이 없는
       스텝(대기·단순 조회)에는 status 를 안 남긴다 — 그걸 「미실행」 으로
       그려서 「건너뛴 것 같다」 는 말이 나왔다(지적). */
    ran: Number.isFinite(ms) || !!g('output') || !!g('out') || !!g('executed_at') || !!res || !!st,
  }
}


export default function RespView({
  steps,
  stepAt,
  onStep,
  dut,
  devices,
  runStep,
  waitAt,
  seedKey,
  openAll,
}: {
  steps: AutoStep[]
  stepAt: number
  onStep: (i: number) => void
  /** 콘솔 프롬프트에 쓸 장비 이름 — 스텝에 devId 가 없을 때의 바탕값 */
  dut: string
  devices?: AutoDev[]
  /** 실행기가 지금 도는 스텝 자리(0부터). 안 돌면 없다 */
  runStep?: number | null
  /** 대기 스텝을 언제부터 도는가(ms) — 초읽기가 여기서 내려온다 */
  waitAt?: number | null
  /** 접힘 초기화 열쇠 — 바뀌면 「부적합만 펴 둠」 기본으로 돌아간다 */
  seedKey?: string
  /** 처음부터 전부 편다 — Coverage AI(지시). 자동 실행 화면은 기본(부적합만) */
  openAll?: boolean
}) {
  /** 시험 항목 표와 같은 번호 — 주석은 번호를 안 먹는다 */
  const nos = useMemo(() => {
    let n = 0
    return steps.map((s2) => (s2.kind === 'comment' ? '' : String(++n)))
  }, [steps])

  /** 걸린 시간 — 1 초 아래는 ms 로 적는다. 스텝 하나는 대개 그 아래다 */
  const tookText = (ms?: number) =>
    ms == null ? '' : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}초`

  /** 접어 둔 스텝 자리 — 접으면 머리만 남아 실행 스텝 표와 같은 밀도가 된다 */
  const [folded, setFolded] = useState<Set<number>>(new Set())
  /** 깨진 스텝만 보기 — 62 건에서 실패한 자리로 바로 간다 */
  const [onlyBad, setOnlyBad] = useState(false)
  /*
   * **처음 열면 부적합만 펴 둔다**(지시).
   *
   * 62 건 가운데 대개는 통과라, 다 펴 두면 볼 것을 찾느라 스크롤만 한다.
   * 통과한 줄과 판정이 없는 줄은 접고 깨진 줄만 편다 — 손대는 순간부터는
   * 사람 뜻을 따르고, 항목을 옮기면 다시 이 기본으로 돌아온다.
   */
  const foldSeed = useRef('')
  useEffect(() => {
    /* 실행 중에는 **전부 편다**(지시: 스텝마다 CLI 입력되는 걸 보고 싶다) —
       시험 항목이 끝난(runStep==null) 뒤에야 Fail 만 남기고 접는다. */
    const running = runStep != null
    const key = `${seedKey ?? ''}|${steps.length}|${steps.map((x) => x.mark ?? '').join(',')}|${
      running ? 'run' : 'done'
    }`
    if (foldSeed.current === key) return
    foldSeed.current = key
    const next = new Set<number>()
    if (!openAll && !running) {
      // 끝난 뒤에만 접는다 — 통과·판정 없는 줄은 접고 부적합만 편다.
      // 실행 중(running)이면 아무것도 안 접어 전부 펼쳐 둔다.
      steps.forEach((s2, i3) => {
        if (!/fail/i.test(String(s2.mark ?? ''))) next.add(i3)
      })
    }
    setFolded(next)
  }, [seedKey, steps, openAll, runStep])


  /** 반복 스텝에서 **몇 회차를 보고 있나**(지시) — -1 이면 마지막 회차 */
  const [roundAt, setRoundAt] = useState(-1)


  /* ── 「대기」 스텝의 초읽기 ──
     실행기는 「몇 번째 스텝을 도는 중」 까지만 알려 준다. 남은 초는 안 준다.
     그래서 **그 스텝이 도는 것을 본 순간**부터 waitSec 에서 내려 센다.
     그 「본 순간」 은 **위 판(RunDetail)이 기억한다**(waitAt) — 여기 두었더니
     다른 항목을 봤다 오면 이 판이 새로 서면서 20 부터 다시 셌다(지적).
     도중에 들어오면 처음부터 세므로, 끝나면 실제 걸린 시간으로 갈아 적는다
     — 지어낸 값이 기록에 남지 않게. */
  const [, beat] = useState(0)
  useEffect(() => {
    if (runStep == null) return
    const t = window.setInterval(() => beat((n) => n + 1), 500)
    return () => window.clearInterval(t)
  }, [runStep])

  const isWait = (s2: AutoStep) =>
    String(s2.action ?? '').toLowerCase() === 'wait' || Number(s2.waitSec ?? 0) > 0

  /** 대기 줄 한 줄 — 도는 중이면 초읽기, 끝났으면 걸린 시간 */
  const waitLine = (s2: AutoStep, i2: number): string => {
    const sec = Number(s2.waitSec ?? 0)
    if (i2 === runStep && sec > 0 && waitAt) {
      const gone = Math.floor((Date.now() - waitAt) / 1000)
      const left = Math.max(0, sec - gone)
      /* 콘솔처럼 **찍히게** 한다(지시) — 숫자가 하나씩 늘어서며 줄어든다.
         한 자리에서 숫자만 바뀌면 도는 건지 멎은 건지 안 보인다. */
      const trail: number[] = []
      for (let n = sec; n >= left && trail.length < 60; n--) trail.push(n)
      /* 한 줄에 늘어놓으면 길어질수록 옆으로 흘러 안 읽힌다 — **한 줄에 하나**(지시) */
      return `${sec}초 기다립니다\n${trail.join('\n')}${left === 0 ? '\n기다림 끝' : ''}`
    }
    if (s2.out) return s2.out
    return sec > 0 ? `${sec}초 기다립니다` : '기다립니다'
  }

  /** 콘솔에 그릴 **그 스텝 하나**.
   *
   *  쌓지 않는다(지시). 스텝 표에서 고른 줄의 CLI 결과만 보여 준다 —
   *  누적으로 이어 붙이니 어느 출력이 어느 스텝 것인지 되짚어야 했다.
   *  돌고 있는 동안에는 도는 줄을 따라간다.
   */
  const lastRan = steps.reduce((acc, s2, i) => (s2.ran || s2.out ? i : acc), -1)
  /** 이번 실행에서 **한 줄도 안 돌았나.** 돌고 있지도 않고 돈 자취도 없으면
   *  콘솔에는 그릴 것이 없다 — 정의만 보고 명령을 미리 찍으면 안 된다. */
  const noneRan = runStep == null && lastRan < 0
  const seeUpTo = (() => {
    /* 돌고 있으면 **도는 줄**, 아니면 **고른 줄**이다 */
    /* 안 돌고 있으면 **돈 데까지 전부** 편다(지시: 스텝을 안 눌러도 한 번에
       나왔으면 한다). 고른 줄까지만 그리던 때는 항목을 막 열었을 때 첫 줄
       하나만 보여 「아무것도 안 나온다」 로 읽혔다. */
    const want = runStep != null ? runStep : Math.max(stepAt, lastRan)
    const at = Math.min(want, Math.max(0, steps.length - 1))
    /* **몸통을 거느리는 줄은 제 출력이 없다**(지적: 회차 칩이 안 보인다).
       loop·if 를 보고 있으면 바로 아래 들여쓴 줄을 대신 편다 — 회차도
       출력도 거기에 있다. 처음 화면을 열면 늘 첫 줄(대개 loop)이라
       「아무것도 없다」 로 보였다. */
    const a0 = String(steps[at]?.action ?? '').toLowerCase()
    if ((a0 === 'loop' || a0 === 'if' || a0 === 'else') && steps[at + 1]) return at + 1
    return at
  })()
  const conRef = useRef<HTMLDivElement>(null)
  const conEndRef = useRef<HTMLDivElement>(null)
  /* 콘솔은 **바닥을 따라간다.** 자리가 고정돼 있어 새 줄이 나올 때마다
     사람이 손으로 내려야 했다(지적).
     다만 위로 올려 지난 출력을 읽는 중이면 따라가지 않는다 — 읽는 자리를
     빼앗으면 안 된다. 다시 바닥까지 내리면 따라가기가 살아난다. */
  const [follow, setFollow] = useState(true)
  const onConScroll = () => {
    const el = conRef.current
    if (!el) return
    const atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 24
    setFollow(atEnd)
  }
  useEffect(() => {
    if (!follow) return
    const el = conRef.current
    if (el) el.scrollTop = el.scrollHeight
  })
  /* 스텝이 바뀌면 무조건 바닥으로 — 새 스텝을 보러 온 것이다 */
  useEffect(() => {
    setFollow(true)
  }, [seeUpTo, seedKey])

  const curStep = steps[Math.min(stepAt, Math.max(0, steps.length - 1))]
  /** 스텝이 붙은 장비 — devId 로 찾는다(프롬프트에 그 장비 이름을 적는다) */
  const devOf = (id?: string) => {
    const k = String(id ?? '').trim()
    if (!k) return undefined
    const list = devices ?? []
    return list.find((d) => String(d.id ?? '') === k) ?? list.find((d) => String(d.ip ?? '') === k)
  }

  return (
        <>
          {/* 콘솔은 **이어진다**(지시). 스텝마다 판을 갈아 끼우면 앞 명령의
              출력이 사라져, 무엇 다음에 무엇이 나왔는지 못 읽는다.
              지금 보는 스텝까지를 차례로 쌓고, 그 자리로 끌어 준다. */}
          {/* **스텝 번호 줄**(지시) — 판정이 걸린 줄은 초록, 깨진 줄은 빨강,
              그 밖은 흰 칩이다. 누르면 그 줄로 간다. 62 스텝을 훑을 때
              카드를 스크롤하지 않고도 깨진 자리로 바로 갈 수 있다. */}
          <div className="ra-sbar">
            {/* 62 스텝을 훑는 두 손잡이(승인) — 접으면 머리만 남고, 부적합만
                고르면 그 자리만 선다. 실행 스텝 표가 하던 일이다.
                말은 시험 항목 실행 로그의 단추와 맞춘다(지시). */}
            <button
              type="button"
              className="ra-sbtn"
              onClick={() =>
                setFolded((f) =>
                  f.size ? new Set() : new Set(steps.map((_, i3) => i3)),
                )
              }
            >
              {folded.size ? '모두 펴기' : '모두 접기'}
            </button>
            <button
              type="button"
              className={`ra-sbtn${onlyBad ? ' on' : ''}`}
              onClick={() => setOnlyBad((v) => !v)}
            >
              부적합만
            </button>
            <span className="ra-ssep" />
            {steps.map((s2, i2) =>
              s2.kind === 'comment' ? null : (
                <button
                  key={i2}
                  type="button"
                  className={`ra-sch${
                    /pass/i.test(String(s2.mark ?? ''))
                      ? ' ok'
                      : /fail/i.test(String(s2.mark ?? ''))
                        ? ' bad'
                        : ''
                  }${i2 === seeUpTo ? ' on' : ''}`}
                  title={`${nos[i2] ? `스텝 ${nos[i2]}` : ''} ${s2.cmd || s2.t || ''}`.trim()}
                  onClick={() => onStep(i2)}
                >
                  {nos[i2] || '·'}
                </button>
              ),
            )}
          </div>
          <div className="ra-con" ref={conRef} onScroll={onConScroll}>
            {/* 지난 실행 — 다시 돌릴 때마다 콘솔이 초기화되던 것을 고쳤다(지시).
                흐리게 그리고 가름선에 시각을 적어, 지금 것과 안 섞이게 한다. */}
            {/* 지난 실행 블록도 걷었다(지시) — 「이번 실행」 라벨 위로 지난 것이
                쌓여 그것이 곧 누적이었다. 이 판은 **고른 스텝의 지금 결과** 하나다. */}
            {/* **이번 실행에서 아무것도 안 돌았으면 아무것도 안 그린다.**
                예전엔 고른 스텝까지 무조건 그려서, 시작도 안 한 실행에
                「DUT# show system · (출력 없음)」 이 떠 있었다 — 보낸 적
                없는 명령이다(지적). */}
            {noneRan
              ? <pre className="ra-idle">아직 돌리지 않았습니다.</pre>
              : /* **고른 줄까지 쌓아** 보여 준다(지시) — 한 줄만 그리면 앞 명령의
                   출력이 사라져 무엇 다음에 무엇이 나왔는지 못 읽는다.
                   장비로 아무것도 안 나가는 줄(주석·메시지)은 건너뛴다.
                   다만 **지금 고른 줄은 그것이라도 보여 준다** — 눌렀는데
                   아무것도 안 나오면 고장으로 읽힌다. */
                /* 고른 줄까지 **빠짐없이** 쌓는다(지적: 스텝 1 이 안 보인다).
                   장비로 안 나가는 줄(주석·메시지)을 건너뛰었더니 첫 줄이
                   메시지인 시험에서 스텝 1 이 통째로 사라졌다 — 누적이라면
                   있는 그대로 이어져야 무엇 다음에 무엇인지 읽힌다. */
                steps
                  .slice(0, seeUpTo + 1)
                  .map((s2, k) => ({ s2, k }))
                  .filter(({ s2, k }) => !onlyBad || k === seeUpTo || /fail/i.test(String(s2.mark ?? '')))
                  .map(({ s2, k: seeUpTo }) => {
                /* 반복 안 스텝이면 **회차를 고를 수 있다**(지시).
                   기본은 마지막 회차 — 방금 돈 것이 궁금한 게 보통이다. */
                const rds = s2.rounds ?? []
                const at = rds.length ? (roundAt < 0 ? rds.length - 1 : Math.min(roundAt, rds.length - 1)) : -1
                const rd = at >= 0 ? rds[at] : undefined
                /* 장비로 안 나가는 줄은 「출력 없음」 이 아니라 **없는 것이 맞다**
                   — 무엇이 잘못된 줄 알고 찾게 두지 않는다(지적) */
                const quietKind = s2.kind === 'comment' || s2.kind === 'message'
                const body = rd
                  ? rd.trimmed
                    ? '(이 회차 출력은 안 남겼습니다 — 반복 스텝의 「회차 출력」 설정)'
                    : rd.output || '(출력 없음)'
                  : s2.out ||
                    (quietKind
                      ? '이 줄은 장비로 나가지 않습니다 — 결과서·로그에 쓰이는 글입니다.'
                      : seeUpTo === runStep
                        ? '…'
                        : '(출력 없음)')
                const mk = rd ? String(rd.status ?? '') : String(s2.mark ?? '')
                return (
                <div
                  /* 판정을 **왼쪽 세로 띠**로 보여 준다(지적: Pass 구분이 잘
                     안 된다). 오른쪽 끝 배지 하나로는 카드가 줄줄이 설 때
                     눈에 안 들어온다 — 시험 항목 표가 쓰는 것과 같은 언어다. */
                  className={`ra-blk${
                    mk ? (/pass/i.test(mk) ? ' v-pass' : ' v-fail') : ''
                  }`}
                  key={s2.no ?? seeUpTo}
                  ref={conEndRef}
                >
                <div className="ra-cmd">
                  {/* 주석은 번호를 안 먹는다(nos 가 비어 있다). 그때 s2.no 로
                      떨어지면 **다음 줄과 같은 번호**가 붙어 같은 스텝이 두
                      번 나온 것처럼 보였다(지적). 번호가 없으면 안 적는다. */}
                  {/* 펼 것이 있는 줄에만 화살표를 둔다 — 주석·메시지는 잴 것이 없다 */}
                  {s2.kind === 'comment' || s2.kind === 'message' ? (
                    <span className="ra-bcar" />
                  ) : (
                    <button
                      type="button"
                      className={`ra-bcar hit${folded.has(seeUpTo) ? '' : ' open'}`}
                      title={folded.has(seeUpTo) ? '펴기' : '접기'}
                      onClick={() =>
                        setFolded((f) => {
                          const n = new Set(f)
                          if (n.has(seeUpTo)) n.delete(seeUpTo)
                          else n.add(seeUpTo)
                          return n
                        })
                      }
                    >
                      <IconChevron />
                    </button>
                  )}
                  <b className="ra-bno">{nos[seeUpTo] ? `Step ${nos[seeUpTo]}` : '주석'}</b>
                  <span className="ra-bcmd">
                    {(() => {
                      /* 회차를 골랐으면 **그 회차에 보낸 명령**을 적는다(지시) */
                      const c2 = rd?.cmd || s2.cmd
                      /* 프롬프트는 **그 스텝이 붙은 장비** 것이다(지시: Response 도
                         해당 Session 의 결과). 판 하나에 DUT# 를 박아 두면 세션이
                         둘인 시험에서 어느 장비 앞인지 알 수 없다. */
                      const sd = devOf(s2.devId)
                      const pr = sd ? sd.name || sd.model || String(sd.id ?? '') : dut
                      /* 장비로 **안 나가는 줄**에는 프롬프트를 안 붙인다 —
                         주석·메시지에 `DUT# ` 가 붙어 마치 그 글을 명령으로
                         보낸 것처럼 보였다(지적). 그런 줄은 출력도 없다. */
                      /* 장비로 **안 나가는 갈래**에는 프롬프트를 안 붙인다 —
                         Diff·치환·대기도 명령이 아니라 셈이다(지적: DUT# 가 붙는다) */
                      const quiet = ['comment', 'message', 'diff', 'map', 'wait', 'if', 'else', 'loop'].includes(
                        String(s2.kind ?? ''),
                      )
                      if (quiet) return c2 || s2.t || s2.action || '—'
                      return c2 ? `${pr}# ${c2}` : s2.t || s2.action || '—'
                    })()}
                  </span>
                  {/* 실행 스텝 표가 하던 말을 머리가 받는다(승인) — 동작·세션·
                      걸린 시간. 판을 합치면서 잃을 것이 없어야 한다. */}
                  <span className="ra-bmeta">
                    {s2.action && s2.action !== '—' ? s2.action : ''}
                    {s2.session && s2.session !== '—' ? ` · ${s2.session}` : ''}
                  </span>
                  <span className="ra-btime">{tookText(s2.tookMs) || mmss(s2.took)}</span>
                  {mk ? (
                    <span className={`ra-st ${/pass/i.test(mk) ? 'ok' : 'bad'}`}>
                      {/pass/i.test(mk) ? 'PASS' : 'FAIL'}
                    </span>
                  ) : s2.kind === 'comment' || s2.kind === 'message' ? null : (
                    <span className="ra-bnone">판정 없음</span>
                  )}
                </div>
                {!folded.has(seeUpTo) && rds.length > 1 && (
                  <div className="ra-rds">
                    <span className="l">회차 {rds.length}회</span>
                    {rds.map((r, k) => (
                      <button
                        key={r.n ?? k}
                        type="button"
                        className={`ra-rd${k === at ? ' on' : ''}${/fail/i.test(String(r.status ?? '')) ? ' bad' : ''}`}
                        title={`${r.n ?? k + 1}회차${r.took_ms != null ? ` · ${r.took_ms}ms` : ''}`}
                        onClick={() => setRoundAt(k)}
                      >
                        {r.n ?? k + 1}
                      </button>
                    ))}
                  </div>
                )}
                {folded.has(seeUpTo) ? null : isWait(s2) ? (
                  <pre className="ra-wait">{waitLine(s2, seeUpTo)}</pre>
                ) : (
                  /* 시험 항목 화면과 **같은 부품**으로 그린다(지시: 실행
                     Response 에서는 블럭이 안 잡힌다). 여기서는 보기만 하므로
                     누를 거리는 넘기지 않는다. */
                  <pre>
                    <BlockText
                      text={body}
                      /* **기준·변수로 쓰인 값을 칠한다**(지시: iTest 처럼).
                         판정 기준 글(has == E6100 · 있으면 E6100)에서 값만
                         추려 견준다 — 연산자·말머리는 값이 아니다. */
                      markOf={(v, line) => {
                        const t = v.trim()
                        if (!t) return null
                        /* 기준을 **값 구절** 단위로 읽는다(지적: 여러 낱말짜리
                           has 값을 낱말로 쪼개니 notconnect·1·full 이 아무
                           데서나 칠해졌다). && 로 가른 절마다 말머리·연산자를
                           걷어 남는 구절 하나가 값이다. */
                        const KW =
                          /^(has|not|==|!=|>=|<=|>|<|있으면|없으면|같다|다르다|포함|포함한다|줄있음|줄수)$/i
                        const vals = String(s2.expected ?? '')
                          .split('&&')
                          .map((c0) => {
                            /* 줄 수 절은 값이 아니라 수라 칠할 것이 없다 */
                            const c1 = c0.trim().replace(/\s*\(줄수[^)]*\)\s*$/, '')
                            if (/^줄수(\s|$)/i.test(c1)) return ''
                            const w = c1.split(/\s+/)
                            while (w.length && KW.test(w[0]!)) w.shift()
                            return w.join(' ').replace(/^["']|["']$/g, '').trim()
                          })
                          .filter(Boolean)
                        const tN = t.replace(/\s+/g, ' ')
                        const lnN = ` ${String(line ?? '').replace(/\s+/g, ' ').trim()} `
                        const hit = vals.some((val) => {
                          const vN = val.replace(/\s+/g, ' ')
                          if (!vN.includes(' ')) return vN === tN // 한 낱말 값 — 지금까지처럼
                          /* 여러 낱말 값 — 그 구절이 **실제로 있는 줄**에서만,
                             구절에 든 조각만 칠한다 */
                          return lnN.includes(` ${vN} `) && ` ${vN} `.includes(` ${tN} `)
                        })
                        /* **판정 색으로 칠한다**(지시: 합격 초록·불합격 붉음).
                           불합격은 대개 찾는 값이 원문에 아예 없어 칠할 것이
                           없다 — 그때는 판정 기준 줄에서 붉게 보인다. */
                        if (hit) return /fail/i.test(String(mk)) ? 'not' : 'has'
                        if ((s2.vars ?? []).some((x) => x.name === t)) return 'var'
                        return null
                      }}
                    />
                  </pre>
                )}
                {/* **판정 기준 · 변수 · RCA**(승인) — 무엇으로 보았고, 무엇을
                    담았고, 그래서 어떻게 판정됐나. 셋을 한 격자에 두어 라벨이
                    세로로 맞는다. 접으면 머리만 남는다.
                    자리는 **출력 아래**(지시) — 명령의 결과를 먼저 읽고,
                    그것을 무엇으로 판정했는지가 그다음이다. */}
                {!folded.has(seeUpTo) &&
                  (() => {
                  const quiet2 = s2.kind === 'comment' || s2.kind === 'message'
                  if (quiet2) return null
                  const crit = String(s2.expected ?? '').trim()
                  const rca = String(rd?.reason ?? s2.reason ?? '').trim()
                  const vs = s2.vars ?? []
                  if (!crit && !rca && !vs.length) return null
                  /* 기준을 안 적은 스텝 — 조회 명령인지 아닌지로 말을 가른다(합의) */
                  const c0 = String(s2.cmd ?? '').trim().toLowerCase()
                  const calc = ['diff', 'map', 'wait', 'if', 'else', 'loop'].includes(String(s2.kind ?? ''))
                  const look = /^(show|display|get|dir|more)\b/.test(c0) || s2.action === 'SNMP Public'
                  return (
                    <div className="ra-why below">
                      <span className="k">판정 기준</span>
                      <span
                        className={
                          crit && crit !== '—' ? (mk && /fail/i.test(mk) ? 'bad' : '') : 'dim'
                        }
                      >
                        {crit && crit !== '—'
                          ? crit
                          : calc
                            ? '없음 — 판정하지 않습니다'
                            : look
                              ? '없음 — 조회만 합니다'
                              : '없음 — 클리어 및 실행만 합니다'}
                      </span>
                      {vs.length > 0 && (
                        <>
                          <span className="k">변수</span>
                          <span>
                            {vs.map((v, vi) => (
                              <span key={v.name}>
                                {vi > 0 ? ' · ' : ''}
                                <code>{v.name}</code>
                                {v.rule ? <i className="ra-vrule">{v.rule}</i> : null}
                              </span>
                            ))}
                          </span>
                        </>
                      )}
                      {!!rca && (
                        <>
                          <span className="k">RCA</span>
                          <span className={mk ? (/pass/i.test(mk) ? 'ok' : 'bad') : 'dim'}>
                            {/* 판정을 **글자 앞에 세운다**(지적: 가시성) — 62 줄을
                                훑을 때 색만으로는 눈에 안 걸린다 */}
                            {mk ? <i className="ra-rmk">{/pass/i.test(mk) ? '✓' : '✕'}</i> : null}
                            {rca}
                          </span>
                        </>
                      )}
                    </div>
                  )
                })()}
              </div>
              )})}
            {!steps.length && <pre>아직 출력이 없습니다.</pre>}
          </div>
          <div className={`ra-confoot${curStep?.mark ? (curStep.mark === 'Pass' ? ' ok' : ' bad') : ''}`}>
            {curStep?.mark
              ? curStep.mark === 'Pass'
                ? '기준 맞음'
                : '기준 어긋남'
              : '이 스텝에는 판정이 없습니다'}
          </div>
        </>
  )
}
