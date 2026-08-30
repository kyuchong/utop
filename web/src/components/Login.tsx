import { useEffect, useState } from 'react'
import { authApi, apiFetch, type MeUser } from '@/api/client'
import Markdown from '@/components/Markdown'
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
/** 아이디를 기억해 두는 자리 — 비밀번호는 절대 안 담는다 */
const KEEP_KEY = 'utop.login.id'

/** 고른 글꼴 이름 → 실제 글꼴. 화면 기본은 손대지 않는다 */
export const LG_FONT: Record<string, string | undefined> = {
  '': undefined,
  sans: undefined,
  mono: 'var(--font-mono)',
  serif: 'Georgia, "Noto Serif KR", serif',
}

export default function Login({ onDone }: Props) {
  const [username, setUsername] = useState(() => localStorage.getItem(KEEP_KEY) || '')
  const [keep, setKeep] = useState(() => !!localStorage.getItem(KEEP_KEY))
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [brand, setBrand] = useState<{
    login_image?: string
    login_title?: string
    login_sub?: string
    login_logo?: string
    login_size?: string
    login_color?: string
    login_accent_color?: string
    login_font?: string
    login_form_title?: string
    login_id_ph?: string
    login_note?: string
    login_foot?: string
    login_md?: string
    login_body_size?: string
    login_body_color?: string
    login_keep?: string
  }>({})

  /* 브랜딩은 로그인 전에도 읽을 수 있다 — 이 화면이 그것으로 그려진다 */
  useEffect(() => {
    void (async () => {
      try {
        const r = await apiFetch('/api/branding', { cache: 'no-store' })
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
      /* 아이디만 남긴다(지시: 아이디 저장) — 비밀번호는 담지 않는다 */
      if (keep) localStorage.setItem(KEEP_KEY, username.trim())
      else localStorage.removeItem(KEEP_KEY)
      onDone(r.user)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  /* 이름의 [x] 는 **강조 표시**다(브랜딩 규칙) — 그대로 찍으면 대괄호가
     화면에 남는다(지적). 왼쪽 판도 메뉴와 같은 규칙으로 읽는다 */
  const titleRaw = brand.login_title || 'ubiQuoss-TOP'
  const titleParts = titleRaw.split(/(\[[^\]]*\])/g).filter(Boolean)
  const sub = brand.login_sub || '유비쿼스 네트워크 장비 시험 자동화'

  return (
    /* **들어가는 판이 왼쪽**이다(지시). 로그인은 하루 한 번이라도 그 한 번이
       손이 가는 자리라 먼저 만나야 한다. 사진은 오른쪽에서 넓게 받친다.
       비율은 40 : 60(지시) — 칸이 좁으면 글자가 답답하고, 사진은 넓어야 산다. */
    <div className="lg">
      {/* ── 왼쪽 — 들어가는 판 ── */}
      <main className="lg-main">
        <form
          className="lg-form"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          {/* 로고는 **들어가는 자리** 머리에 선다(지시) — 옛 화면도 폼 위에
              마크가 있었다. 왼쪽은 사진과 글만 남는다 */}
          {brand.login_logo && (
            <span className="lg-formlogo">
              <img src={brand.login_logo} alt="" />
            </span>
          )}
          <h2>{brand.login_form_title || 'ubiQuoss TOP 로그인'}</h2>

          {error && <div className="form-error">{error}</div>}

          <label className="lg-fld">
            <span>아이디</span>
            <input
              autoFocus
              value={username}
              autoComplete="username"
              placeholder={brand.login_id_ph || 'ID를 입력 하세요'}
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

          {/* 옛 화면과 같은 차례(지시) — 안내 → 아이디 저장 → 로그인 */}
          {(brand.login_note ?? 'UMS(Jira) 계정으로 접속이 가능합니다.') && (
            <p className="lg-note">
              {brand.login_note || 'UMS(Jira) 계정으로 접속이 가능합니다.'}
            </p>
          )}

          {brand.login_keep !== 'off' && (
          <label className="lg-keep">
            <input
              type="checkbox"
              checked={keep}
              onChange={(e) => {
                setKeep(e.target.checked)
                if (!e.target.checked) localStorage.removeItem(KEEP_KEY)
              }}
            />
            아이디 저장
          </label>
          )}

          <button className="btn primary lg-go" type="submit" disabled={busy}>
            {busy ? '확인 중…' : '로그인'}
          </button>

          {(brand.login_foot ?? '비밀번호를 잊었으면 관리자에게 알려 주세요.') && (
            <div className="lg-foot">
              {brand.login_foot || '비밀번호를 잊었으면 관리자에게 알려 주세요.'}
            </div>
          )}
        </form>
      </main>

      {/* ── 오른쪽 — 우리 것을 보여 주는 판 ── */}
      <aside
        className={`lg-side${brand.login_image ? ' has-img' : ''}`}
        style={brand.login_image ? { backgroundImage: `url(${brand.login_image})` } : undefined}
      >
        {/* 사진 위 글자가 읽히도록 어둡게 한 겹 덮는다 — 사진마다 밝기가
            다른데 글자는 늘 읽혀야 한다 */}
        <div className="lg-veil" />
        <div className="lg-sidein">
          {/* 알맹이는 **마크다운**이다(지시). 제목 한 줄·설명 한 줄·점 세 개가
              코드에 박혀 있어서, 문구 하나 고치는 데도 배포를 해야 했다.
              비워 두면 여태 쓰던 글이 그대로 선다 — 빈 판을 보여 줄 수는 없다.
              제목 크기·색은 설정한 값을 마크다운 제목에도 그대로 입힌다. */}
          {brand.login_md?.trim() ? (
            <div
              className="lg-md"
              /* 제목·본문의 크기와 색, 글꼴을 설정에서 받는다(지시).
                 위지윅을 걷어낸 자리라 여기서 다 정할 수 있어야 한다 */
              style={{
                ['--lg-h' as string]: `${Math.min(Number(brand.login_size) || 26, 72)}px`,
                ['--lg-ink' as string]: brand.login_color || '#fff',
                ['--lg-body' as string]: `${Math.min(Math.max(Number(brand.login_body_size) || 14, 10), 32)}px`,
                ['--lg-bink' as string]: brand.login_body_color || 'rgb(255 255 255 / 0.86)',
                fontFamily: LG_FONT[brand.login_font ?? ''] ?? brand.login_font ?? undefined,
              }}
            >
              <Markdown text={brand.login_md} />
            </div>
          ) : (
            <>
              <h1
                style={{
                  fontSize: `${Math.min(Number(brand.login_size) || 26, 72)}px`,
                  fontFamily: brand.login_font || undefined,
                  color: brand.login_color || undefined,
                }}
              >
                {titleParts.map((t, i) =>
                  t.startsWith('[') && t.endsWith(']') ? (
                    <b key={i} className="lg-ac" style={{ color: brand.login_accent_color || '#ff5b5b' }}>
                      {t.slice(1, -1)}
                    </b>
                  ) : (
                    <span key={i}>{t}</span>
                  ),
                )}
              </h1>
              <p>{sub}</p>
              <ul className="lg-pts">
                <li>요구사항 → 시험항목 → 플랜을 한 줄기로</li>
                <li>장비 CLI·SNMP·계측기를 그대로 자동 실행</li>
                <li>결과는 회차로 남고 결과서까지</li>
              </ul>
            </>
          )}
        </div>
      </aside>
    </div>
  )
}
