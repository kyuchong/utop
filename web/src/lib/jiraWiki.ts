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
  /** 같은 뜻의 다른 이름 — 사이클 화면의 스텝은 이 이름으로 담긴다.
      둘 다 받아 두지 않으면 창에서 만든 글에만 까닭이 빠진다. */
  reason?: string
}

/** 깨진 까닭 — 부르는 이름이 두 가지라 한 곳에서 고른다 */
const whyOf = (s: WikiStep): string => String(s.rca ?? s.reason ?? '').trim()

/** 여덟 판 — 번호·제목은 Jira 에 그대로 나간다 */
export const WIKI_PANELS: Array<{ k: string; title: string }> = [
  { k: 'symptom', title: '1. 현상' },
  { k: 'topo', title: '2. 시험구성도' },
  { k: 'steps', title: '3. 시험절차' },
  { k: 'detail', title: '4. 시험내역' },
  /* 「OS 버전」 판은 걷었다(지시) — OS 는 Jira 의 **필드**(OS 시험버전
     (최초))로 올라간다. 본문에도 두면 같은 값을 두 자리에 적게 된다. */
  { k: 'config', title: '5. Configuration File (Config File)' },
  { k: 'core', title: '6. Core File (Upload Core file)' },
  { k: 'kernel', title: '7. Kernel Log & Syslog 조회' },
  { k: 'attach', title: '8. 첨부파일' },
]

/**
 * **시험절차** — 스텝 설명만 차례대로(지시).
 *
 * 예전에는 시험 항목으로 가는 주소 한 줄이었다. 링크는 늘 지금 것을 보여
 * 주지만, 이슈를 여는 사람은 대개 UTOP 계정이 없다 — 누르면 로그인 화면만
 * 본다. 그래서 「무엇을 어떤 차례로 했나」 는 이슈 안에 적는다.
 *
 * 명령·출력·판정은 적지 않는다. 그건 「4. 시험내역」 이 맡는다 — 한 이야기를
 * 두 판에 나눠 적으면 어느 쪽이 정본인지 알 수 없다.
 */
export function procFromSteps(steps: WikiStep[]): string {
  const L: string[] = []
  for (const s of steps) {
    const what = String(s.desc ?? '').trim() || String(s.cli ?? '').trim()
    if (!what) continue
    L.push(`${L.length + 1}) ${what.replace(/\r?\n/g, ' ').trim()}`)
  }
  return L.join('\n')
}

/**
 * **시험내역** — 친 명령·나온 값·판정(지시).
 *
 * 세 가지를 **이름을 붙여** 적는다. 이름 없이 늘어놓으면 어디까지가 장비가
 * 뱉은 것이고 어디부터가 우리 판단인지 읽는 사람이 가려내야 한다.
 */
export function detailFromSteps(steps: WikiStep[]): string {
  const L: string[] = []
  let n = 0
  for (const s of steps.slice(0, 20)) {
    const what = String(s.desc ?? '').trim() || String(s.cli ?? '').trim()
    const cli = String(s.cli ?? '').trim()
    const out0 = String(s.output ?? '').trim()
    n += 1
    /* **아무것도 없는 스텝은 적지 않는다** — 설명도 명령도 출력도 까닭도 없이
       판정만 붙은 껍데기가 섞이는데, 그대로 적으면 「판정: FAIL」 만 덩그러니
       선 줄이 이슈를 채운다. */
    if (!what && !cli && !out0 && !whyOf(s)) continue
    /* **스텝 번호를 그대로 쓴다.** 절차 판은 설명 없는 스텝을 건너뛰어 번호를
       다시 매기므로, 여기까지 다시 매기면 두 판의 3번이 서로 다른 것을
       가리킨다. 여기 번호는 시험 항목의 그 번호다(＃로 구분). */
    L.push(`*#${s.no ?? n}${what ? ` ${what}` : ''}*`)
    if (cli) L.push(`CLI: {{${cli.replace(/\r?\n/g, ' ').trim()}}}`)
    if (out0) {
      L.push('결과값:')
      L.push('{noformat}')
      L.push(out0.slice(0, 1500))
      L.push('{noformat}')
    } else {
      L.push('결과값: （없음）')
    }
    /* 판정은 **제 줄에 선다.** 스텝 이름 옆에 작게 붙여 두면 스무 줄짜리
       출력 위에 묻혀, 무엇이 깨졌는지 눈으로 좇아야 한다. */
    const st = String(s.status ?? '').trim()
    const mark = /^(pass|합격)$/i.test(st) ? '(/) ' : /^(fail|불합격)$/i.test(st) ? '(x) ' : ''
    const why = whyOf(s)
    L.push(`판정: ${mark}${st || '미실행'}${why ? ` — ${why.replace(/\r?\n/g, ' ')}` : ''}`)
    L.push('')
  }
  return L.join('\n').trim()
}

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
    const why0 = whyOf(s)
    if (why0 && (vrd === 'Fail' || vrd === '불합격')) {
      L.push(`{color:#c0392b}RCA: ${why0.replace(/\r?\n/g, ' ')}{color}`)
    }
    return L.join('\n')
  })
  return blocks.join('\n----\n')
}


/**
 * `show running-config` 를 찍은 스텝의 출력 — 5번 판의 자동 채움.
 *
 * 설정 파일을 따로 보관하는 곳은 없다. 있다면 시험 중에 장비에서 그대로
 * 찍어 온 그 출력이다. 그러니 **명령으로 찾는다**: `show running-config`,
 * 줄여 친 `sh run` 까지 본다(현장에서는 줄여 친다).
 *
 * 여러 번 찍었으면 **마지막 것**을 쓴다 — 설정을 바꿔 가며 시험하므로,
 * 깨졌을 때의 설정은 마지막에 찍은 쪽이다.
 */
