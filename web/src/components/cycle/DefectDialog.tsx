import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/api/client'
import { stepVerdict, type TcStep } from '@/components/tc/types'
import type { CycleItemLite, CycleStep } from '@/pages/Cycles'
import './DefectDialog.css'
import { buildDefectWiki, kernelFromSteps, wikiToHtml, type WikiStep, configFromSteps} from '@/lib/jiraWiki'
import AutoGrow from './AutoGrow'
import { boardShot } from '@/components/tc/boardShot'
import { wireShot } from '@/components/tc/wireMermaid'
import { connParams } from '@/components/tc/device'
import { sessionIndex } from '@/components/tc/types'
import type { Device } from '@/pages/Devices'
import type { TcPortLink, TcWire } from '@/components/tc/types'
import JiraFields, { toJiraFields, toPreviewRows, type JiraField, type JiraFieldValues } from './JiraFields'

/** UTOP 안에 쌓는 결함 한 건 */
export interface DefectRec {
  id: string
  status: string
  title?: string
  tcid?: string | null
  tc_name?: string | null
  jira_key?: string | null
  jira_project?: string | null
  project_name?: string | null
  issue_type?: string | null
  priority?: string | null
  fix_version?: string | null
  component?: string | null
  reporter?: string | null
  created_by?: string | null
  created_at?: string | null
  steps?: unknown
  /** 이슈 본문 여덟 판 — 현상·시험구성도·시험절차·시험내역·Config·Core·Kernel Log·첨부파일 */
  panels?: Record<string, string>
}

/** 깨진 스텝을 5번 판에 넣을 글로 편다 — 사람이 손보기 쉬운 평문으로 */
function stepsText(bs: Array<{ no: number | string; desc?: string; cli?: string; status?: string; criteria?: string; reason?: string; output?: string }>): string {
  const L: string[] = []
  for (const b of bs) {
    L.push(`#${b.no} ${b.desc || b.cli || ''}${b.status ? ` (${b.status})` : ''}`)
    if (b.cli) L.push(`  명령: ${b.cli}`)
    if (b.criteria) L.push(`  판정 기준: ${b.criteria}`)
    if (b.reason) L.push(`  판정 근거: ${b.reason}`)
    const out = String(b.output ?? '').trim()
    if (out) L.push(out.split('\n').map((x) => `  ${x}`).join('\n'))
    L.push('')
  }
  return L.join('\n').trimEnd()
}

/** 이슈 본문 판 — 백엔드 _DEFECT_PANELS 와 같은 차례·같은 열쇠.
 *
 * 여덟 판으로 바꿨다(지시). 열쇠는 **바꾸지 않은 것을 그대로 둔다** —
 * topo·steps·kernel 은 자리와 이름만 옮겼다. 열쇠를 새로 지으면 이미
 * 저장된 결함의 그 판이 빈 칸이 되고, 자동 채움도 끊긴다. */
const PANELS: Array<{ k: string; label: string; ph: string; rows: number }> = [
  { k: 'symptom', label: '현상', ph: '무엇이 어떻게 잘못 나왔는지', rows: 3 },
  { k: 'topo', label: '시험구성도', ph: '구성 설명 또는 파일명', rows: 3 },
  { k: 'steps', label: '시험절차', ph: '시험 절차를 입력하세요', rows: 6 },
  { k: 'detail', label: '시험내역', ph: '사이클 / 시험 항목 / 모델 · 버전', rows: 3 },
  { k: 'config', label: 'Configuration File (Config File)', ph: 'running-config 또는 파일명', rows: 4 },
  { k: 'core', label: 'Core File (Upload Core file)', ph: 'core 파일 이름 · 올린 곳', rows: 3 },
  { k: 'kernel', label: 'Kernel Log & Syslog 조회', ph: 'Kernel Log / Syslog 출력', rows: 4 },
  { k: 'attach', label: '첨부파일', ph: '첨부한 파일 이름 · 설명', rows: 3 },
]

