/**
 * Jira Issue — **지라에서 가져다 보는 자리**(목업 포팅).
 *
 * 지라에는 팔만 건이 넘는다. 다 가져오는 것은 뜻이 없고 지라도 못 견딘다.
 * 그래서 두 가지를 지킨다:
 *   · **프로젝트를 골라** 그것만 받는다(지시).
 *   · 한 번 받은 것은 **우리 DB 에 둔다**. 다음 Sync 는 마지막으로 받은
 *     갱신 시각 뒤에 바뀐 것만 부른다 — 두 번째부터는 몇 건이라 금방 끝난다.
 *
 * 표는 앱의 NTable 을 쓴다. 목업도 「Jira 표는 Cycles 표(ntb) 형태」 라고
 * 적어 두었고, 화면마다 표를 새로 만들면 결이 갈린다.
 *
 * 열은 목업 것을 그대로 쓰되 **값은 실제 지라 필드**에서 온다 — 사업자·
 * 문제유형·이슈분류·시험시설은 이 지라에 정말 있는 커스텀 필드다.
 */
import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, type MeUser } from '@/api/client'
import { prefGet, prefSet } from '@/lib/prefs'
import NTable from '@/components/ntable/NTable'
import NViews, { type ViewBody, type ViewDef } from '@/components/ntable/NViews'
import { IssueDrawer } from '@/components/jira/IssueDrawer'
import { useJiraBase } from '@/components/jira/useJiraBase'
import { EMPTY_VIEW, type NCalc, type NCol, type NRow, type NView } from '@/components/ntable/types'
import './JiraIssues.css'

interface JiraProject {
  key: string
  name: string
}
/** 분류 한 건 — 서버 _defect_norm 이 돌려주는 그대로 */
interface DefClass {
  source?: string
  device?: string
  category?: string
  item?: string
  type3?: string
  by?: string
  at?: string
}
interface DefSchema {
  device?: string[]
  category_field?: string[]
  category_live?: string[]
  item?: string[]
  type3?: string[]
}
interface SyncMark {
  at?: string
  last_updated?: string
  n?: number
  total?: number
}

/**
 * 열 — 목업 JIRA_COLS 그대로. `def` 는 처음에 보이는 열이다.
 *
 * 목업이 지어낸 「UMS-Key」 는 뺐다 — 이 지라에 그런 필드가 없다.
 * 있는 척하는 빈 열보다 없는 편이 낫다.
 */
const COLS: Array<{
  key: string
  label: string
  type?: NCol['type']
  w?: number
  def?: boolean
  /** 분류 열이면 분류 한 건의 어느 필드인지 */
  cls?: keyof DefClass
}> = [
  { key: 'created', label: '생성일', type: 'date', w: 104, def: true },
  { key: 'customer', label: '사업자', type: 'select', w: 92, def: true },
  { key: 'project', label: '프로젝트', w: 140, def: true },
  { key: 'issuekey', label: '키', w: 118, def: true },
  { key: 'probtype', label: '문제유형', type: 'select', w: 116, def: true },
  { key: 'hwsw', label: '이슈분류(HW,SW)', type: 'select', w: 122, def: true },
  { key: 'summary', label: '요약', w: 340, def: true },
  { key: 'status', label: '상태', type: 'select', w: 104, def: true },
  { key: 'reporter', label: '등록자', w: 128, def: true },
  { key: 'lab', label: '시험시설', type: 'select', w: 108, def: true },
  { key: 'issuetype', label: '이슈 유형', type: 'select', w: 104 },
  { key: 'assignee', label: '담당자', w: 120 },
  { key: 'priority', label: '우선순위', type: 'select', w: 92 },
  { key: 'updated', label: '갱신일', type: 'date', w: 104 },
  { key: 'stage', label: '이슈단계', type: 'select', w: 130 },
  { key: 'freq', label: '발생빈도', type: 'select', w: 92 },
  { key: 'start', label: '시작일', type: 'date', w: 100 },
  { key: 'due', label: '완료일', type: 'date', w: 100 },
  { key: 'crkind', label: 'CR 구분', type: 'select', w: 96 },
  { key: 'bsptest', label: 'BSP 시험버전', w: 126 },
  { key: 'bspfix', label: 'BSP 해결버전', w: 126 },
  { key: 'fwver', label: 'F/W Version', w: 118 },
  { key: 'labels', label: '라벨', w: 150 },
  { key: 'description', label: '내용', w: 280 },
  /* ── 분류(LLM) ── 지라에 없는 값이다. **우리가 매긴다**.
     그래서 이 다섯만 표에서 고칠 수 있다 — 나머지는 지라가 정본이다. */
  { key: 'cls_source', label: '발생상황', type: 'select', w: 100, def: true, cls: 'source' },
  { key: 'cls_device', label: '분류 유형', type: 'select', w: 84, def: true, cls: 'device' },
  { key: 'cls_category', label: '분류 카테고리', type: 'select', w: 108, def: true, cls: 'category' },
  { key: 'cls_item', label: '상용망 항목', type: 'select', w: 112, cls: 'item' },
  { key: 'cls_type3', label: '상용망 유형', type: 'select', w: 108, cls: 'type3' },
]
/** 서랍에 내는 분류 줄 */
const CLS_ROWS: Array<[string, string]> = [
  ['발생상황', 'cls_source'],
  ['분류 유형', 'cls_device'],
  ['분류 카테고리', 'cls_category'],
  ['상용망 항목', 'cls_item'],
  ['상용망 유형', 'cls_type3'],
]
/** 지라가 정본인 열 — 여기서 못 고친다 */
const JIRA_KEYS = COLS.filter((c) => !c.cls).map((c) => c.key)
/** 분류 열 → 분류 한 건의 어느 필드인가 */
const CLS_OF: Record<string, keyof DefClass> = Object.fromEntries(
  COLS.filter((c) => c.cls).map((c) => [c.key, c.cls as keyof DefClass]),
)

