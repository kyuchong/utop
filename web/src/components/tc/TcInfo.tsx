import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { api, categoryApi, projectApi } from '@/api/client'
import { goto } from '@/api/goto'
import InfoPane from '@/components/info/InfoPane'
import { reqLabel, reqPk } from '@/types'
import { useCodes } from '@/hooks/useCodes'
import { useCustomFields } from '@/hooks/useCustomFields'
import type { TcData } from './types'
import './tc.css'

// 서버가 아직 값을 안 준 첫 렌더에서 드롭다운이 비지 않도록 하는 기본값.
// 진짜 목록은 설정 → TC INFO 필드에 있다.
const FB_STATUS = ['작성중', '검토중', '승인', 'PASS', 'FAIL', '보류']
const FB_SEVERITY = ['치명', '중대', '보통', '경미']
const FB_RUN_TYPE = ['수동', '자동']
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
  /*
   * 요구사항 고르기 — **검색해서 고른다.**
   * 네이티브 셀렉트는 수십 건이 되면 스크롤로 훑는 수밖에 없다.
   * 글자를 치면 경로·이름으로 걸러진 것만 남는다.
   */

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
    /*
     * 경로는 **트리를 걸어 올라가** 만든다.
     *
     * cat1~4 를 그대로 이어 붙였더니, 사슬이 덜 적힌 옛 자료는 경로가
     * 중간부터 시작해(「ENV › …」) 최상위 폴더 이름(「11. U-REQ-SYS」)이
     * 붙은 것과 안 붙은 것이 섞였다 — 숫자가 있다 없다 해 보였다.
     * 가장 깊은 분류에서 parent 를 거슬러 오르면 늘 최상위부터다.
     */
    const pathOf = (r: { cat1?: unknown; cat2?: unknown; cat3?: unknown; cat4?: unknown }) => {
      const deepest = String(r.cat4 || r.cat3 || r.cat2 || r.cat1 || '')
      const names: string[] = []
      let at: string | null = deepest || null
      const seen = new Set<string>()
      while (at && !seen.has(at)) {
        seen.add(at)
        const c = byId.get(at)
        if (!c) break
        names.unshift(c.name)
        at = (c.parent_id ?? null) as string | null
      }
      return names.join(' › ')
    }
    return (reqQ.data?.reqs ?? [])
      .map((r) => {
        const path = pathOf(r)
        return {
          pk: reqPk(r),
          // 폴더가 아예 없는 요구사항도 있다 — 빈 채로 두면 경로 있는
          // 것들 사이에서 「왜 얘만 없지」 가 된다. 미분류라고 적는다.
          label: `${path || '(미분류)'} › ${r.title || reqLabel(r) || '(제목 없음)'}`,
        }
      })
      .sort((a, b) => a.label.localeCompare(b.label, 'ko'))
  }, [reqQ.data, catQ.data])

  /** 지금 값이 목록에 없을 수도 있다(옛 자료는 라벨로 저장돼 있다) */
  const cur = String(data.req_id ?? '')
  /** 고른 요구사항의 사람이 읽는 ID (REQ-2633-0003) */
  const curReqId = useMemo(() => {
    const r = (reqQ.data?.reqs ?? []).find((x) => reqPk(x) === cur)
    return r ? reqLabel(r) || '' : ''
  }, [reqQ.data, cur])
  const known = reqOpts.some((o) => o.pk === cur)

  const STATUSES = useCodes('tc_status', FB_STATUS)
  const SEVERITIES = useCodes('tc_severity', FB_SEVERITY)
  const RUN_TYPES = useCodes('tc_run_type', FB_RUN_TYPE)
  const TYPES = useCodes('tc_type', FB_TYPE)
  const ORIGINS = useCodes('tc_origin', FB_ORIGIN)
  const cf = useCustomFields('tc')

  /** 적용 모델 선택지 — 카탈로그가 정본. 손으로 치게 두면 표기가 갈린다 */
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
  const mg = String(data.model_group ?? '')
  const modelOpts = (rolesQ.data?.models ?? []).filter(
    (m) => !mg || (rolesQ.data?.model_info?.[m]?.model_group ?? '') === mg,
  )

  const custom = (data.custom as Record<string, unknown>) ?? {}


  /** 프로젝트 — 요구사항이 물고 있는 분류로 찾는다 */
  const prjQ = useQuery({
    queryKey: ['projects'],
    queryFn: ({ signal }) => projectApi.list(signal),
  })
  const curReq = (reqQ.data?.reqs ?? []).find((x) => reqPk(x) === cur)
  const catPath = useMemo(() => {
    if (!curReq) return ''
    const byId = new Map((catQ.data?.categories ?? []).map((c) => [c.id, c]))
    const names: string[] = []
    let at: string | null = String(
      (curReq as Record<string, unknown>).cat4 ||
        (curReq as Record<string, unknown>).cat3 ||
        (curReq as Record<string, unknown>).cat2 ||
        (curReq as Record<string, unknown>).cat1 ||
        '',
    )
    while (at) {
      const c = byId.get(at)
      if (!c) break
      names.unshift(c.name)
      at = (c.parent_id ?? null) as string | null
    }
    return names.join(' › ')
  }, [curReq, catQ.data])
  const prjName = useMemo(() => {
    const cats = new Set(
      ['cat1', 'cat2', 'cat3', 'cat4']
        .map((k) => String((curReq as Record<string, unknown> | undefined)?.[k] ?? ''))
        .filter(Boolean),
    )
    const p = (prjQ.data?.projects ?? []).find((x) => cats.has(String(x.cat_id ?? '')))
    return p ? [p.customer, p.model_group, p.model].filter(Boolean).join(' · ') : ''
  }, [prjQ.data, curReq])

  const F = (key: string, label: string, opts: string[]) => ({
    key,
    label,
    value: String((data as Record<string, unknown>)[key] ?? ''),
    options: opts,
    onChange: (v: string) => onChange({ [key]: v } as Partial<TcData>),
  })

  return (
    <InfoPane
      project={prjName}
      category={catPath}
      req={{
        id: cur,
        label: curReqId || (known ? '' : cur),
        title: curReq?.title ?? '',
        options: reqOpts.map((o) => ({ id: o.pk, title: o.label })),
        onPick: (id) => onChange({ req_id: id } as Partial<TcData>),
        onGo: (id) => goto('req', id),
        hint: '이 시험항목이 매달릴 요구사항입니다 — 바꾸면 연결이 옮겨집니다',
      }}
      tc={{
        id: String(data.tcid ?? ''),
        title: String(data.name ?? ''),
        options: [],
        onPick: () => {},
        onTitle: (v) => onChange({ name: v } as Partial<TcData>),
      }}
      modelGroup={{
        value: String(data.model_group ?? ''),
        options: rolesQ.data?.groups ?? [],
        onChange: (v) => onChange({ model_group: v, model: '' } as Partial<TcData>),
      }}
      model={{
        value: String(data.model ?? ''),
        options: modelOpts,
        onChange: (v) => onChange({ model: v } as Partial<TcData>),
      }}
      fields={[
        F('status', '상태', STATUSES),
        F('run_type', '실행 타입', RUN_TYPES),
        F('severity', '심각도', SEVERITIES),
        F('type', '유형', TYPES),
        F('origin', '발생 구분', ORIGINS),
      ]}
      custom={cf.inForm.map((f) => ({
        key: `cf_${f.key}`,
        label: f.label,
        value: String(custom[f.key] ?? ''),
        options:
          f.type === 'select' || f.type === 'multiselect'
            ? (f.options ?? '').split('\n').map((x: string) => x.trim()).filter(Boolean)
            : undefined,
        onChange: (v: string) =>
          onChange({ custom: { ...custom, [f.key]: v } } as unknown as Partial<TcData>),
      }))}
      record={{
        by: String(data.created_by ?? ''),
        at: String((data as Record<string, unknown>).created_at ?? ''),
        upBy: String(data.updated_by ?? ''),
        upAt: String((data as Record<string, unknown>).updated_at ?? ''),
      }}
    />
  )
}