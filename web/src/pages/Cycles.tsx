import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import ListHead from '@/components/ListHead'
import Resizer, { useResizableWidth } from '@/components/Resizer'
import { goto } from '@/api/goto'
import CycleEdit from '@/components/cycle/CycleEdit'
import CycleReport from '@/components/cycle/CycleReport'
import StepCards from '@/components/cycle/StepCards'
import CycleItemEdit from '@/components/cycle/CycleItemEdit'
import CycleInsight from '@/components/cycle/CycleInsight'
import DefectDialog, { type DefectRec } from '@/components/cycle/DefectDialog'
import { useCycleRun } from '@/components/cycle/useCycleRun'
import { useMultiSelect } from '@/components/useMultiSelect'
import { IconChevron, IconFolder, IconPanel } from '@/components/icons'
import type { TestCaseMeta } from '@/types'
import { stepVerdict, type StepRound, type TcStep } from '@/components/tc/types'
// 요구사항 화면의 트리 규칙을 그대로 쓴다 — 줄 높이·색·여백이 한 곳에서만
// 정해져야 세 화면이 같아 보인다.
import '@/components/ReqTree.css'
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
  req_id?: string | null
  /** 사람이 손으로 정한 결과. 있으면 스텝 집계보다 이것이 이긴다 */
  result?: string | null
  name?: string | null
  assignee?: string | null
  executed_at?: string | null
  executed_by?: string | null
  executed_auto?: boolean
  /** 이 회차에만 남기는 한 줄 메모 (Zephyr 의 Notes) */
  note?: string | null
  issues?: unknown[]
  steps?: CycleStep[]
}

/** 스텝 한 줄 — 실행하고 나면 output·result 가 채워진다 */
export interface CycleStep {
  desc?: string | null
  cli?: string | null
  action?: string | null
  criteria?: string | null
  type?: string | null
  result?: string | null
  output?: string | null
  waitSec?: number | null
  executed_at?: string | null
  /** 왜 그렇게 판정했나. 실행기가 적어 두는데 화면에 안 나오고 있었다 */
  reason?: string | null
  /** 얼마나 걸렸나 (밀리초) */
  took_ms?: number | null
  /** 반복 안이면 회차마다의 결과 */
  rounds?: StepRound[] | null
  /**
   * Manual 스텝은 다른 칸을 쓴다 — 사람이 읽는 시험서라서.
   * `step`(무엇을 하나) · `data`(Test Data) · `expected`(나와야 하는 것),
   * 그리고 **사진**. 카드가 desc·cli·criteria 만 읽어서 수동 스텝이
   * 통째로 비어 보였다.
   */
  step?: string | null
  data?: string | null
  expected?: string | null
  data_img?: string | null
  expected_img?: string | null
  expected_img_w?: number | null
  /** Diff — 견줄 두 값이 곧 판정 기준이다 */
  kind?: string | null
  cmpLeft?: string | null
  cmpOp?: string | null
  cmpRight?: string | null
  /** 실행기가 적는 판정. 옛 자료의 result 와 다르다 */
  status?: string | null
  repeatResult?: string | null
  /** 수동 시험 ACTUAL DATA — 시험자가 붙이는 결과 화면·글 */
  actual_img?: string | null
  actual_txt?: string | null
  manual?: boolean
}

/**
 * 항목 하나의 결과.
 *
 * 옛 화면(`cycleItemStatus`)의 규칙을 그대로 옮겼다. 처음엔 내가 임의로
 * 적합/부적합/보류/미실행 넷으로 줄여 놨는데, 실제로는 여섯 가지고 무엇보다
 * **수동 스텝을 빼고 센다** — 사람이 눈으로 보는 것은 사람이 따로 적는다.
 *
 *  · 자동 스텝이 하나도 없으면 → 스텝 자체가 없으면 미실행, 있으면 제외
 *  · 하나라도 Fail → Fail. 한 군데가 깨지면 그 시험은 깨진 것이다
 *  · Fail 없고 Pass 있으면 → Pass (제외가 섞여 있어도)
 *  · 둘 다 없으면 → 그중 아무 값(WIP·Blocked·진행불가)
 */
export type Verdict = 'Pass' | 'Fail' | 'WIP' | 'Blocked' | '진행불가' | ''

/** 사람이 직접 고를 수 있는 값. 옛 `DEFAULT_RESULT_STATUSES` 와 같다 */
export const RESULTS: Array<{ v: Verdict; label: string; cls: string }> = [
  { v: 'Pass', label: 'Pass', cls: 'pass' },
  { v: 'Fail', label: 'Fail', cls: 'fail' },
  { v: 'WIP', label: 'WIP', cls: 'wip' },
  { v: 'Blocked', label: 'Blocked', cls: 'blocked' },
  { v: '진행불가', label: '진행불가', cls: 'na' },
  { v: '', label: '미실행', cls: 'none' },
]

const CLS: Record<string, string> = {
  Pass: 'pass',
  Fail: 'fail',
  WIP: 'wip',
  Blocked: 'blocked',
  진행불가: 'na',
  '': 'none',
}

export const verdictClass = (v: Verdict) => CLS[v] ?? 'none'
export const verdictLabel = (v: Verdict) => (v === '' ? '미실행' : v)

const isFail = (r: string) => r === 'Fail' || r === '불합격'
const isPass = (r: string) => r === 'Pass' || r === '합격'

export function itemVerdict(it: CycleItemLite): Verdict {
  // 사람이 손으로 정한 값이 이긴다. '미실행' 은 표식이다 — 빈 값('')은
  // 「덮어쓴 것 없음」 이라 스텝에서 다시 계산되므로, 「강제 미실행」 을
  // 이 문자열로 구분해서 저장한다(표시할 때는 다시 '' 로 돌린다).
  if (it.result === '미실행') return ''
  if (it.result) return it.result as Verdict
  const steps = it.steps ?? []
  // 수동 스텝은 자동 판정에서 뺀다
  const auto = steps.filter((s) => !(s.manual || s.action === '수동'))
  if (!auto.length) return steps.length ? '진행불가' : ''
  // 스텝 판정은 한 곳에서만 읽는다(types.ts) — 실행기는 status·repeatResult 에
  // 적고 옛 자료는 result 에 있다
  if (auto.length === 1) return (stepVerdict(auto[0] as TcStep) as Verdict) || ''
  if (auto.some((s) => isFail(stepVerdict(s as TcStep)))) return 'Fail'
  if (auto.some((s) => isPass(stepVerdict(s as TcStep)))) return 'Pass'
  const mixed = auto.find((s) => {
    const v = stepVerdict(s as TcStep)
    return v && !isPass(v)
  })
  return ((mixed ? stepVerdict(mixed as TcStep) : '') as Verdict) || ''
}

/**
 * 이 항목이 **왜** 깨졌나 — 처음 깨진 스텝과 그 근거.
 *
 * 전에는 「3단계 중 1 부적합」 까지만 보였다. 그래서 무엇이 왜 깨졌는지
 * 알려면 항목을 열고 스텝을 하나씩 눌러 들어가야 했다. 64건짜리 사이클에서
 * 깨진 것이 다섯이면 그 짓을 다섯 번 한다.
 *
 * 처음 깨진 것만 본다. 앞이 깨지면 뒤는 대개 그 여파라 나열해 봐야
 * 원인이 묻힌다 — 고칠 곳은 첫 번째다.
 */
export function firstFail(steps: CycleStep[]): { at: number; reason: string } | null {
  for (let i = 0; i < steps.length; i++) {
    const st = steps[i]
    if (!st || st.manual || st.action === '수동') continue
    if (!isFail(stepVerdict(st as TcStep))) continue
    // 근거가 없으면 출력 첫 줄이라도 — 아무것도 없는 것보다 낫다
    const why =
      String(st.reason ?? '').trim() ||
      String(st.output ?? '').trim().split(/\r?\n/)[0] ||
      ''
    return { at: i, reason: why }
  }
  return null
}

/**
 * 이 항목이 사람이 할 일인가 장비가 할 일인가.
 *
 * Manual 만 있는 시험을 자동으로 돌린 줄 알고 「왜 안 돌았지」 하는 일이
 * 있었다. 스텝을 열어 보기 전에 목록에서 갈려야 한다.
 */
function kindOf(steps: CycleStep[]): 'manual' | 'auto' | 'mixed' | '' {
  if (!steps.length) return ''
  let m = 0
  let a = 0
  for (const s of steps) {
    if (s.kind === 'manual' || s.manual || s.action === '수동') m++
    else if (s.kind === 'comment' || s.kind === 'message') continue
    else a++
  }
  if (m && a) return 'mixed'
  if (m) return 'manual'
  return a ? 'auto' : ''
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
  /** 폴더 종류 — 버전그룹만 사람이 만든 것이라 지울 수 있다 */
  kind?: 'mgroup' | 'model' | 'vgroup'
  /** 버전그룹 폴더가 매달린 모델·그룹 이름 (폴더를 지울 때 KV 에서 뺀다) */
  model?: string
  vgroup?: string
}

