import { useEffect, useState } from 'react'
import { apiFetch, tcApi } from '@/api/client'
import type { Device } from '@/pages/Devices'
import { deviceShort, isMeter } from './device'
import type { TcData, TcWire } from './types'
import './TcStart.css'

/**
 * 시험 시작하기.
 *
 * 빈 화면에서 시험을 짜게 하면 아무것도 모르는 사람은 첫 줄에서 막힌다.
 * 그런데 이 시스템에는 이미 검증된 시험이 쌓여 있다 — 어떤 것은 여덟
 * 번씩 돌았고 판정 기준도 그만큼 다듬어졌다. 가장 좋은 자산인데 새
 * 시험을 만들 때 쓰지 않고 있었다.
 *
 * 그래서 **짓지 않고 옮긴다.** 하려는 것을 한 줄 적으면 닮은 시험을
 * 찾아 주고, 고르면 그대로 베껴 장비만 갈아 끼운다. 지어낼 자리가 없으니
 * 틀릴 자리도 없다.
 *
 * 물어보는 것은 **한 번에 모아서** 묻는다. 단계마다 「확인」 을 누르게
 * 하면 다섯 번을 눌러야 하고, 그러면 사람은 읽지 않고 누른다. 안 맞는
 * 것만 한 자리에 늘어놓고 한 번 정하게 한다.
 */

interface Found {
  tcid: string
  name: string
  type?: string
  req_id?: string
  runs: number
  status?: string
  why: string
}

/** 옮길 때 안 맞는 것 하나 */
interface Gap {
  key: string
  what: string
  now: string
  was: string
  /** 고치면 이렇게 된다 */
  fix?: () => void
}

interface Props {
  devices: Device[]
  onClose: () => void
  onMade: (tcid: string) => void
}

