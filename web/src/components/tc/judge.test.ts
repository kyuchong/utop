/**
 * 판정기 정답표.
 *
 * 합격·불합격을 정하는 코드는 이 파일 옆의 judge.ts 하나다 — 화면도, runner
 * 컨테이너도 이것을 쓴다. 그런데 여태 이 코드에는 검사지가 없었다. 규칙을 한
 * 줄 고치면 지난달 합격이던 시험이 오늘 불합격으로 바뀌어도 아무도 모른다.
 *
 * 두 종류를 둔다.
 *   1. 명세 — docs/conventions.md 의 판정 문법을 사례로 적은 것. 옛 파이썬
 *      테스트(tests/test_judgement.py)의 사례를 옮겨 왔다.
 *   2. 실제 기록 — 213 의 사이클 실행 기록에서 뽑은 응답과 그때의 판정
 *      (__fixtures__/judge-cases.json). 규칙을 고쳐도 이 판정들은 그대로여야
 *      한다. 바뀌어야 한다면 그 사례를 **눈으로 보고** 정답표를 고친다.
 *      IP·MAC 은 가짜 값으로 바꿨다.
 *
 * 도커 빌드(web/Dockerfile)가 이 검사를 먼저 돌린다 — 깨지면 이미지가 안 나온다.
 */
import { describe, expect, it } from 'vitest'
import { applyExclude, applyQuery, applySkips, evalDiff, judge, judgeTable, looksLikeError, SKIP_TIME } from './judge'
import type { TcStep } from './types'
import cases from './__fixtures__/judge-cases.json'

const step = (s: Record<string, unknown>): TcStep => s as unknown as TcStep

describe('contains — 출력에 있으면 합격', () => {
  it('한 토큰이 있으면 Pass', () => {
    expect(judge(step({ type: 'contains', criteria: '1.0.0' }), 'Version 1.0.0 running').verdict).toBe('Pass')
  })
  it('없으면 Fail 이고 무엇을 찾았는지 적는다', () => {
    const r = judge(step({ type: 'contains', criteria: '9.9.9' }), 'Version 1.0.1')
    expect(r.verdict).toBe('Fail')
    expect(r.reason).toContain('9.9.9')
  })
  it('콤마는 OR — 하나만 있어도 Pass', () => {
    expect(judge(step({ type: 'contains', criteria: 'vlan 1,vlan 4096' }), 'vlan 1 only').verdict).toBe('Pass')
  })
  it('콤마 토큰이 전부 없으면 Fail', () => {
    expect(judge(step({ type: 'contains', criteria: '1.0.0,1.0.1' }), 'Version 9.9.9').verdict).toBe('Fail')
  })
  it('대소문자를 가리지 않는다', () => {
    expect(judge(step({ type: 'contains', criteria: 'UP' }), 'interface eth0 up').verdict).toBe('Pass')
  })
  it('기준이 비면 판정하지 않는다(빈 문자열)', () => {
    expect(judge(step({ type: 'contains', criteria: '' }), 'anything').verdict).toBe('')
  })
  it('expected 만 있어도 기준으로 쓴다(옛 자료)', () => {
    expect(judge(step({ type: 'contains', expected: 'ok' }), 'status ok').verdict).toBe('Pass')
  })
  it('한글 기준·출력', () => {
    expect(judge(step({ type: 'contains', criteria: '정상' }), '상태: 정상 동작 중').verdict).toBe('Pass')
  })
  it('근거에 걸린 줄을 적는다', () => {
    const r = judge(step({ type: 'contains', criteria: 'connected' }), 'Gi0/1  connected  210\nGi0/2  notconnect')
    expect(r.reason).toContain('Gi0/1')
  })
})

describe('contains_all — 모두 있어야 합격', () => {
  it('콤마·줄바꿈 모두 토큰 구분자', () => {
    const out = 'vlan 1\nvlan 4096\n'
    expect(judge(step({ type: 'contains_all', criteria: 'vlan 1,vlan 4096' }), out).verdict).toBe('Pass')
    expect(judge(step({ type: 'contains_all', criteria: 'vlan 1\nvlan 4096' }), out).verdict).toBe('Pass')
  })
  it('하나라도 빠지면 Fail 이고 빠진 것을 전부 적는다', () => {
    const r = judge(step({ type: 'contains_all', criteria: 'a,b,c' }), 'only a here')
    expect(r.verdict).toBe('Fail')
    expect(r.reason).toContain('"b"')
    expect(r.reason).toContain('"c"')
  })
})

