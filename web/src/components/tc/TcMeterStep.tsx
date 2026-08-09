import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { isMeter, meterKind } from './device'
import type { TcStep } from './types'
import type { Device } from '@/pages/Devices'
import './TcMeterStep.css'

interface Props {
  step: TcStep
  onChange: (patch: Partial<TcStep>) => void
}

/** 섀시에서 읽은 포트 한 개 */
interface Port {
  /** 화면·저장에 쓰는 이름. N2X 는 "모듈/포트", STC 는 "슬롯/포트" */
  id: string
  label: string
  free: boolean
  who: string
}

/**
 * 계측기 스텝 설정.
 *
 * 전에는 「어느 계측기인지」 가 화면에 없었다. 스텝의 세션에 묻혀 있어서,
 * 열어 보기 전에는 어느 섀시로 나가는지 알 수 없고 세션이 없으면 하드코딩된
 * 주소로 나갔다. 여기서 **계측기를 눈에 보이게 고른다.**
 *
 * 포트도 손으로 「101/1」 을 적게 두었다. 섀시에 물어보면 되는 것을 외워
 * 적게 하면 오타가 나고, 오타는 돌려 봐야 안다. 실제 포트를 읽어 고르게 하고,
 * 못 읽으면 그때만 손으로 적는다.
 */
