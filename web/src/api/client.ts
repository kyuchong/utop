import type { ReqListResponse, Requirement, TcListResponse } from '@/types'

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
