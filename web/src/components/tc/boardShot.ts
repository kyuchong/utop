import type { Device } from '@/pages/Devices'
import { deviceShort, isMeter, meterKind } from './device'
import { H, NARROW, W, layout, portTag, type BoardLine, type Side } from './board'
import { svgToPng, type Shot } from './wireMermaid'
import type { TcPortLink, TcWire } from './types'

/**
 * 판을 **그대로** SVG 로.
 *
 * mermaid 가 그리던 구성도는 판과 다른 그림이었다. 사람이 판에서 자리를
 * 잡아 놓았는데 결과서에는 제 방식대로 다시 늘어놓은 그림이 실리니,
 * 어느 것이 맞는지 알 수가 없었다.
 *
 * 판의 자리가 맞는 자리다. 화면에 보이는 그 네모, 그 선, 그 포트 이름을
 * 같은 셈(`board.ts`)으로 다시 그린다 — 화면과 결과서가 어긋날 자리가
 * 없다.
 *
 * 화면을 통째로 떠 오지 않고 다시 그리는 데는 까닭이 있다. 판의 네모는
 * HTML 이라, 그림으로 구우려면 `foreignObject` 로 감싸야 하는데 그것은
 * `<img>` 로 읽는 순간 그려지지 않는다 — 네모만 남고 글자가 사라진다.
 */

export interface BoardInput {
  devices: Device[]
  wiring: TcWire[]
  links: TcPortLink[]
  sessions: string[]
  placed: Array<{ dev: string; x: number; y: number }>
}

const esc = (s: string) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

/** 종이에 얹을 색. 화면보다 진하게 — 옅은 회색은 인쇄하면 사라진다. */
const INK = {
  line: '#5a636d',
  wire: '#2b5fb8',
  edge: '#333a44',
  meterEdge: '#5b7fd4',
  meterFill: '#eef4ff',
  text: '#111820',
  sub: '#5a636d',
}

const FONT = '"Malgun Gothic", "맑은 고딕", sans-serif'

/** 글자 하나 — 흰 테를 둘러 선 위에서도 읽히게 */
function label(x: number, y: number, txt: string, anchor: string, size: number, bold = false) {
  const common = `x="${x}" y="${y}" text-anchor="${anchor}" font-family='${FONT}' font-size="${size}"${
    bold ? ' font-weight="700"' : ''
  }`
  return (
    `<text ${common} fill="#fff" stroke="#fff" stroke-width="3.5" stroke-linejoin="round">${esc(txt)}</text>` +
    `<text ${common} fill="${INK.text}">${esc(txt)}</text>`
  )
}

