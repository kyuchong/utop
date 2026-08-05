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
  /**
   * 두 값을 견주어 **합격·불합격을 낸다.**
   *
   * If 는 갈래를 고를 뿐이라 조건이 거짓이어도 불합격이 아니다. '이 값이
   * 저 값과 같아야 한다' 가 곧 시험인 경우가 그것과 다르다 — 그럴 때 쓴다.
   * 장비로는 아무것도 안 나간다.
   */
  | 'diff'
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
  /**
   * 사진 폭(px). 붙여넣은 화면 캡쳐는 크기가 제각각이라 그대로 두면
   * 어떤 줄은 글씨가 안 보이고 어떤 줄은 한 화면을 다 먹는다.
   */
  data_img_w?: number
  /** kind=cli 의 실제 명령. data 와 나뉘어 있는 것은 옛 화면 구조 그대로다 */
  cli?: string

  /** Expected — 기대 결과 */
  expected?: string
  expected_img?: string
  expected_img_w?: number
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
  /**
   * kind=if — 조건이 거짓이면 **불합격**으로 본다.
   *
   * If 는 본래 흐름을 가르는 줄이라 자체로 합격·불합격을 내지 않는다
   * (iTest 도 그렇다). 그런데 조건을 그대로 판정으로 쓰고 싶을 때가 있다 —
   * '모델이 E5924RL 이어야 한다' 처럼. 그럴 때 켠다.
   */
  assertIf?: boolean
  /**
   * kind=if — 지난번에 돌렸을 때 조건이 참이었나. 'Y' · 'N' · 없음.
   *
   * 판정(status)과는 다른 값이다. If 는 판정을 안 내지만 참이었는지는
   * 줄에 보여야 한다 — 안 보이면 돌리고 나서도 어느 갈래로 갔는지 모른다.
   */
  condResult?: string
  switchExpr?: string
  /** kind=loop */
  loopMode?: string
  loopVar?: string
  loopCount?: number
  forFrom?: number
  forTo?: number
  forStep?: number
  /** kind=diff — 견줄 두 값과 견주는 법 */
  cmpLeft?: string
  cmpOp?: string
  cmpRight?: string

  /** kind=wait */
  waitSec?: number
  /**
   * kind=cli — 프롬프트가 온 뒤 얼마나 더 기다릴지(초).
   *
   * 프롬프트 뒤에 늦게 올라오는 syslog 를 받으려는 대기다. 기본 0.3 초면
   * 대부분 충분하고, `reload` 처럼 한참 뒤에 뭔가 더 뱉는 명령에만 올린다.
   * 예전에는 2초가 코드에 박혀 있어 명령마다 그만큼 그냥 나갔다.
   */
  tailWait?: number

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
  | 'diff'

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
  { k: 'diff', label: 'Diff', group: 'run', icon: 'diff' },
  { k: 'instrument', label: '계측기', group: 'run', icon: 'meter' },
  { k: 'if', label: 'If', group: 'flow', icon: 'branch' },
  { k: 'loop', label: 'Loop', group: 'flow', icon: 'loop' },
  { k: 'switch', label: 'Switch', group: 'flow', icon: 'switch' },
  { k: 'wait', label: 'Wait', group: 'flow', icon: 'clock' },
  { k: 'model', label: 'Model', group: 'etc', icon: 'chip', hidden: true },
  { k: 'comment', label: 'Comment', group: 'etc', icon: 'note' },
  { k: 'message', label: 'Message', group: 'etc', icon: 'note' },
  // 수동 스텝은 Manual Step 탭에서 만든다. Automation 의 「+ 스텝」 에
  // 두면 같은 것을 두 군데서 만들게 되고, 어느 탭 것인지 헷갈린다.
  { k: 'manual', label: 'Manual', group: 'etc', icon: 'hand', hidden: true },
  // 접속은 「+ 스텝」 에 안 내놓는다. **안 넣어도 돌아간다** — CLI 스텝이
  // 세션이 없으면 알아서 연다(runner.ts). 내놓으면 '이걸 먼저 넣어야 하나'
  // 를 매번 생각하게 되는데, 실제로 쓰는 것은 656스텝 중 31건뿐이다.
  //
  // 종류 자체를 지우지는 않는다. 이미 저장된 31건이 있고, 지우면 그 줄의
  // Action 칸이 빈 채로 떠서 다른 칸을 고치는 순간 조용히 다른 종류가 된다.
  // 로그인 과정 자체를 시험하거나(배너·계정 실패) 재부팅 뒤 다시 붙는
  // 시점을 못박아야 하는 시험은 그 31건이 계속 쓴다.
  //
  // 'Close' 라고 적어 뒀더니 Connect 의 짝으로 안 읽혔다. 저장되는 값은
  // 그대로 두고 이름만 짝에 맞춘다.
  { k: 'connect', label: 'Connect', group: 'conn', icon: 'plug', hidden: true },
  { k: 'disconnect', label: 'Disconnect', group: 'conn', icon: 'unplug', hidden: true },
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

