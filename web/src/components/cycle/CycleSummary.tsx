import { useMemo, useState } from 'react'
import { apiFetch } from '@/api/client'
import { itemVerdict, type CycleItemLite, type CycleMeta } from '@/pages/Cycles'
import './CycleSummary.css'

/**
 * 사이클 결과 요약 카드 — 표에서 사이클을 고르면 표 **위**에 선다(승인 목업).
 *
 * 조사(16개 툴)에서 가져온 것:
 *   도넛(Qase) · 세그먼트 진행바(Xray·Testiny) · 날짜별 누적 트렌드(TestRail)
 *   · 오른쪽에 「이 사이클로 하는 일」 단추 셋.
 *
 * 집계는 표(CycleBoard.stats)와 **같은 잣대**를 쓴다 — itemVerdict + 설정
 * 코드표의 group. 여기서 다른 규칙으로 세면 표의 숫자와 카드의 숫자가
 * 어긋나, 어느 쪽이 맞느냐는 질문부터 받게 된다.
 */
interface Props {
  cycle: CycleMeta
  /** 판정 → 계열('pass'|'fail'|…) — 설정 「실행 판정 기준」 이 정본 */
  groupOf: (v: string) => string
  /** 제품군 — 사이클엔 없고 카탈로그가 안다 */
  family: string
  mgroup: string
  onEdit: () => void
  onOpen: () => void
  onReport: () => void
  onClose: () => void
}

/** 도넛 조각 하나 — SVG 원호. conic-gradient 는 조각 클릭을 못 나눈다 */
function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const p = (a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)]
  const [x0, y0] = p(a0)
  const [x1, y1] = p(a1)
  const big = a1 - a0 > Math.PI ? 1 : 0
  return `M ${x0} ${y0} A ${r} ${r} 0 ${big} 1 ${x1} ${y1}`
}

