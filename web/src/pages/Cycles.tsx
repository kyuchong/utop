import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import CycleReport from '@/components/cycle/CycleReport'
import { IconChevron } from '@/components/icons'
import './Cycles.css'

/** 사이클 한 건 — 목록용 요약(`/api/cycle?meta=1`) */
export interface CycleMeta {
  id: string
  name?: string | null
  customer?: string | null
  model_group?: string | null
  model?: string | null
  version_group?: string | null
  version?: string | null
  assignee?: string | null
  start_date?: string | null
  end_date?: string | null
  _item_count?: number
  _updated_at_pg?: string | null
  items?: CycleItemLite[]
}

/** 항목 요약 — 결과는 저장돼 있지 않고 스텝에서 계산한다 */
export interface CycleItemLite {
  tcid: string
  name?: string | null
  assignee?: string | null
  executed_at?: string | null
  executed_by?: string | null
  executed_auto?: boolean
  issues?: unknown[]
  steps?: Array<{ result?: string | null; manual?: boolean }>
}

export type Verdict = 'pass' | 'fail' | 'wip' | 'none'

/**
 * 항목 하나의 결과.
 *
 * 자료에 항목 결과가 **없다.** 스텝 결과만 있다(Pass 16,328 · Fail 151 ·
 * 빈값 3,283). 그래서 셈해서 만든다.
 *
 *  · 하나라도 Fail → 부적합. 한 군데가 깨지면 그 시험은 깨진 것이다
 *  · 다 Pass → 적합
 *  · 돌다 만 것이 있으면 → 보류. '아직 안 봤다' 를 적합으로 세면 안 된다
 *  · 아무것도 안 돌았으면 → 미실행
 */
export function itemVerdict(it: CycleItemLite): Verdict {
  const steps = it.steps ?? []
  if (!steps.length) return 'none'
  let pass = 0
  let fail = 0
  let blank = 0
  for (const s of steps) {
    const r = String(s.result ?? '').trim().toLowerCase()
    if (r === 'fail') fail++
    else if (r === 'pass') pass++
    else blank++
  }
  if (fail) return 'fail'
  if (!pass) return 'none'
  return blank ? 'wip' : 'pass'
}

const VERDICT_LABEL: Record<Verdict, string> = {
  pass: '적합',
  fail: '부적합',
  wip: '보류',
  none: '미실행',
}

/** 장비 카탈로그의 모델 — 모델그룹의 주인 */
interface CatModel {
  name: string
  model_group?: string | null
}

interface Node {
  key: string
  label: string
  depth: number
  children: Node[]
  /** 잎이면 사이클 하나 */
  cycle?: CycleMeta
  /** 가지가 품은 사이클 수 */
  count: number
  /** 사이클이 아직 없는 빈 폴더인가 */
  empty?: boolean
}

const NO_CAT = '(카탈로그에 없는 모델)'
const NO_GROUP = '(버전그룹 없음)'

/**
 * 트리를 세운다 — 모델그룹 · 모델은 **장비 카탈로그**가 주인.
 *
 * 옛 방식은 사이클을 만들 때 모델명을 자유 입력하게 뒀다. 그래서
 * `E4320-24P_2` 처럼 뒤에 `_2` 가 붙은 것이 생겼고, 사이클 7종 중 5종이
 * 카탈로그에 아예 없다. 카탈로그를 주인으로 삼으면 이런 것이 안 생기고,
 * 이미 생긴 것은 「카탈로그에 없는 모델」 로 모여 눈에 띈다.
 *
 * 버전그룹만 사람이 만든다. R200·R300 은 카탈로그가 알 수 없는, 이 회차
 * 묶음의 이름이라서다. 사이클이 아직 없는 빈 버전그룹도 보여야 해서
 * 폴더 목록을 따로 받는다.
 */
