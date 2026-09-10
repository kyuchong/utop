/**
 * **Jira 세부 서랍** — Releases 와 Jira Issue 가 **같이 쓰는 한 부품**.
 *
 * 본디 Releases 화면 안에 있었다. Jira Issue 화면에도 같은 서랍이 필요해졌는데
 * (지시: 「Releases 의 드로우와 똑같은 포맷으로」) 베껴 두면 다음에 한쪽만
 * 고쳐져 또 갈린다. 그래서 옮겨 놓고 둘이 나눠 쓴다.
 *
 * 클래스 이름은 `rls-` 를 그대로 둔다 — 바꾸면 Releases 화면이 조용히 망가진다.
 * z-index 사슬: vlist 40 < scrim 60 < rls-ovl 70 < rls-lb 80.
 *
 * 화면마다 다른 것은 `extra` 하나로 몰아 둔다 — Releases 는 안 넘기므로
 * 그 화면은 글자 하나 안 바뀐다.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type WheelEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import './IssueDrawer.css'

/** Jira 가 준 HTML 을 화면에 놓기 전에 손본다 — 옛 화면(_rlsJiraHtml)과 같은 규칙.
 *
 *  · `<script>` 와 `on…` 속성은 걷는다 — 남이 쓴 글이 내 화면에서 돌면 안 된다
 *  · `<img src>` 는 인증 프록시로 돌린다 — 브라우저는 Jira 에 로그인해 있지 않아
 *    그냥 두면 첨부 그림이 전부 깨진다
 *  · 상대 링크는 절대로 펴고 새 탭에서 연다 */
function jiraHtml(html: string, base: string): string {
  let s = String(html || '')
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '')
  s = s.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  /* **그림은 여기서 주소만 적어 두고, 받아 오는 것은 따로 한다.**
   *
   *  예전엔 `src` 를 그대로 `/api/jira/attachment?url=…` 로 바꿔 두었다.
   *  그런데 이 서버는 /api/* 전체에 로그인을 요구하고, 그 표는 **헤더**
   *  (Authorization: Bearer)로만 받는다. `<img src>` 는 브라우저가 그냥
   *  긁어 오는 것이라 헤더를 얹을 수 없다 — 그래서 그림마다 401 이 오고
   *  깨진 그림 자국만 남았다(지적: 「사진 정보가 안보이는 것 같은데」).
   *
   *  그래서 주소는 data-jsrc 에 적어 두고, 화면이 붙은 뒤에 표를 얹어
   *  받아다 붙인다(loadJiraImgs). 자리는 미리 비워 둔다 — 빈 src 를 두면
   *  브라우저가 「그림 없음」 자국을 그린다. */
  s = s.replace(/(<img\b)([^>]*?)\bsrc="([^"]+)"/gi, (m, tag: string, rest: string, u: string) => {
    if (/^data:/i.test(u)) return m
    const full = /^https?:/i.test(u) ? u : /^\//.test(u) ? base + u : `${base}/${u}`
    return `${tag}${rest} data-jsrc="${full.replace(/"/g, '&quot;')}"`
  })
  s = s.replace(
    /(<a\b[^>]*?\bhref=")(\/[^"]*)(")/gi,
    (_m, a: string, u: string, b: string) => `${a}${base}${u}${b} target="_blank" rel="noopener"`,
  )
  return s
}

/** 파일 크기 — 사람이 읽는 꼴로 */
function fsize(n: number): string {
  if (!n || !Number.isFinite(n)) return ''
  const u = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = n
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024
    i += 1
  }
  return `${v < 10 && i ? v.toFixed(1) : Math.round(v)}${u[i]}`
}

/** 첨부를 내려받는다 — **표를 얹어서**.
 *
 *  `<a href="/api/jira/attachment?url=…">` 로 두었더니 눌러도 401 만 왔다.
 *  브라우저가 그냥 긁는 주소에는 Authorization 헤더가 안 실린다(그림이
 *  깨진 것과 같은 까닭). 받아서 blob 으로 만들어 내려준다. */
async function dlAtt(url: string, filename: string): Promise<void> {
  if (!url) return
  try {
    const r = await apiFetch(`/api/jira/attachment?url=${encodeURIComponent(url)}`)
    if (!r.ok) throw new Error(String(r.status))
    const o = URL.createObjectURL(await r.blob())
    const a = document.createElement('a')
    a.href = o
    a.download = filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(o), 30_000)
  } catch {
    window.alert(`${filename} 을 내려받지 못했습니다 — Jira 에서 직접 받아 주세요.`)
  }
}

