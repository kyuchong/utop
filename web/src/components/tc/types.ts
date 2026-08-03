/**
 * TC 안에서 쓰는 자료 모양.
 *
 * 전부 tc.data(JSONB) 안에 들어가므로 새 항목을 늘려도 스키마를 안 건드린다.
 * 옛 TC 에는 이 필드들이 없으므로 읽는 쪽은 항상 기본값을 준비한다.
 */

/**
 * 장비 슬롯 = 세션.
 *
 * "동일 장비에 s1, s2, s3 세션을 동시에" 라는 요구가 여기서 풀린다.
 * 슬롯은 '이 시험에서 쓰는 접속 하나' 다. 같은 장비를 telnet 으로 두 번
 * 잡으면 슬롯이 둘이고 스텝은 s1/s2 로 골라 쓴다.
 *
 * 슬롯이 장비를 직접 가리키지 않아도 된다(device_ip 가 비어도 된다).
 * TC 는 "OLT 한 대와 ONT 한 대가 필요하다" 까지만 적고, 어느 장비를 쓸지는
 * 시험을 돌릴 때 고른다 — 그래야 같은 TC 를 랩마다 돌릴 수 있다.
 */
export interface TcSlot {
  /** s1, s2 … 스텝이 이 값으로 세션을 가리킨다 */
  key: string
  /** 사람이 읽는 이름 (DUT · 대향 · 가입자단말) */
  label?: string
  /** 필요한 제품군 (OLT · L2 …). 장비를 안 정했을 때의 조건 */
  family?: string
  /**
   * 필요한 모델군 (E6000 시리즈 …).
   * 시험은 보통 모델 하나가 아니라 시리즈 단위로 돈다. 여기에 시리즈만
   * 적어두면 그 시리즈의 아무 장비로나 돌릴 수 있다.
   */
  model_group?: string
  model?: string
  /** 실제 장비를 정했을 때. 비어 있으면 실행할 때 고른다 */
  device_ip?: string
  /** telnet · ssh · console. 비면 장비의 기본 접속 */
  protocol?: string
  note?: string
}

/** 구성도의 선 하나. 슬롯의 인터페이스끼리 잇는다. */
export interface TcLink {
  from_slot: string
  from_if?: string
  to_slot: string
  to_if?: string
  note?: string
}

/**
 * 스텝 종류 (Action).
 *
 * 실제 자료에 있는 값을 전부 적는다. 전에는 'manual' | 'auto' 두 개뿐이라
 * 656스텝 중 7개만 화면에 나왔다 — cli·if·loop 가 어느 탭에도 안 걸렸다.
 *
 * 값은 옛 화면이 쓰던 문자열 그대로다. 이름을 바꾸면 이미 저장된 656스텝을
 * 전부 고쳐야 하고, 옛 화면과도 갈린다.
 */
export type StepKind =
  // 실행
  | 'cli'
  | 'instrument'
  /**
   * CLI 로는 못 하는 것들. 백엔드에는 진작 있었는데(`/api/ping`,
   * `/api/snmp-get`, `/api/snmp-set`, `/api/snmp-trap/wait`) 스텝으로 쓸
   * 길이 없었다. 실제 자료에 0건인 것은 필요 없어서가 아니라 만들 방법이
   * 없어서다 — 재부팅 뒤 언제 살아나는지는 ping 이 아니면 못 잰다.
   */
  | 'ping'
  | 'snmp_get'
  | 'snmp_set'
  | 'snmp_trap'
  // 흐름
  | 'if'
  | 'loop'
  | 'switch'
  | 'wait'
  // 접속
  | 'connect'
  | 'disconnect'
  // 기타
  | 'model'
  | 'comment'
  | 'message'
  | 'manual'
  | 'auto'

/** 응답에서 정규식으로 값을 뽑아 변수에 담는다 (iTest 의 Response Map) */
export interface TcQuery {
  /** 정규식. 옛 자료는 /…/m 형태로 슬래시까지 들어 있다 */
  q?: string
  /** 담을 변수 이름 */
  var?: string
}

/** queries 와 같은 일을 하는 옛 형태. 둘 다 살아 있어 함께 읽는다. */
export interface TcExtract {
  var?: string
  rule?: string
}