function build(
  cycles: CycleMeta[],
  models: CatModel[],
  folders: Record<string, string[]>,
): Node[] {
  const groupOf = new Map(models.map((m) => [m.name, (m.model_group ?? '').trim()]))

  /** 모델그룹 → 모델 → 버전그룹 → 사이클 */
  const g = new Map<string, Map<string, Map<string, CycleMeta[]>>>()
  const put = (mg: string, model: string, vg: string, c?: CycleMeta) => {
    let a = g.get(mg)
    if (!a) g.set(mg, (a = new Map()))
    let b = a.get(model)
    if (!b) a.set(model, (b = new Map()))
    let arr = b.get(vg)
    if (!arr) b.set(vg, (arr = []))
    if (c) arr.push(c)
  }

  for (const c of cycles) {
    const model = String(c.model ?? '').trim() || '(모델 없음)'
    const known = groupOf.has(model)
    const mg = known ? groupOf.get(model) || '(모델그룹 없음)' : NO_CAT
    put(mg, model, String(c.version_group ?? '').trim() || NO_GROUP, c)
  }
  // 사이클이 아직 없는 버전그룹도 자리를 만든다 — 만들어 놓고 안 보이면
  // 만든 줄 모르고 또 만든다
  for (const [model, arr] of Object.entries(folders)) {
    const mg = groupOf.has(model) ? groupOf.get(model) || '(모델그룹 없음)' : NO_CAT
    for (const vg of arr) put(mg, model, vg)
  }

  const nodes: Node[] = []
  for (const [mg, byModel] of [...g.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ko'))) {
    const mNodes: Node[] = []
    for (const [model, byVg] of [...byModel.entries()].sort((a, b) =>
      a[0].localeCompare(b[0], 'ko'),
    )) {
      const vNodes: Node[] = []
      for (const [vg, list] of [...byVg.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ko'))) {
        vNodes.push({
          key: `${mg}/${model}/${vg}`,
          label: vg,
          depth: 2,
          count: list.length,
          empty: list.length === 0,
          children: list
            .slice()
            .sort((a, b) => String(b.version ?? '').localeCompare(String(a.version ?? ''), 'ko'))
            .map((c) => ({
              key: c.id,
              label: String(c.version ?? '').trim() || c.name || c.id,
              depth: 3,
              count: c._item_count ?? 0,
              children: [],
              cycle: c,
            })),
        })
      }
      mNodes.push({
        key: `${mg}/${model}`,
        label: model,
        depth: 1,
        count: vNodes.reduce((a, n) => a + n.count, 0),
        children: vNodes,
      })
    }
    nodes.push({
      key: mg,
      label: mg,
      depth: 0,
      count: mNodes.reduce((a, n) => a + n.count, 0),
      children: mNodes,
    })
  }
  return nodes
}

export default function Cycles() {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [sel, setSel] = useState('')
  const [q, setQ] = useState('')

  const listQ = useQuery({
    queryKey: ['cycles'],
    queryFn: async () => {
      const r = await apiFetch('/api/cycle?meta=1')
      if (!r.ok) throw new Error('사이클을 불러오지 못했습니다')
      return (await r.json()) as { cycles: CycleMeta[] }
    },
  })

  // 모델그룹·모델의 주인은 장비 카탈로그다
  const catQ = useQuery({
    queryKey: ['device-catalog'],
    queryFn: async () => {
      const r = await apiFetch('/api/device-catalog2')
      if (!r.ok) throw new Error('장비 카탈로그를 불러오지 못했습니다')
      return (await r.json()) as { items: Array<CatModel & { kind: string }> }
    },
    staleTime: 60_000,
  })

  // 버전그룹만 사람이 만드는 폴더. 사이클이 아직 없는 것도 보여야 한다
  const vgQ = useQuery({
    queryKey: ['cycle-version-groups'],
    queryFn: async () => {
      const r = await apiFetch('/api/cycle-version-groups')
      if (!r.ok) throw new Error('버전그룹을 불러오지 못했습니다')
      return (await r.json()) as { groups: Record<string, string[]> }
    },
  })

  const cycles = useMemo(() => listQ.data?.cycles ?? [], [listQ.data])
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    if (!n) return cycles
    return cycles.filter((c) =>
      [c.name, c.model, c.version, c.model_group, c.version_group, c.customer]
        .filter(Boolean)
        .some((x) => String(x).toLowerCase().includes(n)),
    )
  }, [cycles, q])

  const models = useMemo(
    () => (catQ.data?.items ?? []).filter((x) => x.kind === 'model'),
    [catQ.data],
  )
  const tree = useMemo(
    () => build(shown, models, vgQ.data?.groups ?? {}),
    [shown, models, vgQ.data],
  )
  const cur = cycles.find((c) => c.id === sel)

  const toggle = (k: string) =>
    setOpen((s) => {
      const n = new Set(s)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })

  const renderNode = (n: Node): React.ReactNode => {
    const isOpen = open.has(n.key) || !!q.trim()
    const leaf = n.children.length === 0
    return (
      <div key={n.key}>
        <div
          className="cy-node"
          role="button"
          tabIndex={0}
          style={{ paddingLeft: 6 + n.depth * 14 }}
          onClick={() => (n.cycle ? setSel(n.cycle.id) : toggle(n.key))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              if (n.cycle) setSel(n.cycle.id)
              else toggle(n.key)
            }
          }}
        >
          <span className={`cy-caret${isOpen ? ' open' : ''}`}>
            {leaf ? <span className="cy-dot" /> : <IconChevron />}
          </span>
          <span className={`cy-nm${n.cycle?.id === sel ? ' on' : ''}${n.empty ? ' empty' : ''}`}>
            {n.label}
          </span>
          {/* 잎은 항목 수, 가지는 사이클 수 — 뜻이 다르니 제목으로 갈라 둔다 */}
          <span className="cy-cnt" title={n.cycle ? '시험 항목' : '사이클'}>
            {n.count || ''}
          </span>
        </div>
        {isOpen && n.children.map(renderNode)}
      </div>
    )
  }

  return (
    <div className="cy">
      <section className="panel cy-tree">
        <div className="cy-top">
          <b>사이클 {cycles.length}건</b>
        </div>
        <input
          className="cy-q"
          value={q}
          placeholder="모델 · 버전으로 찾기"
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="cy-body">
          {listQ.isLoading ? (
            <div className="empty">불러오는 중…</div>
          ) : tree.length ? (
            tree.map(renderNode)
          ) : (
            <div className="empty">사이클이 없습니다.</div>
          )}
        </div>
      </section>

      <section className="panel cy-main">
        {cur ? <CycleDetail cycle={cur} /> : <div className="empty">왼쪽에서 사이클을 고르세요.</div>}
      </section>
    </div>
  )
}

