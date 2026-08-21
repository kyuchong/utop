import { useEffect, useState } from 'react'
import { apiFetch } from '@/api/client'
import './Accounts.css'

/** 저장되는 것 */
interface Cfg {
  url?: string
  auth?: string
  user?: string
  token?: string
  verify?: boolean
  default_project?: string
  default_issuetype?: string
  fav_projects?: string[]
  /** UTOP 로그인을 Jira 계정으로 — 켜도 **기존 계정은 그대로** 들어온다 */
  login_enabled?: boolean
  /** 처음 들어온 사람을 명단에 자동으로 실을까 (기본 켜짐 = 회원가입 없음) */
  login_auto_create?: boolean
}

/** 지금 Jira 로그인이 되는 상태인가 — 안 되는 까닭을 셋으로 가른다 */
interface LoginCheck {
  enabled: boolean
  url: string
  auto_create: boolean
  reachable?: boolean
  status?: number
  reason?: string
  cloud?: boolean
  last_fail?: { user?: string; why?: string; at?: string } | null
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
 * Jira 연동 설정.
 *
 * 결함과 릴리즈는 우리가 따로 들고 있는 자료가 아니라 **Jira 이슈**다
 * (`/api/jira/defect/*`). 그래서 여기가 안 맞으면 결함 화면이 통째로
 * 안 돈다 — 그런데 새 화면에는 이 자리가 없어서 옛 앱(8000)으로 가서
 * 고쳐야 했다.
 *
 * 세 덩이로 나눈다 — **붙는 것 · 기본값 · 자주 쓰는 프로젝트.**
 * 붙는 것을 못 고치면 나머지는 볼 것도 없으므로 맨 앞이다.
 */
export default function JiraSettings() {
  const [cfg, setCfg] = useState<Cfg>({})
  const [msg, setMsg] = useState<{ kind: string; text: string }>({ kind: '', text: '' })
  const [busy, setBusy] = useState('')
  const [projects, setProjects] = useState<Proj[]>([])
  const [types, setTypes] = useState<IType[]>([])
  /** 「지금 되는지 보기」 — 저장된 설정으로 실제 상태를 물어본다 */
  const [chk, setChk] = useState<LoginCheck | null>(null)
  const [chking, setChking] = useState(false)
  const loadChk = async () => {
    setChking(true)
    try {
      const r = await apiFetch('/api/jira/login-check')
      setChk(r.ok ? ((await r.json()) as LoginCheck) : null)
    } finally {
      setChking(false)
    }
  }

  useEffect(() => {
    void (async () => {
      const r = await apiFetch('/api/jira/config')
      if (r.ok) setCfg((await r.json()) as Cfg)
    })()
  }, [])

  const set = (p: Partial<Cfg>) => setCfg((c) => ({ ...c, ...p }))

  const save = async (what: string) => {
    setBusy(what)
    try {
      const r = await apiFetch('/api/jira/config', {
        method: 'POST',
        body: JSON.stringify(cfg),
      })
      setMsg(r.ok ? { kind: 'ok', text: '저장했습니다' } : { kind: 'err', text: '저장하지 못했습니다' })
    } finally {
      setBusy('')
    }
  }

  /** 붙어 보고 누구로 붙었는지 말해 준다 — 「저장됨」 만으로는 맞는지 모른다 */
  const test = async () => {
    setBusy('test')
    setMsg({ kind: '', text: '붙어 보는 중…' })
    try {
      const r = await apiFetch('/api/jira/test', { method: 'POST', body: JSON.stringify(cfg) })
      const j = (await r.json()) as { ok?: boolean; displayName?: string; name?: string; error?: string }
      setMsg(
        j.ok
          ? { kind: 'ok', text: `붙었습니다 — ${j.displayName || j.name || ''}` }
          : { kind: 'err', text: j.error || '붙지 못했습니다' },
      )
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) })
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

  // 프로젝트가 정해지면 그 프로젝트의 이슈유형을 읽는다
  useEffect(() => {
    const pj = cfg.default_project
    if (!pj) return
    void (async () => {
      const r = await apiFetch(`/api/jira/issuetypes?project=${encodeURIComponent(pj)}`)
      const j = (await r.json()) as { ok?: boolean; issuetypes?: IType[] }
      if (j.ok) setTypes((j.issuetypes ?? []).filter((t) => !t.subtask))
    })()
  }, [cfg.default_project])

  const fav = new Set(cfg.fav_projects ?? [])
  const toggleFav = (k: string) => {
    const n = new Set(fav)
    if (n.has(k)) n.delete(k)
    else n.add(k)
    set({ fav_projects: [...n] })
  }

