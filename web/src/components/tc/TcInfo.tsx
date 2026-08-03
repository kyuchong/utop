import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { useCodes } from '@/hooks/useCodes'
import { useCustomFields } from '@/hooks/useCustomFields'
import CustomFieldInputs from '../CustomFieldInputs'
import type { TcData } from './types'
import './tc.css'

// 서버가 아직 값을 안 준 첫 렌더에서 드롭다운이 비지 않도록 하는 기본값.
// 진짜 목록은 설정 → TC INFO 필드에 있다.
const FB_STATUS = ['작성중', '검토중', '승인', 'PASS', 'FAIL', '보류']
const FB_SEVERITY = ['치명', '중대', '보통', '경미']
const FB_RUN_TYPE = ['수동', '자동', '혼합']
const FB_TYPE = ['FT', 'Function']
const FB_ORIGIN = ['자체', '고객']

interface Props {
  data: TcData
  onChange: (patch: Partial<TcData>) => void
  /** 지금 열려 있는 TC. 목적을 뽑아 달라고 할 때 필요하다 */
  tcid: string
}

/**
 * 정보 탭 — 이 시험이 무엇인가.
 *
 * 3열 화면에는 Environment 탭이 없다(장비는 실행 줄의 세션 칩이 맡는다).
 * 그래서 거기 있던 시험 목적·사전 준비 조건도 여기로 들어온다 — 어느
 * 탭에도 없으면 옛 화면으로 돌아가야 고칠 수 있다.
 */
