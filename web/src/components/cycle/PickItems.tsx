/**
 * **시험 항목 고르기** — 목업대로, 사이클에 담을 항목을 체크로 고른다.
 *
 * 전에는 옛 편집 창(CycleEdit)의 큰 팝업이 떴다. 요구사항 트리·필터 여섯
 * 개·공용 항목 토글까지 한 화면에 펴 놓아, 정작 알아야 할 것 — **이 항목이
 * 자동인가 수동인가** — 가 어디에도 없었다. 사이클은 담긴 항목의 방식대로
 * 자동·수동 실행을 뜨므로, 그것이 고를 때 가장 중요한 값이다.
 *
 * 자동·수동의 정본은 **TC 의 run_type** 이다(REQ-Coverage 의 실행 타입).
 * 목록 API 는 kind 를 안 실어 보내므로 그것만 보면 전부 자동으로 뜬다.
 */
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { normMode } from '@/lib/runMode'
import type { CycleMeta } from '@/pages/Cycles'
import type { TestCaseMeta } from '@/types'
import './PickItems.css'

type Tab = 'all' | 'a' | 'm'

export default function PickItems({
  cycle,
  onClose,
  onDone,
}: {
  cycle: CycleMeta
  onClose: () => void
  /** 담기를 마쳤다 — 부르는 쪽이 목록을 다시 읽는다 */
  onDone: () => void
}) {
  const [tab, setTab] = useState<Tab>('all')
  const [q, setQ] = useState('')
  /** 담긴 것 — 창을 여는 순간의 사이클 항목에서 시작한다 */
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  /** 이 모델 것만 볼까 — 66건 중에서 고르려면 좁힐 자리가 필요하다 */
  const [mine, setMine] = useState(true)

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose, busy])

  /* 담긴 항목은 **전문**에서 읽는다 — 목록의 요약본은 항목을 깎아 준다 */
  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const r = await apiFetch(`/api/cycle/${encodeURIComponent(cycle.id)}`)
        if (r.ok) {
          const j = (await r.json()) as { items?: Array<{ tcid?: string }> }
          if (live)
            setPicked(
              new Set((j.items ?? []).map((x) => String(x?.tcid ?? '')).filter(Boolean)),
            )
        }
      } catch {
        /* 못 읽으면 빈 채로 시작한다 — 담기는 아래에서 다시 합친다 */
      }
      if (live) setReady(true)
    })()
    return () => {
      live = false
    }
  }, [cycle.id])

  const tcQ = useQuery({
    queryKey: ['tc-meta'],
    staleTime: 60_000,
    queryFn: async () => {
      const r = await apiFetch('/api/tc?meta=1')
      if (!r.ok) throw new Error('시험 항목을 불러오지 못했습니다')
      return (await r.json()) as { tcs: TestCaseMeta[] }
    },
  })

  /** 자동·수동 — run_type 이 정본 */
  const isMan = (t: TestCaseMeta) => normMode(String(t.run_type ?? t.kind ?? '')) === '수동'

  const all = useMemo(() => tcQ.data?.tcs ?? [], [tcQ.data])
  /** 이 사이클의 모델(또는 모델그룹) 것 */
  const ofModel = useMemo(() => {
    const m = String(cycle.model ?? '')
    const g = String(cycle.model_group ?? '')
    if (!m && !g) return all
    return all.filter(
      (t) => String(t.model ?? '') === m || String(t.model_group ?? '') === g,
    )
  }, [all, cycle])

  const pool = mine ? ofModel : all
  const nAuto = pool.filter((t) => !isMan(t)).length
  const nMan = pool.length - nAuto

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return pool
      .filter((t) => (tab === 'all' ? true : tab === 'm' ? isMan(t) : !isMan(t)))
      .filter(
        (t) =>
          !s ||
          String(t.tcid).toLowerCase().includes(s) ||
          String(t.name ?? '').toLowerCase().includes(s),
      )
  }, [pool, tab, q])

  const pickedAuto = useMemo(() => {
    let a = 0
    for (const t of all) if (picked.has(t.tcid) && !isMan(t)) a++
    return a
  }, [all, picked])

  function toggle(tcid: string) {
    setPicked((cur) => {
      const n = new Set(cur)
      if (n.has(tcid)) n.delete(tcid)
      else n.add(tcid)
      return n
    })
  }

  /** 담기 — **전문을 읽어 얹는다.** 요약본을 되쓰면 실행 결과가 지워진다 */
  async function save() {
    setBusy(true)
    try {
      const r = await apiFetch(`/api/cycle/${encodeURIComponent(cycle.id)}`)
      if (!r.ok) throw new Error('사이클을 불러오지 못했습니다')
      const full = (await r.json()) as Record<string, unknown> & {
        items?: Array<Record<string, unknown>>
      }
      const was = full.items ?? []
      const keep = was.filter((x) => picked.has(String(x?.tcid ?? '')))
      const had = new Set(keep.map((x) => String(x?.tcid ?? '')))
      /* 새로 담긴 것 — 결과 칸은 비운 채로. 이름은 목록에서 가져온다 */
      const add = [...picked]
        .filter((id) => !had.has(id))
        .map((id) => ({
          tcid: id,
          name: String(all.find((t) => t.tcid === id)?.name ?? ''),
          steps: [],
        }))
      const w = await apiFetch(`/api/cycle/${encodeURIComponent(cycle.id)}`, {
        method: 'POST',
        body: JSON.stringify({ ...full, items: [...keep, ...add] }),
      })
      if (!w.ok) throw new Error('담지 못했습니다')
      onDone()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const where = [cycle.version || cycle.name, cycle.customer, cycle.model]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="pki-back" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="pki" role="dialog" aria-modal="true" aria-label="시험 항목 고르기">
        <header className="pki-head">
          <b>시험 항목 고르기</b>
          <span className="pki-where">{where}</span>
          <span className="pki-sp" />
          <button type="button" className="pki-x" title="닫기" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="pki-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'all'}
            className={tab === 'all' ? 'on' : ''}
            onClick={() => setTab('all')}
          >
            전체 <span className="n">{pool.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'a'}
            className={tab === 'a' ? 'on' : ''}
            onClick={() => setTab('a')}
          >
            ⚙ 자동 <span className="n">{nAuto}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'm'}
            className={tab === 'm' ? 'on' : ''}
            onClick={() => setTab('m')}
          >
            ✋ 수동 <span className="n">{nMan}</span>
          </button>
          <span className="pki-sp" />
          <input
            className="pki-q"
            value={q}
            placeholder="ID · 제목 찾기"
            onChange={(e) => setQ(e.target.value)}
          />
          <label className="pki-only" title="이 사이클의 모델·모델그룹 것만 봅니다">
            <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
            이 모델만
          </label>
        </div>

        <div className="pki-rows">
          {!ready || tcQ.isLoading ? (
            <div className="pki-none">불러오는 중…</div>
          ) : !shown.length ? (
            <div className="pki-none">고를 항목이 없습니다.</div>
          ) : (
            shown.map((t) => {
              const man = isMan(t)
              const on = picked.has(t.tcid)
              return (
                <label key={t.tcid} className={`pki-row${on ? ' on' : ''}`}>
                  <input type="checkbox" checked={on} onChange={() => toggle(t.tcid)} />
                  <span className="id">{t.tcid}</span>
                  <span className="nm">{t.name ?? ''}</span>
                  <span className={`pki-pill ${man ? 'amber' : 'blue'}`}>
                    {man ? '✋ 수동' : '⚙ 자동'}
                  </span>
                  <span className="pki-pill gray">{String(t.status ?? '')}</span>
                </label>
              )
            })
          )}
        </div>

        <footer className="pki-foot">
          <span className="pki-cnt">
            담긴 항목 <b>자동 {pickedAuto}</b> · <b>수동 {picked.size - pickedAuto}</b>
          </span>
          <span className="pki-sp" />
          <button type="button" className="btn small" disabled={busy} onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className="btn small pki-go"
            disabled={busy || !ready}
            onClick={() => void save()}
          >
            {busy ? '담는 중…' : '완료'}
          </button>
        </footer>
      </div>
    </div>
  )
}
