import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/api/client'
import { parseTable } from '@/lib/parseTable'
import { TI } from './icons'
import { autoOptions, newId, recalcAuto, toNum, type EfColumn, type EfRow } from './model'

/**
 * Effort Plan 가져오기 — 위키 표의 가져오기 팝업과 같은 흐름(지시).
 * 붙여넣기·엑셀(.xlsx)·CSV → 첫 줄을 열 이름으로 → 칸 맞추기(엑셀 열 ↔ 표의 칸) → 지금 연도에 들인다.
 * 엑셀은 서버(/api/xlsx-read)가 풀어 탭 글로 돌려준다 — 위키와 같은 길.
 * 자료는 화면이 고쳐 저장한다(다른 편집과 같은 저장 길 — 서버가 저장 전 상태를 백업한다).
 */

export const MAP_SKIP = '\u0000skip'
export const MAP_NEW = '\u0000new'

/** 이름 맞추기 꼴 — 빈칸을 떼고 숫자는 값으로(「1월」 = 「01월」). 위키 가져오기와 같은 규칙 */
const mnorm = (s: string) => s.replace(/\s+/g, '').replace(/\d+/g, (m) => String(parseInt(m, 10))).toLowerCase()
/** 괄호 안을 뗀 꼴 — 「제품명(프로젝트명)」 = 「제품명(프로젝트)」 */
const bare = (s: string) => mnorm(s.replace(/\([^)]*\)|（[^）]*）/g, ''))

/** 엑셀 열 이름 → 표의 칸. 같은 이름 → 비슷한 이름 → 괄호 뗀 이름(하나뿐일 때) → 새 칸. 합계 열은 들이지 않는다(저절로 계산) */
export function guessMap(label: string, cols: EfColumn[]): string {
  const t = label.trim()
  if (!t) return MAP_SKIP
  const hit =
    cols.find((c) => c.title.trim() === t) ??
    cols.find((c) => mnorm(c.title) === mnorm(t)) ??
    (() => {
      const b = cols.filter((c) => bare(c.title) && bare(c.title) === bare(t))
      return b.length === 1 ? b[0] : undefined
    })()
  if (!hit) return MAP_NEW
  return hit.autoSum ? MAP_SKIP : hit.id
}

const BLANK = new Set(['', '-', '–', '—'])
const asNum = (v: string) => (BLANK.has(v) ? null : toNum(v.replace(/,/g, '')))

/** 새 칸의 유형 — 값이 전부 숫자면 숫자, 값 종류가 적고 겹치면 선택, 아니면 글자 */
export function guessType(vals: string[]): EfColumn['type'] {
  const v = vals.map((x) => x.trim()).filter((x) => !BLANK.has(x))
  if (!v.length) return 'text'
  if (v.every((x) => asNum(x) !== null)) return 'number'
  const kinds = new Set(v).size
  return kinds < v.length && kinds <= Math.max(12, Math.ceil(v.length / 5)) ? 'select' : 'text'
}

/**
 * 들이기 — cols·rows 를 제자리에서 고친다. 돌려주는 값은 알림용 숫자.
 * 숫자 칸에 숫자가 아닌 값(「-」 빼고)은 버리고 센다. 선택 칸에 없는 값은 옵션으로 보탠다.
 */
export function applyImport(cols: EfColumn[], rows: EfRow[], head: string[], body: string[][], map: string[], replace: boolean) {
  const target: Array<EfColumn | null> = head.map((h, i) => {
    const m = map[i] ?? MAP_NEW
    if (m === MAP_SKIP) return null
    if (m === MAP_NEW) {
      const c: EfColumn = { id: newId(), title: h.trim() || `열 ${i + 1}`, type: guessType(body.map((r) => r[i] ?? '')) }
      if (c.type === 'select') c.options = []
      cols.push(c)
      return c
    }
    return cols.find((c) => c.id === m) ?? null
  })
  const out: EfRow[] = []
  let dropped = 0
  body.forEach((r) => {
    const row: EfRow = {}
    target.forEach((c, i) => {
      if (!c || c.autoSum) return
      const v = (r[i] ?? '').trim()
      if (c.type === 'number') {
        const n = asNum(v)
        if (n !== null) row[c.id] = n
        else if (!BLANK.has(v)) dropped++
      } else if (c.type === 'checkbox') {
        if (v) row[c.id] = /^(1|true|y|yes|o|v|✓|✔|예|네)$/i.test(v)
      } else if (v) row[c.id] = v
    })
    if (Object.keys(row).length) out.push(row)
  })
  if (replace) rows.length = 0
  rows.push(...out)
  // 선택 계열 칸 — 들어온 값을 옵션으로(안 하면 칩이 「없는 옵션」 으로 보인다)
  new Set(target.filter((c): c is EfColumn => !!c)).forEach((c) => {
    if (c.type === 'select' || c.type === 'multiselect' || c.type === 'status') autoOptions(rows, c)
  })
  recalcAuto(rows, cols)
  return { added: out.length, colsAdded: target.filter((c, i) => c && map[i] === MAP_NEW).length, dropped }
}