/**
 * 스텝 하나.
 *
 * 한 배열(checks)에 종류가 섞여 순서대로 들어간다. 나누면 순서가 어긋난다.
 * 블록(if·loop·switch)은 indent 로 중첩을 나타낸다 — 652스텝이 이 값을 갖고 있다.
 */
export interface TcStep {
  /** 화면 표시용 번호는 순서에서 만든다. 저장하지 않는다 */
  kind?: StepKind
  /**
   * 어느 세션으로 보낼지.
   *
   * 실제 자료는 **`data.sessions` 배열의 인덱스**(0, 1)를 담고 있다.
   * 'sN' 형태도 두 건 있어서 둘 다 받는다 — 옛 화면이 중간에 바뀐 흔적이다.
   */
  session?: string | number
  /** 블록 중첩 깊이. 0 이 최상위 */
  indent?: number
  /** 이 스텝을 건너뛴다 */
  skip?: boolean

  /** Test Step — 무엇을 하는가 (사람이 읽는 절차) */
  step?: string
  /** Test Data — 보낼 값. kind=cli 는 아래 cli 를 쓴다 */
  data?: string
  data_img?: string
  /** kind=cli 의 실제 명령. data 와 나뉘어 있는 것은 옛 화면 구조 그대로다 */
  cli?: string

  /** Expected — 기대 결과 */
  expected?: string
  expected_img?: string
  /** 판정 기준 (문자열 포함 · 정규식) */
  criteria?: string
  /**
   * 판정 종류 — contains · contains_all · notcontains · line · none.
   * 판정을 실제로 가르는 것은 이 값이다(judge.ts).
   */
  type?: string
  /** 판정 영역 좁히기 — `/식/` · `시작..끝` · 문구 */
  query?: string
  /**
   * 판정 방식의 **표시용 이름** ('라인 선택' · '문구 검증' 등).
   * 판정에는 안 쓴다. 여기에 contains 를 써 넣으면 옛 화면 배지가 깨진다.
   */
  critMode?: string
  critLines?: string
  /** 판정에서 뺄 줄. 한 줄에 하나 */
  excludeLines?: string
  excMode?: string
  /**
   * 판정 결과 — 'Pass' · 'Fail' · ''(미실행).
   * 옛 화면이 쓰는 이름이라 실행하면 status 와 함께 이쪽도 채운다.
   */
  repeatResult?: string
  /** 판정이 그렇게 난 이유 */
  reason?: string

  /** Result — 실제 응답 */
  output?: string
  /** 옛 이름. output 이 없을 때 이쪽을 본다 */
  response?: string
  /** 실행 시각 (ISO) */
  executed_at?: string
  /** PASS · FAIL · 빈 값(미실행) */
  status?: string

  /** 응답에서 변수 뽑기 */
  queries?: TcQuery[]
  extracts?: TcExtract[]

  /** kind=if · switch */
  condition?: string
  switchExpr?: string
  /** kind=loop */
  loopMode?: string
  loopVar?: string
  loopCount?: number
  forFrom?: number
  forTo?: number
  forStep?: number
  /** kind=wait */
  waitSec?: number

  /**
   * kind=ping · snmp_* — 어디로 보내는가.
   *
   * 비우면 세션의 장비 IP 를 쓴다. 세션이 CLI 세션을 못 여는 장비(SNMP 만
   * 등록된 것)를 가리킬 수도 있어서 직접 적을 수도 있게 둔다.
   */
  host?: string
  /** kind=ping — 몇 번 */
  pingCount?: number
  /** kind=snmp_* */
  oid?: string
  community?: string
  snmpVersion?: string
  snmpPort?: number
  /** kind=snmp_set — 넣을 값과 형식(i·s·u·a…). 비우면 자동 */
  snmpValue?: string
  snmpType?: string
  /** kind=snmp_trap — 몇 초까지 기다리는가 */
  trapSec?: number
  /** kind=model */
  model?: string
  modelName?: string
  /** kind=comment · message */
  text?: string
  desc?: string

  /** 실패했을 때 볼 곳 */
  rca?: string
  note?: string
  [k: string]: unknown
}

