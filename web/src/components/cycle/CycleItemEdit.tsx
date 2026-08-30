import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import type { CycleItemLite } from '@/pages/Cycles'
import './CycleItemEdit.css'

interface Props {
  /** 고칠 항목들. 한 건이면 Edit, 여럿이면 Bulk Edit 이다 */
  items: CycleItemLite[]
  /** 결과 드롭다운에 쓸 값 (화면과 같은 목록) */
  results: Array<{ v: string; label: string }>
  onClose: () => void
  /** 바꿀 것만 담아 돌려준다 — 안 건드린 칸은 그대로 둔다 */
  onApply: (patch: { result?: string; assignee?: string; note?: string }) => Promise<void> | void
}

/**
 * 플랜 항목 고치기 — 한 건이든 여러 건이든 같은 창.
 *
 * 여러 건일 때가 중요하다. 스무 건을 돌리고 담당자를 한 명에게 몰아 주거나
 * 결과를 한꺼번에 바꾸는 일이 잦은데, 줄마다 드롭다운을 여는 것은 일이 아니다.
 *
 * **켠 칸만 바뀐다.** 여러 건을 고칠 때 안 건드린 칸까지 덮어쓰면, 저마다
 * 다르게 적어 둔 메모가 통째로 날아간다.
 */
export default function CycleItemEdit({ items, results, onClose, onApply }: Props) {
  const one = items.length === 1 ? items[0] : undefined

  const [onResult, setOnResult] = useState(false)
  const [onAssignee, setOnAssignee] = useState(false)
  const [onNote, setOnNote] = useState(false)
  const [result, setResult] = useState(one?.result ?? '')
  const [assignee, setAssignee] = useState(one?.assignee ?? '')
  const [note, setNote] = useState(one?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // 한 건이면 지금 값을 그대로 고치는 것이라 세 칸 다 켜 둔다
  useEffect(() => {
    if (!one) return
    setOnResult(true)
    setOnAssignee(true)
    setOnNote(true)
  }, [one])

  /** 담당자 후보 — 이미 쓰이는 사람과 등록된 사용자 */
  const userQ = useQuery({
    queryKey: ['users', 'names'],
    queryFn: async () => {
      const r = await apiFetch('/api/users')
      if (!r.ok) return { users: [] as Array<{ username?: string; name?: string }> }
      return (await r.json()) as { users: Array<{ username?: string; name?: string }> }
    },
    staleTime: 300_000,
  })
  const people = useMemo(() => {
    const s = new Set<string>()
    for (const u of userQ.data?.users ?? []) {
      const n = u.name || u.username || ''
      if (n) s.add(n)
    }
    for (const it of items) if (it.assignee) s.add(it.assignee)
    return [...s].sort((a, b) => a.localeCompare(b, 'ko'))
  }, [userQ.data, items])

  const dirty = onResult || onAssignee || onNote

  const apply = async () => {
    if (!dirty) return
    setBusy(true)
    setErr('')
    try {
      await onApply({
        ...(onResult ? { result: result === '' ? '미실행' : result } : {}),
        ...(onAssignee ? { assignee } : {}),
        ...(onNote ? { note } : {}),
      })
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div
        className="modal cie"
        role="dialog"
        aria-modal="true"
        aria-label="플랜 항목 고치기"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <b>{one ? '항목 고치기' : `${items.length}건 한꺼번에 고치기`}</b>
          <span className="muted small">
            {one ? one.name || one.tcid : items.map((x) => x.name || x.tcid).join(', ').slice(0, 60)}
          </span>
          <span className="sp" />
          <button className="modal-x" type="button" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body cie-body">
          {err && <div className="form-error">{err}</div>}
          {!one && (
            <p className="muted small cie-hint">
              켠 칸만 바뀝니다. 끈 칸은 항목마다 지금 값을 그대로 둡니다.
            </p>
          )}

          <div className={`cie-fld${onResult ? ' on' : ''}`}>
            {!one && (
              <input
                type="checkbox"
                checked={onResult}
                onChange={(e) => setOnResult(e.target.checked)}
                aria-label="결과 바꾸기"
              />
            )}
            <span className="cie-lb">결과</span>
            <select
              value={result}
              disabled={!onResult}
              onChange={(e) => setResult(e.target.value)}
            >
              {results.map((r) => (
                <option key={r.v} value={r.v}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div className={`cie-fld${onAssignee ? ' on' : ''}`}>
            {!one && (
              <input
                type="checkbox"
                checked={onAssignee}
                onChange={(e) => setOnAssignee(e.target.checked)}
                aria-label="담당자 바꾸기"
              />
            )}
            <span className="cie-lb">담당자</span>
            <input
              list="cie-people"
              value={assignee}
              disabled={!onAssignee}
              placeholder="이름 (비우면 담당 없음)"
              onChange={(e) => setAssignee(e.target.value)}
            />
            <datalist id="cie-people">
              {people.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>

          <div className={`cie-fld${onNote ? ' on' : ''}`}>
            {!one && (
              <input
                type="checkbox"
                checked={onNote}
                onChange={(e) => setOnNote(e.target.checked)}
                aria-label="메모 바꾸기"
              />
            )}
            <span className="cie-lb">메모</span>
            <input
              value={note}
              disabled={!onNote}
              placeholder="이 회차에 남길 한 줄"
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <div className="modal-foot cie-foot">
          <span className="muted small">
            {dirty ? `${items.length}건에 적용합니다` : '바꿀 칸을 켜세요'}
          </span>
          <span className="sp" />
          <button className="btn" type="button" onClick={onClose}>
            취소
          </button>
          <button
            className="btn primary"
            type="button"
            disabled={!dirty || busy}
            onClick={() => void apply()}
          >
            {busy ? '적용 중…' : '적용'}
          </button>
        </div>
      </div>
    </div>
  )
}