/** 보던 자리를 기억한다 — 화면 이름은 App 이, 그 안은 여기가 */
const CY_SEL_KEY = 'utop.cycle.sel'
const CY_OPEN_KEY = 'utop.cycle.open'

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
          kind: 'vgroup',
          model,
          vgroup: vg,
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
        kind: 'model',
        model,
        count: vNodes.reduce((a, n) => a + n.count, 0),
        children: vNodes,
      })
    }
    nodes.push({
      key: mg,
      label: mg,
      depth: 0,
      kind: 'mgroup',
      count: mNodes.reduce((a, n) => a + n.count, 0),
      children: mNodes,
    })
  }
  return nodes
}

export default function Cycles() {
  /**
   * 새로고침해도 보던 자리로 돌아온다.
   *
   * TC 화면은 이미 그렇게 하는데(`utop.tc.open`) 사이클만 안 하고 있었다.
   * 새로고침하면 트리가 통째로 접히고 「왼쪽에서 사이클을 고르세요」 로
   * 튕겨서, 64건짜리를 보다가 매번 다시 찾아 들어가야 했다.
   */
  const [open, setOpen] = useState<Set<string>>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(CY_OPEN_KEY) || '[]') as string[]
      return new Set(Array.isArray(v) ? v : [])
    } catch {
      return new Set()
    }
  })
  useEffect(() => {
    localStorage.setItem(CY_OPEN_KEY, JSON.stringify([...open]))
  }, [open])
  const qc = useQueryClient()
  const [making, setMaking] = useState(false)
  /** 우클릭 메뉴 — 어느 사이클 위에서, 화면 어디에 */
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  /** 폴더 우클릭 메뉴 — 폴더째 지우거나, 그 안 사이클을 한꺼번에 지운다 */
  const [folderMenu, setFolderMenu] = useState<{ node: Node; x: number; y: number } | null>(null)
  /** 고칠 사이클 */
  const [editId, setEditId] = useState('')
  /** 말로 찾은 결과 — 만들기 창에 미리 채워 넣는다 */
  const [ask, setAsk] = useState<{ model: string; tcs: Array<{ tcid: string; name?: string | null; req_id?: string | null }> } | null>(null)
  /**
   * 1열을 접어 뒀나 — TC 화면과 같은 규칙.
   *
   * 64건짜리 사이클의 항목과 스텝을 들여다볼 때는 트리가 자리만 먹는다.
   */
  const [treeOpen, setTreeOpen] = useState(
    () => localStorage.getItem('utop.cycle.treeOpen') !== '0',
  )
  /**
   * 보기 — detail(항목 + 스텝 세부) · list(항목 표만 넓게).
   *
   * 요구사항·TC 화면과 같은 토글이다. Detail 이 지금까지의 화면이고,
   * List 는 스텝 칸을 접어 표를 넓게 쓴다 — 결과를 훑고 일괄로 고칠 때.
   */
  const [view, setView] = useState<'list' | 'detail'>(
    () => (localStorage.getItem('utop.cycle.view') === 'list' ? 'list' : 'detail'),
  )
  useEffect(() => {
    localStorage.setItem('utop.cycle.view', view)
  }, [view])
  /** 1열 폭 — 끌어서 바꾼다. TC 화면과 같은 부품을 쓴다 */
  const splitRef = useRef<HTMLDivElement>(null)
  const [treeW, setTreeW] = useResizableWidth('utop.cycle.treeW', 250, 170, 460)
  useEffect(() => {
    localStorage.setItem('utop.cycle.treeOpen', treeOpen ? '1' : '0')
  }, [treeOpen])

  const [sel, setSel] = useState(() => localStorage.getItem(CY_SEL_KEY) || '')
  useEffect(() => {
    localStorage.setItem(CY_SEL_KEY, sel)
  }, [sel])
  const [q, setQ] = useState('')

  /**
   * 지금 도는 실행 — 사이클을 안 열어 봐도 알아야 한다.
   *
   * 실행이 서버에서 도니 내 창에서 시작한 것이 아닐 수 있다. 트리에
   * 표시가 없으면 남이 돌리는 사이클을 열어서 또 걸게 된다 — 그러면
   * 「이미 돌고 있습니다」 로 막히고 나서야 안다.
   */
  const runsQ = useQuery({
    queryKey: ['runs', 'active'],
    queryFn: async () => {
      const r = await apiFetch('/api/runs?active=1')
      if (!r.ok) throw new Error('실행을 불러오지 못했습니다')
      return (await r.json()) as { runs: { cycle_id: string; started_by?: string | null }[] }
    },
    // WebSocket 이 알려 주지만, 놓쳤을 때를 대비해 가끔 물어본다
    refetchInterval: 30_000,
  })
  const running = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of runsQ.data?.runs ?? []) m.set(r.cycle_id, r.started_by || '누군가')
    return m
  }, [runsQ.data])

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

  /** 이 폴더(가지) 아래 사이클 id 를 모두 모은다 — 한꺼번에 지우려고 */
  const cycleIdsUnder = (n: Node): string[] =>
    n.cycle ? [n.cycle.id] : n.children.flatMap(cycleIdsUnder)

  /** 사이클 여러 개를 한꺼번에 지운다 */
  const deleteCycles = async (ids: string[]): Promise<boolean> => {
    let ok = true
    for (const id of ids) {
      try {
        const r = await apiFetch(`/api/cycle/${encodeURIComponent(id)}`, { method: 'DELETE' })
        if (!r.ok) ok = false
      } catch {
        ok = false
      }
    }
    if (sel && ids.includes(sel)) setSel('')
    await listQ.refetch()
    return ok
  }

  /** 폴더 아래 사이클을 모두 지운다(폴더 자체는 둔다) */
  const deleteFolderCycles = async (n: Node) => {
    const ids = cycleIdsUnder(n)
    if (!ids.length) return
    if (!window.confirm(`「${n.label}」 아래 사이클 ${ids.length}건을 지웁니다.\n각 회차의 실행 결과도 함께 사라집니다.`)) return
    const ok = await deleteCycles(ids)
    if (!ok) window.alert('일부를 지우지 못했습니다.')
  }

  /** 버전그룹 폴더를 지운다 — 그 안 사이클까지 함께, 그리고 폴더 목록에서도 뺀다 */
  const deleteFolder = async (n: Node) => {
    if (n.kind !== 'vgroup' || !n.model || !n.vgroup) return
    const ids = cycleIdsUnder(n)
    const msg = ids.length
      ? `버전그룹 폴더 「${n.label}」 을 지웁니다.\n그 안 사이클 ${ids.length}건과 실행 결과도 함께 사라집니다.`
      : `빈 버전그룹 폴더 「${n.label}」 을 지웁니다.`
    if (!window.confirm(msg)) return
    if (ids.length) await deleteCycles(ids)
    // 폴더 목록(KV)에서도 이 버전그룹을 뺀다 — 안 그러면 빈 폴더로 되살아난다
    try {
      const cur = (vgQ.data?.groups ?? {}) as Record<string, string[]>
      const next: Record<string, string[]> = { ...cur }
      next[n.model] = (next[n.model] ?? []).filter((g) => g !== n.vgroup)
      await apiFetch('/api/cycle-version-groups', {
        method: 'POST',
        body: JSON.stringify({ groups: next }),
      })
      await vgQ.refetch()
    } catch {
      window.alert('폴더 목록을 갱신하지 못했습니다.')
    }
  }

  const renderNode = (n: Node): React.ReactNode => {
    const isOpen = open.has(n.key) || !!q.trim()
    const leaf = n.children.length === 0
    return (
      <div key={n.key}>
        <div
          className={`${n.cycle ? 'rt-req' : 'rt-fold'} cy-node${
            n.cycle?.id === sel ? ' on' : ''
          }${!n.cycle && n.depth === 0 ? ' rt-top' : ''}`}
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
          onContextMenu={(e) => {
            e.preventDefault()
            if (n.cycle) {
              setSel(n.cycle.id)
              setMenu({ id: n.cycle.id, x: e.clientX, y: e.clientY })
            } else {
              // 폴더 — 폴더째 지우거나 그 안 사이클을 한꺼번에 지운다
              setFolderMenu({ node: n, x: e.clientX, y: e.clientY })
            }
          }}
        >
          <span className={`rt-caret${isOpen ? ' open' : ''}`}>
            {leaf ? <span className="rt-dot" /> : <IconChevron />}
          </span>
          {/* 모델그룹 · 모델 · 버전그룹은 폴더, 버전(사이클)은 항목 */}
          {!leaf && (
            <span className="rt-ficon" aria-hidden="true">
              <IconFolder open={isOpen} />
            </span>
          )}
          <span className={`${n.cycle ? 'rt-title' : 'rt-fname'} cy-nm${n.empty ? ' empty' : ''}`}>
            {n.label}
          </span>
          {/* 지금 누가 돌리고 있나.
              실행이 서버에서 도니 내 창에서 시작한 것이 아닐 수 있다.
              표시가 없으면 남이 돌리는 사이클을 열어 또 걸게 된다. */}
          {n.cycle && running.has(n.cycle.id) && (
            <span className="cy-runmark" title={`${running.get(n.cycle.id)} 님이 돌리는 중`}>
              ● {running.get(n.cycle.id)}
            </span>
          )}
          {/* 잎은 항목 수, 가지는 사이클 수 — 뜻이 다르니 제목으로 갈라 둔다 */}
          <span className="rt-cnt" title={n.cycle ? '시험 항목' : '사이클'}>
            {n.count || ''}
          </span>
        </div>
        {isOpen && n.children.map(renderNode)}
      </div>
    )
  }

  /** 빵부스러기에 적을 길 — 모델그룹 › 모델 › 버전그룹 › 버전 */
  const crumbs = useMemo(() => {
    if (!cur) return []
    const g = new Map(models.map((m) => [m.name, (m.model_group ?? '').trim()]))
    const model = String(cur.model ?? '').trim()
    return [g.get(model) || '', model, String(cur.version_group ?? '').trim()].filter(Boolean)
  }, [cur, models])

  return (
    // 요구사항·TC 화면과 **같은 뼈대**를 쓴다. 세 화면을 오가는 사람이
    // 매번 「여긴 어디가 목록이지」 를 다시 찾지 않게.
    <>
      {/* 맨 위 줄 — 지금 어디를 보고 있나. 요구사항·TC 화면(.rq-bar)과
          같은 자리·같은 모양이다. */}
      <div className="rq-bar">
        <span className="rq-crumb">
          <span className="muted">사이클</span>
          {crumbs.map((c) => (
            <span key={c}>
              <span className="rq-crumb-sep">›</span>
              <span className="muted">{c}</span>
            </span>
          ))}
          {cur && (
            <>
              <span className="rq-crumb-sep">›</span>
              <b>{String(cur.version ?? '').trim() || cur.name || cur.id}</b>
            </>
          )}
          <span className="muted small">
            {cur ? `${cur._item_count ?? 0}건` : '왼쪽에서 사이클을 고르세요'}
          </span>
        </span>
        <span className="sp" />
        {/* Detail = 항목 + 스텝 세부(지금 화면), List = 항목 표만 넓게.
            요구사항·TC 와 같은 토글이다. */}
        <div className="rq-view" role="tablist" aria-label="보기 방식">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'detail'}
            className={`rq-view-b${view === 'detail' ? ' on' : ''}`}
            title="항목과 스텝 세부를 함께 봅니다"
            onClick={() => setView('detail')}
          >
            Detail
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'list'}
            className={`rq-view-b${view === 'list' ? ' on' : ''}`}
            title="항목 표만 넓게 봅니다"
            onClick={() => setView('list')}
          >
            List
          </button>
        </div>
      </div>

    <div className="split cy" ref={splitRef}>
      {/* 접었을 때 — 세로 띠 하나만 남는다. TC 화면과 같은 모양이다.
          아주 없애면 다시 펼 길이 없어지고 어디에 있었는지도 잊는다. */}
      {!treeOpen && (
        <button
          type="button"
          className="tc-fold"
          title="사이클 펼치기"
          onClick={() => setTreeOpen(true)}
        >
          <IconPanel open />
          <span className="tc-fold-t">사이클 {cycles.length}</span>
        </button>
      )}
      {treeOpen && (
      <section className="panel cy-tree" style={{ flexBasis: treeW }}>
        <ListHead
          name="사이클"
          count={cycles.length}
          onCollapse={() => setTreeOpen(false)}
          search={{ value: q, placeholder: '모델 · 버전으로 찾기', onChange: setQ }}
          add={{ title: '사이클 만들기', onClick: () => setMaking(true) }}
          menu={
            <>
              <button type="button" onClick={() => setMaking(true)}>
                사이클 만들기
              </button>
              <button type="button" disabled={!sel} onClick={() => sel && setEditId(sel)}>
                선택 사이클 편집
              </button>
              <hr />
              <button type="button" onClick={() => void listQ.refetch()}>
                다시 읽기
              </button>
            </>
          }
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
      )}

      {/* 1열 ↔ 나머지. TC 화면과 같은 손잡이를 쓴다 */}
      {treeOpen && (
        <Resizer
          label="사이클 목록 폭 조절"
          onResize={setTreeW}
          getOrigin={() => splitRef.current?.getBoundingClientRect().left ?? 0}
        />
      )}

      {menu && (
        <CycleMenu
          at={menu}
          cycle={cycles.find((c) => c.id === menu.id)}
          onClose={() => setMenu(null)}
          onChanged={() => {
            setMenu(null)
            void listQ.refetch()
          }}
          onEdit={(id) => {
            setMenu(null)
            setEditId(id)
          }}
        />
      )}

      {folderMenu && (
        <FolderMenu
          at={folderMenu}
          onClose={() => setFolderMenu(null)}
          onDeleteCycles={() => {
            const n = folderMenu.node
            setFolderMenu(null)
            void deleteFolderCycles(n)
          }}
          onDeleteFolder={() => {
            const n = folderMenu.node
            setFolderMenu(null)
            void deleteFolder(n)
          }}
        />
      )}

      {/* 만들기와 고치기가 같은 창이다. 다르게 만들면 「만들 때는 되는데
          고칠 때는 안 되는 것」 이 반드시 생긴다. */}
      {(making || editId) && (
        <CycleEdit
          cycleId={editId || undefined}
          folders={vgQ.data?.groups ?? {}}
          preset={ask ?? undefined}
          onClose={() => {
            setMaking(false)
            setEditId('')
            setAsk(null)
          }}
          onDone={(id) => {
            setMaking(false)
            setEditId('')
            setAsk(null)
            setSel(id)
            void listQ.refetch()
            void vgQ.refetch()
            void qc.invalidateQueries({ queryKey: ['cycle-full', id] })
          }}
        />
      )}

      <section className="panel cy-main">
        {cur ? (
          <CycleDetail cycle={cur} view={view} onSaved={() => void listQ.refetch()} />
        ) : (
          <div className="empty">왼쪽에서 사이클을 고르세요.</div>
        )}
      </section>
    </div>
    </>
  )
}

