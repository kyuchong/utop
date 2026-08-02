import { useEffect, useRef } from 'react'
import {
  MDXEditor,
  type MDXEditorMethods,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  linkPlugin,
  linkDialogPlugin,
  tablePlugin,
  codeBlockPlugin,
  codeMirrorPlugin,
  markdownShortcutPlugin,
  diffSourcePlugin,
  toolbarPlugin,
  UndoRedo,
  BoldItalicUnderlineToggles,
  BlockTypeSelect,
  ListsToggle,
  CreateLink,
  InsertTable,
  InsertCodeBlock,
  InsertThematicBreak,
  DiffSourceToggleWrapper,
} from '@mdxeditor/editor'
import '@mdxeditor/editor/style.css'
import './Markdown.css'

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}

/**
 * 구현내용 편집기.
 *
 * 저장되는 것은 언제나 **마크다운 원문**이다. 이게 이 화면의 핵심 제약이다:
 *   - 워드/문서를 붙여넣거나 올리면 마크다운으로 바뀌어 들어온다.
 *   - 그 원문을 그대로 벡터 DB 에 넣어야 검색·RAG 가 문서 구조
 *     (## 동작 / ## 판정 기준 / 표)를 살린 채 동작한다.
 *   - 그 구조를 읽어 시험항목과 스텝을 만든다.
 *   HTML 이나 편집기 전용 포맷으로 저장하면 이 흐름이 전부 막힌다.
 *
 * 그래서 편집기는 '마크다운을 넣고 마크다운을 받는' 것이 설계 목적인
 * MDXEditor 를 쓴다. ProseMirror JSON 을 정본으로 두는 편집기(TipTap 등)는
 * 마크다운 왕복에서 정보가 새므로 여기에는 맞지 않는다.
 *
 * 라이브러리는 번들에 함께 묶인다(CDN 아님) — 사내망에서 외부를 못 타도 뜬다.
 */
export default function MarkdownEditor({ value, onChange, placeholder }: Props) {
  const ref = useRef<MDXEditorMethods>(null)

  // 바깥에서 값이 통째로 바뀐 경우(다른 요구사항을 열 때)만 반영한다.
  // 타이핑 중에 넣으면 커서가 맨 앞으로 튄다.
  useEffect(() => {
    const ed = ref.current
    if (ed && ed.getMarkdown() !== value) ed.setMarkdown(value ?? '')
  }, [value])

  return (
    <div className="md-editor">
      <MDXEditor
        ref={ref}
        markdown={value ?? ''}
        placeholder={placeholder}
        onChange={onChange}
        contentEditableClassName="md-content"
        plugins={[
          headingsPlugin(),
          listsPlugin(),
          quotePlugin(),
          thematicBreakPlugin(),
          linkPlugin(),
          linkDialogPlugin(),
          tablePlugin(),
          codeBlockPlugin({ defaultCodeBlockLanguage: 'text' }),
          codeMirrorPlugin({
            codeBlockLanguages: {
              text: '텍스트',
              bash: 'CLI',
              json: 'JSON',
              python: 'Python',
            },
          }),
          // '## ' 처럼 마크다운을 직접 쳐도 서식이 잡힌다 —
          // 마크다운에 익숙한 사람은 도구모음을 안 거쳐도 된다.
          markdownShortcutPlugin(),
          // 원문(마크다운) 보기 전환. 붙여넣은 문서가 어떻게 변환됐는지
          // 눈으로 확인해야 벡터 DB 에 무엇이 들어갈지 알 수 있다.
          diffSourcePlugin({ viewMode: 'rich-text' }),
          toolbarPlugin({
            toolbarContents: () => (
              <DiffSourceToggleWrapper options={['rich-text', 'source']}>
                <UndoRedo />
                <BlockTypeSelect />
                <BoldItalicUnderlineToggles />
                <ListsToggle />
                <CreateLink />
                <InsertTable />
                <InsertCodeBlock />
                <InsertThematicBreak />
              </DiffSourceToggleWrapper>
            ),
          }),
        ]}
      />
    </div>
  )
}
