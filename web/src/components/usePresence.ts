import { useEffect, useRef, useState } from 'react'
import { getToken } from '@/api/client'

/** 지금 이 화면을 보고 있는 사람들 */
export interface Presence {
  users: string[]
  /** 서버가 정하는 첫 접속자. 지금은 표시에만 쓴다 */
  controller: string | null
  connected: boolean
}

/**
 * 같은 것을 누가 같이 보고 있나.
 *
 * 리눅스 서버로 옮긴 이유가 「여러 사람이 동시에 붙는다」 였는데, 화면에는
 * 그 흔적이 하나도 없었다. 같은 요구사항을 둘이 열어 놓고 각자 고치면
 * 나중에 저장한 사람이 앞사람 것을 조용히 덮는다.
 *
 * **잠그지는 않는다.** 옛 화면도 그렇게 하다가 「데이터는 락 없음 — 모두
 * 편집 가능, 접속자만 표시」 로 되돌렸다. 랩에서는 둘이 같은 시험을 여는
 * 일이 잦고, 대개는 한 사람이 보기만 한다. 잠가 버리면 보려던 사람이
 * 못 들어오고, 잠근 사람이 자리를 뜨면 아무도 못 고친다.
 *
 * 대신 **누가 있는지 보여 주고**, 저장할 때 남이 먼저 저장했으면 그때
 * 알린다(`useSaveGuard`). 막는 것보다 알리는 편이 낫다.
 */
export function usePresence(page: string, me: string): Presence {
  const [st, setSt] = useState<Presence>({ users: [], controller: null, connected: false })
  const wsRef = useRef<WebSocket | null>(null)
  const pageRef = useRef(page)
  pageRef.current = page

  useEffect(() => {
    if (!me) return
    let dead = false
    let timer: number | undefined

    const open = () => {
      if (dead) return
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      const tk = getToken()
      const ws = new WebSocket(`${proto}://${location.host}/ws${tk ? `?token=${tk}` : ''}`)
      wsRef.current = ws

      ws.onopen = () => {
        setSt((s) => ({ ...s, connected: true }))
        ws.send(JSON.stringify({ type: 'presence', user: me, page: pageRef.current }))
      }
      ws.onmessage = (e) => {
        try {
          const m = JSON.parse(String(e.data)) as {
            type?: string
            page?: string
            users?: string[]
            controller?: string | null
          }
          if (m.type !== 'presence' || m.page !== pageRef.current) return
          setSt({ users: m.users ?? [], controller: m.controller ?? null, connected: true })
        } catch {
          // 우리 것이 아닌 메시지는 그냥 흘린다
        }
      }
      // 끊기면 다시 붙는다. 랩 네트워크는 끊겼다 붙었다 한다
      ws.onclose = () => {
        setSt((s) => ({ ...s, connected: false }))
        if (!dead) timer = window.setTimeout(open, 3000)
      }
      ws.onerror = () => ws.close()
    }

    open()
    return () => {
      dead = true
      if (timer) clearTimeout(timer)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [me])

  // 보던 것을 바꾸면 그 자리를 알린다
  useEffect(() => {
    const ws = wsRef.current
    if (ws && ws.readyState === 1 && me) {
      ws.send(JSON.stringify({ type: 'presence', user: me, page }))
    }
  }, [page, me])

  return st
}
