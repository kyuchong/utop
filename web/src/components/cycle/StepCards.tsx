import { useState } from 'react'
import type { CycleItemLite, CycleStep, Verdict } from '@/pages/Cycles'
import { RESULTS, verdictClass } from '@/pages/Cycles'
import { stepVerdict, type TcStep } from '@/components/tc/types'

/** 판정 종류를 사람 말로 */
const TYPE_LABEL: Record<string, string> = {
  contains: '문구 검증',
  contains_all: '문구 검증 (모두 포함)',
  notcontains: '없어야 함',
  line: '항목(키 : 값) 일치',
  table: '표에서 행·열로',
  expr: '값끼리 견주기',
  none: '판정 안 함',
}

/** 판정기준을 조각으로 — 출력에서 이 조각들을 찾아 물들인다 */
function tokens(step: CycleStep): string[] {
  const c = String(step.criteria ?? '').trim()
  if (!c) return []
  const type = String(step.type ?? 'contains')
  if (type === 'expr' || type === 'table') return []
  if (type === 'line') {
    const at = c.indexOf(':')
    return [at >= 0 ? c.slice(at + 1).trim() : c].filter(Boolean)
  }
  return c
    .split(/\r?\n|,/)
    .map((x) => x.trim())
    .filter(Boolean)
}

