import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
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
 * 파일로 내보냈다 가져오는 길은 「이 줄이 어느 요구사항에 붙나」 를 사람이
 * 다시 정해 줘야 했다. 붙일 자리를 **먼저 고르고** 옮기면 그 물음이 아예
 * 사라진다. 프로젝트 통째로도 이 창으로 한다 — 왼쪽에서 뿌리 폴더를 고르면
 * 하위 폴더·요구사항·시험이 다 따라간다.
 *
 * 규칙(승인): 새 ID 로 발번 · 연결은 새 ID 끼리 유지 · 대상 프로젝트의
 * 모델로 갈아 끼움(끌 수 있음) · 같은 이름이면 「(복제)」 · 실행 이력은 빼고.
 */
export default function CopyDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [picks, setPicks] = useState<Pick[]>([])
  const [dst, setDst] = useState<Pick | null>(null)
  const [swap, setSwap] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [openL, setOpenL] = useState<Set<string>>(new Set())
  const [openR, setOpenR] = useState<Set<string>>(new Set())

  const catsQ = useQuery({
    queryKey: ['req-categories'],
    queryFn: async () => {
      const r = await apiFetch('/api/req-categories')
      const j = (await r.json()) as { categories?: Cat[] }
      return j.categories ?? []
    },
  })
  const reqsQ = useQuery({
    queryKey: ['copy-reqs'],
    queryFn: async () => {
      const r = await apiFetch('/api/req')
      const j = (await r.json()) as { reqs?: Req[] }
      return j.reqs ?? []
    },
  })
  const tcsQ = useQuery({
    queryKey: ['copy-tcs'],
    queryFn: async () => {
      const r = await apiFetch('/api/tc?meta=1')
      const j = (await r.json()) as { tcs?: Tc[] }
      return j.tcs ?? []
    },
  })

  const cats = catsQ.data ?? []
  const reqs = reqsQ.data ?? []
  const tcs = tcsQ.data ?? []
  const kids = useMemo(() => {
    const m = new Map<string, Cat[]>()
    for (const c of cats) m.set(String(c.parent_id ?? ''), [...(m.get(String(c.parent_id ?? '')) ?? []), c])
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
    setPicks((cur) => (has(p) ? cur.filter((x) => !(x.kind === p.kind && x.id === p.id)) : [...cur, p]))

  /** 한쪽 판을 그린다 — 왼쪽은 여럿 고르기, 오른쪽은 붙일 자리 하나 */
  const pane = (side: 'L' | 'R') => {
    const open = side === 'L' ? openL : openR
    const setOpen = side === 'L' ? setOpenL : setOpenR
    const flip = (id: string) =>
      setOpen((cur) => {
        const n = new Set(cur)
        if (n.has(id)) n.delete(id)
        else n.add(id)
        return n
      })
    const row = (kind: Pick['kind'], id: string, label: string, depth: number, extra?: string) => {
      const on =
        side === 'L' ? has({ kind, id }) : dst?.kind === kind && dst?.id === id
      const canPick =
        side === 'L' ? true : kind !== 'tc' /* 붙일 자리는 폴더나 요구사항이다 */
      return (
        <div
          key={`${kind}:${id}`}
          className={`cpd-row${on ? ' on' : ''}${canPick ? '' : ' off'}`}
          style={{ paddingLeft: 6 + depth * 14 }}
          onClick={() => {
            if (!canPick) return
            if (side === 'L') toggle({ kind, id })
            else setDst({ kind, id })
          }}
        >
          {kind === 'cat' ? (
            <button
              type="button"
              className={`cpd-caret${open.has(id) ? ' open' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                flip(id)
              }}
              aria-label={open.has(id) ? '접기' : '펴기'}
            >
              ▸
            </button>
          ) : (
            <span className="cpd-caret ph" />
          )}
          <i className={`cpd-ic ${kind}`} aria-hidden="true">
            {kind === 'cat' ? '📁' : kind === 'req' ? '📄' : '🧪'}
          </i>
          <span className="cpd-lb">{label}</span>
          {extra && <em>{extra}</em>}
        </div>
      )
    }
    const draw = (parent: string, depth: number): React.ReactNode[] => {
      const out: React.ReactNode[] = []
      for (const c of kids.get(parent) ?? []) {
        out.push(row('cat', c.id, c.name, depth))
        if (!open.has(c.id)) continue
        out.push(...draw(c.id, depth + 1))
        for (const r of reqsOf.get(c.id) ?? []) {
          out.push(row('req', r.id, r.title || r.reqid || r.id, depth + 1, r.reqid))
          if (side === 'L' && open.has(r.id))
            for (const t of tcsOf.get(r.id) ?? [])
              out.push(row('tc', t.tcid, t.name || t.tcid, depth + 2, t.tcid))
          if (side === 'L' && (tcsOf.get(r.id)?.length ?? 0) > 0 && !open.has(r.id))
            out.push(
              <div
                key={`more:${r.id}`}
                className="cpd-more"
                style={{ paddingLeft: 6 + (depth + 2) * 14 }}
                onClick={() => flip(r.id)}
              >
                시험 {tcsOf.get(r.id)?.length}건 보기
              </div>,
            )
        }
      }
      return out
    }
    return <div className="cpd-tree">{draw('', 0)}</div>
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
      const j = (await r.json()) as { ok?: boolean; cats?: number; reqs?: number; tcs?: number; detail?: string }
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
      <div className="modal cpd" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <b>복사</b>
          <span className="muted small">
            왼쪽에서 고르고 → 오른쪽 자리를 고른 뒤 화살표를 누르세요
          </span>
          <button className="modal-x" type="button" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <div className="cpd-body">
          <section className="cpd-pane">
            <div className="cpd-h">
              Source
              <em>{picks.length ? `${picks.length}개 고름` : '고를 것을 누르세요'}</em>
            </div>
            {pane('L')}
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
              <em>{dst ? (dst.kind === 'cat' ? '폴더' : '요구사항') : '붙일 자리를 누르세요'}</em>
            </div>
            {pane('R')}
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
