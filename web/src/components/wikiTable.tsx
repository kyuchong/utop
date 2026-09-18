import { createReactBlockSpec } from '@blocknote/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/api/client'
import NTable from './ntable/NTable'
import NViews, { type ViewBody, type ViewDef } from './ntable/NViews'
import { useIsAdmin, useMeName } from './ntable/useAdmin'
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
  { key: 'c1', label: '이름', type: 'text', width: 160 },
  { key: 'c2', label: '구분', type: 'select', width: 120, options: [] },
  { key: 'c3', label: '메모', type: 'text', width: 260 },
]

export function newTableId(): string {
  return `wt${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function TableBody({ tid }: { tid: string }) {
  const qc = useQueryClient()
  const [imp, setImp] = useState(false)
  /* ── 보기 탭(지적: 탭 기능이 없다) ─────────────────────────────────
     결함·사이클·시험항목 화면이 쓰는 그 부품을 그대로 단다. 탭은 **열을
     보이게/숨기게·폭·차례**만 담는다(거르기·정렬은 탭에 안 매인다).

     탭이 담는 것을 서버의 열 정의에 쓰지 않는 까닭: 열 정의는 **모두가 같이**
     보는 것이고 탭은 **사람마다** 다르다. 내가 열을 숨겼다고 남의 화면에서도
     사라지면 안 된다. 그래서 탭이 주는 것은 화면에서만 덧입힌다. */
  const [nvId, setNvId] = useState('')
  const [nvBody, setNvBody] = useState<ViewBody | null>(null)
  const isAdmin = useIsAdmin()
  const meName = useMeName()
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
      cols.map((co) => {
        /* **못 박힌 열을 푼다.**
           fixed 는 「지우거나 유형을 못 바꾸는 열」 이라는 뜻인데, 여기는 사람이
           제 표를 만드는 곳이라 첫 열만 특별할 까닭이 없다(지적: 부서로 바꾸려는데
           안 된다 · 인원으로 묶을 수가 없다). 예전에 만든 표에는 이미 박혀 있어
           읽을 때 푼다. */
        const c = co.fixed ? { ...co, fixed: false } : co
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

  /** 고른 탭을 덧입힌 열 — 탭이 없으면 그대로 */
  const colsShown = useMemo(() => {
    if (!nvBody) return colsView
    const hid = new Set(nvBody.hidden ?? [])
    const w = nvBody.widths ?? {}
    const out = colsView.map((c) => ({ ...c, hidden: hid.has(c.key), width: w[c.key] ?? c.width }))
    const ord = nvBody.order
    if (ord?.length) {
      const at = new Map(ord.map((k, n) => [k, n]))
      /* 탭이 모르는 열(탭을 만든 뒤에 생긴 열)은 뒤에 그대로 둔다 */
      out.sort((a, b) => (at.get(a.key) ?? 1e6) - (at.get(b.key) ?? 1e6))
    }
    return out
  }, [colsView, nvBody])

  /** 지금 열 상태 — 탭을 새로 만들거나 고칠 때 이것이 담긴다 */
  const nBody: ViewBody = useMemo(
    () => ({
      hidden: colsShown.filter((c) => c.hidden).map((c) => c.key),
      widths: Object.fromEntries(colsShown.filter((c) => c.width).map((c) => [c.key, c.width!])),
      order: colsShown.map((c) => c.key),
    }),
    [colsShown],
  )

  if (q.isLoading) return <div className="wtb-msg">표를 읽는 중…</div>
  if (q.isError) return <div className="wtb-msg">표를 읽지 못했습니다.</div>

  return (
    <>
      {imp && (
        <Importer
          tid={tid}
          cols={cols}
          onDone={() => qc.invalidateQueries({ queryKey: key })}
          onClose={() => setImp(false)}
        />
      )}
    <NTable
      columns={colsShown}
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
      bulk={[{ k: 'csv', label: '내보내기' }, { k: 'del', label: '삭제', danger: true }]}
      /* 줄을 안 골라도 통째로 내려받는 단추(지시) */
      showExport
      /* 가져오기는 **내보내기 바로 오른쪽**에 선다(지시) — 짝이라 나란히 있어야 한다 */
      onImport={() => setImp(true)}
      /* 닮은 열을 여럿 만드는 표라 복제가 필요하다(지시: 열·필드 복사) */
      canDupCol
      onBulk={(a, ids) => {
        /* csv 는 NTable 이 제 방식(/api/export/xlsx)으로 낸다 — 여기서 가로채면
           우리가 엑셀을 다시 만들어야 한다 */
        if (a === 'del') void post('/rows', { ids }, 'DELETE')
      }}
      onReorder={(ids) => void post('/rows', { order: ids })}
      /* **첫 열을 제목 열로 못박지 않는다**(지적: 부서는 고르는 칸인데 글자를
         입력하게 되어 있다). 제목 열은 제 유형을 무시하고 늘 글자 상자로 열리고
         「(제목 없음)」·「열기」 를 달고 나온다 — 여는 상세 화면이 없는 이 표에서는
         죽은 단추이고, 첫 열을 「부서(선택)」 로 바꾸면 고를 수가 없어진다.
         빈 이름을 주어 어느 열도 제목 취급을 받지 않게 한다. */
      /* 보기 탭은 표마다 따로 — 한 문서에 표가 둘이면 탭도 둘이다 */
      toolbarLeft={
        <NViews
          scope={`wtbl:${tid}`}
          curId={nvId}
          onPick={(v: ViewDef | null) => {
            setNvId(v?.id ?? '')
            setNvBody(v?.body ?? null)
          }}
          current={nBody}
          meName={meName}
          isAdmin={isAdmin}
        />
      }
      titleKey=""
      exportTitle={d?.title || '표'}
      perPage={100}
    />
    </>
  )
}

/**
 * 붙여넣은 글 → 줄·칸.
 *
 * 엑셀·노션에서 **복사**하면 탭으로 갈린 글이 오고, **CSV 로 내려받으면** 쉼표다.
 * 탭이 한 줄에라도 있으면 탭으로 가른다 — 쉼표는 값 안에 흔히 들어 있어
 * (「이재익, 김인겸」) 잘못 가르면 칸이 밀린다.
 *
 * 따옴표 안의 쉼표·줄바꿈은 값으로 본다(엑셀이 그렇게 내보낸다).
 */
export function parseTable(text: string): string[][] {
  const t = String(text || '').replace(/\r\n?/g, '\n').replace(/\n+$/, '')
  if (!t) return []
  const sep = t.includes('\t') ? '\t' : ','
  const out: string[][] = []
  let row: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (q) {
      if (ch === '"') {
        if (t[i + 1] === '"') {
          cur += '"'
          i++
        } else q = false
      } else cur += ch
      continue
    }
    if (ch === '"') q = true
    else if (ch === sep) {
      row.push(cur)
      cur = ''
    } else if (ch === '\n') {
      row.push(cur)
      out.push(row)
      row = []
      cur = ''
    } else cur += ch
  }
  row.push(cur)
  out.push(row)
  return out.map((r) => r.map((x) => x.trim()))
}

/** 값마다 고르게 도는 색 — 견본 표가 쓰는 그 셈 */
function hue(v: string): string {
  let n = 0
  for (const c of v) n = (n * 31 + c.charCodeAt(0)) >>> 0
  return `hsl(${n % 360} 62% 42%)`
}

/**
 * 가져오기 — **붙여넣기**나 CSV 파일로.
 *
 * 노션·엑셀에서 234줄을 손으로 옮겨 칠 수는 없다. 첫 줄을 열 이름으로 보고,
 * 이름이 같은 열에 맞춘다. 없는 이름은 열을 새로 만든다.
 */
/** 「들이지 않음」 · 「새 칸으로」 — 열쇠와 안 겹치게 앞에 표를 붙인다 */
const MAP_SKIP = '\u0000skip'
const MAP_NEW = '\u0000new'

/**
 * 이름 맞추기용 꼴. 빈칸을 떼고 숫자는 값으로 본다 — 「01월」 = 「1월」.
 *
 * 엑셀은 1월, 표는 01월로 쓰는 일이 흔하다. 한 글자 다르다고 딴 칸으로 보면
 * 열두 달이 스물넷이 된다. 서버의 _lbl_norm 과 **같은 규칙**이어야 한다.
 */
const mnorm = (s: string) =>
  s.replace(/\s+/g, '').replace(/\d+/g, (m) => String(parseInt(m, 10))).toLowerCase()

function Importer({
  tid, cols, onDone, onClose,
}: {
  tid: string
  cols: NCol[]
  onDone: () => void
  onClose: () => void
}) {
  const [text, setText] = useState('')
  const [replace, setReplace] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [fname, setFname] = useState('')
  const grid = useMemo(() => parseTable(text), [text])
  const head = grid[0] ?? []
  const body = grid.slice(1)

  /** 엑셀 열 → 표의 칸. 자리(index) → 열쇠 · MAP_NEW · MAP_SKIP */
  const [map, setMap] = useState<string[]>([])

  /** 이름이 같으면 그 칸, 비슷하면 그 칸, 아니면 새로 */
  const guess = useMemo(
    () => (label: string) => {
      const t = label.trim()
      if (!t) return MAP_SKIP
      const exact = cols.find((c) => String(c.label || '').trim() === t)
      if (exact) return exact.key
      const n = mnorm(t)
      const loose = cols.find((c) => mnorm(String(c.label || '')) === n)
      return loose ? loose.key : MAP_NEW
    },
    [cols],
  )

  /* 머리줄이 바뀌면 짝을 새로 추천한다 — 사람이 고친 것은 그때까지 지킨다 */
  const sig = head.join('\u0001')
  useEffect(() => {
    setMap(head.map(guess))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])

  /** 한 칸에 두 열을 넣으면 뒤엣것만 남는다 — 미리 말해 준다 */
  const dup = useMemo(() => {
    const seen = new Map<string, number>()
    const bad = new Set<number>()
    map.forEach((m, i) => {
      if (m === MAP_NEW || m === MAP_SKIP) return
      const f = seen.get(m)
      if (f !== undefined) { bad.add(f); bad.add(i) } else seen.set(m, i)
    })
    return bad
  }, [map])

  const nTake = map.filter((m) => m !== MAP_SKIP).length
  const nNew = map.filter((m) => m === MAP_NEW).length

  /**
   * 고른 파일을 글로 바꿔 넣는다.
   *
   * 엑셀(.xlsx)은 **압축된 덩어리**라 글자로 읽으면 알아볼 수 없는 것이 그대로
   * 들어간다(지적: 가져오기 하면 자료가 깨진다). 서버가 풀어서 탭으로 갈린 글로
   * 돌려주면 아래 미리보기·짝짓기가 전부 그대로 돌아간다 — 길을 둘로 만들지 않는다.
   */
  const pick = async (f: File) => {
    setMsg('')
    setFname(f.name)
    if (/\.xls$/i.test(f.name)) {
      setMsg('옛 엑셀(.xls)은 못 읽습니다 — 엑셀에서 「다른 이름으로 저장 → .xlsx」 로 바꿔 주세요')
      return
    }
    if (!/\.xlsx$/i.test(f.name)) {
      setText(await f.text())
      return
    }
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', f)
      const r = await apiFetch('/api/xlsx-read', { method: 'POST', body: fd })
      const j = (await r.json()) as { ok?: boolean; tsv?: string; detail?: string }
      if (!r.ok || !j.ok) throw new Error(j.detail || '엑셀을 읽지 못했습니다')
      setText(j.tsv || '')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const go = async () => {
    if (!head.length || !body.length) return
    setBusy(true)
    setMsg('')
    try {
      const r = await apiFetch(`/api/wiki-table/${encodeURIComponent(tid)}/import`, {
        method: 'POST',
        body: JSON.stringify({
          header: head,
          rows: body,
          replace,
          mapping: head.map((h, i) => {
            const m = map[i] ?? MAP_NEW
            if (m === MAP_SKIP) return { skip: true }
            if (m === MAP_NEW) return { label: h }
            return { key: m }
          }),
        }),
      })
      const j = (await r.json()) as { ok?: boolean; rows?: number; cols_added?: number; detail?: string }
      if (!r.ok || !j.ok) throw new Error(j.detail || '들이지 못했습니다')
      onDone()
      onClose()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="wtb-back" onMouseDown={onClose}>
      <div className="wtb-imp" onMouseDown={(e) => e.stopPropagation()}>
        <div className="wtb-imph">
          <b>가져오기</b>
          <span className="sp" />
          <button type="button" className="btn small" onClick={onClose}>✕</button>
        </div>

        <p className="wtb-impp">
          엑셀·노션에서 <b>복사해 붙여넣거나</b>, <b>엑셀(.xlsx)</b>·CSV 파일을 고르세요.
          <br />첫 줄은 <b>열 이름</b>으로 봅니다.
        </p>
        <input
          type="file"
          accept=".xlsx,.csv,.tsv,.txt,text/csv"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void pick(f)
          }}
        />

        {/* 자료를 아직 안 받았을 때만 붙여넣기 상자를 크게 연다 — 받고 나면
            자리를 짝짓기에 내준다(229줄이 들어온 판에 원문을 볼 일은 드물다) */}
        {grid.length < 2 ? (
          <textarea
            className="wtb-impt"
            value={text}
            placeholder={'여기에 붙여넣으세요\n\n이름\t부서\t1월\n장수완\tQA팀\t0.5'}
            onChange={(e) => setText(e.target.value)}
          />
        ) : (
          <>
            <div className="wtb-impi">
              {!!fname && <b>{fname}</b>} 줄 <b>{body.length}</b>개 · 열 <b>{head.length}</b>개
              {' — 들일 칸 '}<b>{nTake}</b>개{nNew ? `(새 칸 ${nNew}개)` : ''}
              <span className="sp" />
              <button type="button" className="btn small" onClick={() => setMap(head.map(guess))}>
                자동으로 다시 맞추기
              </button>
              <button type="button" className="btn small" onClick={() => { setText(''); setFname('') }}>
                다시 고르기
              </button>
            </div>

            {/* ── 칸 맞추기(지시) ─────────────────────────────────────────
                이름이 조금만 달라도 자동 맞추기는 어긋난다. 어긋난 채로 들이면
                열이 두 배가 되는데 되돌리기가 번거로우니, **넣기 전에** 사람이
                보고 고치게 한다. 첫 줄 값을 같이 보여 준다 — 이름만으로는 어느
                칸인지 헷갈리는 열이 있다. */}
            <div className="wtb-map">
              <div className="wtb-maph">
                <span>엑셀 열</span><span>첫 줄 값</span><span>표의 칸</span>
              </div>
              <div className="wtb-mapb">
                {head.map((h, i) => (
                  <div className={`wtb-mapr${dup.has(i) ? ' dup' : ''}`} key={i}>
                    <span className="wtb-mapn" title={h}>{h || <i>(이름 없음)</i>}</span>
                    <span className="wtb-mapv" title={body[0]?.[i] || ''}>
                      {body[0]?.[i] || <i>–</i>}
                    </span>
                    <select
                      className="wtb-maps"
                      value={map[i] ?? MAP_NEW}
                      onChange={(e) => {
                        const v = e.target.value
                        setMap((q) => { const n = q.slice(); n[i] = v; return n })
                      }}
                    >
                      <option value={MAP_NEW}>＋ 새 칸으로 만들기</option>
                      <option value={MAP_SKIP}>— 들이지 않음</option>
                      {cols.map((c) => (
                        <option key={c.key} value={c.key}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
            {dup.size > 0 && (
              <div className="wtb-impw">
                같은 칸에 두 열을 넣으면 <b>뒤엣것만 남습니다</b> — 붉은 줄을 고쳐 주세요.
              </div>
            )}
          </>
        )}

        <label className="wtb-impc">
          <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
          있던 줄을 <b>모두 지우고</b> 채웁니다
        </label>
        {!!msg && <div className="wtb-impe">{msg}</div>}
        <div className="wtb-impb">
          <button type="button" className="btn small" onClick={onClose}>닫기</button>
          <button
            type="button"
            className="btn small primary"
            disabled={busy || grid.length < 2 || nTake === 0}
            onClick={() => void go()}
          >
            {busy ? '가져오는 중…' : `${body.length}줄 가져오기`}
          </button>
        </div>
      </div>
    </div>
  )
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
    /**
     * **`isEditable` 로 가리지 않는다.**
     *
     * BlockNote 의 `isEditable` 은 편집기(_tiptapEditor)가 아직 붙기 전이면 그냥
     * **false 를 돌려준다.** 블록이 처음 그려지는 순간이 그때라, 「복제」·「들이기」 를
     * 그 값으로 가리면 안 그려지고 — 편집기가 붙은 뒤에도 **블록을 다시 그리지
     * 않으므로** 영영 없는 상태로 남는다(지적: 열 복제가 또 없다).
     *
     * 위키는 읽기 전용으로 여는 길이 없다(BlockNoteView 에 editable 을 아예 넘기지
     * 않는다). 못 고쳐야 하는 때는 **PDF 로 굽는 중**뿐이고 그때는 CSS 가 단추를
     * 통째로 숨긴다. 그러니 가릴 것이 없다.
     */
    render: ({ block, editor }) => {
      const p = block.props as Props
      return (
        /* 편집기가 이 안의 글쇠를 가로채면 표에서 글을 못 친다 —
           블록을 글 아닌 것으로 못박고 글쇠·붙여넣기를 여기서 멈춘다 */
        <div
          className="wtb"
          contentEditable={false}
          onKeyDown={(e) => e.stopPropagation()}
          onPaste={(e) => e.stopPropagation()}
          /**
           * **이 판을 끌 수 없게 못박는다.**
           *
           * contentEditable={false} 인 덩어리는 브라우저가 통째로 끌 수 있는 것으로
           * 본다. 그래서 칸을 누르고 손이 조금만 움직여도 **표 블록이 들려** 끌기가
           * 시작되고, 그 끌기가 끝나지 못해 그 뒤로 아무것도 안 눌렸다(지적: 필드
           * 클릭하니 먹통 · 새로고침해야 한다). 표 안의 열·행 손잡이는 제 draggable
           * 을 따로 가지므로 이것과 무관하게 그대로 끌린다.
           */
          draggable={false}
          /**
           * **놓기를 편집기보다 먼저 가로챈다.**
           *
           * 편집기(ProseMirror)는 제 DOM 에 네이티브로 놓기를 듣고 있어, 표 안에서
           * 놓아도 그것을 「블록을 옮겨 달라」 로 읽고 **문서를 고쳐 버린다** — 그러면
           * 블록이 다시 그려져 표가 하려던 열 옮기기가 사라진다.
           *
           * 캡처 단계는 편집기의 귀보다 **먼저** 온다. 여기서 preventDefault 만 해 두면
           * 편집기는 「누가 이미 처리했다」 로 보고 스스로 물러나고(defaultPrevented),
           * 전파는 끊지 않으므로 표의 놓기 처리는 그대로 돈다.
           */
          onDropCapture={(e) => e.preventDefault()}
        >
          <div className="wtb-top">
            <input
              className="wtb-name"
              value={p.title}
              placeholder="표 이름"
              onChange={(e) => editor.updateBlock(block, { props: { ...p, title: e.target.value } })}
            />

          </div>
          {p.tid ? (
            <TableBody tid={p.tid} />
          ) : (
            <div className="wtb-msg">표 열쇠가 없습니다 — 블록을 지우고 다시 넣어 주세요.</div>
          )}
        </div>
      )
    },
  },
)
