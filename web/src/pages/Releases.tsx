import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type WheelEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { isManual } from '@/lib/runMode'
import { isReleaseTc } from '@/lib/tcSeries'
import { prefGet, prefSet } from '@/lib/prefs'
import Resizer, { useResizableWidth } from '@/components/Resizer'
import { currentProjects, onProjectChange } from '@/components/ProjectPicker'
import TcForm from '@/components/TcForm'
import TestCases from '@/pages/TestCases'
import Crumb from '@/components/tc/Crumb'
import type { Project } from '@/types'
import './Releases.css'

/**
 * **Releases — Jira 버전별 이슈와 그 이슈를 덮는 시험.**
 *
 * 「이번 릴리스의 이슈가 다 검증됐나」 를 배포 전에 보는 자리다.
 *
 * ## Sync 한 것은 남는다
 *
 * 예전엔 Sync 를 눌러야만 표가 찼고, 새로고침하면 도로 비었다(지적:
 * 「계속 새로 해야 됩니다」). Jira 응답을 화면 안에만 들고 있었기 때문이다.
 *
 * 이제 **가져온 이슈를 `release_summary` 에 그대로 넣는다.** 옛 화면
 * (`_rlsStore`)이 쓰던 모양 그대로다 —
 *
 *   releases["프로젝트@@버전"]["이슈키"] = { summary, type, status, statusCat,
 *                                            assignee, reporter, …, tcs:[…] }
 *
 * 그래서 ① 새로고침해도 그대로 있고 ② 옛 화면이 쌓아 둔 것도 그대로 보이고
 * ③ 표를 그릴 때 Jira 를 안 두드린다. 표에 서는 버전 = **Sync 한 버전**이다.
 *
 * Sync 는 두 자리에 있다. 위 줄의 것은 체크한 버전을 한꺼번에, 버전 줄의
 * ↻ 는 그 버전 하나만 — 한 버전만 다시 보려고 79개를 다시 받지 않는다.
 */

/** 사업자 — 버전 이름의 괄호에서 뽑는다. 옛 화면(_rlsOperator)과 같은 규칙이라
 *  같은 자료가 같은 묶음으로 선다. 예: `R24(LGU_R5.5.0)` → `LGU+` */
function operatorOf(ver: string): string {
  const m = String(ver || '').match(/\(([A-Za-z가-힣]+)[_)]/)
  const code = String(m?.[1] ?? '').toUpperCase()
  const map: Record<string, string> = { LGU: 'LGU+', KT: 'KT', KTS: 'KT', SKB: 'SKB', SK: 'SK', SO: 'SO' }
  return map[code] || code || '공통'
}

interface JiraVersion {
  id?: string
  name?: string
  released?: boolean
  archived?: boolean
  releaseDate?: string
  startDate?: string
  description?: string
}
/** Jira 가 준 이슈 — 받은 그대로. 저장할 때 아래 StoredIssue 로 줄인다 */
interface JiraIssue {
  key: string
  fields?: {
    summary?: string
    created?: string
    status?: { name?: string; statusCategory?: { key?: string } }
    issuetype?: { name?: string }
    priority?: { name?: string }
    resolution?: { name?: string }
    reporter?: { displayName?: string }
    assignee?: { displayName?: string }
    fixVersions?: Array<{ name?: string }>
  }
}
/** 이슈 하나에 붙은 시험 — 옛 자료의 tcs 는 문자열이거나 객체다 */
interface LinkTc {
  tcid?: string
  id?: string
  result?: string
}
/** **저장되는 이슈.** 칸 이름은 옛 화면과 한 글자도 다르지 않다 —
 *  이름을 바꾸면 그 화면이 쌓아 둔 것을 못 읽는다. */
interface StoredIssue {
  key?: string
  summary?: string
  type?: string
  status?: string
  statusCat?: string
  priority?: string
  resolution?: string
  assignee?: string
  reporter?: string
  created?: string
  source?: string
  /** 언제 Jira 에서 받아 왔나 — 버전 줄에 「마지막 Sync」 로 나온다 */
  syncedAt?: string
  tcs?: Array<LinkTc | string>
}
type Store = Record<string, Record<string, StoredIssue>>

/** 빈 목록은 **하나를 돌려쓴다** — 매번 [] 를 새로 만들면 그것만으로도
 *  memo 가 깨진다. */
const EMPTY: string[] = []

/** 이 화면이 다루는 이슈 종류 — 시험으로 덮을 거리가 되는 것만(지시) */
const KINDS = ['Defect', 'CR', '개발 Defect']

/** 「이 버전을 가져왔다」 는 자국. 이슈키가 아니므로 Jira 와 안 부딪친다 */
const SYNC_MARK = '__synced__'

const tcidOf = (t: LinkTc | string): string =>
  typeof t === 'string' ? t : String(t?.tcid ?? t?.id ?? '')

/** 받은 이슈를 저장할 모양으로 줄인다. 화면이 그리는 칸만 남긴다 —
 *  Jira 응답을 통째로 넣으면 이슈 백 건에 몇 MB 가 된다. */
function shrink(it: JiraIssue, at: string, old?: StoredIssue): StoredIssue {
  const f = it.fields ?? {}
  return {
    ...old,
    key: it.key,
    summary: String(f.summary ?? ''),
    type: String(f.issuetype?.name ?? ''),
    status: String(f.status?.name ?? ''),
    statusCat: String(f.status?.statusCategory?.key ?? ''),
    priority: String(f.priority?.name ?? ''),
    resolution: String(f.resolution?.name ?? ''),
    assignee: String(f.assignee?.displayName ?? ''),
    reporter: String(f.reporter?.displayName ?? ''),
    created: String(f.created ?? '').slice(0, 10),
    source: old?.source || 'jira',
    syncedAt: at,
    /* 붙여 둔 시험은 **건드리지 않는다.** Sync 는 Jira 쪽 이야기를
       새로 받는 것이지, 사람이 이어 둔 것을 지우는 일이 아니다. */
    tcs: old?.tcs ?? [],
  }
}

/** 언제 받아 왔나 — 「09-02 11:20」 */
function stamp(iso: string): string {
  const s = String(iso || '')
  if (s.length < 16) return ''
  return `${s.slice(5, 10).replace('-', '.')} ${s.slice(11, 16)}`
}

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

/** 이슈 한 줄.
 *
 *  **따로 떼어 memo 로 감쌌다.** 한 줄 안에 다 두었더니 이슈 하나를 펼 때마다
 *  97줄이 전부 다시 그려져 화면이 무거웠다(지적). 이제 눌린 줄만 다시 그린다.
 */
