import { useEffect, useState } from 'react'
import { apiFetch } from '@/api/client'

/**
 * **메일 받을 사람들** — 조직도(누가 어느 팀인가)와 계정(메일 주소)을 잇는다.
 *
 * 둘은 사는 곳이 다르다. 조직도(`/api/org`)는 사람이 손으로 적어 둔 트리라
 * 이름·직급만 있고 주소가 없다. 주소는 계정(`/api/users/mentionable`)에만
 * 있다. **이름으로 잇는다** — 계정 이름이 「강경묵(생산)」 처럼 꼬리를 달고
 * 있어 괄호·밑줄 앞까지만 본다(서버 /api/org 주석과 같은 규칙).
 *
 * 이어 붙지 않은 계정도 버리지 않는다. 「조직도에 없는 계정」 묶음으로 따로
 * 세운다 — 자동화 계정이나 협력사처럼 트리에 없는 사람도 메일은 받는다.
 */
export interface MailPerson {
  /** 조직도에 적힌 이름 (계정 이름의 꼬리는 뗀 것) */
  name: string
  rank: string
  uid: string
  role: string
  mail: string
  /** 「품질보증담당 › QA팀」 처럼 읽는 길 */
  path: string
  /** 찾기용 — 이름·직급·아이디·주소·조직을 한 줄로 이어 소문자로 */
  key: string
}
export interface MailOrg {
  id: string
  name: string
  lead: string
  depth: number
  members: MailPerson[]
  kids: MailOrg[]
  /** 이 조직과 아래 조직에 속한 **주소** 전부 (한 번에 넣기가 쓴다) */
  mails: string[]
  /** 이 조직과 아래 조직의 **사람 이름** — 같은 사람이 두 조직에 적혀 있어도
      한 번만 센다(담당 본인이 아래 팀에도 적히는 일이 흔하다) */
  names: string[]
  /** 사람 수 — 주소가 없는 사람도 센다 */
  count: number
}

