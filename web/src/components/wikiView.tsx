import { createReactBlockSpec } from '@blocknote/react'
import { useQuery } from '@tanstack/react-query'
import { api, apiFetch, projectApi } from '@/api/client'
import { itemVerdict, type CycleItemLite, type CycleMeta } from '@/pages/Cycles'
import { goto } from '@/api/goto'
import { reqPk } from '@/types'

/**
 * 문서 안에 놓는 **살아 있는 표**.
 *
 * 짚기(@)와는 다른 일을 한다. 짚기는 **하나**를 가리키고, 이것은 **조건에
 * 맞는 것 전부**를 문서를 열 때마다 다시 센다. 붙여넣은 숫자는 붙여넣은
 * 그 순간부터 틀리기 시작한다 — 다음 달에 이 문서를 여는 사람은 그것이
 * 언제 적 숫자인지 알 길이 없다.
 *
 * 그래서 담는 것은 **숫자가 아니라 질의**다(어느 플랜·어느 프로젝트).
 * Zephyr 가 Confluence 에서 매크로로 하는 일이 이것이고, 보고서를 따로 두지
 * 않고 글 사이에 꽂게 한 까닭도 같다: 보고서를 따로 두면 「왜 이런 숫자가
 * 나왔나」 를 적은 글과 그 숫자가 갈라진다.
 */

type Props = { view: string; cycle: string; project: string }

const VIEWS = [
  { k: 'cycle', label: '플랜 진행' },
  { k: 'coverage', label: '덮임 (Coverage)' },
] as const

/** 통과·부적합·그 밖·미실행 — 플랜 화면과 같은 갈래로 센다 */
function tally(items: CycleItemLite[]) {
  let pass = 0, fail = 0, other = 0, none = 0
  for (const it of items) {
    const v = itemVerdict(it)
    if (v === 'Pass') pass++
    else if (v === 'Fail') fail++
    else if (v) other++
    else none++
  }
  return { pass, fail, other, none, all: items.length }
}

function CycleView({ id }: { id: string }) {
  const q = useQuery({
    queryKey: ['wv-cycle', id],
    enabled: !!id,
    queryFn: async () => {
      const r = await apiFetch(`/api/cycle/${encodeURIComponent(id)}`)
      return (await r.json()) as CycleMeta
    },
  })
  if (!id) return null
  if (q.isLoading) return <div className="wv-load">읽는 중…</div>
  if (q.isError || !q.data) return <div className="wv-err">플랜을 못 읽었습니다 — 지워졌을 수 있습니다</div>
  const c = q.data
  const t = tally(c.items ?? [])
  /* 통과율은 **실행한 것 중에서** 센다. 미실행을 분모에 넣으면 시험을
     시작하자마자 0% 가 되어, 진척과 품질이 한 숫자에 뒤섞인다. */
  const ran = t.pass + t.fail + t.other
  const rate = ran ? Math.round((t.pass / ran) * 100) : 0
  const seg = (n: number) => (t.all ? `${(n / t.all) * 100}%` : '0%')
  return (
    <div className="wv-body">
      <div className="wv-h">
        <b>{c.cid || c.id}</b>
        <span className="wv-sub">{[c.model, c.version].filter(Boolean).join(' · ')}</span>
        <span className="sp" />
        <span className="wv-rate">통과율 {rate}%</span>
      </div>
      <div className="wv-bar" role="img" aria-label={`통과 ${t.pass} 부적합 ${t.fail} 미실행 ${t.none}`}>
        <span className="pass" style={{ width: seg(t.pass) }} />
        <span className="fail" style={{ width: seg(t.fail) }} />
        <span className="etc" style={{ width: seg(t.other) }} />
        <span className="none" style={{ width: seg(t.none) }} />
      </div>
      <div className="wv-nums">
        <span><i className="d pass" />통과 <b>{t.pass}</b></span>
        <span><i className="d fail" />부적합 <b>{t.fail}</b></span>
        {t.other > 0 && <span><i className="d etc" />그 밖 <b>{t.other}</b></span>}
        <span><i className="d none" />미실행 <b>{t.none}</b></span>
        <span className="sp" />
        <span className="muted">전체 {t.all}건</span>
      </div>
    </div>
  )
}

