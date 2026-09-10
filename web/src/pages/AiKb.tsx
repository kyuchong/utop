/**
 * Knowledge AI — **쌓인 자료에서 찾아 답하는 자리** (승인: B 인트로 + C 동작).
 *
 *   B — 1열 대화 목록은 늘 서 있고, 인트로는 2/3열을 합친 자리에 뜬다.
 *   C — 답은 넓게 보이고, 3열(근거)은 답 속 [n] 을 누를 때만 열린다.
 *
 * 자료는 전부 **우리 저장소**다: Wiki·요구사항/시험·사이클 결과는 PG,
 * 지라는 아침마다 받아 둔 jira_cache. 묻는다고 지라에 실시간으로 안 간다.
 * 대화는 계정별로 남아 다음 접속에 이어진다.
 *
 * 왼쪽 레일은 목업 구조 그대로다 — 검색 범위 · 네 갈래 · 프로젝트 · 대화.
 * 범위는 **하나만 고른다**(목업). 여러 개를 켜고 끄는 칩이었는데, 셋을 켜
 * 두고 물으면 어디서 나온 답인지 알 수 없었다.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { apiFetch } from '@/api/client'
import { goto } from '@/api/goto'
import { prefGet, prefSet } from '@/lib/prefs'
import { currentProjects } from '@/components/ProjectPicker'
import Resizer, { useResizableWidth } from '@/components/Resizer'
import './AiKb.css'

interface KaiSource {
  kind: 'wiki' | 'tc' | 'req' | 'run' | 'jira'
  id: string
  title: string
  snippet?: string
  extra?: { status?: string; updated?: string }
}
interface KaiMsg {
  role: 'u' | 'a'
  text: string
  sources?: KaiSource[]
  at?: string
}
interface KaiThread {
  id: string
  title: string
  at: string
  msgs?: KaiMsg[]
  n?: number
  folder?: string
}
interface KaiFolder {
  id: string
  name: string
  instr?: string
  at?: string
  n?: number
}

/**
 * 검색 범위 — **하나만 고른다**(목업).
 *
 * 서버가 받는 이름(`wiki·tc·cycle·jira`)과 화면에 쓰는 이름이 한 군데서만
 * 갈리게 둔다. `test` 는 화면 말이고 서버로는 `tc` 로 나간다.
 */
const SPACES = [
  ['all', '✦', '전체', '모든 저장소에서 찾기'],
  ['wiki', '📖', 'WIKI', 'WIKI 문서에서만'],
  ['test', '🧪', '시험', '요구사항 · 시험 항목에서만'],
  ['cycle', '🔄', '사이클', '시험 결과 · 실행에서만'],
  ['jira', '🐞', 'Jira', '이슈에서만'],
] as const
type SpaceKey = (typeof SPACES)[number][0]

const SPACE_INFO: Record<SpaceKey, { pill: string; desc: string; ph: string; ops: string[] }> = {
  all: {
    pill: '전체 검색',
    desc: '문서 · 요구사항 · 시험 · 결과 · 이슈에서 답을 찾습니다',
    ph: 'UBIQUOSS Knowledge Assistant',
    ops: ['E6100 동작 온도 스펙 알려줘', '지난주 주간 업무 보고 요약해줘', 'Kernel Panic 이슈 찾아줘'],
  },
  wiki: {
    pill: 'WIKI 문서만 검색',
    desc: '등록된 WIKI · 기술 문서 내용을 기준으로 답합니다',
    ph: 'WIKI 문서에서 찾을 내용을 질문하세요',
    ops: ['E6100 동작 온도 스펙 알려줘', '지난주 주간 업무 보고 요약해줘', '남은 할 일 뭐 있어'],
  },
  test: {
    pill: '시험 항목만 검색',
    desc: 'REQ-Coverage 의 요구사항 · 시험 항목에서 답합니다',
    ph: '요구사항 · 시험 항목을 질문하세요',
    ops: ['sysName 시험 항목 찾아줘', '냉각 팬 시험 절차 알려줘', 'E61xx-R0007 항목 전부'],
  },
  cycle: {
    pill: '시험 결과만 검색',
    desc: '사이클 · 실행 판정에서 집계해 답합니다',
    ph: '시험 결과 · 실행을 질문하세요',
    ops: ['E6100 R100 시험 결과', 'R100, R200 시험 결과 비교', '실패 항목 뭐 있어'],
  },
  jira: {
    pill: 'Jira 이슈만 검색',
    desc: '받아 둔 Jira 이슈에서 답합니다',
    ph: '이슈를 질문하세요',
    ops: ['열린 이슈 목록', 'Kernel Panic 이슈 찾아줘', '팬 경보 이슈'],
  },
}
/** 화면의 범위 → 서버가 아는 저장소 이름 */
const SPACE_SCOPES: Record<SpaceKey, string[]> = {
  all: ['wiki', 'tc', 'cycle', 'jira'],
  wiki: ['wiki'],
  test: ['tc'],
  cycle: ['cycle'],
  jira: ['jira'],
}

