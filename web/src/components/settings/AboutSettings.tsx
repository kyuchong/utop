import { useEffect, useState } from 'react'
import { apiFetch } from '@/api/client'

/**
 * 도움말·라이선스 — 왼쪽 메뉴 도움말 위에 서는 것(버전·라이선스 기간)과
 * 도움말을 고칠 수 있는 사람(편집자 목록)을 관리자가 정한다(지시).
 *
 * 버전은 저장소의 VERSION 파일, 커밋과 빌드 시각은 이미지를 구울 때 박힌다 —
 * 여기서 고치는 것이 아니라 보이기만 한다.
 */
interface About {
  version: string
  git_sha: string
  built_at: string
  license: { holder: string; start: string; until: string; note: string; days_left: number | null }
}

export default function AboutSettings() {
  const [about, setAbout] = useState<About | null>(null)
  const [holder, setHolder] = useState('')
  const [start, setStart] = useState('')
  const [until, setUntil] = useState('')
  const [note, setNote] = useState('')
  const [editors, setEditors] = useState('')
  const [seeds, setSeeds] = useState<Array<{ id: string; title: string }>>([])
  const [resetMsg, setResetMsg] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void (async () => {
      const r = await apiFetch('/api/about', { cache: 'no-store' })
      if (r.ok) {
        const a = (await r.json()) as About
        setAbout(a)
        setHolder(a.license.holder)
        setStart(a.license.start)
        setUntil(a.license.until)
        setNote(a.license.note)
      }
      const e = await apiFetch('/api/help/editors', { cache: 'no-store' })
      if (e.ok) setEditors(((await e.json()) as { users: string[] }).users.join('\n'))
      const sd = await apiFetch('/api/help/seeds', { cache: 'no-store' })
      if (sd.ok) setSeeds(((await sd.json()) as { seeds: Array<{ id: string; title: string }> }).seeds)
    })()
  }, [])

  const save = async () => {
    setBusy(true)
    setMsg('')
    const r1 = await apiFetch('/api/license', {
      method: 'POST',
      body: JSON.stringify({ holder, start, until, note }),
    })
    const users = editors
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean)
    const r2 = await apiFetch('/api/help/editors', { method: 'POST', body: JSON.stringify({ users }) })
    setBusy(false)
    setMsg(r1.ok && r2.ok ? '저장했습니다' : '저장하지 못했습니다 — 관리자만 고칠 수 있습니다')
    if (r1.ok) {
      const j = (await r1.json()) as { license: About['license'] }
      setAbout((a) => (a ? { ...a, license: j.license } : a))
    }
  }

  return (
    <div className="set-card" style={{ maxWidth: 720 }}>
      <h3>도움말 · 라이선스</h3>
      <p className="muted">왼쪽 메뉴 「도움말」 위에 보이는 판·라이선스 기간과, 도움말을 고칠 수 있는 사람.</p>

      <h4>지금 판</h4>
      <table style={{ borderCollapse: "collapse", fontSize: 13 }}>
        <tbody>
          <tr>
            <th style={{ textAlign: "left", paddingRight: 16 }}>버전</th>
            <td>{about?.version || '(VERSION 파일 없음)'}</td>
          </tr>
          <tr>
            <th style={{ textAlign: "left", paddingRight: 16 }}>커밋</th>
            <td>{about?.git_sha || '(빌드 때 안 넘어옴)'}</td>
          </tr>
          <tr>
            <th style={{ textAlign: "left", paddingRight: 16 }}>빌드 시각</th>
            <td>{about?.built_at || '-'}</td>
          </tr>
        </tbody>
      </table>

      <h4>라이선스</h4>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", maxWidth: 560 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
          사용처(고객사·부서)
          <input value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="예: LG유플러스 검증팀" />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
          시작일
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
          만료일
          <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
          비고
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="계약 번호 등" />
        </label>
      </div>
      {about?.license.days_left != null && (
        <p className="muted">
          {about.license.days_left >= 0 ? `만료까지 ${about.license.days_left}일` : `만료된 지 ${-about.license.days_left}일`}
        </p>
      )}

      <h4>도움말 편집자</h4>
      <p className="muted">관리자는 늘 고칠 수 있다. 그 밖에 고칠 사람의 아이디를 한 줄에 하나씩.</p>
      <textarea rows={4} value={editors} onChange={(e) => setEditors(e.target.value)} placeholder={'hong\nkim'} style={{ width: 320 }} />

      <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button type="button" className="btn primary" onClick={save} disabled={busy}>
          저장
        </button>
        {msg && <span className="muted">{msg}</span>}
      </div>

      <h4>처음 글로 되돌리기</h4>
      <p className="muted">도움말을 고치다 망쳤을 때, 그 편만 처음 실린 글(기능별 문서)로 되돌린다. 지금 글은 지난 판으로 남는다.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {seeds.map((sd) => (
          <button
            key={sd.id}
            type="button"
            className="btn small"
            onClick={async () => {
              if (!window.confirm(`「${sd.title}」 을(를) 처음 글로 되돌립니다.`)) return
              const r = await apiFetch(`/api/help/reset/${encodeURIComponent(sd.id)}`, { method: 'POST' })
              setResetMsg(r.ok ? `「${sd.title}」 되돌렸습니다` : '되돌리지 못했습니다')
            }}
          >
            {sd.title}
          </button>
        ))}
      </div>
      {resetMsg && <p className="muted">{resetMsg}</p>}
    </div>
  )
}
