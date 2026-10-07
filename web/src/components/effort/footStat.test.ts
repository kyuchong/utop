import { describe, expect, it } from 'vitest'
import { footStat, type EfColumn, type EfRow } from './model'

const col = (p: Partial<EfColumn>): EfColumn => ({ id: 'x', title: 'X', type: 'text', ...p }) as EfColumn
const rows = (vs: unknown[]): EfRow[] => vs.map((v) => (v === undefined ? {} : { x: v }))

describe('footStat — 하단 통계 줄(유형별)', () => {
  it('글 열은 종류(겹치지 않는 값 수), 이름이 「인원」이면 인원', () => {
    const rs = rows(['a', 'b', 'a', undefined])
    expect(footStat(col({}), rs, [])).toMatchObject({ lbl: '종류', val: '2', tip: 'a 2 · b 1' })
    expect(footStat(col({ title: '인원' }), rs, [])).toMatchObject({ lbl: '인원', val: '2' })
    expect(footStat(col({ type: 'person' }), rs, [])).toMatchObject({ lbl: '인원', val: '2' })
  })
  it('선택은 최다 값과 그 수, 다중 선택은 쉼표로 나눠 센다', () => {
    expect(footStat(col({ type: 'select' }), rows(['팀1', '팀2', '팀2']), [])).toMatchObject({ lbl: '최다', val: '팀2 2', short: '팀2' })
    expect(footStat(col({ type: 'multiselect' }), rows(['A, B', 'B']), [])).toMatchObject({ lbl: '최다', val: 'B 2' })
    expect(footStat(col({ type: 'select' }), rows([undefined]), [])).toMatchObject({ val: '—' })
  })
  it('상태는 옵션 맨 끝 단계의 비율, 옵션이 없으면 최다', () => {
    const c = col({ type: 'status', options: ['시작 전', '진행 중', '완료'] })
    expect(footStat(c, rows(['완료', '진행 중', '완료', undefined]), [])).toMatchObject({ lbl: '완료', val: '2/4 (50%)' })
    expect(footStat(col({ type: 'status' }), rows(['진행 중']), [])).toMatchObject({ lbl: '최다', val: '진행 중 1' })
  })
  it('체크박스는 체크 수/전체(비율)', () => {
    expect(footStat(col({ type: 'checkbox' }), rows([true, '', 'Y']), [])).toMatchObject({ lbl: '체크', val: '2/3 (67%)' })
  })
  it('날짜·기간은 가장 이른 날 ~ 가장 늦은 날 — 같은 해면 MM-DD', () => {
    expect(footStat(col({ type: 'date' }), rows(['2026-10-07', '2026-01-05']), [])).toMatchObject({ val: '01-05 ~ 10-07', tip: '2026-01-05 ~ 2026-10-07' })
    expect(footStat(col({ type: 'date' }), rows(['2025-12-30', '2026-01-05']), [])).toMatchObject({ val: '25-12-30 ~ 26-01-05' })
    expect(footStat(col({ type: 'daterange' }), rows(['2026-10-01 ~ 2026-10-28', '2026-09-03 ~ 2026-10-09']), [])).toMatchObject({ val: '09-03 ~ 10-28' })
    expect(footStat(col({ type: 'date' }), rows([undefined]), [])).toMatchObject({ val: '—' })
  })
  it('일수는 가장 임박한 남은 일수', () => {
    const src = col({ id: 'p', type: 'daterange' })
    const c = col({ id: 'd', type: 'datediff' })
    const rs: EfRow[] = [{ p: '2026-10-01 ~ 2026-10-28' }, { p: '2026-10-01 ~ 2026-10-09' }]
    expect(footStat(c, rs, [src, c], new Date(2026, 9, 7))).toMatchObject({ lbl: '최소', val: '2일' })
  })
  it('URL 같은 나머지는 입력됨', () => {
    expect(footStat(col({ type: 'url' }), rows(['a.com', undefined]), [])).toMatchObject({ lbl: '입력됨', val: '1' })
  })
})
