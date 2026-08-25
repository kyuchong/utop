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

/**
 * 판정 종류.
 *
 * 여기는 **응답을 보는 판정**만 내놓는다. 값끼리 견주는 것은 별개 줄
 * (Diff 스텝)에서 한다 — 명령을 보낸 줄의 Expected 칸에서 변수끼리
 * 견주는 것은 자리가 어색하고, 실제로 잘 안 쓰게 된다.
 *
 * `expr` 은 옛 자료에 있어서 판정 로직은 남기되 목록에는 안 내놓는다.
 */
export const JUDGE_TYPES: Array<[string, string]> = [
  ['contains', '출력에 있으면 합격'],
  ['contains_all', '모두 있으면 합격'],
  ['notcontains', '있으면 불합격'],
  ['ok', '오류만 없으면 합격'],
  ['line', '항목(키 : 값) 일치'],
  ['table', '표에서 행·열로 판정'],
  ['none', '판정 안 함 (조회만)'],
]

/** 변수 넣기. `${name}` 과 `$name` 을 둘 다 받는다 — 자료에 둘 다 있다. */
export function subVars(text: string, vars: Record<string, string>): string {
  // 중첩 치환 — ${${var1}_OID} 처럼 변수로 변수 이름을 만들 수 있다.
  // 안쪽이 먼저 풀리고(${var1}→E6100), 다음 바퀴에 ${E6100_OID} 가 풀린다.
  // 파라미터를 대응표(E6100_OID=7800.1.103)로 쓰는 교차 검증용(합의).
  // 바뀌지 않으면 멈춘다 — 최대 5바퀴(순환 보호).
  let s = String(text ?? '')
  for (let i = 0; i < 5; i++) {
    const next = s
      /*
       * `${i+100}` 처럼 **더하고 빼는 것**까지 받는다(지시: iTest 의
       * `set t [expr $i + 100]`). 반복 번호와 SNMP 인덱스가 어긋나 있는
       * 자료가 흔하다 — 그때마다 반복을 두 벌로 쪼개게 할 수는 없다.
       * 숫자가 아니면 그냥 둔다.
       */
      .replace(/\$\{(\w+)\s*([+\-*])\s*(\d+)\}/g, (m, k: string, op: string, n: string) => {
        const base = Number(vars[k])
        if (!Number.isFinite(base)) return m
        const v = Number(n)
        return String(op === '+' ? base + v : op === '-' ? base - v : base * v)
      })
      .replace(/\$\{(\w+)\}/g, (m, k: string) => vars[k] ?? m)
      .replace(/\$(\w+)/g, (m, k: string) => vars[k] ?? m)
    if (next === s) break
    s = next
  }
  return s
}

/**
 * 치환 스텝의 대응표 적용 (iTest 방식).
 *
 * CLI 는 E6100 이라 하고 SNMP 는 enterprises.7800.1.103 이라 한다 — 같은
 * 것을 다르게 말하는 두 결과는 그대로는 못 견준다. 대응표로 표기를
 * 한쪽으로 바꿔 변수에 담고, 견주는 것은 다음 Diff 스텝이 한다.
 *
 * 규칙은 한 줄에 하나 — `왼쪽 = 오른쪽` (또는 `왼쪽 => 오른쪽`).
 * 값 안에 왼쪽 글자가 있으면 전부 오른쪽으로 바뀐다. 위에서부터 차례로.
 */
