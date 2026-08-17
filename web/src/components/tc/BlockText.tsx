import type { ReactNode } from 'react'
import { tableLayout } from './judge'

/**
 * 응답 블럭화 (1단계 — 보여주기).
 *
 * iTest 의 Response Map 처럼 출력에 지도를 씌운다: 표 셀과 「키 : 값」의
 * 값에 테두리 블럭이 생긴다. 다음 단계에서 이 블럭을 눌러 쿼리(값 집기)와
 * 분석(기준 만들기)을 만든다.
 *
 * **일관성(합의)**: 표 인식은 판정기와 같은 파서(judge.ts 의 tableLayout)
 * 하나만 쓴다 — 표시와 판정이 서로 다른 표를 보는 일이 없다.
 * 키:값 규칙도 이 파일의 KV 한 줄뿐이다.
 */

/** 키 32자 이하(글자로 시작) + 「: 」 + 비어 있지 않은 값 */
const KV = /^(\s*)([A-Za-z0-9][\w .#/()%+-]{0,31}?)(\s*:\s+)(\S.*?)(\s*)$/

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
        if (core)
          parts.push(
            <span key={c} className="bv-b">
              {core}
            </span>,
          )
        if (trail) parts.push(trail)
        cur = Math.max(cur, to)
      })
      if (cur < ln.length) parts.push(ln.slice(cur))
      out.push(<span key={i}>{parts}</span>)
      return
    }

    const m = KV.exec(ln)
    if (m) {
      out.push(
        <span key={i}>
          {m[1]}
          {m[2]}
          {m[3]}
          <span className="bv-b">{m[4]}</span>
          {m[5]}
        </span>,
      )
      return
    }

    out.push(ln)
  })
  return <>{out}</>
}
