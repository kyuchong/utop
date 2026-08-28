import { useLayoutEffect, useRef } from 'react'

/**
 * 적는 만큼 **저절로 자라는 입력칸**.
 *
 * 붙박이 높이를 주면 세 줄만 넘어도 안에 스크롤이 생긴다. 그러면 적은
 * 글을 한눈에 못 보고, 오른쪽 미리보기와 견주려면 두 곳을 각각 굴려야
 * 한다(지시: 미리보기처럼 늘어나게).
 *
 * 재는 법은 브라우저에게 맡긴다 — 높이를 잠깐 auto 로 되돌려 **글이
 * 실제로 차지하는 높이**(scrollHeight)를 읽고 그만큼 준다. 글자 수로
 * 어림하면 줄바꿈·한글 조합·글꼴에 따라 매번 틀린다.
 *
 * 값이 바뀔 때마다 다시 잰다. 사람이 치는 것뿐 아니라 「고치기」 로 글이
 * 통째로 들어올 때도 자라야 하기 때문이다.
 */
export default function AutoGrow(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number },
) {
  const { minRows = 3, value, className, ...rest } = props
  const ref = useRef<HTMLTextAreaElement | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    /* 줄높이 × 최소 줄수 + 위아래 안쪽 여백 — 빈 칸이 한 줄로 쪼그라들면
       「여기에 적는다」 가 안 보인다 */
    const cs = getComputedStyle(el)
    const lh = parseFloat(cs.lineHeight) || 18
    const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
    el.style.height = `${Math.max(el.scrollHeight, lh * minRows + pad)}px`
  }, [value, minRows])

  return <textarea ref={ref} value={value} className={`dfx-ta${className ? ' ' + className : ''}`} {...rest} />
}
