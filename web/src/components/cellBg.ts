/**
 * 표 **칸 배경색**.
 *
 * 툴바의 배경색은 **글자 배경**(인라인 스타일)이라, 칸을 드래그해 색을 골라도
 * 글자에만 칠해졌다(지적). 칸에는 따로 `backgroundColor` 가 있고 BlockNote 가
 * 그리기도 한다 — 다만 바꿀 길을 안 줄 뿐이다.
 *
 * 그래서 **툴바의 그 단추를 그대로 쓰되 가는 곳만 바꾼다**. 단추는 결국
 * `editor.addStyles({backgroundColor})` / `removeStyles` 를 부르므로 그 자리를
 * 감싼다 — 칸을 골라 뒀으면 칸을 칠하고, 아니면 하던 대로 글자를 칠한다.
 * 단추를 따로 세우지 않는 까닭은, 색을 칠하려는 사람은 어차피 툴바의 그
 * 배경색을 누르기 때문이다.
 *
 * prosemirror-tables 를 직접 들이지 않는다(BlockNote 가 딸려 오는 것이라 우리
 * 것이 아니다). 칸 선택인지는 그 선택만 가진 자리로 알아본다.
 */
type PmNode = { nodeSize: number }
type PmSel = {
  $anchorCell?: unknown
  forEachCell?: (f: (node: PmNode, pos: number) => void) => void
}

/**
 * 고른 칸들의 배경을 바꾼다. 'default' 면 지운다.
 * 바꿨으면 true — 칸 선택이 아니면 아무 일도 하지 않고 false(부른 쪽이 원래
 * 하던 일을 하도록).
 */
export function setCellBackground(editor: unknown, color: string): boolean {
  try {
    const ed = editor as {
      prosemirrorState: {
        selection: PmSel
        tr: {
          setNodeAttribute: (p: number, k: string, v: unknown) => void
          removeMark: (from: number, to: number, mark: unknown) => void
        }
      }
      prosemirrorView: { dispatch: (tr: unknown) => void; focus: () => void }
      pmSchema?: { marks?: Record<string, unknown> }
    }
    const sel = ed.prosemirrorState.selection
    if (!sel || !('$anchorCell' in sel) || typeof sel.forEachCell !== 'function') return false

    const tr = ed.prosemirrorState.tr
    /* 칸을 칠할 땐 그 안 **글자 배경을 걷어낸다** — 안 그러면 예전에 글자에
       칠해 둔 색이 칸 색 위에 얼룩으로 남는다 */
    const mark = ed.pmSchema?.marks?.backgroundColor
    sel.forEachCell((node, pos) => {
      tr.setNodeAttribute(pos, 'backgroundColor', color)
      if (mark) {
        try {
          tr.removeMark(pos, pos + node.nodeSize, mark)
        } catch {
          /* 글자 배경 걷기는 곁다리다 — 실패해도 칸 색은 칠한다 */
        }
      }
    })
    ed.prosemirrorView.dispatch(tr)
    ed.prosemirrorView.focus()
    return true
  } catch {
    return false
  }
}

type Styles = Record<string, unknown> | undefined

/**
 * 툴바의 배경색이 **칸으로도 가게** 한다. 편집기마다 한 번만 부르면 된다.
 *
 * 편집기 UI 는 손대지 않는다 — 판이 올라 툴바 구성이 바뀌어도 이 자리는 그대로
 * 있고, 혹 없어지면 감싸지 않고 조용히 물러난다(편집기가 깨지지 않도록).
 */
export function patchCellBg(editor: unknown): void {
  try {
    const ed = editor as Record<string, unknown> & { __cellBgPatched?: boolean }
    if (!ed || ed.__cellBgPatched) return
    const add = ed.addStyles
    const rm = ed.removeStyles
    if (typeof add !== 'function' || typeof rm !== 'function') return

    ed.addStyles = function (styles: Styles, ...rest: unknown[]) {
      const c = styles?.backgroundColor
      if (c !== undefined && setCellBackground(editor, String(c))) return
      return (add as (...a: unknown[]) => unknown).call(this, styles, ...rest)
    }
    ed.removeStyles = function (styles: Styles, ...rest: unknown[]) {
      if (styles && 'backgroundColor' in styles && setCellBackground(editor, 'default')) return
      return (rm as (...a: unknown[]) => unknown).call(this, styles, ...rest)
    }
    ed.__cellBgPatched = true
  } catch {
    /* 감싸기가 안 되면 예전대로 글자 배경만 된다 — 편집기는 산다 */
  }
}