describe('notcontains — 있으면 불합격', () => {
  it('금지 문구가 없으면 Pass', () => {
    expect(judge(step({ type: 'notcontains', criteria: 'error,timeout' }), 'all good').verdict).toBe('Pass')
  })
  it('하나라도 있으면 Fail', () => {
    expect(judge(step({ type: 'notcontains', criteria: 'error,timeout' }), 'read timeout').verdict).toBe('Fail')
  })
})

describe('ok — 오류만 없으면 합격', () => {
  it('응답이 있으면 Pass', () => {
    expect(judge(step({ type: 'ok' }), 'cpu 12%').verdict).toBe('Pass')
  })
  it('응답이 비면 Fail', () => {
    expect(judge(step({ type: 'ok' }), '   ').verdict).toBe('Fail')
  })
})

describe('오류 패턴 — 기준보다 먼저 본다', () => {
  it.each(['% Invalid input detected', 'Unknown command', 'command not found', 'Syntax error', 'Permission denied', 'Authentication failed', '[오류] 세션이 없습니다'])(
    '"%s" 가 있으면 무조건 Fail',
    (out) => {
      expect(looksLikeError(out)).not.toBe('')
      expect(judge(step({ type: 'contains', criteria: 'x' }), `x ${out}`).verdict).toBe('Fail')
    },
  )
  it('정상 출력은 오류가 아니다', () => {
    expect(looksLikeError('interface up, 0 errors')).toBe('')
  })
})

describe('line — 항목(키 : 값) 일치', () => {
  const out = 'Model : E6100\nVersion : 2.1.3\nUptime : 3 days'
  it('키와 값이 맞으면 Pass', () => {
    expect(judge(step({ type: 'line', criteria: 'Version:2.1.3' }), out).verdict).toBe('Pass')
  })
  it('키는 있는데 값이 다르면 Fail', () => {
    expect(judge(step({ type: 'line', criteria: 'Version:9.9' }), out).verdict).toBe('Fail')
  })
  it('키가 없으면 Fail', () => {
    expect(judge(step({ type: 'line', criteria: 'Serial:1' }), out).verdict).toBe('Fail')
  })
})

describe('칩(rules) — 있으면 옛 기준보다 우선', () => {
  const out = 'Gi0/1 connected\nGi0/2 notconnect\nMon Sep 28 2026 10:00:00 KST'
  it('has 와 not 을 모두 만족해야 Pass', () => {
    expect(judge(step({ rules: [{ t: 'has', v: 'connected' }, { t: 'not', v: 'down' }] }), out).verdict).toBe('Pass')
    expect(judge(step({ rules: [{ t: 'has', v: 'connected' }, { t: 'not', v: 'notconnect' }] }), out).verdict).toBe('Fail')
  })
  it('ruleJoin=or 면 하나만 맞아도 Pass', () => {
    expect(judge(step({ ruleJoin: 'or', rules: [{ t: 'has', v: '없는말' }, { t: 'has', v: 'connected' }] }), out).verdict).toBe('Pass')
  })
  it('칩이 빈 배열이면 옛 criteria 를 되살리지 않는다', () => {
    expect(judge(step({ rules: [], criteria: 'connected' }), out).verdict).toBe('')
  })
  it('hasline — 줄 단위, 앞뒤가 글자·숫자면 다른 값', () => {
    expect(judge(step({ rules: [{ t: 'hasline', v: 'Gi0/1' }] }), 'Gi0/1 up\nGi0/10 up').reason).toContain('1개 줄')
    expect(judge(step({ rules: [{ t: 'hasline', v: '100', op: '==', rhs: '2' }] }), '100\n1001\n100').verdict).toBe('Pass')
  })
  it('rowcount — 응답 줄 수', () => {
    expect(judge(step({ rules: [{ t: 'rowcount', v: '3', op: '==' }] }), out).verdict).toBe('Pass')
    expect(judge(step({ rules: [{ t: 'rowcount', v: '10', op: '>=' }] }), out).verdict).toBe('Fail')
  })
  it('⏱시각줄 칩은 시각 줄을 빼고 본다', () => {
    const s = step({ rules: [{ t: 'skip', v: SKIP_TIME }, { t: 'not', v: 'Sep' }] })
    expect(applySkips(out, s)).not.toContain('Mon Sep')
    expect(judge(s, out).verdict).toBe('Pass')
  })
  it('글자 줄제외 칩은 그 문구가 든 줄을 뺀다', () => {
    const s = step({ rules: [{ t: 'skip', v: 'notconnect' }, { t: 'not', v: 'notconnect' }] })
    expect(judge(s, out).verdict).toBe('Pass')
  })
})

