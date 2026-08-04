import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/api/client'
import type { TcData, TcStep } from './types'
import './tc.css'

interface Props {
  data: TcData
  onChange: (patch: Partial<TcData>) => void
}

/**
 * Manual Step — 사람이 읽고 따라 하는 시험서.
 *
 * 칸이 셋이다: **Test Step**(무엇을 한다) · **Test Data**(무엇을 넣는다) ·
 * **Expected**(무엇이 나와야 한다). 뒤 둘에는 사진이 붙는다.
 *
 * **결과·판정 칸은 두지 않는다.** 여기는 시험서를 *쓰는* 자리지 *돌리는*
 * 자리가 아니다. 사람이 보고 판단하는 것이라 미리 적을 값이 없다 —
 * 결과는 실제로 돌릴 때(사이클·실행) 붙는다. 옛 화면도 같은 이유로
 * 수동 스텝에서 결과와 RCA 를 뺐다.
 *
 * 사진이 이 탭의 이유다. '이 화면이 이렇게 나와야 한다' 는 글로 못 적는다.
 * 3열 스텝 세부에는 사진 칸이 없다 — 좁아서 못 넣는다.
 *
 * ⚠ 이 탭은 **수동 스텝만** 보인다. 옛 화면이 Manual/Automation 두 탭으로
 * 스텝을 갈라 놓아서 656스텝 중 7개만 보이던 일이 있었다. 그래서 여기는
 * '전부' 인 척하지 않는다 — 머리에 전체 스텝 수를 함께 적고, 나머지는
 * Automation 탭에 있다고 말한다.
 */
