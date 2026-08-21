import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import PickCell from '@/components/PickCell'
import './Accounts.css'

/**
 * 계정 관리 — **누가 들어올 수 있나** 한 화면.
 *
 * 사원이 모두 Jira 계정을 갖고 있다. 그래서 UTOP 은 회원가입을 두지 않는다
 * (지시) — Jira 아이디·비밀번호로 그대로 들어오고, 처음 들어온 사람은 그
 * 자리에서 이 명단에 실린다. 비밀번호는 **어디에도 담지 않는다**. Jira 에서
 * 바꾸면 그날로 바뀐 것이 쓰인다.
 *
 * 그러니 이 화면이 하는 일은 「계정 만들기」 가 아니라 **역할과 잠금**이다.
 * 로컬 계정(비밀번호로 들어오는 계정)은 Jira 가 죽었을 때를 위한 비상용으로만
 * 남긴다 — admin 이 그것이다.
 */
interface User {
  username: string
  name?: string
  email?: string
  role?: string
  active?: boolean
  source?: string
  jira_key?: string
  dept?: string
  team?: string
  position?: string
  created_at?: string
  last_login?: string
}

interface JiraCfg {
  url?: string
  login_enabled?: boolean
  login_auto_create?: boolean
}

/** 지금 Jira 로그인이 되는 상태인가 — 안 되는 까닭을 셋으로 가른다 */
interface LoginCheck {
  enabled: boolean
  url: string
  auto_create: boolean
  reachable?: boolean
  status?: number
  reason?: string
  cloud?: boolean
  last_fail?: { user?: string; why?: string; at?: string } | null
}

