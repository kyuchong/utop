import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'

export type CfTarget = 'tc' | 'req'
export type CfType = 'text' | 'textarea' | 'number' | 'select' | 'date' | 'checkbox'

export interface CustomField {
  id: number
  target: CfTarget
  key: string
  label: string
  type: CfType
  /** select 일 때만. 줄바꿈으로 구분한 값 목록 */
  options?: string | null
  required: boolean
  /** 편집 화면에 보일지 */
  show_form: boolean
  /** 목록 열로 보일지 */
  show_list: boolean
  sort_order: number
  note?: string | null
  /** 값이 들어 있는 건수. 지우기 전에 알려주려고 서버가 세어 준다 */
  used?: number
}

export interface CfMeta {
  items: CustomField[]
  targets: Record<string, string>
  types: Record<string, string>
}

/** select 의 고를 값. 설정에서 한 줄에 하나씩 적는다. */
export function cfOptions(f: CustomField): string[] {
  return (f.options ?? '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * 커스텀 필드 정의를 서버에서 읽는다.
 *
 * 정의와 값은 따로 산다 — 정의는 custom_field 테이블, 값은 각 리소스의
 * data->'custom' 이다. 그래서 이 훅은 '무슨 칸이 있는지' 만 답한다.
 *
 * 목록 화면과 편집 화면이 같은 질의를 쓰므로 queryKey 를 하나로 묶었다.
 * 설정에서 칸을 고치면 양쪽이 함께 바뀐다.
 */
export function useCustomFields(target: CfTarget) {
  const q = useQuery({
    queryKey: ['custom-fields'],
    queryFn: async () => {
      const r = await apiFetch('/api/custom-fields')
      if (!r.ok) throw new Error('커스텀 필드를 불러오지 못했습니다')
      return (await r.json()) as CfMeta
    },
    staleTime: 60_000,
  })
  const all = (q.data?.items ?? []).filter((f) => f.target === target)
  return {
    all,
    /** 편집 화면에 넣을 칸 */
    inForm: all.filter((f) => f.show_form),
    /** 목록에 열로 붙일 칸 */
    inList: all.filter((f) => f.show_list),
    isLoading: q.isLoading,
  }
}

/** 저장 전 필수 칸 검사. 비어 있는 첫 칸의 이름을 돌려준다. */
export function missingRequired(
  fields: CustomField[],
  values: Record<string, unknown>,
): string | null {
  for (const f of fields) {
    if (!f.required) continue
    const v = values[f.key]
    // checkbox 는 '아니오' 도 답이다. 필수로 걸어도 false 를 미입력으로 보면
    // 체크를 켤 때까지 저장이 안 된다.
    if (f.type === 'checkbox') continue
    if (v === undefined || v === null || String(v).trim() === '') return f.label
  }
  return null
}

/** 목록 셀·상세에 그대로 쓸 수 있는 문자열로 */
export function cfDisplay(f: CustomField, v: unknown): string {
  if (v === undefined || v === null || v === '') return ''
  if (f.type === 'checkbox') return v ? '예' : '아니오'
  return String(v)
}
