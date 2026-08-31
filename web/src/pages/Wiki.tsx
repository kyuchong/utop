import { useEffect, useMemo, useState } from 'react'
import { prefGet, prefSet } from '@/lib/prefs'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { onGoto } from '@/api/goto'
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

  /* 지금 보던 문서를 기억한다 — 다른 화면에 다녀오면 처음으로 돌아가
     버리면 「어디까지 읽었지」 를 매번 다시 찾아야 한다. 주소(?wiki=…)로
     들어온 것도 App 이 여기에 넣어 준다. */
  const [openId, setOpenId] = useState(() => {
    try {
      return prefGet('utop.wiki.open') ?? ''
    } catch {
      return ''
    }
  })
  useEffect(() => {
    try {
      if (openId) prefSet('utop.wiki.open', openId)
    } catch {
      /* 사생활 보호 모드 */
    }
  }, [openId])
  /* 문서 안에서 다른 문서를 짚어 눌렀을 때 — 같은 화면 안에서 넘어간다 */
  useEffect(() => onGoto((kind, id) => { if (kind === 'wiki') setOpenId(id) }), [])
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

  /* 찾기 — 트리는 **이름**으로 좁히고, 본문은 서버가 뒤진다.
     이름만으로는 「그 말이 어느 문서에 있더라」 를 못 찾는다. */
  const n = q.trim().toLowerCase()
  const hitQ = useQuery({
    queryKey: ['wiki-search', prj, n],
    enabled: n.length >= 2,
    queryFn: async () => {
      const r = await apiFetch(
        `/api/wiki/search?q=${encodeURIComponent(n)}&project=${encodeURIComponent(prj)}`,
      )
      return (await r.json()) as { hits: Array<{ id: string; title: string; snippet: string }> }
    },
  })
  /* 이름에 안 걸린 것만 아래에 따로 낸다 — 같은 문서가 두 번 나오면
     「왜 두 개지」 를 생각하게 된다 */
  const bodyHits = (hitQ.data?.hits ?? []).filter(
    (h) => !h.title.toLowerCase().includes(n),
  )
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
          {n.length >= 2 && bodyHits.length > 0 && (
            <div className="wk-hits">
              <div className="wk-hitsh">본문에서 {bodyHits.length}건</div>
              {bodyHits.map((h) => (
                <div
                  className={`wk-hit${openId === h.id ? ' on' : ''}`}
                  key={h.id}
                  onClick={() => setOpenId(h.id)}
                >
                  <b>{h.title || '(이름 없음)'}</b>
                  <span>{h.snippet}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      <section className="panel wk-main">
        {!cur ? (
          <div className="empty">왼쪽에서 문서를 고르세요.</div>
        ) : (
          <WikiEditor
            key={cur.id}
            id={cur.id}
            title={cur.title}
            project={cur.project}
            onSaved={() => void listQ.refetch()}
          />
        )}
      </section>
    </div>
  )
}
