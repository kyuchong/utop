import { useEffect, useMemo, useRef } from 'react'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import { ko } from '@blocknote/core/locales'
import type { PartialBlock } from '@blocknote/core'
import { apiFetch } from '@/api/client'
import { THEME } from './WikiEditor'
import BnSideMenuCentered from './BnSideMenuCentered'
import { patchCellBg } from './cellBg'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'

/**
 * 설명 칸의 **블록 노트** — 위키와 같은 편집기 한 벌(지시).
 *
 * 위키(WikiEditor)와 달리 함께 쓰기(Yjs)는 없다 — 사이클 설명은 한 문서
 * 전문(data)의 한 칸이라, 고친 것을 초안에 담았다가 머리의 저장 단추로
 * 실어 보내는 이 화면의 수동 저장 규칙을 그대로 따른다.
 *
 * 저장은 두 벌이다: 블록(JSON)이 정본이고, 마크다운을 함께 뽑아 둔다 —
 * 결과서·AI 요약처럼 글자만 읽는 소비처가 계속 읽을 수 있어야 한다.
 */
export default function DescNote({
  doc,
  text,
  editable,
  onChange,
}: {
  /** 블록 저장분(정본) — 없으면 text(마크다운)를 들여온다 */
  doc?: unknown
  text: string
  editable: boolean
  /** 고칠 때마다 — (블록, 마크다운) 한 벌 */
  onChange?: (doc: unknown[], md: string) => void
}) {
  /* 처음 한 번만 읽는다 — 그 뒤로는 편집기 안이 정본이다 */
  const initial = useMemo(
    () => (Array.isArray(doc) && doc.length ? (doc as PartialBlock[]) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const editor = useCreateBlockNote(
    {
      dictionary: ko,
      initialContent: initial,
      /* 그림 붙여넣기(지시) — 위키와 **같은 손잡이**다. 없으면 클립보드의
         스크린샷이 조용히 버려진다. 저장은 요구사항 그림과 같은 곳. */
      uploadFile: async (file: File) => {
        const fd = new FormData()
        /* 클립보드 스크린샷은 이름이 없다 — 확장자는 서버가 보므로 붙여 준다 */
        fd.append('file', file, file.name || 'paste.png')
        const r = await apiFetch('/api/upload/image', { method: 'POST', body: fd })
        if (!r.ok) {
          const d = ((await r.json().catch(() => ({}))) as { detail?: string }).detail
          throw new Error(d || '그림을 올리지 못했습니다')
        }
        return ((await r.json()) as { url: string }).url
      },
      /* 긴 글은 마크다운으로 읽어 블록으로 가른다 — 위키와 한 규칙(지시) */
      pasteHandler: ({ event, editor: ed2, defaultPasteHandler }) => {
        const plain = event.clipboardData?.getData('text/plain') ?? ''
        const html = event.clipboardData?.getData('text/html') ?? ''
        const files = event.clipboardData?.files?.length ?? 0
        if (plain && !html && !files) {
          try {
            const looksMd = /^(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|\||```)/m.test(plain)
            if (looksMd) {
              ed2.pasteMarkdown(plain)
              return true
            }
            if (plain.includes('\n')) {
              const runs = plain.match(/`+/g) ?? []
              const fence = '`'.repeat(Math.max(3, ...runs.map((s) => s.length + 1)))
              ed2.pasteMarkdown(`${fence}\n${plain}\n${fence}`)
              return true
            }
          } catch {
            /* 해석이 깨지면 기본 길로 */
          }
        }
        return defaultPasteHandler()
      },
    },
    [],
  )

  /* 블록 저장분이 없는 옛 자료 — 마크다운 글을 블록으로 들여온다.
     이 씨앗 심기가 onChange 로 새면 손도 안 댔는데 초안이 선다 — 막는다 */
  const seeding = useRef(false)
  useEffect(() => {
    if (initial || !text.trim()) return
    const bs = editor.tryParseMarkdownToBlocks(text)
    if (bs.length) {
      seeding.current = true
      editor.replaceBlocks(editor.document, bs)
      /* 갈아 끼운 직후 **선택을 맨 앞에 접어 둔다**(지적: AI 생성을
         눌렀더니 손도 안 댔는데 파란 선택·포맷 툴바·손잡이가 어중간한
         자리에 떠 있다) — replaceBlocks 가 남긴 선택이 툴바를 세운다. */
      try {
        const first = editor.document[0]
        if (first) editor.setTextCursorPosition(first, 'start')
      } catch {
        /* 커서를 못 접어도 본문은 이미 섰다 */
      }
      window.setTimeout(() => {
        seeding.current = false
      }, 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* 툴바의 배경색이 **칸으로도 가게** 한다(지적: 칸을 드래그해 색을 골라도
     글자에만 칠해진다) — 단추를 새로 세우지 않고 가는 곳만 바꾼다 */
  useEffect(() => {
    patchCellBg(editor)
  }, [editor])

  return (
    <BlockNoteView
      editor={editor}
      theme={THEME}
      editable={editable}
      /* 기본 손잡이는 끄고 **줄 중앙 맞춤판**으로 바꿔 단다(지적) —
         나머지 기본 UI(툴바·슬래시 메뉴)는 그대로 산다 */
      sideMenu={false}
      onChange={() => {
        if (!onChange || seeding.current) return
        onChange(editor.document as unknown[], editor.blocksToMarkdownLossy(editor.document))
      }}
    >
      <BnSideMenuCentered />
    </BlockNoteView>
  )
}
