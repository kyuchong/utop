import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiFetch, tcApi } from '@/api/client'
import { reqLabel, reqPk, type TestCaseMeta } from '@/types'
import { useCodes } from '@/hooks/useCodes'
import { missingRequired, useCustomFields } from '@/hooks/useCustomFields'
import CustomFieldInputs from './CustomFieldInputs'
import './ReqForm.css'

interface Props {
  /** null 이면 새로 만들기, 값이 있으면 그 TC 편집 */
  editing: TestCaseMeta | null
  /** 새로 만들 때 미리 연결해 둘 요구사항 (요구사항 화면의 「+ TC 생성」) */
  presetReqId?: string
  /** 새로 만들 때 **무엇을 덮는가** — Jira 이슈 키(Releases 에서 연다).
   *  요구사항(presetReqId)과 같은 자리의 값이다: 이 시험이 왜 있는가. */
  presetIssue?: string
  /** 새로 만들 때 모델을 미리 골라 둔다 — 프로젝트가 아는 값이라 사람에게
   *  두 번 묻지 않는다. 고를 수는 있다. */
  presetMg?: string
  presetModel?: string
  /** 새로 만들고 나면 그 시험을 연다 — 만들기는 곧 세부 작성의 시작이다 */
  onCreated?: (tcid: string) => void
  onClose: () => void
}

const FB_STATUS = ['작성중', '검토중', '승인', 'PASS', 'FAIL', '보류']
const FB_SEVERITY = ['치명', '중대', '보통', '경미']
const FB_TYPE = ['FT', 'Function']
const FB_RUN_TYPE = ['수동', '자동']
const FB_ORIGIN = ['자체', '고객']
/** 「공용으로 하겠다」 는 명시적 선택 — 빈 값(안 고름)과 갈라야 필수가 된다 */
const COMMON = '*'

