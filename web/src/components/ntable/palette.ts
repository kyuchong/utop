/**
 * 값 색 팔레트 — **정적 매핑**(스펙 5장). 색은 옵션 정의에 색 이름으로만
 * 저장하고, 실제 색값은 여기서 찾는다. 행마다 색을 담지 않는다.
 */
export interface Paint { bg: string; fg: string; dot: string; label: string }

export const PALETTE: Record<string, Paint> = {
  gray: { bg: '#f5f5f4', fg: '#57534e', dot: '#a8a29e', label: '회색' },
  amber: { bg: '#fffbeb', fg: '#b45309', dot: '#f59e0b', label: '노랑' },
  emerald: { bg: '#ecfdf5', fg: '#047857', dot: '#10b981', label: '초록' },
  blue: { bg: '#eff6ff', fg: '#1d4ed8', dot: '#3b82f6', label: '파랑' },
  rose: { bg: '#fff1f2', fg: '#be123c', dot: '#f43f5e', label: '빨강' },
  purple: { bg: '#faf5ff', fg: '#7e22ce', dot: '#a855f7', label: '보라' },
  orange: { bg: '#fff7ed', fg: '#c2410c', dot: '#f97316', label: '주황' },
  teal: { bg: '#f0fdfa', fg: '#0f766e', dot: '#14b8a6', label: '청록' },
  lime: { bg: '#f7fee7', fg: '#4d7c0f', dot: '#84cc16', label: '연두' },
}
export const PALETTE_KEYS = Object.keys(PALETTE)
const GRAY: Paint = { bg: '#f5f5f4', fg: '#57534e', dot: '#a8a29e', label: '회색' }
export const paintOf = (color?: string): Paint => PALETTE[color ?? 'gray'] ?? GRAY

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