interface Props {
  /** 사이클에서 열 때만 준다. Defects 목록에서 열면 없다(이미 저장된 결함이라) */
  cycle?: { id: string; model?: string | null; version?: string | null }
  item?: CycleItemLite
  /** 이미 걸린 결함 (있으면 그 값으로 채운다). 목록에서 열면 반드시 있다 */
  existing: DefectRec | null
  onClose: () => void
  onSaved: (d: DefectRec) => void
  /** 결함이 지워졌을 때(목록에서 삭제) */
  onDeleted?: (id: string) => void
}

const isFail = (r: string) => r === 'Fail' || r === '불합격'

/** 한 스텝을 결함에 담을 모양으로 추린다 */
interface StepBrief {
  no: number
  kind: string
  desc: string
  cli: string
  criteria: string
  status: string
  reason: string
  output: string
  actual_img: string
}

/** 항목의 깨진 스텝(없으면 전체)을 자세히 뽑는다 */
function briefsOf(item: CycleItemLite): StepBrief[] {
  const steps = (item.steps ?? []) as CycleStep[]
  const bad = steps.filter((x) => isFail(stepVerdict(x as TcStep)))
  const pick = bad.length ? bad : steps
  return pick.map((x, i) => ({
    no: steps.indexOf(x) + 1 || i + 1,
    kind: x.kind ?? 'cli',
    desc: x.desc ?? x.step ?? '',
    cli: x.cli ?? '',
    criteria: x.criteria ?? '',
    status: stepVerdict(x as TcStep),
    reason: x.reason ?? '',
    output: String(x.output ?? '').slice(0, 4000),
    actual_img: x.actual_img ?? '',
  }))
}

/** 이미 저장된 결함의 steps(JSONB)를 그대로 읽는다 — 목록에서 열 때 */
function briefsFromDefect(d: DefectRec | null): StepBrief[] {
  const arr = Array.isArray(d?.steps) ? (d!.steps as Array<Record<string, unknown>>) : []
  return arr.map((x, i) => ({
    no: Number(x.no ?? i + 1),
    kind: String(x.kind ?? 'cli'),
    desc: String(x.desc ?? ''),
    cli: String(x.cli ?? ''),
    criteria: String(x.criteria ?? ''),
    status: String(x.status ?? ''),
    reason: String(x.reason ?? ''),
    output: String(x.output ?? ''),
    actual_img: String(x.actual_img ?? ''),
  }))
}


/**
 * 결함 등록 창.
 *
 * 사이클 항목에서 「이슈 생성」 을 누르면 뜬다. 깨진 스텝을 그대로 담고,
 * 프로젝트 키·프로젝트명·이슈유형·우선순위·수정버전·구성요소·보고자·등록자·
 * 등록일 아홉 칸을 채워 Jira 이슈로 올린다.
 *
 * UTOP 안에는 먼저 저장하고(항목당 하나), 「지라에 등록」 을 누를 때 실제로
 * 이슈가 생긴다 — 64건 돌려 20건 깨졌다고 이슈 20개가 한꺼번에 생기지 않게.
 */
