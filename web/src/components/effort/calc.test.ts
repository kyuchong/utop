import { describe, expect, it } from 'vitest'
import { calc, calcOf, calcsFor, defaultCalc } from './calc'
import type { EfColumn } from './model'

const name: EfColumn = { id: 'name', title: '인원', type: 'text' }
const dept: EfColumn = { id: 'dept', title: '부서', type: 'select' }
const tag: EfColumn = { id: 'tag', title: '태그', type: 'multiselect' }
const m01: EfColumn = { id: 'm01', title: '01월', type: 'number' }
const ck: EfColumn = { id: 'ck', title: '완료', type: 'checkbox' }
const d: EfColumn = { id: 'd', title: '날짜', type: 'date' }
const cols = [name, dept, tag, m01, ck, d]
const rows = [
  { name: '김', dept: 'A', tag: 'x, y', m01: 1, ck: true, d: '2026-01-05' },
  { name: '김', dept: 'B', tag: 'x', m01: 0.5, d: '2026-01-20' },
  { name: '이', m01: '', ck: true },
  { name: '박', dept: 'A', m01: 2 },
]

describe('계산 줄', () => {
  it('안 골랐으면 예전 바닥줄 — 숫자 합계 · 인원 고유값 · 부서 개수 · 나머지 없음, 고른 것이 먼저', () => {
    expect([defaultCalc(m01), defaultCalc(name), defaultCalc(dept), defaultCalc(tag)]).toEqual(['sum', 'unique', 'count', 'none'])
    expect(calcOf(m01, { m01: 'avg' })).toBe('avg')
    expect(calcOf(dept, { dept: 'sum' })).toBe('count') // 글자 열에 숫자 계산은 못 고른다
  })
  it('세기 — 개수 · 값 있음 · 빈 칸 · 고유값(다중 선택은 값마다) · 비율', () => {
    expect(calc('count', dept, rows, cols)).toBe('4')
    expect(calc('filled', dept, rows, cols)).toBe('3')
    expect(calc('empty', dept, rows, cols)).toBe('1')
    expect(calc('unique', name, rows, cols)).toBe('3')
    expect(calc('unique', tag, rows, cols)).toBe('2')
    expect(calc('pctEmpty', dept, rows, cols)).toBe('25%')
  })
  it('숫자 — 합계 · 평균 · 중앙값 · 최소 · 최대 · 범위(빈 칸은 뺀다)', () => {
    expect(calc('sum', m01, rows, cols)).toBe('3.5')
    expect(calc('avg', m01, rows, cols)).toBe('1.17')
    expect(calc('median', m01, rows, cols)).toBe('1')
    expect([calc('min', m01, rows, cols), calc('max', m01, rows, cols), calc('range', m01, rows, cols)]).toEqual(['0.5', '2', '1.5'])
  })
  it('체크 · 날짜', () => {
    expect([calc('checked', ck, rows, cols), calc('unchecked', ck, rows, cols), calc('pctChecked', ck, rows, cols)]).toEqual(['2', '2', '50%'])
    expect([calc('earliest', d, rows, cols), calc('latest', d, rows, cols), calc('dateRange', d, rows, cols)]).toEqual(['2026-01-05', '2026-01-20', '16일'])
    expect(calcsFor(ck).flat()).not.toContain('sum')
  })
})
