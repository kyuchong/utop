import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { IconChevron } from '@/components/icons'
import '@/components/ReqTree.css'
import './CopyDialog.css'

interface Cat {
  id: string
  name: string
  parent_id?: string | null
}
interface Req {
  id: string
  reqid?: string
  title?: string
  cat1?: string | null
  cat2?: string | null
  cat3?: string | null
  cat4?: string | null
}
interface Tc {
  tcid: string
  name?: string
  req_id?: string
}

/** 고른 것 하나 — 폴더·요구사항·시험 */
interface Pick {
  kind: 'cat' | 'req' | 'tc'
  id: string
}

const leafCat = (r: Req) => String(r.cat4 || r.cat3 || r.cat2 || r.cat1 || '')

/**
 * 「+ Copy」 — 왼쪽에서 고르고 오른쪽에 붙인다(승인 2026-08-22).
 *
 * Source 는 **두 칸**이다(지시): 왼쪽이 폴더·요구사항 트리, 오른쪽이 그
 * 요구사항의 시험 항목. 한 트리에 시험까지 밀어 넣으면 줄이 수백이 되어
 * 고르기가 더 나쁘다 — 요구사항을 짚으면 그 시험만 옆 칸에 선다.
 *
 * 트리의 생김새(접기 단추·폴더 줄·요구사항 줄)는 **1열 폴더 트리 것을 그대로**
 * 쓴다(지시) — 창마다 다른 트리를 만들면 같은 자료가 화면마다 달라 보인다.
 */
