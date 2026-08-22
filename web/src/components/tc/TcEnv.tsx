import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import LlmPick, { useLlmPick } from '@/components/LlmPick'
import type { TcData } from './types'

interface Props {
  data: TcData
  onChange: (patch: Partial<TcData>) => void
  /** 지금 열려 있는 TC. 목적을 뽑아 달라고 할 때 필요하다 */
  tcid: string
}

/**
 * Environment — 이 시험을 돌리기 전에 갖춰져야 하는 것.
 *
 * 「시험 목적」 과 「사전 준비 조건」 을 정보 탭에서 옮겨 왔다. 정보 탭은
 * ID·상태·유형처럼 **이 시험을 가리키는 표찰**을 모아 두는 자리고, 이 둘은
 * 표찰이 아니라 **시험의 내용**이다. 성격이 다른 것이 한 탭에 섞여 있으면
 * 어느 쪽을 고치러 왔는지가 흐려진다.
 *
 * 토폴로지(배선)와 나란히 두는 편이 맞다 — 둘 다 「돌리기 전에 정해져
 * 있어야 하는 것」 이다.
 */
export default function TcEnv({ data, onChange, tcid }: Props) {
  /**
   * 스텝을 읽고 목적·사전조건을 제안받는다.
   *
   * 바로 칸에 넣지 않는다. 이미 쓴 글이 소리 없이 없어지면 안 되고,
   * 모델이 쓴 설명은 사람이 읽고 넣어야 한다. 아래에 제안으로 보여주고
   * 「넣기」 를 누르면 그때 들어간다.
   */
  const [prop, setProp] = useState<{ object_md: string; precondition_md: string } | null>(null)
  const [err, setErr] = useState('')

  /**
   * 누구에게 맡길 것인가.
   *
   * 랩 안의 로컬 LLM 과 Claude 는 잘하는 일이 다르다 — 로컬은 밖으로
   * 나가지 않아 자료를 맡길 수 있고, Claude 는 글이 낫다. 매번 고를 수
   * 있어야 한다. 고른 것은 기억한다.
   */
  const [llm, setLlm] = useLlmPick('object')

  const askM = useMutation({
    mutationFn: async () => {
      const r = await apiFetch(`/api/tc/${encodeURIComponent(tcid)}/describe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 저장 안 한 스텝으로도 뽑을 수 있어야 한다 — 캡쳐 직후가 그 순간이다
        body: JSON.stringify({ tc: data, llm }),
      })
      const b = (await r.json()) as {
        object_md?: string
        precondition_md?: string
        detail?: string
      }
      if (!r.ok) throw new Error(b.detail || `만들지 못했습니다 (${r.status})`)
      return { object_md: b.object_md ?? '', precondition_md: b.precondition_md ?? '' }
    },
    onSuccess: (b) => {
      setProp(b)
      setErr('')
    },
    onError: (e) => {
      setProp(null)
      setErr(e instanceof Error ? e.message : String(e))
    },
  })

  const stepCount = (data.checks ?? []).length

  return (
    <div className="tc-pane">
      <section className="tc-card">
        <div className="tc-card-head">
          <b>시험 목적</b>
          <span className="muted small">무엇을 확인하는 시험인가</span>
          {/* 스텝은 캡쳐로 만들어지는데 이 글은 여전히 손으로 써야 했다.
              스텝을 읽고 대신 쓰게 한다 — 반대 방향(목적 → 스텝)은 이미
              「AI 로 만들기」 가 하고 있다. */}
          <LlmPick value={llm} onChange={setLlm} />
          <button
            className="btn small"
            type="button"
            /* 스텝이 없어도 켠다(지적: 단추가 안 켜져 생성 불가).
               요구사항에서 뽑아 만든 시험은 이름만 있고 스텝은 아직 없다 —
               정작 그때 목적이 필요하다. 그때는 요구사항의 구현의도를 읽는다 */
            disabled={askM.isPending}
            title={
              stepCount === 0
                ? '스텝이 아직 없어 요구사항의 구현의도와 제목을 읽고 씁니다'
                : `스텝 ${stepCount}개를 읽고 목적과 사전조건을 씁니다`
            }
            onClick={() => askM.mutate()}
          >
            {askM.isPending ? '읽는 중…' : stepCount === 0 ? '✨ AI 로 쓰기' : '✨ 스텝을 보고 쓰기'}
          </button>
        </div>

        {err && <div className="tc-err">{err}</div>}

        {prop && (
          <div className="tc-prop">
            <div className="tc-prop-head">
              <b>이렇게 쓸까요</b>
              <span className="muted small">
                  {stepCount ? `스텝 ${stepCount}개를 읽었습니다` : '요구사항과 제목을 읽었습니다'}
                </span>
              <span className="sp" />
              <button
                className="btn small primary"
                type="button"
                onClick={() => {
                  onChange({
                    object_md: prop.object_md,
                    precondition_md: prop.precondition_md,
                  })
                  setProp(null)
                }}
              >
                두 칸에 넣기
              </button>
              <button className="btn small" type="button" onClick={() => setProp(null)}>
                버리기
              </button>
            </div>
            <div className="tc-prop-body">
              <b>시험 목적</b>
              <p>{prop.object_md || '(모델이 비워 두었습니다)'}</p>
              <b>사전 준비 조건</b>
              <pre>{prop.precondition_md || '(모델이 비워 두었습니다)'}</pre>
            </div>
          </div>
        )}

        <textarea
          className="tc-text"
          rows={3}
          value={data.object_md ?? ''}
          placeholder="예) E6100 의 포트별 rate limit 이 설정값대로 동작하는지 확인한다."
          onChange={(e) => onChange({ object_md: e.target.value })}
        />
      </section>

      <section className="tc-card">
        <div className="tc-card-head">
          <b>사전 준비 조건</b>
          <span className="muted small">시작하기 전에 되어 있어야 하는 것</span>
        </div>
        <textarea
          className="tc-text"
          rows={3}
          value={data.precondition_md ?? ''}
          placeholder={'예)\n- OLT 와 ONT 가 링크업 되어 있을 것'}
          onChange={(e) => onChange({ precondition_md: e.target.value })}
        />
      </section>
    </div>
  )
}
