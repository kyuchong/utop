import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { prefGet, prefSet } from '@/lib/prefs'
import RunLog, { type LogLine } from '@/components/tc/RunLog'
import BlockText from '@/components/tc/BlockText'
import { stepLogOn } from '@/components/tc/types'
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
  /** 스텝 갈래 — 주석을 이 표에서 빼고(지시) 번호를 시험 항목과 맞추는 데 쓴다 */
  kind?: string
  t: string
  cmd?: string
  out?: string
  mark?: string
  action?: string
  session?: string
  /** 이 스텝이 붙은 장비 — 세션 판이 이것으로 장비를 찾는다 */
  devId?: string
  expected?: string
  at?: string
  took?: string
  /** 그 스텝이 **걸린 시간**(ms). 「10회」 배지 자리에 이것을 적는다(지시) */
  tookMs?: number
  /** 왜 그 판정이 났나(RCA) — 판정 기준 바로 아래 선다 */
  reason?: string
  /** 이 스텝이 담는 변수 — 이름과 규칙 */
  vars?: Array<{ name: string; rule?: string }>
  /** 「대기」 스텝이 기다리기로 한 초. 카운트다운은 이 값에서 내려온다 */
  waitSec?: number
  /** 실제로 돌았나 — 판정이 없는 스텝과 안 돌린 스텝을 가른다 */
  ran?: boolean
  /** 비교 스텝이 통과·실패일 때 적어 둔 문구 */
  okMsg?: string
  ngMsg?: string
  /** **반복 회차별 기록**(지적: 20 회를 돌았는데 화면은 1 회로 보인다).
   *  실행기는 회차마다 남기는데 이 화면이 통째로 버리고 있었다. */
  rounds?: Array<{ n?: number; status?: string; reason?: string; took_ms?: number; output?: string; cmd?: string; trimmed?: boolean }>
}

export interface AutoItem {
  id: string
  name: string
  group: string
  /** 이 항목의 결과 — 아이콘과 알약이 이걸 그린다 */
  verdict: 'p' | 'f' | 'b' | 'n'
  /** 언제 판정했나 — `2026-09-03 18:04:42`. 목업이 이 자리에 적는 값이다 */
  at?: string
  /** 이 항목이 돈 **실행 번호** — `E61xx-E0001`. 안 돌았으면 비운다 */
  exec?: string
}

type SlotId = 'LT' | 'LB' | 'RT' | 'RB'
type PanelId = 'steps' | 'response' | 'events' | 'tc'
const DEFAULT: Record<SlotId, PanelId> = { LT: 'steps', LB: 'events', RT: 'response', RB: 'tc' }
/* 판 넷. 「Sessions」 는 걷었다(지시) — 세션 현황은 스텝의 Session 칸과
   실행 이벤트가 이미 말한다. */
const ALL_PANELS: PanelId[] = ['steps', 'response', 'events', 'tc']
const TITLE: Record<PanelId, string> = {
  steps: '실행 Step',
  response: 'Response',
  events: '실행 이벤트',
  tc: 'Test Report',
}

/** 장비 한 대 — 세션 판이 쓰는 것만 추린다 */
export interface AutoDev {
  id?: string
  name?: string
  ip?: string
  model?: string
  role?: string
  protocol?: string
  port?: number | string
}
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
  /* 서버가 적는 시각은 **UTC 인데 표시가 없다**(`2026-09-11 07:50:04`) —
     실행기가 `toISOString().slice(0,19)` 로 Z 를 잘라 저장한다. 그대로 읽으면
     브라우저가 제 시간대로 쳐서 아홉 시간 이르게 찍혔다(지적: 16:50 에
     돌렸는데 Report 는 07:50). 표시가 없으면 UTC 로 본다. */
  const iso = raw.includes('T') ? raw : raw.replace(' ', 'T')
  const hasTz = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(iso)
  const d = new Date(hasTz ? iso : `${iso}Z`)
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
          <path d="M4.2 8.3l2.5 2.5 5.1-5.1" fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        ) : v === 'f' ? (
          <path d="M5.2 5.2l5.6 5.6M10.8 5.2l-5.6 5.6" fill="none" strokeWidth="2.6" strokeLinecap="round" />
        ) : v === 'b' ? (
          <path d="M8 4.2v4.6M8 11.2v.6" fill="none" strokeWidth="2.6" strokeLinecap="round" />
        ) : (
          <circle cx="8" cy="8" r="2.1" className="ra-dotc" />
        )}
      </svg>
    </span>
  )
}