/**
 * 화면에 보일 Action 이름과 갈래.
 *
 * icon 은 아이콘 이름만 담는다 — 이 파일은 자료 모양만 다루고 화면 요소를
 * 들이지 않는다(여기서 컴포넌트를 import 하면 서버 쪽 코드가 이 타입을
 * 가져다 쓸 때 React 까지 딸려온다).
 */
export type StepIcon =
  | 'cli'
  | 'meter'
  | 'branch'
  | 'loop'
  | 'switch'
  | 'clock'
  | 'plug'
  | 'unplug'
  | 'chip'
  | 'note'
  | 'hand'
  | 'ping'
  | 'snmp'

export const STEP_KINDS: Array<{
  k: StepKind
  label: string
  group: 'run' | 'flow' | 'conn' | 'etc'
  icon: StepIcon
  /**
   * 새로 만들 때는 안 보인다.
   *
   * 목록에서 아예 빼지 않는 이유: 이미 저장된 스텝이 있다. `model` 만
   * 81건이다. 빼면 그 81건의 Action 칸이 빈 채로 뜨고, 다른 칸을 고치는
   * 순간 조용히 다른 종류가 된다.
   */
  hidden?: boolean
}> = [
  { k: 'cli', label: 'CLI', group: 'run', icon: 'cli' },
  { k: 'ping', label: 'Ping', group: 'run', icon: 'ping' },
  { k: 'snmp_get', label: 'SNMP Get', group: 'run', icon: 'snmp' },
  { k: 'snmp_set', label: 'SNMP Set', group: 'run', icon: 'snmp' },
  { k: 'snmp_trap', label: 'Trap 대기', group: 'run', icon: 'snmp' },
  { k: 'instrument', label: '계측기', group: 'run', icon: 'meter' },
  { k: 'if', label: 'If', group: 'flow', icon: 'branch' },
  { k: 'loop', label: 'Loop', group: 'flow', icon: 'loop' },
  { k: 'switch', label: 'Switch', group: 'flow', icon: 'switch' },
  { k: 'wait', label: 'Wait', group: 'flow', icon: 'clock' },
  { k: 'model', label: 'Model', group: 'etc', icon: 'chip', hidden: true },
  { k: 'comment', label: 'Comment', group: 'etc', icon: 'note' },
  { k: 'message', label: 'Message', group: 'etc', icon: 'note' },
  { k: 'manual', label: 'Manual', group: 'etc', icon: 'hand' },
  // 접속은 맨 뒤로. **안 넣어도 돌아간다** — CLI 스텝이 세션이 없으면
  // 알아서 연다(runner.ts). 앞에 두면 '이걸 먼저 넣어야 하나' 를 매번
  // 생각하게 되는데, 실제로 필요한 것은 656스텝 중 15건뿐이다.
  //
  // 그래도 남기는 이유: 로그인 과정 자체를 시험하거나(배너·계정 실패),
  // 재부팅 뒤 다시 붙는 시점을 못박아야 하는 시험이 있다.
  //
  // 'Close' 라고 적어 뒀더니 Connect 의 짝으로 안 읽혔다. 저장되는 값은
  // 그대로 두고 이름만 짝에 맞춘다.
  { k: 'connect', label: 'Connect', group: 'conn', icon: 'plug' },
  { k: 'disconnect', label: 'Disconnect', group: 'conn', icon: 'unplug' },
]

const KIND_MAP = new Map(STEP_KINDS.map((x) => [x.k, x]))

/** 「+ 스텝」 에 내놓을 것. 옛 자료에만 남은 종류는 뺀다. */
export const ADD_KINDS = STEP_KINDS.filter((x) => !x.hidden)

/** 모르는 종류가 와도 화면이 비지 않게 한다 — 옛 자료에 무엇이 있을지 모른다 */
export function stepKindInfo(k?: string) {
  return (
    KIND_MAP.get((k || 'cli') as StepKind) ?? {
      k: (k || 'cli') as StepKind,
      label: k || '(없음)',
      group: 'etc' as const,
      icon: 'note' as StepIcon,
    }
  )
}