function CoverageView({ project }: { project: string }) {
  const reqQ = useQuery({ queryKey: ['reqs'], queryFn: ({ signal }) => api.listRequirements(signal), staleTime: 60_000 })
  const tcQ = useQuery({ queryKey: ['tcs'], queryFn: ({ signal }) => api.listTestCases(signal), staleTime: 60_000 })
  if (!project) return null
  if (reqQ.isLoading || tcQ.isLoading) return <div className="wv-load">읽는 중…</div>
  const reqs = (reqQ.data?.reqs ?? []).filter((r) =>
    [r.cat1, r.cat2, r.cat3, r.cat4].some((c) => String(c ?? '') === project),
  )
  /* 시험 → 요구사항은 **내부 키(req.id)** 로 붙는다. 보이는 REQ ID 로는
     안 붙는다 — 그 값은 사람이 고칠 수 있어 짝이 어긋난다. */
  const n = new Map<string, number>()
  for (const t of tcQ.data?.tcs ?? []) {
    const k = String(t.req_id ?? '').trim()
    if (k) n.set(k, (n.get(k) ?? 0) + 1)
  }
  const bare = reqs.filter((r) => !(n.get(reqPk(r)) ?? 0))
  const pct = reqs.length ? Math.round(((reqs.length - bare.length) / reqs.length) * 100) : 0
  return (
    <div className="wv-body">
      <div className="wv-h">
        <b>덮임 {pct}%</b>
        <span className="wv-sub">요구사항 {reqs.length}건 중 {reqs.length - bare.length}건이 덮였습니다</span>
      </div>
      <div className="wv-bar">
        <span className="pass" style={{ width: `${pct}%` }} />
        <span className="none" style={{ width: `${100 - pct}%` }} />
      </div>
      {bare.length > 0 && (
        <div className="wv-bare">
          {/* 덮인 것이 아니라 **안 덮인 것**을 낸다 — 할 일이 남은 쪽이다 */}
          <div className="wv-bare-h">시험이 없는 요구사항 {bare.length}건</div>
          {bare.slice(0, 12).map((r) => (
            <button type="button" key={reqPk(r)} className="wv-bare-i" onClick={() => goto('req', reqPk(r))}>
              <b>{r.reqid || reqPk(r)}</b>
              <span>{r.title ?? ''}</span>
            </button>
          ))}
          {bare.length > 12 && <div className="muted small">… 그 밖 {bare.length - 12}건</div>}
        </div>
      )}
    </div>
  )
}

/** 무엇을 볼지 고르는 줄 — 고르고 나면 접힌다 */
function Pick({ p, set }: { p: Props; set: (x: Partial<Props>) => void }) {
  const cyQ = useQuery({
    queryKey: ['wv-cycles'],
    enabled: p.view === 'cycle',
    queryFn: async () => {
      const r = await apiFetch('/api/cycle?meta=1')
      return (await r.json()) as { cycles: CycleMeta[] }
    },
  })
  const prQ = useQuery({ queryKey: ['projects'], enabled: p.view === 'coverage', queryFn: ({ signal }) => projectApi.list(signal) })
  return (
    <div className="wv-pick">
      <select value={p.view} onChange={(e) => set({ view: e.target.value, cycle: '', project: '' })}>
        <option value="">— 무엇을 볼까요 —</option>
        {VIEWS.map((v) => (
          <option key={v.k} value={v.k}>{v.label}</option>
        ))}
      </select>
      {p.view === 'cycle' && (
        <select value={p.cycle} onChange={(e) => set({ cycle: e.target.value })}>
          <option value="">— 플랜 —</option>
          {(cyQ.data?.cycles ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.cid || c.id} · {[c.model, c.version].filter(Boolean).join(' ')}
            </option>
          ))}
        </select>
      )}
      {p.view === 'coverage' && (
        <select value={p.project} onChange={(e) => set({ project: e.target.value })}>
          <option value="">— 프로젝트 —</option>
          {(prQ.data?.projects ?? []).map((x) => (
            <option key={x.cat_id} value={x.cat_id}>{x.name}</option>
          ))}
        </select>
      )}
    </div>
  )
}

export const ViewSpec = createReactBlockSpec(
  {
    type: 'utopView',
    propSchema: { view: { default: '' }, cycle: { default: '' }, project: { default: '' } },
    content: 'none',
  },
  {
    render: ({ block, editor }) => {
      const p = block.props as Props
      const set = (x: Partial<Props>) => editor.updateBlock(block, { props: { ...p, ...x } })
      const chosen = p.view === 'cycle' ? !!p.cycle : p.view === 'coverage' ? !!p.project : false
      const label = VIEWS.find((v) => v.k === p.view)?.label ?? 'UTOP 표'
      return (
        <div className="wv" data-view={p.view || 'none'}>
          <div className="wv-top">
            <span className="wv-tag">{label}</span>
            <span className="sp" />
            {/* 고른 뒤에도 바꿀 수 있어야 한다 — 플랜을 잘못 골랐다고
                블록을 지웠다 다시 만들게 하면 글 흐름이 끊긴다 */}
            {editor.isEditable && <Pick p={p} set={set} />}
          </div>
          {chosen && p.view === 'cycle' && <CycleView id={p.cycle} />}
          {chosen && p.view === 'coverage' && <CoverageView project={p.project} />}
          {!chosen && <div className="wv-empty">위에서 골라 주세요 — 문서를 열 때마다 지금 값을 읽어 그립니다.</div>}
        </div>
      )
    },
  },
)
