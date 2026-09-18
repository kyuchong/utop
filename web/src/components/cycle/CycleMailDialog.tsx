import { useEffect, useMemo, useRef, useState } from 'react'
import { apiFetch } from '@/api/client'
import { flatOrgs, useMailBook, type MailOrg, type MailPerson } from '@/lib/mailPeople'
import './CycleMailDialog.css'

/**
 * 결과 메일 창.
 *
 * 여태는 받는 사람을 **콤마로 이어 한 줄에 치는** 칸 하나였다. 주소를 외워
 * 적어야 하고, 오타가 나도 보내고 나서야 안다. 참조도 숨은 참조도 없어
 * 「팀장님 참조로」 가 안 됐고, 첨부가 없어 결과 파일은 따로 메일 클라이언트를
 * 열어 보냈다.
 *
 * 이제 조직도에서 골라 담는다. 한 사람은 받는 사람·참조·숨은 참조 **한 곳에만**
 * 선다 — 같은 사람이 두 칸에 있으면 메일이 두 번 가고, 받는 쪽은 무엇이
 * 다른지 알 수 없다.
 */

export interface MailCycle {
  id: string
  name?: string | null
  cid?: string | null
  model?: string | null
  version?: string | null
}
/** 「이 메일로 다시 쓰기」 가 채워 넣는 값 */
export interface MailSeed {
  to: string[]
  cc: string[]
  bcc: string[]
  subject: string
  body: string
}

type Box = 'to' | 'cc' | 'bcc'
const BOXES: Box[] = ['to', 'cc', 'bcc']
const BOXNAME: Record<Box, string> = { to: '받는 사람', cc: '참조', bcc: '숨은 참조' }
const BOXTAG: Record<Box, string> = { to: '받는', cc: '참조', bcc: '숨은' }
const PH: Record<Box, string> = {
  to: '이름 · 아이디 · 이메일로 찾거나, 주소를 넣고 Enter',
  cc: '없으면 비워 둡니다',
  bcc: '받는 사람과 참조에게는 보이지 않습니다',
}
const okMail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

