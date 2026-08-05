import { useMemo, useState } from 'react'
import { apiFetch } from '@/api/client'
import type { Device } from '@/pages/Devices'
import { connParams, deviceLabel, deviceTag, isMeter, meterTransport, protocolOf } from './device'

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
  /** 세션 목록을 펼쳤는가 */
  const [panel, setPanel] = useState(false)
  /** 연결 확인 중인 자리 */
  const [testing, setTesting] = useState<number | null>(null)

  const devById = useMemo(() => {
    const m = new Map<string, Device>()
    for (const d of devices) if (d.id) m.set(d.id, d)
    return m
  }, [devices])

  /**
   * 연결 끊기.
   *
   * 세션은 한 번 열리면 서버에 남아 다음 스텝이 그대로 이어 쓴다(그래야
   * enable 과 config 모드가 유지된다). 그런데 끊을 방법이 화면에 없었다 —
   * × 는 자리를 빼는 것이지 연결을 끊는 것이 아니다.
   *
   * 장비를 재부팅했거나 다른 계정으로 다시 붙어야 할 때 필요하다.
   */
  const close = async (i: number, dev: Device) => {
    setTesting(i)
    try {
      const r = await apiFetch('/api/session-close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(connParams(dev)),
      })
      const d = (await r.json()) as { ok?: boolean; error?: string }
      if (d.ok) onMsg('ok', `S${i + 1} ${deviceLabel(dev)} 연결을 끊었습니다`)
      else onMsg('err', `S${i + 1} 끊지 못했습니다 — ${d.error || '이유 불명'}`)
    } catch (e) {
      onMsg('err', `끊지 못했습니다 — ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setTesting(null)
    }
  }

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

  /** 세션 한 줄. 실행 줄에 늘어놓을 때와 목록으로 펼칠 때가 같은 모양이다. */
  const row = (id: string, i: number) => {
    const dev = devById.get(id)
    // 등록이 지워진 장비를 가리키고 있을 수 있다. 목록에서 지우지 않고
    // 그 자리를 남겨 둔다 — 조용히 다른 장비로 바뀌면 엉뚱한 곳에
    // 명령이 나간다.
    const proto = dev ? protocolOf(dev) : ''
    return (
      <span
        className={`tc-sess${dev ? '' : ' gone'}${dev && isMeter(dev) ? ' meter' : ''}`}
        key={`${id}-${i}`}
      >
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
              {/*
                세션은 **명령을 보내는 자리**다. 계측기에는 CLI 로 명령을
                보내지 않는다 — N2X 는 Tcl, STC 는 REST 로 붙고, 어느 포트에
                꽂혔는지는 토폴로지가 안다. 그래서 목록에서 뺀다.

                이미 앉혀 둔 것은 남겨 둔다. 조용히 사라지면 왜 없어졌는지
                모른 채 스텝의 세션 번호만 어긋난다.
              */}
              {devices.filter((d) => !isMeter(d) || d.id === id).map((d) => {
                const tag = deviceTag(d)
                return (
                  <option key={d.id} value={d.id}>
                    {deviceLabel(d)}
                    {tag ? ` · ${tag}` : ''}
                  </option>
                )
              })}
            </select>
            {/* 계측기는 SSH 로 안 붙는다. 등록할 때 접속 방식이 SSH 로
                남아 있어도 그대로 적으면 화면이 거짓말을 한다 — 실제로
                무엇으로 붙는지를 적는다. */}
            {dev && (
              <span className={`tc-sess-ip${isMeter(dev) ? ' meter' : ''}`}>
                {isMeter(dev) ? (
                  // 고르는 칸이 이미 `210.1.2.248 · N2X` 라 여기서 종류와
                  // IP 를 또 적으면 같은 말이 세 번이다. 붙는 방식만 적는다.
                  <>계측기 · {meterTransport(dev)}</>
                ) : (
                  <>
                    {proto.toUpperCase()} {dev.ip}
                  </>
                )}
              </span>
            )}
            {dev && isMeter(dev) && (
              <span className="tc-sess-warn" title="계측기는 토폴로지 탭에서 씁니다">
                계측기는 세션이 아닙니다 — 토폴로지에서 배선으로 씁니다
              </span>
            )}
            <button
              type="button"
              className="tc-sess-b"
              disabled={!dev || isMeter(dev) || testing !== null}
              title="연결 확인"
              onClick={() => dev && void test(i, dev)}
            >
              {testing === i ? '…' : '⚡'}
            </button>
            <button
              type="button"
              className="tc-sess-b"
              disabled={!dev || testing !== null}
              title="연결 끊기 — 자리는 그대로 두고 접속만 끊습니다"
              aria-label={`S${i + 1} 연결 끊기`}
              onClick={() => dev && void close(i, dev)}
            >
              ⏏
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
  }

  /** 몇 대를 쓰는가. 같은 장비를 여러 자리에 앉히는 일이 흔하다. */
  const devCount = new Set(sessions).size
  const only = sessions.length === 1 ? devById.get(sessions[0] ?? '') : undefined

  if (sessions.length === 0) {
    return (
      <>
        <button className="btn small" type="button" onClick={() => setPick(true)}>
          + 세션
        </button>
        {pick && (
          <DevicePicker
            devices={devices}
            sessions={sessions}
            onAdd={onAdd}
            onClose={() => setPick(false)}
          />
        )}
      </>
    )
  }

  return (
    <span className="tc-sessmore">
      {/* 늘어놓지 않고 버튼 하나로 접는다. 17개를 늘어놓으면 여섯 줄이 되어
          실행 줄이 화면 절반을 먹는다. 대신 버튼이 '지금 무엇에 붙는지' 는
          말해 준다 — 한 대뿐이면 그 장비를, 여럿이면 개수를. */}
      <button
        className={`btn small${panel ? ' primary' : ''}`}
        type="button"
        aria-haspopup="true"
        aria-expanded={panel}
        title="세션 목록 펼치기"
        onClick={() => setPanel((v) => !v)}
      >
        세션 {sessions.length}
        <span className="muted">
          {' · '}
          {only ? deviceLabel(only) : `장비 ${devCount}`}
        </span>
        {' ▾'}
      </button>

      {panel && (
        <>
          <div className="tc-menu-back" onClick={() => setPanel(false)} />
          <div className="tc-sesspanel">
            <div className="tc-sesspanel-head">
              <b>세션 {sessions.length}개</b>
              <span className="muted small">장비 {devCount}대</span>
              <span className="sp" />
              <button className="btn small" type="button" onClick={() => setPick(true)}>
                + 세션
              </button>
            </div>
            <div className="tc-sesspanel-body">{sessions.map(row)}</div>
          </div>
        </>
      )}

      {pick && (
        <DevicePicker
          devices={devices}
          sessions={sessions}
          onAdd={onAdd}
          onClose={() => setPick(false)}
        />
      )}
    </span>
  )
}

interface PickProps {
  devices: Device[]
  /** 지금 앉아 있는 자리들. 어느 장비를 몇 개 넣었는지 보여주려고 받는다 */
  sessions: string[]
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
function DevicePicker({ devices, sessions, onAdd, onClose }: PickProps) {
  const [lab, setLab] = useState('')
  const [vendor, setVendor] = useState('')
  const [role, setRole] = useState('')
  const [group, setGroup] = useState('')
  const [q, setQ] = useState('')
  /** 이 창에서 방금 더한 개수. 몇 개를 넣었는지 보이지 않으면 겹쳐 넣게 된다 */
  const [added, setAdded] = useState(0)

  /**
   * 장비별로 이미 몇 자리를 잡았는가.
   *
   * ＋를 여러 번 눌러 같은 장비가 17자리가 되는 일이 실제로 있었다.
   * 줄에 「이미 3」 이 보이면 손이 멈춘다.
   */
  const taken = new Map<string, number>()
  for (const id of sessions) taken.set(id, (taken.get(id) ?? 0) + 1)

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
            지금 {sessions.length}자리{added > 0 ? ` · 방금 ${added}개 추가` : ''}
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
                <span className="dp-add">
                  {taken.has(d.id) && <b className="dp-taken">이미 {taken.get(d.id)}</b>}
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
