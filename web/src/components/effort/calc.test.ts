import { describe, expect, it } from 'vitest'
import { calc, calcMenuFor, calcOf } from './calc'
import type { EfColumn, EfRow } from './model'

const col = (p: Partial<EfColumn>): EfColumn => ({ id: 'x', title: 'X', type: 'text', ...p }) as EfColumn
const rows = (vs: unknown[]): EfRow[] => vs.map((v) => (v === undefined ? {} : { x: v }))

describe('바닥줄 계산 고르기 — 노션 Calculate', () => {
  it('메뉴 — 자동·계산 안함 · 수 › · 비율 › · 숫자/날짜는 더 많은 옵션 ›', () => {
    expect(calcMenuFor(col({})).map((g) => g.sub ?? '-')).toEqual(['-', '수', '비율(%)'])
    expect(calcMenuFor(col({ type: 'number' })).map((g) => g.sub ?? '-')).toEqual(['-', '수', '비율(%)', '더 많은 옵션'])
    expect(calcMenuFor(col({ type: 'date' })).at(-1)!.keys).toEqual(['earliest', 'latest', 'dateRange'])
    expect(calcMenuFor(col({ type: 'checkbox' }))[1]!.keys).toEqual(['count', 'checked', 'unchecked'])
  })
  it('안 골랐거나 그 열에 없는 계산이면 기본 — 숫자 열은 자동(합계), 나머지는 계산 안함', () => {
    expect(calcOf(col({}), undefined)).toBe('none')
    expect(calcOf(col({}), { x: 'sum' })).toBe('none')
    expect(calcOf(col({ type: 'number' }), undefined)).toBe('auto')
    expect(calcOf(col({ type: 'number' }), { x: 'sum' })).toBe('sum')
    expect(calcOf(col({ type: 'select' }), { x: 'auto' })).toBe('auto')
  })
  it('수 — 모두·값·중복 제외·빈 값·비어 있지 않은 값 (다중 선택은 값마다)', () => {
    const rs = rows(['a', 'b', 'a', undefined])
    expect(calc('count', col({}), rs, [])).toMatchObject({ val: '4' })
    expect(calc('unique', col({}), rs, [])).toMatchObject({ lbl: '고유', val: '2' })
    expect(calc('empty', col({}), rs, [])).toMatchObject({ val: '1' })
    expect(calc('filled', col({}), rs, [])).toMatchObject({ val: '3' })
    expect(calc('values', col({ type: 'multiselect' }), rows(['A, B', 'B', undefined]), [])).toMatchObject({ val: '3' })
    expect(calc('unique', col({ type: 'multiselect' }), rows(['A, B', 'B']), [])).toMatchObject({ val: '2' })
  })
  it('비율 · 체크', () => {
    expect(calc('pctEmpty', col({}), rows(['a', undefined, undefined, 'b']), [])).toMatchObject({ val: '50%' })
    expect(calc('pctChecked', col({ type: 'checkbox' }), rows([true, '', true]), [])).toMatchObject({ lbl: '체크', val: '67%' })
    expect(calc('unchecked', col({ type: 'checkbox' }), rows([true, '', true]), [])).toMatchObject({ val: '1' })
  })
  it('숫자 — 합계·평균·중앙값·최소·최대·범위, 자동은 합계(0 도)', () => {
    const c = col({ type: 'number' })
    const rs = rows([1, 4, 2, undefined])
    expect(calc('sum', c, rs, [])).toMatchObject({ val: '7' })
    expect(calc('avg', c, rs, [])).toMatchObject({ val: '2.33' })
    expect(calc('median', c, rs, [])).toMatchObject({ val: '2' })
    expect(calc('range', c, rs, [])).toMatchObject({ val: '3' })
    expect(calc('auto', c, rows([undefined]), [])).toMatchObject({ lbl: '합계', val: '0' })
  })
  it('날짜 — 가장 이른·늦은·날짜 범위(일수), 계산 안함은 비움', () => {
    const c = col({ type: 'daterange' })
    const rs = rows(['2026-10-01 ~ 2026-10-28', '2026-09-03 ~ 2026-10-09'])
    expect(calc('earliest', c, rs, [])).toMatchObject({ val: '2026-09-03' })
    expect(calc('latest', c, rs, [])).toMatchObject({ val: '2026-10-28' })
    expect(calc('dateRange', c, rs, [])).toMatchObject({ val: '56일' })
    expect(calc('none', c, rs, [])).toBeNull()
  })
})
