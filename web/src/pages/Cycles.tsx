import React, { useEffect, useMemo, useRef, useState } from 'react'
import { resolveMode, type ModeGot } from '@/lib/runMode'
import { prefGet, prefSet, prefRemove } from '@/lib/prefs'
import IdPill from '@/components/IdPill'
import Markdown from '@/components/Markdown'
import { createPortal } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, projectApi } from '@/api/client'
import { currentProjects } from '@/components/ProjectPicker'
import Resizer, { useResizableWidth } from '@/components/Resizer'
import { goto, onGoto, reflectUrl, gotoHref } from '@/api/goto'
import CycleEdit from '@/components/cycle/CycleEdit'
import CycleReport from '@/components/cycle/CycleReport'
import StepCards from '@/components/cycle/StepCards'
import CycleItemEdit from '@/components/cycle/CycleItemEdit'
import CycleInsight from '@/components/cycle/CycleInsight'
import CyclePlan from '@/components/cycle/CyclePlan'
import { MakePlanRun, PlanRunPopup } from '@/components/cycle/PlanRunPopup'
import DefectDialog, { type DefectRec } from '@/components/cycle/DefectDialog'
import { useCycleRun } from '@/components/cycle/useCycleRun'
import NTable from '@/components/ntable/NTable'
import PlanSummary from '@/components/cycle/PlanSummary'
import NViews, { type ViewBody, type ViewDef } from '@/components/ntable/NViews'
import { useNFields } from '@/components/ntable/useNFields'
import { EMPTY_VIEW, type NCalc, type NCol, type NRow, type NView } from '@/components/ntable/types'
import { IcAuto, IcManual } from '@/components/ntable/NIcons'
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
  IconAccounts,
  IconClock,
  IconHand,
  IconNote,
  IconPing,
  IconPlay,
  IconWave,
  IconReqDoc,
  IconSettings,
  IconSparkle,
  IconSlide,
  IconTag,
  IconTrash,
} from '@/components/icons'
import type { TestCaseMeta } from '@/types'
import { isJudgeStep, stepVerdict, type StepRound, type TcStep } from '@/components/tc/types'
// 요구사항 화면의 트리 규칙을 그대로 쓴다 — 줄 높이·색·여백이 한 곳에서만
// 정해져야 세 화면이 같아 보인다.
import '@/components/ReqTree.css'
import './Cycles.css'

/** 플랜 한 건 — 목록용 요약(`/api/cycle?meta=1`) */
export interface CycleMeta {
  /** 제품군 스냅샷 — 표에서 직접 고를 수 있다(지시). 비면 카탈로그에서 파생 */
  family?: string | null
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
  /** 플랜 상태 — 설정 → 플랜 INFO 필드 값 */
  status?: string | null
  /** AI 요약 — 목록 응답(data_summary)에 그대로 실려 온다 */
  ai_summary?: { text?: string; at?: string } | null
  /** 실행 ID — 플랜 ID 에서 파생 (C-2633-002 → CE-2633-002). 첫 Run 때 박힌다 */
  ce?: string | null
  description?: string | null
  /** 복제 원본 플랜 id */
  cloned_from?: string | null
  /** 자유 폴더 경로 (예: L3/E6100/R100). 비면 모델·버전그룹에서 파생 */
  folder?: string | null
  items?: CycleItemLite[]
}

