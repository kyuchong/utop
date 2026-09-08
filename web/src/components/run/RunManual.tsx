import { useMemo, useRef, useState } from 'react'
import { apiFetch } from '@/api/client'
import { prefGet, prefSet } from '@/lib/prefs'
import { useVerdicts, vDef } from '@/lib/verdicts'
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
/** 판정 시각 — 이 곳 시간으로, 한 줄에 들어가게 짧게 */
const stamp = (iso: string) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '–'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
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
}

export default function RunManual({
  items, cur, onPick, steps, pchk, pmeta, onStep, onAct, note, onNote, info, planId, runId, onBug,
  onVerdict, keys, stale,
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
    topoHas?: boolean
    /** 요구사항 — 머리 번호와 접이 블록이 쓴다 */
    reqId?: string
    reqTitle?: string
  }
  planId: string
  runId: string
  onBug: () => void
  /** 목록에서 항목을 통째로 판정할 때 — 절차가 없는 항목의 유일한 길 */
  onVerdict?: (tcid: string, value: string) => void
  /** 머리의 네 번호 — 요구사항 / 항목 / 사이클 / 실행 */
  keys?: { cycle?: string; run?: string }
  /** 담을 때보다 시험 항목이 바뀌었나 — 「Update this test script」 띠 */
  stale?: { changed: boolean; detail: string; onUpdate: () => void; onDiff?: () => void }
}) {
  const verds = useVerdicts()
  const [w, setW] = useState(() => Number(prefGet('utop.run.man.w') ?? '') || 44)
  /** 크게 볼 사진 — 줄여 놓으면 글자가 안 읽힌다(시험서와 같은 규칙) */
  const [big, setBig] = useState('')
  const [q, setQ] = useState('')
  const [rf, setRf] = useState('')
  const [per, setPer] = useState(() => Number(prefGet('utop.run.man.per') ?? '') || 50)
  const [page, setPage] = useState(1)
  const [bug, setBug] = useState(false)
  /* 요구사항·시험항목 블록은 접힌다 — 스텝이 세로를 다 쓰게(지시: 공간 낭비 금지) */
  const [openReq, setOpenReq] = useState(false)
  const [openTc, setOpenTc] = useState(true)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState(false)

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

  const one = items.find((x) => x.id === cur)
  const marked = pchk.filter(Boolean).length

  /** 머리 번호 한 칸 */
  const keyChip = (label: string, v?: string, tone?: 'run') =>
    v ? (
      <span className="rm-kc">
        <em>{label}</em>
        <b className={tone === 'run' ? 'run' : undefined}>{v}</b>
      </span>
    ) : null

  return (
    <div className="rm" ref={wrapRef}>
      {/* ── 왼쪽: 결과바 · TC ID · 항목 · 실행자 · 판정 (지시) ── */}
      <div className="rm-left" style={{ width: `${w}%` }}>
        <section className="rm-panel">
          <div className="rm-tools">
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
            <span className="rm-sum">
              {shown.length ? `${(at - 1) * per + 1}-${Math.min(at * per, shown.length)} / ${shown.length}` : '0 / 0'}
            </span>
          </div>

          <div className="rm-grid">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 108 }}>TC ID</th>
                  <th>시험 항목</th>
                  <th style={{ width: 76 }}>실행자</th>
                  <th style={{ width: 92 }}>판정</th>
                </tr>
              </thead>
              <tbody>
                {slice.map((x) => {
                  const d = vDef(verds, String(x.raw ?? ''))
                  return (
                    <tr
                      key={x.id}
                      className={`rm-r ${x.v}${x.id === cur ? ' on' : ''}`}
                      onClick={() => onPick(x.id)}
                    >
                      <td className="rm-bar" title={`지금 결과 ${TAG[x.v]}`}>
                        <span className="rm-id">{x.id}</span>
                      </td>
                      <td className="rm-t" title={x.title}>{x.title}</td>
                      <td title={x.assignee || x.runner}>{x.assignee || x.runner || '–'}</td>
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
                {!slice.length && (
                  <tr>
                    <td colSpan={4} className="rm-none">
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
          {/* 머리 한 줄 — 이름·판정·진행이 전부 여기(지시: 공간 낭비 금지) */}
          <div className="rm-hd1">
            <b className="rm-h1t" title={one?.title ?? ''}>{one?.title ?? cur}</b>
            <span className={`rm-hv ${one?.v ?? 'n'}`}>
              {TAG[one?.v ?? 'n']} {marked}/{steps.length}
            </span>
            <span className="rm-sp" />
            {!!one?.bugs && <span className="rm-muted">🐞 {one.bugs}</span>}
            <button type="button" className="rm-bugbtn" onClick={() => setBug(true)}>🐞 결함</button>
          </div>

          {/* 네 번호 — 요구사항 / 항목 / 사이클 / 실행 (지시) */}
          <div className="rm-keys">
            {keyChip('요구사항', info.reqId)}
            {keyChip('항목', cur)}
            {keyChip('사이클', keys?.cycle)}
            {keyChip('실행', keys?.run ?? runId, 'run')}
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
            {/* 요구사항 — 제목은 늘 보이고, 본문은 눌러서 편다 */}
            <div className="rm-blk">
              <button type="button" className="rm-blkh" onClick={() => setOpenReq((v) => !v)}>
                <b>요구사항</b>
                <span className="rm-blkq" title={info.reqTitle || ''}>
                  {info.reqTitle || <span className="rm-muted">연결된 요구사항이 없습니다</span>}
                </span>
                <span className="rm-sp" />
                <span className="rm-car">{openReq ? '⌃' : '⌄'}</span>
              </button>
              {openReq && (
                <div className="rm-blkb">
                  <div className="rm-kv">
                    <span className="k">요구사항</span>
                    <span>{info.reqId || '–'}</span>
                    <span className="k">제목</span>
                    <span>{info.reqTitle || '–'}</span>
                  </div>
                </div>
              )}
            </div>

            {/* 시험항목 — 시험 목적·조건·판정 기준·구성도 */}
            <div className="rm-blk">
              <button type="button" className="rm-blkh" onClick={() => setOpenTc((v) => !v)}>
                <b>시험항목</b>
                <span className="rm-blkq">{info.crit || info.purpose || ''}</span>
                <span className="rm-sp" />
                <span className="rm-car">{openTc ? '⌃' : '⌄'}</span>
              </button>
              {openTc && (
                <div className="rm-blkb">
                  <div className="rm-kv">
                    <span className="k">시험 목적</span>
                    <span>{info.purpose || '–'}</span>
                    <span className="k">사전 조건</span>
                    <span>{info.cond || '–'}</span>
                    <span className="k">판정 기준</span>
                    <span>{info.crit || '–'}</span>
                    <span className="k">구성도</span>
                    <span>
                      {info.topoImg ? (
                        <button
                          type="button"
                          className="rm-shot"
                          style={info.topoW ? { width: Math.min(info.topoW, 420) } : undefined}
                          title="크게 보기"
                          onClick={() => setBig(info.topoImg ?? '')}
                        >
                          <img src={info.topoImg} alt="구성도" />
                        </button>
                      ) : info.topoHas ? (
                        <span className="rm-hint">
                          배선은 있는데 구성도 <b>그림</b>이 아직 없습니다 — 시험 항목의
                          <b> Topology</b> 탭에서 <b>「다시 그리기」</b> 를 누르면 만들어집니다.
                        </span>
                      ) : (
                        '–'
                      )}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* 스텝 — 카드 한 장에 네 칸이 한 줄씩(지시: 2안) */}
            {steps.map((s, i) => {
              const v = pchk[i] ?? ''
              const m = (pmeta ?? [])[i] ?? null
              return (
                <div className={`rm-sc${v ? ` v-${v}` : ''}`} key={i}>
                  <div className="rm-sch">
                    <b>Step #{i + 1}</b>
                    <span className="rm-sct" title={s.t}>{s.t || ''}</span>
                    <span className="rm-sp" />
                    {!!m?.at && (
                      <span className="rm-muted" title={`판정자 ${m.by || '–'}`}>{stamp(m.at)}</span>
                    )}
                    <span className="rm-vb">
                      {(['p', 'f', 'b'] as const).map((o) => (
                        <button
                          type="button"
                          key={o}
                          className={`rm-v ${o}${v === o ? ' on' : ''}`}
                          title={o === 'p' ? '통과' : o === 'f' ? '실패' : '기타'}
                          onClick={() => onStep(i, o)}
                        >
                          {o === 'p' ? 'P' : o === 'f' ? 'F' : 'B'}
                        </button>
                      ))}
                    </span>
                  </div>
                  <div className="rm-fl">
                    <div className="l">Test Step</div>
                    <div className="v">{s.desc || s.t || <span className="rm-muted">–</span>}</div>
                  </div>
                  <div className="rm-fl">
                    <div className="l">Test Data</div>
                    <div className="v">
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
                    <div className="l">Expected Result</div>
                    <div className="v">
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
                    <div className="l">Actual Result</div>
                    <div className="v">
                      <textarea
                        className="rm-ata"
                        defaultValue={m?.act ?? ''}
                        key={`a-${cur}-${i}`}
                        placeholder="실제로 나온 값을 적습니다 — 결과서에 그대로 실립니다"
                        onBlur={(e) => {
                          if (e.target.value !== (m?.act ?? '')) onAct?.(i, e.target.value)
                        }}
                      />
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

            <div className="rm-blk">
              <div className="rm-blkh as-h"><b>비고 · 특이사항</b></div>
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
          step=""
          expected=""
          onClose={() => setBug(false)}
          onSaved={() => {
            setBug(false)
            onBug()
          }}
        />
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
