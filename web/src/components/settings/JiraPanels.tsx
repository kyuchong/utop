import { useEffect, useMemo, useState } from 'react'
import JiraDefaults from './JiraDefaults'
import { apiFetch } from '@/api/client'
import SetTabs from './SetTabs'

/**
 * 이슈 본문에 넣을 판.
 *
 * 결함을 Jira 에 올릴 때 무엇을 담을지다. 프로젝트마다 원하는 것이 다르다 —
 * 어떤 팀은 커널 로그까지 붙이라 하고, 어떤 팀은 절차만 본다.
 */
const PANELS: Array<{ k: string; label: string; auto: boolean }> = [
  { k: 'req', label: '관련 근거', auto: true },
  { k: 'purpose', label: '목적', auto: true },
  { k: 'pre', label: '사전 준비 조건', auto: true },
  { k: 'topo', label: '시험 구성도', auto: false },
  { k: 'steps', label: '시험 절차 및 결과', auto: true },
  { k: 'kernel', label: 'Kernel Log', auto: true },
]

/** 프로젝트 하나의 설정 */
/** 종류(Defect·CR) 하나의 설정 — 어느 이슈유형으로, 어떤 값을 미리 채울지 */
interface KindCfg {
  issuetype?: string
  field_defaults?: Record<string, string>
}

interface Tmpl {
  /** Fail 을 자동으로 이슈로 올리나 */
  auto?: boolean
  /** 이 프로젝트로 보낼 장비 모델들 */
  auto_models?: string[]
  /** 종류별로 켤 판 */
  panels?: Record<string, string[]>
  /** 종류별 이슈유형·필드 기본값 — 이슈 등록 팝업이 이 값으로 칸을 미리 채운다 */
  defect?: KindCfg
  cr?: KindCfg
}

interface Proj {
  key: string
  name: string
}

const KINDS: Array<{ k: string; label: string }> = [
  { k: 'defect', label: 'Defect' },
  { k: 'cr', label: 'CR' },
]

/**
 * Jira 프로젝트 패널 설정.
 *
 * 프로젝트마다 이슈 본문에 무엇을 담을지, 그리고 **Fail 을 자동으로
 * 이슈로 올릴지**를 정한다.
 *
 * 자동 등록이 기본으로 꺼져 있는 것이 중요하다. 64건 돌려 20건 깨지면
 * Jira 에 이슈 20개가 생긴다 — 그중 열여덟은 같은 원인이거나 시험이
 * 잘못된 것이다. 켜는 것은 사람이 판단한다.
 *
 * 어느 프로젝트로 보낼지는 **장비 모델**로 가른다. 백엔드가 그 표를 읽어
 * 모델 → 프로젝트로 옮긴다(`auto_models`).
 */
