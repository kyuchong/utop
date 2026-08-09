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
