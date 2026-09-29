import type { BlockNoteEditor } from '@blocknote/core'

/**
 * 그림·동영상·파일 블록 **옆 빈자리** 클릭 처리(지시: 그림 폭에 맞춰지도록).
 *
 * 편집기(ProseMirror)는 그림 블록 줄의 어디를 눌러도 — 그림 칸을 그림 폭으로
 * 줄여 놓아도 그 바깥 `.bn-block` 을 눌러도 — 「그 블록을 눌렀다」 로 읽어 그림을
 * 고른다(213 에서 실측). 그래서 빈자리의 마우스 누름은 편집기에 안 넘긴다.
 *
 * 다만 삼키기만 하면 **골라 둔 그림이 안 풀린다**(지적: 그림 밖을 눌러도 해제가
 * 안 된다). 빈자리를 누르면 커서를 이웃 글 블록(다음, 없으면 앞)으로 옮긴다 —
 * 그림 선택은 풀리고, 빈 곳을 누른 느낌(커서만 옮겨감)은 다른 편집기와 같다.
 *
 * 그림 자체(`.bn-block-content` 안)를 누른 것은 그대로 편집기에 간다 — 고르고,
 * 크기를 바꾸고, 끄는 일은 여태처럼 된다.
 */
const MEDIA = new Set(['image', 'video', 'audio', 'file'])

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEditor = BlockNoteEditor<any, any, any>

export function guardMediaGap(root: HTMLElement | null, editor: AnyEditor): () => void {
  if (!root) return () => {}
  const onDown = (e: MouseEvent) => {
    const t = e.target as HTMLElement | null
    if (!t || t.closest('.bn-block-content')) return
    const outer = t.closest('.bn-block-outer') as HTMLElement | null
    if (!outer) return
    /* 이 블록의 제 내용 칸 — 자식 블록들 것보다 DOM 에서 먼저 온다 */
    const content = outer.querySelector('.bn-block-content')
    const kind = content?.getAttribute('data-content-type') ?? ''
    if (!MEDIA.has(kind)) return
    e.preventDefault()
    e.stopPropagation()
    /* 이웃 글 블록으로 커서를 — 그림 선택이 풀린다 */
    try {
      const id = outer.getAttribute('data-id') || ''
      const block = id ? editor.getBlock(id) : undefined
      if (!block) return
      const isText = (b: { type: string } | undefined) => !!b && !MEDIA.has(b.type) && b.type !== 'utopTable'
      const next = editor.getNextBlock(block)
      const prev = editor.getPrevBlock(block)
      if (isText(next)) editor.setTextCursorPosition(next!, 'start')
      else if (isText(prev)) editor.setTextCursorPosition(prev!, 'end')
      editor.focus()
    } catch {
      /* 편집기가 아직 안 붙었으면 그냥 삼킨다 */
    }
  }
  root.addEventListener('mousedown', onDown, true)
  return () => root.removeEventListener('mousedown', onDown, true)
}
