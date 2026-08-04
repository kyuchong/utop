import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { IconIndent, IconOutdent } from '../icons'
import { JUDGE_TYPES } from './judge'
import PickList, { type PickItem } from './PickList'
import { useGlobalParams } from './useGlobalParams'
import {
  isNoteKind,
  sessionIndex,
  STEP_CONTENT,
  STEP_KINDS,
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
  /** 이 스텝이 붙는 장비의 모델. 그 모델의 전역 파라미터를 함께 보여준다 */
  model?: string
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
  model,
  onChange,
  onMove,
  onRemove,
  onDuplicate,
  onRun,
}: Props) {
  const [picked, setPicked] = useState('')
  /** 지금 열려 있는 고르기 목록 — 어느 칸에 넣을지까지 담는다 */
  const [pick, setPick] = useState<'' | 'oid' | 'param-cli' | 'param-crit'>('')
  const [oidQ, setOidQ] = useState('')

  const gp = useGlobalParams(model)

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

  /** 고른 것을 칸에 넣는다. 커서 자리를 모르므로 뒤에 붙인다. */
  const put = (field: 'cli' | 'criteria' | 'oid', v: string) => {
    if (field === 'oid') return onChange({ oid: v })
    const cur = String((field === 'cli' ? step.cli ?? step.data : step.criteria) ?? '')
    onChange({ [field]: cur ? `${cur}${cur.endsWith(' ') ? '' : ' '}${v}` : v })
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
  const isRun = isCmd || isNet || isConn
  /**
   * 결과 칸을 띄운다.
   *
   * 판정하는 것뿐 아니라 **결과가 남아 있는 모든 줄**에 띄운다. 옛 자료의
   * if·wait 줄에도 output 이 들어 있는데, 안 띄우면 그 103건을 화면에서
   * 영영 못 본다.
   */
  const hasResult = isRun || !!result
  const needsSession = isCmd || isConn || isNet
  const depth = Math.min(Math.max(Number(step.indent) || 0, 0), 4)
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
              <button
                type="button"
                className="sd-pickbtn"
                title="전역 파라미터 넣기"
                onClick={() => setPick(pick === 'param-cli' ? '' : 'param-cli')}
              >
                {'${ } 파라미터'}
              </button>
            </span>
            {pick === 'param-cli' && (
              <PickList
                title="전역 파라미터"
                items={gp.items}
                loading={gp.loading}
                empty={gp.empty}
                onClose={() => setPick('')}
                onPick={(x) => {
                  put('cli', x.value)
                  setPick('')
                }}
              />
            )}
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
            <span>대상 IP</span>
            <input
              className="mono"
              value={step.host ?? ''}
              placeholder={sessions.length ? '비우면 세션 장비' : '220.1.1.254'}
              onChange={(e) => onChange({ host: e.target.value })}
            />
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
            </span>
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
                  put('oid', x.value)
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
        {kind === 'if' && (
          <>
            <label className="sd-f">
              <span>조건 — 참일 때만 아래 블록을 돈다</span>
              <input
                className="mono"
                value={step.condition ?? ''}
                placeholder="${model} == 'U9532H'"
                onChange={(e) => onChange({ condition: e.target.value })}
              />
              <span className="sd-hint">
                쓸 수 있는 것: <b>== != &gt; &lt; &gt;= &lt;= 포함</b>. 앞 스텝에서 뽑은 값은
                <b> {'${이름}'}</b> 으로 넣는다. 숫자끼리면 숫자로 견준다.
              </span>
            </label>
            <div className="sd-blk">
              이 아래로 <b>한 칸 더 들여쓴 줄</b>이 If 의 몸통이다. 머리의 ⇥ 로 넣는다.
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
              <button
                type="button"
                className="sd-pickbtn"
                title="전역 파라미터 넣기"
                onClick={() => setPick(pick === 'param-crit' ? '' : 'param-crit')}
              >
                {'${ } 파라미터'}
              </button>
            </span>
            {pick === 'param-crit' && (
              <PickList
                title="전역 파라미터"
                items={gp.items}
                loading={gp.loading}
                empty={gp.empty}
                onClose={() => setPick('')}
                onPick={(x) => {
                  put('criteria', x.value)
                  setPick('')
                }}
              />
            )}
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
                placeholder="Model Name"
                onChange={(e) => onChange({ criteria: e.target.value })}
              />
            </div>
            {step.type !== 'none' && (
              <span className="sd-hint">
                대소문자는 안 가립니다. 한 줄에 콤마로 여러 개를 적으면 그 중 하나만
                맞아도 합격입니다.
              </span>
            )}
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
                <button
                  type="button"
                  className="sd-var-x"
                  aria-label={`${q.var || '변수'} 지우기`}
                  onClick={() =>
                    onChange({ queries: (step.queries ?? []).filter((_, j) => j !== i) })
                  }
                >
                  ×
                </button>
              </span>
            ))}
            {/* extracts 는 옛 이름이다. 새로 만들지 않고 있는 것만 보인다. */}
            {(step.extracts ?? []).map((x, i) => (
              <span className="sd-var" key={`x${i}`} title={x.rule ?? ''}>
                ${x.var || '?'}
                <button
                  type="button"
                  className="sd-var-x"
                  aria-label={`${x.var || '변수'} 지우기`}
                  onClick={() =>
                    onChange({ extracts: (step.extracts ?? []).filter((_, j) => j !== i) })
                  }
                >
                  ×
                </button>
              </span>
            ))}
            <span className="sd-hint">뒤 스텝에서 {'${이름}'} 으로 쓴다</span>
          </div>
        ) : null}

        {/* 자주 안 건드리는 칸. 늘 펼쳐 두면 어느 칸을 채워야 하는지 매번
            판단하게 된다.

            주석·메시지·모델에는 아예 안 띄운다. 장비로 아무것도 안 나가는
            줄이라 Test Data 도 RCA 도 채울 값이 없다 — 빈 칸을 세 개 띄워
            두면 '뭘 채워야 하나' 를 매번 생각하게 된다. */}
        {!isNoteKind(kind) && kind !== 'model' && (
        <details className="sd-more">
          <summary>세부</summary>

          {isRun && (
            <>
              {/* 사람이 읽는 한 줄. 옛 자료에서 656 중 3건만 쓰였지만,
                  줄만 보고 '이게 뭐였더라' 하는 일이 있어 남긴다. */}
              <label className="sd-f">
                <span>이 스텝을 한마디로</span>
                <input
                  value={step.step ?? ''}
                  placeholder="예) 부팅 후 시스템 정보 확인"
                  onChange={(e) => onChange({ step: e.target.value })}
                />
              </label>
              <label className="sd-f">
                <span>판정 영역 — 응답에서 이 부분만 본다</span>
                <input
                  className="mono"
                  value={String(step.query ?? '')}
                  placeholder="Port 1/1 .. Port 1/8  ·  /Rate\s+(\d+)/"
                  onChange={(e) => onChange({ query: e.target.value })}
                />
                <span className="sd-hint">
                  <b>시작..끝</b> 두 마커 줄 사이 · <b>/식/</b> 정규식 매칭 · 그냥 문구면 그
                  문구가 든 줄만. 비우면 응답 전체.
                </span>
              </label>
              {(kind === 'cli' || kind === 'instrument') && (
                <label className="sd-f">
                  <span>응답 기다림 (초)</span>
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
                    프롬프트가 온 뒤에도 이만큼 더 기다립니다 — 늦게 올라오는 syslog 를
                    받으려는 것입니다. 대부분 기본값이면 되고, <b>reload</b> 처럼 한참 뒤에
                    뭔가 더 뱉는 명령에만 올리세요. 올리는 만큼 그 스텝이 느려집니다.
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

          {/* 실패했을 때 볼 곳은 '실패할 수 있는 줄' 에만. If·Loop 은 실패라는
              것이 없다. */}
          {isRun && (
            <label className="sd-f">
              <span>실패했을 때 볼 곳</span>
              <textarea
                rows={2}
                value={step.rca ?? ''}
                placeholder="예) 링크가 안 올라오면 SFP 광 세기부터 본다"
                onChange={(e) => onChange({ rca: e.target.value })}
              />
            </label>
          )}

          <label className="sd-f">
            <span>메모</span>
            <textarea
              rows={2}
              value={step.note ?? ''}
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
