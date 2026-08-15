import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch, tcApi } from '@/api/client'
import MarkdownEditor from '@/components/MarkdownEditorLazy'
import { useCodes } from '@/hooks/useCodes'
import type { TcData } from './types'

interface Props {
  /** 고른 TC — id 와 이름. 이름이 있어야 무엇을 고치는지 눈으로 센다 */
  items: Array<{ tcid: string; name?: string | null }>
  onClose: () => void
  /** 다 끝난 뒤 — 목록을 다시 읽고 알림을 띄운다 */
  onDone: (msg: string) => void
}

/** 무엇을 넣을지 */
interface Fill {
  object_md: boolean
  precondition_md: boolean
  image: boolean
  model: boolean
  copy: boolean
  run_type: boolean
  type: boolean
  origin: boolean
  status: boolean
  severity: boolean
}

/** 「공용으로 하겠다」 는 명시적 선택 */
const COMMON = '*'

/**
 * 여러 TC 를 한 번에 고치기.
 *
 * 같은 시험 목적·사전 준비를 열두 건에 손으로 열두 번 적는 일이 실제로
 * 있었다. 한 건당 열고·붙이고·저장하고·닫기라 스무 번을 누른다.
 *
 * 겁나는 기능이라 두 가지를 지킨다.
 *
 *  1. **넣을 항목을 고른다.** 목적만 넣고 사전 준비는 그대로 두는 경우가
 *     대부분인데, 셋을 한꺼번에 밀면 안 쓴 칸이 빈 값으로 덮인다
 *  2. **「비어 있는 것만」 이 기본이다.** 덮어쓰기를 기본으로 두면 이미
 *     써 둔 목적 열두 건이 한 번에 날아간다. 되돌릴 방법이 없다
 *
 * 끝나면 몇 건에 들어갔고 몇 건을 건너뛰었는지 말해 준다 — 「12건 저장」
 * 만 보면 덮였는지 아닌지를 알 수 없다.
 */
