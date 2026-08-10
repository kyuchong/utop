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

/**
 * 이 장비가 실제로 쓸 접속 방식.
 *
 * 순서가 중요하다. 전에는 `dev.protocol` 을 제일 먼저 봤는데, 그 칸은
 * 스키마에서 **`'ssh'` 가 기본값**이다(db/schema.sql). 접속 방식이
 * device_access 표로 옮겨간 뒤로 아무도 그 칸을 고치지 않으니, telnet
 * 으로 등록한 장비도 거기엔 여전히 `ssh` 가 적혀 있다 — 그래서 무엇을
 * 골라 두든 22번 포트로 나갔다.
 *
 * 그래서 **등록된 접속(device_access)이 먼저**다. 「기본」 으로 표시된
 * 것, 없으면 살아 있는 CLI 방식 중 첫 번째. `dev.protocol` 은 접속을
 * 하나도 등록하지 않은 옛 장비에만 쓴다.
 */
export function protocolOf(dev: Device, want?: string): string {
  const w = (want || '').trim().toLowerCase()
  if (w) return w

  const cli = (dev.access ?? []).filter(
    (a) => CLI_PROTOCOLS.includes(a.protocol) && a.enabled !== false,
  )
  const def = cli.find((a) => a.is_default)
  if (def) return def.protocol
  // 「기본」 표시가 없으면 차례로 고른다. 등록 순서를 그대로 쓰면 안 된다 —
  // 서버가 protocol 이름 순으로 주므로 ssh 가 telnet 보다 앞이라, 둘 다
  // 등록한 장비는 늘 ssh 로 나갔다. 유비쿼스는 telnet 이 주력이다
  // (backend/db.py 의 CLI_PROTOCOLS 와 같은 차례).
  for (const want of CLI_PROTOCOLS) {
    const hit = cli.find((a) => a.protocol === want)
    if (hit) return hit.protocol
  }

  // 접속을 하나도 안 등록한 옛 장비 — 그때는 장비 칸을 믿는 수밖에 없다
  return (dev.protocol || '').trim().toLowerCase() || 'telnet'
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
  // 이름·모델에 'ixia' 가 들었는지로 넘겨짚지 않는다.
  //
  // 「계측기」 화면은 `role === '계측기'` 만 보고, 「장비」 화면은 그것만
  // 뺀다. 여기서만 넓게 잡으면 모델명에 N2X 가 든 장비가 두 목록 어디에도
  // 안 나오면서 세션에서는 빠지고 배선 목록에는 뜬다 — 어디서 고쳐야
  // 하는지 알 수 없는 상태가 된다. 옛 화면(`_isInstrument`)도 역할로만
  // 봤다.
  return d.role === '계측기' || d.device_group === '계측기'
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