/** 지라 상태 로젠지 — 갈래(새것·진행·끝)로 색을 나눈다(목업) */
function statusKind(name: string): 'new' | 'run' | 'done' {
  const n = (name || '').toLowerCase()
  if (/close|resolve|reject|완료|승인|반려|done/.test(n)) return 'done'
  if (/new|할 일|작성|renew|assess/.test(n)) return 'new'
  return 'run'
}
/** 이슈 유형 아이콘 — 지라 아바타 대신 색 네모(목업 .jt) */
function typeKind(name: string): string {
  const n = (name || '').toLowerCase()
  if (/개발 ?defect|devdefect/.test(n)) return 'devdefect'
  if (/defect|bug|결함/.test(n)) return 'defect'
  if (/\bcr\b|request/.test(n)) return 'cr'
  if (/release|릴리/.test(n)) return 'osrel'
  if (/story/.test(n)) return 'story'
  if (/sub-?task|부작업/.test(n)) return 'subtask'
  if (/산출물|문서|doc/.test(n)) return 'doc'
  if (/리뷰|review/.test(n)) return 'review'
  if (/큰틀|epic/.test(n)) return 'epic'
  return 'task'
}

/** 한 번에 가를 수 있는 최대 — 로컬 LLM 이 한 건에 1~2초다. 이백이면 한 잔 마실 참 */
const CLS_CAP = 200

const PRJ_KEY = 'utop.jira.projects'
const COL_KEY = 'utop.jira.cols'
const W_KEY = 'utop.jira.w'
const ORD_KEY = 'utop.jira.order'

/** 저장해 둔 것을 꺼낸다 — 없으면 준 것을 그대로 */
function prefJson<T>(key: string, dflt: T): T {
  try {
    const v = JSON.parse(prefGet(key) || 'null') as unknown
    return v == null ? dflt : (v as T)
  } catch {
    return dflt
  }
}

