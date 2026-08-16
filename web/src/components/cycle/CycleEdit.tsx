import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, apiFetch, categoryApi } from '@/api/client'
import '@/components/ReqForm.css'
import MarkdownEditor from '@/components/MarkdownEditorLazy'
import { IconChevron, IconFolder } from '@/components/icons'
import {
  buildCategoryTree,
  reqLabel,
  reqPk,
  type CategoryTreeNode,
  type Requirement,
  type TestCaseMeta,
} from '@/types'

/** 배정된 항목 한 줄 */
export interface PickedItem {
  tcid: string
  name?: string | null
  req_id?: string | null
  assignee?: string | null
  steps?: unknown[]
  result?: string | null
}

interface Props {
  /** 고칠 사이클. 없으면 새로 만든다 */
  cycleId?: string
  folders: Record<string, string[]>
  /** 말로 찾아 온 것 — 모델과 시험을 미리 채워 둔다 */
  preset?: { model?: string; tcs: Array<{ tcid: string; name?: string | null; req_id?: string | null }> }
  onClose: () => void
  onDone: (cycleId: string) => void
}

interface CatItem {
  kind: string
  name: string
  vendor?: string | null
  family?: string | null
  model_group?: string | null
}

/**
 * 사이클 만들기 · 고치기.
 *
 * 세 칸이다 — **요구사항으로 좁히고, 시험을 고르고, 배정된 것을 본다.**
 * 옛 화면이 그렇게 되어 있고, 이유가 있다. 시험이 수백 건이라 평평한
 * 목록에서 고르면 무엇을 넣었고 무엇이 남았는지 알 수가 없다.
 *
 * 만들기와 고치기가 같은 창이다. 다르게 만들면 「만들 때는 되는데 고칠
 * 때는 안 되는 것」 이 반드시 생긴다.
 */
