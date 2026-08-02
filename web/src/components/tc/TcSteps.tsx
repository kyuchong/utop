import { useRef, useState } from 'react'
import { apiFetch } from '@/api/client'
import type { TcData, TcStep } from './types'

interface Props {
  /** manual = 사람이 보고 판단 · auto = 장비에 명령을 보내고 판정 */
  mode: 'manual' | 'auto'
  data: TcData
  onChange: (patch: Partial<TcData>) => void
}

/**
 * 스텝 편집.
 *
 * 수동과 자동을 한 화면에서 탭으로 나눠 쓴다. 칸이 다르기 때문이다:
 *  · 수동 — # · Test Step · Test Data(사진) · Expected(사진)
 *    결과와 RCA 를 두지 않는다. 사람이 보고 판단하는 것이라 미리 적을 값이 없다.
 *  · 자동 — # · 세션 · Test Step · Test Data · Expected · 판정기준 · RCA
 *    세션은 Environment 에서 만든 슬롯(s1)을 고른다. 장비 IP 를 직접 적지 않는다.
 *
 * 스텝은 한 배열(checks)에 kind 로 섞여 저장된다. 나누면 순서가 어긋난다.
 */
export default function TcSteps({ mode, data, onChange }: Props) {
  const all = data.checks ?? []
  const slots = data.slots ?? []
  const [busyIdx, setBusyIdx] = useState(-1)
  const fileRef = useRef<{ idx: number; field: 'data_img' | 'expected_img' } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  /** 이 탭에 보일 스텝의 원본 인덱스 */
  const idxs = all
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => (s.kind ?? 'manual') === mode)
    .map(({ i }) => i)

  const setStep = (i: number, patch: Partial<TcStep>) =>
    onChange({ checks: all.map((s, j) => (j === i ? { ...s, ...patch } : s)) })

  const addStep = () =>
    onChange({
      checks: [
        ...all,
        mode === 'auto'
          ? { kind: 'auto', session: slots[0]?.key ?? '', step: '', data: '', expected: '' }
          : { kind: 'manual', step: '', data: '', expected: '' },
      ],
    })

  const delStep = (i: number) => onChange({ checks: all.filter((_, j) => j !== i) })

  /** 위아래로 옮긴다. 시험 순서가 곧 절차라 자주 바꾼다. */
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= all.length) return
    const next = [...all]
    const a = next[i]
    const b = next[j]
    if (!a || !b) return
    next[i] = b
    next[j] = a
    onChange({ checks: next })
  }

  const pickImage = (idx: number, field: 'data_img' | 'expected_img') => {
    fileRef.current = { idx, field }
    inputRef.current?.click()
  }

  const upload = async (file: File) => {
    const target = fileRef.current
    if (!target) return
    setBusyIdx(target.idx)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await apiFetch('/api/upload/image', { method: 'POST', body: fd })
      const b = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(b.detail || '올리지 못했습니다')
      setStep(target.idx, { [target.field]: b.url || b.name } as Partial<TcStep>)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyIdx(-1)
      fileRef.current = null
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const imgCell = (i: number, s: TcStep, field: 'data_img' | 'expected_img') => (
    <div className="st-img">
      {s[field] ? (
        <>
          <img src={s[field] as string} alt="" />
          <button
            type="button"
            className="if-x"
            onClick={() => setStep(i, { [field]: '' } as Partial<TcStep>)}
            aria-label="사진 삭제"
          >
            ×
          </button>
        </>
      ) : (
        <button
          type="button"
          className="btn small"
          disabled={busyIdx === i}
          onClick={() => pickImage(i, field)}
        >
          {busyIdx === i ? '올리는 중…' : '사진'}
        </button>
      )}
    </div>
  )

  return (
    <div className="tc-pane">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void upload(f)
        }}
      />

      <section className="tc-card">
        <div className="tc-card-head">
          <b>{mode === 'manual' ? '수동 시험 스텝' : '자동 시험 스텝'}</b>
          <span className="muted small">
            {mode === 'manual'
              ? '사람이 보고 판단합니다. 결과·RCA 칸은 두지 않습니다'
              : '세션은 Environment 의 슬롯을 고릅니다'}
          </span>
          <button className="btn small" type="button" onClick={addStep}>
            + 스텝
          </button>
        </div>

        {mode === 'auto' && slots.length === 0 && (
          <div className="hint">
            아직 슬롯이 없습니다. <b>Environment</b> 에서 슬롯을 먼저 만들면 세션을
            고를 수 있습니다.
          </div>
        )}

        {idxs.length === 0 ? (
          <div className="empty">
            아직 스텝이 없습니다. 「+ 스텝」 으로 추가하세요.
          </div>
        ) : (
          <div className={`st-table ${mode}`}>
            <div className="st-row th">
              <span>#</span>
              {mode === 'auto' && <span>세션</span>}
              <span>Test Step</span>
              <span>Test Data</span>
              <span>Expected</span>
              {mode === 'auto' && <span>판정 기준</span>}
              {mode === 'auto' && <span>RCA</span>}
              <span />
            </div>

            {idxs.map((i, n) => {
              const s = all[i]
              if (!s) return null
              return (
                <div className="st-row" key={i}>
                  <span className="st-no">{n + 1}</span>

                  {mode === 'auto' && (
                    <select
                      value={s.session ?? ''}
                      onChange={(e) => setStep(i, { session: e.target.value })}
                    >
                      <option value="">(없음)</option>
                      {slots.map((sl) => (
                        <option key={sl.key} value={sl.key}>
                          {sl.key}
                          {sl.label ? ` · ${sl.label}` : ''}
                        </option>
                      ))}
                    </select>
                  )}

                  <textarea
                    rows={2}
                    placeholder="무엇을 하는가"
                    value={s.step ?? ''}
                    onChange={(e) => setStep(i, { step: e.target.value })}
                  />

                  <div className="st-cell">
                    <textarea
                      rows={2}
                      placeholder={mode === 'auto' ? '보낼 명령' : '넣는 값'}
                      value={s.data ?? ''}
                      onChange={(e) => setStep(i, { data: e.target.value })}
                    />
                    {mode === 'manual' && imgCell(i, s, 'data_img')}
                  </div>

                  <div className="st-cell">
                    <textarea
                      rows={2}
                      placeholder="기대 결과"
                      value={s.expected ?? ''}
                      onChange={(e) => setStep(i, { expected: e.target.value })}
                    />
                    {mode === 'manual' && imgCell(i, s, 'expected_img')}
                  </div>

                  {mode === 'auto' && (
                    <textarea
                      rows={2}
                      placeholder="응답에 이 문자열이 있으면 PASS"
                      value={s.criteria ?? ''}
                      onChange={(e) => setStep(i, { criteria: e.target.value })}
                    />
                  )}
                  {mode === 'auto' && (
                    <textarea
                      rows={2}
                      placeholder="실패했을 때 볼 곳"
                      value={s.rca ?? ''}
                      onChange={(e) => setStep(i, { rca: e.target.value })}
                    />
                  )}

                  <span className="st-actions">
                    <button
                      type="button"
                      className="if-x"
                      title="위로"
                      onClick={() => move(i, -1)}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className="if-x"
                      title="아래로"
                      onClick={() => move(i, 1)}
                    >
                      ▼
                    </button>
                    <button
                      type="button"
                      className="if-x"
                      title="삭제"
                      onClick={() => delStep(i)}
                    >
                      ×
                    </button>
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
