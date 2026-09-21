import { useEffect, useMemo, useRef, useState , type CSSProperties } from 'react'
import { prefGet, prefSet } from '@/lib/prefs'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { gotoClick, gotoHref } from '@/api/goto'
import {
  IconChevron,
  IconFolder,
  IconProject,
  IconReqDoc,
  IconPanelToggle,
  IconSearch,
  IconSettings,
} from '@/components/icons'
import { connParams } from '@/components/tc/device'
import { loopVarAt, runSteps } from '@/components/tc/runner'
import { Fragment } from 'react'
import TcSequence from '@/components/tc/TcSequence'
import TcStepDetail from '@/components/tc/TcStepDetail'
import TcTerminal from '@/components/tc/TcTerminal'
import RunLog, { type LogLine } from '@/components/tc/RunLog'
import RespView, { asStep } from '@/components/run/RespView'
import Resizer, { useResizableWidth } from '@/components/Resizer'
import { IconCli } from '@/components/icons'
import { stepNumbers, stepVerdict, type StepKind, type TcStep } from '@/components/tc/types'
import { useResults } from '@/pages/Cycles'
import type { Device } from '@/pages/Devices'

interface DraftStep {
  desc: string
  cli: string
  type?: string
  criteria?: string
  /** cli(기본) · wait · loop/for · if · inst(계측기) · snmp_get/set/trap · ping */
  kind?: string
  /** 주석 줄의 글 */
  text?: string
  /** 이 스텝을 건너뛴다 — Coverage 의 「이 스텝 건너뛰기」 */
  skip?: boolean
  /** 이 줄이 **묶음 머리**인가 — 여러 항목을 이어 붙일 때 그 경계 */
  head?: boolean
  /** SNMP·Ping 스텝이 들고 오는 것 */
  oid?: string
  community?: string
  snmpVersion?: string
  snmpPort?: number
  snmpValue?: string
  snmpType?: string
  trapSec?: number
  host?: string
  count?: number
  /** 장비가 둘 이상일 때 몇 번째 것으로 보낼까 (0부터) */
  session?: number
  loopCount?: number
  waitSec?: number
  /** 블록 안이면 1 크게 — 되풀이·조건의 몸통 */
  indent?: number
  /** if — 조건과 갈래 */
  condition?: string
  then?: string
  otherwise?: string
  /** for — 반복 변수와 범위 */
  var?: string
  from?: number
  to?: number
  sec?: number
  /** diff — 값 견주기. 장비로는 아무것도 안 나간다 */
  cmpLeft?: string
  cmpRight?: string
  cmpOp?: string
  excludeLines?: string
  /** inst — 계측기 동작(reserve·config·start·stat·stop·release) */
  action?: string
  rate?: string
  frame?: number
}

interface Draft {
  name: string
  /**
   * Coverage 항목의 **원본 스텝** — 「일반」 갈래가 쓴다.
   *
   * 여태는 TC → 초안(DraftStep) → 다시 실행용(TcStep)으로 두 번 바꿨고,
   * 그 중간에서 종류를 모르는 스텝이 버려졌다(지적: diff 가 빠졌다).
   * 일반은 **있는 시험을 그대로 도는** 갈래라 한 톨도 빠지면 안 된다 —
   * Coverage·플랜과 **같은 것**을 같은 실행기에 그대로 넘긴다.
   */
  raw?: TcStep[]
  object?: string
  device_ip?: string
  /** 장비가 둘 이상인 시험 — 차례가 곧 session 번호다 */
  device_ips?: string[]
  steps: DraftStep[]
  cut?: string[]
  allow_config?: boolean
}


interface Props {
  devices: Device[]
}

/**
 * 말로 시험 만들기.
 *
 * 있는 시험을 찾아 주는 것이 아니라, 있는 것을 **참고해서 새 시험을 짜고
 * 돌리고 결과를 알려 준다.**
 *
 * 1차는 **조회 시험만** 짓는다. 설정을 바꾸는 명령을 AI 가 지어내 장비로
 * 보내면 되돌릴 수가 없다. 조회는 틀려도 「출력이 없다」 로 끝난다.
 * 서버가 한 번 더 거르고, 잘린 것이 있으면 무엇을 왜 뺐는지 알려 준다.
 *
 * 그리고 **초안을 보여 주고 사람이 누른다.** 말이 잘못 알아들어졌을 때
 * 명령이 그대로 나가면 안 된다.
 *
 * 스텝을 고치는 자리(목록·세부)는 Coverage 와 **같은 부품**이다 — 여기서
 * 배운 손이 저기서도 그대로 통한다(지시).
 */
/** 초안 → 실행·목록이 함께 쓰는 스텝 벌. 「일반」 은 원본을 그대로 쓴다 */
function toTcSteps(draft: Draft): TcStep[] {
  const one = (s: DraftStep): TcStep => {
      const k = String(s.kind || 'cli')
      const indent = Math.max(0, Number(s.indent) || 0)
      const crit = String(s.criteria || '').trim()
      const chips = crit
        ? { rules: crit.split(/\r?\n/).map((v) => v.trim()).filter(Boolean).map((v) => ({ t: 'has' as const, v })) }
        : {}
      if (k === 'loop' || k === 'for') {
        const from = Number(s.from)
        const to = Number(s.to)
        const byRange = Number.isFinite(from) && Number.isFinite(to)
        return {
          kind: 'loop', indent, step: s.desc,
          ...(byRange
            ? { forFrom: from, forTo: to, forStep: 1, loopVar: s.var || 'i' }
            : { loopCount: s.loopCount ?? 1 }),
        } as TcStep
      }
      if (k === 'wait')
        return { kind: 'wait', indent, step: s.desc, waitSec: s.waitSec ?? s.sec ?? 1 } as TcStep
      if (k === 'if')
        return { kind: 'if', indent, step: s.desc, condition: s.condition || '' } as TcStep
      if (k === 'manual')
        return { kind: 'manual', indent, step: s.desc || s.text || '' } as TcStep
      /* 주석·메시지는 **장비로 아무것도 안 나간다**. 여기서 안 갈라 주면
         아래 기본 갈래로 떨어져 「빈 명령을 보내는 CLI 스텝」 이 되었다 —
         여러 시험을 이어 붙였을 때 그 경계 줄이 그랬다(지적). */
      if (k === 'comment' || k === 'message')
        return {
          kind: k, indent,
          step: s.desc || s.text || '',
          text: s.text ?? s.desc ?? '',
          ...(s.head ? { head: true } : {}),
        } as TcStep
      if (k === 'diff')
        return {
          kind: 'diff', indent, step: s.desc,
          cmpLeft: s.cmpLeft ?? '',
          cmpRight: s.cmpRight ?? '',
          cmpOp: s.cmpOp || '==',
          ...(s.excludeLines ? { excludeLines: s.excludeLines } : {}),
        } as TcStep
      if (k === 'snmp_get' || k === 'snmp_set' || k === 'snmp_trap' || k === 'ping') {
        // 실행기가 이 종류를 그대로 돈다 — 값만 옮겨 실어 준다
        return {
          // ★ 세션 자리를 안 실으면 실행기가 「대상 IP 가 없습니다」 로 멎는다
          //   (지적). 이 화면은 장비 한 대짜리라 늘 첫 자리다.
          kind: k, indent, step: s.desc, session: s.session ?? 0, ...chips,
          ...(s.oid ? { oid: s.oid } : {}),
          ...(s.community ? { community: s.community } : {}),
          ...(s.snmpVersion ? { snmpVersion: s.snmpVersion } : {}),
          ...(s.snmpPort ? { snmpPort: Number(s.snmpPort) } : {}),
          ...(s.snmpValue ? { snmpValue: s.snmpValue } : {}),
          ...(s.snmpType ? { snmpType: s.snmpType } : {}),
          ...(s.trapSec ? { trapSec: Number(s.trapSec) } : {}),
          ...(s.host ? { host: s.host } : {}),
          ...(s.count ? { count: Number(s.count) } : {}),
          type: (s.type as string) || (crit ? 'contains' : 'ok'),
          ...(crit ? { criteria: crit } : {}),
        } as TcStep
      }
      if (k === 'inst' || k === 'instrument') {
        const act = String(s.action || 'start')
        const meterAct =
          act === 'stat' ? 'traffic_stat'
          : act === 'stop' ? 'traffic_stop'
          : act === 'release' || act === 'clear' ? 'traffic_clear'
          : act === 'reserve' || act === 'ports' ? 'ports'
          : 'traffic_start'
        return {
          kind: 'instrument', indent, step: s.desc,
          meterAct, ...(s.sec ? { meterDur: Number(s.sec) } : {}),
          ...(s.frame ? { meterSize: Number(s.frame) } : {}),
        } as TcStep
      }
      return {
        kind: 'cli',
        indent,
        session: s.session ?? 0,
        step: s.desc,
        desc: s.desc,
        cli: s.cli,
        /* 기준이 비어 있으면 **오류만 없으면 합격**이다. 여태 'contains' 로
           보내 놓고 찾을 문구가 없어, 돌아도 판정이 안 붙었다(지적: PASS 표기
           안 됨). 작업 흐름도 「지금은 오류만 없으면 합격입니다」 라고 적어
           왔으므로, 그 말대로 보낸다. */
        type: s.type || (crit ? 'contains' : 'ok'),
        criteria: crit,
        ...chips,
      } as TcStep
  }
  /* 건너뛰기는 종류를 안 가린다 — 어느 갈래로 나가든 그대로 얹는다 */
  return draft.raw?.length
    ? draft.raw
    : draft.steps.map((s) => (s.skip ? { ...one(s), skip: true } : one(s)))
}

