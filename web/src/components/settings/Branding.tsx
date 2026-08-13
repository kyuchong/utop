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
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    void (async () => {
      const r = await apiFetch('/api/branding')
      if (!r.ok) return
      const b = (await r.json()) as { logo?: string; name?: string }
      setLogo(b.logo ?? '')
      setName(b.name ?? '')
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
      const r = await apiFetch('/api/branding', {
        method: 'POST',
        body: JSON.stringify({ logo, name }),
      })
      if (!r.ok) {
        const b = (await r.json().catch(() => ({}))) as { detail?: string }
        throw new Error(b.detail || String(r.status))
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
          표시 이름
          <input
            value={name}
            placeholder="ubiQuoss-TOP"
            onChange={(e) => setName(e.target.value)}
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
