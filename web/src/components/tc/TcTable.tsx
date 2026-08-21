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
  /** capture — 이대로 변수로 */
  onCapture?: (q: { var: string; col: string; where: string }) => void
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
  const [capWhere, setCapWhere] = useState('')
  const [capVar, setCapVar] = useState('')
  const [capN, setCapN] = useState('1')
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

  /** capture — 누른 칸을 「값 열」 로, 그 행의 기준 값을 「행 조건」 으로 */
  const pickCap = (c: number, row: string[]) => {
    const col = cols[c] ?? ''
    if (!col) return
    setCapCol(col)
    const kv = row[keyAt] ?? ''
    /* 반복 안이면 회차 번호로 바꿔 권한다 — Te0/13 을 그대로 두면 24회를
       돌려도 13번 줄만 스물네 번 본다(그 함정을 여기서 막는다). */
    const m = loopVar ? /^(.*?)(\d+)(\D*)$/.exec(kv) : null
    setCapWhere(m ? `${m[1]}\${${loopVar}}${m[3]}` : kv)
    if (m?.[2]) setCapN(m[2])
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
          {/* 고른 것을 사람 말로 되읽어 준다 — 문법을 몰라도 맞게 골랐는지 안다 */}
          <label className="tb-key">
            행 찾는 열
            <select value={keyAt} onChange={(e) => setKeyAt(Number(e.target.value))}>
              {cols.map((c, i) => (
                <option key={i} value={i}>
                  {c || `(${i + 1}번째 열)`}
                </option>
              ))}
            </select>
          </label>
          <span className="tb-sent">
            <b>{keyCol}</b> 가{' '}
            <input
              className="tb-in"
              value={capWhere}
              placeholder={loopVar ? `Te0/\${${loopVar}}` : '값'}
              onChange={(e) => setCapWhere(e.target.value)}
              title="이 행을 찾는 값. 반복 안이면 회차 번호를 넣으세요"
            />{' '}
            인 행의 <b>{capCol || '— 칸을 누르세요'}</b> 칸을{' '}
            <input
              className="tb-in v"
              value={capVar}
              placeholder="변수 이름"
              onChange={(e) => setCapVar(e.target.value.trim())}
              title="이 값을 담을 변수 이름"
            />{' '}
            에 담습니다.
            {loopVar && !capWhere.includes('${') && capWhere ? (
              <button
                className="btn small"
                type="button"
                title={`회차 번호(\${${loopVar}})로 바꿉니다 — 그래야 회차마다 다른 행을 봅니다`}
                onClick={() => {
                  const m = /^(.*?)(\d+)(\D*)$/.exec(capWhere)
                  if (m) {
                    setCapWhere(`${m[1]}\${${loopVar}}${m[3]}`)
                    setCapN(m[2] ?? '1')
                  }
                }}
              >
                회차 번호로
              </button>
            ) : null}
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
          {/* 지금 이 출력에서 실제로 뭐가 잡히는지 바로 보여 준다.
              저장하고 돌려 봐야 아는 것이 제일 답답하다. */}
          {loopVar && capWhere.includes('${') ? (
            <span className="tb-live">
              회차{' '}
              <input
                className="tb-in n"
                value={capN}
                onChange={(e) => setCapN(e.target.value.replace(/\D/g, '') || '1')}
              />{' '}
              일 때 →{' '}
              <b>
                {(() => {
                  const g = tableCapture(
                    text,
                    { col: capCol, where: `${keyCol}=${quoteVal(capWhere)}` },
                    { [loopVar]: capN },
                  )
                  return g === null ? '(그런 행이 없습니다)' : g || '(빈 칸)'
                })()}
              </b>
            </span>
          ) : capCol && capWhere ? (
            <span className="tb-live">
              지금 잡히는 값 →{' '}
              <b>
                {(() => {
                  const g = tableCapture(text, {
                    col: capCol,
                    where: `${keyCol}=${quoteVal(capWhere)}`,
                  })
                  return g === null ? '(그런 행이 없습니다)' : g || '(빈 칸)'
                })()}
              </b>
            </span>
          ) : null}
          <code className="tb-code" title="이대로 스텝에 들어갑니다">
            {capVar || '변수'} = {keyCol}={capWhere || '…'} 행의 {capCol || '…'} 칸
          </code>
          {/* 못 누르는 단추만 있고 까닭이 없으면 사람은 멈춘다(지적) */}
          {(!capCol || !capVar || !capWhere) && (
            <span className="tb-need">
              {!capCol
                ? '담을 값이 있는 칸(또는 열 이름)을 누르세요'
                : !capWhere
                  ? '어느 행인지 적으세요'
                  : '변수 이름을 적으세요'}
            </span>
          )}
          <button
            className="btn primary small"
            type="button"
            disabled={!capCol || !capVar || !capWhere}
            title={
              !capCol
                ? '값이 있는 칸이나 열 이름을 먼저 누르세요'
                : !capWhere
                  ? '행 조건이 비었습니다'
                  : !capVar
                    ? '변수 이름이 비었습니다'
                    : '이 값을 변수로 담습니다'
            }
            onClick={() =>
              onCapture?.({
                var: capVar,
                col: capCol,
                where: `${keyCol}=${quoteVal(capWhere)}`,
              })
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
