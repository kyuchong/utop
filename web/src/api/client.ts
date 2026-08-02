import type {
  ReqCategory,
  ReqListResponse,
  Requirement,
  TcListResponse,
} from '@/types'

/**
 * API 호출은 전부 여기를 지난다. 화면 코드에서 fetch 를 직접 부르지 않는다.
 * 개발: vite proxy 가 /api → localhost:8000
 * 운영: nginx 가 /api → api:8000
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, {
    signal,
    headers: { Accept: 'application/json' },
    // 서버가 목록 API 에 max-age=10, stale-while-revalidate=60 을 붙인다
    // (backend/main.py 의 _CACHEABLE_PATHS). 그대로 두면 저장 직후 다시 불러도
    // 브라우저 HTTP 캐시가 옛 목록을 돌려줘서 화면이 갱신되지 않는다.
    // 캐싱은 TanStack Query(staleTime)가 앱 계층에서 이미 한다.
    cache: 'no-store',
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = (await res.json()) as { detail?: string }
      if (body?.detail) detail = body.detail
    } catch {
      /* 본문이 JSON 이 아니면 statusText 를 그대로 쓴다 */
    }
    throw new ApiError(res.status, path, detail)
  }
  return (await res.json()) as T
}

export const api = {
  /** 요구사항 전체 + 폴더 트리 */
  listRequirements: (signal?: AbortSignal) =>
    get<ReqListResponse>('/api/req', signal),

  /** 요구사항 단건. tc 는 {tcid,name,status} 참조로만 온다 (main.py:2067) */
  getRequirement: (id: string, signal?: AbortSignal) =>
    get<Requirement>(`/api/req/${encodeURIComponent(id)}`, signal),

  /** TC 목록. meta=1 이면 steps/checks 를 뺀 슬림 응답 (main.py:2237) */
  listTestCases: (signal?: AbortSignal) =>
    get<TcListResponse>('/api/tc?meta=1', signal),
}

// ── 요구사항 분류 ────────────────────────────────────────────
async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const b = (await res.json()) as { detail?: string }
      if (b?.detail) detail = b.detail
    } catch {
      /* 본문이 JSON 이 아니면 statusText 사용 */
    }
    throw new ApiError(res.status, path, detail)
  }
  return (await res.json()) as T
}

export const categoryApi = {
  list: (signal?: AbortSignal) =>
    get<{ categories: ReqCategory[] }>('/api/req-categories', signal),
  create: (name: string, parentId: string | null) =>
    send<{ success: boolean; id: string }>('POST', '/api/req-categories', {
      name,
      parent_id: parentId,
    }),
  rename: (id: string, name: string, parentId: string | null) =>
    send<{ success: boolean }>('PUT', `/api/req-categories/${encodeURIComponent(id)}`, {
      name,
      parent_id: parentId,
    }),
  remove: (id: string) =>
    send<{ success: boolean }>('DELETE', `/api/req-categories/${encodeURIComponent(id)}`),
}

// ── 요구사항 쓰기 ────────────────────────────────────────────
export const reqApi = {
  /** 생성·수정 공통. id 는 PK(URL) 이고, 서버가 body.id 를 이 값으로 덮어쓴다. */
  save: (id: string, body: Record<string, unknown>) =>
    send<{ success: boolean }>('POST', `/api/req/${encodeURIComponent(id)}`, body),
  /** 삭제. 연결된 TC 도 함께 지워지고 휴지통으로 들어간다(main.py:delete_req). */
  remove: (id: string) =>
    send<{ success: boolean }>('DELETE', `/api/req/${encodeURIComponent(id)}`),
}

// ── 테스트케이스 쓰기 ────────────────────────────────────────
export const tcApi = {
  /**
   * 생성·수정 공통. tcid 가 곧 PK 다.
   * 주의: checks(스텝)를 안 보내면 서버가 기존 값을 보존한다(main.py:save_tc).
   *       그래서 이 폼은 메타만 보내도 스텝이 날아가지 않는다.
   */
  save: (tcid: string, body: Record<string, unknown>) =>
    send<{ success: boolean }>('POST', `/api/tc/${encodeURIComponent(tcid)}`, body),
  remove: (tcid: string) =>
    send<{ success: boolean }>('DELETE', `/api/tc/${encodeURIComponent(tcid)}`),
}
