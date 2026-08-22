import { useEffect, useState } from 'react'
import { apiFetch } from '@/api/client'
import SetTabs, { useSetTab } from './SetTabs'

/**
 * 메일 설정.
 *
 * 서버는 진작부터 메일을 보낼 줄 알았다 — 가입 승인, @멘션, 요구사항·
 * 시험항목 공유, 사이클 배정. 그런데 **설정할 자리가 새 화면에 없었다**.
 * 그래서 보낼 수는 있는데 어디로 어떻게 보내는지는 손댈 수가 없었다
 * (지시: SETUP › INTEGRATION 아래 메일 설정 페이지).
 *
 * 갈래가 다섯이다. 첫 갈래는 **어디로 보내는가**(SMTP)고, 나머지 넷은
 * **무슨 글을 보내는가**(폼)다. 폼은 HTML 이라 코드처럼 보이지만, 고치는
 * 사람은 문구만 고친다 — 자리표({{name}} 같은 것)를 함께 적어 둔다.
 */

interface Cfg {
  enabled: boolean
  host: string
  port: number
  security: string
  username: string
  password: string
  from_addr: string
  from_name: string
  app_url: string
  approval_subject: string
  approval_html: string
  cycle_subject: string
  cycle_html: string
}

const BLANK: Cfg = {
  enabled: false,
  host: '',
  port: 587,
  security: 'starttls',
  username: '',
  password: '',
  from_addr: '',
  from_name: 'ubiQuoss-TOP',
  app_url: '',
  approval_subject: '',
  approval_html: '',
  cycle_subject: '',
  cycle_html: '',
}

/** 공유 폼 한 벌 — 요구사항·시험항목이 같은 모양을 쓴다 */
interface ShareForm {
  subject: string
  sections: Record<string, boolean>
  intro: string
  outro: string
}

const REQ_SEC: Array<[string, string]> = [
  ['info', 'INFO'],
  ['desc', '구현내용'],
  ['impl', '구현의도'],
  ['scenario', '시나리오'],
  ['tc', '연결된 시험항목'],
]
const TC_SEC: Array<[string, string]> = [
  ['info', 'INFO'],
  ['purpose', '시험 목적'],
  ['topo', '토폴로지'],
  ['traffic', 'Traffic'],
  ['steps', '시험 스텝'],
  ['issue', '결함'],
  ['history', '변경 이력'],
  ['cycle', '사이클'],
]

type Tab = 'smtp' | 'signup' | 'req' | 'tc' | 'cycle'

