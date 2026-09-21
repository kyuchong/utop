/**
 * 글자를 클립보드에 복사한다 — **http(비보안)에서도 되게**(지적).
 *
 * `navigator.clipboard` 는 https·localhost 에서만 있다. 사내 배포는
 * `http://220.1.1.x:9000` 이라 그 API 가 아예 없어, clipboard 만 쓰면
 * 조용히 실패한다(복사가 안 됨). 없으면 옛 `execCommand('copy')` 로
 * 물러선다 — 이 대체가 있어야 http 에서도 복사가 된다.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* 아래 옛 방식으로 */
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.cssText = 'position:fixed;left:-9999px;top:0'
  document.body.appendChild(ta)
  ta.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  ta.remove()
  return ok
}
