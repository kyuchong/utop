/**
 * 반복 시험 규칙 — 고른 묶음을 몇 번, 어떻게 돌릴지.
 *
 * 부팅 10,000 회 같은 내구 시험이다. 한 바퀴가 한 회차이고, 회차마다
 * 결과가 따로 쌓인다(plan_run_item.round).
 *
 * 여기서 정하는 것 중 가장 중요한 것은 **실패했을 때 무엇을 하나**다 —
 * 「멈추고 대기」 면 깨진 그 순간 장비를 손대지 않고 사람을 기다린다.
 * 계속 돌려 버리면 증거가 다음 부팅에 지워진다(지시).
 *
 * 창은 조용하게 둔다 — 구역 셋, 실금만. 값은 사이클에 저장되어 다음에
 * 같은 조건으로 돌릴 때 다시 고르지 않아도 된다.
 */
import { useState } from 'react'
import './RepeatPop.css'

export interface RepeatCfg {
  /** 몇 바퀴 도나. 1 이면 반복이 아니다 */
  repeat: number
  /** 회차와 회차 사이 쉬는 시간(초) */
  gapSec: number
  /** 실패하면: go(계속) · hold(멈추고 대기) · stop(바로 종료) */
  onFail: 'go' | 'hold' | 'stop'
  /** 대기 한도(시간) — 「멈추고 대기」 일 때만 뜻이 있다 */
  holdHour: number
  /** 한도를 넘기면: stop | go */
  holdOver: 'stop' | 'go'
  /** 합격 기준 — 실패 몇 회까지 봐주나. 0 이면 한 번이라도 깨지면 불합격 */
  failMax: number
}

export const REPEAT_DEFAULT: RepeatCfg = {
  repeat: 100,
  gapSec: 0.5,
  onFail: 'hold',
  holdHour: 3,
  holdOver: 'stop',
  failMax: 0,
}

/** 회차 하나가 대략 몇 초 걸리나 — 지난 실행이 없으면 이 값으로 어림잡는다 */
const GUESS_SEC = 6

const hhmm = (sec: number): string => {
  if (!Number.isFinite(sec) || sec <= 0) return '—'
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  if (h >= 24) return `약 ${Math.round(h / 24)}일 ${h % 24}시간`
  return h ? `약 ${h}시간 ${m}분` : `약 ${m}분`
}

const nfmt = (n: number): string =>
  String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

