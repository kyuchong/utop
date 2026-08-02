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

/**
 * 로그인 토큰.
 *
 * 서버가 /api/* 전체에 로그인을 요구한다. 토큰은 Authorization 헤더로
 * 보낸다 — 쿼리스트링에 실으면 프록시·서버 로그에 그대로 남는다.
 */
const TOKEN_KEY = 'utop.token'

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function setToken(v: string): void {
  if (v) localStorage.setItem(TOKEN_KEY, v)
  else localStorage.removeItem(TOKEN_KEY)
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const tk = getToken()
  return { ...(extra ?? {}), ...(tk ? { Authorization: `Bearer ${tk}` } : {}) }
}

/**
 * 인증 헤더를 붙여 주는 fetch.
 *
 * 컴포넌트에서 fetch 를 직접 쓰면 토큰을 붙이는 걸 잊는다 — 실제로
 * 이미지 업로드·문서 변환·벡터 저장이 전부 토큰 없이 나가서 401 이 났다.
 * FormData 를 보낼 때는 Content-Type 을 우리가 정하면 안 된다(경계 문자열이
 * 빠진다). 그래서 헤더는 Authorization 만 얹는다.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const tk = getToken()
  return fetch(path, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      ...(tk ? { Authorization: `Bearer ${tk}` } : {}),
    },
  })
}

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
    headers: authHeaders({ Accept: 'application/json' }),
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
    headers: authHeaders({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }),
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
  /** 형제 순서 재배치(+상위 이동). ids 차례대로 sort_order 를 매긴다. */
  reorder: (parentId: string | null, ids: string[]) =>
    send<{ success: boolean; count: number }>('POST', '/api/req-categories/reorder', {
      parent_id: parentId,
      ids,
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


// ── 로그인 ────────────────────────────────────────────────────
export interface MeUser {
  username: string
  name?: string
  role?: string
  [k: string]: unknown
}

export const authApi = {
  login: async (username: string, password: string) => {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (!res.ok) {
      const b = await res.json().catch(() => ({}))
      throw new ApiError(res.status, '/api/login', b.detail || '로그인에 실패했습니다')
    }
    const r = (await res.json()) as { token: string; user: MeUser }
    setToken(r.token)
    return r
  },
  me: () => get<{ user: MeUser }>('/api/me'),
  logout: async () => {
    const tk = getToken()
    setToken('')
    if (tk) {
      await fetch('/api/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tk }),
      }).catch(() => {})
    }
  },
}
