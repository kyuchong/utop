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
        {/* **윗줄과 아랫부분을 가른다**(지시). 무엇을 보고 있는지는 위에,
            닫기는 그 오른쪽 끝에 — 창을 거의 화면만큼 키웠으니 닫는 자리가
            눈에 안 띄면 빠져나갈 길을 못 찾는다. */}
        <header className="cyrp-bar">
          <b>시험 실행</b>
          <span className="cyrp-sub">
            {plan?.cid || plan?.id || ''}
            {plan?.name ? ` · ${plan.name}` : ''}
          </span>
          <span className="cyrp-sp" />
          <button type="button" className="cyrp-x" onClick={onClose} title="닫기 (Esc) — 도는 시험은 안 멈춥니다">
            ✕
          </button>
        </header>
        {/* RunDetail 은 `.panel` 안에 서는 것을 전제로 만들어졌다(바탕을
            거기서 받는다) — 옷은 입히되 테두리는 창이 이미 가졌으니 뺀다. */}
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
  plan, catalog, owner, seed = {}, vgroups = {}, onClose, onMade,
}: {
  plan: CycleMeta
  /** 장비 카탈로그 — 모델그룹·모델명을 손으로 치면 표기가 갈린다 */
  catalog: Array<{ kind?: string; name?: string; model_group?: string | null; family?: string | null }>
  owner: string
  /** **Plans 표가 그 플랜 줄에 그리는 값**(지시).
   *
   *  표는 플랜에 값이 비면 카탈로그에서 채워 보여 준다
   *  (family ← 모델의 제품군, model_group ← 모델의 그룹). 창이 플랜의
   *  날값만 읽으면 표에는 L3·E61xx 가 떠 있는데 창은 「(안 고름)」 이
   *  된다 — 같은 것을 두 자리에서 다르게 말하는 셈이다. 그래서 표가
   *  쓰는 그 값을 그대로 받는다. */
  seed?: { family?: string; model_group?: string; model?: string; version_group?: string }
  /** 이미 쓰고 있는 버전그룹 — `{ 모델: [버전그룹…] }` 꼴이다.
   *  (예전에 이 자리에 열쇠를 넣어 **모델 이름**이 버전그룹 고르개에
   *   떴다 — TMDL·E6100. 값이 버전그룹이다.) */
  vgroups?: Record<string, string[]>
  onClose: () => void
  onMade: (runId: string) => void
}) {
  const groups = useMemo(
    () => [...new Set(catalog.filter((x) => x.kind === 'group').map((x) => String(x.name ?? '')))]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [catalog],
  )
  const [mg, setMg] = useState(String(seed.model_group ?? plan.model_group ?? ''))
  const [mdl, setMdl] = useState(String(seed.model ?? plan.model ?? ''))
  /** 버전은 **비운 채로 시작한다**(지시).
   *
   *  플랜의 버전을 미리 적어 두었더니, 새 빌드를 돌리려고 만든 실행이
   *  그대로 지난 버전으로 만들어졌다. 실행을 새로 뜨는 까닭은 대개
   *  「빌드가 새로 나와서」 다 — 그 값만은 사람이 적어야 한다.
   *  빈 값이면 만들기 단추가 안 눌린다(아래 disabled). */
  /** 제품군 — 모델명에서 따라온다. 카탈로그가 정본이라 손으로 치면
   *  표기가 갈린다(L3 · L3 스위치 …). 손대기 전까지만 따라온다. */
  const [fam, setFam] = useState(String(seed.family ?? plan.family ?? ''))
  /* 씨앗이 이미 제품군을 줬으면 모델 따라가기가 그것을 덮지 않는다 —
     표에 뜬 값과 달라지면 안 된다 */
  const [famTouched, setFamTouched] = useState(!!seed.family)
  const [ver, setVer] = useState('')
  /** 버전그룹 — **플랜 것으로 시작한다.** 이것은 빌드 이름이 아니라
   *  Runs 트리의 **폴더**라, 대개 플랜과 같은 자리에 담긴다. 미리 채워
   *  두면 「오늘」 한 번으로 버전명이 완성된다.
   *  (버전명은 비운 채로 둔다 — 그것이 곧 어떤 빌드를 돌리느냐다.) */
  const [vg, setVg] = useState(String(seed.version_group ?? plan.version_group ?? ''))
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
  /** 고를 버전그룹 — **고른 모델이 쓰던 것**이 먼저다. 모델을 안 골랐거나
   *  그 모델에 쌓인 것이 없으면 전부에서 고른다. 플랜 것은 늘 넣는다. */
  const vgList = useMemo(() => {
    const all = Object.values(vgroups ?? {}).flat().map(String)
    const mine = (vgroups?.[mdl] ?? []).map(String)
    return [...new Set([...(mine.length ? mine : all), String(plan.version_group ?? '')].filter(Boolean))]
      .sort((a2, b2) => b2.localeCompare(a2, undefined, { numeric: true }))
  }, [vgroups, mdl, plan.version_group])

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

  /* 버전 이름을 다 치면 버전그룹이 그 앞머리로 따라간다.
     R101_2026_09_10 을 치면 폴더는 R101 이 되는 것이 자연스럽다.

     **다 친 뒤에만** 따라간다(shape). 예전엔 한 글자마다 따라가서, 「이상한
     이름」 을 치는 도중 그것이 통째로 버전그룹이 되고 「오늘」 이 그 위에
     날짜를 붙였다 — 이상한이름_2026_09_02 (검증에서 잡음). */
  useEffect(() => {
    const v = ver.trim()
    if (!/^[A-Za-z]\w*_\d{4}_\d{2}_\d{2}$/.test(v)) return
    const h = v.split('_')[0] ?? ''
    if (h) setVg(h)
  }, [ver])

  /** 오늘 — YYYY-MM-DD. 자리 채움 0 까지 맞춘다 */
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  /** **버전명이 성한가.**
   *
   *  빌드 이름은 「버전그룹_연_월_일」 이 관례다. 모양이 틀리거나 앞머리가
   *  고른 버전그룹과 다르면 Runs 트리에서 엉뚱한 폴더에 들어간다 — 만든
   *  뒤에 알면 옮길 길이 없다. 그래서 만들기 전에 막고 까닭을 말한다. */
  const shape = /^[A-Za-z]\w*_\d{4}_\d{2}_\d{2}$/.test(ver.trim())
  const head = ver.trim().split('_')[0] ?? ''
  const match = !vg || head === vg
  const [verTouched, setVerTouched] = useState(false)
  const bad = !ver.trim()
    ? '버전명을 입력하세요'
    : !shape
      ? 'R100_2026_08_31 형태로 입력하세요'
      : !match
        ? `버전그룹이 ${vg} 인데 버전명은 ${head} 입니다`
        : ''

  /** 「오늘」 단추 — 버전그룹 뒤에 오늘 날짜를 붙인다(R100_2026_09_02).
   *  빌드 이름을 손으로 치다 자릿수를 틀리는 일이 잦다. */
  const stampToday = () => {
    if (!vg) {
      window.alert('버전그룹을 먼저 고르세요 — 그 뒤에 오늘 날짜를 붙입니다')
      return
    }
    const d = new Date()
    setVerTouched(true)
    setVer(`${vg}_${d.getFullYear()}_${String(d.getMonth() + 1).padStart(2, '0')}_${String(d.getDate()).padStart(2, '0')}`)
  }

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
          /* 기간을 안 적으면 **오늘부터 일주일**로 둔다. 비워 두면 Runs 의
             기간 칸이 빈 채로 남아 언제까지 하는 일인지 아무도 모른다. */
          start_date: sd || ymd(new Date()),
          end_date: ed || ymd(new Date(Date.now() + 7 * 864e5)),
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

  const sel = (
    label: string,
    v: string,
    set: (x: string) => void,
    opts: string[],
    sys = false,
  ) => (
    <label className={`cyrp-f${sys ? ' sys' : ''}`}>
      <span>{label}</span>
      <select value={v} onChange={(e) => set(e.target.value)}>
        <option value="">(안 고름)</option>
        {opts.map((o) => (
          <option key={o}>{o}</option>
        ))}
        {!!v && !opts.includes(v) && <option value={v}>{v} (목록에 없음)</option>}
      </select>
    </label>
  )

  return (
    <div className="cyrp-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cyrp-mk" role="dialog" aria-modal="true" aria-label="시험 실행 만들기">
        <header>
          <h1>시험 실행 만들기</h1>
          <p>
            <b>{plan.cid || plan.id}</b> 의 시험 항목 {(plan.items ?? []).length}건을 복사합니다 ·
            복사 뒤 플랜을 고쳐도 이 실행은 안 바뀝니다
          </p>
        </header>

        {/* 두 칸씩 놓아 높이를 절반으로. 가는 줄로 세 묶음을 가른다 —
            사람이 정하는 칸 · 물려받는 칸 · 빌드. */}
        <div className="cyrp-mb">
          <label className="cyrp-f wide">
            <span>제목</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="비우면 「플랜 · 버전」" />
          </label>

          {sel('담당자', who, setWho, people)}
          {sel('유형', type, setType, TYPES)}

          <div className="cyrp-sep" />

          {sel('제품군', fam, (v) => {
            setFamTouched(true)
            setFam(v)
          }, families, true)}
          {sel('모델그룹', mg, (v) => {
            setMg(v)
            /* 그룹을 바꾸면 그 그룹에 없는 모델은 지운다 — 안 맞는 짝이
               남아 있으면 실행 번호의 앞머리가 엉뚱해진다 */
            setMdl((m) =>
              catalog.some(
                (x) => x.kind === 'model' && x.name === m && String(x.model_group ?? '') === v,
              )
                ? m
                : '',
            )
          }, groups, true)}
          {sel('모델명', mdl, setMdl, models, true)}
          {/* **고르거나 직접 치거나**(지시). 고르개만 두면 새 폴더를 못
              만들고, 빈 칸만 두면 표기가 갈린다 — 목록을 곁들인 입력칸이
              둘을 다 준다. */}
          <label className="cyrp-f sys">
            <span>버전그룹</span>
            <input
              list="cyrp-vglist"
              value={vg}
              onChange={(e) => setVg(e.target.value)}
              placeholder="R100 — 고르거나 직접"
            />
            <datalist id="cyrp-vglist">
              {vgList.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </label>

          <div className="cyrp-sep" />

          <label className="cyrp-f key wide">
            <span>버전명</span>
            <div className="cyrp-verrow">
              <input
                value={ver}
                onChange={(e) => {
                  setVerTouched(true)
                  setVer(e.target.value)
                }}
                placeholder={String(plan.version ?? '') || 'R100_2026_08_31'}
                spellCheck={false}
                autoFocus
              />
              {/* 빌드 이름은 「버전그룹_날짜」 가 관례다 — 손으로 치다 자릿수를
                  틀리느니 눌러서 넣는다 */}
              <button type="button" className="cyrp-today" onClick={stampToday} title="버전그룹 뒤에 오늘 날짜를 붙입니다">
                오늘
              </button>
            </div>
            {bad && verTouched ? (
              <em className="bad">{bad}</em>
            ) : bad ? (
              /* 아직 손도 안 댔으면 빨간 글씨로 다그치지 않는다 — 옅은
                 안내글(플랜의 버전)을 값으로 오해하기 딱 좋다 */
              <em>버전그룹을 고르고 「오늘」 을 누르거나, 빌드 이름을 적으세요</em>
            ) : (
              <em>
                실행 번호 <b>{(mdl || mg || 'RUN')}_R0001</b> · Runs 트리 <b>{vg || head}</b> 폴더
              </em>
            )}
          </label>

          <label className="cyrp-f wide">
            <span>기간</span>
            <div className="cyrp-daterow">
              <input type="date" value={sd} onChange={(e) => setSd(e.target.value)} />
              <i>~</i>
              <input type="date" value={ed} onChange={(e) => setEd(e.target.value)} />
            </div>
            {!!sd && !!ed && ed < sd ? (
              <em className="bad">종료가 시작보다 빠릅니다</em>
            ) : (
              <em>비워 두면 오늘부터 일주일</em>
            )}
          </label>
        </div>

        <footer>
          <span className="cyrp-note2">만들면 Runs 로 갑니다</span>
          <span className="cyrp-sp" />
          <button type="button" className="cyrp-btn" onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className="cyrp-btn pri"
            disabled={busy || !!bad || (!!sd && !!ed && ed < sd)}
            onClick={() => void save()}
          >
            {busy ? '만드는 중…' : '＋ 실행 만들기'}
          </button>
        </footer>
      </div>
    </div>
  )
}
