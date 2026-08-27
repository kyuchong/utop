/**
 * Jira 위키 마크업 — 만들기(build)와 그리기(render).
 *
 * 핵심은 하나다: **미리보기와 실제로 올라가는 글이 같은 함수에서 나온다.**
 * 두 곳에서 따로 만들면 화면에서 본 것과 Jira 에 남은 것이 달라지고, 그
 * 어긋남은 이슈를 연 사람이 아니라 그걸 읽는 개발자가 먼저 겪는다.
 *
 * 옛 UTOP(05-stc-rack.js)의 _jiBuildDesc · _jiraWikiToHtml 을 옮겨 왔다.
 */

export interface WikiStep {
  no?: number | string
  /** 무엇을 하는 스텝인가 */
  desc?: string
  /** 보낸 명령 */
  cli?: string
  /** 판정 기준 */
  criteria?: string
  /** 실제 출력 */
  output?: string
  /** Pass · Fail · 빈 값(미실행) */
  status?: string
  /** 왜 깨졌나 — Fail 일 때만 쓴다 */
  rca?: string
}

/** 여섯 판 — 번호·제목은 Jira 에 그대로 나간다 */
export const WIKI_PANELS: Array<{ k: string; title: string }> = [
  { k: 'req', title: '1. 관련 근거' },
  { k: 'purpose', title: '2. 목적' },
  { k: 'pre', title: '3. 사전 준비 조건' },
  { k: 'topo', title: '4. 시험 구성도' },
  { k: 'steps', title: '5. 시험 절차 및 결과' },
  { k: 'kernel', title: '6. Kernel Log & Syslog' },
]

/** 스텝을 위키 블록으로 — 판정 표시는 Jira 가 아는 (/) (x) (?) 를 쓴다 */
export function stepsToWiki(steps: WikiStep[]): string {
  const blocks = steps.map((s, i) => {
    const vrd = String(s.status ?? '')
    const mark =
      vrd === 'Pass' || vrd === '합격'
        ? '(/) Pass'
        : vrd === 'Fail' || vrd === '불합격'
          ? '(x) Fail'
          : '(?) 미실행'
    const L: string[] = []
    L.push(`${s.no ?? i + 1}) ${s.desc || s.cli || ''}   ${mark}`)
    if (s.cli) {
      L.push('{color:#8a93a5}TEST DATA{color}')
      L.push(s.cli)
    }
    L.push('{color:#8a93a5}기대 결과{color}')
    L.push(s.criteria ? `{color:#00875a}${s.criteria}{color}` : '—')
    L.push('{color:#8a93a5}실제 결과{color}')
    const out = String(s.output ?? '').trim()
    if (out) {
      L.push('{noformat}')
      L.push(out.slice(0, 3000))
      L.push('{noformat}')
    } else {
      L.push('（미실행）')
    }
    if (s.rca && (vrd === 'Fail' || vrd === '불합격')) {
      L.push(`{color:#c0392b}RCA: ${String(s.rca).replace(/\r?\n/g, ' ')}{color}`)
    }
    return L.join('\n')
  })
  return blocks.join('\n----\n')
}

/**
 * 여섯 판을 Jira 설명으로 편다.
 *
 * 「5. 시험 절차 및 결과」 는 사람이 손댄 글이 있으면 그것을, 없으면 스텝에서
 * 만든 것을 쓴다 — 자동으로 채워 주는 판이라 손을 안 댔다고 빼면 안 된다.
 * 빈 판도 제목은 남긴다: 「여긴 아직 안 적었다」 와 「그런 항목이 없다」 는
 * 읽는 사람에게 다른 뜻이다.
 */
export function buildDefectWiki(
  panels: Record<string, string>,
  steps: WikiStep[],
  opts?: { image?: boolean },
): string {
  return WIKI_PANELS.map(({ k, title }) => {
    let body = String(panels[k] ?? '').trim()
    if (k === 'steps' && !body && steps.length) body = stepsToWiki(steps)
    if (k === 'topo' && opts?.image) body = `!구성도.png|thumbnail!\n${body}`
    if (!body) body = '（내용 없음）'
    return `{panel:title=${title}}\n${body}\n{panel}`
  }).join('\n\n')
}

/* ── 그리기 ────────────────────────────────────────────────────
   Jira 가 실제로 보여 줄 모양에 가깝게 그린다. 위키 글자 그대로 두면
   {panel:title=…} 같은 표식이 그대로 보여, 무엇이 올라가는지 알기 어렵다. */

const escH = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

const pre = (buf: string[]) =>
  `<pre class="jw-pre">${buf.map(escH).join('\n')}</pre>`

export function wikiToHtml(txt: string): string {
  if (!txt) return ''
  const lines = String(txt).split('\n')
  const out: string[] = []
  let inNf = false
  let nfBuf: string[] = []
  let inCode = false
  let codeBuf: string[] = []

  for (const ln of lines) {
    if (/^\{noformat[^}]*\}/.test(ln) && !inCode && !inNf) {
      inNf = true
      nfBuf = []
      continue
    }
    if (inNf) {
      if (ln.trim() === '{noformat}') {
        out.push(pre(nfBuf))
        inNf = false
        nfBuf = []
      } else nfBuf.push(ln)
      continue
    }
    const mCi = ln.match(/^\{code[^}]*\}([\s\S]*)\{code\}$/)
    if (mCi && !inCode) {
      out.push(pre([mCi[1] ?? '']))
      continue
    }
    if (/^\{code[^}]*\}/.test(ln) && !inCode) {
      inCode = true
      codeBuf = []
      continue
    }
    if (inCode) {
      if (ln.trim() === '{code}') {
        out.push(pre(codeBuf))
        inCode = false
        codeBuf = []
      } else codeBuf.push(ln)
      continue
    }
    const mp = ln.match(/^\{panel:title=([^}]*)\}$/)
    if (mp) {
      out.push(`<div class="jw-panel"><div class="jw-panel-h">${escH(mp[1])}</div><div class="jw-panel-b">`)
      continue
    }
    if (/^\{panel\}$/.test(ln.trim())) {
      out.push('</div></div>')
      continue
    }
    if (/^----$/.test(ln.trim())) {
      out.push('<hr class="jw-hr">')
      continue
    }
    if (!ln.trim()) {
      out.push('<div class="jw-gap"></div>')
      continue
    }
    let s = escH(ln)
    s = s.replace(/\*([^*]+)\*/g, '<b>$1</b>')
    s = s.replace(/\(\/\)/g, '<span class="jw-ok">✔</span>')
    s = s.replace(/\(x\)/g, '<span class="jw-ng">✘</span>')
    s = s.replace(/\(\?\)/g, '<span class="jw-na">?</span>')
    s = s.replace(/\{color:(#[0-9a-fA-F]{3,8})\}([\s\S]*?)\{color\}/g, '<span style="color:$1">$2</span>')
    out.push(`<div class="jw-ln">${s}</div>`)
  }
  if (inNf && nfBuf.length) out.push(pre(nfBuf))
  if (inCode && codeBuf.length) out.push(pre(codeBuf))
  return out.join('')
}
