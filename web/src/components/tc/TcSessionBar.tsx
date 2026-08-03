import { useMemo, useState } from 'react'
import { apiFetch } from '@/api/client'
import type { Device } from '@/pages/Devices'
import { connParams, deviceLabel, protocolOf } from './device'

interface Props {
  /** 이 TC 가 쓰는 세션 — `data.sessions`, 장비 id 배열 */
  sessions: string[]
  devices: Device[]
  onAdd: (deviceId: string) => void
  onPick: (index: number, deviceId: string) => void
  onRemove: (index: number) => void
  onMsg: (kind: 'ok' | 'err', text: string) => void
}

/**
 * 세션 줄 — 이 시험이 어느 장비에 붙는가.
 *
 * 스텝은 장비 IP 를 직접 들고 있지 않다. `data.sessions` 배열의 **자리
 * 번호**만 갖고 있고(0, 1 …), 그 자리에 어느 장비를 앉힐지는 여기서 정한다.
 * 그래서 같은 TC 를 랩마다 다른 장비로 돌릴 수 있고, 같은 장비를 두 자리에
 * 앉히면 세션 두 개를 동시에 쓴다.
 *
 * 이 줄이 없어서 스텝의 Session 칸이 늘 비어 있었다 — 고를 것이 없었다.
 */
