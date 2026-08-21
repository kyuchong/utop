import { useRef, useState } from 'react'
import { useResults } from '@/pages/Cycles'
import type { CycleItemLite, CycleStep, Verdict } from '@/pages/Cycles'
import { RESULTS, verdictClass } from '@/pages/Cycles'
import { isJudgeStep, METER_ACT_LABEL, stepKindInfo, stepVerdict, type TcStep } from '@/components/tc/types'
import { subVars } from '@/components/tc/judge'
import { useGlobalParams } from '@/components/tc/useGlobalParams'
import MeterStats, { parseMeterOutput } from '@/components/tc/MeterStats'

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
  /** 수동/자동 — TC 실행 타입이 정본. 수동이면 가로 표, 자동이면 세로 카드 */
  mode?: 'manual' | 'auto'
  /** 지금 도는 스텝. 안 돌면 -1 */
  runningAt: number
  /** 스텝 하나의 결과를 손으로 정한다 (스텝 번호, 값) */
  onSetResult?: (at: number, result: string) => void
  /** 수동 스텝 ACTUAL DATA — 사진 올리기(파일) · URL 지정 · 글 */
  onSetImg?: (at: number, file: File) => void
  onSetImgUrl?: (at: number, url: string) => void
  onSetTxt?: (at: number, txt: string) => void
  /** 수동 「판정 기준 및 RCA」 — 왜 그렇게 판정했나 */
  onSetRca?: (at: number, txt: string) => void
}

/**
 * 항목 하나의 스텝 — 실행 당시(as-run) 그대로.
 *
 * 옛 화면의 「Test Procedure Details」 를 옮겼다. 스텝마다 네 칸이다 —
 * **무엇을 하려 했나 · 무엇을 보냈나 · 무엇이 나와야 하나 · 무엇이
 * 나왔나.** 이 넷이 나란히 있어야 왜 그렇게 판정됐는지가 읽힌다.
 */
