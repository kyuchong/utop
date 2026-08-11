import { useEffect, useState } from 'react'

/**
 * 이 화면이 **옛 판**인가.
 *
 * 서버를 새로 올려도 브라우저는 자기가 받아 둔 자바스크립트를 계속 쓴다.
 * 그래서 한 사람은 새 화면, 한 사람은 옛 화면을 보게 되는데 — 자료는
 * 서버에 하나뿐이라 같은데도 — 화면이 서로 다른 말을 한다.
 *
 * 실제로 겪은 일: 같은 사이클을 두 계정이 열었는데 한쪽은 20줄, 한쪽은
 * 200줄이 보였다. 자료가 어긋난 줄 알고 한참 뒤졌지만 옛 화면이 옛 셈법
 * 으로 그린 것뿐이었다. 사람이 알아챌 방법이 없었다.
 *
 * 알아내는 법은 간단하다. `index.html` 은 늘 자기 짝인 자바스크립트
 * 파일 이름을 적고 있고, 그 이름에는 내용이 바뀌면 달라지는 해시가 붙는다.
 * 지금 서버가 내주는 이름과 내가 받아 둔 이름을 견주면 된다. 빌드에
 * 손댈 것도, 서버에 새 길을 낼 것도 없다.
 */
export function useFreshBuild(everyMs = 60_000): boolean {
  const [stale, setStale] = useState(false)

  useEffect(() => {
    // 내가 지금 돌리고 있는 파일 이름
    const mine = [...document.querySelectorAll('script[src]')]
      .map((s) => (s as HTMLScriptElement).src)
      .map((u) => u.split('/').pop() ?? '')
      .find((n) => n.startsWith('index-'))
    if (!mine) return

    let dead = false
    const look = async () => {
      try {
        // 캐시를 건너뛴다 — 캐시된 index.html 을 보면 늘 같다고 나온다
        const r = await fetch(`/?_=${Date.now()}`, { cache: 'no-store' })
        if (!r.ok) return
        const html = await r.text()
        const now = /assets\/(index-[A-Za-z0-9_-]+\.js)/.exec(html)?.[1]
        if (!dead && now && now !== mine) setStale(true)
      } catch {
        /* 못 물어봐도 하던 일은 계속한다 — 잠깐 끊긴 것일 수 있다 */
      }
    }
    void look()
    const t = setInterval(look, everyMs)
    return () => {
      dead = true
      clearInterval(t)
    }
  }, [everyMs])

  return stale
}
