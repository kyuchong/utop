import { useMemo, useRef, useState } from 'react'
import {
  anyTable,
  buildTableCriteria,
  judgeTable,
  parseTable,
  quoteVal,
  readTableCriteria,
  subVars,
  tableCapture,
} from './judge'

interface Props {
  /** 방금 받은 응답 */
  text: string
  /** 지금 판정기준 (다시 열면 눌린 채로 보이게) */
  criteria?: string
  onApply: (criteria: string) => void
  onClose: () => void
  /**
   * 무엇을 만들러 왔나 — 판정기준(judge) · 변수 뽑기(capture).
   *
   * 표를 그려 놓고 누르게 하는 부분은 둘이 똑같다. 다른 것은 「고른 칸으로
   * 무엇을 만드나」 뿐이라 화면을 둘로 나누지 않는다.
   */
  mode?: 'judge' | 'capture'
  /** capture — 이대로 변수로. `list` 는 감싸는 반복이 돌 값 목록이다 */
  onCapture?: (q: {
    var: string
    col: string
    where?: string
    row?: string
    list?: string
    range?: { from: number; to: number }
  }) => void
  /** capture — 이미 쓰고 있는 변수 이름(겹치면 덮어써 버린다) */
  takenVars?: string[]
  /**
   * 이 스텝을 감싸는 반복의 변수 이름. 있으면 `${i}` 를 권한다.
   *
   * 판정에서도 쓴다 — 반복 안에서 `Port=Te0/13` 으로 굳혀 두면 24회를
   * 돌려도 13번 줄만 스물네 번 본다(지적: 이 판정 기준을 못 만들겠다).
   */
  loopVar?: string
}

interface Check {
  col: string
  val: string
  neq?: boolean
}

/**
 * 표에서 골라 판정기준 만들기.
 *
 * `show int status` 같은 표는 contains 로 볼 수 없다. "Gi0/1 이 connected"
 * 를 contains 로 쓰면 아무 줄의 connected 나 걸려서 28포트 중 하나만 살아
 * 있어도 합격이 나온다.
 *
 * 문법(`Port=Gi0/1 => Status=connected`)은 있지만 그걸 손으로 치라고 하면
 * 아무도 안 쓴다. 그래서 **응답을 표로 그려 놓고 누르게** 한다 —
 * 볼 행을 왼쪽에서 고르고, 그 행이 어때야 하는지는 그 값이 있는 칸을
 * 누르면 된다. 만들어진 글자는 아래에 결과로만 보인다.
 */
