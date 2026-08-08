import { useState } from 'react'
import type { CycleItemLite, CycleStep, Verdict } from '@/pages/Cycles'
import { RESULTS, verdictClass } from '@/pages/Cycles'
import { stepKindInfo, stepVerdict, type TcStep } from '@/components/tc/types'

/** 판정 종류를 사람 말로 */
/** 그 판정이 실제로 무엇을 보는지 — 이름만으로는 안 갈린다 */
const RULE_HINT: Record<string, string> = {
  contains: '아래 중 하나라도 응답에 있으면 합격',
  contains_all: '아래가 모두 응답에 있어야 합격',
  notcontains: '아래가 하나도 없어야 합격',
  line: '그 항목 줄을 찾아 값이 같아야 합격',
  table: '고른 행이 모두 조건을 만족해야 합격',
  expr: '두 값을 견주어 맞으면 합격',
  ok: '오류 없이 응답하면 합격',
  none: '판정하지 않는다',
}

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
  // 0ms 는 「안 쟀나」 로 읽힌다. 잰 것이 맞고 그만큼 빨랐을 뿐이다
  if (ms < 1) return '<1ms'
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
  /** 스텝 하나의 결과를 손으로 정한다 (스텝 번호, 값) */
  onSetResult?: (at: number, result: string) => void
}

/**
 * 항목 하나의 스텝 — 실행 당시(as-run) 그대로.
 *
 * 옛 화면의 「Test Procedure Details」 를 옮겼다. 스텝마다 네 칸이다 —
 * **무엇을 하려 했나 · 무엇을 보냈나 · 무엇이 나와야 하나 · 무엇이
 * 나왔나.** 이 넷이 나란히 있어야 왜 그렇게 판정됐는지가 읽힌다.
 */