/** 날짜를 **지라 꼴로** — 「2021/01/05 3:23 오후」.
 *  **시각이 없는 칸에는 시각을 붙이지 않는다**(지적): 기한(duedate)은
 *  「2025-03-31」 처럼 날짜뿐인데 9:00 오전이 붙어 나왔다. */
function jdate(v: unknown): string {
  const t = String(v ?? '').trim()
  if (!t) return ''
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return t
  const p = (n: number) => String(n).padStart(2, '0')
  const ymd = `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`
  if (!/[T ]\d{1,2}:\d{2}/.test(t)) return ymd
  const h = d.getHours()
  const ap = h < 12 ? '오전' : '오후'
  const h12 = h % 12 || 12
  return `${ymd} ${h12}:${p(d.getMinutes())} ${ap}`
}

/** 지라 값 하나를 글로 — 사람·이름·값·목록을 다 같은 규칙으로 편다 */
function jval(v: unknown): string {
  if (v == null || v === '') return ''
  if (Array.isArray(v)) return v.map(jval).filter(Boolean).join(', ')
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    for (const k of ['displayName', 'name', 'value', 'text']) {
      if (o[k] != null && o[k] !== '') return String(o[k])
    }
    if (typeof o.watchCount === 'number') return String(o.watchCount)
    if (typeof o.votes === 'number') return String(o.votes)
    return ''
  }
  if (typeof v === 'boolean') return v ? '예' : '아니오'
  return String(v)
}

/** 「자세히」 에서 **빼는** 칸 — 다른 자리에서 따로 내거나, 화면 잡음인 것 */
const DETAIL_SKIP = new Set([
  'summary', 'description', 'comment', 'attachment', 'issuelinks', 'worklog',
  'subtasks', 'project', 'issuekey', 'thumbnail', 'timetracking', 'workratio',
  'aggregatetimespent', 'aggregatetimeestimate', 'aggregatetimeoriginalestimate',
  'aggregateprogress', 'progress', 'timespent', 'timeestimate', 'timeoriginalestimate',
  'lastViewed', 'creator', 'environment',
])
/** 지라 **내부용** 칸 — 사람이 읽을 것이 아니다(지적).
 *  · Development: 개발 연동 덤프(`{summaryBean=com.atlassian…}`)가 통째로
 *    쏟아져 화면 절반을 먹었다. 지라도 이 칸을 「자세히」 에 안 낸다.
 *  · Rank: 목록 정렬용 열쇠(`0|i03vcn:`). 뜻이 없다.
 *  · [CHART]·Σ: 지라가 만들어 두는 통계 칸. */
const DETAIL_JUNK = /^(rank|development|epic colour|epic color|epic status|parent link|issue color|글로벌 순위|순위)$/i
const isJunkName = (n: string) => DETAIL_JUNK.test(n.trim()) || /^(\[CHART\]|Σ)/.test(n.trim())

/** 비어 있어도 「없음」 으로 내는 칸 — 지라 화면이 늘 세워 두는 것들 */
const DETAIL_ALWAYS = [
  'issuetype', 'priority', 'versions', 'components', 'labels',
  'status', 'resolution', 'fixVersions',
  'assignee', 'reporter', 'duedate', 'created', 'updated', 'resolutiondate',
]
/** 「자세히」 에 **내는 칸 전부** — 이 차례대로 선다(지시: 붉은 박스만).
 *  이름은 띄어쓰기를 뺀 꼴로 견준다. */
const DETAIL_ONLY = [
  '이슈유형', '우선순위', '구성요소', '상태', '수정버전', '담당자', '보고자', '생성일',
  '대외OPEN', '이슈구분', '시험시설', '이슈단계', '발생빈도', 'OS시험버전(최초)',
  '문제유형', '이슈분류(HW,SW)', '사업자', '시작일(WBSGantt)', '완료일(WBSGantt)',
]

/** 날짜로 다루는 칸 */
const DATE_FIELDS = new Set(['created', 'updated', 'resolutiondate', 'duedate', 'lastViewed'])

/** 로딩 중 자리 — 비워 두면 브라우저가 「깨진 그림」 자국을 그린다 */
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
/** 못 받은 자리 — 무엇이 빠졌는지는 보여야 한다 */
const BADIMG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='300' height='40'>" +
      "<rect width='300' height='40' rx='5' fill='#fff4f6' stroke='#f2ccd5'/>" +
      "<text x='150' y='25' text-anchor='middle' font-size='12' fill='#a8213f'" +
      " font-family='sans-serif'>그림을 못 받았습니다</text></svg>",
  )

