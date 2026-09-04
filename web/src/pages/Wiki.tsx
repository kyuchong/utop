import { useEffect, useMemo, useRef, useState } from 'react'
import { prefGet, prefSet } from '@/lib/prefs'
import { useQuery } from '@tanstack/react-query'
import Resizer, { useResizableWidth } from '@/components/Resizer'
import { apiFetch, projectApi, type MeUser } from '@/api/client'
import { onGoto } from '@/api/goto'
import { currentProjects, onProjectChange } from '@/components/ProjectPicker'
import { IconChevron, IconFolder, IconSearch } from '@/components/icons'
import WikiEditor, { prefetchWiki } from '@/components/WikiEditor'
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

export default function Wiki({ me }: { me?: MeUser | null }) {
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

  /* 프로젝트 이름표 — 문서의 project 칸에는 분류 id(cat_id)가 든다.
     그대로 보이면 사람은 못 읽는다(지적: 어느 프로젝트인지 알 수 없다). */
  const projQ = useQuery({ queryKey: ['projects'], queryFn: ({ signal }) => projectApi.list(signal) })
  const projList = useMemo(() => projQ.data?.projects ?? [], [projQ.data])
  const prjName = (v: string) =>
    projList.find((x) => x.cat_id === v)?.name ?? (v ? v : '공용')

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

  /* 1|2열 사이 이동바 — 다른 화면과 같은 공용 부품(지적: 위키만 없다) */
  const [w1, setW1] = useResizableWidth('utop.ntb.wiki.w1', 280, 200, 560)
  const gridRef = useRef<HTMLDivElement>(null)
  /** 줄의 ⋯ 메뉴 — +·✎·× 를 줄에 늘어놓았더니 잘못 눌렀다(지적) */
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null)
  const menuPage = menu ? pages.find((p) => p.id === menu.id) : undefined

  /** 문서(와 그 아래 전부)의 프로젝트를 바꾼다 — 반만 옮기면 걸러 볼 때
      부모 없는 고아가 생겨 트리가 끊긴다 */
  const setPrjOf = async (p: Page, catId: string) => {
    const ids: string[] = []
    const walk = (id: string) => {
      ids.push(id)
      for (const k of kids.get(id) ?? []) walk(k.id)
    }
    walk(p.id)
    for (const id of ids) {
      await apiFetch(`/api/wiki/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ project: catId }),
      })
    }
    await listQ.refetch()
  }

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
                /* 가리키는 순간 본문을 미리 받는다(지시: 더 빨리) — 누를
                   때는 이미 손에 있어 기다림이 없다 */
                onMouseEnter={() => prefetchWiki(p.id)}
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
                {/* 어느 프로젝트의 문서인가 — 전체로 볼 때 맨 윗줄에만 적는다
                    (지적: 알 수가 없다). 프로젝트 하나로 좁혀 보면 다 같은
                    이름이라 안 적는다. */}
                {depth === 0 && prjs.length !== 1 && (
                  <span className="wk-prj">{prjName(p.project ?? '')}</span>
                )}
                {/* +·✎·× 를 줄에 늘어놓았더니 잘못 눌렀다(지적) — ⋯ 하나만
                    두고, 하는 일은 메뉴에서 고른다 */}
                <span className="wk-tools">
                  <button
                    type="button"
                    title="더보기"
                    onClick={(e) => {
                      e.stopPropagation()
                      const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                      setMenu({
                        x: Math.max(8, Math.min(r.left, window.innerWidth - 210)),
                        y: r.bottom + 4,
                        id: p.id,
                      })
                    }}
                  >
                    ⋯
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
    <div className="wk" ref={gridRef} style={{ gridTemplateColumns: `${w1}px minmax(0, 1fr)` }}>
      <aside className="panel wk-side">
        {/* 새 문서는 제목 줄 오른쪽(지시) — 줄 하나가 통째로 준다 */}
        <div className="wk-head">
          <b>{prjs.length === 1 ? '이 프로젝트 문서' : '문서'}</b>
          <span className="sp" />
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
        {/* 1|2열 사이 이동바 — 트리 판 오른쪽 가장자리 밖(격자 gap 자리)에
            선다. 다른 화면과 같은 공용 부품(지적: 위키만 없다). */}
        <div className="wk-rzslot">
          <Resizer
            label="문서 판 폭 조절"
            onResize={setW1}
            getOrigin={() => gridRef.current?.getBoundingClientRect().left ?? 0}
          />
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
            me={me?.name || me?.username || ''}
            onSaved={() => void listQ.refetch()}
          />
        )}
      </section>

      {/* 줄 ⋯ 메뉴 — 하는 일을 여기서 고른다(지시: 잘못 누른다) */}
      {!!menu && !!menuPage && (
        <>
          <span className="wk-menuovl" role="presentation" onClick={() => setMenu(null)} />
          <div className="wk-menu" role="menu" style={{ left: menu.x, top: menu.y }}>
            <button type="button" role="menuitem" onClick={() => { setMenu(null); void make(menuPage.id) }}>
              ＋ 아래에 새 문서
            </button>
            <button type="button" role="menuitem" onClick={() => { setMenu(null); void rename(menuPage) }}>
              ✎ 이름 바꾸기
            </button>
            <div className="wk-menusep" />
            <div className="wk-menuh">프로젝트 지정</div>
            <div className="wk-menuprjs">
              {[{ cat_id: '', name: '공용 (프로젝트 없음)' }, ...projList].map((pr) => (
                <button
                  key={pr.cat_id || '__none'}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenu(null)
                    if ((menuPage.project ?? '') !== pr.cat_id) void setPrjOf(menuPage, pr.cat_id)
                  }}
                >
                  {(menuPage.project ?? '') === pr.cat_id ? '✓ ' : ''}
                  {pr.name}
                </button>
              ))}
            </div>
            <div className="wk-menusep" />
            <button type="button" role="menuitem" className="danger" onClick={() => { setMenu(null); void remove(menuPage) }}>
              지우기
            </button>
          </div>
        </>
      )}
    </div>
  )
}