  return (
    <div className="set-page">
      <div className="set-head">
        <b>Jira 연동 설정</b>
        <span className="muted small">
          Jira Server · REST API v2 · 시험 결함을 이슈로 등록·조회
        </span>
        <span className="sp" />
        {msg.text && <span className={`muted small ${msg.kind}`}>{msg.text}</span>}
      </div>

      <div className="jira-cols">
        {/* 붙는 것. 이게 안 되면 나머지는 볼 것도 없다 */}
        <div className="panel jira-card">
          <b className="jira-t">연결</b>
          <label className="jira-f">
            <span>Jira URL</span>
            <input
              value={cfg.url ?? ''}
              placeholder="https://jira.사내주소"
              onChange={(e) => set({ url: e.target.value })}
            />
          </label>
          <label className="jira-f">
            <span>인증 방식</span>
            <select value={cfg.auth || 'basic'} onChange={(e) => set({ auth: e.target.value })}>
              <option value="basic">ID / 비밀번호 (Basic)</option>
              <option value="bearer">토큰 (Bearer / PAT)</option>
            </select>
          </label>
          <label className="jira-f">
            <span>사용자 ID</span>
            <input value={cfg.user ?? ''} onChange={(e) => set({ user: e.target.value })} />
          </label>
          <label className="jira-f">
            <span>비밀번호 / PAT</span>
            <input
              type="password"
              value={cfg.token ?? ''}
              placeholder="바꿀 때만 적으세요"
              onChange={(e) => set({ token: e.target.value })}
            />
          </label>
          <label className="jira-ck">
            <input
              type="checkbox"
              checked={cfg.verify !== false}
              onChange={(e) => set({ verify: e.target.checked })}
            />
            TLS 인증서 검증 (사내 자체서명 인증서로 실패하면 해제)
          </label>
          {/* 사원이 모두 Jira 계정을 갖고 있어 회원가입을 두지 않는다(지시).
              문제가 생기면 이 스위치만 끄면 옛 방식으로 즉시 되돌아간다.
              ★ 켜도 **기존 계정은 그대로** 들어온다 — 로그인은 UTOP
              비밀번호를 먼저 보고, 안 맞을 때만 Jira 에 물어본다. */}
          <label className="jira-ck">
            <input
              type="checkbox"
              checked={!!cfg.login_enabled}
              onChange={(e) => set({ login_enabled: e.target.checked })}
            />
            <b>Jira 계정으로 로그인</b> — UTOP 로그인에 Jira ID/비밀번호를 씁니다
          </label>
          {cfg.login_enabled && (
            <>
              <label className="jira-ck sub">
                <input
                  type="checkbox"
                  checked={cfg.login_auto_create !== false}
                  onChange={(e) => set({ login_auto_create: e.target.checked })}
                />
                처음 들어온 사람을 <b>계정 명단에 자동으로 싣는다</b> — 끄면 관리자가 먼저
                등록한 사람만 들어옵니다
              </label>
              <p className="muted small jira-note">
                <b>기존 계정은 그대로 들어옵니다.</b> 로그인은 UTOP 비밀번호를 먼저 보고, 안
                맞을 때만 Jira 에 물어봅니다 — Jira 가 죽어도 admin 은 들어올 수 있습니다.
                Jira 로 들어온 사람의 <b>비밀번호는 UTOP 에 저장하지 않습니다</b>. 권한은{' '}
                <b>팀원</b>으로 시작하니 필요하면 <b>계정 관리</b>에서 올리세요.
              </p>
              {/* 「안 들어와진다」 는 셋 중 하나다 — 꺼짐·주소·거절.
                  갈라 보여 주지 않으면 어디를 고칠지 알 수 없다(지적) */}
              <div className="acc-diag">
                <button
                  className="btn small"
                  type="button"
                  disabled={chking}
                  onClick={() => void loadChk()}
                >
                  {chking ? '보는 중…' : '지금 되는지 보기'}
                </button>
                {chk && (
                  <>
                    <span className={`acc-chk ${chk.enabled ? 'ok' : 'bad'}`}>
                      {chk.enabled ? '① 켜져 있습니다' : '① 꺼져 있습니다 — 저장하면 켜집니다'}
                    </span>
                    <span className={`acc-chk ${chk.url ? 'ok' : 'bad'}`}>
                      {chk.url ? `② 주소 ${chk.url}` : '② 주소가 없습니다 — 위에 넣으세요'}
                    </span>
                    <span className={`acc-chk ${chk.reachable ? 'ok' : 'bad'}`}>
                      {chk.reachable
                        ? `③ Jira 에 닿습니다${chk.status ? ` (${chk.status})` : ''}`
                        : `③ ${chk.reason || '닿지 못했습니다'}`}
                    </span>
                    {chk.cloud && (
                      <span className="acc-chk warn">
                        Jira Cloud 는 <b>계정 비밀번호로 REST 로그인이 안 됩니다</b> — 사람마다 API
                        토큰이 필요합니다. 사내 Jira Server 라야 이 방식이 됩니다.
                      </span>
                    )}
                    {chk.last_fail?.user && (
                      <span className="acc-chk warn">
                        마지막 거절: <b>{chk.last_fail.user}</b> ·{' '}
                        {chk.last_fail.why === 'denied'
                          ? 'Jira 가 아이디·비밀번호를 받지 않았습니다'
                          : chk.last_fail.why === 'captcha'
                            ? 'Jira 가 CAPTCHA 를 걸었습니다 — Jira 웹에 한 번 로그인해 푸세요'
                            : chk.last_fail.why === 'unreachable'
                              ? 'Jira 에 닿지 못했습니다'
                              : chk.last_fail.why}{' '}
                        <i className="muted">{chk.last_fail.at}</i>
                      </span>
                    )}
                  </>
                )}
              </div>
            </>
          )}
          <div className="jira-act">
            <button
              className="btn primary small"
              type="button"
              disabled={!!busy}
              onClick={() => void save('conn')}
            >
              저장
            </button>
            <button className="btn small" type="button" disabled={!!busy} onClick={() => void test()}>
              연결 테스트
            </button>
          </div>
          <p className="muted small jira-note">
            비밀번호 대신 <b>PAT</b>(Personal Access Token) 를 권합니다. 자격증명은 백엔드에만
            남고 밖으로 나가지 않습니다.
          </p>
        </div>

        {/* 기본값 — 이슈 등록 창에서 미리 골라 둘 것 */}
        <div className="panel jira-card">
          <b className="jira-t">기본값</b>
          <span className="muted small">이슈를 등록할 때 미리 골라 둡니다</span>
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
    </div>
  )
}
