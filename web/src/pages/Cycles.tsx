import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import ListHead from '@/components/ListHead'
import Resizer, { useResizableWidth } from '@/components/Resizer'
import { goto, onGoto, reflectUrl } from '@/api/goto'
import CycleEdit from '@/components/cycle/CycleEdit'
import CycleReport from '@/components/cycle/CycleReport'
import StepCards from '@/components/cycle/StepCards'
import CycleItemEdit from '@/components/cycle/CycleItemEdit'
import CycleInsight from '@/components/cycle/CycleInsight'
import DefectDialog, { type DefectRec } from '@/components/cycle/DefectDialog'
import { useCycleRun } from '@/components/cycle/useCycleRun'
import { useMultiSelect } from '@/components/useMultiSelect'
import PresenceBar from '@/components/PresenceBar'
import { usePageCrowd } from '@/components/usePageCrowd'
import SaveBell, { type SaveEvent } from '@/components/SaveBell'
import { usePresence } from '@/components/usePresence'
import { sendWs } from '@/api/wsBus'
import {
  IconChevron,
  IconEdit,
  IconExecution,
  IconFolder,
  IconPanel,
  IconPlay,
  IconReqDoc,
  IconSlide,
  IconTag,
  IconTrash,
} from '@/components/icons'
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
  /** 자유 폴더 경로 (예: L3/E6100/R100). 비면 모델·버전그룹에서 파생 */
  folder?: string | null
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
  /**
   * 계측기 스텝.
   *
   * CLI 는 「무엇을 보냈나(cli)」 와 「무엇이 나와야 하나(criteria)」 가
   * 칸에 있는데 계측기는 그 둘이 없다. 그래서 사이클 카드에 ACTUAL DATA
   * 하나만 뜨고 무엇을 시킨 것인지도 안 보였다. 여기 있어야 카드가 읽는다.
   */
  meterAct?: string | null
  meterDur?: number | null
  meterMaxLoss?: number | null
  host?: string | null
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
  /** 제품군 — L2 · L3 · OLT … 트리의 최상위 층 */
  family?: string | null
  vendor?: string | null
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
  kind?: 'family' | 'mgroup' | 'model' | 'vgroup' | 'free'
  /** 버전그룹 폴더가 매달린 모델·그룹 이름 (폴더를 지울 때 KV 에서 뺀다) */
  model?: string
  vgroup?: string
}

/** 사이클 하나의 결과 셈 — 트리 말풍선과 요약판이 같이 쓴다 */
function tallyOf(c: CycleMeta): { t: number; p: number; f: number } {
  const its = c.items ?? []
  let p = 0
  let f = 0
  for (const it of its) {
    const v = itemVerdict(it)
    if (v === 'Pass') p += 1
    else if (v === 'Fail') f += 1
  }
  return { t: its.length, p, f }
}

