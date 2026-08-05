import { useMemo, useState } from 'react'
import { buildTableCriteria, judgeTable, parseTable, readTableCriteria } from './judge'

interface Props {
  /** 방금 받은 응답 */
  text: string
  /** 지금 판정기준 (다시 열면 눌린 채로 보이게) */
  criteria?: string
  onApply: (criteria: string) => void
  onClose: () => void
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
export default function TcTable({ text, criteria, onApply, onClose }: Props) {
  const tbl = useMemo(() => parseTable(text), [text])
  const prev = useMemo(() => readTableCriteria(criteria ?? ''), [criteria])

  const cols = tbl?.cols ?? []
  const firstNamed = Math.max(
    0,
    cols.findIndex((c) => c.trim()),
  )
  const [keyAt, setKeyAt] = useState(() => {
    const i = prev ? cols.findIndex((c) => c.toLowerCase() === prev.keyCol.toLowerCase()) : -1
    return i >= 0 ? i : firstNamed
  })
  const [keys, setKeys] = useState<string[]>(prev?.keys ?? [])
  const [checks, setChecks] = useState<Check[]>(prev?.checks ?? [])

  const keyCol = cols[keyAt] ?? ''
  const built = buildTableCriteria(keyCol, keys, checks)
  // 만들면서 바로 결과를 본다. 저장하고 실행해 봐야 아는 것이 제일 답답하다.
  const live = checks.length ? judgeTable(text, built) : null

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
    const same = (row[c] ?? '').toLowerCase() === chk.val.toLowerCase()
    return chk.neq ? !same : same
  }

  /** 이 행을 보고 있나 — 행을 안 고르면 전부 본다 */
  const inScope = (row: string[]) => !keys.length || keys.includes(row[keyAt] ?? '')

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
        <b>표에서 고르기</b>
        <span className="muted small">
          왼쪽에서 <b>볼 행</b>을 고르고, 그 행이 어때야 하는지는 <b>그 값이 있는 칸</b>을
          누르세요.
        </span>
        <button className="btn small" type="button" onClick={onClose}>
          닫기
        </button>
      </div>

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
          <b>{keys.length ? keys.join(', ') : `${keyCol} 전체`}</b> 행은{' '}
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

      <div className="tb-scroll">
        <table className="tb">
          <thead>
            <tr>
              <th className="tb-pick" />
              <th className="tb-v" title="이 행이 조건에 맞나">판정</th>
              {cols.map((c, i) => (
                <th key={i} className={i === keyAt ? 'k' : ''}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tbl.rows.map((row, r) => {
              const kv = row[keyAt] ?? ''
              const on = keys.includes(kv)
              const v = rowOk(row)
              return (
                <tr
                  key={r}
                  className={`${on ? 'on' : keys.length ? 'off' : ''} ${
                    v === true ? 'r-ok' : v === false ? 'r-bad' : ''
                  }`}
                >
                  <td className="tb-pick">
                    <input type="checkbox" checked={on} onChange={() => toggleKey(kv)} />
                  </td>
                  <td className="tb-v" title={v === false ? '조건과 다릅니다' : ''}>
                    {v === true ? '✓' : v === false ? '✗' : ''}
                  </td>
                  {row.map((cell, c) => {
                    const co = cellOk(row, c)
                    return (
                    <td
                      key={c}
                      className={`${c === keyAt ? 'k' : ''} ${
                        co === null ? '' : !inScope(row) ? 'on' : co ? 'ok' : 'bad'
                      }`}
                      onClick={() => (c === keyAt ? toggleKey(kv) : toggleCheck(cols[c] ?? '', cell))}
                      title={
                        c === keyAt
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
    </div>
  )
}