export default function TcSessionBar({
  sessions,
  devices,
  onAdd,
  onPick,
  onRemove,
  onMsg,
}: Props) {
  const [pick, setPick] = useState(false)
  /** 연결 확인 중인 자리 */
  const [testing, setTesting] = useState<number | null>(null)

  const devById = useMemo(() => {
    const m = new Map<string, Device>()
    for (const d of devices) if (d.id) m.set(d.id, d)
    return m
  }, [devices])

  const test = async (i: number, dev: Device) => {
    if (!dev.ip) {
      onMsg('err', `${deviceLabel(dev)} 에 IP 가 없습니다 — 장비 등록에서 넣으세요`)
      return
    }
    setTesting(i)
    try {
      const r = await apiFetch('/api/lab-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(connParams(dev)),
      })
      const d = (await r.json()) as { ok?: boolean; prompt?: string; error?: string }
      if (d.ok) onMsg('ok', `S${i + 1} ${deviceLabel(dev)} 연결됨${d.prompt ? ` · ${d.prompt}` : ''}`)
      else onMsg('err', `S${i + 1} ${deviceLabel(dev)} 연결 실패 — ${d.error || '이유 불명'}`)
    } catch (e) {
      onMsg('err', `연결 확인 실패 — ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setTesting(null)
    }
  }

  return (
    <>
      {sessions.map((id, i) => {
        const dev = devById.get(id)
        // 등록이 지워진 장비를 가리키고 있을 수 있다. 목록에서 지우지 않고
        // 그 자리를 남겨 둔다 — 조용히 다른 장비로 바뀌면 엉뚱한 곳에
        // 명령이 나간다.
        const proto = dev ? protocolOf(dev) : ''
        return (
          <span className={`tc-sess${dev ? '' : ' gone'}`} key={`${id}-${i}`}>
            {/* 스텝 줄·터미널의 자리 표시와 같은 색을 쓴다 — 색이 곧 자리다 */}
            <b className="tc-sess-n" data-s={i % 4}>
              S{i + 1}
            </b>
            <select
              className="tc-sess-dev"
              value={id}
              title={dev ? `${deviceLabel(dev)} · ${dev.ip}` : '등록되지 않은 장비입니다'}
              onChange={(e) => onPick(i, e.target.value)}
            >
              {!dev && <option value={id}>{id} (없는 장비)</option>}
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {deviceLabel(d)}
                </option>
              ))}
            </select>
            {dev && (
              <span className="tc-sess-ip">
                {proto.toUpperCase()} {dev.ip}
              </span>
            )}
            <button
              type="button"
              className="tc-sess-b"
              disabled={!dev || testing !== null}
              title="연결 확인"
              onClick={() => dev && void test(i, dev)}
            >
              {testing === i ? '…' : '⚡'}
            </button>
            <button
              type="button"
              className="tc-sess-x"
              aria-label={`S${i + 1} 제거`}
              title="이 세션 제거"
              onClick={() => onRemove(i)}
            >
              ×
            </button>
          </span>
        )
      })}

      <button className="btn small" type="button" onClick={() => setPick(true)}>
        + 세션
      </button>

      {pick && (
        <DevicePicker
          devices={devices}
          count={sessions.length}
          onAdd={onAdd}
          onClose={() => setPick(false)}
        />
      )}
    </>
  )
}

interface PickProps {
  devices: Device[]
  /** 지금 몇 자리인지. 추가하면 S(count+1) 이 된다 */
  count: number
  onAdd: (deviceId: string) => void
  onClose: () => void
}

/** 셀렉트에 넣을 값 목록 — 실제로 등록된 값만 */
function optionsOf(devices: Device[], get: (d: Device) => string): string[] {
  const s = new Set<string>()
  for (const d of devices) {
    const v = get(d)
    if (v) s.add(v)
  }
  return [...s].sort()
}

/**
 * 장비 고르기.
 *
 * 창을 닫지 않고 여러 번 추가할 수 있다 — 시험은 보통 DUT 한 대로 끝나지
 * 않고 대향·가입자단말까지 두세 자리를 한 번에 잡는다.
 */
function DevicePicker({ devices, count, onAdd, onClose }: PickProps) {
  const [lab, setLab] = useState('')
  const [vendor, setVendor] = useState('')
  const [role, setRole] = useState('')
  const [group, setGroup] = useState('')
  const [q, setQ] = useState('')
  /** 이 창에서 방금 더한 개수. 몇 개를 넣었는지 보이지 않으면 겹쳐 넣게 된다 */
  const [added, setAdded] = useState(0)

  const byLab = devices.filter((d) => !lab || (d.lab ?? '') === lab)
  const byVendor = byLab.filter((d) => !vendor || (d.vendor ?? '') === vendor)
  const byRole = byVendor.filter((d) => !role || (d.role ?? '') === role)

  const needle = q.trim().toLowerCase()
  const rows = byRole.filter(
    (d) =>
      (!group || (d.model_group ?? '') === group) &&
      (!needle ||
        `${d.name ?? ''} ${d.ip ?? ''} ${d.model ?? ''}`.toLowerCase().includes(needle)),
  )

  const sel = (
    label: string,
    value: string,
    set: (v: string) => void,
    opts: string[],
  ) => (
    <label className="dp-f">
      <span>{label}</span>
      <select value={value} onChange={(e) => set(e.target.value)}>
        <option value="">전체</option>
        {opts.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  )

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div
        className="modal dp"
        role="dialog"
        aria-modal="true"
        aria-label="세션에 넣을 장비 고르기"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <b>세션 장비 고르기</b>
          <span className="muted small">
            지금 {count}자리{added > 0 ? ` · 방금 ${added}개 추가` : ''}
          </span>
          <button className="modal-x" type="button" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <div className="dp-filter">
          {sel('Lab', lab, (v) => { setLab(v); setVendor(''); setRole(''); setGroup('') },
            optionsOf(devices, (d) => d.lab ?? ''))}
          {sel('벤더', vendor, (v) => { setVendor(v); setRole(''); setGroup('') },
            optionsOf(byLab, (d) => d.vendor ?? ''))}
          {sel('제품군', role, (v) => { setRole(v); setGroup('') },
            optionsOf(byVendor, (d) => d.role ?? ''))}
          {sel('모델군', group, setGroup, optionsOf(byRole, (d) => d.model_group ?? ''))}
          <label className="dp-f grow">
            <span>검색 — 이름 · IP · 모델</span>
            <input value={q} placeholder="예: E5010" onChange={(e) => setQ(e.target.value)} />
          </label>
          <span className="muted small dp-cnt">{rows.length}대</span>
        </div>

        <div className="dp-body">
          <div className="dp-row th">
            <span>장비</span>
            <span>모델</span>
            <span>제품군</span>
            <span>접속</span>
            <span />
          </div>
          {rows.length === 0 ? (
            <div className="empty">조건에 맞는 장비가 없습니다.</div>
          ) : (
            rows.map((d) => (
              <div className="dp-row" key={d.id}>
                <span className="dp-nm">
                  <b>{deviceLabel(d)}</b>
                  <span className="muted small">{d.ip || 'IP 없음'}</span>
                </span>
                <span className="muted small">{d.model || '–'}</span>
                <span className="muted small">{d.role || '–'}</span>
                <span className="muted small">{protocolOf(d).toUpperCase()}</span>
                <span>
                  <button
                    className="btn small primary"
                    type="button"
                    disabled={!d.ip}
                    title={d.ip ? '' : 'IP 가 없어 접속할 수 없습니다'}
                    onClick={() => {
                      onAdd(d.id)
                      setAdded((n) => n + 1)
                    }}
                  >
                    ＋
                  </button>
                </span>
              </div>
            ))
          )}
        </div>

        <div className="modal-foot">
          <span className="muted small">
            같은 장비를 두 번 넣으면 세션 두 개를 동시에 씁니다.
          </span>
          <button className="btn" type="button" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}
