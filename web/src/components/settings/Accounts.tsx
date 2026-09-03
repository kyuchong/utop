import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { IconEdit, IconTrash } from '@/components/icons'
import './Accounts.css'

/**
 * 계정 관리 — **Jira 사용자가 곧 UTOP 사용자**다.
 *
 * 사원이 모두 Jira 계정을 갖고 있다. 그래서 회원가입을 두지 않는다(지시):
 * Jira 아이디·비밀번호로 그대로 들어오고, 명단은 Jira 에서 **끌어온다**.
 * 예전 UTOP 의 「사용자 관리」 가 하던 일이 이것이라 그 화면을 옮겨 왔다.
 *
 * 무엇이 어디 것인지는 갈라 둔다.
 *
 *   Jira 가 정본 : 누가 있는가 · 이름 · 메일 · Jira 활성 · **비밀번호**
 *   UTOP 이 정본 : 역할(권한) · 잠금 · 소속·직책 같은 우리 쪽 칸
 *
 * 그래서 동기화는 역할과 잠금을 **덮지 않는다.** 관리자가 정한 것을 Jira 가
 * 지우면 안 된다.
 */
interface User {
  username: string
  /** 'jira' 면 동기화가 잠근 것 — 관리자가 잠근 것과 갈라 둔다 */
  locked_by?: string
  name?: string
  email?: string
  role?: string
  active?: boolean
  source?: string
  jira_key?: string
  jira_active?: boolean
  /** 나간 사람인가 — 서버가 판정한다(Jira 비활성 또는 이름의 「퇴사」 표기) */
  retired?: boolean
  /** 조직 — 소속(dept)이 있으면 그것, 없으면 이름 괄호에서 (서버가 준다) */
  org?: string
  company?: string
  dept?: string
  team?: string
  position?: string
  duty?: string
  created_at?: string
  last_login?: string
  synced_at?: string
}

interface SyncStat {
  at?: string
  found?: number
  new?: number
  changed?: number
  /** Jira 에서 나가 이번에 잠근 사람 */
  locked?: number
  /** Jira 로 돌아와 잠금을 푼 사람 */
  unlocked?: number
  /** Jira 팀장/그룹장 그룹에서 직급이 팀장으로 잡힌 사람 */
  leads?: number
  active?: number
  inactive?: number
}

interface SyncInfo {
  url?: string
  /** 로그인을 물어보는 Jira — 이슈용과 다를 수 있다 */
  login_url?: string
  user?: string
  login_enabled?: boolean
  auto_create?: boolean
  last?: SyncStat | null
}

interface LoginCheck {
  enabled: boolean
  url: string
  auto_create: boolean
  reachable?: boolean
  status?: number
  reason?: string
  cloud?: boolean
  cert?: boolean
  last_fail?: { user?: string; why?: string; at?: string } | null
}

type StFilter = 'all' | 'active' | 'off' | 'jira' | 'local'

/** 조직도 한 마디 — 회사·그룹·담당·팀. 잎에 사람이 달린다 */
/** 계정 이름의 꼬리를 뗀다 — 「강경묵(생산)」 → 「강경묵」. 조직도는 꼬리
    없는 이름을 쓰므로, 옮길 때 이 이름으로 찾는다. */