export default function RepeatPop({
  count, init, onClose, onGo,
}: {
  /** 고른 항목 수 */
  count: number
  init?: RepeatCfg
  onClose: () => void
  onGo: (cfg: RepeatCfg) => void
}) {
  const [c, setC] = useState<RepeatCfg>(init ?? REPEAT_DEFAULT)
  const set = (p: Partial<RepeatCfg>) => setC((v) => ({ ...v, ...p }))

  const rounds = Math.max(1, c.repeat)
  const runs = rounds * Math.max(1, count)
  const sec = runs * GUESS_SEC + rounds * Math.max(0, c.gapSec)
  /* 장비 출력 한 회 2KB 로 어림. 접으면 같은 결과는 한 벌만 남는다.
     100 회쯤이면 200KB 라 「0MB」 가 된다 — 단위를 값에 맞춘다 */
  const rawKB = runs * 2
  const rawTxt = rawKB >= 1024 ? `${nfmt(Math.round(rawKB / 1024))}MB` : `${nfmt(rawKB)}KB`
  const num = (v: number, on: (n: number) => void, w = 78) => (
    <input
      className="rp-num"
      style={{ width: w }}
      value={String(v)}
      inputMode="decimal"
      onChange={(e) => {
        const n = Number(e.target.value.replace(/[^\d.]/g, ''))
        on(Number.isFinite(n) ? n : 0)
      }}
    />
  )
  const radio = (on: boolean, label: string, hint: string, go: () => void) => (
    <button type="button" className={`rp-opt${on ? ' on' : ''}`} onClick={go}>
      <i aria-hidden="true" />
      <b>{label}</b>
      {hint ? <em>{hint}</em> : null}
    </button>
  )

  return (
    <div className="rp-back" onMouseDown={onClose}>
      <div className="rp" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          🔁 반복 실행
          <small>고른 {count}개가 한 묶음으로 돕니다</small>
        </header>

        <div className="rp-b">
          <div className="rp-row">
            <span className="k">반복 횟수</span>
            {num(c.repeat, (n) => set({ repeat: Math.max(1, Math.min(100000, Math.round(n))) }))}
            <span className="u">회</span>
            <span className="hint">한 바퀴가 한 회차입니다</span>
          </div>
          <div className="rp-row">
            <span className="k">회차 간격</span>
            {num(c.gapSec, (n) => set({ gapSec: Math.max(0, Math.min(600, n)) }), 62)}
            <span className="u">초</span>
            <span className="hint">장비가 숨 돌릴 틈</span>
          </div>

          <div className="rp-sep" />

          <div className="rp-row top">
            <span className="k">실패하면</span>
            <div className="rp-opts">
              {radio(c.onFail === 'go', '계속 진행', '끝까지 돌리고 실패만 모읍니다',
                () => set({ onFail: 'go' }))}
              {radio(c.onFail === 'hold', '멈추고 대기', '장비를 그대로 두고 사람을 기다립니다',
                () => set({ onFail: 'hold' }))}
              {radio(c.onFail === 'stop', '바로 종료', '첫 실패에서 시험을 닫습니다',
                () => set({ onFail: 'stop' }))}
            </div>
          </div>

          {c.onFail === 'hold' && (
            <div className="rp-sub">
              <span className="k">대기 한도</span>
              {num(c.holdHour, (n) => set({ holdHour: Math.max(0.1, Math.min(168, n)) }), 56)}
              <span className="u">시간</span>
              <span className="hint">아무도 안 오면</span>
              <select
                className="rp-sel"
                value={c.holdOver}
                onChange={(e) => set({ holdOver: e.target.value === 'go' ? 'go' : 'stop' })}
              >
                <option value="stop" style={{ color: '#24343c' }}>시험 종료</option>
                <option value="go" style={{ color: '#24343c' }}>이어서 계속</option>
              </select>
            </div>
          )}

          <div className="rp-sep" />

          <div className="rp-row">
            <span className="k">합격 기준</span>
            <div className="rp-opts row">
              {radio(c.failMax === 0, '실패 0회', '', () => set({ failMax: 0 }))}
              <button
                type="button"
                className={`rp-opt${c.failMax > 0 ? ' on' : ''}`}
                onClick={() => set({ failMax: c.failMax > 0 ? c.failMax : 10 })}
              >
                <i aria-hidden="true" />
                <b>
                  실패{' '}
                  <input
                    className="rp-num tiny"
                    value={String(c.failMax || 10)}
                    onMouseDown={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      const n = Number(e.target.value.replace(/[^\d]/g, ''))
                      set({ failMax: Math.max(1, Math.min(99999, n || 1)) })
                    }}
                  />{' '}
                  회까지
                </b>
              </button>
            </div>
          </div>

          <div className="rp-est">
            {nfmt(count)}항목 × {nfmt(rounds)}회 = <b>{nfmt(runs)}회</b> 실행 ·
            예상 소요 <b>{hhmm(sec)}</b>
            <br />
            장비 출력 약 <b>{rawTxt}</b> — 같은 결과는 접어 한 벌만 남깁니다
          </div>
        </div>

        <footer>
          <button type="button" className="rp-btn" onClick={onClose}>취소</button>
          <button type="button" className="rp-btn go" onClick={() => onGo(c)}>
            걸어 두기
          </button>
        </footer>
      </div>
    </div>
  )
}
