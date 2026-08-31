export type NType = 'text' | 'select' | 'multiselect' | 'number' | 'date' | 'person'
/** 여러 개 고르는 칸의 값 — 쉼표로 이어 담는다("기능, 성능") */
export const multiVals = (v: string): string[] =>
  String(v ?? '').split(',').map((x) => x.trim()).filter(Boolean)
export const multiJoin = (vs: string[]): string => vs.join(', ')

export interface NOption {
  value: string
  /** palette.ts 의 색 이름 또는 #RRGGBB */
  color: string
  /** 값 앞에 붙일 그림 — 없으면 글자만(지시: 수동=손가락, 자동=톱니바퀴) */
  icon?: string
}

export interface NCol {
  key: string
  label: string
  type: NType
  /** 픽셀 폭 — 리사이즈로 갱신 */
  width?: number
  hidden?: boolean
  /** select 일 때의 선택지(색은 여기 한 번만) */
  options?: NOption[]
  /** ID·제목처럼 지우거나 타입을 못 바꾸는 열 */
  fixed?: boolean
}

export interface NRow {
  __id: string
  [k: string]: unknown
}

export interface NFilter {
  key: string
  /** 이 값들 중 하나면 통과. 비면 조건 없음 */
  values: string[]
}
export interface NSort {
  key: string
  dir: 'asc' | 'desc'
}
export interface NView {
  q: string
  filters: NFilter[]
  sorts: NSort[]
  /** 이 열로 묶기 — 비면 안 묶는다 */
  groupBy: string
}
export const EMPTY_VIEW: NView = { q: '', filters: [], sorts: [], groupBy: '' }

export interface NPerson {
  name: string
  org: string
}

/** 열 아래 계산 — 노션의 「계산」 줄 */
export type NCalc =
  | ''            // 안 셈
  | 'count'       // 모두 세기
  | 'filled'      // 값 있는 것
  | 'empty'       // 빈 것
  | 'pctFilled'   // 값 있는 것 비율
  | 'unique'      // 서로 다른 값 수
  | 'sum'         // 합(숫자)
  | 'avg'         // 평균(숫자)
  | 'min'
  | 'max'
export const CALC_LABEL: Record<NCalc, string> = {
  '': '계산 안 함',
  count: '모두',
  filled: '값 있음',
  empty: '빈 칸',
  pctFilled: '채운 비율',
  unique: '값 종류',
  sum: '합',
  avg: '평균',
  min: '최소',
  max: '최대',
}
