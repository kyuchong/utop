import { useEffect, useState } from 'react'
import { apiFetch } from '@/api/client'
import './jiraStatus.css'

/**
 * **지라 이슈의 지금 상태** — 결함 표의 「상태」 칸이 이것을 보여 준다(지시).
 *
 * UTOP 이 아는 값(미등록·등록함)만 적던 때는, 개발자가 지라에서 「해결됨」
 * 으로 옮겨도 표는 여태 「등록함」 이라 적고 있었다. 표를 보고 남은 일을
 * 가릴 수가 없다.
 *
 * 열쇠를 모아 **한 번에** 묻는다(서버가 JQL `key in (…)` 로 한 번에 받는다).
 * 스무 줄짜리 표에 스무 번 왕복하면 표가 늦게 뜬다.
 */
export interface JiraStat {
  name: string
  /** 지라의 갈래 — new · indeterminate · done. 칩 색은 이름이 아니라 이걸로 고른다 */
  cat: string
}

export function useJiraStatus(keys: string[]): Record<string, JiraStat> {
  const [map, setMap] = useState<Record<string, JiraStat>>({})
  /* 열쇠 목록을 **글자로 굳혀** 견준다 — 배열은 내용이 같아도 늘 새 값이라,
     그대로 의존성에 넣으면 그릴 때마다 다시 묻는다. */
  const sig = [...new Set(keys.filter(Boolean))].sort().join(',')
  useEffect(() => {
    if (!sig) {
      setMap({})
      return
    }
    let dead = false
    void (async () => {
      try {
        const r = await apiFetch(`/api/defects/jira-status?keys=${encodeURIComponent(sig)}`)
        const j = (await r.json()) as { statuses?: Record<string, JiraStat> }
        if (!dead) setMap(j.statuses ?? {})
      } catch {
        /* 지라가 안 닿아도 표는 떠야 한다 — 상태만 옛 표기로 남는다 */
      }
    })()
    return () => {
      dead = true
    }
  }, [sig])
  return map
}

/** 상태 칩 하나 — 지라 상태가 있으면 그것을, 없으면 등록 여부를 말한다 */
export function JiraStatusChip({
  jiraKey,
  stat,
  closed,
}: {
  jiraKey?: string
  stat?: JiraStat
  closed?: boolean
}): React.ReactElement {
  /* 지라에서 지워진 이슈 — 열쇠만 보여 주면 「아직 안 왔나」 로 읽힌다 */
  if (jiraKey && stat && !stat.name && stat.cat === 'gone') {
    return (
      <span className="jst jst-gone" title={`${jiraKey} — 지라에 없습니다(지워졌을 수 있습니다)`}>
        지라에 없음
      </span>
    )
  }
  if (jiraKey && stat?.name) {
    const cat = stat.cat === 'done' ? 'done' : stat.cat === 'indeterminate' ? 'doing' : 'new'
    return (
      <span className={`jst jst-${cat}`} title={`지라 상태 · ${jiraKey}`}>
        {stat.name}
      </span>
    )
  }
  /* 지라에 있는데 상태를 아직 못 받았다 — 「미등록」 이라 적으면 거짓말이
     되므로, 열쇠를 보여 주고 상태가 오면 그때 바뀐다. */
  if (jiraKey) return <span className="jst jst-wait" title="지라 상태를 읽는 중">{jiraKey}</span>
  return <span className={`jst ${closed ? 'jst-closed' : 'jst-none'}`}>{closed ? '닫힘' : '미등록'}</span>
}

/** 표에 적을 **상태 글자** — 칩과 같은 말을 쓴다(정렬·거르기가 이 값을 본다) */
export function jiraStatusText(
  d: { jira_key?: string | null; status?: string | null },
  map: Record<string, JiraStat>,
): string {
  const jk = String(d.jira_key ?? '')
  if (jk && map[jk]?.name) return map[jk]!.name
  if (jk && map[jk]?.cat === 'gone') return '지라에 없음'
  if (jk) return jk /* 상태가 아직 안 왔다 — 「미등록」 이라 적으면 거짓이 된다 */
  return String(d.status ?? '') === 'closed' ? '닫힘' : '미등록'
}

/** 지라 주소 — 표의 이슈 열쇠를 누르면 이리로 간다(지시: 바로 확인) */
let _jiraBase: string | null = null
export function useJiraBase(): string {
  const [base, setBase] = useState(_jiraBase ?? '')
  useEffect(() => {
    if (_jiraBase !== null) return
    let dead = false
    void (async () => {
      try {
        const r = await apiFetch('/api/jira/base')
        const j = (await r.json()) as { url?: string }
        _jiraBase = String(j.url ?? '')
      } catch {
        _jiraBase = ''
      }
      if (!dead) setBase(_jiraBase ?? '')
    })()
    return () => {
      dead = true
    }
  }, [])
  return base
}

/** 이슈 한 건으로 가는 길 — 주소를 아직 모르면 빈 글자 */
export const jiraIssueUrl = (base: string, key: string): string =>
  base && key ? `${base}/browse/${encodeURIComponent(key)}` : ''
