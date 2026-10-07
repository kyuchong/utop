import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { TI } from './icons'
import { autoColor, type EfColumn, type EfDoc, type EfRow, type EfView } from './model'

/**
 * Effort Plan 의 보드 보기 — 예전 13-resource.js 의 _rscRenderBoard 를 옮겼다(지금 연도 페이지의 모든 행).
 * 기준 열은 보기마다 v.boardBy 에 둔다(예전 보기와 같은 이름). 차트는 EffortChart(노션식)로 옮겼다.
 */

const NONE = '(미지정)'
const cellText = (v: unknown) => (v == null ? '' : String(v))

/** 보드 기준이 될 수 있는 열 — 선택·상태 */
export const boardCols = (cols: EfColumn[]) => cols.filter((c) => c.type === 'select' || c.type === 'status')

export function boardColOf(view: EfView, cols: EfColumn[]) {
  const id = view.boardBy as string | undefined
  return cols.find((c) => c.id === id && (c.type === 'select' || c.type === 'status')) ?? boardCols(cols)[0]
}

// ── 보드(칸반) ──────────────────────────────────────────────────────
/**
 * 카드 놓기 — 칸(lane)의 i 번째 카드 앞에 r 을 넣는다(i = 칸 끝이면 마지막 카드 뒤).
 * 보드는 행 차례대로 그리므로 **행 자체를 옮긴다**(지시: 보드에서도 행 순서를 바꾼다) — 표도 정렬이 없으면 이 차례로 보인다.
 * lane 은 놓기 전의 그 칸 카드들(r 이 들어 있을 수도 있다). 빈 칸이면 행은 제자리에 둔다.
 */
export function placeRow(rows: EfRow[], r: EfRow, lane: EfRow[], i: number) {
  const before = lane.slice(i).find((x) => x !== r)
  const rest = lane.filter((x) => x !== r)
  const after = before ? undefined : rest[rest.length - 1]
  if (!before && !after) return
  const from = rows.indexOf(r)
  if (from < 0) return
  rows.splice(from, 1)
  const at = before ? rows.indexOf(before) : rows.indexOf(after!) + 1
  rows.splice(at < 0 ? rows.length : at, 0, r)
}

