import { useEffect, useState } from 'react'
import { apiFetch } from '@/api/client'

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

/**
 * LLM 연결 설정 (Chat · 임베딩 · 리랭커).
 *
 * 항목은 옛 화면과 같은 것을 쓴다(embed_url / rerank_url / 모델명 /
 * 사용여부 / min_score) — 저장되는 값이 같아야 옛 화면과 새 화면이
 * 같은 설정을 본다.
 *
 * 사내 서버가 있어야 실제로 동작하므로, 저장과 별개로 '연결 확인' 을 둔다.
 * 주소를 적어두고 나중에 회사에서 눌러 보면 된다.
 */
export default function LlmSettings() {
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
   */
  const check = async () => {
    setBusy(true)
    setProbe('저장하고 확인하는 중…')
    try {
      await save(true)
      const res = await apiFetch('/api/rag/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const b = await res.json().catch(() => ({}))
      const e = b.embed ?? {}
      const r = b.rerank ?? {}
      setProbe(
        `임베딩 ${e.ok ? `연결됨 (차원 ${e.dim})` : '실패'} · ` +
          `리랭커 ${r.ok ? `연결됨 (${r.results}건)` : '실패'}`,
      )
    } catch (err) {
      setProbe(err instanceof Error ? err.message : '확인하지 못했습니다')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="empty">불러오는 중…</div>

  return (
    <div className="set-page">
      <div className="set-head">
        <div>
          <h3>LLM 연결</h3>
          <p className="muted small">
            자연어로 시험을 만들려면 임베딩 서버가 필요합니다. 기존 TC·매뉴얼에서
            근거를 찾아야 정확한 CLI 를 만들 수 있고, 없으면 모델이 명령을 지어냅니다.
          </p>
        </div>
        <button className="btn primary" type="button" onClick={() => void save()} disabled={busy}>
          {busy ? '저장 중…' : '저장'}
        </button>
      </div>

      {note.msg && <div className={`set-note ${note.kind}`}>{note.msg}</div>}

      {/* ── 임베딩 ── */}
      <section className="set-card">
        <div className="set-card-head">
          <b>임베딩 (Embedding)</b>
          <label className="chk">
            <input
              type="checkbox"
              checked={cfg.use_embed}
              onChange={(e) => set('use_embed', e.target.checked)}
            />
            사용
          </label>
        </div>
        <label className="fld">
          <span>서버 주소</span>
          <input
            value={cfg.embed_url}
            placeholder="http://10.1.1.50:8080"
            onChange={(e) => set('embed_url', e.target.value)}
          />
        </label>
        <label className="fld">
          <span>모델</span>
          <input
            value={cfg.embed_model}
            placeholder="bge-m3"
            onChange={(e) => set('embed_model', e.target.value)}
          />
        </label>
        <div className="hint">
          OpenAI 호환 서버를 가정합니다 — 주소 뒤에 <code>/v1/embeddings</code> 를 붙여
          부릅니다. 사내에 없으면 도커로 함께 띄울 수 있습니다.
        </div>
      </section>

      {/* ── 리랭커 ── */}
      <section className="set-card">
        <div className="set-card-head">
          <b>리랭커 (Reranker)</b>
          <label className="chk">
            <input
              type="checkbox"
              checked={cfg.use_rerank}
              onChange={(e) => set('use_rerank', e.target.checked)}
            />
            사용
          </label>
        </div>
        <label className="fld">
          <span>서버 주소</span>
          <input
            value={cfg.rerank_url}
            placeholder="http://10.1.1.50:8081"
            onChange={(e) => set('rerank_url', e.target.value)}
          />
        </label>
        <label className="fld">
          <span>모델</span>
          <input
            value={cfg.rerank_model}
            placeholder="bge-reranker-v2-m3"
            onChange={(e) => set('rerank_model', e.target.value)}
          />
        </label>
        <div className="hint">
          없어도 동작합니다. 검색 결과의 순서를 다시 매겨 정확도를 올리는 역할입니다.
        </div>
      </section>

      {/* ── 검색 ── */}
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

      <div className="set-probe">
        <button className="btn" type="button" onClick={() => void check()} disabled={busy}>
          연결 확인
        </button>
        <span className="muted small">{probe}</span>
      </div>
      <div className="hint">
        확인을 누르면 먼저 저장한 뒤 서버가 실제로 임베딩과 리랭킹을 한 번씩
        해 봅니다. 사내망 밖에서는 실패하는 게 정상입니다.
      </div>

      <div className="hint" style={{ marginTop: 4 }}>
        <b>Chat 모델별 설정</b>(모델 선택 · 프롬프트 · 온도)은 왼쪽 목록의 다음 항목에
        따로 만듭니다. 여기는 서버 연결만 다룹니다.
      </div>
    </div>
  )
}
