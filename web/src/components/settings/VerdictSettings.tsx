import { ColorPick } from './ColorPick'
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'

/**
 * 실행 판정 기준 — 플랜 실행에서 고르는 판정값(Pass·Fail·…)을 여기서 정한다.
 *
 * 값은 `/api/codes` 의 `kind='cycle_result'` 한 곳에 산다. 색과 계열은 그 줄의
 * `note` 에 JSON(`{color, group}`)으로 담는다. **기본 여섯**(Pass·Fail·WIP·
 * Blocked·진행불가·미실행)은 판정 규칙이 코드로 물고 있어 지울 수 없다 —
 * 대신 **색은 바꿀 수 있다**(같은 값으로 한 줄을 저장하면 덮어쓴다).
 *
 * 계열(group)은 집계가 쓴다: pass 는 합격으로, fail 은 실패로 센다.
 * 그 밖(neutral)은 「그 밖」 으로만 세어 합격률에 안 들어간다.
 */
interface Item {
  kind: string
  value: string
  sort_order?: number
  note?: string | null
  used?: number
}

type Grp = 'pass' | 'fail' | 'neutral'

/** 기본 여섯 — Cycles 화면의 RESULTS 와 같은 벌이다 */
const BASE: Array<{ v: string; label: string; color: string; fg: string; group: Grp }> = [
  { v: 'Pass', label: 'Pass', color: '#16a34a', fg: '#0a7a45', group: 'pass' },
  { v: 'Fail', label: 'Fail', color: '#dc2626', fg: '#c22222', group: 'fail' },
  { v: 'WIP', label: 'WIP', color: '#f0b429', fg: '#a16207', group: 'neutral' },
  { v: 'Blocked', label: 'Blocked', color: '#e8820c', fg: '#b45309', group: 'neutral' },
  { v: '진행불가', label: '진행불가', color: '#8b93a1', fg: '#64748b', group: 'neutral' },
  { v: '', label: '미실행', color: '#c3cad4', fg: '#64748b', group: 'neutral' },
]

/** 기본 판정의 뜻 — 사람이 적어 두지 않았을 때 자리에 비쳐 보인다 */
const BASE_DESC: Record<string, string> = {
  Pass: '기준대로 동작함',
  Fail: '기준과 다름 — 결함을 답니다',
  WIP: '보는 중 · 판정 전',
  Blocked: '앞단이 막혀 시험을 못 함 (검증 불가)',
  진행불가: '이 회차에서는 시험할 수 없음 (검증 불가)',
  '': '아직 안 돌림',
}

/**
 * 집계 계열 — 판정을 **셋으로만** 나눈다(지시).
 *
 * 「그 밖」 은 셈에서 뺀다는 말일 뿐 무엇인지는 말해 주지 않았다. Blocked·
 * 진행불가는 **시험을 못 한 사유**고, 미실행·WIP 도 결국 「아직 검증되지
 * 않음」 이다 — 합격도 실패도 아닌 것은 한 이름으로 부른다.
 */
const GRP_LB: Record<Grp, string> = {
  pass: 'Pass — 합격으로 셈',
  fail: 'Fail — 실패로 셈',
  neutral: '검증 불가 — 합격률에서 뺌',
}

function metaOf(it?: Item): { color?: string; fg?: string; desc?: string; label?: string; group?: Grp } {
  if (!it) return {}
  try {
    const m = JSON.parse(it.note || '{}') as {
      color?: string
      fg?: string
      desc?: string
      label?: string
      group?: string
    }
    const g = m.group === 'pass' || m.group === 'fail' ? m.group : 'neutral'
    return { color: m.color, fg: m.fg, desc: m.desc, label: m.label, group: g }
  } catch {
    return {}
  }
}

/** 고르기 쉬운 한 벌 — 바탕과 글자를 짝으로 묶어 둔다(지적: 색 고르기가
    어렵다). 색동그라미 하나만 누르면 두 색이 같이 정해진다. */
