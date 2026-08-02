import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, tcApi } from '@/api/client'
import TcEnvironment from './TcEnvironment'
import TcTopology from './TcTopology'
import TcSteps from './TcSteps'
import type { TcData } from './types'
import './tc.css'

type Tab = 'info' | 'env' | 'topo' | 'manual' | 'auto' | 'runs'

const TABS: Array<{ k: Tab; label: string }> = [
  { k: 'info', label: 'Info' },
  { k: 'env', label: 'Environment' },
  { k: 'topo', label: 'Topology' },
  { k: 'manual', label: 'Manual Step' },
  { k: 'auto', label: 'Automation' },
  { k: 'runs', label: 'Execution History' },
]

const STATUSES = ['작성중', '검토중', '승인', 'PASS', 'FAIL', '보류']
const SEVERITIES = ['치명', '중대', '보통', '경미']
const RUN_TYPES = ['수동', '자동', '혼합']

interface Props {
  tcid: string
  onClose: () => void
}

/**
 * TC 상세.
 *
 * 목록에서 TC 를 누르면 열린다. 예전처럼 작은 팝업에 다 밀어넣지 않고
 * 탭으로 나눈다 — 스텝 하나가 화면 절반을 쓰기 때문에 같이 두면 아무것도
 * 제대로 못 본다.
 *
 * 저장은 탭 전체를 한 번에 한다. 탭마다 저장하면 어디까지 저장됐는지
 * 알 수 없고, 슬롯을 지운 뒤 스텝을 안 고치면 어긋난 채로 남는다.
 */
