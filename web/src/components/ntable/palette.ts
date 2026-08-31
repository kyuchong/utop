/**
 * 값 색 팔레트 — **정적 매핑**(스펙 5장). 색은 옵션 정의에 색 이름으로만
 * 저장하고, 실제 색값은 여기서 찾는다. 행마다 색을 담지 않는다.
 */
export interface Paint { bg: string; fg: string; dot: string; label: string }

export const PALETTE: Record<string, Paint> = {
  /* 노션과 같은 열 가지 — 이름도 그대로 쓴다(지시: 화면을 잘 보라) */
  default: { bg: '#f6f5f4', fg: '#57534e', dot: '#c8c4c0', label: '기본' },
  gray: { bg: '#f1f1ef', fg: '#5f5e5b', dot: '#9b9a97', label: '회색' },
  brown: { bg: '#f4eeee', fg: '#7a5340', dot: '#a3714f', label: '갈색' },
  orange: { bg: '#fbecdd', fg: '#a35200', dot: '#d9730d', label: '주황색' },
  yellow: { bg: '#fbf3db', fg: '#8a6d00', dot: '#dfab01', label: '노란색' },
  green: { bg: '#edf3ec', fg: '#0f7b6c', dot: '#0f7b6c', label: '초록색' },
  blue: { bg: '#e7f3f8', fg: '#0b6e99', dot: '#0b6e99', label: '파란색' },
  purple: { bg: '#f4f0f7', fg: '#6940a5', dot: '#6940a5', label: '보라색' },
  pink: { bg: '#f9eef3', fg: '#ad1a72', dot: '#ad1a72', label: '분홍색' },
  red: { bg: '#fdebec', fg: '#e03e3e', dot: '#e03e3e', label: '빨간색' },
}
/** 옛 이름 — 자료에 남아 있어도 색이 안 깨지게 */
const ALIAS: Record<string, string> = {
  amber: 'yellow', emerald: 'green', rose: 'red', teal: 'blue', lime: 'green',
}

export const PALETTE_KEYS = Object.keys(PALETTE)
const GRAY: Paint = { bg: '#f5f5f4', fg: '#57534e', dot: '#a8a29e', label: '회색' }
export const paintOf = (color?: string): Paint =>
  PALETTE[color ?? 'gray'] ?? PALETTE[ALIAS[color ?? ''] ?? ''] ?? GRAY

/** 색을 안 정한 값도 옆 값과는 구별되게 — 글자에서 팔레트 한 칸을 고른다 */
export function autoColor(v: string): string {
  let h = 0
  for (let i = 0; i < v.length; i++) h = (h * 31 + v.charCodeAt(i)) >>> 0
  return PALETTE_KEYS[h % PALETTE_KEYS.length] ?? 'gray'
}


/* ── SETUP 색을 그대로 쓰되 노션 꼴로 ──────────────────────────────
   설정(실행 판정 기준·INFO 필드)이 색의 정본이라는 규칙은 안 깬다.
   설정이 준 색(#RRGGBB)을 **점**으로 쓰고, 그 색을 흰색에 섞어 바탕을,
   어둡게 눌러 글자를 만든다. 그래서 설정에서 색을 바꾸면 노션 표도
   그대로 따라온다 — 두 벌을 관리하지 않는다. */
const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
function rgb(hex: string): [number, number, number] | null {
  const h = hex.trim().replace('#', '')
  const t = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  if (!/^[0-9a-fA-F]{6}$/.test(t)) return null
  return [parseInt(t.slice(0, 2), 16), parseInt(t.slice(2, 4), 16), parseInt(t.slice(4, 6), 16)]
}
const hex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((n) => clamp(n).toString(16).padStart(2, '0')).join('')}`

/** #RRGGBB → 노션 꼴 세 색. 팔레트 이름이면 팔레트에서 찾는다. */
export function paintOfAny(color?: string): Paint {
  const c = (color ?? '').trim()
  if (!c) return paintOf('gray')
  if (!c.startsWith('#')) return paintOf(c)
  const v = rgb(c)
  if (!v) return paintOf('gray')
  const [r, g, b] = v
  /* 바탕 — 흰색에 12% 섞는다(노션의 옅은 칩) */
  const bg = hex(r + (255 - r) * 0.88, g + (255 - g) * 0.88, b + (255 - b) * 0.88)
  /* 글자 — 흰 바탕에서 읽히게 눌러 준다. 밝은 색일수록 더 눌린다 */
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  const k = lum > 0.72 ? 0.45 : lum > 0.5 ? 0.6 : 0.78
  const fg = hex(r * k, g * k, b * k)
  return { bg, fg, dot: c, label: c }
}
