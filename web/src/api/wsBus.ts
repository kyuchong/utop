import { getToken } from './client'

/** 서버가 보내는 소식 */
export interface WsMsg {
  type?: string
  [k: string]: unknown
}

type Fn = (m: WsMsg) => void

/**
 * 한 탭에 소켓 하나.
 *
 * 접속자 표시·목록 갱신·실행 진행이 저마다 소켓을 열고 있었다. 하는 일은
 * 다르지만 **오는 것은 같은 줄**이다. 셋이면 서버는 접속자를 세 배로 세고,
 * 끊겼다 붙는 것도 세 번 따로 일어난다.
 *
 * 여기 하나만 열고 나눠 준다. 끊기면 다시 붙고, 다시 붙었을 때 `onOpen`
 * 을 받은 쪽이 놓친 것을 스스로 메운다 — 끊겨 있던 동안의 소식은
 * 아무도 대신 받아 주지 않는다.
 */
let ws: WebSocket | null = null
let timer: number | undefined
const subs = new Set<Fn>()
const opens = new Set<() => void>()

function connect(): void {
  if (ws && (ws.readyState === 0 || ws.readyState === 1)) return
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  const tk = getToken()
  const s = new WebSocket(`${proto}://${location.host}/ws${tk ? `?token=${tk}` : ''}`)
  ws = s

  s.onopen = () => {
    for (const f of opens) {
      try {
        f()
      } catch {
        // 한 쪽이 넘어져도 나머지는 받는다
      }
    }
  }
  s.onmessage = (e) => {
    let m: WsMsg
    try {
      m = JSON.parse(String(e.data)) as WsMsg
    } catch {
      return // 우리 것이 아닌 메시지는 그냥 흘린다
    }
    for (const f of subs) {
      try {
        f(m)
      } catch {
        // 위와 같다
      }
    }
  }
  s.onclose = () => {
    ws = null
    // 랩 네트워크는 끊겼다 붙었다 한다. 듣는 쪽이 남아 있으면 다시 붙는다.
    if (subs.size + opens.size > 0 && timer === undefined) {
      timer = window.setTimeout(() => {
        timer = undefined
        connect()
      }, 3000)
    }
  }
  s.onerror = () => s.close()
}

/** 소식 듣기. 돌려주는 것을 부르면 그만 듣는다 */
export function onWs(f: Fn): () => void {
  subs.add(f)
  connect()
  return () => {
    subs.delete(f)
  }
}

/** 소켓이 (다시) 붙었을 때 */
export function onWsOpen(f: () => void): () => void {
  opens.add(f)
  connect()
  // 이미 붙어 있으면 지금 한 번 불러 준다 — 늦게 붙은 쪽도 처음을 놓치지 않는다
  if (ws?.readyState === 1) {
    try {
      f()
    } catch {
      // 무시
    }
  }
  return () => {
    opens.delete(f)
  }
}

/** 보내기. 안 붙어 있으면 조용히 흘린다 — 다시 붙을 때 다시 보낸다 */
export function sendWs(m: unknown): boolean {
  if (ws?.readyState !== 1) return false
  ws.send(JSON.stringify(m))
  return true
}
