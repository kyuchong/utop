import { useCallback } from 'react'
import {
  useBlockNoteEditor,
  useComponentsContext,
  useEditorState,
  blockTypeSelectItems,
} from '@blocknote/react'
import { editorHasBlockWithType } from '@blocknote/core'

/**
 * 도구줄의 **목록 셋 · 들여쓰기 둘**.
 *
 * 목록(글머리·번호·체크)은 기본 도구줄에 없다. 종류 고름표 안에는 있지만,
 * 목록은 글을 적는 동안 가장 자주 켜고 끄는 것이라 두 번 눌러 들어가야
 * 하는 자리에 두면 안 된다.
 *
 * 들여쓰기·내어쓰기는 기본 도구줄에 **있기는 하다.** 다만 맨 끝, 정렬과
 * 색 단추 뒤에 있어 목록과 멀고, 위에 블록이 없으면 흐리게 꺼져 있어
 * 「없다」 로 읽힌다(지적). 그래서 기본 것은 빼고 여기서 **목록 바로 옆에**
 * 다시 낸다 — 「1번 아래 글머리를 넣고 들여쓴다」 는 한 손놀림이라, 그
 * 단추 둘이 떨어져 있으면 안 된다.
 */

const LISTS = [
  { type: 'bulletListItem', label: '글머리 기호 목록', mark: '•' },
  { type: 'numberedListItem', label: '번호 매기기 목록', mark: '1.' },
  { type: 'checkListItem', label: '체크리스트', mark: '☑' },
] as const

/* eslint-disable @typescript-eslint/no-explicit-any */
/** 고른 줄 전부 — 하나도 안 골랐으면 커서가 놓인 줄 하나 */
function blocksOf(editor: any): any[] {
  return editor.getSelection()?.blocks ?? [editor.getTextCursorPosition().block]
}

function ListButton({ type, label, mark }: (typeof LISTS)[number]) {
  const C = useComponentsContext()!
  const editor = useBlockNoteEditor<any, any, any>()

  /* 이미 그 목록이면 눌러서 끈다 — 한 번 더 눌렀을 때 아무 일도 안 나면
     고장으로 읽힌다 */
  const on = useEditorState({
    editor,
    selector: ({ editor }) => {
      if (!editor.isEditable) return undefined
      const bs = blocksOf(editor)
      return bs.length > 0 && bs.every((b) => b.type === type)
    },
  })

  const click = useCallback(() => {
    for (const b of blocksOf(editor)) editor.updateBlock(b, { type: on ? 'paragraph' : type })
    editor.focus()
  }, [editor, on, type])

  if (on === undefined) return null
  return (
    <C.FormattingToolbar.Button
      className="bn-button wk-tb"
      label={label}
      mainTooltip={label}
      isSelected={on}
      onClick={click}
    >
      {mark}
    </C.FormattingToolbar.Button>
  )
}

function IndentButton({ out }: { out: boolean }) {
  const C = useComponentsContext()!
  const editor = useBlockNoteEditor<any, any, any>()
  const can = useEditorState({
    editor,
    selector: ({ editor }) => {
      if (!editor.isEditable) return undefined
      return out ? editor.canUnnestBlock() : editor.canNestBlock()
    },
  })
  const click = useCallback(() => {
    editor.focus()
    if (out) editor.unnestBlock()
    else editor.nestBlock()
  }, [editor, out])

  if (can === undefined) return null
  const label = out ? '내어쓰기 (Shift+Tab)' : '들여쓰기 (Tab)'
  return (
    <C.FormattingToolbar.Button
      className="bn-button wk-tb"
      label={label}
      mainTooltip={label}
      isDisabled={!can}
      onClick={click}
    >
      {out ? '⇤' : '⇥'}
    </C.FormattingToolbar.Button>
  )
}

export default function ListButtons() {
  return (
    <>
      {LISTS.map((k) => (
        <ListButton key={k.type} {...k} />
      ))}
      <IndentButton out={false} />
      <IndentButton out />
    </>
  )
}

/**
 * 종류 고름표 — 기본 것을 대신한다.
 *
 * BlockNote 기본 고름표는 줄을 몇 개 골랐든 **맨 첫 줄에만** 적용한다
 * (`updateBlock(firstSelectedBlock, …)`). 세 줄을 골라 제목3 으로 바꾸면
 * 첫 줄만 바뀌고 나머지는 그대로다 — 지적받은 그 일이다. 고른 것이 셋인데
 * 하나만 바뀌면 사람은 그것을 「안 먹었다」 로 읽지, 「하나만 먹는 규칙」
 * 으로 읽지 않는다.
 *
 * 목록은 기본 것과 똑같이 쓰고(이름·아이콘·차례가 달라지면 그게 더 큰
 * 혼란이다), 누를 때 **고른 줄 전부**에 건다.
 */
export function BlockKindSelect() {
  const C = useComponentsContext()!
  const editor = useBlockNoteEditor<any, any, any>()
  const dict = (editor as any).dictionary

  const cur = useEditorState({
    editor,
    selector: ({ editor }) => {
      if (!editor.isEditable) return undefined
      const b = blocksOf(editor)[0]
      return b ? { type: b.type as string, props: (b.props ?? {}) as Record<string, unknown> } : undefined
    },
  })
  if (cur === undefined) return null

  const items = blockTypeSelectItems(dict)
    .filter((it) => editorHasBlockWithType(editor, it.type, propTypes(it.props)))
    .map((it) => {
      const Icon = it.icon
      const same =
        it.type === cur.type &&
        Object.entries(it.props ?? {}).every(([k, v]) => v === cur.props[k])
      return {
        text: it.name,
        icon: <Icon size={16} />,
        isSelected: same,
        onClick: () => {
          /* 줄을 먼저 다 모아 두고 나서 바꾼다 — 바꾸는 도중에 다시 물으면
             앞줄이 바뀌면서 고른 범위가 흔들린다 */
          const bs = blocksOf(editor)
          editor.focus()
          for (const b of bs) editor.updateBlock(b, { type: it.type, props: it.props ?? {} })
        },
      }
    })

  return <C.FormattingToolbar.Select className="bn-select" items={items} />
}

/** 값이 아니라 **값의 종류**를 넘겨야 서식에 있는지 물을 수 있다 */
function propTypes(p?: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(p ?? {}).map(([k, v]) => [k, typeof v]),
  ) as Record<string, 'string' | 'number' | 'boolean'>
}
