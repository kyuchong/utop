/**
 * 화면의 `@/api/client` 자리를 메우는 것.
 *
 * 실행기는 **화면과 같은 실행기 코드**(`runner.ts`·`judge.ts`)를 그대로
 * 돌린다. 그 코드는 `apiFetch` 하나에만 기댄다 — 브라우저에서는 같은
 * 출처로, 여기서는 API 주소를 붙여 부른다. 번들할 때 `@/api/client` 를
 * 이 파일로 바꿔 끼운다.
 *
 * 이렇게 해야 판정 규칙이 한 벌로 남는다. 두 벌이면 한 화면에서 적합인
 * 것이 다른 화면에서 부적합이 된다.
 */

const BASE = (process.env.API_BASE || 'http://api:8000').replace(/\/+$/, '')

let token = ''
export function setToken(v: string): void {
  token = v || ''
}
export function getToken(): string {
  return token
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const h = new Headers(init.headers || {})
  if (token && !h.has('Authorization')) h.set('Authorization', `Bearer ${token}`)
  if (typeof init.body === 'string' && !h.has('Content-Type')) {
    h.set('Content-Type', 'application/json')
  }
  return fetch(BASE + path, { ...init, headers: h })
}