const IssueRow = memo(function IssueRow({
  it, ver, open, tcs, tcById, resultOf, onToggle, onNew, onPick, onDrop, onDetail, onOpenTc, openTc,
  onResync, busy,
}: {
  onNew: (ver: string, key: string, summary: string) => void
  onPick: (ver: string, key: string) => void
  onDrop: (ver: string, key: string, tcid: string) => void
  onDetail: (key: string) => void
  /** 이 이슈만 Jira 에서 다시 읽는다 */
  onResync: (ver: string, key: string) => void
  /** 지금 무언가 받는 중인가 — 그동안은 단추를 못 누른다 */
  busy: boolean
  /** 붙은 시험을 연다 — **이 화면 위에 팝업**으로. 넘어가 버리면 이슈를
   *  보던 자리를 잃는다(지적: 「TC 클릭해서 내용을 확인 할 수 없어」). */
  onOpenTc: (tcid: string) => void
  /** 이 이슈에서 지금 펼친 시험 — 탭이 눌린 것 */
  openTc: string
  it: StoredIssue
  ver: string
  open: boolean
  tcs: string[]
  tcById: Map<string, { name: string; kind: string }>
  resultOf: (tcid: string) => string
  onToggle: (k: string) => void
}) {
  const k = String(it.key ?? '')
  return (
    <div className={`rls-iblock${open ? ' on' : ''}`}>
      <div className="rls-irow">
        {/* **「>」 하나로 쓰고 펴지면 돌린다**(지시: 「> 이런걸로 더 크게」).
            글자를 ▸/▾ 로 바꿔 끼우면 두 글자의 무게중심이 달라 눌릴 때마다
            줄이 미세하게 흔들린다. 같은 글자를 돌리면 안 흔들린다. */}
        {/* **이 이슈만 다시 읽기** — 펼침 단추 왼쪽(지시). 오른쪽 끝에
            두었더니 빈 열 하나가 늘 서 있었다. 가리키거나 펼친 줄에만 뜬다. */}
        <button
          type="button"
          className="rls-isync"
          disabled={busy}
          title={`${k} 만 Jira 에서 다시 읽습니다`}
          onClick={(e) => {
            e.stopPropagation()
            onResync(ver, k)
          }}
        >
          ↻
        </button>
        <span
          className={`rls-car${open ? ' on' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => onToggle(`${ver}|${k}`)}
          onKeyDown={(e) => e.key === 'Enter' && onToggle(`${ver}|${k}`)}
        >
          ›
        </span>
        {/* 이슈 키를 누르면 **서랍**이 열린다 — 설명·댓글은 Jira 로 건너가지
            않고 여기서 본다(지시) */}
        <button
          type="button"
          className="rls-key as-btn"
          title="Jira 세부 보기 — 설명·댓글·첨부"
          onClick={() => onDetail(k)}
        >
          {k}
        </button>
        {/* 붙은 시험 수 — **키 바로 오른쪽**(지시). 줄 끝에 두었더니 이슈
            제목을 읽다가 눈이 끝까지 갔다 와야 했다. 이슈와 시험은 한 쌍이라
            붙어 있어야 읽힌다. */}
        <span className={`rls-tcn${tcs.length ? ' has' : ''}`}>( {tcs.length} )</span>
        {/* 제목을 **같은 줄에** 둔다(지시: 「왜 2행이야」). 제목이 가운데를
            채우고, 유형·상태·사람은 오른쪽에 붙는다 — 한 이슈가 한 줄이면
            백 건을 훑을 때 눈이 위아래로 안 튄다. */}
        <span className="rls-ititle" title={it.summary ?? ''}>
          {it.summary ?? ''}
        </span>
        <span className="rls-type">{it.type ?? ''}</span>
        <span className={`rls-stat ${it.statusCat ?? ''}`}>{it.status ?? ''}</span>
        {/* 「보고자」·「담당자」 라는 글자는 뺐다(지시) — 줄마다 되풀이되면
            이름을 가린다. 그 이름표는 위 머리줄이 한 번만 단다. */}
        <span className="rls-person" title={`보고자 ${it.reporter || '–'}`}>
          {it.reporter || '–'}
        </span>
        <span className="rls-person" title={`담당자 ${it.assignee || '–'}`}>
          {it.assignee || '–'}
        </span>
      </div>
      {open && (
        /* 펼치면 **붙은 시험이 가로로** 선다 — `E61xx_V0001`, `E61xx_V0002`.
         *  누르면 **팝업**으로 그 시험이 열린다(승인). 2열 안에 통째로
         *  얹어 보았는데 시험 화면(Info·Topology·Manual…)이 들어가기엔
         *  칸이 좁아 글자가 접혔다. */
        <div className="rls-tcs">
          <div className="rls-tabs">
            {tcs.map((tcid) => {
              const t = tcById.get(tcid)
              const rv = resultOf(tcid)
              const on = openTc === tcid
              return (
                <span key={tcid} className={`rls-tab${on ? ' on' : ''}`}>
                  <button
                    type="button"
                    className="rls-tabb"
                    title={t?.name ?? '(지워진 시험 항목)'}
                    onClick={() => onOpenTc(tcid)}
                  >
                    {tcid}
                    {!!rv && <i className={`rls-res ${rv.toLowerCase()}`}>{rv.toUpperCase()}</i>}
                  </button>
                  {/* 이 이슈에서만 뗀다 — 시험 항목 자체는 안 지운다 */}
                  <button
                    type="button"
                    className="rls-tabx"
                    title="이 이슈에서 뺍니다 — 시험 항목 자체는 안 지웁니다"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDrop(ver, k, tcid)
                    }}
                  >
                    ✕
                  </button>
                </span>
              )
            })}
            <button
              type="button"
              className="rls-add"
              title="이 이슈를 덮을 시험을 새로 만듭니다 — 만들면 바로 아래에 펼쳐집니다"
              onClick={() => onNew(ver, k, String(it.summary ?? ''))}
            >
              ＋ TC 추가
            </button>
            <button
              type="button"
              className="rls-add sub"
              title="이미 있는 시험 항목을 이 이슈에 붙입니다"
              onClick={() => onPick(ver, k)}
            >
              붙이기
            </button>
          </div>

          {!tcs.length && (
            <div className="rls-tcrow rls-empty">이 이슈에 붙은 시험 항목이 없습니다.</div>
          )}
        </div>
      )}
    </div>
  )
})

export default function Releases() {
  const qc = useQueryClient()
  const [proj, setProj] = useState(() => prefGet('utop.rls.proj') ?? '')
  const [fOp, setFOp] = useState('')
  const [fType, setFType] = useState('')
  const [fStat, setFStat] = useState('')
  /** 접은 사업자 — 기본은 펴짐이다. 사업자가 서넛뿐이라 접힌 채로
      시작하면 첫 화면이 비어 보인다. */
  const [shut, setShut] = useState<Set<string>>(new Set())
  const toggleOp = useCallback((op: string) => {
    setShut((s0) => {
      const n = new Set(s0)
      if (!n.delete(op)) n.add(op)
      return n
    })
  }, [])
  /** **2열이 보여 줄 버전** — 한 번에 한 버전. 이슈가 백 건을 넘는 버전이
      흔해서, 여러 버전을 한 줄기에 늘어놓으면 어디를 보고 있는지 잃는다. */
  const [selVer, setSelVer] = useState(() => prefGet('utop.rls.ver') ?? '')
  /** 1열 폭 — **REQ-Coverage 와 같은 부품**이 들고 저장한다(지시).
   *  직접 만들어 쓰던 것을 걷었다: 세로바 모양도 저장 규칙도 한 곳에 있어야
   *  두 화면이 안 갈린다. */
  const [w1, setW1] = useResizableWidth('utop.rls.w1', 306, 160, 560)
  /** 세로바가 「어디부터 재는지」 알려면 2행 왼쪽 끝이 필요하다 */
  const splitRef = useRef<HTMLDivElement>(null)
  const [openIssue, setOpenIssue] = useState<Set<string>>(new Set())
  /** 머리줄에서 고른 UTOP 프로젝트 — 바뀌면 이 화면도 따라간다 */
  const [utop, setUtop] = useState<string[]>(() => currentProjects())
  useEffect(() => onProjectChange(() => setUtop(currentProjects())), [])
  /** 체크한 버전들 — **Sync 할 것**을 고르는 자리다. 표에 서는 것은
      「Sync 한 버전」 이지 여기서 체크한 것이 아니다. */
  const [vers, setVers] = useState<string[]>([])
  const [verOpen, setVerOpen] = useState(false)
  /** 이미 있는 시험 붙이는 창 · 새로 만드는 창 · Jira 세부 서랍 */
  const [addTo, setAddTo] = useState<{ ver: string; key: string } | null>(null)
  const [newTo, setNewTo] = useState<{ ver: string; key: string; summary: string } | null>(null)
  const [detail, setDetail] = useState('')
  /** Sync 진행 — 「R1.1.2 (1/3)」. 몇 개 중 몇 번째인지 안 보이면 멈춘 줄 안다 */
  const [busy, setBusy] = useState('')
  /** 팝업으로 연 시험 항목 — 스텝을 적는 자리다 */
  const [tcOpen, setTcOpen] = useState('')
  /** 끼워 넣은 시험 화면이 건네는 저장·⋯ — **팝업 머리줄이 그린다**.
   *  REQ-Coverage 가 하는 것과 같다: 안쪽 머리줄을 그대로 두면 「← 목록·
   *  저장됨·⋯」 이 한 줄 더 서서, 같은 단추가 두 줄로 겹친다(그쪽에서 이미
   *  지적받아 고친 자리다). */
  const [tcApi, setTcApi] = useState<{
    dirty: boolean
    saving: boolean
    save: () => void
    menu: ReactNode
  } | null>(null)

  /** 이슈 펴기·접기 — **같은 함수**를 계속 준다. 매번 새로 만들면 memo 가
      「달라졌다」 고 보고 다 다시 그린다. */
  const toggleIssue = useCallback((k: string) => {
    setOpenIssue((s0) => {
      const n = new Set(s0)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })
  }, [])

  /* ── 프로젝트 ── */
  /** UTOP 프로젝트들 — 어느 Jira 프로젝트에 물렸는지 여기 적혀 있다 */
  const upQ = useQuery({
    queryKey: ['projects'],
    staleTime: 300_000,
    queryFn: async () => {
      const r = await apiFetch('/api/projects')
      if (!r.ok) return { projects: [] as Project[] }
      return (await r.json()) as { projects?: Project[] }
    },
  })

  const projQ = useQuery({
    queryKey: ['jira-projects'],
    staleTime: 300_000,
    queryFn: async () => {
      const r = await apiFetch('/api/jira/projects')
      if (!r.ok) throw new Error('Jira 프로젝트를 불러오지 못했습니다')
      return (await r.json()) as { ok?: boolean; projects?: Array<{ key: string; name: string }>; error?: string }
    },
  })
  const jiraAll = useMemo(
    () =>
      [...(projQ.data?.projects ?? [])].sort((a, b) =>
        String(a.key).localeCompare(String(b.key), undefined, { numeric: true }),
      ),
    [projQ.data],
  )
  /** **이 화면이 다루는 Jira 프로젝트.**
   *
   *  머리줄에서 고른 UTOP 프로젝트에 물린 것만 띄운다(지시). 「전체
   *  프로젝트」 면 물려 둔 것 전부. 서른 개를 늘어놓고 사람이 찾게 하지
   *  않는다 — 물리는 자리는 프로젝트 설정의 「Jira 프로젝트」 칸이다. */
  const linked = useMemo(() => {
    const ups = upQ.data?.projects ?? []
    const mine = utop.length ? ups.filter((p) => utop.includes(p.id)) : ups
    const keys = [...new Set(mine.map((p) => String(p.jira_project ?? '')).filter(Boolean))]
    const byKey = new Map(jiraAll.map((p) => [p.key, p]))
    return keys.map((k) => byKey.get(k) ?? { key: k, name: k })
  }, [upQ.data, utop, jiraAll])
  const allProjects = linked
  /** **이 Jira 프로젝트에 물린 UTOP 프로젝트.**
   *
   *  모델그룹·모델명이 거기 적혀 있다. 새 시험은 모델을 고정해야 하는데
   *  (합의: 판정 기준이 모델마다 갈린다), 그 값을 여기서 끌어오면 시험을
   *  만들 때 사람에게 다시 묻지 않아도 된다 — 누르면 바로 스텝 화면이다.
   *  둘 이상 물려 있거나 모델이 안 적혀 있으면 못 고르니, 그때만 창을 띄운다. */
  const mine = useMemo(() => {
    const ups = (upQ.data?.projects ?? []).filter((p) => String(p.jira_project ?? '') === proj)
    const head = utop.length ? ups.filter((p) => utop.includes(p.id)) : ups
    const cands = (head.length ? head : ups).filter((p) => p.model_group && p.model)
    return cands.length === 1 ? cands[0]! : null
  }, [upQ.data, proj, utop])

  /** 즐겨찾기 — Jira 설정의 fav_projects. 옛 화면과 **같은 열쇠**라 거기서
   *  정해 둔 것이 그대로 온다. */
  const cfgQ = useQuery({
    queryKey: ['jira-cfg'],
    staleTime: 300_000,
    queryFn: async () => {
      const r = await apiFetch('/api/jira/config')
      if (!r.ok) return {} as Record<string, unknown>
      return (await r.json()) as Record<string, unknown>
    },
  })
  const favs = useMemo(() => {
    const v = cfgQ.data?.fav_projects
    const arr = Array.isArray(v)
      ? v.map(String)
      : String(v ?? '')
          .split(/[,\s]+/)
          .filter(Boolean)
    return arr
  }, [cfgQ.data])
  /** Jira 주소 — 서랍의 그림·링크를 절대 주소로 펴는 데 쓴다 */
  const jbase = useMemo(() => String(cfgQ.data?.url ?? '').replace(/\/+$/, ''), [cfgQ.data])

  useEffect(() => {
    /* 즐겨찾기(fav_projects)가 있으면 그 첫 번째로 시작한다 — 옛 화면과
       같은 열쇠라 거기서 정해 둔 것이 그대로 온다. */
    if (proj || !favs.length || !allProjects.length) return
    const f = allProjects.find((p) => favs.includes(p.key))
    if (f) setProj(f.key)
  }, [favs, allProjects, proj])

  useEffect(() => {
    if (proj) prefSet('utop.rls.proj', proj)
  }, [proj])

  /* ── 버전 ── */
  const verQ = useQuery({
    queryKey: ['jira-versions', proj],
    enabled: !!proj,
    staleTime: 60_000,
    queryFn: async () => {
      const r = await apiFetch(`/api/jira/versions?project=${encodeURIComponent(proj)}`)
      if (!r.ok) throw new Error('버전을 불러오지 못했습니다')
      return (await r.json()) as { ok?: boolean; versions?: JiraVersion[]; error?: string }
    },
  })

  /* ── 쌓아 둔 것 — 이슈·이슈↔TC 연결이 **여기 한 곳**에 있다 ── */
  const sumQ = useQuery({
    queryKey: ['release-summary'],
    staleTime: 30_000,
    queryFn: async () => {
      const r = await apiFetch('/api/release-summary')
      if (!r.ok) return { releases: {} as Store }
      const j = (await r.json()) as { releases?: unknown }
      const rel = j?.releases
      return { releases: (rel && typeof rel === 'object' && !Array.isArray(rel) ? rel : {}) as Store }
    },
  })
  const tcQ = useQuery({
    queryKey: ['tc-meta-rls'],
    staleTime: 300_000,
    queryFn: async () => {
      const r = await apiFetch('/api/tc?meta=1')
      if (!r.ok) return { tcs: [] as Array<{ tcid: string; name?: string; kind?: string }> }
      return (await r.json()) as { tcs?: Array<{ tcid: string; name?: string; kind?: string }> }
    },
  })
  const lastQ = useQuery({
    queryKey: ['tc-last-result'],
    staleTime: 60_000,
    queryFn: async () => {
      const r = await apiFetch('/api/tc-last-result')
      if (!r.ok) return {} as Record<string, { result?: string }>
      const j = (await r.json()) as { items?: Record<string, { result?: string }> }
      return j.items ?? {}
    },
  })
  const tcById = useMemo(() => {
    const m = new Map<string, { name: string; kind: string }>()
    for (const t of tcQ.data?.tcs ?? [])
      m.set(String(t.tcid), { name: String(t.name ?? ''), kind: String(t.kind ?? '') })
    return m
  }, [tcQ.data])

  const store = useMemo(() => sumQ.data?.releases ?? ({} as Store), [sumQ.data])

  /* ── Sync — 받은 것을 **저장한다** ── */

  /** 저장하기 직전에 **서버에서 다시 읽어** 그 위에 얹는다.
   *
   *  `/api/release-summary` 는 통째로 덮는 통로다. 손에 든 사본으로 쓰면
   *  ① 그 사이 남이 저장한 것이 사라지고(둘이 같이 보는 화면이다)
   *  ② 아직 못 읽은 채로 눌리면 **다른 프로젝트 것까지 빈 값으로 덮는다.**
   *  한 번 더 읽는 이 한 겹이 그 둘을 다 막는다. */
  const readStore = async (): Promise<Store> => {
    const r = await apiFetch('/api/release-summary')
    if (!r.ok) throw new Error('저장된 것을 읽지 못했습니다')
    const j = (await r.json()) as { releases?: unknown }
    const rel = j?.releases
    return (rel && typeof rel === 'object' && !Array.isArray(rel) ? rel : {}) as Store
  }

  /** 한 버전의 이슈를 Jira 에서 받는다. 이 세 종류만(지시) — 나머지는
   *  시험으로 덮을 거리가 아니라 이 화면에 설 까닭이 없다. Jira 에서
   *  걸러 오므로 받는 양도 그만큼 준다. */
  const fetchVer = async (p: string, ver: string): Promise<JiraIssue[]> => {
    const types = KINDS.map((k) => `"${k}"`).join(', ')
    const jql = `project = ${p} AND fixVersion = "${ver}" AND issuetype in (${types}) ORDER BY key DESC`
    const f = 'summary,status,issuetype,priority,resolution,reporter,assignee,created,fixVersions'
    const r = await apiFetch(
      `/api/jira/search-all?jql=${encodeURIComponent(jql)}&fields=${encodeURIComponent(f)}`,
    )
    if (!r.ok) throw new Error('이슈를 불러오지 못했습니다')
    const j = (await r.json()) as { ok?: boolean; issues?: JiraIssue[]; error?: string }
    if (j.error) throw new Error(String(j.error))
    return j.issues ?? []
  }

  /** 버전 몇 개를 받아 **한 번에** 저장한다.
   *
   *  버전마다 저장하면 그 사이에 남이 저장한 것을 덮는다 — 다 받아 놓고
   *  한 번만 쓴다. 실패한 버전은 건너뛰고 까닭을 말한다(하나가 막혔다고
   *  나머지까지 버릴 일이 아니다). */
  const syncVers = useCallback(
    async (list: string[]) => {
      if (!proj || !list.length || busy) return
      /* 먼저 **다 받는다.** 받는 중간에 저장하면, 뒤 버전이 실패했을 때
         절반만 반영된 채로 남는다. */
      const got: Array<[string, JiraIssue[]]> = []
      const bad: string[] = []
      let n = 0
      for (const ver of list) {
        n += 1
        setBusy(`${ver} (${n}/${list.length})`)
        try {
          got.push([ver, await fetchVer(proj, ver)])
        } catch {
          bad.push(ver)
        }
      }
      if (got.length) {
        setBusy('저장 중…')
        try {
          const next = await readStore()
          for (const [ver, arr] of got) {
            const at = new Date().toISOString()
            const bag: Record<string, StoredIssue> = { ...(next[`${proj}@@${ver}`] ?? {}) }
            const seen = new Set<string>()
            for (const it of arr) {
              if (!it?.key) continue
              seen.add(it.key)
              bag[it.key] = shrink(it, at, bag[it.key])
            }
            /* Jira 에서 이 버전이 떨어진 이슈는 뺀다 — 안 빼면 옮겨 간 이슈가
               옛 버전에 영영 남는다. **다만 붙여 둔 시험이 있으면 남긴다**:
               사람이 이어 둔 것을 Sync 가 조용히 지우면 안 된다. */
            for (const k of Object.keys(bag)) {
              if (k === SYNC_MARK) continue
              if (seen.has(k)) continue
              if ((bag[k]?.tcs ?? []).length) continue
              delete bag[k]
            }
            /* **가져왔다는 자국을 남긴다.** 이슈가 한 건도 없는 버전은
               담을 것이 없어 빈 칸이 되고, 빈 칸은 표에서 걸러져 사라졌다 —
               「이슈 없는 버전」 과 「동기화 실패」 가 구별이 안 됐다(지적:
               왜 이건 못 가져오지). 시험용 빌드는 결함이 안 걸린 것이
               정상이다.
               이 자국은 제목·유형·시험이 다 없어 이슈 줄로는 안 선다(옛
               화면의 빈 껍데기 거르는 규칙과 같다). */
            bag[SYNC_MARK] = { syncedAt: at }
            next[`${proj}@@${ver}`] = bag
          }
          await apiFetch('/api/release-summary', {
            method: 'POST',
            body: JSON.stringify({ releases: next }),
          })
          await qc.invalidateQueries({ queryKey: ['release-summary'] })
        } catch {
          window.alert('가져온 것을 저장하지 못했습니다')
        }
      }
      setBusy('')
      if (bad.length) window.alert(`Jira 를 읽지 못한 버전: ${bad.join(', ')}`)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [proj, busy, qc],
  )

  /** 이 버전을 표에서 치운다 — 붙여 둔 시험까지 사라지므로 한 번 묻는다 */
  /**
   * **이슈 하나만 다시 읽는다**(지시: 「지라 이슈별로 sync 를 할 수 있나」).
   *
   * 버전 Sync 는 그 버전의 이슈를 전부 다시 받는다 — 188건짜리 버전에서
   * 한 이슈의 상태만 바뀌었을 때 쓰기엔 무겁다. 이것은 그 한 건만 받아
   * 제목·상태·담당자를 갱신한다.
   *
   * 저장 모양은 버전 Sync 와 **같은 함수**(shrink)를 쓴다 — 두 벌로 만들면
   * 어느 날 칸 하나가 서로 달라진다. 붙여 둔 시험(tcs)도 그 함수가 지킨다.
   */
  const syncIssue = useCallback(
    async (ver: string, key: string) => {
      if (!proj || !ver || !key || busy) return
      setBusy(`${key} 다시 읽는 중…`)
      try {
        const r = await apiFetch(`/api/jira/issue/${encodeURIComponent(key)}`)
        const j = (await r.json()) as { ok?: boolean; error?: string; fields?: JiraIssue['fields'] }
        if (!r.ok || j.ok === false) throw new Error(String(j.error ?? r.status))
        const next = await readStore()
        const kk = `${proj}@@${ver}`
        const bag: Record<string, StoredIssue> = { ...(next[kk] ?? {}) }
        /* Jira 에서 사라졌거나 접근이 막힌 이슈면 손대지 않는다 — 빈 값으로
           덮어써 목록에서 지워 버리면 붙여 둔 시험까지 자리를 잃는다. */
        if (!j.fields) throw new Error('이슈를 읽지 못했습니다')
        bag[key] = shrink({ key, fields: j.fields }, new Date().toISOString(), bag[key])
        next[kk] = bag
        await apiFetch('/api/release-summary', {
          method: 'POST',
          body: JSON.stringify({ releases: next }),
        })
        await qc.invalidateQueries({ queryKey: ['release-summary'] })
        /* 서랍이 열려 있으면 그것도 새로 — 같은 이슈를 보고 있을 수 있다 */
        await qc.invalidateQueries({ queryKey: ['jira-issue', key] })
      } catch (e) {
        window.alert(`${key} 를 다시 읽지 못했습니다 — ${e instanceof Error ? e.message : String(e)}`)
      }
      setBusy('')
    },
    [proj, busy, readStore, qc],
  )

  const dropVer = useCallback(
    async (ver: string) => {
      const bag = store[`${proj}@@${ver}`] ?? {}
      const tcN = Object.values(bag).reduce((a, x) => a + (x?.tcs ?? []).length, 0)
      if (
        !window.confirm(
          `${ver} 를 이 화면에서 치웁니다.\n이슈 ${Object.keys(bag).length}건${
            tcN ? ` · 붙여 둔 시험 ${tcN}건` : ''
          } 이 함께 사라집니다.\n(Jira 는 그대로입니다 — 다시 Sync 하면 이슈는 돌아옵니다)`,
        )
      )
        return
      const next: Store = await readStore()
      delete next[`${proj}@@${ver}`]
      await apiFetch('/api/release-summary', {
        method: 'POST',
        body: JSON.stringify({ releases: next }),
      })
      await qc.invalidateQueries({ queryKey: ['release-summary'] })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [proj, qc],
  )

  /* ── 쌓아 둔 것에서 표를 세운다 ── */

  /** **Sync 한 버전** — 옛 화면(_rlsProjVers)과 같다. 표에 서는 것은
   *  체크한 것이 아니라 가져와 둔 것이다. */
  const savedVers = useMemo(() => {
    const pre = `${proj}@@`
    return Object.keys(store)
      .filter((k) => k.startsWith(pre) && Object.keys(store[k] ?? {}).length)
      .map((k) => k.slice(pre.length))
      .sort((a, b) => String(b).localeCompare(String(a), undefined, { numeric: true }))
  }, [store, proj])

  /** 처음 들어왔을 때 **가져와 둔 버전에 체크를 해 둔다** — 위 Sync 를
   *  그냥 누르면 보고 있는 것이 새로 고쳐진다. */
  const [primed, setPrimed] = useState('')
  useEffect(() => {
    if (!proj || sumQ.isLoading || primed === proj) return
    setPrimed(proj)
    setVers(savedVers)
  }, [proj, savedVers, sumQ.isLoading, primed])

  /** 버전 이름 → Jira 가 준 곁들이(배포 여부·날짜). 없으면 이름만 쓴다 */
  const verMeta = useMemo(() => {
    const m = new Map<string, JiraVersion>()
    for (const v of verQ.data?.versions ?? []) m.set(String(v.name ?? ''), v)
    return m
  }, [verQ.data])

  /** 버전별 이슈 — 저장된 것에서 꺼낸다. 제목·유형·시험이 다 없는 빈
   *  껍데기는 안 보인다(옛 화면과 같은 규칙). */
  const byVer = useMemo(() => {
    const m = new Map<string, StoredIssue[]>()
    for (const vn of savedVers) {
      const bag = store[`${proj}@@${vn}`] ?? {}
      const arr = Object.entries(bag)
        .filter(([k]) => k !== SYNC_MARK)
        .map(([k, v]) => ({ ...(v ?? {}), key: String(v?.key ?? k) }))
        .filter((o) => String(o.summary ?? '').trim() || o.type || (o.tcs ?? []).length)
        .sort((a, b) => String(a.key).localeCompare(String(b.key), undefined, { numeric: true }))
      m.set(vn, arr)
    }
    return m
  }, [savedVers, store, proj])

  const opts = useMemo(() => {
    const t = new Set<string>()
    const s = new Set<string>()
    for (const arr of byVer.values())
      for (const it of arr) {
        if (it.type) t.add(String(it.type))
        if (it.status) s.add(String(it.status))
      }
    const srt = (a: string, b: string) => a.localeCompare(b, 'ko')
    return { types: [...t].sort(srt), stats: [...s].sort(srt) }
  }, [byVer])

  const keep = (it: StoredIssue) =>
    (!fType || String(it.type ?? '') === fType) && (!fStat || String(it.status ?? '') === fStat)

  const tree = useMemo(() => {
    const g = new Map<string, string[]>()
    for (const vn of savedVers) {
      const op = operatorOf(vn)
      if (fOp && op !== fOp) continue
      const arr = g.get(op)
      if (arr) arr.push(vn)
      else g.set(op, [vn])
    }
    return [...g.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ko'))
  }, [savedVers, fOp])

  const ops = useMemo(() => [...new Set(savedVers.map((v) => operatorOf(v)))].sort(), [savedVers])

  const resultOf = useCallback(
    (tcid: string) => String((lastQ.data ?? {})[tcid]?.result ?? ''),
    [lastQ.data],
  )

  /** 이슈키 → 붙은 TC. **한 번 만들어 두고 같은 배열을 계속 준다.**
   *  매 렌더마다 새 배열을 만들어 넘기면 memo 가 「달라졌다」 고 보고
   *  99줄을 다 다시 그린다 — memo 를 걸어 놓고 무의미해진다. */
  const tcMap = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const [vn, arr] of byVer)
      for (const it of arr) {
        /* 이미 겹쳐 저장된 자료가 있다 — **그릴 때도 하나로** 본다.
           고쳐 쓸 때 걷히지만, 그 전에도 두 줄로 보이면 안 된다. */
        const list = [...new Set((it.tcs ?? []).map(tcidOf).filter(Boolean))]
        if (list.length) m.set(`${vn}|${String(it.key ?? '')}`, list)
      }
    return m
  }, [byVer])

  /** 버전마다의 이슈 수·TC 수·마지막 Sync 를 **한 번만** 센다. */
  const stat = useMemo(() => {
    const m = new Map<string, { n: number; tc: number; at: string }>()
    for (const [vn, arr] of byVer) {
      const kept = arr.filter(keep)
      let tc = 0
      let at = ''
      for (const it of kept) tc += (tcMap.get(`${vn}|${String(it.key ?? '')}`) ?? EMPTY).length
      for (const it of arr) {
        const s = String(it.syncedAt ?? '')
        if (s > at) at = s
      }
      /* 이슈가 0건인 버전도 **언제 가져왔는지**는 보여야 한다 — 그 값이
         「가져오긴 했다」 를 말해 준다. 자국에만 남아 있다. */
      if (!at) {
        const mk = (store[`${proj}@@${vn}`] ?? {})[SYNC_MARK]
        at = String(mk?.syncedAt ?? '')
      }
      m.set(vn, { n: kept.length, tc, at })
    }
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byVer, fType, fStat, tcMap, store, proj])

  /** 2열이 그릴 것 — **고른 버전의 이슈만**. 필터(유형·상태)도 여기서 건다. */
  const curRows = useMemo(
    () => (selVer ? (byVer.get(selVer) ?? []).filter(keep) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selVer, byVer, fType, fStat],
  )
  const curStat = stat.get(selVer) ?? { n: 0, tc: 0, at: '' }

  /* 고른 버전이 사라졌거나(치웠거나 프로젝트를 바꿨거나) 아직 없으면 —
     맨 위 버전을 잡아 준다. 2열이 비어 있으면 「고장났다」 로 읽힌다. */
  useEffect(() => {
    const shown = tree.flatMap(([, list]) => list)
    if (selVer && shown.includes(selVer)) return
    setSelVer(shown[0] ?? '')
  }, [tree, selVer])

  useEffect(() => {
    if (selVer) prefSet('utop.rls.ver', selVer)
  }, [selVer])

  /** 이슈에 붙은 TC 를 고쳐 저장한다. 자료 모양은 옛 화면 그대로다 —
   *  `프로젝트@@버전` 안에 이슈키별 `{tcs:[…]}`. 읽은 것 **위에 얹어** 보낸다. */
  const saveTcs = useCallback(
    /** 붙은 시험을 고친다.
     *
     *  **고칠 것은 「어떻게 바꿀지」 지 「바꾼 결과」 가 아니다.** 예전엔
     *  화면이 들고 있던 목록(tcMap)에 더하거나 빼서 그 결과를 통째로
     *  보냈다. 그 목록은 방금 저장한 것이 아직 안 돌아온 낡은 사본일 수
     *  있어서 —
     *    · 같은 번호가 두 번 붙고(E61xx_T0085 가 둘)
     *    · 지운 것이 되살아났다(지적)
     *
     *  이제 **서버에서 갓 읽은 목록 위에서** 바꾼다. 겹친 번호도 그때
     *  함께 걷는다 — 이미 둘이 된 자료도 다음 손질에서 하나가 된다. */
    async (ver: string, key: string, edit: (cur: string[]) => string[]) => {
      const k = `${proj}@@${ver}`
      const cur = await readStore()
      const had = ((cur[k]?.[key]?.tcs ?? []) as Array<LinkTc | string>).map(tcidOf).filter(Boolean)
      const tcs = [...new Set(edit(had))]
      const next: Store = {
        ...cur,
        [k]: { ...(cur[k] ?? {}), [key]: { ...(cur[k]?.[key] ?? {}), key, tcs } },
      }
      await apiFetch('/api/release-summary', {
        method: 'POST',
        body: JSON.stringify({ releases: next }),
      })
      await qc.invalidateQueries({ queryKey: ['release-summary'] })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [proj, qc],
  )
  const openPick = useCallback((ver: string, key: string) => setAddTo({ ver, key }), [])
  /** **＋ TC 추가.** 이 이슈를 덮을 시험을 **새로 만들고**, 만든 그 자리에서
   *  시험 화면으로 넘어간다(지시: 「TC추가하면 이 화면이 나와야」).
   *
   *  만들어지는 것은 **보통 시험**이다(지시: 「가로 작업 해」) — 시험 항목
   *  목록에 다른 것들과 나란히 서고, 플랜에 담아 실행기로 돌릴 수 있고,
   *  그 결과가 이 화면의 PASS/FAIL 칸으로 그대로 돌아온다.
   *
   *  ID 는 서버가 매기고(모델그룹이 앞머리다), 제목은 이슈 제목으로,
   *  모델은 프로젝트에서 끌어온다. 물어볼 것이 없으니 창을 안 띄운다.
   *  모델을 못 끌어오는 프로젝트에서만 예전처럼 창이 뜬다. */
  /** **＋ TC 추가 — 늘 같은 창을 띄운다.**
   *
   *  REQ-Coverage 의 「＋ TC 생성」 과 **같은 창**(TcForm)이다. 만드는 길이
   *  둘이면 규칙도 둘이 된다 — 한쪽만 제목을 받고 한쪽은 안 받는 식으로.
   *
   *  창 없이 바로 만들던 때는 이름을 물을 자리가 없어 「P88-1857 검증 1」
   *  같은 것을 지어 붙였다. 시험 이름은 「무엇을 확인하는가」 라 사람이
   *  지어야 한다 — 요구사항 제목도 이슈 제목도 베끼지 않는다(지시). */
  const openNew = useCallback(
    (ver: string, key: string, summary: string) => setNewTo({ ver, key, summary }),
    [],
  )
  const openDetail = useCallback((key: string) => setDetail(key), [])
  const dropTc = useCallback(
    (ver: string, key: string, tcid: string) => {
      void saveTcs(ver, key, (had) => had.filter((x) => x !== tcid))
    },
    [saveTcs],
  )

  const err = projQ.data?.error || verQ.data?.error

  return (
    <div className="rls">
      {/* ── 위 줄 — **프로젝트와 버전까지만** 불러온다(지시).
             세부는 Sync 를 눌러야 오고, 온 것은 저장된다. ── */}
      <div className="panel rls-top">
        <b className="rls-h1">Releases</b>
        <select
          className="rls-sel"
          value={proj}
          onChange={(e) => {
            setProj(e.target.value)
            setVers([])
            setPrimed('')
          }}
          disabled={projQ.isLoading || upQ.isLoading}
          title="Jira 프로젝트"
        >
          <option value="">
            {projQ.isLoading || upQ.isLoading ? '불러오는 중…' : '(프로젝트 선택)'}
          </option>
          {allProjects.map((p) => (
            <option key={p.key} value={p.key}>
              {p.key} · {p.name}
            </option>
          ))}
        </select>
        {/* 버전은 **체크박스로 여러 개**(지시). 고르개 한 줄로는 상태·날짜·
            설명을 같이 낼 수 없어, 눌러서 펴는 판으로 낸다. */}
        <div className="rls-vpick">
          <button
            type="button"
            className="rls-sel ver"
            disabled={!proj || verQ.isLoading}
            onClick={() => setVerOpen((v) => !v)}
            title="Sync 할 버전 고르기"
          >
            {verQ.isLoading
              ? '버전 불러오는 중…'
              : vers.length
                ? `버전 ${vers.length}개 — ${vers.slice(0, 2).join(', ')}${vers.length > 2 ? ' 외' : ''}`
                : '(버전 선택)'}
            <i>⌄</i>
          </button>
          {verOpen && (
            <div className="rls-vlist">
              <div className="rls-vhead">
                <span className="c1">버전</span>
                <span className="c2">상태</span>
                <span className="c3">시작일</span>
                <span className="c4">배포일</span>
                <span className="c5">설명</span>
              </div>
              <div className="rls-vbody">
                {(verQ.data?.versions ?? [])
                  .filter((v) => !v.archived)
                  .map((v) => {
                    const vn = String(v.name ?? '')
                    const on = vers.includes(vn)
                    const have = savedVers.includes(vn)
                    return (
                      <label key={vn} className={`rls-vrowp${on ? ' on' : ''}`}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={(e) =>
                            setVers((a) => (e.target.checked ? [...a, vn] : a.filter((x) => x !== vn)))
                          }
                        />
                        <span className="c1" title={vn}>
                          {vn}
                          {have && <b className="rls-have" title="이미 가져와 둔 버전">저장됨</b>}
                        </span>
                        <span className="c2">
                          <i className={v.released ? 'rel' : 'unrel'}>
                            {v.released ? '배포됨' : '미배포'}
                          </i>
                        </span>
                        <span className="c3">{v.startDate || '–'}</span>
                        <span className="c4">{v.releaseDate || '–'}</span>
                        <span className="c5" title={v.description || ''}>
                          {v.description || ''}
                        </span>
                      </label>
                    )
                  })}
              </div>
              <div className="rls-vfoot">
                <span className="rls-cnt">{vers.length}개 고름</span>
                <span className="sp" />
                <button type="button" onClick={() => setVers([])}>
                  전부 지우기
                </button>
                <button type="button" onClick={() => setVerOpen(false)}>
                  닫기
                </button>
              </div>
            </div>
          )}
        </div>
        <button
          type="button"
          className="rls-sync"
          disabled={!proj || !vers.length || !!busy}
          title={
            !proj || !vers.length
              ? '프로젝트와 버전을 먼저 고르세요'
              : `고른 버전 ${vers.length}개의 이슈를 Jira 에서 가져와 저장합니다`
          }
          onClick={() => void syncVers(vers)}
        >
          {busy ? `가져오는 중… ${busy}` : '↻ Sync'}
        </button>
        {/* 거르개 셋을 위 줄로 올렸다(지시) — 줄 하나가 통째로 없어진다 */}
        <select className="rls-f" value={fOp} onChange={(e) => setFOp(e.target.value)}>
          <option value="">사업자 전체</option>
          {ops.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <select className="rls-f" value={fType} onChange={(e) => setFType(e.target.value)}>
          <option value="">이슈유형 전체</option>
          {opts.types.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <select className="rls-f" value={fStat} onChange={(e) => setFStat(e.target.value)}>
          <option value="">상태 전체</option>
          {opts.stats.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <span className="sp" />
        <span className="rls-kinds" title="이 세 가지만 가져옵니다">
          {KINDS.join(' · ')}
        </span>
      </div>

      {err && <div className="rls-err">Jira 를 읽지 못했습니다 — {err}</div>}

      {/* ── 2행 — **카드 두 장**(승인). 1열은 사업자 ▸ 버전, 2열은 고른
             버전의 이슈. 한 줄기 트리로 늘어놓던 것을 갈랐다 — 버전이
             다섯이고 이슈가 188건이면 한 줄기로는 어디를 보고 있는지
             잃는다. REQ-Coverage 와 같은 배치라 익힐 것이 하나로 준다. ── */}
      <div className="rls-split" ref={splitRef}>

        {/* 1열 — 사업자 ▸ 버전 */}
        <section className="panel rls-c1" style={{ flexBasis: w1 }}>
          <div className="rls-ch">
            사업자 · 버전
            <span className="n">버전 {savedVers.length}</span>
          </div>
          <div className="rls-cb">
            {!allProjects.length && !upQ.isLoading && !projQ.isLoading && (
              <div className="rls-none">
                이 프로젝트에 물린 Jira 프로젝트가 없습니다 — 프로젝트 설정의 「Jira 프로젝트」
                칸에서 물려 주세요.
              </div>
            )}
            {!!allProjects.length && !sumQ.isLoading && !savedVers.length && (
              <div className="rls-none">
                프로젝트와 버전을 고르고 <b>Sync</b> 를 누르면 그 버전의 이슈를 가져와{' '}
                <b>저장</b>합니다.
              </div>
            )}
            {sumQ.isLoading && <div className="rls-none">불러오는 중…</div>}
            {tree.map(([op, list]) => (
              <div key={op}>
                <button type="button" className="rls-op" onClick={() => toggleOp(op)}>
                  <span className={`rls-car${shut.has(op) ? '' : ' on'}`}>›</span>
                  <b>{op}</b>
                  <span className="n">{list.length}</span>
                </button>
                {!shut.has(op) && list.map((vn) => {
                  const v = verMeta.get(vn)
                  const st0 = stat.get(vn) ?? { n: 0, tc: 0, at: '' }
                  return (
                    <div
                      key={vn}
                      className={`rls-ver${selVer === vn ? ' on' : ''}`}
                      role="button"
                      tabIndex={0}
                      title={st0.at ? `마지막 Sync ${stamp(st0.at)}` : vn}
                      onClick={() => setSelVer(vn)}
                      onKeyDown={(e) => e.key === 'Enter' && setSelVer(vn)}
                    >
                      {/* **한 줄로**(지시). 이름이 남는 자리를 다 먹고, 그 뒤에
                          released 점·이슈/TC 수·단추가 붙는다. 자리가 빠듯해서
                          released 는 글자 대신 초록 점이다(가리키면 글자로 뜬다).
                          이름이 길어 잘리면 폭을 끌어 넓히면 된다 — 그 폭은
                          계정을 따라다닌다. */}
                      <span className="rls-vname" title={vn}>{vn}</span>
                      {v?.released && <i className="rls-rel" title="released" />}
                      {/* 이슈가 0건인 버전도 선다 — 「안 가져와졌다」 가 아니다 */}
                      {st0.n ? (
                        <span className="n">
                          이슈 {st0.n} · TC {st0.tc}
                        </span>
                      ) : (
                        <span className="rls-zero">이슈 0</span>
                      )}
                      <span className="rls-vbs">
                          <button
                            type="button"
                            className="rls-vb"
                            disabled={!!busy}
                            title={`${vn} 의 이슈만 Jira 에서 다시 가져옵니다`}
                            onClick={(e) => {
                              e.stopPropagation()
                              void syncVers([vn])
                            }}
                          >
                            ↻
                          </button>
                          <button
                            type="button"
                            className="rls-vb del"
                            disabled={!!busy}
                            title={`${vn} 을 이 화면에서 치웁니다`}
                            onClick={(e) => {
                              e.stopPropagation()
                              void dropVer(vn)
                            }}
                          >
                            ✕
                          </button>
                      </span>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </section>

        {/* 칸 사이 세로바 — REQ-Coverage 와 **같은 부품**(지시) */}
        <Resizer
          label="사업자·버전 칸 폭 조절"
          onResize={setW1}
          getOrigin={() => splitRef.current?.getBoundingClientRect().left ?? 0}
        />

        {/* 2열 — 고른 버전의 이슈 */}
        <section className="panel rls-c2">
          <div className="rls-ch">
            이슈
            <b className="rls-cv">{selVer || '—'}</b>
            <span className="n">
              {selVer ? `${curStat.n}건 · TC ${curStat.tc}` : '왼쪽에서 버전을 고르세요'}
            </span>
          </div>
          {/* **칸 이름줄**(지시: 「4번 필드 제목을 추가 해」). 줄마다 붙어
              있던 「보고자」·「담당자」 를 여기 한 번만 단다. 목록 밖에 두어
              굴려도 안 사라진다. */}
          {!!selVer && !!curRows.length && (
            <div className="rls-ihead">
              <span className="h-sync" />
              <span className="h-car" />
              <span className="h-key">이슈</span>
              <span className="h-tc">TC</span>
              <span className="h-title">제목</span>
              <span className="h-type">유형</span>
              <span className="h-stat">상태</span>
              <span className="h-per">보고자</span>
              <span className="h-per">담당자</span>
            </div>
          )}
          <div className="rls-cb">
            {!selVer ? (
              <div className="rls-none">왼쪽에서 버전을 고르면 그 버전의 이슈가 여기 섭니다.</div>
            ) : !curRows.length ? (
              <div className="rls-none">
                이 버전에 걸린 이슈가 없습니다.
                <br />
                <span className="rls-sm">
                  가져오기는 됐습니다 — {KINDS.join(' · ')} 가 한 건도 없는 빌드입니다.
                </span>
              </div>
            ) : (
              curRows.map((it) => (
                <IssueRow
                  key={`${selVer}|${String(it.key ?? '')}`}
                  it={it}
                  ver={selVer}
                  open={openIssue.has(`${selVer}|${String(it.key ?? '')}`)}
                  tcs={tcMap.get(`${selVer}|${String(it.key ?? '')}`) ?? EMPTY}
                  tcById={tcById}
                  resultOf={resultOf}
                  onToggle={toggleIssue}
                  onNew={openNew}
                  onOpenTc={setTcOpen}
                  openTc={tcOpen}
                  onPick={openPick}
                  onDrop={dropTc}
                  onDetail={openDetail}
                  onResync={syncIssue}
                  busy={!!busy}
                />
              ))
            )}
          </div>
        </section>
      </div>

      {/* **시험 팝업**(승인) — 칩을 누르면 시험 항목 화면을 통째로 얹는다.
          Info·Object·Topology·Traffic·Manual·Automation·Execution 이 그대로
          서고 스텝도 여기서 적는다. 편집기를 두 벌 만들면 한쪽은 반드시
          뒤처진다. */}
      {!!tcOpen && (
        <div
          className="rls-tcscrim"
          onMouseDown={(e) => {
            if (e.target !== e.currentTarget) return
            setTcOpen('')
            setTcApi(null)
          }}
        >
          <div className="rls-tcpop" role="dialog" aria-modal="true" aria-label={tcOpen}>
            <header className="rls-poph">
              {/* 자리 줄 — **세 화면이 같은 꼴**(지시).
                    E61xx / Release / TC1   [E61xx-V0001]
                  릴리스 시험은 폴더에 안 달린다. 그 자리는 이슈이고, 이슈는
                  바로 뒤 화면에 서 있다 — 그래서 폴더 칸이 비어 있다. */}
              <Crumb
                group={mine?.model_group ?? ''}
                screen="Release"
                name={tcById.get(tcOpen)?.name ?? ''}
                id={tcOpen}
              />
              <span className="sp" />
              {/* 저장·⋯ 는 **여기 한 곳**에서만 — 안쪽 줄은 감춘다 */}
              <button
                type="button"
                className={`tcx-save${tcApi?.dirty ? ' dirty' : ''}`}
                disabled={!tcApi?.dirty || !!tcApi?.saving}
                title={tcApi?.dirty ? '고친 값을 저장합니다' : '고친 것이 없습니다'}
                onClick={() => tcApi?.save()}
              >
                {tcApi?.saving ? '저장 중…' : tcApi?.dirty ? '저장' : '저장됨'}
              </button>
              {tcApi?.menu && <span className="tcx-more">{tcApi.menu}</span>}
              <button
                type="button"
                className="tcx-close"
                onClick={() => {
                  setTcOpen('')
                  setTcApi(null)
                }}
              >
                ✕ 닫기
              </button>
            </header>
            <div className="tcx-embed rls-popb">
              <TestCases
                embedTc={tcOpen}
                onEmbedBack={() => setTcOpen('')}
                onEmbedApi={setTcApi}
              />
            </div>
          </div>
        </div>
      )}

      {detail && (
        <IssueDrawer
          ikey={detail}
          base={jbase}
          onClose={() => setDetail('')}
        />
      )}

      {addTo && (
        <TcPick
          title={`${addTo.key} 에 이미 있는 시험 붙이기`}
          have={tcMap.get(`${addTo.ver}|${addTo.key}`) ?? EMPTY}
          /* **릴리스 시험(_V)만 고를 수 있다**(지시). 요구사항 시험(_T)이
             줄줄이 나오던 것을 걷었다 — 그것을 이슈에 붙이면 두 화면의
             분리가 그 자리에서 깨진다. */
          tcs={(tcQ.data?.tcs ?? []).filter((t) => isReleaseTc(t.tcid))}
          onClose={() => setAddTo(null)}
          onSave={async (next) => {
            /* 고르개는 「이것들로 해 줘」 라고 말한다 — 그대로 놓는다 */
            await saveTcs(addTo.ver, addTo.key, () => next)
            setAddTo(null)
          }}
          onDelete={async (tcid) => {
            const r = await apiFetch(`/api/tc/${encodeURIComponent(tcid)}`, { method: 'DELETE' })
            if (!r.ok) {
              window.alert(`${tcid} 를 지우지 못했습니다`)
              return
            }
            await qc.invalidateQueries({ queryKey: ['tcs'] })
            await qc.invalidateQueries({ queryKey: ['tc', 'list', 'meta'] })
          }}
        />
      )}

      {/* **＋ TC 추가.** 시험 항목 화면의 그 창을 그대로 부른다 — 편집기를
          두 벌 만들면 한쪽은 반드시 뒤처진다(모델 고정·커스텀 필드 규칙이
          거기 다 들어 있다). 만들고 나면 이슈에 붙이고 그 시험을 연다. */}
      {newTo && (
        <TcForm
          editing={null}
          /* 여기서도 이슈 제목을 그대로 넣지 않는다(위 openNew 와 같은 까닭) */
          /* 무엇을 덮는가 — 요구사항 자리에 Jira 이슈가 앉는다 */
          presetIssue={newTo.key}
          /* 제목은 **이 이슈 안에서 몇 번째인가**로 시작한다(지시: TC1).
             지라 제목을 통째로 베끼지 않는 까닭은 셋이다 — 길고(60자를 넘는다),
             지라에서 고쳐도 안 따라오고, 한 이슈에 시험이 셋이면 셋 다 이름이
             같아진다. 이슈 제목은 바로 위 줄에 이미 보인다. */
          presetName={`TC${(tcMap.get(`${newTo.ver}|${newTo.key}`) ?? EMPTY).length + 1}`}
          /* 모델은 프로젝트가 아는 값이라 미리 골라 둔다(고칠 수 있다) */
          presetMg={mine?.model_group ?? ''}
          presetModel={mine?.model ?? ''}
          onCreated={(tcid) => {
            /* 시험 목록도 다시 읽는다 — 안 그러면 방금 만든 것이 그 목록에
               없어서, 아래에 편 시험 화면이 「없는 시험」 으로 보고 목록으로
               되돌린다(TestCases 의 openId 확인). */
            void saveTcs(newTo.ver, newTo.key, (had) => [...had, tcid])
              .then(() =>
                Promise.all([
                  qc.invalidateQueries({ queryKey: ['tc-meta-rls'] }),
                  qc.invalidateQueries({ queryKey: ['tc', 'list', 'meta'] }),
                  qc.invalidateQueries({ queryKey: ['tcs'] }),
                ]),
              )
              /* 만들면 그 탭이 골라져 **바로 아래에 펼쳐진다**(지시) */
              .then(() => setTcOpen(tcid))
          }}
          onClose={() => setNewTo(null)}
        />
      )}
    </div>
  )
}

/** **Jira 세부 서랍**(지시).
 *
 *  이슈 키를 누르면 오른쪽에서 열린다. 설명·댓글은 Jira 가 렌더한 HTML
 *  (renderedFields)을 그대로 쓴다 — 표·코드블록·그림이 Jira 에서 보던
 *  모양 그대로 선다. 그림은 인증 프록시를 거친다(브라우저는 Jira 에
 *  로그인해 있지 않다).
 */
function IssueDrawer({ ikey, base, onClose }: { ikey: string; base: string; onClose: () => void }) {
  /** 크게 볼 그림 — 눌린 그림 하나. 빈 문자열이면 안 떠 있다.
   *  **맨 위에 둔다**: 아래의 Esc 처리가 이 값을 본다(그림 창이 떠 있으면
   *  서랍은 안 닫힌다). 선언보다 먼저 쓰면 화면이 통째로 안 뜬다. */
  const [lb, setLb] = useState('')
  const q = useQuery({
    queryKey: ['jira-issue', ikey],
    staleTime: 60_000,
    queryFn: async () => {
      const r = await apiFetch(`/api/jira/issue/${encodeURIComponent(ikey)}`)
      if (!r.ok) throw new Error('이슈 세부를 불러오지 못했습니다')
      return (await r.json()) as {
        ok?: boolean
        error?: string
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
    const id = Object.keys(names).find((k) => /traceab|추적/i.test(String(names[k] ?? '')))
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

              {/* ── **지라와 같은 차례**(지시): 자세히 · 설명 · Traceability ·
                     첨부 파일 · 이슈연결 · 활동. 우리 마음대로 늘어놓으면
                     Jira 를 보던 눈이 여기서 한 번 헤맨다. ── */}

              <h4 className="rls-dh">자세히</h4>
              <div className="rls-dmeta">
                {rows.map((r) => (
                  <div className="fld" key={r.id}>
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
                            <span className="fld">{String(it2.field ?? '')}</span>
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

/** 시험 항목 고르는 창 — 찾아서 체크하고 저장한다.
 *  이슈 하나가 여러 시험으로 덮이는 것이 보통이라 **여러 개**를 고른다. */
function TcPick({
  title,
  have,
  tcs,
  onClose,
  onSave,
  onDelete,
}: {
  title: string
  have: string[]
  tcs: Array<{ tcid: string; name?: string; kind?: string }>
  onClose: () => void
  onSave: (next: string[]) => Promise<void>
  /** 시험 항목 **자체**를 지운다 — 이슈에서 빼는 것과 다르다 */
  onDelete: (tcid: string) => Promise<void>
}) {
  const [pick, setPick] = useState<string[]>(have)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [dead, setDead] = useState<string[]>([])
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    const base = tcs.filter((t) => !dead.includes(t.tcid))
    const arr = n ? base.filter((t) => `${t.tcid} ${t.name ?? ''}`.toLowerCase().includes(n)) : base
    /* 이미 붙은 것을 위로 — 무엇이 붙어 있는지부터 보인다 */
    return [...arr].sort((a, b) => Number(have.includes(b.tcid)) - Number(have.includes(a.tcid)))
  }, [tcs, q, have, dead])

  return (
    <div className="rls-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rls-modal" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <b>{title}</b>
          <span className="sp" />
          <button type="button" onClick={onClose}>
            ✕
          </button>
        </header>
        <input
          className="rls-find"
          value={q}
          placeholder="ID · 제목으로 찾기"
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="rls-mlist">
          {shown.map((t) => {
            const on = pick.includes(t.tcid)
            return (
              <label key={t.tcid} className={`rls-mrow${on ? ' on' : ''}`}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) =>
                    setPick((a) =>
                      e.target.checked ? [...a, t.tcid] : a.filter((x) => x !== t.tcid),
                    )
                  }
                />
                <span className="rls-code">{t.tcid}</span>
                <span className="rls-name">{t.name ?? ''}</span>
                <span className="rls-kind">{isManual(t.kind) ? 'MANUAL' : t.kind ? 'AUTO' : ''}</span>
                {/* **시험 항목 자체를 지운다**(지시) — 이슈에서 빼는 것(칩의 ✕)과
                    다르다. 되돌릴 수 없어 한 번 묻는다. 이미 이슈에 붙어 있는
                    것은 못 지운다: 붙은 자리를 먼저 떼는 것이 순서다. */}
                <button
                  type="button"
                  className="rls-mdel"
                  disabled={busy || have.includes(t.tcid)}
                  title={
                    have.includes(t.tcid)
                      ? '이 이슈에 붙어 있습니다 — 먼저 빼고 지우세요'
                      : `${t.tcid} 를 아주 지웁니다`
                  }
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    if (!window.confirm(`${t.tcid} ${t.name ?? ''}\n\n이 시험 항목을 아주 지웁니다. 되돌릴 수 없습니다.`))
                      return
                    setBusy(true)
                    void onDelete(t.tcid)
                      .then(() => {
                        setDead((a) => [...a, t.tcid])
                        setPick((a) => a.filter((x) => x !== t.tcid))
                      })
                      .finally(() => setBusy(false))
                  }}
                >
                  ✕
                </button>
              </label>
            )
          })}
          {!shown.length && <div className="rls-none">찾는 시험 항목이 없습니다.</div>}
        </div>
        <footer>
          <span className="rls-cnt">{pick.length}건 고름</span>
          <span className="sp" />
          <button type="button" onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className="pri"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void onSave(pick).finally(() => setBusy(false))
            }}
          >
            {busy ? '저장 중…' : '저장'}
          </button>
        </footer>
      </div>
    </div>
  )
}