export default function TcInfo({ data, onChange, tcid }: Props) {
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
  const [llm, setLlm] = useState(() => localStorage.getItem('utop.tc.llm') || '')

  const llmQ = useQuery({
    queryKey: ['llm-choices'],
    queryFn: async () => {
      const r = await apiFetch('/api/llm-choices')
      if (!r.ok) throw new Error('LLM 목록을 불러오지 못했습니다')
      return (await r.json()) as {
        choices?: Array<{ id: string; name: string; model?: string; local?: boolean }>
      }
    },
    staleTime: 60_000,
  })
  const choices = llmQ.data?.choices ?? []

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

  const STATUSES = useCodes('tc_status', FB_STATUS)
  const SEVERITIES = useCodes('tc_severity', FB_SEVERITY)
  const RUN_TYPES = useCodes('tc_run_type', FB_RUN_TYPE)
  const TYPES = useCodes('tc_type', FB_TYPE)
  const ORIGINS = useCodes('tc_origin', FB_ORIGIN)
  const cf = useCustomFields('tc')

  const custom = (data.custom as Record<string, unknown>) ?? {}

  const pick = (
    label: string,
    key: 'status' | 'run_type' | 'severity' | 'type' | 'origin',
    opts: string[],
  ) => (
    <label className="fld">
      <span>{label}</span>
      <select value={data[key] ?? ''} onChange={(e) => onChange({ [key]: e.target.value })}>
        <option value="">(선택)</option>
        {opts.map((s) => (
          <option key={s}>{s}</option>
        ))}
        {/* 설정에서 지운 값이 이미 저장돼 있을 수 있다. 자리를 만들지 않으면
            다른 칸을 고치는 순간 조용히 빈 값이 된다. */}
        {data[key] && !opts.includes(String(data[key])) && (
          <option value={String(data[key])}>{String(data[key])} (없는 값)</option>
        )}
      </select>
    </label>
  )

  return (
    <div className="tc-pane">
      <section className="tc-card">
        <div className="tc-card-head">
          <b>기본</b>
        </div>
        {/* 윗줄은 '무엇에 대한 시험인가', 아랫줄은 '어떤 시험인가'.
            요구사항과 제목은 글이라 넓게, 고르는 값 다섯은 좁게 한 줄에
            나란히 둔다 — 한 격자에 섞어 흘려보내면 제목이 셀렉트만큼
            좁아져서 긴 제목을 못 읽는다. */}
        <div className="tc-grid tc-grid-2">
          <label className="fld">
            <span>요구사항</span>
            <input
              value={data.req_id ?? ''}
              onChange={(e) => onChange({ req_id: e.target.value })}
            />
          </label>
          <label className="fld">
            <span>제목</span>
            <input
              value={data.name ?? ''}
              placeholder="시험 제목"
              onChange={(e) => onChange({ name: e.target.value })}
            />
          </label>
        </div>

        <div className="tc-grid tc-grid-5">
          {pick('상태', 'status', STATUSES)}
          {pick('실행 타입', 'run_type', RUN_TYPES)}
          {pick('심각도', 'severity', SEVERITIES)}
          {pick('유형', 'type', TYPES)}
          {pick('발생 구분', 'origin', ORIGINS)}
        </div>
      </section>

      <section className="tc-card">
        <div className="tc-card-head">
          <b>시험 목적</b>
          <span className="muted small">무엇을 확인하는 시험인가</span>
          {/* 스텝은 캡쳐로 만들어지는데 이 글은 여전히 손으로 써야 했다.
              스텝을 읽고 대신 쓰게 한다 — 반대 방향(목적 → 스텝)은 이미
              「AI 로 만들기」 가 하고 있다. */}
          {choices.length > 1 && (
            <select
              className="tc-llm"
              value={llm}
              title="누구에게 맡길지"
              onChange={(e) => {
                setLlm(e.target.value)
                localStorage.setItem('utop.tc.llm', e.target.value)
              }}
            >
              <option value="">자동</option>
              {choices.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.local ? '🏠 ' : '☁ '}
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <button
            className="btn small"
            type="button"
            disabled={askM.isPending || stepCount === 0}
            title={
              stepCount === 0
                ? '스텝이 있어야 그것을 읽고 쓸 수 있습니다'
                : `스텝 ${stepCount}개를 읽고 목적과 사전조건을 씁니다`
            }
            onClick={() => askM.mutate()}
          >
            {askM.isPending ? '읽는 중…' : '✨ 스텝을 보고 쓰기'}
          </button>
        </div>

        {err && <div className="tc-err">{err}</div>}

        {prop && (
          <div className="tc-prop">
            <div className="tc-prop-head">
              <b>이렇게 쓸까요</b>
              <span className="muted small">스텝 {stepCount}개를 읽었습니다</span>
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

      {/* 설정 → 커스텀 필드에서 늘린 칸. 기본 칸과 한 카드에 섞으면 어디까지가
          원래 있던 것인지 알 수 없어 카드를 나눈다. */}
      {cf.inForm.length > 0 && (
        <section className="tc-card">
          <div className="tc-card-head">
            <b>추가 항목</b>
            <span className="muted small">설정 → 커스텀 필드에서 정합니다</span>
          </div>
          <div className="tc-grid">
            <CustomFieldInputs
              flat
              fields={cf.inForm}
              values={custom}
              onChange={(k, v) => onChange({ custom: { ...custom, [k]: v } })}
            />
          </div>
        </section>
      )}

      <section className="tc-card">
        <div className="tc-card-head">
          <b>기록</b>
          <span className="muted small">저장할 때 서버가 남깁니다</span>
        </div>
        <div className="tc-grid ro">
          <div>
            <span className="muted small">생성자</span>
            <b>{data.created_by || '–'}</b>
          </div>
          <div>
            <span className="muted small">생성일</span>
            <b>{(data.created_at || '').slice(0, 16).replace('T', ' ') || '–'}</b>
          </div>
          <div>
            <span className="muted small">변경자</span>
            <b>{data.updated_by || '–'}</b>
          </div>
          <div>
            <span className="muted small">변경일</span>
            <b>{(data.updated_at || '').slice(0, 16).replace('T', ' ') || '–'}</b>
          </div>
        </div>
      </section>
    </div>
  )
}