/**
 * 종류마다 '내용' 이 어느 칸에 들어가는가.
 *
 * 흩어져 있으면 화면마다 다른 칸을 읽게 된다 — 실제로 Manual 스텝의
 * `data` 를 실행기가 CLI 명령으로 읽어 장비에 보낸 일이 있었다.
 * 한 곳에 적어 두고 화면·실행기·요약이 모두 이것을 따른다.
 *
 * | 종류        | 내용 칸                 | 저장 필드                        | 장비로 나가나 |
 * |------------|------------------------|---------------------------------|------------|
 * | cli        | 보낼 명령 (여러 줄)       | cli                             | 예          |
 * | instrument | 보낼 명령                | cli                             | 예          |
 * | ping       | 대상 IP · 횟수           | host · pingCount                | 예          |
 * | snmp_get   | OID                    | oid                             | 예          |
 * | snmp_set   | OID · 넣을 값           | oid · snmpValue · snmpType      | 예          |
 * | snmp_trap  | OID · 기다릴 초          | oid · trapSec                   | 아니오(수신) |
 * | if         | 조건                    | condition                       | 아니오       |
 * | loop       | 범위 또는 횟수            | forFrom·forTo·forStep / loopCount | 아니오     |
 * | switch     | 기준 값                  | switchExpr                      | 아니오       |
 * | wait       | 기다릴 초                | waitSec                         | 아니오       |
 * | comment    | 주석                    | text                            | **아니오**   |
 * | message    | 출력할 글                | text                            | **아니오**   |
 * | manual     | 할 일 · 넣을 값 · 기대결과  | step · data · expected          | **아니오**   |
 * | connect    | (세션만)                 | session                         | 예(접속)     |
 * | disconnect | (세션만)                 | session                         | 예(해제)     |
 * | model      | 모델 이름                | modelName · model               | 아니오       |
 *
 * **Comment 와 Message 는 다르다.** Comment 는 사람이 읽는 주석이라 실행할
 * 때 아무 일도 하지 않는다. Message 는 실행 로그에 그 글을 찍는다 —
 * 긴 절차에서 '여기부터 2단계' 같은 표시를 남기는 데 쓴다. 그래서 Message
 * 는 ${변수} 를 넣으면 그 값이 찍히고 Comment 는 안 찍힌다.
 */
export const STEP_CONTENT: Record<string, { label: string; hint?: string }> = {
  cli: { label: '보낼 명령', hint: '여러 줄이면 위에서부터 차례로 보냅니다' },
  diff: { label: '견줄 두 값', hint: '같으면 합격 · 다르면 불합격. 여러 줄이면 어느 줄이 다른지 보여줍니다' },
  instrument: { label: '보낼 명령' },
  ping: { label: '대상 IP' },
  snmp_get: { label: 'OID' },
  snmp_set: { label: 'OID · 넣을 값' },
  snmp_trap: { label: 'OID · 기다릴 초' },
  if: { label: '조건' },
  loop: { label: '반복' },
  switch: { label: '기준 값' },
  wait: { label: '기다릴 초' },
  comment: { label: '주석', hint: '실행되지 않습니다. 사람이 읽는 설명입니다' },
  message: { label: '출력할 글', hint: '실행 로그에 찍힙니다. ${변수} 를 넣으면 그 값이 들어갑니다' },
  manual: { label: '할 일' },
  model: { label: '모델 이름' },
}

/** 실행할 때 장비로 아무것도 안 나가는 종류. 줄 색을 달리해 한눈에 가른다. */
export function isNoteKind(k?: string): boolean {
  return k === 'comment' || k === 'message'
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
  if (k === 'diff')
    return `${(s.cmpLeft || '').trim()} ${s.cmpOp || '=='} ${(s.cmpRight || '').trim()}`.trim()
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
  if (k === 'manual') return (s.step || s.data || '').trim()
  return (s.step || s.data || '').trim()
}

