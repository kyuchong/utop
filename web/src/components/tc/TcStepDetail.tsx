import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { IconIndent, IconOutdent } from '../icons'
import { evalCondWhy, extractOne, JUDGE_TYPES, parseTable, subVars } from './judge'
import TcTable from './TcTable'
import ParamPicker from './ParamPicker'
import PickList, { type PickItem } from './PickList'
import {
  ADD_KINDS,
  isNoteKind,
  sessionIndex,
  STEP_CONTENT,
  stepKindInfo,
  stepResult,
  stepStatus,
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
}: Props) {
  const [picked, setPicked] = useState('')
  const [tblOpen, setTblOpen] = useState(false)
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
  const needsSession = isCmd || isConn || isNet
  const depth = Math.min(Math.max(Number(step.indent) || 0, 0), 4)
  /** 이 스텝이 뽑는 이름 */
  const mine = [
    ...(step.queries ?? []).map((x) => x.var),
    ...(step.extracts ?? []).map((x) => x.var),
  ].filter((x): x is string => !!x)
  /** 반복 방식 — 자료에 '몇 회' 와 '범위' 두 형태가 섞여 있다 */
  const loopByRange = step.forFrom !== undefined && step.forTo !== undefined

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
      </div>

      <div className="sd-body">
        {/* 지우지 않고 잠시 빼두는 일이 잦다 */}
        <label className="sd-chk">
          <input
            type="checkbox"
            checked={!!step.skip}
            onChange={(e) => onChange({ skip: e.target.checked })}
          />
          이 스텝 건너뛰기
        </label>

        {/* 사람이 읽는 한 줄. 세부에 묻어 두었더니 있는 줄도 몰랐다 —
            목록에서 이 줄이 무엇인지 알려주는 것이라 맨 위가 맞다. */}
        <label className="sd-f">
          <span>설명</span>
          <input
            value={step.step ?? ''}
            placeholder="이 스텝을 한마디로 (선택) — 목록에 함께 보입니다"
            onChange={(e) => onChange({ step: e.target.value })}
          />
        </label>

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
            <span>{isNet ? 'Session — 이 장비의 IP 로 보냅니다' : 'Session'}</span>
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
        {(kind === 'cli' || kind === 'instrument') && (
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
        {isNet && (
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
              판정기준을 안 적으면 <b>응답이 오면 합격</b>입니다. 재부팅 뒤 살아나는지
              볼 때는 그것으로 충분합니다.
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
            <summary>SNMP 접속</summary>
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
                맞으면 <b>합격</b>, 아니면 <b>불합격</b>입니다. 장비로는 아무것도 안 나갑니다.
                <br />
                여러 줄짜리끼리 견주면 <b>어느 줄이 다른지</b> 보여줍니다.
              </span>
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

            {/* 돌려보기 전에 지금 값으로 어떻게 되는지 */}
            {(step.cmpLeft || step.cmpRight) &&
              (() => {
                const r = evalCondWhy(
                  `${step.cmpLeft ?? ''} ${step.cmpOp || '=='} ${step.cmpRight ?? ''}`,
                  gp.values,
                )
                return (
                  <span className={`sd-cond${r.ok ? ' yes' : ' no'}`}>
                    지금은 <b>{r.ok ? '합격' : '불합격'}</b> — {r.why}
                  </span>
                )
              })()}
          </>
        )}
        {kind === 'if' && (
          <>
            <label className="sd-f">
              <span className="sd-lab">
                조건 — 참일 때만 아래 블록을 돈다
                {paramPick('condition', 'p-cond').btn}
              </span>
              {paramPick('condition', 'p-cond').list}
              <input
                className="mono"
                value={step.condition ?? ''}
                placeholder="${model} == 'U9532H'"
                onChange={(e) => onChange({ condition: e.target.value })}
              />
              {preview(step.condition)}
              {/* 지금 값으로 견주면 어떻게 되는지. 돌려보기 전에 알아야
                  '늘 참인 조건' 을 안 만든다. */}
              {String(step.condition ?? '').trim() &&
                (() => {
                  const r = evalCondWhy(String(step.condition), gp.values)
                  return (
                    <span className={`sd-cond${r.ok ? ' yes' : ' no'}`}>
                      지금은 <b>{r.ok ? '참' : '거짓'}</b> — {r.why}
                    </span>
                  )
                })()}
              <span className="sd-hint">
                쓸 수 있는 것: <b>== != &gt; &lt; &gt;= &lt;= 포함</b>. 앞 스텝에서 뽑은 값은
                <b> {'${이름}'}</b> 으로 넣는다. 숫자끼리면 숫자로 견준다.
              </span>
            </label>
            {/* If 는 본래 흐름을 가르는 줄이라 합격·불합격을 안 낸다.
                그런데 조건을 그대로 판정으로 쓰고 싶을 때가 있다 —
                '모델이 E5924RL 이어야 한다' 처럼. */}
            <label className="sd-chk">
              <input
                type="checkbox"
                checked={!!step.assertIf}
                onChange={(e) => onChange({ assertIf: e.target.checked })}
              />
              조건이 거짓이면 <b>불합격</b>으로 본다
            </label>

            <div className="sd-blk">
              이 아래로 <b>한 칸 더 들여쓴 줄</b>이 If 의 몸통이다. 머리의 ⇥ 로 넣는다.
              {!step.assertIf && (
                <>
                  <br />
                  If 는 갈래를 고를 뿐이라 그 자체로는 합격·불합격을 내지 않는다 —
                  돌리고 나면 줄 끝에 <b>참·거짓</b>만 적힌다.
                </>
              )}
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
                  : '예) ${model} 재부팅 완료 — 링크 확인 시작'
              }
              onChange={(e) => onChange({ text: e.target.value })}
            />
            <span className="sd-hint">{STEP_CONTENT[kind]?.hint}</span>
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
        {isRun && (
          <div className="sd-f">
            <span className="sd-lab">
              Expected
              {paramPick('criteria', 'p-crit').btn}
            </span>
            {paramPick('criteria', 'p-crit').list}
            <div className="sd-row">
              <select
                className="sd-crit"
                value={String(step.type ?? 'contains')}
                onChange={(e) => onChange({ type: e.target.value })}
              >
                {JUDGE_TYPES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
                {/* 옛 자료에 있는 종류(diff·table·expr…)를 고른 채로 두면
                    목록에 없어서 조용히 contains 로 바뀐다. 자리를 만든다. */}
                {step.type && !JUDGE_TYPES.some(([v]) => v === step.type) && (
                  <option value={String(step.type)}>{String(step.type)} (옛 방식)</option>
                )}
              </select>
              <input
                className="mono"
                value={step.criteria ?? step.expected ?? ''}
                placeholder={String(step.type) === 'expr' ? '${var1} == ${var2}' : 'Model Name'}
                onChange={(e) => onChange({ criteria: e.target.value })}
              />
            </div>
            {String(step.type) === 'table' && (
              <span className="sd-hint">
                {isTbl ? (
                  <>
                    <button
                      className="btn small"
                      type="button"
                      onClick={() => setTblOpen(true)}
                    >
                      표에서 고르기
                    </button>{' '}
                    아래 Result 를 표로 펼쳐 놓고, <b>볼 행</b>과 <b>그 행이 어때야 하는지</b>를
                    눌러서 만듭니다.
                  </>
                ) : (
                  <>
                    먼저 이 스텝을 <b>실행</b>해서 표 응답을 받아야 고를 수 있습니다.
                  </>
                )}
              </span>
            )}
            {preview(step.criteria ?? step.expected)}
            {String(step.type) === 'expr' && String(step.criteria ?? '').trim() && (
              (() => {
                const r = evalCondWhy(String(step.criteria), gp.values)
                return (
                  <span className={`sd-cond${r.ok ? ' yes' : ' no'}`}>
                    지금은 <b>{r.ok ? '합격' : '불합격'}</b> — {r.why}
                  </span>
                )
              })()
            )}
            {String(step.type) === 'expr' ? (
              <span className="sd-hint">
                옛 방식입니다 — 값끼리 견주는 것은 이제 <b>Diff 스텝</b>에서 합니다.
                쓸 수 있는 것: <b>== != &gt; &lt; &gt;= &lt;= 포함</b>
              </span>
            ) : step.type !== 'none' ? (
              <span className="sd-hint">
                대소문자는 안 가립니다. 한 줄에 콤마로 여러 개를 적으면 그 중 하나만
                맞아도 합격입니다.
              </span>
            ) : null}
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
                  drop: () =>
                    onChange({ queries: (step.queries ?? []).filter((_, j) => j !== i) }),
                })),
                ...(step.extracts ?? []).map((x, i) => ({
                  key: `x${i}`,
                  name: x.var,
                  rule: x.rule,
                  drop: () =>
                    onChange({ extracts: (step.extracts ?? []).filter((_, j) => j !== i) }),
                })),
              ].map((v) => {
                const got = v.rule ? extractOne(v.rule, result) : null
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
                          ? '이 응답에서는 안 잡힙니다'
                          : got || '(빈 값)'
                        : '아직 실행 전'}
                    </span>
                    <code className="sd-vrule" title={v.rule ?? ''}>
                      {v.rule}
                    </code>
                    <button type="button" className="if-x" aria-label="지우기" onClick={v.drop}>
                      ×
                    </button>
                  </div>
                )
              })}
            </div>
            <span className="sd-hint">뒤 스텝에서 {'${이름}'} 으로 씁니다</span>
          </div>
        ) : null}

        {/* 자주 안 건드리는 칸. 늘 펼쳐 두면 어느 칸을 채워야 하는지 매번
            판단하게 된다.

            주석·메시지·모델에는 아예 안 띄운다. 장비로 아무것도 안 나가는
            줄이라 Test Data 도 RCA 도 채울 값이 없다 — 빈 칸을 세 개 띄워
            두면 '뭘 채워야 하나' 를 매번 생각하게 된다. */}
        {!isNoteKind(kind) && kind !== 'model' && !isDiff && (
        <details className="sd-more">
          <summary>세부</summary>

          {isRun && (
            <>

              <label className="sd-f">
                <span>판정 영역 — 응답에서 이 부분만 본다</span>
                <input
                  className="mono"
                  value={String(step.query ?? '')}
                  placeholder="비우면 응답 전체"
                  onChange={(e) => onChange({ query: e.target.value })}
                />
                <span className="sd-hint">
                  아래 <b>Result 에서 볼 부분을 마우스로 끌고</b> 「이 부분만 판정」 을
                  누르면 여기 채워집니다. 손으로 적을 때는 <b>시작..끝</b>(두 줄 사이) ·
                  <b>/식/</b>(정규식) · 그냥 문구(그 문구가 든 줄만).
                </span>
              </label>
              {(kind === 'cli' || kind === 'instrument') && (
                <label className="sd-f">
                  <span>응답 더 기다리기 (초)</span>
                  <input
                    type="number"
                    step="0.1"
                    value={step.tailWait ?? ''}
                    placeholder="0.3"
                    onChange={(e) =>
                      onChange({
                        tailWait: e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                  />
                  <span className="sd-hint">
                    <b>reload</b> 처럼 프롬프트가 온 뒤에도 한참 더 뱉는 명령에만 올리세요.
                    나머지는 손댈 일이 없습니다.
                  </span>
                </label>
              )}

              <label className="sd-f">
                <span>판정에서 뺄 줄</span>
                <textarea
                  className="mono"
                  rows={2}
                  value={step.excludeLines ?? ''}
                  placeholder={'uptime\nlast change'}
                  onChange={(e) => onChange({ excludeLines: e.target.value })}
                />
                <span className="sd-hint">
                  한 줄에 하나. 그 문구가 든 줄은 판정에서 통째로 뺀다 — 돌릴 때마다
                  달라지는 시각·카운터가 여기 온다.
                </span>
              </label>
            </>
          )}


          {/* 메모 하나면 된다. 「실패했을 때 볼 곳」 을 따로 뒀었는데
              656스텝 중 0건이 쓰고 있었고, 무슨 칸인지도 안 읽혔다. */}
          <label className="sd-f">
            <span>메모</span>
            <textarea
              rows={2}
              value={step.note ?? ''}
              placeholder="예) 링크가 안 올라오면 SFP 광 세기부터 본다"
              onChange={(e) => onChange({ note: e.target.value })}
            />
          </label>
        </details>
        )}

        {hasResult && (
          <>
            <div className="sd-rlab">
              <span>Result</span>
              {verdict && <b className={`status ${verdict.toLowerCase()}`}>{verdict}</b>}
              {step.reason && <span className="sd-why">{step.reason}</span>}
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
            {result && tblOpen ? (
              <TcTable
                text={result}
                criteria={String(step.criteria ?? step.expected ?? '')}
                onClose={() => setTblOpen(false)}
                onApply={(c) => {
                  onChange({ type: 'table', criteria: c })
                  setTblOpen(false)
                }}
              />
            ) : result ? (
              <>
                {/* onMouseUp 으로 잡는 이유: onSelect 는 pre 에서 안 뜬다 */}
                <pre className="sd-res" onMouseUp={grab}>
                  {result}
                </pre>
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
                      <button
                        className="btn small"
                        type="button"
                        onClick={() => onChange({ criteria: picked })}
                      >
                        Expected 로
                      </button>
                      {/* 끌어서 판정 영역·제외 줄을 만든다. `시작..끝` 문법을
                          손으로 짜게 두면 아무도 안 쓴다. */}
                      <button
                        className="btn small"
                        type="button"
                        title="고른 부분만 판정 대상으로 삼습니다"
                        onClick={() => {
                          const ls = picked.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)
                          const a = ls[0]
                          const b = ls[ls.length - 1]
                          if (!a) return
                          // 한 줄만 골랐으면 그 문구가 든 줄만, 여러 줄이면
                          // 첫 줄과 끝 줄 사이
                          onChange({ query: ls.length > 1 && b && b !== a ? `${a} .. ${b}` : a })
                          setPicked('')
                        }}
                      >
                        이 부분만 판정
                      </button>
                      <button
                        className="btn small"
                        type="button"
                        title="고른 줄을 판정에서 뺍니다"
                        onClick={() => {
                          const ls = picked.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)
                          const cur = String(step.excludeLines ?? '')
                            .split(/\r?\n/)
                            .map((x) => x.trim())
                            .filter(Boolean)
                          // 같은 줄을 두 번 넣지 않는다
                          const next = [...cur]
                          for (const l of ls) if (!next.includes(l)) next.push(l)
                          onChange({ excludeLines: next.join('\n') })
                          setPicked('')
                        }}
                      >
                        이 줄 빼기
                      </button>
                      <button
                        className="btn small"
                        type="button"
                        onClick={() => {
                          /**
                           * 겹치지 않는 이름을 먼저 내놓는다.
                           *
                           * 같은 이름을 두 스텝이 뽑으면 뒤엣것이 앞엣것을
                           * 덮는다 — 그러면 앞 스텝을 참조하던 곳이 조용히
                           * 다른 값을 보게 된다. 늘 'var1' 을 내놓고 있었다.
                           */
                          const used = new Set([...takenVars, ...mine])
                          let seed = 'var1'
                          for (let n = 1; n < 999; n++) {
                            if (!used.has(`var${n}`)) {
                              seed = `var${n}`
                              break
                            }
                          }
                          const name = window.prompt('변수 이름', seed)
                          if (!name) return
                          if (used.has(name.trim())) {
                            window.alert(
                              `「${name.trim()}」 은 이 시험에서 이미 쓰고 있습니다.\n` +
                                '같은 이름을 두 번 뽑으면 뒤엣것이 앞엣것을 덮습니다.',
                            )
                            return
                          }
                          // 고른 글자를 그대로 찾는 정규식으로 만든다. 사람이
                          // 정규식을 짜지 않아도 되게 하는 것이 요점이다.
                          const esc = picked.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                          onChange({
                            queries: [
                              ...(step.queries ?? []),
                              { q: `(${esc})`, var: name.trim() },
                            ],
                          })
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
