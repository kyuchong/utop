import { useMemo, useRef, useState } from 'react'
import { apiFetch } from '@/api/client'
import { prefGet, prefSet } from '@/lib/prefs'
import './RunManual.css'

/**
 * **수동 시험 화면 — 두 판**(주신 목업).
 *
 * 왼쪽은 **촘촘한 표**(수백 건을 훑는 자리), 오른쪽은 **한 항목의 시험서**다.
 * 가운데 분할바로 폭을 정하고, 그 폭은 계정별로 남는다.
 *
 * 표의 첫 칸 왼쪽 **세로 막대가 지금 결과**다 — 알약을 한 칸 더 쓰지 않고
 * 색으로 읽는다. 「최근결과」 칸은 그와 다른 값이다(지난 빌드의 결과).
 *
 * 판정은 **스텝마다** 남기고, 그것을 모아 항목 결과가 된다. 하나라도
 * 실패면 실패 — 사람이 따로 항목 결과를 또 고르지 않아도 된다.
 */

export type V = 'p' | 'f' | 'b' | 'n'
const TAG: Record<V, string> = { p: 'PASS', f: 'FAIL', b: 'BLOCKED', n: 'WAIT' }
/** 판정 시각 — 이 곳 시간으로, 한 줄에 들어가게 짧게 */
const stamp = (iso: string) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '–'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export interface MItem {
  id: string
  title: string
  assignee: string
  runner: string
  /** 이 실행의 결과 */
  v: V
  /** 지난 빌드의 결과 — 없으면 n */
  last: V
  bugs: number
  at: string
}
export interface MStep {
  t: string
  data?: string
  expected: string
  /** 스텝 설명 — 목업의 TEST STEP 칸 */
  desc?: string
  /** 시험서에 붙인 사진. 글자와 **따로** 담긴다 — 글자만 그리면 사진이
   *  사라진다(지적: 이미지 추가했는데 텍스트만 나온다). 폭은 시험서에서
   *  늘여 놓은 그대로 쓴다. */
  dataImg?: string
  dataW?: number
  expImg?: string
  expW?: number
}
export interface MMeta {
  at?: string
  by?: string
  act?: string
}

