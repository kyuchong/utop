import { useEffect, useRef, useState } from 'react'
import {
  useCreateBlockNote,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  FormattingToolbar,
  FormattingToolbarController,
  getFormattingToolbarItems,
} from '@blocknote/react'
import { BlockNoteView, lightDefaultTheme } from '@blocknote/mantine'
import {
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
  filterSuggestionItems,
  type PartialBlock,
} from '@blocknote/core'
import { RefSpec } from './wikiRef'
import { ViewSpec } from './wikiView'
import ListButtons, { BlockKindSelect } from './wikiListButtons'
import { ko } from '@blocknote/core/locales'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'
import { useQuery } from '@tanstack/react-query'
import { api, apiFetch, projectApi } from '@/api/client'
import { reqLabel, reqPk } from '@/types'

/**
 * 편집기 색 — **UTOP 색을 쓴다.**
 *
 * BlockNote 기본 글자색은 #3F3F3F 다. 우리 글자색(#131920)보다 훨씬 옅고
 * 푸른 기가 없어, 같은 화면 안에서 문서 본문만 흐릿하고 누렇게 보인다.
 * 다른 화면의 표·목록과 나란히 놓고 보면 바로 드러난다.
 *
 * CSS 로는 못 덮는다 — BlockNote 는 이 값들을 **인라인 style 변수**로 박아
 * 넣어서, 어떤 선택자를 써도 진다. 그러니 넘겨주는 색표 자체를 고친다.
 *
 * 글에 사람이 칠한 색(사업1담당의 파랑 같은 것)은 **건드리지 않는다.**
 * 그건 BlockNote 팔레트에서 고른 값이 글 안에 박혀 있어, 여기서 바꾸면
 * 이미 쓴 문서의 색이 소리 없이 달라진다.
 */
const THEME = {
  ...lightDefaultTheme,
  colors: {
    ...lightDefaultTheme.colors,
    editor: { text: '#131920', background: '#ffffff' },
    menu: { text: '#131920', background: '#ffffff' },
    tooltip: { text: '#131920', background: '#eef1f4' },
    hovered: { text: '#131920', background: '#eef1f4' },
    selected: { text: '#0d2b3a', background: '#a8d3dd' },
    disabled: { text: '#98a2ad', background: '#f2f4f6' },
    border: '#c3cbd4',
  },
}

/**
 * 종이에 찍을 때의 서식.
 *
 * 바깥 스타일 파일 하나에 종이가 통째로 걸리면 안 된다. 제목 눈금·글머리·
 * 표·코드·간격을 여기서 다 준다 — 앱 CSS 가 실리든 말든 같은 종이가 나온다.
 */