export default function TcManual({ data, onChange }: Props) {
  const all = (data.checks ?? []) as TcStep[]
  const [busy, setBusy] = useState(-1)
  /** 크게 보고 있는 사진. 새 탭으로 띄우면 돌아올 때 화면이 처음으로 돌아간다 */
  const [big, setBig] = useState('')
  const target = useRef<{ i: number; field: 'data_img' | 'expected_img' } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  /** 이 탭에 보일 스텝의 **원본 인덱스**. 걸러낸 자리 번호를 쓰면 엉뚱한 줄이 고쳐진다 */
  const idxs = all.map((s, i) => ({ s, i })).filter(({ s }) => s.kind === 'manual').map(({ i }) => i)

  const setStep = (i: number, p: Partial<TcStep>) =>
    onChange({ checks: all.map((s, j) => (j === i ? { ...s, ...p } : s)) })

  const add = () =>
    onChange({ checks: [...all, { kind: 'manual', indent: 0, step: '', data: '', expected: '' }] })

  const del = (i: number) => onChange({ checks: all.filter((_, j) => j !== i) })

  /** 순서가 곧 절차다. 자리를 원본 배열 안에서 옮긴다 */
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

  useEffect(() => {
    if (!big) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setBig('')
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [big])

  const upload = async (file: File) => {
    const t = target.current
    if (!t) return
    setBusy(t.i)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await apiFetch('/api/upload/image', { method: 'POST', body: fd })
      const b = (await r.json().catch(() => ({}))) as { url?: string; name?: string; detail?: string }
      if (!r.ok) throw new Error(b.detail || '올리지 못했습니다')
      setStep(t.i, { [t.field]: b.url || b.name } as Partial<TcStep>)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(-1)
      target.current = null
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  /**
   * 붙여넣기 · 끌어놓기로 사진 넣기.
   *
   * 시험 문서를 쓸 때 실제로 하는 일은 '화면을 캡쳐해서 붙이는 것' 이다.
   * 파일로 저장하고 「사진」 을 누르고 고르는 세 단계를 매번 하게 두면
   * 아무도 사진을 안 붙인다.
   */
  const grabFrom = (i: number, field: 'data_img' | 'expected_img', items?: DataTransferItemList | null,
                    files?: FileList | null) => {
    let f: File | null = null
    for (const it of Array.from(items ?? [])) {
      if (it.kind === 'file' && it.type.startsWith('image/')) {
        f = it.getAsFile()
        if (f) break
      }
    }
    if (!f) f = Array.from(files ?? []).find((x) => x.type.startsWith('image/')) ?? null
    if (!f) return false
    target.current = { i, field }
    void upload(f)
    return true
  }

  const img = (i: number, s: TcStep, field: 'data_img' | 'expected_img') => {
    const src = s[field] as string | undefined
    const wKey = (field === 'data_img' ? 'data_img_w' : 'expected_img_w') as
      | 'data_img_w'
      | 'expected_img_w'
    const w = s[wKey]
    if (!src) return null
    return (
      <div
        className="mn-imgbox"
        // 브라우저가 만들어 주는 손잡이(오른쪽 아래 모서리)로 늘이고 줄인다.
        // 끝나면 그 폭을 저장한다 — 안 그러면 다시 열 때마다 원래대로다.
        style={w ? { width: w } : undefined}
        onPointerUp={(e) => {
          const el = e.currentTarget
          const now = Math.round(el.offsetWidth)
          if (now > 0 && now !== w) setStep(i, { [wKey]: now } as Partial<TcStep>)
        }}
      >
        {/* 눌러서 크게. 줄여 놓으면 글자가 안 읽힌다.
            새 탭으로 띄우지 않는다 — 돌아오면 이 화면이 처음으로 돌아가서
            보던 TC 와 줄을 다시 찾아야 한다. */}
        <button type="button" className="mn-open" onClick={() => setBig(src)} title="크게 보기">
          <img src={src} alt="" />
        </button>
        <button
          type="button"
          className="if-x"
          aria-label="사진 지우기"
          onClick={() => setStep(i, { [field]: '', [wKey]: undefined } as Partial<TcStep>)}
        >
          ×
        </button>
      </div>
    )
  }

  /**
   * 글칸 + 그 아래 사진. 한 칸으로 묶어야 사진을 폭 끝까지 늘릴 수 있다.
   *
   * 사진은 **Test Data 와 Expected** 에만 붙는다. Test Step 은 '무엇을
   * 하는가' 라 글이면 되고, 사진이 필요한 것은 '무엇을 넣었나' 와
   * '무엇이 나와야 하나' 다.
   */
  const cell = (
    i: number,
    s: TcStep,
    textKey: 'step' | 'data' | 'expected',
    field: 'data_img' | 'expected_img' | null,
    placeholder: string,
  ) => (
    <div
      className="mn-cell"
      onDragOver={(e) => field && e.preventDefault()}
      onDrop={(e) => {
        if (field && grabFrom(i, field, e.dataTransfer?.items, e.dataTransfer?.files))
          e.preventDefault()
      }}
    >
      <textarea
        rows={2}
        value={s[textKey] ?? ''}
        placeholder={placeholder}
        onChange={(e) => setStep(i, { [textKey]: e.target.value } as Partial<TcStep>)}
        onPaste={(e) => {
          // 글자를 붙여넣는 경우가 훨씬 많으므로, 사진일 때만 가로챈다
          if (field && grabFrom(i, field, e.clipboardData?.items, e.clipboardData?.files))
            e.preventDefault()
        }}
      />
      {field && img(i, s, field)}
      {field && !s[field] && (
        <button
          type="button"
          className="mn-add"
          disabled={busy === i}
          onClick={() => {
            target.current = { i, field }
            fileRef.current?.click()
          }}
        >
          {busy === i ? '올리는 중…' : '＋ 사진 — Ctrl+V 로 붙여넣기'}
        </button>
      )}
    </div>
  )

  return (
    <div className="tc-pane">
      {/* 크게 보기. 이 화면 위에 덮어 띄우고 닫으면 그대로 돌아온다. */}
      {big && (
        <div
          className="mn-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="사진 크게 보기"
          onClick={() => setBig('')}
        >
          <div className="mn-lb-bar">
            <span className="muted small">아무 데나 누르거나 Esc 로 닫습니다</span>
            <span className="sp" />
            <button className="btn small" type="button" onClick={() => setBig('')}>
              닫기
            </button>
          </div>
          {/* 사진을 눌렀을 때는 안 닫는다 — 확대해 보다가 잘못 눌러 닫히면 성가시다 */}
          <img src={big} alt="" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      <input
        ref={fileRef}
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
          <b>Manual Step</b>
          <span className="muted small">
            {idxs.length}개 · 사람이 읽고 따라 하는 절차입니다
          </span>
          <button className="btn small" type="button" onClick={add}>
            ＋ 수동 스텝
          </button>
        </div>

        {/* 이 탭이 시험 전체인 것처럼 보이면 안 된다. 옛 화면이 그래서
            656스텝 중 7개만 보였다. */}
        {all.length > idxs.length && (
          <div className="mn-note">
            이 시험은 전부 <b>{all.length}스텝</b>이고 그중 수동이 {idxs.length}개입니다.
            나머지는 「Automation」 탭에 있습니다.
          </div>
        )}

        {idxs.length === 0 ? (
          <div className="empty">
            Manual Step 이 없습니다.
            <br />
            <span className="muted small">
              장비에 명령을 보내는 대신 사람이 해야 하는 일 — 전원을 내린다, 케이블을
              뽑는다, 화면을 눈으로 본다 — 이 여기 옵니다.
            </span>
          </div>
        ) : (
          <div className="mn-list">
            <div className="mn-row th">
              <span>#</span>
              <span>Test Step</span>
              <span>Test Data</span>
              <span>Expected</span>
              <span />
            </div>

            {idxs.map((i, n) => {
              const s = all[i]
              if (!s) return null
              return (
                <div className="mn-row" key={i}>
                  {/* 원본 번호를 적는다. 스텝 탭에서 몇 번째 줄인지 찾아갈 수
                      있어야 한다 — 여기 번호만 적으면 서로 다른 번호가 둘이 된다 */}
                  <span className="mn-n" title={`전체 ${i + 1}번째 스텝`}>
                    {n + 1}
                    <small>#{i + 1}</small>
                  </span>

                  {cell(i, s, 'step', null, '예) 장비 전원을 내렸다가 다시 올린다')}
                  {cell(i, s, 'data', 'data_img', '무엇을 넣었나 · 어떤 화면이었나')}
                  {cell(i, s, 'expected', 'expected_img', '예) 전면 LED 가 초록으로 바뀐다')}

                  {/* 자동으로 판정할 수 없는 스텝이라 사람이 찍는다.
                      3열과 같은 값을 쓴다 — 어느 쪽에서 찍든 같은 결과다. */}
                  <div className="mn-ops">
                    <button
                      type="button"
                      className="if-x"
                      title="위로"
                      disabled={i <= 0}
                      onClick={() => move(i, -1)}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className="if-x"
                      title="아래로"
                      disabled={i >= all.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      ▼
                    </button>
                    <button
                      type="button"
                      className="if-x"
                      title="지우기"
                      onClick={() => del(i)}
                    >
                      ×
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
