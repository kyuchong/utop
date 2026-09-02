import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import RunDetail from '@/components/run/RunDetail'
import { useCodes } from '@/hooks/useCodes'
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
 *
 * 만들고 나면 **Runs 화면으로 넘어간다**(지시). 「▶ 실행」 이 팝업인 것과
 * 다르다 — 그것은 보던 플랜을 지키려는 것이고, 만들기는 그 실행을 돌리러
 * 가는 일이다.
 */
export function MakePlanRun({
  plan, catalog, owner, onClose, onMade,
}: {
  plan: CycleMeta
  /** 장비 카탈로그 — 모델그룹·모델명을 손으로 치면 표기가 갈린다 */
  catalog: Array<{ kind?: string; name?: string; model_group?: string | null; family?: string | null }>
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
  /** 버전은 **비운 채로 시작한다**(지시).
   *
   *  플랜의 버전을 미리 적어 두었더니, 새 빌드를 돌리려고 만든 실행이
   *  그대로 지난 버전으로 만들어졌다. 실행을 새로 뜨는 까닭은 대개
   *  「빌드가 새로 나와서」 다 — 그 값만은 사람이 적어야 한다.
   *  빈 값이면 만들기 단추가 안 눌린다(아래 disabled). */
  /** 제품군 — 모델명에서 따라온다. 카탈로그가 정본이라 손으로 치면
   *  표기가 갈린다(L3 · L3 스위치 …). 손대기 전까지만 따라온다. */
  const [fam, setFam] = useState(String(plan.family ?? ''))
  const [famTouched, setFamTouched] = useState(false)
  const [ver, setVer] = useState('')
  /** 버전그룹 — 버전명을 치면 첫 마디가 따라 들어온다(서버와 같은 규칙) */
  const [vg, setVg] = useState('')
  const [name, setName] = useState('')
  /** 담당자 — 비면 이 실행을 만든 사람. Runs 목록의 「담당자」 칸이 이 값이다 */
  const [who, setWho] = useState(owner)
  /** 유형 — 플랜의 것을 물려받되 이 실행에서 바꿀 수 있다(표준항목·회귀…) */
  const [type, setType] = useState(String(plan.type ?? ''))
  /** 시험 기간 — 실제로 언제 돌았나(started_at)와 다르다. 「언제까지 하기로
   *  했나」 이고, 플랜의 기간을 물려받는다. */
  const [sd, setSd] = useState(String(plan.start_date ?? ''))
  const [ed, setEd] = useState(String(plan.end_date ?? ''))
  const [busy, setBusy] = useState(false)

  /** 담당 고를 이름들 — 온 화면이 쓰는 그 목록이다(퇴사자는 서버가 뺀다).
   *  공용 고르개(AssigneePicker)는 창보다 아래(z-index 60)에 서서 이 창
   *  뒤로 숨는다 — 여기서는 같은 자료를 고르개 한 줄로 낸다. */
  const nameQ = useQuery({
    queryKey: ['user-names'],
    staleTime: 60_000,
    queryFn: async () => {
      const r = await apiFetch('/api/user-names')
      if (!r.ok) return { names: [] as Array<{ name: string; org: string }> }
      return (await r.json()) as { names?: Array<{ name: string; org: string }> }
    },
  })
  const people = useMemo(
    () => [...new Set((nameQ.data?.names ?? []).map((x) => String(x.name ?? '')).filter(Boolean))],
    [nameQ.data],
  )
  const TYPES = useCodes('cycle_type', ['표준항목'])

  const models = useMemo(
    () => catalog
      .filter((x) => x.kind === 'model' && (!mg || String(x.model_group ?? '') === mg))
      .map((x) => String(x.name ?? ''))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [catalog, mg],
  )

  /** 카탈로그에 있는 제품군들 */
  const families = useMemo(
    () => [...new Set(catalog.filter((x) => x.kind === 'model').map((x) => String(x.family ?? '')))]
      .filter(Boolean)
      .sort((a2, b2) => a2.localeCompare(b2, undefined, { numeric: true })),
    [catalog],
  )
  /** 모델명 → 제품군. 모델을 고르면 제품군이 따라온다 */
  const famOf = useMemo(
    () => new Map(catalog.filter((x) => x.kind === 'model').map((x) => [String(x.name ?? ''), String(x.family ?? '')])),
    [catalog],
  )
  useEffect(() => {
    if (famTouched) return
    const f = famOf.get(mdl)
    if (f) setFam(f)
  }, [mdl, famOf, famTouched])

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
          owner: who,
          start_date: sd,
          end_date: ed,
          /* 유형은 실행이 제 것으로 들고 간다. 플랜의 유형을 그대로 읽으면
             플랜을 나중에 고칠 때 이미 돈 실행의 성격까지 따라 바뀐다 —
             항목을 복사해 오는 것과 같은 까닭이다. */
          meta: { type, family: fam },
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
            <span>제목</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="비우면 「플랜 · 버전」" />
          </label>
          <label className="cyrp-fld">
            <span>담당자</span>
            <select value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">(안 정함)</option>
              {people.map((n) => (
                <option key={n}>{n}</option>
              ))}
              {!!who && !people.includes(who) && <option value={who}>{who}</option>}
            </select>
          </label>
          <label className="cyrp-fld">
            <span>유형</span>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">(안 정함)</option>
              {TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
              {!!type && !TYPES.includes(type) && <option value={type}>{type}</option>}
            </select>
          </label>
          <label className="cyrp-fld">
            <span>제품군</span>
            <select
              value={fam}
              onChange={(e) => {
                setFamTouched(true)
                setFam(e.target.value)
              }}
            >
              <option value="">(안 고름)</option>
              {families.map((f) => (
                <option key={f}>{f}</option>
              ))}
              {!!fam && !families.includes(fam) && <option value={fam}>{fam} (목록에 없음)</option>}
            </select>
          </label>
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
            <span>버전명</span>
            <input
              value={ver}
              onChange={(e) => setVer(e.target.value)}
              placeholder={String(plan.version ?? '') || 'R100_2026_08_31'}
              autoFocus
            />
            {/* 플랜의 버전은 **알려만 준다** — 채워 넣지 않는다. 같은 빌드를
                다시 돌릴 때는 이 값을 보고 그대로 적으면 된다. */}
            {!!plan.version && <em>플랜의 버전은 {plan.version} 입니다</em>}
          </label>
          <label className="cyrp-fld">
            <span>시작</span>
            <input type="date" value={sd} onChange={(e) => setSd(e.target.value)} />
          </label>
          <label className="cyrp-fld">
            <span>종료</span>
            <input type="date" value={ed} onChange={(e) => setEd(e.target.value)} />
            {/* 언제까지 하기로 했나다 — 실제로 돌린 시각(경과)과는 다르다 */}
            {!!sd && !!ed && ed < sd && <em className="bad">종료가 시작보다 빠릅니다</em>}
          </label>
        </div>
        <footer>
          <span className="cyrp-note2">만들면 Runs 로 갑니다</span>
          <span className="cyrp-sp" />
          <button type="button" className="cyrp-btn" onClick={onClose}>
            취소
          </button>
          <button type="button" className="cyrp-btn pri" disabled={busy || !ver.trim() || (!!sd && !!ed && ed < sd)} onClick={() => void save()}>
            {busy ? '만드는 중…' : '＋ 실행 만들기'}
          </button>
        </footer>
      </div>
    </div>
  )
}
