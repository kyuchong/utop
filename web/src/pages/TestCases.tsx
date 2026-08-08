import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiFetch, tcApi } from '@/api/client'
import TcForm from '@/components/TcForm'
import ListHead from '@/components/ListHead'
import TcBulkForm from '@/components/TcBulkForm'
import TcBulkEdit from '@/components/tc/TcBulkEdit'
import { useMultiSelect } from '@/components/useMultiSelect'
import TcSequence from '@/components/tc/TcSequence'
import TcStepDetail from '@/components/tc/TcStepDetail'
import TcTree from '@/components/tc/TcTree'
import TcSessionBar from '@/components/tc/TcSessionBar'
import TcParamBar from '@/components/tc/TcParamBar'
import TcTerminal from '@/components/tc/TcTerminal'
import TcSaveAs from '@/components/tc/TcSaveAs'
import { useGlobalParams } from '@/components/tc/useGlobalParams'
import GlobalParams from '@/components/settings/GlobalParams'
import {
  buildTcFile,
  downloadJson,
  parseTcFile,
  remapSessions,
  tcFileName,
  TcFileError,
  nextTcId,
  uniqueTcId,
} from '@/components/tc/portable'
import TcInfo from '@/components/tc/TcInfo'
import TcManual from '@/components/tc/TcManual'
import TcTopology from '@/components/tc/TcTopology'
import TcHistory from '@/components/tc/TcHistory'
import TcCycles from '@/components/tc/TcCycles'
import { deviceLabel, isMeter } from '@/components/tc/device'
import type { Device } from '@/pages/Devices'
import Resizer, { useResizableWidth } from '@/components/Resizer'
import { type TestCaseMeta } from '@/types'
import { runPicked, runSteps, type RunCtx, type RunLog } from '@/components/tc/runner'
import { extractOne } from '@/components/tc/judge'
import type { PickItem } from '@/components/tc/PickList'
import {
  sessionIndex,
  stepResult,
  stepStatus,
  type StepKind,
  type TcData,
  type TcStep,
} from '@/components/tc/types'
import './TestCases.css'

type Tab = 'steps' | 'info' | 'topo' | 'manual' | 'history' | 'cycle'

/** 새 스텝의 기본값. 종류마다 처음부터 채워둬야 자연스러운 값이 다르다. */
function blankStep(kind: StepKind): TcStep {
  const base: TcStep = { kind, indent: 0 }
  if (kind === 'cli' || kind === 'connect' || kind === 'disconnect' || kind === 'instrument')
    base.session = 0
  if (kind === 'wait') base.waitSec = 3
  if (kind === 'ping') base.pingCount = 4
  if (kind === 'snmp_trap') base.trapSec = 15
  if (kind === 'loop') {
    base.forFrom = 1
    base.forTo = 10
    base.loopVar = 'i'
  }
  return base
}

/**
 * 테스트케이스 화면.
 *
 * 3열이다 — 1열 폴더·요구사항·TC 트리 · 2열 스텝 요약 · 3열 스텝 세부.
 *
 * 1열은 요구사항 화면과 같은 트리다. 전에는 TC 89건이 평평하게 늘어선
 * 목록이었고 요구사항으로 좁히려면 위의 「요구사항」 팝업을 따로 띄워야
 * 했다 — '지금 무엇으로 좁혀져 있나' 가 목록 밖에 있었다. 좁히는 일과
 * 고르는 일은 한 자리에서 끝나야 한다.
 *
 * 전에는 TC 를 누르면 화면이 통째로 상세로 바뀌어 목록이 사라졌다. 89건을
 * 훑을 때 그것이 가장 불편했다.
 */
/**
 * 새로고침해도 보던 자리로 돌아온다.
 *
 * 스텝을 쓰다가 새로고침하면 TC 89건 목록 앞으로 튕겨서 트리를 다시 펼치고
 * 다시 찾아 들어가야 했다. 화면 이름은 이미 App.tsx 가 기억하고 있으니,
 * 여기서는 그 안에서 무엇을 보고 있었는지를 기억한다.
 */
const OPEN_KEY = 'utop.tc.open'
const TAB_KEY = 'utop.tc.tab'
const TABS: Tab[] = ['steps', 'info', 'topo', 'manual', 'history', 'cycle']

