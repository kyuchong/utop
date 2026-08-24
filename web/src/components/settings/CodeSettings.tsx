import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import './SetTabs.css'
import { ColorPick } from './ColorPick'
import { cfOptions, type CfMeta, type CustomField } from '@/hooks/useCustomFields'
import MarkdownEditor from '@/components/MarkdownEditorLazy'
import { defaultBg } from '@/lib/fieldFill'
import { COL_W_DEFAULT } from '@/components/useInfoCols'

interface Item {
  kind: string
  value: string
  sort_order?: number
  note?: string | null
  used?: number
}

interface Props {
  /** 'tc' | 'req' | 'cycle' — 서버의 kind 접두사와 같다 */
  target: 'tc' | 'req' | 'cycle'
}

const TITLE: Record<string, { h: string; p: string }> = {
  tc: {
    h: 'TC INFO 필드',
    p: 'TC 상세 「기본」 카드에서 고를 값을 여기서 정합니다. 고치면 TC 상세와 추가 창에 함께 반영됩니다.',
  },
  req: {
    h: '요구사항 INFO 필드',
    p: '요구사항 편집 창에서 고를 값을 여기서 정합니다. 전에는 코드에 박혀 있어 배포해야 늘릴 수 있었습니다.',
  },
  cycle: {
    h: '사이클 INFO 필드',
    p: '사이클 만들기·편집에서 고를 값(상태·고객 등)을 여기서 정합니다.',
  },
}

/** 탭 하나. 기본 칸(code_item)과 우리가 만든 칸(custom_field)을 같은 모양으로 다룬다. */
interface Tab {
  key: string
  label: string
  /** 우리가 만든 칸이면 그 정의. 기본 칸이면 undefined */
  cf?: CustomField
  values: string[]
}

/**
 * INFO 필드 — 드롭다운에 들어가는 값 관리.
 *
 * 전에는 TcForm.tsx 와 TcDetail.tsx 에 같은 목록이 따로 박혀 있어서 서로
 * 어긋날 수 있었고, 항목 하나 늘리려면 배포를 해야 했다.
 *
 * TC 와 요구사항이 같은 화면을 쓴다 — 하는 일이 똑같아서 따로 만들면
 * 한쪽만 고치는 일이 생긴다. 서버의 kind 접두사(tc_ / req_)로 가른다.
 *
 * 탭은 두 곳에서 온다:
 *   - 기본 칸  : code_item 테이블. 상태·유형처럼 원래 있던 칸이라 지울 수 없다.
 *   - 만든 칸  : custom_field 의 「고르기」 필드. 값은 그 행의 options 에 산다.
 *
 * 둘을 한 화면에 모으는 이유: 전에는 '이 드롭다운 값을 어디서 고치지?' 의
 * 답이 칸마다 달랐다(상태는 여기, 우리가 만든 칸은 커스텀 필드 화면).
 * 값을 고치는 자리는 하나여야 한다.
 */
/** 필드 하나의 생김새 — SETUP 에서 정하고 목록 세 화면이 함께 읽는다 */
export interface KStyle {
  w?: string
  shape?: string
  align?: string
  weight?: string
  size?: string
  font?: string
  caps?: string
}

