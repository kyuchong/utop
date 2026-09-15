import { useEffect, useRef } from 'react'

/**
 * **굴러가는 숫자** — 값이 바뀌면 숫자 띠가 아래에서 위로 밀려 올라간다
 * (주신 코드의 odometer 방식).
 *
 * 경과 시간처럼 1 초마다 바뀌는 자리에서, 글자가 그냥 갈아 끼워지면 바뀐
 * 줄도 모르고 지나간다. 굴러 올라가면 「지금 재는 중」 이 눈에 걸린다.
 *
 * 숫자가 **늘 위로** 가도록 띠에 0..9 다음 0 을 한 칸 더 둔다 — 9 → 0 을
 * 그 여분 칸까지 굴린 뒤 소리 없이 되감는다. 그러지 않으면 자릿수가 넘칠
 * 때마다 혼자 거꾸로 내려가 눈에 거슬린다.
 */
function RollDigit({ d }: { d: number }) {
  const box = useRef<HTMLSpanElement>(null)
  const strip = useRef<HTMLSpanElement>(null)
  const val = useRef(d)

  /**
   * 한 칸 높이를 **정수 픽셀로 못 박는다**(지시).
   *
   * 퍼센트(100/11 = 9.0909…%)로 밀면 칸마다 소수점이 남아, 아홉 칸쯤
   * 내려가면 오차가 쌓여 숫자가 반 픽셀 걸친 채 흐릿하게 잘린다. 칸 높이를
   * 재서 px 로 박아 두면 몇 칸을 내려가도 경계가 딱 맞는다.
   */
  const measure = () => {
    const el = box.current
    const one = strip.current?.firstElementChild
    if (!el || !one) return
    /* **한 칸의 높이를 CSS 픽셀로** 읽는다.
       · 반올림하지 않는다 — 칸이 15.4px 인데 15px 씩 밀면 아홉 칸에서
         4px 가 어긋난다.
       · getBoundingClientRect 가 아니라 계산된 스타일을 본다 — 앞엣것은
         화면 확대가 걸리면 확대된 값을 주는데, transform 은 CSS 픽셀로
         움직이므로 그 값을 넣으면 확대할 때마다 어긋난다. */
    const h = parseFloat(getComputedStyle(one as Element).height)
    if (h > 0) el.style.setProperty('--rn-h', `${h}px`)
  }
  const place = (i: number) => {
    const el = strip.current
    if (el) el.style.transform = `translateY(calc(var(--rn-h) * ${-i}))`
  }

  /* 처음 설 때는 **구르지 않는다.** transition 을 켠 채로 첫 자리를 잡으면
     0 에서 제 값까지 모든 자리가 한꺼번에 굴러 올라간다 — 화면을 열 때마다
     숫자가 잘린 채 흐르는 것처럼 보인다(지적). 잠깐 끄고 놓은 뒤 켠다. */
  useEffect(() => {
    const el = strip.current
    if (!el) return
    measure()
    el.style.transition = 'none'
    place(val.current)
    void el.offsetHeight
    el.style.transition = ''
    /* 글자가 커지거나 화면을 확대하면 칸도 자란다 — 그때마다 다시 재고
       지금 자리를 다시 잡는다. 안 그러면 칸만 커지고 미는 거리는 그대로라
       숫자가 통째로 삐져나온다(실측: 확대 3.4 배에서 어긋남). */
    const bx = box.current
    if (!bx || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      const s2 = strip.current
      if (!s2) return
      measure()
      const keep = s2.style.transition
      s2.style.transition = 'none'
      place(val.current)
      void s2.offsetHeight
      s2.style.transition = keep
    })
    ro.observe(bx)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const el = strip.current
    if (!el) return
    const cur = val.current
    if (cur === d) return
    val.current = d
    /* 글자 크기가 바뀌었을 수 있다(도는 중에는 한 급 커진다) — 굴리기 전에
       한 번 다시 잰다. 값이 같으면 브라우저가 아무 일도 하지 않는다. */
    measure()
    const snap = (i: number) => {
      el.style.transition = 'none'
      place(i)
      void el.offsetHeight /* 되감기를 눈에 안 띄게 — 강제로 다시 그린다 */
      el.style.transition = ''
    }
    if (cur === 9 && d === 0) {
      place(10)
      const done = () => {
        el.removeEventListener('transitionend', done)
        snap(0)
      }
      el.addEventListener('transitionend', done)
    } else if (cur === 0 && d === 9) {
      /* 거꾸로 갈 때(되돌리기·다시 실행)도 결은 같게 — 여분 칸에서 내려온다 */
      snap(10)
      requestAnimationFrame(() => place(9))
    } else {
      place(d)
    }
  }, [d])

  return (
    <span className="rn-d" ref={box}>
      <span className="rn-s" ref={strip}>
        {Array.from({ length: 11 }, (_, i) => (
          <i key={i}>{i % 10}</i>
        ))}
      </span>
    </span>
  )
}

/**
 * 글 한 줄을 굴러가는 숫자로 그린다 — **숫자만** 구르고 나머지(`:` `·`
 * 「시작」 같은 글자)는 그대로 선다.
 *
 * 글자 수가 달라지면 자리가 새로 짜인다. 시각·경과는 자릿수가 고정이라
 * 그럴 일이 없다.
 */
export default function RollNum({ text, className }: { text: string; className?: string }) {
  const s = String(text ?? '')
  return (
    <span className={`rn${className ? ` ${className}` : ''}`}>
      {[...s].map((ch, i) =>
        ch >= '0' && ch <= '9' ? (
          <RollDigit key={i} d={Number(ch)} />
        ) : (
          <span className="rn-x" key={i}>
            {ch}
          </span>
        ),
      )}
    </span>
  )
}
