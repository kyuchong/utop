/**
 * **사이클 만들기** — 목업대로, 대상·버전·담당만 묻는 작은 창.
 *
 * 전에는 「＋ 사이클」 이 큰 편집 창(CycleEdit)을 열었다. 제목·설명 편집기와
 * Test Cases 탭까지 한꺼번에 나와, 정작 만드는 데 꼭 필요한 것(어느 모델의
 * 어느 버전인가)이 오른쪽 구석에 밀려 있었다. 만들기와 고치기는 다른 일이다 —
 * 만들 때는 자리를 정하고, 알맹이는 만든 뒤에 채운다.
 *
 * 고르개의 정본은 둘이다. **사업자**는 설정의 코드표(cycle_customer),
 * **제품군·모델그룹·모델명**은 장비 카탈로그다. 손으로 치게 두면
 * `E4320-24P_2` 같은 것이 생겨 트리가 갈린다.
 */
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import './MakeCycle.css'

interface CatRow {
  kind?: string
  name?: string
  family?: string | null
  model_group?: string | null
  operator?: string | null
}

/** 오늘을 버전명에 쓰는 꼴로 — R100_2026_09_03 */
function today(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}_${p(d.getMonth() + 1)}_${p(d.getDate())}`
}

export default function MakeCycle({
  me,
  onClose,
  onMade,
}: {
  me?: { username?: string; name?: string } | null
  onClose: () => void
  /** 만든 사이클의 안쪽 id 와 **선 자리** — 트리에서 바로 짚을 수 있게 */
  onMade: (id: string, at: { cust: string; model: string; vg: string; ver: string }) => void
}) {
  const [cust, setCust] = useState('')
  const [family, setFamily] = useState('')
  const [mgroup, setMgroup] = useState('')
  const [model, setModel] = useState('')
  const [vgroup, setVgroup] = useState('')
  const [newVg, setNewVg] = useState('')
  const [version, setVersion] = useState('')
  const [owner, setOwner] = useState(me?.name || me?.username || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose, busy])

  const codesQ = useQuery({
    queryKey: ['codes'],
    staleTime: 60_000,
    queryFn: async () => {
      const r = await apiFetch('/api/codes')
      if (!r.ok) throw new Error('코드를 불러오지 못했습니다')
      return (await r.json()) as { items: Array<{ kind: string; value: string }> }
    },
  })
  const catQ = useQuery({
    queryKey: ['device-catalog'],
    staleTime: 60_000,
    queryFn: async () => {
      const r = await apiFetch('/api/device-catalog2')
      if (!r.ok) throw new Error('장비 카탈로그를 불러오지 못했습니다')
      return (await r.json()) as { items: CatRow[] }
    },
  })
  const vgQ = useQuery({
    queryKey: ['cycle-version-groups'],
    staleTime: 60_000,
    queryFn: async () => {
      const r = await apiFetch('/api/cycle-version-groups')
      if (!r.ok) throw new Error('버전그룹을 불러오지 못했습니다')
      return (await r.json()) as { groups: Record<string, string[]> }
    },
  })
  const usersQ = useQuery({
    queryKey: ['users-mentionable'],
    staleTime: 60_000,
    queryFn: async () => {
      const r = await apiFetch('/api/users/mentionable')
      if (!r.ok) throw new Error('사람을 불러오지 못했습니다')
      return (await r.json()) as { users: Array<{ username?: string; name?: string }> }
    },
  })

  const cat = useMemo(() => catQ.data?.items ?? [], [catQ.data])
  const custs = useMemo(
    () => (codesQ.data?.items ?? []).filter((i) => i.kind === 'cycle_customer').map((i) => i.value),
    [codesQ.data],
  )
  const of = (kind: string) =>
    [...new Set(cat.filter((x) => x.kind === kind).map((x) => String(x.name ?? '')))]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

  /** 모델 행 — **제품군↔모델그룹을 잇는 것은 이 줄뿐이다.**
      카탈로그의 group 행에는 family 칸이 비어 있어(213 확인), group 행만
      보면 L3 를 골라도 L2 그룹이 그대로 남는다(지적). */
  const modelRows = useMemo(() => cat.filter((x) => x.kind === 'model'), [cat])
  const sortKo = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true })
  const uniqSort = (xs: Array<string | null | undefined>) =>
    [...new Set(xs.map((v) => String(v ?? '')))].filter(Boolean).sort(sortKo)

  /** 제품군 — **늘 전부**다. 아래 칸으로 위 칸을 좁히면, 제품군을 바꾸려고
      할 때 바꾸려는 값이 목록에 없어 먼저 아래를 비워야 한다(막다른 길).
      대신 아래를 고르면 위를 **채워 준다**(아래 effect). */
  const families = useMemo(() => of('family'), [cat])

  /** 모델그룹 — 제품군을 골랐으면 그 제품군의 모델이 속한 그룹만 */
  const mgroups = useMemo(() => {
    const all = of('group')
    if (!family) return all
    const mine = uniqSort(
      modelRows.filter((x) => String(x.family ?? '') === family).map((x) => x.model_group),
    )
    /* 고른 값이라고 남겨 두지 않는다. 남기면 제품군을 L3 로 바꿔도 OLT 의
       U95xxH 가 그대로 앉아, 아래 정리 effect 도 「목록에 있다」 며 안 비운다
       — 저장하면 트리가 엉뚱한 자리에 선다. */
    return all.filter((v) => mine.includes(v))
  }, [cat, modelRows, family])

  /** 모델 — 위에서 고른 제품군·모델그룹으로 좁힌다 */
  const models = useMemo(
    () =>
      uniqSort(
        modelRows
          .filter((x) => !family || String(x.family ?? '') === family)
          .filter((x) => !mgroup || String(x.model_group ?? '') === mgroup)
          .map((x) => x.name),
      ),
    [modelRows, family, mgroup],
  )
  /** 이 모델이 이미 쓰는 버전그룹 */
  const vgs = useMemo(() => {
    const g = vgQ.data?.groups ?? {}
    const mine = model ? (g[model] ?? []) : Object.values(g).flat()
    return [...new Set(mine.map(String))].filter(Boolean).sort()
  }, [vgQ.data, model])

  /* 모델을 고르면 제품군·모델그룹을 카탈로그에서 채운다 — 사람이 셋을
     따로 맞추다 어긋나면 트리가 엉뚱한 자리에 선다. */
  useEffect(() => {
    if (!model) return
    const row = cat.find((x) => x.kind === 'model' && String(x.name ?? '') === model)
    if (!row) return
    if (row.family) setFamily(String(row.family))
    if (row.model_group) setMgroup(String(row.model_group))
  }, [model, cat])

  /* 모델그룹을 고르면 제품군을 채운다 — 그 그룹의 모델이 모두 한 제품군일
     때만. 여럿에 걸쳐 있으면(UbiEnt 처럼) 사람이 고를 몫이다. */
  useEffect(() => {
    if (!mgroup || family) return
    const fams = uniqSort(
      modelRows.filter((x) => String(x.model_group ?? '') === mgroup).map((x) => x.family),
    )
    if (fams.length === 1 && fams[0]) setFamily(fams[0])
    // uniqSort·modelRows 는 카탈로그가 오면 한 번 정해진다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mgroup, modelRows])

  /* 위 칸을 바꿔 아래 칸의 고른 값이 후보에서 빠지면 비운다. 남겨 두면
     화면에는 E61xx 가 보이는데 목록에는 없는, 저장하면 어긋나는 값이 된다. */
  useEffect(() => {
    if (mgroup && !mgroups.includes(mgroup)) setMgroup('')
  }, [mgroups, mgroup])
  useEffect(() => {
    if (model && !models.includes(model)) setModel('')
  }, [models, model])

  const vg = (newVg.trim() || vgroup).trim()

  /** 버전명 채우기 — 버전그룹_오늘 */
  function fillToday() {
    setVersion(`${vg || 'R000'}_${today()}`)
  }

  const ready = !!vg && !!version.trim() && !busy

  async function make() {
    if (!ready) return
    setBusy(true)
    setErr('')
    try {
      /* 새 버전그룹은 **폴더 목록에도** 넣는다. 안 넣으면 만들기 창에서만
         쓰이고 트리·다음 만들기에서는 안 보인다(두 살림이 갈린다). */
      if (newVg.trim() && model)
        await apiFetch('/api/cycle-version-groups/add', {
          method: 'POST',
          body: JSON.stringify({ model, group: newVg.trim() }),
        }).catch(() => undefined)

      const id = `cycle-${Date.now()}`
      const r = await apiFetch(`/api/cycle/${encodeURIComponent(id)}`, {
        method: 'POST',
        body: JSON.stringify({
          id,
          name: version.trim(),
          customer: cust,
          family,
          model_group: mgroup,
          model,
          version_group: vg,
          version: version.trim(),
          assignee: owner,
          items: [],
        }),
      })
      if (!r.ok) throw new Error('만들지 못했습니다')
      onMade(id, {
        cust: cust || '미지정',
        model: model || '미지정',
        vg: vg || '미지정',
        ver: version.trim(),
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mkc-back" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="mkc" role="dialog" aria-modal="true" aria-label="사이클 만들기">
        <header className="mkc-head">
          <b>사이클 만들기</b>
          <span className="mkc-sp" />
          <button type="button" className="mkc-x" title="닫기" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="mkc-body">
          <fieldset className="mkc-set">
            <legend>대상</legend>
            <div className="mkc-grid">
              <label>
                <span>사업자</span>
                <select value={cust} onChange={(e) => setCust(e.target.value)}>
                  <option value="">(안 고름)</option>
                  {custs.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>제품군</span>
                <select value={family} onChange={(e) => setFamily(e.target.value)}>
                  <option value="">(안 고름)</option>
                  {families.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>모델그룹</span>
                <select value={mgroup} onChange={(e) => setMgroup(e.target.value)}>
                  <option value="">(안 고름)</option>
                  {mgroups.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>모델명</span>
                <select value={model} onChange={(e) => setModel(e.target.value)}>
                  <option value="">고르세요</option>
                  {models.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>

          <fieldset className="mkc-set">
            <legend>버전</legend>
            <div className="mkc-grid">
              <label>
                <span>
                  버전그룹 <i className="mkc-req">*</i>
                </span>
                <select
                  value={vgroup}
                  onChange={(e) => {
                    setVgroup(e.target.value)
                    setNewVg('')
                  }}
                >
                  <option value="">(새로 적기)</option>
                  {vgs.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{vgroup ? '새 버전그룹' : '새 버전그룹 *'}</span>
                <input
                  value={newVg}
                  placeholder="예: R300"
                  onChange={(e) => {
                    setNewVg(e.target.value)
                    if (e.target.value) setVgroup('')
                  }}
                />
              </label>
              <label className="mkc-wide">
                <span>
                  버전명 <i className="mkc-req">*</i>
                </span>
                <span className="mkc-row">
                  <input
                    value={version}
                    placeholder="예: R300_2026_06_30"
                    onChange={(e) => setVersion(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn small"
                    title="버전그룹에 오늘 날짜를 붙입니다"
                    onClick={fillToday}
                  >
                    오늘
                  </button>
                </span>
              </label>
            </div>
          </fieldset>

          <fieldset className="mkc-set">
            <legend>담당</legend>
            <div className="mkc-grid">
              <label className="mkc-wide">
                <span className="sr">담당</span>
                <select value={owner} onChange={(e) => setOwner(e.target.value)}>
                  <option value="">(안 정함)</option>
                  {(usersQ.data?.users ?? []).map((u) => {
                    const v = String(u.name || u.username || '')
                    return (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    )
                  })}
                </select>
              </label>
            </div>
          </fieldset>

          <p className="mkc-hint">
            만든 뒤 <b>시험 항목</b>을 담고, 담긴 항목의 방식대로 자동·수동 실행을 시작합니다
          </p>
          {!!err && <p className="mkc-err">{err}</p>}
        </div>

        <footer className="mkc-foot">
          <span className="mkc-where">
            {[cust, model].filter(Boolean).join(' · ') || '대상을 고르세요'}
          </span>
          <span className="mkc-sp" />
          <button type="button" className="btn small" disabled={busy} onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className="btn small mkc-go"
            disabled={!ready}
            title={ready ? '' : '버전그룹과 버전명은 있어야 합니다'}
            onClick={() => void make()}
          >
            {busy ? '만드는 중…' : '만들기'}
          </button>
        </footer>
      </div>
    </div>
  )
}
