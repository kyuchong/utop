import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/api/client'
import './AboutSettings.css'

/**
 * 버전 · 라이선스 — 왼쪽 메뉴 도움말 위에 서는 것(버전·라이선스 기간)을
 * 관리자가 본다.
 *
 * **라이선스는 파일을 등록하고 상태를 본다**(지시). 손으로 적는 칸은 없다 —
 * Jira Data Center·GitLab EE·SonarQube 가 하는 그대로다: 발급처가 서명한
 * 파일을 올리면 서버가 서명을 확인하고, 화면은 사용처·기간·남은 날수·발급
 * ID·등록 기록을 **읽기만** 한다. 틀린 파일은 까닭과 함께 거절된다.
 *
 * 도움말 편집자는 여기서 걷었다(지시) — 페이지별 접근 권한의 「도움말 ·
 * 고치기」 가 맡는다. 「처음 글로 되돌리기」 만 남긴다.
 */
interface License {
  id: string
  product: string
  holder: string
  start: string
  until: string
  note: string
  issued_at: string
  issuer: string
  fp: string
  registered_at: string
  registered_by: string
  status: 'none' | 'not_yet' | 'ok' | 'warn' | 'expired'
  days_left: number | null
  days_total: number | null
  days_used: number | null
}
interface About {
  version: string
  git_sha: string
  built_at: string
  license: License
}

const STATUS: Record<License['status'], { label: string; tone: string }> = {
  none: { label: '미등록', tone: 'none' },
  not_yet: { label: '시작 전', tone: 'wait' },
  ok: { label: '유효', tone: 'ok' },
  warn: { label: '만료 임박', tone: 'warn' },
  expired: { label: '만료됨', tone: 'bad' },
}

const fmtAt = (s: string) => (s ? s.replace('T', ' ').slice(0, 16) : '')

/** 시작 전이면 오늘부터 시작일까지 — days_left(만료까지)에서 기간 전체를 뺀 값 */
function daysUntilStart(l: License): number {
  if (l.days_left == null || l.days_total == null) return 0
  return Math.max(0, l.days_left - l.days_total)
}

