import PptxGenJS from 'pptxgenjs'
import { methodBlocks, resultBlocks, slideRanges, type LguTc } from './lgu'
import { stepLines, termShot, type TermLine } from './termShot'
import { stepVerdict, type TcStep } from '@/components/tc/types'

/**
 * LG U+ 양식 PPTX 파일 만들기.
 *
 * 옛 화면 `reports/07-report.js` 의 `_lguPptSlide()` 를 옮겼다. 자리와
 * 크기(인치)는 손대지 않았다 — 실제로 제출해 온 문서라 한 칸만 틀어져도
 * 다른 문서가 된다.
 *
 * 미리보기는 HTML(`lgu.ts`)로, 저장은 여기서 한다. 둘이 같은 자료와 같은
 * 쪽 나누기(`slideRanges`)를 쓰기 때문에 화면에서 본 장수와 파일의 장수가
 * 어긋나지 않는다.
 */

// pptxgenjs 4 의 fill 은 색 문자열이 아니라 { color } 다
const YEL = { color: 'FCFCC6' }
const BDC = '111111'
const BD = { type: 'solid' as const, color: BDC, pt: 1 }
/** 표 왼쪽 x. 슬라이드 폭 13.333 − 표폭 12.5 = 0.833, 반이 좌우 여백 */
const LX = 0.4167
const COLW = [0.75, 2.875, 0.75, 1.875, 1.0, 5.25]

function cell(t: unknown, o: PptxGenJS.TableCellProps = {}): PptxGenJS.TableCell {
  return {
    text: String(t ?? ''),
    options: {
      border: BD,
      valign: 'middle',
      fontSize: 10.5,
      color: BDC,
      margin: 4,
      fontFace: '맑은 고딕',
      ...o,
    },
  }
}

function head(tc: LguTc): PptxGenJS.TableCell[] {
  return [
    cell('TC_ID', { fill: YEL, bold: true, align: 'center' }),
    cell(tc.tcid, { bold: true, align: 'center' }),
    cell('REQ ID', { fill: YEL, bold: true, align: 'center', fontSize: 9.5 }),
    cell(tc.reqid, { align: 'center', bold: true }),
    cell('시험항목', { fill: YEL, bold: true, align: 'center' }),
    cell(tc.name, { bold: true }),
  ]
}

/** 머리글·바닥선·쪽번호 — 두 장이 같다 */
function frame(s: PptxGenJS.Slide, title: string, pageNo: number) {
  s.addText(title, {
    x: LX + 0.05,
    y: 0.16,
    w: 4,
    h: 0.55,
    fontSize: 25,
    bold: true,
    color: BDC,
    charSpacing: 2,
  })
  s.addText(
    [
      { text: 'LG U', options: { color: 'A50034', bold: true, fontSize: 24 } },
      { text: '+', options: { color: 'E6007E', bold: true, fontSize: 15 } },
    ],
    { x: 5.0, y: 0.2, w: 3.3, h: 0.5, align: 'center' },
  )
  s.addShape('line', { x: LX, y: 0.83, w: 12.5, h: 0, line: { color: BDC, width: 2.5 } })
  s.addShape('line', { x: LX, y: 0.89, w: 12.5, h: 0, line: { color: BDC, width: 1 } })
  s.addShape('line', { x: LX, y: 7.02, w: 12.5, h: 0, line: { color: BDC, width: 2.5 } })
  s.addShape('line', { x: LX, y: 7.08, w: 12.5, h: 0, line: { color: BDC, width: 1 } })
  s.addText(String(pageNo), {
    x: LX + 11.3,
    y: 7.12,
    w: 1.1,
    h: 0.3,
    fontSize: 11,
    align: 'right',
    color: BDC,
  })
}

/** 파일 이름에 못 쓰는 글자를 바꾼다 */
const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, '_').trim() || 'cycle'