export default function TestCases() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>(() => {
    const v = localStorage.getItem(TAB_KEY) as Tab | null
    // 저장된 값이 지금 없는 탭일 수 있다(탭 이름을 바꾼 뒤). 빈 화면이 뜨느니
    // 기본으로 돌린다.
    return v && TABS.includes(v) ? v : 'steps'
  })
  const [openId, setOpenId] = useState(() => localStorage.getItem(OPEN_KEY) || '')
  const [stepIdx, setStepIdx] = useState(-1)
  const [menuOpen, setMenuOpen] = useState(false)
  /** 명령어 캡쳐를 열면 3열이 그것으로 바뀐다 — 캡쳐하는 동안 스텝 세부는 볼 일이 없다 */
  const [termOpen, setTermOpen] = useState(false)
  /**
   * 지금 열어 둔 전역 파라미터 파일.
   *
   * 트리의 고정 폴더에서 고르면 오른쪽이 그 파일 편집으로 바뀐다. TC 와
   * 파라미터는 같은 트리에 있지만 둘 중 하나만 열려 있다 — iTest 도
   * 탐색기에서 test case 와 parameter file 을 같은 자리에서 연다.
   */
  const [paramKey, setParamKey] = useState('')
  const [form, setForm] = useState<TestCaseMeta | null | undefined>(undefined)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [msg, setMsg] = useState<{ kind: string; text: string }>({ kind: '', text: '' })

  // 편집 중인 TC 전체. 목록의 메타가 아니라 스텝까지 든 원본이다.
  const [d, setD] = useState<TcData>({})
  const [dirty, setDirty] = useState(false)

  /** 여러 줄 고르기. 지우거나 건너뛰기를 한 번에 하려는 것 */
  const [picked, setPicked] = useState<Set<number>>(new Set())
  /** shift 범위 고르기의 기준 */
  const lastPick = useRef(-1)

  const [running, setRunning] = useState(false)
  /** 지금 돌고 있는 줄. -1 이면 안 돌고 있다 */
  const [runAt, setRunAt] = useState(-1)
  const [runLog, setRunLog] = useState<RunLog[]>([])

  const splitRef = useRef<HTMLDivElement>(null)
  const [listW, setListW] = useResizableWidth('utop.tc.listW', 250, 170, 460)
  // 기본값을 바꿀 때는 key 도 올린다 — 이미 저장된 옛 값이 이겨서 아무도
  // 변화를 못 본다(Resizer.tsx 주석). 3열이 남는 폭을 갖게 되면서 2열의
  // 적정 폭도 달라졌다.
  const [seqW, setSeqW] = useResizableWidth('utop.tc.seqW2', 620, 260, 1400)

  const tcQ = useQuery({
    queryKey: ['tc', 'list', 'meta'],
    queryFn: ({ signal }) => api.listTestCases(signal),
  })

  // 세션이 장비 id 로 저장돼 있어 이름을 붙이려면 장비 목록이 필요하다.
  const devQ = useQuery({
    queryKey: ['devices2'],
    queryFn: async () => {
      const r = await apiFetch('/api/devices2')
      if (!r.ok) throw new Error('장비 목록을 불러오지 못했습니다')
      return (await r.json()) as { devices?: Device[] }
    },
    staleTime: 60_000,
  })

  const tcs = tcQ.data?.tcs ?? []

  /**
   * 한꺼번에 고치려고 고른 TC 들. 스텝 고르기(`picked`)와 다른 것이다.
   *
   * 줄마다 네모를 두었더니 목록이 좁아지고 다른 도구와 다르게 동작했다.
   * 파일 탐색기·iTest 처럼 **Ctrl·Shift** 로 고른다.
   */
  const tcSel = useMultiSelect<string>()
  /** 찾는 글자 — 트리 안에 있던 줄을 머리줄로 올렸다 */
  const [treeQ, setTreeQ] = useState('')
  const pickedTc = tcSel.picked
  const [bulkEdit, setBulkEdit] = useState(false)

  /**
   * 고른 시험 지우기.
   *
   * 하나씩 순서대로 지운다. 한꺼번에 던지면 어디까지 지워졌는지 알 수 없어
   * 실패했을 때 무엇을 다시 해야 하는지 말해줄 수 없다.
   */
  const removeTcs = useMutation({
    mutationFn: async (ids: string[]) => {
      let ok = 0
      for (const id of ids) {
        await tcApi.remove(id)
        ok++
      }
      return ok
    },
    onError: (e) =>
      window.alert(`삭제하지 못했습니다 — ${e instanceof Error ? e.message : String(e)}`),
    onSuccess: (n) => {
      tcSel.clear()
      setMsg({ kind: 'ok', text: `${n}건을 지웠습니다` })
      void qc.invalidateQueries({ queryKey: ['tc', 'list', 'meta'] })
      void qc.invalidateQueries({ queryKey: ['tcs'] })
    },
  })

  const doRemoveTcs = () => {
    const ids = [...pickedTc]
    if (!ids.length) return
    const names = ids
      .map((id) => tcs.find((x) => x.tcid === id)?.name || id)
      .slice(0, 5)
      .join('\n · ')
    // 무엇이 사라지는지 적는다. 사이클에 들어 있던 항목도 같이 정리된다.
    if (
      !window.confirm(
        `시험 ${ids.length}건을 지웁니다.\n\n · ${names}${ids.length > 5 ? '\n …' : ''}\n\n` +
          '이 시험의 절차와 실행 이력이 함께 사라지고, 사이클에 들어 있던 항목에서도 빠집니다.\n' +
          '휴지통에 남지만 화면에서는 되돌릴 수 없습니다. 계속할까요?',
      )
    )
      return
    removeTcs.mutate(ids)
  }

  useEffect(() => {
    localStorage.setItem(TAB_KEY, tab)
  }, [tab])

  useEffect(() => {
    localStorage.setItem(OPEN_KEY, openId)
  }, [openId])

  /**
   * 기억해 둔 TC 가 그새 지워졌을 수 있다.
   *
   * 그냥 두면 3열이 계속 '불러오는 중' 이거나 빈 채로 남아서 화면이 고장난
   * 것처럼 보인다. 목록이 오면 확인하고 지운다.
   */
  useEffect(() => {
    if (!openId || tcQ.isLoading || tcs.length === 0) return
    if (!tcs.some((x) => x.tcid === openId)) setOpenId('')
  }, [openId, tcs, tcQ.isLoading])

  const devices = useMemo(() => devQ.data?.devices ?? [], [devQ.data])

  const devById = useMemo(() => {
    const m = new Map<string, Device>()
    for (const dv of devices) if (dv.id) m.set(dv.id, dv)
    return m
  }, [devices])

  // 고른 TC 의 원본을 따로 읽는다 — 목록 응답에는 스텝이 빠져 있다.
  const fullQ = useQuery({
    queryKey: ['tc', openId],
    enabled: !!openId,
    queryFn: async () => {
      const r = await apiFetch(`/api/tc/${encodeURIComponent(openId)}`)
      if (!r.ok) throw new Error('TC 를 불러오지 못했습니다')
      return (await r.json()) as TcData
    },
  })

  /** 어느 TC 를 화면에 올려 두었나. 저장 뒤 다시 읽어온 것과 구분한다 */
  const loadedId = useRef('')

  useEffect(() => {
    if (!fullQ.data) return
    setD(fullQ.data)
    setDirty(false)
    // **다른 TC 로 옮겼을 때만** 고른 줄을 되돌린다.
    //
    // 저장하면 서버에서 다시 읽어오는데, 그때도 되돌리고 있었다. 그래서
    // 저장 버튼을 누르는 순간 3열이 '스텝을 고르세요' 로 비었다 — 한 줄
    // 고치고 저장할 때마다 그 줄을 다시 찾아 눌러야 했다.
    if (loadedId.current !== openId) {
      loadedId.current = openId
      setStepIdx(-1)
      // 고른 줄은 자리 번호라 다른 TC 에서는 엉뚱한 줄을 가리킨다
      setPicked(new Set())
    }
  }, [fullQ.data, openId])

  const steps = (d.checks ?? []) as TcStep[]
  /** 탭에 숫자를 달아 두면 있는지 없는지 눌러보지 않아도 안다 */
  const manualCount = steps.filter((s) => s.kind === 'manual').length
  const wireCount = (d.wiring ?? []).length
  const autoCount = steps.length - manualCount
  /**
   * 이 TC 가 쓰는 세션. 자료에는 `sessions: ["dev-…"]` 처럼 장비 id 배열이
   * 들어 있고, 스텝의 session 은 그 배열의 자리 번호다.
   * 화면에는 장비 이름을 보여야 하므로 여기서 이름으로 바꿔 넘긴다.
   */
  const sessionIds = Array.isArray(d.sessions) ? (d.sessions as string[]) : []
  const sessionNames = sessionIds.map((id, i) => {
    const dev = devById.get(id)
    if (!dev) return `세션 ${i + 1}`
    // 이름이 있으면 IP 도 함께. 이름만 보이면 같은 이름의 장비가 랩마다
    // 있을 때 어느 것인지 모른다.
    const nm = deviceLabel(dev)
    const base = dev.ip && nm !== dev.ip ? `${nm} (${dev.ip})` : nm
    // 계측기는 표를 낸다. 이름을 안 적어 둔 장비가 많아 IP 만 뜨는데,
    // 그러면 스텝의 세션 칸에서 계측기를 스위치인 줄 알고 고른다.
    return isMeter(dev) ? `${base} · 계측기` : base
  })
  const sessionName = (i: number) => (i >= 0 ? (sessionNames[i] ?? `세션 ${i + 1}`) : '')

  /**
   * 스텝별로 이 TC 안에서 쓰이는 변수 이름.
   *
   * 같은 이름을 두 스텝이 뽑으면 뒤엣것이 앞엣것을 덮는다. 그런데 화면
   * 어디에도 안 나와서, 뒤 스텝의 `${var1}` 이 왜 엉뚱한 값인지 알 수가
   * 없었다. 지금 고른 스텝을 뺀 나머지가 쓰는 이름을 넘겨 준다.
   */
  const varsByStep = useMemo(
    () =>
      steps.map((s) =>
        [
          ...(s.queries ?? []).map((x) => x.var),
          ...(s.extracts ?? []).map((x) => x.var),
        ].filter((x): x is string => !!x),
      ),
    [steps],
  )

  const takenVars = useMemo(
    () => varsByStep.filter((_, i) => i !== stepIdx).flat(),
    [varsByStep, stepIdx],
  )

  /**
   * 앞 스텝이 뽑아 둔 변수와 지금 값.
   *
   * 전역 파라미터만 목록에 있어서 `${var1}` 은 손으로 쳐야 했다. 무엇을
   * 뽑아 뒀는지 화면 어디에도 안 보이니 값 비교를 쓸 수가 없었다.
   * 마지막 실행의 응답에 식을 대 보고 값까지 함께 보인다.
   */
  const stepVars = useMemo(() => {
    const items: PickItem[] = []
    const values: Record<string, string> = {}
    steps.forEach((s, i) => {
      // 뒤 스텝의 변수는 아직 안 뽑혔다 — 고른 줄보다 앞엣것만
      if (stepIdx >= 0 && i >= stepIdx) return
      const out = stepResult(s)
      const rules = [
        ...(s.queries ?? []).map((x) => ({ name: x.var, rule: x.q })),
        ...(s.extracts ?? []).map((x) => ({ name: x.var, rule: x.rule })),
      ]
      for (const r of rules) {
        if (!r.name) continue
        const got = r.rule ? extractOne(r.rule, out) : null
        if (got != null) values[r.name] = got
        items.push({
          value: `\${${r.name}}`,
          label: r.name,
          note: [got ?? '아직 안 뽑힘', `스텝 ${i + 1}`].join(' · '),
        })
      }
    })
    return { items, values }
  }, [steps, stepIdx])


  /**
   * 이 TC 가 붙는 장비의 모델.
   *
   * 전역 파라미터가 모델별로 갈려 있어서(E6100 의 포트 이름과 E5724RL 의
   * 것이 다르다) 어느 모델 것을 쓸지 정해야 한다. 첫 세션의 장비를 쓴다 —
   * 세션이 여럿이어도 시험 대상(DUT)은 보통 첫 자리다.
   */
  /**
   * 이 TC 가 쓰는 파라미터 파일.
   *
   * 고른 것이 없으면 안 붙는다 — 전에는 장비 모델과 이름이 같은 파일이
   * 자동으로 붙었는데, iTest 에 없는 규칙인 데다 아무도 못 알아챘다.
   * 옛 값(param_file, 하나만 고르던 때)은 읽어서 이어 준다.
   */
  const paramFiles = useMemo(() => {
    const v = d.param_files
    if (Array.isArray(v)) return v.filter((x) => typeof x === 'string' && x)
    return d.param_file ? [d.param_file] : []
  }, [d.param_files, d.param_file])

  const gp = useGlobalParams(paramFiles)

  /** 스텝 변수가 전역 파라미터를 덮는다 — 돌면서 알아낸 값이 최신이다 */
  const stepParams = useMemo(
    () => ({
      values: { ...gp.values, ...stepVars.values },
      items: [...stepVars.items, ...gp.items],
      loading: gp.loading,
      empty: gp.empty,
    }),
    [gp.values, gp.items, gp.loading, gp.empty, stepVars],
  )

  const patch = (p: Partial<TcData>) => {
    setD((c) => ({ ...c, ...p }))
    setDirty(true)
  }

  /**
   * 스텝 한 줄 고치기.
   *
   * 최신 상태에서 갈아끼운다. 화면에서 손으로 고칠 때는 차이가 없지만,
   * 실행 중에는 스텝 결과가 잇달아 들어와서 닫힌 값(steps)을 쓰면 앞의
   * 결과가 뒤 결과에 덮여 사라진다.
   */
  const patchStep = (i: number, p: Partial<TcStep>) => {
    setD((c) => {
      const arr = (c.checks ?? []) as TcStep[]
      return { ...c, checks: arr.map((s, j) => (j === i ? { ...s, ...p } : s)) }
    })
    setDirty(true)
  }

  const addStep = (kind: StepKind) => {
    const next = [...steps, blankStep(kind)]
    patch({ checks: next })
    setStepIdx(next.length - 1)
  }

  /** 줄이 늘거나 자리가 바뀌면 고른 번호가 다른 줄을 가리킨다 */
  const clearPicked = () => {
    setPicked(new Set())
    lastPick.current = -1
  }

  const moveStep = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= steps.length) return
    const next = [...steps]
    const a = next[i]!
    next[i] = next[j]!
    next[j] = a
    patch({ checks: next })
    setStepIdx(j)
    clearPicked()
  }

  const setSessions = (next: string[], p?: Partial<TcData>) =>
    patch({ sessions: next, ...(p ?? {}) })

  /**
   * 세션 자리를 뺀다.
   *
   * 스텝은 장비가 아니라 **자리 번호**를 들고 있어서, 자리를 빼면 뒤쪽
   * 번호가 하나씩 당겨진다. 스텝을 그대로 두면 다음에 저장하는 순간
   * 조용히 옆 장비로 명령이 나간다 — 옛 화면이 실제로 그랬다.
   */
  /**
   * 묻지 않고 바로 뺀다.
   *
   * 세션을 넣고 빼는 것은 자주 있는 일이라 매번 물으면 그 창을 안 읽고
   * 누르게 된다. 대신 무슨 일이 있었는지는 알린다 — 스텝의 세션이 비워진
   * 것을 모르고 넘어가면 실행할 때 가서야 안다. 잘못 뺐으면 저장 전에
   * 다시 넣으면 되고, 저장 전까지는 서버에 아무 일도 일어나지 않는다.
   */
  const removeSession = (i: number) => {
    const gone = sessionNames[i] ?? `S${i + 1}`
    const used = steps.filter((s) => sessionIndex(s.session) === i).length
    setMsg({
      kind: used ? 'err' : '',
      text: used
        ? `S${i + 1} (${gone}) 뺐습니다 — 스텝 ${used}개의 세션이 비었습니다`
        : `S${i + 1} (${gone}) 뺐습니다`,
    })
    setSessions(
      sessionIds.filter((_, j) => j !== i),
      {
        checks: steps.map((s) => {
          const k = sessionIndex(s.session)
          if (k < 0) return s
          if (k === i) return { ...s, session: '' }
          return k > i ? { ...s, session: k - 1 } : s
        }),
      },
    )
  }

  /**
   * 스텝 복제.
   *
   * 바로 아래에 넣는다. 비슷한 명령을 줄줄이 만드는 일이 잦은데
   * (show interface 1 · 2 · 3 …) 지금은 매번 새로 만들어 다시 쳐야 했다.
   *
   * **결과는 안 가져온다.** output·판정·실행 시각을 복사하면 돌려보지도
   * 않은 줄이 PASS 로 앉아 있게 된다.
   */
  const duplicateStep = (i: number) => {
    const src = steps[i]
    if (!src) return
    const {
      output: _o,
      response: _r,
      status: _s,
      repeatResult: _rr,
      reason: _rs,
      executed_at: _at,
      ...rest
    } = src
    const next = [...steps]
    next.splice(i + 1, 0, { ...rest })
    patch({ checks: next })
    setStepIdx(i + 1)
    setMsg({ kind: 'ok', text: `${i + 1}번 줄을 복제했습니다` })
  }

  /**
   * 줄 고르기. shift 를 누른 채면 앞서 고른 줄부터 여기까지.
   *
   * 30줄짜리 시험에서 가운데 열 줄을 지우려면 하나씩 누르는 것으로는
   * 못 쓴다.
   */
  const pickStep = (i: number, range: boolean) => {
    setPicked((cur) => {
      const n = new Set(cur)
      if (range && lastPick.current >= 0) {
        const [a, b] = lastPick.current < i ? [lastPick.current, i] : [i, lastPick.current]
        for (let k = a; k <= b; k++) n.add(k)
      } else if (n.has(i)) n.delete(i)
      else n.add(i)
      return n
    })
    lastPick.current = i
  }

  /**
   * 묻지 않고 지운다.
   *
   * 저장 전까지 서버에는 아무 일도 일어나지 않는다 — 잘못 지웠으면 저장을
   * 안 하고 다시 열면 된다. 매번 창을 띄우면 그 창을 안 읽고 누르게 된다.
   * 대신 몇 개를 지웠는지는 알린다.
   */
  const removeSteps = (idx: number[]) => {
    if (idx.length === 0) return
    const gone = new Set(idx)
    patch({ checks: steps.filter((_, j) => !gone.has(j)) })
    setStepIdx(-1)
    setPicked(new Set())
    lastPick.current = -1
    setMsg({
      kind: '',
      text: `스텝 ${idx.length}개를 지웠습니다 — 저장 전까지는 되돌릴 수 있습니다`,
    })
  }

  const removeStep = (i: number) => removeSteps([i])

  /** 고른 줄을 한꺼번에 건너뛰기 / 되돌리기 */
  const skipPicked = (on: boolean) => {
    patch({ checks: steps.map((s, j) => (picked.has(j) ? { ...s, skip: on } : s)) })
    setMsg({ kind: '', text: `스텝 ${picked.size}개를 ${on ? '건너뜁니다' : '다시 돌립니다'}` })
  }

  const saveM = useMutation({
    mutationFn: async () => {
      // checks 를 항상 함께 보낸다. 빠지면 서버가 옛 값을 되살려
      // 방금 지운 스텝이 다시 나타난다(main.py 의 보존 장치).
      await tcApi.save(openId, { ...d, checks: d.checks ?? [] })
    },
    onSuccess: () => {
      setDirty(false)
      setMsg({ kind: 'ok', text: '저장했습니다' })
      void qc.invalidateQueries({ queryKey: ['tc', openId] })
      void qc.invalidateQueries({ queryKey: ['tc', 'list', 'meta'] })
    },
    onError: (e) => setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) }),
  })

  /**
   * 다른 이름으로 저장 · 파일에서 가져오기.
   *
   * 둘 다 '내용은 이미 있고 새 ID 만 정하면 되는' 일이라 한 창을 쓴다.
   */
  const [saveAs, setSaveAs] = useState<{
    title: string
    id: string
    name: string
    note?: string
    data: TcData
  } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const takenIds = useMemo(() => new Set(tcs.map((t) => t.tcid)), [tcs])

  const saveAsM = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const src = saveAs?.data ?? {}
      await tcApi.save(id, { ...src, tcid: id, name, checks: src.checks ?? [] })
      return id
    },
    onSuccess: (id) => {
      setSaveAs(null)
      setDirty(false)
      setOpenId(id)
      setMsg({ kind: 'ok', text: `${id} 를 만들었습니다` })
      void qc.invalidateQueries({ queryKey: ['tc', 'list', 'meta'] })
    },
    onError: (e) => setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) }),
  })

  /** 지금 TC 를 파일로. 다른 랩의 UTOP 에서 그대로 연다. */
  const exportTc = () => {
    if (!openId) return
    downloadJson(tcFileName(d), buildTcFile({ ...d, tcid: openId }, devById))
    setMsg({ kind: 'ok', text: '파일로 내보냈습니다' })
  }

  /**
   * 파일에서 가져오기.
   *
   * 서버가 다르면 장비도 다르다. 세션이 가리키던 장비를 IP·이름·모델로
   * 찾아 이 서버 것으로 바꿔 준다. 못 찾으면 그대로 두어 세션 칩이
   * 「없는 장비」로 뜨게 한다 — 아무 장비나 붙이면 엉뚱한 곳에 명령이 나간다.
   */
  const importFile = async (file: File) => {
    try {
      const f = parseTcFile(await file.text())
      const tc = { ...f.tc }
      const sess = Array.isArray(tc.sessions) ? (tc.sessions as string[]) : []
      const { sessions: mapped, matched } = remapSessions(sess, f.session_devices, devices)
      tc.sessions = mapped

      const from = f.origin ? `${f.origin} 에서 만든 시험` : '가져온 시험'
      const dev =
        sess.length === 0
          ? '세션 없음'
          : matched === sess.length
            ? `장비 ${matched}자리 모두 이 서버 것으로 맞췄습니다`
            : `장비 ${sess.length}자리 중 ${matched}개만 찾았습니다 — 나머지는 세션에서 고르세요`
      setSaveAs({
        title: '파일에서 가져오기',
        id: uniqueTcId(String(tc.tcid ?? 'TC'), takenIds),
        name: String(tc.name ?? ''),
        note: `${from} · ${dev}`,
        data: tc,
      })
    } catch (e) {
      setMsg({
        kind: 'err',
        text: e instanceof TcFileError ? e.message : `읽지 못했습니다 — ${String(e)}`,
      })
    }
  }

  const pickTc = (id: string) => {
    if (dirty && !window.confirm('저장하지 않은 변경이 있습니다. 옮길까요?')) return
    setOpenId(id)
    setMsg({ kind: '', text: '' })
  }

  const runStat = useMemo(() => {
    let pass = 0
    let fail = 0
    for (const s of steps) {
      const v = stepStatus(s)
      if (v === 'PASS') pass++
      else if (v === 'FAIL') fail++
    }
    return { pass, fail, done: pass + fail }
  }, [steps])

  /**
   * 실행.
   *
   * 스텝을 쓰면서 그 자리에서 돌려보는 것이 이 화면의 요점이라, TC Cycle 의
   * 배치 실행(backend/engine.py)과는 다른 길로 간다 — 여기서는 스텝 하나가
   * 끝날 때마다 결과가 그 줄에 바로 박힌다.
   */
  const runAbort = useRef<AbortController | null>(null)

  const doRun = async (from: number, only: boolean, pick?: number[]) => {
    if (running) return
    if (sessionIds.length === 0) {
      setMsg({ kind: 'err', text: '세션이 없습니다 — 「+ 세션」 으로 장비를 넣으세요' })
      return
    }
    const ac = new AbortController()
    runAbort.current = ac
    setRunning(true)
    setRunLog([])
    setMsg({
      kind: '',
      text: pick ? `고른 ${pick.length}줄 실행 중…` : only ? '스텝 실행 중…' : '실행 중…',
    })
    const began = Date.now()
    try {
      // 타입을 못박아 둔다 — 인라인 리터럴이라 콜백 인자를 추론해 주지 않는다
      const ctx: RunCtx = {
          steps,
          sessions: sessionIds,
          devById,
          onStep: patchStep,
          // 돌고 있는 줄을 따라간다. 3열이 그 줄의 응답이 자라는 것을
          // 보여주므로, 안 따라가면 스트리밍이 보이지 않는다.
          onAt: (i) => {
            setRunAt(i)
            setStepIdx(i)
          },
          onLog: (l) => setRunLog((v) => [...v.slice(-400), l]),
          params: gp.values,
          signal: ac.signal,
      }
      const r = pick ? await runPicked(ctx, pick) : await runSteps(ctx, from, only)
      /**
       * 전체를 끝까지 돌렸으면 TC 상태도 함께 정한다.
       *
       * 한 줄이라도 불합격이면 TC 는 불합격이다. 스텝 판정은 다 되는데
       * TC 상태는 사람이 손으로 고르고 있어서, 목록의 점과 실제 결과가
       * 어긋난 채로 남았다.
       *
       * 고른 줄만·한 줄만 돌린 것으로는 안 정한다 — 시험 전체를 본 것이
       * 아니라서 그 결과로 TC 를 판정하면 틀린다. 중지한 것도 마찬가지다.
       *
       * 저장은 안 한다. 실행 결과도 저장 전이므로, 여기만 먼저 서버에
       * 넣으면 상태와 스텝이 어긋난다.
       */
      let stamped = ''
      if (!only && !pick && !r.stopped) {
        setD((c) => {
          const arr = (c.checks ?? []) as TcStep[]
          let f = 0
          let p2 = 0
          for (const s of arr) {
            const v = stepStatus(s)
            if (v === 'FAIL') f++
            else if (v === 'PASS') p2++
          }
          if (f === 0 && p2 === 0) return c
          stamped = f > 0 ? 'FAIL' : 'PASS'
          return { ...c, status: stamped }
        })
        setDirty(true)
      }

      setMsg({
        kind: r.fail > 0 ? 'err' : 'ok',
        text:
          `${r.stopped ? '중지됨 · ' : ''}PASS ${r.pass} · FAIL ${r.fail}` +
          (stamped ? ` · TC 를 ${stamped} 로 두었습니다 (저장해야 남습니다)` : ''),
      })
      // 실행 이력은 전체 실행만 남긴다. 한 줄씩 돌려보는 것까지 쌓으면
      // 이력이 편집 기록이 되어 '언제 통째로 돌렸나' 를 못 찾는다.
      if (!only && !pick && !r.stopped) {
        void apiFetch(`/api/tc/${encodeURIComponent(openId)}/run-history`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            at: new Date().toISOString(),
            pass: r.pass,
            fail: r.fail,
            sec: Math.round((Date.now() - began) / 1000),
            sessions: sessionNames,
          }),
        })
          .then(() => qc.invalidateQueries({ queryKey: ['tc', openId, 'run-history'] }))
          .catch((e) => console.warn('[TestCases.doRun] 이력 저장 실패:', e))
      }
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setRunning(false)
      setRunAt(-1)
      runAbort.current = null
    }
  }

  /*
   * 3열 머리 — 탭 · ⋯ · 저장.
   *
   * 3열 안에만 두었더니 Automation 이 아닌 탭에서는 3열 자체를 안 그려서
   * **탭이 통째로 사라졌다.** 어느 탭에 있든 같은 자리에 있어야 다음 탭으로
   * 옮겨 갈 수 있다.
   */
  const detHead = (
                <div className="tc-dethead">
            {openId && !paramKey && (
              <div className="seg" role="tablist">
                {([
                  // 정보 → Manual → Automation 순. 시험을 만드는 순서와 같다 —
                  // 무엇을 시험할지 적고, 사람이 할 일을 적고, 그중 자동으로
                  // 돌릴 것을 만든다.
                  //
                  // 'Automation' 은 '스텝' 이 아니다 — 장비에 명령을 보내 자동으로
                  // 도는 절차고, 사람이 하는 것은 Manual Step 에 있다.
                  ['info', '정보'],
                  // 배선은 랩의 사실이라 시험 내용보다 앞이다 — 여기가 정해져야
                  // 스텝이 장비 포트 이름으로 말할 수 있다.
                  ['topo', '토폴로지'],
                  ['manual', 'Manual Step'],
                  ['steps', 'Automation'],
                  ['history', '실행 이력'],
                  ['cycle', '사이클'],
                ] as const).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={tab === k}
                    className={`seg-btn${tab === k ? ' on' : ''}`}
                    onClick={() => setTab(k)}
                  >
                    {label}
                    {k === 'steps' && autoCount > 0 && <span className="cnt">{autoCount}</span>}
                    {k === 'manual' && manualCount > 0 && <span className="cnt">{manualCount}</span>}
                    {k === 'topo' && wireCount > 0 && <span className="cnt">{wireCount}</span>}
                  </button>
                ))}
              </div>
            )}

            {/* ⋯ — 자주 안 쓰는 것은 접어 둔다 */}
            <div className="tc-more">
              <button
                className="btn tc-dots"
                type="button"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
              >
                ⋯
              </button>
              {menuOpen && (
                <>
                  <div className="tc-menu-back" onClick={() => setMenuOpen(false)} />
                  <div className="tc-menu" role="menu">
                    <button type="button" disabled={!openId}>
                      ✨ AI 로 만들기
                    </button>
                    {/* 「⌨ 명령어 캡쳐」 는 실행 줄에 있다. 같은 것을 여기 또 두면
                        어느 쪽이 무엇인지 생각하게 된다. */}
                    <hr />
                    {/* 랩마다 UTOP 이 따로 서 있어서 한쪽에서 만든 시험을 다른
                        쪽에서 그대로 돌리고 싶은 일이 잦다. DB 를 통째로 옮기면
                        장비 비밀번호까지 따라가므로, 시험 하나만 파일로 뗀다. */}
                    <button
                      type="button"
                      disabled={!openId}
                      onClick={() => {
                        setMenuOpen(false)
                        setSaveAs({
                          title: '다른 이름으로 저장',
                          // 같은 요구사항 묶음의 다음 번호. TC ID 앞부분이 곧
                          // 그 요구사항이라(U-REQ-SYS-HW-TC-004) 앞은 지키고
                          // 번호만 올린다.
                          id: nextTcId(openId, takenIds),
                          name: `${d.name ?? ''} 복사`.trim(),
                          data: d,
                        })
                      }}
                    >
                      다른 이름으로 저장
                    </button>
                    <button
                      type="button"
                      disabled={!openId}
                      onClick={() => {
                        setMenuOpen(false)
                        exportTc()
                      }}
                    >
                      파일로 내보내기
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false)
                        fileRef.current?.click()
                      }}
                    >
                      파일에서 가져오기
                    </button>
                    <hr />
                    <button type="button" onClick={() => { setMenuOpen(false); setBulkOpen(true) }}>
                      일괄 생성
                    </button>
                    <button type="button" onClick={() => { setMenuOpen(false); setForm(null) }}>
                      + Test Case
                    </button>
                  </div>
                </>
              )}
            </div>
            {openId && !paramKey && (
              <button
                className="btn primary"
                type="button"
                disabled={saveM.isPending || !dirty}
                onClick={() => saveM.mutate()}
              >
                {saveM.isPending ? '저장 중…' : dirty ? '저장' : '저장됨'}
              </button>
            )}
                </div>
  )

  const error = tcQ.error

  return (
    <>
      {form !== undefined && <TcForm editing={form} onClose={() => setForm(undefined)} />}
      {bulkOpen && <TcBulkForm onClose={() => setBulkOpen(false)} />}
      {bulkEdit && (
        <TcBulkEdit
          items={[...pickedTc].map((id) => ({
            tcid: id,
            name: tcs.find((x) => x.tcid === id)?.name,
          }))}
          onClose={() => setBulkEdit(false)}
          onDone={(text) => {
            setBulkEdit(false)
            tcSel.clear()
            setMsg({ kind: 'ok', text })
            void tcQ.refetch()
            // 지금 열어 둔 TC 도 방금 바뀌었을 수 있다
            void qc.invalidateQueries({ queryKey: ['tc', openId] })
          }}
        />
      )}
      {saveAs && (
        <TcSaveAs
          title={saveAs.title}
          defaultId={saveAs.id}
          defaultName={saveAs.name}
          note={saveAs.note}
          taken={takenIds}
          busy={saveAsM.isPending}
          onSubmit={(id, name) => saveAsM.mutate({ id, name })}
          onClose={() => setSaveAs(null)}
        />
      )}
      {/* 파일 고르기는 감춰 둔다 — ⋯ 메뉴가 이 칸을 대신 누른다 */}
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          // 같은 파일을 다시 골라도 change 가 뜨도록 비운다
          e.target.value = ''
          if (f) void importFile(f)
        }}
      />

      {error ? (
        <div className="load-error">
          데이터를 불러오지 못했습니다 — {(error as Error).message}
        </div>
      ) : null}

      {/* 상단 한 줄 — 어느 TC 를 보고 있는지 · 탭.
          요구사항으로 좁히는 일은 1열 트리가 맡는다. */}

      <div className="split tc-split" ref={splitRef}>
        {/* 1열 — 폴더 · 요구사항 · TC 트리 (요구사항 화면과 같은 모양) */}
        <section className="panel tc-listcol" style={{ flexBasis: listW }}>
          {/* 요구사항 화면과 **같은 부품**을 쓴다. 저마다 만들면 또 어긋난다 */}
          <ListHead
            name="시험항목"
            count={tcs.length}
            picked={
              pickedTc.size > 1 ? (
                // 세 화면이 같은 말을 쓴다 — 「N건 선택됨」 · ✕ 로 해제.
                // 무엇을 할지는 ⋯ 안에서 고른다.
                <span className="lh-picked">
                  {pickedTc.size}건 선택됨
                  <button type="button" onClick={tcSel.clear} title="선택 해제">
                    ✕
                  </button>
                </span>
              ) : undefined
            }
            search={{ value: treeQ, placeholder: 'TC · 요구사항 검색', onChange: setTreeQ }}
            add={{ title: '시험 만들기', onClick: () => setForm(null) }}
            menu={
              <>
                <button type="button" onClick={() => setForm(null)}>
                  시험 만들기
                </button>
                <button
                  type="button"
                  disabled={!openId}
                  onClick={() => {
                    const meta = tcs.find((x) => x.tcid === openId)
                    if (meta) setForm(meta)
                  }}
                >
                  선택 시험 편집
                </button>
                <button type="button" onClick={() => setBulkOpen(true)}>
                  시험 일괄 생성
                </button>
                {/* 고른 것에 대한 일. 지우는 것은 하나부터, 한꺼번에
                    고치는 것은 둘부터 — 한 건은 그냥 열어서 고치면 된다. */}
                {pickedTc.size > 0 && (
                  <>
                    <hr />
                    {pickedTc.size > 1 && (
                      <button type="button" onClick={() => setBulkEdit(true)}>
                        선택한 {pickedTc.size}건 한꺼번에 고치기
                      </button>
                    )}
                    <button
                      type="button"
                      className="danger"
                      disabled={removeTcs.isPending}
                      onClick={doRemoveTcs}
                    >
                      {removeTcs.isPending ? '삭제 중…' : `선택한 ${pickedTc.size}건 삭제`}
                    </button>
                  </>
                )}
              </>
            }
          />
          {tcQ.isLoading ? (
            <div className="empty">불러오는 중…</div>
          ) : (
            <TcTree
              tcs={tcs}
              openId={paramKey ? '' : openId}
              onOpen={(id) => {
                setParamKey('')
                pickTc(id)
              }}
              paramKey={paramKey}
              onOpenParam={setParamKey}
              picked={pickedTc}
              q={treeQ}
              onPickClick={tcSel.onClick}
            />
          )}

        </section>

        <Resizer
          label="TC 목록 폭 조절"
          onResize={setListW}
          getOrigin={() => splitRef.current?.getBoundingClientRect().left ?? 0}
        />

        {paramKey ? (
          <section className="panel tc-tabcol">
            {detHead}
            <GlobalParams only={paramKey} />
          </section>
        ) : !openId ? (
          <section className="panel">
            <div className="empty">왼쪽에서 테스트케이스를 고르세요.</div>
          </section>
        ) : tab === 'info' ? (
          <section className="panel tc-tabcol">
            {detHead}
            <TcInfo data={d} onChange={patch} tcid={openId} />
          </section>
        ) : tab === 'topo' ? (
          <section className="panel tc-tabcol">
            {detHead}
            <TcTopology
              data={d}
              devices={devices}
              onChange={patch}
              onDevicesChanged={() => void devQ.refetch()}
              onMsg={(kind, text) => setMsg({ kind, text })}
            />
          </section>
        ) : tab === 'manual' ? (
          <section className="panel tc-tabcol">
            {detHead}
            <TcManual data={d} onChange={patch} />
          </section>
        ) : tab === 'history' ? (
          <section className="panel tc-tabcol">
            {detHead}
            <TcHistory tcid={openId} />
          </section>
        ) : tab === 'cycle' ? (
          <section className="panel tc-tabcol">
            {detHead}
            <TcCycles tcid={openId} />
          </section>
        ) : (
          <>
            {/* 2열 — 스텝 요약 */}
            <section className="panel tc-seqcol" style={{ flexBasis: seqW }}>
              {/* 시험 이름은 절차 바로 위에. 위쪽 전체 폭에 두었더니 「무엇을
                  보고 있나」 와 「무엇을 하나」 가 화면 양끝으로 갈라졌다. */}
              <div className="tc-seqhead">
          <span className="tc-bar-ttl">
            {paramKey ? (
              <>
                <b>전역 파라미터</b>
                <span className="muted small">
                  {' '}
                  {paramKey === '__global__' ? '공통' : paramKey}
                </span>
              </>
            ) : openId ? (
              <>
                <b>{d.name || '(제목 없음)'}</b>
                <span className="muted small"> {openId}</span>
              </>
            ) : (
              <span className="muted">왼쪽에서 테스트케이스를 고르세요</span>
            )}
          </span>
          {msg.text && <span className={`muted small ${msg.kind}`}>{msg.text}</span>}
              </div>
              <div className="tc-run">
                <button
                  className="btn small primary"
                  type="button"
                  disabled={running || steps.length === 0}
                  title="처음부터 끝까지 돌립니다"
                  onClick={() => void doRun(0, false)}
                >
                  ▶ 전체
                </button>
                <button
                  className="btn small"
                  type="button"
                  disabled={running || stepIdx < 0}
                  title="고른 줄부터 끝까지"
                  onClick={() => void doRun(stepIdx, false)}
                >
                  ▶ 여기부터
                </button>
                <button
                  className="btn small danger"
                  type="button"
                  disabled={!running}
                  title="중지"
                  onClick={() => runAbort.current?.abort()}
                >
                  ⏹
                </button>
                {/* 스텝을 손으로 만들지 않고 쳐서 만드는 길. ⋯ 안에 숨기면
                    처음 오는 사람이 못 찾는다 — 여기가 그 사람의 첫 30초다. */}
                <button
                  className={`btn small${termOpen ? ' primary' : ''}`}
                  type="button"
                  title="장비에 붙어 명령을 치면 그대로 스텝이 됩니다"
                  onClick={() => setTermOpen((v) => !v)}
                >
                  ⌨ 명령어 캡쳐
                </button>
                {/* 어느 파라미터 파일이 붙어 있나. 실행 줄에 둔다 —
                    정보 탭 깊숙이 두면 지금 무엇이 깔려 있는지 모른 채
                    스텝을 쓰게 된다. */}
                <TcParamBar
                  files={paramFiles}
                  all={gp.files}
                  used={gp.used}
                  onChange={(next) => patch({ param_files: next, param_file: '' })}
                />
                <TcSessionBar
                  sessions={sessionIds}
                  devices={devices}
                  onAdd={(id) => setSessions([...sessionIds, id])}
                  onPick={(i, id) => setSessions(sessionIds.map((v, j) => (j === i ? id : v)))}
                  onRemove={removeSession}
                  onMsg={(kind, text) => setMsg({ kind, text })}
                />
                <span className="sp" />
                {runStat.done > 0 && (
                  <span className="muted small">
                    {runStat.done}/{steps.length} ·{' '}
                    <b className="status pass">PASS {runStat.pass}</b> ·{' '}
                    <b className="status fail">FAIL {runStat.fail}</b>
                  </span>
                )}
              </div>
              {fullQ.isLoading ? (
                <div className="empty">불러오는 중…</div>
              ) : (
                <TcSequence
                  steps={steps}
                  selected={stepIdx}
                  onSelect={setStepIdx}
                  onAdd={addStep}
                  sessionName={sessionName}
                  runningAt={runAt}
                  picked={picked}
                  onPick={pickStep}
                  // 수동 스텝은 여기 안 나온다. 별개 탭이다.
                  hide={(s) => s.kind === 'manual'}
                  onRun={running ? undefined : (i) => void doRun(i, true)}
                />
              )}
              {/* 실행 판.
                  전에는 아래에 여섯 줄짜리 회색 글이라 돌고 있는지도 잘
                  몰랐다. 돌 때는 크게, 끝나면 결과만 남기고 접힌다. */}
              {/* 고른 줄이 있을 때만 뜬다. 목록 **아래**에 둔다 — 위에 두면 띠가
                  나타나는 순간 줄이 통째로 아래로 밀려서, 방금 누른 칸이
                  손 밑에서 달아난다. */}
              {picked.size > 0 && (
                <div className="sq-bulk">
                  <b>{picked.size}개 골랐습니다</b>
                  <span className="muted small">shift 를 누른 채 누르면 그 사이가 모두</span>
                  <span className="sp" />
                  <button
                    className="btn small primary"
                    type="button"
                    disabled={running}
                    title="고른 줄만 번호순으로 돌립니다"
                    onClick={() => void doRun(0, false, [...picked])}
                  >
                    ▶ 고른 것만
                  </button>
                  <button className="btn small" type="button" onClick={() => skipPicked(true)}>
                    건너뛰기
                  </button>
                  <button className="btn small" type="button" onClick={() => skipPicked(false)}>
                    되돌리기
                  </button>
                  <button
                    className="btn small danger"
                    type="button"
                    onClick={() => removeSteps([...picked])}
                  >
                    삭제
                  </button>
                  <button className="btn small" type="button" onClick={clearPicked}>
                    해제
                  </button>
                </div>
              )}
              {(running || runLog.length > 0) && (
                <div className={`tc-runbox${running ? ' live' : ''}`}>
                  <div className="rb-head">
                    <span className={`rb-dot${running ? ' on' : ''}`} />
                    <b>
                      {running
                        ? runAt >= 0
                          ? `${runAt + 1}번 줄 실행 중`
                          : '실행 중'
                        : '실행 끝'}
                    </b>
                    {/* 얼마나 남았는지. 막대가 없으면 30줄짜리 시험에서
                        언제 끝날지 짐작할 수가 없다. */}
                    <span className="rb-bar">
                      <i style={{ width: `${steps.length ? ((runAt + 1) / steps.length) * 100 : 0}%` }} />
                    </span>
                    <span className="rb-cnt">
                      {Math.max(runAt + 1, runStat.done)} / {steps.length}
                    </span>
                    {runStat.pass > 0 && <b className="status pass">PASS {runStat.pass}</b>}
                    {runStat.fail > 0 && <b className="status fail">FAIL {runStat.fail}</b>}
                    {running ? (
                      <button
                        className="btn small danger"
                        type="button"
                        onClick={() => runAbort.current?.abort()}
                      >
                        ⏹ 중지
                      </button>
                    ) : (
                      <button className="btn small" type="button" onClick={() => setRunLog([])}>
                        닫기
                      </button>
                    )}
                  </div>
                  <div className="rb-log">
                    {runLog.slice(-40).map((l, i) => (
                      <div className={`rl ${l.kind}`} key={i}>
                        <span className="rl-n">{l.i + 1}</span>
                        <span className="rl-t">{l.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <Resizer
              label="스텝 목록 폭 조절"
              onResize={setSeqW}
              getOrigin={() => {
                const el = splitRef.current
                if (!el) return 0
                return el.getBoundingClientRect().left + listW + 6
              }}
            />

            {/* 3열 — 스텝 세부, 또는 캡쳐하는 동안은 명령어 캡쳐 */}
            <section className={`panel tc-detcol${termOpen ? ' wide' : ''}`}>
              {/* 탭은 **이 칸이 무엇을 보여줄지** 고르는 것이라 이 칸 머리에
                  있어야 한다. 위쪽 전체 폭에 두면 어느 칸이 바뀌는지 안 보인다. */}
              {detHead}
              {termOpen ? (
                <TcTerminal
                  sessions={sessionIds}
                  devById={devById}
                  sessionNames={sessionNames}
                  onAdd={(s) => {
                    // 함수형으로 붙인다. 기록 중에는 명령이 잇달아 들어와서
                    // 닫힌 값을 쓰면 앞 스텝이 뒤 스텝에 덮인다.
                    setD((c) => ({ ...c, checks: [...((c.checks ?? []) as TcStep[]), s] }))
                    setDirty(true)
                  }}
                  onClose={() => setTermOpen(false)}
                />
              ) : (
              <TcStepDetail
                step={stepIdx >= 0 ? (steps[stepIdx] ?? null) : null}
                index={stepIdx}
                total={steps.length}
                sessions={sessionNames}
                params={stepParams}
                takenVars={takenVars}
                onChange={(p) => stepIdx >= 0 && patchStep(stepIdx, p)}
                onMove={(dir) => stepIdx >= 0 && moveStep(stepIdx, dir)}
                onRemove={() => stepIdx >= 0 && removeStep(stepIdx)}
                onDuplicate={() => stepIdx >= 0 && duplicateStep(stepIdx)}
                onRun={running || stepIdx < 0 ? undefined : () => void doRun(stepIdx, true)}
              />
              )}
            </section>
          </>
        )}
      </div>
    </>
  )
}
