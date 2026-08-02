import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import type { Device } from '@/pages/Devices'
import type { TcData, TcLink } from './types'

interface Props {
  data: TcData
  onChange: (patch: Partial<TcData>) => void
}

/**
 * 시험 구성도.
 *
 * 슬롯끼리 어느 인터페이스로 물려 있는지를 적는다. 그림을 그리는 것이
 * 목적이 아니라 '어느 포트에 꽂혀 있는가' 를 자료로 남기는 것이 목적이다 —
 * 자연어로 스텝을 만들 때 "업링크 포트" 가 실제로 어디인지 알아야 한다.
 *
 * 인터페이스 목록은 슬롯에 물린 장비에서 가져온다. 장비를 아직 안 정한
 * 슬롯은 직접 입력한다.
 */
export default function TcTopology({ data, onChange }: Props) {
  const slots = data.slots ?? []
  const links = data.links ?? []

  const devQ = useQuery({
    queryKey: ['devices'],
    queryFn: async () => {
      const r = await apiFetch('/api/devices2')
      if (!r.ok) throw new Error('장비를 불러오지 못했습니다')
      return (await r.json()) as { devices: Device[] }
    },
  })
  const byIp = new Map((devQ.data?.devices ?? []).map((d) => [d.ip, d]))

  const ifsOf = (slotKey: string): string[] => {
    const s = slots.find((x) => x.key === slotKey)
    if (!s?.device_ip) return []
    return (byIp.get(s.device_ip)?.interfaces ?? []).map((i) => i.name)
  }

  const label = (k: string) => {
    const s = slots.find((x) => x.key === k)
    return s ? `${s.key}${s.label ? ` · ${s.label}` : ''}` : k
  }

  const setLink = (i: number, patch: Partial<TcLink>) =>
    onChange({ links: links.map((l, j) => (j === i ? { ...l, ...patch } : l)) })

  const addLink = () =>
    onChange({
      links: [
        ...links,
        {
          from_slot: slots[0]?.key ?? '',
          to_slot: slots[1]?.key ?? slots[0]?.key ?? '',
        },
      ],
    })

  if (slots.length === 0) {
    return (
      <div className="tc-pane">
        <div className="empty">
          먼저 <b>Environment</b> 에서 슬롯을 만드세요. 구성도는 슬롯끼리 잇는 것입니다.
        </div>
      </div>
    )
  }

  return (
    <div className="tc-pane">
      <section className="tc-card">
        <div className="tc-card-head">
          <b>연결</b>
          <span className="muted small">어느 포트끼리 물려 있는가</span>
          <button className="btn small" type="button" onClick={addLink}>
            + 연결
          </button>
        </div>

        {links.length === 0 ? (
          <div className="empty">아직 연결이 없습니다.</div>
        ) : (
          <div className="link-rows">
            {links.map((l, i) => (
              <div className="link-row2" key={i}>
                <select
                  value={l.from_slot}
                  onChange={(e) => setLink(i, { from_slot: e.target.value, from_if: '' })}
                >
                  {slots.map((s) => (
                    <option key={s.key} value={s.key}>
                      {label(s.key)}
                    </option>
                  ))}
                </select>
                <input
                  list={`if-${l.from_slot}`}
                  className="link-if"
                  placeholder="포트"
                  value={l.from_if ?? ''}
                  onChange={(e) => setLink(i, { from_if: e.target.value })}
                />
                <span className="link-arrow">↔</span>
                <select
                  value={l.to_slot}
                  onChange={(e) => setLink(i, { to_slot: e.target.value, to_if: '' })}
                >
                  {slots.map((s) => (
                    <option key={s.key} value={s.key}>
                      {label(s.key)}
                    </option>
                  ))}
                </select>
                <input
                  list={`if-${l.to_slot}`}
                  className="link-if"
                  placeholder="포트"
                  value={l.to_if ?? ''}
                  onChange={(e) => setLink(i, { to_if: e.target.value })}
                />
                <input
                  placeholder="설명 (1G · 광)"
                  value={l.note ?? ''}
                  onChange={(e) => setLink(i, { note: e.target.value })}
                />
                <button
                  type="button"
                  className="if-x"
                  onClick={() => onChange({ links: links.filter((_, j) => j !== i) })}
                  aria-label="연결 삭제"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 슬롯마다 그 장비의 포트를 자동완성으로 준다 */}
        {slots.map((s) => (
          <datalist id={`if-${s.key}`} key={s.key}>
            {ifsOf(s.key).map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        ))}

        <div className="hint">
          장비를 정한 슬롯은 포트 칸에서 그 장비의 인터페이스가 자동완성됩니다.
          아직 안 정한 슬롯은 직접 적으세요.
        </div>
      </section>

      <section className="tc-card">
        <div className="tc-card-head">
          <b>구성 요약</b>
          <span className="muted small">지금까지 적은 것</span>
        </div>
        <div className="topo-sum">
          {slots.map((s) => {
            const dev = s.device_ip ? byIp.get(s.device_ip) : undefined
            const mine = links.filter((l) => l.from_slot === s.key || l.to_slot === s.key)
            return (
              <div className="topo-node" key={s.key}>
                <b>{label(s.key)}</b>
                <span className="muted small">
                  {dev ? `${dev.ip}${dev.model ? ` · ${dev.model}` : ''}` : s.family || '미정'}
                </span>
                <span className="muted small">
                  {mine.length === 0
                    ? '연결 없음'
                    : mine
                        .map((l) =>
                          l.from_slot === s.key
                            ? `${l.from_if || '?'} → ${label(l.to_slot)}:${l.to_if || '?'}`
                            : `${l.to_if || '?'} → ${label(l.from_slot)}:${l.from_if || '?'}`,
                        )
                        .join(' · ')}
                </span>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
