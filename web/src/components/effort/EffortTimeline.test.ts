import { describe, expect, it } from 'vitest'
import { TL_LAB, TL_W, dateSpanOf, monthSegments, parseRange, tlGroups, tlLabOf, tlWOf } from './EffortTimeline'
import type { EfColumn } from './model'

const months: EfColumn[] = ['01월', '02월', '03월', '04월'].map((t, i) => ({ id: 'm' + i, title: t, type: 'number' }))

describe('타임라인', () => {
  it('월 모드 — 값이 이어진 달끼리 막대 하나(0·빈칸·「-」 은 끊김)', () => {
    expect(monthSegments({ m0: 0.5, m1: '0.2', m2: '-', m3: 1 }, months)).toEqual([
      { a: 0, b: 1, v: [0.5, 0.2] },
      { a: 3, b: 3, v: [1] },
    ])
    expect(monthSegments({ m1: 0 }, months)).toEqual([])
  })
  it('기간 값 — ~ 로 가르고, 날짜 안의 - 는 안 가른다(예전 규칙)', () => {
    expect(parseRange('2026-01-05 ~ 2026-02-10')).toEqual({ s: '2026-01-05', e: '2026-02-10' })
    expect(parseRange('2026-01-05 - 2026-02-10')).toEqual({ s: '2026-01-05', e: '2026-02-10' })
    expect(parseRange('2026-01-05')).toEqual({ s: '2026-01-05', e: '' })
  })
  it('날짜 모드 — 기간 열 우선, 없으면 날짜 열 둘, 하나뿐이면 없음', () => {
    const dr = dateSpanOf([{ id: 'p', title: '기간', type: 'daterange' }])!
    expect(dr({ p: '2026-03-01 ~ 2026-03-20' })).toEqual({ s: new Date(2026, 2, 1), e: new Date(2026, 2, 20) })
    const two = dateSpanOf([
      { id: 's', title: '시작', type: 'date' },
      { id: 'e', title: '완료', type: 'date' },
    ])!
    expect(two({ s: '2026-05-02', e: '' })).toEqual({ s: new Date(2026, 4, 2), e: new Date(2026, 4, 2) })
    expect(dateSpanOf([{ id: 's', title: '시작', type: 'date' }])).toBeNull()
  })
  it('묶기 — 이름 차례, 빈값은 맨 뒤', () => {
    const by: EfColumn = { id: 'n', title: '인원', type: 'text' }
    expect(tlGroups([{ n: '이' }, {}, { n: '김' }, { n: '이' }], by).map((g) => [g.k, g.rs.length])).toEqual([
      ['김', 1],
      ['이', 2],
      ['(빈값)', 1],
    ])
  })
})

describe('타임라인 폭 — 보기에 저장, 범위 밖·잘못된 값은 기본/한계로', () => {
  it('없으면 기본(달 66 · 이름 230), 범위 밖은 한계', () => {
    expect(tlWOf({ id: 'v', name: 'v', type: 'gantt' })).toBe(TL_W)
    expect(tlLabOf({ id: 'v', name: 'v', type: 'gantt' })).toBe(TL_LAB)
    expect(tlWOf({ id: 'v', name: 'v', type: 'gantt', tlW: 5 })).toBe(24)
    expect(tlLabOf({ id: 'v', name: 'v', type: 'gantt', tlLabW: 9999 })).toBe(640)
    expect(tlWOf({ id: 'v', name: 'v', type: 'gantt', tlW: '90' })).toBe(TL_W)
    expect(tlLabOf({ id: 'v', name: 'v', type: 'gantt', tlLabW: 300.4 })).toBe(300)
  })
})