/** HTML 속성에 든 꼴을 원래 주소로 되돌린다 */
const unesc = (v: string): string =>
  v.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

/**
 * Jira 그림을 **표(Authorization)를 얹어** 받아 blob 주소로 들고 있는다.
 *
 * 예전엔 화면이 그려진 뒤 DOM 을 뒤져 `img.src` 에 직접 꽂았다. 그런데
 * React 가 그 자리를 다시 그리는 순간(예: 크게 보기 창을 닫아 이 부품이
 * 다시 그려질 때) 심어 둔 src 가 통째로 날아갔다 — **사진이 사라졌다**
 * (지적: 「사진클릭 후 다른곳 클릭하면 드로우 출력에 사진이 없어져」).
 *
 * 그래서 **React 가 주인이 되게** 바꿨다: 받은 주소를 상태로 들고,
 * 그릴 때 HTML 문자열의 `data-jsrc` 를 `src` 로 바꿔 끼운다. 몇 번을 다시
 * 그려도 주소가 HTML 에 박혀 있으니 사라질 수 없다.
 *
 * 열쇠는 **HTML 에 적힌 그대로**(이스케이프된 꼴)를 쓴다 — 그래야 되돌려
 * 끼울 때 글자가 정확히 맞는다. 받을 때만 원래 주소로 푼다.
 */
function useJiraImgs(htmls: string[]): Map<string, string> {
  const key = htmls.join('\u0000')
  const urls = useMemo(() => {
    const out = new Set<string>()
    for (const m of key.matchAll(/\sdata-jsrc="([^"]*)"/g)) if (m[1]) out.add(m[1])
    return [...out]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const [got, setGot] = useState<Map<string, string>>(new Map())
  useEffect(() => {
    if (!urls.length) return
    let dead = false
    const made: string[] = []
    void (async () => {
      for (const raw of urls) {
        let val = ''
        try {
          const r = await apiFetch(`/api/jira/attachment?url=${encodeURIComponent(unesc(raw))}`)
          if (!r.ok) throw new Error(String(r.status))
          const o = URL.createObjectURL(await r.blob())
          made.push(o)
          val = o
        } catch {
          val = '' /* 못 받음 — 그릴 때 안내 그림으로 바뀐다 */
        }
        if (dead) return
        setGot((m) => new Map(m).set(raw, val))
      }
    })()
    return () => {
      dead = true
      for (const o of made) URL.revokeObjectURL(o)
    }
  }, [urls])
  return got
}

/** 적어 둔 주소를 받아 둔 그림으로 바꿔 끼운다 */
function withImgs(html: string, got: Map<string, string>): string {
  return String(html).replace(/\sdata-jsrc="([^"]*)"/g, (_m, raw: string) => {
    if (!got.has(raw)) return ` src="${BLANK}"` /* 아직 받는 중 */
    const v = got.get(raw) ?? ''
    return v ? ` src="${v}"` : ` src="${BADIMG}" data-fail="1"`
  })
}

/** **Jira 세부 서랍**(지시).
 *
 *  이슈 키를 누르면 오른쪽에서 열린다. 설명·댓글은 Jira 가 렌더한 HTML
 *  (renderedFields)을 그대로 쓴다 — 표·코드블록·그림이 Jira 에서 보던
 *  모양 그대로 선다. 그림은 인증 프록시를 거친다(브라우저는 Jira 에
 *  로그인해 있지 않다).
 */