/** 사이클 한 건 — 항목과 진행 */
function CycleDetail({
  cycle,
  view,
  onSaved,
}: {
  cycle: CycleMeta
  /** list = 표만 넓게 · detail = 표 + 스텝 세부 */
  view: 'list' | 'detail'
  onSaved: () => void
}) {
  /** 걸러 보기. null 이면 전부 — '' 는 「미실행」 이라는 뜻이라 못 쓴다 */
  const [only, setOnly] = useState<Verdict | null>(null)
  const [report, setReport] = useState(false)
  /** 고른 항목 — 누르면 스텝과 실행 내역이 아래에 열린다 */
  const [openItem, setOpenItem] = useState(-1)
  /*
   * 목록(`?meta=1`)이 주는 항목은 **요약본**이다. 스텝에서 `cli`·`output`·
   * `criteria` 가 떨어져 나가 있어서
   *
   *   · 스텝 세부에 명령도 출력도 안 보이고
   *   · 그걸 되저장하면 **실행 결과가 통째로 날아간다**
   *
   * 그래서 사이클을 고르면 온전한 것을 한 번 더 읽는다. 트리·집계는
   * 요약본으로 충분하지만 여기서는 아니다.
   */
  const fullQ = useQuery({
    queryKey: ['cycle-full', cycle.id],
    queryFn: async () => {
      const r = await apiFetch(`/api/cycle/${encodeURIComponent(cycle.id)}`)
      if (!r.ok) throw new Error('사이클을 불러오지 못했습니다')
      return (await r.json()) as { items?: CycleItemLite[] }
    },
  })
  /**
   * 돌리거나 뺄 항목.
   *
   * 줄마다 네모를 두는 대신 **Ctrl·Shift** 로 고른다 — 파일 탐색기·iTest 와
   * 같은 규칙이라 손이 이미 아는 방식이다.
   */
  const sel = useMultiSelect<number>()
  const pick = sel.picked
  const { st, run, stop } = useCycleRun(cycle.id)
  /**
   * 도는 항목을 따라갈까.
   *
   * 실행을 걸면 켜지고, 도는 중에 다른 항목을 누르면 꺼진다.
   */
  const [follow, setFollow] = useState(true)

  /**
   * 실행을 건다. 여기서 돌리지 않는다 — 줄에 걸어 놓고 손을 뗀다.
   * 창을 닫아도 실행 서버가 계속 돌린다.
   */
  const startRun = (idxs: number[]) => {
    setFollow(true)
    void run(idxs).then((err) => {
      if (err) window.alert(err)
    })
  }

  /** 3열(스텝 세부) 폭 — 끌어서 바꾼다 */
  const colsRef = useRef<HTMLDivElement>(null)
  const [sideW, setSideW] = useResizableWidth('utop.cycle.sideW2', 760, 320, 1400)

  /**
   * 지금 열어 둔 항목에 걸린 결함. 「결함 등록」 을 「결함 봄」 으로 가른다.
   * 항목 하나에 결함 하나다.
   */
  const [itemDefect, setItemDefect] = useState<DefectRec | null>(null)
  /** 결함 등록 창을 연 항목(없으면 안 뜬다) */
  const [defectFor, setDefectFor] = useState<CycleItemLite | null>(null)
  const loadItemDefect = async (tcid: string) => {
    if (!tcid) { setItemDefect(null); return }
    try {
      const r = await apiFetch(`/api/defects/for-item?cycle_id=${encodeURIComponent(cycle.id)}&tcid=${encodeURIComponent(tcid)}`)
      const j = (await r.json()) as { defect: DefectRec | null }
      setItemDefect(j.defect ?? null)
    } catch {
      setItemDefect(null)
    }
  }
  /** 항목 추가 창 */
  const [adding, setAdding] = useState(false)
  /** 고치는 항목들 — 한 건이면 Edit, 여럿이면 Bulk Edit (같은 창) */
  const [editing, setEditing] = useState<CycleItemLite[] | null>(null)
  /** 회차를 놓고 보는 창 — AI 요약 · 메트릭스 */
  const [insight, setInsight] = useState<'ai' | 'metrics' | null>(null)
  const [saving, setSaving] = useState(false)

  /**
   * 항목을 넣고 뺀다.
   *
   * 사이클을 만들 때만 고를 수 있으면, 시험 하나를 빠뜨렸을 때 사이클을
   * 다시 만들어야 한다. 그러면 이미 돌린 결과가 통째로 날아간다.
   */
  /** 항목 결과를 손으로 정한다 */
  const setResult = (tcid: string, result: string) =>
    saveItems((cur) => cur.map((x) => (x.tcid === tcid ? { ...x, result } : x)))

  /**
   * 고른 항목(없으면 전체)을 CSV 로 — 요구사항·시험항목의 Export 와 같다.
   * 결과서(고객사용 슬라이드)와는 쓰임이 다르다. 이쪽은 자료다.
   */
  const exportItems = () => {
    const rows = pick.size ? [...pick].map((i) => items[i]!).filter(Boolean) : items
    if (!rows.length) return
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [
      ['TC ID', '시험', '결과', '담당', '메모', '실행'].map(esc).join(','),
      ...rows.map((it) =>
        [
          it.tcid,
          it.name ?? '',
          verdictLabel(itemVerdict(it)),
          it.assignee || it.executed_by || '',
          it.note ?? '',
          it.executed_at ?? '',
        ]
          .map(esc)
          .join(','),
      ),
    ].join('\r\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `사이클_${[cycle.model, cycle.version].filter(Boolean).join('_') || cycle.id}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }


  /**
   * 고른 항목의 결과를 한꺼번에 바꾼다 (Zephyr 의 Change Bulk Status).
   *
   * 수동 시험 스무 건을 돌리고 나서 하나씩 드롭다운을 여는 것은 일이 아니다.
   */
  const setResultMany = (result: string) => {
    const ids = new Set([...pick].map((i) => items[i]?.tcid).filter(Boolean))
    if (!ids.size) return
    return saveItems((cur) =>
      cur.map((x) => (ids.has(x.tcid) ? { ...x, result } : x)),
    )
  }

  /**
   * 스텝 하나의 결과를 손으로 정한다.
   *
   * 자동 판정이 늘 맞지는 않는다 — 장비가 이상한 응답을 냈는데 판정
   * 기준이 느슨해서 통과하거나, 반대로 사람 눈에는 맞는데 문구 한 글자가
   * 달라 깨지기도 한다. 그때 고칠 수 있어야 결과서가 사실이 된다.
   *
   * `result` 에 적는다. 옛 자료와 같은 칸이고, `stepVerdict` 가 그것을
   * 자동 판정보다 먼저 본다 — 사람이 적은 것이 이긴다.
   */
  const setStepResult = (tcid: string, at: number, result: string) =>
    setStepField(tcid, at, { result })

  /** 스텝 하나의 아무 칸이나 저장한다 (결과·수동 ACTUAL 등) */
  const setStepField = (tcid: string, at: number, patch: Partial<CycleStep>) =>
    saveItems((cur) =>
      cur.map((x) =>
        x.tcid === tcid
          ? { ...x, steps: (x.steps ?? []).map((sx, j) => (j === at ? { ...sx, ...patch } : sx)) }
          : x,
      ),
    )

  /** 수동 ACTUAL DATA 에 붙인 사진을 올리고 URL 을 저장한다 */
  const setStepImg = async (tcid: string, at: number, file: File) => {
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await apiFetch('/api/upload/image', { method: 'POST', body: fd })
      const b = (await r.json().catch(() => ({}))) as { url?: string; name?: string; detail?: string }
      if (!r.ok) throw new Error(b.detail || '사진을 올리지 못했습니다')
      await setStepField(tcid, at, { actual_img: b.url || b.name })
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e))
    }
  }

  const saveItems = async (edit: (cur: CycleItemLite[]) => CycleItemLite[]) => {
    setSaving(true)
    try {
      // 저장 직전에 온전한 것을 다시 읽는다. 화면에 들고 있던 것으로
      // 덮으면, 그 사이에 남이 돌린 결과를 지운다.
      const r = await apiFetch(`/api/cycle/${encodeURIComponent(cycle.id)}`)
      if (!r.ok) throw new Error(String(r.status))
      const full = (await r.json()) as Record<string, unknown>
      const cur = Array.isArray(full.items) ? (full.items as CycleItemLite[]) : []
      const w = await apiFetch(`/api/cycle/${encodeURIComponent(cycle.id)}`, {
        method: 'POST',
        body: JSON.stringify({ ...full, id: cycle.id, items: edit(cur) }),
      })
      if (!w.ok) throw new Error(String(w.status))
      // 온전한 것과 목록 요약을 둘 다 다시 읽는다. 요약만 두면 트리의
      // 숫자가 안 맞고, 온전한 것만 두면 방금 넣은 항목이 목록에 안 뜬다
      await fullQ.refetch()
      onSaved()
    } catch (e) {
      window.alert(e instanceof Error ? `저장하지 못했습니다 — ${e.message}` : '저장하지 못했습니다')
    } finally {
      setSaving(false)
    }
  }

  const items = fullQ.data?.items ?? cycle.items ?? []
  const counts: Record<string, number> = {}
  for (const r of RESULTS) counts[r.v] = 0
  for (const it of items) counts[itemVerdict(it)] = (counts[itemVerdict(it)] ?? 0) + 1
  const total = items.length || 1

  const rows = only !== null ? items.filter((it) => itemVerdict(it) === only) : items

  /*
   * 실행 중에는 **도는 항목**을 따라간다.
   *
   * 전에는 항목을 하나라도 열어 두면 안 따라갔다. 「보던 것을 빼앗지
   * 않는다」 는 뜻이었는데, 실제로는 사람들이 늘 무언가 열어 둔 채로
   * 실행을 걸어서 결국 **한 번도 안 따라갔다.** 66항목을 도는 동안 손으로
   * 쫓아 눌러야 했다.
   *
   * 그래서 기본이 따라가기다. 도는 중에 다른 항목을 **일부러 누르면**
   * 그때부터 따라가기를 끈다 — 보려고 누른 것을 빼앗지는 않는다.
   */
  const followAt = st.on && follow ? st.itemAt : openItem
  const cur = followAt >= 0 ? items[followAt] : undefined
  /** 지금 도는 항목이면 저장된 스텝 대신 받는 중인 것을 보여 준다 */
  const liveNow = st.on && followAt === st.itemAt && st.liveSteps.length > 0

  // 열어 둔 항목이 바뀌면 그 항목의 결함을 읽어 단추를 「등록/봄」 으로 가른다
  useEffect(() => {
    void loadItemDefect(cur?.tcid ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.tcid, cycle.id])

  return (
    <div className="cy-detail">
      {/* ② 공통 액션 바 — 요구사항·시험항목과 **같은 차례**.
          Edit·Bulk Edit | Add·Delete·Export. 세 화면을 오가는 사람이 매번
          어디에 무엇이 있는지 다시 찾지 않게. */}
      <div className="cy-head">
        <div className="rq-actions">
          <button
            className="btn"
            type="button"
            disabled={pick.size !== 1}
            title={pick.size === 1 ? '고른 항목을 고칩니다' : '한 건만 골랐을 때 켜집니다'}
            onClick={() => setEditing([...pick].map((i) => items[i]!).filter(Boolean))}
          >
            Edit
          </button>
          <button
            className="btn"
            type="button"
            disabled={pick.size < 2}
            title={
              pick.size >= 2
                ? `고른 ${pick.size}건의 결과·담당자·메모를 한꺼번에 고칩니다`
                : '둘 이상 골랐을 때 켜집니다'
            }
            onClick={() => setEditing([...pick].map((i) => items[i]!).filter(Boolean))}
          >
            Bulk Edit
          </button>
          <span className="rq-adiv" aria-hidden="true" />
          <button className="btn" type="button" onClick={() => setAdding(true)}>
            Add
          </button>
          <button
            className="btn danger"
            type="button"
            disabled={!pick.size || saving || st.on}
            onClick={() => {
              if (!window.confirm(`고른 ${pick.size}건을 이 사이클에서 뺍니다.`)) return
              // 자리 번호가 아니라 tcid 로 뺀다 — 걸러 보고 있으면 번호가
              // 어긋나서 엉뚱한 것이 빠진다
              const ids = new Set([...pick].map((i) => items[i]?.tcid).filter(Boolean))
              void saveItems((cur) => cur.filter((x) => !ids.has(x.tcid))).then(sel.clear)
            }}
          >
            Delete{pick.size ? ` (${pick.size})` : ''}
          </button>
          <button
            className="btn"
            type="button"
            disabled={!items.length}
            title={pick.size ? '고른 것만 내보냅니다' : '이 사이클 전체를 내보냅니다'}
            onClick={exportItems}
          >
            Export
          </button>
          <button
            className="btn"
            type="button"
            title="고객사 양식 슬라이드를 미리 보고 PPTX 로 내려받습니다"
            onClick={() => setReport(true)}
          >
            PPTX
          </button>
          {/* 결과만 빠르게 바꿀 때 — 담당자·메모까지 함께면 Bulk Edit 로 */}
          <select
            className="cy-bulk"
            value=""
            disabled={!pick.size || saving}
            title={pick.size ? `고른 ${pick.size}건의 결과를 한꺼번에 바꿉니다` : '먼저 항목을 고르세요'}
            onChange={(e) => {
              const v = e.target.value
              if (!v) return
              void setResultMany(v === '미실행' ? '미실행' : v)
              e.target.value = ''
            }}
          >
            <option value="">일괄 변경…</option>
            {RESULTS.map((r) => (
              <option key={r.v} value={r.v === '' ? '미실행' : r.v}>
                {r.label}
              </option>
            ))}
          </select>
          <span className="rq-adiv" aria-hidden="true" />
          <button
            className="btn"
            type="button"
            title="이 회차의 결과를 글로 정리합니다"
            onClick={() => setInsight('ai')}
          >
            AI 요약
          </button>
          <button
            className="btn"
            type="button"
            title="지나간 실행을 시간순으로 보는 화면으로 갑니다"
            onClick={() => goto('report', cycle.id)}
          >
            보고서
          </button>
          <button
            className="btn"
            type="button"
            title="이 회차를 결과·담당자·유형으로 세어 봅니다"
            onClick={() => setInsight('metrics')}
          >
            메트릭스
          </button>
        </div>
      </div>

      {/* ③ 실행 바 — 사이클에만 있는 일이라 자기 줄을 준다. 공통 바에
          섞으면 세 화면이 또 달라 보이고 단추가 넘쳐 높이가 어긋난다. */}
      <div className="cy-runbar">
        {st.on ? (
          <button className="btn danger" type="button" onClick={() => void stop()}>
            <i className="cy-play">⏹</i> 멈추기
          </button>
        ) : (
          <>
            <button
              className="btn primary"
              type="button"
              disabled={!pick.size || saving}
              title={pick.size ? `고른 ${pick.size}건을 돌립니다` : '먼저 항목을 고르세요'}
              onClick={() => startRun([...pick].sort((a, b) => a - b))}
            >
              <i className="cy-play">▶</i> 실행{pick.size ? ` (${pick.size})` : ''}
            </button>
            <button
              className="btn"
              type="button"
              disabled={!items.length || saving}
              onClick={() => startRun(items.map((_, i) => i))}
            >
              <i className="cy-play">▶</i> 전체 실행 ({items.length})
            </button>
          </>
        )}
      </div>

      {/* ③ 진행 요약 — 카운터·진행률은 「하는 일」 이 아니라 「지금 상태」 다.
          실행 바와 한 줄에 섞으면 글자 크기가 달라 높이가 어긋난다. */}
      <div className="cy-sum">
        {/* 결과 카운터 — 누르면 그 결과만 걸러 본다. */}
        <div className="cy-legend">
          <button
            type="button"
            className={`cy-leg${only === null ? ' on' : ''}`}
            title="전부 보기"
            onClick={() => setOnly(null)}
          >
            <b>{items.length}</b> 전체
          </button>
          {RESULTS.map((r) => (
            <button
              key={r.v}
              type="button"
              className={`cy-leg ${r.cls}${only === r.v ? ' on' : ''}`}
              title={only === r.v ? '전부 보기' : `${r.label} 만 보기`}
              onClick={() => setOnly(only === r.v ? null : r.v)}
            >
              <b>{counts[r.v] ?? 0}</b> {r.label}
            </button>
          ))}
        </div>
        {/* 미실행 바로 오른쪽에 구분자 하나 두고 진행률 */}
        <span className="cy-div" aria-hidden="true" />
        <b className="cy-pct">
          {Math.round(((total - (counts[''] ?? 0)) / total) * 100)}% 진행
        </b>
      </div>

      {insight && (
        <CycleInsight
          mode={insight}
          cycleId={cycle.id}
          title={[cycle.model, cycle.version].filter(Boolean).join(' · ') || cycle.id}
          items={items}
          onClose={() => setInsight(null)}
        />
      )}

      {editing && (
        <CycleItemEdit
          items={editing}
          results={RESULTS}
          onClose={() => setEditing(null)}
          onApply={async (patch) => {
            const ids = new Set(editing.map((x) => x.tcid))
            await saveItems((cur) =>
              cur.map((x) => (ids.has(x.tcid) ? { ...x, ...patch } : x)),
            )
            sel.clear()
          }}
        />
      )}

      {adding && (
        <CyclePickTc
          have={new Set(items.map((x) => x.tcid))}
          onClose={() => setAdding(false)}
          onAdd={(rows) => {
            setAdding(false)
            // 이미 있는 것은 안 넣는다 — 창을 두 번 열면 두 벌이 된다
            void saveItems((cur) => {
              const have = new Set(cur.map((x) => x.tcid))
              return [...cur, ...rows.filter((x) => !have.has(x.tcid))]
            })
          }}
        />
      )}

      {report && (
        <CycleReport
          cycleId={cycle.id}
          model={cycle.model}
          version={cycle.version}
          onClose={() => setReport(false)}
        />
      )}

      {/* 돌고 있을 때의 진행판.
          옛 화면은 「총 66항목 중 1항목 진행 (2%)」 를 창으로 크게 띄웠다.
          내가 그것을 오른쪽 아래 한 줄로 줄여 놨더니 아무도 못 봤다.
          크게, 맨 위에, 도는 동안만. */}
      {st.on && (
        <div className="cy-prog">
          <div className="cy-prog-top">
            <b className="cy-prog-t">{st.waiting ? '실행 대기' : '시험 절차 실행 중'}</b>
            {st.who && <span className="cy-prog-who">{st.who} 님</span>}
            <span className="sp" />
            <button className="btn small danger" type="button" onClick={() => void stop()}>
              ⏹ 중지
            </button>
          </div>
          <div className="cy-prog-n">
            총 {st.total}항목 중 <b>{Math.min(st.done + 1, st.total)}</b>항목 진행 (
            {Math.round((st.done / (st.total || 1)) * 100)}%)
          </div>
          <div className="cy-prog-bar" aria-hidden="true">
            <span style={{ width: `${st.total ? (st.done / st.total) * 100 : 0}%` }} />
          </div>
          <div className="cy-prog-now">
            {st.waiting ? (
              '실행 서버가 집기를 기다립니다…'
            ) : (
              <>
                {st.itemName || '…'}
                {st.stepAt >= 0 && (
                  <span className="cy-prog-step">
                    {' '}
                    · 스텝 {st.stepAt + 1}/{st.stepCount}
                  </span>
                )}
                {st.stepName && <code className="cy-prog-cmd">{st.stepName}</code>}
              </>
            )}
            {!follow && (
              <button className="btn small" type="button" onClick={() => setFollow(true)}>
                도는 항목 따라가기
              </button>
            )}
          </div>
        </div>
      )}

      {/* 한 줄로 지금 어디까지 왔나. 숫자만 늘어놓으면 눈으로 못 센다 */}
      <div className="cy-bar" aria-hidden="true">
        {RESULTS.map((r) => (
          <span key={r.v} className={r.cls} style={{ flexGrow: counts[r.v] ?? 0 }} />
        ))}
      </div>

      <div className="cy-cols" ref={colsRef}>
      <div className="cy-list">
        {/* 고른 것에 하는 일 — Zephyr 의 Select All · Change Bulk Status.
            스무 건을 돌리고 하나씩 드롭다운을 여는 것은 일이 아니다. */}
        <div className="cy-selbar">
          <label className="rq-selall">
            <input
              type="checkbox"
              checked={rows.length > 0 && pick.size === rows.length}
              ref={(el) => {
                if (el) el.indeterminate = pick.size > 0 && pick.size < rows.length
              }}
              disabled={!rows.length}
              onChange={() =>
                pick.size === rows.length
                  ? sel.clear()
                  : sel.set(rows.map((x) => items.indexOf(x)))
              }
            />
            Select All
          </label>
          <span className="rq-seldiv" aria-hidden="true" />
          <span className="muted small">Selected : {pick.size}</span>
        </div>
        <div className="cy-row cy-hd">
          <span />
          <span>TC ID</span>
          <span>TC summary</span>
          <span>타입</span>
          <span>결과</span>
          <span>담당자</span>
          <span>실행자</span>
          <span>실행</span>
          <span>결함</span>
        </div>
        {rows.map((it, i) => {
          const at = items.indexOf(it)
          // 지금 도는 항목이면 스텝 결과가 차오르는 그대로(st.liveSteps)로
          // 판정을 계산한다. 안 그러면 스텝 세부창에선 Pass 가 뜨는데 목록의
          // 결과 칸은 실행 전 값 그대로라 「스텝은 Pass 인데 항목은 미실행」
          // 으로 어긋난다. 다 끝나면 저장→새로고침으로 같은 값이 굳는다.
          const liveHere = st.on && st.itemAt === at && st.liveSteps.length > 0
          // 도는 항목은 방금 받은 스텝이 판정한다. result(손으로 정한 값)를
          // 비워서 옛 Fail 이 새 Pass 를 가리지 않게 — 실행기도 저장할 때
          // 같은 이유로 result 를 지운다.
          const shown = liveHere ? ({ ...it, steps: st.liveSteps as CycleStep[], result: '' }) : it
          const v = itemVerdict(shown)
          const steps = shown.steps ?? []
          const bad = steps.filter((s) => isFail(stepVerdict(s as TcStep))).length
          return (
            <div
              className={`cy-row v-${v}${openItem === at ? ' on' : ''}${
                pick.has(at) ? ' picked' : ''
              }${st.itemAt === at ? ' running' : ''}`}
              key={`${it.tcid}-${i}`}
              role="button"
              tabIndex={0}
              title="누르면 스텝과 실행 내역 · Ctrl·Shift 로 여러 개"
              onClick={(e) => {
                sel.onClick(at, e, rows.map((x) => items.indexOf(x)))
                // 그냥 누른 것이면 그 항목을 연다
                if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
                  setOpenItem(openItem === at ? -1 : at)
                  // 보려고 누른 것을 빼앗지 않는다 — 여기서부터 따라가기를 끈다
                  setFollow(false)
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setOpenItem(openItem === at ? -1 : at)
                }
              }}
            >
              {/* TC ID 를 따로 세운다.
                  전에는 이름만 보였다. 이름은 「sysDescr Get 동작 확인」
                  처럼 겹치는 것이 많아서, 어느 시험인지 대려면 결국 열어
                  봐야 했다. 누르면 그 시험으로 간다 — 판정 기준을 고치러
                  가는 일이 잦다. */}
              {/* 체크박스 — Ctrl·Shift 로 고르는 것은 그대로 두고, 눈에
                  보이는 방법도 함께 준다(Zephyr 와 같은 자리) */}
              <span className="cy-ck" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={pick.has(at)}
                  aria-label={`${it.name || it.tcid} 고르기`}
                  onChange={() => {
                    const n = new Set(pick)
                    if (n.has(at)) n.delete(at)
                    else n.add(at)
                    sel.set([...n])
                  }}
                />
              </span>
              <button
                type="button"
                className="cy-tcid"
                title={`${it.tcid} — 누르면 이 시험으로 갑니다`}
                onClick={(e) => {
                  e.stopPropagation()
                  if (it.tcid) goto('tc', it.tcid)
                }}
              >
                {it.tcid || '–'}
              </button>
              <span className="cy-tc" title={it.tcid}>
                {it.name || it.tcid}
                {/* 부적합 근거는 오른쪽 스텝 카드에 있다 — 목록엔 단계 수만 */}
                {steps.length > 0 && (
                  <i className="cy-steps">
                    {bad ? `${steps.length}단계 중 ${bad} 부적합` : `${steps.length}단계`}
                  </i>
                )}
              </span>
              {/* 사람이 할 일인가 장비가 할 일인가.
                  Manual 만 있는 시험을 자동으로 돌린 줄 알고 「왜 안 돌았지」
                  하는 일이 있었다. 목록에서 갈려야 한다. */}
              <span className={`cy-kind ${kindOf(steps)}`}>
                {kindOf(steps) === 'manual'
                  ? 'Manual'
                  : kindOf(steps) === 'mixed'
                    ? '섞임'
                    : kindOf(steps) === 'auto'
                      ? 'Auto'
                      : '–'}
              </span>
              {/* 결과를 손으로 정할 수 있어야 한다. 수동 시험도 있고,
                  자동으로 돌았는데 사람이 달리 판단하는 경우도 있다 */}
              <select
                className={`cy-v ${verdictClass(v)}`}
                value={v}
                title="결과를 손으로 정합니다"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) =>
                  // 미실행('')을 고르면 「강제 미실행」 표식으로 저장한다.
                  // 빈 값으로 두면 스텝에서 다시 계산돼 안 바뀐 것처럼 보인다.
                  void setResult(it.tcid, e.target.value === '' ? '미실행' : e.target.value)
                }
              >
                {RESULTS.map((r) => (
                  <option key={r.v} value={r.v}>
                    {r.label}
                  </option>
                ))}
              </select>
              {/* 맡은 사람과 실제로 돌린 사람은 다르다 — 둘을 갈라 적는다 */}
              <span className="muted cy-who" title={it.assignee ?? ''}>
                {it.assignee || '–'}
              </span>
              <span className="muted cy-who" title={it.executed_by ?? ''}>
                {it.executed_by || '–'}
              </span>
              <span className="muted small">
                {/* 도는 동안은 시각 대신 진행을 보여 준다. 「언제 돌았나」 는
                    끝난 뒤에 궁금한 것이고, 도는 동안 궁금한 것은
                    「어디까지 갔나」 다. */}
                {st.itemAt === at && st.on ? (
                  <b className="cy-now">
                    실행 중{st.stepAt >= 0 && ` · 스텝 ${st.stepAt + 1}/${st.stepCount}`}
                  </b>
                ) : (
                  <>
                    {it.executed_at ? it.executed_at.slice(0, 16) : '–'}
                    {it.executed_auto && <b title="자동으로 돌았습니다"> ⚡</b>}
                  </>
                )}
              </span>
              <span className="muted">{(it.issues?.length ?? 0) || '–'}</span>
            </div>
          )
        })}
        {rows.length === 0 && <div className="empty">해당하는 항목이 없습니다.</div>}
      </div>

      {/* 오른쪽 칸 — 고른 항목의 스텝, 그리고 실행 중이면 오간 것.
          목록 안에서 펼치면 줄이 아래로 밀려서 방금 보던 자리를 놓친다.
          TC 화면과 같은 모양이라 오갈 때 눈이 안 헤맨다. */}
      {/* 2열 ↔ 3열. 스텝 세부를 넓게 볼 때가 있고, 64건 목록을 넓게 볼
          때가 있다 — 어느 쪽이 넓어야 하는지는 그때그때 다르다.
          손잡이는 **오른쪽 칸**의 폭을 정한다. 그래서 원점을 오른쪽 끝에
          두고 거꾸로 잰다. */}
      {/* List 에서는 스텝 칸을 접어 표를 넓게 쓴다 */}
      {view === 'detail' && (
        <Resizer
          label="스텝 세부 폭 조절"
          onResize={(w) => setSideW(Math.max(280, (colsRef.current?.clientWidth ?? 900) - w))}
          getOrigin={() => colsRef.current?.getBoundingClientRect().left ?? 0}
        />
      )}

      {view === 'detail' && (
      <div className="cy-side" style={{ flexBasis: sideW }}>
        {cur ? (
          <StepDetail
            // 항목이 바뀌면 새로 만든다. 안 그러면 처음 계산한 「펼칠 스텝」
            // 을 그대로 들고 있어서, 부적합이 없는 항목으로 옮기면 아무
            // 줄도 안 펼쳐진다 — 스텝은 보이는데 내용이 안 보인다
            key={cur.tcid ?? ''}
            item={liveNow ? { ...cur, steps: st.liveSteps } : cur}
            runningAt={liveNow ? st.stepAt : -1}
            onSetStep={(at, v) => void setStepResult(cur.tcid ?? '', at, v)}
            onSetImg={(at, file) => void setStepImg(cur.tcid ?? '', at, file)}
            onSetImgUrl={(at, url) => void setStepField(cur.tcid ?? '', at, { actual_img: url })}
            onSetTxt={(at, txt) => void setStepField(cur.tcid ?? '', at, { actual_txt: txt })}
            // 부적합일 때만 결함 등록 단추를 준다 — 통과한 항목엔 걸 일이 없다
            onIssue={
              itemVerdict(cur) === 'Fail' || itemDefect ? () => setDefectFor(cur) : undefined
            }
            defect={itemDefect}
            onClose={() => setOpenItem(-1)}
          />
        ) : (
          <div className="empty">항목을 누르면 스텝이 보입니다.</div>
        )}
      </div>
      )}
      </div>

      {defectFor && (
        <DefectDialog
          cycle={{ id: cycle.id, model: cycle.model, version: cycle.version }}
          item={defectFor}
          existing={itemDefect}
          onClose={() => setDefectFor(null)}
          onSaved={(d) => setItemDefect(d)}
        />
      )}
    </div>
  )
}

