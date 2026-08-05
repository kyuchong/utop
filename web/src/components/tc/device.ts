import type { Device, DeviceAccess } from '@/pages/Devices'

/**
 * 장비 → 접속 파라미터.
 *
 * `/api/session-open` · `/api/run-cli` · `/api/lab-test` 가 전부 같은 모양을
 * 받는다(backend/main.py 의 `_netmiko_params`). 화면 여러 곳에서 이 몸통을
 * 손으로 짜맞추다 보면 한 군데만 enable 비번을 빼먹는 식으로 어긋난다.
 */
export interface ConnParams {
  host: string
  port: number
  protocol: string
  username: string
  password: string
  /** enable 비밀번호. netmiko 가 secret 이라 부른다 */
  secret: string
}

/** 방식별 기본 포트. console 은 터미널 서버가 장비마다 배정해 기본값이 없다. */
const DEFAULT_PORT: Record<string, number> = { ssh: 22, telnet: 23, console: 0, snmp: 161 }

/** CLI 명령을 보낼 수 있는 방식. snmp 는 조회용이라 세션을 못 연다. */
export const CLI_PROTOCOLS = ['telnet', 'ssh', 'console']

export function accessOf(dev: Device, protocol: string): DeviceAccess | undefined {
  return (dev.access ?? []).find((a) => a.protocol === protocol)
}

/** 이 장비가 실제로 쓸 접속 방식. 지정이 없으면 장비의 기본값 */
export function protocolOf(dev: Device, want?: string): string {
  const p = (want || dev.protocol || '').trim().toLowerCase()
  if (p) return p
  // 기본값도 없으면 등록된 방식 중 CLI 가 되는 첫 번째
  const acc = (dev.access ?? []).find((a) => CLI_PROTOCOLS.includes(a.protocol))
  return acc?.protocol ?? 'telnet'
}

/**
 * 접속 파라미터를 만든다.
 *
 * 계정은 방식별 등록(device_access)이 있으면 그쪽이 우선이다 — 콘솔은
 * 계정이 없고 telnet 만 있는 장비가 실제로 있다. 없으면 장비 공용 계정.
 */
export function connParams(dev: Device, want?: string): ConnParams {
  const protocol = protocolOf(dev, want)
  const acc = accessOf(dev, protocol)
  return {
    host: (acc?.host || dev.ip || '').trim(),
    port: acc?.port || dev.port || DEFAULT_PORT[protocol] || 23,
    protocol,
    username: acc?.username || dev.username || '',
    password: acc?.password || dev.password || '',
    secret: acc?.enable_password || dev.enable_password || '',
  }
}

/** 목록·칩에 적는 이름. 이름이 없으면 IP 가 곧 이름이다. */
export function deviceLabel(dev: Device): string {
  return (dev.name || dev.ip || dev.id || '').trim()
}

/**
 * 계측기인가.
 *
 * 계측기와 스위치는 하는 일이 아주 다르다 — 계측기에는 CLI 로 명령을 보내지
 * 않고, 트래픽을 흘리는 데만 쓴다. 목록에 IP 만 뜨면 어느 쪽인지 알 수
 * 없어서 CLI 스텝에 계측기를 앉히는 일이 생긴다.
 */
export function isMeter(d: Device): boolean {
  return (
    d.role === '계측기' ||
    d.device_group === '계측기' ||
    /spirent|stc|ixia|n2x/i.test(`${d.model ?? ''} ${d.name ?? ''} ${d.vendor ?? ''}`)
  )
}

/** N2X 인가 STC 인가. 포트 표기도 부르는 API 도 다르다 */
export function meterKind(d: Device | undefined): 'n2x' | 'stc' {
  if (!d) return 'n2x'
  return /spirent|stc/i.test(`${d.model ?? ''} ${d.name ?? ''} ${d.vendor ?? ''}`) ? 'stc' : 'n2x'
}

/**
 * 목록에 붙일 짧은 꼬리표 — 계측기면 N2X·STC, 아니면 역할이나 모델.
 *
 * 이름을 안 적어 둔 장비가 많아 `deviceLabel` 이 IP 만 내놓는 일이 흔하다.
 * 그러면 `220.1.1.254` 와 `210.1.2.248` 중 어느 쪽이 계측기인지 모른다.
 */
export function deviceTag(d: Device): string {
  if (isMeter(d)) return meterKind(d) === 'stc' ? 'STC' : 'N2X'
  return (d.role || d.model || '').trim()
}

/**
 * 계측기에 어떻게 붙는가 — 사람이 읽는 한 줄.
 *
 * 계측기는 SSH 로 안 붙는다. 등록할 때 접속 방식이 SSH 로 남아 있으면
 * 화면이 거짓말을 한다.
 *
 *  · N2X  — 백엔드가 N2X Tcl(`n2xtclsh85`) 을 띄워 두고 그 프로세스와
 *           주고받는다. Tcl 쪽이 Agilent API 로 섀시에 붙는다
 *  · STC  — Spirent REST 서버(기본 localhost:8888)에 HTTP 로 말하고,
 *           그 서버가 섀시에 붙는다
 */
export function meterTransport(d: Device): string {
  return meterKind(d) === 'stc' ? `REST ${d.port ?? 8888}` : 'Tcl 세션'
}
