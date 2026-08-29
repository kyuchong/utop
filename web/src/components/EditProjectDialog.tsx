import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, projectApi } from '@/api/client'
import type { Project } from '@/types'

/**
 * 프로젝트 수정 — 고객사·모델그룹·모델명·설명.
 *
 * 이름은 여기 없다. 프로젝트 이름은 곧 트리 맨 위 폴더 이름이라 Rename 이
 * 정본이다. 두 곳에서 고치게 두면 한쪽만 바뀌는 날이 온다.
 *
 * 모델그룹이 **ID 앞머리**다(E61xx_R0001). 그래서 여기서 바꾸면 앞으로
 * 매길 ID 가 바뀐다 — 그 말을 창 안에 적어 둔다. 이미 매긴 ID 는 안 따라
 * 간다: 따라가면 밖에 나간 링크가 전부 어긋난다.
 */
interface Props {
  project: Project
  onSaved: () => void
  onClose: () => void
}

export default function EditProjectDialog({ project, onSaved, onClose }: Props) {
  const qc = useQueryClient()
  const [customer, setCustomer] = useState(project.customer || '')
  const [mg, setMg] = useState(project.model_group || '')
  const [md, setMd] = useState(project.model || '')
  const [desc, setDesc] = useState(project.description || '')

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
  const modelOpts = (rolesQ.data?.models ?? []).filter(
    (m) => !mg || (rolesQ.data?.model_info?.[m]?.model_group ?? '') === mg,
  )

  const saveM = useMutation({
    mutationFn: () =>
      projectApi.update(project.id, {
        customer: customer.trim(),
        model_group: mg,
        model: md,
        description: desc.trim(),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['projects'] })
      onSaved()
    },
  })
  const err = saveM.error instanceof Error ? saveM.error.message : ''
  const changed =
    customer.trim() !== (project.customer || '') ||
    mg !== (project.model_group || '') ||
    md !== (project.model || '') ||
    desc.trim() !== (project.description || '')

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <form
        className="modal sa"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          if (!changed || saveM.isPending) return
          saveM.mutate()
        }}
      >
        <div className="modal-head">
          <b>{project.name} — 프로젝트 수정</b>
          <button className="modal-x" type="button" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="epd-note">
            이름은 트리에서 <b>Rename</b> 으로 고칩니다. 모델그룹은 <b>ID 앞머리</b>입니다 —
            바꾸면 앞으로 매길 ID 가 바뀌고, 이미 매긴 ID 는 그대로 있습니다.
          </div>

          <label className="fld">
            <span>고객사</span>
            <input
              autoFocus
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              placeholder="KT · LGU+ · SKB…"
            />
          </label>

          <label className="fld">
            <span>모델그룹</span>
            <select
              value={mg}
              onChange={(e) => {
                setMg(e.target.value)
                setMd('')
              }}
            >
              <option value="">(선택)</option>
              {(rolesQ.data?.groups ?? []).map((g) => (
                <option key={g}>{g}</option>
              ))}
              {/* 카탈로그에서 사라진 옛 값도 남겨 둔다 — 안 그러면 창을 열자마자
                  값이 조용히 비어, 저장하면 있던 것이 지워진다. */}
              {mg && !(rolesQ.data?.groups ?? []).includes(mg) && <option>{mg}</option>}
            </select>
          </label>

          <label className="fld">
            <span>모델명</span>
            <select value={md} onChange={(e) => setMd(e.target.value)}>
              <option value="">(선택)</option>
              {modelOpts.map((m) => (
                <option key={m}>{m}</option>
              ))}
              {md && !modelOpts.includes(md) && <option>{md}</option>}
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
          {err && <span className="sa-err">{err}</span>}
        </div>

        <div className="modal-foot">
          <span className="sa-sp" />
          <button className="btn" type="button" onClick={onClose}>
            취소
          </button>
          <button className={`btn epd-go${changed ? ' dirty' : ''}`} type="submit"
                  disabled={!changed || saveM.isPending}>
            {saveM.isPending ? '저장 중…' : changed ? '저장' : '저장됨'}
          </button>
        </div>
      </form>
    </div>
  )
}