/**
 * 사이클 우클릭 메뉴.
 *
 * 옛 화면이 트리에서 우클릭으로 하던 것들이다. 화면 위쪽 단추로 다 빼
 * 놓으면 단추가 여섯 개가 되고, 그중 넷은 어쩌다 한 번 쓴다.
 */
function CycleMenu({
  at,
  cycle,
  onClose,
  onChanged,
  onEdit,
}: {
  at: { id: string; x: number; y: number }
  cycle?: CycleMeta
  onClose: () => void
  onChanged: () => void
  onEdit: (id: string) => void
}) {
  useEffect(() => {
    const away = () => onClose()
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    // 이 메뉴를 연 우클릭이 그대로 '바깥 누름' 으로 잡히지 않게 한 박자 늦춘다
    const timer = setTimeout(() => {
      window.addEventListener('mousedown', away)
      window.addEventListener('contextmenu', away)
    }, 0)
    window.addEventListener('keydown', esc)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('mousedown', away)
      window.removeEventListener('contextmenu', away)
      window.removeEventListener('keydown', esc)
    }
  }, [onClose])

  const rename = async () => {
    const now = `${cycle?.model ?? ''} ${cycle?.version ?? ''}`.trim()
    const v = window.prompt('버전 이름', cycle?.version ?? '')
    if (v === null || v.trim() === (cycle?.version ?? '')) return
    try {
      const r = await apiFetch(`/api/cycle/${encodeURIComponent(at.id)}`)
      if (!r.ok) throw new Error(String(r.status))
      const full = (await r.json()) as Record<string, unknown>
      const w = await apiFetch(`/api/cycle/${encodeURIComponent(at.id)}`, {
        method: 'POST',
        body: JSON.stringify({ ...full, id: at.id, version: v.trim() }),
      })
      if (!w.ok) throw new Error(String(w.status))
      onChanged()
    } catch {
      window.alert(`이름을 바꾸지 못했습니다 — ${now}`)
    }
  }

  const del = async () => {
    // 사이클을 지우면 그 안의 실행 결과가 같이 사라진다. 이름을 보여 주고 묻는다
    const nm = `${cycle?.model ?? ''} ${cycle?.version ?? ''}`.trim() || at.id
    if (!window.confirm(`「${nm}」 을 지웁니다. 이 회차의 실행 결과도 같이 사라집니다.`)) return
    try {
      const r = await apiFetch(`/api/cycle/${encodeURIComponent(at.id)}`, { method: 'DELETE' })
      if (!r.ok) throw new Error(String(r.status))
      onChanged()
    } catch {
      window.alert('지우지 못했습니다')
    }
  }

  const item = (label: string, fn: () => void) => (
    <button type="button" onClick={fn}>
      {label}
    </button>
  )

  return (
    <div
      className="cy-menu"
      style={{ left: at.x, top: at.y }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {item('사이클 수정 (항목·기간)', () => onEdit(at.id))}
      {item('버전 이름만 바꾸기', () => void rename())}
      <hr />
      {item('지우기', () => void del())}
    </div>
  )
}