export default function DefectDialog({ cycle, item, existing, onClose, onSaved, onDeleted }: Props) {
  const briefs = useMemo(() => (item ? briefsOf(item) : briefsFromDefect(existing)), [item, existing])

  /* 설정 파일을 찾을 때는 **깨진 것만이 아니라 모든 스텝**을 본다.
     briefs 는 Fail 이 있으면 그것만 골라 담으므로, 통과한 `show
     running-config` 스텝이 거기엔 없다. */
  const allSteps = useMemo(
    () => (item ? ((item.steps ?? []) as unknown as WikiStep[]) : briefsFromDefect(existing) as unknown as WikiStep[]),
    [item, existing],
  )
  const cfgFromSteps = useMemo(() => configFromSteps(allSteps), [allSteps])

  /**
   * 깨졌을 때의 **설정 파일**.
   *
   * 시험이 `show running-config` 를 찍어 두었으면 그것을 쓴다. 대개는 안
   * 찍는다 — 시험은 확인할 것만 보지 설정 전체를 뜨지 않는다. 그런데 결함을
   * 볼 사람에게는 **그때 장비가 어떤 설정이었나**가 첫 물음이다.
   *
   * 그래서 스텝에 없으면 결함을 여는 이 순간 장비에서 한 번 읽어 온다. 읽고
   * 나면 결함에 **글로 박히므로**, 나중에 장비 설정이 바뀌어도 이 결함에
   * 남은 것은 그때 읽은 그대로다.
   *
   * 「깨진 그 순간」 과 「결함을 연 순간」 사이에 시간이 있다. 시험이 끝나고
   * 바로 여는 흐름이라 대개 같지만, 같다고 우기지 않고 언제 읽었는지를
   * 함께 적는다.
   */
  const [cfgLive, setCfgLive] = useState('')
  useEffect(() => {
    if (cfgFromSteps || !item?.devId || existing) return
    let dead = false
    void (async () => {
      try {
        const dr = await apiFetch('/api/devices')
        const devs = ((await dr.json()) as { devices?: Device[] }).devices ?? []
        const dev = devs.find((d) => d.id === item.devId)
        if (!dev) return
        const r = await apiFetch('/api/run-cli', {
          method: 'POST',
          body: JSON.stringify({
            ...connParams(dev),
            /* 세션 자리 — 스텝이 앉은 그 자리로 읽어야 같은 장비의 같은
             접속에서 나온 설정이다 */
          sess: sessionIndex(
            String((allSteps[0] as unknown as { session?: string })?.session ?? ''),
          ),
            commands: ['show running-config'],
            require_session: true,
          }),
        })
        const j = (await r.json()) as { ok?: boolean; outputs?: string[]; output?: string }
        const out = (j.outputs?.join('\n') || j.output || '').trim()
        if (!dead && out) setCfgLive(out)
      } catch {
        /* 못 읽어도 결함 등록은 막지 않는다 — 설정은 곁들이는 값이다 */
      }
    })()
    return () => {
      dead = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfgFromSteps, item?.devId, existing])

  const cfgText = cfgFromSteps || cfgLive

  /* 구성도 — 시험항목이 가진 그림이다. 프로젝트가 따로 갖고 있는 그림은
     이 시스템에 없다: 구성도는 「이 시험을 어떻게 꾸몄나」 라서 시험항목에
     붙는다. 결함이 걸린 그 항목의 것이 곧 이 결함의 구성도다. */
  const tcid = item?.tcid || existing?.tcid || ''
  const [topoImg, setTopoImg] = useState('')
  useEffect(() => {
    if (!tcid) return
    let dead = false
    void (async () => {
      try {
        const r = await apiFetch(`/api/tc/${encodeURIComponent(tcid)}`)
        const t = (await r.json()) as Record<string, unknown>
        const e = (t.tc as Record<string, unknown>) ?? t
        const img = String(e.topo_img ?? '')
        if (img) {
          if (!dead) setTopoImg(img)
          return
        }
        /* 그림이 저장돼 있지 않으면 **판을 그려서** 만든다.
           구성도는 대개 배선판에만 있고 그림으로는 안 굽혀 있다 — 결과서가
           같은 일을 한다(CycleReport). 여기서만 「구성도 없음」 이라고 하면
           같은 시험이 화면마다 다른 말을 한다. */
        const wiring = (e.wiring ?? []) as TcWire[]
        const links = (e.portLinks ?? []) as TcPortLink[]
        if (!wiring.length && !links.length) return
        const dr = await apiFetch('/api/devices')
        const devices = ((await dr.json()) as { devices?: Device[] }).devices ?? []
        if (!devices.length) return
        const sessions = Array.isArray(e.sessions) ? (e.sessions as string[]) : []
        const placed = (e.topoNodes ?? []) as Array<{ dev: string; x: number; y: number }>
        const shot = placed.length
          ? await boardShot({ devices, wiring, links, sessions, placed })
          : await wireShot({ devices, wiring, links, sessions })
        if (!dead && shot) setTopoImg(shot.data)
      } catch {
        /* 못 읽으면 그림 없이 간다 — 결함 등록이 그림 때문에 막히면 안 된다 */
      }
    })()
    return () => { dead = true }
  }, [tcid])
  const failN = briefs.filter((b) => b.status === 'Fail').length
  const heading = item ? item.name || item.tcid : existing?.tc_name || existing?.title || existing?.id || '결함'

  // 아홉 칸
  const [proj, setProj] = useState(existing?.jira_project ?? '')
  const [projName, setProjName] = useState(existing?.project_name ?? '')
  const [itype, setItype] = useState(existing?.issue_type ?? 'Defect')
  const prio = existing?.priority ?? 'Major'
  const fixv = existing?.fix_version ?? cycle?.version ?? ''
  const comp = existing?.component ?? cycle?.model ?? ''
  const reporter = existing?.reporter ?? ''
  const [me, setMe] = useState(existing?.created_by ?? '')
  const [title, setTitle] = useState(
    existing?.title ??
      `[${cycle?.model ?? ''} ${cycle?.version ?? ''}] ${item?.name || item?.tcid || ''}${
        briefs[0] ? ` — ${briefs[0].reason || briefs[0].desc}` : ''
      }`.trim(),
  )

  /* 이슈 본문 여섯 판 — Jira 프로젝트 패널 설정과 같은 차례·같은 이름.
     번호를 붙여 두면 사람이 「3번 비었다」 고 말할 수 있다. */
  const [panels, setPanels] = useState<Record<string, string>>(() => ({
    ...(existing?.panels ?? {}),
  }))
  /* 이 프로젝트가 요구하는 칸들 — Jira 에게 물어 그린다(JiraFields) */
  const [jfVals, setJfVals] = useState<JiraFieldValues>({})
  const [jfDefs, setJfDefs] = useState<JiraField[]>([])
  const [labels, setLabels] = useState('utop')
  const setPanel = (k: string, v: string) => setPanels((p) => ({ ...p, [k]: v }))
  /* 미리보기 = 올라갈 글. 두 곳에서 따로 만들면 화면에서 본 것과 Jira 에
     남은 것이 달라지고, 그 어긋남은 이슈를 연 사람이 아니라 그걸 읽는
     개발자가 먼저 겪는다. 그래서 한 함수로 만들어 둘 다 쓴다. */
  const wiki = useMemo(
    () =>
      buildDefectWiki(panels, briefs as WikiStep[], {
        /* 그림 표시는 **첨부에 성공할 때만** 서야 하지만, 미리보기에서는
           올릴 예정임을 보여 준다 — 등록 뒤에 첨부가 따라 붙는다 */
        image: !!topoImg && !String(panels.topo ?? '').trim(),
        config: cfgText,
      }),
    [panels, briefs, topoImg, cfgText],
  )
  /* 미리보기 아래에 적을 것들 — 왼쪽에서 고른 그대로 */
  const prevRows = useMemo(() => toPreviewRows(jfDefs, jfVals), [jfDefs, jfVals])
  const labelList = useMemo(
    () => labels.split(',').map((x) => x.trim()).filter(Boolean),
    [labels],
  )

  // 드롭다운 목록
  const [projects, setProjects] = useState<Array<{ key: string; name: string }>>([])
  const [itypes, setItypes] = useState<string[]>([])

  const [defect, setDefect] = useState<DefectRec | null>(existing)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ kind: string; text: string }>({ kind: '', text: '' })

  // 나(등록자) — 아직 저장 전이면 백엔드가 채우기 전이라 여기서 보여만 준다
  useEffect(() => {
    if (me) return
    void (async () => {
      try {
        const r = await apiFetch('/api/me')
        const j = (await r.json()) as { user?: { username?: string; name?: string } }
        setMe(j.user?.name || j.user?.username || '')
      } catch {
        /* 무시 */
      }
    })()
  }, [me])

  // 프로젝트 목록
  useEffect(() => {
    void (async () => {
      try {
        const r = await apiFetch('/api/jira/projects')
        const j = (await r.json()) as { ok?: boolean; projects?: Array<{ key: string; name: string }> }
        if (j.ok) setProjects(j.projects ?? [])
      } catch {
        /* 무시 */
      }
    })()
  }, [])

  // 프로젝트를 고르면 이슈유형·수정버전·구성요소를 그 프로젝트 것으로 갈아 끼운다
  useEffect(() => {
    if (!proj) {
      setItypes([])
      return
    }
    const p = projects.find((x) => x.key === proj)
    if (p && p.name) setProjName(p.name)
    void (async () => {
      try {
        /* 이슈유형만 물으면 된다 — 수정버전·구성요소 칸은 「이슈 칸 더 보기」
           와 함께 없어졌고, 그 값들은 아래 Jira 칸 묶음이 제 손으로 받아 온다.
           안 쓰는 값을 받으러 매번 다녀올 까닭이 없다. */
        const it = await apiFetch(
          `/api/jira/issuetypes?project=${encodeURIComponent(proj)}`,
        ).then((r) => r.json())
        if (it?.ok) setItypes((it.issuetypes ?? []).map((t: { name: string }) => t.name).filter(Boolean))
      } catch {
        /* 무시 */
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proj, projects])

  /* 보고자 찾기는 뺐다 — 그 칸이 「이슈 칸 더 보기」 안에 있었다 */

  /** UTOP 안에 저장(항목당 하나). 이미 있으면 그대로 쓴다. */
  const save = async (): Promise<DefectRec | null> => {
    if (defect) return defect
    if (!item || !cycle) return null // 목록에서 연 경우엔 이미 저장돼 있어 만들 일이 없다
    setBusy('save')
    try {
      const r = await apiFetch('/api/defects', {
        method: 'POST',
        body: JSON.stringify({
          cycle_id: cycle.id,
          cycle_name: [cycle.model, cycle.version].filter(Boolean).join(' · '),
          tcid: item.tcid,
          tc_name: item.name || item.tcid,
          model: cycle.model,
          version: cycle.version,
          title,
          steps: briefs,
          jira_project: proj,
          project_name: projName,
          issue_type: itype,
          priority: prio,
          fix_version: fixv,
          component: comp,
          reporter,
          panels,
        }),
      })
      const j = (await r.json()) as { defect: DefectRec; existed?: boolean }
      setDefect(j.defect)
      onSaved(j.defect)
      setMsg({ kind: 'ok', text: j.existed ? `이미 등록된 결함입니다 (${j.defect.id})` : `UTOP에 등록했습니다 (${j.defect.id})` })
      return j.defect
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) })
      return null
    } finally {
      setBusy('')
    }
  }

  // 창이 열리면 곧바로 UTOP 에 결함을 등록한다. 「등록」 은 버튼을 누르는
  // 순간 끝나야 한다 — 창만 보고 닫아도 Defects 에 남아 있게. 지라로 올리는
  // 것은 그다음 「지라에 등록」 을 눌러야 일어난다.
  useEffect(() => {
    if (!existing && item && cycle) void save()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 아홉 칸을 고치면 UTOP 에 반영한다(지라로 안 올려도 값이 남게) */
  const patchFields = async () => {
    if (!defect) return
    setBusy('save')
    try {
      const r = await apiFetch(`/api/defects/${encodeURIComponent(defect.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title,
          jira_project: proj,
          project_name: projName,
          issue_type: itype,
          priority: prio,
          fix_version: fixv,
          component: comp,
          reporter,
          panels,
        }),
      })
      const j = (await r.json()) as { defect: DefectRec }
      setDefect(j.defect)
      onSaved(j.defect)
      setMsg({ kind: 'ok', text: '저장했습니다' })
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy('')
    }
  }

  /** 결함을 지운다(목록에서 열었을 때) */
  const remove = async () => {
    if (!defect) return
    if (!window.confirm(`결함 ${defect.id} 를 삭제할까요?`)) return
    setBusy('del')
    try {
      await apiFetch(`/api/defects/${encodeURIComponent(defect.id)}`, { method: 'DELETE' })
      onDeleted?.(defect.id)
      onClose()
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) })
      setBusy('')
    }
  }

  /** 지라에 이슈를 올린다 — 없으면 먼저 저장하고 민다 */
  const push = async () => {
    if (!proj) {
      setMsg({ kind: 'err', text: '프로젝트 키를 고르세요' })
      return
    }
    /* 필수 칸이 비면 Jira 는 「필드가 잘못됐다」 한 줄만 주고 어느 칸인지
       말해 주지 않는다. 보내기 전에 여기서 짚어 준다. */
    const jira = toJiraFields(jfDefs, jfVals)
    if (jira.missing.length) {
      setMsg({ kind: 'err', text: `채워야 하는 칸: ${jira.missing.join(', ')}` })
      return
    }
    const d = await save()
    if (!d) return
    setBusy('push')
    try {
      const r = await apiFetch(`/api/defects/${encodeURIComponent(d.id)}/push`, {
        method: 'POST',
        body: JSON.stringify({
          jira_project: proj,
          issue_type: itype,
          priority: prio,
          fix_version: fixv,
          component: comp,
          reporter,
          panels,
          description: wiki,
          labels: labels.split(',').map((x) => x.trim()).filter(Boolean),
          fields: jira.fields,
        }),
      })
      const j = (await r.json()) as { ok?: boolean; key?: string; url?: string; error?: string; defect?: DefectRec }
      if (!j.ok) {
        setMsg({ kind: 'err', text: j.error || '지라 등록에 실패했습니다' })
        return
      }
      if (j.defect) {
        setDefect(j.defect)
        onSaved(j.defect)
      }
      /* 그림은 본문에 못 담는다 — 본문의 !구성도.png! 는 **첨부를 부르는
         이름**이라, 첨부가 없으면 Jira 는 깨진 그림 자리를 보여 준다.
         그래서 이슈를 만든 **뒤에** 올린다. 여기서 실패해도 이슈는 이미
         만들어졌으므로 등록 자체를 되돌리지 않고, 무엇이 안 됐는지만
         말한다 — 사람이 Jira 에서 직접 끌어다 놓으면 된다. */
      let note = ''
      if (j.key && topoImg && !String(panels.topo ?? '').trim()) {
        try {
          const ar = await apiFetch(`/api/jira/issue/${encodeURIComponent(j.key)}/attach`, {
            method: 'POST',
            body: JSON.stringify({ data: topoImg, filename: '구성도.png', mime: 'image/png' }),
          })
          const aj = (await ar.json()) as { ok?: boolean; error?: string }
          if (!aj.ok) note = ` (구성도 첨부 실패: ${aj.error || '알 수 없음'})`
        } catch {
          note = ' (구성도를 첨부하지 못했습니다)'
        }
      }
      setMsg({ kind: note ? 'err' : 'ok', text: `지라에 등록했습니다 — ${j.key}${note}` })
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy('')
    }
  }

  const pushed = !!defect?.jira_key

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div className="modal dfx wide" role="dialog" aria-modal="true" aria-label="결함 등록" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <b>결함 {defect ? defect.id : '등록'}</b>
          <span className="muted small">
            {heading} · 깨진 스텝 {failN}개
          </span>
          <span className="sp" />
          {pushed && <span className="dfx-key">● {defect?.jira_key}</span>}
          <button className="modal-x" type="button" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="dfx-two">
        <div className="modal-body dfx-body">
          {/* 맨 윗줄 — 어디에, 무엇으로 올릴 것인가(2·3번 그림) */}
          <div className="dfx-top">
            <label className="dfx-fld">
              <span>프로젝트</span>
              <select value={proj} onChange={(e) => setProj(e.target.value)} disabled={pushed}>
                <option value="">— 고르기 —</option>
                {projects.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.key} · {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="dfx-fld">
              <span>이슈유형</span>
              <select value={itype} onChange={(e) => setItype(e.target.value)} disabled={pushed}>
                {(itypes.length ? itypes : ['Defect']).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {/* 제목 — 그림의 차례대로 프로젝트·이슈유형 **아래**에 온다.
              별표는 「비면 못 올린다」 는 뜻이다. */}
          <label className="dfx-fld wide">
            <span>
              제목 <i className="dfx-req">*</i>
            </span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={pushed} />
          </label>

          {/* 그 밖의 칸 — 우선순위·수정버전·구성요소·보고자·등록자·등록일.
              늘 펼쳐 두면 본문 여섯 판이 스크롤 밖으로 밀린다. 정작 사람이
              적는 것은 그 여섯 판이다. 접어 두되, 채워진 것은 접힌 줄에
              적어 무엇이 들었는지 열지 않고도 안다. */}
          {/* 「이슈 칸 더 보기」 를 뺐다(지시).

              그 안에 있던 우선순위·구성요소·목표버전은 아래 Jira 칸 묶음이
              **같은 값을 다시 묻고** 있었다 — 한 값을 고치는 자리가 둘이면
              어느 쪽이 나가는지 알 수 없다. 프로젝트명은 프로젝트를 고르면
              저절로 채워지고, 등록자·등록일은 고칠 수 있는 값이 아니라
              팝업 아래 「UTOP에 등록됨」 줄이 이미 말한다. */}

          {/* 이슈 본문 여덟 판 — 여기 적은 것이 그대로 Jira 설명이 된다.
              번호를 붙여 두면 사람이 「3번 비었다」 고 말할 수 있다. */}
          {PANELS.map((p, i) => {
            /* 3번(시험절차)과 7번(Kernel Log)은 **자동으로 채워진다.** 손으로
               옮겨 적게 하면 아무도 안 적고, 적더라도 옮기다 틀린다.
               사람이 고친 글이 있으면 그것이 이긴다 — 자동은 비어 있을 때만.
               자동으로 채운 판은 읽기만 하게 두고 「자동입력」 을 달아,
               왜 못 고치는지를 그 자리에서 말한다. */
            const autoSteps = p.k === 'steps' && briefs.length > 0
            const autoKern = p.k === 'kernel' && !!kernelFromSteps(briefs as WikiStep[])
            const autoTopo = p.k === 'topo' && !!topoImg
            const autoCfg = p.k === 'config' && !!cfgText
            const typed = String(panels[p.k] ?? '').trim()
            const auto = !typed && (autoSteps || autoKern || autoTopo || autoCfg)
            return (
              <div className="dfx-panel" key={p.k}>
                <div className="dfx-ph">
                  <span>
                    {i + 1}. {p.label}
                  </span>
                  {auto && <span className="dfx-auto">자동입력</span>}
                  {auto && (
                    <button
                      type="button"
                      className="dfx-edit"
                      disabled={pushed}
                      title="자동으로 채운 글을 가져와 손으로 고칩니다"
                      onClick={() =>
                        setPanel(
                          p.k,
                          autoSteps
                            ? stepsText(briefs)
                            : autoCfg
                              ? cfgText
                              : autoTopo
                                ? '' /* 그림은 글로 못 가져온다 — 설명을 적는 칸이 된다 */
                                : kernelFromSteps(briefs as WikiStep[]),
                        )
                      }
                    >
                      고치기
                    </button>
                  )}
                </div>
                {auto ? (
                  autoTopo ? (
                    /* 구성도 — 이슈에는 첨부로 올라간다. 여기서 보여 주는
                       것은 「무엇이 올라갈지」 다: 등록하고 나서 열어 보니
                       엉뚱한 그림이더라를 없앤다. */
                    <div className="dfx-auto-b dfx-topo">
                      <img src={topoImg} alt="구성도" />
                      <div className="muted small">
                        시험항목 {tcid} 의 구성도 — 등록할 때 「구성도.png」 로 첨부됩니다
                      </div>
                    </div>
                  ) : autoCfg ? (
                    <pre className="dfx-auto-log">{cfgText.slice(0, 4000)}</pre>
                  ) : autoSteps ? (
                    <div className="dfx-auto-b">
                      {briefs.map((b) => (
                        <div key={b.no} className={`dfx-step ${b.status === 'Fail' ? 'fail' : ''}`}>
                          <div className="dfx-st-h">
                            <b>#{b.no}</b>
                            <span>{b.desc || b.cli}</span>
                            <span className="sp" />
                            {b.status && (
                              <span
                                className={`dfx-badge ${b.status === 'Fail' ? 'fail' : b.status === 'Pass' ? 'pass' : ''}`}
                              >
                                {b.status}
                              </span>
                            )}
                          </div>
                          {b.cli && <pre className="dfx-cli">{b.cli}</pre>}
                          {b.criteria && (
                            <div className="dfx-meta">
                              <span className="k">기대 결과</span> {b.criteria}
                            </div>
                          )}
                          {b.reason && (
                            <div className="dfx-meta">
                              <span className="k">판정 근거</span> {b.reason}
                            </div>
                          )}
                          {b.output && <pre className="dfx-out">{b.output.slice(0, 1200)}</pre>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <pre className="dfx-auto-log">{kernelFromSteps(briefs as WikiStep[])}</pre>
                  )
                ) : (
                  <AutoGrow
                    value={panels[p.k] ?? ''}
                    minRows={p.rows}
                    placeholder={p.ph}
                    disabled={pushed}
                    onChange={(e) => setPanel(p.k, e.target.value)}
                  />
                )}
              </div>
            )
          })}

          <JiraFields
            project={proj}
            issuetype={itype}
            value={jfVals}
            onChange={setJfVals}
            onLoaded={setJfDefs}
            disabled={pushed}
          />

          <label className="dfx-fld wide">
            <span>라벨 (쉼표 구분)</span>
            <input value={labels} disabled={pushed} onChange={(e) => setLabels(e.target.value)} />
          </label>
        </div>

        {/* 오른쪽 — Jira 에 올라갈 모습 그대로. 「등록하고 나서 열어 보니
            엉뚱하더라」 를 없애는 것이 이 판의 목적이다. */}
        <div className="dfx-prev">
          <div className="dfx-prevh">Jira 이슈 미리보기</div>
          <div className="dfx-prevb">
            <div className="dfx-prevtitle">
              {title || <span className="muted">제목을 입력하세요</span>}
            </div>
            <div className="dfx-prevsub">
              {proj || '프로젝트 선택'} · {itype || '이슈유형'}
            </div>
            <div className="jw" dangerouslySetInnerHTML={{ __html: wikiToHtml(wiki) }} />

            {/* 왼쪽에서 고른 칸들 — 본문이 아니라 이슈의 **속성**이라 아래에
                따로 모은다(지시). 비어 있는 필수도 「—」 로 남겨, 등록을
                눌러 보고서야 빠진 것을 알게 되는 일이 없다. */}
            {(prevRows.length > 0 || labelList.length > 0) && (
              <>
                <hr className="jw-hr" />
                <div className="dfx-prevgrid">
                  {prevRows.map((r) => (
                    <div className="dfx-prevf" key={r.label}>
                      <div className={`dfx-prevk${r.req ? ' req' : ''}`}>{r.label}</div>
                      <div className={`dfx-prevv${r.val === '(선택)' || r.val === '—' ? ' none' : ''}`}>
                        {r.val}
                      </div>
                    </div>
                  ))}
                  {labelList.length > 0 && (
                    <div className="dfx-prevf">
                      <div className="dfx-prevk">라벨</div>
                      <div className="dfx-prevv">{labelList.join(', ')}</div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        </div>

        <div className="modal-foot dfx-foot">
          {/* 등록 상태를 눈에 보이게 — 창을 열면 이미 UTOP 에 남아 있다 */}
          {defect ? (
            <span className="dfx-saved">✓ UTOP에 등록됨 · {defect.id}</span>
          ) : (
            <span className="muted small">등록 중…</span>
          )}
          {msg.text && <span className={`muted small ${msg.kind}`}>{msg.text}</span>}
          <span className="sp" />
          {defect && (
            <button className="btn ghost" type="button" disabled={!!busy} onClick={() => void remove()}>
              {busy === 'del' ? '삭제 중…' : '삭제'}
            </button>
          )}
          {pushed ? (
            <button className="btn" type="button" onClick={onClose}>
              닫기
            </button>
          ) : (
            <>
              <button className="btn" type="button" disabled={!!busy || !defect} onClick={() => void patchFields()}>
                {busy === 'save' ? '저장 중…' : '변경 저장'}
              </button>
              <button className="btn primary" type="button" disabled={!!busy || !proj || !defect} onClick={() => void push()}>
                {busy === 'push' ? '지라 등록 중…' : '지라에 등록'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
