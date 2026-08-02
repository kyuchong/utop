import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch, getToken } from '@/api/client'
import './ReqForm.css'

interface Props {
  onClose: () => void
}

interface Preview {
  created: Array<{ ip: string; name?: string | null; interfaces?: number | null; access?: string[] }>
  updated: Array<{ ip: string; name?: string | null; interfaces?: number | null; access?: string[] }>
  errors: string[]
}

const SAMPLE =
  'LAB,이름,IP,제조사,제품군,모델명,telnet포트,ssh포트,console주소,console포트,snmp,계정,비밀번호,인터페이스\n' +
  'Lab#1,E6100,10.1.1.21,유비쿼스,L2,E6100-48X,23,22,10.1.1.9,7001,public,admin,,gi1/0/1-48'

/**
 * CSV 일괄 등록.
 *
 * 장비 30대를 창 하나씩 열어 등록하는 것은 현실적이지 않다. 내보내고,
 * 엑셀에서 고치고, 다시 넣는 왕복 하나로 일괄등록과 일괄수정을 함께 푼다.
 *
 * 넣기 전에 반드시 미리보기를 거친다 — 30줄을 그대로 밀어넣고 나서
 * 잘못을 발견하면 되돌릴 방법이 없다.
 */
export default function DeviceBulk({ onClose }: Props) {
  const qc = useQueryClient()
  const [csv, setCsv] = useState('')
  const [prev, setPrev] = useState<Preview | null>(null)
  const [error, setError] = useState('')

  const run = (dry: boolean) =>
    apiFetch('/api/devices2/import-csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv, dry_run: dry }),
    }).then(async (r) => {
      const b = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(b.detail || `실패 (${r.status})`)
      return b as Preview
    })

  const dryM = useMutation({
    mutationFn: () => run(true),
    onSuccess: (b) => {
      setPrev(b)
      setError('')
    },
    onError: (e) => {
      setPrev(null)
      setError(e instanceof Error ? e.message : String(e))
    },
  })

  const applyM = useMutation({
    mutationFn: () => run(false),
    onSuccess: (b) => {
      void qc.invalidateQueries({ queryKey: ['devices'] })
      if (b.errors?.length) {
        setPrev(b)
        setError(`${b.errors.length}줄이 실패했습니다`)
      } else {
        onClose()
      }
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  })

  const pickFile = async (file: File) => {
    const text = await file.text()
    // 엑셀이 붙이는 BOM 을 떼지 않으면 첫 열 이름이 '﻿LAB' 이 되어 못 읽는다
    setCsv(text.replace(/^﻿/, ''))
    setPrev(null)
    setError('')
  }

  const busy = dryM.isPending || applyM.isPending
  const total = (prev?.created.length ?? 0) + (prev?.updated.length ?? 0)

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div
        className="modal wide"
        role="dialog"
        aria-modal="true"
        aria-label="장비 일괄 등록"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <b>장비 일괄 등록</b>
          <button className="modal-x" type="button" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="form-error">{error}</div>}

          <div className="hint">
            내보내기로 받은 CSV 를 엑셀에서 고쳐 그대로 붙이시면 됩니다. <b>IP 가 키</b>라
            같은 IP 는 덮어씁니다. <b>빈 칸은 기존 값을 그대로 둡니다</b> — 비밀번호를
            안 적어도 지워지지 않습니다. 인터페이스는 <code>gi1/0/1-48</code> 처럼
            범위로 적을 수 있습니다.
          </div>

          <div className="bulk-tools">
            <label className="btn" style={{ cursor: 'pointer' }}>
              파일 선택
              <input
                type="file"
                accept=".csv,text/csv"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void pickFile(f)
                }}
              />
            </label>
            <button
              className="btn"
              type="button"
              onClick={() => {
                setCsv(SAMPLE)
                setPrev(null)
              }}
            >
              양식 넣기
            </button>
            <a
              className="btn"
              href={`/api/devices2/export.csv?token=${encodeURIComponent(getToken() ?? '')}`}
              download="devices.csv"
            >
              현재 목록 내보내기
            </a>
          </div>

          <div className="fld wide">
            <div className="fld-head">
              <span>CSV</span>
              <span className="muted small">첫 줄은 머리글이어야 합니다</span>
            </div>
            <textarea
              className="bulk-csv"
              value={csv}
              placeholder={SAMPLE}
              onChange={(e) => {
                setCsv(e.target.value)
                setPrev(null)
              }}
            />
          </div>

          {prev && (
            <div className="fld wide">
              <div className="fld-head">
                <span>미리보기</span>
                <span className="muted small">
                  새로 {prev.created.length}대 · 수정 {prev.updated.length}대
                  {prev.errors.length > 0 && ` · 오류 ${prev.errors.length}`}
                </span>
              </div>
              <div className="bulk-preview">
                {prev.errors.map((e, i) => (
                  <div className="bulk-row invalid" key={`e${i}`}>
                    {e}
                  </div>
                ))}
                {prev.created.map((d, i) => (
                  <div className="bulk-row" key={`c${i}`}>
                    <span className="status pass">새로</span>
                    <b>{d.name || d.ip}</b>
                    <span className="muted small">{d.ip}</span>
                    <span className="muted small">
                      {(d.access ?? []).join(' · ')}
                      {d.interfaces ? ` · 포트 ${d.interfaces}` : ''}
                    </span>
                  </div>
                ))}
                {prev.updated.map((d, i) => (
                  <div className="bulk-row" key={`u${i}`}>
                    <span className="status draft">수정</span>
                    <b>{d.name || d.ip}</b>
                    <span className="muted small">{d.ip}</span>
                    <span className="muted small">
                      {(d.access ?? []).join(' · ')}
                      {d.interfaces ? ` · 포트 ${d.interfaces}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="modal-foot">
          <span className="muted small">
            {prev ? `${total}대가 반영됩니다` : '확인을 먼저 눌러 주세요'}
          </span>
          <span className="page-head-actions">
            <button className="btn" type="button" onClick={onClose} disabled={busy}>
              취소
            </button>
            <button
              className="btn"
              type="button"
              disabled={busy || !csv.trim()}
              onClick={() => dryM.mutate()}
            >
              {dryM.isPending ? '확인 중…' : '확인'}
            </button>
            <button
              className="btn primary"
              type="button"
              disabled={busy || !prev || total === 0}
              onClick={() => applyM.mutate()}
            >
              {applyM.isPending ? '등록 중…' : '등록'}
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}
