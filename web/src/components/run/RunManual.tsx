import { useEffect, useMemo, useRef, useState } from 'react'
import { apiFetch } from '@/api/client'
import { prefGet, prefSet } from '@/lib/prefs'
import { useVerdicts, vDef, vLetter } from '@/lib/verdicts'
import NTable, { seedOptions } from '@/components/ntable/NTable'
import { EMPTY_VIEW } from '@/components/ntable/types'
import type { NCalc, NCol, NRow, NView } from '@/components/ntable/types'
import { useNCols, useUserPeople } from '@/pages/qaBits'
import './RunManual.css'

/**
 * **수동 시험 화면 — 두 판**(지시: 2안).
 *
 * 왼쪽은 **훑는 자리** — 세로 색바(결과) · TC ID · 시험 항목 · 실행자 ·
 * **판정**. 판정은 셋업(실행 판정 기준)의 목록 그대로라, 절차가 없는
 * 항목도 여기서 바로 판정된다(지적: 스텝이 없으면 판정할 길이 없었다).
 *
 * 오른쪽은 **한 항목의 시험서**다. 머리에 네 번호(요구사항 / 항목 /
 * 사이클 / 실행)를 한 줄로 세우고, 요구사항·시험항목을 접이 블록으로
 * 둔 뒤, 스텝을 카드로 편다. 카드 한 장은 **네 칸이 한 줄씩**이다
 * (지시: 2안 — Test Step / Test Data / Expected / Actual).
 *
 * 판정은 **스텝마다** 남기고 그것을 모아 항목 결과가 된다. 하나라도
 * 실패면 실패 — 사람이 항목 결과를 또 고르지 않아도 된다.
 */

export type V = 'p' | 'f' | 'b' | 'n'
const TAG: Record<V, string> = { p: 'PASS', f: 'FAIL', b: 'BLOCKED', n: 'WAIT' }
/** 시험 시간 — 「26/09/01 23:01:01」(지시) */
const stampFull = (iso: string) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getFullYear() % 100)}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export interface MItem {
  id: string
  title: string
  assignee: string
  runner: string
  /** 이 실행의 결과 — 글자 갈래(막대 색) */
  v: V
  /** 저장된 판정 **값** 그대로 — 목록의 판정 칸이 이걸 고른다 */
  raw?: string
  /** 지난 빌드의 결과 — 없으면 n */
  last: V
  bugs: number
  at: string
  /** 묶기(Group by)가 쓰는 값 */
  req?: string
  folder?: string
  type?: string
  kind?: string
}
export interface MStep {
  t: string
  data?: string
  expected: string
  /** 스텝 설명 — 목업의 TEST STEP 칸 */
  desc?: string
  /** 시험서에 붙인 사진. 글자와 **따로** 담긴다 */
  dataImg?: string
  dataW?: number
  expImg?: string
  expW?: number
}
export interface MMeta {
  at?: string
  by?: string
  act?: string
  /** 실측 증적 사진 — 결과서에 그대로 실린다 */
  imgs?: string[]
}

