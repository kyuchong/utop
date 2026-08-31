export type NType = 'text' | 'select' | 'number' | 'date' | 'person'

export interface NOption {
  value: string
  /** palette.ts 의 색 이름 */
  color: string
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
