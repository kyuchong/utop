import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { normMode, resolveMode, type ModeGot } from '@/lib/runMode'
import { prefGet, prefRemove, prefSet } from '@/lib/prefs'
import { onGoto, reflectUrl } from '@/api/goto'
import NTable from '@/components/ntable/NTable'
import NViews, { type ViewBody, type ViewDef } from '@/components/ntable/NViews'
import { useNFields } from '@/components/ntable/useNFields'
import { EMPTY_VIEW, type NCalc, type NCol, type NRow, type NView } from '@/components/ntable/types'
import { IcAuto, IcManual } from '@/components/ntable/NIcons'
import type { CycleMeta } from '@/pages/Cycles'
import RunDetail from '@/components/run/RunDetail'
import './Runs.css'

/**
 * **Runs — 시험 실행 목록** (목업의 Runs 화면)
 *
 * 플랜은 「무엇을 시험할지」, 실행은 「어느 빌드에 어느 장비로 돌렸는지」다.
 * 그래서 왼쪽 레일은 폴더가 아니라 **버전**이다 — 빌드를 고르면 그 빌드의
 * 실행만 남는다. 표는 REQ-Coverage·Plans 와 같은 노션 표를 쓴다.
 *
 * 실행은 만든 순간 플랜의 항목을 **복사**해 들고 있다. 그래서 플랜을 뒤에
 * 고쳐도 이미 뜬 실행의 숫자는 안 바뀐다(결과서에 나간 값이라 흔들리면
 * 안 된다). 목록 API 도 그 큰 결과·로그를 안 읽고 집계만 세어 온다.
 */

/** 목록 API 가 주는 한 줄 — data 는 안 들어 있고 집계만 온다 */
interface RunLite {
  id: string
  plan_id?: string | null
  name?: string | null
  version?: string | null
  version_group?: string | null
  owner?: string | null
  start_date?: string | null
  end_date?: string | null
  closed_at?: string | null
  rerun_of?: string | null
  created_by?: string | null
  created_at?: string | null
  /** 만들 때 굳힌 방식 — 플랜이 나중에 바뀌어도 이 실행은 안 바뀐다 */
  mode?: string | null
  meta?: Record<string, string> | null
  binds?: Record<string, string> | null
  n_total: number
  n_pass: number
  n_fail: number
  n_etc: number
  n_none: number
}

interface DeviceLite {
  id?: string
  name?: string
  model?: string
  ip?: string
}

