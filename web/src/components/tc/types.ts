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
 * 스텝 하나.
 *
 * 수동 시험은 사람이 보고 판단하므로 결과·RCA 칸을 두지 않는다.
 * 자동 시험만 response·판정기준·RCA 를 쓴다.
 */
export interface TcStep {
  /** 화면 표시용 번호는 순서에서 만든다. 저장하지 않는다 */
  kind?: 'manual' | 'auto'
  /** 자동일 때 어느 세션으로 보낼지 (슬롯 key) */
  session?: string
  /** 시험 절차 */
  step?: string
  /** 넣는 값 · 명령 */
  data?: string
  data_img?: string
  /** 기대 결과 */
  expected?: string
  expected_img?: string
  /** 자동: 실제 응답 */
  response?: string
  /** 자동: 판정 기준 (문자열 포함 · 정규식) */
  criteria?: string
  /** 자동: 실패 원인 분석 */
  rca?: string
  note?: string
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
