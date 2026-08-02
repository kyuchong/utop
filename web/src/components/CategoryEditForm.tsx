import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { categoryApi } from '@/api/client'
import { MAX_CAT_DEPTH, naturalCompare, type ReqCategory } from '@/types'
import './ReqForm.css'

interface Props {
  /** 편집할 분류 */
  cat: ReqCategory
  /** 전체 분류 (상위 후보를 고르는 데 쓴다) */
  all: ReqCategory[]
  onClose: () => void
}

/**
 * 분류 이름 변경 + 상위 분류 이동.
 *
 * 드래그로도 옮길 수 있지만 그건 환경을 탄다(브라우저·터치패드·원격데스크톱).
 * 여기는 확실하게 되는 길이다 — 목록에서 고르면 끝난다.
 *
 * 못 고르는 자리도 숨기지 않고 이유를 붙여 회색으로 보여준다.
 * 통째로 감추면 목록이 텅 비어 '왜 안 되지' 로만 남는다.
 *   - 자기 자신과 자기 자손 (순환)
 *   - 옮긴 뒤 3단을 넘게 되는 자리
 */
export default function CategoryEditForm({ cat, all, onClose }: Props) {
  const qc = useQueryClient()
  const [name, setName] = useState(cat.name)
  const [parentId, setParentId] = useState(cat.parent_id ?? '')
  const [error, setError] = useState('')

  /** id → 자식들 */
  const kids = useMemo(() => {
    const m = new Map<string, ReqCategory[]>()
    for (const c of all) {
      const k = c.parent_id ?? ''
      const arr = m.get(k)
      if (arr) arr.push(c)
      else m.set(k, [c])
    }
    return m
  }, [all])

  const depthOf = (id: string | null): number => {
    let d = 0
    let cur = id
    const seen = new Set<string>()
    while (cur && !seen.has(cur)) {
      seen.add(cur)
      d++
      cur = all.find((c) => c.id === cur)?.parent_id ?? null
    }
    return d
  }

  /** 이 가지의 높이 (자기만 1, 손자까지 있으면 3) */
  const heightOf = (id: string): number => {
    const ch = kids.get(id) ?? []
    return ch.length === 0 ? 1 : 1 + Math.max(...ch.map((c) => heightOf(c.id)))
  }

  const descendants = useMemo(() => {
    const out = new Set<string>([cat.id])
    const walk = (id: string) => {
      for (const c of kids.get(id) ?? []) {
        if (out.has(c.id)) continue
        out.add(c.id)
        walk(c.id)
      }
    }
    walk(cat.id)
    return out
  }, [cat.id, kids])

  const myHeight = heightOf(cat.id)

  /** 상위로 고를 수 있는 것만 (경로를 함께 보여줘야 어디로 가는지 안다) */
  const options = useMemo(() => {
    const pathOf = (c: ReqCategory): string => {
      const names: string[] = []
      let cur: ReqCategory | undefined = c
      const seen = new Set<string>()
      while (cur && !seen.has(cur.id)) {
        seen.add(cur.id)
        names.unshift(cur.name)
        cur = all.find((x) => x.id === cur!.parent_id)
      }
      return names.join(' > ')
    }
    // 못 고르는 것도 숨기지 않고 이유를 붙여 보여준다.
    // 통째로 감추면 '왜 목록이 비었지' 로만 남는다.
    return all
      .map((c) => {
        const path = pathOf(c)
        if (descendants.has(c.id)) {
          return { id: c.id, path, why: c.id === cat.id ? '자기 자신' : '하위 분류' }
        }
        if (depthOf(c.id) + myHeight > MAX_CAT_DEPTH) {
          return { id: c.id, path, why: `${MAX_CAT_DEPTH}단 초과` }
        }
        return { id: c.id, path, why: '' }
      })
      .sort((a, b) => naturalCompare(a.path, b.path))
  }, [all, cat.id, descendants, myHeight])

  const usable = options.filter((o) => !o.why).length

  const saveM = useMutation({
    mutationFn: () => categoryApi.rename(cat.id, name.trim(), parentId || null),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['req-categories'] })
      void qc.invalidateQueries({ queryKey: ['req', 'list'] })
      onClose()
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  })

  const submit = () => {
    if (!name.trim()) {
      setError('분류 이름을 입력하세요')
      return
    }
    setError('')
    saveM.mutate()
  }

  const moved = (cat.parent_id ?? '') !== parentId

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="분류 편집"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <b>분류 편집</b>
          <button className="modal-x" type="button" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="form-error">{error}</div>}

          <label className="fld">
            <span>이름</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </label>

          <label className="fld">
            <span>상위 분류 (여기서 옮깁니다)</span>
            <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">(최상위 — 대분류로)</option>
              {options.map((o) => (
                <option key={o.id} value={o.id} disabled={!!o.why}>
                  {o.path}
                  {o.why && `  — ${o.why}`}
                </option>
              ))}
            </select>
          </label>

          <div className="hint">
            {usable === 0 && (
              <>
                <b>이 분류는 다른 분류 밑으로 옮길 수 없습니다.</b> 자기 아래로
                이미 {myHeight}단을 차지하고 있어, 어디에 넣어도 {MAX_CAT_DEPTH}단을
                넘습니다. 옮기려면 먼저 하위 분류를 줄이세요.
                <br />
              </>
            )}
            {usable > 0 && myHeight > 1 && (
              <>
                이 분류는 아래로 {myHeight}단을 차지합니다. 그래서 고를 수 있는 자리가
                제한됩니다.
                <br />
              </>
            )}
            고를 수 없는 자리는 목록에 회색으로 이유와 함께 나옵니다.
            {moved && (
              <>
                <br />
                <b>옮기면 이 분류에 달린 요구사항의 분류 경로도 함께 바뀝니다.</b>
              </>
            )}
          </div>
        </div>

        <div className="modal-foot">
          <span />
          <span className="page-head-actions">
            <button
              className="btn"
              type="button"
              onClick={onClose}
              disabled={saveM.isPending}
            >
              취소
            </button>
            <button
              className="btn primary"
              type="button"
              onClick={submit}
              disabled={saveM.isPending}
            >
              {saveM.isPending ? '저장 중…' : moved ? '이름 변경 · 이동' : '저장'}
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}