export default function TcStart({ devices, onClose, onMade }: Props) {
  const [want, setWant] = useState('')
  const [pick, setPick] = useState<string[]>([])
  const [found, setFound] = useState<Found[] | null>(null)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  /** 고른 본보기와 그 알맹이 */
  const [base, setBase] = useState<{ meta: Found; data: TcData } | null>(null)
  /** 안 맞는 것들 — 한 번에 보여 주고 한 번에 정한다 */
  const [gaps, setGaps] = useState<Gap[]>([])
  const [take, setTake] = useState<Record<string, boolean>>({})

  const plain = devices.filter((d) => !isMeter(d))
  const meters = devices.filter(isMeter)

  useEffect(() => {
    // 시험에 쓸 장비가 하나뿐이면 고르는 수고를 줄인다
    if (plain.length === 1 && plain[0]) setPick([plain[0].id])
  }, [devices.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const look = async () => {
    if (!want.trim()) return
    setBusy('look')
    setErr('')
    setFound(null)
    try {
      const r = await apiFetch('/api/llm/similar', {
        method: 'POST',
        body: JSON.stringify({
          purpose: want,
          models: pick
            .map((id) => devices.find((d) => d.id === id))
            .filter(Boolean)
            .map((d) => (d as Device).model || ''),
        }),
      })
      const j = (await r.json()) as { ok?: boolean; error?: string; items?: Found[] }
      if (j.ok === false) throw new Error(j.error || '찾지 못했습니다')
      setFound(j.items ?? [])
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy('')
    }
  }

  /**
   * 본보기를 열고 **지금 랩과 견준다.**
   *
   * 다 맞으면 아무것도 안 묻는다. 안 맞는 것만 모아 한 자리에 늘어놓는다.
   */
  const open = async (m: Found) => {
    setBusy(m.tcid)
    setErr('')
    try {
      const r = await apiFetch(`/api/tc/${encodeURIComponent(m.tcid)}`)
      const d = (await r.json()) as TcData
      const g: Gap[] = []

      // 1) 장비 — 본보기가 쓰던 것과 지금 고른 것
      const wasDev = (Array.isArray(d.sessions) ? (d.sessions as string[]) : []).filter(Boolean)
      const nowDev = pick
      if (wasDev.length && nowDev.length && wasDev.join() !== nowDev.join()) {
        g.push({
          key: 'dev',
          what: '장비',
          was: wasDev
            .map((x) => deviceShort(devices.find((y) => y.id === x) ?? ({ id: x } as Device)))
            .join(', '),
          now: nowDev
            .map((x) => deviceShort(devices.find((y) => y.id === x) ?? ({ id: x } as Device)))
            .join(', '),
        })
      }

      // 2) 계측기 포트 — 본보기가 쓰던 포트가 지금 랩에 있나
      const wires = (d.wiring ?? []) as TcWire[]
      const usedM = [...new Set(wires.map((w) => w.meter).filter(Boolean))]
      for (const mid of usedM) {
        if (!meters.some((x) => x.id === mid)) {
          g.push({
            key: `meter:${mid}`,
            what: '계측기',
            was: mid,
            now: meters[0] ? deviceShort(meters[0]) : '없음',
          })
        }
      }

      // 3) 스트림이 가리키는 포트
      const sp = [...new Set((d.meterCfg?.streams ?? []).flatMap((x) => [x.src, x.dst]))].filter(
        Boolean,
      ) as string[]
      if (sp.length) {
        g.push({
          key: 'ports',
          what: '계측기 포트',
          was: sp.join(', '),
          now: '이 랩에서 다시 고르세요',
        })
      }

      setBase({ meta: m, data: d })
      setGaps(g)
      setTake(Object.fromEntries(g.map((x) => [x.key, true])))
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy('')
    }
  }

  /** 베껴서 새 시험을 만든다 */
  const make = async () => {
    if (!base) return
    setBusy('make')
    setErr('')
    try {
      const r = await apiFetch('/api/tc-next-id')
      const { tcid } = (await r.json()) as { tcid: string }
      const d = { ...base.data }
      delete (d as Record<string, unknown>).tcid
      if (take.dev && pick.length) d.sessions = pick
      await tcApi.save(tcid, {
        ...d,
        tcid,
        name: want.trim().slice(0, 80) || `${base.meta.name} (복사)`,
        status: 'Draft',
      })
      onMade(tcid)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setBusy('')
    }
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="tcstart" onClick={(e) => e.stopPropagation()}>
        <div className="tcs-h">
          <b>시험 시작하기</b>
          <span className="muted small">
            하려는 것을 한 줄 적으면 닮은 시험을 찾아 베껴 드립니다
          </span>
          <span className="sp" />
          <button className="btn small" type="button" onClick={onClose}>
            닫기
          </button>
        </div>

        <div className="tcs-b">
          {/* ── 1) 무엇을, 어느 장비로 ── */}
          <div className="tcs-ask">
            <input
              autoFocus
              value={want}
              placeholder="예) 두 대 물려서 트래픽 성능 보고 싶어 · 손실 없어야 해"
              onChange={(e) => setWant(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void look()
              }}
            />
            <button
              className="btn primary"
              type="button"
              disabled={!!busy || !want.trim()}
              onClick={() => void look()}
            >
              {busy === 'look' && <i className="btn-spin" aria-hidden="true" />}
              찾기
            </button>
          </div>
          <div className="tcs-devs">
            <span>쓸 장비</span>
            {plain.length === 0 ? (
              <span className="muted small">등록된 장비가 없습니다</span>
            ) : (
              plain.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={`tcs-chip${pick.includes(d.id) ? ' on' : ''}`}
                  onClick={() =>
                    setPick((xs) =>
                      xs.includes(d.id) ? xs.filter((x) => x !== d.id) : [...xs, d.id],
                    )
                  }
                >
                  {deviceShort(d)}
                </button>
              ))
            )}
          </div>

          {err && <div className="tcs-err">{err}</div>}

          {/* ── 2) 닮은 시험 ── */}
          {found && !base && (
            <div className="tcs-list">
              {found.length === 0 ? (
                <div className="empty">닮은 시험이 없습니다 — 처음부터 만드셔야 합니다.</div>
              ) : (
                found.map((m) => (
                  <button
                    key={m.tcid}
                    type="button"
                    className="tcs-item"
                    disabled={!!busy}
                    onClick={() => void open(m)}
                  >
                    <b>{m.name || m.tcid}</b>
                    <span className="muted small">
                      {m.tcid}
                      {m.runs > 0 ? ` · ${m.runs}번 돌림` : ''}
                      {m.status ? ` · ${m.status}` : ''} · {m.why}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}

          {/* ── 3) 안 맞는 것만, 한 번에 ── */}
          {base && (
            <div className="tcs-sum">
              <div className="tcs-sum-h">
                <b>{base.meta.name}</b>
                <span className="muted small">
                  {base.meta.tcid}
                  {base.meta.runs > 0 ? ` · ${base.meta.runs}번 돌아간 시험입니다` : ''}
                </span>
                <span className="sp" />
                <button className="btn small" type="button" onClick={() => setBase(null)}>
                  다른 것 고르기
                </button>
              </div>
              {gaps.length === 0 ? (
                <div className="tcs-ok">다 맞습니다. 그대로 베끼면 됩니다.</div>
              ) : (
                <>
                  <div className="tcs-sum-t">
                    {gaps.length}가지만 봐 주세요 — 나머지는 그 시험 그대로입니다
                  </div>
                  {gaps.map((g) => (
                    <label className="tcs-gap" key={g.key}>
                      <input
                        type="checkbox"
                        checked={take[g.key] !== false}
                        onChange={(e) => setTake((t) => ({ ...t, [g.key]: e.target.checked }))}
                      />
                      <span className="tcs-gap-w">{g.what}</span>
                      <span className="tcs-gap-b">{g.was}</span>
                      <i>→</i>
                      <b>{g.now}</b>
                    </label>
                  ))}
                </>
              )}
              <div className="tcs-do">
                <button
                  className="btn primary"
                  type="button"
                  disabled={!!busy}
                  onClick={() => void make()}
                >
                  {busy === 'make' ? '만드는 중…' : '이 시험으로 만들기'}
                </button>
                <span className="muted small">
                  만든 뒤에 스텝·트래픽을 눈으로 보고 고칠 수 있습니다. 바로 돌리지 않습니다.
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
