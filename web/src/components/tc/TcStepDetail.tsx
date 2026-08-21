import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { IconIndent, IconOutdent } from '../icons'
import {
  applyMapRules,
  applySkips,
  isTimeLine,
  looksLikeTime,
  SKIP_TIME,
  extractOne,
  anyTable,
  parseTable,
  stepRules,
  tableCapture,
  subVars,
  type JudgeRule,
} from './judge'
import BlockText from './BlockText'
import TcTable from './TcTable'
import ParamPicker from './ParamPicker'
import PickList, { type PickItem } from './PickList'
import TcMeterStep from './TcMeterStep'
import MeterStats, { parseMeterOutput } from './MeterStats'
import {
  ADD_KINDS,
  isNoteKind,
  sessionIndex,
  STEP_CONTENT,
  stepKindInfo,
  stepResult,
  stepStatus,
  type MeterCfg,
  type StepKind,
  type TcStep,
} from './types'

interface Props {
  step: TcStep | null
  index: number
  total: number
  /** 이 TC 가 쓰는 세션들. 사람이 읽는 이름 배열 (자리 번호가 곧 인덱스) */
  sessions: string[]
  /** 이 TC 에 깔린 전역 파라미터 — 넣는 목록과 '지금 값' 에 쓴다 */
  params: { values: Record<string, string>; items: PickItem[]; loading: boolean; empty: string }
  /** 다른 스텝이 이미 쓰고 있는 변수 이름 — 겹치면 뒤엣것이 앞엣것을 덮는다 */
  takenVars: string[]
  onChange: (patch: Partial<TcStep>) => void
  onMove: (dir: -1 | 1) => void
  onRemove: () => void
  /** 바로 아래에 같은 스텝 하나 더 */
  onDuplicate: () => void
  onRun?: () => void
  /** TC 의 Traffic 탭이 정한 트래픽 설정 — 계측기 스텝이 보여 준다 */
  meterCfg?: MeterCfg
  /** 계측기 스텝에서 Traffic 탭으로 건너뛰기 */
  onGoTraffic?: () => void
  /**
   * 이 블록 뒤의 줄이 몇 개나 밖에 있나 · 그중 n 개를 안으로 넣기.
   *
   * 반복의 몸통은 들여쓴 줄로 정해지는데, 그것을 모르면 빈 반복이 된다 —
   * 조용히 아무것도 안 하고 아래는 한 번만 돈다. 손으로 한 줄씩 「→」 를
   * 누르게 하지 말고 여기서 한 번에 넣는다.
   */
  block?: { empty: boolean; after: number; wrap: (n: number) => void }
  /**
   * 보기만 하는 판.
   *
   * AI 화면의 「General AI Assistant」 는 **있는 시험을 골라 그대로 도는**
   * 자리라 여기서 고치면 안 된다(지시). 옮기기·복제·삭제 줄을 걷고
   * 알맹이를 통째로 잠근다(`inert`).
   */
  readOnly?: boolean
  /**
   * 이 스텝을 감싸는 반복의 변수 이름 (있으면).
   *
   * 「표에서 값 뽑기」 가 회차 번호를 권할 때 쓴다 — 반복 안인데 `Te0/13`
   * 을 그대로 두면 24회를 돌려도 같은 줄만 스물네 번 본다.
   */
  loopVar?: string
  /** 이 스텝 **바로 뒤에** 여러 줄을 끼운다 (「결과 문구 붙이기」) */
  onInsertAfter?: (steps: TcStep[]) => void
  /** 이 시험의 스텝 목록 — If 의 「어느 스텝으로 이동」 이 고른다 */
  stepList?: Array<{ i: number; label: string }>
}

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
/** 고른 셋으로 조건식을 만든다 — 숫자는 그대로, 글자는 따옴표로 */
function mkCond(v: string, op: string, val: string): string {
  if (!v) return ''
  const raw = String(val ?? '').trim()
  const lit = raw === '' ? "''" : /^-?\d+(\.\d+)?$/.test(raw) || raw.startsWith('${') ? raw : `'${raw}'`
  return `\${${v}} ${op} ${lit}`
}

