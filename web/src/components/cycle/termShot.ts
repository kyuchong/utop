/**
 * 명령과 응답을 **터미널 화면처럼 그려** 그림으로 만든다.
 *
 * 결과서에 CLI 를 글자로 넣으면 두 가지가 무너진다. 하나는 PowerPoint 가
 * 제 폰트로 다시 흘려서 `show interface` 표의 칸이 어긋나는 것 — 고정폭이
 * 아니면 세로줄이 안 맞아 읽을 수가 없다. 다른 하나는 「진짜로 장비에서
 * 본 것」 이라는 느낌이 사라지는 것이다. 고객사 결과서는 증거라서,
 * 검은 화면에 흰 글씨가 그대로 있어야 그것으로 읽힌다.
 *
 * 그래서 캔버스에 직접 그린다. 서버를 거치지 않으므로 결과서를 만드는
 * 동안 기다릴 일이 없고, 글꼴이 없는 기계에서도 같은 그림이 나온다.
 */

/** 한 줄 높이(px)와 글자 크기 — 촘촘하되 인쇄해서 읽을 수 있는 선 */
const FS = 15
const LH = 20
const PAD = 12
/** 한 줄에 담는 글자 수. 넘으면 접는다 — 잘라 버리면 증거가 아니게 된다 */
const COLS = 108

export interface TermLine {
  text: string
  /** 명령 줄(`$ …`) 은 밝게, 응답은 옅게, 판정은 색으로 */
  kind?: 'cmd' | 'out' | 'pass' | 'fail' | 'head'
}

/** 긴 줄을 접는다. 장비 응답에는 200자짜리 줄이 흔하다. */
function wrap(s: string): string[] {
  const out: string[] = []
  for (const raw of String(s ?? '').split(/\r?\n/)) {
    if (raw.length <= COLS) {
      out.push(raw)
      continue
    }
    for (let i = 0; i < raw.length; i += COLS) out.push(raw.slice(i, i + COLS))
  }
  return out
}

/**
 * 줄들을 터미널 그림(PNG data URL)으로.
 *
 * 되돌려 주는 높이는 **그림의 실제 비율**이다. 부르는 쪽이 그것으로 칸에
 * 맞춰 넣는다 — 비율을 안 맞추면 글자가 늘어나 읽기 나쁘다.
 */
/** 창틀 높이 — 제목줄이 있어야 「캡처한 화면」 으로 읽힌다 */
const BAR = 26

export function termShot(
  lines: TermLine[],
  title = '',
): { data: string; w: number; h: number } | null {
  const rows: TermLine[] = []
  for (const ln of lines) {
    for (const t of wrap(ln.text)) rows.push({ text: t, kind: ln.kind })
  }
  if (!rows.length) return null

  const cv = document.createElement('canvas')
  // 2배로 그려 축소한다. 그대로 그리면 인쇄했을 때 글자가 뭉갠다.
  const S = 2
  /* 폭은 내용만큼만 — 108칸 고정으로 그리니 짧은 출력도 빈 판을 통째로
     차지했다(지적: 너무 많이 표시). 접는 한계(COLS)까지만 늘어난다. */
  const maxLen = Math.min(
    COLS,
    Math.max(24, ...rows.map((r) => r.text.length), Math.ceil(title.length * 1.4)),
  )
  const w = PAD * 2 + maxLen * (FS * 0.6)
  const h = BAR + PAD * 2 + rows.length * LH
  cv.width = Math.ceil(w * S)
  cv.height = Math.ceil(h * S)
  const g = cv.getContext('2d')
  if (!g) return null
  g.scale(S, S)

  /*
   * 흰 바탕 + 테두리 — 검은 터미널 화면 그대로 넣었더니 「출력하면 토너
   * 낭비」(지적). 증거 느낌은 창틀·고정폭·프롬프트가 지킨다.
   */
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, w, h)

  /* 창틀 — 제목줄과 창 단추가 있어야 사람이 찍은 화면으로 읽힌다 */
  g.fillStyle = '#f1f3f6'
  g.fillRect(0, 0, w, BAR)
  g.fillStyle = '#d5dae1'
  g.fillRect(0, BAR - 1, w, 1)
  const dots = ['#ff5f56', '#ffbd2e', '#27c93f']
  dots.forEach((c, i) => {
    g.beginPath()
    g.arc(14 + i * 16, BAR / 2, 5, 0, Math.PI * 2)
    g.fillStyle = c
    g.fill()
  })
  if (title) {
    g.font = `12px "Malgun Gothic", sans-serif`
    g.fillStyle = '#5b6470'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(title, w / 2, BAR / 2)
    g.textAlign = 'left'
  }

  g.font = `${FS}px "D2Coding", "Consolas", "DejaVu Sans Mono", monospace`
  g.textBaseline = 'top'
  rows.forEach((ln, i) => {
    g.fillStyle =
      ln.kind === 'cmd'
        ? '#1f5fa8'
        : ln.kind === 'pass'
          ? '#1d9e75'
          : ln.kind === 'fail'
            ? '#d12d49'
            : ln.kind === 'head'
              ? '#8a5a00'
              : '#222222'
    g.fillText(ln.text, PAD, BAR + PAD + i * LH)
  })

  // 창 테두리 — 흰 장표 위에서 화면의 가장자리가 보이게
  g.strokeStyle = '#8a939c'
  g.lineWidth = 1
  g.strokeRect(0.5, 0.5, w - 1, h - 1)

  return { data: cv.toDataURL('image/png'), w, h }
}

/** 스텝 하나를 터미널 줄들로. 결과서에서 읽는 차례 그대로. */
export function stepLines(
  step: { desc?: unknown; cli?: unknown; output?: unknown },
  no: number,
  verdict: string,
  /** CLI 프롬프트 — 장비 이름(#). 없으면 $ */
  prompt = '$',
): TermLine[] {
  const out: TermLine[] = []
  const desc = String(step.desc ?? '').trim()
  const cli = String(step.cli ?? '').trim()
  out.push({
    text: `Step ${no}. ${desc || cli}${verdict ? `  [${verdict}]` : ''}`,
    kind: verdict === 'Fail' || verdict === '불합격' ? 'fail' : verdict ? 'pass' : 'head',
  })
  if (cli) for (const c of cli.split(/\r?\n/)) out.push({ text: `${prompt} ${c}`, kind: 'cmd' })
  const o = String(step.output ?? '').trim()
  if (o)
    for (const l of o.split(/\r?\n/))
      out.push({
        // 옛 기록의 `$ ` 는 우리가 박은 것 — 장비 이름으로 갈아 끼운다
        text: prompt !== '$' && l.startsWith('$ ') ? prompt + l.slice(1) : l,
        kind: l.startsWith('$ ') ? 'cmd' : 'out',
      })
  return out
}
