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
  const strip = useRef<HTMLSpanElement>(null)
  const val = useRef(d)

  /* 처음 설 때는 **구르지 않는다.** transition 을 켠 채로 첫 자리를 잡으면
     0 에서 제 값까지 모든 자리가 한꺼번에 굴러 올라간다 — 화면을 열 때마다
     숫자가 잘린 채 흐르는 것처럼 보인다(지적). 잠깐 끄고 놓은 뒤 켠다. */
  useEffect(() => {
    const el = strip.current
    if (!el) return
    el.style.transition = 'none'
    el.style.transform = `translateY(${-val.current * (100 / 11)}%)`
    void el.offsetHeight
    el.style.transition = ''
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const el = strip.current
    if (!el) return
    const cur = val.current
    if (cur === d) return
    val.current = d
    const place = (i: number) => {
      el.style.transform = `translateY(${-i * (100 / 11)}%)`
    }
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
    <span className="rn-d">
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
