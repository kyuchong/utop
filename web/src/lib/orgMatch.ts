/* 담당 고르개(AssigneePicker)의 계정 ↔ 조직도 짝짓기 — 화면과 떼어 둔 순수 함수(테스트용) */

/** 계정 이름의 꼬리를 뗀다 — 「구병근(검증)」 → 「구병근」. 조직도는 꼬리 없는 이름을 쓴다 */
export const baseOf = (v: string) => (v.split(/[([_]/)[0] ?? '').trim()

/**
 * 계정 → 조직도 이름 짝짓기. 보통은 꼬리 뗀 이름이 같으면 그 사람이다.
 *
 * **같은 이름이 둘이면** 계정 관리는 조직도에 「이승훈1·이승훈2」 처럼 숫자를 붙여 가른다.
 * 계정은 「이승훈(검증)」·「이승훈(기술)」 이라 꼬리만 떼서는 어느 쪽과도 안 맞아 둘 다 「조직도 밖」 으로
 * 빠졌다(지적: 이름이 겹쳐 2 를 붙인 사람은 분류가 안 된다). 계정 관리처럼 숫자를 떼고 찾되,
 * 여럿이면 계정의 소속(꼬리 조직·소속담당)이 조직 길에 든 쪽으로, 끝까지 하나씩 남으면 그 둘을 잇는다.
 * 계정 이름에 숫자가 붙은 경우(「서정호2」)도 숫자를 떼고 찾는다.
 * 돌려주는 값: 계정 이름 → 조직도 쪽 이름(꼬리 뗀). 짝이 없으면 넣지 않는다.
 */
export function chartKeys(people: Array<{ name: string; org: string }>, entries: Array<{ base: string; path: string }>) {
  const bases = new Set(entries.map((e) => e.base))
  const key = new Map<string, string>()
  for (const u of people) {
    const b = baseOf(u.name)
    if (bases.has(b)) key.set(u.name, b)
    else if (/\d+$/.test(b) && bases.has(b.replace(/\d+$/, ''))) key.set(u.name, b.replace(/\d+$/, ''))
  }
  // 숫자 붙은 조직도 이름 — 줄기(숫자 뗀 이름)마다 묶어 짝짓는다
  const dup = new Map<string, Array<{ base: string; path: string }>>()
  for (const e of entries) {
    if (!/\d+$/.test(e.base)) continue
    const stem = e.base.replace(/\d+$/, '')
    if (!dup.has(stem)) dup.set(stem, [])
    dup.get(stem)!.push(e)
  }
  for (const [stem, ents] of dup) {
    let cands = people.filter((u) => !key.has(u.name) && baseOf(u.name) === stem)
    let left = [...ents]
    // ① 소속이 조직 길에 든 짝
    for (const e of [...left]) {
      const hit = cands.filter((u) => u.org && e.path.includes(u.org))
      if (hit.length === 1) {
        key.set(hit[0]!.name, e.base)
        cands = cands.filter((u) => u !== hit[0])
        left = left.filter((x) => x !== e)
      }
    }
    // ② 하나씩만 남으면 잇는다
    if (left.length === 1 && cands.length === 1) key.set(cands[0]!.name, left[0]!.base)
  }
  return key
}
