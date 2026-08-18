import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/api/client'
import { IconSettings } from '@/components/icons'
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
  const [pickDev, setPickDev] = useState<{ model: string; cands: Device[] } | null>(null)
  const [pickSel, setPickSel] = useState('')
  const [pickLab, setPickLab] = useState('')
  const [pickRack, setPickRack] = useState('')
  /** 비슷한 시험이 있을 때 — 가져올지 새로 지을지 묻는 창 */
  const [likeAsk, setLikeAsk] = useState(false)
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
        const b2 = (await r2.json()) as {
          ok?: boolean
          items?: Array<{ cid: string; title?: string; at?: string }>
        }
        if (b2.ok && Array.isArray(b2.items))
          setRecent(b2.items.slice(0, 12).map((x) => ({ cid: x.cid, title: x.title || x.cid, at: x.at })))
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

  /** 그 TC 를 고른 장비로 옮겨 초안에 앉힌다 */
  const adopt = async (tcid: string) => {
    setAdopting(tcid)
    setErr('')
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
        steps?: DraftStep[]
      }
      if (!b.ok) throw new Error(b.error || '가져오지 못했습니다')
      setDraft({ name: b.title || tcid, steps: b.steps ?? [] })
      setDevId(picked?.id ?? '')
      setLike([])
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
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
  const submit = async () => {
    if (!text.trim() || busy) return
    const hit = candsOf(text)
    if (hit && hit.cands.length > 1 && !hit.cands.some((d) => d.id === devId)) {
      setPickSel(hit.cands[0]?.id ?? '')
      setPickLab('')
      setPickRack('')
      setPickDev(hit)
      return
    }
    if (hit && hit.cands.length === 1 && hit.cands[0]) setDevId(hit.cands[0].id)
    const n = await findLike(text)
    if (n > 0) setLikeAsk(true)
    else await ask()
  }

  const ask = async () => {
    if (!text.trim()) return
    setLikeAsk(false)
    setBusy(true)
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
          text: text.trim(),
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
        name: raw.name || raw.title || text.trim().slice(0, 40),
        object: raw.object || raw.purpose,
        steps: Array.isArray(raw.steps) ? raw.steps : [],
      }
      setDraft(d)
      // AI 가 짚은 장비를 먼저 고르되, 없으면 첫 장비
      const hit = usable.find((x) => x.ip === d.device_ip)
      setDevId(hit?.id ?? usable[0]?.id ?? '')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
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
  const run = async () => {
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
        0,
        false,
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
              <button
                key={x.cid}
                type="button"
                className="ask-sitem"
                title={x.at ? String(x.at).slice(0, 16).replace('T', ' ') : ''}
                onClick={() => setText(x.title)}
              >
                {x.title}
              </button>
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
              <em className="muted small">{draft ? '절차 준비됨' : busy ? '만드는 중…' : '대기 중'}</em>
            </div>
            <p className="ask-rail-say muted small">
              흐름은 항상 5단계입니다 — 장비 선택 · 포트 연결 · 트래픽 설정 · 트래픽 확인 ·
              생성 완료.
              <br />
              시험에 필요 없는 단계는 이유와 함께 건너뜁니다.
            </p>
            <div className="ask-stages">
              {flow.map((st) => (
                <div key={st.n} className={`ask-stage${st.skip ? ' skip' : ''}${st.done ? ' done' : ''}`}>
                  <i>{st.n}</i>
                  <span>
                    {st.name}
                    {st.skip ? <em>{st.skip}</em> : null}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <div className="ask-canvaswrap">
          <main className="ask-canvas">

      {/* 첫 화면 — 무엇을 시킬 수 있나. 예시가 없으면 사람은 아무것도 못 친다 */}
      {!draft && (
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
                onClick={() => {
                  setText(x.q)
                  void findLike(x.q)
                }}
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
          {/* 왼쪽에서 고치고 오른쪽에서 결과를 본다. 위아래로 두면 출력을
              보려고 내리는 순간 고치던 칸이 화면에서 사라진다. */}
          <div className="ask-left">
          <div className="ask-why">
            <b>{draft.name}</b>
            {draft.object && <div className="muted small">{draft.object}</div>}
          </div>

          {/* 어느 장비에 보낼지는 사람이 정한다. AI 가 짚은 것을 미리
              골라 두되, 그대로 나가게 두지 않는다. */}
          <label className="ask-dev">
            보낼 장비
            <select value={devId} onChange={(e) => setDevId(e.target.value)}>
              {usable.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name || d.ip} · {d.model || d.role || ''}
                </option>
              ))}
            </select>
          </label>

          {draft.steps.length === 0 ? (
            <div className="muted small">쓸 만한 스텝을 못 만들었습니다. 다르게 말해 보세요.</div>
          ) : (
            <div className="ask-steps">
              {/* 고칠 수 있게 둔다. 대개 명령은 맞는데 판정기준이 아쉽다 */}
              {draft.steps.some((s) => s.type === 'none') && (
                <div className="ask-need">
                  「판정 안 함」 인 스텝이 있습니다 — 돌기만 하고 아무것도 확인하지 못합니다.
                  <b> 오류만 없으면 합격</b> 으로 바꾸거나, 돌린 뒤 출력에서 끌어 채우세요.
                </div>
              )}
              {draft.steps.map((s, i) => (
                <div className="ask-step" key={i}>
                  <div className="ask-step-h">
                    <b>{i + 1}</b>
                    <span>{s.desc || '—'}</span>
                  </div>
                  <input
                    className="mono"
                    value={s.cli}
                    onChange={(e) => setStep(i, { cli: e.target.value })}
                  />
                  <div className="ask-step-c">
                    <select
                      value={s.type ?? 'contains'}
                      onChange={(e) => setStep(i, { type: e.target.value })}
                    >
                      <option value="ok">오류만 없으면 합격</option>
                      <option value="contains">문구 포함</option>
                      <option value="contains_all">모두 포함</option>
                      <option value="notcontains">있으면 불합격</option>
                      <option value="none">판정 안 함</option>
                    </select>
                    {/* 「오류만 없으면」 은 적을 것이 없다. 빈 칸을 내놓으면
                        무엇을 적어야 하나 또 헤매게 된다. */}
                    {s.type === 'ok' || s.type === 'none' ? (
                      <span className="ask-nocrit">
                        {s.type === 'ok' ? '명령이 오류 없이 응답하면 합격' : '아무것도 확인하지 않음'}
                      </span>
                    ) : (
                      <input
                        className={!s.criteria ? 'need' : undefined}
                        value={s.criteria ?? ''}
                        placeholder="판정기준 — 이 문구가 나오면 합격"
                        onChange={(e) => setStep(i, { criteria: e.target.value })}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {(draft.cut?.length ?? 0) > 0 && (
            <div className="ask-drop">
              조회가 아닌 명령 {draft.cut?.length}개는 뺐습니다 — {draft.cut?.join(' · ')}
            </div>
          )}

          <div className="ask-act">
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

          </div>

          {/* 결과 — 스텝마다 판정과 받은 출력 */}
          <div className="ask-right">
          {!ran ? (
            <div className="empty">돌리면 여기에 결과가 나옵니다.</div>
          ) : (
            <div className="ask-res">
              {ran.map((s, i) => {
                const r = String(s.repeatResult ?? s.status ?? '').trim()
                const bad = r.toLowerCase() === 'fail'
                const on = at === i
                return (
                  <div className={`ask-r${bad ? ' bad' : ''}${on ? ' on' : ''}`} key={i}>
                    <div className="ask-r-h">
                      <b>{i + 1}</b>
                      <code>{String(s.cli ?? '').split('\n')[0]}</code>
                      <span className="sp" />
                      {/* 돌았는데 「대기」 로 보이면 안 된다. 판정을 안 한
                          것과 아직 안 돈 것은 다르다. */}
                      <span className={`ask-r-v ${bad ? 'fail' : r ? 'pass' : ''}`}>
                        {on
                          ? '도는 중'
                          : r
                            ? r
                            : s.output
                              ? '판정 안 함'
                              : '대기'}
                      </span>
                    </div>
                    {s.reason && <div className="ask-r-why">{s.reason}</div>}
                    {s.output && (
                      <>
                        {/* 판정기준은 출력을 보고 정하는 것이 제일 정확하다.
                            AI 가 비워 둔 스텝도 여기서 끌어 채우면 된다. */}
                        <pre
                          className="ask-r-out"
                          onMouseUp={() => {
                            const sel = window.getSelection()?.toString().trim() ?? ''
                            if (sel) setGrab({ i, text: sel })
                          }}
                        >
                          {s.output}
                        </pre>
                        {/* 눌러서 정한다. 무엇을 적어야 하는지 몰라도 된다 */}
                        {suggest(String(s.output ?? '')).length > 0 && (
                          <div className="ask-sug">
                            <span className="ask-sug-t">이걸로 판정할까요?</span>
                            {suggest(String(s.output ?? '')).map((g, k) => (
                              <button
                                key={k}
                                type="button"
                                className={
                                  draft.steps[i]?.criteria === g.criteria ? 'on' : undefined
                                }
                                onClick={() => setStep(i, { type: g.type, criteria: g.criteria })}
                              >
                                {g.label}
                              </button>
                            ))}
                            <button
                              type="button"
                              className={draft.steps[i]?.type === 'ok' ? 'on' : undefined}
                              onClick={() => setStep(i, { type: 'ok', criteria: '' })}
                            >
                              오류만 없으면
                            </button>
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
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}
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
              placeholder="무엇을 시험할지 한국어로 적으세요"
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
                              <b>{d.name || d.ip}</b>
                              <span>
                                {d.role ? <i className="r">{d.role}</i> : null}
                                {at ? <i className="p">{at.lab} · {at.rack}{at.pos ? ` · ${at.pos}U` : ''}</i> : null}
                                <i className="ip">{d.ip}</i>
                              </span>
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
                <span className="sp" />
                <button className="btn small" type="button" onClick={() => setPickDev(null)}>
                  그만두기
                </button>
                <button
                  className="btn primary small"
                  type="button"
                  disabled={!pickSel}
                  onClick={() => {
                    setDevId(pickSel)
                    setPickDev(null)
                    void findLike(text).then((n) => (n > 0 ? setLikeAsk(true) : ask()))
                  }}
                >
                  이 장비로 시험 만들기
                </button>
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
              <span className="sp" />
              <button className="btn small" type="button" onClick={() => setLikeAsk(false)}>
                그만두기
              </button>
              <button className="btn primary small" type="button" onClick={() => void ask()}>
                새로 만들기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