export async function saveLguPptx(
  tcs: LguTc[],
  meta: { model?: string | null; version?: string | null },
): Promise<number> {
  const p = new PptxGenJS()
  p.layout = 'LAYOUT_WIDE'
  let no = 1

  for (const tc of tcs) {
    const r = slideRanges(tc)
    const mBlocks = methodBlocks(tc)
    const rBlocks = resultBlocks(tc)

    r.method.forEach(([from, to], i) => {
      const s = p.addSlide()
      frame(s, '시험절차', no++)
      const tag = r.method.length > 1 ? ` (${i + 1}/${r.method.length})` : ''
      s.addTable(
        [
          head(tc),
          [
            cell('시험 규격', { fill: YEL, bold: true, align: 'center', colspan: 4 }),
            cell('시험 구성도 및 준비사항', { fill: YEL, bold: true, align: 'center', colspan: 2 }),
          ],
          [
            cell(tc.spec || '(미작성)', { colspan: 4, valign: 'top' }),
            // 그림은 표 위에 따로 얹는다 — 표 칸에는 이미지를 못 넣는다
            cell(tc.topoImg && i === 0 ? '' : '(구성도 없음)', {
              colspan: 2,
              valign: 'bottom',
              color: '444444',
              fontSize: 8,
            }),
          ],
          [
            cell('시험 방법' + tag, { fill: YEL, bold: true, align: 'center', colspan: 4 }),
            cell('시험 결과', { fill: YEL, bold: true, align: 'center', colspan: 2 }),
          ],
          [
            cell(mBlocks.slice(from, to).map((b) => b.text).join('\n'), {
              colspan: 4,
              valign: 'top',
              fontSize: 9.5,
            }),
            cell('시험 결과 참고 (다음장)', {
              colspan: 2,
              align: 'center',
              valign: 'middle',
              bold: true,
            }),
          ],
          [
            cell('비고\n(특이사항)', { fill: YEL, bold: true, align: 'center', colspan: 2 }),
            cell(tc.remark, { colspan: 4, valign: 'top' }),
          ],
        ],
        {
          x: LX,
          y: 1.0,
          colW: COLW,
          rowH: [0.45, 0.34, 2.35, 0.34, 1.85, 0.5],
          border: BD,
          valign: 'middle',
          autoPage: false,
        },
      )
      // 구성도는 첫 장에만. 여러 장으로 나뉜 뒤쪽에 같은 그림이 또 나오면
      // 새 내용인 줄 알고 다시 본다.
      if (tc.topoImg && i === 0) {
        try {
          s.addImage({
            // 배선으로 그린 구성도는 data URL 이다. pptxgenjs 는 주소는
            // `path`, 알맹이는 `data` 로 받는다 — 섞으면 그림이 안 실린다.
            ...(tc.topoImg.startsWith('data:')
              ? { data: tc.topoImg }
              : { path: tc.topoImg }),
            x: LX + 6.25,
            y: 1.5,
            w: 6.05,
            h: 2.2,
            sizing: { type: 'contain', w: 6.05, h: 2.2 },
          })
        } catch {
          // 그림 하나 때문에 결과서 전체가 안 나오면 안 된다
        }
      }
    })

    r.result.forEach(([from, to], i) => {
      const s = p.addSlide()
      frame(s, '시험결과', no++)
      const tag = r.result.length > 1 ? ` (${i + 1}/${r.result.length})` : ''
      /*
       * 결과는 **터미널 화면 그림**으로 넣는다.
       *
       * 글자로 넣으면 PowerPoint 가 제 폰트로 다시 흘려서 `show interface`
       * 표의 세로줄이 어긋난다 — 고정폭이 아니면 읽을 수가 없다. 그리고
       * 고객사 결과서는 증거라, 검은 화면에 흰 글씨 그대로여야 「장비에서
       * 본 것」 으로 읽힌다.
       *
       * 표에는 빈 칸을 두고 그림을 그 위에 얹는다 — 표 칸에는 그림을
       * 못 넣는다.
       */
      const lines: TermLine[] = []
      tc.steps.slice(from, to).forEach((st, k) => {
        if (k) lines.push({ text: '' })
        lines.push(...stepLines(st, from + k + 1, String(stepVerdict(st as TcStep) || ''), tc.prompt || '$'))
      })
      const shot = lines.length
        ? termShot(lines, [tc.tcid, tc.name].filter(Boolean).join(' · '))
        : null
      s.addTable(
        [
          head(tc),
          [cell('시험 결과' + tag, { fill: YEL, bold: true, align: 'center', colspan: 6 })],
          [
            cell(shot ? '' : rBlocks.slice(from, to).map((b) => b.text).join('\n\n'), {
              colspan: 6,
              valign: 'top',
              fontSize: 9,
            }),
          ],
          [
            cell('비고\n(특이사항)', { fill: YEL, bold: true, align: 'center', colspan: 2 }),
            cell(tc.remark, { colspan: 4, valign: 'top' }),
          ],
        ],
        {
          x: LX,
          y: 1.0,
          colW: COLW,
          rowH: [0.45, 0.34, 4.6, 0.5],
          border: BD,
          valign: 'middle',
          autoPage: false,
        },
      )
      // 표 칸에는 그림을 못 넣는다. 결과 칸 자리에 맞춰 위에 얹는다.
      if (shot) {
        const BX = LX + 0.06
        const BY = 1.0 + 0.45 + 0.34 + 0.05
        const BW = 12.5 - 0.12
        const BH = 4.6 - 0.1
        // 비율을 지킨다 — 늘리면 글자가 뭉개져 캡처로 안 보인다
        const k = Math.min(BW / shot.w, BH / shot.h)
        const w = shot.w * k
        const h = shot.h * k
        try {
          s.addImage({ data: shot.data, x: BX + (BW - w) / 2, y: BY, w, h })
        } catch {
          // 그림 하나 때문에 결과서 전체가 안 나오면 안 된다
        }
      }
    })
  }

  if (no === 1) {
    const s = p.addSlide()
    frame(s, '시험절차', 1)
    s.addText('시험 항목이 없습니다', { x: LX, y: 3, w: 12.5, h: 0.5, align: 'center' })
  }

  await p.writeFile({
    fileName: `${safe(`${meta.model ?? 'cycle'}_${meta.version ?? ''}`)}_시험결과서.pptx`,
  })
  return no - 1
}