export default function Runs({ me }: { me?: { username?: string; name?: string; role?: string } | null }) {
  const qc = useQueryClient()
  const meName = me?.name || me?.username || ''

  const runsQ = useQuery({
    queryKey: ['plan-runs'],
    queryFn: async () => {
      const r = await apiFetch('/api/plan-runs')
      if (!r.ok) throw new Error('실행을 불러오지 못했습니다')
      return (await r.json()) as { runs: RunLite[] }
    },
    staleTime: 10_000,
  })
  const plansQ = useQuery({
    queryKey: ['cycles-meta'],
    queryFn: async () => {
      const r = await apiFetch('/api/cycle?meta=1')
      if (!r.ok) throw new Error('플랜을 불러오지 못했습니다')
      return (await r.json()) as { cycles: CycleMeta[] }
    },
    staleTime: 30_000,
  })
  const devQ = useQuery({
    queryKey: ['devices'],
    queryFn: async () => {
      const r = await apiFetch('/api/devices')
      if (!r.ok) return { devices: [] as DeviceLite[] }
      return (await r.json()) as { devices?: DeviceLite[]; items?: DeviceLite[] }
    },
    staleTime: 60_000,
  })

  const runs = useMemo(() => runsQ.data?.runs ?? [], [runsQ.data])
  const planOf = useMemo(() => {
    const m = new Map<string, CycleMeta>()
    for (const c of plansQ.data?.cycles ?? []) m.set(c.id, c)
    return m
  }, [plansQ.data])
  const devName = useMemo(() => {
    const m = new Map<string, string>()
    for (const d of devQ.data?.devices ?? devQ.data?.items ?? []) {
      if (d.id) m.set(String(d.id), String(d.name ?? d.id))
    }
    return m
  }, [devQ.data])

  /* ── 왼쪽 버전 레일 — 버전그룹 › 버전 ── */
  const [showClosed, setShowClosed] = useState(false)
  const [pick, setPick] = useState<{ group: string; version: string }>({ group: '', version: '' })
  const [openG, setOpenG] = useState<Set<string>>(new Set())
  const [sideOpen, setSideOpen] = useState(() => prefGet('utop.runs.side') !== '0')

  const pool = useMemo(() => runs.filter((r) => showClosed || !r.closed_at), [runs, showClosed])
  const closedCount = useMemo(() => runs.filter((r) => r.closed_at).length, [runs])
  const tree = useMemo(() => {
    const m = new Map<string, Map<string, number>>()
    for (const r of pool) {
      const g = String(r.version_group ?? '') || '(버전 없음)'
      const v = String(r.version ?? '') || '(버전 없음)'
      const inner = m.get(g) ?? new Map<string, number>()
      inner.set(v, (inner.get(v) ?? 0) + 1)
      m.set(g, inner)
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0], 'ko', { numeric: true }))
  }, [pool])

  const shown = useMemo(() => {
    const arr = pool.filter((r) =>
      pick.version
        ? String(r.version ?? '') === pick.version
        : pick.group
          ? String(r.version_group ?? '') === pick.group
          : true,
    )
    /* 표 차례는 **안정 키**로 — 서버는 updated DESC 로 주는데 그대로 쓰면
       값을 하나 고칠 때마다 그 줄이 1번으로 튄다(Plans 에서 겪은 것) */
    const cmp = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' }).compare
    return [...arr].sort(
      (a, b) => cmp(String(b.version ?? ''), String(a.version ?? '')) || cmp(a.id, b.id),
    )
  }, [pool, pick])

  /* ── 노션 표 ── */
  const nf = useNFields({
    target: 'cycle',
    kindOf: {},
    pre: 'rn_',
    orderKey: 'utop.ntb.order.rn',
  })
  const [nview, setNview] = useState<NView>({ ...EMPTY_VIEW })
  const [nvId, setNvId] = useState('')
  const [nCalc, setNCalc] = useState<Record<string, NCalc>>(() => {
    try {
      return JSON.parse(prefGet('utop.ntb.rn.calc') ?? '{}') as Record<string, NCalc>
    } catch {
      return {}
    }
  })
  const [nPer, setNPer] = useState(() => Number(prefGet('utop.ntb.rn.per') ?? '') || 50)

  const nCols = useMemo<NCol[]>(() => {
    const w = nf.widthOf
    return nf.dress([
      { key: 'id', label: 'ID', type: 'text', width: w('id', 132), fixed: true },
      { key: 'name', label: '제목', type: 'text', width: w('name', 260), fixed: true },
      { key: 'plan', label: '플랜', type: 'text', width: w('plan', 128) },
      /* 자동인지 수동인지가 실행의 성격을 가른다 — 목록에서 바로 보여야
         한다(지적: Runs 에서 자동·수동 구분이 안 된다). 플랜의 방식을
         따르고, 플랜 없는 실행은 제 meta 에 든 값을 쓴다. */
      { key: 'mode', label: '방식', type: 'text', width: w('mode', 72) },
      { key: 'version_group', label: '버전그룹', type: 'text', width: w('version_group', 84) },
      { key: 'version', label: '버전', type: 'text', width: w('version', 148) },
      { key: 'customer', label: '사업자', type: 'text', width: w('customer', 84) },
      { key: 'family', label: '제품군', type: 'text', width: w('family', 68) },
      { key: 'model_group', label: '모델그룹', type: 'text', width: w('model_group', 84) },
      { key: 'model', label: '모델명', type: 'text', width: w('model', 80) },
      { key: 'device', label: '대상 장비', type: 'text', width: w('device', 120) },
      { key: 'type', label: '유형', type: 'text', width: w('type', 80) },
      { key: 'cases', label: '항목', type: 'number', width: w('cases', 56) },
      { key: 'fails', label: '결함', type: 'number', width: w('fails', 56) },
      { key: 'prg', label: '진행', type: 'text', width: w('prg', 80) },
      { key: 'state', label: '상태', type: 'text', width: w('state', 72) },
      { key: 'period', label: '기간', type: 'text', width: w('period', 150) },
      { key: 'owner', label: '담당자', type: 'person', width: w('owner', 84) },
      { key: 'created', label: '생성', type: 'text', width: w('created', 96) },
      { key: 'closed', label: '종료', type: 'text', width: w('closed', 96) },
    ])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nf.rev, nf.codesQ.data])
  const nColsLive = nf.edit ?? nCols

  /** 항목마다 자동인지 수동인지 — 방식을 항목에서 뽑을 때 쓴다 */
  const tcKindQ = useQuery({
    queryKey: ['tc-meta-kind'],
    queryFn: async () => {
      const r = await apiFetch('/api/tc?meta=1')
      if (!r.ok) throw new Error('시험 항목을 불러오지 못했습니다')
      return (await r.json()) as { tcs?: Array<{ tcid?: string; kind?: string; run_type?: string }> }
    },
    staleTime: 60_000,
  })
  const kindOfTc = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of tcKindQ.data?.tcs ?? []) {
      const k = String(t?.tcid ?? '')
      if (k) m.set(k, String(t?.kind ?? t?.run_type ?? '자동') || '자동')
    }
    return m
  }, [tcKindQ.data])
  /** 실행의 방식 — **실행에 굳은 값**이 먼저, 없으면 플랜에서 Plans 와 같은 규칙으로 뽑는다 */
  const modeOf = (r: RunLite, p?: CycleMeta): ModeGot => {
    const own = String(r.mode ?? r.meta?.mode ?? '').trim()
    /* 판정은 풀어 읽은 값으로, 화면 글자는 저장된 그대로(raw) — 팀이
       「M」 이라 적어 두었으면 M 으로 보여야 한다 */
    if (own) return { v: normMode(own) || own, raw: own, from: 'set', why: `${own} 시험` }
    if (!p) return { v: '', raw: '', from: 'none', why: '플랜이 없어 방식을 알 수 없습니다' }
    return resolveMode(
      (p as unknown as Record<string, unknown>).mode as string,
      p.items as Array<{ tcid?: string }>,
      kindOfTc,
    )
  }

  const nRows = useMemo<NRow[]>(
    () =>
      shown.map((r) => {
        const p = r.plan_id ? planOf.get(r.plan_id) : undefined
        const meta = r.meta ?? {}
        const binds = r.binds ?? {}
        const dut = binds.DUT ? devName.get(String(binds.DUT)) : ''
        const others = Object.keys(binds).length - (binds.DUT ? 1 : 0)
        const done = r.n_pass + r.n_fail + r.n_etc
        return {
          __id: r.id,
          id: r.id,
          name: String(r.name ?? r.id) + (r.rerun_of ? ' (재시험)' : ''),
          plan: p ? String(p.cid || p.id) : r.plan_id ? '(지워진 플랜)' : '–',
          /* 표에 그리는 글자는 저장된 그대로 — 판정은 modeOf().v 가 한다 */
          mode: (() => { const g = modeOf(r, p); return g.raw || g.v })(),
          version_group: String(r.version_group ?? ''),
          version: String(r.version ?? ''),
          customer: String(p?.customer ?? meta.customer ?? ''),
          /* 제품군도 유형과 같다 — 만들 때 고른 실행 제 값이 먼저다 */
          family: String(meta.family ?? p?.family ?? ''),
          model_group: String(p?.model_group ?? meta.model_group ?? ''),
          model: String(p?.model ?? meta.model ?? ''),
          device: dut ? (others > 0 ? `${dut} 외 ${others}` : dut) : '',
          /* 유형은 **실행 제 것이 먼저**다(만들 때 골랐다). 플랜 것을 그대로
             읽으면 플랜을 고칠 때 이미 돈 실행의 성격까지 따라 바뀐다. */
          type: String(
            meta.type ?? (p as unknown as Record<string, unknown> | undefined)?.type ?? '',
          ),
          /* 시험 기간 — 「언제까지 하기로 했나」. 실제로 돌린 시각(생성·종료)과
             다르다. 만들기 창에서 넣은 값이 여기 선다. */
          period:
            r.start_date || r.end_date
              ? `${String(r.start_date ?? '').slice(0, 10) || '–'} ~ ${String(r.end_date ?? '').slice(0, 10) || '–'}`
              : '',
          cases: String(r.n_total),
          fails: String(r.n_fail),
          prg: r.n_total ? `${Math.round((done / r.n_total) * 100)}%` : '',
          state: r.closed_at ? '종료' : done ? '진행중' : '대기',
          owner: String(r.owner ?? ''),
          created: String(r.created_at ?? '').slice(0, 10),
          closed: String(r.closed_at ?? '').slice(0, 10),
        }
      }),
    /* kindOfTc 가 빠져 있어, 항목 종류가 늦게 오면 방식 칸이 **옛 값에
       머물렀다** — 아이콘은 수동인데 글자는 자동인 채로 굳었다. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown, planOf, devName, kindOfTc],
  )

  const nBody: ViewBody = useMemo(
    () => ({
      hidden: nCols.filter((c) => c.hidden).map((c) => c.key),
      widths: Object.fromEntries(nCols.filter((c) => c.width).map((c) => [c.key, c.width!])),
      order: nCols.map((c) => c.key),
    }),
    [nCols],
  )
  const applyView = (v: ViewDef | null) => {
    setNvId(v?.id ?? '')
    const hid = new Set(v?.body?.hidden ?? [])
    const wd = v?.body?.widths ?? {}
    for (const c of nCols) {
      prefSet(`utop.ntb.hide.rn_${c.key}`, hid.has(c.key) ? '1' : '0')
      if (wd[c.key]) prefSet(`utop.ntb.w.rn_${c.key}`, String(wd[c.key]))
    }
    prefSet('utop.ntb.order.rn', (v?.body?.order ?? []).join(','))
    nf.bump()
  }

  /* ── 만들기 · 지우기 · 열어 보기 ── */
  const [mk, setMk] = useState(false)
  /** 고른 실행 — 있으면 상세를 그린다.
      **주소가 정본**이다. 실행에만 주소가 없어서, 주소에 남아 있던 옛
      ?cycle= 이 되살아나 왼쪽 메뉴가 Plans 로 되돌아갔다(지적). */
  const [sel, setSel] = useState(() => prefGet('utop.runs.open') ?? '')
  /** 다른 화면(플랜 개요의 실행 줄)에서 부르면 그 실행을 연다 */
  useEffect(() => onGoto((kind, id) => kind === 'run' && setSel(id)), [])
  const openRun = (id: string) => {
    setSel(id)
    prefSet('utop.runs.open', id)
    reflectUrl('run', id)
  }
  const closeRun = () => {
    setSel('')
    prefRemove('utop.runs.open')
    /* 목록으로 돌아왔으면 주소도 목록이어야 한다 — 안 그러면 새로 고칠
       때 다시 그 실행이 열리고, 뒤로가기가 갈 곳을 잃는다 */
    window.history.pushState({ utop: true }, '', `${window.location.pathname}?p=runs`)
  }
  const reload = () => void qc.invalidateQueries({ queryKey: ['plan-runs'] })

  const delRuns = async (ids: string[]) => {
    const list = ids.map((id) => runs.find((r) => r.id === id)).filter(Boolean) as RunLite[]
    if (!list.length) return
    const withResult = list.filter((r) => r.n_pass + r.n_fail + r.n_etc > 0)
    const lines = list.map((r) => `  ${r.id}  ${r.name ?? ''}`).join('\n')
    const warn = withResult.length
      ? `\n\n${withResult.length}건은 이미 시험 결과가 있습니다. 지우면 결과도 함께 사라집니다.`
      : ''
    if (!window.confirm(`시험 실행 ${list.length}건을 지웁니다.\n\n${lines}${warn}\n\n되돌릴 수 없습니다.`))
      return
    for (const r of list) {
      await apiFetch(`/api/plan-runs/${encodeURIComponent(r.id)}`, { method: 'DELETE' })
    }
    reload()
  }

  const scope = pick.version || (pick.group ? `${pick.group} 전체` : '전체 실행')

  if (sel) {
    const r = runs.find((x) => x.id === sel)
    return (
      <RunDetail
        runId={sel}
        plan={r?.plan_id ? planOf.get(r.plan_id) : undefined}
        onBack={closeRun}
      />
    )
  }

  return (
    <div className="rn-wrap">
      {sideOpen && (
        <aside className="panel rn-side">
          <div className="rn-shd">
            <h2>버전</h2>
            <button
              type="button"
              className="rn-sx"
              title="레일 접기"
              onClick={() => {
                setSideOpen(false)
                prefSet('utop.runs.side', '0')
              }}
            >
              ◧
            </button>
          </div>
          <div className="rn-tree">
            <button
              type="button"
              className={`rn-tn${!pick.group && !pick.version ? ' on' : ''}`}
              onClick={() => setPick({ group: '', version: '' })}
            >
              <i className="rn-tw" />
              전체 실행
              <span className="rn-cnt">{pool.length}</span>
            </button>
            {tree.map(([g, vs]) => {
              const total = [...vs.values()].reduce((a, b) => a + b, 0)
              const og = openG.has(g)
              return (
                <div key={g}>
                  <button
                    type="button"
                    className={`rn-tn${pick.group === g && !pick.version ? ' on' : ''}`}
                    onClick={() => {
                      setPick({ group: g, version: '' })
                      setOpenG((s) => new Set(s).add(g))
                    }}
                  >
                    <i
                      className="rn-tw"
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpenG((s) => {
                          const n = new Set(s)
                          if (n.has(g)) n.delete(g)
                          else n.add(g)
                          return n
                        })
                      }}
                    >
                      {og ? '▾' : '▸'}
                    </i>
                    📁 {g}
                    <span className="rn-cnt">{total}</span>
                  </button>
                  {og &&
                    [...vs.entries()]
                      .sort((a, b) => b[0].localeCompare(a[0], 'ko', { numeric: true }))
                      .map(([v, n]) => (
                        <button
                          type="button"
                          key={v}
                          className={`rn-tn lv2${pick.version === v ? ' on' : ''}`}
                          onClick={() => setPick({ group: g, version: v })}
                        >
                          {v}
                          <span className="rn-cnt">{n}</span>
                        </button>
                      ))}
                </div>
              )
            })}
            {closedCount > 0 && (
              <button type="button" className="rn-tn muted" onClick={() => setShowClosed((v) => !v)}>
                {showClosed ? '종료된 실행 숨기기' : `종료된 실행 ${closedCount}개 보기`}
              </button>
            )}
          </div>
        </aside>
      )}

      <section className="panel rn-main">
        <NTable
          columns={nColsLive}
          rows={nRows}
          view={nview}
          onView={setNview}
          calcs={nCalc}
          onCalcs={(v) => {
            setNCalc(v)
            prefSet('utop.ntb.rn.calc', JSON.stringify(v))
          }}
          perPage={nPer}
          onPerPage={(n) => {
            setNPer(n)
            prefSet('utop.ntb.rn.per', String(n))
          }}
          toolbarLeft={
            <>
              {!sideOpen && (
                <button
                  type="button"
                  className="rn-open"
                  onClick={() => {
                    setSideOpen(true)
                    prefSet('utop.runs.side', '1')
                  }}
                >
                  ▤ 버전 열기
                </button>
              )}
              <span className="rn-scope">{scope}</span>
              <NViews
                scope="runs"
                curId={nvId}
                onPick={applyView}
                current={nBody}
                meName={meName}
                isAdmin={me?.role === 'admin'}
              />
            </>
          }
          onColumns={(cs) => void nf.applyCols(nColsLive, cs)}
          /* 실행의 값은 실행 화면에서 바뀐다 — 목록에서 고치는 칸은 담당뿐 */
          onCell={(id, key, v) => {
            if (key !== 'owner') return
            void apiFetch(`/api/plan-runs/${encodeURIComponent(id)}`, {
              method: 'POST',
              body: JSON.stringify({ owner: v }),
            }).then(reload)
          }}
          readOnlyKeys={[
            'id', 'plan', 'mode', 'version_group', 'version', 'customer', 'family',
            'model_group', 'model', 'device', 'type', 'period', 'cases', 'fails',
            'prg', 'state', 'created', 'closed',
          ]}
          idKey="id"
          titleKey="name"
          onOpen={openRun}
          onPeek={openRun}
          meName={meName}
          renderCell={(row, c) => {
            if (c.key !== 'mode') return undefined
            const v = String(row.mode ?? '')
            if (!v) return <span className="rn-mode none">–</span>
            /* 톱니는 자동, 손은 수동 — 세 화면이 같은 뜻으로 쓴다 */
            return (
              <span className={`rn-mode ${normMode(v) === '수동' ? 'm' : 'a'}`}>
                {normMode(v) === '수동' ? '👆' : '⚙'} {v}
              </span>
            )
          }}
          rowIcon={(row) => {
            /* 모르는 것은 **모른다고** 그린다. 예전엔 빈 값을 자동으로 우겨서,
               수동으로 만든 실행이 목록에서 자동으로 보였다(지적). */
            const r = runs.find((x) => x.id === row.__id)
            const got = r ? modeOf(r, r.plan_id ? planOf.get(r.plan_id) : undefined) : null
            if (!got?.v) {
              return (
                <i className="ntb-mi2 none" title={got?.why ?? '방식을 아직 알 수 없습니다'}>
                  ·
                </i>
              )
            }
            const I = got.v === '수동' ? IcManual : IcAuto  /* got.v 는 풀어 읽은 값이다 */
            return (
              <i
                className={`ntb-mi2 ${got.v === '수동' ? 'm' : 'a'}${got.from === 'set' ? '' : ' dim'}`}
                title={got.why}
              >
                <I />
              </i>
            )
          }}
          onNew={() => setMk(true)}
          onBulk={(a, ids) => {
            if (a === 'del') void delRuns(ids)
            else window.alert('이 일괄 작업은 아직 없습니다 — 다음 차례에 답니다')
          }}
        />
      </section>

      {mk && (
        <MakeRun
          plans={plansQ.data?.cycles ?? []}
          onClose={() => setMk(false)}
          onDone={() => {
            setMk(false)
            reload()
          }}
        />
      )}
    </div>
  )
}

