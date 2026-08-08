import { useEffect, useState } from 'react'
import { apiFetch } from '@/api/client'
import './N2xPorts.css'

interface Port {
  port: number
  state?: string
  label?: string
  mine?: number
  avail?: number
}
interface Module {
  id: number
  card?: string
  ports?: number
  portList?: Port[]
}
interface PortsResp {
  ok?: boolean
  error?: string
  modules?: Module[]
  cached?: boolean
  stale?: boolean
}

interface Props {
  /** 섀시 IP (명령의 server) */
  server: string
  onClose: () => void
}

/**
 * N2X 포트 현황 — 누가 어느 포트를 쓰나.
 *
 * 「연결 확인」 은 섀시에 붙나만 본다. 정작 시험 전에 궁금한 것은
 * **빈 포트가 있나 · 누가 잡고 있나** 다. 포트가 다 차 있으면 트래픽
 * 시험을 못 거니, 그걸 눈으로 봐야 한다.
 *
 * 포트를 예약하지 않는다 — 세션 하나(label utop)로 상태만 읽는다.
 */
export default function N2xPorts({ server, onClose }: Props) {
  const [data, setData] = useState<PortsResp | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const load = async (force = false) => {
    setLoading(true)
    setErr('')
    try {
      const r = await apiFetch(
        `/api/n2x/ports?server=${encodeURIComponent(server)}&label=utop${force ? '&force=1' : ''}`,
      )
      const j = (await r.json()) as PortsResp
      if (j.ok === false) setErr(j.error || '포트를 읽지 못했습니다')
      setData(j)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server])

  // 세는 값 — 빈 포트가 몇 개인지가 먼저다
  const all = (data?.modules ?? []).flatMap((m) => m.portList ?? [])
  const free = all.filter((p) => p.avail).length
  const mine = all.filter((p) => p.mine).length

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div
        className="modal np"
        role="dialog"
        aria-modal="true"
        aria-label="N2X 포트 현황"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <b>포트 현황</b>
          <span className="muted small">{server}</span>
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
            (data?.modules ?? []).map((m) => (
              <div key={m.id} className="np-mod">
                <div className="np-mh">
                  <b>모듈 {m.id}</b>
                  <span className="muted small">
                    {m.card} · {m.ports}포트
                  </span>
                </div>
                <div className="np-ports">
                  {(m.portList ?? []).map((p) => {
                    const cls = p.mine ? 'mine' : p.avail ? 'free' : 'used'
                    return (
                      <div key={p.port} className={`np-port ${cls}`} title={p.state}>
                        <b>{p.port}</b>
                        <span className="np-who">
                          {p.mine ? '내 것' : p.avail ? '빈 포트' : p.label || '사용 중'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}
          {data?.stale && (
            <div className="muted small np-stale">
              (데몬이 바빠 잠깐 전 값입니다 — 「새로고침」 으로 다시 읽으세요)
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
