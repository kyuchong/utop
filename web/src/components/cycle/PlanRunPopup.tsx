import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/api/client'
import RunDetail from '@/components/run/RunDetail'
import type { CycleMeta } from '@/pages/Cycles'
import './PlanRunPopup.css'

/**
 * **플랜에서 여는 실행 — 팝업.**
 *
 * 예전엔 「▶ 실행」 이 Runs 화면으로 **넘어갔다.** 그러면 플랜에서 하던
 * 일이 끊긴다 — 항목을 보다가 한 번 돌려 보고 다시 플랜으로 오려면
 * 화면을 두 번 갈아타야 했다(지시: 팝업으로 나와야 한다).
 *
 * 이 팝업은 Runs 의 실행 화면(RunDetail)을 **그대로** 얹는다. 새로 만들지
 * 않는다 — 시작·중지·항목별 실행·판정이 다 그 안에 있고, 두 벌을 만들면
 * 한쪽만 고쳐져 갈린다.
 */
export function PlanRunPopup({
  runId, plan, onClose,
}: {
  runId: string
  plan?: CycleMeta
  onClose: () => void
}) {
  /* Esc 로 닫는다. 다만 **도는 중에는 안 닫는다** — 팝업이 사라지면
     진행이 안 보여, 멈춘 줄 알고 다시 거는 일이 생긴다. 닫기는 늘
     오른쪽 위 ✕ 로 할 수 있다(그것은 진행을 안 멈춘다). */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div className="cyrp-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cyrp" role="dialog" aria-modal="true" aria-label="시험 실행">
        <div className="cyrp-head">
          <b>시험 실행</b>
          <span className="cyrp-sub">{plan?.cid || plan?.id || ''}</span>
          <span className="cyrp-sp" />
          <button type="button" className="cyrp-x" onClick={onClose} title="닫기 (Esc) — 도는 시험은 안 멈춥니다">
            ✕
          </button>
        </div>
        {/* RunDetail 은 `.panel` 안에 서는 것을 전제로 만들어졌다(바탕·테두리를
            거기서 받는다) — 팝업 안에서도 같은 옷을 입힌다. */}
        <div className="panel cyrp-body">
          <RunDetail runId={runId} plan={plan} onBack={onClose} onGone={onClose} />
        </div>
      </div>
    </div>
  )
}

/**
 * **실행 만들기 — 팝업.**
 *
 * 예전엔 누르는 즉시 플랜의 값 그대로 실행이 하나 생기고 Runs 로
 * 넘어갔다. 그런데 실제로는 **같은 플랜을 다른 모델·다른 빌드로** 도는
 * 일이 흔하다 — 그때 이름을 나중에 고치는 수밖에 없었다.
 *
 * 이제 만들기 전에 묻는다(지시): 모델그룹·모델명·버전그룹·버전명.
 * 모델명은 실행 Key 의 앞머리가 되고(E6100_R0006), 버전그룹은 Runs 왼쪽
 * 레일의 폴더가 된다.
 */