/** 실행 만들기 — 플랜에서 항목을 떠 온다 (장비 배정은 다음 차례) */
function MakeRun({
  plans, onClose, onDone,
}: {
  plans: CycleMeta[]
  onClose: () => void
  onDone: () => void
}) {
  const [planId, setPlanId] = useState(plans[0]?.id ?? '')
  const p = plans.find((x) => x.id === planId)
  const [version, setVersion] = useState(p?.version ?? '')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const vg = (version.split('_')[0] ?? '').trim()

  const save = async () => {
    setBusy(true)
    try {
      const r = await apiFetch('/api/plan-runs', {
        method: 'POST',
        body: JSON.stringify({
          plan_id: planId,
          version,
          name: name.trim() || `${p?.name ?? ''} · ${version}`.trim(),
        }),
      })
      if (!r.ok) throw new Error('만들지 못했습니다')
      onDone()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '만들지 못했습니다')
      setBusy(false)
    }
  }

  return (
    <div className="rn-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rn-modal" role="dialog" aria-modal="true" aria-label="시험 실행 만들기">
        <header>시험 실행 만들기</header>
        <div className="rn-mbody">
          <p className="rn-note">
            고른 플랜의 시험 항목을 <b>복사해</b> 실행을 만듭니다. 복사한 뒤에는 플랜을 고쳐도 이
            실행은 바뀌지 않습니다.
          </p>
          <label className="rn-fld">
            <span>플랜</span>
            <select
              value={planId}
              onChange={(e) => {
                setPlanId(e.target.value)
                const np = plans.find((x) => x.id === e.target.value)
                setVersion(np?.version ?? '')
              }}
            >
              {plans.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.cid || x.id} · {x.name ?? ''}
                </option>
              ))}
            </select>
          </label>
          <label className="rn-fld">
            <span>버전</span>
            <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="R100_2026_08_31" />
            <em>버전그룹 {vg || '–'} — 왼쪽 레일에서 이 폴더에 들어갑니다</em>
          </label>
          <label className="rn-fld">
            <span>제목</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="비우면 「플랜 · 버전」" />
          </label>
        </div>
        <footer>
          <span className="rn-note2">항목은 만들 때 복사됩니다</span>
          <span className="rn-sp" />
          <button type="button" className="rn-btn" onClick={onClose}>
            취소
          </button>
          <button type="button" className="rn-btn pri" disabled={!planId || busy} onClick={() => void save()}>
            ＋ 실행 만들기
          </button>
        </footer>
      </div>
    </div>
  )
}
