import { createReactInlineContentSpec } from '@blocknote/react'
import { goto } from '@/api/goto'

/**
 * 문서 안에서 **요구사항·시험을 짚는 조각**.
 *
 * 이것이 남의 위키로는 못 하는 일이다. 글에 「REQ-2633-0003」 이라고 적어
 * 두면 그건 그냥 글자라, 그 요구사항이 없어져도·이름이 바뀌어도 아무도 모른다.
 * 조각으로 박아 두면 눌러서 갈 수 있고, 나중에 「이 요구사항을 어느 문서가
 * 참조하나」 도 물을 수 있다.
 *
 * 담기는 것은 **열쇠(id)와 그때의 이름**이다. 이름을 함께 담는 것은 그
 * 요구사항이 지워져도 문서에 무엇이 적혀 있었는지는 남아야 하기 때문이다 —
 * 열쇠만 담으면 지워진 뒤에는 빈 칸이 된다.
 */
export const RefSpec = createReactInlineContentSpec(
  {
    type: 'ref',
    propSchema: {
      kind: { default: 'req' as const },
      id: { default: '' },
      label: { default: '' },
    },
    content: 'none',
  },
  {
    render: ({ inlineContent }) => {
      const p = inlineContent.props as { kind: string; id: string; label: string }
      const tc = p.kind === 'tc'
      return (
        <span
          className={`wk-ref${tc ? ' tc' : ''}`}
          title={p.label ? `${p.id} — ${p.label}` : p.id}
          onClick={() => goto(tc ? 'tc' : 'req', p.id)}
          role="link"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && goto(tc ? 'tc' : 'req', p.id)}
        >
          {p.id}
        </span>
      )
    },
  },
)