export default function Accounts() {
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [only, setOnly] = useState<'all' | 'jira' | 'local' | 'off'>('all')
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const say = (kind: 'ok' | 'err', text: string) => {
    setMsg({ kind, text })
    window.setTimeout(() => setMsg(null), 2600)
  }

  const users = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const r = await apiFetch('/api/users')
      if (!r.ok) throw new Error(await r.text())
      return (await r.json()) as { users: User[]; roles: string[] }
    },
  })
  const jira = useQuery({
    queryKey: ['jira-cfg'],
    queryFn: async () => {
      const r = await apiFetch('/api/jira/config')
      if (!r.ok) throw new Error(await r.text())
      return (await r.json()) as JiraCfg
    },
  })

  const chk = useQuery({
    queryKey: ['jira-login-check'],
    queryFn: async () => {
      const r = await apiFetch('/api/jira/login-check')
      if (!r.ok) throw new Error(await r.text())
      return (await r.json()) as LoginCheck
    },
    refetchOnWindowFocus: false,
  })

  const patch = useMutation({
    mutationFn: async ({ username, body }: { username: string; body: Partial<User> }) => {
      const r = await apiFetch(`/api/users/${encodeURIComponent(username)}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      })
      if (!r.ok) throw new Error((await r.text()) || '저장하지 못했습니다')
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users'] })
      say('ok', '고쳤습니다')
    },
    onError: (e: Error) => say('err', String(e.message).slice(0, 160)),
  })

  const drop = useMutation({
    mutationFn: async (username: string) => {
      const r = await apiFetch(`/api/users/${encodeURIComponent(username)}`, { method: 'DELETE' })
      if (!r.ok) throw new Error((await r.text()) || '지우지 못했습니다')
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users'] })
      say('ok', '지웠습니다')
    },
    onError: (e: Error) => say('err', String(e.message).slice(0, 160)),
  })

  const roles = users.data?.roles ?? ['관리자', '담당', '팀장', '팀원']
  const rows = useMemo(() => {
    const all = users.data?.users ?? []
    const key = q.trim().toLowerCase()
    return all
      .filter((u) => {
        if (only === 'jira' && u.source !== 'jira') return false
        if (only === 'local' && u.source === 'jira') return false
        if (only === 'off' && u.active !== false) return false
        if (!key) return true
        return [u.username, u.name, u.email, u.dept, u.team]
          .map((x) => String(x ?? '').toLowerCase())
          .some((x) => x.includes(key))
      })
      .sort((a, b) => String(a.username).localeCompare(String(b.username)))
  }, [users.data, q, only])

  const cfg = jira.data ?? {}
  const on = !!cfg.login_enabled && !!String(cfg.url ?? '').trim()
  /* 자동 등록은 안 정했으면 켜짐이다 — 서버(_jira_auto_create)와 같은 기본값 */
  const auto = cfg.login_auto_create !== false
  const nJira = (users.data?.users ?? []).filter((u) => u.source === 'jira').length
  const nOff = (users.data?.users ?? []).filter((u) => u.active === false).length

  return (
    <div className="acc">
      <div className="acc-head">
        <b>계정 관리</b>
        <span className="muted small">
          비밀번호는 UTOP 에 담지 않습니다 — Jira 로 들어오고, 여기서는 <b>역할과 잠금</b>만
          정합니다.
        </span>
        <span className="sp" />
        {msg && <span className={`acc-note ${msg.kind}`}>{msg.text}</span>}
      </div>

      {/* 설정은 「Jira 연동」 한 곳에 있다(지시). 여기서는 **지금 어떤
          상태인지**만 말한다 — 명단을 보는 사람도 그것은 알아야 한다. */}
      <div className="acc-card">
        <div className="acc-row">
          <span className={`acc-dot ${on ? 'ok' : 'off'}`} />
          <b>Jira 계정으로 로그인</b>
          <span className="muted small">
            {on ? (
              <>
                켜짐 — <code>{cfg.url}</code> · 처음 들어온 사람{' '}
                {auto ? '자동 등록함' : '자동 등록 안 함(명단에 있는 사람만)'} · 기존 계정은 UTOP
                비밀번호로 그대로 들어옵니다.
              </>
            ) : (
              <>꺼짐 — 지금은 UTOP 비밀번호로만 들어옵니다.</>
            )}
          </span>
          <span className="sp" />
          {chk.data?.last_fail?.user && (
            <span className="acc-chk warn" title={chk.data.last_fail.at}>
              마지막 거절: <b>{chk.data.last_fail.user}</b> ·{' '}
              {chk.data.last_fail.why === 'denied'
                ? 'Jira 가 받지 않음'
                : chk.data.last_fail.why === 'captcha'
                  ? 'CAPTCHA'
                  : chk.data.last_fail.why === 'unreachable'
                    ? 'Jira 에 못 닿음'
                    : chk.data.last_fail.why}
            </span>
          )}
          <span className="muted small">설정은 SETUP → Jira 연동</span>
        </div>
      </div>

      <div className="acc-bar">
        <input
          className="acc-find"
          value={q}
          placeholder="아이디 · 이름 · 메일 찾기"
          onChange={(e) => setQ(e.target.value)}
        />
        {(
          [
            ['all', `전체 ${users.data?.users.length ?? 0}`],
            ['jira', `Jira ${nJira}`],
            ['local', '로컬'],
            ['off', `잠김 ${nOff}`],
          ] as Array<[typeof only, string]>
        ).map(([k, lb]) => (
          <button
            key={k}
            type="button"
            className={`acc-tab${only === k ? ' on' : ''}`}
            onClick={() => setOnly(k)}
          >
            {lb}
          </button>
        ))}
        <span className="sp" />
        <span className="muted small">{rows.length}명</span>
      </div>

      <div className="acc-card grow">
        <div className="acc-scroll">
          <table className="acc-tbl">
            <colgroup>
              <col className="c-id" />
              <col className="c-name" />
              <col className="c-mail" />
              <col className="c-org" />
              <col className="c-role" />
              <col className="c-src" />
              <col className="c-when" />
              <col className="c-act" />
            </colgroup>
            <thead>
              <tr>
                <th>아이디</th>
                <th>이름</th>
                <th>메일</th>
                <th>소속</th>
                <th>역할</th>
                <th>들어오는 길</th>
                <th>마지막 로그인</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.isLoading && (
                <tr>
                  <td colSpan={8} className="muted">
                    읽는 중…
                  </td>
                </tr>
              )}
              {!users.isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="muted">
                    없습니다.
                  </td>
                </tr>
              )}
              {rows.map((u) => (
                <tr key={u.username} className={u.active === false ? 'off' : ''}>
                  <td className="mono">{u.username}</td>
                  <td className="ell" title={u.name ?? ''}>
                    {u.name || <span className="muted">–</span>}
                  </td>
                  <td className="ell" title={u.email ?? ''}>
                    {u.email || <span className="muted">–</span>}
                  </td>
                  <td className="ell" title={`${u.dept ?? ''} ${u.team ?? ''}`.trim()}>
                    {[u.dept, u.team].filter(Boolean).join(' · ') || <span className="muted">–</span>}
                  </td>
                  <td>
                    <PickCell
                      value={u.role ?? '팀원'}
                      opts={roles}
                      onSave={(v) => patch.mutate({ username: u.username, body: { role: v } })}
                    />
                  </td>
                  <td>
                    {u.source === 'jira' ? (
                      <span className="acc-tag jira" title={u.jira_key ? `Jira key: ${u.jira_key}` : 'Jira 계정'}>
                        Jira
                      </span>
                    ) : (
                      <span className="acc-tag local" title="UTOP 비밀번호로 들어옵니다 (비상 계정)">
                        로컬
                      </span>
                    )}
                  </td>
                  <td className="muted small">
                    {u.last_login || <span title={u.created_at ?? ''}>–</span>}
                  </td>
                  <td className="acc-act">
                    {/* 잠금이 삭제보다 먼저다 — 지우면 그 사람이 남긴 기록의
                        이름이 어디를 가리키는지 알 수 없게 된다 */}
                    <button
                      type="button"
                      className={`acc-lock${u.active === false ? ' on' : ''}`}
                      title={u.active === false ? '잠금 풀기' : '잠그기 — 못 들어옵니다'}
                      onClick={() =>
                        patch.mutate({
                          username: u.username,
                          body: { active: u.active === false },
                        })
                      }
                    >
                      {u.active === false ? '잠김' : '허용'}
                    </button>
                    {u.username !== 'admin' && (
                      <button
                        type="button"
                        className="acc-x"
                        title="지우기"
                        onClick={() => {
                          if (
                            window.confirm(
                              `${u.username} 을 지웁니다.\n\nJira 로 다시 들어오면 새로 실립니다(자동 등록이 켜져 있을 때).`,
                            )
                          )
                            drop.mutate(u.username)
                        }}
                      >
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