const nameOnly = (v?: string) => (String(v ?? '').split(/[([_]/)[0] ?? '').trim()

interface OrgNode {
  name: string
  count?: number
  lead?: string | null
  members?: Array<{ name: string; rank?: string; role?: string }>
  children?: OrgNode[]
}

const FIELDS: Array<{ k: keyof User; label: string }> = [
  { k: 'name', label: '이름' },
  { k: 'email', label: '이메일' },
  { k: 'company', label: '회사' },
  { k: 'dept', label: '소속담당' },
  { k: 'team', label: '소속팀' },
  { k: 'position', label: '직책' },
  { k: 'duty', label: '보직' },
]

export default function Accounts() {
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [st, setSt] = useState<StFilter>('all')
  const [role, setRole] = useState('')
  const [dept, setDept] = useState('')
  /** 퇴사자(Jira 비활성) 숨김 — 기본 켜짐(지시: 표에서 제거). 데이터는 두고 화면만 */
  const [hideRetired, setHideRetired] = useState(true)
  const [at, setAt] = useState('')
  const [draft, setDraft] = useState<Partial<User>>({})
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const say = (kind: 'ok' | 'err', text: string) => {
    setMsg({ kind, text })
    window.setTimeout(() => setMsg(null), 3000)
  }
  /** Jira 로그인 확인 — 비밀번호는 확인에만 쓰고 담지 않는다 */
  const [tId, setTId] = useState('')
  const [tPw, setTPw] = useState('')
  const [tOut, setTOut] = useState<{ ok: boolean; text: string } | null>(null)

  const users = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const r = await apiFetch('/api/users')
      if (!r.ok) throw new Error(await r.text())
      return (await r.json()) as { users: User[]; roles: string[] }
    },
  })
  const info = useQuery({
    queryKey: ['jira-sync'],
    queryFn: async () => {
      const r = await apiFetch('/api/users/jira-sync')
      if (!r.ok) throw new Error(await r.text())
      return (await r.json()) as SyncInfo
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

  const sync = useMutation({
    mutationFn: async () => {
      const r = await apiFetch('/api/users/jira-sync', { method: 'POST', body: '{}' })
      const j = (await r.json()) as SyncStat & { ok: boolean; error?: string }
      if (!r.ok || !j.ok) throw new Error(j.error || '동기화하지 못했습니다')
      return j
    },
    onSuccess: (j) => {
      void qc.invalidateQueries({ queryKey: ['users'] })
      void qc.invalidateQueries({ queryKey: ['jira-sync'] })
      say(
        'ok',
        `Jira 사용자 ${j.found}명 — 새로 ${j.new}명 · 고침 ${j.changed}명` +
          `${j.leads ? ` · 팀장 ${j.leads}명` : ''}` +
          `${j.locked ? ` · 비활성 잠금 ${j.locked}명` : ''}` +
          `${j.unlocked ? ` · 잠금 해제 ${j.unlocked}명` : ''}`,
      )
    },
    onError: (e: Error) => say('err', String(e.message).slice(0, 200)),
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
      say('ok', '저장했습니다')
    },
    onError: (e: Error) => say('err', String(e.message).slice(0, 200)),
  })

  const drop = useMutation({
    mutationFn: async (username: string) => {
      const r = await apiFetch(`/api/users/${encodeURIComponent(username)}`, { method: 'DELETE' })
      if (!r.ok) throw new Error((await r.text()) || '지우지 못했습니다')
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users'] })
      setAt('')
      say('ok', '지웠습니다')
    },
    onError: (e: Error) => say('err', String(e.message).slice(0, 200)),
  })

  const test = async () => {
    setTOut(null)
    const r = await apiFetch('/api/jira/login-test', {
      method: 'POST',
      body: JSON.stringify({ username: tId.trim(), password: tPw }),
    })
    const j = (await r.json()) as {
      ok: boolean
      error?: string
      in_utop?: boolean
      auto_create?: boolean
      jira?: { username: string; name: string; email: string; active?: boolean }
    }
    setTPw('') // 확인이 끝나면 그 자리에서 지운다
    if (!j.ok) {
      setTOut({ ok: false, text: j.error || '확인하지 못했습니다' })
      return
    }
    const who = `${j.jira?.name || j.jira?.username} (${j.jira?.username})`
    const tail = j.in_utop
      ? '명단에 있습니다 — 이대로 로그인됩니다'
      : j.auto_create
        ? '명단에는 없지만 처음 로그인할 때 자동으로 실립니다'
        : '명단에 없습니다 — 자동 등록이 꺼져 있어 지금은 막힙니다'
    setTOut({ ok: true, text: `Jira 로 확인됐습니다: ${who} · ${tail}` })
  }

  const roles = users.data?.roles ?? ['관리자', '담당', '팀장', '팀원']
  const all = useMemo(() => users.data?.users ?? [], [users.data])
  /* 소속은 **사람 많은 순**으로. 이름순이면 1명짜리가 맨 위에 오고 정작
     17명짜리를 찾으러 끝까지 훑어야 한다. */
  const depts = useMemo(() => {
    const n = new Map<string, number>()
    for (const u of all) {
      const d = String(u.dept || '').trim()
      if (d) n.set(d, (n.get(d) ?? 0) + 1)
    }
    return [...n.keys()].sort((a, b) => (n.get(b) ?? 0) - (n.get(a) ?? 0) || a.localeCompare(b))
  }, [all])
  const [deptOpen, setDeptOpen] = useState(false)
  const rows = useMemo(() => {
    const key = q.trim().toLowerCase()
    return all
      .filter((u) => {
        // 퇴사자(Jira 비활성)는 표에서 뺀다(지시). 다만 상태 「잠김」 을
        // 일부러 보고 있을 땐 숨기지 않는다 — 그건 그걸 보러 간 것이다.
        if (hideRetired && st !== 'off' && (u.retired ?? u.jira_active === false)) return false
        if (st === 'active' && u.active === false) return false
        if (st === 'off' && u.active !== false) return false
        if (st === 'jira' && u.source !== 'jira') return false
        if (st === 'local' && u.source === 'jira') return false
        if (role && u.role !== role) return false
        if (dept && String(u.dept || '') !== dept) return false
        if (!key) return true
        return [u.username, u.name, u.email, u.dept, u.team]
          .map((x) => String(x ?? '').toLowerCase())
          .some((x) => x.includes(key))
      })
      .sort((a, b) => String(a.name || a.username).localeCompare(String(b.name || b.username)))
  }, [all, q, st, role, dept, hideRetired])

  const cur = all.find((u) => u.username === at) ?? null
  const val = (k: keyof User) => String((draft[k] ?? cur?.[k] ?? '') as string)
  const pick = (u: User) => {
    setAt(u.username)
    setAtOrg(null)
    setDraft({})
  }

  const nOff = all.filter((u) => u.active === false).length
  const nRetired = all.filter((u) => u.retired ?? u.jira_active === false).length

  /**
   * 조직도 — 회사 → 그룹 → 담당 → 팀 → 사람(직급). 사람이 준 표가 정본이다.
   * **직급은 Jira 에 없다**(확인함) — 이 표에만 있다.
   */
  const orgQ = useQuery({
    queryKey: ['org'],
    staleTime: 60_000,
    queryFn: async () => {
      const r = await apiFetch('/api/org')
      if (!r.ok) return null
      return ((await r.json()) as { org: OrgNode | null }).org
    },
  })

  /** 계정 이름은 「강경묵(생산)」 처럼 꼬리를 단다 — 괄호·밑줄 앞까지만 본다 */
  const nameKey = (v?: string) =>
    (String(v ?? '').split(/[([_]/)[0] ?? '').replace(/\s+/g, '')
  const acctBy = useMemo(() => {
    const m = new Map<string, User>()
    for (const u of all) {
      const k = nameKey(u.name || u.username)
      if (k && !m.has(k)) m.set(k, u)
    }
    return m
  }, [all])
  const findAcct = (nm: string) =>
    acctBy.get(nameKey(nm)) ?? acctBy.get(nameKey(nm.replace(/\d+$/, '')))

  /* 왼쪽 레일의 상태·역할·소속 필터를 **조직도 표에도** 먹인다.
     표가 조직도로 바뀌면서 OrgRows 가 검색어만 보고 있었다 — 그래서
     「Jira 계정」·「UTOP 계정」 을 눌러도 표가 그대로였다(지적). */
  const okNames = useMemo(() => {
    const s = new Set<string>()
    for (const u of all) {
      if (hideRetired && st !== 'off' && (u.retired ?? u.jira_active === false)) continue
      if (st === 'active' && u.active === false) continue
      if (st === 'off' && u.active !== false) continue
      if (st === 'jira' && u.source !== 'jira') continue
      if (st === 'local' && u.source === 'jira') continue
      if (role && u.role !== role) continue
      if (dept && String(u.dept || '') !== dept) continue
      s.add(nameKey(u.name || u.username))
    }
    return s
  }, [all, st, role, dept, hideRetired])
  /* 좁히지 않았을 땐 **계정 없는 사람도 남긴다** — 「누가 아직 UTOP 을 안
     쓰나」 가 이 표의 값어치다. 좁혔을 땐 계정의 성질을 묻는 것이므로
     계정 없는 사람은 답이 없어 빠진다. (퇴사 숨김은 좁힘으로 안 친다) */
  const narrow = st !== 'all' || !!role || !!dept
  const keep = useMemo(() => {
    const f = (nm: string) => {
      const u = acctBy.get(nameKey(nm)) ?? acctBy.get(nameKey(nm.replace(/\d+$/, '')))
      if (!u) return !narrow
      return okNames.has(nameKey(u.name || u.username))
    }
    return f
  }, [acctBy, okNames, narrow])

  const org = orgQ.data ?? null

  /* 계정 없는 사람 — 조직도 40명은 계정이 아예 없다(확인함). 그래도 역할은
     적어야 하므로(지시) 줄을 고를 수 있게 하고, 역할은 조직도에 담는다. */
  const [atOrg, setAtOrg] = useState<{ name: string; rank: string; org: string } | null>(null)
  const orgRole = useMemo(() => {
    const m = new Map<string, string>()
    const walk = (n: OrgNode) => {
      for (const x of n.members ?? []) if (x.role) m.set(x.name, x.role)
      for (const c of n.children ?? []) walk(c)
    }
    if (org) walk(org)
    return m
  }, [org])
  /* 조직도에 없는 계정 — **45개나 된다**(admin·qag 를 비롯해 조직도에 이름이
     없는 사람들). 표가 조직도만 그리니 이들은 어느 칸을 눌러도 나올 자리가
     없었다(지적: UTOP 계정 고르면 아무것도 안 나온다). 트리 끝에 따로 낸다. */
  const orgNames = useMemo(() => {
    const s2 = new Set<string>()
    const walk = (n: OrgNode) => {
      const L = leadOf(n)
      if (L) s2.add(nameKey(L.name))
      for (const m of n.members ?? []) s2.add(nameKey(m.name))
      for (const c of n.children ?? []) walk(c)
    }
    if (org) walk(org)
    return s2
  }, [org])
  const loose = useMemo(
    () => rows.filter((u) => !orgNames.has(nameKey(u.name || u.username))),
    [rows, orgNames],
  )

  /* 조직도 고치기 — 만들기·이름 바꾸기·지우기·사람 옮기기. 한 곳으로 모아
     둔다: 넷 다 조직도 하나를 고쳐 다시 읽는 같은 일이다. */
  const orgEdit = useMutation({
    mutationFn: async (b: { at: string; body: unknown }) => {
      const r = await apiFetch(`/api/org/${b.at}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(b.body),
      })
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { detail?: string }).detail || '고치지 못했습니다')
      return r.json()
    },
    onSuccess: () => void orgQ.refetch(),
    onError: (e) => window.alert(String((e as Error).message)),
  })
  /** 옮길 곳 고르기용 — 모든 조직의 이름 길 */
  const orgPaths = useMemo(() => {
    const out: Array<{ path: string[]; label: string }> = []
    const walk = (n: OrgNode, path: string[]) => {
      const p = [...path, n.name]
      if (p.length > 1) out.push({ path: p, label: p.slice(1).join(' › ') })
      for (const c of n.children ?? []) walk(c, p)
    }
    if (org) walk(org, [])
    return out
  }, [org])
  /**
   * 이 사람이 지금 어느 조직에 있나 — 옮기기 칸의 처음 값.
   *
   * **장(長)도 함께 본다.** 조직도는 장을 `lead`, 팀원을 `members` 로 따로
   * 담는다. 팀원만 훑었더니 윤경수 같은 장이 전부 「조직도에 없음」 으로
   * 나왔다(지적) — 정작 그 조직의 장인데.
   */
  const orgOf = useMemo(() => {
    const m = new Map<string, string>()
    const lead = new Set<string>()
    const walk = (n: OrgNode, path: string[]) => {
      const p = [...path, n.name]
      const label = p.slice(1).join(' › ')
      const L = leadOf(n)
      if (L) {
        lead.add(nameKey(L.name))
        if (!m.has(nameKey(L.name))) m.set(nameKey(L.name), label)
      }
      for (const x of n.members ?? []) m.set(nameKey(x.name), label)
      for (const c of n.children ?? []) walk(c, p)
    }
    if (org) walk(org, [])
    return { at: m, lead }
  }, [org])

  const seedOrg = useMutation({
    mutationFn: async (force: boolean) => {
      const r = await apiFetch('/api/org/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      })
      const j = (await r.json().catch(() => ({}))) as {
        ok?: boolean; had?: boolean; nodes?: number; people?: number
        role_up?: number; detail?: string; name?: string
      }
      if (!r.ok) throw new Error(j.detail || '심지 못했습니다')
      return j
    },
    onSuccess: (j, force) => {
      if (j.ok) {
        window.alert(
          `조직도를 심었습니다 — 조직 ${j.nodes}개 · 사람 ${j.people}명` +
            (j.role_up ? `\n장 ${j.role_up}명의 역할을 담당으로 맞췄습니다.` : ''),
        )
        void orgQ.refetch()
        void users.refetch()
        return
      }
      // 이미 있다 — 덮을지 물어본다. 물어보지 않고 덮으면 이 서버에서
      // 옮겨 놓은 조직이 통째로 날아간다.
      if (!force && window.confirm(`이 서버에는 이미 조직도가 있습니다(${j.name ?? ''}).\n코드에 실린 조직도로 덮어쓸까요? 여기서 옮겨 놓은 것은 사라집니다.`))
        seedOrg.mutate(true)
    },
    onError: (e) => window.alert(String((e as Error).message)),
  })

  const setOrgRole = useMutation({
    mutationFn: async (b: { name: string; role: string }) => {
      const r = await apiFetch('/api/org/member-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(b),
      })
      if (!r.ok) throw new Error(await r.text())
      return r.json()
    },
    onSuccess: () => void orgQ.refetch(),
  })

  /** 접어 둔 조직 */
  const [shutOrg, setShutOrg] = useState<Set<string>>(new Set())
  const toggleOrg = (k: string) =>
    setShutOrg((o) => {
      const n = new Set(o)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })

  /**
   * 조직별 묶음 — 사람 많은 조직이 위로. 「소속 없음」 은 늘 맨 아래다:
   * 채워야 할 것이지 먼저 볼 것이 아니다.
   */
  const nJira = all.filter((u) => u.source === 'jira').length
  const last = info.data?.last ?? null
  const on = !!info.data?.login_enabled
  const ok3 = !!chk.data?.reachable

  return (
    <div className="acc">
      <div className="acc-head">
        <b>계정 관리</b>
        <span className="acc-pill">전체 {all.length}명</span>
        <span className="muted small">
          Jira 사용자가 곧 UTOP 사용자입니다 — 비밀번호는 Jira 가 갖고 있고, 여기서는{' '}
          <b>권한과 잠금</b>을 정합니다.
        </span>
        <span className="sp" />
        {msg && <span className={`acc-note ${msg.kind}`}>{msg.text}</span>}
      </div>

      {/* Jira 연결 — 이 줄을 못 읽으면 명단을 봐도 소용없다 */}
      <div className="acc-card">
        <div className="acc-row">
          <span className={`acc-dot ${on && ok3 ? 'ok' : 'off'}`} />
          <b>{on && ok3 ? 'Jira 연결 정상' : on ? 'Jira 연결 확인 필요' : 'Jira 로그인 꺼짐'}</b>
          {info.data?.login_url && <code title="로그인을 물어보는 Jira">{info.data.login_url}</code>}
          {info.data?.url && info.data.url.replace(/\/$/, '') !== info.data.login_url && (
            <span className="muted small" title="이슈 등록·조회에 쓰는 Jira">
              이슈 {info.data.url}
            </span>
          )}
          {info.data?.user && <span className="muted small">조회 계정 {info.data.user}</span>}
          <span className="muted small">
            처음 들어온 사람 {info.data?.auto_create ? '자동 등록함' : '자동 등록 안 함'}
          </span>
          <span className="sp" />
          <span className="muted small">설정은 SETUP → Jira 연동</span>
          {/* 조직도 받아오기 — 시작할 때 자동으로 심지만(비어 있을 때만),
              그게 안 먹은 서버에서는 확인할 길이 없었다(253 지적). 눌러서
              심고 **결과를 눈으로 보게** 한다. */}
          <button
            className="btn small"
            type="button"
            disabled={seedOrg.isPending}
            title="이 서버에 조직도가 없으면 코드에 실린 조직도를 심습니다"
            onClick={() => seedOrg.mutate(false)}
          >
            {seedOrg.isPending ? '심는 중…' : '조직도 받아오기'}
          </button>
          <button
            className="btn primary small"
            type="button"
            disabled={sync.isPending || !info.data?.url}
            onClick={() => sync.mutate()}
          >
            {sync.isPending ? '불러오는 중…' : 'Jira 사용자 동기화'}
          </button>
        </div>

        <div className="acc-row sub">
          {last?.at ? (
            <>
              <span className="muted small">마지막 동기화</span>
              <b>{last.at}</b>
              <span className="muted small">
                Jira 사용자 {last.found}명 · 활성 {last.active} · 비활성 {last.inactive} — 지난번
                새로 {last.new}명 · 고침 {last.changed}명{last.leads ? ` · 팀장 ${last.leads}명` : ''} · 비활성 잠금 {last.locked ?? 0}명
              </span>
            </>
          ) : (
            <span className="muted small">
              아직 한 번도 안 불러왔습니다 — 「Jira 사용자 동기화」 를 누르면 Jira 명단을
              가져옵니다.
            </span>
          )}
          {chk.data && !ok3 && (
            <span className="acc-chk bad">{chk.data.reason || 'Jira 에 닿지 못했습니다'}</span>
          )}
          {chk.data?.cert && (
            <span className="acc-chk warn">
              인증서 문제입니다 — Jira 연동에서 「TLS 인증서 검증」 을 끄거나 갱신하세요
            </span>
          )}
        </div>

        {/* 「저 사람은 왜 안 되나」 를 여기서 눌러 본다. 비밀번호는 안 담는다 */}
        <div className="acc-row sub">
          <span className="muted small">Jira 계정으로 로그인 되는지 확인</span>
          <input
            className="acc-in"
            value={tId}
            placeholder="Jira 아이디"
            onChange={(e) => setTId(e.target.value)}
          />
          <input
            className="acc-in"
            type="password"
            value={tPw}
            placeholder="Jira 비밀번호"
            autoComplete="off"
            onChange={(e) => setTPw(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && tId && tPw && void test()}
          />
          <button
            className="btn small"
            type="button"
            disabled={!tId.trim() || !tPw}
            onClick={() => void test()}
          >
            확인
          </button>
          {tOut && <span className={`acc-chk ${tOut.ok ? 'ok' : 'bad'}`}>{tOut.text}</span>}
          <span className="muted small">비밀번호는 확인에만 쓰고 어디에도 담지 않습니다</span>
        </div>
      </div>

      <div className="acc-main">
        {/* 왼쪽 — 상태·역할·소속으로 좁힌다 */}
        <nav className="acc-rail">
          <div className="acc-railt">상태</div>
          {(
            [
              ['all', '전체', all.length],
              ['active', '활성', all.length - nOff],
              ['off', '잠김', nOff],
              ['jira', 'Jira 계정', nJira],
              ['local', 'UTOP 계정', all.length - nJira],
            ] as Array<[StFilter, string, number]>
          ).map(([k, lb, n]) => (
            <button
              key={k}
              type="button"
              className={`acc-railb${st === k ? ' on' : ''}`}
              onClick={() => setSt(k)}
            >
              <span>{lb}</span>
              <em>{n}</em>
            </button>
          ))}

          <div className="acc-railt">역할</div>
          <button
            type="button"
            className={`acc-railb${role === '' ? ' on' : ''}`}
            onClick={() => setRole('')}
          >
            <span>전체 역할</span>
            <em>{all.length}</em>
          </button>
          {roles.map((r) => (
            <button
              key={r}
              type="button"
              className={`acc-railb${role === r ? ' on' : ''}`}
              onClick={() => setRole(r)}
            >
              <span>{r}</span>
              <em>{all.filter((u) => u.role === r).length}</em>
            </button>
          ))}

          {depts.length > 0 && (
            <>
              <div className="acc-railt">소속담당</div>
              <button
                type="button"
                className={`acc-railb${dept === '' ? ' on' : ''}`}
                onClick={() => setDept('')}
              >
                <span>전체 소속</span>
                <em>{all.length}</em>
              </button>
              {/* 소속이 30개가 넘는다. 다 펼치면 레일이 화면 두 배 높이가 돼
                  위쪽 상태·역할이 스크롤 밖으로 밀린다 — 정작 자주 쓰는 게
                  그 둘이다. 사람 많은 순으로 8개만 두고 나머지는 접는다.
                  고른 소속은 접혀 있어도 늘 보인다. */}
              {depts
                .filter((d, i) => deptOpen || i < 8 || d === dept)
                .map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`acc-railb${dept === d ? ' on' : ''}`}
                    onClick={() => setDept(d)}
                  >
                    <span>{d}</span>
                    <em>{all.filter((u) => u.dept === d).length}</em>
                  </button>
                ))}
              {depts.length > 8 && (
                <button
                  type="button"
                  className="acc-railmore"
                  onClick={() => setDeptOpen((v) => !v)}
                >
                  {deptOpen ? '접기' : `더 보기 ${depts.length - 8}`}
                </button>
              )}
            </>
          )}
        </nav>

        {/* 가운데 — 명단 */}
        <div className="acc-card grow">
          <div className="acc-bar">
            <span className="muted small">사용자 {rows.length}명</span>
            {nRetired > 0 && (
              <>
                <label className="acc-hideret" title="Jira 에서 나간 사람(퇴사자)을 목록에서 뺍니다. 기록은 그대로 남습니다.">
                  <input
                    type="checkbox"
                    checked={hideRetired}
                    onChange={(e) => setHideRetired(e.target.checked)}
                  />
                  퇴사자 숨김 <em>{nRetired}</em>
                </label>
                <button
                  className="btn small danger acc-delret"
                  type="button"
                  title="Jira 에서 나간 사람을 명단에서 완전히 지웁니다. 과거 기록의 이름은 남습니다."
                  onClick={async () => {
                    if (
                      !window.confirm(
                        `Jira 비활성(퇴사자) ${nRetired}명을 명단에서 지웁니다.\n` +
                          '과거 시험 기록의 이름은 남습니다. 다음 동기화에서도 다시 만들지 않습니다.\n계속할까요?',
                      )
                    )
                      return
                    const r = await apiFetch('/api/users/delete-retired', { method: 'POST' })
                    const j = (await r.json().catch(() => ({}))) as { deleted?: number; detail?: string }
                    if (!r.ok) window.alert(j.detail || '지우지 못했습니다')
                    else window.alert(`${j.deleted ?? 0}명을 지웠습니다.`)
                    await users.refetch()
                  }}
                >
                  퇴사자 삭제
                </button>
              </>
            )}
            <span className="sp" />
            <input
              className="acc-find"
              value={q}
              placeholder="이름 · 아이디 · 이메일 · 소속으로 찾기"
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="acc-scroll">
            <table className="acc-tbl">
              <colgroup>
                <col className="c-name" />
                <col className="c-id" />
                <col className="c-role" />
                <col className="c-org" />
                <col className="c-when" />
                <col className="c-mail" />
              </colgroup>
              <tbody>
                {users.isLoading && (
                  <tr>
                    <td colSpan={6} className="muted">
                      읽는 중…
                    </td>
                  </tr>
                )}
                {!users.isLoading && rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted">
                      없습니다.
                    </td>
                  </tr>
                )}
                {/* 조직도 그대로 — 회사 → 그룹 → 담당 → 팀 → 사람(지시).
                    사람은 이름으로 계정과 잇는다. 계정이 없는 사람도 **숨기지
                    않는다** — 「누가 UTOP 을 아직 안 쓰나」 가 이 표의 값어치다. */}
                {org ? (
                  <OrgRows
                    node={org}
                    depth={0}
                    shut={shutOrg}
                    onToggle={toggleOrg}
                    findAcct={findAcct}
                    keep={keep}
                    at={at}
                    onPick={pick}
                    atOrg={atOrg?.name ?? ''}
                    onPickOrg={(p) => {
                      setAt('')
                      setAtOrg(p)
                    }}
                    orgRole={orgRole}
                    path={[]}
                    onOrgEdit={(at, body) => orgEdit.mutate({ at, body })}
                    q={q}
                  />
                ) : null}
                {/* 조직도에 없는 계정 — admin·qag 처럼 조직도에 이름이 없는
                    계정이 45개다. 트리만 그리면 이들은 **어느 칸을 눌러도
                    나올 자리가 없다**(지적: UTOP 계정 고르면 아무것도 안
                    나온다). 트리 끝에 한 묶음으로 낸다. */}
                {org && loose.length > 0 && (
                  <>
                    <tr className="acc-orghd d0">
                      <td colSpan={7}>
                        <button
                          type="button"
                          onClick={() => toggleOrg('loose')}
                          style={{ paddingLeft: 10 }}
                        >
                          <i className={shutOrg.has('loose') ? '' : 'open'}>▸</i>
                          조직도에 없는 계정
                          <em>{loose.length}</em>
                        </button>
                      </td>
                    </tr>
                    {!shutOrg.has('loose') &&
                      loose.map((u) => (
                        <tr
                          key={`loose/${u.username}`}
                          className={`${u.active === false ? 'off' : ''}${
                            at === u.username ? ' on' : ''
                          }`}
                          onClick={() => pick(u)}
                        >
                          <td className="ell" style={{ paddingLeft: 26 }} title={u.name || u.username}>
                            <b>{u.name || u.username}</b>
                          </td>
                          <td className="ell">{u.username}</td>
                          <td>{u.role}</td>
                          <td className="ell">{u.dept || '소속 없음'}</td>
                          <td className="ell">{u.synced_at || ''}</td>
                          <td className="ell">{u.email}</td>
                          <td />
                        </tr>
                      ))}
                  </>
                )}
                {!org && (rows.map((u) => (
                    <tr
                      key={u.username}
                      className={`${u.active === false ? 'off' : ''}${at === u.username ? ' on' : ''}`}
                      onClick={() => pick(u)}
                    >
                      <td className="ell" title={u.name || u.username}>
                        <b>{u.name || u.username}</b>
                      </td>
                      <td className="ell">{u.username}</td>
                      <td>{u.role}</td>
                      <td className="ell">{u.dept || '소속 없음'}</td>
                      <td className="ell">{u.synced_at || ''}</td>
                      <td className="ell">{u.email}</td>
                      <td />
                    </tr>
                  )))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 오른쪽 — 계정 없는 사람. 고칠 수 있는 것이 역할 하나뿐이라
            계정 판을 그대로 쓰지 않는다. 없는 칸(Jira ID·잠금)을 늘어놓으면
            무엇을 할 수 있는 자리인지 흐려진다. */}
        {!cur && atOrg && (
          <aside className="acc-side">
            <div className="acc-sidet">
              <b>{atOrg.name}</b>
              {atOrg.rank && <span className="acc-tag">{atOrg.rank}</span>}
              <span className="sp" />
              <button type="button" className="acc-x" onClick={() => setAtOrg(null)}>
                ×
              </button>
            </div>
            <div className="acc-sidesub">
              <span className="muted small">{atOrg.org}</span>
              <span className="muted small">계정 없음</span>
            </div>
            <div className="acc-jira">
              <b>UTOP 계정이 없습니다</b>
              <p className="muted small" style={{ margin: '6px 0 0' }}>
                Jira 계정이 없어 UTOP 에 로그인하지 않는 분입니다. 계정을 만들어 드릴 수는
                없지만, 역할은 조직도에 적어 둘 수 있습니다. 나중에 계정이 생기면 계정 쪽
                역할이 정본이 됩니다.
              </p>
            </div>
            <label className="acc-fld">
              <span>역할</span>
              <select
                value={orgRole.get(atOrg.name) ?? ''}
                disabled={setOrgRole.isPending}
                onChange={(e) =>
                  setOrgRole.mutate({ name: atOrg.name, role: e.target.value })
                }
              >
                <option value="">(없음)</option>
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            {/* 조직 옮기기 — 조직도의 사람 칸을 통째로 옮긴다. 직급·역할은
                사람에게 붙은 것이라 그대로 따라간다. */}
            <label className="acc-fld">
              <span>조직</span>
              <select
                value={orgOf.at.get(nameKey(atOrg.name)) ?? ''}
                disabled={orgEdit.isPending || orgOf.lead.has(nameKey(atOrg.name))}
                title={
                  orgOf.lead.has(nameKey(atOrg.name))
                    ? '이 사람은 그 조직의 장입니다 — 옮기려면 조직의 장을 바꿔야 합니다'
                    : undefined
                }
                onChange={(e) => {
                  /* 빈 칸을 고르면 **조직도에서 뺀다.** 넣기만 되면 시험 삼아
                     넣어 본 사람을 되돌릴 길이 없다(지적). */
                  const p = orgPaths.find((x) => x.label === e.target.value)
                  orgEdit.mutate({
                    at: 'move-member',
                    body: { name: atOrg.name, to: p ? p.path : [] },
                  })
                }}
              >
                <option value="">(조직도에 없음 — 골라서 빼기)</option>
                {orgPaths.map((p) => (
                  <option key={p.label} value={p.label}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            {setOrgRole.isError && (
              <p className="muted small">저장 실패 — {String(setOrgRole.error)}</p>
            )}
          </aside>
        )}

        {/* 오른쪽 — 고른 사람 */}
        {cur && (
          <aside className="acc-side">
            <div className="acc-sidet">
              <b>{cur.name || cur.username}</b>
              <span className={`acc-tag ${cur.active === false ? 'off' : 'ok'}`}>
                {cur.active === false ? '잠김' : '활성'}
              </span>
              <span className="sp" />
              <button type="button" className="acc-x" onClick={() => setAt('')}>
                ×
              </button>
            </div>
            <div className="acc-sidesub">
              <span className="mono">{cur.username}</span>
              {cur.created_at && (
                <span className="muted small">등록 {cur.created_at.slice(0, 10)}</span>
              )}
            </div>

            {/* Jira 쪽 값 — 여기서는 못 고친다. 고칠 곳은 Jira 다 */}
            <div className="acc-jira">
              <b>Jira 계정</b>
              <div className="acc-kv">
                <span>Jira ID</span>
                <i>{cur.jira_key || (cur.source === 'jira' ? cur.username : '—')}</i>
              </div>
              <div className="acc-kv">
                <span>Jira 상태</span>
                <i className={cur.jira_active === false ? 'bad' : ''}>
                  {cur.source !== 'jira' ? '—' : cur.jira_active === false ? '비활성' : '활성'}
                </i>
              </div>
              {cur.active === false && (
                <div className="acc-kv">
                  <span>잠근 까닭</span>
                  <i className="bad">
                    {cur.locked_by === 'jira' ? 'Jira 에서 비활성' : '관리자가 잠금'}
                  </i>
                </div>
              )}
              <div className="acc-kv">
                <span>UTOP 권한</span>
                <i>{cur.role || '팀원'}</i>
              </div>
              <div className="acc-kv">
                <span>마지막 동기화</span>
                <i>{cur.synced_at || '—'}</i>
              </div>
              <div className="acc-kv">
                <span>마지막 로그인</span>
                <i>{cur.last_login || '—'}</i>
              </div>
              <p className="muted small">
                비밀번호는 Jira 가 갖고 있습니다 — UTOP 은 담지 않습니다.
              </p>
            </div>

            <label className="acc-fld">
              <span>역할</span>
              <select
                value={val('role') || '팀원'}
                onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))}
              >
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            {/* 조직 옮기기 — 조직도의 사람 칸을 통째로 옮긴다. 직급·역할은
                사람에게 붙은 것이라 그대로 따라간다. */}
            <label className="acc-fld">
              <span>조직</span>
              <select
                value={orgOf.at.get(nameKey(cur.name || cur.username)) ?? ''}
                disabled={orgEdit.isPending || orgOf.lead.has(nameKey(cur.name || cur.username))}
                title={
                  orgOf.lead.has(nameKey(cur.name || cur.username))
                    ? '이 사람은 그 조직의 장입니다 — 옮기려면 조직의 장을 바꿔야 합니다'
                    : undefined
                }
                onChange={(e) => {
                  const p = orgPaths.find((x) => x.label === e.target.value)
                  orgEdit.mutate({
                    at: 'move-member',
                    body: { name: nameOnly(cur.name || cur.username), to: p ? p.path : [] },
                  })
                }}
              >
                <option value="">(조직도에 없음 — 골라서 빼기)</option>
                {orgPaths.map((p) => (
                  <option key={p.label} value={p.label}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            {FIELDS.map((f) => (
              <label className="acc-fld" key={f.k}>
                <span>{f.label}</span>
                <input
                  value={val(f.k)}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.k]: e.target.value }))}
                />
              </label>
            ))}

            <div className="acc-sideact">
              <button
                className="btn primary small"
                type="button"
                disabled={patch.isPending || Object.keys(draft).length === 0}
                onClick={() =>
                  patch.mutate(
                    { username: cur.username, body: draft },
                    { onSuccess: () => setDraft({}) },
                  )
                }
              >
                저장
              </button>
              <button
                className="btn small"
                type="button"
                onClick={() =>
                  patch.mutate({
                    username: cur.username,
                    body: { active: cur.active === false },
                  })
                }
              >
                {cur.active === false ? '잠금 풀기' : '잠그기'}
              </button>
              <span className="sp" />
              {cur.username !== 'admin' && (
                <button
                  className="btn small danger"
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        `${cur.username} 을 명단에서 지웁니다.\n\nJira 로 다시 들어오거나 동기화하면 새로 실립니다.`,
                      )
                    )
                      drop.mutate(cur.username)
                  }}
                >
                  지우기
                </button>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}


/**
 * 조직도 줄 — 회사 → 그룹 → 담당 → 팀 → 사람.
 *
 * 마디는 접었다 펼 수 있고, 사람 수와 **장**(— 최지훈 전무)을 함께 보인다.
 * 사람은 이름으로 계정을 찾아 잇는다. **계정이 없는 사람도 지우지 않는다** —
 * 「누가 아직 UTOP 을 안 쓰나」 가 이 표에서 제일 값진 신호다.
 */
function OrgRows({
  node,
  depth,
  shut,
  onToggle,
  findAcct,
  keep,
  at,
  onPick,
  atOrg,
  onPickOrg,
  orgRole,
  path,
  onOrgEdit,
  q,
}: {
  node: OrgNode
  depth: number
  shut: Set<string>
  onToggle: (k: string) => void
  findAcct: (nm: string) => User | undefined
  keep: (nm: string) => boolean
  atOrg: string
  onPickOrg: (p: { name: string; rank: string; org: string }) => void
  orgRole: Map<string, string>
  /** 뿌리부터 이 마디까지의 이름 길 — 같은 이름이 여러 곳에 있어도 안 헷갈린다 */
  path: string[]
  onOrgEdit: (at: string, body: unknown) => void
  at: string
  onPick: (u: User) => void
  q: string
}) {
  const key = `${depth}:${node.name}`
  const open = !shut.has(key) || !!q.trim()
  const total = countOf(node, keep)
  const kids = node.children ?? []
  const mem = node.members ?? []
  const lead = leadOf(node)
  const n = q.trim().toLowerCase()
  const showMem = mem
    .filter((m) => keep(m.name))
    .filter((m) => (n ? m.name.toLowerCase().includes(n) : true))
  const me = [...path, node.name]
  /* 사람이 없는 마디는 **찾는 중일 때만** 감춘다.
     예전엔 늘 감췄는데(지시: 0 은 제거), 그러면 방금 만든 조직이 곧바로
     사라져 사람을 옮겨 넣을 수가 없다 — 만들기가 쓸모없는 기능이 된다.
     찾을 때는 걸린 것만 보여야 하므로 그때는 그대로 감춘다. */
  if (total === 0 && n) return null
  /* 찾는 중에는 걸린 것이 없는 가지를 접어 둔다 — 빈 마디만 늘어놓지 않게 */
  if (n && !hasHit(node, n)) return null

  return (
    <>
      <tr className={`acc-orghd d${Math.min(depth, 4)}`}>
        <td colSpan={7}>
          <button type="button" onClick={() => onToggle(key)} style={{ paddingLeft: 10 + depth * 16 }}>
            <i className={open ? 'open' : ''}>▸</i>
            {node.name}
            <em>{total}</em>
            {lead && <span className="acc-lead">— {lead.name} {lead.rank}</span>}
          </button>
          {/* 조직 고치기 — 마우스를 올린 줄에서만 뜬다. 늘 보이면 60줄에
              단추가 180개라 조직도가 안 읽힌다. */}
          <span className="acc-orgtools">
            <button
              type="button"
              title="하위 조직 만들기"
              onClick={() => {
                const nm = window.prompt(`「${node.name}」 아래에 만들 조직 이름`)?.trim()
                if (nm) onOrgEdit('node', { path: me, name: nm })
              }}
            >
              +
            </button>
            <button
              type="button"
              title="이름 바꾸기"
              onClick={() => {
                const nm = window.prompt('새 조직 이름', node.name)?.trim()
                if (nm && nm !== node.name) onOrgEdit('rename', { path: me, name: nm })
              }}
            >
              <IconEdit />
            </button>
            {depth > 0 && (
              <button
                type="button"
                title="빈 조직 지우기"
                onClick={() => {
                  if (window.confirm(`「${node.name}」 을(를) 지웁니다. 계속할까요?`))
                    onOrgEdit('delete-node', { path: me })
                }}
              >
                <IconTrash />
              </button>
            )}
          </span>
        </td>
      </tr>
      {open && (
        <>
          {/* 장(長)도 **계정 줄**로 낸다(지시) — 이름표만 있으면 그 사람의
              계정·역할·메일을 알 수 없다. 「장」 표를 달아 팀원과 가른다. */}
          {lead && keep(lead.name) && (!n || lead.name.toLowerCase().includes(n)) && (() => {
            const u = findAcct(lead.name)
            return (
              <tr
                className={`${u ? '' : 'noacct'}${u && at === u.username ? ' on' : ''}`}
                onClick={() => u && onPick(u)}
              >
                <td className="ell" style={{ paddingLeft: 10 + (depth + 1) * 16 }}>
                  <b>{lead.name}</b>
                  {lead.rank && <span className="acc-rank">{lead.rank}</span>}
                </td>
                <td className="ell">{u?.username ?? <span className="muted">계정 없음</span>}</td>
                {/* 역할은 **있는 그대로** 보인다. 조직도를 저장할 때 장의 역할이
                    실제로 「담당」 으로 맞춰지므로(_apply_org_roles), 표와 편집판이
                    같은 값을 말한다 — 표에만 적으면 둘이 어긋난다(지적). */}
                <td className={u?.role === '담당' ? 'acc-role-lead' : undefined}>{u?.role ?? ''}</td>
                <td className="ell">{node.name}</td>
                <td className="ell">{u?.synced_at ?? ''}</td>
                <td className="ell">{u?.email ?? ''}</td>
                <td />
              </tr>
            )
          })()}
          {showMem.map((m) => {
            const u = findAcct(m.name)
            return (
              <tr
                key={`${key}/${m.name}`}
                /* 계정이 없어도 **고를 수 있다**(지시: 역할을 넣어야 한다).
                   고르면 오른쪽에서 역할만 정하고, 그 값은 조직도에 담긴다. */
                className={`${u ? '' : 'noacct'}${
                  (u ? at === u.username : atOrg === m.name) ? ' on' : ''
                }`}
                onClick={() =>
                  u ? onPick(u) : onPickOrg({ name: m.name, rank: m.rank ?? '', org: node.name })
                }
              >
                <td className="ell" style={{ paddingLeft: 10 + (depth + 1) * 16 }}>
                  <b>{m.name}</b>
                  {m.rank && <span className="acc-rank">{m.rank}</span>}
                </td>
                <td className="ell">{u?.username ?? <span className="muted">계정 없음</span>}</td>
                <td>{u?.role ?? orgRole.get(m.name) ?? ''}</td>
                <td className="ell">{node.name}</td>
                <td className="ell">{u?.synced_at ?? ''}</td>
                <td className="ell">{u?.email ?? ''}</td>
                <td />
              </tr>
            )
          })}
          {kids.map((c) => (
            <OrgRows
              key={c.name}
              node={c}
              depth={depth + 1}
              shut={shut}
              onToggle={onToggle}
              findAcct={findAcct}
              keep={keep}
              at={at}
              onPick={onPick}
              atOrg={atOrg}
              onPickOrg={onPickOrg}
              orgRole={orgRole}
              path={me}
              onOrgEdit={onOrgEdit}
              q={q}
            />
          ))}
        </>
      )}
    </>
  )
}

/** 장(長) 이름표를 사람으로 — 「최승태 책임M」 → {name:'최승태', rank:'책임M'} */
function leadOf(n: OrgNode): { name: string; rank: string } | null {
  const t = String(n.lead ?? '').trim()
  if (!t) return null
  const at = t.lastIndexOf(' ')
  return at > 0 ? { name: t.slice(0, at), rank: t.slice(at + 1) } : { name: t, rank: '' }
}

/**
 * 이 마디 아래 사람 수 — **이름으로 헤아린다.**
 *
 * 장이 아래 담당의 장을 겸하거나(최지훈: 그룹장 겸 담당장) 제 팀의 팀원으로도
 * 올라 있으면(권종혁), 그냥 더하면 한 사람이 두 번 세인다. 이름으로 세면
 * 받은 조직도의 숫자와 그대로 맞는다(ISP사업그룹 8 · 연구소 67).
 */
function namesIn(
  n: OrgNode,
  keep: (nm: string) => boolean,
  into: Set<string> = new Set(),
): Set<string> {
  const L = leadOf(n)
  if (L && keep(L.name)) into.add(L.name)
  for (const m of n.members ?? []) if (keep(m.name)) into.add(m.name)
  for (const c of n.children ?? []) namesIn(c, keep, into)
  return into
}
function countOf(n: OrgNode, keep: (nm: string) => boolean): number {
  return namesIn(n, keep).size
}

/** 찾는 글자가 이 가지 어딘가에 있나 */
function hasHit(n: OrgNode, q: string): boolean {
  if (n.name.toLowerCase().includes(q)) return true
  if (String(n.lead ?? '').toLowerCase().includes(q)) return true
  if ((n.members ?? []).some((m) => m.name.toLowerCase().includes(q))) return true
  return (n.children ?? []).some((c) => hasHit(c, q))
}
