import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import type { Device } from '@/pages/Devices'
import { nextSlotKey, type TcData, type TcSlot } from './types'

interface Props {
  data: TcData
  onChange: (patch: Partial<TcData>) => void
}

/**
 * TC 환경.
 *
 * 시험 목적·사전 준비 조건과 '이 시험에 필요한 장비(슬롯)' 를 정한다.
 *
 * 슬롯이 이 시스템의 이음매다. 스텝은 장비 IP 를 직접 적지 않고 슬롯(s1)을
 * 가리키고, 슬롯이 어느 장비의 어느 접속인지를 안다. 그래서
 *  · 같은 TC 를 다른 랩의 장비로 그대로 돌릴 수 있고
 *  · 같은 장비에 세션을 여러 개(s1, s2) 열어 동시에 쓸 수 있다
 */
export default function TcEnvironment({ data, onChange }: Props) {
  const slots = data.slots ?? []

  const devQ = useQuery({
    queryKey: ['devices'],
    queryFn: async () => {
      const r = await apiFetch('/api/devices2')
      if (!r.ok) throw new Error('장비를 불러오지 못했습니다')
      return (await r.json()) as { devices: Device[] }
    },
  })
  const rolesQ = useQuery({
    queryKey: ['device-roles'],
    queryFn: async () => {
      const r = await apiFetch('/api/device-roles')
      return (await r.json()) as { roles: string[] }
    },
  })

  const devices = devQ.data?.devices ?? []
  const byIp = new Map(devices.map((d) => [d.ip, d]))

  const setSlot = (i: number, patch: Partial<TcSlot>) =>
    onChange({ slots: slots.map((s, j) => (j === i ? { ...s, ...patch } : s)) })

  const addSlot = () =>
    onChange({
      slots: [...slots, { key: nextSlotKey(slots), label: '', family: '', protocol: '' }],
    })

  const delSlot = (i: number) => {
    const gone = slots[i]
    if (!gone) return
    const used = (data.checks ?? []).some((c) => c.session === gone.key)
    if (used && !window.confirm(`${gone.key} 을 쓰는 스텝이 있습니다. 그래도 지울까요?`)) return
    onChange({
      slots: slots.filter((_, j) => j !== i),
      links: (data.links ?? []).filter(
        (l) => l.from_slot !== gone.key && l.to_slot !== gone.key,
      ),
    })
  }

  return (
    <div className="tc-pane">
      <section className="tc-card">
        <div className="tc-card-head">
          <b>시험 목적</b>
          <span className="muted small">무엇을 확인하는 시험인가</span>
        </div>
        <textarea
          className="tc-text"
          rows={4}
          value={data.object_md ?? ''}
          placeholder="예) E6100 의 포트별 rate limit 이 설정값대로 동작하는지 확인한다."
          onChange={(e) => onChange({ object_md: e.target.value })}
        />
      </section>

      <section className="tc-card">
        <div className="tc-card-head">
          <b>사전 준비 조건</b>
          <span className="muted small">시험을 시작하기 전에 되어 있어야 하는 것</span>
        </div>
        <textarea
          className="tc-text"
          rows={4}
          value={data.precondition_md ?? ''}
          placeholder={'예)\n- OLT 와 ONT 가 링크업 되어 있을 것\n- 계측기가 가입자 포트에 연결되어 있을 것'}
          onChange={(e) => onChange({ precondition_md: e.target.value })}
        />
      </section>

      <section className="tc-card">
        <div className="tc-card-head">
          <b>장비 슬롯 · 세션</b>
          <span className="muted small">
            스텝은 장비 IP 가 아니라 이 슬롯(s1)을 가리킵니다
          </span>
          <button className="btn small" type="button" onClick={addSlot}>
            + 슬롯
          </button>
        </div>

        {slots.length === 0 ? (
          <div className="empty">
            아직 슬롯이 없습니다. 「+ 슬롯」 으로 이 시험에 필요한 장비를 정하세요.
          </div>
        ) : (
          <div className="slot-list">
            <div className="slot-row th">
              <span>세션</span>
              <span>이름</span>
              <span>제품군</span>
              <span>장비</span>
              <span>접속</span>
              <span>인터페이스</span>
              <span />
            </div>
            {slots.map((s, i) => {
              const dev = s.device_ip ? byIp.get(s.device_ip) : undefined
              return (
                <div className="slot-row" key={`${s.key}-${i}`}>
                  <input
                    className="slot-key"
                    value={s.key}
                    onChange={(e) => setSlot(i, { key: e.target.value.trim() })}
                  />
                  <input
                    value={s.label ?? ''}
                    placeholder="DUT · 대향"
                    onChange={(e) => setSlot(i, { label: e.target.value })}
                  />
                  <select
                    value={s.family ?? ''}
                    onChange={(e) => setSlot(i, { family: e.target.value })}
                  >
                    <option value="">(무관)</option>
                    {(rolesQ.data?.roles ?? []).map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                  <select
                    value={s.device_ip ?? ''}
                    onChange={(e) => setSlot(i, { device_ip: e.target.value })}
                  >
                    {/* 비워두면 실행할 때 고른다. 그래야 같은 TC 를 랩마다 돌린다 */}
                    <option value="">실행할 때 고름</option>
                    {devices
                      .filter((d) => !s.family || d.role === s.family)
                      .map((d) => (
                        <option key={d.ip} value={d.ip}>
                          {d.ip} {d.model ? `· ${d.model}` : ''} {d.lab ? `· ${d.lab}` : ''}
                        </option>
                      ))}
                  </select>
                  <select
                    value={s.protocol ?? ''}
                    onChange={(e) => setSlot(i, { protocol: e.target.value })}
                  >
                    <option value="">기본</option>
                    {(dev?.access ?? [])
                      .filter((a) => a.protocol !== 'snmp')
                      .map((a) => (
                        <option key={a.protocol} value={a.protocol}>
                          {a.protocol.toUpperCase()}
                        </option>
                      ))}
                    {!dev && (
                      <>
                        <option value="telnet">TELNET</option>
                        <option value="ssh">SSH</option>
                        <option value="console">CONSOLE</option>
                      </>
                    )}
                  </select>
                  <span className="muted small slot-ifs">
                    {dev ? `${dev.interfaces?.length ?? 0}개` : '–'}
                  </span>
                  <button
                    type="button"
                    className="if-x"
                    onClick={() => delSlot(i)}
                    aria-label={`${s.key} 삭제`}
                  >
                    ×
                  </button>
                </div>
              )
            })}
          </div>
        )}

        <div className="hint">
          장비를 <b>실행할 때 고름</b> 으로 두면 같은 TC 를 다른 랩에서도 그대로
          돌릴 수 있습니다. 특정 장비에서만 되는 시험이면 여기서 못박으세요.
          같은 장비를 슬롯 둘로 넣으면 세션 두 개를 동시에 씁니다.
        </div>
      </section>
    </div>
  )
}
