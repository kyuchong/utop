/**
 * **Test Summary — 마크다운으로 쓰는 시험 결과 양식**(지시).
 *
 * 여태 결과 메일은 서버가 만든 한 가지 모양뿐이었고, 사람이 보탤 수 있는
 * 것은 노란 상자 한 줄(note)이 전부였다. 고객사마다 하고 싶은 말이 다른데
 * 그 자리가 없었다.
 *
 * 그래서 Wiki 와 같은 편집기로 **양식을 직접 쓴다.** 쓴 것은 플랜에 남고,
 * 그대로 메일 본문이 된다 — 화면이 marked 로 HTML 을 만들고 DOMPurify 로
 * 소독해 보낸다(서버에 마크다운 변환기를 새로 들이지 않는다. 서버도 제
 * 눈으로 한 번 더 거른다 — main.py 의 _mail_safe_html).
 *
 * 처음 열면 **초안을 만들어 준다.** 빈 편집기를 내밀면 사람은 무엇을 써야
 * 할지 몰라 그냥 닫는다 — 집계와 실패 목록은 이미 아는 것이니 채워 놓는다.
 */
import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/api/client'
import MarkdownEditor from '@/components/MarkdownEditor'
import Markdown from '@/components/Markdown'
import type { CycleMeta } from '@/pages/Cycles'
import './TestSummary.css'

/** 이 자리의 집계 — 부르는 쪽이 이미 세어 둔 것을 그대로 받는다 */
export interface SumStat {
  total: number
  pass: number
  fail: number
  etc: number
  none: number
  rate: number
}

/** 표에 실을 실패 항목 */
export interface SumFail {
  tcid: string
  title: string
  run: string
}

/** 마크다운 초안 — 이미 아는 것은 채워 놓는다 */
function draft(title: string, s: SumStat, fails: SumFail[], today: string): string {
  const rows = fails.length
    ? fails
        .slice(0, 30)
        .map((f) => `| ${f.tcid} | ${f.title || '—'} | ${f.run} |`)
        .join('\n')
    : '| — | 실패한 항목이 없습니다 | — |'
  const more = fails.length > 30 ? `\n\n> 실패 ${fails.length}건 중 30건만 적었습니다.` : ''
  return `## ${title} 시험 결과

**${today}** 기준

| 구분 | 건수 |
| --- | ---: |
| 전체 항목 | ${s.total} |
| 통과 | ${s.pass} |
| 실패 | ${s.fail} |
| 기타 | ${s.etc} |
| 미실행 | ${s.none} |
| **합격률** | **${s.rate}%** |

### 실패 항목

| ID | 시험 | 실행 |
| --- | --- | --- |
${rows}${more}

### 총평

<!-- 여기에 하고 싶은 말을 적으세요 -->

### 앞으로

- [ ]
`
}

