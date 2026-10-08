import { describe, expect, it } from 'vitest'
import { MM, MONTH, ncData, ncOf, type NcSpec } from './EffortChart'
import type { EfColumn, EfView } from './model'

const cols: EfColumn[] = [
  { id: 'name', title: '인원', type: 'text' },
  { id: 'dept', title: '부서', type: 'select', options: ['B', 'A'] },
  { id: 'tag', title: '태그', type: 'multiselect', options: ['x', 'y'] },
  { id: 'd', title: '날짜', type: 'date' },
  { id: 'm01', title: '01월', type: 'number' },
  { id: 'm02', title: '02월', type: 'number' },
  { id: 'total', title: '합계', type: 'number', autoSum: true },
]
const rows = [
  { name: '김', dept: 'A', tag: 'x, y', d: '2026-01-05', m01: 1, m02: 0.5, total: 1.5 },
  { name: '이', dept: 'B', tag: 'x', d: '2026-01-20', m01: 0.5, total: 0.5 },
  { name: '박', dept: 'A', d: '2026-02-03', m02: 1, total: 1 },
]
const base = (p: Partial<NcSpec>): NcSpec => ({ ...ncOf({ id: 'v', name: '차트', type: 'chart' } as EfView, cols), ...p })

describe('노션식 차트 자료', () => {
  it('기본 — 첫 선택 열(부서)을 X, 공수 합계를 Y. 예전 기준 열은 X 로 이어 받는다', () => {
    const v = { id: 'v', name: '차트', type: 'chart', chartCol: 'name' } as EfView
    expect(ncOf({ id: 'v', name: '차트', type: 'chart' } as EfView, cols)).toMatchObject({ kind: 'bar', x: 'dept', agg: 'sum', of: MM })
    expect(ncOf(v, cols).x).toBe('name')
  })
  it('X = 선택 열 — 옵션 차례(B, A), 개수·합계', () => {
    expect(ncData(base({ x: 'dept', agg: 'count' }), rows, cols)).toMatchObject({ labels: ['B', 'A'], series: [{ data: [1, 2] }] })
    expect(ncData(base({ x: 'dept', agg: 'sum', of: MM }), rows, cols).series[0]!.data).toEqual([0.5, 2.5])
    expect(ncData(base({ x: 'dept', agg: 'avg', of: 'm01' }), rows, cols).series[0]!.data).toEqual([0.5, 1])
  })
  it('다중 선택은 값마다, 빈 칸은 (빈값) 맨 뒤', () => {
    expect(ncData(base({ x: 'tag', agg: 'count' }), rows, cols)).toMatchObject({ labels: ['x', 'y', '(빈값)'], series: [{ data: [2, 1, 1] }] })
  })
  it('X = 월 — 그 달 값의 합, 개수는 공수가 있는 행', () => {
    expect(ncData(base({ x: MONTH, agg: 'sum' }), rows, cols)).toMatchObject({ labels: ['01월', '02월'], series: [{ data: [1.5, 1.5] }] })
    expect(ncData(base({ x: MONTH, agg: 'count' }), rows, cols).series[0]!.data).toEqual([2, 2])
  })
  it('그룹 — 계열이 그룹 값마다(그룹 열 옵션 차례)', () => {
    const r = ncData(base({ x: MONTH, agg: 'sum', group: 'dept' }), rows, cols)
    expect(r.series).toEqual([
      { name: 'B', data: [0.5, 0] },
      { name: 'A', data: [1, 1.5] },
    ])
  })
  it('날짜 X — 월 묶음, 정렬·0 숨기기·누적', () => {
    expect(ncData(base({ x: 'd', unit: 'month', agg: 'count' }), rows, cols).labels).toEqual(['2026-01', '2026-02'])
    expect(ncData(base({ x: 'dept', agg: 'sum', of: MM, sort: 'desc' }), rows, cols).labels).toEqual(['A', 'B'])
    expect(ncData(base({ x: 'dept', agg: 'sum', of: 'm02', omitZero: true }), rows, cols).labels).toEqual(['A'])
    expect(ncData(base({ kind: 'line', x: MONTH, agg: 'sum', cumulative: true }), rows, cols).series[0]!.data).toEqual([1.5, 3])
  })
})

describe('노션식 X축 — 값 생략 · X축 역순', () => {
  const cols: EfColumn[] = [{ id: 's', title: '상태', type: 'select', options: ['A', 'B', 'C'] }]
  const rows = [{ s: 'A' }, { s: 'B' }, { s: 'B' }, { s: 'C' }]
  const base = { kind: 'bar', x: 's', unit: 'month', agg: 'count', of: '', group: '', stack: 'side', sort: 'x', omitZero: false, omit: [], yMin: null, yMax: null, ref: null, refLabel: '', height: 'M', color: 'auto', grid: true, axisNames: false, labels: false, legend: true, smooth: true, fill: false, cumulative: false } as NcSpec
  it('고른 값은 빠지고, 고르기 목록(allLabels)에는 남는다', () => {
    const d = ncData({ ...base, omit: ['B'] }, rows, cols)
    expect(d.labels).toEqual(['A', 'C'])
    expect(d.allLabels).toEqual(['A', 'B', 'C'])
  })
  it('X축 역순', () => {
    expect(ncData({ ...base, sort: 'xdesc' }, rows, cols).labels).toEqual(['C', 'B', 'A'])
  })
})
