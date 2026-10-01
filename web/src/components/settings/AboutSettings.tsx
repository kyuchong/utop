import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/api/client'
import { copyText } from '@/lib/copy'
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
 * 개인 PC 발급기 파일(봉인·분 단위·장비 고정, 2026-10-01)도 같은 자리에서 받는다.
 * 장비 고정 파일은 서버가 이 서버의 NIC·호스트명과 맞춰 보고, 안 맞으면 「다른 장비」.
 * 발급에 필요한 「UTOP MACHINE INFO」 글은 아래 카드에서 복사해 발급 담당자에게 보낸다.
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
  status: 'none' | 'not_yet' | 'ok' | 'warn' | 'expired' | 'wrong_machine'
  days_left: number | null
  days_total: number | null
  days_used: number | null
  used_pct: number | null
  left_text: string
  machine: { hostname?: string; macs?: string[] }
  machine_check: { ok: boolean; reason: string } | null
  /** 보기 전용인가 — mode: off(끔) · registered(등록된 적 있는 서버만) · always(미등록도) */
  gate?: { blocked: boolean; why: string; mode: 'off' | 'registered' | 'always' }
}
interface ServerMachine {
  hostname: string
  macs: string[]
  from_host: boolean
  text: string
}
interface About {
  version: string
  git_sha: string
  built_at: string
  license: License
  server?: ServerMachine
}

const STATUS: Record<License['status'], { label: string; tone: string }> = {
  none: { label: '미등록', tone: 'none' },
  not_yet: { label: '시작 전', tone: 'wait' },
  ok: { label: '유효', tone: 'ok' },
  warn: { label: '만료 임박', tone: 'warn' },
  expired: { label: '만료됨', tone: 'bad' },
  wrong_machine: { label: '다른 장비', tone: 'bad' },
}

const fmtAt = (s: string) => (s ? s.replace('T', ' ').slice(0, 16) : '')

export default function AboutSettings() {
  const [about, setAbout] = useState<About | null>(null)
  const [licMsg, setLicMsg] = useState<{ kind: 'ok' | 'err' | ''; text: string }>({ kind: '', text: '' })
  const [licBusy, setLicBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [seeds, setSeeds] = useState<Array<{ id: string; title: string }>>([])
  const [resetMsg, setResetMsg] = useState('')
  const [copied, setCopied] = useState('')

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
  /* 남은 시간 글·사용 막대는 서버가 정한다(분 단위 라이선스도 같은 식) */
  const pct = lic?.used_pct ?? null
  const daysText = lic?.left_text || ''
  const bound = !!lic && !!((lic.machine?.macs?.length ?? 0) > 0 || lic.machine?.hostname)
  const srv = about?.server

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
        {lic?.gate?.blocked && (
          <p className="abt-note bad">
            <b>지금 이 서버는 보기 전용입니다</b> — {lic.gate.why}. 보기·내보내기는 되지만 만들기·고치기·지우기·실행·AI 생성이 막혀 있습니다.
            돌던 실행은 끝까지 돕니다. 새 라이선스 파일을 등록하면 바로 풀립니다.
          </p>
        )}
        {lic?.gate && !lic.gate.blocked && lic.status === 'none' && lic.gate.mode === 'registered' && (
          <p className="muted small">
            이 서버는 아직 라이선스가 등록된 적이 없어 막지 않습니다. 한 번 등록한 뒤로는 만료·등록 해제 시 보기 전용이 됩니다.
          </p>
        )}

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
                    <span className="muted small"> {pct}%</span>
                  </dd>
                </>
              )}
              <dt>장비</dt>
              <dd>
                {bound ? (
                  <>
                    <span className="mono">
                      {[lic.machine.hostname, ...(lic.machine.macs ?? [])].filter(Boolean).join(' · ')}
                    </span>
                    {lic.machine_check && (
                      <span className={`abt-days ${lic.machine_check.ok ? 'ok' : 'bad'}`}> · {lic.machine_check.reason}</span>
                    )}
                  </>
                ) : (
                  <span className="muted">고정 없음 (어느 서버에서나)</span>
                )}
              </dd>
              <dt>발급 ID</dt>
              {/* 지문(파일 해시)은 화면에서 뺐다(지시) — 발급기 기록과 맞춰 볼 수 없어 쓸모가 없었다. 서버에는 남는다 */}
              <dd className="mono">{lic.id || '-'}</dd>
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
            {lic.status === 'warn' && <p className="abt-note warn">남은 기간이 얼마 없습니다({daysText}). 갱신 파일을 미리 받아 두세요.</p>}
            {lic.status === 'wrong_machine' && (
              <p className="abt-note bad">
                이 서버용 라이선스가 아닙니다 — {lic.machine_check?.reason}. 아래 「이 서버 장비 정보」 를 발급 담당자에게 보내 다시 받으세요.
              </p>
            )}
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

      {/* ── 이 서버 장비 정보 — 장비 고정 라이선스를 받을 때 발급 담당자에게 보낸다 ── */}
      {srv && (
        <div className="set-card">
          <div className="abt-head">
            <h3>이 서버 장비 정보</h3>
          </div>
          <p className="muted">
            장비에 묶인 라이선스를 받으려면 이 글을 통째로 복사해 발급 담당자에게 보내세요. 발급 페이지의 「장비 NIC(MAC)」 칸에 그대로 붙여 넣으면 됩니다.
          </p>
          <pre className="abt-mach" translate="no">
            {srv.text}
          </pre>
          {!srv.from_host && (
            <p className="abt-note warn">
              컨테이너가 호스트의 NIC 를 직접 보지 못하고 있습니다. docker-compose 의 /hostsys 연결이 들어간 판으로 다시 띄우세요.
            </p>
          )}
          <div className="abt-acts">
            <button
              type="button"
              className="btn"
              onClick={async () => setCopied((await copyText(srv.text)) ? '복사했습니다' : '복사하지 못했습니다 — 글을 끌어 직접 복사하세요')}
            >
              장비 정보 복사
            </button>
            {copied && <span className="small ok">{copied}</span>}
          </div>
        </div>
      )}

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
