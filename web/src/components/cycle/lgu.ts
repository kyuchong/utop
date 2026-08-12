/**
 * 고객사(LG U+) 시험 결과서 양식.
 *
 * 옛 화면 `_shared/09-system-init.js` 의 `buildTCLGUPdfHtml()` 을 옮겼다.
 * 틀은 그대로다 — 실제로 제출해 온 양식이라 바꿀 것이 아니다.
 *
 * TC 한 건이 두 장이다.
 *
 *   1장 「시험 절차」 — TC_ID · REQ ID · 시험항목 / 시험 규격 · 구성도 /
 *                       시험 방법 · (결과는 다음장) / 비고
 *   2장 「시험 결과」 — 스텝마다 `Step N. 설명 [Pass]` · `$ 명령` · 출력
 *
 * 옛 코드에서 **한 가지만 고쳤다.** 스텝을 `kind === 'cli' | 'wait'` 로
 * 걸러서, 그 뒤에 생긴 ping · snmp · diff · 계측기 스텝이 결과서에서
 * 통째로 빠졌다. 사람이 만든 시험이 문서에 안 나오면 안 만든 것과 같다.
 */
import { stepVerdict, type TcStep } from '@/components/tc/types'
import { parseMeterOutput } from '@/components/tc/MeterStats'

/**
 * 계측기 응답(JSON)을 **글 표**로.
 *
 * 화면은 표로 보여 주는데 결과서에는 JSON 원문이 그대로 실렸다 —
 * 200 갈래면 중괄호 200줄이다. 같은 자료를 화면과 같은 표로 편다.
 * 고정폭 글꼴에서 열이 맞도록 자리를 맞춘다.
 */
export function meterTableText(output?: string | null): string | null {
  const m = parseMeterOutput(output ?? undefined)
  if (!m || !m.rows.length) return null
  const has = (k: string) => m.keys.length === 0 || m.keys.includes(k)
  const cols: Array<[string, string]> = [
    ['name', '스트림'],
    ['tx', 'Tx pkts'],
    ['rx', 'Rx pkts'],
    ...(has('loss') ? ([['loss', 'Loss']] as Array<[string, string]>) : []),
    ...(has('txTput') ? ([['txTput', 'Tx bps']] as Array<[string, string]>) : []),
    ...(has('rxTput') ? ([['rxTput', 'Rx bps']] as Array<[string, string]>) : []),
    ...(has('latency') ? ([['latency', 'Latency']] as Array<[string, string]>) : []),
  ]
  const cells = m.rows.map((r, i) => {
    const nSub = m.rows.filter((x) => x.idx === r.idx).length
    const sub = typeof r.sub === 'number' && nSub > 1 ? `.${r.sub + 1}` : ''
    const nm = String(r.name ?? `Stream_${(r.idx ?? i) + 1}`) + sub
    return cols.map(([k]) => (k === 'name' ? nm : String(r[k] ?? '-')))
  })
  const widths = cols.map(([, label], c) =>
    Math.max(label.length, ...cells.map((row) => (row[c] ?? '').length)),
  )
  const line = (row: string[]) => row.map((v, c) => v.padEnd(widths[c] ?? 0)).join('  ')
  const head = line(cols.map(([, l]) => l))
  const rule = widths.map((w) => '-'.repeat(w)).join('  ')
  return [head, rule, ...cells.map(line)].join('\n')
}

/**
 * 옛 실행 기록의 `$ ` 프롬프트를 장비 이름으로 바꾼다.
 *
 * 실행기가 `$` 로 찍던 시절의 출력이 그대로 남아 있다 — 줄 머리의
 * `$ ` 만 우리가 박은 것이므로 그것만 갈아 끼운다.
 */
export function promptize(out: string, prompt?: string | null): string {
  if (!prompt || prompt === '$') return out
  return out.replace(/^\$ /gm, `${prompt} `)
}

export interface LguStep {
  desc?: string | null
  cli?: string | null
  action?: string | null
  criteria?: string | null
  /** SNMP OID · Ping 대상처럼 명령 아닌 스텝의 값 */
  data?: string | null
  /** 판정 기준 */
  expected?: string | null
  /** 옛 자료. 지금 실행기는 아래 둘에 적는다 */
  result?: string | null
  status?: string | null
  repeatResult?: string | null
  output?: string | null
  waitSec?: number | null
  kind?: string | null
}

export interface LguTc {
  tcid?: string | null
  name?: string | null
  reqid?: string | null
  /** 시험 규격 — 목적이나 사전조건 */
  spec?: string | null
  /** 구성도 그림 (url) */
  topoImg?: string | null
  /** CLI 프롬프트 — 장비 이름(#). 없으면 $ */
  prompt?: string | null
  remark?: string | null
  steps: LguStep[]
}

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

