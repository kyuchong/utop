/**
 * 백엔드가 실제로 돌려주는 모양.
 *
 * 근거: backend/db.py 의 _req_meta / _tc_meta, backend/main.py 의
 *       GET /api/req, GET /api/req/{id}, GET /api/tc?meta=1
 *
 * req/tc 는 PG 의 data JSONB 를 그대로 돌려주므로 스키마가 느슨하다.
 * 여기 적힌 필드는 "메타 추출기가 실제로 읽는 것" 만 확정으로 두고,
 * 나머지는 인덱스 시그니처로 남긴다.
 *
 * TODO: `npm run gen:api` 로 /openapi.json 에서 자동 생성한 타입으로 교체.
 *       현재 백엔드 라우트가 dict 반환이라 OpenAPI 에 본문 스키마가 없다.
 */

export type TestStatus = 'PASS' | 'FAIL' | '대기' | string

/** REQ 안에 들어있는 TC 참조 (GET /api/req/{id} 가 이 형태로 축약해 준다) */
export interface TcRef {
  tcid: string
  name: string
  status: TestStatus
}

export interface Requirement {
  /** PG 기본키. data.reqid 가 없으면 data.id 를 씀 (db.py:_req_meta) */
  reqid?: string
  id?: string
  title?: string
  folder?: string
  status?: string
  priority?: string
  created_by?: string
  updated_by?: string
  /** 대분류 id (req_category.id). 없으면 미분류 */
  cat1?: string | null
  /** 중분류 id (req_category.id) */
  cat2?: string | null
  tc?: TcRef[]
  [k: string]: unknown
}

export interface TestCaseMeta {
  tcid: string
  name?: string
  status?: TestStatus
  req_id?: string
  type?: string
  severity?: string
  kind?: string
  /**
   * CLI 스텝 수. PG 컬럼 이름은 step_count 지만 응답 키는 _cli_count 다
   * (db.py:231 이 이 이름으로 갈아끼운다). 응답 기준 이름을 쓴다.
   */
  _cli_count?: number
  /** PG updated_at (ISO). db.py:232 */
  _updated_at_pg?: string | null
  created_by?: string
  updated_by?: string
  [k: string]: unknown
}

export interface ReqListResponse {
  folders: unknown[]
  reqs: Requirement[]
}

export interface TcListResponse {
  tcs: TestCaseMeta[]
}

/**
 * 화면 표시용 이름. 사람이 읽는 REQ-001 을 우선한다.
 * ★ 저장·삭제 대상 지정에는 절대 쓰지 말 것 — reqPk() 를 쓴다.
 *   (db.py:_req_meta 가 reqid 를 메타 컬럼으로 뽑는 규칙과 같은 값)
 */
export function reqLabel(r: Requirement): string {
  return r.reqid || r.id || ''
}

/**
 * PostgreSQL 기본키. POST/DELETE /api/req/{여기} 에 들어가는 값이다.
 *
 * reqid(REQ-001)를 PK 로 착각하면 편집이 새 행을 만든다 —
 * 서버(main.py:save_req)가 URL 의 id 를 PK 로 쓰고 body.id 를 덮어쓰는 데다,
 * 같은 reqid 가 이미 있으면 REQ-201 처럼 번호를 올려 붙이기 때문이다.
 */
export function reqPk(r: Requirement): string {
  return r.id || r.reqid || ''
}

/** 상태 문자열 → CSS 클래스. 판정은 여기 한 곳에서만 한다. */
export function statusClass(s: string | undefined): string {
  const v = (s || '').toUpperCase()
  if (v === 'PASS' || v === '성공') return 'pass'
  if (v === 'FAIL' || v === '실패') return 'fail'
  if (v === 'DRAFT' || v === '작성중') return 'draft'
  return 'idle'
}

/** 요구사항 분류 (2단 고정). parent_id 가 없으면 대분류. */
export interface ReqCategory {
  id: string
  name: string
  parent_id: string | null
  sort_order: number
  /** 이 분류를 쓰는 요구사항 수 (cat1 또는 cat2 로 참조) */
  req_count: number
}

export interface CategoryTreeNode extends ReqCategory {
  children: ReqCategory[]
}

/** 평면 목록 → 2단 트리. 서버가 2단을 보장하므로 재귀가 필요 없다. */
export function buildCategoryTree(list: ReqCategory[]): CategoryTreeNode[] {
  const roots = list.filter((c) => !c.parent_id)
  return roots.map((r) => ({
    ...r,
    children: list.filter((c) => c.parent_id === r.id),
  }))
}
