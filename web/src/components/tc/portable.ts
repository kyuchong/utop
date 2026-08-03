import type { Device } from '@/pages/Devices'
import type { TcData } from './types'

/**
 * 시험 항목을 파일로 주고받기.
 *
 * 랩마다 UTOP 이 따로 서 있어서(운영 220.1.1.253 · 개발 220.1.1.213 …)
 * 한쪽에서 만든 시험을 다른 쪽에서 그대로 돌리고 싶은 일이 잦다. DB 를
 * 통째로 옮기는 것은 장비 비밀번호까지 따라가므로 할 수 없고, 시험 하나만
 * 파일로 떼어 옮긴다.
 *
 * 서버가 달라지면 **장비가 달라진다.** `sessions` 는 그 서버의 장비 id 라
 * 옮기면 가리킬 곳이 없다. 그래서 장비의 IP·이름·모델을 힌트로 함께 담아,
 * 받는 쪽에서 같은 장비를 찾아 붙인다.
 */

/** 파일 형식이 바뀌면 올린다. 받는 쪽이 모르는 판이면 거절한다. */
export const TC_FILE_VERSION = 1

/** 세션이 가리키던 장비. 받는 쪽에서 같은 것을 찾는 데 쓴다. */
export interface SessionHint {
  /** 보낸 쪽의 장비 id */
  id: string
  ip?: string
  name?: string
  model?: string
  role?: string
}

export interface TcFile {
  utop: number
  kind: 'tc'
  exported_at: string
  /** 어디서 나왔는지. 문제가 생겼을 때 어느 서버 것인지 알아야 한다 */
  origin?: string
  tc: TcData
  session_devices: Array<SessionHint | null>
}

/**
 * 내보낼 꾸러미를 만든다.
 *
 * 실행 결과(output·status)는 **빼지 않는다.** 옮겨 간 쪽에서 '이 시험이
 * 원래 어떤 응답을 냈는지' 를 보는 것이 판정 기준을 고칠 때 가장 도움이
 * 된다. 대신 그것이 남의 서버 결과라는 것은 이력이 아니라 스텝에만 남는다.
 */
export function buildTcFile(d: TcData, devById: Map<string, Device>): TcFile {
  const sessions = Array.isArray(d.sessions) ? (d.sessions as string[]) : []
  return {
    utop: TC_FILE_VERSION,
    kind: 'tc',
    exported_at: new Date().toISOString(),
    origin: window.location.host,
    tc: d,
    session_devices: sessions.map((id) => {
      const dev = devById.get(id)
      if (!dev) return null
      return {
        id,
        ip: dev.ip,
        name: dev.name ?? undefined,
        model: dev.model ?? undefined,
        role: dev.role ?? undefined,
      }
    }),
  }
}

/**
 * 파일 이름.
 *
 * TC ID 만으로는 폴더에 쌓였을 때 무엇인지 모른다 — `U-REQ-SYS-HW-TC-004`
 * 가 무슨 시험인지는 열어봐야 안다. 제목을 붙인다.
 * ID 앞부분이 이미 요구사항이라(`U-REQ-SYS-HW`) 요구사항을 따로 붙이지
 * 않는다. 같은 것이 두 번 들어가면 이름만 길어진다.
 */
export function tcFileName(d: TcData): string {
  const safe = (s: string, max: number) =>
    s
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '')   // 파일 이름에 못 쓰는 글자
      .replace(/\s+/g, '_')
      .slice(0, max)
      .replace(/_+$/, '')
  const id = safe(d.tcid || 'tc', 60) || 'tc'
  const name = safe(String(d.name ?? ''), 40)
  const day = new Date().toISOString().slice(0, 10)
  return [id, name, day].filter(Boolean).join('_') + '.utop.json'
}

