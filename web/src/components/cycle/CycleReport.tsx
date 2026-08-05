import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { buildSlides, type LguStep, type LguTc } from './lgu'
import { saveLguPptx } from './lguPptx'

interface Props {
  cycleId: string
  model?: string | null
  version?: string | null
  onClose: () => void
}

/** 사이클 한 건의 전체 자료 — 항목 안에 스텝 결과가 들어 있다 */
interface CycleFull {
  model?: string | null
  version?: string | null
  items?: Array<{
    tcid?: string
    name?: string | null
    req_id?: string | null
    steps?: LguStep[]
  }>
}

/** TC 쪽에서만 얻을 수 있는 것 — 시험 규격과 구성도 */
interface TcExtra {
  object_md?: string | null
  precondition_md?: string | null
  topo_img?: string | null
}

/**
 * 고객사 결과서 — 미리보기와 저장.
 *
 * 「버전명 기준으로 사이클이 끝나면 고객사 양식으로」 가 이 화면의 목적이다.
 * 그래서 보고서 페이지를 거치지 않고 **사이클에서 바로** 연다. 중간에
 * 화면을 하나 두면 「어느 사이클?」 을 다시 고르는 일만 늘어난다.
 *
 * 미리보기는 HTML 로, 저장은 PptxGenJS 로 한다. 둘이 같은 쪽 나누기를
 * 쓰기 때문에 화면에서 센 장수와 파일의 장수가 어긋나지 않는다.
 */
export default function CycleReport({ cycleId, model, version, onClose }: Props) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose, busy])

  const cycQ = useQuery({
    queryKey: ['cycle-full', cycleId],
    queryFn: async () => {
      const r = await apiFetch(`/api/cycle/${encodeURIComponent(cycleId)}`)
      if (!r.ok) throw new Error('사이클을 불러오지 못했습니다')
      return (await r.json()) as CycleFull
    },
  })

  const items = useMemo(() => cycQ.data?.items ?? [], [cycQ.data])

  /*
   * 시험 규격과 구성도는 사이클 항목에 없다 — TC 에 있다. 항목마다 한 번씩
   * 불러온다. 64건이면 64번이라 적지 않지만, 결과서를 뽑는 것은 회차가
   * 끝날 때 한 번 하는 일이고, 없으면 「(미작성)」 「(구성도 없음)」 으로
   * 빈 채 나가는 문서가 된다.
   */
  const tcQ = useQuery({
    queryKey: ['cycle-report-tcs', cycleId, items.length],
    enabled: items.length > 0,
    queryFn: async () => {
      const out = new Map<string, TcExtra>()
      for (const it of items) {
        const id = it.tcid
        if (!id || out.has(id)) continue
        try {
          const r = await apiFetch(`/api/tc/${encodeURIComponent(id)}`)
          if (r.ok) out.set(id, (await r.json()) as TcExtra)
        } catch {
          // 한 건을 못 불러왔다고 결과서 전체를 막지 않는다
        }
      }
      return out
    },
  })

  const tcs: LguTc[] = useMemo(() => {
    const extra = tcQ.data
    return items.map((it) => {
      const e = extra?.get(it.tcid ?? '')
      return {
        tcid: it.tcid ?? '',
        name: it.name ?? '',
        reqid: it.req_id ?? '',
        spec: (e?.object_md || e?.precondition_md || '').trim(),
        topoImg: e?.topo_img || '',
        remark: '',
        // 종류로 거르지 않는다. 옛 코드가 cli·wait 만 실어서 ping·snmp·
        // diff·계측기 스텝이 결과서에서 통째로 빠졌다.
        steps: it.steps ?? [],
      }
    })
  }, [items, tcQ.data])

  const slides = useMemo(() => (tcs.length ? buildSlides(tcs) : []), [tcs])

  const save = async () => {
    setBusy(true)
    setMsg('만드는 중…')
    try {
      const n = await saveLguPptx(tcs, { model, version })
      setMsg(`${n}장 저장했습니다`)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '저장하지 못했습니다')
    } finally {
      setBusy(false)
    }
  }

  const loading = cycQ.isLoading || (items.length > 0 && tcQ.isLoading)

  return (
    <div className="modal-back" onMouseDown={() => !busy && onClose()}>
      <div
        className="modal rp"
        role="dialog"
        aria-modal="true"
        aria-label="고객사 결과서 미리보기"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <b>고객사 결과서 — {[model, version].filter(Boolean).join(' ')}</b>
          <span className="muted small">
            {loading ? '불러오는 중…' : `${tcs.length}건 · ${slides.length}장`}
          </span>
          <span className="sp" />
          {msg && <span className="muted small">{msg}</span>}
          <button
            className="btn primary small"
            type="button"
            disabled={busy || loading || !slides.length}
            onClick={() => void save()}
          >
            {busy ? '…' : 'PPTX 저장'}
          </button>
          <button className="btn small" type="button" disabled={busy} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="rp-body">
          {loading ? (
            <div className="empty">시험 자료를 모으는 중…</div>
          ) : slides.length ? (
            slides.map((html, i) => (
              <div className="rp-slide" key={i}>
                <span className="rp-no">
                  {i + 1} / {slides.length}
                </span>
                {/* 양식은 옛 화면의 HTML 을 그대로 옮긴 것이라 문자열로 그린다.
                    자료는 우리 서버에서 온 것이고 넣기 전에 이스케이프한다. */}
                <div className="rp-page" dangerouslySetInnerHTML={{ __html: html }} />
              </div>
            ))
          ) : (
            <div className="empty">사이클에 시험 항목이 없습니다.</div>
          )}
        </div>
      </div>
    </div>
  )
}
