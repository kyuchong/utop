/**
 * 판의 자리 계산 — **판과 결과서가 같은 셈을 쓴다.**
 *
 * 판에서 자리를 잡아 놓았는데 결과서에는 mermaid 가 제 방식대로 다시
 * 늘어놓은 그림이 실렸다. 두 그림이 다르니 어느 것이 맞는지 알 수가
 * 없었다 — 사람이 손으로 옮겨 놓은 자리가 맞는 자리다.
 *
 * 그래서 자리 셈을 여기 한 벌만 두고, 화면(`TcCanvas`)과 굽는 쪽
 * (`boardShot`)이 같이 쓴다.
 */

export const W = 152
export const H = 56

/** 선이 붙는 자리 — 네 변과 네 모서리, 여덟 군데 */
export const SIDES = ['t', 'tr', 'r', 'br', 'b', 'bl', 'l', 'tl'] as const
export type Side = (typeof SIDES)[number]

/** 변인가 모서리인가 — 모서리는 한 점이라 여럿을 벌려 놓을 수 없다 */
export const isEdge = (s: Side) => s === 'l' || s === 'r' || s === 't' || s === 'b'

/** 그 자리의 좌표. `f` 는 변에서 어디쯤(0~1)인지 — 모서리는 안 쓴다. */
export function edgePt(p: { x: number; y: number }, side: Side, f: number) {
  switch (side) {
    case 'l':
      return { x: p.x, y: p.y + H * f }
    case 'r':
      return { x: p.x + W, y: p.y + H * f }
    case 't':
      return { x: p.x + W * f, y: p.y }
    case 'b':
      return { x: p.x + W * f, y: p.y + H }
    case 'tl':
      return { x: p.x, y: p.y }
    case 'tr':
      return { x: p.x + W, y: p.y }
    case 'bl':
      return { x: p.x, y: p.y + H }
    default:
      return { x: p.x + W, y: p.y + H }
  }
}

/** 그 자리에서 밖으로 나가는 쪽 */
export const AWAY: Record<Side, { x: number; y: number }> = {
  t: { x: 0, y: -1 },
  tr: { x: 0.71, y: -0.71 },
  r: { x: 1, y: 0 },
  br: { x: 0.71, y: 0.71 },
  b: { x: 0, y: 1 },
  bl: { x: -0.71, y: 0.71 },
  l: { x: -1, y: 0 },
  tl: { x: -0.71, y: -0.71 },
}

/** 마주 보는 자리 — 상대 네모는 반대쪽으로 받는다 */
export const FACING: Record<Side, Side> = {
  t: 'b',
  tr: 'bl',
  r: 'l',
  br: 'tl',
  b: 't',
  bl: 'tr',
  l: 'r',
  tl: 'br',
}

/**
 * 상대가 어느 쪽에 있는가 — 여덟 방향 중 하나로.
 *
 * 45도씩 나눈다. 나란히 놓이면 옆구리로, 비스듬하면 모서리로 나간다.
 */
export function sideToward(dx: number, dy: number): Side {
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI // -180 ~ 180, 아래가 +
  const i = Math.round(((deg + 360) % 360) / 45) % 8
  // 0도(오른쪽)부터 시계 방향으로
  const ring: Side[] = ['r', 'br', 'b', 'bl', 'l', 'tl', 't', 'tr']
  return ring[i] ?? 'r'
}

/**
 * 이만큼도 안 떨어져 있으면 포트 이름 둘을 양 끝에 못 나눠 적는다.
 *
 * 네모 둘이 붙어 있으면 그 좁은 틈에 이름이 서로 파고들어 「Gi0/1」 둘이
 * 「Gi0/11」 한 덩어리로 보였다. 위아래로 갈라 봐도 선이 여럿이면 이번엔
 * 다른 선의 이름과 겹친다 — 틈이 좁으면 애초에 자리가 없는 것이다.
 *
 * 그때는 선 하나에 이름 하나로, 「Gi0/1 ↔ Gi0/9」 처럼 붙여 적는다.
 * 왼쪽 것이 왼쪽 장비 포트다.
 */
export const NARROW = 130

/** 포트 이름을 놓을 자리 — 넉넉할 때 양 끝에 나눠 적는 쪽 */
export function portTag(
  side: Side,
  p: { x: number; y: number },
): { x: number; y: number; anchor: 'start' | 'middle' | 'end' } {
  const a = AWAY[side]
  /*
   * **장비에 딱 붙여 적는다.**
   *
   * 선 가운데 쪽으로 밀어 놓았더니 이름이 허공에 떠서 「Te0/7 이 뭐냐」 는
   * 말이 나왔다 — 어느 장비 것인지 알 수가 없다. 실제 구성도는 포트 이름을
   * 그 장비 바로 옆에 적는다. 꽂힌 자리에서 손가락 하나 폭만 띄운다.
   */
  const along = 6
  // 기준선이 글자 아래라 위로 나갈 때는 더 올린다
  const base = a.y < -0.3 ? -3 : a.y > 0.3 ? 11 : -4
  return {
    x: p.x + a.x * along,
    y: p.y + a.y * along + base,
    anchor: a.x > 0.3 ? 'start' : a.x < -0.3 ? 'end' : 'middle',
  }
}

