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
  /** 4단 분류 id (req_category.id) */
  cat4?: string | null
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
 * 트리에서 보일 짧은 REQ ID.
 *
 * 실제 ID 가 폴더 경로를 다시 담고 있어서 길다 — 폴더 `U-REQ-SYS-HW`
 * 안에 `U-REQ-SYS-HW-Spec-001` 이 있는 식이다. 트리에 폴더 이름이 이미
 * 보이므로 같은 말이 두 번 나온다.
 *
 * 규칙: ID 안에서 폴더 이름을 찾아 **그 앞부분을 잘라낸다.**
 * 다만 잘라낸 나머지가 숫자뿐이면 뜻이 사라지므로 폴더 이름부터 남긴다.
 *
 *   폴더 U-REQ-SYS-HW · U-REQ-SYS-HW-Spec-001      → Spec-001
 *   폴더 L2-E59xxRL   · LGUPLUS-REQ-L2-E59xxRL-001 → L2-E59xxRL-001
 *   폴더 없음         · 부팅-001                    → 부팅-001
 *
 * 자료는 건드리지 않는다. TC 89건이 이 ID 로 요구사항을 가리키고 있고
 * 문서·Jira 에도 그대로 쓰이므로 화면에서만 줄인다.
 */
export function shortReqId(fullId: string, folderName?: string | null): string {
  const id = (fullId || '').trim()
  if (!id || !folderName) return id
  const at = id.indexOf(folderName)
  if (at < 0) return id

  // 폴더 이름 뒤부터 남겨 본다 (구분자 하나는 같이 뗀다)
  let rest = id.slice(at + folderName.length)
  if (rest.startsWith('-') || rest.startsWith('_')) rest = rest.slice(1)

  // 뗀 나머지가 뜻을 가지면(영문·한글로 시작) 그것만 쓴다.
  // 숫자만 남으면 '001' 이 되어 무엇인지 알 수 없으므로 폴더 이름부터 남긴다.
  if (rest && /^[A-Za-z가-힣]/.test(rest)) return rest
  return id.slice(at)
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
  /** 마지막으로 고친 때 — 트리의 「최근」 정렬이 본다 */
  updated_at?: string | null
}

/** 프로젝트 — 요구사항 트리 최상위 폴더의 메타. 이름의 정본은 폴더다 */
export interface Project {
  id: string
  cat_id: string
  name: string
  customer: string
  model_group: string
  model: string
  description: string
  created_at?: string
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
      // 드래그로 정한 순서(sort_order)를 그대로 쓴다. 같으면 이름순.
      .sort((a, b) => a.sort_order - b.sort_order || naturalCompare(a.name, b.name))
      .map((c) => ({ ...c, depth, children: build(c.id, depth + 1) }))
  return build(null, 1)
}

/**
 * '미분류' 를 고른 상태를 나타내는 표식.
 * 실제 분류가 아니라 '분류가 안 붙은 요구사항' 을 거르는 값이라
 * 실존하는 id 와 절대 겹치지 않는 문자열을 쓴다.
 */
export const UNCATEGORIZED = '__none__'

/**
 * 이름 정렬용 비교기.
 *
 * 기본 localeCompare 는 문자열을 글자 단위로 비교해서 '10' 이 '2' 보다
 * 앞에 온다. 실제 분류 이름이 '1. 부품 변경' · '1-1. …' · 'E43' · 'E57'
 * 처럼 숫자를 품고 있어서 그대로 두면 순서가 어긋난다.
 * numeric 을 켜면 숫자 부분을 수로 읽어 2 < 10 이 된다.
 * 한글·영문이 섞여 있으므로 로케일은 ko 를 쓴다.
 */
const collator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' })

export function naturalCompare(a: string, b: string): number {
  return collator.compare(a ?? '', b ?? '')
}

/** 자릿수 그대로 비교 — numeric 을 끈 컬레이터. 111 < 21 < 99.
    폴더 번호가 크기가 아니라 1-1-1 식 코드라서 적힌 대로 서야 한다. */
const plainCollator = new Intl.Collator('ko', { sensitivity: 'base' })
export function plainCompare(a: string, b: string): number {
  return plainCollator.compare(a ?? '', b ?? '')
}

/** 폴더 트리 보기 정렬 — 요구사항·Coverage 1열이 같은 규칙을 쓴다.

    첫 글자의 갈래(숫자·알파벳·한글)를 앞세운다. 숫자 모드(기본)는 번호를
    자릿수 코드로 읽고(111 < 21 < 99), manual 은 sort_order(끌기 순) 그대로.
    제자리 정렬이라 보기만 바뀐다 — 끌기 순 데이터는 안 건드린다. */
export type FolderSortMode = 'manual' | 'num' | 'abc' | 'kor'
export function sortCategoryTree(t: CategoryTreeNode[], mode: FolderSortMode): CategoryTreeNode[] {
  if (mode === 'manual') return t
  const rank = (nm: string): number => {
    const ch = nm.trimStart().charAt(0)
    if (mode === 'num') return /[0-9]/.test(ch) ? 0 : 1
    if (mode === 'abc') return /[a-zA-Z]/.test(ch) ? 0 : 1
    return /[가-힣]/.test(ch) ? 0 : 1
  }
  const cmp = mode === 'num' ? plainCompare : naturalCompare
  const deep = (ns: CategoryTreeNode[]) => {
    ns.sort((a, b) => rank(a.name) - rank(b.name) || cmp(a.name, b.name))
    ns.forEach((k) => deep(k.children))
  }
  deep(t)
  return t
}

/** 이름 앞머리의 숫자. '1-2. 제목' → [1,2] / 숫자로 시작하지 않으면 null */
function leadingNumbers(s: string): number[] | null {
  const m = /^\s*(\d+(?:[.\-]\d+)*)/.exec(s ?? '')
  if (!m) return null
  return m[1]!.split(/[.\-]/).map(Number)
}

/**
 * 숫자순. '1. → 2. → 10.' 처럼 앞머리 번호로 매긴다.
 * 번호가 없는 항목은 뒤로 밀고 자기들끼리는 이름순으로 둔다 —
 * 번호 체계를 쓰는 목록에서 번호 없는 것이 사이에 끼면 순서가 안 읽힌다.
 */
export function compareByNumber(a: string, b: string): number {
  const na = leadingNumbers(a)
  const nb = leadingNumbers(b)
  if (na && nb) {
    for (let i = 0; i < Math.max(na.length, nb.length); i++) {
      const d = (na[i] ?? -1) - (nb[i] ?? -1)
      if (d !== 0) return d
    }
    return naturalCompare(a, b)
  }
  if (na) return -1
  if (nb) return 1
  return naturalCompare(a, b)
}

/**
 * 알파벳순. 앞머리 번호를 떼고 글자만 본다 —
 * '1. VLAN' 과 'VLAN' 이 멀리 떨어지지 않게.
 */
export function compareByAlpha(a: string, b: string): number {
  const strip = (s: string) => (s ?? '').replace(/^\s*\d+(?:[.\-]\d+)*[.\s)]*/, '').trim()
  return naturalCompare(strip(a) || a, strip(b) || b)
}

/** 분류 4단까지. 서버도 같은 값으로 막는다. */
export const MAX_CAT_DEPTH = 4

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