describe('판정 영역·줄제외 도구', () => {
  it('applyQuery — 정규식으로 자른 영역에서만 본다(없으면 원본 폴백)', () => {
    expect(applyQuery('a=1\nb=2\nc=3', '/b=.*/m')).toBe('b=2')
  })
  it('applyExclude — 문구가 든 줄을 뺀다', () => {
    expect(applyExclude('keep\ndrop me\nkeep2', 'drop')).toBe('keep\nkeep2')
  })
})

describe('table — 표에서 행·열로 판정', () => {
  const tbl = ['Port    Status      Vlan', '------  ----------  ----', 'Gi0/1   connected   210', 'Gi0/2   notconnect  1', 'Gi0/3   connected   210'].join('\n')
  it('고른 행이 전부 조건에 맞으면 Pass', () => {
    expect(judgeTable(tbl, 'Port=Gi0/1,Gi0/3 => Status=connected').verdict).toBe('Pass')
  })
  it('한 행이라도 어긋나면 Fail', () => {
    expect(judgeTable(tbl, 'Port=Gi0/1,Gi0/2 => Status=connected').verdict).toBe('Fail')
  })
  it('표가 아니면 Fail 로 말해 준다', () => {
    expect(judgeTable('그냥 문장 하나', 'Port=Gi0/1 => Status=connected').verdict).toBe('Fail')
  })
})

describe(`실제 실행 기록 ${cases.length}건 — 판정이 그때와 같아야 한다`, () => {
  it.each(cases.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    const r = judge(c.step as unknown as TcStep, c.output)
    expect(r.verdict, `${c.cli}\n기준: ${JSON.stringify(c.step)}\n근거: ${r.reason}`).toBe(c.expect)
  })
})

describe('Diff — 조건 여럿을 그리고·또는으로 묶는다', () => {
  const vars = { model: 'E6100', snmp: 'E6100', mem: '1024' }
  const two = (join: 'and' | 'or') =>
    step({
      kind: 'diff',
      condJoin: join,
      conds: [
        { l: '${model}', op: '==', r: '${snmp}' },
        { l: '${mem}', op: '>=', r: '2048' },
      ],
    })
  it('모두 맞아야(and) — 하나가 어긋나면 Fail 이고 어느 조건인지 남는다', () => {
    const r = evalDiff(two('and'), vars)
    expect(r.ok).toBe(false)
    expect(r.results.map((x) => x.ok)).toEqual([true, false])
    expect(r.results[1]!.why).toContain("'1024' >= '2048'")
  })
  it('하나라도 맞으면(or) — 같은 조건이 Pass', () => {
    expect(evalDiff(two('or'), vars).ok).toBe(true)
  })
  it('and 에서 둘 다 맞으면 Pass', () => {
    expect(evalDiff(two('and'), { ...vars, mem: '4096' }).ok).toBe(true)
  })
  it('옛 칸(cmpLeft·cmpOp·cmpRight)만 있는 스텝은 조건 하나로 여태처럼 판정한다', () => {
    const r = evalDiff(step({ kind: 'diff', cmpLeft: '${model}', cmpOp: '==', cmpRight: 'E6100' }), vars)
    expect(r.ok).toBe(true)
    expect(r.results).toHaveLength(1)
    expect(r.results[0]!.left).toBe('E6100')
  })
  it('conds 가 있으면 옛 칸은 무시한다(정본은 목록)', () => {
    const r = evalDiff(
      step({ kind: 'diff', cmpLeft: '${model}', cmpOp: '!=', cmpRight: 'E6100', conds: [{ l: '${model}', op: '==', r: 'E6100' }] }),
      vars,
    )
    expect(r.ok).toBe(true)
  })
  it('여러 줄 값은 줄 단위로 견주고 제외 줄을 뺀다 — 다른 조건과도 묶인다', () => {
    const a = 'hostname A\nuptime 10\nvlan 1'
    const b = 'hostname A\nuptime 99\nvlan 1'
    const r = evalDiff(
      step({
        kind: 'diff',
        excludeLines: 'uptime',
        conds: [
          { l: '${a}', op: '==', r: '${b}' },
          { l: '${mem}', op: '<', r: '2048' },
        ],
      }),
      { ...vars, a, b },
    )
    expect(r.ok).toBe(true)
    expect(r.results[0]!.body).toBeDefined()
  })
  it('조건이 하나도 없으면 참(옛 동작)', () => {
    expect(evalDiff(step({ kind: 'diff' }), vars).ok).toBe(true)
  })
})
