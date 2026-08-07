import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import AskBar from '@/components/cycle/AskBar'
import type { Device } from '@/pages/Devices'
import './Cycles.css'

/**
 * TC 생성 — 말로 시험 만들기.
 *
 * 사이클 화면 한쪽에 끼워 두었더니 자리가 안 맞았다. 사이클은 **이미 있는
 * 시험을 회차로 묶어 돌리는** 곳이고, 새 시험을 짓는 것은 다른 일이다.
 * 메뉴에 이미 있던 「TC 생성」 이 그 자리다.
 *
 * 여기서 짜고 · 돌리고 · 결과를 보고, 쓸 만하면 시험으로 저장한다.
 * 저장한 뒤에야 사이클에 넣을 것이 생긴다 — 순서가 그렇다.
 */
export default function AiTc() {
  const devQ = useQuery({
    queryKey: ['devices2'],
    queryFn: async () => {
      const r = await apiFetch('/api/devices2')
      if (!r.ok) throw new Error('장비를 불러오지 못했습니다')
      return (await r.json()) as { devices: Device[] }
    },
    staleTime: 60_000,
  })

  return (
    <div className="aitc">
      <section className="panel aitc-main">
        <div className="aitc-head">
          <b>말로 시험 만들기</b>
          <span className="muted small">
            이 랩에서 통한 명령으로 짜고, 돌려 보고, 쓸 만하면 시험으로 남깁니다.
            지금은 <b>조회 시험</b>만 만듭니다.
          </span>
        </div>
        <div className="aitc-body">
          <AskBar devices={devQ.data?.devices ?? []} />
        </div>
      </section>
    </div>
  )
}
