import { createReactBlockSpec } from '@blocknote/react'

/**
 * 문서 안의 **상자**(지시: Test Summary 의 설명 칸 같은 블록).
 *
 * 긴 글·장비 출력·주의사항을 담으면 어디까지가 그 덩어리인지 눈에 보인다.
 * 줄글만 이어지면 문단 사이가 다 같아 보여서, 읽는 사람이 「이 문단이
 * 앞엣것에 딸린 설명인가」 를 매번 가늠해야 한다.
 *
 * 상자는 **제목 한 줄**이고, 안에 담을 글은 그 아래 **들여쓴 블록**(Tab)이
 * 된다. 테두리는 CSS 가 상자와 그 자식을 함께 감싼다(:has) — 블록 안에
 * 편집기를 또 넣지 않는 까닭은, 그러면 편집기 안의 편집기가 되어 실행
 * 취소·함께 쓰기가 두 벌로 갈리기 때문이다.
 *
 * 결(kind)은 셋이다. 색만 다르고 하는 일은 같다:
 *   plain 그냥 상자 · note 알림(파랑) · warn 주의(주황)
 */

type Props = { kind: string }

const KINDS = [
  { k: 'plain', label: '상자', ico: '▢' },
  { k: 'note', label: '알림', ico: 'ℹ' },
  { k: 'warn', label: '주의', ico: '⚠' },
] as const

export const BoxSpec = createReactBlockSpec(
  {
    type: 'utopBox',
    propSchema: { kind: { default: 'plain' } },
    /* 제목 줄은 **글**이다 — 굵게·짚기(@)가 그대로 먹는다 */
    content: 'inline',
  },
  {
    render: ({ block, editor, contentRef }) => {
      const p = block.props as Props
      const cur = KINDS.find((x) => x.k === p.kind) ?? KINDS[0]
      return (
        <div className="wbx" data-kind={p.kind || 'plain'}>
          {/* 결 고르기 — 눌러 돌린다. 단추 셋을 세우면 상자보다 단추가
              커 보인다(조용하게: 실금만) */}
          <button
            type="button"
            className="wbx-ico"
            title={`${cur.label} — 눌러서 결을 바꿉니다`}
            contentEditable={false}
            disabled={!editor.isEditable}
            onClick={() => {
              const at = KINDS.findIndex((x) => x.k === p.kind)
              const next = KINDS[(at + 1 + KINDS.length) % KINDS.length] ?? KINDS[0]
              editor.updateBlock(block, { props: { ...p, kind: next.k } })
            }}
          >
            {cur.ico}
          </button>
          {/* 제목 줄. 담을 글은 Tab 으로 이 아래에 들여쓴다 */}
          <span className="wbx-t" ref={contentRef} />
        </div>
      )
    },
  },
)
