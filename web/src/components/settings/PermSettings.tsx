/**
 * 페이지별 접근 권한 — **모듈 × 권리 격자**.
 *
 * 참고한 것은 QMetry(모듈 × 권리) · TestRail(역할 = 권한 묶음) ·
 * Zephyr Scale(맨 위 켬/끔)이다. 자세한 것은 `lib/perm.ts` 머리에 적어 두었다.
 *
 * 켬/끔이 맨 위에 있는 까닭: 표를 다 채우기 전에 켜면 그 순간 아무도
 * 아무것도 못 한다. 꺼진 채로 들어와서, 다 채운 뒤 사람이 켠다.
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import {
  PERM_GROUPS,
  RIGHTS,
  RIGHT_LABEL,
  type PermDoc,
  type PermRole,
  type Right,
} from '@/lib/perm'
import './PermSettings.css'

export default function PermSettings() {
  const qc = useQueryClient()
  const [note, setNote] = useState('')

  const q = useQuery({
    queryKey: ['permissions'],
    queryFn: async () => {
      const r = await apiFetch('/api/permissions')
      if (!r.ok) throw new Error('권한을 불러오지 못했습니다')
      return (await r.json()) as PermDoc
    },
  })

  const saveM = useMutation({
    mutationFn: async (patch: Partial<PermDoc>) => {
      const r = await apiFetch('/api/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const b = (await r.json().catch(() => ({}))) as { detail?: string }
      if (!r.ok) throw new Error(b.detail || '저장하지 못했습니다')
    },
    onSuccess: () => {
      setNote('저장했습니다')
      void qc.invalidateQueries({ queryKey: ['permissions'] })
    },
    onError: (e) => setNote(e instanceof Error ? e.message : String(e)),
  })

  const doc = q.data
  const roles: PermRole[] = doc?.roles ?? []
  const grid = doc?.grid ?? {}
  /** 관리자는 격자에서 뺀다 — 늘 전부다. 칸을 두면 끌 수 있어 보인다 */
  const cols = roles.filter((r) => r.key !== 'admin')

  const has = (mod: string, role: string, right: Right) =>
    (grid[mod]?.[role] ?? []).includes(right)

  const toggle = (mod: string, role: string, right: Right) => {
    if (!doc) return
    const cur = new Set(grid[mod]?.[role] ?? [])
    if (cur.has(right)) cur.delete(right)
    else {
      cur.add(right)
      // 보기 없이 고칠 수는 없다 — 안 보이는 것을 고치게 두면 화면이 거짓말을 한다
      if (right !== 'view') cur.add('view')
    }
    // 보기를 끄면 나머지도 함께 꺼진다
    const next = cur.has('view') ? [...cur] : []
    saveM.mutate({ grid: { ...grid, [mod]: { ...(grid[mod] ?? {}), [role]: next as Right[] } } })
  }

  /** 한 역할에게 그 모듈을 통째로 주거나 뺀다 — 칸을 여섯 번 누르지 않게 */
  const toggleAll = (mod: string, role: string, rights: Right[]) => {
    if (!doc) return
    const full = rights.every((x) => has(mod, role, x))
    saveM.mutate({
      grid: { ...grid, [mod]: { ...(grid[mod] ?? {}), [role]: full ? [] : rights } },
    })
  }

  const addRole = () => {
    const label = window.prompt('새 역할 이름 (예: 검증팀장)')?.trim()
    if (!label || !doc) return
    let key = `r${roles.length + 1}`
    for (let n = roles.length + 1; roles.some((r) => r.key === key); n++) key = `r${n + 1}`
    saveM.mutate({ roles: [...roles, { key, label, jira: [] }] })
  }

  const renameRole = (r: PermRole) => {
    const label = window.prompt('역할 이름', r.label)?.trim()
    if (!label || !doc) return
    saveM.mutate({ roles: roles.map((x) => (x.key === r.key ? { ...x, label } : x)) })
  }

  const setJira = (r: PermRole) => {
    const v = window.prompt(
      `${r.label} 에 해당하는 Jira 그룹·역할 (쉼표로 여럿)\n계정 연동이 정리되면 여기 적은 것이 정본이 됩니다.`,
      (r.jira ?? []).join(', '),
    )
    if (v === null || !doc) return
    const jira = v.split(',').map((x) => x.trim()).filter(Boolean)
    saveM.mutate({ roles: roles.map((x) => (x.key === r.key ? { ...x, jira } : x)) })
  }

  const dropRole = (r: PermRole) => {
    if (!doc || r.builtin) return
    if (!window.confirm(`역할 '${r.label}' 을 지울까요? 이 역할로 준 권한도 함께 사라집니다.`)) return
    saveM.mutate({ roles: roles.filter((x) => x.key !== r.key) })
  }

  return (
    <div className="set-page wide">
      <div className="set-head">
        <div>
          <h3>페이지별 접근 권한</h3>
          <p className="muted small">
            모듈마다 어느 역할이 무엇을 할 수 있는지 정합니다. <b>보기</b>가 없으면 그 메뉴·탭은
            아예 안 보입니다 — 보임 표를 따로 두지 않습니다.
          </p>
        </div>
      </div>

      {note && <div className="set-note ok">{note}</div>}
      {q.error && <div className="set-note err">{String(q.error)}</div>}

      {/* 맨 위 켬/끔 — 표를 다 채우기 전에 켜면 아무도 아무것도 못 한다 */}
      <section className="set-card pm-onoff">
        <label className="pm-sw">
          <input
            type="checkbox"
            checked={!!doc?.enabled}
            disabled={!doc}
            onChange={(e) => {
              if (
                e.target.checked &&
                !window.confirm(
                  '권한 체계를 켭니다.\n지금 표에 없는 것은 그 순간부터 막힙니다 — 표를 다 채우셨습니까?',
                )
              )
                return
              saveM.mutate({ enabled: e.target.checked })
            }}
          />
          <b>권한 체계 사용</b>
        </label>
        <span className="muted small">
          {doc?.enabled
            ? '켜져 있습니다 — 아래 표대로 막습니다.'
            : '꺼져 있습니다 — 지금은 모두가 모든 것을 할 수 있습니다. 표를 다 채운 뒤 켜세요.'}
        </span>
      </section>

      {/* 역할 — 이름을 바꾸고 새로 만들 수 있다(TestRail 방식) */}
      <section className="set-card">
        <div className="set-card-head">
          <b>역할</b>
          <span className="muted small">
            관리자는 늘 전부 할 수 있어 표에 없습니다 — 잠긴 방에 열쇠를 두고 나올 수는 없습니다
          </span>
          <span className="sp" />
          <button className="btn small" type="button" onClick={addRole}>
            + 역할
          </button>
        </div>
        <div className="pm-roles">
          {roles.map((r) => (
            <span key={r.key} className={`pm-role${r.key === 'admin' ? ' fixed' : ''}`}>
              <b>{r.label}</b>
              {/* Jira 가 정본이 될 자리 — 연동이 정리되면 여기서 받아 온다(지시) */}
              <i
                className={`pm-jira${(r.jira ?? []).length ? ' on' : ''}`}
                title="계정 연동이 정리되면 이 Jira 그룹·역할이 정본이 됩니다"
                onClick={() => setJira(r)}
              >
                {(r.jira ?? []).length ? `Jira: ${(r.jira ?? []).join(' · ')}` : 'Jira 연결 안 됨'}
              </i>
              {r.key !== 'admin' && (
                <>
                  <button className="btn small" type="button" onClick={() => renameRole(r)}>
                    이름
                  </button>
                  {!r.builtin && (
                    <button className="btn small danger" type="button" onClick={() => dropRole(r)}>
                      삭제
                    </button>
                  )}
                </>
              )}
            </span>
          ))}
        </div>
      </section>

      {/* 격자 — 모듈이 행, 역할×권리가 열 */}
      {PERM_GROUPS.map((g) => (
        <section className="set-card" key={g.title}>
          <div className="set-card-head">
            <b>{g.title}</b>
          </div>
          <div className="pm-grid-wrap">
            <table className="pm-grid">
              <thead>
                <tr>
                  <th className="pm-mod">모듈</th>
                  {cols.map((r) => (
                    <th key={r.key} colSpan={RIGHTS.length}>
                      {r.label}
                    </th>
                  ))}
                </tr>
                <tr className="pm-sub">
                  <th />
                  {cols.map((r) =>
                    RIGHTS.map((x) => (
                      <th key={`${r.key}-${x}`} title={RIGHT_LABEL[x]}>
                        {RIGHT_LABEL[x].slice(0, 2)}
                      </th>
                    )),
                  )}
                </tr>
              </thead>
              <tbody>
                {g.items.map((m) => (
                  <tr key={m.k} className={m.under ? 'pm-child' : ''}>
                    <td className="pm-mod">
                      <b>{m.label}</b>
                      {m.hint && <i className="muted">{m.hint}</i>}
                    </td>
                    {cols.map((r) =>
                      RIGHTS.map((x) => {
                        const open = m.rights.includes(x)
                        return (
                          <td key={`${m.k}-${r.key}-${x}`} className={open ? '' : 'pm-na'}>
                            {open ? (
                              <input
                                type="checkbox"
                                checked={has(m.k, r.key, x)}
                                title={`${m.label} — ${r.label} — ${RIGHT_LABEL[x]}`}
                                onChange={() => toggle(m.k, r.key, x)}
                              />
                            ) : (
                              <span className="pm-dash">–</span>
                            )}
                          </td>
                        )
                      }),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pm-quick">
            {g.items.map((m) => (
              <span key={m.k}>
                <i>{m.label}</i>
                {cols.map((r) => (
                  <button
                    key={r.key}
                    className="btn small"
                    type="button"
                    title={`${r.label} 에게 ${m.label} 전부 주거나 뺍니다`}
                    onClick={() => toggleAll(m.k, r.key, m.rights)}
                  >
                    {r.label} 전부
                  </button>
                ))}
              </span>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
