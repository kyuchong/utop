import { describe, expect, it } from 'vitest'
import { mmByGroup, monthTrend } from './EffortViews'
import type { EfColumn } from './model'

const cols: EfColumn[] = [
  { id: 'name', title: '인원', type: 'text' },
  { id: 'dept', title: '부서', type: 'select' },
  { id: 'm01', title: '01월', type: 'number' },
  { id: 'm02', title: '02월', type: 'number' },
  { id: 'total', title: '합계', type: 'number', autoSum: true },
]
const rows = [
  { name: '김', dept: 'A', m01: 1, m02: 1, total: 2 },
  { name: '김', dept: 'A', m01: 0.5, m02: 0.5, total: 1 },
  { name: '이', dept: 'B', m01: 0.5, total: 0.5 },
]

describe('차트 집계', () => {
  it('기준 열별 공수 합계 — 큰 차례, 가득 찬 투입 = 인원 수 × 월 열 수', () => {
    const g = mmByGroup(rows, cols, cols[0])
    expect(g).toEqual([
      { k: '김', sum: 3, full: 2 }, // 2개월에 3 M/M → 넘침(주황)
      { k: '이', sum: 0.5, full: 2 },
    ])
    const byDept = mmByGroup(rows, cols, cols[1])
    expect(byDept[0]).toEqual({ k: 'A', sum: 3, full: 2 })
  })
  it('월별 추이 — 자동 합계 열은 빼고 월 열마다 합', () => {
    expect(monthTrend(rows, cols)).toEqual([
      { t: '01월', v: 2 },
      { t: '02월', v: 1.5 },
    ])
  })
})
