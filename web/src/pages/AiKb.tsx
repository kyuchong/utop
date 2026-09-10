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
  /** 도움이 됐나 — 'up' · 'down' · 빈 값 */
  vote?: string
}
interface KaiDoc {
  id: string
  title: string
  kind: string
  body: string
  from?: string
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
  /** 사람이 읽는 목표 — 카드에 보인다. 지침(instr)과는 쓰임이 다르다 */
  desc?: string
  /** AI 가 따르는 규칙 — 이 프로젝트에서 묻는 동안 프롬프트 맨 앞에 실린다 */
  instr?: string
  /** 레일에 세울까(목업의 고정). false 면 프로젝트 화면에만 있다 */
  pin?: boolean
  /** 보관함으로 치웠나 */
  archived?: boolean
  at?: string
  /** 마지막으로 대화한 때 — 「최근 활동순」 정렬에 쓴다 */
  last?: string
  /** 이 프로젝트에서 먼저 찾을 WIKI 문서 */
  ctxDocs?: string[]
  n?: number
}
interface WikiPage {
  id: string
  title: string
  project?: string
  parent_id?: string
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

/* 고정 핀 — 목업 것 그대로 */
const IcoPin = () => (
  <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
    <path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a5.5 5.5 0 0 1 .16 1.013c.046.702-.032 1.687-.72 2.375a.5.5 0 0 1-.707 0l-2.829-2.828-3.182 3.182c-.195.195-1.219.902-1.414.707s.512-1.22.707-1.414l3.182-3.182-2.828-2.829a.5.5 0 0 1 0-.707c.688-.688 1.673-.766 2.375-.72a5.5 5.5 0 0 1 1.013.16l3.134-3.133a3 3 0 0 1-.04-.461c0-.43.108-1.022.589-1.503a.5.5 0 0 1 .353-.146" />
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
  const [view, setView] = useState<'chat' | 'projects' | 'project' | 'library'>('chat')
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
  /** 프로젝트 화면 — 탭 · 찾기 · 정렬 (목업) */
  const [pjTab, setPjTab] = useState<'mine' | 'arch'>('mine')
  const [pjQ, setPjQ] = useState('')
  const [pjFind, setPjFind] = useState(false)
  const [pjSort, setPjSort] = useState<'date' | 'name'>('date')
  /**
   * 프로젝트 만들기·고치기 창(목업).
   *
   * `window.prompt` 로는 이름과 설명을 한 번에 못 받는다 — 목업이 두 칸짜리
   * 창인 까닭이다. 「무엇을 작업 중이신가요」 와 「어떤 목표를 …」 는 물음이라
   * 좁은 프롬프트 창에 들어가지 않는다.
   */
  const [foldDlg, setFoldDlg] = useState<{ edit: KaiFolder | null; name: string; desc: string } | null>(null)
  /** 지침 창 — 이건 한 칸이라 따로 둔다 */
  const [instrDlg, setInstrDlg] = useState<{ f: KaiFolder; v: string } | null>(null)
  /** WIKI 문서 붙이기 창 */
  const [ctxDlg, setCtxDlg] = useState<{ f: KaiFolder; q: string } | null>(null)
  /** 답을 문서로 저장하는 창 */
  const [saveDlg, setSaveDlg] = useState<{ body: string; title: string; kind: string } | null>(null)
  /** 방금 복사한 답 — 단추가 잠깐 ✓ 로 바뀐다 */
  const [copied, setCopied] = useState(-1)
  /** 라이브러리 — 종류 탭 · 찾기 · 정렬 · 보기 */
  const [libKind, setLibKind] = useState('전체')
  const [libQ, setLibQ] = useState('')
  const [libSort, setLibSort] = useState<'date' | 'name' | 'kind'>('date')
  const [libGrid, setLibGrid] = useState(false)
  const [libOpen, setLibOpen] = useState<KaiDoc | null>(null)
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

  /** 프로젝트가 자주 짚은 근거 — 목업의 「메모리」 */
  const memQ = useQuery({
    queryKey: ['kai-memory', curFold],
    enabled: view === 'project' && !!curFold,
    queryFn: async () => {
      const r = await apiFetch(`/api/kai/folder/${encodeURIComponent(curFold)}/memory`)
      return (await r.json()) as { items?: Array<{ kind: string; id: string; title: string; n: number }>; threads?: number }
    },
  })
  const docQ = useQuery({
    queryKey: ['kai-docs'],
    enabled: view === 'library' || !!saveDlg,
    queryFn: async () => {
      const r = await apiFetch('/api/kai/docs')
      return (await r.json()) as { docs?: KaiDoc[] }
    },
  })
  /** 컨텍스트에 붙일 문서 고르기 — 창을 열 때만 읽는다 */
  const wikiQ = useQuery({
    queryKey: ['kai-wiki'],
    /* 상세에서도 필요하다 — 붙여 둔 문서의 **이름**을 보여야 하니 */
    enabled: !!ctxDlg || view === 'project',
    queryFn: async () => {
      const r = await apiFetch('/api/wiki')
      return (await r.json()) as { pages?: WikiPage[] }
    },
  })

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

  /** 창에서 「프로젝트 생성」·「저장」 을 눌렀을 때 */
  async function saveFolder() {
    const d = foldDlg
    if (!d || !d.name.trim()) return
    if (d.edit) {
      await apiFetch(`/api/kai/folder/${encodeURIComponent(d.edit.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: d.name.trim(), desc: d.desc }),
      })
      setFoldDlg(null)
      void qc.invalidateQueries({ queryKey: ['kai-folders'] })
      return
    }
    const r = await apiFetch('/api/kai/folders', {
      method: 'POST',
      body: JSON.stringify({ name: d.name.trim(), desc: d.desc }),
    })
    const j = (await r.json()) as { ok?: boolean; error?: string; folder?: KaiFolder }
    setFoldDlg(null)
    if (!j.ok) {
      window.alert(j.error || '프로젝트를 만들지 못했습니다')
      return
    }
    void qc.invalidateQueries({ queryKey: ['kai-folders'] })
    /* 만들면 **그 프로젝트로 들어간다**(목업) — 만들자마자 쓰라는 뜻이다 */
    if (j.folder?.id) {
      setCurFold(j.folder.id)
      setView('project')
    }
  }
  async function patchFolder(f: KaiFolder, p: Partial<KaiFolder>) {
    await apiFetch(`/api/kai/folder/${encodeURIComponent(f.id)}`, {
      method: 'PATCH',
      body: JSON.stringify(p),
    })
    void qc.invalidateQueries({ queryKey: ['kai-folders'] })
  }

  async function delFolder(f: KaiFolder) {
    if (!window.confirm(`「${f.name}」 프로젝트를 지웁니다.\n안의 대화는 지워지지 않고 밖으로 나옵니다.`)) return
    await apiFetch(`/api/kai/folder/${encodeURIComponent(f.id)}`, { method: 'DELETE' })
    if (curFold === f.id) setCurFold('')
    void qc.invalidateQueries({ queryKey: ['kai-folders'] })
    void qc.invalidateQueries({ queryKey: ['kai-threads'] })
  }



  async function ask(q0?: string, fresh = false) {
    const q = (q0 ?? text).trim()
    if (!q || busy) return
    setText('')
    setBusy(true)
    setView('chat')
    /* 프로젝트 상세에서 물으면 **새 대화**다 — 그 화면에는 이어붙을 대화가
       떠 있지 않은데, state 의 tid 는 아까 보던 대화를 가리키고 있다. */
    if (fresh) {
      setTid('')
      setMsgs([])
    }
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
          tid: fresh ? '' : tid,
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
  /* 레일에는 **고정한 것만** 선다(목업). 보관한 것은 프로젝트 화면의 「보관됨」에만. */
  const railFolders = folders.filter((f) => f.pin !== false && !f.archived)
  const mineFolds = folders.filter((f) => !f.archived)
  const archFolds = folders.filter((f) => !!f.archived)
  const pjList = useMemo(() => {
    const q = pjQ.trim().toLowerCase()
    const base = (pjTab === 'arch' ? archFolds : mineFolds).filter(
      (f) => !q || `${f.name} ${f.desc ?? ''} ${f.instr ?? ''}`.toLowerCase().includes(q),
    )
    return base
      .slice()
      .sort((a, b) =>
        pjSort === 'name'
          ? a.name.localeCompare(b.name, 'ko')
          : String(b.last || b.at || '').localeCompare(String(a.last || a.at || '')),
      )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folders, pjQ, pjTab, pjSort])
  /** 「지금 · 3일 전 · 9월 5일」 — 카드 밑줄의 시각(목업) */
  const whenTxt = (iso?: string) => {
    if (!iso) return ''
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    const sec = (Date.now() - d.getTime()) / 1000
    if (sec < 60) return '지금'
    const day = Math.floor(sec / 86400)
    if (day <= 0) return '오늘'
    if (day === 1) return '어제'
    if (day < 7) return `${day}일 전`
    return `${d.getMonth() + 1}월 ${d.getDate()}일`
  }
  const openNewFold = () => setFoldDlg({ edit: null, name: '', desc: '' })
  /** 「오후 3:14」 — 말한 사람 줄의 시각 */
  const hhmm = (iso?: string) => {
    const d = iso ? new Date(iso) : new Date()
    if (Number.isNaN(d.getTime())) return ''
    const h = d.getHours()
    return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  /** 마크다운 그대로가 아니라 **사람이 읽는 글자**를 복사한다 */
  const plainOf = (html: string) => {
    const el = document.createElement('div')
    el.innerHTML = html
    return (el.textContent || '').trim()
  }
  async function vote(i: number, v: 'up' | 'down') {
    if (!tid) return
    /* 화면을 먼저 바꾼다 — 누른 것이 바로 보여야 한다 */
    setMsgs((m) => {
      const nx = [...m]
      const cur = nx[i]
      if (cur) nx[i] = { ...cur, vote: cur.vote === v ? '' : v }
      return nx
    })
    await apiFetch('/api/kai/vote', { method: 'POST', body: JSON.stringify({ tid, i, v }) })
  }
  async function saveDoc() {
    const d = saveDlg
    if (!d || !d.title.trim()) return
    setSaveDlg(null)
    const cur = threads.find((t) => t.id === tid)
    await apiFetch('/api/kai/docs', {
      method: 'POST',
      body: JSON.stringify({ title: d.title.trim(), kind: d.kind, body: d.body, from: cur?.title ?? '' }),
    })
    void qc.invalidateQueries({ queryKey: ['kai-docs'] })
  }
  async function delDoc(id: string) {
    if (!window.confirm('이 문서를 지웁니다.')) return
    await apiFetch(`/api/kai/doc/${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (libOpen?.id === id) setLibOpen(null)
    void qc.invalidateQueries({ queryKey: ['kai-docs'] })
  }
  /** 라이브러리 목록 — 종류 · 찾기 · 정렬을 거쳐 나온 것 */
  const libDocs = useMemo(() => {
    const all = docQ.data?.docs ?? []
    const q = libQ.trim().toLowerCase()
    return all
      .filter((d) => (libKind === '전체' || (d.kind || '문서') === libKind))
      .filter((d) => !q || `${d.title} ${d.from ?? ''} ${plainOf(d.body)}`.toLowerCase().includes(q))
      .slice()
      .sort((a, b) =>
        libSort === 'name'
          ? a.title.localeCompare(b.title, 'ko')
          : libSort === 'kind'
            ? (a.kind || '').localeCompare(b.kind || '', 'ko')
            : String(b.at || '').localeCompare(String(a.at || '')),
      )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docQ.data, libKind, libQ, libSort])
  /** 이 프로젝트의 대화 — 상세의 「최근 항목」 */
  const foldThreads = threads.filter((t) => t.folder === curFold)
  const wikiName = (id: string) =>
    (wikiQ.data?.pages ?? []).find((p) => p.id === id)?.title || id
  /* 프로젝트가 사라졌으면(지웠거나 보관) 목록으로 되돌린다 */
  useEffect(() => {
    if (view === 'project' && curFold && foldQ.isSuccess && !folders.some((f) => f.id === curFold)) {
      setView('projects')
      setCurFold('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, curFold, foldQ.isSuccess, folders.length])
  /** 프로젝트 ⋯ 메뉴 — 목업 넷(고정 · 세부사항 수정 · 보관 · 삭제) */
  const foldMenu = (f: KaiFolder) => (
    <div className="kai-thmenu" role="menu" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => {
          setThMenu('')
          void patchFolder(f, { pin: f.pin === false })
        }}
      >
        {f.pin === false ? '고정' : '고정 해제'}
      </button>
      <button
        type="button"
        onClick={() => {
          setThMenu('')
          setFoldDlg({ edit: f, name: f.name, desc: f.desc ?? '' })
        }}
      >
        세부사항 수정
      </button>
      <button
        type="button"
        onClick={() => {
          setThMenu('')
          setInstrDlg({ f, v: f.instr ?? '' })
        }}
      >
        지침 {f.instr ? '고치기' : '넣기'}
      </button>
      <button
        type="button"
        onClick={() => {
          setThMenu('')
          setPjTab(f.archived ? 'mine' : 'arch')
          void patchFolder(f, { archived: !f.archived })
          if (!f.archived && curFold === f.id) setCurFold('')
        }}
      >
        {f.archived ? '보관 해제' : '보관'}
      </button>
      <span className="kai-thmenu-sep" />
      <button
        type="button"
        className="danger"
        onClick={() => {
          setThMenu('')
          void delFolder(f)
        }}
      >
        삭제
      </button>
    </div>
  )
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
            <button type="button" className="kai-sec-add" title="새 프로젝트" onClick={openNewFold}>
              ＋
            </button>
          </div>
          <div className="kai-folds">
            {railFolders.length ? (
              railFolders.map((f) => {
                const open = curFold === f.id
                const kids = threads.filter((t) => t.folder === f.id)
                return (
                  <div key={f.id} className={`kai-fold${open ? ' open' : ''}`}>
                    <button
                      type="button"
                      className="fcar"
                      title={open ? '접기' : '펴기'}
                      aria-expanded={open}
                      onClick={(e) => {
                        e.stopPropagation()
                        setCurFold(open ? '' : f.id)
                      }}
                    >
                      <i className="fico" aria-hidden="true"><IcoFolder /></i>
                    </button>
                    <button
                      type="button"
                      className="fd"
                      title={f.instr ? `지침: ${f.instr}` : '눌러서 이 프로젝트를 엽니다'}
                      onClick={() => {
                        setCurFold(f.id)
                        setView('project')
                      }}
                    >
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
                    {thMenu === `f:${f.id}` && foldMenu(f)}
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
                <i aria-hidden="true">📌</i>
                {folders.length
                  ? '프로젝트를 고정하여 여기에 유지하기'
                  : '프로젝트를 만들면 여기에 섭니다 — 관련된 대화를 묶고 지침을 겁니다'}
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
        /* ── 프로젝트 목록 — 목업 구조(탭 · 찾기 · 정렬 · 카드 격자) ── */
        <section className="kai-pj">
          <div className="pj-wrap">
            <div className="pj-hd">
              <h1>프로젝트</h1>
            </div>
            <div className="pj-tabs">
              <button
                type="button"
                className={`pj-tab${pjTab === 'mine' ? ' on' : ''}`}
                onClick={() => setPjTab('mine')}
              >
                내 프로젝트{mineFolds.length ? ` ${mineFolds.length}` : ''}
              </button>
              <button
                type="button"
                className={`pj-tab${pjTab === 'arch' ? ' on' : ''}`}
                onClick={() => setPjTab('arch')}
              >
                보관됨{archFolds.length ? ` ${archFolds.length}` : ''}
              </button>
              <span className="sp" />
              {pjFind || pjQ ? (
                <label className="pj-find">
                  <i aria-hidden="true"><IcoSearch /></i>
                  <input
                    autoFocus
                    value={pjQ}
                    placeholder="프로젝트 찾기"
                    onChange={(e) => setPjQ(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setPjQ('')
                        setPjFind(false)
                      }
                    }}
                  />
                </label>
              ) : (
                <button type="button" className="pj-ib" title="프로젝트 찾기" onClick={() => setPjFind(true)}>
                  <IcoSearch />
                </button>
              )}
              <button
                type="button"
                className="pj-ib"
                title={`정렬 — ${pjSort === 'name' ? '이름순' : '최근 활동순'}`}
                onClick={() => setPjSort((v) => (v === 'name' ? 'date' : 'name'))}
              >
                ⇅
              </button>
              <button type="button" className="pj-newbtn" onClick={openNewFold}>
                새 프로젝트
              </button>
            </div>
            <div className="pj-grid">
              {pjList.length ? (
                pjList.map((f) => {
                  /* 카드 본문은 **설명 + 지침**을 이어 붙인다(목업) — 설명이 없어도
                     지침이 있으면 무엇을 하는 자리인지 읽힌다. */
                  const body = [f.desc || '', (f.instr || '').replace(/\n/g, ' ')].filter(Boolean).join(' ')
                  return (
                    <div
                      key={f.id}
                      className="pj-card"
                      role="button"
                      tabIndex={0}
                      title={f.name}
                      onClick={() => {
                        setCurFold(f.id)
                        setView('project')
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setCurFold(f.id)
                          setView('project')
                        }
                      }}
                    >
                      <div className="pj-cthd">
                        <b>{f.name}</b>
                        {f.pin !== false && (
                          <i className="pjc-pin" title="고정됨" aria-hidden="true"><IcoPin /></i>
                        )}
                        {!!f.archived && <span className="arch">보관됨</span>}
                        <span className="sp" />
                        <span className="pjc-menuwrap">
                          <button
                            type="button"
                            className="pjc-more"
                            title="더보기"
                            aria-haspopup="menu"
                            aria-expanded={thMenu === `c:${f.id}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              setThMenu((v) => (v === `c:${f.id}` ? '' : `c:${f.id}`))
                            }}
                          >
                            ⋮
                          </button>
                          {thMenu === `c:${f.id}` && foldMenu(f)}
                        </span>
                      </div>
                      <p className="pj-ctxt">
                        {body || <span className="dim">설명이 없습니다</span>}
                      </p>
                      <div className="pj-cdt">
                        {whenTxt(f.last || f.at)}
                        {f.n ? ` · 대화 ${f.n}개` : ''}
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="kai-none">
                  {pjQ
                    ? `"${pjQ}"에 맞는 프로젝트가 없습니다`
                    : pjTab === 'arch'
                      ? '보관한 프로젝트가 없습니다'
                      : '아직 프로젝트가 없습니다 — 새 프로젝트로 만들어 보세요'}
                </div>
              )}
            </div>
          </div>
        </section>
      ) : view === 'project' && foldNow ? (
        /* ── 프로젝트 상세 — 목업 구조(빵부스러기 · 제목줄 · 2열) ── */
        <section className="kai-pj">
          <div className="pj-topbar">
            <div className="pj-crumb">
              <button type="button" className="lnk" onClick={() => setView('projects')}>
                프로젝트
              </button>
              <span className="sep">/</span>
              <b>{foldNow.name}</b>
            </div>
          </div>
          <div className="pj-wrap detail">
            <div className="pj-title">
              <h1>{foldNow.name}</h1>
              <span className="sp" />
              <button
                type="button"
                className={`pj-ib${foldNow.pin === false ? '' : ' on'}`}
                title={foldNow.pin === false ? '왼쪽 목록에 고정' : '고정 해제'}
                onClick={() => void patchFolder(foldNow, { pin: foldNow.pin === false })}
              >
                <IcoPin />
              </button>
              <button
                type="button"
                className={`pj-ib${foldNow.archived ? ' on' : ''}`}
                title={foldNow.archived ? '보관 해제' : '보관하기'}
                onClick={() => {
                  void patchFolder(foldNow, { archived: !foldNow.archived })
                  if (!foldNow.archived) {
                    setPjTab('arch')
                    setView('projects')
                  }
                }}
              >
                🗄
              </button>
              <button
                type="button"
                className="pj-ib"
                title="이름 · 설명 고치기"
                onClick={() => setFoldDlg({ edit: foldNow, name: foldNow.name, desc: foldNow.desc ?? '' })}
              >
                ⋮
              </button>
            </div>
            {foldNow.desc ? (
              <p className="pj-desc">{foldNow.desc}</p>
            ) : (
              <p className="pj-desc dim">설명이 없습니다 — ⋮ 에서 넣을 수 있습니다.</p>
            )}

            <div className="pj-cols">
              <div className="pj-main">
                {/* 여기서 물으면 이 프로젝트의 새 대화가 된다 */}
                <div className="pj-ask">
                  <input
                    value={text}
                    placeholder="오늘 어떤 도움을 드릴까요?"
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.nativeEvent.isComposing) return
                      if (e.key === 'Enter' && text.trim() && !busy) void ask(undefined, true)
                    }}
                  />
                  <div className="pj-ask-r">
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
                      {capOpen && spaceList('cap-pop up', () => setCapOpen(false))}
                    </span>
                    <span className="sp" />
                    <span className="pj-model">Knowledge AI</span>
                    <button
                      type="button"
                      className={`kai-send sm${text.trim() && !busy ? ' on' : ''}`}
                      disabled={busy || !text.trim()}
                      onClick={() => void ask(undefined, true)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M5 12h13M13 6l6 6-6 6" />
                      </svg>
                    </button>
                  </div>
                </div>

                {foldThreads.length ? (
                  <>
                    <h4 className="pj-h">최근 항목</h4>
                    {foldThreads.map((t) => (
                      <div
                        key={t.id}
                        className="pj-row"
                        role="button"
                        tabIndex={0}
                        onClick={() => void openThread(t.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            void openThread(t.id)
                          }
                        }}
                      >
                        <div className="pj-rt">
                          <b>{t.title || '(제목 없음)'}</b>
                          <span className="pj-snip">{t.n ?? 0}턴</span>
                        </div>
                        <span className="pj-rd">{whenTxt(t.at)}</span>
                      </div>
                    ))}
                  </>
                ) : (
                  <div className="pj-empty">
                    <i aria-hidden="true">💬</i>
                    <p>이 프로젝트에서 대화할 때마다 같은 지식을 참조합니다.</p>
                  </div>
                )}
              </div>

              <aside className="pj-side one">
                <section>
                  <div className="ps-hd">
                    <b>지침</b>
                    <span className="sp" />
                    <button
                      type="button"
                      className="ps-add"
                      title="프로젝트 지침 설정"
                      onClick={() => setInstrDlg({ f: foldNow, v: foldNow.instr ?? '' })}
                    >
                      ＋
                    </button>
                  </div>
                  {foldNow.instr ? <p>{foldNow.instr}</p> : <p className="dim">답변을 맞춤화하는 지침 추가</p>}
                </section>

                <section>
                  <div className="ps-hd">
                    <b>메모리</b>
                    <span className="sp" />
                    <span className="ps-tag">🔒 나만</span>
                  </div>
                  {memQ.data?.items?.length ? (
                    <ul className="pj-mem">
                      {memQ.data.items.map((m) => (
                        <li key={`${m.kind}:${m.id}`}>
                          <span className={`tag ${KIND_LABEL[m.kind as KaiSource['kind']]?.[1] ?? 'g1'}`}>
                            {KIND_LABEL[m.kind as KaiSource['kind']]?.[0] ?? '자료'}
                          </span>
                          <b>{m.id}</b>
                          <em>{m.n}회</em>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="dim">
                      이 프로젝트에서 되풀이해 짚은 근거가 여기 쌓입니다 — 아직 없습니다.
                    </p>
                  )}
                </section>

                <section>
                  <div className="ps-hd">
                    <b>컨텍스트</b>
                    <span className="sp" />
                    <button
                      type="button"
                      className="ps-add"
                      title="WIKI 문서 붙이기"
                      onClick={() => setCtxDlg({ f: foldNow, q: '' })}
                    >
                      ＋
                    </button>
                  </div>
                  {(foldNow.ctxDocs ?? []).length ? (
                    <>
                      <p className="pj-hint">
                        여기 붙인 문서 <b>{(foldNow.ctxDocs ?? []).length}장</b> 안에서 먼저 찾습니다.
                        거기서 안 나오면 평소대로 전부에서 찾습니다.
                      </p>
                      <div className="ctx-tiles">
                        {(foldNow.ctxDocs ?? []).map((id) => (
                          <span key={id} className="ctx-tile">
                            <b className="ctx-nm">{wikiName(id)}</b>
                            <button
                              type="button"
                              className="ctx-x"
                              title="빼기"
                              onClick={() =>
                                void patchFolder(foldNow, {
                                  ctxDocs: (foldNow.ctxDocs ?? []).filter((x) => x !== id),
                                })
                              }
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="dim">이 프로젝트에서 먼저 찾을 WIKI 문서를 붙이세요.</p>
                  )}
                </section>
              </aside>
            </div>
          </div>
        </section>
      ) : view === 'library' ? (
        /* ── 라이브러리 — 「문서로 저장」 한 답이 쌓이는 자리(목업) ── */
        <section className="kai-pj">
          <div className="pj-wrap">
            <div className="lib-hd">
              <h1>라이브러리</h1>
              <span className="sp" />
              <button
                type="button"
                className="pj-ib"
                title={`정렬 — ${libSort === 'name' ? '이름순' : libSort === 'kind' ? '종류순' : '최근순'}`}
                onClick={() => setLibSort((v) => (v === 'date' ? 'name' : v === 'name' ? 'kind' : 'date'))}
              >
                ⇅
              </button>
              <button
                type="button"
                className="pj-ib"
                title={libGrid ? '목록으로 보기' : '카드로 보기'}
                onClick={() => setLibGrid((v) => !v)}
              >
                {libGrid ? '☰' : '▦'}
              </button>
              <label className="pj-find">
                <i aria-hidden="true"><IcoSearch /></i>
                <input
                  value={libQ}
                  placeholder="라이브러리 검색"
                  onChange={(e) => setLibQ(e.target.value)}
                />
              </label>
            </div>
            {(() => {
              const all = docQ.data?.docs ?? []
              const kinds = ['전체', ...new Set(all.map((d) => d.kind || '문서'))]
              return (
                <div className="lib-tabs">
                  {kinds.map((k) => (
                    <button
                      key={k}
                      type="button"
                      className={`lib-tab${libKind === k ? ' on' : ''}`}
                      onClick={() => setLibKind(k)}
                    >
                      {k}
                      {k === '전체'
                        ? all.length
                          ? ` ${all.length}`
                          : ''
                        : ` ${all.filter((d) => (d.kind || '문서') === k).length}`}
                    </button>
                  ))}
                </div>
              )
            })()}
            {libDocs.length ? (
              libGrid ? (
                <div className="lib-grid">
                  {libDocs.map((d) => (
                    <div key={d.id} className="lib-card" role="button" tabIndex={0} onClick={() => setLibOpen(d)}>
                      <div className="lc-hd">
                        <span className="lc-type">{d.kind || '문서'}</span>
                        <span className="sp" />
                        <span>{whenTxt(d.at)}</span>
                      </div>
                      <b className="lc-ttl">{d.title}</b>
                      {!!d.from && <span className="lc-sub">{d.from}</span>}
                      <p className="lc-txt">{plainOf(d.body).slice(0, 110)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="lib-tbl">
                  <div className="lib-th">
                    <span>이름</span>
                    <span className="sp" />
                    <span>최근</span>
                  </div>
                  {libDocs.map((d) => (
                    <div key={d.id} className="lib-row" role="button" tabIndex={0} onClick={() => setLibOpen(d)}>
                      <span className="lib-ico" aria-hidden="true">🗂</span>
                      <span className="lib-nm">
                        <b>{d.title}</b>
                        <span>
                          {d.kind || '문서'}
                          {d.from ? ` · ${d.from}` : ''}
                        </span>
                      </span>
                      <span className="lib-at">{whenTxt(d.at)}</span>
                      <button
                        type="button"
                        className="x"
                        title="지우기"
                        onClick={(e) => {
                          e.stopPropagation()
                          void delDoc(d.id)
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div className="kai-empty">
                <b>{libQ ? `"${libQ}"에 맞는 문서가 없습니다` : '담아 둔 것이 없습니다'}</b>
                <span>
                  답 아래의 <b>🗂 문서로 저장</b> 을 누르면 여기에 쌓입니다 — 주간 보고 요약,
                  실행 비교표처럼 다시 찾아볼 답을 담아 두는 자리입니다.
                </span>
              </div>
            )}
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
                  <div key={i} className="kai-msg u">
                    <div className="who">
                      <b>나</b>
                      <time>{hhmm(m.at)}</time>
                      <span className="av me" aria-hidden="true">나</span>
                    </div>
                    <div className="kai-mu">{m.text}</div>
                  </div>
                ) : (
                  <div key={i} className="kai-msg a">
                    <div className="who">
                      <span className="av ai" aria-hidden="true">✦</span>
                      <b>Knowledge AI</b>
                      <time>{hhmm(m.at)}</time>
                    </div>
                    <div
                      className="kai-ma"
                      // 소독(DOMPurify)한 마크다운 — [n] 은 누르는 근거 표가 된다
                      // eslint-disable-next-line react/no-danger
                      dangerouslySetInnerHTML={{ __html: mdWithCits(m.text) }}
                    />
                    {/* **출처 줄**(목업) — 답 속 [n] 을 못 보고 지나치는 사람을 위해
                        무엇을 보고 답했는지 아래에 한 줄로 편다. */}
                    {!!m.sources?.length && (
                      <div className="src-box">
                        <div className="src-hd">
                          📑 출처 <span className="src-n">{m.sources.length}개</span>
                        </div>
                        <div className="src-chips">
                          {m.sources.map((sx, k) => {
                            const [lb, cls] = KIND_LABEL[sx.kind] ?? ['자료', 'g1']
                            return (
                              <button
                                key={k}
                                type="button"
                                className="src-chip"
                                title={`${lb} · ${sx.title}`}
                                onClick={() => {
                                  setSrcFocus(k + 1)
                                  setSrcOpen(true)
                                }}
                              >
                                <span className={`tag ${cls}`}>{lb}</span>
                                <b>{sx.id}</b>
                                <span>{sx.title}</span>
                                <em>{k + 1}</em>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    {/* 마지막에 흐르는 답에는 아직 안 붙인다 — 다 오고 나서 */}
                    {!(busy && i === msgs.length - 1) && (
                      <>
                        <div className="ai-note">
                          AI는 실수를 할 수 있습니다. 중요한 정보는 다시 한번 확인하세요.
                        </div>
                        <div className="msg-acts">
                          <button
                            type="button"
                            className={`ma${copied === i ? ' done' : ''}`}
                            title="복사"
                            onClick={() => {
                              const t0 = plainOf(mdWithCits(m.text))
                              void navigator.clipboard?.writeText(t0)
                              setCopied(i)
                              window.setTimeout(() => setCopied(-1), 1200)
                            }}
                          >
                            {copied === i ? '✓' : '⧉'}
                          </button>
                          <button
                            type="button"
                            className={`ma${m.vote === 'up' ? ' on' : ''}`}
                            title="도움이 됐어요"
                            disabled={!tid}
                            onClick={() => void vote(i, 'up')}
                          >
                            👍
                          </button>
                          <button
                            type="button"
                            className={`ma${m.vote === 'down' ? ' on' : ''}`}
                            title="아쉬워요"
                            disabled={!tid}
                            onClick={() => void vote(i, 'down')}
                          >
                            👎
                          </button>
                          <button
                            type="button"
                            className="ma"
                            title="문서로 저장 — 라이브러리에 쌓입니다"
                            onClick={() => {
                              const q0 = msgs[i - 1]?.role === 'u' ? msgs[i - 1]!.text : ''
                              setSaveDlg({
                                body: mdWithCits(m.text),
                                title: (q0 || plainOf(mdWithCits(m.text))).slice(0, 40),
                                kind: '요약',
                              })
                            }}
                          >
                            🗂
                          </button>
                          <button
                            type="button"
                            className="ma"
                            title="같은 질문을 다시 묻습니다"
                            disabled={busy || msgs[i - 1]?.role !== 'u'}
                            onClick={() => void ask(msgs[i - 1]?.text)}
                          >
                            ↻
                          </button>
                        </div>
                      </>
                    )}
                  </div>
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

      {/* ── 프로젝트 만들기 · 세부사항 수정(목업) ── */}
      {!!foldDlg && (
        <div className="modal-back" onMouseDown={() => setFoldDlg(null)}>
          <div className="modal kai-fdlg" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <b>{foldDlg.edit ? '프로젝트 이름 · 설명' : '프로젝트 생성'}</b>
              <span className="sp" />
              <button type="button" className="modal-x" aria-label="닫기" onClick={() => setFoldDlg(null)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <label className="kai-fld">
                <span>{foldDlg.edit ? '이름' : '무엇을 작업 중이신가요?'}</span>
                <input
                  autoFocus
                  value={foldDlg.name}
                  placeholder="프로젝트 이름 지정"
                  onChange={(e) => setFoldDlg((d) => (d ? { ...d, name: e.target.value } : d))}
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing) return
                    if (e.key === 'Enter' && foldDlg.name.trim()) void saveFolder()
                  }}
                />
              </label>
              <label className="kai-fld">
                <span>{foldDlg.edit ? '설명' : '어떤 목표를 달성하려고 하시나요?'}</span>
                <textarea
                  rows={4}
                  value={foldDlg.desc}
                  placeholder="프로젝트, 목표, 주제 등을 설명해주세요."
                  onChange={(e) => setFoldDlg((d) => (d ? { ...d, desc: e.target.value } : d))}
                />
              </label>
            </div>
            <div className="modal-foot">
              <button type="button" className="btn small" onClick={() => setFoldDlg(null)}>
                취소
              </button>
              <button
                type="button"
                className="btn small primary"
                disabled={!foldDlg.name.trim()}
                onClick={() => void saveFolder()}
              >
                {foldDlg.edit ? '저장' : '프로젝트 생성'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 지침 — 이 프로젝트에서 묻는 동안 늘 따른다 ── */}
      {!!instrDlg && (
        <div className="modal-back" onMouseDown={() => setInstrDlg(null)}>
          <div className="modal kai-fdlg" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <b>프로젝트 지침 설정</b>
              <span className="sp" />
              <button type="button" className="modal-x" aria-label="닫기" onClick={() => setInstrDlg(null)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p className="kai-fldhint">
                <b>{instrDlg.f.name}</b> 의 모든 대화에 실립니다. 어떤 범위에서 · 어떤 꼴로 답해야
                하는지 적어 주세요.
              </p>
              <label className="kai-fld">
                <span>지침</span>
                <textarea
                  autoFocus
                  rows={5}
                  value={instrDlg.v}
                  placeholder="예) E61xx 범위에서만 찾고, 결과는 표로 정리한다."
                  onChange={(e) => setInstrDlg((d) => (d ? { ...d, v: e.target.value } : d))}
                />
              </label>
            </div>
            <div className="modal-foot">
              <button type="button" className="btn small" onClick={() => setInstrDlg(null)}>
                취소
              </button>
              <button
                type="button"
                className="btn small primary"
                onClick={() => {
                  const d = instrDlg
                  setInstrDlg(null)
                  void patchFolder(d.f, { instr: d.v })
                }}
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 답을 문서로 저장 ── */}
      {!!saveDlg && (
        <div className="modal-back" onMouseDown={() => setSaveDlg(null)}>
          <div className="modal kai-fdlg" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <b>문서로 저장</b>
              <span className="sp" />
              <button type="button" className="modal-x" aria-label="닫기" onClick={() => setSaveDlg(null)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <label className="kai-fld">
                <span>제목</span>
                <input
                  autoFocus
                  value={saveDlg.title}
                  onChange={(e) => setSaveDlg((d) => (d ? { ...d, title: e.target.value } : d))}
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing) return
                    if (e.key === 'Enter' && saveDlg.title.trim()) void saveDoc()
                  }}
                />
              </label>
              <label className="kai-fld">
                <span>종류</span>
                <select
                  value={saveDlg.kind}
                  onChange={(e) => setSaveDlg((d) => (d ? { ...d, kind: e.target.value } : d))}
                >
                  {['요약', '보고', '비교표', '시험 초안'].map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="modal-foot">
              <button type="button" className="btn small" onClick={() => setSaveDlg(null)}>
                취소
              </button>
              <button
                type="button"
                className="btn small primary"
                disabled={!saveDlg.title.trim()}
                onClick={() => void saveDoc()}
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 담아 둔 문서 보기 ── */}
      {!!libOpen && (
        <div className="modal-back" onMouseDown={() => setLibOpen(null)}>
          <div className="modal kai-docdlg" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <b>{libOpen.title}</b>
              <span className="sp" />
              <button type="button" className="modal-x" aria-label="닫기" onClick={() => setLibOpen(null)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="kai-docmeta">
                {libOpen.kind || '문서'}
                {libOpen.from ? ` · ${libOpen.from}` : ''}
                {libOpen.at ? ` · ${whenTxt(libOpen.at)}` : ''}
              </div>
              <div
                className="kai-ma"
                // 저장할 때 이미 소독한 글이다 — 다시 쓰지 않고 그대로 편다
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: libOpen.body }}
              />
            </div>
            <div className="modal-foot">
              <button type="button" className="btn small danger" onClick={() => void delDoc(libOpen.id)}>
                지우기
              </button>
              <span className="sp" />
              <button type="button" className="btn small primary" onClick={() => setLibOpen(null)}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 컨텍스트에 붙일 WIKI 문서 고르기 ── */}
      {!!ctxDlg && (
        <div className="modal-back" onMouseDown={() => setCtxDlg(null)}>
          <div className="modal kai-fdlg" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <b>WIKI 문서 붙이기</b>
              <span className="sp" />
              <button type="button" className="modal-x" aria-label="닫기" onClick={() => setCtxDlg(null)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p className="kai-fldhint">
                <b>{ctxDlg.f.name}</b> 에서 물으면 여기 붙인 문서 안에서 먼저 찾습니다.
                거기서 안 나오면 평소대로 전부에서 찾습니다.
              </p>
              <label className="kai-fld">
                <span>문서 찾기</span>
                <input
                  autoFocus
                  value={ctxDlg.q}
                  placeholder="문서 제목"
                  onChange={(e) => setCtxDlg((d) => (d ? { ...d, q: e.target.value } : d))}
                />
              </label>
              <div className="ctx-pick">
                {(() => {
                  const q = ctxDlg.q.trim().toLowerCase()
                  const cur = folders.find((f) => f.id === ctxDlg.f.id) ?? ctxDlg.f
                  const on = new Set(cur.ctxDocs ?? [])
                  const rows = (wikiQ.data?.pages ?? [])
                    .filter((p) => !q || (p.title || '').toLowerCase().includes(q))
                    .slice(0, 60)
                  if (!rows.length) return <div className="kai-none">맞는 문서가 없습니다</div>
                  return rows.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={on.has(p.id) ? 'on' : ''}
                      onClick={() => {
                        const nx = on.has(p.id)
                          ? (cur.ctxDocs ?? []).filter((x) => x !== p.id)
                          : [...(cur.ctxDocs ?? []), p.id]
                        void patchFolder(cur, { ctxDocs: nx })
                      }}
                    >
                      <i aria-hidden="true">{on.has(p.id) ? '✓' : '＋'}</i>
                      <span>{p.title || '(이름 없음)'}</span>
                      {!!p.project && <em>{p.project}</em>}
                    </button>
                  ))
                })()}
              </div>
            </div>
            <div className="modal-foot">
              <button type="button" className="btn small primary" onClick={() => setCtxDlg(null)}>
                닫기
              </button>
            </div>
          </div>
        </div>
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
