import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js'
import { TI } from './icons'
import { autoColor, toNum, type EfColumn, type EfDoc, type EfRow, type EfView } from './model'

/**
 * Effort Plan 의 보드·차트 보기 — 예전 13-resource.js 의 _rscRenderBoard·_rscRenderChart 를 옮겼다.
 * 둘 다 지금 연도 페이지의 모든 행을 본다(예전과 같다 — 검색·필터는 표 보기에만).
 * 기준 열은 보기마다 v.boardBy · v.chartCol 에 둔다(예전 보기와 같은 이름).
 */

Chart.register(DoughnutController, ArcElement, BarController, BarElement, CategoryScale, LinearScale, Legend, Tooltip)

const NONE = '(미지정)'
const cellText = (v: unknown) => (v == null ? '' : String(v))

/** 보드 기준이 될 수 있는 열 — 선택·상태 */
export const boardCols = (cols: EfColumn[]) => cols.filter((c) => c.type === 'select' || c.type === 'status')
/** 차트 기준이 될 수 있는 열 — 선택·글자 */
export const chartCols = (cols: EfColumn[]) => cols.filter((c) => c.type === 'select' || c.type === 'text')

export function boardColOf(view: EfView, cols: EfColumn[]) {
  const id = view.boardBy as string | undefined
  return cols.find((c) => c.id === id && (c.type === 'select' || c.type === 'status')) ?? boardCols(cols)[0]
}
export function chartColOf(view: EfView, cols: EfColumn[]) {
  const id = view.chartCol as string | undefined
  return cols.find((c) => c.id === id) ?? chartCols(cols)[0]
}

// ── 보드(칸반) ──────────────────────────────────────────────────────
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
  const [dragRow, setDragRow] = useState<EfRow | null>(null)
  const [over, setOver] = useState<string | null>(null)
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
  const drop = (g: string) => {
    const r = dragRow
    setDragRow(null)
    setOver(null)
    if (!r) return
    const nv = g === NONE ? '' : g
    if (cellText(r[bc.id]) === nv) return
    if (nv) r[bc.id] = nv
    else delete r[bc.id]
    touch()
  }
  return (
    <div className="ef-kanban">
      {groups.map((g) => {
        const items = rows.filter((r) => (cellText(r[bc.id]) || NONE) === g)
        return (
          <div className="ef-kcol" key={g}>
            <div className="ef-kcol-h">
              <span className="ef-kdot" style={{ background: autoColor(g) }} />
              {g}
              <span className="ef-kcnt">{items.length}</span>
            </div>
            <div
              className={`ef-klist${over === g ? ' over' : ''}`}
              onDragOver={(e) => {
                if (!dragRow) return
                e.preventDefault()
                if (over !== g) setOver(g)
              }}
              onDragLeave={(e) => e.currentTarget === e.target && setOver(null)}
              onDrop={(e) => {
                e.preventDefault()
                drop(g)
              }}
            >
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
                    className={`ef-kcard${dragRow === r ? ' ghost' : ''}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move'
                      e.dataTransfer.setData('text/plain', 'card')
                      setDragRow(r)
                    }}
                    onDragEnd={() => {
                      setDragRow(null)
                      setOver(null)
                    }}
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

// ── 차트 ────────────────────────────────────────────────────────────
/** 기준 열 값별 개수(도넛) + 숫자 열 합계(막대) — 예전 _rscRenderChart 와 같은 두 장 */
export function EfChart({ d, rows, view, ver }: { d: EfDoc; rows: EfRow[]; view: EfView; ver: number }) {
  const cc = chartColOf(view, d.columns)
  const cntRef = useRef<HTMLCanvasElement>(null)
  const sumRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    // 차트 종류가 달라 한 배열의 타입을 맞추지 않는다 — 정리할 때 destroy 만 부른다
    const charts: Array<{ destroy: () => void }> = []
    const cnt: Record<string, number> = {}
    if (cc) rows.forEach((r) => {
      const v = cellText(r[cc.id]) || '(빈값)'
      cnt[v] = (cnt[v] ?? 0) + 1
    })
    const ck = Object.keys(cnt)
    if (cntRef.current && ck.length)
      charts.push(
        new Chart(cntRef.current, {
          type: 'doughnut',
          data: { labels: ck, datasets: [{ data: ck.map((k) => cnt[k]!), backgroundColor: ck.map((k) => autoColor(k)), borderWidth: 2, borderColor: '#fff' }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } },
        }),
      )
    const numCols = d.columns.filter((c) => c.type === 'number')
    const sums = numCols.map((c) => Math.round(rows.reduce((a, r) => a + (toNum(r[c.id]) ?? 0), 0) * 100) / 100)
    if (sumRef.current && numCols.length)
      charts.push(
        new Chart(sumRef.current, {
          type: 'bar',
          data: { labels: numCols.map((c) => c.title), datasets: [{ label: '합계', data: sums, backgroundColor: '#2d6fd4', borderRadius: 5 }] },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { grid: { display: false } }, y: { beginAtZero: true } },
          },
        }),
      )
    return () => charts.forEach((c) => c.destroy())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, ver, cc?.id])
  return (
    <div className="ef-charts">
      <div className="ef-card">
        <div className="ef-ch">개수 분포</div>
        <div className="ef-chbox">
          <canvas ref={cntRef} />
        </div>
      </div>
      <div className="ef-card">
        <div className="ef-ch">숫자 열 합계</div>
        <div className="ef-chbox">
          <canvas ref={sumRef} />
        </div>
      </div>
    </div>
  )
}
