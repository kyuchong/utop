import { useEffect, useState } from 'react'

/**
 * PDF 미리보기의 **쪽 목록** — 우리가 직접 그린다. (WikiEditor 에서 빼낸 공용 부품
 * — WIKI 와 Coverage AI 가 같은 미리보기를 쓴다)
 *
 * 내장 뷰어의 썸네일(`#pagemode=thumbs`)에 기댔더니, 크롬이 iframe 안에서
 * 그 열을 **검은 띠로만** 남기는 일이 있다(지적: 왼쪽 페이지가 출력이 안 돼).
 * 우리 손의 blob 을 pdf.js 로 읽어 쪽마다 그림을 굽는다 — 내장 뷰어의
 * 사정과 무관하게 늘 보인다. pdf.js 는 누를 때만 내려받는다(dynamic
 * import) — 이 판을 안 여는 사람은 그 무게를 안 진다.
 */
export default function PdfRail({
  url,
  at,
  onPick,
}: {
  url: string
  at: number
  onPick: (n: number) => void
}) {
  const [thumbs, setThumbs] = useState<string[]>([])
  const [err, setErr] = useState('')
  useEffect(() => {
    let dead = false
    setThumbs([])
    setErr('')
    void (async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
        pdfjs.GlobalWorkerOptions.workerSrc = worker
        const doc = await pdfjs.getDocument(url).promise
        const out: string[] = []
        for (let i = 1; i <= doc.numPages; i++) {
          if (dead) break
          const page = await doc.getPage(i)
          const base = page.getViewport({ scale: 1 })
          const vp = page.getViewport({ scale: 120 / base.width })
          const canvas = document.createElement('canvas')
          canvas.width = Math.ceil(vp.width)
          canvas.height = Math.ceil(vp.height)
          const ctx = canvas.getContext('2d')
          if (!ctx) break
          await page.render({ canvasContext: ctx, viewport: vp }).promise
          out.push(canvas.toDataURL('image/png'))
          if (!dead) setThumbs([...out])
        }
        void doc.destroy()
      } catch (e) {
        if (!dead) setErr(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      dead = true
    }
  }, [url])
  return (
    <div className="wke-pvrail" role="tablist" aria-label="쪽 목록">
      {err ? (
        <div className="wke-pvrailmsg">쪽 목록을 못 그렸습니다</div>
      ) : !thumbs.length ? (
        <div className="wke-pvrailmsg">쪽 목록 그리는 중…</div>
      ) : (
        thumbs.map((src, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={at === i + 1}
            className={`wke-pvthumb${at === i + 1 ? ' on' : ''}`}
            onClick={() => onPick(i + 1)}
          >
            <img src={src} alt={`${i + 1}쪽`} />
            <span>{i + 1}</span>
          </button>
        ))
      )}
    </div>
  )
}
