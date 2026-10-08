import { describe, expect, it } from 'vitest'
import { personName } from '@/components/jira/personName'

// 지라 표시 이름 → 표의 「성+이름(부서)」(지시). 실제 이 지라에 있는 꼴들이다
describe('personName', () => {
  it('부서를 괄호로', () => {
    expect(personName('김인겸(검증)')).toBe('김인겸(검증)')
    expect(personName('김부근(SW2G)')).toBe('김부근(SW2G)')
  })
  it('퇴사는 짧게', () => {
    expect(personName('이승진(검증)-퇴사자')).toBe('이승진(검증·퇴사)')
    expect(personName('신길수(퇴사자)')).toBe('신길수(퇴사)')
  })
  it('부서가 없으면 이름만, 한글 이름이 아니면 그대로', () => {
    expect(personName('정민호 책임')).toBe('정민호')
    expect(personName('ITEST Bot')).toBe('ITEST Bot')
  })
})