export default function TcTable({
  text,
  criteria,
  onApply,
  onClose,
  mode = 'judge',
  onCapture,
  takenVars = [],
  loopVar,
}: Props) {
  const cap = mode === 'capture'
  /* 값 뽑기에서는 SNMP 처럼 구분선 없는 출력도 표로 세운다.
     판정 쪽은 예전 그대로 — 판정기준 문법이 구분선 표를 전제한다 */
  const tbl = useMemo(() => (mode === 'capture' ? anyTable(text) : parseTable(text)), [text, mode])
  const prev = useMemo(() => readTableCriteria(criteria ?? ''), [criteria])

  const cols = tbl?.cols ?? []
  const firstNamed = Math.max(
    0,
    cols.findIndex((c) => c.trim()),
  )
  const [keyAt, setKeyAt] = useState(() => {
    const i = prev ? cols.findIndex((c) => c.toLowerCase() === prev.keyCol.toLowerCase()) : -1
    if (i >= 0) return i
    /*
     * SNMP 표(OID·Index·Value)는 **Value 로 찾는다.**
     *
     * 「값이 가장 고유한 열」 규칙을 그대로 두면 OID 가 뽑힌다 — 그러면
     * 「OID 가 …1.2.1.1.${i} 인 행」 이라는, 절대 안 맞는 조건이 만들어진다.
     * 이 장비는 13번 포트만 인덱스가 113 이고 나머지는 포트+1000 이라
     * 인덱스로는 짝지을 수 없다(실제 자료). 사람이 아는 것은 포트 이름이다.
     */
    if (cols[0] === 'OID' && cols[2] === 'Value') return 2
    /* 기본 기준 열 = 값이 가장 고유한 열(Port 같은 것). 첫 열을 쓰면
       show arp 의 Protocol 처럼 전 행이 같은 값이라, 한 행을 찍는 순간
       모든 행이 같이 토글된다(지적: 선택이 이상함). */
    const rows0 = tbl?.rows ?? []
    let best = firstNamed
    let bestN = -1
    cols.forEach((c, ci) => {
      if (!c.trim()) return
      const n = new Set(rows0.map((r) => r[ci] ?? '').filter(Boolean)).size
      if (n > bestN) {
        bestN = n
        best = ci
      }
    })
    return best
  })
  const [keys, setKeys] = useState<string[]>(prev?.keys ?? [])
  const [checks, setChecks] = useState<Check[]>(prev?.checks ?? [])

  /* ── 값 뽑기(capture) ─────────────────────────────────────────
     「어느 열의 값을, 어느 행에서」 두 가지만 고르면 된다. 정규식은
     아무도 안 쓴다(지적) — iTest 의 Response Map 이 하는 일이 이것이다. */
  const [capCol, setCapCol] = useState('')
  const [capVar, setCapVar] = useState('')
  const [capN, setCapN] = useState('1')
  /* 「시작 행 · 마지막 행 · 변수」 세 가지로 끝나야 한다(지시). 조건식을
     사람이 짜게 하지 않는다 — 두 행을 고르면 규칙은 우리가 만든다. */
  const [rowA, setRowA] = useState('')
  const [rowB, setRowB] = useState('')
  /**
   * 행을 **이름으로** 짚을까, **응답에 나온 자리로** 짚을까(지적: 응답 순서
   * 대로 잡히게 하면 안 되나).
   *
   * 이름은 그 줄이 어디로 옮겨 가도 따라간다. 자리는 이름이 서로 다른 두
   * 응답(CLI 의 `Po12` 와 SNMP 의 `…1.5.1001`)을 같은 순번으로 견줄 때 쓴다.
   */
  const [byPos, setByPos] = useState(false)
  /** 회차를 넣어 본 값 — `${i}` 가 든 기준을 지금 표에 대 보려면 필요하다 */
  const subs = (t: string) => (loopVar ? subVars(t, { [loopVar]: capN }) : t)

  const keyCol = cols[keyAt] ?? ''
  const built = buildTableCriteria(keyCol, keys, checks)
  // 만들면서 바로 결과를 본다. 저장하고 실행해 봐야 아는 것이 제일 답답하다.
  const live = checks.length ? judgeTable(text, subs(built)) : null

  if (!tbl) {
    return (
      <div className="tb-wrap">
        <div className="tb-top">
          <b>표에서 고르기</b>
          <button className="btn small" type="button" onClick={onClose}>
            닫기
          </button>
        </div>
        <div className="empty">
          이 응답에서는 표를 못 찾았습니다. <code>-------</code> 구분선이 있는 표 형태
          출력이어야 합니다.
        </div>
      </div>
    )
  }

  const toggleKey = (v: string) =>
    setKeys((k) => (k.includes(v) ? k.filter((x) => x !== v) : [...k, v]))

  /** 마지막으로 누른 행 — Shift 범위 선택의 기준점 */
  const lastRow = useRef(-1)
  const allKvs = [...new Set((tbl?.rows ?? []).map((r) => r[keyAt] ?? ''))].filter(Boolean)
  /**
   * 고른 두 행에서 **반복 규칙**을 뽑는다.
   *
   * `Te0/1` 과 `Te0/24` 를 고르면 「앞은 Te0/ · 뒤는 없음 · 1부터 24까지」.
   * 사람은 시작과 끝만 고르고, `${i}` 를 어디에 넣을지는 우리가 안다.
   * 숫자 자리가 다르게 생겼으면(Po12 ↔ Te0/3) 규칙이 안 나온다 — 그때는
   * 한 행만 보는 것으로 둔다.
   */
  /**
   * 시작 행 ~ 마지막 행 = **표에 있는 그 행들**.
   *
   * 여태는 두 행의 끝 숫자로 등차수열을 만들었다. 포트 이름처럼 1씩 늘어나는
   * 자리에서는 맞았지만, 번호가 띄엄띄엄하면 헛것이 나온다(지적) — OID
   * `…1.5.113` 과 `…1.5.1001` 을 고르면 113~1001, **889행**을 돈다고 나오고
   * 그 사이 대부분은 있지도 않은 행이다. Po12·22·42·52 도 마찬가지로 없는
   * Po32 를 찾다가 「그런 행이 없습니다」 가 됐다.
   *
   * 사람이 고른 것은 「113번부터 1001번까지의 수」가 아니라 **화면에서 이
   * 줄부터 저 줄까지**다. 그러면 표의 차례대로 그 사이 행을 그대로 쓰면 된다.
   */
  const rowsBetween = (() => {
    if (!tbl || !rowA || !rowB || rowA === rowB) return []
    const kvs = tbl.rows.map((r) => r[keyAt] ?? '')
    const a = kvs.indexOf(rowA)
    const b = kvs.indexOf(rowB)
    if (a < 0 || b < 0) return []
    const [lo, hi] = a <= b ? [a, b] : [b, a]
    return kvs.slice(lo, hi + 1).filter(Boolean)
  })()
  /** 고른 구간이 표에서 **몇 번째 줄부터 몇 번째 줄까지**인가 (1부터) */
  const posRange = (() => {
    if (!tbl) return null
    const kvs = tbl.rows.map((r) => r[keyAt] ?? '')
    const a = kvs.indexOf(rowA)
    const b = rowB ? kvs.indexOf(rowB) : a
    if (a < 0) return null
    const [lo, hi] = b < 0 || a <= b ? [a, b < 0 ? a : b] : [b, a]
    return { from: lo + 1, to: hi + 1 }
  })()
  const lv = loopVar || 'i'
  /** 만들어지는 행 조건 — 여러 행이면 `${i}` 자리로, 하나면 그 값 그대로 */
  const capWhereAuto = rowsBetween.length > 1 ? `\${${lv}}` : rowA || rowB
  const allOn = allKvs.length > 0 && allKvs.every((v) => keys.includes(v))
  /** 행 하나 고르기 — Shift 면 지난 번 누른 행부터 범위로 */
  const pickRow = (r: number, kv: string, shift: boolean) => {
    if (shift && lastRow.current >= 0 && tbl) {
      const [a, b] = [Math.min(lastRow.current, r), Math.max(lastRow.current, r)]
      const range = tbl.rows.slice(a, b + 1).map((row) => row[keyAt] ?? '').filter(Boolean)
      setKeys((k) => [...new Set([...k, ...range])])
    } else {
      toggleKey(kv)
    }
    lastRow.current = r
  }

  /** capture — 누른 칸으로 「담을 칸」 을, 그 행으로 시작/마지막 행을 채운다 */
  const pickCap = (c: number, row: string[]) => {
    const col = cols[c] ?? ''
    if (!col) return
    setCapCol(col)
    const kv = row[keyAt] ?? ''
    if (!rowA) setRowA(kv)
    else if (!rowB && kv !== rowA) setRowB(kv)
    if (!capVar) {
      const base = col.toLowerCase().replace(/[^a-z0-9_]/g, '') || 'val'
      const used = new Set(takenVars)
      let name = base
      for (let n = 2; used.has(name) && n < 99; n++) name = `${base}${n}`
      setCapVar(name)
    }
  }

  const toggleCheck = (col: string, val: string) => {
    if (!col) return
    setChecks((cs) => {
      const at = cs.findIndex((c) => c.col === col)
      if (at < 0) return [...cs, { col, val }]
      const cur = cs[at]
      // 같은 열의 같은 값을 다시 누르면 뺀다, 다른 값이면 갈아 끼운다
      if (cur && cur.val === val && !cur.neq) return cs.filter((_, i) => i !== at)
      return cs.map((c, i) => (i === at ? { col, val } : c))
    })
  }

  /** 한 칸이 조건에 맞나 */
  const cellOk = (row: string[], c: number): boolean | null => {
    const chk = checks.find((x) => x.col === (cols[c] ?? ''))
    if (!chk) return null
    const want = subs(chk.val)
    const same = want === '*' ? (row[c] ?? '') !== '' : (row[c] ?? '').toLowerCase() === want.toLowerCase()
    return chk.neq ? !same : same
  }

  /** 이 행을 보고 있나 — 행을 안 고르면 전부 본다 */
  const inScope = (row: string[]) =>
    !keys.length || keys.map(subs).includes(row[keyAt] ?? '')

  /**
   * 행 하나의 참/거짓.
   *
   * 28행짜리 표에서 전체가 적합/부적합만 보면 **어느 행 때문에** 떨어졌는지
   * 를 다시 눈으로 찾아야 한다. 행마다 표시한다.
   */
  const rowOk = (row: string[]): boolean | null => {
    if (!checks.length || !inScope(row)) return null
    return cols.every((_, c) => cellOk(row, c) !== false)
  }

  const scoped = tbl.rows.filter(inScope)
  const bad = scoped.filter((r) => rowOk(r) === false).length

  return (
    <div className="tb-wrap">
      <div className="tb-top">
        <b>{cap ? '표에서 값 뽑기' : '표에서 고르기'}</b>
        <span className="muted small">
          {cap ? (
            <>
              변수로 담고 싶은 <b>칸을 누르세요</b>. 그 칸의 <b>열</b>과 그 행을 찾는{' '}
              <b>조건</b>이 만들어집니다 — 정규식은 안 씁니다.
            </>
          ) : (
            <>
              왼쪽에서 <b>볼 행</b>을 고르고(맨 위 네모 = 전체 · Shift = 범위), 그 행이
              어때야 하는지는 <b>그 값이 있는 칸</b>을 누르세요. 어긋난 행은 붉게 표시됩니다.
            </>
          )}
        </span>
        <button className="btn small" type="button" onClick={onClose}>
          닫기
        </button>
      </div>

      {cap ? (
        <div className="tb-say">
          {/* 시작 행 · 마지막 행 · 변수. 이것 말고는 묻지 않는다(지시) */}
          <label className="tb-key">
            행 찾는 열
            <select
              value={keyAt}
              onChange={(e) => {
                setKeyAt(Number(e.target.value))
                setRowA('')
                setRowB('')
              }}
            >
              {cols.map((c, i) => (
                <option key={i} value={i}>
                  {c || `(${i + 1}번째 열)`}
                </option>
              ))}
            </select>
          </label>
          <span className="tb-sent">
            <label className="tb-key">
              시작 행
              <select value={rowA} onChange={(e) => setRowA(e.target.value)}>
                <option value="">고르세요</option>
                {allKvs.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="tb-key">
              마지막 행
              <select value={rowB} onChange={(e) => setRowB(e.target.value)}>
                <option value="">(한 행만)</option>
                {allKvs.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="tb-key">
              담을 칸
              <select value={capCol} onChange={(e) => setCapCol(e.target.value)}>
                <option value="">고르세요</option>
                {cols
                  .filter((c) => c.trim())
                  .map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
              </select>
            </label>
            <label className="tb-key">
              변수
              <input
                className="tb-in v"
                value={capVar}
                placeholder="이름"
                onChange={(e) => setCapVar(e.target.value.trim())}
              />
            </label>
          </span>
        </div>
      ) : (
      <div className="tb-say">
        {/* 고른 것을 사람 말로 되읽어 준다. 문법을 몰라도 맞게 골랐는지 안다 */}
        <label className="tb-key">
          기준 열
          <select value={keyAt} onChange={(e) => setKeyAt(Number(e.target.value))}>
            {cols.map((c, i) => (
              <option key={i} value={i}>
                {c || `(${i + 1}번째 열)`}
              </option>
            ))}
          </select>
        </label>
        <span className="tb-sent">
          <b>{keys.length ? keys.join(', ') : `${keyCol} 전체`}</b>
          {/* 반복 안이면 회차 번호로 바꿔 준다(지적: 이 판정 기준을 못 만들겠다).
              Te0/13 으로 굳히면 24회를 돌려도 13번 줄만 스물네 번 본다 */}
          {loopVar && keys.length === 1 && !String(keys[0] ?? '').includes('${') ? (
            <button
              className="btn small"
              type="button"
              title={`\${${loopVar}} 로 바꿉니다 — 회차마다 그 회차 줄을 봅니다`}
              onClick={() => {
                const m = /^(.*?)(\d+)(\D*)$/.exec(String(keys[0] ?? ''))
                if (!m) return
                setKeys([`${m[1]}\${${loopVar}}${m[3]}`])
                setCapN(m[2] ?? '1')
              }}
            >
              회차 번호로
            </button>
          ) : null}
          {loopVar && keys.some((k) => k.includes('${')) ? (
            <span className="tb-nwrap">
              회차{' '}
              <input
                className="tb-in n"
                value={capN}
                title="이 회차로 놓고 지금 표에 대 봅니다 — 저장되는 값은 ${회차} 그대로입니다"
                onChange={(e) => setCapN(e.target.value.replace(/\D/g, '') || '1')}
              />{' '}
              일 때
            </span>
          ) : null}{' '}
          행은{' '}
          {checks.length ? (
            checks.map((c, i) => (
              <span key={i} className="tb-chip">
                <button
                  type="button"
                  title="같아야 한다 ↔ 달라야 한다"
                  onClick={() =>
                    setChecks((cs) => cs.map((x, j) => (j === i ? { ...x, neq: !x.neq } : x)))
                  }
                >
                  {c.col} {c.neq ? '가 아니어야' : '가'} <b>{c.val}</b> {c.neq ? '' : '여야'}
                </button>
                <button
                  type="button"
                  className="x"
                  title="빼기"
                  onClick={() => setChecks((cs) => cs.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </span>
            ))
          ) : (
            <i className="muted">— 아래에서 값 칸을 누르세요</i>
          )}{' '}
          합니다.
        </span>
      </div>
      )}

      <div className="tb-scroll">
        <table className="tb">
          <thead>
            <tr>
              {/* 행 전체 체크박스(지적) — 다 고르기 / 다 풀기. Shift 클릭은 범위 */}
              {!cap && (
                <>
                  <th className="tb-pick">
                    <input
                      type="checkbox"
                      title={allOn ? '모든 행 풀기' : '모든 행 고르기'}
                      checked={allOn}
                      onChange={() => setKeys(allOn ? [] : allKvs)}
                    />
                  </th>
                  <th className="tb-v" title="이 행이 조건에 맞나">
                    판정
                  </th>
                </>
              )}
              {cols.map((c, i) => (
                <th
                  key={i}
                  className={`${i === keyAt ? 'k' : ''}${cap ? ' pick' : ''}${
                    cap && c === capCol ? ' picked' : ''
                  }`}
                  title={cap ? `${c} 열의 값을 변수로` : undefined}
                  onClick={() => {
                    if (!cap) return
                    /* 머리줄로도 고를 수 있어야 한다 — 그 열의 칸이 다 비어
                       있으면(Name 처럼) 누를 데가 없다(지적: 「이대로 변수로」
                       가 비활성) */
                    const row = tbl?.rows.find((r) => (r[keyAt] ?? '') !== '')
                    if (row) pickCap(i, row)
                  }}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tbl.rows.map((row, r) => {
              const kv = row[keyAt] ?? ''
              const on = keys.map(subs).includes(kv)
              const v = rowOk(row)
              return (
                <tr
                  key={r}
                  className={`${on ? 'on' : keys.length ? 'off' : ''} ${
                    v === true ? 'r-ok' : v === false ? 'r-bad' : ''
                  }`}
                >
                  {/* 칸 전체가 손잡이 — 체크박스에 preventDefault 를 걸면
                      클릭이 먹다 말다 한다(지적). 박스는 표시만 한다 */}
                  {!cap && (
                    <>
                      <td className="tb-pick" onClick={(e) => pickRow(r, kv, e.shiftKey)}>
                        <input type="checkbox" checked={on} readOnly tabIndex={-1} />
                      </td>
                      <td className="tb-v" title={v === false ? '조건과 다릅니다' : ''}>
                        {v === true ? '✓' : v === false ? '✗' : ''}
                      </td>
                    </>
                  )}
                  {row.map((cell, c) => {
                    const co = cellOk(row, c)
                    return (
                    <td
                      key={c}
                      className={`${c === keyAt ? 'k' : ''} ${
                        co === null ? '' : !inScope(row) ? 'on' : co ? 'ok' : 'bad'
                      }`}
                      onClick={(e) =>
                        cap
                          ? pickCap(c, row)
                          : c === keyAt
                            ? pickRow(r, kv, e.shiftKey)
                            : toggleCheck(cols[c] ?? '', cell)
                      }
                      title={
                        cap
                          ? `이 칸(${cols[c]})의 값을 변수로`
                          : c === keyAt
                            ? '이 행을 보기'
                            : cell
                              ? `${cols[c]} 가 ${cell} 여야 한다`
                              : ''
                      }
                    >
                      {cell}
                    </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {cap ? (
        <div className="tb-foot">
          {/* 무엇이 만들어지는지 사람 말로 — 문법은 안 보여 준다 */}
          <span className="tb-live">
            {capCol && (rowA || rowB) ? (
              rowsBetween.length > 1 && posRange ? (
                <>
                  <b>
                    {rowA} ~ {rowB}
                  </b>{' '}
                  {rowsBetween.length}행 ·{' '}
                  {/* 이름으로 짚을까, 응답에 나온 자리로 짚을까(지적) */}
                  <span className="seg tb-seg">
                    <button
                      type="button"
                      className={`seg-btn${byPos ? '' : ' on'}`}
                      title="그 줄의 이름으로 찾습니다 — 줄이 옮겨 가도 따라갑니다"
                      onClick={() => setByPos(false)}
                    >
                      이름으로
                    </button>
                    <button
                      type="button"
                      className={`seg-btn${byPos ? ' on' : ''}`}
                      title="응답에 나온 차례로 몇 번째 줄인지로 찾습니다 — 이름이 서로 다른 두 응답을 순번으로 견줄 때"
                      onClick={() => setByPos(true)}
                    >
                      응답 순서로
                    </button>
                  </span>{' '}
                  회차{' '}
                  <input
                    className="tb-in n"
                    value={capN}
                    onChange={(e) => setCapN(e.target.value.replace(/\D/g, '') || '1')}
                  />{' '}
                  일 때 <b>{capVar || '변수'}</b> ={' '}
                  <b>
                    {(() => {
                      const nth = Math.max(1, Math.min(rowsBetween.length, Number(capN) || 1))
                      const g = byPos
                        ? tableCapture(text, { col: capCol, row: String(posRange.from + nth - 1) })
                        : tableCapture(
                            text,
                            { col: capCol, where: `${keyCol}=${quoteVal(capWhereAuto)}` },
                            { [lv]: String(rowsBetween[nth - 1] ?? '') },
                          )
                      return g === null ? '(그런 행이 없습니다)' : g || '(빈 칸)'
                    })()}
                  </b>{' '}
                  <i className="muted">
                    {byPos
                      ? `반복을 ${posRange.from} ~ ${posRange.to} 로 둡니다 — 응답의 그 자리 줄을 차례로 봅니다`
                      : `반복이 이 ${rowsBetween.length}행을 차례로 돕니다 (${rowsBetween
                          .slice(0, 3)
                          .join(' · ')}${rowsBetween.length > 3 ? ' …' : ''})`}
                    {' — 「이대로 변수로」 를 누릅니다. 감싸는 반복이 비어 있으면 이 행들을 채워 줍니다(이미 짜 두셨으면 그대로 둡니다)'}
                  </i>
                </>
              ) : (
                <>
                  <b>{rowA || rowB}</b> 한 행 · <b>{capVar || '변수'}</b> ={' '}
                  <b>
                    {(() => {
                      const g = tableCapture(text, {
                        col: capCol,
                        where: `${keyCol}=${quoteVal(capWhereAuto)}`,
                      })
                      return g === null ? '(그런 행이 없습니다)' : g || '(빈 칸)'
                    })()}
                  </b>
                </>
              )
            ) : (
              <i className="muted">표에서 담고 싶은 칸을 누르세요 — 시작 행과 담을 칸이 채워집니다</i>
            )}
          </span>
          <button
            className="btn primary small"
            type="button"
            disabled={!capCol || !capVar || (!rowA && !rowB)}
            title={
              !capCol
                ? '담을 칸을 고르세요'
                : !rowA && !rowB
                  ? '시작 행을 고르세요'
                  : !capVar
                    ? '변수 이름을 적으세요'
                    : '이 값을 변수로 담습니다'
            }
            onClick={() =>
              onCapture?.(
                byPos && rowsBetween.length > 1 && posRange
                  ? {
                      // 응답에 나온 **자리**로 — 반복은 그 자리 번호를 돈다
                      var: capVar,
                      col: capCol,
                      row: `\${${lv}}`,
                      range: posRange,
                    }
                  : {
                      var: capVar,
                      col: capCol,
                      where: `${keyCol}=${quoteVal(capWhereAuto)}`,
                      // 감싸는 반복이 돌 값 — 사람이 고른 그 행들 그대로
                      ...(rowsBetween.length > 1 ? { list: rowsBetween.join(', ') } : {}),
                    },
              )
            }
          >
            이대로 변수로
          </button>
        </div>
      ) : (
      <div className="tb-foot">
        {live && (
          <span className={`tb-live ${live.verdict === 'Pass' ? 'ok' : 'bad'}`}>
            보는 행 <b>{scoped.length}</b> 중 맞는 행 <b>{scoped.length - bad}</b> · 어긋난 행{' '}
            <b>{bad}</b> → 이 스텝은 <b>{live.verdict === 'Pass' ? '적합' : '부적합'}</b>
          </span>
        )}
        <code className="tb-code" title="판정기준 칸에 이대로 들어갑니다">
          {built}
        </code>
        <button
          className="btn primary small"
          type="button"
          disabled={!checks.length}
          onClick={() => onApply(built)}
        >
          이대로 판정기준
        </button>
      </div>
      )}
    </div>
  )
}