/** Result 는 이름이 두 벌이다. 새 것부터 본다. */
export function stepResult(s: TcStep): string {
  return String(s.output ?? s.response ?? '')
}

/**
 * 스텝에 찍을 수 있는 상태.
 *
 * Zephyr Enterprise 를 따른다 — 실행 전이 Unexecuted 이고, 거기서
 * Pass · Fail · WIP · Blocked 넷 중 하나가 된다. 이 넷은 Zephyr 에서도
 * 지울 수 없는 기본값이다.
 *
 * 합격/불합격 둘만 두면 '해봤는데 아직 판단 못 하겠다'(WIP)와 '앞 단계가
 * 막혀서 못 해봤다'(Blocked)를 적을 데가 없다. 그러면 사람들이 그것을
 * 불합격으로 적고, 나중에 진짜 결함과 구분이 안 된다.
 */
export const STEP_STATUSES: Array<{ v: string; label: string; cls: string; mark: string }> = [
  { v: 'PASS', label: '합격', cls: 'pass', mark: '✔' },
  { v: 'FAIL', label: '불합격', cls: 'fail', mark: '✖' },
  { v: 'WIP', label: '진행 중', cls: 'wip', mark: '◐' },
  { v: 'BLOCKED', label: '막힘', cls: 'blocked', mark: '⊘' },
]

const STATUS_MAP = new Map(STEP_STATUSES.map((x) => [x.v, x]))

/**
 * 이 스텝의 상태 — 'PASS' · 'FAIL' · 'WIP' · 'BLOCKED' · ''(미실행).
 *
 * 이름이 두 벌이다. 옛 화면은 `repeatResult` 에 'Pass'/'Fail' 을 적고,
 * 새 화면은 `status` 에 'PASS'/'FAIL' 을 적는다. 실제 자료에는 옛 이름만
 * 든 스텝이 있어서 둘 다 읽는다 — 한쪽만 보면 656스텝이 전부 미실행으로
 * 보인다.
 */
export function stepStatus(s: TcStep): string {
  const v = String(s.status ?? s.repeatResult ?? '').trim().toUpperCase()
  return STATUS_MAP.has(v) ? v : ''
}

/** 상태 하나의 표시 정보. 모르는 값이면 미실행으로 본다. */
export function stepStatusInfo(v: string) {
  return STATUS_MAP.get(v) ?? { v: '', label: '미실행', cls: 'idle', mark: '○' }
}

/**
 * 상태를 찍을 때 함께 넣을 값.
 *
 * 옛 화면은 `repeatResult` 만 읽으므로 Pass/Fail 은 그쪽에도 적는다.
 * WIP·Blocked 는 옛 화면에 없는 상태라 비운다 — 억지로 Fail 로 적으면
 * 저쪽 집계가 틀린다.
 */
