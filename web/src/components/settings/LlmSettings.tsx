import { useEffect, useState } from 'react'
import { apiFetch } from '@/api/client'
import ChatLlmSettings from './ChatLlmSettings'
import './LlmSettings.css'

interface RagCfg {
  embed_url: string
  embed_model: string
  rerank_url: string
  rerank_model: string
  use_embed: boolean
  use_rerank: boolean
  min_score: number
}

const EMPTY: RagCfg = {
  embed_url: '',
  embed_model: 'bge-m3',
  rerank_url: '',
  rerank_model: 'bge-reranker-v2-m3',
  use_embed: true,
  use_rerank: true,
  min_score: 0,
}

type Tab = 'chat' | 'embed' | 'rerank'

const TABS: Array<{ k: Tab; label: string }> = [
  { k: 'chat', label: 'Chat LLM' },
  { k: 'embed', label: '임베딩' },
  { k: 'rerank', label: '리랭커' },
]

/**
 * LLM 설정.
 *
 * 셋은 하는 일이 다르다 —
 *   Chat LLM : 답을 만든다. 화면마다 다른 모델을 쓰므로 여러 개를 등록한다.
 *   임베딩   : 질문·문서를 벡터로 바꿔 근거를 찾는다. 하나면 된다.
 *   리랭커   : 찾아온 근거의 순서를 다시 매긴다. 없어도 동작한다.
 *
 * 한 화면에 다 펼쳐 두면 Chat LLM 목록에 밀려 임베딩 주소가 화면 밖으로
 * 나간다. 그래서 탭으로 나눈다.
 *
 * 임베딩·리랭커는 저장되는 값이 옛 화면과 같다(embed_url / rerank_url /
 * 모델명 / 사용여부 / min_score) — 같아야 두 화면이 같은 설정을 본다.
 */
