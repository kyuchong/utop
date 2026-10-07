import { describe, expect, it } from 'vitest'
import { MAIN, newTable, optionsOf, ROW_ID, calcFormula, formulaText, isNumCol, chipStyle, cloneRow, fxKey, recalcFx, rowId, dayDiff, dayLeft, rowSrcOf, srcKey, normDate, normRange, truthy, condMatch, condOps, defaultGroup, ensureViews, missingOptions, normalize, recalcAuto, tableOf, viewState, type EfColumn } from './model'

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
  it('툴바 조건식 필터 — 예전 _rscMatch 와 같은 판정', () => {
    const r = { p: 'U9500H Combo', m: 0.5, d: '검증1팀' }
    expect(condMatch(r, { col: 'p', op: 'contains', v: 'combo' })).toBe(true)
    expect(condMatch(r, { col: 'p', op: 'ncontains', v: 'combo' })).toBe(false)
    expect(condMatch(r, { col: 'd', op: 'eq', v: '검증1팀' })).toBe(true)
    expect(condMatch(r, { col: 'd', op: 'neq', v: '검증1팀' })).toBe(false)
    expect(condMatch(r, { col: 'm', op: 'gte', v: '0.5' })).toBe(true)
    expect(condMatch(r, { col: 'm', op: 'gt', v: '0.5' })).toBe(false)
    expect(condMatch({}, { col: 'm', op: 'empty', v: '' })).toBe(true)
    expect(condMatch(r, { col: 'p', op: 'eq', v: '' })).toBe(true) // 값 없는 조건은 통과
    expect(condMatch(r, { col: 'p', op: 'has', v: 'combo' })).toBe(true) // 앞 판에서 저장한 이름도 읽는다
    expect(condOps().map((o) => o[1])).toEqual(['같음', '다름', '포함', '미포함', '초과', '미만', '이상', '이하', '비어있음', '안비어있음'])
  })
})

describe('유형별 값', () => {
  it('날짜 — 여러 꼴을 YYYY-MM-DD 로, 없는 날은 null', () => {
    expect(normDate('2026-1-5')).toBe('2026-01-05')
    expect(normDate('2026.01.05')).toBe('2026-01-05')
    expect(normDate('2026/1/5')).toBe('2026-01-05')
    expect(normDate('20260105')).toBe('2026-01-05')
    expect(normDate('2026-02-30')).toBeNull()
    expect(normDate('내일')).toBeNull()
  })
  it('기간 — 「시작 ~ 종료」, 거꾸로면 바꾸고 하나면 같은 날', () => {
    expect(normRange('2026.3.1~2026.3.20')).toBe('2026-03-01 ~ 2026-03-20')
    expect(normRange('2026-03-20 ~ 2026-03-01')).toBe('2026-03-01 ~ 2026-03-20')
    expect(normRange('2026-03-01')).toBe('2026-03-01 ~ 2026-03-01')
    expect(normRange('')).toBe('')
    expect(normRange('언제')).toBeNull()
  })
  it('기간 일수 — 양끝 포함, 기간 열이 없거나 비면 null', () => {
    const src = { id: 'p', title: '기간', type: 'daterange' as const }
    expect(dayDiff({ p: '2026-03-01 ~ 2026-03-20' }, src)).toBe(20)
    expect(dayDiff({ p: '2026-03-01 ~ 2026-03-01' }, src)).toBe(1)
    expect(dayDiff({}, src)).toBeNull()
    expect(dayDiff({ p: '2026-03-01 ~ 2026-03-20' }, undefined)).toBeNull()
  })
  it('체크박스 — 켜짐 값', () => {
    expect([true, 'true', '1', 'Y', '✓', '예'].every(truthy)).toBe(true)
    expect([false, '', '0', 'no', null].some(truthy)).toBe(false)
  })
})

describe('칩 색', () => {
  it('늘 옅은 바탕 — 색판 오른쪽 칸일수록 칩도 연하다(밝은 색은 글자만 진하게)', () => {
    expect(chipStyle('#ea580c')).toEqual({ background: '#ea580c22', color: '#ea580c' })
    const light = chipStyle('#fdba74')
    expect(light.background).toBe('#fdba7422')
    expect(light.color).not.toBe('#fdba74')
    expect(chipStyle('#d0d0d0').color).toBe('#374151')
    expect(chipStyle('#ffffff').background).toBe('#f3f4f6')
  })
})