export default function CopyDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [picks, setPicks] = useState<Pick[]>([])
  const [dst, setDst] = useState<Pick | null>(null)
  const [swap, setSwap] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [openL, setOpenL] = useState<Set<string>>(new Set())
  const [openR, setOpenR] = useState<Set<string>>(new Set())
  /** 왼쪽에서 짚은 요구사항 — 그 시험들이 가운데 칸에 선다 */
  const [atReq, setAtReq] = useState('')
  /*
   * 창 자리 — 머리줄을 잡아 옮긴다(지시).
   *
   * 가려진 자리를 보려고 창을 닫았다 다시 여는 일이 잦다. 옮길 수 있으면
   * 뒤에 있는 목록을 보면서 고를 수 있다.
   */
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const drag = (e: React.PointerEvent) => {
    const box = (e.currentTarget as HTMLElement).closest('.modal') as HTMLElement | null
    if (!box) return
    const r = box.getBoundingClientRect()
    const dx = e.clientX - r.left
    const dy = e.clientY - r.top
    const move = (ev: PointerEvent) =>
      setPos({
        x: Math.max(8, Math.min(window.innerWidth - r.width - 8, ev.clientX - dx)),
        y: Math.max(8, Math.min(window.innerHeight - 60, ev.clientY - dy)),
      })
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const catsQ = useQuery({
    queryKey: ['copy-cats'],
    queryFn: async () => {
      const r = await apiFetch('/api/req-categories')
      const j = (await r.json()) as { categories?: Cat[] }
      return Array.isArray(j?.categories) ? j.categories : []
    },
  })
  const reqsQ = useQuery({
    queryKey: ['copy-reqs'],
    queryFn: async () => {
      const r = await apiFetch('/api/req')
      const j = (await r.json()) as { reqs?: Req[] }
      return Array.isArray(j?.reqs) ? j.reqs : []
    },
  })
  const tcsQ = useQuery({
    queryKey: ['copy-tcs'],
    queryFn: async () => {
      const r = await apiFetch('/api/tc?meta=1')
      const j = (await r.json()) as { tcs?: Tc[] }
      return Array.isArray(j?.tcs) ? j.tcs : []
    },
  })

  const cats = Array.isArray(catsQ.data) ? catsQ.data : []
  const reqs = Array.isArray(reqsQ.data) ? reqsQ.data : []
  const tcs = Array.isArray(tcsQ.data) ? tcsQ.data : []
  const kids = useMemo(() => {
    const m = new Map<string, Cat[]>()
    for (const c of cats) {
      const k = String(c.parent_id ?? '')
      m.set(k, [...(m.get(k) ?? []), c])
    }
    return m
  }, [cats])
  const reqsOf = useMemo(() => {
    const m = new Map<string, Req[]>()
    for (const r of reqs) m.set(leafCat(r), [...(m.get(leafCat(r)) ?? []), r])
    return m
  }, [reqs])
  const tcsOf = useMemo(() => {
    const m = new Map<string, Tc[]>()
    for (const t of tcs) {
      const k = String(t.req_id ?? '')
      m.set(k, [...(m.get(k) ?? []), t])
    }
    return m
  }, [tcs])

  const has = (p: Pick) => picks.some((x) => x.kind === p.kind && x.id === p.id)
  const toggle = (p: Pick) =>
    setPicks((cur) =>
      has(p) ? cur.filter((x) => !(x.kind === p.kind && x.id === p.id)) : [...cur, p],
    )

  /** 폴더·요구사항 트리 — 1열 폴더 트리와 같은 생김새(rt-*) */
  const tree = (side: 'L' | 'R') => {
    const open = side === 'L' ? openL : openR
    const setOpen = side === 'L' ? setOpenL : setOpenR
    const flip = (id: string) =>
      setOpen((cur) => {
        const n = new Set(cur)
        if (n.has(id)) n.delete(id)
        else n.add(id)
        return n
      })

    const draw = (parent: string, depth: number): React.ReactNode[] => {
      const out: React.ReactNode[] = []
      for (const c of kids.get(parent) ?? []) {
        const kid = (kids.get(c.id)?.length ?? 0) + (reqsOf.get(c.id)?.length ?? 0)
        const on = side === 'L' ? has({ kind: 'cat', id: c.id }) : dst?.kind === 'cat' && dst.id === c.id
        out.push(
          <div
            key={`c:${c.id}`}
            className={`rt-fold${on ? ' on' : ''}`}
            style={{ paddingLeft: 6 + depth * 14 }}
            onClick={() => (side === 'L' ? toggle({ kind: 'cat', id: c.id }) : setDst({ kind: 'cat', id: c.id }))}
          >
            <button
              type="button"
              className={`rt-caret${open.has(c.id) ? ' open' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                flip(c.id)
              }}
              aria-label={open.has(c.id) ? '접기' : '펴기'}
            >
              {kid ? <IconChevron /> : <span className="rt-dot" />}
            </button>
            <span className="rt-ficon" aria-hidden="true">
              📁
            </span>
            <span className="rt-fname">{c.name}</span>
            {kid > 0 && <span className="rt-cnt">{kid}</span>}
          </div>,
        )
        if (!open.has(c.id)) continue
        out.push(...draw(c.id, depth + 1))
        for (const r of reqsOf.get(c.id) ?? []) {
          const ron =
            side === 'L'
              ? has({ kind: 'req', id: r.id }) || atReq === r.id
              : dst?.kind === 'req' && dst.id === r.id
          out.push(
            <div
              key={`r:${r.id}`}
              className={`rt-req${ron ? ' on' : ''}`}
              style={{ paddingLeft: 6 + (depth + 1) * 14 }}
              onClick={() => {
                if (side === 'L') {
                  setAtReq(r.id)
                  toggle({ kind: 'req', id: r.id })
                } else setDst({ kind: 'req', id: r.id })
              }}
              title={side === 'L' ? '누르면 고르고, 오른쪽 칸에 이 요구사항의 시험이 섭니다' : undefined}
            >
              <span className="rt-dicon" aria-hidden="true">
                📄
              </span>
              <span className="rt-title">{r.title || r.reqid || r.id}</span>
              <span className="rt-cnts">
                <i className="rt-ct">{tcsOf.get(r.id)?.length ?? 0}</i>
              </span>
            </div>,
          )
        }
      }
      return out
    }
    return <div className="rt cpd-tree">{draw('', 0)}</div>
  }

  /** 가운데 칸 — 짚은 요구사항의 시험 항목 */
  const tcPane = () => {
    const list = tcsOf.get(atReq) ?? []
    if (!atReq) return <div className="cpd-empty">왼쪽에서 요구사항을 누르면 그 시험이 여기 섭니다.</div>
    if (!list.length) return <div className="cpd-empty">이 요구사항에는 시험이 없습니다.</div>
    return (
      <div className="rt cpd-tree">
        {list.map((t) => (
          <div
            key={t.tcid}
            className={`rt-req${has({ kind: 'tc', id: t.tcid }) ? ' on' : ''}`}
            style={{ paddingLeft: 8 }}
            onClick={() => toggle({ kind: 'tc', id: t.tcid })}
          >
            <span className="rt-dicon" aria-hidden="true">
              🧪
            </span>
            <span className="rt-title">{t.name || t.tcid}</span>
            <span className="rt-cnts">
              <i className="rt-ct">{t.tcid}</i>
            </span>
          </div>
        ))}
      </div>
    )
  }

  const go = async () => {
    if (!picks.length || !dst) return
    setBusy(true)
    setMsg('')
    try {
      const r = await apiFetch('/api/copy-tree', {
        method: 'POST',
        body: JSON.stringify({ items: picks, dst, swap_model: swap }),
      })
      const j = (await r.json()) as {
        ok?: boolean
        cats?: number
        reqs?: number
        tcs?: number
        detail?: string
      }
      if (!r.ok || !j.ok) throw new Error(j.detail || '복사하지 못했습니다')
      setMsg(`폴더 ${j.cats ?? 0}개 · 요구사항 ${j.reqs ?? 0}건 · 시험 ${j.tcs ?? 0}건 복사했습니다`)
      setPicks([])
      onDone()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div
        className="modal cpd"
        onMouseDown={(e) => e.stopPropagation()}
        style={pos ? { position: 'fixed', left: pos.x, top: pos.y, margin: 0 } : undefined}
      >
        <div className="modal-head cpd-grab" onPointerDown={drag} title="끌어서 옮깁니다">
          <b>복사</b>
          <span className="muted small">
            왼쪽에서 고르고 → 오른쪽 자리를 고른 뒤 화살표를 누르세요
          </span>
          <button className="modal-x" type="button" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <div className="cpd-body">
          <section className="cpd-pane src">
            <div className="cpd-h">
              Source
              <em>{picks.length ? `${picks.length}개 고름` : '폴더·요구사항·시험을 고르세요'}</em>
            </div>
            <div className="cpd-two">
              <div className="cpd-col">
                <div className="cpd-sub">폴더 · 요구사항</div>
                {tree('L')}
              </div>
              <div className="cpd-col">
                <div className="cpd-sub">시험 항목</div>
                {tcPane()}
              </div>
            </div>
          </section>

          <div className="cpd-mid">
            <button
              className="btn primary cpd-go"
              type="button"
              disabled={!picks.length || !dst || busy}
              title={!picks.length ? '왼쪽에서 고르세요' : !dst ? '오른쪽 자리를 고르세요' : '복사합니다'}
              onClick={() => void go()}
            >
              ➜
            </button>
            <label className="cpd-sw">
              <input type="checkbox" checked={swap} onChange={(e) => setSwap(e.target.checked)} />
              대상 모델로 바꿈
            </label>
          </div>

          <section className="cpd-pane">
            <div className="cpd-h">
              Destination
              <em>{dst ? (dst.kind === 'cat' ? '폴더에 붙입니다' : '요구사항에 붙입니다') : '붙일 자리를 고르세요'}</em>
            </div>
            {tree('R')}
          </section>
        </div>

        <div className="modal-foot">
          {msg && <span className="cpd-msg">{msg}</span>}
          <span className="sp" />
          <button className="btn" type="button" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}
