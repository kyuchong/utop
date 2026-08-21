import { useEffect, useRef } from 'react'
import './RunLog.css'

/** 실행하면서 한 줄씩 쌓이는 것 */
export interface LogLine {
  n: number
  /** 몇 번째 스텝에서 나온 말인가 (-1 이면 스텝과 상관없는 말) */
  i: number
  kind?: string
  /** 줄 앞에 세우는 말 — 「비교 결과」 · 「데이터 치환 결과」 */
  label?: string
  text: string
  /** 반복 안이면 몇 회차인가 */
  round?: number
  at: string
}

/**
 * 실행 로그 — **줄 단위로 색이 있는 판**(지시: iTest 처럼).
 *
 * 여태 실행하면서 나온 말은 아무 데도 안 쌓였다(`onLog: () => {}`). 결과는
 * 스텝 줄의 배지로만 남으니, 24회를 도는 동안 화면은 조용하고 「지금 뭘
 * 하고 있나」 를 알 수 없었다. 반복이 도는 시험일수록 그 판이 필요하다.
 *
 *   초록 = 적합 · 붉음 = 부적합 · 회색 = 건너뜀 · 노랑 = 경고
 *   그 밖(명령·메시지)은 그냥 글자다 — 색이 많으면 색이 안 보인다.
 */
export default function RunLog({
  lines,
  onClear,
  onPick,
  only,
  onOnly,
}: {
  lines: LogLine[]
  onClear: () => void
  /** 줄을 누르면 그 스텝으로 간다 */
  onPick?: (i: number) => void
  /** 부적합만 보기 */
  only: boolean
  onOnly: (v: boolean) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  /* 사람이 위로 올려 읽는 중이면 따라가지 않는다 — 읽던 자리를 뺏기면
     로그는 있으나 마나다 */
  useEffect(() => {
    const el = box.current
    if (!el || !stick.current) return
    el.scrollTop = el.scrollHeight
  }, [lines])

  const shown = only ? lines.filter((l) => l.kind === 'fail' || l.kind === 'warn') : lines
  const nFail = lines.filter((l) => l.kind === 'fail').length

  return (
    <div className="rl">
      <div className="rl-head">
        <b>실행 로그</b>
        <span className="muted small">{lines.length}줄</span>
        {nFail > 0 && <span className="rl-bad">부적합 {nFail}</span>}
        <span className="sp" />
        <label className="rl-only">
          <input type="checkbox" checked={only} onChange={(e) => onOnly(e.target.checked)} />
          부적합만
        </label>
        <button className="btn small" type="button" onClick={onClear} disabled={!lines.length}>
          지우기
        </button>
      </div>
      <div
        className="rl-box"
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
        }}
      >
        {shown.length === 0 ? (
          <div className="rl-empty">
            {lines.length ? '부적합이 없습니다.' : '아직 돌리지 않았습니다.'}
          </div>
        ) : (
          shown.map((l) => (
            <div
              key={l.n}
              className={`rl-line ${l.kind ?? ''}`}
              onClick={() => l.i >= 0 && onPick?.(l.i)}
              title={l.i >= 0 ? `스텝 ${l.i + 1} 로 가기` : undefined}
            >
              <i className="rl-at">{l.at}</i>
              {l.round ? <b className="rl-rd">{l.round}회</b> : null}
              {l.i >= 0 && <b className="rl-no">{l.i + 1}</b>}
              {/* 색은 **판정 딱지**에만 준다(지시). 줄 전체를 물들이면 무엇이
                  결과이고 무엇이 설명인지 구분이 안 된다 */}
              {/* 무슨 말인지 먼저, 그다음 판정, 그다음 값(지시) */}
              {l.label && <b className="rl-lb">{l.label}</b>}
              {l.kind === 'pass' && <b className="rl-v ok">적합</b>}
              {l.kind === 'fail' && <b className="rl-v bad">부적합</b>}
              {l.kind === 'warn' && <b className="rl-v warn">주의</b>}
              <span className="rl-tx">{l.text}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
