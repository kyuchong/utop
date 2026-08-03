import { useState } from 'react'
import {
  sessionIndex,
  STEP_KINDS,
  stepKindInfo,
  stepResult,
  type StepKind,
  type TcStep,
} from './types'

interface Props {
  step: TcStep | null
  index: number
  total: number
  /** 이 TC 가 쓰는 세션들. 사람이 읽는 이름 배열 (자리 번호가 곧 인덱스) */
  sessions: string[]
  onChange: (patch: Partial<TcStep>) => void
  onMove: (dir: -1 | 1) => void
  onRemove: () => void
  onRun?: () => void
}

/** 판정 방식. 옛 자료의 critMode 값을 그대로 쓴다. */
const CRIT_MODES: Array<[string, string]> = [
  ['contains', '포함하면 PASS'],
  ['not_contains', '없으면 PASS'],
  ['regex', '정규식'],
  ['range', '숫자 범위'],
]

/**
 * 3열 — 고른 스텝의 세부.
 *
 * Action 에 따라 보이는 칸이 달라진다. 전부 항상 띄우면 comment 스텝에도
 * 판정 기준 칸이 나와서, 무엇을 채워야 하는지 매번 판단하게 된다.
 *
 * Result 는 편집칸이 아니다 — 실행하면 채워진다. 대신 여기서 글자를 끌어
 * 판정 기준이나 변수로 만든다. 지금 자료에는
 * `/\d+\s+\[E\d+\]…/m` 같은 정규식이 134스텝에 들어 있는데, 그걸 손으로
 * 짜는 대신 실제 응답에서 집게 하려는 것이다.
 */
