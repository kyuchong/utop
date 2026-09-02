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

/**
 * **「자동」·「수동」 을 알아듣는 한 곳.**
 *
 * 이 값은 SETUP 의 코드(tc_run_type·cycle_mode)에서 오고, **사람이 이름을
 * 바꿀 수 있다.** 253 은 「M」·「A」 로 쓰고 있다. 그런데 화면은 글자를
 * 그대로 견주고 있었다 — `=== '수동'`. 그러니 그 서버에서는
 *
 *   · 모든 시험이 자동으로 보이고(Plans·Runs 의 방식 칸)
 *   · 수동 시험서가 안 열리고(실행 상세가 자동 작업대를 편다)
 *   · 실행기가 사람 손이 필요한 항목을 그냥 돌린다
 *
 * 이름은 팀 것이니 바꾸라고 할 일이 아니다. 뜻만 여기서 풀어 읽는다.
 * **판정은 이 함수로, 화면에 그리는 글자는 원래 값으로** — 팀이 M 이라
 * 적어 두었으면 M 으로 보여야 한다.
 */
export type Mode = '자동' | '수동' | ''

export function normMode(v: unknown): Mode {
  const s = String(v ?? '').trim().toUpperCase()
  if (!s) return ''
  if (/^(수동|M|MANUAL|MAN|HAND|사람)$/.test(s)) return '수동'
  if (/^(자동|A|AUTO|AUTOMATIC)$/.test(s)) return '자동'
  /* 「혼합」 처럼 한쪽으로 못 정하는 값과, 우리가 모르는 값은 비워 둔다 —
     지어내면 반대쪽 화면이 안 열린다 */
  return ''
}

/** 수동인가 — 모르는 값은 수동이 아니다(예전과 같다) */
export const isManual = (v: unknown): boolean => normMode(v) === '수동'

export interface ModeGot {
  /** **판정에 쓸 값** — 자동·수동·빈 문자열 셋 중 하나로 풀어 놓은 것 */
  v: string
  /** 화면에 그릴 글자 — 저장된 그대로다(M·A 로 쓰는 서버가 있다) */
  raw: string
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
  /* 아는 말이면 풀어서, 모르는 말이면 그대로 — 뜻을 못 읽어도 화면에서
     사라지지는 않게 한다 */
  if (fixed) return { v: normMode(fixed) || fixed, raw: fixed, from: 'set', why: `${fixed} — 손으로 정한 값` }

  let a = 0
  let m = 0
  for (const it of items ?? []) {
    const k = String(it?.tcid ?? '').trim()
    if (!k) continue
    if (isManual(kindOf.get(k))) m++
    else a++
  }
  if (!a && !m) return { v: '', raw: '', from: 'none', why: '담긴 항목이 없습니다' }
  if (m && !a) return { v: '수동', raw: '수동', from: 'items', why: `수동 ${m}건 — 항목에서 정해집니다` }
  if (a && !m) return { v: '자동', raw: '자동', from: 'items', why: `자동 ${a}건 — 항목에서 정해집니다` }
  return { v: '', raw: '', from: 'items', why: `자동 ${a} · 수동 ${m} — 섞여 있습니다` }
}