export function boardSvg(g: BoardInput): string {
  const byId = new Map(g.devices.map((d) => [d.id, d]))
  const devOf = (w: TcWire) => w.dev || g.sessions[w.session] || ''
  const on = new Set(g.placed.map((p) => p.dev))
  const posOf = (id: string) => g.placed.find((p) => p.dev === id) ?? { x: 0, y: 0 }

  const lines: BoardLine[] = []
  g.wiring.forEach((w, i) => {
    if (on.has(devOf(w)) && on.has(w.meter))
      lines.push({
        k: `w${i}`, a: devOf(w), b: w.meter, pa: w.port, pb: w.meterPort, wire: true, at: i,
        sa: w.side as Side | undefined, sb: w.meterSide as Side | undefined,
      })
  })
  g.links.forEach((l, i) => {
    if (on.has(l.a.dev) && on.has(l.b.dev))
      lines.push({
        k: `l${i}`, a: l.a.dev, b: l.b.dev, pa: l.a.port, pb: l.b.port, wire: false, at: i,
        sa: l.a.side as Side | undefined, sb: l.b.side as Side | undefined,
      })
  })

  // 그린 것을 다 감싸는 테두리. 판은 왼쪽 위가 비어 있는 일이 흔한데,
  // 그대로 구우면 결과서에 빈 여백이 절반이다.
  const PAD = 42
  const laid = layout(lines, posOf)
  const xs = g.placed.flatMap((p) => [p.x, p.x + W])
  const ys = g.placed.flatMap((p) => [p.y, p.y + H])
  // 선도 센다. 네모만 세었더니 윗변·아랫변끼리 이은 곡선이 테두리 밖으로
  // 부풀어 머리가 잘린 채로 결과서에 실렸다.
  for (const e of laid) {
    for (const q of e.pts) {
      xs.push(q.x)
      ys.push(q.y)
    }
  }
  if (!xs.length) return ''
  const x0 = Math.min(...xs) - PAD
  const y0 = Math.min(...ys) - PAD
  const w = Math.max(...xs) - x0 + PAD
  const h = Math.max(...ys) - y0 + PAD

  const out: string[] = []
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w)}" height="${Math.round(h)}" ` +
      `viewBox="${x0} ${y0} ${Math.round(w)} ${Math.round(h)}">`,
  )
  out.push(`<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#fff"/>`)

  // 선이 먼저 — 네모가 그 위에 얹혀야 선 끝이 네모 밑으로 숨는다
  for (const e of laid) {
    const c = e.l.wire ? INK.wire : INK.line
    out.push(
      `<path d="${e.d}" fill="none" stroke="${c}" stroke-width="${e.l.wire ? 2 : 1.6}" ` +
        `stroke-linejoin="round" stroke-linecap="round"/>`,
    )
  }

  let no = 0
  for (const p of g.placed) {
    no += 1
    const d = byId.get(p.dev)
    const meter = d ? isMeter(d) : false
    const cx = p.x + W / 2
    out.push(
      `<rect x="${p.x}" y="${p.y}" width="${W}" height="${H}" rx="${meter ? 14 : 6}" ` +
        `fill="${meter ? INK.meterFill : '#fff'}" stroke="${meter ? INK.meterEdge : INK.edge}" stroke-width="1.4"/>`,
    )
    const nm = d ? deviceShort(d) : p.dev
    const sub = [d?.ip || p.dev, d?.lab].filter(Boolean).join(' · ')
    const kind = meter
      ? [meterKind(d as Device) === 'stc' ? 'STC' : 'N2X', d?.vendor].filter(Boolean).join(' · ')
      : [d?.role, d?.vendor].filter(Boolean).join(' · ')
    // 번호 배지 — 판과 같은 「#1」. 목록·말과 그림을 잇는 이름표다.
    out.push(
      `<rect x="${p.x + 5}" y="${p.y + 4}" width="22" height="13" rx="6.5" ` +
        `fill="${meter ? '#dbe7ff' : '#eef1f5'}"/>`,
    )
    out.push(
      `<text x="${p.x + 16}" y="${p.y + 14}" text-anchor="middle" font-family='${FONT}' ` +
        `font-size="8.5" font-weight="700" fill="${INK.meterEdge}">#${no}</text>`,
    )
    out.push(
      `<text x="${cx}" y="${p.y + 24}" text-anchor="middle" font-family='${FONT}' font-size="13" ` +
        `font-weight="700" fill="${INK.text}">${esc(nm)}</text>`,
    )
    out.push(
      `<text x="${cx}" y="${p.y + 39}" text-anchor="middle" font-family='${FONT}' font-size="10.5" ` +
        `fill="${INK.sub}">${esc(sub)}</text>`,
    )
    if (kind) {
      out.push(
        `<text x="${cx}" y="${p.y + 53}" text-anchor="middle" font-family='${FONT}' font-size="9.5" ` +
          `fill="${meter ? INK.meterEdge : INK.sub}" font-weight="700">${esc(kind)}</text>`,
      )
    }
  }

  // 포트 이름은 **맨 나중에** — 네모까지 다 그린 위에 얹는다. 알약이 네모
  // 밑에 깔려 반쯤 잘린 채 나온 적이 있다.
  for (const e of laid) {
    const gap = Math.hypot(e.p2.x - e.p1.x, e.p2.y - e.p1.y)
    if (gap < NARROW) {
      // 틈이 좁으면 자리가 없다 — 선 가운데 알약 하나로
      const txt = `${e.l.pa} ↔ ${e.l.pb}`
      const w2 = txt.length * 6.2 + 16
      out.push(
        `<rect x="${e.mid.x - w2 / 2}" y="${e.mid.y - 10}" width="${w2}" height="18" rx="9" ` +
          `fill="#fff" stroke="${INK.wire}" stroke-width="1"/>`,
      )
      out.push(
        `<text x="${e.mid.x}" y="${e.mid.y + 3}" text-anchor="middle" font-family='${FONT}' ` +
          `font-size="11" font-weight="700" fill="${INK.wire}">${esc(txt)}</text>`,
      )
      continue
    }
    const tag = (s: Side, p: { x: number; y: number }, txt: string) => {
      if (!txt) return
      const at = portTag(s, p)
      out.push(label(at.x, at.y, txt, at.anchor, 11, true))
    }
    tag(e.sa, e.p1, e.l.pa)
    tag(e.sb, e.p2, e.l.pb)
  }

  out.push('</svg>')
  return out.join('')
}

/** 판 → 그림 한 방에. 판에 놓인 것이 없으면 null. */
export async function boardShot(g: BoardInput, scale = 2): Promise<Shot | null> {
  const svg = boardSvg(g)
  if (!svg) return null
  return svgToPng(svg, scale)
}