export default function JiraIssues({ me }: { me?: MeUser | null }) {
  const qc = useQueryClient()
  const jbase = useJiraBase()
  /** 고른 프로젝트 — 계정을 따라간다 */
  const [picked, setPicked] = useState<string[]>(() => {
    try {
      const v = JSON.parse(prefGet(PRJ_KEY) || '[]') as unknown
      return Array.isArray(v) ? (v as string[]) : []
    } catch {
      return []
    }
  })
  useEffect(() => {
    prefSet(PRJ_KEY, JSON.stringify(picked))
  }, [picked])
  const [prjOpen, setPrjOpen] = useState(false)
  const [prjQ, setPrjQ] = useState('')
  const [view, setView] = useState<NView>(EMPTY_VIEW)
  const [calcs, setCalcs] = useState<Record<string, NCalc>>({})
  const [per, setPer] = useState(50)
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState('')
  const [sel, setSel] = useState<string>('')
  /** 표에서 체크한 줄 — 분류가 누구를 대상으로 도는지 정한다 */
  const [checked, setChecked] = useState<string[]>([])
  const [clsAsk, setClsAsk] = useState(false)
  /** 이 숫자가 오르면 표가 고른 줄을 푼다 — 방금 한 일이 또 될 것 같아 멈칫한다 */
  const [selEpoch, setSelEpoch] = useState(0)
  /* 열 한 벌 — 숨김·폭·차례. 보기 탭(NViews)에 담기는 것이 바로 이 셋이라
     따로 들고 있어야 탭을 골랐을 때 그대로 얹을 수 있다. 계정을 따라간다. */
  const [hidden, setHidden] = useState<string[]>(() => {
    const dflt = COLS.filter((c) => !c.def).map((c) => c.key)
    const saved = prefJson<string[] | null>(COL_KEY, null)
    if (!saved) return dflt
    /* 저장해 둔 뒤에 **열이 늘면** 그 계정에만 새 열이 다 펼쳐져 뜬다 —
       저장분에 아예 없던 열은 기본값을 따른다(본 적 없는 열이라 「보이게
       해 둔 것」 이 아니다). */
    const known = new Set(saved)
    return [...saved, ...dflt.filter((k) => !known.has(k))]
  })
  const [widths, setWidths] = useState<Record<string, number>>(() => prefJson(W_KEY, {}))
  const [order, setOrder] = useState<string[]>(() => prefJson(ORD_KEY, []))
  const [nvId, setNvId] = useState('')
  useEffect(() => {
    prefSet(COL_KEY, JSON.stringify(hidden))
  }, [hidden])
  useEffect(() => {
    prefSet(W_KEY, JSON.stringify(widths))
  }, [widths])
  useEffect(() => {
    prefSet(ORD_KEY, JSON.stringify(order))
  }, [order])

  const prjQuery = useQuery({
    queryKey: ['jira-projects'],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const r = await apiFetch('/api/jira/projects')
      return (await r.json()) as { ok?: boolean; projects?: JiraProject[] }
    },
  })
  const projects = prjQuery.data?.projects ?? []

  const issQuery = useQuery({
    queryKey: ['jira-issues', picked.join(',')],
    enabled: picked.length > 0,
    queryFn: async () => {
      const r = await apiFetch(`/api/jira/issues?projects=${encodeURIComponent(picked.join(','))}`)
      return (await r.json()) as {
        ok?: boolean
        rows?: Array<Record<string, string>>
        total?: number
        sync?: Record<string, SyncMark | null>
      }
    },
  })
  /** 고를 수 있는 분류 값 — 서버가 정본이라 화면에 박지 않는다 */
  const schQuery = useQuery({
    queryKey: ['jira-defschema'],
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const r = await apiFetch('/api/jira/defect/schema')
      return (await r.json()) as DefSchema
    },
  })
  /** 매겨 둔 분류 — 이슈와 따로 산다(지라 값이 아니라 우리 값이라) */
  const clsQuery = useQuery({
    queryKey: ['jira-defclass'],
    queryFn: async () => {
      const r = await apiFetch('/api/jira/defect/class')
      return (await r.json()) as { ok?: boolean; classes?: Record<string, DefClass> }
    },
  })
  const classes = useMemo(() => clsQuery.data?.classes ?? {}, [clsQuery.data])

  const rows: NRow[] = useMemo(
    () =>
      (issQuery.data?.rows ?? []).map((r) => {
        const k = String(r.issuekey ?? '')
        const c = classes[k] ?? {}
        return {
          ...r,
          __id: k,
          cls_source: c.source ?? '',
          cls_device: c.device ?? '',
          cls_category: c.category ?? '',
          cls_item: c.item ?? '',
          cls_type3: c.type3 ?? '',
        }
      }),
    [issQuery.data, classes],
  )

  /** 고른 값들로 선택지를 만든다 — 지라 값은 프로젝트마다 달라 박아 둘 수 없다 */
  const columns: NCol[] = useMemo(() => {
    const made = COLS.map((c) => {
      const col: NCol = {
        key: c.key,
        label: c.label,
        type: c.type ?? 'text',
        width: widths[c.key] || c.w,
        hidden: hidden.includes(c.key),
        fixed: c.key === 'issuekey' || c.key === 'summary',
      }
      if (c.cls) {
        /* 분류 값은 **서버 스키마가 정본**이다 — 있는 값만 모으면 아직 안 쓴
           값을 영영 못 고른다. 현장장애·상용망검증은 카테고리가 갈리는데
           열은 하나라 둘을 합쳐 준다(고르고 나면 서버가 걸러 낸다). */
        const sch = schQuery.data ?? {}
        const opt: string[] =
          c.cls === 'source'
            ? ['현장장애', '상용망검증']
            : c.cls === 'device'
              ? sch.device ?? []
              : c.cls === 'category'
                ? [...new Set([...(sch.category_field ?? []), ...(sch.category_live ?? [])])]
                : c.cls === 'item'
                  ? sch.item ?? []
                  : sch.type3 ?? []
        col.options = opt.map((v) => ({
          value: v,
          color: v === '현장장애' ? 'red' : v === '상용망검증' ? 'blue' : 'gray',
        }))
      } else if (col.type === 'select') {
        const vals = [...new Set(rows.map((r) => String(r[c.key] ?? '')).filter(Boolean))]
        col.options = vals.slice(0, 60).map((v) => ({ value: v, color: 'gray' }))
      }
      return col
    })
    if (!order.length) return made
    /* 저장된 차례를 얹는다 — 거기 없는 열(나중에 는 것)은 뒤에 붙인다 */
    const at = new Map(order.map((k, i) => [k, i]))
    return [...made].sort(
      (a, b) => (at.get(a.key) ?? 900 + made.indexOf(a)) - (at.get(b.key) ?? 900 + made.indexOf(b)),
    )
  }, [rows, hidden, widths, order, schQuery.data])

  /** 지금 화면 한 벌 — 새 탭·덮어쓰기가 이것을 담는다 */
  const nBody: ViewBody = useMemo(
    () => ({
      hidden: columns.filter((c) => c.hidden).map((c) => c.key),
      widths: Object.fromEntries(columns.filter((c) => c.width).map((c) => [c.key, c.width!])),
      order: columns.map((c) => c.key),
    }),
    [columns],
  )
  /** 탭을 고르면 **열 배치**를 얹는다 — 탭에 담기는 것은 그것뿐이다(보기 정책) */
  const applyView = (v: ViewDef | null) => {
    setNvId(v?.id ?? '')
    setHidden(v?.body?.hidden ?? COLS.filter((c) => !c.def).map((c) => c.key))
    setWidths(v?.body?.widths ?? {})
    setOrder(v?.body?.order ?? [])
  }

  async function sync(full = false) {
    if (!picked.length || busy) return
    setBusy(true)
    setFlash('')
    try {
      const r = await apiFetch('/api/jira/issues/sync', {
        method: 'POST',
        body: JSON.stringify({ projects: picked, full }),
      })
      const j = (await r.json()) as {
        ok?: boolean
        error?: string
        got?: number
        added?: number
        updated?: number
        same?: number
        ms?: number
      }
      if (!j.ok) {
        setFlash(`동기화 실패 — ${j.error ?? '알 수 없는 까닭'}`)
        return
      }
      setFlash(
        `● 지라에서 ${j.got ?? 0}건 받아 DB 에 저장했습니다 — 새로 ${j.added ?? 0} · 갱신 ${j.updated ?? 0} · 변경 없음 ${j.same ?? 0} (${j.ms ?? 0}ms)`,
      )
      void qc.invalidateQueries({ queryKey: ['jira-issues'] })
      window.setTimeout(() => setFlash(''), 8000)
    } catch (e) {
      setFlash(`동기화 실패 — ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  /** 무엇을 가를 것인가 — 체크한 줄이 있으면 그것만, 없으면 지금 목록 전부 */
  const clsTargets = checked.length ? checked : rows.map((r) => String(r.__id))
  const clsUndone = clsTargets.filter((k) => !(classes[k] ?? {}).source).length

  /** LLM 분류 — 프롬프트는 SETUP 「용도별 프롬프트 › Jira-분류」 가 정한다 */
  async function classify(overwrite: boolean) {
    setClsAsk(false)
    if (busy) return
    const keys = clsTargets.slice(0, CLS_CAP)
    if (!keys.length) return
    setBusy(true)
    setFlash(`● ${keys.length}건을 LLM 으로 가르는 중… 한 건에 1~2초 걸립니다`)
    try {
      const r = await apiFetch('/api/jira/defect/classify', {
        method: 'POST',
        body: JSON.stringify({ keys, overwrite }),
      })
      const j = (await r.json()) as {
        ok?: boolean
        error?: string
        detail?: string
        classified?: number
        failed?: string[]
        skipped?: number
        llm?: string
        message?: string
      }
      if (!j.ok) {
        setFlash(`분류 실패 — ${j.error ?? j.detail ?? '알 수 없는 까닭'}`)
        return
      }
      const bad = j.failed?.length ?? 0
      setFlash(
        j.message
          ? `● ${j.message}`
          : `● ${j.classified ?? 0}건을 갈랐습니다${bad ? ` · 못 가른 것 ${bad}건` : ''}${j.llm ? ` (${j.llm})` : ''}`,
      )
      void qc.invalidateQueries({ queryKey: ['jira-defclass'] })
      setSelEpoch((n) => n + 1)
      window.setTimeout(() => setFlash(''), 8000)
    } catch (e) {
      setFlash(`분류 실패 — ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  /** 분류 한 칸을 손으로 고친다 — LLM 이 틀린 것을 사람이 바로잡는 자리 */
  async function saveCls(key: string, colKey: string, value: string) {
    const field = CLS_OF[colKey]
    if (!field) return
    const next: DefClass = { ...(classes[key] ?? {}), [field]: value }
    /* 그리는 것을 먼저 바꾼다 — 서버를 기다리면 고른 값이 한 박자 늦게 뜬다 */
    qc.setQueryData(['jira-defclass'], (old: { classes?: Record<string, DefClass> } | undefined) => ({
      ...(old ?? {}),
      classes: { ...(old?.classes ?? {}), [key]: next },
    }))
    try {
      const r = await apiFetch('/api/jira/defect/class', {
        method: 'POST',
        body: JSON.stringify({ key, class: next }),
      })
      const j = (await r.json()) as { ok?: boolean; class?: DefClass }
      /* 서버는 **발생상황에 안 맞는 값을 걸러 낸다** — 현장장애 줄에
         상용망 값(신규기능·항목·유형)을 고르면 빈 값으로 돌아온다.
         돌려받은 것을 그대로 쓰고, 떨어졌으면 왜 그런지 말해 준다.
         안 그러면 골라 놓은 값이 소리 없이 사라진 것처럼 보인다. */
      if (j.ok && j.class) {
        const got = String(j.class[field] ?? '')
        qc.setQueryData(
          ['jira-defclass'],
          (old: { classes?: Record<string, DefClass> } | undefined) => ({
            ...(old ?? {}),
            classes: { ...(old?.classes ?? {}), [key]: j.class as DefClass },
          }),
        )
        if (value && got !== value) {
          setFlash(
            `「${value}」 는 ${next.source || '이 발생상황'} 에는 쓰지 않는 값이라 저장되지 않았습니다`,
          )
          window.setTimeout(() => setFlash(''), 6000)
        }
      }
    } catch {
      setFlash('분류를 저장하지 못했습니다')
    }
  }

  const syncMark = issQuery.data?.sync ?? {}
  const lastAt = Object.values(syncMark)
    .map((m) => m?.at || '')
    .filter(Boolean)
    .sort()
    .pop()

  const prjList = projects.filter(
    (p) => !prjQ.trim() || `${p.key} ${p.name}`.toLowerCase().includes(prjQ.trim().toLowerCase()),
  )

  return (
    <div className="jri">
      {!!flash && <div className="jri-toast">{flash}</div>}

      <div className="jri-tools">
        {/* 프로젝트를 고르는 것이 이 화면의 첫 물음이다 — 245 개 중 몇 개다 */}
        <span className="jri-prjwrap">
          <button
            type="button"
            className={`btn small${picked.length ? ' primary' : ''}`}
            aria-haspopup="listbox"
            aria-expanded={prjOpen}
            onClick={(e) => {
              e.stopPropagation()
              setPrjOpen((v) => !v)
            }}
          >
            프로젝트 {picked.length ? `${picked.length}개` : '고르기'} ▾
          </button>
          {prjOpen && (
            <>
              <span className="jri-veil" onClick={() => setPrjOpen(false)} aria-hidden="true" />
              <span className="jri-prjpop" role="listbox">
                <input
                  autoFocus
                  value={prjQ}
                  placeholder="프로젝트 키 · 이름 찾기"
                  onChange={(e) => setPrjQ(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
                <span className="jri-prjlist">
                  {prjList.slice(0, 200).map((p) => {
                    const on = picked.includes(p.key)
                    return (
                      <button
                        key={p.key}
                        type="button"
                        className={on ? 'on' : ''}
                        onClick={(e) => {
                          e.stopPropagation()
                          setPicked((v) => (on ? v.filter((x) => x !== p.key) : [...v, p.key]))
                        }}
                      >
                        <i aria-hidden="true">{on ? '✓' : ''}</i>
                        <b>{p.key}</b>
                        <span>{p.name}</span>
                      </button>
                    )
                  })}
                  {!prjList.length && <span className="jri-none">맞는 프로젝트가 없습니다</span>}
                </span>
                {!!picked.length && (
                  <span className="jri-prjft">
                    <button type="button" onClick={() => setPicked([])}>
                      모두 해제
                    </button>
                  </span>
                )}
              </span>
            </>
          )}
        </span>
        {picked.map((k) => (
          <span key={k} className="jri-chip">
            {k}
            <i onClick={() => setPicked((v) => v.filter((x) => x !== k))}>✕</i>
          </span>
        ))}
        <span className="sp" />
        {!!lastAt && (
          <span className="jri-last" title="마지막으로 지라에서 받아 온 때">
            {String(lastAt).slice(0, 16).replace('T', ' ')} 받음
          </span>
        )}
        {/* 지라에 없는 값을 매기는 자리 — 프롬프트는 SETUP 이 정한다 */}
        <span className="jri-clswrap">
          <button
            type="button"
            className="btn small jri-cls"
            disabled={!rows.length || busy}
            title="이슈 내용을 읽어 발생상황·장비·카테고리로 가릅니다 (SETUP › 용도별 프롬프트 › Jira-분류)"
            onClick={(e) => {
              e.stopPropagation()
              setClsAsk((v) => !v)
            }}
          >
            🤖 LLM 분류
          </button>
          {clsAsk && (
            <>
              <span className="jri-veil" onClick={() => setClsAsk(false)} aria-hidden="true" />
              <span className="jri-clspop" onClick={(e) => e.stopPropagation()}>
                <b>
                  {checked.length ? `고른 ${checked.length}건` : `이 목록 ${rows.length}건`}
                  {clsTargets.length > CLS_CAP ? ` 가운데 앞 ${CLS_CAP}건` : ''}
                </b>
                <span>
                  {clsUndone
                    ? `아직 안 가른 것이 ${clsUndone}건 있습니다.`
                    : '모두 한 번씩 갈라 두었습니다.'}
                </span>
                <span className="jri-clsbtns">
                  <button type="button" className="btn small" onClick={() => void classify(false)}>
                    안 가른 것만
                  </button>
                  <button
                    type="button"
                    className="btn small primary"
                    onClick={() => void classify(true)}
                  >
                    전부 다시
                  </button>
                </span>
              </span>
            </>
          )}
        </span>
        <button
          type="button"
          className="btn small"
          disabled={!picked.length || busy}
          title="처음부터 다시 받습니다 — 오래 걸립니다"
          onClick={() => void sync(true)}
        >
          전체 다시
        </button>
        <button
          type="button"
          className="btn small primary"
          disabled={!picked.length || busy}
          title="마지막으로 받은 뒤에 바뀐 것만 받습니다"
          onClick={() => void sync(false)}
        >
          {busy ? '↻ 받는 중…' : '↻ Sync'}
        </button>
      </div>

      {!picked.length ? (
        <div className="jri-empty">
          <b>프로젝트를 고르세요</b>
          <span>
            지라에는 이슈가 팔만 건이 넘습니다. 볼 프로젝트를 골라 <b>↻ Sync</b> 를 누르면
            그것만 받아 둡니다. 다음부터는 바뀐 것만 받으므로 금방 끝납니다.
          </span>
        </div>
      ) : !rows.length ? (
        <div className="jri-empty">
          <b>{issQuery.isLoading ? '읽는 중…' : '아직 받아 온 이슈가 없습니다'}</b>
          <span>
            {issQuery.isLoading
              ? ''
              : `고른 프로젝트(${picked.join(', ')})의 이슈를 아직 받지 않았습니다 — 위의 ↻ Sync 를 누르세요.`}
          </span>
        </div>
      ) : (
        <div className="jri-table">
          <NTable
            columns={columns}
            rows={rows}
            view={view}
            onView={setView}
            calcs={calcs}
            onCalcs={setCalcs}
            perPage={per}
            onPerPage={setPer}
            toolbarLeft={
              <NViews
                scope="jira.issues"
                curId={nvId}
                onPick={applyView}
                current={nBody}
                meName={me?.username || me?.name || ''}
                isAdmin={me?.role === 'admin'}
              />
            }
            busy={issQuery.isLoading || busy}
            idKey="issuekey"
            titleKey="summary"
            /* 지라 값은 여기서 못 고친다 — 고치는 자리는 지라다.
               고칠 수 있는 척하면 눌러 놓고 왜 안 되는지 찾게 된다. */
            readOnlyKeys={JIRA_KEYS}
            lockDefs
            onColumns={(cs) => {
              setHidden(cs.filter((c) => c.hidden).map((c) => c.key))
              setWidths(Object.fromEntries(cs.filter((c) => c.width).map((c) => [c.key, c.width!])))
              setOrder(cs.map((c) => c.key))
            }}
            onSelect={setChecked}
            selEpoch={selEpoch}
            /* 「삭제」 는 이 표에 없는 일이다 — 지라가 정본이라 여기서 지울 수
               없다. 안 넘기면 NTable 기본 단추가 서서 눌러도 아무 일이 없다. */
            bulk={[{ k: 'csv', label: '엑셀' }]}
            onCell={(id, key, v) => void saveCls(id, key, v)}
            onOpen={(id) => setSel(id)}
            onPeek={(id) => setSel(id)}
            renderCell={(row, col) => {
              const v = String(row[col.key] ?? '')
              if (col.key === 'status') {
                return v ? <span className={`jri-st ${statusKind(v)}`}>{v}</span> : null
              }
              if (col.key === 'issuetype') {
                return v ? (
                  <span className="jri-ty">
                    <i className={`jt ${typeKind(v)}`} aria-hidden="true" />
                    {v}
                  </span>
                ) : null
              }
              if (col.key === 'hwsw') {
                return v ? <span className={`jri-hw ${/hw|하드/i.test(v) ? 'h' : /sw|소프/i.test(v) ? 's' : 'e'}`}>{v}</span> : null
              }
              if (col.key === 'labels') {
                return v
                  ? v.split(',').map((x, i) => (
                      <span key={i} className="jri-lbl">
                        {x.trim()}
                      </span>
                    ))
                  : null
              }
              return undefined
            }}
          />
        </div>
      )}

      {/* 줄을 누르면 그 이슈 — **Releases 와 같은 서랍**이다(지시).
          지라가 렌더한 것을 그대로 낸다: 자세히·설명·첨부·이슈연결·활동.
          지라에 없는 우리 값(분류 다섯)만 extra 로 끼워 넣는다. */}
      {!!sel && (
        <IssueDrawer
          ikey={sel}
          base={jbase}
          onClose={() => setSel('')}
          extra={
            <>
              <h4 className="rls-dh">분류</h4>
              <div className="rls-dmeta">
                {CLS_ROWS.map(([lb, k]) => (
                  <div className="rls-fld" key={k}>
                    <span>{lb}</span>
                    <b>
                      {String((classes[sel] ?? {})[CLS_OF[k] as keyof DefClass] ?? '') || '없음'}
                    </b>
                  </div>
                ))}
              </div>
            </>
          }
        />
      )}
    </div>
  )
}