export default function CycleEdit({ cycleId, folders, preset, onClose, onDone }: Props) {
  const editing = !!cycleId

  const [vendor, setVendor] = useState('')
  const [family, setFamily] = useState('')
  const [mgroup, setMgroup] = useState('')
  const [model, setModel] = useState('')
  const [vgroup, setVgroup] = useState('')
  const [newVgroup, setNewVgroup] = useState('')
  const [version, setVersion] = useState('')
  /** 제목 — 사람이 손으로 적는 사이클 이름. 버전과 다른 칸이다 */
  const [cname, setCname] = useState('')
  const [cdesc, setCdesc] = useState('')
  const [cstat, setCstat] = useState('')
  const [ccust, setCcust] = useState('')
  /** Zephyr Create Test Cycle 문법 — Details 는 기본 정보, Test Cases 는 항목 */
  const [tab, setTab] = useState<'details' | 'tcs'>('details')
  /** 이미 배정된 항목 숨기기 — 기본은 끔: 담긴 것은 회색으로 같이 보인다 */
  const [hideAdded, setHideAdded] = useState(false)
  /** 배정하면서 바로 넣을 담당자 — 비우면 Details 의 담당(Owner)을 쓴다 */
  const [asgWho, setAsgWho] = useState('')
  /** Zephyr 의 Add others — 체크하면 담은 뒤에도 팝업이 남아 계속 담는다 */
  const [addOthers, setAddOthers] = useState(false)
  /** 항목 추가 팝업 — Test Cases 탭은 담은 결과 화면이고, 추가는 여기서 */
  const [addPop, setAddPop] = useState(false)
  const [assignee, setAssignee] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [picked, setPicked] = useState<PickedItem[]>([])

  /** 1열에서 고른 요구사항 */
  const [reqSel, setReqSel] = useState('')
  /** 폴더로 좁히기 — 폴더를 고르면 그 아래(하위 포함) 요구사항의 TC 전부 */
  const [catSel, setCatSel] = useState('')
  const [openCat, setOpenCat] = useState<Set<string>>(new Set())
  const [reqQ, setReqQ] = useState('')
  /** 2열에서 체크한 TC */
  const [tcSel, setTcSel] = useState<Set<string>>(new Set())
  const [tcQ, setTcQ] = useState('')
  /** 2열 거르개 — 옛 화면의 필터 줄. 자료에 실제로 있는 값만 띄운다 */
  const [fMg, setFMg] = useState('')
  const [fMd, setFMd] = useState('')
  const [fSev, setFSev] = useState('')
  const [fStat, setFStat] = useState('')
  const [fKind, setFKind] = useState('')
  const [fTyp, setFTyp] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose, busy])

  const reqQuery = useQuery({ queryKey: ['reqs'], queryFn: ({ signal }) => api.listRequirements(signal) })
  const catQuery = useQuery({ queryKey: ['req-categories'], queryFn: ({ signal }) => categoryApi.list(signal) })
  const tcQuery = useQuery({
    queryKey: ['tcs'],
    queryFn: async () => {
      const r = await apiFetch('/api/tc?meta=1')
      if (!r.ok) throw new Error('시험 목록을 불러오지 못했습니다')
      return (await r.json()) as { tcs: TestCaseMeta[] }
    },
  })
  const modelQuery = useQuery({
    queryKey: ['device-catalog'],
    queryFn: async () => {
      const r = await apiFetch('/api/device-catalog2')
      if (!r.ok) throw new Error('장비 카탈로그를 불러오지 못했습니다')
      return (await r.json()) as { items: CatItem[] }
    },
    staleTime: 60_000,
  })

  /** 고칠 때는 지금 값을 채워 넣는다 */
  const cycQuery = useQuery({
    queryKey: ['cycle-full', cycleId],
    enabled: editing,
    queryFn: async () => {
      const r = await apiFetch(`/api/cycle/${encodeURIComponent(cycleId ?? '')}`)
      if (!r.ok) throw new Error('사이클을 불러오지 못했습니다')
      return (await r.json()) as Record<string, unknown>
    },
  })

  // 말로 찾아 온 것을 한 번만 채운다. 그 뒤에 사람이 빼거나 더한 것을
  // 되돌리면 안 되므로 preset 이 바뀔 때만 움직인다.
  useEffect(() => {
    if (!preset) return
    if (preset.model) setModel(preset.model)
    setPicked(
      preset.tcs.map((t) => ({
        tcid: t.tcid,
        name: t.name ?? '',
        req_id: t.req_id ?? '',
        steps: [],
      })),
    )
  }, [preset])

  useEffect(() => {
    const d = cycQuery.data
    if (!d) return
    setModel(String(d.model ?? ''))
    const m = (modelQuery.data?.items ?? []).find(
      (x) => x.kind === 'model' && x.name === String(d.model ?? ''),
    )
    if (m) {
      setFamily((m.family ?? '').trim())
      setMgroup((m.model_group ?? '').trim())
    }
    setVgroup(String(d.version_group ?? ''))
    setVersion(String(d.version ?? ''))
    setCname(String(d.name ?? ''))
    setCdesc(String((d as Record<string, unknown>).description ?? ''))
    setCstat(String(d.status ?? ''))
    setCcust(String((d as Record<string, unknown>).customer ?? ''))
    setAssignee(String(d.assignee ?? ''))
    setStart(String(d.start_date ?? ''))
    setEnd(String(d.end_date ?? ''))
    setPicked(Array.isArray(d.items) ? (d.items as PickedItem[]) : [])
  }, [cycQuery.data, modelQuery.data])

  const reqs: Requirement[] = reqQuery.data?.reqs ?? []
  const cats = useMemo(() => buildCategoryTree(catQuery.data?.categories ?? []), [catQuery.data])
  const allTcs = tcQuery.data?.tcs ?? []
  /** 계측기(IXIA·Spirent…)는 뺀다 — 사이클은 유비쿼스 장비 검증이다 */
  const meterish = (x: CatItem) =>
    (x.family ?? '').trim() === '계측기' ||
    /^(ixia|spirent|testcenter)/i.test(String(x.vendor ?? '').trim()) ||
    /^(ixia|n2x|stc|spirent|testcenter|n4u|n11u)/i.test(x.name.trim())
  const models = useMemo(
    () => (modelQuery.data?.items ?? []).filter((x) => x.kind === 'model' && !meterish(x)),
    [modelQuery.data],
  )
  /**
   * 벤더 → 제품군 → 모델그룹 → 모델명 — 옛 화면과 같은 단계 선택.
   *
   * 목록은 **카탈로그가 주인**이다: 제품군은 카탈로그의 제품군 항목
   * (kind=family)에서, 벤더·모델그룹은 모델들이 실제로 쓰는 값에서.
   * 제품군 칸에 모델그룹 이름이 잘못 들어간 자료(E61xx)는 거른다.
   */
  const srt = (a: string, b: string) => a.localeCompare(b, 'ko')
  const vendorOpts = useMemo(
    () => [...new Set(models.map((m) => String(m.vendor ?? '').trim()).filter(Boolean))].sort(srt),
    [models],
  )
  const familyOpts = useMemo(() => {
    const items = modelQuery.data?.items ?? []
    const groupNames = new Set(items.filter((x) => x.kind === 'group').map((x) => x.name.trim()))
    const fromCat = items.filter((x) => x.kind === 'family').map((x) => x.name.trim())
    const fromModels = models
      .filter((m) => !vendor || String(m.vendor ?? '').trim() === vendor)
      .map((m) => (m.family ?? '').trim())
    return [...new Set([...fromCat, ...fromModels])]
      .filter((v) => v && v !== '계측기' && !groupNames.has(v))
      .sort(srt)
  }, [models, modelQuery.data, vendor])
  /**
   * 모델그룹 후보 — 두 무더기로 가른다.
   *
   * 그룹의 제품군은 ① 그룹 행의 제품군 칸 ② 그 그룹을 쓰는 모델들의
   * 제품군에서 추론한다. 제품군을 골랐을 때 「그 제품군 것」 과
   * 「제품군 미지정」 을 갈라 보여준다 — 미지정을 숨기면 E61xx 처럼
   * 연결이 덜 된 그룹이 「못 가져온다」 가 되고, 섞어 버리면 남의
   * 그룹까지 쏟아져 어수선하다. 계측기 그룹은 뺀다.
   */
  const mgroupOpts = useMemo(() => {
    const rows = (modelQuery.data?.items ?? []).filter(
      (x) =>
        x.kind === 'group' &&
        (x.family ?? '').trim() !== '계측기' &&
        !/^(ixia|n2x|stc|spirent|testcenter)/i.test(x.name.trim()),
    )
    const famsOf = (g: string) => {
      const set = new Set<string>()
      const row = rows.find((r) => r.name.trim() === g)
      if ((row?.family ?? '').trim()) set.add((row!.family ?? '').trim())
      for (const m of models)
        if ((m.model_group ?? '').trim() === g && (m.family ?? '').trim())
          set.add((m.family ?? '').trim())
      return set
    }
    const names = [...new Set([
      ...rows.map((g) => g.name.trim()),
      ...models
        .filter((m) => !vendor || String(m.vendor ?? '').trim() === vendor)
        .map((m) => (m.model_group ?? '').trim()),
    ])].filter(Boolean).sort(srt)
    const linked: string[] = []
    const unlinked: string[] = []
    for (const g of names) {
      const fams = famsOf(g)
      if (family && fams.has(family)) linked.push(g)
      else if (fams.size === 0) unlinked.push(g)
      else if (!family) linked.push(g)
    }
    return { linked, unlinked }
  }, [models, modelQuery.data, vendor, family])
  const modelOpts = useMemo(
    () =>
      models.filter(
        (m) =>
          (!vendor || String(m.vendor ?? '').trim() === vendor) &&
          (!family || (m.family ?? '').trim() === family) &&
          (!mgroup || (m.model_group ?? '').trim() === mgroup),
      ),
    [models, vendor, family, mgroup],
  )
  const groups = folders[model] ?? []

  /** 요구사항 id → 그 아래 TC */
  const tcsByReq = useMemo(() => {
    const m = new Map<string, TestCaseMeta[]>()
    for (const t of allTcs) {
      const k = String(t.req_id ?? '')
      const arr = m.get(k)
      if (arr) arr.push(t)
      else m.set(k, [t])
    }
    return m
  }, [allTcs])

  const pickedIds = useMemo(() => new Set(picked.map((x) => x.tcid)), [picked])

  /** 거르개에 띄울 값 — 이 목록에 실제로 있는 것만 */
  const tcOpts = useMemo(() => {
    const sev = new Set<string>()
    const stat = new Set<string>()
    const kin = new Set<string>()
    const typ = new Set<string>()
    const mg = new Set<string>()
    const md = new Set<string>()
    for (const t of allTcs) {
      if (t.severity) sev.add(String(t.severity))
      if (t.status) stat.add(String(t.status))
      if (t.kind) kin.add(String(t.kind))
      if (t.type) typ.add(String(t.type))
      const g = String((t as { model_group?: unknown }).model_group ?? '').trim()
      const m = String((t as { model?: unknown }).model ?? '').trim()
      if (g) mg.add(g)
      if (m) md.add(m)
    }
    const srt = (a: string, b: string) => a.localeCompare(b, 'ko')
    return {
      sev: [...sev].sort(srt),
      stat: [...stat].sort(srt),
      kin: [...kin].sort(srt),
      typ: [...typ].sort(srt),
      mg: [...mg].sort(srt),
      md: [...md].sort(srt),
    }
  }, [allTcs])

  /** 이 폴더(하위 포함) 아래 요구사항들의 pk */
  const reqsUnderCat = useMemo(() => {
    if (!catSel) return null
    const ids = new Set<string>()
    const walk = (n: CategoryTreeNode) => {
      ids.add(n.id)
      n.children.forEach(walk)
    }
    const start = (function find(list: CategoryTreeNode[]): CategoryTreeNode | undefined {
      for (const n of list) {
        if (n.id === catSel) return n
        const hit = find(n.children)
        if (hit) return hit
      }
      return undefined
    })(cats)
    if (start) walk(start)
    const pks = new Set<string>()
    for (const r of reqs)
      if (ids.has(String(r.cat4 || r.cat3 || r.cat2 || r.cat1 || ''))) pks.add(reqPk(r))
    return pks
  }, [catSel, cats, reqs])

  /** 2열에 내놓을 시험 — 요구사항·폴더로 좁히고 거르개·글자로 거른다 */
  const shownTcs = useMemo(() => {
    const base = reqSel
      ? (tcsByReq.get(reqSel) ?? [])
      : reqsUnderCat
        ? allTcs.filter((t) => reqsUnderCat.has(String(t.req_id ?? '')))
        : allTcs
    const n = tcQ.trim().toLowerCase()
    return base.filter((t) => {
      /* 적용 모델 — 시험이 모델명을 명시했으면 그 모델일 때만, 모델그룹만
         명시했으면 그 그룹일 때만 후보다. 미지정 시험은 공용이라 늘 나온다.
         (모델마다 인터페이스가 달라 CLI·판정기준이 갈리는 현실의 답) */
      const tm = String((t as { model?: unknown }).model ?? '').trim()
      const tg = String((t as { model_group?: unknown }).model_group ?? '').trim()
      if (tm) {
        if (!model || tm !== model) return false
      } else if (tg) {
        if (!mgroup || tg !== mgroup) return false
      }
      if (fMg && tg !== (fMg === '\0' ? '' : fMg)) return false
      if (fMd && tm !== (fMd === '\0' ? '' : fMd)) return false
      if (fSev && String(t.severity ?? '') !== fSev) return false
      if (fStat && String(t.status ?? '') !== fStat) return false
      if (fKind && String(t.kind ?? '') !== fKind) return false
      if (fTyp && String(t.type ?? '') !== fTyp) return false
      if (!n) return true
      return `${t.name ?? ''} ${t.tcid}`.toLowerCase().includes(n)
    })
  }, [reqSel, reqsUnderCat, tcQ, tcsByReq, allTcs, fMg, fMd, fSev, fStat, fKind, fTyp, model, mgroup])

  /** 3열 — 요구사항으로 묶는다. 여섯 건만 넘어도 평평하면 안 읽힌다 */
  /** 완료 화면에서 체크한 항목들 (tcid) — 삭제·담당자 할당이 본다 */
  const [doneSel, setDoneSel] = useState<Set<string>>(new Set())
  /** 출력 개수 단위 — 0 은 전체. 골라 두면 기억한다 */
  const [pageSize, setPageSize] = useState<number>(() => {
    const v = Number(localStorage.getItem('utop.cycle.donepage') ?? 50)
    return Number.isFinite(v) ? v : 50
  })
  const [page, setPage] = useState(0)
  /** 최근 결과 — 손 판정이 있으면 그것, 아니면 스텝에서 가볍게 센다 */
  const lastResult = (it: PickedItem): string => {
    const r = String((it as { result?: unknown }).result ?? '').trim()
    if (r) return r
    const steps = (it.steps ?? []) as Array<{ result?: string; status?: string; repeatResult?: string }>
    let pass = false
    for (const st of steps) {
      const v =
        String(st.result ?? '').trim() ||
        String(st.status ?? '').trim() ||
        String(st.repeatResult ?? '').trim()
      if (/^(fail|불합격)$/i.test(v)) return 'Fail'
      if (/^(pass|합격)$/i.test(v)) pass = true
    }
    return pass ? 'Pass' : '미실행'
  }
  const reqTitleOf = (rid: string) => {
    const r = reqs.find((r2) => reqPk(r2) === rid || String(r2.reqid ?? '') === rid)
    // ID 가 아니라 제목 — ID 는 말풍선(title 속성)에
    return String(r?.title ?? '').trim() || '–'
  }


  const assign = (ids: string[]): PickedItem[] => {
    const add = ids
      .filter((id) => !pickedIds.has(id))
      .map((id) => {
        const t = allTcs.find((x) => x.tcid === id)
        return {
          tcid: id,
          name: t?.name ?? '',
          req_id: t?.req_id ?? '',
          assignee: (asgWho.trim() || assignee).trim(),
          steps: [],
        }
      })
    const next = add.length ? [...picked, ...add] : picked
    if (add.length) setPicked(next)
    setTcSel(new Set())
    return next
  }

  /** 골라 둔 것 중 이미 배정된 것을 뺀다 — 결과가 있으면 묻는다 */
  const unassign = (ids: string[]) => {
    const away = new Set(ids.filter((id) => pickedIds.has(id)))
    if (!away.size) return
    const withRuns = picked.filter((x) => away.has(x.tcid) && (x.steps?.length ?? 0) > 0)
    if (
      withRuns.length &&
      !window.confirm(`${withRuns.length}건은 실행 결과가 있습니다. 빼면 결과도 사라집니다. 뺄까요?`)
    )
      return
    setPicked((p) => p.filter((x) => !away.has(x.tcid)))
    setTcSel(new Set())
  }

  /** 설명 틀 — 설정에서 사람이 정의한 것. 새 사이클에 미리 채운다 */
  const tplQ = useQuery({
    queryKey: ['cycle-desc-template'],
    queryFn: async () => {
      const r = await apiFetch('/api/cycle-desc-template')
      if (!r.ok) throw new Error('틀을 불러오지 못했습니다')
      return (await r.json()) as { text: string }
    },
    staleTime: 60_000,
  })
  const tplSeeded = useRef(false)
  useEffect(() => {
    if (tplSeeded.current || editing) return
    const t = (tplQ.data?.text ?? '').trim()
    if (!t) return
    tplSeeded.current = true
    setCdesc((cur) => (cur.trim() ? cur : tplQ.data!.text))
  }, [tplQ.data, editing])

  // 상태·고객 드롭다운 값 — 설정 → 사이클 INFO 필드가 정본
  const codesQ = useQuery({
    queryKey: ['codes'],
    queryFn: async () => {
      const r = await apiFetch('/api/codes')
      if (!r.ok) throw new Error('코드를 불러오지 못했습니다')
      return (await r.json()) as {
        items: Array<{ kind: string; value: string }>
        kinds?: Record<string, string>
      }
    },
    staleTime: 60_000,
  })
  const codeVals = (kind: string) =>
    (codesQ.data?.items ?? []).filter((i) => i.kind === kind).map((i) => i.value)
  /** 숨긴 기본 칸이면 입력칸도 안 그린다 */
  const kindOn = (kind: string) => !codesQ.data?.kinds || kind in codesQ.data.kinds

  const visTcs = hideAdded ? shownTcs.filter((t) => !pickedIds.has(t.tcid)) : shownTcs

  const vg = (newVgroup.trim() || vgroup).trim()
  const ready = !!model && !!version.trim() && picked.length > 0

  const save = async (itemsNow?: PickedItem[]) => {
    setBusy(true)
    setErr('')
    try {
      if (newVgroup.trim()) {
        const next = { ...folders, [model]: [...new Set([...(folders[model] ?? []), vg])] }
        await apiFetch('/api/cycle-version-groups', {
          method: 'POST',
          body: JSON.stringify({ groups: next }),
        })
      }
      const id = cycleId ?? `cycle-${Date.now()}`
      const base = cycQuery.data ?? {}
      const r = await apiFetch(`/api/cycle/${encodeURIComponent(id)}`, {
        method: 'POST',
        body: JSON.stringify({
          ...base,
          id,
          model,
          version_group: vg,
          version: version.trim(),
          name: cname.trim(),
          description: cdesc.trim(),
          status: cstat,
          customer: ccust,
          assignee: assignee.trim(),
          start_date: start || null,
          end_date: end || null,
          created_at: base.created_at ?? new Date().toISOString().slice(0, 10),
          items: itemsNow ?? picked,
        }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || String(r.status))
      onDone(id)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  /** 1열 — 분류 → 요구사항 */
  const renderCat = (n: CategoryTreeNode): React.ReactNode => {
    const mine = reqs.filter((r) => (r.cat4 || r.cat3 || r.cat2 || r.cat1 || null) === n.id)
    const deep = (x: CategoryTreeNode): number =>
      reqs.filter((r) => (r.cat4 || r.cat3 || r.cat2 || r.cat1 || null) === x.id).length +
      x.children.reduce((a, k) => a + deep(k), 0)
    if (deep(n) === 0) return null
    const on = openCat.has(n.id) || !!reqQ.trim()
    return (
      <div key={n.id}>
        <div
          className={`ce-cat${catSel === n.id ? ' on' : ''}`}
          role="button"
          tabIndex={0}
          style={{ paddingLeft: 4 + (n.depth - 1) * 12 }}
          /* 클릭은 고르기다 — 그 폴더(하위 포함)의 TC 로 좁힌다.
             접고 펴는 것은 화살표 몫. 클릭마다 접히면 고르러 간 손이
             트리를 흔든다(사이클 트리에서 겪었다). */
          onClick={() => {
            // 펼치지도 접지도 않는다 — 그건 화살표 몫. 클릭은 고르기뿐이다.
            setCatSel(catSel === n.id ? '' : n.id)
            setReqSel('')
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setCatSel(catSel === n.id ? '' : n.id)
              setReqSel('')
            }
          }}
        >
          <button
            type="button"
            className={`ce-caret${on ? ' open' : ''}`}
            aria-label={on ? '접기' : '펼치기'}
            onClick={(e) => {
              e.stopPropagation()
              setOpenCat((s) => {
                const x = new Set(s)
                if (x.has(n.id)) x.delete(n.id)
                else x.add(n.id)
                return x
              })
            }}
          >
            <IconChevron />
          </button>
          <span className="rt-ficon" aria-hidden="true">
            <IconFolder open={on} />
          </span>
          <b>{n.name}</b>
          <span className="sp" />
          {/* 이 폴더(하위 포함)의 TC 합계 — 옛 화면처럼 접은 채로도 크기가 보인다 */}
          <span className="ce-n">
            TC{' '}
            {(() => {
              const cnt = (x: CategoryTreeNode): number =>
                reqs
                  .filter((r) => (r.cat4 || r.cat3 || r.cat2 || r.cat1 || null) === x.id)
                  .reduce((a, r) => a + (tcsByReq.get(reqPk(r)) ?? []).length, 0) +
                x.children.reduce((a, k) => a + cnt(k), 0)
              return cnt(n)
            })()}
          </span>
        </div>
        {on && (
          <>
            {mine.map((r) => reqRow(r, n.depth))}
            {n.children.map(renderCat)}
          </>
        )}
      </div>
    )
  }

  const reqRow = (r: Requirement, depth: number) => {
    const pk = reqPk(r)
    const cnt = (tcsByReq.get(pk) ?? []).length
    if (reqQ.trim() && !`${reqLabel(r)} ${r.title ?? ''}`.toLowerCase().includes(reqQ.trim().toLowerCase()))
      return null
    return (
      <div
        key={pk}
        className={`ce-req${reqSel === pk ? ' on' : ''}`}
        role="button"
        tabIndex={0}
        style={{ paddingLeft: 10 + depth * 12 }}
        onClick={() => {
          setReqSel(reqSel === pk ? '' : pk)
          setCatSel('')
        }}
        onKeyDown={(e) => e.key === 'Enter' && setReqSel(pk)}
      >
        <span className="ce-req-nm" title={reqLabel(r)}>
          {r.title || reqLabel(r)}
        </span>
        <span className="ce-n">TC {cnt}</span>
      </div>
    )
  }

  return (
    <div className="modal-back" onMouseDown={() => !busy && onClose()}>
      <div
        className="modal ce"
        role="dialog"
        aria-modal="true"
        aria-label={editing ? '사이클 수정' : '사이클 만들기'}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <b>{editing ? '사이클 수정' : '사이클 만들기'}</b>
          {/* 건수는 안 적는다 — 3열 머리(배정된 항목 N)가 이미 말한다 */}
          {err && <span className="muted small err">{err}</span>}
          <span className="sp" />
          {tab === 'tcs' && (
            <>
              <button className="btn small" type="button" onClick={() => setAddPop(true)}>
                ＋ 항목 추가
              </button>
              <span className="ce-n">{picked.length}</span>
              <button
                className="btn small danger"
                type="button"
                disabled={!doneSel.size}
                title="체크한 항목을 사이클에서 뺍니다"
                onClick={() => {
                  const withRuns = picked.filter(
                    (x) => doneSel.has(x.tcid) && (x.steps?.length ?? 0) > 0,
                  )
                  if (
                    withRuns.length &&
                    !window.confirm(
                      `${withRuns.length}건은 실행 결과가 있습니다. 빼면 결과도 사라집니다. 뺄까요?`,
                    )
                  )
                    return
                  setPicked((p) => p.filter((x) => !doneSel.has(x.tcid)))
                  setDoneSel(new Set())
                }}
              >
                삭제{doneSel.size ? ` (${doneSel.size})` : ''}
              </button>
              <button
                className="btn small"
                type="button"
                disabled={!picked.length}
                title="체크한 항목(없으면 전부)의 담당자를 한 번에 정합니다"
                onClick={() => {
                  const who = window.prompt(
                    doneSel.size ? `체크한 ${doneSel.size}건의 담당자` : '담긴 전 항목의 담당자',
                    assignee,
                  )?.trim()
                  if (who === undefined || who === null) return
                  setPicked((p) =>
                    p.map((x) =>
                      !doneSel.size || doneSel.has(x.tcid) ? { ...x, assignee: who } : x,
                    ),
                  )
                  if (!assignee.trim()) setAssignee(who)
                }}
              >
                담당자 할당
              </button>
              <span className="ce-hdiv" aria-hidden="true" />
            </>
          )}
          <button
            className="btn primary"
            type="button"
            disabled={!ready || busy}
            onClick={() => void save()}
          >
            {busy ? '저장 중…' : '저장'}
          </button>
          <button className="btn" type="button" disabled={busy} onClick={onClose}>
            Close
          </button>
        </div>

        {/* Details / Test Cases — 기본 정보와 항목 고르기를 가른다 (Zephyr) */}
        <div className="ce-tabs">
          <button
            type="button"
            className={tab === 'details' ? 'on' : ''}
            onClick={() => setTab('details')}
          >
            Details
          </button>
          <button
            type="button"
            className={tab === 'tcs' ? 'on' : ''}
            onClick={() => setTab('tcs')}
          >
            Test Cases <i className="ce-n">{picked.length}</i>
          </button>
        </div>

        <div className="ce-form" style={{ display: tab === 'details' ? undefined : 'none' }}>
          {/* Name · Description — 위에 넓게 (Zephyr Create Test Cycle) */}
          <div className="ce-left">
          <label className="fld ce-wide">
            <span>제목 (Name) *</span>
            <input
              value={cname}
              placeholder="예: E6100 R300 정기 검증"
              onChange={(e) => setCname(e.target.value)}
            />
          </label>
          <div className="fld ce-wide ce-desc-fld">
            <span>
              설명 (Description)
              {(tplQ.data?.text ?? '').trim() !== '' && (
                <button
                  type="button"
                  className="linkish ce-tpl"
                  title="설정에서 정의한 설명 틀을 넣습니다"
                  onClick={() => {
                    const t = tplQ.data?.text ?? ''
                    if (
                      cdesc.trim() &&
                      cdesc !== t &&
                      !window.confirm('지금 적힌 설명을 틀로 바꿉니다. 계속할까요?')
                    )
                      return
                    setCdesc(t)
                  }}
                >
                  틀 넣기
                </button>
              )}
            </span>
            {/* 서식이 되는 편집기 — 시험 목적·사전준비와 같은 부품 */}
            <div className="ce-md">
              <MarkdownEditor
                value={cdesc}
                onChange={setCdesc}
                placeholder="이 회차의 목적 · 범위"
              />
            </div>
          </div>
          </div>

          <div className="ce-right">
          {/* 벤더 → 제품군 → 모델그룹 → 모델명 — 단계로 좁혀 고른다.
              위를 바꾸면 아래 고른 것은 버린다(범위 밖일 수 있다). */}
          <fieldset className="ce-sec">
            <legend>분류 (Folder)</legend>
          <label className="fld">
            <span>벤더</span>
            <select
              value={vendor}
              onChange={(e) => {
                setVendor(e.target.value)
                setFamily('')
                setMgroup('')
                setModel('')
              }}
            >
              <option value="">전체</option>
              {vendorOpts.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className="fld">
            <span>제품군</span>
            <select
              value={family}
              onChange={(e) => {
                setFamily(e.target.value)
                setMgroup('')
                setModel('')
              }}
            >
              <option value="">전체</option>
              {familyOpts.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className="fld">
            <span>모델그룹</span>
            <select
              value={mgroup}
              onChange={(e) => {
                setMgroup(e.target.value)
                setModel('')
              }}
            >
              <option value="">전체</option>
              {mgroupOpts.linked.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
              {mgroupOpts.unlinked.length > 0 && (
                <optgroup label="제품군 미지정 그룹">
                  {mgroupOpts.unlinked.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
          <label className="fld">
            <span>모델명</span>
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              <option value="">고르세요</option>
              {modelOpts.map((m) => (
                <option key={m.name} value={m.name}>{m.name}</option>
              ))}
            </select>
          </label>
          </fieldset>

          <fieldset className="ce-sec">
            <legend>버전 (Version)</legend>
          <label className="fld">
            <span>버전그룹</span>
            <select value={vgroup} disabled={!!newVgroup.trim()} onChange={(e) => setVgroup(e.target.value)}>
              <option value="">(없음)</option>
              {groups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <label className="fld">
            <span>새 버전그룹</span>
            <input value={newVgroup} placeholder="R300" onChange={(e) => setNewVgroup(e.target.value)} />
          </label>
          <label className="fld">
            <span>버전명</span>
            <input
              className="mono"
              value={version}
              placeholder="R300_20260630"
              onChange={(e) => setVersion(e.target.value)}
            />
          </label>

          </fieldset>

          <fieldset className="ce-sec">
            <legend>관리 (Status · Owner)</legend>
          {kindOn('cycle_status') && (
          <label className="fld">
            <span>상태 (Status)</span>
            <select value={cstat} onChange={(e) => setCstat(e.target.value)}>
              <option value="">(없음)</option>
              {codeVals('cycle_status').map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
          )}
          {kindOn('cycle_customer') && (
          <label className="fld">
            <span>고객</span>
            <select value={ccust} onChange={(e) => setCcust(e.target.value)}>
              <option value="">(없음)</option>
              {codeVals('cycle_customer').map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
          )}
          <label className="fld">
            <span>담당 (Owner)</span>
            <input value={assignee} onChange={(e) => setAssignee(e.target.value)} />
          </label>
          <label className="fld">
            <span>기간</span>
            <span className="ce-dates">
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </span>
          </label>
          </fieldset>
          </div>

        </div>

        {/* Test Cases 탭 — 담은 항목 완료 화면. 여기서 항목별 담당자를 정한다 */}
        {tab === 'tcs' && (
          <div className="ce-done">
            <div className="ce-body ce-donelist">
              {picked.length === 0 ? (
                <div className="empty">아직 담긴 시험이 없습니다 — 위 「＋ 항목 추가」 로 담으세요.</div>
              ) : (
                <>
                  <div className="ce-dt ce-dthd">
                    <span className="ce-dtno">No</span>
                    <span className="ce-dtck">
                      <input
                        type="checkbox"
                        checked={picked.length > 0 && doneSel.size === picked.length}
                        ref={(el) => {
                          if (el)
                            el.indeterminate = doneSel.size > 0 && doneSel.size < picked.length
                        }}
                        onChange={() =>
                          setDoneSel(
                            doneSel.size === picked.length
                              ? new Set()
                              : new Set(picked.map((x) => x.tcid)),
                          )
                        }
                      />
                    </span>
                    <span>요구사항 제목</span>
                    <span>시험항목 제목</span>
                    <span>최근 결과</span>
                    <span>담당자</span>
                  </div>
                  {(pageSize > 0
                    ? picked.slice(
                        Math.min(page, Math.max(0, Math.ceil(picked.length / pageSize) - 1)) *
                          pageSize,
                        Math.min(page, Math.max(0, Math.ceil(picked.length / pageSize) - 1)) *
                          pageSize +
                          pageSize,
                      )
                    : picked
                  ).map((it) => {
                    const v = lastResult(it)
                    const no = picked.indexOf(it) + 1
                    return (
                      <div className="ce-dt" key={it.tcid}>
                        <span className="ce-dtno">{no}</span>
                        <span className="ce-dtck">
                          <input
                            type="checkbox"
                            checked={doneSel.has(it.tcid)}
                            onChange={() =>
                              setDoneSel((cur) => {
                                const n = new Set(cur)
                                if (n.has(it.tcid)) n.delete(it.tcid)
                                else n.add(it.tcid)
                                return n
                              })
                            }
                          />
                        </span>
                        <span className="ce-dtreq cyt-ell" title={String(it.req_id ?? '')}>
                          {reqTitleOf(String(it.req_id ?? ''))}
                        </span>
                        <span className="cyt-ell" title={it.tcid}>
                          {it.name || it.tcid}
                        </span>
                        <span>
                          <em
                            className={`ce-dtv ${v === 'Pass' ? 'pass' : v === 'Fail' ? 'fail' : ''}`}
                          >
                            {v}
                          </em>
                        </span>
                        <input
                          className="ce-iwho"
                          value={String(it.assignee ?? '')}
                          placeholder="담당자"
                          onChange={(e) =>
                            setPicked((p) =>
                              p.map((x) =>
                                x.tcid === it.tcid ? { ...x, assignee: e.target.value } : x,
                              ),
                            )
                          }
                        />
                      </div>
                    )
                  })}
                </>
              )}
            </div>
            {picked.length > 0 && (
              <div className="ce-pager">
                {(() => {
                  const total = picked.length
                  const size = pageSize > 0 ? pageSize : total
                  const maxPage = Math.max(0, Math.ceil(total / size) - 1)
                  const cur = Math.min(page, maxPage)
                  const from = cur * size + 1
                  const to = Math.min(total, (cur + 1) * size)
                  return (
                    <>
                      <span className="muted small">
                        총 {total}건 · {from}–{to} 표시
                      </span>
                      <span className="sp" />
                      <select
                        value={pageSize}
                        title="출력 개수 단위"
                        onChange={(e) => {
                          const v = Number(e.target.value)
                          setPageSize(v)
                          setPage(0)
                          localStorage.setItem('utop.cycle.donepage', String(v))
                        }}
                      >
                        <option value={20}>20개씩</option>
                        <option value={50}>50개씩</option>
                        <option value={100}>100개씩</option>
                        <option value={0}>전체</option>
                      </select>
                      <button
                        className="btn small"
                        type="button"
                        disabled={cur === 0}
                        onClick={() => setPage(Math.max(0, cur - 1))}
                      >
                        ‹ 이전
                      </button>
                      <span className="muted small">
                        {cur + 1} / {maxPage + 1}
                      </span>
                      <button
                        className="btn small"
                        type="button"
                        disabled={cur >= maxPage}
                        onClick={() => setPage(Math.min(maxPage, cur + 1))}
                      >
                        다음 ›
                      </button>
                    </>
                  )
                })()}
              </div>
            )}
          </div>
        )}

        {addPop && (
        <div className="ce-popback" onMouseDown={(e) => e.stopPropagation()}>
        <div className="ce-pop">
          <div className="ce-pophead">
            <b>항목 추가 — Add Existing Test Cases</b>
            <span className="sp" />
            <label className="ce-hide" title="이미 배정된 항목을 목록에서 숨깁니다">
              <input
                type="checkbox"
                checked={hideAdded}
                onChange={(e) => setHideAdded(e.target.checked)}
              />
              담은 항목 숨기기
            </label>
            <button
              className="btn small"
              type="button"
              title="보이는 것 전부 고르기"
              onClick={() => setTcSel(new Set(visTcs.map((t) => t.tcid)))}
            >
              전체
            </button>
            <button
              className="btn small danger"
              type="button"
              title="고른 것 중 이미 배정된 것을 뺍니다"
              disabled={![...tcSel].some((id) => pickedIds.has(id))}
              onClick={() => unassign([...tcSel])}
            >
              ← 해제
            </button>
            <button className="btn small" type="button" onClick={() => setAddPop(false)}>
              ✕
            </button>
          </div>
        <div className="ce-cols">
          {/* 1열 — 요구사항으로 좁힌다 */}
          <div className="ce-col">
            <div className="ce-colhead">
              <b>요구사항</b>
              {/* 「전체」 같은 별도 단추는 없다 — 요구사항·Coverage 의 1열과
                  같은 문법이다. 고른 폴더를 다시 누르면 풀린다. */}
            </div>
            <input
              className="ce-q"
              value={reqQ}
              placeholder="요구사항 찾기"
              onChange={(e) => setReqQ(e.target.value)}
            />
            <div className="ce-body">
              {cats.map(renderCat)}
              {reqs
                .filter((r) => !(r.cat4 || r.cat3 || r.cat2 || r.cat1))
                .map((r) => reqRow(r, 0))}
            </div>
          </div>

          {/* 2열 — 시험 고르기 */}
          <div className="ce-col">
            <div className="ce-colhead">
              <b>시험항목</b>
              <span className="muted small">{visTcs.length}건</span>
              <input
                className="ce-q"
                value={tcQ}
                placeholder="시험 찾기"
                onChange={(e) => setTcQ(e.target.value)}
              />
              <span className="sp" />
            <div className="ce-filters">
              <select value={fMg} onChange={(e) => setFMg(e.target.value)} title="모델그룹">
                <option value="">모델그룹: 전체</option>
                <option value="\0">(공용)</option>
                {tcOpts.mg.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
              <select value={fMd} onChange={(e) => setFMd(e.target.value)} title="모델명">
                <option value="">모델명: 전체</option>
                <option value="\0">(미지정)</option>
                {tcOpts.md.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
              <select value={fSev} onChange={(e) => setFSev(e.target.value)} title="심각도">
                <option value="">심각도: 전체</option>
                {tcOpts.sev.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
              <select value={fStat} onChange={(e) => setFStat(e.target.value)} title="상태">
                <option value="">상태: 전체</option>
                {tcOpts.stat.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
              <select value={fKind} onChange={(e) => setFKind(e.target.value)} title="발생구분">
                <option value="">발생구분: 전체</option>
                {tcOpts.kin.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
              <select value={fTyp} onChange={(e) => setFTyp(e.target.value)} title="타입">
                <option value="">타입: 전체</option>
                {tcOpts.typ.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
              {(fSev || fStat || fKind || fTyp) && (
                <button
                  className="btn small"
                  type="button"
                  onClick={() => {
                    setFSev('')
                    setFStat('')
                    setFKind('')
                    setFTyp('')
                  }}
                >
                  ✕
                </button>
              )}
            </div>
            </div>
            <div className="ce-body">
              {tcQuery.isLoading ? (
                <div className="empty">불러오는 중…</div>
              ) : visTcs.length === 0 ? (
                <div className="empty">
                  {shownTcs.length > 0 && hideAdded
                    ? '보이는 항목이 전부 배정돼 숨었습니다 — 「담은 항목 숨기기」 를 끄면 보입니다.'
                    : '왼쪽에서 요구사항을 고르거나 위에서 찾으세요.'}
                </div>
              ) : (
                visTcs.map((t) => {
                  const already = pickedIds.has(t.tcid)
                  return (
                    <label className={`ce-tc${already ? ' off' : ''}`} key={t.tcid}>
                      <input
                        type="checkbox"
                        checked={tcSel.has(t.tcid)}
                        onChange={(e) =>
                          setTcSel((s) => {
                            const n = new Set(s)
                            if (e.target.checked) n.add(t.tcid)
                            else n.delete(t.tcid)
                            return n
                          })
                        }
                      />
                      {/* Zephyr 처럼 — 키(TC ID)·제목·상태가 한 줄에 */}
                      <b className="ce-tcid">{t.tcid}</b>
                      <span className="ce-tc-nm" title={t.tcid}>
                        {t.name || '(제목 없음)'}
                      </span>
                      {/* 상태·배정됨은 늘 같은 자리 — 없으면 빈 칸이 자리를 지킨다 */}
                      <i className="ce-tcst">{t.status ? String(t.status) : ''}</i>
                      <span className="ce-tcadd">{already ? '배정됨' : ''}</span>
                    </label>
                  )
                })
              )}
            </div>
            {/* 항목 추가는 아래에서 — Zephyr 의 Add / Add others 자리 */}
            <div className="ce-addbar">
              <input
                className="ce-who"
                value={asgWho}
                placeholder="담당자 (선택)"
                title="담으면서 이 담당자를 넣습니다 (비우면 Details 의 담당)"
                onChange={(e) => setAsgWho(e.target.value)}
              />
              <span className="muted small">
                {tcSel.size ? `${tcSel.size}건 고름` : '체크한 항목을 담습니다'}
              </span>
              <label className="ce-hide" title="체크해 두면 담은 뒤에도 창이 남아 계속 담습니다">
                <input
                  type="checkbox"
                  checked={addOthers}
                  onChange={(e) => setAddOthers(e.target.checked)}
                />
                Add others
              </label>
              <span className="sp" />
              <button
                className="btn primary"
                type="button"
                disabled={busy || ![...tcSel].some((id) => !pickedIds.has(id))}
                title={
                  addOthers
                    ? '담고 나서 계속 고릅니다'
                    : '담고 저장한 뒤 창을 닫습니다'
                }
                onClick={() => {
                  assign([...tcSel])
                  if (addOthers) {
                    setTcQ('')
                    return
                  }
                  // 미체크 = 담고 끝 — 팝업이 닫히고 완료 화면으로 돌아간다
                  setAddPop(false)
                }}
              >
                Add
              </button>
              <button className="btn" type="button" disabled={busy} onClick={() => setAddPop(false)}>
                Close
              </button>
            </div>
          </div>

        </div>
        </div>
        </div>
        )}


      </div>
    </div>
  )
}