/** 항목 요약 — 결과는 저장돼 있지 않고 스텝에서 계산한다 */
export interface CycleItemLite {
  tcid: string
  req_id?: string | null
  /** 항목 실행 ID — CETC-<플랜 파생>-NN */
  ceid?: string | null
  /** 사람이 손으로 정한 결과. 있으면 스텝 집계보다 이것이 이긴다 */
  result?: string | null
  name?: string | null
  assignee?: string | null
  executed_at?: string | null
  executed_by?: string | null
  executed_auto?: boolean
  /** 이 항목이 붙는 장비 — 자동 점유가 이것으로 자리를 잡는다 */
  devId?: string | null
  devName?: string | null
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
  /** 주석(comment)·메시지(message) 스텝의 본문 */
  text?: string | null
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
  /** 수동 시험 「판정 기준 및 RCA」 — 왜 그렇게 판정했나, 원인은 무엇인가 */
  rca?: string | null
  manual?: boolean
  /**
   * 계측기 스텝.
   *
   * CLI 는 「무엇을 보냈나(cli)」 와 「무엇이 나와야 하나(criteria)」 가
   * 칸에 있는데 계측기는 그 둘이 없다. 그래서 플랜 카드에 ACTUAL DATA
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

/** 결과 상태 한 벌 — 시스템(Pass·Fail·미실행 등) + 설정에서 늘린 것 */
export interface ResDef {
  v: string
  label: string
  cls: string
  /** 바탕색 — 설정 「실행 판정 기준」 */
  color?: string
  /** 글자색 — 같은 자리에서 따로 고른다 */
  fg?: string
  /** 집계 계열 — pass 는 통과로, fail 은 실패로 센다 */
  group: 'pass' | 'fail' | 'neutral' | 'none'
}

export function useResults(): ResDef[] {
  const codesQ = useQuery({
    queryKey: ['codes'],
    queryFn: async () => {
      const r = await apiFetch('/api/codes')
      if (!r.ok) throw new Error('코드를 불러오지 못했습니다')
      return (await r.json()) as {
        items: Array<{ kind: string; value: string; note?: string | null }>
      }
    },
    staleTime: 60_000,
  })
  return useMemo(() => {
    const base: ResDef[] = RESULTS.map((r) => ({
      ...r,
      group: r.v === 'Pass' ? 'pass' : r.v === 'Fail' ? 'fail' : r.v === '' ? 'none' : 'neutral',
    }))
    for (const i of codesQ.data?.items ?? []) {
      if (i.kind !== 'cycle_result') continue
      const val = i.value.trim()
      let meta: { color?: string; fg?: string; label?: string; group?: string } = {}
      try {
        meta = JSON.parse(i.note || '{}') as typeof meta
      } catch {
        /* 옛 자료 */
      }
      const g = meta.group === 'pass' || meta.group === 'fail' ? meta.group : 'neutral'
      /* 기본 여섯과 같은 값이면 **덮어쓴다**(설정 → 실행 판정 기준에서
         색을 바꿀 수 있어야 한다). 값이 비면(미실행) 그것도 기본이다. */
      const at = base.findIndex((b) => b.v === val)
      if (at >= 0) {
        const cur = base[at]
        /* 색과 **글자**를 설정이 덮는다(지시: Pass 를 PASS 로). 값은 그대로라
           판정 규칙·저장된 결과는 안 흔들린다 — 보이는 글자만 바뀐다 */
        if (cur && (meta.color || meta.fg || meta.label))
          base[at] = {
            ...cur,
            color: meta.color ?? cur.color,
            fg: meta.fg ?? cur.fg,
            label: meta.label || cur.label,
          }
        continue
      }
      if (!val) continue
      base.push({ v: val, label: meta.label || val, cls: 'custom', color: meta.color, fg: meta.fg, group: g })
    }
    return base
  }, [codesQ.data])
}

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
 * 알려면 항목을 열고 스텝을 하나씩 눌러 들어가야 했다. 64건짜리 플랜에서
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
export function kindOf(steps: CycleStep[]): 'manual' | 'auto' | 'mixed' | '' {
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



/** 보던 자리를 기억한다 — 화면 이름은 App 이, 그 안은 여기가 */
const CY_SEL_KEY = 'utop.cycle.sel'

/** 트리 맨 위 한 자리. 아래로 사업자 → 제품군 → 모델그룹 → 모델명 →
    버전그룹 여섯 층이 선다(지시). 층이 정해져 있어야 두 사람이 같은 회차를
    같은 자리에서 찾는다. */
const ROOT = 'Root'
/** 트리 열쇠에서 맨 위 한 자리를 뗀다 — 저장(KV)에는 Root 를 안 넣는다 */
/** 기존 결과 배지 — 칸이 좁아 한 글자로(지시). 뜻은 말풍선이 받친다 */
function shortVerdict(v: string): string {
  const t = String(v ?? '').trim()
  if (t === 'Pass') return 'P'
  if (t === 'Fail') return 'F'
  if (t === 'WIP') return 'W'
  if (t === 'Blocked') return 'B'
  if (t === '진행불가') return 'X'
  return t.slice(0, 1) || '–'
}

export function bareKey(key: string): string {
  if (key === ROOT) return ''
  return key.startsWith(ROOT + '/') ? key.slice(ROOT.length + 1) : key
}




interface PageProps {
  /** 보기(탭) 공용 승격이 관리자만이라 role 이 필요하다 */
  me?: { username?: string; name?: string; role?: string } | null
}

export default function Cycles({ me, entry = 'cycles' }: PageProps & { entry?: 'cycles' | 'runs' }) {
  /**
   * 새로고침해도 보던 자리로 돌아온다.
   *
   * TC 화면은 이미 그렇게 하는데(`utop.tc.open`) 플랜만 안 하고 있었다.
   * 새로고침하면 트리가 통째로 접히고 「왼쪽에서 플랜을 고르세요」 로
   * 튕겨서, 64건짜리를 보다가 매번 다시 찾아 들어가야 했다.
   */
  const qc = useQueryClient()
  const [making, setMaking] = useState(false)
  /** 우클릭 메뉴 — 어느 플랜 위에서, 화면 어디에 */
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  /**
   * 우클릭 메뉴가 시킨 일 — 플랜 상세가 받아 한다.
   *
   * 메뉴는 트리(페이지)에 있고 그 일을 할 줄 아는 것은 상세라, 신호로
   * 건넨다. 숫자를 함께 올려 같은 일을 두 번 시켜도 전달된다.
   */
  const [act, setAct] = useState<{ what: 'details' | 'ai' | 'pptx' | 'run'; n: number } | null>(
    null,
  )

  /** 판정 한 벌 — 설정 「실행 판정 기준」 이 정본. 색을 CSS 로 푼다 */
  const resDefs = useResults()

  /** 폴더 우클릭 메뉴 — 폴더째 지우거나, 그 안 플랜을 한꺼번에 지운다 */
  /** 고칠 플랜 */
  const [editId, setEditId] = useState('')
  /** 말로 찾은 결과 — 만들기 창에 미리 채워 넣는다 */
  const [ask, setAsk] = useState<{ model: string; tcs: Array<{ tcid: string; name?: string | null; req_id?: string | null }> } | null>(null)
  /** 판정색 CSS 변수를 거는 큰 상자 */
  const splitRef = useRef<HTMLDivElement>(null)
  /** 실행 화면은 Run·제목·딥링크로만 들어간다 — localStorage 복원은
      목록에서 새로고침해도 실행 화면으로 끌려가는 사고를 냈다 */
  const [sel, setSel] = useState(
    () => new URLSearchParams(window.location.search).get('cycle') || '',
  )
  /** ?ce=CE-… 로 들어왔다 — 목록이 오면 그 플랜을 찾아 연다 */
  const [pendingCe, setPendingCe] = useState(
    () => new URLSearchParams(window.location.search).get('ce') || '',
  )
  /** ?it=CETC-… — 실행 화면이 열리면 그 항목을 바로 편다 (한 번만) */
  const [pendingIt] = useState(
    () => new URLSearchParams(window.location.search).get('it') || '',
  )
  // 고르면 주소창에 남긴다 — 옛 화면의 #cycle=… 과 같은 일
  // 링크·뒤로가기로 온 채 다른 플랜을 가리키면 갈아탄다
  useEffect(() => {
    prefSet(CY_SEL_KEY, sel)
  }, [sel])
  /** 이 화면(플랜 묶음)에 들어와 있는 사람들 — 상단 오른쪽 표시 몫 */
  const crowd = usePageCrowd('cycle')
  /* 표(목록) ↔ 플랜 — 표의 ID 를 누르면 플랜으로(지시). 기억한다:
     새로고침해도 보던 화면이 유지돼야 한다. */
  /* 실행 화면은 **Plans 안에 두지 않는다**(지시). 실행은 Runs 가 맡는다 —
     한 가지를 두 화면에서 하면 어느 쪽이 정본인지 갈린다. */
  const [cyView, setCyView] = useState<'list' | 'plan'>(() => {
    if (entry === 'runs') return 'list'
    const v = prefGet('utop.cycle.view')
    return v === 'plan' ? v : 'list'
  })
  /* 메뉴가 곧 얼굴이다(지시: 플랜과 Run 을 잘 구분) — Cycles 메뉴는
     계획(목록·플랜), Runs 메뉴는 실행. 메뉴를 오가면 얼굴도 따라간다. */
  useEffect(() => {
    /* 두 메뉴 다 목록으로 든다(레일을 뺐다) — Runs 에선 ID 를 누르면
       바로 실행 화면, Cycles 에선 플랜이다. */
    setCyView('list')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry])
  /** 이 플랜의 실행을 **Runs 에서** 연다 — 있으면 가장 최근 것, 없으면 하나 뜬다 */
  /** 팝업으로 연 실행 · 만들기 창을 띄운 플랜.
   *
   *  「▶ 실행」 은 **넘어가지 않고 팝업으로 연다**(지시). 플랜에서 항목을
   *  보다가 한 번 돌려 보고 그 자리로 돌아오는 것이 원래 하던 일이다 —
   *  화면을 갈아타면 보던 자리를 잃는다. */
  const [runPop, setRunPop] = useState<{ run: string; plan: string } | null>(null)
  const [mkRunFor, setMkRunFor] = useState('')

  const openRunOf = async (planId: string) => {
    if (!planId) return
    try {
      const r = await apiFetch(`/api/plan-runs?plan_id=${encodeURIComponent(planId)}`)
      const j = r.ok ? ((await r.json()) as { runs?: Array<{ id: string }> }) : { runs: [] }
      const got = (j.runs ?? [])[0]
      if (got) {
        setRunPop({ run: got.id, plan: planId })
        return
      }
      const p = cycles.find((c) => c.id === planId)
      const mk = await apiFetch('/api/plan-runs', {
        method: 'POST',
        body: JSON.stringify({
          plan_id: planId,
          version: p?.version ?? '',
          name: `${p?.name ?? p?.cid ?? planId} · ${p?.version ?? ''}`.trim(),
        }),
      })
      if (!mk.ok) throw new Error('실행을 만들지 못했습니다')
      const made = (await mk.json()) as { id?: string }
      if (made.id) setRunPop({ run: made.id, plan: planId })
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '실행을 열지 못했습니다')
    }
  }

  const goView = (v: 'list' | 'plan', id?: string) => {
    try {
      if (id) prefSet('utop.cycle.plan', id)
      prefSet('utop.cycle.view', v)
    } catch { /* 사생활 보호 모드 */ }
    setCyView(v)
  }

  /** 플랜 화면의 부속 창들 — 항목 추가·결과서·AI/메트릭스 */
  const [addToId, setAddToId] = useState('')
  const [planReport, setPlanReport] = useState<CycleMeta | null>(null)
  const [planInsight, setPlanInsight] = useState<{ c: CycleMeta; mode: 'ai' | 'metrics' } | null>(null)

  /** 복제 대화상자가 열린 플랜 id — 비면 닫힘 */
  const [cloneId, setCloneId] = useState('')

  /** 고른 플랜 삭제 — 실행 결과도 같이 사라지니 묻고 지운다 */
  const delCycles = async (ids: string[]) => {
    if (!ids.length) return
    if (
      !window.confirm(`플랜 ${ids.length}건을 지웁니다.\n각 회차의 실행 결과도 함께 사라집니다.`)
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
   * 지금 도는 실행 — 플랜을 안 열어 봐도 알아야 한다.
   *
   * 실행이 서버에서 도니 내 창에서 시작한 것이 아닐 수 있다. 목록에
   * 표시가 없으면 남이 돌리는 플랜을 열어서 또 걸게 된다 — 그러면
   * 「이미 돌고 있습니다」 로 막히고 나서야 안다. (트리를 걷어내며 함께
   * 지웠다가, 검증에서 이 회귀가 잡혀 표의 「진행」 칸으로 되살렸다.)
   */
  const runsQ = useQuery({
    queryKey: ['runs-active'],
    queryFn: async () => {
      const r = await apiFetch('/api/runs?active=1')
      if (!r.ok) return { runs: [] as Array<{ cycle_id: string; started_by?: string }> }
      return (await r.json()) as { runs: Array<{ cycle_id: string; started_by?: string }> }
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
      if (!r.ok) throw new Error('플랜을 불러오지 못했습니다')
      return (await r.json()) as { cycles: CycleMeta[] }
    },
  })

  /* 프로젝트 — 인라인 생성 때 사업자·모델그룹(·모델)을 자동으로 채운다(지시).
     상단바에서 고른 프로젝트가 기준이다. */
  const prjQ = useQuery({ queryKey: ['projects'], queryFn: ({ signal }) => projectApi.list(signal) })

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

  // 버전그룹만 사람이 만드는 폴더. 플랜이 아직 없는 것도 보여야 한다
  const vgQ = useQuery({
    queryKey: ['cycle-version-groups'],
    queryFn: async () => {
      const r = await apiFetch('/api/cycle-version-groups')
      if (!r.ok) throw new Error('버전그룹을 불러오지 못했습니다')
      return (await r.json()) as { groups: Record<string, string[]> }
    },
  })

  const cycles = useMemo(() => listQ.data?.cycles ?? [], [listQ.data])

  /**
   * 주소에 실을 번호 ↔ 내부 키.
   *
   * 내부 키(cycle-1787138135641)는 사람이 읽을 수도, 받아 적을 수도 없다.
   * 주소에는 화면에 보이는 번호(C-2633-003)를 싣고, 들어올 때는 **둘 다**
   * 받아 준다 — 옛 주소로 들어온 사람도 그대로 열려야 한다(지적).
   */
  const urlIdOf = (id: string) => {
    const c = cycles.find((x) => x.id === id)
    return String(c?.cid ?? '').trim() || id
  }
  const idOfUrl = (v: string) =>
    cycles.find((x) => x.id === v || String(x.cid ?? '').trim() === v)?.id ?? v

  useEffect(
    () =>
      onGoto((kind, id) => {
        /* 주소에는 사람이 읽는 번호(C-2633-003)를 싣는다 — 내부 키든
           그 번호든 받아 준다(지적: cycle-1787138135641 은 알 수 없는 값) */
        if (kind === 'cycle') {
          const real = idOfUrl(id)
          if (real !== sel) setSel(real)
        } else if (kind === 'ce') setPendingCe(id)
      }),
    [sel, cycles],
  )

  /* 주소로 들어왔을 때 목록이 아직 없으면 번호를 못 푼다 — 오면 그때 푼다 */
  useEffect(() => {
    if (!sel || !cycles.length) return
    if (cycles.some((c) => c.id === sel)) return
    const real = idOfUrl(sel)
    if (real !== sel) setSel(real)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycles, sel])

  /**
   * 계측기(IXIA·Spirent…)는 플랜 트리에서 뺀다 — 플랜은 유비쿼스
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
  /** 제조사 — 카탈로그 모델의 vendor */
  const vendorOf = useMemo(
    () => new Map(models.map((m) => [m.name, (m.vendor ?? '').trim()])),
    [models],
  )
  /** 모델그룹 — 플랜에 비어 있으면 카탈로그에서 보강한다 */
  const mgroupOf = useMemo(
    () => new Map(models.map((m) => [m.name, (m.model_group ?? '').trim()])),
    [models],
  )
  const cur = cycles.find((c) => c.id === sel)
  /*
   * **이 화면에 있다고 알린다.**
   *
   * 여태 플랜 목록에서는 아무도 알리지 않았다 — 알리는 곳이 플랜을 연
   * 뒤(CycleDetail)뿐이라, 목록만 보고 있으면 서버 명단에 안 올라 오른쪽
   * 위가 늘 비었다(지적). 목록에서는 `cycle`, 한 건을 열면 그 플랜 이름
   * 으로 알린다(연 뒤에는 CycleDetail 도 같은 이름을 알린다 — 같은 값이라
   * 부딪히지 않는다).
   */
  usePresence(cur ? `cycle:${cur.id}` : 'cycle', me?.name || me?.username || '')

  // ?ce=CE-… 링크 — 목록이 오면 그 플랜로
  useEffect(() => {
    if (!pendingCe || !cycles.length) return
    const hit = cycles.find((c) => String(c.ce ?? '') === pendingCe)
    if (hit) {
      setSel(hit.id)
      setPendingCe('')
    }
  }, [pendingCe, cycles])

  // 뒤로가기 — 주소에서 실행 파라미터가 사라졌으면 목록으로 돌아온다.
  // (App 의 popstate 는 파라미터가 「있을 때」 만 화면을 정한다)
  useEffect(() => {
    const h = () => {
      const p2 = new URLSearchParams(window.location.search)
      if (!p2.get('ce') && !p2.get('cycle')) setSel('')
    }
    window.addEventListener('popstate', h)
    return () => window.removeEventListener('popstate', h)
  }, [])

  // 실행 화면에 들어오면 CE·CETC 를 부여받는다 — 멱등이라 몇 번이어도 같다
  const minted = useRef('')
  useEffect(() => {
    if (!sel || minted.current === sel) return
    minted.current = sel
    void apiFetch(`/api/cycle/${encodeURIComponent(sel)}/exec-ids`, { method: 'POST' })
      .then(async (r) => {
        if (!r.ok) return
        const j = (await r.json()) as { changed?: boolean }
        if (j.changed) await listQ.refetch()
      })
      .catch(() => {
        /* 부여 실패해도 실행은 계속된다 */
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel])

  // 주소창 — 실행 중이면 ?ce=(항목은 CycleDetail 이 &it= 까지), 목록이면 깨끗이
  useEffect(() => {
    if (sel) {
      if (cur?.ce) return // CycleDetail 이 ?ce=…&it=… 을 쓴다
      reflectUrl('cycle', urlIdOf(sel))
    } else if (/[?&](cycle|ce|it)=/.test(window.location.search)) {
      // 남겨 두면 App 이 켜질 때 그 링크가 이겨서 새로고침마다 끌려간다
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [sel, cur])

  /** 시험 완료 — 전 항목에 결과가 차야 켜진다. 종료일을 적고 목록으로 */
  const allJudged =
    (cur?.items?.length ?? 0) > 0 && (cur?.items ?? []).every((it) => itemVerdict(it) !== '')
  const [finishing, setFinishing] = useState(false)
  const finishExec = async () => {
    if (!cur) return
    setFinishing(true)
    try {
      const r = await apiFetch(`/api/cycle/${encodeURIComponent(cur.id)}`)
      if (!r.ok) throw new Error(String(r.status))
      const full = (await r.json()) as Record<string, unknown>
      const w = await apiFetch(`/api/cycle/${encodeURIComponent(cur.id)}`, {
        method: 'POST',
        body: JSON.stringify({
          ...full,
          end_date: new Date().toISOString().slice(0, 10),
          updated_by: me?.name || me?.username || '',
        }),
      })
      if (!w.ok) throw new Error(String(w.status))
      /* 이 회차가 자동으로 잡아 둔 장비를 통째로 놓는다(지시) */
      await apiFetch(`/api/locks/by-cycle/${encodeURIComponent(cur.id)}`, { method: 'DELETE' }).catch(
        () => undefined,
      )
      qc.invalidateQueries({ queryKey: ['locks'] })
      setSel('')
      await listQ.refetch()
    } catch (e) {
      window.alert(e instanceof Error ? `완료 처리를 못 했습니다 — ${e.message}` : '완료 처리를 못 했습니다')
    } finally {
      setFinishing(false)
    }
  }

  /** 고른 폴더 아래 플랜 — id 스냅샷이 아니라 경로로 거른다.
      스냅샷이면 복제·새로 만든 것이 그 폴더 화면에 안 보인다(겪었다) */


  /** 폴더 아래 플랜을 모두 지운다(폴더 자체는 둔다) */


  return (
    // 요구사항·TC 화면과 **같은 뼈대**를 쓴다. 세 화면을 오가는 사람이
    // 매번 「여긴 어디가 목록이지」 를 다시 찾지 않게.
    <>
      {/* 맨 위 줄 — 지금 어디를 보고 있나. 플랜·실행 화면은 Testiny 처럼
          제 머리가 있으니 이 줄을 안 그린다(지시: 빵부스러기 제거). */}
      {/* 목록에서는 이 줄을 안 그린다(지시) — 「플랜 3건 …」 한 줄만
          담고 있었고, 건수는 표가 아래에서 이미 센다. 플랜을 열면
          경로·ID 알약·「함께 보는 중」 이 여기 서므로 그때만 그린다. */}
      {cur && (
      <div className="rq-bar">
        <span className="rq-crumb">
          {/* 「플랜」 을 누르면 관제판(고른 것 없음)으로 돌아간다 */}
          <button
            type="button"
            className="rq-crumb-home"
            onClick={() => {
              prefRemove('utop.cycle.scope')
              setSel('')
            }}
          >
            {cur ? 'Cycle Executions' : '플랜'}
          </button>
          {cur ? (
            /* 실행 중 — Cycle Execution › 모델그룹 › 모델명 › 버전그룹 › 버전 ›
               플랜 ID › 제목. 제품군은 카탈로그에 생기면 앞에 붙인다 */
            <>
              {(() => {
                return [
                  vendorOf.get(cur.model ?? '') ?? '',
                  famOf.get(cur.model ?? '') ?? '',
                  (cur.model_group ?? '').trim() || (mgroupOf.get(cur.model ?? '') ?? ''),
                  cur.model,
                  cur.version_group,
                  cur.version,
                  cur.cid,
                  cur.name,
                ]
                  .map((t) => String(t ?? '').trim())
                  .filter(Boolean)
                  .map((t, i) => (
                    /* 폴더 레일이 없어졌으니 조각은 자리만 말한다 — 누르는
                       길은 「플랜」 홈 하나면 된다 */
                    <span key={`${t}-${i}`}>
                      <span className="rq-crumb-sep">›</span>
                      <span className="cy-crumb-x">{t}</span>
                    </span>
                  ))
              })()}
              {/* 플랜 번호도 이름 오른쪽 알약에 — 누르면 주소를 복사(지시) */}
              <IdPill
                id={String(cur.cid || cur.id || '')}
                href={gotoHref('cycle', urlIdOf(String(cur.id)))}
              />
              {cur.ce && (
                <IdPill
                  id={String(cur.ce)}
                  href={gotoHref('ce', String(cur.ce))}
                  title={`이 회차(${cur.ce}) 의 주소를 복사합니다`}
                />
              )}
            </>
          ) : (
            <span className="muted small">플랜 {cycles.length}건 — 줄을 누르면 결과 요약</span>
          )}
        </span>
        <span className="sp" />
        {/* 실행 단추 자리는 오른쪽 칸 1행 카드로 옮겼다(지시) */}
        {/* 「시험 완료」 는 오른쪽 칸 1행 카드가 직접 그린다(아래 CycleDetail) */}

        {/* 「함께 보는 중」 은 **오른쪽 끝 한 자리**만 쓴다(지적: 두 군데나
            떴다). 플랜을 열었으면 그 플랜을 보는 사람(아래 CycleDetail 이
            이 자리에 끼운다), 목록이면 이 화면에 있는 사람 전부. */}
        {cur ? (
          /* 회차를 열면 「함께 보는 중」·저장 종은 **맨 윗줄 오른쪽 끝**에
             끼운다(지시 — 1번을 2번 자리로). 아래 CycleDetail 이 채운다. */
          <span className="cy-execslot" id="cy-pbslot" />
        ) : (
          <PresenceBar users={crowd} me={me?.name || me?.username || ''} />
        )}
      </div>
      )}

    <div
      className={`split cy${cur ? ' cy-execfull' : ''}`}
      ref={splitRef}
      /* 판정 색은 설정(실행 판정 기준)이 정본이다 — 여기서 CSS 값으로
         풀어 두면 줄 색 띠·배지·집계 막대가 한꺼번에 따라온다. */
      style={
        {
          '--c-pass': resDefs.find((r) => r.v === 'Pass')?.color || undefined,
          '--c-fail': resDefs.find((r) => r.v === 'Fail')?.color || undefined,
          '--c-draft': resDefs.find((r) => r.v === 'WIP')?.color || undefined,
          '--c-blocked': resDefs.find((r) => r.v === 'Blocked')?.color || undefined,
          '--c-na': resDefs.find((r) => r.v === '진행불가')?.color || undefined,
          '--c-none': resDefs.find((r) => r.v === '')?.color || undefined,
          '--vfg-pass': resDefs.find((r) => r.v === 'Pass')?.fg || undefined,
          '--vfg-fail': resDefs.find((r) => r.v === 'Fail')?.fg || undefined,
          '--vfg-wip': resDefs.find((r) => r.v === 'WIP')?.fg || undefined,
          '--vfg-blocked': resDefs.find((r) => r.v === 'Blocked')?.fg || undefined,
          '--vfg-na': resDefs.find((r) => r.v === '진행불가')?.fg || undefined,
        } as React.CSSProperties
      }
    >
      {/* 1열 폴더 레일은 뺐다(승인) — 사업자·제품군·버전그룹은 표의
          열과 도구줄 필터가 맡는다. 플랜은 폴더가 아니라 **시간과
          버전**으로 정리된다. */}
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
            // 그 플랜을 먼저 연다 — 안 열려 있으면 시킬 데가 없다
            setSel(menu.id)
            setMenu(null)
            setAct((a) => ({ what, n: (a?.n ?? 0) + 1 }))
          }}
        />
      )}


      {/* 만들기와 고치기가 같은 창이다. 다르게 만들면 「만들 때는 되는데
          고칠 때는 안 되는 것」 이 반드시 생긴다. */}
      {cloneId && (
        <CloneDialog
          cycleId={cloneId}
          onClose={() => setCloneId('')}
          onDone={() => {
            setCloneId('')
            void listQ.refetch()
          }}
        />
      )}

      {/* ── 플랜에서 여는 실행 ──
             「▶ 실행」 은 **팝업**이다(지시). Runs 의 실행 화면을 그대로
             얹어, 시작·중지·항목별 실행까지 이 자리에서 된다. */}
      {runPop && (
        <PlanRunPopup
          runId={runPop.run}
          plan={cycles.find((c) => c.id === runPop.plan)}
          onClose={() => {
            setRunPop(null)
            void listQ.refetch()
          }}
        />
      )}
      {/* ＋ 실행 만들기 — 모델·버전을 묻고, 만든 뒤 그 실행을 바로 연다 */}
      {!!mkRunFor && (() => {
        const p = cycles.find((c) => c.id === mkRunFor)
        if (!p) return null
        return (
          <MakePlanRun
            plan={p}
            catalog={catQ.data?.items ?? []}
            owner={me?.name || me?.username || ''}
            onClose={() => setMkRunFor('')}
            onMade={(id) => {
              setMkRunFor('')
              setRunPop({ run: id, plan: p.id })
              void listQ.refetch()
            }}
          />
        )
      })()}

      {addToId && (
        <CycleEdit
          cycleId={addToId}
          popupOnly
          folders={vgQ.data?.groups ?? {}}
          onClose={() => setAddToId('')}
          onDone={() => {
            setAddToId('')
            void listQ.refetch()
          }}
        />
      )}
      {planReport && (
        <CycleReport
          cycleId={planReport.id}
          model={planReport.model}
          version={planReport.version}
          onClose={() => setPlanReport(null)}
        />
      )}
      {planInsight && (
        <CycleInsight
          mode={planInsight.mode}
          cycleId={planInsight.c.id}
          title={[planInsight.c.model, planInsight.c.version].filter(Boolean).join(' · ') || planInsight.c.id}
          items={planInsight.c.items ?? []}
          onClose={() => setPlanInsight(null)}
        />
      )}
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
            // 저장했다고 실행 화면으로 끌고 가지 않는다 — 목록이 제자리다.
            // 실행 화면은 ▶ Run 으로만 들어간다 (이미 열려 있던 경우만 유지)
            void id
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
            /* 회귀를 대 볼 후보 — 나머지 플랜 전부. 기본은 같은 모델의
               최신 것이지만, 사람이 아무 것이나 고를 수 있다. */
            others={cycles.filter((c) => c.id !== cur.id)}
            act={act}
            meName={me?.name || me?.username || ''}
            onSaved={() => void listQ.refetch()}
            initItemCeid={pendingIt}
            maker={vendorOf.get(cur.model ?? '') ?? ''}
            family={famOf.get(cur.model ?? '') ?? ''}
            mgroup={(cur.model_group ?? '').trim() || (mgroupOf.get(cur.model ?? '') ?? '')}
            finish={{ can: allJudged, busy: finishing, onDo: () => void finishExec() }}
          />
        ) : (
          cyView !== 'list' ? (
          <CyclePlan
            mode={cyView}
            cycles={cycles}
            mgroupOf={mgroupOf}
            famOf={famOf}
            meName={me?.name || me?.username || ''}
            onBack={() => goView('list')}
            /* ▶ 실행 — 이 플랜의 실행을 **Runs 에서** 연다. 이미 있으면 최근
               것으로, 없으면 하나 떠서 간다(지시: Plans 에서 실행 누르면 Runs) */
            onExec={(id) => void openRunOf(id)}
            onMakeRun={(id) => setMkRunFor(id)}
            onEdit={(id) => setEditId(id)}
            onAddItems={(id) => setAddToId(id)}
            onRun={(id) => setSel(id)}
            onReport={(c) => setPlanReport(c)}
            onInsight={(c, mode) => setPlanInsight({ c, mode })}
            onCsv={exportCycleCsv}
            onDup={(id) => setCloneId(id)}
            onDel={(id) => void delCycles([id])}
            running={running}
            onRefresh={() => void listQ.refetch()}
          />
          ) : (
          <CycleBoard
            isAdmin={me?.role === 'admin'}
            onNew={() => setMaking(true)}
            cycles={cycles}
            mgroupOf={mgroupOf}
            famOf={famOf}
            catalog={catQ.data?.items ?? []}
            /* 인라인 생성의 자동 채움 — 상단바에서 고른 프로젝트의
               사업자·모델그룹, 그 그룹에 모델이 하나뿐이면 모델까지 */
            prjDefault={(() => {
              const want = currentProjects()
              const p = (prjQ.data?.projects ?? []).find(
                (x) => want.includes(x.name) || want.includes(x.cat_id) || want.includes(x.id),
              )
              if (!p) return {}
              /* 옛 프로젝트에는 사업자가 붙은 모델그룹(LGU+_E61xx)이 남아
                 있다 — 카탈로그에 없는 이름이면 밑줄 뒤(E61xx)가 카탈로그에
                 있을 때만 그걸 쓴다(ID 옮기기와 같은 규칙). 지어내지 않는다. */
              const groups = new Set(
                (catQ.data?.items ?? []).filter((it) => it.kind === 'group').map((it) => it.name),
              )
              let mg = (p.model_group ?? '').trim()
              if (mg && !groups.has(mg) && mg.includes('_')) {
                const tail = mg.split('_').slice(1).join('_')
                if (groups.has(tail)) mg = tail
              }
              const models = (catQ.data?.items ?? []).filter(
                (it) => it.kind === 'model' && (it.model_group ?? '').trim() === mg,
              )
              return {
                customer: p.customer || undefined,
                model_group: mg || undefined,
                model: models.length === 1 ? models[0]?.name : undefined,
              }
            })()}
            meName={me?.name || me?.username || ''}
            onDup={(id) => setCloneId(id)}
            onDel={(ids) => void delCycles(ids)}
            onEdit={(id) => setEditId(id)}
            onRun={(id) => setSel(id)}
            onMenu={(id, x, y) => setMenu({ id, x, y })}
            onOpenPlan={(id) => goView('plan', id)}
            running={running}
            onRefresh={() => void listQ.refetch()}
          />
          )
        )}
      </section>
    </div>
    </>
  )
}

/**
 * 관제판 — 아직 아무 플랜도 안 골랐을 때.
 *
 * 전에는 「왼쪽에서 플랜을 고르세요」 한 줄이었다. 이 화면의 질문은
 * 「이번 버전, 내보내도 되나」 인데, 그 답의 첫 장이 빈 벽이면 안 된다.
 * 모델별로 플랜을 깔고, 카드마다 진행률과 Pass/Fail 을 바로 보여 준다 —
 * 어디가 급한지 열기 전에 보인다.
 */
/** 고정 열(관리 정보) — ⚙ 대상이 아니다. ⚙ 는 INFO 필드만(합의 규칙).
    「진행」 은 완료/진행중/대기 파생 배지 — INFO 상태(cycle_status 값)와
    다른 것이라 이름을 갈랐다. */


/**
 * 폴더 요약 — **버전별 시험 결과 현황**(지시).
 *
 * 1열에서 폴더(Root·사업자·제품군·모델그룹·모델명)를 누르면 2열이 이걸로
 * 바뀐다. 회차 목록을 그대로 보여 주던 자리다 — 폴더에서는 「어느 버전이
 * 어디까지 됐나」 가 먼저고, 회차 한 줄 한 줄은 버전그룹에서 본다.
 *
 * Reports 화면이 하던 일을 여기로 들인다. 결과를 보러 다른 화면으로
 * 건너갔다가 다시 돌아오는 왕복이 없어진다.
 */
/** 서버가 센 한 층의 현황 — `/api/cycle/rollup` 한 번이면 끝난다 */

/**
 * 트리를 세운다 — 모델그룹 · 모델은 **장비 카탈로그**가 주인.
 *
 * 옛 방식은 플랜을 만들 때 모델명을 자유 입력하게 뒀다. 그래서
 * `E4320-24P_2` 처럼 뒤에 `_2` 가 붙은 것이 생겼고, 플랜 7종 중 5종이
 * 카탈로그에 아예 없다. 카탈로그를 주인으로 삼으면 이런 것이 안 생기고,
 * 이미 생긴 것은 「카탈로그에 없는 모델」 로 모여 눈에 띈다.
 *
 * 버전그룹만 사람이 만든다. R200·R300 은 카탈로그가 알 수 없는, 이 회차
 * 묶음의 이름이라서다. 플랜이 아직 없는 빈 버전그룹도 보여야 해서
 * 폴더 목록을 따로 받는다.
 */
/** 플랜의 폴더 경로 — 제 것이 있으면 그것, 없으면 모델·버전그룹에서 */


/** 인라인 항목 카드의 고를 수 있는 필드 — 시험항목(Coverage) ⚙ 과 같은 목록 */

function exportCycleCsv(c: CycleMeta): void {
  const rows = c.items ?? []
  if (!rows.length) return
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = [
    ['TC ID', '시험', '결과', '담당', '실행'].map(esc).join(','),
    ...rows.map((it) =>
      [it.tcid, it.name ?? '', verdictLabel(itemVerdict(it)), it.assignee || it.executed_by || '', it.executed_at ?? '']
        .map(esc)
        .join(','),
    ),
  ].join('\r\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
  const a2 = document.createElement('a')
  a2.href = URL.createObjectURL(blob)
  a2.download = `플랜_${[c.model, c.version].filter(Boolean).join('_') || c.id}.csv`
  a2.click()
  URL.revokeObjectURL(a2.href)
}



/** 플랜 한 건 — 항목과 진행 */

/**
 * 접어 둔 카드 — 오른쪽 칸 맨 위(시험 목적 · 사전 준비 조건 · 라벨).
 * **기본은 접힘**이다(지시). 이 칸의 주인공은 스텝이라, 문서가 위에서 자리를
 * 먹으면 정작 볼 것이 아래로 밀린다.
 */
function FoldCard({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <section className={`cxp-fold${open ? ' on' : ''}`}>
      <button type="button" className="cxp-foldh" onClick={() => setOpen((v) => !v)}>
        <i aria-hidden="true">
          <IconChevron />
        </i>
        <b>{title}</b>
      </button>
      {open && <div className="cxp-foldb">{children}</div>}
    </section>
  )
}

function CycleBoard({
  cycles,
  mgroupOf,
  famOf,
  meName,
  isAdmin,
  onDel,
  onEdit,
  onNew,
  onRefresh,
  onOpenPlan,
}: {
  cycles: CycleMeta[]
  /** 카탈로그 지도 — 플랜에 비어 있으면 모델명으로 보강(수정 창과 같은 값) */
  mgroupOf: Map<string, string>
  famOf: Map<string, string>
  /** 카탈로그 원본 — 제품군·모델그룹·모델명 드롭다운의 선택지(지시) */
  catalog: Array<CatModel & { kind: string }>
  /** 인라인 생성 자동 채움 — 상단바 프로젝트에서 */
  prjDefault: { customer?: string; model_group?: string; model?: string }
  /** 내 이름 — 담당 고르개의 「나에게」 */
  meName: string
  /** 보기(탭)를 「모두에게」 올리는 것은 관리자만(합의) */
  isAdmin: boolean
  /** 복제 — 한 개 골랐을 때 */
  onDup: (id: string) => void
  /** 삭제 — 고른 것들 */
  onDel: (ids: string[]) => void
  /** 수정 — 한 개 골랐을 때 (플랜 편집 창) */
  onEdit: (id: string) => void
  /** 새로 만들기 — 만들기는 **다른 길**이다. onEdit('') 로는 안 열려
      단추가 죽어 있었다(지적: "새로 만들기 버튼 동작 안해") */
  onNew: () => void
  onRefresh: () => void
  /** 실행 — 한 개 골라 열면서 전체 실행을 건다 */
  onRun: (id: string) => void
  /** 우클릭 메뉴 — 부모의 CycleMenu 를 연다 */
  onMenu: (id: string, x: number, y: number) => void
  /** ID 클릭 — 플랜 화면으로(지시) */
  onOpenPlan: (id: string) => void
  /** 지금 도는 실행 — cycle_id → 돌리는 사람 */
  running: Map<string, string>
}) {
  /* 찾기는 표 도구줄이 한다 — 화면에서 또 거르면 두 겹이 된다 */
  const q = ''
  /* 드롭다운 선택지 — 카탈로그가 정본(지시: 제품군·모델그룹·모델명 고르기) */
  /* 담당 드롭다운 — **앱 계정**(지라에서 온 것 포함). 장비 SSH 계정
     (admin·root)이 나왔었다(지적) — 그건 장비 목록의 접속 계정이다. */
  /* 담당 후보(/api/user-names)는 공용 AssigneePicker 가 스스로 읽는다 */
  /* 담당 팝오버 — 네이티브 select 는 마지막 열에서 창 밖으로 잘린다(지적).
     기간과 같은 방식: 창 안에 고정 + 검색 */

  /* ＋ New — 창을 띄우지 않고 **머리행 바로 아래**에서 만든다(지시).
     ID 는 서버가 자동으로 매기고(cid), 사람은 제목만 친다. 모델·버전은
     만든 뒤 ✎ 수정에서 채운다 — 만들기 문턱이 낮아야 일단 적는다. */
  /* 기간 팝오버 — 달력(네이티브 date)으로 시작·종료를 고른다(지시) */
  /* ＋New 행의 프로젝트 — 상단바가 「전체」 면 모델그룹이 안 실리던 문제(지적).
     행에서 직접 고른다. 상단바에 골라져 있으면 그게 기본. */
  /* 사업자·제품군·버전그룹 필터 — 폴더 레일이 하던 좁히기를 잇는다(승인) */
  /* 열을 보이고 숨기는 것도 이제 **표 속성 판**이 한다 — 화면 ⚙ 은
     걷어냈다(지시). 폭·숨김·차례는 useNFields 가 계정별로 담는다. */
  /* 목록 줄에서 바로 고친다(지시) — 값 목록은 설정의 코드표·카탈로그를 쓴다 */
  /**
   * 한 칸만 고쳐 저장한다.
   *
   * 목록이 든 것은 요약이라(항목·실행 결과가 빠져 있다) 그대로 되저장하면
   * 그것들이 지워진다 — 원본을 읽어 그 위에 얹는다(폴더 옮기기와 같은 길).
   */
  const setCyCell = async (id: string, p: Record<string, string>) => {
    try {
      const r = await apiFetch(`/api/cycle/${encodeURIComponent(id)}`)
      if (!r.ok) throw new Error('플랜을 불러오지 못했습니다')
      const full = (await r.json()) as Record<string, unknown>
      const w = await apiFetch(`/api/cycle/${encodeURIComponent(id)}`, {
        method: 'POST',
        body: JSON.stringify({ ...full, id, ...p }),
      })
      if (!w.ok) throw new Error('저장하지 못했습니다')
      onRefresh()
    } catch (e) {
      window.alert(e instanceof Error ? `저장하지 못했습니다 — ${e.message}` : '저장하지 못했습니다')
    }
  }


  /** 통채움 색 — SETUP 값 색이 정본, 없으면 Monday 팔레트(승인 A안) */
  /* 칸의 색·모양·정렬·글꼴은 모두 설정이 정본이다(지시) — 세 화면이 같은 부품 */
  /** 기본색은 한 곳에서 온다(lib/fieldFill) — 설정 화면이 보여 주는 그 색이다 */
  /** 통채움 칸 하나 — 셀이 곧 드롭다운이다 */

  /* 정렬은 이제 **표 머리글**이 한다(노션 표). 화면은 안정된 기본
     차례만 세운다 — 폴더 다음 Key. */
  /** 줄 체크 — 삭제·복제가 이걸 본다 */
  const [picked, setPicked] = useState<Set<string>>(new Set())
  /** 인라인으로 펼친 플랜들 — 시험 항목이 줄 밑에 보인다 */
  /** 플랜 ID 를 누르면 펼쳐지는 세부내역 — 보기만 한다 */
  /** 여러 개 고르고 Edit — 상태·고객·담당자를 한꺼번에 바꾼다 */
  const [bulkOpen, setBulkOpen] = useState(false)
  /** 방금 한 일의 결과 한 줄 — 시험항목 도구줄의 tc-msg 와 같은 자리 */
  /** 진행결과 막대 호버 카드 — 랙뷰 장비 카드(rv-tip)와 같은 문법 */
  /** ⋯ — 체크한 플랜 1개의 요약·보고서·내보내기 (실행 화면에서 옮겨 왔다) */
  const [moreAt, setMoreAt] = useState<{ x: number; y: number } | null>(null)
  const [bInsight, setBInsight] = useState<'ai' | 'metrics' | null>(null)
  const [bReport, setBReport] = useState<CycleMeta | null>(null)
  const oneCycle = picked.size === 1 ? cycles.find((c) => c.id === [...picked][0]) : undefined

  /** 인라인 카드에 보일 필드 — 시험항목 화면과 같은 목록에서 ⚙ 로 고른다 */
  /** ⚙ 팝업 자리 — 카드가 overflow 로 잘라먹지 않게 fixed 좌표로 띄운다 */
  // 켠 필드에 따라 칸 폭이 달라진다 — 머리줄·데이터줄이 같은 자를 쓴다

  /** 항목 카드의 모델그룹·유형·실행 타입 — TC 메타가 정본이다 */

  const resDefs = useResults()
  const groupOf = useMemo(() => {
    const m = new Map(resDefs.map((r) => [r.v, r.group]))
    return (v: string) => m.get(v) ?? (v ? 'neutral' : 'none')
  }, [resDefs])

  // 플랜별 집계는 한 번만 — 표·거름·정렬이 다 같이 쓴다
  /** 목록에서 AI 요약 만들기 — 상세 화면과 같은 길이다 */
  /* 회차 AI 요약을 만들던 자리는 인라인 카드와 함께 실행 화면으로 갔다 —
     여기서는 목록만 그린다. */
  const stats = useMemo(() => {
    /** 한 묶음의 셈 — 전체·수동·자동이 같은 것을 쓴다 */
    const tally = (arr: CycleItemLite[]) => {
      let done = 0
      let pass = 0
      let fail = 0
      let iss = 0
      for (const it of arr) {
        const v = itemVerdict(it)
        if (v) done += 1
        const g = groupOf(v)
        if (g === 'pass') pass += 1
        else if (g === 'fail') fail += 1
        iss += it.issues?.length ?? 0
      }
      return {
        total: arr.length,
        done,
        pass,
        fail,
        iss,
        pct: arr.length ? Math.round((done / arr.length) * 100) : 0,
      }
    }
    const m = new Map<
      string,
      {
        total: number
        done: number
        pass: number
        fail: number
        pct: number
        iss: number
        /** 수동·자동으로 갈라 본 것 — 목록에서도 세 판을 보이려고(지시) */
        manual: ReturnType<typeof tally>
        auto: ReturnType<typeof tally>
      }
    >()
    for (const c of cycles) {
      const its = c.items ?? []
      /* 수동·자동 가름 — 상세 화면과 같은 잣대(스텝의 kind·manual).
         목록 응답의 lite 항목도 그 둘을 그대로 들고 온다. */
      const isManual = (it: CycleItemLite) => {
        const kd = kindOf(it.steps ?? [])
        return !(kd === 'auto' || kd === 'mixed')
      }
      const man = its.filter(isManual)
      const aut = its.filter((x) => !isManual(x))
      m.set(c.id, { ...tally(its), manual: tally(man), auto: tally(aut) })
    }
    return m
  }, [cycles, groupOf])

  const shown = useMemo(() => {
    const nq = q.trim().toLowerCase()
    let arr = cycles
    /* 거르기는 표 도구줄의 「필터」 가 한다 — 화면 고르개는 걷어냈다(지시) */
    if (nq)
      arr = arr.filter((c) =>
        [c.cid, c.id, c.version, c.name, c.version_group, c.model]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(nq),
      )
    /* 표 차례는 **안정 키**로 세운다. 서버는 `updated_at DESC` 로 주는데
       그걸 그대로 쓰면 값을 하나 고칠 때마다 그 줄이 1번으로 튄다(지적:
       "가장 최근에 입력한 데이터 행이 1번 행이 되는거야"). 「최근 순」은
       사람이 일부러 고른 것이니 그때만 서버 차례를 그대로 둔다. */
    const cmp = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' }).compare
    return [...arr].sort(
      (a, b) =>
        cmp(String(a.folder ?? ''), String(b.folder ?? '')) ||
        cmp(a.cid || a.id, b.cid || b.id),
    )
  }, [cycles, q, stats, famOf])


  /** 시험 항목의 실행 타입 — 방식을 **항목에서 뽑을** 때 쓴다 */
  const tcKindQ = useQuery({
    queryKey: ['tc', 'kind', 'meta'],
    queryFn: async () => {
      const r = await apiFetch('/api/tc?meta=1')
      if (!r.ok) throw new Error('시험 항목을 불러오지 못했습니다')
      return (await r.json()) as { tcs: Array<Record<string, unknown>> }
    },
    staleTime: 60_000,
  })
  const kindOfTc = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of tcKindQ.data?.tcs ?? [])
      m.set(String(t.tcid), String(t.run_type ?? t.kind ?? '자동'))
    return m
  }, [tcKindQ.data])

  /** 플랜의 시험 방식 — **담긴 항목이 정한다**(결정).
      전부 자동이면 자동, 전부 수동이면 수동, 섞이면 비운다(혼합).
      사람이 표에서 고른 값이 있으면 **그것이 이긴다**(덮어쓰기). */
  /** 방식은 lib/runMode 한 곳에서 정한다 — Runs 와 같은 규칙이어야 한다 */
  const modeOf = (c: CycleMeta): ModeGot =>
    resolveMode((c as unknown as Record<string, unknown>).mode as string, c.items as Array<{ tcid?: string }>, kindOfTc)


  /* ══ 노션 꼴 표 — REQ-Coverage 와 **같은 부품**(지시) ══════════════
     열 정의·선택지·색·보이기 저장은 useNFields 한 곳에서 돈다. 두 벌로
     두면 한쪽만 고쳐져 「요구사항은 되는데 플랜은 안 된다」 가 된다. */
  const nf = useNFields({
    target: 'cycle',
    /* 상태는 설정에서 숨겨져(code_kind_hidden) ⚙ 목록에는 안 뜬다 —
       그래서 여기서 **기본 칸으로 직접** 세운다. 이름은 설정 것을 쓰고,
       표 머리에서 바로 고칠 수 있다. */
    kindOf: {
      status: 'cycle_status',
      customer: 'cycle_customer',
      /* 목업이 쓰는 세 칸 — 값·색은 설정 코드가 정본이라 표에서 바로 고친다 */
      stage: 'cycle_stage',
      type: 'cycle_type',
      mode: 'cycle_mode',
    },
    pre: 'cy_',
    orderKey: 'utop.ntb.order.cy',
  })
  const [nview, setNview] = useState<NView>({ ...EMPTY_VIEW })
  const [nvId, setNvId] = useState('')
  const [nCalc, setNCalc] = useState<Record<string, NCalc>>(() => {
    try {
      return JSON.parse(prefGet('utop.ntb.cy.calc') ?? '{}') as Record<string, NCalc>
    } catch {
      return {}
    }
  })
  const [nPer, setNPer] = useState(() => Number(prefGet('utop.ntb.cy.per') ?? '') || 50)

  const nCols = useMemo<NCol[]>(() => {
    const w = nf.widthOf
    const base: NCol[] = [
      { key: 'key', label: 'Key', type: 'text', width: w('key', 118), fixed: true },
      { key: 'name', label: '제목', type: 'text', width: w('name', 300), fixed: true },
      { key: 'customer', label: '사업자', type: 'select', width: w('customer', 100), options: nf.optsOf('cycle_customer') },
      { key: 'family', label: '제품군', type: 'text', width: w('family', 76) },
      { key: 'model_group', label: '모델그룹', type: 'text', width: w('model_group', 96) },
      { key: 'model', label: '모델명', type: 'text', width: w('model', 88) },
      { key: 'version_group', label: '버전그룹', type: 'text', width: w('version_group', 88) },
      { key: 'version', label: '버전', type: 'text', width: w('version', 110) },
      /* 목업의 「유형」(표준항목·개선내역) */
      { key: 'type', label: '유형', type: 'select', width: w('type', 92), options: nf.optsOf('cycle_type') },
      /* 목업의 「시험 방식」(자동·수동) — 담을 수 있는 항목이 갈린다 */
      { key: 'mode', label: '방식', type: 'select', width: w('mode', 76), options: nf.optsOf('cycle_mode') },
      /* 목업의 「단계」(준비·진행·검토·발행) — 결과서를 낼 때까지가 플랜이다.
         옛 「상태」 는 그대로 두었다(쓰던 값이 있다) */
      { key: 'stage', label: '단계', type: 'select', width: w('stage', 80), options: nf.optsOf('cycle_stage') },
      { key: 'status', label: nf.labelOfKind('cycle_status', '상태'), type: 'select', width: w('status', 92), options: nf.optsOf('cycle_status') },
      { key: 'assignee', label: '담당', type: 'person', width: w('assignee', 84) },
      { key: 'start_date', label: '시작', type: 'date', width: w('start_date', 104) },
      { key: 'end_date', label: '종료', type: 'date', width: w('end_date', 104) },
      { key: 'tests', label: '항목', type: 'number', width: w('tests', 60) },
      { key: 'iss', label: '결함', type: 'number', width: w('iss', 60) },
      { key: 'prg', label: '진행', type: 'text', width: w('prg', 88) },
    ]
    return nf.dress([...base, ...nf.cfCols(w)])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nf.codesQ.data, nf.cfMine, nf.rev])
  /* 저장이 끝나기 전엔 방금 고친 열을 그린다 — 아니면 되돌아가 보인다 */
  const nColsLive = nf.edit ?? nCols

  const nRows = useMemo<NRow[]>(
    () =>
      shown.map((c) => {
        const zero = { total: 0, done: 0, pass: 0, fail: 0, pct: 0, iss: 0 }
        const t = stats.get(c.id) ?? { ...zero, manual: zero, auto: zero }
        return {
          __id: c.id,
          key: c.cid || c.id,
          name: c.name ?? '',
          customer: c.customer ?? '',
          family: c.family || famOf.get(c.model ?? '') || '',
          model_group: c.model_group || mgroupOf.get(c.model ?? '') || '',
          model: c.model ?? '',
          version_group: c.version_group ?? '',
          version: c.version ?? '',
          status: c.status ?? '',
          type: String((c as unknown as Record<string, unknown>).type ?? ''),
          mode: modeOf(c).v,
          stage: String((c as unknown as Record<string, unknown>).stage ?? ''),
          assignee: c.assignee ?? '',
          start_date: c.start_date ?? '',
          end_date: c.end_date ?? '',
          tests: String(t.total || c._item_count || 0),
          iss: String(t.iss || 0),
          prg: t.total ? `${t.pct}%` : '',
          /* 만든 칸은 최상위가 아니라 custom 안에 산다 — 안 펴면 늘 비어 보인다 */
          ...Object.fromEntries(
            Object.entries((c as unknown as { custom?: Record<string, unknown> }).custom ?? {}).map(
              ([k2, v2]) => [`cf_${k2}`, String(v2 ?? '')],
            ),
          ),
        }
      }),
    [shown, stats, famOf, mgroupOf],
  )

  /** 한 칸 저장 — cf_ 는 custom 안으로 접어 넣는다 */
  const setCyOne = async (id: string, key: string, v: string) => {
    if (!key.startsWith('cf_')) {
      await setCyCell(id, { [key]: v })
      return
    }
    try {
      const r = await apiFetch(`/api/cycle/${encodeURIComponent(id)}`)
      if (!r.ok) throw new Error('플랜을 불러오지 못했습니다')
      const full = (await r.json()) as Record<string, unknown>
      const cf = { ...((full.custom ?? {}) as Record<string, unknown>) }
      cf[key.slice(3)] = v
      const top: Record<string, unknown> = { ...full }
      for (const k2 of Object.keys(top)) if (k2.startsWith('cf_')) delete top[k2]
      const w2 = await apiFetch(`/api/cycle/${encodeURIComponent(id)}`, {
        method: 'POST',
        body: JSON.stringify({ ...top, id, custom: cf }),
      })
      if (!w2.ok) throw new Error('저장하지 못했습니다')
      onRefresh()
    } catch (e) {
      window.alert(e instanceof Error ? `저장하지 못했습니다 — ${e.message}` : '저장하지 못했습니다')
    }
  }

  const nBody: ViewBody = useMemo(
    () => ({
      hidden: nCols.filter((c) => c.hidden).map((c) => c.key),
      widths: Object.fromEntries(nCols.filter((c) => c.width).map((c) => [c.key, c.width!])),
      order: nCols.map((c) => c.key),
    }),
    [nCols],
  )
  /** 탭을 고르면 **열 배치**를 얹는다 — 탭에 담기는 것은 그것뿐이다 */
  const applyView = (v: ViewDef | null) => {
    setNvId(v?.id ?? '')
    const hid = new Set(v?.body?.hidden ?? [])
    const wd = v?.body?.widths ?? {}
    for (const c of nCols) {
      prefSet(`utop.ntb.hide.cy_${c.key}`, hid.has(c.key) ? '1' : '0')
      if (wd[c.key]) prefSet(`utop.ntb.w.cy_${c.key}`, String(wd[c.key]))
    }
    prefSet('utop.ntb.order.cy', (v?.body?.order ?? []).join(','))
    nf.bump()
  }


  return (
    <div className="cy-board scroll">
      {/* 요약 카드 — 줄을 누르면 표 위에 선다(승인 목업). 도넛·진행바·
          트렌드·메타·단추(항목 넣기빼기·결과 메일·결과서·실행 열기) */}
      {/* 시험항목 2열과 같은 카드 안에 도구줄·표가 든다 */}
      <section className="panel cyt-card">
      {/* 옛 도구줄(＋New·Bulk Edit·Clone·Run·Delete·거르개·⋯)은 걷어냈다(지시).
          표가 제 도구줄을 갖고 있어 두 벌이었다 — 만들기·찾기·정렬·거르기는
          표 도구줄이, 여럿 골라 하는 일은 아래 띠가 맡는다. */}

      {/* 플랜 목록도 REQ-Coverage 와 **같은 노션 표**로(지시).
          옛 격자(폴더 묶음·펼쳐 보는 항목 카드)는 걷어냈다 — 항목은
          Key 를 눌러 들어가는 **계획 화면**이 이미 통째로 보여 준다. */}
      {/* 요약은 **지금 표에 보이는 플랜**을 센다(합의) — 거르면 같이 좁혀지고,
          한 건만 남으면 자연히 그 한 건의 요약이 된다 */}
      <PlanSummary
        scope={
          shown.length === cycles.length
            ? `플랜 ${shown.length}건 전체`
            : `거른 결과 — 플랜 ${shown.length}건 (전체 ${cycles.length})`
        }
        plans={shown.map((c) => {
          const t2 = stats.get(c.id)
          return { name: c.name ?? c.cid ?? c.id, done: t2?.done ?? 0, total: t2?.total ?? (c._item_count ?? 0) }
        })}
        today={new Date().toISOString().slice(0, 10)}
        /* 항목마다 결과와 **언제 돌렸는지**를 넘긴다 — 추이를 지어내지 않는다 */
        items={shown.flatMap((c) =>
          (c.items ?? []).map((it) => {
            const v = itemVerdict(it)
            const g = groupOf(v)
            return {
              k: (g === 'pass' ? 'pass' : g === 'fail' ? 'fail' : v ? 'etc' : 'none') as
                'pass' | 'fail' | 'etc' | 'none',
              day: String(it.executed_at ?? '').slice(0, 10),
            }
          }),
        )}
      />
      <div className="cyt">
        <NTable
          columns={nColsLive}
          rows={nRows}
          view={nview}
          onView={setNview}
          calcs={nCalc}
          onCalcs={(v) => {
            setNCalc(v)
            prefSet('utop.ntb.cy.calc', JSON.stringify(v))
          }}
          perPage={nPer}
          onPerPage={(n) => {
            setNPer(n)
            prefSet('utop.ntb.cy.per', String(n))
          }}
          toolbarLeft={
            <NViews
              scope="cycle"
              curId={nvId}
              onPick={applyView}
              current={nBody}
              meName={meName}
              isAdmin={isAdmin}
            />
          }
          onSelect={(ids) => setPicked(new Set(ids))}
          /* Key 앞에 톱니(자동)·손(수동) — 목업 그대로. 값이 아니라 표시라
             열을 하나 더 쓰지 않고 ID 칸에 얹는다 */
          rowIcon={(row) => {
            /* 방식은 **담긴 항목이 정한다**(결정). 손으로 고른 값이 있으면
               그것이 이기고 진하게, 항목에서 뽑은 값이면 흐리게 그린다 —
               안 갈라 놓으면 정해 둔 값처럼 보인다. */
            const c2 = shown.find((x) => x.id === row.__id)
            const got = c2 ? modeOf(c2) : { v: '', from: 'none' as const, why: '' }
            const m = got.v
            const auto = m !== '수동'
            const I = auto ? IcAuto : IcManual
            return (
              <i
                className={`ntb-mi2 ${auto ? 'a' : 'm'}${got.from === 'set' ? '' : ' dim'}`}
                title={got.why || '방식 미지정'}
              >
                <I />
              </i>
            )
          }}
          onColumns={(cs) => void nf.applyCols(nColsLive, cs)}
          onCell={(id, key, v) => void setCyOne(id, key, v)}
          /* 센 값이라 손으로 못 고친다 — 항목·결함·진행은 실행이 정한다 */
          readOnlyKeys={['key', 'tests', 'iss', 'prg']}
          idKey="key"
          titleKey="name"
          meName={meName}
          onNew={() => onNew()}
          onOpen={(id) => onOpenPlan(id)}
          onPeek={(id) => onEdit(id)}
          onBulk={(a, ids) => {
            /* 옛 도구줄을 걷어내며 그 단추들이 여기로 왔다(지시) */
            if (a === 'del') onDel(ids)
            else if (a === 'assign' || a === 'status') setBulkOpen(true)
            else if (a === 'csv') {
              for (const id of ids) {
                const c2 = cycles.find((x) => x.id === id)
                if (c2) exportCycleCsv(c2)
              }
            } else window.alert('이 일괄 작업은 아직 없습니다 — 다음 차례에 답니다')
          }}
        />
      </div>

      {cycles.length === 0 && (
        <div className="empty">아직 플랜이 없습니다 — 위 + New 로 만드세요.</div>
      )}
      {/* 카드 바닥 상태 줄 — 세 화면이 같은 자리에서 같은 말을 한다(지시) */}
      <div className="bottom colbot">
        <span>
          플랜 {shown.length}건
          {shown.length !== cycles.length && ` (전체 ${cycles.length}건)`}
        </span>
        {picked.size > 0 && <span>{picked.size}건 선택됨</span>}
      </div>
      </section>
      {moreAt && oneCycle && (
        <>
          <span className="cyt-gearovl" onClick={() => setMoreAt(null)} />
          <div
            className="cy-hmenu-pop"
            role="menu"
            style={{ position: 'fixed', left: Math.max(8, moreAt.x - 120), top: moreAt.y, right: 'auto', zIndex: 60 }}
          >
            <button type="button" role="menuitem" onClick={() => { setMoreAt(null); setBInsight('ai') }}>
              AI 요약
            </button>
            <button type="button" role="menuitem" onClick={() => { setMoreAt(null); goto('report', oneCycle.id) }}>
              보고서
            </button>
            <button type="button" role="menuitem" onClick={() => { setMoreAt(null); setBInsight('metrics') }}>
              메트릭스
            </button>
            <hr />
            <button type="button" role="menuitem" onClick={() => { setMoreAt(null); setBReport(oneCycle ?? null) }}>
              PPTX (고객사 결과서)
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={!(oneCycle.items ?? []).length}
              onClick={() => { setMoreAt(null); exportCycleCsv(oneCycle) }}
            >
              Export (CSV)
            </button>
          </div>
        </>
      )}
      {bInsight && oneCycle && (
        <CycleInsight
          mode={bInsight}
          cycleId={oneCycle.id}
          title={[oneCycle.model, oneCycle.version].filter(Boolean).join(' · ') || oneCycle.id}
          items={oneCycle.items ?? []}
          onClose={() => setBInsight(null)}
        />
      )}
      {bReport && (
        <CycleReport
          cycleId={bReport.id}
          model={bReport.model}
          version={bReport.version}
          onClose={() => setBReport(null)}
        />
      )}
      {bulkOpen && (
        <BulkEditDialog
          ids={[...picked]}
          cycles={cycles}
          onClose={() => setBulkOpen(false)}
          onDone={(m) => {
            setBulkOpen(false)
            setPicked(new Set())
            /* 결과 한 줄을 띄우던 자리(옛 도구줄)가 사라져 알림으로 알린다 */
            if (m) window.alert(m)
            onRefresh()
          }}
        />
      )}
    </div>
  )
}