export default function StepCards({ item, runningAt, onSetResult }: Props) {
  const all = (item.steps ?? []) as CycleStep[]
  const [only, setOnly] = useState(false)
  /**
   * 어느 회차를 보고 있나. 0 이면 「전체」 — 합쳐진 결과.
   *
   * 스텝마다 회차를 따로 누르면 7회차를 보려고 스텝 수만큼 눌러야 한다.
   * 회차를 하나 고르면 **모든 스텝이 그 회차로** 바뀌어야 한다.
   * TC 화면과 같은 방식이다 — 오갈 때 눈이 안 헤맨다.
   */
  const [viewRound, setViewRound] = useState(0)
  const [badOnly, setBadOnly] = useState(false)
  /** 스텝 하나 안에서 펼쳐 본 회차 — `스텝-회차` */
  const [openRound, setOpenRound] = useState('')

  const roundMax = all.reduce((a, x) => Math.max(a, x.rounds?.length ?? 0), 0)
  /** 한 스텝이라도 깨진 회차 — 100번 돌려 3번 깨졌으면 궁금한 것은 그 3번이다 */
  const badRounds = Array.from({ length: roundMax }, (_, n) => n + 1).filter((n) =>
    all.some(
      (x) => String(x.rounds?.find((r) => r.n === n)?.status ?? '').toUpperCase() === 'FAIL',
    ),
  )

  /** 고른 회차의 눈으로 본 스텝들. 반복 밖의 스텝은 회차가 없어 그대로다 */
  const steps: CycleStep[] =
    viewRound > 0
      ? all.map((x) => {
          const rd = x.rounds?.find((r) => r.n === viewRound)
          if (!rd) return x
          return {
            ...x,
            status: rd.status ?? '',
            repeatResult: rd.status === 'PASS' ? 'Pass' : rd.status === 'FAIL' ? 'Fail' : '',
            reason: rd.reason ?? '',
            output: rd.output ?? '',
            took_ms: rd.took_ms ?? null,
          }
        })
      : all

  const shown = only
    ? steps.filter((s) => stepVerdict(s as TcStep).toLowerCase() === 'fail')
    : steps

  if (!all.length) return <div className="empty">아직 실행하지 않았습니다.</div>

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

      {/* 회차 고르기 — 이력은 다 남기고, 찾는 것은 여기서.
          1000개를 늘어놓으면 못 쓴다. 깨진 회차만 걸러 보고, 번호로 바로 간다. */}
      {roundMax > 1 && (
        <div className="sc-roundbar">
          <span className="muted small">
            회차 {roundMax}
            {badRounds.length > 0 && <b className="sc-badn"> · 부적합 {badRounds.length}</b>}
          </span>
          <button
            type="button"
            className={`sc-round${viewRound === 0 ? ' on' : ''}`}
            title="회차를 합친 결과 — 한 번이라도 깨졌으면 부적합"
            onClick={() => setViewRound(0)}
          >
            전체
          </button>
          {badRounds.length > 0 && (
            <label className="sc-only">
              <input
                type="checkbox"
                checked={badOnly}
                onChange={(e) => setBadOnly(e.target.checked)}
              />
              깨진 회차만
            </label>
          )}
          {roundMax > 30 && (
            <input
              className="sc-roundq"
              type="number"
              min={1}
              max={roundMax}
              placeholder="회차로 가기"
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                const n = Number((e.target as HTMLInputElement).value)
                if (n >= 1 && n <= roundMax) setViewRound(n)
              }}
            />
          )}
          <span className="sc-roundlist">
            {(badOnly ? badRounds : Array.from({ length: roundMax }, (_, n) => n + 1)).map((n) => (
              <button
                key={n}
                type="button"
                className={`sc-round${badRounds.includes(n) ? ' bad' : ''}${
                  viewRound === n ? ' on' : ''
                }`}
                onClick={() => setViewRound(viewRound === n ? 0 : n)}
              >
                {n}
              </button>
            ))}
          </span>
          {viewRound > 0 && (
            <span className="muted small">{viewRound}회차의 결과를 보고 있습니다</span>
          )}
        </div>
      )}

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
              {/* 종류는 `kind` 가 정한다.
                  전에는 `action` 만 보고 비어 있으면 무조건 CLI 라고 적었다.
                  그래서 Manual 스텝만 있는 시험이 사이클에서는 automation
                  으로 보였다 — 사람이 할 일을 장비가 한 것처럼. */}
              <span className={`sc-kind k-${s.kind || 'cli'}`}>
                {stepKindInfo(s.kind ?? undefined).label}
              </span>
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
                  onChange={(e) => onSetResult(i, e.target.value)}
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

            {/* Diff 는 `criteria` 가 없다 — **견줄 두 값이 곧 판정 기준**이다.
                그것을 안 보여줘서 「Diff 는 판정 기준이 없다」 로 읽혔다. */}
            {!s.criteria && s.kind === 'diff' && (s.cmpLeft || s.cmpRight) && (
              <div className="sc-sec">
                <i>EXPECTED RESULT</i>
                <div className="sc-exp">
                  <span className="sc-type">두 값 견주기</span>
                  {`${s.cmpLeft ?? ''} ${s.cmpOp || '=='} ${s.cmpRight ?? ''}`}
                </div>
              </div>
            )}

            {s.criteria && (
              <div className="sc-sec">
                <i>EXPECTED RESULT</i>
                {/* 판정 기준을 조각으로 펴 놓는다.
                    전에는 「문구 검증  E5010-24C」 한 줄이라, 조건이 여럿일
                    때 무엇 무엇을 보는지 · 그중 무엇이 걸리고 무엇이
                    안 걸렸는지가 안 보였다. */}
                <div className="sc-exp">
                  <span className="sc-type">
                    {TYPE_LABEL[String(s.type ?? 'contains')] ?? s.type}
                  </span>
                  <span className="sc-rule">{RULE_HINT[String(s.type ?? 'contains')] ?? ''}</span>
                </div>
                {toks.length > 0 ? (
                  <div className="sc-toks">
                    {toks.map((t, n) => {
                      const found = out.toLowerCase().includes(t.toLowerCase())
                      return (
                        <span key={`${t}-${n}`} className={`sc-tok${found ? ' hit' : ' miss'}`}>
                          {found ? '✔' : '✕'} {t}
                        </span>
                      )
                    })}
                  </div>
                ) : (
                  <pre className="sc-crit">{s.criteria}</pre>
                )}
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
            {viewRound === 0 && (s.rounds?.length ?? 0) > 1 && (
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
