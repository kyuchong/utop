import { useEffect, useMemo, useState } from 'react'
import JiraDefaults from './JiraDefaults'
import { apiFetch } from '@/api/client'

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
interface Tmpl {
  /** Fail 을 자동으로 이슈로 올리나 */
  auto?: boolean
  /** 이 프로젝트로 보낼 장비 모델들 */
  auto_models?: string[]
  /** 종류별로 켤 판 */
  panels?: Record<string, string[]>
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
        <button className="btn small" type="button" disabled={busy} onClick={() => void loadProjects()}>
          프로젝트 불러오기
        </button>
      </div>

      {/* 기본값 · 자주 쓰는 프로젝트 — 연동 설정에서 옮겨 왔다(지시) */}
      <JiraDefaults />


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
              <button
                key={p.key}
                type="button"
                className={`jp-item${sel === p.key ? ' on' : ''}`}
                onClick={() => setSel(p.key)}
              >
                <b>{p.key}</b>
                <span className="muted">{p.name}</span>
                <span className="sp" />
                {tmpl[p.key]?.auto && <span className="jp-tag on">자동</span>}
                {tmpl[p.key] && !tmpl[p.key]?.auto && <span className="jp-tag">설정됨</span>}
              </button>
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
                  {PANELS.map((p) => (
                    <label key={p.k} className="jp-panel">
                      <input
                        type="checkbox"
                        checked={on.has(p.k)}
                        onChange={() => togglePanel(kd.k, p.k)}
                      />
                      <span>{p.label}</span>
                      <span className="sp" />
                      <span className="muted small">{p.auto ? '자동' : '수동'}</span>
                    </label>
                  ))}
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
    </div>
  )
}