describe('남은 일수 — 오늘부터 종료일까지', () => {
  const src = { id: 'p', title: '기간', type: 'daterange' as const }
  const today = new Date(2026, 9, 7) // 2026-10-07
  it('남음 · 오늘 마감 · 지남 · 시작 전도 종료일 기준', () => {
    expect(dayLeft({ p: '2026-10-01 ~ 2026-10-09' }, src, today)).toBe(2)
    expect(dayLeft({ p: '2026-10-01 ~ 2026-10-07' }, src, today)).toBe(0)
    expect(dayLeft({ p: '2026-09-01 ~ 2026-10-04' }, src, today)).toBe(-3)
    expect(dayLeft({ p: '2026-11-01 ~ 2026-11-10' }, src, today)).toBe(34)
    expect(dayLeft({}, src, today)).toBeNull()
  })
})

describe('남은 일수 — 기준 기간: 열에서 고른 것 > 맨 앞 기간 열', () => {
  const p1 = { id: 'p1', title: '기간', type: 'daterange' as const }
  const p2 = { id: 'p2', title: '기간2', type: 'daterange' as const }
  const dd = { id: 'dd', title: '일수', type: 'datediff' as const }
  const cols = [p1, p2, dd]
  it('지정이 없으면 맨 앞 기간 열, 열 지정(diffSrc)이 먼저, 지운 열이면 맨 앞, 예전 행 지정은 안 본다', () => {
    expect(rowSrcOf({}, cols, dd)).toBe(p1)
    expect(rowSrcOf({}, cols, { ...dd, diffSrc: 'p2' })).toBe(p2)
    expect(rowSrcOf({}, cols, { ...dd, diffSrc: 'gone' })).toBe(p1)
    expect(rowSrcOf({ [srcKey(dd)]: 'p2' }, cols, dd)).toBe(p1)
  })
})

describe('수식 칸 — 고른 칸들로 합계·평균·최소·최대·개수', () => {
  const m1 = { id: 'm1', title: '01월', type: 'number' as const }
  const m2 = { id: 'm2', title: '02월', type: 'number' as const }
  const tot = { id: 'tot', title: '합계', type: 'number' as const, autoSum: true }
  const cols = [m1, m2, tot]
  it('행 이름표로 기억 — 차례가 바뀌어도 그 행, 지운 행·빈 칸은 빼고, 값이 바뀌면 다시', () => {
    const a: Record<string, unknown> = { m1: 1 }
    const b: Record<string, unknown> = { m1: 0.5 }
    const c: Record<string, unknown> = {}
    const refs = [
      { r: rowId(a), c: 'm1' },
      { r: rowId(b), c: 'm1' },
      { r: 'gone', c: 'm1' },
      { r: rowId(a), c: 'm2' }, // 빈 칸
    ]
    c[fxKey(m2)] = { fn: 'sum', refs }
    const rows = [b, c, a]
    recalcFx(rows, cols)
    expect(c.m2).toBe(1.5)
    c[fxKey(m2)] = { fn: 'avg', refs }
    recalcFx(rows, cols)
    expect(c.m2).toBe(0.75)
    c[fxKey(m2)] = { fn: 'count', refs }
    recalcFx(rows, cols)
    expect(c.m2).toBe(2)
    c[fxKey(m2)] = { fn: 'max', refs }
    b.m1 = 3
    recalcFx(rows, cols)
    expect(c.m2).toBe(3)
  })
  it('월 열의 수식 값이 합계 열에 들어가고, 합계를 보는 수식도 다시', () => {
    const a: Record<string, unknown> = { m1: 2 }
    const c: Record<string, unknown> = { m1: 1 }
    c[fxKey(m2)] = { fn: 'sum', refs: [{ r: rowId(a), c: 'm1' }] }
    const d: Record<string, unknown> = {}
    d[fxKey(m1)] = { fn: 'sum', refs: [{ r: rowId(c), c: 'tot' }] }
    recalcAuto([a, c, d], cols)
    expect(c.m2).toBe(2)
    expect(c.tot).toBe(3)
    expect(d.m1).toBe(3)
  })
  it('예전 「계산」 유형 열은 숫자 열 + 합계 수식으로', () => {
    const doc = normalize({
      columns: [m1, { id: 'cc', title: '계산', type: 'calc' }],
      pages: { '2026': { rows: [{ _id: 'ra', m1: 1 }, { _calc_cc: [{ r: 'ra', c: 'm1' }] }] } },
      years: ['2026'],
      curPage: '2026',
    })
    expect(doc.columns[1]!.type).toBe('number')
    const r = doc.pages['2026']!.rows[1]!
    expect(r._calc_cc).toBeUndefined()
    expect(r._fx_cc).toEqual({ fn: 'sum', refs: [{ r: 'ra', c: 'm1' }] })
  })
  it('행 복제는 이름표를 뗀다(같은 이름표가 둘이면 엉뚱한 행을 본다)', () => {
    const a: Record<string, unknown> = { m1: 1 }
    rowId(a)
    const n = cloneRow(a)
    expect(n[ROW_ID]).toBeUndefined()
    expect(n.m1).toBe(1)
  })
})

