/**
 * 그림·동영상·파일 블록 **옆 빈자리** 클릭을 편집기에 넘기지 않는다(지시: 그림 폭에
 * 맞춰지도록).
 *
 * 편집기(ProseMirror)는 그림 블록 줄의 어디를 눌러도 — 그림 칸을 그림 폭으로
 * 줄여 놓아도 그 바깥 `.bn-block` 을 눌러도 — 「그 블록을 눌렀다」 로 읽어 커서를
 * 그림 블록에 두고, 그러면 그림에 손잡이가 켜져 골라진 것처럼 보인다(213 에서
 * 실측). 빈자리는 아무것도 아니어야 한다: 마우스 누름을 캡처 단계에서 끊는다.
 *
 * 그림 자체(`.bn-block-content` 안)를 누른 것은 그대로 편집기에 간다 — 고르고,
 * 크기를 바꾸고, 끄는 일은 여태처럼 된다.
 */
const MEDIA = new Set(['image', 'video', 'audio', 'file'])

export function guardMediaGap(root: HTMLElement | null): () => void {
  if (!root) return () => {}
  const onDown = (e: MouseEvent) => {
    const t = e.target as HTMLElement | null
    if (!t || t.closest('.bn-block-content')) return
    const outer = t.closest('.bn-block-outer')
    if (!outer) return
    /* 이 블록의 제 내용 칸 — 자식 블록들 것보다 DOM 에서 먼저 온다 */
    const content = outer.querySelector('.bn-block-content')
    const kind = content?.getAttribute('data-content-type') ?? ''
    if (!MEDIA.has(kind)) return
    e.preventDefault()
    e.stopPropagation()
  }
  root.addEventListener('mousedown', onDown, true)
  return () => root.removeEventListener('mousedown', onDown, true)
}
