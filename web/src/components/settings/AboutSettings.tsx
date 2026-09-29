import { useEffect, useState } from 'react'
import { apiFetch } from '@/api/client'

/**
 * 버전 · 라이선스 — 왼쪽 메뉴 도움말 위에 서는 것(버전·라이선스 기간)과
 * 도움말을 고칠 수 있는 사람(편집자 목록)을 관리자가 정한다(지시).
 *
 * **세 카드로 가른다**(지적: 버전과 라이선스를 구분해). 버전은 보이기만 하는
 * 것이라 저장 단추가 없고, 라이선스와 도움말은 각자 저장한다 — 한 단추가
 * 둘을 같이 저장하면 무엇이 저장됐는지 모른다.
 *
 * 버전은 저장소의 VERSION 파일, 커밋과 빌드 시각은 이미지를 구울 때 박힌다.
 */
interface About {
  version: string
  git_sha: string
  built_at: string
  license: { holder: string; start: string; until: string; note: string; days_left: number | null }
}

const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', maxWidth: 560 }
const lab: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }
const th: React.CSSProperties = { textAlign: 'left', paddingRight: 16, color: 'var(--c-text-faint)', fontWeight: 600 }

export default function AboutSettings() {
  const [about, setAbout] = useState<About | null>(null)
  const [holder, setHolder] = useState('')
  const [start, setStart] = useState('')
  const [until, setUntil] = useState('')
  const [note, setNote] = useState('')
  const [licMsg, setLicMsg] = useState('')
  const [licBusy, setLicBusy] = useState(false)
  const [editors, setEditors] = useState('')
  const [edMsg, setEdMsg] = useState('')
  const [edBusy, setEdBusy] = useState(false)
  const [seeds, setSeeds] = useState<Array<{ id: string; title: string }>>([])
  const [resetMsg, setResetMsg] = useState('')

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

  const saveLicense = async () => {
    setLicBusy(true)
    setLicMsg('')
    const r = await apiFetch('/api/license', { method: 'POST', body: JSON.stringify({ holder, start, until, note }) })
    setLicBusy(false)
    setLicMsg(r.ok ? '저장했습니다' : '저장하지 못했습니다 — 관리자만 고칠 수 있습니다')
    if (r.ok) {
      const j = (await r.json()) as { license: About['license'] }
      setAbout((a) => (a ? { ...a, license: j.license } : a))
    }
  }

  const saveEditors = async () => {
    setEdBusy(true)
    setEdMsg('')
    const users = editors
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean)
    const r = await apiFetch('/api/help/editors', { method: 'POST', body: JSON.stringify({ users }) })
    setEdBusy(false)
    setEdMsg(r.ok ? '저장했습니다' : '저장하지 못했습니다 — 관리자만 고칠 수 있습니다')
  }

  const days = about?.license.days_left
  const licTone = days == null ? '' : days < 0 ? 'var(--c-fail)' : days <= 30 ? 'var(--c-draft, #d97706)' : 'var(--c-pass, #1d9e75)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }}>
      {/* ── 버전 — 보이기만. 고치는 곳은 저장소·빌드다 ── */}
      <div className="set-card">
        <h3>버전</h3>
        <p className="muted">왼쪽 메뉴 「도움말」 위에 보이는 판. 저장소의 VERSION 파일과 빌드 때 박힌 커밋·시각이다 — 여기서 고치지 않는다.</p>
        <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
          <tbody>
            <tr>
              <th style={th}>버전</th>
              <td>
                <b>{about?.version || '(VERSION 파일 없음)'}</b>
              </td>
            </tr>
            <tr>
              <th style={th}>커밋</th>
              <td style={{ fontFamily: 'var(--font-mono)' }}>{about?.git_sha || '(빌드 때 안 넘어옴)'}</td>
            </tr>
            <tr>
              <th style={th}>빌드 시각</th>
              <td>{about?.built_at || '-'}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── 라이선스 — 사용처·기간. 만료 30일 안이면 주황, 지나면 빨강 ── */}
      <div className="set-card">
        <h3>라이선스</h3>
        <p className="muted">사용처와 기간. 왼쪽 메뉴 「도움말」 위에 남은 날수로 보인다.</p>
        <div style={grid2}>
          <label style={lab}>
            사용처(고객사·부서)
            <input value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="예: LG유플러스 검증팀" />
          </label>
          <label style={lab}>
            시작일
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label style={lab}>
            만료일
            <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
          </label>
          <label style={lab}>
            비고
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="계약 번호 등" />
          </label>
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" className="btn primary" onClick={saveLicense} disabled={licBusy}>
            라이선스 저장
          </button>
          {days != null && (
            <span className="small" style={{ color: licTone, fontWeight: 700 }}>
              {days >= 0 ? `만료까지 ${days}일` : `만료된 지 ${-days}일`}
            </span>
          )}
          {licMsg && <span className="muted">{licMsg}</span>}
        </div>
      </div>

      {/* ── 도움말 — 고칠 사람과 처음 글로 되돌리기 ── */}
      <div className="set-card">
        <h3>도움말</h3>
        <h4>편집자</h4>
        <p className="muted">관리자는 늘 고칠 수 있다. 그 밖에 고칠 사람의 아이디를 한 줄에 하나씩.</p>
        <textarea rows={4} value={editors} onChange={(e) => setEditors(e.target.value)} placeholder={'hong\nkim'} style={{ width: 320 }} />
        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" className="btn primary" onClick={saveEditors} disabled={edBusy}>
            편집자 저장
          </button>
          {edMsg && <span className="muted">{edMsg}</span>}
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
    </div>
  )
}