export function configFromSteps(steps: WikiStep[]): string {
  const re = /\bsh(?:o(?:w)?)?\s+run(?:n(?:ing)?)?(?:-config)?\b/i
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i]!
    if (!re.test(String(s.cli ?? ''))) continue
    const out = String(s.output ?? '').trim()
    if (out) return out
  }
  return ''
}

/** 비면 「없음」 이라고 적는 판 — 자료가 없는 것이 예사인 뒤쪽 네 판(지시) */
const NONE_PANELS = new Set(['config', 'core', 'kernel', 'attach'])

/**
 * 여덟 판을 Jira 설명으로 편다.
 *
 * 「3. 시험절차」 는 사람이 손댄 글이 있으면 그것을, 없으면 스텝에서
 * 만든 것을 쓴다 — 자동으로 채워 주는 판이라 손을 안 댔다고 빼면 안 된다.
 * 빈 판도 제목은 남긴다: 「여긴 아직 안 적었다」 와 「그런 항목이 없다」 는
 * 읽는 사람에게 다른 뜻이다.
 */
export function buildDefectWiki(
  panels: Record<string, string>,
  steps: WikiStep[],
  opts?: { image?: boolean; config?: string },
): string {
  return WIKI_PANELS.map(({ k, title }) => {
    let body = String(panels[k] ?? '').trim()
    /* 「3. 시험절차」 는 **스텝 설명만 차례대로**다(지시). 시험 항목 주소
       한 줄이던 때는, 이슈를 받은 사람이 UTOP 계정이 없어 아무 데도 못 갔다. */
    if (k === 'steps' && !body && steps.length) body = procFromSteps(steps)
    /* 「4. 시험내역」 은 **CLI·결과값·판정**이다(지시) */
    if (k === 'detail' && !body && steps.length) body = detailFromSteps(steps)
    /* 설정 파일 — **파일로 붙인다**(지시). 수천 줄을 본문에 쏟으면 이슈를
       읽을 수가 없고, Jira 가 접어 주더라도 검색·내려받기가 안 된다.
       등록할 때 running-config.txt 로 올리고 여기서는 그 이름을 부른다. */
    if (k === 'config' && !body && opts?.config) {
      body = '[^running-config.txt]\n시험 당시의 show running-config 입니다.'
    }
    /* 구성도 — 그림은 이슈에 첨부로 올리고 여기서는 그 이름을 부른다.
       **글을 적어도 그림은 그대로 선다**(지적: 텍스트를 넣으면 미리보기에서
       그림이 사라진다). 둘은 고르는 것이 아니라 함께 가는 것이다 — 적은
       글 다음에 그림을 둔다(왼쪽 편집칸과 같은 차례). */
    if (k === 'topo' && opts?.image) body = body ? `${body}\n!구성도.png|thumbnail!` : '!구성도.png|thumbnail!'
    /* **5~8 은 비면 「없음」**(지시).
       앞 네 판은 이 결함이 무엇인지 말하는 자리라 비어 있으면 「아직 안
       적었다」 는 뜻이지만, 뒤 네 판은 「그런 자료가 없다」 가 대부분이다 —
       코어 파일이 없는 결함이 훨씬 많다. 두 뜻을 같은 말로 적으면, 읽는
       사람이 「빠뜨린 것인가」 를 매번 되묻게 된다. */
    if (!body) body = NONE_PANELS.has(k) ? '없음' : '（내용 없음）'
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

export function wikiToHtml(txt: string, imgs?: Record<string, string>): string {
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
    /* **그림**(!구성도.png|thumbnail!) — 표기를 글자 그대로 보이면 무엇이
       올라가는지 알 수 없다(지적). 등록할 때 붙는 파일임을 말해 준다.
       미리보기는 아직 안 올라간 파일을 그릴 수 없으니 이름과 함께 세운다. */
    s = s.replace(/!([^!|\s]+)(\|[^!]*)?!/g, (_m, nm: string) => {
      /* 창에서 붙인 그림은 **그대로 보여 준다** — 이름만 서 있으면 무엇을
         올리는지 모른다. 아직 못 가진 그림(구성도 따위)은 이름으로. */
      const u = imgs?.[nm]
      return u
        ? `<span class="jw-shot"><img src="${escH(u)}" alt="${escH(nm)}"><em>${escH(nm)}</em></span>`
        : `<span class="jw-img">🖼 ${escH(nm)}<em>등록할 때 첨부됩니다</em></span>`
    })
    /* **첨부**([^running-config.txt]) — 등록할 때 붙는 파일이다 */
    s = s.replace(/\[\^([^\]]+)\]/g, (_m, nm: string) =>
      `<span class="jw-img">📎 ${escH(nm)}<em>등록할 때 첨부됩니다</em></span>`)
    /* **링크**([보일 글|주소] · [주소]) — 시험 항목으로 가는 길이 여기 온다 */
    s = s.replace(/\[([^\]|]+)\|(https?:\/\/[^\]]+)\]/g,
      (_m, t: string, u: string) => `<a class="jw-a" href="${escH(u)}" target="_blank" rel="noreferrer">${escH(t)}</a>`)
    s = s.replace(/\[(https?:\/\/[^\]]+)\]/g,
      (_m, u: string) => `<a class="jw-a" href="${escH(u)}" target="_blank" rel="noreferrer">${escH(u)}</a>`)
    /* {{명령}} — Jira 는 이것을 고정폭 글꼴로 그린다. 우리가 안 그리면
       미리보기에만 중괄호가 그대로 보여, 올라갈 글과 달라 보인다(지적). */
    s = s.replace(/\{\{([^}]+)\}\}/g, '<code class="jw-c">$1</code>')
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