/** 이 가지 아래의 사이클 전부 */
function cyclesUnder(n: Node): CycleMeta[] {
  if (n.cycle) return [n.cycle]
  return n.children.flatMap(cyclesUnder)
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
/** 사이클의 폴더 경로 — 제 것이 있으면 그것, 없으면 모델·버전그룹에서 */
function pathOfCycle(c: CycleMeta, famOf: Map<string, string>): string {
  const own = String(c.folder ?? '').trim().replace(/^\/+|\/+$/g, '')
  if (own) return own
  const model = String(c.model ?? '').trim() || '(모델 없음)'
  const fam = famOf.has(model) ? famOf.get(model) || '(제품군 없음)' : NO_CAT
  const vg = String(c.version_group ?? '').trim() || NO_GROUP
  return `${fam}/${model}/${vg}`
}

/**
 * 트리를 세운다 — **자유 폴더**.
 *
 * 폴더는 카탈로그와 상관없는 그냥 폴더다(KV 에 경로 목록). 사이클은
 * 자기 folder 경로에 붙고, 경로가 없는 옛 사이클은 모델·버전그룹에서
 * 파생한 자리에 붙는다 — 이관 없이 섞여 산다.
 */
function build(
  cycles: CycleMeta[],
  freeFolders: string[],
  famOf: Map<string, string>,
): Node[] {
  interface T { node: Node; kids: Map<string, T> }
  const root: T = {
    node: { key: '', label: '', depth: -1, count: 0, children: [] },
    kids: new Map(),
  }
  const ensure = (path: string): T => {
    let cur = root
    const parts = path.split('/').filter(Boolean)
    parts.forEach((name, d) => {
      let t = cur.kids.get(name)
      if (!t) {
        const key = parts.slice(0, d + 1).join('/')
        t = {
          node: { key, label: name, depth: d, count: 0, children: [], kind: 'free' },
          kids: new Map(),
        }
        cur.kids.set(name, t)
      }
      cur = t
    })
    return cur
  }

  for (const path of freeFolders) if (path.trim()) ensure(path.trim())
  for (const c of cycles) {
    const t = ensure(pathOfCycle(c, famOf))
    t.node.children.push({
      key: c.id,
      label: String(c.version ?? '').trim() || c.name || c.id,
      depth: t.node.depth + 1,
      count: c._item_count ?? 0,
      children: [],
      cycle: c,
    })
  }

  const srt = (a: string, b: string) => a.localeCompare(b, 'ko')
  const finish = (t: T): Node => {
    const folders = [...t.kids.values()]
      .sort((a, b) => srt(a.node.label, b.node.label))
      .map(finish)
    t.node.children = [
      ...folders,
      ...t.node.children
        .filter((n) => n.cycle)
        .sort((a, b) => srt(String(b.label), String(a.label))),
    ]
    t.node.count =
      folders.reduce((a, n) => a + n.count, 0) +
      t.node.children.filter((n) => n.cycle).length
    t.node.empty = t.node.count === 0
    return t.node
  }
  return [...root.kids.values()].sort((a, b) => srt(a.node.label, b.node.label)).map(finish)
}

interface PageProps {
  me?: { username?: string; name?: string } | null
}

export default function Cycles({ me }: PageProps) {
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
  /**
   * 우클릭 메뉴가 시킨 일 — 사이클 상세가 받아 한다.
   *
   * 메뉴는 트리(페이지)에 있고 그 일을 할 줄 아는 것은 상세라, 신호로
   * 건넨다. 숫자를 함께 올려 같은 일을 두 번 시켜도 전달된다.
   */
  const [act, setAct] = useState<{ what: 'details' | 'ai' | 'pptx' | 'run'; n: number } | null>(
    null,
  )

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
  /** 1열 폭 — 끌어서 바꾼다. TC 화면과 같은 부품을 쓴다 */
  const splitRef = useRef<HTMLDivElement>(null)
  const [treeW, setTreeW] = useResizableWidth('utop.cycle.treeW', 250, 170, 460)
  useEffect(() => {
    localStorage.setItem('utop.cycle.treeOpen', treeOpen ? '1' : '0')
  }, [treeOpen])

  const [sel, setSel] = useState(() => localStorage.getItem(CY_SEL_KEY) || '')
  /** 트리에서 폴더를 골랐으면 관제판을 그 묶음으로 좁힌다 */
  const [scope, setScope] = useState<{ label: string; ids: Set<string> } | null>(null)
  /** 트리 줄 위에 뜨는 상태 요약 카드 */
  const [tip, setTip] = useState<{ node: Node; x: number; y: number } | null>(null)
  // 고르면 주소창에 남긴다 — 옛 화면의 #cycle=… 과 같은 일
  useEffect(() => {
    if (sel) reflectUrl('cycle', sel)
  }, [sel])
  // 링크·뒤로가기로 온 채 다른 사이클을 가리키면 갈아탄다
  useEffect(
    () =>
      onGoto((kind, id) => {
        if (kind === 'cycle' && id !== sel) setSel(id)
      }),
    [sel],
  )
  useEffect(() => {
    localStorage.setItem(CY_SEL_KEY, sel)
  }, [sel])
  const [q, setQ] = useState('')
  /** 이 화면(사이클 묶음)에 들어와 있는 사람들 — 상단 오른쪽 표시 몫 */
  const crowd = usePageCrowd('cycle')

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

  /** 자유 폴더 경로 목록 — 카탈로그와 무관한 그냥 폴더 (KV) */
  const fQ = useQuery({
    queryKey: ['cycle-free-folders'],
    queryFn: async () => {
      const r = await apiFetch('/api/cycle-folders')
      if (!r.ok) return { folders: [] as string[] }
      const j = (await r.json()) as { folders?: string[] }
      return { folders: Array.isArray(j.folders) ? j.folders.filter((x) => typeof x === 'string') : [] }
    },
  })
  const freeFolders = useMemo(() => fQ.data?.folders ?? [], [fQ.data])
  const saveFolders = async (next: string[]) => {
    await apiFetch('/api/cycle-folders', {
      method: 'POST',
      body: JSON.stringify({ folders: [...new Set(next)] }),
    })
    await fQ.refetch()
  }

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

  /**
   * 계측기(IXIA·Spirent…)는 사이클 트리에서 뺀다 — 사이클은 유비쿼스
   * 장비를 검증하는 것이고, 계측기는 시험 도구지 시험 대상이 아니다.
   */
  const meterish = (x: CatModel & { kind?: string }) =>
    (x.family ?? '').trim() === '계측기' ||
    /^(ixia|spirent|testcenter)/i.test(String(x.vendor ?? '').trim()) ||
    /^(ixia|n2x|stc|spirent|testcenter|n4u|n11u)/i.test(x.name.trim())
  const models = useMemo(
    () => (catQ.data?.items ?? []).filter((x) => x.kind === 'model' && !meterish(x)),
    [catQ.data],
  )
  /** 모델 → 사업자 — 관제판 카드에 배지로 붙인다 */
  const modelOp = useMemo(() => {
    const m = new Map<string, string>()
    for (const x of catQ.data?.items ?? [])
      if (x.kind === 'model' && (x as CatModel & { operator?: string | null }).operator)
        m.set(x.name, String((x as CatModel & { operator?: string | null }).operator).trim())
    return m
  }, [catQ.data])
  const famOf = useMemo(
    () => new Map(models.map((m) => [m.name, (m.family ?? '').trim()])),
    [models],
  )
  const tree = useMemo(
    () => build(shown, freeFolders, famOf),
    [shown, freeFolders, famOf],
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
  /**
   * 요구사항 트리와 같은 문법 — 창(prompt)이 아니라 **그 자리 입력칸**.
   * addingTo: 부모 키(''=최상위) / undefined=닫힘. renaming: 고치는 중인 키.
   */
  const [addingTo, setAddingTo] = useState<string | undefined>(undefined)
  const [draftName, setDraftName] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')

  /** 하위 폴더 추가 — 그냥 경로 하나 늘리는 일이다. 카탈로그 안 건드린다 */
  const addFolder = async (parent: string, name: string) => {
    name = name.trim()
    if (!name) return
    if (name.includes('/')) {
      window.alert('폴더 이름에는 / 를 쓸 수 없습니다')
      return
    }
    const path = parent ? `${parent}/${name}` : name
    if (path.split('/').length > 6) {
      window.alert('폴더는 6층까지만 됩니다')
      return
    }
    setAddingTo(undefined)
    setDraftName('')
    await saveFolders([...freeFolders, path])
    if (parent) setOpen((x) => new Set(x).add(parent))
  }

  /** 이름 변경 — 하위 경로와 그 안 사이클까지 같이 옮긴다 */
  const renameFolder = async (n: Node, name: string) => {
    setRenaming(null)
    name = name.trim()
    if (!name || name === n.label || name.includes('/')) return
    const parts = n.key.split('/')
    const next = [...parts.slice(0, -1), name].join('/')
    const moved = freeFolders.map((p) =>
      p === n.key || p.startsWith(n.key + '/') ? next + p.slice(n.key.length) : p,
    )
    // 이 폴더 밑 사이클들도 새 경로를 갖는다 — 통째로 읽어 통째로 저장
    // (요약본 되저장은 실행 결과를 지운다)
    for (const c of cyclesUnder(n)) {
      const r = await apiFetch(`/api/cycle/${encodeURIComponent(c.id)}`)
      if (!r.ok) continue
      const full = (await r.json()) as Record<string, unknown>
      const eff = pathOfCycle(c, famOf)
      await apiFetch(`/api/cycle/${encodeURIComponent(c.id)}`, {
        method: 'POST',
        body: JSON.stringify({ ...full, id: c.id, folder: next + eff.slice(n.key.length) }),
      })
    }
    await Promise.all([saveFolders(moved), listQ.refetch()])
  }

  /** 삭제 — 사이클이 없을 때만. 하위 폴더는 같이 사라진다 */
  const removeFolder = async (n: Node) => {
    if (n.count > 0) {
      window.alert('이 폴더에 사이클이 있습니다 — 사이클을 먼저 정리하거나 옮기세요')
      return
    }
    if (!window.confirm(`「${n.label}」 폴더를 지웁니다.` + (n.children.length ? '\n하위 폴더도 함께 사라집니다.' : ''))) return
    await saveFolders(freeFolders.filter((p) => p !== n.key && !p.startsWith(n.key + '/')))
  }

  const deleteFolderCycles = async (n: Node) => {
    const ids = cycleIdsUnder(n)
    if (!ids.length) return
    if (!window.confirm(`「${n.label}」 아래 사이클 ${ids.length}건을 지웁니다.\n각 회차의 실행 결과도 함께 사라집니다.`)) return
    const ok = await deleteCycles(ids)
    if (!ok) window.alert('일부를 지우지 못했습니다.')
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
          style={{ paddingLeft: 6 + (n.depth + 1) * 14 }}
          /* 열지 않고도 상태가 읽히게 — 색 막대가 든 요약 카드를 띄운다.
             브라우저 기본 말풍선은 글자뿐이라 숫자가 안 읽혔다. */
          onMouseEnter={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
            setTip({ node: n, x: r.right + 10, y: r.top - 4 })
          }}
          onMouseLeave={() => setTip(null)}
          onClick={() => {
            setTip(null)
            if (n.cycle) {
              setSel(n.cycle.id)
              return
            }
            // 폴더 클릭은 **고르기**다 — 오른쪽에 그 묶음의 버전별 요약판.
            // 접고 펴는 것은 화살표 단추 몫이라 여기서는 펼치기만 한다.
            // 클릭할 때마다 접혔다 펴졌다 하면 고르러 간 손이 트리를 흔든다.
            setOpen((x) => new Set(x).add(n.key))
            setScope({ label: n.label, ids: new Set(cyclesUnder(n).map((c) => c.id)) })
            setSel('')
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              if (n.cycle) {
                setSel(n.cycle.id)
              } else {
                setOpen((x) => new Set(x).add(n.key))
                setScope({ label: n.label, ids: new Set(cyclesUnder(n).map((c) => c.id)) })
                setSel('')
              }
            }
            // 요구사항 트리와 같은 문법 — F2 로 제자리 이름 변경
            if (e.key === 'F2' && !n.cycle) {
              e.preventDefault()
              setRenaming(n.key)
              setRenameText(n.label)
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
          {leaf ? (
            <span className="rt-caret">
              <span className="rt-dot" />
            </span>
          ) : (
            <button
              type="button"
              className={`rt-caret${isOpen ? ' open' : ''}`}
              aria-label={isOpen ? '접기' : '펼치기'}
              onClick={(e) => {
                e.stopPropagation()
                toggle(n.key)
              }}
            >
              <IconChevron />
            </button>
          )}
          {/* 모델그룹 · 모델 · 버전그룹은 폴더, 버전(사이클)은 항목 */}
          {!leaf && (
            <span className="rt-ficon" aria-hidden="true">
              <IconFolder open={isOpen} />
            </span>
          )}
          {/* 빈 폴더 표시는 전용 클래스로 — 'empty' 는 「비어 있음」 안내문
              스타일과 이름이 겹쳐 줄이 64px 로 부풀었다(겪었다) */}
          {renaming === n.key ? (
            // 창을 띄우지 않고 그 자리에서 고친다 (F2 · 더블클릭) — 요구사항과 동일
            <input
              autoFocus
              className="rt-rename"
              value={renameText}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setRenameText(e.target.value)}
              onBlur={() => setRenaming(null)}
              onKeyDown={(e) => {
                // 키가 폴더 줄로 새면 안 된다 — 스페이스를 줄이 가로챈다(겪었다)
                e.stopPropagation()
                if (e.key === 'Enter') void renameFolder(n, renameText)
                if (e.key === 'Escape') setRenaming(null)
              }}
            />
          ) : (
            <span
              className={`${n.cycle ? 'rt-title' : 'rt-fname'} cy-nm${n.empty ? ' cy-nm-empty' : ''}`}
              onDoubleClick={(e) => {
                if (n.cycle) return
                e.stopPropagation()
                setRenaming(n.key)
                setRenameText(n.label)
              }}
            >
              {n.label}
            </span>
          )}
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
        {addingTo === n.key && (
          <div className="rt-add" style={{ paddingLeft: 8 + (n.depth + 2) * 14 }}>
            <input
              autoFocus
              value={draftName}
              placeholder="폴더 이름"
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') void addFolder(n.key, draftName)
                if (e.key === 'Escape') setAddingTo(undefined)
              }}
            />
            <button className="btn small primary" type="button" onClick={() => void addFolder(n.key, draftName)}>
              추가
            </button>
            <button className="btn small" type="button" onClick={() => setAddingTo(undefined)}>
              취소
            </button>
          </div>
        )}
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
          {/* 「사이클」 을 누르면 관제판(고른 것 없음)으로 돌아간다 */}
          <button
            type="button"
            className="rq-crumb-home"
            onClick={() => {
              setScope(null)
              setSel('')
            }}
          >
            사이클
          </button>
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
        {/* 사이클 화면에 들어와 있는 사람 전부 — 상단 오른쪽 */}
        <PresenceBar users={crowd} me={me?.name || me?.username || ''} />
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
          <span className="tc-fold-t">Cycle Tree {cycles.length}</span>
        </button>
      )}
      {treeOpen && (
      <section className="panel cy-tree" style={{ flexBasis: treeW }}>
        <ListHead
          name="Cycle Tree"
          count={cycles.length}
          onCollapse={() => setTreeOpen(false)}
          search={{ value: q, placeholder: '모델 · 버전으로 찾기', onChange: setQ }}
          add={{ title: '사이클 만들기', onClick: () => setMaking(true) }}
          menu={
            <>
              <button type="button" onClick={() => setMaking(true)}>
                사이클 만들기
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddingTo('')
                  setDraftName('')
                }}
              >
                최상위 폴더 추가
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
        {/* ③ 찾기를 머리줄 아래 제자리에 늘 띄운다 — 돋보기를 눌러야 나오면
            거기 있는 줄 모른다. */}
        <div className="cy-find">
          <input
            value={q}
            placeholder="모델 · 버전으로 찾기"
            onChange={(e) => setQ(e.target.value)}
          />
          {q && (
            <button type="button" title="지우기" onClick={() => setQ('')}>
              ✕
            </button>
          )}
        </div>
        {/* `rt` 가 구분선·hover·선택색 변수를 들고 있다 — 빠지면 변수가
            무효라 줄 사이 선이 통째로 사라진다(겪었다). 요구사항 트리와
            같은 시각 규칙은 이 클래스 하나로 온다. */}
        <div className="cy-body rt">
          {/* Root — 늘 맨 위에 있다. 누르면 전체 관제판, 올리면 전체 합산.
              「전체」 로 돌아가는 길이 빵부스러기에만 있으면 트리에서 길을
              잃는다. */}
          <div
            className={`rt-fold cy-node rt-top cy-root${!sel && !scope ? ' on' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => {
              setTip(null)
              setScope(null)
              setSel('')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setScope(null)
                setSel('')
              }
            }}
            onMouseEnter={(e) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
              setTip({
                node: { key: '__root', label: 'Root', depth: 0, count: cycles.length, children: tree },
                x: r.right + 10,
                y: r.top - 4,
              })
            }}
            onMouseLeave={() => setTip(null)}
            onContextMenu={(e) => {
              e.preventDefault()
              setTip(null)
              setFolderMenu({
                node: { key: '__root', label: 'Root', depth: 0, count: cycles.length, children: [] },
                x: e.clientX,
                y: e.clientY,
              })
            }}
          >
            <span className="rt-caret">
              <span className="rt-dot" />
            </span>
            <span className="rt-ficon" aria-hidden="true">
              <IconFolder open />
            </span>
            <span className="rt-fname cy-nm">Root</span>
            <span className="rt-cnt" title="사이클">
              {cycles.length || ''}
            </span>
          </div>
          {addingTo === '' && (
            <div className="rt-add" style={{ paddingLeft: 8 }}>
              <input
                autoFocus
                value={draftName}
                placeholder="새 최상위 폴더 이름"
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter') void addFolder('', draftName)
                  if (e.key === 'Escape') setAddingTo(undefined)
                }}
              />
              <button className="btn small primary" type="button" onClick={() => void addFolder('', draftName)}>
                추가
              </button>
              <button className="btn small" type="button" onClick={() => setAddingTo(undefined)}>
                취소
              </button>
            </div>
          )}
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
          onDo={(what) => {
            // 그 사이클을 먼저 연다 — 안 열려 있으면 시킬 데가 없다
            setSel(menu.id)
            setMenu(null)
            setAct((a) => ({ what, n: (a?.n ?? 0) + 1 }))
          }}
        />
      )}

      {tip && (() => {
        const cs = cyclesUnder(tip.node)
        const a = cs.reduce(
          (x, c) => {
            const t = tallyOf(c)
            return { t: x.t + t.t, p: x.p + t.p, f: x.f + t.f }
          },
          { t: 0, p: 0, f: 0 },
        )
        const rest = a.t - a.p - a.f
        return (
          <div className="cy-tip" style={{ left: tip.x, top: Math.max(8, tip.y) }}>
            <div className="cy-tip-h">
              <b>{tip.node.label}</b>
              {!tip.node.cycle && <span className="muted small">사이클 {cs.length}개</span>}
            </div>
            <div className="cy-bar" aria-hidden="true">
              <span className="pass" style={{ flexGrow: a.p }} />
              <span className="fail" style={{ flexGrow: a.f }} />
              <span className="none" style={{ flexGrow: rest || (a.t ? 0 : 1) }} />
            </div>
            <div className="cy-tip-r">
              <i className="pass" /> Pass <b>{a.p}</b>
              <i className="fail" /> Fail <b>{a.f}</b>
              <i className="none" /> 나머지 <b>{rest}</b>
              <span className="muted small">총 {a.t}건</span>
            </div>
          </div>
        )
      })()}

      {folderMenu && (
        <FolderMenu
          at={folderMenu}
          onClose={() => setFolderMenu(null)}
          entries={(() => {
            const n = folderMenu.node
            const done = (fn: () => void) => () => {
              setFolderMenu(null)
              fn()
            }
            const out: MenuEntry[] = []
            if (n.key === '__root') {
              out.push({
                label: '+ 최상위 폴더 추가',
                fn: done(() => {
                  setAddingTo('')
                  setDraftName('')
                }),
              })
              return out
            }
            // 폴더는 그냥 폴더다 — 층 구분 없이 같은 세 가지
            if (n.key.split('/').length < 6)
              out.push({
                label: '+ 하위 폴더 추가',
                fn: done(() => {
                  setOpen((x) => new Set(x).add(n.key))
                  setAddingTo(n.key)
                  setDraftName('')
                }),
              })
            out.push({
              label: '이름 변경 (F2)',
              fn: done(() => {
                setRenaming(n.key)
                setRenameText(n.label)
              }),
            })
            out.push('hr')
            out.push({
              label: n.count > 0 ? '폴더 지우기 — 사이클이 있어 못 지웁니다' : '폴더 지우기',
              disabled: n.count > 0,
              fn: done(() => void removeFolder(n)),
            })
            if (n.count > 0)
              out.push({
                label: `이 폴더의 사이클 ${n.count}건 지우기`,
                fn: done(() => void deleteFolderCycles(n)),
              })
            return out
                    })()}
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
          <CycleDetail
            cycle={cur}
            /* 회귀를 대 볼 후보 — 나머지 사이클 전부. 기본은 같은 모델의
               최신 것이지만, 사람이 아무 것이나 고를 수 있다. */
            others={cycles.filter((c) => c.id !== cur.id)}
            act={act}
            meName={me?.name || me?.username || ''}
            onSaved={() => void listQ.refetch()}
          />
        ) : (
          <CycleBoard
            cycles={scope ? cycles.filter((c) => scope.ids.has(c.id)) : cycles}
            scopeLabel={scope?.label}
            modelOp={modelOp}
            onPick={(id) => setSel(id)}
          />
        )}
      </section>
    </div>
    </>
  )
}

/**
 * 관제판 — 아직 아무 사이클도 안 골랐을 때.
 *
 * 전에는 「왼쪽에서 사이클을 고르세요」 한 줄이었다. 이 화면의 질문은
 * 「이번 버전, 내보내도 되나」 인데, 그 답의 첫 장이 빈 벽이면 안 된다.
 * 모델별로 사이클을 깔고, 카드마다 진행률과 Pass/Fail 을 바로 보여 준다 —
 * 어디가 급한지 열기 전에 보인다.
 */
function CycleBoard({
  cycles,
  scopeLabel,
  modelOp,
  onPick,
}: {
  cycles: CycleMeta[]
  /** 트리에서 폴더를 골랐으면 그 이름 — 무엇으로 좁혀 보고 있는지 */
  scopeLabel?: string
  /** 모델 → 사업자 (카드 배지) */
  modelOp?: Map<string, string>
  onPick: (id: string) => void
}) {
  const [q, setQ] = useState('')
  const [failOnly, setFailOnly] = useState(false)
  const [sortBy, setSortBy] = useState<'recent' | 'progress' | 'fail'>('recent')

  // 사이클별 집계는 한 번만 — 요약 띠·거름·정렬이 다 같이 쓴다
  const stats = useMemo(() => {
    const m = new Map<string, { total: number; done: number; pass: number; fail: number; pct: number }>()
    for (const c of cycles) {
      const its = c.items ?? []
      let done = 0
      let pass = 0
      let fail = 0
      for (const it of its) {
        const v = itemVerdict(it)
        if (v) done += 1
        if (v === 'Pass') pass += 1
        else if (v === 'Fail') fail += 1
      }
      m.set(c.id, {
        total: its.length,
        done,
        pass,
        fail,
        pct: its.length ? Math.round((done / its.length) * 100) : 0,
      })
    }
    return m
  }, [cycles])

  const shown = useMemo(() => {
    const nq = q.trim().toLowerCase()
    let arr = cycles
    if (nq)
      arr = arr.filter((c) =>
        [c.version, c.name, c.version_group, c.model]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(nq),
      )
    if (failOnly) arr = arr.filter((c) => (stats.get(c.id)?.fail ?? 0) > 0)
    return arr
  }, [cycles, q, failOnly, stats])

  const sum = useMemo(() => {
    const s = { n: 0, total: 0, done: 0, pass: 0, fail: 0 }
    for (const c of shown) {
      const t = stats.get(c.id)
      if (!t) continue
      s.n += 1
      s.total += t.total
      s.done += t.done
      s.pass += t.pass
      s.fail += t.fail
    }
    return s
  }, [shown, stats])

  const groups = useMemo(() => {
    const m = new Map<string, CycleMeta[]>()
    for (const c of shown) {
      const k = String(c.model ?? '').trim() || '(모델 없음)'
      const arr = m.get(k)
      if (arr) arr.push(c)
      else m.set(k, [c])
    }
    return m
  }, [shown])

  return (
    <div className="cy-board scroll">
      <div className="cy-board-h">
        <b>{scopeLabel ? `${scopeLabel} — 버전별 상태` : '어느 버전을 검증할까요'}</b>
        <span className="muted small">
          카드를 누르면 실행 화면이 열립니다 · 색 띠는 Pass/Fail, 숫자는 실행 진행률
        </span>
      </div>
      {/* 요약 띠 + 도구 — 지금 보이는 범위의 합계, 그리고 찾기·거르기·정렬 */}
      <div className="cy-tools">
        <span className="cy-sum">
          사이클 <b>{sum.n}</b> · 항목 <b>{sum.total}</b> · 실행 <b>{sum.done}</b>
          {sum.total > 0 && (
            <i className="muted">({Math.round((sum.done / sum.total) * 100)}%)</i>
          )}
          {' · '}
          <b className="cp">Pass {sum.pass}</b> · <b className="cf">Fail {sum.fail}</b> · 미실행{' '}
          <b>{sum.total - sum.done}</b>
        </span>
        <span className="sp" />
        <input
          className="cy-q"
          placeholder="버전·이름 찾기"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          type="button"
          className={`cy-failonly${failOnly ? ' on' : ''}`}
          title="Fail 이 있는 사이클만 봅니다"
          onClick={() => setFailOnly((v) => !v)}
        >
          Fail 만
        </button>
        <select
          className="cy-sort"
          value={sortBy}
          title="카드 차례"
          onChange={(e) => setSortBy(e.target.value as 'recent' | 'progress' | 'fail')}
        >
          <option value="recent">최근 순</option>
          <option value="progress">덜 끝난 순</option>
          <option value="fail">Fail 많은 순</option>
        </select>
      </div>
      {[...groups.entries()].map(([model, list]) => (
        <div key={model} className="cy-bgroup">
          <div className="cy-bgt">
            {model}
            {/* 사이클별 Pass/Fail 추이 — 왼쪽이 과거. 이 모델이 좋아지고
                있는지 나빠지고 있는지가 열기 전에 보인다. 목록이 최신순이라
                뒤집어 그린다. 막대를 누르면 그 사이클이 열린다. */}
            {list.length > 1 && (
              <span className="cy-btrend" aria-label="사이클별 결과 추이">
                {[...list].reverse().slice(-16).map((c) => {
                  const its = c.items ?? []
                  let pass = 0
                  let fail = 0
                  for (const it of its) {
                    const v = itemVerdict(it)
                    if (v === 'Pass') pass += 1
                    else if (v === 'Fail') fail += 1
                  }
                  const rest = its.length - pass - fail
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className="cy-btr"
                      title={`${c.version || c.name || c.id} — Pass ${pass} · Fail ${fail} · 나머지 ${rest}`}
                      onClick={() => onPick(c.id)}
                    >
                      <i className="n" style={{ flexGrow: rest }} />
                      <i className="f" style={{ flexGrow: fail }} />
                      <i className="p" style={{ flexGrow: pass }} />
                    </button>
                  )
                })}
              </span>
            )}
          </div>
          <div className="cy-cards">
            {(sortBy === 'recent'
              ? list
              : [...list].sort((a, b) =>
                  sortBy === 'progress'
                    ? (stats.get(a.id)?.pct ?? 0) - (stats.get(b.id)?.pct ?? 0)
                    : (stats.get(b.id)?.fail ?? 0) - (stats.get(a.id)?.fail ?? 0),
                )
            ).map((c) => {
              const items = c.items ?? []
              const counts: Record<string, number> = {}
              for (const it of items) {
                const v = itemVerdict(it)
                counts[v] = (counts[v] ?? 0) + 1
              }
              const total = items.length
              const done = total - (counts[''] ?? 0)
              const pct = total ? Math.round((done / total) * 100) : 0
              const fail = counts['Fail'] ?? 0
              return (
                <button key={c.id} type="button" className="cy-bcard" onClick={() => onPick(c.id)}>
                  <span className="cy-bcard-t">
                    <b>{c.version || c.name || c.id}</b>
                    {c.version_group ? <i>{c.version_group}</i> : null}
                  </span>
                  {/* 결과 분포 띠 — 실행 화면 위의 것과 같은 문법 */}
                  <span className="cy-bar" aria-hidden="true">
                    {RESULTS.map((r) => (
                      <span key={r.v} className={r.cls} style={{ flexGrow: counts[r.v] ?? 0 }} />
                    ))}
                    {total === 0 && <span className="none" style={{ flexGrow: 1 }} />}
                  </span>
                  <span className="cy-bcard-m">
                    <b className={pct === 100 ? 'done' : ''}>{pct}%</b>
                    <span className="muted small">
                      {done}/{total}건 실행
                    </span>
                    {fail > 0 && <b className="bad">Fail {fail}</b>}
                    <span className="sp" />
                    {/* 사업자 — LGU+ 향인지 공공 향인지 열기 전에 보인다 */}
                    {modelOp?.get(String(c.model ?? '').trim()) && (
                      <i className="cy-bop">{modelOp.get(String(c.model ?? '').trim())}</i>
                    )}
                    {c.assignee && <span className="muted small">{c.assignee}</span>}
                    {/* 마지막 움직임 — 죽은 사이클과 도는 사이클이 갈린다 */}
                    {c._updated_at_pg && (
                      <span className="muted small">{String(c._updated_at_pg).slice(0, 10)}</span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
      {cycles.length === 0 && (
        <div className="empty">아직 사이클이 없습니다 — 왼쪽 위 ＋ 로 만드세요.</div>
      )}
    </div>
  )
}

/** 사이클 한 건 — 항목과 진행 */
function CycleDetail({
  cycle,
  others,
  act,
  meName,
  onSaved,
}: {
  cycle: CycleMeta
  /** 회귀를 대 볼 후보들 — 이 사이클을 뺀 전부. 기본은 같은 모델 최신 */
  others: CycleMeta[]
  /** 지금 사람 — 접속자 표시와 「누가 고쳤나」 에 쓴다 */
  meName: string
  /** 트리 우클릭 메뉴가 시킨 일 */
  act?: { what: 'details' | 'ai' | 'pptx' | 'run'; n: number } | null
  onSaved: () => void
}) {
  /** 걸러 보기. null 이면 전부 — '' 는 「미실행」 이라는 뜻이라 못 쓴다 */
  const [only, setOnly] = useState<Verdict | null>(null)
  const [report, setReport] = useState(false)
  /** 고른 항목 — 누르면 스텝과 실행 내역이 아래에 열린다 */
  const [openItem, setOpenItem] = useState(-1)

  /**
   * 이 사이클을 누가 같이 보고 있나 · 남이 무엇을 고쳤나.
   *
   * 사이클은 **여럿이 나눠 돌리는 자리**다. 요구사항·시험항목에는 접속자
   * 표시가 있는데 정작 부딪히기 쉬운 여기에는 없었다. 둘이 같은 항목에
   * 결과를 찍으면 나중 사람이 앞사람 것을 조용히 덮는다.
   *
   * 막지는 않는다 — 랩에서는 같은 사이클을 여럿이 보는 일이 잦고, 잠가
   * 버리면 보려던 사람이 못 들어온다. 대신 **누가 있는지 보여 주고**,
   * 남이 고치면 그때 알린다.
   */
  /**
   * 남이 고친 이력 — 새것이 앞이다.
   *
   * 처음엔 띠로 띄웠는데, 한 사람이 연달아 저장하면 앞의 것이 뒤의 것에
   * 밀려 **누가 무엇을 언제** 했는지가 안 남았다. 사이클은 여럿이 나눠
   * 돌리는 자리라 그 이력이 곧 알아야 할 일이다. 시험항목 화면과 같은
   * 종에 쌓아 두고 숫자만 보인다.
   */
  const [saves, setSaves] = useState<SaveEvent[]>([])
  const [seen, setSeen] = useState(0)
  /** 항목마다 누가 보고 있나 — 서버가 모아 준다 */
  const [focus, setFocus] = useState<Record<string, string[]>>({})
  /**
   * 방금 들어온 사람 · 나간 사람.
   *
   * 접속자 띠는 늘 거기 있어서, 보고 있지 않으면 누가 새로 들어온 것을
   * 모른다. 같은 사이클을 둘이 만지다가 나중에 저장한 사람이 앞사람 것을
   * 덮는 일이 그래서 난다. 들고 남을 몇 초간 띄워 눈에 걸리게 한다.
   */
  const [joined, setJoined] = useState<{ who: string; how: 'in' | 'out' } | null>(null)
  const prevUsers = useRef<string[]>([])
  const page = `cycle:${cycle.id}`
  const presence = usePresence(page, meName, (m) => {
    if (m.type === 'focus' && m.page === page) {
      setFocus((m.at as Record<string, string[]>) ?? {})
      return
    }
    if (m.type !== 'cycle_updated' || m.cycle_id !== cycle.id) return
    const by = typeof m.user === 'string' ? m.user : ''
    if (by && by === meName) return // 내가 방금 저장한 것
    // 20건까지만. 그 아래는 아무도 안 본다
    setSaves((c) => [{ user: by || '다른 사람', at: Date.now() }, ...c].slice(0, 20))
  })

  // 지금 어느 항목을 보고 있는지 알린다. 항목이 곧 부딪히는 자리다.
  // 접속자가 바뀌면 그 사람 이름을 잠깐 띄운다
  useEffect(() => {
    const now = presence.users.filter((u) => u !== meName)
    const was = prevUsers.current
    prevUsers.current = now
    if (!was.length && !now.length) return
    const came = now.find((u) => !was.includes(u))
    const left = was.find((u) => !now.includes(u))
    if (!came && !left) return
    setJoined(came ? { who: came, how: 'in' } : { who: left as string, how: 'out' })
    const t = setTimeout(() => setJoined(null), 6000)
    return () => clearTimeout(t)
  }, [presence.users, meName])

  useEffect(() => {
    if (meName) sendWs({ type: 'focus', user: meName, page, at: openItem })
  }, [openItem, page, meName])
  // 이 사이클을 떠나면 자리를 비운다
  useEffect(
    () => () => {
      if (meName) sendWs({ type: 'focus', user: meName, page, at: -1 })
    },
    [page, meName],
  )
  // 다른 사이클로 옮기면 지난 것은 지운다 — 이 사이클의 이력이지 내 이력이 아니다
  useEffect(() => {
    setSaves([])
    setSeen(0)
  }, [cycle.id])
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

  /**
   * 실행은 표 안에서 보인다 — 도는 항목 줄 밑이 펼쳐져 스텝이 차례로
   * 차오르고, 끝나면 접힌다. 화면이 통째로 바뀌면 보던 목록·필터를
   * 잃는다. 크게 봐야 할 때(긴 로그)만 인라인의 「크게 보기」 로
   * 실행 모드(RunPane)를 연다.
   */
  const [runView, setRunView] = useState(false)
  // 실행이 끝나면 실행 모드도 같이 닫는다 — 남아 있으면 빈 판을 본다
  useEffect(() => {
    if (!st.on) setRunView(false)
  }, [st.on])
  /** 캐럿으로 펼쳐 둔 항목들 — 실행과 무관하게 스텝을 줄 밑에서 본다 */
  const [inlineOpen, setInlineOpen] = useState<Set<number>>(new Set())
  const toggleInline = (at: number) =>
    setInlineOpen((cur) => {
      const n = new Set(cur)
      if (n.has(at)) n.delete(at)
      else n.add(at)
      return n
    })
  /** 도는 항목의 인라인 판 — 따라가기 중이면 화면에 붙잡아 둔다 */
  const runlineRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (st.on && follow)
      runlineRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [st.on, st.itemAt, follow])

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
  /** 제목 줄의 「⋯」 — 요약·보고서·내보내기 */
  const [headMenu, setHeadMenu] = useState(false)

  /**
   * 트리 우클릭 메뉴가 시킨 일을 여기서 한다.
   *
   * 숫자(n)가 올라갈 때만 움직인다 — 같은 일을 두 번 시켜도 전달되고,
   * 다른 것 때문에 다시 그려질 때 엉뚱하게 또 돌지 않는다.
   */
  const actN = useRef(0)
  useEffect(() => {
    if (!act || act.n === actN.current) return
    actN.current = act.n
    if (act.what === 'ai') setInsight('ai')
    else if (act.what === 'pptx') setReport(true)
    else if (act.what === 'run') {
      if (items.length) startRun(items.map((_, i) => i))
    }
    // 'details' 는 페이지가 보기만 바꾸면 끝이라 여기서 할 일이 없다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [act])
  /**
   * 표 줄 우클릭 메뉴.
   *
   * 결과·담당자·메모를 고치는 길이다. 위 단추 줄에서 뺐으니 여기 둔다 —
   * 트리에서 사이클을 우클릭하면 항목을 넣고 빼듯, 항목은 항목 줄에서.
   */
  const [rowMenu, setRowMenu] = useState<{ at: number; x: number; y: number } | null>(null)
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
        // 누가 고쳤는지 함께 보낸다 — 받는 쪽이 「내가 방금 한 것」 을
        // 걸러야 하고, 남이 한 것이면 이름을 말해 줘야 한다
        body: JSON.stringify({ ...full, id: cycle.id, items: edit(cur), updated_by: meName }),
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

  /**
   * ③ 좁혀 보기 — 결과(통계 카드)에 더해 심각도·타입·발생구분·글자로 거른다.
   *
   * 64건이 넘어가면 결과만으로는 못 좁힌다. 「고객이 낸 것 중 Blocker 만」
   * 같은 물음이 실제로 자주 나온다.
   */
  const [fSev, setFSev] = useState('')
  const [fType, setFType] = useState('')
  const [fKind, setFKind] = useState('')
  /** 담당자 — 팀으로 나눠 돌릴 때 「내 것만」 을 본다. '\0' 은 미지정 */
  const [fAss, setFAss] = useState('')
  const [fq, setFq] = useState('')

  /** 시험 메타(심각도·타입·발생구분)는 TC 에 있다 — 항목에는 없다 */
  const tcMetaQ = useQuery({
    queryKey: ['tc', 'list', 'meta'],
    queryFn: async () => {
      const r = await apiFetch('/api/tc?meta=1')
      if (!r.ok) throw new Error('시험 목록을 불러오지 못했습니다')
      return (await r.json()) as { tcs: TestCaseMeta[] }
    },
    staleTime: 60_000,
  })
  const tcMeta = useMemo(() => {
    const m = new Map<string, TestCaseMeta>()
    for (const t of tcMetaQ.data?.tcs ?? []) m.set(t.tcid, t)
    return m
  }, [tcMetaQ.data])

  /** 요구사항 이름 — 묶음 머리에 적는다. 번호만으로는 무엇인지 모른다 */
  const reqQ2 = useQuery({
    queryKey: ['req', 'list'],
    queryFn: async () => {
      const r = await apiFetch('/api/req')
      if (!r.ok) throw new Error('요구사항을 불러오지 못했습니다')
      return (await r.json()) as { reqs: Array<{ reqid?: string; id?: string; title?: string }> }
    },
    staleTime: 60_000,
  })
  const reqName = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of reqQ2.data?.reqs ?? []) {
      const t = r.title ?? ''
      if (r.reqid) m.set(r.reqid, t)
      if (r.id) m.set(r.id, t)
    }
    return m
  }, [reqQ2.data])
  /** 내부 키(rq-…) → 부여 ID(REQ-2633-0003). 내부 키는 화면에 안 낸다 */
  const reqIdOf = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of reqQ2.data?.reqs ?? []) {
      if (r.id && r.reqid) m.set(String(r.id), String(r.reqid))
    }
    return m
  }, [reqQ2.data])

  /** 거를 값 목록 — 이 회차에 실제로 있는 것만 띄운다 */
  const opts = useMemo(() => {
    const sev = new Set<string>()
    const typ = new Set<string>()
    const kin = new Set<string>()
    for (const it of items) {
      const t = tcMeta.get(it.tcid)
      if (t?.severity) sev.add(String(t.severity))
      if (t?.type) typ.add(String(t.type))
      if (t?.kind) kin.add(String(t.kind))
    }
    const srt = (a: string, b: string) => a.localeCompare(b, 'ko')
    // 담당자는 건수를 함께 — 「누가 몇 건 맡았나」 가 고르는 기준이다
    const ass = new Map<string, number>()
    for (const it of items) {
      const k = String(it.assignee ?? '').trim()
      ass.set(k, (ass.get(k) ?? 0) + 1)
    }
    return {
      sev: [...sev].sort(srt),
      typ: [...typ].sort(srt),
      kin: [...kin].sort(srt),
      ass: [...ass.entries()].sort((a, b) => srt(a[0], b[0])),
    }
  }, [items, tcMeta])

  /*
   * 회귀 — **지난 사이클에선 Pass 였는데 이번에 Fail** 인 것.
   *
   * 사이클은 버전 검증이라, 정말 무서운 것은 「원래 깨져 있던 것」 이
   * 아니라 **되던 것이 무너진 것**이다. 표에서 Fail 로만 보이면 그 둘이
   * 섞여서, 회귀를 골라내려고 지난 결과서를 옆에 띄워 놓고 눈으로 대
   * 보게 된다. 여기서 대 준다.
   */
  const [prevId, setPrevId] = useState('')
  // 사이클을 갈아타면 비교 상대도 자동으로 돌아간다
  useEffect(() => setPrevId(''), [cycle.id])
  const prev = prevId
    ? others.find((c) => c.id === prevId)
    : others.find((c) => (c.model ?? '') === (cycle.model ?? ''))
  const prevQ = useQuery({
    queryKey: ['cycle-full', prev?.id ?? ''],
    enabled: Boolean(prev),
    queryFn: async () => {
      const r = await apiFetch(`/api/cycle/${encodeURIComponent(prev!.id)}`)
      if (!r.ok) throw new Error('지난 사이클을 불러오지 못했습니다')
      return (await r.json()) as { items?: CycleItemLite[] }
    },
  })
  const prevVerdict = useMemo(() => {
    const m = new Map<string, Verdict>()
    for (const it of prevQ.data?.items ?? []) m.set(it.tcid, itemVerdict(it))
    return m
  }, [prevQ.data])
  const isRegress = (it: CycleItemLite) =>
    itemVerdict(it) === 'Fail' && prevVerdict.get(it.tcid) === 'Pass'
  const regressN = useMemo(
    () => (prevVerdict.size ? items.filter(isRegress).length : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, prevVerdict],
  )
  const [onlyRegress, setOnlyRegress] = useState(false)

  const rows = useMemo(() => {
    const n = fq.trim().toLowerCase()
    const out = items.filter((it) => {
      if (onlyRegress && !isRegress(it)) return false
      if (only !== null && itemVerdict(it) !== only) return false
      const t = tcMeta.get(it.tcid)
      if (fSev && String(t?.severity ?? '') !== fSev) return false
      if (fType && String(t?.type ?? '') !== fType) return false
      if (fKind && String(t?.kind ?? '') !== fKind) return false
      if (fAss && String(it.assignee ?? '').trim() !== (fAss === '\0' ? '' : fAss)) return false
      if (!n) return true
      return (
        it.tcid.toLowerCase().includes(n) || (it.name ?? '').toLowerCase().includes(n)
      )
    })
    // 같은 요구사항끼리 붙여 둔다 — 흩어져 있으면 묶음 머리가 여러 번 뜬다.
    // 그 안의 차례는 원래 자리를 지킨다(사람이 정한 순서다).
    const order = new Map<string, number>()
    out.forEach((x) => {
      const k = String(x.req_id ?? '')
      if (!order.has(k)) order.set(k, order.size)
    })
    return out
      .map((x, i) => ({ x, i }))
      .sort(
        (a, b) =>
          (order.get(String(a.x.req_id ?? '')) ?? 0) -
            (order.get(String(b.x.req_id ?? '')) ?? 0) || a.i - b.i,
      )
      .map((v) => v.x)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, only, onlyRegress, prevVerdict, tcMeta, fSev, fType, fKind, fAss, fq])

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
  /**
   * 항목을 골랐으면 스텝 세부, 아니면 표만 넓게.
   *
   * Detail/List 토글을 없앴다 — 요구사항·Coverage 화면과 같은 문법이다.
   * 「무엇을 보고 있나」 가 화면을 정하지, 사람이 보기 방식을 따로
   * 고르게 하지 않는다. 실행 따라가기 중에는 도는 항목이 곧 고른 것이다.
   */
  const view: 'list' | 'detail' = followAt >= 0 ? 'detail' : 'list'
  /** 지금 도는 항목이면 저장된 스텝 대신 받는 중인 것을 보여 준다 */
  const liveNow = st.on && followAt === st.itemAt && st.liveSteps.length > 0

  // 열어 둔 항목이 바뀌면 그 항목의 결함을 읽어 단추를 「등록/봄」 으로 가른다
  useEffect(() => {
    void loadItemDefect(cur?.tcid ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.tcid, cycle.id])

  return (
    <div className="cy-detail">
      {/* 2열·3열을 **각자 카드**로 가른다. 한 카드에 두면 3열이 2열의
          일부처럼 보인다 — 두 칸이 하는 일이 다르다. */}
      {runView ? (
        <RunPane
          cycle={cycle}
          items={items}
          st={st}
          onStop={() => void stop()}
          onExit={() => setRunView(false)}
          isRegress={isRegress}
          prevName={prev?.version || prev?.name || ""}
        />
      ) : (
      <div className="cy-cols" ref={colsRef}>
      {/* 2열 — 이 회차를 돌리고 결과를 보는 칸. 머리(제목·단추·통계·거르기)와
          표가 한 카드에 든다. */}
      <section className="panel cy-exec">
      {/* ② 공통 액션 바 — 요구사항·시험항목과 **같은 차례**.
          Edit·Bulk Edit | Add·Delete·Export. 세 화면을 오가는 사람이 매번
          어디에 무엇이 있는지 다시 찾지 않게. */}
      <div className="cy-head">
        {/* ① 제목을 단추와 한 줄에 둔다 — 세 칸의 머리가 모두 한 줄이라야
            구분선이 같은 높이에서 만난다. */}
        <span className="cy-cardt">
          <b>Cycle Execution</b>
          <span className="muted small">
            {[cycle.model, cycle.version].filter(Boolean).join(' · ')}
          </span>
          {/* 누가 같이 보고 있나. 혼자면 안 뜬다 — 늘 있으면 장식이 된다 */}
          <PresenceBar users={presence.users} me={meName} />
          {joined && (
            <span className={`cy-join ${joined.how}`}>
              {joined.who} 님이 {joined.how === 'in' ? '들어왔습니다' : '나갔습니다'}
            </span>
          )}
          {/* 남이 고친 이력. 띠로 띄우면 연달아 저장할 때 앞의 것이 밀린다 */}
          <SaveBell
            items={saves}
            unseen={Math.max(0, saves.length - seen)}
            onSeen={() => setSeen(saves.length)}
          />
        </span>
        <span className="sp" />
        {/* 어쩌다 한 번 쓰는 것들은 「⋯」 안에 둔다 — 늘 펴 두면 자주 쓰는
            실행 단추가 그만큼 밀린다. */}
        <div className="cy-hmenu">
          <button
            className="btn small"
            type="button"
            title="요약 · 보고서 · 내보내기"
            aria-haspopup="menu"
            aria-expanded={headMenu}
            onClick={() => setHeadMenu((v) => !v)}
          >
            ⋯
          </button>
          {headMenu && (
            <>
              <div className="cy-hmenu-back" onClick={() => setHeadMenu(false)} />
              <div className="cy-hmenu-pop" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setHeadMenu(false)
                    setInsight('ai')
                  }}
                >
                  AI 요약
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setHeadMenu(false)
                    goto('report', cycle.id)
                  }}
                >
                  보고서
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setHeadMenu(false)
                    setInsight('metrics')
                  }}
                >
                  메트릭스
                </button>
                <hr />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setHeadMenu(false)
                    setReport(true)
                  }}
                >
                  PPTX (고객사 결과서)
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!items.length}
                  onClick={() => {
                    setHeadMenu(false)
                    exportItems()
                  }}
                >
                  Export (CSV)
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 둘째 줄 — 보고·실행. 첫 줄(항목에 하는 일)과 성격이 달라 선으로 가른다 */}
      <div className="cy-head2">
        <div className="rq-actions">
          {/* 실행이 먼저다 — 이 화면에서 가장 자주 누른다 */}
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
          <span className="rq-adiv" aria-hidden="true" />
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

        </div>
      </div>


      {rowMenu && (
        <CycleRowMenu
          at={rowMenu}
          count={pick.size}
          onClose={() => setRowMenu(null)}
          onEdit={() => {
            const rows = [...pick].map((i) => items[i]!).filter(Boolean)
            setRowMenu(null)
            setEditing(rows)
          }}
          onGoTc={() => {
            const t = items[rowMenu.at]?.tcid
            setRowMenu(null)
            if (t) goto('tc', t)
          }}
        />
      )}

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
      {/* 한눈에 — 카드로 세기 전에 띠로 먼저 보인다 */}
      <div className="cy-bar" aria-hidden="true">
        {RESULTS.map((r) => (
          <span key={r.v} className={r.cls} style={{ flexGrow: counts[r.v] ?? 0 }} />
        ))}
      </div>

      {/* ② 통계 — 작은 글자 카운터는 눈에 안 들어온다. 큰 칸으로 세워
          「지금 어디까지 왔나」 를 먼저 읽게. 누르면 그 결과만 걸러 본다. */}
      <div className="cy-stats">
        <button
          type="button"
          className={`cy-stat total${only === null ? ' on' : ''}`}
          title="전부 보기"
          onClick={() => setOnly(null)}
        >
          <b>{items.length}</b>
          <span className="cy-stat-lb">
            총항목 <i>{Math.round(((total - (counts[''] ?? 0)) / total) * 100)}%</i>
          </span>
        </button>
        {RESULTS.map((r) => {
          const n = counts[r.v] ?? 0
          return (
            <button
              key={r.v}
              type="button"
              className={`cy-stat ${r.cls}${only === r.v ? ' on' : ''}`}
              title={only === r.v ? '전부 보기' : `${r.label} 만 보기`}
              onClick={() => setOnly(only === r.v ? null : r.v)}
            >
              <b>{n}</b>
              <span className="cy-stat-lb">
                {r.label} <i>{items.length ? Math.round((n / items.length) * 100) : 0}%</i>
              </span>
            </button>
          )
        })}
        {/* 회귀 — 대 볼 사이클이 하나라도 있으면 늘 띄운다. 0 이어도
            띄운다: 「회귀 0」 은 되던 것을 안 무너뜨렸다는 **결과**다.
            상대는 기본이 같은 모델 최신이고, 아래에서 갈아탈 수 있다. */}
        {others.length > 0 && (
          <div className={`cy-stat regress${regressN ? ' hot' : ''}${onlyRegress ? ' on' : ''}`}>
            <button
              type="button"
              className="cy-reg-n"
              title={
                !prev
                  ? '아래에서 비교할 사이클을 고르세요'
                  : prevVerdict.size === 0
                    ? `${prev.version || prev.name || '상대'} 에는 실행 결과가 없습니다`
                    : onlyRegress
                      ? '전부 보기'
                      : `${prev.version || prev.name || '지난 사이클'} 에선 Pass 였는데 이번에 Fail 인 것만`
              }
              onClick={() => setOnlyRegress((v) => !v)}
            >
              <b>{prev && prevVerdict.size ? regressN : '–'}</b>
              <span className="cy-stat-lb">회귀</span>
            </button>
            <select
              className="cy-regpick"
              value={prev?.id ?? ''}
              title="어느 사이클과 대 볼까요"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                setPrevId(e.target.value)
                setOnlyRegress(false)
              }}
            >
              {!prev && <option value="">vs (고르세요)</option>}
              {others.map((c) => (
                <option key={c.id} value={c.id}>
                  vs {[c.model, c.version || c.name].filter(Boolean).join(' · ') || c.id}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ③ 좁혀 보기 — 이 회차에 실제로 있는 값만 띄운다 */}
      <div className="cy-filters">
        <select value={fSev} onChange={(e) => setFSev(e.target.value)} title="심각도">
          <option value="">심각도: 전체</option>
          {opts.sev.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <select value={fType} onChange={(e) => setFType(e.target.value)} title="타입">
          <option value="">타입: 전체</option>
          {opts.typ.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <select value={fKind} onChange={(e) => setFKind(e.target.value)} title="발생구분">
          <option value="">발생구분: 전체</option>
          {opts.kin.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <select value={fAss} onChange={(e) => setFAss(e.target.value)} title="담당자 — 내 것만 보기">
          <option value="">담당자: 전체</option>
          {opts.ass.map(([v, n]) => (
            <option key={v || '\0'} value={v || '\0'}>
              {v || '(미지정)'} · {n}건
            </option>
          ))}
        </select>
        <input
          className="cy-fq"
          value={fq}
          placeholder="TC ID · 제목 검색"
          onChange={(e) => setFq(e.target.value)}
        />
        {(only !== null || onlyRegress || fSev || fType || fKind || fAss || fq) && (
          <button
            className="btn small"
            type="button"
            title="걸러 놓은 것을 모두 풉니다"
            onClick={() => {
              setOnly(null)
              setOnlyRegress(false)
              setFSev('')
              setFType('')
              setFKind('')
              setFAss('')
              setFq('')
            }}
          >
            ✕ 조건 지우기
          </button>
        )}
        <span className="sp" />
        <span className="muted small">
          {rows.length === items.length ? `${items.length}건` : `${rows.length} / ${items.length}건`}
        </span>
      </div>

      {/* 「몇 개 골랐나」 는 표 바로 위에 */}
      <div className="cy-listwrap">
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
        <div className="cy-list">
        <div className="cy-row cy-hd">
          <span />
          <span />
          <span>TC summary</span>
          <span>결함</span>
          <span>결과</span>
          <span>타입</span>
          <span>담당자</span>
          <span>실행자</span>
          <span>실행</span>
        </div>
        {rows.map((it, i) => {
          const at = items.indexOf(it)
          // ④ 요구사항별 묶음. 앞 줄과 요구사항이 다르면 머리줄을 하나 끼운다 —
          // 같은 요구사항의 시험이 흩어져 있으면 「이 요구사항은 다 됐나」 를
          // 눈으로 세어야 한다.
          const rid = String(it.req_id ?? '')
          const newGroup = i === 0 || String(rows[i - 1]?.req_id ?? '') !== rid
          const gRows = newGroup ? rows.filter((x) => String(x.req_id ?? '') === rid) : []
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
            <React.Fragment key={`${it.tcid}-${i}`}>
            {newGroup && (
              <div className="cy-grow" title={rid || '요구사항 없음'}>
                <span className="cy-gicon" aria-hidden="true">
                  <IconFolder open />
                </span>
                <b>{reqName.get(rid) || rid || '(요구사항 없음)'}</b>
                {/* 부여 ID 만 보여준다 — 내부 키(rq-…)는 사람이 읽을 글이 아니다 */}
                {(() => {
                  const label = reqIdOf.get(rid) || (rid.startsWith('rq-') ? '' : rid)
                  return label ? <span className="muted small">{label}</span> : null
                })()}
                <span className="sp" />
                <span className="muted small">{gRows.length}건</span>
              </div>
            )}
            <div
              /* 남이 같이 보고 있으면 줄에 테두리를 두른다 — 눈 표시는
                 체크박스 자리에 작아서 그냥 지나쳤다 */
              /* 줄·제목 클릭은 아무 일도 안 한다 — 펼침은 캐럿, 고르기는
                 체크박스, 나머지는 우클릭. 클릭마다 화면이 반응하면
                 훑어보다 계속 뭔가 열린다. */
              className={`cy-row v-${v}${openItem === at ? ' on' : ''}${
                pick.has(at) ? ' picked' : ''
              }${st.itemAt === at ? ' running' : ''}${
                (focus[String(at)] ?? []).some((u) => u !== meName) ? ' watched' : ''
              }`}
              onContextMenu={(e) => {
                e.preventDefault()
                // 안 고른 줄에서 눌렀으면 그 줄만 고른 것으로 본다 —
                // 엉뚱한 것이 고쳐지지 않게
                if (!pick.has(at)) sel.set([at])
                setRowMenu({ at, x: e.clientX, y: e.clientY })
              }}
            >
              {/* TC ID 를 따로 세운다.
                  전에는 이름만 보였다. 이름은 「sysDescr Get 동작 확인」
                  처럼 겹치는 것이 많아서, 어느 시험인지 대려면 결국 열어
                  봐야 했다. 누르면 그 시험으로 간다 — 판정 기준을 고치러
                  가는 일이 잦다. */}
              {/* 체크박스 — Ctrl·Shift 로 고르는 것은 그대로 두고, 눈에
                  보이는 방법도 함께 준다(Zephyr 와 같은 자리) */}
              {/* 이 항목을 나 말고 누가 보고 있나.
                  **칸을 새로 만들지 않는다** — 격자에 자식을 하나 더 넣으면
                  그 줄만 칸이 밀려 머리글과 어긋난다. 체크박스 칸 위에
                  얹는다. */}
              {/* 펼침 캐럿 — 트리 폴더와 같은 문법. 누르면 스텝이 줄 밑에 */}
              <button
                type="button"
                className={`cy-expcaret${inlineOpen.has(at) ? ' open' : ''}`}
                title="스텝을 줄 밑에 펼쳐 봅니다"
                aria-expanded={inlineOpen.has(at)}
                onClick={(e) => {
                  e.stopPropagation()
                  toggleInline(at)
                }}
              >
                <IconChevron />
              </button>
              <span className="cy-ck" onClick={(e) => e.stopPropagation()}>
                {(() => {
                  const who = (focus[String(at)] ?? []).filter((u) => u !== meName)
                  if (!who.length) return null
                  return (
                    <span className="cy-eyes" title={`${who.join(', ')} 님이 보는 중`}>
                      {who.slice(0, 2).map((u) => (
                        <i key={u}>{(u.trim()[0] || '?').toUpperCase()}</i>
                      ))}
                    </span>
                  )
                })()}
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
              <span className="cy-tc" title={it.tcid}>
                {/* 실행 중 표시는 격자 칸이 아니라 이름 칸 **안**에 —
                    칸으로 끼우면 그 줄만 한 칸씩 밀린다(겪었다) */}
                {st.itemAt === at && (
                  <b className="cy-live-chip" title="지금 이 항목을 돌리는 중입니다">
                    <i />
                    실행 중
                  </b>
                )}
                {it.name || it.tcid}
                {/* 되던 것이 무너졌다 — Fail 중에서도 이것부터 봐야 한다 */}
                {isRegress(it) && (
                  <b
                    className="cy-regchip"
                    title={`${prev?.version || prev?.name || '지난 사이클'} 에선 Pass 였습니다`}
                  >
                    회귀
                  </b>
                )}
                {/* 부적합 근거는 오른쪽 스텝 카드에 있다 — 목록엔 단계 수만 */}
                {steps.length > 0 && (
                  <i className="cy-steps">
                    {bad ? `${steps.length}단계 중 ${bad} 부적합` : `${steps.length}단계`}
                  </i>
                )}
              </span>
              {/* 결함 수 — 결과와 나란히 있어야 「깨졌고 결함도 걸었나」 가
                  한눈에 이어진다 */}
              <span className="muted">{(it.issues?.length ?? 0) || '–'}</span>
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
                  <b className="cy-now" title="실행 중 — 지나간 스텝/전체">
                    {st.stepAt >= 0 ? `${st.stepAt + 1}/${st.stepCount}` : '…'}
                  </b>
                ) : (
                  <>
                    {it.executed_at ? it.executed_at.slice(0, 16) : '–'}
                    {it.executed_auto && <b title="자동으로 돌았습니다"> ⚡</b>}
                  </>
                )}
              </span>
            </div>
            {/* 도는 항목은 줄 밑이 펼쳐진다 — 스텝이 차례로 차오르고,
                끝나면(다음 항목으로 넘어가면) 저절로 접힌다 */}
            {st.on && st.itemAt === at && (
              <div className="cy-runline" ref={runlineRef}>
                <div className="cy-rl-h">
                  <i className="cy-rl-dot" aria-hidden="true" />
                  <b>
                    {st.waiting
                      ? '실행 대기 — 실행 서버가 집기를 기다립니다'
                      : `스텝 ${Math.min(Math.max(st.stepAt + 1, 1), st.stepCount || steps.length)} / ${st.stepCount || steps.length}`}
                  </b>
                  <span className="muted small">
                    항목 {Math.min(st.done + 1, st.total)}/{st.total}
                  </span>
                  {st.who && <span className="muted small">{st.who} 님이 걸었습니다</span>}
                  <span className="sp" />
                  <button
                    className="btn small"
                    type="button"
                    title="실행 모드로 크게 봅니다 (로그 포함)"
                    onClick={(e) => {
                      e.stopPropagation()
                      setRunView(true)
                    }}
                  >
                    크게 보기
                  </button>
                  <button
                    className="btn small"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      void stop()
                    }}
                  >
                    중지
                  </button>
                </div>
                <StepLines steps={steps} curAt={st.waiting ? -1 : st.stepAt} />
              </div>
            )}
            {/* 캐럿으로 펼친 스텝 — 실행 인라인이 그 줄에 떠 있으면 그쪽이 이긴다 */}
            {inlineOpen.has(at) && !(st.on && st.itemAt === at) && (
              <div className="cy-runline cy-static">
                <StepLines
                  steps={steps}
                  onJudge={(si, v2) => void setStepResult(it.tcid ?? '', si, v2)}
                />
              </div>
            )}
            </React.Fragment>
          )
        })}
        {rows.length === 0 && <div className="empty">해당하는 항목이 없습니다.</div>}
      </div>
      </div>

      </section>

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
      <section className="panel cy-side" style={{ flexBasis: sideW }}>
        <div className="cy-cardh">
          <b>Test Procedure Details</b>
          <span className="muted small">{cur ? cur.name || cur.tcid : '항목을 고르세요'}</span>
        </div>
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
      </section>
      )}
      </div>
      )}

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
  onDo,
}: {
  at: { id: string; x: number; y: number }
  cycle?: CycleMeta
  onClose: () => void
  onChanged: () => void
  onEdit: (id: string) => void
  /** 사이클 상세가 맡은 일 — 세부 내역·요약·PPTX·자동 실행 */
  onDo: (what: 'details' | 'ai' | 'pptx' | 'run') => void
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

  /** 메뉴 한 줄 — 아이콘이 있어야 글자를 다 읽기 전에 무엇인지 안다 */
  const item = (Icon: React.ComponentType, label: string, fn: () => void) => (
    <button type="button" onClick={fn}>
      <span className="cy-mi" aria-hidden="true">
        <Icon />
      </span>
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
      {item(IconEdit, '사이클 수정 (항목·제목)', () => onEdit(at.id))}
      {item(IconReqDoc, '세부 내역 (Details)', () => onDo('details'))}
      {item(IconExecution, '보고서 출력 (AI 요약 PDF)', () => onDo('ai'))}
      {item(IconSlide, 'PPTX 출력 (AI 요약)', () => onDo('pptx'))}
      <hr />
      {item(IconPlay, 'Test Cycle 자동 실행 (Automation)', () => onDo('run'))}
      <hr />
      {item(IconTag, '버전 이름만 바꾸기', () => void rename())}
      <hr />
      {item(IconTrash, '사이클 삭제', () => void del())}
    </div>
  )
}

/**
 * 실행 모드 — 목업 그대로.
 *
 *  · 위: 큰 진행 띠 — 몇 번째 항목·스텝, 경과, 중지
 *  · 왼쪽: 항목 큐 — 도는 항목을 따라가고 지나간 줄은 결과 색으로 굳는다
 *  · 오른쪽: 지금 도는 스텝의 실행 로그가 터미널로 흐른다
 *  · 끝나면: 아래에 Pass·Fail·회귀 요약과 「표로 돌아가기」
 */
/** 스텝을 절차 그대로 — 실행 인라인(차오르는 중)과 캐럿 펼침(저장본)이 같이
    쓴다. 자동 스텝은 CLI 명령·판정 기준, 수동 스텝은 절차·Test Data·기대
    결과까지 그린다 — 판정만 보이면 「무엇을 했길래」 를 알 수 없다.
    curAt 이 있으면 실행 중: 그 스텝은 「실행 중…」, 안 온 것은 「대기」. */
function StepLines({
  steps,
  curAt,
  onJudge,
}: {
  steps: CycleStep[]
  curAt?: number
  /** 수동 스텝의 Pass/Fail 판정 — 캐럿 펼침에서만 온다. 같은 값을 다시
      누르면 지운다(미실행) */
  onJudge?: (si: number, v: string) => void
}) {
  return (
    <div className="cy-rl-steps">
      {steps.map((s, si) => {
        const sv = stepVerdict(s as TcStep)
        const cur = curAt != null && si === curAt
        const cls = cur ? 'cur' : isFail(sv) ? 'ng' : isPass(sv) ? 'ok' : ''
        const manual = s.manual || s.action === '수동' || s.kind === 'manual'
        return (
          <div key={si} className={`cy-rl-step ${cls}`}>
            <i>{si + 1}</i>
            {manual ? (
              /* 수동 시험은 시험서 그대로 — 절차·데이터·기대를 가로로 놓고,
                 판정은 그 자리의 Pass/Fail 로 끝낸다 */
              <div className="cy-rl-man">
                <div className="cy-rl-mc">
                  <i>Tests</i>
                  <span>{s.step || s.desc || '–'}</span>
                </div>
                <div className="cy-rl-mc">
                  <i>Test Data</i>
                  <span>{s.data || '–'}</span>
                </div>
                <div className="cy-rl-mc">
                  <i>Expected Result</i>
                  <span>{s.expected || '–'}</span>
                </div>
                {onJudge ? (
                  <div className="cy-rl-judge">
                    <button
                      type="button"
                      className={`p${isPass(sv) ? ' on' : ''}`}
                      onClick={() => onJudge(si, isPass(sv) ? '' : 'Pass')}
                    >
                      Pass
                    </button>
                    <button
                      type="button"
                      className={`f${isFail(sv) ? ' on' : ''}`}
                      onClick={() => onJudge(si, isFail(sv) ? '' : 'Fail')}
                    >
                      Fail
                    </button>
                  </div>
                ) : (
                  <b className={`cy-rl-v ${cls}`}>{sv || '미실행'}</b>
                )}
              </div>
            ) : (
              <div className="cy-rl-b">
                <div className="cy-rl-l1">
                  {s.action && <em className="cy-rl-act">{s.action}</em>}
                  <span className="cy-rl-nm">{s.desc || s.step || `스텝 ${si + 1}`}</span>
                  {cur && !isFail(sv) && !isPass(sv) ? (
                    <b className="cy-rl-v run">실행 중…</b>
                  ) : (
                    <b className={`cy-rl-v ${cls}`}>{sv || (curAt != null ? '대기' : '미실행')}</b>
                  )}
                </div>
                {s.cli && <pre className="cy-rl-cli">{s.cli}</pre>}
                {s.criteria && <div className="cy-rl-crit">기준 · {s.criteria}</div>}
                {isFail(sv) && s.reason && (
                  <div className="cy-rl-why" title={s.reason ?? ''}>
                    {String(s.reason).split('\n')[0]}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
      {steps.length === 0 && (
        <div className="muted small">
          {curAt != null
            ? '스텝을 받는 중…'
            : '이 항목에는 절차(스텝)가 없습니다 — 시험에 스텝을 채우면 여기 보입니다.'}
        </div>
      )}
    </div>
  )
}

function RunPane({
  cycle,
  items,
  st,
  onStop,
  onExit,
  isRegress,
  prevName,
}: {
  cycle: CycleMeta
  items: CycleItemLite[]
  st: ReturnType<typeof useCycleRun>['st']
  onStop: () => void
  onExit: () => void
  isRegress: (it: CycleItemLite) => boolean
  prevName: string
}) {
  // 경과 시간 — 붙은 순간부터 센다. 서버가 시작 시각을 안 주므로 근사치다.
  const t0 = useRef(Date.now())
  const [, tick] = useState(0)
  useEffect(() => {
    if (!st.on) return
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [st.on])
  useEffect(() => {
    if (st.on) t0.current = Date.now()
  }, [st.runId, st.on])
  const sec = Math.max(0, Math.floor((Date.now() - t0.current) / 1000))
  const mmss = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`

  // 로그 터미널 — 새 줄이 오면 바닥으로. 사람이 위로 올려 봤으면 안 뺏는다.
  const termRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  useEffect(() => {
    const el = termRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [st.log.length])

  // 도는 항목이 바뀌면 큐도 그 줄로
  const queueRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    queueRef.current
      ?.querySelector('.cy-q-row.now')
      ?.scrollIntoView({ block: 'nearest' })
  }, [st.itemAt])

  const done = !st.on
  const counts: Record<string, number> = {}
  let regress = 0
  for (const it of items) {
    const v = itemVerdict(it)
    counts[v] = (counts[v] ?? 0) + 1
    if (isRegress(it)) regress += 1
  }
  const prog = st.total
    ? (st.done + (st.stepCount > 0 ? Math.min(1, (st.stepAt + 1) / st.stepCount) : 0)) / st.total
    : 0

  return (
    <div className="cy-runmode">
      <div className={`cy-run-band${done ? ' done' : ''}`}>
        {!done && <span className="cy-run-dot" aria-hidden="true" />}
        <b>
          {cycle.version || cycle.name || cycle.id}{' '}
          {done ? (st.status === 'stopped' ? '중지됨' : '실행 끝') : st.waiting ? '실행 대기 중' : '실행 중'}
        </b>
        <span className="cy-run-meta">
          항목 {Math.min(st.done + (st.on ? 1 : 0), st.total)}/{st.total}
          {st.stepCount > 0 && ` · 스텝 ${st.stepAt + 1}/${st.stepCount}`}
          {' · 경과 '}
          {mmss}
          {st.who && ` · ${st.who} 님이 걸었습니다`}
        </span>
        <span className="sp" />
        {st.on ? (
          <button className="btn danger" type="button" onClick={onStop}>
            ⏹ 중지
          </button>
        ) : (
          <button className="btn" type="button" onClick={onExit}>
            표로 돌아가기 →
          </button>
        )}
      </div>
      <div className="cy-run-prog" aria-hidden="true">
        <span style={{ width: `${Math.round(prog * 100)}%` }} />
      </div>

      <div className="cy-run-cols">
        <div className="cy-run-q scroll" ref={queueRef}>
          <div className="cy-q-h">항목 큐 — 도는 항목을 따라갑니다</div>
          {items.map((it, i) => {
            const v = itemVerdict(it)
            const now = st.on && st.itemAt === i
            const wait = st.on && i > st.itemAt && v === ''
            return (
              <div key={`${it.tcid}-${i}`} className={`cy-q-row${now ? ' now' : ''}`}>
                {now ? (
                  <span className="cy-run-dot" aria-hidden="true" />
                ) : (
                  <i className={`cy-q-v ${verdictClass(v)}`} aria-hidden="true" />
                )}
                <span className="cy-q-id" title={it.name || it.tcid}>
                  {it.tcid}
                </span>
                {isRegress(it) && (
                  <b className="cy-regchip" title={`${prevName || '지난 사이클'} 에선 Pass`}>
                    회귀
                  </b>
                )}
                <span className={`cy-q-lb status ${verdictClass(v)}`}>
                  {now
                    ? st.stepCount > 0
                      ? `${st.stepAt + 1}/${st.stepCount}`
                      : '…'
                    : wait
                      ? '대기'
                      : verdictLabel(v)}
                </span>
              </div>
            )
          })}
        </div>

        <div className="cy-run-live">
          <div className="cy-run-liveh">
            <b>{st.itemName || (done ? '실행 기록' : '…')}</b>
            {st.stepName && <span className="muted small">{st.stepName}</span>}
            {st.error && <span className="tc-err">{st.error}</span>}
          </div>
          <div
            className="cy-run-term"
            ref={termRef}
            onScroll={() => {
              const el = termRef.current
              if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
            }}
          >
            {st.log.length === 0 && (
              <div className="cy-run-wait">
                {st.waiting ? '실행기가 집어 가기를 기다립니다…' : '아직 받은 것이 없습니다'}
              </div>
            )}
            {st.log.slice(-400).map((l, i) => (
              <div key={i} className={`cy-run-ln ${l.kind}`}>
                {l.i >= 0 && <i>#{l.i + 1}</i>}
                {l.text}
              </div>
            ))}
          </div>
        </div>
      </div>

      {done && (
        <div className="cy-run-sum">
          <b>결과</b>
          <span className="status pass">Pass {counts['Pass'] ?? 0}</span>
          <span className="status fail">Fail {counts['Fail'] ?? 0}</span>
          {regress > 0 ? (
            <span className="status fail">
              회귀 {regress}
              {prevName && ` — ${prevName} 에선 Pass`}
            </span>
          ) : (
            <span className="muted small">회귀 0{prevName && ` (vs ${prevName})`}</span>
          )}
          <span className="muted small">미실행 {counts[''] ?? 0}</span>
          <span className="sp" />
          <button className="btn primary" type="button" onClick={onExit}>
            표로 돌아가기 →
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * 항목 줄 우클릭 메뉴 — 결과·담당자·메모 고치기.
 *
 * 위 단추 줄에서 Edit·Bulk Edit 를 뺐으니 여기 둔다. 한 건이면 「고치기」,
 * 여럿이면 「N건 한꺼번에 고치기」 — 창은 같은 것이다.
 */
function CycleRowMenu({
  at,
  count,
  onClose,
  onEdit,
  onGoTc,
}: {
  at: { x: number; y: number }
  count: number
  onClose: () => void
  onEdit: () => void
  /** TC ID 열을 뺐다 — 시험으로 가는 길은 여기다 */
  onGoTc?: () => void
}) {
  useEffect(() => {
    const away = () => onClose()
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const t = setTimeout(() => {
      window.addEventListener('mousedown', away)
      window.addEventListener('contextmenu', away)
    }, 0)
    window.addEventListener('keydown', esc)
    return () => {
      clearTimeout(t)
      window.removeEventListener('mousedown', away)
      window.removeEventListener('contextmenu', away)
      window.removeEventListener('keydown', esc)
    }
  }, [onClose])

  return (
    <div
      className="cy-menu"
      style={{ left: at.x, top: at.y }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button type="button" onClick={onEdit}>
        {count > 1 ? `${count}건 한꺼번에 고치기` : '고치기 (결과·담당자·메모)'}
      </button>
      {onGoTc && (
        <button type="button" onClick={onGoTc}>
          시험 열기 (TC)
        </button>
      )}
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
type MenuEntry = { label: string; fn?: () => void; disabled?: boolean } | 'hr'

function FolderMenu({
  at,
  entries,
  onClose,
}: {
  at: { node: Node; x: number; y: number }
  entries: MenuEntry[]
  onClose: () => void
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

  return (
    <div
      className="cy-menu"
      style={{ left: at.x, top: at.y }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {entries.map((en, i) =>
        en === 'hr' ? (
          <hr key={i} />
        ) : (
          <button key={i} type="button" disabled={en.disabled} onClick={en.fn}>
            {en.label}
          </button>
        ),
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
