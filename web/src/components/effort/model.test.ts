import { describe, expect, it } from 'vitest'
import { MAIN, defaultGroup, ensureViews, missingOptions, normalize, recalcAuto, tableOf, viewState, type EfColumn } from './model'

describe('Effort Plan 자료', () => {
  it('비어 있으면 올해 페이지와 기본 열을 세운다', () => {
    const d = normalize({})
    const y = String(new Date().getFullYear())
    expect(d.years).toEqual([y])
    expect(d.curPage).toBe(y)
    expect(d.pages[y]!.rows).toEqual([])
    expect(d.columns.find((c) => c.autoSum)?.id).toBe('total')
    expect(defaultGroup(d.columns)).toBe('name')
  })

  it('아주 옛 꼴(맨 위 rows)은 현재 연도 페이지로 옮긴다', () => {
    const d = normalize({ rows: [{ name: '김' }], pages: { '2025': { rows: [] } }, curPage: '2025-03' })
    expect(d.curPage).toBe('2025')
    expect(d.pages['2025']!.rows).toEqual([{ name: '김' }])
    expect('rows' in d).toBe(false)
  })

  it('합계 열은 숫자 열(합계 열 빼고)을 더하고, 값이 없으면 지운다', () => {
    const cols: EfColumn[] = [
      { id: 'name', title: '인원', type: 'text' },
      { id: 'm01', title: '01월', type: 'number' },
      { id: 'm02', title: '02월', type: 'number' },
      { id: 'total', title: '합계', type: 'number', autoSum: true },
    ]
    const rows = [{ m01: 0.5, m02: '1,000' }, { name: '빈', total: 9 }]
    recalcAuto(rows, cols)
    expect(rows[0]!.total).toBe(1000.5)
    expect('total' in rows[1]!).toBe(false)
  })

  it('보기 탭 — 예전 현황 탭을 복사하고 beta 종류는 표로 흡수한다', () => {
    const d = normalize({ views: [{ id: 'a', name: '현황', type: 'beta2', searchQ: 'kt', sorts: [{ col: 'name', dir: -1 }] }] })
    const vs = ensureViews(d)
    expect(vs).toHaveLength(1)
    expect(vs[0]!.type).toBe('table')
    expect(vs[0]!.id).not.toBe('a') // 복사본 — 현황 탭과 따로 논다
    expect(d.curBetaView).toBe(vs[0]!.id)
    expect(viewState(vs[0], d.columns)).toEqual({ q: 'kt', filters: [], sorting: [{ id: 'name', desc: true }], group: null })
  })

  it('표에 쓰였지만 옵션에 없는 값을 찾는다(다중 선택은 값 하나하나)', () => {
    const c: EfColumn = { id: 't', title: '태그', type: 'multiselect', options: ['A'] }
    expect(missingOptions([{ t: 'A, B' }, { t: 'C' }, {}], c)).toEqual(['B', 'C'])
  })
  it('트리 — 없으면 첫 표 「인원 투입」 하나, 맨 위 자료가 그 표다', () => {
    const d = normalize({ pages: { '2025': { rows: [{ name: '김' }] } } })
    expect(d.efTree!.nodes).toEqual([{ id: MAIN, kind: 'table', name: '인원 투입', parent: null }])
    expect(d.efTree!.cur).toBe(MAIN)
    expect(tableOf(d, MAIN).pages['2025']!.rows).toHaveLength(1)
  })

  it('트리 — 자료 없는 표 노드·없는 부모는 정리하고, 노드 없는 표는 맨 위에 붙인다', () => {
    const d = normalize({
      efTree: {
        cur: 'gone',
        nodes: [
          { id: 'f1', kind: 'folder', name: '개발', parent: null },
          { id: 'gone', kind: 'table', name: '사라진 표', parent: 'f1' },
          { id: MAIN, kind: 'table', name: '인원', parent: 'nope' },
        ],
      },
      efTables: { t2: { columns: [{ id: 'a', title: 'A', type: 'text' }] } },
    })
    const ns = d.efTree!.nodes
    expect(ns.map((n) => n.id)).toEqual(['f1', MAIN, 't2'])
    expect(ns.find((n) => n.id === MAIN)!.parent).toBeNull()
    expect(d.efTree!.cur).toBe(MAIN)
    // 다른 표도 연도 페이지·보기를 갖춘다
    const t2 = tableOf(d, 't2')
    expect(t2.columns.map((c) => c.id)).toEqual(['a'])
    expect(t2.pages[t2.curPage!]!.rows).toEqual([])
    expect(t2.betaViews).toHaveLength(1)
  })
})
