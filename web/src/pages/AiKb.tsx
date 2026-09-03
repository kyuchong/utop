/**
 * Knowledge AI — **자료를 찾는 자리.**
 *
 * Test AI 가 시험을 만들고 고치는 쪽이라면, 이쪽은 이미 있는 것을 찾아
 * 답하는 쪽이다. 묻는 말도 답하는 꼴도 달라 한 화면에 두면 둘 다 흐려진다.
 *
 *   Wiki      규격·절차·전파 문서
 *   Release   Jira 이슈 — 무엇이 왜 고쳐졌나
 *
 * **아직 답하지는 못한다.** 이 자리를 전에 한 번 뺐던 까닭이 그것이다 —
 * 화면도 자료도 없이 메뉴에만 두어, 누를 때마다 「아직 안 옮겼습니다」 벽을
 * 만났다(지적). 벽은 무엇을 기다려야 하는지 말해 주지 않는다.
 *
 * 그래서 이 화면은 **무엇을 하는 자리이고 지금 무엇이 되는지**를 적는다.
 * 되는 것(Wiki 찾기·Jira 이슈 찾기)은 지금 쓸 수 있는 곳으로 바로 보낸다.
 */
import { goto } from '@/api/goto'
import './AiKb.css'

export default function AiKb() {
  return (
    <div className="akb">
      <header className="akb-h">
        <h2>Knowledge Assistant</h2>
        <p>
          쌓인 자료에서 <b>찾아 답하는</b> 자리입니다 — 규격·절차는 Wiki 에서,
          「무엇이 왜 고쳐졌나」 는 Jira 이슈에서 찾습니다.
        </p>
      </header>

      <div className="akb-cards">
        <section className="panel akb-card">
          <h3>Wiki 문서</h3>
          <p>규격·시험 절차·전파 내용. 「그 기능 어떻게 시험하지」 를 묻는 자리입니다.</p>
          <button type="button" className="btn" onClick={() => goto('wiki', '')}>
            Wiki 에서 찾기
          </button>
        </section>

        <section className="panel akb-card">
          <h3>Jira 이슈</h3>
          <p>
            버전에 걸린 Defect·CR. 「이 빌드에서 무엇이 바뀌었나」 를 묻는
            자리입니다.
          </p>
          <button type="button" className="btn" onClick={() => goto('releases', '')}>
            Releases 에서 찾기
          </button>
        </section>
      </div>

      {/* 벽이 아니라 **길잡이**로 둔다 — 무엇을 기다리는지 적는다 */}
      <div className="akb-soon">
        <b>물어서 답 받기는 아직입니다.</b>
        <span>
          지금은 위 두 곳에서 직접 찾습니다. 물어보면 두 곳을 함께 훑어 답하는
          것은 다음입니다 — Test AI 와 같은 문법으로 만듭니다.
        </span>
      </div>
    </div>
  )
}