export default function TcForm({
  editing, presetReqId, presetIssue, presetMg, presetModel, onCreated, onClose,
}: Props) {
  const qc = useQueryClient()
  const isNew = editing === null

  const [tcid, setTcid] = useState('')
  const [name, setName] = useState('')
  const [reqId, setReqId] = useState('')
  const [type, setType] = useState('')
  const STATUSES = useCodes('tc_status', FB_STATUS)
  const SEVERITIES = useCodes('tc_severity', FB_SEVERITY)
  const TYPES = useCodes('tc_type', FB_TYPE)
  const [status, setStatus] = useState(FB_STATUS[0]!)
  const [severity, setSeverity] = useState(FB_SEVERITY[1]!)
  const RUN_TYPES = useCodes('tc_run_type', FB_RUN_TYPE)
  const ORIGINS = useCodes('tc_origin', FB_ORIGIN)
  const [runType, setRunType] = useState('')
  const [origin, setOrigin] = useState('')
  /** 적용 모델 — 모델마다 인터페이스가 달라 CLI·판정기준이 갈린다.
      새로 만들 때는 필수다(공용도 '공용' 을 골라야 지나간다). */
  const [mg, setMg] = useState('')
  const [mdl, setMdl] = useState('')
  const [error, setError] = useState('')
  /** 요구사항 검색 콤보 — 수백 건을 셀렉트로 늘어놓으면 못 고른다 */
  const [reqOpen, setReqOpen] = useState(false)
  const [reqText, setReqText] = useState('')
  // 설정 → 커스텀 필드에서 팀이 늘린 칸. 값은 data->'custom' 에 산다.
  const [custom, setCustom] = useState<Record<string, unknown>>({})
  const cf = useCustomFields('tc')

  useEffect(() => {
    setTcid(editing?.tcid ?? '')
    // 새 ID 는 아래의 딴 effect 가 받는다 — 모델그룹에 따라 앞머리가
    // 갈리므로 모델그룹을 고를 때마다 다시 물어야 한다.

    /* **제목은 비운 채로 시작한다.** 요구사항 제목도 이슈 제목도 베끼지
       않는다 — 요구사항 하나에 시험이 셋이면 셋 다 이름이 같아지고,
       목록에서 무엇을 확인하는 시험인지 알 수 없다. 사람이 짓는다. */
    setName(editing?.name ?? '')
    setReqId(editing?.req_id ?? presetReqId ?? '')
    setType(editing?.type ?? '')
    setStatus(editing?.status || FB_STATUS[0]!)
    setSeverity(editing?.severity || FB_SEVERITY[1]!)
    setRunType(String(editing?.run_type ?? ''))
    setOrigin(String(editing?.origin ?? ''))
    // 기존 것: 빈 값 = 공용으로 이미 저장된 상태라 그대로 보여준다
    setMg(editing ? String(editing.model_group ?? '') || COMMON : (presetMg ?? ''))
    setMdl(editing ? String(editing.model ?? '') || COMMON : (presetModel ?? ''))
    // 화면에 안 보이는 칸의 값까지 통째로 들고 있다가 그대로 돌려보낸다.
    // 저장이 data 를 통째로 덮어쓰므로(main.py:save_tc) 여기서 빠뜨리면
    // 숨긴 칸의 값이 조용히 사라진다.
    const c = editing?.custom
    setCustom(c && typeof c === 'object' ? { ...(c as Record<string, unknown>) } : {})
    setError('')
  }, [editing, presetReqId, presetMg, presetModel])

  const reqQ = useQuery({
    queryKey: ['req', 'list'],
    queryFn: ({ signal }) => api.listRequirements(signal),
  })
  const reqs = reqQ.data?.reqs ?? []

  /** 적용 모델 선택지 — 카탈로그가 정본 (손으로 치면 표기가 갈린다) */
  /* 새 ID — **모델그룹**이 앞머리다(E61xx_T0001). 모델그룹을 고를 때마다
     다시 받는다. tcid 는 곧 PK 라 사람이 못 바꾼다 — 손으로 바꾸면 남의
     시험을 덮거나 플랜·실행 이력의 참조가 끊긴다. */
  useEffect(() => {
    if (editing !== null) return
    let dead = false
    void (async () => {
      try {
        const g = mg && mg !== COMMON ? mg : ''
        /* **번호 계열**(합의) — 요구사항을 덮는 시험은 T, Jira 이슈를 덮는
           시험은 V 다(E61xx_V0001). 번호만 봐도 어느 목록에 있는 것인지
           알아야 한쪽 화면에서 안 보일 때 「어디 갔지」 가 안 생긴다. */
        const k = presetIssue ? 'V' : 'T'
        const r = await apiFetch(`/api/tc-next-id?mg=${encodeURIComponent(g)}&kind=${k}`)
        const j = (await r.json()) as { tcid?: string }
        if (!dead && j.tcid) setTcid(j.tcid)
      } catch {
        /* 실패해도 저장할 때 사람이 볼 수 있게 빈 칸으로 둔다 */
      }
    })()
    return () => {
      dead = true
    }
  }, [editing, mg])

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
    (m) =>
      !mg || mg === COMMON || (rolesQ.data?.model_info?.[m]?.model_group ?? '') === mg,
  )

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['tc', 'list', 'meta'] })
    void qc.invalidateQueries({ queryKey: ['req', 'list'] })
  }
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e))

  const saveM = useMutation({
    mutationFn: () =>
      // tcid 가 곧 PK 다(REQ 와 달리 별도 PK 가 없다). 그래서 편집 중에는
      // tcid 를 바꾸지 못하게 막는다 — 바꾸면 새 TC 가 생기고 원본이 남는다.
      tcApi.save(isNew ? tcid.trim() : editing.tcid, {
        tcid: isNew ? tcid.trim() : editing.tcid,
        name: name.trim(),
        req_id: reqId || '',
        type: type.trim(),
        status,
        severity,
        run_type: runType,
        origin,
        // '*'(공용) 는 빈 값으로 저장 — 플랜 필터의 「미지정 = 공용」 규칙
        model_group: mg === COMMON ? '' : mg,
        model: mdl === COMMON ? '' : mdl,
        /* 어느 이슈 때문에 생긴 시험인지 남긴다 — 시험 쪽에서만 보면
           까닭을 알 길이 없다. 새로 만들 때만 붙인다. */
        ...(isNew && presetIssue ? { jira_issue_key: presetIssue } : {}),
        custom,
      }),
    onSuccess: () => {
      invalidate()
      // 새로 만든 것은 바로 열어 세부(스텝·토폴로지)를 이어 적게 한다
      if (isNew && onCreated) onCreated(tcid.trim())
      onClose()
    },
    onError: fail,
  })

  const removeM = useMutation({
    mutationFn: () => tcApi.remove(editing!.tcid),
    onSuccess: () => {
      invalidate()
      onClose()
    },
    onError: fail,
  })

  const submit = () => {
    if (isNew && !tcid.trim()) {
      setError('TC ID 를 입력하세요')
      return
    }
    if (!name.trim()) {
      setError('제목을 입력하세요')
      return
    }
    // 새 항목은 모델을 고정한다(합의 2026-08-16) — 실행 판정 기준이 모델마다
    // 달라 공용은 판정이 흔들린다. 기존 항목 편집은 막지 않는다
    if (isNew && (!mg || mg === COMMON)) {
      setError('모델그룹을 고르세요 — 새 항목은 모델을 고정합니다 (공용 불가)')
      return
    }
    if (isNew && (!mdl || mdl === COMMON)) {
      setError('모델명을 고르세요 — 새 항목은 모델을 고정합니다')
      return
    }
    // 필수는 보이는 칸만 따진다. 숨긴 칸을 필수로 걸어두면 고칠 방법이
    // 없는 채로 저장이 막힌다.
    const miss = missingRequired(cf.inForm, custom)
    if (miss) {
      setError(`'${miss}' 을 입력하세요`)
      return
    }
    saveM.mutate()
  }

  const doDelete = () => {
    if (!window.confirm(`'${editing!.tcid}' 를 삭제합니다. 계속할까요?`)) return
    removeM.mutate()
  }

  const busy = saveM.isPending || removeM.isPending

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div
        className="modal tcf"
        role="dialog"
        aria-modal="true"
        aria-label={isNew ? '테스트케이스 추가' : '테스트케이스 편집'}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <b>{isNew ? '테스트케이스 추가' : '테스트케이스 편집'}</b>
          <button className="modal-x" type="button" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="form-error">{error}</div>}

          {/* Info 탭의 「기본」 카드와 같은 차례 — 만들 때 본 화면과 만들고
              나서 보는 화면이 같아야 눈이 헤매지 않는다. */}
          <div className="frow tcf-2">
            <label className="fld">
              <span>요구사항 ID</span>
              <input
                value={(() => {
                  const r = reqs.find((x) => reqPk(x) === reqId)
                  return r ? reqLabel(r) : '–'
                })()}
                readOnly
                className="ro"
                tabIndex={-1}
              />
            </label>
            <div className="fld tcf-reqc">
              <span>요구사항 제목 (검색 · 선택)</span>
              <input
                value={
                  reqOpen
                    ? reqText
                    : (() => {
                        const r = reqs.find((x) => reqPk(x) === reqId)
                        return r ? r.title || reqLabel(r) : '(연결 안 함)'
                      })()
                }
                placeholder="이름·ID 로 찾기"
                onFocus={() => {
                  setReqOpen(true)
                  setReqText('')
                }}
                onChange={(e) => setReqText(e.target.value)}
                onBlur={() => window.setTimeout(() => setReqOpen(false), 150)}
              />
              {reqOpen && (
                <div className="tcf-reqlist">
                  <button type="button" onMouseDown={() => setReqId('')}>
                    (연결 안 함)
                  </button>
                  {reqs
                    .filter((r) => {
                      const n = reqText.trim().toLowerCase()
                      if (!n) return true
                      return `${reqLabel(r)} ${r.title ?? ''}`.toLowerCase().includes(n)
                    })
                    .slice(0, 50)
                    .map((r) => (
                      <button
                        key={reqPk(r)}
                        type="button"
                        className={reqPk(r) === reqId ? 'on' : ''}
                        onMouseDown={() => setReqId(reqPk(r))}
                      >
                        <b>{r.title || '(제목 없음)'}</b>
                        <i>{reqLabel(r)}</i>
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>

          <div className="frow tcf-2">
            <label className="fld">
              <span>시험항목 ID {isNew ? '· 자동 부여' : '· 고정'}</span>
              <input
                value={tcid || (isNew ? '자동 부여 중…' : '')}
                readOnly
                className="ro"
                title="시험 ID 는 자동으로 매겨지며 수정할 수 없습니다"
                tabIndex={-1}
              />
            </label>
            <label className="fld">
              <span>시험항목 제목</span>
              <input
                autoFocus
                value={name}
                placeholder="E6100 10G Rate Limit 검증 (1518B)"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          </div>

          {/* 값 일곱을 한 줄에 — 모델그룹·모델명은 필수다. 모델마다
              인터페이스가 달라 CLI·판정기준이 갈리는 현실의 답. */}
          <div className="tcf-7">
            <label className="fld">
              <span>모델그룹 *</span>
              <select
                value={mg}
                onChange={(e) => {
                  const v = e.target.value
                  setMg(v)
                  setMdl(v === COMMON ? COMMON : '')
                }}
              >
                <option value="">(골라 주세요)</option>
                <option value={COMMON}>공용 (전체)</option>
                {(rolesQ.data?.groups ?? []).map((g) => (
                  <option key={g}>{g}</option>
                ))}
                {mg && mg !== COMMON && !(rolesQ.data?.groups ?? []).includes(mg) && (
                  <option value={mg}>{mg} (목록에 없음)</option>
                )}
              </select>
            </label>
            <label className="fld">
              <span>모델명 *</span>
              <select
                value={mdl}
                disabled={mg === COMMON}
                onChange={(e) => setMdl(e.target.value)}
              >
                <option value="">(골라 주세요)</option>
                <option value={COMMON}>{mg === COMMON ? '공용' : '(그룹 공용)'}</option>
                {modelOpts.map((m) => (
                  <option key={m}>{m}</option>
                ))}
                {mdl && mdl !== COMMON && !modelOpts.includes(mdl) && (
                  <option value={mdl}>{mdl} (목록에 없음)</option>
                )}
              </select>
            </label>
            <label className="fld">
              <span>실행 타입</span>
              <select value={runType} onChange={(e) => setRunType(e.target.value)}>
                <option value="">(선택)</option>
                {RUN_TYPES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="fld">
              <span>유형</span>
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">(선택)</option>
                {TYPES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="fld">
              <span>발생 구분</span>
              <select value={origin} onChange={(e) => setOrigin(e.target.value)}>
                <option value="">(선택)</option>
                {ORIGINS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="fld">
              <span>상태</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="fld">
              <span>심각도</span>
              <select value={severity} onChange={(e) => setSeverity(e.target.value)}>
                {SEVERITIES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>

          <CustomFieldInputs
            fields={cf.inForm}
            values={custom}
            onChange={(k, v) => setCustom((c) => ({ ...c, [k]: v }))}
          />

          {isNew && presetIssue && (
            <div className="hint">
              이 시험은 <b>{presetIssue}</b> 를 덮습니다 — 제목은 「무엇을 확인하는가」 로
              적으세요(이슈 제목을 그대로 옮기지 않습니다).
            </div>
          )}
          {isNew ? (
            <div className="hint">
              저장하면 이 시험이 바로 열립니다 — 스텝·토폴로지 같은 세부는 거기서 적습니다.
            </div>
          ) : (
            <div className="hint">
              시험 절차 {editing._cli_count ?? 0}스텝은 이 창에서 고치지 않습니다. 지금
              저장해도 기존 스텝은 그대로 보존됩니다.
            </div>
          )}
        </div>

        <div className="modal-foot">
          <span>
            {!isNew && (
              <button
                className="btn danger"
                type="button"
                onClick={doDelete}
                disabled={busy}
              >
                삭제
              </button>
            )}
          </span>
          <span className="page-head-actions">
            <button className="btn" type="button" onClick={onClose} disabled={busy}>
              취소
            </button>
            <button className="btn primary" type="button" onClick={submit} disabled={busy}>
              {busy ? '저장 중…' : '저장'}
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}