export default function TcStepDetail({
  step,
  index,
  total,
  sessions,
  onChange,
  onMove,
  onRemove,
  onRun,
}: Props) {
  const [picked, setPicked] = useState('')

  if (!step) {
    return (
      <div className="sd">
        <div className="empty">가운데에서 스텝을 고르세요.</div>
      </div>
    )
  }

  const kind = (step.kind || 'cli') as StepKind
  const info = stepKindInfo(kind)
  const result = stepResult(step)
  const isRun = kind === 'cli' || kind === 'instrument'
  const needsSession = isRun || kind === 'connect' || kind === 'disconnect'

  /** 응답에서 글자를 고르면 판정·변수로 만들 수 있게 잡아둔다 */
  const grab = () => {
    const t = window.getSelection()?.toString() ?? ''
    if (t.trim()) setPicked(t.trim())
  }

  return (
    <div className="sd">
      <div className="sd-head">
        <b>
          스텝 {index + 1} · {info.label}
        </b>
        <span className="sp" />
        <button className="btn small" type="button" disabled={index <= 0} onClick={() => onMove(-1)} title="위로">
          ▲
        </button>
        <button
          className="btn small"
          type="button"
          disabled={index >= total - 1}
          onClick={() => onMove(1)}
          title="아래로"
        >
          ▼
        </button>
        <button className="btn small danger" type="button" onClick={onRemove}>
          삭제
        </button>
      </div>

      <div className="sd-body">
        <label className="sd-f">
          <span>Action</span>
          <select value={kind} onChange={(e) => onChange({ kind: e.target.value as StepKind })}>
            {STEP_KINDS.map((k) => (
              <option key={k.k} value={k.k}>
                {k.label}
              </option>
            ))}
          </select>
        </label>

        {needsSession && (
          <label className="sd-f">
            <span>Session</span>
            {/* 자료는 자리 번호(0,1)를 담는다. 화면에는 장비 이름을 보이되
                저장은 번호 그대로 한다 — 옛 화면과 값이 갈리면 안 된다. */}
            <select
              value={sessionIndex(step.session) >= 0 ? String(sessionIndex(step.session)) : ''}
              onChange={(e) =>
                onChange({ session: e.target.value === '' ? '' : Number(e.target.value) })
              }
            >
              <option value="">(없음)</option>
              {sessions.map((nm, i) => (
                <option key={i} value={i}>
                  {nm}
                </option>
              ))}
              {/* 이 TC 에 세션이 등록돼 있지 않은데 스텝은 번호를 갖고 있는
                  경우가 있다. 목록에 없는 값을 그냥 두면 다른 칸을 고치는
                  순간 조용히 지워지므로, 자리를 만들어 살려 둔다. */}
              {sessionIndex(step.session) >= 0 && sessionIndex(step.session) >= sessions.length && (
                <option value={sessionIndex(step.session)}>
                  세션 {sessionIndex(step.session) + 1} (등록 안 됨)
                </option>
              )}
            </select>
            {sessions.length === 0 && (
              <span className="sd-hint">
                이 TC 에 등록된 세션이 없습니다 — 세션 설정은 다음 작업에서 붙입니다.
              </span>
            )}
          </label>
        )}

        <label className="sd-f">
          <span>Test Step</span>
          <input
            value={step.step ?? ''}
            placeholder="무엇을 하는가"
            onChange={(e) => onChange({ step: e.target.value })}
          />
        </label>

        {/* 종류마다 Test Data 가 가리키는 것이 다르다 */}
        {kind === 'cli' && (
          <label className="sd-f">
            <span>Test Data — 보낼 명령</span>
            {/* 여러 줄이다. 실제 자료에 'enable / log session / conf t / epon'
                처럼 한 스텝에 명령이 여러 개 들어 있다. input 으로 두면
                고치는 순간 줄바꿈이 사라져 명령이 한 줄로 붙어버린다. */}
            <textarea
              className="mono"
              rows={Math.min(Math.max((step.cli ?? step.data ?? '').split('\n').length, 2), 10)}
              value={step.cli ?? step.data ?? ''}
              placeholder="show system information"
              onChange={(e) => onChange({ cli: e.target.value })}
            />
          </label>
        )}
        {kind === 'if' && (
          <label className="sd-f">
            <span>조건</span>
            <input
              className="mono"
              value={step.condition ?? ''}
              placeholder="$model == 'U9532H'"
              onChange={(e) => onChange({ condition: e.target.value })}
            />
          </label>
        )}
        {kind === 'switch' && (
          <label className="sd-f">
            <span>기준 값</span>
            <input
              className="mono"
              value={step.switchExpr ?? ''}
              placeholder="$model"
              onChange={(e) => onChange({ switchExpr: e.target.value })}
            />
          </label>
        )}
        {kind === 'loop' && (
          <div className="sd-f">
            <span>반복</span>
            <div className="sd-row">
              <input
                type="number"
                value={step.forFrom ?? ''}
                placeholder="1"
                onChange={(e) => onChange({ forFrom: Number(e.target.value) })}
              />
              <span className="sd-tilde">~</span>
              <input
                type="number"
                value={step.forTo ?? ''}
                placeholder="24"
                onChange={(e) => onChange({ forTo: Number(e.target.value) })}
              />
              <input
                className="mono"
                value={step.loopVar ?? ''}
                placeholder="변수 i"
                onChange={(e) => onChange({ loopVar: e.target.value })}
              />
            </div>
          </div>
        )}
        {kind === 'wait' && (
          <label className="sd-f">
            <span>기다림</span>
            <input
              type="number"
              value={step.waitSec ?? ''}
              placeholder="초"
              onChange={(e) => onChange({ waitSec: Number(e.target.value) })}
            />
          </label>
        )}
        {(kind === 'comment' || kind === 'message') && (
          <label className="sd-f">
            <span>내용</span>
            <input
              value={step.text ?? step.desc ?? ''}
              onChange={(e) => onChange({ text: e.target.value })}
            />
          </label>
        )}
        {kind === 'manual' && (
          <label className="sd-f">
            <span>Test Data</span>
            <input value={step.data ?? ''} onChange={(e) => onChange({ data: e.target.value })} />
          </label>
        )}

        {/* 판정은 실행하는 스텝에만 둔다 */}
        {isRun && (
          <div className="sd-f">
            <span>Expected</span>
            <div className="sd-row">
              <select
                className="sd-crit"
                value={step.critMode || 'contains'}
                onChange={(e) => onChange({ critMode: e.target.value })}
              >
                {CRIT_MODES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <input
                className="mono"
                value={step.criteria ?? step.expected ?? ''}
                placeholder="Model Name"
                onChange={(e) => onChange({ criteria: e.target.value })}
              />
            </div>
          </div>
        )}

        {/* 응답에서 뽑아둔 변수. 정규식이 그대로 보이면 무섭게 보이므로
            변수 이름을 앞에 세운다. */}
        {(step.queries?.length || step.extracts?.length) ? (
          <div className="sd-vars">
            <span className="sd-vars-lb">뽑은 값</span>
            {(step.queries ?? []).map((q, i) => (
              <span className="sd-var" key={`q${i}`} title={q.q ?? ''}>
                ${q.var || '?'}
              </span>
            ))}
            {(step.extracts ?? []).map((x, i) => (
              <span className="sd-var" key={`x${i}`} title={x.rule ?? ''}>
                ${x.var || '?'}
              </span>
            ))}
          </div>
        ) : null}

        {isRun && (
          <>
            <div className="sd-rlab">
              <span>Result</span>
              <span className="sp" />
              {step.executed_at && (
                <span className="muted small">{step.executed_at.slice(0, 16).replace('T', ' ')}</span>
              )}
              {onRun && (
                <button className="btn small" type="button" onClick={onRun}>
                  ▶ 이 스텝 실행
                </button>
              )}
            </div>
            {result ? (
              <>
                {/* onMouseUp 으로 잡는 이유: onSelect 는 pre 에서 안 뜬다 */}
                <pre className="sd-res" onMouseUp={grab}>
                  {result}
                </pre>
                <div className="sd-pick">
                  {picked ? (
                    <>
                      <span className="sd-var">{picked.length > 28 ? `${picked.slice(0, 28)}…` : picked}</span>
                      <button
                        className="btn small"
                        type="button"
                        onClick={() => onChange({ critMode: 'contains', criteria: picked })}
                      >
                        Expected 로
                      </button>
                      <button
                        className="btn small"
                        type="button"
                        onClick={() => {
                          const name = window.prompt('변수 이름', 'var1')
                          if (!name) return
                          // 고른 글자를 그대로 찾는 정규식으로 만든다. 사람이
                          // 정규식을 짜지 않아도 되게 하는 것이 요점이다.
                          const esc = picked.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                          onChange({ queries: [...(step.queries ?? []), { q: `(${esc})`, var: name }] })
                        }}
                      >
                        변수로
                      </button>
                    </>
                  ) : (
                    <span className="muted small">
                      응답에서 글자를 끌면 Expected 나 변수로 만들 수 있습니다
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div className="sd-res empty-res">
                아직 실행하지 않았습니다.
                {onRun && ' 「▶ 이 스텝 실행」 을 누르면 실제 응답이 여기 나옵니다.'}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
