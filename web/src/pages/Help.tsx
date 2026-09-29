import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/api/client'
import Markdown from '@/components/Markdown'
import MarkdownEditor from '@/components/MarkdownEditorLazy'
import './Help.css'

/**
 * 도움말 — 왼쪽 메뉴 SYSTEM 바로 위(지시: 누구나 쓰면서 볼 수 있도록).
 *
 * 글은 서버(app_kv)에 있다. 처음 뜰 때 docs/features 의 기능별 문서가 씨앗으로
 * 들어오고, 그 뒤로는 여기서 고친 것이 정본이다. 고치는 사람은 **관리자와
 * 도움말 편집자**(SETUP › 도움말·라이선스)뿐이다 — 읽는 것은 누구나.
 *
 * 왼쪽은 차례, 오른쪽은 본문. 본문 안의 `#help/<id>` 링크는 이 안에서 옮겨 간다.
 */
interface PageMeta {
  id: string
  title: string
  order: number
  updated_by?: string
  updated_at?: string
}
interface Page extends PageMeta {
  md: string
}

export default function Help() {
  const [pages, setPages] = useState<PageMeta[]>([])
  const [canEdit, setCanEdit] = useState(false)
  const [cur, setCur] = useState<string>(() => {
    try {
      return new URLSearchParams(window.location.search).get('doc') || ''
    } catch {
      return ''
    }
  })
  const [page, setPage] = useState<Page | null>(null)
  const [hasSeed, setHasSeed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftMd, setDraftMd] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const loadList = useCallback(async () => {
    const r = await apiFetch('/api/help/pages', { cache: 'no-store' })
    if (!r.ok) return
    const j = (await r.json()) as { pages: PageMeta[]; can_edit: boolean }
    setPages(j.pages)
    setCanEdit(!!j.can_edit)
    if (!cur && j.pages[0]) setCur(j.pages[0].id)
  }, [cur])

  useEffect(() => {
    void loadList()
  }, [loadList])

  useEffect(() => {
    if (!cur) return
    void (async () => {
      const r = await apiFetch(`/api/help/pages/${encodeURIComponent(cur)}`, { cache: 'no-store' })
      if (!r.ok) {
        setPage(null)
        return
      }
      const j = (await r.json()) as { page: Page; has_seed: boolean; can_edit: boolean }
      setPage(j.page)
      setHasSeed(!!j.has_seed)
      setCanEdit(!!j.can_edit)
      setEditing(false)
      /* 주소에 남긴다 — 「이 도움말 봐」 를 링크로 보낼 수 있게 */
      try {
        const u = new URL(window.location.href)
        u.searchParams.set('p', 'help')
        u.searchParams.set('doc', cur)
        window.history.replaceState({ utop: true }, '', u.toString())
      } catch {
        /* 주소 못 바꿔도 화면은 돈다 */
      }
    })()
  }, [cur])

  const startEdit = () => {
    if (!page) return
    setDraftTitle(page.title)
    setDraftMd(page.md)
    setEditing(true)
    setMsg('')
  }

  const save = async () => {
    if (!page) return
    setBusy(true)
    const r = await apiFetch(`/api/help/pages/${encodeURIComponent(page.id)}`, {
      method: 'PUT',
      body: JSON.stringify({ title: draftTitle, md: draftMd }),
    })
    setBusy(false)
    if (!r.ok) {
      setMsg((await r.json().catch(() => ({}))).detail || '저장하지 못했습니다')
      return
    }
    const j = (await r.json()) as { page: Page }
    setPage(j.page)
    setEditing(false)
    await loadList()
  }

  const addPage = async () => {
    const title = window.prompt('새 도움말 제목')
    if (!title?.trim()) return
    const id = `h-${Date.now().toString(36)}`
    const r = await apiFetch(`/api/help/pages/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ title: title.trim(), md: `# ${title.trim()}\n\n` }),
    })
    if (r.ok) {
      await loadList()
      setCur(id)
    }
  }

  const remove = async () => {
    if (!page || !window.confirm(`「${page.title}」 도움말을 지웁니다. 되돌릴 수 없습니다.`)) return
    const r = await apiFetch(`/api/help/pages/${encodeURIComponent(page.id)}`, { method: 'DELETE' })
    if (r.ok) {
      setCur('')
      setPage(null)
      await loadList()
    }
  }

  const reset = async () => {
    if (!page || !window.confirm('처음 실린 글(씨앗)로 되돌립니다. 지금 고친 내용은 사라집니다.')) return
    const r = await apiFetch(`/api/help/pages/${encodeURIComponent(page.id)}/reset`, { method: 'POST' })
    if (r.ok) {
      const j = (await r.json()) as { page: Page }
      setPage(j.page)
      setEditing(false)
    }
  }

  const move = async (dir: -1 | 1) => {
    if (!page) return
    const ids = pages.map((p) => p.id)
    const i = ids.indexOf(page.id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j]!, ids[i]!]
    const r = await apiFetch('/api/help/pages/reorder', { method: 'POST', body: JSON.stringify({ ids }) })
    if (r.ok) await loadList()
  }

  /* 본문 안 `#help/<id>` 링크 — 페이지 이동 없이 그 도움말로 */
  const onBodyClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a')
    if (!a) return
    const href = a.getAttribute('href') || ''
    if (href.startsWith('#help/')) {
      e.preventDefault()
      setCur(href.slice('#help/'.length))
    } else if (href === '#') {
      e.preventDefault()
    }
  }

  return (
    <div className="hlp">
      <aside className="hlp-toc">
        <div className="hlp-toc-head">
          <h2>도움말</h2>
          {canEdit && (
            <button type="button" className="hlp-btn" onClick={addPage} title="새 도움말">
              + 문서
            </button>
          )}
        </div>
        <ul>
          {pages.map((p) => (
            <li key={p.id}>
              <button type="button" className={`hlp-toc-item${p.id === cur ? ' on' : ''}`} onClick={() => setCur(p.id)}>
                {p.title}
              </button>
            </li>
          ))}
        </ul>
        {!pages.length && <p className="muted">도움말이 아직 없습니다.</p>}
      </aside>

      <section className="hlp-body" onClick={onBodyClick}>
        {!page ? (
          <p className="muted">왼쪽에서 도움말을 고르세요.</p>
        ) : editing ? (
          <div className="hlp-edit">
            <input
              className="hlp-title-input"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder="제목"
            />
            {/* md-editor·md-host — 요구사항 화면과 같은 감싸기. 이 둘이 없으면 편집기 높이가 0 이 된다 */}
            <div className="md-editor hlp-editor">
              <div className="md-host">
                <MarkdownEditor value={draftMd} onChange={setDraftMd} placeholder="마크다운으로 씁니다" />
              </div>
            </div>
            <div className="hlp-actions">
              <button type="button" className="hlp-btn primary" onClick={save} disabled={busy}>
                저장
              </button>
              <button type="button" className="hlp-btn" onClick={() => setEditing(false)} disabled={busy}>
                취소
              </button>
              {msg && <span className="hlp-msg">{msg}</span>}
            </div>
          </div>
        ) : (
          <>
            <div className="hlp-head">
              <h1>{page.title}</h1>
              <div className="hlp-meta">
                {page.updated_at && (
                  <span className="muted">
                    {page.updated_by === 'seed' ? '처음 실린 글' : `${page.updated_by} 고침`} · {page.updated_at}
                  </span>
                )}
                {canEdit && (
                  <span className="hlp-tools">
                    <button type="button" className="hlp-btn" onClick={() => move(-1)} title="위로">
                      ↑
                    </button>
                    <button type="button" className="hlp-btn" onClick={() => move(1)} title="아래로">
                      ↓
                    </button>
                    <button type="button" className="hlp-btn primary" onClick={startEdit}>
                      고치기
                    </button>
                    {hasSeed && (
                      <button type="button" className="hlp-btn" onClick={reset} title="처음 실린 글로">
                        원본으로
                      </button>
                    )}
                    <button type="button" className="hlp-btn danger" onClick={remove}>
                      지우기
                    </button>
                  </span>
                )}
              </div>
            </div>
            <Markdown text={page.md} />
          </>
        )}
      </section>
    </div>
  )
}