const PRINT_CSS = `
/* 화면용 규칙을 되돌린다 — 이 도구의 화면은 창 높이에 맞춘 틀 안에서
   안쪽만 굴린다. 그대로 찍으면 첫 장 밖이 잘린다. */
html, body { height: auto !important; margin: 0 !important; background: #fff !important; }
* { overflow: visible !important; max-height: none !important; }
/* 다른 화면이 「인쇄하면 저 팝업만」 이라며 body 아래를 다 숨기는 규칙을 둔다.
   앱 CSS 를 들고 오면 그것까지 따라와 종이가 백지가 된다. 되돌린다. */
@media print { body, body * { visibility: visible !important; } }

.wke-body { display: block !important; height: auto !important; padding: 24px !important; }
.bn-editor { padding-inline: 0 !important; }

/* 고르기 칸·손잡이는 종이에서 할 일이 없다 */
.wv-pick, .bn-side-menu, .bn-formatting-toolbar, select, button { display: none !important; }

/* 제목은 **태그로** 집는다. 클래스 이름으로 집었더니 그 이름이 늘 붙는 게
   아니어서, 바깥 크기(26px)는 먹고 안쪽 h1 은 그 2배로 남았다. */
/* **종이 눈금은 pt 로 준다.**
   화면 눈금(px)은 96dpi 기준이라 종이에 그대로 옮기면 한 치수 커진다 —
   워드 원본의 제목 2 가 10pt 인데 우리는 18pt 로 나갔다(지적).
   보고서 눈금으로 맞춘다: 본문 10pt 에 제목이 한 단씩 얹힌다. */
.wke-body .bn-editor { font-size: 10pt !important; line-height: 1.5 !important; }
.wke-body h1:not(.doc), .wke-body h2, .wke-body h3,
.wke-body h4, .wke-body h5, .wke-body h6,
.wke-body .bn-inline-content {
  font-size: inherit !important; font-weight: inherit !important;
  line-height: inherit !important; margin: 0 !important;
}
.wke-body [data-content-type='heading'] { font-weight: 700 !important; padding-top: 14px !important; }
.wke-body [data-content-type='heading']:not([data-level]),
.wke-body [data-content-type='heading'][data-level='1'] { font-size: 16pt !important; }
.wke-body [data-content-type='heading'][data-level='2'] { font-size: 13pt !important; }
.wke-body [data-content-type='heading'][data-level='3'] { font-size: 12pt !important; }
.wke-body [data-content-type='heading'][data-level='4'] { font-size: 11pt !important; }
.wke-body [data-content-type='heading'][data-level='5'] { font-size: 10.5pt !important; }
.wke-body [data-content-type='heading'][data-level='6'] { font-size: 10pt !important; }
h1.doc { font-size: 18pt !important; }

/* 앱 CSS 가 안 실려도 되게 — 글머리·번호·표·코드를 여기서 준다 */
.wke-body .bn-block-outer { margin: 0; }
.wke-body .bn-block-content { padding: 3px 0; display: flex; width: 100%; }
.wke-body [data-content-type='bulletListItem'] > *:first-child,
.wke-body [data-content-type='numberedListItem'] > *:first-child { flex: 1; }
.wke-body [data-content-type='bulletListItem']::before { content: '\\2022'; min-width: 22px; display: inline-block; }
.wke-body [data-content-type='numberedListItem']::before { content: attr(data-index) '.'; min-width: 22px; display: inline-block; }
.wke-body [data-content-type='checkListItem'] input { margin-right: 8px; }
.wke-body [data-content-type='checkListItem'][data-checked='true'] .bn-inline-content { text-decoration: line-through; }
.wke-body p { margin: 0; }
.wke-body a { color: #1f5fb0; }
.wke-body pre { background: #f4f6f8; border: 1px solid #d8dee4; border-radius: 6px;
                padding: 8px 10px; white-space: pre-wrap; font-size: 9pt; }
table { border-collapse: collapse !important; }
th, td { border: 1px solid #b9c1c9 !important; padding: 4px 8px !important; }
img { max-width: 100% !important; height: auto !important; }

/* 표·코드·그림만 쪼개지지 않게 한다.
   제목에 「다음과 붙어라」 를 걸었더니 뒤따르는 표가 크면 제목이 통째로
   다음 장으로 밀려 앞 장이 텅 비었다(지적). 제목 하나 외로워지는 것보다
   빈 장이 나오는 쪽이 훨씬 나쁘다. */
table, pre, .wv, img { break-inside: avoid; }
`

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
  project,
  onSaved,
}: {
  id: string
  title: string
  /** 이 문서가 매인 프로젝트(빈 값 = 공용) */
  project?: string
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

  const prjQ = useQuery({ queryKey: ['projects'], queryFn: ({ signal }) => projectApi.list(signal), staleTime: 60_000 })

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
        {/* 이 문서가 **어느 프로젝트 것인가**(지시).
            만들 때의 프로젝트가 그냥 박히고 끝이면, 「전체」 로 두고 쓴 문서는
            영영 공용으로 남고 잘못 박힌 것은 고칠 길이 없다. 여기서 옮긴다.
            나중에 AI 가 프로젝트별로 문서를 찾을 때 읽는 값이 이것이다. */}
        <span className="wke-prjbox">
        <span>프로젝트</span>
        <select
          className="wke-prj"
          value={project ?? ''}
          title="이 문서가 매인 프로젝트 — 비워 두면 모든 프로젝트에서 보입니다"
          onChange={async (e) => {
            await apiFetch(`/api/wiki/${encodeURIComponent(id)}`, {
              method: 'PATCH',
              body: JSON.stringify({ project: e.target.value }),
            })
            onSaved?.()
          }}
        >
          <option value="">공용 (모든 프로젝트)</option>
          {(prjQ.data?.projects ?? []).map((p) => (
            <option key={p.cat_id} value={p.cat_id}>
              {p.name}
            </option>
          ))}
        </select>
        </span>
        <span className="sp" />
        {/* 워드 가져오기 — 그대로 옮겨 온다(지시: 표·그림·표 안의 표까지).
            .docx 는 압축 파일이라 브라우저가 못 읽는다. 서버가 풀어 HTML 로
            돌려주면 편집기가 그것을 블록으로 읽는다 — 우리가 블록을 손으로
            짜지 않는 까닭은, 편집기가 아는 꼴이 곧 편집기가 다시 열 수 있는
            꼴이기 때문이다. */}
        <label className="btn small wke-imp">
          워드 가져오기
          <input
            type="file"
            accept=".docx"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              setState('saving')
              try {
                const b64 = await new Promise<string>((ok, no) => {
                  const fr = new FileReader()
                  fr.onload = () => ok(String(fr.result ?? ''))
                  fr.onerror = () => no(new Error('파일을 읽지 못했습니다'))
                  fr.readAsDataURL(f)
                })
                const r = await apiFetch('/api/wiki/import-docx', {
                  method: 'POST',
                  body: JSON.stringify({ data: b64 }),
                })
                const j = (await r.json().catch(() => ({}))) as {
                  ok?: boolean
                  html?: string
                  error?: string
                  detail?: string
                  bytes?: number
                  head?: string
                  messages?: string[]
                  nested_tables?: number
                }
                if (!j.ok || !j.html) {
                  /* **왜 안 됐는지 그대로 말한다.**
                     여태 「워드 문서를 읽지 못했습니다」 한 줄로 뭉뚱그려서,
                     서버가 없는 주소를 준 것인지 문서가 이상한 것인지 알 수가
                     없었다(지적). 404 는 서버가 아직 안 올라간 것이다 —
                     그건 문서 탓이 아니므로 그렇게 말해 줘야 한다. */
                  const why =
                    r.status === 404
                      ? '이 서버에는 아직 워드 가져오기가 없습니다 — 서버를 새로 받아 주세요(./update.sh)'
                      : j.error || j.detail || `서버가 ${r.status} 로 답했습니다`
                  /* 서버가 본 것을 **그대로 화면에 낸다.**
                     여태 까닭 한 줄만 띄우고 나머지는 서버 기록에만 남겼다 —
                     그걸 보려면 터미널을 열어야 했다. 크기·파일 머리·변환기
                     알림까지 여기서 말한다. 그 셋이면 옛 .doc 인지, 빈 문서인지,
                     변환기가 걸린 것인지 그 자리에서 갈린다. */
                  const detail = [
                    j.bytes ? `크기 ${j.bytes}B` : '',
                    j.head ? `파일 머리 ${j.head}` : '',
                    ...(j.messages ?? []).slice(0, 3),
                  ]
                    .filter(Boolean)
                    .join('\n')
                  window.alert(
                    `워드 문서를 가져오지 못했습니다.\n\n${why}${detail ? '\n\n' + detail : ''}`,
                  )
                  setState('')
                  return
                }
                const blocks = await editor.tryParseHTMLToBlocks(j.html)
                if (!blocks.length) {
                  window.alert('워드 문서를 읽었지만 옮길 블록이 없습니다.')
                  setState('')
                  return
                }
                /* 지금 글 **뒤에 잇는다.** 덮어쓰면 되돌릴 길이 없다 —
                   문서를 통째로 갈아 끼우려면 사람이 먼저 지우면 된다.

                   빈 문서면 붙일 자리가 없다 — 그때는 통째로 갈아 끼운다.
                   `document[length-1]` 을 그냥 쓰면 빈 문서에서 undefined 라
                   거기서 터진다. */
                const last = editor.document[editor.document.length - 1]
                if (last) editor.insertBlocks(blocks, last, 'after')
                else editor.replaceBlocks(editor.document, blocks)
                dirty.current = true
                await save()
                if (j.nested_tables) {
                  window.alert(
                    `가져왔습니다. 표 안에 있던 표 ${j.nested_tables}개는 편집기가 칸 안에 표를 담지 못해 ` +
                      `바깥 표 뒤로 떼어 놓았습니다 — 「[표 N]」 표시를 따라가면 됩니다.`,
                  )
                }
              } catch (err) {
                window.alert(err instanceof Error ? err.message : String(err))
                setState('')
              }
            }}
          />
        </label>
        {/* PDF — **서버에서 구워 파일로 내려받는다.** 인쇄 창을 거치지
            않는다(지시). 화면을 그리는 엔진과 종이를 찍는 엔진이 같은
            크로미움이라, 화면과 종이가 갈릴 자리가 없다. */}
        <button
          type="button"
          className="btn small"
          title="PDF 파일을 바로 내려받습니다"
          onClick={async () => {
            /* **서버에서 굽는다.**

               여태는 인쇄 창을 띄웠다 — 미리보기가 뜨고 대상을 고르고 저장을
               눌러야 했고, 종이가 화면과 자꾸 갈렸다(인쇄 창이 앱 CSS 를 못
               불러오거나 옛 판을 들고 갔다).

               지금 화면에 그려진 그 HTML 을 그대로 보내 크로미움으로 찍는다.
               화면을 그리는 엔진과 종이를 찍는 엔진이 하나라 갈릴 자리가 없다. */
            const body = document.querySelector('.wke-body .bn-editor')
            if (!body) {
              /* 여기서 조용히 빠져나가면 단추가 **아무 일도 안 하는 것**처럼
                 보인다 — 눌렀는지 안 눌렀는지도 알 수 없다(지적: 동작이 안
                 된다). 못 찾았으면 못 찾았다고 말한다. */
              window.alert('문서 본문을 찾지 못했습니다 — 문서를 열고 다시 눌러 주세요.')
              return
            }
            /* 스타일은 **주소만** 넘긴다.
               style 태그까지 통째로 담으면 몸통이 수백 KB 로 불어, 앞단(nginx)
               의 몸통 크기 제한에 걸려 413 으로 잘린다. 서버는 같은 망 안에
               있으니 주소만 주면 제가 받아 온다. */
            const css = [...document.querySelectorAll('link[rel="stylesheet"]')]
              .map((n) => {
                const href = new URL(
                  (n as HTMLLinkElement).getAttribute('href') ?? '',
                  document.baseURI,
                ).href
                return `<link rel="stylesheet" href="${href}">`
              })
              .join('\n')
            const nm = (title || '문서').replace(/[<>&/\\:*?"|]/g, '')
            const html =
              `<!doctype html><html lang="ko"><head><meta charset="utf-8">` +
              `<base href="${document.baseURI}">${css}` +
              `<style>${PRINT_CSS}</style></head><body>` +
              `<div class="wke-body"><h1 class="doc" style="margin:0 0 20px">${nm}</h1>` +
              `<div class="bn-editor">${body.innerHTML}</div></div></body></html>`
            setState('saving')
            try {
              const r = await apiFetch('/api/wiki/pdf', {
                method: 'POST',
                body: JSON.stringify({ html, title: nm }),
              })
              /* 응답을 **글자로 먼저 받는다.**
                 바로 json() 으로 읽으면, JSON 이 아닌 것이 왔을 때 무엇이
                 왔는지 알 길이 없다 — 「서버가 200 으로 답했다」 한 줄만 남고
                 정작 몸통을 못 본다(지적). 앞부분을 그대로 보여 준다. */
              const raw = await r.text()
              let j: { ok?: boolean; name?: string; data?: string; error?: string } = {}
              try {
                j = JSON.parse(raw)
              } catch {
                /* JSON 이 아니다 — 아래에서 몸통을 그대로 보인다 */
              }
              if (!j.ok || !j.data) {
                const why =
                  j.error ??
                  `서버가 ${r.status} 로 답했습니다\n받은 것(앞부분): ${raw.slice(0, 200)}`
                window.alert(`PDF 를 만들지 못했습니다.\n\n${why}`)
                setState('')
                return
              }
              /* 파일로 떨군다 — 대화상자 없이 바로 내려받힌다 */
              const bin = atob(j.data)
              const buf = new Uint8Array(bin.length)
              for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
              const url = URL.createObjectURL(new Blob([buf], { type: 'application/pdf' }))
              const a = document.createElement('a')
              a.href = url
              a.download = j.name ?? `${nm}.pdf`
              a.click()
              URL.revokeObjectURL(url)
              setState('')
            } catch (e) {
              window.alert(e instanceof Error ? e.message : String(e))
              setState('')
            }
          }}
        >
          PDF 내려받기
        </button>
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
          theme={THEME}
          slashMenu={false}
          formattingToolbar={false}
          onChange={() => {
            if (!ready) return
            dirty.current = true
            setState('')
            window.clearTimeout(timer.current)
            timer.current = window.setTimeout(() => void save(), 2000)
          }}
        >
          {/* 글자를 고르면 뜨는 도구줄 — 기본 단추에 **목록 둘**을 더한다.
              목록은 글을 적는 동안 가장 자주 켜고 끄는 것이라, 종류
              고름표 안에 묻어 두면 매번 두 번 눌러 들어가야 한다.
              들여쓰기·내어쓰기도 목록 바로 옆으로 옮겼다 — 기본 자리는
              맨 끝이라 목록과 멀어 「없다」 로 읽힌다(지적). */}
          <FormattingToolbarController
            formattingToolbar={() => (
              <FormattingToolbar>
                {/* 종류 고름표는 우리 것을 쓴다 — 기본 것은 여러 줄을
                    골라도 첫 줄만 바꾼다(지적). 들여쓰기 둘도 빼고 아래
                    ListButtons 가 목록 바로 옆에서 낸다: 같은 일을 하는
                    단추가 둘이면 하나는 반드시 다르게 동작하게 된다. */}
                <BlockKindSelect />
                {getFormattingToolbarItems().filter(
                  (b) =>
                    b.key !== 'blockTypeSelect' &&
                    b.key !== 'nestBlockButton' &&
                    b.key !== 'unnestBlockButton',
                )}
                <ListButtons />
              </FormattingToolbar>
            )}
          />
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
