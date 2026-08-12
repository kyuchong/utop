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
 * 포트 이름을 놓을 자리.
 *
 * 두 네모가 붙어 있으면 양쪽 이름이 그 좁은 틈으로 서로 파고들어
 * 「Gi0/1」 둘이 「Gi0/11」 한 덩어리로 보였다. 가까우면 선을 사이에 두고
 * 위·아래(세로로 이었으면 좌·우)로 갈라 놓는다.
 */
export function portTag(
  side: Side,
  p: { x: number; y: number },
  gap: number,
  first: boolean,
): { x: number; y: number; anchor: 'start' | 'middle' | 'end' } {
  const a = AWAY[side]
  const along = Math.max(8, Math.min(13, gap * 0.28))
  // 기준선이 글자 아래라 위로 나갈 때는 더 올린다
  const base = a.y < -0.3 ? -2 : a.y > 0.3 ? 10 : 4
  const push = gap < 120 ? (first ? 9 : -9) : 0
  /*
   * 밀어내는 쪽은 **세상 기준**으로 고정한다.
   *
   * 나가는 쪽을 기준으로 잡았더니(`-a.y, a.x`) 양 끝의 변이 서로 반대라
   * 방향도 같이 뒤집혀, 위아래로 갈라 놓은 둘이 도로 같은 줄에 앉았다.
   * 옆으로 이은 선이면 위·아래로, 위아래로 이은 선이면 좌·우로.
   */
  const perp = Math.abs(a.x) >= Math.abs(a.y) ? { x: 0, y: 1 } : { x: 1, y: 0 }
  return {
    x: p.x + a.x * along + perp.x * push,
    y: p.y + a.y * along + perp.y * push + base,
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
}

export interface Laid {
  l: BoardLine
  sa: Side
  sb: Side
  p1: { x: number; y: number }
  p2: { x: number; y: number }
  c1: { x: number; y: number }
  c2: { x: number; y: number }
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
    const sa = sideToward(bc.x - ac.x, bc.y - ac.y)
    return { l, A, B, ac, bc, sa, sb: FACING[sa] }
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

  return ends.map((e) => {
    const p1 = edgePt(e.A, e.sa, fracOf(e.l.a, e.sa, e.l.k))
    const p2 = edgePt(e.B, e.sb, fracOf(e.l.b, e.sb, e.l.k))
    const k = Math.max(28, Math.hypot(p2.x - p1.x, p2.y - p1.y) / 3)
    const out = (s: Side, p: { x: number; y: number }) => ({
      x: p.x + AWAY[s].x * k,
      y: p.y + AWAY[s].y * k,
    })
    return { l: e.l, sa: e.sa, sb: e.sb, p1, p2, c1: out(e.sa, p1), c2: out(e.sb, p2) }
  })
}
