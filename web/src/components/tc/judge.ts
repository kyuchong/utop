import type { TcStep } from './types'

/**
 * 판정.
 *
 * 옛 화면(frontend/static/js/reports/07-report.js 의 `_judgeCheck`)이 쓰던
 * 규칙을 그대로 옮겼다. 판정 종류는 스텝의 **`type`** 에 들어 있다 —
 * `critMode` 가 아니다. critMode 는 '라인 선택' 같은 표시용 이름이라
 * 거기에 contains 를 써 넣으면 옛 화면의 배지가 깨진다.
 *
 * 결과 값도 옛 이름 그대로 'Pass' / 'Fail' / ''(판정 안 함) 이다.
 */
export type Verdict = 'Pass' | 'Fail' | ''

/** 판정 종류. 옛 화면 메뉴와 같은 넷만 새로 쓴다 — 나머지는 읽기만 한다. */
export const JUDGE_TYPES: Array<[string, string]> = [
  ['contains', '출력에 있으면 합격'],
  ['contains_all', '모두 있으면 합격'],
  ['notcontains', '있으면 불합격'],
  ['line', '항목(키 : 값) 일치'],
  ['none', '판정 안 함 (조회만)'],
]

/** 변수 넣기. `${name}` 과 `$name` 을 둘 다 받는다 — 자료에 둘 다 있다. */
export function subVars(text: string, vars: Record<string, string>): string {
  return String(text ?? '')
    .replace(/\$\{(\w+)\}/g, (m, k: string) => vars[k] ?? m)
    .replace(/\$(\w+)/g, (m, k: string) => vars[k] ?? m)
}

/** `/식/플래그` 형태면 알맹이를 꺼낸다. 옛 자료의 queries 가 이 모양이다. */
function toRegExp(rule: string, extraFlags = ''): RegExp | null {
  const s = String(rule ?? '').trim()
  if (!s) return null
  const m = /^\/(.*)\/([gimsuy]*)$/.exec(s)
  try {
    if (m) {
      const flags = new Set([...(m[2] ?? ''), ...extraFlags])
      return new RegExp(m[1] ?? '', [...flags].join(''))
    }
    return new RegExp(s, extraFlags)
  } catch {
    // 자료에 든 식이 깨져 있을 수 있다. 화면이 죽는 것보다 판정을 건너뛰는 편이 낫다.
    return null
  }
}

/**
 * 응답에서 판정할 영역만 고른다 (Query).
 *
 *  · `/식/`      → 매칭 부분 (캡처그룹 1 이 있으면 그것)
 *  · `시작..끝`  → 두 마커 줄 사이
 *  · 그 외       → 그 문구가 든 줄만
 */
export function applyQuery(text: string, query?: string): string {
  const q = String(query ?? '').trim()
  const src = String(text ?? '')
  if (!q) return src

  const rm = /^\/(.*)\/([gimsuy]*)$/.exec(q)
  if (rm) {
    const re = toRegExp(q, 'g')
    if (!re) return src
    const out: string[] = []
    let m: RegExpExecArray | null
    let guard = 0
    while ((m = re.exec(src)) && guard++ < 100000) {
      out.push(m[1] ?? m[0])
      if (m.index === re.lastIndex) re.lastIndex++
    }
    return out.join('\n')
  }

  if (q.includes('..')) {
    const at = q.indexOf('..')
    const a = q.slice(0, at).trim()
    const b = q.slice(at + 2).trim()
    const lines = src.split(/\r?\n/)
    let s = -1
    let e = -1
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i] ?? ''
      if (s < 0) {
        if (a && ln.includes(a)) s = i
      } else if (b && ln.includes(b)) {
        e = i
        break
      }
    }
    if (s < 0) return ''
    return lines.slice(s, (e < 0 ? lines.length - 1 : e) + 1).join('\n')
  }

  return src.split(/\r?\n/).filter((l) => l.includes(q)).join('\n')
}

