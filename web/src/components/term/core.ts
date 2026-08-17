import { apiFetch } from '@/api/client'

/**
 * 터미널 공용 심장부 — 랙뷰 터미널(RackTerm)과 스텝 명령어 캡쳐(TcTerminal)가
 * 같이 쓴다. **여기 한 곳을 고치면 두 화면에 같이 적용된다**(합의).
 *
 * 두 화면이 SSE 읽기·명령 히스토리·로그 저장을 각자 들고 있어서, 한쪽에
 * 넣은 개선(빈 엔터·포커스 규칙 등)이 다른 쪽에 없었다.
 */

/** SSE 로 명령 하나를 보내고 응답 조각을 받는다 */
export async function streamCli(
  params: Record<string, unknown>,
  cmd: string,
  onChunk: (s: string) => void,
  onError: (s: string) => void,
): Promise<void> {
  const r = await apiFetch('/api/run-cli-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, commands: [cmd], require_session: true }),
  })
  if (!r.ok || !r.body) throw new Error(`스트리밍 실패 (${r.status})`)
  const reader = r.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let cut: number
    while ((cut = buf.indexOf('\n\n')) >= 0) {
      const evt = buf.slice(0, cut)
      buf = buf.slice(cut + 2)
      if (!evt.startsWith('data: ')) continue
      let o: { o?: string; err?: string }
      try {
        o = JSON.parse(evt.slice(6)) as { o?: string; err?: string }
      } catch {
        continue
      }
      if (o.o != null) onChunk(o.o)
      else if (o.err) onError(o.err)
    }
  }
}

/** ↑↓ 명령 히스토리 — 같은 명령은 한 번만 남고, 아래 끝을 지나면 비운다 */
export function cmdHistory() {
  const hist: string[] = []
  let at = -1
  return {
    push(cmd: string): void {
      const i = hist.indexOf(cmd)
      if (i >= 0) hist.splice(i, 1)
      hist.push(cmd)
      at = -1
    },
    up(): string | null {
      if (!hist.length) return null
      at = at < 0 ? hist.length - 1 : Math.max(0, at - 1)
      return hist[at] ?? ''
    },
    down(): string | null {
      if (at < 0) return null
      at += 1
      if (at >= hist.length) {
        at = -1
        return ''
      }
      return hist[at] ?? ''
    },
  }
}

/**
 * 탭 완성·`?` 도움말 — 엔터 없이 글자만 세션 채널에 흘린다.
 * 서버(/api/session-key)가 읽어 온 것을 돌려주고 장비 입력줄은 비워 둔다.
 */
export async function sendKeys(
  params: Record<string, unknown>,
  text: string,
): Promise<{ ok: boolean; out?: string; error?: string }> {
  try {
    const r = await apiFetch('/api/session-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...params, text }),
    })
    return (await r.json()) as { ok: boolean; out?: string; error?: string }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * 장비가 돌려준 에코를 「도움말」 과 「완성된 입력줄」 로 가른다.
 *
 *  · 탭: 한 줄 에코(친 글자+완성 조각)만 온다 → line
 *  · ? : 도움말 여러 줄 + 마지막에 프롬프트와 친 줄을 다시 찍는다
 *        → 가운데는 help, 마지막 줄에서 프롬프트를 떼면 line
 */
export function parseKeyEcho(
  raw: string,
  prompt: string,
): { help: string; line: string | null } {
  const printable = (t: string) => t.replace(/[^\x20-\x7e가-힣\t]/g, '')
  const s = String(raw ?? '').replace(/\x07/g, '').replace(/\x08/g, '')
  if (!/\r?\n/.test(s)) {
    const line = printable(s)
    return { help: '', line: line || null }
  }
  const lines = s.split(/\r?\n/).map(printable)
  let last = lines[lines.length - 1] ?? ''
  if (prompt && last.startsWith(prompt)) last = last.slice(prompt.length).replace(/^\s/, '')
  else last = ''
  const help = lines
    .slice(0, -1)
    .join('\n')
    .replace(/^\s*\n+/, '')
    .trimEnd()
  return { help, line: last || null }
}

/** 로그 저장 — 친 명령·응답 전부를 .txt 로 (SecureCRT 의 Log Session 몫) */
export function saveTermLog(
  fileName: string,
  header: string,
  blocks: Array<{ cmd: string; out: string; prompt?: string }>,
): void {
  const L: string[] = [header, '']
  for (const b of blocks) {
    L.push(`${b.prompt || '#'} ${b.cmd}`.trimEnd())
    if (b.out) L.push(b.out.replace(/\s+$/, ''))
  }
  const blob = new Blob([L.join('\n')], { type: 'text/plain;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = fileName
  a.click()
  URL.revokeObjectURL(a.href)
}
