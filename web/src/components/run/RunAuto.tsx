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
}

export interface AutoItem {
  id: string
  name: string
  group: string
  verdict: 'p' | 'f' | 'b' | 'n'
  took?: string
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
/** 지금 도는 것을 알리는 표시 — 스텝 표와 항목 목록이 **같은 모양**을 쓴다 */
function RunMark() {
  return (
    <span className="ra-st run">
      <i />
      RUN
    </span>
  )
}

export default function RunAuto({
  items, cur, onPick, steps, stepAt, onStep, dut, logAt, onVerdict, verdict,
  runStep, runItem,
}: {
  /** 실행기가 **지금 돌고 있는** 스텝 자리(0부터). 안 돌면 없다 */
  runStep?: number | null
  /** 실행기가 지금 돌고 있는 항목 id */
  runItem?: string | null
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
  onVerdict: (v: 'p' | 'f' | 'b' | 'n') => void
  verdict: 'p' | 'f' | 'b' | 'n'
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
    v: Number(prefGet('utop.run.dock.v') ?? '') || 55,
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
  const [evf, setEvf] = useState<'all' | 'PASS' | 'FAIL' | 'INFO'>('all')
  const events = useMemo(() => {
    const out: Array<{ at: string; step: string; kind: string; text: string }> = []
    steps.forEach((s) => {
      const at = s.at ?? logAt ?? ''
      if (s.cmd) out.push({ at, step: `Step ${s.no}`, kind: 'INFO', text: `${s.cmd} 보냄` })
      if (s.mark)
        out.push({
          at,
          step: `Step ${s.no}`,
          kind: s.mark === 'Pass' ? 'PASS' : 'FAIL',
          text: s.mark === 'Pass' ? `${s.t} — 기준 맞음` : `${s.t} — 기준 어긋남`,
        })
    })
    return out
  }, [steps, logAt])
  const evShown = evf === 'all' ? events : events.filter((e) => e.kind === evf)

  /** 도는 줄을 눈에 들어오게 끌어온다 — 스텝이 많으면 밑으로 흘러 안 보인다 */
  const runRowRef = useRef<HTMLTableRowElement>(null)
  useEffect(() => {
    if (runStep == null) return
    runRowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [runStep])

  const curStep = steps[Math.min(stepAt, Math.max(0, steps.length - 1))]
  const groups = useMemo(() => {
    const m = new Map<string, AutoItem[]>()
    for (const it of items) m.set(it.group, [...(m.get(it.group) ?? []), it])
    return [...m.entries()]
  }, [items])

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
                    <td>{s.cmd || s.t}</td>
                    <td>{s.expected ?? '—'}</td>
                    <td>
                      {i === runStep ? (
                        <span className="ra-st run">
                          <i />
                          RUN
                        </span>
                      ) : (
                        <span
                          className={`ra-st ${s.mark === 'Pass' ? 'ok' : s.mark === 'Fail' ? 'bad' : 'wait'}`}
                        >
                          {s.mark === 'Pass' ? 'PASS' : s.mark === 'Fail' ? 'FAIL' : 'WAIT'}
                        </span>
                      )}
                    </td>
                    <td className="ra-num">{s.took || s.at || '—'}</td>
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
          <div className="ra-con">
            {curStep?.cmd && (
              <div className="ra-cmd">
                {dut}# {curStep.cmd}
              </div>
            )}
            <pre>{curStep?.out ?? '아직 출력이 없습니다.'}</pre>
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
        <>
          <div className="ra-chips">
            {(['all', 'INFO', 'PASS', 'FAIL'] as const).map((k) => (
              <button
                type="button"
                key={k}
                className={`ra-chip${evf === k ? ' on' : ''}`}
                onClick={() => setEvf(k)}
              >
                {k === 'all' ? '전체' : k}
              </button>
            ))}
          </div>
          <div className="ra-scroll">
            {evShown.length ? (
              <table className="ra-tbl">
                <thead>
                  <tr>
                    <th style={{ width: 150 }}>Timestamp</th>
                    <th style={{ width: 70 }}>Step</th>
                    <th style={{ width: 62 }}>결과</th>
                    <th>세부 내역</th>
                  </tr>
                </thead>
                <tbody>
                  {evShown.map((e, i) => (
                    <tr key={i}>
                      <td className="ra-ts">{e.at || '—'}</td>
                      <td>{e.step}</td>
                      <td>
                        <b className={`ra-ev ${e.kind.toLowerCase()}`}>{e.kind}</b>
                      </td>
                      <td>{e.text}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="ra-empty">
                남은 이벤트가 없습니다 — 실행 로그가 쌓이면 여기에 줄이 생깁니다.
              </div>
            )}
          </div>
        </>
      )

    /* 시험 항목 */
    return (
      <>
        <div className="ra-tctools">
          {/* 건수는 판 제목 옆에 이미 적힌다 — 두 번 적으면 자리만 먹는다 */}
          <span className="ra-muted">고른 항목 판정</span>
          <span className="ra-sp" />
          <div className="ra-vb">
            {(['p', 'f', 'b', 'n'] as const).map((v) => (
              <button
                type="button"
                key={v}
                className={`ra-v ${v}${verdict === v ? ' on' : ''}`}
                onClick={() => onVerdict(v)}
                title="고른 항목의 결과를 남깁니다"
              >
                {RESN[v]}
              </button>
            ))}
          </div>
        </div>
        <div className="ra-scroll">
          {groups.map(([g, arr]) => (
            <div key={g}>
              <div className="ra-grp">
                <span>{g}</span>
                <span>
                  {arr.filter((x) => x.verdict === 'p').length}/{arr.length}
                </span>
              </div>
              {arr.map((it) => (
                <button
                  type="button"
                  key={it.id}
                  className={`ra-tc${it.id === cur ? ' on' : ''}${it.id === runItem ? ' running' : ''}`}
                  onClick={() => onPick(it.id)}
                >
                  <span className={`ra-dot ${it.verdict}`}>
                    {it.verdict === 'p' ? '✓' : it.verdict === 'f' ? '!' : '·'}
                  </span>
                  <span className="ra-tcid">{it.id}</span>
                  <span className="ra-tcnm">{it.name}</span>
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
    </div>
  )
}