/** 브라우저에서 파일로 내려받기 */
export function downloadJson(name: string, obj: unknown): void {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  // 바로 지우면 사파리에서 저장이 안 되는 경우가 있어 한 박자 늦춘다
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export class TcFileError extends Error {}

/** 읽어들이기. 남이 준 파일이므로 모양을 믿지 않는다. */
export function parseTcFile(text: string): TcFile {
  let o: unknown
  try {
    o = JSON.parse(text)
  } catch {
    throw new TcFileError('JSON 파일이 아닙니다')
  }
  if (!o || typeof o !== 'object') throw new TcFileError('내용이 비어 있습니다')
  const f = o as Partial<TcFile>
  if (f.kind !== 'tc') throw new TcFileError('UTOP 시험 항목 파일이 아닙니다')
  if (typeof f.utop !== 'number' || f.utop > TC_FILE_VERSION)
    throw new TcFileError(`이 UTOP 이 모르는 판입니다 (파일 v${String(f.utop)})`)
  if (!f.tc || typeof f.tc !== 'object') throw new TcFileError('시험 내용이 없습니다')
  return {
    utop: f.utop,
    kind: 'tc',
    exported_at: String(f.exported_at ?? ''),
    origin: f.origin,
    tc: f.tc,
    session_devices: Array.isArray(f.session_devices) ? f.session_devices : [],
  }
}

/**
 * 옮겨 온 세션을 이 서버의 장비에 붙인다.
 *
 * IP → 이름 → 모델 차례로 찾는다. IP 가 가장 확실하고, 랩을 옮기면 IP 는
 * 바뀌어도 이름은 그대로인 경우가 많다. 모델까지 못 찾으면 원래 id 를
 * 그대로 둔다 — 조용히 아무 장비나 붙이면 엉뚱한 곳으로 명령이 나간다.
 * 세션 칩이 「없는 장비」로 노랗게 뜨므로 사람이 고르면 된다.
 */
export function remapSessions(
  sessions: string[],
  hints: Array<SessionHint | null>,
  devices: Device[],
): { sessions: string[]; matched: number } {
  const byIp = new Map<string, Device>()
  const byName = new Map<string, Device>()
  const byModel = new Map<string, Device>()
  for (const d of devices) {
    if (d.ip && !byIp.has(d.ip)) byIp.set(d.ip, d)
    if (d.name && !byName.has(d.name)) byName.set(d.name, d)
    if (d.model && !byModel.has(d.model)) byModel.set(d.model, d)
  }

  let matched = 0
  const out = sessions.map((id, i) => {
    const h = hints[i]
    const hit =
      (h?.ip ? byIp.get(h.ip) : undefined) ??
      (h?.name ? byName.get(h.name) : undefined) ??
      (h?.model ? byModel.get(h.model) : undefined) ??
      byIp.get(id)
    if (!hit) return id
    matched++
    return hit.id
  })
  return { sessions: out, matched }
}

/**
 * 겹치지 않는 새 ID.
 *
 * 'TC-001' 이 있으면 'TC-001-2', 그것도 있으면 '-3'. 덮어쓰지 않는 것이
 * 요점이다 — 같은 이름으로 저장해서 남의 시험을 지우면 되돌릴 수 없다.
 */
/**
 * 같은 묶음의 **다음 번호**.
 *
 * 실제 ID 는 `<요구사항 이름표>-TC-<번호>` 다:
 *   KT-REQ-SYS-SW-EPON-IOP-TC-001 · U-REQ-SYS-HW-TC-004
 *
 * 그러니 `U-REQ-SYS-HW-TC-004` 를 복사할 때 나와야 하는 것은
 * `U-REQ-SYS-HW-TC-004-2` 가 아니라 `U-REQ-SYS-HW-TC-009`(지금 최대가
 * 008 이면) 다. 앞부분은 그 요구사항의 시험이라는 뜻이라 지키고, 번호만
 * 그 묶음의 다음 것으로 매긴다. 자릿수도 지킨다(001 → 009, 09 아님).
 *
 * 번호로 끝나지 않는 ID 는 규칙이 없으므로 뒤에 -2 를 붙인다.
 */
export function nextTcId(base: string, taken: Set<string>): string {
  const m = /^(.*?)(\d+)$/.exec(base.trim())
  const prefix = m?.[1]
  const digits = m?.[2]
  if (!m || !prefix || !digits) return uniqueTcId(base, taken)

  let max = 0
  for (const id of taken) {
    if (!id.startsWith(prefix)) continue
    const tail = id.slice(prefix.length)
    if (!/^\d+$/.test(tail)) continue
    max = Math.max(max, Number(tail))
  }
  const n = String(Math.max(max, Number(digits)) + 1).padStart(digits.length, '0')
  return uniqueTcId(prefix + n, taken)
}

export function uniqueTcId(base: string, taken: Set<string>): string {
  const id = base.trim() || 'TC'
  if (!taken.has(id)) return id
  for (let n = 2; n < 1000; n++) {
    const cand = `${id}-${n}`
    if (!taken.has(cand)) return cand
  }
  return `${id}-${Date.now()}`
}
