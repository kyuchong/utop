import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import type { TestCaseMeta } from '@/types'

interface Props {
  /** 이미 있는 버전그룹 — `{ 모델명: [그룹…] }` */
  folders: Record<string, string[]>
  /** 처음 고를 값 (트리에서 열었을 때) */
  preset?: { model?: string; versionGroup?: string }
  onClose: () => void
  onDone: (cycleId: string, msg: string) => void
}

interface CatItem {
  kind: string
  name: string
  model_group?: string | null
}

/**
 * 사이클 만들기.
 *
 * 모델은 **장비 카탈로그에서 고른다.** 옛 화면은 자유 입력이라
 * `E4320-24P_2` 같은 것이 생겼고, 사이클이 쓰는 모델 7종 중 5종이
 * 카탈로그에 아예 없다. 고르게 하면 이런 것이 안 생긴다.
 *
 * 버전그룹은 이미 있는 것에서 고르거나 새로 만든다. R200·R300 은
 * 카탈로그가 알 수 없는, 이 회차 묶음의 이름이라 사람이 정해야 한다.
 *
 * 버전명은 자유 입력이다 — `R300_20260630` 처럼 매번 다르다.
 */
export default function CycleNew({ folders, preset, onClose, onDone }: Props) {
  const [model, setModel] = useState(preset?.model ?? '')
  const [vgroup, setVgroup] = useState(preset?.versionGroup ?? '')
  const [newVgroup, setNewVgroup] = useState('')
  const [version, setVersion] = useState('')
  const [assignee, setAssignee] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose, busy])

  const catQ = useQuery({
    queryKey: ['device-catalog'],
    queryFn: async () => {
      const r = await apiFetch('/api/device-catalog2')
      if (!r.ok) throw new Error('장비 카탈로그를 불러오지 못했습니다')
      return (await r.json()) as { items: CatItem[] }
    },
    staleTime: 60_000,
  })

  const tcQ = useQuery({
    queryKey: ['tcs'],
    queryFn: async () => {
      const r = await apiFetch('/api/tc?meta=1')
      if (!r.ok) throw new Error('시험 목록을 불러오지 못했습니다')
      return (await r.json()) as { tcs: TestCaseMeta[] }
    },
  })

  const models = useMemo(
    () => (catQ.data?.items ?? []).filter((x) => x.kind === 'model'),
    [catQ.data],
  )
  const groups = folders[model] ?? []
  const tcs = useMemo(() => {
    const n = q.trim().toLowerCase()
    const all = tcQ.data?.tcs ?? []
    if (!n) return all
    return all.filter((t) =>
      `${t.name ?? ''} ${t.tcid}`.toLowerCase().includes(n),
    )
  }, [tcQ.data, q])

  const vg = (newVgroup.trim() || vgroup).trim()
  const ready = !!model && !!version.trim() && picked.size > 0

  const save = async () => {
    setBusy(true)
    setErr('')
    try {
      // 새 버전그룹이면 폴더 목록에 먼저 넣는다. 사이클을 만들다 그만둬도
      // 그룹은 남아야 다음에 고를 수 있다.
      if (newVgroup.trim()) {
        const next = { ...folders, [model]: [...new Set([...(folders[model] ?? []), vg])] }
        await apiFetch('/api/cycle-version-groups', {
          method: 'POST',
          body: JSON.stringify({ groups: next }),
        })
      }

      const id = `cycle-${Date.now()}`
      const all = tcQ.data?.tcs ?? []
      const items = [...picked].map((tcid) => {
        const t = all.find((x) => x.tcid === tcid)
        return {
          tcid,
          name: t?.name ?? '',
          req_id: t?.req_id ?? '',
          severity: t?.severity ?? '',
          priority: '',
          assignee: assignee.trim(),
          steps: [],
        }
      })
      const body = {
        id,
        model,
        version_group: vg,
        version: version.trim(),
        assignee: assignee.trim(),
        created_at: new Date().toISOString().slice(0, 10),
        items,
      }
      const r = await apiFetch(`/api/cycle/${encodeURIComponent(id)}`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || '만들지 못했습니다')
      onDone(id, `${model} ${version.trim()} · 시험 ${items.length}건`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  return (
    <div className="modal-back" onMouseDown={() => !busy && onClose()}>
      <div
        className="modal cn"
        role="dialog"
        aria-modal="true"
        aria-label="사이클 만들기"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <b>사이클 만들기</b>
          <span className="sp" />
          <button className="btn small" type="button" disabled={busy} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="cn-form">
          <label>
            모델
            <select
              value={model}
              onChange={(e) => {
                setModel(e.target.value)
                setVgroup('')
              }}
            >
              <option value="">고르세요</option>
              {models.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name}
                  {m.model_group ? ` · ${m.model_group}` : ''}
                </option>
              ))}
            </select>
            {/* 카탈로그에 없으면 여기서 못 고른다. 자유 입력을 열어 두면
                오타가 그대로 트리 한 줄이 된다. */}
            <i className="cn-hint">장비 카탈로그에 등록된 모델만</i>
          </label>

          <label>
            버전그룹
            <select
              value={vgroup}
              disabled={!model || !!newVgroup.trim()}
              onChange={(e) => setVgroup(e.target.value)}
            >
              <option value="">(없음)</option>
              {groups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <input
              value={newVgroup}
              placeholder="새로 만들기 — R300"
              onChange={(e) => setNewVgroup(e.target.value)}
            />
          </label>

          <label>
            버전
            <input
              className="mono"
              value={version}
              placeholder="R300_20260630"
              onChange={(e) => setVersion(e.target.value)}
            />
          </label>

          <label>
            담당 <span className="muted small">(선택)</span>
            <input value={assignee} onChange={(e) => setAssignee(e.target.value)} />
          </label>
        </div>

        <div className="cn-pick">
          <div className="cn-pickhead">
            <b>시험 항목 {picked.size}건</b>
            <input
              className="cn-q"
              value={q}
              placeholder="이름 · ID 로 찾기"
              onChange={(e) => setQ(e.target.value)}
            />
            <button
              className="btn small"
              type="button"
              onClick={() => setPicked(new Set(tcs.map((t) => t.tcid)))}
            >
              보이는 것 전부
            </button>
            <button className="btn small" type="button" onClick={() => setPicked(new Set())}>
              해제
            </button>
          </div>
          <div className="cn-list">
            {tcQ.isLoading ? (
              <div className="empty">불러오는 중…</div>
            ) : (
              tcs.map((t) => (
                <label className="cn-row" key={t.tcid}>
                  <input
                    type="checkbox"
                    checked={picked.has(t.tcid)}
                    onChange={() => toggle(t.tcid)}
                  />
                  <span className="cn-nm">{t.name || '(제목 없음)'}</span>
                  <span className="muted small">{t.tcid}</span>
                </label>
              ))
            )}
          </div>
        </div>

        <div className="modal-foot">
          {err && <span className="muted small err">{err}</span>}
          <span className="sp" />
          <button className="btn" type="button" disabled={busy} onClick={onClose}>
            취소
          </button>
          <button
            className="btn primary"
            type="button"
            disabled={!ready || busy}
            onClick={() => void save()}
          >
            {busy ? '만드는 중…' : '만들기'}
          </button>
        </div>
      </div>
    </div>
  )
}