export function applyMapRules(src: string, rules: string): { out: string; hits: string[] } {
  let out = String(src ?? '')
  const hits: string[] = []
  for (const ln of String(rules ?? '').split(/\r?\n/)) {
    const s = ln.trim()
    if (!s || s.startsWith('#')) continue
    const arrow = s.indexOf('=>')
    const at = arrow >= 0 ? arrow : s.indexOf('=')
    if (at <= 0) continue
    const pat = s.slice(0, at).trim()
    const val = s.slice(at + (arrow >= 0 ? 2 : 1)).trim()
    if (!pat) continue
    if (out.includes(pat)) {
      out = out.split(pat).join(val)
      hits.push(`${pat} → ${val}`)
    }
  }
  return { out, hits }
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
/* ────────────────────────── 표 판정 ──────────────────────────
 *
 * `show int status` 처럼 줄이 수십 개인 표는 contains 로는 못 본다.
 * "Gi0/1 이 connected 인가" 를 contains 로 쓰면 아무 줄의 connected 나
 * 걸리고, 28포트 중 하나만 죽어도 합격이 나온다.
 *
 * 옛 화면(_judgeTable)이 쓰던 규칙을 그대로 옮겼다:
 *
 *     Port=Gi0/1,Gi0/2 => Status=connected Vlan=210
 *     └─ 볼 행 고르기 ─┘    └── 그 행들이 이래야 한다 ──┘
 *
 * 다만 이 문법을 손으로 치라고 하면 아무도 안 쓴다. 화면에서는 표를
 * 그려 놓고 눌러서 만들게 하고, 이 글자는 그 결과로만 남는다.
 */

export interface Tbl {
  /** 열 이름. 이름이 빈 열도 자리를 지키느라 그대로 둔다 */
  cols: string[]
  /** 자료 행 */
  rows: string[][]
}

/**
 * 고정폭 표 읽기.
 *
 * `-----  ------  ---` 구분선의 대시 덩어리로 열 자리를 잡는다. 공백으로
 * 쪼개면 안 된다 — 이름 칸이 빈 줄(Gi0/4)에서 열이 통째로 밀린다.
 */
/**
 * 구분선이 없는 표 — 머리줄의 글자 자리로 열을 잡는다.
 *
 * `show ip interface brief` 처럼 `---` 없이 칸만 맞춰 찍는 장비가 많다.
 * 구분선만 찾다가 못 찾으면 「표가 아니다」 로 봤는데, 사람 눈에는 분명한
 * 표다. 그래서 「표로 판정 만들기」 단추가 안 나오고, 판정도 「표를 못
 * 읽었습니다」 로 떨어졌다.
 *
 * 머리줄 후보는 **두 칸 이상 띄어 나뉜 낱말이 셋 이상**인 줄이다. 둘까지
 * 받아 주면 보통 문장도 표로 읽혀 엉뚱한 것이 잡힌다.
 */
/**
 * 표의 **자리 정보** — 어느 줄이 머리·자료이고 열이 어디서 갈리는지.
 *
 * 판정(parseTable)과 화면의 블럭 표시가 **이 한 곳**을 같이 쓴다.
 * 표시용 파서를 따로 두면 언젠가 서로 다른 표를 보게 된다 —
 * 블럭화는 왔다 갔다 하면 안 된다(합의: 일관성).
 */
export interface TblLayout {
  /** 머리줄 줄 번호 */
  headIdx: number
  /** 구분선(---) 줄 번호. 머리줄 방식이면 -1 */
  sepIdx: number
  /** 각 열의 [시작, 끝). 마지막 열의 끝은 -1 — 줄 끝까지 */
  cols: Array<[number, number]>
  /** 자료 줄 번호들 */
  bodyIdx: number[]
}

const isPromptLine = (s: string) => /^[\w.-]+[#>]\s*$/.test(s.trim())

/** 구분선이 없는 표 — 머리줄의 글자 자리로 (tableByHeader 의 규칙 그대로) */
function tableLayoutByHead(lines: string[]): TblLayout | null {
  const cut = (ln: string): Array<{ at: number; w: string }> => {
    const out: Array<{ at: number; w: string }> = []
    const re2 = /\S(?:.*?\S)??(?=\s{2,}|$)/g
    let m2: RegExpExecArray | null
    while ((m2 = re2.exec(ln))) {
      if (m2[0]) out.push({ at: m2.index, w: m2[0] })
      if (re2.lastIndex === m2.index) re2.lastIndex++
    }
    return out
  }
  // 머리줄은 앞쪽에 있다. 스무 줄까지만 본다 — 그 아래에 있으면 표가 아니다.
  for (let h = 0; h < Math.min(lines.length, 20); h++) {
    const head = lines[h] ?? ''
    if (!head.trim()) continue
    const cells = cut(head)
    if (cells.length < 3) continue
    const starts = cells.map((c) => c.at)
    const bodyIdx: number[] = []
    for (let i = h + 1; i < lines.length; i++) {
      const ln = lines[i] ?? ''
      if (!ln.trim()) continue
      if (isPromptLine(ln)) continue
      // 머리줄과 자리가 안 맞는 줄은 자료가 아니다 — 명령 메아리·날짜 따위
      if (cut(ln).length < 2) continue
      bodyIdx.push(i)
    }
    if (bodyIdx.length) {
      const cols: Array<[number, number]> = starts.map((st, c) => [
        st,
        c === starts.length - 1 ? -1 : (starts[c + 1] ?? -1),
      ])
      return { headIdx: h, sepIdx: -1, cols, bodyIdx }
    }
  }
  return null
}

export function tableLayout(text: string): TblLayout | null {
  const lines = String(text ?? '').split(/\r?\n/)

  const sepIdx = lines.findIndex((l) => /-{3,}/.test(l) && /^[\s-]+$/.test(l))
  if (sepIdx >= 1) {
    const sep = lines[sepIdx] ?? ''
    const ranges: Array<[number, number]> = []
    const re = /-+/g
    let m: RegExpExecArray | null
    while ((m = re.exec(sep))) ranges.push([m.index, m.index + m[0].length])
    /*
     * 대시 덩어리가 하나뿐이면 표가 아니라 **장식선**이다 — `show cpu us` 가
     * 전폭 대시로 단락을 가르는데, 그것을 1열 표로 읽어 줄 전체가 한 셀이
     * 됐다(사진 지적). 열이 둘은 있어야 표다. 아니면 머리줄 방식으로 넘긴다.
     */
    if (ranges.length < 2) return tableLayoutByHead(lines)
    const bodyIdx: number[] = []
    for (let i = sepIdx + 1; i < lines.length; i++) {
      const ln = lines[i] ?? ''
      if (!ln.trim()) continue
      // 프롬프트 줄(`SWITCH#`)은 자료가 아니다
      if (isPromptLine(ln)) continue
      bodyIdx.push(i)
    }
    if (!bodyIdx.length) return null
    // 마지막 열은 구분선보다 길어질 수 있다 (Type 처럼) — 끝을 -1 로 연다
    const cols: Array<[number, number]> = ranges.map((r, i) => [
      r[0],
      i === ranges.length - 1 ? -1 : r[1],
    ])
    return { headIdx: sepIdx - 1, sepIdx, cols, bodyIdx }
  }

  return tableLayoutByHead(lines)
}

export function parseTable(text: string): Tbl | null {
  const lay = tableLayout(text)
  if (!lay) return null
  const lines = String(text ?? '').split(/\r?\n/)
  const cellOf = (ln: string, c: number): string => {
    const col = lay.cols[c]
    if (!col) return ''
    const end = col[1] < 0 ? Math.max(ln.length, col[0]) : col[1]
    return ln.slice(col[0], end).trim()
  }
  const cols = lay.cols.map((_, c) => cellOf(lines[lay.headIdx] ?? '', c))
  const rows = lay.bodyIdx.map((i) => lay.cols.map((_, c) => cellOf(lines[i] ?? '', c)))
  return { cols, rows }
}

interface Tok {
  col: string
  val: string
  /** `!=` — 이 값이면 안 된다 */
  neq: boolean
}

/** `Status=connected Type="Not Present"` → 토큰들. 값에 공백이 있으면 따옴표. */
function parseToks(s: string): Tok[] {
  const out: Tok[] = []
  // 한글 열 이름도 받는다 — 표 머리줄이 늘 영문인 것은 아니다
  const re = /([\w가-힣 .\/-]+?)\s*(!=|=)\s*("[^"]*"|\S*)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(String(s ?? '')))) {
    const val = (m[3] ?? '').replace(/^"|"$/g, '')
    out.push({ col: (m[1] ?? '').trim(), val: val.trim(), neq: m[2] === '!=' })
  }
  return out
}

/** 값에 공백이 있으면 따옴표를 씌워 돌려준다 (`Not Present` → `"Not Present"`) */
/**
 * `이름 = 값` 줄만 있는 출력을 표로 본다 (SNMP walk).
 *
 * SNMP 응답에는 구분선이 없어 표 파서가 못 읽는다. 그런데 사람 눈에는
 * 분명한 표다 — 줄마다 이름·인덱스·값 셋이다. 그것을 그대로 세 열로
 * 세워 주면 표에서 고르는 화면을 그대로 쓸 수 있다. 그래야 SNMP 시험도
 * 정규식 없이 만든다.
 */
export function kvTable(text: string): Tbl | null {
  const rows: string[][] = []
  for (const ln of String(text ?? '').split(/\r?\n/)) {
    const m = /^\s*(\S+)\s*=\s*(.*)$/.exec(ln)
    if (!m) continue
    const name = m[1] ?? ''
    const idx = /\.(\d+)$/.exec(name)?.[1] ?? ''
    rows.push([name, idx, (m[2] ?? '').trim()])
  }
  if (rows.length < 2) return null
  /* 열 이름은 ASCII 로 둔다 — 행 조건(`Index=1013`)을 읽는 파서가 한글
     열 이름을 못 읽는다. SNMP 를 보는 사람에게 OID·Index·Value 가 낯선
     말도 아니다 */
  return { cols: ['OID', 'Index', 'Value'], rows }
}

/** 표로 읽기 — 구분선 표가 먼저, 안 되면 `이름 = 값` 줄 (SNMP) */
export function anyTable(text: string): Tbl | null {
  return parseTable(text) ?? kvTable(text)
}

/**
 * 표에서 한 칸 꺼내기 (iTest 의 Response Map).
 *
 * 「Port 가 Te0/${i} 인 행의 Name 칸」 을 실행할 때마다 다시 읽는다.
 * 정규식이 아니라 **열 이름과 행 조건**이라 사람이 읽을 수 있고, 장비가
 * 칸 폭을 바꿔도 안 깨진다 — 자리가 아니라 머리줄로 찾기 때문이다.
 *
 * 못 찾으면 null. 「없다」 와 「빈 칸이다」 는 다른 말이라 빈 문자열로
 * 뭉개지 않는다.
 */
export function tableCapture(
  output: string,
  q: { col?: string; where?: string; row?: string },
  vars: Record<string, string> = {},
): string | null {
  if (!q.col) return null
  const tbl = anyTable(output)
  if (!tbl) return null
  const at = (n: string) => tbl.cols.findIndex((c) => c.toLowerCase() === String(n).toLowerCase())
  const ci = at(q.col)
  if (ci < 0) return null

  const eq = (cv: string, v: string) =>
    v === '*' ? cv !== '' : cv.toLowerCase() === v.toLowerCase()

  let row: string[] | undefined
  if (q.where && q.where.trim()) {
    const toks = parseToks(subVars(q.where, vars))
    if (!toks.length) return null
    row = tbl.rows.find((r) =>
      toks.every((t) => {
        const c = at(t.col)
        if (c < 0) return false
        const ok = eq(r[c] ?? '', t.val)
        return t.neq ? !ok : ok
      }),
    )
  } else if (q.row && q.row.trim()) {
    const n = Number(subVars(q.row, vars))
    if (!Number.isFinite(n) || n < 1) return null
    row = tbl.rows[n - 1]
  } else {
    row = tbl.rows[0]
  }
  if (!row) return null
  return (row[ci] ?? '').trim()
}

/**
 * 표 뽑기가 **왜** 못 잡았나 — 사람이 읽을 한 줄.
 *
 * 「없는 변수」 만 보면 어디가 틀렸는지 알 수 없다(지적: 설정도 했는데 없는
 * 변수라고 나와). 대개는 **찾는 값이 그 열에 없다**: 반복이 `Index=1` 을
 * 찾는데 표의 Index 는 113·1001… 뿐인 것. 그러면 있는 값 몇 개를 함께
 * 보여 준다 — 반복을 그 값에 맞추거나 「응답 순서로」 로 바꾸면 된다.
 */
export function captureMiss(
  output: string,
  q: { var?: string; col?: string; where?: string; row?: string },
  vars: Record<string, string> = {},
): string | null {
  if (!q.var || !q.col) return null
  if (tableCapture(output, q, vars) !== null) return null // 잘 잡혔으면 할 말 없다
  /* 반복 변수가 **안 풀린 채** 남아 있으면 그것이 진짜 까닭이다.
     `${i}` 에 값이 없으면 「Interface=${i} 인 행이 없습니다」 처럼 엉뚱한 곳을
     가리키게 된다(지적). 대개 이 스텝이 **반복 안에 안 들어가 있어서**다 —
     반복 줄에 「비어 있음」 이 붙어 있으면 그 경우다. */
  const _un = /\$\{(\w+)\}/.exec(subVars(String(q.where ?? q.row ?? ''), vars))
  if (_un)
    return `${q.var} ← \${${_un[1]}} 에 값이 없습니다 — 이 스텝이 반복 안에 있지 않습니다. 반복 줄 아래로 한 칸 들여쓰세요(반복 줄의 「아래 N줄 넣기」).`
  const tbl = anyTable(output)
  if (!tbl) return `${q.var} ← 이 응답에서 표를 못 찾았습니다`
  const at = (n: string) => tbl.cols.findIndex((c) => c.toLowerCase() === String(n).toLowerCase())
  if (at(q.col) < 0) return `${q.var} ← 담을 칸 '${q.col}' 열이 표에 없습니다`
  if (q.where && q.where.trim()) {
    const toks = parseToks(subVars(q.where, vars))
    const miss = toks.find((t) => at(t.col) < 0)
    if (miss) return `${q.var} ← 찾는 열 '${miss.col}' 이 표에 없습니다`
    // 어느 열에서 무엇을 찾다 없었나 + 그 열에 실제로 있는 값 몇 개
    const t0 = toks[0]
    const ci = t0 ? at(t0.col) : -1
    const have = ci >= 0 ? [...new Set(tbl.rows.map((r) => r[ci] ?? '').filter(Boolean))] : []
    const sample = have.slice(0, 8).join(' · ')
    return `${q.var} ← ${t0 ? `${t0.col}=${t0.val}` : q.where} 인 행이 없습니다${
      sample ? ` (있는 값: ${sample}${have.length > 8 ? ' …' : ''})` : ''
    }`
  }
  if (q.row && q.row.trim()) {
    return `${q.var} ← ${subVars(q.row, vars)} 번째 줄이 없습니다 (줄 수 ${tbl.rows.length})`
  }
  return `${q.var} ← 값을 못 찾았습니다`
}


export function quoteVal(v: string): string {
  return /\s/.test(v) ? `"${v}"` : v
}

/** 눌러서 고른 것을 판정기준 글자로. 화면과 엔진이 같은 문법을 쓰게 한다. */
export function buildTableCriteria(
  keyCol: string,
  keys: string[],
  checks: Array<{ col: string; val: string; neq?: boolean }>,
): string {
  const left = keys.length ? `${keyCol}=${keys.map(quoteVal).join(',')}` : `${keyCol}=*`
  const right = checks.map((c) => `${c.col}${c.neq ? '!=' : '='}${quoteVal(c.val)}`).join(' ')
  return `${left} => ${right}`
}

/** 판정기준 글자를 다시 눌린 상태로. 열었을 때 전에 고른 것이 그대로 보여야 한다. */
export function readTableCriteria(criteria: string): {
  keyCol: string
  keys: string[]
  checks: Tok[]
} | null {
  const s = String(criteria ?? '')
  if (!s.includes('=>')) return null
  const [l = '', ...rest] = s.split('=>')
  const f = parseToks(l)[0]
  if (!f) return null
  return {
    keyCol: f.col,
    keys: f.val === '*' ? [] : f.val.split(',').map((x) => x.trim()).filter(Boolean),
    checks: parseToks(rest.join('=>')),
  }
}

/**
 * 표 판정.
 *
 * 고른 행이 **하나도 없으면 불합격**이다. 필터가 헛도는데 합격이 나오면
 * 포트를 안 보고 통과한 것을 모른 채 넘어간다.
 */
export function judgeTable(
  output: string,
  criteria: string,
): { verdict: Verdict; reason: string } {
  const tbl = parseTable(output)
  if (!tbl)
    return {
      verdict: 'Fail',
      reason: '표를 못 읽었습니다 — 머리줄과 자료가 칸으로 나뉜 출력이어야 합니다',
    }

  const s = String(criteria ?? '')
  let filters: Tok[]
  let checks: Tok[]
  if (s.includes('=>')) {
    const [l = '', ...rest] = s.split('=>')
    filters = parseToks(l)
    checks = parseToks(rest.join('=>'))
  } else {
    const toks = parseToks(s)
    checks = toks.slice(0, 1)
    filters = toks.slice(1)
  }
  if (!checks.length || !checks[0]?.col)
    return {
      verdict: 'Fail',
      reason: '판정기준이 비었습니다 — 「표에서 고르기」 로 만드세요',
    }

  const at = (name: string) =>
    tbl.cols.findIndex((c) => c.toLowerCase() === String(name).toLowerCase())
  for (const c of [...checks, ...filters]) {
    if (c.col && at(c.col) < 0)
      return {
        verdict: 'Fail',
        reason: `"${c.col}" 열이 없습니다 · 있는 열: ${tbl.cols.filter(Boolean).join(', ')}`,
      }
  }

  const eq = (cv: string, v: string) =>
    v === '*'
      ? cv !== ''
      : v.includes(',')
        ? v.split(',').map((x) => x.trim().toLowerCase()).includes(cv.toLowerCase())
        : cv.toLowerCase() === v.toLowerCase()

  let checked = 0
  const fails: string[] = []
  for (const row of tbl.rows) {
    const cellOf = (n: string) => row[at(n)] ?? ''
    let keep = true
    for (const f of filters) {
      let r = eq(cellOf(f.col), f.val)
      if (f.neq) r = !r
      if (!r) {
        keep = false
        break
      }
    }
    if (!keep) continue
    checked++
    for (const c of checks) {
      const cv = cellOf(c.col)
      let ok = eq(cv, c.val)
      if (c.neq) ok = !ok
      if (!ok) {
        // 「Status 이」/「Speed 가」 처럼 조사를 틀리느니 콜론으로 둔다
        fails.push(`${row[0] || '(행)'} ${c.col}: ${cv || '(빈값)'}`)
        break
      }
    }
  }

  if (checked === 0)
    return { verdict: 'Fail', reason: '고른 행이 하나도 없습니다 — 행 조건을 확인하세요' }
  const what = checks.map((c) => `${c.col}${c.neq ? '≠' : '='}${c.val}`).join(' · ')
  if (!fails.length) return { verdict: 'Pass', reason: `${checked}행 모두 ${what}` }
  return {
    verdict: 'Fail',
    reason: `${checked}행 중 ${fails.length}행 어긋남 — ${fails.slice(0, 6).join(' | ')}${
      fails.length > 6 ? ` 외 ${fails.length - 6}행` : ''
    }`,
  }
}

/**
 * 판정 기준 칩 — 종류 드롭다운을 없앤 새 모양(합의).
 *
 *  · has   응답에 있어야 합격
 *  · not   응답에 없어야 합격
 *  · table 표 조건 (`Port=Gi0/1 => Status=connected` 문법 그대로)
 *
 * 규칙은 하나뿐이다: **모든 칩을 만족하면 합격, 하나라도 어긋나면 불합격,
 * 칩이 없으면 판정 안 함.** 칩이 있으면 옛 type·criteria 보다 우선한다.
 */
export interface JudgeRule {
  t: 'has' | 'not' | 'table' | 'skip' | 'skipcol' | 'cmp'
  v: string
  /**
   * t='cmp' — **값끼리 견줌**. 응답에서 잡은 값(`${변수}`)을 전역 파라미터나
   * 다른 값과 견준다. `l`(왼쪽) `op`(견주는 법) `v`(오른쪽). Diff 스텝을 따로
   * 안 만들고 판정 기준 안에서 바로 견주려는 것(지시).
   */
  l?: string
  op?: string
}

/**
 * 시각 줄 제외 칩의 값 — 글자가 아니라 **모양**으로 뺀다.
 *
 * 「Mon Aug 17 2026 21:12:50 KST」 를 글자로 제외하면 다음 실행의 새
 * 시각과는 안 맞아 영원히 못 뺀다(지적). 이 칩은 요일로 시작하는
 * 시각 줄이면 값이 무엇이든 뺀다.
 */
export const SKIP_TIME = '⏱시각줄'
const TIME_LINE = /^\s*(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+\w{3}\s+\d/
export const isTimeLine = (l: string): boolean => TIME_LINE.test(String(l ?? ''))

/** 시각·날짜처럼 생긴 값인가 — 줄제외를 만들 때 ⏱시각줄 칩으로 바꾼다 */
export function looksLikeTime(v: string): boolean {
  const t = String(v ?? '').trim()
  return TIME_LINE.test(t) || /\d{1,2}:\d{2}:\d{2}/.test(t)
}

/**
 * 줄제외 한 벌 적용 — 판정·변수 캡처·미리보기가 전부 이것 하나를 쓴다.
 * 글자 칩은 그 문구가 든 줄을, ⏱시각줄 칩은 시각 줄을 뺀다.
 */
export function applySkips(text: string, step: TcStep): string {
  const rules = stepRules(step).filter((r) => r.t === 'skip')
  /* 시각처럼 생긴 칩은 **적용할 때 모양 매칭**으로 해석한다 — 옛 문자
     시각 칩(그때의 시각 글자)도 다시 만들 필요 없이 그대로 동작(지적 A).
     글자 그대로 매칭하면 다음 실행의 새 시각과 절대 안 맞는다. */
  const isTimeChip = (v: string) => v === SKIP_TIME || looksLikeTime(v)
  const subs = [
    String(step.excludeLines ?? ''),
    ...rules.filter((r) => !isTimeChip(String(r.v ?? ''))).map((r) => String(r.v ?? '')),
  ]
    .filter(Boolean)
    .join('\n')
  let out = applyExclude(String(text ?? ''), subs)
  /* 시각 제거는 **⏱시각줄 칩이 있는 스텝만** — 뺄지 말지는 시스템이 아니라
     사용자가 정한다(합의: 무조건 제거는 과했음). 순서는 그대로:
     제외(칩) → 캡처 → 판정. Diff 견주기의 시각 자동 무시만 예외로 남는다. */
  if (rules.some((r) => isTimeChip(String(r.v ?? ''))))
    out = out
      .split(/\r?\n/)
      .filter((l) => !TIME_LINE.test(l))
      .join('\n')

  /* 열제외 칩 — 표의 세로 영역을 통째로 뺀다(지시: Uptime 열 빼고 전체
     변수). 열 인식은 판정기와 같은 파서(tableLayout) 하나만 쓰고, 그 열의
     글자 자리를 공백으로 갈아 정렬은 그대로 둔다. */
  const colChips = stepRules(step).filter((r) => r.t === 'skipcol')
  if (colChips.length) {
    const lay = tableLayout(out)
    if (lay) {
      const lines = out.split(/\r?\n/)
      const head = lines[lay.headIdx] ?? ''
      const wanted = new Set(colChips.map((r) => String(r.v ?? '').trim().toLowerCase()))
      const hitCols = lay.cols
        .map((col, ci) => {
          const end = col[1] < 0 ? Math.max(head.length, col[0]) : col[1]
          return { ci, s: col[0], e: col[1], name: head.slice(col[0], end).trim().toLowerCase() }
        })
        .filter((c) => wanted.has(c.name))
      if (hitCols.length) {
        const rows = new Set([lay.headIdx, lay.sepIdx, ...lay.bodyIdx])
        out = lines
          .map((ln, i) => {
            if (!rows.has(i)) return ln
            let cur = ln
            for (const c of hitCols) {
              const end = c.e < 0 ? cur.length : Math.min(c.e, cur.length)
              if (c.s >= cur.length) continue
              cur = cur.slice(0, c.s) + ' '.repeat(Math.max(0, end - c.s)) + cur.slice(end)
            }
            return cur.replace(/\s+$/, '')
          })
          .join('\n')
      }
    }
  }
  return out
}

export function stepRules(step: TcStep): JudgeRule[] {
  const r = (step as { rules?: unknown }).rules
  if (!Array.isArray(r)) return []
  return r.filter(
    (x): x is JudgeRule =>
      !!x && typeof x === 'object' && typeof (x as JudgeRule).v === 'string' &&
      ['has', 'not', 'table', 'skip', 'skipcol', 'cmp'].includes(String((x as JudgeRule).t)),
  )
}

export function judge(step: TcStep, output: string, vars: Record<string, string> = {}): {
  verdict: Verdict
  reason: string
} {
  const type = String(step.type ?? 'contains')

  const err = looksLikeError(output)
  if (err) return { verdict: 'Fail', reason: `장비 오류 응답 — "${err}"` }

  /* 칩 기준 — rules 밭이 있으면 그것이 정본이다. **빈 배열도 정본**이다 —
     칩을 다 지운 것을 「규칙 없음」 으로 보면 옛 criteria 가 되살아난다
     (지적: 삭제하면 계속 추가됨). */
  const hasRuleField = Array.isArray((step as { rules?: unknown }).rules)
  const rules = stepRules(step)
  if (hasRuleField || rules.length) {
    // 줄제외 칩 — 판정·캡처가 같은 눈(applySkips)
    const scoped2 = applySkips(applyQuery(output, step.query as string | undefined), step)
    const raw2 = applySkips(String(output ?? ''), step)
    const hasTok = (tok: string) => {
      const t = tok.toLowerCase()
      return scoped2.toLowerCase().includes(t) || raw2.toLowerCase().includes(t)
    }
    const lineOf2 = (tok: string): string => {
      const t = tok.toLowerCase()
      const hit =
        scoped2.split(/\r?\n/).find((l) => l.toLowerCase().includes(t)) ??
        raw2.split(/\r?\n/).find((l) => l.toLowerCase().includes(t))
      return (hit ?? '').trim().slice(0, 100)
    }
    const fails: string[] = []
    const oks: string[] = []
    for (const r of rules) {
      if (r.t === 'skip' || r.t === 'skipcol') continue
      // 견줌 칩 — 값끼리 본다(응답 변수 vs 전역 파라미터 따위). Diff 스텝과
      // 같은 잣대(evalCondWhy)를 쓴다. l·op·v 가 없으면(짓는 중) 건너뛴다.
      if (r.t === 'cmp') {
        const expr = `${r.l ?? ''} ${r.op || '=='} ${r.v ?? ''}`.trim()
        if (!String(r.l ?? '').trim() && !String(r.v ?? '').trim()) continue
        const res = evalCondWhy(expr, vars)
        ;(res.ok ? oks : fails).push(`견줌 ${res.why}`)
        continue
      }
      const v = subVars(String(r.v ?? ''), vars).trim()
      if (!v) continue
      if (r.t === 'has') {
        if (hasTok(v)) oks.push(`"${v}" 있음 → ${lineOf2(v)}`)
        else fails.push(`"${v}" 없음`)
      } else if (r.t === 'not') {
        if (hasTok(v)) fails.push(`있으면 안 되는 "${v}" 있음 → ${lineOf2(v)}`)
        else oks.push(`"${v}" 없음(정상)`)
      } else {
        const tr = judgeTable(raw2, v)
        if (tr.verdict === 'Fail') fails.push(tr.reason)
        else oks.push(tr.reason)
      }
    }
    if (!fails.length && !oks.length) return { verdict: '', reason: '판정기준 없음' }
    if (fails.length) return { verdict: 'Fail', reason: fails.join(' · ') }
    return { verdict: 'Pass', reason: oks.join(' · ') }
  }

  if (type === 'none') return { verdict: '', reason: '판정 안 함' }

  /*
   * 오류만 없으면 합격.
   *
   * 조회 시험에 무엇을 판정기준으로 넣을지가 늘 애매하다. `show cpu usage`
   * 에 무엇을 적어야 하나? 값은 돌 때마다 다르고, 항목 이름을 적으면
   * 「명령이 통했다」 를 확인하는 셈인데 그러려고 문구를 외워 적는 것은
   * 번거롭다.
   *
   * 그 뜻을 그대로 판정으로 만든다. 명령이 먹혔고 뭔가 돌아왔으면 합격.
   * 위에서 `looksLikeError` 가 이미 걸렀으니 여기서는 응답이 있었는지만
   * 본다.
   */
  if (type === 'ok') {
    const body = String(output ?? '').trim()
    return body
      ? { verdict: 'Pass', reason: '오류 없이 응답했습니다' }
      : { verdict: 'Fail', reason: '응답이 비었습니다' }
  }

  const rawCriteria = String(step.criteria ?? step.expected ?? '').trim()
  if (!rawCriteria) return { verdict: '', reason: '판정기준 없음' }

  /**
   * 변수 식.
   *
   * 응답을 뒤지는 것이 아니라 값끼리 견준다 — `${var1} == ${var2}`.
   * 여기서는 subVars 를 미리 하면 안 된다. evalCondWhy 가 안 바뀐 이름을
   * 찾아 '그런 변수가 없다' 고 알려 주는데, 미리 바꿔 버리면 그 말을
   * 못 한다.
   */
  if (type === 'expr') {
    const r = evalCondWhy(rawCriteria, vars)
    return { verdict: r.ok ? 'Pass' : 'Fail', reason: r.why }
  }

  const criteria = subVars(rawCriteria, vars).trim()

  // 표는 판정 영역/제외 줄을 적용하지 않는다 — 머리글과 구분선이 잘리면
  // 열 자리를 못 잡는다. 행을 고르는 것은 표 판정 자신의 필터가 한다.
  if (type === 'table') return judgeTable(applySkips(String(output ?? ''), step), criteria)

  // 순서 합의는 옛 방식 판정에도 그대로: 시각 제거 → 제외 → 판정
  const scoped = applySkips(applyQuery(output, step.query as string | undefined), step)
  const raw = applySkips(String(output ?? ''), step)
  // Query 로 잘라낸 쪽에 없으면 원본에서도 본다. 사람이 화면에서 본 그대로
  // 찾히는 것이 직관적이다 (옛 화면과 같은 폴백).
  const has = (tok: string) => {
    const t = tok.toLowerCase()
    return scoped.toLowerCase().includes(t) || raw.toLowerCase().includes(t)
  }

  /**
   * 어느 줄에서 걸렸나 — 근거는 「있다/없다」 가 아니라 **그 줄**이다.
   *
   * 적합인데 근거가 비어 있으면 「정말 맞게 본 건가」 를 확인하려고 결국
   * 출력을 눈으로 훑게 된다. 그럴 거면 판정이 왜 있나.
   */
  const lineOf = (tok: string): string => {
    const t = tok.toLowerCase()
    const hit =
      scoped.split(/\r?\n/).find((l) => l.toLowerCase().includes(t)) ??
      raw.split(/\r?\n/).find((l) => l.toLowerCase().includes(t))
    return (hit ?? '').trim().slice(0, 100)
  }

  if (type === 'notcontains') {
    const toks = criteria.split(',').map((s) => s.trim()).filter(Boolean)
    const hit = toks.find(has)
    if (hit) {
      return {
        verdict: 'Fail',
        reason: `있으면 안 되는 "${hit}" 가 있음 → ${lineOf(hit)}`,
      }
    }
    // 무엇을 찾아봤는지 남긴다. 「없음」 만 적으면 무엇을 안 찾았는지 모른다.
    return {
      verdict: 'Pass',
      reason: `${toks.map((t) => `"${t}"`).join(' · ')} ${toks.length > 1 ? '모두 ' : ''}없음`,
    }
  }

  if (type === 'contains_all') {
    const toks = criteria.split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean)
    if (toks.length === 0) return { verdict: '', reason: '판정기준 없음' }
    const miss = toks.filter((t) => !has(t))
    if (miss.length) {
      /*
       * 못 찾은 것을 **전부** 적는다.
       *
       * 전에는 처음 하나만 적었다. 셋이 빠졌는데 하나만 고치고 다시
       * 돌리면 또 하나가 나오고, 그렇게 세 번을 돌게 된다.
       */
      const found = toks.filter((t) => has(t))
      return {
        verdict: 'Fail',
        reason:
          `${toks.length}개 중 ${miss.length}개 없음 — ${miss.map((t) => `"${t}"`).join(' · ')}` +
          (found.length ? ` (찾은 것: ${found.map((t) => `"${t}"`).join(' · ')})` : ''),
      }
    }
    // 무엇이 있어서 적합인지 — 찾은 줄까지 함께
    const one = toks.length === 1
    return {
      verdict: 'Pass',
      reason: one
        ? `"${toks[0]}" 있음 → ${lineOf(toks[0] as string)}`
        : `${toks.length}개 모두 있음 — ${toks.map((t) => `"${t}"`).join(' · ')}`,
    }
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
  if (!hit) {
    // 여럿 중 하나면 되는 판정이다. 무엇들을 찾았는지 다 적어야 왜 안
    // 걸렸는지 안다 — 「기준이 출력에 없음」 만으로는 오타인지 진짜
    // 없는 것인지 못 가린다.
    return {
      verdict: 'Fail',
      reason:
        toks.length > 1
          ? `${toks.map((t) => `"${t}"`).join(' · ')} 중 아무것도 없음`
          : `"${criteria}" 가 출력에 없음`,
    }
  }
  // 어느 줄에서 맞았는지 적는다. PASS 만 보고 '정말 맞게 본 건가' 를
  // 다시 확인하려면 응답을 눈으로 훑어야 했다.
  const where = lineOf(hit)
  return { verdict: 'Pass', reason: where ? `"${hit}" 있음 → ${where}` : `"${hit}" 있음` }
}

/**
 * 응답에서 변수를 뽑는다.
 *
 * queries 는 SNMP 가 아니라 '응답에서 정규식으로 값을 꺼내 변수에 담는 것'
 * 이다. 134스텝이 `/\d+\s+\[E\d+\]…/m` 같은 식을 갖고 있다.
 * 캡처그룹 1 이 있으면 그것을, 없으면 매칭 전체를 담는다.
 */
/**
 * 식 하나를 응답에 대 보고 뽑히는 값.
 *
 * 화면이 '이 변수가 지금 무엇을 뽑고 있나' 를 보여주는 데 쓴다. 이름만
 * 보이면 식이 맞는지 돌려보기 전에는 알 수 없다.
 */
export function extractOne(rule: string, text: string): string | null {
  const re = toRegExp(rule)
  if (!re) return null
  const m = re.exec(String(text ?? ''))
  if (!m) return null
  return (m[1] ?? m[0] ?? '').trim()
}

export function extractVars(
  step: TcStep,
  output: string,
  /**
   * 지금까지의 변수 — **캡처 규칙 안에서도 쓴다**(지시: iTest 의
   * `t1_col1('$i')` 처럼). 반복 안에서 `/^Gi0\/${i}\s+(\S+)/m` 로 그 회차의
   * 줄만 집어낼 수 있어야 한다. 여태 판정 칩만 치환을 지나고 캡처는 글자
   * 그대로였다 — 그래서 반복마다 같은 줄만 집혔다.
   */
  vars: Record<string, string> = {},
): Record<string, string> {
  const out: Record<string, string> = {}
  /* 줄제외 칩(+옛 뺄 줄)은 캡처에서도 그 줄을 뺀다 — 「전체를 변수로」 가
     날짜 줄까지 담으면 뒤 Diff 가 늘 다르다고 한다(지적). 판정과 캡처가
     같은 눈을 쓴다: 제외 = 이 스텝에서 그 줄은 없는 셈. */
  output = applySkips(output, step)
  /* 표에서 뽑기 — 정규식보다 먼저 본다. 둘 다 적혀 있으면 표 쪽이 이긴다
     (열 이름으로 찾는 것이 칸 폭 바뀜에 안 깨진다) */
  for (const q of step.queries ?? []) {
    if (!q.var || !q.col) continue
    const got = tableCapture(output, q, vars)
    if (got !== null) out[q.var] = got
  }
  const rules: Array<{ name?: string; rule?: string }> = [
    ...(step.queries ?? []).filter((x) => !x.col).map((x) => ({ name: x.var, rule: x.q })),
    ...(step.extracts ?? []).map((x) => ({ name: x.var, rule: x.rule })),
  ]
  for (const r of rules) {
    if (!r.name || !r.rule) continue
    const re = toRegExp(subVars(r.rule, vars))
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
  return evalCondWhy(expr, vars).ok
}

/**
 * If 의 조건 · Switch 의 기준값 — 왜 그렇게 됐는지까지.
 *
 * 자료에 있는 것은 `${a} == 'x'` 정도의 아주 단순한 식뿐이라 파서를 두지
 * 않는다. eval 도 쓰지 않는다 — 저장된 문자열이 그대로 실행되는 길을
 * 만들지 않는다.
 *
 * **못 알아들은 식은 거짓이다.** 전에는 '값이 비어 있지 않으면 참' 갈래로
 * 떨어져서, `${a} = ${b}` 처럼 `=` 를 하나만 쓴 식이 늘 참이 됐다. 조건이
 * 조용히 늘 참이면 If 를 안 쓴 것과 같은데 화면에는 '조건 참' 이라고
 * 적히니 알아챌 수가 없다.
 */
export function evalCondWhy(
  expr: string,
  vars: Record<string, string>,
): { ok: boolean; why: string } {
  const raw = String(expr ?? '').trim()
  if (!raw) return { ok: true, why: '조건이 비어 있어 늘 참입니다' }

  const s = subVars(raw, vars).trim()

  /** 안 바뀐 `${이름}` — 그런 변수가 없다는 뜻이다 */
  const missing = [...s.matchAll(/\$\{?(\w+)\}?/g)].map((m) => m[1])

  // `=` 하나도 견줌으로 받는다. 사람은 그렇게 쓴다.
  // `<>` 도 다름으로 받는다(옛 자료·다른 도구 습관).
  const m = /^(.*?)\s*(==|!=|<>|>=|<=|=|>|<|포함|contains)\s*(.*)$/.exec(s)
  if (!m) {
    return {
      ok: false,
      why: `견줌으로 읽을 수 없습니다 — == != > < >= <= 포함 중 하나가 있어야 합니다`,
    }
  }

  const strip = (v: string) => v.trim().replace(/^['"]|['"]$/g, '')
  const a = strip(m[1] ?? '')
  const b = strip(m[3] ?? '')
  const op = m[2] ?? '=='
  const na = Number(a)
  const nb = Number(b)
  const numeric = a !== '' && b !== '' && Number.isFinite(na) && Number.isFinite(nb)

  let ok: boolean
  switch (op) {
    case '!=':
    case '<>':
      ok = numeric ? na !== nb : a.toLowerCase() !== b.toLowerCase()
      break
    case '>':
      ok = numeric ? na > nb : a > b
      break
    case '<':
      ok = numeric ? na < nb : a < b
      break
    case '>=':
      ok = numeric ? na >= nb : a >= b
      break
    case '<=':
      ok = numeric ? na <= nb : a <= b
      break
    case '포함':
    case 'contains':
      ok = a.toLowerCase().includes(b.toLowerCase())
      break
    default:
      ok = numeric ? na === nb : a.toLowerCase() === b.toLowerCase()
  }

  // 무엇과 무엇을 견줬는지 적는다. 이것이 없으면 참·거짓만 보고
  // 왜 그런지 다시 짚어야 한다.
  const shown = `'${a}' ${op} '${b}'`
  const warn = missing.length
    ? ` · ${missing.map((x) => `\${${x}}`).join(', ')} 은 없는 변수라 글자 그대로 견줬습니다`
    : ''
  return { ok, why: shown + warn }
}


/**
 * 두 글뭉치를 줄 단위로 견준다.
 *
 * `running-config` 처럼 여러 줄짜리를 견줄 때 '같다/다르다' 만으로는 쓸 수
 * 없다. **어느 줄이 다른지** 보여야 한다.
 *
 * 순서까지 따지지 않고 '한쪽에만 있는 줄' 을 찾는다. 장비 출력은 항목
 * 차례가 판올림마다 바뀌는데, 그때마다 전부 다르다고 하면 쓸모가 없다.
 *
 * 매번 달라지는 줄(uptime·카운터)은 `제외 줄` 로 뺀다 — 안 빼면 늘 다르다.
 */
export function diffLines(
  a: string,
  b: string,
  exclude?: string,
): { same: boolean; onlyA: string[]; onlyB: string[] } {
  /* Diff 는 아무것도 몰래 무시하지 않는다(합의: 시스템이 멋대로 정하지
     않는다). 시각 처리는 캡처 단계의 ⏱ 칩이 끝낸다 — 한쪽 캡처에만
     시각이 남았으면 여기서 정직하게 「다르다」 로 보인다. */
  const prep = (s: string) =>
    applyExclude(String(s ?? ''), exclude)
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)

  const la = prep(a)
  const lb = prep(b)

  // 같은 줄이 여러 번 나오는 경우까지 세려면 개수를 센다 — 집합으로만
  // 보면 '두 번 있던 줄이 한 번이 된' 변화를 놓친다.
  const count = (arr: string[]) => {
    const m = new Map<string, number>()
    for (const l of arr) m.set(l, (m.get(l) ?? 0) + 1)
    return m
  }
  const ca = count(la)
  const cb = count(lb)

  const onlyA: string[] = []
  const onlyB: string[] = []
  for (const [l, n] of ca) {
    const d = n - (cb.get(l) ?? 0)
    for (let i = 0; i < d; i++) onlyA.push(l)
  }
  for (const [l, n] of cb) {
    const d = n - (ca.get(l) ?? 0)
    for (let i = 0; i < d; i++) onlyB.push(l)
  }
  return { same: onlyA.length === 0 && onlyB.length === 0, onlyA, onlyB }
}

/** 다른 줄을 사람이 읽는 모양으로. 너무 길면 자른다 */
export function diffText(d: { onlyA: string[]; onlyB: string[] }, cap = 80): string {
  if (d.onlyA.length === 0 && d.onlyB.length === 0) return '두 값이 같습니다'
  const out: string[] = [`왼쪽에만 ${d.onlyA.length}줄 · 오른쪽에만 ${d.onlyB.length}줄`, '']
  for (const l of d.onlyA.slice(0, cap)) out.push(`- ${l}`)
  if (d.onlyA.length > cap) out.push(`  … 왼쪽 ${d.onlyA.length - cap}줄 더`)
  for (const l of d.onlyB.slice(0, cap)) out.push(`+ ${l}`)
  if (d.onlyB.length > cap) out.push(`  … 오른쪽 ${d.onlyB.length - cap}줄 더`)
  return out.join('\n')
}
