import { apiFetch } from '@/api/client'
import { useEffect, useRef } from 'react'
import Editor from '@toast-ui/editor'
import colorSyntax from '@toast-ui/editor-plugin-color-syntax'
import '@toast-ui/editor/dist/toastui-editor.css'
import '@toast-ui/editor/dist/i18n/ko-kr'
import 'tui-color-picker/dist/tui-color-picker.css'
import '@toast-ui/editor-plugin-color-syntax/dist/toastui-editor-plugin-color-syntax.css'
import './Markdown.css'

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}

/**
 * 구현내용 편집기 (Toast UI Editor).
 *
 * 저장되는 것은 언제나 **마크다운 원문**이다. 이게 이 화면의 핵심 제약이다:
 *   - 워드/PDF 를 등록하면 마크다운으로 바뀌어 들어온다.
 *   - 그 원문을 그대로 벡터 DB 에 넣어야 검색·RAG 가 문서 구조
 *     (## 동작 / ## 판정 기준 / 표)를 살린 채 동작한다.
 *   - 그 구조를 읽어 시험항목과 스텝을 만든다.
 *
 * ★ Milkdown(Crepe)에서 옮겨온 이유 (2026-08 피드백)
 *   글자색·블록색과 체크박스가 시험 문서에 필요했다. 마크다운 표준에 색이
 *   없어 Milkdown 으로는 커스텀 플러그인 개발이 필요했는데, Toast UI 는
 *   color-syntax 플러그인과 할 일 목록을 기본으로 지원하고 한글 문서·입력이
 *   안정적이다. 저장 형식은 같은 마크다운이라 기존 데이터 그대로 호환된다.
 *   (그 전에 MDXEditor 를 버린 이유도 유효하다 — 워드 변환문서의 '<' 같은
 *   원시 문자를 파서가 관대하게 받아야 한다. toastmark 는 CommonMark 계열로
 *   그런 글을 그대로 받는다.)
 */
export default function MarkdownEditor({ value, onChange, placeholder }: Props) {
  const holder = useRef<HTMLDivElement>(null)
  const ed = useRef<Editor | null>(null)
  // onChange 를 ref 로 들고 있어야 렌더마다 편집기를 새로 만들지 않는다
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  // 우리가 넣은 값인지, 사람이 친 값인지 구분한다
  const lastSent = useRef(value)

  useEffect(() => {
    const el = holder.current
    if (!el) return

    const inst = new Editor({
      el,
      height: '100%',
      minHeight: '220px',
      // 위지윅이 기본 — 마크다운 문법을 모르는 사람도 쓴다.
      // 우측 하단 모드 전환으로 마크다운 원문도 볼 수 있다.
      initialEditType: 'wysiwyg',
      previewStyle: 'tab',
      initialValue: value ?? '',
      placeholder: placeholder ?? '',
      usageStatistics: false,
      language: 'ko-KR',
      // 글자색 — 이 플러그인 때문에 갈아탔다. 툴바에 색 단추가 생긴다.
      plugins: [colorSyntax],
      events: {
        change: () => {
          const md = inst.getMarkdown()
          lastSent.current = md
          onChangeRef.current(md)
        },
      },
      hooks: {
        // 붙여넣기·끌어놓기·파일선택 모두 이리로 온다.
        // 서버가 파일을 받아 URL 을 돌려주고, 마크다운에는
        // ![](/api/req-images/…) 로 남는다 — 원문이 정본이므로
        // 경로도 원문 안에 있어야 한다(base64 로 박으면 글이 못 쓰게 커진다).
        addImageBlobHook: async (blob, cb) => {
          try {
            const fd = new FormData()
            const f = blob as File
            fd.append('file', f, f.name || 'image.png')
            const res = await apiFetch('/api/upload/image', { method: 'POST', body: fd })
            if (!res.ok) {
              const b = await res.json().catch(() => ({}))
              throw new Error(b.detail || `이미지 업로드 실패 (${res.status})`)
            }
            cb((await res.json()).url as string)
          } catch (e) {
            console.error('[MarkdownEditor] 이미지 업로드 실패:', e)
            window.alert(e instanceof Error ? e.message : String(e))
          }
        },
      },
    })
    ed.current = inst

    return () => {
      ed.current = null
      try {
        inst.destroy()
      } catch {
        /* 이미 닫힌 뒤면 destroy 가 던질 수 있다 */
      }
    }
    // 만들 때 한 번만. 값 동기화는 아래 effect 가 맡는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 바깥에서 값이 통째로 바뀐 경우(파일 등록, 다른 요구사항 열기)만 반영한다.
  // 사람이 타이핑하는 중에 밀어넣으면 커서가 맨 앞으로 튄다.
  useEffect(() => {
    const inst = ed.current
    if (!inst) return
    if (value === lastSent.current) return
    lastSent.current = value
    try {
      inst.setMarkdown(value ?? '', false)
    } catch (e) {
      console.error('[MarkdownEditor] 내용을 반영하지 못했습니다:', e)
    }
  }, [value])

  return (
    <div className="md-editor md-toast">
      <div className="md-host" ref={holder} />
    </div>
  )
}
