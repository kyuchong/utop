import { describe, expect, it } from 'vitest'
import { COL_LINES, page2, resultPages, type LguTc } from './lgu'

/**
 * 결과 장 나누기 — 줄 단위(지시: 잘리지 않게, 좁고 긴 출력은 옆 여백에 이어서).
 * 넓은 줄이 있는 장은 한 단이고 넓은 줄 앞에서 끊긴다.
 */
const mk = (steps: Array<Record<string, unknown>>): LguTc =>
  ({ tcid: 'T1', name: '시험', steps, prompt: 'E6100#' }) as unknown as LguTc

const step = (cli: string, lines: string[], verdict = 'Pass') => ({
  cli,
  desc: cli,
  kind: 'cli',
  type: 'contains',
  status: verdict,
  output: lines.join('\n'),
})

describe('resultPages', () => {
  it('짧은 결과는 한 장, 한 단', () => {
    const pg = resultPages(mk([step('show ver', ['a', 'b', 'c'])]))
    expect(pg).toHaveLength(1)
    expect(pg[0]!.twoCol).toBe(false)
    expect(pg[0]!.cont).toBe(false)
  })

  it('좁고 긴 출력은 두 단으로 한 장에 담긴다', () => {
    const out = Array.from({ length: 50 }, (_, i) => `SNMPv2-SMI::mib-2.2.2.1.7.${1000 + i} = 1`)
    const pg = resultPages(mk([step('snmp get', out)]))
    expect(pg).toHaveLength(1)
    expect(pg[0]!.twoCol).toBe(true)
    expect(pg[0]!.lines.length).toBeGreaterThan(COL_LINES)
  })

  it('두 단으로도 넘치면 다음 장에 「이어서」', () => {
    const out = Array.from({ length: 150 }, (_, i) => `line ${i}`)
    const pg = resultPages(mk([step('show log', out)]))
    expect(pg.length).toBeGreaterThan(1)
    expect(pg[0]!.cont).toBe(false)
    expect(pg[1]!.cont).toBe(true)
    // 줄이 하나도 사라지지 않는다
    const total = pg.reduce((n, p) => n + p.lines.filter((l) => l.kind === 'out').length, 0)
    expect(total).toBe(150)
  })

  it('넓은 줄이 있으면 한 단이고 넓은 줄 앞에서 장이 끊긴다', () => {
    const narrow = Array.from({ length: 40 }, (_, i) => `n${i}`)
    const wide = ['x'.repeat(100), 'y'.repeat(100)]
    const pg = resultPages(mk([step('show a', narrow), step('show interface', wide)]))
    expect(pg[0]!.twoCol).toBe(true)
    expect(pg[0]!.lines.some((l) => l.text.length > 58)).toBe(false)
    const last = pg[pg.length - 1]!
    expect(last.twoCol).toBe(false)
    expect(last.lines.some((l) => l.text.length > 58)).toBe(true)
  })

  it('스텝 제목만 장 끝에 홀로 남지 않는다', () => {
    const out = Array.from({ length: COL_LINES * 2 - 3 }, (_, i) => `l${i}`)
    const pg = resultPages(mk([step('a', out), step('b', ['1', '2', '3'])]))
    for (const p of pg) {
      const lastKind = p.lines[p.lines.length - 1]!.kind
      expect(['head', 'pass', 'fail'].includes(String(lastKind))).toBe(false)
    }
  })
})

describe('page2', () => {
  it('두 단 장은 column-count 로, 이어지는 장은 「이어짐」 표시', () => {
    const out = Array.from({ length: 150 }, (_, i) => `line ${i}`)
    const pg = resultPages(mk([step('show log', out)]))
    expect(page2(mk([]), pg[0]!)).toContain('column-count:2')
    expect(page2(mk([]), pg[1]!)).toContain('앞 장에서 이어짐')
  })
})