const nl = (s: unknown) => esc(s).replace(/\r?\n/g, '<br>')

/** 스텝 한 줄의 이름. 설명이 없으면 명령을, 그것도 없으면 종류를 쓴다 */
/**
 * 스텝 하나를 절차 글로.
 *
 * 설명 한 줄만 적었더니 시험 방법이 「1. -」 로 나왔다 — 계측기·SNMP
 * 스텝은 desc 도 cli 도 비어 있어 제목 만들 재료가 없었다. 결과서의
 * 시험 방법은 「무엇을 보내서 무엇을 확인하나」 가 읽혀야 하므로,
 * 종류·명령·판정 기준까지 적는다.
 */
export function stepTitle(s: LguStep, i: number): string {
  const cli = String(s.cli ?? '').trim()
  const data = String(s.data ?? '').trim()
  const kind = String(s.kind ?? '').toLowerCase()
  const wait = (s.waitSec ?? 0) > 0 && !cli

  // 종류별로 「무엇을 하는 스텝인가」
  const doing = wait
    ? `대기 ${s.waitSec}초`
    : kind === 'snmpget'
      ? `SNMP Get ${data}`.trim()
      : kind === 'snmpset'
        ? `SNMP Set ${data}`.trim()
        : kind === 'ping'
          ? `Ping ${data}`.trim()
          : kind === 'trap'
            ? 'SNMP Trap 대기'
            : kind === 'diff'
              ? '이전 결과와 비교(Diff)'
              : kind === 'meter' || kind === 'instrument'
                ? '계측기 트래픽 실행·통계 확인'
                : cli.split('\n')[0] || data || String(s.action ?? '').trim()

  const head = String(s.desc ?? '').trim() || doing || '-'
  const out = [`${i + 1}. ${head}`]
  // 설명이 따로 있으면 실제로 보내는 것도 적는다 — 방법은 재현 절차다
  if (String(s.desc ?? '').trim() && doing && doing !== head) out.push(`   - ${doing}`)
  else if (cli && cli.includes('\n'))
    for (const c of cli.split('\n').slice(1, 4)) out.push(`   - ${c.trim()}`)
  const crit = String(s.criteria ?? s.expected ?? '').trim()
  if (crit) out.push(`   - 판정: ${crit.split('\n')[0]}`)
  return out.join('\n')
}

/** 한 덩이가 몇 줄쯤 되나 — 슬라이드를 나누는 데만 쓴다 */
interface Block {
  text: string
  lines: number
}

/**
 * 긴 TC 를 슬라이드로 나눈다.
 *
 * 한 장에 다 안 들어가면 잘려서 안 보인다. 잘린 줄을 아무도 못 보는 것이
 * 결과서에서는 가장 나쁘다 — 있는 줄 알고 넘어간다.
 */
function paginate(blocks: Block[], maxLines: number): Block[][] {
  const out: Block[][] = []
  let cur: Block[] = []
  let n = 0
  for (const b of blocks) {
    if (b.lines > maxLines) {
      if (cur.length) out.push(cur)
      out.push([b])
      cur = []
      n = 0
      continue
    }
    if (n + b.lines > maxLines && cur.length) {
      out.push(cur)
      cur = []
      n = 0
    }
    cur.push(b)
    n += b.lines
  }
  if (cur.length) out.push(cur)
  if (!out.length) out.push([{ text: '', lines: 1 }])
  return out
}

/** 결과 칸 폭(약 7in, 9pt)에서 한 줄에 들어가는 대략 글자수 */
const CPL = 118
const RESULT_MAX = 24
const METHOD_MAX = 11

export function methodBlocks(tc: LguTc): Block[] {
  if (!tc.steps.length) return [{ text: '(시험 절차 없음)', lines: 1 }]
  return tc.steps.map((s, i) => {
    const t = stepTitle(s, i)
    const lines = t
      .split('\n')
      .reduce((a, ln) => a + Math.max(1, Math.ceil((ln.length || 1) / 70)), 0)
    return { text: t, lines }
  })
}

export function resultBlocks(tc: LguTc): Block[] {
  if (!tc.steps.length)
    return [{ text: '시험 결과 데이터 없음 — 시험 실행 후 출력됩니다.', lines: 1 }]
  return tc.steps.map((s, i) => {
    let r = `Step ${i + 1}. ${String(s.desc ?? '').trim() || String(s.cli ?? '').trim()}`
    const sv = stepVerdict(s as TcStep)
    if (sv) r += `  [${sv}]`
    if (s.cli) r += `\n${tc.prompt || '$'} ${s.cli}`
    const o = promptize(String(s.output ?? '').trim(), tc.prompt)
    if (o) r += `\n${o}`
    const lines = r
      .split('\n')
      .reduce((a, ln) => a + Math.max(1, Math.ceil((ln.length || 1) / CPL)), 0)
    return { text: r, lines: lines + 1 }
  })
}