/** 가져오기 팝업 — 위키 「가져오기」 와 같은 배치(설명 · 파일 · 칸 맞추기 · 지우고 채우기 · N줄 가져오기) */
export function EfImport({
  cols,
  rows,
  year,
  onDone,
  onClose,
}: {
  cols: EfColumn[]
  rows: EfRow[]
  year: string
  onDone: (msg: string) => void
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
  const [map, setMap] = useState<string[]>([])
  const sig = head.join('\u0001')
  useEffect(() => {
    setMap(head.map((h) => guessMap(h, cols)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])

  /** 한 칸에 두 열을 넣으면 뒤엣것만 남는다 — 붉게 알린다 */
  const dup = useMemo(() => {
    const seen = new Map<string, number>()
    const bad = new Set<number>()
    map.forEach((m, i) => {
      if (m === MAP_NEW || m === MAP_SKIP) return
      const f = seen.get(m)
      if (f !== undefined) {
        bad.add(f)
        bad.add(i)
      } else seen.set(m, i)
    })
    return bad
  }, [map])
  const nTake = map.filter((m) => m !== MAP_SKIP).length
  const nNew = map.filter((m) => m === MAP_NEW).length

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

  const go = () => {
    if (!head.length || !body.length) return
    if (replace && rows.length && !window.confirm(`${year}년의 ${rows.length}행을 지우고 ${body.length}줄로 채울까요?\n(서버가 저장 전 상태를 백업해 둡니다)`)) return
    const r = applyImport(cols, rows, head, body, map, replace)
    onDone(
      `${r.added}행 가져옴${r.colsAdded ? ` · 새 칸 ${r.colsAdded}개` : ''}${r.dropped ? ` · 숫자가 아닌 값 ${r.dropped}개는 뺐습니다` : ''}`,
    )
    onClose()
  }

  return (
    <div className="ef-imp-back" onMouseDown={onClose}>
      <div className="ef-imp" role="dialog" aria-label="가져오기" onMouseDown={(e) => e.stopPropagation()}>
        <div className="ef-imp-h">
          <b>가져오기</b>
          <span className="ef-imp-yr">{year}년 표로</span>
          <span className="ef-sp" />
          <button type="button" className="ef-imp-x" aria-label="닫기" onClick={onClose}>
            <TI n="x" />
          </button>
        </div>
        <p className="ef-imp-p">
          엑셀·노션에서 <b>복사해 붙여넣거나</b>, <b>엑셀(.xlsx)</b>·CSV 파일을 고르세요.
          <br />첫 줄은 <b>열 이름</b>으로 봅니다.
        </p>
        <input
          type="file"
          className="ef-imp-file"
          accept=".xlsx,.csv,.tsv,.txt,text/csv"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void pick(f)
          }}
        />
        {grid.length < 2 ? (
          <textarea
            className="ef-imp-t"
            value={text}
            placeholder={'여기에 붙여넣으세요\n\n인원\t부서\t1월\n장수완\t검증1팀\t0.5'}
            onChange={(e) => setText(e.target.value)}
          />
        ) : (
          <>
            <div className="ef-imp-i">
              {!!fname && <b>{fname}</b>} 줄 <b>{body.length}</b>개 · 열 <b>{head.length}</b>개{' — 들일 칸 '}
              <b>{nTake}</b>개{nNew ? `(새 칸 ${nNew}개)` : ''}
              <span className="ef-sp" />
              <button type="button" className="ef-btn gh" onClick={() => setMap(head.map((h) => guessMap(h, cols)))}>
                자동으로 다시 맞추기
              </button>
              <button type="button" className="ef-btn gh" onClick={() => { setText(''); setFname('') }}>
                다시 고르기
              </button>
            </div>
            <div className="ef-imp-map">
              <div className="ef-imp-mh">
                <span>엑셀 열</span>
                <span>첫 줄 값</span>
                <span>표의 칸</span>
              </div>
              <div className="ef-imp-mb">
                {head.map((h, i) => (
                  <div className={`ef-imp-mr${dup.has(i) ? ' dup' : ''}${map[i] === MAP_SKIP ? ' skip' : ''}`} key={i}>
                    <span className="ef-imp-mn" title={h}>{h || <i>(이름 없음)</i>}</span>
                    <span className="ef-imp-mv" title={body[0]?.[i] || ''}>{body[0]?.[i] || <i>–</i>}</span>
                    <select
                      className="ef-fsel"
                      value={map[i] ?? MAP_NEW}
                      onChange={(e) => {
                        const v = e.target.value
                        setMap((q) => {
                          const n = q.slice()
                          n[i] = v
                          return n
                        })
                      }}
                    >
                      <option value={MAP_NEW}>＋ 새 칸으로 만들기</option>
                      <option value={MAP_SKIP}>— 들이지 않음</option>
                      {cols.map((c) => (
                        <option key={c.id} value={c.id} disabled={!!c.autoSum}>
                          {c.title}{c.autoSum ? ' (자동 합계)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
            {dup.size > 0 && (
              <div className="ef-imp-w">
                같은 칸에 두 열을 넣으면 <b>뒤엣것만 남습니다</b> — 붉은 줄을 고쳐 주세요.
              </div>
            )}
          </>
        )}
        <label className="ef-imp-c">
          <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
          있던 줄을 <b>모두 지우고</b> 채웁니다
        </label>
        {!!msg && <div className="ef-imp-e">{msg}</div>}
        <div className="ef-imp-b">
          <button type="button" className="ef-btn gh" onClick={onClose}>닫기</button>
          <button type="button" className="ef-btn" disabled={busy || grid.length < 2 || nTake === 0} onClick={go}>
            {busy ? '읽는 중…' : `${body.length}줄 가져오기`}
          </button>
        </div>
      </div>
    </div>
  )
}
