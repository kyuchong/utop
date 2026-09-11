import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as RPointerEvent,
  type KeyboardEvent as RKeyboardEvent,
} from 'react'
import { prefGet, prefSet } from '@/lib/prefs'
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
  /** 머리줄의 「모두 고르기」 — 도구줄에 있던 것을 표 안으로 옮긴다 */
  onPickAll?: (on: boolean) => void
  /** 열 제목 줄을 세울까 — 한 화면에 이 목록이 **여럿** 뜨는 자리(AI 다듬기)는
      끈다. 묶음마다 머리줄이 서고 전부 sticky 라 스크롤하면 겹친다. */
  head?: boolean
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
  head = true,
  onPickAll,
}: Props) {
  /* 명령·절차 설명 칸의 폭은 **사람이 끌어 정한다**(지시). 시험마다 명령이
     길기도 짧기도 해서 한 폭으로는 안 맞는다. 안 만진 칸은 예전 규칙
     그대로 남는다 — 처음 여는 사람에게는 지금과 같아 보인다. */
  const [sumW, setSumW] = useState<number | null>(() => {
    const v = Number(prefGet('utop.tc.sq.sumw') || 0)
    return v > 0 ? v : null
  })
  const [dscW, setDscW] = useState<number | null>(() => {
    const v = Number(prefGet('utop.tc.sq.dscw') || 0)
    return v > 0 ? v : null
  })
  const wDrag = useRef<{ k: 'sum' | 'dsc'; x0: number; w0: number } | null>(null)
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = wDrag.current
      if (!d) return
      const w = Math.max(80, Math.round(d.w0 + e.clientX - d.x0))
      if (d.k === 'sum') setSumW(w)
      else setDscW(w)
    }
    const up = () => {
      const d = wDrag.current
      if (!d) return
      wDrag.current = null
      /* 끌기가 끝날 때 한 번만 적는다 — 움직일 때마다 적으면 서버로
         초당 수십 번 나간다 */
      document.body.classList.remove('sq-resizing')
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [])
  useEffect(() => {
    prefSet('utop.tc.sq.sumw', sumW ? String(sumW) : '')
  }, [sumW])
  useEffect(() => {
    prefSet('utop.tc.sq.dscw', dscW ? String(dscW) : '')
  }, [dscW])
  const startW = useCallback((k: 'sum' | 'dsc', e: RPointerEvent<HTMLElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const cell = (e.currentTarget as HTMLElement).parentElement
    wDrag.current = { k, x0: e.clientX, w0: cell ? cell.getBoundingClientRect().width : 150 }
    document.body.classList.add('sq-resizing')
  }, [])

  /** 이 줄에 걸린 판정 기준 수 — 새 칩(rules)이 정본, 옛 스텝은 criteria 한 줄 */
  const ruleN = (s: TcStep) =>
    (s.rules?.length ?? 0) || (String(s.criteria ?? '').trim() ? 1 : 0)

  /**
   * 이 줄 하나만 돌릴 수 있나.
   *
   * 흐름(Loop·If·Else·동시·Switch)은 **안에 든 줄이 있어야** 뜻이 생긴다 —
   * 반복 한 줄만 돌리면 아무 일도 안 일어난다. 주석·메시지는 장비로
   * 아무것도 안 나간다. 그런 줄에 ▶ 가 서 있으면 눌러 보고 나서야 안다.
   */
  const runnable = (s: TcStep) =>
    !['loop', 'if', 'else', 'parallel', 'switch', 'comment', 'message', 'model'].includes(
      s.kind || 'cli',
    )

  const hidden = hide ? steps.filter(hide).length : 0
  /** 보이는 줄을 모두 골랐나 — 머리줄 체크가 이것을 본다 */
  const shownN = steps.length - hidden
  const allPicked = shownN > 0 && picked.size >= shownN

  /**
   * 열어 둔 `⋯` 메뉴의 줄 번호와 자리. -1 이면 안 열렸다.
   *
   * 자리를 기억해 **화면 좌표(fixed)로** 띄운다 — 목록은 `overflow:auto`
   * 안이라, 줄에 붙여 두면 아래쪽 줄에서 메뉴가 잘렸다(장비 고르기 팝업이
   * 같은 까닭으로 깨졌던 적이 있다).
   */
  /* 줄이 사라지거나 다른 시험으로 옮기면 메뉴도 닫는다 */

  /**
   * **줄에서 바로 고치기**(목업 ②).
   *
   * 명령 한 글자를 고치려고 줄을 누르고 → 오른쪽 판으로 눈을 옮기고 →
   * 칸을 찾아 누르고, 를 열다섯 줄 반복하면 시험 하나를 짜는 데 손이
   * 백 번 간다. 목업이 「누르면 편집」 인 까닭이다.
   *
   * 고치는 칸은 둘 — 보낼 명령(cli 만)과 절차 설명(모든 종류).
   * 나머지(판정 기준·조건·반복 범위)는 넓은 자리가 필요해 상세 판에 둔다.
   *
   * ↵ 다음 줄 · Tab 다음 칸 · Esc 취소.
   */
  const [edit, setEdit] = useState<{ i: number; f: 'cmd' | 'desc' } | null>(null)
  const [draft, setDraft] = useState('')
  /** blur 가 한 렌더 늦게 오므로, 지금 어느 칸인지는 ref 로도 들고 있는다 */
  const editRef = useRef<{ i: number; f: 'cmd' | 'desc' } | null>(null)
  const setEditAt = (v: { i: number; f: 'cmd' | 'desc' } | null) => {
    editRef.current = v
    setEdit(v)
  }
  const canEdit = !!onPatch && !readOnly

  /**
   * 갈래 바꾸기 — 안에 든 줄을 거느린 줄이면 먼저 묻는다.
   *
   * If·Loop 의 몸통은 **들여쓰기로만** 정해진다. 갈래를 바꿔도 아래 줄의
   * 들여쓰기는 그대로 남아, 반복이던 것이 갑자기 CLI 가 되면 그 아래
   * 줄들은 아무도 안 거느리는 채로 들여쓰기만 남는다. 눌러 놓고 나중에
   * 발견하면 어디를 되돌려야 하는지 알기 어렵다.
   */
  const changeKind = (i: number, k: StepKind, body: number) => {
    const cur = (steps[i]?.kind || 'cli') as StepKind
    if (k === cur) return
    const warn: string[] = []
    if (body > 0) warn.push(`아래 ${body}줄을 거느립니다 — 그 줄들은 들여쓴 채로 남습니다.`)
    if (cur === 'loop')
      warn.push('반복이 사라져 몸통이 한 번만 돕니다. \${i} 같은 반복 변수도 안 풀립니다.')
    if (cur === 'else') warn.push('「거짓일 때만」 이 「언제나」 가 됩니다.')
    if (cur === 'if') {
      /* Else 는 몸통이 아니라 **같은 깊이의 형제**라 body 로는 안 잡힌다.
         짝을 잃은 Else 는 실행할 때 통째로 건너뛴다 — 돌려 보고서야
         「왜 미실행이지」 하게 된다. */
      const d = Math.max(Number(steps[i]?.indent) || 0, 0)
      for (let n = i + 1; n < steps.length; n++) {
        const nd = Math.max(Number(steps[n]?.indent) || 0, 0)
        if (nd < d) break
        if (nd === d) {
          if (steps[n]?.kind === 'else') warn.push('아래 Else 가 짝을 잃어 통째로 건너뜁니다.')
          break
        }
      }
    }
    if (warn.length && !window.confirm(`${warn.join('\n')}\n\n바꿀까요?`)) return
    onPatch?.(i, { kind: k })
  }
  /**
   * 이 줄에서 그 칸을 고칠 수 있나.
   *
   * 명령은 cli 에만 있다. 그리고 **여러 줄 명령은 여기서 안 고친다** —
   * 실제 자료에 `enable / log session / conf t / epon` 처럼 한 스텝에
   * 명령이 여럿 든 것이 있는데, 한 줄짜리 input 에 넣으면 브라우저가
   * 줄바꿈을 지워 네 명령이 한 줄로 붙는다. 그런 줄은 상세 판의
   * textarea 로 보낸다.
   */
  const editable = (s: TcStep, f: 'cmd' | 'desc') =>
    canEdit &&
    (f === 'desc'
      ? !isNoteKind(s.kind)
      : (s.kind || 'cli') === 'cli' && !/[\r\n]/.test(String(s.cli ?? s.data ?? '')))
  /** 옛 스텝은 명령이 `data` 에 들어 있다 — 상세 판과 같은 자리를 읽는다.
      `s.cli` 만 보면 그런 줄을 열었다 닫는 것만으로 명령이 지워진다. */
  const valueOf = (s: TcStep, f: 'cmd' | 'desc') =>
    String((f === 'cmd' ? (s.cli ?? s.data) : s.desc) ?? '')
  const startEdit = (i: number, f: 'cmd' | 'desc') => {
    const s = steps[i]
    if (!s || !editable(s, f)) return
    setDraft(valueOf(s, f))
    setEditAt({ i, f })
  }
  /** 지금 칸을 저장한다. **안 바뀌었으면 안 쓴다** — 헛 저장이 「저장됨」 을 흔든다 */
  const commit = (i: number, f: 'cmd' | 'desc', v: string) => {
    const s = steps[i]
    if (!s || !onPatch) return
    const now = valueOf(s, f)
    if (v === now) return
    onPatch(i, f === 'cmd' ? { cli: v } : { desc: v || undefined })
  }
  /** 다음(또는 이전) 줄에서 이 칸을 고칠 수 있는 첫 줄. 없으면 -1 */
  const nextRow = (from: number, dir: 1 | -1, f: 'cmd' | 'desc') => {
    for (let j = from + dir; j >= 0 && j < steps.length; j += dir) {
      const s = steps[j]
      if (!s || hide?.(s) || folded.has(j)) continue
      if (editable(s, f)) return j
    }
    return -1
  }
  const goEdit = (i: number, f: 'cmd' | 'desc') => {
    setDraft(valueOf(steps[i]!, f))
    setEditAt({ i, f })
    onSelect(i)
  }
  /**
   * 칸에서 손이 떠났다.
   *
   * 키로 이미 다른 칸으로 옮겼다면 그때 저장했으므로 여기서 또 쓰지 않는다 —
   * 지금 편집 중인 칸이 **아직 나인지**를 ref 로 본다. state 만 보면 blur 가
   * 한 렌더 늦게 와서 같은 값을 두 번 쓰고, 「저장됨」 이 두 번 흔들린다.
   */
  const endEdit = (i: number, f: 'cmd' | 'desc') => {
    const cur = editRef.current
    if (!cur || cur.i !== i || cur.f !== f) return
    commit(i, f, draft)
    setEditAt(null)
  }
  const editKey = (
    e: RKeyboardEvent<HTMLInputElement>,
    i: number,
    f: 'cmd' | 'desc',
    s: TcStep,
  ) => {
    /* 한글을 조합하는 중의 ↵ 는 「글자 확정」 이지 「다음 줄」 이 아니다 */
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Escape') {
      /* 되돌리기 — 쓰지 않고 닫는다 */
      e.preventDefault()
      setEditAt(null)
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      commit(i, f, draft)
      const nx = nextRow(i, e.shiftKey ? -1 : 1, f)
      if (nx >= 0) goEdit(nx, f)
      else setEditAt(null)
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      commit(i, f, draft)
      /* 같은 줄의 다음 칸 — 명령 ↔ 설명. 그 칸이 없으면 다음 줄로 넘어간다 */
      const other: 'cmd' | 'desc' = f === 'cmd' ? 'desc' : 'cmd'
      if (!e.shiftKey && editable(s, other)) {
        setDraft(valueOf(s, other))
        setEditAt({ i, f: other })
        return
      }
      const nx = nextRow(i, e.shiftKey ? -1 : 1, f)
      if (nx >= 0) goEdit(nx, f)
      else setEditAt(null)
    }
  }

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
    <div
      className={`sq${readOnly ? ' sq-ro' : ''}`}
      style={
        {
          /* 판정을 **번호 옆**에 둔다(지시·합의). 서른 줄에서 「어디서
             깨졌나」 를 볼 때 눈이 오른쪽 끝까지 갔다 오지 않아도 되고,
             화면이 좁아 가로로 밀려도 판정은 안 잘린다. */
          /* **남는 폭은 명령과 설명이 나눠 갖는다**(지적: 명령이 너무 넓어
             절차 설명이 안 보인다). 명령만 1fr 이던 때는 남는 폭을 혼자
             다 먹어(506px) 설명은 160px 에 갇혀 글이 잘렸다.
             끌어 정한 폭은 명령은 **최대**, 설명은 **최소**로 삼는다 —
             그래야 명령을 좁혀도 오른쪽에 빈칸이 남지 않는다.
             둘 다 minmax(0, 1fr) 로 **반반**이다. 최소폭을 150px 처럼
             주면 두 칸을 걸치는 주석 줄(grid-column: 8 / -1)의 글자 길이가
             그 최소폭을 밀어올려 명령 칸만 커진다 — 재 보니 194 : 134 로
             벌어졌다. 0 으로 두면 걸침이 열 폭에 끼어들지 못한다. */
          '--sq-cols': [
            '26px 30px 30px 30px 40px 60px 190px',
            sumW ? `minmax(0, ${sumW}px)` : 'minmax(0, 1fr)',
            dscW ? `minmax(${dscW}px, 1fr)` : 'minmax(0, 1fr)',
          ].join(' '),
        } as CSSProperties
      }
    >
      <div className="sq-scroll">
        <div className="sq-list">
          {/* 열 제목(지시) — 어느 칸이 무엇인지 적어 둔다. 모든 칸이 같은
              grid 를 쓰므로 머리줄과 본문 줄의 경계가 늘 맞는다.
              제목은 **아이콘**이다(지시): 글자로 두면 좁은 칸(30~60px)에서
              「절차 설명」 이 두 줄로 접혀 머리줄만 높아졌다. 이름은 온마우스로
              남긴다 — 아이콘만으로는 처음 보는 사람이 못 읽는다. */}
          {steps.length - hidden > 0 && head && (
            <div className="sq-head">
              {/* 첫 칸은 **모두 고르기**다(지시: 제거하든 표시하든 정하라).
                  줄마다 체크가 있는데 머리에 없으면 전부 고를 길이 도구줄에만
                  남아, 표를 보다 눈이 위로 나갔다 와야 한다. */}
              <span className="sq-allc">
                {!!onPickAll && (
                  <input
                    type="checkbox"
                    className="sq-pick"
                    aria-label="모든 줄 고르기"
                    title={allPicked ? '모두 풀기' : '모두 고르기'}
                    checked={allPicked}
                    ref={(el) => {
                      if (el) el.indeterminate = picked.size > 0 && !allPicked
                    }}
                    onChange={() => onPickAll(!allPicked)}
                  />
                )}
              </span>
              <span title="이 줄만 실행">▶</span>
              <span title="판정 기준이 걸린 줄">◎</span>
              {/* PPTX 아이콘(지시) — 동그라미로는 무엇을 고르는 칸인지
                  알 수 없었다. 결과서 장표를 뜻하는 그림으로 세운다. */}
              <span title="결과서(PPTX)에 실을 줄">
                {/* 장표 한 장 — 화면과 받침, 안에 막대. 색을 칠한 네모에 글자를
                    박으면 다른 제목들과 결이 안 맞는다(지적). 선으로만 그린다. */}
                <svg
                  viewBox="0 0 16 16"
                  width="15"
                  height="15"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="1.9" y="2.3" width="12.2" height="8.4" rx="1.3" />
                  <path d="M8 10.7v2.3M5.7 13.3h4.6" />
                  <path d="M5.6 8.3V6.5M8 8.3V4.9M10.4 8.3V7.1" />
                </svg>
              </span>
              <span title="세션 — 어느 장비로 나가나">⇄</span>
              <span title="스텝 번호">№</span>
              <span title="동작 — 이 줄이 하는 일">⚙</span>
              <span title="명령 · 내용">
                &gt;_
                <i
                  className="sq-rs"
                  title="끌어서 폭을 바꿉니다 — 두 번 누르면 처음으로"
                  onPointerDown={(e) => startW('sum', e)}
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    setSumW(null)
                  }}
                />
              </span>
              <span title="절차 설명 — 결과서와 실행 로그가 쓰는 말">
                ✎
                <i
                  className="sq-rs"
                  title="끌어서 폭을 바꿉니다 — 두 번 누르면 처음으로"
                  onPointerDown={(e) => startW('dsc', e)}
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    setDscW(null)
                  }}
                />
              </span>
            </div>
          )}
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
                /* 판정은 **줄이 지고 있다**(지시: 세로 바 말고 다른 방법).
                   깨진 줄만 물들인다 — 통과까지 초록으로 칠하면 화면 절반이
                   초록이 되어 정작 붉은 줄이 묻힌다. */
                className={`sq-row v-${st.cls}${i === selected ? ' on' : ''}${
                  picked.has(i) ? ' picked' : ''
                }${s.skip ? ' skip' : ''}${
                  i === runningAt ? ' now' : ''
                }${isNoteKind(s.kind) ? ` note ${s.kind}` : ''}${s.head ? ' head' : ''}`}
                data-depth={depth || undefined}
                data-kid={kid}
                /* 체크칸을 걷었으니(지시) 여러 줄은 여기서 고른다 —
                   Ctrl(또는 ⌘)은 하나씩, Shift 는 여기까지 이어서. */
                onClick={(e) => {
                  if (e.ctrlKey || e.metaKey || e.shiftKey) {
                    e.preventDefault()
                    onPick(i, e.shiftKey)
                    return
                  }
                  onSelect(i)
                }}
                onKeyDown={(e) => {
                  /* 칸 **안에서** 치는 글쇠는 줄의 것이 아니다(지적: 절차
                     설명에 띄어쓰기가 안 된다). 설명을 적다 스페이스를
                     누르면 여기까지 올라와 「줄 고르기」 로 먹히고,
                     preventDefault 가 그 칸의 띄어쓰기를 삼켰다. */
                  const t = e.target as HTMLElement
                  if (t !== e.currentTarget) {
                    const tag = t.tagName
                    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable)
                      return
                  }
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelect(i)
                  }
                }}
              >
                {/* 고른 줄 — **체크로 보여 준다**(지시). 바탕색만 옅게 바뀌면
                    무엇이 골라졌는지 알 수 없다. */}
                <span className="sq-allc">
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
                </span>
                {/* 실행은 **줄 맨 앞**이다(지시) — 왼쪽 판정 띠 바로 옆.
                    돌릴 수 있는 줄인지, 돌린 결과가 어떤지가 나란히 읽힌다. */}
                <span className="sq-runc">
                  {onRun && runnable(s) ? (
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
                  ) : (
                    /* 못 돌리는 줄은 **하이픈**(지시) — 빈 칸으로 두면
                       「아직 안 만든 자리」 처럼 보인다 */
                    <i className="sq-dash" title="이 줄만 따로 돌릴 수는 없습니다">
                      –
                    </i>
                  )}
                </span>
                {/* **판정 기준이 걸린 줄**(지시) — 이 칸은 본디 ⋯ 였는데,
                    그 판이 하던 세션·대기는 오른쪽 판이 이미 한다.
                    무엇이 판정을 내는 줄인지가 훨씬 자주 찾는 것이다. */}
                <span className="sq-judc">
                  {ruleN(s) > 0 && (
                    <i className="sq-jud" title={`판정 기준 ${ruleN(s)}개`}>
                      ◎
                    </i>
                  )}
                </span>
                {/* 결과서에 실을 줄(지시) — **동그라미**로 둔다. 네모 체크는
                    맨 앞 「여러 줄 고르기」 가 이미 쓰고 있어, 같은 모양이
                    나란히 서면 무엇을 고르는 것인지 갈리지 않는다. */}
                <span className="sq-pptc">
                  <input
                    type="checkbox"
                    className="sq-ppt"
                    aria-label={`${i + 1}번 줄을 결과서에 싣기`}
                    title="결과서(PPTX)에 실을 줄"
                    disabled={!canEdit}
                    checked={!!s.ppt}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => onPatch?.(i, { ppt: !s.ppt })}
                  />
                </span>
                {/* ▶ 와 ⋯ 은 **각각 제 칸**이다(지시: 제목이 없다).
                    한 칸에 둘을 넣으면 머리줄에 제목을 하나밖에 못 달고,
                {/* 상태 기호(✔·✖·○)는 뺐다 — 줄 끝의 PASS·FAIL 글자와 같은
                    말을 두 번 하는 열이었다. 도는 줄은 줄 자체가 빛난다. */}
                {/* 세션은 맨 앞 고정 열 — Action 뒤에 두면 들여쓰기에 밀려
                    줄마다 자리가 달랐다(지적). 값이 없으면 – 로 칸을 고르게
                    채운다. 자릿수가 늘어도 안 밀리게 S01 두 자리로 적는다. */}
                {(() => {
                  /* **계측기는 세션이 아니다**(지시). 섀시 주소로 곧장 나가는데
                     S01 로 적어 두면 장비 세션과 같은 것으로 읽힌다. T.G 로 적는다. */
                  if ((s.kind || 'cli') === 'instrument')
                    return (
                      <span className="sq-s">
                        <b className="tg" title="계측기 — 세션이 아니라 섀시로 곧장 나갑니다">
                          T.G
                        </b>
                      </span>
                    )
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
                {/* 들여쓰기는 **칸 안쪽 여백**으로 준다. margin 으로 주면
                    grid 칸 자체가 밀려 그 칸의 세로선이 14px 씩 오른쪽으로
                    나가 머리줄과 어긋났다(실측: 이 칸만 diff −14). */}
                <span className="sq-act" style={{ paddingLeft: 6 + depth * 14 }}>
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
                  {/* **갈래를 여기서 고른다**(지시). 오른쪽 판을 열어 고르던
                      것을 줄에서 바로 — 무엇을 하는 줄인지 적힌 자리가
                      곧 그것을 바꾸는 자리다. */}
                  {canEdit ? (
                    <select
                      className="sq-kind"
                      value={s.kind || 'cli'}
                      title={info.label}
                      onClick={(e) => e.stopPropagation()}
                      /* 줄이 Enter·Space 를 가로채(preventDefault) 드롭다운이
                         안 열렸다 — 키보드만 쓰는 사람은 갈래를 못 고쳤다 */
                      onKeyDown={(e) => e.stopPropagation()}
                      onChange={(e) => changeKind(i, e.target.value as StepKind, body)}
                    >
                      {/* SETUP 에서 끈 갈래는 여기에도 안 내놓는다 —
                          「＋ 스텝」 에만 걸고 여기 안 걸면 끈 갈래가 서른 줄의
                          드롭다운마다 그대로 뜬다 */}
                      {ADD_KINDS.filter((k) => !addKinds || addKinds(String(k.k))).map((k) => (
                        <option key={k.k} value={k.k}>
                          {k.label}
                        </option>
                      ))}
                      {/* 이미 저장된 옛 갈래(Connect·Model·Manual)는 목록에
                          없다. 자리를 안 만들면 칸이 빈 채로 떠서, 다른 칸을
                          고치는 순간 조용히 다른 갈래가 된다. */}
                      {!ADD_KINDS.some((k) => k.k === (s.kind || 'cli')) && (
                        <option value={s.kind || 'cli'}>{info.label} (옛 방식)</option>
                      )}
                    </select>
                  ) : (
                    info.label
                  )}
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
                  {/* **누르면 그 자리에서 고친다**(목업 ②). cli 만 — 다른
                      종류는 요약이 여러 칸을 합친 글이라 한 칸으로 못 되돌린다. */}
                  {edit?.i === i && edit.f === 'cmd' ? (
                    <input
                      className="sq-in"
                      ref={(el) => el?.focus({ preventScroll: true })}
                      value={draft}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => editKey(e, i, 'cmd', s)}
                      onBlur={() => endEdit(i, 'cmd')}
                    />
                  ) : editable(s, 'cmd') ? (
                    <span
                      className="sq-sumv"
                      role="button"
                      tabIndex={-1}
                      title="눌러서 고칩니다 — ↵ 다음 줄 · Tab 다음 칸 · Esc 취소"
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelect(i)
                        startEdit(i, 'cmd')
                      }}
                    >
                      {summary(s) || <span className="muted">비어 있음 — 눌러서 명령을</span>}
                    </span>
                  ) : (
                    <span className="sq-sumt">{summary(s) || <span className="muted">—</span>}</span>
                  )}
                  {isShut && body > 0 && <span className="sq-folded">＋{body}줄</span>}
                  {s.kind === 'if' && !!s.condResult && (
                    <span className={`sq-cond ${s.condResult === 'Y' ? 'y' : 'n'}`}>
                      {s.condResult === 'Y' ? '참' : '거짓'}
                    </span>
                  )}
                  {/* **절차 설명을 되살렸다**(지시). 뺐던 까닭은 「고칠 자리가
                      없어서」 였는데, 이제 스텝 상세에 그 칸이 있다. 결과서가
                      절차의 첫 줄로 읽는 값이라 목록에서도 보여야 한다 —
                      안 보이면 아무도 안 채우고, 그러면 결과서에 명령만 나가
                      무슨 시험인지 알 수 없다. 명령 뒤에 옅게 붙인다. */}
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
                {/* **절차 설명은 제 칸**이다(지시: 명령·내용을 분리).
                    장비로 나가는 값(명령)과 결과서로 나가는 값(설명)은
                    정본이 다르다 — 한 칸에 붙여 두면 명령이 길 때 설명이
                    통째로 안 보이고, 결과서가 읽는 값이 비어 있어도 눈에
                    안 띈다. */}
                <span className="sq-dsc">
                  {edit?.i === i && edit.f === 'desc' ? (
                    <input
                      className="sq-in desc"
                      ref={(el) => el?.focus({ preventScroll: true })}
                      placeholder="결과서와 실행 로그가 이 값을 씁니다"
                      value={draft}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => editKey(e, i, 'desc', s)}
                      onBlur={() => endEdit(i, 'desc')}
                    />
                  ) : String(s.desc ?? '').trim() ? (
                    <i
                      className={`sq-desc${editable(s, 'desc') ? ' hit' : ''}`}
                      title={String(s.desc).trim()}
                      onClick={
                        editable(s, 'desc')
                          ? (e) => {
                              e.stopPropagation()
                              onSelect(i)
                              startEdit(i, 'desc')
                            }
                          : undefined
                      }
                    >
                      {String(s.desc).trim()}
                    </i>
                  ) : editable(s, 'desc') ? (
                    /* 빈 설명은 **줄에 손이 올 때만** 비친다. 늘 보이면 서른
                       줄이 「＋ 설명」 으로 덮인다. 결과서가 읽는 값이라
                       채울 길은 열어 둔다. */
                    <i
                      className="sq-desc empty"
                      title="절차 설명 — 결과서(PPTX)가 절차의 첫 줄로 읽습니다"
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelect(i)
                        startEdit(i, 'desc')
                      }}
                    >
                      ＋ 설명
                    </i>
                  ) : null}
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

      {/* 고치는 동안 표 밖에 뜨던 길잡이는 걷었다(지적: 별도로 뭐가
          띄워진다). ↵·Tab·Esc 는 칸의 온마우스에 적혀 있다. */}

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

    </div>
  )
}