/** 이 TC 가 몇 장이 되나 — 1장(방법) 몇 + 2장(결과) 몇 */
export function slideRanges(tc: LguTc): {
  method: Array<[number, number]>
  result: Array<[number, number]>
} {
  const cut = (blocks: Block[], max: number): Array<[number, number]> => {
    const slices = paginate(blocks, max)
    const out: Array<[number, number]> = []
    let at = 0
    for (const s of slices) {
      out.push([at, at + s.length])
      at += s.length
    }
    return out
  }
  return { method: cut(methodBlocks(tc), METHOD_MAX), result: cut(resultBlocks(tc), RESULT_MAX) }
}

const BD = '1.4px solid #111'
const YEL = 'background:#fcfcc6;'

const th = (t: string, cs = 1) =>
  `<td colspan="${cs}" style="border:${BD};${YEL}text-align:center;font-weight:800;padding:5px 6px;font-size:12.5px;">${t}</td>`
const lbl = (t: string, cs = 1) =>
  `<td colspan="${cs}" style="border:${BD};${YEL}text-align:center;font-weight:800;padding:5px 4px;font-size:11.5px;line-height:1.25;">${t}</td>`
const val = (t: string, cs = 1, extra = '') =>
  `<td colspan="${cs}" style="border:${BD};padding:5px 8px;font-size:11.5px;${extra}">${t}</td>`

const COLG =
  '<colgroup><col style="width:6%"><col style="width:23%"><col style="width:6%"><col style="width:15%"><col style="width:8%"><col style="width:42%"></colgroup>'

const LOGO =
  '<span style="font-family:Arial,Helvetica,sans-serif;font-weight:800;font-size:23px;color:#A50034;letter-spacing:-0.5px;">LG U<span style="color:#E6007E;font-size:15px;vertical-align:super;font-weight:800;">+</span></span>'

/*
 * 머리·바닥은 **고객사 pptx 양식 그대로** 흉내 낸다.
 *
 * 미리보기와 내려받은 파일이 다르게 생기면 「어느 쪽이 진짜냐」 는 말이
 * 나온다 — 양식(머리·바닥·법적 문구)은 파일을 따라가고, 내용은 미리보기
 * 그대로 파일에 실린다. 서로가 서로를 베끼는 방향을 정해 둔 것이다.
 */
const pageHead = (ttl: string) =>
  `<div style="display:flex;align-items:center;justify-content:space-between;padding:0 6px 2px;">` +
  `<div style="font-size:22px;font-weight:800;letter-spacing:4px;color:#111;">${ttl}</div>` +
  `<div style="display:flex;align-items:center;gap:14px;">${LOGO}` +
  `<span style="font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:800;color:#111;">LG U+ Proprietary &amp; Confidential</span>` +
  `</div></div>` +
  `<div style="border-bottom:3px solid #111;"></div><div style="border-bottom:1.4px solid #111;margin-top:2px;margin-bottom:11px;"></div>`

/** 바닥 — 양식의 법적 문구와 쪽번호. 흐름 안에 둔다 —
    절대배치로 띄웠더니 내용이 길면 표 위를 줄이 가로질렀다. */
const pageFoot = (no: number) =>
  `<div style="margin-top:10px;">` +
  `<div style="text-align:right;font-size:12px;color:#111;margin-bottom:2px;">${no}</div>` +
  `<div style="border-top:3px solid #111;"></div><div style="border-top:1.4px solid #111;margin-top:2px;"></div>` +
  `<div style="font-size:9.5px;color:#333;margin-top:4px;">본 문서는 LG U+이 모든 지적재산권을 소유하고 있사오니, 해당 문서를 무단으로 전재/복사/변조/재배포 하지 마시기 바라며, 이를 위반할 경우 모든 법적 책임은 귀사에 있음을 알려드립니다</div>` +
  `</div>`

const headerRow = (tc: LguTc) =>
  '<tr>' +
  lbl('TC_ID') +
  val(esc(tc.tcid), 1, 'font-weight:700;text-align:center;white-space:nowrap;') +
  lbl('REQ<br>ID') +
  val(esc(tc.reqid), 1, 'text-align:center;font-weight:700;white-space:nowrap;') +
  lbl('시험항목') +
  val(esc(tc.name), 1, 'font-weight:700;') +
  '</tr>'