export default function JiraPanels() {
  const [tmpl, setTmpl] = useState<Record<string, Tmpl>>({})
  const [projects, setProjects] = useState<Proj[]>([])
  const [sel, setSel] = useState('')
  const [msg, setMsg] = useState<{ kind: string; text: string }>({ kind: '', text: '' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void (async () => {
      const r = await apiFetch('/api/jira/config')
      if (!r.ok) return
      const j = (await r.json()) as { panel_templates?: Record<string, Tmpl>; fav_projects?: string[] }
      setTmpl(j.panel_templates ?? {})
      // 자주 쓰는 프로젝트가 정해져 있으면 그것부터. 없으면 이미 설정된 것들
      const known = j.fav_projects?.length ? j.fav_projects : Object.keys(j.panel_templates ?? {})
      setProjects(known.map((k) => ({ key: k, name: '' })))
      setSel(known[0] ?? '')
    })()
  }, [])

  const loadProjects = async () => {
    setBusy(true)
    try {
      const r = await apiFetch('/api/jira/projects')
      const j = (await r.json()) as { ok?: boolean; projects?: Proj[]; error?: string }
      if (!j.ok) {
        setMsg({ kind: 'err', text: j.error || '프로젝트를 못 읽었습니다' })
        return
      }
      setProjects(j.projects ?? [])
      if (!sel && j.projects?.length) setSel(j.projects[0]!.key)
    } finally {
      setBusy(false)
    }
  }

  const cur: Tmpl = useMemo(() => tmpl[sel] ?? {}, [tmpl, sel])

  /** 고치면 바로 저장한다 — 판 하나 켜고 저장을 또 누르게 하지 않는다 */
  const patch = async (p: Partial<Tmpl>) => {
    if (!sel) return
    const next = { ...tmpl, [sel]: { ...cur, ...p } }
    setTmpl(next)
    setBusy(true)
    try {
      const r = await apiFetch('/api/jira/config', {
        method: 'POST',
        body: JSON.stringify({ panel_templates: next }),
      })
      setMsg(r.ok ? { kind: 'ok', text: '저장했습니다' } : { kind: 'err', text: '저장하지 못했습니다' })
    } finally {
      setBusy(false)
    }
  }

  const onFor = (kind: string): Set<string> => {
    const v = cur.panels?.[kind]
    // 정한 적이 없으면 전부 켠 것으로 본다 — 처음 쓰는 사람이 빈 이슈를 올리지 않게
    return new Set(v ?? PANELS.map((p) => p.k))
  }

  const togglePanel = (kind: string, k: string) => {
    const s = onFor(kind)
    if (s.has(k)) s.delete(k)
    else s.add(k)
    void patch({ panels: { ...(cur.panels ?? {}), [kind]: [...s] } })
  }

  /* 두 가지 일이 한 화면에 쌓여 있었다(지적) — 탭으로 가른다.
     기본값: 이슈를 어디로 낼까 · 이슈 패널: 이슈 본문에 무엇을 담을까 */
  const [tab, setTab] = useState<'def' | 'panel'>(() =>
    localStorage.getItem('utop.jirapanel.tab') === 'def' ? 'def' : 'panel',
  )
  useEffect(() => {
    localStorage.setItem('utop.jirapanel.tab', tab)
  }, [tab])

  const setAll = (kind: string, on: boolean) =>
    void patch({ panels: { ...(cur.panels ?? {}), [kind]: on ? PANELS.map((p) => p.k) : [] } })

  return (
    <div className="set-page">
      <div className="set-head">
        <b>Jira 프로젝트 패널 설정</b>
        <span className="muted small">
          프로젝트마다 이슈 본문에 무엇을 담을지 정합니다. 고치면 바로 저장됩니다.
        </span>
        <span className="sp" />
        {msg.text && <span className={`muted small ${msg.kind}`}>{msg.text}</span>}
        {tab === 'panel' && (
          <button
            className="btn small"
            type="button"
            disabled={busy}
            onClick={() => void loadProjects()}
          >
            프로젝트 불러오기
          </button>
        )}
      </div>

      {/* 탭 둘 — SETUP 안의 갈래는 한 벌이다(지적) */}
      <SetTabs<'def' | 'panel'>
        value={tab}
        onChange={setTab}
        tabs={[
          { k: 'def', label: '기본값', hint: '새 이슈에 미리 채울 값·자주 쓰는 프로젝트' },
          { k: 'panel', label: '이슈 패널', hint: '화면에 띄울 Jira 패널' },
        ]}
      />

      {tab === 'def' && <JiraDefaults />}
      {tab === 'panel' && (
        <>


      {/* 자동 등록. 기본이 꺼짐인 것이 중요하다 — 64건 돌려 20건 깨지면
          이슈가 20개 생기는데 그중 열여덟은 같은 원인이거나 시험이 틀린
          것이다. 켜는 것은 사람이 판단한다. */}
      {sel && (
        <div className={`jp-auto${cur.auto ? ' on' : ''}`}>
          <div>
            <b>Fail 자동 이슈 등록 — {sel}</b>
            <p className="muted small">
              사이클을 돌려 이 프로젝트로 매긴 Fail 을 자동으로 이슈로 올립니다. 기본은 꺼짐입니다.
            </p>
          </div>
          <span className="sp" />
          <label className="jp-sw">
            <input
              type="checkbox"
              checked={!!cur.auto}
              onChange={(e) => void patch({ auto: e.target.checked })}
            />
            {cur.auto ? '켜짐' : '꺼짐'}
          </label>
        </div>
      )}

      <div className="jp-cols">
        <div className="panel jp-list">
          <div className="jp-lh">
            프로젝트 <b>{projects.length}</b>
          </div>
          {projects.length === 0 ? (
            <p className="muted small jp-empty">
              「프로젝트 불러오기」 를 누르거나, Jira 연동에서 자주 쓰는 프로젝트를 먼저 고르세요.
            </p>
          ) : (
            projects.map((p) => (
              <div
                key={p.key}
                className={`jp-item${sel === p.key ? ' on' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => setSel(p.key)}
                onKeyDown={(e) => e.key === 'Enter' && setSel(p.key)}
              >
                <b>{p.key}</b>
                <span className="muted">{p.name}</span>
                <span className="sp" />
                {/* 줄마다 스위치 — 프로젝트를 고르지 않고도 켜고 끈다(사진).
                    고르고 → 위 카드에서 켜는 두 걸음이 매번 걸린다. */}
                <button
                  type="button"
                  className={`jp-mini${tmpl[p.key]?.auto ? ' on' : ''}`}
                  title="Fail 자동 이슈 등록"
                  onClick={(e) => {
                    e.stopPropagation()
                    const t = tmpl[p.key] ?? {}
                    const next = { ...tmpl, [p.key]: { ...t, auto: !t.auto } }
                    setTmpl(next)
                    void apiFetch('/api/jira/config', {
                      method: 'POST',
                      body: JSON.stringify({ panel_templates: next }),
                    })
                  }}
                >
                  <i />
                </button>
                {tmpl[p.key] && <span className="jp-tag">설정됨</span>}
              </div>
            ))
          )}
        </div>

        {!sel ? (
          <div className="empty">왼쪽에서 프로젝트를 고르세요.</div>
        ) : (
          <div className="jp-kinds">
            {KINDS.map((kd) => {
              const on = onFor(kd.k)
              return (
                <div key={kd.k} className="panel jp-kind">
                  <div className="jp-kh">
                    <b className={`jp-kt ${kd.k}`}>{kd.label}</b>
                    <span className="sp" />
                    <button className="btn small" type="button" onClick={() => setAll(kd.k, true)}>
                      전체
                    </button>
                    <button className="btn small" type="button" onClick={() => setAll(kd.k, false)}>
                      해제
                    </button>
                  </div>
                  <div className="jp-sub">표시 패널</div>
                  {PANELS.map((p, i) => (
                    <label key={p.k} className="jp-panel">
                      <input
                        type="checkbox"
                        checked={on.has(p.k)}
                        onChange={() => togglePanel(kd.k, p.k)}
                      />
                      <span>
                        {i + 1}. {p.label}
                      </span>
                      <span className="sp" />
                      <span className="muted small">{p.auto ? '자동' : '수동'}</span>
                    </label>
                  ))}
                  {/* 필드 기본값 — 이슈 등록 팝업이 이 값으로 칸을 미리 채운다.
                      매번 같은 값을 고르는 자리(우선순위·사업자…)가 있어서다. */}
                  <FieldDefaults
                    project={sel}
                    kind={kd.k}
                    cfg={(cur[kd.k as 'defect' | 'cr'] ?? {}) as KindCfg}
                    onSave={(v) => void patch({ [kd.k]: v } as Partial<Tmpl>)}
                  />
                </div>
              )
            })}

            {/* 어느 프로젝트로 보낼지는 장비 모델로 가른다 */}
            <div className="panel jp-kind jp-models">
              <b className="jp-kt">이 프로젝트로 보낼 장비 모델</b>
              <p className="muted small">
                한 줄에 하나. 사이클의 모델이 여기 있으면 그 결함은 <b>{sel}</b> 로 갑니다.
              </p>
              <textarea
                rows={5}
                value={(cur.auto_models ?? []).join('\n')}
                placeholder={'E5010-24C\nE5724RL'}
                onChange={(e) =>
                  setTmpl((t) => ({
                    ...t,
                    [sel]: { ...cur, auto_models: e.target.value.split(/\r?\n/) },
                  }))
                }
                onBlur={(e) =>
                  void patch({
                    auto_models: e.target.value
                      .split(/\r?\n/)
                      .map((x) => x.trim())
                      .filter(Boolean),
                  })
                }
              />
            </div>
          </div>
        )}
      </div>
        </>
      )}
    </div>
  )
}


/**
 * 필드 기본값 — 이 프로젝트·이 이슈유형으로 낼 때 **미리 채워 둘 값**.
 *
 * 결함을 올릴 때마다 우선순위·사업자·이슈분류를 같은 값으로 다시 고르고
 * 있다. 여기서 한 번 정해 두면 이슈 등록 팝업이 그 값으로 칸을 채운 채 뜬다.
 *
 * 이슈유형을 먼저 정해야 한다 — Jira 는 이슈유형마다 칸이 다르다.
 */
function FieldDefaults({
  project,
  kind,
  cfg,
  onSave,
}: {
  project: string
  kind: string
  cfg: KindCfg
  onSave: (v: KindCfg) => void
}) {
  const [types, setTypes] = useState<Array<{ id?: string; name: string }>>([])
  const [fields, setFields] = useState<
    Array<{ id: string; name?: string; required?: boolean; type?: string; options?: Array<{ id?: string; name?: string }> | null }>
  >([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  /* 이슈유형 목록 — 프로젝트가 정해지면 한 번 */
  useEffect(() => {
    if (!project) return
    let dead = false
    void (async () => {
      try {
        const r = await apiFetch(`/api/jira/issuetypes?project=${encodeURIComponent(project)}`)
        const j = (await r.json()) as { ok?: boolean; issuetypes?: Array<{ id?: string; name: string }> }
        if (!dead && j.ok) setTypes(j.issuetypes ?? [])
      } catch {
        /* 못 읽으면 이름을 손으로 적는다 */
      }
    })()
    return () => {
      dead = true
    }
  }, [project])

  /* 정해 둔 것이 없으면 이름으로 짐작한다 — Defect 는 defect·bug, CR 은 cr·change */
  const guess = useMemo(() => {
    const isCR = kind === 'cr'
    const hit = types.find((t) => {
      const n = t.name.toLowerCase()
      return isCR ? n.includes('cr') || n.includes('change') : n.includes('defect') || n.includes('bug')
    })
    return hit?.name ?? types[0]?.name ?? ''
  }, [types, kind])
  const itype = cfg.issuetype || guess

  const load = async () => {
    if (!project || !itype) return
    setBusy(true)
    setErr('')
    try {
      const r = await apiFetch(
        `/api/jira/createmeta?project=${encodeURIComponent(project)}&issuetype=${encodeURIComponent(itype)}`,
      )
      const j = (await r.json()) as { ok?: boolean; fields?: typeof fields; error?: string }
      if (!j.ok) {
        setErr(j.error || '칸을 못 읽었습니다')
        setFields([])
        return
      }
      const skip = new Set(['project', 'issuetype', 'summary', 'description', 'attachment', 'issuelinks', 'labels'])
      setFields((j.fields ?? []).filter((f) => !skip.has(f.id)))
    } catch (e) {
      setErr(String((e as Error).message))
    } finally {
      setBusy(false)
    }
  }
  /* 프로젝트·이슈유형이 정해지면 알아서 읽는다 — 「로드」 를 눌러야만 보이면
     설정이 있는지조차 모른다. 손으로 다시 읽는 길은 단추로 남겨 둔다. */
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, itype])

  const setDefault = (fid: string, v: string) => {
    const d = { ...(cfg.field_defaults ?? {}) }
    if (v) d[fid] = v
    else delete d[fid]
    onSave({ ...cfg, issuetype: itype, field_defaults: d })
  }

  return (
    <div className="jp-fd">
      <div className="jp-sub">
        필드 기본값
        <span className="muted small">— 이슈 등록 시 자동 입력</span>
        <span className="sp" />
        <button className="btn small" type="button" disabled={busy} onClick={() => void load()}>
          {busy ? '읽는 중…' : '다시 읽기'}
        </button>
      </div>

      <label className="jp-fld">
        <span>이슈유형</span>
        <select
          value={itype}
          onChange={(e) => onSave({ ...cfg, issuetype: e.target.value })}
        >
          {!types.length && <option value={itype}>{itype || '(없음)'}</option>}
          {types.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>
      </label>

      {err && <p className="muted small">칸을 못 읽었습니다 — {err}</p>}
      {!err &&
        fields.map((f) => {
          const v = cfg.field_defaults?.[f.id] ?? ''
          return (
            <label className="jp-fld" key={f.id}>
              <span className={f.required ? 'req' : undefined}>
                {f.name || f.id}
                {f.required ? ' *' : ''}
              </span>
              {f.options && f.options.length ? (
                <select value={v} onChange={(e) => setDefault(f.id, e.target.value)}>
                  <option value="">(기본값 없음)</option>
                  {f.options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              ) : f.type === 'date' ? (
                <input type="date" value={v} onChange={(e) => setDefault(f.id, e.target.value)} />
              ) : (
                <input
                  value={v}
                  placeholder="기본값 없음"
                  onChange={(e) => setDefault(f.id, e.target.value)}
                />
              )}
            </label>
          )
        })}
    </div>
  )
}
