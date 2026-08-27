import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { currentProjects, onProjectChange } from '@/components/ProjectPicker'
import { IconChevron, IconFolder, IconSearch } from '@/components/icons'
import WikiEditor from '@/components/WikiEditor'
import './Wiki.css'

/**
 * 위키 — **프로젝트마다 갖는 문서**.
 *
 * 남의 위키를 붙이지 않고 여기 둔 까닭: 계정·프로젝트·링크가 한 벌이라야
 * 문서에서 REQ-2633-0003 을 짚고, 반대로 그 요구사항에서 「이 문서가 나를
 * 참조한다」 를 말할 수 있다. 위키를 따로 띄우면 그 둘이 영영 안 만난다.
 *
 * 저장은 **손이 멈추면** 한다(2초). 저장 단추를 두면 안 누르고 창을 닫는
 * 사람이 반드시 나온다.
 */
interface Page {
  id: string
  project: string
  parent_id: string | null
  title: string
  ord: number
  updated_by?: string | null
  updated_at?: string | null
}

export default function Wiki() {
  const [prjs, setPrjs] = useState<string[]>(currentProjects)
  useEffect(() => onProjectChange(() => setPrjs(currentProjects())), [])
  const prj = prjs[0] ?? ''

  const listQ = useQuery({
    queryKey: ['wiki', prj],
    queryFn: async () => {
      const r = await apiFetch(`/api/wiki?project=${encodeURIComponent(prj)}`)
      return (await r.json()) as { pages: Page[] }
    },
  })
  const pages = useMemo(() => listQ.data?.pages ?? [], [listQ.data])

  const [openId, setOpenId] = useState('')
  const [q, setQ] = useState('')
  const [shut, setShut] = useState<Set<string>>(new Set())

  /* 아이 목록 — 한 번 만들어 두고 트리가 그것만 본다 */
  const kids = useMemo(() => {
    const m = new Map<string, Page[]>()
    for (const p of pages) m.set(p.parent_id ?? '', [...(m.get(p.parent_id ?? '') ?? []), p])
    return m
  }, [pages])

  const cur = pages.find((p) => p.id === openId)

  const make = async (parent: string | null) => {
    const t = window.prompt(parent ? '새 문서 이름 (고른 문서 아래)' : '새 문서 이름')?.trim()
    if (!t) return
    const id = `wk-${Date.now()}-${Math.floor(Math.random() * 1e4)}`
    await apiFetch(`/api/wiki/${encodeURIComponent(id)}`, {
      method: 'POST',
      body: JSON.stringify({ title: t, project: prj, parent_id: parent, body: [] }),
    })
    await listQ.refetch()
    setOpenId(id)
    if (parent) setShut((s) => new Set([...s].filter((x) => x !== parent)))
  }

  const rename = async (p: Page) => {
    const t = window.prompt('문서 이름', p.title)?.trim()
    if (!t || t === p.title) return
    await apiFetch(`/api/wiki/${encodeURIComponent(p.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: t }),
    })
    await listQ.refetch()
  }

  const remove = async (p: Page) => {
    if (!window.confirm(`「${p.title}」 을(를) 지웁니다. 되돌릴 수 없습니다.`)) return
    const r = await apiFetch(`/api/wiki/${encodeURIComponent(p.id)}`, { method: 'DELETE' })
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { detail?: string }
      window.alert(j.detail || '지우지 못했습니다')
      return
    }
    if (openId === p.id) setOpenId('')
    await listQ.refetch()
  }

  /* 찾기 — 이름으로 좁힌다. 본문 찾기는 서버가 plain 을 들고 있으니
     다음에 붙인다(지금 없는 것을 있는 척하지 않는다). */
  const n = q.trim().toLowerCase()
  const hit = (p: Page): boolean =>
    p.title.toLowerCase().includes(n) || (kids.get(p.id) ?? []).some(hit)

  const Tree = ({ parent, depth }: { parent: string; depth: number }) => (
    <>
      {(kids.get(parent) ?? [])
        .filter((p) => !n || hit(p))
        .map((p) => {
          const kid = kids.get(p.id) ?? []
          const on = !shut.has(p.id) || !!n
          return (
            <div key={p.id}>
              <div
                className={`wk-row${openId === p.id ? ' on' : ''}`}
                style={{ paddingLeft: 6 + depth * 14 }}
                onClick={() => setOpenId(p.id)}
              >
                <button
                  type="button"
                  className={`wk-caret${on ? ' open' : ''}`}
                  disabled={!kid.length}
                  onClick={(e) => {
                    e.stopPropagation()
                    setShut((s) => {
                      const x = new Set(s)
                      if (x.has(p.id)) x.delete(p.id)
                      else x.add(p.id)
                      return x
                    })
                  }}
                >
                  <IconChevron />
                </button>
                <span className="wk-ico" aria-hidden="true">
                  <IconFolder open={!!kid.length && on} />
                </span>
                <span className="wk-nm">{p.title || '(이름 없음)'}</span>
                <span className="sp" />
                {/* 손잡이는 마우스를 올린 줄에서만 — 늘 보이면 목록이 시끄럽다 */}
                <span className="wk-tools">
                  <button type="button" title="아래에 새 문서" onClick={(e) => { e.stopPropagation(); void make(p.id) }}>
                    +
                  </button>
                  <button type="button" title="이름 바꾸기" onClick={(e) => { e.stopPropagation(); void rename(p) }}>
                    ✎
                  </button>
                  <button type="button" title="지우기" onClick={(e) => { e.stopPropagation(); void remove(p) }}>
                    ×
                  </button>
                </span>
              </div>
              {on && <Tree parent={p.id} depth={depth + 1} />}
            </div>
          )
        })}
    </>
  )

  return (
    <div className="wk">
      <aside className="panel wk-side">
        <div className="wk-head">
          <b>{prjs.length === 1 ? '이 프로젝트 문서' : '문서'}</b>
        </div>
        <div className="wk-newrow">
          <button className="btn small" type="button" onClick={() => void make(null)}>
            ＋ 새 문서
          </button>
        </div>
        <div className="wk-find">
          <span className="wk-fico" aria-hidden="true">
            <IconSearch />
          </span>
          <input value={q} placeholder="문서 찾기" onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="wk-tree">
          {listQ.isLoading ? (
            <div className="muted small wk-empty">읽는 중…</div>
          ) : pages.length === 0 ? (
            <div className="muted small wk-empty">
              아직 문서가 없습니다.
              <br />
              「＋ 새 문서」 로 시작하세요.
            </div>
          ) : (
            <Tree parent="" depth={0} />
          )}
        </div>
      </aside>

      <section className="panel wk-main">
        {!cur ? (
          <div className="empty">왼쪽에서 문서를 고르세요.</div>
        ) : (
          <WikiEditor key={cur.id} id={cur.id} title={cur.title} onSaved={() => void listQ.refetch()} />
        )}
      </section>
    </div>
  )
}
