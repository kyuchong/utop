import { useEffect, useMemo, useRef, useState } from 'react'
import { prefGet, prefSet } from '@/lib/prefs'
import './RunAuto.css'

/**
 * **자동 시험 화면 — 네 판 작업대**(주신 목업).
 *
 *  실행 Step · CLI Response · 실행 이벤트 · 시험 항목
 *
 * 두 가지가 이 화면의 핵심이다.
 *  · **판 크기를 사람이 정한다** — 가운데 세로 분할바 하나, 좌우 가로
 *    분할바 각각. 셋이 따로 움직인다.
 *  · **판을 끌어 자리를 바꾼다** — 제목바를 끌어 다른 판에 떨어뜨리면
 *    둘이 맞바뀐다. 사람마다 보는 순서가 다르다.
 * 크기와 자리는 **계정별로** 남는다.
 *
 * 이벤트는 **지어내지 않는다.** 실행 로그의 스텝에서 뽑는다 — 로그가
 * 없으면 없다고 적는다.
 */

export interface AutoStep {
  no: number
  t: string
  cmd?: string
  out?: string
  mark?: string
  action?: string
  session?: string
  expected?: string
  at?: string
  took?: string
  /** 「대기」 스텝이 기다리기로 한 초. 카운트다운은 이 값에서 내려온다 */
  waitSec?: number
  /** 실제로 돌았나 — 판정이 없는 스텝과 안 돌린 스텝을 가른다 */
  ran?: boolean
  /** 비교 스텝이 통과·실패일 때 적어 둔 문구 */
  okMsg?: string
  ngMsg?: string
}

export interface AutoItem {
  id: string
  name: string
  group: string
  /** 이 항목의 결과 — 아이콘과 알약이 이걸 그린다 */
  verdict: 'p' | 'f' | 'b' | 'n'
  /** 언제 판정했나 — `2026-09-03 18:04:42`. 목업이 이 자리에 적는 값이다 */
  at?: string
}

type SlotId = 'LT' | 'LB' | 'RT' | 'RB'
type PanelId = 'steps' | 'response' | 'events' | 'tc'
const DEFAULT: Record<SlotId, PanelId> = { LT: 'steps', LB: 'events', RT: 'response', RB: 'tc' }
const TITLE: Record<PanelId, string> = {
  steps: '실행 Step',
  response: 'CLI Response',
  events: '실행 이벤트',
  tc: '시험 항목',
}
const RESN: Record<string, string> = { p: 'PASS', f: 'FAIL', b: '기타', n: 'WAIT' }
/** 걸린 시간 — **분:초**(지시). 「20.01s」 보다 「00:20」 이 표에서 줄이 맞는다.
 *  1초가 안 걸린 스텝은 00:00 이다 — 그건 정말 순식간이라는 뜻이다. */
