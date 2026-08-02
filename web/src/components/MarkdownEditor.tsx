import { useEffect, useRef } from 'react'
import { Crepe } from '@milkdown/crepe'
import { replaceAll } from '@milkdown/kit/utils'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'
import './Markdown.css'

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}

/**
 * 구현내용 편집기 (Milkdown / Crepe).
 *
 * 저장되는 것은 언제나 **마크다운 원문**이다. 이게 이 화면의 핵심 제약이다:
 *   - 워드/PDF 를 등록하면 마크다운으로 바뀌어 들어온다.
 *   - 그 원문을 그대로 벡터 DB 에 넣어야 검색·RAG 가 문서 구조
 *     (## 동작 / ## 판정 기준 / 표)를 살린 채 동작한다.
 *   - 그 구조를 읽어 시험항목과 스텝을 만든다.
 *
 * ★ MDXEditor 에서 옮겨온 이유
 *   MDXEditor 는 본문을 MDX 로 해석한다. MDX 는 마크다운보다 엄격해서
 *   '<' 를 태그의 시작으로 본다. 그런데 여기 들어오는 글은 워드·PDF 에서
 *   변환된 임의의 문서다 — 원시 HTML 이나 '온도 < 40도' 같은 문장이 흔하고,
 *   그때마다 파서가 예외를 던져 화면이 통째로 사라졌다.
 *   입력을 깎아 파서에 맞추는 건 방향이 틀렸다. Milkdown 은 remark
 *   (CommonMark/GFM) 위에 있어 그런 글을 그대로 받는다.
 */
export default function MarkdownEditor({ value, onChange, placeholder }: Props) {
  const holder = useRef<HTMLDivElement>(null)
  const crepe = useRef<Crepe | null>(null)
  // onChange 를 ref 로 들고 있어야 렌더마다 편집기를 새로 만들지 않는다
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  // 우리가 넣은 값인지, 사람이 친 값인지 구분한다
  const lastSent = useRef(value)

  useEffect(() => {
    const el = holder.current
    if (!el) return
    let disposed = false

    const inst = new Crepe({
      root: el,
      defaultValue: value ?? '',
      features: {
        // 이미지 업로드는 아직 받을 곳이 없다. 켜두면 눌렀을 때 죽는다.
        [Crepe.Feature.ImageBlock]: false,
        [Crepe.Feature.Latex]: false,
      },
      featureConfigs: {
        [Crepe.Feature.Placeholder]: { text: placeholder ?? '' },
      },
    })

    inst.on((listener) => {
      listener.markdownUpdated((_ctx, md) => {
        lastSent.current = md
        onChangeRef.current(md)
      })
    })

    void inst.create().then(() => {
      if (disposed) inst.destroy()
      else crepe.current = inst
    })

    return () => {
      disposed = true
      crepe.current = null
      try {
        inst.destroy()
      } catch {
        /* 생성이 끝나기 전에 닫히면 destroy 가 던질 수 있다 */
      }
    }
    // 만들 때 한 번만. 값 동기화는 아래 effect 가 맡는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 바깥에서 값이 통째로 바뀐 경우(파일 등록, 다른 요구사항 열기)만 반영한다.
  // 사람이 타이핑하는 중에 밀어넣으면 커서가 맨 앞으로 튄다.
  useEffect(() => {
    const inst = crepe.current
    if (!inst) return
    if (value === lastSent.current) return
    lastSent.current = value
    try {
      // Crepe 에는 setMarkdown 이 없다. 아래의 Milkdown 편집기에 직접 넣는다.
      inst.editor.action(replaceAll(value ?? ''))
    } catch (e) {
      console.error('[MarkdownEditor] 내용을 반영하지 못했습니다:', e)
    }
  }, [value])

  return <div className="md-editor" ref={holder} />
}
