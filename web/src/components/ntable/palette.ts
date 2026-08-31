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