function mmss(v?: string): string {
  const raw = String(v ?? '').trim()
  if (!raw) return '—'
  const sec = Number(raw.replace(/s$/, ''))
  if (!Number.isFinite(sec)) return raw
  const t = Math.round(sec)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(Math.floor(t / 60))}:${p(t % 60)}`
}
/** 이벤트 시각 — **연월일까지**(지시). 시분초만 있으면 어제 것인지 오늘
 *  것인지 알 수 없다. 자료에 ISO('…T08:01:41Z')와 'YYYY-MM-DD HH:MM:SS'
 *  두 꼴이 섞여 있어 둘 다 받는다. */
function stamp(v?: string): string {
  const raw = String(v ?? '').trim()
  if (!raw) return '—'
  const d = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return raw.slice(0, 19) || '—'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
/** 항목 판정 아이콘(지시).
 *  통과 = 초록 동그라미 + 흰 체크 · 실패 = 빨간 동그라미 + 흰 ✕
 *  글자(✓ !)로 그리면 글꼴에 따라 크기·굵기가 제각각이라 그림으로 그린다.
 */
function Verdict({ v }: { v: string }) {
  const title = v === 'p' ? '통과' : v === 'f' ? '실패' : v === 'b' ? '기타' : '아직 안 돌림'
  return (
    <span className={`ra-dot ${v}`} title={title} aria-label={title}>
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="8" />
        {v === 'p' ? (
          <path d="M4.2 8.3l2.5 2.5 5.1-5.1" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        ) : v === 'f' ? (
          <path d="M5.2 5.2l5.6 5.6M10.8 5.2l-5.6 5.6" fill="none" strokeWidth="2" strokeLinecap="round" />
        ) : v === 'b' ? (
          <path d="M8 4.2v4.6M8 11.2v.6" fill="none" strokeWidth="2" strokeLinecap="round" />
        ) : (
          <circle cx="8" cy="8" r="2.1" className="ra-dotc" />
        )}
      </svg>
    </span>
  )
}

/** 지금 도는 것을 알리는 표시 — 스텝 표와 항목 목록이 **같은 모양**을 쓴다 */
function RunMark() {
  return (
    <span className="ra-st run">
      <i />
      RUN
    </span>
  )
}

/** 거르개 이름표 — 실행 화면과 같은 말(PASS·FAIL·대기) */
const FLT_LABEL: Record<'all' | 'p' | 'f' | 'n', string> = {
  all: '전체',
  p: 'PASS',
  f: 'FAIL',
  n: '대기',
}
const FLT_N = (t: { total: number; p: number; f: number; n: number }) => ({
  all: t.total,
  p: t.p,
  f: t.f,
  n: t.n,
})

export default function RunAuto({
  items, cur, onPick, steps, stepAt, onStep, dut, logAt,
  runStep, runItem, past, waitAt,
}: {
  /** 지난 실행의 출력 — 콘솔이 이번 것 **위에** 이어 쌓는다 */
  past?: Array<{ at: string; steps: AutoStep[] }>
  /** 실행기가 **지금 돌고 있는** 스텝 자리(0부터). 안 돌면 없다 */
  runStep?: number | null
  /** 실행기가 지금 돌고 있는 항목 id */
  runItem?: string | null
  /** 대기 스텝을 **언제부터** 도는가(ms). 위 판이 기억해 준다 —
   *  여기서 세면 다른 항목을 봤다 오는 순간 다시 0 부터 센다. */
  waitAt?: number | null
  items: AutoItem[]
  cur: string
  onPick: (id: string) => void
  steps: AutoStep[]
  stepAt: number
  onStep: (i: number) => void
  /** 콘솔 프롬프트에 쓸 장비 이름 */
  dut: string
  /** 이 항목을 언제 돌렸나 */
  logAt?: string
}) {
  /* ── 판 자리 · 크기 (계정별) ── */
  const [slots, setSlots] = useState<Record<SlotId, PanelId>>(() => {
    try {
      const j = JSON.parse(prefGet('utop.run.dock') ?? '{}') as Partial<Record<SlotId, PanelId>>
      return { ...DEFAULT, ...j }
    } catch {
      return { ...DEFAULT }
    }
  })
  const [size, setSize] = useState(() => ({
    /* 왼쪽(실행 Step) 을 좁힌다(지시). CLI 출력이 길어 오른쪽이 더 넓어야
       읽힌다 — 55 → 42. 사람이 분할바로 옮기면 그 값이 남는다. */
    v: Number(prefGet('utop.run.dock.v') ?? '') || 42,
    l: Number(prefGet('utop.run.dock.l') ?? '') || 56,
    r: Number(prefGet('utop.run.dock.r') ?? '') || 64,
  }))
  const deskRef = useRef<HTMLDivElement>(null)
  const lRef = useRef<HTMLDivElement>(null)
  const rRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<'v' | 'l' | 'r' | null>(null)
  const [over, setOver] = useState<SlotId | null>(null)

  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
  const startSash = (m: 'v' | 'l' | 'r') => (e: React.MouseEvent) => {
    e.preventDefault()
    setDrag(m)
    const move = (ev: MouseEvent) => {
      if (m === 'v') {
        const r = deskRef.current?.getBoundingClientRect()
        if (r) setSize((s) => ({ ...s, v: clamp(((ev.clientX - r.left) / r.width) * 100, 25, 75) }))
      } else {
        const el = (m === 'l' ? lRef : rRef).current?.getBoundingClientRect()
        if (el)
          setSize((s) => ({ ...s, [m]: clamp(((ev.clientY - el.top) / el.height) * 100, 20, 80) }))
      }
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      setDrag(null)
      setSize((s) => {
        prefSet('utop.run.dock.v', String(Math.round(s.v)))
        prefSet('utop.run.dock.l', String(Math.round(s.l)))
        prefSet('utop.run.dock.r', String(Math.round(s.r)))
        return s
      })
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  /** 제목바를 끌어 떨어뜨리면 두 판이 맞바뀐다 */
  const swap = (to: SlotId, what: PanelId) => {
    const from = (Object.keys(slots) as SlotId[]).find((k) => slots[k] === what)
    if (!from || from === to) return
    const next = { ...slots, [to]: what, [from]: slots[to] }
    setSlots(next)
    prefSet('utop.run.dock', JSON.stringify(next))
  }

  /* ── 집계 · 이벤트 ── */
  const tal = useMemo(() => {
    const t = { p: 0, f: 0, b: 0, n: 0, total: items.length }
    for (const it of items) t[it.verdict]++
    return t
  }, [items])
  /* 진행률은 위 띠(RunDetail)가 그린다 — 여기서 또 세지 않는다 */

  /** 이벤트 — 로그의 스텝에서 뽑는다(지어내지 않는다) */
  const events = useMemo(() => {
    const out: Array<{ at: string; step: string; kind: string; text: string }> = []
    steps.forEach((s, i) => {
      /* **돈 스텝만** 적는다. 명령이 적혀 있다고 보낸 것은 아니다 —
         아직 안 온 스텝까지 「보냄」 으로 찍혀, 2번이 도는데 5번까지 다
         나와 있었다(지적). 지금 도는 스텝은 「보냄」 까지는 맞다. */
      if (!s.ran && i !== runStep) return
      const at = s.at ?? logAt ?? ''
      if (s.cmd) out.push({ at, step: `Step ${s.no}`, kind: 'INFO', text: `${s.cmd} 보냄` })
      if (s.mark)
        out.push({
          at,
          step: `Step ${s.no}`,
          kind: s.mark === 'Pass' ? 'PASS' : 'FAIL',
          /* 사람이 적어 둔 판정 문구가 있으면 **그것**을 적는다(지시).
             「기준 맞음」 은 아무것도 안 알려 준다 — 무엇이 왜 맞았는지는
             그 문구에 있다. 없을 때만 기본 말로 떨어진다. */
          text:
            s.mark === 'Pass'
              ? s.okMsg || `${s.t} — 기준 맞음`
              : s.ngMsg || `${s.t} — 기준 어긋남`,
        })
    })
    return out
  }, [steps, logAt, runStep])

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

  /** 콘솔에 그릴 마지막 스텝.
   *
   *  예전엔 **보던 스텝까지만** 쌓았다. 그래서 항목이 다음으로 넘어가면
   *  뒤 스텝(SNMP·비교)의 출력이 통째로 안 보여, 그것들이 돌았는지 알 수
   *  없었다(지적). **돈 스텝은 전부 보인다** — 지금 보는 자리와 실제로
   *  돈 마지막 자리 중 더 뒤쪽까지 쌓는다.
   */
  const lastRan = steps.reduce((acc, s2, i) => (s2.ran || s2.out ? i : acc), -1)
  /** 이번 실행에서 **한 줄도 안 돌았나.** 돌고 있지도 않고 돈 자취도 없으면
   *  콘솔에는 그릴 것이 없다 — 정의만 보고 명령을 미리 찍으면 안 된다. */
  const noneRan = runStep == null && lastRan < 0 && !(past ?? []).length
  const seeUpTo = Math.min(
    /* **돌고 있으면 거기서 끊는다.** 뒤 스텝에 남아 있는 것은 지난 실행의
       출력이라, 그대로 이어 붙이면 지금 나온 것과 섞인다(지적: 대기 20 19
       18 밑에 벌써 show memory usage 결과가 붙어 있었다).
       다 돌았거나 안 돌 때만 마지막까지 펼친다. */
    runStep != null ? runStep : Math.max(stepAt, lastRan),
    Math.max(0, steps.length - 1),
  )
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
  }, [seeUpTo, cur])

  /** 도는 줄을 눈에 들어오게 끌어온다 — 스텝이 많으면 밑으로 흘러 안 보인다 */
  const runRowRef = useRef<HTMLTableRowElement>(null)
  useEffect(() => {
    if (runStep == null) return
    runRowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [runStep])

  const curStep = steps[Math.min(stepAt, Math.max(0, steps.length - 1))]
  /** 시험 항목 거르개 — 목업의 그 고르개(전체·PASS·FAIL·대기).
      항목이 수십 건이면 「실패한 것만」 보고 싶은데 그 자리가 없었다. */
  const [flt, setFlt] = useState<'all' | 'p' | 'f' | 'n'>('all')
  /** 거르개 목록이 열린 자리. **직접 그린다** — 브라우저 기본 select 의
      목록은 OS 가 그려서 이 화면의 결과 전혀 안 맞는다(지적). */
  const [fltAt, setFltAt] = useState<{ x: number; y: number } | null>(null)
  useEffect(() => {
    if (!fltAt) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setFltAt(null)
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [fltAt])
  const shownItems = useMemo(
    () => (flt === 'all' ? items : items.filter((it) => it.verdict === flt)),
    [items, flt],
  )
  const groups = useMemo(() => {
    const m = new Map<string, AutoItem[]>()
    for (const it of shownItems) m.set(it.group, [...(m.get(it.group) ?? []), it])
    return [...m.entries()]
  }, [shownItems])

  /* ── 판 그리기 ── */
  const body = (id: PanelId) => {
    if (id === 'steps')
      return (
        <div className="ra-scroll">
          {steps.length ? (
            <table className="ra-tbl">
              <thead>
                <tr>
                  <th style={{ width: 34 }}>#</th>
                  <th style={{ width: 84 }}>Action</th>
                  <th style={{ width: 66 }}>Session</th>
                  <th>Description</th>
                  <th>Expected Result</th>
                  <th style={{ width: 74 }}>Status</th>
                  <th style={{ width: 62 }}>Time</th>
                </tr>
              </thead>
              <tbody>
                {steps.map((s, i) => (
                  <tr
                    key={s.no ?? i}
                    ref={i === runStep ? runRowRef : undefined}
                    className={
                      i === runStep ? 'ra-running' : i === stepAt ? 'ra-on' : undefined
                    }
                    onClick={() => onStep(i)}
                  >
                    <td>{s.no ?? i + 1}</td>
                    <td>
                      <b>{s.action ?? (s.cmd ? 'command' : '—')}</b>
                    </td>
                    <td>{s.session ?? '—'}</td>
                    <td>{s.cmd || s.t || `스텝 ${i + 1}`}</td>
                    <td>{s.expected ?? '—'}</td>
                    <td>
                      {i === runStep ? (
                        <span className="ra-st run">
                          <i />
                          RUN
                        </span>
                      ) : (
                        /* 판정이 있으면 PASS·FAIL, 없어도 **돌았으면 완료**다.
                           WAIT 는 아직 안 돌린 것만 — 안 그러면 건너뛴 것처럼 보인다. */
                        <span
                          className={`ra-st ${
                            s.mark === 'Pass' ? 'ok' : s.mark === 'Fail' ? 'bad' : s.ran ? 'done' : 'wait'
                          }`}
                          title={
                            s.mark || !s.ran
                              ? undefined
                              : '돌았습니다 — 이 스텝에는 견줄 기준이 없어 판정이 없습니다'
                          }
                        >
                          {s.mark === 'Pass' ? 'PASS' : s.mark === 'Fail' ? 'FAIL' : s.ran ? '완료' : 'WAIT'}
                        </span>
                      )}
                    </td>
                    <td className="ra-num">{mmss(s.took)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="ra-empty">스텝이 없습니다 — 이 항목은 아직 안 돌렸습니다.</div>
          )}
        </div>
      )

    if (id === 'response')
      return (
        <>
          {/* 콘솔은 **이어진다**(지시). 스텝마다 판을 갈아 끼우면 앞 명령의
              출력이 사라져, 무엇 다음에 무엇이 나왔는지 못 읽는다.
              지금 보는 스텝까지를 차례로 쌓고, 그 자리로 끌어 준다. */}
          <div className="ra-con" ref={conRef} onScroll={onConScroll}>
            {/* 지난 실행 — 다시 돌릴 때마다 콘솔이 초기화되던 것을 고쳤다(지시).
                흐리게 그리고 가름선에 시각을 적어, 지금 것과 안 섞이게 한다. */}
            {(past ?? []).map((p2, pi) => (
              <div className="ra-past" key={`p${pi}`}>
                <div className="ra-pastl">지난 실행{p2.at ? ` · ${p2.at}` : ''}</div>
                {p2.steps.map((s2, i2) => (
                  <div className="ra-blk" key={`p${pi}s${i2}`}>
                    {s2.cmd ? (
                      <div className="ra-cmd">
                        {dut}# {s2.cmd}
                      </div>
                    ) : null}
                    <pre>{s2.out || '(출력 없음)'}</pre>
                  </div>
                ))}
              </div>
            ))}
            {!!(past ?? []).length && <div className="ra-pastl now">이번 실행</div>}
            {/* **이번 실행에서 아무것도 안 돌았으면 아무것도 안 그린다.**
                예전엔 고른 스텝까지 무조건 그려서, 시작도 안 한 실행에
                「DUT# show system · (출력 없음)」 이 떠 있었다 — 보낸 적
                없는 명령이다(지적). */}
            {noneRan
              ? <pre className="ra-idle">아직 돌리지 않았습니다.</pre>
              : steps.slice(0, Math.max(0, seeUpTo) + 1).map((s2, i2) => (
              <div className={`ra-blk${i2 === seeUpTo ? ' on' : ''}`} key={s2.no ?? i2} ref={i2 === seeUpTo ? conEndRef : undefined}>
                {s2.cmd ? (
                  <div className="ra-cmd">
                    {dut}# {s2.cmd}
                  </div>
                ) : null}
                {isWait(s2) ? (
                  <pre className="ra-wait">{waitLine(s2, i2)}</pre>
                ) : (
                  <pre>{s2.out || (i2 === runStep ? '…' : '(출력 없음)')}</pre>
                )}
              </div>
              ))}
            {!steps.length && <pre>아직 출력이 없습니다.</pre>}
          </div>
          <div className="ra-confoot">
            {curStep?.mark
              ? curStep.mark === 'Pass'
                ? '기준 맞음'
                : '기준 어긋남'
              : '이 스텝에는 판정이 없습니다'}
          </div>
        </>
      )

    if (id === 'events')
      return (
        /* 거르개를 뺐다(지시) — 줄이 몇 개 안 되고, 어차피 다 읽는다.
           칸도 좁혔다: 시각은 시:분:초면 되고 결과는 알약 폭이면 된다. */
        <div className="ra-scroll">
          {events.length ? (
            <table className="ra-tbl ra-evt">
              <thead>
                <tr>
                  <th style={{ width: 152 }}>시각</th>
                  <th style={{ width: 52 }}>Step</th>
                  <th style={{ width: 54 }}>결과</th>
                  <th>세부 내역</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e, i2) => (
                  <tr key={i2}>
                    <td className="ra-num">{stamp(e.at)}</td>
                    <td>{e.step}</td>
                    <td>
                      <span className={`ra-ev ${e.kind}`}>{e.kind.toUpperCase()}</span>
                    </td>
                    <td>{e.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="ra-none">남은 이벤트가 없습니다 — 실행 로그가 쌓이면 여기에 줄이 생깁니다.</div>
          )}
        </div>
      )

    /* 시험 항목 */
    return (
      <>
        {/* 「고른 항목 판정」 줄을 뺐다(지시). 자동 시험의 결과는 실행기가
            내는 것이라, 사람이 여기서 덮어쓸 자리가 아니다. 손으로 고쳐야
            하면 그건 수동 시험이다. */}
        <div className="ra-scroll">
          {!groups.length && (
            <div className="ra-none">그 결과의 항목이 없습니다.</div>
          )}
          {groups.map(([g, arr]) => (
            <div key={g}>
              {/* 묶음 옆 「1/2」 를 뺐다(지시) — 판 제목에 Pass·Fail·대기 가
                  이미 적혀 있어 같은 값을 두 번 세는 셈이다. */}
              <div className="ra-grp">
                <span>{g}</span>
              </div>
              {arr.map((it) => (
                <button
                  type="button"
                  key={it.id}
                  className={`ra-tc${it.id === cur ? ' on' : ''}${it.id === runItem ? ' running' : ''}`}
                  onClick={() => onPick(it.id)}
                >
                  <Verdict v={it.verdict} />
                  <span className="ra-tcid">{it.id}</span>
                  <span className="ra-tcnm">{it.name}</span>
                  {/* 이 자리는 **판정 시각**이다(지적). 걸린 시간은 안 적는다 —
                      스텝 표의 Time 칸이 이미 그것을 말한다. */}
                  {it.at ? <span className="ra-tct">{it.at}</span> : null}
                  {it.id === runItem ? <RunMark /> : (
                    <span className={`ra-res ${it.verdict}`}>{RESN[it.verdict]}</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      </>
    )
  }

  /** 거르개 목록 — 판 밖에 그린다(판은 overflow:hidden 이라 안에서 잘린다) */
  const fltMenu = fltAt ? (
    <>
      <span className="ra-fovl" role="presentation" onClick={() => setFltAt(null)} />
      <div className="ra-fmenu" role="menu" style={{ left: fltAt.x, top: fltAt.y }}>
        {(['all', 'p', 'f', 'n'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="menuitemradio"
            aria-checked={flt === k}
            className={flt === k ? 'on' : ''}
            onClick={() => {
              setFlt(k)
              setFltAt(null)
            }}
          >
            <i className={`d ${k}`} aria-hidden="true" />
            <span className="l">{FLT_LABEL[k]}</span>
            <b className="n">{FLT_N(tal)[k]}</b>
          </button>
        ))}
      </div>
    </>
  ) : null

  /** 판 제목 옆 꼬리말 — 목업의 「CLI Response · Step 3 Live」 자리 */
  const subOf = (p: PanelId): string => {
    if (p === 'steps') return cur || ''
    if (p === 'response') {
      if (!steps.length) return ''
      /* action 이 「—」 인 스텝이 있다 — 그대로 붙이면 「Step 1 · —」 가 된다 */
      const a = String(curStep?.action ?? '').trim()
      return `Step ${stepAt + 1}${a && a !== '—' ? ` · ${a}` : ''}`
    }
    if (p === 'events') return events.length ? `${events.length}줄` : ''
    return `Pass ${tal.p} · Fail ${tal.f} · 대기 ${tal.n}`
  }

  const panel = (slot: SlotId) => {
    const id = slots[slot]
    return (
      <div
        className={`ra-slot${over === slot ? ' over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(slot)
        }}
        onDragLeave={() => setOver((s) => (s === slot ? null : s))}
        onDrop={(e) => {
          e.preventDefault()
          setOver(null)
          const what = e.dataTransfer.getData('text/plain') as PanelId
          if (what) swap(slot, what)
        }}
      >
        <section className="ra-panel">
          <header
            draggable
            onDragStart={(e) => e.dataTransfer.setData('text/plain', id)}
            title="끌어서 다른 판과 자리를 바꿉니다"
          >
            <b>{TITLE[id]}</b>
            {/* 목업처럼 판마다 「무엇을 보는 중인지」 를 제목 옆에 적는다 */}
            {!!subOf(id) && <small>· {subOf(id)}</small>}
            <span className="ra-sp" />
            {id === 'tc' && (
              <button
                type="button"
                className={`ra-fsel${flt === 'all' ? '' : ' on'}`}
                title="이 결과의 항목만 봅니다"
                /* 머리줄은 끌어서 자리를 바꾸는 손잡이다 — 고르개를 누를 때
                   드래그가 걸리면 목록이 안 열린다. 여기서 멈춘다. */
                draggable={false}
                onDragStart={(e) => e.preventDefault()}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  const b = e.currentTarget.getBoundingClientRect()
                  setFltAt((v) => (v ? null : { x: b.right, y: b.bottom + 5 }))
                }}
              >
                <span className="l">{FLT_LABEL[flt]}</span>
                <b className="n">{FLT_N(tal)[flt]}</b>
                <i className="c" aria-hidden="true" />
              </button>
            )}
            <span className="ra-grab">이동</span>
          </header>
          {body(id)}
        </section>
      </div>
    )
  }

  return (
    <div className="ra">
      {/* 위 띠는 **RunDetail 한 곳**에 있다(목업도 띠는 하나다). 여기에도
          두었더니 경과·진행이 두 줄로 겹쳐 보였다(지적). */}
      {/* ── 아래: 네 판 작업대 ── */}
      <div className="ra-desk" ref={deskRef}>
        <div className="ra-col" ref={lRef} style={{ width: `${size.v}%` }}>
          <div style={{ height: `${size.l}%`, minHeight: 0 }}>{panel('LT')}</div>
          <div className={`ra-hsash${drag === 'l' ? ' on' : ''}`} onMouseDown={startSash('l')} />
          <div style={{ flex: 1, minHeight: 0 }}>{panel('LB')}</div>
        </div>
        <div className={`ra-vsash${drag === 'v' ? ' on' : ''}`} onMouseDown={startSash('v')} />
        <div className="ra-col" ref={rRef} style={{ flex: 1 }}>
          <div style={{ height: `${size.r}%`, minHeight: 0 }}>{panel('RT')}</div>
          <div className={`ra-hsash${drag === 'r' ? ' on' : ''}`} onMouseDown={startSash('r')} />
          <div style={{ flex: 1, minHeight: 0 }}>{panel('RB')}</div>
        </div>
      </div>
      {fltMenu}
    </div>
  )
}
