import { useState } from 'react'
import { authApi, type MeUser } from '@/api/client'
import './Login.css'

interface Props {
  onDone: (user: MeUser) => void
}

/**
 * 로그인 화면.
 *
 * 서버가 /api/* 전체에 로그인을 요구하므로, 토큰이 없으면 앱 대신 이 화면이 뜬다.
 * 토큰은 localStorage 에 둔다 — 새로고침마다 다시 로그인하게 만들 수는 없다.
 */
export default function Login({ onDone }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

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

  return (
    <div className="login-back">
      <form
        className="login-box"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="login-logo">UTOP</div>
        <div className="login-sub">유비쿼스 시험 자동화</div>

        {error && <div className="form-error">{error}</div>}

        <label className="login-fld">
          <span>아이디</span>
          <input
            autoFocus
            value={username}
            autoComplete="username"
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>

        <label className="login-fld">
          <span>비밀번호</span>
          <input
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        <button className="btn primary login-go" type="submit" disabled={busy}>
          {busy ? '확인 중…' : '로그인'}
        </button>
      </form>
    </div>
  )
}