export default function CycleSummary({
  cycle,
  groupOf,
  family,
  mgroup,
  onEdit,
  onOpen,
  onReport,
  onClose,
}: Props) {
  const items = useMemo(() => cycle.items ?? [], [cycle.items])

  /* ── 집계 — 표와 같은 잣대 ── */
  const t = useMemo(() => {
    let pass = 0
    let fail = 0
    let other = 0
    let iss = 0
    const who = new Set<string>()
    for (const it of items) {
      const v = itemVerdict(it as CycleItemLite)
      const g = v ? groupOf(v) : 'none'
      if (g === 'pass') pass += 1
      else if (g === 'fail') fail += 1
      else if (v) other += 1
      iss += it.issues?.length ?? 0
      const a = String(it.assignee ?? '').trim()
      if (a) who.add(a)
    }
    const total = items.length
    const done = pass + fail + other
    return { total, done, pass, fail, other, none: total - done, iss, who: who.size }
  }, [items, groupOf])

  /* ── 날짜별 누적 Pass/Fail — TestRail 트렌드 방식 ──
     원천은 항목의 executed_at. 옛 자료엔 드문드문이라, 날이 2개 미만이면
     선 대신 「아직 쌓이는 중」 이라고 말한다 — 점 하나로 선을 그으면
     그래프가 거짓말처럼 보인다. */
  const trend = useMemo(() => {
    const byDay = new Map<string, { p: number; f: number }>()
    for (const it of items) {
      const d = String(it.executed_at ?? '').slice(0, 10)
      if (!d) continue
      const v = itemVerdict(it as CycleItemLite)
      const g = v ? groupOf(v) : ''
      if (g !== 'pass' && g !== 'fail') continue
      const cur = byDay.get(d) ?? { p: 0, f: 0 }
      if (g === 'pass') cur.p += 1
      else cur.f += 1
      byDay.set(d, cur)
    }
    const days = [...byDay.keys()].sort()
    let cp = 0
    let cf = 0
    return days.map((d) => {
      const v = byDay.get(d) as { p: number; f: number }
      cp += v.p
      cf += v.f
      return { d, p: cp, f: cf }
    })
  }, [items, groupOf])

  const donut = useMemo(() => {
    const segs = [
      { k: 'pass', n: t.pass, cls: 'p' },
      { k: 'fail', n: t.fail, cls: 'f' },
      { k: 'other', n: t.other, cls: 'o' },
      { k: 'none', n: t.none, cls: 'n' },
    ].filter((s) => s.n > 0)
    const sum = segs.reduce((a, s) => a + s.n, 0) || 1
    let a = -Math.PI / 2
    return segs.map((s) => {
      const a1 = a + (s.n / sum) * Math.PI * 2
      /* 조각이 100%면 원호가 제자리로 돌아와 안 그려진다 — 살짝 덜 돈다 */
      const d = arc(60, 60, 46, a, Math.min(a1, a + Math.PI * 2 - 0.0001))
      a = a1
      return { ...s, d }
    })
  }, [t])

  const rate = t.done ? Math.round((t.pass / t.done) * 100) : 0
  const dday = useMemo(() => {
    const e = String(cycle.end_date ?? '').slice(0, 10)
    if (!e) return ''
    const diff = Math.ceil((new Date(e).getTime() - Date.now()) / 86400000)
    return diff >= 0 ? `D-${diff}` : `+${-diff}일`
  }, [cycle.end_date])

  /* ── 결과 메일 ── */
  const [mail, setMail] = useState(false)

  const period = [cycle.start_date, cycle.end_date]
    .map((v) => String(v ?? '').slice(5, 10).replace('-', '/'))
    .filter(Boolean)
    .join(' ~ ')

  return (
    <section className="panel cyl">
      <div className="cyl-col cyl-donutcol">
        <h3>결과 요약</h3>
        <div className="cyl-donutbox">
          <svg viewBox="0 0 120 120" className="cyl-donut" aria-hidden="true">
            {donut.map((s) => (
              <path key={s.k} className={s.cls} d={s.d} />
            ))}
            <text x="60" y="57" textAnchor="middle" className="cyl-dpct">
              {rate}%
            </text>
            <text x="60" y="73" textAnchor="middle" className="cyl-dlab">
              PASS
            </text>
          </svg>
          <div className="cyl-legend">
            <div><i className="p" />Pass <b>{t.pass}</b></div>
            <div><i className="f" />Fail <b>{t.fail}</b></div>
            {t.other > 0 && <div><i className="o" />기타 <b>{t.other}</b></div>}
            <div><i className="n" />미실행 <b>{t.none}</b></div>
          </div>
        </div>
      </div>

      <div className="cyl-col cyl-mid">
        <h3>
          진행 — <b>{cycle.cid || cycle.id}</b> · {cycle.name || '(이름 없음)'}
        </h3>
        <div className="cyl-segbar" aria-hidden="true">
          <i className="p" style={{ flexGrow: t.pass }} />
          <i className="f" style={{ flexGrow: t.fail }} />
          <i className="o" style={{ flexGrow: t.other }} />
          <i className="n" style={{ flexGrow: t.none }} />
        </div>
        <div className="cyl-segtxt">
          {t.total}개 항목 중 {t.done} 실행 ({t.total ? Math.round((t.done / t.total) * 100) : 0}
          %) · 남은 {t.none}
        </div>
        <div className="cyl-kv">
          <div><b>{t.total}</b><span>전체 항목</span></div>
          <div><b className={t.iss ? 'bad' : ''}>{t.iss}</b><span>이슈 등록</span></div>
          <div><b>{t.who}</b><span>담당자</span></div>
          <div><b>{dday || '–'}</b><span>{dday ? `종료 ${String(cycle.end_date ?? '').slice(5, 10)}` : '기간 없음'}</span></div>
        </div>
        {trend.length >= 2 ? (
          <svg
            className="cyl-trend"
            viewBox="0 0 400 56"
            preserveAspectRatio="none"
            aria-label="날짜별 누적 Pass/Fail"
          >
            {(() => {
              const max = Math.max(...trend.map((x) => Math.max(x.p, x.f)), 1)
              const X = (i: number) => (i / (trend.length - 1)) * 396 + 2
              const Y = (v: number) => 52 - (v / max) * 44
              const line = (get: (x: { p: number; f: number }) => number) =>
                trend.map((x, i) => `${X(i)},${Y(get(x))}`).join(' ')
              return (
                <>
                  <polyline className="p" points={line((x) => x.p)} />
                  <polyline className="f" points={line((x) => x.f)} />
                </>
              )
            })()}
          </svg>
        ) : (
          <div className="cyl-notrend">날짜별 트렌드 — 실행 시각이 2일 이상 쌓이면 그려집니다</div>
        )}
      </div>

      <div className="cyl-col cyl-side">
        <div className="cyl-sidehead">
          <h3>이 사이클로 하는 일</h3>
          <button type="button" className="cyl-x" title="요약 닫기" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="cyl-meta">
          사업자 <b>{cycle.customer || '–'}</b>
          {family ? <> · 제품군 <b>{family}</b></> : null}
          <br />
          모델그룹 <b>{mgroup || '–'}</b> · 모델 <b>{cycle.model || '–'}</b>
          <br />
          버전그룹 <b>{cycle.version_group || '–'}</b> · 버전 <b>{cycle.version || '–'}</b>
          <br />
          기간 <b>{period || '–'}</b> · 담당 <b>{cycle.assignee || '–'}</b>
        </div>
        <div className="cyl-btns">
          <button type="button" className="btn" onClick={onEdit}>
            ＋ 시험 항목 넣기 / 빼기
          </button>
          <button type="button" className="btn cyl-teal" onClick={() => setMail(true)}>
            📧 결과 메일 발송
          </button>
          <button type="button" className="btn" onClick={onReport}>
            📄 고객사 결과서
          </button>
          <button type="button" className="btn" onClick={onOpen}>
            ▶ 실행 화면 열기
          </button>
        </div>
      </div>

      {mail && <CycleMailOne cycle={cycle} onClose={() => setMail(false)} />}
    </section>
  )
}

