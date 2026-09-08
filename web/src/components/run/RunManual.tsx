import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { apiFetch } from '@/api/client'
import { prefGet, prefSet } from '@/lib/prefs'
import { useVerdicts, vDef, vLetter } from '@/lib/verdicts'
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
  onVerdict, onVerdicts, keys, stale,
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
  onVerdict?: (tcid: string, value: string) => void
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
  const [q, setQ] = useState('')
  const [rf, setRf] = useState('')
  const [per, setPer] = useState(() => Number(prefGet('utop.run.man.per') ?? '') || 50)
  const [page, setPage] = useState(1)
  const [bug, setBug] = useState(false)
  /* 요구사항·시험항목은 **오른쪽 서랍**으로 뺐다(지시) — 스텝이 세로를 다 쓴다.
     서랍이 오른쪽인 것은 릴리즈의 Jira 서랍과 같은 규칙이다(한 방향으로 통일) */
  const [drw, setDrw] = useState<'' | 'req' | 'tc'>('')
  /* 묶기(지시) — Zephyr 의 Group by 자리. 우리 자료에 있는 값만 둔다 */
  const [grp, setGrp] = useState(() => prefGet('utop.run.man.grp') ?? '')
  /** 고른 줄 — 일괄 판정이 여기에만 찍힌다(승인: 체크한 줄만) */
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [bulkAt, setBulkAt] = useState<{ x: number; y: number } | null>(null)
  /** 스텝의 톱니바퀴 메뉴 — 자주 안 쓰는 판정 */
  const [cogAt, setCogAt] = useState<{ x: number; y: number; ix: number } | null>(null)
  /** 「이 줄부터 아래 전부」 판정 — Zephyr 의 SET ALL BELOW TO (지시) */
  const [belowAt, setBelowAt] = useState<{ x: number; y: number; id: string } | null>(null)
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

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    return items.filter(
      (x) =>
        (!rf || TAG[x.v] === rf) &&
        (!n || `${x.id} ${x.title} ${x.assignee} ${x.runner}`.toLowerCase().includes(n)),
    )
  }, [items, q, rf])
  const pages = Math.max(1, Math.ceil(shown.length / per))
  const at = Math.min(page, pages)
  const slice = shown.slice((at - 1) * per, (at - 1) * per + per)
  /** 묶기 값 한 칸 — 없으면 빈 글자 */
  const gval = (x: MItem) =>
    grp === 'v' ? vDef(verds, String(x.raw ?? '')).label
    : grp === 'who' ? (x.assignee || x.runner || '(없음)')
    : grp === 'folder' ? (x.folder || '미분류')
    : grp === 'req' ? (x.req || '(요구사항 없음)')
    : grp === 'type' ? (x.type || '(없음)')
    : grp === 'kind' ? (x.kind || '(없음)')
    : ''
  /** 묶음 — 고른 기준으로 이 쪽의 줄을 나눈다 */
  const groups = useMemo(() => {
    if (!grp) return [{ k: '', rows: slice }]
    const m = new Map<string, MItem[]>()
    for (const x of slice) {
      const k = gval(x)
      m.set(k, [...(m.get(k) ?? []), x])
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ko')).map(([k, rows]) => ({ k, rows }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slice, grp, verds])
  /** 보이는 차례 그대로 편 줄 — 「아래 전부」 가 이 차례를 따른다 */
  const flatRows = useMemo(() => groups.flatMap((g) => g.rows), [groups])
  /** 지금 쪽에 보이는 줄 전부 */
  const pageKeys = slice.map((x) => x.id)
  const allOn = pageKeys.length > 0 && pageKeys.every((k) => sel.has(k))

  const one = items.find((x) => x.id === cur)
  const marked = pchk.filter(Boolean).length

  /** 실행자 이니셜(지시) — 「전규종(검증)」 → 「전」. 온마우스로 온 이름 */
  const initial = (v: string) => {
    const nm = String(v || '').split('(')[0]!.trim()
    if (!nm) return '–'
    return /[A-Za-z]/.test(nm[0] ?? '') ? nm[0]!.toUpperCase() : nm[0]!
  }

  /** 아바타 색 — 이름마다 다른 색이라 여럿이 섞여도 한눈에 갈린다 */
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
          <div className="rm-tools">
            {/* 묶기 — Zephyr 의 Group by 자리(지시: 검색 왼쪽) */}
            <select
              className="rm-f"
              value={grp}
              title="묶어 보기"
              onChange={(e) => {
                setGrp(e.target.value)
                prefSet('utop.run.man.grp', e.target.value)
              }}
            >
              <option value="">묶기 없음</option>
              <option value="v">판정</option>
              <option value="who">실행자</option>
              <option value="folder">폴더</option>
              <option value="req">REQ</option>
              <option value="type">유형</option>
              <option value="kind">타입</option>
            </select>
            <input
              className="rm-q"
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setPage(1)
              }}
              placeholder="ID · 제목 · 실행자 찾기"
            />
            <select
              className="rm-f"
              value={rf}
              onChange={(e) => {
                setRf(e.target.value)
                setPage(1)
              }}
            >
              <option value="">결과 전체</option>
              {(['PASS', 'FAIL', 'BLOCKED', 'WAIT'] as const).map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </div>

          <div className="rm-grid">
            <table>
              <thead>
                <tr>
                  <th className="rm-ck">
                    <input
                      type="checkbox"
                      aria-label="이 쪽 전부 고르기"
                      checked={allOn}
                      onChange={() =>
                        setSel(allOn ? new Set() : new Set(pageKeys))
                      }
                    />
                  </th>
                  <th style={{ width: 108 }}>TC ID</th>
                  <th>시험 항목</th>
                  <th className="rm-mid" style={{ width: 58 }}>담당자</th>
                  <th className="rm-mid" style={{ width: 148 }}>시험 시간</th>
                  <th className="rm-mid" style={{ width: 100 }}>
                    판정
                    {/* 고른 줄에 한 판정을 한 번에(지시: SET ALL) */}
                    <button
                      type="button"
                      className="rm-bulk"
                      disabled={!sel.size || !onVerdicts}
                      title={sel.size ? `고른 ${sel.size}건을 한 판정으로` : '먼저 줄을 고르세요'}
                      onClick={(e) => {
                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        setBulkAt({ x: Math.max(8, r.right - 160), y: r.bottom + 4 })
                      }}
                    >
                      ▾
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const gk = g.rows.map((x) => x.id)
                  const gOn = gk.length > 0 && gk.every((k) => sel.has(k))
                  const gSome = !gOn && gk.some((k) => sel.has(k))
                  return (
                    <Fragment key={`g-${g.k}`}>
                      {!!grp && (
                        <tr className="rm-grh">
                          <td colSpan={6}>
                            <input
                              type="checkbox"
                              className="rm-gck"
                              aria-label={`${g.k} 묶음 고르기`}
                              checked={gOn}
                              ref={(el) => {
                                if (el) el.indeterminate = gSome
                              }}
                              onChange={() =>
                                setSel((st) => {
                                  const n = new Set(st)
                                  if (gOn) gk.forEach((k) => n.delete(k))
                                  else gk.forEach((k) => n.add(k))
                                  return n
                                })
                              }
                            />
                            <b>{g.k || '(없음)'}</b>
                            <span className="rm-muted">{g.rows.length}건</span>
                          </td>
                        </tr>
                      )}
                      {g.rows.map((x) => {
                        const d = vDef(verds, String(x.raw ?? ''))
                        const who = x.assignee || x.runner || ''
                        const when = stampFull(x.at)
                        return (
                          <tr
                            key={x.id}
                            className={`rm-r ${x.v}${x.id === cur ? ' on' : ''}`}
                            onClick={() => onPick(x.id)}
                          >
                            <td className="rm-ck" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                aria-label={`${x.id} 고르기`}
                                checked={sel.has(x.id)}
                                onChange={(e) =>
                                  setSel((st) => {
                                    const n = new Set(st)
                                    if (e.target.checked) n.add(x.id)
                                    else n.delete(x.id)
                                    return n
                                  })
                                }
                              />
                            </td>
                            <td className="rm-bar" title={`지금 결과 ${TAG[x.v]}`}>
                              <span className="rm-id">{x.id}</span>
                            </td>
                            <td className="rm-t" title={x.title}>{x.title}</td>
                            {/* 담당자 — 동그란 아이콘, 온마우스로 온 이름(지시) */}
                            <td className="rm-who" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                className="rm-avb"
                                title={`${who || '담당자 없음'} — 누르면 이 줄부터 아래 전부를 한 판정으로`}
                                onClick={(e) => {
                                  const r2 = (e.currentTarget as HTMLElement).getBoundingClientRect()
                                  setBelowAt({ x: Math.max(8, r2.left - 40), y: r2.bottom + 4, id: x.id })
                                }}
                              >
                                {who ? (
                                  <span className="rm-av" style={{ background: avColor(who) }}>{initial(who)}</span>
                                ) : (
                                  <span className="rm-av none">–</span>
                                )}
                                <i className="rm-avc">⌄</i>
                              </button>
                            </td>
                            <td className="rm-when" title={when || '아직 판정 안 함'}>
                              {when || <span className="rm-muted">–</span>}
                            </td>
                            <td>
                              {/* 절차가 없는 항목의 **유일한 판정 자리**다. 선택지는
                                  셋업(실행 판정 기준)이 정본 — 색도 그 값을 따른다 */}
                              <select
                                className={`rm-vs ${x.v}`}
                                value={d.v}
                                disabled={!onVerdict}
                                style={x.raw ? { color: d.fg, borderColor: d.color } : undefined}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => onVerdict?.(x.id, e.target.value)}
                              >
                                {verds.map((o) => (
                                  <option key={o.v || '(none)'} value={o.v}>{o.label}</option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        )
                      })}
                    </Fragment>
                  )
                })}
                {!slice.length && (
                  <tr>
                    <td colSpan={6} className="rm-none">
                      조건에 맞는 항목이 없습니다
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="rm-pager">
            <span className="rm-muted">한 쪽에</span>
            <select
              value={per}
              onChange={(e) => {
                setPer(Number(e.target.value))
                setPage(1)
                prefSet('utop.run.man.per', e.target.value)
              }}
            >
              {[25, 50, 100].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
            <span className="rm-sp" />
            <button type="button" onClick={() => setPage(1)} disabled={at <= 1}>«</button>
            <button type="button" onClick={() => setPage(at - 1)} disabled={at <= 1}>‹</button>
            <b>{at} / {pages}</b>
            <button type="button" onClick={() => setPage(at + 1)} disabled={at >= pages}>›</button>
            <button type="button" onClick={() => setPage(pages)} disabled={at >= pages}>»</button>
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

      {/* 이 줄부터 아래 전부 — Zephyr 의 SET ALL BELOW TO(지시) */}
      {!!belowAt && (() => {
        const at2 = flatRows.findIndex((r) => r.id === belowAt.id)
        const targets = at2 < 0 ? [] : flatRows.slice(at2).map((r) => r.id)
        return (
          <>
            <span className="rm-dovl" role="presentation" onClick={() => setBelowAt(null)} />
            <div className="rm-menu" role="menu" style={{ left: belowAt.x, top: belowAt.y }}>
              <div className="rm-menuh">이 줄부터 아래 {targets.length}건을</div>
              {verds.map((o) => (
                <button
                  type="button"
                  role="menuitem"
                  key={o.v || '(none)'}
                  onClick={() => {
                    setBelowAt(null)
                    if (!targets.length) return
                    if (
                      !window.confirm(
                        `이 줄부터 아래 ${targets.length}건을 「${o.label}」 로 판정합니다.\n계속할까요?`,
                      )
                    )
                      return
                    onVerdicts?.(targets, o.v)
                  }}
                >
                  <i style={{ background: o.color }} /> {o.label}
                </button>
              ))}
            </div>
          </>
        )
      })()}

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

      {/* 고른 줄 일괄 판정 — 셋업의 판정 목록 그대로 */}
      {!!bulkAt && (
        <>
          <span className="rm-dovl" role="presentation" onClick={() => setBulkAt(null)} />
          <div className="rm-menu" role="menu" style={{ left: bulkAt.x, top: bulkAt.y }}>
            <div className="rm-menuh">고른 {sel.size}건을</div>
            {verds.map((o) => (
              <button
                type="button"
                role="menuitem"
                key={o.v || '(none)'}
                onClick={() => {
                  const ids = [...sel]
                  setBulkAt(null)
                  onVerdicts?.(ids, o.v)
                }}
              >
                <i style={{ background: o.color }} /> {o.label}
              </button>
            ))}
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