/** 2열에 한 줄로 보일 요약. 종류마다 읽어야 할 값이 다르다. */
export function stepSummary(s: TcStep): string {
  const k = s.kind || 'cli'
  if (k === 'cli') return (s.cli || s.data || s.step || '').trim()
  if (k === 'ping')
    return `${(s.host || '세션 장비').trim()}${s.pingCount ? ` · ${s.pingCount}회` : ''}`
  if (k === 'snmp_get') return (s.oid || s.step || '').trim()
  if (k === 'snmp_set')
    return `${(s.oid || '').trim()}${s.snmpValue ? ` = ${s.snmpValue}` : ''}`.trim()
  if (k === 'snmp_trap')
    return `${(s.oid || '아무 Trap').trim()} · ${s.trapSec ?? 15}초 대기`
  if (k === 'wait') return s.waitSec ? `${s.waitSec}초` : (s.data || '').trim()
  if (k === 'if') return (s.condition || s.step || '').trim()
  if (k === 'switch') return (s.switchExpr || s.step || '').trim()
  if (k === 'loop') {
    if (s.forFrom !== undefined && s.forTo !== undefined)
      return `${s.forFrom} ~ ${s.forTo}${s.loopVar ? ` — $${s.loopVar}` : ''}`
    return s.loopCount ? `${s.loopCount}회` : (s.step || '').trim()
  }
  // 세션 번호만 찍으면 '0' 이 되어 아무 뜻이 없다. 부르는 쪽에서 장비
  // 이름을 붙여 주도록 여기서는 비워 둔다.
  if (k === 'connect' || k === 'disconnect') return ''
  if (k === 'model') return (s.modelName || s.model || '').trim()
  if (k === 'comment' || k === 'message') return (s.text || s.desc || s.step || '').trim()
  return (s.step || s.data || '').trim()
}

/** Result 는 이름이 두 벌이다. 새 것부터 본다. */
export function stepResult(s: TcStep): string {
  return String(s.output ?? s.response ?? '')
}

/**
 * 이 스텝의 판정 결과 — 'PASS' · 'FAIL' · ''(미실행).
 *
 * 이름이 두 벌이다. 옛 화면은 `repeatResult` 에 'Pass'/'Fail' 을 적고,
 * 새 화면은 `status` 에 'PASS'/'FAIL' 을 적는다. 실제 자료에는 옛 이름만
 * 든 스텝이 있어서 둘 다 읽는다 — 한쪽만 보면 656스텝이 전부 미실행으로
 * 보인다.
 */
export function stepStatus(s: TcStep): string {
  const v = String(s.status ?? s.repeatResult ?? '').trim().toUpperCase()
  return v === 'PASS' || v === 'FAIL' ? v : ''
}

/**
 * 이 스텝이 쓰는 세션의 자리 번호.
 *
 * 자료에 0/1 같은 인덱스와 's1' 이 섞여 있다. 둘 다 0-기준 번호로 맞춘다 —
 * 화면은 한 가지 형태만 다루면 된다.
 */
export function sessionIndex(v: string | number | undefined): number {
  if (v === undefined || v === null || v === '') return -1
  if (typeof v === 'number') return v
  const m = /^s(\d+)$/i.exec(v.trim())
  if (m) return Number(m[1]) - 1
  const n = Number(v)
  return Number.isFinite(n) ? n : -1
}

export interface TcData {
  tcid?: string
  name?: string
  status?: string
  req_id?: string
  type?: string
  severity?: string
  kind?: string
  customer?: string
  run_type?: string
  origin?: string
  created_by?: string
  updated_by?: string
  created_at?: string
  updated_at?: string
  /** 시험 목적 */
  object_md?: string
  /** 사전 준비 조건 */
  precondition_md?: string
  slots?: TcSlot[]
  links?: TcLink[]
  /** 스텝. 옛 이름이 checks 라 그대로 쓴다 */
  checks?: TcStep[]
  [k: string]: unknown
}

/** 다음 슬롯 키. s1 부터 비어 있는 번호를 찾는다. */
export function nextSlotKey(slots: TcSlot[]): string {
  const used = new Set(slots.map((s) => s.key))
  for (let i = 1; i < 100; i++) {
    const k = `s${i}`
    if (!used.has(k)) return k
  }
  return `s${slots.length + 1}`
}
