import type { CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'

/**
 * INFO 필드 **한 칸의 생김새** — SETUP 이 정본(지시).
 *
 * 폭은 열이 갖는 값이라 [[useInfoCols]] 가 들고 가고, 여기는 칸 안의 것이다:
 * 모양(셀 채움·알약·태그·글자만)·정렬·글꼴·굵기·크기·대소문자.
 *
 * 여태 이걸 읽는 코드가 요구사항 페이지에만 있었다. 그래서 시험항목·사이클은
 * 색만 따르고 모양은 코드에 박힌 대로였다 — 같은 설정 화면에서 고쳤는데 한
 * 화면만 바뀌면, 그 설정은 믿을 수 없는 설정이 된다.
 */
export interface KStyle {
  w?: string
  shape?: string
  align?: string
  weight?: string
  size?: string
  font?: string
  caps?: string
}

export function useKindStyle() {
  const q = useQuery({
    queryKey: ['code-kind-style'],
    queryFn: async () => {
      const r = await apiFetch('/api/codes/kind-style')
      if (!r.ok) throw new Error('필드 모양을 불러오지 못했습니다')
      return (await r.json()) as { styles: Record<string, KStyle> }
    },
    staleTime: 30_000,
  })
  /** 그 필드의 설정 — 안 정했으면 빈 것(각자 기본값으로 떨어진다) */
  const styleOf = (kind: string): KStyle => q.data?.styles?.[kind] ?? {}
  /** 설정한 글꼴을 실제 칸에 입힌다 */
  const fontOf = (kind: string): CSSProperties => {
    const k = styleOf(kind)
    return {
      fontWeight: Number(k.weight || 700),
      fontSize: `${Number(k.size || 12)}px`,
      ...(k.font === 'mono'
        ? { fontFamily: 'var(--font-mono)' }
        : k.font === 'serif'
          ? { fontFamily: 'Georgia, "Noto Serif KR", serif' }
          : {}),
      ...(k.caps === 'upper' ? { textTransform: 'uppercase' as const } : {}),
    }
  }
  /** 칸에 붙는 이름 — 모양·정렬 (세 화면이 같은 이름을 쓴다) */
  const shapeCls = (kind: string) => `sh-${styleOf(kind).shape || 'fill'}`
  const alignCls = (kind: string) => `al-${styleOf(kind).align || 'center'}`
  return { styleOf, fontOf, shapeCls, alignCls }
}