export default function TcStepDetail({
  step,
  index,
  total,
  sessions,
  params: gp,
  takenVars,
  onChange,
  onMove,
  onRemove,
  onDuplicate,
  onRun,
  meterCfg,
  onGoTraffic,
  block,
  loopVar,
  onInsertAfter,
  stepList,
  readOnly = false,
}: Props) {
  const [picked, setPicked] = useState('')
  /** 눌린 블럭 — [변수로 · 있으면 합격 · 있으면 불합격] 메뉴가 뜬 자리 */
  const [blockAt, setBlockAt] = useState<{ v: string; x: number; y: number; kind?: 'col' } | null>(null)
  const [tblOpen, setTblOpen] = useState(false)
  /** 「표에서 값 뽑기」 판 — 판정이 아니라 변수를 만드는 자리(Response Map) */
  const [capOpen, setCapOpen] = useState(false)
  /** 펼쳐 본 회차. 0 이면 안 폈다 */
  const [round, setRound] = useState(0)
  /** 지금 열려 있는 고르기 목록 — 어느 칸에 넣을지까지 담는다 */
  /** 어느 칸에 넣을 목록을 열어 두었나 */
  const [pick, setPick] = useState('')
  const [oidQ, setOidQ] = useState('')

  /**
   * MIB 에서 뽑아 둔 OID 이름표.
   *
   * 수만 개일 수 있어 서버에서 찾는다. 창을 열 때만 부른다 — 스텝을 고를
   * 때마다 부르면 목록을 안 쓰는 사람도 매번 값을 치른다.
   */
  const oidQuery = useQuery({
    queryKey: ['snmp-oids', oidQ],
    enabled: pick === 'oid',
    queryFn: async () => {
      const r = await apiFetch(`/api/snmp-oids?q=${encodeURIComponent(oidQ)}&limit=200`)
      if (!r.ok) throw new Error('OID 목록을 불러오지 못했습니다')
      return (await r.json()) as {
        oids?: Array<{ oid: string; name: string }>
        total?: number
        hint?: string
      }
    },
  })

  const oidItems: PickItem[] = (oidQuery.data?.oids ?? []).map((o) => ({
    value: o.oid,
    label: o.name,
    note: '',
  }))


  if (!step) {
    return (
      <div className="sd">
        <div className="empty">가운데에서 스텝을 고르세요.</div>
      </div>
    )
  }

  /**
   * 파라미터 넣기 단추 + 목록.
   *
   * 칸마다 따로 짜면 어떤 칸에는 있고 어떤 칸에는 없게 된다 — 실제로
   * 명령과 Expected 에만 있었다. 한 군데서 만들어 필요한 칸에 건다.
   */
  const paramPick = (field: keyof TcStep, key: string) => ({
    btn: (
      <button
        type="button"
        className="sd-pickbtn"
        title="전역 파라미터 넣기"
        onClick={() => setPick(pick === key ? '' : key)}
      >
        {'${ } 값 넣기'}
      </button>
    ),
    list:
      pick === key ? (
        // 목록을 칸 옆에 띄우면 파일이 여럿이고 값이 수십 개일 때
        // 이름만 보고 골라야 한다. 창으로 띄우고 파일별로 묶는다.
        <ParamPicker
          items={gp.items}
          values={gp.values}
          loading={gp.loading}
          empty={gp.empty}
          onClose={() => setPick('')}
          onPick={(x) => {
            const cur = String(step[field] ?? '')
            onChange({
              [field]: cur ? `${cur}${cur.endsWith(' ') ? '' : ' '}${x.value}` : x.value,
            } as Partial<TcStep>)
            setPick('')
          }}
        />
      ) : null,
  })

  /**
   * 지금 값이 무엇이 되는가.
   *
   * `${업링크}` 라고 적어 두면 돌려보기 전에는 무엇으로 나갈지 알 수 없다.
   * 이름을 잘못 적었을 때도 실행할 때 가서야 안다. 바로 아래 보여준다.
   */
  const preview = (text?: string) => {
    const s = String(text ?? '')
    if (!s.includes('$')) return null
    const done = subVars(s, gp.values)
    if (done === s) return null
    return (
      <span className="sd-prev">
        지금 값 <code>{done.length > 120 ? `${done.slice(0, 120)}…` : done}</code>
      </span>
    )
  }


  const kind = (step.kind || 'cli') as StepKind
  const info = stepKindInfo(kind)
  const result = stepResult(step)
  const verdict = stepStatus(step)
  /**
   * 어떤 칸을 띄울지는 종류가 정한다.
   *
   * 656스텝을 세어 보고 잡았다. `step`(Test Step) 3건 · `data` 3건 ·
   * `rca` 0건 · `note` 0건 — 아무도 안 쓰는 칸을 모든 종류에 띄우고 있었다.
   * 반대로 `output` 은 if 103 · wait 16 · connect 15 · disconnect 15 건이
   * 있는데 그 줄들에는 Result 칸이 없었다.
   */
  /** CLI 로는 못 하는 것들 — 세션 없이도 돈다 */
  const isNet =
    kind === 'ping' || kind === 'snmp_get' || kind === 'snmp_set' || kind === 'snmp_trap'
  /** 명령을 보내는 것 */
  const isCmd = kind === 'cli' || kind === 'instrument'
  /** 접속·해제 */
  const isConn = kind === 'connect' || kind === 'disconnect'
  /** 응답을 받아 판정할 수 있는 것. 판정 칸을 띄운다 */
  /** 값만 견주는 줄. 장비로 아무것도 안 나가지만 합격·불합격은 낸다 */
  const isDiff = kind === 'diff'
  const isRun = isCmd || isNet || isConn
  /**
   * 계측기 스텝인가.
   *
   * 계측기는 CLI 와 닮은 데가 거의 없다 — 세션으로 붙지 않고, 판정도
   * 문구 검증이 아니라 「통계 읽기」 의 손실 수로 난다. 그런데 kind 가
   * isCmd 에 묶여 있어 CLI 칸(Session·Expected·판정 영역·프롬프트 대기)이
   * 그대로 따라 떴다. 여기서 갈라낸다.
   */
  const isMeterStep = kind === 'instrument'
  /**
   * 결과 칸을 띄운다.
   *
   * 판정하는 것뿐 아니라 **결과가 남아 있는 모든 줄**에 띄운다. 옛 자료의
   * if·wait 줄에도 output 이 들어 있는데, 안 띄우면 그 103건을 화면에서
   * 영영 못 본다.
   */
  const hasResult = isRun || isDiff || !!result
  // 표로 읽히는 응답인지. 되는 응답에만 단추를 내놓는다 — 안 되는 곳에
  // 있으면 눌러 보고 나서야 안 된다는 걸 안다.
  //
  // useMemo 를 쓰면 안 된다. 이 줄은 위의 `if (!step) return` 아래라
  // 스텝을 고르지 않은 render 에서는 훅이 하나 줄어든다. 다시 고르는
  // 순간 React 가 훅 수가 늘었다며 통째로 죽는다 — 흰 화면.
  const isTbl = result ? !!parseTable(result) : false
  /* 값 뽑기는 SNMP 처럼 구분선 없는 `이름 = 값` 출력도 받는다 — 그쪽이야말로
     정규식을 쓰게 되는 자리다 */
  const isKv = result ? !!anyTable(result) : false
  /** 계측기 응답이면 표로 읽는다. 아니면 null 이고 원문 그대로 나간다 */
  const meterOut = isMeterStep ? parseMeterOutput(result) : null
  const needsSession = (isCmd || isConn || isNet) && kind !== 'instrument'
  const depth = Math.min(Math.max(Number(step.indent) || 0, 0), 4)
  /** 이 스텝이 뽑는 이름 */
  const mine = [
    ...(step.queries ?? []).map((x) => x.var),
    ...(step.extracts ?? []).map((x) => x.var),
  ].filter((x): x is string => !!x)
  /** 반복 방식 — 자료에 '몇 회' 와 '범위' 두 형태가 섞여 있다 */
  const loopByRange = step.forFrom !== undefined && step.forTo !== undefined

  /**
   * 판정 칩 — rules 가 정본. 없으면 옛 type·criteria 를 칩으로 읽어 보여주고,
   * 칩을 처음 고치는 순간 rules 로 굳는다(옛 스텝은 안 고치면 그대로 돈다).
   * 옛 contains 의 콤마는 OR 였지만 칩은 「모두 만족」 이다 — 새 철학(합의).
   */
  const legacyChips = (): JudgeRule[] => {
    const outRules: JudgeRule[] = []
    const c = String(step.criteria ?? step.expected ?? '').trim()
    const t = String(step.type ?? 'contains')
    const split = (s2: string, re: RegExp) => s2.split(re).map((x) => x.trim()).filter(Boolean)
    if (c && t !== 'none' && t !== 'expr') {
      if (t === 'table') outRules.push({ t: 'table', v: c })
      else if (t === 'notcontains')
        outRules.push(...split(c, /,/).map((v) => ({ t: 'not' as const, v })))
      else if (t === 'contains_all')
        outRules.push(...split(c, /\r?\n|,/).map((v) => ({ t: 'has' as const, v })))
      else if (t === 'line') outRules.push({ t: 'has', v: c })
      else outRules.push(...split(c, /,/).map((v) => ({ t: 'has' as const, v })))
    }
    // 옛 「판정에서 뺄 줄」 도 줄제외 칩으로 보인다
    outRules.push(
      ...split(String(step.excludeLines ?? ''), /\r?\n/).map((v) => ({ t: 'skip' as const, v })),
    )
    return outRules
  }
  // rules 밭이 있으면(빈 배열 포함) 그것만 본다 — 지운 칩이 옛 기준에서
  // 되살아나지 않게(지적)
  const chips: JudgeRule[] =
    Array.isArray((step as { rules?: unknown }).rules) ? stepRules(step) : legacyChips()
  // 칩을 처음 고치는 순간 옛 밭(criteria·excludeLines)을 비운다 — 안 비우면
  // 지운 칩이 옛 값에서 판정에 계속 살아남고, 다 지우면 되살아난다(지적)
  /** 캡처·미리보기용 출력 — 줄제외 칩이 적용된 것(판정·캡처와 같은 눈) */
  const capSrc = applySkips(result, { ...step, rules: chips } as TcStep)
  /*
   * 미리보기에 쓸 변수.
   *
   * 반복 안의 캡처는 `${i}` 를 쓴다. 그런데 미리보기는 전역 파라미터만
   * 알고 있어서 「이 응답에서는 안 잡힙니다」 를 띄웠다(사진) — 실제로는
   * 잘 잡히는데 화면만 틀린 말을 한 것이다. 반복 안이면 **1회차**로 본다.
   */
  const pvars: Record<string, string> = { ...gp.values, ...(loopVar ? { [loopVar]: '1' } : {}) }
  const writeChips = (next: JudgeRule[]) =>
    onChange({ rules: next, criteria: '', excludeLines: '' })
  const addChipFrom = (t: 'has' | 'not' | 'skip' | 'skipcol', v: string) => {
    let val = v.trim()
    if (!val) return
    // 시각처럼 매번 변하는 값의 줄제외는 ⏱시각줄 칩으로 — 글자로는
    // 다음 실행과 안 맞아 영원히 못 뺀다(지적)
    if (t === 'skip' && looksLikeTime(val)) val = SKIP_TIME
    if (chips.some((c) => c.t === t && c.v === val)) return
    writeChips([...chips, { t, v: val }])
  }
  /** 블럭 → 변수. 이름은 자동(varN) — 창(prompt)은 파이어폭스에서 막힌다 */
  const addVarFromBlock = (text: string) => {
    const used = new Set([...takenVars, ...mine])
    let name = 'var1'
    for (let n = 1; n < 999; n++) {
      if (!used.has(`var${n}`)) {
        name = `var${n}`
        break
      }
    }
    const esc2 = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    onChange({ queries: [...(step.queries ?? []), { q: `(${esc2})`, var: name }] })
  }

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
        {readOnly && <span className="muted small">가져온 시험 — 보기만 합니다</span>}
        {!readOnly && (
        <>
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
        {/* 들여쓰기가 곧 블록 중첩이다. If·Loop 의 몸통은 여는 줄보다 한 칸
            깊은 줄들이라, 이 값을 못 고치면 블록에 넣고 뺄 수가 없다.
            ⇤ ⇥ 문자는 글꼴에 따라 거의 안 보여서 도형으로 그린다. */}
        <button
          className="btn small sd-ind"
          type="button"
          disabled={depth <= 0}
          title="블록 밖으로 (내어쓰기)"
          aria-label="블록 밖으로"
          onClick={() => onChange({ indent: depth - 1 })}
        >
          <IconOutdent />
        </button>
        <button
          className="btn small sd-ind"
          type="button"
          disabled={depth >= 4}
          title="블록 안으로 (들여쓰기)"
          aria-label="블록 안으로"
          onClick={() => onChange({ indent: depth + 1 })}
        >
          <IconIndent />
        </button>
        {/* 비슷한 명령을 줄줄이 만드는 일이 잦다 — show interface 1 · 2 · 3.
            결과는 안 따라온다. */}
        <button
          className="btn small"
          type="button"
          title="바로 아래에 같은 스텝 하나 더 (결과는 빼고)"
          onClick={onDuplicate}
        >
          복제
        </button>
        <button className="btn small danger" type="button" onClick={onRemove}>
          삭제
        </button>
        </>
        )}
      </div>

      {/* `inert` 는 참·거짓으로 준다 — 빈 글자로 주면 React 19 가 거짓으로
          보고 통째로 빼 버려서 **잠기지 않았다**(지적). 손이 안 닿게 css 로도
          한 번 더 막는다. */}
      <div className={`sd-body${readOnly ? ' sd-ro' : ''}`} inert={readOnly || undefined}>
        {/* 지우지 않고 잠시 빼두는 일이 잦다 */}
        {/*
          「이 스텝 건너뛰기」 와 「설명」 은 여기서 뺐다(지시).

          건너뛰기는 목록에서 줄을 골라 「건너뛰기」 를 누르는 길이 이미
          있다 — 한 줄씩 세부를 열어 켜는 것보다 그쪽이 빠르다.
          설명은 목록에 나오는 한 줄이라 목록에서 고치는 것이 맞다.
        */}
        <label className="sd-f">
          <span>Action</span>
          {/* 새로 고를 수 있는 것만 내놓는다. 이미 저장된 옛 종류
              (Connect·Disconnect·Model·Manual)는 자리를 만들어 살려 둔다 —
              목록에 없는 값을 그냥 두면 칸이 빈 채로 뜨고, 다른 칸을 고치는
              순간 조용히 다른 종류가 된다. 실제 자료에 31건이 있다. */}
          <select value={kind} onChange={(e) => onChange({ kind: e.target.value as StepKind })}>
            {ADD_KINDS.map((k) => (
              <option key={k.k} value={k.k}>
                {k.label}
              </option>
            ))}
            {!ADD_KINDS.some((k) => k.k === kind) && (
              <option value={kind}>{info.label} (옛 방식)</option>
            )}
          </select>
        </label>

        {needsSession && (
          <label className="sd-f">
            {/* ping·SNMP 은 세션으로 접속하는 게 아니라 그 장비의 IP 만
                빌려 쓴다. 같은 'Session' 이라고 적어 두면 CLI 처럼
                세션을 여는 줄로 읽힌다. */}
            <span title={isNet ? '이 장비의 IP 로 보냅니다 (세션을 여는 것이 아닙니다)' : undefined}>
              Session
            </span>
            {/* 자료는 자리 번호(0,1)를 담는다. 화면에는 장비 이름을 보이되
                저장은 번호 그대로 한다 — 옛 화면과 값이 갈리면 안 된다. */}
            <select
              value={sessionIndex(step.session) >= 0 ? String(sessionIndex(step.session)) : ''}
              onChange={(e) =>
                onChange({ session: e.target.value === '' ? '' : Number(e.target.value) })
              }
            >
              <option value="">(없음)</option>
              {/* 자리 번호를 앞에 세운다. 같은 장비를 두 자리에 앉히는 일이
                  흔해서(S1·S2 둘 다 220.1.1.254) 이름만으로는 어느 세션인지
                  알 수 없다 — 목록에 똑같은 줄이 둘 뜬다. */}
              {sessions.map((nm, i) => (
                <option key={i} value={i}>
                  S{i + 1} · {nm}
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
                이 TC 에 등록된 세션이 없습니다 — 위 실행 줄의 「+ 세션」 으로 장비를 넣으세요.
              </span>
            )}
          </label>
        )}

        {/* 종류마다 Test Data 가 가리키는 것이 다르다 */}
        {/* 계측기 — 어느 섀시·어느 포트인지까지 화면에서 정한다 */}
        {kind === 'instrument' && (
          <TcMeterStep
            step={step}
            meterCfg={meterCfg}
            onChange={onChange}
            onGoTraffic={onGoTraffic}
          />
        )}

        {kind === 'cli' && (
          <label className="sd-f">
            <span className="sd-lab">
              {STEP_CONTENT[kind]?.label ?? '보낼 명령'}
              {/* 전역 파라미터를 눌러 넣는다. 손으로 ${이름} 을 치면 오타가
                  나도 실행할 때 가서야 안다. */}
              {paramPick('cli', 'p-cli').btn}
            </span>
            {paramPick('cli', 'p-cli').list}
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
            {preview(step.cli ?? step.data)}
            {STEP_CONTENT[kind]?.hint && (
              <span className="sd-hint">{STEP_CONTENT[kind]?.hint}</span>
            )}
          </label>
        )}
        {/* CLI 로는 못 하는 것들. 세션이 없어도 되지만, 세션을 골라 두면
            그 장비 IP 로 나간다 — 재부팅 중이라 CLI 가 안 붙는 동안
            ping 으로 살아나는지 보는 것이 바로 이 스텝의 쓸모다. */}
        {/* 「대상 IP」 는 ping 에만 앞에 둔다. SNMP 는 비우면 세션 장비라
            평소에 볼 일이 없다 — 「SNMP 접속」 안으로 넣는다(지시: 정리) */}
        {kind === 'ping' && (
          <label className="sd-f">
            <span className="sd-lab">
              대상 IP
              {paramPick('host', 'p-host').btn}
            </span>
            {paramPick('host', 'p-host').list}
            <input
              className="mono"
              value={step.host ?? ''}
              placeholder={sessions.length ? '비우면 세션 장비' : '220.1.1.254'}
              onChange={(e) => onChange({ host: e.target.value })}
            />
            {preview(step.host)}
          </label>
        )}
        {kind === 'ping' && (
          <label className="sd-f">
            <span>보낼 횟수</span>
            <input
              type="number"
              value={step.pingCount ?? ''}
              placeholder="4"
              onChange={(e) => onChange({ pingCount: Number(e.target.value) })}
            />
            <span className="sd-hint">
              <b>판정기준이 있어야 합격·불합격이 납니다.</b> 안 적으면 조회만 합니다 —
              「살아 있으면 합격」 을 보시려면 응답에서 <code>bytes from</code> 같은 글자를
              끌어 「있으면 합격」 칩을 만드세요. (못 부른 것은 기준과 상관없이 불합격입니다)
            </span>
          </label>
        )}
        {(kind === 'snmp_get' || kind === 'snmp_set' || kind === 'snmp_trap') && (
          <label className="sd-f">
            <span className="sd-lab">
              OID
              {/* 1.3.6.1.2.1.1.3.0 을 외우거나 문서를 뒤지게 두지 않는다.
                  MIB 에서 뽑아 둔 이름표에서 골라 넣는다. */}
              <button
                type="button"
                className="sd-pickbtn"
                title="MIB 이름으로 찾기"
                onClick={() => setPick(pick === 'oid' ? '' : 'oid')}
              >
                🔎 이름으로 찾기
              </button>
              {paramPick('oid', 'p-oid').btn}
            </span>
            {paramPick('oid', 'p-oid').list}
            {pick === 'oid' && (
              <PickList
                title="OID 찾기"
                items={oidItems}
                loading={oidQuery.isLoading}
                empty={
                  oidQuery.data?.hint ||
                  (oidQ ? '찾는 이름이 없습니다.' : 'MIB 이름표가 비어 있습니다.')
                }
                onSearch={setOidQ}
                onClose={() => setPick('')}
                onPick={(x) => {
                  onChange({ oid: x.value })
                  setPick('')
                }}
              />
            )}
            <input
              className="mono"
              value={step.oid ?? ''}
              placeholder={kind === 'snmp_trap' ? '비우면 아무 Trap' : '1.3.6.1.2.1.1.3.0'}
              onChange={(e) => onChange({ oid: e.target.value })}
            />
            {preview(step.oid)}
          </label>
        )}
        {kind === 'snmp_set' && (
          <div className="sd-f">
            <span>넣을 값 · 형식</span>
            <div className="sd-row">
              <input
                className="mono"
                value={step.snmpValue ?? ''}
                placeholder="1"
                onChange={(e) => onChange({ snmpValue: e.target.value })}
              />
              {paramPick('snmpValue', 'p-sval').btn}
              <select
                className="sd-narrow2"
                value={step.snmpType ?? ''}
                onChange={(e) => onChange({ snmpType: e.target.value })}
              >
                <option value="">자동</option>
                <option value="i">정수 i</option>
                <option value="s">문자 s</option>
                <option value="u">부호없는 u</option>
                <option value="a">주소 a</option>
              </select>
            </div>
            {paramPick('snmpValue', 'p-sval').list}
            {preview(step.snmpValue)}
          </div>
        )}
        {kind === 'snmp_trap' && (
          <label className="sd-f">
            <span>몇 초까지 기다리는가</span>
            <input
              type="number"
              value={step.trapSec ?? ''}
              placeholder="15"
              onChange={(e) => onChange({ trapSec: Number(e.target.value) })}
            />
            <span className="sd-hint">
              그 안에 Trap 이 오면 합격입니다. 안 오면 불합격 — 「오면 안 되는 것」 을
              볼 때는 판정기준을 반대로 두세요.
            </span>
          </label>
        )}
        {(kind === 'snmp_get' || kind === 'snmp_set') && (
          <details className="sd-more">
            <summary>SNMP 접속 · 대상 IP</summary>
            <label className="sd-f">
              <span>대상 IP</span>
              <input
                className="mono"
                value={step.host ?? ''}
                placeholder={sessions.length ? '비우면 세션 장비' : '220.1.1.254'}
                onChange={(e) => onChange({ host: e.target.value })}
              />
            </label>
            <div className="sd-row">
              <input
                className="mono"
                value={step.community ?? ''}
                placeholder={kind === 'snmp_set' ? 'private' : 'public'}
                onChange={(e) => onChange({ community: e.target.value })}
              />
              <select
                className="sd-narrow2"
                value={step.snmpVersion ?? ''}
                onChange={(e) => onChange({ snmpVersion: e.target.value })}
              >
                <option value="">v2c</option>
                <option value="v1">v1</option>
                <option value="v2c">v2c</option>
              </select>
              <input
                type="number"
                className="sd-narrow"
                value={step.snmpPort ?? ''}
                placeholder="161"
                onChange={(e) => onChange({ snmpPort: Number(e.target.value) })}
              />
            </div>
          </details>
        )}
        {kind === 'diff' && (
          <>
            <div className="sd-f">
              <span className="sd-lab">
                견줄 두 값
                {/* 왼쪽·오른쪽 각각. 한쪽에만 두면 반대쪽은 손으로 쳐야 한다 */}
                <span className="sd-two">
                  {paramPick('cmpLeft', 'p-cl').btn}
                  {paramPick('cmpRight', 'p-cr').btn}
                </span>
              </span>
              {paramPick('cmpLeft', 'p-cl').list}
              {paramPick('cmpRight', 'p-cr').list}
              <div className="sd-row">
                <input
                  className="mono"
                  value={step.cmpLeft ?? ''}
                  placeholder="${var1}"
                  onChange={(e) => onChange({ cmpLeft: e.target.value })}
                />
                <select
                  className="sd-narrow2"
                  value={step.cmpOp || '=='}
                  onChange={(e) => onChange({ cmpOp: e.target.value })}
                >
                  <option value="==">같다</option>
                  <option value="!=">다르다</option>
                  <option value="포함">포함한다</option>
                  <option value=">">크다</option>
                  <option value="<">작다</option>
                  <option value=">=">크거나 같다</option>
                  <option value="<=">작거나 같다</option>
                </select>
                <input
                  className="mono"
                  value={step.cmpRight ?? ''}
                  placeholder="E5924RL"
                  onChange={(e) => onChange({ cmpRight: e.target.value })}
                />
              </div>
              <span className="sd-hint">
                앞 스텝에서 뽑은 값은 <b>{'${이름}'}</b>, 그냥 글자는 그대로 적습니다.
                맞으면 <b>합격</b>, 아니면 <b>불합격</b>입니다.
              </span>
              {/*
                결과에 따라 문구를 남기는 것은 If·Else·Message **넷**을 손으로
                만들고 들여쓰기까지 맞춰야 했다. 누구나 쓰라는 것이 목적인데
                그 넷을 외우게 할 수는 없다(지시) — 한 번에 넣어 준다.
              */}
              {onInsertAfter && (
                <div className="sd-pick">
                  <button
                    className="btn small"
                    type="button"
                    title="이 Diff 뒤에 「틀리면 ⚠ 문구 · 맞으면 정상 문구」 를 만들어 넣습니다"
                    onClick={() => {
                      const d = Number(step.indent ?? 0)
                      const rd = loopVar ? `\${${loopVar}}회째 — ` : ''
                      const L = String(step.cmpLeft ?? '').trim()
                      const R = String(step.cmpRight ?? '').trim()
                      const both = L && R ? ` (${L} · ${R})` : ''
                      onInsertAfter([
                        { kind: 'if', indent: d, condition: "${_verdict_en} == 'FAIL'" },
                        {
                          kind: 'message',
                          indent: d + 1,
                          text: `⚠ ${rd}맞지 않습니다${both}`,
                        },
                        { kind: 'else', indent: d },
                        { kind: 'message', indent: d + 1, text: `${rd}정상입니다${both}` },
                      ])
                    }}
                  >
                    결과 문구 붙이기
                  </button>
                  <span className="muted small">
                    틀리면 ⚠ 한 줄, 맞으면 정상 한 줄을 로그에 남깁니다
                  </span>
                </div>
              )}
            </div>

            {/* running-config 를 견줄 때 uptime·카운터처럼 돌릴 때마다
                달라지는 줄을 안 빼면 늘 다르다고 나온다. */}
            <label className="sd-f">
              <span>견줄 때 뺄 줄</span>
              <textarea
                className="mono"
                rows={2}
                value={step.excludeLines ?? ''}
                placeholder={'uptime\nlast change'}
                onChange={(e) => onChange({ excludeLines: e.target.value })}
              />
              <span className="sd-hint">
                한 줄에 하나. 그 문구가 든 줄은 견줄 때 통째로 뺍니다 — 돌릴 때마다
                달라지는 시각·카운터가 여기 옵니다.
              </span>
            </label>

            {/* 「지금은 합격/불합격」 미리보기는 뺐다 — 실행 중에 생기는
                변수(치환·앞 스텝 캡처)를 몰라 돌리기도 전에 빨간 「불합격」을
                띄웠고, 실행 결과로 오해됐다(사용자 지적). 판정은 ▶ 실행이 한다. */}
          </>
        )}
        {kind === 'map' && (
          <>
            <div className="sd-f">
              <span className="sd-lab">
                바꿀 값
                {paramPick('mapSrc', 'p-msrc').btn}
              </span>
              {paramPick('mapSrc', 'p-msrc').list}
              <input
                className="mono"
                value={step.mapSrc ?? ''}
                placeholder="${var2}"
                onChange={(e) => onChange({ mapSrc: e.target.value })}
              />
            </div>
            <label className="sd-f">
              <span>대응표 — 한 줄에 하나, 왼쪽 = 오른쪽</span>
              <textarea
                className="mono"
                rows={3}
                value={step.mapRules ?? ''}
                placeholder={'enterprises.7800.1.103 = E6100\nenterprises.7800.1.104 = E6100S'}
                onChange={(e) => onChange({ mapRules: e.target.value })}
              />
            </label>
            <label className="sd-f">
              <span>바뀐 값을 담을 변수</span>
              <input
                className="mono"
                value={step.mapVar ?? ''}
                placeholder="var3"
                onChange={(e) => onChange({ mapVar: e.target.value })}
              />
              <span className="sd-hint">
                값 안에 왼쪽 글자가 있으면 전부 오른쪽으로 바뀝니다. 장비로는 아무것도
                안 나가고 판정도 없습니다 — 다음 <b>Diff</b> 스텝에서{' '}
                <b>{'${var1} == ${var3}'}</b> 처럼 견주세요.
              </span>
            </label>
            {/* 돌려보기 전에 지금 값으로 어떻게 되는지 — 이름을 잘못 적으면
                실행할 때 가서야 아는 것을 여기서 미리 보인다 */}
            {(step.mapSrc || '').trim() && (step.mapRules || '').trim()
              ? (() => {
                  const r = applyMapRules(
                    subVars(String(step.mapSrc ?? ''), gp.values),
                    String(step.mapRules ?? ''),
                  )
                  return (
                    <span className="sd-prev">
                      지금 값 <code>{r.out.length > 120 ? `${r.out.slice(0, 120)}…` : r.out}</code>
                      {r.hits.length === 0 && ' — 맞는 규칙이 없어 원본 그대로'}
                    </span>
                  )
                })()
              : null}
          </>
        )}
        {kind === 'if' && (
          <>
            {/*
              If 는 넷이면 된다(지시): Action · 조건(변수·비교·값) ·
              참이면 · 거짓이면. 식을 손으로 쓰거나 갈래를 따로 만들게 하지
              않는다 — 갈래의 말은 이 줄이 그대로 로그에 남긴다.
            */}
            <div className="sd-f">
              <span className="sd-lab">조건</span>
              <div className="sd-row sd-cond3">
                <select
                  value={step.condVar ?? ''}
                  onChange={(e) => {
                    const v = e.target.value
                    onChange({
                      condVar: v,
                      condition: mkCond(v, step.condOp || '==', step.condVal ?? ''),
                    })
                  }}
                >
                  <option value="">변수를 고르세요</option>
                  {[...(loopVar ? [loopVar] : []), '_verdict', '_verdict_en', ...new Set([...takenVars, ...mine])].map(
                    (x) => (
                      <option key={x} value={x}>
                        {'${' + x + '}'}
                      </option>
                    ),
                  )}
                </select>
                <select
                  className="sd-narrow2"
                  value={step.condOp || '=='}
                  onChange={(e) =>
                    onChange({
                      condOp: e.target.value,
                      condition: mkCond(step.condVar ?? '', e.target.value, step.condVal ?? ''),
                    })
                  }
                >
                  <option value="==">같다</option>
                  <option value="!=">다르다</option>
                  <option value="포함">포함한다</option>
                  <option value=">">크다</option>
                  <option value="<">작다</option>
                  <option value=">=">크거나 같다</option>
                  <option value="<=">작거나 같다</option>
                </select>
                <input
                  className="mono"
                  value={step.condVal ?? ''}
                  placeholder="견줄 값"
                  onChange={(e) =>
                    onChange({
                      condVal: e.target.value,
                      condition: mkCond(step.condVar ?? '', step.condOp || '==', e.target.value),
                    })
                  }
                />
              </div>
            </div>

            {/* 네 줄로 편다(지시) — 남길 말과 갈 자리를 갈래마다 한 줄씩 */}
            <div className="sd-f">
              <span className="sd-lab">참이면</span>
              <input
                className="sd-say yes"
                value={step.msgYes ?? ''}
                placeholder="정상입니다"
                onChange={(e) => onChange({ msgYes: e.target.value })}
              />
            </div>
            <div className="sd-f">
              <span className="sd-lab">참이면 이동</span>
              <select
                className="sd-goto yes"
                value={step.gotoYes ?? ''}
                onChange={(e) =>
                  onChange({ gotoYes: e.target.value === '' ? undefined : Number(e.target.value) })
                }
              >
                <option value="">다음 줄로</option>
                {(stepList ?? []).map((x) => (
                  <option key={x.i} value={x.i}>
                    → {x.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="sd-f">
              <span className="sd-lab">거짓이면</span>
              <input
                className="sd-say no"
                value={step.msgNo ?? ''}
                placeholder="부적합입니다"
                onChange={(e) => onChange({ msgNo: e.target.value })}
              />
            </div>
            <div className="sd-f">
              <span className="sd-lab">거짓이면 이동</span>
              <select
                className="sd-goto no"
                value={step.gotoNo ?? ''}
                onChange={(e) =>
                  onChange({ gotoNo: e.target.value === '' ? undefined : Number(e.target.value) })
                }
              >
                <option value="">다음 줄로</option>
                {(stepList ?? []).map((x) => (
                  <option key={x.i} value={x.i}>
                    → {x.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
        {kind === 'switch' && (
          <>
            <label className="sd-f">
              <span>기준 값</span>
              <input
                className="mono"
                value={step.switchExpr ?? ''}
                placeholder="${model}"
                onChange={(e) => onChange({ switchExpr: e.target.value })}
              />
            </label>
            <div className="sd-blk warn">
              Switch 는 아직 <b>실행하지 않는다</b>. 자료에 남은 것이 없어 갈래를 어떻게
              적었는지 확인할 수 없었다 — 돌리면 블록째 건너뛰고 로그에 남긴다.
            </div>
          </>
        )}
        {kind === 'loop' && (
          <>
            {/* 몸통이 비었다.
                반복의 몸통은 들여쓴 줄로 정해진다. 그걸 모르면 빈 것을
                N번 돌고 아래 줄은 한 번만 돈다 — 그러고도 아무 말이
                없어서 N번 돈 줄 알고 결과를 읽게 된다. */}
            {block?.empty && (
              <div className="sd-warn">
                <b>이 반복 안에 든 스텝이 없습니다.</b>
                <span>
                  아래 줄을 <b>「→」</b> 로 들여써야 반복 안에 들어갑니다. 지금 그대로 돌리면
                  아무것도 반복되지 않고 아래 줄은 한 번만 돕니다.
                </span>
                {block.after > 0 && (
                  <div className="sd-warn-act">
                    {[1, 2, 3, 5].
                      filter((n) => n <= block.after).
                      map((n) => (
                        <button
                          key={n}
                          className="btn small"
                          type="button"
                          onClick={() => block.wrap(n)}
                        >
                          아래 {n}줄 넣기
                        </button>
                      ))}
                    {block.after > 5 && (
                      <button className="btn small" type="button" onClick={() => block.wrap(block.after)}>
                        아래 {block.after}줄 전부
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            <div className="sd-f">
              <span>반복 방식</span>
              <div className="seg sd-seg">
                <button
                  type="button"
                  className={`seg-btn${loopByRange ? '' : ' on'}`}
                  onClick={() =>
                    onChange({
                      forFrom: undefined,
                      forTo: undefined,
                      loopCount: step.loopCount ?? 3,
                    })
                  }
                >
                  몇 회
                </button>
                <button
                  type="button"
                  className={`seg-btn${loopByRange ? ' on' : ''}`}
                  onClick={() =>
                    onChange({
                      forFrom: step.forFrom ?? 1,
                      forTo: step.forTo ?? 24,
                      loopVar: step.loopVar || 'i',
                    })
                  }
                >
                  범위 (포트 번호 …)
                </button>
              </div>
            </div>

            {loopByRange ? (
              <div className="sd-f">
                <span>범위 · 증가 · 담을 변수</span>
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
                    type="number"
                    className="sd-narrow"
                    value={step.forStep ?? ''}
                    placeholder="+1"
                    title="증가 폭"
                    onChange={(e) => onChange({ forStep: Number(e.target.value) })}
                  />
                  <input
                    className="mono"
                    value={step.loopVar ?? ''}
                    placeholder="i"
                    onChange={(e) => onChange({ loopVar: e.target.value })}
                  />
                </div>
                <span className="sd-hint">
                  몸통에서 <b>{'${' + (step.loopVar || 'i') + '}'}</b> 로 지금 회차 값을 쓴다.
                  예: <code>show interface gi0/{'${' + (step.loopVar || 'i') + '}'}</code>
                </span>
              </div>
            ) : (
              <label className="sd-f">
                <span>횟수</span>
                <input
                  type="number"
                  value={step.loopCount ?? ''}
                  placeholder="3"
                  onChange={(e) => onChange({ loopCount: Number(e.target.value) })}
                />
              </label>
            )}
            <div className="sd-blk">
              이 아래로 <b>한 칸 더 들여쓴 줄</b>이 반복 몸통이다. 머리의 ⇥ 로 넣는다.
            </div>
          </>
        )}
        {kind === 'model' && (
          <label className="sd-f">
            <span>모델 이름</span>
            <input
              value={step.modelName ?? step.model ?? ''}
              placeholder="E6100"
              onChange={(e) => onChange({ modelName: e.target.value })}
            />
          </label>
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
        {/* Comment 와 Message 는 저장 칸(text)이 같지만 하는 일이 다르다.
            Comment 는 실행할 때 아무 일도 안 하고, Message 는 로그에 찍힌다.
            같은 라벨을 달아 두면 무엇을 쓰는 칸인지 알 수 없다. */}
        {isNoteKind(kind) && (
          <label className="sd-f">
            <span>{STEP_CONTENT[kind]?.label ?? '내용'}</span>
            <textarea
              rows={2}
              value={step.text ?? step.desc ?? ''}
              placeholder={
                kind === 'comment'
                  ? '예) 여기부터 VLAN 설정을 확인한다'
                  : '예) ${i}회째 진행 결과는 ${_verdict} 입니다'
              }
              onChange={(e) => onChange({ text: e.target.value })}
            />
            <span className="sd-hint">{STEP_CONTENT[kind]?.hint}</span>
            {/* 회차와 판정을 찍고 싶다는 요구(지시) — 쓸 수 있는 것을 적어 둔다.
                모르면 「메시지에 무엇을 쓸 수 있나」 를 물어볼 데가 없다. */}
            {kind === 'message' && (
              <span className="sd-hint">
                넣을 수 있는 값:{' '}
                {loopVar && (
                  <>
                    <b>{'${' + loopVar + '}'}</b> 지금 회차 ·{' '}
                  </>
                )}
                <b>{'${_verdict}'}</b> 바로 앞 스텝이 합격인지 불합격인지 · 뽑아 둔 변수(
                <b>{'${cli_port}'}</b> 같은 것)
              </span>
            )}
          </label>
        )}
        {kind === 'manual' && (
          <>
            <label className="sd-f">
              <span>사람이 할 일</span>
              {/* 여기 적히는 것은 명령이 아니라 사람의 일이다. input 으로
                  두었더니 명령처럼 보여서 실행기가 장비로 보내고 있었다. */}
              <textarea
                rows={2}
                value={step.data ?? ''}
                placeholder="예) 장비 전원을 내렸다가 30초 뒤 다시 올린다"
                onChange={(e) => onChange({ data: e.target.value })}
              />
              <span className="sd-hint">
                이 스텝은 장비로 나가지 않습니다. 돌린 뒤 아래에서 직접 찍으세요.
              </span>
            </label>

            {/* 자동으로 판정할 수 없는 스텝이라 사람이 찍는다. 이것이 없으면
                수동 절차가 든 시험은 영영 '미실행' 으로 남는다. */}
            <div className="sd-f">
              <span>직접 판정</span>
              <div className="sd-row">
                <button
                  className={`btn small${verdict === 'PASS' ? ' primary' : ''}`}
                  type="button"
                  onClick={() =>
                    onChange({
                      status: 'PASS',
                      repeatResult: 'Pass',
                      executed_at: new Date().toISOString(),
                    })
                  }
                >
                  합격
                </button>
                <button
                  className={`btn small${verdict === 'FAIL' ? ' danger' : ''}`}
                  type="button"
                  onClick={() =>
                    onChange({
                      status: 'FAIL',
                      repeatResult: 'Fail',
                      executed_at: new Date().toISOString(),
                    })
                  }
                >
                  불합격
                </button>
                <button
                  className="btn small"
                  type="button"
                  disabled={!verdict}
                  onClick={() => onChange({ status: '', repeatResult: '' })}
                >
                  지움
                </button>
                {step.executed_at && (
                  <span className="muted small">
                    {step.executed_at.slice(0, 16).replace('T', ' ')}
                  </span>
                )}
              </div>
            </div>
          </>
        )}

        {/* 판정은 실행하는 스텝에만 둔다.
            고르는 값은 `type` 이다 — critMode 는 '라인 선택' 같은 표시용
            이름이라 거기에 contains 를 써 넣으면 옛 화면 배지가 깨진다. */}
        {/* 판정 기준 — 종류 드롭다운 없음(합의). 칩을 쌓으면 판정이 정해진다:
            모든 칩 만족 = 합격 · 하나라도 어긋남 = 불합격 · 칩 없음 = 조회만 */}
        {isRun && !isMeterStep && (
          <div className="sd-f">
            <span className="sd-lab">
              판정 기준
              {/* 전역 파라미터와 비교(지적) — 골라서 「있어야 \${이름}」 칩으로.
                  실행할 때 실제 값으로 바뀌어 응답과 비교된다 */}
              <button
                type="button"
                className="sd-pickbtn"
                title="전역 파라미터를 판정 기준으로 — 있어야 ${이름} 칩이 됩니다"
                onClick={() => setPick(pick === 'p-crit' ? '' : 'p-crit')}
              >
                {'${ } 기준 넣기'}
              </button>
            </span>
            {pick === 'p-crit' ? (
              <ParamPicker
                items={gp.items}
                values={gp.values}
                loading={gp.loading}
                empty={gp.empty}
                onClose={() => setPick('')}
                onPick={(x) => {
                  addChipFrom('has', x.value)
                  setPick('')
                }}
              />
            ) : null}
            <div className="sd-chips">
              {chips.map((c, n) => (
                <span
                  key={n}
                  className={`sd-chip ${c.t}`}
                  title={c.v.includes('$') ? `지금 값: ${subVars(c.v, gp.values)}` : undefined}
                >
                  <i>
                    {c.t === 'has' ? '있어야' : c.t === 'not' ? '없어야' : c.t === 'skip' ? '줄제외' : c.t === 'skipcol' ? '열제외' : '표'}
                  </i>
                  {c.v}
                  <button
                    type="button"
                    title="이 기준 빼기"
                    onClick={() => writeChips(chips.filter((_, j) => j !== n))}
                  >
                    ×
                  </button>
                </span>
              ))}
              {!chips.length && (
                <span className="muted small">없으면 판정하지 않습니다</span>
              )}
            </div>
            {/* 직접 입력칸은 뺐다(지적 ×2) — 기준은 블럭 클릭·글자 끌기로만.
                응답에 없는 문구가 필요한 드문 경우는 아직 없다는 판단(합의) */}
            {/* 여기 있던 「표에서 고르기」 는 뺐다(지시) — 출력 바로 위의
                「표로 판정 만들기」 와 **같은 판**이다. 같은 것을 두 군데
                두면 어느 것을 눌렀는지에 따라 다른 줄 알게 된다. */}
            {String(step.type) === 'expr' && String(step.criteria ?? '').trim() && !stepRules(step).length && (
              <span className="sd-hint">
                옛 값비교 기준 <code>{String(step.criteria)}</code> 로 판정 중 — 값끼리 견주는
                것은 이제 <b>Diff 스텝</b>을 쓰세요.
              </span>
            )}
          </div>
        )}

        {/* 응답에서 뽑아둔 변수. 정규식이 그대로 보이면 무섭게 보이므로
            변수 이름을 앞에 세운다. */}
        {/* 뽑은 값.
            이름만 보이면 그 식이 무엇을 집고 있는지 돌려보기 전에는 알 수
            없다. 지금 응답에 대 보고 실제로 뽑히는 값을 함께 적는다. */}
        {(step.queries?.length || step.extracts?.length) ? (
          <div className="sd-f">
            <span>뽑은 값</span>
            <div className="sd-vlist">
              {[
                ...(step.queries ?? []).map((x, i) => ({
                  key: `q${i}`,
                  name: x.var,
                  rule: x.q,
                  /* 표에서 뽑은 것은 식이 아니라 **말**로 보여 준다 —
                     「Port=Te0/${i} 행의 Name 칸」. 정규식이 아니니 정규식처럼
                     보일 이유가 없다 */
                  tbl: x.col ? { col: x.col, where: x.where ?? '', row: x.row ?? '' } : null,
                  drop: () =>
                    onChange({ queries: (step.queries ?? []).filter((_, j) => j !== i) }),
                })),
                ...(step.extracts ?? []).map((x, i) => ({
                  key: `x${i}`,
                  name: x.var,
                  rule: x.rule,
                  tbl: null as { col: string; where: string; row: string } | null,
                  drop: () =>
                    onChange({ extracts: (step.extracts ?? []).filter((_, j) => j !== i) }),
                })),
              ].map((v) => {
                const got = v.tbl
                  ? tableCapture(capSrc, v.tbl, pvars)
                  : v.rule
                    ? extractOne(subVars(v.rule, pvars), capSrc)
                    : null
                return (
                  <div className="sd-vrow" key={v.key}>
                    <span className="sd-var">${v.name || '?'}</span>
                    {v.name && takenVars.includes(v.name) && (
                      <b className="sd-vdup" title="다른 스텝도 이 이름을 뽑습니다 — 뒤엣것이 앞엣것을 덮습니다">
                        겹침
                      </b>
                    )}
                    <span className={`sd-vval${got == null ? ' none' : ''}`}>
                      {result
                        ? got == null
                          ? loopVar
                            ? `1회차(${'${' + loopVar + '}'}=1) 로는 안 잡힙니다`
                            : '이 응답에서는 안 잡힙니다'
                          : got || '(빈 값)'
                        : '아직 실행 전'}
                    </span>
                    <code
                      className="sd-vrule"
                      title={
                        v.tbl
                          ? '표에서 뽑기 — 열 이름으로 찾으므로 칸 폭이 바뀌어도 안 깨집니다'
                          : (v.rule ?? '')
                      }
                    >
                      {v.tbl
                        ? `${v.tbl.where || (v.tbl.row ? `${v.tbl.row}번째 줄` : '첫 줄')} 행의 ${v.tbl.col} 칸`
                        : v.rule}
                    </code>
                    <button type="button" className="if-x" aria-label="지우기" onClick={v.drop}>
                      ×
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}

        {/* 「세부」 접기는 없앴다(지적: 왜 있나 ×2). 판정 영역·제외 줄·
            tailWait·메모는 자료에 남아 있으면 그대로 동작하지만, 화면은
            칩·블럭 흐름 하나로 간다 — 간단하게(합의). */}

        {hasResult && (
          <>
            <div className="sd-rlab">
              {/* 시각은 「Result」 바로 옆이다(지시) — 오른쪽 끝에 떨어져 있으면
                  이 출력이 언제 것인지와 「Result」 가 따로 논다 */}
              <span>
                Result
                {step.executed_at
                  ? ` - ${step.executed_at.slice(0, 16).replace('T', ' ')}`
                  : ''}
              </span>
              {verdict && <b className={`status ${verdict.toLowerCase()}`}>{verdict}</b>}
              {/* 「판정기준 없음」 은 Result 가 아니라 **판정 기준** 쪽 말이다(지시).
                  결과 자리에 두면 무언가 결과가 난 것처럼 읽힌다 */}
              {step.reason && !String(step.reason).startsWith('판정기준 없음') && (
                <span className="sd-why">{step.reason}</span>
              )}
              <span className="sp" />
              {/* 「이 스텝 실행」 은 뺐다(지시) — 목록의 줄마다 ▶ 가 이미 있다 */}
            </div>

            {/* 회차 — 반복 안의 스텝은 회차마다 결과가 다르다.
                「10회 모두 적합」 만 적으면 몇 회차에 어떻게 깨졌는지 다시
                못 찾는다. 그게 반복 시험에서 유일하게 궁금한 것이다.
                사이클 화면과 같은 모양을 쓴다 — 오갈 때 눈이 안 헤맨다. */}
            {(step.rounds?.length ?? 0) > 1 && (
              <div className="sd-rounds-wrap">
                <span className="sd-rlab-i">회차</span>
                <div className="sc-rounds">
                  {(step.rounds ?? []).map((rd) => {
                    const rbad = String(rd.status ?? '').toUpperCase() === 'FAIL'
                    const on = round === rd.n
                    return (
                      <button
                        key={rd.n}
                        type="button"
                        className={`sc-round${rbad ? ' bad' : ''}${on ? ' on' : ''}`}
                        title={rd.reason || ''}
                        onClick={() => setRound(on ? 0 : rd.n)}
                      >
                        {rd.n}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            {(() => {
              const rd = (step.rounds ?? []).find((x) => x.n === round)
              if (!rd) return null
              return (
                <div className="sd-round-det">
                  <div className="sd-rlab">
                    <b>{rd.n}회차</b>
                    {rd.status && (
                      <span className={`status ${rd.status.toLowerCase()}`}>{rd.status}</span>
                    )}
                    {rd.reason && <span className="sd-why">{rd.reason}</span>}
                  </div>
                  {rd.output ? (
                    <pre className="sd-res">{rd.output}</pre>
                  ) : (
                    <div className="muted small">
                      {rd.trimmed
                        ? '이 회차의 출력은 너무 커서 남기지 않았습니다 — 깨진 회차는 그대로 있습니다.'
                        : '이 회차의 출력이 없습니다.'}
                    </div>
                  )}
                </div>
              )
            })()}
            {result && capOpen ? (
              <TcTable
                text={result}
                mode="capture"
                takenVars={[...takenVars, ...mine]}
                loopVar={loopVar}
                onClose={() => setCapOpen(false)}
                onApply={() => setCapOpen(false)}
                onCapture={(q) => {
                  /* 같은 이름이 이미 있으면 갈아 끼운다 — 두 벌이 되면
                     뒤엣것이 앞엣것을 조용히 덮어써서 왜 값이 다른지 모른다 */
                  const keep = (step.queries ?? []).filter((x) => x.var !== q.var)
                  onChange({ queries: [...keep, { var: q.var, col: q.col, where: q.where }] })
                  setCapOpen(false)
                }}
              />
            ) : result && tblOpen ? (
              <TcTable
                text={result}
                criteria={chips.find((x) => x.t === 'table')?.v ?? ''}
                loopVar={loopVar}
                onClose={() => setTblOpen(false)}
                onApply={(c) => {
                  // 표 기준도 칩이다 — 표 칩은 하나만 두고 갈아 끼운다
                  writeChips([...chips.filter((x) => x.t !== 'table'), { t: 'table', v: c }])
                  setTblOpen(false)
                }}
              />
            ) : result ? (
              <>
                {/*
                  계측기 응답은 표로 보여준다.

                  날 JSON 으로 두었더니 무엇이 왔는지는 알 수 있어도
                  「스트림 2번이 하나도 못 받았다」 를 읽으려면 중괄호를
                  세어야 했다. Traffic 탭과 **같은 부품**을 쓴다 — 두 벌로
                  두면 한쪽만 고치게 되고, 같은 측정이 화면마다 달라진다.

                  원문은 접어서 남긴다. 못 읽었다고 감추면 그때야말로
                  아무것도 모른다.
                */}
                {/* 만드는 단추는 **출력 바로 위**에 둔다(지시). 아래에 두면
                    긴 출력을 다 지나 내려가야 보인다 — 정작 누를 것은 표를
                    보는 그 자리에서 누른다. */}
                <div className="sd-pick">
                  {/* 표 응답은 끌어서 고를 것이 아니다. `show int status` 를
                      contains 로 보면 28포트 중 아무 줄의 connected 나 걸려서
                      하나만 죽어도 합격이 나온다. */}
                  {isTbl && (
                    <button
                      className="btn small primary"
                      type="button"
                      onClick={() => setTblOpen(true)}
                    >
                      표로 판정 만들기
                    </button>
                  )}
                  {/* 정규식을 손으로 쓰라고 하면 아무도 안 쓴다(지적).
                      표에서 칸을 누르면 「어느 열, 어느 행」 으로 적어 둔다 —
                      iTest 의 Response Map 이 하는 일이 이것이다. */}
                  {isKv && (
                    <button
                      className="btn small"
                      type="button"
                      title="표에서 칸을 눌러 그 값을 변수로 담습니다 — 정규식 없이"
                      onClick={() => setCapOpen(true)}
                    >
                      표에서 값 뽑기
                    </button>
                  )}
                  {/* 응답 전체를 담는다. 글자를 끌어야만 되면 긴 출력을
                      통째로 쓰고 싶을 때 방법이 없다 — 다음 스텝에서
                      이번 출력과 견주는 시험이 그것이다. */}
                  <button
                    className="btn small"
                    type="button"
                    onClick={() => {
                      const used = new Set([...takenVars, ...mine])
                      let seed = 'out1'
                      for (let n = 1; n < 999; n++) {
                        if (!used.has(`out${n}`)) {
                          seed = `out${n}`
                          break
                        }
                      }
                      const name = window.prompt('변수 이름 (응답 전체를 담습니다)', seed)
                      if (!name) return
                      if (used.has(name.trim())) {
                        window.alert(`「${name.trim()}」 은 이 시험에서 이미 쓰고 있습니다.`)
                        return
                      }
                      onChange({
                        queries: [
                          ...(step.queries ?? []),
                          // 무엇이든 통째로 잡는 식
                          { q: '([\\s\\S]*)', var: name.trim() },
                        ],
                      })
                    }}
                  >
                    전체를 변수로
                  </button>
                  {picked ? (
                    <>
                      <span className="sd-var">{picked.length > 28 ? `${picked.slice(0, 28)}…` : picked}</span>
                      {/* 끌어 고른 글자도 블럭과 같은 세 가지뿐(합의: 간단하게).
                          변수 이름은 자동(varN) — prompt 창은 파이어폭스가 막는다 */}
                      <button
                        className="btn small"
                        type="button"
                        onClick={() => {
                          addVarFromBlock(picked)
                          setPicked('')
                        }}
                      >
                        변수로
                      </button>
                      <button
                        className="btn small"
                        type="button"
                        onClick={() => {
                          addChipFrom('has', picked)
                          setPicked('')
                        }}
                      >
                        있으면 합격
                      </button>
                      <button
                        className="btn small"
                        type="button"
                        onClick={() => {
                          addChipFrom('not', picked)
                          setPicked('')
                        }}
                      >
                        있으면 불합격
                      </button>
                      <button
                        className="btn small"
                        type="button"
                        title="고른 줄들을 판정에서 뺍니다"
                        onClick={() => {
                          const ls = picked.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)
                          const have = new Set(chips.filter((x) => x.t === 'skip').map((x) => x.v))
                          const add = ls
                            .map((v) => (looksLikeTime(v) ? SKIP_TIME : v))
                            .filter((v, i2, arr) => !have.has(v) && arr.indexOf(v) === i2)
                            .map((v) => ({ t: 'skip' as const, v }))
                          if (add.length) writeChips([...chips, ...add])
                          setPicked('')
                        }}
                      >
                        이 줄 제외
                      </button>
                    </>
                  ) : (
                    <span className="muted small">
                      네모 친 값을 누르거나 글자를 끌어 기준·변수를 만듭니다 — 칩이 모두
                      맞아야 합격, 대소문자는 안 가립니다
                    </span>
                  )}
                </div>
                {meterOut ? (
                  <>
                    <MeterStats
                      rows={meterOut.rows}
                      streams={meterCfg?.streams}
                      keys={meterOut.keys}
                      /* 칸을 누르면 그 자리가 판정 규칙이 된다.
                         열 이름과 스트림 번호를 손으로 적게 하면 오타가
                         나고, 오타는 돌려 봐야 안다. 본 것을 그대로 누른다.
                         비교는 「이상」 으로, 값은 지금 값으로 채워 둔다 —
                         대개 「이만큼은 나와야 한다」 를 적으려는 것이다. */
                      onPickCell={
                        step.meterAct === 'traffic_stat'
                          ? (field, idx, value) => {
                              const rules = [...(step.meterRules ?? [])]
                              // 같은 칸을 또 누르면 늘리지 않고 값만 새로 잡는다
                              const at = rules.findIndex(
                                (r) => r.field === field && r.idx === idx,
                              )
                              const next = { field, idx, op: '>=' as const, value }
                              if (at >= 0) rules[at] = { ...rules[at], ...next }
                              else rules.push(next)
                              onChange({ meterJudge: 'rule', meterRules: rules })
                            }
                          : undefined
                      }
                    />
                    <details className="sd-more sd-rawout">
                      <summary>계측기가 답한 그대로</summary>
                      <pre className="sd-res" onMouseUp={grab}>
                        {result}
                      </pre>
                    </details>
                  </>
                ) : (
                /* onMouseUp 으로 잡는 이유: onSelect 는 pre 에서 안 뜬다 */
                <pre className="sd-res" onMouseUp={grab}>
                  <BlockText
                    text={result}
                    onBlock={(v, x, y, kind) => setBlockAt({ v, x, y, kind })}
                    markOf={(v) => {
                      // 지정된 블럭 표시 — 기준 칩(초록/빨강)·변수(노랑)
                      if (chips.some((c) => c.t === 'has' && c.v === v)) return 'has'
                      if (chips.some((c) => c.t === 'not' && c.v === v)) return 'not'
                      const esc3 = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                      const qs = [
                        ...(step.queries ?? []).map((x) => x.q),
                        ...(step.extracts ?? []).map((x) => x.rule),
                      ]
                      if (qs.some((q) => q === `(${esc3})`)) return 'var'
                      return null
                    }}
                    dim={(ln) => {
                      const timeChip = (v: string) => v === SKIP_TIME || looksLikeTime(v)
                      const subs = chips.filter((c) => c.t === 'skip' && !timeChip(c.v))
                      if (subs.some((c) => ln.includes(c.v))) return true
                      return (
                        chips.some((c) => c.t === 'skip' && timeChip(c.v)) && isTimeLine(ln)
                      )
                    }}
                  />
                </pre>
                )}
                {/* 블럭 메뉴 — 블럭을 누르면 이 셋이 전부다(합의: 간단하게).
                    고정 좌표 팝업 — absolute 는 환경 따라 잘린다 */}
                {blockAt && (
                  <>
                    <div className="sd-bmenu-back" onClick={() => setBlockAt(null)} />
                    <div
                      className="sd-bmenu"
                      role="menu"
                      style={{
                        left: Math.min(blockAt.x, window.innerWidth - 190),
                        top: Math.min(blockAt.y + 8, window.innerHeight - 150),
                      }}
                    >
                      <b>{blockAt.v.length > 34 ? `${blockAt.v.slice(0, 34)}…` : blockAt.v}</b>
                      {blockAt.kind === 'col' ? (
                        <button
                          type="button"
                          title="이 열(세로 영역)을 캡처·판정에서 뺍니다 — 매번 변하는 Uptime 열 같은 것"
                          onClick={() => {
                            addChipFrom('skipcol', blockAt.v)
                            setBlockAt(null)
                          }}
                        >
                          이 열 제외 (캡처·판정)
                        </button>
                      ) : (
                      <>
                      <button
                        type="button"
                        onClick={() => {
                          addVarFromBlock(blockAt.v)
                          setBlockAt(null)
                        }}
                      >
                        변수로 담기
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          addChipFrom('has', blockAt.v)
                          setBlockAt(null)
                        }}
                      >
                        있으면 합격
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          addChipFrom('not', blockAt.v)
                          setBlockAt(null)
                        }}
                      >
                        있으면 불합격
                      </button>
                      <button
                        type="button"
                        title="이 값이 든 줄을 판정에서 뺍니다 — 매번 변하는 시각·카운터"
                        onClick={() => {
                          addChipFrom('skip', blockAt.v)
                          setBlockAt(null)
                        }}
                      >
                        이 값 든 줄 제외
                      </button>
                      </>
                      )}
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="sd-res empty-res">
                아직 실행하지 않았습니다.
                {onRun && ' 목록에서 이 줄의 ▶ 를 누르면 실제 응답이 여기 나옵니다.'}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