export function EfBoard({
  d,
  rows,
  view,
  touch,
  toast,
}: {
  d: EfDoc
  rows: EfRow[]
  view: EfView
  touch: () => void
  toast: (m: string) => void
}) {
  const cols = d.columns
  const bc = boardColOf(view, cols)
  const boxRef = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; r: EfRow } | null>(null)
  if (!bc) return <div className="ef-empty">선택/상태 타입 열이 있어야 보드를 만들 수 있습니다 — [열 설정]에서 추가하세요</div>

  // 칸 = 옵션 순서 + 표에만 쓰인 값, 하나도 없으면 (미지정)
  const groups = [...(bc.options ?? [])]
  rows.forEach((r) => {
    const v = cellText(r[bc.id])
    if (v && !groups.includes(v)) groups.push(v)
  })
  if (!groups.length) groups.push(NONE)
  const titleCol = cols.find((c) => c.type === 'text')
  const laneOf = (g: string) => rows.filter((r) => (cellText(r[bc.id]) || NONE) === g)

  /**
   * 카드 끌기 — 표 머리글 열 이동과 같은 방식(지시): 끄는 카드가 마우스를 따라오고,
   * 다른 카드들이 비켜서 들어갈 자리가 열린다. React 를 거치지 않고 transform 만 바꾼다
   * (카드 수백 장을 움직일 때마다 다시 그리면 끊긴다). 놓으면 그 칸·그 자리로 행을 옮긴다.
   */
  const cardDrag = (ev: React.MouseEvent<HTMLDivElement>, r: EfRow) => {
    if (ev.button !== 0) return
    const box = boxRef.current
    if (!box) return
    ev.preventDefault()
    const el = ev.currentTarget
    const x0 = ev.clientX
    const y0 = ev.clientY
    let moved = false
    // 위치는 판(스크롤되는 상자) 안의 좌표로 잡는다 — 끄는 중 판이 굴러도 맞게
    const br0 = box.getBoundingClientRect()
    const sl0 = box.scrollLeft
    const st0 = box.scrollTop
    const toBox = (x: number, y: number) => {
      const b = box.getBoundingClientRect()
      return { x: x - b.left + box.scrollLeft, y: y - b.top + box.scrollTop }
    }
    const lanes = [...box.querySelectorAll<HTMLElement>('.ef-klist')].map((list) => {
      const col = list.closest<HTMLElement>('.ef-kcol')!
      const cr = col.getBoundingClientRect()
      const cards = [...list.querySelectorAll<HTMLElement>('.ef-kcard')].filter((c) => c !== el)
      return {
        g: list.dataset.g!,
        list,
        left: cr.left - br0.left + sl0,
        right: cr.right - br0.left + sl0,
        cards: cards.map((c) => {
          const rr = c.getBoundingClientRect()
          return { el: c, mid: rr.top - br0.top + st0 + rr.height / 2, k: Number(c.dataset.k) }
        }),
      }
    })
    const src = lanes.find((l) => l.list.contains(el))
    if (!src) return
    const f = Number(el.dataset.k) // 끄는 카드의 칸 안 차례
    const H = el.getBoundingClientRect().height + 9 // 카드 높이 + 사이(gap)
    let tg = src
    let ti = src.cards.filter((c) => c.k < f).length // 끄는 카드를 뺀 목록에서 들어갈 차례
    let px = x0
    let py = y0
    const set = (e: HTMLElement, t: string) => e.style.transform !== t && (e.style.transform = t)
    const apply = () => {
      const p = toBox(px, py)
      tg = lanes.find((l) => p.x >= l.left - 7 && p.x < l.right + 7) ?? tg
      ti = tg.cards.filter((c) => c.mid < p.y).length
      lanes.forEach((l) => {
        l.list.style.paddingBottom = l === tg && tg !== src ? `${H}px` : ''
        l.cards.forEach((c, w) => {
          // 처음엔 끄는 카드가 앞에 있었나 · 지금은 앞에 들어가나 — 그 차이만큼 비켜선다
          const was = l === src && c.k > f ? 1 : 0
          const now = l === tg && w >= ti ? 1 : 0
          set(c.el, now - was ? `translateY(${(now - was) * H}px)` : '')
        })
      })
      set(el, `translate(${px - x0 + box.scrollLeft - sl0}px, ${py - y0 + box.scrollTop - st0}px) rotate(1.5deg)`)
    }
    // 판 가장자리에 대고 있으면 그쪽으로 굴린다(긴 칸 아래쪽·오른쪽 칸으로 끌 때)
    let roll = 0
    const tick = () => {
      const b = box.getBoundingClientRect()
      const vx = px > b.right - 40 ? 14 : px < b.left + 40 ? -14 : 0
      const vy = py > b.bottom - 40 ? 14 : py < b.top + 40 ? -14 : 0
      if (vx || vy) {
        box.scrollLeft += vx
        box.scrollTop += vy
        apply()
      }
      roll = requestAnimationFrame(tick)
    }
    const mv = (e: MouseEvent) => {
      px = e.clientX
      py = e.clientY
      if (!moved) {
        if (Math.hypot(px - x0, py - y0) < 4) return
        moved = true
        setMenu(null)
        document.body.style.cursor = 'grabbing'
        el.classList.add('ef-kmoving')
        box.classList.add('ef-kdragging')
        roll = requestAnimationFrame(tick)
      }
      apply()
    }
    const up = () => {
      document.removeEventListener('mousemove', mv, true)
      document.removeEventListener('mouseup', up, true)
      cancelAnimationFrame(roll)
      document.body.style.cursor = ''
      el.classList.remove('ef-kmoving')
      box.classList.remove('ef-kdragging')
      el.style.transform = ''
      lanes.forEach((l) => {
        l.list.style.paddingBottom = ''
        l.cards.forEach((c) => (c.el.style.transform = ''))
      })
      if (!moved) return
      const nv = tg.g === NONE ? '' : tg.g
      const changed = cellText(r[bc.id]) !== nv
      const was = rows.indexOf(r)
      const lane = laneOf(tg.g).filter((x) => x !== r)
      if (changed) {
        if (nv) r[bc.id] = nv
        else delete r[bc.id]
      }
      placeRow(rows, r, lane, ti)
      if (changed || rows.indexOf(r) !== was) touch()
    }
    document.addEventListener('mousemove', mv, true)
    document.addEventListener('mouseup', up, true)
  }

  return (
    <div className="ef-kanban" ref={boxRef}>
      {groups.map((g) => {
        const items = laneOf(g)
        return (
          <div className="ef-kcol" key={g}>
            <div className="ef-kcol-h">
              <span className="ef-kdot" style={{ background: autoColor(g) }} />
              {g}
              <span className="ef-kcnt">{items.length}</span>
            </div>
            <div className="ef-klist" data-g={g}>
              {items.map((r, i) => {
                // 제목 열·기준 열 말고 값이 있는 칸 셋(예전과 같다)
                const meta = cols
                  .filter((c) => c.id !== bc.id && c.id !== titleCol?.id && cellText(r[c.id]))
                  .slice(0, 3)
                  .map((c) => `${c.title}: ${cellText(r[c.id])}`)
                  .join(' · ')
                return (
                  <div
                    key={i}
                    className="ef-kcard"
                    data-k={i}
                    onMouseDown={(e) => cardDrag(e, r)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setMenu({ x: e.clientX, y: e.clientY, r })
                    }}
                  >
                    <div className="ef-kname">{(titleCol && cellText(r[titleCol.id])) || '(제목)'}</div>
                    {meta && <div className="ef-kmeta">{meta}</div>}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
      {menu && (
        <CardMenu
          at={menu}
          onClose={() => setMenu(null)}
          onCopy={() => {
            const i = rows.indexOf(menu.r)
            rows.splice(i < 0 ? rows.length : i + 1, 0, JSON.parse(JSON.stringify(menu.r)) as EfRow)
            setMenu(null)
            touch()
            toast('📋 복사됨 (전체 내용 복제)')
          }}
          onAdd={() => {
            rows.push({})
            setMenu(null)
            touch()
          }}
          onDelete={() => {
            const i = rows.indexOf(menu.r)
            setMenu(null)
            if (i < 0) return
            rows.splice(i, 1)
            touch()
          }}
        />
      )}
    </div>
  )
}

/** 카드 우클릭 — 복사하기 · 항목 추가 · 삭제(예전 _rscCardMenu) */
function CardMenu({
  at,
  onCopy,
  onAdd,
  onDelete,
  onClose,
}: {
  at: { x: number; y: number }
  onCopy: () => void
  onAdd: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const down = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onClose()
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', down)
      document.removeEventListener('keydown', key)
    }
  }, [onClose])
  return createPortal(
    <div
      className="ef-menu ef-cardmenu"
      ref={ref}
      style={{ left: Math.min(at.x, window.innerWidth - 170), top: Math.min(at.y, window.innerHeight - 110) }}
    >
      <button type="button" className="ef-mi" onClick={onCopy}>
        <i className="ef-mi-ic"><TI n="copy" /></i>
        <span>복사하기</span>
      </button>
      <button type="button" className="ef-mi" onClick={onAdd}>
        <i className="ef-mi-ic"><TI n="plus" /></i>
        <span>항목 추가</span>
      </button>
      <button type="button" className="ef-mi del" onClick={onDelete}>
        <i className="ef-mi-ic"><TI n="trash" /></i>
        <span>삭제</span>
      </button>
    </div>,
    document.body,
  )
}
