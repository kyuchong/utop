/**
 * INFO 필드 값의 **기본색** — 한 곳(지적).
 *
 * 「아무것도 설정한 게 없는데 왜 녹색이지?」 — 색이 목록 페이지 세 곳에
 * 따로 박혀 있었기 때문이다. 요구사항·시험항목·사이클이 저마다 제 팔레트를
 * 들고 있었고, 정작 설정 화면은 그것을 몰라서 전부 회색(#9CA3AF)으로
 * 보여 주었다. 화면과 설정이 다른 말을 하면 설정은 정본이 아니다.
 *
 * 그래서 기본색을 여기 하나로 모은다. 설정 화면도 이것을 읽는다 — 설정에서
 * 보이는 색이 곧 목록에서 나오는 색이다.
 *
 * 차례는 늘 **설정한 값 → 여기 기본값 → 글자에서 뽑은 색**이다. 맨 끝이
 * 있는 이유는, 목록에 없는 값도 옆 값과 구별은 되어야 해서다.
 */

/** 값 이름으로 정해 둔 기본색 — Monday 계열 */
export const DEFAULT_BG: Record<string, string> = {
  /* 요구사항 상태 */
  작성중: '#fdab3d', Draft: '#fdab3d', 검토중: '#579bfc', 검토완료: '#00c875',
  승인: '#00c875', 보류: '#9ca3af', 폐기: '#6b7280',
  /* 우선순위·중요도 */
  High: '#ef4666', Medium: '#fdab3d', Low: '#9ca3af',
  Blocker: '#e2445c', Critical: '#e2445c', MJ: '#ff9d19',
  치명: '#e2445c', 중대: '#ff9d19', 보통: '#fdab3d', 경미: '#9ca3af',
  /* 판정 */
  PASS: '#00c875', Pass: '#00c875', FAIL: '#ef4666', Fail: '#ef4666',
  /* 시험항목 유형·타입·구분 */
  기능: '#579bfc', Function: '#579bfc', FT: '#579bfc', 성능: '#a25ddc',
  자동: '#00c875', A: '#00c875', 수동: '#7f5347', M: '#7f5347',
  자체: '#037f4c', 고객: '#0086c0',
  /* 사이클 상태 */
  준비: '#fdab3d', 진행중: '#579bfc', 진행: '#579bfc', 완료: '#00c875', 취소: '#6b7280',
}

/** 이름표에 없는 값 — 글자에서 색을 뽑는다. 같은 글자는 늘 같은 색이다 */
const HUES = ['#579bfc', '#00c875', '#a25ddc', '#ff9d19', '#e2445c', '#0086c0', '#7f5347', '#9ca3af']
export const autoHue = (v: string): string => {
  let h = 0
  for (let i = 0; i < v.length; i += 1) h = (h * 31 + v.charCodeAt(i)) >>> 0
  return HUES[h % HUES.length]!
}

/** 설정이 없을 때 그 값이 갖는 색 — 설정 화면이 이것을 그대로 보여 준다 */
export const defaultBg = (value: string): string =>
  value ? (DEFAULT_BG[value] ?? autoHue(value)) : '#e9edf2'

/** 값 하나의 최종 두 색 — `note`(JSON)에 담긴 설정이 늘 이긴다 */
export const fillOf = (note: string | null | undefined, value: string): { bg: string; fg: string } => {
  let meta: { color?: string; fg?: string } = {}
  try {
    meta = JSON.parse(note || '{}') as typeof meta
  } catch {
    /* 옛 자료 */
  }
  return { bg: meta.color || defaultBg(value), fg: meta.fg || '#fff' }
}
