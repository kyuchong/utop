import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/api/client'
import { IconSettings } from '@/components/icons'
import { connParams } from '@/components/tc/device'
import { runSteps } from '@/components/tc/runner'
import type { TcStep } from '@/components/tc/types'
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
   * Coverage·사이클과 **같은 것**을 같은 실행기에 그대로 넘긴다.
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


/** 제안 하나 — 눌러서 그대로 판정기준이 된다 */
interface Suggest {
  label: string
  type: string
  criteria: string
}

/**
 * 받은 출력에서 판정기준을 **제안**한다.
 *
 * 누구나 쓰는 도구인데 판정기준은 기술자만 안다 — 이것이 학습 곡선의
 * 본체다. `contains` 가 뭔지, 무슨 문구를 적어야 하는지 알아야 하니까.
 *
 * 그래서 사람에게 묻지 않고 **출력을 보고 만들어 준다.** 장비 출력은
 * 대개 `항목 : 값` 꼴이라 그대로 판정이 된다.
 *
 *     Model Name : E5010-24C   →  「모델명이 E5010-24C 인가」
 *     Main Memory Size : 1 GB  →  「메모리가 1 GB 인가」
 *
 * AI 를 부르지 않는다. 즉시 뜨고, 늘 같은 답을 내고, 틀려도 눈에 보인다.
 */
