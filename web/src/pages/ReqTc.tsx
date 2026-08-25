import type { MeUser } from '@/api/client'

interface Props {
  me?: MeUser | null
}

/**
 * REQ-TC — 요구사항과 시험을 **한 화면에 합쳐** 보는 자리(지시).
 *
 * 지금은 요구사항(Requirements)과 시험항목(Coverage)이 각자 제 화면에 있다.
 * 어느 요구사항에 어떤 시험이 붙어 있나를 보려면 두 화면을 오가야 한다.
 * 그것을 한 판에 놓는 것이 이 화면의 일이다.
 *
 * **기존 화면은 건드리지 않는다**(지시). 요구사항·Coverage 는 그대로 두고,
 * 합쳐 보는 것은 여기서만 한다 — 한쪽을 고쳐 두 화면이 같이 흔들리면
 * 지금 잘 쓰고 있는 것까지 잃는다.
 *
 * 알맹이(어떤 표로, 무엇을 세로로 놓을지)는 **사진을 받아** 그대로 맞춘다.
 * 그때까지는 자리만 잡아 둔다 — 메뉴에 들어와 있어야 어디에 붙는지 보인다.
 */
export default function ReqTc({ me }: Props) {
  void me
  return (
    <section className="panel">
      <div className="empty" style={{ padding: '48px 24px', lineHeight: 1.9 }}>
        <b>REQ-TC</b> — 요구사항과 시험을 한 화면에 합쳐 봅니다.
        <br />
        <span className="muted small">
          화면 모양을 잡는 중입니다. 기존 Requirements · Coverage 는 그대로 둡니다.
        </span>
      </div>
    </section>
  )
}
