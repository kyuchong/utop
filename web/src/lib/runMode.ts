/**
 * **시험 방식(자동·수동)을 정하는 한 곳.**
 *
 * 같은 규칙이 Plans 표·Runs 표·실행 상세 세 군데에서 쓰인다. 두 벌로 두면
 * 한쪽만 고쳐져 「플랜은 수동인데 실행은 자동」 이 된다(실제로 그랬다).
 *
 * 차례는 이렇다:
 *   ① 손으로 정한 값이 있으면 그게 이긴다
 *   ② 없으면 **담긴 항목**에서 뽑는다 — 전부 자동이면 자동, 전부 수동이면 수동
 *   ③ 섞여 있으면 **비운다.** 한쪽으로 우기면 반대쪽 시험서가 안 열린다
 */

export interface ModeGot {
  /** 화면에 쓸 값. 못 정하면 빈 문자열 */
  v: string
  /** 어디서 나온 값인가 — 손으로 정한 값은 진하게, 뽑은 값은 흐리게 그린다 */
  from: 'set' | 'items' | 'none'
  /** 말풍선에 적을 까닭 */
  why: string
}

export function resolveMode(
  set: string | null | undefined,
  items: Array<{ tcid?: string | null }> | null | undefined,
  kindOf: Map<string, string>,
): ModeGot {
  const fixed = String(set ?? '').trim()
  if (fixed) return { v: fixed, from: 'set', why: `${fixed} — 손으로 정한 값` }

  let a = 0
  let m = 0
  for (const it of items ?? []) {
    const k = String(it?.tcid ?? '').trim()
    if (!k) continue
    if ((kindOf.get(k) ?? '자동') === '수동') m++
    else a++
  }
  if (!a && !m) return { v: '', from: 'none', why: '담긴 항목이 없습니다' }
  if (m && !a) return { v: '수동', from: 'items', why: `수동 ${m}건 — 항목에서 정해집니다` }
  if (a && !m) return { v: '자동', from: 'items', why: `자동 ${a}건 — 항목에서 정해집니다` }
  return { v: '', from: 'items', why: `자동 ${a} · 수동 ${m} — 섞여 있습니다` }
}
