import { describe, expect, it } from 'vitest'
import { MAP_NEW, MAP_SKIP, applyImport, guessMap, guessType } from './EffortImport'
import type { EfColumn, EfRow } from './model'

const base = (): EfColumn[] => [
  { id: 'name', title: '인원', type: 'text' },
  { id: 'dept', title: '부서', type: 'select', options: ['검증1팀'] },
  { id: 'prod', title: '제품명(프로젝트)', type: 'text' },
  { id: 'm01', title: '01월', type: 'number' },
  { id: 'm02', title: '02월', type: 'number' },
  { id: 'total', title: '합계', type: 'number', autoSum: true },
]

describe('Effort Plan 가져오기', () => {
  it('열 맞추기 — 같은 이름 · 1월=01월 · 괄호 뗀 이름 · 합계는 안 들임 · 없으면 새 칸', () => {
    const cols = base()
    expect(guessMap('부서', cols)).toBe('dept')
    expect(guessMap('1월', cols)).toBe('m01')
    expect(guessMap('제품명(프로젝트명)', cols)).toBe('prod')
    expect(guessMap('합계', cols)).toBe(MAP_SKIP)
    expect(guessMap('직급', cols)).toBe(MAP_NEW)
    expect(guessMap('  ', cols)).toBe(MAP_SKIP)
  })
  it('새 칸 유형 — 숫자 · 선택(값 종류가 적고 겹침) · 글자', () => {
    expect(guessType(['0.5', '-', '1,200'])).toBe('number')
    expect(guessType(['책임', '선임', '책임', '책임'])).toBe('select')
    expect(guessType(['a', 'b', 'c'])).toBe('text')
  })
  it('들이기 — 숫자는 수로(「-」 는 빈칸), 선택 옵션 보탬, 합계 다시 계산, 빈 줄은 버림', () => {
    const cols = base()
    const rows: EfRow[] = [{ name: '옛사람' }]
    const head = ['인원', '부서', '직급', '1월', '2월', '합계']
    const body = [
      ['이재익', 'PA1팀', '책임', '0.5', '-', '9'],
      ['김인겸', '검증1팀', '책임', 'x', '0.25', ''],
      ['', '', '', '', '', ''],
    ]
    const map = head.map((h) => guessMap(h, cols))
    const r = applyImport(cols, rows, head, body, map, false)
    expect(r).toEqual({ added: 2, colsAdded: 1, dropped: 1 })
    expect(rows).toHaveLength(3)
    const rank = cols.find((c) => c.title === '직급')!
    expect(rank.type).toBe('select')
    expect(rows[1]).toEqual({ name: '이재익', dept: 'PA1팀', [rank.id]: '책임', m01: 0.5, total: 0.5 })
    expect(rows[2]).toEqual({ name: '김인겸', dept: '검증1팀', [rank.id]: '책임', m02: 0.25, total: 0.25 })
    expect(cols.find((c) => c.id === 'dept')!.options).toEqual(['검증1팀', 'PA1팀'])
  })
  it('지우고 채우기 · 들이지 않음', () => {
    const cols = base()
    const rows: EfRow[] = [{ name: '옛사람' }]
    applyImport(cols, rows, ['인원', '부서'], [['새사람', '검증1팀']], ['name', MAP_SKIP], true)
    expect(rows).toEqual([{ name: '새사람' }])
  })
})
