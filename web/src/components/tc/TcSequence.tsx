import StepIcon from './StepIcon'
import {
  sessionIndex,
  STEP_KINDS,
  stepKindInfo,
  stepStatus,
  stepSummary,
  type StepKind,
  type TcStep,
} from './types'

interface Props {
  steps: TcStep[]
  /** 고른 스텝의 원본 인덱스. -1 이면 안 고름 */
  selected: number
  onSelect: (i: number) => void
  onAdd: (kind: StepKind) => void
  /** 세션 번호 → 사람이 읽는 이름 (장비명). 없으면 번호만 */
  sessionName: (i: number) => string
  /** 지금 돌고 있는 줄. -1 이면 안 돌고 있다 */
  runningAt?: number
  /** 이 스텝만 실행 */
  onRun?: (i: number) => void
}

/**
 * 2열 — 스텝 요약.
 *
 * 한 줄에 상태·번호·Action·요약만 둔다. Test Step/Data/Expected/Result 는
 * 3열로 내렸다 — 일곱 칸을 한 줄에 욱여넣으면 어느 것도 안 읽힌다.
 *
 * Action 칸이 명령 팔레트를 겸한다. 따로 팔레트를 두면 같은 목록이 두 군데가
 * 되고, 화면 폭도 그만큼 잃는다.
 *
 * 블록(if·loop·switch)은 indent 로 들여쓴다. 652스텝이 이 값을 갖고 있어서,
 * 이게 없으면 어디까지가 반복 안인지 읽을 수 없다.
 */
export default function TcSequence({
  steps,
  selected,
  onSelect,
  onAdd,
  sessionName,
  runningAt = -1,
  onRun,
}: Props) {
  /** 한 줄 요약. 접속 계열은 세션 이름이 곧 내용이라 여기서 붙인다. */
  const summary = (s: TcStep) => {
    const k = s.kind || 'cli'
    if (k === 'connect' || k === 'disconnect') {
      const n = sessionName(sessionIndex(s.session))
      return n ? `${n} ${k === 'connect' ? '접속' : '해제'}` : k === 'connect' ? '접속' : '해제'
    }
    return stepSummary(s)
  }

  const stat = (s: TcStep) => {
    const v = stepStatus(s)
    if (v === 'PASS') return { cls: 'pass', mark: '✔', label: 'PASS' }
    if (v === 'FAIL') return { cls: 'fail', mark: '✖', label: 'FAIL' }
    return { cls: 'idle', mark: '○', label: '미실행' }
  }

  return (
    <div className="sq">
      <div className="sq-scroll">
        <div className="sq-list">
        {steps.length === 0 ? (
          <div className="empty">
            아직 스텝이 없습니다.
            <br />
            <span className="muted small">아래에서 종류를 골라 추가하세요.</span>
          </div>
        ) : (
          steps.map((s, i) => {
            const info = stepKindInfo(s.kind)
            const st = stat(s)
            const depth = Math.min(Math.max(Number(s.indent) || 0, 0), 4)
            return (
              <div
                key={i}
                role="button"
                tabIndex={0}
                className={`sq-row${i === selected ? ' on' : ''}${s.skip ? ' skip' : ''}${
                  i === runningAt ? ' now' : ''
                }`}
                data-depth={depth || undefined}
                onClick={() => onSelect(i)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelect(i)
                  }
                }}
              >
                <span
                  className={`sq-st ${i === runningAt ? 'now' : st.cls}`}
                  title={i === runningAt ? '실행 중' : st.label}
                >
                  {i === runningAt ? '▸' : st.mark}
                </span>
                <span className="sq-n">{i + 1}</span>
                <span className="sq-act" style={{ marginLeft: depth * 16 }}>
                  <StepIcon name={info.icon} className={`sq-ic g-${info.group}`} />
                  {info.label}
                </span>
                {/* 명령·값만 고정폭. 'U9532H 접속' 같은 한글까지 고정폭으로
                    두면 다른 화면과 글자가 달라 보인다. */}
                <span
                  className={`sq-sum${s.kind === 'cli' || s.kind === 'instrument' ? ' mono' : ''}`}
                  title={summary(s)}
                >
                  {summary(s) || <span className="muted">—</span>}
                </span>
                {/* 결과를 줄 끝에 적는다. 아이콘만으로는 PASS 와 미실행이
                    잘 안 갈린다. */}
                {/* 미실행은 글자를 안 적는다. 대부분의 줄이 미실행이라
                    같은 말이 반복되어 PASS·FAIL 이 묻힌다. ○ 로 충분하다. */}
                <span className={`sq-res ${st.cls}`}>
                  {st.cls === 'idle' ? '' : st.label}
                </span>
                <span className="sq-tail">
                  {onRun && (
                    <button
                      type="button"
                      className="sq-run"
                      title="이 스텝만 실행"
                      onClick={(e) => {
                        e.stopPropagation()
                        onRun(i)
                      }}
                    >
                      ▶
                    </button>
                  )}
                </span>
              </div>
            )
          })
        )}

      {/* 스텝 추가. 마지막 줄 바로 아래에 둔다 — 바닥에 고정하면 스텝이
          적을 때 화면 끝까지 내려가 손이 멀다.
          종류를 여기서 고르므로 왼쪽에 팔레트를 따로 두지 않는다. */}
      <details className="sq-add">
        <summary>＋ 스텝</summary>
        <div className="sq-add-list">
          {STEP_KINDS.map((k) => (
            <button
              key={k.k}
              type="button"
              className="sq-add-btn"
              onClick={(e) => {
                onAdd(k.k)
                // 고르고 나면 닫는다. 열어둔 채로 두면 목록을 가린다.
                const d = (e.currentTarget.closest('details') as HTMLDetailsElement) || null
                if (d) d.open = false
              }}
            >
              <StepIcon name={k.icon} className={`sq-ic g-${k.group}`} />
              {k.label}
            </button>
          ))}
        </div>
      </details>
        </div>
      </div>
    </div>
  )
}
