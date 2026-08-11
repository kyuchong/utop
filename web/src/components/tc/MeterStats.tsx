import type { MeterStream } from './types'
import './MeterStats.css'

/**
 * 계측기 측정 한 줄 — 데몬이 주는 이름 그대로.
 *
 * `idx` 는 스트림 차례다. 이름을 붙여 보내지 않으므로 그것으로 되짚어
 * 어느 스트림인지 적는다.
 */
export interface StatRow {
  idx?: number
  /** 그 스트림의 몇 번째 갈래인가(0-기준). 갈래를 여럿 뿌릴 때 붙는다 */
  sub?: number
  tx?: unknown
  rx?: unknown
  txOct?: unknown
  rxOct?: unknown
  txTput?: unknown
  rxTput?: unknown
  loss?: unknown
  latency?: unknown
  misorder?: unknown
  /** STC 는 이름을 함께 준다 */
  name?: unknown
  [k: string]: unknown
}

/** 「-」·빈칸·글자가 섞여 온다. 못 읽으면 0 이다 */
export function statNum(v: unknown): number {
  const n = Number(String(v ?? '').replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

/** 값이 없으면 「–」. 0 은 값이다 — 「–」 로 적으면 안 잰 것처럼 보인다 */
function show(v: unknown, digits = 0): string {
  const raw = String(v ?? '').trim()
  if (!raw || raw === '-') return '–'
  const n = Number(raw.replace(/,/g, ''))
  if (!Number.isFinite(n)) return raw
  return digits ? n.toFixed(digits) : n.toLocaleString()
}

interface Props {
  rows: StatRow[]
  /** 이 TC 의 스트림 — 「4106/1→4106/2」 를 붙이는 데 쓴다 */
  streams?: MeterStream[]
  /**
   * 이 섀시가 실제로 재는 항목(`tx`·`rxtput`…).
   *
   * N2X 빌드마다 되는 통계 상수가 다르다. 안 재는 열은 값이 영영 안 오는데,
   * 그것을 모르면 「안 흐르나」 와 「이 섀시가 안 재나」 를 못 가른다.
   */
  keys?: string[]
  /** 아직 안 읽었을 때 스트림 이름만이라도 줄로 보여준다 */
  placeholder?: boolean
  /**
   * 칸을 눌렀을 때 — 그 자리를 판정 규칙으로 삼는다.
   *
   * 「어느 칸을 무엇과 견주는가」 가 곧 판정이다. 열 이름과 스트림 번호를
   * 손으로 적게 하면 오타가 나고, 오타는 돌려 봐야 안다. 본 것을 그대로
   * 누르게 한다.
   */
  onPickCell?: (field: string, idx: number, value: number) => void
}

/**
 * 측정 결과 표.
 *
 * 열 이름·차례는 N2X 의 Setup Measurements→Streams 와 같다. 계측기 화면과
 * 나란히 놓고 대 보는 자리라, 여기서만 다른 말로 적으면 그때마다 짝을
 * 맞춰야 한다. 없는 열을 하나 끼워 넣어도 눈이 한 칸씩 어긋난다.
 *
 * Traffic 탭과 스텝 결과가 같은 부품을 쓴다. 두 벌로 두면 한쪽만 고치게
 * 되고, 그러면 같은 측정이 화면마다 다르게 보인다.
 */
export default function MeterStats({
  rows,
  streams = [],
  keys = [],
  placeholder,
  onPickCell,
}: Props) {
  const has = (k: string) => keys.length === 0 || keys.includes(k)
  const th = (label: string, k: string) => (
    <th
      className={has(k) ? undefined : 'ms-off'}
      title={has(k) ? undefined : '이 섀시가 재지 않는 항목입니다'}
    >
      {label}
      {!has(k) && ' *'}
    </th>
  )

  /**
   * 줄 이름.
   *
   * 한 스트림을 열 갈래로 뿌리면 열 줄이 나오는데 이름이 다 같았다 —
   * `Stream_1` 이 열 번. 어느 갈래가 죽었는지 짚을 수가 없다. 몇 번째
   * 갈래인지를 뒤에 붙인다(`Stream_1.3`). 갈래가 하나뿐이면 안 붙인다.
   */
  const label = (r: StatRow, i: number) => {
    const st = streams[typeof r.idx === 'number' ? r.idx : i]
    const path = st?.src ? `${st.src}→${st.dst}, ` : ''
    const base = String(r.name ?? st?.name ?? `Stream_${i + 1}`)
    const nSub = rows.filter((x) => x.idx === r.idx).length
    const sub = typeof r.sub === 'number' && nSub > 1 ? `.${r.sub + 1}` : ''
    return `${path}${base}${sub}`
  }

  return (
    <div className="ms-wrap">
      <table className="ms-table">
        <thead>
          <tr>
            <th>Stream</th>
            {th('Tx Test Packets', 'tx')}
            {th('Rx Test Packets', 'rx')}
            {th('Tx Test Octets', 'txoct')}
            {th('Rx Test Octets', 'rxoct')}
            {th('Tx Throughput (Mb/s)', 'txtput')}
            {th('Rx Throughput (Mb/s)', 'rxtput')}
            {th('Rx Packet Loss', 'loss')}
            {th('Avg Latency (us)', 'lat')}
            {th('Sequence Errors', 'seq')}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            placeholder && streams.length > 0 ? (
              streams.map((st, i) => (
                <tr key={i}>
                  <td className="mono">
                    {st.src ? `${st.src}→${st.dst}, ` : ''}
                    {st.name ?? `Stream_${i + 1}`}
                  </td>
                  {Array.from({ length: 9 }, (_, k) => (
                    <td key={k}>–</td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td className="ms-empty" colSpan={10}>
                  측정값이 없습니다
                </td>
              </tr>
            )
          ) : (
            <>
              {rows.map((r, i) => {
                const loss = statNum(r.loss)
                return (
                  <tr key={i} className={loss > 0 ? 'bad' : undefined}>
                    <td className="mono">{label(r, i)}</td>
                    {(
                      [
                        ['tx', 0],
                        ['rx', 0],
                        ['txOct', 0],
                        ['rxOct', 0],
                        ['txTput', 3],
                        ['rxTput', 3],
                        ['loss', 0],
                        ['latency', 2],
                        ['misorder', 0],
                      ] as Array<[string, number]>
                    ).map(([f, dg]) => {
                      const v = statNum(r[f])
                      const isBad = (f === 'loss' || f === 'misorder') && v > 0
                      const idx = typeof r.idx === 'number' ? r.idx : i
                      return (
                        <td
                          key={f}
                          className={`${isBad ? 'bad' : ''}${onPickCell ? ' pick' : ''}`}
                          title={onPickCell ? '이 칸으로 판정 규칙을 만듭니다' : undefined}
                          onClick={onPickCell ? () => onPickCell(f, idx, v) : undefined}
                        >
                          {show(r[f], dg)}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </>
          )}
        </tbody>
      </table>
      {keys.length > 0 && keys.length < 9 && (
        <div className="ms-note">
          이 섀시가 재는 항목은 {keys.length}가지입니다 — <b>*</b> 표시한 열은 값이 오지 않습니다.
        </div>
      )}
    </div>
  )
}

/**
 * 스텝 결과에 담긴 계측기 응답에서 표에 쓸 것만 꺼낸다.
 *
 * 응답을 날 JSON 으로 보여 주고 있었다. 무엇이 오는지는 알 수 있지만
 * 「스트림 2번이 하나도 못 받았다」 를 읽으려면 중괄호를 세어야 한다.
 * 읽히면 표로, 안 읽히면 원문 그대로 둔다 — 못 읽었다고 감추면 그때야말로
 * 아무것도 모른다.
 */
export function parseMeterOutput(
  text?: string,
): { rows: StatRow[]; keys: string[]; running?: boolean; state?: string } | null {
  const s = (text ?? '').trim()
  if (!s.startsWith('{')) return null
  try {
    const j = JSON.parse(s) as {
      streams?: StatRow[]
      keys?: string
      running?: boolean
      state?: string
    }
    if (!Array.isArray(j.streams)) return null
    return {
      rows: j.streams,
      keys: String(j.keys ?? '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
      running: j.running,
      state: j.state,
    }
  } catch {
    return null
  }
}
