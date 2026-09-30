/**
 * Coverage AI · Basic — **다음 행동 실행 계획**(지시: 룰 10 을 프롬프트로).
 *
 * LLM 은 매 턴 행동 하나(next)를 정한다. 화면은 그 행동만 실행하되, 아래 가드는
 * **코드가 지킨다** — 프롬프트를 어떻게 고쳐도 흔들리면 안 되는 것들이다.
 *
 *   · 장비 → 항목 순서(지시: 코드 유지) — 장비가 없는데 항목 행동이 오면 장비부터 묻고
 *     질문을 쥐어 둔다. 장비를 고르면 그 말로 항목을 잇는다.
 *   · 실행은 절차가 준비돼 있을 때만.
 *   · 한 대 확정은 후보가 정말 한 대일 때만 — 아니면 묻는다.
 *   · 모르는 행동이면 옛 흐름(legacy)으로 물러선다(LLM 없음·형식 틀림).
 *
 * 판단만 하는 순수 함수라 정답표(nextPlan.test.ts)로 고정한다.
 */
export const NEXT_ACTIONS = [
  'chat',
  'show_devices',
  'show_tcs',
  'show_result',
  'confirm_device',
  'ask_device',
  'keep_device',
  'use_device',
  'repick_device',
  'pick_tc',
  'ask_tc',
  'suggest_tc',
  'wait_tc',
  'run',
  'none',
] as const
export type NextAction = (typeof NEXT_ACTIONS)[number]
const OK = new Set<string>(NEXT_ACTIONS)
const TC_ACTS = new Set<string>(['pick_tc', 'ask_tc', 'suggest_tc'])

export interface NextInput {
  /** LLM 이 정한 행동 */
  next: string
  /** 대상 장비가 이미 정해져 있나 */
  hasDevice: boolean
  /** 절차가 준비돼 있나 · 지금 도는 중인가 · 결과가 있나 */
  hasDraft: boolean
  running: boolean
  hasResult: boolean
  /** 말(또는 LLM 이 짚은 장비)에 맞는 장비 후보 수 */
  candCount: number
  /** 시험할 내용(LLM 의 tc — 질문에 실제로 있는 글자) */
  tc: string
  /** 말에 시험하려는 뜻이 보이나(「시험·확인·조회·해줘」) — tc 가 비었을 때의 대비 */
  testish: boolean
}

export interface NextPlan {
  act: NextAction | 'legacy'
  /** 장비를 묻는 경우 — 고른 뒤 이 말로 항목을 이을지(질문을 쥐어 둘지) */
  hold: boolean
  /** 가드가 바꾼 까닭 — 로그·검사용 */
  why?: 'order' | 'not_ready' | 'no_result' | 'not_one' | 'no_device'
}

export function planNext(i: NextInput): NextPlan {
  const nx = String(i.next ?? '').trim()
  if (!OK.has(nx)) return { act: 'legacy', hold: false }
  const wants = !!i.tc.trim() || i.testish
  /* 장비 → 항목(코드 고정) */
  if (TC_ACTS.has(nx) && !i.hasDevice) return { act: 'ask_device', hold: true, why: 'order' }
  if (nx === 'run')
    return i.hasDraft && !i.running ? { act: 'run', hold: false } : { act: 'chat', hold: false, why: 'not_ready' }
  if (nx === 'show_result' && !i.hasResult) return { act: 'chat', hold: false, why: 'no_result' }
  if ((nx === 'keep_device' || nx === 'use_device') && !i.hasDevice)
    return { act: 'ask_device', hold: wants, why: 'no_device' }
  if (nx === 'confirm_device' && i.candCount !== 1) return { act: 'ask_device', hold: wants, why: 'not_one' }
  if (nx === 'ask_device') return { act: 'ask_device', hold: wants }
  if (nx === 'none') return { act: 'chat', hold: false }
  return { act: nx as NextAction, hold: false }
}