/** 판정에서 빼는 줄. 한 줄에 하나씩, 그 문구가 든 줄을 통째로 뺀다. */
export function applyExclude(text: string, exclude?: string): string {
  const toks = String(exclude ?? '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (toks.length === 0) return text
  return text
    .split(/\r?\n/)
    .filter((l) => !toks.some((t) => l.includes(t)))
    .join('\n')
}

/**
 * 장비가 명령을 못 알아들었을 때.
 *
 * 판정기준이 우연히 맞아 PASS 가 되는 것을 막는다 — 오류 문구가 있으면
 * 기준과 무관하게 FAIL 이다(docs/conventions.md).
 */
const ERROR_PATTERNS = [
  '[오류]',
  '% invalid input',
  'invalid input',
  'unknown command',
  'command not found',
  'syntax error',
  'permission denied',
  'authentication failed',
]

export function looksLikeError(output: string): string {
  const low = String(output ?? '').toLowerCase()
  return ERROR_PATTERNS.find((p) => low.includes(p.toLowerCase())) ?? ''
}

/**
 * 한 스텝을 판정한다.
 *
 * 매칭은 대소문자를 구분하지 않는다 — 장비·펌웨어마다 CLI 출력의 대소문자가
 * 달라서 구분하면 같은 시험이 장비만 바꿔도 깨진다(docs/conventions.md).
 */
export function judge(step: TcStep, output: string, vars: Record<string, string> = {}): {
  verdict: Verdict
  reason: string
} {
  const type = String(step.type ?? 'contains')
  if (type === 'none') return { verdict: '', reason: '판정 안 함' }

  const err = looksLikeError(output)
  if (err) return { verdict: 'Fail', reason: `장비 오류 응답 — "${err}"` }

  const criteria = subVars(String(step.criteria ?? step.expected ?? ''), vars).trim()
  if (!criteria) return { verdict: '', reason: '판정기준 없음' }

  const scoped = applyExclude(applyQuery(output, step.query as string | undefined), step.excludeLines)
  const raw = applyExclude(String(output ?? ''), step.excludeLines)
  // Query 로 잘라낸 쪽에 없으면 원본에서도 본다. 사람이 화면에서 본 그대로
  // 찾히는 것이 직관적이다 (옛 화면과 같은 폴백).
  const has = (tok: string) => {
    const t = tok.toLowerCase()
    return scoped.toLowerCase().includes(t) || raw.toLowerCase().includes(t)
  }

  if (type === 'notcontains') {
    const hit = criteria.split(',').map((s) => s.trim()).filter(Boolean).find(has)
    return hit
      ? { verdict: 'Fail', reason: `있으면 안 되는 "${hit}" 가 출력에 있음` }
      : { verdict: 'Pass', reason: '' }
  }

  if (type === 'contains_all') {
    const toks = criteria.split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean)
    if (toks.length === 0) return { verdict: '', reason: '판정기준 없음' }
    const miss = toks.find((t) => !has(t))
    return miss
      ? { verdict: 'Fail', reason: `"${miss}" 가 출력에 없음` }
      : { verdict: 'Pass', reason: '' }
  }

  if (type === 'line') {
    const at = criteria.indexOf(':')
    const key = (at >= 0 ? criteria.slice(0, at) : criteria).trim()
    const val = (at >= 0 ? criteria.slice(at + 1) : '').trim()
    const find = (t: string) =>
      t.split(/\r?\n/).find((l) => l.toLowerCase().includes(key.toLowerCase()))
    const line = find(scoped) ?? find(raw)
    if (!line) return { verdict: 'Fail', reason: `"${key}" 항목이 출력에 없음` }
    if (val && !line.toLowerCase().includes(val.toLowerCase()))
      return { verdict: 'Fail', reason: `"${key}" 값이 다름 → ${line.trim()}` }
    return { verdict: 'Pass', reason: line.trim() }
  }

  // contains — 한 줄이면 콤마로 나눈 OR (docs/conventions.md)
  const toks = criteria.split(',').map((s) => s.trim()).filter(Boolean)
  const hit = toks.find(has)
  return hit
    ? { verdict: 'Pass', reason: '' }
    : { verdict: 'Fail', reason: `"${criteria}" 가 출력에 없음` }
}

/**
 * 응답에서 변수를 뽑는다.
 *
 * queries 는 SNMP 가 아니라 '응답에서 정규식으로 값을 꺼내 변수에 담는 것'
 * 이다. 134스텝이 `/\d+\s+\[E\d+\]…/m` 같은 식을 갖고 있다.
 * 캡처그룹 1 이 있으면 그것을, 없으면 매칭 전체를 담는다.
 */
export function extractVars(step: TcStep, output: string): Record<string, string> {
  const out: Record<string, string> = {}
  const rules: Array<{ name?: string; rule?: string }> = [
    ...(step.queries ?? []).map((x) => ({ name: x.var, rule: x.q })),
    ...(step.extracts ?? []).map((x) => ({ name: x.var, rule: x.rule })),
  ]
  for (const r of rules) {
    if (!r.name || !r.rule) continue
    const re = toRegExp(r.rule)
    if (!re) continue
    const m = re.exec(output)
    if (m) out[r.name] = (m[1] ?? m[0] ?? '').trim()
  }
  return out
}

/**
 * If 의 조건 · Switch 의 기준값.
 *
 * 자료에 있는 것은 `${a} == 'x'` 정도의 아주 단순한 식뿐이라 파서를 두지
 * 않는다. eval 도 쓰지 않는다 — 저장된 문자열이 그대로 실행되는 길을
 * 만들지 않는다.
 */
export function evalCond(expr: string, vars: Record<string, string>): boolean {
  const s = subVars(expr ?? '', vars).trim()
  if (!s) return true

  const m = /^(.*?)\s*(==|!=|>=|<=|>|<|포함|contains)\s*(.*)$/.exec(s)
  if (!m) {
    // 식이 아니라 값 하나면 '비어 있지 않은가' 로 본다
    return !!s && s.toLowerCase() !== 'false' && s !== '0'
  }
  const strip = (v: string) => v.trim().replace(/^['"]|['"]$/g, '')
  const a = strip(m[1] ?? '')
  const b = strip(m[3] ?? '')
  const op = m[2] ?? '=='
  const na = Number(a)
  const nb = Number(b)
  const numeric = a !== '' && b !== '' && Number.isFinite(na) && Number.isFinite(nb)

  switch (op) {
    case '==':
      return numeric ? na === nb : a.toLowerCase() === b.toLowerCase()
    case '!=':
      return numeric ? na !== nb : a.toLowerCase() !== b.toLowerCase()
    case '>':
      return numeric ? na > nb : a > b
    case '<':
      return numeric ? na < nb : a < b
    case '>=':
      return numeric ? na >= nb : a >= b
    case '<=':
      return numeric ? na <= nb : a <= b
    default:
      return a.toLowerCase().includes(b.toLowerCase())
  }
}
