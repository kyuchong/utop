import type { ReactNode } from 'react'
import { tableLayout } from './judge'

/**
 * 응답 블럭화 — iTest Response Map 방식. 규칙 v2 (사진 9장 합의):
 *
 *  1. 표 (구분선 대시 덩어리 2개 이상, 또는 머리줄 방식) → 셀 블럭.
 *     표 인식은 판정기와 같은 파서(tableLayout) 하나만 쓴다 — 일관성 합의.
 *  2. 「키 : 값」 줄 → 콜론 중심으로 **양쪽 다** 블럭.
 *  3. 콤마 나열 줄 (조각 전부 40자 이하) → 조각 블럭. (`show mem us`)
 *  4. 그 외 자유 줄 → 값 모양 토큰 블럭 — IP·프리픽스, [AD/metric],
 *     인터페이스명, 기간, %, 용량, 상태어. (`show ip route` · `show env`)
 *  5. 아무것도 안 걸리면 통과. (날짜 줄 등)
 *
 * 블럭 테두리는 폭 0(box-shadow) — 글자 자리를 안 먹어 표 열이 안 밀린다.
 */

/** 키 32자 이하(글자·숫자로 시작) + 「: 」 + 비어 있지 않은 값 */
const KV = /^(\s*)([A-Za-z0-9][\w .#/()%+-]{0,31}?)(\s*:\s+)(\S.*?)(\s*)$/

/**
 * 값 모양 토큰 — 자유 줄에서 모양만으로 확실한 것들.
 * 순서 주의: 프리픽스 있는 IP 가 맨 앞이어야 `10.1.1.0/24` 가 통으로 잡힌다.
 */
const TOKEN = new RegExp(
  [
    /\d{1,3}(?:\.\d{1,3}){3}(?:\/\d{1,2})?/.source, // IP · 프리픽스
    /\[\d+\/\d+\]/.source, // [AD/metric]
    /(?:[A-Z][A-Za-z]{1,12}\d+(?:\/\d+){1,3})/.source, // TenGi0/1 · Gi0/1/2
    /Port-channel\d+|Vlan\d+|eth\d+/.source, // 인터페이스 이름들
    /\d+w\d+d\d+h/.source, // 01w1d09h
    /\d+(?:\.\d+)?%/.source, // 78.37%
    /\d+(?:\.\d+)?(?:K|M|G)B?(?=[\s,.]|$)/.source, // 2064668K · 10MB
    /not detected|detected|notconnect(?:ed)?|connected|[\w-]+-fail|FAIL|OK(?=[\s,.]|$)|up(?=[\s,.]|$)|down(?=[\s,.]|$)/
      .source, // 상태어
  ].join('|'),
  'g',
)

/** 한 덩어리 블럭 */
const B = ({ children }: { children: ReactNode }) => <span className="bv-b">{children}</span>

/** 자유 글에서 토큰만 블럭으로 */
function tokenize(s: string, key: number): ReactNode {
  const parts: ReactNode[] = []
  let cur = 0
  let m: RegExpExecArray | null
  TOKEN.lastIndex = 0
  let n = 0
  while ((m = TOKEN.exec(s))) {
    if (m.index > cur) parts.push(s.slice(cur, m.index))
    parts.push(<B key={n++}>{m[0]}</B>)
    cur = m.index + m[0].length
    if (m.index === TOKEN.lastIndex) TOKEN.lastIndex++
  }
  if (!parts.length) return s
  if (cur < s.length) parts.push(s.slice(cur))
  return <span key={key}>{parts}</span>
}

export default function BlockText({ text }: { text: string }) {
  const src = String(text ?? '')
  const lines = src.split(/\r?\n/)
  const lay = tableLayout(src)
  const body = new Set(lay?.bodyIdx ?? [])

  const out: ReactNode[] = []
  lines.forEach((ln, i) => {
    if (i) out.push('\n')

    if (lay && i === lay.headIdx) {
      out.push(
        <span key={i} className="bv-hd">
          {ln}
        </span>,
      )
      return
    }

    if (lay && body.has(i)) {
      // 표의 자료 줄 — 판정과 같은 열 자리로 셀을 가른다
      const parts: ReactNode[] = []
      let cur = 0
      lay.cols.forEach(([s, e], c) => {
        const from = Math.min(s, ln.length)
        if (from > cur) parts.push(ln.slice(cur, from))
        const to = e < 0 ? ln.length : Math.min(e, ln.length)
        const seg = ln.slice(from, to)
        const lead = /^\s*/.exec(seg)?.[0] ?? ''
        const rest = seg.slice(lead.length)
        const trail = /\s*$/.exec(rest)?.[0] ?? ''
        const core = rest.slice(0, rest.length - trail.length)
        if (lead) parts.push(lead)
        if (core) parts.push(<B key={c}>{core}</B>)
        if (trail) parts.push(trail)
        cur = Math.max(cur, to)
      })
      if (cur < ln.length) parts.push(ln.slice(cur))
      out.push(<span key={i}>{parts}</span>)
      return
    }

    // 「키 : 값」 — 콜론 중심으로 양쪽 다 (합의: 사진 1)
    const m = KV.exec(ln)
    if (m) {
      out.push(
        <span key={i}>
          {m[1]}
          <B>{m[2]}</B>
          {m[3]}
          <B>{m[4]}</B>
          {m[5]}
        </span>,
      )
      return
    }

    // 콤마 나열 — 조각이 전부 「값 라벨」 꼴(3단어·40자 이하)일 때만.
    // `B* 0.0.0.0/0 [20/0] via …, TenGi0/1, 01w1d09h` 같은 경로 줄은
    // 조각이 문장이라 토큰 규칙으로 넘긴다 — 줄마다 규칙이 왔다갔다
    // 하면 안 된다(합의: 일관성). (사진 2·8)
    if ((ln.match(/,/g) ?? []).length >= 2) {
      const pieces = ln.split(',')
      if (
        pieces.every((p) => {
          const t = p.trim()
          return t.length > 0 && t.length <= 40 && t.split(/\s+/).length <= 3
        })
      ) {
        const parts: ReactNode[] = []
        pieces.forEach((p, c) => {
          const lead = /^\s*/.exec(p)?.[0] ?? ''
          const rest2 = p.slice(lead.length)
          const trail = /\s*$/.exec(rest2)?.[0] ?? ''
          const core = rest2.slice(0, rest2.length - trail.length)
          if (c) parts.push(',')
          if (lead) parts.push(lead)
          if (core) parts.push(<B key={c}>{core}</B>)
          if (trail) parts.push(trail)
        })
        out.push(<span key={i}>{parts}</span>)
        return
      }
    }

    // 자유 줄 — 값 모양 토큰만
    out.push(tokenize(ln, i))
  })
  return <>{out}</>
}
