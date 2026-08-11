import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { isMeter, meterKind } from './device'
import { METER_ACT_LABEL, METER_FIELDS, type MeterCfg, type MeterRule, type TcStep } from './types'
import type { Device } from '@/pages/Devices'
import './TcMeterStep.css'

interface Props {
  step: TcStep
  /** TC 의 Traffic 탭이 정한 트래픽 설정 — 여기서는 보여 주기만 한다 */
  meterCfg?: MeterCfg
  onChange: (patch: Partial<TcStep>) => void
  /** Traffic 탭으로 보내기 */
  onGoTraffic?: () => void
}

/**
 * 계측기 스텝.
 *
 * 전에는 이 자리에 포트·속도·프레임 크기·MAC·IP 가 전부 있었다. 스텝을
 * 세 개 쓰면(시작·조회·정지) 같은 설정을 세 번 적었고, 한 군데만 고치고
 * 나머지를 잊으면 시작과 조회가 서로 다른 스트림을 보게 된다.
 *
 * 그래서 **무엇을 얼마나 보낼지는 TC 의 `Traffic` 탭에 한 벌로** 두고,
 * 스텝에는 「지금 무엇을 하나」 만 남겼다 — 시작·정지·조회.
 */
export default function TcMeterStep({ step, meterCfg, onChange, onGoTraffic }: Props) {
  const cfg = meterCfg ?? {}

  const devQ = useQuery({
    queryKey: ['devices2'],
    queryFn: async () => {
      const r = await apiFetch('/api/devices2')
      if (!r.ok) throw new Error('장비를 불러오지 못했습니다')
      return (await r.json()) as { devices: Device[] }
    },
    staleTime: 60_000,
  })
  const meters = useMemo(() => (devQ.data?.devices ?? []).filter((d) => isMeter(d)), [devQ.data])

  /**
   * 어느 계측기로 나가나.
   *
   * Traffic 탭이 고른 것이 먼저다. 스텝의 `host` 는 탭이 생기기 전에 만든
   * 옛 TC 를 위해 남겨 둔다 — 그때 적어 둔 주소를 지우면 그 TC 들이 갈 곳을
   * 잃는다.
   */
  const host = (cfg.chassis || step.host || '').trim()
  const cur = meters.find((d) => (d.ip ?? '').trim() === host)
  const kind = meterKind(cur)
  const fromTab = !!cfg.chassis
  /** 아직 안 고른 줄은 「트래픽 시작」 이다 — 드롭다운이 그렇게 보이고 있다 */
  const act = step.meterAct ?? 'traffic_start'
  const streams = (cfg.streams ?? []).filter((s) => s.enabled !== false)

  /** 규칙 한 줄 고치기 */
  const setRule = (n: number, patch: Partial<MeterRule>) =>
    onChange({
      meterRules: (step.meterRules ?? []).map((x, k) => (k === n ? { ...x, ...patch } : x)),
    })

  return (
    <div className="sd-meter">
      {/* 어디로 나가고, 무엇을 보내나 — 스텝에서는 읽기만 한다 */}
      <div className={`ms-cfg${host ? '' : ' none'}`}>
        {host ? (
          <>
            <b>{cur?.name || cur?.id || host}</b>
            <span className="ms-tag">{kind === 'stc' ? 'STC' : 'N2X'}</span>
            <span className="mono muted">{host}</span>
            <span className="sp" />
            <span className="muted small">
              스트림 {streams.length}개 · 포트 {(cfg.ports ?? []).length || '—'}
            </span>
            {onGoTraffic && (
              <button className="btn small" type="button" onClick={onGoTraffic}>
                Traffic 탭에서 고치기
              </button>
            )}
          </>
        ) : (
          <>
            <span>
              계측기와 스트림이 아직 없습니다. <b>Traffic</b> 탭에서 계측기를 고르고 스트림을
              만드세요 — 스텝은 그것을 시작·정지·조회만 합니다.
            </span>
            <span className="sp" />
            {onGoTraffic && (
              <button className="btn small primary" type="button" onClick={onGoTraffic}>
                Traffic 탭 열기
              </button>
            )}
          </>
        )}
      </div>

      {/* 옛 TC 호환 — 탭에서 안 골랐고 스텝에만 주소가 있을 때만 보인다 */}
      {!fromTab && (
        <label className="sd-f">
          <span>계측기 (이 스텝)</span>
          <select value={step.host ?? ''} onChange={(e) => onChange({ host: e.target.value })}>
            <option value="">— 고르기 —</option>
            {meters.map((d) => (
              <option key={d.id} value={d.ip ?? ''}>
                {d.name || d.id} · {d.ip} ({meterKind(d) === 'stc' ? 'STC' : 'N2X'})
              </option>
            ))}
          </select>
          <span className="sd-hint">
            계측기는 세션(＋ 세션)에 넣지 않습니다 — 세션은 CLI(telnet·ssh)로 붙는 자리라
            계측기는 거기서 막힙니다.
          </span>
        </label>
      )}

      <label className="sd-f">
        <span>계측기 동작</span>
        <select
          value={act}
          onChange={(e) => onChange({ meterAct: e.target.value as TcStep['meterAct'] })}
        >
          {Object.entries(METER_ACT_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>

      {act === 'traffic_start' && (
        <>
          <label className="sd-f">
            <span>시간 (초, 0=연속)</span>
            <input
              type="number"
              value={step.meterDur ?? ''}
              placeholder="0"
              onChange={(e) => onChange({ meterDur: Number(e.target.value) || undefined })}
            />
          </label>
          <span className="sd-hint">
            0 으로 두면 「트래픽 정지」 스텝을 만날 때까지 계속 보냅니다. 보낸 뒤에는
            「통계 읽기 · 판정」 스텝을 두어야 합격·불합격이 납니다.
          </span>
        </>
      )}

      {act === 'traffic_stat' && (
        <>
          <label className="sd-f">
            <span>판정</span>
            <select
              value={step.meterJudge ?? 'loss'}
              onChange={(e) =>
                onChange({ meterJudge: e.target.value as 'loss' | 'rule' | 'none' })
              }
            >
              <option value="loss">손실로 판정</option>
              <option value="rule">표에서 고른 값으로 판정</option>
              <option value="none">판정 안 함 — 사람이 정함</option>
            </select>
            <span className="sd-hint">
              트래픽이 <b>흐르는 도중</b>에 읽으면 아직 도착하지 않은 패킷이 손실로 잡힙니다.
              「보내는 중인지 본다」 가 목적인 스텝은 그것으로 떨어질 수밖에 없는데, 시험이
              깨진 것은 아닙니다. 그럴 때 「판정 안 함」 으로 두면 값만 남기고 결과는 비워
              둡니다 — 보고 직접 찍으시면 됩니다.
            </span>
          </label>

          {step.meterJudge === 'rule' && (
            <div className="ms-rules">
              <div className="ms-rules-h">
                <b>표에서 고른 값</b>
                <span className="muted small">
                  아래 결과 표의 <b>칸을 누르면</b> 규칙이 하나 생깁니다. 모두 맞아야 합격입니다.
                </span>
              </div>
              {(step.meterRules ?? []).length === 0 ? (
                <div className="muted small ms-rules-none">
                  아직 없습니다 — 이 스텝을 한 번 실행해서 표를 받은 뒤, 보고 싶은 칸을 누르세요.
                </div>
              ) : (
                (step.meterRules ?? []).map((r, n) => (
                  <div className="ms-rule" key={n}>
                    <select
                      value={r.field}
                      onChange={(e) => setRule(n, { field: e.target.value })}
                    >
                      {METER_FIELDS.map((f) => (
                        <option key={f.k} value={f.k}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                    {/* 어느 줄을 볼까. 스무 갈래를 뿌리면 「합계가 얼마」
                        만으로는 못 잡는다 — 한 갈래만 죽어도 합계는
                        멀쩡해 보인다. */}
                    <select
                      value={
                        r.scope ??
                        (r.idx === undefined ? 'sum' : `#${r.idx}`)
                      }
                      onChange={(e) => {
                        const v = e.target.value
                        if (v.startsWith('#'))
                          setRule(n, { scope: undefined, idx: Number(v.slice(1)) })
                        else setRule(n, { scope: v as MeterRule['scope'], idx: undefined })
                      }}
                    >
                      <option value="sum">합계</option>
                      <option value="avg">평균</option>
                      <option value="max">가장 큰 줄</option>
                      <option value="min">가장 작은 줄</option>
                      <option value="each">모든 줄이</option>
                      <option value="any">어느 한 줄이라도</option>
                      {(meterCfg?.streams ?? []).map((x, k) => (
                        <option key={k} value={`#${k}`}>
                          {x.name || `스트림 ${k + 1}`}
                        </option>
                      ))}
                    </select>
                    {/* 일부 줄만 — 「1-10」 · 「1,3,5」. 비우면 전부.
                        포트별로 갈라 재거나 한 묶음만 떼어 보는 시험이 있다. */}
                    <input
                      className="ms-pick"
                      value={r.pick ?? ''}
                      placeholder="줄 (전부)"
                      title="볼 줄만 적습니다 — 1-10 · 1,3,5. 비우면 전부."
                      onChange={(e) => setRule(n, { pick: e.target.value })}
                    />
                    <select
                      className="ms-op"
                      value={r.op}
                      onChange={(e) => setRule(n, { op: e.target.value as MeterRule['op'] })}
                    >
                      <option value=">=">이상 (≥)</option>
                      <option value="<=">이하 (≤)</option>
                      <option value="==">같음 (=)</option>
                      <option value="!=">다름 (≠)</option>
                      <option value=">">초과 (&gt;)</option>
                      <option value="<">미만 (&lt;)</option>
                      <option value="between">사이</option>
                      <option value="~">오차 이내 (±%)</option>
                    </select>
                    {/* 숫자 대신 다른 칸과 견줄 수 있다. 「받은 것이 보낸
                        것과 같은가」 가 가장 흔한 판정인데, 보낸 개수는
                        시험마다 달라 숫자로 적어 둘 수가 없었다. */}
                    <select
                      value={r.rhsField ?? ''}
                      title="숫자 대신 다른 칸과 견줍니다"
                      onChange={(e) => setRule(n, { rhsField: e.target.value || undefined })}
                    >
                      <option value="">숫자와</option>
                      {METER_FIELDS.map((f) => (
                        <option key={f.k} value={f.k}>
                          {f.label} 과
                        </option>
                      ))}
                    </select>
                    {!r.rhsField && (
                      <input
                        className="ms-val"
                        type="number"
                        step="any"
                        value={r.value}
                        onChange={(e) => setRule(n, { value: Number(e.target.value) || 0 })}
                      />
                    )}
                    {(r.op === 'between' || r.op === '~') && (
                      <input
                        className="ms-val"
                        type="number"
                        step="any"
                        value={r.value2 ?? 0}
                        placeholder={r.op === '~' ? '±%' : '위끝'}
                        title={r.op === '~' ? '허용 오차 퍼센트' : '사이의 위끝'}
                        onChange={(e) => setRule(n, { value2: Number(e.target.value) || 0 })}
                      />
                    )}
                    <button
                      type="button"
                      className="btn small danger"
                      title="이 규칙을 지웁니다"
                      onClick={() =>
                        onChange({ meterRules: (step.meterRules ?? []).filter((_, k) => k !== n) })
                      }
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {(step.meterJudge ?? 'loss') === 'loss' && (
            <label className="sd-f">
              <span>허용 손실 (패킷 수)</span>
              <input
                type="number"
                value={step.meterMaxLoss ?? ''}
                placeholder="0"
                onChange={(e) => onChange({ meterMaxLoss: Number(e.target.value) || 0 })}
              />
              <span className="sd-hint">
                표의 <b>Rx Packet Loss</b> 가 이 수를 넘으면 불합격입니다. 비우면 0.
              </span>
            </label>
          )}
        </>
      )}
    </div>
  )
}
