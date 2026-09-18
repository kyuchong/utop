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
/** 같은 물음에서 이름도 받아 둔다 — 보기 탭이 「누가 만든 것인가」 를 본다 */
let cachedName = ''


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
          const j = (await r.json()) as { user?: { role?: string; name?: string; username?: string } }
          cachedName = j?.user?.name || j?.user?.username || ''
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

/**
 * 지금 보고 있는 사람의 **이름** — 보기 탭이 「내 것인가 남의 것인가」 를 가른다.
 *
 * 관리자인지 묻는 그 물음에서 함께 받아 둔다(/api/me 를 두 번 부르지 않는다).
 * 화면이 me 를 props 로 내려 주는 곳도 있지만, 문서 안에 들어앉는 표에는
 * 내려 줄 사람이 없다.
 */
export function useMeName(): string {
  const [nm, setNm] = useState(cachedName)
  useEffect(() => {
    if (cachedName) {
      setNm(cachedName)
      return
    }
    let alive = true
    void asking?.then(() => {
      if (alive) setNm(cachedName)
    })
    return () => {
      alive = false
    }
  }, [])
  return nm
}
