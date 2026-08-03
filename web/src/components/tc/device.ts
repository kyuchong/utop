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
