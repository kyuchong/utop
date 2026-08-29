import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, projectApi } from '@/api/client'

interface Props {
  /** 만들어졌다 — 새 최상위 폴더(cat_id)를 알려 준다 */
  onCreated: (catId: string) => void
  onClose: () => void
}

/**
 * 새 프로젝트 — 요구사항 트리의 최상위 폴더를 만드는 문.
 *
 * 최상위 폴더 = 프로젝트명(itest 방식, 2026-08 기획). 이름만 받는 폴더
 * 창 대신 고객사·모델을 함께 받아 둔다 — 나중의 프로젝트 축 리포트와
 * 통복제(모델 갈아끼우기)가 이 정보를 그대로 쓴다. 하위 폴더는 지금
 * 방식(우클릭) 그대로다.
 */
export default function NewProjectDialog({ onCreated, onClose }: Props) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [customer, setCustomer] = useState('')
  const [mg, setMg] = useState('')
  const [desc, setDesc] = useState('')

  const rolesQ = useQuery({
    queryKey: ['device-roles'],
    queryFn: async () => {
      const r = await apiFetch('/api/device-roles')
      return (await r.json()) as {
        groups?: string[]
        models?: string[]
        model_info?: Record<string, { model_group?: string | null }>
      }
    },
    staleTime: 60_000,
  })
  const createM = useMutation({
    mutationFn: () =>
      projectApi.create({
        name: name.trim(),
        customer: customer.trim(),
        model_group: mg,
        description: desc.trim(),
      }),
    onSuccess: (d) => {
      void qc.invalidateQueries({ queryKey: ['req-categories'] })
      void qc.invalidateQueries({ queryKey: ['projects'] })
      onCreated(d.cat_id)
    },
  })
  const err = createM.error instanceof Error ? createM.error.message : ''
  const busy = createM.isPending

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <form
        className="modal sa"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim() || busy) return
          createM.mutate()
        }}
      >
        <div className="modal-head">
          <b>새 프로젝트</b>
          <button className="modal-x" type="button" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <div className="modal-body">
          <label className="fld">
            <span>프로젝트 이름</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="KT E6100"
            />
            {err && <span className="sa-err">{err}</span>}
          </label>

          <label className="fld">
            <span>고객사</span>
            <input
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              placeholder="KT · LGU+ · SKB…"
            />
          </label>

          <label className="fld">
            <span>모델그룹</span>
            <select
              value={mg}
              onChange={(e) => setMg(e.target.value)}
            >
              <option value="">(선택)</option>
              {(rolesQ.data?.groups ?? []).map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>


          <label className="fld">
            <span>설명</span>
            <textarea
              rows={3}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="무슨 납품·검증인지 한 줄"
            />
          </label>
        </div>

        <div className="modal-foot">
          <span className="muted small">트리 맨 위에 프로젝트 폴더가 생깁니다.</span>
          <span className="sa-sp" />
          <button className="btn" type="button" onClick={onClose}>
            취소
          </button>
          <button className="btn primary" type="submit" disabled={!name.trim() || busy}>
            {busy ? '만드는 중…' : '만들기'}
          </button>
        </div>
      </form>
    </div>
  )
}