/** 첨부 — 전체 25MB 까지. 서버도 같은 자로 막는다 */
const ATT_MAX = 25 * 1024 * 1024
interface Att {
  id: string
  name: string
  size: number
  mime: string
  data: string
}
function fmtSize(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(b < 10240 ? 1 : 0)} KB`
  return `${(b / 1048576).toFixed(1)} MB`
}
const extOf = (n: string) => (/\.([^./]+)$/.exec(n)?.[1] ?? 'file').slice(0, 4).toUpperCase()
/** 확장자 색 — 짜 놓은 것이 없으면 글자에서 뽑는다(같은 확장자는 늘 같은 색) */
const EXTC: Record<string, string> = {
  PDF: '#c2402f', XLSX: '#1d7a45', XLS: '#1d7a45', CSV: '#1d7a45',
  DOCX: '#2b5fb4', DOC: '#2b5fb4', PPTX: '#c25a1c', PPT: '#c25a1c',
  ZIP: '#8a6a12', '7Z': '#8a6a12', GZ: '#8a6a12', TGZ: '#8a6a12',
  LOG: '#56626e', TXT: '#56626e', PCAP: '#0e7490',
  PNG: '#6b46a8', JPG: '#6b46a8', JPEG: '#6b46a8',
}
function hue(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) % 360
  return h
}
const extColor = (e: string) => EXTC[e] ?? `hsl(${hue(e)} 35% 42%)`

export default function CycleMailDialog({
  cycle,
  seed,
  onClose,
  onSent,
}: {
  cycle: MailCycle
  seed?: MailSeed | null
  onClose: () => void
  onSent?: () => void
}) {
  const [lists, setLists] = useState<Record<Box, string[]>>(() => ({
    to: seed?.to ?? [],
    cc: seed?.cc ?? [],
    bcc: seed?.bcc ?? [],
  }))
  const [bccOpen, setBccOpen] = useState(() => !!seed?.bcc?.length)
  const [subject, setSubject] = useState(seed?.subject ?? '')
  const [autoSubj, setAutoSubj] = useState('')
  const [files, setFiles] = useState<Att[]>([])
  const [attMsg, setAttMsg] = useState('')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  /** 조직도 판 — 열어 두는 것이 예사다. 닫으면 창이 좁아진다 */
  const [orgOn, setOrgOn] = useState(true)
  const [orgBox, setOrgBox] = useState<Box>('to')
  const [orgQ, setOrgQ] = useState('')

  const book = useMailBook(true)
  const orgs = useMemo(() => flatOrgs(book.roots), [book.roots])
  const byMail = book.byMail

  /* 처음 펼쳐 둘 조직 — 맨 위 하나. 전부 펴 두면 200 줄이 쏟아진다 */
  const [open, setOpen] = useState<Set<string>>(new Set())
  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current || !book.roots.length) return
    seeded.current = true
    const s = new Set<string>()
    book.roots.forEach((r) => s.add(r.id))
    /* 결과 메일은 품질보증 쪽이 주로 보낸다 — 그 가지만 펴 둔다 */
    Object.values(orgs).forEach((n) => {
      if (n.name.includes('품질보증')) {
        s.add(n.id)
        n.kids.forEach((k) => s.add(k.id))
      }
    })
    setOpen(s)
  }, [book.roots, orgs])
  /** 찾는 중에 접은 조직 — 찾는 말이 바뀌면 비운다 */
  const [sclose, setSclose] = useState<Set<string>>(new Set())

  /* ── 넣기·빼기 — **한 사람이 여러 칸에 설 수 있다**(지시) ──
     한 곳에만 두던 때는, 받는 사람에 넣은 사람을 참조에 더하면 받는 사람에서
     빠졌다. 공문을 돌릴 때는 같은 사람을 받는 사람으로도 참조로도 적는 일이
     있고, 그것은 「누구에게 보냈나」 를 적어 두는 방식이다 — 화면이 막을
     일이 아니다. 뺄 때는 그 칸에서만 뺀다. */
  /** 이 사람이 서 있는 칸 **모두** — 칩과 조직도 표시가 이것을 쓴다 */
  const wheresOf = (m: string): Box[] => BOXES.filter((b) => lists[b].includes(m))
  const put = (box: Box, mails: string[]) =>
    setLists((v) => {
      const next: Record<Box, string[]> = { to: [...v.to], cc: [...v.cc], bcc: [...v.bcc] }
      mails.forEach((m) => {
        if (next[box].includes(m)) return
        next[box] = [...next[box], m]
      })
      return next
    })
  const toggle = (box: Box, m: string) =>
    setLists((v) => {
      const next: Record<Box, string[]> = { to: [...v.to], cc: [...v.cc], bcc: [...v.bcc] }
      next[box] = next[box].includes(m) ? next[box].filter((x) => x !== m) : [...next[box], m]
      return next
    })
  const dropMails = (box: Box, mails: string[]) =>
    setLists((v) => ({ ...v, [box]: v[box].filter((m) => !mails.includes(m)) }))
  const addRaw = (box: Box, raw: string) => {
    const add = raw
      .split(/[,;\s]+/)
      .map((x) => x.trim())
      .filter(Boolean)
      /* 이 칸에 없으면 넣는다 — 다른 칸에 있어도 상관없다(지시) */
      .filter((x) => !lists[box].includes(x))
    if (add.length) setLists((v) => ({ ...v, [box]: [...v[box], ...add] }))
  }

  /* ── 제목·본문 ──
     본문은 **Test Summary 로 시작한다**. 사람이 이미 정리해 둔 글이 있는데
     빈 칸에서 다시 쓰게 하면 아무도 안 쓴다. 서버가 그 글을 메일 틀에 넣어
     보내므로, 여기서는 사람이 쓴 부분만 들고 있다. */
  const bodyRef = useRef<HTMLDivElement>(null)
  const [body, setBody] = useState(seed?.body ?? '')
  const [seedBody, setSeedBody] = useState('')
  useEffect(() => {
    let dead = false
    void (async () => {
      try {
        const r = await apiFetch(`/api/cycle/${encodeURIComponent(cycle.id)}/summary-body`)
        const j = (await r.json()) as { html?: string; subject?: string }
        if (dead) return
        setSeedBody(String(j.html ?? ''))
        setAutoSubj(String(j.subject ?? ''))
        if (!seed) setBody(String(j.html ?? ''))
      } catch {
        /* 못 받아도 메일은 쓸 수 있다 — 빈 칸에서 시작한다 */
      }
    })()
    return () => {
      dead = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycle.id])
  /* 편집 중에는 다시 그리지 않는다 — 글자를 칠 때마다 커서가 맨 앞으로 튄다 */
  useEffect(() => {
    const el = bodyRef.current
    if (el && el.innerHTML !== body) el.innerHTML = body
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedBody, seed])

  /* ── 첨부 ── */
  const attTotal = files.reduce((a, f) => a + f.size, 0)
  const addFiles = async (list: FileList | File[]) => {
    const errs: string[] = []
    let tot = attTotal
    const read = await Promise.all(
      [...list].map(
        (f) =>
          new Promise<Att | null>((done) => {
            if (files.some((x) => x.name === f.name && x.size === f.size)) {
              errs.push(`${f.name} — 이미 넣은 파일입니다.`)
              return done(null)
            }
            if (tot + f.size > ATT_MAX) {
              errs.push(`${f.name} (${fmtSize(f.size)}) — 넣으면 전체 25 MB를 넘습니다.`)
              return done(null)
            }
            tot += f.size
            const r = new FileReader()
            r.onload = () =>
              done({
                id: `af${Math.random().toString(36).slice(2, 10)}`,
                name: f.name || '첨부파일',
                size: f.size,
                mime: f.type || 'application/octet-stream',
                data: String(r.result ?? ''),
              })
            r.onerror = () => {
              errs.push(`${f.name} — 읽지 못했습니다.`)
              done(null)
            }
            r.readAsDataURL(f)
          }),
      ),
    )
    const ok = read.filter(Boolean) as Att[]
    if (ok.length) setFiles((v) => [...v, ...ok])
    setAttMsg(errs.join(' '))
  }
  const [dragOn, setDragOn] = useState(false)

  /* ── 보내기 ── */
  const bad = BOXES.some((b) => lists[b].some((m) => !okMail(m)))
  const ready = lists.to.length > 0 && !bad
  const send = async () => {
    if (!ready || busy) return
    setBusy('send')
    setMsg(null)
    try {
      const r = await apiFetch(`/api/cycle/${encodeURIComponent(cycle.id)}/mail`, {
        method: 'POST',
        body: JSON.stringify({
          to: lists.to,
          cc: lists.cc,
          bcc: lists.bcc,
          subject: subject.trim(),
          body_html: bodyRef.current?.innerHTML ?? body,
          files: files.map((f) => ({
            filename: f.name,
            mime: f.mime,
            size: f.size,
            data: f.data,
          })),
        }),
      })
      const j = (await r.json()) as { success?: boolean; detail?: string }
      if (!r.ok || !j.success) throw new Error(j.detail || '보내지 못했습니다')
      onSent?.()
      onClose()
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy('')
    }
  }

  /* ── 미리보기 ── */
  const [prev, setPrev] = useState<string | null>(null)
  const preview = async () => {
    setBusy('prev')
    try {
      const r = await apiFetch(`/api/cycle/${encodeURIComponent(cycle.id)}/mail-preview`, {
        method: 'POST',
        body: JSON.stringify({ body_html: bodyRef.current?.innerHTML ?? body }),
      })
      const j = (await r.json()) as { html?: string; subject?: string; detail?: string }
      if (!r.ok) throw new Error(j.detail || '미리보기를 만들지 못했습니다')
      setPrev(String(j.html ?? ''))
      if (!subject.trim() && j.subject) setAutoSubj(String(j.subject))
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy('')
    }
  }

  /* ── 자동 완성 ── */
  /* 칸마다의 입력 상자 — 고른 뒤 **친 글자를 지우려면** 그 상자를 알아야 한다.
     값을 state 로 들고 있지 않은 칸이라(칩이 정본) DOM 을 직접 비운다. */
  const inpRef = useRef<Partial<Record<Box, HTMLInputElement | null>>>({})
  const [sug, setSug] = useState<{
    box: Box
    q: string
    items: Array<{ p?: MailPerson; g?: MailOrg }>
    i: number
  } | null>(null)
  const findSug = (box: Box, q: string) => {
    /* **이 칸에 없으면 보인다.** 어느 칸에든 들어간 사람을 통째로 빼던
       때는, 받는 사람에 넣은 사람을 참조 칸에서 찾으면 아무것도 안 나와
       「선택이 안 된다」 로 보였다(지적). 고르면 이 칸으로 옮긴다. */
    const used = new Set(lists[box])
    const gs = Object.values(orgs)
      .filter((n) => n.depth > 0 && n.name.toLowerCase().includes(q) && n.mails.some((m) => !used.has(m)))
      .slice(0, 2)
      .map((g) => ({ g }))
    const seen = new Set<string>()
    const head: Array<{ p: MailPerson }> = []
    const rest: Array<{ p: MailPerson }> = []
    book.people.forEach((p) => {
      if (!p.mail || used.has(p.mail) || seen.has(p.mail)) return
      if (p.name.toLowerCase().startsWith(q) || p.uid.toLowerCase().startsWith(q)) {
        seen.add(p.mail)
        head.push({ p })
      }
    })
    book.people.forEach((p) => {
      if (!p.mail || used.has(p.mail) || seen.has(p.mail)) return
      if (p.key.includes(q)) {
        seen.add(p.mail)
        rest.push({ p })
      }
    })
    setSug({ box, q, items: [...gs, ...head, ...rest].slice(0, 9), i: 0 })
  }
  const pickSug = (k: number) => {
    const it = sug?.items[k]
    if (!it || !sug) return false
    /* 조직을 고르면 그 조직 사람을 모두 이 칸으로 — 다른 칸에 있던 사람도
       옮긴다. 「참조로 팀 전체」 를 누르는 사람이 바라는 것은 그것이다. */
    if (it.g) put(sug.box, it.g.mails)
    else if (it.p) put(sug.box, [it.p.mail])
    setSug(null)
    /* 친 글자를 지운다 — 칩으로 들어갔는데 글자가 남아 있으면 다음에 Enter 를
       쳤을 때 그 글자가 **주소인 줄 알고** 한 번 더 들어간다(지적: 유지된다). */
    const inp = inpRef.current[sug.box]
    if (inp) inp.value = ''
    return true
  }

  /* ── 조직도 목록 ── */
  const q = orgQ.trim().toLowerCase()
  /* 찾은 사람 수와 **Enter 로 넣을 첫 사람** — 트리를 그리면서 채운다.
     ref 로 두면 렌더 중에 비우는 대입 때문에 타입이 null 로 굳는다. */
  const hitNames = new Set<string>()
  let hit1: MailPerson | null = null
  const orgRows = (n: MailOrg, force: boolean): React.ReactNode[] => {
    const self = !!q && n.name.toLowerCase().includes(q)
    const f = force || self
    const mem = q && !f ? n.members.filter((p) => p.key.includes(q)) : n.members
    const isOpen = q ? !sclose.has(n.id) : open.has(n.id)
    if (q) mem.forEach((p) => hitNames.add(p.name))
    if (q && isOpen && !hit1) {
      hit1 = mem.find((p) => p.mail && !lists[orgBox].includes(p.mail)) ?? null
    }
    const kids = q || isOpen ? n.kids.flatMap((k) => orgRows(k, f)) : []
    if (q && !self && !mem.length && !kids.length) return []
    /* 「＋N명」 은 **이 칸에 없는 사람**을 담는다(지적: 받는 사람에 넣은
       사람이 참조에서 안 골라진다). 다른 칸에 있던 사람도 이 칸으로
       옮긴다 — 「참조로 팀 전체」 를 누르는 사람이 바라는 것은 그것이다. */
    const free = n.mails.filter((m) => !lists[orgBox].includes(m))
    const mine = n.mails.filter((m) => lists[orgBox].includes(m))
    const out: React.ReactNode[] = [
      <div className={`cmd-og${n.depth === 0 ? ' top' : ''}`} key={n.id} style={{ paddingLeft: 6 + n.depth * 16 }}>
        <button
          type="button"
          className="cmd-ogt"
          aria-expanded={isOpen}
          onClick={() => {
            const S = q ? new Set(sclose) : new Set(open)
            if (S.has(n.id)) S.delete(n.id)
            else S.add(n.id)
            if (q) setSclose(S)
            else setOpen(S)
          }}
        >
          <i className={isOpen ? 'open' : ''} aria-hidden="true">
            ›
          </i>
          <span className="cmd-ognm">{n.name}</span>
          <em>{n.count}</em>
          {!!n.lead && <span className="cmd-oglead">{n.lead}</span>}
        </button>
        {n.depth > 0 && !!free.length && (
          <button
            type="button"
            className="cmd-ogall"
            title={`${n.name} — ${free.length}명을 ${BOXNAME[orgBox]}에 넣습니다 (다른 칸에 있던 사람은 옮겨집니다)`}
            onClick={() => put(orgBox, free)}
          >
            ＋ {free.length}명
          </button>
        )}
        {n.depth > 0 && !free.length && !!mine.length && (
          <button
            type="button"
            className="cmd-ogall on"
            title={`${n.name} — ${BOXNAME[orgBox]}에서 ${mine.length}명을 뺍니다`}
            onClick={() => dropMails(orgBox, n.mails)}
          >
            {mine.length}명 빼기
          </button>
        )}
      </div>,
    ]
    if (isOpen) {
      mem.forEach((p, i) => {
        /* 체크는 **지금 고른 칸** 기준이다(지시: 받는 사람에 있어도 참조에
           더할 수 있게). 아무 칸에나 있으면 켜던 때는, 받는 사람에 넣은
           사람이 참조 모드에서도 이미 든 것처럼 보여 누를 수가 없었다.
           다른 칸에 서 있다는 것은 오른쪽 배지가 말한다. */
        const on = !!p.mail && lists[orgBox].includes(p.mail)
        out.push(
          <button
            type="button"
            className={`cmd-op${on ? ` in-${orgBox}` : ''}`}
            key={`${n.id}-p${i}`}
            style={{ paddingLeft: 10 + (n.depth + 1) * 16 }}
            disabled={!p.mail}
            aria-pressed={on}
            title={
              p.mail
                ? `${p.path} · ${p.mail}`
                : p.dup
                  ? '같은 이름의 계정이 둘이라 누구인지 가릴 수 없습니다 — 위 칸에 주소를 직접 넣어 주세요'
                  : '계정이 없어 메일을 받을 수 없습니다'
            }
            onClick={() => p.mail && toggle(orgBox, p.mail)}
          >
            <i className="cmd-ob">{on ? '✓' : ''}</i>
            <b>{p.name}</b>
            {!!p.rank && <span className="cmd-oprk">{p.rank}</span>}
            {/* 자리 배지 — 팀원은 적지 않는다(거의 모두라 적어도 뜻이 없다) */}
            {/^(담당|팀장|관리자)$/.test(p.role) && <span className="cmd-oprole">{p.role}</span>}
            {/* 주소가 없는 까닭을 **갈라서** 말한다 — 여태 셋을 모두 「계정 없음」
                이라 적어, 계정이 버젓이 있는 사람까지 없는 것처럼 보였다(지적) */}
            <span className="cmd-opmail">{p.mail || (p.dup ? '동명이인' : '계정 없음')}</span>
            {/* 서 있는 칸을 모두 — 한 사람이 받는 사람이면서 참조일 수 있다 */}
            {wheresOf(p.mail).map((b) => (
              <span key={b} className={`cmd-optag ${b}`}>
                {BOXTAG[b]}
              </span>
            ))}
          </button>,
        )
      })
      out.push(...kids)
    }
    return out
  }
  const rows = book.roots.flatMap((n) => orgRows(n, false))
  const hitN = hitNames.size
  /* 트리를 그리는 동안 채워진 값을 **함수를 거쳐** 읽는다 — 바로 읽으면
     「처음엔 null 이었다」 는 것만 보고 타입을 null 로 굳혀 버린다 */
  const readHit = (): MailPerson | null => hit1
  const first = readHit()

  /* ── 조각들 ── */
  const chipField = (box: Box) => (
    <div className={`cmd-chips${orgOn && orgBox === box ? ' tgt' : ''}`}>
      {lists[box].map((m, i) => {
        const p = byMail[m]
        const good = okMail(m)
        return (
          <span
            className={`cmd-chip ${box}${good ? '' : ' bad'}`}
            key={`${m}-${i}`}
            title={good ? (p ? `${p.name} ${p.rank} · ${p.path}\n${m}` : m) : '주소 형식이 아닙니다'}
          >
            {p ? (
              <>
                {p.name}
                {!!p.rank && <small>{p.rank}</small>}
              </>
            ) : (
              m
            )}
            <button
              type="button"
              aria-label={`${p ? p.name : m} 지우기`}
              onClick={() => setLists((v) => ({ ...v, [box]: v[box].filter((_, j) => j !== i) }))}
            >
              ✕
            </button>
          </span>
        )
      })}
      <input
        ref={(el) => {
          inpRef.current[box] = el
        }}
        placeholder={lists[box].length ? '' : PH[box]}
        autoComplete="off"
        spellCheck={false}
        /* 조직도는 **방금 누른 칸**을 따라간다 — 참조 칸에 손을 댔는데
           고른 사람이 받는 사람으로 들어가면 그것만큼 헷갈리는 것이 없다 */
        onFocus={() => {
          if (orgOn) setOrgBox(box)
        }}
        onChange={(e) => {
          const v = e.target.value.trim().toLowerCase()
          if (v) findSug(box, v)
          else setSug(null)
        }}
        onKeyDown={(e) => {
          const el = e.currentTarget
          const mine = sug?.box === box
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            if (mine && sug.items.length) {
              e.preventDefault()
              setSug({ ...sug, i: (sug.i + (e.key === 'ArrowDown' ? 1 : -1) + sug.items.length) % sug.items.length })
            }
            return
          }
          if (e.key === 'Escape' && mine) {
            e.preventDefault()
            setSug(null)
            return
          }
          if (e.key === ',' || e.key === ';' || e.key === 'Enter') {
            if (e.nativeEvent.isComposing) return /* 한글 조합 중인 Enter 는 글자 확정용 */
            e.preventDefault()
            if (mine && sug.i > -1 && pickSug(sug.i)) {
              el.value = ''
              return
            }
            if (el.value.trim()) {
              addRaw(box, el.value)
              el.value = ''
              setSug(null)
            }
            return
          }
          if (e.key === 'Backspace' && !el.value && lists[box].length) {
            setLists((v) => ({ ...v, [box]: v[box].slice(0, -1) }))
          }
        }}
        onPaste={(e) => {
          const txt = e.clipboardData.getData('text')
          if (!/[,;\s]/.test(txt)) return
          e.preventDefault()
          addRaw(box, txt)
          e.currentTarget.value = ''
          setSug(null)
        }}
      />
      {sug?.box === box && !!sug.items.length && (
        <div className="cmd-sug" role="listbox">
          {sug.items.map((it, k) => (
            <button
              type="button"
              className={`cmd-sg${it.g ? ' grp' : ''}${k === sug.i ? ' on' : ''}`}
              key={k}
              role="option"
              aria-selected={k === sug.i}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pickSug(k)}
            >
              {it.g ? (
                <>
                  <span className="cmd-av grp">▤</span>
                  <b>{it.g.name}</b>
                  <span className="cmd-sgorg">
                    {it.g.mails.filter((m) => !lists[sug.box].includes(m)).length}명 모두 넣기
                  </span>
                </>
              ) : (
                <>
                  <span className="cmd-av" style={{ background: `hsl(${hue(it.p!.name)} 30% 46%)` }}>
                    {it.p!.name.slice(0, 1)}
                  </span>
                  <b>{it.p!.name}</b>
                  {!!it.p!.rank && <span className="cmd-oprk">{it.p!.rank}</span>}
                  {/* 다른 칸에 이미 서 있으면 알려 준다 — 골라도 거기 그대로
                      두고 이 칸에 **더한다**(지시: 같은 사람도 넣을 수 있게) */}
                  {wheresOf(it.p!.mail).map((b) => (
                    <span key={b} className={`cmd-optag ${b}`}>
                      {BOXTAG[b]}
                    </span>
                  ))}
                  <span className="cmd-sgorg">{it.p!.path}</span>
                  <span className="cmd-sgmail">{it.p!.mail}</span>
                </>
              )}
            </button>
          ))}
          <div className="cmd-sghint">↑↓ 고르기 · Enter 넣기 · Esc 닫기</div>
        </div>
      )}
    </div>
  )

  const orgBtn = (box: Box) => (
    <button
      type="button"
      className={`cmd-orgb${orgOn && orgBox === box ? ' on' : ''}`}
      aria-pressed={orgOn && orgBox === box}
      title={`조직도에서 골라 ${BOXNAME[box]}에 넣습니다`}
      onClick={() => {
        if (orgOn && orgBox === box) setOrgOn(false)
        else {
          setOrgBox(box)
          setOrgOn(true)
        }
      }}
    >
      ▤ 조직도
    </button>
  )

  const total = BOXES.reduce((a, b) => a + lists[b].length, 0)

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div
        className={`modal cmd${orgOn ? ' org-on' : ''}${dragOn ? ' dragging' : ''}`}
        onMouseDown={(e) => e.stopPropagation()}
        onDragEnter={(e) => {
          if ([...e.dataTransfer.types].includes('Files')) {
            e.preventDefault()
            setDragOn(true)
          }
        }}
        onDragOver={(e) => {
          if ([...e.dataTransfer.types].includes('Files')) e.preventDefault()
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOn(false)
        }}
        onDrop={(e) => {
          if (![...e.dataTransfer.types].includes('Files')) return
          e.preventDefault()
          setDragOn(false)
          void addFiles(e.dataTransfer.files)
        }}
      >
        <div className="modal-head">
          <b>결과 메일</b>
          <span className="muted small cu-mono">{cycle.name || cycle.cid || cycle.id}</span>
          <span className="sp" />
          <button className="modal-x" type="button" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        <div className="cmd-mid">
          <div className="modal-body cmd-body">
            <div className="cmd-f">
              <label>
                받는 사람<i>*</i>
                {orgBtn('to')}
              </label>
              {chipField('to')}
            </div>

            <div className="cmd-f">
              <label>
                참조
                <button
                  type="button"
                  className="cmd-pm"
                  aria-expanded={bccOpen}
                  title={bccOpen ? '숨은 참조 접기' : '숨은 참조 펼치기'}
                  onClick={() => {
                    const next = !bccOpen
                    setBccOpen(next)
                    if (!next && orgBox === 'bcc') setOrgBox('cc')
                  }}
                >
                  {bccOpen ? '−' : '+'}
                </button>
                {/* 접혀 있어도 넣은 사람은 그대로 간다 — 몇 명인지 드러내 둔다 */}
                {!bccOpen && !!lists.bcc.length && (
                  <button
                    type="button"
                    className="cmd-bcchint"
                    title={lists.bcc.map((m) => (byMail[m]?.name ? `${byMail[m]?.name} <${m}>` : m)).join('\n')}
                    onClick={() => setBccOpen(true)}
                  >
                    숨은 참조 {lists.bcc.length}명
                  </button>
                )}
                {orgBtn('cc')}
              </label>
              {chipField('cc')}
            </div>

            {bccOpen && (
              <div className="cmd-f">
                <label>
                  숨은 참조{orgBtn('bcc')}
                </label>
                {chipField('bcc')}
              </div>
            )}

            <div className="cmd-f">
              <label htmlFor="cmd-sub">제목</label>
              <input
                className="cmd-in"
                id="cmd-sub"
                value={subject}
                /* 자동 제목은 **흐린 글씨로 그 자리에** 보인다 — 아래에 한 번
                   더 적으면 같은 말이 두 줄이 된다(지시: 문구 제거) */
                placeholder={autoSubj || '비우면 자동 제목이 들어갑니다'}
                autoComplete="off"
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>

            <div className="cmd-f">
              <label>첨부 파일</label>
              {!!files.length && (
                <ul className="cmd-att">
                  {files.map((f) => (
                    <li key={f.id}>
                      <span className="cmd-ext" style={{ background: extColor(extOf(f.name)) }}>
                        {extOf(f.name)}
                      </span>
                      <span className="cmd-attnm" title={f.name}>
                        {f.name}
                      </span>
                      <span className="cmd-attsz">{fmtSize(f.size)}</span>
                      <button
                        type="button"
                        title="빼기"
                        aria-label={`${f.name} 빼기`}
                        onClick={() => {
                          setFiles((v) => v.filter((x) => x.id !== f.id))
                          setAttMsg('')
                        }}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <label className={`cmd-drop${files.length ? ' sm' : ''}`}>
                <span>{files.length ? '더 넣으려면 끌어 놓거나' : '파일을 여기에 끌어 놓거나'}</span>
                <span className="cmd-pick">파일 선택</span>
                <span className="cmd-cap">
                  {files.length ? `${files.length}개 · ${fmtSize(attTotal)} / 25 MB` : '전체 25 MB까지'}
                </span>
                <input
                  type="file"
                  multiple
                  onChange={(e) => {
                    if (e.target.files?.length) void addFiles(e.target.files)
                    e.target.value = ''
                  }}
                />
              </label>
              {!!attMsg && <div className="cmd-attmsg">{attMsg}</div>}
            </div>

            <div className="cmd-f cmd-grow">
              <label>
                내용
                <button
                  type="button"
                  className="cmd-lnk"
                  title="이 사이클의 Test Summary 를 다시 가져옵니다"
                  onClick={() => {
                    if (bodyRef.current) bodyRef.current.innerHTML = seedBody
                    setBody(seedBody)
                  }}
                >
                  Test Summary 값으로 되돌리기
                </button>
                <button type="button" className="cmd-lnk" disabled={!!busy} onClick={() => void preview()}>
                  {busy === 'prev' ? '만드는 중…' : '미리보기'}
                </button>
              </label>
              <div
                className="cmd-in cmd-doc"
                ref={bodyRef}
                contentEditable
                suppressContentEditableWarning
                spellCheck={false}
                onInput={(e) => setBody(e.currentTarget.innerHTML)}
              />
              <span className="cmd-hint">
                여기 적은 글이 메일 맨 위에 실립니다 — 아래로는 서버가 판정 표를 붙입니다.
              </span>
            </div>

            {!!prev && (
              <div className="cmd-f">
                <label>
                  미리보기 — 실제로 나갈 모습
                  <button type="button" className="cmd-lnk" onClick={() => setPrev(null)}>
                    닫기
                  </button>
                </label>
                <iframe className="cmd-prev" title="메일 미리보기" sandbox="" srcDoc={prev} />
              </div>
            )}
          </div>

          {orgOn && (
            <aside className="cmd-org" aria-label="조직도">
              <div className="cmd-orghd">
                <b>조직도</b>
                <div className="cmd-seg" role="group" aria-label="넣을 칸">
                  {BOXES.filter((b) => b !== 'bcc' || bccOpen).map((b) => (
                    <button
                      type="button"
                      key={b}
                      className={`${b}${b === orgBox ? ' on' : ''}`}
                      aria-pressed={b === orgBox}
                      onClick={() => setOrgBox(b)}
                    >
                      {BOXNAME[b]}
                      <em>{lists[b].length}</em>
                    </button>
                  ))}
                </div>
                <button type="button" className="modal-x" title="조직도 닫기" onClick={() => setOrgOn(false)}>
                  ✕
                </button>
              </div>
              <div className="cmd-orgq">
                <input
                  value={orgQ}
                  placeholder="이름 · 아이디 · 이메일 · 조직 찾기"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => {
                    setOrgQ(e.target.value)
                    setSclose(new Set())
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
                    e.preventDefault()
                    const f = readHit()
                    if (f?.mail) {
                      put(orgBox, [f.mail])
                      setOrgQ('')
                    }
                  }}
                />
                {!!orgQ && (
                  <button type="button" title="검색어 지우기" onClick={() => setOrgQ('')}>
                    ✕
                  </button>
                )}
              </div>
              <div className="cmd-orgmeta">
                {q ? (
                  <span>
                    검색 결과 <b>{hitN}</b>명
                    {first ? (
                      <>
                        {' · Enter 로 '}
                        <b>{first.name}</b> 넣기
                      </>
                    ) : null}
                  </span>
                ) : (
                  <span>{book.loading ? '조직도를 읽는 중…' : `${book.people.length}명`}</span>
                )}
                <span className="sp" />
                <button
                  type="button"
                  onClick={() => (q ? setSclose(new Set()) : setOpen(new Set(Object.keys(orgs))))}
                >
                  모두 펼치기
                </button>
                <button
                  type="button"
                  onClick={() => (q ? setSclose(new Set(Object.keys(orgs))) : setOpen(new Set()))}
                >
                  모두 접기
                </button>
              </div>
              <div className="cmd-orglist">
                {rows.length ? rows : <div className="cmd-orgempty">맞는 사람·조직이 없습니다.</div>}
              </div>
              <div className="cmd-orgft">
                사람을 누르면 위에서 고른 칸에 넣고, 다시 누르면 뺍니다. 조직 줄의 <b>＋</b> 는 아직 넣지 않은
                사람을 모두 넣습니다. 계정이 없는 사람은 고를 수 없습니다.
              </div>
            </aside>
          )}
        </div>

        <div className="modal-foot cmd-foot">
          {msg ? (
            <span className={`cmd-warn ${msg.kind}`}>{msg.text}</span>
          ) : !lists.to.length ? (
            <span className="cmd-warn err">받는 사람을 한 명 이상 넣어 주세요.</span>
          ) : bad ? (
            <span className="cmd-warn err">주소 형식이 아닌 것이 있습니다.</span>
          ) : (
            <span className="cmd-warn">
              {total}명에게 보냅니다 (
              {BOXES.filter((b) => lists[b].length)
                .map((b) => `${BOXNAME[b]} ${lists[b].length}`)
                .join(' · ')}
              ){files.length ? ` · 첨부 ${files.length}개 ${fmtSize(attTotal)}` : ''} — 보낸 메일은 무를 수 없습니다.
            </span>
          )}
          <button className="btn" type="button" onClick={onClose}>
            닫기
          </button>
          <button className="btn cpl-teal" type="button" disabled={!ready || !!busy} onClick={() => void send()}>
            {busy === 'send' ? '보내는 중…' : '보내기'}
          </button>
        </div>
      </div>
    </div>
  )
}
