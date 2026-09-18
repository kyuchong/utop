import { createReactBlockSpec } from '@blocknote/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { apiFetch } from '@/api/client'
import NTable from './ntable/NTable'
import { EMPTY_VIEW, type NCalc, type NCol, type NRow, type NView } from './ntable/types'
import { useUserPeople } from '@/pages/qaBits'
import './wikiTable.css'

/**
 * 문서 안의 **표** — 노션식 데이터베이스(지시: 위키에서 인원 투입 현황을 관리한다).
 *
 * 표를 그리고 거르고 세는 일은 **이미 있는 부품**(ntable)이 그대로 한다. 결함·
 * 사이클·지라 이슈 화면이 쓰는 그 표다. 여기서 하는 일은 그 부품에 자료를 대 주고,
 * 사람이 고친 것을 서버에 싣는 것뿐이다.
 *
 * **블록에는 표의 열쇠(tid)만 담는다.** 열·행을 블록에 담으면
 *   · 칸 하나를 고칠 때마다 문서 전체가 다시 저장되고(행 500 이면 저장 한 번에
 *     15만 자가 되돌리기 기록에 영구 누적된다),
 *   · 저장하는 사람이 방에서 한 명뿐이라 남이 지운 행이 낡은 창에서 되살아나며,
 *   · 두 사람이 **다른 칸**을 고쳐도 yjs 가 속성을 통째로 바꿔 한쪽이 조용히 사라진다.
 * 「살아 있는 표」(utopView)가 숫자가 아니라 질의를 담는 것과 같은 까닭이다.
 */
type Props = { tid: string; title: string }

interface Head {
  id: string
  title: string
  cols: NCol[]
  calcs: Record<string, NCalc>
  view: NView
  rows: NRow[]
}

/** 처음 세울 때의 열 — 사람이 바로 고칠 수 있으니 뜻만 통하면 된다 */
const FIRST_COLS: NCol[] = [
  { key: 'c1', label: '이름', type: 'text', width: 160, fixed: true },
  { key: 'c2', label: '구분', type: 'select', width: 120, options: [] },
  { key: 'c3', label: '메모', type: 'text', width: 260 },
]

