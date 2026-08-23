import { useEffect, useState } from 'react'
import { apiFetch } from '@/api/client'

/**
 * 로그인 화면 설정 — **브랜딩과 딴 페이지다**(지시: 페이지 자체를 분리).
 *
 * 왼쪽 메뉴의 로고·이름과 로그인 화면의 것을 한 자리에 두었더니, 한쪽을
 * 고치려다 다른 쪽까지 건드렸다. 값도 화면도 갈라 둔다 — 여기서 고친
 * 것은 로그인 화면에만 미친다.
 *
 * 사진은 **올리는 것**이지 인터넷에서 가져오는 것이 아니다: 남의 사진에는
 * 권리가 붙어 있고, 그것을 아는 사람은 올리는 사람이다.
 */
export default function LoginBranding() {
  const [loginImg, setLoginImg] = useState('')
  const [loginLogo, setLoginLogo] = useState('')
  const [loginTitle, setLoginTitle] = useState('')
  const [loginSub, setLoginSub] = useState('')
  const [loginSize, setLoginSize] = useState('')
  const [loginColor, setLoginColor] = useState('#ffffff')
  const [loginAccent, setLoginAccent] = useState('#ff5b5b')
  /* 오른쪽 판 — 들어가는 자리(지시: 오른쪽 화면 설정) */
  const [formTitle, setFormTitle] = useState('')
  const [idPh, setIdPh] = useState('')
  const [note, setNote] = useState('')
  const [foot, setFoot] = useState('')
  const [keepOn, setKeepOn] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const r = await apiFetch('/api/branding', { cache: 'no-store' })
        if (!r.ok) return
        const b = (await r.json()) as {
          login_image?: string
          login_logo?: string
          login_title?: string
          login_sub?: string
          login_size?: string
          login_color?: string
          login_accent_color?: string
          login_form_title?: string
          login_id_ph?: string
          login_note?: string
          login_foot?: string
          login_keep?: string
        }
        setLoginImg(b.login_image ?? '')
        setLoginLogo(b.login_logo ?? '')
        setLoginTitle(b.login_title ?? '')
        setLoginSub(b.login_sub ?? '')
        setLoginSize(b.login_size ?? '')
        setLoginColor(b.login_color || '#ffffff')
        setLoginAccent(b.login_accent_color || '#ff5b5b')
        setFormTitle(b.login_form_title ?? '')
        setIdPh(b.login_id_ph ?? '')
        setNote(b.login_note ?? '')
        setFoot(b.login_foot ?? '')
        setKeepOn(b.login_keep !== 'off')
      } catch {
        setMsg('설정을 읽지 못했습니다')
      }
    })()
  }, [])

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
      const r = await apiFetch('/api/branding', {
        method: 'POST',
        body: JSON.stringify({
          login_title: loginTitle,
          login_sub: loginSub,
          login_size: loginSize,
          login_color: loginColor,
          login_accent_color: loginAccent,
          login_form_title: formTitle,
          login_id_ph: idPh,
          login_note: note,
          login_foot: foot,
          login_keep: keepOn ? 'on' : 'off',
        }),
      })
      if (!r.ok) throw new Error('저장하지 못했습니다')
      const r2 = await apiFetch('/api/branding/login-logo', {
        method: 'POST',
        body: JSON.stringify({ logo: loginLogo }),
      })
      if (!r2.ok) throw new Error('로그인 로고를 저장하지 못했습니다')
      const r3 = await apiFetch('/api/branding/login-image', {
        method: 'POST',
        body: JSON.stringify({ image: loginImg }),
      })
      if (!r3.ok) throw new Error('사진을 저장하지 못했습니다')
      /* 저장한 값을 서버에서 다시 읽어 화면에 얹는다 — 저장은 됐는데
         화면이 옛것이면 사람은 「저장이 안 됐다」 고 읽는다(지적) */
      const back = await apiFetch('/api/branding', { cache: 'no-store' })
      if (back.ok) {
        const b = (await back.json()) as Record<string, string>
        setLoginImg(b.login_image ?? '')
        setLoginLogo(b.login_logo ?? '')
        setLoginTitle(b.login_title ?? '')
        setLoginSub(b.login_sub ?? '')
        setLoginSize(b.login_size ?? '')
        setLoginColor(b.login_color || '#ffffff')
        setLoginAccent(b.login_accent_color || '#ff5b5b')
        setFormTitle(b.login_form_title ?? '')
        setIdPh(b.login_id_ph ?? '')
        setNote(b.login_note ?? '')
        setFoot(b.login_foot ?? '')
        setKeepOn(b.login_keep !== 'off')
      }
      setMsg('저장했습니다')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="brand-set">
      <h3>로그인 화면</h3>
      <p className="muted small">
        로그인 화면에만 쓰이는 값입니다 — 왼쪽 메뉴의 로고·이름과는 <b>따로</b> 갑니다.
        사진은 회사 건물처럼 <b>우리가 쓸 권리가 있는 사진</b>을 올려 주세요. 안 올리면 회사
        색으로 칠한 판이 대신 섭니다. (JPG·PNG, 6MB 이하)
      </p>

      <h4 className="brand-h2">왼쪽 판 — 보여 주는 자리</h4>
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

      {/* 오른쪽 판 — 들어가는 자리(지시). 문구가 코드에 박혀 있어 고칠 수
          없던 것들이다 */}
      <h4 className="brand-h2">오른쪽 판 — 들어가는 자리</h4>
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
        <label className="brand-nm">
          폼 제목
          <input
            value={formTitle}
            placeholder="ubiQuoss TOP 로그인"
            onChange={(e) => setFormTitle(e.target.value)}
          />
        </label>
        <label className="brand-nm">
          아이디 칸 안내
          <input
            value={idPh}
            placeholder="ID를 입력 하세요"
            onChange={(e) => setIdPh(e.target.value)}
          />
        </label>
      </div>
      <div className="brand-row">
        <label className="brand-nm">
          안내 줄 (비우면 안 보입니다)
          <input
            value={note}
            placeholder="UMS(Jira) 계정으로 접속이 가능합니다."
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <label className="brand-nm">
          맨 아래 안내 (비우면 안 보입니다)
          <input
            value={foot}
            placeholder="비밀번호를 잊었으면 관리자에게 알려 주세요."
            onChange={(e) => setFoot(e.target.value)}
          />
        </label>
      </div>
      <div className="brand-row">
        <label className="brand-f" style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <input type="checkbox" checked={keepOn} onChange={(e) => setKeepOn(e.target.checked)} />
          「아이디 저장」 보이기
        </label>
      </div>

      <div className="brand-row">
        <button className="btn primary" type="button" disabled={busy} onClick={() => void save()}>
          {busy ? '저장 중…' : '저장'}
        </button>
        {msg && <span className="muted small">{msg}</span>}
      </div>
    </div>
  )
}