export function IssueDrawer({
  ikey,
  base,
  onClose,
  extra,
}: {
  ikey: string
  base: string
  onClose: () => void
  /** 「자세히」 아래에 화면이 끼워 넣는 것 — 지라에 없는 우리 값(분류 같은) */
  extra?: ReactNode
}) {
  /** 크게 볼 그림 — 눌린 그림 하나. 빈 문자열이면 안 떠 있다.
   *  **맨 위에 둔다**: 아래의 Esc 처리가 이 값을 본다(그림 창이 떠 있으면
   *  서랍은 안 닫힌다). 선언보다 먼저 쓰면 화면이 통째로 안 뜬다. */
  const [lb, setLb] = useState('')
  /* 「지금 갱신」 — 누를 때마다 오르고, 0 이 아니면 지라에서 새로 받는다.
     평소에는 **UTOP 저장본**을 읽어 지라에 부하가 없다(승인: ⑵안). */
  const [freshN, setFreshN] = useState(0)
  const q = useQuery({
    queryKey: ['jira-issue', ikey, freshN],
    staleTime: 60_000,
    queryFn: async () => {
      const r = await apiFetch(`/api/jira/issue/${encodeURIComponent(ikey)}${freshN ? '?fresh=1' : ''}`)
      if (!r.ok) throw new Error('이슈 세부를 불러오지 못했습니다')
      return (await r.json()) as {
        ok?: boolean
        error?: string
        cached?: boolean
        stale?: boolean
        stale_error?: string
        fetched_at?: string
        fields?: Record<string, unknown>
        renderedFields?: Record<string, unknown>
        /** 칸 id → 보이는 이름. Traceability 처럼 **이름으로 찾는** 칸에 쓴다 */
        names?: Record<string, string>
        /** 이력 — 「활동」 의 이력 탭 */
        changelog?: { histories?: unknown[] }
      }
    },
  })


  /* Esc 로 닫는다 — 서랍은 덮는 것이라 빠져나갈 길이 손에 있어야 한다.
     **크게 보기가 떠 있으면 그쪽이 먼저다**: 둘 다 window 에서 Esc 를
     듣고 있어서, 한 번 눌렀는데 그림 창과 서랍이 같이 닫혔다. */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !lb) onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose, lb])

  const f = (q.data?.fields ?? {}) as Record<string, never>
  const rf = (q.data?.renderedFields ?? {}) as Record<string, never>
  const pick = (o: unknown, k: string): string =>
    String((o as Record<string, unknown> | undefined)?.[k] ?? '')
  /** 상태 칸의 색은 statusCategory.key 로 갈린다 — 한 겹 더 들어가 있다 */
  const scat = String(
    ((f.status as Record<string, unknown> | undefined)?.statusCategory as
      | Record<string, unknown>
      | undefined)?.key ?? '',
  )
  const descHtml = String(rf.description ?? '')
  const descText = String(f.description ?? '')
  const cmts = ((f.comment as { comments?: unknown[] } | undefined)?.comments ?? []) as Array<
    Record<string, unknown>
  >
  const cmtHtml = ((rf.comment as { comments?: unknown[] } | undefined)?.comments ?? []) as Array<
    Record<string, unknown>
  >
  const atts = (f.attachment ?? []) as Array<Record<string, unknown>>
  const links = (f.issuelinks ?? []) as Array<Record<string, unknown>>
  /** 이력 — 지라 「활동」 의 이력 탭이 쓰는 그 자료다 */
  const hist = ((q.data?.changelog as { histories?: unknown[] } | undefined)?.histories ?? []) as Array<
    Record<string, unknown>
  >
  const err = q.error ? String(q.error) : q.data && q.data.ok === false ? String(q.data.error ?? '') : ''

  /** Traceability — **보이는 이름으로** 찾는다. 칸 id(customfield_10500)는
   *  Jira 마다 달라서 박아 두면 다른 프로젝트에서 조용히 빈칸이 된다.
   *  `expand=names` 가 준 「id → 이름」 을 뒤져 이름이 맞는 칸을 집는다. */
  const trace = useMemo(() => {
    const names = (q.data?.names ?? {}) as Record<string, string>
    /* 「추적」 만으로 찾으면 지라 붙박이 **「시간 추적」**(timetracking)이
       먼저 걸린다 — 값이 객체라 「[object Object]」 가 떴다. 이름을
       좁히고, 안 내기로 한 칸은 아예 안 본다. */
    const id = Object.keys(names).find(
      (k) => !DETAIL_SKIP.has(k) && /traceab|추적성/i.test(String(names[k] ?? '')),
    )
    if (!id) return null
    const html = String((rf as Record<string, unknown>)[id] ?? '')
    const raw = (f as Record<string, unknown>)[id]
    const text = Array.isArray(raw)
      ? raw.map((v) => (typeof v === 'object' && v ? pick(v, 'value') || pick(v, 'name') : String(v))).join(', ')
      : typeof raw === 'object' && raw
        ? pick(raw, 'value') || pick(raw, 'name')
        : String(raw ?? '')
    if (!html.trim() && !text.trim()) return null
    return { id, label: String(names[id] ?? 'Traceability'), html, text }
  }, [q.data, f, rf])
  const traceId = trace?.id ?? ''

  /* Jira 가 준 HTML 을 **한 번만** 손질해 둔다(스크립트 제거·주소 정리).
     그릴 때마다 새로 만들면 그림 주소를 모으는 자리가 매번 달라진다. */
  const descJ = useMemo(() => jiraHtml(descHtml, base), [descHtml, base])
  const traceJ = useMemo(() => jiraHtml(trace?.html ?? '', base), [trace, base])
  const cmtJ = useMemo(
    () => cmtHtml.map((c) => jiraHtml(String((c as Record<string, unknown>)?.body ?? ''), base)),
    [cmtHtml, base],
  )
  /** 설명·Traceability·댓글에 든 그림을 표를 얹어 받아 둔다 */
  const imgs = useJiraImgs(useMemo(() => [descJ, traceJ, ...cmtJ], [descJ, traceJ, cmtJ]))

  /**
   * **「자세히」 는 지라가 가진 칸을 그대로 낸다**(지적: 「지라 표현과
   * 너가 표현하는게 차이가 많아」).
   *
   * 예전엔 우리가 고른 여섯 칸만 냈다 — 그런데 이 프로젝트의 이슈에는
   * 사업자·이슈분류·발생빈도·OS 해결버전·UR 링크 같은 **커스텀 칸**이
   * 스무 개 넘게 붙어 있다. 그 칸들이 곧 이 조직이 이슈를 보는 눈인데
   * 우리 화면에서만 안 보였다.
   *
   * 이름은 서버가 준 `names`(칸 id → 보이는 이름)에서 온다. 값은
   * 지라가 렌더한 것(renderedFields)이 있으면 그것을 쓴다 — 날짜 꼴·링크가
   * 지라 화면과 같아진다.
   */
  const rows = useMemo(() => {
    const names = (q.data?.names ?? {}) as Record<string, string>
    const seen = new Set<string>()
    const out: Array<{ id: string; label: string; html: string; text: string; ord: number }> = []
    const add = (id: string) => {
      if (seen.has(id) || DETAIL_SKIP.has(id)) return
      if (traceId && id === traceId) return /* Traceability 는 제 칸에서 낸다 */
      const label = String(names[id] ?? '').trim()
      if (!label || isJunkName(label)) return
      /* **지정한 칸만 낸다**(지시: 붉은 박스). 지라의 칸 id 는 서버마다
         달라, 붙은 이름으로 거른다 — 띄어쓰기는 무시한다. 차례도 이
         목록이 정한다. 빈 값이어도 세운다: 칸이 있고 없고가 오락가락하면
         눈이 자리를 못 외운다. */
      const ord = DETAIL_ONLY.indexOf(label.replace(/\s+/g, ''))
      if (ord < 0) return
      seen.add(id)
      const raw = (f as Record<string, unknown>)[id]
      const html = DATE_FIELDS.has(id) ? '' : String((rf as Record<string, unknown>)[id] ?? '')
      const text = DATE_FIELDS.has(id) ? jdate(raw) : jval(raw)
      /* 플러그인이 제 내부 객체를 통째로 뱉는 칸이 있다 — 자바 클래스
         이름이 보이면 사람이 읽을 것이 아니다. 이름을 다 알 수 없으니
         값으로 거른다. */
      if (/com\.atlassian\.|\bcom\.\w+\.\w+\.\w+/.test(text) || /com\.atlassian\./.test(html)) return
      out.push({ id, label, html, text, ord })
    }
    for (const id of DETAIL_ALWAYS) add(id)
    for (const id of Object.keys(names)) add(id)
    return out.sort((a, b) => a.ord - b.ord)
  }, [q.data, f, rf, traceId])

  /** 활동 탭 — 지라와 같이 모두·댓글·이력 */
  const [act, setAct] = useState<'all' | 'cmt' | 'his'>('cmt')


  return (
    <div className="rls-ovl" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rls-drawer" role="dialog" aria-modal="true" aria-label={`${ikey} 세부`}>
        <header>
          <b>{ikey}</b>
          <span className={`rls-stat ${scat}`}>{pick(f.status, 'name')}</span>
          <span className="sp" />
          {base && (
            <a className="rls-jlink" href={`${base}/browse/${ikey}`} target="_blank" rel="noopener">
              Jira 에서 열기 ↗
            </a>
          )}
          <button type="button" className="rls-dx" onClick={onClose} title="닫기 (Esc)">
            ✕
          </button>
        </header>

        <div
          className="rls-dbody"
          /* Jira 는 그림을 첨부 주소로 감싸 둔다. 그냥 두면 눌렀을 때 Jira 로
             건너가 이 화면을 잃는다(지적) — 여기서 잡아 크게만 띄운다. */
          onClick={(e) => {
            const t = e.target as HTMLElement
            if (t.tagName !== 'IMG' || !t.closest('.rls-jira')) return
            if (t.dataset.fail) return /* 못 받은 자리 — 크게 볼 것이 없다 */
            e.preventDefault()
            e.stopPropagation()
            setLb((t as HTMLImageElement).src)
          }}
        >
          {q.isLoading && <div className="rls-none">불러오는 중…</div>}
          {!!err && <div className="rls-err">{err}</div>}

          {!q.isLoading && !err && (
            <>
              <div className="rls-dtitle">{String(f.summary ?? '')}</div>

              {/* 어디서 온 자료인가 — 저장본이면 시각과 갱신 길을 준다.
                  지라가 죽어 옛것을 낼 때(stale)는 그 말부터 한다. */}
              {q.data?.cached && (
                <div className={`rls-cband${q.data.stale ? ' bad' : ''}`}>
                  {q.data.stale
                    ? `지라에 닿지 못해 저장본을 보여줍니다${q.data.stale_error ? ` — ${q.data.stale_error}` : ''}`
                    : 'UTOP 저장본'}
                  <em>동기화 {String(q.data.fetched_at ?? '').slice(0, 16).replace('T', ' ')}</em>
                  <button type="button" onClick={() => setFreshN((n2) => n2 + 1)}>
                    지금 갱신
                  </button>
                </div>
              )}

              {/* ── **지라와 같은 차례**(지시): 자세히 · 설명 · Traceability ·
                     첨부 파일 · 이슈연결 · 활동. 우리 마음대로 늘어놓으면
                     Jira 를 보던 눈이 여기서 한 번 헤맨다. ── */}

              <h4 className="rls-dh">자세히</h4>
              <div className="rls-dmeta">
                {rows.map((r) => (
                  <div className="rls-fld" key={r.id}>
                    <span>{r.label}</span>
                    {r.html.trim() ? (
                      <b
                        className="rls-jira"
                        // eslint-disable-next-line react/no-danger
                        dangerouslySetInnerHTML={{ __html: jiraHtml(r.html, base) }}
                      />
                    ) : (
                      <b title={r.text}>{r.text || '없음'}</b>
                    )}
                  </div>
                ))}
              </div>

              {/* 화면이 끼워 넣는 것 — 지라에 없는 우리 값(분류 같은).
                  Releases 는 안 넘기므로 그 화면은 그대로다. */}
              {extra}

              <h4 className="rls-dh">설명</h4>
              {descHtml.trim() ? (
                <div
                  className="rls-jira"
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{ __html: withImgs(descJ, imgs) }}
                />
              ) : (
                <div className="rls-dtext">{descText.trim() || '(설명 없음)'}</div>
              )}

              {/* Traceability — Jira 의 **커스텀 칸**이다. id(customfield_…)를
                  박지 않고 보이는 이름으로 찾는다: 칸 id 는 Jira 마다 다르고,
                  박아 두면 다른 프로젝트에서 조용히 빈칸이 된다. */}
              {!!trace && (
                <>
                  <h4 className="rls-dh">{trace.label}</h4>
                  {trace.html ? (
                    <div
                      className="rls-jira"
                      // eslint-disable-next-line react/no-danger
                      dangerouslySetInnerHTML={{ __html: withImgs(traceJ, imgs) }}
                    />
                  ) : (
                    <div className="rls-dtext">{trace.text}</div>
                  )}
                </>
              )}

              <h4 className="rls-dh">첨부 파일 {atts.length || ''}</h4>
              {!atts.length && <div className="rls-dtext">(첨부 없음)</div>}
              {atts.map((a, i) => (
                <button
                  type="button"
                  className="rls-att"
                  key={String(a?.id ?? i)}
                  title="눌러서 내려받습니다"
                  /* `<a href="/api/…">` 로 두면 브라우저가 표(Authorization)를
                     못 얹어 401 이 온다 — 그림과 같은 까닭이다. 표를 얹어
                     받아서 내려준다. */
                  onClick={() => void dlAtt(String(a?.content ?? ''), String(a?.filename ?? '첨부'))}
                >
                  <span className="nm">{String(a?.filename ?? '(이름 없음)')}</span>
                  <span className="sz">{fsize(Number(a?.size ?? 0))}</span>
                  <span className="wh">
                    {pick(a?.author, 'displayName')} · {String(a?.created ?? '').replace('T', ' ').slice(0, 16)}
                  </span>
                </button>
              ))}

              <h4 className="rls-dh">이슈연결 {links.length || ''}</h4>
              {!links.length && <div className="rls-dtext">(연결된 이슈 없음)</div>}
              {links.map((l, i) => {
                const other = (l.outwardIssue ?? l.inwardIssue) as Record<string, unknown> | undefined
                const t = l.type as Record<string, unknown> | undefined
                const how = String((l.outwardIssue ? t?.outward : t?.inward) ?? t?.name ?? '')
                const of_ = (other?.fields ?? {}) as Record<string, unknown>
                const ok2 = String(other?.key ?? '')
                return (
                  <div className="rls-link" key={`${ok2}|${i}`}>
                    <span className="how">{how}</span>
                    <a
                      className="key"
                      href={base ? `${base}/browse/${ok2}` : undefined}
                      target="_blank"
                      rel="noopener"
                    >
                      {ok2}
                    </a>
                    <span className="sm">{String(of_.summary ?? '')}</span>
                    <span className={`rls-stat ${pick((of_.status as Record<string, unknown>)?.statusCategory, 'key')}`}>
                      {pick(of_.status, 'name')}
                    </span>
                  </div>
                )
              })}

              {/* ── **활동 — 지라와 같게**(지시). 지라는 모두·댓글·이력 탭이고,
                     댓글은 「누가 댓글을 추가했습니다 - 언제」 로 적는다. ── */}
              <h4 className="rls-dh">활동</h4>
              <div className="rls-acttab" role="tablist">
                {([
                  ['all', `모두 ${cmts.length + hist.length}`],
                  ['cmt', `댓글 ${cmts.length}`],
                  ['his', `이력 ${hist.length}`],
                ] as Array<['all' | 'cmt' | 'his', string]>).map(([k, t]) => (
                  <button
                    type="button"
                    key={k}
                    role="tab"
                    aria-selected={act === k}
                    className={act === k ? 'on' : ''}
                    onClick={() => setAct(k)}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {act !== 'his' &&
                (cmts.length ? (
                  cmts.map((c, i) => {
                    const who = pick(c.author, 'displayName')
                    const when = jdate(c.created)
                    const up = String(c.updated ?? '')
                    const fixed = !!up && up !== String(c.created ?? '')
                    const bh = cmtJ[i] ?? ''
                    return (
                      <div className="rls-cmt" key={String(c.id ?? i)}>
                        <div className="rls-cmth">
                          <i>{who.slice(0, 1) || '?'}</i>
                          <b>{who || '–'}</b>
                          <span>님이 댓글을 추가했습니다 - {when}</span>
                          {fixed && <em className="rls-fixed">수정됨</em>}
                        </div>
                        {bh.trim() ? (
                          <div
                            className="rls-jira"
                            // eslint-disable-next-line react/no-danger
                            dangerouslySetInnerHTML={{ __html: withImgs(bh, imgs) }}
                          />
                        ) : (
                          <div className="rls-dtext">{String(c.body ?? '')}</div>
                        )}
                      </div>
                    )
                  })
                ) : (
                  <div className="rls-dtext">(댓글 없음)</div>
                ))}

              {act !== 'cmt' &&
                (hist.length ? (
                  hist.map((h, i) => {
                    const who = pick(h.author, 'displayName')
                    const items = (h.items ?? []) as Array<Record<string, unknown>>
                    return (
                      <div className="rls-cmt" key={String(h.id ?? `h${i}`)}>
                        <div className="rls-cmth">
                          <i>{who.slice(0, 1) || '?'}</i>
                          <b>{who || '–'}</b>
                          <span>님이 변경했습니다 - {jdate(h.created)}</span>
                        </div>
                        {items.map((it2, k) => (
                          <div className="rls-hrow" key={k}>
                            <span className="rls-fld">{String(it2.field ?? '')}</span>
                            <span className="was">{String(it2.fromString ?? '') || '없음'}</span>
                            <span className="arw">→</span>
                            <span className="now">{String(it2.toString ?? '') || '없음'}</span>
                          </div>
                        ))}
                      </div>
                    )
                  })
                ) : (
                  <div className="rls-dtext">(이력 없음)</div>
                ))}
            </>
          )}
        </div>
      </div>

      {/* 그림 하나만 크게 — **화면을 넘어가지 않는다**(지적: 「사진 클릭하면
          화면이 바뀌는데 사진만 팝업 되게」). Jira 는 그림을 첨부 주소로
          감싸 두어서, 그냥 두면 눌렀을 때 Jira 로 건너간다. */}
      {!!lb && <Lightbox src={lb} onClose={() => setLb('')} />}
    </div>
  )
}

/**
 * 그림 크게 보기 — **확대·이동이 된다**(지적: 「사진이 작으면 볼수가 없어
 * 확대 기능을 추가 해」).
 *
 *  · 처음엔 화면에 맞춘다. 작은 그림은 키워서 띄운다(최대 4배) — 캡처
 *    화면은 원본이 작아 그대로 두면 읽을 수가 없다.
 *  · 휠로 확대·축소하고 끌어서 움직인다. 두 번 누르면 1:1 ↔ 맞춤.
 *  · 배율은 0.1 ~ 12배. 그 밖으로 나가면 되돌아올 길을 잃는다.
 */
function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  const [z, setZ] = useState(1)
  const [at, setAt] = useState({ x: 0, y: 0 })
  const box = useRef<HTMLDivElement>(null)
  const img = useRef<HTMLImageElement>(null)
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

  /** 화면에 맞는 배율 — 작으면 키우고(4배까지), 크면 줄인다 */
  const calcFit = useCallback(() => {
    const b = box.current
    const i = img.current
    if (!b || !i || !i.naturalWidth) return
    const r = b.getBoundingClientRect()
    const f = Math.min((r.width - 40) / i.naturalWidth, (r.height - 80) / i.naturalHeight)
    const v = Math.min(Math.max(f, 0.1), 4)
    setZ(v)
    setAt({ x: 0, y: 0 })
  }, [])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === '+' || e.key === '=') setZ((v) => Math.min(12, v * 1.25))
      if (e.key === '-') setZ((v) => Math.max(0.1, v / 1.25))
      if (e.key === '0') calcFit()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose, calcFit])

  const wheel = (e: WheelEvent) => {
    e.preventDefault()
    setZ((v) => Math.min(12, Math.max(0.1, v * (e.deltaY < 0 ? 1.12 : 1 / 1.12))))
  }

  return (
    <div
      className="rls-lb"
      ref={box}
      role="presentation"
      onWheel={wheel}
      /* 바탕을 눌렀을 때만 닫는다 — 그림을 끌다가 손을 떼도 안 닫힌다 */
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="rls-lbbar" role="presentation" onMouseDown={(e) => e.stopPropagation()}>
        <button type="button" onClick={() => setZ((v) => Math.max(0.1, v / 1.25))} title="축소 (−)">
          −
        </button>
        <span className="pct">{Math.round(z * 100)}%</span>
        <button type="button" onClick={() => setZ((v) => Math.min(12, v * 1.25))} title="확대 (+)">
          ＋
        </button>
        <button type="button" onClick={calcFit} title="화면에 맞춤 (0)">
          맞춤
        </button>
        <button type="button" onClick={() => { setZ(1); setAt({ x: 0, y: 0 }) }} title="원래 크기">
          1:1
        </button>
        <a href={src} download title="내려받기">
          ⤓
        </a>
        <button type="button" onClick={onClose} title="닫기 (Esc)">
          ✕
        </button>
      </div>
      <img
        ref={img}
        src={src}
        alt=""
        draggable={false}
        style={{ transform: `translate(${at.x}px, ${at.y}px) scale(${z})`, cursor: drag.current ? 'grabbing' : 'grab' }}
        onLoad={calcFit}
        onDoubleClick={() => (Math.abs(z - 1) < 0.01 ? calcFit() : (setZ(1), setAt({ x: 0, y: 0 })))}
        onMouseDown={(e) => {
          e.preventDefault()
          e.stopPropagation()
          drag.current = { x: e.clientX, y: e.clientY, ox: at.x, oy: at.y }
          const mv = (m: MouseEvent) => {
            const d = drag.current
            if (d) setAt({ x: d.ox + m.clientX - d.x, y: d.oy + m.clientY - d.y })
          }
          const up = () => {
            drag.current = null
            window.removeEventListener('mousemove', mv)
            window.removeEventListener('mouseup', up)
          }
          window.addEventListener('mousemove', mv)
          window.addEventListener('mouseup', up)
        }}
      />
      <div className="rls-lbhint">휠 확대 · 끌어서 이동 · 두 번 눌러 1:1 ↔ 맞춤 · Esc 닫기</div>
    </div>
  )
}
