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
  /** 소분류 id (req_category.id) */
  cat3?: string | null
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

/** 요구사항 분류 (최대 3단). parent_id 가 없으면 대분류. */
export interface ReqCategory {
  id: string
  name: string
  parent_id: string | null
  sort_order: number
  /** 이 분류를 쓰는 요구사항 수 (cat1/cat2/cat3 중 하나로 참조) */
  req_count: number
}

export interface CategoryTreeNode extends ReqCategory {
  children: CategoryTreeNode[]
  /** 1=대분류, 2=중분류, 3=소분류 */
  depth: number
}

/** 평면 목록 → 트리. 서버가 3단까지만 허용하지만 여기서는 깊이를 가정하지 않는다. */
export function buildCategoryTree(list: ReqCategory[]): CategoryTreeNode[] {
  const build = (parentId: string | null, depth: number): CategoryTreeNode[] =>
    list
      .filter((c) => (c.parent_id ?? null) === parentId)
      .map((c) => ({ ...c, depth, children: build(c.id, depth + 1) }))
  return build(null, 1)
}

/** 분류 3단까지. 이 값을 넘는 하위는 만들 수 없다 (서버도 같은 값으로 막는다). */
export const MAX_CAT_DEPTH = 3

/** id → 조상 경로(대>중>소 이름). 화면에 분류를 한 줄로 보여줄 때 쓴다. */
export function categoryPath(list: ReqCategory[], id: string | null | undefined): string {
  if (!id) return ''
  const byId = new Map(list.map((c) => [c.id, c]))
  const names: string[] = []
  let cur = byId.get(id)
  while (cur) {
    names.unshift(cur.name)
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined
  }
  return names.join(' > ')
}
