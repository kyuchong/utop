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
  /** 무엇을 복사하나(승인) — 요구사항+시험 · 요구사항만 · 시험만 */
  const [mode, setMode] = useState<'all' | 'req' | 'tc'>('all')
  /** 폴더·요구사항을 통째로 고르되 **뺀 시험** — 체크를 푼 것 */
  const [skip, setSkip] = useState<Set<string>>(new Set())
  /** 대상 프로젝트의 같은 모델 장비로 세션 바꾸기(기본 끔) */
  const [swapSess, setSwapSess] = useState(false)
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
  /** 칸 사이 이동바 — 트리와 시험 목록의 몫을 사람이 나눈다(지시) */
  const [wSrc, setWSrc] = useState(420)
  const [wDst, setWDst] = useState(420)
  const grip = (get: () => number, set: (v: number) => void) => (e: React.PointerEvent) => {
    e.preventDefault()
    const x0 = e.clientX
    const w0 = get()
    const move = (ev: PointerEvent) => set(Math.max(220, Math.min(900, w0 + (ev.clientX - x0))))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
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

  /** 이 폴더 아래의 폴더·요구사항을 다 모은다 — 체크는 「아래를 다 가져간다」 는 뜻 */
  const under = (cid: string): { cats: string[]; reqs: string[] } => {
    const cs: string[] = []
    const rs: string[] = []
    const walk = (id: string) => {
      cs.push(id)
      for (const r of reqsOf.get(id) ?? []) rs.push(r.id)
      for (const k of kids.get(id) ?? []) walk(k.id)
    }
    walk(cid)
    return { cats: cs, reqs: rs }
  }
  /** 고른 것으로 헤아린 시험 — 뺀 것은 안 센다 */
  const pickedTcIds = useMemo(() => {
    const out = new Set<string>()
    for (const p of picks) {
      if (p.kind === 'tc') out.add(p.id)
      else if (p.kind === 'req') for (const t of tcsOf.get(p.id) ?? []) out.add(t.tcid)
      else for (const rid of under(p.id).reqs) for (const t of tcsOf.get(rid) ?? []) out.add(t.tcid)
    }
    for (const s0 of skip) out.delete(s0)
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picks, skip, tcsOf, reqsOf, kids])
  const nCat = picks.filter((p) => p.kind === 'cat').length
  const nReq = useMemo(() => {
    const out = new Set<string>()
    for (const p of picks) {
      if (p.kind === 'req') out.add(p.id)
      else if (p.kind === 'cat') for (const rid of under(p.id).reqs) out.add(rid)
    }
    return out.size
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picks, reqsOf, kids])
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
            <input
              type="checkbox"
              className="cpd-ck"
              checked={on}
              onClick={(e) => e.stopPropagation()}
              onChange={() =>
                side === 'L' ? toggle({ kind: 'cat', id: c.id }) : setDst({ kind: 'cat', id: c.id })
              }
            />
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
              <input
                type="checkbox"
                className="cpd-ck"
                checked={
                  side === 'L' ? has({ kind: 'req', id: r.id }) : dst?.kind === 'req' && dst.id === r.id
                }
                onClick={(e) => e.stopPropagation()}
                onChange={() => {
                  if (side === 'L') {
                    setAtReq(r.id)
                    toggle({ kind: 'req', id: r.id })
                  } else setDst({ kind: 'req', id: r.id })
                }}
              />
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

  /**
   * 시험 칸 — 짚은 요구사항의 시험 항목.
   *
   * 왼쪽(Source)에서는 **골라서 옮길 것**이고, 오른쪽(Destination)에서는
   * **지금 그 자리에 무엇이 있나**를 보는 자리다(지시: 2열도 두 칸으로).
   * 붙이기 전에 이미 있는 것을 보면 같은 시험을 두 번 넣지 않는다.
   */
  const tcPane = (side: 'L' | 'R') => {
    const rid = side === 'L' ? atReq : dst?.kind === 'req' ? dst.id : ''
    const list = tcsOf.get(rid) ?? []
    if (!rid)
      return (
        <div className="cpd-empty">
          {side === 'L'
            ? '왼쪽에서 요구사항을 누르면 그 시험이 여기 섭니다.'
            : '붙일 요구사항을 고르면 그 자리에 있는 시험이 보입니다.'}
        </div>
      )
    if (!list.length) return <div className="cpd-empty">이 요구사항에는 시험이 없습니다.</div>
    return (
      <div className="rt cpd-tree">
        {list.map((t) => (
          <div
            key={t.tcid}
            className={`rt-req${side === 'L' && pickedTcIds.has(t.tcid) ? ' on' : ''}${
              side === 'R' ? ' cpd-ro' : ''
            }`}
            style={{ paddingLeft: 8 }}
            onClick={() => {
              if (side !== 'L') return
              if (has({ kind: 'tc', id: t.tcid })) toggle({ kind: 'tc', id: t.tcid })
              else
                setSkip((cur) => {
                  const n = new Set(cur)
                  if (n.has(t.tcid)) n.delete(t.tcid)
                  else n.add(t.tcid)
                  return n
                })
            }}
          >
            <input
              type="checkbox"
              className="cpd-ck"
              disabled={side === 'R'}
              checked={side === 'L' && pickedTcIds.has(t.tcid)}
              onClick={(e) => e.stopPropagation()}
              onChange={() => {
                if (side !== 'L') return
                /* 폴더·요구사항을 골라 자동으로 켜진 것은 **빼는 목록**으로
                   내린다(승인). 낱개로 고른 것은 그 자리에서 뺀다. */
                if (has({ kind: 'tc', id: t.tcid })) toggle({ kind: 'tc', id: t.tcid })
                else
                  setSkip((cur) => {
                    const n = new Set(cur)
                    if (n.has(t.tcid)) n.delete(t.tcid)
                    else n.add(t.tcid)
                    return n
                  })
              }}
            />
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
        body: JSON.stringify({
          items: mode === 'tc' ? [...pickedTcIds].map((id) => ({ kind: 'tc', id })) : picks,
          dst,
          mode,
          skip_tcs: [...skip],
          swap_model: swap,
          swap_sessions: swapSess,
        }),
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
          <b>프로젝트 복사</b>
          <span className="muted small">
            왼쪽에서 고르고 → 오른쪽 자리를 고른 뒤 화살표를 누르세요
          </span>
          <button className="modal-x" type="button" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <div className="cpd-body">
          <section className="cpd-pane src">
            <div className="cpd-h mid">Source</div>
            <div className="cpd-two">
              <div className="cpd-col" style={{ flex: `0 0 ${wSrc}px` }}>
                <div className="cpd-sub">
                  폴더 · 요구사항
                  <em>
                    폴더 {nCat} · 요구사항 {nReq}
                  </em>
                </div>
                {tree('L')}
              </div>
              <div className="cpd-grip" onPointerDown={grip(() => wSrc, setWSrc)} title="좌우로 끌어 폭을 바꿉니다" />
              <div className="cpd-col">
                <div className="cpd-sub">
                  시험 항목
                  <em>시험 {pickedTcIds.size}</em>
                </div>
                {tcPane('L')}
              </div>
            </div>
          </section>

          <div className="cpd-mid">
            {/* 무엇을 복사하나(승인) — 셋 중 하나 */}
            <div className="cpd-mode">
              {(
                [
                  ['all', '요구사항 + 시험'],
                  ['req', '요구사항만'],
                  ['tc', '시험만'],
                ] as Array<[typeof mode, string]>
              ).map(([k, lb]) => (
                <label key={k} className={mode === k ? 'on' : ''}>
                  <input
                    type="radio"
                    name="cpd-mode"
                    checked={mode === k}
                    onChange={() => {
                      setMode(k)
                      setDst(null)
                    }}
                  />
                  {lb}
                </label>
              ))}
            </div>
            <button
              className="btn primary cpd-go"
              type="button"
              disabled={
                !picks.length ||
                !dst ||
                busy ||
                (mode === 'tc' ? dst.kind !== 'req' : dst.kind !== 'cat')
              }
              title={
                !picks.length
                  ? '왼쪽에서 고르세요'
                  : !dst
                    ? '오른쪽 자리를 고르세요'
                    : mode === 'tc' && dst.kind !== 'req'
                      ? '시험만 복사할 때는 붙일 자리로 **요구사항**을 고르세요'
                      : mode !== 'tc' && dst.kind !== 'cat'
                        ? '붙일 자리로 **폴더**를 고르세요'
                        : '복사합니다'
              }
              onClick={() => void go()}
            >
              ➜
            </button>
            <label className="cpd-sw">
              <input type="checkbox" checked={swap} onChange={(e) => setSwap(e.target.checked)} />
              대상 모델로 바꿈
            </label>
            <label className="cpd-sw">
              <input
                type="checkbox"
                checked={swapSess}
                onChange={(e) => setSwapSess(e.target.checked)}
              />
              세션도 대상 장비로
            </label>
          </div>

          <section className="cpd-pane src">
            <div className="cpd-h mid">Destination</div>
            <div className="cpd-two">
              <div className="cpd-col" style={{ flex: `0 0 ${wDst}px` }}>
                <div className="cpd-sub">폴더 · 요구사항</div>
                {tree('R')}
              </div>
              <div className="cpd-grip" onPointerDown={grip(() => wDst, setWDst)} title="좌우로 끌어 폭을 바꿉니다" />
              <div className="cpd-col">
                <div className="cpd-sub">그 자리에 있는 시험</div>
                {tcPane('R')}
              </div>
            </div>
          </section>
        </div>

        {/* 닫기는 오른쪽 위 × 하나다(지시) — 바닥에 또 두면 어느 쪽을 눌러야
            하는지 매번 고르게 된다. 바닥은 결과만 말한다. */}
        {msg && (
          <div className="modal-foot">
            <span className="cpd-msg">{msg}</span>
          </div>
        )}
      </div>
    </div>
  )
}