export function stepStatusPatch(v: string): Partial<TcStep> {
  return {
    status: v,
    repeatResult: v === 'PASS' ? 'Pass' : v === 'FAIL' ? 'Fail' : '',
    ...(v ? { executed_at: new Date().toISOString() } : {}),
  }
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

/**
 * 배선 한 줄 — 장비 포트 하나가 계측기 포트 하나에 꽂혀 있다.
 *
 * 트래픽 스텝은 **장비 포트 이름으로만** 말한다(`Gi0/1 → Gi0/2`). 계측기
 * 포트(`4106/1` · `1/1/3`)는 여기서 풀어 준다. 랩 배선이 바뀌면 이 줄만
 * 고치면 되고, 그 배선을 쓰는 시험은 한 건도 안 건드린다.
 *
 * 옛 방식은 TC 마다 `meterCfg` 에 포트·MAC·IP·게이트웨이를 손으로 적었다.
 * 그건 시험의 내용이 아니라 랩의 사실이라, 시험이 백 개면 백 번 다시
 * 적어야 했다. `meterCfg` 10건 중 9건이 손도 안 댄 기본값인 이유다.
 */
export interface TcWire {
  /** 장비 쪽 — 세션 자리 번호. 어느 장비인지는 `data.sessions` 가 정한다 */
  session: number
  /** 장비 포트 이름 (Gi0/1) */
  port: string
  /** 계측기 장비 id */
  meter: string
  /** 계측기 포트. N2X 는 `4106/1`, STC 는 `1/1/3` */
  meterPort: string

  /*
   * 이 포트가 늘 쓰는 값.
   *
   * 순수 부하 시험이면 아무 값이나 되지만, **그때만** 그렇다. 멀티캐스트는
   * 그룹 주소가 시험의 본체고, 라우팅은 router-id·네트워크가 곧 시험
   * 대상이고, MAC learning 은 MAC 을 늘려 가며 잰다 — 실제로 옛 자료의
   * 스트림도 `srcMacMod: '증가', srcMacStep: '10'` 을 쓰고 있었다.
   *
   * 그래서 값을 없애는 대신 **자리를 옮겼다.** 이 포트가 늘 쓰는 값은
   * 랩의 사실이라 여기 한 번 적고, 시험마다 다른 것(부하·프레임·증가
   * 패턴·프로토콜)만 스텝에서 정한다.
   *
   * 비워 두면 자리 번호로 자동으로 채운다. 다만 몰래 정하지 않고 무엇으로
   * 채웠는지 화면에 보여 준다.
   */
  mac?: string
  ip?: string
  /** 접두 길이. `24` 처럼 숫자만 */
  mask?: string
  gw?: string
  vlan?: string
}

/**
 * 이 포트가 실제로 쓸 값.
 *
 * 안 적은 칸은 자리 번호로 만든다 — 1번 배선이면 `…:01` / `1.1.1.1`,
 * 2번이면 `…:02` / `2.1.1.1`. 옛 자료가 손으로 적어 두던 것과 같은 꼴이라
 * 눈에 익다.
 */
export function wireValues(w: TcWire, i: number): {
  mac: string
  ip: string
  mask: string
  gw: string
  vlan: string
} {
  const n = i + 1
  const two = String(n).padStart(2, '0')
  return {
    mac: (w.mac ?? '').trim() || `00:00:00:00:00:${two}`,
    ip: (w.ip ?? '').trim() || `${n}.1.1.1`,
    mask: (w.mask ?? '').trim() || '24',
    gw: (w.gw ?? '').trim() || `${n}.1.1.254`,
    vlan: (w.vlan ?? '').trim(),
  }
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
  /**
   * 이 TC 가 쓰는 전역 파라미터 파일 — iTest 와 같이 **고른다**.
   *
   * 순서대로 쌓이고 **뒤가 앞을 덮는다.** 파일이 다른 파일을 include 하고
   * 있으면 그것부터 깔린다.
   *
   * 전에는 '장비 모델과 이름이 같은 파일이 자동으로 붙는' 규칙이었다.
   * iTest 에 없는 규칙인 데다 파일 이름을 모델명과 한 글자도 안 틀리게
   * 맞춰야 도는 것을 아무도 못 알아챈다. 그래서 고르게 바꿨다.
   */
  /**
   * 랩 배선. 어느 장비 포트가 어느 계측기 포트에 꽂혀 있나.
   *
   * 세션과 같은 '자리' 개념을 쓴다 — 스텝이 `session: 0` 을 들고 있듯이
   * 배선도 자리 번호를 든다. 그래서 같은 시험을 랩마다 다른 장비로 돌려도
   * 배선만 갈아 끼우면 된다.
   */
  wiring?: TcWire[]
  /**
   * 토폴로지 그림.
   *
   * 시험 문서에 이미 구성도가 있는 경우가 많다. 다시 그리게 하면 아무도
   * 안 쓴다 — 그냥 붙여넣게 한다.
   *
   * 다만 그림은 **사람이 보는 것**이고 배선 표는 **기계가 읽는 것**이다.
   * JPEG 에서 `Gi0/1` 이 `4106/1` 에 꽂혔다는 것을 실행기가 알 수는 없다.
   * 그래서 둘은 서로를 대신하지 못하고, 그림만 있고 배선이 없으면 화면이
   * 그렇다고 말해 준다.
   */
  topo_img?: string
  /** 그림 폭. 늘여 놓은 것이 다시 열 때 그대로여야 한다 */
  topo_img_w?: number
  param_files?: string[]
  /** 옛 이름 — 하나만 고르던 때의 값. 읽기만 한다 */
  param_file?: string
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
