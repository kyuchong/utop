import { useEffect, useRef, useState } from 'react'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import type { PartialBlock } from '@blocknote/core'
import { ko } from '@blocknote/core/locales'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'
import { apiFetch } from '@/api/client'

/**
 * 위키 문서 편집기 — BlockNote(승인).
 *
 * 「/」 로 블록을 넣고, 블록 손잡이로 순서를 바꾸고, 표·그림·코드가 기본으로
 * 된다. 지금 구현내용 편집기(Toast UI)는 **그대로 둔다** — 거긴 마크다운
 * 원문이 정본이고 RAG·시험항목 생성이 그 구조를 읽는다. 두 곳의 요구가
 * 달라 한 편집기로 맞추면 둘 다 어중간해진다.
 *
 * 저장은 **손이 멈추면** 한다(2초). 저장 단추를 두면 안 누르고 창을 닫는
 * 사람이 반드시 나온다 — 그 글은 어디에도 안 남는다.
 */
export default function WikiEditor({
  id,
  title,
  onSaved,
}: {
  id: string
  title: string
  onSaved?: () => void
}) {
  const [ready, setReady] = useState(false)
  const [state, setState] = useState<'' | 'saving' | 'saved'>('')
  const timer = useRef<number | undefined>(undefined)
  const dirty = useRef(false)

  const editor = useCreateBlockNote({
    // 메뉴·말풍선을 한국어로 — 「/」 를 쳤을 때 나오는 이름들이다
    dictionary: ko,
  })

  /* 문서를 읽어 넣는다. 편집기를 다시 만들지 않고 안의 것만 갈아 끼운다 —
     새로 만들면 커서와 되돌리기 기록이 함께 날아간다. */
  useEffect(() => {
    let dead = false
    setReady(false)
    void (async () => {
      try {
        const r = await apiFetch(`/api/wiki/${encodeURIComponent(id)}`)
        const j = (await r.json()) as { page?: { body?: PartialBlock[] } }
        if (dead) return
        const body = j.page?.body
        editor.replaceBlocks(
          editor.document,
          Array.isArray(body) && body.length ? body : [{ type: 'paragraph' }],
        )
      } catch {
        /* 못 읽으면 빈 문서로 둔다 — 못 읽은 것을 빈 글로 저장하지 않게
           아래 dirty 로 막는다 */
      } finally {
        if (!dead) {
          dirty.current = false
          setReady(true)
        }
      }
    })()
    return () => {
      dead = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const save = async () => {
    if (!dirty.current) return
    setState('saving')
    try {
      await apiFetch(`/api/wiki/${encodeURIComponent(id)}`, {
        method: 'POST',
        body: JSON.stringify({ title, body: editor.document }),
      })
      dirty.current = false
      setState('saved')
      onSaved?.()
    } catch {
      setState('')
    }
  }

  /* 창을 닫거나 다른 문서로 넘어갈 때 — 기다리던 저장을 마저 한다 */
  useEffect(() => {
    const off = () => void save()
    window.addEventListener('beforeunload', off)
    return () => {
      window.removeEventListener('beforeunload', off)
      window.clearTimeout(timer.current)
      void save()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, title])

  return (
    <div className="wke">
      <div className="wke-head">
        <b className="wke-title">{title || '(이름 없음)'}</b>
        <span className="sp" />
        <span className={`wke-state${state === 'saved' ? ' ok' : ''}`}>
          {state === 'saving' ? '저장 중…' : state === 'saved' ? '저장됨 ✓' : ''}
        </span>
      </div>
      <div className="wke-body">
        {!ready && <div className="muted small wke-load">읽는 중…</div>}
        <BlockNoteView
          editor={editor}
          theme="light"
          onChange={() => {
            if (!ready) return
            dirty.current = true
            setState('')
            window.clearTimeout(timer.current)
            timer.current = window.setTimeout(() => void save(), 2000)
          }}
        />
      </div>
    </div>
  )
}
