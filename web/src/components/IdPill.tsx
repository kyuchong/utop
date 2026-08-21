import { useEffect, useState } from 'react'

/**
 * 이름 옆의 **번호 알약** — 누르면 그 자리 주소가 복사된다(지시).
 *
 * 번호는 남에게 「이거 봐 주세요」 하고 보낼 때 쓰는 값인데, 여태 옅은 글자로만
 * 적혀 있어서 긁어 복사해야 했다. 알약 하나로 번호를 세우고, 누르면 그 화면을
 * 여는 **주소**를 통째로 복사한다 — 받은 사람이 바로 그 자리로 들어온다.
 */
export default function IdPill({
  id,
  href,
  title,
}: {
  /** 보여 줄 번호 — REQ-… · TC-… · 사이클 ID */
  id: string
  /** 이 자리를 여는 주소(gotoHref 가 만든 것) */
  href: string
  title?: string
}) {
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => setDone(false), 1400)
    return () => clearTimeout(t)
  }, [done])

  if (!id) return null
  const url = `${window.location.origin}${href}`
  return (
    <button
      type="button"
      className={`id-pill${done ? ' done' : ''}`}
      title={title ?? `${id} — 누르면 이 자리 주소를 복사합니다\n${url}`}
      onClick={(e) => {
        e.stopPropagation()
        const ok = () => setDone(true)
        /* 안전한 자리(https·localhost)가 아니면 클립보드 API 가 없다.
           그때는 옛 방식으로 —  복사가 안 되면 아무 말도 없는 것이 제일 나쁘다. */
        if (navigator.clipboard?.writeText) {
          void navigator.clipboard.writeText(url).then(ok, () => fallback(url, ok))
          return
        }
        fallback(url, ok)
      }}
    >
      {done ? '복사됨' : id}
    </button>
  )
}

function fallback(text: string, ok: () => void) {
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    ok()
  } catch {
    window.prompt('주소를 복사하세요', text)
  }
}
