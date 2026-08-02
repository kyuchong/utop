import { useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import './Markdown.css'

interface Props {
  text: string
  /** 내용이 비었을 때 보여줄 문구 */
  empty?: string
}

/**
 * 마크다운을 읽기 좋게 그린다.
 *
 * 사용자가 쓴 글을 HTML 로 바꿔 넣으므로 반드시 소독한다. 지금은 사내
 * 한 곳에서만 쓰지만, 요구사항은 여러 사람이 쓰고 서로의 글을 보는
 * 자리라서 한 사람이 넣은 <script> 가 다른 사람 브라우저에서 도는 길이
 * 열려 있으면 안 된다.
 *
 * marked 는 빌드에 함께 묶인다(CDN 아님) — 사내망에서 외부를 못 타도 동작한다.
 */
export default function Markdown({ text, empty = '내용이 없습니다.' }: Props) {
  const html = useMemo(() => {
    const src = (text ?? '').trim()
    if (!src) return ''
    const raw = marked.parse(src, { async: false, breaks: true, gfm: true }) as string
    return DOMPurify.sanitize(raw, {
      // 링크는 허용하되 javascript: 같은 스킴은 DOMPurify 가 막는다.
      ADD_ATTR: ['target', 'rel'],
    })
  }, [text])

  if (!html) return <p className="muted">{empty}</p>

  return (
    <div
      className="md"
      // 위에서 DOMPurify 로 소독한 뒤에만 넣는다.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