export default function TcMeterStep({ step, onChange }: Props) {
  const [manual, setManual] = useState(false)

  /** 등록된 계측기 — 장비 목록에서 계측기만 추린다 */
  const devQ = useQuery({
    queryKey: ['devices2'],
    queryFn: async () => {
      const r = await apiFetch('/api/devices2')
      if (!r.ok) throw new Error('장비를 불러오지 못했습니다')
      return (await r.json()) as { devices: Device[] }
    },
    staleTime: 60_000,
  })
  const meters = useMemo(
    () => (devQ.data?.devices ?? []).filter((d) => isMeter(d)),
    [devQ.data],
  )

  /** 지금 고른 계측기 — step.host 에 주소를 적어 둔다(실행기가 그것으로 나간다) */
  const cur = meters.find((d) => (d.ip ?? '').trim() === (step.host ?? '').trim())
  const kind = meterKind(cur)

  /**
   * 섀시에서 포트를 읽는다.
   *
   * 계측기를 고르기 전에는 부르지 않는다 — 주소도 모르는데 물어봐야 답이 없고,
   * N2X 는 세션을 하나 먹는다.
   */
  const portQ = useQuery({
    queryKey: ['meter-ports', kind, step.host],
    enabled: !!step.host && !manual,
    staleTime: 60_000,
    queryFn: async (): Promise<Port[]> => {
      if (kind === 'stc') {
        const r = await apiFetch('/api/stc/conncheck', {
          method: 'POST',
          body: JSON.stringify({ chassis: step.host, restIp: 'localhost', restPort: 8888 }),
        })
        const j = (await r.json()) as {
          ok?: boolean
          error?: string
          modules?: Array<{
            slot?: string
            port_detail?: Array<{ index: string; status: string; owner: string }>
          }>
        }
        if (j.ok === false) throw new Error(j.error || '포트를 읽지 못했습니다')
        const out: Port[] = []
        for (const m of j.modules ?? []) {
          for (const p of m.port_detail ?? []) {
            const id = `${m.slot ?? '?'}/${p.index}`
            out.push({
              id,
              label: id,
              free: p.status === 'available',
              who: p.status === 'available' ? '빈 포트' : p.owner || p.status,
            })
          }
        }
        return out
      }
      const r = await apiFetch(
        `/api/n2x/ports?server=${encodeURIComponent(step.host ?? '')}&label=utop`,
      )
      const j = (await r.json()) as {
        ok?: boolean
        error?: string
        modules?: Array<{
          id: number
          portList?: Array<{ port: number; label?: string; mine?: number; avail?: number }>
        }>
      }
      if (j.ok === false) throw new Error(j.error || '포트를 읽지 못했습니다')
      const out: Port[] = []
      for (const m of j.modules ?? []) {
        for (const p of m.portList ?? []) {
          const id = `${m.id}/${p.port}`
          out.push({
            id,
            label: id,
            free: !!p.avail || !!p.mine,
            who: p.mine ? '내 것' : p.avail ? '빈 포트' : p.label || '사용 중',
          })
        }
      }
      return out
    },
  })

  const ports = portQ.data ?? []
  const canPick = !manual && ports.length > 0

  /** 포트 고르는 칸 — 섀시를 못 읽으면 손으로 적는 칸이 된다 */
  const portField = (which: 'txPort' | 'rxPort', label: string, ph: string) => (
    <label className="sd-f">
      <span>{label}</span>
      {canPick ? (
        <select value={step[which] ?? ''} onChange={(e) => onChange({ [which]: e.target.value })}>
          <option value="">— 고르기 —</option>
          {ports.map((p) => (
            <option key={p.id} value={p.id} disabled={!p.free}>
              {p.label} · {p.who}
            </option>
          ))}
        </select>
      ) : (
        <input
          className="mono"
          value={step[which] ?? ''}
          placeholder={ph}
          onChange={(e) => onChange({ [which]: e.target.value })}
        />
      )}
    </label>
  )

  return (
    <div className="sd-meter">
      {/* 어느 계측기로 나가나 — 이것이 없으면 열어 보기 전엔 알 수 없었다 */}
      <label className="sd-f">
        <span>계측기</span>
        <select
          value={step.host ?? ''}
          onChange={(e) => onChange({ host: e.target.value, txPort: '', rxPort: '' })}
        >
          <option value="">— 고르기 —</option>
          {meters.map((d) => (
            <option key={d.id} value={d.ip ?? ''}>
              {d.name || d.id} · {d.ip} ({meterKind(d) === 'stc' ? 'STC' : 'N2X'})
            </option>
          ))}
        </select>
        {!step.host && (
          <span className="sd-hint">
            고르지 않으면 이 스텝의 세션 장비로 나갑니다. 장비도 없으면 실행할 때
            실패합니다 — 여기서 정해 두세요.
          </span>
        )}
      </label>

      <label className="sd-f">
        <span>계측기 동작</span>
        <select
          value={step.meterAct ?? 'traffic_start'}
          onChange={(e) => onChange({ meterAct: e.target.value as TcStep['meterAct'] })}
        >
          <option value="ports">포트 확인</option>
          <option value="traffic_start">트래픽 시작</option>
          <option value="traffic_stat">통계 읽기 · 판정</option>
          <option value="traffic_stop">트래픽 정지</option>
          <option value="traffic_clear">스트림 비우기</option>
        </select>
      </label>

      {step.meterAct === 'traffic_start' && (
        <>
          <div className="ms-portbar">
            <span className="muted small">
              {!step.host
                ? '계측기를 먼저 고르세요'
                : portQ.isLoading
                  ? '포트를 읽는 중…'
                  : portQ.error
                    ? `포트를 못 읽었습니다 — ${(portQ.error as Error).message}`
                    : `포트 ${ports.length}개 · 빈 포트 ${ports.filter((p) => p.free).length}개`}
            </span>
            <span className="sp" />
            <label className="ms-manual">
              <input
                type="checkbox"
                checked={manual}
                onChange={(e) => setManual(e.target.checked)}
              />
              직접 입력
            </label>
            {!manual && step.host && (
              <button
                className="btn small"
                type="button"
                onClick={() => void portQ.refetch()}
                disabled={portQ.isFetching}
              >
                다시 읽기
              </button>
            )}
          </div>

          <div className="sd-2">
            {portField('txPort', '보내는 포트 (TX)', '101/1')}
            {portField('rxPort', '받는 포트 (RX)', '101/2')}
          </div>

          <div className="sd-3">
            <label className="sd-f">
              <span>속도 (pps)</span>
              <input
                type="number"
                value={step.meterPps ?? ''}
                placeholder="1000"
                onChange={(e) => onChange({ meterPps: Number(e.target.value) || undefined })}
              />
            </label>
            <label className="sd-f">
              <span>패킷 크기 (byte)</span>
              <input
                type="number"
                value={step.meterSize ?? ''}
                placeholder="64"
                onChange={(e) => onChange({ meterSize: Number(e.target.value) || undefined })}
              />
            </label>
            <label className="sd-f">
              <span>시간 (초, 0=연속)</span>
              <input
                type="number"
                value={step.meterDur ?? ''}
                placeholder="0"
                onChange={(e) => onChange({ meterDur: Number(e.target.value) || undefined })}
              />
            </label>
          </div>
          <span className="sd-hint">
            시간을 0 으로 두면 「트래픽 정지」 스텝을 만날 때까지 계속 보냅니다.
            보낸 뒤에는 「통계 읽기 · 판정」 스텝을 두어야 합격·불합격이 납니다.
          </span>
        </>
      )}

      {step.meterAct === 'traffic_stat' && (
        <label className="sd-f">
          <span>허용 손실 (패킷 수)</span>
          <input
            type="number"
            value={step.meterMaxLoss ?? ''}
            placeholder="0"
            onChange={(e) => onChange({ meterMaxLoss: Number(e.target.value) || 0 })}
          />
          <span className="sd-hint">
            손실이 이 수를 넘으면 <b>불합격</b>입니다. 비우면 0 — 한 패킷도 잃으면 안 됩니다.
          </span>
        </label>
      )}
    </div>
  )
}