/**
 * 결과 메일 창 — 미리보기를 **먼저** 보인다. 남에게 나가는 것은 보낸 뒤에
 * 무를 수 없으므로, 무엇이 나가는지 보고 누르게 한다.
 */
function CycleMailOne({ cycle, onClose }: { cycle: CycleMeta; onClose: () => void }) {
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null)

  const loadPreview = async () => {
    try {
      const r = await apiFetch(
        `/api/cycle/${encodeURIComponent(cycle.id)}/mail-preview?note=${encodeURIComponent(note)}`,
      )
      const j = (await r.json()) as { subject?: string; html?: string; detail?: string }
      if (!r.ok) throw new Error(j.detail || '미리보기를 만들지 못했습니다')
      setPreview({ subject: j.subject ?? '', html: j.html ?? '' })
      if (!subject) setSubject(j.subject ?? '')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    }
  }

  const send = async () => {
    setBusy(true)
    setMsg('')
    try {
      const r = await apiFetch(`/api/cycle/${encodeURIComponent(cycle.id)}/mail`, {
        method: 'POST',
        body: JSON.stringify({ to, subject, note }),
      })
      const j = (await r.json()) as { success?: boolean; to?: string[]; detail?: string }
      if (!r.ok || !j.success) throw new Error(j.detail || '보내지 못했습니다')
      setMsg(`보냈습니다 — ${(j.to ?? []).join(', ')}`)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div className="modal cyl-mail" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <b>결과 메일 — {cycle.name || cycle.cid}</b>
          <button className="modal-x" type="button" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>
        <div className="modal-body">
          <label className="fld">
            <span>받는 사람 (콤마로 여럿)</span>
            <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="a@co.kr, b@co.kr" autoFocus />
          </label>
          <label className="fld">
            <span>제목 (비우면 자동)</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <label className="fld">
            <span>덧붙이는 말 (맨 위에 실림)</span>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <button type="button" className="btn" onClick={() => void loadPreview()}>
            미리보기
          </button>
          {preview && (
            <iframe
              className="cyl-mailprev"
              title="메일 미리보기"
              sandbox=""
              srcDoc={preview.html}
            />
          )}
          {msg && <div className="cyl-mailmsg">{msg}</div>}
        </div>
        <div className="modal-foot">
          <span className="muted small">보낸 메일은 무를 수 없습니다 — 미리보기로 확인하세요.</span>
          <span className="sa-sp" />
          <button className="btn" type="button" onClick={onClose}>
            닫기
          </button>
          <button
            className="btn cyl-teal"
            type="button"
            disabled={busy || !to.trim()}
            onClick={() => void send()}
          >
            {busy ? '보내는 중…' : '보내기'}
          </button>
        </div>
      </div>
    </div>
  )
}
