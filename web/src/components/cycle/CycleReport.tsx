import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { buildSlides, type LguStep, type LguTc } from './lgu'
import { saveLguPptx } from './lguPptx'
import { saveTplPptx } from './tplPptx'
import { wireShot } from '@/components/tc/wireMermaid'
import type { Device } from '@/pages/Devices'
import type { TcPortLink, TcWire } from '@/components/tc/types'

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

/** TC 쪽에서만 얻을 수 있는 것 — 시험 규격과 구성도, 그리고 배선 */
interface TcExtra {
  object_md?: string | null
  precondition_md?: string | null
  topo_img?: string | null
  wiring?: TcWire[] | null
  portLinks?: TcPortLink[] | null
  sessions?: unknown
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

  /** 장비 — 구성도를 그릴 때 이름·IP·랩을 여기서 읽는다 */
  const devQ = useQuery({
    queryKey: ['report-devices'],
    enabled: items.length > 0,
    queryFn: async () => {
      // `/api/devices` 는 옛 JSON 파일을 읽는 라우트다. 화면이 쓰는 것은
      // 표(db)를 읽는 `devices2` 다 — 옛쪽은 파일이 없으면 500 이 난다.
      const r = await apiFetch('/api/devices2')
      if (!r.ok) return [] as Device[]
      const j = (await r.json()) as { devices?: Device[] }
      return (j.devices ?? []) as Device[]
    },
  })

  /**
   * 구성도를 **배선으로 그려 둔다.**
   *
   * 붙여 넣은 그림이 있으면 그것을 쓴다 — 사람이 고른 것이 먼저다. 없는
   * 시험은 여태 「(구성도 없음)」 으로 나갔는데, 배선은 적혀 있는데 그림만
   * 없어서 그랬다. 있는 자료로 그리면 될 일이었다.
   */
  const [drawn, setDrawn] = useState<Record<string, string>>({})
  useEffect(() => {
    const extra = tcQ.data
    const devices = devQ.data
    if (!extra || !devices?.length) return
    let alive = true
    void (async () => {
      const out: Record<string, string> = {}
      for (const [tcid, e] of extra) {
        if (e.topo_img) continue
        const wiring = (e.wiring ?? []) as TcWire[]
        const links = (e.portLinks ?? []) as TcPortLink[]
        if (!wiring.length && !links.length) continue
        const sessions = Array.isArray(e.sessions) ? (e.sessions as string[]) : []
        try {
          const shot = await wireShot({ devices, wiring, links, sessions })
          if (shot) out[tcid] = shot.data
        } catch {
          // 그림 하나 못 그렸다고 결과서를 막지 않는다
        }
      }
      if (alive && Object.keys(out).length) setDrawn(out)
    })()
    return () => {
      alive = false
    }
  }, [tcQ.data, devQ.data])

  const tcs: LguTc[] = useMemo(() => {
    const extra = tcQ.data
    return items.map((it) => {
      const e = extra?.get(it.tcid ?? '')
      return {
        tcid: it.tcid ?? '',
        name: it.name ?? '',
        reqid: it.req_id ?? '',
        spec: (e?.object_md || e?.precondition_md || '').trim(),
        topoImg: e?.topo_img || drawn[it.tcid ?? ''] || '',
        remark: '',
        // 종류로 거르지 않는다. 옛 코드가 cli·wait 만 실어서 ping·snmp·
        // diff·계측기 스텝이 결과서에서 통째로 빠졌다.
        steps: it.steps ?? [],
      }
    })
  }, [items, tcQ.data, drawn])

  const slides = useMemo(() => (tcs.length ? buildSlides(tcs) : []), [tcs])

  /**
   * 저장 — **고객사가 준 pptx 를 채운다.**
   *
   * 전에는 브라우저가 표와 글자를 직접 그렸다. 자리를 아무리 맞춰도
   * 글꼴·표선·머리글이 저쪽 것과 미묘하게 달라, 받는 쪽에서 결국 자기
   * 양식으로 다시 옮겼다. 이제 저쪽 파일을 그대로 열어 값만 갈아 끼운다.
   *
   * 양식 파일이 없거나 서버가 옛것이면 옛 방식으로 떨어뜨린다 — 결과서를
   * 아예 못 만드는 것보다 낫다.
   */
  const save = async () => {
    setBusy(true)
    setMsg('만드는 중…')
    try {
      const n = await saveTplPptx(tcs, { model, version })
      setMsg(`${n}장 저장했습니다 — 고객사 양식`)
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e)
      try {
        const n = await saveLguPptx(tcs, { model, version })
        setMsg(`${n}장 저장했습니다 (양식 파일을 못 써서 옛 방식으로 — ${why})`)
      } catch (e2) {
        setMsg(e2 instanceof Error ? e2.message : '저장하지 못했습니다')
      }
    } finally {
      setBusy(false)
    }
  }

  const loading = cycQ.isLoading || (items.length > 0 && tcQ.isLoading)

  return (
    <div className="modal-back" onMouseDown={() => !busy && onClose()}>
      <div
        className="modal cyrp"
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

        <div className="cyrp-body">
          {loading ? (
            <div className="empty">시험 자료를 모으는 중…</div>
          ) : slides.length ? (
            slides.map((html, i) => (
              /*
               * 장 하나를 **iframe 안에** 그린다.
               *
               * 앱의 CSS 가 이 안에 못 들어온다. 밖에서 이 장을 눌러 표가
               * 통째로 안 보이는 일이 되풀이됐는데, 어느 규칙이 그랬는지
               * 원격으로는 짚을 수가 없었다. 격리하면 그런 일이 아예 안
               * 생긴다 — 결과서 미리보기는 「우리 화면」 이 아니라 「저쪽
               * 문서」 라서, 우리 규칙이 닿지 않는 편이 옳기도 하다.
               *
               * 1280×720 을 0.78 로 줄여 998×562 로 보인다.
               */
              <div className="cyrp-wrap" key={i}>
                <span className="cyrp-no">
                  {i + 1} / {slides.length}
                </span>
                <iframe
                  className="cyrp-frame"
                  title={`${i + 1}장`}
                  sandbox=""
                  srcDoc={
                    '<!doctype html><meta charset="utf-8">' +
                    '<style>html,body{margin:0;padding:0;background:#fff}' +
                    '.p{width:1280px;height:720px;padding:24px 30px;box-sizing:border-box;' +
                    'overflow:hidden;transform:scale(0.78);transform-origin:top left;' +
                    "font-family:'Malgun Gothic',AppleGothic,sans-serif;color:#111}</style>" +
                    `<div class="p">${html}</div>`
                  }
                />
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
