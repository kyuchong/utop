import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
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
  /* ── 판 배치 (계정별) — iTest 꼴 도킹(지시): 열 배열, 열 안은 위→아래.
     판 머리를 끌어 다른 판의 왼쪽·오른쪽(새 열)·위·아래(같은 열)·가운데
     (맞바꿈)에 떨어뜨려 마음대로 배치한다. ── */
  const [lay, setLayRaw] = useState<PanelId[][]>(() => {
    const ALL: PanelId[] = ['steps', 'response', 'events', 'tc']
    try {
      const j = JSON.parse(prefGet('utop.run.lay') ?? '') as PanelId[][]
      const flat = j.flat()
      if (
        Array.isArray(j) && j.every((c) => Array.isArray(c)) &&
        flat.length === 4 && new Set(flat).size === 4 && ALL.every((x) => flat.includes(x))
      )
        return j.filter((c) => c.length)
    } catch {
      /* 처음이거나 옛 저장 — 아래에서 잇는다 */
    }
    try {
      const j = JSON.parse(prefGet('utop.run.dock') ?? '{}') as Partial<Record<SlotId, PanelId>>
      const d = { ...DEFAULT, ...j }
      return [[d.LT, d.LB], [d.RT, d.RB]]
    } catch {
      return [[DEFAULT.LT, DEFAULT.LB], [DEFAULT.RT, DEFAULT.RB]]
    }
  })
  const setLay = (nx: PanelId[][]) => {
    const c = nx.filter((col) => col.length)
    setLayRaw(c)
    try {
      prefSet('utop.run.lay', JSON.stringify(c))
    } catch {
      /* 사생활 보호 모드 */
    }
  }
  /* 열 너비(%)·열 안 첫 판 높이(%) — 열 구성이 바뀌면 너비는 고르게 되돌아간다 */
  const [ws, setWs] = useState<number[]>(() => {
    try {
      const j = JSON.parse(prefGet('utop.run.ws') ?? '') as number[]
      if (Array.isArray(j) && j.every((x) => Number.isFinite(x))) return j
    } catch {
      /* 옛 세로 분할값에서 잇는다 */
    }
    const v = Number(prefGet('utop.run.dock.v') ?? '') || 42
    return [v, 100 - v]
  })
  const [rs, setRs] = useState<Record<string, number>>(() => {
    try {
      const j = JSON.parse(prefGet('utop.run.rs') ?? '') as Record<string, number>
      if (j && typeof j === 'object') return j
    } catch {
      /* 옛 가로 분할값에서 잇는다 */
    }
    return {
      '0': Number(prefGet('utop.run.dock.l') ?? '') || 56,
      '1': Number(prefGet('utop.run.dock.r') ?? '') || 64,
    }
  })
  const deskRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<string | null>(null)
  /* 끌리는 판·드롭존 표시 */
  const [dragPane, setDragPane] = useState<PanelId | null>(null)
  const [dz, setDz] = useState<{ id: PanelId; z: 'L' | 'R' | 'T' | 'B' | 'C' } | null>(null)
  /* 내린 판 — 안 보는 판은 아래 띠로 내려 둔다(지시). 계정에 남는다 */
  const [hid, setHid] = useState<Set<PanelId>>(() => {
    try {
      return new Set(JSON.parse(prefGet('utop.run.hid') ?? '[]') as PanelId[])
    } catch {
      return new Set()
    }
  })
  const saveHid = (nx: Set<PanelId>) => {
    setHid(nx)
    try {
      prefSet('utop.run.hid', JSON.stringify([...nx]))
    } catch {
      /* 사생활 보호 모드 */
    }
  }
  const paneDown = (id: PanelId) => saveHid(new Set([...hid, id]))
  const paneUp = (id: PanelId) => {
    const nx = new Set(hid)
    nx.delete(id)
    saveHid(nx)
  }

  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
  /* 화면에 실제로 서는 열들 — 내린 판은 비운다. 판 → 몇 번째 열인지도 같이 */
  const visCols = lay.map((c) => c.filter((x) => !hid.has(x))).filter((c) => c.length)
  const colW = (i: number, n: number) => (ws.length === n ? ws[i]! : 100 / n)
  const rowPct = (ci: number) => clamp(Number(rs[String(ci)] ?? 50) || 50, 20, 80)

  /* 열 사이 세로 분할바 */
  const startColSash = (leftIdx: number, n: number) => (e: React.MouseEvent) => {
    e.preventDefault()
    setDrag(`c${leftIdx}`)
    const move = (ev: MouseEvent) => {
      const r = deskRef.current?.getBoundingClientRect()
      if (!r) return
      const eff = Array.from({ length: n }, (_, i) => colW(i, n))
      const before = eff.slice(0, leftIdx).reduce((a, b) => a + b, 0)
      const want = clamp(((ev.clientX - r.left) / r.width) * 100 - before, 12, eff[leftIdx]! + eff[leftIdx + 1]! - 12)
      const delta = want - eff[leftIdx]!
      eff[leftIdx] = eff[leftIdx]! + delta
      eff[leftIdx + 1] = eff[leftIdx + 1]! - delta
      setWs(eff)
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      setDrag(null)
      setWs((cur) => {
        try {
          prefSet('utop.run.ws', JSON.stringify(cur.map((x) => Math.round(x))))
        } catch {
          /* 사생활 보호 모드 */
        }
        return cur
      })
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }
  /* 열 안(두 판) 가로 분할바 */
  const startRowSash = (ci: number) => (e: React.MouseEvent) => {
    e.preventDefault()
    setDrag(`r${ci}`)
    const colEl = (e.currentTarget as HTMLElement).parentElement
    const move = (ev: MouseEvent) => {
      const r = colEl?.getBoundingClientRect()
      if (!r) return
      setRs((cur) => ({ ...cur, [String(ci)]: clamp(((ev.clientY - r.top) / r.height) * 100, 20, 80) }))
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      setDrag(null)
      setRs((cur) => {
        try {
          prefSet('utop.run.rs', JSON.stringify(cur))
        } catch {
          /* 사생활 보호 모드 */
        }
        return cur
      })
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  /** 끌어다 붙이기 — 가운데=맞바꿈 · 위/아래=같은 열에 끼움 · 왼/오른쪽=새 열 */
  const place = (what: PanelId, target: PanelId, z: 'L' | 'R' | 'T' | 'B' | 'C') => {
    if (what === target) return
    if (z === 'C') {
      const nx = lay.map((c) => [...c])
      let pw: [number, number] | null = null
      let pt: [number, number] | null = null
      nx.forEach((c, i) => c.forEach((x, j) => {
        if (x === what) pw = [i, j]
        if (x === target) pt = [i, j]
      }))
      if (pw && pt) {
        nx[pw[0]]![pw[1]] = target
        nx[pt[0]]![pt[1]] = what
        setLay(nx)
      }
      return
    }
    const cur = lay.map((c) => c.filter((x) => x !== what))
    const ci = cur.findIndex((c) => c.includes(target))
    if (ci < 0) return
    if (z === 'T' || z === 'B') {
      const col = [...cur[ci]!]
      col.splice(col.indexOf(target) + (z === 'B' ? 1 : 0), 0, what)
      const nx = [...cur]
      nx[ci] = col
      setLay(nx)
      return
    }
    const nx = [...cur]
    nx.splice(ci + (z === 'R' ? 1 : 0), 0, [what])
    setLay(nx)
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
    /* **받은 차례를 절대 안 바꾼다** — 이어지는 같은 묶음만 한 덩이로 접는다.
       Map 으로 묶었더니 이름이 같은 다른 REQ 의 항목을 위로 끌어 붙여,
       실행기는 제 차례로 도는데 화면의 파란 강조가 목록을 건너뛰며
       오르내렸다(지적: 왔다갔다 실행한다 — 의 두 번째 얼굴). */
    const out: Array<[string, AutoItem[]]> = []
    for (const it of shownItems) {
      const last = out[out.length - 1]
      if (last && last[0] === it.group) last[1].push(it)
      else out.push([it.group, [it]])
    }
    return out
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
                  <th style={{ width: 30 }}>#</th>
                  {/* Action 은 「SNMP Public」 처럼 두 마디짜리가 있다 — 접히면
                      그 줄만 두 줄이 되어 표가 들쭉날쭉해진다(지적). 한 줄로 세운다 */}
                  <th className="ra-act" style={{ width: 78 }}>Action</th>
                  <th style={{ width: 58 }}>Session</th>
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
                    <td className="ra-act">
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

  const panel = (id: PanelId) => {
    return (
      <div
        className="ra-slot"
        onDragOver={(e) => {
          if (!dragPane || dragPane === id) return
          e.preventDefault()
          const r = e.currentTarget.getBoundingClientRect()
          const x = (e.clientX - r.left) / Math.max(1, r.width)
          const y = (e.clientY - r.top) / Math.max(1, r.height)
          const z = x < 0.25 ? 'L' : x > 0.75 ? 'R' : y < 0.35 ? 'T' : y > 0.65 ? 'B' : 'C'
          setDz((d) => (d?.id === id && d.z === z ? d : { id, z }))
        }}
        onDragLeave={() => setDz((d) => (d?.id === id ? null : d))}
        onDrop={(e) => {
          e.preventDefault()
          const what = e.dataTransfer.getData('text/plain') as PanelId
          const z = dz?.id === id ? dz.z : 'C'
          setDz(null)
          setDragPane(null)
          if (what) place(what, id, z)
        }}
      >
        <section className="ra-panel">
          <header
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', id)
              setDragPane(id)
            }}
            onDragEnd={() => {
              setDragPane(null)
              setDz(null)
            }}
            title="끌어서 원하는 자리에 붙입니다 — 가운데는 맞바꿈, 가장자리는 그쪽에 붙이기"
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
            <button
              type="button"
              className="ra-minb"
              title="이 판을 아래로 내립니다"
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => paneDown(id)}
            >
              ⌄
            </button>
            <span className="ra-grab">이동</span>
          </header>
          {body(id)}
        </section>
        {dz?.id === id && dragPane && dragPane !== id && <div className={`ra-dz ${dz.z}`} aria-hidden="true" />}
      </div>
    )
  }

  return (
    <div className="ra">
      {/* 위 띠는 **RunDetail 한 곳**에 있다(목업도 띠는 하나다). 여기에도
          두었더니 경과·진행이 두 줄로 겹쳐 보였다(지적). */}
      {/* ── 아래: 판 작업대 — lay(열 배열) 그대로. 내린 판은 비운다 ── */}
      <div className="ra-desk" ref={deskRef}>
        {visCols.map((col, i) => (
          <Fragment key={col.join('-')}>
            {i > 0 && (
              <div className={`ra-vsash${drag === `c${i - 1}` ? ' on' : ''}`} onMouseDown={startColSash(i - 1, visCols.length)} />
            )}
            <div
              className="ra-col"
              style={i < visCols.length - 1 ? { width: `${colW(i, visCols.length)}%` } : { flex: 1 }}
            >
              {col.map((pid, j) => (
                <Fragment key={pid}>
                  {j > 0 && col.length === 2 && (
                    <div className={`ra-hsash${drag === `r${i}` ? ' on' : ''}`} onMouseDown={startRowSash(i)} />
                  )}
                  {j > 0 && col.length !== 2 && <div className="ra-hsash off" aria-hidden="true" />}
                  <div
                    style={
                      col.length === 2
                        ? j === 0
                          ? { height: `${rowPct(i)}%`, minHeight: 0 }
                          : { flex: 1, minHeight: 0 }
                        : { flex: 1, minHeight: 0 }
                    }
                  >
                    {panel(pid)}
                  </div>
                </Fragment>
              ))}
            </div>
          </Fragment>
        ))}
        {visCols.length === 0 && (
          <div className="ra-alldown">모든 판을 내렸습니다 — 아래 띠에서 올려 보세요</div>
        )}
      </div>
      {hid.size > 0 && (
        <div className="ra-dockbar">
          {(['steps', 'response', 'events', 'tc'] as PanelId[])
            .filter((x) => hid.has(x))
            .map((x) => (
              <button key={x} type="button" className="ra-dockchip" title="이 판을 다시 올립니다" onClick={() => paneUp(x)}>
                <i aria-hidden="true">⌃</i> {TITLE[x]}
              </button>
            ))}
        </div>
      )}
      {fltMenu}
    </div>
  )
}
