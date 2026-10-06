import { describe, expect, it } from 'vitest'
import { chartsOn, cumTrend, headsByMonth, mmByGroup, monthByGroup, monthTrend, personMonth, quarterSums, setChartsOn, utilByPerson } from './EffortViews'
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

describe('고를 수 있는 차트 — 집계', () => {
  it('누적 · 분기(월 열이 12개가 아니면 「01월~02월」)', () => {
    expect(cumTrend(rows, cols)).toEqual([
      { t: '01월', v: 2 },
      { t: '02월', v: 3.5 },
    ])
    expect(quarterSums(rows, cols)).toEqual([{ t: '01월~02월', v: 3.5 }])
  })
  it('기준 열 값마다 월별 공수 — 큰 차례', () => {
    expect(monthByGroup(rows, cols, cols[1]).series).toEqual([
      { name: 'A', data: [1.5, 1.5] },
      { name: 'B', data: [0.5, 0] },
    ])
  })
  it('인원 × 월 · 평균 투입률(%) · 월별 투입 인원', () => {
    expect(personMonth(rows, cols).people).toEqual([
      { k: '김', v: [1.5, 1.5] },
      { k: '이', v: [0.5, 0] },
    ])
    expect(utilByPerson(rows, cols)).toEqual([
      { k: '김', v: 150 },
      { k: '이', v: 25 },
    ])
    expect(headsByMonth(rows, cols)).toEqual([
      { t: '01월', v: 2 },
      { t: '02월', v: 1 },
    ])
  })
  it('켠 차트 — 없으면 기본 네 개, 예전 hidden 은 빼고, 저장은 목록 차례로', () => {
    const v = { id: 'v', name: '차트', type: 'chart' } as { id: string; name: string; type: string; [k: string]: unknown }
    expect(chartsOn(v)).toEqual(['cnt', 'sum', 'mm', 'mon'])
    v.chartSet = { hidden: ['sum'], custom: [] }
    expect(chartsOn(v)).toEqual(['cnt', 'mm', 'mon'])
    setChartsOn(v, ['heat', 'cnt'])
    expect(chartsOn(v)).toEqual(['cnt', 'heat'])
  })
})
