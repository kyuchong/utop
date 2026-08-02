import { Suspense, lazy } from 'react'

/**
 * 편집기는 무겁다(gzip 약 580KB). 목록만 보는 사람에게까지 내려보낼 이유가
 * 없어서, 편집 창을 열 때 비로소 받아온다.
 */
const MarkdownEditor = lazy(() => import('./MarkdownEditor'))

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}

export default function MarkdownEditorLazy(props: Props) {
  return (
    <Suspense fallback={<div className="md-loading">편집기를 불러오는 중…</div>}>
      <MarkdownEditor {...props} />
    </Suspense>
  )
}