function suggest(output: string): Suggest[] {
  const out: Suggest[] = []
  const seen = new Set<string>()
  for (const raw of String(output ?? '').split(/\r?\n/)) {
    const line = raw.trim()
    // `항목 : 값` — 콜론 앞뒤에 글자가 있어야 한다
    const m = /^([A-Za-z][A-Za-z0-9 _./#-]{2,30}?)\s*:\s*(\S.*)$/.exec(line)
    if (!m) continue
    const key = (m[1] ?? '').trim()
    const val = (m[2] ?? '').trim()
    // 시각·프롬프트처럼 돌 때마다 바뀌는 것은 기준이 될 수 없다
    if (!val || val.length > 40) continue
    if (/^\d{1,2}:\d{2}/.test(val) || /\b(19|20)\d\d\b/.test(val)) continue
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ label: `${key} 가 ${val}`, type: 'contains', criteria: val })
    if (out.length >= 6) break
  }
  return out
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
 */
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
  const [mode, setMode] = useState<'basic' | 'adv'>(() =>
    localStorage.getItem('utop.ai.mode') === 'basic' ? 'basic' : 'adv',
  )
  useEffect(() => {
    localStorage.setItem('utop.ai.mode', mode)
  }, [mode])
  const [devId, setDevId] = useState('')
  const [err, setErr] = useState('')
  /** 돌린 결과 — 스텝마다 판정과 출력 */
  const [ran, setRan] = useState<TcStep[] | null>(null)
  const [at, setAt] = useState(-1)
  const [running, setRunning] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  /** 출력에서 끌어 놓은 글자 — 판정기준으로 삼는다 */
  const [grab, setGrab] = useState<{ i: number; text: string } | null>(null)
  /** 첫 화면 질문 보기 — 무엇을 시킬 수 있는지 눌러서 안다 */
  const [examples, setExamples] = useState<Array<{ q: string; d?: string }>>([])
  /** 비슷한 기존 시험 — 새로 짓기 전에 있는 것부터 본다 */
  const [like, setLike] = useState<Array<{ tcid: string; name: string; model?: string; steps?: number }>>([])
  const [adopting, setAdopting] = useState('')
  /** 질문 보기 고치기 — 관리자만. ⚙ 로 켠다 */
  const [exEdit, setExEdit] = useState(false)
  const [exSay, setExSay] = useState('')
  const [amAdmin, setAmAdmin] = useState(false)
  /** 같은 모델이 여러 대일 때 — 어느 장비로 보낼지 고르는 창 */
  /** 오른쪽에 펼쳐 볼 스텝 */
  const [stepAt, setStepAt] = useState(0)
  /** 작업 흐름에 남기는 기록 — 질문한 뒤부터 쌓이고, 만들어지면 그대로 남는다 */
  /** 담을 때 쓰는 지금 값 — 상태는 한 박자 늦어 마지막 줄이 빠진다 */
  const flowRef = useRef<Array<{ s: number; t: string }>>([])
  /** 한 일 한 줄 — `s` 는 **어느 단계의 일인가**.
   *  이걸 안 달면 모든 줄이 1단계(장비 선택) 밑에 쌓여 지금 어디를 하는지
   *  알 수 없다(지적). */
  const [flowLogRaw, setFlowLogRaw] = useState<Array<{ s: number; t: string }>>([])
  const flowLog = flowLogRaw
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
  const [flowValsRaw, setFlowValsRaw] = useState<Array<{ k: string; v: string }>>([])
  const flowVals = flowValsRaw
  const setFlowVals = (
    up: Array<{ k: string; v: string }> | ((v: Array<{ k: string; v: string }>) => Array<{ k: string; v: string }>),
  ) =>
    setFlowValsRaw((v) => {
      const n = typeof up === 'function' ? up(v) : up
      valsRef.current = n
      return n
    })
  /** 지금 도는 단계 (0 = 안 돎) — 흐름 칸이 이걸로 「진행 중」 을 보인다 */
  const [flowAt, setFlowAt] = useState(0)
  /** 이 대화의 id — 최근 목록에 남길 때 쓴다 */
  const [chatId, setChatId] = useState('')
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
  const [pickSel, setPickSel] = useState('')
  const [pickLab, setPickLab] = useState('')
  const [pickRack, setPickRack] = useState('')
  /** 시험 항목 고르는 창 — Coverage 의 항목 중에서 고른다 */
  const [likeAsk, setLikeAsk] = useState(false)
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
    }>
  >([])
  /** Coverage 와 같은 트리 — 마디 하나 */
  const [tcTree, setTcTree] = useState<
    Array<{ id: string; name: string; kind: 'cat' | 'req'; depth: number; parent: string }>
  >([])
  /** 창에서 고른 트리 마디 id. 빈 글자면 전부 */
  const [tcFold, setTcFold] = useState('')
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
  const [tcOnlyModel, setTcOnlyModel] = useState(false)
  /** 접어 둔 단계 — 다 끝난 단계는 접어 치울 수 있다 */
  const [fold, setFold] = useState<Set<number>>(new Set())
  /** 랙 자리(구역·랙) — 어느 장비인지 고를 때 자리로 가른다 */
  const [rackMap, setRackMap] = useState<Map<string, { lab: string; rack: string; pos?: number }>>(
    new Map(),
  )

  const usable = devices.filter((d) => d.role !== '계측기')

  /**
   * 작업 흐름 — 이 시험이 어느 단계를 거치나.
   *
   * 옮겨 온 화면이 늘 다섯 단계로 말한다(장비 선택 · 포트 연결 · 트래픽 설정 ·
   * 트래픽 확인 · 생성 완료). 트래픽이 없는 시험은 가운데 셋을 건너뛰므로,
   * **건너뛴 까닭까지** 함께 적는다 — 왜 안 하는지 모르면 빠진 것처럼 보인다.
   */
  const wantsTraffic = (q: string) =>
    /트래픽|계측기|손실|대역|rate|bps|throughput|스트림|부하/i.test(q)
  const stages = (q: string, made: boolean) => {
    const tr = wantsTraffic(q)
    return [
      { n: 1, name: '장비 선택', skip: '' },
      { n: 2, name: '포트 연결', skip: tr ? '' : '한 대만 보는 시험이라 건너뜁니다' },
      { n: 3, name: '트래픽 설정', skip: tr ? '' : '트래픽이 없어 건너뜁니다' },
      { n: 4, name: '트래픽 확인', skip: tr ? '' : '트래픽이 없어 건너뜁니다' },
      { n: 5, name: '생성 완료', skip: '', done: made },
    ]
  }

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
  const findLike = async (q: string, dev?: Device): Promise<number> => {
    if (!q.trim()) {
      setLike([])
      return 0
    }
    try {
      const picked = dev ?? usable.find((x) => x.id === devId)
      const r = await apiFetch(
        `/api/ai/nl-tc-like?text=${encodeURIComponent(q.trim())}&model=${encodeURIComponent(picked?.model ?? '')}`,
      )
      const b = (await r.json()) as {
        ok?: boolean
        items?: Array<{ tcid: string; name: string; model?: string; steps?: number }>
      }
      const items = b.ok && Array.isArray(b.items) ? b.items.slice(0, 3) : []
      setLike(items)
      return items.length
    } catch {
      setLike([])
      return 0
    }
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
  const takeTc = async (tcid: string, dev?: Device) => {
    const t0 = performance.now()
    setAdopting(tcid)
    setErr('')
    setFlowAt(5)
    setFlowLog((v) => [...v, { s: 5, t: `${tcid} 를 여는 중…` }])
    try {
      const picked = dev ?? usable.find((x) => x.id === devId) ?? usable[0]
      const r = await apiFetch(`/api/tc/${encodeURIComponent(tcid)}`)
      if (!r.ok) throw new Error('시험을 불러오지 못했습니다')
      const b = (await r.json()) as { name?: string; object_md?: string; checks?: TcStep[] }
      const raw = (b.checks ?? []) as TcStep[]
      /* 보여 주기용 줄 — 한 줄도 버리지 않는다. 종류를 몰라도 그대로 세운다 */
      const shown: DraftStep[] = raw.map((x) => ({
        desc: String(x.step ?? '').trim(),
        cli: String(x.cli ?? x.data ?? ''),
        kind: typeof x.kind === 'string' ? x.kind : 'cli',
        type: x.type ?? undefined,
        criteria: typeof x.criteria === 'string' ? x.criteria : undefined,
        indent: typeof x.indent === 'number' ? x.indent : undefined,
        session: typeof x.session === 'number' ? x.session : 0,
        oid: typeof x.oid === 'string' ? x.oid : undefined,
        cmpLeft: typeof x.cmpLeft === 'string' ? x.cmpLeft : undefined,
        cmpRight: typeof x.cmpRight === 'string' ? x.cmpRight : undefined,
        cmpOp: typeof x.cmpOp === 'string' ? x.cmpOp : undefined,
      }))
      setFlowLog((v) => [
        ...v.filter((x) => !x.t.endsWith('를 여는 중…')),
        { s: 5, t: `${tcid} 를 그대로 실었습니다 — ${raw.length}스텝 (고치지 않음)` },
      ])
      setFitNotes([])
      setFlowVals((v) => [...v.filter((x) => x.k !== '가져온 TC'), { k: '실은 TC', v: tcid }])
      setStepAt(0)
      const d2: Draft = { name: b.name || tcid, object: tcid, steps: shown, raw }
      instantRef.current = false
      setBuilt(d2)
      setDevId(picked?.id ?? '')
      await holdMaking(t0)
      setDraft(d2)
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
      const r = await apiFetch('/api/ai/nl-plan', {
        method: 'POST',
        body: JSON.stringify({ text: say, model: picked?.model ?? '' }),
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
   * 물어보다 **그만둠** — 창을 닫고 흐름도 처음으로 되돌린다.
   *
   * 여태 창만 닫아서, 아무것도 안 만들었는데 「1단계 진행 중」 과 한 일 몇 줄이
   * 그대로 남았다(지적). 적은 말은 그대로 둔다 — 고쳐서 다시 보내면 된다.
   */
  const cancelAsk = () => {
    setText(asked)      // 비워 둔 말을 돌려준다 — 고쳐서 다시 보내는 자리다
    setPickDev(null)
    setLikeAsk(false)
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
      const notes: string[] = []
      let got = 0
      for (const tcid of ids) {
        const r = await apiFetch('/api/ai/nl-tc-adopt', {
          method: 'POST',
          body: JSON.stringify({ tcid, device_id: picked?.id ?? '', model: picked?.model ?? '' }),
        })
        const b = (await r.json()) as {
          ok?: boolean
          title?: string
          steps?: DraftStep[]
          tc?: { notes?: string[] }
        }
        if (!b.ok || !Array.isArray(b.steps) || b.steps.length === 0) continue
        got++
        steps.push({
          kind: 'comment',
          indent: 0,
          desc: b.title || tcid,
          text: b.title || tcid,
          cli: '',
          head: true,   // 여기서부터 다른 시험이다 — 목록에서 띠로 세운다
        })
        steps.push(...b.steps)
        for (const n of b.tc?.notes ?? []) if (!notes.includes(n)) notes.push(n)
      }
      if (got === 0) throw new Error('고른 항목에서 옮길 스텝이 없습니다')
      setFlowLog((v) => [
        ...v.filter((x) => !x.t.endsWith('가져오는 중…')),
        { s: 5, t: `${got}건을 가져와 이 장비(${picked?.model ?? ''})로 옮김 — 스텝 ${steps.length}개` },
      ])
      setFitNotes(notes)
      setFlowVals((v) => [...v.filter((x) => x.k !== '가져온 TC'), { k: '가져온 TC', v: `${got}건` }])
      setStepAt(0)
      const d2: Draft = { name: `고른 시험 ${got}건`, object: '', steps }
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
  const foldOf = (q: string): string => {
    const flat = (v: string) => v.toLowerCase().replace(/[^0-9a-z가-힣]+/g, '')
    const t = flat(q)
    if (!t) return ''
    let best = '',
      bestDeep = -1
    for (const nd of tcTree) {
      const f = flat(nd.name)
      if (f.length < 2) continue
      const hit = t.includes(f) || (f.length >= 4 && t.includes(f.slice(0, 4)))
      if (!hit) continue
      // 더 깊은 마디가 이긴다 — 「E6100 SNMP」 면 뿌리(E6100)보다 SNMPv2
      if (nd.depth > bestDeep) {
        best = nd.id
        bestDeep = nd.depth
      }
    }
    return best
  }

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

  /** 적은 말에서 모델 이름을 찾아 그 모델 장비들을 모은다 */
  /**
   * 말에서 **찾을 낱말**만 뽑는다 — 「E6100 SNMP 시험해줘」 면 `SNMP`.
   *
   * 장비 이름은 이미 위에서 장비를 짚는 데 썼고, 「시험해줘」 같은 군말은
   * 항목 이름에 없다. 그대로 넣으면 한 건도 안 걸린다.
   * 걸리는 항목이 없으면 빈 칸으로 둔다 — 빈 목록이 전체 목록보다 나쁘다.
   */
  const keyOf = (q: string, model?: string): string => {
    let t = q
    if (model) t = t.replace(new RegExp(model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' ')
    t = t
      .replace(/시험\s*해\s*줘|시험해줘|시험\s*해\s*줄래|만들어\s*줘|알려\s*줘|보여\s*줘|해\s*줘|해줘|좀|시험|점검/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (!t) return ''
    const low = t.toLowerCase()
    const anyHit = tcAll.some(
      (x) =>
        x.name.toLowerCase().includes(low) ||
        x.tcid.toLowerCase().includes(low) ||
        x.model.toLowerCase().includes(low),
    )
    return anyHit ? t : ''
  }

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
    const said = (q ?? text).trim()
    if (!said || busy) return
    // 보낸 말은 그 자리에서 비운다 — 만드는 동안 입력칸에 남아 있으면 아직
    // 안 보낸 것처럼 보인다(지적). 그만두거나 어긋나면 되돌려 놓는다.
    setText('')
    setAsked(said)
    setFlowLog([{ s: 1, t: `요청의 말을 읽었습니다 — "${said.slice(0, 40)}"` }])
    setFlowVals([])
    setFitNotes([])
    setFlowAt(1)
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
    setTcFind(keyOf(said, hit?.model))
    setTcPick(new Set())
    const fold = foldOf(said)
    setTcFold(fold)
    setTcOpen(openTo(fold))
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
   * TC 화면·사이클과 같은 실행기(`runSteps`)를 쓴다. 판정 규칙이 한 곳에만
   * 있어야 여기서 적합인 것이 저기서 부적합이 되지 않는다.
   *
   * 저장하지 않고 돌린다 — 말로 시켜 본 것이 다 시험으로 남으면 목록이
   * 금세 쓰레기가 된다. 쓸 만하면 그때 저장한다.
   */
  const run = async (only?: number) => {
    if (!draft || !devId) return
    const ac = new AbortController()
    abortRef.current = ac
    // 초안의 갈래를 그대로 살린다 — 뭉개면 되풀이·조건·계측기가 사라진다.
    // 판정기준은 **칩**으로 넣는다(우리 판정 체계) — 옛 type/criteria 도 함께
    // 남겨 두어 옛 화면에서 열어도 읽힌다.
    /* 「일반」 갈래는 원본을 그대로 넘긴다 — 옮겨 적는 순간 무언가 빠진다 */
    const steps: TcStep[] = draft.raw?.length
      ? draft.raw
      : draft.steps.map((s) => {
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
    })
    setRan(steps.slice())
    setRunning(true)
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
          onLog: () => {},
          signal: ac.signal,
        },
        typeof only === 'number' ? only : 0,
        typeof only === 'number',
      )
    } finally {
      setRunning(false)
      setAt(-1)
    }
  }

  /** 쓸 만하면 진짜 시험으로 남긴다 */
  const save = async () => {
    if (!draft) return
    const tcid = window.prompt('시험 ID', `NL-${Date.now().toString().slice(-8)}`)
    if (!tcid?.trim()) return
    try {
      const r = await apiFetch(`/api/tc/${encodeURIComponent(tcid.trim())}`, {
        method: 'POST',
        body: JSON.stringify({
          tcid: tcid.trim(),
          name: draft.name,
          object_md: draft.object ?? '',
          sessions: [devId],
          checks: (ran ?? []).map((s) => ({ ...s })),
        }),
      })
      if (!r.ok) throw new Error(String(r.status))
      window.alert(`「${draft.name}」 을 시험으로 저장했습니다.`)
    } catch {
      window.alert('저장하지 못했습니다')
    }
  }

  /**
   * 스텝 한 줄 고치기.
   *
   * 「일반」 갈래는 **원본(raw)** 이 그대로 실행기로 간다. 화면 줄만 고치면
   * 고친 값이 실행에 안 간다 — 원본에도 같이 얹는다. 이름이 다른 칸은
   * 여기서 맞춘다(desc → step).
   */
  const setStep = (i: number, patch: Partial<DraftStep>) =>
    setDraft((d) => {
      if (!d) return d
      const steps = d.steps.map((s, j) => (j === i ? { ...s, ...patch } : s))
      if (!d.raw?.length) return { ...d, steps }
      const raw = d.raw.map((x, j) => {
        if (j !== i) return x
        const y: TcStep = { ...x }
        if (patch.desc !== undefined) y.step = patch.desc
        if (patch.cli !== undefined) y.cli = patch.cli
        if (patch.criteria !== undefined) y.criteria = patch.criteria
        if (patch.type !== undefined) y.type = patch.type
        if (patch.oid !== undefined) y.oid = patch.oid
        if (patch.host !== undefined) y.host = patch.host
        if (patch.cmpLeft !== undefined) y.cmpLeft = patch.cmpLeft
        if (patch.cmpRight !== undefined) y.cmpRight = patch.cmpRight
        if (patch.cmpOp !== undefined) y.cmpOp = patch.cmpOp
        return y
      })
      return { ...d, steps, raw }
    })

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
  const flow = stages(asked || text || draft?.name || '', !!draft)

  return (
    /* 세 칸 + 아래 입력줄 — 옮겨 온 화면의 짜임을 우리 꼴(panel·btn·토큰)로 다시 그렸다.
       왼쪽 기록 · 가운데 작업 흐름 · 오른쪽 캔버스, 입력은 흐름부터 오른쪽 끝까지. */
    <div className="ask">
      {/* 왼쪽 「새 시험 만들기 · 최근」 칸은 걷어냈다(지시) — 첫 화면이
          한가운데에 서야 해서, 옆에 칸이 있으면 그만큼 밀린다. */}

      <div className="ask-main">
        {/* 맨 위 줄 — 지금 무엇을 하고 있나(목업). 일이 시작된 뒤에만 뜬다.
            물어본 말을 늘 곁에 두어야 「내가 뭘 시켰더라」 를 안 잊는다. */}
        {(draft || making) && (
          <div className="ask-top">
            <b className="ask-top-t">AI 자연어 시험</b>
            <span className={`ask-top-b${mode === 'adv' ? ' adv' : ''}`}>
              {mode === 'adv' ? 'Advanced · 시험 만들기' : 'General · 시험 실행'}
            </span>
            {asked && <span className="ask-top-q" title={asked}>{asked}</span>}
            <span className="sp" />
            <button
              className="btn small"
              type="button"
              title="첫 화면으로 돌아갑니다 — 만든 절차는 버려집니다"
              onClick={() => {
                setDraft(null)
                setBuilt(null)
                setRan(null)
                setAsked('')
                setErr('')
              }}
            >
              처음으로
            </button>
          </div>
        )}
        {/* 슬롯 줄 — 목업처럼 **머리 바로 아래**, 판들 바깥이다.
            판 안에 있으면 세 판의 머리 높이가 어긋난다(지적). */}
        {draft && (
        <div className="ask-slots">
          {/* 대상 장비 — 목업의 첫 슬롯. select 한 줄이 아니라 카드다.
              무엇으로 도는지가 실행 단추 옆에 늘 있어야 한다. */}
          <button
            type="button"
            className="ask-slot"
            title="다른 장비로 바꿉니다"
            onClick={() => {
              setPickSel(devId || usable[0]?.id || '')
              setPickLab('')
              setPickRack('')
              setPickDev({ model: '', cands: usable })
            }}
          >
            <span className="ask-slot-ic" aria-hidden="true">
              ▭
            </span>
            <span className="ask-slot-tx">
              <small>대상 장비</small>
              <b>{curDev ? `${curDev.name || curDev.model || ''} · ${curDev.ip}` : '장비를 고르세요'}</b>
            </span>
            <span className="ask-slot-ch">바꾸기</span>
          </button>
          <span className="ask-slot-arw" aria-hidden="true">
            ›
          </span>
          {/* 일반 갈래 — 지금 실린 시험이 무엇인지 늘 보이고, 눌러 바꾼다
              (목업의 슬롯 줄). 고급 갈래에는 없는 자리다 — 거기선 방금 지은
              것이 곧 이 초안이다. */}
          {mode === 'basic' && (
            <button
              type="button"
              className="ask-slot"
              title="다른 시험으로 바꿉니다"
              onClick={() => setLikeAsk(true)}
            >
              <span className="ask-slot-ic" aria-hidden="true">
                ◈
              </span>
              <span className="ask-slot-tx">
                <small>시험 항목</small>
                <b>{draft.object || draft.name}</b>
              </span>
              <span className="ask-slot-ch">바꾸기</span>
            </button>
          )}
          {/* 실행 무리는 오른쪽 끝(지시) — 슬롯은 왼쪽, 하는 일은 오른쪽 */}
          <span className="sp" />
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
              ▷ 시험 시작
            </button>
          )}
          {ran && !running && (
            <button className="btn small" type="button" onClick={() => void save()}>
              시험으로 저장
            </button>
          )}
          <button
            className="btn small"
            type="button"
            onClick={() => {
              setDraft(null)
              setRan(null)
            }}
          >
            버리기
          </button>
        </div>
        )}
        <div className="ask-cols">
          {/* 작업 흐름 — 무엇을 거치는지, 건너뛰면 왜 건너뛰는지 */}
          {/* 작업 흐름 — 아직 아무 일도 없으면 빈 판이라 첫 화면을 좁힐 뿐이다 */}
          {(draft || making) && (
          <section className="ask-rail">
            <div className="ask-rail-head">
              <b>작업 흐름</b>
              <em className="muted small">
                {flowAt > 0
                  ? `${flowAt}단계 진행 중`
                  : draft
                    ? '절차 준비됨'
                    : '대기 중'}
              </em>
            </div>
            {/* 질문하기 전에는 안내만. 물어보면 그때부터 **한 일**이 쌓이고,
                만들어지면 그 기록이 그대로 남는다(지적). */}
            {flowLog.length === 0 ? (
              <p className="ask-rail-say muted small">
                흐름은 항상 5단계입니다 — 장비 선택 · 포트 연결 · 트래픽 설정 · 트래픽 확인 ·
                생성 완료.
                <br />
                무엇을 시험할지 적으면 여기에 진행 상황이 쌓입니다.
              </p>
            ) : (
              <div className="ask-stages">
                {flow.map((st) => {
                  const first = st.n === 1
                  const last = st.n === 5
                  /* 이 단계가 지금 어떤가 — 도는 중·끝남·건너뜀·아직.
                     한꺼번에 다 켜 두면 어디까지 왔는지 알 수 없다(지적). */
                  const state = st.skip
                    ? 'skip'
                    : flowAt === st.n
                      ? 'run'
                      : last
                        ? draft
                          ? 'done'
                          : 'wait'
                        : first
                          ? flowAt > 1 || draft || flowVals.length > 0
                            ? 'done'
                            : 'run'
                          : 'wait'
                  const on = state === 'done' || state === 'run'
                  /* 이 단계의 일만 골라 온다 — 줄마다 단계를 달아 두었다 */
                  const mine = flowLog.filter((l) => l.s === st.n)
                  /* 마지막 줄이 「…중…」 이면 그게 지금 도는 일이다.
                     그 줄만 살아 움직이고, 나머지는 ✔ 로 굳는다. */
                  const runAt = mine.length - 1
                  const running = state === 'run' && (mine[runAt]?.t ?? '').endsWith('중…')
                  const body = last && plan5 ? true : mine.length > 0
                  const folded = fold.has(st.n)
                  return (
                    <div
                      key={st.n}
                      className={`ask-stage ${state}${on ? ' on' : ''}`}
                    >
                      <div className="ask-stagehd">
                        <i>{state === 'done' ? '✔' : st.n}</i>
                        <b>{st.name}</b>
                        <span className="sp" />
                        {state === 'skip' && <em className="ask-stageskip">건너뜀</em>}
                        {state === 'run' && <em className="ask-stagerun">● 진행 중</em>}
                        {state === 'done' && !body && <em className="ask-stagedone">완료</em>}
                        {state === 'done' && body && (
                          <button
                            type="button"
                            className="ask-stagefold"
                            onClick={() =>
                              setFold((v) => {
                                const n2 = new Set(v)
                                if (n2.has(st.n)) n2.delete(st.n)
                                else n2.add(st.n)
                                return n2
                              })
                            }
                          >
                            {folded ? '펴기' : '접기'}
                          </button>
                        )}
                      </div>
                      {st.skip ? (
                        <div className="ask-stagesay">{st.skip}</div>
                      ) : folded || !body ? null : (
                        <div className="ask-stagebody">
                          {/* ✔ 줄은 한 자리에 모은다. 가져오며 바꾼 것도 「한 일」
                              이다 — 정한 값을 사이에 끼우면 ✔ 가 두 토막이 난다
                              (지적). */}
                          {(mine.length > 0 || (last && rev > 0 && notes5.length > 0)) && (
                            <>
                              <div className="ask-stagesay">한 일</div>
                              {/* 끝난 줄 → 굳은 사실 → **도는 줄은 맨 아래.**
                                  가운데 끼면 다음 일이 벌써 끝난 것처럼 읽힌다 */}
                              <ul className="ask-did">
                                {mine.map((l, k) =>
                                  running && k === runAt ? null : (
                                    <li key={k}>
                                      <i>✔</i>
                                      <span>{l.t}</span>
                                    </li>
                                  ),
                                )}
                                {last &&
                                  notes5.slice(0, rev).map((n, k) => (
                                    <li key={`n${k}`}>
                                      <i>✔</i>
                                      <span>{n}</span>
                                    </li>
                                  ))}
                                {running && (
                                  <li className="now">
                                    <i />
                                    <span>{genSay || mine[runAt]?.t}</span>
                                  </li>
                                )}
                              </ul>
                            </>
                          )}
                          {first && flowVals.length > 0 && (
                            <>
                              <div className="ask-stagesay">정한 값</div>
                              {flowVals.map((v) => (
                                <div className="ask-val" key={v.k}>
                                  <i>{v.k}</i>
                                  <code>{v.v}</code>
                                </div>
                              ))}
                            </>
                          )}
                          {/* 5단계는 만들어진 것을 그대로 편다 — 무엇이 몇 개
                              나왔고 어떤 명령이 들었는지 여기서 다 보인다 */}
                          {last && plan5 && (
                            <>
                              <div className="ask-stagesay">정한 값</div>
                              <div className="ask-fact">
                                절차 <b>{plan5.steps.length}스텝</b> · 판정 기준{' '}
                                <b>{plan5.steps.filter((x) => (x.criteria ?? '').trim()).length}개</b>
                              </div>
                              <div className="ask-fact">
                                단계 <b>{flow.filter((f2) => !f2.skip).length}개 사용</b> ·{' '}
                                {flow.filter((f2) => !!f2.skip).length}개 건너뜀
                              </div>
                              {done5 && rev > notes5.length && (
                                <>
                                  <div className="ask-stagesay">
                                    만든 스텝 {Math.min(rev - notes5.length, plan5.steps.length)}
                                    {rev < revTotal ? ` / ${plan5.steps.length}` : '개'}
                                  </div>
                                  <ol className="ask-mini">
                                    {plan5.steps.slice(0, rev - notes5.length).map((x, k) => (
                                      <li key={k}>
                                        <i>{k + 1}</i>
                                        <code>
                                          {x.cli ||
                                            x.oid ||
                                            (x.kind === 'diff'
                                              ? `${x.cmpLeft ?? ''} ${x.cmpOp || '=='} ${x.cmpRight ?? ''}`.trim()
                                              : '') ||
                                            x.desc ||
                                            '—'}
                                        </code>
                                      </li>
                                    ))}
                                  </ol>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
          )}

          <div className={`ask-canvaswrap${draft ? ' plan' : ''}`}>
          <main className={`ask-canvas${draft ? ' plan' : ''}`}>

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

      {/* 첫 화면 — 무엇을 시킬 수 있나. 예시가 없으면 사람은 아무것도 못 친다 */}
      {!draft && !making && (
        <div className="ask-hero">
          <h1>무엇을 시험할까요?</h1>
          <p className="ask-lead">장비 이름과 확인하고 싶은 것을 평소 말하듯 적어주세요.</p>
          {/* 첫 화면의 입력은 **여기 크게** 있다(목업) — 아래 고정 줄은
              일이 시작된 뒤에 나온다. 두 군데 다 두면 어디에 적는지 헷갈린다. */}
          <div className="ask-bigin">
            <input
              className="ask-bigin-in"
              value={text}
              placeholder={
                mode === 'basic'
                  ? '예: E6100 시스템 정보 조회 시험해줘'
                  : '예: E6100 1번 포트에 1G 부하 걸어서 손실 없는지 보는 시험 만들어줘'
              }
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return
                if (e.key === 'Enter') void submit()
              }}
            />
            <button
              className={`ask-bigsend${mode === 'adv' ? ' adv' : ''}`}
              type="button"
              title="보내기 (Enter)"
              disabled={!text.trim()}
              onClick={() => void submit()}
            >
              ➤
            </button>
          </div>
          {/* 무엇을 하러 왔나 — 두 갈래(목업 v9). 고른 갈래는 기억한다.
              일반은 **이미 있는 시험**을 골라 그대로 돌리고, 고급은 없는
              시험을 말로 짓는다. 짓는 쪽이 여태 이 화면이 하던 일이다. */}
          <div className="ask-modes">
            <button
              type="button"
              className={`ask-mode${mode === 'basic' ? ' on' : ''}`}
              onClick={() => setMode('basic')}
            >
              <span className="ask-moder" aria-hidden="true" />
              <b>General — 시험 실행</b>
              <p>이미 만들어진 시험 항목을 찾아 그대로 실행합니다.</p>
              <em>명령을 몰라도 됩니다. 누구나.</em>
            </button>
            <button
              type="button"
              className={`ask-mode adv${mode === 'adv' ? ' on' : ''}`}
              onClick={() => setMode('adv')}
            >
              <span className="ask-moder" aria-hidden="true" />
              <b>Advanced — 시험 만들기</b>
              <p>없는 시험을 새로 만듭니다. 스텝마다 명령과 판정 기준을 정합니다.</p>
              <em>장비를 아는 사람이.</em>
            </button>
          </div>
          {/* 예시 — 무엇을 시킬 수 있는지 눌러서 안다. 관리자는 ⚙ 로 고친다 */}
          <div className="ask-exline">
            {!exEdit && (
              <div className="ask-chips">
                {examples.map((x, i) => (
                  <button
                    key={x.q || i}
                    type="button"
                    className="ask-chip"
                    title={x.d || x.q}
                    onClick={() => void submit(x.q)}
                  >
                    {x.q}
                  </button>
                ))}
              </div>
            )}
            {amAdmin && (
              <div className="ask-extools">
                {exSay && <span className="muted small">{exSay}</span>}
                {exEdit && (
                  <button
                    className="btn small"
                    type="button"
                    onClick={() => {
                      void exSave().then((ok) => {
                        if (ok) setExEdit(false)
                      })
                    }}
                  >
                    저장
                  </button>
                )}
                <button
                  className={`ask-exgear${exEdit ? ' on' : ''}`}
                  type="button"
                  title={exEdit ? '고치기 끝내기' : '질문 보기 고치기 (관리자)'}
                  onClick={() => {
                    if (exEdit) void exSave()
                    setExEdit((v) => !v)
                  }}
                >
                  <IconSettings />
                </button>
              </div>
            )}
          </div>
          {/* 고치는 중에는 칩이 아니라 적는 칸이다 — 칸이 넓어야 고칠 수 있다 */}
          {examples.map((x, i) =>
            exEdit ? (
              <div className="ask-exedit" key={i}>
                <div className="ask-execol">
                  <input
                    value={x.q}
                    placeholder="예) E6100 rate limit 시험해줘"
                    onChange={(e) => exSet(i, { q: e.target.value })}
                  />
                </div>
                <button type="button" className="ask-exdel" title="지우기" onClick={() => exDel(i)}>
                  ✕
                </button>
              </div>
            ) : null,
          )}
          {exEdit && (
            <button type="button" className="ask-exadd" onClick={exAdd}>
              ＋ 질문 추가
            </button>
          )}
        </div>
      )}

      {/* 「설정 시험 허용」 스위치는 없앴다(지시: 그냥 생성되도록).
          만들기만으로는 장비에 아무것도 안 나간다 — 명령은 [실행] 을 눌렀을
          때만 나가므로, 사람이 절차를 보고 고른 뒤에 나간다. */}

      {err && <div className="ask-err">{err}</div>}

      {draft && (
        <div className="ask-plan">
          {(draft.cut?.length ?? 0) > 0 && (
            <div className="ask-drop">
              조회가 아닌 명령 {draft.cut?.length}개는 뺐습니다 — {draft.cut?.join(' · ')}
            </div>
          )}

          {/* 왼쪽 스텝 목록 · 오른쪽 그 스텝의 속(명령·기준·응답).
              위아래로 두면 응답을 보려고 내리는 순간 고치던 칸이 사라진다. */}
          <div className="ask-two">
            {/* 세 판이 같은 높이에서 시작한다 — 머리 줄을 판마다 하나씩 */}
            {/* Coverage(TC 화면)의 스텝 목록과 **같은 모양**으로 읽힌다(지시
                사진) — 세션 딱지 · 번호(1 · 1.1) · 종류 · 내용 · 결과.
                주석은 실행되지 않는 제목 줄이라 따로 칠한다. */}
            <div className="ask-pane">
              <div className="ask-paneh">
                <h3>시험 스텝</h3>
                <span className="ask-pill">{draft.steps.length} 스텝</span>
                <span className="sp" />
                <span className="muted small">누르면 오른쪽에서 설정</span>
              </div>
            <div className="ask-steplist">
              {(() => {
                // 들여쓴 만큼 번호를 나눈다 — 1, 1.1, 1.2, 2 …
                const cnt: number[] = []
                /* 묶음 경계 — 머리 줄마다 그 아래가 한 시험이다.
                   여러 건을 이어 붙이면 스텝이 한 줄로 뭉쳐 어디부터 어느
                   시험인지 알 수 없다(지적). 머리는 띠로 세우고, 지금 도는
                   묶음은 통째로 짚는다. */
                const heads = draft.steps
                  .map((x, k) => (x.head ? k : -1))
                  .filter((k) => k >= 0)
                const groupOf = (k: number) => {
                  let g = -1
                  for (const h of heads) if (h <= k) g = h
                  return g
                }
                const runGrp = at >= 0 ? groupOf(at) : -1
                const grpSize = (h: number) => {
                  const nx = heads.find((x) => x > h)
                  return (nx ?? draft.steps.length) - h - 1
                }
                return draft.steps.map((s, i) => {
                  if (s.head) {
                    // 묶음 머리 — 번호를 먹지 않는다. 아래 스텝이 1 부터다
                    cnt.length = 0
                    return (
                      <div
                        key={i}
                        className={`ask-sgrp${runGrp === i ? ' on' : ''}${stepAt === i ? ' sel' : ''}`}
                        onClick={() => setStepAt(i)}
                      >
                        <b>{s.desc || s.text}</b>
                        <em>{grpSize(i)}스텝</em>
                        {runGrp === i && <var>● 도는 중</var>}
                      </div>
                    )
                  }
                  const d = Math.max(0, Number(s.indent) || 0)
                  cnt.length = d + 1
                  cnt[d] = (cnt[d] ?? 0) + 1
                  const no = cnt.slice(0, d + 1).map((n) => n || 1).join('.')
                  const rs = ran?.[i]
                  const v = String(rs?.repeatResult ?? rs?.status ?? '').trim()
                  const cls = at === i ? 'run' : v.toLowerCase() === 'fail' ? 'fail' : v ? 'pass' : ''
                  const k = String(s.kind || 'cli')
                  const isNote = k === 'comment' || k === 'message'
                  const label =
                    isNote ? 'Comment'
                    : k === 'inst' || k === 'instrument' ? '계측기'
                    : k === 'wait' ? 'Wait'
                    : k === 'loop' || k === 'for' ? 'Loop'
                    : k === 'if' ? 'If'
                    : k === 'snmp_get' ? 'SNMP Get'
                    : k === 'snmp_set' ? 'SNMP Set'
                    : k === 'snmp_trap' ? 'SNMP Trap'
                    : k === 'ping' ? 'Ping'
                    : k === 'diff' ? 'Diff'
                    : k === 'manual' ? '수동'
                    : k === 'map' ? 'Map'
                    : k === 'connect' ? '세션 열기'
                    : k === 'disconnect' ? '세션 닫기'
                    : k === 'model' ? '모델'
                    : k === 'group' ? '묶음'
                    : k === 'call' ? '다른 시험'
                    : k === 'variable' ? '변수'
                    : k === 'switch' || k === 'else' || k === 'elif' ? '갈림길'
                    : 'CLI'
                  const body = isNote
                    ? s.desc || s.text || ''
                    : k === 'snmp_get' || k === 'snmp_set' || k === 'snmp_trap'
                      ? s.oid || ''
                      : k === 'loop' || k === 'for'
                        ? (() => {
                            /* 「Loop」 만 있으면 몇 번 도는지 알 수 없다(지적) */
                            const f = Number(s.from)
                            const t = Number(s.to)
                            if (Number.isFinite(f) && Number.isFinite(t))
                              return `${t - f + 1}회 · ${s.var || 'i'} ${f}~${t}`
                            const n = Number(s.loopCount)
                            return Number.isFinite(n) && n > 0 ? `${n}회` : '몇 번 돌지 안 정함'
                          })()
                        : k === 'wait'
                          ? `${s.waitSec ?? s.sec ?? 1}초`
                          : k === 'diff'
                            ? `${s.cmpLeft ?? ''} ${s.cmpOp || '=='} ${s.cmpRight ?? ''}`.trim()
                            : s.cli || s.desc || ''
                  return (
                    <div
                      key={i}
                      className={`ask-srow${stepAt === i ? ' on' : ''}${isNote ? ' note' : ''}${
                        runGrp >= 0 && groupOf(i) === runGrp ? ' ing' : ''
                      } ${cls}`}
                      onClick={() => setStepAt(i)}
                    >
                      <span className="ask-ssess">{isNote ? '–' : `S0${(Number(s.session) || 0) + 1}`}</span>
                      <span className="ask-sno" style={{ paddingLeft: d * 12 }}>
                        {no}
                      </span>
                      <span className="ask-skind">{label}</span>
                      <span className={`ask-sbody${isNote ? '' : ' mono'}`}>{body}</span>
                      <span className={`ask-sres ${cls}`}>
                        {at === i ? '도는 중' : v ? v.toUpperCase() : ''}
                      </span>
                    </div>
                  )
                })
              })()}
              {draft.steps.length === 0 && (
                <div className="muted small">쓸 만한 스텝을 못 만들었습니다. 다르게 말해 보세요.</div>
              )}
            </div>
            </div>

            {/* 고른 스텝 하나 — 무엇을 보내고, 무엇이면 합격이고, 무엇이 왔나 */}
            {(() => {
              const i = Math.min(stepAt, draft.steps.length - 1)
              const s = draft.steps[i]
              if (!s)
                return (
                  <div className="ask-pane">
                    <div className="ask-paneh">
                      <h3>스텝 설정</h3>
                    </div>
                    <div className="ask-stepdet empty">왼쪽에서 스텝을 고르세요.</div>
                  </div>
                )
              const rs = ran?.[i]
              const out = String(rs?.output ?? '')
              return (
                <div className="ask-pane">
                  <div className="ask-paneh">
                    <h3>스텝 설정</h3>
                    <span className="sp" />
                    <span className="ask-pill">
                      스텝 {i + 1} / {draft.steps.length}
                    </span>
                  </div>
                  <div className="ask-stepdet">
                  <div className="ask-detlab muted small">
                    스텝 {i + 1} ·{' '}
                    {s.kind === 'inst'
                      ? '계측기'
                      : s.kind === 'wait'
                        ? '대기'
                        : s.kind === 'snmp_get'
                          ? 'SNMP Get'
                          : s.kind === 'snmp_set'
                            ? 'SNMP Set'
                            : s.kind === 'snmp_trap'
                              ? 'SNMP Trap'
                              : s.kind === 'ping'
                                ? 'Ping'
                                : s.kind === 'diff'
                                  ? '값 견주기'
                                  : '조회'}
                  </div>
                  <h3>{s.desc || '—'}</h3>

                  {/* SNMP 는 명령이 아니라 **OID** 로 나간다. 여기서 s.cli 를 그대로
                      물리면 값이 undefined 라 입력칸이 통제에서 풀리고, 앞 스텝의
                      글자를 그대로 이고 있는다(지적 사진: SNMP 스텝에 앞 스텝의
                      show running-config 가 떠 있었다). 칸을 갈라 준다. */}
                  {s.kind === 'snmp_get' || s.kind === 'snmp_set' || s.kind === 'snmp_trap' ? (
                    <div className="ask-detf">
                      <span className="ask-detk">
                        OID
                        <em className="muted small">이 값을 물어봅니다</em>
                      </span>
                      <input
                        className="mono"
                        value={s.oid ?? ''}
                        onChange={(e) => setStep(i, { oid: e.target.value })}
                      />
                    </div>
                  ) : s.kind === 'diff' ? (
                    /* 값 견주기 — 장비로 나가는 명령이 없다. 무엇과 무엇을
                       견주는지가 이 스텝의 전부다(Coverage 와 같은 값). */
                    <div className="ask-detf">
                      <span className="ask-detk">
                        견줄 값
                        <em className="muted small">두 값이 이 관계면 합격입니다</em>
                      </span>
                      <div className="ask-detcmp">
                        <input
                          className="mono"
                          value={s.cmpLeft ?? ''}
                          onChange={(e) => setStep(i, { cmpLeft: e.target.value })}
                        />
                        <span className="ask-detop">{s.cmpOp || '=='}</span>
                        <input
                          className="mono"
                          value={s.cmpRight ?? ''}
                          onChange={(e) => setStep(i, { cmpRight: e.target.value })}
                        />
                      </div>
                    </div>
                  ) : s.kind === 'ping' ? (
                    <div className="ask-detf">
                      <span className="ask-detk">보낼 곳</span>
                      <input
                        className="mono"
                        value={s.host ?? devIp}
                        onChange={(e) => setStep(i, { host: e.target.value })}
                      />
                    </div>
                  ) : (
                    <div className="ask-detf">
                      <span className="ask-detk">
                        {devName} 에 보낼 명령
                        <em className="muted small">고치면 그대로 나갑니다</em>
                      </span>
                      {/* 설정 명령은 `configure terminal` 부터 여러 줄이다.
                          한 줄 칸(input)에 담으면 줄바꿈이 통째로 사라져,
                          고치지 않아도 다음 저장 때 한 줄로 붙어 나간다
                          (지적 사진: `configure terminalinterface …`). */}
                      <textarea
                        className="mono ask-detcli"
                        rows={Math.min(8, Math.max(1, String(s.cli ?? '').split('\n').length))}
                        value={s.cli ?? ''}
                        onChange={(e) => setStep(i, { cli: e.target.value })}
                      />
                    </div>
                  )}

                  <div className="ask-detf">
                    <span className="ask-detk">합격 기준</span>
                    <div className="ask-detcrit">
                      <select
                        value={s.type || 'ok'}
                        onChange={(e) => setStep(i, { type: e.target.value })}
                      >
                        <option value="ok">오류만 없으면 합격</option>
                        <option value="contains">문구 포함</option>
                        <option value="contains_all">모두 있으면 합격</option>
                        <option value="notcontains">있으면 불합격</option>
                        <option value="none">판정 안 함</option>
                      </select>
                      {!s.type || s.type === 'ok' || s.type === 'none' ? (
                        <span className="ask-nocrit">
                          {s.type === 'none' ? '아무것도 확인하지 않음' : '명령이 오류 없이 응답하면 합격'}
                        </span>
                      ) : (
                        <input
                          className={!s.criteria ? 'need' : undefined}
                          value={s.criteria ?? ''}
                          placeholder="이 문구가 나오면 합격"
                          onChange={(e) => setStep(i, { criteria: e.target.value })}
                        />
                      )}
                    </div>
                    <div className="ask-detsay muted small">
                      {s.type === 'none'
                        ? '돌기만 하고 아무것도 확인하지 않습니다.'
                        : s.type === 'ok'
                          ? '응답이 오면 합격입니다.'
                          : s.criteria
                            ? `응답에 "${s.criteria}" ${s.type === 'notcontains' ? '가 있으면 불합격' : '가 있으면 합격'}`
                            : '무엇이 나와야 합격인지 적어 주세요 — 돌린 뒤 응답에서 골라도 됩니다.'}
                    </div>
                  </div>

                  <div className="ask-detf">
                    <span className="ask-detk">응답</span>
                    <pre
                      className="ask-detout"
                      onMouseUp={() => {
                        const sel = window.getSelection()?.toString().trim() ?? ''
                        if (sel) setGrab({ i, text: sel })
                      }}
                    >
                      {out || '아직 실행하지 않았습니다.'}
                    </pre>
                    {rs?.reason && <div className="ask-detwhy muted small">{rs.reason}</div>}
                    {/* 판정기준은 응답을 보고 정하는 것이 제일 정확하다 */}
                    {suggest(out).length > 0 && (
                      <div className="ask-sug">
                        <span className="ask-sug-t">이걸로 판정할까요?</span>
                        {suggest(out).map((g, k) => (
                          <button
                            key={k}
                            type="button"
                            className={s.criteria === g.criteria ? 'on' : undefined}
                            onClick={() => setStep(i, { type: g.type, criteria: g.criteria })}
                          >
                            {g.label}
                          </button>
                        ))}
                      </div>
                    )}
                    {grab?.i === i && (
                      <div className="ask-r-grab">
                        <code>{grab.text.slice(0, 60)}</code>
                        <button
                          className="btn small primary"
                          type="button"
                          onClick={() => {
                            setStep(i, { type: 'contains', criteria: grab.text })
                            setGrab(null)
                          }}
                        >
                          판정기준으로
                        </button>
                        <button className="btn small" type="button" onClick={() => setGrab(null)}>
                          취소
                        </button>
                      </div>
                    )}
                  </div>

                  <button
                    className="btn small ask-runone"
                    type="button"
                    disabled={running || !devId}
                    onClick={() => void run(i)}
                  >
                    이 스텝만 실행
                  </button>
                </div>
                </div>
              )
            })()}
          </div>
        </div>
      )}
          </main>

          </div>
        </div>
          {/* 입력줄은 **캔버스 칸 안에** 떠 있다(지시) — 작업 흐름까지 걸치고
              위에 실선을 그으면 칸이 각져 보인다. 여백과 그림자로 띄운다. */}
          {/* 아래 고정 입력줄 — 일이 시작된 뒤에만. 첫 화면에는 큰 입력이 따로 있다 */}
          {(draft || making) && (
          <div className="ask-askbar">
          <div className="ask-askbox">
            <input
              className="ask-in"
              value={text}
              placeholder={
                draft
                  ? '고칠 것을 말하세요 — 예) 부하를 50%로 올려줘'
                  : mode === 'basic'
                    ? '무엇을 시험할지 적으면 등록된 시험에서 찾아 드립니다'
                    : '무엇을 시험할지 한국어로 적으세요 — 없는 시험을 새로 짓습니다'
              }
              onChange={(e) => setText(e.target.value)}
              onBlur={() => void findLike(text)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return
                if (e.key === 'Enter') void submit()
              }}
            />
            <button
              className="ask-send"
              type="button"
              title="보내기 (Enter)"
              disabled={busy || !text.trim()}
              onClick={() => void submit()}
            >
              {busy ? '…' : '➤'}
            </button>
          </div>
          </div>
          )}
      </div>

      {/* ① 같은 모델이 여러 대 — 어느 장비로 보낼지 고른다 */}
      {pickDev && (() => {
        const rows = pickDev.cands.filter((d) => {
          const at = rackMap.get(d.id)
          if (pickLab && (at?.lab ?? '') !== pickLab) return false
          if (pickRack && (at?.rack ?? '') !== pickRack) return false
          return true
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
                                /* Advanced 는 고르는 갈래가 아니다 — 장비가
                                   정해졌으니 바로 짓는다(지시) */
                                if (mode === 'adv') {
                                  void makePlan(asked, d)
                                  return
                                }
                                void findLike(asked, d).then(() => {
                                  setTcFind('')
                                  const fd = foldOf(asked)
                                  setTcFold(fd)
                                  setTcOpen(openTo(fd))
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
                  {rows.length === 0 && <div className="empty">고른 조건에 맞는 장비가 없습니다.</div>}
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
                    if (mode === 'adv') {
                      void makePlan(asked, d2)
                      return
                    }
                    void findLike(asked, d2).then(() => {
                      setTcFind('')
                      const fd = foldOf(asked)
                      setTcFold(fd)
                      setTcOpen(openTo(fd))
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
                  고르면 그 항목의 절차를 <b>{curDev?.model || '고른 장비'}</b> 에 맞춰 옮겨 줍니다.
                </div>
              </div>
              <span className="sp" />
              <button className="modal-x" type="button" onClick={cancelAsk}>
                ✕
              </button>
            </div>
            <div className="ask-tcfind">
              <input
                value={tcFind}
                placeholder="항목 이름 · TC 번호 · 모델로 찾기"
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
                <span>{curDev?.model || '고른 장비'} 것만</span>
              </label>
            </div>
            {(() => {
              /* **모델명이 같은 것만** 본다(지시). 공용·빈 값도 뺀다 */
              const myModel = (curDev?.model ?? '').trim().toLowerCase()
              const forMe = (t: { model?: string }) => {
                if (!tcOnlyModel || !myModel) return true
                return String(t.model ?? '').trim().toLowerCase() === myModel
              }
              const q = tcFind.trim().toLowerCase()
              const hit = (x: { tcid: string; name: string; model: string }) =>
                !q ||
                x.name.toLowerCase().includes(q) ||
                x.tcid.toLowerCase().includes(q) ||
                x.model.toLowerCase().includes(q)
              const mine = tcAll.filter((x) => forMe(x) && hit(x))
              /* 마디마다 그 **아래 전부**를 센다 — 폴더를 골라도 걸리게 */
              const cnt = new Map<string, number>()
              for (const t of mine) for (const nd of t.chain) cnt.set(nd, (cnt.get(nd) ?? 0) + 1)
              const kids = (pid: string) =>
                tcTree.filter((n) => n.parent === pid && (cnt.get(n.id) ?? 0) > 0)
              const near = new Map(like.map((x, i) => [x.tcid, i]))
              const rows = mine
                .filter((x) => !tcFold || x.chain.includes(tcFold))
                // 말과 비슷하다고 서버가 짚어 준 것을 맨 위로
                .sort((a, b) => (near.get(a.tcid) ?? 99) - (near.get(b.tcid) ?? 99))
              const foldName = tcTree.find((n) => n.id === tcFold)?.name ?? ''

              /** 트리 한 줄 — 폴더는 접었다 폈다, 요구사항은 문서 */
              const line = (nd: { id: string; name: string; kind: 'cat' | 'req'; depth: number }) => {
                const kk = kids(nd.id)
                const open = tcOpen.has(nd.id)
                return (
                  <div key={nd.id}>
                    <div
                      className={`ask-tnode${tcFold === nd.id ? ' on' : ''}`}
                      style={{ paddingLeft: 6 + nd.depth * 13 }}
                    >
                      <button
                        type="button"
                        className="ask-tcar"
                        disabled={kk.length === 0}
                        onClick={() =>
                          setTcOpen((v) => {
                            const n2 = new Set(v)
                            if (n2.has(nd.id)) n2.delete(nd.id)
                            else n2.add(nd.id)
                            return n2
                          })
                        }
                      >
                        {kk.length === 0 ? '' : open ? '▾' : '▸'}
                      </button>
                      <button
                        type="button"
                        className="ask-tname"
                        title={nd.name}
                        onClick={() => {
                          setTcFold(tcFold === nd.id ? '' : nd.id)
                          setTcOpen((v) => new Set([...v, nd.id]))
                        }}
                      >
                        <i>{nd.kind === 'cat' ? '📁' : '📄'}</i>
                        <span>{nd.name}</span>
                        <em>{cnt.get(nd.id) ?? 0}</em>
                      </button>
                    </div>
                    {open && kk.map((k2) => line(k2))}
                  </div>
                )
              }

              return (
                <div className="ask-tcbody">
                  <div className="ask-tclist">
                    <div className="ask-likegrp">
                      {tcFold ? `${foldName} — ${rows.length}건` : `시험 항목 ${rows.length}건`}
                      {like.length > 0 && !tcFold && !q ? ' · 말과 비슷한 것 위로' : ''}
                      {tcFold && (
                        <button type="button" className="ask-tcall" onClick={() => setTcFold('')}>
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
                          <th>이름</th>
                          <th>모델그룹</th>
                          <th>모델명</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.slice(0, 400).map((x) => (
                          <tr
                            key={x.tcid}
                            className={adopting ? 'busy' : ''}
                            onClick={() => {
                              if (adopting) return
                              setLikeAsk(false)
                              /* 일반 = 있는 것을 그대로, 고급 = 이 장비에 맞춰 옮겨 짓기 */
                              void (mode === 'basic' ? takeTc(x.tcid) : adopt(x.tcid))
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
                            <td>
                              <b>{x.name}</b>
                              <i>{x.steps}</i>
                            </td>
                            <td>{x.mgroup || '공용'}</td>
                            <td>{x.model || '–'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {rows.length === 0 && (
                      <div className="ask-likenone muted small">
                        {tcAll.length === 0
                          ? '시험 항목을 읽지 못했습니다 — Coverage 에서 항목을 먼저 만들어 주세요'
                          : tcOnlyModel && myModel
                            ? `모델명이 ${curDev?.model} 인 항목이 없습니다 — 위 「${curDev?.model} 것만」 을 끄면 다른 모델 항목도 보입니다`
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
                <button className="btn small" type="button" onClick={cancelAsk}>
                  그만두기
                </button>
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
          </div>
        </div>
      )}
    </div>
  )
}
