import { useEffect, useState } from 'react'
import { apiFetch } from '@/api/client'

/**
 * 브랜딩 — 좌측 메뉴 머리의 로고와 이름.
 *
 * 접힌 메뉴에서는 마크(그림)만, 펼치면 이름까지 보인다. 그래서 그림은
 * 정사각형에 가까운 마크가 좋다 — 가로로 긴 로고는 접힌 30px 칸에서
 * 뭉개진다.
 */
export default function Branding() {
  const [logo, setLogo] = useState('')
  /* 로그인 화면 왼쪽 판 — 회사 건물 사진과 그 위 글(지시) */
  const [loginImg, setLoginImg] = useState('')
  const [loginTitle, setLoginTitle] = useState('')
  const [loginLogo, setLoginLogo] = useState('')
  const [loginSize, setLoginSize] = useState('')
  const [loginColor, setLoginColor] = useState('#ffffff')
  const [loginAccent, setLoginAccent] = useState('#ff5b5b')
  const [loginSub, setLoginSub] = useState('')
  const [name, setName] = useState('')
  const [size, setSize] = useState('')
  const [color, setColor] = useState('#e8eaf0')
  const [accent, setAccent] = useState('#e02020')
  const [font, setFont] = useState('')
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    void (async () => {
      const r = await apiFetch('/api/branding')
      if (!r.ok) return
      const b = (await r.json()) as {
        logo?: string
        login_image?: string
        login_title?: string
        login_sub?: string
        name_text?: string
        name_size?: string
        name_color?: string
        name_accent_color?: string
        name_font?: string
        link_url?: string
      }
      setLogo(b.logo ?? '')
      setLoginImg((b as { login_image?: string }).login_image ?? '')
      setLoginTitle((b as { login_title?: string }).login_title ?? '')
      setLoginLogo((b as { login_logo?: string }).login_logo ?? '')
      setLoginSize((b as { login_size?: string }).login_size ?? '')
      setLoginColor((b as { login_color?: string }).login_color || '#ffffff')
      setLoginAccent((b as { login_accent_color?: string }).login_accent_color || '#ff5b5b')
      setLoginSub((b as { login_sub?: string }).login_sub ?? '')
      setName(b.name_text ?? '')
      setSize(b.name_size ?? '')
      if (b.name_color) setColor(b.name_color)
      if (b.name_accent_color) setAccent(b.name_accent_color)
      setFont(b.name_font ?? '')
      setLink(b.link_url ?? '')
    })()
  }, [])

  const pick = (f: File | undefined) => {
    if (!f) return
    if (f.size > 3 * 1024 * 1024) {
      setMsg('3MB 이하 그림만 됩니다')
      return
    }
    const fr = new FileReader()
    fr.onload = () => {
      setLogo(String(fr.result || ''))
      setMsg('')
    }
    fr.readAsDataURL(f)
  }

  const pickLogin = (f: File | undefined) => {
    if (!f) return
    if (f.size > 6 * 1024 * 1024) {
      setMsg('6MB 이하 사진만 됩니다')
      return
    }
    const fr = new FileReader()
    fr.onload = () => {
      setLoginImg(String(fr.result || ''))
      setMsg('')
    }
    fr.readAsDataURL(f)
  }

  const save = async () => {
    setBusy(true)
    setMsg('')
    try {
      // 옛 화면의 API 를 그대로 쓴다 — 이름과 로고가 딴 주소다
      const r = await apiFetch('/api/branding', {
        method: 'POST',
        body: JSON.stringify({
          name_text: name,
          name_size: size,
          name_color: color,
          name_accent_color: accent,
          name_font: font,
          link_url: link,
          login_title: loginTitle,
          login_sub: loginSub,
          login_size: loginSize,
          login_color: loginColor,
          login_accent_color: loginAccent,
        }),
      })
      if (!r.ok) {
        const b = (await r.json().catch(() => ({}))) as { detail?: string }
        throw new Error(b.detail || String(r.status))
      }
      const r4 = await apiFetch('/api/branding/login-logo', {
        method: 'POST',
        body: JSON.stringify({ logo: loginLogo }),
      })
      if (!r4.ok) throw new Error('로그인 로고를 저장하지 못했습니다')
      const r3 = await apiFetch('/api/branding/login-image', {
        method: 'POST',
        body: JSON.stringify({ image: loginImg }),
      })
      if (!r3.ok) {
        const b3 = (await r3.json().catch(() => ({}))) as { detail?: string }
        throw new Error(b3.detail || '로그인 사진을 저장하지 못했습니다')
      }
      const r2 = await apiFetch('/api/branding/logo', {
        method: 'POST',
        body: JSON.stringify({ logo }),
      })
      if (!r2.ok) {
        const b = (await r2.json().catch(() => ({}))) as { detail?: string }
        throw new Error(b.detail || String(r2.status))
      }
      setMsg('저장했습니다 — 화면을 새로고침하면 메뉴에 보입니다')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="brand-set">
      <h3>브랜딩</h3>
      <p className="muted small">
        좌측 메뉴 맨 위에 나올 로고와 이름입니다. 메뉴를 접으면 마크만, 펼치면
        이름까지 보입니다. (PNG·JPG·SVG, 3MB 이하)
      </p>

      <div className="brand-row">
        <span className="brand-preview">
          {logo ? <img src={logo} alt="로고 미리보기" /> : <i className="muted small">없음</i>}
        </span>
        <label className="btn primary small brand-up">
          로고 등록
          <input
            type="file"
            accept="image/png,image/jpeg,image/svg+xml"
            hidden
            onChange={(e) => pick(e.target.files?.[0])}
          />
        </label>
        <button className="btn small" type="button" disabled={!logo} onClick={() => setLogo('')}>
          제거
        </button>
      </div>

      {/* 로그인 화면 — 왼쪽 판(지시). 사진은 **올리는 것**이지 인터넷에서
          가져오는 것이 아니다: 남의 사진에는 권리가 붙어 있다 */}
      <h3 className="brand-h2">로그인 화면</h3>
      <p className="muted small">
        로그인 화면 왼쪽 판에 깔리는 사진입니다. 회사 건물 사진처럼 <b>우리가 쓸 권리가 있는
        사진</b>을 올려 주세요. 안 올리면 회사 색으로 칠한 판이 대신 섭니다. (JPG·PNG, 6MB 이하)
      </p>
      <div className="brand-row">
        <span className="brand-loginprev">
          {loginImg ? (
            <img src={loginImg} alt="로그인 사진 미리보기" />
          ) : (
            <i className="muted small">사진 없음 — 색 판으로 뜹니다</i>
          )}
        </span>
        <label className="btn primary small brand-up">
          사진 등록
          <input
            type="file"
            accept="image/png,image/jpeg"
            hidden
            onChange={(e) => pickLogin(e.target.files?.[0])}
          />
        </label>
        <button
          className="btn small"
          type="button"
          disabled={!loginImg}
          /* 그 자리에서 지운다(지적: 한번 등록하면 제거가 안 된다) —
             칸만 비우고 저장을 기다리면 안 누른 채 나가서 그대로 남았다 */
          onClick={() => {
            if (!window.confirm('로그인 사진을 지웁니다.')) return
            setLoginImg('')
            void apiFetch('/api/branding/login-image', {
              method: 'POST',
              body: JSON.stringify({ image: '' }),
            })
              .then(async (r) => {
                if (!r.ok) {
                  const b = (await r.json().catch(() => ({}))) as { detail?: string }
                  throw new Error(b.detail || '지우지 못했습니다')
                }
                setMsg('로그인 사진을 지웠습니다')
              })
              .catch((e: unknown) => setMsg(e instanceof Error ? e.message : String(e)))
          }}
        >
          제거
        </button>
      </div>
      <div className="brand-row">
        <span className="brand-preview">
          {loginLogo ? (
            <img src={loginLogo} alt="로그인 로고" />
          ) : (
            <i className="muted small">메뉴 로고를 씁니다</i>
          )}
        </span>
        <label className="btn primary small brand-up">
          로그인 로고 등록
          <input
            type="file"
            accept="image/png,image/jpeg,image/svg+xml"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (!f) return
              if (f.size > 3 * 1024 * 1024) {
                setMsg('3MB 이하 그림만 됩니다')
                return
              }
              const fr = new FileReader()
              fr.onload = () => setLoginLogo(String(fr.result || ''))
              fr.readAsDataURL(f)
            }}
          />
        </label>
        <button
          className="btn small"
          type="button"
          disabled={!loginLogo}
          onClick={() => {
            setLoginLogo('')
            void apiFetch('/api/branding/login-logo', {
              method: 'POST',
              body: JSON.stringify({ logo: '' }),
            }).then(() => setMsg('로그인 로고를 지웠습니다'))
          }}
        >
          제거
        </button>
      </div>
      <div className="brand-row">
        <label className="brand-f">
          제목 크기(px)
          <input
            type="number"
            min={16}
            max={72}
            value={loginSize}
            placeholder="26"
            onChange={(e) => setLoginSize(e.target.value)}
          />
        </label>
        <label className="brand-f">
          제목 색
          <input type="color" value={loginColor} onChange={(e) => setLoginColor(e.target.value)} />
        </label>
        <label className="brand-f">
          강조 색 ([ ] 안 글자)
          <input type="color" value={loginAccent} onChange={(e) => setLoginAccent(e.target.value)} />
        </label>
      </div>
      <div className="brand-row">
        <label className="brand-nm">
          로그인 화면 제목 (비우면 표시 텍스트)
          <input
            value={loginTitle}
            placeholder="유비쿼스 시험 자동화 플랫폼"
            onChange={(e) => setLoginTitle(e.target.value)}
          />
        </label>
        <label className="brand-nm">
          그 아래 한 줄
          <input
            value={loginSub}
            placeholder="요구사항부터 결과서까지 한 줄기로"
            onChange={(e) => setLoginSub(e.target.value)}
          />
        </label>
      </div>

      <div className="brand-row">
        <label className="brand-nm">
          표시 텍스트 (강조할 글자는 [ ]로 — 예: ubi[Q]uoss-TOP)
          <input
            value={name}
            placeholder="ubi[Q]uoss-TOP"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      </div>
      <div className="brand-row">
        <label className="brand-f">
          글자 크기(px)
          <input
            type="number"
            min={10}
            max={40}
            value={size}
            placeholder="15"
            onChange={(e) => setSize(e.target.value)}
          />
        </label>
        <label className="brand-f">
          기본 색
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </label>
        <label className="brand-f">
          강조 색 [ ]
          <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} />
        </label>
        <label className="brand-f">
          폰트
          <select value={font} onChange={(e) => setFont(e.target.value)}>
            <option value="">기본</option>
            <option value="'Noto Sans KR', sans-serif">Noto Sans KR</option>
            <option value="'Malgun Gothic', sans-serif">맑은 고딕</option>
            <option value="Pretendard, sans-serif">Pretendard</option>
            <option value="monospace">Monospace</option>
          </select>
        </label>
      </div>

      <div className="brand-row">
        <label className="brand-nm">
          클릭하면 열 주소 (비우면 대시보드로 이동)
          <input
            value={link}
            placeholder="https://www.ubiquoss.com"
            onChange={(e) => setLink(e.target.value)}
          />
        </label>
      </div>

      <div className="brand-row">
        <button className="btn primary" type="button" disabled={busy} onClick={() => void save()}>
          {busy ? '저장 중…' : '적용·저장'}
        </button>
        {msg && <span className="muted small">{msg}</span>}
      </div>
    </div>
  )
}
