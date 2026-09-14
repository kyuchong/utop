import { useEffect, useState } from 'react'
import { apiFetch, isAdminUser } from '@/api/client'

/**
 * 지금 보고 있는 사람이 **관리자인가** — 표가 스스로 묻는다(지시: 유형
 * 변경은 관리자만).
 *
 * 화면마다 넘기게 하지 않는 이유: 표를 쓰는 화면이 여럿이라 한 곳만
 * 빠뜨려도 그 화면에서만 아무나 유형을 바꾸게 된다. 여기서 한 번 물어
 * **모듈에 담아 두면** 표가 몇 개 서든 물음은 한 번이다.
 *
 * 못 물었거나(로그인 전·통신 실패) 답이 이상하면 **관리자가 아니다** 로
 * 본다 — 권한은 막는 쪽이 안전한 기본값이다.
 */
let cached: boolean | null = null
let asking: Promise<boolean> | null = null

export function useIsAdmin(): boolean {
  const [ok, setOk] = useState<boolean>(cached ?? false)
  useEffect(() => {
    if (cached !== null) {
      setOk(cached)
      return
    }
    if (!asking) {
      asking = (async () => {
        try {
          const r = await apiFetch('/api/me')
          if (!r.ok) return false
          const j = (await r.json()) as { user?: { role?: string } }
          return isAdminUser(j?.user)
        } catch {
          return false
        }
      })().then((v) => {
        cached = v
        return v
      })
    }
    let alive = true
    void asking.then((v) => {
      if (alive) setOk(v)
    })
    return () => {
      alive = false
    }
  }, [])
  return ok
}