/** 1장 — 시험 절차 */
export function page1(tc: LguTc, range: [number, number]): string {
  const blocks = methodBlocks(tc)
  const method =
    blocks
      .slice(range[0], range[1])
      .map((b) => esc(b.text))
      .join('<br>') || '(시험 절차 없음)'
  const topo = tc.topoImg
    ? `<div style="text-align:center;"><img src="${esc(tc.topoImg)}" style="max-width:100%;max-height:200px;" /></div>`
    : '<div style="color:#9aa0b8;text-align:center;padding-top:60px;">(구성도 없음)</div>'
  return (
    pageHead('시 험 절 차') +
    `<table style="width:100%;border-collapse:collapse;border:${BD};table-layout:fixed;">${COLG}${headerRow(tc)}` +
    '<tr>' + th('시험 규격', 4) + th('시험 구성도 및 준비사항', 2) + '</tr>' +
    '<tr>' +
    val(
      tc.spec ? nl(tc.spec) : '<span style="color:#9aa0b8;">(미작성)</span>',
      4,
      'vertical-align:top;height:210px;line-height:1.55;overflow:hidden;',
    ) +
    val(topo, 2, 'vertical-align:top;overflow:hidden;') +
    '</tr>' +
    '<tr>' + th('시험 방법', 4) + th('시험 결과', 2) + '</tr>' +
    '<tr>' +
    val(method, 4, 'vertical-align:top;height:210px;line-height:1.55;overflow:hidden;') +
    val(
      '<div style="text-align:center;font-weight:700;color:#333;padding-top:80px;">뒷면 참조</div>',
      2,
      'vertical-align:middle;',
    ) +
    '</tr>' +
    '<tr>' + lbl('비고<br>(특이사항)', 2) + val(tc.remark ? nl(tc.remark) : '', 4, 'height:44px;vertical-align:top;') + '</tr>' +
    '</table>'
  )
}

/** 2장 — 시험 결과 */
export function page2(tc: LguTc, range: [number, number]): string {
  const mine = tc.steps.map((s, i) => ({ s, i })).slice(range[0], range[1])
  const body = mine.length
    ? mine
        .map(({ s, i }) => {
          const rc =
            stepVerdict(s as TcStep) === 'Pass' || stepVerdict(s as TcStep) === '합격'
              ? '#00875a'
              : stepVerdict(s as TcStep) === 'Fail' || stepVerdict(s as TcStep) === '불합격'
                ? '#d12d49'
                : '#888'
          const out = promptize(String(s.output ?? '').trim(), tc.prompt)
          return (
            '<div style="margin-bottom:9px;border-bottom:1px dashed #ccc;padding-bottom:7px;">' +
            `<div style="font-size:11.5px;font-weight:700;color:#111;">Step ${i + 1}. ${esc(s.desc || s.cli || s.action || '')}` +
            (stepVerdict(s as TcStep)
              ? ` <span style="color:${rc};font-weight:800;">[${esc(stepVerdict(s as TcStep))}]</span>`
              : '') +
            '</div>' +
            (s.cli
              ? `<div style="font-family:Consolas,monospace;font-size:10px;color:#00733a;margin-top:2px;">${esc(tc.prompt || '$')} ${esc(s.cli)}</div>`
              : '') +
            (out
              ? `<pre style="display:inline-block;max-width:100%;margin:4px 0 0;white-space:pre;overflow-x:auto;font-family:Consolas,monospace;font-size:9px;line-height:1.45;color:#1c2030;background:#f5f6f8;border:1px solid #d8dce3;border-radius:4px;padding:7px 9px;box-sizing:border-box;">${esc(out)}</pre>`
              : '') +
            '</div>'
          )
        })
        .join('')
    : '<div style="color:#9aa0b8;text-align:center;padding-top:60px;">시험 결과 데이터 없음 — 시험 실행 후 출력</div>'
  return (
    pageHead('시 험 결 과') +
    `<table style="width:100%;border-collapse:collapse;border:${BD};table-layout:fixed;">${COLG}${headerRow(tc)}` +
    '<tr>' + th('시험 결과', 6) + '</tr>' +
    '<tr>' + val(body, 6, 'vertical-align:top;height:470px;max-height:470px;overflow:hidden;') + '</tr>' +
    '<tr>' + lbl('비고<br>(특이사항)', 2) + val(tc.remark ? nl(tc.remark) : '', 4, 'height:44px;vertical-align:top;') + '</tr>' +
    '</table>'
  )
}

/** 이 사이클의 슬라이드 전부 — 순서대로 HTML */
export function buildSlides(tcs: LguTc[]): string[] {
  const out: string[] = []
  for (const tc of tcs) {
    const r = slideRanges(tc)
    for (const range of r.method) out.push(page1(tc, range))
    for (const range of r.result) out.push(page2(tc, range))
  }
  // 쪽번호·법적 문구 바닥 — 장 전체 번호는 다 모은 뒤에야 안다
  return out.map((html, i) => `<div>${html}${pageFoot(i + 1)}</div>`)
}
