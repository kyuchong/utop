import { describe, expect, it } from 'vitest'
import { placeRow } from './EffortViews'

describe('보드 카드 놓기 — 행 자체를 옮긴다', () => {
  const mk = () => {
    const a = { n: 'a', g: 'X' }, b = { n: 'b', g: 'Y' }, c = { n: 'c', g: 'X' }, d = { n: 'd', g: 'X' }
    return { a, b, c, d, rows: [a, b, c, d] as Array<Record<string, unknown>> }
  }
  const names = (rows: Array<Record<string, unknown>>) => rows.map((r) => r.n).join('')
  it('같은 칸 — 맨 앞으로 · 맨 뒤로 · 제자리', () => {
    let t = mk()
    placeRow(t.rows, t.d, [t.a, t.c, t.d], 0)
    expect(names(t.rows)).toBe('dabc')
    t = mk()
    placeRow(t.rows, t.a, [t.a, t.c, t.d], 3)
    expect(names(t.rows)).toBe('bcda')
    t = mk()
    placeRow(t.rows, t.c, [t.a, t.c, t.d], 1)
    expect(names(t.rows)).toBe('abcd')
  })
  it('다른 칸 — 그 칸의 카드 사이로, 빈 칸이면 제자리', () => {
    let t = mk()
    placeRow(t.rows, t.b, [t.a, t.c, t.d], 2) // c 와 d 사이
    expect(names(t.rows)).toBe('acbd')
    t = mk()
    placeRow(t.rows, t.a, [], 0)
    expect(names(t.rows)).toBe('abcd')
  })
})