/** 판에 그릴 선 하나 */
export interface BoardLine {
  k: string
  a: string
  b: string
  /** 양 끝의 포트 — 선 가운데가 아니라 **붙는 자리**에 적는다 */
  pa: string
  pb: string
  /** 계측기로 가는 선인가 */
  wire: boolean
  at: number
  /** 사람이 고른 점. 없으면 자리를 보고 정한다 */
  sa?: Side
  sb?: Side
}

export interface Laid {
  l: BoardLine
  sa: Side
  sb: Side
  p1: { x: number; y: number }
  p2: { x: number; y: number }
  /** 그릴 길 — 직각으로 꺾어 간다 */
  d: string
  /** 길의 한가운데. 이름표와 끊는 단추를 여기 둔다 */
  mid: { x: number; y: number }
  /** 그림 테두리를 잡을 때 쓰는 꺾인 자리들 */
  pts: Array<{ x: number; y: number }>
}

/** 이 자리에서 나가는 길이 가로인가 세로인가 */
function axisOf(s: Side, dx: number, dy: number): 'h' | 'v' {
  if (s === 'l' || s === 'r') return 'h'
  if (s === 't' || s === 'b') return 'v'
  // 모서리는 더 먼 쪽을 따른다
  return Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v'
}

/**
 * 직각으로 꺾어 가는 길.
 *
 * 곡선으로 그었더니 랩 구성도라기보다 흐름도처럼 보였다. 실제 배선도는
 * 가로·세로로만 꺾는다 — 어느 선이 어디로 가는지 눈으로 따라가기도
 * 이쪽이 쉽다.
 *
 * 네모에서 조금 곧게 빠져나온 뒤(그루터기) 꺾는다. 바로 꺾으면 선이
 * 네모 모서리에 붙어 어느 자리에서 나온 것인지 안 보인다.
 */
const STUB = 18

function elbow(
  p1: { x: number; y: number },
  sa: Side,
  p2: { x: number; y: number },
  sb: Side,
): { d: string; mid: { x: number; y: number }; pts: Array<{ x: number; y: number }> } {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const a1 = axisOf(sa, dx, dy)
  const a2 = axisOf(sb, -dx, -dy)
  const s1 = { x: p1.x + AWAY[sa].x * STUB, y: p1.y + AWAY[sa].y * STUB }
  const s2 = { x: p2.x + AWAY[sb].x * STUB, y: p2.y + AWAY[sb].y * STUB }

  const pts = [p1, s1]
  if (a1 === 'h' && a2 === 'h') {
    const mx = (s1.x + s2.x) / 2
    pts.push({ x: mx, y: s1.y }, { x: mx, y: s2.y })
  } else if (a1 === 'v' && a2 === 'v') {
    const my = (s1.y + s2.y) / 2
    pts.push({ x: s1.x, y: my }, { x: s2.x, y: my })
  } else if (a1 === 'h') {
    pts.push({ x: s2.x, y: s1.y })
  } else {
    pts.push({ x: s1.x, y: s2.y })
  }
  pts.push(s2, p2)

  // 모서리를 조금 둥글려 준다 — 각진 채로는 인쇄했을 때 톱니처럼 보인다
  const R = 6
  let d = `M${pts[0]!.x},${pts[0]!.y}`
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1]!
    const cur = pts[i]!
    const next = pts[i + 1]!
    const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y)
    const outLen = Math.hypot(next.x - cur.x, next.y - cur.y)
    const r = Math.min(R, inLen / 2, outLen / 2)
    if (r < 1) {
      d += ` L${cur.x},${cur.y}`
      continue
    }
    const ax = cur.x - (cur.x - prev.x) * (r / (inLen || 1))
    const ay = cur.y - (cur.y - prev.y) * (r / (inLen || 1))
    const bx = cur.x + (next.x - cur.x) * (r / (outLen || 1))
    const by = cur.y + (next.y - cur.y) * (r / (outLen || 1))
    d += ` L${ax},${ay} Q${cur.x},${cur.y} ${bx},${by}`
  }
  const last = pts[pts.length - 1]!
  d += ` L${last.x},${last.y}`

  // 길이의 한가운데
  let total = 0
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y)
  let walked = 0
  let mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y)
    if (walked + seg >= total / 2) {
      const t = seg ? (total / 2 - walked) / seg : 0
      mid = {
        x: pts[i - 1]!.x + (pts[i]!.x - pts[i - 1]!.x) * t,
        y: pts[i - 1]!.y + (pts[i]!.y - pts[i - 1]!.y) * t,
      }
      break
    }
    walked += seg
  }
  return { d, mid, pts }
}