/**
 * 폴더 우클릭 메뉴.
 *
 * 사이클 하나가 아니라 **폴더째** 손보는 자리. 그 안 사이클(버전)을 한꺼번에
 * 지우거나, 사람이 만든 버전그룹 폴더 자체를 지운다. 카탈로그가 주인인
 * 모델·모델그룹 폴더는 지울 수 없다 — 장비 목록에서 오는 것이라서다.
 */
function FolderMenu({
  at,
  onClose,
  onDeleteCycles,
  onDeleteFolder,
}: {
  at: { node: Node; x: number; y: number }
  onClose: () => void
  onDeleteCycles: () => void
  onDeleteFolder: () => void
}) {
  useEffect(() => {
    const away = () => onClose()
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const timer = setTimeout(() => {
      window.addEventListener('mousedown', away)
      window.addEventListener('contextmenu', away)
    }, 0)
    window.addEventListener('keydown', esc)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('mousedown', away)
      window.removeEventListener('contextmenu', away)
      window.removeEventListener('keydown', esc)
    }
  }, [onClose])

  const n = at.node
  const isVGroup = n.kind === 'vgroup'
  return (
    <div
      className="cy-menu"
      style={{ left: at.x, top: at.y }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {n.count > 0 ? (
        <button type="button" onClick={onDeleteCycles}>
          이 폴더의 사이클 {n.count}건 지우기
        </button>
      ) : (
        <button type="button" disabled>
          지울 사이클이 없습니다
        </button>
      )}
      {isVGroup && (
        <>
          <hr />
          <button type="button" onClick={onDeleteFolder}>
            버전그룹 폴더 지우기{n.count ? ` (사이클 ${n.count}건 포함)` : ''}
          </button>
        </>
      )}
    </div>
  )
}

