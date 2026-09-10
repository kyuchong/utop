import { useEffect, useMemo, useState } from 'react'
import StepIcon from './StepIcon'
import { IconChevron } from '../icons'
import { blockEnd } from './runner'
import {
  ADD_KINDS,
  isNoteKind,
  sessionIndex,
  stepKindInfo,
  stepNumbers,
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
  /** 「＋스텝」 에 내놓을 종류 고르기 — SETUP 의 TC Step Action */
  addKinds?: (k: string) => boolean
  /** 이 스텝만 실행 */
  onRun?: (i: number) => void
  /** 보기만 하는 목록 — 「＋ 스텝」 을 감춘다 */
  readOnly?: boolean
  /**
   * 줄 끝 `⋯` 메뉴 — **그 줄에만 듣는 설정**(목업 ③).
   *
   * 세션·대기처럼 한 줄에 붙는 값은 상세 판까지 가지 않고 그 자리에서
   * 바꾸는 것이 짧다. 셋 다 없으면 `⋯` 을 아예 안 낸다.
   */
  onPatch?: (i: number, p: Partial<TcStep>) => void
  onDuplicate?: (i: number) => void
  onRemove?: (i: number) => void
  /** 세션 이름 목록 — `⋯` 메뉴의 세션 고르개에 쓴다 */
  sessions?: string[]
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
  addKinds,
  onRun,
  readOnly = false,
  onPatch,
  onDuplicate,
  onRemove,
  sessions = [],
}: Props) {
  const hidden = hide ? steps.filter(hide).length : 0

  /**
   * 열어 둔 `⋯` 메뉴의 줄 번호와 자리. -1 이면 안 열렸다.
   *
   * 자리를 기억해 **화면 좌표(fixed)로** 띄운다 — 목록은 `overflow:auto`
   * 안이라, 줄에 붙여 두면 아래쪽 줄에서 메뉴가 잘렸다(장비 고르기 팝업이
   * 같은 까닭으로 깨졌던 적이 있다).
   */
  const [menuAt, setMenuAt] = useState(-1)
  const [menuXY, setMenuXY] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  useEffect(() => {
    if (menuAt < 0) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenuAt(-1)
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [menuAt])
  /* 줄이 사라지거나 다른 시험으로 옮기면 메뉴도 닫는다 */
  useEffect(() => {
    if (menuAt >= steps.length) setMenuAt(-1)
  }, [steps.length, menuAt])
  const canMenu = !!(onPatch || onDuplicate || onRemove) && !readOnly

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
      if (!steps[i]) return
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
  /** 목록 번호 — 고르개(If 의 「이동」)도 같은 것을 쓴다 */
  const numbers = stepNumbers(steps, hide)

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
    <div className={`sq${readOnly ? ' sq-ro' : ''}`}>
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
          (() => {
            /* 접을 줄이 하나라도 있을 때만 캐럿 자리를 비워 둔다.
               평평한 목록에서는 그 자리가 통째로 빈 열로 보였다(지적: 3번 공백).
               섞인 목록에서는 전 줄이 같은 자리를 비워야 아이콘이 안 들쭉거린다. */
            const anyFold = steps.some((_, at) => blockEnd(steps, at) - at - 1 > 0)
            return steps.map((s, i) => {
            if (hide?.(s)) return null
            if (folded.has(i)) return null
            const info = stepKindInfo(s.kind)
            /*
             * 접을 수 있나 — 종류가 아니라 **아래에 들여쓴 줄이 있나**로 본다.
             *
             * 처음엔 반복·조건만 접게 했다. 그런데 몸통은 indent 로만
             * 정해져서, 주석 아래로 스텝을 들여쓰면 그 주석도 1.1 을
             * 거느린 부모가 된다 — 번호는 그렇게 매기면서 접지는 못했다.
             */
            const body = blockEnd(steps, i) - i - 1
            const isShut = shut.has(i)
            const st = stat(s)
            const depth = Math.min(Math.max(Number(s.indent) || 0, 0), 4)
            /*
             * 트리 가이드를 그리려면 「내가 이 묶음의 마지막인가」 를 알아야
             * 한다. 마지막이면 └, 아니면 ├ 다. 다음에 나오는(감춘 줄은
             * 건너뛴) 줄이 나보다 얕으면 내가 마지막이다.
             */
            let kid: 'mid' | 'last' | undefined
            if (depth > 0) {
              let nx = i + 1
              while (nx < steps.length && (hide?.(steps[nx]!) || folded.has(nx))) nx++
              const nd =
                nx < steps.length ? Math.min(Math.max(Number(steps[nx]?.indent) || 0, 0), 4) : 0
              kid = nx >= steps.length || nd < depth ? 'last' : 'mid'
            }
            return (
              <div
                key={i}
                role="button"
                tabIndex={0}
                // 주석·메시지는 장비로 아무것도 안 나간다. 줄 색을 달리해
                // 훑을 때 '이건 설명' 이 한눈에 갈리게 한다.
                className={`sq-row${i === selected ? ' on' : ''}${s.skip ? ' skip' : ''}${
                  i === runningAt ? ' now' : ''
                }${isNoteKind(s.kind) ? ` note ${s.kind}` : ''}${s.head ? ' head' : ''}`}
                data-depth={depth || undefined}
                data-kid={kid}
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
                {/* 상태 기호(✔·✖·○)는 뺐다 — 줄 끝의 PASS·FAIL 글자와 같은
                    말을 두 번 하는 열이었다. 도는 줄은 줄 자체가 빛난다. */}
                {/* 세션은 맨 앞 고정 열 — Action 뒤에 두면 들여쓰기에 밀려
                    줄마다 자리가 달랐다(지적). 값이 없으면 – 로 칸을 고르게
                    채운다. 자릿수가 늘어도 안 밀리게 S01 두 자리로 적는다. */}
                {(() => {
                  const k = sessionIndex(s.session)
                  return (
                    <span className="sq-s">
                      {k >= 0 ? (
                        <b data-s={k % 4} title={sessionName(k)}>
                          S{String(k + 1).padStart(2, '0')}
                        </b>
                      ) : (
                        <span className="sq-s-none">–</span>
                      )}
                    </span>
                  )
                })()}
                <span className="sq-n">{numbers[i]}</span>
                <span className="sq-act" style={{ marginLeft: depth * 16 }}>
                  {/* 블록만 접힌다. 아닌 줄에도 같은 폭을 비워 두어야
                      Action 글자가 들쭉날쭉하지 않다. */}
                  {body > 0 ? (
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
                  ) : anyFold ? (
                    <span className="sq-caret" />
                  ) : null}
                  <StepIcon name={info.icon} className={`sq-ic g-${info.group}`} />
                  {info.label}
                </span>
                {/* 어느 세션으로 나가는가. 같은 장비를 두 자리에 앉히는 일이
                    흔해서 장비 이름만으로는 안 갈린다 — iTest 도 Session 을
                    별도 열로 둔다. */}
                {/* 명령·값만 고정폭. 'U9532H 접속' 같은 한글까지 고정폭으로
                    두면 다른 화면과 글자가 달라 보인다. */}
                {/* 명령이 먼저다 — 사람이 훑을 때 찾는 것은 명령이다.
                    설명은 있으면 뒤에 옅게 붙인다. */}
                <span
                  className={`sq-sum${s.kind === 'cli' ? ' mono' : ''}`}
                  title={[summary(s), s.desc, s.step].filter(Boolean).join('  —  ')}
                >
                  {summary(s) || <span className="muted">—</span>}
                  {isShut && body > 0 && <span className="sq-folded">＋{body}줄</span>}
                  {/* **절차 설명을 되살렸다**(지시). 뺐던 까닭은 「고칠 자리가
                      없어서」 였는데, 이제 스텝 상세에 그 칸이 있다. 결과서가
                      절차의 첫 줄로 읽는 값이라 목록에서도 보여야 한다 —
                      안 보이면 아무도 안 채우고, 그러면 결과서에 명령만 나가
                      무슨 시험인지 알 수 없다. 명령 뒤에 옅게 붙인다. */}
                  {!!String(s.desc ?? '').trim() && (
                    <i className="sq-desc">{String(s.desc).trim()}</i>
                  )}
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
                {/* **뽑은 값**(목업) — 이 스텝이 응답에서 담아 두는 변수.
                    뒷 줄이 ${'${'}이름{'}'} 으로 쓰는 값이라, 어느 줄이 무엇을
                    내놓는지 목록에서 보여야 흐름이 읽힌다. 지금은 스텝을
                    하나씩 눌러 상세를 열어 봐야 알 수 있었다. */}
                <span className="sq-var">
                  {(s.extracts ?? []).map((e, k) =>
                    e.var ? (
                      <b key={k} title={`이 스텝이 담습니다 — 뒤에서 \${${e.var}} 로 씁니다`}>
                        {'${' + e.var + '}'}
                      </b>
                    ) : null,
                  )}
                </span>
                {/* 결과를 줄 끝에 적는다. 아이콘만으로는 PASS 와 미실행이
                    잘 안 갈린다. */}
                {/* 미실행은 글자를 안 적는다. 대부분의 줄이 미실행이라
                    같은 말이 반복되어 PASS·FAIL 이 묻힌다. ○ 로 충분하다. */}
                {/* If 는 판정을 안 낸다. 대신 참이었는지를 적는다 —
                    안 적으면 돌리고 나서도 어느 갈래로 갔는지 모른다. */}
                {i === runningAt ? (
                  /* 도는 동안은 옛 결과가 아니라 지금을 적는다. 두 번째로
                     돌릴 때 앞서 찍힌 PASS 가 그대로 남아 있으면, 방금
                     통과한 것처럼 읽힌다. */
                  <span className="sq-res run">실행 중</span>
                ) : s.kind === 'if' && st.cls === 'idle' && s.condResult ? (
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
                  {/* 그 줄에만 듣는 설정(목업 ③). 평소엔 옅고 줄에 손이
                      오면 진해진다 — 서른 줄에 ⋯ 이 또렷하면 그것부터 보인다. */}
                  {canMenu && (
                    <button
                      type="button"
                      className={`sq-more${menuAt === i ? ' on' : ''}`}
                      title="이 줄 설정 — 세션 · 대기 · 건너뛰기 · 복제 · 삭제"
                      aria-haspopup="menu"
                      aria-expanded={menuAt === i}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (menuAt === i) {
                          setMenuAt(-1)
                          return
                        }
                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        setMenuXY({ x: r.right, y: r.bottom + 2 })
                        setMenuAt(i)
                        onSelect(i)
                      }}
                    >
                      ⋯
                    </button>
                  )}
                </span>
              </div>
            )
            })
          })()
        )}

      {/* 스텝 추가. 마지막 줄 바로 아래에 둔다 — 바닥에 고정하면 스텝이
          적을 때 화면 끝까지 내려가 손이 멀다.
          종류를 여기서 고르므로 왼쪽에 팔레트를 따로 두지 않는다. */}
      {/* 감춘 것이 있으면 밝힌다. 조용히 빼면 '분명히 만들었는데 없다' 가 된다. */}
      {hidden > 0 && steps.length - hidden > 0 && (
        <div className="sq-hidden">수동 스텝 {hidden}개는 「Manual」 탭에 있습니다.</div>
      )}

      {/* **몇 줄이 몇 줄로 접혔나**(목업 밑줄). 접어 두면 아래 절차가
          화면에 들어오는 대신 「다 있는 건가」 가 된다 — 숫자로 답한다.
          접은 것이 없으면 아무 말도 안 한다. */}
      {(() => {
        const all = steps.length - hidden
        const now = steps.filter((s, i) => !hide?.(s) && !folded.has(i)).length
        return now < all ? (
          <div className="sq-foldnote">
            {all} 줄이 {now} 줄로 — {all - now} 줄이 접혀 있습니다
            <button type="button" onClick={() => setShut(new Set())}>
              모두 펴기
            </button>
          </div>
        ) : null
      })()}

      {!readOnly && (
      <details className="sq-add">
        <summary>＋ 스텝</summary>
        <div className="sq-add-list">
          {/* 끈 종류는 안 내놓는다(SETUP → TC Step Action). 이미 만든
              스텝은 그대로 돈다 — 목록에서만 뺀다 */}
          {ADD_KINDS.filter((k) => !addKinds || addKinds(String(k.k))).map((k) => (
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
      )}
        </div>
      </div>

      {/* ── 줄 끝 `⋯` 메뉴(목업 ③) ─────────────────────────────────────
          그 줄에만 듣는 것만 담는다. 판정 기준처럼 넓은 자리가 필요한
          것은 여기 안 넣는다 — 작은 메뉴에 큰 일을 넣으면 둘 다 못 쓴다. */}
      {menuAt >= 0 && steps[menuAt] && (
        <>
          <div className="sq-menu-veil" onClick={() => setMenuAt(-1)} aria-hidden="true" />
          <div
            className="sq-menu"
            role="menu"
            style={{ left: menuXY.x, top: menuXY.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sq-menu-hd">
              스텝 {numbers[menuAt]} · {stepKindInfo(steps[menuAt]!.kind).label}
            </div>
            {!!onPatch && (
              <>
                <label className="sq-menu-f">
                  <span>세션</span>
                  <select
                    value={(() => {
                      const k = sessionIndex(steps[menuAt]!.session)
                      return k >= 0 ? String(k) : ''
                    })()}
                    onChange={(e) => {
                      const v = e.target.value
                      onPatch(menuAt, { session: v === '' ? undefined : Number(v) })
                    }}
                  >
                    <option value="">– 없음</option>
                    {sessions.map((nm, k) => (
                      <option key={k} value={String(k)}>
                        S{String(k + 1).padStart(2, '0')} · {nm || `세션 ${k + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
                {/* 대기는 CLI 에만 있다 — 다른 종류에는 보낼 명령 자체가 없다 */}
                {(steps[menuAt]!.kind || 'cli') === 'cli' && (
                  <label className="sq-menu-f">
                    <span>명령 뒤 대기</span>
                    <span className="sq-menu-wait">
                      <input
                        type="number"
                        min={0}
                        max={30}
                        step={0.1}
                        value={steps[menuAt]!.tailWait ?? ''}
                        placeholder="기본"
                        onChange={(e) => {
                          const v = e.target.value.trim()
                          onPatch(menuAt, {
                            tailWait: v === '' ? undefined : Math.max(0, Number(v) || 0),
                          })
                        }}
                      />
                      <i>초</i>
                    </span>
                  </label>
                )}
                <div className="sq-menu-sep" />
                <button
                  type="button"
                  role="menuitem"
                  className="sq-menu-i"
                  onClick={() => {
                    onPatch(menuAt, { skip: !steps[menuAt]!.skip })
                    setMenuAt(-1)
                  }}
                >
                  {steps[menuAt]!.skip ? '건너뛰기 되돌리기' : '이 스텝 건너뛰기'}
                </button>
              </>
            )}
            {!!onDuplicate && (
              <button
                type="button"
                role="menuitem"
                className="sq-menu-i"
                onClick={() => {
                  const at = menuAt
                  setMenuAt(-1)
                  onDuplicate(at)
                }}
              >
                복제
              </button>
            )}
            {!!onRemove && (
              <button
                type="button"
                role="menuitem"
                className="sq-menu-i danger"
                onClick={() => {
                  const at = menuAt
                  setMenuAt(-1)
                  onRemove(at)
                }}
              >
                삭제
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