export default function MailSettings() {
  const [tab, setTab] = useSetTab<Tab>('mail', 'smtp')
  const [cfg, setCfg] = useState<Cfg>(BLANK)
  const [def, setDef] = useState({ approval_subject: '', approval_html: '', cycle_subject: '', cycle_html: '' })
  const [req, setReq] = useState<ShareForm>({ subject: '', sections: {}, intro: '', outro: '' })
  const [tc, setTc] = useState<ShareForm>({ subject: '', sections: {}, intro: '', outro: '' })
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ kind: string; msg: string }>({ kind: '', msg: '' })
  const [to, setTo] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const [a, b] = await Promise.all([
          apiFetch('/api/mail/config', { cache: 'no-store' }),
          apiFetch('/api/share-config', { cache: 'no-store' }),
        ])
        if (a.ok) {
          const j = (await a.json()) as {
            config?: Partial<Cfg>
            default_approval_subject?: string
            default_approval_html?: string
            default_cycle_subject?: string
            default_cycle_html?: string
          }
          setCfg({ ...BLANK, ...(j.config ?? {}) })
          setDef({
            approval_subject: j.default_approval_subject ?? '',
            approval_html: j.default_approval_html ?? '',
            cycle_subject: j.default_cycle_subject ?? '',
            cycle_html: j.default_cycle_html ?? '',
          })
        }
        if (b.ok) {
          const k = (await b.json()) as { req?: ShareForm; tc?: ShareForm }
          if (k.req) setReq(k.req)
          if (k.tc) setTc(k.tc)
        }
      } catch (e) {
        setNote({ kind: 'err', msg: e instanceof Error ? e.message : String(e) })
      }
    })()
  }, [])

  const set = <K extends keyof Cfg>(k: K, v: Cfg[K]) => setCfg((c) => ({ ...c, [k]: v }))

  const save = async () => {
    setBusy(true)
    setNote({ kind: '', msg: '' })
    try {
      const r = await apiFetch('/api/mail/config', { method: 'POST', body: JSON.stringify(cfg) })
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { detail?: string }).detail || '저장하지 못했습니다')
      // 공유 폼은 다른 곳에 산다 — 한 번 누르면 둘 다 저장한다
      const r2 = await apiFetch('/api/share-config', {
        method: 'POST',
        body: JSON.stringify({ req, tc }),
      })
      if (!r2.ok) throw new Error('공유 폼을 저장하지 못했습니다')
      setNote({ kind: 'ok', msg: '저장했습니다' })
    } catch (e) {
      setNote({ kind: 'err', msg: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  const test = async () => {
    if (!to.trim()) return
    setSending(true)
    setNote({ kind: '', msg: '' })
    try {
      const r = await apiFetch('/api/mail/test', { method: 'POST', body: JSON.stringify({ to }) })
      const b = (await r.json().catch(() => ({}))) as { detail?: string; sent?: string[] }
      if (!r.ok) throw new Error(b.detail || '보내지 못했습니다')
      setNote({ kind: 'ok', msg: `보냈습니다 — ${(b.sent ?? []).join(', ')}` })
    } catch (e) {
      setNote({ kind: 'err', msg: e instanceof Error ? e.message : String(e) })
    } finally {
      setSending(false)
    }
  }

  /** 공유 폼 한 갈래 — 요구사항·시험항목이 같은 모양이라 한 번만 그린다 */
  const shareTab = (
    which: 'req' | 'tc',
    form: ShareForm,
    setForm: (f: ShareForm) => void,
    secs: Array<[string, string]>,
  ) => (
    <div className="ml-card">
      <label className="fld">
        <span>제목</span>
        <input
          value={form.subject}
          placeholder="[ubiQuoss-TOP] {id} {title}"
          onChange={(e) => setForm({ ...form, subject: e.target.value })}
        />
        <i className="muted small">{'{id}'} · {'{title}'} 자리에 그 건의 ID·제목이 들어갑니다</i>
      </label>

      <div className="fld">
        <span>실어 보낼 것</span>
        <div className="ml-secs">
          {secs.map(([k, label]) => (
            <label key={k} className="ml-sec">
              <input
                type="checkbox"
                checked={form.sections[k] !== false}
                onChange={(e) => setForm({ ...form, sections: { ...form.sections, [k]: e.target.checked } })}
              />
              {label}
            </label>
          ))}
        </div>
        <i className="muted small">
          끄면 그 칸은 메일에 안 실립니다 — 받는 사람이 볼 필요 없는 것까지 보내면 읽지 않습니다
        </i>
      </div>

      <label className="fld">
        <span>머리말</span>
        <textarea
          rows={3}
          value={form.intro}
          placeholder={which === 'req' ? '예) 아래 요구사항을 검토 부탁드립니다.' : '예) 아래 시험항목을 공유드립니다.'}
          onChange={(e) => setForm({ ...form, intro: e.target.value })}
        />
      </label>
      <label className="fld">
        <span>맺음말</span>
        <textarea
          rows={3}
          value={form.outro}
          placeholder="예) 문의는 회신 주세요."
          onChange={(e) => setForm({ ...form, outro: e.target.value })}
        />
      </label>
    </div>
  )

  return (
    <div className="set-pane ml">
      <div className="set-head">
        <b>메일 설정</b>
        <span className="muted small">
          @멘션 알림·가입 승인 등 시스템 메일 발송에 씁니다. (관리자 전용)
        </span>
        <span className="sp" />
        {note.msg && <span className={`set-note ${note.kind}`}>{note.msg}</span>}
        <button className="btn primary" type="button" disabled={busy} onClick={() => void save()}>
          {busy ? '저장 중…' : '저장'}
        </button>
      </div>

      <SetTabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { k: 'smtp', label: '메일 설정', hint: '어디로 보내는가 — SMTP' },
          { k: 'signup', label: '가입 메일 폼', hint: '가입 승인 메일에 쓸 글' },
          { k: 'req', label: 'REQ 공유 폼', hint: '요구사항을 공유할 때 쓸 글' },
          { k: 'tc', label: 'TC 공유 폼', hint: '시험항목을 공유할 때 쓸 글' },
          { k: 'cycle', label: '사이클 배정 폼', hint: '담당자에게 배정을 알릴 때 쓸 글' },
        ]}
      />

      {tab === 'smtp' && (
        <>
          <div className="ml-card">
            <label className="ml-on">
              <input
                type="checkbox"
                checked={cfg.enabled}
                onChange={(e) => set('enabled', e.target.checked)}
              />
              <b>메일 발송 사용</b>
            </label>

            <div className="ml-row">
              <label className="fld ml-grow">
                <span>SMTP 서버</span>
                <input
                  value={cfg.host}
                  placeholder="portal.ubiquoss.com"
                  onChange={(e) => set('host', e.target.value)}
                />
              </label>
              <label className="fld ml-sm">
                <span>포트</span>
                <input
                  value={String(cfg.port ?? '')}
                  inputMode="numeric"
                  onChange={(e) => set('port', Number(e.target.value.replace(/\D/g, '')) || 0)}
                />
              </label>
              <label className="fld ml-md">
                <span>보안</span>
                <select value={cfg.security} onChange={(e) => set('security', e.target.value)}>
                  <option value="none">없음 (25)</option>
                  <option value="starttls">STARTTLS (587)</option>
                  <option value="ssl">SSL/TLS (465)</option>
                </select>
              </label>
            </div>

            <div className="ml-row">
              <label className="fld ml-grow">
                <span>계정(아이디)</span>
                <input value={cfg.username} onChange={(e) => set('username', e.target.value)} />
              </label>
              <label className="fld ml-grow">
                <span>비밀번호 / 앱 비밀번호</span>
                <input
                  type="password"
                  value={cfg.password}
                  onChange={(e) => set('password', e.target.value)}
                />
              </label>
            </div>

            <div className="ml-row">
              <label className="fld ml-grow">
                <span>발신 주소(From)</span>
                <input
                  value={cfg.from_addr}
                  placeholder="utop@ubiquoss.com"
                  onChange={(e) => set('from_addr', e.target.value)}
                />
              </label>
              <label className="fld ml-grow">
                <span>발신자 이름</span>
                <input value={cfg.from_name} onChange={(e) => set('from_name', e.target.value)} />
              </label>
            </div>

            <label className="fld">
              <span>로그인(앱) 주소 — 가입 승인 메일의 「로그인 하러 가기」 단추 링크</span>
              <input
                value={cfg.app_url}
                placeholder="예: http://220.1.1.253:9000 (비우면 단추 대신 안내문)"
                onChange={(e) => set('app_url', e.target.value)}
              />
            </label>
          </div>

          {/* 보내 보기 — 설정이 맞는지는 눌러 보기 전에는 알 수 없다 */}
          <div className="ml-card ml-test">
            <b className="small">테스트 발송</b>
            <div className="ml-row">
              <label className="fld ml-grow">
                <input
                  value={to}
                  placeholder="받는 사람 이메일"
                  onChange={(e) => setTo(e.target.value)}
                />
              </label>
              <button
                className="btn"
                type="button"
                disabled={sending || !to.trim()}
                onClick={() => void test()}
              >
                {sending ? '보내는 중…' : '테스트 메일 보내기'}
              </button>
            </div>
            <i className="muted small">
              먼저 위 설정을 <b>저장</b>한 뒤 테스트하세요. Gmail 은 2단계 인증 후 앱 비밀번호가 필요합니다.
            </i>
          </div>
        </>
      )}

      {tab === 'signup' && (
        <div className="ml-card">
          <label className="fld">
            <span>제목</span>
            <input
              value={cfg.approval_subject}
              placeholder={def.approval_subject}
              onChange={(e) => set('approval_subject', e.target.value)}
            />
          </label>
          <div className="ml-ph">
            <span>본문 (HTML)</span>
            <span className="sp" />
            <button
              className="btn small"
              type="button"
              disabled={!def.approval_html || cfg.approval_html === def.approval_html}
              title="처음 폼으로 되돌립니다"
              onClick={() => set('approval_html', def.approval_html)}
            >
              ↺ 기본값
            </button>
          </div>
          <textarea
            className="ml-code"
            rows={18}
            value={cfg.approval_html}
            placeholder="비우면 기본 폼을 씁니다"
            onChange={(e) => set('approval_html', e.target.value)}
          />
          <i className="muted small">
            자리표: {'{{name}}'} {'{{username}}'} {'{{email}}'} {'{{dept}}'} {'{{team}}'}{' '}
            {'{{position}}'} {'{{duty}}'} {'{{app_url}}'} {'{{login_button}}'}
          </i>
        </div>
      )}

      {tab === 'req' && shareTab('req', req, setReq, REQ_SEC)}
      {tab === 'tc' && shareTab('tc', tc, setTc, TC_SEC)}

      {tab === 'cycle' && (
        <div className="ml-card">
          <label className="fld">
            <span>제목</span>
            <input
              value={cfg.cycle_subject}
              placeholder={def.cycle_subject}
              onChange={(e) => set('cycle_subject', e.target.value)}
            />
          </label>
          <div className="ml-ph">
            <span>본문 (HTML)</span>
            <span className="sp" />
            <button
              className="btn small"
              type="button"
              disabled={!def.cycle_html || cfg.cycle_html === def.cycle_html}
              title="처음 폼으로 되돌립니다"
              onClick={() => set('cycle_html', def.cycle_html)}
            >
              ↺ 기본값
            </button>
          </div>
          <textarea
            className="ml-code"
            rows={18}
            value={cfg.cycle_html}
            placeholder="비우면 기본 폼을 씁니다"
            onChange={(e) => set('cycle_html', e.target.value)}
          />
          <i className="muted small">
            자리표: {'{{assignee}}'} {'{{model}}'} {'{{vgroup}}'} {'{{version}}'} {'{{period}}'}{' '}
            {'{{count}}'} {'{{items}}'} {'{{app_url}}'} {'{{login_button}}'}
          </i>
        </div>
      )}
    </div>
  )
}
