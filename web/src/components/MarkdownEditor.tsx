import { useRef, useState } from 'react'
import Markdown from './Markdown'
import './Markdown.css'

interface Props {
  value: string
  onChange: (v: string) => void
  rows?: number
  placeholder?: string
}

/**
 * 마크다운 편집기.
 *
 * 저장되는 것은 마크다운 원문이다. 원문을 그대로 두는 이유:
 *  - 나중에 요구사항 내용으로 시험항목을 자동 생성할 때, 사람이 쓴 구조
 *    (## 동작 / ## 판정 기준 / 표)를 기계가 그대로 읽을 수 있다.
 *    편집기 전용 형식(HTML·JSON)으로 저장하면 그 구조가 묻힌다.
 *  - 화면 밖(문서·메일·AI 프롬프트)으로 옮길 때 손실이 없다.
 *
 * 대신 마크다운 문법을 외우지 않아도 되도록 서식 버튼과 실시간 미리보기를 둔다.
 */

type Mode = 'write' | 'split' | 'preview'

interface Tool {
  label: string
  title: string
  /** 선택 영역을 감싸거나(wrap) 줄 앞에 붙이는(prefix) 방식 */
  wrap?: [string, string]
  prefix?: string
  block?: string
}

const TOOLS: Tool[] = [
  { label: 'H2', title: '제목', prefix: '## ' },
  { label: 'B', title: '굵게', wrap: ['**', '**'] },
  { label: 'I', title: '기울임', wrap: ['_', '_'] },
  { label: '• 목록', title: '목록', prefix: '- ' },
  { label: '1. 번호', title: '번호 목록', prefix: '1. ' },
  { label: '`코드`', title: '인라인 코드', wrap: ['`', '`'] },
  { label: '```', title: '코드 블록', block: '```\n\n```' },
  { label: '표', title: '표', block: '| 항목 | 기준 |\n|---|---|\n|  |  |' },
  { label: '링크', title: '링크', wrap: ['[', '](url)'] },
]

export default function MarkdownEditor({
  value,
  onChange,
  rows = 12,
  placeholder,
}: Props) {
  const [mode, setMode] = useState<Mode>('split')
  const ref = useRef<HTMLTextAreaElement>(null)

  /** 선택 영역에 서식을 넣고, 커서를 쓰기 좋은 자리에 둔다 */
  const apply = (t: Tool) => {
    const el = ref.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const sel = value.slice(start, end)

    let next: string
    let caret: number

    if (t.wrap) {
      const [a, b] = t.wrap
      next = value.slice(0, start) + a + sel + b + value.slice(end)
      // 고른 글자가 없으면 감싼 안쪽으로 커서를 넣는다
      caret = sel ? start + a.length + sel.length + b.length : start + a.length
    } else if (t.prefix) {
      // 줄 단위로 붙인다. 여러 줄을 골랐으면 각 줄에.
      const from = value.lastIndexOf('\n', start - 1) + 1
      const body = value.slice(from, end)
      const marked = body
        .split('\n')
        .map((l, i) => (t.prefix === '1. ' ? `${i + 1}. ${l}` : t.prefix + l))
        .join('\n')
      next = value.slice(0, from) + marked + value.slice(end)
      caret = from + marked.length
    } else {
      const pad = start > 0 && value[start - 1] !== '\n' ? '\n' : ''
      next = value.slice(0, start) + pad + t.block + value.slice(end)
      caret = start + pad.length + (t.block?.length ?? 0)
    }

    onChange(next)
    // 상태 반영 뒤에 커서를 옮겨야 한다
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(caret, caret)
    })
  }

  return (
    <div className="md-editor">
      <div className="md-editor-bar">
        <div className="md-tools">
          {TOOLS.map((t) => (
            <button
              key={t.label}
              type="button"
              className="md-tool"
              title={t.title}
              disabled={mode === 'preview'}
              // 버튼을 누를 때 textarea 의 선택이 풀리지 않게
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => apply(t)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="seg">
          {(
            [
              ['write', '쓰기'],
              ['split', '나란히'],
              ['preview', '미리보기'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={`seg-btn${mode === k ? ' on' : ''}`}
              onClick={() => setMode(k)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={`md-panes ${mode}`}>
        {mode !== 'preview' && (
          <textarea
            ref={ref}
            rows={rows}
            value={value}
            placeholder={placeholder}
            spellCheck={false}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              // 탭으로 들여쓰기 (기본 동작은 다음 칸으로 넘어가 버린다)
              if (e.key === 'Tab') {
                e.preventDefault()
                const el = e.currentTarget
                const s = el.selectionStart
                onChange(value.slice(0, s) + '  ' + value.slice(el.selectionEnd))
                requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2))
              }
            }}
          />
        )}
        {mode !== 'write' && (
          <div className="md-preview">
            <Markdown text={value} empty="아직 쓴 내용이 없습니다." />
          </div>
        )}
      </div>
    </div>
  )
}
