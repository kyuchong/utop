import type { BlockNoteEditor } from '@blocknote/core'

/**
 * 표 손잡이(행·열 추가 ＋, 행·열 끌기 ⠿)를 **다시 켜되 데이터베이스 표 위에서는 잠재운다**
 * (지적: 표 만든 뒤 행·열 추가가 안 된다).
 *
 * 9/18 에 손잡이를 편집기 전체에서 껐다 — 손잡이 플러그인은 마우스 아래 요소가 TD·TH 이기만
 * 하면 제 표의 칸으로 보고 `block.content.rows` 를 읽는데, 데이터베이스 블록(utopTable)이
 * 그리는 것도 진짜 <td> 라 content 가 없어 `reading 'rows'` 로 터지고 화면이 먹통이 됐다.
 * 그 대가로 글 속 보통 표에서도 ＋ 가 사라져 행·열을 못 늘렸다.
 *
 * 여기서는 플러그인의 mousemove 처리기를 **감싸서** 마우스 아래 블록이 편집기 표(table)가
 * 아니면 그냥 돌려보낸다. 처리기는 편집기 DOM 에 참조로 걸려 있으므로 떼고 감싼 것을 다시
 * 건다. mouseup 은 `this.mouseMoveHandler` 를 부르니 필드만 바꿔도 같이 막힌다.
 *
 * 플러그인 뷰는 prosemirror-view 의 `pluginViews` 에서 찾는다(공개 타입은 아니지만 오래
 * 안 바뀐 자리). 못 찾으면 아무것도 안 한다 — 그때는 손잡이가 그대로 켜져 있으니
 * 데이터베이스 표에서 먹통이 다시 날 수 있어, 못 찾은 것을 콘솔에 남긴다.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEditor = BlockNoteEditor<any, any, any>
type HandlesView = {
  mouseMoveHandler: (e: MouseEvent) => void
  state?: { show?: boolean; showAddOrRemoveRowsButton?: boolean; showAddOrRemoveColumnsButton?: boolean }
  emitUpdate?: () => void
}
type PmView = { dom: HTMLElement; pluginViews?: unknown[] }

export function guardTableHandles(editor: AnyEditor): () => void {
  let off: (() => void) | undefined
  let tries = 0
  const arm = () => {
    const view = (editor as unknown as { prosemirrorView?: PmView }).prosemirrorView
    const hv = view?.pluginViews?.find(
      (v): v is HandlesView => !!v && typeof (v as HandlesView).mouseMoveHandler === 'function',
    )
    if (!view || !hv) {
      /* 편집기가 아직 안 붙었으면 조금 뒤에 다시 — 다섯 번 안에 못 찾으면 포기 */
      if (tries++ < 5) window.setTimeout(arm, 100)
      else console.warn('[wiki] 표 손잡이 가드를 못 걸었다 — 데이터베이스 표 위에서 먹통이 날 수 있다')
      return
    }
    const orig = hv.mouseMoveHandler
    const wrapped = (e: MouseEvent) => {
      const t = e.target as Element | null
      const bc = t?.closest?.('.bn-block-content')
      if (bc && bc.getAttribute('data-content-type') !== 'table') {
        /* 데이터베이스 표·다른 블록 위 — 떠 있던 손잡이는 거둔다 */
        const s = hv.state
        if (s?.show) {
          s.show = false
          s.showAddOrRemoveRowsButton = false
          s.showAddOrRemoveColumnsButton = false
          hv.emitUpdate?.()
        }
        return
      }
      orig(e)
    }
    view.dom.removeEventListener('mousemove', orig)
    hv.mouseMoveHandler = wrapped
    view.dom.addEventListener('mousemove', wrapped)
    off = () => {
      view.dom.removeEventListener('mousemove', wrapped)
      hv.mouseMoveHandler = orig
      /* 편집기가 아직 살아 있으면 원래 처리기를 돌려준다. 이미 걷힌 편집기에는 안 건다 */
      if (view.dom.isConnected) view.dom.addEventListener('mousemove', orig)
    }
  }
  arm()
  return () => {
    tries = 99
    off?.()
  }
}