export default function RunManual({
  items, cur, onPick, steps, pchk, pmeta, onStep, onAct, note, onNote, info, planId, runId, onBug,
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
  note: string
  onNote: (v: string) => void
  info: {
    purpose: string; cond: string; crit: string
    topoImg?: string; topoW?: number
    /** 배선이 그려져 있나 — 그림이 없을 때 「없다」 와 「안 떴다」 를 가른다 */
    topoHas?: boolean
  }
  planId: string
  runId: string
  onBug: () => void
}) {
  const [w, setW] = useState(() => Number(prefGet('utop.run.man.w') ?? '') || 44)
  /** 크게 볼 사진 — 줄여 놓으면 글자가 안 읽힌다(시험서와 같은 규칙).
   *  새 탭으로 안 띄운다 — 돌아오면 보던 항목과 줄을 다시 찾아야 한다. */
  const [big, setBig] = useState('')
  const [q, setQ] = useState('')
  const [rf, setRf] = useState('')
  const [per, setPer] = useState(() => Number(prefGet('utop.run.man.per') ?? '') || 50)
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<number | null>(0)
  const [bug, setBug] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState(false)

  const startSash = (e: React.MouseEvent) => {
    e.preventDefault()
    setDrag(true)
    const move = (ev: MouseEvent) => {
      const r = wrapRef.current?.getBoundingClientRect()
      if (!r) return
      setW(Math.max(30, Math.min(65, ((ev.clientX - r.left) / r.width) * 100)))
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

  const one = items.find((x) => x.id === cur)
  const marked = pchk.filter(Boolean).length

  return (
    <div className="rm" ref={wrapRef}>
      {/* ── 왼쪽: 촘촘한 표 ── */}
      <div className="rm-left" style={{ width: `${w}%` }}>
        <section className="rm-panel">
          <header>
            <b>시험 항목</b>
            <small>{items.length}개 · 지금 결과는 왼쪽 막대</small>
          </header>

          <div className="rm-tools">
            <input
              className="rm-q"
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setPage(1)
              }}
              placeholder="ID · 제목 · 할당자 · 실행자 찾기"
            />
            <select
              className="rm-f"
              value={rf}
              onChange={(e) => {
                setRf(e.target.value)
                setPage(1)
              }}
            >
              <option value="">지금 결과 전체</option>
              {(['PASS', 'FAIL', 'BLOCKED', 'WAIT'] as const).map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
            <span className="rm-sum">
              {shown.length ? `${(at - 1) * per + 1}-${Math.min(at * per, shown.length)} / ${shown.length}` : '0 / 0'}
            </span>
          </div>

          <div className="rm-grid">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 96 }}>ID</th>
                  <th>제목</th>
                  <th style={{ width: 78 }}>할당자</th>
                  <th style={{ width: 78 }}>실행자</th>
                  <th style={{ width: 74 }}>최근결과</th>
                  <th style={{ width: 60 }}>버그</th>
                  <th style={{ width: 96 }}>실행 날짜</th>
                </tr>
              </thead>
              <tbody>
                {slice.map((x) => (
                  <tr
                    key={x.id}
                    className={`rm-r ${x.v}${x.id === cur ? ' on' : ''}`}
                    onClick={() => onPick(x.id)}
                  >
                    <td className="rm-bar" title={`지금 결과 ${TAG[x.v]}`}>
                      <span className="rm-id">{x.id}</span>
                    </td>
                    <td className="rm-t">{x.title}</td>
                    <td>{x.assignee || '–'}</td>
                    <td>{x.runner || '–'}</td>
                    <td>
                      <span className={`rm-tag ${x.last}`}>{TAG[x.last]}</span>
                    </td>
                    <td>{x.bugs ? <span className="rm-bug">🐞 {x.bugs}</span> : '–'}</td>
                    <td>{x.at || '–'}</td>
                  </tr>
                ))}
                {!slice.length && (
                  <tr>
                    <td colSpan={7} className="rm-none">
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
            <button type="button" onClick={() => setPage(1)} disabled={at <= 1}>
              «
            </button>
            <button type="button" onClick={() => setPage(at - 1)} disabled={at <= 1}>
              ‹
            </button>
            <b>
              {at} / {pages}
            </b>
            <button type="button" onClick={() => setPage(at + 1)} disabled={at >= pages}>
              ›
            </button>
            <button type="button" onClick={() => setPage(pages)} disabled={at >= pages}>
              »
            </button>
          </div>
        </section>
      </div>

      <div className={`rm-sash${drag ? ' on' : ''}`} onMouseDown={startSash} />

      {/* ── 오른쪽: 한 항목의 시험서 ── */}
      <div className="rm-right">
        <section className="rm-panel">
          <div className="rm-scroll">
            <div className="rm-head">
              <div className="rm-hl">
                <div className="rm-title">
                  {cur} · {one?.title ?? ''}
                </div>
                <div className="rm-chips">
                  <span className="rm-chip">할당자 {one?.assignee || '–'}</span>
                  <span className="rm-chip">실행자 {one?.runner || '–'}</span>
                  <span className="rm-chip">최근 결과 {TAG[one?.last ?? 'n']}</span>
                  {!!one?.bugs && <span className="rm-chip">버그 {one.bugs}</span>}
                  {one?.at && <span className="rm-chip">{one.at}</span>}
                </div>
              </div>
              {/* 이 항목의 결과 — **스텝 판정에서 굴러 나온 값**이라 여기서 고르지 않는다.
                  하나라도 실패면 실패, 전부 통과라야 통과다. */}
              <div
                className={`rm-big ${one?.v ?? 'n'}`}
                title={
                  marked
                    ? `스텝 ${steps.length}개 중 ${marked}개 판정 — 하나라도 실패면 실패입니다`
                    : '아직 판정한 스텝이 없습니다'
                }
              >
                <div className="rm-bigl">시험 결과</div>
                <b className="rm-bigv">{TAG[one?.v ?? 'n']}</b>
                <div className="rm-bigs">
                  {marked} / {steps.length} 판정
                </div>
              </div>
            </div>

            <div className="rm-sec">
              <div className="rm-sect">Info</div>
              <div className="rm-info">
                <div className="rm-ic">
                  <div className="rm-il">시험 목적</div>
                  <div className="rm-iv">{info.purpose || '–'}</div>
                </div>
                <div className="rm-ic">
                  <div className="rm-il">시험 조건</div>
                  <div className="rm-iv">{info.cond || '–'}</div>
                </div>
                <div className="rm-ic full">
                  <div className="rm-il">구성도</div>
                  {/* 구성도는 **그림**이다. 글자 칸에 넣고 있어서 늘 비어
                      보였다 — 이름을 고쳐도 주소만 찍힐 자리였다(지적). */}
                  {info.topoImg ? (
                    <button
                      type="button"
                      className="rm-shot"
                      style={info.topoW ? { width: info.topoW } : undefined}
                      title="크게 보기"
                      onClick={() => setBig(info.topoImg ?? '')}
                    >
                      <img src={info.topoImg} alt="구성도" />
                    </button>
                  ) : info.topoHas ? (
                    /* 배선은 그려 뒀는데 **그림으로 뜬 적이 없다.** 구성도
                       그림은 Topology 탭의 「다시 그리기」 를 눌러야 만들어진다
                       (자동이 아니다) — 없는 그림을 여기서 지어낼 수는 없으니
                       할 일을 말해 준다(지적: 구성도가 이미지로 안 들어간다). */
                    <div className="rm-iv rm-hint">
                      배선은 있는데 구성도 <b>그림</b>이 아직 없습니다 — 시험 항목의
                      <b> Topology</b> 탭에서 <b>「다시 그리기」</b> 를 한 번 누르면 만들어집니다.
                    </div>
                  ) : (
                    <div className="rm-iv">–</div>
                  )}
                </div>
              </div>
            </div>

            <div className="rm-sec">
              <div className="rm-sect">
                확인 절차 <span className="rm-muted">{marked} / {steps.length} 판정</span>
              </div>
              {steps.map((s, i) => {
                const v = pchk[i] ?? ''
                const m = (pmeta ?? [])[i] ?? null
                const isOpen = open === i
                return (
                  <div className={`rm-step${isOpen ? ' open' : ''}`} key={i}>
                    <button type="button" className="rm-sh" onClick={() => setOpen(isOpen ? null : i)}>
                      <span className="rm-no">{i + 1}</span>
                      <span className="rm-st">
                        <b>{s.t || `스텝 ${i + 1}`}</b>
                        <em>{s.expected}</em>
                      </span>
                      <span className={`rm-ss ${v || 'n'}`}>{v ? TAG[v as V] : 'WAIT'}</span>
                      <span className="rm-car">{isOpen ? '⌃' : '⌄'}</span>
                    </button>
                    {isOpen && (
                      <div className="rm-sb">
                        {(s.desc || s.t) && (
                          <div className="rm-tstep">
                            <div className="rm-bl">TEST STEP</div>
                            <div className="rm-bt">{s.desc || s.t}</div>
                          </div>
                        )}
                        <div className="rm-cmp">
                          <div>
                            <div className="rm-bl">Test Data</div>
                            {/* 글자와 사진을 **둘 다** 낸다 — 시험서에서 사진만
                                붙인 스텝도 있어, 글자만 그리면 그 칸이 빈다 */}
                            {!s.data && !s.dataImg ? <div className="rm-bt">–</div> : null}
                            {s.data ? <div className="rm-bt">{s.data}</div> : null}
                            {s.dataImg ? (
                              <button
                                type="button"
                                className="rm-shot"
                                style={s.dataW ? { width: s.dataW } : undefined}
                                title="크게 보기"
                                onClick={() => setBig(s.dataImg ?? '')}
                              >
                                <img src={s.dataImg} alt="" />
                              </button>
                            ) : null}
                          </div>
                          <div>
                            <div className="rm-bl">Expected Result</div>
                            {!s.expected && !s.expImg ? <div className="rm-bt">–</div> : null}
                            {s.expected ? <div className="rm-bt">{s.expected}</div> : null}
                            {s.expImg ? (
                              <button
                                type="button"
                                className="rm-shot"
                                style={s.expW ? { width: s.expW } : undefined}
                                title="크게 보기"
                                onClick={() => setBig(s.expImg ?? '')}
                              >
                                <img src={s.expImg} alt="" />
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <div className="rm-cmp">
                          <div>
                            <div className="rm-bl">Actual Result</div>
                            <textarea
                              className="rm-ata"
                              defaultValue={m?.act ?? ''}
                              placeholder="실제로 나온 값을 적습니다 — 결과서에 그대로 실립니다"
                              onBlur={(e) => {
                                if (e.target.value !== (m?.act ?? '')) onAct?.(i, e.target.value)
                              }}
                            />
                          </div>
                          <div>
                            <div className="rm-bl">Evidence</div>
                            <div className="rm-evi">증적은 아래 「비고 · 특이사항」에 적습니다</div>
                          </div>
                        </div>
                        <div className="rm-judge">
                          <div className="rm-jb">
                            <div className="rm-jl">판정 기준</div>
                            <div className="rm-jv">{info.crit || s.expected || '–'}</div>
                          </div>
                          <div className="rm-jb">
                            <div className="rm-jl">결과</div>
                            <b className={`rm-jr ${v || 'n'}`}>{v ? TAG[v as V] : 'WAIT'}</b>
                          </div>
                          <div className="rm-jb">
                            <div className="rm-jl">판정 시각</div>
                            <div className="rm-jv">{m?.at ? stamp(m.at) : '–'}</div>
                          </div>
                          <div className="rm-jb">
                            <div className="rm-jl">판정자</div>
                            <div className="rm-jv">{m?.by || '–'}</div>
                          </div>
                        </div>
                        <div className="rm-act">
                          <div className="rm-vb">
                            {(['p', 'f', 'b'] as const).map((o) => (
                              <button
                                type="button"
                                key={o}
                                className={`rm-v ${o}${v === o ? ' on' : ''}`}
                                onClick={() => onStep(i, o)}
                              >
                                {o === 'p' ? '통과' : o === 'f' ? '실패' : '기타'}
                              </button>
                            ))}
                          </div>
                          <span className="rm-sp" />
                          <span className="rm-muted">
                            {v === 'f' ? '이 절차가 깨졌습니다 — 결함을 남기세요' : ''}
                          </span>
                          <button type="button" className="rm-bugbtn" onClick={() => setBug(true)}>
                            🐞 결함 등록
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              {!steps.length && (
                <div className="rm-none">
                  <strong>확인 절차가 없습니다</strong>
                  이 시험 항목에 절차가 등록돼 있지 않습니다. 「시험 항목」 화면에서 스텝을
                  등록하면 여기에 그대로 나옵니다.
                </div>
              )}
            </div>

            <div className="rm-sec">
              <div className="rm-sect">비고 · 특이사항</div>
              <textarea
                className="rm-ta"
                defaultValue={note}
                key={`n-${cur}`}
                placeholder="결과서의 비고 칸에 그대로 들어갑니다"
                onBlur={(e) => e.target.value !== note && onNote(e.target.value)}
              />
            </div>
          </div>
        </section>
      </div>

      {bug && (
        <BugDrawer
          runId={runId}
          planId={planId}
          tcid={cur}
          title={one?.title ?? ''}
          step={open !== null ? `Step ${open + 1} · ${steps[open]?.t ?? ''}` : ''}
          expected={open !== null ? (steps[open]?.expected ?? '') : ''}
          onClose={() => setBug(false)}
          onSaved={() => {
            setBug(false)
            onBug()
          }}
        />
      )}

      {/* 사진 크게 보기 — 시험서(TcManual)와 같은 방식이다. 줄여 놓은
          그림은 글자가 안 읽혀, 판정하려면 키워 봐야 한다. */}
      {!!big && (
        /* 서랍용 덮개(rm-ovl)를 쓰고 있었다 — 그건 오른쪽에 붙이는
           용도라 가운데 정렬이 없어 사진이 왼쪽 위 구석에 붙었다(지적). */
        <div className="rm-lb" onMouseDown={() => setBig('')} role="dialog" aria-modal="true" aria-label="사진 크게 보기">
          <img className="rm-bigimg" src={big} alt="" onMouseDown={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}

/** 결함 등록 — 깨진 절차의 값이 미리 채워진다 */
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
