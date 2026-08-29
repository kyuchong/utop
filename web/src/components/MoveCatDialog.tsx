import { useMemo, useState } from 'react'
import type { ReqCategory } from '@/types'

/**
 * 폴더를 **다른 폴더 밑으로 옮긴다**.
 *
 * 서버는 진작부터 옮길 줄 알았다(PUT /api/req-categories 가 parent_id 를
 * 받는다). 화면에 길이 없었을 뿐이다(지적) — 그래서 프로젝트가 생기기 전에
 * 만든 뿌리 폴더들이 트리 맨 위에 그대로 남아, 그 안의 요구사항이 어느
 * 프로젝트에도 안 닿았다.
 *
 * 갈 수 없는 곳은 **아예 안 보인다**. 눌러 놓고 「자기 밑으로는 못 갑니다」
 * 라고 되돌리면, 왜 안 되는지 배우기 전에 짜증부터 난다.
 */
interface Props {
  cat: ReqCategory
  cats: ReqCategory[]
  /** 프로젝트인 폴더의 id — 트리 맨 위는 프로젝트 자리라 옮길 수 없다 */
  projectIds: Set<string>
  onMove: (parentId: string | null) => void
  onClose: () => void
}

export default function MoveCatDialog({ cat, cats, projectIds, onMove, onClose }: Props) {
  const [sel, setSel] = useState<string | null>(cat.parent_id ?? null)
  const [q, setQ] = useState('')

  /* 자기 자신과 자기 밑은 갈 곳이 못 된다 — 옮기면 고리가 된다 */
  const banned = useMemo(() => {
    const kids = new Map<string, string[]>()
    for (const c of cats) {
      const k = c.parent_id ?? ''
      kids.set(k, [...(kids.get(k) ?? []), c.id])
    }
    const out = new Set<string>([cat.id])
    const walk = (id: string) => {
      for (const k of kids.get(id) ?? []) {
        out.add(k)
        walk(k)
      }
    }
    walk(cat.id)
    return out
  }, [cats, cat.id])

  /* 깊이 — 이름만 늘어놓으면 어디 밑인지 모른다 */
  const depth = useMemo(() => {
    const by = new Map(cats.map((c) => [c.id, c]))
    const d = new Map<string, number>()
    const of = (c: ReqCategory): number => {
      if (d.has(c.id)) return d.get(c.id) as number
      const p = c.parent_id ? by.get(c.parent_id) : undefined
      const v = p ? of(p) + 1 : 0
      d.set(c.id, v)
      return v
    }
    for (const c of cats) of(c)
    return d
  }, [cats])

  const n = q.trim().normalize('NFC').toLowerCase()
  const rows = cats
    .filter((c) => !banned.has(c.id))
    .filter((c) => !n || c.name.normalize('NFC').toLowerCase().includes(n))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))

  /* 프로젝트는 맨 위가 자리다(서버도 막는다). 그러니 프로젝트를 옮기는
     창에서는 「맨 위로」 만 뜻이 있다. */
  const isPrj = projectIds.has(cat.id)

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div className="modal mvc" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <b>「{cat.name}」 옮기기</b>
          <button className="modal-x" type="button" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <div className="modal-body">
          {isPrj && (
            <div className="mvc-note">
              프로젝트는 트리 맨 위가 자리입니다 — 다른 폴더 밑으로는 옮길 수 없습니다.
            </div>
          )}
          <input
            className="mvc-find"
            value={q}
            placeholder="폴더 찾기"
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
          <div className="mvc-list">
            <button
              type="button"
              className={`mvc-row${sel === null ? ' on' : ''}`}
              onClick={() => setSel(null)}
            >
              <span className="mvc-nm">맨 위로 (프로젝트 층)</span>
            </button>
            {!isPrj &&
              rows.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`mvc-row${sel === c.id ? ' on' : ''}`}
                  style={{ paddingLeft: 12 + (depth.get(c.id) ?? 0) * 14 }}
                  onClick={() => setSel(c.id)}
                >
                  <span className="mvc-nm">{c.name}</span>
                  {projectIds.has(c.id) && <span className="mvc-tag">프로젝트</span>}
                </button>
              ))}
          </div>
        </div>

        <div className="modal-foot">
          <span className="muted small">안에 든 요구사항도 함께 갑니다.</span>
          <span className="sa-sp" />
          <button className="btn" type="button" onClick={onClose}>
            취소
          </button>
          <button
            className="btn mvc-go"
            type="button"
            disabled={sel === (cat.parent_id ?? null)}
            onClick={() => onMove(sel)}
          >
            옮기기
          </button>
        </div>
      </div>
    </div>
  )
}
