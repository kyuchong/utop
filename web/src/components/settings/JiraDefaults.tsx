import { useEffect, useState } from 'react'
import { apiFetch } from '@/api/client'

interface Cfg {
  url?: string
  default_project?: string
  default_issuetype?: string
  fav_projects?: string[]
}
interface Proj {
  key: string
  name: string
}
interface IType {
  id: string
  name: string
  subtask?: boolean
}

/**
 * 기본값 · 자주 쓰는 프로젝트 — 「Jira 프로젝트 패널 설정」 으로 옮겨 왔다(지시).
 *
 * 연동 설정에는 **붙는 것(연결)과 사람이 들어오는 문(로그인)** 만 둔다. 이슈를
 * 어떤 프로젝트·유형으로 낼지는 프로젝트 이야기라 이 화면이 제자리다.
 */
export default function JiraDefaults() {
  const [cfg, setCfg] = useState<Cfg>({})
  const [projects, setProjects] = useState<Proj[]>([])
  const [types, setTypes] = useState<IType[]>([])
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ kind: string; text: string }>({ kind: '', text: '' })

  useEffect(() => {
    void (async () => {
      const r = await apiFetch('/api/jira/config')
      if (r.ok) setCfg((await r.json()) as Cfg)
    })()
  }, [])
  useEffect(() => {
    const pj = cfg.default_project
    if (!pj) {
      setTypes([])
      return
    }
    void (async () => {
      const r = await apiFetch(`/api/jira/issuetypes?project=${encodeURIComponent(pj)}`)
      const j = (await r.json()) as { ok?: boolean; issuetypes?: IType[] }
      if (j.ok) setTypes((j.issuetypes ?? []).filter((t) => !t.subtask))
    })()
  }, [cfg.default_project])

  const set = (p: Partial<Cfg>) => setCfg((c) => ({ ...c, ...p }))
  const save = async (what: string) => {
    setBusy(what)
    try {
      const r = await apiFetch('/api/jira/config', { method: 'POST', body: JSON.stringify(cfg) })
      setMsg(r.ok ? { kind: 'ok', text: '저장했습니다' } : { kind: 'err', text: '저장하지 못했습니다' })
    } finally {
      setBusy('')
    }
  }
  const loadProjects = async () => {
    setBusy('proj')
    try {
      const r = await apiFetch('/api/jira/projects')
      const j = (await r.json()) as { ok?: boolean; projects?: Proj[]; error?: string }
      if (!j.ok) {
        setMsg({ kind: 'err', text: j.error || '프로젝트를 못 읽었습니다' })
        return
      }
      setProjects(j.projects ?? [])
      setMsg({ kind: 'ok', text: `프로젝트 ${(j.projects ?? []).length}개` })
    } finally {
      setBusy('')
    }
  }
  const fav = new Set(cfg.fav_projects ?? [])
  const toggleFav = (k: string) => {
    const n = new Set(fav)
    if (n.has(k)) n.delete(k)
    else n.add(k)
    set({ fav_projects: [...n] })
  }

  return (
    <div className="jira-cols jd-cols">
      {msg.text && <span className={`muted small ${msg.kind} jd-msg`}>{msg.text}</span>}
        {/* 기본값 — 이슈 등록 창에서 미리 골라 둘 것 */}
        <div className="panel jira-card">
          <b className="jira-t">기본값</b>
          <span className="muted small">이슈를 등록할 때 미리 골라 둡니다</span>
          <div className="jira-state">
            <span className={`jira-sdot ${cfg.default_project ? 'ok' : 'off'}`} />
            <span className="muted small">
              지금 값 — 프로젝트 <b>{cfg.default_project || '(안 정함)'}</b> · 이슈유형{' '}
              <b>{cfg.default_issuetype || '(안 정함)'}</b>
            </span>
          </div>
          <label className="jira-f">
            <span>기본 프로젝트</span>
            <div className="jira-row">
              <select
                value={cfg.default_project ?? ''}
                onChange={(e) => set({ default_project: e.target.value })}
              >
                <option value="">고르세요</option>
                {projects.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.key} · {p.name}
                  </option>
                ))}
                {/* 아직 안 불러왔어도 저장된 값은 보여야 한다 */}
                {cfg.default_project && !projects.some((p) => p.key === cfg.default_project) && (
                  <option value={cfg.default_project}>{cfg.default_project}</option>
                )}
              </select>
              <button
                className="btn small"
                type="button"
                disabled={!!busy}
                onClick={() => void loadProjects()}
              >
                프로젝트 불러오기
              </button>
            </div>
          </label>
          <label className="jira-f">
            <span>기본 이슈유형</span>
            <select
              value={cfg.default_issuetype ?? ''}
              onChange={(e) => set({ default_issuetype: e.target.value })}
            >
              <option value="">고르세요</option>
              {types.map((t) => (
                <option key={t.id} value={t.name}>
                  {t.name}
                </option>
              ))}
              {cfg.default_issuetype && !types.some((t) => t.name === cfg.default_issuetype) && (
                <option value={cfg.default_issuetype}>{cfg.default_issuetype}</option>
              )}
            </select>
          </label>
          <div className="jira-act">
            <button
              className="btn primary small"
              type="button"
              disabled={!!busy}
              onClick={() => void save('def')}
            >
              기본값 저장
            </button>
          </div>
        </div>

        {/* 자주 쓰는 프로젝트 — 수백 개가 드롭다운에 늘어서면 못 고른다 */}
        <div className="panel jira-card">
          <b className="jira-t">자주 쓰는 프로젝트</b>
          <div className="jira-state">
            <span className={`jira-sdot ${fav.size ? 'ok' : 'off'}`} />
            <span className="muted small">
              {fav.size ? `고른 ${fav.size}개만 나옵니다` : '아무것도 안 골랐습니다 — 전부 나옵니다'}
              {projects.length ? ` · 불러온 프로젝트 ${projects.length}개` : ''}
            </span>
          </div>
          <span className="muted small">
            고른 것만 이슈 등록 드롭다운에 나옵니다. 하나도 안 고르면 전부 나옵니다.
          </span>
          {projects.length === 0 ? (
            <p className="muted small jira-note">
              「프로젝트 불러오기」 를 누르면 여기에 목록이 나옵니다.
            </p>
          ) : (
            <div className="jira-favs">
              {projects.map((p) => (
                <label key={p.key} className="jira-fav">
                  <input
                    type="checkbox"
                    checked={fav.has(p.key)}
                    onChange={() => toggleFav(p.key)}
                  />
                  <b>{p.key}</b>
                  <span className="muted">{p.name}</span>
                </label>
              ))}
            </div>
          )}
          <div className="jira-act">
            <button
              className="btn primary small"
              type="button"
              disabled={!!busy || projects.length === 0}
              onClick={() => void save('fav')}
            >
              {fav.size ? `고른 ${fav.size}개 저장` : '저장'}
            </button>
          </div>
        </div>
    </div>
  )
}