/**
 * 이 사이클에 넣을 시험 고르기.
 *
 * 이미 들어 있는 것은 목록에 두되 못 고르게 한다. 안 보이게 치우면 「분명
 * 넣었는데 왜 없지」 하고 다시 찾게 된다.
 */
function CyclePickTc({
  have,
  onClose,
  onAdd,
}: {
  have: Set<string | undefined>
  onClose: () => void
  onAdd: (rows: CycleItemLite[]) => void
}) {
  const [q, setQ] = useState('')
  const [pick, setPick] = useState<Set<string>>(new Set())
  /** 접은 요구사항 — 기본은 다 펼쳐 「모두 보이게」 */
  const [closed, setClosed] = useState<Set<string>>(new Set())

  const tcQ = useQuery({
    queryKey: ['tcs'],
    queryFn: async () => {
      const r = await apiFetch('/api/tc?meta=1')
      if (!r.ok) throw new Error('시험 목록을 불러오지 못했습니다')
      return (await r.json()) as { tcs: TestCaseMeta[] }
    },
  })
  // 요구사항 제목 — 시험을 그 요구사항 밑에 묶어 보여 준다
  const reqQ = useQuery({
    queryKey: ['reqs'],
    queryFn: async () => {
      const r = await apiFetch('/api/req')
      if (!r.ok) throw new Error('요구사항을 불러오지 못했습니다')
      return (await r.json()) as { reqs: Array<{ reqid?: string; id?: string; title?: string }> }
    },
  })

  const reqTitle = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of reqQ.data?.reqs ?? []) {
      const id = String(r.reqid ?? r.id ?? '').trim()
      if (id) m.set(id, r.title ?? '')
    }
    return m
  }, [reqQ.data])

  /** 요구사항별로 묶는다. 검색은 요구사항 제목·시험 이름·ID 를 모두 훑는다. */
  const groups = useMemo(() => {
    const n = q.trim().toLowerCase()
    const all = tcQ.data?.tcs ?? []
    const byReq = new Map<string, TestCaseMeta[]>()
    for (const x of all) {
      const rid = String(x.req_id ?? '').trim()
      const reqHit = !n || `${rid} ${reqTitle.get(rid) ?? ''}`.toLowerCase().includes(n)
      const tcHit = !n || `${x.name ?? ''} ${x.tcid}`.toLowerCase().includes(n)
      if (n && !reqHit && !tcHit) continue
      const key = rid || '__none'
      if (!byReq.has(key)) byReq.set(key, [])
      byReq.get(key)!.push(x)
    }
    return [...byReq.entries()]
      .sort((a, b) =>
        a[0] === '__none' ? 1 : b[0] === '__none' ? -1 : a[0].localeCompare(b[0], 'ko'),
      )
      .map(([key, tcs]) => ({
        key,
        rid: key === '__none' ? '' : key,
        title: key === '__none' ? '(요구사항 없음)' : reqTitle.get(key) || key,
        tcs: tcs.slice().sort((a, b) => a.tcid.localeCompare(b.tcid, 'ko')),
      }))
  }, [tcQ.data, reqTitle, q])

  const setPicked = (id: string, on: boolean) =>
    setPick((s) => {
      const n = new Set(s)
      if (on) n.add(id)
      else n.delete(id)
      return n
    })

  /** 이 요구사항에서 아직 안 든(고를 수 있는) 시험 id */
  const pickableOf = (g: { tcs: TestCaseMeta[] }) =>
    g.tcs.filter((x) => !have.has(x.tcid)).map((x) => x.tcid)

  const toggleGroup = (g: { key: string; tcs: TestCaseMeta[] }) => {
    const ids = pickableOf(g)
    const allOn = ids.length > 0 && ids.every((id) => pick.has(id))
    setPick((s) => {
      const n = new Set(s)
      ids.forEach((id) => (allOn ? n.delete(id) : n.add(id)))
      return n
    })
  }

  const total = tcQ.data?.tcs?.length ?? 0

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div
        className="modal cn"
        role="dialog"
        aria-modal="true"
        aria-label="사이클에 시험 넣기"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <b>시험 넣기 {pick.size > 0 && `· ${pick.size}건`}</b>
          <span className="muted small">
            요구사항 {groups.length} · 시험 {total}
          </span>
          <span className="sp" />
          <button className="btn small" type="button" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="cn-pickhead">
          <input
            className="cn-q"
            value={q}
            placeholder="요구사항 · 시험 이름 · ID 로 찾기"
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="cn-list">
          {tcQ.isLoading || reqQ.isLoading ? (
            <div className="empty">불러오는 중…</div>
          ) : groups.length === 0 ? (
            <div className="empty">해당하는 시험이 없습니다.</div>
          ) : (
            groups.map((g) => {
              const ids = pickableOf(g)
              const on = ids.length > 0 && ids.every((id) => pick.has(id))
              const some = ids.some((id) => pick.has(id))
              const isClosed = closed.has(g.key) && !q.trim()
              return (
                <div className="cn-grp" key={g.key}>
                  <div className="cn-greq">
                    <button
                      type="button"
                      className={`cn-gcaret${isClosed ? '' : ' open'}`}
                      title={isClosed ? '펼치기' : '접기'}
                      onClick={() =>
                        setClosed((s) => {
                          const n = new Set(s)
                          if (n.has(g.key)) n.delete(g.key)
                          else n.add(g.key)
                          return n
                        })
                      }
                    >
                      <IconChevron />
                    </button>
                    <input
                      type="checkbox"
                      checked={on}
                      ref={(el) => {
                        if (el) el.indeterminate = !on && some
                      }}
                      disabled={ids.length === 0}
                      title="이 요구사항의 시험 모두 고르기"
                      onChange={() => toggleGroup(g)}
                    />
                    <span className="cn-gtitle">{g.title}</span>
                    {g.rid && <span className="muted small">{g.rid}</span>}
                    <span className="sp" />
                    <span className="muted small">{g.tcs.length}건</span>
                  </div>
                  {!isClosed &&
                    g.tcs.map((x) => {
                      const already = have.has(x.tcid)
                      return (
                        <label className={`cn-row cn-sub${already ? ' off' : ''}`} key={x.tcid}>
                          <input
                            type="checkbox"
                            disabled={already}
                            checked={pick.has(x.tcid)}
                            onChange={(e) => setPicked(x.tcid, e.target.checked)}
                          />
                          <span className="cn-nm">{x.name || '(제목 없음)'}</span>
                          <span className="muted small">{already ? '이미 있음' : x.tcid}</span>
                        </label>
                      )
                    })}
                </div>
              )
            })
          )}
        </div>
        <div className="modal-foot">
          <span className="sp" />
          <button className="btn" type="button" onClick={onClose}>
            취소
          </button>
          <button
            className="btn primary"
            type="button"
            disabled={!pick.size}
            onClick={() => {
              const all = tcQ.data?.tcs ?? []
              onAdd(
                [...pick].map((id) => {
                  const x = all.find((y) => y.tcid === id)
                  return {
                    tcid: id,
                    name: x?.name ?? '',
                    req_id: x?.req_id ?? '',
                    steps: [],
                  } as CycleItemLite
                }),
              )
            }}
          >
            넣기
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * 항목 하나의 스텝과 실행 내역.
 *
 * 「부적합」 세 글자만 보고는 아무것도 못 한다. **어느 스텝이 왜** 떨어졌는지
 * 를 보려고 TC 화면으로 건너가면 그 사이에 무엇을 보러 갔는지 잊는다.
 * 명령과 그때 받은 출력을 여기서 바로 편다.
 */