/** 판정 시각 — `2026-09-08 08:18:33` 을 `26/09/08 08:18:33` 로 줄인다(지시).
 *  칸이 좁아 연도 앞 두 자리는 접는다 — 같은 해 안에서 보는 목록이다. */
/** 실시간 줄은 **뒤에서 이만큼**만 그린다 — 10,000 회를 다 그리면 죽는다 */
const LIVE_MAX = 600

/**
 * Test Report 의 Timestamp — `26/09/10 10:37:17`.
 *
 * 화면에서 시각을 적는 자리는 **모두 이 꼴**이다(지시). 문자열을 자르지 않고
 * `stamp` 를 거치는 까닭은 **시간대** 다: 서버는 `+09:00` 이 붙은 ISO 를
 * 주는데 앞에서 잘라 쓰면 UTC 로 도는 서버에서 아홉 시간이 어긋난다.
 */
/** 시각 하나를 밀리초로. 표시가 없으면 **UTC** 로 본다(서버가 Z 를 떼고 적는다) */
function tms(v?: string): number {
  const t = String(v ?? '').trim()
  if (!t) return NaN
  const iso = t.includes('T') ? t : t.replace(' ', 'T')
  return Date.parse(/[Zz]$|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`)
}

function shortStamp(v?: string): string {
  const full = stamp(v)
  /* **연도는 뺀다**(지적: 시각이 두 줄로 접힌다). 칸을 글자 폭에 맞춰
     좁혔더니 `26/09/11 20:23:10` 이 안 들어가 두 줄이 됐다 — 연도는 사이클
     이름과 실행 이름에 이미 있어 여기서 또 말할 것이 아니다. */
  const m = full.match(/^\d{4}-(\d{2})-(\d{2}) (\d{2}:\d{2}:\d{2})/)
  return m ? `${m[1]}/${m[2]} ${m[3]}` : full
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
  items, cur, onPick, steps, stepAt, onStep, dut, runStartedAt, itemAt = -1,
  runStep, runItem, waitAt, devices, liveLogs,
}: {
  /** 장비 목록 — 세션 판이 세션에 붙은 장비를 여기서 찾는다 */
  devices?: AutoDev[]
  /** **실행기가 보낸 줄** — 1 초마다 새로 온다(지시: 리얼타임으로).
   *  있으면 실행 이벤트가 이것을 그대로 그린다: 회차마다 한 줄씩 올라와
   *  TC 화면과 같은 결이 된다. 스텝에서 만들면 반복이 다 끝나야 나온다. */
  liveLogs?: Array<{ seq?: number; ts?: string; round?: number | null; i?: number; kind?: string; text?: string
    /** 몇 번째 **항목**에서 나온 줄인가 */
    at?: number
  }>
  /** 지난 실행의 출력 — **이제 안 그린다**(지시).
   *  콘솔은 고른 스텝의 **지금 결과** 하나만 보여 준다. 위 판이 계속
   *  넘겨 주고 있어 자리만 남겨 둔다. */
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
  /** 이번 실행이 시작한 시각 — 그 뒤에 돈 항목만 Test Report 에 쌓는다 */
  runStartedAt?: string
  /** 지금 보는 항목이 **몇 번째**인가 — 실행 로그를 그 항목 것만 추린다 */
  itemAt?: number
  /** 이 항목을 언제 돌렸나 */
  logAt?: string
}) {
  /* ── 판 배치 (계정별) — iTest 꼴 도킹(지시): 열 배열, 열 안은 위→아래.
     판 머리를 끌어 다른 판의 왼쪽·오른쪽(새 열)·위·아래(같은 열)·가운데
     (맞바꿈)에 떨어뜨려 마음대로 배치한다. ── */
  const [lay, setLayRaw] = useState<PanelId[][]>(() => {
    const ALL = ALL_PANELS
    /** 판이 하나 늘었다고 **사람이 잡아 둔 배치를 지우지 않는다**.
     *  아는 판만 남기고, 빠진 판은 마지막 열 끝에 붙인다. */
    const fill = (cols: PanelId[][]): PanelId[][] => {
      const c = cols.map((col) => col.filter((x) => ALL.includes(x))).filter((col) => col.length)
      if (!c.length) return [[DEFAULT.LT, DEFAULT.LB], [DEFAULT.RT, DEFAULT.RB]]
      const flat = c.flat()
      const miss = ALL.filter((x) => !flat.includes(x))
      if (miss.length) c[c.length - 1]!.push(...miss)
      return c
    }
    try {
      const j = JSON.parse(prefGet('utop.run.lay') ?? '') as PanelId[][]
      if (Array.isArray(j) && j.every((c) => Array.isArray(c))) {
        const known = j.flat().filter((x) => ALL.includes(x))
        if (known.length && new Set(known).size === known.length) return fill(j)
      }
    } catch {
      /* 처음이거나 옛 저장 — 아래에서 잇는다 */
    }
    try {
      const j = JSON.parse(prefGet('utop.run.dock') ?? '{}') as Partial<Record<SlotId, PanelId>>
      const d = { ...DEFAULT, ...j }
      return fill([[d.LT, d.LB], [d.RT, d.RB]])
    } catch {
      return [[DEFAULT.LT, DEFAULT.LB], [DEFAULT.RT, DEFAULT.RB]]
    }
  })
  /* 걷어낸 판이 저장본에 남아 있으면 빈 자리가 선다 — 읽을 때 걸러 낸다 */
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
  /** 열 안 j 번째 판의 높이(%).
   *  예전엔 열에 판이 **둘일 때만** 끌 수 있었다 — 오른쪽에 셋을 세우면
   *  분할바가 죽은 칸(off)으로 서서 「이동바가 없다」 가 됐다(지적).
   *  이제 칸마다 제 높이를 기억한다. 마지막 판은 남는 자리를 먹는다. */
  const rowPct = (ci: number, j: number, n: number) => {
    const v = rs[`${ci}:${j}`]
    if (Number.isFinite(v)) return clamp(Number(v), 10, 90)
    /* 옛 저장값(판 둘일 때 첫 판 높이)에서 잇는다 */
    if (n === 2 && j === 0 && Number.isFinite(rs[String(ci)])) return clamp(Number(rs[String(ci)]), 10, 90)
    return 100 / n
  }

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
  /* 열 안 가로 분할바 — 판이 몇이든 칸마다 하나씩 선다 */
  const startRowSash = (ci: number, j: number, n: number) => (e: React.MouseEvent) => {
    e.preventDefault()
    setDrag(`r${ci}:${j}`)
    const colEl = (e.currentTarget as HTMLElement).parentElement
    const move = (ev: MouseEvent) => {
      const r = colEl?.getBoundingClientRect()
      if (!r) return
      /* 위 칸들이 이미 먹은 자리를 빼야 손이 간 만큼만 움직인다 */
      const before = Array.from({ length: j }, (_, k) => rowPct(ci, k, n)).reduce((a, b) => a + b, 0)
      const want = clamp(((ev.clientY - r.top) / r.height) * 100 - before, 10, Math.max(10, 90 - before))
      setRs((cur) => ({ ...cur, [`${ci}:${j}`]: want }))
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


  /**
   * 시험 항목 표와 **같은 번호**(지적: 실행 로그와 스텝이 안 맞는다).
   *
   * 주석은 스텝이 아니라 번호를 안 먹는다 — 자리 번호로 세면 주석 하나에
   * 아래가 통째로 한 칸씩 밀린다.
   */
  const nos = useMemo(() => {
    let n = 0
    return steps.map((s2) => (s2.kind === 'comment' ? '' : String(++n)))
  }, [steps])

  /** 걸린 시간 — 1 초 아래는 ms 로 적는다. 스텝 하나는 대개 그 아래다 */
  const tookText = (ms?: number) =>
    ms == null ? '' : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}초`

  /** 실행 로그의 「부적합만」 — 시험 항목 화면과 같은 단추 */
  const [logOnly, setLogOnly] = useState(false)

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
  /** 찾기 — 62 건에서 「T0055」 나 「PortReset」 로 한 줄을 집어낸다(지시) */
  const [q, setQ] = useState('')
  /** 거르개 목록이 열린 자리. **직접 그린다** — 브라우저 기본 select 의
      목록은 OS 가 그려서 이 화면의 결과 전혀 안 맞는다(지적). */
  const [fltAt, setFltAt] = useState<{ x: number; y: number } | null>(null)
  useEffect(() => {
    if (!fltAt) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setFltAt(null)
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [fltAt])
  const shownItems = useMemo(() => {
    const byV = flt === 'all' ? items : items.filter((it) => it.verdict === flt)
    const k = q.trim().toLowerCase()
    if (!k) return byV
    /* TC ID·이름·실행 번호 어느 것으로 찾아도 걸린다 — 시험하는 사람은
       「T0055」 로도 찾고 「PortReset」 로도 찾는다 */
    return byV.filter((it) => `${it.id} ${it.name} ${it.exec ?? ''}`.toLowerCase().includes(k))
  }, [items, flt, q])
  /**
   * **돈 것만, 최신이 위**(지시: iTest 처럼).
   *
   * 아직 안 돈 항목까지 미리 깔아 두면 목록이 길어 스크롤이 계속 내려가고,
   * 방금 끝난 것을 보려면 눈이 아래로 따라가야 했다. 담긴 항목 수는 판
   * 제목의 「전체 62」 가 이미 말한다.
   */
  const doneItems = useMemo(() => {
    /*
     * **끝난 것은 최신순으로 위, 아직 안 돈 것은 아래**(지시).
     *
     * 안 돈 것까지 미리 깔면 목록이 길어 방금 끝난 것을 눈으로 따라가야
     * 한다(스크롤이 계속 내려간다). **끝난 것만** 쌓고, 어디까지 왔는지는
     * 판 제목이 「62 중 18 진행」 으로 말한다(지시).
     *
     * 「다시 실행」 은 같은 실행 레코드를 다시 쓰므로 지난 회차 결과가 남아
     * 있다 — **시작 시각보다 이른 기록은 이번 것이 아니다.** 그래야 다시
     * 돌리는 순간 목록이 비고 끝난 것부터 하나씩 올라온다.
     */
    const st = tms(runStartedAt)
    const done: AutoItem[] = []
    const wait: AutoItem[] = []
    for (const it of shownItems) {
      const t = tms(it.at)
      const mine =
        Number.isFinite(st) && Number.isFinite(t)
          ? t >= st - 1000
          : !!String(it.at ?? '').trim() || it.verdict !== 'n'
      if (mine) done.push(it)
      else wait.push(it)
    }
    /* 시각이 **같으면 나중에 돈 것이 위**다(지적: 1번이 아닌 2번이 먼저
       실행된 것처럼 보인다). 시각은 초 단위라 한 초에 둘이 끝나면 값이
       같아지는데, 그때 표 차례대로 두면 먼저 끝난 것이 위로 올라와 차례가
       뒤집혀 보인다. 담긴 자리를 뒤에서부터 세워 가른다. */
    const pos = new Map(shownItems.map((x, i) => [x.id, i]))
    done.sort((a, b) => {
      const c = String(b.at ?? '').localeCompare(String(a.at ?? ''))
      return c || (pos.get(b.id) ?? 0) - (pos.get(a.id) ?? 0)
    })
    return done
  }, [shownItems, runStartedAt])
  const groups = useMemo(() => {
    /* **받은 차례를 절대 안 바꾼다** — 이어지는 같은 묶음만 한 덩이로 접는다.
       Map 으로 묶었더니 이름이 같은 다른 REQ 의 항목을 위로 끌어 붙여,
       실행기는 제 차례로 도는데 화면의 파란 강조가 목록을 건너뛰며
       오르내렸다(지적: 왔다갔다 실행한다 — 의 두 번째 얼굴). */
    const out: Array<[string, AutoItem[]]> = []
    for (const it of doneItems) {
      const last = out[out.length - 1]
      if (last && last[0] === it.group) last[1].push(it)
      else out.push([it.group, [it]])
    }
    return out
  }, [shownItems])

  /** 세션 현황 — **스텝에서 뽑는다**(지어내지 않는다).
   *  스텝마다 적힌 Session(s0·s1…)을 모아, 그 세션으로 돈 마지막 스텝과
   *  지금 도는 스텝을 보고 상태를 정한다. 장비는 devId 로 찾는다. */
  const devOf = (id?: string) => {
    const k = String(id ?? '').trim()
    if (!k) return undefined
    const list = devices ?? []
    return list.find((d) => String(d.id ?? '') === k) ?? list.find((d) => String(d.ip ?? '') === k)
  }

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
                {steps.map((s, i) =>
                  /* 주석은 **사이클 표에 안 선다**(지시) — 장비로 아무것도
                     안 나가고 판정도 없다. 자리(i)는 그대로 두어 runStep·
                     onStep 이 어긋나지 않게 한다. */
                  s.kind === 'comment' ? null : (
                  <tr
                    key={s.no ?? i}
                    ref={i === runStep ? runRowRef : undefined}
                    className={
                      i === runStep ? 'ra-running' : i === stepAt ? 'ra-on' : undefined
                    }
                    onClick={() => onStep(i)}
                  >
                    <td>{nos[i] || s.no || i + 1}</td>
                    <td className="ra-act">
                      <b>{s.action ?? (s.cmd ? 'command' : '—')}</b>
                    </td>
                    <td>{s.session ?? '—'}</td>
                    {/* 시험 항목의 **「명령 내용」** 그대로(지시) */}
                    <td>{s.cmd || s.t || '—'}</td>
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
                    <td className="ra-num">
                      {/* **그 스텝이 걸린 시간**(지시). 여기 있던 「10회」 배지는
                          걷었다 — 회차는 실행 이벤트가 회차마다 적는다. */}
                      {tookText(s.tookMs) || mmss(s.took)}
                    </td>
                  </tr>
                  ),
                )}
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
          {/* **스텝 번호 줄**(지시) — 판정이 걸린 줄은 초록, 깨진 줄은 빨강,
              그 밖은 흰 칩이다. 누르면 그 줄로 간다. 62 스텝을 훑을 때
              카드를 스크롤하지 않고도 깨진 자리로 바로 갈 수 있다. */}
          <div className="ra-sbar">
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
                {/* **판정 기준 · 변수 · RCA**(승인) — 무엇으로 보았고, 무엇을
                    담았고, 그래서 어떻게 판정됐나. 셋을 한 격자에 두어 라벨이
                    세로로 맞는다. */}
                {(() => {
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
                    <div className="ra-why">
                      <span className="k">판정 기준</span>
                      <span className={crit && crit !== '—' ? '' : 'dim'}>
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
                          <span className={mk ? (/pass/i.test(mk) ? 'ok' : 'bad') : 'dim'}>{rca}</span>
                        </>
                      )}
                    </div>
                  )
                })()}
                {rds.length > 1 && (
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
                {isWait(s2) ? (
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
                      markOf={(v) => {
                        const t = v.trim()
                        if (!t) return null
                        const toks = String(s2.expected ?? '')
                          .split(/[\s,]+/)
                          .map((x) => x.replace(/^["']|["']$/g, '').trim())
                          .filter(
                            (x) =>
                              x &&
                              !/^(has|not|==|!=|>=|<=|>|<|있으면|없으면|같다|다르다|포함|포함한다)$/.test(x),
                          )
                        if (toks.includes(t)) return 'has'
                        if ((s2.vars ?? []).some((x) => x.name === t)) return 'var'
                        return null
                      }}
                    />
                  </pre>
                )}
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

    if (id === 'events') {
      /*
       * **시험 항목 화면의 실행 로그와 같은 부품**으로 그린다(지시).
       *
       * 표로 따로 그리던 때는 같은 사건이 두 화면에서 다른 모양이었다 —
       * 부품을 나눠 쓰면 한쪽을 고치면 양쪽이 같이 고쳐진다.
       *
       * 보여 주는 단위는 **지금 고른 항목 하나**다(지시). 62 건이 한 흐름으로
       * 이어지면 어느 시험의 Step 1 인지 알 수 없다.
       *
       * 로그를 끈 갈래는 여기서도 안 나온다. 10,000 회를 다 그리면 화면이
       * 죽으므로 뒤에서 LIVE_MAX 줄만 남긴다.
       */
      const lines: LogLine[] = (liveLogs ?? [])
        .filter((l) => {
          if (Number(l.at ?? -1) !== itemAt) return false
          const i2 = Number(l.i ?? -1)
          const own = i2 >= 0 ? steps[i2] : undefined
          return !own || stepLogOn(own)
        })
        .slice(-LIVE_MAX)
        .map((l, k) => ({
          n: Number(l.seq ?? k),
          i: Number(l.i ?? -1),
          kind: String(l.kind ?? 'info'),
          text: String(l.text ?? ''),
          round: Number(l.round ?? 0) || undefined,
          at: String(l.ts ?? ''),
        }))
      return (
        <RunLog
          lines={lines}
          nos={nos}
          only={logOnly}
          onOnly={setLogOnly}
          onPick={(i2) => onStep(i2)}
          onClear={() => {
            /* 서버에 쌓인 기록이라 화면에서 지우지 않는다 — 다음 실행이 덮는다 */
          }}
        />
      )
    }

    /* Test Report — iTest 의 Test Reports 를 닮은 한 줄이다(지시).
       판정 아이콘 · Timestamp · TC ID · Test Case · Execution ID. */
    return (
      <>
        {/* 「고른 항목 판정」 줄을 뺐다(지시). 자동 시험의 결과는 실행기가
            내는 것이라, 사람이 여기서 덮어쓸 자리가 아니다. 손으로 고쳐야
            하면 그건 수동 시험이다. */}
        <div className="ra-scroll">
          {/* 열 머리 — 스크롤해도 위에 붙어 있는다 */}
          {/* Execution ID 칸은 걷었다(지시) — 그 자리를 시험 항목 이름이
              받는다. 번호는 서버에 그대로 찍히니 리포트에서 쓴다.
              마지막 칸은 도는 동안 RUN 배지가 선다. */}
          <div className="ra-cols">
            <span />
            <span>Timestamp</span>
            <span>TC ID</span>
            <span>Test Case</span>
            <span />
          </div>
          {!groups.length && (
            <div className="ra-none">
              {q.trim()
                ? `「${q.trim()}」 로 찾은 항목이 없습니다.`
                : flt !== 'all'
                  ? '그 결과의 항목이 없습니다.'
                  : '아직 돌린 항목이 없습니다 — 끝난 것부터 최신 차례로 쌓입니다.'}
            </div>
          )}
          {groups.map(([g, arr]) => (
            <div key={g}>
              {/* 묶음 옆 「1/2」 를 뺐다(지시) — 판 제목에 Pass·Fail·대기 가
                  이미 적혀 있어 같은 값을 두 번 세는 셈이다. */}
              {/* 최신순이라 같은 묶음이 연달아 오지 않는다 — 이름이 없는
                  덩이(찾기·거르기 결과)에는 머리를 안 세운다 */}
              {g ? (
                <div className="ra-grp">
                  <span>{g}</span>
                </div>
              ) : null}
              {arr.map((it) => (
                <button
                  type="button"
                  key={it.id}
                  className={`ra-tc${it.id === cur ? ' on' : ''}${it.id === runItem ? ' running' : ''}`}
                  onClick={() => onPick(it.id)}
                >
                  <Verdict v={it.verdict} />
                  {/* 이 자리는 **판정 시각**이다(지적). 걸린 시간은 안 적는다 —
                      스텝 표의 Time 칸이 이미 그것을 말한다. */}
                  <span className="ra-tct">{shortStamp(it.at)}</span>
                  <span className="ra-tcid" title={it.id}>{it.id}</span>
                  <span className="ra-tcnm">{it.name}</span>
                  {it.id === runItem ? <RunMark /> : <span />}
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
      /* 표·이벤트와 **같은 번호**(주석은 번호를 안 먹는다) */
      /* 어느 **세션**의 결과인지 함께 적는다(지시) — 세션이 둘 이상인
         시험에서 이 판이 어느 장비 앞인지가 제목에 없었다. */
      const sn = steps[stepAt]?.session
      const sdev = devOf(steps[stepAt]?.devId)
      const stail = sn && sn !== '—' ? ` · ${sn}${sdev ? ` (${sdev.name || sdev.ip || ''})` : ''}` : ''
      return `Step ${nos[stepAt] || stepAt + 1}${a && a !== '—' ? ` · ${a}` : ''}${stail}`
    }
    if (p === 'events') {
      /* 지금 항목의 줄 수만 센다 — 판이 그 항목 것만 그린다(지시) */
      const n = (liveLogs ?? []).filter((l) => Number(l.at ?? -1) === itemAt).length
      return n ? `${n}줄` : ''
    }
    /* **어디까지 왔나**를 먼저 적는다(지시: 총 몇 항목 중 몇 항목 진행).
       목록에는 끝난 것만 쌓이므로, 남은 수는 여기서만 알 수 있다. */
    const ranN = doneItems.length
    const head = items.length ? `${items.length} 중 ${ranN} 진행` : ''
    return `${head}${head ? ' · ' : ''}Pass ${tal.p} · Fail ${tal.f} · 대기 ${tal.n}`
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
            {id === 'tc' && (
              <input
                className="ra-find"
                type="search"
                value={q}
                placeholder="찾기 — TC ID · 이름"
                title="TC ID·시험 항목 이름·실행 번호로 찾습니다"
                draggable={false}
                onDragStart={(e) => e.preventDefault()}
                onMouseDown={(e) => e.stopPropagation()}
                onChange={(e) => setQ(e.target.value)}
              />
            )}
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
                  {j > 0 && (
                    <div
                      className={`ra-hsash${drag === `r${i}:${j - 1}` ? ' on' : ''}`}
                      title="위아래로 끌어 판 높이를 바꿉니다"
                      onMouseDown={startRowSash(i, j - 1, col.length)}
                    />
                  )}
                  <div
                    style={
                      j === col.length - 1
                        ? { flex: 1, minHeight: 0 }
                        : { height: `${rowPct(i, j, col.length)}%`, minHeight: 0 }
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
          {ALL_PANELS
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