/** 사이클 한 건 — 항목과 진행 */
function CycleDetail({ cycle }: { cycle: CycleMeta }) {
  const [only, setOnly] = useState<Verdict | ''>('')
  const [report, setReport] = useState(false)

  const items = cycle.items ?? []
  const counts = { pass: 0, fail: 0, wip: 0, none: 0 }
  for (const it of items) counts[itemVerdict(it)]++
  const total = items.length || 1

  const rows = only ? items.filter((it) => itemVerdict(it) === only) : items

  return (
    <div className="cy-detail">
      <div className="cy-head">
        <b>
          {[cycle.model, cycle.version].filter(Boolean).join(' · ') || cycle.name || cycle.id}
        </b>
        <span className="muted small">
          {items.length}건{cycle.assignee ? ` · 담당 ${cycle.assignee}` : ''}
        </span>
        <span className="sp" />
        {/* 결과서는 보고서 화면을 거치지 않는다 — 「버전명 기준으로 사이클이
            끝나면」 이라는 말 그대로 이 회차에서 바로 뽑는다 */}
        <button className="btn small" type="button" onClick={() => setReport(true)}>
          고객사 결과서
        </button>
      </div>

      {report && (
        <CycleReport
          cycleId={cycle.id}
          model={cycle.model}
          version={cycle.version}
          onClose={() => setReport(false)}
        />
      )}

      {/* 한 줄로 지금 어디까지 왔나. 숫자만 늘어놓으면 눈으로 못 센다 */}
      <div className="cy-bar" aria-hidden="true">
        <span className="pass" style={{ flexGrow: counts.pass }} />
        <span className="fail" style={{ flexGrow: counts.fail }} />
        <span className="wip" style={{ flexGrow: counts.wip }} />
        <span className="none" style={{ flexGrow: counts.none }} />
      </div>
      <div className="cy-legend">
        {(['pass', 'fail', 'wip', 'none'] as const).map((k) => (
          <button
            key={k}
            type="button"
            className={`cy-leg ${k}${only === k ? ' on' : ''}`}
            title={only === k ? '전부 보기' : `${VERDICT_LABEL[k]} 만 보기`}
            onClick={() => setOnly(only === k ? '' : k)}
          >
            <b>{counts[k]}</b> {VERDICT_LABEL[k]}
          </button>
        ))}
        <span className="sp" />
        <span className="muted small">{Math.round(((total - counts.none) / total) * 100)}% 진행</span>
      </div>

      <div className="cy-list">
        <div className="cy-row cy-hd">
          <span>시험</span>
          <span>결과</span>
          <span>담당</span>
          <span>실행</span>
          <span>결함</span>
        </div>
        {rows.map((it, i) => {
          const v = itemVerdict(it)
          const steps = it.steps ?? []
          const bad = steps.filter((s) => String(s.result ?? '').toLowerCase() === 'fail').length
          return (
            <div className={`cy-row v-${v}`} key={`${it.tcid}-${i}`}>
              <span className="cy-tc" title={it.tcid}>
                {it.name || it.tcid}
                {steps.length > 0 && (
                  <i className="cy-steps">
                    {bad ? `${steps.length}단계 중 ${bad} 부적합` : `${steps.length}단계`}
                  </i>
                )}
              </span>
              <span className={`cy-v ${v}`}>{VERDICT_LABEL[v]}</span>
              <span className="muted">{it.assignee || it.executed_by || '–'}</span>
              <span className="muted small">
                {it.executed_at ? it.executed_at.slice(5, 16) : '–'}
                {it.executed_auto && <b title="자동으로 돌았습니다"> ⚡</b>}
              </span>
              <span className="muted">{(it.issues?.length ?? 0) || '–'}</span>
            </div>
          )
        })}
        {rows.length === 0 && <div className="empty">해당하는 항목이 없습니다.</div>}
      </div>
    </div>
  )
}
