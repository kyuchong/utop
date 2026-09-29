import { describe, expect, it } from 'vitest'
import { page2, resultPages, type LguTc } from './lgu'

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
    expect(pg[0]!.split).toBeGreaterThan(20)
    expect(pg[0]!.split).toBeLessThan(pg[0]!.lines.length)
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
    const out = Array.from({ length: 65 }, (_, i) => `l${i}`)
    const pg = resultPages(mk([step('a', out), step('b', ['1', '2', '3'])]))
    for (const p of pg) {
      const lastKind = p.lines[p.lines.length - 1]!.kind
      expect(['head', 'pass', 'fail'].includes(String(lastKind))).toBe(false)
      if (p.twoCol) expect(['head', 'pass', 'fail'].includes(String(p.lines[p.split - 1]!.kind))).toBe(false)
    }
  })
})

describe('높이 셈', () => {
  it('스텝 머리·상자가 많은 장도 한 단 452px 를 넘지 않게 줄 수가 줄어든다', () => {
    // 짧은 스텝 40개 — 줄 수는 적어도 머리·상자 여백이 커서 한 장에 다 못 넣는다
    const steps = Array.from({ length: 40 }, (_, i) => step(`show x${i}`, ['ok']))
    const pg = resultPages(mk(steps))
    expect(pg.length).toBeGreaterThan(1)
    // 한 단에 든 스텝 수(머리 21 + 명령 22.5 + 출력 13 + 닫기 5 + 빈줄 6 ≈ 67px) 는 7개 안팎
    const heads = pg[0]!.lines.slice(0, pg[0]!.split).filter((l) => l.kind === 'pass').length
    expect(heads).toBeLessThanOrEqual(7)
  })
})

describe('page2', () => {
  it('두 단 장은 왼쪽·오른쪽 단으로 나뉘고 오른쪽 단은 「왼쪽 단에서 이어짐」, 이어지는 장은 「앞 장에서 이어짐」', () => {
    const out = Array.from({ length: 150 }, (_, i) => `line ${i}`)
    const pg = resultPages(mk([step('show log', out)]))
    const h0 = page2(mk([]), pg[0]!)
    expect(h0).toContain('display:flex')
    expect(h0).toContain('왼쪽 단에서 이어짐')
    expect(h0).not.toContain('column-count')
    expect(page2(mk([]), pg[1]!)).toContain('앞 장에서 이어짐')
  })
})