describe('수식 열 — 행마다 같은 식', () => {
  const m1 = { id: 'm1', title: '01월', type: 'number' as const }
  const m2 = { id: 'm2', title: '02월', type: 'number' as const }
  const m3 = { id: 'm3', title: '03월', type: 'number' as const }
  const tot = { id: 'tot', title: '합계', type: 'number' as const, autoSum: true }
  const q1 = { id: 'q1', title: '1분기', type: 'formula' as const, formula: { fn: 'sum', cols: ['m1', 'm2', 'm3'] } }
  const cols = [m1, m2, m3, tot, q1]
  const r = { m1: 1, m2: 0.5, m3: '', tot: 1.5 }
  it('합계·평균·최소·최대·개수·곱하기(빈 칸은 뺀다)', () => {
    expect(calcFormula(r, { fn: 'sum', cols: ['m1', 'm2', 'm3'] }, cols)).toBe(1.5)
    expect(calcFormula(r, { fn: 'avg', cols: ['m1', 'm2', 'm3'] }, cols)).toBe(0.75)
    expect(calcFormula(r, { fn: 'min', cols: ['m1', 'm2'] }, cols)).toBe(0.5)
    expect(calcFormula(r, { fn: 'max', cols: ['m1', 'm2'] }, cols)).toBe(1)
    expect(calcFormula(r, { fn: 'count', cols: ['m1', 'm2', 'm3'] }, cols)).toBe(2)
    expect(calcFormula(r, { fn: 'mul', cols: ['m1', 'm2'] }, cols)).toBe(0.5)
  })
  it('빼기·나누기는 체크한 차례, 0 으로 나누면 비움, 수식 열·지운 열은 안 본다', () => {
    expect(calcFormula(r, { fn: 'sub', cols: ['tot', 'm1'] }, cols)).toBe(0.5)
    expect(calcFormula(r, { fn: 'div', cols: ['m1', 'm2'] }, cols)).toBe(2)
    expect(calcFormula(r, { fn: 'div', cols: ['m1', 'm3'] }, cols)).toBeNull()
    expect(calcFormula(r, { fn: 'sum', cols: ['q1', 'gone'] }, cols)).toBeNull()
  })
  it('조건 — 맞으면 참 글자, 아니면 거짓 글자 · 조건 수식 열은 숫자 열이 아니다', () => {
    const f = { fn: 'if' as const, cols: [], cond: { col: 'tot', op: '>' as const, v: 1, t: '초과', f: '정상' } }
    expect(calcFormula(r, f, cols)).toBe('초과')
    expect(calcFormula({ tot: 0.5 }, f, cols)).toBe('정상')
    expect(isNumCol({ id: 'x', title: 'x', type: 'formula', formula: f })).toBe(false)
    expect(isNumCol(q1)).toBe(true)
  })
  it('다시 계산하면 칸 값으로 · 식 글자', () => {
    const row: Record<string, unknown> = { m1: 1, m2: 2, m3: 3 }
    recalcAuto([row], cols)
    expect(row.tot).toBe(6)
    expect(row.q1).toBe(6)
    expect(formulaText({ fn: 'sum', cols: ['m1', 'm2', 'm3'] }, cols)).toBe('01월 + 02월 + 03월')
    expect(formulaText({ fn: 'div', cols: ['m1', 'm2'] }, cols)).toBe('01월 ÷ 02월')
  })
})

describe('optionsOf — 고르기 목록', () => {
  it('다중 선택은 칸 값을 쉼표로 나눠 낱개만(「q, w」 가 옵션 하나로 나오지 않게)', () => {
    const c: EfColumn = { id: 'm', title: 'M', type: 'multiselect', options: ['q', 'w', 'e', 'r'] }
    expect(optionsOf([{ m: 'q, w' }, { m: 'e,r' }, { m: 'z, q' }], c)).toEqual(['q', 'w', 'e', 'r', 'z'])
  })
  it('선택은 칸 값 그대로(쉼표가 든 값도 하나)', () => {
    const c: EfColumn = { id: 's', title: 'S', type: 'select', options: ['a'] }
    expect(optionsOf([{ s: 'a' }, { s: 'b, c' }], c)).toEqual(['a', 'b, c'])
  })
})

describe('새 표 — 노션처럼 이름·태그 두 열로 시작', () => {
  it('열을 안 넘기면 이름(글)·태그(다중 선택), 넘기면 그 열(복제 — 열만)', () => {
    expect(newTable().columns.map((c) => [c.title, c.type])).toEqual([['이름', 'text'], ['태그', 'multiselect']])
    expect(newTable([{ id: 'a', title: 'A', type: 'number' }]).columns.map((c) => c.id)).toEqual(['a'])
  })
})
