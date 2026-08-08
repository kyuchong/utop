import { useEffect } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { getToken } from '@/api/client'

/** 서버가 보내는 소식 */
interface Msg {
  type?: string
  tcid?: string
  reqid?: string
  id?: string
  cycle_id?: string
  user?: string
}

/**
 * 남이 바꾼 것을 내 화면에도 바로 들여온다.
 *
 * 서버는 처음부터 다 알리고 있었다 — 시험이 저장되면 `tc_updated`,
 * 지워지면 `tc_deleted`, 요구사항·사이클도 마찬가지. 그런데 화면이
 * **하나도 안 듣고 있었다.** 그래서 옆 사람이 저장해도 내 목록은 그대로고,
 * 새로고침을 눌러야 비로소 바뀌었다. 여러 사람이 붙는 것이 리눅스로 옮긴
 * 이유였는데 정작 그 자리가 비어 있었던 셈이다.
 *
 * 화면마다 따로 듣게 하면 또 어느 하나가 빠진다. 여기 한 곳에서 다 받아
 * **캐시만 헐어 놓는다.** 그러면 지금 열려 있는 목록이 알아서 다시 읽고,
 * 안 보고 있는 화면은 나중에 열 때 새로 읽는다.
 *
 * 소켓을 접속자 표시(`usePresence`)와 나눠 쓰지 않고 하나 더 여는 이유는,
 * 접속자 표시는 **시험 화면이 열려 있을 때만** 살아 있기 때문이다. 목록
 * 갱신은 어느 화면에 있든 돌아야 한다.
 */
function invalidate(qc: QueryClient, m: Msg) {
  const t = m.type ?? ''

  // ── 시험
  if (t === 'tc_updated' || t === 'tc_deleted') {
    void qc.invalidateQueries({ queryKey: ['tc', 'list', 'meta'] })
    void qc.invalidateQueries({ queryKey: ['tcs'] })
    // 커버리지 트리는 요구사항과 시험을 함께 그린다
    void qc.invalidateQueries({ queryKey: ['reqs'] })
    /*
     * 열려 있는 **한 건**은 여기서 건드리지 않는다.
     *
     * 그 화면(TestCases)은 내가 아직 저장 안 한 손질을 들고 있을 수 있다.
     * 여기서 다시 읽어 버리면 그 손질이 조용히 사라진다. 한 건을 언제
     * 다시 읽을지는 고친 게 있는지 아는 쪽이 정해야 한다.
     */
    return
  }
  if (t === 'tc_run_history_new' || t === 'tc_run_history_delete') {
    if (m.tcid) void qc.invalidateQueries({ queryKey: ['tc', m.tcid, 'run-history'] })
    return
  }

  // ── 요구사항
  if (t === 'req_updated' || t === 'req_deleted') {
    void qc.invalidateQueries({ queryKey: ['reqs'] })
    void qc.invalidateQueries({ queryKey: ['req', 'list'] })
    void qc.invalidateQueries({ queryKey: ['req-categories'] })
    // 커버리지 트리도 요구사항 위에 그려진다
    void qc.invalidateQueries({ queryKey: ['tc', 'list', 'meta'] })
    return
  }

  // ── 사이클
  if (t === 'cycle_updated' || t === 'cycle_deleted' || t.startsWith('cycle_run_')) {
    void qc.invalidateQueries({ queryKey: ['cycles'] })
    void qc.invalidateQueries({ queryKey: ['cycle-version-groups'] })
    const id = m.cycle_id || m.id
    if (id) void qc.invalidateQueries({ queryKey: ['cycle-full', id] })
    return
  }

  // ── 장비·계측기
  if (t === 'device_status') {
    void qc.invalidateQueries({ queryKey: ['devices2'] })
    void qc.invalidateQueries({ queryKey: ['locks'] })
  }
}

export function useLiveRefresh(): void {
  const qc = useQueryClient()

  useEffect(() => {
    let dead = false
    let ws: WebSocket | null = null
    let timer: number | undefined

    const open = () => {
      if (dead) return
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      const tk = getToken()
      ws = new WebSocket(`${proto}://${location.host}/ws${tk ? `?token=${tk}` : ''}`)
      ws.onmessage = (e) => {
        try {
          invalidate(qc, JSON.parse(String(e.data)) as Msg)
        } catch {
          // 우리 것이 아닌 메시지는 그냥 흘린다
        }
      }
      // 랩 네트워크는 끊겼다 붙었다 한다. 끊기면 다시 붙고, 붙는 김에
      // 지금 화면을 통째로 다시 읽는다 — 끊겨 있던 동안 놓친 소식이 있다.
      ws.onclose = () => {
        if (dead) return
        timer = window.setTimeout(() => {
          void qc.invalidateQueries()
          open()
        }, 3000)
      }
      ws.onerror = () => ws?.close()
    }

    open()
    return () => {
      dead = true
      if (timer) clearTimeout(timer)
      ws?.close()
    }
  }, [qc])
}
