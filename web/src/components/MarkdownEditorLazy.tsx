import { Component, Suspense, lazy, type ReactNode } from 'react'

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

/**
 * 편집기가 죽어도 화면 전체가 사라지지 않게 막는다.
 *
 * MDXEditor 는 마크다운을 MDX 로 해석한다. 워드/PDF 에서 변환된 글에는
 * 원시 HTML 이나 홀로 남은 '<' 가 섞여 들어오는데, 그걸 만나면 파서가
 * 예외를 던지고 React 가 트리를 통째로 버린다 — 실제로 파일을 등록하면
 * 화면이 하얗게 됐다.
 *
 * 그럴 때는 평범한 입력칸으로 물러난다. 서식은 못 쓰지만 글은 살아 있고,
 * 저장도 된다. 무엇보다 쓰던 내용을 잃지 않는다.
 */
class EditorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(err: unknown) {
    console.error('[MarkdownEditor] 서식 편집기를 띄우지 못했습니다:', err)
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

export default function MarkdownEditorLazy({ value, onChange, placeholder }: Props) {
  const plain = (
    <div className="md-editor md-fallback">
      <div className="md-fallback-note">
        서식 편집기를 띄우지 못해 일반 입력칸으로 전환했습니다. 내용은 그대로이고
        저장도 됩니다.
      </div>
      <textarea
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )

  return (
    <EditorBoundary fallback={plain}>
      <Suspense fallback={<div className="md-loading">편집기를 불러오는 중…</div>}>
        <MarkdownEditor value={value} onChange={onChange} placeholder={placeholder} />
      </Suspense>
    </EditorBoundary>
  )
}
