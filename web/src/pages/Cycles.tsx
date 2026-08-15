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
  _created_at_pg?: string | null
  /** 부여 ID — C-<연2><주차2>-<순번3>. 서버가 매긴다 */
  cid?: string | null
  created_by?: string | null
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
  /** 잎이면 사이클 하나 (트리가 버전그룹까지만이라 이제 안 만든다) */
  cycle?: CycleMeta
  /** 이 폴더(버전그룹)에 바로 담긴 사이클들 — 오른쪽 표가 그린다 */
  cycles?: CycleMeta[]
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
  return [...(n.cycles ?? []), ...n.children.flatMap(cyclesUnder)]
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
  // 트리는 버전그룹(폴더)까지만 — 사이클은 잎이 아니라 폴더에 담긴다.
  // 오른쪽 표가 그 버전들을 그린다.
  for (const c of cycles) {
    const t = ensure(pathOfCycle(c, famOf))
    t.node.cycles = [...(t.node.cycles ?? []), c]
  }

  const srt = (a: string, b: string) => a.localeCompare(b, 'ko')
  const finish = (t: T): Node => {
    const folders = [...t.kids.values()]
      .sort((a, b) => srt(a.node.label, b.node.label))
      .map(finish)
    t.node.children = folders
    t.node.count =
      folders.reduce((a, n) => a + n.count, 0) + (t.node.cycles?.length ?? 0)
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

  /** 사이클 복제 — 항목 구성 그대로 한 벌 더 (표 도구줄의 「복제」) */
  const dupCycle = async (id: string) => {
    try {
      const r = await apiFetch(`/api/cycle/${encodeURIComponent(id)}`)
      if (!r.ok) throw new Error(String(r.status))
      const full = (await r.json()) as Record<string, unknown>
      const nid = `cycle-${Date.now()}`
      const w = await apiFetch(`/api/cycle/${encodeURIComponent(nid)}`, {
        method: 'POST',
        body: JSON.stringify({
          ...full,
          id: nid,
          version: `${String(full.version ?? '')}_copy`,
          name: full.name ? `${String(full.name)} (복제)` : full.name,
        }),
      })
      if (!w.ok) throw new Error(String(w.status))
      await listQ.refetch()
    } catch (e) {
      window.alert(`복제하지 못했습니다 — ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  /** 고른 사이클 삭제 — 실행 결과도 같이 사라지니 묻고 지운다 */
  const delCycles = async (ids: string[]) => {
    if (!ids.length) return
    if (
      !window.confirm(`사이클 ${ids.length}건을 지웁니다.\n각 회차의 실행 결과도 함께 사라집니다.`)
    )
      return
    for (const id of ids) {
      try {
        await apiFetch(`/api/cycle/${encodeURIComponent(id)}`, { method: 'DELETE' })
      } catch {
        /* 건별 — 하나 실패해도 나머지는 지운다 */
      }
    }
    await listQ.refetch()
  }

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
            onPick={(id) => setSel(id)}
            onNew={() => setMaking(true)}
            onDup={(id) => void dupCycle(id)}
            onDel={(ids) => void delCycles(ids)}
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
/** 인라인 항목 카드의 고를 수 있는 필드 — 시험항목(Coverage) ⚙ 과 같은 목록 */
const IT_COLS: Array<{ k: string; label: string; w: string }> = [
  { k: 'model_group', label: '모델그룹', w: '90px' },
  { k: 'model', label: '모델명', w: '90px' },
  { k: 'type', label: '유형', w: '88px' },
  { k: 'severity', label: '심각도', w: '70px' },
  { k: 'run_type', label: '실행 타입', w: '72px' },
  { k: 'map', label: 'REQ Map', w: '70px' },
  { k: 'created_by', label: '생성자', w: '76px' },
  { k: 'updated_by', label: '변경자', w: '76px' },
  { k: 'updated', label: '변경일', w: '84px' },
  { k: 'status', label: '상태', w: '70px' },
]

function CycleBoard({
  cycles,
  onPick,
  onNew,
  onDup,
  onDel,
}: {
  cycles: CycleMeta[]
  onPick: (id: string) => void
  /** 추가 — 새 사이클 만들기 */
  onNew: () => void
  /** 복제 — 한 개 골랐을 때 */
  onDup: (id: string) => void
  /** 삭제 — 고른 것들 */
  onDel: (ids: string[]) => void
}) {
  const [q, setQ] = useState('')
  const [failOnly, setFailOnly] = useState(false)
  /** 머리글 클릭 정렬 — 열 이름 옆 화살표가 방향을 보여 준다 */
  const [sortCol, setSortCol] = useState('')
  const [sortDir, setSortDir] = useState<1 | -1>(1)
  const clickSort = (c: string) => {
    if (sortCol === c) setSortDir((d) => (d === 1 ? -1 : 1))
    else {
      setSortCol(c)
      setSortDir(1)
    }
  }
  /** 줄 체크 — 삭제·복제가 이걸 본다 */
  const [picked, setPicked] = useState<Set<string>>(new Set())
  /** 인라인으로 펼친 사이클들 — 시험 항목이 줄 밑에 보인다 */
  const [exp, setExp] = useState<Set<string>>(new Set())

  /** 인라인 카드에 보일 필드 — 시험항목 화면과 같은 목록에서 ⚙ 로 고른다 */
  const [itCols, setItCols] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('utop.cycle.itcols')
      if (raw) return new Set(JSON.parse(raw) as string[])
    } catch {
      /* 깨진 저장값이면 기본으로 */
    }
    return new Set(['model_group', 'model', 'type', 'run_type'])
  })
  const toggleItCol = (k: string) =>
    setItCols((cur) => {
      const n = new Set(cur)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      localStorage.setItem('utop.cycle.itcols', JSON.stringify([...n]))
      return n
    })
  const [gearOpen, setGearOpen] = useState(false)
  // 켠 필드에 따라 칸 폭이 달라진다 — 머리줄·데이터줄이 같은 자를 쓴다
  const itGrid = useMemo(() => {
    const parts = ['108px', 'minmax(200px, 1fr)']
    for (const c of IT_COLS) if (itCols.has(c.k)) parts.push(c.w)
    parts.push('64px', '26px')
    return parts.join(' ')
  }, [itCols])

  /** 항목 카드의 모델그룹·유형·실행 타입 — TC 메타가 정본이다 */
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

  // 사이클별 집계는 한 번만 — 표·거름·정렬이 다 같이 쓴다
  const stats = useMemo(() => {
    const m = new Map<
      string,
      { total: number; done: number; pass: number; fail: number; pct: number; iss: number }
    >()
    for (const c of cycles) {
      const its = c.items ?? []
      let done = 0
      let pass = 0
      let fail = 0
      let iss = 0
      for (const it of its) {
        const v = itemVerdict(it)
        if (v) done += 1
        if (v === 'Pass') pass += 1
        else if (v === 'Fail') fail += 1
        iss += it.issues?.length ?? 0
      }
      m.set(c.id, {
        total: its.length,
        done,
        pass,
        fail,
        iss,
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
        [c.cid, c.id, c.version, c.name, c.version_group, c.model]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(nq),
      )
    if (failOnly) arr = arr.filter((c) => (stats.get(c.id)?.fail ?? 0) > 0)
    return arr
  }, [cycles, q, failOnly, stats])


  const fmtD = (v?: string | null) => (v ? String(v).slice(0, 10) : '–')
  const TH = (col: string, label: string, right?: boolean) => (
    <button
      type="button"
      className={`cyt-th${right ? ' tr' : ''}${sortCol === col ? ' on' : ''}`}
      onClick={() => clickSort(col)}
    >
      {label}
      <i>{sortCol === col ? (sortDir === 1 ? '↑' : '↓') : '⇅'}</i>
    </button>
  )

  return (
    <div className="cy-board scroll">
      {/* 시험항목 2열과 같은 카드 안에 도구줄·표가 든다 */}
      <section className="panel cyt-card">
      {/* 도구줄 — 추가·복제·삭제는 왼쪽, 찾기는 오른쪽 */}
      <div className="cy-tools">
        <button className="btn" type="button" onClick={onNew}>
          + New
        </button>
        <button
          className="btn"
          type="button"
          disabled={picked.size !== 1}
          title={picked.size === 1 ? '고른 사이클을 복제합니다' : '하나만 고르세요'}
          onClick={() => onDup([...picked][0]!)}
        >
          복제
        </button>
        <button
          className="btn danger"
          type="button"
          disabled={!picked.size}
          onClick={() => {
            onDel([...picked])
            setPicked(new Set())
          }}
        >
          삭제{picked.size ? ` (${picked.size})` : ''}
        </button>
        <span className="sp" />
        <input
          className="cy-q"
          placeholder="Search…"
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
      </div>

      <div className="cyt">
        <div className="cyt-row cyt-hd">
          <span className="cyt-ck">
            <input
              type="checkbox"
              checked={shown.length > 0 && picked.size === shown.length}
              ref={(el) => {
                if (el) el.indeterminate = picked.size > 0 && picked.size < shown.length
              }}
              onChange={() =>
                setPicked(picked.size === shown.length ? new Set() : new Set(shown.map((c) => c.id)))
              }
            />
          </span>
          <span />
          {TH('id', '사이클 ID')}
          {TH('name', '제목')}
          {TH('iss', '결함', true)}
          {TH('tests', '항목', true)}
          {TH('pct', '진행결과')}
          {TH('status', '상태')}
          {TH('version', '버전')}
          {TH('created', '생성일자')}
          {TH('updated', '변경일자')}
          {TH('creator', '생성자')}
          {TH('ass', '담당자')}
        </div>
        {(sortCol === ''
          ? shown
          : [...shown].sort((a, b) => {
                    const keyOf = (c2: CycleMeta): string | number => {
                      const t2 = stats.get(c2.id)
                      switch (sortCol) {
                        case 'id': return (c2.cid || c2.version || c2.name || c2.id).toLowerCase()
                        case 'iss': return t2?.iss ?? 0
                        case 'tests': return t2?.total ?? 0
                        case 'pct': return t2?.pct ?? 0
                        case 'status': return t2 && t2.total > 0 && t2.done === t2.total ? 2 : t2 && t2.done > 0 ? 1 : 0
                        case 'name': return (c2.name ?? '').toLowerCase()
                        case 'version': return (c2.version ?? '').toLowerCase()
                        case 'created': return c2._created_at_pg ?? ''
                        case 'updated': return c2._updated_at_pg ?? ''
                        case 'creator': return (c2.created_by ?? '').toLowerCase()
                        case 'ass': return (c2.assignee ?? '').toLowerCase()
                        default: return c2._updated_at_pg ?? ''
                      }
                    }
                    const av = keyOf(a)
                    const bv = keyOf(b)
                    return (av < bv ? -1 : av > bv ? 1 : 0) * sortDir
                  })
              ).map((c) => {
                const t = stats.get(c.id) ?? {
                  total: 0,
                  done: 0,
                  pass: 0,
                  fail: 0,
                  pct: 0,
                  iss: 0,
                }
                const status =
                  t.total > 0 && t.done === t.total ? 'done' : t.done > 0 ? 'run' : 'idle'
                const open = exp.has(c.id)
                return (
                  <React.Fragment key={c.id}>
                    <div className="cyt-row cyt-c">
                      <span className="cyt-ck">
                        <input
                          type="checkbox"
                          checked={picked.has(c.id)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() =>
                            setPicked((cur) => {
                              const n = new Set(cur)
                              if (n.has(c.id)) n.delete(c.id)
                              else n.add(c.id)
                              return n
                            })
                          }
                        />
                      </span>
                      {/* 인라인 펼침 — 이 사이클에 어떤 항목이 있나 */}
                      <button
                        type="button"
                        className={`cy-expcaret${open ? ' open' : ''}`}
                        title="시험 항목을 줄 밑에 펼쳐 봅니다"
                        aria-expanded={open}
                        onClick={() =>
                          setExp((cur) => {
                            const n = new Set(cur)
                            if (n.has(c.id)) n.delete(c.id)
                            else n.add(c.id)
                            return n
                          })
                        }
                      >
                        <IconChevron />
                      </button>
                      <button
                        type="button"
                        className="cyt-key"
                        title={`${c.id} — 실행 화면을 엽니다`}
                        onClick={() => onPick(c.id)}
                      >
                        {c.cid || c.version || c.name || c.id}
                      </button>
                      <button
                        type="button"
                        className="cyt-name cyt-ell"
                        title={c.name ?? ''}
                        onClick={() => onPick(c.id)}
                      >
                        {c.name || '–'}
                      </button>
                      <span className={`tr${t.iss ? ' cyt-fail' : ''}`}>{t.iss || '–'}</span>
                      <span className="tr">{t.total}</span>
                      <span
                        className="cy-prg"
                        title={`실행 ${t.done}/${t.total} · Pass ${t.pass} · Fail ${t.fail}`}
                      >
                        <span className="cy-prg-bar" aria-hidden="true">
                          <i className="p" style={{ flexGrow: t.pass }} />
                          <i className="f" style={{ flexGrow: t.fail }} />
                          <i
                            className="n"
                            style={{ flexGrow: Math.max(t.total - t.pass - t.fail, 0) }}
                          />
                        </span>
                        <b>{t.pct}%</b>
                      </span>
                      <span>
                        <i className={`cyt-st ${status}`}>
                          {status === 'done' ? 'DONE' : status === 'run' ? '진행중' : '대기'}
                        </i>
                      </span>
                      <span className="muted small cyt-ell" title={c.version ?? ''}>
                        {c.version || '–'}
                      </span>
                      <span className="muted small">{fmtD(c._created_at_pg)}</span>
                      <span className="muted small">{fmtD(c._updated_at_pg)}</span>
                      <span className="muted small cyt-ell" title={c.created_by ?? ''}>
                        {c.created_by || '–'}
                      </span>
                      <span className="muted small cyt-ell" title={c.assignee ?? ''}>
                        {c.assignee || '–'}
                      </span>
                    </div>
                    {/* 사이클 = 시험항목의 모음 — 펼치면 그 목록이 보인다.
                        여기서는 보기만, 항목을 누르면 실행 화면으로 */}
                    {open && (
                      <div className="cyt-itcard">
                        <div className="cyt-itrow cyt-ithd" style={{ gridTemplateColumns: itGrid }}>
                          <span>TC ID</span>
                          <span>이름</span>
                          {IT_COLS.filter((cc) => itCols.has(cc.k)).map((cc) => (
                            <span key={cc.k}>{cc.label}</span>
                          ))}
                          <span>결과</span>
                          <span className="cyt-gearc">
                            <button
                              type="button"
                              className="cyt-gear"
                              title="보일 필드 고르기 — 시험항목 화면과 같은 필드"
                              onClick={(e) => {
                                e.stopPropagation()
                                setGearOpen((v) => !v)
                              }}
                            >
                              ⚙
                            </button>
                            {gearOpen && (
                              <>
                                <span className="cyt-gearovl" onClick={() => setGearOpen(false)} />
                                <span className="cyt-gearpop">
                                  {IT_COLS.map((cc) => (
                                    <label key={cc.k}>
                                      <input
                                        type="checkbox"
                                        checked={itCols.has(cc.k)}
                                        onChange={() => toggleItCol(cc.k)}
                                      />
                                      {cc.label}
                                    </label>
                                  ))}
                                </span>
                              </>
                            )}
                          </span>
                        </div>
                        {(c.items ?? []).map((it, i2) => {
                          const v = itemVerdict(it)
                          const t2 = tcMeta.get(it.tcid)
                          const runType = String(t2?.kind ?? t2?.run_type ?? '') || '–'
                          return (
                            <div
                              key={`${it.tcid}-${i2}`}
                              className="cyt-itrow cyt-it"
                              style={{ gridTemplateColumns: itGrid }}
                              role="button"
                              tabIndex={0}
                              title="실행 화면에서 엽니다"
                              onClick={() => onPick(c.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') onPick(c.id)
                              }}
                            >
                              <b className="cyt-ittc">{it.tcid}</b>
                              <span className="cyt-ell">{it.name || String(t2?.name ?? '')}</span>
                              {IT_COLS.filter((cc) => itCols.has(cc.k)).map((cc) => {
                                if (cc.k === 'type')
                                  return (
                                    <span key={cc.k}>
                                      {t2?.type ? <i className="cyt-tag">{String(t2.type)}</i> : '–'}
                                    </span>
                                  )
                                if (cc.k === 'run_type')
                                  return (
                                    <span key={cc.k} className="muted small">
                                      {runType}
                                    </span>
                                  )
                                if (cc.k === 'map')
                                  return (
                                    <span key={cc.k} className="muted small">
                                      {t2?.req_id ? 'Map 1' : '–'}
                                    </span>
                                  )
                                if (cc.k === 'updated')
                                  return (
                                    <span key={cc.k} className="muted small">
                                      {String(t2?._updated_at_pg ?? '').slice(0, 10) || '–'}
                                    </span>
                                  )
                                const raw = String((t2 as Record<string, unknown> | undefined)?.[cc.k] ?? '')
                                return (
                                  <span key={cc.k} className="muted small cyt-ell">
                                    {raw || (cc.k === 'model_group' ? '공용' : cc.k === 'status' ? '미실행' : '–')}
                                  </span>
                                )
                              })}
                              <span>
                                <em className={`cyt-itv ${verdictClass(v)}`}>{verdictLabel(v)}</em>
                              </span>
                              <span />
                            </div>
                          )
                        })}
                        {(c.items ?? []).length === 0 && (
                          <div className="muted small cyt-itempty">아직 시험 항목이 없습니다.</div>
                        )}
                      </div>
                    )}
                  </React.Fragment>
                )
              })}
      </div>
      {cycles.length === 0 && (
        <div className="empty">아직 사이클이 없습니다 — 위 + New 로 만드세요.</div>
      )}
      </section>
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
  /** 도는 항목 줄 — 따라가기 중이면 왼쪽 목록에서 화면에 붙잡아 둔다 */
  const runlineRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (st.on && follow)
      runlineRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [st.on, st.itemAt, follow])

  const colsRef = useRef<HTMLDivElement>(null)

  /** 고른 항목의 시험 문서(Objective·Precondition) — TC 가 정본이라 그때 읽는다 */
  const [tcDoc, setTcDoc] = useState<{ object_md?: string; precondition_md?: string } | null>(null)

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

  /**
   * ③ 좁혀 보기 — 결과(통계 카드)에 더해 심각도·타입·발생구분·글자로 거른다.
   *
   * 64건이 넘어가면 결과만으로는 못 좁힌다. 「고객이 낸 것 중 Blocker 만」
   * 같은 물음이 실제로 자주 나온다.
   */
  /** 내 담당만 — Zephyr 의 Show only assigned to me */
  const [fAss, setFAss] = useState('')
  const [fq, setFq] = useState('')


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
      if (fAss && String(it.assignee ?? '').trim() !== fAss) return false
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
  }, [items, only, onlyRegress, prevVerdict, fAss, fq])

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
  /** 지금 도는 항목이면 저장된 스텝 대신 받는 중인 것을 보여 준다 */
  const liveNow = st.on && followAt === st.itemAt && st.liveSteps.length > 0

  // 열어 둔 항목이 바뀌면 그 항목의 결함을 읽어 단추를 「등록/봄」 으로 가른다
  useEffect(() => {
    void loadItemDefect(cur?.tcid ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.tcid, cycle.id])

  // Objective·Precondition — 항목이 바뀔 때 그 시험(TC)에서 읽는다
  useEffect(() => {
    setTcDoc(null)
    const id = cur?.tcid
    if (!id) return
    let dead = false
    apiFetch(`/api/tc/${encodeURIComponent(id)}`)
      .then(async (r) => {
        if (!r.ok || dead) return
        const j = (await r.json()) as {
          data?: { object_md?: string; precondition_md?: string }
          object_md?: string
          precondition_md?: string
        }
        if (!dead) setTcDoc(j.data ?? j)
      })
      .catch(() => {
        /* 문서를 못 읽어도 실행은 계속된다 */
      })
    return () => {
      dead = true
    }
  }, [cur?.tcid])

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
        {/* 실행 — Zephyr 의 Start a new test execution 자리 */}
        {st.on ? (
          <button className="btn danger small" type="button" onClick={() => void stop()}>
            ⏹ 멈추기
          </button>
        ) : (
          <>
            {pick.size > 0 && (
              <button
                className="btn primary small"
                type="button"
                disabled={saving}
                title={`고른 ${pick.size}건을 돌립니다`}
                onClick={() => startRun([...pick].sort((a, b) => a - b))}
              >
                ▶ 실행 ({pick.size})
              </button>
            )}
            <button
              className="btn small"
              type="button"
              disabled={!items.length || saving}
              onClick={() => startRun(items.map((_, i) => i))}
            >
              ▶ 전체 실행 ({items.length})
            </button>
          </>
        )}
        {/* 어쩌다 한 번 쓰는 것들은 「⋯」 안에 둔다 */}
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
          onRemove={() => {
            const n = pick.size || 1
            const ids = new Set(
              (pick.size ? [...pick] : [rowMenu.at]).map((i2) => items[i2]?.tcid).filter(Boolean),
            )
            setRowMenu(null)
            if (!window.confirm(`고른 ${n}건을 이 사이클에서 뺍니다.`)) return
            void saveItems((cur2) => cur2.filter((x) => !ids.has(x.tcid))).then(sel.clear)
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



      </section>

      {/* Test Player — 왼쪽에서 항목을 고르고, 오른쪽에서 시험한다.
          Zephyr 실행 화면 문법: 목록은 좁게, 절차·판정·기록은 넓게. */}
      <div className="cxp">
        <aside className="cxp-side">
          <div className="cxp-sh">
            <label className="rq-selall" title="보이는 것 전부 고르기">
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
            </label>
            <b>Test Cases</b>
            <i className="cxp-n">{rows.length}</i>
            <span className="sp" />
            {pick.size > 0 && <span className="muted small">{pick.size} 고름</span>}
            <button
              className="btn small"
              type="button"
              title="이 사이클에 시험 항목을 넣습니다"
              onClick={() => setAdding(true)}
            >
              ＋
            </button>
          </div>
          {/* 찾기 + 내 것만 — Zephyr 왼쪽 목록의 도구 그대로 */}
          <div className="cxp-tools">
            <input
              className="cxp-q"
              placeholder="TC ID · 제목 검색"
              value={fq}
              onChange={(e) => setFq(e.target.value)}
            />
            <label className="cxp-mine" title="내가 담당인 항목만 봅니다">
              <input
                type="checkbox"
                checked={fAss !== ''}
                onChange={(e) => setFAss(e.target.checked ? meName : '')}
              />
              내 것만
            </label>
          </div>
          {/* 결과로 좁히기 — 누르면 그 결과만, 다시 누르면 전부 */}
          <div className="cxp-chips">
            <button
              type="button"
              className={only === null && !onlyRegress ? 'on' : ''}
              onClick={() => {
                setOnly(null)
                setOnlyRegress(false)
              }}
            >
              전체 {items.length}
            </button>
            <button
              type="button"
              className={`cp${only === 'Pass' ? ' on' : ''}`}
              onClick={() => {
                setOnlyRegress(false)
                setOnly(only === 'Pass' ? null : 'Pass')
              }}
            >
              Pass {counts['Pass'] ?? 0}
            </button>
            <button
              type="button"
              className={`cf${only === 'Fail' ? ' on' : ''}`}
              onClick={() => {
                setOnlyRegress(false)
                setOnly(only === 'Fail' ? null : 'Fail')
              }}
            >
              Fail {counts['Fail'] ?? 0}
            </button>
            <button
              type="button"
              className={only === '' ? 'on' : ''}
              onClick={() => {
                setOnlyRegress(false)
                setOnly(only === '' ? null : '')
              }}
            >
              미실행 {counts[''] ?? 0}
            </button>
            {others.length > 0 && (
              <button
                type="button"
                className={`cr${onlyRegress ? ' on' : ''}`}
                title={
                  prev
                    ? `${prev.version || prev.name || '지난 사이클'} 에선 Pass 였는데 이번에 Fail 인 것`
                    : '비교할 지난 사이클이 없습니다'
                }
                onClick={() => setOnlyRegress((v) => !v)}
              >
                회귀 {prev && prevVerdict.size ? regressN : '–'}
              </button>
            )}
          </div>
          <div className="cxp-rows scroll">
            {rows.map((it, i) => {
              const at = items.indexOf(it)
              const rid = String(it.req_id ?? '')
              const newGroup = i === 0 || String(rows[i - 1]?.req_id ?? '') !== rid
              const liveHere = st.on && st.itemAt === at && st.liveSteps.length > 0
              const shown = liveHere
                ? ({ ...it, steps: st.liveSteps as CycleStep[], result: '' })
                : it
              const v = itemVerdict(shown)
              const on = followAt === at
              return (
                <React.Fragment key={`${it.tcid}-${i}`}>
                  {newGroup && (
                    <div className="cxp-grow" title={rid || '요구사항 없음'}>
                      <b>{reqName.get(rid) || rid || '(요구사항 없음)'}</b>
                      {(() => {
                        const label = reqIdOf.get(rid) || (rid.startsWith('rq-') ? '' : rid)
                        return label ? <span className="muted small"> {label}</span> : null
                      })()}
                    </div>
                  )}
                  <div
                    className={`cxp-row v-${verdictClass(v)}${on ? ' on' : ''}${
                      pick.has(at) ? ' picked' : ''
                    }${st.itemAt === at && st.on ? ' running' : ''}`}
                    ref={st.on && st.itemAt === at ? runlineRef : undefined}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setOpenItem(at)
                      setFollow(false)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setOpenItem(at)
                        setFollow(false)
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      if (!pick.has(at)) sel.set([at])
                      setRowMenu({ at, x: e.clientX, y: e.clientY })
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={pick.has(at)}
                      aria-label={`${it.name || it.tcid} 고르기`}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => {
                        const n = new Set(pick)
                        if (n.has(at)) n.delete(at)
                        else n.add(at)
                        sel.set([...n])
                      }}
                    />
                    <span className="cxp-rmain">
                      <span className="cxp-r1">
                        <b className="cxp-tcid">{it.tcid || '–'}</b>
                        {/* 사람 일인가 장비 일인가 — 목록에서 갈려야 한다 */}
                        {(() => {
                          const kd = kindOf(shown.steps ?? [])
                          return kd ? (
                            <i className={`cxp-k ${kd}`}>
                              {kd === 'manual' ? 'M' : kd === 'auto' ? 'A' : 'M+A'}
                            </i>
                          ) : null
                        })()}
                        {/* 나 말고 누가 이 항목을 보는 중인가 */}
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
                      </span>
                      <span className="cxp-nm" title={it.name || it.tcid}>
                        {it.name || it.tcid}
                      </span>
                    </span>
                    {st.itemAt === at && st.on && <i className="cxp-live" title="실행 중" />}
                    {isRegress(it) && (
                      <b className="cy-regchip" title="지난 사이클에선 Pass 였습니다">
                        회귀
                      </b>
                    )}
                    <i className={`cxp-v ${verdictClass(v)}`} title={verdictLabel(v)} />
                  </div>
                </React.Fragment>
              )
            })}
            {rows.length === 0 && <div className="empty">해당하는 항목이 없습니다.</div>}
          </div>
        </aside>

        <section className="cxp-main scroll">
          {cur ? (
            <>
              <div className="cxp-h">
                <b className="cxp-hid">{cur.tcid}</b>
                <h3 className="cxp-hnm">{cur.name || cur.tcid}</h3>
                <span className="sp" />
                <select
                  className={`cy-v cxp-big ${verdictClass(itemVerdict(liveNow ? { ...cur, steps: st.liveSteps, result: '' } : cur))}`}
                  value={itemVerdict(cur)}
                  title="결과를 손으로 정합니다"
                  onChange={(e) =>
                    void setResult(cur.tcid, e.target.value === '' ? '미실행' : e.target.value)
                  }
                >
                  {RESULTS.map((r) => (
                    <option key={r.v} value={r.v}>
                      {r.label}
                    </option>
                  ))}
                </select>
                {!st.on && (
                  <button
                    className="btn primary small"
                    type="button"
                    title="이 항목만 돌립니다"
                    disabled={saving}
                    onClick={() => followAt >= 0 && startRun([followAt])}
                  >
                    ▶ 실행
                  </button>
                )}
              </div>

              {/* Execution 정보 — Zephyr 의 Execution 칸과 같은 자리 */}
              <div className="cxp-exec">
                <div>
                  <i>Environment</i>
                  <b>{cycle.model || '–'}</b>
                </div>
                <div>
                  <i>Version</i>
                  <b>{cycle.version || '–'}</b>
                </div>
                <div>
                  <i>Iteration</i>
                  <b>{cycle.version_group || '–'}</b>
                </div>
                <div>
                  <i>Assigned To</i>
                  <b>{cur.assignee || '–'}</b>
                </div>
                <div>
                  <i>Executed by</i>
                  <b>{cur.executed_by || '–'}</b>
                </div>
                <div>
                  <i>실행 시각</i>
                  <b>{cur.executed_at ? String(cur.executed_at).slice(0, 16) : '–'}</b>
                </div>
              </div>

              {/* Objective · Precondition — 시험(TC)이 정본으로 들고 있다 */}
              <TpSec title="Objective" body={tcDoc?.object_md} />
              <TpSec title="Precondition" body={tcDoc?.precondition_md} />

              {/* Details — 절차와 판정. 기존 스텝 카드 그대로 */}
              <div className="cxp-dt">Details</div>
              <StepDetail
                key={cur.tcid ?? ''}
                item={liveNow ? { ...cur, steps: st.liveSteps } : cur}
                runningAt={liveNow ? st.stepAt : -1}
                onSetStep={(at2, v2) => void setStepResult(cur.tcid ?? '', at2, v2)}
                onSetImg={(at2, file) => void setStepImg(cur.tcid ?? '', at2, file)}
                onSetImgUrl={(at2, url) => void setStepField(cur.tcid ?? '', at2, { actual_img: url })}
                onSetTxt={(at2, txt) => void setStepField(cur.tcid ?? '', at2, { actual_txt: txt })}
                onIssue={
                  itemVerdict(cur) === 'Fail' || itemDefect ? () => setDefectFor(cur) : undefined
                }
                defect={itemDefect}
                onClose={() => setOpenItem(-1)}
              />
            </>
          ) : (
            <div className="empty">왼쪽에서 항목을 고르면 여기서 시험합니다.</div>
          )}
        </section>
      </div>
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
/** 접이식 섹션 — Zephyr 실행 화면의 Objective·Precondition 자리 */
function TpSec({ title, body }: { title: string; body?: string | null }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="cxp-sec">
      <button type="button" className="cxp-sec-h" onClick={() => setOpen((v) => !v)}>
        <span className={`cxp-sec-c${open ? ' open' : ''}`} aria-hidden="true">
          <IconChevron />
        </span>
        {title}
      </button>
      {open && (
        <div className="cxp-sec-b">
          {body?.trim() ? body : <span className="muted">None</span>}
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
  onRemove,
}: {
  at: { x: number; y: number }
  count: number
  onClose: () => void
  onEdit: () => void
  /** TC ID 열을 뺐다 — 시험으로 가는 길은 여기다 */
  onGoTc?: () => void
  /** 사이클에서 빼기 — 위 단추 줄을 걷어냈으니 여기가 길이다 */
  onRemove?: () => void
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
      {onRemove && (
        <button type="button" className="danger" onClick={onRemove}>
          사이클에서 빼기{count > 1 ? ` (${count})` : ''}
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
