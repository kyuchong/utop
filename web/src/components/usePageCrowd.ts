import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/api/client'
import { onWs } from '@/api/wsBus'

/**
 * 이 화면(묶음)에 지금 누가 들어와 있나.
 *
 * usePresence 는 소켓 하나에 자리 하나라 「사이클 화면 전체」 같은 묶음을
 * 못 센다. 서버가 접속자 명부를 이미 들고 있으니 prefix 로 물어본다.
 * presence 소식이 올 때마다(누가 오가면) 다시 읽는다.
 */
export function usePageCrowd(prefix: string): string[] {
  const [users, setUsers] = useState<string[]>([])
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    let dead = false
    const load = async () => {
      try {
        const r = await apiFetch(`/api/presence?prefix=${encodeURIComponent(prefix)}`)
        if (!r.ok || dead) return
        const b = (await r.json()) as { users?: string[] }
        setUsers(b.users ?? [])
      } catch {
        /* 명부는 장식 — 못 읽어도 화면은 산다 */
      }
    }
    void load()
    const iv = window.setInterval(() => void load(), 30_000)
    const off = onWs((m) => {
      if (m.type !== 'presence') return
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => void load(), 400)
    })
    return () => {
      dead = true
      window.clearInterval(iv)
      off()
    }
  }, [prefix])

  return users
}