/**
 * 선이 붙는 자리를 정한다.
 *
 * 장비 한 대에 선이 셋이면 셋 다 같은 변 한가운데로 몰려서, 어느 선이
 * 어느 포트인지 눈으로 못 가린다. 그래서 두 번 센다 — 먼저 어느 변으로
 * 나갈지 정하고, 그 다음 같은 변을 쓰는 선들을 상대 쪽 자리 순으로
 * 줄 세워 고르게 나눈다. 줄 세우지 않고 나누면 선끼리 엇갈린다.
 */
export function layout(
  lines: BoardLine[],
  posOf: (id: string) => { x: number; y: number },
): Laid[] {
  const ends = lines.map((l) => {
    const A = posOf(l.a)
    const B = posOf(l.b)
    const ac = { x: A.x + W / 2, y: A.y + H / 2 }
    const bc = { x: B.x + W / 2, y: B.y + H / 2 }
    /*
     * 고른 점이 있으면 **그대로 쓴다.**
     *
     * 여태 고른 점은 「여기서 시작한다」 는 신호로만 쓰고, 붙는 자리는
     * 자리를 보고 다시 정했다. 그래서 위쪽 점을 끌어도 선은 옆구리로
     * 나갔다 — 고른 대로 안 되니 고르는 뜻이 없었다.
     */
    const dx = bc.x - ac.x
    const dy = bc.y - ac.y
    const auto = sideToward(dx, dy)
    /*
     * 다만 **등지고 있으면 안 쓴다.**
     *
     * 고른 점을 그대로 밀어붙였더니, 네모를 옮겨 상대가 반대쪽으로 가 버린
     * 선이 오른쪽으로 나갔다가 되돌아왔다. 직각으로 꺾으니 그 되돌아오는
     * 토막이 「어디에도 안 닿은 선 도막」 처럼 보였다 — 구성도가 아니게
     * 된다. 상대를 등지는 자리면 자리를 보고 다시 정한다.
     */
    const towards = (s: Side, ux: number, uy: number) => AWAY[s].x * ux + AWAY[s].y * uy > 0
    const sa = l.sa && towards(l.sa, dx, dy) ? l.sa : auto
    const sb = l.sb && towards(l.sb, -dx, -dy) ? l.sb : FACING[sa]
    return { l, A, B, ac, bc, sa, sb }
  })

  const slots = new Map<string, Array<{ k: string; order: number }>>()
  const claim = (dev: string, side: Side, k: string, order: number) => {
    const key = `${dev}|${side}`
    const arr = slots.get(key) ?? []
    arr.push({ k, order })
    slots.set(key, arr)
  }
  for (const e of ends) {
    if (isEdge(e.sa)) claim(e.l.a, e.sa, e.l.k, e.sa === 'l' || e.sa === 'r' ? e.bc.y : e.bc.x)
    if (isEdge(e.sb)) claim(e.l.b, e.sb, e.l.k, e.sb === 'l' || e.sb === 'r' ? e.ac.y : e.ac.x)
  }
  for (const arr of slots.values()) arr.sort((x, y) => x.order - y.order)
  const fracOf = (dev: string, side: Side, k: string) => {
    const arr = slots.get(`${dev}|${side}`) ?? []
    const i = arr.findIndex((x) => x.k === k)
    return i < 0 ? 0.5 : (i + 1) / (arr.length + 1)
  }

  /** 그 자리가 네모 안인가 — 테두리에 살짝 걸치는 것은 봐준다 */
  const inBox = (q: { x: number; y: number }, n: { x: number; y: number }) =>
    q.x > n.x + 2 && q.x < n.x + W - 2 && q.y > n.y + 2 && q.y < n.y + H - 2

  return ends.map((e) => {
    const build = (sa: Side, sb: Side) => {
      const p1 = edgePt(e.A, sa, fracOf(e.l.a, sa, e.l.k))
      const p2 = edgePt(e.B, sb, fracOf(e.l.b, sb, e.l.k))
      return { sa, sb, p1, p2, ...elbow(p1, sa, p2, sb) }
    }
    let r = build(e.sa, e.sb)
    /*
     * **네모 안에서 꺾이면 다시 잡는다.**
     *
     * 위에서 내려온 선이 상대 네모 안에서 꺾여 옆으로 빠져나왔다가 도로
     * 들어갔다. 네모가 선 위에 얹히니 가운데는 가려지고 삐져나온 토막만
     * 보여서, 「어디에도 안 닿은 선」 이 상자 옆에 붙어 있는 그림이 됐다.
     *
     * 어느 자리가 나쁜지 하나하나 따지는 대신, 그려 보고 꺾인 자리가
     * 네모 속이면 자리를 보고 다시 그린다.
     */
    const bends = r.pts.slice(1, -1)
    if (bends.some((q) => inBox(q, e.A) || inBox(q, e.B))) {
      const auto = sideToward(e.bc.x - e.ac.x, e.bc.y - e.ac.y)
      r = build(auto, FACING[auto])
    }
    return { l: e.l, sa: r.sa, sb: r.sb, p1: r.p1, p2: r.p2, d: r.d, mid: r.mid, pts: r.pts }
  })
}