export default function TcDetail({ tcid, onClose }: Props) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('info')
  const [d, setD] = useState<TcData>({})
  const [dirty, setDirty] = useState(false)
  const [msg, setMsg] = useState<{ kind: string; text: string }>({ kind: '', text: '' })

  const tcQ = useQuery({
    queryKey: ['tc', tcid],
    queryFn: async () => {
      const r = await apiFetch(`/api/tc/${encodeURIComponent(tcid)}`)
      if (!r.ok) throw new Error('TC 를 불러오지 못했습니다')
      return (await r.json()) as TcData
    },
  })

  useEffect(() => {
    if (tcQ.data) {
      setD(tcQ.data)
      setDirty(false)
    }
  }, [tcQ.data])

  const patch = (p: Partial<TcData>) => {
    setD((c) => ({ ...c, ...p }))
    setDirty(true)
  }

  const saveM = useMutation({
    mutationFn: async () => {
      // checks 를 항상 함께 보낸다. 빠지면 서버가 옛 값을 되살려
      // 방금 지운 스텝이 다시 나타난다(main.py 의 보존 장치).
      await tcApi.save(tcid, { ...d, checks: d.checks ?? [] })
    },
    onSuccess: () => {
      setDirty(false)
      setMsg({ kind: 'ok', text: '저장했습니다' })
      void qc.invalidateQueries({ queryKey: ['tc', tcid] })
      void qc.invalidateQueries({ queryKey: ['tc', 'list', 'meta'] })
    },
    onError: (e) => setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) }),
  })

  const close = () => {
    if (dirty && !window.confirm('저장하지 않은 변경이 있습니다. 닫을까요?')) return
    onClose()
  }

  const counts = {
    manual: (d.checks ?? []).filter((s) => (s.kind ?? 'manual') === 'manual').length,
    auto: (d.checks ?? []).filter((s) => s.kind === 'auto').length,
    slots: (d.slots ?? []).length,
  }

  return (
    <div className="tc-detail">
      <div className="tc-head">
        <button className="btn small" type="button" onClick={close}>
          ← 목록
        </button>
        <b className="tc-id">{tcid}</b>
        <input
          className="tc-name"
          value={d.name ?? ''}
          placeholder="시험 제목"
          onChange={(e) => patch({ name: e.target.value })}
        />
        <span className="page-head-actions">
          {msg.text && <span className={`muted small ${msg.kind}`}>{msg.text}</span>}
          <button
            className="btn primary"
            type="button"
            disabled={saveM.isPending || !dirty}
            onClick={() => saveM.mutate()}
          >
            {saveM.isPending ? '저장 중…' : dirty ? '저장' : '저장됨'}
          </button>
        </span>
      </div>

      <div className="tc-tabs">
        <div className="seg" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.k}
              type="button"
              role="tab"
              aria-selected={tab === t.k}
              className={`seg-btn${tab === t.k ? ' on' : ''}`}
              onClick={() => setTab(t.k)}
            >
              {t.label}
              {t.k === 'env' && counts.slots > 0 && <span className="cnt">{counts.slots}</span>}
              {t.k === 'manual' && counts.manual > 0 && (
                <span className="cnt">{counts.manual}</span>
              )}
              {t.k === 'auto' && counts.auto > 0 && <span className="cnt">{counts.auto}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="tc-body">
        {tcQ.isLoading ? (
          <div className="empty">불러오는 중…</div>
        ) : tcQ.error ? (
          <div className="load-error">{(tcQ.error as Error).message}</div>
        ) : tab === 'info' ? (
          <div className="tc-pane">
            <section className="tc-card">
              <div className="tc-card-head">
                <b>기본</b>
              </div>
              <div className="tc-grid">
                <label className="fld">
                  <span>상태</span>
                  <select
                    value={d.status ?? ''}
                    onChange={(e) => patch({ status: e.target.value })}
                  >
                    <option value="">(선택)</option>
                    {STATUSES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="fld">
                  <span>실행 타입</span>
                  <select
                    value={d.run_type ?? ''}
                    onChange={(e) => patch({ run_type: e.target.value })}
                  >
                    <option value="">(선택)</option>
                    {RUN_TYPES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="fld">
                  <span>심각도</span>
                  <select
                    value={d.severity ?? ''}
                    onChange={(e) => patch({ severity: e.target.value })}
                  >
                    <option value="">(선택)</option>
                    {SEVERITIES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="fld">
                  <span>타입</span>
                  <input
                    value={d.type ?? ''}
                    placeholder="FT · Function"
                    onChange={(e) => patch({ type: e.target.value })}
                  />
                </label>
                <label className="fld">
                  <span>고객사</span>
                  <input
                    value={d.customer ?? ''}
                    onChange={(e) => patch({ customer: e.target.value })}
                  />
                </label>
                <label className="fld">
                  <span>발생 구분</span>
                  <input
                    value={d.origin ?? ''}
                    placeholder="자체 · 고객"
                    onChange={(e) => patch({ origin: e.target.value })}
                  />
                </label>
                <label className="fld">
                  <span>요구사항</span>
                  <input
                    value={d.req_id ?? ''}
                    onChange={(e) => patch({ req_id: e.target.value })}
                  />
                </label>
              </div>
            </section>

            <section className="tc-card">
              <div className="tc-card-head">
                <b>이력</b>
                <span className="muted small">저장할 때 서버가 남깁니다</span>
              </div>
              <div className="tc-grid ro">
                <div>
                  <span className="muted small">생성자</span>
                  <b>{d.created_by || '–'}</b>
                </div>
                <div>
                  <span className="muted small">생성일</span>
                  <b>{(d.created_at || '').slice(0, 16).replace('T', ' ') || '–'}</b>
                </div>
                <div>
                  <span className="muted small">변경자</span>
                  <b>{d.updated_by || '–'}</b>
                </div>
                <div>
                  <span className="muted small">변경일</span>
                  <b>{(d.updated_at || '').slice(0, 16).replace('T', ' ') || '–'}</b>
                </div>
              </div>
            </section>
          </div>
        ) : tab === 'env' ? (
          <TcEnvironment data={d} onChange={patch} />
        ) : tab === 'topo' ? (
          <TcTopology data={d} onChange={patch} />
        ) : tab === 'manual' ? (
          <TcSteps mode="manual" data={d} onChange={patch} />
        ) : tab === 'auto' ? (
          <TcSteps mode="auto" data={d} onChange={patch} />
        ) : (
          <div className="tc-pane">
            <div className="empty">
              실행 이력은 시험을 돌리기 시작하면 쌓입니다. 실행 엔진을 붙인 뒤 채웁니다.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
