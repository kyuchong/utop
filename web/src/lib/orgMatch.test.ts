import { describe, expect, it } from 'vitest'
import { chartKeys } from '@/lib/orgMatch'

// 213 조직도·계정에서 실제로 빠지던 꼴(같은 이름 → 조직도는 숫자로 가른다)
const entries = [
  { base: '이승훈1', path: ' › 고객품질담당 › 기술3팀' },
  { base: '이승훈2', path: ' › 품질보증담당 › QA팀' },
  { base: '김준호1', path: ' › 공공사업그룹 › 사업3담당 › 네트웍사업4팀' },
  { base: '김준호2', path: ' › 전략구매담당 › 구매팀' },
  { base: '서정호', path: ' › 품질보증담당 › PA1팀' },
  { base: '장수완', path: ' › 품질보증담당 › QA팀' },
]
const people = [
  { name: '이승훈(검증)', org: '검증' },
  { name: '이승훈(기술)', org: '기술' },
  { name: '김준호(사업)', org: '사업' },
  { name: '서정호2', org: '' },
  { name: '장수완(검증)', org: '검증' },
  { name: '배성윤(검증)', org: '검증' },
]

describe('담당 고르개 — 계정 ↔ 조직도 짝짓기', () => {
  const k = chartKeys(people, entries)
  it('같은 이름 둘 — 소속이 조직 길에 든 쪽, 남은 하나끼리', () => {
    expect(k.get('이승훈(기술)')).toBe('이승훈1') // 「기술」 이 「기술3팀」 길에
    expect(k.get('이승훈(검증)')).toBe('이승훈2') // 남은 하나끼리
    expect(k.get('김준호(사업)')).toBe('김준호1') // 「사업」 이 「사업3담당」 길에, 김준호2 는 계정 없음
  })
  it('계정 이름 끝 숫자는 떼고 찾는다 · 보통 이름은 그대로 · 조직도에 없으면 짝 없음', () => {
    expect(k.get('서정호2')).toBe('서정호')
    expect(k.get('장수완(검증)')).toBe('장수완')
    expect(k.has('배성윤(검증)')).toBe(false)
  })
})
