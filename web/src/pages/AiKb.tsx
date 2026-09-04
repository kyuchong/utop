/**
 * Knowledge AI — **쌓인 자료에서 찾아 답하는 자리** (승인: B 인트로 + C 동작).
 *
 *   B — 1열 대화 목록은 늘 서 있고, 인트로는 2/3열을 합친 자리에 뜬다.
 *   C — 답은 넓게 보이고, 3열(근거)은 답 속 [n] 을 누를 때만 열린다.
 *
 * 자료는 전부 **우리 저장소**다: Wiki·요구사항/시험·사이클 결과는 PG,
 * 지라는 아침마다 받아 둔 jira_cache. 묻는다고 지라에 실시간으로 안 간다.
 * 대화는 계정별로 남아 다음 접속에 이어진다.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { apiFetch } from '@/api/client'
import { goto } from '@/api/goto'
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
}

const SCOPES = [
  ['wiki', '📖', 'WIKI'],
  ['tc', '🧪', '시험'],
  ['cycle', '🔄', '사이클'],
  ['jira', '🐞', 'Jira'],
] as const

const KIND_LABEL: Record<KaiSource['kind'], [string, string]> = {
  wiki: ['Wiki', 'g1'],
  tc: ['시험', 'g2'],
  req: ['요구사항', 'g2'],
  run: ['실행', 'g2'],
  jira: ['Jira', 'g3'],
}

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
  /** 켜진 범위 — 밑값은 전부. 무엇이든 물어보라는 화면이니 */
  const [scopes, setScopes] = useState<Set<string>>(new Set(SCOPES.map(([k]) => k)))
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
  const threads = thQ.data?.threads ?? []

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

  async function openThread(id: string) {
    const r = await apiFetch(`/api/kai/thread/${encodeURIComponent(id)}`)
    const j = (await r.json()) as { ok?: boolean; thread?: KaiThread }
    if (!j.ok || !j.thread) return
    setTid(id)
    setMsgs(j.thread.msgs ?? [])
    setSrcOpen(false)
  }

  function newThread() {
    setTid('')
    setMsgs([])
    setSrcOpen(false)
    setText('')
  }

  async function delThread(id: string) {
    if (!window.confirm('이 대화를 지웁니다.')) return
    await apiFetch(`/api/kai/thread/${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (id === tid) newThread()
    void qc.invalidateQueries({ queryKey: ['kai-threads'] })
  }

  async function ask(q0?: string) {
    const q = (q0 ?? text).trim()
    if (!q || busy) return
    setText('')
    setBusy(true)
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
        body: JSON.stringify({ tid, q, scopes: [...scopes] }),
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

  const home = !msgs.length && !busy

  const scopeChips = (
    <>
      {SCOPES.map(([k, emo, nm]) => (
        <button
          key={k}
          type="button"
          className={`kai-scope${scopes.has(k) ? ' on' : ''}`}
          title={`${nm} 저장소에서 찾기`}
          onClick={() =>
            setScopes((prev) => {
              const nx = new Set(prev)
              if (nx.has(k)) nx.delete(k)
              else nx.add(k)
              /* 다 끄면 물을 곳이 없다 — 마지막 하나는 지킨다 */
              return nx.size ? nx : prev
            })
          }
        >
          {emo} {nm}
        </button>
      ))}
    </>
  )

  return (
    <div className="kai" ref={rootRef}>
      {/* ── 1열 — 대화 목록(늘 선다, B) ── */}
      <aside className="kai-list" style={{ width: w1 }}>
        <button type="button" className="kai-new" onClick={newThread}>
          ＋ 새 대화
        </button>
        <div className="kai-ths">
          {threads.map((t) => (
            <div key={t.id} className={`kai-th${t.id === tid ? ' on' : ''}`}>
              <button type="button" className="nm" title={t.title} onClick={() => void openThread(t.id)}>
                {t.title || '(제목 없음)'}
              </button>
              <button type="button" className="x" title="지우기" onClick={() => void delThread(t.id)}>
                ✕
              </button>
            </div>
          ))}
          {!threads.length && <div className="kai-none">아직 대화가 없습니다</div>}
        </div>
      </aside>
      <Resizer
        label="대화 목록 폭 조절"
        onResize={setW1}
        getOrigin={() => rootRef.current?.getBoundingClientRect().left ?? 0}
      />

      {home ? (
        /* ── 인트로 — 2/3열을 합친 자리(B) ── */
        <section className="kai-intro">
          <span className="sky" aria-hidden="true">
            <i className="o1" />
            <i className="o2" />
            <i className="o3" />
          </span>
          <span className="kai-badge">
            <i aria-hidden="true">✦</i>UBIQUOSS Knowledge Assistant
          </span>
          <h1>무엇이든 물어보세요</h1>
          <p className="kai-sub">문서 · 요구사항 · 시험 · 결과 · 이슈에서 답을 찾아드립니다</p>
          <div className="kai-cap">
            <input
              ref={inRef}
              value={text}
              placeholder="UBIQUOSS Knowledge Assistant"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return
                if (e.key === 'Enter' && text.trim()) void ask()
              }}
            />
            <div className="row">
              {scopeChips}
              <span className="sp" />
              <button
                type="button"
                className={`kai-send${text.trim() ? ' on' : ''}`}
                disabled={!text.trim()}
                onClick={() => void ask()}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h13M13 6l6 6-6 6" />
                </svg>
              </button>
            </div>
          </div>
          <div className="kai-ops">
            {['E6100 동작 온도 스펙 알려줘', '지난주 주간 업무 보고 요약해줘', 'Kernel Panic 이슈 찾아줘'].map(
              (x) => (
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
              ),
            )}
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
              <input
                ref={chatInRef}
                autoFocus
                value={text}
                placeholder="이어서 물어보세요"
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return
                  if (e.key === 'Enter' && text.trim() && !busy) void ask()
                }}
              />
              {scopeChips}
              <button
                type="button"
                className={`kai-send sm${text.trim() && !busy ? ' on' : ''}`}
                disabled={busy || !text.trim()}
                onClick={() => void ask()}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h13M13 6l6 6-6 6" />
                </svg>
              </button>
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
    </div>
  )
}