/** 계정 이름의 꼬리를 뗀다 — 「강경묵(생산)」·「이승훈_기술」 → 「강경묵」 */
export const bareName = (v: string): string =>
  (String(v ?? '').split(/[(（_]/, 1)[0] ?? '').trim()

interface OrgNodeRaw {
  name?: string
  lead?: string | null
  members?: Array<{ name?: string; rank?: string; role?: string }>
  children?: OrgNodeRaw[]
}
interface AccountRaw {
  username?: string
  name?: string
  email?: string
  dept?: string
  team?: string
  /** 관리자·담당·팀장·팀원 — 조직도에는 없고 계정에만 있다 */
  role?: string
}

/** 조직도 + 계정을 합친 결과 */
export interface MailBook {
  roots: MailOrg[]
  people: MailPerson[]
  /** 주소 → 사람. 같은 주소가 여럿이면 **먼저 나온 쪽**을 쓴다 */
  byMail: Record<string, MailPerson>
  loading: boolean
}

const EMPTY: MailBook = { roots: [], people: [], byMail: {}, loading: true }

export function useMailBook(on: boolean): MailBook {
  const [book, setBook] = useState<MailBook>(EMPTY)
  useEffect(() => {
    if (!on) return
    let dead = false
    void (async () => {
      try {
        const [ro, ru] = await Promise.all([
          apiFetch('/api/org'),
          apiFetch('/api/users/mentionable'),
        ])
        const org = ((await ro.json()) as { org?: OrgNodeRaw }).org ?? null
        const accs = ((await ru.json()) as { users?: AccountRaw[] }).users ?? []
        if (!dead) setBook(joinBook(org, accs))
      } catch {
        /* 조직도를 못 받아도 메일은 보낼 수 있다 — 주소를 직접 치면 된다 */
        if (!dead) setBook({ roots: [], people: [], byMail: {}, loading: false })
      }
    })()
    return () => {
      dead = true
    }
  }, [on])
  return book
}

export function joinBook(org: OrgNodeRaw | null, accs: AccountRaw[]): MailBook {
  /* 계정을 **이름으로** 찾을 수 있게 모아 둔다. 같은 이름이 둘이면 주소가
     있는 쪽을 남긴다 — 메일을 못 받는 계정은 고를 수 없으니 쓸모가 없다. */
  const byName = new Map<string, AccountRaw>()
  accs.forEach((a) => {
    const k = bareName(String(a.name || a.username || ''))
    if (!k) return
    const cur = byName.get(k)
    if (!cur || (!cur.email && a.email)) byName.set(k, a)
  })

  const people: MailPerson[] = []
  const used = new Set<string>()
  let gid = 0

  const mk = (nm: string, rank: string, role: string, path: string): MailPerson => {
    const acc = byName.get(nm)
    if (acc) used.add(String(acc.username || ''))
    const p: MailPerson = {
      name: nm,
      rank: rank || '',
      uid: String(acc?.username ?? ''),
      /* 조직도가 말하는 자리(담당)가 먼저, 없으면 계정에 적힌 역할 */
      role: role || String(acc?.role ?? ''),
      mail: String(acc?.email ?? ''),
      path,
      key: '',
    }
    p.key = [p.name, p.rank, p.uid, p.mail, path].join('\n').toLowerCase()
    people.push(p)
    return p
  }

  const walk = (n: OrgNodeRaw, depth: number, parent: string): MailOrg => {
    const name = String(n.name ?? '')
    const path = parent ? `${parent} › ${name}` : name
    const lead = String(n.lead ?? '').trim()
    /* **담당자도 고를 수 있어야 한다**(지적: 담당이 선택 안 된다).
       조직도의 담당·그룹 계층은 사람 목록(members)이 비어 있고, 담당자는
       조직 줄의 글자(lead)로만 적혀 있다 — 「전규종 상무대우」 처럼 이름과
       직급이 한 줄이다. 그대로 두면 이름은 보이는데 누를 수가 없다.
       첫 어절을 이름으로 떼어 맨 앞 사람으로 세운다(한국 이름에는 공백이
       없다). 아래 팀에도 같은 사람이 적혀 있으면 주소가 같아, 한쪽을
       고르면 다른 쪽도 함께 켜진다. */
    const leadP: MailPerson[] = []
    if (lead) {
      const sp = lead.indexOf(' ')
      const lnm = bareName(sp > 0 ? lead.slice(0, sp) : lead)
      const lrk = sp > 0 ? lead.slice(sp + 1).trim() : ''
      const already = (n.members ?? []).some((m) => bareName(String(m.name ?? '')) === lnm)
      if (lnm && !already) leadP.push(mk(lnm, lrk, '담당', path))
    }
    const node: MailOrg = {
      id: `g${gid++}`,
      name,
      lead,
      depth,
      members: [
        ...leadP,
        ...(n.members ?? []).map((m) =>
          mk(bareName(String(m.name ?? '')), String(m.rank ?? ''), String(m.role ?? ''), path),
        ),
      ],
      kids: (n.children ?? []).map((k) => walk(k, depth + 1, depth > 0 ? path : name)),
      mails: [],
      names: [],
      count: 0,
    }
    /* 이 조직이 품은 주소·사람을 굴려 올린다 — 위 조직에서 「모두 넣기」를
       누르면 아래까지 한 번에 들어가야 한다. 같은 사람이 담당과 팀에 둘 다
       적혀 있는 일이 흔해, 이름으로 한 번만 센다. */
    const names = new Set<string>()
    const mails = new Set<string>()
    node.members.forEach((p) => {
      names.add(p.name)
      if (p.mail) mails.add(p.mail)
    })
    node.kids.forEach((k) => {
      k.mails.forEach((m) => mails.add(m))
      k.names.forEach((n2) => names.add(n2))
    })
    node.mails = [...mails]
    node.names = [...names]
    node.count = names.size
    return node
  }

  const roots: MailOrg[] = org ? [walk(org, 0, '')] : []

  /* 조직도에 못 이은 계정 — 자동화 계정·협력사처럼 트리에 없는 사람도
     메일은 받는다. 통째로 버리면 「그 사람이 왜 안 보이지」가 된다. */
  const rest = accs.filter((a) => a.username && !used.has(String(a.username)))
  if (rest.length) {
    const node: MailOrg = {
      id: `g${gid++}`,
      name: '조직도에 없는 계정',
      lead: '',
      depth: 0,
      members: [],
      kids: [],
      mails: [],
      names: [],
      count: 0,
    }
    node.members = rest.map((a) => {
      const nm = String(a.name || a.username || '')
      const org2 = String(a.dept || a.team || '소속 없음')
      const p: MailPerson = {
        name: nm,
        rank: '',
        uid: String(a.username ?? ''),
        role: String(a.role ?? ''),
        mail: String(a.email ?? ''),
        path: `조직도 밖 · ${org2}`,
        key: '',
      }
      p.key = [p.name, p.uid, p.mail, org2].join('\n').toLowerCase()
      people.push(p)
      return p
    })
    node.mails = [...new Set(node.members.map((p) => p.mail).filter(Boolean))]
    node.names = [...new Set(node.members.map((p) => p.name))]
    node.count = node.names.length
    roots.push(node)
  }

  const byMail: Record<string, MailPerson> = {}
  people.forEach((p) => {
    if (p.mail && !byMail[p.mail]) byMail[p.mail] = p
  })
  return { roots, people, byMail, loading: false }
}

/** 조직 전부를 id 로 찾을 수 있게 편다 */
export function flatOrgs(roots: MailOrg[]): Record<string, MailOrg> {
  const out: Record<string, MailOrg> = {}
  const go = (n: MailOrg) => {
    out[n.id] = n
    n.kids.forEach(go)
  }
  roots.forEach(go)
  return out
}
