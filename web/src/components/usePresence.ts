import { useEffect, useRef, useState } from 'react'
import { onWs, onWsOpen, sendWs, type WsMsg } from '@/api/wsBus'

export type { WsMsg }

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
 * 알린다. 막는 것보다 알리는 편이 낫다.
 *
 * 소켓은 탭에 하나뿐이다(`wsBus`). 화면마다 따로 열면 서버가 접속자를
 * 그 배로 센다.
 */
export function usePresence(page: string, me: string, onMsg?: (m: WsMsg) => void): Presence {
  const [st, setSt] = useState<Presence>({ users: [], controller: null, connected: false })
  const pageRef = useRef(page)
  pageRef.current = page
  // 콜백은 매 렌더 새로 만들어진다. ref 로 받아야 그때마다 다시 붙지 않는다.
  const msgRef = useRef(onMsg)
  msgRef.current = onMsg
  const meRef = useRef(me)
  meRef.current = me

  useEffect(() => {
    if (!me) return
    const off = onWs((m) => {
      if (m.type !== 'presence') {
        // 접속자 말고 다른 소식(저장됨 같은 것)은 화면에 넘긴다
        msgRef.current?.(m)
        return
      }
      if (m.page !== pageRef.current) return
      setSt({
        users: (m.users as string[]) ?? [],
        controller: (m.controller as string | null) ?? null,
        connected: true,
      })
    })
    // 붙을 때마다 지금 보고 있는 자리를 알린다 — 끊겼다 붙으면 서버는
    // 나를 잊어버린 상태다
    const offOpen = onWsOpen(() => {
      setSt((s) => ({ ...s, connected: true }))
      sendWs({ type: 'presence', user: meRef.current, page: pageRef.current })
    })
    return () => {
      off()
      offOpen()
    }
  }, [me])

  // 보던 것을 바꾸면 그 자리를 알린다
  useEffect(() => {
    if (me) sendWs({ type: 'presence', user: me, page })
  }, [page, me])

  return st
}
