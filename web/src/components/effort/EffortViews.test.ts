import { describe, expect, it } from 'vitest'
import { MONTH, chartSetOf, chartTitle, customSeries, mmByGroup, monthTrend } from './EffortViews'
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

describe('차트 추가 — 사용자 차트 자료', () => {
  it('열별 값 — 공수 합계·행 개수·숫자 열, 큰 차례', () => {
    expect(customSeries({ id: 'x', kind: 'bar', by: 'dept', val: 'mm' }, rows, cols)).toEqual({ labels: ['A', 'B'], series: [{ name: '합계', data: [3, 0.5] }] })
    expect(customSeries({ id: 'x', kind: 'bar', by: 'dept', val: 'count' }, rows, cols).series[0]!.data).toEqual([2, 1])
    expect(customSeries({ id: 'x', kind: 'bar', by: 'dept', val: 'm02' }, rows, cols).series[0]!.data).toEqual([1.5, 0])
  })
  it('월별 — 나누지 않으면 한 계열, 나누면 값마다 계열', () => {
    expect(customSeries({ id: 'x', kind: 'line', by: MONTH, val: 'mm' }, rows, cols)).toEqual({ labels: ['01월', '02월'], series: [{ name: '합계', data: [2, 1.5] }] })
    const s = customSeries({ id: 'x', kind: 'line', by: MONTH, val: 'mm', split: 'dept' }, rows, cols)
    expect(s.series).toEqual([
      { name: 'A', data: [1.5, 1.5] },
      { name: 'B', data: [0.5, 0] },
    ])
  })
  it('제목 — 비우면 자동, 쓰면 그대로', () => {
    expect(chartTitle({ id: 'x', kind: 'bar', by: 'dept', val: 'count' }, cols)).toBe('부서별 개수')
    expect(chartTitle({ id: 'x', kind: 'line', by: MONTH, val: 'mm', split: 'dept' }, cols)).toBe('월별 공수 — 부서별')
    expect(chartTitle({ id: 'x', kind: 'bar', by: 'dept', val: 'mm', title: ' 내 차트 ' }, cols)).toBe('내 차트')
  })
  it('보기에 차트 설정이 없으면 빈 설정을 붙인다', () => {
    const v = { id: 'v', name: '차트', type: 'chart' } as { id: string; name: string; type: string; [k: string]: unknown }
    expect(chartSetOf(v)).toEqual({ hidden: [], custom: [] })
    expect(v.chartSet).toBe(chartSetOf(v))
  })
})
