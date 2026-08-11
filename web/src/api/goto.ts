/**
 * 다른 화면의 무언가를 연다.
 *
 * 사이클에서 TC ID 를 누르면 그 시험으로 가야 한다. 그런데 화면을 바꾸는
 * 것은 App 만 할 수 있고, 사이클은 App 의 자식이라 손이 안 닿는다.
 * props 로 내리면 그 사이의 부품이 전부 이 일과 상관없는 prop 을
 * 하나씩 더 들고 다녀야 한다.
 *
 * 창 하나에 화면 하나뿐이니 알림 하나로 족하다.
 */
export type GotoKind = 'tc' | 'req' | 'cycle' | 'report'

export function goto(kind: GotoKind, id: string): void {
  window.dispatchEvent(new CustomEvent('utop:goto', { detail: { kind, id } }))
}

export function onGoto(f: (kind: GotoKind, id: string) => void): () => void {
  const h = (e: Event) => {
    const d = (e as CustomEvent).detail as { kind: GotoKind; id: string }
    if (d?.id) f(d.kind, d.id)
  }
  window.addEventListener('utop:goto', h)
  return () => window.removeEventListener('utop:goto', h)
}

/**
 * 같은 곳으로 가는 **주소**.
 *
 * 여태 화면 이동은 단추였다. 그러니 오른쪽 단추를 눌러도 「새 탭에서
 * 열기」 가 안 나왔다 — 브라우저는 링크에만 그것을 준다. 시험을 둘
 * 나란히 놓고 견주려면 새 탭이 있어야 한다.
 *
 * 이 주소로 들어오면 App 이 읽어 그 화면을 연다(App.tsx 의 `?tc=` 처리).
 * 왼쪽 단추로 그냥 누를 때는 새로 읽지 않고 지금 창에서 넘어간다 —
 * 페이지를 다시 받으면 몇 초가 든다.
 */
export function gotoHref(kind: GotoKind, id: string): string {
  return `${window.location.pathname}?${kind}=${encodeURIComponent(id)}`
}

/**
 * 링크를 눌렀을 때. Ctrl·Shift·가운데 단추는 **브라우저에게 맡긴다** —
 * 새 탭·새 창은 사람이 그 방식으로 부탁한 것이다.
 */
export function gotoClick(
  e: { button: number; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; preventDefault(): void },
  kind: GotoKind,
  id: string,
): void {
  if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return
  e.preventDefault()
  goto(kind, id)
}
