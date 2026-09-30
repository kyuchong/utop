import { describe, expect, it } from 'vitest'
import { planNext, type NextInput } from './nextPlan'

const base: NextInput = {
  next: '',
  hasDevice: false,
  hasDraft: false,
  running: false,
  hasResult: false,
  candCount: 0,
  tc: '',
  testish: false,
}
const p = (x: Partial<NextInput>) => planNext({ ...base, ...x })

describe('다음 행동 — 코드 가드', () => {
  it('모르는 행동·빈 값이면 옛 흐름으로', () => {
    expect(p({ next: '' }).act).toBe('legacy')
    expect(p({ next: 'fly' }).act).toBe('legacy')
  })
  it('장비 → 항목: 장비가 없는데 항목 행동이면 장비부터 묻고 질문을 쥔다', () => {
    for (const nx of ['ask_tc', 'pick_tc', 'suggest_tc']) {
      const r = p({ next: nx, tc: 'SNMP' })
      expect(r).toEqual({ act: 'ask_device', hold: true, why: 'order' })
    }
  })
  it('장비가 있으면 항목 행동을 그대로', () => {
    expect(p({ next: 'ask_tc', hasDevice: true, tc: 'SNMP' }).act).toBe('ask_tc')
    expect(p({ next: 'suggest_tc', hasDevice: true }).act).toBe('suggest_tc')
  })
  it('실행은 절차가 준비됐을 때만', () => {
    expect(p({ next: 'run' })).toEqual({ act: 'chat', hold: false, why: 'not_ready' })
    expect(p({ next: 'run', hasDraft: true, running: true }).why).toBe('not_ready')
    expect(p({ next: 'run', hasDraft: true }).act).toBe('run')
  })
  it('결과가 없으면 결과 보기 대신 안내', () => {
    expect(p({ next: 'show_result' }).why).toBe('no_result')
    expect(p({ next: 'show_result', hasResult: true }).act).toBe('show_result')
  })
  it('한 대 확정은 후보가 정말 한 대일 때만', () => {
    expect(p({ next: 'confirm_device', candCount: 1 }).act).toBe('confirm_device')
    expect(p({ next: 'confirm_device', candCount: 2, testish: true })).toEqual({
      act: 'ask_device',
      hold: true,
      why: 'not_one',
    })
  })
  it('유지할 장비가 없으면 묻는다', () => {
    expect(p({ next: 'keep_device' }).act).toBe('ask_device')
    expect(p({ next: 'keep_device', hasDevice: true }).act).toBe('keep_device')
  })
  it('장비를 물을 때 시험할 내용이 있으면 쥐고, 없으면 안 쥔다', () => {
    expect(p({ next: 'ask_device', tc: 'SNMP' }).hold).toBe(true)
    expect(p({ next: 'ask_device', testish: true }).hold).toBe(true)
    expect(p({ next: 'ask_device' }).hold).toBe(false)
  })
  it('none 은 말로만 답한다', () => {
    expect(p({ next: 'none' }).act).toBe('chat')
  })
})
