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
  /** 로그인을 물어볼 Jira — 이슈용과 다를 때만. 비우면 위 Jira URL */
  login_url?: string
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
  /** 인증서 문제(만료 등) — 체크박스 하나면 넘어간다 */
  cert?: boolean
  verify?: boolean
  issue_url?: string
  separate?: boolean
  last_fail?: { user?: string; why?: string; at?: string } | null
}

type Tab = 'conn' | 'login'

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
  /** 「지금 되는지 보기」 — 저장된 설정으로 실제 상태를 물어본다 */
  const [tab, setTab] = useState<Tab>(() =>
    localStorage.getItem('utop.jira.tab') === 'login' ? 'login' : 'conn',
  )
  /** 계정 쪽 요약 — 로그인 탭 머리줄에 「명단이 몇인지」 를 적는다 */
  const [acc, setAcc] = useState<{ users?: number; jira?: number; last?: string } | null>(null)
  const [chk, setChk] = useState<LoginCheck | null>(null)
  const [chking, setChking] = useState(false)
  /**
   * 「지금 되는지 보기」 는 **저장된 설정**을 본다.
   *
   * 체크만 하고 저장을 안 한 채 눌러서 「① 꺼져 있습니다」 를 보는 일이
   * 생겼다(화면 사진) — 화면에는 켜져 있는데 꺼졌다고 하니 말이 안 맞는다.
   * 그래서 누르면 **먼저 저장하고** 본다.
   */
  const loadChk = async () => {
    setChking(true)
    try {
      await apiFetch('/api/jira/config', { method: 'POST', body: JSON.stringify(cfg) })
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
  useEffect(() => {
    localStorage.setItem('utop.jira.tab', tab)
  }, [tab])
  /* 로그인 탭을 열면 지금 상태를 한 번 읽어 온다 — 눌러야 보이면 안 본다 */
  useEffect(() => {
    if (tab !== 'login') return
    void (async () => {
      const [a, b] = await Promise.all([
        apiFetch('/api/jira/login-check'),
        apiFetch('/api/users/jira-sync'),
      ])
      if (a.ok) setChk((await a.json()) as LoginCheck)
      if (b.ok) {
        const j = (await b.json()) as { last?: { at?: string; found?: number } }
        setAcc({ last: j.last?.at, jira: j.last?.found })
      }
      const u = await apiFetch('/api/users')
      if (u.ok) {
        const j = (await u.json()) as { users: Array<{ source?: string }> }
        setAcc((p) => ({ ...(p ?? {}), users: j.users.length }))
      }
    })()
  }, [tab])

  const set = (p: Partial<Cfg>) => setCfg((c) => ({ ...c, ...p }))

  /**
   * 로그인 칸은 **고르는 즉시 저장한다.**
   *
   * 체크만 하고 저장을 안 해서 「① 꺼져 있습니다」 를 보는 일이 있었다
   * (사진). 스위치 하나 켜는 데 저장 단추를 기억하게 할 이유가 없다.
   */
  const setSave = async (p: Partial<Cfg>) => {
    const next = { ...cfg, ...p }
    setCfg(next)
    setBusy('login')
    try {
      const r = await apiFetch('/api/jira/config', { method: 'POST', body: JSON.stringify(next) })
      setMsg(
        r.ok ? { kind: 'ok', text: '저장했습니다' } : { kind: 'err', text: '저장하지 못했습니다' },
      )
    } finally {
      setBusy('')
    }
  }

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

      {/* 탭 둘 — 연결 · 로그인(지시). 생김새는 **장비 화면 것 그대로**(seg) —
          같은 일을 하는 자리가 화면마다 달라 보일 이유가 없다.
          기본값·자주 쓰는 프로젝트는 「Jira 프로젝트 패널 설정」 으로 옮겼다. */}
      <div className="seg jira-seg" role="tablist">
        {(
          [
            ['conn', 'Jira Rest API'],
            ['login', 'Jira SSO'],
          ] as Array<[Tab, string]>
        ).map(([k, lb]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className={`seg-btn${tab === k ? ' on' : ''}`}
            onClick={() => setTab(k)}
          >
            {lb}
          </button>
        ))}
      </div>

      <div className="jira-cols">
        {tab === 'conn' && (
          <>
        {/* 붙는 것. 이게 안 되면 나머지는 볼 것도 없다 */}
        <div className="panel jira-card">
          <b className="jira-t">Jira Rest API</b>
          {/* 지금 어떤 상태인지 카드 안에서 읽힌다 — 저장값만 늘어놓으면
              「이게 지금 쓰이는 값인가」 를 알 수 없다 */}
          <div className="jira-state">
            <span className={`jira-sdot ${cfg.url ? 'ok' : 'off'}`} />
            <span className="muted small">
              {cfg.url ? (
                <>
                  {cfg.auth === 'bearer' ? 'PAT(Bearer)' : 'ID/비밀번호(Basic)'} · 조회 계정{' '}
                  <b>{cfg.user || '(없음)'}</b> · 토큰 {cfg.token ? '있음' : '없음'} · TLS 검증{' '}
                  {cfg.verify === false ? '끔' : '켬'}
                </>
              ) : (
                '주소가 없습니다 — 아래에 Jira URL 을 넣으세요'
              )}
            </span>
          </div>
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

          </>
        )}

        {tab === 'login' && (
          <>
        {/* Jira 계정 로그인 — **연결과는 다른 일**이다(지시: 연결은 그대로 두고
            옆에 카드 하나 더). 연결은 이슈를 등록·조회하는 자격이고, 이쪽은
            사람이 들어오는 문이다. 한 칸에 섞여 있으면 어느 것을 고치는지
            헷갈린다. */}
        <div className="panel jira-card">
          <b className="jira-t">Jira SSO</b>
          <span className="muted small">회원가입 없이 Jira 아이디·비밀번호로 들어옵니다</span>
          <div className="jira-state">
            <span className={`jira-sdot ${cfg.login_enabled ? 'ok' : 'off'}`} />
            <span className="muted small">
              {cfg.login_enabled ? '켜짐' : '꺼짐'} · 로그인 주소{' '}
              <b>{cfg.login_url || cfg.url || '(없음)'}</b> · 자동 등록{' '}
              {cfg.login_auto_create === false ? '안 함' : '함'}
              {acc?.users ? ` · 명단 ${acc.users}명` : ''}
              {acc?.last ? ` · 마지막 동기화 ${acc.last}` : ''}
            </span>
          </div>
          {/* 사원이 모두 Jira 계정을 갖고 있어 회원가입을 두지 않는다(지시).
              문제가 생기면 이 스위치만 끄면 옛 방식으로 즉시 되돌아간다.
              ★ 켜도 **기존 계정은 그대로** 들어온다 — 로그인은 UTOP
              비밀번호를 먼저 보고, 안 맞을 때만 Jira 에 물어본다. */}
          <label className="jira-ck">
            <input
              type="checkbox"
              checked={!!cfg.login_enabled}
              onChange={(e) => void setSave({ login_enabled: e.target.checked })}
            />
            <b>Jira 계정으로 로그인</b> — UTOP 로그인에 Jira ID/비밀번호를 씁니다
          </label>
          {cfg.login_enabled && (
            <>
              {/* 이슈를 등록·조회하는 Jira 와 사람을 확인하는 Jira 가 다를 수
                  있다(지시: 사내에 둘이다). 비우면 「연결」 카드의 주소를 쓴다 */}
              <label className="jira-f sub">
                Jira 로그인 URL
                <input
                  value={cfg.login_url ?? ''}
                  placeholder={`비우면 「Jira Rest API」의 주소 — ${cfg.url || 'https://…'}`}
                  onChange={(e) => set({ login_url: e.target.value })}
                  onBlur={(e) => void setSave({ login_url: e.target.value.trim() })}
                />
                <i className="muted small">
                  로그인만 다른 Jira 로 물어볼 때 적습니다. 이슈 등록·조회는 「Jira Rest API」의
                  주소를 그대로 씁니다.
                </i>
              </label>
              <label className="jira-ck sub">
                <input
                  type="checkbox"
                  checked={cfg.login_auto_create !== false}
                  onChange={(e) => void setSave({ login_auto_create: e.target.checked })}
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
                  {chking ? '보는 중…' : '저장하고 지금 되는지 보기'}
                </button>
                {chk && (
                  <>
                    <span className={`acc-chk ${chk.enabled ? 'ok' : 'bad'}`}>
                      {chk.enabled ? '① 켜져 있습니다' : '① 꺼져 있습니다 — 켜고 저장하세요'}
                    </span>
                    <span className={`acc-chk ${chk.url ? 'ok' : 'bad'}`}>
                      {chk.url
                        ? `② 로그인 주소 ${chk.url}${chk.separate ? ' (이슈용과 따로)' : ' (이슈용과 같음 — 사람 확인용 Jira 가 따로면 위에 적으세요)'}`
                        : '② 주소가 없습니다 — 「Jira Rest API」 에 URL 을 넣으세요'}
                    </span>
                    <span className={`acc-chk ${chk.reachable ? 'ok' : 'bad'}`}>
                      {chk.reachable
                        ? `③ Jira 에 닿습니다${chk.status ? ` (${chk.status})` : ''}`
                        : `③ ${chk.reason || '닿지 못했습니다'}`}
                    </span>
                    {chk.cert && (
                      <span className="acc-chk warn">
                        인증서가 만료됐거나 사내 자체서명입니다. 「Jira Rest API」의{' '}
                        <b>「TLS 인증서 검증」</b> 을 끄면 바로 됩니다 — 인증서를 갱신하는 것이
                        본래 자리입니다.
                      </span>
                    )}
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
                          : chk.last_fail.why === 'cert'
                            ? 'Jira 인증서 문제(만료 등)'
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
              onClick={() => void save('login')}
            >
              저장
            </button>
          </div>
        </div>
          </>
        )}
      </div>
    </div>
  )
}
