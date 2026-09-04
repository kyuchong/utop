import { apiFetch } from '@/api/client'

/**
 * 화면 설정(보기) — **계정을 따라다닌다**(지시: PC 는 안 따라가게).
 *
 * 서버(user_pref)가 정본이고, localStorage 는 읽기 빠른 거울일 뿐이다.
 * 아래 SYNC 목록에 든 키만 서버로 올라간다 — 항해 상태(마지막 폴더·연
 * 문서 같은 것)는 지금처럼 그 PC 에만 남는다.
 *
 * 검증에서 잡힌 함정들의 방비:
 *  · 공용 PC 계정 전환 — 거울에 주인(utop.pref.owner)을 적어 두고, 주인이
 *    다르면 옛 거울을 지우고 이사(seed)도 안 한다(앞사람 값이 뒷사람
 *    계정에 심기는 오염 차단). 이사는 서버에 내 것이 하나도 없을 때 한 번만.
 *  · 로그아웃 — resetPrefs() 로 메모리·대기열을 비운다(App 이 부른다).
 *  · 새로고침·탭닫기 유실 — pagehide/visibilitychange 에서 keepalive 로 즉시 발사.
 *  · hydrate 전에 쓴 값(딥링크) — 대기열을 서버 값 위에 다시 얹는다.
 */
const SYNC = new Set([
  // 열 보이기·정렬·묶기
  'utop.reqtc.infocols', 'utop.reqtc.listsort', 'utop.reqtc.fsort', 'utop.reqtc.treereqs',
  'utop.req.foldersort',
  'utop.tc.infocols', 'utop.tc.listsort', 'utop.tc.listOpen',
  'utop.cycle.infocols', 'utop.cycle.itcols', 'utop.cycle.colorder', 'utop.cycle.grp',
  'utop.cycle.listsort', 'utop.cycle.execHide',
  // 화면 배치·탭·모드
  'utop.dash.widgets2', 'utop.dev.layout', 'utop.dev.lab', 'utop.set.sec',
  'utop.jirapanel.tab', 'utop.jira.tab', 'utop.ai.mode', 'utop.ai.exhide', 'utop.ai.theme',
  'utop.nav.dock',
  // 담당 고르개 최근
  'utop.ass.recent',
  // 끌어 맞춘 판·칸 폭(Resizer)
  'rqtcSideW', 'tcLogW', 'utop.ai.seqw', 'utop.cycle.execSideW', 'utop.tc.listW', 'utop.tc.seqW2',
  'utop.rls.w1',
])
/* 열쇠가 미리 안 정해지는 것들 — 표의 열마다 폭·숨김 열쇠가 생긴다.
   SYNC 는 정확히 맞는 열쇠만 봐서 utop.ntb.* 가 서버로 못 갔다(검증). */
const SYNC_PRE = ['utop.ntb.']
const isSync = (k: string) => SYNC.has(k) || SYNC_PRE.some((p) => k.startsWith(p))
/** 이 PC 거울에 있는 동기화 대상 열쇠 전부 — 접두어 것까지 */
const mirrorKeys = (): string[] => {
  const out = [...SYNC]
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && SYNC_PRE.some((p) => k.startsWith(p))) out.push(k)
  }
  return out
}

const OWNER = 'utop.pref.owner'

let mem = new Map<string, string>()
let ready = false
let pending = new Map<string, string | null>()
let timer: number | undefined

const flush = () => {
  if (!pending.size) return
  const values = Object.fromEntries(pending)
  pending = new Map()
  /* keepalive — 탭이 닫히는 중에도 나간다(검증: 디바운스 유실) */
  void apiFetch('/api/prefs', {
    method: 'POST',
    body: JSON.stringify({ values }),
    keepalive: true,
  })
}
export const flushPrefs = flush
window.addEventListener('pagehide', () => {
  window.clearTimeout(timer)
  flush()
})
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    window.clearTimeout(timer)
    flush()
  }
})
const queue = (k: string, v: string | null) => {
  pending.set(k, v)
  window.clearTimeout(timer)
  timer = window.setTimeout(flush, 800)
}

/** 로그아웃 때 — 앞사람 것이 한 조각도 안 남게(검증: 계정 전환 오염) */
export function resetPrefs(): void {
  mem = new Map()
  pending = new Map()
  window.clearTimeout(timer)
  ready = false
}

/** 로그인 직후 한 번 — 서버 값으로 거울을 채운다. 실패해도 화면은 선다. */
export async function hydratePrefs(username: string): Promise<void> {
  try {
    const r = await apiFetch('/api/prefs')
    if (!r.ok) throw new Error(String(r.status))
    const j = (await r.json()) as {
      mine?: Record<string, unknown>
      team?: Record<string, unknown>
    }
    const asStr = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v))
    /* 주인이 다른 PC 거울은 못 믿는다 — 지우고, 이사도 안 한다 */
    const prev = localStorage.getItem(OWNER)
    const sameOwner = prev === null || prev === username
    if (!sameOwner) for (const k of mirrorKeys()) {
      try { localStorage.removeItem(k) } catch { /* 사생활 보호 모드 */ }
    }
    mem = new Map()
    for (const [k, v] of Object.entries(j.team ?? {})) if (isSync(k)) mem.set(k, asStr(v))
    for (const [k, v] of Object.entries(j.mine ?? {})) if (isSync(k)) mem.set(k, asStr(v))
    /* 이사 — 내 것이 서버에 하나도 없고, 이 PC 거울이 내 것일 때 한 번만 */
    const seed: Record<string, string> = {}
    if (sameOwner && Object.keys(j.mine ?? {}).length === 0) {
      for (const k of mirrorKeys()) {
        const lv = localStorage.getItem(k)
        if (lv !== null) {
          mem.set(k, lv)
          seed[k] = lv
        }
      }
    }
    /* hydrate 전에 이 세션이 쓴 값(딥링크 등)이 서버 값에 안 덮이게 */
    for (const [k, v] of pending) {
      if (v === null) mem.delete(k)
      else mem.set(k, v)
    }
    for (const [k, v] of mem) {
      try { localStorage.setItem(k, v) } catch { /* 사생활 보호 모드 */ }
    }
    try { localStorage.setItem(OWNER, username) } catch { /* 사생활 보호 모드 */ }
    if (Object.keys(seed).length)
      void apiFetch('/api/prefs', { method: 'POST', body: JSON.stringify({ values: seed }) })
  } catch {
    /* 서버가 안 주면 localStorage 폴백으로 그대로 간다 */
  }
  ready = true
}

/** localStorage.getItem 대용 — 동기 키는 서버 값이 이긴다 */
export const prefGet = (k: string): string | null =>
  ready && mem.has(k) ? (mem.get(k) ?? null) : localStorage.getItem(k)

/** localStorage.setItem 대용 — 동기 키면 서버에도(0.8초 모아서) */
export function prefSet(k: string, v: string): void {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* 사생활 보호 모드 */
  }
  if (!isSync(k)) return
  mem.set(k, v)
  queue(k, v)
}

/** localStorage.removeItem 대용 — 동기 키면 서버에서도 지운다 */
export function prefRemove(k: string): void {
  try {
    localStorage.removeItem(k)
  } catch {
    /* 사생활 보호 모드 */
  }
  if (!isSync(k)) return
  mem.delete(k)
  queue(k, null)
}
