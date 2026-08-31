import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { Pop } from './NParts'
import { IcCheck, IcCopy, IcDots, IcPlus, IcTrash } from './NIcons'
import type { NCalc, NView } from './types'

/**
 * 보기(탭) 줄 — **한 줄이 곧 이 표를 보는 방법들**이다.
 *
 * 만들면 **나만 보기**로 시작하고, 「모두에게 보이기」 를 눌러야 공용이 된다
 * (승인). 40명이 각자 만들어도 공용 줄이 안 더러워지는 문턱이다.
 * 넘치면 접어서 「⋯ 더보기」 로 낸다 — 탭 줄은 늘 한 줄이다.
 */
export interface ViewBody {
  kind?: string
  view?: NView
  calcs?: Record<string, NCalc>
  perPage?: number
  widths?: Record<string, number>
  hidden?: string[]
  order?: string[]
}
export interface ViewDef {
  id: string
  scope: string
  name: string
  owner: string
  shared: boolean
  body: ViewBody
  sort_order: number
}

const TABS_ON_ROW = 7

export default function NViews({
  scope, curId, onPick, current, meName, isAdmin,
}: {
  scope: string
  /** 지금 고른 탭 — 빈 값이면 「기본」 */
  curId: string
  onPick: (v: ViewDef | null) => void
  /** 지금 화면 상태 — 새로 만들기·복제가 이것을 담는다 */
  current: ViewBody
  meName: string
  isAdmin?: boolean
}) {
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['views', scope],
    queryFn: async () => {
      const r = await apiFetch(`/api/views?scope=${encodeURIComponent(scope)}`)
      if (!r.ok) throw new Error('보기를 못 읽었습니다')
      return (await r.json()) as { views: ViewDef[] }
    },
    staleTime: 30_000,
  })
  const views = useMemo(() => q.data?.views ?? [], [q.data])
  const [menuAt, setMenuAt] = useState<{ v: ViewDef; x: number; y: number } | null>(null)
  const [moreAt, setMoreAt] = useState<{ x: number; y: number } | null>(null)
  const [renaming, setRenaming] = useState<ViewDef | null>(null)
  const [name, setName] = useState('')
  useEffect(() => setName(renaming?.name ?? ''), [renaming])

  const save = useMutation({
    mutationFn: async (v: Partial<ViewDef> & { id: string; name: string }) => {
      const r = await apiFetch('/api/views', {
        method: 'POST',
        body: JSON.stringify({
          id: v.id, scope, name: v.name,
          shared: v.shared ?? false,
          kind: v.body?.kind ?? 'table',
          body: v.body ?? {},
          sort_order: v.sort_order ?? views.length,
        }),
      })
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { detail?: string }).detail || '저장 실패')
      return v.id
    },
    onSuccess: (id) => {
      void qc.invalidateQueries({ queryKey: ['views', scope] })
      const v = views.find((x) => x.id === id)
      if (v) onPick(v)
    },
    onError: (e) => window.alert(e instanceof Error ? e.message : '저장하지 못했습니다'),
  })
  const del = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiFetch(`/api/views/${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('지우지 못했습니다')
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['views', scope] })
      onPick(null)
    },
    onError: (e) => window.alert(e instanceof Error ? e.message : '지우지 못했습니다'),
  })

  const mkNew = (from?: ViewDef) =>
    save.mutate({
      id: `v${Date.now()}`,
      name: from ? `${from.name} (복사)` : '새 보기',
      shared: false,
      body: from ? from.body : current,
    })

  const head = views.slice(0, TABS_ON_ROW)
  const rest = views.slice(TABS_ON_ROW)
  const tab = (v: ViewDef) => (
    <button
      key={v.id}
      type="button"
      className={`ntv-tab${curId === v.id ? ' on' : ''}`}
      onClick={() => onPick(v)}
      onContextMenu={(e) => {
        e.preventDefault()
        setMenuAt({ v, x: e.clientX - 40, y: e.clientY })
      }}
      title={`${v.shared ? '모두가 봅니다' : '나만 봅니다'} · 만든이 ${v.owner}`}
    >
      {!v.shared && <i className="ntv-priv" title="나만 보기">●</i>}
      {v.name}
      {curId === v.id && (
        <span
          className="ntv-more"
          onClick={(e) => {
            e.stopPropagation()
            const r = (e.target as HTMLElement).getBoundingClientRect()
            setMenuAt({ v, x: r.left - 150, y: r.bottom + 4 })
          }}
        >
          ⋯
        </span>
      )}
    </button>
  )

  return (
    <div className="ntv">
      <button
        type="button"
        className={`ntv-tab${!curId ? ' on' : ''}`}
        onClick={() => onPick(null)}
        title="꾸미지 않은 기본 표"
      >
        기본
      </button>
      {head.map(tab)}
      {rest.length > 0 && (
        <button
          type="button"
          className="ntv-tab ntv-rest"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            setMoreAt({ x: r.left - 60, y: r.bottom + 4 })
          }}
        >
          ⋯ 더보기 {rest.length}
        </button>
      )}
      <button type="button" className="ntv-add" title="지금 보기로 새 탭 만들기" onClick={() => mkNew()}>
        ＋
      </button>

      {moreAt && (
        <Pop at={moreAt} w={220} h={300} onClose={() => setMoreAt(null)}>
          <div className="ntb-sec">더 있는 보기</div>
          {rest.map((v) => (
            <button
              type="button"
              key={v.id}
              className="ntb-mi"
              onClick={() => {
                onPick(v)
                setMoreAt(null)
              }}
            >
              <span className="l">{v.name}</span>
              {!v.shared && <span className="ntb-sub">나만</span>}
            </button>
          ))}
        </Pop>
      )}

      {menuAt && (
        <Pop at={menuAt} w={216} h={280} onClose={() => setMenuAt(null)}>
          <div className="ntb-sec">{menuAt.v.name}</div>
          <button
            type="button"
            className="ntb-mi"
            onClick={() => {
              setRenaming(menuAt.v)
              setMenuAt(null)
            }}
          >
            <span className="l">이름 바꾸기</span>
          </button>
          <button
            type="button"
            className="ntb-mi"
            onClick={() => {
              save.mutate({ ...menuAt.v, body: current })
              setMenuAt(null)
            }}
          >
            <IcCheck />
            <span className="l">지금 화면으로 덮어쓰기</span>
          </button>
          <button
            type="button"
            className="ntb-mi"
            onClick={() => {
              mkNew(menuAt.v)
              setMenuAt(null)
            }}
          >
            <IcCopy />
            <span className="l">복제</span>
          </button>
          <div className="ntb-hr" />
          <button
            type="button"
            className="ntb-mi"
            onClick={() => {
              save.mutate({ ...menuAt.v, shared: !menuAt.v.shared })
              setMenuAt(null)
            }}
          >
            <IcDots />
            <span className="l">{menuAt.v.shared ? '나만 보기로 되돌리기' : '모두에게 보이기'}</span>
          </button>
          <div className="ntb-hr" />
          <button
            type="button"
            className="ntb-mi dg"
            disabled={menuAt.v.owner !== meName && !isAdmin}
            title={menuAt.v.owner !== meName && !isAdmin ? '만든 사람만 지울 수 있습니다' : ''}
            onClick={() => {
              if (window.confirm(`보기 「${menuAt.v.name}」 를 지웁니다.`)) del.mutate(menuAt.v.id)
              setMenuAt(null)
            }}
          >
            <IcTrash />
            <span className="l">삭제</span>
          </button>
        </Pop>
      )}

      {renaming && (
        <Pop at={{ x: 120, y: 120 }} w={240} h={130} onClose={() => setRenaming(null)}>
          <div className="ntb-sec">보기 이름</div>
          <input
            className="ntb-inp"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return
              if (e.key === 'Enter' && name.trim()) {
                save.mutate({ ...renaming, name: name.trim() })
                setRenaming(null)
              }
            }}
          />
          <button
            type="button"
            className="ntb-mi"
            onClick={() => {
              if (!name.trim()) return
              save.mutate({ ...renaming, name: name.trim() })
              setRenaming(null)
            }}
          >
            <IcPlus />
            <span className="l">저장</span>
          </button>
        </Pop>
      )}
    </div>
  )
}
