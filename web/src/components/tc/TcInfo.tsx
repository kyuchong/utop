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
}

/**
 * 정보 탭 — 이 시험이 무엇인가.
 *
 * 3열 화면에는 Environment 탭이 없다(장비는 실행 줄의 세션 칩이 맡는다).
 * 그래서 거기 있던 시험 목적·사전 준비 조건도 여기로 들어온다 — 어느
 * 탭에도 없으면 옛 화면으로 돌아가야 고칠 수 있다.
 */
export default function TcInfo({ data, onChange }: Props) {
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
        <div className="tc-grid">
          <label className="fld">
            <span>제목</span>
            <input
              value={data.name ?? ''}
              placeholder="시험 제목"
              onChange={(e) => onChange({ name: e.target.value })}
            />
          </label>
          {pick('상태', 'status', STATUSES)}
          {pick('실행 타입', 'run_type', RUN_TYPES)}
          {pick('심각도', 'severity', SEVERITIES)}
          {pick('유형', 'type', TYPES)}
          {pick('발생 구분', 'origin', ORIGINS)}
          <label className="fld">
            <span>요구사항</span>
            <input
              value={data.req_id ?? ''}
              onChange={(e) => onChange({ req_id: e.target.value })}
            />
          </label>
        </div>
      </section>

      <section className="tc-card">
        <div className="tc-card-head">
          <b>시험 목적</b>
          <span className="muted small">무엇을 확인하는 시험인가</span>
        </div>
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