/** 걸린 시간을 사람 말로. 3분인지 3초인지가 한눈에 보여야 한다 */
function took(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}초`
  const m = Math.floor(ms / 60_000)
  return `${m}분 ${Math.round((ms % 60_000) / 1000)}초`
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * 출력에서 판정에 걸린 문구를 물들인다.
 *
 * 이것이 이 화면의 핵심이다. `PASS` 세 글자만 보고는 **무엇을 보고 통과라
 * 했는지** 알 수 없어서, 결국 판정기준과 출력을 눈으로 대조하게 된다.
 * 걸린 자리를 칠해 두면 그 일이 없어진다.
 */
function mark(out: string, toks: string[], ok: boolean): string {
  let html = esc(out)
  for (const t of toks) {
    if (!t) continue
    const re = new RegExp(esc(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    html = html.replace(re, (m) => `<mark class="${ok ? 'hit' : 'miss'}">${m}</mark>`)
  }
  return html
}

interface Props {
  item: CycleItemLite
  /** 지금 도는 스텝. 안 돌면 -1 */
  runningAt: number
  /** 실행 당시 자료인가 — 그렇다면 지금 TC 와 다를 수 있다 */
  onSetResult?: (result: string) => void
}

/**
 * 항목 하나의 스텝 — 실행 당시(as-run) 그대로.
 *
 * 옛 화면의 「Test Procedure Details」 를 옮겼다. 스텝마다 네 칸이다 —
 * **무엇을 하려 했나 · 무엇을 보냈나 · 무엇이 나와야 하나 · 무엇이
 * 나왔나.** 이 넷이 나란히 있어야 왜 그렇게 판정됐는지가 읽힌다.
 */
export default function StepCards({ item, runningAt, onSetResult }: Props) {
  const steps = (item.steps ?? []) as CycleStep[]
  const [only, setOnly] = useState(false)
  /** 펼쳐 본 회차 — `스텝-회차` */
  const [openRound, setOpenRound] = useState('')

  const shown = only
    ? steps.filter((s) => stepVerdict(s as TcStep).toLowerCase() === 'fail')
    : steps

  if (!steps.length) return <div className="empty">아직 실행하지 않았습니다.</div>

  return (
    <div className="sc">
      <div className="sc-note">
        <span>
          절차·결과는 <b>실행 당시</b> 그대로입니다. 그 뒤에 시험을 고쳤다면 지금 TC 와 다를 수
          있습니다.
        </span>
        <span className="sp" />
        <label className="sc-only">
          <input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} />
          깨진 것만
        </label>
      </div>

      {shown.map((s) => {
        const i = steps.indexOf(s)
        // 판정은 한 곳에서만 읽는다(types.ts)
        const r = stepVerdict(s as TcStep)
        const bad = r === 'Fail' || r === '불합격'
        const running = runningAt === i
        // 판정은 없어도 돌기는 돈 스텝인가
        const ran = !!s.executed_at || typeof s.took_ms === 'number'
        const out = String(s.output ?? '')
        const toks = tokens(s)
        return (
          <div className={`sc-card${bad ? ' bad' : ''}${running ? ' running' : ''}`} key={i}>
            <div className="sc-head">
              <b>Step#{i + 1}</b>
              <span className="sc-kind">{s.action || (s.waitSec ? '대기' : 'CLI')}</span>
              {/* 언제 · 얼마나. 결과가 Pass 여도 40초 걸리던 것이 3분이
                  되면 무언가 무너진 것이다 — 그것은 판정으로 안 잡힌다. */}
              {(s.executed_at || typeof s.took_ms === 'number') && (
                <span className="sc-when">
                  {s.executed_at && String(s.executed_at).slice(11, 19)}
                  {typeof s.took_ms === 'number' &&
                    s.took_ms >= 0 &&
                    `${s.executed_at ? ' · ' : ''}${took(s.took_ms)}`}
                </span>
              )}
              <span className="sp" />
              {running ? (
                <span className="sc-running">도는 중</span>
              ) : onSetResult ? (
                <select
                  className={`sc-v ${verdictClass((r || '') as Verdict)}`}
                  value={r}
                  onChange={(e) => onSetResult(e.target.value)}
                  title="결과를 손으로 정합니다"
                >
                  {RESULTS.map((x) => (
                    <option key={x.v} value={x.v}>
                      {x.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span className={`sc-v ${verdictClass((r || '') as Verdict)}`}>
                  {/* 판정을 안 내는 스텝(대기·메시지·접속)도 돌기는 돈다.
                      그것을 「미실행」 이라 쓰면 안 돌아간 것으로 읽힌다. */}
                  {r || (ran ? '실행함' : '미실행')}
                </span>
              )}
            </div>

            {s.desc && (
              <div className="sc-sec">
                <i>시험 목적</i>
                <div>{s.desc}</div>
              </div>
            )}

            {s.cli && (
              <div className="sc-sec">
                <i>TEST DATA</i>
                <pre className="sc-cmd">{s.cli}</pre>
              </div>
            )}

            {s.criteria && (
              <div className="sc-sec">
                <i>EXPECTED RESULT</i>
                <div className="sc-exp">
                  <span className="sc-type">{TYPE_LABEL[String(s.type ?? 'contains')] ?? s.type}</span>
                  {s.criteria}
                </div>
              </div>
            )}

            <div className="sc-sec">
              <i>ACTUAL DATA</i>
              {out.trim() ? (
                // 판정에 걸린 문구를 물들인다. 자료는 우리 서버에서 온
                // 것이고 넣기 전에 이스케이프한다.
                <pre
                  className={`sc-out${running ? ' live' : ''}`}
                  dangerouslySetInnerHTML={{ __html: mark(out, toks, !bad) }}
                />
              ) : (
                <div className="muted small">
                  {running ? '응답을 기다리는 중…' : '받은 출력이 없습니다.'}
                </div>
              )}
            </div>

            {/* 회차별 이력.
                반복 안의 스텝은 회차마다 결과가 다르다. 「3회 중 1회
                부적합」 만 적으면 몇 회차에 어떻게 깨졌는지를 다시 못
                찾는다 — 그게 반복 시험에서 유일하게 궁금한 것이다. */}
            {(s.rounds?.length ?? 0) > 1 && (
              <div className="sc-sec">
                <i>회차</i>
                <div className="sc-rounds">
                  {(s.rounds ?? []).map((rd) => {
                    const rbad = String(rd.status ?? '').toUpperCase() === 'FAIL'
                    const on = openRound === `${i}-${rd.n}`
                    return (
                      <button
                        key={rd.n}
                        type="button"
                        className={`sc-round${rbad ? ' bad' : ''}${on ? ' on' : ''}`}
                        title={rd.reason || ''}
                        onClick={() => setOpenRound(on ? '' : `${i}-${rd.n}`)}
                      >
                        {rd.n}
                      </button>
                    )
                  })}
                </div>
                {(() => {
                  const rd = (s.rounds ?? []).find((x) => openRound === `${i}-${x.n}`)
                  if (!rd) return null
                  return (
                    <div className="sc-round-det">
                      <div className="sc-round-head">
                        <b>{rd.n}회차</b>
                        <span className={`sc-v ${verdictClass((rd.status === 'FAIL' ? 'Fail' : rd.status === 'PASS' ? 'Pass' : '') as Verdict)}`}>
                          {rd.status || '–'}
                        </span>
                        {typeof rd.took_ms === 'number' && (
                          <span className="sc-when">{took(rd.took_ms)}</span>
                        )}
                      </div>
                      {rd.reason && <div className="sc-round-why">{rd.reason}</div>}
                      {rd.output ? (
                        <pre className="sc-out">{rd.output}</pre>
                      ) : (
                        <div className="muted small">
                          이 회차의 출력은 남기지 않았습니다 — 깨진 회차와 마지막 회차만 남깁니다.
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            )}

            {/* 왜 그렇게 판정했나.
                실행기가 이미 적어 두는데 화면에 안 나오고 있었다. 그래서
                아래에 실행 로그 판을 따로 두고 거기서 「'E5010-24C' ==
                'E5010-24C'」 를 읽어야 했다 — 카드 안에서 끝나야 한다. */}
            {s.reason && (
              <div className={`sc-why${bad ? ' bad' : ''}`}>
                <i>판정</i>
                <span>{s.reason}</span>
              </div>
            )}
          </div>
        )
      })}

      {shown.length === 0 && <div className="empty">깨진 스텝이 없습니다.</div>}
    </div>
  )
}
