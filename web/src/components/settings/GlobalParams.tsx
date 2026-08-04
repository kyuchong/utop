import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import type { Device } from '@/pages/Devices'

/** 파라미터 한 줄. 옛 화면(07-global-params.js)이 쓰는 모양 그대로다. */
interface Row {
  group?: string
  name?: string
  value?: string
  desc?: string
}

type File = Record<string, unknown>

/** 파일 이름. 공통은 키가 `__global__` 이라 그대로 보이면 안 된다. */
const label = (k: string) => (k === GLOBAL ? '공통 (모든 모델)' : k)

/** 공통 값이 들어가는 키. 옛 화면과 같은 이름을 써야 서로 읽는다. */
const GLOBAL = '__global__'
/** 옛 화면의 폴더 목록. 여기서는 안 건드리고 그대로 넘긴다 */
const FOLDERS = '__gp_folders__'

/**
 * 전역 파라미터.
 *
 * iTest 의 parameter file(.ffpt)에 해당한다. 스텝에 `${포트}` 라고 적어 두면
 * 실행할 때 여기 값이 들어간다 — 같은 시험을 E6100 과 E5724RL 에서 돌릴 때
 * 포트 이름이나 슬롯 번호가 다른 것을 여기서 흡수한다.
 *
 * **공통(`__global__`)에 적어 두고 모델에서 예외만 덮는다.** 그것이 이
 * 파일을 쓰는 이유다 — 모델마다 전부 적으면 파일이 그냥 목록이 된다.
 *
 * 자료 모양은 옛 화면과 같다. 한쪽에서 고친 것이 다른 쪽에서 안 보이면
 * 어느 것이 맞는지 알 수 없게 된다.
 */
interface Props {
  /**
   * 이 파일 하나만 편집한다.
   *
   * TC 화면의 트리에서 파일을 골라 들어오는 길이다 — 목록은 트리가 이미
   * 보여주고 있으므로 여기서 또 보이면 같은 목록이 두 군데가 된다.
   */
  only?: string
}

