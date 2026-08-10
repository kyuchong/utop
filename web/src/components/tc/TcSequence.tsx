import { useMemo, useState } from 'react'
import StepIcon from './StepIcon'
import { IconChevron } from '../icons'
import { blockEnd } from './runner'
import {
  ADD_KINDS,
  isBlockKind,
  isNoteKind,
  sessionIndex,
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
  /** 여러 줄 고르기 — 한 번에 지우거나 건너뛰기 위한 것 */
  picked: Set<number>
  /** shift 를 누른 채 누르면 앞서 고른 줄부터 여기까지 한꺼번에 */
  onPick: (i: number, range: boolean) => void
  /**
   * 이 목록에서 감출 줄.
   *
   * 걸러낸 배열을 넘기지 않는 이유: 줄 번호와 고르기·실행이 전부 원본
   * 자리 번호로 돌아간다. 걸러서 넘기면 3번째 줄을 눌렀는데 5번째 스텝이
   * 고쳐진다 — 옛 화면이 그렇게 틀렸다.
   */
  hide?: (s: TcStep) => boolean
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
  picked,
  onPick,
  hide,
  onRun,
}: Props) {
  const hidden = hide ? steps.filter(hide).length : 0

  /**
   * 접어 둔 블록의 여는 줄 번호.
   *
   * 반복 하나에 스무 줄이 들어가면 그 아래 절차가 화면 밖으로 밀린다.
   * 1열 폴더처럼 접어 두고 필요할 때만 편다.
   *
   * 자리 번호로 기억한다 — 스텝에는 고유한 id 가 없다. 줄을 넣거나 지우면
   * 번호가 밀리므로, 지금 그 자리가 정말 블록인지 그릴 때 다시 본다.
   */
  const [shut, setShut] = useState<Set<number>>(new Set())
  const toggleShut = (i: number) =>
    setShut((c) => {
      const n = new Set(c)
      if (!n.delete(i)) n.add(i)
      return n
    })

  /** 접힌 블록의 몸통 — 그리지 않는다 */
  const folded = useMemo(() => {
    const out = new Set<number>()
    shut.forEach((i) => {
      const s = steps[i]
      if (!s || !isBlockKind(s.kind)) return
      for (let j = i + 1; j < blockEnd(steps, i); j++) out.add(j)
    })
    return out
  }, [shut, steps])

  /**
   * 줄 번호 — 블록 안은 1.1, 1.2 로.
   *
   * 그냥 1,2,3 으로 매기면 블록에 넣고 뺀 것이 번호에 안 나타난다. 주석
   * 아래로 들여쓴 CLI 가 2번이 되어 버려서, 그 줄이 앞 줄의 몸통이라는
   * 것을 번호만 봐서는 알 수 없다.
   *
   * 감춘 줄(수동 스텝)은 번호를 먹지 않는다. 여기 안 나오는 줄이 번호를
   * 가져가면 3,5,6 처럼 끊겨서 잘못된 것처럼 보인다.
   */
  const numbers: string[] = []
  {
    const stack: number[] = []
    steps.forEach((s, i) => {
      if (hide?.(s)) {
        numbers[i] = ''
        return
      }
      // 한 번에 두 칸 이상 깊어질 수는 없다. 자료가 그래도 1.0.1 같은
      // 번호가 나오지 않게 막는다.
      const want = Math.min(Math.max(Number(s.indent) || 0, 0), 4)
      const d = Math.min(want, stack.length)
      stack.length = d + 1
      stack[d] = (stack[d] ?? 0) + 1
      numbers[i] = stack.slice(0, d + 1).join('.')
    })
  }
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
        {steps.length - hidden === 0 ? (
          <div className="empty">
            아직 자동 스텝이 없습니다.
            <br />
            <span className="muted small">
              {hidden > 0
                ? `수동 스텝 ${hidden}개는 「Manual」 탭에 있습니다.`
                : '아래에서 종류를 골라 추가하세요.'}
            </span>
          </div>
        ) : (
          steps.map((s, i) => {
            if (hide?.(s)) return null
            if (folded.has(i)) return null
            const info = stepKindInfo(s.kind)
            const isBlock = isBlockKind(s.kind)
            const body = isBlock ? blockEnd(steps, i) - i - 1 : 0
            const isShut = shut.has(i)
            const st = stat(s)
            const depth = Math.min(Math.max(Number(s.indent) || 0, 0), 4)
            return (
              <div
                key={i}
                role="button"
                tabIndex={0}
                // 주석·메시지는 장비로 아무것도 안 나간다. 줄 색을 달리해
                // 훑을 때 '이건 설명' 이 한눈에 갈리게 한다.
                className={`sq-row${i === selected ? ' on' : ''}${s.skip ? ' skip' : ''}${
                  i === runningAt ? ' now' : ''
                }${isNoteKind(s.kind) ? ` note ${s.kind}` : ''}`}
                data-depth={depth || undefined}
                onClick={() => onSelect(i)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelect(i)
                  }
                }}
              >
                {/* 여러 줄 고르기. 평소엔 흐리게 두고 고를 때만 눈에 들어온다 —
                    30줄에 체크박스가 진하게 서 있으면 그것부터 보인다. */}
                <input
                  type="checkbox"
                  className="sq-pick"
                  aria-label={`${i + 1}번 줄 고르기`}
                  checked={picked.has(i)}
                  onClick={(e) => {
                    e.stopPropagation()
                    onPick(i, e.shiftKey)
                  }}
                  onChange={() => {
                    /* onClick 에서 처리한다 — shift 를 알아야 해서 */
                  }}
                />
                <span
                  className={`sq-st ${i === runningAt ? 'now' : st.cls}`}
                  title={i === runningAt ? '실행 중' : st.label}
                >
                  {i === runningAt ? '▸' : st.mark}
                </span>
                <span className="sq-n">{numbers[i]}</span>
                <span className="sq-act" style={{ marginLeft: depth * 16 }}>
                  {/* 블록만 접힌다. 아닌 줄에도 같은 폭을 비워 두어야
                      Action 글자가 들쭉날쭉하지 않다. */}
                  {isBlock && body > 0 ? (
                    <button
                      type="button"
                      className={`rt-caret sq-caret${isShut ? '' : ' open'}`}
                      title={isShut ? `펴기 (${body}줄)` : '접기'}
                      aria-label={isShut ? '펴기' : '접기'}
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleShut(i)
                      }}
                    >
                      <IconChevron />
                    </button>
                  ) : (
                    <span className="sq-caret" />
                  )}
                  <StepIcon name={info.icon} className={`sq-ic g-${info.group}`} />
                  {info.label}
                </span>
                {/* 어느 세션으로 나가는가. 같은 장비를 두 자리에 앉히는 일이
                    흔해서 장비 이름만으로는 안 갈린다 — iTest 도 Session 을
                    별도 열로 둔다. */}
                {(() => {
                  // 계측기는 세션으로 안 나간다 — 섀시 주소로 곧장 간다.
                  // S1 이 붙어 있으면 그 장비로 나가는 줄로 읽힌다.
                  const k = s.kind === 'instrument' ? -1 : sessionIndex(s.session)
                  return (
                    <span className="sq-s">
                      {k >= 0 && (
                        <b data-s={k % 4} title={sessionName(k)}>
                          S{k + 1}
                        </b>
                      )}
                    </span>
                  )
                })()}
                {/* 명령·값만 고정폭. 'U9532H 접속' 같은 한글까지 고정폭으로
                    두면 다른 화면과 글자가 달라 보인다. */}
                {/* 명령이 먼저다 — 사람이 훑을 때 찾는 것은 명령이다.
                    설명은 있으면 뒤에 옅게 붙인다. */}
                <span
                  className={`sq-sum${s.kind === 'cli' ? ' mono' : ''}`}
                  title={[summary(s), s.step].filter(Boolean).join('  —  ')}
                >
                  {summary(s) || <span className="muted">—</span>}
                  {isShut && body > 0 && <span className="sq-folded">＋{body}줄</span>}
                  {s.step && <span className="sq-desc">{s.step}</span>}
                  {/* 반복인데 안에 든 줄이 없다.
                      들여쓰기를 안 하면 빈 것을 N번 돌고 아래 줄은 한 번만
                      돈다 — 그런데 화면에는 아무 표시가 없어서 N번 돈 줄
                      알고 결과를 읽게 된다. */}
                  {s.kind === 'loop' && blockEnd(steps, i) <= i + 1 && (
                    <span className="sq-warn" title="아래 줄을 「→」 로 들여써야 반복 안에 들어갑니다">
                      비어 있음
                    </span>
                  )}
                </span>
                {/* 결과를 줄 끝에 적는다. 아이콘만으로는 PASS 와 미실행이
                    잘 안 갈린다. */}
                {/* 미실행은 글자를 안 적는다. 대부분의 줄이 미실행이라
                    같은 말이 반복되어 PASS·FAIL 이 묻힌다. ○ 로 충분하다. */}
                {/* If 는 판정을 안 낸다. 대신 참이었는지를 적는다 —
                    안 적으면 돌리고 나서도 어느 갈래로 갔는지 모른다. */}
                {s.kind === 'if' && st.cls === 'idle' && s.condResult ? (
                  <span className={`sq-res cond-${s.condResult === 'Y' ? 'y' : 'n'}`}>
                    {s.condResult === 'Y' ? '참' : '거짓'}
                  </span>
                ) : (
                  <span className={`sq-res ${st.cls}`}>
                    {st.cls === 'idle' ? '' : st.label}
                  </span>
                )}
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
      {/* 감춘 것이 있으면 밝힌다. 조용히 빼면 '분명히 만들었는데 없다' 가 된다. */}
      {hidden > 0 && steps.length - hidden > 0 && (
        <div className="sq-hidden">수동 스텝 {hidden}개는 「Manual」 탭에 있습니다.</div>
      )}

      <details className="sq-add">
        <summary>＋ 스텝</summary>
        <div className="sq-add-list">
          {ADD_KINDS.map((k) => (
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
