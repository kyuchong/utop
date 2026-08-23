import { useEffect, useState } from 'react'
import { authApi, apiFetch, type MeUser } from '@/api/client'
import './Login.css'

interface Props {
  onDone: (user: MeUser) => void
}

/**
 * 로그인 화면 — **좌우 두 판**(지시).
 *
 * 왼쪽은 우리 것을 보여 주는 자리다(회사 건물 사진·이름·한 줄), 오른쪽은
 * 들어가는 자리다. QMetry·Zephyr 같은 시험관리 도구가 다 이 문법을 쓴다 —
 * 로그인은 하루에 한 번인데 그 한 번이 그 제품의 첫인상이라서다.
 *
 * 사진은 **브랜딩 설정에서 올린 것**을 쓴다. 인터넷에서 찾아 박아 넣지
 * 않는다 — 남의 사진에는 권리가 붙어 있고, 그것을 아는 사람은 올리는
 * 사람이다. 아직 안 올렸으면 회사 색으로 칠한 판이 대신 선다.
 *
 * 서버가 /api/* 전체에 로그인을 요구하므로, 토큰이 없으면 앱 대신 이 화면이
 * 뜬다. 토큰은 localStorage 에 둔다 — 새로고침마다 다시 로그인하게 만들
 * 수는 없다.
 */
export default function Login({ onDone }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [brand, setBrand] = useState<{
    logo?: string
    name_text?: string
    login_image?: string
    login_title?: string
    login_sub?: string
  }>({})

  /* 브랜딩은 로그인 전에도 읽을 수 있다 — 이 화면이 그것으로 그려진다 */
  useEffect(() => {
    void (async () => {
      try {
        const r = await apiFetch('/api/branding')
        if (r.ok) setBrand((await r.json()) as typeof brand)
      } catch {
        /* 못 읽으면 기본 얼굴로 뜬다 — 로그인은 되어야 한다 */
      }
    })()
  }, [])

  const submit = async () => {
    if (!username.trim() || !password) {
      setError('아이디와 비밀번호를 입력하세요')
      return
    }
    setBusy(true)
    setError('')
    try {
      const r = await authApi.login(username.trim(), password)
      onDone(r.user)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const title = brand.login_title || brand.name_text || 'UTOP'
  const sub = brand.login_sub || '유비쿼스 네트워크 장비 시험 자동화'

  return (
    <div className="lg">
      {/* ── 왼쪽 — 우리 것을 보여 주는 판 ── */}
      <aside
        className={`lg-side${brand.login_image ? ' has-img' : ''}`}
        style={brand.login_image ? { backgroundImage: `url(${brand.login_image})` } : undefined}
      >
        {/* 사진 위 글자가 읽히도록 어둡게 한 겹 덮는다 — 사진마다 밝기가
            다른데 글자는 늘 읽혀야 한다 */}
        <div className="lg-veil" />
        <div className="lg-sidein">
          {brand.logo ? (
            <img className="lg-logo" src={brand.logo} alt="" />
          ) : (
            <div className="lg-logotext">UTOP</div>
          )}
          <h1>{title}</h1>
          <p>{sub}</p>
          <ul className="lg-pts">
            <li>요구사항 → 시험항목 → 사이클을 한 줄기로</li>
            <li>장비 CLI·SNMP·계측기를 그대로 자동 실행</li>
            <li>결과는 회차로 남고 결과서까지</li>
          </ul>
        </div>
      </aside>

      {/* ── 오른쪽 — 들어가는 판 ── */}
      <main className="lg-main">
        <form
          className="lg-form"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <h2>로그인</h2>
          <p className="lg-hint">회사 계정 또는 Jira 계정으로 들어갑니다.</p>

          {error && <div className="form-error">{error}</div>}

          <label className="lg-fld">
            <span>아이디</span>
            <input
              autoFocus
              value={username}
              autoComplete="username"
              placeholder="사번 또는 아이디"
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>

          <label className="lg-fld">
            <span>비밀번호</span>
            <input
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          <button className="btn primary lg-go" type="submit" disabled={busy}>
            {busy ? '확인 중…' : '로그인'}
          </button>

          <div className="lg-foot">
            비밀번호를 잊었으면 관리자에게 알려 주세요 — 계정은 SETUP › 계정 관리에서 다룹니다.
          </div>
        </form>
      </main>
    </div>
  )
}
