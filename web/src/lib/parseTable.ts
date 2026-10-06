/* 위키 표·Effort Plan 가져오기가 같이 쓴다 — 위키 표 파일에서 옮겨 왔다(Effort Plan 이 BlockNote 를 끌어오지 않게) */

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
