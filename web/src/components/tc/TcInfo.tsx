import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, categoryApi } from '@/api/client'
import { reqLabel, reqPk } from '@/types'
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
  /**
   * 붙일 요구사항을 **고른다.**
   *
   * 전에는 날 PK(req-1781166316119)를 글자로 적게 두었다. 그 번호만 보고는
   * 어느 요구사항인지 알 수 없고, 한 글자만 틀려도 연결이 조용히 끊긴다.
   * 폴더 경로까지 붙여 목록으로 보여 준다.
   */
  const reqQ = useQuery({
    queryKey: ['req', 'list'],
    queryFn: ({ signal }) => api.listRequirements(signal),
  })
  const catQ = useQuery({
    queryKey: ['req-categories'],
    queryFn: ({ signal }) => categoryApi.list(signal),
  })
  const reqOpts = useMemo(() => {
    const byId = new Map((catQ.data?.categories ?? []).map((c) => [c.id, c]))
    return (reqQ.data?.reqs ?? [])
      .map((r) => {
        const path = [r.cat1, r.cat2, r.cat3, r.cat4]
          .filter(Boolean)
          .map((id) => byId.get(id as string)?.name ?? '')
          .filter(Boolean)
          .join(' › ')
        return {
          pk: reqPk(r),
          label: `${path ? path + ' › ' : ''}${r.title || reqLabel(r) || '(제목 없음)'}`,
        }
      })
      .sort((a, b) => a.label.localeCompare(b.label, 'ko'))
  }, [reqQ.data, catQ.data])

  /** 지금 값이 목록에 없을 수도 있다(옛 자료는 라벨로 저장돼 있다) */
  const cur = String(data.req_id ?? '')
  const known = reqOpts.some((o) => o.pk === cur)

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
            <select
              value={known ? cur : ''}
              onChange={(e) => onChange({ req_id: e.target.value })}
            >
              <option value="">(연결 안 함)</option>
              {/* 옛 자료가 목록에 없는 값을 들고 있으면 그것도 보여 준다 —
                  안 그러면 저장할 때 조용히 연결이 끊긴다 */}
              {!known && cur && <option value={cur}>{cur} (목록에 없음)</option>}
              {reqOpts.map((o) => (
                <option key={o.pk} value={o.pk}>
                  {o.label}
                </option>
              ))}
            </select>
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