export default function TcBulkEdit({ items, onClose, onDone }: Props) {
  const ids = items.map((x) => x.tcid)
  const [fill, setFill] = useState<Fill>({
    object_md: false,
    precondition_md: false,
    image: false,
    model: false,
    copy: false,
    run_type: false,
    type: false,
    origin: false,
    status: false,
    severity: false,
  })
  /* 값 한꺼번에 — 모델·분류값을 여러 건에 단다 (모델그룹+모델명 체계) */
  const [bMg, setBMg] = useState('')
  const [bMdl, setBMdl] = useState('')
  const [bRun, setBRun] = useState('')
  const [bType, setBType] = useState('')
  const [bOrigin, setBOrigin] = useState('')
  const [bStatus, setBStatus] = useState('')
  const [bSev, setBSev] = useState('')
  const RUN_TYPES = useCodes('tc_run_type', ['수동', '자동', '혼합'])
  const TYPES = useCodes('tc_type', ['FT', 'Function'])
  const ORIGINS = useCodes('tc_origin', ['자체', '고객'])
  const STATUSES = useCodes('tc_status', ['작성중', '검토중', '승인', 'PASS', 'FAIL', '보류'])
  const SEVERITIES = useCodes('tc_severity', ['치명', '중대', '보통', '경미'])
  /* 본보기에서 복사 — 토폴로지(세션·배선·배치)·계측기 트래픽은 손으로
     다시 못 적는다. 한 건을 본보기로 골라 통째로 심는다. */
  const [srcId, setSrcId] = useState('')
  const [cpTopo, setCpTopo] = useState(true)
  const [cpMeter, setCpMeter] = useState(false)
  const tcListQ = useQuery({
    queryKey: ['tc', 'list', 'meta'],
    queryFn: async () => {
      const r = await apiFetch('/api/tc?meta=1')
      return (await r.json()) as { tcs?: Array<{ tcid: string; name?: string | null }> }
    },
    staleTime: 30_000,
  })
  const rolesQ = useQuery({
    queryKey: ['device-roles'],
    queryFn: async () => {
      const r = await apiFetch('/api/device-roles')
      return (await r.json()) as {
        groups?: string[]
        models?: string[]
        model_info?: Record<string, { model_group?: string | null }>
      }
    },
    staleTime: 60_000,
  })
  const modelOpts = (rolesQ.data?.models ?? []).filter(
    (m) => !bMg || bMg === COMMON || (rolesQ.data?.model_info?.[m]?.model_group ?? '') === bMg,
  )
  const [obj, setObj] = useState('')
  const [pre, setPre] = useState('')
  const [img, setImg] = useState('')
  /** 이미 값이 있는 TC 를 덮을 것인가 */
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose, busy])

  const upload = async (file: File) => {
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await apiFetch('/api/upload/image', { method: 'POST', body: fd })
      const b = (await r.json().catch(() => ({}))) as { url?: string; name?: string; detail?: string }
      if (!r.ok) throw new Error(b.detail || '올리지 못했습니다')
      setImg(b.url || b.name || '')
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e))
    }
  }

  const grab = (dt?: DataTransferItemList | null, files?: FileList | null) => {
    let f: File | null = null
    for (const it of Array.from(dt ?? [])) {
      if (it.kind === 'file' && it.type.startsWith('image/')) {
        f = it.getAsFile()
        if (f) break
      }
    }
    if (!f) f = Array.from(files ?? []).find((x) => x.type.startsWith('image/')) ?? null
    if (!f) return false
    void upload(f)
    return true
  }

  /** 넣을 것이 하나라도 있고, 그 칸이 비어 있지 않은가 */
  const ready =
    (fill.object_md && obj.trim()) ||
    (fill.precondition_md && pre.trim()) ||
    (fill.image && img) ||
    (fill.model && !!bMg) ||
    (fill.copy && !!srcId && (cpTopo || cpMeter)) ||
    (fill.run_type && !!bRun) ||
    (fill.type && !!bType) ||
    (fill.origin && !!bOrigin) ||
    (fill.status && !!bStatus) ||
    (fill.severity && !!bSev) ||
    false

  const apply = async () => {
    setBusy(true)
    let done = 0
    let skip = 0
    const fails: string[] = []
    // 본보기는 한 번만 읽는다
    let src: TcData | null = null
    if (fill.copy && srcId && (cpTopo || cpMeter)) {
      try {
        const r = await apiFetch(`/api/tc/${encodeURIComponent(srcId)}`)
        if (r.ok) src = (await r.json()) as TcData
      } catch {
        /* 본보기를 못 읽으면 복사만 빠진다 */
      }
    }
    for (const id of ids) {
      try {
        const r = await apiFetch(`/api/tc/${encodeURIComponent(id)}`)
        if (!r.ok) throw new Error(String(r.status))
        const cur = (await r.json()) as TcData
        const patch: Record<string, unknown> = {}
        // 비어 있는 것만 채울 때는 이미 값이 있으면 손대지 않는다
        const put = (key: 'object_md' | 'precondition_md' | 'topo_img', v: string) => {
          const had = String((cur as Record<string, unknown>)[key] ?? '').trim()
          if (had && !over) return
          patch[key] = v
        }
        if (fill.object_md && obj.trim()) put('object_md', obj)
        if (fill.precondition_md && pre.trim()) put('precondition_md', pre)
        if (fill.image && img) put('topo_img', img)
        /* 값들 — 「비어 있는 것만」 규칙을 똑같이 지킨다 */
        const putVal = (key: string, v: string) => {
          const had = String((cur as Record<string, unknown>)[key] ?? '').trim()
          if (had && !over) return
          patch[key] = v
        }
        if (fill.model && bMg) {
          const had =
            String((cur as Record<string, unknown>).model_group ?? '').trim() ||
            String((cur as Record<string, unknown>).model ?? '').trim()
          if (!had || over) {
            patch.model_group = bMg === COMMON ? '' : bMg
            patch.model = bMdl === COMMON ? '' : bMdl
          }
        }
        if (src && id !== srcId) {
          const c = cur as Record<string, unknown>
          const sv = src as unknown as Record<string, unknown>
          if (cpTopo) {
            const had =
              (Array.isArray(c.wiring) && (c.wiring as unknown[]).length > 0) ||
              (Array.isArray(c.sessions) && (c.sessions as unknown[]).length > 0)
            if (!had || over) {
              patch.sessions = sv.sessions ?? []
              patch.wiring = sv.wiring ?? []
              if (sv.topoNodes !== undefined) patch.topoNodes = sv.topoNodes
            }
          }
          if (cpMeter) {
            const hadM = !!c.meterCfg && Object.keys(c.meterCfg as object).length > 0
            if (!hadM || over) patch.meterCfg = sv.meterCfg ?? {}
          }
        }
        if (fill.run_type && bRun) putVal('run_type', bRun)
        if (fill.type && bType) putVal('type', bType)
        if (fill.origin && bOrigin) putVal('origin', bOrigin)
        if (fill.status && bStatus) putVal('status', bStatus)
        if (fill.severity && bSev) putVal('severity', bSev)
        if (!Object.keys(patch).length) {
          skip++
          continue
        }
        await tcApi.save(id, { ...cur, ...patch, checks: cur.checks ?? [] })
        done++
      } catch {
        fails.push(id)
      }
    }
    setBusy(false)
    onDone(
      `${done}건에 넣었습니다` +
        (skip ? ` · ${skip}건은 이미 있어 건너뜀` : '') +
        (fails.length ? ` · ${fails.length}건 실패` : ''),
    )
  }

  const row = (
    key: keyof Fill,
    label: string,
    body: React.ReactNode,
  ) => (
    <div className={`bk-row${fill[key] ? ' on' : ''}`}>
      <label className="bk-name">
        <input
          type="checkbox"
          checked={fill[key]}
          onChange={(e) => setFill((f) => ({ ...f, [key]: e.target.checked }))}
        />
        <b>{label}</b>
      </label>
      {fill[key] && <div className="bk-body">{body}</div>}
    </div>
  )

  return (
    <div className="modal-back" onMouseDown={() => !busy && onClose()}>
      <div
        className="modal bk"
        role="dialog"
        aria-modal="true"
        aria-label="고른 시험 한꺼번에 고치기"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <b>고른 시험 {ids.length}건 고치기</b>
          <span className="sp" />
          <button className="btn small" type="button" disabled={busy} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="bk-cols">
        <div className="bk-list">
          {/* 값 한꺼번에 — 모델그룹+모델명 체계로 여러 건을 한 번에 단다 */}
          {row(
            'model',
            '적용 모델',
            <div className="bk-vals">
              <select
                value={bMg}
                onChange={(e) => {
                  const v = e.target.value
                  setBMg(v)
                  setBMdl(v === COMMON ? COMMON : '')
                }}
              >
                <option value="">(모델그룹 골라 주세요)</option>
                <option value={COMMON}>공용 (전체)</option>
                {(rolesQ.data?.groups ?? []).map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
              <select value={bMdl} disabled={bMg === COMMON} onChange={(e) => setBMdl(e.target.value)}>
                <option value="">{bMg === COMMON ? '공용' : '(모델명 — 그룹 공용이면 비움)'}</option>
                <option value={COMMON}>{bMg === COMMON ? '공용' : '(그룹 공용)'}</option>
                {modelOpts.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </div>,
          )}
          {row(
            'copy',
            '본보기에서 복사 (토폴로지 · 계측기)',
            <div className="bk-vals bk-copy">
              <select value={srcId} onChange={(e) => setSrcId(e.target.value)}>
                <option value="">(본보기 시험 골라 주세요)</option>
                {(tcListQ.data?.tcs ?? []).map((t) => (
                  <option key={t.tcid} value={t.tcid}>
                    {t.name || t.tcid}
                  </option>
                ))}
              </select>
              <label className="chk">
                <input type="checkbox" checked={cpTopo} onChange={(e) => setCpTopo(e.target.checked)} />
                토폴로지 (세션·배선·배치)
              </label>
              <label className="chk">
                <input
                  type="checkbox"
                  checked={cpMeter}
                  onChange={(e) => setCpMeter(e.target.checked)}
                />
                계측기 트래픽
              </label>
              <span className="muted small">본보기 자신은 건너뜁니다</span>
            </div>,
          )}
          {row(
            'run_type',
            '실행 타입',
            <div className="bk-vals">
              <select value={bRun} onChange={(e) => setBRun(e.target.value)}>
                <option value="">(선택)</option>
                {RUN_TYPES.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </div>,
          )}
          {row(
            'type',
            '유형',
            <div className="bk-vals">
              <select value={bType} onChange={(e) => setBType(e.target.value)}>
                <option value="">(선택)</option>
                {TYPES.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </div>,
          )}
          {row(
            'origin',
            '발생 구분',
            <div className="bk-vals">
              <select value={bOrigin} onChange={(e) => setBOrigin(e.target.value)}>
                <option value="">(선택)</option>
                {ORIGINS.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </div>,
          )}
          {row(
            'status',
            '상태',
            <div className="bk-vals">
              <select value={bStatus} onChange={(e) => setBStatus(e.target.value)}>
                <option value="">(선택)</option>
                {STATUSES.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
              <span className="muted small">상태는 대개 값이 있어 「덮어쓰기」 일 때만 바뀝니다</span>
            </div>,
          )}
          {row(
            'severity',
            '심각도',
            <div className="bk-vals">
              <select value={bSev} onChange={(e) => setBSev(e.target.value)}>
                <option value="">(선택)</option>
                {SEVERITIES.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </div>,
          )}
          {/* Object 탭과 같은 서식 편집기 — 여기서 쓴 것이 그 탭에 그대로
              보이니 쓰는 도구도 같아야 한다 */}
          {row(
            'object_md',
            '시험 목적',
            <div className="bk-md">
              <MarkdownEditor
                value={obj}
                onChange={setObj}
                placeholder="이 시험으로 무엇을 확인하는가"
              />
            </div>,
          )}
          {row(
            'precondition_md',
            '사전 준비 조건',
            <div className="bk-md">
              <MarkdownEditor
                value={pre}
                onChange={setPre}
                placeholder="시험 전에 갖춰져 있어야 하는 것"
              />
            </div>,
          )}
          {row(
            'image',
            '구성도 그림',
            <div
              className="bk-pic"
              tabIndex={0}
              onPaste={(e) => {
                if (grab(e.clipboardData?.items, e.clipboardData?.files)) e.preventDefault()
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                if (grab(e.dataTransfer?.items, e.dataTransfer?.files)) e.preventDefault()
              }}
            >
              {img ? (
                <>
                  <img src={img} alt="구성도" />
                  <button className="btn small" type="button" onClick={() => setImg('')}>
                    지우기
                  </button>
                </>
              ) : (
                <>
                  <span>
                    여기를 누르고 <b>Ctrl+V</b> — 끌어다 놓아도 됩니다
                  </span>
                  <button className="btn small" type="button" onClick={() => fileRef.current?.click()}>
                    파일에서
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) void upload(f)
                    }}
                  />
                </>
              )}
            </div>,
          )}
        </div>

        {/* 무엇에 들어가는지 보여 준다. 「12건」 이라는 숫자만 보고 덮어쓰기를
            누르게 하면 안 된다 — 잘못 고른 한 건이 그 안에 있어도 모른다. */}
        <div className="bk-targets">
          <div className="bk-thead">들어갈 시험 {ids.length}건</div>
          <ul>
            {items.map((x) => (
              <li key={x.tcid} title={x.tcid}>
                {x.name || x.tcid}
              </li>
            ))}
          </ul>
        </div>
        </div>

        <div className="bk-mode">
          {/* 되돌릴 수 없는 쪽을 기본으로 두지 않는다 */}
          <label>
            <input type="radio" checked={!over} onChange={() => setOver(false)} />
            비어 있는 것만 채우기
          </label>
          <label className="bk-danger">
            <input type="radio" checked={over} onChange={() => setOver(true)} />
            덮어쓰기
          </label>
          {over && (
            <span className="bk-warn">이미 적혀 있는 내용이 지워집니다. 되돌릴 수 없습니다.</span>
          )}
        </div>

        <div className="modal-foot">
          <span className="muted small">
            {ready ? `${ids.length}건에 적용합니다` : '넣을 내용을 적으세요'}
          </span>
          <span className="sp" />
          {/* 취소·넣기는 오른끝에 붙여 한 묶음 — 떨어져 있으면 눈이 오간다 */}
          <span className="page-head-actions">
            <button className="btn" type="button" disabled={busy} onClick={onClose}>
              취소
            </button>
            <button
              className="btn primary"
              type="button"
              disabled={!ready || busy}
              onClick={() => void apply()}
            >
              {busy ? '넣는 중…' : '넣기'}
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}