const KIND_LABEL: Record<KaiSource['kind'], [string, string]> = {
  wiki: ['Wiki', 'g1'],
  tc: ['시험', 'g2'],
  req: ['요구사항', 'g2'],
  run: ['실행', 'g2'],
  jira: ['Jira', 'g3'],
}

/* 레일 아이콘 — 목업 것 그대로. 이모지로 두면 기기마다 크기가 달라진다 */
const IcoPanel = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="19" height="19" aria-hidden="true">
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
  </svg>
)
const IcoFolder = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="19" height="19" aria-hidden="true">
    <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h3.6a1.5 1.5 0 0 1 1.1.5l1 1.1h7.3A1.5 1.5 0 0 1 20 9.1V17a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17z" />
  </svg>
)
const IcoBook = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="19" height="19" aria-hidden="true">
    <rect x="3.5" y="4" width="4.5" height="16" rx="1.2" />
    <rect x="9.5" y="4" width="4.5" height="16" rx="1.2" />
    <path d="M16.6 5.6 20 4.7a1 1 0 0 1 1.2.7l3 13.6-4.6 1.2z" />
  </svg>
)
const IcoSearch = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="19" height="19" aria-hidden="true">
    <circle cx="11" cy="11" r="6" />
    <path d="m20 20-4.4-4.4" />
  </svg>
)

/** 답 속 [n] 을 누르는 것으로 바꾼다 — C 동작의 핵심 */
function mdWithCits(text: string): string {
  const html = DOMPurify.sanitize(
    marked.parse(text || '', { async: false, breaks: true, gfm: true }) as string,
    { ADD_ATTR: ['target', 'rel'] },
  )
  return html.replace(/\[(\d{1,2})\]/g, '<sup class="kai-cit" data-n="$1" role="button" tabindex="0">$1</sup>')
}

