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
      const r = await apiFetch('/api/branding', { cache: 'no-store' })
      if (!r.ok) return
      const b = (await r.json()) as {
        logo?: string
        name_text?: string
        name_size?: string
        name_color?: string
        name_accent_color?: string
        name_font?: string
        link_url?: string
      }
      setLogo(b.logo ?? '')
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
        }),
      })
      if (!r.ok) {
        const b = (await r.json().catch(() => ({}))) as { detail?: string }
        throw new Error(b.detail || String(r.status))
      }
      const r2 = await apiFetch('/api/branding/logo', {
        method: 'POST',
        body: JSON.stringify({ logo }),
      })
      if (!r2.ok) {
        const b = (await r2.json().catch(() => ({}))) as { detail?: string }
        throw new Error(b.detail || String(r2.status))
      }
      const back = await apiFetch('/api/branding', { cache: 'no-store' })
      if (back.ok) {
        const b = (await back.json()) as Record<string, string>
        setName(b.name_text ?? '')
        setSize(b.name_size ?? '')
        if (b.name_color) setColor(b.name_color)
        if (b.name_accent_color) setAccent(b.name_accent_color)
        setFont(b.name_font ?? '')
        setLink(b.link_url ?? '')
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