export default function VerdictSettings() {
  const qc = useQueryClient()
  const [draft, setDraft] = useState('')
  const [dColor, setDColor] = useState('#7c4dff')
  const [dFg, setDFg] = useState('#5b21b6')
  const [dGroup, setDGroup] = useState<Grp>('neutral')
  const [msg, setMsg] = useState<{ k: string; t: string }>({ k: '', t: '' })

  const listQ = useQuery({
    queryKey: ['codes'],
    queryFn: async () => {
      const r = await apiFetch('/api/codes')
      if (!r.ok) throw new Error('불러오지 못했습니다')
      return (await r.json()) as { items: Item[] }
    },
  })

  const rows = useMemo(
    () => (listQ.data?.items ?? []).filter((i) => i.kind === 'cycle_result'),
    [listQ.data],
  )
  const byVal = useMemo(() => new Map(rows.map((r) => [r.value, r])), [rows])

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['codes'] })
    void qc.invalidateQueries({ queryKey: ['cycle'] })
  }

  const save = useMutation({
    mutationFn: async (p: {
      value: string
      color?: string
      fg?: string
      desc?: string
      /** 화면에 보일 글자 — 값(value)은 판정 규칙이 물고 있어 못 바꾸고,
          보이는 글자만 바꾼다(지시: Pass 를 PASS 로) */
      label?: string
      group?: Grp
      sort?: number
    }) => {
      const r = await apiFetch('/api/codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'cycle_result',
          value: p.value,
          sort_order: p.sort ?? byVal.get(p.value)?.sort_order ?? 0,
          note: JSON.stringify({
          color: p.color,
          fg: p.fg,
          desc: p.desc,
          label: p.label || undefined,
          group: p.group ?? 'neutral',
        }),
        }),
      })
      const b = (await r.json().catch(() => ({}))) as { detail?: string }
      if (!r.ok) throw new Error(b.detail || '저장하지 못했습니다')
    },
    onSuccess: () => {
      setMsg({ k: 'ok', t: '저장했습니다' })
      invalidate()
    },
    onError: (e: unknown) => setMsg({ k: 'err', t: e instanceof Error ? e.message : String(e) }),
  })

  const del = useMutation({
    mutationFn: async (value: string) => {
      const r = await apiFetch(`/api/codes/cycle_result/${encodeURIComponent(value)}`, {
        method: 'DELETE',
      })
      if (!r.ok) throw new Error('지우지 못했습니다')
    },
    onSuccess: () => {
      setMsg({ k: 'ok', t: '지웠습니다' })
      invalidate()
    },
    onError: (e: unknown) => setMsg({ k: 'err', t: e instanceof Error ? e.message : String(e) }),
  })

  /** 사람이 더한 값 — 기본 여섯이 아닌 것 */
  const extra = rows.filter((r) => !BASE.some((b) => b.v === r.value))

  return (
    <div className="set-page vd">
      <h2>실행 판정 기준</h2>
      <p className="muted">
        플랜 실행에서 고르는 판정값입니다. <b>기본 여섯</b>은 판정 규칙이 물고 있어 지울 수
        없지만 <b>색은 바꿀 수 있습니다</b>. 새 기준을 더하면 판정 드롭다운·집계에 함께 섭니다.
        <br />
        집계는 <b>Pass · Fail · 검증 불가</b> 셋뿐입니다 — Blocked·진행불가는 시험을 못 한
        사유고, 미실행·WIP 도 아직 검증되지 않은 것이라 모두 <b>검증 불가</b>로 셉니다.
      </p>
      {msg.t && <div className={`set-msg ${msg.k}`}>{msg.t}</div>}

      {/* ── 기본 여섯 ─────────────────────────────────────────── */}
      <section className="panel vd-card">
        <h3>기본 판정</h3>
        <table className="vd-tbl">
          <thead>
            <tr>
              <th className="w-c">색</th>
              <th className="w-c">글자색</th>
              <th className="w-v">적용값</th>
              <th className="w-g">집계 계열</th>
              <th>설명</th>
              <th className="r" />
            </tr>
          </thead>
          <tbody>
            {BASE.map((b) => {
              const m = metaOf(byVal.get(b.v))
              const color = m.color || b.color
              const fg = m.fg || b.fg
              const label = m.label || b.label
              return (
                <tr key={b.v || '_none'}>
                  <td>
                    <ColorPick
                      title="바탕색"
                      value={color}
                      onPick={(c) => save.mutate({ value: b.v, color: c, fg, group: b.group, label: m.label, desc: m.desc })}
                    />
                  </td>
                  <td>
                    <ColorPick
                      title="글자색"
                      value={fg}
                      onPick={(f) => save.mutate({ value: b.v, color, fg: f, group: b.group, label: m.label, desc: m.desc })}
                    />
                  </td>
                  <td className="vd-fillcell">
                    {/* Monday 꼴(지시) — 딱지가 아니라 **셀을 색으로 가득**.
                        그 셀이 곧 고치는 칸이다: 눌러서 글자를 바꾼다 */}
                    <input
                      className="vd-fill vd-chip-in"
                      defaultValue={label}
                      style={{ background: color, color: fg, borderColor: color }}
                      onBlur={(e) => {
                        const nv = e.target.value.trim()
                        if (nv && nv !== label)
                          save.mutate({ value: b.v, color, fg, group: b.group, label: nv, desc: m.desc })
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                      }}
                    />
                  </td>
                  <td className="muted">{GRP_LB[b.group]}</td>
                  <td>
                    <input
                      className="vd-desc"
                      defaultValue={m.desc ?? ''}
                      placeholder={BASE_DESC[b.v] ?? '이 판정을 언제 쓰는지 적어 둡니다'}
                      onBlur={(e) => {
                        const t = e.target.value.trim()
                        if (t === (m.desc ?? '')) return
                        save.mutate({ value: b.v, color, fg, desc: t, group: b.group, label: m.label })
                      }}
                    />
                  </td>
                  <td className="r">
                    {(m.color || m.fg || m.desc) && (
                      <button
                        className="btn small"
                        type="button"
                        title="바꾼 색을 되돌립니다"
                        onClick={() => del.mutate(b.v)}
                      >
                        색 되돌리기
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      {/* ── 더한 판정 ─────────────────────────────────────────── */}
      <section className="panel vd-card">
        <h3>
          더한 판정 <span className="muted">({extra.length})</span>
        </h3>
        {extra.length === 0 ? (
          <p className="muted">아직 없습니다. 아래에서 더하세요.</p>
        ) : (
          <table className="vd-tbl">
            <thead>
              <tr>
                <th className="w-c">색</th>
                <th className="w-c">글자색</th>
                <th className="w-v">적용값</th>
                <th className="w-g">집계 계열</th>
                <th>설명</th>
                <th className="r">차례</th>
                <th className="r" />
              </tr>
            </thead>
            <tbody>
              {extra.map((it, i) => {
                const m = metaOf(it)
                const color = m.color || '#7c4dff'
                const fg = m.fg || '#5b21b6'
                const grp = m.group ?? 'neutral'
                return (
                  <tr key={it.value}>
                    <td>
                      <ColorPick
                        title="바탕색"
                        value={color}
                        onPick={(c) => save.mutate({ value: it.value, color: c, fg, group: grp })}
                      />
                    </td>
                    <td>
                      <ColorPick
                        title="글자색"
                        value={fg}
                        onPick={(f) => save.mutate({ value: it.value, color, fg: f, group: grp })}
                      />
                    </td>
                    <td className="vd-fillcell">
                      {/* 더한 판정도 같은 꼴 — 셀을 색으로 가득(지시) */}
                      <i className="vd-fill" style={{ background: color, color: fg }}>
                        {it.value}
                      </i>
                    </td>
                    <td>
                      <select
                        value={grp}
                        onChange={(e) =>
                          save.mutate({
                            value: it.value,
                            color,
                            fg,
                            desc: m.desc,
                            group: e.target.value as Grp,
                          })
                        }
                      >
                        {(['pass', 'fail', 'neutral'] as Grp[]).map((g) => (
                          <option key={g} value={g}>
                            {GRP_LB[g]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        className="vd-desc"
                        defaultValue={m.desc ?? ''}
                        placeholder="이 판정을 언제 쓰는지 적어 둡니다"
                        onBlur={(e) => {
                          const t = e.target.value.trim()
                          if (t === (m.desc ?? '')) return
                          save.mutate({ value: it.value, color, fg, desc: t, group: grp })
                        }}
                      />
                    </td>
                    <td className="r">
                      <button
                        className="btn small"
                        type="button"
                        disabled={i === 0}
                        title="위로"
                        onClick={() =>
                          save.mutate({
                            value: it.value,
                            color,
                            fg,
                            group: grp,
                            sort: (it.sort_order ?? 0) - 1,
                          })
                        }
                      >
                        ▲
                      </button>{' '}
                      <button
                        className="btn small"
                        type="button"
                        disabled={i === extra.length - 1}
                        title="아래로"
                        onClick={() =>
                          save.mutate({
                            value: it.value,
                            color,
                            fg,
                            group: grp,
                            sort: (it.sort_order ?? 0) + 1,
                          })
                        }
                      >
                        ▼
                      </button>
                    </td>
                    <td className="r">
                      <button
                        className="btn small danger"
                        type="button"
                        title={
                          it.used
                            ? `${it.used}건이 이 판정을 쓰고 있습니다`
                            : '이 판정을 지웁니다'
                        }
                        onClick={() => {
                          if (
                            it.used &&
                            !confirm(`${it.used}건이 이 판정을 쓰고 있습니다. 그래도 지울까요?`)
                          )
                            return
                          del.mutate(it.value)
                        }}
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* ── 더하기 ────────────────────────────────────────────── */}
      <section className="panel vd-card">
        <h3>판정 더하기</h3>
        <div className="vd-add">
          <input
            value={draft}
            placeholder="값 (화면에 그대로 보입니다 — 예: 조건부 합격)"
            onChange={(e) => setDraft(e.target.value)}
          />
          <label className="vd-lb">바탕</label>
          <ColorPick title="바탕색" value={dColor} onPick={setDColor} />
          <label className="vd-lb">글자</label>
          <ColorPick title="글자색" value={dFg} onPick={setDFg} />
          <i
            className="vd-chip"
            style={{ background: dColor, color: dFg, borderColor: dColor }}
          >
            {draft.trim() || '미리 보기'}
          </i>
          <select value={dGroup} onChange={(e) => setDGroup(e.target.value as Grp)}>
            {(['pass', 'fail', 'neutral'] as Grp[]).map((g) => (
              <option key={g} value={g}>
                {GRP_LB[g]}
              </option>
            ))}
          </select>
          <button
            className="btn primary"
            type="button"
            disabled={!draft.trim() || save.isPending}
            onClick={() => {
              const v = draft.trim()
              if (!v) return
              if (BASE.some((b) => b.v === v) || byVal.has(v)) {
                setMsg({ k: 'err', t: '이미 있는 값입니다' })
                return
              }
              save.mutate({ value: v, color: dColor, fg: dFg, group: dGroup, sort: extra.length + 1 })
              setDraft('')
            }}
          >
            추가
          </button>
        </div>
        <p className="muted small">
          집계 계열이 <b>합격/실패</b> 면 합격률에 들어갑니다. 「그 밖」 은 진척에만 셉니다.
        </p>
      </section>
    </div>
  )
}
