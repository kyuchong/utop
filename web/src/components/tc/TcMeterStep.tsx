import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { isMeter, meterKind } from './device'
import { METER_ACT_LABEL, type MeterCfg, type TcStep } from './types'
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
              onChange={(e) => onChange({ meterJudge: e.target.value as 'loss' | 'none' })}
            >
              <option value="loss">손실로 판정</option>
              <option value="none">판정 안 함 — 사람이 정함</option>
            </select>
            <span className="sd-hint">
              트래픽이 <b>흐르는 도중</b>에 읽으면 아직 도착하지 않은 패킷이 손실로 잡힙니다.
              「보내는 중인지 본다」 가 목적인 스텝은 그것으로 떨어질 수밖에 없는데, 시험이
              깨진 것은 아닙니다. 그럴 때 「판정 안 함」 으로 두면 값만 남기고 결과는 비워
              둡니다 — 보고 직접 찍으시면 됩니다.
            </span>
          </label>

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