export default function CodeSettings({ target }: Props) {
  const qc = useQueryClient()
  const [kind, setKind] = useState(
    target === 'req' ? 'req_status' : target === 'cycle' ? 'cycle_status' : 'tc_type',
  )
  const [draft, setDraft] = useState('')
  /** 사이클 설명 틀 — 보고서 패턴을 맞추는 사람이 정의한 본문 */
  const [descTpl, setDescTpl] = useState<string | null>(null)
  const tplQ = useQuery({
    queryKey: ['cycle-desc-template'],
    enabled: target === 'cycle',
    queryFn: async () => {
      const r = await apiFetch('/api/cycle-desc-template')
      if (!r.ok) throw new Error('불러오지 못했습니다')
      return (await r.json()) as { text: string }
    },
  })
  const [note, setNote] = useState<{ kind: string; msg: string }>({ kind: '', msg: '' })
  // 새 탭(= 「고르기」 커스텀 필드) 만들기
  const [newTab, setNewTab] = useState<string | null>(null)

  /**
   * 이 페이지는 **관리자만** 고친다(지시).
   *
   * 여기 값 하나가 요구사항·시험항목·사이클 세 화면 모두의 목록을 바꾼다.
   * 한 사람이 열 폭을 40 으로 내리면 그 순간 모두의 화면이 그렇게 된다 —
   * 여럿이 함께 쓰는 설정은 고칠 수 있는 사람을 좁혀 두어야 한다.
   * 서버도 같이 막았다(화면만 막으면 막은 것이 아니다).
   */
  const meQ = useQuery({
    queryKey: ['me'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const r = await apiFetch('/api/me')
      if (!r.ok) return { user: null } as { user: { role?: string } | null }
      return (await r.json()) as { user: { role?: string } | null }
    },
  })
  const role = meQ.data?.user?.role ?? ''
  const canEdit = role === '관리자' || role === 'admin'

  const listQ = useQuery({
    queryKey: ['codes'],
    queryFn: async () => {
      const r = await apiFetch('/api/codes')
      if (!r.ok) throw new Error('불러오지 못했습니다')
      return (await r.json()) as { items: Item[]; kinds: Record<string, string> }
    },
  })

  /**
   * **쓰이고 있는데 목록에 없는 값**(지적: 아무것도 안 했는데 붉은 글자).
   *
   * 옛 자료에 남은 값이다. 화면은 그것을 `목록에 없음`으로 붉게 보여 주는데,
   * 여기서 한 번 넣어 주면 색도 정할 수 있고 붉은 글자도 사라진다.
   */
  const orphanQ = useQuery({
    queryKey: ['codes', 'orphans', kind],
    enabled: !!kind && !kind.startsWith('cf:'),
    queryFn: async () => {
      const r = await apiFetch(`/api/codes/orphans?kind=${encodeURIComponent(kind)}`)
      if (!r.ok) return { items: [] as Array<{ value: string; used: number }> }
      return (await r.json()) as { items: Array<{ value: string; used: number }> }
    },
  })

  const cfQ = useQuery({
    queryKey: ['custom-fields'],
    queryFn: async () => {
      const r = await apiFetch('/api/custom-fields')
      if (!r.ok) throw new Error('불러오지 못했습니다')
      return (await r.json()) as CfMeta
    },
  })

  // 기본 칸. 접두사로 가르므로 서버에 종류를 늘려도 화면 코드는 안 고친다.
  const builtin: Tab[] = Object.entries(listQ.data?.kinds ?? {})
    .filter(([k]) => k.startsWith(`${target}_`))
    .map(([k, label]) => ({
      key: k,
      label,
      values: (listQ.data?.items ?? [])
        .filter((i) => i.kind === k)
        .map((i) => i.value),
    }))

  // 우리가 만든 「고르기」 칸. 글자·숫자 칸은 고를 값이 없으니 탭이 되지 않는다.
  const made: Tab[] = (cfQ.data?.items ?? [])
    .filter((f) => f.target === target && f.type === 'select')
    .map((f) => ({ key: `cf:${f.id}`, label: f.label, cf: f, values: cfOptions(f) }))

  const tabs = [...builtin, ...made]
  const cur = tabs.find((t) => t.key === kind) ?? tabs[0]
  const items = (listQ.data?.items ?? []).filter((i) => i.kind === kind)

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['codes'] })
    void qc.invalidateQueries({ queryKey: ['custom-fields'] })
    // 편집 폼들이 이 목록을 읽는다 — 고치면 바로 반영되어야 한다
    void qc.invalidateQueries({ queryKey: ['tc', 'list', 'meta'] })
    void qc.invalidateQueries({ queryKey: ['req', 'list'] })
  }

  /**
   * 값 하나의 **생김새** — 바탕색·글자색(지시).
   *
   * 목록의 통채움이 이 값을 읽는다. 여태 색은 실행 판정 기준(cycle_result)
   * 에서만 고를 수 있었고 상태·우선순위 같은 칸은 코드의 팔레트가 정했다 —
   * 사람이 못 고쳤다.
   */
  const saveStyle = (value: string, patch: { color?: string; fg?: string }) => {
    const it = items.find((x) => x.value === value)
    let meta: Record<string, unknown> = {}
    try {
      meta = JSON.parse(it?.note || '{}') as Record<string, unknown>
    } catch {
      /* 옛 자료 */
    }
    void apiFetch('/api/codes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind,
        value,
        sort_order: it?.sort_order ?? 0,
        note: JSON.stringify({ ...meta, ...patch }),
      }),
    }).then(invalidate)
  }
  const styleOf = (i: number): { color?: string; fg?: string } => {
    try {
      return JSON.parse(items[i]?.note || '{}') as { color?: string; fg?: string }
    } catch {
      return {}
    }
  }

  /** 필드(탭) 단위 생김새 — 폭·모양·정렬·글꼴(지시) */
  const styleQ = useQuery({
    queryKey: ['code-kind-style'],
    queryFn: async () => {
      const r = await apiFetch('/api/codes/kind-style')
      if (!r.ok) throw new Error('필드 모양을 불러오지 못했습니다')
      return (await r.json()) as {
        styles: Record<string, KStyle>
      }
    },
    staleTime: 30_000,
  })
  const kstyle = styleQ.data?.styles?.[kind] ?? {}
  /**
   * 폭은 **누르는 즉시** 반영한다(지적: 30 은 되는데 바로 조정이 안 된다).
   *
   * 여태 칸을 떠날 때(onBlur)만 저장해서, 위·아래 화살표를 눌러도 화면이
   * 그대로였다. 폭은 눈으로 맞추는 값이라 한 칸 올릴 때마다 보여야 한다.
   * 다만 화살표를 연타할 때마다 저장하면 통신이 줄줄이 나가므로 잠깐
   * 기다렸다가 마지막 값 하나만 보낸다.
   */
  const wTimer = useRef<number | null>(null)
  const bumpW = (v: string) => {
    if (wTimer.current) window.clearTimeout(wTimer.current)
    wTimer.current = window.setTimeout(() => saveKindStyle({ w: v }), 250)
  }

  const saveKindStyle = (patch: Partial<KStyle>) => {
    void apiFetch('/api/codes/kind-style', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, ...kstyle, ...patch }),
    }).then(() => {
      void qc.invalidateQueries({ queryKey: ['code-kind-style'] })
      invalidate()
    })
  }

  /** 실행 결과(cycle_result) 값의 색·계열 — note 에 JSON 으로 담는다 */
  const saveMeta = (value: string, color?: string, group?: string) => {
    const it = items.find((x) => x.value === value)
    void apiFetch('/api/codes', {
      method: 'POST',
      body: JSON.stringify({
        kind,
        value,
        sort_order: it?.sort_order ?? 0,
        note: JSON.stringify({ color: color || undefined, group: group || 'neutral' }),
      }),
    }).then(invalidate)
  }

  const fail = (e: unknown) =>
    setNote({ kind: 'err', msg: e instanceof Error ? e.message : String(e) })

  const saveM = useMutation({
    mutationFn: async (it: Item) => {
      const r = await apiFetch('/api/codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(it),
      })
      const b = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(b.detail || '저장하지 못했습니다')
    },
    onSuccess: () => {
      setDraft('')
      setNote({ kind: 'ok', msg: '저장했습니다' })
      invalidate()
    },
    onError: fail,
  })

  const delM = useMutation({
    mutationFn: async (it: Item) => {
      const r = await apiFetch(
        `/api/codes/${encodeURIComponent(it.kind)}/${encodeURIComponent(it.value)}`,
        { method: 'DELETE' },
      )
      const b = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(b.detail || '지우지 못했습니다')
    },
    onSuccess: () => {
      setNote({ kind: 'ok', msg: '지웠습니다' })
      invalidate()
    },
    onError: fail,
  })

  /** 만든 칸의 값 목록 저장. 값은 그 필드 정의의 options 에 통째로 들어간다. */
  const cfSaveM = useMutation({
    mutationFn: async ({ f, values }: { f: CustomField; values: string[] }) => {
      const r = await apiFetch('/api/custom-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, options: values.join('\n') }),
      })
      const b = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(b.detail || '저장하지 못했습니다')
    },
    onSuccess: () => {
      setDraft('')
      setNote({ kind: 'ok', msg: '저장했습니다' })
      invalidate()
    },
    onError: fail,
  })

  /** 새 탭 = 「고르기」 커스텀 필드 하나. 칸과 고를 값이 함께 생긴다. */
  const newTabM = useMutation({
    mutationFn: async (label: string) => {
      // 키는 저장에 쓰는 이름이라 영문만 받는다. 이름이 한글이면 남는 글자가
      // 없어서 번호를 붙인다(커스텀 필드 화면과 같은 규칙).
      const taken = (cfQ.data?.items ?? []).filter((f) => f.target === target).map((f) => f.key)
      const base =
        label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'field'
      let key = base
      for (let i = 1; taken.includes(key) && i < 500; i++) key = `${base}_${i}`
      const r = await apiFetch('/api/custom-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target,
          key,
          label: label.trim(),
          type: 'select',
          // 값은 아직 없다. 서버가 '고르기는 값이 있어야 한다'로 막으므로
          // 자리표시자를 하나 넣고, 사람이 진짜 값을 넣으면 지우면 된다.
          options: '(값을 넣으세요)',
          show_form: true,
          show_list: false,
        }),
      })
      const b = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(b.detail || '만들지 못했습니다')
      return b.id as number
    },
    onSuccess: (id) => {
      setNewTab(null)
      setKind(`cf:${id}`)
      setNote({ kind: 'ok', msg: '탭을 만들었습니다. 아래에 고를 값을 넣으세요' })
      invalidate()
    },
    onError: fail,
  })

  /** 순서 바꾸기. 드롭다운에 뜨는 차례가 곧 이 값이다. */
  const move = (i: number, dir: -1 | 1) => {
    if (!cur) return
    const j = i + dir
    if (j < 0 || j >= cur.values.length) return
    if (cur.cf) {
      const next = [...cur.values]
      const a = next[i]!
      next[i] = next[j]!
      next[j] = a
      cfSaveM.mutate({ f: cur.cf, values: next })
      return
    }
    const it = items[i]
    const other = items[j]
    if (!it || !other) return
    saveM.mutate({ ...it, sort_order: other.sort_order ?? j })
    saveM.mutate({ ...other, sort_order: it.sort_order ?? i })
  }

  const submit = () => {
    const v = draft.trim()
    if (!v || !cur) {
      setNote({ kind: 'err', msg: '값을 입력하세요' })
      return
    }
    if (cur.cf) {
      if (cur.values.includes(v)) {
        setNote({ kind: 'err', msg: '이미 있는 값입니다' })
        return
      }
      // 새로 만든 탭의 자리표시자는 진짜 값이 들어오면 걷어낸다
      const kept = cur.values.filter((x) => x !== '(값을 넣으세요)')
      cfSaveM.mutate({ f: cur.cf, values: [...kept, v] })
      return
    }
    saveM.mutate({ kind, value: v, sort_order: cur.values.length + 1 })
  }

  const removeValue = (i: number) => {
    if (!cur) return
    const v = cur.values[i]!
    // 쓰는 건수가 있어도 지울 수 있다(피드백) — 기록의 값은 남고
    // 고르기 목록에서만 빠진다. 대신 몇 건이 쓰는지 미리 알린다.
    const used = cur.cf ? 0 : (items[i]?.used ?? 0)
    if (
      !window.confirm(
        `'${v}' 을 지울까요?${
          used
            ? `\n${used}건이 이 값을 쓰고 있습니다 — 지워도 그 기록의 값은 남고, 고르기 목록에서만 빠집니다.`
            : ''
        }`,
      )
    )
      return
    if (cur.cf) {
      cfSaveM.mutate({ f: cur.cf, values: cur.values.filter((_, x) => x !== i) })
      return
    }
    const it = items[i]
    if (it) delM.mutate(it)
  }

  const busy = !canEdit || saveM.isPending || delM.isPending || cfSaveM.isPending

  return (
    <div className="set-page wide">
      <div className="set-head">
        <div>
          <h3>{TITLE[target]!.h}</h3>
          <p className="muted small">{TITLE[target]!.p}</p>
        </div>
      </div>

      {note.msg && <div className={`set-note ${note.kind}`}>{note.msg}</div>}

      {/* 못 고치는 사람에게는 **왜** 못 고치는지 말해 준다 — 눌러도 아무 일이
          없으면 고장 난 화면으로 읽힌다 */}
      {meQ.data && !canEdit && (
        <div className="set-note warn">
          이 설정은 <b>관리자만</b> 고칠 수 있습니다. 여기 값 하나가 요구사항·시험항목·사이클 세 화면
          모두의 목록을 바꾸기 때문입니다 — 보기는 그대로 되고, 바꿀 것이 있으면 관리자에게 알려 주세요.
        </div>
      )}

      <div className="cs-body" inert={(meQ.data && !canEdit) || undefined}>
      <div className="ps-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={kind === t.key}
            className={`ps-tab${kind === t.key ? ' on' : ''}`}
            onClick={() => {
              setKind(t.key)
              setDraft('')
              setNewTab(null)
              setNote({ kind: '', msg: '' })
            }}
            onDoubleClick={() => {
              // 만든 탭도 그 자리에서 바꾼다(피드백) — 「커스텀 필드
              // 화면에서만」 은 어디서 되는지 못 찾게 만들 뿐이었다.
              const nm = window.prompt(
                t.cf ? '탭 이름' : '탭 이름 (비우면 원래 이름으로)',
                t.label,
              )
              if (nm === null) return
              if (t.cf) {
                if (!nm.trim()) return
                void apiFetch('/api/custom-fields', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ ...t.cf, label: nm.trim() }),
                }).then(invalidate)
                return
              }
              void apiFetch('/api/codes/kind-label', {
                method: 'POST',
                body: JSON.stringify({ kind: t.key, label: nm.trim() }),
              }).then(invalidate)
            }}
            title="더블클릭하면 탭 이름을 바꿉니다"
          >
            {t.label}
            {/* 우리가 만든 탭은 표시해 둔다 — 기본 칸과 달리 지울 수 있어서,
                구분이 안 되면 지워도 되는지 매번 판단해야 한다. */}
            {t.cf && <span className="seg-made">추가</span>}
            {/* 활성/비활성(합의 규칙 ④) — 켜져 있어야 화면 ⚙ 목록에 선다 */}
            {t.cf && (
              <i
                className={`seg-vis${(t.cf as { show_list?: boolean }).show_list !== false ? ' on' : ''}`}
                role="button"
                title="화면 표시(각 화면 ⚙ 목록) 켜기/끄기"
                onClick={(e) => {
                  e.stopPropagation()
                  const on = (t.cf as { show_list?: boolean }).show_list !== false
                  void apiFetch('/api/custom-fields', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...t.cf, show_list: !on }),
                  }).then(invalidate)
                }}
              >
                {(t.cf as { show_list?: boolean }).show_list !== false ? '표시' : '숨김'}
              </i>
            )}
            <span className="cnt">{t.values.length}</span>
            {t.cf && kind === t.key && (
              <span
                className="seg-x"
                role="button"
                title="이 탭(만든 칸)을 지웁니다 — 저장된 값 자료는 남습니다"
                onClick={(e) => {
                  e.stopPropagation()
                  const used = (t.cf as { used?: number }).used ?? 0
                  if (
                    !window.confirm(
                      `「${t.label}」 탭을 지울까요?${
                        used
                          ? `\n${used}건이 이 칸에 값을 갖고 있습니다 — 정의만 지워지고 값 자료는 남습니다.`
                          : '\n값 자료는 지워지지 않습니다.'
                      }`,
                    )
                  )
                    return
                  void apiFetch(`/api/custom-fields/${(t.cf as { id: number }).id}`, {
                    method: 'DELETE',
                  }).then(() => {
                    invalidate()
                    setKind('')
                  })
                }}
              >
                ✕
              </span>
            )}
            {!t.cf && kind === t.key && (
              <span
                className="seg-x"
                role="button"
                title="이 탭을 숨깁니다 — 값 자료는 남고, 편집 창의 칸도 함께 사라집니다"
                onClick={(e) => {
                  e.stopPropagation()
                  if (!window.confirm(`「${t.label}」 탭을 숨길까요?\n값 자료는 지워지지 않습니다.`))
                    return
                  void apiFetch('/api/codes/kind-hidden', {
                    method: 'POST',
                    body: JSON.stringify({ kind: t.key, hidden: true }),
                  }).then(() => {
                    invalidate()
                    setKind('')
                  })
                }}
              >
                ✕
              </span>
            )}
          </button>
        ))}
        <button
          type="button"
          className="ps-tab seg-add"
          title="고를 값을 갖는 칸을 새로 만듭니다"
          onClick={() => {
            setNewTab('')
            setNote({ kind: '', msg: '' })
          }}
        >
          + 탭 추가
        </button>
      </div>

      {newTab !== null && (
        <section className="set-card">
          <div className="set-card-head">
            <b>탭 추가</b>
            <span className="muted small">
              {target === 'tc' ? 'TC' : target === 'cycle' ? '사이클' : '요구사항'} 편집 화면에
              드롭다운 칸이 하나 생깁니다
            </span>
          </div>
          <div className="dc-add">
            <input
              autoFocus
              placeholder="칸 이름 (예: 담당자)"
              value={newTab}
              onChange={(e) => setNewTab(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newTab.trim()) newTabM.mutate(newTab)
                if (e.key === 'Escape') setNewTab(null)
              }}
            />
            <button
              className="btn primary"
              type="button"
              disabled={!newTab.trim() || newTabM.isPending}
              onClick={() => newTabM.mutate(newTab)}
            >
              {newTabM.isPending ? '만드는 중…' : '만들기'}
            </button>
            <button className="btn" type="button" onClick={() => setNewTab(null)}>
              취소
            </button>
          </div>
          <div className="hint">
            새 탭은 「커스텀 필드」의 <b>고르기</b> 칸으로 만들어집니다. 목록 열에 함께
            보이게 하거나 나중에 지우는 것은 설정 → 커스텀 필드에서 합니다.
          </div>
        </section>
      )}

      {!cur ? null : (
        <>
          <section className="set-card">
            <div className="set-card-head">
              <b>{cur.label} 추가</b>
            </div>
            <div className="dc-add">
              <input
                placeholder="값 (화면에 그대로 보입니다)"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submit()
                }}
              />
              <button className="btn primary" type="button" onClick={submit} disabled={busy}>
                추가
              </button>
            </div>
          </section>

          <section className="set-card">
            <div className="set-card-head">
              <b>{cur.label} 목록</b>
              <span className="muted small">위에 있는 것부터 드롭다운에 뜹니다</span>
            </div>

            {/* 옛 자료에만 남은 값 — 목록에 없어서 화면이 붉게 보여 준다(지적) */}
            {(orphanQ.data?.items ?? []).length > 0 && (
              <div className="dc-orphan">
                <b>목록에 없는데 쓰이고 있는 값</b>
                <span className="muted small">
                  화면에서 붉은 「목록에 없음」으로 보입니다. 넣으면 색도 정할 수 있습니다.
                </span>
                <span className="dc-orphan-vals">
                  {(orphanQ.data?.items ?? []).map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      className="btn small"
                      disabled={busy}
                      title={`${o.used}건이 쓰는 중 — 눌러서 목록에 넣습니다`}
                      onClick={() =>
                        saveM.mutate({
                          kind,
                          value: o.value,
                          sort_order: (cur?.values.length ?? 0) + 1,
                        })
                      }
                    >
                      + {o.value} <i className="muted">{o.used}건</i>
                    </button>
                  ))}
                </span>
              </div>
            )}

            {/* 필드 하나의 생김새 — 목록 세 화면이 이 값을 같이 읽는다(지시) */}
            {!cur.cf && (
              <div className="dc-kstyle">
                <label>
                  <span>폭</span>
                  {/* 폭은 늘 **손으로 정하는 값**이다(지시). 「자동」으로 비워
                      두면 어디서 정해지는지 알 수 없었다 — 기본 40 을 넣어
                      두고 거기서 올리고 내린다. 40 아래도 된다(지적) */}
                  <input
                    key={kind}
                    type="number"
                    min={20}
                    max={400}
                    step={2}
                    defaultValue={kstyle.w || String(COL_W_DEFAULT)}
                    title="목록에서 이 열이 차지할 px — 기본 40"
                    onChange={(e) => bumpW(e.target.value)}
                    onBlur={(e) => saveKindStyle({ w: e.target.value })}
                  />
                  <i className="muted small">px</i>
                </label>
                <label>
                  <span>모양</span>
                  <select
                    value={kstyle.shape || 'fill'}
                    onChange={(e) => saveKindStyle({ shape: e.target.value })}
                  >
                    <option value="fill">셀 채움 (Monday)</option>
                    <option value="pill">둥근 알약</option>
                    <option value="tag">사각 태그</option>
                    <option value="text">글자만</option>
                  </select>
                </label>
                <label>
                  <span>정렬</span>
                  <select
                    value={kstyle.align || 'center'}
                    onChange={(e) => saveKindStyle({ align: e.target.value })}
                  >
                    <option value="center">가운데</option>
                    <option value="left">왼쪽</option>
                  </select>
                </label>
                {/* 글꼴 — 필드 단위다(지시). 값마다 다르면 한 열이 들쭉해진다 */}
                <label>
                  <span>글꼴</span>
                  <select
                    value={kstyle.font || 'sans'}
                    onChange={(e) => saveKindStyle({ font: e.target.value })}
                  >
                    <option value="sans">화면 기본</option>
                    <option value="mono">고정폭 (숫자·ID 가 맞음)</option>
                    <option value="serif">명조</option>
                  </select>
                </label>
                <label>
                  <span>굵기</span>
                  <select
                    value={kstyle.weight || '700'}
                    onChange={(e) => saveKindStyle({ weight: e.target.value })}
                  >
                    <option value="400">보통</option>
                    <option value="600">약간 굵게</option>
                    <option value="700">굵게</option>
                    <option value="800">아주 굵게</option>
                  </select>
                </label>
                <label>
                  <span>크기</span>
                  <select
                    value={kstyle.size || '12'}
                    onChange={(e) => saveKindStyle({ size: e.target.value })}
                  >
                    <option value="11">작게</option>
                    <option value="12">보통</option>
                    <option value="13">크게</option>
                    <option value="14">아주 크게</option>
                  </select>
                </label>
                <label>
                  <span>대소문자</span>
                  <select
                    value={kstyle.caps || 'none'}
                    onChange={(e) => saveKindStyle({ caps: e.target.value })}
                  >
                    <option value="none">그대로</option>
                    <option value="upper">전부 대문자</option>
                  </select>
                </label>
                <span className="muted small">
                  요구사항·시험항목·사이클 목록이 이 설정을 함께 씁니다.
                </span>
              </div>
            )}

            {listQ.isLoading || cfQ.isLoading ? (
              <div className="empty">불러오는 중…</div>
            ) : cur.values.length === 0 ? (
              <div className="empty">아직 없습니다.</div>
            ) : (
              <div className="dc-list">
                {cur.values.map((v, i) => {
                  const used = cur.cf ? 0 : (items[i]?.used ?? 0)
                  return (
                    <div className="dc-row" key={v}>
                      <b className="dc-name">{v}</b>
                      {/* 값마다 **바탕·글자 두 색**(지시) — 목록의 통채움이
                          이것을 읽는다. 오른쪽에 실물 그대로 미리 보인다 */}
                      {!cur.cf && kind !== 'cycle_result' && (() => {
                        const st = styleOf(i)
                        /* 안 정했으면 **목록에서 실제로 나오는 색**을 보여 준다
                           (지적: 아무것도 설정 안 했는데 녹색이었다). 여기가
                           회색으로 거짓말을 하고 있었다 — 색은 목록 페이지에
                           박혀 있었고 설정은 그것을 몰랐다 */
                        const bg = st.color || defaultBg(v)
                        const fg = st.fg || '#ffffff'
                        return (
                          <span className="dc-style">
                            {/* 무엇을 고르는 색인지 글자로 적는다(지적) —
                                동그라미 둘만 있으면 어느 쪽이 바탕인지 모른다 */}
                            <span className="dc-lb">바탕</span>
                            <ColorPick
                              title="바탕색"
                              value={bg}
                              onPick={(c) => saveStyle(v, { color: c })}
                            />
                            <span className="dc-lb">글자</span>
                            <ColorPick
                              title="글자색"
                              value={fg}
                              onPick={(c) => saveStyle(v, { fg: c })}
                            />
                            {!st.color && <span className="dc-dft" title="이 값은 색을 따로 정하지 않았습니다. 이름에 맞춘 기본색이 나옵니다">기본</span>}
                            <span className="dc-lb">결과</span>
                            <i
                              className={`dc-prev sh-${kstyle.shape || 'fill'}`}
                              style={{
                                background: bg,
                                color: fg,
                                width: `${Number(kstyle.w) || COL_W_DEFAULT}px`,
                                fontWeight: Number(kstyle.weight || 700),
                                fontSize: `${Number(kstyle.size || 12)}px`,
                                fontFamily:
                                  kstyle.font === 'mono'
                                    ? 'var(--font-mono)'
                                    : kstyle.font === 'serif'
                                      ? 'Georgia, "Noto Serif KR", serif'
                                      : undefined,
                                textTransform: kstyle.caps === 'upper' ? 'uppercase' : undefined,
                              }}
                              title={`목록에서 이렇게 보입니다 — 폭 ${kstyle.w || COL_W_DEFAULT}px`}
                            >
                              {v}
                            </i>
                            <span className="muted small">{`${Number(kstyle.w) || COL_W_DEFAULT}px`}</span>
                          </span>
                        )
                      })()}
                      {/* 실행 결과 값은 색과 계열(집계 규칙)을 함께 정한다 */}
                      {kind === 'cycle_result' && !cur.cf && (() => {
                        let meta: { color?: string; group?: string } = {}
                        try {
                          meta = JSON.parse(items[i]?.note || '{}') as typeof meta
                        } catch {
                          /* 옛 자료 */
                        }
                        return (
                          <span className="dc-resmeta">
                            <input
                              type="color"
                              value={meta.color || '#94a3b8'}
                              title="이 상태의 색"
                              onChange={(e) => saveMeta(v, e.target.value, meta.group)}
                            />
                            <select
                              value={meta.group || 'neutral'}
                              title="집계 계열 — Pass 계열은 통과로, Fail 계열은 실패로 센다"
                              onChange={(e) => saveMeta(v, meta.color, e.target.value)}
                            >
                              <option value="pass">Pass 계열</option>
                              <option value="fail">Fail 계열</option>
                              <option value="neutral">중립</option>
                            </select>
                          </span>
                        )
                      })()}
                      <span className="muted small dc-meta">
                        {used ? `${used}건이 쓰는 중` : ''}
                      </span>
                      <span className="dc-actions">
                        <button
                          className="btn small"
                          type="button"
                          disabled={i === 0 || busy}
                          onClick={() => move(i, -1)}
                          title="위로"
                        >
                          ▲
                        </button>
                        <button
                          className="btn small"
                          type="button"
                          disabled={i === cur.values.length - 1 || busy}
                          onClick={() => move(i, 1)}
                          title="아래로"
                        >
                          ▼
                        </button>
                        <button
                          className="btn small danger"
                          type="button"
                          disabled={busy}
                          title={
                            used
                              ? `${used}건이 쓰는 값 — 지워도 기록은 남고 고르기 목록에서만 빠집니다`
                              : ''
                          }
                          onClick={() => removeValue(i)}
                        >
                          삭제
                        </button>
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </>
      )}
      {target === 'cycle' && (
        <section className="set-card">
          <div className="set-card-head">
            <b>설명 (Description) 틀</b>
            <span className="muted small">
              새 사이클을 만들 때 설명 칸에 이 틀이 미리 채워집니다 — 보고서 패턴을
              맞추는 용도
            </span>
          </div>
          {/* 사이클 창의 설명 칸과 같은 마크다운 편집기 — 같은 서식으로 틀을 짠다 */}
          <div className="ce-md dc-tplmd">
            <MarkdownEditor
              value={descTpl ?? tplQ.data?.text ?? ''}
              onChange={setDescTpl}
              placeholder={'예)\n## 시험 요약\n- 대상 모델 / 버전:\n- 시험 범위:\n\n## 특이사항\n-'}
            />
          </div>
          <div className="dc-add">
            <button
              className="btn primary"
              type="button"
              disabled={descTpl === null}
              onClick={() => {
                void apiFetch('/api/cycle-desc-template', {
                  method: 'POST',
                  body: JSON.stringify({ text: descTpl ?? '' }),
                }).then(() => {
                  setNote({ kind: 'ok', msg: '틀을 저장했습니다' })
                  setDescTpl(null)
                  void qc.invalidateQueries({ queryKey: ['cycle-desc-template'] })
                })
              }}
            >
              틀 저장
            </button>
          </div>
        </section>
      )}
      </div>
    </div>
  )
}
