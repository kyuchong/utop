import { useEffect, useState } from 'react'
import { apiFetch } from '@/api/client'
import './N2xPorts.css'

/** 한 포트 — N2X·STC 를 같은 모양으로 추린 것 */
interface Port {
  num: string
  /** free | used | mine */
  state: 'free' | 'used' | 'mine'
  who: string
}
interface Mod {
  id: string
  card: string
  ports: number
  list: Port[]
}

interface Props {
  kind: 'n2x' | 'stc'
  /** N2X: 섀시 IP(server). STC: 섀시 IP */
  server: string
  /** STC 만 — REST 서버(stcweb) IP·포트 */
  restIp?: string
  restPort?: number
  onClose: () => void
}

/**
 * 계측기 포트 현황 — 누가 어느 포트를 쓰나.
 *
 * N2X 와 STC 는 응답이 다르다. N2X 는 `modules[].portList[]{port,state,label,
 * mine,avail}`, STC 는 conncheck 의 `modules[].port_detail[]{index,status,
 * owner}`. 화면은 하나면 된다 — 여기서 둘을 같은 모양으로 추린다.
 *
 * 포트를 예약하지 않는다. 상태만 읽는다.
 */
export default function MeterPorts({ kind, server, restIp, restPort, onClose }: Props) {
  const [mods, setMods] = useState<Mod[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const load = async (force = false) => {
    setLoading(true)
    setErr('')
    try {
      if (kind === 'n2x') {
        const r = await apiFetch(
          `/api/n2x/ports?server=${encodeURIComponent(server)}&label=utop${force ? '&force=1' : ''}`,
        )
        const j = (await r.json()) as {
          ok?: boolean
          error?: string
          modules?: Array<{
            id: number
            card?: string
            ports?: number
            portList?: Array<{ port: number; label?: string; mine?: number; avail?: number }>
          }>
        }
        if (j.ok === false) {
          setErr(j.error || '포트를 읽지 못했습니다')
          setMods([])
          return
        }
        setMods(
          (j.modules ?? []).map((m) => ({
            id: String(m.id),
            card: m.card ?? '',
            ports: m.ports ?? (m.portList ?? []).length,
            list: (m.portList ?? []).map((p) => ({
              num: String(p.port),
              state: p.mine ? 'mine' : p.avail ? 'free' : 'used',
              who: p.mine ? '내 것' : p.avail ? '빈 포트' : p.label || '사용 중',
            })),
          })),
        )
      } else {
        const r = await apiFetch('/api/stc/conncheck', {
          method: 'POST',
          body: JSON.stringify({ chassis: server, restIp: restIp || 'localhost', restPort: restPort || 8888 }),
        })
        const j = (await r.json()) as {
          ok?: boolean
          error?: string
          modules?: Array<{
            slot?: string
            model?: string
            ports?: number
            port_detail?: Array<{ index: string; status: string; owner: string }>
          }>
        }
        if (j.ok === false) {
          setErr(j.error || '포트를 읽지 못했습니다')
          setMods([])
          return
        }
        setMods(
          (j.modules ?? []).map((m) => ({
            id: String(m.slot ?? '?'),
            card: m.model ?? '',
            ports: m.ports ?? (m.port_detail ?? []).length,
            list: (m.port_detail ?? []).map((p) => ({
              num: p.index,
              // available = 빈 포트, 그 외(reserved 등) = 사용 중
              state: p.status === 'available' ? 'free' : 'used',
              who: p.status === 'available' ? '빈 포트' : p.owner || p.status,
            })),
          })),
        )
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setMods([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, server, restIp, restPort])

  const all = mods.flatMap((m) => m.list)
  const free = all.filter((p) => p.state === 'free').length
  const mine = all.filter((p) => p.state === 'mine').length

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div
        className="modal np"
        role="dialog"
        aria-modal="true"
        aria-label="포트 현황"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <b>포트 현황</b>
          <span className="muted small">
            {kind.toUpperCase()} · {server}
          </span>
          {all.length > 0 && (
            <span className="np-sum">
              <b className={free ? 'ok' : 'no'}>빈 포트 {free}</b> · 전체 {all.length}
              {mine > 0 && ` · 내 것 ${mine}`}
            </span>
          )}
          <span className="sp" />
          <button className="btn small" type="button" onClick={() => void load(true)}>
            새로고침
          </button>
          <button className="btn small" type="button" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="np-body">
          {loading ? (
            <div className="empty">불러오는 중… (섀시 응답까지 수십 초 걸릴 수 있습니다)</div>
          ) : err ? (
            <div className="np-err">{err}</div>
          ) : all.length === 0 ? (
            <div className="empty">포트 정보가 없습니다.</div>
          ) : (
            // 포트 없는 빈 슬롯(0포트)은 안 그린다 — 자리만 먹는다
            mods.filter((m) => m.list.length > 0).map((m) => (
              <div key={m.id} className="np-mod">
                <div className="np-mh">
                  <b>모듈 {m.id}</b>
                  <span className="muted small">
                    {m.card} · {m.ports}포트
                  </span>
                </div>
                <div className="np-ports">
                  {m.list.map((p) => (
                    <div key={p.num} className={`np-port ${p.state}`} title={p.who}>
                      <b>{p.num}</b>
                      <span className="np-who">{p.who}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
