import { useEffect, useRef, useState } from 'react'
import {
  useCreateBlockNote,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
} from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import {
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
  filterSuggestionItems,
  type PartialBlock,
} from '@blocknote/core'
import { RefSpec } from './wikiRef'
import { ViewSpec } from './wikiView'
import { ko } from '@blocknote/core/locales'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'
import { useQuery } from '@tanstack/react-query'
import { api, apiFetch } from '@/api/client'
import { reqLabel, reqPk } from '@/types'

/** 기본 조각에 「짚기」 를 더한 서식 — 편집기가 이 서식으로 글을 읽고 쓴다 */
const SCHEMA = BlockNoteSchema.create({
  inlineContentSpecs: { ...defaultInlineContentSpecs, ref: RefSpec },
  /* 「살아 있는 표」 — 숫자가 아니라 질의를 담는 블록(wikiView) */
  blockSpecs: { ...defaultBlockSpecs, utopView: ViewSpec() },
})

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
  /* 변경 이력 — 저장할 때마다 한 줄씩 쌓인다. 되돌릴 수 있어야 사람이 마음
     놓고 고친다: 못 되돌리면 지우기가 무서워 문서가 안 정리된다. */
  const [revs, setRevs] = useState<Array<{ id: number; title: string; who?: string; at: string }> | null>(null)
  const [state, setState] = useState<'' | 'saving' | 'saved'>('')
  const timer = useRef<number | undefined>(undefined)
  const dirty = useRef(false)

  /* 요구사항·시험 목록 — 「@」 를 쳤을 때 고를 것들. 두 목록은 화면 어딘가가
     이미 받아 두었으므로 같은 열쇠를 써서 두 번 받지 않는다. */
  const reqQ = useQuery({
    queryKey: ['reqs'],
    queryFn: ({ signal }) => api.listRequirements(signal),
    staleTime: 60_000,
  })
  const tcQ = useQuery({
    queryKey: ['tcs'],
    queryFn: ({ signal }) => api.listTestCases(signal),
    staleTime: 60_000,
  })
  /* 문서 목록 — 문서끼리 짚으려면 이것이 있어야 한다. 위키에서 가장 많이
     쓰는 링크는 바깥이 아니라 **옆 문서**다. */
  const pageQ = useQuery({
    queryKey: ['wiki', ''],
    queryFn: async () => {
      const r = await apiFetch('/api/wiki?project=')
      return (await r.json()) as { pages: Array<{ id: string; title: string }> }
    },
    staleTime: 60_000,
  })

  const editor = useCreateBlockNote({
    // 메뉴·말풍선을 한국어로 — 「/」 를 쳤을 때 나오는 이름들이다
    dictionary: ko,
    schema: SCHEMA,
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
        <button
          type="button"
          className="btn small"
          onClick={async () => {
            if (revs) {
              setRevs(null)
              return
            }
            try {
              const r = await apiFetch(`/api/wiki/${encodeURIComponent(id)}/revs`)
              const j = (await r.json()) as { revs: typeof revs }
              setRevs(j.revs ?? [])
            } catch {
              setRevs([])
            }
          }}
        >
          변경 이력
        </button>
        <span className={`wke-state${state === 'saved' ? ' ok' : ''}`}>
          {state === 'saving' ? '저장 중…' : state === 'saved' ? '저장됨 ✓' : ''}
        </span>
      </div>
      {revs && (
        <div className="wke-revs">
          {revs.length === 0 ? (
            <div className="muted small">아직 지난 판이 없습니다 — 저장할 때마다 한 줄씩 쌓입니다.</div>
          ) : (
            revs.map((r) => (
              <div className="wke-rev" key={r.id}>
                <span className="wke-rev-at">{r.at.slice(0, 16).replace('T', ' ')}</span>
                <span className="wke-rev-who">{r.who || '—'}</span>
                <span className="wke-rev-t">{r.title || '(이름 없음)'}</span>
                <span className="sp" />
                <button
                  type="button"
                  className="btn small"
                  title="그때의 글을 지금 문서에 되돌립니다"
                  onClick={async () => {
                    if (!window.confirm('이 판으로 되돌립니다. 지금 글은 지난 판으로 남습니다.')) return
                    try {
                      const rr = await apiFetch(`/api/wiki/rev/${r.id}`)
                      const j = (await rr.json()) as { rev?: { body?: PartialBlock[] } }
                      const b = j.rev?.body
                      editor.replaceBlocks(
                        editor.document,
                        Array.isArray(b) && b.length ? b : [{ type: 'paragraph' }],
                      )
                      dirty.current = true
                      await save()
                      setRevs(null)
                    } catch {
                      window.alert('되돌리지 못했습니다')
                    }
                  }}
                >
                  되돌리기
                </button>
              </div>
            ))
          )}
        </div>
      )}
      <div className="wke-body">
        {!ready && <div className="muted small wke-load">읽는 중…</div>}
        <BlockNoteView
          editor={editor}
          theme="light"
          slashMenu={false}
          onChange={() => {
            if (!ready) return
            dirty.current = true
            setState('')
            window.clearTimeout(timer.current)
            timer.current = window.setTimeout(() => void save(), 2000)
          }}
        >
          {/* 「/」 — 기본 블록들에 「REQ · TC 짚기」 를 더한다. 그 항목은
              「@」 를 대신 쳐 준다: 짚는 길이 둘이면 하나는 잊힌다. */}
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={async (query) =>
              filterSuggestionItems(
                [
                  ...getDefaultReactSlashMenuItems(editor),
                  {
                    title: 'REQ · TC 짚기',
                    subtext: '요구사항·시험을 눌러서 갈 수 있게 박습니다',
                    group: '짚기',
                    /* 「@」 를 대신 쳐 준다 — 짚는 길이 둘이면 하나는 잊힌다 */
                    onItemClick: () => editor.insertInlineContent('@'),
                  },
                  {
                    title: 'UTOP 표 끼우기',
                    subtext: '사이클 진행·덮임을 문서 안에 살아 있는 채로 놓습니다',
                    group: '짚기',
                    onItemClick: () =>
                      editor.insertBlocks(
                        [{ type: 'utopView' } as unknown as PartialBlock],
                        editor.getTextCursorPosition().block,
                        'after',
                      ),
                  },
                ],
                query,
              )
            }
          />
          {/* 「@」 — 문서·요구사항·시험을 골라 박는다. ID 로도 이름으로도
              찾는다: ID 를 외우고 있는 사람은 없다. */}
          <SuggestionMenuController
            triggerCharacter="@"
            getItems={async (query) => {
              const n = query.trim().toLowerCase()
              const reqs = (reqQ.data?.reqs ?? [])
                .filter((r) => !n || `${reqLabel(r)} ${r.title ?? ''}`.toLowerCase().includes(n))
                .slice(0, 20)
                .map((r) => ({
                  title: `${reqLabel(r)}  ${r.title ?? ''}`,
                  group: '요구사항',
                  onItemClick: () =>
                    editor.insertInlineContent([
                      { type: 'ref', props: { kind: 'req', id: reqPk(r), label: String(r.title ?? '') } },
                      ' ',
                    ]),
                }))
              const tcs = (tcQ.data?.tcs ?? [])
                .filter((t) => !n || `${t.tcid} ${t.name ?? ''}`.toLowerCase().includes(n))
                .slice(0, 20)
                .map((t) => ({
                  title: `${t.tcid}  ${t.name ?? ''}`,
                  group: '시험항목',
                  onItemClick: () =>
                    editor.insertInlineContent([
                      { type: 'ref', props: { kind: 'tc', id: t.tcid, label: String(t.name ?? '') } },
                      ' ',
                    ]),
                }))
              /* 문서를 **맨 앞에** 둔다 — 문서를 쓰는 동안 가장 자주 짚는
                 것이 옆 문서다. 자기 자신은 뺀다: 자기를 가리키는 링크는
                 눌러도 아무 일이 안 일어나 고장으로 보인다. */
              const docs = (pageQ.data?.pages ?? [])
                .filter((p) => p.id !== id && (!n || String(p.title ?? '').toLowerCase().includes(n)))
                .slice(0, 20)
                .map((p) => ({
                  title: p.title || '(이름 없음)',
                  group: '문서',
                  onItemClick: () =>
                    editor.insertInlineContent([
                      { type: 'ref', props: { kind: 'wiki', id: p.id, label: String(p.title ?? '') } },
                      ' ',
                    ]),
                }))
              return [...docs, ...reqs, ...tcs]
            }}
          />
        </BlockNoteView>
      </div>
    </div>
  )
}