export default function AboutSettings() {
  const [about, setAbout] = useState<About | null>(null)
  const [licMsg, setLicMsg] = useState<{ kind: 'ok' | 'err' | ''; text: string }>({ kind: '', text: '' })
  const [licBusy, setLicBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [seeds, setSeeds] = useState<Array<{ id: string; title: string }>>([])
  const [resetMsg, setResetMsg] = useState('')

  useEffect(() => {
    void (async () => {
      const r = await apiFetch('/api/about', { cache: 'no-store' })
      if (r.ok) setAbout((await r.json()) as About)
      const sd = await apiFetch('/api/help/seeds', { cache: 'no-store' })
      if (sd.ok) setSeeds(((await sd.json()) as { seeds: Array<{ id: string; title: string }> }).seeds)
    })()
  }, [])

  /** 파일을 글로 읽어 서버에 — 서버가 서명을 확인한다 */
  const register = async (f: File) => {
    setLicBusy(true)
    setLicMsg({ kind: '', text: '' })
    try {
      const text = await f.text()
      const r = await apiFetch('/api/license/file', { method: 'POST', body: JSON.stringify({ text }) })
      const b = (await r.json().catch(() => ({}))) as { detail?: string; license?: License }
      if (!r.ok) throw new Error(b.detail || `등록하지 못했습니다 (${r.status})`)
      setAbout((a) => (a && b.license ? { ...a, license: b.license } : a))
      setLicMsg({ kind: 'ok', text: `${f.name} 등록했습니다` })
    } catch (e) {
      setLicMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setLicBusy(false)
    }
  }

  const clear = async () => {
    if (!window.confirm('라이선스 등록을 해제합니다. 왼쪽 메뉴에 「미등록」 으로 보입니다.')) return
    setLicBusy(true)
    const r = await apiFetch('/api/license/clear', { method: 'POST' })
    setLicBusy(false)
    if (r.ok) {
      const b = (await r.json()) as { license: License }
      setAbout((a) => (a ? { ...a, license: b.license } : a))
      setLicMsg({ kind: 'ok', text: '등록을 해제했습니다' })
    } else setLicMsg({ kind: 'err', text: '해제하지 못했습니다 — 관리자만 할 수 있습니다' })
  }

  const lic = about?.license
  const st = STATUS[lic?.status ?? 'none']
  const has = !!lic && lic.status !== 'none'
  const pct =
    lic && lic.days_total && lic.days_total > 0 && lic.days_used != null
      ? Math.round((lic.days_used / lic.days_total) * 100)
      : null
  const daysText = !lic || lic.days_left == null
    ? ''
    : lic.status === 'not_yet'
      ? `시작까지 ${daysUntilStart(lic)}일`
      : lic.days_left >= 0
        ? `만료까지 ${lic.days_left}일`
        : `만료된 지 ${-lic.days_left}일`

  return (
    <div className="abt">
      {/* ── 버전 — 보이기만. 고치는 곳은 저장소·빌드다 ── */}
      <div className="set-card">
        <h3>버전</h3>
        <p className="muted">왼쪽 메뉴 「도움말」 위에 보이는 판. 저장소의 VERSION 파일과 빌드 때 박힌 커밋·시각이다 — 여기서 고치지 않는다.</p>
        <dl className="abt-kv">
          <dt>버전</dt>
          <dd>
            <b>{about?.version || '(VERSION 파일 없음)'}</b>
          </dd>
          <dt>커밋</dt>
          <dd className="mono">{about?.git_sha || '(빌드 때 안 넘어옴)'}</dd>
          <dt>빌드 시각</dt>
          <dd>{about?.built_at || '-'}</dd>
        </dl>
      </div>

      {/* ── 라이선스 — 파일을 등록하고 상태를 본다 ── */}
      <div className="set-card">
        <div className="abt-head">
          <h3>라이선스</h3>
          <span className={`abt-badge ${st.tone}`}>{st.label}</span>
        </div>
        <p className="muted">발급처(ubiQuoss)가 서명한 라이선스 파일(.lic)을 등록하면 서버가 서명을 확인하고 아래에 상태가 보입니다. 손으로 고치는 칸은 없습니다.</p>

        {has && lic ? (
          <>
            <dl className="abt-kv">
              <dt>사용처</dt>
              <dd>
                <b>{lic.holder}</b>
              </dd>
              <dt>기간</dt>
              <dd>
                {lic.start || '(시작일 없음)'} ~ {lic.until}
                {daysText && <span className={`abt-days ${st.tone}`}> · {daysText}</span>}
              </dd>
              {pct != null && (
                <>
                  <dt>사용</dt>
                  <dd>
                    <span className={`abt-bar ${st.tone}`} aria-hidden="true">
                      <i style={{ width: `${Math.min(100, pct)}%` }} />
                    </span>
                    <span className="muted small">
                      {' '}
                      {lic.days_used}/{lic.days_total}일 ({pct}%)
                    </span>
                  </dd>
                </>
              )}
              <dt>발급 ID</dt>
              <dd className="mono">
                {lic.id || '-'}
                {lic.fp && <span className="muted small"> · 지문 {lic.fp}</span>}
              </dd>
              <dt>발급</dt>
              <dd>
                {lic.issuer || '-'}
                {lic.issued_at && <span className="muted small"> · {fmtAt(lic.issued_at)}</span>}
              </dd>
              {lic.note && (
                <>
                  <dt>비고</dt>
                  <dd>{lic.note}</dd>
                </>
              )}
              <dt>등록</dt>
              <dd>
                {fmtAt(lic.registered_at) || '-'}
                {lic.registered_by && <span className="muted small"> · {lic.registered_by}</span>}
              </dd>
            </dl>
            {lic.status === 'expired' && <p className="abt-note bad">라이선스가 만료됐습니다. 새 파일을 등록하세요.</p>}
            {lic.status === 'warn' && <p className="abt-note warn">만료가 30일 안입니다. 갱신 파일을 미리 받아 두세요.</p>}
          </>
        ) : (
          <p className="abt-empty">등록된 라이선스가 없습니다. 발급받은 .lic 파일을 등록하세요.</p>
        )}

        <input
          ref={fileRef}
          type="file"
          accept=".lic,.txt,text/plain"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void register(f)
          }}
        />
        <div className="abt-acts">
          <button type="button" className="btn primary" disabled={licBusy} onClick={() => fileRef.current?.click()}>
            {licBusy ? '확인 중…' : has ? '다른 파일로 갈아 끼우기' : '라이선스 파일 등록'}
          </button>
          {has && (
            <button type="button" className="btn" disabled={licBusy} onClick={() => void clear()}>
              등록 해제
            </button>
          )}
          {licMsg.text && <span className={`small ${licMsg.kind}`}>{licMsg.text}</span>}
        </div>
      </div>

      {/* ── 도움말 — 처음 글로 되돌리기. 고칠 사람은 권한 화면에서 ── */}
      <div className="set-card">
        <h3>도움말</h3>
        <p className="muted">
          도움말을 고칠 수 있는 사람은 <b>페이지별 접근 권한</b>의 「도움말 · 고치기」 로 정합니다. 관리자는 늘 고칠 수 있습니다.
        </p>
        <h4>처음 글로 되돌리기</h4>
        <p className="muted">도움말을 고치다 망쳤을 때, 그 편만 처음 실린 글(기능별 문서)로 되돌린다. 지금 글은 지난 판으로 남는다.</p>
        <div className="abt-seeds">
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