export default function GlobalParams({ only }: Props) {
  const qc = useQueryClient()
  const [sel, setSel] = useState(only ?? GLOBAL)
  const [data, setData] = useState<File>({})
  const [dirty, setDirty] = useState(false)
  const [msg, setMsg] = useState('')

  const q = useQuery({
    queryKey: ['global-params'],
    queryFn: async () => {
      const r = await apiFetch('/api/global-params')
      if (!r.ok) throw new Error('불러오지 못했습니다')
      return (await r.json()) as File
    },
  })

  const devQ = useQuery({
    queryKey: ['devices2'],
    queryFn: async () => {
      const r = await apiFetch('/api/devices2')
      if (!r.ok) throw new Error('장비를 불러오지 못했습니다')
      return (await r.json()) as { devices?: Device[] }
    },
    staleTime: 60_000,
  })

  useEffect(() => {
    if (only) setSel(only)
  }, [only])

  useEffect(() => {
    if (q.data) {
      setData(q.data)
      setDirty(false)
    }
  }, [q.data])

  const saveM = useMutation({
    mutationFn: async () => {
      const r = await apiFetch('/api/global-params', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!r.ok) throw new Error('저장하지 못했습니다')
    },
    onSuccess: () => {
      setDirty(false)
      setMsg('저장했습니다')
      void qc.invalidateQueries({ queryKey: ['global-params'] })
    },
    onError: (e) => setMsg(e instanceof Error ? e.message : String(e)),
  })

  /** 값이 든 모델만. 옛 화면의 폴더 키는 목록에 안 낸다. */
  const models = useMemo(
    () => Object.keys(data).filter((k) => k !== GLOBAL && k !== FOLDERS).sort(),
    [data],
  )

  /** 등록된 장비의 모델 — 아직 파라미터가 없는 것도 고를 수 있어야 한다 */
  const known = useMemo(() => {
    const s = new Set<string>()
    for (const d of devQ.data?.devices ?? []) if (d.model) s.add(d.model)
    return [...s].sort().filter((m) => !models.includes(m))
  }, [devQ.data, models])

  const rows = (k: string): Row[] => (Array.isArray(data[k]) ? (data[k] as Row[]) : [])
  const cur = rows(sel)

  const setRows = (next: Row[]) => {
    setData((d) => ({ ...d, [sel]: next }))
    setDirty(true)
    setMsg('')
  }

  const setCell = (i: number, key: keyof Row, v: string) =>
    setRows(cur.map((r, j) => (j === i ? { ...r, [key]: v } : r)))

  const add = () => setRows([...cur, { group: '', name: '', value: '', desc: '' }])
  const del = (i: number) => setRows(cur.filter((_, j) => j !== i))

  const addModel = (m: string) => {
    if (!m || data[m]) {
      setSel(m)
      return
    }
    setData((d) => ({ ...d, [m]: [] }))
    setDirty(true)
    setSel(m)
  }

  if (q.isLoading) return <div className="empty">불러오는 중…</div>
  if (q.error) return <div className="load-error">{(q.error as Error).message}</div>

  return (
    <div className="gp">
      <div className="gp-head">
        <b>{only ? label(only) : '전역 파라미터'}</b>
        <span className="muted small">
          스텝에 <code>{'${이름}'}</code> 으로 쓰면 실행할 때 이 값이 들어갑니다
        </span>
        <span className="sp" />
        {msg && <span className="muted small">{msg}</span>}
        <button
          className="btn primary"
          type="button"
          disabled={saveM.isPending || !dirty}
          onClick={() => saveM.mutate()}
        >
          {saveM.isPending ? '저장 중…' : dirty ? '저장' : '저장됨'}
        </button>
      </div>

      <div className="gp-body">
        {!only && (
        <div className="gp-side">
          {/* 공통이 맨 위. 여기 적고 모델에서 예외만 덮는 것이 이 파일을
              쓰는 방식이다. */}
          <button
            type="button"
            className={`gp-m${sel === GLOBAL ? ' on' : ''}`}
            onClick={() => setSel(GLOBAL)}
          >
            공통 (모든 모델)
            <span className="gp-n">{rows(GLOBAL).filter((r) => r.name).length || ''}</span>
          </button>

          {models.map((m) => (
            <button
              key={m}
              type="button"
              className={`gp-m${sel === m ? ' on' : ''}`}
              onClick={() => setSel(m)}
            >
              {m}
              <span className="gp-n">{rows(m).filter((r) => r.name).length || ''}</span>
            </button>
          ))}

          {/* 등록된 장비의 모델 중 아직 파라미터가 없는 것. 이름을 손으로
              치게 두면 오타 난 모델이 생기고, 그 값은 영영 안 쓰인다. */}
          {known.length > 0 && (
            <select
              className="gp-add"
              value=""
              onChange={(e) => e.target.value && addModel(e.target.value)}
            >
              <option value="">+ 모델 추가…</option>
              {known.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          )}
        </div>
        )}

        <div className="gp-main">
          <div className="gp-title">
            <b>{label(sel)}</b>
            {sel !== GLOBAL && (
              <span className="muted small">같은 이름이면 공통 값을 덮습니다</span>
            )}
            <span className="sp" />
            <button className="btn small" type="button" onClick={add}>
              + 파라미터
            </button>
          </div>

          {cur.length === 0 ? (
            <div className="empty">
              아직 없습니다.
              <br />
              <span className="muted small">
                예) 이름 <code>업링크</code> · 값 <code>gi0/24</code> 라고 두면 스텝에
                <code>{' show interface ${업링크}'}</code> 라고 적을 수 있습니다.
              </span>
            </div>
          ) : (
            <div className="gp-list">
              <div className="gp-row th">
                <span>이름</span>
                <span>값</span>
                <span>묶음</span>
                <span>설명</span>
                <span />
              </div>
              {cur.map((r, i) => (
                <div className="gp-row" key={i}>
                  <input
                    className="mono"
                    value={r.name ?? ''}
                    placeholder="업링크"
                    onChange={(e) => setCell(i, 'name', e.target.value)}
                  />
                  <input
                    className="mono"
                    value={r.value ?? ''}
                    placeholder="gi0/24"
                    onChange={(e) => setCell(i, 'value', e.target.value)}
                  />
                  <input
                    value={r.group ?? ''}
                    placeholder="포트"
                    onChange={(e) => setCell(i, 'group', e.target.value)}
                  />
                  <input
                    value={r.desc ?? ''}
                    placeholder="설명 (선택)"
                    onChange={(e) => setCell(i, 'desc', e.target.value)}
                  />
                  <button
                    type="button"
                    className="if-x"
                    aria-label="지우기"
                    onClick={() => del(i)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