export default function RunManual({
  items, cur, onPick, steps, pchk, pmeta, onStep, onAct, onShot, onShotDel, info, planId, runId, onBug,
  onVerdicts, keys, stale,
}: {
  items: MItem[]
  cur: string
  onPick: (id: string) => void
  steps: MStep[]
  /** 스텝마다의 판정 */
  pchk: string[]
  pmeta?: Array<MMeta | null>
  onStep: (ix: number, v: string) => void
  onAct?: (ix: number, text: string) => void
  /** 실측 사진 붙이기·떼기 — 스텝마다 */
  onShot?: (ix: number, file: File) => void
  onShotDel?: (ix: number, url: string) => void
  info: {
    purpose: string; cond: string; crit: string
    topoImg?: string; topoW?: number
    topoHas?: boolean
    /** 요구사항 — 머리 번호와 서랍이 쓴다 */
    reqId?: string
    reqTitle?: string
    reqBody?: string
  }
  planId: string
  runId: string
  onBug: () => void
  /** 목록에서 항목을 통째로 판정할 때 — 절차가 없는 항목의 유일한 길 */
  /** 고른 줄 여럿에 한 판정을 한 번에 */
  onVerdicts?: (tcids: string[], value: string) => void
  /** 머리의 네 번호 — 요구사항 / 항목 / 사이클 / 실행 */
  keys?: { cycle?: string; run?: string }
  /** 담을 때보다 시험 항목이 바뀌었나 — 「Update this test script」 띠 */
  stale?: { changed: boolean; detail: string; onUpdate: () => void; onDiff?: () => void }
}) {
  const verds = useVerdicts()
  /** 스텝에서 자주 쓰는 판정 — 나머지는 톱니바퀴 메뉴로(지시) */
  const QUICK = ['Pass', 'Fail', 'Blocked', '진행불가']
  const quickV = QUICK.map((k) => verds.find((d) => d.v === k)).filter((d): d is NonNullable<typeof d> => !!d)
  const restV = verds.filter((d) => !!d.v && !QUICK.includes(d.v))
  const shortV = (v: string) => (v === '진행불가' ? '불가' : v.slice(0, 1).toUpperCase())
  const [w, setW] = useState(() => Number(prefGet('utop.run.man.w') ?? '') || 44)
  /** 크게 볼 사진 — 줄여 놓으면 글자가 안 읽힌다(시험서와 같은 규칙) */
  const [big, setBig] = useState('')
  const [bug, setBug] = useState(false)
  /* 요구사항·시험항목은 **오른쪽 서랍**으로 뺐다(지시) — 스텝이 세로를 다 쓴다.
     서랍이 오른쪽인 것은 릴리즈의 Jira 서랍과 같은 규칙이다(한 방향으로 통일) */
  const [drw, setDrw] = useState<'' | 'req' | 'tc'>('')
  /** 스텝의 톱니바퀴 메뉴 — 자주 안 쓰는 판정 */
  const [cogAt, setCogAt] = useState<{ x: number; y: number; ix: number } | null>(null)
  /** 일괄 판정을 마치면 이 숫자를 올려 표의 선택을 푼다 */
  const [selEpoch, setSelEpoch] = useState(0)
  /** 한 줄만 판정 — 목록의 판정 막대를 누르면 뜬다(지시) */
  const [rowAt, setRowAt] = useState<{ x: number; y: number; id: string } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState(false)

  /* Esc 로 서랍을 닫는다 — 사진 크게 보기가 떠 있으면 그쪽이 먼저다 */
  useEffect(() => {
    if (!drw) return
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !big) setDrw('')
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [drw, big])

  const startSash = (e: React.MouseEvent) => {
    e.preventDefault()
    setDrag(true)
    const move = (ev: MouseEvent) => {
      const r = wrapRef.current?.getBoundingClientRect()
      if (!r) return
      setW(Math.max(26, Math.min(62, ((ev.clientX - r.left) / r.width) * 100)))
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      setDrag(false)
      setW((v) => {
        prefSet('utop.run.man.w', String(Math.round(v)))
        return v
      })
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }


  const one = items.find((x) => x.id === cur)
  const marked = pchk.filter(Boolean).length

  /* ── 목록(노션 표) ── */
  const people = useUserPeople()
  const [lsView, setLsView] = useState<NView>({ ...EMPTY_VIEW })
  const LS_DEFS: NCol[] = [
    { key: 'id', label: 'TC ID', type: 'text', width: 124, fixed: true },
    { key: 'title', label: '시험 항목', type: 'text', width: 300, fixed: true },
    { key: 'who', label: '담당자', type: 'person', width: 112 },
    { key: 'runner', label: '실행자', type: 'person', width: 112 },
    { key: 'bugs', label: '버그', type: 'text', width: 62 },
    /* 시험 시간만 **기본 꺼짐**(지시) — 속성 판에서 켠다 */
    { key: 'at', label: '시험 시간', type: 'text', width: 150, hidden: true },
    /* 아래는 **묶기·거르기 감**이다(지시: Group by 를 되살려 달라).
       숨긴 채로 두면 표에는 안 나오고 그룹·필터 목록에만 선다.
       속성 판에서 켜면 열로도 볼 수 있다. */
    /* **선택형**이라야 거를 값이 생긴다(지적: 필터가 안 먹었다) —
       선택지는 지금 목록의 값에서 만들어 붙인다 */
    { key: 'verdict', label: '판정', type: 'select', width: 96, hidden: true, options: [] },
    { key: 'folder', label: '폴더', type: 'select', width: 200, hidden: true, options: [] },
    { key: 'req', label: 'REQ', type: 'select', width: 120, hidden: true, options: [] },
    { key: 'type', label: '유형', type: 'select', width: 90, hidden: true, options: [] },
    { key: 'kind', label: '타입', type: 'select', width: 70, hidden: true, options: [] },
  ]
  const [lsCols, setLsCols] = useNCols('utop.ntb.runman.cols', LS_DEFS)
  /* 아래 「계산」 줄 — 고른 값을 들고 있어야 셈이 뜬다(지적: 눌러도 안 먹었다) */
  const [lsCalcs, setLsCalcs] = useState<Record<string, NCalc>>(() => {
    try {
      return JSON.parse(prefGet('utop.ntb.runman.calcs') ?? '{}') as Record<string, NCalc>
    } catch {
      return {}
    }
  })
  /* 버그를 기본 켜짐으로 바꿨다(지시). 계정에 남은 옛 「숨김」 이 정의를
     이기므로 한 번만 걷어 주고 표식을 남긴다 — 사람이 다시 끄는 것은 그대로 */
  useEffect(() => {
    if (prefGet('utop.ntb.runman.bugon') === '1') return
    prefSet('utop.ntb.runman.bugon', '1')
    const cur2 = lsCols.find((c) => c.key === 'bugs')
    if (cur2?.hidden) setLsCols(lsCols.map((c) => (c.key === 'bugs' ? { ...c, hidden: false } : c)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const lsRows = useMemo<NRow[]>(
    () =>
      items.map((x) => ({
        __id: x.id,
        id: x.id,
        title: x.title || '(이름 없음)',
        who: x.assignee || '',
        runner: x.runner || '',
        bugs: x.bugs || 0,
        at: stampFull(x.at),
        verdict: vDef(verds, String(x.raw ?? '')).label,
        folder: x.folder || '미분류',
        req: x.req || '(요구사항 없음)',
        type: x.type || '',
        kind: x.kind || '',
      })),
    [items, verds],
  )


  /** 표에 넘길 열 — 값에서 선택지를 만들어 붙인다(거르기·묶기가 이걸 쓴다).
      판정만은 셋업의 색을 그대로 입힌다 */
  const lsColsView = useMemo(
    () =>
      seedOptions(lsCols, lsRows).map((c) =>
        c.key === 'verdict'
          ? { ...c, options: verds.map((d) => ({ value: d.label, color: d.color })) }
          : c,
      ),
    [lsCols, lsRows, verds],
  )

  /** 이름 첫 글자 — 「전규종(검증)」 → 「전」 */
  const initial = (v: string) => {
    const nm = String(v || '').split('(')[0]!.trim()
    if (!nm) return '–'
    return /[A-Za-z]/.test(nm[0] ?? '') ? nm[0]!.toUpperCase() : nm[0]!
  }
  /** 아바타 색 — 이름마다 달라 여럿이 섞여도 한눈에 갈린다 */
  const avColor = (v: string) => {
    let h = 0
    for (const ch of String(v)) h = (h * 31 + ch.charCodeAt(0)) % 360
    return `hsl(${h} 42% 46%)`
  }

  /** 머리 번호 한 칸 — 누를 수 있는 것은 오른쪽 서랍을 연다 */
  const keyChip = (label: string, v?: string, opt?: { tone?: 'run'; open?: 'req' | 'tc' }) =>
    v ? (
      <span className="rm-kc">
        <em>{label}</em>
        {opt?.open ? (
          <button
            type="button"
            className="rm-kb"
            title={`${label} 자세히 — 오른쪽에서 펼칩니다`}
            onClick={() => setDrw(opt.open ?? '')}
          >
            {v}
          </button>
        ) : (
          <b className={opt?.tone === 'run' ? 'run' : undefined}>{v}</b>
        )}
      </span>
    ) : null

  return (
    <div className="rm" ref={wrapRef}>
      {/* ── 왼쪽: 결과바 · TC ID · 항목 · 실행자 · 판정 (지시) ── */}
      <div className="rm-left" style={{ width: `${w}%` }}>
        <section className="rm-panel">
          {/* 노션 표 한 벌(승인) — 검색·필터·정렬·묶기·속성·고르기·일괄이
              표에 이미 있는 것이라 따로 만들지 않는다. 사이클 화면·
              REQ-Coverage 와 같은 표라 사람이 한 번만 배운다. */}
          <div className="rm-ntb">
            <NTable
              columns={lsColsView}
              rows={lsRows}
              view={lsView}
              onView={setLsView}
              onColumns={setLsCols}
              onCell={() => {}}
              readOnlyKeys={lsColsView.map((c) => c.key)}
              lockDefs
              idKey="id"
              titleKey="title"
              people={people}
              meName=""
              onOpen={(id) => onPick(id)}
              onPeek={(id) => onPick(id)}
              renderCell={(r, c) => {
                if (c.key === 'id') {
                  /* TC ID 를 누르면 **이 줄만 판정**한다(지시) */
                  const it = items.find((x) => x.id === r.__id)
                  const d = vDef(verds, String(it?.raw ?? ''))
                  return (
                    <span className="ntb-idw">
                      <span
                        className="rm-dot"
                        title={`판정 ${d.label}`}
                        style={{ background: it?.raw ? d.color : '#d6dbe0' }}
                      />
                      <button
                        type="button"
                        className="ntb-id"
                        title="누르면 이 줄만 판정합니다"
                        onClick={(e) => {
                          e.stopPropagation()
                          const b2 = (e.currentTarget as HTMLElement).getBoundingClientRect()
                          setRowAt({ x: b2.left, y: b2.bottom + 4, id: String(r.__id) })
                        }}
                      >
                        {String(r.id ?? '')}
                      </button>
                    </span>
                  )
                }
                if (c.key === 'title') {
                  /* 제목을 누르면 **오른쪽에 시험 스텝**이 뜬다(지시) */
                  return (
                    <button
                      type="button"
                      className="rm-titleb"
                      title="시험 스텝 보기"
                      onClick={(e) => {
                        e.stopPropagation()
                        onPick(String(r.__id))
                      }}
                    >
                      {String(r.title ?? '')}
                    </button>
                  )
                }
                if (c.key === 'who' || c.key === 'runner') {
                  /* 사람 칸은 **표가 이미 쓰는 꼴**이다(지시: 아이콘을 잘 고를 것)
                     — 동그란 아이콘 + 이름. 칸이 좁으면 이름이 잘려 아이콘만
                     남으니 「너무 길면 아이콘으로」 가 저절로 된다. 색은 이름마다
                     달라 여럿이 섞인 목록에서 한눈에 갈린다. */
                  const nm = String(r[c.key] ?? '')
                  return nm ? (
                    <span className="ntb-per" title={nm}>
                      <span className="ntb-av" style={{ background: avColor(nm) }}>{initial(nm)}</span>
                      <span className="ntb-txt">{nm}</span>
                    </span>
                  ) : (
                    <span className="rm-muted">–</span>
                  )
                }
                if (c.key === 'bugs') {
                  const n = Number(r.bugs ?? 0)
                  return n ? <span className="rm-bugn">{n}</span> : <span className="rm-muted">–</span>
                }
                if (c.key === 'at') {
                  const v = String(r.at ?? '')
                  return v ? <span className="rm-when">{v}</span> : <span className="rm-muted">–</span>
                }
                return undefined
              }}
              /* 고른 줄에 판정을 한 번에 — 선택 바가 표에 이미 있다 */
              bulk={verds.map((d) => ({ k: `v:${d.v}`, label: d.label }))}
              onBulk={(action, ids) => {
                if (!action.startsWith('v:')) return
                onVerdicts?.(ids, action.slice(2))
                setSelEpoch((n) => n + 1)
              }}
              selEpoch={selEpoch}
              calcs={lsCalcs}
              onCalcs={(v) => {
                setLsCalcs(v)
                prefSet('utop.ntb.runman.calcs', JSON.stringify(v))
              }}
              perPage={50}
            />
          </div>
        </section>
      </div>

      <div className={`rm-sash${drag ? ' on' : ''}`} onMouseDown={startSash} />

      {/* ── 오른쪽: 한 항목의 시험서 ── */}
      <div className="rm-right">
        <section className="rm-panel">
          {/* 네 번호 — 요구사항 / 항목 / 사이클 / 실행 (지시) */}
          <div className="rm-keys">
            {keyChip('요구사항', info.reqId, { open: 'req' })}
            {keyChip('항목', cur, { open: 'tc' })}
            {keyChip('사이클', keys?.cycle)}
            {keyChip('실행', keys?.run ?? runId, { tone: 'run' })}
            <span className="rm-sp" />
            {!!one?.bugs && <span className="rm-muted">🐞 {one.bugs}</span>}
            {/* 결함은 **실패한 항목에만**(지시) — 통과한 시험에 결함 단추가
                서 있으면 눌러 볼 일이 없다 */}
            {one?.v === 'f' && (
              <button type="button" className="rm-bugbtn" onClick={() => setBug(true)}>🐞 결함</button>
            )}
            <span className={`rm-hv ${one?.v ?? 'n'}`}>
              {TAG[one?.v ?? 'n']} {marked}/{steps.length}
            </span>
          </div>

          {/* 담을 때보다 시험 항목이 바뀌었다(지시) */}
          {!!stale?.changed && (
            <div className="rm-stale">
              <b>⟳ Update this test script</b>
              <span>{stale.detail}</span>
              <span className="rm-sp" />
              {!!stale.onDiff && (
                <button type="button" onClick={stale.onDiff}>달라진 것 보기</button>
              )}
              <button type="button" className="go" onClick={stale.onUpdate}>최신으로 갱신</button>
            </div>
          )}

          <div className="rm-scroll">
            {/* 스텝 — 카드 한 장에 네 칸이 한 줄씩(지시: 2안) */}
            {steps.map((s, i) => {
              const v = pchk[i] ?? ''
              const m = (pmeta ?? [])[i] ?? null
              return (
                <div className={`rm-sc${v ? ` v-${vLetter(verds, v)}` : ''}`} key={i}>
                  <div className="rm-sch">
                    <b>Step #{i + 1}</b>
                    {/* 판정한 스텝은 **한눈에 보이게**(지시) — 글자로도 말한다 */}
                    {!!v && (
                      <span className={`rm-sv ${vLetter(verds, v)}`}>{vDef(verds, v).label}</span>
                    )}
                    {/* 제목은 안 낸다(지시) — 바로 아래 Test Step 과 같은 글자다 */}
                    <span className="rm-sp" />
                    {!!m?.at && (
                      <span className="rm-when" title={`판정자 ${m.by || '–'}`}>{stampFull(m.at)}</span>
                    )}
                    <span className="rm-vb">
                      {quickV.map((d) => (
                        <button
                          type="button"
                          key={d.v}
                          className={`rm-v ${vLetter(verds, d.v)}${vDef(verds, v).v === d.v ? ' on' : ''}`}
                          title={d.label}
                          onClick={() => onStep(i, d.v)}
                        >
                          {shortV(d.v)}
                        </button>
                      ))}
                      {/* 자주 안 쓰는 판정은 톱니바퀴에(지시) */}
                      <button
                        type="button"
                        className={`rm-cog${v && !QUICK.includes(vDef(verds, v).v) ? ' on' : ''}`}
                        title="다른 판정 기준"
                        onClick={(e) => {
                          const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                          setCogAt({ x: Math.max(8, r.right - 170), y: r.bottom + 4, ix: i })
                        }}
                      >
                        ⚙
                      </button>
                    </span>
                  </div>
                  <div className="rm-fl">
                    <div className="v">
                    <span className="l">Test Step</span>{s.desc || s.t || <span className="rm-muted">–</span>}</div>
                  </div>
                  <div className="rm-fl">
                    <div className="v">
                    <span className="l">Test Data</span>
                      {!s.data && !s.dataImg && <span className="rm-muted">–</span>}
                      {s.data ? <div className="rm-bt">{s.data}</div> : null}
                      {s.dataImg ? (
                        <button
                          type="button"
                          className="rm-shot"
                          style={s.dataW ? { width: Math.min(s.dataW, 460) } : undefined}
                          title="크게 보기"
                          onClick={() => setBig(s.dataImg ?? '')}
                        >
                          <img src={s.dataImg} alt="" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="rm-fl">
                    <div className="v">
                    <span className="l">Expected Result</span>
                      {!s.expected && !s.expImg && <span className="rm-muted">–</span>}
                      {s.expected ? <div className="rm-bt">{s.expected}</div> : null}
                      {s.expImg ? (
                        <button
                          type="button"
                          className="rm-shot"
                          style={s.expW ? { width: Math.min(s.expW, 460) } : undefined}
                          title="크게 보기"
                          onClick={() => setBig(s.expImg ?? '')}
                        >
                          <img src={s.expImg} alt="" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="rm-fl">
                    <div className="v">
                    <span className="l">Actual Result</span>
                      <textarea
                        className="rm-ata"
                        defaultValue={m?.act ?? ''}
                        key={`a-${cur}-${i}`}
                        placeholder="실제로 나온 값을 적습니다 — 결과서에 그대로 실립니다"
                        onBlur={(e) => {
                          if (e.target.value !== (m?.act ?? '')) onAct?.(i, e.target.value)
                        }}
                        onPaste={(e) => {
                          /* 글 칸에서 바로 Ctrl+V — 사람은 여기에 붙여넣는다 */
                          const f = [...(e.clipboardData?.items ?? [])]
                            .find((x) => x.type.startsWith('image/'))
                            ?.getAsFile()
                          if (f && onShot) {
                            e.preventDefault()
                            onShot(i, f)
                          }
                        }}
                      />
                      {/* 사진 자리(지시) — 붙여넣기·끌어 놓기 둘 다 */}
                      <div
                        className="rm-shots"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          const f = [...(e.dataTransfer?.files ?? [])].find((x) => x.type.startsWith('image/'))
                          if (f && onShot) {
                            e.preventDefault()
                            onShot(i, f)
                          }
                        }}
                        onPaste={(e) => {
                          const f = [...(e.clipboardData?.items ?? [])]
                            .find((x) => x.type.startsWith('image/'))
                            ?.getAsFile()
                          if (f && onShot) {
                            e.preventDefault()
                            onShot(i, f)
                          }
                        }}
                      >
                        {(m?.imgs ?? []).map((u) => (
                          <span className="rm-shotw" key={u}>
                            <button type="button" className="rm-shot" title="크게 보기" onClick={() => setBig(u)}>
                              <img src={u} alt="" />
                            </button>
                            <button
                              type="button"
                              className="rm-shotx"
                              title="사진 떼기"
                              onClick={() => onShotDel?.(i, u)}
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                        <span className="rm-shotdrop">＋ 사진 — Ctrl+V 로 붙여넣거나 끌어 놓기</span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
            {!steps.length && (
              <div className="rm-none">
                <strong>확인 절차가 없습니다</strong>
                이 시험 항목에 절차가 등록돼 있지 않습니다. 왼쪽 목록의 <b>판정</b> 칸에서
                항목을 통째로 판정할 수 있고, 절차는 「시험 항목」 화면에서 등록하면
                여기에 그대로 나옵니다.
              </div>
            )}


          </div>
        </section>
      </div>

      {bug && (
        <BugDrawer
          runId={runId}
          planId={planId}
          tcid={cur}
          title={one?.title ?? ''}
          step=""
          expected=""
          onClose={() => setBug(false)}
          onSaved={() => {
            setBug(false)
            onBug()
          }}
        />
      )}

      {/* 한 줄 판정 — 목록의 판정 막대를 누르면(지시) */}
      {!!rowAt && (
        <>
          <span className="rm-dovl" role="presentation" onClick={() => setRowAt(null)} />
          <div className="rm-menu" role="menu" style={{ left: rowAt.x, top: rowAt.y }}>
            <div className="rm-menuh">{rowAt.id} 판정</div>
            {verds.map((o) => (
              <button
                type="button"
                role="menuitem"
                key={o.v || '(none)'}
                onClick={() => {
                  const id = rowAt.id
                  setRowAt(null)
                  onVerdicts?.([id], o.v)
                }}
              >
                <i style={{ background: o.color }} /> {o.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* 스텝의 다른 판정 — 자주 안 쓰는 것들(지시) */}
      {!!cogAt && (
        <>
          <span className="rm-dovl" role="presentation" onClick={() => setCogAt(null)} />
          <div className="rm-menu" role="menu" style={{ left: cogAt.x, top: cogAt.y }}>
            <div className="rm-menuh">Step #{cogAt.ix + 1} 판정</div>
            {restV.map((d) => (
              <button
                type="button"
                role="menuitem"
                key={d.v}
                onClick={() => {
                  const ix = cogAt.ix
                  setCogAt(null)
                  onStep(ix, d.v)
                }}
              >
                <i style={{ background: d.color }} /> {d.label}
              </button>
            ))}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const ix = cogAt.ix
                setCogAt(null)
                onStep(ix, pchk[ix] ?? '')
              }}
            >
              <i style={{ background: '#d6dbe0' }} /> 판정 비우기
            </button>
          </div>
        </>
      )}


      {/* ── 오른쪽 서랍 — 요구사항 · 시험항목 (지시) ──
          릴리즈의 Jira 서랍과 **같은 방향·같은 꼴**이다. 화면마다 여는
          쪽이 다르면 사람이 자리를 매번 다시 찾는다. */}
      {!!drw && (
        <>
          <span className="rm-dovl" role="presentation" onClick={() => setDrw('')} />
          <aside className="rm-drw" role="dialog" aria-modal="true">
            <header>
              <b>{drw === 'req' ? '요구사항' : '시험항목'}</b>
              <span className="rm-dk">{drw === 'req' ? info.reqId || '–' : cur}</span>
              <span className="rm-sp" />
              <button type="button" className="rm-dx" title="닫기 (Esc)" onClick={() => setDrw('')}>✕</button>
            </header>
            <div className="rm-dbody">
              {drw === 'req' ? (
                <>
                  <h3 className="rm-dh">{info.reqTitle || '제목 없음'}</h3>
                  {info.reqBody ? (
                    <pre className="rm-dpre">{info.reqBody}</pre>
                  ) : (
                    <div className="rm-muted">요구사항 본문이 없습니다.</div>
                  )}
                </>
              ) : (
                <>
                  <h3 className="rm-dh">{one?.title ?? cur}</h3>
                  <div className="rm-kv">
                    <span className="k">시험 목적</span>
                    <span>{info.purpose || '–'}</span>
                    <span className="k">사전 조건</span>
                    <span>{info.cond || '–'}</span>
                    <span className="k">판정 기준</span>
                    <span>{info.crit || '–'}</span>
                  </div>
                  <div className="rm-dh2">구성도</div>
                  {info.topoImg ? (
                    <button
                      type="button"
                      className="rm-shot"
                      title="크게 보기"
                      onClick={() => setBig(info.topoImg ?? '')}
                    >
                      <img src={info.topoImg} alt="구성도" />
                    </button>
                  ) : info.topoHas ? (
                    <div className="rm-hint">
                      배선은 있는데 구성도 <b>그림</b>이 아직 없습니다 — 시험 항목의
                      <b> Topology</b> 탭에서 <b>「다시 그리기」</b> 를 누르면 만들어집니다.
                    </div>
                  ) : (
                    <div className="rm-muted">구성도가 없습니다.</div>
                  )}
                </>
              )}
            </div>
          </aside>
        </>
      )}

      {/* 사진 크게 보기 — 시험서(TcManual)와 같은 방식 */}
      {!!big && (
        <div className="rm-lb" onMouseDown={() => setBig('')} role="dialog" aria-modal="true" aria-label="사진 크게 보기">
          <img className="rm-bigimg" src={big} alt="" onMouseDown={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}

function BugDrawer({
  runId, planId, tcid, title, step, expected, onClose, onSaved,
}: {
  runId: string
  planId: string
  tcid: string
  title: string
  step: string
  expected: string
  onClose: () => void
  onSaved: () => void
}) {
  const [t, setT] = useState(`[${tcid}] ${title}`)
  const [sev, setSev] = useState('Major')
  const [desc, setDesc] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    try {
      const r = await apiFetch('/api/defects', {
        method: 'POST',
        body: JSON.stringify({
          cycle_id: planId,
          tcid,
          tc_name: title,
          title: t.trim() || `[${tcid}] ${title}`,
          severity: sev,
          note: [step, expected ? `기대: ${expected}` : '', desc].filter(Boolean).join('\n'),
        }),
      })
      if (!r.ok) throw new Error('결함을 만들지 못했습니다')
      onSaved()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '결함을 만들지 못했습니다')
      setBusy(false)
    }
  }

  return (
    <div className="rm-ovl" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rm-drawer" role="dialog" aria-modal="true" aria-label="결함 등록">
        <header>
          <div>
            <b>🐞 결함 등록</b>
            <div className="rm-muted">깨진 절차의 값이 미리 채워집니다</div>
          </div>
          <button type="button" className="rm-x" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="rm-dbody">
          <div className="rm-auto">
            <div className="rm-il">시험 정보</div>
            <div className="rm-ctx">
              <span>실행</span>
              <b>{runId}</b>
              <span>시험 항목</span>
              <b>
                {tcid} · {title}
              </b>
              {step && (
                <>
                  <span>절차</span>
                  <b>{step}</b>
                </>
              )}
              {expected && (
                <>
                  <span>기대 결과</span>
                  <b>{expected}</b>
                </>
              )}
            </div>
          </div>
          <label className="rm-fg">
            <span>제목</span>
            <input value={t} onChange={(e) => setT(e.target.value)} />
          </label>
          <label className="rm-fg">
            <span>중요도</span>
            <select value={sev} onChange={(e) => setSev(e.target.value)}>
              {['Critical', 'Major', 'Minor'].map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          <label className="rm-fg">
            <span>추가 설명</span>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} />
          </label>
        </div>
        <footer>
          <span className="rm-sp" />
          <button type="button" className="rm-btn" onClick={onClose}>
            취소
          </button>
          <button type="button" className="rm-btn pri" disabled={busy} onClick={() => void save()}>
            결함 등록
          </button>
        </footer>
      </div>
    </div>
  )
}
