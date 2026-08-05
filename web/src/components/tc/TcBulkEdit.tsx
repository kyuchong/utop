import { useEffect, useRef, useState } from 'react'
import { apiFetch, tcApi } from '@/api/client'
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
}

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
  const [fill, setFill] = useState<Fill>({ object_md: true, precondition_md: false, image: false })
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
    false

  const apply = async () => {
    setBusy(true)
    let done = 0
    let skip = 0
    const fails: string[] = []
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
          {row(
            'object_md',
            '시험 목적',
            <textarea
              rows={7}
              value={obj}
              placeholder="이 시험으로 무엇을 확인하는가"
              onChange={(e) => setObj(e.target.value)}
            />,
          )}
          {row(
            'precondition_md',
            '사전 준비 조건',
            <textarea
              rows={7}
              value={pre}
              placeholder="시험 전에 갖춰져 있어야 하는 것"
              onChange={(e) => setPre(e.target.value)}
            />,
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
        </div>
      </div>
    </div>
  )
}