export default function AskBar({ devices }: Props) {
  const [text, setText] = useState('')
  /**
   * 이번에 **물어본 말**. 입력칸(text)과 따로 둔다.
   *
   * 다 만들면 입력칸을 비우는데, 흐름의 단계 가름(트래픽이 있나)이 입력칸
   * 글자를 보고 있었다. 비우는 순간 트래픽 시험이 「건너뜀」 으로 바뀐다 —
   * 물어본 말은 여기 남겨 그걸로 가른다.
   */
  const [asked, setAsked] = useState('')
  /** 새로 짓는 중인가 — Advanced 갈래가 켠다(가져오기는 adopting 이 맡는다) */
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  /**
   * 막 지어진 절차 — **캔버스가 아니라 레일용**.
   *
   * 캔버스의 스텝은 판정 기준까지 다 채운 뒤에 내놓는다(지시). 하지만 절차
   * 자체는 그보다 몇 초 앞서 나온다. 그동안 레일이 아무것도 안 보여 주면
   * 다 끝난 뒤에 한꺼번에 튀어나온다(지적) — 지어진 즉시 여기에 담아
   * 레일이 먼저 편다.
   */
  const [built, setBuilt] = useState<Draft | null>(null)
  /**
   * 설정 명령을 쓰는 시험을 만들까.
   *
   * 기본은 꺼짐이다. 켜면 configure terminal · interface · shutdown ·
   * no shutdown 까지 지을 수 있다 — 링크를 내렸다 올리는 시험이 그것이다.
   * reload·write·copy·erase 는 켜도 못 지나간다.
   */
  /**
   * 목업(v9)의 **두 갈래**.
   *  · 일반 = 이미 있는 시험(Coverage)을 골라 그대로 돌린다. 명령을 몰라도 된다.
   *  · 고급 = 없는 시험을 말로 새로 짓는다 — 여태 이 화면이 하던 일이다.
   * 고른 갈래는 기억한다.
   */
  /* ── 쓸 AI ──(지시: 우측 하단에서 고른다)
     여태는 설정에 박아 둔 기본 LLM 하나로만 돌았다. 같은 물음이라도 큰 모델과
     작은 모델의 답이 다른데, 바꾸려면 SETUP 까지 가야 했다. 고른 것은 계정에
     남고, 물음을 보낼 때 함께 실린다(서버가 그 LLM 으로 부른다). */
  const [llms, setLlms] = useState<{ id: string; name: string; model?: string }[]>([])
  const [llmId, setLlmId] = useState(() => prefGet('utop.ai.llm') ?? '')
  const [llmOpen, setLlmOpen] = useState(false)
  const [modeOpen, setModeOpen] = useState(false)
  useEffect(() => {
    void (async () => {
      try {
        const r = await apiFetch('/api/llms')
        const j = (await r.json()) as { llms?: { id: string; name: string; model?: string; status?: string }[] }
        const on = (j.llms ?? []).filter((x) => (x.status ?? 'active') === 'active')
        setLlms(on)
        /* 고른 것이 지워졌으면 첫 번째로 — 없는 AI 를 붙들고 있으면 서버가
           기본값으로 돌면서도 화면은 딴 이름을 보여 준다 */
        setLlmId((cur) => (cur && on.some((x) => x.id === cur) ? cur : (on[0]?.id ?? '')))
      } catch {
        /* 못 받아도 물음은 보낼 수 있다 — 서버가 기본 LLM 으로 돈다 */
      }
    })()
  }, [])
  useEffect(() => {
    if (llmId) prefSet('utop.ai.llm', llmId)
  }, [llmId])
  const llmNow = llms.find((x) => x.id === llmId)

  const [mode, setMode] = useState<'basic' | 'adv'>(() =>
    prefGet('utop.ai.mode') === 'basic' ? 'basic' : 'adv',
  )
  useEffect(() => {
    prefSet('utop.ai.mode', mode)
  }, [mode])
  const [devId, setDevId] = useState('')
  const [err, setErr] = useState('')
  /** 돌린 결과 — 스텝마다 판정과 출력 */
  const [ran, setRan] = useState<TcStep[] | null>(null)
  /** 여러 줄 고르기 — Coverage 목록 부품이 쓴다 */
  const [picked, setPicked] = useState<Set<number>>(new Set())
  /* **실행 로그** — 여태 버리고 있었다(onLog 가 빈 함수였다). 장비가 실제로
     무엇을 뱉었는지 원문을 못 보면, 판정이 틀렸을 때 까닭을 확인할 길이 없다
     (지적). Coverage 화면에는 있는데 이 화면만 없었다. */
  const [logs, setLogs] = useState<LogLine[]>([])
  const [logOnly, setLogOnly] = useState(false)
  const logN = useRef(0)
  const [at, setAt] = useState(-1)
  const [running, setRunning] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  /* ── 실행 응답 화면(지시: 사이클 자동 실행처럼) ──────────────────────
     실행을 걸면 편집용 세 판 대신 **응답이 주인공**인 화면으로 바뀐다 —
     상태 밴드 · 진행 막대 · 왼쪽 스텝 큐 · 오른쪽 큰 실행 로그.
     끝난 뒤 「절차·상세 보기」 로 언제든 편집 화면으로 돌아온다. */
  const [runView, setRunView] = useState(false)
  /* 절차가 **처음 열리면** 곧장 응답 화면이다(지시: 2열 카드에 3단은 보기
     힘들다 · General 은 읽기 전용이라 response 화면만으로 좋다).
     Advanced 는 절차를 짓고 고치는 갈래라 편집 세 판으로 연다 — 실행을
     걸면 그때 응답 화면이 된다. draft 는 편집 때마다 바뀌므로 「없다가
     생긴 순간」 만 잡는다. */
  const hadDraft = useRef(false)
  useEffect(() => {
    if (draft && !hadDraft.current) setRunView(mode === 'basic')
    hadDraft.current = !!draft
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])
  const runT0 = useRef(0)
  const [runSec, setRunSec] = useState(0)
  useEffect(() => {
    if (!running) return
    runT0.current = Date.now()
    setRunSec(0)
    const t = setInterval(() => setRunSec(Math.floor((Date.now() - runT0.current) / 1000)), 500)
    return () => clearInterval(t)
  }, [running])
  /** 첫 화면 질문 보기 — 무엇을 시킬 수 있는지 눌러서 안다 */
  const [examples, setExamples] = useState<Array<{ q: string; d?: string }>>([])
  /** 비슷한 기존 시험 — 새로 짓기 전에 있는 것부터 본다 */
  const [like, setLike] = useState<Array<{ tcid: string; name: string; model?: string; steps?: number }>>([])
  const [adopting, setAdopting] = useState('')
  /** 질문 보기 고치기 — 관리자만. ⚙ 로 켠다 */
  const [exEdit, setExEdit] = useState(false)
  /** 고치기 전 값 — 「취소」 는 이것으로 되돌린다 */
  const exBack = useRef<Array<{ q: string; d?: string }>>([])
  /** 모드 고르개(목업) — 입력칸 안에서 펼친다 */

  /**
   * 첫 화면 테마(지시) — 계절·명절 따라 오로라의 색이 바뀐다.
   * 색은 전부 CSS 가 들고 있고(data-theme), 여기는 이름만 기억한다.
   * 계정을 따라간다(prefs SYNC).
   */
  const THEMES = [
    ['aurora', '기본', '✨'],
    ['spring', '봄', '🌸'],
    ['summer', '여름', '🌊'],
    ['autumn', '가을', '🍂'],
    ['winter', '겨울', '❄️'],
    ['chuseok', '추석', '🌕'],
    ['seollal', '설', '🧧'],
  ] as const
  type ThemeKey = (typeof THEMES)[number][0]
  const [theme, setTheme] = useState<ThemeKey>(() => {
    const v = prefGet('utop.ai.theme')
    return (THEMES.some(([k]) => k === v) ? v : 'aurora') as ThemeKey
  })
  useEffect(() => {
    prefSet('utop.ai.theme', theme)
  }, [theme])
  const [themeOpen, setThemeOpen] = useState(false)

  /**
   * 캡슐 2행의 도구 줄(승인) — GPT 입력창의 짜임을 우리 것으로.
   * 핀한 도구는 캡슐에 칩으로 상주하고(계정을 따라간다), 켠 도구는
   * 질문 끝에 맥락으로 실린다. 장비 칩은 값(모델)을 갖는다.
   */
  const TOOLDEF = [
    ['find', '🔍', '시험 항목 찾기', '있는 시험 항목에서 먼저 찾아서 답합니다'],
    ['dev', '📟', '장비 고르기', '대상 장비를 정해 질문과 함께 보냅니다'],
    ['kb', '📖', '매뉴얼·지식 검색', '매뉴얼·지식 근거를 함께 찾아서 답합니다'],
    ['hist', '📊', '지난 결과 붙이기', '최근 실행 결과를 참고해서 답합니다'],
  ] as const
  const [pins, setPins] = useState<string[]>(() => {
    const raw = prefGet('utop.ai.pins')
    if (!raw) return ['find', 'dev']
    try {
      const v = JSON.parse(raw) as unknown
      return Array.isArray(v) ? (v as string[]).filter((k) => TOOLDEF.some(([t]) => t === k)) : ['find', 'dev']
    } catch {
      return ['find', 'dev']
    }
  })
  useEffect(() => {
    prefSet('utop.ai.pins', JSON.stringify(pins))
  }, [pins])
  const [toolsOpen, setToolsOpen] = useState(false)
  /** 켠 도구(find·kb·hist) — 세션 것. 켜짐은 질문에 실리는 맥락이다 */
  const [tOn, setTOn] = useState<Set<string>>(new Set())
  /** 고른 대상 장비(모델) */
  const [tDev, setTDev] = useState('')
  const [devOpen, setDevOpen] = useState(false)
  /* ── 장비 점유(지시: 목업의 「사용중」) ────────────────────────────
     남이 이미 잡고 있는 장비를 골라 실행을 걸 수 있었다. 통신이 되는지만 보고
     「누가 쓰는 중인지」 를 아예 몰랐기 때문이다. 자원 잠금은 서버에 이미
     있다(resource_lock) — 읽어서 상태에 섞는다. */
  const lockQ = useQuery({
    queryKey: ['locks'],
    queryFn: async () => {
      const r = await apiFetch('/api/locks')
      if (!r.ok) return { locks: [] }
      return (await r.json()) as {
        locks?: Array<{
          resource_id: string
          locked_by?: string
          locked_name?: string
          cycle_name?: string
          cycle_cid?: string
          note?: string
        }>
      }
    },
    /* 30초면 넉넉하다 — 고르개를 열 때마다 새로 읽는 것이 더 중요하다 */
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })
  const lockBy = useMemo(() => {
    const m = new Map<string, { who: string; what: string }>()
    for (const l of lockQ.data?.locks ?? []) {
      m.set(String(l.resource_id), {
        who: String(l.locked_name || l.locked_by || '다른 사람'),
        what: String(l.cycle_cid || l.cycle_name || l.note || '').trim(),
      })
    }
    return m
  }, [lockQ.data])

  /* ── 대화(지적: 질문 후 장비 선택부터 맞는 게 없다) ──────────────────
     여태 이 화면은 첫 화면 → 만드는 중 → 절차 판 **셋을 갈아 끼우는** 꼴이라
     물어본 말과 AI 가 무엇을 정했는지가 쌓이는 자리가 없었다. 한 줄짜리
     「물어본 말」 만 머리에 남아서, 여러 번 되물으며 좁혀 갈 수가 없었다.

     말풍선을 쌓는다 — 내 말은 오른쪽, AI 말은 ✦ 를 단 왼쪽. 단계(장비 →
     항목 → 절차)도 이 줄에 실어, 지금 어디쯤인지 늘 보이게 한다. */
  const [msgs, setMsgs] = useState<Array<{ who: 'u' | 'a'; html: string }>>([])
  const msgsRef = useRef<HTMLDivElement>(null)
  /* ── 오른쪽 「자세히 보기」 판(승인: 목업 「Test AI 시험 콘솔」) ─────────
     대화는 왼쪽 기둥에 짧게 오가고, 장비 표·항목 목록·절차·로그 같은 큰
     것은 오른쪽 판에 단계 배지와 함께 열린다. 이 값은 1·2단계에 무엇을
     펼칠지다 — 절차(draft)·생성 중(making)은 저희 자리가 따로 있다. */
  const [pane, setPane] = useState<'' | 'dev' | 'tc'>('')
  /** 남이 지은 글(장비 이름·항목 제목)을 html 에 실을 때 — 꺾쇠를 막는다 */
  const hesc = (t: string) =>
    String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  /** 말풍선 한 줄 — html 은 우리가 짓는 글이라 그대로 싣는다 */
  const say = (who: 'u' | 'a', html: string) => setMsgs((v) => [...v, { who, html }])
  /* 새 줄이 붙으면 아래로 따라간다 — 사람이 위로 올려 읽는 중이면 그대로 둔다 */
  useEffect(() => {
    const el = msgsRef.current
    if (!el) return
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    if (near) el.scrollTop = el.scrollHeight
  }, [msgs])

  /** 장비 고르개의 상태 탭 — 전체 · 연결됨 · 점검 · 연결안됨.
      열 머리 드롭다운에도 같은 거르개가 있지만, 가장 자주 쓰는 거르개가
      메뉴 속에 묻혀 있으면 두 번 눌러야 닿는다(목업: 탭으로 낸다). */
  const [devTab, setDevTab] = useState<'all' | 'ok' | 'busy' | 'part' | 'no'>('all')
  /* 장비를 고른 **뒤에** 이어서 할 일. 질문 흐름에서 고르개를 열었으면
     고르자마자 2단계(항목 고르기)로 이어져야 한다 — 창만 닫히고 멈추면
     사람이 다음에 무엇을 눌러야 할지 모른다. */
  const afterDevRef = useRef<'' | 'tc'>('')
  /* 장비 고르개 — **표**로 고른다(지시: 목업). 이름만 늘어놓던 목록으로는
     같은 모델이 열 대씩 있는 LAB 에서 어느 것을 고를지 알 수가 없었다.
     LAB·사업자·벤더·모델그룹으로 거르고, 연결 상태를 보고 짚는다. */
  const [devQ, setDevQ] = useState('')
  const [devF, setDevF] = useState<Record<string, string>>({})
  const [devHF, setDevHF] = useState('')
  const askInRef = useRef<HTMLInputElement>(null)
  /**
   * 도구를 켜고 끈다 — **켜면 입력줄에 칩이 선다**(지적: 골라도 추가가 안 된다).
   *
   * 전에는 켜기(tOn)와 칩으로 세우기(pins)가 따로였다. 메뉴에서 고르면 켜지긴
   * 하는데 화면에는 아무 일도 안 일어나, 눌린 줄 모르고 다시 눌러 껐다.
   * 켠 것은 보여야 한다 — 안 보이면 켠 줄 모른다.
   */
  const flipTool = (k: string) => {
    const on = tOn.has(k)
    setTOn((prev) => {
      const nx = new Set(prev)
      if (on) nx.delete(k)
      else nx.add(k)
      return nx
    })
    /* **켤 때만 칩을 세운다**(지시: 도구 선택 시 고정). 끌 때도 칩을 빼고
       있었더니, 껐다 켜려면 그때마다 ＋ 를 다시 열어야 했다 — 칩이 사라지는
       것을 「눌러도 안 된다」 로 읽는다. 칩을 빼는 것은 칩의 ✕ 로만 한다. */
    if (!on) setPins((prev) => (prev.includes(k) ? prev : [...prev, k]))
  }
  /**
   * 도구를 **입력줄에 꽂거나 뺀다** — 「＋ 도구 추가」 메뉴가 하는 일의 전부다(지시).
   *
   * 꽂는 것과 쓰는 것을 갈랐다: 여기서는 자리를 정하고, 켜고 끄거나 장비를
   * 고르는 것은 입력줄의 칩에서 한다.
   */
  const pinTool = (k: string) => {
    const had = pins.includes(k)
    setPins((prev) => (had ? prev.filter((x) => x !== k) : [...prev, k]))
    /* 뺄 때는 켜 둔 것도 함께 끈다 — 안 보이는 채로 질문에 실리면
       왜 그런 답이 왔는지 알 수 없다 */
    if (had) {
      setTOn((prev) => {
        const nx = new Set(prev)
        nx.delete(k)
        return nx
      })
      if (k === 'dev') setTDev('')
    }
  }

  /* 음성(지시) — 브라우저 내장 음성 인식(ko-KR)으로 받아 적는다.
     서버는 안 거친다. https 가 아니면 브라우저가 마이크를 막을 수 있어
     그때는 까닭을 말한다. */
  const [listening, setListening] = useState(false)
  const recRef = useRef<{ stop: () => void } | null>(null)
  useEffect(() => () => recRef.current?.stop(), [])
  function micToggle() {
    if (listening) {
      recRef.current?.stop()
      return
    }
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const w = window as any
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!SR) {
      window.alert('이 브라우저에는 음성 입력이 없습니다 — 크롬·엣지에서 쓸 수 있습니다.')
      return
    }
    const r = new SR()
    r.lang = 'ko-KR'
    r.interimResults = true
    r.continuous = true
    const base = text.trim()
    r.onresult = (e: any) => {
      let heard = ''
      for (const res of e.results) heard += res[0].transcript
      setText(base ? `${base} ${heard}` : heard)
    }
    r.onerror = (e: any) => {
      setListening(false)
      if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed')
        window.alert(
          '마이크를 쓸 수 없습니다 — 브라우저가 막았습니다.\n주소가 https 가 아니면 크롬·엣지가 마이크를 막습니다.',
        )
    }
    r.onend = () => setListening(false)
    /* eslint-enable @typescript-eslint/no-explicit-any */
    recRef.current = r
    r.start()
    setListening(true)
  }
  /** 이 브라우저에서 감춘 오프너 — 남의 화면은 그대로다 */
  const [exHide, setExHide] = useState<string[]>(() => {
    try {
      return JSON.parse(prefGet('utop.ai.exhide') || '[]') as string[]
    } catch {
      return []
    }
  })
  useEffect(() => {
    prefSet('utop.ai.exhide', JSON.stringify(exHide))
  }, [exHide])
  const [exSay, setExSay] = useState('')
  const [amAdmin, setAmAdmin] = useState(false)
  /** 같은 모델이 여러 대일 때 — 어느 장비로 보낼지 고르는 창 */
  /** 오른쪽에 펼쳐 볼 스텝 */
  const [stepAt, setStepAt] = useState(0)
  /**
   * 말에서 짚은 자리 — 트리를 **이 가지에 묶어 둔다**(지적).
   *
   * 고른 자리(tcFold)는 마디를 누를 때마다 바뀐다. 그것으로 가지를 자르면
   * 위 마디를 누르는 순간 형제 폴더가 우르르 돌아온다. 질문이 짚은 자리는
   * 따로 들고 있다가 「전체 보기」 를 눌러야 풀린다.
   */
  const [qFold, setQFold] = useState('')
  /** 장비 고르는 창의 찾기 — 이름·모델·IP·구역·랙을 한 칸으로 훑는다 */
  const [pickFind, setPickFind] = useState('')
  /** 지금 실린 시험의 번호 — Coverage 트리 길을 물을 열쇠 */
  const tcOf = (d: Draft | null) => {
    const v = String(d?.object ?? '').trim()
    return /^TC-/i.test(v) ? v : ''
  }
  /** 스텝 목록 폭 — Coverage 와 같은 조절바(목업) */
  const [seqW, setSeqW] = useResizableWidth('utop.ai.seqw', 560, 340, 1000)
  /* 3열 폭 조절(지시) — 1열 대화 목록 · 2열 대화, 3열은 남는 폭을 갖는다 */
  const [sessW, setSessW] = useResizableWidth('utop.ai.sessw', 232, 170, 420)
  const [chatW, setChatW] = useResizableWidth('utop.ai.chatw', 480, 320, 860)
  const sessRef = useRef<HTMLElement>(null)
  const homeRef = useRef<HTMLDivElement>(null)
  /** 실행 로그 판 폭 — 판이 셋이 되었으므로 이것도 잡을 수 있어야 한다 */
  const [logW, setLogW] = useResizableWidth('utop.ai.logw', 330, 240, 720)
  /** 판정 색은 **설정이 정본**이다 — 여기서 초록·빨강을 따로 박으면
      설정을 바꿔도 이 띠만 옛 색으로 남는다 */
  const resDefs = useResults()
  const logRef = useRef<HTMLElement | null>(null)
  const seqRef = useRef<HTMLElement | null>(null)
  /** 명령어 캡쳐 — 세부 칸을 통째로 바꾼다(Coverage 와 같은 자리) */
  const [termOpen, setTermOpen] = useState(false)
  /** 접어 둔 시험 묶음 — 여러 건을 이어 붙였을 때만 쓰인다 */
  const [foldGrp, setFoldGrp] = useState<Set<number>>(new Set())
  /** 작업 흐름에 남기는 기록 — 질문한 뒤부터 쌓이고, 만들어지면 그대로 남는다 */
  /** 담을 때 쓰는 지금 값 — 상태는 한 박자 늦어 마지막 줄이 빠진다 */
  const flowRef = useRef<Array<{ s: number; t: string }>>([])
  /** 한 일 한 줄 — `s` 는 **어느 단계의 일인가**.
   *  이걸 안 달면 모든 줄이 1단계(장비 선택) 밑에 쌓여 지금 어디를 하는지
   *  알 수 없다(지적). */
  const [, setFlowLogRaw] = useState<Array<{ s: number; t: string }>>([])
  /** 흐름을 적는 곳은 여기 하나 — 적는 즉시 flowRef 도 따라간다 */
  const setFlowLog = (
    up: Array<{ s: number; t: string }> | ((v: Array<{ s: number; t: string }>) => Array<{ s: number; t: string }>),
  ) =>
    setFlowLogRaw((v) => {
      const n = typeof up === 'function' ? up(v) : up
      flowRef.current = n
      return n
    })
  const valsRef = useRef<Array<{ k: string; v: string }>>([])
  const [, setFlowValsRaw] = useState<Array<{ k: string; v: string }>>([])
  const setFlowVals = (
    up: Array<{ k: string; v: string }> | ((v: Array<{ k: string; v: string }>) => Array<{ k: string; v: string }>),
  ) =>
    setFlowValsRaw((v) => {
      const n = typeof up === 'function' ? up(v) : up
      valsRef.current = n
      return n
    })
  /** 지금 도는 단계 (0 = 안 돎) — 흐름 칸이 이걸로 「진행 중」 을 보인다 */
  const [, setFlowAt] = useState(0)
  /** 이 대화의 id — 최근 목록에 남길 때 쓴다 */
  const [chatId, setChatId] = useState('')
  /* ── 1열 · 대화 목록(지시: 클로드·GPT 처럼) ─────────────────────────
     서버가 남겨 온 대화(nl-chats)를 왼쪽 기둥에 편다 — 누르면 그 절차를
     그대로 되살리고, ✕ 로 지운다. 목록은 제목·시각만 온다(가벼워야 한다). */
  const [recent, setRecent] = useState<Array<{ cid: string; title: string; at?: string }>>([])
  /** 로그인한 사람 — 말풍선 오른쪽의 「누가 물었나」 아바타(지시) */
  const [meName, setMeName] = useState('')
  useEffect(() => {
    void (async () => {
      try {
        const r = await apiFetch('/api/me')
        const b = (await r.json()) as { user?: { name?: string; username?: string } }
        setMeName(b.user?.name || b.user?.username || '')
      } catch {
        /* 이름이 없어도 화면은 돈다 */
      }
    })()
  }, [])
  const myInit = (meName || '나').slice(0, 1)
  /** 내보내기 미리보기(지시) — 내용을 팝업으로 보고 나서 내려받는다 */
  const [expPrev, setExpPrev] = useState<'' | 'pdf' | 'pptx'>('')
  /** 1열 접기(지시) — 접으면 아이콘 레일만 남는다. 계정에 남긴다. */
  const [railShut, setRailShut] = useState(() => prefGet('utop.ai.railshut') === '1')
  useEffect(() => {
    prefSet('utop.ai.railshut', railShut ? '1' : '0')
  }, [railShut])
  /* 목록 동작은 Knowledge AI 의 대화 목록과 같은 문법(지시) —
     줄마다 ⋯ 메뉴(이름 바꾸기·지우기), 최근 12개만 펴고 「더 보기」 */
  const [listAll, setListAll] = useState(false)
  const [thMenu, setThMenu] = useState('')
  /* 대화 검색(지시) — 새 채팅 아래 줄, 누르면 찾기 칸이 열려 제목으로 거른다 */
  const [findOn, setFindOn] = useState(false)
  const [findQ, setFindQ] = useState('')
  const shownChats = listAll ? recent : recent.slice(0, 12)
  useEffect(() => {
    if (!thMenu) return
    const close = () => setThMenu('')
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [thMenu])
  /** 이름 바꾸기 — 기록 전문을 읽어 제목만 갈아 다시 담는다(같은 id 덮어쓰기) */
  const renameChat = async (cid: string, cur: string) => {
    const nm = window.prompt('대화 이름', cur)
    if (!nm?.trim() || nm.trim() === cur) return
    try {
      const r = await apiFetch(`/api/ai/nl-chats/${encodeURIComponent(cid)}`)
      const b = (await r.json()) as { ok?: boolean; chat?: Record<string, unknown> }
      if (!b.ok || !b.chat) throw new Error('기록을 읽지 못했습니다')
      await apiFetch('/api/ai/nl-chats', {
        method: 'POST',
        body: JSON.stringify({ ...b.chat, id: cid, title: nm.trim() }),
      })
      setRecent((v) => v.map((x) => (x.cid === cid ? { ...x, title: nm.trim() } : x)))
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }
  useEffect(() => {
    void (async () => {
      try {
        const r2 = await apiFetch('/api/ai/nl-chats')
        /* 서버 목록은 **id** 로 준다 — cid 로만 읽으면 새로고침 뒤 번호가
           비어 「절차가 담겨 있지 않습니다」 로 떨어진다(옛 지적). 둘 다 받는다. */
        const b2 = (await r2.json()) as {
          ok?: boolean
          items?: Array<{ id?: string; cid?: string; title?: string; at?: string }>
        }
        if (b2.ok && Array.isArray(b2.items))
          setRecent(
            b2.items
              .map((x) => ({ cid: String(x.id ?? x.cid ?? ''), title: x.title ?? '', at: x.at }))
              .filter((x) => x.cid)
              .slice(0, 30)
              .map((x) => ({ ...x, title: x.title || x.cid })),
          )
      } catch {
        /* 기록이 없어도 화면은 돈다 */
      }
    })()
  }, [])
  /** 절차를 짓는 동안 「지금 무엇을 하는 중인가」 — 「생성 중」 만 띄우면
      멈춘 것인지 도는 것인지 알 수 없다(지적) */
  const [genSay, setGenSay] = useState('')
  /** 기준을 채우는 중인가 — 이때는 문구를 fillCriteria 가 쥔다 */
  const [filling, setFilling] = useState(false)
  /** 가져온 절차를 이 장비에 맞추며 바꾼 것들 — 「생성 완료」 칸에 적는다 */
  const notesRef = useRef<string[]>([])
  const [fitNotesRaw, setFitNotesRaw] = useState<string[]>([])
  const fitNotes = fitNotesRaw
  const setFitNotes = (up: string[] | ((v: string[]) => string[])) =>
    setFitNotesRaw((v) => {
      const n = typeof up === 'function' ? up(v) : up
      notesRef.current = n
      return n
    })
  const [pickDev, setPickDev] = useState<{ model: string; cands: Device[] } | null>(null)
  /** 말에서 잡은 모델 — 「E6100 …」 이면 'E6100'. 없으면 빈 값 */
  const [askModel, setAskModel] = useState('')
  /** 모델 고르는 창 — 말에 모델이 없을 때 **먼저** 묻는다(지시) */
  const [pickModelOpen, setPickModelOpen] = useState(false)
  /** 항목을 먼저 고른 뒤 장비를 묻는 중 — 고르면 이 항목으로 잇는다 */
  const [afterPick, setAfterPick] = useState<{ tcid: string; model: string } | null>(null)
  const [pickSel, setPickSel] = useState('')
  const [pickLab, setPickLab] = useState('')
  const [pickRack, setPickRack] = useState('')
  /** 시험 항목 고르는 창 — Coverage 의 항목 중에서 고른다 */
  const [likeAsk, setLikeAsk] = useState(false)
  /* **ESC 로 닫는다**(지적) — 장비 고르개는 덮개를 정확히 눌러야만 닫혔다.
     실수로 열면 빠져나오는 길이 하나뿐이었다. */
  useEffect(() => {
    if (!devOpen && !likeAsk) return
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (devOpen) setDevOpen(false)
      else setLikeAsk(false)
    }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [devOpen, likeAsk])

  /** 그 창의 찾기 글자 */
  const [tcFind, setTcFind] = useState('')
  /**
   * Coverage 의 시험 항목 전부(스텝이 있는 것만).
   *
   * 없는 항목을 지어내지 않는다(지시). 절차는 **여기 있는 항목**에서만
   * 나오고, 고른 장비에 맞춰 옮겨 준다.
   */
  const [tcAll, setTcAll] = useState<
    Array<{
      tcid: string
      name: string
      model: string
      mgroup: string
      status: string
      type: string
      steps: number
      /** 트리에서 이 항목이 걸린 마디들 — 뿌리부터 요구사항까지 */
      chain: string[]
      /** 보여 줄 자리 이름 */
      path: string[]
      /** 이 항목이 딸린 요구사항 — 표에 적는다 */
      reqid: string
      reqtitle: string
    }>
  >([])
  /** Coverage 와 같은 트리 — 마디 하나 */
  const [tcTree, setTcTree] = useState<
    Array<{ id: string; name: string; kind: 'cat' | 'req'; depth: number; parent: string }>
  >([])
  /** 창에서 고른 트리 마디 id. 빈 글자면 전부 */
  const [tcFold, setTcFold] = useState('')
  /**
   * 골라진 트리 마디의 DOM.
   *
   * 「E6100 시스템 정보 조회」 처럼 말에 자리가 있으면 창이 열리자마자
   * 그 마디로 스크롤한다. 없으면 사람은 트리 맨 위만 보고 「고른 게 없다」
   * 고 여긴다 — 뿌리 아래 다섯 층까지 들어가는 마디는 안 보이는 자리에 있다.
   */
  const tcSelRef = useRef<HTMLDivElement | null>(null)
  /** 펼쳐 둔 마디 */
  const [tcOpen, setTcOpen] = useState<Set<string>>(new Set())
  /** 체크한 시험 항목들 — 여러 건을 한 절차로 묶어 돌린다 */
  const [tcPick, setTcPick] = useState<Set<string>>(new Set())
  /**
   * 고른 장비 모델 것만 보이기 — **기본 끔**(지시).
   *
   * 한때 켜 두었는데, 트리 뿌리가 이미 「111. LGUPLUS E6100」 처럼 그 장비
   * 자리를 가리키고 있다. 거기에 모델명까지 걸면 공용으로 적어 둔 항목이
   * 죄다 빠져 고를 것이 없어진다 — 폴더 아래 것은 모델그룹·모델명과 상관
   * 없이 다 보인다. 좁혀 보고 싶을 때만 켠다.
   */
  /* 「고른 장비 것만」 은 **켜 두는 것이 기본**이다(지시). 꺼져 있어서
     E4020-48T 를 골랐는데 E6100·U9532H 항목이 그대로 떴다. */
  const [tcOnlyModel, setTcOnlyModel] = useState(true)
  /** 랙 자리(구역·랙) — 어느 장비인지 고를 때 자리로 가른다 */
  const [rackMap, setRackMap] = useState<Map<string, { lab: string; rack: string; pos?: number }>>(
    new Map(),
  )

  const usable = devices.filter((d) => d.role !== '계측기')

  /*
   * 시험 항목 창이 열리면 골라 둔 마디로 굴린다.
   *
   * 상태는 맞게 들어가 있다 — 「111. LGUPLUS E6100 > SYSTEM > 시스템 정보
   * 조회」 처럼 뿌리에서 세 층 아래여도 tcFold 는 정확히 그 자리를 가리킨다.
   * 그러나 트리는 맨 위부터 그리므로 사람은 그 마디를 못 본다. `on` 이 붙어
   * 있어도 화면 밖이면 없는 것과 같다(지적).
   *
   * ref 는 지금 골라진 줄에만 붙는다(아래 line()). 창이 뜬 다음 프레임에
   * 페인트가 끝나면 그 자리로 굴려 준다. 굴리기만 하고 focus() 는 안 잡는다 —
   * 트리에 커서를 두면 아래 찾기 칸에서 바로 못 친다.
   */
  useEffect(() => {
    if (!likeAsk || !tcFold) return
    const t = window.setTimeout(() => {
      tcSelRef.current?.scrollIntoView({ block: 'center' })
    }, 0)
    return () => window.clearTimeout(t)
  }, [likeAsk, tcFold])

  // 무엇을 시킬 수 있는지 — 빈 화면에 예시가 없으면 사람은 아무것도 못 친다
  useEffect(() => {
    void (async () => {
      try {
        const r = await apiFetch('/api/ai/examples')
        const b = (await r.json()) as { ok?: boolean; items?: Array<{ q: string; d?: string }> }
        if (b.ok && Array.isArray(b.items)) setExamples(b.items)
      } catch {
        /* 예시가 없어도 화면은 돈다 */
      }
      try {
        const rm = await apiFetch('/api/me')
        const bm = (await rm.json()) as { user?: { role?: string } }
        const role = bm.user?.role ?? ''
        setAmAdmin(role === '관리자' || role === 'admin')
      } catch {
        /* 못 읽으면 그냥 못 고치는 사람으로 본다 */
      }
      try {
        const rr = await apiFetch('/api/rackview')
        const rv = (await rr.json()) as {
          labs?: Array<{ id: string; name: string }>
          racks?: Array<{ id: string; name: string; lab_id?: string }>
          devices?: Array<{ id: string; rack_id: string; rack_pos?: number }>
        }
        const labOf = new Map((rv.labs ?? []).map((l) => [l.id, l.name]))
        const rackOf = new Map(
          (rv.racks ?? []).map((r3) => [r3.id, { name: r3.name, lab: labOf.get(r3.lab_id ?? '') ?? '' }]),
        )
        const m = new Map<string, { lab: string; rack: string; pos?: number }>()
        for (const d of rv.devices ?? []) {
          const rk = rackOf.get(d.rack_id)
          if (rk) m.set(d.id, { lab: rk.lab, rack: rk.name, pos: d.rack_pos })
        }
        setRackMap(m)
      } catch {
        /* 랙 자리를 몰라도 장비는 고를 수 있다 */
      }
      try {
        /*
         * Coverage 트리 그대로 고르게 하려고 셋을 함께 읽는다.
         *   시험 항목(tc) → 어느 요구사항(req) → 그 요구사항의 분류(cat1..4)
         * 트리의 자리는 분류 이름을 이어 붙인 것이다(예: SW · MAINT · SNMPv2).
         */
        const [rt, rq, rc] = await Promise.all([
          apiFetch('/api/tc?meta=1'),
          apiFetch('/api/req'),
          apiFetch('/api/req-categories'),
        ])
        const bt = (await rt.json()) as { tcs?: Array<Record<string, unknown>> }
        const bq = (await rq.json()) as { reqs?: Array<Record<string, unknown>> }
        const bc = (await rc.json()) as { categories?: Array<{ id: string; name: string }> }
        /*
         * Coverage 트리를 **그 모양 그대로** 세운다(지시).
         *   분류(cat) 나무 → 그 아래 요구사항(req) 마디 → 그 아래 시험 항목
         * 항목마다 뿌리부터 요구사항까지의 마디 사슬을 들려 보낸다 — 어느
         * 마디를 골라도 그 아래 것이 다 걸리게.
         */
        const cats = (bc.categories ?? []).map((c) => ({
          id: String(c.id),
          name: String(c.name),
          parent: String((c as { parent_id?: string | null }).parent_id ?? ''),
          sort: Number((c as { sort_order?: number }).sort_order ?? 0),
        }))
        const catById = new Map(cats.map((c) => [c.id, c]))
        const chainOf = new Map<string, string[]>()   // req 키 → 마디 사슬
        const nameOf = new Map<string, string[]>()    // req 키 → 자리 이름
        const reqOf = new Map<string, { id: string; title: string }>()   // req 키 → 번호·제목
        const nodes: Array<{ id: string; name: string; kind: 'cat' | 'req'; depth: number; parent: string; sort: number }> = []
        const seen = new Set<string>()
        const putCat = (id: string): number => {
          const c = catById.get(id)
          if (!c) return -1
          const d = c.parent ? putCat(c.parent) + 1 : 0
          if (!seen.has(id)) {
            seen.add(id)
            nodes.push({ id, name: c.name, kind: 'cat', depth: d, parent: c.parent, sort: c.sort })
          }
          return d
        }
        for (const r3 of bq.reqs ?? []) {
          const ids = [r3.cat1, r3.cat2, r3.cat3, r3.cat4].map((c) => String(c ?? '')).filter((c) => catById.has(c))
          let d = -1
          for (const id of ids) d = putCat(id)
          const leaf = String(r3.title ?? '').trim() || String(r3.reqid ?? '').trim()
          const rid = `req:${String(r3.id ?? r3.reqid ?? '')}`
          if (leaf && !seen.has(rid)) {
            seen.add(rid)
            nodes.push({ id: rid, name: leaf, kind: 'req', depth: d + 1, parent: ids[ids.length - 1] ?? '', sort: 0 })
          }
          const names = ids.map((c) => catById.get(c)?.name ?? '').filter(Boolean)
          if (leaf) names.push(leaf)
          // ★ 시험 항목의 req_id 는 요구사항의 **속 id**(rq-…) 다. 겉으로 보이는
          //   번호(REQ-…)로만 걸면 하나도 안 맞아 트리가 통째로 빈다(실측).
          for (const key of [r3.id, r3.reqid]) {
            const k2 = String(key ?? '')
            if (!k2) continue
            chainOf.set(k2, [...ids, ...(leaf ? [rid] : [])])
            nameOf.set(k2, names)
            /* 항목 줄에 **어느 요구사항 것인지** 적으려면 번호와 제목이 필요하다.
               트리를 세우며 이미 다 읽은 자료라 따로 부를 것이 없다(지적: 무엇을
               고르는지 판단할 근거가 화면에 없다). */
            reqOf.set(k2, {
              id: String(r3.reqid ?? '').trim(),
              title: String(r3.title ?? '').trim(),
            })
          }
        }
        nodes.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
        setTcTree(nodes.map(({ sort: _s, ...n }) => n))
        setTcAll(
          (bt.tcs ?? [])
            .map((t) => ({
              tcid: String(t.tcid ?? ''),
              name: String(t.name ?? t.tcid ?? ''),
              model: String(t.model ?? ''),
              mgroup: String((t as { model_group?: string }).model_group ?? ''),
              status: String(t.status ?? ''),
              type: String(t.type ?? ''),
              steps: Number(t._cli_count ?? 0),
              chain: chainOf.get(String(t.req_id ?? '')) ?? [],
              path: nameOf.get(String(t.req_id ?? '')) ?? [],
              reqid: reqOf.get(String(t.req_id ?? ''))?.id ?? '',
              reqtitle: reqOf.get(String(t.req_id ?? ''))?.title ?? '',
            }))
            // 스텝이 없는 항목은 가져와도 빈 절차다 — 고를 수 없게 둔다
            .filter((t) => t.tcid && t.steps > 0),
        )
      } catch {
        /* 목록을 못 읽으면 아래 「비슷한 항목」 만으로 고른다 */
      }
    })()
  }, [])

  /**
   * 비슷한 시험 찾기.
   *
   * 새로 짓는 것보다 **이미 통한 것을 가져오는 편이 정확하다.** 말을 적으면
   * 이 랩의 기존 TC 중 가까운 것을 찾아 두었다가, 누르면 고른 장비 모델에
   * 맞춰 포트 표기까지 바꿔 초안으로 앉힌다.
   */
  const findLike = async (
    q: string,
    dev?: Device,
  ): Promise<Array<{ tcid: string; name: string; model?: string; steps?: number }>> => {
    if (!q.trim()) {
      setLike([])
      return []
    }
    try {
      const picked = dev ?? usable.find((x) => x.id === devId)
      const r = await apiFetch(
        `/api/ai/nl-tc-like?text=${encodeURIComponent(q.trim())}&model=${encodeURIComponent(picked?.model ?? '')}&limit=5`,
      )
      const b = (await r.json()) as {
        ok?: boolean
        items?: Array<{ tcid: string; name: string; model?: string; steps?: number }>
      }
      /* 다섯까지 본다(목업) — 셋만 보이면 넷째·다섯째에 있던 정답을 못 만난다 */
      const items = b.ok && Array.isArray(b.items) ? b.items.slice(0, 5) : []
      setLike(items)
      return items
    } catch {
      setLike([])
      return []
    }
  }

  /* ── 단순 두 단계(승인: 목업) ──────────────────────────────────────────
   * 고르개 창을 먼저 띄우지 않는다. 대화 안에 **추천 한 장 + 후보 몇 줄 +
   * 전체 열기** 만 세운다 — 대부분의 질문은 추천을 누르는 것으로 끝나고,
   * 큰 창(상태 칸·표)은 「전체 열기」 를 눌렀을 때만 나온다.
   */

  /* 「찾는 중…」 말풍선(지시: 스피너가 돌아가는 게 보였으면).
     **진짜 기다리는 동안만** 돈다 — 항목 찾기는 서버가 말을 점수 매기는
     실제 호출이고, 장비 쪽은 점유(누가 쓰는 중인지)를 새로 읽는 동안이다.
     답이 오면 이 말풍선은 걷히고 그 자리에 결과가 선다. */
  const sayThink = (txt: string) =>
    setMsgs((v) => [
      ...v,
      {
        who: 'a',
        html: `<p class="ln"><span class="ask-think"><i class="ask-spin" aria-hidden="true"></i>${hesc(txt)}</span></p>`,
      },
    ])
  const unThink = () =>
    setMsgs((v) => v.filter((m) => !(m.who === 'a' && m.html.includes('ask-think'))))

  /** 고르면 **선택한 카드만 남는다**(지시) — 1·2단계 추천 블록(추천 카드·
      후보 줄·칩)을 고른 카드 하나로 갈아 끼운다. 블록이 없으면 새로 단다. */
  const pickedLine = (kind: 'dev' | 'tc', line: string) =>
    setMsgs((v) => {
      const mark = `data-pick="${kind}"`
      const has = v.some((m) => m.who === 'a' && m.html.includes(mark))
      return has
        ? v.map((m) => (m.who === 'a' && m.html.includes(mark) ? { ...m, html: line } : m))
        : [...v, { who: 'a' as const, html: line }]
    })
  /** 고른 장비 카드 — 추천 카드와 같은 꼴, 누를 거리 없이 ✓ 만 단다 */
  const devDoneCard = (nm: string, ip: string, k: string, label: string) =>
    `<p class="ln"><b>1단계 · 장비</b> — 이 장비로 정했습니다.</p>` +
    `<div class="ask-inb"><span class="ask-inhero done"><span class="ask-intt">` +
    `<b class="nm">${hesc(nm)}</b><i>${hesc(ip)}</i><em class="st ${k}">● ${hesc(label)}</em></span>` +
    `<span class="ask-inbtn done">✓ 선택됨</span></span></div>`
  /** 고른 항목 카드 — 위와 같은 꼴 */
  const tcDoneCard = (tcid: string, name: string, meta: string) =>
    `<p class="ln"><b>2단계 · 시험 항목</b> — 이 항목으로 <b>3단계 · 절차 만들기</b> 를 시작합니다.</p>` +
    `<div class="ask-inb"><span class="ask-inhero done"><span class="ask-intt"><code>${hesc(tcid)}</code>` +
    (meta ? `<i>${hesc(meta)}</i>` : '') +
    `</span><b class="nm">${hesc(name)}</b>` +
    `<span class="ask-inbtn done">✓ 선택됨</span></span></div>`

  /** 장비 하나의 상태 — 고르개 창의 판정을 요약한 것(통신 + 점유) */
  const devStat = (d: Device) => {
    const on = (proto: string) => {
      const a = (d.access ?? []).find((x) => String(x.protocol ?? '').toLowerCase() === proto)
      return !!a && a.enabled !== false && a.last_status === 'ok'
    }
    const cli = on('telnet') || on('ssh') || on('console')
    const snmp = on('snmp')
    if (!String(d.ip ?? '').trim() || (!cli && !snmp)) return { k: 'no' as const, label: '사용 불가' }
    const lk = lockBy.get(String(d.id))
    if (lk) return { k: 'busy' as const, label: `사용중 — ${lk.who}` }
    if (cli && snmp) return { k: 'ok' as const, label: '사용 가능' }
    return { k: 'part' as const, label: '일부 연결' }
  }

  /** 1단계 말풍선 — 비어 있는 장비 한 대를 추천하고, 나머지는 줄로.
      같은 순간 오른쪽 판에는 전체 장비 표가 선다(목업: 1단계 · 장비). */
  const sayDevBlock = (cands: Device[], m0: string) => {
    setPane('dev')
    /* 판의 표도 물어본 모델로 미리 좁힌다(목업: 다른 모델은 흐리게) —
       「필터 지우기」 로 언제든 전체로 돌아간다 */
    setDevQ(m0)
    const ord = { ok: 0, part: 1, busy: 2, no: 3 } as const
    const sorted = [...cands].sort((a, b) => ord[devStat(a).k] - ord[devStat(b).k])
    const hero = sorted[0]
    const heroSt = hero ? devStat(hero) : null
    const canHero = !!hero && (heroSt!.k === 'ok' || heroSt!.k === 'part')
    const row = (d: Device) => {
      const st = devStat(d)
      const dead = st.k === 'busy' || st.k === 'no'
      const nm = hesc(String(d.model || d.name || d.ip))
      return (
        `<span class="ask-inrow${dead ? ' dis' : ' js-devpick'}" data-id="${hesc(String(d.id))}">` +
        `<span class="nm"><b>${nm}</b></span><i>${hesc(String(d.ip ?? ''))}</i>` +
        `<em class="st ${st.k}">● ${hesc(st.label)}</em></span>`
      )
    }
    const rows = sorted.slice(canHero ? 1 : 0, canHero ? 4 : 3).map(row).join('')
    const head = m0
      ? `${hesc(m0)} 이(가) ${cands.length}대 있습니다${canHero ? ' — 비어 있는 이것으로 할까요?' : ' — 지금 비어 있는 것이 없습니다.'}`
      : '어느 장비에서 돌릴까요?'
    const heroHtml = canHero && hero
      ? `<span class="ask-inhero js-devpick" data-id="${hesc(String(hero.id))}">` +
        `<span class="ask-intt"><b class="nm">${hesc(String(hero.model || hero.name || ''))}</b>` +
        `<i>${hesc(String(hero.ip ?? ''))}</i>` +
        `<em class="st ${heroSt!.k}">● ${hesc(heroSt!.label)}</em></span>` +
        `<span class="ask-inbtn">이 장비로</span></span>`
      : ''
    /* 판을 여는 길은 **아티팩트 칩**(클로드 문법) — 글 속 링크보다 눈에 잡힌다 */
    const nOk = sorted.filter((d) => devStat(d).k === 'ok').length
    const nBusy = sorted.filter((d) => devStat(d).k === 'busy').length
    const nNo = sorted.filter((d) => devStat(d).k === 'no').length
    say(
      'a',
      `<p class="ln"><b>1단계 · 장비</b> — ${head}</p>` +
        `<div class="ask-inb" data-pick="dev">${heroHtml}${rows}</div>` +
        `<button type="button" class="ask-artchip js-pickdev"><span class="ic">🖧</span>` +
        `<span class="tx"><b>장비 고르기</b>` +
        `<em>사용 가능 ${nOk} · 사용중 ${nBusy} · 사용 불가 ${nNo}</em></span></button>`,
    )
  }

  /** 2단계 말풍선 — 말과 가장 가까운 항목 한 건을 추천하고, 나머지는 줄로 */
  const sayTcBlock = (
    items: Array<{ tcid: string; name: string; model?: string; steps?: number }>,
  ) => {
    const meta = (id: string) => tcAll.find((t) => t.tcid === id)
    const pill = (id: string): [string, string] => {
      const v = String(meta(id)?.status ?? '').toLowerCase()
      return v === 'pass' ? ['pass', 'Pass'] : v === 'fail' ? ['fail', 'Fail'] : ['none', '미실행']
    }
    const hero = items[0]!
    const hm = meta(hero.tcid)
    const [hk, hl] = pill(hero.tcid)
    const man = /manual|수동/i.test(String(hm?.type ?? ''))
    const nStep = Number(hero.steps || hm?.steps || 0)
    const rows = items
      .slice(1, 4)
      .map((x) => {
        const [k, l] = pill(x.tcid)
        return (
          `<span class="ask-inrow js-tcpick" data-tcid="${hesc(x.tcid)}" data-model="${hesc(String(x.model ?? ''))}">` +
          `<s class="ask-indot ${k}"></s><span class="nm">${hesc(x.name)}</span>` +
          `<em class="st ${k}">${l}</em></span>`
        )
      })
      .join('')
    say(
      'a',
      '<p class="ln"><b>2단계 · 시험 항목</b> — 말씀하신 건 이것 같습니다.</p>' +
        `<div class="ask-inb" data-pick="tc"><span class="ask-inhero js-tcpick" data-tcid="${hesc(hero.tcid)}" data-model="${hesc(String(hero.model ?? ''))}">` +
        `<span class="ask-intt"><code>${hesc(hero.tcid)}</code>` +
        `<em class="st pill ${hk}">${hk === 'none' ? '미실행' : `지난번 ${hl}`}</em>` +
        `<i>${man ? '수동' : '자동'}${nStep ? ` · ${nStep}스텝` : ''}</i></span>` +
        `<b class="nm">${hesc(hero.name)}</b>` +
        `<span class="ask-inbtn">이걸로 절차 만들기</span></span>` +
        rows +
        `</div>` +
        `<button type="button" class="ask-artchip js-picktc"><span class="ic">☰</span>` +
        `<span class="tx"><b>시험 항목 고르기</b>` +
        `<em>말과 가까운 ${items.length}건 · 전체에서 검색</em></span></button>`,
    )
  }

  /** 장비가 정해진 뒤 — 항목 추천으로 잇는다. 못 찾으면 그때만 큰 표를 연다 */
  const stepTc = async (d: Device, q: string) => {
    /* 「전체 목록 열기」 로 빠질 때를 위해 표를 미리 좁혀 둔다 */
    setTcOnlyModel(true)
    setTcFind('')
    setTcPick(new Set())
    const f0 = foldOf(q, String(d.model ?? ''))
    setTcFold(f0)
    setQFold(f0)
    setTcOpen(openFor(f0))
    sayThink('말씀과 가까운 시험 항목을 찾는 중…')
    const items = await findLike(q, d)
    unThink()
    /* 전체 목록은 오른쪽 판이 편다(목업: 2단계 · 항목) — 창을 띄우지 않는다 */
    setPane('tc')
    if (!items.length) {
      say('a', '<p class="ln">말씀과 가까운 항목을 못 찾았습니다 — 오른쪽 판에서 골라 주세요.</p>')
      return
    }
    sayTcBlock(items)
  }

  /** 대화 속 추천에서 장비를 골랐다 */
  const pickInlineDev = (id: string) => {
    const d = usable.find((x) => x.id === id)
    if (!d) return
    const nm = String(d.model || d.name || d.ip)
    setDevId(d.id)
    setTDev(nm)
    setAskModel(String(d.model ?? ''))
    if (!pins.includes('dev')) setPins((prev) => [...prev, 'dev'])
    setFlowLog((v) => [...v, { s: 1, t: `보낼 장비 ${d.ip} 확정` }])
    setFlowVals(
      [
        { k: '모델', v: String(d.model ?? '') },
        { k: '대상', v: String(d.ip ?? '') },
      ].filter((x) => x.v),
    )
    /* 선택한 카드만 남긴다(지시) — 추천 블록이 고른 카드 하나로 접힌다 */
    const st0 = devStat(d)
    pickedLine('dev', devDoneCard(nm, String(d.ip ?? ''), st0.k, st0.label))
    void stepTc(d, asked || text)
  }

  /** 대화 속 추천에서 항목을 골랐다 — 바로 3단계 */
  const pickInlineTc = (tcid: string, model: string) => {
    if (adopting) return
    {
      /* 선택한 카드만 남긴다(지시) — 이름·방식·스텝 수까지 추천 카드 그대로 */
      const hm = tcAll.find((t) => t.tcid === tcid)
      const nm2 = hm?.name || like.find((x) => x.tcid === tcid)?.name || tcid
      const man2 = /manual|수동/i.test(String(hm?.type ?? ''))
      const nStep2 = Number(hm?.steps || like.find((x) => x.tcid === tcid)?.steps || 0)
      pickedLine(
        'tc',
        tcDoneCard(tcid, nm2, `${man2 ? '수동' : '자동'}${nStep2 ? ` · ${nStep2}스텝` : ''}`),
      )
    }
    void (mode === 'basic' ? takeTc(tcid, undefined, model) : adopt(tcid))
  }

  /**
   * 질문 보기 담기 — **관리자만**.
   *
   * 첫 화면의 질문은 「무엇을 시킬 수 있나」 를 알려 주는 안내판이다. 랩마다
   * 자주 하는 시험이 다르므로 담당자가 고칠 수 있어야 한다. 담기면 서버가
   * 켜져 있는 모든 화면에 곧바로 뿌린다(WebSocket) — 남이 새로고침할 때까지
   * 기다리지 않는다.
   */
  const exSave = async (): Promise<boolean> => {
    setExSay('담는 중…')
    try {
      const r = await apiFetch('/api/ai/examples', {
        method: 'POST',
        body: JSON.stringify({ items: examples.filter((x) => x.q.trim()) }),
      })
      const b = (await r.json()) as { ok?: boolean; items?: Array<{ q: string; d?: string }>; detail?: string }
      if (!b.ok) throw new Error(b.detail || '담지 못했습니다')
      // 서버가 담은 것을 돌려주면 그것으로 맞춘다. **안 돌려주면 지금 것을
      // 그대로 둔다** — 빈 배열로 덮으면 질문이 통째로 사라진다.
      if (Array.isArray(b.items)) setExamples(b.items)
      setExSay('담았습니다')
      setTimeout(() => setExSay(''), 2000)
      return true
    } catch (e) {
      setExSay(e instanceof Error ? e.message : String(e))
      return false
    }
  }
  const exSet = (i: number, patch: { q?: string; d?: string }) =>
    setExamples((v) => v.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const exDel = (i: number) => setExamples((v) => v.filter((_, j) => j !== i))
  const exAdd = () => setExamples((v) => [...v, { q: '', d: '' }])

  /**
   * 만든 절차를 기록으로 남긴다 — 왼쪽 「최근」 이 이걸로 채워진다.
   * 저장(시험으로 남기기)과는 다르다: 이건 「무엇을 물었나」 의 기록이다.
   */
  const keepChat = async (title: string, plan: Draft, dev: string) => {
    const id = chatId || `nl-${Date.now().toString(36)}`
    if (!chatId) setChatId(id)
    /* 왼쪽 대화 목록에도 바로 올린다 — 서버를 다시 읽을 것 없이 */
    setRecent((v) => [{ cid: id, title }, ...v.filter((x) => x.cid !== id)].slice(0, 30))
    try {
      await apiFetch('/api/ai/nl-chats', {
        method: 'POST',
        body: JSON.stringify({
          id,
          title,
          plan,
          dev,
          msgs: [{ role: 'user', text: title }],
          /* 작업 흐름도 함께 — 이게 없으면 다시 열었을 때 무엇을 왜 그렇게
             정했는지가 통째로 사라진다(지적) */
          flow: flowRef.current,
          vals: valsRef.current,
          notes: notesRef.current,
        }),
      })
    } catch {
      /* 기록을 못 남겨도 절차는 쓸 수 있다 */
    }
  }

  /**
   * 빈 판정 기준을 **실제 응답으로** 채운다.
   *
   * 절차만 지으면 「무엇이 나와야 합격인가」 가 비어 있다. 사람이 그것을
   * 손으로 적으려면 장비 출력을 미리 알아야 하는데, 그걸 아는 사람이면
   * 애초에 말로 시킬 일이 없다. 그래서 **조회 명령만 미리 두 번 보내**
   * 두 번 다 같은 값만 근거로 삼아 기준을 짓는다(설정 명령은 안 보낸다 —
   * 만들기만으로 장비가 바뀌면 안 된다).
   */
  const fillCriteria = async (d: Draft, dev: Device): Promise<Draft> => {
    /*
     * **명령이 있는 스텝이 하나라도 있으면 부른다.**
     *
     * 여태는 「기준이 빈 스텝이 있을 때만」 불렀다. 그런데 가져온 항목은
     * 원본 TC 의 기준 문구를 이미 이고 오는 일이 많아, 빈 스텝이 없으면
     * LLM 도 장비 조회도 **아예 안 돌았다** — 그래서 눈 깜짝할 새 끝났다
     * (지적: 이 속도면 LLM 이 안 도는 것 아니냐. 로그로 확인했다).
     * 원본 기준은 **다른 모델에서 쓰던 말**이다. 이 장비가 실제로 무엇을
     * 내놓는지 보고 LLM 이 판단해야 맞다(지시).
     */
    const need = d.steps.some((x) => String(x.cli ?? '').trim() && x.type !== 'ok')
    if (!need) {
      setFlowAt(0)
      return d
    }
    // 절차만 나오고 기준이 비어 있으면 「만들다 만 것」 이다. 기준까지
    // 채워야 생성이 끝난 것이므로, 그때까지 5단계는 계속 돈다.
    setFlowAt(5)
    setFilling(true)
    // 무엇을 어떻게 얻어 오는지는 화면에 안 적는다(지시) — 하는 일만 말한다
    setGenSay('판정 기준을 잡는 중…')
    setFlowLog((v) => [...v, { s: 5, t: '판정 기준을 잡는 중…' }])
    /* 장비로 두 번 나갔다가 LLM 까지 거치는 길이다. 어딘가 멎으면 **영영**
       안 돌아와 화면이 「만드는 중」 에 머문다 — 어디에도 마감 시간이 없었다.
       2분이면 끊고, 기준은 비운 채로 절차를 연다(돌린 뒤 고르면 된다). */
    const ac = new AbortController()
    const bell = setTimeout(() => ac.abort(), 120_000)
    try {
      const r = await apiFetch('/api/ai/nl-criteria', {
        signal: ac.signal,
        method: 'POST',
        body: JSON.stringify({
          probe: true,
          llm: llmId,
          /* 서버는 ip 로 읽는다 — connParams 는 host 로 준다. 그대로 보내면
             「장비 정보가 없습니다」 로 조용히 되돌아온다(실제로 그랬다). */
          device: { ...connParams(dev), ip: connParams(dev).host },
          steps: d.steps.map((x, i) => ({ i, cli: x.cli, desc: x.desc, criteria: x.criteria })),
        }),
      })
      const b = (await r.json()) as {
        ok?: boolean
        error?: string
        skipped?: string
        items?: Array<{ i?: number; type?: string; criteria?: string }>
        /** 이 장비 응답에 없는 옛 기준 — 그대로 두면 반드시 불합격이다 */
        stale?: number[]
      }
      if (!b.ok || !Array.isArray(b.items)) {
        setFlowLog((v) => [
          ...v.filter((x) => !x.t.endsWith('잡는 중…')),
          {
            s: 5,
            t:
              b.skipped === 'config'
                ? '설정을 바꾸는 시험이라 기준은 비워 둡니다 — 돌린 뒤 응답에서 고르세요'
                : `판정 기준을 못 잡았습니다 — ${b.error ?? '까닭 모름'}`,
          },
        ])
        setFlowAt(0)
        setFilling(false)
        setGenSay('')
        return d
      }
      let n = 0
      let cleared = 0
      const stale = new Set(Array.isArray(b.stale) ? b.stale : [])
      const steps = d.steps.map((x, i) => {
        const hit = b.items!.find((y) => y.i === i)
        if (!hit || !String(hit.criteria ?? '').trim()) {
          /* 이 장비 응답에 없는 옛 기준은 **비운다.** 원본 TC 가 이고 온 그 랩의
             값(hostname QA_MAIN_L3 같은)을 그대로 두면 반드시 불합격이다(지적).
             돌린 뒤 응답 블럭에서 고르면 된다. */
          if (stale.has(i)) {
            cleared++
            return { ...x, type: '', criteria: '' }
          }
          return x   // LLM 이 말이 없고 옛 기준도 쓸 만하면 그대로
        }
        // ★ 이미 기준이 있어도 **LLM 이 낸 것으로 바꾼다.** 원본 것은 다른
        //   모델에서 쓰던 말이고, 이건 이 장비가 방금 내놓은 응답에서 고른
        //   것이다. 같은 말이면 셈에 안 넣는다.
        const same = String(x.criteria ?? '').trim() === String(hit.criteria).trim()
        if (!same) n++
        return { ...x, type: hit.type || 'contains', criteria: String(hit.criteria) }
      })
      setFlowLog((v) => [
        ...v.filter((x) => !x.t.endsWith('잡는 중…')),
        {
          s: 5,
          t:
            n > 0
              ? `이 장비 응답으로 판정 기준 ${n}개를 정함${cleared > 0 ? ` · 안 맞는 옛 기준 ${cleared}개는 비움` : ''}`
              : cleared > 0
                ? `이 장비에 안 맞는 옛 기준 ${cleared}개를 비웠습니다 — 돌린 뒤 응답에서 고르세요`
                : '기준으로 삼을 또렷한 값이 없었습니다',
        },
      ])
      setFlowAt(0)
      setFilling(false)
      setGenSay('')
      return { ...d, steps }
    } catch (e) {
      const cut = e instanceof Error && e.name === 'AbortError'
      setFlowLog((v) => [
        ...v.filter((x) => !x.t.endsWith('잡는 중…')),
        {
          s: 5,
          t: cut
            ? '2분이 지나 기준 잡기를 멈췄습니다 — 비운 채로 엽니다, 돌린 뒤 응답에서 고르세요'
            : `판정 기준을 못 잡았습니다 — ${e instanceof Error ? e.message : String(e)}`,
        },
      ])
      setFlowAt(0)
      setFilling(false)
      setGenSay('')
    } finally {
      clearTimeout(bell)
    }
    return d
  }

  /* 기록 열기·지우기(openChat·dropChat)는 왼쪽 「최근」 칸과 함께 걷어냈다.
     서버는 여전히 대화를 남긴다 — 목록 UI 를 다시 세울 때 git 에서 꺼낸다. */

  /** 그 TC 를 고른 장비로 옮겨 초안에 앉힌다 */
  /**
   * 「일반」 갈래 — Coverage 항목을 **그대로** 싣는다.
   *
   * 고치지 않는다. 모델 이름도 안 바꾸고, 종류를 가리지도 않는다.
   * 화면에 늘어놓는 줄만 원본에서 만들어 낸다(보여 주기용) — 돌 때는
   * 원본(`raw`)이 그대로 실행기로 간다. Coverage 에서 누르는 것과 같은 일이
   * 같은 자리에서 일어나야 한다.
   */
  /**
   * 시험 한 건을 **그대로** 읽어 온다.
   *
   * 여러 건을 고를 때도 이 길을 쓴다 — 여태 여러 건은 서버의 옮기기
   * (nl-tc-adopt)를 거쳐서 diff·수동 같은 스텝이 버려졌다(지적: 한 건은
   * 다 오는데 여러 건은 덜 온다). 원본을 통째로 싣는 길은 이것 하나다.
   */
  const loadTc = async (tcid: string): Promise<{ name: string; raw: TcStep[]; shown: DraftStep[] }> => {
    const r = await apiFetch(`/api/tc/${encodeURIComponent(tcid)}`)
    if (!r.ok) throw new Error('시험을 불러오지 못했습니다')
    const b = (await r.json()) as { name?: string; object_md?: string; checks?: TcStep[] }
    /* 수동 스텝은 가져오지 않는다(지시) — 이 화면은 장비로 보내 도는 자리라
       사람이 손으로 하는 절차는 할 일이 없다. Coverage 의 Manual 탭이 맡는다. */
    const raw = ((b.checks ?? []) as TcStep[]).filter((x) => String(x.kind ?? '') !== 'manual')
    /* 보여 주기용 줄 — **한 톨도 버리지 않는다.**
       손으로 골라 옮기다가 판정 기준·Comment 글·기대 결과 같은 것이
       빠졌다(지적). 원본을 통째로 펼치고 화면이 읽는 이름만 덧댄다. */
    const shown: DraftStep[] = raw.map((x) => {
      const o = x as unknown as Record<string, unknown>
      return {
        ...(o as object),
        desc: String(x.step ?? '').trim(),
        cli: String(x.cli ?? x.data ?? ''),
        /* Comment·Message 는 글이 `text` 에 산다 — 이걸 안 옮겨
           주석 줄이 통째로 비어 보였다 */
        text: typeof o.text === 'string' ? (o.text as string) : undefined,
        kind: typeof x.kind === 'string' ? x.kind : 'cli',
        /* Coverage 의 새 판정은 **칩**(rules)이다. 화면의 합격 기준 칸은
           옛 꼴(type·criteria)을 읽으므로 **칸에 값으로 옮겨 적는다**
           (지시) — 따로 띄우지 않는다. 「있어야」 가 여럿이면 「모두
           있으면 합격」, 「없어야」 뿐이면 「있으면 불합격」 이다. */
        ...(() => {
          const rs = (o.rules ?? []) as Array<{ t?: string; v?: string }>
          const has = rs.filter((r) => r?.t === 'has' && String(r.v ?? '').trim())
          const not = rs.filter((r) => r?.t === 'not' && String(r.v ?? '').trim())
          if (has.length)
            return {
              type: has.length > 1 ? 'contains_all' : 'contains',
              criteria: has.map((r) => String(r.v).trim()).join('\n'),
            }
          if (not.length)
            return { type: 'notcontains', criteria: not.map((r) => String(r.v).trim()).join('\n') }
          return {
            type: x.type ?? undefined,
            criteria: typeof x.criteria === 'string' ? x.criteria : undefined,
          }
        })(),
        indent: typeof x.indent === 'number' ? x.indent : undefined,
        session: typeof x.session === 'number' ? x.session : 0,
      } as DraftStep
    })
    return { name: b.name || tcid, raw, shown }
  }

  const takeTc = async (tcid: string, dev?: Device, tcModel?: string) => {
    /* 항목이 **모델을 확정한다**(지시). 그 모델의 장비가 한 대면 그대로 쓰고,
       여럿이면 그때 묻는다. 말에 모델이 있었으면 그것을 쓴다. */
    let use = dev ?? usable.find((x) => x.id === devId)
    if (!use) {
      /* 항목이 공용(모델명 빈 칸)이면 **말에서 읽은 모델**을 쓴다(지적) —
         `??` 는 빈 글자에서 안 넘어가 전체 장비가 떴다. */
      const want = String(tcModel || askModel || '').trim().toLowerCase()
      const cands = want
        ? usable.filter((d) => String(d.model ?? '').trim().toLowerCase() === want)
        : usable
      if (cands.length === 1) use = cands[0]
      else if (cands.length > 1) {
        setAfterPick({ tcid, model: String(tcModel || askModel || '') })
        setPickSel(cands.find((d) => d.id === devId)?.id ?? cands[0]?.id ?? '')
        setPickLab('')
        setPickRack('')
        setPickDev({ model: String(tcModel || askModel || ''), cands })
        setLikeAsk(false)
        return
      } else if (usable.length === 1) use = usable[0]
      else {
        setAfterPick({ tcid, model: String(tcModel || askModel || '') })
        setPickSel(usable[0]?.id ?? '')
        setPickLab('')
        setPickRack('')
        setPickDev({ model: '', cands: usable })
        setLikeAsk(false)
        return
      }
    }
    dev = use
    const t0 = performance.now()
    setAdopting(tcid)
    setErr('')
    setFlowAt(5)
    setFlowLog((v) => [...v, { s: 5, t: `${tcid} 를 여는 중…` }])
    try {
      const picked = dev ?? usable.find((x) => x.id === devId) ?? usable[0]
      const { name: tcName, raw, shown } = await loadTc(tcid)
      setFlowLog((v) => [
        ...v.filter((x) => !x.t.endsWith('를 여는 중…')),
        { s: 5, t: `${tcid} 를 그대로 실었습니다 — ${raw.length}스텝 (고치지 않음)` },
      ])
      setFitNotes([])
      setFlowVals((v) => [...v.filter((x) => x.k !== '가져온 TC'), { k: '실은 TC', v: tcid }])
      setStepAt(0)
      const d2: Draft = { name: tcName, object: tcid, steps: shown, raw }
      instantRef.current = false
      setBuilt(d2)
      setDevId(picked?.id ?? '')
      await holdMaking(t0)
      setDraft(d2)
      /* 대화에도 **아티팩트 칩**(클로드)으로 남긴다 — 오른쪽 판이 닫혔거나
         다른 단계를 보다가도 이 칩으로 Response 에 돌아온다 */
      say(
        'a',
        `<p class="ln">절차가 준비됐습니다 — 오른쪽에서 확인하고 <b>▷ 시험 시작</b>을 누르세요.</p>` +
          `<button type="button" class="ask-artchip js-openresp"><span class="ic">▤</span>` +
          `<span class="tx"><b>${hesc(tcName)} — Response</b>` +
          `<em>${raw.length}스텝 · 실행 준비</em></span></button>`,
      )
      /* 다 실었다 — 5단계를 끈다. 안 끄면 스텝이 다 나왔는데도 작업 흐름은
         「● 진행 중」 으로 남는다(지적). 기준을 채우는 길이 없는 갈래라
         여기가 끝이다. */
      setFlowAt(0)
      void keepChat(d2.name, d2, picked?.ip ?? '')
      setLike([])
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setText(asked)
      setFlowAt(0)
    } finally {
      setAdopting('')
    }
  }

  /**
   * 「Advanced」 갈래 — **새로 짓는다**(지시).
   *
   * 있는 시험을 고르는 것이 아니라 말에서 절차를 짓는 길이다. 그러니 물어볼
   * 것은 **어느 장비냐** 하나뿐이고, 시험 고르기 창은 뜨지 않는다.
   * 지은 뒤에는 가져오기와 같은 길로 판정 기준을 채운다.
   */
  const makePlan = async (say: string, dev?: Device) => {
    const t0 = performance.now()
    setBusy(true)
    setErr('')
    setFlowAt(5)
    setFlowLog((v) => [...v, { s: 5, t: '절차를 짓는 중…' }])
    try {
      const picked = dev ?? usable.find((x) => x.id === devId) ?? usable[0]
      /* 이미 지어 둔 절차가 있으면 **함께 보낸다** — 서버는 그때
         새로 짓지 않고 고쳐서 돌려준다(지시). 여태 안 보내서 물어볼
         때마다 새 시험이 나왔다. */
      const r = await apiFetch('/api/ai/nl-plan', {
        method: 'POST',
        body: JSON.stringify({
          text: say,
          model: picked?.model ?? '',
          llm: llmId,
          ...(draft
            ? { steps: draft.steps, title: draft.name, purpose: draft.object }
            : {}),
        }),
      })
      const b = (await r.json()) as {
        ok?: boolean
        error?: string
        title?: string
        purpose?: string
        steps?: DraftStep[]
        blocked?: string[]
      }
      if (!b.ok) throw new Error(b.error || '절차를 짓지 못했습니다')
      const steps = b.steps ?? []
      setFlowLog((v) => [
        ...v.filter((x) => x.t !== '절차를 짓는 중…'),
        { s: 5, t: `절차를 지었습니다 — ${steps.length}스텝` },
        ...(b.blocked?.length ? [{ s: 5, t: `뺀 명령 ${b.blocked.length}개 — ${b.blocked.join(' · ')}` }] : []),
      ])
      setFitNotes([])
      setStepAt(0)
      const d2: Draft = { name: b.title || say.slice(0, 40), object: b.purpose, steps }
      instantRef.current = false
      setBuilt(d2)
      setDevId(picked?.id ?? '')
      const done2 = picked ? await fillCriteria(d2, picked) : d2
      await holdMaking(t0)
      setDraft(done2)
      setFlowAt(0)
      void keepChat(done2.name, done2, picked?.ip ?? '')
      setLike([])
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setText(say)
      setFlowAt(0)
    } finally {
      setBusy(false)
    }
  }

  const adopt = async (tcid: string, dev?: Device) => {
    const t0 = performance.now()
    setAdopting(tcid)
    setErr('')
    setFlowAt(5)
    setFlowLog((v) => [...v, { s: 5, t: `${tcid} 를 가져오는 중…` }])
    try {
      const picked = dev ?? usable.find((x) => x.id === devId) ?? usable[0]
      const r = await apiFetch('/api/ai/nl-tc-adopt', {
        method: 'POST',
        body: JSON.stringify({ tcid, device_id: picked?.id ?? '', model: picked?.model ?? '' }),
      })
      const b = (await r.json()) as {
        ok?: boolean
        error?: string
        title?: string
        purpose?: string
        steps?: DraftStep[]
        /** 이 장비에 맞추며 무엇을 바꿨나 — 서버가 적어 준다 */
        tc?: { tcid?: string; name?: string; notes?: string[] }
      }
      if (!b.ok) throw new Error(b.error || '가져오지 못했습니다')
      setFlowLog((v) => [
        ...v.filter((x) => !x.t.endsWith('를 가져오는 중…')),
        { s: 5, t: `${tcid} 를 가져와 이 장비(${picked?.model ?? ''})로 옮김` },
      ])
      // 무엇을 이 장비에 맞춰 바꿨는지 — 서버가 적어 준 것을 그대로 보인다
      setFitNotes(Array.isArray(b.tc?.notes) ? b.tc!.notes! : [])
      setFlowVals((v) => [...v.filter((x) => x.k !== '가져온 TC'), { k: '가져온 TC', v: tcid }])
      setStepAt(0)
      const d2: Draft = { name: b.title || tcid, object: b.purpose, steps: b.steps ?? [] }
      instantRef.current = false
      setBuilt(d2)   // 레일은 지금 바로 편다 (한 줄씩 찬다)
      setDevId(picked?.id ?? '')
      /* 「일반」 갈래는 있는 시험을 그대로 도는 자리라 기준을 채우지 않는다 —
         한 건 가져올 때와 같은 길이다. */
      await holdMaking(t0)
      setDraft(d2)
      void keepChat(d2.name, d2, picked?.ip ?? '')
      setLike([])
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setText(asked)
      setFlowAt(0)
    } finally {
      setAdopting('')
    }
  }

  /**
   * 물어보다 **그만둠** — 창을 닫고 흐름도 처음으로 되돌린다.
   *
   * 여태 창만 닫아서, 아무것도 안 만들었는데 「1단계 진행 중」 과 한 일 몇 줄이
   * 그대로 남았다(지적). 적은 말은 그대로 둔다 — 고쳐서 다시 보내면 된다.
   */
  const cancelAsk = () => {
    setPickDev(null)
    /* 모델 고르는 창도 함께 닫는다(지적: 그만두기·X 를 눌러도 남았다) */
    setPickModelOpen(false)
    setAfterPick(null)
    setLikeAsk(false)
    /*
     * 이미 절차가 실려 있으면 **창만 닫는다**(지적).
     *
     * 이 되돌리기는 「물어보다 만 것」 을 치우는 자리다. 그런데 절차가 다
     * 실린 뒤에 장비를 바꾸려고 창을 열었다가 그만두면, 여태 쌓인 작업
     * 흐름(한 일·정한 값)까지 같이 지워져 판이 텅 비었다.
     */
    if (draft) return
    setText(asked)      // 비워 둔 말을 돌려준다 — 고쳐서 다시 보내는 자리다
    setLike([])
    setFlowAt(0)
    setFlowLog([])
    setFlowVals([])
    setGenSay('')
  }

  /**
   * 고른 항목 **여러 건**을 한 절차로 묶어 온다.
   *
   * 한 건씩 가져와 이어 붙이고, 사이에 그 항목 이름을 주석으로 넣는다 —
   * 안 넣으면 스텝이 뒤섞여 어디부터 어느 시험인지 알 수 없다.
   */
  const adoptMany = async (ids: string[], dev?: Device) => {
    if (ids.length === 0) return
    if (ids.length === 1 && ids[0]) return adopt(ids[0], dev)
    const t0 = performance.now()
    setAdopting(ids[0] ?? '')
    setErr('')
    setFlowAt(5)
    setFlowLog((v) => [...v, { s: 5, t: `고른 ${ids.length}건을 가져오는 중…` }])
    try {
      const picked = dev ?? usable.find((x) => x.id === devId) ?? usable[0]
      const steps: DraftStep[] = []
      const raws: TcStep[] = []
      let got = 0
      for (const tcid of ids) {
        /* 한 건 고를 때와 **같은 길**로 읽는다 — 서버의 옮기기를 거치면
           diff·수동 같은 스텝이 버려져 「한 건은 다 오는데 여러 건은 덜
           온다」 가 된다(지적). 원본을 통째로 싣는다. */
        let one: { name: string; raw: TcStep[]; shown: DraftStep[] }
        try {
          one = await loadTc(tcid)
        } catch {
          continue
        }
        if (!one.raw.length) continue
        got++
        /* 경계 줄 — 굵게 서는 것은 이름(text), 옆에 옅게 붙는 것은 번호(desc) */
        const head: DraftStep = {
          kind: 'comment',
          indent: 0,
          desc: tcid,
          text: one.name || tcid,
          cli: '',
          head: true,
        }
        steps.push(head, ...one.shown)
        raws.push({ kind: 'comment', indent: 0, step: tcid, text: one.name || tcid, head: true } as TcStep)
        raws.push(...one.raw)
      }
      if (got === 0) throw new Error('고른 항목에서 옮길 스텝이 없습니다')
      setFlowLog((v) => [
        ...v.filter((x) => !x.t.endsWith('가져오는 중…')),
        { s: 5, t: `${got}건을 그대로 실었습니다 — 스텝 ${raws.length - got}개 (고치지 않음)` },
      ])
      setFitNotes([])
      setFlowVals((v) => [...v.filter((x) => x.k !== '가져온 TC'), { k: '가져온 TC', v: `${got}건` }])
      setStepAt(0)
      const d2: Draft = { name: `고른 시험 ${got}건`, object: '', steps, raw: raws }
      instantRef.current = false
      setBuilt(d2)
      setDevId(picked?.id ?? '')
      const done2 = picked ? await fillCriteria(d2, picked) : d2
      await holdMaking(t0)
      setDraft(done2)
      void keepChat(done2.name, done2, picked?.ip ?? '')
      setLike([])
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setText(asked)
      setFlowAt(0)
    } finally {
      setAdopting('')
    }
  }

  /**
   * 적은 말에서 **Coverage 트리 자리**를 찾는다.
   *
   * 「E6100 SNMP 시험해줘」 라고만 하면 어느 SNMP 시험인지 알 수 없다(지적).
   * 트리에 그 이름의 자리가 있으면 그 자리를 펴 놓고 고르게 한다.
   * `SNMP` 가 `SNMPv2` 를 짚는 것처럼 앞부분만 걸려도 인정한다.
   */
  const foldOf = (q: string, model?: string): string => {
    const flat = (v: string) => v.toLowerCase().replace(/[^0-9a-z가-힣]+/g, '')
    const t = flat(q)
    if (!t) return ''
    const hits: Array<{ id: string; depth: number }> = []
    for (const nd of tcTree) {
      const f = flat(nd.name)
      if (f.length < 2) continue
      const hit = t.includes(f) || (f.length >= 4 && t.includes(f.slice(0, 4)))
      if (hit) hits.push({ id: nd.id, depth: nd.depth })
    }
    if (!hits.length) return ''
    /*
     * 이름이 같은 마디가 **둘 이상 있다**(Coverage 에 「시스템 정보 조회」 가
     * 두 벌 있었다). 깊은 것만 보고 고르면 빈 쪽을 짚어, 창을 열자마자
     * 「0건」 에 트리도 접힌 채로 뜬다(지적 사진).
     * 그 아래에 **볼 것이 있는** 마디를 고른다.
     */
    const want = String(model ?? '').trim().toLowerCase()
    const n = (id: string) =>
      tcAll.filter(
        (x) => x.chain.includes(id) && (!want || String(x.model ?? '').trim().toLowerCase() === want),
      ).length
    const byDeep = [...hits].sort((a, b) => b.depth - a.depth)
    return (byDeep.find((h) => n(h.id) > 0) ?? byDeep[0])?.id ?? ''
  }

  /**
   * 창을 열 때 펼 마디들 — 고른 자리까지의 조상 + **맨 위 층**.
   *
   * 조상만 펴면, 고른 자리가 없을 때 트리가 뿌리 한 줄로 접힌 채 뜬다.
   */
  const openFor = (id: string): Set<string> =>
    new Set([...openTo(id), ...tcTree.filter((n2) => n2.depth === 0).map((n2) => n2.id)])

  /** 그 마디의 조상들 — 트리를 그만큼 펴 준다 */
  const openTo = (id: string): Set<string> => {
    const up = new Map(tcTree.map((n) => [n.id, n.parent]))
    const out = new Set<string>()
    let cur = up.get(id) ?? ''
    while (cur) {
      out.add(cur)
      cur = up.get(cur) ?? ''
    }
    if (id) out.add(id)
    return out
  }

  /* 말에서 낱말을 뽑아 찾기 칸에 미리 넣던 `keyOf` 는 걷었다(지시) —
     미리 걸러 두면 그 낱말 말고는 안 보여 목록을 훑을 수가 없었다. */

  const candsOf = (q: string): { model: string; cands: Device[] } | null => {
    const t = q.toLowerCase()
    const byModel = new Map<string, Device[]>()
    for (const d of usable) {
      const m = String(d.model ?? '').trim()
      if (!m) continue
      if (!t.includes(m.toLowerCase())) continue
      byModel.set(m, [...(byModel.get(m) ?? []), d])
    }
    // 가장 길게 걸린 모델 하나만 본다 — E59 와 E5924RL 이 함께 걸리는 것을 막는다
    const best = [...byModel.entries()].sort((a, b) => b[0].length - a[0].length)[0]
    return best ? { model: best[0], cands: best[1] } : null
  }

  /**
   * 보내기 — 짓기 전에 두 가지를 먼저 묻는다.
   *
   *   ① 같은 모델이 여러 대면 **어느 장비인지** (안 물으면 엉뚱한 장비로 나간다)
   *   ② 비슷한 시험이 이미 있으면 **가져올지 새로 지을지** (있는 것을 가져오는
   *      편이 정확하다 — 이 랩에서 이미 통한 절차니까)
   */
  const submit = async (q?: string) => {
    const raw0 = (q ?? text).trim()
    if (!raw0 || busy) return
    /* 도구 줄이 켠 맥락 — 질문 끝에 싣는다. 장비를 골랐으면 모델명이
       실려서, 아래 「말에서 모델 찾기」 도 그 장비를 바로 잡는다. */
    const ctx: string[] = []
    if (tDev) ctx.push(`대상 장비: ${tDev}`)
    if (tOn.has('find')) ctx.push('있는 시험 항목에서 먼저 찾아서')
    if (tOn.has('kb')) ctx.push('매뉴얼·지식 근거를 함께 찾아서')
    if (tOn.has('hist')) ctx.push('최근 실행 결과를 참고해서')
    const said = ctx.length ? `${raw0} (${ctx.join(' · ')})` : raw0
    // 보낸 말은 그 자리에서 비운다 — 만드는 동안 입력칸에 남아 있으면 아직
    // 안 보낸 것처럼 보인다(지적). 그만두거나 어긋나면 되돌려 놓는다.
    setText('')
    setAsked(said)
    /* 물어본 말은 **오른쪽 말풍선**으로 남는다(지시: 목업) — 한 줄짜리 머리글로만
       남기면 여러 번 되물으며 좁혀 갈 때 앞에 무엇을 물었는지 사라진다. */
    say('u', raw0)
    setFlowLog([{ s: 1, t: `요청의 말을 읽었습니다 — "${said.slice(0, 40)}"` }])
    setFlowVals([])
    setFitNotes([])
    setFlowAt(1)
    /* General 은 **항목부터** 고른다(지시). 장비는 항목이 모델을 정한 뒤에
       묻는다 — 말에 모델이 있으면 그 모델 것만, 없으면 전체를 보여 준다. */
    if (mode === 'basic' && !draft) {
      /* 장비를 먼저 고른다(지시 사진) — 고른 장비가 **모델을 정하고**,
         그 모델의 시험 항목만 이어서 보여 준다. */
      const known = [
        ...new Set([
          ...usable.map((d) => String(d.model ?? '').trim()),
          ...tcAll.map((t) => String(t.model ?? '').trim()),
        ]),
      ].filter(Boolean)
      const low = said.toLowerCase()
      const inText = known
        .filter((m) => low.includes(m.toLowerCase()))
        .sort((a2, b2) => b2.length - a2.length)[0]
      const hit0 = candsOf(said)
      const m0 = hit0?.model ?? inText ?? ''
      setAskModel(m0)
      const cands = m0
        ? usable.filter((d) => String(d.model ?? '').trim().toLowerCase() === m0.toLowerCase())
        : usable
      if (cands.length === 0) {
        setErr('쓸 수 있는 장비가 없습니다 — Devices 에서 먼저 등록해 주세요')
        setFlowAt(0)
        return
      }
      if (cands.length === 1 && cands[0]) {
        const d0 = cands[0]
        setDevId(d0.id)
        setAskModel(String(d0.model ?? m0))
        setFlowLog((v) => [
          ...v,
          { s: 1, t: `보낼 장비 ${d0.ip} 확정 (한 대뿐)` },
        ])
        say(
          'a',
          `<p class="ln"><b>${hesc(String(d0.model || d0.name || ''))} (${hesc(String(d0.ip ?? ''))})</b> 로 정했습니다 — 쓸 수 있는 장비가 한 대뿐입니다.</p>`,
        )
        setFlowVals([
          { k: '모델', v: String(d0.model ?? '') },
          { k: '대상', v: d0.ip },
        ])
        await stepTc(d0, said)
        return
      }
      setFlowLog((v) => [
        ...v,
        { s: 1, t: m0 ? `${m0} 이(가) ${cands.length}대 — 어느 장비로 할지 고릅니다` : '어느 장비로 할지 고릅니다' },
      ])
      /* 창을 먼저 띄우지 않는다(승인: 단순안) — 추천 한 장과 후보 몇 줄이면
         대부분 끝난다. 점유를 새로 읽는 동안 스피너가 돈다(지시). */
      afterDevRef.current = 'tc'
      sayThink('쓸 수 있는 장비를 찾는 중…')
      try {
        await lockQ.refetch()
      } catch {
        /* 점유를 못 읽어도 장비는 보여 준다 */
      }
      unThink()
      sayDevBlock(cands, m0)
      return
    }

    /* 이미 절차가 있으면 **고치는 말**이다(지시) — 장비를 다시 묻거나
       시험을 새로 고르지 않고 지금 절차를 고친다.
       다만 「일반」 갈래는 있는 시험을 그대로 도는 자리라 고치지 않는다 —
       거기서 적은 말은 **다시 찾는 말**이다(지시). */
    if (draft && mode !== 'basic') {
      setFlowLog((v) => [...v, { s: 5, t: '지금 절차를 고치는 중…' }])
      void makePlan(said, usable.find((x) => x.id === devId))
      return
    }
    const hit = candsOf(said)
    const askPick = (model: string, cands: Device[], why: string) => {
      setFlowLog((v) => [...v, { s: 1, t: why }])
      // 쓰던 장비를 미리 짚어 둔다 — 그대로 갈 사람은 한 번만 누르면 된다
      setPickSel(cands.find((d) => d.id === devId)?.id ?? cands[0]?.id ?? '')
      setPickLab('')
      setPickRack('')
      setPickDev({ model, cands })
    }
    /*
     * 새 질문이면 **늘 묻는다.**
     *
     * 여태는 「이미 그 모델 장비를 고른 상태」 면 창을 건너뛰었다. 그래서 한 번
     * 고르고 나면 그 뒤 질문에서는 장비를 바꿀 길이 없었다 — 그만두고 다시
     * 물어도 창이 안 떴다(지적). 같은 모델이 3대인데 어느 대인지는 시험마다
     * 다르다. 쓰던 장비를 미리 짚어 두었으니 그대로 갈 때도 한 번만 누르면 된다.
     */
    if (hit && hit.cands.length > 1) {
      askPick(hit.model, hit.cands, `요청의 ${hit.model} 이(가) ${hit.cands.length}대`)
      return
    }
    let dev: Device | undefined
    if (hit && hit.cands.length === 1 && hit.cands[0]) {
      dev = hit.cands[0]
      setDevId(hit.cands[0].id)
      setFlowLog((v) => [...v, { s: 1, t: `보낼 장비 ${hit.cands[0]!.ip} 확정 (한 대뿐)` }])
      setFlowVals([
        { k: '모델', v: hit.model },
        { k: '대상', v: hit.cands[0]!.ip },
      ])
    }
    /*
     * 말에 모델 이름이 없을 때 — **그래도 물어본다.**
     *
     * 여태 이때는 창을 안 띄우고 장비 없이 만들었다. 그러면 어디로 보낼지
     * 모르는 절차가 나오고, 조회를 미리 못 보내니 판정 기준도 통째로
     * 비었다(지적). 어느 장비인지는 사람만 안다 — 전체에서 고르게 한다.
     */
    if (!hit) {
      if (usable.length === 0) {
        setErr('쓸 수 있는 장비가 없습니다 — Devices 에서 먼저 등록해 주세요')
        setFlowAt(0)
        return
      }
      if (usable.length === 1 && usable[0]) {
        dev = usable[0]
        setDevId(usable[0].id)
        setFlowLog((v) => [...v, { s: 1, t: `보낼 장비 ${usable[0]!.ip} 확정 (한 대뿐)` }])
        setFlowVals([{ k: '대상', v: usable[0]!.ip }])
      } else {
        askPick('', usable, '어느 장비로 할지 말에 없어 물어봅니다')
        return
      }
    }
    // 말과 비슷한 항목을 위에 올려 주려고 미리 찾아 둔다. 없어도 창은 뜬다 —
    // 없는 항목을 지어내지 않고 **Coverage 항목에서만** 고른다(지시).
    /* Advanced — 고르는 갈래가 아니다. 장비만 정해지면 바로 짓는다(지시) */
    if (mode === 'adv') {
      void makePlan(said, dev)
      return
    }
    await findLike(said, dev)
    setTcOnlyModel(true)
    setTcFind('')
    setTcPick(new Set())
    const fold = foldOf(said, askModel || curDev?.model || '')
    setTcFold(fold)
    setQFold(fold)
    setTcOpen(openFor(fold))
    if (fold)
      setFlowLog((v) => [
        ...v,
        { s: 1, t: `Coverage 트리의 「${tcTree.find((n) => n.id === fold)?.name ?? ''}」 를 폄` },
      ])
    setLikeAsk(true)
  }


  /**
   * 만든 시험을 그 자리에서 돌린다.
   *
   * TC 화면·플랜과 같은 실행기(`runSteps`)를 쓴다. 판정 규칙이 한 곳에만
   * 있어야 여기서 적합인 것이 저기서 부적합이 되지 않는다.
   *
   * 저장하지 않고 돌린다 — 말로 시켜 본 것이 다 시험으로 남으면 목록이
   * 금세 쓰레기가 된다. 쓸 만하면 그때 저장한다.
   */
  /** 목록에 그릴 스텝 — 돌린 뒤에는 결과가 담긴 것을 쓴다 */
  const seqSteps: TcStep[] = ran?.length ? ran : draft ? toTcSteps(draft) : []
  /* 표가 매긴 스텝 번호 — 상태 띠와 로그가 **같은 번호**를 적어야 한다.
     따로 세면 「스텝 5」 를 눌러 놓고 표에서는 1.1 을 찾게 된다(지적). */
  const stripNos = stepNumbers(seqSteps, (x) => x.kind === 'manual')
  /* Response 판(사이클 자동 실행과 한 몸)이 읽는 꼴로 옮긴다. 아직 이 화면에서
     안 돌렸으면 결과 쪽은 비운다 — Coverage 에 남은 지난 실행의 자취(status·
     output)가 이번 것처럼 보이면 안 된다(RunDetail 과 같은 규칙). */
  const autoSteps = seqSteps.map((x, i) => {
    const a = asStep(x as unknown as Record<string, unknown>, i)
    return ran?.length
      ? a
      : {
          ...a,
          out: '',
          mark: undefined,
          took: undefined,
          tookMs: undefined,
          at: undefined,
          ran: false,
          rounds: undefined,
          reason: undefined,
        }
  })

  /** ＋ 스텝 — 초안 끝에 한 줄 붙인다 */
  const addStep = (k: StepKind) => {
    if (!draft) return
    const kind = String(k)
    const one: DraftStep = {
      desc: '',
      cli: '',
      kind,
      ...(kind === 'comment' || kind === 'message' ? { text: '' } : {}),
      type: 'ok',
    }
    const next = { ...draft, steps: [...draft.steps, one], raw: undefined }
    setDraft(next)
    setBuilt(next)
    setStepAt(next.steps.length - 1)
  }

  /** `only` 는 그 줄 하나만, `from` 은 그 줄부터 끝까지(지시) */
  const run = async (only?: number, from?: number, to?: number) => {
    if (!draft || !devId) return
    const ac = new AbortController()
    abortRef.current = ac
    // 초안의 갈래를 그대로 살린다 — 뭉개면 되풀이·조건·계측기가 사라진다.
    // 판정기준은 **칩**으로 넣는다(우리 판정 체계) — 옛 type/criteria 도 함께
    // 남겨 두어 옛 화면에서 열어도 읽힌다.
    /* 「일반」 갈래는 원본을 그대로 넘긴다 — 옮겨 적는 순간 무언가 빠진다 */
    const steps: TcStep[] = toTcSteps(draft)
    setRan(steps.slice())
    /* 새로 돌리면 앞 판 로그는 지운다 — 섞이면 어느 실행의 응답인지 모른다 */
    setLogs([])
    logN.current = 0
    setRunning(true)
    setRunView(true)
    setAt(-1)
    try {
      await runSteps(
        {
          steps,
          sessions: [devId],
          devById: new Map(devices.map((d) => [d.id, d])),
          onStep: (i, patch) => {
            const cur = steps[i]
            if (!cur) return
            steps[i] = { ...cur, ...patch }
            setRan(steps.slice())
          },
          onAt: setAt,
          onLog: (l) => {
            const at = new Date()
            setLogs((prev) => {
              const line: LogLine = {
                n: ++logN.current,
                i: l.i,
                kind: l.kind,
                label: l.label,
                text: l.text,
                round: l.round,
                tick: l.tick,
                /* 날짜까지 적는다 — 시·분·초만 두면 어제 것인지 방금 것인지
                   갈리지 않는다(Coverage 와 같은 꼴) */
                at: `${String(at.getFullYear()).slice(2)}/${String(at.getMonth() + 1).padStart(2, '0')}/${String(at.getDate()).padStart(2, '0')} ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}:${String(at.getSeconds()).padStart(2, '0')}`,
              }
              /* 제자리에서 갱신되는 줄(Wait 의 남은 시간)은 **맨 끝일 때만**
                 갈아 끼운다 — 로그 전체를 뒤지면 지난 실행의 대기 줄을 찾아
                 덮어써서 로그가 뒤섞인다 */
              const last = prev.length - 1
              if (l.tick && last >= 0 && prev[last]!.tick === l.tick) {
                const cp = prev.slice()
                cp[last] = { ...line, n: prev[last]!.n }
                return cp
              }
              /* 폭주 막이 — 100회 반복이면 수천 줄이 된다 */
              const next = [...prev, line]
              return next.length > 4000 ? next.slice(next.length - 4000) : next
            })
          },
          signal: ac.signal,
        },
        typeof only === 'number' ? only : typeof from === 'number' ? from : 0,
        typeof only === 'number',
        to,
      )
    } finally {
      setRunning(false)
      setAt(-1)
    }
  }

  /* 「시험으로 저장」 은 걷었다(지시) — 결과는 PDF·PPTX 로 남긴다.
     되살릴 일이 생기면 git 에서 save() 를 꺼낸다. */

  /**
   * Coverage 의 「스텝 상세」 가 주는 값(TcStep) 을 초안에 되돌린다.
   *
   * 이 화면의 초안은 두 벌이다 — 사람이 읽는 DraftStep 과, 실행기로 가는
   * 원본(raw). 세부 판은 원본 벌로 말하므로 이름이 다른 칸만 여기서 맞춘다.
   */
  const fromTc = (p: Partial<TcStep>): Partial<DraftStep> => {
    const o: Partial<DraftStep> = {}
    if (p.step !== undefined) o.desc = p.step
    if (p.cli !== undefined) o.cli = p.cli
    if (p.type !== undefined) o.type = p.type
    if (p.criteria !== undefined) o.criteria = p.criteria
    /* 요즘 판정은 **칩**이다 — 「있어야」 칩만 옛 글자 칸으로 되돌린다 */
    if (p.rules !== undefined)
      o.criteria = (p.rules ?? []).filter((r) => r.t === 'has').map((r) => r.v).join('\n')
    if (p.oid !== undefined) o.oid = p.oid
    if (p.host !== undefined) o.host = p.host
    if (p.cmpLeft !== undefined) o.cmpLeft = p.cmpLeft
    if (p.cmpRight !== undefined) o.cmpRight = p.cmpRight
    if (p.cmpOp !== undefined) o.cmpOp = p.cmpOp
    if (p.skip !== undefined) o.skip = p.skip
    if (p.indent !== undefined) o.indent = p.indent
    if (p.session !== undefined) o.session = Number(p.session) || 0
    return o
  }

  /** 세부 판에서 고친 한 줄 — 초안·원본·결과 세 벌에 함께 얹는다 */
  const setTcStep = (i: number, p: Partial<TcStep>) => {
    setRan((v) => (v?.length ? v.map((x, j) => (j === i ? { ...x, ...p } : x)) : v))
    setDraft((d) => {
      if (!d) return d
      const steps = d.steps.map((x, j) => (j === i ? { ...x, ...fromTc(p) } : x))
      if (!d.raw?.length) return { ...d, steps }
      return { ...d, steps, raw: d.raw.map((x, j) => (j === i ? { ...x, ...p } : x)) }
    })
  }

  /** 줄 차례 바꾸기 — 지울 때도 늘릴 때도 이 한 곳으로 (세 벌이 어긋나지 않게) */
  const orderSteps = (idx: number[], sel: number) => {
    const take = <T,>(arr: T[]) => idx.map((j) => arr[j]).filter((x): x is T => x !== undefined)
    setRan((v) => (v?.length ? take(v) : v))
    setDraft((d) => {
      if (!d) return d
      const steps = take(d.steps)
      if (!d.raw?.length) return { ...d, steps }
      return { ...d, steps, raw: take(d.raw) }
    })
    setStepAt(Math.max(0, sel))
  }
  const nSteps = () => draft?.steps.length ?? 0
  const removeTcStep = (i: number) =>
    orderSteps(
      [...Array(nSteps()).keys()].filter((j) => j !== i),
      Math.min(i, nSteps() - 2),
    )
  const moveTcStep = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= nSteps()) return
    const idx = [...Array(nSteps()).keys()]
    idx[i] = j
    idx[j] = i
    orderSteps(idx, j)
  }
  const dupTcStep = (i: number) =>
    orderSteps([...Array(nSteps()).keys()].flatMap((j) => (j === i ? [j, j] : [j])), i + 1)

  /** 명령어 캡쳐가 담아 준 한 줄 — 끝에 붙인다 */
  const addTcStep = (t: TcStep) => {
    setRan((v) => (v?.length ? [...v, t] : v))
    setDraft((d) => {
      if (!d) return d
      const steps = [...d.steps, { desc: t.step ?? '', cli: t.cli ?? '', kind: String(t.kind || 'cli'), type: t.type || 'ok', criteria: t.criteria ?? '' } as DraftStep]
      if (!d.raw?.length) return { ...d, steps }
      return { ...d, steps, raw: [...d.raw, t] }
    })
    setStepAt(nSteps())
  }

  /* 절차 짓기는 한 번의 부름이라 서버가 중간을 알려 주지 않는다. 대신
     **실제로 하는 일의 차례**를 그대로 적어 준다 — 학습된 절차를 읽고,
     장비 인터페이스를 맞추고, 이 랩에서 통한 명령을 찾고, 절차를 짓고,
     판정 기준을 잡는다(nl_test.py 의 차례 그대로). */
  useEffect(() => {
    // 채우는 동안의 문구는 fillCriteria 가 쥔다. 이 걸개가 없으면 돌던
    // 타이머가 「판정 기준을 잡는 중」 을 덮어써 문구가 **거꾸로 간다**
    // (읽는 중 → 기준 잡는 중 → 다시 명령 찾는 중).
    if (filling) return
    if (!busy && !adopting) return
    const says = ['고른 항목을 읽는 중…', '이 장비의 포트 이름에 맞추는 중…', '값을 비우고 옮기는 중…']
    let i = 0
    setGenSay(says[0] ?? '')
    const t = setInterval(() => {
      i = Math.min(i + 1, says.length - 1)
      setGenSay(says[i] ?? '')
    }, 1800)
    return () => clearInterval(t)
  }, [busy, adopting, filling])


  /* 장비 고르는 창을 열 때마다 찾기를 비운다 — 지난 글자가 남으면
     열자마자 「없습니다」 가 뜬다 */
  useEffect(() => {
    if (pickDev) setPickFind('')
  }, [pickDev])

  /* 이 시험이 Coverage 트리의 어디에 있나 — 머리줄이 그 길을 그린다(지시) */
  const pathQ = useQuery({
    queryKey: ['tc-path', tcOf(draft)],
    enabled: !!tcOf(draft),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const r = await apiFetch(`/api/tc/${encodeURIComponent(tcOf(draft))}/path`)
      if (!r.ok) throw new Error('트리 자리를 불러오지 못했습니다')
      return (await r.json()) as {
        tcid: string
        name?: string
        cats?: Array<{ id: string; name: string }>
        req?: { id: string; reqid?: string; title?: string } | null
      }
    },
  })

  /* 5단계가 펼 것. 캔버스보다 앞서 지어진 절차(built)를 레일은 먼저 편다 */
  const plan5 = draft ?? built
  /* 절차가 **다 만들어졌나** — 기준까지 채워 캔버스에 열린 것만 완성이다.
     만드는 중에는 굳은 사실 줄까지만 펴고, 「만든 스텝」 은 다 되고 나서
     내놓는다. 먼저 내놓으면 아직 만들고 있는데 다 된 것처럼 보인다(지적). */
  const done5 = !!draft
  /* 굳은 사실 몇 줄 — 아래 셈틀이 이 차례대로 한 줄씩 내놓는다 */
  const notes5: string[] = []
  if (plan5) {
    /* 서버도 「값을 비운 합격 기준 N개」 를 적어 주는데, 그건 가져올 때의
       옛 셈이다. 채운 뒤에도 그대로 남아 아래 지금 셈과 두 줄이 되어 서로
       다른 수를 말한다(지적 사진) — 지금 셈만 둔다. */
    notes5.push(...fitNotes.filter((n) => !n.startsWith('값을 비운 합격 기준')))
    /* ★ 이 줄은 **결론**이라 다 채운 뒤에만 센다. 채우는 중에 세면 「값을
       비운 기준 2개」 라고 ✔ 로 못 박아 놓고, 다 되면 2개가 다 차서 그 줄이
       사라진다 — 하지도 않은 말을 한 셈이 된다(지적 사진 두 장). */
    if (done5) {
      const blank = plan5.steps.filter((x) => !(x.criteria ?? '').trim() && x.type !== 'ok').length
      if (blank > 0) notes5.push(`값을 비운 합격 기준 ${blank}개 — 돌린 뒤 응답에서 고르세요`)
    }
  }
  const revTotal = plan5 ? notes5.length + (done5 ? plan5.steps.length : 0) : 0

  /** 만드는 중인가 — 짓기(busy)든 가져오기(adopting)든 */
  const making = busy || !!adopting

  /**
   * 한 줄씩 차오르기.
   *
   * 서버는 절차를 한 덩어리로 준다. 그대로 그리면 다 만든 뒤에 **한꺼번에**
   * 튀어나와, 무엇이 어떤 차례로 정해졌는지 알 수 없다(지적). 굳은 사실
   * 한 줄 · 스텝 한 줄씩 차례로 내놓아 눈이 따라갈 수 있게 한다.
   */
  /**
   * 이번 절차를 **한 번에 펼 것인가**.
   *
   * 차오르는 것은 「지금 만들어지고 있다」 를 보이려는 것이다. 이미 끝난
   * 기록을 열 때까지 그러면 다 나온 것을 다시 그리는 헛일이다(지적).
   * 담아 둔 것을 열 때만 켠다.
   */
  const instantRef = useRef(false)

  /**
   * 만드는 자리를 **적어도 이만큼은** 보인다.
   *
   * 판정 기준까지 다 채우면 몇 초가 걸리지만, 기준이 이미 차 있으면 눈
   * 깜짝할 새 끝나 화면이 툭 바뀐다 — 무슨 일이 있었는지 안 보인다(지적).
   * 일이 먼저 끝나면 남은 만큼만 기다렸다 내놓는다. 일부러 늦추는 것이
   * 아니라 **덜 깜빡이게** 하는 것이다.
   */
  const MIN_MAKE_MS = 900
  const holdMaking = async (t0: number) => {
    const rest = MIN_MAKE_MS - (performance.now() - t0)
    if (rest > 0) await new Promise((r) => setTimeout(r, rest))
  }

  /** 만들기 시작하고 몇 초 — 오래 걸리는 것과 멎은 것은 다르다 */
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!making) return
    setElapsed(0)
    const t = setInterval(() => setElapsed((v) => v + 1), 1000)
    return () => clearInterval(t)
  }, [making])

  const [rev, setRev] = useState(0)
  useEffect(() => {
    // 새로 지을 때만 처음부터 — 기록을 연 것이면 통째로 편다
    setRev(instantRef.current ? Number.MAX_SAFE_INTEGER : 0)
  }, [built])
  useEffect(() => {
    if (rev >= revTotal) return
    const t = setTimeout(() => setRev((r) => r + 1), 90)
    return () => clearTimeout(t)
  }, [rev, revTotal])

  const curDev = usable.find((d) => d.id === devId)
  const devName = curDev?.name || curDev?.model || '장비'
  const devIp = curDev?.ip ?? ''

  /** 새 대화 — 처음으로와 같은 청소에 대화 번호까지 비운다.
      고른 장비도 비운다(지적: 새 채팅인데 지난 대화의 장비가 남는다) —
      장비는 대화가 정하는 값이지 계정 설정이 아니다. */
  const newChat = () => {
    setDevId('')
    setTDev('')
    setAskModel('')
    setDraft(null)
    setBuilt(null)
    setRan(null)
    setAsked('')
    setErr('')
    setFlowLogRaw([])
    setFlowVals([])
    setFlowAt(0)
    setFitNotes([])
    setPicked(new Set())
    setLike([])
    setText('')
    setMsgs([])
    setPane('')
    setRunView(false)
    setLogs([])
    setStepAt(0)
    setFoldGrp(new Set())
    setChatId('')
  }

  /**
   * 기록 하나 열기 — **다시 만들지 않는다**(옛 지적: 눌렀더니 만들기 창이
   * 떴다). 담아 둔 절차를 그대로 펴고, 그때 쓰던 장비도 되살린다.
   */
  const openChat = async (cid: string, title: string) => {
    setErr('')
    try {
      const r = await apiFetch(`/api/ai/nl-chats/${encodeURIComponent(cid)}`)
      const b = (await r.json()) as {
        ok?: boolean
        error?: string
        chat?: {
          title?: string
          plan?: Draft
          dev?: string
          at?: string
          flow?: Array<{ s?: number; t?: string }>
          vals?: Array<{ k?: string; v?: string }>
          notes?: string[]
        }
      }
      const plan = b.chat?.plan
      if (!b.ok) {
        setText(title)
        setErr(b.error || '기록을 읽지 못했습니다')
        return
      }
      if (!plan || !Array.isArray(plan.steps) || plan.steps.length === 0) {
        // 절차가 안 담긴 옛 기록이면 그 말을 입력칸에 올려 준다 — 마음대로
        // 다시 만들지는 않는다
        setText(title)
        setErr('이 기록에는 절차가 담겨 있지 않습니다 — 아래에서 다시 물어보세요')
        return
      }
      const dv = usable.find((d) => d.ip === String(b.chat?.dev ?? ''))
      if (dv) setDevId(dv.id)
      setChatId(cid)
      setText('')
      setAsked(String(plan.name ?? ''))
      setLike([])
      setLikeAsk(false)
      setRan(null)
      setLogs([])
      setStepAt(0)
      setFlowAt(0)
      setPane('')
      /* 대화 기둥에도 그 대화를 되살린다 — 물어본 말 한 줄과 연 흔적 */
      setMsgs([
        { who: 'u', html: hesc(title) },
        {
          who: 'a',
          html: `<p class="ln">기록을 열었습니다 — <b>${hesc(String(plan.name ?? ''))}</b> · ${plan.steps.length}스텝${
            b.chat?.at ? ` · ${hesc(String(b.chat.at).slice(0, 16))}` : ''
          }</p>`,
        },
      ])
      const keptFlow = (b.chat?.flow ?? [])
        .filter((x) => String(x?.t ?? '').trim())
        .map((x) => ({ s: Number(x.s) || 1, t: String(x.t) }))
      const keptVals = (b.chat?.vals ?? [])
        .filter((x) => String(x?.k ?? '').trim())
        .map((x) => ({ k: String(x.k), v: String(x.v ?? '') }))
      setFitNotes(Array.isArray(b.chat?.notes) ? b.chat!.notes! : [])
      setFlowVals(keptVals.length > 0 ? keptVals : dv ? [{ k: '대상', v: dv.ip }] : [])
      setFlowLog(
        keptFlow.length > 0
          ? [
              ...keptFlow,
              { s: 5, t: `기록을 열었습니다 — ${b.chat?.at ? String(b.chat.at).slice(0, 16) : ''}` },
            ]
          : [
              { s: 1, t: dv ? `그때 쓰던 장비 ${dv.ip} 로 되살림` : '담아 둔 절차를 그대로 폄' },
              { s: 5, t: `기록을 열었습니다 — ${b.chat?.at ? String(b.chat.at).slice(0, 16) : ''}` },
            ],
      )
      instantRef.current = true
      setBuilt(plan)
      setDraft(plan)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  /** 기록 하나 지우기 — 내 것만 지워진다(서버가 막는다) */
  const dropChat = async (cid: string) => {
    setRecent((v) => v.filter((x) => x.cid !== cid))
    // 보고 있던 그 기록을 지웠으면 화면도 치운다 — 목록에서만 빼면 지운
    // 시험의 절차·스텝이 그대로 남는다(옛 지적)
    if (cid === chatId) newChat()
    try {
      await apiFetch(`/api/ai/nl-chats/${encodeURIComponent(cid)}`, { method: 'DELETE' })
    } catch {
      /* 못 지워도 목록에서는 빠진다 — 다음에 다시 읽으면 돌아온다 */
    }
  }

  /** 콘솔 모드(목업) — 대화가 시작되면 왼쪽 대화 기둥 + 오른쪽 자세히 보기 판 */
  const twoPane = msgs.length > 0 || !!draft || making

  /* 진행 플로우는 걷었다(지시) */

  /** 결과서 HTML — PDF 저장이 쓴다(서버 /api/wiki/pdf 가 PDF 로 바꿔 준다) */
  const reportHtml = () => {
    const passN = autoSteps.filter((s) => /pass/i.test(String(s.mark ?? ''))).length
    const failN = autoSteps.filter((s) => /fail/i.test(String(s.mark ?? ''))).length
    const at = new Date().toLocaleString('ko-KR')
    const body = autoSteps
      .map((s) => {
        const quiet = s.kind === 'comment' || s.kind === 'message'
        const mark = String(s.mark ?? '')
        const mk = mark
          ? `<b class="${/pass/i.test(mark) ? 'ok' : 'bad'}">${/pass/i.test(mark) ? 'PASS' : 'FAIL'}</b>`
          : quiet
            ? ''
            : '<span class="k">판정 없음</span>'
        const head = `<div class="sh"><span>${quiet ? '주석' : `Step ${s.no}`}</span><span class="cmd">${hesc(
          s.cmd || s.t || '',
        )}</span><span class="sp"></span>${mk}</div>`
        if (quiet) return `<div class="st">${head}</div>`
        const why =
          (s.expected && s.expected !== '—' ? `<div><span class="k">판정 기준</span> ${hesc(s.expected)}</div>` : '') +
          (s.reason ? `<div><span class="k">RCA</span> ${hesc(String(s.reason))}</div>` : '')
        const out = s.out ? `<pre>${hesc(String(s.out).slice(0, 4000))}</pre>` : ''
        return `<div class="st">${head}${why || out ? `<div class="sb">${why}${out}</div>` : ''}</div>`
      })
      .join('')
    return (
      `<style>body{font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;font-size:12px;color:#222;margin:24px}` +
      `h1{font-size:18px;margin:0 0 4px}.meta{color:#666;margin:0 0 14px}` +
      `.st{border:1px solid #ddd;border-radius:6px;margin:0 0 10px;page-break-inside:avoid}` +
      `.sh{display:flex;gap:10px;align-items:center;padding:6px 10px;background:#f5f5f2;border-bottom:1px solid #ddd;font-weight:700}` +
      `.sh .cmd{font-family:Consolas,monospace;font-weight:400}.sh .sp{flex:1}` +
      `.ok{color:#12643a}.bad{color:#b3372c}.k{color:#888;font-weight:400}` +
      `.sb{padding:8px 10px;line-height:1.6}` +
      `pre{white-space:pre-wrap;word-break:break-all;background:#fafaf7;border:1px solid #eee;padding:6px 8px;border-radius:4px;font-family:Consolas,monospace;font-size:11px;margin:6px 0 0}</style>` +
      `<h1>${hesc(draft?.name || draft?.object || '시험')} — 결과서</h1>` +
      `<p class="meta">${hesc(draft?.object || '')} · 장비 ${hesc(devName)} · ${hesc(devIp)} · ${hesc(at)}` +
      ` · <b class="ok">PASS ${passN}</b> / <b class="bad">FAIL ${failN}</b></p>` +
      body
    )
  }

  /** 받은 파일을 내려받는다 — PDF(base64)·PPTX(blob) 공용 */
  const downBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  }

  /** PDF 저장(지시) — 결과서 HTML 을 서버가 PDF 로 바꿔 준다 */
  const savePdf = async () => {
    setErr('')
    try {
      const r = await apiFetch('/api/wiki/pdf', {
        method: 'POST',
        body: JSON.stringify({
          html: reportHtml(),
          title: `${draft?.object || draft?.name || '시험'}_결과서`,
        }),
      })
      const j = (await r.json()) as { ok?: boolean; name?: string; data?: string; error?: string }
      if (!j.ok || !j.data) throw new Error(j.error || 'PDF 를 만들지 못했습니다')
      const bin = atob(j.data)
      const buf = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
      downBlob(new Blob([buf], { type: 'application/pdf' }), j.name || '결과서.pdf')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'PDF 저장에 실패했습니다')
    }
  }

  /** PPTX 에 실을 내용 한 벌 — 저장과 미리보기가 같은 것을 본다 */
  const pptxParts = () => {
    const runnable = autoSteps.filter((s) => s.kind !== 'comment' && s.kind !== 'message')
    const resultText = runnable
      .map(
        (s) =>
          `[Step ${s.no}] ${s.cmd || s.t || ''}` +
          (s.mark ? `  → ${s.mark}` : '') +
          (s.reason ? `\n${String(s.reason)}` : '') +
          (s.out ? `\n${String(s.out).slice(0, 700)}` : ''),
      )
      .join('\n\n')
    const method = (draft?.steps ?? []).map((x, i) => `${i + 1}. ${x.desc || x.cli || ''}`).join('\n')
    return { resultText, method }
  }

  /** PPTX 미리보기 HTML — 양식에 채워질 내용을 쪽 꼴로 보여 준다 */
  const pptxPrevHtml = () => {
    const { resultText, method } = pptxParts()
    return (
      `<style>body{margin:0;background:#e8e6dc;font-family:'Malgun Gothic',sans-serif;font-size:12px;color:#222}` +
      `.pg{width:860px;min-height:460px;background:#fff;margin:16px auto;box-shadow:0 4px 14px rgb(0 0 0/12%);padding:26px;box-sizing:border-box}` +
      `h3{margin:0 0 10px;font-size:14px}` +
      `table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:6px 8px;text-align:left;vertical-align:top}` +
      `th{background:#f0efe8;width:110px;white-space:nowrap}` +
      `pre{white-space:pre-wrap;word-break:break-all;font-family:Consolas,monospace;font-size:11px;margin:0}</style>` +
      `<div class="pg"><h3>시험 결과서 — 첫 장</h3><table>` +
      `<tr><th>TC ID</th><td>${hesc(draft?.object || '')}</td><th>시험 항목</th><td>${hesc(draft?.name || '')}</td></tr>` +
      `<tr><th>시험 방법</th><td colspan="3"><pre>${hesc(method)}</pre></td></tr>` +
      `<tr><th>시험 결과</th><td colspan="3">뒷면 참조</td></tr>` +
      `<tr><th>비고</th><td colspan="3">${hesc(devName)} · ${hesc(devIp)}</td></tr>` +
      `</table></div>` +
      `<div class="pg"><h3>시험 결과 — 이어지는 장</h3><pre>${hesc(resultText || '(아직 돌리지 않았습니다)')}</pre></div>`
    )
  }

  /** PPTX 저장(지시) — 고객사 양식(/api/pptx-render)에 값을 채워 받는다 */
  const savePptx = async () => {
    if (!draft) return
    setErr('')
    try {
      const { resultText, method } = pptxParts()
      const vals = {
        tc_id: draft.object || '',
        req_id: '',
        tc_name: draft.name || '',
      }
      const r = await apiFetch('/api/pptx-render', {
        method: 'POST',
        body: JSON.stringify({
          template: 'lguplus',
          name: `${draft.object || draft.name || '시험'}_결과서`,
          slides: [
            {
              kind: 'first',
              values: {
                ...vals,
                spec: '',
                method,
                result_head: '뒷면 참조',
                note: `${devName} · ${devIp}`,
              },
            },
            { kind: 'more', values: { ...vals, result: resultText.slice(0, 6000), note: '' } },
          ],
        }),
      })
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as { detail?: string } | null
        throw new Error(j?.detail || 'PPTX 를 만들지 못했습니다')
      }
      downBlob(await r.blob(), `${draft.object || draft.name || '시험'}_결과서.pptx`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'PPTX 저장에 실패했습니다')
    }
  }

  /** 장비 표 한 벌 — 캡슐의 창(devOpen)과 오른쪽 판(1단계 · 장비)이 같은 몸을
      쓴다(목업). 판에서는 닫기 ✕ 를 걷는다 — 판은 창이 아니라 늘 열려 있는 자리다. */
  const devPickUI = (inPanel: boolean) => (
    <span className={`ask-devmenu big${inPanel ? ' inpanel' : ''}`} role={inPanel ? undefined : 'menu'}>

                      {(() => {
                        const COLS: Array<[string, string, string]> = [
                          ['lab', 'LAB', 'dv-lab'],
                          ['operator', '사업자', 'dv-cu'],
                          ['vendor', '벤더', 'dv-vd'],
                          ['model_group', '모델그룹', 'dv-gp'],
                        ]
                        const val = (d: Device, k: string) =>
                          String((d as unknown as Record<string, unknown>)[k] ?? '').trim() || '—'
                        /* 접속 방식별 상태 — 등록 안 함(na) · 미확인(idle) · 연결(on) · 실패(off) */
                        const linkOf = (d: Device) => {
                          const g = (proto: string) => {
                            const a = (d.access ?? []).find(
                              (x) => String(x.protocol ?? '').toLowerCase() === proto,
                            )
                            if (!a || a.enabled === false) return 'na'
                            return a.last_status === 'ok' ? 'on' : a.last_status === 'fail' ? 'off' : 'idle'
                          }
                          return { T: g('telnet'), S: g('ssh'), C: g('console'), N: g('snmp') }
                        }
                        /* T/S/C/N 을 **하나로 묶고 점유까지 섞은 판정**(지시: 목업).
                           「연결됨/점검/연결안됨」 은 통신만 말할 뿐이라, 남이 쓰는
                           장비를 골라 실행을 걸 수 있었다. 말도 목업대로 바꾼다 —
                           사람이 알고 싶은 것은 「붙나」 가 아니라 「지금 쓸 수 있나」 다. */
                        const readyOf = (d: Device) => {
                          const L = linkOf(d)
                          const cli = [L.T, L.S, L.C].some((v) => v === 'on')
                          const snmp = L.N === 'on'
                          if (!String(d.ip ?? '').trim())
                            return { k: 'no', label: '사용 불가능', why: 'IP 미설정' }
                          if (!cli && !snmp) return { k: 'no', label: '사용 불가능', why: '통신 불가' }
                          /* 통신이 되더라도 **남이 잡고 있으면 못 쓴다** */
                          const lk = lockBy.get(String(d.id))
                          if (lk)
                            return {
                              k: 'busy',
                              label: '사용중',
                              why: `UTOP에서 사용 중 — ${lk.who}${lk.what ? ` 가 ${lk.what} 실행 중` : ' 가 쓰는 중'}`,
                            }
                          if (cli && snmp) return { k: 'ok', label: '사용 가능', why: '' }
                          /* 반만 붙는 장비 — 쓸 수는 있지만 못 도는 시험이 있다 */
                          return {
                            k: 'part',
                            label: '일부 연결',
                            why: !snmp ? 'SNMP 미등록 — SNMP 시험은 못 돌립니다' : 'CLI 접속 불가',
                          }
                        }
                        const q = devQ.trim().toLowerCase()
                        const pass = (d: Device, skip?: string) =>
                          COLS.every(([k]) => k === skip || !devF[k] || val(d, k) === devF[k]) &&
                          (!devF.ready || skip === 'ready' || readyOf(d).label === devF.ready) &&
                          (!q ||
                            [d.model, d.name, d.ip, d.lab, d.operator, d.vendor, d.model_group]
                              .map((x) => String(x ?? ''))
                              .join(' ')
                              .toLowerCase()
                              .includes(q))
                        const ipKey = (ip: string) =>
                          String(ip || '')
                            .split('.')
                            .map((n) => Number(n) || 0)
                        /* 탭 개수는 **탭을 빼고** 센다 — 「연결됨」 을 고른 채로
                           세면 다른 탭이 늘 0 이 되어 고를 수가 없다 */
                        const base = devices.filter((d) => pass(d))
                        /* **쓸 수 있는 것부터**(지시: 목업) — LAB 순으로만 세우면
                           못 쓰는 장비가 맨 위에 서서, 고를 수 있는 것을 찾아 스무
                           줄을 내려가야 한다. */
                        const kOrd: Record<string, number> = { ok: 0, part: 1, busy: 2, no: 3 }
                        const rows = base.filter((d) => devTab === 'all' || readyOf(d).k === devTab).sort((a, b) => {
                          const kk = (kOrd[readyOf(a).k] ?? 9) - (kOrd[readyOf(b).k] ?? 9)
                          if (kk) return kk
                          const l = String(a.lab ?? '').localeCompare(String(b.lab ?? ''), 'ko')
                          if (l) return l
                          const o = String(a.operator ?? '').localeCompare(String(b.operator ?? ''), 'ko')
                          if (o) return o
                          const m = String(a.model ?? a.name ?? '').localeCompare(
                            String(b.model ?? b.name ?? ''),
                            'ko',
                          )
                          if (m) return m
                          const x = ipKey(String(a.ip ?? '')),
                            y = ipKey(String(b.ip ?? ''))
                          for (let i = 0; i < 4; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0)
                          return 0
                        })
                        const opts = (k: string) =>
                          [...new Set(devices.filter((d) => pass(d, k)).map((d) => val(d, k)))].sort((a, b) =>
                            a.localeCompare(b, 'ko'),
                          )
                        const hf = (k: string, label: string, cls: string, list: string[]) => (
                          <span key={k} className={`${cls} hf${devF[k] ? ' set' : ''}`}>
                            <button
                              type="button"
                              className="hf-btn"
                              aria-expanded={devHF === k}
                              onClick={(e) => {
                                e.stopPropagation()
                                setDevHF((v) => (v === k ? '' : k))
                              }}
                            >
                              {devF[k] || label}
                              <i className="hf-c" aria-hidden="true">▾</i>
                            </button>
                            {devHF === k && (
                              <span className="hf-pop">
                                {['', ...list].map((v) => (
                                  <button
                                    key={v || '__all'}
                                    type="button"
                                    className={`hf-opt${(devF[k] || '') === v ? ' on' : ''}`}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setDevF((prev) => ({ ...prev, [k]: v }))
                                      setDevHF('')
                                    }}
                                  >
                                    {v || '전체'}
                                    {(devF[k] || '') === v && <i>✓</i>}
                                  </button>
                                ))}
                              </span>
                            )}
                          </span>
                        )
                        const dirty = Object.values(devF).some(Boolean) || !!q
                        return (
                          <>
                            <span className="ask-dmhd">
                              <input
                                className="ask-dmq"
                                placeholder="이름 · IP · LAB · 사업자 · 벤더 · 모델그룹"
                                value={devQ}
                                onChange={(e) => setDevQ(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                              />
                              <span className="ask-dmcnt">{rows.length}대</span>
                              {dirty && (
                                <button
                                  type="button"
                                  className="btn small"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setDevF({})
                                    setDevQ('')
                                    setDevHF('')
                                  }}
                                >
                                  필터 지우기
                                </button>
                              )}
                              {tDev && (
                                <button
                                  type="button"
                                  className="btn small"
                                  onClick={() => {
                                    setTDev('')
                                    setDevOpen(false)
                                  }}
                                >
                                  고르지 않음
                                </button>
                              )}
                              {/* 덮개를 정확히 눌러야만 닫히던 것(지적) — 닫는
                                  자리를 눈에 보이게 둔다. ESC 도 받는다. */}
                              {!inPanel && (
                                <button
                                  type="button"
                                  className="ask-dmx"
                                  title="닫기 (ESC)"
                                  aria-label="닫기"
                                  onClick={() => setDevOpen(false)}
                                >
                                  ✕
                                </button>
                              )}
                            </span>
                            {/* ── 상태 탭(지시: 목업) ─────────────────────────
                                지금 붙을 수 있는 장비만 보는 것이 가장 잦은 일이다.
                                개수를 함께 적어 「연결된 게 없다」 를 열어 보기 전에
                                알게 한다. */}
                            <span className="ask-dmtabs">
                              {(
                                [
                                  ['all', '전체'],
                                  ['ok', '사용 가능'],
                                  ['busy', '사용중'],
                                  ['part', '일부 연결'],
                                  ['no', '사용 불가'],
                                ] as const
                              ).map(([k, label]) => {
                                const n = k === 'all' ? base.length : base.filter((d) => readyOf(d).k === k).length
                                return (
                                  <button
                                    key={k}
                                    type="button"
                                    className={`ask-dmtab${devTab === k ? ' on' : ''}${n === 0 ? ' zero' : ''}`}
                                    data-f={k}
                                    aria-pressed={devTab === k}
                                    title={`${label} ${n}대`}
                                    onClick={() => setDevTab(k)}
                                  >
                                    <i>{n}</i>
                                    <span>{label}</span>
                                  </button>
                                )
                              })}
                            </span>
                            <span className="ask-dmbody">
                              <span className="ask-dmlist">
                                <span className="ask-dmhdr">
                                  {COLS.map(([k, label, cls]) => hf(k, label, cls, opts(k)))}
                                  <b className="dv-nm">모델명</b>
                                  <span className="dv-ip">IP</span>
                                  {hf('ready', '상태', 'dv-ready hd', ['사용 가능', '사용중', '일부 연결', '사용 불가능'])}
                                </span>
                                {rows.length ? (
                                  rows.map((d, ri) => {
                                    const nm = String(d.model || d.name || d.ip)
                                    const L = linkOf(d)
                                    const R = readyOf(d)
                                    const noip = !String(d.ip ?? '').trim()
                                    /* **못 고르는 줄**(지시: 목업) — 남이 쓰는 중이거나
                                       아예 안 붙는 장비를 골라 실행을 걸 수 있었다. */
                                    const dead = R.k === 'busy' || R.k === 'no'
                                    const pick = () => {
                                      if (dead) return
                                      setTDev(nm)
                                      /* **실제로 이 장비로 돌린다** — 여태 칩 글자만
                                         바꾸고 devId 는 안 잡아서, 칩에는 장비가 적혔는데
                                         실행은 다른 장비로 가거나 아예 못 갔다. */
                                      setDevId(d.id)
                                      if (!pins.includes('dev')) setPins((prev) => [...prev, 'dev'])
                                      setDevOpen(false)
                                      pickedLine(
                                        'dev',
                                        devDoneCard(nm, String(d.ip ?? ''), R.k, R.label),
                                      )
                                      /* 질문 흐름에서 열었으면 그대로 2단계로 잇는다 */
                                      if (afterDevRef.current === 'tc') {
                                        afterDevRef.current = ''
                                        setAskModel(String(d.model ?? ''))
                                        /* 표를 또 띄우지 않는다(승인: 단순안) —
                                           추천 한 장으로 잇고, 못 찾을 때만 표가 나온다 */
                                        void stepTc(d, asked)
                                      }
                                    }
                                    /* 상태가 바뀌는 자리에 묶음 머리를 세운다 — 「사용 가능 3대」.
                                       스무 대가 한 벌로 늘어서면 쓸 수 있는 것이 몇인지 세어야 한다. */
                                    const prevK = ri > 0 ? readyOf(rows[ri - 1]!).k : ''
                                    const head =
                                      R.k !== prevK ? (
                                        <span className={`ask-dmgrp ${R.k}`} key={`g-${R.k}`}>
                                          {R.label}
                                          <i>{rows.filter((x) => readyOf(x).k === R.k).length}대</i>
                                        </span>
                                      ) : null
                                    return (
                                      <Fragment key={d.id}>
                                      {head}
                                      <span
                                        role="menuitem"
                                        tabIndex={dead ? -1 : 0}
                                        aria-disabled={dead || undefined}
                                        className={`ask-dmi${tDev === nm ? ' on' : ''}${
                                          R.k === 'busy' ? ' busy' : ''
                                        }${dead ? ' dis' : ''}`}
                                        onClick={pick}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault()
                                            pick()
                                          }
                                        }}
                                      >
                                        <span className="dv-lab">{d.lab || '—'}</span>
                                        <span className="dv-cu">{d.operator || '—'}</span>
                                        <span className="dv-vd">{d.vendor || '—'}</span>
                                        <span className="dv-gp">{d.model_group || '—'}</span>
                                        <b className="dv-nm" title={String(d.name || nm)}>
                                          {nm}
                                        </b>
                                        <span className={`dv-ip${noip ? ' none' : ''}`}>
                                          {noip ? 'IP 미설정' : d.ip}
                                        </span>
                                        <span className={`dv-ready ${R.k}`}>
                                          <span className="rd-chip">
                                            <i className="rd-dot" />
                                            {R.label}
                                          </span>
                                          {/* 종합 판정만으로는 왜 안 되는지 모른다 — 올리면 넷을 편다 */}
                                          <span className="rd-tip">
                                            <b>{R.label}</b>
                                            <span className="rd-rows">
                                              {(
                                                [
                                                  ['T', 'Telnet', L.T],
                                                  ['S', 'SSH', L.S],
                                                  ['C', 'Console', L.C],
                                                  ['N', 'SNMP', L.N],
                                                ] as const
                                              ).map(([k, label, v]) => (
                                                <span className="rd-r" key={k}>
                                                  <i className={`rd-l ${v}`} />
                                                  <b>{k}</b> {label}
                                                  <em>
                                                    {v === 'on'
                                                      ? '정상'
                                                      : v === 'off'
                                                        ? '실패'
                                                        : v === 'idle'
                                                          ? '미확인'
                                                          : '등록 안 함'}
                                                  </em>
                                                </span>
                                              ))}
                                            </span>
                                            {R.why && <em className="why">{R.why}</em>}
                                          </span>
                                        </span>
                                      </span>
                                      </Fragment>
                                    )
                                  })
                                ) : (
                                  <span className="ask-dmnone">
                                    {devices.length ? '맞는 장비가 없습니다' : '등록된 장비가 없습니다'}
                                  </span>
                                )}
                              </span>
                            </span>
                            <span className="ask-dmlegend2">
                              <b>상태</b> = 통신(T/S/C/N) + UTOP 사용 여부 (올리면 자세히)
                              <span className="sp" />
                              {/* `lg` 는 **로그인 화면이 쓰는 이름**이었다(Login.css 의
                                  `.lg { min-height: 100vh }`). min-height 는 height 를 이겨서,
                                  7px 짜리 색 점이 화면 높이만큼 늘어나 목록을 0 으로 눌렀다. */}
                              <i className="dmlg ok" />사용 가능
                              <i className="dmlg busy" />사용중
                              <i className="dmlg no" />사용 불가능
                            </span>
                          </>
                        )
                      })()}
    </span>
  )

  /** 항목 고르개 본문 — 창(likeAsk)과 오른쪽 판(2단계 · 항목)이 같은 몸을 쓴다(목업) */
  const tcPickBody = (inPanel: boolean) => (
    <>
      {inPanel && (
        <div className="askp-note">
          고르면 그 항목의 절차를 <b>{askModel || curDev?.model || '고른 장비'}</b> 에 맞춰 옮겨
          줍니다.
          <button type="button" className="ask-likeall" onClick={() => setPickModelOpen(true)}>
            모델 바꾸기
          </button>
        </div>
      )}
            <div className="ask-tcfind">
              {/* 창이 열리면 여기에 커서가 온다. 자리가 안 잡히면 사람이
                  키보드로 곧바로 찾을 수가 없어 마우스로 다시 눌러야 한다. */}
              <input
                autoFocus={!inPanel}
                value={tcFind}
                placeholder="항목 이름 · TC 번호 · REQ · 모델로 찾기"
                onChange={(e) => setTcFind(e.target.value)}
              />
              {/* 고른 장비 것만 보기 — 켜 두는 것이 기본이다(지시). 다른 모델
                  항목을 굳이 봐야 할 때만 끈다. */}
              <label className="ask-tconly">
                <input
                  type="checkbox"
                  checked={tcOnlyModel}
                  onChange={(e) => setTcOnlyModel(e.target.checked)}
                />
                <span>{askModel || curDev?.model || '고른 장비'} 것만</span>
              </label>
            </div>
            {(() => {
              /* 「고른 장비 것만」 의 뜻(지시 고침):
                 · 모델명이 **다른 모델로 못 박힌** 항목만 뺀다.
                 · 모델명이 비었거나 **공용**이면 어느 장비로도 쓸 수 있으므로
                   그대로 보인다 — 이름 뒤에 (E5724RL) 이 붙어 있어도 그것은
                   사람이 적은 제목일 뿐이다(지적). */
              const myModel = (askModel || curDev?.model || '').trim().toLowerCase()
              const forMe = (t: { model?: string }) => {
                if (!tcOnlyModel || !myModel) return true
                /* **그 모델 것만**(지시) — 공용·빈 값도 안 가져온다 */
                return String(t.model ?? '').trim().toLowerCase() === myModel
              }
              const q = tcFind.trim().toLowerCase()
              /* REQ 는 **있을 때만** 본다 — 이 거르개는 비슷한 항목 목록(reqid 가
                 없는 꼴)에도 쓰여서, 못 박아 읽으면 타입이 어긋난다 */
              const hit = (x: { tcid: string; name: string; model: string; reqid?: string; reqtitle?: string }) =>
                !q ||
                x.name.toLowerCase().includes(q) ||
                x.tcid.toLowerCase().includes(q) ||
                x.model.toLowerCase().includes(q) ||
                (x.reqid ?? '').toLowerCase().includes(q) ||
                (x.reqtitle ?? '').toLowerCase().includes(q)
              const mine = tcAll.filter((x) => forMe(x) && hit(x))
              /* 마디마다 그 **아래 전부**를 센다 — 폴더를 골라도 걸리게 */
              const cnt = new Map<string, number>()
              for (const t of mine) for (const nd of t.chain) cnt.set(nd, (cnt.get(nd) ?? 0) + 1)
              /*
               * 말에서 자리를 짚었으면 **그 가지만** 보여 준다(지시).
               * 「SNMP 시험해줘」 라고 했는데 SYSTEM·MAINT 가 나란히 서 있으면
               * 어디를 보라는 것인지 알 수 없다. 조상과 그 아래만 남기고,
               * 나머지는 「전체 보기」 를 눌렀을 때 돌아온다.
               */
              const up = new Map(tcTree.map((n) => [n.id, n.parent]))
              const inBranch = (id: string, at: string): boolean => {
                if (!at) return true
                if (id === at) return true
                // 조상인가 — at 에서 위로 올라가며 만나면 그렇다
                let c2 = up.get(at) ?? ''
                while (c2) {
                  if (c2 === id) return true
                  c2 = up.get(c2) ?? ''
                }
                // 자손인가 — id 에서 위로 올라가며 at 을 만나면 그렇다
                let c3 = up.get(id) ?? ''
                while (c3) {
                  if (c3 === at) return true
                  c3 = up.get(c3) ?? ''
                }
                return false
              }
              const kids = (pid: string) =>
                tcTree.filter(
                  (n) =>
                    n.parent === pid && (cnt.get(n.id) ?? 0) > 0 && inBranch(n.id, qFold),
                )
              const near = new Map(like.map((x, i) => [x.tcid, i]))
              /* 골라 둔 자리에 볼 것이 없으면 **전체로 되돌린다** — 빈 목록
                 앞에서 「없습니다」 만 보고 있게 두지 않는다(지적 사진) */
              const fold = !tcFold || (cnt.get(tcFold) ?? 0) > 0 ? tcFold : ''
              const rows = mine
                .filter((x) => !fold || x.chain.includes(fold))
                // 말과 비슷하다고 서버가 짚어 준 것을 맨 위로
                .sort((a, b) => (near.get(a.tcid) ?? 99) - (near.get(b.tcid) ?? 99))
              const foldName = tcTree.find((n) => n.id === fold)?.name ?? ''

              /**
               * 트리 한 줄 — Coverage 트리와 **같은 꼴**(지시).
               *
               * 이름·아이콘·들여쓰기·숫자 자리를 저쪽(ReqTree.css 의 rt-*)에서
               * 그대로 가져온다. 흉내 낸 꼴을 따로 두면 한쪽만 고쳐져 갈린다.
               */
              const line = (nd: { id: string; name: string; kind: 'cat' | 'req'; depth: number }) => {
                const kk = kids(nd.id)
                const open = tcOpen.has(nd.id)
                const pick = () => {
                  setTcFold(tcFold === nd.id ? '' : nd.id)
                  setTcOpen((v) => new Set([...v, nd.id]))
                }
                const toggle = () =>
                  setTcOpen((v) => {
                    const n2 = new Set(v)
                    if (n2.has(nd.id)) n2.delete(nd.id)
                    else n2.add(nd.id)
                    return n2
                  })
                if (nd.kind === 'req')
                  return (
                    <div key={nd.id}>
                      <div
                        ref={tcFold === nd.id ? tcSelRef : undefined}
                        className={`rt-req tt-req${tcFold === nd.id ? ' on' : ''}`}
                        role="button"
                        tabIndex={0}
                        style={{ paddingLeft: 4 + nd.depth * 14 }}
                        onClick={pick}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            pick()
                          }
                        }}
                      >
                        <button type="button" className="rt-caret" disabled aria-hidden="true">
                          <span className="rt-dot" />
                        </button>
                        <span className="rt-dicon" aria-hidden="true">
                          <IconReqDoc />
                        </span>
                        <span className="rt-title" title={nd.name}>
                          {nd.name}
                        </span>
                        <span className="rt-cnt">{cnt.get(nd.id) ?? 0}</span>
                      </div>
                    </div>
                  )
                return (
                  <div key={nd.id}>
                    <div
                      ref={tcFold === nd.id ? tcSelRef : undefined}
                      className={`rt-fold${tcFold === nd.id ? ' on' : ''}${nd.depth === 0 ? ' rt-top' : ''}`}
                      role="button"
                      tabIndex={0}
                      style={{ paddingLeft: 4 + nd.depth * 14 }}
                      onClick={pick}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          pick()
                        }
                      }}
                    >
                      <button
                        type="button"
                        className={`rt-caret${open ? ' open' : ''}`}
                        disabled={kk.length === 0}
                        aria-label={open ? '접기' : '펼치기'}
                        onClick={(e) => {
                          e.stopPropagation()
                          toggle()
                        }}
                      >
                        <IconChevron />
                      </button>
                      <span className="rt-ficon" aria-hidden="true">
                        {nd.depth === 0 ? <IconProject /> : <IconFolder open={open} />}
                      </span>
                      <b className="rt-fname" title={nd.name}>
                        {nd.name}
                      </b>
                      <span className="rt-cnt">{cnt.get(nd.id) ?? 0}</span>
                    </div>
                    {open && kk.map((k2) => line(k2))}
                  </div>
                )
              }

              const roots = kids('')
              return (
                <div className="ask-tcbody">
                  {/* Coverage 트리 — 고른 장비의 모델에 걸린 것만 남는다(지시).
                      마디를 누르면 오른쪽 목록이 그 아래만 보여 준다. */}
                  <aside className="ask-tctree rt">
                    <div className="ask-likegrp">
                      Coverage 트리
                      <span className="muted small">
                        {askModel || curDev?.model ? `${askModel || curDev?.model} 것` : '전체'}
                      </span>
                      {tcFold && (
                        <button
                          type="button"
                          className="ask-tcall"
                          onClick={() => {
                            setTcFold('')
                            setQFold('')
                          }}
                        >
                          전체 보기
                        </button>
                      )}
                    </div>
                    <div className="rt-body">
                      {roots.map((n2) => line(n2))}
                      {roots.length === 0 && (
                        <div className="empty">이 모델에 걸린 시험이 없습니다.</div>
                      )}
                    </div>
                  </aside>
                  <div className="ask-tclist">
                    <div className="ask-likegrp">
                      {fold ? `${foldName} — ${rows.length}건` : `시험 항목 ${rows.length}건`}
                      {like.length > 0 && !fold && !q ? ' · 말과 비슷한 것 위로' : ''}
                      {fold && (
                        <button
                          type="button"
                          className="ask-tcall"
                          onClick={() => {
                            setTcFold('')
                            setQFold('')
                          }}
                        >
                          전체 보기
                        </button>
                      )}
                    </div>
                    {/* Coverage 목록과 **같은 칸**을 세운다(지시 사진의 붉은 칸) */}
                    <table className="ask-tctable">
                      <thead>
                        <tr>
                          <th className="ck">
                            <input
                              type="checkbox"
                              title="이 목록 전부 고르기"
                              checked={rows.length > 0 && rows.every((x) => tcPick.has(x.tcid))}
                              onChange={(e) =>
                                setTcPick((v) => {
                                  const n2 = new Set(v)
                                  for (const x of rows) {
                                    if (e.target.checked) n2.add(x.tcid)
                                    else n2.delete(x.tcid)
                                  }
                                  return n2
                                })
                              }
                            />
                          </th>
                          {/* **무엇을 고르는지 판단할 근거**를 줄에 싣는다(지적).
                              이름·모델만 있으면 어느 요구사항 것인지, 돌린 적은
                              있는지, 손으로 하는 시험인지 모르는 채 골라야 한다. */}
                          <th className="tc-req">REQ</th>
                          <th className="tc-id">TC ID</th>
                          <th>이름</th>
                          <th>모델그룹</th>
                          <th>모델명</th>
                          <th className="tc-st">상태</th>
                          <th className="tc-kd">타입</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* 말에 모델이 없으면 **모델별로 묶어** 보여 준다(지시) —
                            고른 항목이 곧 모델을 정하므로 무엇을 고르는지 보여야 한다 */}
                        {rows.slice(0, 400).map((x, ri) => (
                          <Fragment key={`f-${x.tcid}`}>
                            {!myModel &&
                              (ri === 0 || (rows[ri - 1]?.model ?? '') !== (x.model ?? '')) && (
                                <tr className="ask-tcgrp">
                                  <td colSpan={8}>
                                    {x.model?.trim() || '공용 — 어느 장비로도 씁니다'}
                                    <i>
                                      {rows.filter((y) => (y.model ?? '') === (x.model ?? '')).length}건
                                    </i>
                                  </td>
                                </tr>
                              )}
                          <tr
                            key={x.tcid}
                            className={adopting ? 'busy' : ''}
                            onClick={() => {
                              if (adopting) return
                              setLikeAsk(false)
                              /* 무엇으로 정했는지 남기고 3단계로(지시: 목업) */
                              pickedLine(
                                'tc',
                                tcDoneCard(
                                  x.tcid,
                                  x.name,
                                  `${/manual|수동/i.test(String(x.type || '')) ? '수동' : '자동'} · ${x.steps}스텝`,
                                ),
                              )
                              /* 일반 = 있는 것을 그대로, 고급 = 이 장비에 맞춰 옮겨 짓기 */
                              void (mode === 'basic'
                                ? takeTc(x.tcid, undefined, x.model)
                                : adopt(x.tcid))
                            }}
                          >
                            <td className="ck" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={tcPick.has(x.tcid)}
                                onChange={() =>
                                  setTcPick((v) => {
                                    const n2 = new Set(v)
                                    if (n2.has(x.tcid)) n2.delete(x.tcid)
                                    else n2.add(x.tcid)
                                    return n2
                                  })
                                }
                              />
                            </td>
                            <td className="tc-req">
                              {/* 번호만 적는다(지시) — 제목 칩까지 달면 줄이 두 층이
                                  되어 표가 무거워진다. 제목은 찾기로는 여전히 걸린다. */}
                              {x.reqid ? (
                                <b className="tc-reqid" title={x.reqtitle || undefined}>
                                  {x.reqid}
                                </b>
                              ) : (
                                <i className="tc-none">–</i>
                              )}
                            </td>
                            <td className="tc-id">{x.tcid}</td>
                            <td>
                              <b>{x.name}</b>
                              <i>{x.steps}</i>
                            </td>
                            <td>{x.mgroup || '공용'}</td>
                            <td>{x.model || '–'}</td>
                            <td className="tc-st">
                              {(() => {
                                /* 돌린 적이 있나 — 색은 Pass/Fail 만 못박고 나머지는
                                   「미실행」 한 가지로 둔다(설정의 판정 이름이 늘어도
                                   이 칸이 거짓말하지 않게) */
                                const v = String(x.status || '').toLowerCase()
                                const k = v === 'pass' ? 'pass' : v === 'fail' ? 'fail' : 'none'
                                return (
                                  <span className={`tc-last ${k}`}>
                                    {k === 'none' ? '미실행' : v === 'pass' ? 'Pass' : 'Fail'}
                                  </span>
                                )
                              })()}
                            </td>
                            <td className="tc-kd">
                              {(() => {
                                const man = /manual|수동/i.test(String(x.type || ''))
                                return <i className={`tc-kind ${man ? 'man' : 'auto'}`}>{man ? '수동' : '자동'}</i>
                              })()}
                            </td>
                          </tr>
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                    {rows.length === 0 && (
                      <div className="ask-likenone muted small">
                        {tcAll.length === 0
                          ? '시험 항목을 읽지 못했습니다 — Coverage 에서 항목을 먼저 만들어 주세요'
                          : tcOnlyModel && myModel
                            ? (
                                <>
                                  <b>{curDev?.model}</b> 것이거나 공용인 항목이 없습니다.
                                  <button
                                    type="button"
                                    className="ask-likeall"
                                    onClick={() => setTcOnlyModel(false)}
                                  >
                                    다른 모델 항목도 보기
                                  </button>
                                </>
                              )
                            : '찾는 항목이 없습니다 — 왼쪽 자리를 바꾸거나 다른 말로 찾아보세요'}
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}
            <div className="modal-foot">
              <span className="muted small">
                줄을 누르면 그 항목으로 만듭니다. 여러 건은 <b>체크</b> 해서 한 번에 — 고른 차례대로
                이어 붙입니다.
              </span>
              <span className="ask-footbtns">
                {!inPanel && (
                  <button className="btn small" type="button" onClick={cancelAsk}>
                    그만두기
                  </button>
                )}
                <button
                  className="btn primary small"
                  type="button"
                  disabled={tcPick.size === 0 || !!adopting}
                  onClick={() => {
                    const ids = [...tcPick]
                    setLikeAsk(false)
                    setTcPick(new Set())
                    /* 일반 갈래에서 한 건이면 그대로 싣는다 — 고치지 않는다 */
                    void (mode === 'basic' && ids.length === 1 && ids[0]
                      ? takeTc(ids[0])
                      : adoptMany(ids))
                  }}
                >
                  고른 {tcPick.size}건으로 만들기
                </button>
              </span>
            </div>
    </>
  )

  return (
    /* 세 칸 + 아래 입력줄 — 옮겨 온 화면의 짜임을 우리 꼴(panel·btn·토큰)로 다시 그렸다.
       왼쪽 기록 · 가운데 작업 흐름 · 오른쪽 캔버스, 입력은 흐름부터 오른쪽 끝까지. */
    <div className={`ask${!draft && !making ? ' athome' : ''}${twoPane ? ' console' : ''}`}>
      {/* 왼쪽 「새 시험 만들기 · 최근」 칸은 걷어냈다(지시) — 첫 화면이
          한가운데에 서야 해서, 옆에 칸이 있으면 그만큼 밀린다. */}

      {/* ── 1열 · 대화 목록(지시: 클로드·GPT 처럼) ────────────────────
          새 대화 · 지난 대화. 누르면 그 절차가 되살아나고 ✕ 로 지운다. */}
      {/* 접힘 — 아이콘 레일만 남는다(지시) */}
      {railShut && (
        <aside className="ask-rail2" aria-label="대화 목록(접힘)">
          <button
            className="ask-ico"
            type="button"
            title="사이드바 펴기"
            onClick={() => setRailShut(false)}
          >
            <IconPanelToggle />
          </button>
          <button className="ask-ico plus2" type="button" title="새 채팅" onClick={newChat}>
            ＋
          </button>
          <button
            className="ask-ico"
            type="button"
            title="대화 검색"
            onClick={() => {
              setFindOn(true)
              setFindQ('')
            }}
          >
            <IconSearch />
          </button>
        </aside>
      )}
      {!railShut && (
      <aside className="ask-sess" aria-label="대화 목록" ref={sessRef} style={{ width: sessW }}>
        {/* 새 채팅 줄 — 접기 아이콘은 같은 줄 오른쪽(지시: 원위치) */}
        <div className="ask-stop">
          <button className="ask-hnew" type="button" onClick={newChat}>
            <span className="pl" aria-hidden="true">＋</span>새 채팅
          </button>
          <button
            className="ask-ico"
            type="button"
            title="사이드바 접기"
            onClick={() => setRailShut(true)}
          >
            <IconPanelToggle />
          </button>
        </div>
        <div className="ask-eyebrow">
          <span>대화</span>
          <span className="eyebtns">
            {/* 대화 검색은 모든 대화 보기 왼쪽(지시) */}
            <button
              type="button"
              className={`ask-sec-add${findOn ? ' on' : ''}`}
              title="대화 검색"
              onClick={() => {
                setFindOn((v) => !v)
                setFindQ('')
              }}
            >
              <IconSearch />
            </button>
            <button
              type="button"
              className="ask-sec-add"
              title={listAll ? '최근 것만 보기' : '모든 대화 보기'}
              onClick={() => setListAll((v) => !v)}
            >
              ⇅
            </button>
          </span>
        </div>
        {/* 찾기 칸은 걷었다 — 검색은 팝업으로(지시) */}
        <div className="ask-slist">
          {recent.length === 0 ? (
            <span className="muted small">아직 대화가 없습니다.</span>
          ) : (
            shownChats.map((x) => (
              <div className={`ask-sitem${chatId === x.cid ? ' on' : ''}`} key={x.cid}>
                <button
                  type="button"
                  className="ask-sbtn"
                  title={x.at ? `${x.title} · ${String(x.at).slice(0, 16)}` : x.title}
                  onClick={() => void openChat(x.cid, x.title)}
                >
                  <b>{x.title}</b>
                </button>
                <button
                  type="button"
                  className="mo"
                  title="이름 바꾸기 · 지우기"
                  aria-haspopup="menu"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    setThMenu((v) => (v === x.cid ? '' : x.cid))
                  }}
                >
                  ⋯
                </button>
                {thMenu === x.cid && (
                  <div
                    className="ask-thmenu"
                    role="menu"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setThMenu('')
                        void renameChat(x.cid, x.title)
                      }}
                    >
                      이름 바꾸기
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => {
                        setThMenu('')
                        if (window.confirm('이 대화를 지웁니다.')) void dropChat(x.cid)
                      }}
                    >
                      지우기
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
          {!listAll && recent.length > 12 && (
            <button type="button" className="ask-smore" onClick={() => setListAll(true)}>
              {recent.length - 12}개 더 보기
            </button>
          )}
        </div>
        {/* 프로필 칩도 걷었다(지시) — 상단바가 이미 로그인한 사람을 말한다 */}
      </aside>
      )}
      {!railShut && (
        <Resizer
          label="대화 목록 폭 조절"
          onResize={setSessW}
          getOrigin={() => sessRef.current?.getBoundingClientRect().left ?? 0}
        />
      )}

      {/* 대화 검색 — 팝업(지시). 제목으로 걸러 누르면 그 대화가 열린다 */}
      {findOn && (
        <div
          className="modal-back"
          onMouseDown={() => {
            setFindOn(false)
            setFindQ('')
          }}
        >
          <div
            className="modal ask-findmodal"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="ask-findhd">
              <IconSearch />
              <input
                autoFocus
                value={findQ}
                placeholder="대화 제목으로 찾기"
                onChange={(e) => setFindQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setFindOn(false)
                    setFindQ('')
                  }
                }}
              />
              <button
                className="modal-x"
                type="button"
                onClick={() => {
                  setFindOn(false)
                  setFindQ('')
                }}
              >
                ✕
              </button>
            </div>
            <div className="ask-findlist">
              {(() => {
                const q = findQ.trim().toLowerCase()
                const hits = (q ? recent.filter((x) => x.title.toLowerCase().includes(q)) : recent).slice(0, 30)
                if (!hits.length)
                  return (
                    <div className="ask-findnone">
                      {q ? `「${findQ.trim()}」 에 맞는 대화가 없습니다.` : '아직 대화가 없습니다.'}
                    </div>
                  )
                return hits.map((x) => (
                  <button
                    key={x.cid}
                    type="button"
                    className="ask-finditem"
                    onClick={() => {
                      setFindOn(false)
                      setFindQ('')
                      void openChat(x.cid, x.title)
                    }}
                  >
                    <b>{x.title}</b>
                    {x.at && <em>{String(x.at).slice(5, 16)}</em>}
                  </button>
                ))
              })()}
            </div>
          </div>
        </div>
      )}

      {/* 내보내기 미리보기(지시) — 확인하고 내려받는다 */}
      {expPrev && draft && (
        <div className="modal-back" onMouseDown={() => setExpPrev('')}>
          <div
            className="modal ask-prevmodal"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <b>{expPrev === 'pdf' ? 'PDF 결과서 미리보기' : 'PPTX 결과서 미리보기'}</b>
                <div className="muted small">
                  {expPrev === 'pdf'
                    ? '이 내용 그대로 PDF 로 저장됩니다.'
                    : '실제 파일은 고객사 양식(PPTX)에 이 내용이 채워져 나옵니다.'}
                </div>
              </div>
              <span className="sp" />
              <button className="modal-x" type="button" onClick={() => setExpPrev('')}>
                ✕
              </button>
            </div>
            <iframe
              className="ask-previfr"
              title="결과서 미리보기"
              srcDoc={expPrev === 'pdf' ? reportHtml() : pptxPrevHtml()}
            />
            <div className="modal-foot">
              <span className="sp" />
              <span className="ask-footbtns">
                <button className="btn small" type="button" onClick={() => setExpPrev('')}>
                  닫기
                </button>
                <button
                  className="btn primary small"
                  type="button"
                  onClick={() => {
                    const k = expPrev
                    setExpPrev('')
                    void (k === 'pdf' ? savePdf() : savePptx())
                  }}
                >
                  ⬇ 내려받기
                </button>
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="ask-main">
        <div className="ask-cols">
          {/* 작업 흐름 — 무엇을 거치는지, 건너뛰면 왜 건너뛰는지 */}
          {/* 작업 흐름 — 아직 아무 일도 없으면 빈 판이라 첫 화면을 좁힐 뿐이다 */}
          {/* 작업 흐름 레일은 걷었다(지시: 필요 없어) — 한 일은 대화 말풍선이 이미 말한다 */}

          <div className={`ask-canvaswrap${draft ? ' plan' : ''}`}>
          <main className={`ask-canvas${draft ? ' plan' : ''}${busy ? ' busy' : ''}${twoPane ? ' console' : ''}`}>
            {/* 고치는 동안 뜨는 표 — **일하는 자리 한가운데**(지시).
                판마다 띄우면 둘로 보이고, 한쪽에만 띄우면 왼쪽으로 쏠린다. */}
            {busy && draft && (
              <div className="ask-busy" role="status" aria-live="polite">
                <span className="ask-busy-box">
                  <i className="ask-spin" aria-hidden="true" />
                  <b>AI 수정 중…</b>
                  <em>지금 절차를 고치고 있습니다</em>
                </span>
              </div>
            )}

      {/* 첫 화면 — 보내 주신 목업 그대로(지시).
          제목 · 입력칸(모드 고르개가 그 안에) · 오프너 셋.
          관리자는 ⚙ 로 오프너를 이 자리에서 고친다. */}
        <div
          className={`ask-home${exEdit ? ' editing' : ''}${twoPane ? ' chat' : ''}`}
          data-theme={theme}
          ref={homeRef}
          style={twoPane ? { flex: `0 0 ${chatW}px` } : undefined}
        >
          {/* 대화 머리(지시) — 지금 어떤 대화인지 제목이 선다 */}
          {twoPane && (
            <div
              className="ask-chattop"
              title={recent.find((x) => x.cid === chatId)?.title || asked || undefined}
            >
              {recent.find((x) => x.cid === chatId)?.title || asked || '새 대화'}
            </div>
          )}
          {exEdit && <span className="ask-edbadge">오프너 편집 모드</span>}
          <div className="ask-hometools">
            {!exEdit && (
              <span className="ask-themewrap">
                <button
                  className="ask-gearbtn"
                  type="button"
                  aria-haspopup="true"
                  aria-expanded={themeOpen}
                  title="첫 화면 테마 — 계절·명절 색으로 바꿉니다"
                  onClick={() => setThemeOpen((v) => !v)}
                >
                  {THEMES.find(([k]) => k === theme)?.[2]} 테마
                </button>
                {themeOpen && (
                  <>
                    <span className="ask-modeback" onClick={() => setThemeOpen(false)} />
                    <span className="ask-thememenu" role="menu">
                      {THEMES.map(([k, nm, emo]) => (
                        <button
                          key={k}
                          type="button"
                          role="menuitemradio"
                          aria-checked={theme === k}
                          className={`ask-thmi${theme === k ? ' on' : ''}`}
                          onClick={() => {
                            setTheme(k)
                            setThemeOpen(false)
                          }}
                        >
                          <i aria-hidden="true">{emo}</i>
                          {nm}
                          {theme === k && <b aria-hidden="true">✔</b>}
                        </button>
                      ))}
                    </span>
                  </>
                )}
              </span>
            )}
            {amAdmin && !exEdit && (
              <button
                className="ask-gearbtn"
                type="button"
                title="오프너 문구를 이 자리에서 바로 고칩니다"
                onClick={() => {
                  exBack.current = examples.map((x) => ({ ...x }))
                  setExEdit(true)
                }}
              >
                <IconSettings /> 설정
              </button>
            )}
            {exEdit && (
              <button
                className="ask-edcancel"
                type="button"
                onClick={() => {
                  setExamples(exBack.current.map((x) => ({ ...x })))
                  setExEdit(false)
                }}
              >
                ✕ 편집 취소
              </button>
            )}
          </div>

          <div className="ask-homewrap">
            {/* A안 오로라(승인) — 빛무리 셋과 점 격자. 그림일 뿐이라
                보조기기에는 없는 것으로 친다. 움직임은 CSS 가 갖고 있고
                prefers-reduced-motion 이면 멎는다. */}
            <div className="ask-sky" aria-hidden="true">
              <i className="o1" />
              <i className="o2" />
              <i className="o3" />
              <i className="dots" />
              {/* 계절의 「것」 — 벚꽃·물방울·낙엽·눈·별·연. 무엇이 될지는
                  테마 CSS 가 정하고, 여기는 자리 열여섯만 뿌린다. */}
              <span className="fx">
                {Array.from({ length: 16 }, (_, i) => (
                  <i key={i} style={{ '--i': i } as CSSProperties} />
                ))}
              </span>
            </div>
            <span className="ask-aibadge">
              <i aria-hidden="true">✦</i>UBIQUOSS Test Assistant
            </span>
            <h1 className="ask-hometitle">무엇을 도와드릴까요?</h1>
            {/* 부제는 **고른 갈래를 따라간다**(지시) — Basic 은 있는 Coverage
                항목을 돌리는 자리, Advanced 는 새로 지어 돌리는 자리다. */}
            <p className="ask-homesub">
              {mode === 'adv' ? (
                <>
                  Coverage 항목을 신규로 작성해서 테스트할 수 있습니다.
                  <br />
                  자연어로 모델명과 시험항목을 요청하시면 Coverage AI가 전 과정을 지원합니다.
                </>
              ) : (
                <>
                  기존에 작성된 Coverage 항목을 테스트할 수 있습니다.
                  <br />
                  Basic mode를 선택하신 후 자연어로 모델명과 시험항목을 요청하시면 Coverage AI가
                  전 과정을 지원합니다.
                </>
              )}
            </p>

            {/* 입력 + 모드 — 한 상자 안이다(목업) */}
            {/* 2행 캡슐(승인) — 1행 질문 · 2행 첨부·도구·핀 칩 | 모드·음성·보내기 */}
            {/* ── 대화 ─────────────────────────────────────────────────
                물어본 말과 AI 가 정한 것이 여기 쌓인다. 첫 화면에서는 안 보이고
                (msgs 가 비어 있다) 한 번 물으면 제목·부제·오프너 자리를 이 판이
                넘겨받는다 — 목업 그대로다. */}
            {msgs.length > 0 && (
              <div
                className="ask-msgs"
                ref={msgsRef}
                /* 말풍선 안의 「📟 장비 고르기」·「🔍 시험 항목 고르기」 —
                   글 속에 심은 단추라 한 자리에서 받는다 */
                onClick={(e) => {
                  const t = e.target as HTMLElement
                  /* 추천 카드·후보 줄 — 누르면 그 자리에서 정해진다(승인: 단순안) */
                  const dv = t.closest('.js-devpick') as HTMLElement | null
                  if (dv) {
                    pickInlineDev(dv.dataset.id || '')
                    return
                  }
                  const tc = t.closest('.js-tcpick') as HTMLElement | null
                  if (tc) {
                    pickInlineTc(tc.dataset.tcid || '', tc.dataset.model || '')
                    return
                  }
                  /* 아티팩트 칩(클로드) — 오른쪽 판이 그 내용을 편다 */
                  if (t.closest('.js-pickdev')) {
                    afterDevRef.current = 'tc'
                    setPane('dev')
                  } else if (t.closest('.js-picktc')) setPane('tc')
                  else if (t.closest('.js-openresp')) setRunView(true)
                }}
              >
                {msgs.map((m, i) =>
                  m.who === 'u' ? (
                    /* 내 말 — 오른쪽 정렬 + 누가 물었나 아바타(지시) */
                    <div className="msg u" key={i}>
                      <b>{m.html}</b>
                      <span className="uav" aria-hidden="true" title={meName || undefined}>
                        {myInit}
                      </span>
                    </div>
                  ) : (
                    <div className="msg a" key={i}>
                      <span className="av" aria-hidden="true">✦</span>
                      <div className="bdw">
                        <div className="bd" dangerouslySetInnerHTML={{ __html: m.html }} />
                        {/* 답 아래 동작 줄(클로드) — 지금은 복사 하나 */}
                        <div className="aacts">
                          <button
                            type="button"
                            title="답 복사"
                            onClick={(e) => {
                              e.stopPropagation()
                              void navigator.clipboard?.writeText(
                                m.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
                              )
                            }}
                          >
                            ⧉
                          </button>
                        </div>
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}
            <div className="ask-askbox2 two">
              <div className="ask-r1">
              <input
                ref={askInRef}
                className="ask-askin2"
                value={text}
                disabled={exEdit}
                placeholder={
                  mode === 'adv'
                    ? '만들 시험을 설명하세요 — 대상 장비, 스텝, 판정 기준'
                    : 'Coverage AI에게 요청하기…'
                }
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return
                  if (e.key === 'Enter' && text.trim()) void submit()
                }}
              />
              </div>

              <div className="ask-r2">
              {/* **＋ 하나**로 모은다(지시: 목업). 파일(📎)과 도구(⚙)를 따로 두면
                  입력줄 앞이 단추 둘로 시작해 무엇을 눌러야 할지 묻게 된다.
                  붙일 것도 켤 것도 다 이 안에 있다. */}
              <span className="ask-toolwrap">
                <button
                  className={`ask-plus${toolsOpen ? ' on' : ''}`}
                  type="button"
                  aria-haspopup="true"
                  aria-expanded={toolsOpen}
                  title="파일 붙이기 · 도구 추가"
                  onClick={() => setToolsOpen((v) => !v)}
                >
                  ＋
                </button>
                {toolsOpen && (
                  <>
                    <span className="ask-modeback" onClick={() => setToolsOpen(false)} />
                    <span className="ask-toolmenu" role="menu">
                      {/* 파일이 먼저다 — 「무엇을 붙일까」 가 「무엇을 켤까」 보다 앞선다 */}
                      <span className="ask-tmi off file" aria-disabled="true">
                        <i>📎</i>파일 업로드<em className="soon">CSV · 로그 · 캡처 · 나중</em>
                      </span>
                      <span className="tsep" aria-hidden="true" />
                      {/* **메뉴는 꽂기만 한다**(지시). 전에는 항목을 누르면 그
                          자리에서 켜지거나 장비 팝업이 떴고, 입력줄에 칩으로
                          세우려면 📌 를 따로 눌러야 했다 — 한 줄에 누르는 자리가
                          둘이라 어느 쪽이 무엇인지 알 수 없었다. 이제 여기서는
                          꽂고 빼기만 하고, **쓰는 것은 입력줄의 칩**으로 한다.
                          여러 개를 이어서 꽂을 수 있게 고른 뒤에도 닫지 않는다. */}
                      {TOOLDEF.map(([k, emo, nm, d]) => {
                        const on = pins.includes(k)
                        return (
                          <span
                            key={k}
                            role="menuitemcheckbox"
                            aria-checked={on}
                            tabIndex={0}
                            className={`ask-tmi${on ? ' on' : ''}`}
                            title={on ? `${d} \u00b7 다시 누르면 뺍니다` : `${d} \u00b7 누르면 입력줄에 꽂힙니다`}
                            onClick={() => pinTool(k)}
                            onKeyDown={(e) => e.key === 'Enter' && pinTool(k)}
                          >
                            <i>{emo}</i>
                            {nm}
                            {on && <em className="ck">✓</em>}
                          </span>
                        )
                      })}
                    </span>
                  </>
                )}
              </span>
              {/* **도구 칩은 ＋ 바로 옆**(지시: 목업 입력창). 아래 줄로 내리면
                  ＋ 와 칩이 갈라져 「무엇을 켜 두었나」 가 한눈에 안 들어온다.
                  핀이 많아 넘치면 줄이 접힌다 — 모드·마이크·보내기는 안 밀린다. */}
              <div className="ask-r3">
                {pins.map((k) => {
                  const t = TOOLDEF.find(([x]) => x === k)
                  if (!t) return null
                  const [key, emo, nm, d] = t
                  /* 고른 것이 있으면 **고른 것만** 지운다(지적). 여태 ✕ 는
                     언제나 도구를 통째로 뺐다 — 고른 장비만 지우려고 눌렀다가
                     칩 자체가 사라져 다시 ⚙ 에서 꽂아야 했다. */
                  const chose = key === 'dev' ? !!tDev : key === 'find' ? tcPick.size > 0 : false
                  const off = (
                    <i
                      className="chx"
                      title={chose ? '고른 것 지우기' : '도구 빼기'}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (chose) {
                          if (key === 'dev') {
                            setTDev('')
                            setDevId('')
                          } else setTcPick(new Set())
                          return
                        }
                        setPins((prev) => prev.filter((x) => x !== key))
                        setTOn((prev) => {
                          const nx = new Set(prev)
                          nx.delete(key)
                          return nx
                        })
                      }}
                    >
                      ✕
                    </i>
                  )
                  if (key === 'dev')
                    return (
                      <button
                        key={key}
                        type="button"
                        className={`ask-chip${tDev ? ' on sel' : ''}`}
                        title={d}
                        onClick={() => setDevOpen((v) => !v)}
                      >
                        {/* 모델명만 보이면 같은 모델이 열 대인 LAB 에서 어느
                            것을 골랐는지 모른다 — IP 까지 적는다 */}
                        {emo} {tDev ? `${tDev}${curDev?.ip ? ` (${curDev.ip})` : ''}` : nm}
                        {off}
                      </button>
                    )
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`ask-chip${tOn.has(key) ? ' on' : ''}${key === 'find' && tcPick.size ? ' sel' : ''}`}
                      title={key === 'find' ? `${d} \u00b7 눌러서 항목을 고릅니다` : d}
                      onClick={() => {
                        flipTool(key)
                        /* **칩을 누르면 그 도구가 하는 일이 열린다**(지시).
                           「장비 고르기」 는 고르개가 뜨는데 「시험 항목 찾기」 는
                           켜지기만 해서, 같은 줄의 두 칩이 서로 다르게 굴었다.
                           끌 때는 열지 않는다 — 끄려고 누른 사람 앞에 창이 뜬다. */
                        if (key === 'find' && !tOn.has(key)) setLikeAsk(true)
                      }}
                    >
                      {/* 몇 건을 골랐는지 칩에서 바로 보인다(지적) */}
                      {emo}{' '}
                      {key === 'find' && tcPick.size
                        ? `${[...tcPick][0]}${tcPick.size > 1 ? ` 외 ${tcPick.size - 1}건` : ''}`
                        : nm}
                      {off}
                    </button>
                  )
                })}
                {!pins.length && (
                  <button
                    type="button"
                    className={`ask-more${toolsOpen ? ' on' : ''}`}
                    title="쓸 도구를 골라 이 줄에 꽂습니다"
                    onClick={() => setToolsOpen((v) => !v)}
                  >
                    ＋ 도구 추가
                  </button>
                )}
              </div>
              {/* 빈 공간은 **모드 뒤**다(지시: 모드는 ＋ 옆). 앞에 두면 모드가
                  오른쪽 끝으로 밀려 마이크·보내기와 한 덩이로 읽힌다. */}
              <span className="ask-rsp" />
              {/* 모드 — **드롭다운**(지시). 세그먼트 토글이던 것을 되돌린다:
                  오른쪽 끝에 AI 고르개가 서면서 두 고르개의 생김새가 같아야
                  한 벌로 읽힌다. 지금 무엇인지는 단추에 그대로 적는다. */}
              <span className="ta-pick">
                <button
                  type="button"
                  className={`ta-pickb${modeOpen ? ' open' : ''}`}
                  disabled={exEdit}
                  title={
                    mode === 'basic'
                      ? 'Basic — 이미 만들어진 시험 항목을 찾아 그대로 실행합니다 · 명령을 몰라도 됩니다'
                      : 'Advanced — 없는 시험을 새로 만듭니다. 스텝마다 명령과 판정 기준을 정합니다 · 장비를 아는 사람이'
                  }
                  aria-expanded={modeOpen}
                  onClick={() => {
                    setModeOpen((v) => !v)
                    setLlmOpen(false)
                  }}
                >
                  <i className="sico" aria-hidden="true">{mode === 'basic' ? '\u25b6' : '\u270e'}</i>
                  <span className="mlb">{mode === 'basic' ? 'Basic' : 'Advanced'}</span>
                  <svg className="cv" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
                </button>
                {modeOpen && (
                  <>
                    <span className="ta-pickveil" onClick={() => setModeOpen(false)} />
                    <span className="ta-pickmenu">
                      {(
                        [
                          ['basic', 'Basic', '\u25b6', '있는 시험을 찾아 바로 실행'],
                          ['adv', 'Advanced', '\u270e', '없는 시험을 새로 만들어 실행'],
                        ] as const
                      ).map(([k, label, ico, sub]) => (
                        <button
                          key={k}
                          type="button"
                          className={`ta-pickit${mode === k ? ' on' : ''}`}
                          onClick={() => {
                            setMode(k)
                            setModeOpen(false)
                          }}
                        >
                          <i className="sico" aria-hidden="true">{ico}</i>
                          <b>{label}</b>
                          <span className="sub">{sub}</span>
                          {mode === k && <svg className="ck" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 13l4 4L19 7" /></svg>}
                        </button>
                      ))}
                    </span>
                  </>
                )}
              </span>
              {/* 쓸 AI — **오른쪽 끝**(지시). 마이크·보내기 바로 앞이라
                  「무엇으로 답하는가」 가 보내는 손과 한자리에 있다. */}
              {llms.length > 0 && (
                <span className="ta-pick ta-ai">
                  <button
                    type="button"
                    className={`ta-pickb ai${llmOpen ? ' open' : ''}`}
                    disabled={exEdit}
                    title={`이 물음에 답할 AI — 지금은 ${llmNow?.name ?? '기본'}${llmNow?.model ? ` (${llmNow.model})` : ''}`}
                    aria-expanded={llmOpen}
                    onClick={() => {
                      setLlmOpen((v) => !v)
                      setModeOpen(false)
                    }}
                  >
                    {/* **이름만 세운다**(목업). 모델 번호까지 달면 「Local LLM
                        gemma-4-31b-it」 처럼 길어져 입력줄의 절반을 먹는다 —
                        모델은 풍선말과 고름표 안에서 본다. */}
                    <span className="mlb">{llmNow?.name ?? 'AI 고르기'}</span>
                    <svg className="cv" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
                  </button>
                  {llmOpen && (
                    <>
                      <span className="ta-pickveil" onClick={() => setLlmOpen(false)} />
                      <span className="ta-pickmenu right">
                        {llms.map((x) => (
                          <button
                            key={x.id}
                            type="button"
                            className={`ta-pickit${x.id === llmId ? ' on' : ''}`}
                            onClick={() => {
                              setLlmId(x.id)
                              setLlmOpen(false)
                            }}
                          >
                            <b>{x.name}</b>
                            {!!x.model && <span className="sub">{x.model}</span>}
                            {x.id === llmId && <svg className="ck" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 13l4 4L19 7" /></svg>}
                          </button>
                        ))}
                      </span>
                    </>
                  )}
                </span>
              )}
              <button
                className={`ask-tb mic${listening ? ' rec' : ''}`}
                type="button"
                title={listening ? '듣는 중 — 누르면 멈춥니다' : '음성으로 묻기'}
                disabled={exEdit}
                onClick={micToggle}
              >
                {listening ? '🔴' : '🎤'}
              </button>
              <button
                className={`ask-send2${text.trim() && !exEdit ? ' on' : ''}`}
                type="button"
                title="보내기 (Enter)"
                disabled={exEdit || !text.trim()}
                onClick={() => void submit()}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {/* 위 화살표(클로드의 보내기) — 옆 화살표는 「다음」 으로 읽힌다 */}
                  <path d="M12 19V6M6 12l6-6 6 6" />
                </svg>
              </button>
              </div>


              {/* 장비 고르개 — **표로 고른다**(지시: 목업).
                  이름만 늘어놓으면 같은 모델이 열 대씩 있는 LAB 에서 어느 것을
                  고를지 알 수 없다. 거르개(LAB·사업자·벤더·모델그룹)는 열 머리를
                  눌러 쓰고, 오른쪽 끝의 연결 상태가 지금 붙을 수 있는지 말한다. */}
              {devOpen && (
                <>
                  <span className="ask-modeback" onClick={() => setDevOpen(false)} />
                  {devPickUI(false)}
                                </>
              )}
            </div>

            {/* 모드 안내는 걷었다(지시) — 고르개가 같은 말을 이미 하고,
                부제도 갈래를 따라 바뀐다. 한 화면에서 같은 말이 세 번 나면
                어느 것이 지금 상태인지 되레 헷갈린다. */}

            {/* 오프너 — 눌러서 무엇을 시킬 수 있는지 안다.
                머리를 다는 까닭: 줄만 늘어놓으면 「이미 한 말」 인지 「눌러 보는
                보기」 인지 갈리지 않는다(목업). 고치는 중에는 편집 배지가 그
                몫을 하므로 달지 않는다. */}
            {!exEdit && examples.some((x) => x.q.trim() && !exHide.includes(x.q)) && (
              <div className="ask-opsh">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
                </svg>
                Suggested
              </div>
            )}
            <div className="ask-ops">
              {exEdit
                ? examples.map((x, i) => (
                    <div className="ask-oprow ed" key={i}>
                      <span className="ask-op-ic">✦</span>
                      <input
                        className="ask-op-in"
                        value={x.q}
                        placeholder="오프너 문구"
                        onChange={(e) => exSet(i, { q: e.target.value })}
                      />
                      <button
                        type="button"
                        className="ask-op-x on"
                        title="이 오프너 지우기"
                        onClick={() => exDel(i)}
                      >
                        ✕
                      </button>
                    </div>
                  ))
                : examples
                    .filter((x) => x.q.trim() && !exHide.includes(x.q))
                    .map((x, i) => (
                      <div className="ask-oprow" key={x.q || i}>
                        <button
                          type="button"
                          className="ask-op"
                          title={x.d || x.q}
                          onClick={() => {
                            /* 채워 넣기만 한다(지시) — 시작은 보내기 단추로.
                               바로 보내면 고쳐 물을 틈이 없다. */
                            setText(x.q)
                            askInRef.current?.focus()
                          }}
                        >
                          <span className="ask-op-ic">✦</span>
                          <span className="ask-op-tx">{x.q}</span>
                        </button>
                        <button
                          type="button"
                          className="ask-op-x"
                          title="이 오프너 숨기기 (내 화면에서만)"
                          onClick={() => setExHide((v) => [...v, x.q])}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
              {exEdit && (
                <button className="ask-opadd" type="button" onClick={exAdd}>
                  <span className="ask-op-ic plus">＋</span>오프너 추가
                </button>
              )}
              {!exEdit && exHide.length > 0 && (
                <button
                  className="ask-opshow"
                  type="button"
                  onClick={() => setExHide([])}
                >
                  숨긴 오프너 {exHide.length}개 다시 보기
                </button>
              )}
            </div>

            {/* 처음 온 사람에게 이 화면이 무엇을 하는지 — 누르는 것이 아니라
                말해 주는 줄이다(A안). 편집 중에는 자리를 오프너에 내준다. */}
            {!exEdit && (
              <div className="ask-cando">
                <small>COVERAGE AI 가 하는 일</small>
                <div className="ask-cando-row">
                  <span className="ask-cd t1">
                    <i>
                      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
                    </i>
                    기존 항목 실행
                  </span>
                  <span className="ask-cd t2">
                    <i>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" /></svg>
                    </i>
                    새 시험 만들기
                  </span>
                  <span className="ask-cd t3">
                    <i>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 19V9M10 19V5M16 19v-8M21 19H3" /></svg>
                    </i>
                    결과 분석
                  </span>
                </div>
              </div>
            )}
          </div>

          {err && <div className="ask-err">{err}</div>}

          {exEdit && (
            <div className="ask-edbar">
              <button
                className="btn"
                type="button"
                onClick={() =>
                  setExamples([
                    { q: 'E6100 시스템 정보 조회 시험해줘' },
                    { q: 'E6100 SNMP 시험해줘' },
                    { q: 'E6100 인터페이스 1번 shutdown 반복 시험 3회' },
                  ])
                }
              >
                기본값으로
              </button>
              <span className="sp" />
              {exSay && <span className="muted small">{exSay}</span>}
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setExamples(exBack.current.map((x) => ({ ...x })))
                  setExEdit(false)
                }}
              >
                취소
              </button>
              <button
                className="btn primary"
                type="button"
                onClick={() => {
                  void exSave().then((ok) => {
                    if (ok) setExEdit(false)
                  })
                }}
              >
                변경사항 저장
              </button>
            </div>
          )}
        </div>

      {/* 「설정 시험 허용」 스위치는 없앴다(지시: 그냥 생성되도록).
          만들기만으로는 장비에 아무것도 안 나간다 — 명령은 [실행] 을 눌렀을
          때만 나가므로, 사람이 절차를 보고 고른 뒤에 나간다. */}

      {/* 2열 ↔ 3열 사이 폭 조절 손잡이(지시) */}
      {twoPane && (
        <Resizer
          label="대화 폭 조절"
          onResize={setChatW}
          getOrigin={() => homeRef.current?.getBoundingClientRect().left ?? 0}
        />
      )}
      {/* ── 3열 · 아티팩트(지시: 클로드처럼) ──────────────────────
          맨 위는 슬롯 줄(경로·장비·실행 단추) — 이 기둥의 머리다.
          그 아래로 만드는 중 · 자세히 보기 판 · 절차가 갈아 든다. */}
      {twoPane && (
        <section className="ask-art">
        {/* 슬롯 줄 — 목업처럼 **머리 바로 아래**, 판들 바깥이다.
            판 안에 있으면 세 판의 머리 높이가 어긋난다(지적). */}
        {draft && (
        <div className="ask-slots">
          {/* 이 시험이 Coverage 트리의 **어디에 있는지**를 그대로 보여 준다
              (지시 사진) — 사업자 › 폴더 › 요구사항 › 시험 번호.
              누르면 그 자리로 간다. 장비는 오른쪽 끝 알약이 쥔다. */}
          <nav className="bcrumb" aria-label="경로">
            <span className="bc-root">Coverage</span>
            {(pathQ.data?.cats ?? []).map((c) => (
              <Fragment key={c.id}>
                <span className="bc-sep" aria-hidden="true">
                  ›
                </span>
                <span className="bc-a bc-plain">{c.name}</span>
              </Fragment>
            ))}
            {pathQ.data?.req && (
              <>
                <span className="bc-sep" aria-hidden="true">
                  ›
                </span>
                <a
                  className="bc-a"
                  href={gotoHref('req', pathQ.data.req.id)}
                  title="이 요구사항으로 갑니다"
                  onClick={(e) => gotoClick(e, 'req', pathQ.data?.req?.id ?? '')}
                >
                  {pathQ.data.req.title || pathQ.data.req.reqid}
                </a>
              </>
            )}
            <span className="bc-sep" aria-hidden="true">
              ›
            </span>
            {tcOf(draft) ? (
              <a
                className="bc-cur"
                href={gotoHref('tc', tcOf(draft))}
                title="Coverage 에서 이 시험을 엽니다"
                onClick={(e) => gotoClick(e, 'tc', tcOf(draft))}
              >
                {tcOf(draft)}
              </a>
            ) : (
              <span className="bc-cur">{draft.name}</span>
            )}
            {tcOf(draft) && draft.name && (
              <span className="bc-id" title={draft.name}>
                {draft.name}
              </span>
            )}
          </nav>
          {/* 실행 무리는 오른쪽 끝(지시) — 슬롯은 왼쪽, 하는 일은 오른쪽 */}
          <span className="sp" />
          {/* 어느 장비로 도는지는 늘 보여야 한다 — 누르면 바꾼다 */}
          <button
            type="button"
            className="btn small ask-devchip"
            title="다른 장비로 바꿉니다"
            onClick={() => {
              setPickSel(devId || usable[0]?.id || '')
              setPickLab('')
              setPickRack('')
              setPickDev({ model: '', cands: usable })
            }}
          >
            ▭ {curDev ? `${curDev.model || curDev.name || ''} · ${curDev.ip}` : '장비를 고르세요'}
          </button>
          {/* **여기부터**(지시) — 가운데서 깨졌을 때 처음부터 다시 돌리지 않게.
              엔진은 이미 구간을 받는다(run(only, from, to)), 단추만 없었다. */}
          {!running && stepAt > 0 && (
            <button
              className="btn small"
              type="button"
              disabled={!draft.steps.length || !devId}
              title={`고른 ${stepAt + 1}번 줄부터 끝까지 돌립니다`}
              onClick={() => void run(undefined, stepAt)}
            >
              ▶ 여기부터
            </button>
          )}
          {running ? (
            <button className="btn small" type="button" onClick={() => abortRef.current?.abort()}>
              ⏹ 멈추기
            </button>
          ) : (
            <button
              className="btn primary ask-runbig"
              type="button"
              disabled={!draft.steps.length || !devId}
              onClick={() => void run()}
            >
              {/* 다 돌린 뒤에도 「시험 시작」 이면 끝났는지 아직인지 모른다(지적) */}
              {ran && ran.some((x) => x && (x.status || x.repeatResult)) ? '▷ 다시 시험' : '▷ 시험 시작'}
            </button>
          )}
          {/* 결과는 파일로 남긴다(지시) — 시험으로 저장은 걷었다 */}
          {!running && (
            <>
              <button
                className="btn small"
                type="button"
                title="절차와 결과를 PDF 결과서로 저장합니다 — 미리보기가 먼저 뜹니다"
                onClick={() => setExpPrev('pdf')}
              >
                PDF 저장
              </button>
              <button
                className="btn small"
                type="button"
                title="고객사 양식(PPTX) 결과서로 저장합니다 — 미리보기가 먼저 뜹니다"
                onClick={() => setExpPrev('pptx')}
              >
                PPTX 저장
              </button>
            </>
          )}
          {/* 버리기 단추는 걷었다(지시) — 새 채팅이 그 몫을 한다 */}
        </div>
        )}
      {/* 만드는 중 — 첫 화면을 **치운다**.
          초안은 기준까지 다 채운 뒤에 나오므로 그때까지 이 자리가 빈다.
          질문 보기를 그대로 두면 다 만든 줄 모르고 다른 예시를 눌러 같은
          일이 두 번 시작된다(가져오기 중에는 busy 가 꺼져 있어 막히지도
          않았다). 지금 무엇을 하고 있는지만 보인다. */}
      {!draft && making && (
        <div className="ask-making">
          <h1>
            <span className="ask-spin" aria-hidden="true" />
            AI 생성 중…
          </h1>
          <p className="muted">
            {asked.trim() ? `“${asked.trim()}”` : '고른 시험 항목으로 절차를 짓는 중입니다'}
          </p>
          <div className="ask-mksay">
            <i />
            <span>{genSay || '만드는 중…'}</span>
            {elapsed > 4 && <em className="muted">{elapsed}초째</em>}
          </div>
          {/* 절차가 지어졌으면 **그것을 보여 준다.** 레일에는 스텝이 다 찼는데
              여기만 회색 뼈대면 「스텝이 안 만들어졌다」 로 보인다(지적) — 실은
              기준을 잡느라 몇 초에서 몇십 초가 걸리는 참이다. */}
          {built && built.steps.length > 0 ? (
            <ol className="ask-mkstep">
              {built.steps.map((x, i) => (
                <li key={i}>
                  <i>{i + 1}</i>
                  <span>
                    <b>{x.desc || x.cli}</b>
                    {x.cli && x.desc ? <code>{x.cli}</code> : null}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <div className="ask-skel" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div className="ask-skelrow" key={i}>
                  <b />
                  <em />
                </div>
              ))}
            </div>
          )}
          <p className="ask-note muted small">
            {built && built.steps.length > 0 ? (
              <>
                절차 <b>{built.steps.length}스텝</b> 은 다 나왔습니다. 지금은 <b>판정 기준</b> 을 잡는
                중입니다 — 다 채우면 이 절차가 고칠 수 있는 꼴로 열립니다.
              </>
            ) : (
              <>
                <b>판정 기준</b> 까지 채운 뒤에 절차가 한 번에 나옵니다.
              </>
            )}
          </p>
        </div>
      )}

      {/* ── 오른쪽 · 자세히 보기 판(목업 「Test AI 시험 콘솔」) ──────────
          1·2단계의 표가 여기 선다. 절차(draft)·생성 중(making)은 저희 판이
          이 자리를 그대로 차지하므로 그때는 나서지 않는다. */}
      {twoPane && !draft && !making && (
        <section className="askp" aria-label="자세히 보기">
          <header className="askp-hd">
            <span className="askp-ic" aria-hidden="true">
              {pane === 'dev' ? '🖧' : pane === 'tc' ? '☰' : '▤'}
            </span>
            <div className="askp-tt">
              <b>{pane === 'dev' ? '장비 고르기' : pane === 'tc' ? '시험 항목 고르기' : '자세히 보기'}</b>
              <span>
                {pane === 'dev'
                  ? '점유·통신 상태를 함께 봅니다 — 줄을 누르면 그 장비로 정해집니다'
                  : pane === 'tc'
                    ? `${curDev ? `${devName} 에서 돌릴 항목` : '고른 장비에서 돌릴 항목'} — 줄을 누르면 절차를 짓습니다`
                    : '대화가 진행되면 여기에 표·절차·로그가 뜹니다'}
              </span>
            </div>
            {pane && (
              <span className="askp-stage">{pane === 'dev' ? '1단계 · 장비' : '2단계 · 항목'}</span>
            )}
          </header>
          <div className="askp-body">
            {pane === 'dev' ? (
              <div className="askp-fill">{devPickUI(true)}</div>
            ) : pane === 'tc' ? (
              <div className="askp-fill ask-likewrap">{tcPickBody(true)}</div>
            ) : (
              <div className="askp-empty">
                <i aria-hidden="true">▤</i>
                왼쪽에서 시험을 말로 요청하면
                <br />
                장비 표 · 시험 항목 · 실행 로그가 여기에 열립니다
              </div>
            )}
          </div>
        </section>
      )}

      {draft && (
        <div className="ask-plan">
          {(draft.cut?.length ?? 0) > 0 && (
            <div className="ask-drop">
              조회가 아닌 명령 {draft.cut?.length}개는 뺐습니다 — {draft.cut?.join(' · ')}
            </div>
          )}

          {/* 왼쪽 스텝 목록 · 오른쪽 그 스텝의 속(명령·기준·응답).
              위아래로 두면 응답을 보려고 내리는 순간 고치던 칸이 사라진다. */}
          {/* 목업 그대로 — 한 판 안에서 왼쪽 목록 · 조절바 · 오른쪽 세부.
              둘 다 Coverage(TC 화면)와 **같은 부품**이라 꼴이 한 벌이다. */}
          {runView ? (
            /* ── 실행 응답 화면(지시: 사이클 자동 실행처럼) ─────────────
               상태 밴드 · 진행 막대 · 왼쪽 스텝 큐 · 오른쪽 큰 실행 로그.
               편집 세 판은 「절차·상세 보기」 로 돌아가면 그대로 있다. */
            <div className="askr">
              {(() => {
                const doneN = (ran ?? []).filter(
                  (r) => r && (r.executed_at || r.output || r.status || r.repeatResult),
                ).length
                /* 주석(Comment·Message)은 실행 대상이 아니다 — 전체 수에 넣으면
                   다 돌고도 「중단됨」 이 된다(6/12 꼴) */
                const runnableN = seqSteps.filter((s3) => {
                  const k = String(s3.kind ?? '')
                  return k !== 'comment' && k !== 'message'
                }).length
                const pass = (ran ?? []).filter(
                  (r) => String(r?.repeatResult ?? r?.status ?? '').toLowerCase() === 'pass',
                ).length
                const fail = (ran ?? []).filter(
                  (r) => String(r?.repeatResult ?? r?.status ?? '').toLowerCase() === 'fail',
                ).length
                const mmss = `${String(Math.floor(runSec / 60)).padStart(2, '0')}:${String(runSec % 60).padStart(2, '0')}`
                return (
                  <>
                    <div className={`askr-band${running ? '' : ' done'}`}>
                      {running && <span className="askr-dot" aria-hidden="true" />}
                      <b>
                        {running
                          ? at >= 0
                            ? `실행 중 — 스텝 ${stripNos[at] || at + 1}`
                            : '실행 중'
                          : doneN > 0
                            ? '실행 끝'
                            : '실행 준비 — ▷ 시험 시작을 누르세요'}
                      </b>
                      <span className="askr-meta">
                        {doneN}/{runnableN} 스텝 · 경과 {mmss}
                        {curDev && ` · ${devName} · ${devIp}`}
                      </span>
                      <span className="sp" />
                      {running ? (
                        <button className="btn small" type="button" onClick={() => abortRef.current?.abort()}>
                          ⏹ 멈추기
                        </button>
                      ) : mode === 'adv' ? (
                        /* 편집은 Advanced 의 일이다 — General 은 읽기 전용이라
                           response 화면만 쓴다(지시) */
                        <button
                          className="btn small"
                          type="button"
                          title="스텝 표·상세 편집 화면으로 돌아갑니다 — 결과와 로그는 남습니다"
                          onClick={() => setRunView(false)}
                        >
                          ↩ 절차·상세 보기
                        </button>
                      ) : null}
                    </div>
                    <div className="askr-prog" aria-hidden="true">
                      <span
                        style={{
                          width: `${runnableN ? Math.round((doneN / runnableN) * 100) : 0}%`,
                        }}
                      />
                    </div>
                    {/* Response 판 — 사이클 자동 실행 화면과 **한 몸**(지시).
                        스텝 카드(명령·판정 기준·변수·RCA·출력 강조)가 그대로 선다. */}
                    <div className="askr-resp">
                      <RespView
                        steps={autoSteps}
                        stepAt={stepAt}
                        onStep={setStepAt}
                        dut={devName}
                        runStep={running ? at : null}
                        seedKey={draft.object || draft.name}
                      />
                    </div>
                    {!running && (doneN > 0 || pass > 0 || fail > 0) && (
                      <div className="askr-sum">
                        {fail > 0 ? (
                          <b className="askr-sum-v fail">✗ FAIL</b>
                        ) : doneN >= runnableN && pass > 0 ? (
                          <b className="askr-sum-v pass">✓ PASS</b>
                        ) : (
                          <b className="askr-sum-v">{doneN > 0 ? '중단됨' : '실행 없음'}</b>
                        )}
                        <span className="status pass">Pass {pass}</span>
                        <span className="status fail">Fail {fail}</span>
                        <span className="muted small">미실행 {Math.max(0, runnableN - doneN)}</span>
                        <span className="sp" />
                        <span className="muted small">{runSec}s</span>
                        {mode === 'adv' && (
                          <button className="btn small" type="button" onClick={() => setRunView(false)}>
                            ↩ 절차·상세 보기
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )
              })()}
            </div>
          ) : (
          <div className="ask-two railbox">
            <section className="railsec" data-sec="steps">
              <div className="railsec-b">
                <div className="tc-inner">
                  <section className="panel tc-seqcol" style={{ flexBasis: seqW }} ref={seqRef}>
                    <div className="tc-title">
                      {/* 한 건이면 번호를 세우고, 여러 건이면 「고른 시험 n건」
                          한 마디로 족하다(지시) */}
                      {draft.object && /^TC-/i.test(draft.object) && (
                        <>
                          <span className="tc-tid">{draft.object}</span>
                          <span className="tc-title-div" aria-hidden="true" />
                        </>
                      )}
                      <b title={draft.name}>{draft.name}</b>
                      <span className="sp" />
                      {(() => {
                        const done = (ran ?? []).filter((r) => r && (r.repeatResult || r.status)).length
                        const pass = (ran ?? []).filter(
                          (r) => String(r?.repeatResult ?? r?.status ?? '').toLowerCase() === 'pass',
                        ).length
                        const fail = (ran ?? []).filter(
                          (r) => String(r?.repeatResult ?? r?.status ?? '').toLowerCase() === 'fail',
                        ).length
                        if (!done)
                          return <span className="muted small">{draft.steps.length} 스텝</span>
                        return (
                          <span className="muted small">
                            {done}/{draft.steps.length} · <b className="status pass">PASS {pass}</b> ·{' '}
                            <b className="status fail">FAIL {fail}</b>
                          </span>
                        )
                      })()}
                    </div>
                    {(() => {
                      /*
                       * 여러 시험을 이어 붙였으면 **시험마다 카드**로 나눈다
                       * (지시 사진). 카드 하나가 곧 한 시험이라
                       *   · 번호가 그 시험 안에서 1 부터 다시 매겨지고,
                       *   · 머리에 그 시험의 셈과 ▶(그 시험만 돌리기)이 서고,
                       *   · 접으면 통째로 숨는다.
                       * 목록 부품은 그대로 쓰고 **자리 번호만 옮겨 준다** —
                       * 고르기·실행이 전부 원본 자리로 돌아가야 한다.
                       */
                      const heads = seqSteps
                        .map((x, i) => (x.head ? i : -1))
                        .filter((i) => i >= 0)
                      /* 「일반」 은 있는 시험을 **그대로 도는** 갈래라 고치지
                         않는다(지시) — 고칠 것이 있으면 Coverage 에서 고친다 */
                      const ro = mode === 'basic'
                      const seq = (from: number, to: number, addable: boolean) => (
                        <TcSequence
                          /* 이 판에는 목록이 시험마다 하나씩 여럿 뜬다 —
                             머리줄을 켜면 묶음마다 서고 전부 sticky 라
                             스크롤할 때 서로 겹친다 */
                          head={false}
                          /* 판정◎·결과서▤·로그☰ 칸은 걷는다(지시) — 이 화면엔
                             결과서도 판정 편집도 없어 늘 죽은 칸이었다 */
                          slim
                          steps={seqSteps.slice(from, to)}
                          selected={stepAt >= from && stepAt < to ? stepAt - from : -1}
                          onSelect={(i) => setStepAt(from + i)}
                          onAdd={(k) => addStep(k)}
                          sessionName={() => devName || '장비'}
                          runningAt={at >= from && at < to ? at - from : -1}
                          picked={new Set([...picked].filter((i) => i >= from && i < to).map((i) => i - from))}
                          onPick={(i) =>
                            setPicked((v) => {
                              const n = new Set(v)
                              const g = from + i
                              if (n.has(g)) n.delete(g)
                              else n.add(g)
                              return n
                            })
                          }
                          onRun={running || !devId ? undefined : (i) => void run(from + i)}
                          hide={addable ? undefined : (x) => !!x.head}
                          readOnly={ro}
                        />
                      )
                      if (heads.length < 2) return seq(0, seqSteps.length, true)
                      return (
                        <div className="ask-grps">
                          {heads.map((h, gi) => {
                            const from = h + 1
                            const to = heads[gi + 1] ?? seqSteps.length
                            const mine = (ran ?? []).slice(from, to)
                            const done = mine.filter((r) => r && (r.repeatResult || r.status)).length
                            const pass = mine.filter(
                              (r) => String(r?.repeatResult ?? r?.status ?? '').toLowerCase() === 'pass',
                            ).length
                            const fail = mine.filter(
                              (r) => String(r?.repeatResult ?? r?.status ?? '').toLowerCase() === 'fail',
                            ).length
                            const hd = seqSteps[h]
                            const open = !foldGrp.has(h)
                            return (
                              <section className={`ask-grp${open ? '' : ' folded'}`} key={h}>
                                <div className="ask-grph">
                                  <button
                                    type="button"
                                    className="ask-grpcar"
                                    aria-label={open ? '접기' : '펼치기'}
                                    onClick={() =>
                                      setFoldGrp((v) => {
                                        const n = new Set(v)
                                        if (n.has(h)) n.delete(h)
                                        else n.add(h)
                                        return n
                                      })
                                    }
                                  >
                                    {open ? '▾' : '▸'}
                                  </button>
                                  <i className="ask-grpn">{gi + 1}</i>
                                  <b className="ell" title={hd?.step ? `${hd.text} · ${hd.step}` : hd?.text}>
                                    {hd?.text || hd?.step || '시험'}
                                  </b>
                                  <span className="sp" />
                                  <span className="muted small">
                                    {done}/{to - from}
                                    {done > 0 && (
                                      <>
                                        {' · '}
                                        <b className="status pass">PASS {pass}</b>
                                        {fail > 0 && (
                                          <>
                                            {' · '}
                                            <b className="status fail">FAIL {fail}</b>
                                          </>
                                        )}
                                      </>
                                    )}
                                  </span>
                                  <button
                                    type="button"
                                    className="ask-grprun"
                                    title="이 시험만 돌립니다"
                                    disabled={running || !devId}
                                    onClick={() => void run(undefined, from, to)}
                                  >
                                    ▶
                                  </button>
                                </div>
                                {open && seq(from, to, gi === heads.length - 1)}
                              </section>
                            )
                          })}
                        </div>
                      )
                    })()}
                    {/* **고른 줄 띠**(지시) — 체크는 그려지는데 그 다음에 누를
                        단추가 없어서 여러 줄 고르기가 아무 일도 안 했다.
                        목록 **아래**에 둔다: 위에 두면 띠가 서는 순간 방금 누른
                        칸이 손 밑에서 아래로 달아난다. */}
                    {picked.size > 0 && (
                      <div className="ask-sqbulk">
                        <b>스텝 {picked.size}개</b>
                        <span className="sp" />
                        <button
                          className="btn small primary"
                          type="button"
                          disabled={running || !devId}
                          title="고른 줄 중 첫 줄부터 끝까지 돌립니다"
                          onClick={() => void run(undefined, Math.min(...picked))}
                        >
                          ▶ 고른 것만
                        </button>
                        <button className="btn small" type="button" onClick={() => setPicked(new Set())}>
                          해제
                        </button>
                      </div>
                    )}
                  </section>

                  <Resizer
                    label="스텝 목록 폭 조절"
                    onResize={setSeqW}
                    getOrigin={() => seqRef.current?.getBoundingClientRect().left ?? 0}
                  />

                  <section className={`panel tc-detcol${termOpen ? ' wide' : ''}`}>
                    <div className="tc-colh">
                      <b>{termOpen ? '명령어 캡쳐' : '스텝 상세'}</b>
                      <span className="sp" />
                      {mode !== 'basic' && (
                      <button
                        className={`btn tc-dots tc-termbtn${termOpen ? ' on' : ''}`}
                        type="button"
                        aria-pressed={termOpen}
                        disabled={!devId}
                        title={
                          termOpen
                            ? '명령어 캡쳐 닫기'
                            : '명령어 캡쳐 — 장비에 붙어 명령을 치면 그대로 스텝이 됩니다'
                        }
                        onClick={() => setTermOpen((v) => !v)}
                      >
                        <IconCli />
                      </button>
                      )}
                    </div>
                    {/* ── 스텝 상태 띠(지시) ────────────────────────────────
                        스텝이 수십 개면 어디까지 돌았고 어디서 깨졌는지 표를
                        끝까지 긁어야 안다. 부품(.sc-strip)은 Coverage 가 쓰는
                        그것이고 CSS 도 이미 있다 — 새로 짓지 않는다.

                        번호는 **표가 매긴 것**을 그대로 쓴다. 여기서 i+1 로 새로
                        세면 주석이 번호를 안 먹는 표와 어긋나, 「스텝 5」 를 눌러
                        놓고 표에서는 1.1 을 찾게 된다. */}
                    {!termOpen && seqSteps.length > 1 && (
                      <div className="sc-strip tc-strip">
                        <span className="sc-strip-lab">스텝</span>
                        {seqSteps.map((s2, i) => {
                          const no = stripNos[i] || ''
                          const v = stepVerdict((ran?.[i] ?? s2) as TcStep)
                          const def = resDefs.find((r) => r.v === v)
                          const done = !!ran?.[i]?.executed_at || !!ran?.[i]?.output
                          const now = i === at
                          const cls = now ? 'now' : def ? 'def' : v ? 'part' : done ? 'ran' : ''
                          const sty =
                            !now && def?.color
                              ? { background: def.color, borderColor: def.color, color: def.fg || '#fff' }
                              : undefined
                          return (
                            <button
                              key={i}
                              type="button"
                              style={sty}
                              className={`sc-seg ${cls}${i === stepAt ? ' on' : ''}`}
                              title={`스텝 ${no || '주석'} · ${
                                now ? '진행 중' : def?.label || v || (done ? '실행함(판정 없음)' : '미실행')
                              }`}
                              onClick={() => setStepAt(i)}
                            >
                              {no || '·'}
                            </button>
                          )
                        })}
                      </div>
                    )}
                    {termOpen && devId && mode !== 'basic' ? (
                      <TcTerminal
                        sessions={[devId]}
                        devById={new Map(devices.map((d) => [d.id, d]))}
                        sessionNames={[devName || devIp || '장비']}
                        onAdd={(t) => addTcStep(t)}
                        onClose={() => setTermOpen(false)}
                      />
                    ) : (
                      <TcStepDetail
                        step={seqSteps[stepAt] ?? null}
                        index={stepAt}
                        total={seqSteps.length}
                        sessions={[`${devName || '장비'}${devIp ? ` (${devIp})` : ''}`]}
                        params={{
                          values: {},
                          items: [],
                          loading: false,
                          empty: '이 화면에는 전역 파라미터가 없습니다',
                        }}
                        takenVars={[]}
                        onChange={(p) => setTcStep(stepAt, p)}
                        onMove={(dir) => moveTcStep(stepAt, dir)}
                        onRemove={() => removeTcStep(stepAt)}
                        onDuplicate={() => dupTcStep(stepAt)}
                        onRun={running || !devId ? undefined : () => void run(stepAt)}
                        readOnly={mode === 'basic'}
                        loopVar={loopVarAt(seqSteps, stepAt)}
                      />
                    )}
                  </section>

                  {/* ── 셋째 칸 · 실행 로그 ─────────────────────────────────
                      장비가 실제로 무엇을 뱉었는지 **원문**을 보는 자리다.
                      여태 이 화면만 로그를 버리고 있어서, 판정이 틀렸을 때
                      까닭을 확인할 길이 없었다(지적).

                      부품은 Coverage 가 쓰는 RunLog 를 그대로 쓴다 — 머리줄도
                      빈 문구도 그 안에 이미 있다. 새로 짓지 않는다. */}
                  {/* 이 판은 **오른쪽 끝**에 붙어 있으므로 폭이 거꾸로다 —
                      손잡이를 왼쪽으로 끌수록 넓어진다. Resizer 는 늘
                      `clientX - origin` 을 주므로 기준을 이 판의 오른쪽 모서리로
                      잡고 부호를 뒤집는다. 화면 폭으로 셈하면 오른쪽에 여백이
                      있을 때 손잡이와 판이 어긋난다. */}
                  <Resizer
                    label="실행 로그 폭 조절"
                    onResize={(x) => setLogW(-x)}
                    getOrigin={() => logRef.current?.getBoundingClientRect().right ?? 0}
                  />
                  <section
                    className="panel tc-logcol"
                    style={{ flexBasis: logW, width: logW }}
                    ref={logRef}
                  >
                    <RunLog
                      lines={logs}
                      /* 번호는 **표가 매긴 것**을 쓴다 — 로그가 1,2,3 으로 새로
                         세면 표의 1.3.1 을 찾을 길이 없다 */
                      nos={stripNos}
                      only={logOnly}
                      onOnly={setLogOnly}
                      onClear={() => setLogs([])}
                      onPick={(i) => {
                        if (i >= 0) setStepAt(i)
                      }}
                    />
                  </section>
                </div>
              </div>
            </section>
          </div>
          )}
        </div>
      )}
        </section>
      )}
          </main>

          </div>
        </div>
          {/* 아래 고정 입력줄은 걷었다(목업) — 대화 기둥의 캡슐이 그 몫을 한다 */}
      </div>

      {/* ⓪ 어느 모델의 시험인가 — 항목보다 먼저 고른다(지시) */}
      {pickModelOpen && (() => {
        /* 모델은 **등록된 장비**에서 온다(지시) — 「공용」 이라는 모델은 없다.
           시험 건수는 그 모델로 못 박힌 항목만 센다. */
        const cnt = new Map<string, number>()
        for (const d of usable) {
          const m = String(d.model ?? '').trim()
          if (m && !cnt.has(m)) cnt.set(m, 0)
        }
        for (const t of tcAll) {
          const m = String(t.model ?? '').trim()
          if (m) cnt.set(m, (cnt.get(m) ?? 0) + 1)
        }
        /* 말에서 읽은 모델이 있으면 **맨 앞**에 세운다(지시) */
        const rows = [...cnt.entries()]
          .filter(([m]) => m)
          .sort((a, b) => {
            const am = a[0] === askModel ? 1 : 0
            const bm = b[0] === askModel ? 1 : 0
            if (am !== bm) return bm - am
            return b[1] - a[1] || a[0].localeCompare(b[0], 'ko')
          })
        const devsOf = (m: string) =>
          usable.filter((d) => String(d.model ?? '').trim().toLowerCase() === m.toLowerCase()).length
        const go = (m: string) => {
          setAskModel(m)
          setPickModelOpen(false)
          setTcOnlyModel(!!m)
          setTcFind('')
          setTcPick(new Set())
          setFlowLog((v) => [...v, { s: 1, t: m ? `모델 ${m} 로 고름` : '공용 항목에서 고름' }])
          setLikeAsk(true)
        }
        return (
          <div className="modal-back" onMouseDown={cancelAsk}>
            <div
              className="modal ask-modelmodal"
              role="dialog"
              aria-modal="true"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="modal-head">
                <div>
                  <b>어느 모델의 시험인가요?</b>
                  <div className="muted small">
                    모델을 고르면 그 모델의 시험 항목만 보여 드립니다.
                  </div>
                </div>
                <span className="sp" />
                <button className="modal-x" type="button" onClick={cancelAsk}>
                  ✕
                </button>
              </div>
              <div className="ask-modellist">
                {rows.map(([m, n]) => (
                  <button
                    key={m}
                    type="button"
                    className={`ask-modelcard${m === askModel ? ' on' : ''}`}
                    onClick={() => go(m)}
                  >
                    <b>{m}</b>
                    <span className="muted small">시험 {n}건</span>
                    <em className={devsOf(m) ? 'ok' : 'no'}>
                      {devsOf(m) ? `장비 ${devsOf(m)}대` : '장비 없음'}
                    </em>
                  </button>
                ))}
                {rows.length === 0 && (
                  <div className="empty">Coverage 에 시험 항목이 없습니다.</div>
                )}
              </div>
              <div className="modal-foot">
                <span className="muted small">
                  랩에 등록된 장비의 모델입니다 — 고르면 그 모델의 시험 항목만 보여 드립니다.
                </span>
                <span className="sp" />
                <button className="btn small" type="button" onClick={cancelAsk}>
                  그만두기
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ① 같은 모델이 여러 대 — 어느 장비로 보낼지 고른다 */}
      {pickDev && (() => {
        const find = pickFind.trim().toLowerCase()
        const rows = pickDev.cands.filter((d) => {
          const at = rackMap.get(d.id)
          if (pickLab && (at?.lab ?? '') !== pickLab) return false
          if (pickRack && (at?.rack ?? '') !== pickRack) return false
          if (!find) return true
          /* 한 칸으로 다 훑는다 — 장비가 수십 대면 눈으로 찾는 것이 일이다 */
          const hay = [d.name, d.model, d.ip, d.vendor, d.role, at?.lab, at?.rack]
            .map((v) => String(v ?? '').toLowerCase())
            .join(' ')
          return find.split(/\s+/).every((w) => hay.includes(w))
        })
        const labs = [...new Set(pickDev.cands.map((d) => rackMap.get(d.id)?.lab ?? '').filter(Boolean))]
        const racks = [...new Set(pickDev.cands.map((d) => rackMap.get(d.id)?.rack ?? '').filter(Boolean))]
        // 「구역 · 랙」 으로 묶어 보여준다 — 같은 모델은 이름만으로 안 갈린다
        const groups = new Map<string, Device[]>()
        for (const d of rows) {
          const at = rackMap.get(d.id)
          const key = at ? `${at.lab} · ${at.rack}` : '자리 미지정'
          groups.set(key, [...(groups.get(key) ?? []), d])
        }
        return (
          <div className="modal-back" onMouseDown={cancelAsk}>
            <div
              className="modal ask-pick"
              role="dialog"
              aria-modal="true"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="modal-head">
                <div>
                  <b>
                    {pickDev.model
                      ? `${pickDev.model} 이(가) ${pickDev.cands.length}대 있어요`
                      : '어느 장비로 시험할까요?'}
                  </b>
                  <div className="muted small">
                    {pickDev.model
                      ? '어느 장비로 보낼지 골라 주세요.'
                      : '말에 모델 이름이 없어서 여쭙습니다 — 고른 장비로 명령이 나갑니다.'}
                  </div>
                </div>
                <span className="sp" />
                <input
                  className="ask-pickfind"
                  value={pickFind}
                  autoFocus
                  placeholder="찾기 — 이름 · 모델 · IP · 구역 · 랙"
                  onChange={(e) => setPickFind(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape' && pickFind) {
                      e.stopPropagation()
                      setPickFind('')
                    }
                  }}
                />
                {pickFind && (
                  <span className="muted small ask-pickn">{rows.length}대</span>
                )}
                <button className="modal-x" type="button" onClick={cancelAsk}>
                  ✕
                </button>
              </div>
              <div className="ask-pickbody">
                <aside className="ask-pickside">
                  <div className="ask-pickgrp">구역</div>
                  <button className={`ask-pickf${pickLab === '' ? ' on' : ''}`} type="button" onClick={() => setPickLab('')}>
                    전체 구역<i>{pickDev.cands.length}</i>
                  </button>
                  {labs.map((l) => (
                    <button key={l} className={`ask-pickf${pickLab === l ? ' on' : ''}`} type="button" onClick={() => setPickLab(l)}>
                      {l}
                      <i>{pickDev.cands.filter((d) => rackMap.get(d.id)?.lab === l).length}</i>
                    </button>
                  ))}
                  <div className="ask-pickgrp">랙</div>
                  <button className={`ask-pickf${pickRack === '' ? ' on' : ''}`} type="button" onClick={() => setPickRack('')}>
                    전체 랙<i>{pickDev.cands.length}</i>
                  </button>
                  {racks.map((r3) => (
                    <button key={r3} className={`ask-pickf${pickRack === r3 ? ' on' : ''}`} type="button" onClick={() => setPickRack(r3)}>
                      {r3}
                      <i>{pickDev.cands.filter((d) => rackMap.get(d.id)?.rack === r3).length}</i>
                    </button>
                  ))}
                </aside>
                <div className="ask-picklist">
                  {[...groups.entries()].map(([g, ds]) => (
                    <div key={g}>
                      <div className="ask-pickgh">
                        {g} <i>{ds.length}대</i>
                      </div>
                      <div className="ask-pickcards">
                        {ds.map((d) => {
                          const at = rackMap.get(d.id)
                          return (
                            <button
                              key={d.id}
                              type="button"
                              className={`ask-pickcard${pickSel === d.id ? ' on' : ''}`}
                              onClick={() => setPickSel(d.id)}
                              onDoubleClick={() => {
                                setDevId(d.id)
                                setPickDev(null)
                                if (afterPick) {
                                  const ap = afterPick
                                  setAfterPick(null)
                                  void takeTc(ap.tcid, d, ap.model)
                                  return
                                }
                                /* Advanced 는 고르는 갈래가 아니다 — 장비가
                                   정해졌으니 바로 짓는다(지시) */
                                if (mode === 'adv') {
                                  void makePlan(asked, d)
                                  return
                                }
                                setAskModel(String(d.model ?? ''))
                                setTcOnlyModel(true)
                                void findLike(asked, d).then(() => {
                                  setTcFind('')
                                  const fd = foldOf(asked, String(d.model ?? ''))
                                  setTcFold(fd)
                                  setQFold(fd)
                                  setTcOpen(openFor(fd))
                                  if (fd)
                                    setFlowLog((v) => [
                                      ...v,
                                      {
                                        s: 1,
                                        t: `Coverage 트리의 「${tcTree.find((n) => n.id === fd)?.name ?? ''}」 를 폄`,
                                      },
                                    ])
                                  setLikeAsk(true)
                                })
                              }}
                            >
                              {/* 장비명이 주인공 — 이름이 없으면 모델을 세운다.
                                  IP 는 아래 한 번만(전에는 제목과 두 번 나왔다) */}
                              <b>{d.name || d.model || d.ip}</b>
                              <span>
                                {d.role ? <i className="r">{d.role}</i> : null}
                                {at ? (
                                  <i className="p">
                                    {at.lab} · {at.rack}
                                    {at.pos ? ` · ${at.pos}U` : ''}
                                  </i>
                                ) : null}
                              </span>
                              <em className="ask-pickip">{d.ip}</em>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                  {rows.length === 0 && (
                    <div className="empty">
                      {find ? `「${pickFind.trim()}」 에 맞는 장비가 없습니다.` : '고른 조건에 맞는 장비가 없습니다.'}
                    </div>
                  )}
                </div>
              </div>
              <div className="modal-foot">
                <span className="muted small">장비를 누르고 「이 장비로 시험 만들기」 를 누르세요.</span>
                {/* 단추는 한 묶음 — 안 묶으면 space-between 이 둘 사이를 벌린다 */}
                <span className="ask-footbtns">
                <button className="btn small" type="button" onClick={cancelAsk}>
                  그만두기
                </button>
                <button
                  className="btn primary small"
                  type="button"
                  disabled={!pickSel}
                  onClick={() => {
                    setDevId(pickSel)
                    const d2 = pickDev.cands.find((x) => x.id === pickSel)
                    setFlowLog((v) => [
                      ...v,
                      { s: 1, t: '그중에서 고름' },
                      { s: 1, t: `보낼 장비 ${d2?.ip ?? ''} 확정` },
                    ])
                    setFlowVals(
                      [
                        // 말에 모델이 없어 물어본 때는 고른 장비의 모델을 적는다
                        { k: '모델', v: pickDev.model || String(d2?.model ?? '') },
                        { k: '대상', v: d2?.ip ?? '' },
                      ].filter((x) => x.v),
                    )
                    setPickDev(null)
                    /* 무엇으로 정했는지 대화에 남긴다(지시: 목업) — 창이 닫히고
                       나면 어느 장비로 갔는지 화면 어디에도 안 남았다. */
                    say(
                      'a',
                      `<p class="ln"><b>${hesc(String(d2?.model || d2?.name || ''))} (${hesc(String(d2?.ip ?? ''))})</b> 로 정했습니다.</p>`,
                    )
                    /* 항목을 먼저 고른 뒤 장비를 물은 것이면 그 항목으로 잇는다(지시) */
                    if (afterPick) {
                      const ap = afterPick
                      setAfterPick(null)
                      void takeTc(ap.tcid, d2, ap.model)
                      return
                    }
                    if (mode === 'adv') {
                      void makePlan(asked, d2)
                      return
                    }
                    say(
                      'a',
                      '<p class="ln"><b>2단계 · 시험 항목 고르기</b><br>' +
                        `<b>${hesc(String(d2?.model || d2?.name || ''))}</b> 에서 돌릴 수 있는 항목만 추려 두었습니다. ` +
                        '목록에서 하나를 고르면 바로 절차를 짓습니다.</p>' +
                        '<button type="button" class="btnsm js-picktc">🔍 시험 항목 고르기</button>',
                    )
                    setAskModel(String(d2?.model ?? pickDev.model ?? ''))
                    setTcOnlyModel(true)
                    void findLike(asked, d2).then(() => {
                      setTcFind('')
                      const fd = foldOf(asked, String(d2?.model ?? pickDev.model ?? ''))
                      setTcFold(fd)
                      setQFold(fd)
                      setTcOpen(openFor(fd))
                      if (fd)
                        setFlowLog((v) => [
                          ...v,
                          {
                            s: 1,
                            t: `Coverage 트리의 「${tcTree.find((n) => n.id === fd)?.name ?? ''}」 를 폄`,
                          },
                        ])
                      setLikeAsk(true)
                    })
                  }}
                >
                  이 장비로 시험 만들기
                </button>
                </span>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ② 시험 항목 고르기 — **Coverage 에 있는 항목에서만** 고른다.
             없는 항목을 지어내지 않는다(지시). 말과 비슷한 것을 위에 올려
             주고, 그 아래로 전체를 찾아볼 수 있게 둔다. */}
      {likeAsk && (
        <div className="modal-back" onMouseDown={cancelAsk}>
          <div
            className="modal ask-likemodal"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <b>어느 시험 항목으로 할까요?</b>
                <div className="muted small">
                  고르면 그 항목의 절차를 <b>{askModel || curDev?.model || '고른 장비'}</b> 에 맞춰
                  옮겨 줍니다.
                  <button
                    type="button"
                    className="ask-likeall"
                    onClick={() => {
                      setLikeAsk(false)
                      setPickModelOpen(true)
                    }}
                  >
                    모델 바꾸기
                  </button>
                </div>
              </div>
              <span className="sp" />
              <button className="modal-x" type="button" onClick={cancelAsk}>
                ✕
              </button>
            </div>
            {tcPickBody(false)}
          </div>
        </div>
      )}
    </div>
  )
}
