import { useState, type ReactNode } from 'react'
import { Pop } from './EffortMenus'
import { MAIN, newId, newTable, tableOf, tableRows, type EfDoc, type EfNode } from './model'

/**
 * Effort Plan 왼쪽 트리 — 폴더 ▸ 표(지시: 큰 카테고리, 자유롭게 추가).
 * 표마다 열·연도·보기가 따로이고, 연도는 오른쪽 제목의 「2026년 ▾」 에서 고른다.
 *
 * - 표를 누르면 그 표를 연다. 폴더를 누르면 접고 편다.
 * - 머리의 ＋ 는 새 표·새 폴더, 줄 우클릭은 이름 바꾸기·추가·복제·옮기기·삭제.
 * - 줄을 끌어 폴더 위에 놓으면 그 안으로, 표 위에 놓으면 그 앞으로 옮긴다.
 * 첫 표(main)는 자료가 문서 맨 위에 있어(예전 자료·서버 백업 호환) 지우지 못한다 — 이름·자리는 바꿀 수 있다.
 */
export default function EffortTree({ root, touch, toast }: { root: EfDoc; touch: () => void; toast: (m: string) => void }) {
  const tree = root.efTree!
  const nodes = tree.nodes
  const [pop, setPop] = useState<{ kind: 'add' | 'node'; anchor: HTMLElement; id?: string } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const close = () => setPop(null)

  const kids = (parent: string | null) => nodes.filter((n) => n.parent === parent)
  const isUnder = (id: string, anc: string): boolean => {
    let p = nodes.find((n) => n.id === id)?.parent ?? null
    while (p) {
      if (p === anc) return true
      p = nodes.find((n) => n.id === p)?.parent ?? null
    }
    return false
  }
  const countIn = (id: string): number =>
    kids(id).reduce((a, n) => a + (n.kind === 'table' ? 1 : countIn(n.id)), 0)

  const open = (id: string) => {
    if (tree.cur === id) return
    tree.cur = id
    touch()
  }
  const addTable = (parent: string | null, from?: EfDoc, name = '새 표') => {
    const id = 't' + newId()
    root.efTables = root.efTables ?? {}
    root.efTables[id] = from ? (JSON.parse(JSON.stringify(from, (k, v) => (k === 'efTree' || k === 'efTables' ? undefined : v))) as EfDoc) : newTable()
    nodes.push({ id, kind: 'table', name, parent })
    if (parent) {
      const f = nodes.find((n) => n.id === parent)
      if (f) f.open = true
    }
    tree.cur = id
    setRenaming(id)
    touch()
  }
  const addFolder = (parent: string | null) => {
    const id = 'f' + newId()
    nodes.push({ id, kind: 'folder', name: '새 폴더', parent, open: true })
    if (parent) {
      const f = nodes.find((n) => n.id === parent)
      if (f) f.open = true
    }
    setRenaming(id)
    touch()
  }
  const rename = (n: EfNode, v: string) => {
    setRenaming(null)
    const t = v.trim()
    if (!t || t === n.name) return
    n.name = t
    touch()
  }
  const remove = (n: EfNode) => {
    if (n.kind === 'folder') {
      if (kids(n.id).length) return toast('폴더 안의 표·폴더를 먼저 옮기거나 지우세요')
      if (!window.confirm(`「${n.name}」 폴더를 삭제할까요?`)) return
    } else {
      if (n.id === MAIN) return toast('첫 표는 지울 수 없습니다 — 이름과 자리는 바꿀 수 있습니다')
      const t = tableOf(root, n.id)
      const all = Object.values(t.pages).reduce((a, p) => a + p.rows.length, 0)
      if (!window.confirm(`「${n.name}」 표를 삭제할까요?${all ? `\n모든 연도의 ${all}행이 함께 지워집니다.` : ''}\n(서버가 저장 전 상태를 백업해 둡니다)`)) return
      delete root.efTables?.[n.id]
    }
    tree.nodes = nodes.filter((x) => x.id !== n.id)
    if (tree.cur === n.id) tree.cur = MAIN
    touch()
  }
  /** 옮기기 — 폴더 위면 그 안 끝으로, 표 위면 그 앞으로, null 이면 맨 위 끝으로 */
  const move = (id: string, target: string | null) => {
    const n = nodes.find((x) => x.id === id)
    if (!n || id === target) return
    const t = target ? nodes.find((x) => x.id === target) : null
    if (n.kind === 'folder' && t && (t.id === n.id || isUnder(t.id, n.id))) return toast('폴더를 자기 안으로 옮길 수는 없습니다')
    const i = nodes.indexOf(n)
    nodes.splice(i, 1)
    if (!t) {
      n.parent = null
      nodes.push(n)
    } else if (t.kind === 'folder') {
      n.parent = t.id
      t.open = true
      nodes.push(n)
    } else {
      n.parent = t.parent
      nodes.splice(nodes.indexOf(t), 0, n)
    }
    touch()
  }

  const row = (n: EfNode, depth: number): ReactNode => {
    const folder = n.kind === 'folder'
    const on = !folder && tree.cur === n.id
    const isOpen = n.open !== false
    return (
      <div key={n.id}>
        <div
          role="treeitem"
          aria-selected={on}
          aria-expanded={folder ? isOpen : undefined}
          tabIndex={0}
          className={`ef-tn${folder ? ' folder' : ''}${on ? ' on' : ''}${over === n.id ? ' over' : ''}${dragId === n.id ? ' dragging' : ''}`}
          style={{ paddingLeft: 6 + depth * 14 }}
          draggable={renaming !== n.id}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', n.id)
            setDragId(n.id)
          }}
          onDragEnd={() => {
            setDragId(null)
            setOver(null)
          }}
          onDragOver={(e) => {
            if (!dragId || dragId === n.id) return
            e.preventDefault()
            e.stopPropagation()
            if (over !== n.id) setOver(n.id)
          }}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            const id = dragId
            setDragId(null)
            setOver(null)
            if (id) move(id, n.id)
          }}
          onClick={() => {
            if (renaming === n.id) return
            if (folder) {
              n.open = !isOpen
              touch()
            } else open(n.id)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && renaming !== n.id) (e.currentTarget as HTMLElement).click()
            if (e.key === 'F2') setRenaming(n.id)
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            setPop({ kind: 'node', anchor: e.currentTarget, id: n.id })
          }}
          title={folder ? '누르면 접고 펴기 · 우클릭: 메뉴 · 끌어서 옮기기' : '우클릭: 이름·복제·옮기기·삭제 · 끌어서 옮기기'}
        >
          <span className="ef-tn-tw">{folder ? (isOpen ? '▾' : '▸') : ''}</span>
          <span className="ef-tn-ic">{folder ? '📁' : '▦'}</span>
          {renaming === n.id ? (
            <input
              className="ef-tn-in"
              autoFocus
              defaultValue={n.name}
              aria-label="이름"
              onFocus={(e) => e.currentTarget.select()}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') rename(n, e.currentTarget.value)
                else if (e.key === 'Escape') setRenaming(null)
              }}
              onBlur={(e) => rename(n, e.currentTarget.value)}
            />
          ) : (
            <span className="ef-tn-name">{n.name}</span>
          )}
          <em className="ef-tn-n">{folder ? countIn(n.id) : tableRows(tableOf(root, n.id))}</em>
        </div>
        {folder && isOpen && kids(n.id).map((c) => row(c, depth + 1))}
      </div>
    )
  }

  const pn = pop?.id ? nodes.find((x) => x.id === pop.id) : undefined
  const folders = nodes.filter((x) => x.kind === 'folder')
  return (
    <aside className="ef-side">
      <div className="ef-tree-hd">
        <span>목록</span>
        <button type="button" className="ef-tadd" title="새 표·새 폴더" onClick={(e) => setPop({ kind: 'add', anchor: e.currentTarget })}>
          ＋
        </button>
      </div>
      <div
        className={`ef-tree${over === '__root' ? ' over' : ''}`}
        role="tree"
        aria-label="표 목록"
        onDragOver={(e) => {
          if (!dragId) return
          e.preventDefault()
          if (over !== '__root') setOver('__root')
        }}
        onDragLeave={(e) => e.currentTarget === e.target && setOver(null)}
        onDrop={(e) => {
          e.preventDefault()
          const id = dragId
          setDragId(null)
          setOver(null)
          if (id) move(id, null)
        }}
      >
        {kids(null).map((n) => row(n, 0))}
      </div>

      {pop?.kind === 'add' && (
        <Pop anchor={pop.anchor} cls="ef-menu" onClose={close}>
          <button type="button" className="ef-mi" onClick={() => { close(); addTable(null) }}>
            <i className="ef-mi-ic">▦</i>
            <span>새 표</span>
          </button>
          <button type="button" className="ef-mi" onClick={() => { close(); addFolder(null) }}>
            <i className="ef-mi-ic">📁</i>
            <span>새 폴더</span>
          </button>
        </Pop>
      )}
      {pop?.kind === 'node' && pn && (
        <Pop anchor={pop.anchor} cls="ef-menu" onClose={close}>
          <div className="ef-lbl">{pn.name}</div>
          <button type="button" className="ef-mi" onClick={() => { close(); setRenaming(pn.id) }}>
            <i className="ef-mi-ic">✎</i>
            <span>이름 바꾸기</span>
          </button>
          {pn.kind === 'folder' ? (
            <>
              <button type="button" className="ef-mi" onClick={() => { close(); addTable(pn.id) }}>
                <i className="ef-mi-ic">▦</i>
                <span>이 안에 새 표</span>
              </button>
              <button type="button" className="ef-mi" onClick={() => { close(); addFolder(pn.id) }}>
                <i className="ef-mi-ic">📁</i>
                <span>이 안에 새 폴더</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="ef-mi"
                title="열·옵션·보기만 가져오고 행은 비운다"
                onClick={() => {
                  close()
                  const src = tableOf(root, pn.id)
                  const t = newTable(src.columns)
                  t.betaViews = JSON.parse(JSON.stringify(src.betaViews ?? [])) as EfDoc['betaViews']
                  t.curBetaView = src.curBetaView
                  addTable(pn.parent, t, pn.name + ' 복사')
                }}
              >
                <i className="ef-mi-ic">⧉</i>
                <span>복제 — 열만</span>
              </button>
              <button type="button" className="ef-mi" onClick={() => { close(); addTable(pn.parent, tableOf(root, pn.id), pn.name + ' 복사') }}>
                <i className="ef-mi-ic">⧉</i>
                <span>복제 — 자료까지</span>
              </button>
            </>
          )}
          <div className="ef-sep" />
          <div className="ef-lbl">옮기기</div>
          <div className="ef-mlist ef-movelist">
            <button type="button" className={`ef-mi${pn.parent === null ? ' on' : ''}`} onClick={() => { close(); move(pn.id, null) }}>
              <i className="ef-mi-ic">⌂</i>
              <span>맨 위</span>
            </button>
            {folders
              .filter((f) => f.id !== pn.id && !(pn.kind === 'folder' && isUnder(f.id, pn.id)))
              .map((f) => (
                <button key={f.id} type="button" className={`ef-mi${pn.parent === f.id ? ' on' : ''}`} onClick={() => { close(); move(pn.id, f.id) }}>
                  <i className="ef-mi-ic">📁</i>
                  <span>{f.name}</span>
                </button>
              ))}
          </div>
          <div className="ef-sep" />
          <button
            type="button"
            className={`ef-mi del${pn.id === MAIN ? ' off' : ''}`}
            onClick={() => {
              close()
              remove(pn)
            }}
          >
            <i className="ef-mi-ic">✕</i>
            <span>{pn.kind === 'folder' ? '폴더 삭제' : '표 삭제'}</span>
          </button>
        </Pop>
      )}
    </aside>
  )
}
