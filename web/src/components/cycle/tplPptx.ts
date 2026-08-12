import { apiFetch } from '@/api/client'
import { methodBlocks, resultBlocks, slideRanges, type LguTc } from './lgu'

/**
 * **고객사가 준 pptx 를 그대로 채워** 결과서를 만든다.
 *
 * 전에는 브라우저가 표와 글자를 직접 그렸다. 자리와 크기를 아무리 맞춰도
 * 글꼴·표선 두께·머리글·로고가 저쪽 것과 미묘하게 달라서, 받는 쪽에서
 * 결국 자기 양식으로 다시 옮겼다.
 *
 * 여기서는 저쪽이 준 파일을 서버가 열어 **그 안의 장을 복제하고 값만
 * 갈아 끼운다.** 양식은 한 획도 손대지 않는다.
 *
 * 무엇을 채울지(쪽 나누기까지)는 **여기서 정한다** — 미리보기가 쓰는
 * `slideRanges` 를 그대로 쓴다. 서버에서 따로 나누면 화면에서 본 장수와
 * 파일의 장수가 어긋난다.
 */

interface TplSlide {
  kind: 'first' | 'more'
  values: Record<string, string>
  /** 구성도 — 첫 장에만. 서버가 양식의 그림 자리에 앉힌다 */
  topo?: string
}

/**
 * 그림을 알맹이(data URL)로 바꾼다.
 *
 * 서버는 `/api/uploads/…` 주소를 받아도 그것을 다시 열어 볼 방법이 마땅치
 * 않다 — 브라우저는 이미 그 그림을 들고 있으니 여기서 실어 보내는 편이
 * 확실하다. 배선으로 그린 구성도는 처음부터 data URL 이라 그냥 지나간다.
 */
async function asData(src: string): Promise<string> {
  const s = String(src || '')
  if (!s) return ''
  if (s.startsWith('data:')) return s
  try {
    const r = await fetch(s)
    if (!r.ok) return ''
    const blob = await r.blob()
    return await new Promise<string>((ok) => {
      const fr = new FileReader()
      fr.onload = () => ok(String(fr.result || ''))
      fr.onerror = () => ok('')
      fr.readAsDataURL(blob)
    })
  } catch {
    return ''
  }
}

/** 스텝 하나를 결과 글로. 명령과 응답을 그대로 싣는다 — 결과서는 증거다. */
function stepText(
  s: { desc?: unknown; cli?: unknown; output?: unknown },
  no: number,
): string {
  const out: string[] = []
  const desc = String(s.desc ?? '').trim()
  const cli = String(s.cli ?? '').trim()
  out.push(`${no}. ${desc || cli}`)
  if (cli) for (const c of cli.split(/\r?\n/)) out.push(`   $ ${c}`)
  const o = String(s.output ?? '').trim()
  if (o) for (const l of o.split(/\r?\n/)) out.push(`   ${l}`)
  return out.join('\n')
}

export function buildTplSlides(tcs: LguTc[]): TplSlide[] {
  const out: TplSlide[] = []
  for (const tc of tcs) {
    const r = slideRanges(tc)
    const head = {
      // TC_ID 는 아직 비운다 — 나중에 시험항목 번호가 정해지면 그것이 들어간다
      tc_id: '',
      req_id: String(tc.reqid ?? ''),
      tc_name: String(tc.name ?? ''),
    }
    const mBlocks = methodBlocks(tc)
    r.method.forEach(([from, to], i) => {
      out.push({
        kind: 'first',
        // 구성도는 첫 장에만. 여러 장으로 나뉜 뒤쪽에 같은 그림이 또 나오면
        // 새 내용인 줄 알고 다시 본다.
        topo: i === 0 ? String(tc.topoImg ?? '') : '',
        values: {
          ...head,
          spec: String(tc.spec ?? ''),
          method: mBlocks.slice(from, to).map((b) => b.text).join('\n'),
          result_head: '뒷면 참조',
          note: String(tc.remark ?? ''),
        },
      })
    })
    r.result.forEach(([from, to]) => {
      const body = tc.steps.length
        ? tc.steps.slice(from, to).map((s, k) => stepText(s, from + k + 1)).join('\n\n')
        : resultBlocks(tc).map((b) => b.text).join('\n\n')
      out.push({
        kind: 'more',
        values: { ...head, result: body, note: String(tc.remark ?? '') },
      })
    })
  }
  return out
}

/** 서버가 양식을 채워 준 파일을 받아 저장한다 */
export async function saveTplPptx(
  tcs: LguTc[],
  meta: { model?: string | null; version?: string | null; template?: string },
): Promise<number> {
  const slides = buildTplSlides(tcs)
  if (!slides.length) throw new Error('사이클에 시험 항목이 없습니다')
  // 같은 그림을 여러 시험이 쓰는 일이 흔하다 — 한 번만 읽는다
  const cache = new Map<string, string>()
  for (const s of slides) {
    if (!s.topo) continue
    let got = cache.get(s.topo)
    if (got === undefined) {
      got = await asData(s.topo)
      cache.set(s.topo, got)
    }
    s.topo = got
  }
  const name = `${[meta.model, meta.version].filter(Boolean).join('_') || 'cycle'}_시험결과서`
  const r = await apiFetch('/api/pptx-render', {
    method: 'POST',
    body: JSON.stringify({ template: meta.template || 'lguplus', name, slides }),
  })
  if (!r.ok) {
    let why = String(r.status)
    try {
      why = ((await r.json()) as { detail?: string }).detail || why
    } catch {
      /* 본문이 없을 수도 있다 */
    }
    throw new Error(`결과서를 만들지 못했습니다 — ${why}`)
  }
  const blob = await r.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${name}.pptx`
  a.click()
  URL.revokeObjectURL(a.href)
  return slides.length
}
