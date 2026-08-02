import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { categoryApi, reqApi } from '@/api/client'
import { buildCategoryTree } from '@/types'
import './ReqForm.css'

interface Props {
  onClose: () => void
}

interface Parsed {
  reqid: string
  title: string
}

/**
 * 요구사항 일괄 생성.
 *
 * 요구사항은 보통 문서나 엑셀에서 한 뭉치로 넘어온다. 한 건씩 폼을 열어
 * 넣게 하면 스무 건만 되어도 못 쓴다. 그래서 붙여넣기 한 번으로 끝낸다.
 *
 * 한 줄 = 한 건. 탭이나 쉼표로 ID 와 제목을 나눈다. 구분자가 없으면
 * 전체를 제목으로 보고 ID 는 비운다(서버가 채우지 않으므로 나중에 채운다).
 */
function parseLines(text: string): Parsed[] {
  const out: Parsed[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    // 탭 우선, 없으면 쉼표. 제목에 쉼표가 흔해서 첫 구분자만 쓴다.
    const sep = line.includes('\t') ? '\t' : line.includes(',') ? ',' : ''
    if (!sep) {
      out.push({ reqid: '', title: line })
      continue
    }
    const i = line.indexOf(sep)
    out.push({ reqid: line.slice(0, i).trim(), title: line.slice(i + 1).trim() })
  }
  return out.filter((r) => r.title)
}

export default function ReqBulkForm({ onClose }: Props) {
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const [cat1, setCat1] = useState('')
  const [cat2, setCat2] = useState('')
  const [cat3, setCat3] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ ok: number; fail: number } | null>(null)

  const catQ = useQuery({
    queryKey: ['req-categories'],
    queryFn: ({ signal }) => categoryApi.list(signal),
  })
  const tree = useMemo(() => buildCategoryTree(catQ.data?.categories ?? []), [catQ.data])
  const lv2 = useMemo(() => tree.find((p) => p.id === cat1)?.children ?? [], [tree, cat1])
  const lv3 = useMemo(() => lv2.find((p) => p.id === cat2)?.children ?? [], [lv2, cat2])

  const parsed = useMemo(() => parseLines(text), [text])

  const saveM = useMutation({
    mutationFn: async () => {
      let ok = 0
      let fail = 0
      // 순차 저장. 서버가 reqid 중복을 번호 올려 회피하는데, 동시에 던지면
      // 같은 번호를 두 건이 집어갈 수 있다.
      for (const [i, r] of parsed.entries()) {
        try {
          await reqApi.save(`rq-${Date.now()}-${i}`, {
            reqid: r.reqid,
            title: r.title,
            cat1: cat1 || null,
            cat2: cat2 || null,
            cat3: cat3 || null,
            status: '작성중',
            priority: 'Medium',
          })
          ok++
        } catch {
          fail++
        }
      }
      return { ok, fail }
    },
    onSuccess: (r) => {
      setDone(r)
      void qc.invalidateQueries({ queryKey: ['req', 'list'] })
      void qc.invalidateQueries({ queryKey: ['req-categories'] })
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  })

  const submit = () => {
    if (parsed.length === 0) {
      setError('붙여넣은 내용이 없습니다. 한 줄에 한 건씩 넣으세요.')
      return
    }
    setError('')
    saveM.mutate()
  }

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div
        className="modal wide"
        role="dialog"
        aria-modal="true"
        aria-label="요구사항 일괄 생성"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <b>요구사항 일괄 생성</b>
          <button className="modal-x" type="button" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="form-error">{error}</div>}

          {done ? (
            <div className="hint">
              <b>{done.ok}건 생성 완료</b>
              {done.fail > 0 && ` · ${done.fail}건 실패`}
              <br />
              창을 닫으면 목록에서 확인할 수 있습니다.
            </div>
          ) : (
            <>
              <div className="hint">
                한 줄에 한 건씩 붙여넣으세요. <b>탭</b> 또는 <b>쉼표</b>로 ID 와 제목을
                나눕니다. 구분자가 없으면 줄 전체를 제목으로 봅니다.
                <br />
                엑셀에서 두 열을 복사해 그대로 붙여넣으면 됩니다.
              </div>

              <label className="fld">
                <span>붙여넣기</span>
                <textarea
                  autoFocus
                  rows={10}
                  value={text}
                  placeholder={
                    'REQ-001\t10G Rate Limit 지원\n' +
                    'REQ-002\tVLAN Filtering\n' +
                    'REQ-003\tOSPF Area 구성'
                  }
                  onChange={(e) => setText(e.target.value)}
                />
              </label>

              <div className="frow">
                <label className="fld">
                  <span>대분류 (전부 같은 분류로)</span>
                  <select
                    value={cat1}
                    onChange={(e) => {
                      setCat1(e.target.value)
                      setCat2('')
                      setCat3('')
                    }}
                  >
                    <option value="">(미분류)</option>
                    {tree.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="fld">
                  <span>중분류</span>
                  <select
                    value={cat2}
                    disabled={!cat1 || lv2.length === 0}
                    onChange={(e) => {
                      setCat2(e.target.value)
                      setCat3('')
                    }}
                  >
                    <option value="">(선택 안 함)</option>
                    {lv2.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="fld">
                  <span>소분류</span>
                  <select
                    value={cat3}
                    disabled={!cat2 || lv3.length === 0}
                    onChange={(e) => setCat3(e.target.value)}
                  >
                    <option value="">(선택 안 함)</option>
                    {lv3.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {parsed.length > 0 && (
                <div className="fld">
                  <span>미리보기 — {parsed.length}건</span>
                  <div className="bulk-preview">
                    {parsed.slice(0, 30).map((r, i) => (
                      <div className="bulk-row" key={i}>
                        <span className="req-id">{r.reqid || '(ID 없음)'}</span>
                        <span className="req-name">{r.title}</span>
                      </div>
                    ))}
                    {parsed.length > 30 && (
                      <div className="bulk-row muted">… 외 {parsed.length - 30}건</div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-foot">
          <span />
          <span className="page-head-actions">
            <button className="btn" type="button" onClick={onClose}>
              {done ? '닫기' : '취소'}
            </button>
            {!done && (
              <button
                className="btn primary"
                type="button"
                onClick={submit}
                disabled={saveM.isPending || parsed.length === 0}
              >
                {saveM.isPending ? '생성 중…' : `${parsed.length}건 생성`}
              </button>
            )}
          </span>
        </div>
      </div>
    </div>
  )
}