export default function LlmSettings() {
  const [tab, setTab] = useState<Tab>('chat')
  const [cfg, setCfg] = useState<RagCfg>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ kind: string; msg: string }>({ kind: '', msg: '' })
  const [probe, setProbe] = useState('')

  useEffect(() => {
    apiFetch('/api/rag/config')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('설정을 읽지 못했습니다'))))
      .then((d) => setCfg({ ...EMPTY, ...d }))
      .catch((e) => setNote({ kind: 'err', msg: e.message }))
      .finally(() => setLoading(false))
  }, [])

  const set = <K extends keyof RagCfg>(k: K, v: RagCfg[K]) =>
    setCfg((c) => ({ ...c, [k]: v }))

  const save = async (quiet = false) => {
    if (!quiet) setBusy(true)
    setNote({ kind: '', msg: '' })
    try {
      const res = await apiFetch('/api/rag/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error(b.detail || `저장 실패 (${res.status})`)
      }
      if (!quiet) setNote({ kind: 'ok', msg: '저장했습니다' })
    } catch (e) {
      setNote({ kind: 'err', msg: e instanceof Error ? e.message : String(e) })
    } finally {
      if (!quiet) setBusy(false)
    }
  }

  /**
   * 서버는 '저장된 설정' 으로 둘 다 한 번에 검사한다(/api/rag/test).
   * 그래서 확인 전에 저장부터 한다 — 안 그러면 방금 고친 주소가 아니라
   * 예전 주소를 검사해서, 고쳤는데 왜 안 되냐는 오해가 생긴다.
   *
   * 탭이 나뉘어 있어도 검사는 둘을 함께 한다. 서버 API 가 하나라서다.
   * 지금 보고 있는 탭의 결과를 앞에 놓는다.
   */
  const check = async (which: 'embed' | 'rerank') => {
    setBusy(true)
    setProbe('저장하고 확인하는 중…')
    try {
      await save(true)
      const res = await apiFetch('/api/rag/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      const b = await res.json().catch(() => ({}))
      const e = b.embed ?? {}
      const r = b.rerank ?? {}
      const embedMsg = `임베딩 ${e.ok ? `연결됨 (차원 ${e.dim})` : '실패'}`
      const rerankMsg = `리랭커 ${r.ok ? `연결됨 (${r.results}건)` : '실패'}`
      setProbe(which === 'embed' ? `${embedMsg} · ${rerankMsg}` : `${rerankMsg} · ${embedMsg}`)
    } catch (err) {
      setProbe(err instanceof Error ? err.message : '확인하지 못했습니다')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="empty">불러오는 중…</div>

  /** 임베딩·리랭커 탭은 칸 구성이 같다. 한 곳에서 그린다. */
  const serverTab = (which: 'embed' | 'rerank') => {
    const isEmbed = which === 'embed'
    return (
      <>
        <div className="set-head">
          <div>
            <h3>{isEmbed ? '임베딩 (Embedding)' : '리랭커 (Reranker)'}</h3>
            <p className="muted small">
              {isEmbed
                ? '질문과 문서를 벡터로 바꿔 의미로 찾습니다. 이것이 없으면 기존 TC·매뉴얼에서 근거를 찾지 못해, 모델이 CLI 명령을 지어냅니다.'
                : '찾아온 근거의 순서를 다시 매겨 정확도를 올립니다. 없어도 동작합니다.'}
            </p>
          </div>
          <label className="chk">
            <input
              type="checkbox"
              checked={isEmbed ? cfg.use_embed : cfg.use_rerank}
              onChange={(e) => set(isEmbed ? 'use_embed' : 'use_rerank', e.target.checked)}
            />
            사용
          </label>
        </div>

        {note.msg && <div className={`set-note ${note.kind}`}>{note.msg}</div>}

        <section className="set-card">
          <div className="set-card-head">
            <b>서버</b>
          </div>
          <label className="fld">
            <span>엔드포인트 URL</span>
            <input
              value={isEmbed ? cfg.embed_url : cfg.rerank_url}
              placeholder={isEmbed ? 'http://10.10.30.219:1000' : 'http://10.10.30.219:9081'}
              onChange={(e) => set(isEmbed ? 'embed_url' : 'rerank_url', e.target.value)}
            />
          </label>
          <label className="fld">
            <span>모델명</span>
            <input
              value={isEmbed ? cfg.embed_model : cfg.rerank_model}
              placeholder={isEmbed ? 'bge-m3' : 'bge-reranker-v2-m3'}
              onChange={(e) => set(isEmbed ? 'embed_model' : 'rerank_model', e.target.value)}
            />
          </label>
          <div className="hint">
            OpenAI 호환 서버를 가정합니다 — 주소 뒤에{' '}
            <code>{isEmbed ? '/v1/embeddings' : '/v1/rerank'}</code> 를 붙여 부릅니다.
          </div>
        </section>

        {/* 최소 점수는 임베딩 검색 결과를 거르는 값이라 이 탭에 둔다.
            리랭커 탭에도 두면 같은 값이 두 군데 보여 어느 쪽이 진짜인지
            헷갈린다. */}
        {isEmbed && (
          <section className="set-card">
            <div className="set-card-head">
              <b>검색</b>
            </div>
            <label className="fld">
              <span>최소 점수</span>
              <input
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={cfg.min_score}
                onChange={(e) => set('min_score', Number(e.target.value))}
              />
            </label>
            <div className="hint">
              이 점수보다 낮은 결과는 버립니다. 0 이면 전부 씁니다. 근거가 약한 문서까지
              모델에 넘기면 없는 명령을 지어내기 쉬워집니다.
            </div>
          </section>
        )}

        <div className="llm-foot">
          <span className="muted small">{probe}</span>
          <button className="btn" type="button" onClick={() => void check(which)} disabled={busy}>
            저장 후 연결테스트
          </button>
          <button
            className="btn primary"
            type="button"
            onClick={() => void save()}
            disabled={busy}
          >
            {busy ? '저장 중…' : '저장'}
          </button>
        </div>
        <div className="hint">
          확인을 누르면 먼저 저장한 뒤 서버가 실제로 한 번씩 불러 봅니다.
          사내망 밖에서는 실패하는 게 정상입니다.
        </div>
      </>
    )
  }

  return (
    // Chat LLM 은 목록과 상세를 나란히 두므로 기본 720px 로는 좁다.
    <div className={`set-page${tab === 'chat' ? ' wide' : ''}`}>
      <div className="seg" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.k}
            type="button"
            role="tab"
            aria-selected={tab === t.k}
            className={`seg-btn${tab === t.k ? ' on' : ''}`}
            onClick={() => {
              setTab(t.k)
              setProbe('')
              setNote({ kind: '', msg: '' })
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'chat' ? <ChatLlmSettings /> : serverTab(tab)}
    </div>
  )
}