export function newTableId(): string {
  return `wt${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function TableBody({ tid, editable }: { tid: string; editable: boolean }) {
  const qc = useQueryClient()
  const key = ['wiki-tbl', tid]
  const people = useUserPeople()

  const q = useQuery({
    queryKey: key,
    enabled: !!tid,
    staleTime: 5_000,
    queryFn: async (): Promise<Head> => {
      const r = await apiFetch(`/api/wiki-table/${encodeURIComponent(tid)}`)
      if (!r.ok) throw new Error('표를 읽지 못했습니다')
      const j = (await r.json()) as Head
      return {
        ...j,
        cols: Array.isArray(j.cols) && j.cols.length ? j.cols : FIRST_COLS,
        view: { ...EMPTY_VIEW, ...(j.view || {}) },
        calcs: j.calcs || {},
        rows: j.rows || [],
      }
    },
  })

  const post = async (path: string, body: unknown, method = 'POST') => {
    await apiFetch(`/api/wiki-table/${encodeURIComponent(tid)}${path}`, {
      method,
      body: JSON.stringify(body),
    })
    await qc.invalidateQueries({ queryKey: key })
  }

  /* 머리(이름·열·집계·보기)는 **보낸 것만** 바뀐다 — 안 보낸 칸은 서버가 그대로 둔다 */
  const head = useMutation({
    mutationFn: (x: Partial<Pick<Head, 'title' | 'cols' | 'calcs' | 'view'>>) => post('/head', x),
  })

  /* 칸 하나는 그 줄만 고친다. 화면은 **먼저 바꿔 두고**(기다리면 글자가 튄다)
     서버가 답하면 다시 읽는다 */
  const cell = useMutation({
    mutationFn: (x: { rid: string; key: string; value: string }) => post('/cell', x),
    onMutate: async (x) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Head>(key)
      if (prev) {
        qc.setQueryData<Head>(key, {
          ...prev,
          rows: prev.rows.map((r) => (r.__id === x.rid ? { ...r, [x.key]: x.value } : r)),
        })
      }
      return { prev }
    },
    onError: (_e, _x, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
    },
  })

  const d = q.data
  const cols = d?.cols ?? FIRST_COLS
  const rows = d?.rows ?? []

  /* 선택지는 **자료에서 뽑는다** — 값이 늘 때마다 열 설정을 고치지 않게 */
  const colsView = useMemo(
    () =>
      cols.map((c) => {
        if (c.type !== 'select' && c.type !== 'multiselect') return c
        if (c.options && c.options.length) return c
        const vals = new Set<string>()
        for (const r of rows) {
          for (const v of String(r[c.key] ?? '').split(',')) {
            const t = v.trim()
            if (t) vals.add(t)
          }
        }
        return { ...c, options: [...vals].map((v) => ({ value: v, color: hue(v) })) }
      }),
    [cols, rows],
  )

  if (q.isLoading) return <div className="wtb-msg">표를 읽는 중…</div>
  if (q.isError) return <div className="wtb-msg">표를 읽지 못했습니다.</div>

  return (
    <NTable
      columns={colsView}
      rows={rows}
      view={d?.view ?? EMPTY_VIEW}
      onView={(v) => head.mutate({ view: v })}
      onColumns={(c) => head.mutate({ cols: c })}
      onCell={(rid, k, v) => cell.mutate({ rid, key: k, value: v })}
      calcs={d?.calcs ?? {}}
      onCalcs={(v) => head.mutate({ calcs: v })}
      people={people}
      onNew={(seed) =>
        void post('/rows', seed ? { seed: { [seed.key]: seed.value } } : {})
      }
      /* 엑셀은 기본 목록에 있던 것을 되살린다 — 내가 덮어써서 사라졌다 */
      bulk={[{ k: 'csv', label: '엑셀' }, { k: 'del', label: '삭제', danger: true }]}
      /* 줄을 안 골라도 통째로 내려받는 단추(지시) */
      showExport
      /* 닮은 열을 여럿 만드는 표라 복제가 필요하다(지시: 열·필드 복사) */
      canDupCol
      onBulk={(a, ids) => {
        /* csv 는 NTable 이 제 방식(/api/export/xlsx)으로 낸다 — 여기서 가로채면
           우리가 엑셀을 다시 만들어야 한다 */
        if (a === 'del') void post('/rows', { ids }, 'DELETE')
      }}
      onReorder={(ids) => void post('/rows', { order: ids })}
      /* 읽기 전용 문서에서는 열 정의를 잠근다 — 값도 NTable 이 함께 막는다 */
      lockDefs={!editable}
      titleKey={cols[0]?.key}
      exportTitle={d?.title || '표'}
      perPage={100}
    />
  )
}

/** 값마다 고르게 도는 색 — 견본 표가 쓰는 그 셈 */
function hue(v: string): string {
  let n = 0
  for (const c of v) n = (n * 31 + c.charCodeAt(0)) >>> 0
  return `hsl(${n % 360} 62% 42%)`
}

export const TableSpec = createReactBlockSpec(
  {
    type: 'utopTable',
    /* 열쇠와 이름만. 값은 원시형이어야 안전하다(속성은 ProseMirror 의 attribute 로
       내려가고 복사·붙여넣기 때 HTML 을 거친다) */
    propSchema: { tid: { default: '' }, title: { default: '' } },
    content: 'none',
  },
  {
    render: ({ block, editor }) => {
      const p = block.props as Props
      const editable = editor.isEditable
      return (
        /* 편집기가 이 안의 글쇠를 가로채면 표에서 글을 못 친다 —
           블록을 글 아닌 것으로 못박고 글쇠·붙여넣기를 여기서 멈춘다 */
        <div
          className="wtb"
          contentEditable={false}
          onKeyDown={(e) => e.stopPropagation()}
          onPaste={(e) => e.stopPropagation()}
        >
          <div className="wtb-top">
            <input
              className="wtb-name"
              value={p.title}
              placeholder="표 이름"
              readOnly={!editable}
              onChange={(e) => editor.updateBlock(block, { props: { ...p, title: e.target.value } })}
            />
          </div>
          {p.tid ? (
            <TableBody tid={p.tid} editable={editable} />
          ) : (
            <div className="wtb-msg">표 열쇠가 없습니다 — 블록을 지우고 다시 넣어 주세요.</div>
          )}
        </div>
      )
    },
  },
)