export default function TestSummary({
  plan,
  title,
  stat,
  fails,
  statReady = true,
}: {
  /** 이 양식을 담아 둘 플랜. 없으면 쓰기만 하고 저장은 못 한다 */
  plan?: CycleMeta
  /** 초안 머리글 — 버전 이름 등 */
  title: string
  stat: SumStat
  fails: SumFail[]
  /** 집계·실패 목록이 **다 왔나.** 초안은 한 번만 만드는데, 아직 오는
      중에 만들면 「실패한 항목이 없습니다」 로 굳는다 — 실패가 두 건인데도. */
  statReady?: boolean
}) {
  const [md, setMd] = useState('')
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [view, setView] = useState<'edit' | 'read'>('edit')
  /** 이 플랜의 AI 총평 — 전문을 읽을 때 같이 꺼낸다(따로 부르지 않는다) */
  const [aiText, setAiText] = useState('')
  /** 저장한 뒤의 글 — 이것과 다르면 「저장 안 됨」 이다 */
  const saved = useRef('')

  const today = new Date().toISOString().slice(0, 10)

  /* 플랜이 바뀌면 그 플랜에 담긴 양식을 읽어 온다. 없으면 초안을 만든다.
     **전문을 읽는다** — 목록의 요약본에는 이 칸이 없다. */
  useEffect(() => {
    if (!statReady) return
    let live = true
    setReady(false)
    void (async () => {
      let text = ''
      if (plan?.id) {
        try {
          const r = await apiFetch(`/api/cycle/${encodeURIComponent(plan.id)}`)
          if (r.ok) {
            const j = (await r.json()) as {
              test_summary?: string
              ai_summary?: { text?: string }
            }
            text = String(j.test_summary ?? '')
            if (live) setAiText(String(j.ai_summary?.text ?? ''))
          }
        } catch {
          /* 못 읽으면 초안으로 시작한다 — 빈 화면보다 낫다 */
        }
      }
      if (!live) return
      const v = text || draft(title, stat, fails, today)
      setMd(v)
      saved.current = text
      setReady(true)
    })()
    return () => {
      live = false
    }
    // 집계는 자꾸 바뀐다 — 초안은 **처음 한 번**만 만든다. 사람이 고쳐 둔
    // 글을 집계가 바뀔 때마다 덮으면 쓰던 것이 사라진다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.id, statReady])

  const dirty = ready && md !== saved.current
  /* 여기서 만들던 메일 본문(HTML)은 함께 걷었다 — 「메일 보내기」 가 이 줄에서
     빠지며(지시) 쓰는 곳이 없어졌다. 결과 메일은 위 도구줄의 「📧 결과 메일」
     한 자리에서 낸다. */

  /** 저장 — **전문을 읽어 얹는다.** 요약본을 되쓰면 실행 결과가 지워진다 */
  async function save() {
    if (!plan?.id) return
    setBusy('save')
    setMsg('')
    try {
      const r = await apiFetch(`/api/cycle/${encodeURIComponent(plan.id)}`)
      if (!r.ok) throw new Error('플랜을 불러오지 못했습니다')
      const full = (await r.json()) as Record<string, unknown>
      const w = await apiFetch(`/api/cycle/${encodeURIComponent(plan.id)}`, {
        method: 'POST',
        body: JSON.stringify({ ...full, test_summary: md }),
      })
      if (!w.ok) throw new Error('저장하지 못했습니다')
      saved.current = md
      setMsg('저장했습니다.')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy('')
    }
  }

  if (!plan)
    return (
      <div className="cu-none" style={{ padding: 30 }}>
        플랜을 고르면 그 플랜의 결과 양식을 씁니다.
      </div>
    )

  return (
    <div className="tsm">
      <div className="tsm-bar">
        <div className="tsm-seg" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'edit'}
            className={view === 'edit' ? 'on' : ''}
            onClick={() => setView('edit')}
          >
            쓰기
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'read'}
            className={view === 'read' ? 'on' : ''}
            onClick={() => setView('read')}
          >
            미리보기
          </button>
        </div>
        <span className="tsm-sp" />
        {!!msg && <span className="tsm-msg">{msg}</span>}
        {dirty && <span className="tsm-dirty">저장 안 됨</span>}
        {!!aiText && (
          <button
            type="button"
            className="btn small"
            title="AI 총평을 「총평」 자리에 넣습니다"
            onClick={() => setMd((v) => `${v.replace(/<!-- 여기에 하고 싶은 말을 적으세요 -->/, '')}\n${aiText}\n`)}
          >
            AI 총평 넣기
          </button>
        )}
        <button type="button" className="btn small" disabled={!!busy} onClick={() => void save()}>
          {busy === 'save' ? '저장 중…' : '저장'}
        </button>
      </div>

      <div className="tsm-body">
        {!ready ? (
          <div className="cu-none">불러오는 중…</div>
        ) : view === 'edit' ? (
          <MarkdownEditor value={md} onChange={setMd} placeholder="시험 결과 양식을 적으세요" />
        ) : (
          <div className="tsm-read">
            <Markdown text={md} empty="아직 쓴 것이 없습니다." />
          </div>
        )}
      </div>
    </div>
  )
}