export function MakePlanRun({
  plan, catalog, owner, onClose, onMade,
}: {
  plan: CycleMeta
  /** 장비 카탈로그 — 모델그룹·모델명을 손으로 치면 표기가 갈린다 */
  catalog: Array<{ kind?: string; name?: string; model_group?: string | null }>
  owner: string
  onClose: () => void
  onMade: (runId: string) => void
}) {
  const groups = useMemo(
    () => [...new Set(catalog.filter((x) => x.kind === 'group').map((x) => String(x.name ?? '')))]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [catalog],
  )
  const [mg, setMg] = useState(String(plan.model_group ?? ''))
  const [mdl, setMdl] = useState(String(plan.model ?? ''))
  const [ver, setVer] = useState(String(plan.version ?? ''))
  /** 버전그룹 — 비워 두면 버전 이름의 첫 마디를 쓴다(서버와 같은 규칙) */
  const [vg, setVg] = useState(String(plan.version_group ?? '') || String(plan.version ?? '').split('_')[0] || '')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const models = useMemo(
    () => catalog
      .filter((x) => x.kind === 'model' && (!mg || String(x.model_group ?? '') === mg))
      .map((x) => String(x.name ?? ''))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [catalog, mg],
  )

  /* 버전 이름을 고치면 버전그룹도 따라간다 — 사람이 따로 손대기 전까지만.
     R100_2026_09_02 를 치면 폴더는 R100 이 되는 것이 자연스럽다. */
  const [vgTouched, setVgTouched] = useState(false)
  useEffect(() => {
    if (vgTouched) return
    setVg(ver.split('_')[0] ?? '')
  }, [ver, vgTouched])

  const save = async () => {
    if (busy) return
    setBusy(true)
    try {
      const r = await apiFetch('/api/plan-runs', {
        method: 'POST',
        body: JSON.stringify({
          plan_id: plan.id,
          model_group: mg,
          model: mdl,
          version: ver,
          version_group: vg,
          owner,
          name: name.trim() || `${plan.name ?? plan.cid ?? plan.id} · ${ver}`.trim(),
        }),
      })
      if (!r.ok) throw new Error('실행을 만들지 못했습니다')
      const j = (await r.json()) as { id?: string }
      if (!j.id) throw new Error('만든 실행의 번호를 받지 못했습니다')
      onMade(j.id)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '실행을 만들지 못했습니다')
      setBusy(false)
    }
  }

  return (
    <div className="cyrp-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cyrp-mk" role="dialog" aria-modal="true" aria-label="시험 실행 만들기">
        <header>시험 실행 만들기</header>
        <div className="cyrp-mb">
          <p className="cyrp-note">
            <b>{plan.cid || plan.id}</b> 의 시험 항목 {(plan.items ?? []).length}건을 <b>복사해</b> 실행을
            만듭니다. 복사한 뒤에는 플랜을 고쳐도 이 실행은 안 바뀝니다.
          </p>
          <label className="cyrp-fld">
            <span>모델그룹</span>
            <select
              value={mg}
              onChange={(e) => {
                setMg(e.target.value)
                /* 그룹을 바꾸면 그 그룹에 없는 모델은 지운다 — 안 맞는 짝이
                   남아 있으면 Key 앞머리가 엉뚱해진다 */
                setMdl((m) =>
                  catalog.some(
                    (x) => x.kind === 'model' && x.name === m && String(x.model_group ?? '') === e.target.value,
                  )
                    ? m
                    : '',
                )
              }}
            >
              <option value="">(안 고름)</option>
              {groups.map((g) => (
                <option key={g}>{g}</option>
              ))}
              {mg && !groups.includes(mg) && <option value={mg}>{mg} (목록에 없음)</option>}
            </select>
          </label>
          <label className="cyrp-fld">
            <span>모델명</span>
            <select value={mdl} onChange={(e) => setMdl(e.target.value)}>
              <option value="">(안 고름)</option>
              {models.map((m) => (
                <option key={m}>{m}</option>
              ))}
              {mdl && !models.includes(mdl) && <option value={mdl}>{mdl} (목록에 없음)</option>}
            </select>
            <em>실행 번호의 앞머리가 됩니다 — {(mdl || mg || 'RUN')}_R0001</em>
          </label>
          <label className="cyrp-fld">
            <span>버전명</span>
            <input value={ver} onChange={(e) => setVer(e.target.value)} placeholder="R100_2026_08_31" />
          </label>
          <label className="cyrp-fld">
            <span>버전그룹</span>
            <input
              value={vg}
              onChange={(e) => {
                setVgTouched(true)
                setVg(e.target.value)
              }}
              placeholder="R100"
            />
            <em>Runs 왼쪽 레일에서 이 폴더에 들어갑니다</em>
          </label>
          <label className="cyrp-fld">
            <span>제목</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="비우면 「플랜 · 버전」" />
          </label>
        </div>
        <footer>
          <span className="cyrp-note2">만들면 바로 열립니다</span>
          <span className="cyrp-sp" />
          <button type="button" className="cyrp-btn" onClick={onClose}>
            취소
          </button>
          <button type="button" className="cyrp-btn pri" disabled={busy || !ver.trim()} onClick={() => void save()}>
            {busy ? '만드는 중…' : '＋ 실행 만들기'}
          </button>
        </footer>
      </div>
    </div>
  )
}