export default function StepCards({ item, mode, runningAt, onSetResult, onSetImg, onSetImgUrl, onSetTxt, onSetRca }: Props) {
  /* 스텝 띠 색은 **설정(실행 판정 기준)** 이 정본이다(지시) — 거기서 고른
     바탕색·글자색을 그대로 쓴다. 코드가 초록·빨강을 따로 정하면 설정을
     바꿔도 띠만 옛 색으로 남는다. */
  const resDefs = useResults()
  const all = (item.steps ?? []) as CycleStep[]
  const [only, setOnly] = useState(false)
  // 판정기준의 ${이름} 을 값으로 풀어서 보여준다 — 원문 그대로 두면
  // 「${Model_Name}」 에 빨간 ✕ 가 붙는다(실행은 합격인데, 지적).
  // 실행 중 생긴 변수(앞 스텝 캡처)까지는 모른다 — 그건 글자로 남는다.
  const gp = useGlobalParams()
  /** 진행 띠에서 눌러 내려갈 카드들 */
  const cardRefs = useRef<Array<HTMLDivElement | null>>([])
  /** ⋯ 로 펼친 스텝 — 나머지 상태(진행중·진행불가·미실행)가 여기 든다 */
  const [moreAt, setMoreAt] = useState(-1)
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

  /**
   * 지금 도는 스텝을 가운데로 따라간다.
   *
   * 18줄짜리 절차를 돌리면 도는 줄이 금세 화면 밖으로 나간다. 그때마다
   * 손으로 굴려 찾아야 했고, 찾고 나면 이미 다음 줄로 넘어가 있었다.
   *
   * 사람이 손으로 굴리면 따라가기를 멈춘다 — 앞 스텝의 응답을 들여다보는
   * 중에 화면이 저 혼자 움직이면 읽던 자리를 잃는다. 도는 줄이 바뀌고
   * 사람이 3초 넘게 손을 안 대면 다시 따라간다.
   */
  const liveRef = useRef<HTMLDivElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const touched = useRef(0)
  /*
   * **따라가기를 걷었다**(지시).
   *
   * 도는 스텝이 바뀔 때마다 카드로 굴러가니 화면이 위아래로 왔다 갔다 해서
   * 읽던 자리를 잃었다. 어디까지 갔나는 위의 **스텝 띠 색**이 말한다 —
   * 색만 보면 되니 화면은 가만히 있는 편이 낫다.
   */

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

  if (!all.length) return <div className="empty">스텝 내용 없음</div>

  /* 스텝 번호 — 판정(PASS/FAIL)이 나오는 것만 스텝으로 센다(합의).
     주석·메시지·대기·치환·흐름 줄은 번호가 없다. 배지·띠·Step# 가
     전부 이 번호 하나를 쓴다. */
  const noOf: number[] = (() => {
    let n = 0
    return all.map((s2) => (isJudgeStep(s2 as TcStep) ? ++n : -1))
  })()

  /* 스텝 진행 띠 — 카드 스무 장을 굴리기 전에 전체 판이 한눈에 보여야
     한다(지적: 세부가 부실). 누르면 그 스텝 카드로 내려간다. */
  const judged = all.map((s2, at) => ({ s: s2, at })).filter((x) => noOf[x.at]! > 0)
  const strip =
    judged.length >= 1 ? (
      <div className="sc-strip">
        {/* 회차 띠와 똑같이 생겨 「루프 돌린 적 없는데」 가 나왔다 — 라벨로 가른다 */}
        <span className="sc-strip-lab">스텝</span>
        {judged.map(({ s: st2, at }) => {
          const v = stepVerdict(st2 as TcStep)
          const def = resDefs.find((r) => r.v === v)
          const ran = !!st2.executed_at || !!st2.output
          const now = at === runningAt
          /* 진행 중이면 파랑, 아니면 설정이 정한 그 판정의 색.
             설정에 없는 값이면 「그 밖의 판정」, 판정이 없으면 실행함/미실행 */
          const cls = now ? 'now' : def ? 'def' : v ? 'part' : ran ? 'ran' : ''
          const sty =
            !now && def?.color
              ? { background: def.color, borderColor: def.color, color: def.fg || '#fff' }
              : undefined
          return (
            <button
              key={at}
              type="button"
              style={sty}
              className={`sc-seg ${cls}`}
              title={`Step ${noOf[at]} · ${
                at === runningAt ? '진행 중' : v || (ran ? '실행함(판정 없음)' : '미실행')
              }`}
              onClick={() =>
                cardRefs.current[at]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              }
            >
              {noOf[at]}
            </button>
          )
        })}
      </div>
    ) : null

  /* 판정 레일 한 벌 — 수동·자동 카드가 같은 것을 쓴다(통일 지시).
     위에 시각·결과 칩, 아래로 ✓ ✕ ⊘ ⋯(나머지 상태). 다시 누르면 미실행 */
  const railFor = (i2: number, s2: CycleStep, r2: string, running2 = false, ran2 = false) => (
    <div className="sc-rail">
      {/* 시각은 칩 위에 따로 한 줄 — ms 는 뺐다(지시) */}
      <div className="sc-rail-top">
        {s2.executed_at ? (
          <span className="sc-rail-when">
            {String(s2.executed_at).slice(0, 16).replace('T', ' ')}
          </span>
        ) : null}
        {running2 ? (
          <span className="sc-running">도는 중</span>
        ) : (
          <span className={`sc-v ${verdictClass((r2 || '') as Verdict)}`}>
            {/* 판정 없는 스텝(대기·접속)도 돌기는 돈다 — 미실행과 갈라 적는다 */}
            {r2 || (ran2 ? '실행함' : '미실행')}
          </span>
        )}
      </div>
      {onSetResult && !running2 && (
        <>
          {[
            ['Pass', '✓', 'pass'],
            ['Fail', '✕', 'fail'],
            ['Blocked', '⊘', 'blocked'],
          ].map(([v, mk, cls]) => (
            <button
              key={v}
              type="button"
              className={`sc-qk ${cls}${r2 === v ? ' on' : ''}`}
              title={r2 === v ? `${v} 해제 (미실행으로)` : (v as string)}
              onClick={() => onSetResult(i2, r2 === v ? '' : (v as string))}
            >
              {mk}
            </button>
          ))}
          <div className="sc-more">
            <button
              type="button"
              className="sc-qk"
              title="다른 상태 (진행중 · 진행불가 · 미실행)"
              onClick={() => setMoreAt(moreAt === i2 ? -1 : i2)}
            >
              ⋯
            </button>
            {moreAt === i2 && (
              <>
                <div className="sc-more-back" onClick={() => setMoreAt(-1)} />
                <div className="sc-more-pop" role="menu">
                  {RESULTS.filter((x) => !['Pass', 'Fail', 'Blocked'].includes(x.v)).map((x) => (
                    <button
                      key={x.v || 'none'}
                      type="button"
                      className={r2 === x.v ? 'on' : ''}
                      onClick={() => {
                        onSetResult(i2, x.v)
                        setMoreAt(-1)
                      }}
                    >
                      {x.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )

  /* 수동 항목 — 세로 카드(피드백 ⑨: 가로는 무리). 스텝마다
     Test Step · Test Data · Expected Result · Actual Result · 판정 기준 및 RCA.
     ACTUAL 은 선택 입력이다(수동 시험이라 모두 적기는 힘들다 — 합의) */
  if (mode === 'manual')
    return (
      <div className="sc">
        {strip}
        {all.map((st2, i) => {
          const r = stepVerdict(st2 as TcStep)
          const bad2 = r === 'Fail' || r === '불합격'
          return (
            <div
              key={i}
              ref={(el) => {
                cardRefs.current[i] = el
              }}
              className={`sc-card${bad2 ? ' bad' : ''}${r === 'Pass' ? ' ok' : ''} has-rail`}
            >
              <div className="sc-main">
              <div className="sc-head">
                {noOf[i]! > 0 && <b>Step#{noOf[i]}</b>}
                <span className="sc-kind k-manual">Manual</span>
                <span className="sp" />
              </div>
              <div className="sc-sec">
                <i>Test Step</i>
                <div className="sc-txt">{st2.step || st2.desc || '–'}</div>
              </div>
              <div className="sc-sec">
                <i>Test Data</i>
                <div className="sc-txt">{st2.data || st2.cli || '–'}</div>
                {st2.data_img && <img className="sc-img" src={st2.data_img} alt="" />}
              </div>
              <div className="sc-sec">
                <i>Expected Result</i>
                <div className="sc-txt">{st2.expected || st2.criteria || '–'}</div>
                {st2.expected_img && <img className="sc-img" src={st2.expected_img} alt="" />}
              </div>
              <div className="sc-sec">
                <i>
                  Actual Result <span className="ms-opt">(선택)</span>
                </i>
                {onSetTxt ? (
                  <div className="sc-actual">
                    <textarea
                      className="sc-actual-txt"
                      rows={2}
                      value={st2.actual_txt ?? ''}
                      placeholder="본 것을 적거나, 화면을 Ctrl+V 로 붙여넣기"
                      onChange={(e) => onSetTxt(i, e.target.value)}
                      onPaste={(e) => {
                        const f = [...(e.clipboardData?.items ?? [])]
                          .find((x) => x.type.startsWith('image/'))
                          ?.getAsFile()
                        if (f && onSetImg) {
                          e.preventDefault()
                          void onSetImg(i, f)
                        }
                      }}
                    />
                    {st2.actual_img && <img className="sc-img" src={st2.actual_img} alt="" />}
                    {st2.actual_img && onSetImgUrl && (
                      <button type="button" className="sc-img-x" onClick={() => onSetImgUrl(i, '')}>
                        사진 지우기
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="sc-txt">{st2.actual_txt || '–'}</div>
                )}
              </div>
              <div className="sc-sec">
                <i>판정 기준 및 RCA</i>
                {onSetRca ? (
                  <textarea
                    className="sc-actual-txt"
                    rows={2}
                    value={st2.rca ?? ''}
                    placeholder="무엇을 근거로 판정했나 · Fail 이면 원인(RCA)"
                    onChange={(e) => onSetRca(i, e.target.value)}
                  />
                ) : (
                  <div className="sc-txt">{st2.rca || '–'}</div>
                )}
              </div>
              </div>
              {railFor(i, st2 as CycleStep, r)}
            </div>
          )
        })}
      </div>
    )

  return (
    <div
      className="sc"
      ref={wrapRef}
      // 손으로 굴리는 중에는 따라가지 않는다
      onWheel={() => (touched.current = Date.now())}
      onTouchMove={() => (touched.current = Date.now())}
    >
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

      {strip}

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
        /** 계측기 응답이면 표로 읽는다. 아니면 null 이고 원문 그대로 나간다 */
        const meterOut = s.kind === 'instrument' ? parseMeterOutput(out) : null
        const critVal = subVars(String(s.criteria ?? ''), gp.values)
        const toks = tokens({ ...s, criteria: critVal })
        // 주석·메시지는 절차의 제목·설명이다 — 명령 카드 모양(ACTUAL DATA ·
        // 결과 셀렉트)으로 두면 「받은 출력이 없습니다」 같은 헛말이 붙는다.
        if (s.kind === 'comment' || s.kind === 'message')
          return (
            <div
              key={i}
              ref={(el) => {
                cardRefs.current[i] = el
              }}
              className={`sc-memo ${s.kind}`}
            >
              {/* 번호 없음 — 판정이 나오는 것만 스텝으로 센다(합의 확정).
                  이 줄은 절차의 제목·설명이다 */}
              <span className={`sc-kind k-${s.kind}`}>{stepKindInfo(s.kind).label}</span>
              <span className="sc-memo-txt">
                {String(s.text ?? s.desc ?? s.step ?? '').trim() || '–'}
              </span>
            </div>
          )
        return (
          <div
            className={`sc-card${bad ? ' bad' : ''}${r === 'Pass' || r === '합격' ? ' ok' : ''}${running ? ' running' : ''} has-rail`}
            key={i}
            ref={(el) => {
              cardRefs.current[i] = el
              if (running) (liveRef as { current: HTMLDivElement | null }).current = el
            }}
          >
            <div className="sc-main">
            <div className="sc-head">
              {noOf[i]! > 0 && <b>Step#{noOf[i]}</b>}
              {/* 종류는 `kind` 가 정한다.
                  전에는 `action` 만 보고 비어 있으면 무조건 CLI 라고 적었다.
                  그래서 Manual 스텝만 있는 시험이 사이클에서는 automation
                  으로 보였다 — 사람이 할 일을 장비가 한 것처럼. */}
              <span className={`sc-kind k-${s.kind || 'cli'}`}>
                {stepKindInfo(s.kind ?? undefined).label}
              </span>
              {/* 시각·판정은 오른쪽 레일이 맡는다(수동 카드와 통일) */}
              <span className="sp" />
            </div>

            {(s.desc || s.step) && (
              <div className="sc-sec">
                {/* Manual 은 「무엇을 하나」 가 곧 절차다. 다른 라벨이 다
                    영문이라 통일한다. */}
                <i>Test Step</i>
                <div className="sc-txt">{s.desc || s.step}</div>
              </div>
            )}

            {/* Manual 스텝은 `data`·`expected` 와 사진에 내용을 넣는다.
                카드가 desc·cli·criteria 만 읽어서 통째로 비어 보였다. */}
            {s.kind === 'manual' && (s.data || s.data_img) && (
              <div className="sc-sec">
                <i>TEST DATA</i>
                {s.data && <div className="sc-txt">{s.data}</div>}
                {s.data_img && <img className="sc-img" src={s.data_img} alt="" />}
              </div>
            )}
            {s.kind === 'manual' && (s.expected || s.expected_img) && (
              <div className="sc-sec">
                <i>EXPECTED RESULT</i>
                {s.expected && <div className="sc-txt">{s.expected}</div>}
                {s.expected_img && <img className="sc-img" src={s.expected_img} alt="" />}
              </div>
            )}

            {s.cli && (
              <div className="sc-sec">
                <i>TEST DATA</i>
                <pre className="sc-cmd">{s.cli}</pre>
              </div>
            )}

            {/*
              계측기 스텝.

              CLI 는 「무엇을 보냈나(cli)」 와 「무엇이 나와야 하나(criteria)」
              가 칸에 있는데, 계측기는 그 둘이 없다. 그래서 이 카드에
              ACTUAL DATA 하나만 뜨고, 무엇을 시킨 것인지조차 안 보였다 —
              같은 시험을 TC 화면에서 보면 다 나오는데.
            */}
            {s.kind === 'instrument' && (
              <div className="sc-sec">
                <i>TEST DATA</i>
                <div className="sc-txt">
                  {METER_ACT_LABEL[String(s.meterAct ?? 'traffic_start')] ?? String(s.meterAct)}
                  {s.meterAct === 'traffic_start' && s.meterDur ? ` · ${s.meterDur}초` : ''}
                  {s.host ? ` · ${s.host}` : ''}
                </div>
              </div>
            )}
            {s.kind === 'instrument' && s.meterAct === 'traffic_stat' && (
              <div className="sc-sec">
                <i>EXPECTED RESULT</i>
                <div className="sc-exp">
                  <span className="sc-type">손실 판정</span>
                  Rx Packet Loss ≤ {s.meterMaxLoss ?? 0}
                </div>
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
                  <pre className="sc-crit">{critVal}</pre>
                )}
              </div>
            )}
            {/* 판정기준 — 무엇을 어떻게 보고 판정하는가 (스펙 합의로 칸을 분리).
                규칙 이름만 있으면 부실하다(지적) — 실제로 무엇을 찾아서 왜
                그렇게 판정났는지(reason)를 색으로 함께 적는다. */}
            {s.criteria && (
              <div className="sc-sec">
                <i>판정기준</i>
                <div className="sc-exp">
                  <span className="sc-type">
                    {TYPE_LABEL[String(s.type ?? 'contains')] ?? s.type}
                  </span>
                  <span className="sc-rule">{RULE_HINT[String(s.type ?? 'contains')] ?? ''}</span>
                </div>
              </div>
            )}

            <div className="sc-sec">
              <i>ACTUAL DATA</i>
              {/* 계측기 응답은 표로. TC 화면과 같은 부품을 쓴다 —
                  두 화면이 같은 측정을 다르게 보이면 어느 쪽을 믿을지
                  매번 생각하게 된다. */}
              {meterOut ? (
                <>
                  <MeterStats rows={meterOut.rows} keys={meterOut.keys} />
                  <details className="sc-raw">
                    <summary>계측기가 답한 그대로</summary>
                    <pre className="sc-out">{out}</pre>
                  </details>
                </>
              ) : out.trim() ? (
                // 판정에 걸린 문구를 물들인다. 자료는 우리 서버에서 온
                // 것이고 넣기 전에 이스케이프한다.
                <pre
                  className={`sc-out${running ? ' live' : ''}`}
                  dangerouslySetInnerHTML={{ __html: mark(out, toks, !bad) }}
                />
              ) : s.kind !== 'manual' ? (
                <div className="muted small">
                  {running ? '응답을 기다리는 중…' : '받은 출력이 없습니다.'}
                </div>
              ) : null}
              {/* 수동 시험은 자동 출력이 없다. 시험자가 결과 화면을 캡쳐해
                  붙인다 — 「해봤더니 이랬다」 의 증거다. */}
              {s.kind === 'manual' && onSetImg && (
                <div className="sc-actual">
                  {s.actual_txt !== undefined || onSetImg ? (
                    <textarea
                      className="sc-actual-txt"
                      rows={2}
                      value={s.actual_txt ?? ''}
                      placeholder="본 것을 적거나, 화면을 Ctrl+V 로 붙여넣기"
                      onChange={(e) => onSetTxt?.(i, e.target.value)}
                      onPaste={(e) => {
                        const f = [...(e.clipboardData?.items ?? [])]
                          .find((x) => x.type.startsWith('image/'))?.getAsFile()
                        if (f) {
                          e.preventDefault()
                          void onSetImg(i, f)
                        }
                      }}
                    />
                  ) : null}
                  {s.actual_img && <img className="sc-img" src={s.actual_img} alt="" />}
                  {s.actual_img && (
                    <button
                      type="button"
                      className="sc-img-x"
                      onClick={() => onSetImgUrl?.(i, '')}
                    >
                      사진 지우기
                    </button>
                  )}
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
            {railFor(i, s, r, running, ran)}
          </div>
        )
      })}

      {shown.length === 0 && <div className="empty">깨진 스텝이 없습니다.</div>}
    </div>
  )
}
