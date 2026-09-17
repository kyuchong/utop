/**
 * 표 **셀 배경색** — BlockNote 가 값은 들고 있는데 바꿀 길을 안 준다.
 *
 * 툴바의 배경색은 **글자 배경**(인라인 스타일)이라 글자에만 칠해진다.
 * 셀을 드래그해 색을 골라도 칸은 그대로인 것이 그 때문이다(지적).
 * 셀에는 따로 `backgroundColor` 가 있고 그리기도 한다 — 그것을 바꾼다.
 *
 * prosemirror-tables 를 직접 들이지 않는다(BlockNote 가 딸려 오는 것이라
 * 우리 것이 아니다). 셀 선택인지는 그 선택만 가진 두 자리로 알아본다.
 */
type PmSel = {
  $anchorCell?: unknown
  forEachCell?: (f: (node: unknown, pos: number) => void) => void
}

/** 지금 표 셀을 골라 둔 상태인가 */
export function hasCellSelection(editor: unknown): boolean {
  try {
    const sel = (editor as { prosemirrorState?: { selection?: PmSel } })?.prosemirrorState?.selection
    return !!sel && '$anchorCell' in sel && typeof sel.forEachCell === 'function'
  } catch {
    return false
  }
}

/**
 * 고른 셀들의 배경을 바꾼다. 'default' 면 지운다.
 * 바꿨으면 true — 셀 선택이 아니면 아무 일도 하지 않고 false.
 */
export function setCellBackground(editor: unknown, color: string): boolean {
  try {
    const ed = editor as {
      prosemirrorState: { selection: PmSel; tr: { setNodeAttribute: (p: number, k: string, v: unknown) => void } }
      prosemirrorView: { dispatch: (tr: unknown) => void; focus: () => void }
    }
    const sel = ed.prosemirrorState.selection
    if (!sel || !('$anchorCell' in sel) || typeof sel.forEachCell !== 'function') return false
    const tr = ed.prosemirrorState.tr
    sel.forEachCell((_node, pos) => {
      tr.setNodeAttribute(pos, 'backgroundColor', color)
    })
    ed.prosemirrorView.dispatch(tr)
    ed.prosemirrorView.focus()
    return true
  } catch {
    return false
  }
}

/** 고를 수 있는 색 — BlockNote 가 쓰는 이름 그대로여야 그 CSS 가 먹는다 */
export const CELL_BG = [
  ['default', '없음'],
  ['gray', '회색'],
  ['brown', '갈색'],
  ['red', '빨강'],
  ['orange', '주황'],
  ['yellow', '노랑'],
  ['green', '초록'],
  ['blue', '파랑'],
  ['purple', '보라'],
  ['pink', '분홍'],
] as const
