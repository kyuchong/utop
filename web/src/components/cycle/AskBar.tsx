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
  /** cli(기본) · wait · loop/for · if · inst(계측기) */
  kind?: string
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
  /** inst — 계측기 동작(reserve·config·start·stat·stop·release) */
  action?: string
  rate?: string
  frame?: number
}

interface Draft {
  name: string
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
  const [like, setLike] = useState<Array<{ tcid: string; name: string; model?: string }>>([])
  const [adopting, setAdopting] = useState('')
  /** 최근 만든 시험 — 왼쪽 칸 */
  const [recent, setRecent] = useState<Array<{ cid: string; title: string; at?: string }>>([])
  /** 질문 보기 고치기 — 관리자만. ⚙ 로 켠다 */
  const [exEdit, setExEdit] = useState(false)
  const [exSay, setExSay] = useState('')
  const [amAdmin, setAmAdmin] = useState(false)
  /** 같은 모델이 여러 대일 때 — 어느 장비로 보낼지 고르는 창 */
  /** 오른쪽에 펼쳐 볼 스텝 */
  const [stepAt, setStepAt] = useState(0)
  /** 작업 흐름에 남기는 기록 — 질문한 뒤부터 쌓이고, 만들어지면 그대로 남는다 */
  /** 한 일 한 줄 — `s` 는 **어느 단계의 일인가**.
   *  이걸 안 달면 모든 줄이 1단계(장비 선택) 밑에 쌓여 지금 어디를 하는지
   *  알 수 없다(지적). */
  const [flowLog, setFlowLog] = useState<Array<{ s: number; t: string }>>([])
  const [flowVals, setFlowVals] = useState<Array<{ k: string; v: string }>>([])
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
  const [fitNotes, setFitNotes] = useState<string[]>([])
  const [pickDev, setPickDev] = useState<{ model: string; cands: Device[] } | null>(null)
  const [pickSel, setPickSel] = useState('')
  const [pickLab, setPickLab] = useState('')
  const [pickRack, setPickRack] = useState('')
  /** 비슷한 시험이 있을 때 — 가져올지 새로 지을지 묻는 창 */
  const [likeAsk, setLikeAsk] = useState(false)
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
        const r2 = await apiFetch('/api/ai/nl-chats')
        /* 서버 목록은 **id** 로 준다. 여기서 cid 로만 읽어 새로고침 뒤에는
           번호가 통째로 비었고, 기록을 누르면 없는 번호를 물어보다 「절차가
           담겨 있지 않습니다」 로 떨어졌다(지적). 둘 다 받는다. */
        const b2 = (await r2.json()) as {
          ok?: boolean
          items?: Array<{ id?: string; cid?: string; title?: string; at?: string }>
        }
        if (b2.ok && Array.isArray(b2.items))
          setRecent(
            b2.items
              .map((x) => ({ cid: String(x.id ?? x.cid ?? ''), title: x.title ?? '', at: x.at }))
              .filter((x) => x.cid)
              .slice(0, 12)
              .map((x) => ({ ...x, title: x.title || x.cid })),
          )
      } catch {
        /* 기록이 없어도 화면은 돈다 */
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
  const findLike = async (q: string): Promise<number> => {
    if (!q.trim()) {
      setLike([])
      return 0
    }
    try {
      const picked = usable.find((x) => x.id === devId)
      const r = await apiFetch(
        `/api/ai/nl-tc-like?text=${encodeURIComponent(q.trim())}&model=${encodeURIComponent(picked?.model ?? '')}`,
      )
      const b = (await r.json()) as { ok?: boolean; items?: Array<{ tcid: string; name: string; model?: string }> }
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
    setRecent((v) => [{ cid: id, title }, ...v.filter((x) => x.cid !== id)].slice(0, 12))
    try {
      await apiFetch('/api/ai/nl-chats', {
        method: 'POST',
        body: JSON.stringify({ id, title, plan, dev, msgs: [{ role: 'user', text: title }] }),
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
    const need = d.steps.some(
      (x) => String(x.cli ?? '').trim() && !String(x.criteria ?? '').trim() && x.type !== 'ok',
    )
    if (!need) {
      setFlowAt(0)
      return d
    }
    // 절차만 나오고 기준이 비어 있으면 「만들다 만 것」 이다. 기준까지
    // 채워야 생성이 끝난 것이므로, 그때까지 5단계는 계속 돈다.
    setFlowAt(5)
    setFilling(true)
    setGenSay('조회를 미리 돌려 판정 기준을 잡는 중…')
    setFlowLog((v) => [...v, { s: 5, t: '조회를 미리 돌려 판정 기준을 잡는 중…' }])
    try {
      const r = await apiFetch('/api/ai/nl-criteria', {
        method: 'POST',
        body: JSON.stringify({
          probe: true,
          /* 서버는 ip 로 읽는다 — connParams 는 host 로 준다. 그대로 보내면
             「장비 정보가 없습니다」 로 조용히 되돌아온다(실제로 그랬다). */
          device: { ...connParams(dev), ip: connParams(dev).host },
          steps: d.steps.map((x, i) => ({ i, cli: x.cli, desc: x.desc })),
        }),
      })
      const b = (await r.json()) as {
        ok?: boolean
        error?: string
        skipped?: string
        items?: Array<{ i?: number; type?: string; criteria?: string }>
      }
      if (!b.ok || !Array.isArray(b.items)) {
        setFlowLog((v) => [
          ...v.filter((x) => !x.t.endsWith('잡는 중…')),
          {
            s: 5,
            t:
              b.skipped === 'config'
                ? '설정 명령이 있어 미리 읽지 않았습니다 — 돌린 뒤 응답에서 고르세요'
                : `판정 기준을 못 잡았습니다 — ${b.error ?? '까닭 모름'}`,
          },
        ])
        setFlowAt(0)
        setFilling(false)
        setGenSay('')
        return d
      }
      let n = 0
      const steps = d.steps.map((x, i) => {
        const hit = b.items!.find((y) => y.i === i)
        if (!hit || !String(hit.criteria ?? '').trim()) return x
        if (String(x.criteria ?? '').trim()) return x
        n++
        return { ...x, type: hit.type || 'contains', criteria: String(hit.criteria) }
      })
      setFlowLog((v) => [
        ...v.filter((x) => !x.t.endsWith('잡는 중…')),
        { s: 5, t: n > 0 ? `응답을 보고 판정 기준 ${n}개를 채움` : '기준으로 삼을 또렷한 값이 없었습니다' },
      ])
      setFlowAt(0)
      setFilling(false)
      setGenSay('')
      return { ...d, steps }
    } catch (e) {
      setFlowLog((v) => [
        ...v.filter((x) => !x.t.endsWith('잡는 중…')),
        { s: 5, t: `판정 기준을 못 잡았습니다 — ${e instanceof Error ? e.message : String(e)}` },
      ])
      setFlowAt(0)
      setFilling(false)
      setGenSay('')
    }
    return d
  }

  /**
   * 기록 하나 열기 — **다시 만들지 않는다**(지적: 눌렀더니 만들기 창이 떴다).
   * 담아 둔 절차를 그대로 펴고, 그때 쓰던 장비도 되살린다.
   */
  const openChat = async (cid: string, title: string) => {
    setErr('')
    try {
      const r = await apiFetch(`/api/ai/nl-chats/${encodeURIComponent(cid)}`)
      const b = (await r.json()) as {
        ok?: boolean
        error?: string
        chat?: { title?: string; plan?: Draft; dev?: string; at?: string }
      }
      const plan = b.chat?.plan
      if (!b.ok) {
        // 못 찾은 것과 절차가 없는 것은 다른 일이다 — 뭉뚱그리면 고칠 데를
        // 못 찾는다
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
      setLike([])
      setLikeAsk(false)
      setRan(null)
      setStepAt(0)
      setFitNotes([])
      setFlowAt(0)
      setFlowVals(dv ? [{ k: '대상', v: dv.ip }] : [])
      setFlowLog([
        { s: 1, t: dv ? `그때 쓰던 장비 ${dv.ip} 로 되살림` : '담아 둔 절차를 그대로 폄' },
        { s: 5, t: `기록을 열었습니다 — ${b.chat?.at ? String(b.chat.at).slice(0, 16) : ''}` },
      ])
      setBuilt(plan)
      setDraft(plan)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  /** 기록 하나 지우기 — 내 것만 지워진다(서버가 막는다) */
  const dropChat = async (cid: string) => {
    setRecent((v) => v.filter((x) => x.cid !== cid))
    if (cid === chatId) setChatId('')
    try {
      await apiFetch(`/api/ai/nl-chats/${encodeURIComponent(cid)}`, { method: 'DELETE' })
    } catch {
      /* 못 지워도 목록에서는 빠진다 — 다음에 다시 읽으면 돌아온다 */
    }
  }

  /** 그 TC 를 고른 장비로 옮겨 초안에 앉힌다 */
  const adopt = async (tcid: string) => {
    setAdopting(tcid)
    setErr('')
    setFlowAt(5)
    setFlowLog((v) => [...v, { s: 5, t: `${tcid} 를 가져오는 중…` }])
    try {
      const picked = usable.find((x) => x.id === devId) ?? usable[0]
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
      setBuilt(d2)   // 레일은 지금 바로 편다
      setDevId(picked?.id ?? '')
      const done2 = picked ? await fillCriteria(d2, picked) : d2
      setDraft(done2)
      void keepChat(done2.name, done2, picked?.ip ?? '')
      setLike([])
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setFlowAt(0)
    } finally {
      setAdopting('')
    }
  }

  /** 적은 말에서 모델 이름을 찾아 그 모델 장비들을 모은다 */
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
    if (q) setText(q)
    setFlowLog([{ s: 1, t: `요청의 말을 읽었습니다 — "${said.slice(0, 40)}"` }])
    setFlowVals([])
    setFitNotes([])
    setFlowAt(1)
    const hit = candsOf(said)
    if (hit && hit.cands.length > 1 && !hit.cands.some((d) => d.id === devId)) {
      setFlowLog((v) => [...v, { s: 1, t: `요청의 ${hit.model} 이(가) ${hit.cands.length}대` }])
      setPickSel(hit.cands[0]?.id ?? '')
      setPickLab('')
      setPickRack('')
      setPickDev(hit)
      return
    }
    if (hit && hit.cands.length === 1 && hit.cands[0]) {
      setDevId(hit.cands[0].id)
      setFlowLog((v) => [...v, { s: 1, t: `보낼 장비 ${hit.cands[0]!.ip} 확정 (한 대뿐)` }])
      setFlowVals([
        { k: '모델', v: hit.model },
        { k: '대상', v: hit.cands[0]!.ip },
      ])
    }
    const n = await findLike(said)
    if (n > 0) setLikeAsk(true)
    else await ask(said)
  }

  const ask = async (q?: string) => {
    const said = (q ?? text).trim()
    if (!said) return
    setLikeAsk(false)
    setBusy(true)
    setFlowAt(5)
    setFlowLog((v) => [...v, { s: 5, t: '절차를 짓는 중…' }])
    setErr('')
    setDraft(null)
    try {
      /*
       * 옮겨 온 자연어 시험 서버(nl-plan)를 쓴다.
       *
       * 옛 `/api/nl/tc` 는 LLM 일반 지식으로만 지었다. 이쪽은 **학습된 절차 ·
       * 장비 카탈로그 · 이 랩에서 통한 명령** 을 근거로 삼아, 포트 표기와
       * 판정기준까지 이 랩에 맞춰 내놓는다. 고른 장비의 모델을 함께 보낸다 —
       * 모델을 알아야 인터페이스 이름(TenGi0/1 · Gi0/1)을 맞춘다.
       */
      const picked = usable.find((x) => x.id === devId)
      const r = await apiFetch('/api/ai/nl-plan', {
        method: 'POST',
        body: JSON.stringify({
          text: said,
          model: picked?.model ?? '',
          dev_id: picked?.id ?? '',
        }),
      })
      const b = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(b.detail || `만들지 못했습니다 (${r.status})`)
      const raw = b as Draft & { title?: string; purpose?: string; ok?: boolean; error?: string }
      if (raw.ok === false) throw new Error(raw.error || '만들지 못했습니다')
      const d: Draft = {
        ...raw,
        name: raw.name || raw.title || said.slice(0, 40),
        object: raw.object || raw.purpose,
        steps: Array.isArray(raw.steps) ? raw.steps : [],
      }
      setStepAt(0)
      setBuilt(d)   // 레일은 지금 바로 편다
      setFlowLog((v) => [
        ...v.filter((x) => x.t !== '절차를 짓는 중…'),
        { s: 5, t: `절차 ${d.steps.length}개 스텝으로 지음` },
      ])
      // 기준까지 채운 뒤에 내놓는다 — 스텝만 먼저 뜨면 「기준 없이 만들어졌다」
      // 로 보이고, 채워지는 동안 눈앞에서 값이 바뀐다(지적)
      const done = picked ? await fillCriteria(d, picked) : d
      setDraft(done)
      void keepChat(done.name, done, picked?.ip ?? '')
      // AI 가 짚은 장비를 먼저 고르되, 없으면 첫 장비
      const hit = usable.find((x) => x.ip === d.device_ip)
      setDevId(hit?.id ?? usable[0]?.id ?? '')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setFlowAt(0)
    } finally {
      setBusy(false)
    }
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
    const steps: TcStep[] = draft.steps.map((s) => {
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
        type: s.type || 'contains',
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

  const setStep = (i: number, patch: Partial<DraftStep>) =>
    setDraft((d) =>
      d ? { ...d, steps: d.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) } : d,
    )

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
    const says = adopting
      ? ['가져올 시험을 읽는 중…', '이 장비의 포트 이름에 맞추는 중…', '값을 비우고 옮기는 중…']
      : [
          '학습된 절차를 읽는 중…',
          '이 장비의 인터페이스 구성을 맞추는 중…',
          '이 랩에서 통한 명령을 찾는 중…',
          '절차를 짓는 중…',
          '판정 기준을 잡는 중…',
        ]
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
  /* 굳은 사실 몇 줄 — 아래 셈틀이 이 차례대로 한 줄씩 내놓는다 */
  const notes5: string[] = []
  if (plan5) {
    notes5.push(...fitNotes)
    const blank = plan5.steps.filter((x) => !(x.criteria ?? '').trim() && x.type !== 'ok').length
    if (blank > 0) notes5.push(`값을 비운 합격 기준 ${blank}개 — 돌린 뒤 응답에서 고르세요`)
  }
  const revTotal = plan5 ? notes5.length + plan5.steps.length : 0

  /** 만드는 중인가 — 짓기(busy)든 가져오기(adopting)든 */
  const making = busy || !!adopting

  /**
   * 한 줄씩 차오르기.
   *
   * 서버는 절차를 한 덩어리로 준다. 그대로 그리면 다 만든 뒤에 **한꺼번에**
   * 튀어나와, 무엇이 어떤 차례로 정해졌는지 알 수 없다(지적). 굳은 사실
   * 한 줄 · 스텝 한 줄씩 차례로 내놓아 눈이 따라갈 수 있게 한다.
   */
  const [rev, setRev] = useState(0)
  useEffect(() => {
    setRev(0)   // 새로 지어질 때만 처음부터
  }, [built])
  useEffect(() => {
    if (rev >= revTotal) return
    const t = setTimeout(() => setRev((r) => r + 1), 90)
    return () => clearTimeout(t)
  }, [rev, revTotal])

  const curDev = usable.find((d) => d.id === devId)
  const devName = curDev?.name || curDev?.model || '장비'
  const devIp = curDev?.ip ?? ''
  const flow = stages(text || draft?.name || '', !!draft)

  return (
    /* 세 칸 + 아래 입력줄 — 옮겨 온 화면의 짜임을 우리 꼴(panel·btn·토큰)로 다시 그렸다.
       왼쪽 기록 · 가운데 작업 흐름 · 오른쪽 캔버스, 입력은 흐름부터 오른쪽 끝까지. */
    <div className="ask">
      <aside className="ask-sess">
        <button
          className="btn small ask-new"
          type="button"
          onClick={() => {
            setDraft(null)
            setRan(null)
            setText('')
            setLike([])
            setErr('')
            setFlowLog([])
            setFlowVals([])
            setFlowAt(0)
            setFitNotes([])
            setBuilt(null)
            setFold(new Set())   // 접어 둔 단계도 처음으로
            setChatId('')
          }}
        >
          새 시험 만들기
        </button>
        <div className="ask-eyebrow">최근</div>
        <div className="ask-slist">
          {recent.length === 0 ? (
            <span className="muted small">아직 만든 시험이 없습니다.</span>
          ) : (
            recent.map((x) => (
              <div className={`ask-sitem${chatId === x.cid ? ' on' : ''}`} key={x.cid}>
                <button
                  type="button"
                  className="ask-sbtn"
                  title="이 기록을 엽니다"
                  onClick={() => void openChat(x.cid, x.title)}
                >
                  <b>{x.title}</b>
                  {x.at && <em>{String(x.at).slice(5, 16).replace('T', ' ')}</em>}
                </button>
                <button
                  type="button"
                  className="ask-sdel"
                  title="이 기록 지우기"
                  onClick={() => void dropChat(x.cid)}
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      <div className="ask-main">
        <div className="ask-cols">
          {/* 작업 흐름 — 무엇을 거치는지, 건너뛰면 왜 건너뛰는지 */}
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
                          {mine.length > 0 && (
                            <>
                              <div className="ask-stagesay">한 일</div>
                              <ul className="ask-did">
                                {mine.map((l, k) => {
                                  const now = running && k === runAt
                                  return (
                                    <li key={k} className={now ? 'now' : ''}>
                                      <i>{now ? '' : '✔'}</i>
                                      <span>{now && genSay ? genSay : l.t}</span>
                                    </li>
                                  )
                                })}
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
                              {/* 이 장비에 맞추며 바꾼 것 · 비워 둔 기준 —
                                  무엇이 바뀌었는지 모르면 그대로 믿고 돌리게 된다.
                                  차례대로 한 줄씩 찬다. */}
                              {rev > 0 && notes5.length > 0 && (
                                <ul className="ask-did ask-fit">
                                  {notes5.slice(0, rev).map((n, k) => (
                                    <li key={k}>
                                      <i>✔</i>
                                      <span>{n}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                              {rev > notes5.length && (
                                <>
                                  <div className="ask-stagesay">
                                    만든 스텝 {Math.min(rev - notes5.length, plan5.steps.length)}
                                    {rev < revTotal ? ` / ${plan5.steps.length}` : '개'}
                                  </div>
                                  <ol className="ask-mini">
                                    {plan5.steps.slice(0, rev - notes5.length).map((x, k) => (
                                      <li key={k}>
                                        <i>{k + 1}</i>
                                        <code>{x.cli || x.desc || '—'}</code>
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

          <div className="ask-canvaswrap">
          <main className="ask-canvas">

      {/* 만드는 중 — 첫 화면을 **치운다**.
          초안은 기준까지 다 채운 뒤에 나오므로 그때까지 이 자리가 빈다.
          질문 보기를 그대로 두면 다 만든 줄 모르고 다른 예시를 눌러 같은
          일이 두 번 시작된다(가져오기 중에는 busy 가 꺼져 있어 막히지도
          않았다). 지금 무엇을 하고 있는지만 보인다. */}
      {!draft && making && (
        <div className="ask-making">
          <h1>절차를 만들고 있습니다</h1>
          {text.trim() && <p className="muted">“{text.trim()}”</p>}
          <div className="ask-mksay">
            <i />
            <span>{genSay || '만드는 중…'}</span>
          </div>
          <div className="ask-skel" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div className="ask-skelrow" key={i}>
                <b />
                <em />
              </div>
            ))}
          </div>
          <p className="ask-note muted small">
            판정 기준을 잡으려고 <b>조회 명령만</b> 미리 보냅니다. 다 채운 뒤에 절차가 한 번에 나옵니다.
          </p>
        </div>
      )}

      {/* 첫 화면 — 무엇을 시킬 수 있나. 예시가 없으면 사람은 아무것도 못 친다 */}
      {!draft && !making && (
        <div className="ask-hero">
          {/* 관리자만 — ⚙ 로 질문 보기를 고친다. 랩마다 자주 하는 시험이 다르다 */}
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
          <h1>무엇을 시험할까요?</h1>
          <p className="muted">
            한국어로 말하면 5단계 흐름을 따라 절차를 만듭니다.
            <br />
            기능이 실제로 동작하는지 보려면 트래픽 단계가 함께 붙습니다.
          </p>
          {examples.map((x, i) =>
            exEdit ? (
              /* 고치는 중에는 줄 자체가 적는 칸이다 — 눌러 들어가지 않아도 된다 */
              <div className="ask-exedit" key={i}>
                <div className="ask-execol">
                  <input
                    value={x.q}
                    placeholder="예) E6100 rate limit 시험해줘"
                    onChange={(e) => exSet(i, { q: e.target.value })}
                  />
                  <input
                    className="desc"
                    value={x.d ?? ''}
                    placeholder="설명 (없어도 됩니다) — 무엇을 보는 시험인지 한 줄로"
                    onChange={(e) => exSet(i, { d: e.target.value })}
                  />
                </div>
                <button type="button" className="ask-exdel" title="지우기" onClick={() => exDel(i)}>
                  ✕
                </button>
              </div>
            ) : (
              <button
                key={x.q || i}
                type="button"
                className="ask-exrow"
                onClick={() => void submit(x.q)}
              >
                <b>▸</b>
                <span>
                  {x.q}
                  {x.d ? <i>{x.d}</i> : null}
                </span>
                <em>{wantsTraffic(x.q) ? '5단계 · 동작 시험' : '2단계 · 설정 확인'}</em>
              </button>
            ),
          )}
          {exEdit && (
            <button type="button" className="ask-exadd" onClick={exAdd}>
              ＋ 질문 추가
            </button>
          )}
          <p className="ask-note muted small">
            절차를 만들 때는 판정 기준을 잡으려고 <b>조회 명령만</b> 미리 보냅니다. 명령은{' '}
            <b>[실행]</b> 을 눌렀을 때만 나갑니다.
          </p>
        </div>
      )}

      {/* 「설정 시험 허용」 스위치는 없앴다(지시: 그냥 생성되도록).
          만들기만으로는 장비에 아무것도 안 나간다 — 명령은 [실행] 을 눌렀을
          때만 나가므로, 사람이 절차를 보고 고른 뒤에 나간다. */}

      {err && <div className="ask-err">{err}</div>}

      {draft && (
        <div className="ask-plan">
          <div className="ask-planhd">
            <div className="ask-planttl">
              <b>{draft.name}</b>
              {draft.object && <span className="muted small">{draft.object}</span>}
            </div>
            <span className="sp" />
            {/* 어느 장비에 보낼지는 사람이 정한다 — AI 가 짚은 것을 미리 골라
                두되 그대로 나가게 두지 않는다 */}
            <select className="ask-devsel" value={devId} onChange={(e) => setDevId(e.target.value)}>
              {usable.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name || d.model || d.ip} · {d.ip}
                </option>
              ))}
            </select>
            {running ? (
              <button className="btn small" type="button" onClick={() => abortRef.current?.abort()}>
                ⏹ 멈추기
              </button>
            ) : (
              <button
                className="btn primary small"
                type="button"
                disabled={!draft.steps.length || !devId}
                onClick={() => void run()}
              >
                ▶ 이대로 돌리기
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

          {(draft.cut?.length ?? 0) > 0 && (
            <div className="ask-drop">
              조회가 아닌 명령 {draft.cut?.length}개는 뺐습니다 — {draft.cut?.join(' · ')}
            </div>
          )}

          {/* 왼쪽 스텝 목록 · 오른쪽 그 스텝의 속(명령·기준·응답).
              위아래로 두면 응답을 보려고 내리는 순간 고치던 칸이 사라진다. */}
          <div className="ask-two">
            <div className="ask-steplist">
              {draft.steps.map((s, i) => {
                const rs = ran?.[i]
                const v = String(rs?.repeatResult ?? rs?.status ?? '').trim()
                const state = at === i ? '도는 중' : v || (rs?.output ? '판정 안 함' : '대기')
                const cls = at === i ? 'run' : v.toLowerCase() === 'fail' ? 'fail' : v ? 'pass' : ''
                return (
                  <button
                    key={i}
                    type="button"
                    className={`ask-stepcard${stepAt === i ? ' on' : ''} ${cls}`}
                    onClick={() => setStepAt(i)}
                  >
                    <i>{i + 1}</i>
                    <span>
                      <b>{s.desc || s.cli || '—'}</b>
                      <em>
                        <u>{s.kind === 'inst' ? '계측기' : s.kind === 'wait' ? '대기' : '조회'}</u>
                        {devIp ? ` ${devIp}` : ''} · 생성 완료
                      </em>
                    </span>
                    <var className={`ask-stepst ${cls}`}>{state}</var>
                  </button>
                )
              })}
              {draft.steps.length === 0 && (
                <div className="muted small">쓸 만한 스텝을 못 만들었습니다. 다르게 말해 보세요.</div>
              )}
            </div>

            {/* 고른 스텝 하나 — 무엇을 보내고, 무엇이면 합격이고, 무엇이 왔나 */}
            {(() => {
              const i = Math.min(stepAt, draft.steps.length - 1)
              const s = draft.steps[i]
              if (!s) return <div className="ask-stepdet empty">왼쪽에서 스텝을 고르세요.</div>
              const rs = ran?.[i]
              const out = String(rs?.output ?? '')
              return (
                <div className="ask-stepdet">
                  <div className="ask-detlab muted small">
                    스텝 {i + 1} · {s.kind === 'inst' ? '계측기' : s.kind === 'wait' ? '대기' : '조회'}
                  </div>
                  <h3>{s.desc || '—'}</h3>

                  <div className="ask-detf">
                    <span className="ask-detk">
                      {devName} 에 보낼 명령
                      <em className="muted small">고치면 그대로 나갑니다</em>
                    </span>
                    <input
                      className="mono"
                      value={s.cli}
                      onChange={(e) => setStep(i, { cli: e.target.value })}
                    />
                  </div>

                  <div className="ask-detf">
                    <span className="ask-detk">합격 기준</span>
                    <div className="ask-detcrit">
                      <select
                        value={s.type ?? 'contains'}
                        onChange={(e) => setStep(i, { type: e.target.value })}
                      >
                        <option value="ok">오류만 없으면 합격</option>
                        <option value="contains">문구 포함</option>
                        <option value="contains_all">모두 있으면 합격</option>
                        <option value="notcontains">있으면 불합격</option>
                        <option value="none">판정 안 함</option>
                      </select>
                      {s.type === 'ok' || s.type === 'none' ? (
                        <span className="ask-nocrit">
                          {s.type === 'ok' ? '명령이 오류 없이 응답하면 합격' : '아무것도 확인하지 않음'}
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
              )
            })()}
          </div>
        </div>
      )}
          </main>

          {/* 입력줄은 **캔버스 칸 안에** 떠 있다(지시) — 작업 흐름까지 걸치고
              위에 실선을 그으면 칸이 각져 보인다. 여백과 그림자로 띄운다. */}
          <div className="ask-askbar">
          <div className="ask-askbox">
            <input
              className="ask-in"
              value={text}
              placeholder={
                draft ? '고칠 것을 말하세요 — 예) 부하를 50%로 올려줘' : '무엇을 시험할지 한국어로 적으세요'
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
          </div>
        </div>
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
          <div className="modal-back" onMouseDown={() => setPickDev(null)}>
            <div
              className="modal ask-pick"
              role="dialog"
              aria-modal="true"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="modal-head">
                <div>
                  <b>{pickDev.model} 이(가) {pickDev.cands.length}대 있어요</b>
                  <div className="muted small">어느 장비로 보낼지 골라 주세요.</div>
                </div>
                <span className="sp" />
                <button className="modal-x" type="button" onClick={() => setPickDev(null)}>
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
                                void findLike(text).then((n) => (n > 0 ? setLikeAsk(true) : ask()))
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
                <button className="btn small" type="button" onClick={() => setPickDev(null)}>
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
                    setFlowVals([
                      { k: '모델', v: pickDev.model },
                      { k: '대상', v: d2?.ip ?? '' },
                    ])
                    setPickDev(null)
                    void findLike(text).then((n) => (n > 0 ? setLikeAsk(true) : ask()))
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

      {/* ② 비슷한 시험이 이미 있다 — 가져올지 새로 지을지 */}
      {likeAsk && like.length > 0 && (
        <div className="modal-back" onMouseDown={() => setLikeAsk(false)}>
          <div
            className="modal ask-likemodal"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <b>비슷한 시험이 이미 있어요</b>
                <div className="muted small">
                  가져오면 그 절차를 고른 장비에 맞춰 바꿔 줍니다 — 새로 짓지 않습니다.
                </div>
              </div>
              <span className="sp" />
              <button className="modal-x" type="button" onClick={() => setLikeAsk(false)}>
                ✕
              </button>
            </div>
            <div className="ask-likelist">
              {like.map((x) => (
                <button
                  key={x.tcid}
                  type="button"
                  className="ask-likerow"
                  disabled={!!adopting}
                  onClick={() => {
                    setLikeAsk(false)
                    void adopt(x.tcid)
                  }}
                >
                  <b>{x.name}</b>
                  <span className="muted small">
                    {x.tcid}
                    {x.model ? ` · ${x.model}` : ''}
                  </span>
                </button>
              ))}
            </div>
            <div className="modal-foot">
              <span className="muted small">줄을 누르면 그 시험을 가져옵니다.</span>
              <span className="ask-footbtns">
                <button className="btn small" type="button" onClick={() => setLikeAsk(false)}>
                  그만두기
                </button>
                <button className="btn primary small" type="button" onClick={() => void ask()}>
                  새로 만들기
                </button>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