export default function AiKb() {
  const qc = useQueryClient()
  const [tid, setTid] = useState('')
  const [msgs, setMsgs] = useState<KaiMsg[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  /** 검색 범위 — 하나만. 계정을 따라간다 */
  const [space, setSpace] = useState<SpaceKey>(() => {
    const v = prefGet('utop.kai.space')
    return (SPACES.some(([k]) => k === v) ? v : 'all') as SpaceKey
  })
  useEffect(() => {
    prefSet('utop.kai.space', space)
  }, [space])
  const [spaceOpen, setSpaceOpen] = useState(false)
  const [capOpen, setCapOpen] = useState(false)
  /** 오른쪽에 무엇을 세울까 — 대화 · 프로젝트 목록 · 라이브러리 */
  const [view, setView] = useState<'chat' | 'projects' | 'library'>('chat')
  /** 지금 들어가 있는 프로젝트. 빈 글자면 밖 */
  const [curFold, setCurFold] = useState('')
  /** 레일 접기 — 계정을 따라간다 */
  const [railShut, setRailShut] = useState(() => prefGet('utop.ntb.kai.shut') === '1')
  useEffect(() => {
    prefSet('utop.ntb.kai.shut', railShut ? '1' : '0')
  }, [railShut])
  const [listAll, setListAll] = useState(false)
  const [findOpen, setFindOpen] = useState(false)
  const [findQ, setFindQ] = useState('')
  /** 대화 ⋯ 메뉴가 열린 대화 */
  const [thMenu, setThMenu] = useState('')
  /** 3열 — 열림 여부와 지금 짚은 근거 번호(C 동작: [n] 을 눌러야 연다) */
  const [srcOpen, setSrcOpen] = useState(false)
  const [srcFocus, setSrcFocus] = useState(0)
  const endRef = useRef<HTMLDivElement>(null)
  const inRef = useRef<HTMLInputElement>(null)
  const chatInRef = useRef<HTMLInputElement>(null)
  /* 열 폭 — 다른 화면과 같은 공용 이동바(지시). 계정을 따라간다. */
  const rootRef = useRef<HTMLDivElement>(null)
  const [w1, setW1] = useResizableWidth('utop.ntb.kai.w1', 215, 160, 420)
  const [w3, setW3] = useResizableWidth('utop.ntb.kai.w3', 330, 240, 560)

  const thQ = useQuery({
    queryKey: ['kai-threads'],
    queryFn: async () => {
      const r = await apiFetch('/api/kai/threads')
      return (await r.json()) as { threads?: KaiThread[] }
    },
  })
  const threads = useMemo(() => thQ.data?.threads ?? [], [thQ.data])

  const foldQ = useQuery({
    queryKey: ['kai-folders'],
    queryFn: async () => {
      const r = await apiFetch('/api/kai/folders')
      return (await r.json()) as { folders?: KaiFolder[] }
    },
  })
  const folders = foldQ.data?.folders ?? []

  /* 다음 접속은 마지막 대화로 — 대화가 있는데 인트로부터 보이면
     「내 대화 어디 갔지」 가 된다(승인된 흐름 3번). */
  const booted = useRef(false)
  useEffect(() => {
    if (booted.current || !thQ.isSuccess) return
    booted.current = true
    const first = threads[0]
    if (first?.id) void openThread(first.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thQ.isSuccess])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [msgs, busy])

  /* 어디를 눌러도 열린 메뉴는 닫힌다 — 메뉴가 남아 있으면 다음 누름이 먹히지 않는다 */
  useEffect(() => {
    if (!thMenu && !spaceOpen && !capOpen) return
    const off = () => {
      setThMenu('')
      setSpaceOpen(false)
      setCapOpen(false)
    }
    window.addEventListener('click', off)
    return () => window.removeEventListener('click', off)
  }, [thMenu, spaceOpen, capOpen])

  async function openThread(id: string) {
    const r = await apiFetch(`/api/kai/thread/${encodeURIComponent(id)}`)
    const j = (await r.json()) as { ok?: boolean; thread?: KaiThread }
    if (!j.ok || !j.thread) return
    setTid(id)
    setMsgs(j.thread.msgs ?? [])
    setSrcOpen(false)
    setView('chat')
    setCurFold(j.thread.folder ?? '')
  }

  function newThread(fold = curFold) {
    setTid('')
    setMsgs([])
    setSrcOpen(false)
    setText('')
    setView('chat')
    setCurFold(fold)
  }

  async function delThread(id: string) {
    if (!window.confirm('이 대화를 지웁니다.')) return
    await apiFetch(`/api/kai/thread/${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (id === tid) newThread()
    void qc.invalidateQueries({ queryKey: ['kai-threads'] })
    void qc.invalidateQueries({ queryKey: ['kai-folders'] })
  }

  async function patchThread(id: string, p: { title?: string; folder?: string }) {
    await apiFetch(`/api/kai/thread/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(p),
    })
    void qc.invalidateQueries({ queryKey: ['kai-threads'] })
    void qc.invalidateQueries({ queryKey: ['kai-folders'] })
  }

  async function newFolder() {
    const nm = window.prompt('새 프로젝트 이름')
    if (!nm?.trim()) return
    const r = await apiFetch('/api/kai/folders', {
      method: 'POST',
      body: JSON.stringify({ name: nm.trim() }),
    })
    const j = (await r.json()) as { ok?: boolean; error?: string; folder?: KaiFolder }
    if (!j.ok) {
      window.alert(j.error || '프로젝트를 만들지 못했습니다')
      return
    }
    void qc.invalidateQueries({ queryKey: ['kai-folders'] })
    if (j.folder?.id) {
      setCurFold(j.folder.id)
      setView('chat')
    }
  }

  async function delFolder(f: KaiFolder) {
    if (!window.confirm(`「${f.name}」 프로젝트를 지웁니다.\n안의 대화는 지워지지 않고 밖으로 나옵니다.`)) return
    await apiFetch(`/api/kai/folder/${encodeURIComponent(f.id)}`, { method: 'DELETE' })
    if (curFold === f.id) setCurFold('')
    void qc.invalidateQueries({ queryKey: ['kai-folders'] })
    void qc.invalidateQueries({ queryKey: ['kai-threads'] })
  }

  async function renameFolder(f: KaiFolder) {
    const nm = window.prompt('프로젝트 이름', f.name)
    if (!nm?.trim() || nm.trim() === f.name) return
    await apiFetch(`/api/kai/folder/${encodeURIComponent(f.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: nm.trim() }),
    })
    void qc.invalidateQueries({ queryKey: ['kai-folders'] })
  }

  async function editInstr(f: KaiFolder) {
    const v = window.prompt(
      '이 프로젝트의 지침 — 이 안에서 묻는 동안 늘 따릅니다\n(예: 표로 정리해 줘 · E61xx 기준으로만)',
      f.instr ?? '',
    )
    if (v === null) return
    await apiFetch(`/api/kai/folder/${encodeURIComponent(f.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ instr: v }),
    })
    void qc.invalidateQueries({ queryKey: ['kai-folders'] })
  }

  async function ask(q0?: string) {
    const q = (q0 ?? text).trim()
    if (!q || busy) return
    setText('')
    setBusy(true)
    setView('chat')
    /* 질문과 **빈 답그릇**을 먼저 놓는다 — 글자가 오는 대로 그릇에 붓는다
       (승인: 스트리밍). 답을 다 만들 때까지 「찾는 중…」 만 보이던 3~6초
       침묵이 이걸로 사라진다. */
    setMsgs((m) => [...m, { role: 'u', text: q }, { role: 'a', text: '' }])
    const pour = (fn: (a: KaiMsg) => KaiMsg) =>
      setMsgs((m) => {
        const nx = [...m]
        const last = nx[nx.length - 1]
        if (last?.role === 'a') nx[nx.length - 1] = fn(last)
        return nx
      })
    try {
      const r = await apiFetch('/api/kai/ask-stream', {
        method: 'POST',
        /* 상단에서 고른 프로젝트를 따라간다(질문) — 그 프로젝트 것과 공용 문서만 */
        body: JSON.stringify({
          tid,
          q,
          scopes: SPACE_SCOPES[space],
          projects: currentProjects(),
          folder: curFold,
        }),
      })
      if (!r.ok || !r.body) throw new Error('답을 만들지 못했습니다')
      const reader = r.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      let acc = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        for (;;) {
          const cut = buf.indexOf('\n\n')
          if (cut < 0) break
          const line = buf.slice(0, cut)
          buf = buf.slice(cut + 2)
          if (!line.startsWith('data:')) continue
          let evj: { type?: string; t?: string; tid?: string; error?: string; sources?: KaiSource[] }
          try {
            evj = JSON.parse(line.slice(5))
          } catch {
            continue
          }
          if (evj.type === 'meta') pour((a) => ({ ...a, sources: evj.sources }))
          else if (evj.type === 'delta' || evj.type === 'note') {
            acc += evj.t ?? ''
            const now = acc
            pour((a) => ({ ...a, text: now }))
          } else if (evj.type === 'done') {
            if (evj.error) throw new Error(evj.error)
            if (evj.tid) setTid(evj.tid)
          }
        }
      }
      void qc.invalidateQueries({ queryKey: ['kai-threads'] })
      void qc.invalidateQueries({ queryKey: ['kai-folders'] })
    } catch (e) {
      pour((a) => ({ ...a, text: `⚠ ${e instanceof Error ? e.message : String(e)}` }))
    } finally {
      setBusy(false)
      /* 손이 바로 다음 질문으로 가게 — 보내기 단추에 남은 포커스를 되찾는다 */
      chatInRef.current?.focus()
    }
  }

  /** 지금 3열에 낼 근거 — 마지막 답의 것 */
  const lastSources = useMemo(() => {
    for (let i = msgs.length - 1; i >= 0; i--) {
      const sx = msgs[i]?.sources
      if (sx?.length) return sx
    }
    return []
  }, [msgs])

  function openSource(kind: KaiSource['kind'], id: string) {
    if (kind === 'wiki') goto('wiki', id)
    else if (kind === 'tc') goto('tc', id)
    else if (kind === 'req') goto('req', id)
    else if (kind === 'run') goto('run', id)
    else goto('releases', id)
  }

  const info = SPACE_INFO[space]
  const spaceDef = SPACES.find(([k]) => k === space)!
  const home = view === 'chat' && !msgs.length && !busy
  const foldNow = folders.find((f) => f.id === curFold) ?? null
  /** 레일의 「채팅 및 작업」 — 프로젝트에 안 든 대화만. 폴더 것은 폴더 아래에 선다 */
  const rootThreads = threads.filter((t) => !t.folder)
  const shownRoot = listAll ? rootThreads : rootThreads.slice(0, 12)
  const findHits = useMemo(() => {
    const q = findQ.trim().toLowerCase()
    if (!q) return threads.slice(0, 20)
    return threads.filter((t) => (t.title || '').toLowerCase().includes(q)).slice(0, 40)
  }, [findQ, threads])

  /** 범위 고르개 — 레일(알약)과 입력 캡슐(작은 알약)이 같은 목록을 쓴다 */
  const spaceList = (cls: string, close: () => void) => (
    <span className={cls} role="listbox">
      {SPACES.map(([k, ico, label, tip]) => (
        <button
          key={k}
          type="button"
          role="option"
          aria-selected={space === k}
          className={`sdd-opt${space === k ? ' on' : ''}`}
          data-space={k}
          title={tip}
          onClick={(e) => {
            e.stopPropagation()
            setSpace(k)
            close()
          }}
        >
          <i className="sico">{ico}</i>
          <b>{label}</b>
          <em className="sdd-cnt">{SPACE_INFO[k].pill}</em>
          {space === k && <i className="sdd-ck">✓</i>}
        </button>
      ))}
    </span>
  )

  /** 입력 캡슐 — 인트로와 대화 아래가 같은 부품을 쓴다(목업) */
  const capsule = (chat: boolean) => (
    <div className={`kai-cap${chat ? ' chat' : ''}`}>
      <input
        ref={chat ? chatInRef : inRef}
        value={text}
        placeholder={chat ? '이어서 물어보세요' : info.ph}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return
          if (e.key === 'Enter' && text.trim() && !busy) void ask()
        }}
      />
      <div className="row">
        <span className="cap-scope">
          <button
            type="button"
            className={`cap-pill sp-${space}`}
            aria-haspopup="listbox"
            aria-expanded={capOpen}
            onClick={(e) => {
              e.stopPropagation()
              setCapOpen((v) => !v)
            }}
          >
            {spaceDef[1]} {info.pill}
            <i className="cap-car" aria-hidden="true">▾</i>
          </button>
          {capOpen && spaceList('cap-pop', () => setCapOpen(false))}
        </span>
        <span className="cap-desc">{info.desc}</span>
        <span className="sp" />
        <button
          type="button"
          className={`kai-send${text.trim() && !busy ? ' on' : ''}${chat ? ' sm' : ''}`}
          disabled={busy || !text.trim()}
          onClick={() => void ask()}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h13M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>
    </div>
  )

  /** 대화 한 줄 — 레일에서 두 자리(뿌리·프로젝트 아래)가 같은 꼴로 쓴다 */
  const thRow = (t: KaiThread, inFold: boolean) => (
    <div key={t.id} className={`kai-th${t.id === tid ? ' on' : ''}${inFold ? ' sub' : ''}`}>
      <button type="button" className="nm" title={t.title} onClick={() => void openThread(t.id)}>
        {t.title || '(제목 없음)'}
      </button>
      <button
        type="button"
        className="mo"
        title="이름 바꾸기 · 프로젝트로 옮기기 · 지우기"
        aria-haspopup="menu"
        onClick={(e) => {
          e.stopPropagation()
          setThMenu((v) => (v === t.id ? '' : t.id))
        }}
      >
        ⋯
      </button>
      {thMenu === t.id && (
        <div className="kai-thmenu" role="menu" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => {
              const nm = window.prompt('대화 이름', t.title)
              setThMenu('')
              if (nm?.trim() && nm.trim() !== t.title) void patchThread(t.id, { title: nm.trim() })
            }}
          >
            이름 바꾸기
          </button>
          {/* 프로젝트가 없으면 옮길 곳도 없다 — 만들라고 말한다 */}
          {folders.length === 0 ? (
            <span className="kai-thmenu-none">프로젝트를 먼저 만드세요</span>
          ) : (
            <>
              <span className="kai-thmenu-lab">프로젝트로 옮기기</span>
              {folders.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={t.folder === f.id ? 'on' : ''}
                  onClick={() => {
                    setThMenu('')
                    void patchThread(t.id, { folder: t.folder === f.id ? '' : f.id })
                  }}
                >
                  {t.folder === f.id ? '✓ ' : ''}
                  {f.name}
                </button>
              ))}
            </>
          )}
          <span className="kai-thmenu-sep" />
          <button
            type="button"
            className="danger"
            onClick={() => {
              setThMenu('')
              void delThread(t.id)
            }}
          >
            지우기
          </button>
        </div>
      )}
    </div>
  )

  return (
    <div className="kai" ref={rootRef}>
      {/* ── 1열 — 레일(목업 구조). 접으면 아이콘만 남는다 ── */}
      {railShut ? (
        <aside className="kai-rail">
          <button type="button" className="kai-railb" title="사이드바 펴기" onClick={() => setRailShut(false)}>
            <IcoPanel />
          </button>
          <button type="button" className="kai-railb" title="새로 생성" onClick={() => newThread('')}>
            <i className="nico plus">＋</i>
          </button>
          <button type="button" className="kai-railb" title="프로젝트" onClick={() => setView('projects')}>
            <IcoFolder />
          </button>
          <button type="button" className="kai-railb" title="라이브러리" onClick={() => setView('library')}>
            <IcoBook />
          </button>
          <button type="button" className="kai-railb" title="대화 검색" onClick={() => setFindOpen(true)}>
            <IcoSearch />
          </button>
        </aside>
      ) : (
        <aside className="kai-list" style={{ width: w1 }}>
          <div className="kai-sec first">
            <span>검색 범위</span>
            <button
              type="button"
              className="kai-sec-add coll"
              title="사이드바 접기"
              aria-label="사이드바 접기"
              onClick={() => setRailShut(true)}
            >
              <IcoPanel />
            </button>
          </div>
          {/* 범위는 여기서 정한다 — 어디서 찾는지가 이 화면의 첫 물음이다 */}
          <div className={`kai-scopedd${spaceOpen ? ' open' : ''}`}>
            <button
              type="button"
              className={`sdd-btn sp-${space}`}
              aria-haspopup="listbox"
              aria-expanded={spaceOpen}
              onClick={(e) => {
                e.stopPropagation()
                setSpaceOpen((v) => !v)
              }}
            >
              <i className="sdd-dot" />
              <span className="sdd-nm">{spaceDef[2]}</span>
              <i className="sdd-car" aria-hidden="true">▾</i>
            </button>
            {spaceOpen && spaceList('sdd-list', () => setSpaceOpen(false))}
          </div>

          <div className="kai-nav">
            <button
              type="button"
              className={`kai-new${view === 'chat' && !tid ? ' on' : ''}`}
              onClick={() => newThread('')}
            >
              <i className="nico plus" aria-hidden="true">＋</i>
              새로 생성
            </button>
            <button
              type="button"
              className={`kai-navrow${view === 'projects' ? ' on' : ''}`}
              onClick={() => setView('projects')}
            >
              <i className="nico" aria-hidden="true"><IcoFolder /></i>
              프로젝트
            </button>
            <button
              type="button"
              className={`kai-navrow kai-idx${view === 'library' ? ' on' : ''}`}
              onClick={() => setView('library')}
            >
              <i className="nico" aria-hidden="true"><IcoBook /></i>
              라이브러리
            </button>
            <button type="button" className="kai-navrow" onClick={() => setFindOpen(true)}>
              <i className="nico" aria-hidden="true"><IcoSearch /></i>
              대화 검색
            </button>
          </div>

          <div className="kai-sec">
            <span>프로젝트</span>
            <button type="button" className="kai-sec-add" title="새 프로젝트" onClick={() => void newFolder()}>
              ＋
            </button>
          </div>
          <div className="kai-folds">
            {folders.length ? (
              folders.map((f) => {
                const open = curFold === f.id
                const kids = threads.filter((t) => t.folder === f.id)
                return (
                  <div key={f.id} className={`kai-fold${open ? ' open' : ''}`}>
                    <button
                      type="button"
                      className="fd"
                      title={f.instr ? `지침: ${f.instr}` : '지침 없음 — ⋯ 에서 넣을 수 있습니다'}
                      onClick={() => {
                        setCurFold(open ? '' : f.id)
                        setView('chat')
                      }}
                    >
                      <i className="fico" aria-hidden="true"><IcoFolder /></i>
                      <span className="nm">{f.name}</span>
                      {!!f.instr && <em className="fd-i" title="지침이 있습니다">지침</em>}
                      <em className="fd-n">{f.n ?? kids.length}</em>
                    </button>
                    <button
                      type="button"
                      className="mo"
                      title="이름 · 지침 · 지우기"
                      onClick={(e) => {
                        e.stopPropagation()
                        setThMenu((v) => (v === `f:${f.id}` ? '' : `f:${f.id}`))
                      }}
                    >
                      ⋯
                    </button>
                    {thMenu === `f:${f.id}` && (
                      <div className="kai-thmenu" role="menu" onClick={(e) => e.stopPropagation()}>
                        <button type="button" onClick={() => { setThMenu(''); void renameFolder(f) }}>
                          이름 바꾸기
                        </button>
                        <button type="button" onClick={() => { setThMenu(''); void editInstr(f) }}>
                          지침 {f.instr ? '고치기' : '넣기'}
                        </button>
                        <span className="kai-thmenu-sep" />
                        <button type="button" className="danger" onClick={() => { setThMenu(''); void delFolder(f) }}>
                          프로젝트 지우기
                        </button>
                      </div>
                    )}
                    {open && (
                      <div className="kai-foldths">
                        {kids.map((t) => thRow(t, true))}
                        <button type="button" className="kai-foldnew" onClick={() => newThread(f.id)}>
                          ＋ 이 프로젝트에서 새 대화
                        </button>
                      </div>
                    )}
                  </div>
                )
              })
            ) : (
              <div className="kai-none pinhint">
                <i aria-hidden="true">📁</i>
                프로젝트를 만들면 여기에 섭니다 — 관련된 대화를 묶고 지침을 겁니다
              </div>
            )}
          </div>

          <div className="kai-sec">
            <span>채팅 및 작업</span>
            <button
              type="button"
              className="kai-sec-add"
              title={listAll ? '최근 것만 보기' : '모든 대화 보기'}
              onClick={() => setListAll((v) => !v)}
            >
              ⇅
            </button>
          </div>
          <div className="kai-ths root">
            {shownRoot.map((t) => thRow(t, false))}
            {!rootThreads.length && <div className="kai-none">아직 대화가 없습니다</div>}
            {!listAll && rootThreads.length > 12 && (
              <button type="button" className="kai-more" onClick={() => setListAll(true)}>
                {rootThreads.length - 12}개 더 보기
              </button>
            )}
          </div>
        </aside>
      )}
      {!railShut && (
        <Resizer
          label="대화 목록 폭 조절"
          onResize={setW1}
          getOrigin={() => rootRef.current?.getBoundingClientRect().left ?? 0}
        />
      )}

      {view === 'projects' ? (
        /* ── 프로젝트 목록 ── */
        <section className="kai-pj">
          <div className="kai-pjhd">
            <h1>프로젝트</h1>
            <span className="sp" />
            <button type="button" className="btn small primary" onClick={() => void newFolder()}>
              새 프로젝트
            </button>
          </div>
          <p className="kai-pjsub">
            관련된 대화를 한 묶음으로 두고, 그 안에서 묻는 동안 늘 따를 <b>지침</b>을 겁니다.
          </p>
          {folders.length ? (
            <div className="kai-pjgrid">
              {folders.map((f) => (
                <div key={f.id} className="kai-pjcard">
                  <button
                    type="button"
                    className="hd"
                    onClick={() => {
                      setCurFold(f.id)
                      setView('chat')
                      newThread(f.id)
                    }}
                  >
                    <i aria-hidden="true"><IcoFolder /></i>
                    <b>{f.name}</b>
                  </button>
                  <p className={f.instr ? '' : 'dim'}>{f.instr || '지침 없음'}</p>
                  <div className="ft">
                    <span>대화 {f.n ?? 0}건</span>
                    <span className="sp" />
                    <button type="button" onClick={() => void editInstr(f)}>지침</button>
                    <button type="button" onClick={() => void renameFolder(f)}>이름</button>
                    <button type="button" className="danger" onClick={() => void delFolder(f)}>지우기</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="kai-empty">
              <b>아직 프로젝트가 없습니다</b>
              <span>「새 프로젝트」 로 만들어 보세요. 대화를 ⋯ 에서 옮겨 담을 수 있습니다.</span>
            </div>
          )}
        </section>
      ) : view === 'library' ? (
        /* ── 라이브러리 — 담을 것이 아직 없다. 무엇을 담는 자리인지 말한다 ── */
        <section className="kai-pj">
          <div className="kai-pjhd">
            <h1>라이브러리</h1>
          </div>
          <div className="kai-empty">
            <b>담아 둔 것이 없습니다</b>
            <span>
              답을 문서로 저장하면 여기에 쌓입니다 — 저장 단추는 다음 판에 붙습니다.
              지금은 답 속 [n] 을 눌러 근거를 열고 원본으로 갈 수 있습니다.
            </span>
          </div>
        </section>
      ) : home ? (
        /* ── 인트로 — 2/3열을 합친 자리(B). 범위에 따라 말이 바뀐다 ── */
        <section className="kai-intro">
          <span className="sky" aria-hidden="true">
            <i className="o1" />
            <i className="o2" />
            <i className="o3" />
          </span>
          <span className="kai-badge">
            <i aria-hidden="true">✦</i>UBIQUOSS Knowledge Assistant
          </span>
          <h1>{space === 'all' ? '무엇이든 물어보세요' : `${spaceDef[2]}에 물어보세요`}</h1>
          <p className="kai-sub">
            {space === 'all' ? '문서 · 요구사항 · 시험 · 결과 · 이슈에서 답을 찾아드립니다' : `${spaceDef[3]} 찾습니다`}
          </p>
          {!!foldNow && (
            <div className="kai-inproj">
              📁 <b>{foldNow.name}</b> 안에서 묻습니다
              {!!foldNow.instr && <em>지침 있음</em>}
              <button type="button" title="프로젝트 밖으로" onClick={() => setCurFold('')}>✕</button>
            </div>
          )}
          {capsule(false)}
          <div className="kai-ops">
            {info.ops.map((x) => (
              <button
                key={x}
                type="button"
                className="kai-op"
                onClick={() => {
                  setText(x)
                  inRef.current?.focus()
                }}
              >
                <i aria-hidden="true">✦</i>
                {x}
              </button>
            ))}
          </div>
          <div className="kai-cando">
            <small>KNOWLEDGE AI 가 하는 일</small>
            <div className="row2">
              <span className="cd t1"><i>📖</i>문서 검색</span>
              <span className="cd t2"><i>🧪</i>요구사항·시험 찾기</span>
              <span className="cd t3"><i>📊</i>시험 결과 조회</span>
              <span className="cd t4"><i>🐞</i>이슈 검색</span>
            </div>
          </div>
        </section>
      ) : (
        /* ── 2열 대화 + (C) 눌러야 열리는 3열 ── */
        <>
          <section className="kai-chat">
            <div
              className="kai-msgs"
              onClick={(e) => {
                const t0 = (e.target as HTMLElement).closest('.kai-cit')
                if (!t0) return
                setSrcFocus(Number((t0 as HTMLElement).dataset.n || 0))
                setSrcOpen(true)
              }}
            >
              {msgs.map((m, i) =>
                m.role === 'u' ? (
                  <div key={i} className="kai-mu">{m.text}</div>
                ) : (
                  <div
                    key={i}
                    className="kai-ma"
                    // 소독(DOMPurify)한 마크다운 — [n] 은 누르는 근거 표가 된다
                    // eslint-disable-next-line react/no-danger
                    dangerouslySetInnerHTML={{ __html: mdWithCits(m.text) }}
                  />
                ),
              )}
              {busy && !msgs[msgs.length - 1]?.text && (
                <div className="kai-wait2">근거 찾는 중…</div>
              )}
              <div ref={endRef} />
            </div>
            <div className="kai-inbar">
              {/* **잠그지 않는다**(지적: 답 뒤에 연속 질문이 안 된다). 답이
                  흐르는 동안에도 다음 질문을 미리 쓸 수 있어야 한다 —
                  못 하는 것은 「보내기」 뿐이다. */}
              {capsule(true)}
            </div>
          </section>

          {srcOpen && (
            <span className="kai-rz3">
              <Resizer
                label="근거 판 폭 조절"
                onResize={(v) => setW3(-v)}
                getOrigin={() => rootRef.current?.getBoundingClientRect().right ?? 0}
              />
            </span>
          )}
          {srcOpen && (
            <aside className="kai-src" style={{ width: w3 }}>
              <header>
                근거 <em>{lastSources.length}건</em>
                <span className="sp" />
                <button type="button" title="닫기" onClick={() => setSrcOpen(false)}>
                  ✕
                </button>
              </header>
              <div className="body">
                {lastSources.map((sx, i) => {
                  const [lb, cls] = KIND_LABEL[sx.kind] ?? ['자료', 'g1']
                  return (
                    <div key={i} className={`card${i + 1 === srcFocus ? ' on' : ''}`}>
                      <div className="k">
                        <span className={`tag ${cls}`}>{lb}</span>
                        <b>{sx.id}</b>
                      </div>
                      <div className="bd">{sx.title}</div>
                      {!!sx.extra?.status && (
                        <div className="fld"><em>상태</em>{sx.extra.status} {sx.extra.updated ? `· ${sx.extra.updated}` : ''}</div>
                      )}
                      {!!sx.snippet && <div className="sn">{sx.snippet}</div>}
                      <button type="button" className="go" onClick={() => openSource(sx.kind, sx.id)}>
                        원본에서 열기 →
                      </button>
                    </div>
                  )
                })}
                {!lastSources.length && <div className="kai-none">이 답에는 근거가 없습니다</div>}
              </div>
            </aside>
          )}
        </>
      )}

      {/* ── 대화 검색 — 제목으로 거른다 ── */}
      {findOpen && (
        <div className="kai-findback" onMouseDown={() => setFindOpen(false)}>
          <div className="kai-find" onMouseDown={(e) => e.stopPropagation()}>
            <input
              autoFocus
              value={findQ}
              placeholder="대화 제목으로 찾기"
              onChange={(e) => setFindQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setFindOpen(false)
                if (e.key === 'Enter' && findHits[0]) {
                  void openThread(findHits[0].id)
                  setFindOpen(false)
                }
              }}
            />
            <div className="hits">
              {findHits.map((t) => {
                const f = folders.find((x) => x.id === t.folder)
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      void openThread(t.id)
                      setFindOpen(false)
                    }}
                  >
                    <b>{t.title || '(제목 없음)'}</b>
                    {!!f && <em>📁 {f.name}</em>}
                    <span className="n">{t.n ?? 0}턴</span>
                  </button>
                )
              })}
              {!findHits.length && <div className="kai-none">찾는 대화가 없습니다</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