function StepDetail({
  item,
  runningAt,
  onSetStep,
  onSetImg,
  onSetImgUrl,
  onSetTxt,
  onIssue,
  defect,
  onClose,
}: {
  item: CycleItemLite
  /** 지금 도는 스텝 번호. 안 돌면 -1 */
  runningAt: number
  /** 스텝 하나의 결과를 손으로 정한다 */
  onSetStep?: (at: number, result: string) => void
  onSetImg?: (at: number, file: File) => void
  onSetImgUrl?: (at: number, url: string) => void
  onSetTxt?: (at: number, txt: string) => void
  onIssue?: () => void
  defect?: DefectRec | null
  onClose: () => void
}) {
  const steps = item.steps ?? []
  /** 출력을 펼친 스텝. 전부 펼쳐 두면 긴 출력에 묻혀 목록이 안 보인다 */

  return (
    <div className="cy-steps-pane">
      <div className="cy-sp-head">
        <b>{item.name || item.tcid}</b>
        <span className="muted small">{steps.length}단계</span>
        {item.executed_at && (
          <span className="muted small">
            {item.executed_at.slice(0, 16)} · {item.executed_by || '–'}
          </span>
        )}
        <span className="sp" />
        {/* 스텝 닫기 왼쪽에 결함 등록 단추. 누르면 창이 떠서 UTOP 에 먼저
            쌓고, 그 창의 「지라에 등록」 으로 Jira 이슈를 만든다. 이미 걸린
            항목은 「결함 봄」(지라에 올렸으면 이슈 키)으로 바뀐다. */}
        {onIssue && (
          <button
            className={`btn small${defect ? '' : ' danger'}`}
            type="button"
            onClick={onIssue}
            title={defect ? `결함 ${defect.id}${defect.jira_key ? ` · ${defect.jira_key}` : ''}` : '깨진 스텝으로 결함을 등록합니다'}
          >
            {defect ? `● ${defect.jira_key || '결함 봄'}` : '＋ 결함 등록'}
          </button>
        )}
        <button className="btn small" type="button" onClick={onClose}>
          닫기
        </button>
      </div>

      {/* 자동 판정이 늘 맞지는 않는다. 스텝마다 손으로 고칠 수 있어야
          결과서가 사실이 된다 */}
      <StepCards
        item={item}
        runningAt={runningAt}
        onSetResult={onSetStep}
        onSetImg={onSetImg}
        onSetImgUrl={onSetImgUrl}
        onSetTxt={onSetTxt}
      />
    </div>
  )
}