/**
 * Bulk Edit — 고른 플랜 여러 개를 한꺼번에 고친다.
 *
 * 시험항목의 TcBulkEdit 과 같은 문법을 지킨다:
 *  1. 넣을 항목을 체크로 고른다 — 안 고른 칸은 손대지 않는다
 *  2. 「비어 있는 것만 채우기」 가 기본 — 덮어쓰기는 명시적 선택
 *  3. 끝나면 몇 건에 넣었고 몇 건을 건너뛰었는지 말해 준다
 */
function BulkEditDialog({
  ids,
  cycles,
  onClose,
  onDone,
}: {
  ids: string[]
  cycles: CycleMeta[]
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const codesQ = useQuery({
    queryKey: ['codes'],
    queryFn: async () => {
      const r = await apiFetch('/api/codes')
      if (!r.ok) throw new Error('코드를 불러오지 못했습니다')
      return (await r.json()) as { items: Array<{ kind: string; value: string }> }
    },
    staleTime: 60_000,
  })
  const codeVals = (kind: string) =>
    (codesQ.data?.items ?? []).filter((i) => i.kind === kind).map((i) => i.value)

  const [fill, setFill] = useState({ status: false, customer: false, assignee: false })
  const [bStatus, setBStatus] = useState('')
  const [bCust, setBCust] = useState('')
  const [bWho, setBWho] = useState('')
  /** 이미 값이 있는 플랜을 덮을 것인가 */
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose, busy])

  const ready =
    (fill.status && !!bStatus) || (fill.customer && !!bCust) || (fill.assignee && !!bWho.trim())

  const apply = async () => {
    setBusy(true)
    let done = 0
    let skip = 0
    const fails: string[] = []
    for (const id of ids) {
      try {
        const r = await apiFetch(`/api/cycle/${encodeURIComponent(id)}`)
        if (!r.ok) throw new Error(String(r.status))
        const cur = (await r.json()) as Record<string, unknown>
        const patch: Record<string, unknown> = {}
        // 비어 있는 것만 채울 때는 이미 값이 있으면 손대지 않는다
        const putVal = (key: string, v: string) => {
          const had = String(cur[key] ?? '').trim()
          if (had && !over) return
          patch[key] = v
        }
        if (fill.status && bStatus) putVal('status', bStatus)
        if (fill.customer && bCust) putVal('customer', bCust)
        if (fill.assignee && bWho.trim()) putVal('assignee', bWho.trim())
        if (!Object.keys(patch).length) {
          skip++
          continue
        }
        const w = await apiFetch(`/api/cycle/${encodeURIComponent(id)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...cur, ...patch }),
        })
        if (!w.ok) throw new Error(String(w.status))
        done++
      } catch {
        fails.push(id)
      }
    }
    setBusy(false)
    onDone(
      `${done}건에 넣었습니다` +
        (skip ? ` · ${skip}건은 이미 있어 건너뜀` : '') +
        (fails.length ? ` · ${fails.length}건 실패` : ''),
    )
  }

  const row = (key: 'status' | 'customer' | 'assignee', label: string, body: React.ReactNode) => (
    <div className={`bk-row${fill[key] ? ' on' : ''}`}>
      <label className="bk-name">
        <input
          type="checkbox"
          checked={fill[key]}
          onChange={(e) => setFill((f) => ({ ...f, [key]: e.target.checked }))}
        />
        <b>{label}</b>
      </label>
      {fill[key] && <div className="bk-body">{body}</div>}
    </div>
  )

  const nameOf = (id: string) => {
    const c = cycles.find((x) => x.id === id)
    return c ? `${c.cid || c.version || id} — ${c.name || ''}` : id
  }

  return (
    <div className="modal-back" onMouseDown={() => !busy && onClose()}>
      <div
        className="modal bk"
        role="dialog"
        aria-modal="true"
        aria-label="고른 플랜 한꺼번에 고치기"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <b>고른 플랜 {ids.length}건 고치기</b>
          <span className="sp" />
          <button className="btn small" type="button" disabled={busy} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="bk-cols">
          <div className="bk-list">
            {row(
              'status',
              '상태',
              <div className="bk-vals">
                <select value={bStatus} onChange={(e) => setBStatus(e.target.value)}>
                  <option value="">(선택)</option>
                  {codeVals('cycle_status').map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
                <span className="muted small">상태는 대개 값이 있어 「덮어쓰기」 일 때만 바뀝니다</span>
              </div>,
            )}
            {row(
              'customer',
              '고객',
              <div className="bk-vals">
                <select value={bCust} onChange={(e) => setBCust(e.target.value)}>
                  <option value="">(선택)</option>
                  {codeVals('cycle_customer').map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </div>,
            )}
            {row(
              'assignee',
              '담당자',
              <div className="bk-vals">
                <input
                  value={bWho}
                  onChange={(e) => setBWho(e.target.value)}
                  placeholder="이름"
                />
              </div>,
            )}
          </div>

          {/* 무엇에 들어가는지 보여 준다 — 「n건」 숫자만 보고 덮어쓰기를
              누르게 하면 안 된다 */}
          <div className="bk-targets">
            <div className="bk-thead">들어갈 플랜 {ids.length}건</div>
            <ul>
              {ids.map((id) => (
                <li key={id} title={id}>
                  {nameOf(id)}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="bk-mode">
          {/* 되돌릴 수 없는 쪽을 기본으로 두지 않는다 */}
          <label>
            <input type="radio" checked={!over} onChange={() => setOver(false)} />
            비어 있는 것만 채우기
          </label>
          <label className="bk-danger">
            <input type="radio" checked={over} onChange={() => setOver(true)} />
            덮어쓰기
          </label>
          {over && (
            <span className="bk-warn">이미 적혀 있는 값이 바뀝니다. 되돌릴 수 없습니다.</span>
          )}
        </div>

        <div className="modal-foot">
          <span className="muted small">
            {ready ? `${ids.length}건에 적용합니다` : '넣을 내용을 고르세요'}
          </span>
          <span className="sp" />
          <span className="page-head-actions">
            <button className="btn" type="button" disabled={busy} onClick={onClose}>
              취소
            </button>
            <button
              className="btn primary"
              type="button"
              disabled={!ready || busy}
              onClick={() => void apply()}
            >
              {busy ? '넣는 중…' : '넣기'}
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}

function CycleDetail({
  cycle,
  others,
  act,
  meName,
  onSaved,
  initItemCeid,
  maker,
  family,
  mgroup,
  finish,
}: {
  cycle: CycleMeta
  /** 회귀를 대 볼 후보들 — 이 플랜을 뺀 전부. 기본은 같은 모델 최신 */
  others: CycleMeta[]
  /** 지금 사람 — 접속자 표시와 「누가 고쳤나」 에 쓴다 */
  meName: string
  /** 트리 우클릭 메뉴가 시킨 일 */
  act?: { what: 'details' | 'ai' | 'pptx' | 'run'; n: number } | null
  onSaved: () => void
  /** ?it=CETC-… 로 들어왔다 — 항목이 오면 한 번만 편다 */
  initItemCeid?: string
  /** 제조사·제품군·모델그룹 — 장비 카탈로그가 정본 */
  maker?: string
  family?: string
  mgroup?: string
  /** 「시험 완료」 — 부모가 가진 일이라 넘겨받아 1행 카드에 그린다 */
  finish?: { can: boolean; busy: boolean; onDo: () => void }
}) {
  /** 걸러 보기. null 이면 전부 — '' 는 「미실행」 이라는 뜻이라 못 쓴다 */
  /** 결과 필터 — 멀티 선택. 비어 있으면 전부 */
  const [fSet, setFSet] = useState<Set<string>>(new Set())
  const [report, setReport] = useState(false)
  /** 고른 항목 — 누르면 스텝과 실행 내역이 아래에 열린다 */
  const [openItem, setOpenItem] = useState(-1)

  /**
   * 이 플랜을 누가 같이 보고 있나 · 남이 무엇을 고쳤나.
   *
   * 플랜은 **여럿이 나눠 돌리는 자리**다. 요구사항·시험항목에는 접속자
   * 표시가 있는데 정작 부딪히기 쉬운 여기에는 없었다. 둘이 같은 항목에
   * 결과를 찍으면 나중 사람이 앞사람 것을 조용히 덮는다.
   *
   * 막지는 않는다 — 랩에서는 같은 플랜을 여럿이 보는 일이 잦고, 잠가
   * 버리면 보려던 사람이 못 들어온다. 대신 **누가 있는지 보여 주고**,
   * 남이 고치면 그때 알린다.
   */
  /**
   * 남이 고친 이력 — 새것이 앞이다.
   *
   * 처음엔 띠로 띄웠는데, 한 사람이 연달아 저장하면 앞의 것이 뒤의 것에
   * 밀려 **누가 무엇을 언제** 했는지가 안 남았다. 플랜은 여럿이 나눠
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
   * 모른다. 같은 플랜을 둘이 만지다가 나중에 저장한 사람이 앞사람 것을
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
  // 이 플랜을 떠나면 자리를 비운다
  useEffect(
    () => () => {
      if (meName) sendWs({ type: 'focus', user: meName, page, at: -1 })
    },
    [page, meName],
  )
  // 다른 플랜로 옮기면 지난 것은 지운다 — 이 플랜의 이력이지 내 이력이 아니다
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
   * 그래서 플랜을 고르면 온전한 것을 한 번 더 읽는다. 트리·집계는
   * 요약본으로 충분하지만 여기서는 아니다.
   */
  const fullQ = useQuery({
    queryKey: ['cycle-full', cycle.id],
    queryFn: async () => {
      const r = await apiFetch(`/api/cycle/${encodeURIComponent(cycle.id)}`)
      if (!r.ok) throw new Error('플랜을 불러오지 못했습니다')
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
  const [runQ, setRunQ] = useState<Set<number>>(new Set())
  /** 멈춰 달라고 말했나 — 실행기는 스텝 사이에서 내려오므로 그 사이를 알린다 */
  const [stopping, setStopping] = useState(false)
  useEffect(() => {
    if (!st.on) setStopping(false)
  }, [st.on])
  const startRun = (idxs: number[]) => {
    /* 플랜 실행은 **자리를 먼저 잡는다**(지시). 남이 잡고 있으면 아예
       진행하지 않는다 — 누가·어느 플랜에서 쓰는지까지 말해 준다.
       놓는 것은 회차 「시험 완료」 가 한다. */
    const devs = [
      ...new Set(
        idxs
          .map((i) => String(items[i]?.devId ?? '').trim())
          .filter(Boolean),
      ),
    ]
    void (async () => {
      if (devs.length) {
        try {
          const r = await apiFetch('/api/locks/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ resource_ids: devs, kind: 'device', cycle_id: cycle.id }),
          })
          const b = (await r.json().catch(() => ({}))) as {
            success?: boolean
            blocked?: Array<{
              resource_id: string
              locked_name?: string
              locked_by?: string
              cycle_name?: string
              locked_at?: string
            }>
          }
          if (!r.ok || b.success === false) {
            const lines = (b.blocked ?? []).map(
              (x) =>
                `· ${x.resource_id} — ${x.locked_name || x.locked_by || '누군가'} 님` +
                (x.cycle_name ? ` (${x.cycle_name})` : '') +
                (x.locked_at ? ` · ${String(x.locked_at).replace('T', ' ').slice(5, 16)}` : ''),
            )
            window.alert(
              '다른 사람이 쓰고 있는 장비가 있어 실행할 수 없습니다.\n\n' +
                lines.join('\n') +
                '\n\n그 사람이 반납하거나, 관리자가 장비 화면에서 풀어야 합니다.',
            )
            return
          }
        } catch (e) {
          window.alert(
            e instanceof Error ? `장비 점유에 실패했습니다 — ${e.message}` : '장비 점유에 실패했습니다',
          )
          return
        }
      }
      startRunNow(idxs)
    })()
  }

  const startRunNow = (idxs: number[]) => {
    setFollow(true)
    /* 이번 실행에 걸린 항목 — 목록에서 「대기」 를 그리는 데 쓴다.
       도는 것만 보이고 **다음에 무엇이 도는지** 안 보였다(지적). */
    setRunQ(new Set(idxs))
    /* 전용 화면으로 튀지 않는다. 실행은 **보던 자리에서 인라인**으로 본다 —
       도는 줄이 펼쳐져 스텝이 차오르는 꼴이 이 앱이 원래 하려던 것이고,
       사람이 보던 목록·거르개를 안 잃는다. */
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
  /* 막 걸었을 때 — 서버가 「돈다」 고 말하기까지 한두 박자 걸린다. 그 사이에
     닫아 버리면 열자마자 튕겨 나온다. 한 번이라도 돌기 시작한 뒤에만 닫는다. */
  const ranOnce = useRef(false)
  useEffect(() => {
    if (st.on) ranOnce.current = true
  }, [st.on])
  // 실행이 끝나면 실행 모드도 같이 닫는다 — 남아 있으면 빈 판을 본다
  useEffect(() => {
    if (!st.on && ranOnce.current) {
      ranOnce.current = false
      setRunView(false)
      /* 다 돌았으면 「대기」 딱지를 걷는다 — 안 걷으면 다음에 열 때도 남는다 */
      setRunQ((v) => (v.size ? new Set() : v))
    }
  }, [st.on])
  /** 도는 항목 줄 — 따라가기 중이면 왼쪽 목록에서 화면에 붙잡아 둔다 */
  const runlineRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (st.on && follow)
      // 가운데로 붙잡아 둔다(지시) — 'nearest' 는 줄이 끝자락에 걸려
      // 다음 줄로 넘어갈 때마다 목록이 한 줄씩 튀었다
      runlineRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [st.on, st.itemAt, follow])

  const colsRef = useRef<HTMLDivElement>(null)
  /** 1열(항목 목록) 폭 — 끌어서 바꾼다. 다른 화면들과 같은 부품 */
  const [sideW, setSideW] = useResizableWidth('utop.cycle.execSideW', 340, 220, 1100)
  const sideRef = useRef<HTMLElement | null>(null)

  /** 고른 항목의 시험 문서(Objective·Precondition) — TC 가 정본이라 그때 읽는다 */
  const [tcDoc, setTcDoc] = useState<{
    object_md?: string
    precondition_md?: string
    /** TC 의 스텝 — 항목에 스냅샷이 없을 때 여기서 뜬다 */
    checks?: TcStep[]
  } | null>(null)

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
  /** 1열 머리의 ⋯ — 항목 추가·내 것만 */
  const [sideMenu, setSideMenu] = useState<{ x: number; y: number } | null>(null)
  /** 깔때기 — 결과 필터(전체·Pass·Fail·미실행·회귀). 걸린 개수가 배지로 */
  const [filtAt, setFiltAt] = useState<{ x: number; y: number } | null>(null)
  /** 고치는 항목들 — 한 건이면 Edit, 여럿이면 Bulk Edit (같은 창) */
  const [editing, setEditing] = useState<CycleItemLite[] | null>(null)
  /** 회차를 놓고 보는 창 — AI 요약 · 메트릭스 */
  const [insight, setInsight] = useState<'ai' | 'metrics' | null>(null)
  /** 맨 위 빵부스러기 줄의 실행 단추 자리 — 부모가 비워 둔 슬롯(포털) */
  const [barEl, setBarEl] = useState<HTMLElement | null>(null)
  useEffect(() => {
    setBarEl(document.getElementById('cy-execbar'))
  }, [])
  /** 시험결과 요약 바 — 완료 오른쪽 단추로 여닫는다. 상태 기억 */
  /* 「시험 진행 요약」 — **무조건 접힌 채로** 뜬다(지시). 기억하지 않는다:
     돌리는 화면에 들어오는 까닭은 절차를 보려는 것이지 요약이 아니다. */
  const [sumOpen, setSumOpen] = useState(false)
  /**
   * 목록 오른쪽 필드 보이기/숨기기(지시: ⚙).
   *
   * 좁은 화면에서 일곱 칸이 다 서면 제목이 먼저 잘린다 — 무엇을 볼지는
   * 사람마다 달라서 고르게 한다. 숨긴 것만 기억한다(새 필드가 생기면
   * 저절로 보이게).
   */
  const [hideF, setHideF] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(prefGet('utop.cycle.execHide') || '[]') as string[])
    } catch {
      return new Set()
    }
  })
  const [colsOpen, setColsOpen] = useState(false)
  const fShow = (k: string) => !hideF.has(k)
  const fFlip = (k: string) =>
    setHideF((cur) => {
      const n = new Set(cur)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      prefSet('utop.cycle.execHide', JSON.stringify([...n]))
      return n
    })
  /** 기존 결과를 누르면 — 항목 × 플랜 Matrix(지시) */
  const [matrixOn, setMatrixOn] = useState(false)
  const [matrixAt, setMatrixAt] = useState('')
  const [pbEl, setPbEl] = useState<HTMLElement | null>(null)
  useEffect(() => {
    setPbEl(document.getElementById('cy-pbslot'))
  }, [])
  /* 실행이 걸려도 저절로 펴지 않는다(지시: 무조건 접기가 기본) —
     도는 상황은 1행 막대가 말한다. */
  /**
   * AI 요약 — 「시험 진행 요약」 카드의 셋째 칸(지시).
   *
   * 서버가 플랜에 저장해 두므로(ai_summary) 다시 열어도 마지막 요약이
   * 그대로 보인다. 만들기는 여기서 시킨다.
   */
  /** 판정 계열(통과·실패·그 밖) — 설정의 실행 판정 기준이 정본이다 */
  const resDefs2 = useResults()
  const groupOf = useMemo(() => {
    const m = new Map(resDefs2.map((r) => [r.v, r.group]))
    return (v: string) => m.get(v) ?? (v ? 'neutral' : 'none')
  }, [resDefs2])
  const [aiBusy, setAiBusy] = useState(false)
  const makeAi = async () => {
    setAiBusy(true)
    try {
      const r = await apiFetch(`/api/cycle/${encodeURIComponent(cycle.id)}/summarize`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      const j = (await r.json()) as { ok?: boolean; error?: string }
      if (!j.ok) throw new Error(j.error || '요약을 만들지 못했습니다')
      onSaved()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e))
    } finally {
      setAiBusy(false)
    }
  }

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
      const autoIdx = items.map((x, i) => (typeOf(x) === 'auto' ? i : -1)).filter((i) => i >= 0)
      if (autoIdx.length) startRun(autoIdx)
    }
    // 'details' 는 페이지가 보기만 바꾸면 끝이라 여기서 할 일이 없다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [act])
  /**
   * 표 줄 우클릭 메뉴.
   *
   * 결과·담당자·메모를 고치는 길이다. 위 단추 줄에서 뺐으니 여기 둔다 —
   * 트리에서 플랜을 우클릭하면 항목을 넣고 빼듯, 항목은 항목 줄에서.
   */
  const [rowMenu, setRowMenu] = useState<{ at: number; x: number; y: number } | null>(null)
  const [saving, setSaving] = useState(false)

  /**
   * 항목을 넣고 뺀다.
   *
   * 플랜을 만들 때만 고를 수 있으면, 시험 하나를 빠뜨렸을 때 플랜을
   * 다시 만들어야 한다. 그러면 이미 돌린 결과가 통째로 날아간다.
   */
  /** 항목 결과를 손으로 정한다 */
  const setResult = (tcid: string, result: string) =>
    saveItems((cur) => cur.map((x) => (x.tcid === tcid ? { ...x, result } : x)))



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
    saveItems((cur2) =>
      cur2.map((x) => {
        if (x.tcid !== tcid) return x
        // 언제 찍었는지도 남긴다 — 레일이 시각을 보여준다. 지우면 시각도 지운다
        const steps = (x.steps ?? []).map((sx, j) =>
          j === at
            ? {
                ...sx,
                result,
                executed_at: result
                  ? new Date().toISOString().slice(0, 19).replace('T', ' ')
                  : '',
              }
            : sx,
        )
        let r = x.result
        // 수동 항목 규칙(합의): 하나라도 Pass 가 아니면 Fail, 전부 Pass 면 Pass,
        // 아직 다 안 찍었으면 미실행(빈 값)
        if (typeOf(x) === 'manual' && steps.length) {
          const vs = steps.map((s2) => stepVerdict(s2 as TcStep))
          r = vs.some((v2) => isFail(v2)) ? 'Fail' : vs.every((v2) => isPass(v2)) ? 'Pass' : ''
        }
        return { ...x, steps, result: r }
      }),
    )

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

  /** 저장 줄 — 읽고→쓰기라, 나란히 두 번 찍으면 뒤가 앞을 덮는다. 하나씩 */
  const saveChain = useRef<Promise<void>>(Promise.resolve())
  const qc2 = useQueryClient()
  const saveItems = (edit: (cur: CycleItemLite[]) => CycleItemLite[]) => {
    // 화면 먼저 바꾼다(낙관) — 셀렉트를 찍고 저장을 기다리면 느리게 느껴진다.
    // 서버 저장은 뒤에서 줄 서서 따라오고, 끝나면 refetch 가 맞춰 준다
    qc2.setQueryData(['cycle-full', cycle.id], (old: unknown) => {
      const o = old as { items?: CycleItemLite[] } | undefined
      return o ? { ...o, items: edit(o.items ?? []) } : o
    })
    const run2 = saveChain.current.then(() => saveItemsNow(edit))
    saveChain.current = run2.catch(() => {})
    return run2
  }
  const saveItemsNow = async (edit: (cur: CycleItemLite[]) => CycleItemLite[]) => {
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
  const resDefs = useResults()

  /**
   * 항목이 수동인가 자동인가 — **TC 의 실행 타입이 정본**이다. 스텝이
   * 들었는지와 무관하게 이것이 2열 표시와 1열 배지를 정한다.
   * 「혼합」 은 타입에서 뺐다 — 남아 있는 옛 값은 수동으로 읽는다.
   */
  const tcMetaQ3 = useQuery({
    queryKey: ['tc', 'list', 'meta'],
    queryFn: async () => {
      const r = await apiFetch('/api/tc?meta=1')
      if (!r.ok) throw new Error('시험 목록을 불러오지 못했습니다')
      return (await r.json()) as { tcs: TestCaseMeta[] }
    },
    staleTime: 60_000,
  })
  const tcRun = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of tcMetaQ3.data?.tcs ?? [])
      m.set(t.tcid, String((t as Record<string, unknown>).run_type ?? (t as Record<string, unknown>).kind ?? ''))
    return m
  }, [tcMetaQ3.data])
  const typeOf = (it: CycleItemLite): 'manual' | 'auto' => {
    // 실행 타입의 값 체계는 SETUP 에서 바꿀 수 있다 — 'A'/'M' 을 쓰는
    // 곳이 실제로 있다. '자동' 글자만 알아듣던 탓에 A 로 적은 자동 TC 가
    // 플랜에서 전부 M(수동)으로 보였고 자동 실행 단추도 안 떴다.
    const rt = String(tcRun.get(it.tcid) ?? '').trim().toUpperCase()
    if (rt === '자동' || rt === 'A' || rt === 'AUTO') return 'auto'
    if (rt === '수동' || rt === '혼합' || rt === 'M' || rt === 'MANUAL') return 'manual'
    const kd = kindOf(it.steps ?? [])
    return kd === 'auto' || kd === 'mixed' ? 'auto' : 'manual'
  }

  /**
   * 기존 시험이력 — **같은 TC ID 가 든 다른 플랜 전부**에서 모은다.
   * 복제 관계가 아니어도 잡힌다. 미실행은 이력이 아니라 뺀다.
   */
  const histAll = useMemo(() => {
    const m = new Map<string, Array<{ id: string; v: Verdict; when: string; label: string }>>()
    for (const c of others) {
      for (const it of c.items ?? []) {
        const v = itemVerdict(it)
        if (v === '') continue
        const arr = m.get(it.tcid) ?? []
        arr.push({
          id: c.id,
          v,
          when: String(it.executed_at ?? c._updated_at_pg ?? ''),
          label: c.cid || c.version || c.id,
        })
        m.set(it.tcid, arr)
      }
    }
    for (const arr of m.values()) arr.sort((a, b) => (a.when < b.when ? 1 : -1))
    return m
  }, [others])

  /** 오른쪽 위 한 줄이 읽는 셈 — 실행/합격/실패/그 밖 */
  const { doneAll, donePass, doneFail } = useMemo(() => {
    let all = 0
    let pass = 0
    let fail = 0
    for (const it of items) {
      const v = itemVerdict(it)
      if (!v) continue
      all += 1
      const g = resDefs.find((r) => r.v === v)?.group ?? ''
      if (g === 'pass') pass += 1
      else if (g === 'fail') fail += 1
    }
    return { doneAll: all, donePass: pass, doneFail: fail, doneEtc: Math.max(0, all - pass - fail) }
  }, [items, resDefs])

  // 결과별 개수 — 칩(전체/Pass/Fail/미실행)이 읽는다
  const counts: Record<string, number> = {}
  for (const r of resDefs) counts[r.v] = 0
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
      return (await r.json()) as {
        reqs: Array<{
          reqid?: string
          id?: string
          title?: string
          cat1?: string | null
          cat2?: string | null
          cat3?: string | null
          cat4?: string | null
        }>
      }
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
  /** 접어 둔 묶음 — 묶음 머리를 누르면 그 아래 줄이 숨는다(지시) */
  const [grpFold, setGrpFold] = useState<Set<string>>(new Set())
  /** 수동만·자동만 보기(지시) — 목록 머리의 단추가 이 값을 바꾼다 */
  const [fKind, setFKind] = useState<'' | 'manual' | 'auto'>('')
  /** 자동만 볼 때는 한 칸으로 — 자동은 지켜보는 일이라 판정 칸이 필요 없다 */
  /* 화면은 **무조건 2열**이다(정의). Type(수동·자동)은 목록에 무엇을
     올릴지 고르는 거르개일 뿐, 칸 수나 필드를 바꾸지 않는다. */
  const oneCol = false
  /** 항목 목록을 무엇으로 묶나(지시) — 기본은 요구사항, 여태 하던 것 */
  const [grp, setGrp] = useState<string>(
    () => prefGet('utop.cycle.grp') || 'req',
  )
  useEffect(() => {
    prefSet('utop.cycle.grp', grp)
  }, [grp])

  /** 분류(폴더) 이름표 — cat1~4 에는 **ID** 가 들어 있어 그대로 쓰면
      「cat-lg-rf-178…」 로 보였다(지적). 이름은 여기서 받아 옮긴다. */
  const catQ = useQuery({
    queryKey: ['req-categories'],
    enabled: grp === 'folder',
    queryFn: async () => {
      const r = await apiFetch('/api/req-categories')
      if (!r.ok) throw new Error('분류를 불러오지 못했습니다')
      return (await r.json()) as { categories: Array<{ id: string; name: string }> }
    },
  })
  const catName = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of catQ.data?.categories ?? []) m.set(String(c.id), String(c.name ?? ''))
    return m
  }, [catQ.data])

  /** 요구사항이 놓인 폴더 — 가장 깊은 분류 한 조각. 항목 묶기(폴더)가 쓴다 */
  const reqFolder = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of reqQ2.data?.reqs ?? []) {
      const deep = String(r.cat4 || r.cat3 || r.cat2 || r.cat1 || '').trim()
      if (r.reqid) m.set(r.reqid, deep)
      if (r.id) m.set(r.id, deep)
    }
    return m
  }, [reqQ2.data])

  /** 시험(TC)의 심각도 — 항목 묶기(우선순위)가 쓴다. 목록 meta 만 받는다 */
  const tcMetaQ = useQuery({
    queryKey: ['tc', 'meta', 'cycle-group'],
    queryFn: async () => {
      const r = await apiFetch('/api/tc?meta=1')
      if (!r.ok) return { tcs: [] as Array<{ tcid: string; severity?: string | null }> }
      return (await r.json()) as { tcs: Array<{ tcid: string; severity?: string | null }> }
    },
    staleTime: 60_000,
  })
  const tcSev = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of tcMetaQ.data?.tcs ?? []) m.set(t.tcid, String(t.severity ?? '').trim())
    return m
  }, [tcMetaQ.data])

  /** 내부 키(rq-…) → 부여 ID(REQ-2633-0003). 내부 키는 화면에 안 낸다 */
  const reqIdOf = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of reqQ2.data?.reqs ?? []) {
      if (r.id && r.reqid) m.set(String(r.id), String(r.reqid))
    }
    return m
  }, [reqQ2.data])

  /** 이 항목이 어느 묶음인가 — 열쇠(같은 묶음 판별)와 이름(머리줄) */
  const groupOfItem = useMemo(() => {
    return (it: CycleItemLite): { k: string; label: string; sub?: string } => {
      switch (grp) {
        case 'status': {
          const v = itemVerdict(it)
          return { k: v || '_none', label: v ? verdictLabel(v) : '미실행' }
        }
        case 'tester': {
          const t = String(it.assignee ?? '').trim() || String(it.executed_by ?? '').trim()
          return { k: t || '_none', label: t || '(담당 없음)' }
        }
        case 'prio': {
          const sv = tcSev.get(it.tcid) ?? ''
          return { k: sv || '_none', label: sv || '(우선순위 없음)' }
        }
        case 'folder': {
          const f = reqFolder.get(String(it.req_id ?? '')) ?? ''
          return { k: f || '_none', label: catName.get(f) || f || '(폴더 없음)' }
        }
        default: {
          const rid = String(it.req_id ?? '')
          const label = reqIdOf.get(rid) || (rid.startsWith('rq-') ? '' : rid)
          return {
            k: rid || '_none',
            label: reqName.get(rid) || rid || '(요구사항 없음)',
            sub: label || undefined,
          }
        }
      }
    }
  }, [grp, tcSev, reqFolder, reqName, reqIdOf, catName])


  /*
   * 회귀 — **지난 플랜에선 Pass 였는데 이번에 Fail** 인 것.
   *
   * 플랜은 버전 검증이라, 정말 무서운 것은 「원래 깨져 있던 것」 이
   * 아니라 **되던 것이 무너진 것**이다. 표에서 Fail 로만 보이면 그 둘이
   * 섞여서, 회귀를 골라내려고 지난 결과서를 옆에 띄워 놓고 눈으로 대
   * 보게 된다. 여기서 대 준다.
   */
  const [prevId, setPrevId] = useState('')
  // 플랜을 갈아타면 비교 상대도 자동으로 돌아간다
  useEffect(() => setPrevId(''), [cycle.id])
  const prev = prevId
    ? others.find((c) => c.id === prevId)
    : others.find(
        (c) => c.id === String((cycle as unknown as Record<string, unknown>).cloned_from ?? ''),
      ) ?? others.find((c) => (c.model ?? '') === (cycle.model ?? ''))
  const prevQ = useQuery({
    queryKey: ['cycle-full', prev?.id ?? ''],
    enabled: Boolean(prev),
    queryFn: async () => {
      const r = await apiFetch(`/api/cycle/${encodeURIComponent(prev!.id)}`)
      if (!r.ok) throw new Error('지난 플랜을 불러오지 못했습니다')
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
      if (fKind && typeOf(it) !== fKind) return false
      if (onlyRegress && !isRegress(it)) return false
      if (fSet.size && !fSet.has(itemVerdict(it))) return false
      if (fAss && String(it.assignee ?? '').trim() !== fAss) return false
      if (!n) return true
      return (
        it.tcid.toLowerCase().includes(n) || (it.name ?? '').toLowerCase().includes(n)
      )
    })
    // 같은 묶음끼리 붙여 둔다 — 흩어져 있으면 묶음 머리가 여러 번 뜬다.
    // 그 안의 차례는 원래 자리를 지킨다(사람이 정한 순서다).
    const order = new Map<string, number>()
    out.forEach((x) => {
      const k = groupOfItem(x).k
      if (!order.has(k)) order.set(k, order.size)
    })
    return out
      .map((x, i) => ({ x, i }))
      .sort(
        (a, b) =>
          (order.get(groupOfItem(a.x).k) ?? 0) - (order.get(groupOfItem(b.x).k) ?? 0) || a.i - b.i,
      )
      .map((v) => v.x)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, fSet, onlyRegress, prevVerdict, fAss, fq, groupOfItem, fKind])

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

  // 주소창 — ?ce=CE-…(&it=CETC-…). 복사해 보내면 이 화면·이 항목이 열린다
  useEffect(() => {
    const ce = String(cycle.ce ?? '')
    if (!ce) return
    const ceid = openItem >= 0 ? String(items[openItem]?.ceid ?? '') : ''
    const want = ceid
      ? `?ce=${encodeURIComponent(ce)}&it=${encodeURIComponent(ceid)}`
      : `?ce=${encodeURIComponent(ce)}`
    if (window.location.search !== want) {
      // 실행 「진입」 은 한 칸 쌓는다 — 그래야 뒤로가기가 플랜 목록으로 온다.
      // 항목 사이 이동(&it=)은 덮어쓴다 — 항목마다 쌓이면 뒤로가기가 한참이다
      const already = new URLSearchParams(window.location.search).get('ce') === ce
      if (already) window.history.replaceState({ utop: true }, '', window.location.pathname + want)
      else window.history.pushState({ utop: true }, '', window.location.pathname + want)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openItem, cycle.ce, items])

  // ?it=CETC-… 로 들어온 항목 — 항목이 오면 한 번만 편다
  const initedIt = useRef(false)
  useEffect(() => {
    if (initedIt.current || !initItemCeid || !items.length) return
    const idx = items.findIndex((x) => String(x.ceid ?? '') === initItemCeid)
    if (idx >= 0) {
      initedIt.current = true
      setOpenItem(idx)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, initItemCeid])

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
          data?: { object_md?: string; precondition_md?: string; checks?: TcStep[] }
          object_md?: string
          precondition_md?: string
          checks?: TcStep[]
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

  /**
   * 항목에 스텝 스냅샷이 없으면 TC 에서 뜬다.
   *
   * 항목은 추가될 때 steps:[] 로 만들어진다(CycleEdit). 그래서 TC 에
   * 수동 절차가 버젓이 있는데 2열 Details 가 「스텝 내용 없음」 이었다
   * (지적: Store·Operating temperature). 열 때 TC 실행 타입에 맞는
   * 스텝만 떠서 채우면, 그대로 이 회차의 스냅샷이 된다 — 결과 기록
   * (setStepResult)도 이 줄들에 쌓인다.
   */
  useEffect(() => {
    const tcid = cur?.tcid
    const checks = tcDoc?.checks
    if (!tcid || !checks?.length) return
    if ((cur?.steps?.length ?? 0) > 0) return
    const md = typeOf(cur!)
    const seed = checks.filter((s) => (md === 'manual' ? s.kind === 'manual' : s.kind !== 'manual'))
    if (!seed.length) return
    void saveItems((xs) =>
      xs.map((x) =>
        x.tcid === tcid && !x.steps?.length
          ? { ...x, steps: seed as unknown as CycleStep[] }
          : x,
      ),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tcDoc, cur?.tcid])

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
      // 플랜 화면 — 왼쪽 세로 레일 + 한 줄기 스크롤(요구사항·시험항목과 같은
      // 부품). **실행 화면(RunPane)은 별개다** — 거기엔 레일을 얹지 않는다(지시).
      // 요약도 실행 중에 겹치지 않게 이 안으로 들어왔다.
      // 실행 페이지 — 요약·AI 요약 칸은 걷어냈다(지시). 그 둘은 목록에서
      // 줄을 펴면 보인다. 여기는 돌리고 결과를 보는 자리다.
        <div className="cy-cols" ref={colsRef}>
        {/* 2열 — 이 회차를 돌리고 결과를 보는 칸. 머리(제목·단추·통계·거르기)와
            표가 한 카드에 든다. */}
        {/* 돌고 있으면 **테두리가 숨을 쉰다**(지시). 곁눈으로 봐도 지금
            도는 중인지 멎었는지 알아야 한다 — 줄 하나만 깜빡이면 목록을
            스크롤해 놓았을 때 아무 표시도 안 남는다 */}
        <section className={`panel cy-exec${st.on ? ' cy-live' : ''}`}>
        {/* ② 공통 액션 바 — 요구사항·시험항목과 **같은 차례**.
            Edit·Bulk Edit | Add·Delete·Export. 세 화면을 오가는 사람이 매번
            어디에 무엇이 있는지 다시 찾지 않게. */}
        {/* 실행 단추·⋯·저장종은 맨 위 빵부스러기 줄(완료 왼쪽)로 — 가로 카드 한 줄을 없앴다(피드백 ②) */}
        {/* 「시험결과 요약」 단추는 걷었다(지시) — 요약은 목록에서 본다 */}
        {barEl &&
          createPortal(
            <>
              {st.on ? (
                <button
                  className="btn danger small"
                  type="button"
                  disabled={stopping}
                  onClick={() => {
                    setStopping(true)
                    void stop()
                  }}
                >
                  {stopping ? '멈추는 중…' : '⏹ 멈추기'}
                </button>
              ) : (
                (() => {
                  /* 실행은 자동 항목만 돈다(합의) — 수동은 사람이 찍는다.
                     수동뿐이면 단추가 꺼진다 */
                  /* 실행 차례는 **화면에 보이는 차례**다(지적: 플랜 순서가
                     있는데 순서대로 진행 안 된다).
                     화면은 묶음(그룹핑)으로 다시 늘어놓는데 실행은 원본
                     items 자리 순서로 돌아서, 보는 것과 도는 것이 어긋났다.
                     `rows` 가 화면 차례이므로 그것으로 자리 번호를 만든다. */
                  const idxOf = new Map(items.map((x, i) => [x, i]))
                  const inView = rows
                    .map((x) => idxOf.get(x))
                    .filter((i): i is number => i !== undefined)
                  const autoAll = inView.filter((i) => typeOf(items[i]!) === 'auto')
                  const autoPicked = inView.filter(
                    (i) => pick.has(i) && typeOf(items[i]!) === 'auto',
                  )
                  return (
                    <>
                      <button
                        className="btn small"
                        type="button"
                        disabled={!autoAll.length || saving}
                        title={
                          autoAll.length
                            ? `자동 ${autoAll.length}건을 돌립니다 (수동 ${items.length - autoAll.length}건은 빠집니다)`
                            : '전부 수동 항목이라 자동 실행이 없습니다'
                        }
                        onClick={() => startRun(autoAll)}
                      >
                        ▶ 전체 실행 ({autoAll.length})
                      </button>
                      {pick.size > 0 && (
                        <button
                          className="btn primary small"
                          type="button"
                          disabled={saving || !autoPicked.length}
                          title={
                            autoPicked.length
                              ? `고른 것 중 자동 ${autoPicked.length}건을 돌립니다 (수동은 빠집니다)`
                              : '고른 것이 전부 수동이라 자동 실행이 없습니다'
                          }
                          onClick={() => startRun(autoPicked)}
                        >
                          ▶ 실행 ({autoPicked.length})
                        </button>
                      )}
                    </>
                  )
                })()
              )}
            </>,
            barEl,
          )}
        {/* **이 플랜** 을 같이 보는 사람 — 오른쪽 끝 한 자리에 끼운다 */}
        {pbEl &&
          createPortal(
            <>
              {joined && (
                <span className={`cy-join ${joined.how}`}>
                  {joined.who} 님이 {joined.how === 'in' ? '들어왔습니다' : '나갔습니다'}
                </span>
              )}
              <SaveBell
                items={saves}
                unseen={Math.max(0, saves.length - seen)}
                onSeen={() => setSeen(saves.length)}
              />
              <PresenceBar users={presence.users} me={meName} />
            </>,
            pbEl,
          )}
  
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
            onFill={() => {
              const src = items[rowMenu.at]
              setRowMenu(null)
              if (!src) return
              const v0 = itemVerdict(src)
              const at0 = rows.findIndex((x) => x.tcid === src.tcid)
              const below = at0 >= 0 ? rows.slice(at0 + 1) : []
              if (!below.length) {
                window.alert('아래에 줄이 없습니다')
                return
              }
              if (!window.confirm(`아래 ${below.length}건에 「${v0 || '미실행'}」 을 채울까요?`)) return
              void (async () => {
                for (const x of below) await setResult(x.tcid, v0 === '' ? '미실행' : v0)
              })()
            }}
            onRemove={() => {
              const n = pick.size || 1
              const ids = new Set(
                (pick.size ? [...pick] : [rowMenu.at]).map((i2) => items[i2]?.tcid).filter(Boolean),
              )
              setRowMenu(null)
              if (!window.confirm(`고른 ${n}건을 이 플랜에서 뺍니다.`)) return
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
            results={resDefs}
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
          /* 플랜 수정 창의 「항목 추가」 와 같은 팝업 — 다른 창이 뜨던 것 교체 */
          <CycleEdit
            cycleId={cycle.id}
            folders={{}}
            popupOnly
            onClose={() => setAdding(false)}
            onDone={() => {
              void fullQ.refetch()
              onSaved()
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
              {/* 도는 동안 가장 알고 싶은 것은 **지금 무엇이 도는가** 다.
                  여러 줄로 흩어 놓았더니 정작 그 이름이 잔글씨였다(지적). */}
              <b className="cy-prog-t">
                {st.waiting ? '실행 대기' : `${Math.min(st.done + 1, st.total)}/${st.total} 실행 중`}
                {/* 진행률(%)을 옆에(지시). 아래 띠와 **같은 셈**이다 — 끝난
                    항목 ÷ 전체. 띠는 눈금이 없어 「어디쯤인가」 가 숫자로도
                    있어야 한다 */}
                {!st.waiting && st.total > 0 && (
                  <i className="cy-prog-pct">{Math.round((st.done / st.total) * 100)}%</i>
                )}
              </b>
              <span className="cy-prog-item" title={st.itemName || ''}>
                {st.waiting ? '실행 서버가 집기를 기다립니다…' : st.itemName || '…'}
              </span>
              {!st.waiting && st.stepAt >= 0 && (
                <span className="cy-prog-step">
                  스텝 {st.stepAt + 1}/{st.stepCount}
                </span>
              )}
              {st.who && <span className="cy-prog-who">{st.who} 님</span>}
              <span className="sp" />
              {!follow && (
                <button className="btn small" type="button" onClick={() => setFollow(true)}>
                  도는 항목 따라가기
                </button>
              )}
              <button
                className="btn small danger"
                type="button"
                disabled={stopping}
                title="실행기가 스텝을 마치는 대로 내려옵니다"
                onClick={() => {
                  setStopping(true)
                  void stop()
                }}
              >
                {stopping ? '멈추는 중…' : '⏹ 중지'}
              </button>
            </div>
            <div className="cy-prog-bar" aria-hidden="true">
              <span style={{ width: `${st.total ? (st.done / st.total) * 100 : 0}%` }} />
            </div>
          </div>
        )}
  
  
  
        </section>
  
        {/* Test Player — 왼쪽에서 항목을 고르고, 오른쪽에서 시험한다.
            Zephyr 실행 화면 문법: 목록은 좁게, 절차·판정·기록은 넓게. */}
        {/* 배치는 **하는 일**이 정한다(설계):
             · 자동화 = 지켜보는 일 → 1열, 도는 항목이 줄 밑에서 펼쳐진다
             · 수동·전체 = 하는 일(판정을 누른다) → 2열, 오른쪽에서 시험한다 */}
          {/* 1행 카드 — 회차를 다루는 단추 자리(지시). 맨 위 빵부스러기에
              있던 「전체 실행 · 시험 완료 · 시험결과 요약」 이 여기로 온다. */}
          <div className="cxp-actcard">
            {/* 시험 진행 요약 — 상시 카드 한 줄을 접고 단추로(지시).
                누르면 아래에 인라인으로 펼쳐진다 */}
            {/* 요약은 「펼침 토글」 이고 완료·실행은 「하는 일」 이다 — 같은
                단추 얼굴로 나란히 서면 구분이 안 된다(지시 ①). 토글은 맨
                왼쪽에 민얼굴로, 사이에 세로선을 긋는다 */}
            <button
              className={`cxp-sumtg${sumOpen ? ' on' : ''}`}
              type="button"
              aria-expanded={sumOpen}
              title="이 회차의 INFO·집계를 인라인으로 펼칩니다"
              onClick={() => setSumOpen((v2) => !v2)}
            >
              <i aria-hidden="true">{sumOpen ? '▾' : '▸'}</i> 시험 진행 요약
            </button>
            <span className="cxp-div" aria-hidden="true" />
            {finish && (
              <button
                className="btn small primary"
                type="button"
                disabled={!finish.can || finish.busy}
                title={
                  finish.can
                    ? '종료일을 적고 플랜 목록으로 돌아갑니다'
                    : '모든 항목에 결과가 차면 완료할 수 있습니다'
                }
                onClick={finish.onDo}
              >
                {finish.busy ? '완료 중…' : '✔ 시험 완료'}
              </button>
            )}
            <span className="cy-execslot" id="cy-execbar" />
            {/* 막대는 카드 **가운데**(지시 ②) — 앞뒤 sp 가 남는 자리를 반씩 진다 */}
            <span className="sp" />
          {/* 전체·수동·자동 막대는 1행 카드 안이다(지시: 원복) */}
            {(() => {
              const tally = (xs: CycleItemLite[]) => {
                let p = 0
                let f = 0
                for (const x of xs) {
                  const v2 = itemVerdict(x)
                  if (v2 === 'Pass') p += 1
                  else if (v2) f += 1
                }
                return { n: xs.length, p, f }
              }
              const man = items.filter((x) => typeOf(x) === 'manual')
              const aut = items.filter((x) => typeOf(x) === 'auto')
              const bars: Array<[string, ReturnType<typeof tally>]> = [
                ['전체', tally(items)],
                ['수동', tally(man)],
                ['자동', tally(aut)],
              ]
              return (
                <span className="cxp-sum">
                  {st.on && (
                    <b className="cxp-sum-run">
                      ● {Math.min(st.done + 1, st.total)}/{st.total} 실행 중
                    </b>
                  )}
                  {bars.map(([lb, t]) => (
                    <span className="cxp-sumb" key={lb}>
                      <i className="lb">{lb}</i>
                      <i className="bar">
                        <s className="p" style={{ width: `${t.n ? (t.p / t.n) * 100 : 0}%` }} />
                        <s className="f" style={{ width: `${t.n ? (t.f / t.n) * 100 : 0}%` }} />
                      </i>
                      <i className="nm">
                        {/* 「완료/전체 (진척%)」 — 몇 건이 끝났는지와 몇 %인지를
                            한 눈에(지시: 67/67(100%) 꼴) */}
                        {t.p + t.f}/{t.n} ({t.n ? Math.round(((t.p + t.f) / t.n) * 100) : 0}%)
                      </i>
                      {/* 올리면 뜨는 현황 카드 — 랙 화면 장비 말풍선과 같은 꼴(지시) */}
                      <span className="cxp-tip" role="tooltip">
                        <span className="cxp-tiph">
                          <b>{lb} 현황</b>
                          <em className={t.n && t.p === t.n ? 'ok' : t.f ? 'ng' : 'un'}>
                            ● {t.n ? Math.round(((t.p + t.f) / t.n) * 100) : 0}% 진척
                          </em>
                        </span>
                        <span className="cxp-tipr">
                          <i>항목</i>
                          <span>{t.n}건</span>
                        </span>
                        <span className="cxp-tipr">
                          <i>합격</i>
                          <span className="p">
                            {t.p}/{t.n} ({t.n ? Math.round((t.p / t.n) * 100) : 0}%)
                          </span>
                        </span>
                        <span className="cxp-tipr">
                          <i>실패</i>
                          <span className="f">
                            {t.f}/{t.n} ({t.n ? Math.round((t.f / t.n) * 100) : 0}%)
                          </span>
                        </span>
                        <span className="cxp-tipr">
                          <i>미실행</i>
                          <span>
                            {t.n - t.p - t.f}/{t.n} (
                            {t.n ? Math.round(((t.n - t.p - t.f) / t.n) * 100) : 0}%)
                          </span>
                        </span>
                        <span className="cxp-tipr">
                          <i>합격률</i>
                          <span>{t.p + t.f ? Math.round((t.p / (t.p + t.f)) * 100) : 0}%</span>
                        </span>
                        {st.on && lb === '자동' && (
                          <span className="cxp-tipr run">
                            <i>지금</i>
                            <span>
                              {Math.min(st.done + 1, st.total)}/{st.total} 실행 중
                            </span>
                          </span>
                        )}
                      </span>
                    </span>
                  ))}
                </span>
              )
            })()}
            <span className="sp" />
            {/* 이 회차가 어디까지 왔나 — **이 줄 하나**로만 말한다(지시).
                전체·수동·자동 세 막대. 도는 중이면 앞에 진행이 붙는다. */}
            <span className="sp" />
          </div>
          {/* 시험 진행 요약 — 위 1행 카드의 단추가 연다(지시). 접혀 있을
              때는 줄 하나도 차지하지 않는다. */}
          {sumOpen && (
          <div className="cxp-infocard open">
            {(
              <div className="cxp-infobody">
                {/* ① INFO */}
                <div className="cxp-infosec">
                  <b className="cxp-infolb">INFO</b>
                  <div className="cxp-kv">
                    {(
                      [
                        ['플랜 ID', cycle.cid],
                        ['제목', cycle.name],
                        ['고객', cycle.customer],
                        ['벤더', maker],
                        ['제품군', family],
                        ['모델그룹', (cycle.model_group ?? '').trim() || mgroup],
                        ['모델명', cycle.model],
                        ['버전그룹', cycle.version_group],
                        ['버전', cycle.version],
                        ['상태', cycle.status],
                        ['담당자', cycle.assignee],
                        ['생성자', cycle.created_by],
                        ['생성일', String(cycle._created_at_pg ?? '').slice(0, 10)],
                        ['변경일', String(cycle._updated_at_pg ?? '').slice(0, 10)],
                      ] as Array<[string, string | null | undefined]>
                    ).map(([k, v]) => (
                      <span className="cxp-kvi" key={k}>
                        <b>{k}</b>
                        <i title={String(v ?? '')}>{String(v ?? '').trim() || '–'}</i>
                      </span>
                    ))}
                  </div>
                </div>

                {/* ② 전체 · 수동 · 자동 현황 */}
                <div className="cxp-infosec">
                  <b className="cxp-infolb">현황</b>
                  {(() => {
                    const tally = (xs: CycleItemLite[]) => {
                      let p = 0
                      let f = 0
                      let etc = 0
                      for (const x of xs) {
                        const v2 = itemVerdict(x)
                        const g = groupOf(v2)
                        if (g === 'pass') p += 1
                        else if (g === 'fail') f += 1
                        else if (v2) etc += 1
                      }
                      return { n: xs.length, p, f, etc, none: xs.length - p - f - etc }
                    }
                    const cards: Array<[string, ReturnType<typeof tally>]> = [
                      ['전체', tally(items)],
                      ['수동', tally(items.filter((x) => typeOf(x) === 'manual'))],
                      ['자동', tally(items.filter((x) => typeOf(x) === 'auto'))],
                    ]
                    return (
                      <div className="cxp-stats">
                        {cards.map(([lb, t]) => {
                          const pct = t.n ? Math.round(((t.n - t.none) / t.n) * 100) : 0
                          return (
                            <div className="cxp-stat" key={lb}>
                              <div className="cxp-stat-h">
                                <b>{lb}</b>
                                <span className="cxp-stat-n">{t.n}건</span>
                                <span className="sp" />
                                <em className={pct === 100 ? 'done' : undefined}>{pct}%</em>
                              </div>
                              <div className="cxp-stat-bar" aria-hidden="true">
                                <s className="p" style={{ flexGrow: t.p }} />
                                <s className="f" style={{ flexGrow: t.f }} />
                                <s className="e" style={{ flexGrow: t.etc }} />
                                <s className="n" style={{ flexGrow: t.none }} />
                              </div>
                              <div className="cxp-stat-lg">
                                <span className="ok">합격 {t.p}</span>
                                <span className={t.f ? 'ng' : undefined}>실패 {t.f}</span>
                                <span>그 외 {t.etc}</span>
                                <span>미실행 {t.none}</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}
                </div>

                {/* ③ AI 요약 */}
                <div className="cxp-infosec">
                  <b className="cxp-infolb">
                    <IconSparkle />
                    AI 요약
                    {cycle.ai_summary?.at && (
                      <em className="muted small">
                        {String(cycle.ai_summary.at).slice(0, 16).replace('T', ' ')}
                      </em>
                    )}
                    <span className="sp" />
                    <button
                      className={`cxp-aibtn${aiBusy ? ' busy' : ''}`}
                      type="button"
                      disabled={aiBusy}
                      onClick={() => void makeAi()}
                    >
                      <IconSparkle />
                      {aiBusy ? '만드는 중…' : cycle.ai_summary?.text ? '다시 만들기' : 'AI 요약 만들기'}
                    </button>
                  </b>
                  {cycle.ai_summary?.text ? (
                    <div className="cxp-aitext">
                      <Markdown text={String(cycle.ai_summary.text)} />
                    </div>
                  ) : (
                    <div className="muted small">
                      아직 요약이 없습니다 — 「AI 요약 만들기」 를 누르면 이 회차의 결과를 읽고 적어 줍니다.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          )}

          {/* ── 항목 × 회차 Matrix(지시 ②) — 기존 결과를 누르면 뜬다.
              한 항목의 이력만이 아니라 **모든 항목의 회차별 판정**을 한 판에
              편다. 누른 항목 줄을 밝혀 두어 「내가 보던 것」 을 잃지 않는다. */}
          {matrixOn && (() => {
            const cols = [
              { id: '__cur', label: `${cycle.cid || '이번 회차'}${cycle.version ? ` (${cycle.version})` : ''}` },
              ...others.map((c) => ({
                id: c.id,
                label: c.cid || c.version || c.id,
              })),
            ]
            const cellOf = new Map<string, Map<string, Verdict>>()
            cellOf.set('__cur', new Map(items.map((x) => [x.tcid, itemVerdict(x)])))
            for (const c of others)
              cellOf.set(c.id, new Map((c.items ?? []).map((x) => [x.tcid, itemVerdict(x)])))
            const chip = (v2: Verdict | undefined) =>
              v2 === undefined ? (
                <i className="cym-x none">–</i>
              ) : (
                <i className={`cym-x ${verdictClass(v2)}`}>{v2 ? verdictLabel(v2) : '미실행'}</i>
              )
            return (
              <div className="modal-back" onMouseDown={() => setMatrixOn(false)}>
                <div
                  className="modal cym"
                  role="dialog"
                  aria-modal="true"
                  aria-label="항목별 시험결과 Matrix"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div className="modal-head">
                    <b>항목별 시험결과</b>
                    <span className="muted small">
                      항목 {items.length}건 × 회차 {cols.length}개 — 같은 TC 가 든 다른 플랜에서 모았습니다
                    </span>
                    <span className="sp" />
                    <button className="btn small" type="button" onClick={() => setMatrixOn(false)}>
                      닫기
                    </button>
                  </div>
                  <div className="cym-body scroll">
                    <table className="cym-tbl">
                      <thead>
                        <tr>
                          <th className="cym-nm">시험 항목</th>
                          {cols.map((c) => (
                            <th key={c.id} title={c.label}>
                              {c.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((x) => (
                          <tr key={x.tcid} className={x.tcid === matrixAt ? 'on' : ''}>
                            <td className="cym-nm" title={`${x.tcid} ${x.name ?? ''}`}>
                              <b>{x.tcid}</b> {x.name ?? ''}
                            </td>
                            {cols.map((c) => (
                              <td key={c.id}>{chip(cellOf.get(c.id)?.get(x.tcid))}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )
          })()}

        <div className={`cxp${oneCol ? ' onecol' : ''}`}>
          <aside className={`cxp-side${''}`} ref={sideRef} style={{ width: sideW }}>
            <div className="cxp-sh">
              {/* 제안하신 그림 그대로 — 1행 이름표·건수·그룹·필터, 2행 찾기,
                  3행 걸린 필터 칩. 「방식(자동·수동)」 은 필터 쪽으로 갔다. */}
              {/* 묶기 · 시험 유형 — 둘 다 드롭다운으로(지시). 단추 무리는
                  자리를 먹어 머리줄이 밀렸다. */}
              <span className="cxp-fsel" title="항목을 무엇으로 묶을지 고릅니다">
                <span className="cxp-fsel-lb">
                  그룹핑
                  <b>(1)</b>
                  <i>▾</i>
                </span>
                <select
                  className="cxp-fsel-sel"
                  value={grp}
                  onChange={(e) => setGrp(e.target.value)}
                >
                  <option value="req">요구사항</option>
                  <option value="status">Status</option>
                  <option value="tester">Tester</option>
                  <option value="prio">우선순위</option>
                  <option value="folder">폴더</option>
                </select>
              </span>
              <span className="cxp-fsel" title="Type — 자동·수동">
                <span className={`cxp-fsel-lb${fKind ? ' on' : ''}`}>
                  Type
                  <b>(1)</b>
                  <i>▾</i>
                </span>
                <select
                  className="cxp-fsel-sel"
                  value={fKind}
                  onChange={(e) => setFKind(e.target.value as '' | 'manual' | 'auto')}
                >
                  <option value="">전체</option>
                  <option value="auto">자동</option>
                  <option value="manual">수동</option>
                </select>
              </span>
              <span className="cxp-div" aria-hidden="true" />
              {(() => {
                const rv = onlyRegress ? '_reg' : ([...fSet][0] ?? '')
                return (
                  <span className="cxp-fsel" title="Result — 판정으로 좁혀 봅니다">
                    <span className={`cxp-fsel-lb${rv ? ' on' : ''}`}>
                      Result
                      <b>(1)</b>
                      <i>▾</i>
                    </span>
                    <select
                      className="cxp-fsel-sel"
                      value={rv}
                      onChange={(e) => {
                        const v = e.target.value
                        setOnlyRegress(v === '_reg')
                        setFSet(v && v !== '_reg' ? new Set([v === '_none' ? '' : v]) : new Set())
                      }}
                    >
                      <option value="">전체</option>
                      {resDefs.map((r) => (
                        <option key={r.v} value={r.v}>
                          {r.label}
                        </option>
                      ))}
                      <option value="_none">미실행</option>
                      <option value="_reg">회귀</option>
                    </select>
                  </span>
                )
              })()}
              <span className="cxp-div" aria-hidden="true" />
              {/* ⋯ 는 걷었다(지시) — 쓰는 일이 드물었다 */}
              {/* 내 것만 — 아이콘 하나로 켜고 끈다(지시) */}
              <button
                type="button"
                className={`cxp-mine${fAss ? ' on' : ''}`}
                title={fAss ? '내 것만 보는 중 — 누르면 전체' : '내 담당만 봅니다'}
                onClick={() => setFAss(fAss ? '' : meName)}
              >
                <IconAccounts />
              </button>
              {/* + TC — 이 회차에 시험 항목을 더한다 */}
              <button
                type="button"
                className="btn small"
                title="이 회차에 시험 항목을 더합니다"
                onClick={() => setAdding(true)}
              >
                + TC
              </button>
              <span className="cxp-div" aria-hidden="true" />
              {/* 고르개·건수·찾기 를 + TC 오른쪽으로(지시) — 머리는 한 줄이다 */}

              <label className="rq-selall" title="보이는 것 전부 고르기">
                <input
                  type="checkbox"
                  checked={rows.length > 0 && pick.size === rows.length}
                  ref={(el) => {
                    if (el) el.indeterminate = pick.size > 0 && pick.size < rows.length
                  }}
                  disabled={!rows.length}
                  onChange={() =>
                    pick.size === rows.length ? sel.clear() : sel.set(rows.map((x) => items.indexOf(x)))
                  }
                />
              </label>
              {/* 「62/64」 를 고른 수로 읽는 일이 있었다(지적) — 고른 게 있으면
                  그 수를 앞세우고, 보이는 수는 뒤에 조용히 붙인다. */}
              <b className="cxp-cntlb">
                시험 항목{' '}
                <span className={`cxp-cnt${pick.size ? ' sel' : ''}`}>
                  {pick.size}/{items.length}
                </span>
              </b>
              <span className="cxp-div" aria-hidden="true" />
              <input
                className="cxp-q"
                placeholder="TC ID · 제목 검색"
                value={fq}
                onChange={(e) => setFq(e.target.value)}
              />
              {/* ⚙ — 오른쪽 필드를 보이거나 숨긴다(지시 ①) */}
              <span className="cxp-cols">
                {/* 옆의 「내 것만」 아이콘 단추와 **같은 틀**(지시: 크기 통일) */}
                <button
                  type="button"
                  className={`cxp-mine${colsOpen ? ' on' : ''}`}
                  title="목록 필드 보이기/숨기기"
                  onClick={() => setColsOpen((v) => !v)}
                >
                  <IconSettings />
                </button>
                {colsOpen && (
                  <div className="cxp-colspop" onMouseLeave={() => setColsOpen(false)}>
                    {(
                      [
                        ['who', '담당자'],
                        ['by', '실행자'],
                        ['kind', '타입 (M/A)'],
                        ['hist', '기존 결과'],
                        ['when', '시험 시각'],
                        ['took', '소요'],
                        ['stt', '진행 상태'],
                      ] as Array<[string, string]>
                    ).map(([k, lb]) => (
                      <label key={k}>
                        <input type="checkbox" checked={fShow(k)} onChange={() => fFlip(k)} />
                        {lb}
                      </label>
                    ))}
                  </div>
                )}
              </span>
                          {pick.size > 0 && !st.on && (
                /* 고른 항목 전부에 같은 판정 — Pass 만이 아니라 아무 값이나 */
                <select
                  className="cy-v cxp-bulkv"
                  value=""
                  disabled={saving}
                  title={`고른 ${pick.size}건에 같은 판정을 한 번에 적용합니다`}
                  onChange={(e) => {
                    const val = e.target.value
                    if (!val) return
                    const rows2 = [...pick]
                      .map((i2) => items[i2])
                      .filter((x): x is CycleItemLite => Boolean(x))
                    const ids = new Set(rows2.map((x) => x.tcid))
                    const now2 = new Date().toISOString()
                    void saveItems((cur2) =>
                      cur2.map((x) => {
                        if (!ids.has(x.tcid)) return x
                        const passAll = val === 'Pass' && typeOf(x) === 'manual'
                        return {
                          ...x,
                          result: val === '미실행' ? '미실행' : val,
                          executed_by: val === '미실행' ? x.executed_by : x.executed_by || meName,
                          executed_at: val === '미실행' ? x.executed_at : x.executed_at || now2,
                          // Pass 는 수동 스텝까지 Pass — 「항목 Pass = 모든 스텝 Pass」 합의
                          steps: passAll
                            ? (x.steps ?? []).map((s2) => ({ ...s2, result: 'Pass' }))
                            : x.steps,
                        }
                      }),
                    ).then(() => sel.clear())
                  }}
                >
                  <option value="">판정 일괄 적용…</option>
                  {resDefs.map((r) => (
                    <option key={r.v} value={r.v === '' ? '미실행' : r.v}>
                      {r.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {/* 찾기 + 내 것만 — Zephyr 왼쪽 목록의 도구 그대로 */}
            {sideMenu && (
              <>
                <span className="cyt-gearovl" onClick={() => setSideMenu(null)} />
                <div
                  className="cy-hmenu-pop cxp-sidepop"
                  role="menu"
                  style={{
                    position: 'fixed',
                    left: Math.max(8, Math.min(sideMenu.x - 200, window.innerWidth - 240)),
                    top: sideMenu.y,
                    right: 'auto',
                    zIndex: 60,
                  }}
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setSideMenu(null)
                      setAdding(true)
                    }}
                  >
                    ＋ 항목 추가
                  </button>
                  <hr />
                  <label className="cxp-pop-mine" title="내가 담당인 항목만 봅니다">
                    <input
                      type="checkbox"
                      checked={fAss !== ''}
                      onChange={(e) => setFAss(e.target.checked ? meName : '')}
                    />
                    내 것만
                  </label>
                </div>
              </>
            )}
            {filtAt && (
              <>
                <span className="cyt-gearovl" onClick={() => setFiltAt(null)} />
                <div
                  className="cy-hmenu-pop cxp-sidepop"
                  role="menu"
                  style={{
                    position: 'fixed',
                    left: Math.max(8, Math.min(filtAt.x - 220, window.innerWidth - 260)),
                    top: filtAt.y,
                    right: 'auto',
                    zIndex: 60,
                  }}
                >
              <div className="cxp-fsec">판정</div>
              {/* 결과로 좁히기 — 세로 목록, 결과 상태 전부(커스텀 포함) */}
              <div className="cxp-flist">
                <button
                  type="button"
                  className={fSet.size === 0 && !onlyRegress ? 'on' : ''}
                  onClick={() => {
                    setFSet(new Set())
                    setOnlyRegress(false)
                  }}
                >
                  <s className="d all" />
                  전체
                  <em>{items.length}</em>
                </button>
                {resDefs.map((r) => (
                  <button
                    key={r.v || '_none'}
                    type="button"
                    className={fSet.has(r.v) ? 'on' : ''}
                    onClick={() =>
                      setFSet((cur2) => {
                        const n = new Set(cur2)
                        if (n.has(r.v)) n.delete(r.v)
                        else n.add(r.v)
                        return n
                      })
                    }
                  >
                    <input type="checkbox" checked={fSet.has(r.v)} readOnly tabIndex={-1} />
                    <s
                      className="d"
                      style={{
                        background:
                          r.color ||
                          (r.group === 'pass'
                            ? '#34d399'
                            : r.group === 'fail'
                              ? '#f87171'
                              : r.v === ''
                                ? '#c3cad4'
                                : '#f0b429'),
                      }}
                    />
                    {r.label}
                    <em>{counts[r.v] ?? 0}</em>
                  </button>
                ))}
                {others.length > 0 && (
                  <button
                    type="button"
                    className={onlyRegress ? 'on' : ''}
                    title={
                      prev
                        ? `${prev.version || prev.name || '지난 플랜'} 에선 Pass 였는데 이번에 Fail 인 것`
                        : '비교할 지난 플랜이 없습니다'
                    }
                    onClick={() => setOnlyRegress((v2) => !v2)}
                  >
                    <input type="checkbox" checked={onlyRegress} readOnly tabIndex={-1} />
                    <s className="d reg" />
                    회귀
                    <em>{prev && prevVerdict.size ? regressN : '–'}</em>
                  </button>
                )}
              </div>
                </div>
              </>
            )}
            {/* 3행 — 지금 걸려 있는 것만 칩으로. 없으면 줄 자체가 없다 */}
            {(fSet.size > 0 || fKind || fAss || onlyRegress) && (
              <div className="cxp-chips">
                {[...fSet].map((v) => (
                  <button
                    key={v}
                    type="button"
                    className="cxp-chip"
                    onClick={() =>
                      setFSet((cur) => {
                        const n = new Set(cur)
                        n.delete(v)
                        return n
                      })
                    }
                  >
                    판정: {v || '미실행'} ✕
                  </button>
                ))}
                {fKind && (
                  <button type="button" className="cxp-chip" onClick={() => setFKind('')}>
                    방식: {fKind === 'auto' ? '자동' : '수동'} ✕
                  </button>
                )}
                {fAss && (
                  <button type="button" className="cxp-chip" onClick={() => setFAss('')}>
                    담당: {fAss} ✕
                  </button>
                )}
                {onlyRegress && (
                  <button type="button" className="cxp-chip" onClick={() => setOnlyRegress(false)}>
                    회귀만 ✕
                  </button>
                )}
                <button
                  type="button"
                  className="cxp-chipclr"
                  onClick={() => {
                    setFSet(new Set())
                    setFKind('')
                    setFAss('')
                    setOnlyRegress(false)
                  }}
                >
                  모두 지우기
                </button>
              </div>
            )}
            <div className="cxp-rows scroll">
            {(
              /* 표 머리 — 필드 차례는 지시 그대로다 */
              <div className="cxp-row cxp-hd">
                <span className="cxp-no">No</span>
                <span />
                <span className="cxp-rmain">시험 항목</span>
                <span className="cxp-rgt">
                  {fShow('who') && (
                    <span className="hf-who" title="담당자">
                      <i className="hd-ic">
                        <IconAccounts />
                      </i>
                      <em className="hd-lb">담당자</em>
                    </span>
                  )}
                  {fShow('by') && (
                    <span className="hf-who" title="실행자">
                      <i className="hd-ic">
                        <IconHand />
                      </i>
                      <em className="hd-lb">실행자</em>
                    </span>
                  )}
                  {fShow('kind') && (
                    <span className="hf-kind" title="타입 — 자동(A) · 수동(M)">
                      <i className="hd-ic">
                        <IconTag />
                      </i>
                      <em className="hd-lb">타입</em>
                    </span>
                  )}
                  {fShow('hist') && (
                    <span className="hf-hist" title="기존 결과 — 지난 회차의 판정. 누르면 회차별 Matrix">
                      <i className="hd-ic">
                        <IconNote />
                      </i>
                      <em className="hd-lb">기존 결과</em>
                    </span>
                  )}
                  {fShow('when') && (
                    <span className="hf-when" title="시험 시각">
                      <i className="hd-ic">
                        <IconClock />
                      </i>
                      <em className="hd-lb">시험 시각</em>
                    </span>
                  )}
                  {fShow('took') && (
                    <span className="hf-took" title="소요 시간">
                      <i className="hd-ic">
                        <IconWave />
                      </i>
                      <em className="hd-lb">소요</em>
                    </span>
                  )}
                  {fShow('stt') && (
                    <span className="hf-stt" title="진행 상태">
                      <i className="hd-ic">
                        <IconPing />
                      </i>
                      <em className="hd-lb">진행 상태</em>
                    </span>
                  )}
                </span>
              </div>
            )}

              {rows.map((it, i) => {
                const at = items.indexOf(it)
                const g = groupOfItem(it)
                const prevRow = rows[i - 1]
                const newGroup = i === 0 || !prevRow || groupOfItem(prevRow).k !== g.k
                const liveHere = st.on && st.itemAt === at && st.liveSteps.length > 0
                const shown = liveHere
                  ? ({ ...it, steps: st.liveSteps as CycleStep[], result: '' })
                  : it
                const v = itemVerdict(shown)
                const on = followAt === at
                return (
                  <React.Fragment key={`${it.tcid}-${i}`}>
                    {newGroup && (
                      /* 묶음 머리 — 누르면 그 묶음이 접힌다(지시). 묶음이 많으면
                         목록을 통째로 굴리지 않고 필요한 것만 편다. */
                      <div
                        className={`cxp-grow${grpFold.has(g.k) ? ' fold' : ''}`}
                        role="button"
                        tabIndex={0}
                        title={grpFold.has(g.k) ? '펼치기' : '접기'}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter' && e.key !== ' ') return
                          setGrpFold((cur) => {
                            const n = new Set(cur)
                            if (n.has(g.k)) n.delete(g.k)
                            else n.add(g.k)
                            return n
                          })
                        }}
                        onClick={() =>
                          setGrpFold((cur) => {
                            const n = new Set(cur)
                            if (n.has(g.k)) n.delete(g.k)
                            else n.add(g.k)
                            return n
                          })
                        }
                      >
                        <i className="cxp-growc" aria-hidden="true">
                          <IconChevron />
                        </i>
                        {/* 묶음 통째로 고르기(지시) — 이 묶음의 모든 항목이 따라온다 */}
                        {(() => {
                          const mine = rows
                            .filter((r) => groupOfItem(r).k === g.k)
                            .map((r) => items.indexOf(r))
                            .filter((x) => x >= 0)
                          const all = mine.length > 0 && mine.every((x) => pick.has(x))
                          const some = !all && mine.some((x) => pick.has(x))
                          return (
                            <input
                              type="checkbox"
                              className="cxp-growck"
                              checked={all}
                              ref={(el) => {
                                if (el) el.indeterminate = some
                              }}
                              aria-label={`${g.label} 묶음 통째로 고르기`}
                              title="이 묶음의 시험 항목을 모두 고릅니다"
                              onClick={(e) => e.stopPropagation()}
                              onChange={() => {
                                const n = new Set(pick)
                                if (all) mine.forEach((x) => n.delete(x))
                                else mine.forEach((x) => n.add(x))
                                sel.set([...n])
                              }}
                            />
                          )
                        })()}
                        <b>{g.label}</b>
                        {g.sub ? <span className="muted small"> {g.sub}</span> : null}
                      </div>
                    )}
                    {grpFold.has(g.k) ? null : (
                      <>
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
                      {/* 줄 번호 — 「몇 번째 항목」 으로 말이 오간다(지시) */}
                      <span className="cxp-no">{i + 1}</span>
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
                          {/* TC ID 는 뺐다(피드백) — 2열 머리에서 보인다 */}
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
                      {/* 오른쪽 무리 — 한 묶음(간격 균일): M/A · 이력 · 결과 셀렉트 · ▶ · 회귀 · 점 */}
                      <span className="cxp-rgt" onClick={(e) => e.stopPropagation()}>
                        {/* 담당자 — 읽기 전용. 할당은 플랜 수정 창에서 */}
                        {fShow('who') && (() => {
                          const who = String(it.assignee ?? '')
                            .split(/[,·/;]+/)
                            .map((x) => x.trim())
                            .filter(Boolean)
                          return (
                            <span
                              className={`cxp-who${who.length ? '' : ' none'}`}
                              title={who.length ? `담당: ${who.join(', ')}` : '담당자 없음'}
                            >
                              {who.length ? (
                                <>
                                  <i>{(who[0]![0] || '?').toUpperCase()}</i>
                                  {who.length > 1 && <em>+</em>}
                                </>
                              ) : (
                                <i className="g">👤</i>
                              )}
                            </span>
                          )
                        })()}
                        {/* 실행자 — 담당(맡은 이)과 다르다. 실제로 돌린 사람이다.
                            칸이 24px 이므로 담당자와 같은 첫 글자 꼴로 둔다 */}
                        {fShow('by') && (() => {
                          const by = String(it.executed_by ?? '').trim()
                          /* 자동으로 돈 줄은 사람 대신 AI 표(지시) */
                          if (it.executed_auto) {
                            return (
                              <span
                                className="cxp-who ai"
                                title={`자동 실행 — UTOP 계정이 실행했습니다${by ? ` (건 이: ${by})` : ''}`}
                              >
                                <IconSparkle />
                              </span>
                            )
                          }
                          return (
                            <span
                              className={`cxp-who${by ? '' : ' none'}`}
                              title={by ? `실행자: ${by}` : '아직 아무도 안 실행했습니다'}
                            >
                              {by ? <i>{(by[0] || '?').toUpperCase()}</i> : <i className="g">–</i>}
                            </span>
                          )
                        })()}
                        {/* 시험 타입 — TC 가 정본 */}
                        {(() => {
                          const kd = typeOf(it)
                          if (!fShow('kind')) return null
                          return (
                            <i className={`cxp-k ${kd}`} title={kd === 'manual' ? '수동' : '자동'}>
                              {kd === 'manual' ? 'M' : 'A'}
                            </i>
                          )
                        })()}
                        {/* 기존 시험 결과 — 자리 상시 유지, 없으면 미진행.
                            누르면 항목 × 회차 Matrix 가 뜬다(지시 ②) */}
                        {fShow('hist') && (() => {
                          const h = (histAll.get(it.tcid) ?? []).slice(0, 5)
                          const last = h[0]
                          return (
                            <span
                              className="cxp-hist go"
                              role="button"
                              onClick={() => {
                                setMatrixAt(it.tcid)
                                setMatrixOn(true)
                              }}
                              title={
                                h.length
                                  ? `기존 시험이력 — 누르면 회차별 Matrix\n${h.map((x) => `${x.label}: ${verdictLabel(x.v)}`).join('\n')}`
                                  : '기존 시험이력 없음 — 누르면 회차별 Matrix'
                              }
                            >
                              {last ? (
                                <i className={`hv-${verdictClass(last.v)} ro full short`}>
                                  {shortVerdict(last.v)}
                                  {h.length > 1 ? ` +${h.length - 1}` : ''}
                                </i>
                              ) : (
                                <i className="hv-none ro full short">–</i>
                              )}
                            </span>
                          )
                        })()}
                        {fShow('when') && (
                          <span className="cxp-when muted small">
                            {it.executed_at ? String(it.executed_at).replace('T', ' ').slice(0, 16) : '–'}
                          </span>
                        )}
                        {fShow('took') && (
                          <span className="cxp-took muted small">
                            {(() => {
                              const ms = (shown.steps ?? []).reduce(
                                (a2, x2) => a2 + (Number((x2 as { took_ms?: number }).took_ms) || 0),
                                0,
                              )
                              return ms ? `${(ms / 1000).toFixed(1)}s` : '–'
                            })()}
                          </span>
                        )}
                        {/* 진행 상태 */}
                        {/* 이번 실행에서 이 줄이 어디쯤인가 — 도는 중이면 몇 번째
                            스텝인지까지, 아직이면 「대기」. 끝난 줄은 판정이 말한다. */}
                        {fShow('stt') && (st.on && st.itemAt === at ? (
                          <i className="cxp-run">
                            ● 실행 중
                            {st.stepAt >= 0 ? ` · ${st.stepAt + 1}/${st.stepCount}` : ''}
                          </i>
                        ) : st.on && runQ.has(at) && !v ? (
                          <i className="cxp-wait">대기</i>
                        ) : null)}
                        {fShow('stt') && !(st.on && (st.itemAt === at || runQ.has(at))) && (
                          <i className="cxp-stt">{v ? '완료' : '대기 전'}</i>
                        )}
                      </span>
                    </div>
                    {/* 돌 때는 **저절로 펴지 않는다**(지시) — 진행은 「진행 상태」
                        칸과 머리줄이 말한다. 펴 보고 싶으면 사람이 화살표를
                        누른다. 그때는 도는 스텝이 그대로 차오른다. */}
                    {oneCol && openItem === at && (
                      <div className="cxp-inline">
                        <StepDetail
                          key={`inl-${it.tcid ?? at}`}
                          item={st.on && st.itemAt === at ? { ...it, steps: st.liveSteps } : it}
                          mode={typeOf(it)}
                          runningAt={st.on && st.itemAt === at ? st.stepAt : -1}
                          onSetStep={(at2, v2) => void setStepResult(it.tcid ?? '', at2, v2)}
                          onSetImg={(at2, file) => void setStepImg(it.tcid ?? '', at2, file)}
                          onSetImgUrl={(at2, url) => void setStepField(it.tcid ?? '', at2, { actual_img: url })}
                          onSetTxt={(at2, txt) => void setStepField(it.tcid ?? '', at2, { actual_txt: txt })}
                          onSetRca={(at2, txt) => void setStepField(it.tcid ?? '', at2, { rca: txt })}
                          onClose={() => setOpenItem(-1)}
                        />
                      </div>
                    )}
                      </>
                    )}
                  </React.Fragment>
                )
              })}
              {rows.length === 0 && <div className="empty">해당하는 항목이 없습니다.</div>}
            </div>
            {/* 바닥 줄 — 이 목록이 지금 무엇을 담고 있나(지시 ⑤).
                도는 중에는 몇 번째인지가 맨 앞에 온다. */}
            <div className="cxp-foot">
              <span>
                {rows.length}건{rows.length !== items.length ? ` (전체 ${items.length})` : ''}
              </span>
              <span className="cxp-foot-p">합격 {donePass}</span>
              <span className="cxp-foot-f">실패 {doneFail}</span>
              <span>미실행 {Math.max(0, items.length - doneAll)}</span>
              {pick.size > 0 && <span>{pick.size}건 선택</span>}
            </div>
          </aside>
          {/* 폭 조절 손잡이는 걷었다(지시 ①) — 쓰는 일이 드물었고 왼쪽 끝에
              가는 띠 하나가 늘 서 있어 화면이 어수선했다. */}
  
          {/* 두 칸 사이의 이동바(지시 ④) — 왼쪽 끝에 있던 것은 걷었다(지시 ③) */}
          {!oneCol && (
            <Resizer
              onResize={setSideW}
              getOrigin={() => sideRef.current?.getBoundingClientRect().left ?? 0}
              label="항목 목록 폭"
            />
          )}
          <section className="cxp-main scroll">
            {/* 오른쪽 칸의 현황 줄·현황판은 걷었다(지시 ②) — 진행은 목록 머리
                한 줄이 맡는다. 이 자리는 **고른 항목을 시험하는 자리**다. */}
            {cur ? (
              <>
                <div className="cxp-h">
                  {/* 부적합이 난 자리에서 **그 시험으로 바로 건너뛴다**(지시).
                      새 탭으로 연다 — 플랜 화면은 결과를 손보던 자리라
                      그것을 잃으면 안 된다. 돌아올 곳이 남아 있어야 한다. */}
                  <a
                    className="cxp-hlink"
                    href={gotoHref('tc', cur.tcid)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`${cur.tcid} 를 새 탭에서 엽니다`}
                  >
                    <b className="cxp-hid">{cur.tcid}</b>
                    <h3 className="cxp-hnm">{cur.name || cur.tcid}</h3>
                  </a>
                  <span className="sp" />
                  {(() => {
                    /* 결함 등록 — Fail 만이 아니라 Blocked·진행불가도 결함을 단다 */
                    const v0 = itemVerdict(cur)
                    const can = v0 === 'Fail' || v0 === 'Blocked' || v0 === '진행불가' || itemDefect
                    if (!can) return null
                    return (
                      <button
                        className="btn small danger"
                        type="button"
                        title={
                          itemDefect
                            ? `이미 등록된 결함 ${itemDefect.id}${itemDefect.jira_key ? ` · ${itemDefect.jira_key}` : ''} 이 열립니다`
                            : '이 항목으로 결함을 등록합니다'
                        }
                        onClick={() => setDefectFor(cur)}
                      >
                        ＋ 결함 등록
                      </button>
                    )
                  })()}
                  <select
                    className={`cy-v cxp-big ${verdictClass(itemVerdict(liveNow ? { ...cur, steps: st.liveSteps, result: '' } : cur))}`}
                    value={itemVerdict(cur)}
                    title="결과를 손으로 정합니다 · 우클릭 = 이 결과를 아래 행 전부에"
                    onChange={(e) =>
                      void setResult(cur.tcid, e.target.value === '' ? '미실행' : e.target.value)
                    }
                    onContextMenu={(e) => {
                      /* 아래 행에 결과 채우기(지시) — 요구사항·시험항목 목록과
                         같은 손이다. 보이는 목록에서 이 줄 아래 전부. */
                      e.preventDefault()
                      e.stopPropagation()
                      const v0 = itemVerdict(cur)
                      const at0 = rows.findIndex((x) => x.tcid === cur.tcid)
                      if (at0 < 0) return
                      const below = rows.slice(at0 + 1)
                      if (!below.length) {
                        window.alert('아래에 줄이 없습니다')
                        return
                      }
                      if (
                        !window.confirm(
                          `아래 ${below.length}건에 「${v0 || '미실행'}」 을 채울까요?`,
                        )
                      )
                        return
                      void (async () => {
                        for (const x of below) await setResult(x.tcid, v0 === '' ? '미실행' : v0)
                      })()
                    }}
                  >
                    {resDefs.map((r) => (
                      <option key={r.v} value={r.v} style={r.color ? { color: r.color } : undefined}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  {/* 「▶ 실행」 은 걷었다(지시) — 실행은 1행 카드가 맡는다 */}
                </div>
  
                {/* Execution 정보 — Zephyr 의 Execution 칸과 같은 자리 */}
                <FoldCard title="INFO">
                  <div className="cxp-exec">
                    {(() => {
                      const rows: Array<[string, string]> = [
                        ['제조사', maker || '–'],
                        ['제품군', family || '–'],
                        ['모델그룹', mgroup || '–'],
                        ['제품명', cycle.model || '–'],
                        ['버전그룹', cycle.version_group || '–'],
                        ['버전명', cycle.version || '–'],
                        ['담당자', cur.assignee || '–'],
                        ['실행자', cur.executed_by || '–'],
                        ['실행 시각', cur.executed_at ? String(cur.executed_at).slice(0, 16) : '–'],
                      ]
                      /* 플랜에 실린 나머지 값 — 상태·고객에 더해, 앞으로
                         늘어날 커스텀 필드(고객사·플랜 유형 …)가 코드 수정
                         없이 자동으로 나온다. 수정 창에 칸이 생기면 화면이 따라온다 */
                      const KNOWN: Record<string, string> = { status: '상태', customer: '고객' }
                      const SKIP = new Set([
                        'id', 'cid', 'ce', 'name', 'model', 'model_group', 'version',
                        'version_group', 'assignee', 'folder', 'folder_id', 'description',
                        'cloned_from', 'created_at', 'created_by', 'updated_by',
                        'start_date', 'end_date', 'items',
                      ])
                      for (const [k, v2] of Object.entries(cycle as unknown as Record<string, unknown>)) {
                        if (SKIP.has(k) || k.startsWith('_')) continue
                        if (typeof v2 !== 'string' && typeof v2 !== 'number') continue
                        if (String(v2).trim() === '') continue
                        rows.push([KNOWN[k] ?? k, String(v2)])
                      }
                      return rows.map(([k, v2]) => (
                        <div key={k}>
                          <i>{k}</i>
                          <b>{v2}</b>
                        </div>
                      ))
                    })()}
                    {/* 제목은 길다 — 몇 열이 되든 맨 아래 한 줄을 통째로(예외) */}
                    <div className="wide">
                      <i>플랜 제목</i>
                      <b>{cycle.name || '–'}</b>
                    </div>
                  </div>
                </FoldCard>
  
                {/* 위에 접어 둔 카드 셋(지시 ⑤⑥) — 열어 보는 사람만 편다.
                    기본은 접힘이라 스텝이 맨 위에 온다. */}
                <FoldCard title="시험 목적">{tcDoc?.object_md || '적어 둔 것이 없습니다.'}</FoldCard>
                <FoldCard title="사전 준비 조건">
                  {tcDoc?.precondition_md || '적어 둔 것이 없습니다.'}
                </FoldCard>
                <StepDetail
                  key={cur.tcid ?? ''}
                  item={liveNow ? { ...cur, steps: st.liveSteps } : cur}
                  mode={typeOf(cur)}
                  runningAt={liveNow ? st.stepAt : -1}
                  onSetStep={(at2, v2) => void setStepResult(cur.tcid ?? '', at2, v2)}
                  onSetImg={(at2, file) => void setStepImg(cur.tcid ?? '', at2, file)}
                  onSetImgUrl={(at2, url) => void setStepField(cur.tcid ?? '', at2, { actual_img: url })}
                  onSetTxt={(at2, txt) => void setStepField(cur.tcid ?? '', at2, { actual_txt: txt })}
                  onSetRca={(at2, txt) => void setStepField(cur.tcid ?? '', at2, { rca: txt })}
                  onClose={() => setOpenItem(-1)}
                />
              </>
            ) : (
              <div className="empty">왼쪽에서 항목을 고르면 여기서 그 항목을 시험합니다.</div>
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
 * 플랜 우클릭 메뉴.
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
  /** 플랜 상세가 맡은 일 — 세부 내역·요약·PPTX·자동 실행 */
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
    // 플랜을 지우면 그 안의 실행 결과가 같이 사라진다. 이름을 보여 주고 묻는다
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
      {item(IconEdit, '플랜 수정 (항목·제목)', () => onEdit(at.id))}
      {item(IconReqDoc, '세부 내역 (Details)', () => onDo('details'))}
      {item(IconExecution, '보고서 출력 (AI 요약 PDF)', () => onDo('ai'))}
      {item(IconSlide, 'PPTX 출력 (AI 요약)', () => onDo('pptx'))}
      <hr />
      {item(IconPlay, 'Test Cycle 자동 실행 (Automation)', () => onDo('run'))}
      <hr />
      {item(IconTag, '버전 이름만 바꾸기', () => void rename())}
      <hr />
      {item(IconTrash, '플랜 삭제', () => void del())}
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
/**
 * 플랜 복제 — 다른 툴들의 표준을 따른다.
 *
 * Zephyr Scale: 결과 상태로 걸러 복제, 결과·코멘트·결함은 전부 초기화.
 * TestRail(Rerun): 이전 상태별 체크박스 + Copy Assigned To 옵션.
 * 그래서 여기도: 직전 결과 상태 체크로 항목을 고르고, 결과는 복사하지
 * 않으며(전부 미실행 시작), 담당자만 옵션으로 유지한다.
 */
function CloneDialog({
  cycleId,
  onClose,
  onDone,
}: {
  cycleId: string
  onClose: () => void
  onDone: () => void
}) {
  const fullQ = useQuery({
    queryKey: ['cycle-full', cycleId],
    queryFn: async () => {
      const r = await apiFetch(`/api/cycle/${encodeURIComponent(cycleId)}`)
      if (!r.ok) throw new Error('플랜을 불러오지 못했습니다')
      return (await r.json()) as Record<string, unknown>
    },
  })
  const full = fullQ.data
  const items = useMemo(
    () => (Array.isArray(full?.items) ? (full!.items as CycleItemLite[]) : []),
    [full],
  )
  const resDefs = useResults()
  const counts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of resDefs) m[r.v] = 0
    for (const it of items) m[itemVerdict(it)] = (m[itemVerdict(it)] ?? 0) + 1
    return m
  }, [items, resDefs])

  const [version, setVersion] = useState('')
  const [name, setName] = useState('')
  const [keepWho, setKeepWho] = useState(true)
  /** 포함할 직전 결과 상태들 — 기본 전부 */
  const [stats, setStats] = useState<Set<string>>(() => new Set(RESULTS.map((r) => r.v)))
  // 설정에서 늘린 상태가 뒤늦게 오면 기본 선택에 합류시킨다
  const seededStats = useRef(false)
  useEffect(() => {
    if (seededStats.current || resDefs.length <= RESULTS.length) return
    seededStats.current = true
    setStats(new Set(resDefs.map((r) => r.v)))
  }, [resDefs])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // 원본이 오면 이름·버전 기본값을 채운다 (한 번만)
  const seeded = useRef(false)
  useEffect(() => {
    if (!full || seeded.current) return
    seeded.current = true
    setVersion(`${String(full.version ?? '')}_copy`)
    setName(full.name ? `${String(full.name)} (복제)` : '')
  }, [full])

  const keepItems = items.filter((it) => stats.has(itemVerdict(it)))

  const doClone = async () => {
    if (!full) return
    setBusy(true)
    setErr('')
    try {
      // 새 회차는 무조건 미실행으로 시작한다 — 직전 결과는 실행 화면이
      // 원본(cloned_from)을 참고로 보여 준다.
      const cleaned = keepItems.map((it) => ({
        tcid: it.tcid,
        name: it.name ?? '',
        req_id: it.req_id ?? '',
        assignee: keepWho ? (it.assignee ?? '') : '',
        steps: (it.steps ?? []).map((st) => {
          const c2 = { ...(st as Record<string, unknown>) }
          for (const k of [
            'result', 'output', 'status', 'repeatResult', 'reason',
            'executed_at', 'took_ms', 'rounds', 'actual_img', 'actual_txt',
          ])
            delete c2[k]
          return c2
        }),
      }))
      const nid = `cycle-${Date.now()}`
      const w = await apiFetch(`/api/cycle/${encodeURIComponent(nid)}`, {
        method: 'POST',
        body: JSON.stringify({
          ...full,
          id: nid,
          cid: '',
          // 실행 ID 도 새로 — CE 는 플랜과 1:1 이다. 물려받으면 두 플랜이
          // 같은 CE 를 갖게 된다 (첫 Run 때 새 cid 에서 파생된다)
          ce: '',
          // 원본을 기억한다 — 실행 화면의 「직전 결과」 가 이걸 가리킨다
          cloned_from: cycleId,
          version: version.trim() || `${String(full.version ?? '')}_copy`,
          name: name.trim(),
          items: cleaned,
        }),
      })
      if (!w.ok) throw new Error(String(w.status))
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-back" onMouseDown={() => !busy && onClose()}>
      <div className="modal cy-clone" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <b>플랜 복제</b>
          {err && <span className="muted small err">{err}</span>}
          <span className="sp" />
        </div>
        {fullQ.isLoading ? (
          <div className="empty">불러오는 중…</div>
        ) : (
          <div className="cy-clone-b">
            <label className="fld">
              <span>새 버전명</span>
              <input value={version} onChange={(e) => setVersion(e.target.value)} />
            </label>
            <label className="fld">
              <span>새 제목</span>
              <input
                value={name}
                placeholder="(비우면 제목 없음)"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <div className="cy-clone-sec">
              <div className="cy-clone-st">
                <b>포함할 항목 — 직전 결과 기준</b>
                <button
                  type="button"
                  className="linkish"
                  onClick={() =>
                    setStats(
                      stats.size === resDefs.length
                        ? new Set()
                        : new Set(resDefs.map((r) => r.v)),
                    )
                  }
                >
                  {stats.size === resDefs.length ? '전부 해제' : '전부 선택'}
                </button>
              </div>
              {resDefs.map((r) => (
                <label key={r.v} className="cy-clone-ck">
                  <input
                    type="checkbox"
                    checked={stats.has(r.v)}
                    onChange={() =>
                      setStats((cur) => {
                        const n = new Set(cur)
                        if (n.has(r.v)) n.delete(r.v)
                        else n.add(r.v)
                        return n
                      })
                    }
                  />
                  {r.label}
                  <i>{counts[r.v] ?? 0}건</i>
                </label>
              ))}
            </div>
            <label className="cy-clone-ck">
              <input
                type="checkbox"
                checked={keepWho}
                onChange={(e) => setKeepWho(e.target.checked)}
              />
              담당자 유지 (Copy Assigned To)
            </label>
            <p className="muted small">
              모든 항목은 미실행으로 시작합니다. 직전 시험 결과는 실행 화면의
              항목별 「직전 결과」 칩으로 참고 표시됩니다(원본 플랜 기준).
            </p>
            <div className="cy-clone-f">
              <span className="sp" />
              <button
                className="btn primary"
                type="button"
                disabled={busy || keepItems.length === 0}
                onClick={() => void doClone()}
              >
                {busy ? '복제 중…' : `복제 (${keepItems.length})`}
              </button>
              <button className="btn" type="button" disabled={busy} onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        )}
      </div>
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
        {/* 돌아가는 길은 **늘** 있어야 한다(지시). 여태는 실행이 끝나야만
            「표로 돌아가기」 가 떠서, 도는 동안에는 빵부스러기의 폴더를
            눌러 빠져나와야 했다. 나가도 실행은 계속 돈다. */}
        <button
          className="btn small cy-run-back"
          type="button"
          title="플랜 화면으로 돌아갑니다 — 실행은 그대로 계속됩니다"
          onClick={onExit}
        >
          ← 플랜
        </button>
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
                  <b className="cy-regchip" title={`${prevName || '지난 플랜'} 에선 Pass`}>
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
  onFill,
  onRemove,
}: {
  at: { x: number; y: number }
  count: number
  onClose: () => void
  onEdit: () => void
  /** 이 줄의 결과를 아래 행 전부에(지시) */
  onFill?: () => void
  /** TC ID 열을 뺐다 — 시험으로 가는 길은 여기다 */
  onGoTc?: () => void
  /** 플랜에서 빼기 — 위 단추 줄을 걷어냈으니 여기가 길이다 */
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
      {onFill && (
        <button type="button" onClick={onFill}>
          ↓ 아래 행에 결과 채우기
        </button>
      )}
      {onGoTc && (
        <button type="button" onClick={onGoTc}>
          시험 열기 (TC)
        </button>
      )}
      {onRemove && (
        <button type="button" className="danger" onClick={onRemove}>
          플랜에서 빼기{count > 1 ? ` (${count})` : ''}
        </button>
      )}
    </div>
  )
}



function StepDetail({
  item,
  mode,
  runningAt,
  onSetStep,
  onSetImg,
  onSetImgUrl,
  onSetTxt,
  onSetRca,
  onIssue,
  defect,
  onClose,
}: {
  item: CycleItemLite
  /** 수동인가 자동인가 — TC 실행 타입이 정한다. 표시 방식이 갈린다 */
  mode?: 'manual' | 'auto'
  /** 지금 도는 스텝 번호. 안 돌면 -1 */
  runningAt: number
  /** 스텝 하나의 결과를 손으로 정한다 */
  onSetStep?: (at: number, result: string) => void
  onSetImg?: (at: number, file: File) => void
  onSetImgUrl?: (at: number, url: string) => void
  onSetTxt?: (at: number, txt: string) => void
  onSetRca?: (at: number, txt: string) => void
  onIssue?: () => void
  defect?: DefectRec | null
  onClose: () => void
}) {
  const steps = item.steps ?? []
  /** 출력을 펼친 스텝. 전부 펼쳐 두면 긴 출력에 묻혀 목록이 안 보인다 */

  return (
    <div className="cy-steps-pane">
      <div className="cy-sp-head">
        {/* 제목은 이 칸 맨 위 머리에 이미 있다 — 겹쳐서 뺐다(지시) */}
        {/* 판정이 나오는 스텝만 센다(합의) — 주석·메시지는 절차 제목이다 */}
        <span className="muted small">
          {steps.filter((s) => isJudgeStep(s as TcStep)).length}단계
        </span>
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
        mode={mode}
        runningAt={runningAt}
        onSetResult={onSetStep}
        onSetImg={onSetImg}
        onSetImgUrl={onSetImgUrl}
        onSetTxt={onSetTxt}
        onSetRca={onSetRca}
      />
    </div>
  )
}
