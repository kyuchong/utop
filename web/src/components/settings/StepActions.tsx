import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { ADD_KINDS, stepKindInfo } from '@/components/tc/types'
import './StepActions.css'

/** 종류 하나가 어디에 쓰이나 */
export interface StepAct {
  /** 실행 로그에 찍는다 */
  log: boolean
  /** ＋스텝 목록에 내놓는다 */
  add: boolean
  /** 결과서(PPTX)에 싣는다 */
  pptx: boolean
}

export const STEP_ACT_ON: StepAct = { log: true, add: true, pptx: true }

/**
 * TC Step Action — **종류마다 어디에 쓸지** 정한다.
 *
 * 「CLI 는 결과서에 싣고, 치환은 로그에만, 계측기는 아예 안 내놓는다」 같은
 * 것이 현장마다 다르다. 여태 코드에 박혀 있어 고치려면 배포를 해야 했다
 * (지시: 설정 페이지로 빼자).
 *
 * 안 적힌 종류는 **셋 다 켠 것**으로 본다 — 새 종류가 늘 때 조용히 사라지지
 * 않게. 끄는 것은 사람이 손으로 하는 결정이다.
 */
export default function StepActions() {
  const qc = useQueryClient()
  const [items, setItems] = useState<Record<string, StepAct>>({})
  const [msg, setMsg] = useState('')

  const q = useQuery({
    queryKey: ['step-actions'],
    queryFn: async () => {
      const r = await apiFetch('/api/step-actions')
      if (!r.ok) throw new Error(await r.text())
      return (await r.json()) as { items: Record<string, StepAct> }
    },
  })
  useEffect(() => {
    if (q.data?.items) setItems(q.data.items)
  }, [q.data])

  const save = useMutation({
    mutationFn: async (next: Record<string, StepAct>) => {
      const r = await apiFetch('/api/step-actions', {
        method: 'POST',
        body: JSON.stringify({ items: next }),
      })
      if (!r.ok) throw new Error((await r.text()) || '저장하지 못했습니다')
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['step-actions'] })
      setMsg('저장했습니다')
      window.setTimeout(() => setMsg(''), 2000)
    },
    onError: (e: Error) => setMsg(String(e.message).slice(0, 120)),
  })

  /* 목록은 「＋스텝」 에 내놓는 것과 같은 벌이다 — 여기서만 보이는 종류가
     있으면 어디에 쓰는 설정인지 알 수 없다 */
  const kinds = useMemo(() => ADD_KINDS.map((x) => ({ k: String(x.k), info: stepKindInfo(x.k) })), [])

  const at = (k: string): StepAct => items[k] ?? STEP_ACT_ON
  const set = (k: string, p: Partial<StepAct>) =>
    setItems((cur) => ({ ...cur, [k]: { ...at(k), ...p } }))

  const col = (label: string, key: keyof StepAct, hint: string) => (
    <th title={hint}>
      {label}
      <button
        type="button"
        className="sa-all"
        title="이 줄 전체 켜기 / 끄기"
        onClick={() => {
          const on = kinds.some(({ k }) => !at(k)[key])
          const next = { ...items }
          kinds.forEach(({ k }) => (next[k] = { ...at(k), [key]: on }))
          setItems(next)
        }}
      >
        전체
      </button>
    </th>
  )

  return (
    <div className="sa">
      <div className="sa-head">
        <b>TC Step Action</b>
        <span className="muted small">
          스텝 종류마다 <b>어디에 쓸지</b> 정합니다. 안 건드리면 셋 다 켜져 있습니다.
        </span>
        <span className="sp" />
        {msg && <span className="sa-note">{msg}</span>}
        <button
          className="btn primary small"
          type="button"
          disabled={save.isPending}
          onClick={() => save.mutate(items)}
        >
          저장
        </button>
      </div>

      <div className="sa-card">
        <table className="sa-tbl">
          <thead>
            <tr>
              <th className="c-k">Action</th>
              {col('실행 로그 출력', 'log', '끄면 이 종류의 줄은 실행 로그에 안 찍힙니다')}
              {col('스텝 추가', 'add', '끄면 「＋스텝」 목록에서 빠집니다 (이미 만든 스텝은 그대로 돕니다)')}
              {col('PPTX 결과서 반영', 'pptx', '끄면 결과서에 이 종류의 스텝이 안 실립니다')}
            </tr>
          </thead>
          <tbody>
            {kinds.map(({ k, info }) => (
              <tr key={k}>
                <td className="c-k">
                  <b>{info.label}</b>
                  <span className="muted small">{k}</span>
                </td>
                {(['log', 'add', 'pptx'] as Array<keyof StepAct>).map((f) => (
                  <td key={f}>
                    <input
                      type="checkbox"
                      checked={at(k)[f]}
                      onChange={(e) => set(k, { [f]: e.target.checked } as Partial<StepAct>)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
